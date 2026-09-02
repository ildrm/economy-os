import { WorldBankConnector, WorldBankConnectorError } from "@economyos/canonical-data";
import {
  assertSha256,
  assertWorkflowInput,
  deterministicUuid,
  digestJson,
  evaluateAdmission,
  sha256Hex,
} from "@economyos/data-admission";
import type {
  CandidateObservation,
  IngestionActivities,
  IngestionWorkflowInput,
  LandedRawPayload,
  LandingResult,
} from "@economyos/data-admission/workflow-contracts";
import type { S3ObjectStorage } from "@economyos/object-storage";
import { Context } from "@temporalio/activity";
import { ApplicationFailure } from "@temporalio/common";
import type {
  IngestionAuthorizationGuard,
  TemporalWorkflowExecutionIdentity,
} from "./authorization.js";
import { IngestionConflictError, type IngestionRepository } from "./repository.js";

export interface IngestionActivityDependencies {
  readonly connector: WorldBankConnector;
  readonly objectStorage: S3ObjectStorage;
  readonly repository: IngestionRepository;
  readonly authorization: IngestionAuthorizationGuard;
  readonly clock?: () => Date;
}

function temporalExecutionIdentity(): TemporalWorkflowExecutionIdentity {
  const info = Context.current().info;
  if (!info.workflowExecution || !info.workflowType) {
    throw new TypeError("ingestion activities must be scheduled by a Temporal workflow");
  }
  return {
    namespace: info.namespace,
    workflowType: info.workflowType,
    workflowId: info.workflowExecution.workflowId,
    runId: info.workflowExecution.runId,
  };
}

function activityAttempt(): number {
  return Context.current().info.attempt;
}

function heartbeat(details: Readonly<Record<string, unknown>>): void {
  Context.current().heartbeat(details);
}

function permanentObjectFailure(error: Error): boolean {
  return /(?:checksum|identity|invalid|mismatch|exceeds|limit|media type)/i.test(error.message);
}

function externalFailure(error: object): ApplicationFailure | null {
  const candidate = error as {
    code?: unknown;
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) {
    const retryable =
      candidate.code.startsWith("08") ||
      candidate.code.startsWith("40") ||
      candidate.code.startsWith("53") ||
      ["55P03", "57014", "57P01", "57P02", "57P03"].includes(candidate.code);
    return ApplicationFailure.create({
      message: "Ingestion database operation failed",
      type: retryable ? "IngestionDatabaseTransientError" : "IngestionDatabasePermanentError",
      nonRetryable: !retryable,
      details: [{ code: candidate.code }],
    });
  }
  const status = candidate.$metadata?.httpStatusCode;
  if (typeof status === "number") {
    const retryable = status === 408 || status === 429 || status >= 500;
    return ApplicationFailure.create({
      message: "Ingestion object storage operation failed",
      type: retryable ? "IngestionStorageTransientError" : "IngestionStoragePermanentError",
      nonRetryable: !retryable,
      details: [{ status }],
    });
  }
  return null;
}

function asApplicationFailure(error: unknown): ApplicationFailure {
  if (error instanceof ApplicationFailure) return error;
  if (error instanceof IngestionConflictError) {
    return ApplicationFailure.create({
      message: error.message,
      type: "IngestionConflictError",
      nonRetryable: true,
    });
  }
  if (error instanceof WorldBankConnectorError) {
    return ApplicationFailure.create({
      message: error.message,
      type: error.code,
      nonRetryable: !error.retryable,
      details: [{ status: error.status ?? null }],
    });
  }
  if (error instanceof TypeError) {
    return ApplicationFailure.create({
      message: error.message,
      type: "IngestionPermanentError",
      nonRetryable: true,
    });
  }
  if (typeof error === "object" && error !== null) {
    const classified = externalFailure(error);
    if (classified) return classified;
  }
  if (error instanceof Error) {
    return ApplicationFailure.create({
      message: error.message,
      type: permanentObjectFailure(error) ? "IngestionPermanentError" : "IngestionTransientError",
      nonRetryable: permanentObjectFailure(error),
    });
  }
  return ApplicationFailure.create({
    message: "Unknown ingestion activity failure",
    type: "IngestionTransientError",
  });
}

async function execute<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw asApplicationFailure(error);
  }
}

function validateLandedPayload(
  workflow: IngestionWorkflowInput,
  checksumSha256: string,
  byteLength: number,
  requestUri: string,
): string {
  assertSha256(checksumSha256, "checksumSha256");
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new TypeError("Raw payload byte length is invalid");
  }
  const request = new URL(requestUri);
  const expectedPath = `/v2/country/${workflow.connector.countryCode}/indicator/${workflow.connector.indicatorCode}`;
  const expectedParameters = {
    date: `${workflow.connector.startYear}:${workflow.connector.endYear}`,
    format: "json",
    page: "1",
    per_page: "1000",
    source: "2",
  } as const;
  if (
    request.protocol !== "https:" ||
    request.hostname !== "api.worldbank.org" ||
    request.port !== "" ||
    request.username !== "" ||
    request.password !== "" ||
    request.hash !== "" ||
    request.pathname !== expectedPath ||
    request.searchParams.size !== Object.keys(expectedParameters).length ||
    Object.entries(expectedParameters).some(
      ([name, value]) => request.searchParams.get(name) !== value,
    )
  ) {
    throw new TypeError("Raw payload request URI is outside the admitted World Bank origin");
  }
  return deterministicUuid(
    "economyos:raw-payload:v1",
    workflow.organizationId ?? "global",
    workflow.datasetId,
    checksumSha256,
  );
}

async function replayWorldBankPayload(
  workflow: IngestionWorkflowInput,
  payload: LandedRawPayload,
  bytes: Uint8Array,
): Promise<readonly CandidateObservation[]> {
  if (
    validateLandedPayload(
      workflow,
      payload.checksumSha256,
      payload.byteLength,
      payload.requestUri,
    ) !== payload.payloadId
  ) {
    throw new TypeError("Stored raw payload identity does not match its admitted request");
  }
  const replayConnector = new WorldBankConnector(
    async (requested) => {
      const requestUri = requested instanceof Request ? requested.url : requested.toString();
      if (requestUri !== payload.requestUri) {
        throw new TypeError("Stored raw payload request identity does not match parser input");
      }
      return new Response(Uint8Array.from(bytes).buffer, {
        status: 200,
        headers: { "content-type": payload.mediaType },
      });
    },
    () => new Date(payload.fetchedAt),
    async () => undefined,
  );
  const reparsed = await replayConnector.fetch({
    countryCode: workflow.connector.countryCode,
    indicatorCode: workflow.connector.indicatorCode,
    startYear: workflow.connector.startYear,
    endYear: workflow.connector.endYear,
  });
  if (
    reparsed.payloads.length !== 1 ||
    reparsed.payloads[0]?.checksumSha256 !== payload.checksumSha256
  ) {
    throw new TypeError("Replaying the immutable raw payload changed its identity");
  }
  return reparsed.rows;
}

export function createIngestionActivities(
  dependencies: IngestionActivityDependencies,
): IngestionActivities {
  const clock = dependencies.clock ?? (() => new Date());
  return {
    async beginRun(input) {
      return execute(() =>
        dependencies.authorization.runAuthorized(input, temporalExecutionIdentity(), async () => {
          assertWorkflowInput(input);
          return dependencies.repository.beginRun(input);
        }),
      );
    },

    async recordStage(input) {
      return execute(() =>
        dependencies.authorization.runAuthorized(input.workflow, temporalExecutionIdentity(), () =>
          dependencies.repository.recordStage(input),
        ),
      );
    },

    async fetchAndPersistRaw(input) {
      return execute(() =>
        dependencies.authorization.runAuthorized(input, temporalExecutionIdentity(), async () => {
          assertWorkflowInput(input);
          const priorLanding = await dependencies.repository.findLanding(input);
          if (priorLanding) {
            const verified = await dependencies.objectStorage.getVerified({
              uri: priorLanding.objectUri,
              key: priorLanding.objectKey,
              checksumSha256: priorLanding.checksumSha256,
              byteLength: priorLanding.byteLength,
            });
            const candidates = await replayWorldBankPayload(input, priorLanding, verified);
            heartbeat({ payloadId: priorLanding.payloadId, stage: "idempotent_replay" });
            return Object.freeze({
              payloads: Object.freeze([priorLanding]),
              candidates,
              candidateSha256: digestJson(candidates),
            });
          }
          const fetched = await dependencies.connector.fetch({
            countryCode: input.connector.countryCode,
            indicatorCode: input.connector.indicatorCode,
            startYear: input.connector.startYear,
            endYear: input.connector.endYear,
          });
          heartbeat({ stage: "fetch", payloadCount: fetched.payloads.length });
          if (fetched.payloads.length !== 1) {
            throw new TypeError("The bounded WDI request must produce exactly one raw payload");
          }
          const persistedPayloads: LandedRawPayload[] = [];
          for (const payload of fetched.payloads) {
            const calculatedChecksum = sha256Hex(payload.body);
            if (calculatedChecksum !== payload.checksumSha256) {
              throw new TypeError("Connector raw payload checksum is inconsistent");
            }
            const payloadId = validateLandedPayload(
              input,
              payload.checksumSha256,
              payload.byteLength,
              payload.requestUrl,
            );
            const stored = await dependencies.objectStorage.putRawPayload({
              scope: input.organizationId ?? "global",
              datasetId: input.datasetId,
              payloadId,
              body: payload.body,
              mediaType: payload.mediaType,
            });
            heartbeat({ payloadId, stage: "persist_raw" });
            const verified = await dependencies.objectStorage.getVerified(
              stored,
              payload.byteLength + 1,
            );
            if (sha256Hex(verified) !== payload.checksumSha256) {
              throw new TypeError("Persisted raw payload differs from the fetched bytes");
            }
            const landed: LandedRawPayload = {
              payloadId,
              requestUri: payload.requestUrl,
              objectUri: stored.uri,
              objectKey: stored.key,
              mediaType: payload.mediaType,
              checksumSha256: payload.checksumSha256,
              byteLength: payload.byteLength,
              fetchedAt: payload.fetchedAt,
              providerRequestId: null,
            };
            persistedPayloads.push(
              await dependencies.repository.persistLanding({
                workflow: input,
                payload: landed,
                attempt: activityAttempt(),
              }),
            );
            heartbeat({ payloadId, checksumSha256: payload.checksumSha256 });
          }
          const retrievedAt = persistedPayloads[0]?.fetchedAt;
          if (!retrievedAt)
            throw new TypeError("Persisted raw payload is missing its retrieval time");
          const candidates = fetched.rows.map((row) => ({ ...row, retrievedAt }));
          const landing: LandingResult = {
            payloads: Object.freeze(persistedPayloads),
            candidates: Object.freeze(candidates),
            candidateSha256: digestJson(candidates),
          };
          return Object.freeze(landing);
        }),
      );
    },

    async parseAndEvaluate(input) {
      return execute(() =>
        dependencies.authorization.runAuthorized(
          input.workflow,
          temporalExecutionIdentity(),
          async () => {
            assertWorkflowInput(input.workflow);
            const payload = input.landing.payloads[0];
            if (!payload) throw new TypeError("Admission input has no landed raw payload");
            const verified = await dependencies.objectStorage.getVerified({
              uri: payload.objectUri,
              key: payload.objectKey,
              checksumSha256: payload.checksumSha256,
              byteLength: payload.byteLength,
            });
            if (sha256Hex(verified) !== payload.checksumSha256) {
              throw new TypeError("Admission input no longer matches its immutable raw bytes");
            }
            const reparsed = await replayWorldBankPayload(input.workflow, payload, verified);
            if (digestJson(reparsed) !== input.landing.candidateSha256) {
              throw new TypeError("Replaying the immutable raw payload changed parser output");
            }
            heartbeat({ payloadId: payload.payloadId, stage: "parse" });
            return evaluateAdmission(input.workflow, {
              ...input.landing,
              candidates: reparsed,
            });
          },
        ),
      );
    },

    async quarantine(input) {
      return execute(() =>
        dependencies.authorization.runAuthorized(input.workflow, temporalExecutionIdentity(), () =>
          dependencies.repository.persistQuarantine({
            ...input,
            attempt: activityAttempt(),
            completedAt: clock().toISOString(),
          }),
        ),
      );
    },

    async promote(input) {
      return execute(() =>
        dependencies.authorization.runAuthorized(input.workflow, temporalExecutionIdentity(), () =>
          dependencies.repository.promote({
            ...input,
            attempt: activityAttempt(),
            completedAt: clock().toISOString(),
          }),
        ),
      );
    },

    async writeLineage(input) {
      return execute(() =>
        dependencies.authorization.runAuthorized(input.workflow, temporalExecutionIdentity(), () =>
          dependencies.repository.writeLineage({
            ...input,
            committedAt: clock().toISOString(),
          }),
        ),
      );
    },

    async reconcileAndCheckpoint(input) {
      return execute(() =>
        dependencies.authorization.runAuthorized(input.workflow, temporalExecutionIdentity(), () =>
          dependencies.repository.reconcileAndCheckpoint({
            ...input,
            committedAt: clock().toISOString(),
          }),
        ),
      );
    },

    async failRun(input) {
      return execute(() =>
        dependencies.authorization.runAuthorized(input.workflow, temporalExecutionIdentity(), () =>
          dependencies.repository.failRun(input),
        ),
      );
    },
  };
}
