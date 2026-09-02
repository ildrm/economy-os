import "reflect-metadata";
import { organizationId, type Principal, subjectId, workspaceId } from "@economyos/contracts";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { EconomicStateDiscoveryController } from "./economic-state-discovery.controller.js";
import { EconomicStateDiscoveryService } from "./economic-state-discovery.js";
import type { AuthenticatedRequest } from "./http.js";

const workspace = "078f47ac-19fc-7c92-ae91-0242ac120002";
const snapshot = "078f47ac-19fc-7c92-ae91-0242ac120003";
const vectorA = "078f47ac-19fc-7c92-ae91-0242ac120005";
const vectorB = "078f47ac-19fc-7c92-ae91-0242ac120006";
const principal: Principal = Object.freeze({
  subjectId: subjectId("078f47ac-19fc-7c92-ae91-0242ac12000a"),
  organizationId: organizationId("078f47ac-19fc-7c92-ae91-0242ac120001"),
  workspaceIds: Object.freeze([workspaceId(workspace)]),
  scopes: Object.freeze([]),
  authenticationMethod: "oidc",
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-01T01:00:00.000Z",
});

describe("EconomicStateDiscoveryController", () => {
  it("passes an authenticated principal and strictly parsed queries to the service", async () => {
    const vectors = vi.fn(async () => ({ schemaVersion: 1 }));
    const compare = vi.fn(async () => ({ schemaVersion: 1 }));
    const controller = new EconomicStateDiscoveryController({
      vectors,
      compare,
    } as unknown as EconomicStateDiscoveryService);
    const request = { principal } as AuthenticatedRequest;

    await controller.vectors(request, {
      workspaceId: workspace,
      snapshotId: snapshot,
      knownAt: "2026-03-01T00:00:00Z",
      policy: "latest_revised",
      systemAt: "null",
    });
    await controller.compare(request, {
      workspaceId: workspace,
      vectorIds: `${vectorB},${vectorA}`,
    });

    expect(vectors).toHaveBeenCalledWith(principal, {
      workspaceId: workspace,
      snapshotId: snapshot,
      knownAt: "2026-03-01T00:00:00.000000Z",
      policy: "latest_revised",
      systemAt: null,
      limit: 50,
    });
    expect(compare).toHaveBeenCalledWith(principal, {
      workspaceId: workspace,
      vectorIds: [vectorB, vectorA],
    });
  });

  it("publishes bounded, bearer-protected discovery and comparison contracts", async () => {
    const testingModule = await Test.createTestingModule({
      controllers: [EconomicStateDiscoveryController],
      providers: [{ provide: EconomicStateDiscoveryService, useValue: {} }],
    }).compile();
    const app = testingModule.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix("api/v1");
    try {
      await app.init();
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle("test").setVersion("1").addBearerAuth().build(),
      );
      const discovery = document.paths["/api/v1/economic-state/vectors"]?.get;
      const comparison = document.paths["/api/v1/economic-state/comparisons"]?.get;
      expect(discovery?.security).toEqual([{ bearer: [] }]);
      expect(comparison?.security).toEqual([{ bearer: [] }]);
      expect(document.paths["/api/v1/economic-state/vectors"]?.post).toBeUndefined();
      expect(document.paths["/api/v1/economic-state/comparisons"]?.post).toBeUndefined();

      const discoveryParameters = Object.fromEntries(
        (discovery?.parameters ?? []).map((parameter) => [
          "name" in parameter ? parameter.name : "reference",
          parameter,
        ]),
      );
      expect(Object.keys(discoveryParameters).sort()).toEqual(
        [
          "workspaceId",
          "snapshotId",
          "knownAt",
          "policy",
          "systemAt",
          "geographyId",
          "cursor",
          "limit",
        ].sort(),
      );
      for (const required of ["workspaceId", "snapshotId", "knownAt", "policy", "systemAt"]) {
        expect(discoveryParameters[required]).toMatchObject({ required: true, in: "query" });
      }
      expect(discoveryParameters.limit).toMatchObject({
        required: false,
        schema: { minimum: 1, maximum: 100 },
      });
      expect(discovery?.description).toContain("hidden whole");

      expect(comparison?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "workspaceId", required: true, in: "query" }),
          expect.objectContaining({
            name: "vectorIds",
            required: true,
            in: "query",
            schema: expect.objectContaining({
              pattern: "^[0-9a-fA-F-]{36}(,[0-9a-fA-F-]{36}){1,9}$",
            }),
          }),
        ]),
      );
      expect(comparison?.description).toContain("never silently normalized");

      expect(document.components?.schemas?.StateVectorDiscoveryPageDto).toMatchObject({
        required: expect.arrayContaining([
          "schemaVersion",
          "methodologyScope",
          "context",
          "count",
          "nextCursor",
          "vectors",
        ]),
        properties: {
          schemaVersion: { enum: [1] },
          methodologyScope: { enum: ["research_baseline"] },
          vectors: expect.objectContaining({ maxItems: 100 }),
        },
      });
      expect(document.components?.schemas?.StateVectorComparisonDto).toMatchObject({
        required: expect.arrayContaining([
          "schemaVersion",
          "methodologyScope",
          "requestedVectorIds",
          "vectorCount",
          "context",
          "compatibility",
          "vectors",
        ]),
        properties: {
          requestedVectorIds: expect.objectContaining({
            minItems: 2,
            maxItems: 10,
            uniqueItems: true,
          }),
          vectors: expect.objectContaining({ minItems: 2, maxItems: 10 }),
        },
      });
      expect(document.components?.schemas?.ComparisonDimensionDto).toMatchObject({
        required: expect.arrayContaining([
          "score",
          "missingReason",
          "completeness",
          "sourceCoverage",
          "confidence",
          "renormalized",
          "modelId",
          "modelDefinitionSha256",
          "modelArtifactId",
          "modelArtifactSha256",
        ]),
        properties: { score: expect.objectContaining({ type: "string", nullable: true }) },
      });
      expect(document.components?.schemas?.StateVectorComparisonDto).not.toHaveProperty(
        "properties.rank",
      );
      expect(document.components?.schemas?.StateVectorComparisonDto).not.toHaveProperty(
        "properties.overallScore",
      );
      expect(document.components?.schemas?.ComparisonDimensionDto).not.toHaveProperty(
        "properties.normalizedScore",
      );
    } finally {
      await app.close();
    }
  });
});
