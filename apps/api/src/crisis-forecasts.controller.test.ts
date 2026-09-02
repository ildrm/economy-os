import "reflect-metadata";
import type { Principal } from "@economyos/contracts";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import {
  CrisisForecastController,
  CrisisForecastSlotController,
} from "./crisis-forecasts.controller.js";
import { CrisisForecastService } from "./crisis-forecasts.js";
import type { AuthenticatedRequest } from "./http.js";

const WORKSPACE_ID = "218f47ac-19fc-7c92-ae91-0242ac120001";
const RUN_ID = "418f47ac-19fc-7c92-ae91-0242ac120001";
const SLOT_ID = "818f47ac-19fc-7c92-ae91-0242ac120001";
const GEOGRAPHY_ID = "518f47ac-19fc-7c92-ae91-0242ac120001";
const principal = {
  organizationId: "118f47ac-19fc-7c92-ae91-0242ac120001",
  workspaceIds: [WORKSPACE_ID],
  subjectId: "318f47ac-19fc-7c92-ae91-0242ac120001",
  scopes: ["model.read"],
  authenticationMethod: "oidc",
  issuedAt: "2026-09-02T00:00:00Z",
  expiresAt: "2026-09-02T12:00:00Z",
} as unknown as Principal;

describe("crisis forecast OpenAPI contract", () => {
  it("publishes authenticated run pointers, exact manifests, and independent slot detail", async () => {
    const testingModule = await Test.createTestingModule({
      controllers: [CrisisForecastController, CrisisForecastSlotController],
      providers: [{ provide: CrisisForecastService, useValue: {} }],
    }).compile();
    const app = testingModule.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix("api/v1");
    try {
      await app.init();
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle("test").setVersion("1").addBearerAuth().build(),
      );
      const collection = "/api/v1/crisis/forecast-runs";
      const detail = "/api/v1/crisis/forecast-runs/{runId}";
      const slot = "/api/v1/crisis/forecast-slots/{slotId}";
      expect(Object.keys(document.paths).sort()).toEqual([collection, detail, slot].sort());
      expect(document.paths[collection]?.get?.security).toEqual([{ bearer: [] }]);
      expect(document.paths[detail]?.get?.security).toEqual([{ bearer: [] }]);
      expect(document.paths[slot]?.get?.security).toEqual([{ bearer: [] }]);
      expect(document.paths[collection]?.post).toBeUndefined();
      expect(document.paths[detail]?.put).toBeUndefined();
      expect(document.paths[collection]?.get?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "workspaceId", required: true }),
          expect.objectContaining({ name: "geographyId", required: true }),
          expect.objectContaining({ name: "limit", required: false }),
          expect.objectContaining({ name: "beforeGeneratedAt", required: false }),
          expect.objectContaining({ name: "beforeRunId", required: false }),
        ]),
      );
      expect(document.paths[collection]?.get?.description).toContain("never collapsed");
      expect(document.components?.schemas?.CrisisForecastRunDto).toMatchObject({
        required: expect.arrayContaining([
          "schemaVersion",
          "workspaceId",
          "slotCount",
          "slots",
          "semantics",
        ]),
      });
      expect(document.components?.schemas?.CrisisForecastSlotPointerDto).toMatchObject({
        properties: {
          slotId: { format: "uuid", type: "string" },
          hazard: { enum: ["FX", "BANK", "SOV", "MON", "POL", "COUP", "CIV", "WAR"] },
          horizonDays: { enum: [30, 90, 180, 365], type: "number" },
          slotSha256: { pattern: "^[0-9a-f]{64}$", type: "string" },
        },
      });
      expect(document.components?.schemas?.CrisisForecastSlotPointerDto).not.toMatchObject({
        properties: { probability: expect.anything() },
      });
      expect(document.paths[slot]?.get?.description).toContain("No aggregate crisis probability");
      expect(document.components?.schemas?.CrisisForecastSlotDetailDto).toMatchObject({
        required: expect.arrayContaining([
          "schemaVersion",
          "slotId",
          "probability",
          "uncertainty",
          "model",
          "assumptions",
          "invalidationCriteria",
          "evidence",
        ]),
      });
      expect(document.components?.schemas?.CrisisForecastProbabilityDto).toMatchObject({
        properties: {
          raw: expect.objectContaining({ type: "string" }),
          calibrated: expect.objectContaining({ type: "string" }),
          aggregate: expect.objectContaining({ nullable: true }),
        },
      });
      expect(document.components?.schemas?.CrisisForecastEvidencePointerDto).toMatchObject({
        properties: {
          sourceKind: {
            enum: ["canonical_admission", "relationship_evidence", "economic_state_run"],
            type: "string",
          },
          availableAt: { format: "date-time", type: "string" },
          sourceSha256: { pattern: "^[0-9a-f]{64}$", type: "string" },
        },
      });
    } finally {
      await app.close();
    }
  });

  it("dispatches strict queries with the authenticated principal and rejects a guard breach", async () => {
    const list = vi.fn(async () => ({ count: 0 }));
    const get = vi.fn(async () => ({ runId: RUN_ID }));
    const getSlot = vi.fn(async () => ({ slotId: SLOT_ID }));
    const service = { list, get, getSlot } as unknown as CrisisForecastService;
    const runs = new CrisisForecastController(service);
    const slots = new CrisisForecastSlotController(service);
    const request = { principal } as AuthenticatedRequest;

    await runs.list(request, { workspaceId: WORKSPACE_ID, geographyId: GEOGRAPHY_ID });
    await runs.get(request, RUN_ID, { workspaceId: WORKSPACE_ID });
    await slots.get(request, SLOT_ID, { workspaceId: WORKSPACE_ID });

    expect(list).toHaveBeenCalledWith(
      principal,
      expect.objectContaining({ workspaceId: WORKSPACE_ID, geographyId: GEOGRAPHY_ID, limit: 50 }),
    );
    expect(get).toHaveBeenCalledWith(principal, RUN_ID, { workspaceId: WORKSPACE_ID });
    expect(getSlot).toHaveBeenCalledWith(principal, SLOT_ID, { workspaceId: WORKSPACE_ID });
    expect(() =>
      runs.get({} as AuthenticatedRequest, RUN_ID, { workspaceId: WORKSPACE_ID }),
    ).toThrow("Authentication guard invariant failed");
  });
});
