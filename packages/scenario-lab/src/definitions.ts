import {
  assertDecimal,
  assertDigestIntegrity,
  assertExactKeys,
  assertInteger,
  assertIsoInstant,
  assertKey,
  assertKeyOrWildcard,
  assertNonBlank,
  assertPlainRecord,
  assertSemver,
  assertSha256,
  assertStringArray,
  assertUuid,
  canonicalDecimal,
  compareInstants,
  immutableWithDigest,
  uniqueBy,
} from "./internals.js";

export interface ObservedSnapshotPin {
  readonly snapshotId: string;
  readonly snapshotSha256: string;
  readonly observedThrough: string;
  readonly availableAt: string;
}

export interface ForecastSnapshotPin {
  readonly snapshotId: string;
  readonly snapshotSha256: string;
  readonly generatedAt: string;
  readonly informationCutoff: string;
  readonly methodologyVersion: string;
}

export interface ModelPin {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly artifactSha256: string;
  readonly trainingDataCutoff: string;
  readonly codeSha256: string;
  readonly configurationSha256: string;
}

export interface BaselineIdentityInput {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly baselineId: string;
  readonly createdAt: string;
  readonly pointInTimeCutoff: string;
  readonly dataClass: "pinned_research_baseline";
  readonly canonicalObservedDatasetEligible: false;
  readonly observedSnapshot: ObservedSnapshotPin;
  readonly forecastSnapshot: ForecastSnapshotPin;
  readonly model: ModelPin;
  readonly baselineResultSha256: string;
}

export interface BaselineIdentity extends BaselineIdentityInput {
  readonly manifestSha256: string;
}

const BASELINE_KEYS = [
  "schemaVersion",
  "tenantId",
  "baselineId",
  "createdAt",
  "pointInTimeCutoff",
  "dataClass",
  "canonicalObservedDatasetEligible",
  "observedSnapshot",
  "forecastSnapshot",
  "model",
  "baselineResultSha256",
] as const;

export function createBaselineIdentity(input: BaselineIdentityInput): Readonly<BaselineIdentity> {
  assertPlainRecord(input, "baseline");
  assertExactKeys(input, BASELINE_KEYS, "baseline");
  if (input.schemaVersion !== 1) throw new TypeError("baseline.schemaVersion must be 1");
  assertUuid(input.tenantId, "baseline.tenantId");
  assertUuid(input.baselineId, "baseline.baselineId");
  assertIsoInstant(input.createdAt, "baseline.createdAt");
  assertIsoInstant(input.pointInTimeCutoff, "baseline.pointInTimeCutoff");
  if (compareInstants(input.createdAt, input.pointInTimeCutoff) < 0) {
    throw new TypeError("baseline cannot be created before its point-in-time cutoff");
  }
  if (
    input.dataClass !== "pinned_research_baseline" ||
    input.canonicalObservedDatasetEligible !== false
  ) {
    throw new TypeError("modeled baselines are research artifacts, not observed datasets");
  }

  assertPlainRecord(input.observedSnapshot, "baseline.observedSnapshot");
  assertExactKeys(
    input.observedSnapshot,
    ["snapshotId", "snapshotSha256", "observedThrough", "availableAt"],
    "baseline.observedSnapshot",
  );
  assertUuid(input.observedSnapshot.snapshotId, "observedSnapshot.snapshotId");
  assertSha256(input.observedSnapshot.snapshotSha256, "observedSnapshot.snapshotSha256");
  assertIsoInstant(input.observedSnapshot.observedThrough, "observedSnapshot.observedThrough");
  assertIsoInstant(input.observedSnapshot.availableAt, "observedSnapshot.availableAt");
  if (
    compareInstants(input.observedSnapshot.observedThrough, input.pointInTimeCutoff) > 0 ||
    compareInstants(input.observedSnapshot.availableAt, input.pointInTimeCutoff) > 0
  ) {
    throw new TypeError("observed snapshot violates the point-in-time cutoff");
  }
  if (
    compareInstants(input.observedSnapshot.availableAt, input.observedSnapshot.observedThrough) < 0
  ) {
    throw new TypeError("observed snapshot cannot be available before its observation period");
  }

  assertPlainRecord(input.forecastSnapshot, "baseline.forecastSnapshot");
  assertExactKeys(
    input.forecastSnapshot,
    ["snapshotId", "snapshotSha256", "generatedAt", "informationCutoff", "methodologyVersion"],
    "baseline.forecastSnapshot",
  );
  assertUuid(input.forecastSnapshot.snapshotId, "forecastSnapshot.snapshotId");
  assertSha256(input.forecastSnapshot.snapshotSha256, "forecastSnapshot.snapshotSha256");
  assertIsoInstant(input.forecastSnapshot.generatedAt, "forecastSnapshot.generatedAt");
  assertIsoInstant(input.forecastSnapshot.informationCutoff, "forecastSnapshot.informationCutoff");
  assertSemver(input.forecastSnapshot.methodologyVersion, "forecastSnapshot.methodologyVersion");
  if (
    compareInstants(input.forecastSnapshot.informationCutoff, input.pointInTimeCutoff) > 0 ||
    compareInstants(input.forecastSnapshot.generatedAt, input.pointInTimeCutoff) > 0 ||
    compareInstants(input.forecastSnapshot.informationCutoff, input.forecastSnapshot.generatedAt) >
      0
  ) {
    throw new TypeError("forecast snapshot violates its pinned information chronology");
  }

  assertPlainRecord(input.model, "baseline.model");
  assertExactKeys(
    input.model,
    [
      "modelId",
      "modelVersion",
      "artifactSha256",
      "trainingDataCutoff",
      "codeSha256",
      "configurationSha256",
    ],
    "baseline.model",
  );
  assertUuid(input.model.modelId, "model.modelId");
  assertSemver(input.model.modelVersion, "model.modelVersion");
  assertSha256(input.model.artifactSha256, "model.artifactSha256");
  assertSha256(input.model.codeSha256, "model.codeSha256");
  assertSha256(input.model.configurationSha256, "model.configurationSha256");
  assertIsoInstant(input.model.trainingDataCutoff, "model.trainingDataCutoff");
  if (compareInstants(input.model.trainingDataCutoff, input.pointInTimeCutoff) > 0) {
    throw new TypeError("model training data exceeds the point-in-time cutoff");
  }
  if (
    compareInstants(input.model.trainingDataCutoff, input.forecastSnapshot.informationCutoff) > 0
  ) {
    throw new TypeError("forecast baseline model training exceeds its information cutoff");
  }
  assertSha256(input.baselineResultSha256, "baseline.baselineResultSha256");
  return immutableWithDigest(input);
}

export function assertBaselineIntegrity(baseline: BaselineIdentity): void {
  assertDigestIntegrity(baseline, "baseline");
  const { manifestSha256: _digest, ...body } = baseline;
  createBaselineIdentity(body);
}

export type ScenarioOperation = "additive" | "multiply" | "set";

export interface ScenarioTarget {
  readonly geographyKey: string;
  readonly sectorKey: string;
  readonly metricKey: string;
  readonly unit: string;
}

interface ScenarioActionCommon {
  readonly actionKey: string;
  readonly target: ScenarioTarget;
  readonly startStep: number;
  readonly endStep: number;
  readonly operation: ScenarioOperation;
  readonly value: string;
  readonly priority: number;
  readonly rationale: string;
  readonly citationIds: readonly string[];
}

export interface ScenarioShock extends ScenarioActionCommon {
  readonly actionKind: "shock";
  readonly shockType: "demand" | "supply" | "financial" | "climate" | "geopolitical" | "other";
}

export interface PolicyIntervention extends ScenarioActionCommon {
  readonly actionKind: "policy_intervention";
  readonly instrumentKey: string;
  readonly hypothetical: true;
  readonly notPolicyRecommendation: true;
}

export type ScenarioAction = ScenarioShock | PolicyIntervention;

export interface ScenarioAssumption {
  readonly assumptionKey: string;
  readonly statement: string;
  readonly rationale: string;
  readonly sensitivityRequired: boolean;
  readonly citationIds: readonly string[];
}

export interface ScenarioConflict {
  readonly leftActionKey: string;
  readonly rightActionKey: string;
  readonly targetPattern: string;
  readonly overlapStartStep: number;
  readonly overlapEndStep: number;
  readonly resolutionOrder: readonly [string, string];
}

export interface ScenarioDefinitionInput {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly scenarioId: string;
  readonly definitionVersion: number;
  readonly previousDefinitionSha256: string | null;
  readonly baselineId: string;
  readonly baselineIdentitySha256: string;
  readonly createdAt: string;
  readonly authoredBy: string;
  readonly contributorIds: readonly string[];
  readonly title: string;
  readonly researchQuestion: string;
  readonly dataClass: "scenario_counterfactual_only";
  readonly canonicalObservedDatasetEligible: false;
  readonly notObservedFact: true;
  readonly assumptions: readonly ScenarioAssumption[];
  readonly limitations: readonly string[];
  readonly shocks: readonly ScenarioShock[];
  readonly policyInterventions: readonly PolicyIntervention[];
  readonly conflictResolution: {
    readonly mode: "reject_overlap" | "priority_then_action_key";
    readonly explanation: string;
  };
  readonly usageBoundary: {
    readonly researchOnly: true;
    readonly scenarioNotForecast: true;
    readonly notCausalEstimate: true;
    readonly notPolicyAdvice: true;
    readonly noPolicyOptimalityClaim: true;
  };
}

export interface ScenarioDefinition extends ScenarioDefinitionInput {
  readonly orderedActionKeys: readonly string[];
  readonly conflicts: readonly ScenarioConflict[];
  readonly manifestSha256: string;
}

const SCENARIO_KEYS = [
  "schemaVersion",
  "tenantId",
  "scenarioId",
  "definitionVersion",
  "previousDefinitionSha256",
  "baselineId",
  "baselineIdentitySha256",
  "createdAt",
  "authoredBy",
  "contributorIds",
  "title",
  "researchQuestion",
  "dataClass",
  "canonicalObservedDatasetEligible",
  "notObservedFact",
  "assumptions",
  "limitations",
  "shocks",
  "policyInterventions",
  "conflictResolution",
  "usageBoundary",
] as const;

function validateTarget(target: ScenarioTarget, field: string, allowWildcard = true): void {
  assertPlainRecord(target, field);
  assertExactKeys(target, ["geographyKey", "sectorKey", "metricKey", "unit"], field);
  if (allowWildcard) {
    assertKeyOrWildcard(target.geographyKey, `${field}.geographyKey`);
    assertKeyOrWildcard(target.sectorKey, `${field}.sectorKey`);
  } else {
    assertKey(target.geographyKey, `${field}.geographyKey`);
    assertKey(target.sectorKey, `${field}.sectorKey`);
  }
  assertKey(target.metricKey, `${field}.metricKey`);
  assertNonBlank(target.unit, `${field}.unit`, 100);
}

function validateActionCommon(action: ScenarioAction, field: string): void {
  assertKey(action.actionKey, `${field}.actionKey`);
  validateTarget(action.target, `${field}.target`);
  assertInteger(action.startStep, `${field}.startStep`, 0, 9_999);
  assertInteger(action.endStep, `${field}.endStep`, action.startStep, 9_999);
  if (!(["additive", "multiply", "set"] as const).includes(action.operation)) {
    throw new TypeError(`${field}.operation is not registered`);
  }
  const value = assertDecimal(action.value, `${field}.value`);
  if (action.operation === "multiply" && (value < -100 || value > 100)) {
    throw new TypeError(`${field}.multiply value must be between -100 and 100`);
  }
  assertInteger(action.priority, `${field}.priority`, 0, 10_000);
  assertNonBlank(action.rationale, `${field}.rationale`, 2_000);
  assertStringArray(action.citationIds, `${field}.citationIds`, 1, 32, 128);
  for (const citationId of action.citationIds) assertKey(citationId, `${field}.citationId`);
}

function validateActions(
  shocks: readonly ScenarioShock[],
  interventions: readonly PolicyIntervention[],
): readonly ScenarioAction[] {
  if (!Array.isArray(shocks) || !Array.isArray(interventions)) {
    throw new TypeError("scenario actions must be arrays");
  }
  if (
    shocks.length > 128 ||
    interventions.length > 128 ||
    shocks.length + interventions.length === 0
  ) {
    throw new TypeError("scenario must contain 1..256 bounded actions");
  }
  for (const [index, shock] of shocks.entries()) {
    assertPlainRecord(shock as unknown, `shocks[${index}]`);
    assertExactKeys(
      shock,
      [
        "actionKey",
        "actionKind",
        "shockType",
        "target",
        "startStep",
        "endStep",
        "operation",
        "value",
        "priority",
        "rationale",
        "citationIds",
      ],
      `shocks[${index}]`,
    );
    if (shock.actionKind !== "shock") throw new TypeError("shock actionKind must be shock");
    if (
      !(["demand", "supply", "financial", "climate", "geopolitical", "other"] as const).includes(
        shock.shockType,
      )
    ) {
      throw new TypeError(`shocks[${index}].shockType is not registered`);
    }
    validateActionCommon(shock, `shocks[${index}]`);
  }
  for (const [index, intervention] of interventions.entries()) {
    assertPlainRecord(intervention as unknown, `policyInterventions[${index}]`);
    assertExactKeys(
      intervention,
      [
        "actionKey",
        "actionKind",
        "instrumentKey",
        "hypothetical",
        "notPolicyRecommendation",
        "target",
        "startStep",
        "endStep",
        "operation",
        "value",
        "priority",
        "rationale",
        "citationIds",
      ],
      `policyInterventions[${index}]`,
    );
    if (
      intervention.actionKind !== "policy_intervention" ||
      intervention.hypothetical !== true ||
      intervention.notPolicyRecommendation !== true
    ) {
      throw new TypeError("policy interventions must remain hypothetical and non-recommendatory");
    }
    assertKey(intervention.instrumentKey, `policyInterventions[${index}].instrumentKey`);
    validateActionCommon(intervention, `policyInterventions[${index}]`);
  }
  const actions: readonly ScenarioAction[] = [...shocks, ...interventions];
  uniqueBy(actions, (action) => action.actionKey, "scenario actions");
  return actions;
}

function selectorsIntersect(left: string, right: string): boolean {
  return left === "*" || right === "*" || left === right;
}

function actionsConflict(left: ScenarioAction, right: ScenarioAction): boolean {
  return (
    left.target.metricKey === right.target.metricKey &&
    left.target.unit === right.target.unit &&
    selectorsIntersect(left.target.geographyKey, right.target.geographyKey) &&
    selectorsIntersect(left.target.sectorKey, right.target.sectorKey) &&
    left.startStep <= right.endStep &&
    right.startStep <= left.endStep
  );
}

function compareActions(left: ScenarioAction, right: ScenarioAction): number {
  return (
    left.startStep - right.startStep ||
    left.priority - right.priority ||
    left.actionKind.localeCompare(right.actionKind) ||
    left.actionKey.localeCompare(right.actionKey)
  );
}

function findConflicts(actions: readonly ScenarioAction[]): readonly ScenarioConflict[] {
  const conflicts: ScenarioConflict[] = [];
  for (let leftIndex = 0; leftIndex < actions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < actions.length; rightIndex += 1) {
      const left = actions[leftIndex];
      const right = actions[rightIndex];
      if (!left || !right || !actionsConflict(left, right)) continue;
      const ordered = [left, right].sort(compareActions);
      const first = ordered[0];
      const second = ordered[1];
      if (!first || !second) throw new TypeError("conflict ordering failed");
      conflicts.push({
        leftActionKey: left.actionKey,
        rightActionKey: right.actionKey,
        targetPattern: `${left.target.geographyKey}|${left.target.sectorKey}|${left.target.metricKey}|${left.target.unit}`,
        overlapStartStep: Math.max(left.startStep, right.startStep),
        overlapEndStep: Math.min(left.endStep, right.endStep),
        resolutionOrder: [first.actionKey, second.actionKey],
      });
    }
  }
  return conflicts.sort((left, right) =>
    `${left.overlapStartStep}:${left.leftActionKey}:${left.rightActionKey}`.localeCompare(
      `${right.overlapStartStep}:${right.leftActionKey}:${right.rightActionKey}`,
    ),
  );
}

function validateAssumptions(items: readonly ScenarioAssumption[]): void {
  if (!Array.isArray(items) || items.length === 0 || items.length > 128) {
    throw new TypeError("assumptions must contain 1..128 items");
  }
  uniqueBy(items, (item) => item.assumptionKey, "assumptions");
  for (const [index, item] of items.entries()) {
    assertPlainRecord(item as unknown, `assumptions[${index}]`);
    assertExactKeys(
      item,
      ["assumptionKey", "statement", "rationale", "sensitivityRequired", "citationIds"],
      `assumptions[${index}]`,
    );
    assertKey(item.assumptionKey, `assumptions[${index}].assumptionKey`);
    assertNonBlank(item.statement, `assumptions[${index}].statement`, 2_000);
    assertNonBlank(item.rationale, `assumptions[${index}].rationale`, 2_000);
    if (typeof item.sensitivityRequired !== "boolean") {
      throw new TypeError(`assumptions[${index}].sensitivityRequired must be boolean`);
    }
    assertStringArray(item.citationIds, `assumptions[${index}].citationIds`, 1, 32, 128);
    for (const id of item.citationIds) assertKey(id, `assumptions[${index}].citationId`);
  }
}

function buildScenarioDefinition(
  input: ScenarioDefinitionInput,
  baseline: BaselineIdentity,
): Readonly<ScenarioDefinition> {
  assertBaselineIntegrity(baseline);
  assertPlainRecord(input, "scenario");
  assertExactKeys(input, SCENARIO_KEYS, "scenario");
  if (input.schemaVersion !== 1) throw new TypeError("scenario.schemaVersion must be 1");
  assertUuid(input.tenantId, "scenario.tenantId");
  assertUuid(input.scenarioId, "scenario.scenarioId");
  assertInteger(input.definitionVersion, "scenario.definitionVersion", 1, 1_000_000);
  if (input.definitionVersion === 1 && input.previousDefinitionSha256 !== null) {
    throw new TypeError("first scenario definition cannot have a predecessor");
  }
  if (input.definitionVersion > 1) {
    if (input.previousDefinitionSha256 === null)
      throw new TypeError("revision requires predecessor");
    assertSha256(input.previousDefinitionSha256, "scenario.previousDefinitionSha256");
  }
  if (
    input.tenantId !== baseline.tenantId ||
    input.baselineId !== baseline.baselineId ||
    input.baselineIdentitySha256 !== baseline.manifestSha256
  ) {
    throw new TypeError("scenario must bind the exact same-tenant baseline identity");
  }
  assertIsoInstant(input.createdAt, "scenario.createdAt");
  if (compareInstants(input.createdAt, baseline.createdAt) < 0) {
    throw new TypeError("scenario cannot predate its baseline");
  }
  assertUuid(input.authoredBy, "scenario.authoredBy");
  if (!Array.isArray(input.contributorIds) || input.contributorIds.length > 64) {
    throw new TypeError("contributorIds must contain at most 64 actors");
  }
  uniqueBy(input.contributorIds, (id) => id, "contributorIds");
  for (const id of input.contributorIds) {
    assertUuid(id, "scenario.contributorId");
    if (id === input.authoredBy) throw new TypeError("author cannot be duplicated as contributor");
  }
  assertNonBlank(input.title, "scenario.title", 200);
  assertNonBlank(input.researchQuestion, "scenario.researchQuestion", 2_000);
  if (
    input.dataClass !== "scenario_counterfactual_only" ||
    input.canonicalObservedDatasetEligible !== false ||
    input.notObservedFact !== true
  ) {
    throw new TypeError("scenario definitions must be permanently classified as non-observed");
  }
  validateAssumptions(input.assumptions);
  assertStringArray(input.limitations, "scenario.limitations", 1, 64, 2_000);
  const actions = validateActions(input.shocks, input.policyInterventions);
  assertPlainRecord(input.conflictResolution, "scenario.conflictResolution");
  assertExactKeys(input.conflictResolution, ["mode", "explanation"], "scenario.conflictResolution");
  if (
    input.conflictResolution.mode !== "reject_overlap" &&
    input.conflictResolution.mode !== "priority_then_action_key"
  ) {
    throw new TypeError("conflict resolution mode is not registered");
  }
  assertNonBlank(input.conflictResolution.explanation, "conflictResolution.explanation", 1_000);
  const conflicts = findConflicts(actions);
  if (conflicts.length > 0 && input.conflictResolution.mode === "reject_overlap") {
    throw new TypeError("scenario actions overlap under reject_overlap policy");
  }
  const usage = input.usageBoundary;
  assertPlainRecord(usage, "scenario.usageBoundary");
  assertExactKeys(
    usage,
    [
      "researchOnly",
      "scenarioNotForecast",
      "notCausalEstimate",
      "notPolicyAdvice",
      "noPolicyOptimalityClaim",
    ],
    "scenario.usageBoundary",
  );
  if (
    usage.researchOnly !== true ||
    usage.scenarioNotForecast !== true ||
    usage.notCausalEstimate !== true ||
    usage.notPolicyAdvice !== true ||
    usage.noPolicyOptimalityClaim !== true
  ) {
    throw new TypeError("scenario usage boundary cannot be weakened");
  }
  const orderedActionKeys = [...actions].sort(compareActions).map((action) => action.actionKey);
  return immutableWithDigest({
    ...input,
    contributorIds: [...input.contributorIds].sort(),
    assumptions: [...input.assumptions].sort((left, right) =>
      left.assumptionKey.localeCompare(right.assumptionKey),
    ),
    limitations: [...input.limitations].sort(),
    shocks: [...input.shocks].sort(compareActions),
    policyInterventions: [...input.policyInterventions].sort(compareActions),
    orderedActionKeys,
    conflicts,
  });
}

export function createScenarioDefinition(
  input: ScenarioDefinitionInput,
  baseline: BaselineIdentity,
): Readonly<ScenarioDefinition> {
  return buildScenarioDefinition(input, baseline);
}

export function reviseScenarioDefinition(
  previous: ScenarioDefinition,
  input: ScenarioDefinitionInput,
  baseline: BaselineIdentity,
): Readonly<ScenarioDefinition> {
  assertScenarioDefinitionIntegrity(previous, baseline);
  if (
    input.tenantId !== previous.tenantId ||
    input.scenarioId !== previous.scenarioId ||
    input.definitionVersion !== previous.definitionVersion + 1 ||
    input.previousDefinitionSha256 !== previous.manifestSha256 ||
    input.baselineIdentitySha256 !== previous.baselineIdentitySha256
  ) {
    throw new TypeError(
      "scenario revision must advance exactly one version without baseline drift",
    );
  }
  if (compareInstants(input.createdAt, previous.createdAt) < 0) {
    throw new TypeError("scenario revision cannot move backward in time");
  }
  return buildScenarioDefinition(input, baseline);
}

export function assertScenarioDefinitionIntegrity(
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
): void {
  assertDigestIntegrity(definition, "scenarioDefinition");
  const { manifestSha256: _digest, orderedActionKeys, conflicts, ...body } = definition;
  const rebuilt = buildScenarioDefinition(body, baseline);
  if (
    JSON.stringify(orderedActionKeys) !== JSON.stringify(rebuilt.orderedActionKeys) ||
    JSON.stringify(conflicts) !== JSON.stringify(rebuilt.conflicts)
  ) {
    throw new TypeError("scenario derived ordering or conflicts do not match content");
  }
}

function matchesTarget(pattern: ScenarioTarget, actual: ScenarioTarget): boolean {
  return (
    (pattern.geographyKey === "*" || pattern.geographyKey === actual.geographyKey) &&
    (pattern.sectorKey === "*" || pattern.sectorKey === actual.sectorKey) &&
    pattern.metricKey === actual.metricKey &&
    pattern.unit === actual.unit
  );
}

export interface AppliedScenarioValue {
  readonly value: string;
  readonly appliedActionKeys: readonly string[];
}

export function applyScenarioActionsAtStep(
  definition: ScenarioDefinition,
  target: ScenarioTarget,
  step: number,
  baselineValue: string,
): Readonly<AppliedScenarioValue> {
  assertDigestIntegrity(definition, "scenarioDefinition");
  validateTarget(target, "target", false);
  assertInteger(step, "step", 0, 9_999);
  let value = assertDecimal(baselineValue, "baselineValue");
  const actions = [...definition.shocks, ...definition.policyInterventions];
  const byKey = new Map(actions.map((action) => [action.actionKey, action]));
  const appliedActionKeys: string[] = [];
  for (const actionKey of definition.orderedActionKeys) {
    const action = byKey.get(actionKey);
    if (
      !action ||
      action.startStep > step ||
      action.endStep < step ||
      !matchesTarget(action.target, target)
    ) {
      continue;
    }
    const operand = Number(action.value);
    if (action.operation === "set") value = operand;
    else if (action.operation === "additive") value += operand;
    else value *= operand;
    if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000_000) {
      throw new TypeError("composed scenario action exceeded numeric bounds");
    }
    appliedActionKeys.push(action.actionKey);
  }
  return Object.freeze({
    value: canonicalDecimal(value),
    appliedActionKeys: Object.freeze(appliedActionKeys),
  });
}

export function assertNotObservedDatasetEligible(
  artifact: Pick<ScenarioDefinition, "dataClass" | "canonicalObservedDatasetEligible">,
): never {
  if (artifact.canonicalObservedDatasetEligible === false) {
    throw new TypeError(
      `${artifact.dataClass} cannot be admitted to an observed canonical dataset`,
    );
  }
  throw new TypeError("artifact is not a recognized observed-data artifact");
}
