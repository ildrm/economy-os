import "reflect-metadata";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { ReleaseMonitoringController } from "./release-monitoring.controller.js";
import { ReleaseMonitoringService } from "./release-monitoring.js";

describe("ReleaseMonitoringController OpenAPI contract", () => {
  it("publishes two read-only bearer-protected and series-scoped operations", async () => {
    const testingModule = await Test.createTestingModule({
      controllers: [ReleaseMonitoringController],
      providers: [{ provide: ReleaseMonitoringService, useValue: {} }],
    }).compile();
    const app = testingModule.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix("api/v1");
    try {
      await app.init();
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle("test").setVersion("1").addBearerAuth().build(),
      );
      const releasesPath = "/api/v1/evidence/series/{seriesId}/releases";
      const schedulePath = "/api/v1/evidence/series/{seriesId}/release-schedule";
      const paths = [releasesPath, schedulePath];
      expect(Object.keys(document.paths).sort()).toEqual([...paths].sort());
      for (const path of paths) {
        expect(document.paths[path]?.get?.security).toEqual([{ bearer: [] }]);
        expect(document.paths[path]?.post).toBeUndefined();
        expect(document.paths[path]?.put).toBeUndefined();
        expect(document.paths[path]?.patch).toBeUndefined();
        expect(document.paths[path]?.delete).toBeUndefined();
      }
      expect(document.paths[releasesPath]?.get?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "releasedAfter", required: true }),
          expect.objectContaining({ name: "releasedBefore", required: true }),
          expect.objectContaining({ name: "limit", required: false }),
        ]),
      );
      expect(document.paths[schedulePath]?.get?.parameters).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "asOf", required: true })]),
      );
      expect(document.paths[releasesPath]?.get?.description).toContain(
        "never invents a provider release time",
      );
      expect(document.paths[schedulePath]?.get?.description).toContain("never a forecast");
      expect(document.components?.schemas?.GovernedReleaseDto).toMatchObject({
        required: expect.arrayContaining([
          "monitoringTime",
          "monitoringTimeBasis",
          "sourcePublicationTime",
          "parser",
          "provenance",
        ]),
      });
      expect(document.components?.schemas?.ReleaseProvenanceDto).toMatchObject({
        required: expect.arrayContaining([
          "canonicalAdmissionId",
          "canonicalAdmissionEvidenceId",
          "admissionLicenseReviewId",
          "currentLicenseReviewId",
          "currentSourceDecisionId",
          "observationProvenance",
        ]),
      });
      expect(document.components?.schemas?.GovernedReleaseScheduleDto).toMatchObject({
        required: expect.arrayContaining([
          "status",
          "nextReleaseAt",
          "declarationSha256",
          "provenance",
        ]),
        properties: {
          status: {
            enum: ["not_declared", "scheduled", "no_upcoming_release", "unstructured"],
          },
          nextReleaseAt: { format: "date-time", nullable: true },
          scheduleSchemaVersion: { enum: [1], nullable: true },
        },
      });
    } finally {
      await app.close();
    }
  });
});
