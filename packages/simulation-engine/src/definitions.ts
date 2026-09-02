import {
  assertDecimal,
  assertDigestIntegrity,
  assertExactKeys,
  assertInteger,
  assertIsoInstant,
  assertKey,
  assertNonBlank,
  assertPlainRecord,
  assertSemver,
  assertSha256,
  assertUuid,
  compareInstants,
  immutableWithDigest,
  uniqueBy,
} from "./internals.js";

export const REGISTERED_SIMULATION_KERNELS = ["bounded-linear-stock-flow.v1"] as const;
export type RegisteredSimulationKernel = (typeof REGISTERED_SIMULATION_KERNELS)[number];

export interface StateVariableContract {
  readonly stateKey: string;
  readonly label: string;
  readonly unit: string;
  readonly minimum: string;
  readonly maximum: string;
}

export interface AgentTypeDefinition {
  readonly agentTypeKey: string;
  readonly label: string;
  readonly behaviorDescription: string;
}

export interface PopulationDefinition {
  readonly populationKey: string;
  readonly agentTypeKey: string;
  readonly agentCount: number;
  readonly initialState: Readonly<Record<string, string>>;
}

export interface EquationInfluence {
  readonly sourceStateKey: string;
  readonly coefficient: string;
  readonly coefficientUnit: string;
}

export interface EquationParameterTerm {
  readonly parameterKey: string;
  readonly coefficient: string;
  readonly coefficientUnit: string;
}

export interface TransitionEquation {
  readonly targetStateKey: string;
  readonly outputUnit: string;
  readonly intercept: string;
  readonly persistenceCoefficient: string;
  readonly influences: readonly EquationInfluence[];
  readonly parameterTerms: readonly EquationParameterTerm[];
}

export interface ParameterContract {
  readonly parameterKey: string;
  readonly label: string;
  readonly unit: string;
  readonly minimum: string;
  readonly maximum: string;
}

export interface ConservationInvariant {
  readonly invariantKey: string;
  readonly description: string;
  readonly weightedStateKeys: readonly {
    readonly stateKey: string;
    readonly weight: string;
  }[];
  readonly expectedTotal: string;
  readonly tolerance: string;
}

export interface SimulationClaim {
  readonly claimKey: string;
  readonly kind: "descriptive" | "probabilistic" | "causal" | "policy_optimality";
  readonly text: string;
  readonly reviewedEvidenceIds: readonly string[];
}

export interface SystemDefinitionInput {
  readonly schemaVersion: 1;
  readonly systemId: string;
  readonly systemVersion: string;
  readonly name: string;
  readonly description: string;
  readonly timeStepUnit: string;
  readonly kernel: {
    readonly kernelId: RegisteredSimulationKernel;
    readonly kernelVersion: "1.0.0";
  };
  readonly stateVariables: readonly StateVariableContract[];
  readonly agentTypes: readonly AgentTypeDefinition[];
  readonly populations: readonly PopulationDefinition[];
  readonly parameterContracts: readonly ParameterContract[];
  readonly transitionEquations: readonly TransitionEquation[];
  readonly conservationInvariants: readonly ConservationInvariant[];
  readonly claims: readonly SimulationClaim[];
  readonly usageBoundary: {
    readonly researchOnly: true;
    readonly scenarioNotForecast: true;
    readonly notPolicyAdvice: true;
    readonly notCausalEstimate: true;
  };
  readonly limitations: readonly string[];
}

export interface SystemDefinition extends SystemDefinitionInput {
  readonly manifestSha256: string;
}

export interface ObservedCalibrationEvidence {
  readonly evidenceId: string;
  readonly datasetSnapshotId: string;
  readonly datasetSnapshotSha256: string;
  readonly observedAt: string;
  readonly availableAt: string;
  readonly sourceDescription: string;
  readonly reviewStatus: "reviewed";
  readonly reviewedBy: string;
  readonly reviewedAt: string;
}

export interface StructuralAssumption {
  readonly assumptionKey: string;
  readonly statement: string;
  readonly rationale: string;
  readonly sensitivityRequired: true;
}

export interface CalibratedParameterValue {
  readonly parameterKey: string;
  readonly value: string;
  readonly uncertainty:
    | { readonly kind: "fixed" }
    | { readonly kind: "uniform"; readonly lower: string; readonly upper: string };
  readonly basis:
    | { readonly kind: "observed_evidence"; readonly evidenceIds: readonly string[] }
    | { readonly kind: "structural_assumption"; readonly assumptionKeys: readonly string[] };
}

export interface CalibrationManifestInput {
  readonly schemaVersion: 1;
  readonly calibrationId: string;
  readonly systemId: string;
  readonly systemVersion: string;
  readonly systemDefinitionSha256: string;
  readonly calibratedAsOf: string;
  readonly createdAt: string;
  readonly trainingDataCutoff: string;
  readonly modelSha256: string;
  readonly codeSha256: string;
  readonly configurationSha256: string;
  readonly observedEvidence: readonly ObservedCalibrationEvidence[];
  readonly structuralAssumptions: readonly StructuralAssumption[];
  readonly parameterValues: readonly CalibratedParameterValue[];
}

export interface CalibrationManifest extends CalibrationManifestInput {
  readonly manifestSha256: string;
}

const DEFINITION_KEYS = [
  "schemaVersion",
  "systemId",
  "systemVersion",
  "name",
  "description",
  "timeStepUnit",
  "kernel",
  "stateVariables",
  "agentTypes",
  "populations",
  "parameterContracts",
  "transitionEquations",
  "conservationInvariants",
  "claims",
  "usageBoundary",
  "limitations",
] as const;

function assertBounds(minimum: string, maximum: string, field: string): [number, number] {
  const min = assertDecimal(minimum, `${field}.minimum`);
  const max = assertDecimal(maximum, `${field}.maximum`);
  if (min >= max) throw new TypeError(`${field}.minimum must be below maximum`);
  return [min, max];
}

function assertStateVariables(
  items: readonly StateVariableContract[],
): Map<string, StateVariableContract> {
  if (items.length === 0 || items.length > 64)
    throw new TypeError("stateVariables must contain 1..64 items");
  uniqueBy(items, (item) => item.stateKey, "stateVariables");
  const result = new Map<string, StateVariableContract>();
  for (const [index, item] of items.entries()) {
    assertPlainRecord(item, `stateVariables[${index}]`);
    assertExactKeys(
      item,
      ["stateKey", "label", "unit", "minimum", "maximum"],
      `stateVariables[${index}]`,
    );
    assertKey(item.stateKey, `stateVariables[${index}].stateKey`);
    assertNonBlank(item.label, `stateVariables[${index}].label`, 200);
    assertNonBlank(item.unit, `stateVariables[${index}].unit`, 100);
    assertBounds(item.minimum, item.maximum, `stateVariables[${index}]`);
    result.set(item.stateKey, item);
  }
  return result;
}

function assertAgentsAndPopulations(
  agentTypes: readonly AgentTypeDefinition[],
  populations: readonly PopulationDefinition[],
  states: ReadonlyMap<string, StateVariableContract>,
): void {
  if (agentTypes.length === 0 || agentTypes.length > 32)
    throw new TypeError("agentTypes must contain 1..32 items");
  uniqueBy(agentTypes, (item) => item.agentTypeKey, "agentTypes");
  const typeKeys = new Set<string>();
  for (const [index, item] of agentTypes.entries()) {
    assertKey(item.agentTypeKey, `agentTypes[${index}].agentTypeKey`);
    assertNonBlank(item.label, `agentTypes[${index}].label`, 200);
    assertNonBlank(item.behaviorDescription, `agentTypes[${index}].behaviorDescription`, 2_000);
    typeKeys.add(item.agentTypeKey);
  }
  if (populations.length === 0 || populations.length > 128)
    throw new TypeError("populations must contain 1..128 items");
  uniqueBy(populations, (item) => item.populationKey, "populations");
  const expectedStateKeys = [...states.keys()].sort();
  for (const [index, item] of populations.entries()) {
    assertKey(item.populationKey, `populations[${index}].populationKey`);
    if (!typeKeys.has(item.agentTypeKey))
      throw new TypeError("population refers to an unknown agent type");
    assertInteger(item.agentCount, `populations[${index}].agentCount`, 1, 10_000_000);
    const actualKeys = Object.keys(item.initialState).sort();
    if (
      actualKeys.length !== expectedStateKeys.length ||
      actualKeys.some((key, i) => key !== expectedStateKeys[i])
    ) {
      throw new TypeError(
        "each population initialState must contain every and only declared state variable",
      );
    }
    for (const [stateKey, text] of Object.entries(item.initialState)) {
      const contract = states.get(stateKey);
      if (!contract)
        throw new TypeError("population initialState contains an unknown state variable");
      const value = assertDecimal(text, `populations[${index}].initialState.${stateKey}`);
      const [minimum, maximum] = [Number(contract.minimum), Number(contract.maximum)];
      if (value < minimum || value > maximum)
        throw new TypeError("population initialState violates state range");
    }
  }
}

function assertParameters(items: readonly ParameterContract[]): Map<string, ParameterContract> {
  if (items.length > 128) throw new TypeError("parameterContracts must contain at most 128 items");
  uniqueBy(items, (item) => item.parameterKey, "parameterContracts");
  const result = new Map<string, ParameterContract>();
  for (const [index, item] of items.entries()) {
    assertKey(item.parameterKey, `parameterContracts[${index}].parameterKey`);
    assertNonBlank(item.label, `parameterContracts[${index}].label`, 200);
    assertNonBlank(item.unit, `parameterContracts[${index}].unit`, 100);
    assertBounds(item.minimum, item.maximum, `parameterContracts[${index}]`);
    result.set(item.parameterKey, item);
  }
  return result;
}

function assertEquations(
  equations: readonly TransitionEquation[],
  states: ReadonlyMap<string, StateVariableContract>,
  parameters: ReadonlyMap<string, ParameterContract>,
): void {
  if (equations.length !== states.size)
    throw new TypeError("transitionEquations must define exactly one equation per state variable");
  uniqueBy(equations, (item) => item.targetStateKey, "transitionEquations");
  for (const [index, equation] of equations.entries()) {
    const target = states.get(equation.targetStateKey);
    if (!target) throw new TypeError("transition equation target is unknown");
    if (equation.outputUnit !== target.unit)
      throw new TypeError("transition equation outputUnit must match target state unit");
    assertDecimal(equation.intercept, `transitionEquations[${index}].intercept`);
    assertDecimal(
      equation.persistenceCoefficient,
      `transitionEquations[${index}].persistenceCoefficient`,
      -10,
      10,
    );
    if (equation.influences.length > 64 || equation.parameterTerms.length > 128)
      throw new TypeError("transition equation has too many terms");
    uniqueBy(equation.influences, (item) => item.sourceStateKey, "equation influences");
    for (const influence of equation.influences) {
      if (!states.has(influence.sourceStateKey))
        throw new TypeError("equation influence source is unknown");
      assertDecimal(influence.coefficient, "influence.coefficient", -10, 10);
      assertNonBlank(influence.coefficientUnit, "influence.coefficientUnit", 100);
    }
    uniqueBy(equation.parameterTerms, (item) => item.parameterKey, "equation parameterTerms");
    for (const term of equation.parameterTerms) {
      if (!parameters.has(term.parameterKey))
        throw new TypeError("equation parameter term is unknown");
      assertDecimal(term.coefficient, "parameterTerm.coefficient", -10, 10);
      assertNonBlank(term.coefficientUnit, "parameterTerm.coefficientUnit", 100);
    }
  }
}

function assertInvariants(
  invariants: readonly ConservationInvariant[],
  states: ReadonlyMap<string, StateVariableContract>,
): void {
  if (invariants.length > 32)
    throw new TypeError("conservationInvariants must contain at most 32 items");
  uniqueBy(invariants, (item) => item.invariantKey, "conservationInvariants");
  for (const invariant of invariants) {
    assertKey(invariant.invariantKey, "invariantKey");
    assertNonBlank(invariant.description, "invariant.description", 1_000);
    if (invariant.weightedStateKeys.length === 0)
      throw new TypeError("conservation invariant requires state terms");
    uniqueBy(invariant.weightedStateKeys, (term) => term.stateKey, "invariant state terms");
    for (const term of invariant.weightedStateKeys) {
      if (!states.has(term.stateKey))
        throw new TypeError("conservation invariant state is unknown");
      assertDecimal(term.weight, "invariant.weight", -1_000, 1_000);
    }
    assertDecimal(invariant.expectedTotal, "invariant.expectedTotal");
    const tolerance = assertDecimal(invariant.tolerance, "invariant.tolerance", 0, 1_000_000);
    if (tolerance < 0) throw new TypeError("invariant tolerance cannot be negative");
  }
}

function assertClaims(claims: readonly SimulationClaim[]): void {
  if (claims.length > 64) throw new TypeError("claims must contain at most 64 items");
  uniqueBy(claims, (claim) => claim.claimKey, "claims");
  for (const claim of claims) {
    assertKey(claim.claimKey, "claim.claimKey");
    assertNonBlank(claim.text, "claim.text", 2_000);
    uniqueBy(claim.reviewedEvidenceIds, (id) => id, "claim.reviewedEvidenceIds");
    for (const id of claim.reviewedEvidenceIds) assertUuid(id, "claim.reviewedEvidenceId");
    if (claim.kind !== "descriptive" && claim.reviewedEvidenceIds.length === 0) {
      throw new TypeError(`${claim.kind} claims require reviewed evidence`);
    }
  }
}

export function createSystemDefinition(input: SystemDefinitionInput): Readonly<SystemDefinition> {
  assertPlainRecord(input, "systemDefinition");
  assertExactKeys(input, DEFINITION_KEYS, "systemDefinition");
  if (input.schemaVersion !== 1) throw new TypeError("systemDefinition.schemaVersion must be 1");
  assertUuid(input.systemId, "systemId");
  assertSemver(input.systemVersion, "systemVersion");
  assertNonBlank(input.name, "name", 200);
  assertNonBlank(input.description, "description", 4_000);
  assertNonBlank(input.timeStepUnit, "timeStepUnit", 100);
  if (
    input.kernel.kernelId !== "bounded-linear-stock-flow.v1" ||
    input.kernel.kernelVersion !== "1.0.0"
  ) {
    throw new TypeError("kernel must be a registered immutable implementation");
  }
  const states = assertStateVariables(input.stateVariables);
  assertAgentsAndPopulations(input.agentTypes, input.populations, states);
  const parameters = assertParameters(input.parameterContracts);
  assertEquations(input.transitionEquations, states, parameters);
  assertInvariants(input.conservationInvariants, states);
  assertClaims(input.claims);
  if (
    input.usageBoundary.researchOnly !== true ||
    input.usageBoundary.scenarioNotForecast !== true ||
    input.usageBoundary.notPolicyAdvice !== true ||
    input.usageBoundary.notCausalEstimate !== true
  ) {
    throw new TypeError("all research and interpretation boundaries must be acknowledged");
  }
  if (input.limitations.length === 0 || input.limitations.length > 32)
    throw new TypeError("limitations must contain 1..32 items");
  uniqueBy(input.limitations, (item) => item, "limitations");
  for (const limitation of input.limitations) assertNonBlank(limitation, "limitation", 2_000);
  return immutableWithDigest(input);
}

function assertParameterValue(
  value: CalibratedParameterValue,
  contract: ParameterContract,
  evidenceIds: ReadonlySet<string>,
  assumptionKeys: ReadonlySet<string>,
): void {
  const numeric = assertDecimal(value.value, `parameterValues.${value.parameterKey}.value`);
  if (numeric < Number(contract.minimum) || numeric > Number(contract.maximum)) {
    throw new TypeError("parameter value violates its declared contract");
  }
  if (value.uncertainty.kind === "uniform") {
    const lower = assertDecimal(value.uncertainty.lower, "parameter uncertainty.lower");
    const upper = assertDecimal(value.uncertainty.upper, "parameter uncertainty.upper");
    if (
      lower > numeric ||
      numeric > upper ||
      lower < Number(contract.minimum) ||
      upper > Number(contract.maximum)
    ) {
      throw new TypeError("uniform parameter uncertainty must contain value and respect bounds");
    }
  } else if (value.uncertainty.kind !== "fixed") {
    throw new TypeError("parameter uncertainty kind is not registered");
  }
  if (value.basis.kind === "observed_evidence") {
    if (value.basis.evidenceIds.length === 0)
      throw new TypeError("observed parameter requires evidence");
    uniqueBy(value.basis.evidenceIds, (id) => id, "parameter evidenceIds");
    for (const id of value.basis.evidenceIds) {
      if (!evidenceIds.has(id))
        throw new TypeError("parameter refers to unknown reviewed evidence");
    }
  } else if (value.basis.kind === "structural_assumption") {
    if (value.basis.assumptionKeys.length === 0)
      throw new TypeError("structural parameter requires assumptions");
    uniqueBy(value.basis.assumptionKeys, (key) => key, "parameter assumptionKeys");
    for (const key of value.basis.assumptionKeys) {
      if (!assumptionKeys.has(key))
        throw new TypeError("parameter refers to unknown structural assumption");
    }
  } else {
    throw new TypeError("parameter basis kind is not registered");
  }
}

export function createCalibrationManifest(
  input: CalibrationManifestInput,
  definition: SystemDefinition,
): Readonly<CalibrationManifest> {
  assertDigestIntegrity(definition, "systemDefinition");
  if (input.schemaVersion !== 1) throw new TypeError("calibration.schemaVersion must be 1");
  assertUuid(input.calibrationId, "calibrationId");
  if (
    input.systemId !== definition.systemId ||
    input.systemVersion !== definition.systemVersion ||
    input.systemDefinitionSha256 !== definition.manifestSha256
  ) {
    throw new TypeError("calibration must bind the exact system definition version and digest");
  }
  assertIsoInstant(input.calibratedAsOf, "calibratedAsOf");
  assertIsoInstant(input.createdAt, "createdAt");
  assertIsoInstant(input.trainingDataCutoff, "trainingDataCutoff");
  if (compareInstants(input.trainingDataCutoff, input.calibratedAsOf) > 0)
    throw new TypeError("trainingDataCutoff is after calibratedAsOf");
  if (compareInstants(input.calibratedAsOf, input.createdAt) > 0)
    throw new TypeError("calibratedAsOf is after createdAt");
  assertSha256(input.modelSha256, "modelSha256");
  assertSha256(input.codeSha256, "codeSha256");
  assertSha256(input.configurationSha256, "configurationSha256");
  uniqueBy(input.observedEvidence, (item) => item.evidenceId, "observedEvidence");
  const evidenceIds = new Set<string>();
  for (const evidence of input.observedEvidence) {
    assertUuid(evidence.evidenceId, "evidenceId");
    assertUuid(evidence.datasetSnapshotId, "datasetSnapshotId");
    assertSha256(evidence.datasetSnapshotSha256, "datasetSnapshotSha256");
    assertIsoInstant(evidence.observedAt, "evidence.observedAt");
    assertIsoInstant(evidence.availableAt, "evidence.availableAt");
    assertIsoInstant(evidence.reviewedAt, "evidence.reviewedAt");
    if (compareInstants(evidence.availableAt, evidence.observedAt) < 0)
      throw new TypeError("evidence cannot be available before observation");
    if (compareInstants(evidence.availableAt, input.calibratedAsOf) > 0)
      throw new TypeError("future evidence violates the calibration as-of boundary");
    if (compareInstants(evidence.reviewedAt, input.createdAt) > 0)
      throw new TypeError("evidence review cannot occur after manifest creation");
    if (compareInstants(evidence.reviewedAt, evidence.availableAt) < 0)
      throw new TypeError("evidence cannot be reviewed before it is available");
    if (evidence.reviewStatus !== "reviewed")
      throw new TypeError("calibration evidence must be reviewed");
    assertUuid(evidence.reviewedBy, "evidence.reviewedBy");
    assertNonBlank(evidence.sourceDescription, "evidence.sourceDescription", 1_000);
    evidenceIds.add(evidence.evidenceId);
  }
  uniqueBy(input.structuralAssumptions, (item) => item.assumptionKey, "structuralAssumptions");
  const assumptionKeys = new Set<string>();
  for (const assumption of input.structuralAssumptions) {
    assertKey(assumption.assumptionKey, "assumptionKey");
    assertNonBlank(assumption.statement, "assumption.statement", 2_000);
    assertNonBlank(assumption.rationale, "assumption.rationale", 2_000);
    if (assumption.sensitivityRequired !== true)
      throw new TypeError("structural assumptions require sensitivity analysis");
    assumptionKeys.add(assumption.assumptionKey);
  }
  const contracts = new Map(definition.parameterContracts.map((item) => [item.parameterKey, item]));
  if (input.parameterValues.length !== contracts.size)
    throw new TypeError("parameterValues must cover every declared parameter exactly once");
  uniqueBy(input.parameterValues, (item) => item.parameterKey, "parameterValues");
  for (const value of input.parameterValues) {
    const contract = contracts.get(value.parameterKey);
    if (!contract) throw new TypeError("parameterValues contains an undeclared parameter");
    assertParameterValue(value, contract, evidenceIds, assumptionKeys);
  }
  for (const claim of definition.claims) {
    for (const evidenceId of claim.reviewedEvidenceIds) {
      if (!evidenceIds.has(evidenceId))
        throw new TypeError("system claim is not backed by evidence in this calibration");
    }
  }
  return immutableWithDigest(input);
}

export function assertSystemDefinitionIntegrity(definition: SystemDefinition): void {
  assertDigestIntegrity(definition, "systemDefinition");
  const { manifestSha256: _digest, ...body } = definition;
  createSystemDefinition(body);
}

export function assertCalibrationIntegrity(
  manifest: CalibrationManifest,
  definition: SystemDefinition,
): void {
  assertDigestIntegrity(manifest, "calibrationManifest");
  const { manifestSha256: _digest, ...body } = manifest;
  createCalibrationManifest(body, definition);
}
