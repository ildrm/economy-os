import { describe, expect, it } from "vitest";
import { sha, uuid } from "./fixtures.test-helper.js";
import {
  assertDecimal,
  assertDigest,
  assertEnum,
  assertExactKeys,
  assertInteger,
  assertIsoInstant,
  assertKey,
  assertKeys,
  assertRecord,
  assertSchemaVersion,
  assertSemver,
  assertSha256,
  assertText,
  assertTexts,
  assertUuid,
  canonicalJson,
  compareDecimal,
  compareInstant,
  deepFreeze,
  digestJson,
  immutableWithDigest,
  unreachable,
} from "./internals.js";

describe("canonical integrity primitives", () => {
  it("normalizes every supported JSON primitive, array, and null-prototype record", () => {
    const nullPrototype = Object.create(null) as Record<string, unknown>;
    nullPrototype.z = null;
    nullPrototype.a = [true, false, "value", -0, 2];
    expect(canonicalJson(nullPrototype)).toBe('{"a":[true,false,"value",0,2],"z":null}');
    expect(digestJson(null)).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    [Number.NaN, /non-safe integer/],
    [1.5, /non-safe integer/],
    [undefined, /not canonical JSON/],
    [new Date(), /plain JSON objects/],
  ])("rejects noncanonical value %#", (value, message) => {
    expect(() => canonicalJson(value)).toThrow(message);
  });

  it("rejects cycles and freezes a nested artifact", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow(/cycle/);
    const artifact = immutableWithDigest({ a: { b: [1, 2] } });
    expect(Object.isFrozen(artifact)).toBe(true);
    expect(Object.isFrozen(artifact.a)).toBe(true);
    expect(Object.isFrozen(artifact.a.b)).toBe(true);
    expect(() => assertDigest(artifact)).not.toThrow();
    expect(() => assertDigest({ a: 1 })).toThrow(/required/);
    expect(() => assertDigest({ a: 1, manifestSha256: "bad" })).toThrow(/SHA-256/);
    expect(() => assertDigest({ a: 2, manifestSha256: artifact.manifestSha256 })).toThrow(
      /does not match/,
    );
    expect(deepFreeze(null)).toBeNull();
  });
});

describe("strict scalar and collection validators", () => {
  it("validates identifiers and rejects malformed variants", () => {
    expect(() => assertUuid(uuid(1), "id")).not.toThrow();
    expect(() => assertUuid("UPPER", "id")).toThrow(/UUID/);
    expect(() => assertSha256(sha("a"), "sha")).not.toThrow();
    expect(() => assertSha256("a".repeat(63), "sha")).toThrow(/SHA-256/);
    expect(() => assertSemver("1.2.3-rc.1", "version")).not.toThrow();
    expect(() => assertSemver("v1", "version")).toThrow(/semantic/);
    expect(() => assertSemver(`${"1".repeat(130)}.0.0`, "version")).toThrow(/bounded/);
    expect(() => assertSchemaVersion(1)).not.toThrow();
    expect(() => assertSchemaVersion(2)).toThrow(/equal 1/);
    expect(() => assertKey("valid.key-1", "key")).not.toThrow();
    expect(() => assertKey("Not Valid", "key")).toThrow(/stable lowercase/);
  });

  it("bounds and deduplicates text and key collections", () => {
    expect(() => assertText(" valid", "text")).toThrow(/trimmed/);
    expect(() => assertText("", "text")).toThrow(/non-blank/);
    expect(() => assertText("abcd", "text", 3)).toThrow(/up to 3/);
    expect(() => assertTexts([], "texts")).toThrow(/1..100/);
    expect(() => assertTexts(["a", "a"], "texts")).toThrow(/duplicates/);
    expect(() => assertTexts(["a"], "texts")).not.toThrow();
    expect(() => assertKeys([], "keys")).toThrow(/1..100/);
    expect(() => assertKeys(["a", "a"], "keys")).toThrow(/duplicates/);
    expect(() => assertKeys(["a", "b"], "keys")).not.toThrow();
  });

  it("requires canonical UTC instants and exact bounded decimals", () => {
    expect(() => assertIsoInstant("2024-02-29T00:00:00Z", "time")).not.toThrow();
    expect(() => assertIsoInstant("not-a-time", "time")).toThrow(/RFC 3339/);
    expect(() => assertIsoInstant("2024-02-30T00:00:00Z", "time")).toThrow(/RFC 3339/);
    expect(compareInstant("2024-01-01T00:00:00Z", "2024-01-02T00:00:00Z")).toBeLessThan(0);
    expect(() => assertDecimal("1.25", "decimal")).not.toThrow();
    for (const invalid of ["01", "-0", "1.0000000000001", "1.0", "x"]) {
      expect(() => assertDecimal(invalid, "decimal")).toThrow(/canonical exact decimal/);
    }
    expect(compareDecimal("-1", "0")).toBe(-1);
    expect(compareDecimal("1.2", "1.2")).toBe(0);
    expect(compareDecimal("2", "1.999")).toBe(1);
  });

  it("validates integers, enums, plain records, and exact object keys", () => {
    expect(() => assertInteger(2, "count", 1, 3)).not.toThrow();
    expect(() => assertInteger(0, "count", 1, 3)).toThrow(/between 1 and 3/);
    expect(() => assertInteger(1.5, "count")).toThrow(/integer/);
    expect(() => assertEnum("a", ["a", "b"] as const, "enum")).not.toThrow();
    expect(() => assertEnum("c", ["a", "b"] as const, "enum")).toThrow(/allowed/);
    expect(() => assertRecord({ a: 1 }, "record")).not.toThrow();
    expect(() => assertRecord(null, "record")).toThrow(/plain object/);
    expect(() => assertRecord([], "record")).toThrow(/plain object/);
    expect(() => assertRecord(new Map(), "record")).toThrow(/plain object/);
    expect(() => assertExactKeys({ a: 1, b: 2 }, ["b", "a"], "object")).not.toThrow();
    expect(() => assertExactKeys({ a: 1 }, ["a", "b"], "object")).toThrow(/exactly/);
    expect(() => unreachable("impossible" as never)).toThrow(/unsupported exhaustive/);
  });
});
