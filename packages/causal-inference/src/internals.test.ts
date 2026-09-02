import { describe, expect, it } from "vitest";
import {
  assertDecimal,
  assertEnum,
  assertExactKeys,
  assertInteger,
  assertIsoInstant,
  assertKey,
  assertPositiveDecimal,
  assertProbability,
  assertRecord,
  assertSemver,
  assertSha256,
  assertSorted,
  assertText,
  assertUniqueStrings,
  assertUuid,
  canonicalJson,
  cloneCanonical,
  compareDecimal,
  compareInstant,
  deepFreeze,
  digestJson,
  expectArray,
  expectBoolean,
  expectInteger,
  expectNullableString,
  expectString,
  sortedUnique,
} from "./internals.js";

describe("canonical governance primitives", () => {
  it("canonicalizes supported JSON and deeply freezes clones", () => {
    expect(canonicalJson({ z: [null, true, "x", -0], a: 2 })).toBe('{"a":2,"z":[null,true,"x",0]}');
    expect(cloneCanonical({ b: 2, a: 1 })).toEqual({ a: 1, b: 2 });
    expect(digestJson({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
    const frozen = deepFreeze({ nested: { value: 1 } });
    expect(Object.isFrozen(frozen.nested)).toBe(true);
  });

  it.each([
    ["non-exact number", { value: 1.2 }],
    ["undefined", { value: undefined }],
    ["non-plain object", { value: new Date("2025-01-01T00:00:00Z") }],
  ])("rejects canonical JSON with %s", (_label, value) => {
    expect(() => canonicalJson(value)).toThrow(TypeError);
  });

  it("rejects cyclic JSON", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow(/cycle/);
  });

  it("validates runtime shapes and scalar expectations", () => {
    expect(() => assertRecord(null, "record")).toThrow(/object/);
    expect(() => assertRecord([], "record")).toThrow(/object/);
    expect(() => assertExactKeys({ a: 1 }, ["b"], "keys")).toThrow(/exactly/);
    expect(expectString("x", "text")).toBe("x");
    expect(() => expectString(1, "text")).toThrow(/string/);
    expect(expectInteger(2, "integer", 1, 3)).toBe(2);
    expect(() => expectInteger("2", "integer")).toThrow(/integer/);
    expect(expectArray([], "array")).toEqual([]);
    expect(() => expectArray({}, "array")).toThrow(/array/);
    expect(() => expectArray(new Array(10_001), "array")).toThrow(/resource bound/);
    expect(expectNullableString(null, "nullable")).toBeNull();
    expect(expectNullableString("x", "nullable")).toBe("x");
    expect(expectBoolean(true, "boolean")).toBe(true);
    expect(() => expectBoolean("true", "boolean")).toThrow(/boolean/);
  });

  it.each([
    ["uuid", () => assertUuid("BAD", "uuid")],
    ["sha", () => assertSha256("abc", "sha")],
    ["semver", () => assertSemver("01.0.0", "semver")],
    ["key", () => assertKey("Bad key", "key")],
    ["blank text", () => assertText(" ", "text")],
    ["trimmed text", () => assertText(" x", "text")],
    ["long text", () => assertText("xx", "text", 1)],
    ["bad instant", () => assertIsoInstant("2025-02-30T00:00:00Z", "instant")],
    ["offset instant", () => assertIsoInstant("2025-01-01T00:00:00+00:00", "instant")],
    ["small integer", () => assertInteger(0, "integer", 1, 2)],
    ["large integer", () => assertInteger(3, "integer", 1, 2)],
    ["fractional integer", () => assertInteger(1.5, "integer", 1, 2)],
  ])("rejects invalid %s", (_label, check) => {
    expect(check).toThrow(TypeError);
  });

  it("compares exact times and decimals without floating point", () => {
    assertIsoInstant("2025-01-01T00:00:00.1Z", "instant");
    expect(compareInstant("2025-01-02T00:00:00Z", "2025-01-01T00:00:00Z")).toBeGreaterThan(0);
    expect(compareDecimal("-0.1", "0")).toBe(-1);
    expect(compareDecimal("1.000000000001", "1")).toBe(1);
    expect(compareDecimal("1.1", "1.1")).toBe(0);
  });

  it.each([
    ["leading zero", () => assertDecimal("01", "decimal")],
    ["negative zero", () => assertDecimal("-0", "decimal")],
    ["too much precision", () => assertDecimal("0.1234567890123", "decimal")],
    ["excessive magnitude text", () => assertDecimal("1".repeat(129), "decimal")],
    ["negative forbidden", () => assertDecimal("-1", "decimal", false)],
    ["bad probability", () => assertProbability("1.1", "probability")],
    ["probability precision", () => assertProbability("0.1234567890123", "probability")],
    ["nonpositive", () => assertPositiveDecimal("0", "positive")],
  ])("rejects %s exact numeric input", (_label, check) => {
    expect(check).toThrow(TypeError);
  });

  it("validates enums, uniqueness, and deterministic ordering", () => {
    const allowed = ["a", "b"] as const;
    const value = "a";
    assertEnum(value, allowed, "enum");
    expect(value).toBe("a");
    expect(() => assertEnum("c", allowed, "enum")).toThrow(/allowed/);
    expect(() => assertUniqueStrings([], "keys")).toThrow(/empty/);
    expect(() => assertUniqueStrings(["a", "a"], "keys")).toThrow(/unique/);
    assertUniqueStrings([], "keys", assertKey, true);
    expect(sortedUnique(["b", "a"], "keys")).toEqual(["a", "b"]);
    assertSorted(["a", "b"], "keys");
    expect(() => assertSorted(["b", "a"], "keys")).toThrow(/ascending/);
    expect(() => assertSorted(["a", "a"], "keys")).toThrow(/ascending/);
  });
});
