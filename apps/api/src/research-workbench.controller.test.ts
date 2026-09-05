import "reflect-metadata";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { ResearchWorkbenchController } from "./research-workbench.controller.js";
import { ResearchWorkbenchService } from "./research-workbench.js";

describe("research HTTP contract", () => {
  it("publishes authenticated execution and exact PIT reads without observed-evidence operations", async () => {
    const module = await Test.createTestingModule({
      controllers: [ResearchWorkbenchController],
      providers: [{ provide: ResearchWorkbenchService, useValue: {} }],
    }).compile();
    const app = module.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix("api/v1");
    try {
      await app.init();
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle("test").setVersion("1").addBearerAuth().build(),
      );
      expect(Object.keys(document.paths).sort()).toEqual([
        "/api/v1/research/runs",
        "/api/v1/research/runs/{id}",
      ]);
      const write = document.paths["/api/v1/research/runs"]?.post;
      expect(write?.security).toEqual([{ bearer: [] }]);
      expect(write?.responses).toHaveProperty("200");
      expect(write?.responses).toHaveProperty("409");
      const read = document.paths["/api/v1/research/runs/{id}"]?.get;
      expect(read?.security).toEqual([{ bearer: [] }]);
      expect(read?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "workspaceId", required: true }),
          expect.objectContaining({ name: "knownAt", required: true }),
          expect.objectContaining({ name: "systemAt", required: true }),
        ]),
      );
      expect(document.paths["/api/v1/research/runs/{id}"]?.delete).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
