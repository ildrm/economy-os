import "reflect-metadata";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import {
  ReleaseNotificationsController,
  ReleaseSubscriptionController,
} from "./release-notifications.controller.js";
import { ReleaseNotificationService } from "./release-notifications.js";

describe("release notification OpenAPI contract", () => {
  it("publishes authenticated subscription state and pointer-only notification operations", async () => {
    const testingModule = await Test.createTestingModule({
      controllers: [ReleaseSubscriptionController, ReleaseNotificationsController],
      providers: [{ provide: ReleaseNotificationService, useValue: {} }],
    }).compile();
    const app = testingModule.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix("api/v1");
    try {
      await app.init();
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle("test").setVersion("1").addBearerAuth().build(),
      );
      const subscription = "/api/v1/evidence/series/{seriesId}/release-subscription";
      const notifications = "/api/v1/notifications/releases";
      expect(Object.keys(document.paths).sort()).toEqual([notifications, subscription].sort());
      expect(document.paths[subscription]?.get?.security).toEqual([{ bearer: [] }]);
      expect(document.paths[subscription]?.put?.security).toEqual([{ bearer: [] }]);
      expect(document.paths[subscription]?.post).toBeUndefined();
      expect(document.paths[subscription]?.delete).toBeUndefined();
      expect(document.paths[notifications]?.get?.security).toEqual([{ bearer: [] }]);
      expect(document.paths[notifications]?.get?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "workspaceId", required: true }),
          expect.objectContaining({ name: "limit", required: false }),
          expect.objectContaining({ name: "beforeOccurredAt", required: false }),
          expect.objectContaining({ name: "beforeDeliveryId", required: false }),
        ]),
      );
      expect(document.paths[notifications]?.get?.description).toContain(
        "normal authorization and legal checks",
      );
      expect(document.components?.schemas?.ReleaseNotificationPointerDto).toMatchObject({
        required: expect.arrayContaining([
          "deliveryId",
          "workflowId",
          "subscriptionId",
          "target",
          "occurredAt",
          "deliverySha256",
        ]),
      });
      expect(document.components?.schemas?.ReleaseNotificationTargetDto).toMatchObject({
        properties: {
          type: { enum: ["economic_release"] },
          seriesId: { format: "uuid", type: "string" },
          releaseId: { format: "uuid", type: "string" },
        },
      });
    } finally {
      await app.close();
    }
  });
});
