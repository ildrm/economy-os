import { describe, expect, it } from "vitest";

import {
  appendForecast,
  appendOutcomeScore,
  assertForecastLedgerIntegrity,
  type CrisisForecastInput,
  createCrisisForecast,
  createForecastLedger,
  type ForecastLedger,
  type ForecastOutcomeScore,
} from "./index.js";
import { digestJson } from "./internals.js";

const forecastInput: CrisisForecastInput = {
  schemaVersion: 1,
  forecastId: "058f47ac-19fc-7c92-ae91-0242ac120001",
  geographyId: "058f47ac-19fc-7c92-ae91-0242ac120002",
  hazard: "BANK",
  horizon: { key: "30d", days: 30 },
  generatedAt: "2026-01-01T01:00:00Z",
  asOf: "2026-01-01T00:00:00Z",
  rawProbability: "0.8",
  calibratedProbability: "0.75",
  uncertainty: {
    lowerProbability: "0.6",
    upperProbability: "0.85",
    confidenceLevel: "0.95",
    method: "blocked-bootstrap",
  },
  evidence: {
    items: [
      {
        evidenceId: "058f47ac-19fc-7c92-ae91-0242ac120003",
        indicatorKey: "bank.nonperforming-loans",
        direction: "increases_risk",
        valueAsKnown: "12",
        observedAt: "2025-12-01T00:00:00Z",
        availableAt: "2025-12-20T00:00:00Z",
        dataVintageId: "058f47ac-19fc-7c92-ae91-0242ac120004",
        evidenceSha256: "a".repeat(64),
      },
    ],
    absenceReason: null,
  },
  counterEvidence: { items: [], absenceReason: "No qualifying counter-evidence." },
  leadingIndicators: ["bank.nonperforming-loans"],
  provenance: {
    modelId: "058f47ac-19fc-7c92-ae91-0242ac120005",
    modelVersion: "1.0.0",
    dataVintageId: "058f47ac-19fc-7c92-ae91-0242ac120004",
    dataVintageSha256: "b".repeat(64),
    dataVintageAvailableAt: "2025-12-20T00:00:00Z",
    configurationSha256: "c".repeat(64),
    codeSha256: "d".repeat(64),
    trainingDataCutoff: "2025-06-01T00:00:00Z",
    calibratedThrough: "2025-09-01T00:00:00Z",
  },
  assumptions: ["Supervisory series remains comparable."],
  invalidationCriteria: [
    {
      criterionId: "npl-reversal",
      description: "NPLs fall below five percent.",
      indicatorKey: "bank.nonperforming-loans",
      operator: "less_than",
      threshold: "5",
      requiredObservations: 2,
    },
  ],
};

function resignScore(
  score: ForecastOutcomeScore,
  changes: Partial<Omit<ForecastOutcomeScore, "scoreSha256">>,
): ForecastOutcomeScore {
  const { scoreSha256: _ignored, ...original } = score;
  const body = { ...original, ...changes };
  return { ...body, scoreSha256: digestJson(body) };
}

function resignLedger(
  ledger: ForecastLedger,
  changes: Partial<Pick<ForecastLedger, "forecasts" | "outcomeScores">>,
): ForecastLedger {
  const body = {
    schemaVersion: 1 as const,
    forecasts: changes.forecasts ?? ledger.forecasts,
    outcomeScores: changes.outcomeScores ?? ledger.outcomeScores,
  };
  return { ...body, manifestSha256: digestJson(body) };
}

describe("immutable forecast ledger", () => {
  it("returns a new frozen ledger and leaves the prior ledger unchanged", () => {
    const empty = createForecastLedger();
    const forecast = createCrisisForecast(forecastInput);
    const appended = appendForecast(empty, forecast);
    expect(empty.forecasts).toEqual([]);
    expect(appended.forecasts).toEqual([forecast]);
    expect(Object.isFrozen(appended.forecasts)).toBe(true);
    expect(appended.manifestSha256).not.toBe(empty.manifestSha256);
    expect(() => appendForecast(appended, forecast)).toThrow("forecastId already exists");
  });

  it("appends deterministic Brier, log-loss, lead-time, and classification accounting", () => {
    const forecast = createCrisisForecast(forecastInput);
    const withForecast = appendForecast(createForecastLedger(), forecast);
    const scored = appendOutcomeScore(withForecast, {
      schemaVersion: 1,
      scoreId: "058f47ac-19fc-7c92-ae91-0242ac120010",
      forecastId: forecast.forecastId,
      observedAt: "2026-02-02T00:00:00Z",
      realizedOutcome: true,
      eventOccurredAt: "2026-01-11T01:00:00Z",
      classificationThreshold: "0.7",
      logLossEpsilon: "0.000000000001",
    });
    expect(scored.outcomeScores[0]).toMatchObject({
      brierScore: "0.0625",
      logLoss: "0.287682072452",
      calibrationResidual: "-0.25",
      leadTimeSeconds: 864_000,
      predictedPositive: true,
      directionAccurate: true,
      falsePositive: false,
      falseNegative: false,
    });
    expect(withForecast.outcomeScores).toEqual([]);
    const outcomeScore = scored.outcomeScores.at(0);
    expect(outcomeScore).toBeDefined();
    if (outcomeScore === undefined) return;
    expect(() => appendOutcomeScore(scored, outcomeScore)).toThrow(
      "forecast already has an outcome score",
    );
  });

  it("accounts for false positives and false negatives independently", () => {
    const high = createCrisisForecast(forecastInput);
    const low = createCrisisForecast({
      ...forecastInput,
      forecastId: "058f47ac-19fc-7c92-ae91-0242ac120011",
      calibratedProbability: "0.2",
      uncertainty: { ...forecastInput.uncertainty, lowerProbability: "0.1" },
    });
    let ledger = appendForecast(appendForecast(createForecastLedger(), high), low);
    ledger = appendOutcomeScore(ledger, {
      schemaVersion: 1,
      scoreId: "058f47ac-19fc-7c92-ae91-0242ac120012",
      forecastId: high.forecastId,
      observedAt: "2026-02-02T00:00:00Z",
      realizedOutcome: false,
      eventOccurredAt: null,
      classificationThreshold: "0.5",
      logLossEpsilon: "0.000000000001",
    });
    ledger = appendOutcomeScore(ledger, {
      schemaVersion: 1,
      scoreId: "058f47ac-19fc-7c92-ae91-0242ac120013",
      forecastId: low.forecastId,
      observedAt: "2026-02-02T00:00:00Z",
      realizedOutcome: true,
      eventOccurredAt: "2026-01-10T00:00:00Z",
      classificationThreshold: "0.5",
      logLossEpsilon: "0.000000000001",
    });
    expect(
      ledger.outcomeScores.map(({ falsePositive, falseNegative }) => [
        falsePositive,
        falseNegative,
      ]),
    ).toEqual([
      [true, false],
      [false, true],
    ]);
  });

  it("rejects outcomes before the horizon is observable and events outside the horizon", () => {
    const forecast = createCrisisForecast(forecastInput);
    const ledger = appendForecast(createForecastLedger(), forecast);
    const outcome = {
      schemaVersion: 1 as const,
      scoreId: "058f47ac-19fc-7c92-ae91-0242ac120014",
      forecastId: forecast.forecastId,
      observedAt: "2026-01-15T00:00:00Z",
      realizedOutcome: false,
      eventOccurredAt: null,
      classificationThreshold: "0.5",
      logLossEpsilon: "0.000000000001",
    };
    expect(() => appendOutcomeScore(ledger, outcome)).toThrow("horizon is observable");
    expect(() =>
      appendOutcomeScore(ledger, {
        ...outcome,
        observedAt: "2026-02-02T00:00:00Z",
        realizedOutcome: true,
        eventOccurredAt: "2026-03-01T00:00:00Z",
      }),
    ).toThrow("inside the forecast horizon");
  });

  it("rejects unknown, contradictory, duplicate, and pre-generation outcomes", () => {
    const high = createCrisisForecast(forecastInput);
    const low = createCrisisForecast({
      ...forecastInput,
      forecastId: "058f47ac-19fc-7c92-ae91-0242ac120011",
      calibratedProbability: "0.2",
      uncertainty: { ...forecastInput.uncertainty, lowerProbability: "0.1" },
    });
    const ledger = appendForecast(appendForecast(createForecastLedger(), high), low);
    const base = {
      schemaVersion: 1 as const,
      scoreId: "058f47ac-19fc-7c92-ae91-0242ac120020",
      forecastId: high.forecastId,
      observedAt: "2026-02-02T00:00:00Z",
      realizedOutcome: true,
      eventOccurredAt: "2026-01-10T00:00:00Z",
      classificationThreshold: "0.5",
      logLossEpsilon: "0.000000000001",
    };
    expect(() =>
      appendOutcomeScore(ledger, {
        ...base,
        forecastId: "058f47ac-19fc-7c92-ae91-0242ac129999",
      }),
    ).toThrow("unknown forecastId");
    expect(() => appendOutcomeScore(ledger, { ...base, eventOccurredAt: null })).toThrow(
      "present exactly when the outcome occurred",
    );
    expect(() => appendOutcomeScore(ledger, { ...base, logLossEpsilon: "0" })).toThrow(
      "greater than zero",
    );
    expect(() =>
      appendOutcomeScore(ledger, { ...base, eventOccurredAt: "2026-01-01T00:30:00Z" }),
    ).toThrow("cannot precede forecast generation");
    const once = appendOutcomeScore(ledger, base);
    expect(() =>
      appendOutcomeScore(once, {
        ...base,
        forecastId: low.forecastId,
        eventOccurredAt: "2026-01-10T00:00:00Z",
      }),
    ).toThrow("scoreId already exists");
  });

  it("semantically verifies recomputed score digests and forecast bindings after deserialization", () => {
    const forecast = createCrisisForecast(forecastInput);
    const ledger = appendOutcomeScore(appendForecast(createForecastLedger(), forecast), {
      schemaVersion: 1,
      scoreId: "058f47ac-19fc-7c92-ae91-0242ac120030",
      forecastId: forecast.forecastId,
      observedAt: "2026-02-02T00:00:00Z",
      realizedOutcome: true,
      eventOccurredAt: "2026-01-11T01:00:00Z",
      classificationThreshold: "0.7",
      logLossEpsilon: "0.000000000001",
    });
    const score = ledger.outcomeScores.at(0);
    expect(score).toBeDefined();
    if (score === undefined) return;

    const forgedDerived = resignScore(score, { brierScore: "0" });
    expect(() =>
      assertForecastLedgerIntegrity(resignLedger(ledger, { outcomeScores: [forgedDerived] })),
    ).toThrow("derived outcome fields do not match");

    const unknownBinding = resignScore(score, {
      forecastId: "058f47ac-19fc-7c92-ae91-0242ac129999",
    });
    expect(() =>
      assertForecastLedgerIntegrity(resignLedger(ledger, { outcomeScores: [unknownBinding] })),
    ).toThrow("unknown forecastId");

    expect(() =>
      assertForecastLedgerIntegrity(resignLedger(ledger, { forecasts: [forecast, forecast] })),
    ).toThrow("duplicate forecastId");

    expect(() =>
      assertForecastLedgerIntegrity(resignLedger(ledger, { outcomeScores: [score, score] })),
    ).toThrow("duplicate scoreId");

    const secondScore = resignScore(score, {
      scoreId: "058f47ac-19fc-7c92-ae91-0242ac120031",
    });
    expect(() =>
      assertForecastLedgerIntegrity(resignLedger(ledger, { outcomeScores: [score, secondScore] })),
    ).toThrow("more than one outcome score");

    const earlyObservation = resignScore(score, { observedAt: "2026-01-15T00:00:00Z" });
    expect(() =>
      assertForecastLedgerIntegrity(resignLedger(ledger, { outcomeScores: [earlyObservation] })),
    ).toThrow("before the forecast horizon is observable");
  });
});
