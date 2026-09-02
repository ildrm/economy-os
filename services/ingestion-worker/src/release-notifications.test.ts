import { describe, expect, it } from "vitest";

import {
  assertReleaseNotificationWorkflowInput,
  createReleaseNotificationWorkflowInput,
  type ReleaseNotificationDeliveryResult,
  releaseNotificationOutputManifest,
} from "./release-notifications.js";

const request = {
  organizationId: "138f47ac-19fc-7c92-ae91-0242ac120001",
  workspaceId: "238f47ac-19fc-7c92-ae91-0242ac120001",
  seriesId: "338f47ac-19fc-7c92-ae91-0242ac120001",
  releaseId: "438f47ac-19fc-7c92-ae91-0242ac120001",
  monitoringTime: "2026-09-01T10:00:00Z",
  releaseManifestSha256: "a".repeat(64),
} as const;

function delivery(
  suffix: string,
  status: ReleaseNotificationDeliveryResult["status"],
): ReleaseNotificationDeliveryResult {
  return {
    deliveryId: `538f47ac-19fc-7c92-ae91-0242ac1200${suffix}`,
    subscriptionId: `638f47ac-19fc-7c92-ae91-0242ac1200${suffix}`,
    subjectId: `738f47ac-19fc-7c92-ae91-0242ac1200${suffix}`,
    channel: "in_app",
    status,
    reason: status === "delivered" ? "delivered" : "release_not_servable",
    occurredAt: "2026-09-01T10:00:01Z",
  };
}

describe("durable release notification workflow contracts", () => {
  it("creates deterministic series/release idempotency and rejects tampering", () => {
    const input = createReleaseNotificationWorkflowInput(request);
    expect(input).toMatchObject({ schemaVersion: 1, ...request });
    expect(input.workflowId).toMatch(/^[0-9a-f-]{36}$/);
    expect(input.inputSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(createReleaseNotificationWorkflowInput(request)).toEqual(input);
    expect(
      createReleaseNotificationWorkflowInput({
        ...request,
        seriesId: "338f47ac-19fc-7c92-ae91-0242ac120002",
      }).workflowId,
    ).not.toBe(input.workflowId);
    expect(() =>
      assertReleaseNotificationWorkflowInput({ ...input, releaseId: request.seriesId }),
    ).toThrow("digest does not match");
    expect(() =>
      assertReleaseNotificationWorkflowInput({ ...input, workflowId: request.seriesId }),
    ).toThrow("workflow identity is invalid");
  });

  it("builds a canonical replay-safe manifest including suppressed deliveries", () => {
    const workflow = createReleaseNotificationWorkflowInput(request);
    const output = releaseNotificationOutputManifest({
      workflow,
      deliveries: [delivery("12", "suppressed"), delivery("11", "delivered")],
      completedAt: "2026-09-01T10:00:02Z",
    });
    expect(output).toMatchObject({
      status: "succeeded",
      candidateCount: 2,
      deliveredCount: 1,
      suppressedCount: 1,
      releaseId: request.releaseId,
    });
    expect(output.deliveries.map(({ deliveryId }) => deliveryId)).toEqual([
      delivery("11", "delivered").deliveryId,
      delivery("12", "suppressed").deliveryId,
    ]);
    expect(output.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails closed on duplicate delivery identity and inconsistent outcomes", () => {
    const workflow = createReleaseNotificationWorkflowInput(request);
    const duplicate = delivery("11", "delivered");
    expect(() =>
      releaseNotificationOutputManifest({
        workflow,
        deliveries: [duplicate, duplicate],
        completedAt: "2026-09-01T10:00:02Z",
      }),
    ).toThrow("unique in-app records");
    expect(() =>
      releaseNotificationOutputManifest({
        workflow,
        deliveries: [{ ...duplicate, status: "suppressed" }],
        completedAt: "2026-09-01T10:00:02Z",
      }),
    ).toThrow("status and reason are inconsistent");
    expect(() =>
      releaseNotificationOutputManifest({
        workflow,
        deliveries: [],
        completedAt: "2026-09-01T09:59:59Z",
      }),
    ).toThrow("cannot complete before");
  });
});
