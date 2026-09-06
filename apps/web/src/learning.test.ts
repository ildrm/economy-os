import { describe, expect, it } from "vitest";
import { CONCEPTS, TOPICS } from "../app/[locale]/intelligence/_lib/concepts";
import { buildLabPresets } from "../app/[locale]/intelligence/_lib/lab-presets";
import { importCost, purchasingPower } from "../app/[locale]/intelligence/_lib/learning-math";

describe("educational economic calculations", () => {
  it("deflates purchasing power with compounding, rather than subtracting the inflation rate", () => {
    expect(purchasingPower(5, 1)).toBeCloseTo(95.238095238);
    expect(purchasingPower(10, 2)).toBeCloseTo(82.644628099);
    expect(purchasingPower(0, 10)).toBe(100);
    expect(purchasingPower(-5, 1)).toBeGreaterThan(100);
    expect(purchasingPower(5, 10, 5)).toBe(100);
  });
  it("uses the local-price currency quote and the imported share, not inverse depreciation", () => {
    expect(importCost(20, 100)).toBe(120);
    expect(importCost(20, 50)).toBeCloseTo(110);
    expect(importCost(20, 0)).toBe(100);
    expect(importCost(-20, 100)).toBe(80);
  });
  it("rejects nonfinite and out-of-domain assumptions", () => {
    expect(() => purchasingPower(Number.NaN, 1)).toThrow(RangeError);
    expect(() => purchasingPower(-100, 1)).toThrow(RangeError);
    expect(() => purchasingPower(5, 0)).toThrow(RangeError);
    expect(() => importCost(5, 101)).toThrow(RangeError);
  });
  it("preserves unknown supply and uses the existing allocation and behavioral engines", () => {
    const examples = buildLabPresets();
    expect(examples.supply[0]?.result).toMatchObject({
      status: "computed",
      supply: "130",
      uses: "110",
      surplus: "20",
      shortage: "0",
    });
    expect(examples.supply[1]?.result).toMatchObject({
      status: "computed",
      supply: "100",
      uses: "110",
      shortage: "10",
    });
    expect(examples.supply[2]?.result).toEqual({
      status: "missing",
      missingFields: ["production"],
    });
    expect(examples.choice.map((choice) => Number(choice.later))).toEqual([95, 76, 47.5]);
  });
  it("gives each published concept a unique identity, topic, explanation, measure and boundary in both languages", () => {
    expect(new Set(CONCEPTS.map((concept) => concept.id)).size).toBe(CONCEPTS.length);
    for (const concept of CONCEPTS) {
      expect(TOPICS.some((topic) => topic.id === concept.topic)).toBe(true);
      for (const pair of [concept.name, concept.explanation, concept.measure, concept.boundary]) {
        expect(pair.every((value) => value.trim().length > 0)).toBe(true);
        expect(pair[1]).toMatch(/[\u0600-\u06ff]/);
      }
    }
  });
});
