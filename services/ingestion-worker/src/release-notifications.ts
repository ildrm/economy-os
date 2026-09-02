import {
  assertIsoInstant,
  assertSha256,
  assertUuid,
  deterministicUuid,
  digestJson,
} from "@economyos/data-admission";

export interface CreateReleaseNotificationWorkflowInput {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly seriesId: string;
  readonly releaseId: string;
  readonly monitoringTime: string;
  readonly releaseManifestSha256: string;
}

export interface ReleaseNotificationWorkflowInput extends CreateReleaseNotificationWorkflowInput {
  readonly schemaVersion: 1;
  readonly workflowId: string;
  readonly inputSha256: string;
}

export interface ReleaseNotificationCandidate {
  readonly deliveryId: string;
  readonly subscriptionId: string;
  readonly subjectId: string;
  readonly channel: "in_app";
}

export interface ReleaseNotificationDeliveryResult extends ReleaseNotificationCandidate {
  readonly status: "delivered" | "suppressed";
  readonly reason: "delivered" | "subscription_inactive" | "release_not_servable";
  readonly occurredAt: string;
}

export interface ReleaseNotificationOutputManifest {
  readonly schemaVersion: 1;
  readonly workflowId: string;
  readonly inputSha256: string;
  readonly releaseId: string;
  readonly status: "succeeded";
  readonly candidateCount: number;
  readonly deliveredCount: number;
  readonly suppressedCount: number;
  readonly deliveries: readonly ReleaseNotificationDeliveryResult[];
  readonly completedAt: string;
  readonly manifestSha256: string;
}

export interface PrepareReleaseNotificationsResult {
  readonly disposition: "execute" | "return_existing";
  readonly candidates: readonly ReleaseNotificationCandidate[];
  readonly existingOutput: ReleaseNotificationOutputManifest | null;
}

export interface ReleaseNotificationActivities {
  prepareReleaseNotifications(
    input: ReleaseNotificationWorkflowInput,
  ): Promise<PrepareReleaseNotificationsResult>;
  deliverReleaseNotification(input: {
    readonly workflow: ReleaseNotificationWorkflowInput;
    readonly candidate: ReleaseNotificationCandidate;
    readonly occurredAt: string;
  }): Promise<ReleaseNotificationDeliveryResult>;
  completeReleaseNotifications(input: {
    readonly workflow: ReleaseNotificationWorkflowInput;
    readonly deliveries: readonly ReleaseNotificationDeliveryResult[];
    readonly completedAt: string;
  }): Promise<ReleaseNotificationOutputManifest>;
  failReleaseNotifications(input: {
    readonly workflow: ReleaseNotificationWorkflowInput;
    readonly errorCode: string;
    readonly message: string;
    readonly occurredAt: string;
  }): Promise<void>;
}

export interface ReleaseNotificationWorkflowState {
  readonly status: "pending" | "running" | "succeeded" | "failed";
  readonly candidateCount: number;
  readonly completedCount: number;
  readonly message: string;
}

function instantEpochNanoseconds(value: string): bigint {
  const match = /^(?<base>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(?<fraction>\d{1,9}))?Z$/.exec(
    value,
  );
  if (!match?.groups?.base) throw new TypeError("instant must already be validated");
  const milliseconds = Date.parse(`${match.groups.base}Z`);
  if (!Number.isFinite(milliseconds)) throw new TypeError("instant must already be validated");
  return (
    BigInt(milliseconds) * 1_000_000n + BigInt((match.groups.fraction ?? "").padEnd(9, "0") || "0")
  );
}

function workflowBody(input: CreateReleaseNotificationWorkflowInput): object {
  return {
    schemaVersion: 1,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    seriesId: input.seriesId,
    releaseId: input.releaseId,
    monitoringTime: input.monitoringTime,
    releaseManifestSha256: input.releaseManifestSha256,
  };
}

export function assertReleaseNotificationWorkflowInput(
  input: ReleaseNotificationWorkflowInput,
): ReleaseNotificationWorkflowInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Release notification workflow input must be an object");
  }
  const allowed = new Set([
    "schemaVersion",
    "organizationId",
    "workspaceId",
    "seriesId",
    "releaseId",
    "monitoringTime",
    "releaseManifestSha256",
    "workflowId",
    "inputSha256",
  ]);
  const unexpected = Object.keys(input).filter((key) => !allowed.has(key));
  if (unexpected.length > 0 || input.schemaVersion !== 1) {
    throw new TypeError("Release notification workflow input schema is invalid");
  }
  assertUuid(input.organizationId, "organizationId");
  assertUuid(input.workspaceId, "workspaceId");
  assertUuid(input.seriesId, "seriesId");
  assertUuid(input.releaseId, "releaseId");
  assertIsoInstant(input.monitoringTime, "monitoringTime");
  assertSha256(input.releaseManifestSha256, "releaseManifestSha256");
  assertUuid(input.workflowId, "workflowId");
  assertSha256(input.inputSha256, "inputSha256");
  const body = workflowBody(input);
  if (digestJson(body) !== input.inputSha256) {
    throw new TypeError("Release notification input digest does not match its content");
  }
  const expectedWorkflowId = deterministicUuid(
    "economyos:release-notification-workflow:v1",
    input.organizationId,
    input.workspaceId,
    input.seriesId,
    input.releaseId,
  );
  if (input.workflowId !== expectedWorkflowId) {
    throw new TypeError("Release notification workflow identity is invalid");
  }
  return Object.freeze({ ...input });
}

export function createReleaseNotificationWorkflowInput(
  input: CreateReleaseNotificationWorkflowInput,
): ReleaseNotificationWorkflowInput {
  const body = workflowBody(input);
  return assertReleaseNotificationWorkflowInput({
    ...input,
    schemaVersion: 1,
    workflowId: deterministicUuid(
      "economyos:release-notification-workflow:v1",
      input.organizationId,
      input.workspaceId,
      input.seriesId,
      input.releaseId,
    ),
    inputSha256: digestJson(body),
  });
}

export function releaseNotificationOutputManifest(input: {
  readonly workflow: ReleaseNotificationWorkflowInput;
  readonly deliveries: readonly ReleaseNotificationDeliveryResult[];
  readonly completedAt: string;
}): ReleaseNotificationOutputManifest {
  assertReleaseNotificationWorkflowInput(input.workflow);
  assertIsoInstant(input.completedAt, "completedAt");
  const monitoringTime = instantEpochNanoseconds(input.workflow.monitoringTime);
  const completedAt = instantEpochNanoseconds(input.completedAt);
  if (completedAt < monitoringTime) {
    throw new TypeError("Release notification cannot complete before its monitoring time");
  }
  const deliveryIds = new Set<string>();
  const subscriptionIds = new Set<string>();
  let deliveredCount = 0;
  for (const delivery of input.deliveries) {
    assertUuid(delivery.deliveryId, "deliveryId");
    assertUuid(delivery.subscriptionId, "subscriptionId");
    assertUuid(delivery.subjectId, "subjectId");
    assertIsoInstant(delivery.occurredAt, "delivery.occurredAt");
    const occurredAt = instantEpochNanoseconds(delivery.occurredAt);
    if (occurredAt < monitoringTime || occurredAt > completedAt) {
      throw new TypeError("Release notification delivery time is outside the workflow interval");
    }
    if (
      delivery.channel !== "in_app" ||
      deliveryIds.has(delivery.deliveryId) ||
      subscriptionIds.has(delivery.subscriptionId)
    ) {
      throw new TypeError("Release notification deliveries must be unique in-app records");
    }
    if (
      (delivery.status === "delivered" && delivery.reason !== "delivered") ||
      (delivery.status === "suppressed" &&
        delivery.reason !== "subscription_inactive" &&
        delivery.reason !== "release_not_servable")
    ) {
      throw new TypeError("Release notification delivery status and reason are inconsistent");
    }
    deliveryIds.add(delivery.deliveryId);
    subscriptionIds.add(delivery.subscriptionId);
    if (delivery.status === "delivered") deliveredCount += 1;
  }
  const body = {
    schemaVersion: 1 as const,
    workflowId: input.workflow.workflowId,
    inputSha256: input.workflow.inputSha256,
    releaseId: input.workflow.releaseId,
    status: "succeeded" as const,
    candidateCount: input.deliveries.length,
    deliveredCount,
    suppressedCount: input.deliveries.length - deliveredCount,
    deliveries: Object.freeze(
      [...input.deliveries]
        .sort((left, right) =>
          left.deliveryId < right.deliveryId ? -1 : left.deliveryId > right.deliveryId ? 1 : 0,
        )
        .map((delivery) => Object.freeze({ ...delivery })),
    ),
    completedAt: input.completedAt,
  };
  return Object.freeze({ ...body, manifestSha256: digestJson(body) });
}
