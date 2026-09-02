import {
  assertIsoInstant,
  assertKey,
  assertNonBlank,
  assertPositiveInteger,
  assertProbability,
  assertSemver,
  assertSha256,
  assertUuid,
  cloneCanonical,
  compareInstant,
  compareProbability,
  deepFreeze,
  digestJson,
} from "./internals.js";

export const CRISIS_HAZARDS = ["FX", "BANK", "SOV", "MON", "POL", "COUP", "CIV", "WAR"] as const;
export type CrisisHazard = (typeof CRISIS_HAZARDS)[number];

export const CRISIS_HORIZONS = [
  { key: "30d", days: 30 },
  { key: "90d", days: 90 },
  { key: "180d", days: 180 },
  { key: "365d", days: 365 },
] as const;
export type CrisisHorizon = (typeof CRISIS_HORIZONS)[number];

export interface ForecastEvidenceItem {
  readonly evidenceId: string;
  readonly indicatorKey: string;
  readonly direction: "increases_risk" | "decreases_risk";
  readonly valueAsKnown: string;
  readonly observedAt: string;
  readonly availableAt: string;
  readonly dataVintageId: string;
  readonly evidenceSha256: string;
}

export interface ForecastEvidenceAssessment {
  readonly items: readonly ForecastEvidenceItem[];
  readonly absenceReason: string | null;
}

export interface ForecastUncertainty {
  readonly lowerProbability: string;
  readonly upperProbability: string;
  readonly confidenceLevel: string;
  readonly method: string;
}

export interface CrisisModelProvenance {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly dataVintageId: string;
  readonly dataVintageSha256: string;
  readonly dataVintageAvailableAt: string;
  readonly configurationSha256: string;
  readonly codeSha256: string;
  readonly trainingDataCutoff: string;
  readonly calibratedThrough: string;
}

export interface ForecastInvalidationCriterion {
  readonly criterionId: string;
  readonly description: string;
  readonly indicatorKey: string;
  readonly operator:
    | "less_than"
    | "less_than_or_equal"
    | "greater_than"
    | "greater_than_or_equal"
    | "equals";
  readonly threshold: string;
  readonly requiredObservations: number;
}

export interface CrisisForecastInput {
  readonly schemaVersion: 1;
  readonly forecastId: string;
  readonly geographyId: string;
  readonly hazard: CrisisHazard;
  readonly horizon: CrisisHorizon;
  readonly generatedAt: string;
  readonly asOf: string;
  readonly rawProbability: string;
  readonly calibratedProbability: string;
  readonly uncertainty: ForecastUncertainty;
  readonly evidence: ForecastEvidenceAssessment;
  readonly counterEvidence: ForecastEvidenceAssessment;
  readonly leadingIndicators: readonly string[];
  readonly provenance: CrisisModelProvenance;
  readonly assumptions: readonly string[];
  readonly invalidationCriteria: readonly ForecastInvalidationCriterion[];
}

export interface CrisisForecast extends CrisisForecastInput {
  readonly manifestSha256: string;
}

export interface CrisisForecastRunInput {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly generatedAt: string;
  readonly asOf: string;
  readonly geographyId: string;
  readonly forecasts: readonly CrisisForecast[];
}

export interface CrisisForecastRun extends CrisisForecastRunInput {
  readonly manifestSha256: string;
}

function isHazard(value: string): value is CrisisHazard {
  return (CRISIS_HAZARDS as readonly string[]).includes(value);
}

function assertHorizon(value: CrisisHorizon): void {
  const canonical = CRISIS_HORIZONS.find((horizon) => horizon.key === value.key);
  if (!canonical || canonical.days !== value.days) {
    throw new TypeError("horizon must be one of the explicit canonical horizons");
  }
}

function assertEvidenceAssessment(
  assessment: ForecastEvidenceAssessment,
  field: "evidence" | "counterEvidence",
  asOf: string,
  provenanceDataVintageId: string,
): void {
  if (assessment.items.length === 0) {
    if (assessment.absenceReason === null) {
      throw new TypeError(`${field} must contain items or an explicit absence reason`);
    }
    assertNonBlank(assessment.absenceReason, `${field}.absenceReason`);
  } else if (assessment.absenceReason !== null) {
    throw new TypeError(`${field}.absenceReason must be null when items are present`);
  }
  const ids = new Set<string>();
  for (const [index, item] of assessment.items.entries()) {
    assertUuid(item.evidenceId, `${field}.items[${index}].evidenceId`);
    if (ids.has(item.evidenceId)) throw new TypeError(`${field} contains a duplicate evidenceId`);
    ids.add(item.evidenceId);
    assertKey(item.indicatorKey, `${field}.items[${index}].indicatorKey`);
    if (item.direction !== "increases_risk" && item.direction !== "decreases_risk") {
      throw new TypeError(`${field} item direction must increase or decrease risk`);
    }
    assertNonBlank(item.valueAsKnown, `${field}.items[${index}].valueAsKnown`);
    assertIsoInstant(item.observedAt, `${field}.items[${index}].observedAt`);
    assertIsoInstant(item.availableAt, `${field}.items[${index}].availableAt`);
    if (compareInstant(item.availableAt, item.observedAt) < 0) {
      throw new TypeError(`${field} item cannot be available before it was observed`);
    }
    if (compareInstant(item.availableAt, asOf) > 0) {
      throw new TypeError(`${field} item was available after forecast.asOf`);
    }
    assertUuid(item.dataVintageId, `${field}.items[${index}].dataVintageId`);
    if (item.dataVintageId !== provenanceDataVintageId) {
      throw new TypeError(`${field} item dataVintageId must match provenance.dataVintageId`);
    }
    assertSha256(item.evidenceSha256, `${field}.items[${index}].evidenceSha256`);
  }
}

function assertForecastInput(input: CrisisForecastInput): void {
  if (input.schemaVersion !== 1) throw new TypeError("forecast.schemaVersion must be 1");
  assertUuid(input.forecastId, "forecastId");
  assertUuid(input.geographyId, "geographyId");
  if (!isHazard(input.hazard))
    throw new TypeError("hazard must be one of the eight independent hazards");
  assertHorizon(input.horizon);
  assertIsoInstant(input.asOf, "forecast.asOf");
  assertIsoInstant(input.generatedAt, "forecast.generatedAt");
  if (compareInstant(input.generatedAt, input.asOf) < 0) {
    throw new TypeError("forecast.generatedAt cannot be before forecast.asOf");
  }
  assertProbability(input.rawProbability, "rawProbability");
  assertProbability(input.calibratedProbability, "calibratedProbability");
  assertProbability(input.uncertainty.lowerProbability, "uncertainty.lowerProbability");
  assertProbability(input.uncertainty.upperProbability, "uncertainty.upperProbability");
  assertProbability(input.uncertainty.confidenceLevel, "uncertainty.confidenceLevel");
  assertNonBlank(input.uncertainty.method, "uncertainty.method", 200);
  if (
    compareProbability(input.uncertainty.lowerProbability, input.calibratedProbability) > 0 ||
    compareProbability(input.calibratedProbability, input.uncertainty.upperProbability) > 0
  ) {
    throw new TypeError("calibratedProbability must lie inside its uncertainty interval");
  }
  assertEvidenceAssessment(input.evidence, "evidence", input.asOf, input.provenance.dataVintageId);
  assertEvidenceAssessment(
    input.counterEvidence,
    "counterEvidence",
    input.asOf,
    input.provenance.dataVintageId,
  );
  const evidenceIds = new Set(input.evidence.items.map((item) => item.evidenceId));
  if (input.counterEvidence.items.some((item) => evidenceIds.has(item.evidenceId))) {
    throw new TypeError("same evidenceId cannot appear in evidence and counterEvidence");
  }
  if (input.leadingIndicators.length === 0)
    throw new TypeError("leadingIndicators must not be empty");
  const indicators = new Set<string>();
  for (const indicator of input.leadingIndicators) {
    assertKey(indicator, "leadingIndicators item");
    if (indicators.has(indicator)) throw new TypeError("leadingIndicators must be unique");
    indicators.add(indicator);
  }
  assertUuid(input.provenance.modelId, "provenance.modelId");
  assertSemver(input.provenance.modelVersion, "provenance.modelVersion");
  assertUuid(input.provenance.dataVintageId, "provenance.dataVintageId");
  assertSha256(input.provenance.dataVintageSha256, "provenance.dataVintageSha256");
  assertIsoInstant(input.provenance.dataVintageAvailableAt, "provenance.dataVintageAvailableAt");
  if (compareInstant(input.provenance.dataVintageAvailableAt, input.asOf) > 0) {
    throw new TypeError("dataVintageAvailableAt cannot be after forecast.asOf");
  }
  assertSha256(input.provenance.configurationSha256, "provenance.configurationSha256");
  assertSha256(input.provenance.codeSha256, "provenance.codeSha256");
  assertIsoInstant(input.provenance.trainingDataCutoff, "provenance.trainingDataCutoff");
  assertIsoInstant(input.provenance.calibratedThrough, "provenance.calibratedThrough");
  if (compareInstant(input.provenance.trainingDataCutoff, input.provenance.calibratedThrough) > 0) {
    throw new TypeError("trainingDataCutoff cannot be after calibratedThrough");
  }
  if (compareInstant(input.provenance.calibratedThrough, input.asOf) > 0) {
    throw new TypeError("calibratedThrough cannot be after forecast.asOf");
  }
  if (input.assumptions.length === 0) throw new TypeError("assumptions must not be empty");
  for (const assumption of input.assumptions) assertNonBlank(assumption, "assumption");
  if (input.invalidationCriteria.length === 0) {
    throw new TypeError("invalidationCriteria must not be empty");
  }
  const criteria = new Set<string>();
  for (const criterion of input.invalidationCriteria) {
    assertKey(criterion.criterionId, "invalidation criterionId");
    if (criteria.has(criterion.criterionId))
      throw new TypeError("invalidation criterionId must be unique");
    criteria.add(criterion.criterionId);
    assertNonBlank(criterion.description, "invalidation description");
    assertKey(criterion.indicatorKey, "invalidation indicatorKey");
    if (
      criterion.operator !== "less_than" &&
      criterion.operator !== "less_than_or_equal" &&
      criterion.operator !== "greater_than" &&
      criterion.operator !== "greater_than_or_equal" &&
      criterion.operator !== "equals"
    ) {
      throw new TypeError("invalidation operator is invalid");
    }
    assertNonBlank(criterion.threshold, "invalidation threshold");
    assertPositiveInteger(criterion.requiredObservations, "invalidation requiredObservations");
  }
}

export function createCrisisForecast(input: CrisisForecastInput): Readonly<CrisisForecast> {
  assertForecastInput(input);
  const body = cloneCanonical(input);
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function assertForecastIntegrity(forecast: CrisisForecast): void {
  const { manifestSha256, ...body } = forecast;
  assertSha256(manifestSha256, "forecast.manifestSha256");
  assertForecastInput(body);
  if (digestJson(body) !== manifestSha256)
    throw new TypeError("forecast manifest digest does not match");
}

export function createCrisisForecastRun(
  input: CrisisForecastRunInput,
): Readonly<CrisisForecastRun> {
  if (input.schemaVersion !== 1) throw new TypeError("run.schemaVersion must be 1");
  assertUuid(input.runId, "runId");
  assertUuid(input.geographyId, "run.geographyId");
  assertIsoInstant(input.generatedAt, "run.generatedAt");
  assertIsoInstant(input.asOf, "run.asOf");
  const slots = new Map<string, CrisisForecast>();
  for (const forecast of input.forecasts) {
    assertForecastIntegrity(forecast);
    if (
      forecast.geographyId !== input.geographyId ||
      forecast.asOf !== input.asOf ||
      forecast.generatedAt !== input.generatedAt
    ) {
      throw new TypeError("all run forecasts must share geography, asOf, and generatedAt");
    }
    const slot = `${forecast.hazard}:${forecast.horizon.key}`;
    if (slots.has(slot)) throw new TypeError("run contains a duplicate hazard and horizon slot");
    slots.set(slot, forecast);
  }
  if (slots.size !== CRISIS_HAZARDS.length * CRISIS_HORIZONS.length) {
    throw new TypeError("run must contain exactly one forecast for each hazard and horizon");
  }
  const forecasts = CRISIS_HAZARDS.flatMap((hazard) =>
    CRISIS_HORIZONS.map((horizon) => slots.get(`${hazard}:${horizon.key}`) as CrisisForecast),
  );
  const body = cloneCanonical({
    schemaVersion: 1 as const,
    runId: input.runId,
    generatedAt: input.generatedAt,
    asOf: input.asOf,
    geographyId: input.geographyId,
    forecasts,
  });
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}
