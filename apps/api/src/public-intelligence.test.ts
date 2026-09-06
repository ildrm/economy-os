import "reflect-metadata";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Controller, Get } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AccessTokenGuard } from "./auth.js";
import { ProblemDetailsFilter } from "./problem.filter.js";
import { PublicIntelligenceController } from "./public-intelligence.controller.js";
import { PublicIntelligenceService } from "./public-intelligence.js";

@Controller("private-control")
class PrivateControl {
  @Get() read() {
    return { protected: true };
  }
}

describe("approved public intelligence HTTP projection", () => {
  let app: NestFastifyApplication;
  let root: string;
  const verifier = { verify: vi.fn() };
  const repositoryRoot = new URL("../../../", import.meta.url);
  const get = (url: string) => app.inject({ method: "GET", url: `/api/v1/${url}` });
  const reset = async (path: string) =>
    writeFile(join(root, path), await readFile(new URL(path, repositoryRoot)));

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "economyos-public-api-"));
    for (const directory of [
      "apps/web/public/economy",
      "apps/web/public/behavioral",
      "data/public-economy",
    ])
      await mkdir(join(root, directory), { recursive: true });
    for (const path of [
      "apps/web/public/economy/manifest.json",
      "apps/web/public/economy/DE.json",
      "apps/web/public/economy/FR.json",
      "apps/web/public/behavioral/manifest.json",
      "apps/web/public/behavioral/DE.json",
      "data/public-economy/indicators.json",
    ])
      await reset(path);
    const module = await Test.createTestingModule({
      controllers: [PublicIntelligenceController, PrivateControl],
      providers: [
        {
          provide: PublicIntelligenceService,
          useValue: PublicIntelligenceService.forTesting(
            pathToFileURL(`${root}/`),
            () => new Date("2026-09-06T12:00:00Z"),
          ),
        },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("api/v1");
    app.useGlobalGuards(new AccessTokenGuard(app.get(Reflector), verifier));
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("serves actual public coverage anonymously while protected routes still require identity", async () => {
    const response = await get("public/catalog");
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json().countries).toHaveLength(217);
    expect(response.json().metrics).toHaveLength(80);
    expect(
      response.json().sources.map((source: { observations: number }) => source.observations),
    ).toEqual([336444, 9806]);
    expect((await get("private-control")).statusCode).toBe(401);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it("compares actual common years and keeps non-comparable measures unavailable", async () => {
    const response = await get(
      "public/compare?countries=DE,FR&metrics=inflation,consumption-person",
    );
    expect(response.statusCode).toBe(200);
    const rows = response.json().rows;
    expect(rows[0].comparability).toBe("compatible_annual_reference");
    for (const measurement of rows[0].measurements) {
      expect(measurement.result.period.start).toBe(String(rows[0].period));
      expect(measurement.result.value).toBe(Number(measurement.observation.original_value));
      expect(measurement.observation.currency).toBeNull();
      expect(measurement.observation.revision_status).toBe("unknown");
      expect(measurement.result.evidence[0].snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(rows[1].reason).toBe("different_units_or_definitions");
    expect(
      rows[1].measurements.every(
        (entry: { result: AnalyticalResultFixture }) =>
          entry.result.value === null && entry.result.reason === "incompatible_measurements",
      ),
    ).toBe(true);
  });

  it("returns real monthly survey records and explicit geographic gaps", async () => {
    const response = await get("public/behavioral/DE?measure=expected-inflation-1y");
    expect(response.statusCode).toBe(200);
    expect(response.json().result).toMatchObject({
      availability: "available",
      value: 2.6,
      unit: "percent",
      evidenceType: "descriptive_statistic",
      horizonMonths: 12,
      period: { start: "2026-07", end: "2026-07" },
    });
    expect(response.json().records).toHaveLength(76);
    expect((await get("public/behavioral/US?measure=expected-inflation-1y")).json()).toMatchObject({
      availability: "unavailable",
      reason: "no_observations",
      records: [],
    });
  });

  it("completes an indicator report without requiring invented crisis probabilities", async () => {
    const response = await get("public/risk/DE");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      schemaVersion: 2,
      completion: "indicators_published_forecasts_unavailable",
      aggregateProbability: null,
    });
    const dimensions = response.json().dimensions;
    expect(dimensions).toHaveLength(4);
    for (const dimension of dimensions) {
      expect(dimension.measurements).toHaveLength(4);
      expect(dimension.forecasts).toHaveLength(4);
      for (const forecast of dimension.forecasts)
        expect(forecast).toMatchObject({
          availability: "unavailable",
          reason: "model_not_approved",
          probability: null,
          uncertainty: null,
        });
      for (const measurement of dimension.measurements)
        if (measurement.change.availability === "available")
          expect(measurement.change.to - measurement.change.from).toBe(1);
    }
  });

  it("answers bounded questions with evidence and rejects unsupported questions without fabricating analysis", async () => {
    const response = await get("public/questions/household-conditions?country=DE");
    expect(response.statusCode).toBe(200);
    expect(response.json().measurements).toHaveLength(4);
    expect(response.json().measurements[0].result.evidence[0].sourceUrl).toMatch(
      /^https:\/\/data.worldbank.org/,
    );
    expect((await get("public/questions/predict-my-profit?country=DE")).json()).toMatchObject({
      availability: "unavailable",
      reason: "unsupported_question",
    });
  });

  it("does not accept arbitrary computations, identifiers or oversized comparison selections", async () => {
    for (const path of [
      "public/countries/..%2F..%2F.env",
      "public/compare?countries=DE,FR,GB,US,CA&metrics=inflation",
      "public/compare?countries=DE,DE&metrics=inflation",
      "public/compare?countries=DE,FR&metrics=sql",
      "public/behavioral/DE?measure=private-study",
    ])
      expect((await get(path)).statusCode).toBe(400);
    const valid = await app.inject({
      method: "POST",
      url: "/api/v1/public/scenarios",
      payload: { family: "inflation", audience: "household", severity: "moderate" },
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json().results.purchasingPowerIndex).toBeCloseTo(100 / 1.05, 10);
    expect(valid.json().evidenceType).toBe("scenario");
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/public/scenarios",
          payload: {
            family: "inflation",
            audience: "household",
            severity: "moderate",
            sql: "select",
          },
        })
      ).statusCode,
    ).toBe(400);
  });

  it("fails closed on corrupted data with no raw-file paths or values in errors", async () => {
    const path = "apps/web/public/economy/DE.json";
    try {
      await writeFile(join(root, path), '{"private":"never return this"}');
      const response = await get("public/countries/DE");
      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe("PUBLIC_SNAPSHOT_UNAVAILABLE");
      expect(response.body).not.toContain(root);
      expect(response.body).not.toContain("never return");
    } finally {
      await reset(path);
    }
  });

  it("rechecks publication withdrawal and permission expiry on each API request", async () => {
    const path = "apps/web/public/behavioral/manifest.json";
    const original = JSON.parse(await readFile(join(root, path), "utf8"));
    try {
      await writeFile(
        join(root, path),
        JSON.stringify({ ...original, publicationStatus: "withdrawn" }),
      );
      expect(
        (await get("public/behavioral/DE?measure=expected-inflation-1y")).json(),
      ).toMatchObject({ availability: "unavailable", reason: "permission_required", records: [] });
      original.source.review.expires_at = "2026-09-06T10:00:00Z";
      await writeFile(join(root, path), JSON.stringify(original));
      expect(
        (await get("public/behavioral/DE?measure=expected-inflation-1y")).json(),
      ).toMatchObject({ availability: "unavailable", reason: "permission_required", records: [] });
      expect((await get("public/catalog")).json().sources[1]).toMatchObject({
        stage: "publication_suspended",
        observations: 0,
      });
    } finally {
      await reset(path);
    }
  });
});

interface AnalyticalResultFixture {
  value: number | null;
  reason?: string;
}
