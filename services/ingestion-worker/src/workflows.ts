import type {
  AdmissionDecision,
  IngestionActivities,
  IngestionOutputManifest,
  IngestionStage,
  IngestionWorkflowInput,
  IngestionWorkflowState,
  LandingResult,
  PromotionResult,
  QualityResult,
  ReconciliationResult,
} from "@economyos/data-admission/workflow-contracts";
import {
  ApplicationFailure,
  CancellationScope,
  defineQuery,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";

const networkActivities = proxyActivities<
  Pick<IngestionActivities, "beginRun" | "fetchAndPersistRaw">
>({
  startToCloseTimeout: "2 minutes",
  heartbeatTimeout: "1 minute",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumInterval: "30 seconds",
    maximumAttempts: 5,
    nonRetryableErrorTypes: ["IngestionPermanentError", "IngestionConflictError"],
  },
});

const durableActivities = proxyActivities<
  Omit<IngestionActivities, "beginRun" | "fetchAndPersistRaw">
>({
  startToCloseTimeout: "1 minute",
  retry: {
    initialInterval: "500 milliseconds",
    backoffCoefficient: 2,
    maximumInterval: "10 seconds",
    maximumAttempts: 5,
    nonRetryableErrorTypes: ["IngestionPermanentError", "IngestionConflictError"],
  },
});

export const ingestionStateQuery = defineQuery<IngestionWorkflowState>("ingestionState");

function temporalInstant(): string {
  // Temporal replaces the workflow clock, so this is recorded and replay deterministic.
  return new Date().toISOString();
}

function errorSummary(error: unknown): { readonly code: string; readonly message: string } {
  if (error instanceof ApplicationFailure) {
    const failureType = error.type;
    const code =
      typeof failureType === "string" && /^[A-Z][A-Z0-9_]{1,127}$/.test(failureType)
        ? failureType
        : "INGESTION_FAILED";
    return { code, message: error.message.slice(0, 1_000) };
  }
  if (error instanceof Error) {
    return { code: "INGESTION_FAILED", message: error.message.slice(0, 1_000) };
  }
  return { code: "INGESTION_FAILED", message: "Unknown ingestion failure" };
}

function publicPayloads(landing: LandingResult): IngestionOutputManifest["rawPayloads"] {
  return landing.payloads.map(({ objectKey: _objectKey, ...payload }) => payload);
}

export async function ingestDataset(
  input: IngestionWorkflowInput,
): Promise<IngestionOutputManifest> {
  const info = workflowInfo();
  let stage: IngestionStage = "start";
  let state: IngestionWorkflowState = {
    runId: input.runId,
    status: "pending",
    stage,
    attempt: info.attempt,
    message: "Waiting to start",
  };
  setHandler(ingestionStateQuery, () => state);
  let runBegan = false;

  try {
    const begin = await networkActivities.beginRun(input);
    runBegan = true;
    if (begin.disposition === "return_existing") {
      if (!begin.existingOutput) {
        throw ApplicationFailure.nonRetryable(
          "Terminal ingestion run is missing its output manifest",
          "IngestionConflictError",
        );
      }
      state = {
        ...state,
        status: begin.existingOutput.status,
        stage: "complete",
        message: "Returned the prior idempotent result",
      };
      return begin.existingOutput;
    }

    if (begin.status === "pending") {
      await durableActivities.recordStage({
        workflow: input,
        expectedStatus: "pending",
        nextStatus: "running",
        stage: "start",
        attempt: info.attempt,
        occurredAt: temporalInstant(),
        details: { inputSha256: input.inputSha256 },
      });
    } else if (begin.status !== "running") {
      throw ApplicationFailure.nonRetryable(
        `Ingestion run cannot resume from ${begin.status}`,
        "IngestionConflictError",
      );
    }
    state = { ...state, status: "running", message: "Run accepted" };

    stage = "fetch";
    state = { ...state, stage, message: "Fetching and durably landing source bytes" };
    const landing = await networkActivities.fetchAndPersistRaw(input);
    await durableActivities.recordStage({
      workflow: input,
      expectedStatus: "running",
      nextStatus: "running",
      stage: "persist_raw",
      attempt: info.attempt,
      occurredAt: temporalInstant(),
      details: {
        payloadCount: landing.payloads.length,
        candidateCount: landing.candidates.length,
        candidateSha256: landing.candidateSha256,
      },
    });

    stage = "parse";
    state = { ...state, stage, message: "Parsing normalized candidates from verified raw bytes" };
    const decision: AdmissionDecision = await durableActivities.parseAndEvaluate({
      workflow: input,
      landing,
    });
    await durableActivities.recordStage({
      workflow: input,
      expectedStatus: "running",
      nextStatus: "running",
      stage: "parse",
      attempt: info.attempt,
      occurredAt: temporalInstant(),
      details: { candidateSha256: decision.candidateSha256 },
    });
    stage = "quality";
    state = { ...state, stage, message: "Evaluating admission gates" };
    await durableActivities.recordStage({
      workflow: input,
      expectedStatus: "running",
      nextStatus: "running",
      stage: "quality",
      attempt: info.attempt,
      occurredAt: temporalInstant(),
      details: {
        disposition: decision.disposition,
        score: decision.score,
        reasons: decision.reasons,
      },
    });

    if (decision.disposition === "quarantine") {
      stage = "quarantine";
      state = { ...state, stage, message: "Persisting quarantine evidence" };
      await durableActivities.quarantine({ workflow: input, landing, decision });
      const output: IngestionOutputManifest = {
        schemaVersion: 1,
        runId: input.runId,
        status: "quarantined",
        inputSha256: input.inputSha256,
        rawPayloads: publicPayloads(landing),
        candidateSha256: landing.candidateSha256,
        transformationRunId: decision.transformationRunId,
        releaseId: null,
        observationIds: [],
        observationSetSha256: null,
        qualityScore: decision.score,
        qualityResults: decision.results,
        reconciliation: null,
        completedAt: temporalInstant(),
      };
      await durableActivities.recordStage({
        workflow: input,
        expectedStatus: "running",
        nextStatus: "quarantined",
        stage: "complete",
        attempt: info.attempt,
        occurredAt: output.completedAt,
        details: { reasons: decision.reasons },
        outputManifest: output,
        errorCode: "QUALITY_GATE_FAILED",
      });
      state = {
        ...state,
        status: "quarantined",
        stage: "complete",
        message: "Candidates quarantined",
      };
      return output;
    }

    stage = "promote";
    state = { ...state, stage, message: "Promoting canonical observations" };
    const promotion: PromotionResult = await durableActivities.promote({
      workflow: input,
      landing,
      decision,
    });

    stage = "lineage";
    state = { ...state, stage, message: "Writing append-only lineage" };
    await durableActivities.writeLineage({ workflow: input, landing, promotion });

    stage = "reconcile";
    state = { ...state, stage, message: "Reconciling canonical output and committing checkpoint" };
    const reconciliation: ReconciliationResult = await durableActivities.reconcileAndCheckpoint({
      workflow: input,
      landing,
      promotion,
    });
    if (
      reconciliation.missingPeriods.length > 0 ||
      reconciliation.unexpectedPeriods.length > 0 ||
      reconciliation.mismatchedPeriods.length > 0 ||
      reconciliation.expectedRows !== reconciliation.persistedRows
    ) {
      throw ApplicationFailure.nonRetryable(
        "Canonical reconciliation did not match the admitted candidate set",
        "IngestionConflictError",
      );
    }

    const output: IngestionOutputManifest = {
      schemaVersion: 1,
      runId: input.runId,
      status: "succeeded",
      inputSha256: input.inputSha256,
      rawPayloads: publicPayloads(landing),
      candidateSha256: landing.candidateSha256,
      transformationRunId: promotion.transformationRunId,
      releaseId: promotion.releaseId,
      observationIds: promotion.observationIds,
      observationSetSha256: promotion.observationSetSha256,
      qualityScore: decision.score,
      qualityResults: decision.results,
      reconciliation,
      completedAt: temporalInstant(),
    };
    await durableActivities.recordStage({
      workflow: input,
      expectedStatus: "running",
      nextStatus: "succeeded",
      stage: "complete",
      attempt: info.attempt,
      occurredAt: output.completedAt,
      details: {
        observationCount: output.observationIds.length,
        observationSetSha256: output.observationSetSha256,
      },
      outputManifest: output,
    });
    state = { ...state, status: "succeeded", stage: "complete", message: "Ingestion complete" };
    return output;
  } catch (error) {
    const failure = errorSummary(error);
    state = { ...state, status: "failed", stage, message: failure.message };
    if (runBegan) {
      await CancellationScope.nonCancellable(async () => {
        try {
          await durableActivities.failRun({
            workflow: input,
            stage,
            attempt: info.attempt,
            errorCode: failure.code,
            message: failure.message,
            occurredAt: temporalInstant(),
          });
        } catch {
          // Preserve the causative workflow failure. Temporal retains the failed
          // failure-recording activity in history for operators to investigate.
        }
      });
    }
    throw error;
  }
}

export {
  deliverReleaseNotifications,
  releaseNotificationStateQuery,
} from "./release-notification-workflow.js";
export type { IngestionWorkflowInput, IngestionWorkflowState, QualityResult, ReconciliationResult };
