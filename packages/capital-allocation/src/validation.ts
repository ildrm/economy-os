import { ASSET_CLASSES, type AssetClass, CANDIDATE_MODEL_STATUSES } from "./assessment.js";
import {
  assertCountryCode,
  assertEnum,
  assertExactKeys,
  assertIsoInstant,
  assertKey,
  assertResearchNarrative,
  assertSafeInteger,
  assertSemver,
  assertSha256,
  assertUniqueStrings,
  assertUuid,
  cloneCanonical,
  compareInstant,
  deepFreeze,
  digestJson,
  secondsBetween,
} from "./internals.js";

export interface OutcomeDefinitionInput {
  readonly schemaVersion: 1;
  readonly outcomeDefinitionId: string;
  readonly version: string;
  readonly purpose: "research_validation_only";
  readonly assetClass: AssetClass;
  readonly metricKey: string;
  readonly description: string;
  readonly countryScope: readonly string[];
  readonly strategyScope: readonly string[];
  readonly horizonDays: number;
  readonly observationWindow: Readonly<{
    startOffsetDays: number;
    endOffsetDays: number;
  }>;
  readonly direction: "higher_is_better" | "lower_is_better" | "two_sided";
  readonly calculationMethod: string;
  readonly sourceSeriesKeys: readonly string[];
  readonly availabilityLagDays: number;
  readonly revisionPolicy: "first_release" | "fixed_vintage" | "latest_at_evaluation_cutoff";
  readonly missingDataPolicy: "exclude_with_reason" | "score_as_unresolved";
}

export interface OutcomeDefinition extends OutcomeDefinitionInput {
  readonly manifestSha256: string;
}

function validateOutcomeDefinitionBody(input: OutcomeDefinitionInput): void {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "outcomeDefinitionId",
      "version",
      "purpose",
      "assetClass",
      "metricKey",
      "description",
      "countryScope",
      "strategyScope",
      "horizonDays",
      "observationWindow",
      "direction",
      "calculationMethod",
      "sourceSeriesKeys",
      "availabilityLagDays",
      "revisionPolicy",
      "missingDataPolicy",
    ],
    "outcomeDefinition",
  );
  if (input.schemaVersion !== 1) throw new TypeError("outcomeDefinition.schemaVersion must be 1");
  assertUuid(input.outcomeDefinitionId, "outcomeDefinition.outcomeDefinitionId");
  assertSemver(input.version, "outcomeDefinition.version");
  if (input.purpose !== "research_validation_only") {
    throw new TypeError("outcome definition purpose must remain research_validation_only");
  }
  assertEnum(input.assetClass, ASSET_CLASSES, "outcomeDefinition.assetClass");
  assertKey(input.metricKey, "outcomeDefinition.metricKey");
  assertResearchNarrative(input.description, "outcomeDefinition.description");
  assertUniqueStrings(input.countryScope, "outcomeDefinition.countryScope", assertCountryCode);
  assertUniqueStrings(input.strategyScope, "outcomeDefinition.strategyScope", assertKey);
  assertSafeInteger(input.horizonDays, "outcomeDefinition.horizonDays", 1, 3_650);
  assertExactKeys(
    input.observationWindow,
    ["startOffsetDays", "endOffsetDays"],
    "outcomeDefinition.observationWindow",
  );
  assertSafeInteger(
    input.observationWindow.startOffsetDays,
    "outcomeDefinition.observationWindow.startOffsetDays",
    0,
    input.horizonDays,
  );
  assertSafeInteger(
    input.observationWindow.endOffsetDays,
    "outcomeDefinition.observationWindow.endOffsetDays",
    1,
    input.horizonDays,
  );
  if (input.observationWindow.startOffsetDays >= input.observationWindow.endOffsetDays) {
    throw new TypeError("outcome observation window must have a positive duration");
  }
  assertEnum(
    input.direction,
    ["higher_is_better", "lower_is_better", "two_sided"],
    "outcomeDefinition.direction",
  );
  assertResearchNarrative(input.calculationMethod, "outcomeDefinition.calculationMethod");
  assertUniqueStrings(input.sourceSeriesKeys, "outcomeDefinition.sourceSeriesKeys", assertKey);
  assertSafeInteger(input.availabilityLagDays, "outcomeDefinition.availabilityLagDays", 0, 3_650);
  assertEnum(
    input.revisionPolicy,
    ["first_release", "fixed_vintage", "latest_at_evaluation_cutoff"],
    "outcomeDefinition.revisionPolicy",
  );
  assertEnum(
    input.missingDataPolicy,
    ["exclude_with_reason", "score_as_unresolved"],
    "outcomeDefinition.missingDataPolicy",
  );
}

export function createOutcomeDefinition(
  input: OutcomeDefinitionInput,
): Readonly<OutcomeDefinition> {
  validateOutcomeDefinitionBody(input);
  const body = cloneCanonical({
    ...input,
    countryScope: [...input.countryScope].sort(),
    strategyScope: [...input.strategyScope].sort(),
    sourceSeriesKeys: [...input.sourceSeriesKeys].sort(),
  });
  const output = { ...body, manifestSha256: digestJson(body) };
  assertOutcomeDefinitionIntegrity(output);
  return deepFreeze(output);
}

export function assertOutcomeDefinitionIntegrity(outcome: OutcomeDefinition): void {
  assertExactKeys(
    outcome,
    [
      "schemaVersion",
      "outcomeDefinitionId",
      "version",
      "purpose",
      "assetClass",
      "metricKey",
      "description",
      "countryScope",
      "strategyScope",
      "horizonDays",
      "observationWindow",
      "direction",
      "calculationMethod",
      "sourceSeriesKeys",
      "availabilityLagDays",
      "revisionPolicy",
      "missingDataPolicy",
      "manifestSha256",
    ],
    "outcomeDefinition",
  );
  const { manifestSha256, ...body } = outcome;
  assertSha256(manifestSha256, "outcomeDefinition.manifestSha256");
  validateOutcomeDefinitionBody(body);
  for (const [field, values] of [
    ["countryScope", outcome.countryScope],
    ["strategyScope", outcome.strategyScope],
    ["sourceSeriesKeys", outcome.sourceSeriesKeys],
  ] as const) {
    if ([...values].sort().some((value, index) => value !== values[index])) {
      throw new TypeError(`outcomeDefinition.${field} must use deterministic order`);
    }
  }
  if (digestJson(body) !== manifestSha256) {
    throw new TypeError("outcome-definition manifest digest does not match its content");
  }
}

export interface TimeInterval {
  readonly start: string;
  readonly end: string;
}

export interface LeakageSentinels {
  readonly outcomeDefinitionLockedAt: string;
  readonly featureEngineeringFitThrough: string;
  readonly normalizationFitThrough: string;
  readonly hyperparameterSelectionFitThrough: string;
  readonly valuationModelFitThrough: string;
  readonly latestTrainingLabelAvailableAt: string;
  readonly calibrationFitThrough: string;
  readonly thresholdSelectionFitThrough: string;
}

export interface TemporalValidationFold {
  readonly foldId: string;
  readonly training: TimeInterval;
  readonly calibration: TimeInterval;
  readonly test: TimeInterval;
  readonly embargoDays: number;
  readonly sentinels: LeakageSentinels;
}

export interface TemporalValidationPlanInput {
  readonly schemaVersion: 1;
  readonly validationPlanId: string;
  readonly purpose: "chronological_research_validation";
  readonly mode: "expanding_window" | "rolling_window";
  readonly model: Readonly<{
    modelId: string;
    version: string;
    artifactSha256: string;
    status: "candidate" | "under_review" | "retired";
  }>;
  readonly outcomeDefinitionId: string;
  readonly outcomeDefinitionSha256: string;
  readonly folds: readonly TemporalValidationFold[];
}

export interface TemporalValidationPlan extends TemporalValidationPlanInput {
  readonly manifestSha256: string;
}

function validateInterval(interval: TimeInterval, field: string): void {
  assertExactKeys(interval, ["start", "end"], field);
  assertIsoInstant(interval.start, `${field}.start`);
  assertIsoInstant(interval.end, `${field}.end`);
  if (compareInstant(interval.start, interval.end) >= 0) {
    throw new TypeError(`${field} must start before it ends`);
  }
}

function assertBeforeOrAt(value: string, cutoff: string, field: string): void {
  if (compareInstant(value, cutoff) > 0) throw new TypeError(`${field} exceeds its fitting window`);
}

function validateTemporalPlanBody(input: TemporalValidationPlanInput): void {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "validationPlanId",
      "purpose",
      "mode",
      "model",
      "outcomeDefinitionId",
      "outcomeDefinitionSha256",
      "folds",
    ],
    "validationPlan",
  );
  if (input.schemaVersion !== 1) throw new TypeError("validationPlan.schemaVersion must be 1");
  assertUuid(input.validationPlanId, "validationPlan.validationPlanId");
  if (input.purpose !== "chronological_research_validation") {
    throw new TypeError("validationPlan purpose must remain chronological research validation");
  }
  assertEnum(input.mode, ["expanding_window", "rolling_window"], "validationPlan.mode");
  assertExactKeys(
    input.model,
    ["modelId", "version", "artifactSha256", "status"],
    "validationPlan.model",
  );
  assertUuid(input.model.modelId, "validationPlan.model.modelId");
  assertSemver(input.model.version, "validationPlan.model.version");
  assertSha256(input.model.artifactSha256, "validationPlan.model.artifactSha256");
  assertEnum(input.model.status, CANDIDATE_MODEL_STATUSES, "validationPlan.model.status");
  assertUuid(input.outcomeDefinitionId, "validationPlan.outcomeDefinitionId");
  assertSha256(input.outcomeDefinitionSha256, "validationPlan.outcomeDefinitionSha256");
  if (!Array.isArray(input.folds) || input.folds.length === 0) {
    throw new TypeError("validationPlan.folds must be a non-empty array");
  }
  const foldIds = new Set<string>();
  for (const [index, fold] of input.folds.entries()) {
    const field = `validationPlan.folds[${index}]`;
    assertExactKeys(
      fold,
      ["foldId", "training", "calibration", "test", "embargoDays", "sentinels"],
      field,
    );
    assertKey(fold.foldId, `${field}.foldId`);
    if (foldIds.has(fold.foldId)) throw new TypeError("validation foldId must be unique");
    foldIds.add(fold.foldId);
    validateInterval(fold.training, `${field}.training`);
    validateInterval(fold.calibration, `${field}.calibration`);
    validateInterval(fold.test, `${field}.test`);
    if (compareInstant(fold.training.end, fold.calibration.start) >= 0) {
      throw new TypeError("training must end before calibration begins");
    }
    if (compareInstant(fold.calibration.end, fold.test.start) >= 0) {
      throw new TypeError("calibration must end before test begins");
    }
    assertSafeInteger(fold.embargoDays, `${field}.embargoDays`, 0, 365);
    const requiredGap = fold.embargoDays * 86_400;
    if (
      secondsBetween(fold.training.end, fold.calibration.start) < requiredGap ||
      secondsBetween(fold.calibration.end, fold.test.start) < requiredGap
    ) {
      throw new TypeError("validation fold does not honor its declared embargoDays");
    }
    assertExactKeys(
      fold.sentinels,
      [
        "outcomeDefinitionLockedAt",
        "featureEngineeringFitThrough",
        "normalizationFitThrough",
        "hyperparameterSelectionFitThrough",
        "valuationModelFitThrough",
        "latestTrainingLabelAvailableAt",
        "calibrationFitThrough",
        "thresholdSelectionFitThrough",
      ],
      `${field}.sentinels`,
    );
    for (const [name, instant] of Object.entries(fold.sentinels)) {
      assertIsoInstant(instant, `${field}.sentinels.${name}`);
      if (compareInstant(instant, fold.test.start) >= 0) {
        throw new TypeError(`${name} leaks into the test interval`);
      }
    }
    assertBeforeOrAt(
      fold.sentinels.outcomeDefinitionLockedAt,
      fold.training.start,
      "outcomeDefinitionLockedAt",
    );
    for (const [name, instant] of [
      ["featureEngineeringFitThrough", fold.sentinels.featureEngineeringFitThrough],
      ["normalizationFitThrough", fold.sentinels.normalizationFitThrough],
      ["hyperparameterSelectionFitThrough", fold.sentinels.hyperparameterSelectionFitThrough],
      ["valuationModelFitThrough", fold.sentinels.valuationModelFitThrough],
      ["latestTrainingLabelAvailableAt", fold.sentinels.latestTrainingLabelAvailableAt],
    ] as const) {
      assertBeforeOrAt(instant, fold.training.end, name);
    }
    for (const [name, instant] of [
      ["calibrationFitThrough", fold.sentinels.calibrationFitThrough],
      ["thresholdSelectionFitThrough", fold.sentinels.thresholdSelectionFitThrough],
    ] as const) {
      assertBeforeOrAt(instant, fold.calibration.end, name);
    }
    const previous = input.folds[index - 1];
    if (previous) {
      if (compareInstant(previous.test.end, fold.test.start) >= 0) {
        throw new TypeError("test folds must be chronological and non-overlapping");
      }
      if (compareInstant(previous.training.end, fold.training.end) >= 0) {
        throw new TypeError("training windows must advance chronologically");
      }
      if (input.mode === "expanding_window" && previous.training.start !== fold.training.start) {
        throw new TypeError("expanding-window folds must preserve the training start");
      }
      if (
        input.mode === "rolling_window" &&
        compareInstant(previous.training.start, fold.training.start) > 0
      ) {
        throw new TypeError("rolling-window training starts cannot move backward");
      }
    }
  }
}

export function createTemporalValidationPlan(
  input: TemporalValidationPlanInput,
): Readonly<TemporalValidationPlan> {
  validateTemporalPlanBody(input);
  const body = cloneCanonical(input);
  const output = { ...body, manifestSha256: digestJson(body) };
  assertTemporalValidationPlanIntegrity(output);
  return deepFreeze(output);
}

export function assertTemporalValidationPlanIntegrity(plan: TemporalValidationPlan): void {
  assertExactKeys(
    plan,
    [
      "schemaVersion",
      "validationPlanId",
      "purpose",
      "mode",
      "model",
      "outcomeDefinitionId",
      "outcomeDefinitionSha256",
      "folds",
      "manifestSha256",
    ],
    "validationPlan",
  );
  const { manifestSha256, ...body } = plan;
  assertSha256(manifestSha256, "validationPlan.manifestSha256");
  validateTemporalPlanBody(body);
  if (digestJson(body) !== manifestSha256) {
    throw new TypeError("temporal-validation manifest digest does not match its content");
  }
}
