import { MockActivityEnvironment } from "@temporalio/testing";
import { DefaultLogger } from "@temporalio/worker";
import { describe, expect, it, vi } from "vitest";

import {
  createReleaseNotificationActivities,
  type ReleaseNotificationRepository,
} from "./release-notification-activities.js";
import {
  createReleaseNotificationWorkflowInput,
  type PrepareReleaseNotificationsResult,
  type ReleaseNotificationDeliveryResult,
  type ReleaseNotificationOutputManifest,
  releaseNotificationOutputManifest,
} from "./release-notifications.js";

const workflow = createReleaseNotificationWorkflowInput({
  organizationId: "138f47ac-19fc-7c92-ae91-0242ac120001",
  workspaceId: "238f47ac-19fc-7c92-ae91-0242ac120001",
  seriesId: "338f47ac-19fc-7c92-ae91-0242ac120001",
  releaseId: "438f47ac-19fc-7c92-ae91-0242ac120001",
  monitoringTime: "2026-09-01T10:00:00Z",
  releaseManifestSha256: "a".repeat(64),
});

const candidate = {
  deliveryId: "538f47ac-19fc-7c92-ae91-0242ac120001",
  subscriptionId: "638f47ac-19fc-7c92-ae91-0242ac120001",
  subjectId: "738f47ac-19fc-7c92-ae91-0242ac120001",
  channel: "in_app" as const,
};

function repository(): ReleaseNotificationRepository {
  return {
    prepare: vi.fn(async () => ({
      disposition: "execute" as const,
      candidates: [candidate],
      existingOutput: null,
    })),
    deliver: vi.fn(async ({ candidate: delivery, occurredAt }) => ({
      ...delivery,
      status: "delivered" as const,
      reason: "delivered" as const,
      occurredAt,
    })),
    complete: vi.fn(async ({ output }) => output),
    fail: vi.fn(async () => undefined),
  };
}

function environment(workflowId = workflow.workflowId): MockActivityEnvironment {
  return new MockActivityEnvironment(
    {
      namespace: "release-notification-test",
      workflowType: "deliverReleaseNotifications",
      workflowExecution: {
        workflowId,
        runId: "838f47ac-19fc-7c92-ae91-0242ac120001",
      },
    },
    { logger: new DefaultLogger("ERROR", () => undefined) },
  );
}

describe("release notification activities", () => {
  it("validates Temporal identity and preserves delivery/output identity", async () => {
    const repo = repository();
    const activities = createReleaseNotificationActivities(repo);
    const runtime = environment();
    const prepared = (await runtime.run(
      activities.prepareReleaseNotifications,
      workflow,
    )) as PrepareReleaseNotificationsResult;
    expect(prepared.candidates).toEqual([candidate]);

    const delivered = (await runtime.run(activities.deliverReleaseNotification, {
      workflow,
      candidate,
      occurredAt: "2026-09-01T10:00:01Z",
    })) as ReleaseNotificationDeliveryResult;
    expect(delivered).toMatchObject({ status: "delivered", reason: "delivered" });

    const completionRequest: Parameters<typeof activities.completeReleaseNotifications>[0] = {
      workflow,
      deliveries: [delivered],
      completedAt: "2026-09-01T10:00:02Z",
    };
    const completed = (await runtime.run(
      activities.completeReleaseNotifications,
      completionRequest,
    )) as ReleaseNotificationOutputManifest;
    expect(completed).toEqual(
      releaseNotificationOutputManifest({
        workflow,
        deliveries: [delivered],
        completedAt: "2026-09-01T10:00:02Z",
      }),
    );
    expect(repo.complete).toHaveBeenCalledOnce();
  });

  it("rejects workflow spoofing, duplicate candidates, and stored-manifest drift", async () => {
    const repo = repository();
    const activities = createReleaseNotificationActivities(repo);
    await expect(
      environment("938f47ac-19fc-7c92-ae91-0242ac120001").run(
        activities.prepareReleaseNotifications,
        workflow,
      ),
    ).rejects.toThrow("invalid workflow identity");

    vi.mocked(repo.prepare).mockResolvedValueOnce({
      disposition: "execute",
      candidates: [candidate, candidate],
      existingOutput: null,
    });
    await expect(
      environment().run(activities.prepareReleaseNotifications, workflow),
    ).rejects.toThrow("candidates are duplicated");

    const prior = releaseNotificationOutputManifest({
      workflow,
      deliveries: [],
      completedAt: "2026-09-01T10:00:02Z",
    });
    vi.mocked(repo.prepare).mockResolvedValueOnce({
      disposition: "return_existing",
      candidates: [],
      existingOutput: { ...prior, deliveredCount: 1 },
    });
    await expect(
      environment().run(activities.prepareReleaseNotifications, workflow),
    ).rejects.toThrow("Prior notification output manifest is invalid");

    vi.mocked(repo.complete).mockImplementationOnce(async ({ output }) => ({
      ...output,
      deliveredCount: 0,
    }));
    const inconsistentRequest: Parameters<typeof activities.completeReleaseNotifications>[0] = {
      workflow,
      deliveries: [
        {
          ...candidate,
          status: "delivered",
          reason: "delivered",
          occurredAt: "2026-09-01T10:00:01Z",
        },
      ],
      completedAt: "2026-09-01T10:00:02Z",
    };
    await expect(
      environment().run(activities.completeReleaseNotifications, inconsistentRequest),
    ).rejects.toThrow("differs from the workflow manifest");
  });
});
