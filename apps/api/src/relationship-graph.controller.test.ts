import "reflect-metadata";
import { organizationId, type Principal, subjectId, workspaceId } from "@economyos/contracts";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "./http.js";
import { RelationshipGraphController } from "./relationship-graph.controller.js";
import { RelationshipGraphService } from "./relationship-graph.js";
import {
  ReleaseNotificationsController,
  ReleaseSubscriptionController,
} from "./release-notifications.controller.js";
import { ReleaseNotificationService } from "./release-notifications.js";

const WORKSPACE_ID = workspaceId("238f47ac-19fc-7c92-ae91-0242ac120001");
const CLAIM_ID = "538f47ac-19fc-7c92-ae91-0242ac120001";
const DECISION_ID = "838f47ac-19fc-7c92-ae91-0242ac120001";
const principal: Principal = {
  organizationId: organizationId("138f47ac-19fc-7c92-ae91-0242ac120001"),
  workspaceIds: [WORKSPACE_ID],
  subjectId: subjectId("338f47ac-19fc-7c92-ae91-0242ac120001"),
  scopes: ["relationship.read", "relationship.write"],
  authenticationMethod: "oidc",
  issuedAt: "2026-09-02T00:00:00Z",
  expiresAt: "2026-09-03T00:00:00Z",
};

describe("relationship graph controller", () => {
  it("publishes six collision-free, authenticated v1 operations with explicit temporal cutoffs", async () => {
    const testingModule = await Test.createTestingModule({
      controllers: [
        RelationshipGraphController,
        ReleaseSubscriptionController,
        ReleaseNotificationsController,
      ],
      providers: [
        { provide: RelationshipGraphService, useValue: {} },
        { provide: ReleaseNotificationService, useValue: {} },
      ],
    }).compile();
    const app = testingModule.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix("api/v1");
    try {
      await app.init();
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle("test").setVersion("1").addBearerAuth().build(),
      );
      const expectedGraphPaths = [
        "/api/v1/relationship-graph/endpoints/{endpointId}",
        "/api/v1/relationship-graph/claims/{claimId}",
        "/api/v1/relationship-graph/evidence/{evidenceId}",
        "/api/v1/relationship-graph/claims/{claimId}/evidence-links/{linkId}",
        "/api/v1/relationship-graph/claims/{claimId}/decisions/{decisionId}",
        "/api/v1/relationship-graph/claims/{claimId}/status",
      ];
      const graphPaths = Object.keys(document.paths).filter((path) =>
        path.startsWith("/api/v1/relationship-graph/"),
      );
      expect([...graphPaths].sort()).toEqual([...expectedGraphPaths].sort());
      const statusPath = expectedGraphPaths[5] ?? "";
      for (const path of expectedGraphPaths.filter((candidate) => candidate !== statusPath)) {
        expect(document.paths[path]?.put?.security).toEqual([{ bearer: [] }]);
        expect(document.paths[path]?.post).toBeUndefined();
        expect(document.paths[path]?.delete).toBeUndefined();
      }
      expect(document.paths[statusPath]?.get?.security).toEqual([{ bearer: [] }]);
      expect(document.paths[statusPath]?.get?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "workspaceId", required: true }),
          expect.objectContaining({ name: "effectiveAt", required: true }),
          expect.objectContaining({ name: "systemAt", required: true }),
        ]),
      );
      expect(document.paths[statusPath]?.get?.description).toContain("non-enumerating");
      expect(document.paths[expectedGraphPaths[1] ?? ""]?.put?.description).toContain(
        "never promotes",
      );

      const schemas = document.components?.schemas ?? {};
      expect(schemas.RelationshipEndpointCommandDto).toBeDefined();
      expect(schemas.RelationshipClaimCommandDto).toBeDefined();
      expect(schemas.RelationshipEvidenceCommandDto).toBeDefined();
      expect(schemas.RelationshipEvidenceLinkCommandDto).toBeDefined();
      expect(schemas.RelationshipDecisionCommandDto).toBeDefined();
      expect(schemas.RelationshipWriteReceiptDto).toBeDefined();
      expect(schemas.RelationshipClaimStatusDto).toBeDefined();
      const claimProperties = schemaProperties(schemas.RelationshipClaimCommandDto);
      expect(claimProperties).not.toHaveProperty("organizationId");
      expect(claimProperties).not.toHaveProperty("subjectId");
      expect(Object.keys(document.paths)).toContain(
        "/api/v1/evidence/series/{seriesId}/release-subscription",
      );
    } finally {
      await app.close();
    }
  });

  it("validates body and path input before delegating and fails closed without a principal", () => {
    const decide = vi.fn();
    const graph = { decide } as unknown as RelationshipGraphService;
    const controller = new RelationshipGraphController(graph);
    const request = { principal } as AuthenticatedRequest;

    expect(() => controller.decide(request, CLAIM_ID, "not-a-uuid", decisionBody())).toThrow(
      "Bad Request",
    );
    expect(() =>
      controller.decide(request, CLAIM_ID, DECISION_ID, {
        ...decisionBody(),
        organizationId: principal.organizationId,
      }),
    ).toThrow("Bad Request");
    expect(() =>
      controller.decide({} as AuthenticatedRequest, CLAIM_ID, DECISION_ID, decisionBody()),
    ).toThrow("Authentication guard invariant failed");
    expect(decide).not.toHaveBeenCalled();
  });

  it("delegates an exact status query without inventing a temporal default", async () => {
    const status = vi.fn(async () => ({ resolvedClaimId: CLAIM_ID }));
    const controller = new RelationshipGraphController({
      status,
    } as unknown as RelationshipGraphService);
    const request = { principal } as AuthenticatedRequest;
    const query = {
      workspaceId: WORKSPACE_ID,
      effectiveAt: "2026-09-02T08:00:00Z",
      systemAt: "2026-09-02T08:00:01Z",
    };

    await controller.status(request, CLAIM_ID, query);
    expect(status).toHaveBeenCalledWith(principal, CLAIM_ID, query);
    expect(() =>
      controller.status(request, CLAIM_ID, {
        workspaceId: WORKSPACE_ID,
        effectiveAt: "2026-09-02T08:00:00Z",
      }),
    ).toThrow("Bad Request");
  });
});

function schemaProperties(schema: unknown): Readonly<Record<string, unknown>> {
  if (typeof schema !== "object" || schema === null || !("properties" in schema)) return {};
  const properties = schema.properties;
  return typeof properties === "object" && properties !== null
    ? (properties as Readonly<Record<string, unknown>>)
    : {};
}

function decisionBody(): Readonly<Record<string, unknown>> {
  return {
    workspaceId: WORKSPACE_ID,
    toStatus: "reviewed",
    reason: "Independent validation completed with linked evidence.",
    effectiveAt: "2026-09-02T08:00:00Z",
  };
}
