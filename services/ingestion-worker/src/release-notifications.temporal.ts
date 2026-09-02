import { fileURLToPath } from "node:url";

import { TestWorkflowEnvironment } from "@temporalio/testing";
import { DefaultLogger, Runtime, Worker } from "@temporalio/worker";
import { describe, expect, it, vi } from "vitest";

import { deliverReleaseNotifications } from "./release-notification-workflow.js";
import {
  createReleaseNotificationWorkflowInput,
  type ReleaseNotificationActivities,
  releaseNotificationOutputManifest,
} from "./release-notifications.js";

const TASK_QUEUE = "economyos-release-notifications-temporal-verification";
const NAMESPACE = "economyos-release-notifications-verification";

describe("release notification workflow against a real Temporal dev server", () => {
  it("replays an idempotent, durable in-app delivery batch", async () => {
    Runtime.install({ logger: new DefaultLogger("ERROR", () => undefined) });
    const environment = await TestWorkflowEnvironment.createLocal({
      server: {
        executable: { type: "cached-download", version: "v1.8.1" },
        log: { format: "pretty", level: "error" },
        namespace: NAMESPACE,
        ui: false,
      },
    });
    try {
      const input = createReleaseNotificationWorkflowInput({
        organizationId: "138f47ac-19fc-7c92-ae91-0242ac120001",
        workspaceId: "238f47ac-19fc-7c92-ae91-0242ac120001",
        seriesId: "338f47ac-19fc-7c92-ae91-0242ac120001",
        releaseId: "438f47ac-19fc-7c92-ae91-0242ac120001",
        monitoringTime: "2026-09-01T00:00:00Z",
        releaseManifestSha256: "a".repeat(64),
      });
      const candidate = {
        deliveryId: "538f47ac-19fc-7c92-ae91-0242ac120001",
        subscriptionId: "638f47ac-19fc-7c92-ae91-0242ac120001",
        subjectId: "738f47ac-19fc-7c92-ae91-0242ac120001",
        channel: "in_app" as const,
      };
      const prepareReleaseNotifications = vi.fn<
        ReleaseNotificationActivities["prepareReleaseNotifications"]
      >(async () => ({ disposition: "execute", candidates: [candidate], existingOutput: null }));
      const deliverReleaseNotification = vi.fn<
        ReleaseNotificationActivities["deliverReleaseNotification"]
      >(async ({ candidate: resolved, occurredAt }) => ({
        ...resolved,
        status: "delivered",
        reason: "delivered",
        occurredAt,
      }));
      const completeReleaseNotifications = vi.fn<
        ReleaseNotificationActivities["completeReleaseNotifications"]
      >(async (request) => releaseNotificationOutputManifest(request));
      const failReleaseNotifications = vi.fn<
        ReleaseNotificationActivities["failReleaseNotifications"]
      >(async () => undefined);
      const worker = await Worker.create({
        connection: environment.nativeConnection,
        namespace: NAMESPACE,
        taskQueue: TASK_QUEUE,
        workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
        activities: {
          prepareReleaseNotifications,
          deliverReleaseNotification,
          completeReleaseNotifications,
          failReleaseNotifications,
        },
      });

      const first = await worker.runUntil(() =>
        environment.client.workflow.execute(deliverReleaseNotifications, {
          args: [input],
          taskQueue: TASK_QUEUE,
          workflowId: input.workflowId,
        }),
      );
      expect(first).toMatchObject({
        status: "succeeded",
        candidateCount: 1,
        deliveredCount: 1,
        suppressedCount: 0,
        releaseId: input.releaseId,
      });
      expect(prepareReleaseNotifications).toHaveBeenCalledOnce();
      expect(deliverReleaseNotification).toHaveBeenCalledOnce();
      expect(completeReleaseNotifications).toHaveBeenCalledOnce();
      expect(failReleaseNotifications).not.toHaveBeenCalled();
    } finally {
      await environment.teardown();
    }
  });
});
