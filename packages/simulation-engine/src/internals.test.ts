import { describe, expect, it } from "vitest";
import { assertDecimal, canonicalDecimal } from "./internals.js";

describe("simulation canonical decimal output", () => {
  it.each([
    [1e-12, "0.000000000001"],
    [-1e-12, "-0.000000000001"],
    [1e-7, "0.0000001"],
    [0.1, "0.1"],
    [1_000_000_000, "1000000000"],
    [-0, "0"],
    [-1e-14, "0"],
  ])("keeps %s in the decimal contract as %s", (input, expected) => {
    const value = canonicalDecimal(input);
    expect(value).toBe(expected);
    expect(() => assertDecimal(value, "output")).not.toThrow();
  });
  it.each([NaN, Infinity, -Infinity, 1_000_000_001])("rejects unbounded %s", (input) => {
    expect(() => canonicalDecimal(input)).toThrow("finite numeric bound");
  });
});
