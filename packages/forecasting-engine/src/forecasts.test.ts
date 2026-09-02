import { describe, expect, it } from "vitest";
import {
  appendForecast,
  assertContinuousNowcastScoreIntegrity,
  assertForecastLedgerIntegrity,
  assertForecastScoreIntegrity,
  assertOperationalActionAllowed,
  assertProbabilisticForecastIntegrity,
  createContinuousForecastOutcome,
  createForecastLedger,
  createForecastOutcome,
  createProbabilisticForecast,
  type ProbabilisticForecastInput,
  type SeparatedForecastUncertainty,
  scoreBinaryForecast,
  scoreContinuousNowcast,
  type UncertaintyAssessment,
} from "./forecasts.js";

const id = (suffix: number) => `00000000-0000-8000-8000-${suffix.toString().padStart(12, "0")}`;
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[K] extends object
      ? Mutable<T[K]>
      : T[K];
};

function mutable<T>(value: T): Mutable<T> {
  return structuredClone(value) as Mutable<T>;
}

function qualitative(explanation: string): UncertaintyAssessment {
  return { status: "qualitative", lower: null, upper: null, method: null, explanation };
}

function uncertainty(task: ProbabilisticForecastInput["task"]): SeparatedForecastUncertainty {
  const quantified: UncertaintyAssessment = {
    status: "quantified",
    lower: task === "binary_event_probability" ? "0.15" : "8",
    upper: task === "binary_event_probability" ? "0.35" : "14",
    method: "chronological bootstrap over held-out folds",
    explanation: "Sampling variation under the frozen validation design.",
  };
  return {
    parameterModel: quantified,
    calibration: task === "binary_event_probability" ? quantified : qualitative("Not applicable."),
    dataRevisionMeasurement: qualitative("Official releases can be revised."),
    inputSourceDisagreement: qualitative("Source disagreement is retained by feature lineage."),
    scenarioStructuralAssumption: qualitative("No intervention scenario is represented."),
    ensembleDisagreement: {
      status: "not_available",
      lower: null,
      upper: null,
      method: null,
      explanation: "This artifact is not an ensemble.",
    },
    labelOnsetAmbiguity: qualitative("Onset timing follows the frozen target definition."),
  };
}

function binaryForecastInput(
  role: "champion" | "shadow_challenger" = "champion",
): ProbabilisticForecastInput {
  return {
    schemaVersion: 1,
    forecastId: id(role === "champion" ? 1 : 2),
    runId: id(3),
    issuedAt: "2025-01-10T01:00:00Z",
    asOf: "2025-01-10T00:00:00Z",
    geographyKey: "irn",
    regimeKey: "high_inflation",
    task: "binary_event_probability",
    targetDefinitionId: id(4),
    targetDefinitionSha256: A,
    horizonDays: 90,
    evaluationWindow: { start: "2025-01-11T00:00:00Z", end: "2025-04-10T00:00:00Z" },
    model: {
      modelId: id(5),
      modelVersion: "1.2.0",
      artifactSha256: A,
      configurationSha256: B,
      codeSha256: C,
      role,
      lifecycleStatus: "production",
      deploymentApprovalId: id(6),
    },
    featureSnapshotId: id(7),
    featureSnapshotSha256: B,
    featureSnapshotAsOf: "2025-01-10T00:00:00Z",
    outputSemantics: "calibrated_probability",
    value: "0.25",
    calibrationGate: {
      status: "passed",
      languagePermitted: true,
      reportSha256: C,
      calibratedThrough: "2025-01-01T00:00:00Z",
      sampleSize: 1_000,
      eventCount: 100,
    },
    uncertainty: uncertainty("binary_event_probability"),
    domainAssessment: {
      status: "in_domain",
      method: "robust Mahalanobis distance on training-fold features",
      distance: "0.4",
      threshold: "1",
      drivers: ["inflation.rate"],
      requiredAction: "allow",
    },
    limitations: ["Performance may degrade under previously unseen policy regimes."],
    prohibitedUses: ["Do not use as financial, legal, or autonomous policy advice."],
    operationalActionPermission: role === "champion" ? "eligible" : "prohibited",
  };
}

function nowcastInput(): ProbabilisticForecastInput {
  const input = binaryForecastInput();
  return {
    ...input,
    forecastId: id(8),
    task: "continuous_nowcast",
    horizonDays: 0,
    outputSemantics: "continuous_nowcast",
    value: "11.2",
    model: {
      ...input.model,
      lifecycleStatus: "research",
      deploymentApprovalId: null,
    },
    calibrationGate: {
      status: "not_applicable",
      languagePermitted: false,
      reportSha256: null,
      calibratedThrough: null,
      sampleSize: 1_000,
      eventCount: 0,
    },
    uncertainty: uncertainty("continuous_nowcast"),
    operationalActionPermission: "prohibited",
  };
}

describe("immutable forecast manifests and append-only ledger", () => {
  it("creates a governed champion forecast eligible for explicitly approved actions", () => {
    const forecast = createProbabilisticForecast(binaryForecastInput());
    expect(forecast.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(forecast.uncertainty.parameterModel)).toBe(true);
    assertProbabilisticForecastIntegrity(forecast);
    expect(() => assertOperationalActionAllowed(forecast)).not.toThrow();
  });

  it("allows continuous nowcast semantics without false probability calibration claims", () => {
    const nowcast = createProbabilisticForecast(nowcastInput());
    expect(nowcast.outputSemantics).toBe("continuous_nowcast");
    expect(nowcast.calibrationGate.status).toBe("not_applicable");
    expect(() => assertOperationalActionAllowed(nowcast)).toThrow(/not approved/);
  });

  it("categorically prevents shadow challengers from triggering operational actions", () => {
    const shadow = createProbabilisticForecast(binaryForecastInput("shadow_challenger"));
    expect(shadow.operationalActionPermission).toBe("prohibited");
    expect(() => assertOperationalActionAllowed(shadow)).toThrow(/categorically barred/);
  });

  it("returns new digest-linked ledger versions and rejects replacement by duplicate ID", () => {
    const initial = createForecastLedger(id(20));
    const forecast = createProbabilisticForecast(binaryForecastInput());
    const appended = appendForecast(initial, forecast);
    expect(initial.forecasts).toHaveLength(0);
    expect(appended).toMatchObject({
      sequence: 1,
      previousLedgerSha256: initial.manifestSha256,
    });
    assertForecastLedgerIntegrity(appended);
    expect(() => appendForecast(appended, forecast)).toThrow(/duplicate/);

    const tampered = mutable(appended);
    tampered.sequence = 2;
    expect(() => assertForecastLedgerIntegrity(tampered)).toThrow(/append count/);
  });

  it.each([
    [
      "future feature snapshot",
      (input: Mutable<ProbabilisticForecastInput>) =>
        (input.featureSnapshotAsOf = "2025-02-01T00:00:00Z"),
    ],
    [
      "issued before as-of",
      (input: Mutable<ProbabilisticForecastInput>) => (input.issuedAt = "2025-01-01T00:00:00Z"),
    ],
    ["missing numeric value", (input: Mutable<ProbabilisticForecastInput>) => (input.value = null)],
    [
      "failed calibration language",
      (input: Mutable<ProbabilisticForecastInput>) => (input.calibrationGate.status = "failed"),
    ],
    [
      "future calibration",
      (input: Mutable<ProbabilisticForecastInput>) =>
        (input.calibrationGate.calibratedThrough = "2025-02-01T00:00:00Z"),
    ],
    [
      "event-free passed calibration",
      (input: Mutable<ProbabilisticForecastInput>) => (input.calibrationGate.eventCount = 0),
    ],
    [
      "out-of-domain calibrated language",
      (input: Mutable<ProbabilisticForecastInput>) => {
        input.domainAssessment.status = "out_of_domain";
        input.domainAssessment.requiredAction = "restrict";
      },
    ],
    [
      "incorrect action permission",
      (input: Mutable<ProbabilisticForecastInput>) =>
        (input.operationalActionPermission = "prohibited"),
    ],
    [
      "mixed value and insufficient evidence",
      (input: Mutable<ProbabilisticForecastInput>) =>
        (input.outputSemantics = "insufficient_evidence"),
    ],
  ])("rejects %s", (_label, mutate) => {
    const input = mutable(binaryForecastInput());
    mutate(input);
    expect(() => createProbabilisticForecast(input)).toThrow(TypeError);
  });

  it("rejects malformed separated uncertainty and inconsistent domain diagnostics", () => {
    const bounds = mutable(binaryForecastInput());
    bounds.uncertainty.parameterModel.lower = "0.8";
    expect(() => createProbabilisticForecast(bounds)).toThrow(/lower bound/);

    const missesPoint = mutable(binaryForecastInput());
    missesPoint.uncertainty.parameterModel.upper = "0.2";
    expect(() => createProbabilisticForecast(missesPoint)).toThrow(/contain the point/);

    const qualitativeBounds = mutable(binaryForecastInput());
    qualitativeBounds.uncertainty.dataRevisionMeasurement.lower = "0.1";
    expect(() => createProbabilisticForecast(qualitativeBounds)).toThrow(/non-quantified/);

    const partialDomain = mutable(binaryForecastInput());
    partialDomain.domainAssessment.threshold = null;
    expect(() => createProbabilisticForecast(partialDomain)).toThrow(/supplied together/);
  });

  it("detects altered manifest content", () => {
    const forecast = mutable(createProbabilisticForecast(binaryForecastInput()));
    forecast.limitations[0] = "Rewritten after issue.";
    expect(() => assertProbabilisticForecastIntegrity(forecast)).toThrow(/digest/);
  });
});

describe("evaluation windows and outcomes", () => {
  it("attaches immutable outcomes separately and calculates Brier/log-loss scores", () => {
    const forecast = createProbabilisticForecast(binaryForecastInput());
    const outcome = createForecastOutcome({
      schemaVersion: 1,
      outcomeId: id(30),
      forecastId: forecast.forecastId,
      evaluationWindow: forecast.evaluationWindow,
      realizedValue: "1",
      observedAt: "2025-04-10T00:00:00Z",
      availableAt: "2025-04-12T00:00:00Z",
      recordedAt: "2025-04-12T01:00:00Z",
      outcomeDatasetSnapshotId: id(31),
      outcomeDatasetSnapshotSha256: A,
    });
    const score = scoreBinaryForecast(id(32), forecast, outcome, "2025-04-12T02:00:00Z");
    expect(score).toMatchObject({
      probabilityUsed: "0.25",
      realizedValue: "1",
      brierScore: "0.5625",
      logLoss: "1.38629436112",
    });
    assertForecastScoreIntegrity(score);
    const tampered = mutable(score);
    tampered.brierScore = "0";
    expect(() => assertForecastScoreIntegrity(tampered)).toThrow(/metrics/);
  });

  it("computes algebraic scores with fixed-point decimals rather than binary-float drift", () => {
    const binaryInput = binaryForecastInput();
    const binaryUncertainty = {
      ...binaryInput.uncertainty,
      parameterModel: {
        ...binaryInput.uncertainty.parameterModel,
        lower: "0.1",
        upper: "0.2",
      },
      calibration: {
        ...binaryInput.uncertainty.calibration,
        lower: "0.1",
        upper: "0.2",
      },
    } satisfies SeparatedForecastUncertainty;
    const binaryForecast = createProbabilisticForecast({
      ...binaryInput,
      forecastId: id(33),
      value: "0.123456789012",
      uncertainty: binaryUncertainty,
    });
    const binaryOutcome = createForecastOutcome({
      schemaVersion: 1,
      outcomeId: id(34),
      forecastId: binaryForecast.forecastId,
      evaluationWindow: binaryForecast.evaluationWindow,
      realizedValue: "0",
      observedAt: "2025-04-10T00:00:00Z",
      availableAt: "2025-04-12T00:00:00Z",
      recordedAt: "2025-04-12T01:00:00Z",
      outcomeDatasetSnapshotId: id(35),
      outcomeDatasetSnapshotSha256: A,
    });
    expect(
      scoreBinaryForecast(id(36), binaryForecast, binaryOutcome, "2025-04-12T02:00:00Z").brierScore,
    ).toBe("0.015241578753");

    const continuousInput = nowcastInput();
    const continuousForecast = createProbabilisticForecast({
      ...continuousInput,
      forecastId: id(37),
      value: "9007199254740991.1",
      uncertainty: {
        ...continuousInput.uncertainty,
        parameterModel: {
          ...continuousInput.uncertainty.parameterModel,
          lower: "9007199254740990",
          upper: "9007199254740992",
        },
      },
    });
    const continuousOutcome = createContinuousForecastOutcome({
      schemaVersion: 1,
      outcomeId: id(38),
      forecastId: continuousForecast.forecastId,
      evaluationWindow: continuousForecast.evaluationWindow,
      realizedValue: "9007199254740990.9",
      unit: "index_points",
      observedAt: "2025-04-10T00:00:00Z",
      availableAt: "2025-04-12T00:00:00Z",
      recordedAt: "2025-04-12T01:00:00Z",
      outcomeDatasetSnapshotId: id(39),
      outcomeDatasetSnapshotSha256: B,
    });
    expect(
      scoreContinuousNowcast(id(40), continuousForecast, continuousOutcome, "2025-04-12T02:00:00Z"),
    ).toMatchObject({ signedError: "0.2", absoluteError: "0.2", squaredError: "0.04" });
  });

  it("rejects premature outcomes, mismatched forecasts, and scores before recording", () => {
    const forecast = createProbabilisticForecast(binaryForecastInput());
    const baseOutcome = {
      schemaVersion: 1 as const,
      outcomeId: id(30),
      forecastId: forecast.forecastId,
      evaluationWindow: forecast.evaluationWindow,
      realizedValue: "0" as const,
      observedAt: "2025-04-10T00:00:00Z",
      availableAt: "2025-04-12T00:00:00Z",
      recordedAt: "2025-04-12T01:00:00Z",
      outcomeDatasetSnapshotId: id(31),
      outcomeDatasetSnapshotSha256: A,
    };
    expect(() =>
      createForecastOutcome({ ...baseOutcome, observedAt: "2025-03-01T00:00:00Z" }),
    ).toThrow(/chronology/);
    const other = createForecastOutcome({ ...baseOutcome, forecastId: id(99) });
    expect(() => scoreBinaryForecast(id(32), forecast, other, "2025-04-12T02:00:00Z")).toThrow(
      /does not belong/,
    );
    const outcome = createForecastOutcome(baseOutcome);
    expect(() => scoreBinaryForecast(id(32), forecast, outcome, "2025-04-11T00:00:00Z")).toThrow(
      /precede/,
    );
  });

  it("scores continuous nowcast outcomes without pretending they are probabilities", () => {
    const forecast = createProbabilisticForecast(nowcastInput());
    const outcome = createContinuousForecastOutcome({
      schemaVersion: 1,
      outcomeId: id(40),
      forecastId: forecast.forecastId,
      evaluationWindow: forecast.evaluationWindow,
      realizedValue: "10",
      unit: "percent",
      observedAt: "2025-04-10T00:00:00Z",
      availableAt: "2025-04-12T00:00:00Z",
      recordedAt: "2025-04-12T01:00:00Z",
      outcomeDatasetSnapshotId: id(41),
      outcomeDatasetSnapshotSha256: A,
    });
    const score = scoreContinuousNowcast(id(42), forecast, outcome, "2025-04-12T02:00:00Z");
    expect(score).toMatchObject({
      predictedValue: "11.2",
      realizedValue: "10",
      signedError: "1.2",
      absoluteError: "1.2",
      squaredError: "1.44",
    });
    assertContinuousNowcastScoreIntegrity(score);
    const tampered = mutable(score);
    tampered.squaredError = "1.45";
    expect(() => assertContinuousNowcastScoreIntegrity(tampered)).toThrow(/metrics/);
    expect(() =>
      scoreBinaryForecast(
        id(43),
        forecast,
        createForecastOutcome({
          schemaVersion: 1,
          outcomeId: id(44),
          forecastId: forecast.forecastId,
          evaluationWindow: forecast.evaluationWindow,
          realizedValue: "1",
          observedAt: "2025-04-10T00:00:00Z",
          availableAt: "2025-04-12T00:00:00Z",
          recordedAt: "2025-04-12T01:00:00Z",
          outcomeDatasetSnapshotId: id(45),
          outcomeDatasetSnapshotSha256: A,
        }),
        "2025-04-12T02:00:00Z",
      ),
    ).toThrow(/only numeric binary-event/);
  });
});
