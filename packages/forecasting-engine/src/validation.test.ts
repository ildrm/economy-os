import { describe, expect, it } from "vitest";
import {
  assertForecastTargetDefinitionIntegrity,
  createForecastTargetDefinition,
  type ForecastTargetDefinitionInput,
} from "./targets.js";
import {
  assessChampionChallenge,
  type BaselineDeclarationInput,
  type ChampionChallengeInput,
  type ChronologicalFold,
  type ChronologicalValidationPlanInput,
  createBaselineDeclaration,
  createChronologicalValidationPlan,
  createModelTournament,
  type ModelTournamentInput,
  type TournamentEntry,
} from "./validation.js";

const id = (suffix: number) => `00000000-0000-8000-8000-${suffix.toString().padStart(12, "0")}`;
const A = "a".repeat(64);
const B = "b".repeat(64);

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

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("fixture value is missing");
  return value;
}

function targetInput(): ForecastTargetDefinitionInput {
  return {
    schemaVersion: 1,
    targetDefinitionId: id(1),
    targetKey: "inflation.acceleration",
    version: "1.0.0",
    task: "binary_event_probability",
    horizon: { key: "90d", days: 90 },
    labelSemantics: "One when year-over-year inflation accelerates during the outcome window.",
    populationSemantics: "National monthly CPI observations with an official first release.",
    outcomeWindow: { startOffsetDays: 1, endOffsetDays: 90 },
    sourceSeriesKeys: ["official.cpi", "official.cpi_core"],
    labelAvailabilityLagDays: 30,
    revisionPolicy: "first_release",
    minimumCalibrationEvents: 30,
    createdAt: "2025-01-01T00:00:00Z",
    ownerId: id(2),
    limitations: ["Rare structural breaks may not be represented in the historical label set."],
  };
}

function baselineInput(
  baselineClass: BaselineDeclarationInput["baselineClass"] = "base_rate",
): BaselineDeclarationInput {
  const byClass = {
    naive: { method: "last_observation" as const, featureKeys: ["official.cpi"] },
    base_rate: { method: "historical_base_rate" as const, featureKeys: [] },
    simple_interpretable: {
      method: "regularized_logistic" as const,
      featureKeys: ["official.cpi", "official.cpi_core"],
    },
  };
  return {
    schemaVersion: 1,
    baselineId: id(3),
    version: "1.0.0",
    baselineClass,
    ...byClass[baselineClass],
    targetDefinitionId: id(1),
    targetDefinitionSha256: A,
    trainingWindowDays: 1_825,
    implementationSha256: B,
    assumptions: ["Historical availability lags are reconstructed point in time."],
  };
}

function fold(
  suffix: string,
  trainingStart: string,
  trainingEnd: string,
  calibrationStart: string,
  calibrationEnd: string,
  testStart: string,
  testEnd: string,
): ChronologicalFold {
  return {
    foldId: `fold.${suffix}`,
    training: { start: trainingStart, end: trainingEnd },
    calibration: { start: calibrationStart, end: calibrationEnd },
    test: { start: testStart, end: testEnd },
    embargoDays: 7,
    sentinels: {
      featureDefinitionLockedAt: trainingEnd,
      featureEngineeringFitThrough: trainingEnd,
      imputationFitThrough: trainingEnd,
      normalizationFitThrough: trainingEnd,
      hyperparameterSelectionFitThrough: trainingEnd,
      calibrationFitThrough: calibrationEnd,
      thresholdSelectionFitThrough: calibrationEnd,
      latestTrainingLabelKnownAt: trainingEnd,
    },
  };
}

function planInput(): ChronologicalValidationPlanInput {
  return {
    schemaVersion: 1,
    validationPlanId: id(10),
    mode: "expanding_window",
    targetDefinitionId: id(1),
    targetDefinitionSha256: A,
    folds: [
      fold(
        "one",
        "2018-01-01T00:00:00Z",
        "2020-12-01T00:00:00Z",
        "2020-12-02T00:00:00Z",
        "2021-03-01T00:00:00Z",
        "2021-03-02T00:00:00Z",
        "2021-06-01T00:00:00Z",
      ),
      fold(
        "two",
        "2018-01-01T00:00:00Z",
        "2021-06-02T00:00:00Z",
        "2021-06-03T00:00:00Z",
        "2021-09-01T00:00:00Z",
        "2021-09-02T00:00:00Z",
        "2021-12-01T00:00:00Z",
      ),
    ],
  };
}

function entry(
  suffix: number,
  role: TournamentEntry["role"],
  baselineClass: TournamentEntry["baselineClass"],
  overrides: Partial<TournamentEntry["metrics"]> = {},
): TournamentEntry {
  return {
    entryId: id(100 + suffix),
    cell: {
      geographyKey: "irn",
      targetDefinitionId: id(1),
      targetDefinitionSha256: A,
      horizonDays: 90,
      regimeKey: "high_inflation",
    },
    modelId: id(200 + suffix),
    modelVersion: "1.0.0",
    artifactSha256: B,
    role,
    baselineClass,
    metrics: {
      sampleSize: 1_000,
      eventCount: 100,
      brierScore: role === "challenger" ? "0.16" : "0.2",
      logLoss: role === "challenger" ? "0.48" : "0.55",
      expectedCalibrationError: "0.03",
      stabilityScore: "0.9",
      interpretabilityScore: "0.8",
      averageInferenceCost: "0.01",
      ...overrides,
    },
  };
}

function tournamentInput(): ModelTournamentInput {
  return {
    schemaVersion: 1,
    tournamentId: id(20),
    validationPlanId: id(10),
    validationPlanSha256: A,
    evaluatedAt: "2025-02-01T00:00:00Z",
    entries: [
      entry(1, "baseline", "naive"),
      entry(2, "baseline", "base_rate"),
      entry(3, "baseline", "simple_interpretable"),
      entry(4, "incumbent", null),
      entry(5, "challenger", null),
    ],
  };
}

function challengeInput(): ChampionChallengeInput {
  const tournament = tournamentInput();
  return {
    schemaVersion: 1,
    decisionId: id(30),
    decidedAt: "2025-02-02T00:00:00Z",
    tournamentId: tournament.tournamentId,
    tournamentSha256: A,
    incumbent: entry(4, "incumbent", null),
    challenger: entry(5, "challenger", null),
    policy: {
      primaryMetric: "brier_score",
      minimumHeldoutBenefit: "0.02",
      maximumExpectedCalibrationError: "0.05",
      minimumStabilityScore: "0.8",
      minimumInterpretabilityScore: "0.7",
      maximumAverageInferenceCost: "0.02",
      minimumSampleSize: 500,
      minimumEventCount: 50,
    },
    independentValidationReviewId: id(31),
  };
}

describe("target and baseline declarations", () => {
  it("creates immutable versioned target+horizon definitions", () => {
    const target = createForecastTargetDefinition({
      ...targetInput(),
      sourceSeriesKeys: ["official.cpi_core", "official.cpi"],
    });
    expect(target.sourceSeriesKeys).toEqual(["official.cpi", "official.cpi_core"]);
    expect(Object.isFrozen(target)).toBe(true);
    assertForecastTargetDefinitionIntegrity(target);

    const nowcast = createForecastTargetDefinition({
      ...targetInput(),
      targetDefinitionId: id(9),
      task: "continuous_nowcast",
      horizon: { key: "now", days: 0 },
      outcomeWindow: { startOffsetDays: 0, endOffsetDays: 0 },
      minimumCalibrationEvents: 0,
    });
    expect(nowcast.horizon).toEqual({ key: "now", days: 0 });
  });

  it.each([
    ["zero event horizon", { horizon: { key: "now", days: 0 } }],
    ["mismatched horizon key", { horizon: { key: "30d", days: 90 } }],
    ["empty outcome window", { outcomeWindow: { startOffsetDays: 5, endOffsetDays: 5 } }],
    ["no limitations", { limitations: [] }],
    ["bad label lag", { labelAvailabilityLagDays: -1 }],
  ])("rejects target with %s", (_label, override) => {
    expect(() => createForecastTargetDefinition({ ...targetInput(), ...override })).toThrow(
      TypeError,
    );
  });

  it("declares all required baseline families with deterministic features", () => {
    expect(createBaselineDeclaration(baselineInput("naive")).baselineClass).toBe("naive");
    expect(createBaselineDeclaration(baselineInput("base_rate")).featureKeys).toEqual([]);
    expect(createBaselineDeclaration(baselineInput("simple_interpretable")).featureKeys).toEqual([
      "official.cpi",
      "official.cpi_core",
    ]);
  });

  it("rejects baseline method/class mismatches and base-rate feature leakage", () => {
    expect(() =>
      createBaselineDeclaration({ ...baselineInput("base_rate"), method: "last_observation" }),
    ).toThrow(/disagree/);
    expect(() =>
      createBaselineDeclaration({ ...baselineInput("base_rate"), featureKeys: ["official.cpi"] }),
    ).toThrow(/cannot use features/);
  });
});

describe("chronological validation", () => {
  it("accepts expanding and rolling windows with explicit leakage sentinels", () => {
    const expanding = createChronologicalValidationPlan(planInput());
    expect(expanding.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    const rollingInput = planInput();
    const second = required(rollingInput.folds[1]);
    const rolling = createChronologicalValidationPlan({
      ...rollingInput,
      mode: "rolling_window",
      folds: [
        required(rollingInput.folds[0]),
        { ...second, training: { ...second.training, start: "2019-01-01T00:00:00Z" } },
      ],
    });
    expect(rolling.mode).toBe("rolling_window");
  });

  it("rejects random splits, leakage, overlap, and invalid expanding windows", () => {
    expect(() =>
      createChronologicalValidationPlan({
        ...planInput(),
        mode: "random",
      } as unknown as ChronologicalValidationPlanInput),
    ).toThrow(/allowed value/);
    const leaked = mutable(planInput());
    required(leaked.folds[0]).sentinels.calibrationFitThrough = "2021-04-01T00:00:00Z";
    expect(() => createChronologicalValidationPlan(leaked)).toThrow(/leaks/);
    const overlap = mutable(planInput());
    required(overlap.folds[0]).test.end = "2021-10-01T00:00:00Z";
    expect(() => createChronologicalValidationPlan(overlap)).toThrow(/overlap/);
    const changedStart = mutable(planInput());
    required(changedStart.folds[1]).training.start = "2019-01-01T00:00:00Z";
    expect(() => createChronologicalValidationPlan(changedStart)).toThrow(/preserve/);
  });
});

describe("model tournament and champion/challenger gates", () => {
  it("requires complete geography × target × horizon × regime comparisons", () => {
    const tournament = createModelTournament(tournamentInput());
    expect(tournament.entries).toHaveLength(5);
    expect(tournament.entries.map((candidate) => candidate.entryId)).toEqual(
      [...tournament.entries.map((candidate) => candidate.entryId)].sort(),
    );
  });

  it("rejects incomplete baseline and contender coverage", () => {
    const base = tournamentInput();
    expect(() => createModelTournament({ ...base, entries: base.entries.slice(1) })).toThrow(
      /every tournament cell needs/,
    );
    expect(() =>
      createModelTournament({
        ...base,
        entries: base.entries.filter((candidate) => candidate.role !== "incumbent"),
      }),
    ).toThrow(/incumbent/);
    expect(() =>
      createModelTournament({
        ...base,
        entries: base.entries.filter((candidate) => candidate.role !== "challenger"),
      }),
    ).toThrow(/challenger/);
  });

  it("promotes only when every configured materiality and governance gate passes", () => {
    const decision = assessChampionChallenge(challengeInput());
    expect(decision).toMatchObject({
      heldoutBenefit: "0.04",
      failedGates: [],
      recommendation: "promote_challenger",
      requiresDeploymentApproval: true,
    });

    const failedInput = mutable(challengeInput());
    failedInput.challenger.metrics.brierScore = "0.19";
    failedInput.challenger.metrics.expectedCalibrationError = "0.08";
    failedInput.challenger.metrics.stabilityScore = "0.5";
    failedInput.challenger.metrics.interpretabilityScore = "0.4";
    failedInput.challenger.metrics.averageInferenceCost = "0.1";
    failedInput.challenger.metrics.sampleSize = 100;
    failedInput.challenger.metrics.eventCount = 5;
    const retained = assessChampionChallenge(failedInput);
    expect(retained.failedGates).toEqual([
      "material_heldout_benefit",
      "calibration",
      "stability",
      "interpretability",
      "cost",
      "sample_size",
      "event_count",
    ]);
    expect(retained.recommendation).toBe("retain_champion");
  });

  it("supports log-loss materiality and rejects incomparable contenders", () => {
    const logLoss = mutable(challengeInput());
    logLoss.policy.primaryMetric = "log_loss";
    expect(assessChampionChallenge(logLoss).heldoutBenefit).toBe("0.07");

    const differentCell = mutable(challengeInput());
    differentCell.challenger.cell.regimeKey = "low_inflation";
    expect(() => assessChampionChallenge(differentCell)).toThrow(/same cell/);

    const badRoles = mutable(challengeInput());
    badRoles.challenger.role = "incumbent";
    expect(() => assessChampionChallenge(badRoles)).toThrow(/roles/);

    const noMateriality = mutable(challengeInput());
    noMateriality.policy.minimumHeldoutBenefit = "0";
    expect(() => assessChampionChallenge(noMateriality)).toThrow(/greater than zero/);
  });
});
