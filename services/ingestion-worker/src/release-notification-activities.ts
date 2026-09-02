import { assertUuid, canonicalJson } from "@economyos/data-admission";
import { Context } from "@temporalio/activity";
import { ApplicationFailure } from "@temporalio/common";

import {
  assertReleaseNotificationWorkflowInput,
  type PrepareReleaseNotificationsResult,
  type ReleaseNotificationActivities,
  type ReleaseNotificationCandidate,
  type ReleaseNotificationDeliveryResult,
  type ReleaseNotificationOutputManifest,
  type ReleaseNotificationWorkflowInput,
  releaseNotificationOutputManifest,
} from "./release-notifications.js";

export interface ReleaseNotificationRepository {
  prepare(input: ReleaseNotificationWorkflowInput): Promise<PrepareReleaseNotificationsResult>;
  deliver(input: {
    readonly workflow: ReleaseNotificationWorkflowInput;
    readonly candidate: ReleaseNotificationCandidate;
    readonly occurredAt: string;
  }): Promise<ReleaseNotificationDeliveryResult>;
  complete(input: {
    readonly workflow: ReleaseNotificationWorkflowInput;
    readonly output: ReleaseNotificationOutputManifest;
  }): Promise<ReleaseNotificationOutputManifest>;
  fail(input: {
    readonly workflow: ReleaseNotificationWorkflowInput;
    readonly errorCode: string;
    readonly message: string;
    readonly occurredAt: string;
  }): Promise<void>;
}

export class ReleaseNotificationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseNotificationConflictError";
  }
}

function permanentFailure(error: unknown): ApplicationFailure {
  if (error instanceof ApplicationFailure) return error;
  if (error instanceof ReleaseNotificationConflictError) {
    return ApplicationFailure.create({
      message: error.message,
      type: "ReleaseNotificationConflict",
      nonRetryable: true,
    });
  }
  if (error instanceof TypeError) {
    return ApplicationFailure.create({
      message: error.message,
      type: "ReleaseNotificationPermanentError",
      nonRetryable: true,
    });
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
      const retryable =
        code.startsWith("08") ||
        code.startsWith("40") ||
        code.startsWith("53") ||
        ["55P03", "57014", "57P01", "57P02", "57P03"].includes(code);
      return ApplicationFailure.create({
        message: "Release notification database operation failed",
        type: retryable ? "ReleaseNotificationTransientError" : "ReleaseNotificationPermanentError",
        nonRetryable: !retryable,
        details: [{ code }],
      });
    }
  }
  return ApplicationFailure.create({
    message: error instanceof Error ? error.message : "Unknown release notification failure",
    type: "ReleaseNotificationTransientError",
  });
}

async function execute<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw permanentFailure(error);
  }
}

function assertExecution(input: ReleaseNotificationWorkflowInput): void {
  const info = Context.current().info;
  if (
    info.workflowType !== "deliverReleaseNotifications" ||
    info.workflowExecution?.workflowId !== input.workflowId
  ) {
    throw new TypeError("Release notification activity has an invalid workflow identity");
  }
}

function validateCandidate(candidate: ReleaseNotificationCandidate): void {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("Release notification candidate must be an object");
  }
  if (
    Object.keys(candidate).length !== 4 ||
    !Object.hasOwn(candidate, "deliveryId") ||
    !Object.hasOwn(candidate, "subscriptionId") ||
    !Object.hasOwn(candidate, "subjectId") ||
    candidate.channel !== "in_app"
  ) {
    throw new TypeError("Release notification candidate schema is invalid");
  }
  assertUuid(candidate.deliveryId, "deliveryId");
  assertUuid(candidate.subscriptionId, "subscriptionId");
  assertUuid(candidate.subjectId, "subjectId");
}

function validatePreparation(
  workflow: ReleaseNotificationWorkflowInput,
  result: PrepareReleaseNotificationsResult,
): void {
  if (
    (result.disposition === "return_existing") !== (result.existingOutput !== null) ||
    (result.disposition === "return_existing" && result.candidates.length !== 0) ||
    result.candidates.length > 1_000
  ) {
    throw new ReleaseNotificationConflictError("Notification preparation state is inconsistent");
  }
  if (result.existingOutput) {
    const expected = releaseNotificationOutputManifest({
      workflow,
      deliveries: result.existingOutput.deliveries,
      completedAt: result.existingOutput.completedAt,
    });
    if (canonicalJson(expected) !== canonicalJson(result.existingOutput)) {
      throw new ReleaseNotificationConflictError("Prior notification output manifest is invalid");
    }
  }
  const ids = new Set<string>();
  for (const candidate of result.candidates) {
    validateCandidate(candidate);
    if (ids.has(candidate.deliveryId)) {
      throw new ReleaseNotificationConflictError("Notification candidates are duplicated");
    }
    ids.add(candidate.deliveryId);
  }
}

export function createReleaseNotificationActivities(
  repository: ReleaseNotificationRepository,
): ReleaseNotificationActivities {
  return {
    async prepareReleaseNotifications(candidate) {
      return execute(async () => {
        const input = assertReleaseNotificationWorkflowInput(candidate);
        assertExecution(input);
        const result = await repository.prepare(input);
        validatePreparation(input, result);
        return result;
      });
    },
    async deliverReleaseNotification(request) {
      return execute(async () => {
        const workflow = assertReleaseNotificationWorkflowInput(request.workflow);
        assertExecution(workflow);
        validateCandidate(request.candidate);
        const result = await repository.deliver({ ...request, workflow });
        const expectedIdentity = {
          deliveryId: request.candidate.deliveryId,
          subscriptionId: request.candidate.subscriptionId,
          subjectId: request.candidate.subjectId,
          channel: request.candidate.channel,
        };
        if (
          canonicalJson(expectedIdentity) !==
          canonicalJson({
            deliveryId: result.deliveryId,
            subscriptionId: result.subscriptionId,
            subjectId: result.subjectId,
            channel: result.channel,
          })
        ) {
          throw new ReleaseNotificationConflictError("Delivered notification identity changed");
        }
        releaseNotificationOutputManifest({
          workflow,
          deliveries: [result],
          completedAt: result.occurredAt,
        });
        return result;
      });
    },
    async completeReleaseNotifications(request) {
      return execute(async () => {
        const workflow = assertReleaseNotificationWorkflowInput(request.workflow);
        assertExecution(workflow);
        const expected = releaseNotificationOutputManifest({ ...request, workflow });
        const stored = await repository.complete({ workflow, output: expected });
        if (canonicalJson(stored) !== canonicalJson(expected)) {
          throw new ReleaseNotificationConflictError(
            "Stored notification output differs from the workflow manifest",
          );
        }
        return stored;
      });
    },
    async failReleaseNotifications(request) {
      return execute(async () => {
        const workflow = assertReleaseNotificationWorkflowInput(request.workflow);
        assertExecution(workflow);
        if (!/^[A-Z][A-Z0-9_]{1,127}$/.test(request.errorCode)) {
          throw new TypeError("Release notification error code is invalid");
        }
        if (
          request.message.length < 1 ||
          request.message.length > 1_000 ||
          request.message !== request.message.trim()
        ) {
          throw new TypeError("Release notification error message is invalid");
        }
        await repository.fail({ ...request, workflow });
      });
    },
  };
}
