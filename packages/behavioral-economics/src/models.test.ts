import { describe, expect, it } from "vitest";
import { parameters } from "./fixtures.test-helper.js";
import {
  cumulativeProspectValue,
  dispositionEffect,
  expectedValue,
  inequalityAversionUtility,
  logitChoiceProbabilities,
  prospectValue,
  quasiHyperbolicUtility,
  selectSatisficingChoice,
  weightProbabilityPrelec,
} from "./models.js";

describe("behavioral scientific kernels", () => {
  it("reduces cumulative prospect theory to expected value under identity parameters across mixed outcomes", () => {
    const values = [
      { value: "100", probability: "0.2" },
      { value: "-50", probability: "0.3" },
      { value: "10", probability: "0.5" },
    ];
    expect(cumulativeProspectValue(values, parameters)).toBe("10");
    expect(expectedValue(values)).toBe("10");
    expect(cumulativeProspectValue([...values].reverse(), parameters)).toBe("10");
    expect(cumulativeProspectValue(values, { ...parameters, lossAversion: "2" })).toBe("-5");
  });
  it("preserves sub-micro reference transitions near billion-unit balances", () => {
    const p = { ...parameters, referencePoint: "1000000000" };
    expect(prospectValue("1000000000.000001", p)).toBe("0.000001");
    expect(prospectValue("1000000000.000000000001", p)).toBe("0.000000000001");
    expect(prospectValue("999999999.999999999999", { ...p, lossAversion: "2" })).toBe(
      "-0.000000000002",
    );
    expect(prospectValue("1000000000", p)).toBe("0");
    expect(expectedValue([{ value: "1000000000.000000000001", probability: "1" }])).toBe(
      "1000000000.000000000001",
    );
    expect(
      expectedValue([
        { value: "-0.000000000001", probability: "0.1" },
        { value: "0", probability: "0.9" },
      ]),
    ).toBe("0");
  });
  it("has monotonic bounded weighting and expected special cases", () => {
    for (const alpha of ["0.2", "0.5", "1"]) {
      let previous = 0;
      for (let i = 0; i <= 100; i++) {
        const result = Number(weightProbabilityPrelec((i / 100).toFixed(2), alpha));
        expect(result).toBeGreaterThanOrEqual(previous);
        expect(result).toBeLessThanOrEqual(1);
        previous = result;
      }
      expect(weightProbabilityPrelec("0", alpha)).toBe("0");
      expect(weightProbabilityPrelec("1", alpha)).toBe("1");
    }
    expect(weightProbabilityPrelec("0.2", "1")).toBe("0.2");
    expect(Number(prospectValue("4", { ...parameters, gainCurvature: "0.5" }))).toBe(2);
  });
  it("uses cumulative weights rather than independently transformed probabilities and respects coalescing", () => {
    const p = { ...parameters, gainWeighting: "0.5" };
    const result = Number(
      cumulativeProspectValue(
        [
          { value: "100", probability: "0.5" },
          { value: "50", probability: "0.5" },
        ],
        p,
      ),
    );
    expect(result).toBeCloseTo(50 + 50 * Number(weightProbabilityPrelec("0.5", "0.5")), 9);
    expect(
      cumulativeProspectValue(
        [
          { value: "10", probability: "0.5" },
          { value: "10", probability: "0.5" },
        ],
        p,
      ),
    ).toBe("10");
  });
  it("rejects invalid parameters, unknown risk, excess mass and malformed numeric boundaries", () => {
    for (const input of ["NaN", "Infinity", "1e3", " 1", "0.1234567890123"])
      expect(() => prospectValue(input, parameters)).toThrow(TypeError);
    for (const field of [
      "gainCurvature",
      "lossCurvature",
      "lossAversion",
      "gainWeighting",
      "lossWeighting",
    ])
      expect(() => prospectValue("1", { ...parameters, [field]: "0" })).toThrow(TypeError);
    expect(() => weightProbabilityPrelec("0.5", "0")).toThrow();
    expect(() => weightProbabilityPrelec("1.1", "1")).toThrow();
    expect(() => expectedValue([{ value: "1", probability: "0.999999999999" }])).toThrow(/exactly/);
    expect(() => expectedValue([{ value: "1", probability: "1.000000000001" }])).toThrow();
    expect(() => expectedValue([])).toThrow();
  });
  it("collapses beta=1 to exponential discounting and excludes future utility at beta=0", () => {
    expect(quasiHyperbolicUtility(["10", "10", "10"], "1", "0.5")).toBe("17.5");
    expect(quasiHyperbolicUtility(["10", "10", "10"], "0", "0.5")).toBe("10");
    expect(quasiHyperbolicUtility(["10", "10", "10"], "0.5", "0.5")).toBe("13.75");
    expect(() => quasiHyperbolicUtility([], "1", "1")).toThrow();
    expect(() => quasiHyperbolicUtility(["1"], "1.1", "1")).toThrow();
  });
  it("enforces Fehr-Schmidt restrictions and rational/equality benchmarks", () => {
    expect(inequalityAversionUtility(["10", "20"], 0, "1", "0.5")).toBe("0");
    expect(inequalityAversionUtility(["20", "10"], 0, "1", "0.5")).toBe("15");
    expect(inequalityAversionUtility(["10", "10", "10"], 1, "2", "0.5")).toBe("10");
    expect(inequalityAversionUtility(["10", "20"], 0, "0", "0")).toBe("10");
    expect(() => inequalityAversionUtility(["1", "2"], 0, "0", "0.5")).toThrow();
    expect(() => inequalityAversionUtility(["1", "2"], 0, "2", "1")).toThrow();
    expect(() => inequalityAversionUtility(["1"], 0, "2", "0")).toThrow();
  });
  it("respects explicit search order, budget and unmet aspiration instead of silently maximizing", () => {
    expect(selectSatisficingChoice(["2", "5", "10"], "4", 3)).toEqual({
      selectedIndex: 1,
      inspected: 2,
      status: "satisfied",
    });
    expect(selectSatisficingChoice(["2", "5", "10"], "9", 2)).toEqual({
      selectedIndex: null,
      inspected: 2,
      status: "aspiration_not_met",
    });
    expect(() => selectSatisficingChoice(["2"], "1", 2)).toThrow();
    expect(selectSatisficingChoice(["1000000000"], "1000000000.000000000001", 1).status).toBe(
      "aspiration_not_met",
    );
  });
  it("stabilizes logit probabilities for extreme utilities and uniform zero precision", () => {
    expect(logitChoiceProbabilities(["1", "999999999999"], "1000")).toEqual(["0", "1"]);
    expect(logitChoiceProbabilities(["1", "2"], "0")).toEqual(["0.5", "0.5"]);
    expect(() => logitChoiceProbabilities(["1"], "-1")).toThrow();
  });
  it("measures opportunity-adjusted disposition rates without equating absent opportunities with zero", () => {
    expect(
      dispositionEffect({ realizedGains: 2, paperGains: 2, realizedLosses: 1, paperLosses: 3 }),
    ).toMatchObject({
      gainRealizationRate: "0.5",
      lossRealizationRate: "0.25",
      difference: "0.25",
    });
    expect(
      dispositionEffect({ realizedGains: 0, paperGains: 0, realizedLosses: 0, paperLosses: 0 }),
    ).toMatchObject({ difference: null, missingReason: "no_opportunities" });
    expect(
      dispositionEffect({ realizedGains: 0, paperGains: 0, realizedLosses: 0, paperLosses: 2 })
        .missingReason,
    ).toBe("no_gain_opportunities");
    expect(
      dispositionEffect({ realizedGains: 0, paperGains: 2, realizedLosses: 0, paperLosses: 0 })
        .missingReason,
    ).toBe("no_loss_opportunities");
    expect(() =>
      dispositionEffect({ realizedGains: -1, paperGains: 0, realizedLosses: 0, paperLosses: 0 }),
    ).toThrow();
  });
});
