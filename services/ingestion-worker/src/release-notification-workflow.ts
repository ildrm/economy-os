import { ApplicationFailure } from "@temporalio/common";
import { CancellationScope, defineQuery, proxyActivities, setHandler } from "@temporalio/workflow";

import type {
  ReleaseNotificationActivities,
  ReleaseNotificationOutputManifest,
  ReleaseNotificationWorkflowInput,
  ReleaseNotificationWorkflowState,
} from "./release-notifications.js";

const notificationActivities = proxyActivities<ReleaseNotificationActivities>({
  startToCloseTimeout: "1 minute",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumInterval: "30 seconds",
    maximumAttempts: 8,
    nonRetryableErrorTypes: ["ReleaseNotificationPermanentError", "ReleaseNotificationConflict"],
  },
});

export const releaseNotificationStateQuery = defineQuery<ReleaseNotificationWorkflowState>(
  "releaseNotificationState",
);

function temporalInstant(): string {
  return new Date().toISOString();
}

function failure(error: unknown): { readonly code: string; readonly message: string } {
  if (error instanceof ApplicationFailure) {
    const code =
      typeof error.type === "string" && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.type)
        ? error.type
        : "RELEASE_NOTIFICATION_FAILED";
    return { code, message: error.message.slice(0, 1_000) };
  }
  if (error instanceof Error) {
    return { code: "RELEASE_NOTIFICATION_FAILED", message: error.message.slice(0, 1_000) };
  }
  return { code: "RELEASE_NOTIFICATION_FAILED", message: "Unknown notification failure" };
}

export async function deliverReleaseNotifications(
  candidate: ReleaseNotificationWorkflowInput,
): Promise<ReleaseNotificationOutputManifest> {
  if (!candidate || typeof candidate !== "object" || candidate.schemaVersion !== 1) {
    throw ApplicationFailure.nonRetryable(
      "Release notification workflow input schema is invalid",
      "ReleaseNotificationPermanentError",
    );
  }
  // Cryptographic identity validation occurs again in every activity. Keeping
  // Node crypto outside workflow code preserves Temporal replay determinism.
  const input = candidate;
  let state: ReleaseNotificationWorkflowState = {
    status: "pending",
    candidateCount: 0,
    completedCount: 0,
    message: "Waiting to resolve eligible subscriptions",
  };
  setHandler(releaseNotificationStateQuery, () => state);
  let prepared = false;
  try {
    const preparation = await notificationActivities.prepareReleaseNotifications(input);
    prepared = true;
    if (preparation.disposition === "return_existing") {
      if (!preparation.existingOutput) {
        throw ApplicationFailure.nonRetryable(
          "Terminal notification run is missing its output manifest",
          "ReleaseNotificationConflict",
        );
      }
      state = {
        status: "succeeded",
        candidateCount: preparation.existingOutput.candidateCount,
        completedCount: preparation.existingOutput.candidateCount,
        message: "Returned prior idempotent notification result",
      };
      return preparation.existingOutput;
    }
    state = {
      status: "running",
      candidateCount: preparation.candidates.length,
      completedCount: 0,
      message: "Delivering governed in-app notifications",
    };
    const deliveries = [];
    for (const delivery of preparation.candidates) {
      deliveries.push(
        await notificationActivities.deliverReleaseNotification({
          workflow: input,
          candidate: delivery,
          occurredAt: temporalInstant(),
        }),
      );
      state = { ...state, completedCount: deliveries.length };
    }
    const output = await notificationActivities.completeReleaseNotifications({
      workflow: input,
      deliveries,
      completedAt: temporalInstant(),
    });
    state = {
      ...state,
      status: "succeeded",
      completedCount: output.candidateCount,
      message: "Release notifications completed",
    };
    return output;
  } catch (error) {
    const summary = failure(error);
    state = { ...state, status: "failed", message: summary.message };
    if (prepared) {
      await CancellationScope.nonCancellable(async () => {
        try {
          await notificationActivities.failReleaseNotifications({
            workflow: input,
            errorCode: summary.code,
            message: summary.message,
            occurredAt: temporalInstant(),
          });
        } catch {
          // Temporal retains the failed compensation activity in workflow history.
        }
      });
    }
    throw error;
  }
}
