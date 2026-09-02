import {
  assertEnum,
  assertExactKeys,
  assertIsoInstant,
  assertKey,
  assertRecord,
  assertSemver,
  assertSha256,
  assertSorted,
  assertText,
  assertUuid,
  cloneCanonical,
  deepFreeze,
  digestJson,
  expectArray,
  expectInteger,
  expectNullableString,
  expectString,
  sortedUnique,
} from "./internals.js";

export const POPULATION_UNIT_TYPES = [
  "country",
  "event",
  "firm",
  "household",
  "market",
  "person",
  "region",
  "sector",
  "sovereign",
] as const;
export type PopulationUnitType = (typeof POPULATION_UNIT_TYPES)[number];

export const EXPOSURE_TYPES = ["binary", "categorical", "continuous", "time_varying"] as const;
export type ExposureType = (typeof EXPOSURE_TYPES)[number];

export interface EstimandPopulation {
  readonly unitType: PopulationUnitType;
  readonly unitDefinition: string;
  readonly inclusionCriteria: readonly string[];
  readonly exclusionCriteria: readonly string[];
  readonly geographicScope: readonly string[];
}

export interface EstimandTreatment {
  readonly exposureKey: string;
  readonly exposureType: ExposureType;
  readonly assignmentUnit: string;
  readonly interventionDescription: string;
  readonly versionsHeldConstant: readonly string[];
}

export interface EstimandComparator {
  readonly kind: "alternative_exposure" | "no_exposure" | "threshold_counterfactual" | "trajectory";
  readonly description: string;
  readonly valueLabel: string | null;
}

export interface EstimandOutcome {
  readonly outcomeKey: string;
  readonly description: string;
  readonly unit: string;
  readonly aggregationLevel: string;
}

export interface EstimandTimeZero {
  readonly anchorKey: string;
  readonly definition: string;
  readonly alignmentToleranceDays: number;
}

export interface EstimandOutcomeWindow {
  readonly startOffsetDays: number;
  readonly endOffsetDays: number;
  readonly horizonDays: number;
}

export interface EstimandAggregation {
  readonly summary:
    | "average_treatment_effect"
    | "conditional_average"
    | "local_average"
    | "unit_level";
  readonly weighting: "equal_unit" | "population" | "predeclared_custom";
  readonly weightingDescription: string;
}

export interface InterferenceScope {
  readonly scope: "none_assumed" | "partial_interference" | "network_interference";
  readonly clusterKey: string | null;
  readonly exposureMapping: string;
}

export interface SutvaScope {
  readonly consistencyStatement: string;
  readonly hiddenVersionsPolicy: string;
  readonly interferenceStatement: string;
}

export interface EstimandDefinitionInput {
  readonly schemaVersion: 1;
  readonly estimandId: string;
  readonly estimandKey: string;
  readonly version: string;
  readonly population: EstimandPopulation;
  readonly treatment: EstimandTreatment;
  readonly comparator: EstimandComparator;
  readonly outcome: EstimandOutcome;
  readonly timeZero: EstimandTimeZero;
  readonly outcomeWindow: EstimandOutcomeWindow;
  readonly aggregation: EstimandAggregation;
  readonly interference: InterferenceScope;
  readonly sutva: SutvaScope;
  readonly ownerId: string;
  readonly createdAt: string;
  readonly limitations: readonly string[];
}

export interface EstimandDefinition extends EstimandDefinitionInput {
  readonly manifestSha256: string;
}

const BODY_KEYS = [
  "schemaVersion",
  "estimandId",
  "estimandKey",
  "version",
  "population",
  "treatment",
  "comparator",
  "outcome",
  "timeZero",
  "outcomeWindow",
  "aggregation",
  "interference",
  "sutva",
  "ownerId",
  "createdAt",
  "limitations",
] as const;

function textArray(value: unknown, field: string, allowEmpty = false): string[] {
  const array = expectArray(value, field);
  if (!allowEmpty && array.length === 0) throw new TypeError(`${field} must not be empty`);
  return array.map((item, index) => {
    const text = expectString(item, `${field}[${index}]`);
    assertText(text, `${field}[${index}]`, 1_000);
    return text;
  });
}

function parsePopulation(value: unknown): EstimandPopulation {
  assertRecord(value, "estimand.population");
  assertExactKeys(
    value,
    ["unitType", "unitDefinition", "inclusionCriteria", "exclusionCriteria", "geographicScope"],
    "estimand.population",
  );
  const unitType = expectString(value.unitType, "estimand.population.unitType");
  assertEnum(unitType, POPULATION_UNIT_TYPES, "estimand.population.unitType");
  const unitDefinition = expectString(value.unitDefinition, "estimand.population.unitDefinition");
  assertText(unitDefinition, "estimand.population.unitDefinition");
  const geographicScope = expectArray(
    value.geographicScope,
    "estimand.population.geographicScope",
  ).map((item, index) => expectString(item, `estimand.population.geographicScope[${index}]`));
  return {
    unitType,
    unitDefinition,
    inclusionCriteria: textArray(value.inclusionCriteria, "estimand.population.inclusionCriteria"),
    exclusionCriteria: textArray(
      value.exclusionCriteria,
      "estimand.population.exclusionCriteria",
      true,
    ),
    geographicScope: sortedUnique(
      geographicScope,
      "estimand.population.geographicScope",
      assertKey,
    ),
  };
}

function parseTreatment(value: unknown): EstimandTreatment {
  assertRecord(value, "estimand.treatment");
  assertExactKeys(
    value,
    [
      "exposureKey",
      "exposureType",
      "assignmentUnit",
      "interventionDescription",
      "versionsHeldConstant",
    ],
    "estimand.treatment",
  );
  const exposureKey = expectString(value.exposureKey, "estimand.treatment.exposureKey");
  const exposureType = expectString(value.exposureType, "estimand.treatment.exposureType");
  const assignmentUnit = expectString(value.assignmentUnit, "estimand.treatment.assignmentUnit");
  const interventionDescription = expectString(
    value.interventionDescription,
    "estimand.treatment.interventionDescription",
  );
  assertKey(exposureKey, "estimand.treatment.exposureKey");
  assertEnum(exposureType, EXPOSURE_TYPES, "estimand.treatment.exposureType");
  assertKey(assignmentUnit, "estimand.treatment.assignmentUnit");
  assertText(interventionDescription, "estimand.treatment.interventionDescription");
  return {
    exposureKey,
    exposureType,
    assignmentUnit,
    interventionDescription,
    versionsHeldConstant: textArray(
      value.versionsHeldConstant,
      "estimand.treatment.versionsHeldConstant",
    ),
  };
}

function parseComparator(value: unknown): EstimandComparator {
  assertRecord(value, "estimand.comparator");
  assertExactKeys(value, ["kind", "description", "valueLabel"], "estimand.comparator");
  const kind = expectString(value.kind, "estimand.comparator.kind");
  assertEnum(
    kind,
    ["alternative_exposure", "no_exposure", "threshold_counterfactual", "trajectory"],
    "estimand.comparator.kind",
  );
  const description = expectString(value.description, "estimand.comparator.description");
  const valueLabel = expectNullableString(value.valueLabel, "estimand.comparator.valueLabel");
  assertText(description, "estimand.comparator.description");
  if (valueLabel !== null) assertText(valueLabel, "estimand.comparator.valueLabel", 500);
  if (kind === "no_exposure" && valueLabel !== null) {
    throw new TypeError("no-exposure comparator cannot declare a value label");
  }
  if (kind !== "no_exposure" && valueLabel === null) {
    throw new TypeError(`${kind} comparator requires a value label`);
  }
  return { kind, description, valueLabel };
}

function parseOutcome(value: unknown): EstimandOutcome {
  assertRecord(value, "estimand.outcome");
  assertExactKeys(
    value,
    ["outcomeKey", "description", "unit", "aggregationLevel"],
    "estimand.outcome",
  );
  const outcomeKey = expectString(value.outcomeKey, "estimand.outcome.outcomeKey");
  const description = expectString(value.description, "estimand.outcome.description");
  const unit = expectString(value.unit, "estimand.outcome.unit");
  const aggregationLevel = expectString(
    value.aggregationLevel,
    "estimand.outcome.aggregationLevel",
  );
  assertKey(outcomeKey, "estimand.outcome.outcomeKey");
  assertText(description, "estimand.outcome.description");
  assertText(unit, "estimand.outcome.unit", 100);
  assertKey(aggregationLevel, "estimand.outcome.aggregationLevel");
  return { outcomeKey, description, unit, aggregationLevel };
}

function parseTimeZero(value: unknown): EstimandTimeZero {
  assertRecord(value, "estimand.timeZero");
  assertExactKeys(
    value,
    ["anchorKey", "definition", "alignmentToleranceDays"],
    "estimand.timeZero",
  );
  const anchorKey = expectString(value.anchorKey, "estimand.timeZero.anchorKey");
  const definition = expectString(value.definition, "estimand.timeZero.definition");
  assertKey(anchorKey, "estimand.timeZero.anchorKey");
  assertText(definition, "estimand.timeZero.definition");
  return {
    anchorKey,
    definition,
    alignmentToleranceDays: expectInteger(
      value.alignmentToleranceDays,
      "estimand.timeZero.alignmentToleranceDays",
      0,
      365,
    ),
  };
}

function parseOutcomeWindow(value: unknown): EstimandOutcomeWindow {
  assertRecord(value, "estimand.outcomeWindow");
  assertExactKeys(
    value,
    ["startOffsetDays", "endOffsetDays", "horizonDays"],
    "estimand.outcomeWindow",
  );
  const startOffsetDays = expectInteger(
    value.startOffsetDays,
    "estimand.outcomeWindow.startOffsetDays",
    0,
    36_500,
  );
  const endOffsetDays = expectInteger(
    value.endOffsetDays,
    "estimand.outcomeWindow.endOffsetDays",
    1,
    36_500,
  );
  const horizonDays = expectInteger(
    value.horizonDays,
    "estimand.outcomeWindow.horizonDays",
    1,
    36_500,
  );
  if (endOffsetDays <= startOffsetDays) {
    throw new TypeError("estimand outcome window must have positive duration");
  }
  if (horizonDays !== endOffsetDays) {
    throw new TypeError("estimand horizon must equal the outcome-window end offset");
  }
  return { startOffsetDays, endOffsetDays, horizonDays };
}

function parseAggregation(value: unknown): EstimandAggregation {
  assertRecord(value, "estimand.aggregation");
  assertExactKeys(value, ["summary", "weighting", "weightingDescription"], "estimand.aggregation");
  const summary = expectString(value.summary, "estimand.aggregation.summary");
  const weighting = expectString(value.weighting, "estimand.aggregation.weighting");
  const weightingDescription = expectString(
    value.weightingDescription,
    "estimand.aggregation.weightingDescription",
  );
  assertEnum(
    summary,
    ["average_treatment_effect", "conditional_average", "local_average", "unit_level"],
    "estimand.aggregation.summary",
  );
  assertEnum(
    weighting,
    ["equal_unit", "population", "predeclared_custom"],
    "estimand.aggregation.weighting",
  );
  assertText(weightingDescription, "estimand.aggregation.weightingDescription");
  return { summary, weighting, weightingDescription };
}

function parseInterference(value: unknown): InterferenceScope {
  assertRecord(value, "estimand.interference");
  assertExactKeys(value, ["scope", "clusterKey", "exposureMapping"], "estimand.interference");
  const scope = expectString(value.scope, "estimand.interference.scope");
  const clusterKey = expectNullableString(value.clusterKey, "estimand.interference.clusterKey");
  const exposureMapping = expectString(
    value.exposureMapping,
    "estimand.interference.exposureMapping",
  );
  assertEnum(
    scope,
    ["none_assumed", "partial_interference", "network_interference"],
    "estimand.interference.scope",
  );
  assertText(exposureMapping, "estimand.interference.exposureMapping");
  if (scope === "none_assumed" && clusterKey !== null) {
    throw new TypeError("no-interference scope cannot declare a cluster key");
  }
  if (scope !== "none_assumed" && clusterKey === null) {
    throw new TypeError(`${scope} requires a cluster key`);
  }
  if (clusterKey !== null) assertKey(clusterKey, "estimand.interference.clusterKey");
  return { scope, clusterKey, exposureMapping };
}

function parseSutva(value: unknown): SutvaScope {
  assertRecord(value, "estimand.sutva");
  assertExactKeys(
    value,
    ["consistencyStatement", "hiddenVersionsPolicy", "interferenceStatement"],
    "estimand.sutva",
  );
  const consistencyStatement = expectString(
    value.consistencyStatement,
    "estimand.sutva.consistencyStatement",
  );
  const hiddenVersionsPolicy = expectString(
    value.hiddenVersionsPolicy,
    "estimand.sutva.hiddenVersionsPolicy",
  );
  const interferenceStatement = expectString(
    value.interferenceStatement,
    "estimand.sutva.interferenceStatement",
  );
  for (const [field, text] of [
    ["consistencyStatement", consistencyStatement],
    ["hiddenVersionsPolicy", hiddenVersionsPolicy],
    ["interferenceStatement", interferenceStatement],
  ] as const) {
    assertText(text, `estimand.sutva.${field}`);
  }
  return { consistencyStatement, hiddenVersionsPolicy, interferenceStatement };
}

function parseEstimandBody(value: unknown): EstimandDefinitionInput {
  assertRecord(value, "estimand");
  assertExactKeys(value, BODY_KEYS, "estimand");
  if (value.schemaVersion !== 1) throw new TypeError("estimand.schemaVersion must be 1");
  const estimandId = expectString(value.estimandId, "estimand.estimandId");
  const estimandKey = expectString(value.estimandKey, "estimand.estimandKey");
  const version = expectString(value.version, "estimand.version");
  const ownerId = expectString(value.ownerId, "estimand.ownerId");
  const createdAt = expectString(value.createdAt, "estimand.createdAt");
  assertUuid(estimandId, "estimand.estimandId");
  assertKey(estimandKey, "estimand.estimandKey");
  assertSemver(version, "estimand.version");
  assertUuid(ownerId, "estimand.ownerId");
  assertIsoInstant(createdAt, "estimand.createdAt");
  return {
    schemaVersion: 1,
    estimandId,
    estimandKey,
    version,
    population: parsePopulation(value.population),
    treatment: parseTreatment(value.treatment),
    comparator: parseComparator(value.comparator),
    outcome: parseOutcome(value.outcome),
    timeZero: parseTimeZero(value.timeZero),
    outcomeWindow: parseOutcomeWindow(value.outcomeWindow),
    aggregation: parseAggregation(value.aggregation),
    interference: parseInterference(value.interference),
    sutva: parseSutva(value.sutva),
    ownerId,
    createdAt,
    limitations: textArray(value.limitations, "estimand.limitations"),
  };
}

export function createEstimandDefinition(value: unknown): Readonly<EstimandDefinition> {
  const body = cloneCanonical(parseEstimandBody(value));
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function assertEstimandDefinitionIntegrity(
  value: unknown,
): asserts value is EstimandDefinition {
  assertRecord(value, "estimand");
  assertExactKeys(value, [...BODY_KEYS, "manifestSha256"], "estimand");
  const manifestSha256 = expectString(value.manifestSha256, "estimand.manifestSha256");
  assertSha256(manifestSha256, "estimand.manifestSha256");
  const body = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "manifestSha256"),
  );
  const parsed = parseEstimandBody(body);
  assertSorted(parsed.population.geographicScope, "estimand.population.geographicScope");
  if (digestJson(parsed) !== manifestSha256) {
    throw new TypeError("estimand manifest digest does not match immutable content");
  }
}
