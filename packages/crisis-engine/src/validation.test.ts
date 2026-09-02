import { describe, expect, it } from "vitest";

import {
  appendForecast,
  appendOutcomeScore,
  assertChronologicalBacktest,
  type ChronologicalBacktest,
  type ChronologicalFold,
  type CrisisForecastInput,
  computeRareEventMetrics,
  computeReliabilityMetrics,
  createCrisisForecast,
  createForecastLedger,
  type ForecastLedger,
} from "./index.js";

const foldOne: ChronologicalFold = {
  foldId: "fold-1",
  training: { start: "2010-01-01T00:00:00Z", end: "2018-12-31T00:00:00Z" },
  calibration: { start: "2019-01-01T00:00:00Z", end: "2019-12-31T00:00:00Z" },
  test: { start: "2020-01-01T00:00:00Z", end: "2020-12-31T00:00:00Z" },
  featureEngineeringFitThrough: "2018-12-31T00:00:00Z",
  normalizationFitThrough: "2018-12-31T00:00:00Z",
  thresholdSelectionFitThrough: "2019-12-31T00:00:00Z",
  hyperparameterSelectionFitThrough: "2018-12-31T00:00:00Z",
  calibrationFitThrough: "2019-12-31T00:00:00Z",
};

const foldTwo: ChronologicalFold = {
  foldId: "fold-2",
  training: { start: "2010-01-01T00:00:00Z", end: "2019-12-31T00:00:00Z" },
  calibration: { start: "2020-01-01T00:00:00Z", end: "2020-12-31T00:00:00Z" },
  test: { start: "2021-01-01T00:00:00Z", end: "2021-12-31T00:00:00Z" },
  featureEngineeringFitThrough: "2019-12-31T00:00:00Z",
  normalizationFitThrough: "2019-12-31T00:00:00Z",
  thresholdSelectionFitThrough: "2020-12-31T00:00:00Z",
  hyperparameterSelectionFitThrough: "2019-12-31T00:00:00Z",
  calibrationFitThrough: "2020-12-31T00:00:00Z",
};

const plan: ChronologicalBacktest = {
  schemaVersion: 1,
  mode: "expanding_window",
  folds: [foldOne, foldTwo],
};

interface MetricCase {
  readonly probability: string;
  readonly realized: boolean;
}

const DEFAULT_METRIC_CASES: readonly MetricCase[] = [
  { probability: "0.1", realized: false },
  { probability: "0.2", realized: true },
  { probability: "0.8", realized: false },
  { probability: "0.9", realized: true },
];

function scoredLedger(cases: readonly MetricCase[] = DEFAULT_METRIC_CASES): ForecastLedger {
  let ledger = createForecastLedger();
  for (const [index, testCase] of cases.entries()) {
    const input: CrisisForecastInput = {
      schemaVersion: 1,
      forecastId: `058f47ac-19fc-7c92-ae91-${(index + 1).toString().padStart(12, "0")}`,
      geographyId: "058f47ac-19fc-7c92-ae91-0242ac120100",
      hazard: "FX",
      horizon: { key: "30d", days: 30 },
      generatedAt: "2026-01-01T01:00:00Z",
      asOf: "2026-01-01T00:00:00Z",
      rawProbability: testCase.probability,
      calibratedProbability: testCase.probability,
      uncertainty: {
        lowerProbability: "0",
        upperProbability: "1",
        confidenceLevel: "0.9",
        method: "fixture",
      },
      evidence: { items: [], absenceReason: "Synthetic metric fixture." },
      counterEvidence: { items: [], absenceReason: "Synthetic metric fixture." },
      leadingIndicators: ["fx.fixture"],
      provenance: {
        modelId: "058f47ac-19fc-7c92-ae91-0242ac120101",
        modelVersion: "1.0.0",
        dataVintageId: "058f47ac-19fc-7c92-ae91-0242ac120102",
        dataVintageSha256: "a".repeat(64),
        dataVintageAvailableAt: "2025-12-20T00:00:00Z",
        configurationSha256: "b".repeat(64),
        codeSha256: "c".repeat(64),
        trainingDataCutoff: "2025-01-01T00:00:00Z",
        calibratedThrough: "2025-06-01T00:00:00Z",
      },
      assumptions: ["Synthetic fixture only."],
      invalidationCriteria: [
        {
          criterionId: "fixture",
          description: "Fixture changes.",
          indicatorKey: "fx.fixture",
          operator: "greater_than",
          threshold: "1",
          requiredObservations: 1,
        },
      ],
    };
    ledger = appendForecast(ledger, createCrisisForecast(input));
  }
  for (const [index, testCase] of cases.entries()) {
    ledger = appendOutcomeScore(ledger, {
      schemaVersion: 1,
      scoreId: `058f47ac-19fc-7c92-ae91-${(index + 10).toString().padStart(12, "0")}`,
      forecastId: `058f47ac-19fc-7c92-ae91-${(index + 1).toString().padStart(12, "0")}`,
      observedAt: "2026-02-02T00:00:00Z",
      realizedOutcome: testCase.realized,
      eventOccurredAt: testCase.realized ? "2026-01-11T01:00:00Z" : null,
      classificationThreshold: "0.5",
      logLossEpsilon: "0.000000000001",
    });
  }
  return ledger;
}

describe("chronological validation and calibration", () => {
  it("accepts expanding chronological folds and rejects look-ahead fit leakage", () => {
    expect(assertChronologicalBacktest(plan).folds).toHaveLength(2);
    expect(() =>
      assertChronologicalBacktest({
        ...plan,
        folds: [{ ...foldOne, normalizationFitThrough: "2020-02-01T00:00:00Z" }],
      }),
    ).toThrow("normalizationFitThrough leaks into the test period");
  });

  it("rejects random, overlapping, and non-expanding temporal splits", () => {
    expect(() =>
      assertChronologicalBacktest({ ...plan, mode: "random" as "rolling_window" }),
    ).toThrow("mode must be expanding_window or rolling_window");
    expect(() =>
      assertChronologicalBacktest({
        ...plan,
        folds: [
          foldOne,
          {
            ...foldTwo,
            training: { ...foldTwo.training, start: "2011-01-01T00:00:00Z" },
          },
        ],
      }),
    ).toThrow("expanding-window folds must preserve the training start");
  });

  it("rejects empty, overlapping, and incorrectly fitted chronological folds", () => {
    expect(() => assertChronologicalBacktest({ ...plan, folds: [] })).toThrow(
      "requires at least one fold",
    );
    expect(() =>
      assertChronologicalBacktest({
        ...plan,
        folds: [
          {
            ...foldOne,
            training: { start: foldOne.training.end, end: foldOne.training.end },
          },
        ],
      }),
    ).toThrow("start before its end");
    expect(() =>
      assertChronologicalBacktest({
        ...plan,
        folds: [
          {
            ...foldOne,
            calibration: { ...foldOne.calibration, start: foldOne.training.end },
          },
        ],
      }),
    ).toThrow("training and calibration periods must be strictly chronological");
    expect(() =>
      assertChronologicalBacktest({
        ...plan,
        folds: [
          {
            ...foldOne,
            normalizationFitThrough: "2019-06-01T00:00:00Z",
          },
        ],
      }),
    ).toThrow("normalizationFitThrough must be fitted inside the training period");
    expect(() =>
      assertChronologicalBacktest({
        ...plan,
        folds: [
          {
            ...foldOne,
            thresholdSelectionFitThrough: "2020-01-01T00:00:00Z",
            test: { ...foldOne.test, start: "2020-02-01T00:00:00Z" },
          },
        ],
      }),
    ).toThrow("thresholdSelectionFitThrough must be fitted inside the calibration period");
    expect(() =>
      assertChronologicalBacktest({
        ...plan,
        folds: [
          foldOne,
          {
            ...foldTwo,
            calibration: { start: "2020-01-01T00:00:00Z", end: "2020-06-30T00:00:00Z" },
            thresholdSelectionFitThrough: "2020-06-30T00:00:00Z",
            calibrationFitThrough: "2020-06-30T00:00:00Z",
            test: { ...foldTwo.test, start: "2020-07-01T00:00:00Z" },
          },
        ],
      }),
    ).toThrow("test folds must be ordered and non-overlapping");
  });

  it("computes reliability bins without mixing independent hazards", () => {
    const metrics = computeReliabilityMetrics(scoredLedger(), "FX", ["0", "0.5", "1"]);
    expect(metrics).toMatchObject({
      hazard: "FX",
      sampleSize: 4,
      averageBrierScore: "0.325",
      averageLogLoss: "0.857399214046",
      expectedCalibrationError: "0.35",
      maximumCalibrationError: "0.35",
    });
    expect(
      metrics.bins.map((bin) => ({ count: bin.count, observedFrequency: bin.observedFrequency })),
    ).toEqual([
      { count: 2, observedFrequency: "0.5" },
      { count: 2, observedFrequency: "0.5" },
    ]);
    expect(() => computeReliabilityMetrics(scoredLedger(), "BANK", ["0", "1"])).toThrow(
      "no scored forecasts for hazard BANK",
    );
    expect(
      computeReliabilityMetrics(scoredLedger(), "FX", ["0", "0.05", "1"]).bins[0],
    ).toMatchObject({
      count: 0,
      observedFrequency: null,
      calibrationGap: null,
    });
    expect(() => computeReliabilityMetrics(scoredLedger(), "FX", ["0"])).toThrow(
      "at least two edges",
    );
    expect(() => computeReliabilityMetrics(scoredLedger(), "FX", ["0.1", "1"])).toThrow(
      "span exactly zero to one",
    );
    expect(() => computeReliabilityMetrics(scoredLedger(), "FX", ["0", "0.5", "0.5", "1"])).toThrow(
      "strictly increasing",
    );
  });

  it("rejects calibration metrics computed from a tampered forecast ledger", () => {
    const ledger = scoredLedger();
    const first = ledger.forecasts.at(0);
    expect(first).toBeDefined();
    if (first === undefined) return;
    const forged = {
      ...ledger,
      forecasts: [{ ...first, leadingIndicators: ["fx.forged"] }, ...ledger.forecasts.slice(1)],
    };
    expect(() => computeReliabilityMetrics(forged, "FX", ["0", "1"])).toThrow(
      "forecast manifest digest does not match",
    );
  });

  it("computes hazard-specific rare-event validation metrics", () => {
    const metrics = computeRareEventMetrics(scoredLedger(), "FX", {
      operationalThreshold: "0.5",
      fixedFalsePositiveRate: "0.5",
    });
    expect(metrics).toMatchObject({
      hazard: "FX",
      sampleSize: 4,
      eventCount: 2,
      averagePrecision: "0.833333333333",
      prAuc: "0.791666666667",
      falseAlertRate: "0.5",
      missedEventRate: "0.5",
      fixedFprRecall: "1",
      operationalPrecision: "0.5",
      operationalRecall: "0.5",
      meanTruePositiveLeadTimeSeconds: 864_000,
      medianTruePositiveLeadTimeSeconds: 864_000,
    });
  });

  it("groups equal-probability thresholds so AP and PR-AUC are permutation invariant", () => {
    const positiveFirst = computeRareEventMetrics(
      scoredLedger([
        { probability: "0.9", realized: true },
        { probability: "0.9", realized: false },
        { probability: "0.2", realized: true },
        { probability: "0.1", realized: false },
      ]),
      "FX",
      { operationalThreshold: "0.5", fixedFalsePositiveRate: "0.5" },
    );
    const negativeFirst = computeRareEventMetrics(
      scoredLedger([
        { probability: "0.9", realized: false },
        { probability: "0.9", realized: true },
        { probability: "0.2", realized: true },
        { probability: "0.1", realized: false },
      ]),
      "FX",
      { operationalThreshold: "0.5", fixedFalsePositiveRate: "0.5" },
    );
    expect({
      averagePrecision: positiveFirst.averagePrecision,
      prAuc: positiveFirst.prAuc,
      fixedFprRecall: positiveFirst.fixedFprRecall,
    }).toEqual({
      averagePrecision: "0.583333333333",
      prAuc: "0.666666666667",
      fixedFprRecall: "1",
    });
    expect(negativeFirst.averagePrecision).toBe(positiveFirst.averagePrecision);
    expect(negativeFirst.prAuc).toBe(positiveFirst.prAuc);
    expect(negativeFirst.fixedFprRecall).toBe(positiveFirst.fixedFprRecall);
  });
});
