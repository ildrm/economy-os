import { describe, expect, it } from "vitest";
import sourceProfile from "../../../data/intelligence/ecb-ces-source.json" with { type: "json" };
import { annualReferenceObservation, wdiObservationMetadata } from "./annual-reference.js";
import {
  type AnalyticalResult,
  assertAnalyticalResult,
  assertInstrument,
  assertObservationRecord,
  assertSourceUse,
  type InstrumentIdentity,
  type ObservationRecord,
} from "./intelligence.js";
import type { SourceProfile } from "./source-policy.js";

const retained: ObservationRecord = {
  schemaVersion: 2,
  id: "test-observation",
  datasetId: "test-wdi",
  semanticsVersion: "1",
  raw: { sha256: "a".repeat(64), locator: "DE:inflation:2025", value: "2.5", unit: "", status: "" },
  population: "Test country aggregate",
  seasonalAdjustment: "not_applicable",
  methodologicalBreak: null,
  knownAt: null,
  vintage: "latest_revised_only",
  observation: annualReferenceObservation(
    {
      code: "FP.CPI.TOTL.ZG",
      topic: "prices",
      unit: "percent",
      valueType: "rate",
      currency: null,
      indexBase: null,
    },
    {
      code: "FP.CPI.TOTL.ZG",
      indicatorUrl: "https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG",
      retrievedAt: "2026-09-06T07:00:00Z",
      observationMetadata: wdiObservationMetadata("", ""),
    },
    { code: "DE", name: "Germany" },
    [2025, "2.5"],
  ),
};
const profile = sourceProfile.source as SourceProfile;
const context = {
  schemaVersion: 1 as const,
  id: "test-analysis",
  entity: "DE",
  evidenceType: "descriptive_statistic" as const,
  period: { start: "2025-01", end: "2025-12" },
  horizonMonths: null,
  method: { id: "mean", version: "1" },
  explanationKey: "description",
  limitationKeys: ["revised_history"],
  evidence: [
    {
      datasetId: "ecb-ces",
      snapshotSha256: "a".repeat(64),
      sourceUrl: "https://data.ecb.europa.eu",
      observationIds: [retained.id],
    },
  ],
  freshness: {
    retrievedAt: "2026-09-06T07:00:00Z",
    expectedNextRelease: null,
    state: "unknown" as const,
  },
  coverage: {
    observations: 12,
    requiredObservations: 12,
    includedEntities: ["DE"],
    excludedEntities: [],
    scope: "complete" as const,
  },
};
const available: AnalyticalResult = {
  ...context,
  availability: "available",
  value: 2.5,
  unit: "percent",
  uncertainty: null,
};

describe("versioned economic intelligence contracts", () => {
  it("requires evidence, minimum history and finite uncertainty", () => {
    expect(assertAnalyticalResult(available)).toBe(available);
    expect(() => assertAnalyticalResult({ ...available, evidence: [] })).toThrow();
    expect(() => assertAnalyticalResult({ ...available, value: NaN })).toThrow();
    expect(() =>
      assertAnalyticalResult({ ...available, coverage: { ...context.coverage, observations: 11 } }),
    ).toThrow();
    expect(() =>
      assertAnalyticalResult({
        ...available,
        uncertainty: { lower: 0, upper: 1, level: NaN, kind: "confidence_interval" },
      }),
    ).toThrow();
    expect(() => assertAnalyticalResult({ ...available, horizonMonths: -1 })).toThrow();
  });
  it("carries unavailable reasons without manufacturing probabilities", () => {
    const result: AnalyticalResult = {
      ...context,
      availability: "unavailable",
      reason: "model_not_approved",
      value: null,
      unit: "probability",
      uncertainty: null,
    };
    expect(assertAnalyticalResult(result).value).toBeNull();
    expect(() =>
      assertAnalyticalResult({ ...result, value: 0.5 } as unknown as AnalyticalResult),
    ).toThrow();
    expect(() =>
      assertAnalyticalResult({ ...result, reason: "unknown_code" } as unknown as AnalyticalResult),
    ).toThrow();
  });
  it("preserves actual source values and forbids invented vintage availability", () => {
    expect(assertObservationRecord(retained)).toBe(retained);
    expect(() =>
      assertObservationRecord({ ...retained, raw: { ...retained.raw, value: "999" } }),
    ).toThrow();
    expect(() => assertObservationRecord({ ...retained, vintage: "true_vintage" })).toThrow();
    expect(() =>
      assertObservationRecord({ ...retained, knownAt: "2099-01-01T00:00:00Z" }),
    ).toThrow();
  });
  it("separates crypto quote assets, fiat currency and noninvestable references", () => {
    const pair: InstrumentIdentity = {
      id: "btc-usdt",
      name: "Bitcoin / Tether",
      kind: "crypto_pair",
      venue: "Binance",
      listingId: null,
      issuerId: null,
      countryCode: null,
      sector: null,
      baseAsset: { code: "BTC", kind: "crypto" },
      quoteAsset: { code: "USDT", kind: "crypto" },
      investable: true,
    };
    expect(assertInstrument(pair).quoteAsset?.code).toBe("USDT");
    expect(() =>
      assertInstrument({ ...pair, quoteAsset: { code: "USDT", kind: "fiat" } }),
    ).toThrow();
    expect(() => assertInstrument({ ...pair, venue: null })).toThrow();
    expect(() => assertInstrument({ ...pair, kind: "index" })).toThrow();
  });
  it("rechecks acquisition and redistribution independently of access grade", () => {
    expect(() => assertSourceUse(profile, "2026-09-06T07:00:00Z", "acquisition")).not.toThrow();
    const restricted = {
      ...profile,
      review: { ...sourceProfile.source.review, redistribution: false },
    };
    expect(() => assertSourceUse(restricted, "2026-09-06T07:00:00Z", "redistribution")).toThrow();
    expect(() => assertSourceUse(profile, "2027-03-06T00:00:00Z", "acquisition")).toThrow();
  });
});
