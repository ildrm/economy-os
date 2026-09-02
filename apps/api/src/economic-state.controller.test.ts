import "reflect-metadata";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EconomicStateController } from "./economic-state.controller.js";
import { EconomicStateService } from "./economic-state.js";

describe("EconomicStateController OpenAPI contract", () => {
  it("publishes all read-only routes as bearer-protected operations", async () => {
    const testingModule = await Test.createTestingModule({
      controllers: [EconomicStateController],
      providers: [{ provide: EconomicStateService, useValue: {} }],
    }).compile();
    const app = testingModule.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix("api/v1");
    try {
      await app.init();
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle("test").setVersion("1").addBearerAuth().build(),
      );
      const paths = [
        "/api/v1/economic-state/models",
        "/api/v1/economic-state/models/{modelId}",
        "/api/v1/economic-state/models/{modelId}/components",
        "/api/v1/economic-state/runs",
        "/api/v1/economic-state/runs/{runId}",
        "/api/v1/economic-state/runs/{runId}/components",
        "/api/v1/economic-state/vectors/{vectorId}",
      ];
      expect(Object.keys(document.paths).sort()).toEqual([...paths].sort());
      for (const path of paths) {
        expect(document.paths[path]?.get?.security).toEqual([{ bearer: [] }]);
        expect(document.paths[path]?.post).toBeUndefined();
        expect(document.paths[path]?.put).toBeUndefined();
        expect(document.paths[path]?.delete).toBeUndefined();
      }
      expect(document.components?.schemas?.StateEvidenceLinkDto).toBeDefined();
      expect(document.components?.schemas?.StateComponentParserDto).toBeDefined();
      expect(document.components?.schemas?.StateLicenseReviewEvidenceDto).toBeDefined();
      expect(document.components?.schemas?.StateSourceAdmissionDecisionEvidenceDto).toBeDefined();
      expect(document.components?.schemas?.StateLegalEvidenceManifestDto).toBeDefined();
      expect(document.components?.schemas?.StateRunComponentDto).toBeDefined();
      expect(document.components?.schemas?.StateVectorDto).toMatchObject({
        required: expect.arrayContaining([
          "schemaVersion",
          "methodologyScope",
          "diagnostics",
          "dimensions",
          "stateManifestSha256",
        ]),
        properties: {
          schemaVersion: { enum: [1] },
          methodologyScope: { enum: ["research_baseline"] },
          dimensions: { minItems: 5, maxItems: 5 },
        },
      });
      expect(document.components?.schemas?.StateVectorDto).not.toHaveProperty(
        "properties.overallScore",
      );
      expect(document.components?.schemas?.StateVectorDto).not.toHaveProperty("properties.rank");
      expect(document.components?.schemas?.StateVectorDto).not.toHaveProperty(
        "properties.stateManifest",
      );
      expect(document.components?.schemas?.StateVectorArtifactDto).toMatchObject({
        required: expect.arrayContaining([
          "id",
          "sha256",
          "algorithmKey",
          "algorithmVersion",
          "configurationSha256",
          "normalizationSha256",
          "assumptionsSha256",
          "approvalSha256",
          "lifecycleStatus",
        ]),
      });
      expect(document.components?.schemas?.StateModelDto).toMatchObject({
        required: expect.arrayContaining([
          "governanceSchemaVersion",
          "modelArtifactId",
          "modelArtifactSha256",
        ]),
        properties: {
          governanceSchemaVersion: { enum: [1, 2] },
          modelArtifactId: { format: "uuid", nullable: true },
          modelArtifactSha256: { pattern: "^[0-9a-f]{64}$", nullable: true },
        },
      });
      expect(document.components?.schemas?.StateModelComponentDto).toMatchObject({
        required: expect.arrayContaining([
          "seriesId",
          "unitCode",
          "frequency",
          "seasonalAdjustment",
          "parser",
          "featureContractSha256",
        ]),
      });
      expect(document.components?.schemas?.StateRunDto).toMatchObject({
        required: expect.arrayContaining(["modelArtifactId", "modelArtifactSha256"]),
      });
      expect(document.components?.schemas?.StateRunDto).not.toHaveProperty(
        "properties.legalEvidenceManifest",
      );
      expect(document.components?.schemas?.StateRunComponentDto).toMatchObject({
        required: expect.arrayContaining([
          "sourceDatasetId",
          "licenseReviewId",
          "sourceAdmissionDecisionId",
          "legalEvidenceSha256",
          "legalEvidenceManifest",
        ]),
        properties: {
          sourceDatasetId: { format: "uuid", nullable: true },
          licenseReviewId: { format: "uuid", nullable: true },
          sourceAdmissionDecisionId: { format: "uuid", nullable: true },
          legalEvidenceSha256: { pattern: "^[0-9a-f]{64}$", nullable: true },
          legalEvidenceManifest: { nullable: true },
        },
      });
      expect(document.components?.schemas?.StateLegalEvidenceManifestDto).toMatchObject({
        required: expect.arrayContaining([
          "schemaVersion",
          "action",
          "organizationId",
          "observationId",
          "sourceId",
          "sourceDatasetId",
          "licenseReview",
          "sourceAdmissionDecision",
        ]),
        properties: {
          schemaVersion: { enum: [1] },
          action: { enum: ["derive"] },
        },
      });
      expect(document.paths["/api/v1/economic-state/runs"]?.get?.description).toContain(
        "Fails closed",
      );
      expect(
        document.paths["/api/v1/economic-state/vectors/{vectorId}"]?.get?.description,
      ).toContain("research baseline");
      expect(document.paths["/api/v1/economic-state/vectors/{vectorId}"]?.get?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "vectorId", in: "path", required: true }),
          expect.objectContaining({ name: "workspaceId", in: "query", required: true }),
        ]),
      );
    } finally {
      await app.close();
    }
  });
});
