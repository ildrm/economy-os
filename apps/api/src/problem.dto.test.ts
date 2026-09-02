import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import {
  EvidenceController,
  HealthController,
  IdentityController,
  WorkspacesController,
} from "./controllers.js";
import { PostgresRuntime } from "./database.js";
import { EconomicStateController } from "./economic-state.controller.js";
import { EconomicStateService } from "./economic-state.js";
import { EconomicStateDiscoveryController } from "./economic-state-discovery.controller.js";
import { EconomicStateDiscoveryService } from "./economic-state-discovery.js";
import { GovernedEvidenceService } from "./evidence.js";
import { ReleaseMonitoringController } from "./release-monitoring.controller.js";
import { ReleaseMonitoringService } from "./release-monitoring.js";
import { WorkspaceAccessService } from "./workspaces.js";

describe("shared API problem contract", () => {
  it("emits one complete Swagger schema across every controller", async () => {
    const testingModule = await Test.createTestingModule({
      controllers: [
        HealthController,
        IdentityController,
        WorkspacesController,
        EvidenceController,
        ReleaseMonitoringController,
        EconomicStateController,
        EconomicStateDiscoveryController,
      ],
      providers: [
        { provide: PostgresRuntime, useValue: {} },
        { provide: WorkspaceAccessService, useValue: {} },
        { provide: GovernedEvidenceService, useValue: {} },
        { provide: ReleaseMonitoringService, useValue: {} },
        { provide: EconomicStateService, useValue: {} },
        { provide: EconomicStateDiscoveryService, useValue: {} },
      ],
    }).compile();
    const app = testingModule.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix("api/v1");
    const warning = vi.spyOn(Logger, "warn").mockImplementation(() => undefined);
    try {
      await app.init();
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle("test").setVersion("1").addBearerAuth().build(),
      );
      const problemSchemas = Object.keys(document.components?.schemas ?? {}).filter((name) =>
        name.includes("ProblemDetails"),
      );
      expect(problemSchemas).toEqual(["ProblemDetailsDto"]);
      expect(document.components?.schemas?.ProblemDetailsDto).toMatchObject({
        required: expect.arrayContaining(["type", "title", "status", "code", "detail"]),
        properties: {
          instance: { type: "string" },
          traceId: { type: "string", pattern: "^(?!0{32})[0-9a-f]{32}$" },
        },
      });
      expect(warning.mock.calls.flat().join(" ")).not.toContain("Duplicate DTO detected");
    } finally {
      warning.mockRestore();
      await app.close();
    }
  });
});
