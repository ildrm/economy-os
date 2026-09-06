import { describe, expect, it } from "vitest";
import {
  allocationConcentration,
  consecutiveAnnualChange,
  runDecisionScenario,
  SCENARIO_FAMILIES,
} from "./decision-support.js";

describe("decision support calculations", () => {
  it("requires adjacent annual observations and preserves rate differences as percentage points", () => {
    expect(
      consecutiveAnnualChange([
        [2022, "8.5"],
        [2023, "6.2"],
        [2024, "3.1"],
      ]),
    ).toMatchObject({
      availability: "available",
      from: 2023,
      to: 2024,
      difference: -3.1,
      direction: "decreased",
    });
    expect(
      consecutiveAnnualChange([
        [2022, "8.5"],
        [2023, null],
        [2024, "3.1"],
      ]),
    ).toEqual({ availability: "unavailable", reason: "no_consecutive_years", difference: null });
    expect(() =>
      consecutiveAnnualChange([
        [2023, "4"],
        [2022, "3"],
      ]),
    ).toThrow();
    expect(() => consecutiveAnnualChange([[2023, "NaN"]])).toThrow();
    expect(consecutiveAnnualChange([]).availability).toBe("unavailable");
  });
  it("uses reciprocal purchasing power and distinguishes a price rise from a loss of currency value", () => {
    const result = runDecisionScenario("inflation", "household", "moderate");
    expect(result.results.costIndex).toBe(105);
    expect(result.results.purchasingPowerIndex).toBeCloseTo(100 / 1.05);
    const fx = runDecisionScenario("currency", "business", "moderate");
    expect(fx.results.costIndex).toBe(104);
    expect(fx.assumptions[0]?.change).toBe(0.1);
  });
  it("calculates debt expense and first-order bond sensitivity in different units", () => {
    const result = runDecisionScenario("rates", "investor", "moderate");
    expect(result.results.extraAnnualInterestPer100Debt).toBeCloseTo(0.2);
    expect(result.results.assetValueIndex).toBe(98);
    expect(result.limitations).toContain("first_order_duration");
  });
  it("executes all presets as assumptions, with no probability or synthetic observation", () => {
    for (const family of SCENARIO_FAMILIES)
      for (const audience of ["household", "business", "investor"] as const)
        for (const severity of ["mild", "moderate", "severe"] as const) {
          const result = runDecisionScenario(family, audience, severity);
          expect(result.evidenceType).toBe("scenario");
          expect(result.assumptions.length).toBeGreaterThan(0);
          expect(Object.values(result.results).every(Number.isFinite)).toBe(true);
        }
  });
  it("reports concentration independently from pricing coverage", () => {
    const common = { currency: "EUR", issuer: null, country: null, sector: null };
    const result = allocationConcentration([
      { ...common, instrumentId: "one", weight: 0.5, priceAvailable: true },
      { ...common, instrumentId: "two", weight: 0.5, priceAvailable: false },
    ]);
    expect(result.concentrationIndex).toBe(0.5);
    expect(result.effectiveHoldings).toBe(2);
    expect(result.pricedWeight).toBe(0.5);
    expect(result.unpricedHoldings).toEqual(["two"]);
    expect(result.currency).toEqual([{ name: "EUR", weight: 1 }]);
    expect(() => allocationConcentration([])).toThrow();
    expect(() =>
      allocationConcentration([
        { ...common, instrumentId: "one", weight: 0.9, priceAvailable: true },
      ]),
    ).toThrow();
  });
});
