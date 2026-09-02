import {
  assertDecimal,
  assertEnum,
  assertExactKeys,
  assertInteger,
  assertIsoInstant,
  assertKey,
  assertOrdered,
  assertProbability,
  assertSemver,
  assertSha256,
  assertText,
  assertUniqueKeys,
  assertUuid,
  cloneCanonical,
  compareDecimal,
  compareInstant,
  deepFreeze,
  digestJson,
  subtractDecimal,
} from "./internals.js";

export const BASELINE_CLASSES = ["naive", "base_rate", "simple_interpretable"] as const;
export type BaselineClass = (typeof BASELINE_CLASSES)[number];

export interface BaselineDeclarationInput {
  readonly schemaVersion: 1;
  readonly baselineId: string;
  readonly version: string;
  readonly baselineClass: BaselineClass;
  readonly method:
    | "last_observation"
    | "seasonal_naive"
    | "historical_base_rate"
    | "regularized_logistic";
  readonly targetDefinitionId: string;
  readonly targetDefinitionSha256: string;
  readonly featureKeys: readonly string[];
  readonly trainingWindowDays: number;
  readonly implementationSha256: string;
  readonly assumptions: readonly string[];
}

export interface BaselineDeclaration extends BaselineDeclarationInput {
  readonly manifestSha256: string;
}

function validateBaselineBody(input: BaselineDeclarationInput): void {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "baselineId",
      "version",
      "baselineClass",
      "method",
      "targetDefinitionId",
      "targetDefinitionSha256",
      "featureKeys",
      "trainingWindowDays",
      "implementationSha256",
      "assumptions",
    ],
    "baseline",
  );
  if (input.schemaVersion !== 1) throw new TypeError("baseline.schemaVersion must be 1");
  assertUuid(input.baselineId, "baseline.baselineId");
  assertSemver(input.version, "baseline.version");
  assertEnum(input.baselineClass, BASELINE_CLASSES, "baseline.baselineClass");
  assertEnum(
    input.method,
    ["last_observation", "seasonal_naive", "historical_base_rate", "regularized_logistic"],
    "baseline.method",
  );
  const allowedClass =
    input.method === "historical_base_rate"
      ? "base_rate"
      : input.method === "regularized_logistic"
        ? "simple_interpretable"
        : "naive";
  if (input.baselineClass !== allowedClass)
    throw new TypeError("baseline class and method disagree");
  assertUuid(input.targetDefinitionId, "baseline.targetDefinitionId");
  assertSha256(input.targetDefinitionSha256, "baseline.targetDefinitionSha256");
  if (input.baselineClass === "base_rate") {
    if (input.featureKeys.length !== 0)
      throw new TypeError("base-rate baseline cannot use features");
  } else {
    assertUniqueKeys(input.featureKeys, "baseline.featureKeys");
  }
  assertInteger(input.trainingWindowDays, "baseline.trainingWindowDays", 1, 36_500);
  assertSha256(input.implementationSha256, "baseline.implementationSha256");
  if (input.assumptions.length === 0) throw new TypeError("baseline assumptions must not be empty");
  for (const assumption of input.assumptions) assertText(assumption, "baseline assumption", 1_000);
}

export function createBaselineDeclaration(
  input: BaselineDeclarationInput,
): Readonly<BaselineDeclaration> {
  validateBaselineBody(input);
  const body = cloneCanonical({ ...input, featureKeys: [...input.featureKeys].sort() });
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export interface TimeInterval {
  readonly start: string;
  readonly end: string;
}

export interface LeakageSentinels {
  readonly featureDefinitionLockedAt: string;
  readonly featureEngineeringFitThrough: string;
  readonly imputationFitThrough: string;
  readonly normalizationFitThrough: string;
  readonly hyperparameterSelectionFitThrough: string;
  readonly calibrationFitThrough: string;
  readonly thresholdSelectionFitThrough: string;
  readonly latestTrainingLabelKnownAt: string;
}

export interface ChronologicalFold {
  readonly foldId: string;
  readonly training: TimeInterval;
  readonly calibration: TimeInterval;
  readonly test: TimeInterval;
  readonly embargoDays: number;
  readonly sentinels: LeakageSentinels;
}

export interface ChronologicalValidationPlanInput {
  readonly schemaVersion: 1;
  readonly validationPlanId: string;
  readonly mode: "expanding_window" | "rolling_window";
  readonly targetDefinitionId: string;
  readonly targetDefinitionSha256: string;
  readonly folds: readonly ChronologicalFold[];
}

export interface ChronologicalValidationPlan extends ChronologicalValidationPlanInput {
  readonly manifestSha256: string;
}

function assertInterval(interval: TimeInterval, field: string): void {
  assertExactKeys(interval, ["start", "end"], field);
  assertIsoInstant(interval.start, `${field}.start`);
  assertIsoInstant(interval.end, `${field}.end`);
  if (compareInstant(interval.start, interval.end) >= 0) {
    throw new TypeError(`${field} must start before it ends`);
  }
}

function validateFold(fold: ChronologicalFold, index: number): void {
  const field = `folds[${index}]`;
  assertExactKeys(
    fold,
    ["foldId", "training", "calibration", "test", "embargoDays", "sentinels"],
    field,
  );
  assertKey(fold.foldId, `${field}.foldId`);
  assertInterval(fold.training, `${field}.training`);
  assertInterval(fold.calibration, `${field}.calibration`);
  assertInterval(fold.test, `${field}.test`);
  assertInteger(fold.embargoDays, `${field}.embargoDays`, 0, 3_650);
  if (
    compareInstant(fold.training.end, fold.calibration.start) >= 0 ||
    compareInstant(fold.calibration.end, fold.test.start) >= 0
  ) {
    throw new TypeError(`${field} must be strictly chronological`);
  }
  assertExactKeys(
    fold.sentinels,
    [
      "featureDefinitionLockedAt",
      "featureEngineeringFitThrough",
      "imputationFitThrough",
      "normalizationFitThrough",
      "hyperparameterSelectionFitThrough",
      "calibrationFitThrough",
      "thresholdSelectionFitThrough",
      "latestTrainingLabelKnownAt",
    ],
    `${field}.sentinels`,
  );
  for (const [name, cutoff] of Object.entries(fold.sentinels)) {
    assertIsoInstant(cutoff, `${field}.sentinels.${name}`);
    if (compareInstant(cutoff, fold.test.start) >= 0) {
      throw new TypeError(`${field}.${name} leaks into the held-out test period`);
    }
  }
  for (const cutoff of [
    fold.sentinels.featureDefinitionLockedAt,
    fold.sentinels.featureEngineeringFitThrough,
    fold.sentinels.imputationFitThrough,
    fold.sentinels.normalizationFitThrough,
    fold.sentinels.hyperparameterSelectionFitThrough,
    fold.sentinels.latestTrainingLabelKnownAt,
  ]) {
    if (compareInstant(cutoff, fold.training.end) > 0) {
      throw new TypeError(`${field} training-only sentinel exceeds training end`);
    }
  }
  for (const cutoff of [
    fold.sentinels.calibrationFitThrough,
    fold.sentinels.thresholdSelectionFitThrough,
  ]) {
    if (compareInstant(cutoff, fold.calibration.end) > 0) {
      throw new TypeError(`${field} calibration sentinel exceeds calibration end`);
    }
  }
}

export function createChronologicalValidationPlan(
  input: ChronologicalValidationPlanInput,
): Readonly<ChronologicalValidationPlan> {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "validationPlanId",
      "mode",
      "targetDefinitionId",
      "targetDefinitionSha256",
      "folds",
    ],
    "validationPlan",
  );
  if (input.schemaVersion !== 1) throw new TypeError("validationPlan.schemaVersion must be 1");
  assertUuid(input.validationPlanId, "validationPlan.validationPlanId");
  assertEnum(input.mode, ["expanding_window", "rolling_window"], "validationPlan.mode");
  assertUuid(input.targetDefinitionId, "validationPlan.targetDefinitionId");
  assertSha256(input.targetDefinitionSha256, "validationPlan.targetDefinitionSha256");
  if (input.folds.length === 0) throw new TypeError("chronological validation needs folds");
  for (const [index, fold] of input.folds.entries()) validateFold(fold, index);
  assertUniqueKeys(
    input.folds.map((fold) => fold.foldId),
    "validation fold IDs",
  );
  for (let index = 1; index < input.folds.length; index += 1) {
    const previous = input.folds[index - 1];
    const current = input.folds[index];
    if (!previous || !current) throw new TypeError("validation fold is missing");
    if (compareInstant(previous.test.end, current.test.start) >= 0) {
      throw new TypeError("test folds must advance without overlap");
    }
    if (compareInstant(previous.training.end, current.training.end) >= 0) {
      throw new TypeError("training windows must advance");
    }
    if (input.mode === "expanding_window" && previous.training.start !== current.training.start) {
      throw new TypeError("expanding windows must preserve their training start");
    }
    if (
      input.mode === "rolling_window" &&
      compareInstant(previous.training.start, current.training.start) > 0
    ) {
      throw new TypeError("rolling windows cannot move their training start backward");
    }
  }
  const body = cloneCanonical(input);
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export interface TournamentCell {
  readonly geographyKey: string;
  readonly targetDefinitionId: string;
  readonly targetDefinitionSha256: string;
  readonly horizonDays: number;
  readonly regimeKey: string;
}

export interface TournamentMetrics {
  readonly sampleSize: number;
  readonly eventCount: number;
  readonly brierScore: string;
  readonly logLoss: string;
  readonly expectedCalibrationError: string;
  readonly stabilityScore: string;
  readonly interpretabilityScore: string;
  readonly averageInferenceCost: string;
}

export interface TournamentEntry {
  readonly entryId: string;
  readonly cell: TournamentCell;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly artifactSha256: string;
  readonly role: "incumbent" | "challenger" | "baseline";
  readonly baselineClass: BaselineClass | null;
  readonly metrics: TournamentMetrics;
}

export interface ModelTournamentInput {
  readonly schemaVersion: 1;
  readonly tournamentId: string;
  readonly validationPlanId: string;
  readonly validationPlanSha256: string;
  readonly evaluatedAt: string;
  readonly entries: readonly TournamentEntry[];
}

export interface ModelTournament extends ModelTournamentInput {
  readonly manifestSha256: string;
}

function cellKey(cell: TournamentCell): string {
  return [
    cell.geographyKey,
    cell.targetDefinitionId,
    cell.horizonDays.toString(),
    cell.regimeKey,
  ].join("|");
}

function validateTournamentEntry(entry: TournamentEntry, field: string): void {
  assertExactKeys(
    entry,
    [
      "entryId",
      "cell",
      "modelId",
      "modelVersion",
      "artifactSha256",
      "role",
      "baselineClass",
      "metrics",
    ],
    field,
  );
  assertUuid(entry.entryId, `${field}.entryId`);
  assertExactKeys(
    entry.cell,
    ["geographyKey", "targetDefinitionId", "targetDefinitionSha256", "horizonDays", "regimeKey"],
    `${field}.cell`,
  );
  assertKey(entry.cell.geographyKey, `${field}.cell.geographyKey`);
  assertUuid(entry.cell.targetDefinitionId, `${field}.cell.targetDefinitionId`);
  assertSha256(entry.cell.targetDefinitionSha256, `${field}.cell.targetDefinitionSha256`);
  assertInteger(entry.cell.horizonDays, `${field}.cell.horizonDays`, 1, 3_650);
  assertKey(entry.cell.regimeKey, `${field}.cell.regimeKey`);
  assertUuid(entry.modelId, `${field}.modelId`);
  assertSemver(entry.modelVersion, `${field}.modelVersion`);
  assertSha256(entry.artifactSha256, `${field}.artifactSha256`);
  assertEnum(entry.role, ["incumbent", "challenger", "baseline"], `${field}.role`);
  if (entry.role === "baseline") {
    if (entry.baselineClass === null) throw new TypeError(`${field} baseline class is required`);
    assertEnum(entry.baselineClass, BASELINE_CLASSES, `${field}.baselineClass`);
  } else if (entry.baselineClass !== null) {
    throw new TypeError(`${field} non-baseline cannot claim a baseline class`);
  }
  assertExactKeys(
    entry.metrics,
    [
      "sampleSize",
      "eventCount",
      "brierScore",
      "logLoss",
      "expectedCalibrationError",
      "stabilityScore",
      "interpretabilityScore",
      "averageInferenceCost",
    ],
    `${field}.metrics`,
  );
  assertInteger(entry.metrics.sampleSize, `${field}.metrics.sampleSize`, 1, 100_000_000);
  assertInteger(
    entry.metrics.eventCount,
    `${field}.metrics.eventCount`,
    0,
    entry.metrics.sampleSize,
  );
  for (const metric of [
    "brierScore",
    "expectedCalibrationError",
    "stabilityScore",
    "interpretabilityScore",
  ] as const) {
    assertProbability(entry.metrics[metric], `${field}.metrics.${metric}`);
  }
  assertDecimal(entry.metrics.logLoss, `${field}.metrics.logLoss`, false);
  assertDecimal(entry.metrics.averageInferenceCost, `${field}.metrics.averageInferenceCost`, false);
}

export function createModelTournament(input: ModelTournamentInput): Readonly<ModelTournament> {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "tournamentId",
      "validationPlanId",
      "validationPlanSha256",
      "evaluatedAt",
      "entries",
    ],
    "tournament",
  );
  if (input.schemaVersion !== 1) throw new TypeError("tournament.schemaVersion must be 1");
  assertUuid(input.tournamentId, "tournament.tournamentId");
  assertUuid(input.validationPlanId, "tournament.validationPlanId");
  assertSha256(input.validationPlanSha256, "tournament.validationPlanSha256");
  assertIsoInstant(input.evaluatedAt, "tournament.evaluatedAt");
  if (input.entries.length === 0) throw new TypeError("tournament entries must not be empty");
  const entryIds = new Set<string>();
  const cells = new Map<string, TournamentEntry[]>();
  for (const [index, entry] of input.entries.entries()) {
    validateTournamentEntry(entry, `entries[${index}]`);
    if (entryIds.has(entry.entryId)) throw new TypeError("tournament entryId must be unique");
    entryIds.add(entry.entryId);
    const key = cellKey(entry.cell);
    cells.set(key, [...(cells.get(key) ?? []), entry]);
  }
  for (const entries of cells.values()) {
    const baselineClasses = new Set(
      entries.filter((entry) => entry.role === "baseline").map((entry) => entry.baselineClass),
    );
    if (BASELINE_CLASSES.some((baseline) => !baselineClasses.has(baseline))) {
      throw new TypeError(
        "every tournament cell needs naive, base-rate, and interpretable baselines",
      );
    }
    if (!entries.some((entry) => entry.role === "incumbent")) {
      throw new TypeError("every tournament cell needs an incumbent");
    }
    if (!entries.some((entry) => entry.role === "challenger")) {
      throw new TypeError("every tournament cell needs a challenger");
    }
  }
  const entries = [...input.entries].sort((left, right) => {
    const byCell = cellKey(left.cell).localeCompare(cellKey(right.cell));
    return byCell === 0 ? left.entryId.localeCompare(right.entryId) : byCell;
  });
  const body = cloneCanonical({ ...input, entries });
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export interface ChampionSelectionPolicy {
  readonly primaryMetric: "brier_score" | "log_loss";
  readonly minimumHeldoutBenefit: string;
  readonly maximumExpectedCalibrationError: string;
  readonly minimumStabilityScore: string;
  readonly minimumInterpretabilityScore: string;
  readonly maximumAverageInferenceCost: string;
  readonly minimumSampleSize: number;
  readonly minimumEventCount: number;
}

export interface ChampionChallengeInput {
  readonly schemaVersion: 1;
  readonly decisionId: string;
  readonly decidedAt: string;
  readonly tournamentId: string;
  readonly tournamentSha256: string;
  readonly incumbent: TournamentEntry;
  readonly challenger: TournamentEntry;
  readonly policy: ChampionSelectionPolicy;
  readonly independentValidationReviewId: string;
}

export type SelectionGate =
  | "material_heldout_benefit"
  | "calibration"
  | "stability"
  | "interpretability"
  | "cost"
  | "sample_size"
  | "event_count";

export interface ChampionChallengeDecision extends ChampionChallengeInput {
  readonly heldoutBenefit: string;
  readonly passedGates: readonly SelectionGate[];
  readonly failedGates: readonly SelectionGate[];
  readonly recommendation: "promote_challenger" | "retain_champion";
  readonly requiresDeploymentApproval: true;
  readonly manifestSha256: string;
}

export function assessChampionChallenge(
  input: ChampionChallengeInput,
): Readonly<ChampionChallengeDecision> {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "decisionId",
      "decidedAt",
      "tournamentId",
      "tournamentSha256",
      "incumbent",
      "challenger",
      "policy",
      "independentValidationReviewId",
    ],
    "championChallenge",
  );
  if (input.schemaVersion !== 1) throw new TypeError("championChallenge.schemaVersion must be 1");
  assertUuid(input.decisionId, "championChallenge.decisionId");
  assertIsoInstant(input.decidedAt, "championChallenge.decidedAt");
  assertUuid(input.tournamentId, "championChallenge.tournamentId");
  assertSha256(input.tournamentSha256, "championChallenge.tournamentSha256");
  assertUuid(
    input.independentValidationReviewId,
    "championChallenge.independentValidationReviewId",
  );
  validateTournamentEntry(input.incumbent, "championChallenge.incumbent");
  validateTournamentEntry(input.challenger, "championChallenge.challenger");
  if (input.incumbent.role !== "incumbent" || input.challenger.role !== "challenger") {
    throw new TypeError("champion challenge requires incumbent and challenger roles");
  }
  if (cellKey(input.incumbent.cell) !== cellKey(input.challenger.cell)) {
    throw new TypeError("champion and challenger must be evaluated in the same cell");
  }
  assertExactKeys(
    input.policy,
    [
      "primaryMetric",
      "minimumHeldoutBenefit",
      "maximumExpectedCalibrationError",
      "minimumStabilityScore",
      "minimumInterpretabilityScore",
      "maximumAverageInferenceCost",
      "minimumSampleSize",
      "minimumEventCount",
    ],
    "championChallenge.policy",
  );
  assertEnum(input.policy.primaryMetric, ["brier_score", "log_loss"], "policy.primaryMetric");
  assertDecimal(input.policy.minimumHeldoutBenefit, "policy.minimumHeldoutBenefit", false);
  if (compareDecimal(input.policy.minimumHeldoutBenefit, "0") <= 0) {
    throw new TypeError("policy.minimumHeldoutBenefit must be materially greater than zero");
  }
  assertProbability(
    input.policy.maximumExpectedCalibrationError,
    "policy.maximumExpectedCalibrationError",
  );
  assertProbability(input.policy.minimumStabilityScore, "policy.minimumStabilityScore");
  assertProbability(
    input.policy.minimumInterpretabilityScore,
    "policy.minimumInterpretabilityScore",
  );
  assertDecimal(
    input.policy.maximumAverageInferenceCost,
    "policy.maximumAverageInferenceCost",
    false,
  );
  assertInteger(input.policy.minimumSampleSize, "policy.minimumSampleSize", 1, 100_000_000);
  assertInteger(input.policy.minimumEventCount, "policy.minimumEventCount", 1, 100_000_000);
  const incumbentMetric =
    input.policy.primaryMetric === "brier_score"
      ? input.incumbent.metrics.brierScore
      : input.incumbent.metrics.logLoss;
  const challengerMetric =
    input.policy.primaryMetric === "brier_score"
      ? input.challenger.metrics.brierScore
      : input.challenger.metrics.logLoss;
  const heldoutBenefit = subtractDecimal(incumbentMetric, challengerMetric);
  const gates = new Map<SelectionGate, boolean>([
    [
      "material_heldout_benefit",
      compareDecimal(heldoutBenefit, input.policy.minimumHeldoutBenefit) >= 0,
    ],
    [
      "calibration",
      compareDecimal(
        input.challenger.metrics.expectedCalibrationError,
        input.policy.maximumExpectedCalibrationError,
      ) <= 0,
    ],
    [
      "stability",
      compareDecimal(input.challenger.metrics.stabilityScore, input.policy.minimumStabilityScore) >=
        0,
    ],
    [
      "interpretability",
      compareDecimal(
        input.challenger.metrics.interpretabilityScore,
        input.policy.minimumInterpretabilityScore,
      ) >= 0,
    ],
    [
      "cost",
      compareDecimal(
        input.challenger.metrics.averageInferenceCost,
        input.policy.maximumAverageInferenceCost,
      ) <= 0,
    ],
    ["sample_size", input.challenger.metrics.sampleSize >= input.policy.minimumSampleSize],
    ["event_count", input.challenger.metrics.eventCount >= input.policy.minimumEventCount],
  ]);
  const passedGates = [...gates].filter(([, passed]) => passed).map(([gate]) => gate);
  const failedGates = [...gates].filter(([, passed]) => !passed).map(([gate]) => gate);
  assertOrdered([...passedGates].sort(), "passed gates");
  const recommendation: ChampionChallengeDecision["recommendation"] =
    failedGates.length === 0 ? "promote_challenger" : "retain_champion";
  const body = cloneCanonical({
    ...input,
    heldoutBenefit,
    passedGates,
    failedGates,
    recommendation,
    requiresDeploymentApproval: true as const,
  });
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}
