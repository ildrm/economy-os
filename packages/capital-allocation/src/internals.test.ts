import { describe, expect, it } from "vitest";
import {
  addDecimals,
  assertBoolean,
  assertCountryCode,
  assertEnum,
  assertExactKeys,
  assertIsoInstant,
  assertKey,
  assertNonBlank,
  assertProbability,
  assertResearchNarrative,
  assertSafeInteger,
  assertSemver,
  assertSha256,
  assertUniqueStrings,
  assertUnitScore,
  assertUuid,
  canonicalJson,
  cloneCanonical,
  compareDecimal,
  deepFreeze,
  digestJson,
  formatUnits,
  multiplyDecimal,
  secondsBetween,
  weightedDecimal,
} from "./internals.js";

describe("canonical and exact primitive guards", () => {
  it("canonicalizes safe JSON deterministically and freezes nested values", () => {
    expect(canonicalJson({ z: -0, a: [true, null, "x"] })).toBe('{"a":[true,null,"x"],"z":0}');
    expect(digestJson({ b: 2, a: 1 })).toBe(digestJson({ a: 1, b: 2 }));
    const cloned = cloneCanonical({ b: 2, a: 1 });
    expect(cloned).toEqual({ a: 1, b: 2 });
    expect(deepFreeze(cloned)).toBe(cloned);
    expect(Object.isFrozen(cloned)).toBe(true);
  });

  it("rejects noncanonical JSON structures", () => {
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(/safe-integer/);
    expect(() => canonicalJson(0.5)).toThrow(/safe-integer/);
    expect(() => canonicalJson(undefined)).toThrow(/canonical JSON/);
    expect(() => canonicalJson(new Date("2025-01-01T00:00:00Z"))).toThrow(/plain JSON/);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow(/cycle/);
  });

  it("checks exact shapes and identifiers", () => {
    expect(() => assertExactKeys({ a: 1 }, ["a"], "value")).not.toThrow();
    expect(() => assertExactKeys([], [], "value")).toThrow(/object/);
    expect(() => assertExactKeys({ a: 1, b: 2 }, ["a"], "value")).toThrow(/exactly/);
    expect(() => assertUuid("bad", "uuid")).toThrow(/UUID/);
    expect(() => assertSha256("A".repeat(64), "sha")).toThrow(/SHA-256/);
    expect(() => assertSemver("v1", "version")).toThrow(/semantic/);
    expect(() => assertKey("Bad Key", "key")).toThrow(/stable lowercase/);
    expect(() => assertCountryCode("usa", "country")).toThrow(/alpha-2/);
    expect(() => assertNonBlank(" padded ", "text")).toThrow(/non-blank/);
    expect(() => assertSafeInteger(1.2, "integer")).toThrow(/integer/);
    expect(() => assertBoolean("true", "flag")).toThrow(/boolean/);
    expect(() => assertEnum("x", ["a", "b"] as const, "enum")).toThrow(/supported/);
  });

  it("validates real UTC calendar instants and deterministic intervals", () => {
    expect(() => assertIsoInstant("2024-02-29T00:00:00Z", "instant")).not.toThrow();
    expect(() => assertIsoInstant("2023-02-29T00:00:00Z", "instant")).toThrow(/valid/);
    expect(() => assertIsoInstant("2025-01-01T00:00:00+01:00", "instant")).toThrow(/UTC/);
    expect(secondsBetween("2025-01-01T00:00:00Z", "2025-01-02T00:00:00Z")).toBe(86_400);
    expect(() => secondsBetween("2025-01-02T00:00:00Z", "2025-01-01T00:00:00Z")).toThrow(
      /non-negative/,
    );
    expect(() => secondsBetween("2025-01-01T00:00:00.001Z", "2025-01-01T00:00:01.002Z")).toThrow(
      /whole number/,
    );
  });

  it("uses bounded canonical fixed-12 decimal arithmetic", () => {
    expect(multiplyDecimal("-0.333333333333", "0.5")).toBe("-0.166666666667");
    expect(addDecimals(["0.1", "-0.2", "0.3"])).toBe("0.2");
    expect(weightedDecimal("0.4", "0.6", "0.2", "0.4")).toBe("0.32");
    expect(compareDecimal("-0.1", "0")).toBe(-1);
    expect(compareDecimal("1", "1")).toBe(0);
    expect(compareDecimal("1", "0.9")).toBe(1);
    expect(formatUnits(-1_500_000_000_000n)).toBe("-1.5");
    expect(() => assertUnitScore("1.01", "score")).toThrow(/between -1 and 1/);
    expect(() => assertProbability("-0.1", "probability")).toThrow(/between 0 and 1/);
    expect(() => assertProbability("1.0", "probability")).toThrow(/canonical decimal/);
    expect(() => assertUnitScore("0.1234567890123", "score")).toThrow(/12 places/);
  });

  it("requires unique bounded lists and rejects several advice formulations", () => {
    expect(() => assertUniqueStrings([], "items", assertKey)).toThrow(/non-empty/);
    expect(() => assertUniqueStrings([], "items", assertKey, true)).not.toThrow();
    expect(() => assertUniqueStrings(["same", "same"], "items", assertKey)).toThrow(/unique/);
    for (const text of [
      "Buy this asset.",
      "We recommend gold.",
      "You should invest now.",
      "Investors must allocate capital.",
      "The recommended portfolio weight is ten percent.",
      "Guaranteed returns are expected.",
    ]) {
      expect(() => assertResearchNarrative(text, "narrative")).toThrow(/advice language/);
    }
  });
});
