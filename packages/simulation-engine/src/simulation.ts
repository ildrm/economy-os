import type {
  CalibrationManifest,
  ConservationInvariant,
  SystemDefinition,
  TransitionEquation,
} from "./definitions.js";
import { assertCalibrationIntegrity, assertSystemDefinitionIntegrity } from "./definitions.js";
import {
  assertDecimal,
  assertDigestIntegrity,
  assertExactKeys,
  assertInteger,
  assertIsoInstant,
  assertKey,
  assertNonBlank,
  assertNonnegativeIntegerText,
  assertPlainRecord,
  assertSha256,
  assertUuid,
  canonicalDecimal,
  compareInstants,
  deepFreeze,
  digestJson,
  immutableWithDigest,
  uniqueBy,
} from "./internals.js";
import { createRandomStream } from "./random.js";
import type { SimulationWorld } from "./worlds.js";
import { assertWorldIntegrity } from "./worlds.js";

export interface InputUncertainty {
  readonly uncertaintyKey: string;
  readonly populationKey: string;
  readonly stateKey: string;
  readonly kind: "uniform";
  readonly lower: string;
  readonly upper: string;
  readonly measurementRationale: string;
}

export interface SimulationRunPlanInput {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly createdAt: string;
  readonly systemDefinitionSha256: string;
  readonly calibrationManifestSha256: string;
  readonly worldSha256: string;
  readonly seed: string;
  readonly steps: number;
  readonly ensembleSize: number;
  readonly checkpointEveryMembers: number;
  readonly outputStateKeys: readonly string[];
  readonly inputUncertainty: readonly InputUncertainty[];
  readonly sensitivityParameterKeys: readonly string[];
  readonly numericalTolerance: string;
  readonly convergence: {
    readonly windowSteps: number;
    readonly tolerance: string;
  };
  readonly equilibriumTolerance: string;
  readonly resourceBudget: {
    readonly maxStateUpdates: number;
    readonly maxOutputCells: number;
  };
}

export interface SimulationRunPlan extends SimulationRunPlanInput {
  readonly replayIdentitySha256: string;
  readonly manifestSha256: string;
}

export interface CheckpointMemberResult {
  readonly memberIndex: number;
  readonly finalStates: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly clampingActivations: number;
  readonly maxPreClampExcess: string;
  readonly maxConservationDeviation: Readonly<Record<string, string>>;
  readonly convergenceDelta: string;
  readonly equilibriumResidual: string;
}

export interface SimulationCheckpointInput {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly replayIdentitySha256: string;
  readonly runPlanSha256: string;
  readonly nextMemberIndex: number;
  readonly completedMembers: readonly CheckpointMemberResult[];
}

export interface SimulationCheckpoint extends SimulationCheckpointInput {
  readonly manifestSha256: string;
}

export interface StateOutputDistribution {
  readonly populationKey: string;
  readonly stateKey: string;
  readonly unit: string;
  readonly sampleCount: number;
  readonly minimum: string;
  readonly maximum: string;
  readonly mean: string;
  readonly quantiles: {
    readonly p05: string;
    readonly p50: string;
    readonly p95: string;
    readonly method: "linear_order_statistic_v1";
  };
}

export interface SimulationDiagnostics {
  readonly range: {
    readonly passed: true;
    readonly clampingActivations: number;
    readonly maxPreClampExcess: string;
  };
  readonly conservation: readonly {
    readonly invariantKey: string;
    readonly tolerance: string;
    readonly maxDeviation: string;
    readonly passed: boolean;
  }[];
  readonly convergence: {
    readonly windowSteps: number;
    readonly tolerance: string;
    readonly maxDelta: string;
    readonly passed: boolean;
  };
  readonly equilibrium: {
    readonly tolerance: string;
    readonly maxOneStepResidual: string;
    readonly passed: boolean;
  };
  readonly stability: {
    readonly jacobianInfinityNormUpperBound: string;
    readonly locallyContractiveWithinTolerance: boolean;
  };
  readonly sensitivity: readonly {
    readonly parameterKey: string;
    readonly lowValue: string;
    readonly highValue: string;
    readonly maxEndpointSpread: string;
    readonly finiteAndBounded: true;
  }[];
  readonly numerical: {
    readonly allFinite: true;
    readonly decimalOutputScaleMaximum: 12;
    readonly declaredTolerance: string;
  };
}

export interface SimulationUncertaintyBreakdown {
  readonly parameter: {
    readonly status: "sampled" | "fixed";
    readonly sampledParameterKeys: readonly string[];
  };
  readonly model: {
    readonly status: "not_quantified";
    readonly reason: string;
  };
  readonly input: {
    readonly status: "sampled" | "not_declared";
    readonly sampledInputKeys: readonly string[];
  };
  readonly monteCarlo: {
    readonly status: "finite_ensemble_summary";
    readonly ensembleSize: number;
    readonly quantileMethod: "linear_order_statistic_v1";
  };
  readonly structural: {
    readonly status: "sensitivity_only" | "not_quantified";
    readonly assumptionKeys: readonly string[];
    readonly reason: string;
  };
}

export interface CompletedSimulationResultInput {
  readonly schemaVersion: 1;
  readonly status: "completed";
  readonly runId: string;
  readonly replayIdentitySha256: string;
  readonly runPlanSha256: string;
  readonly systemDefinitionSha256: string;
  readonly calibrationManifestSha256: string;
  readonly worldSha256: string;
  readonly completedMembers: number;
  readonly stepsPerMember: number;
  readonly distributions: readonly StateOutputDistribution[];
  readonly diagnostics: SimulationDiagnostics;
  readonly uncertainty: SimulationUncertaintyBreakdown;
  readonly limitations: readonly string[];
}

export interface CompletedSimulationResult extends CompletedSimulationResultInput {
  readonly manifestSha256: string;
}

export interface CancelledSimulationResult {
  readonly schemaVersion: 1;
  readonly status: "cancelled";
  readonly runId: string;
  readonly replayIdentitySha256: string;
  readonly completedMembers: number;
  readonly checkpoint: SimulationCheckpoint;
  readonly limitation: "Cancellation checkpoints only retain fully completed ensemble members.";
}

export type SimulationExecutionResult = CompletedSimulationResult | CancelledSimulationResult;

export interface SimulationExecutionOptions {
  readonly checkpoint?: SimulationCheckpoint;
  readonly isCancellationRequested?: () => boolean;
  readonly onCheckpoint?: (checkpoint: SimulationCheckpoint) => void;
}

interface NumericMemberResult {
  readonly memberIndex: number;
  readonly finalStates: Record<string, Record<string, number>>;
  readonly clampingActivations: number;
  readonly maxPreClampExcess: number;
  readonly maxConservationDeviation: Record<string, number>;
  readonly convergenceDelta: number;
  readonly equilibriumResidual: number;
}

const LIMITATIONS = Object.freeze([
  "Research and scenario-analysis use only; outputs are not forecasts.",
  "Outputs are not policy advice and do not identify an optimal intervention.",
  "Transition responses are structural model behavior, not causal estimates.",
  "Finite ensembles and declared sensitivities do not exhaust model or structural uncertainty.",
]);

function computationalIdentity(input: SimulationRunPlanInput): string {
  return digestJson({
    schemaVersion: input.schemaVersion,
    systemDefinitionSha256: input.systemDefinitionSha256,
    calibrationManifestSha256: input.calibrationManifestSha256,
    worldSha256: input.worldSha256,
    seed: input.seed,
    steps: input.steps,
    ensembleSize: input.ensembleSize,
    outputStateKeys: [...input.outputStateKeys].sort(),
    inputUncertainty: [...input.inputUncertainty].sort((a, b) =>
      a.uncertaintyKey.localeCompare(b.uncertaintyKey),
    ),
    sensitivityParameterKeys: [...input.sensitivityParameterKeys].sort(),
    numericalTolerance: input.numericalTolerance,
    convergence: input.convergence,
    equilibriumTolerance: input.equilibriumTolerance,
  });
}

function validateInputUncertainty(
  items: readonly InputUncertainty[],
  definition: SystemDefinition,
): void {
  if (items.length > 128) throw new TypeError("inputUncertainty must contain at most 128 items");
  uniqueBy(items, (item) => item.uncertaintyKey, "inputUncertainty");
  const populations = new Map(definition.populations.map((item) => [item.populationKey, item]));
  const states = new Map(definition.stateVariables.map((item) => [item.stateKey, item]));
  const targets = new Set<string>();
  for (const item of items) {
    assertKey(item.uncertaintyKey, "input uncertaintyKey");
    const population = populations.get(item.populationKey);
    const state = states.get(item.stateKey);
    if (!population || !state) throw new TypeError("input uncertainty target is unknown");
    const target = `${item.populationKey}:${item.stateKey}`;
    if (targets.has(target)) throw new TypeError("input uncertainty target is duplicated");
    targets.add(target);
    if (item.kind !== "uniform") throw new TypeError("input uncertainty kind is not registered");
    const lower = assertDecimal(item.lower, "input uncertainty.lower");
    const upper = assertDecimal(item.upper, "input uncertainty.upper");
    const initial = Number(population.initialState[item.stateKey]);
    if (
      lower > initial ||
      initial > upper ||
      lower < Number(state.minimum) ||
      upper > Number(state.maximum)
    ) {
      throw new TypeError("input uncertainty must contain initial value and respect state bounds");
    }
    assertNonnegativeIntegerText(
      String(item.measurementRationale.length),
      "measurement rationale length",
    );
    if (
      item.measurementRationale.trim() !== item.measurementRationale ||
      item.measurementRationale.length < 3
    ) {
      throw new TypeError("input uncertainty requires a trimmed measurement rationale");
    }
  }
}

export function createSimulationRunPlan(
  input: SimulationRunPlanInput,
  definition: SystemDefinition,
  calibration: CalibrationManifest,
  world: SimulationWorld,
): Readonly<SimulationRunPlan> {
  assertSystemDefinitionIntegrity(definition);
  assertCalibrationIntegrity(calibration, definition);
  assertWorldIntegrity(world, definition);
  if (input.schemaVersion !== 1) throw new TypeError("runPlan.schemaVersion must be 1");
  assertUuid(input.runId, "runId");
  assertIsoInstant(input.createdAt, "runPlan.createdAt");
  if (compareInstants(input.createdAt, world.createdAt) < 0)
    throw new TypeError("run plan predates its world");
  if (compareInstants(calibration.calibratedAsOf, world.asOf) > 0)
    throw new TypeError("calibration uses information after world.asOf");
  if (
    input.systemDefinitionSha256 !== definition.manifestSha256 ||
    input.calibrationManifestSha256 !== calibration.manifestSha256 ||
    input.worldSha256 !== world.manifestSha256
  ) {
    throw new TypeError("run plan must bind exact definition, calibration, and world digests");
  }
  assertNonnegativeIntegerText(input.seed, "seed");
  assertInteger(input.steps, "steps", 1, 10_000);
  assertInteger(input.ensembleSize, "ensembleSize", 1, 512);
  assertInteger(input.checkpointEveryMembers, "checkpointEveryMembers", 1, input.ensembleSize);
  if (input.outputStateKeys.length === 0) throw new TypeError("outputStateKeys must not be empty");
  uniqueBy(input.outputStateKeys, (key) => key, "outputStateKeys");
  const states = new Set(definition.stateVariables.map((item) => item.stateKey));
  for (const key of input.outputStateKeys)
    if (!states.has(key)) throw new TypeError("outputStateKeys contains unknown state");
  validateInputUncertainty(input.inputUncertainty, definition);
  uniqueBy(input.sensitivityParameterKeys, (key) => key, "sensitivityParameterKeys");
  if (input.sensitivityParameterKeys.length > 16)
    throw new TypeError("sensitivityParameterKeys must contain at most 16 items");
  const parameterValues = new Map(
    calibration.parameterValues.map((item) => [item.parameterKey, item]),
  );
  for (const key of input.sensitivityParameterKeys) {
    assertKey(key, "sensitivityParameterKey");
    if (!parameterValues.has(key))
      throw new TypeError("sensitivityParameterKeys contains unknown parameter");
  }
  const structuralParameters = calibration.parameterValues
    .filter((value) => value.basis.kind === "structural_assumption")
    .map((value) => value.parameterKey);
  for (const key of structuralParameters) {
    if (!input.sensitivityParameterKeys.includes(key)) {
      throw new TypeError("every structurally assumed parameter requires sensitivity analysis");
    }
  }
  const numericalTolerance = assertDecimal(input.numericalTolerance, "numericalTolerance", 0, 1);
  if (numericalTolerance <= 0) throw new TypeError("numericalTolerance must be positive");
  assertInteger(input.convergence.windowSteps, "convergence.windowSteps", 1, input.steps);
  const convergenceTolerance = assertDecimal(
    input.convergence.tolerance,
    "convergence.tolerance",
    0,
    1_000_000,
  );
  if (convergenceTolerance <= 0) throw new TypeError("convergence tolerance must be positive");
  const equilibriumTolerance = assertDecimal(
    input.equilibriumTolerance,
    "equilibriumTolerance",
    0,
    1_000_000,
  );
  if (equilibriumTolerance <= 0) throw new TypeError("equilibriumTolerance must be positive");
  assertInteger(input.resourceBudget.maxStateUpdates, "maxStateUpdates", 1, 25_000_000);
  assertInteger(input.resourceBudget.maxOutputCells, "maxOutputCells", 1, 100_000);
  const stateUpdatesPerRun =
    input.steps * definition.populations.length * definition.stateVariables.length;
  const requiredUpdates =
    stateUpdatesPerRun * (input.ensembleSize + 2 * input.sensitivityParameterKeys.length);
  if (requiredUpdates > input.resourceBudget.maxStateUpdates)
    throw new TypeError("run plan exceeds maxStateUpdates resource budget");
  const outputCells = definition.populations.length * input.outputStateKeys.length;
  if (outputCells > input.resourceBudget.maxOutputCells)
    throw new TypeError("run plan exceeds maxOutputCells resource budget");
  const normalized: SimulationRunPlanInput = {
    ...input,
    outputStateKeys: [...input.outputStateKeys].sort(),
    inputUncertainty: [...input.inputUncertainty].sort((a, b) =>
      a.uncertaintyKey.localeCompare(b.uncertaintyKey),
    ),
    sensitivityParameterKeys: [...input.sensitivityParameterKeys].sort(),
  };
  const replayIdentitySha256 = computationalIdentity(normalized);
  return immutableWithDigest({ ...normalized, replayIdentitySha256 });
}

export function assertRunPlanIntegrity(
  plan: SimulationRunPlan,
  definition: SystemDefinition,
  calibration: CalibrationManifest,
  world: SimulationWorld,
): void {
  assertDigestIntegrity(plan, "runPlan");
  const { manifestSha256: _digest, replayIdentitySha256, ...body } = plan;
  if (computationalIdentity(body) !== replayIdentitySha256)
    throw new TypeError("run plan replay identity does not match computation");
  createSimulationRunPlan(body, definition, calibration, world);
}

function nominalParameters(calibration: CalibrationManifest): Record<string, number> {
  return Object.fromEntries(
    [...calibration.parameterValues]
      .sort((a, b) => a.parameterKey.localeCompare(b.parameterKey))
      .map((item) => [item.parameterKey, Number(item.value)]),
  );
}

function sampledParameters(
  plan: SimulationRunPlan,
  calibration: CalibrationManifest,
  memberIndex: number,
): Record<string, number> {
  const parameters = nominalParameters(calibration);
  for (const item of [...calibration.parameterValues].sort((a, b) =>
    a.parameterKey.localeCompare(b.parameterKey),
  )) {
    if (item.uncertainty.kind === "uniform") {
      const stream = createRandomStream(plan.seed, [
        `run.${plan.runId}`,
        `member.${memberIndex}`,
        `parameter.${item.parameterKey}`,
      ]);
      parameters[item.parameterKey] = stream.uniform(
        Number(item.uncertainty.lower),
        Number(item.uncertainty.upper),
      );
    }
  }
  return parameters;
}

function initialStates(
  plan: SimulationRunPlan,
  definition: SystemDefinition,
  memberIndex: number | null,
): Record<string, Record<string, number>> {
  const states: Record<string, Record<string, number>> = {};
  for (const population of [...definition.populations].sort((a, b) =>
    a.populationKey.localeCompare(b.populationKey),
  )) {
    states[population.populationKey] = Object.fromEntries(
      Object.entries(population.initialState)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, Number(value)]),
    );
  }
  if (memberIndex !== null) {
    for (const uncertainty of plan.inputUncertainty) {
      const stream = createRandomStream(plan.seed, [
        `run.${plan.runId}`,
        `member.${memberIndex}`,
        `input.${uncertainty.uncertaintyKey}`,
      ]);
      const target = states[uncertainty.populationKey];
      if (!target) throw new TypeError("validated input uncertainty population disappeared");
      target[uncertainty.stateKey] = stream.uniform(
        Number(uncertainty.lower),
        Number(uncertainty.upper),
      );
    }
  }
  return states;
}

function equationValue(
  equation: TransitionEquation,
  oldState: Readonly<Record<string, number>>,
  parameters: Readonly<Record<string, number>>,
): number {
  let value =
    Number(equation.intercept) +
    Number(equation.persistenceCoefficient) * (oldState[equation.targetStateKey] ?? 0);
  for (const influence of equation.influences) {
    value += Number(influence.coefficient) * (oldState[influence.sourceStateKey] ?? 0);
  }
  for (const term of equation.parameterTerms) {
    value += Number(term.coefficient) * (parameters[term.parameterKey] ?? 0);
  }
  return value;
}

function matchesPopulation(selector: string, populationKey: string): boolean {
  return selector === "*" || selector === populationKey;
}

function stepStates(
  oldStates: Readonly<Record<string, Readonly<Record<string, number>>>>,
  parameters: Readonly<Record<string, number>>,
  definition: SystemDefinition,
  world: SimulationWorld,
  step: number,
): {
  states: Record<string, Record<string, number>>;
  clamping: number;
  maxExcess: number;
  maxDelta: number;
} {
  const contracts = new Map(definition.stateVariables.map((item) => [item.stateKey, item]));
  const equations = [...definition.transitionEquations].sort((a, b) =>
    a.targetStateKey.localeCompare(b.targetStateKey),
  );
  const next: Record<string, Record<string, number>> = {};
  let clamping = 0;
  let maxExcess = 0;
  let maxDelta = 0;
  for (const populationKey of Object.keys(oldStates).sort()) {
    const oldState = oldStates[populationKey];
    if (!oldState) throw new TypeError("simulation state population disappeared");
    const nextState: Record<string, number> = {};
    for (const equation of equations) {
      const contract = contracts.get(equation.targetStateKey);
      if (!contract) throw new TypeError("validated equation contract disappeared");
      let value = equationValue(equation, oldState, parameters);
      if (world.worldKind === "scenario_counterfactual") {
        for (const intervention of [...world.interventions].sort((a, b) =>
          a.interventionKey.localeCompare(b.interventionKey),
        )) {
          if (
            intervention.stateKey === equation.targetStateKey &&
            matchesPopulation(intervention.populationKey, populationKey) &&
            intervention.startStep <= step &&
            step <= intervention.endStep
          ) {
            value =
              intervention.mode === "set"
                ? Number(intervention.value)
                : value + Number(intervention.value);
          }
        }
        for (const shock of [...world.shocks].sort((a, b) =>
          a.shockKey.localeCompare(b.shockKey),
        )) {
          if (
            shock.stateKey === equation.targetStateKey &&
            matchesPopulation(shock.populationKey, populationKey) &&
            shock.atStep === step
          ) {
            value += Number(shock.additiveDelta);
          }
        }
      }
      if (!Number.isFinite(value)) throw new TypeError("kernel produced a non-finite state");
      const minimum = Number(contract.minimum);
      const maximum = Number(contract.maximum);
      if (value < minimum) {
        maxExcess = Math.max(maxExcess, minimum - value);
        value = minimum;
        clamping += 1;
      } else if (value > maximum) {
        maxExcess = Math.max(maxExcess, value - maximum);
        value = maximum;
        clamping += 1;
      }
      const previous = oldState[equation.targetStateKey];
      if (previous === undefined) throw new TypeError("kernel target state disappeared");
      maxDelta = Math.max(maxDelta, Math.abs(value - previous));
      nextState[equation.targetStateKey] = value;
    }
    next[populationKey] = nextState;
  }
  return { states: next, clamping, maxExcess, maxDelta };
}

function conservationDeviation(
  invariant: ConservationInvariant,
  states: Readonly<Record<string, Readonly<Record<string, number>>>>,
): number {
  let maximum = 0;
  for (const state of Object.values(states)) {
    const actual = invariant.weightedStateKeys.reduce(
      (sum, term) => sum + Number(term.weight) * (state[term.stateKey] ?? 0),
      0,
    );
    maximum = Math.max(maximum, Math.abs(actual - Number(invariant.expectedTotal)));
  }
  return maximum;
}

function runMember(
  plan: SimulationRunPlan,
  definition: SystemDefinition,
  world: SimulationWorld,
  memberIndex: number,
  parameters: Readonly<Record<string, number>>,
  sampleInputs: boolean,
  shouldCancel?: () => boolean,
): NumericMemberResult | null {
  let states = initialStates(plan, definition, sampleInputs ? memberIndex : null);
  let clampingActivations = 0;
  let maxPreClampExcess = 0;
  const maxConservationDeviation: Record<string, number> = Object.fromEntries(
    definition.conservationInvariants.map((item) => [
      item.invariantKey,
      conservationDeviation(item, states),
    ]),
  );
  const recentDeltas: number[] = [];
  for (let step = 0; step < plan.steps; step += 1) {
    if (shouldCancel?.()) return null;
    const outcome = stepStates(states, parameters, definition, world, step);
    states = outcome.states;
    clampingActivations += outcome.clamping;
    maxPreClampExcess = Math.max(maxPreClampExcess, outcome.maxExcess);
    recentDeltas.push(outcome.maxDelta);
    if (recentDeltas.length > plan.convergence.windowSteps) recentDeltas.shift();
    for (const invariant of definition.conservationInvariants) {
      maxConservationDeviation[invariant.invariantKey] = Math.max(
        maxConservationDeviation[invariant.invariantKey] ?? 0,
        conservationDeviation(invariant, states),
      );
    }
  }
  const equilibriumStep = stepStates(states, parameters, definition, world, plan.steps);
  let equilibriumResidual = 0;
  for (const [populationKey, state] of Object.entries(states)) {
    const compared = equilibriumStep.states[populationKey];
    if (!compared) throw new TypeError("equilibrium state population disappeared");
    for (const [stateKey, value] of Object.entries(state)) {
      equilibriumResidual = Math.max(
        equilibriumResidual,
        Math.abs((compared[stateKey] ?? value) - value),
      );
    }
  }
  return {
    memberIndex,
    finalStates: states,
    clampingActivations,
    maxPreClampExcess,
    maxConservationDeviation,
    convergenceDelta: recentDeltas.length === 0 ? 0 : Math.max(...recentDeltas),
    equilibriumResidual,
  };
}

function checkpointMember(result: NumericMemberResult): CheckpointMemberResult {
  return {
    memberIndex: result.memberIndex,
    finalStates: Object.fromEntries(
      Object.entries(result.finalStates).map(([populationKey, state]) => [
        populationKey,
        Object.fromEntries(
          Object.entries(state).map(([stateKey, value]) => [stateKey, canonicalDecimal(value)]),
        ),
      ]),
    ),
    clampingActivations: result.clampingActivations,
    maxPreClampExcess: canonicalDecimal(result.maxPreClampExcess),
    maxConservationDeviation: Object.fromEntries(
      Object.entries(result.maxConservationDeviation).map(([key, value]) => [
        key,
        canonicalDecimal(value),
      ]),
    ),
    convergenceDelta: canonicalDecimal(result.convergenceDelta),
    equilibriumResidual: canonicalDecimal(result.equilibriumResidual),
  };
}

function numericMember(result: CheckpointMemberResult): NumericMemberResult {
  return {
    memberIndex: result.memberIndex,
    finalStates: Object.fromEntries(
      Object.entries(result.finalStates).map(([populationKey, state]) => [
        populationKey,
        Object.fromEntries(
          Object.entries(state).map(([stateKey, value]) => [stateKey, Number(value)]),
        ),
      ]),
    ),
    clampingActivations: result.clampingActivations,
    maxPreClampExcess: Number(result.maxPreClampExcess),
    maxConservationDeviation: Object.fromEntries(
      Object.entries(result.maxConservationDeviation).map(([key, value]) => [key, Number(value)]),
    ),
    convergenceDelta: Number(result.convergenceDelta),
    equilibriumResidual: Number(result.equilibriumResidual),
  };
}

function makeCheckpoint(
  plan: SimulationRunPlan,
  results: readonly NumericMemberResult[],
): SimulationCheckpoint {
  return immutableWithDigest({
    schemaVersion: 1 as const,
    runId: plan.runId,
    replayIdentitySha256: plan.replayIdentitySha256,
    runPlanSha256: plan.manifestSha256,
    nextMemberIndex: results.length,
    completedMembers: results.map(checkpointMember),
  });
}

export function assertCheckpointIntegrity(
  checkpoint: SimulationCheckpoint,
  plan: SimulationRunPlan,
): void {
  assertDigestIntegrity(checkpoint, "checkpoint");
  assertPlainRecord(checkpoint as unknown, "checkpoint");
  assertExactKeys(
    checkpoint as unknown as Record<string, unknown>,
    [
      "schemaVersion",
      "runId",
      "replayIdentitySha256",
      "runPlanSha256",
      "nextMemberIndex",
      "completedMembers",
      "manifestSha256",
    ],
    "checkpoint",
  );
  if (checkpoint.schemaVersion !== 1) throw new TypeError("checkpoint.schemaVersion must be 1");
  assertUuid(checkpoint.runId, "checkpoint.runId");
  assertSha256(checkpoint.replayIdentitySha256, "checkpoint.replayIdentitySha256");
  assertSha256(checkpoint.runPlanSha256, "checkpoint.runPlanSha256");
  if (
    checkpoint.runId !== plan.runId ||
    checkpoint.replayIdentitySha256 !== plan.replayIdentitySha256 ||
    checkpoint.runPlanSha256 !== plan.manifestSha256
  ) {
    throw new TypeError("checkpoint does not belong to this exact replay identity");
  }
  assertInteger(checkpoint.nextMemberIndex, "checkpoint.nextMemberIndex", 0, plan.ensembleSize);
  if (checkpoint.completedMembers.length !== checkpoint.nextMemberIndex) {
    throw new TypeError("checkpoint member count does not match nextMemberIndex");
  }
  for (const [index, result] of checkpoint.completedMembers.entries()) {
    assertPlainRecord(result as unknown, `checkpoint.completedMembers[${index}]`);
    assertExactKeys(
      result as unknown as Record<string, unknown>,
      [
        "memberIndex",
        "finalStates",
        "clampingActivations",
        "maxPreClampExcess",
        "maxConservationDeviation",
        "convergenceDelta",
        "equilibriumResidual",
      ],
      `checkpoint.completedMembers[${index}]`,
    );
    if (result.memberIndex !== index)
      throw new TypeError("checkpoint members must be complete and canonically ordered");
    assertInteger(
      result.clampingActivations,
      `checkpoint.completedMembers[${index}].clampingActivations`,
      0,
      plan.resourceBudget.maxStateUpdates,
    );
    assertDecimal(
      result.maxPreClampExcess,
      `checkpoint.completedMembers[${index}].maxPreClampExcess`,
      0,
    );
    assertDecimal(
      result.convergenceDelta,
      `checkpoint.completedMembers[${index}].convergenceDelta`,
      0,
    );
    assertDecimal(
      result.equilibriumResidual,
      `checkpoint.completedMembers[${index}].equilibriumResidual`,
      0,
    );
    assertPlainRecord(
      result.maxConservationDeviation as unknown,
      `checkpoint.completedMembers[${index}].maxConservationDeviation`,
    );
    if (Object.keys(result.maxConservationDeviation).length > 32) {
      throw new TypeError("checkpoint conservation diagnostics exceed the resource bound");
    }
    for (const [key, value] of Object.entries(result.maxConservationDeviation)) {
      assertKey(key, `checkpoint.completedMembers[${index}].conservationKey`);
      assertDecimal(value, `checkpoint.completedMembers[${index}].conservation.${key}`, 0);
    }
    assertPlainRecord(
      result.finalStates as unknown,
      `checkpoint.completedMembers[${index}].finalStates`,
    );
    let stateCells = 0;
    for (const [populationKey, states] of Object.entries(result.finalStates)) {
      assertKey(populationKey, `checkpoint.completedMembers[${index}].populationKey`);
      assertPlainRecord(
        states as unknown,
        `checkpoint.completedMembers[${index}].${populationKey}`,
      );
      for (const [stateKey, value] of Object.entries(states)) {
        stateCells += 1;
        if (stateCells > 8_192) {
          throw new TypeError("checkpoint state cells exceed the system-definition bound");
        }
        assertKey(stateKey, `checkpoint.completedMembers[${index}].stateKey`);
        assertDecimal(value, `checkpoint.completedMembers[${index}].${populationKey}.${stateKey}`);
      }
    }
    if (stateCells === 0) throw new TypeError("checkpoint member final states must not be empty");
  }
}

function quantile(values: readonly number[], percentile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) throw new TypeError("cannot summarize an empty ensemble");
  const position = (sorted.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lower === undefined || upper === undefined)
    throw new TypeError("quantile index escaped ensemble");
  return lower + (upper - lower) * (position - lowerIndex);
}

function distributions(
  plan: SimulationRunPlan,
  definition: SystemDefinition,
  results: readonly NumericMemberResult[],
): StateOutputDistribution[] {
  const contracts = new Map(definition.stateVariables.map((item) => [item.stateKey, item]));
  const output: StateOutputDistribution[] = [];
  for (const population of [...definition.populations].sort((a, b) =>
    a.populationKey.localeCompare(b.populationKey),
  )) {
    for (const stateKey of plan.outputStateKeys) {
      const contract = contracts.get(stateKey);
      if (!contract) throw new TypeError("output contract disappeared");
      const values = results.map((result) => {
        const value = result.finalStates[population.populationKey]?.[stateKey];
        if (value === undefined) throw new TypeError("output state disappeared");
        return value;
      });
      output.push({
        populationKey: population.populationKey,
        stateKey,
        unit: contract.unit,
        sampleCount: values.length,
        minimum: canonicalDecimal(Math.min(...values)),
        maximum: canonicalDecimal(Math.max(...values)),
        mean: canonicalDecimal(values.reduce((sum, value) => sum + value, 0) / values.length),
        quantiles: {
          p05: canonicalDecimal(quantile(values, 0.05)),
          p50: canonicalDecimal(quantile(values, 0.5)),
          p95: canonicalDecimal(quantile(values, 0.95)),
          method: "linear_order_statistic_v1",
        },
      });
    }
  }
  return output;
}

function runSensitivity(
  plan: SimulationRunPlan,
  definition: SystemDefinition,
  calibration: CalibrationManifest,
  world: SimulationWorld,
): SimulationDiagnostics["sensitivity"] {
  const nominal = nominalParameters(calibration);
  const contracts = new Map(definition.parameterContracts.map((item) => [item.parameterKey, item]));
  const values = new Map(calibration.parameterValues.map((item) => [item.parameterKey, item]));
  return plan.sensitivityParameterKeys.map((parameterKey, index) => {
    const contract = contracts.get(parameterKey);
    const calibrated = values.get(parameterKey);
    if (!contract || !calibrated) throw new TypeError("sensitivity parameter disappeared");
    const low =
      calibrated.uncertainty.kind === "uniform" ? calibrated.uncertainty.lower : contract.minimum;
    const high =
      calibrated.uncertainty.kind === "uniform" ? calibrated.uncertainty.upper : contract.maximum;
    const lowResult = runMember(
      plan,
      definition,
      world,
      -(index + 1),
      { ...nominal, [parameterKey]: Number(low) },
      false,
    );
    const highResult = runMember(
      plan,
      definition,
      world,
      -(index + 1),
      { ...nominal, [parameterKey]: Number(high) },
      false,
    );
    if (!lowResult || !highResult)
      throw new TypeError("bounded sensitivity run was unexpectedly cancelled");
    let maxEndpointSpread = 0;
    for (const [populationKey, state] of Object.entries(lowResult.finalStates)) {
      for (const [stateKey, value] of Object.entries(state)) {
        maxEndpointSpread = Math.max(
          maxEndpointSpread,
          Math.abs((highResult.finalStates[populationKey]?.[stateKey] ?? value) - value),
        );
      }
    }
    return {
      parameterKey,
      lowValue: low,
      highValue: high,
      maxEndpointSpread: canonicalDecimal(maxEndpointSpread),
      finiteAndBounded: true as const,
    };
  });
}

function buildDiagnostics(
  plan: SimulationRunPlan,
  definition: SystemDefinition,
  calibration: CalibrationManifest,
  world: SimulationWorld,
  results: readonly NumericMemberResult[],
): SimulationDiagnostics {
  const maxPreClampExcess = Math.max(...results.map((item) => item.maxPreClampExcess));
  const clampingActivations = results.reduce((sum, item) => sum + item.clampingActivations, 0);
  const convergenceDelta = Math.max(...results.map((item) => item.convergenceDelta));
  const equilibriumResidual = Math.max(...results.map((item) => item.equilibriumResidual));
  const numericalTolerance = Number(plan.numericalTolerance);
  const infinityNorm = Math.max(
    ...definition.transitionEquations.map(
      (equation) =>
        Math.abs(Number(equation.persistenceCoefficient)) +
        equation.influences.reduce((sum, item) => sum + Math.abs(Number(item.coefficient)), 0),
    ),
  );
  return {
    range: {
      passed: true,
      clampingActivations,
      maxPreClampExcess: canonicalDecimal(maxPreClampExcess),
    },
    conservation: definition.conservationInvariants.map((invariant) => {
      const maxDeviation = Math.max(
        ...results.map((result) => result.maxConservationDeviation[invariant.invariantKey] ?? 0),
      );
      return {
        invariantKey: invariant.invariantKey,
        tolerance: invariant.tolerance,
        maxDeviation: canonicalDecimal(maxDeviation),
        passed: maxDeviation <= Number(invariant.tolerance) + numericalTolerance,
      };
    }),
    convergence: {
      windowSteps: plan.convergence.windowSteps,
      tolerance: plan.convergence.tolerance,
      maxDelta: canonicalDecimal(convergenceDelta),
      passed: convergenceDelta <= Number(plan.convergence.tolerance) + numericalTolerance,
    },
    equilibrium: {
      tolerance: plan.equilibriumTolerance,
      maxOneStepResidual: canonicalDecimal(equilibriumResidual),
      passed: equilibriumResidual <= Number(plan.equilibriumTolerance) + numericalTolerance,
    },
    stability: {
      jacobianInfinityNormUpperBound: canonicalDecimal(infinityNorm),
      locallyContractiveWithinTolerance: infinityNorm <= 1 + numericalTolerance,
    },
    sensitivity: runSensitivity(plan, definition, calibration, world),
    numerical: {
      allFinite: true,
      decimalOutputScaleMaximum: 12,
      declaredTolerance: plan.numericalTolerance,
    },
  };
}

function uncertaintyBreakdown(
  plan: SimulationRunPlan,
  calibration: CalibrationManifest,
): SimulationUncertaintyBreakdown {
  const sampledParameterKeys = calibration.parameterValues
    .filter((item) => item.uncertainty.kind === "uniform")
    .map((item) => item.parameterKey)
    .sort();
  const assumptionKeys = calibration.structuralAssumptions.map((item) => item.assumptionKey).sort();
  return {
    parameter: {
      status: sampledParameterKeys.length === 0 ? "fixed" : "sampled",
      sampledParameterKeys,
    },
    model: {
      status: "not_quantified",
      reason:
        "This run uses one reviewed model version; between-model uncertainty was not estimated.",
    },
    input: {
      status: plan.inputUncertainty.length === 0 ? "not_declared" : "sampled",
      sampledInputKeys: plan.inputUncertainty.map((item) => item.uncertaintyKey),
    },
    monteCarlo: {
      status: "finite_ensemble_summary",
      ensembleSize: plan.ensembleSize,
      quantileMethod: "linear_order_statistic_v1",
    },
    structural: {
      status: assumptionKeys.length === 0 ? "not_quantified" : "sensitivity_only",
      assumptionKeys,
      reason:
        assumptionKeys.length === 0
          ? "No structural assumptions were declared in this calibration."
          : "Declared structural parameters received endpoint sensitivity checks; no distribution was assigned to structural uncertainty.",
    },
  };
}

export function runSimulation(
  plan: SimulationRunPlan,
  definition: SystemDefinition,
  calibration: CalibrationManifest,
  world: SimulationWorld,
  options: SimulationExecutionOptions = {},
): Readonly<SimulationExecutionResult> {
  assertRunPlanIntegrity(plan, definition, calibration, world);
  const results: NumericMemberResult[] = [];
  if (options.checkpoint) {
    assertCheckpointIntegrity(options.checkpoint, plan);
    results.push(...options.checkpoint.completedMembers.map(numericMember));
  }
  for (let memberIndex = results.length; memberIndex < plan.ensembleSize; memberIndex += 1) {
    if (options.isCancellationRequested?.()) {
      const checkpoint = makeCheckpoint(plan, results);
      return deepFreeze({
        schemaVersion: 1,
        status: "cancelled",
        runId: plan.runId,
        replayIdentitySha256: plan.replayIdentitySha256,
        completedMembers: results.length,
        checkpoint,
        limitation: "Cancellation checkpoints only retain fully completed ensemble members.",
      });
    }
    const result = runMember(
      plan,
      definition,
      world,
      memberIndex,
      sampledParameters(plan, calibration, memberIndex),
      true,
      options.isCancellationRequested,
    );
    if (!result) {
      const checkpoint = makeCheckpoint(plan, results);
      return deepFreeze({
        schemaVersion: 1,
        status: "cancelled",
        runId: plan.runId,
        replayIdentitySha256: plan.replayIdentitySha256,
        completedMembers: results.length,
        checkpoint,
        limitation: "Cancellation checkpoints only retain fully completed ensemble members.",
      });
    }
    results.push(result);
    if (results.length % plan.checkpointEveryMembers === 0 && results.length < plan.ensembleSize) {
      options.onCheckpoint?.(makeCheckpoint(plan, results));
    }
  }
  const body: CompletedSimulationResultInput = {
    schemaVersion: 1,
    status: "completed",
    runId: plan.runId,
    replayIdentitySha256: plan.replayIdentitySha256,
    runPlanSha256: plan.manifestSha256,
    systemDefinitionSha256: definition.manifestSha256,
    calibrationManifestSha256: calibration.manifestSha256,
    worldSha256: world.manifestSha256,
    completedMembers: results.length,
    stepsPerMember: plan.steps,
    distributions: distributions(plan, definition, results),
    diagnostics: buildDiagnostics(plan, definition, calibration, world, results),
    uncertainty: uncertaintyBreakdown(plan, calibration),
    limitations: LIMITATIONS,
  };
  return immutableWithDigest(body);
}

export function assertCompletedResultIntegrity(result: CompletedSimulationResult): void {
  assertDigestIntegrity(result, "simulationResult");
  assertPlainRecord(result as unknown, "simulationResult");
  assertExactKeys(
    result as unknown as Record<string, unknown>,
    [
      "schemaVersion",
      "status",
      "runId",
      "replayIdentitySha256",
      "runPlanSha256",
      "systemDefinitionSha256",
      "calibrationManifestSha256",
      "worldSha256",
      "completedMembers",
      "stepsPerMember",
      "distributions",
      "diagnostics",
      "uncertainty",
      "limitations",
      "manifestSha256",
    ],
    "simulationResult",
  );
  if (result.schemaVersion !== 1 || result.status !== "completed") {
    throw new TypeError("simulation result is not a completed ensemble");
  }
  assertUuid(result.runId, "result.runId");
  for (const [field, digest] of [
    ["replayIdentitySha256", result.replayIdentitySha256],
    ["runPlanSha256", result.runPlanSha256],
    ["systemDefinitionSha256", result.systemDefinitionSha256],
    ["calibrationManifestSha256", result.calibrationManifestSha256],
    ["worldSha256", result.worldSha256],
  ] as const) {
    assertSha256(digest, `result.${field}`);
  }
  assertInteger(result.completedMembers, "result.completedMembers", 1, 512);
  assertInteger(result.stepsPerMember, "result.stepsPerMember", 1, 10_000);
  if (
    !Array.isArray(result.distributions) ||
    result.distributions.length === 0 ||
    result.distributions.length > 100_000
  ) {
    throw new TypeError("result distributions must contain 1..100000 items");
  }
  uniqueBy(
    result.distributions,
    (distribution) => `${distribution.populationKey}:${distribution.stateKey}`,
    "result distributions",
  );
  for (const [index, distribution] of result.distributions.entries()) {
    const field = `result.distributions[${index}]`;
    assertPlainRecord(distribution as unknown, field);
    assertExactKeys(
      distribution as unknown as Record<string, unknown>,
      [
        "populationKey",
        "stateKey",
        "unit",
        "sampleCount",
        "minimum",
        "maximum",
        "mean",
        "quantiles",
      ],
      field,
    );
    assertKey(distribution.populationKey, `${field}.populationKey`);
    assertKey(distribution.stateKey, `${field}.stateKey`);
    assertNonBlank(distribution.unit, `${field}.unit`, 100);
    if (distribution.sampleCount !== result.completedMembers) {
      throw new TypeError(`${field}.sampleCount must equal completedMembers`);
    }
    assertPlainRecord(distribution.quantiles as unknown, `${field}.quantiles`);
    assertExactKeys(
      distribution.quantiles as unknown as Record<string, unknown>,
      ["p05", "p50", "p95", "method"],
      `${field}.quantiles`,
    );
    if (distribution.quantiles.method !== "linear_order_statistic_v1") {
      throw new TypeError(`${field}.quantiles method is invalid`);
    }
    const minimum = assertDecimal(distribution.minimum, `${field}.minimum`);
    const maximum = assertDecimal(distribution.maximum, `${field}.maximum`);
    const mean = assertDecimal(distribution.mean, `${field}.mean`);
    const p05 = assertDecimal(distribution.quantiles.p05, `${field}.quantiles.p05`);
    const p50 = assertDecimal(distribution.quantiles.p50, `${field}.quantiles.p50`);
    const p95 = assertDecimal(distribution.quantiles.p95, `${field}.quantiles.p95`);
    if (
      minimum > p05 ||
      p05 > p50 ||
      p50 > p95 ||
      p95 > maximum ||
      mean < minimum ||
      mean > maximum
    ) {
      throw new TypeError(`${field} summary statistics are not ordered`);
    }
  }

  const diagnostics = result.diagnostics;
  assertPlainRecord(diagnostics as unknown, "result.diagnostics");
  assertExactKeys(
    diagnostics as unknown as Record<string, unknown>,
    [
      "range",
      "conservation",
      "convergence",
      "equilibrium",
      "stability",
      "sensitivity",
      "numerical",
    ],
    "result.diagnostics",
  );
  assertPlainRecord(diagnostics.numerical as unknown, "result.diagnostics.numerical");
  assertExactKeys(
    diagnostics.numerical as unknown as Record<string, unknown>,
    ["allFinite", "decimalOutputScaleMaximum", "declaredTolerance"],
    "result.diagnostics.numerical",
  );
  if (
    diagnostics.numerical.allFinite !== true ||
    diagnostics.numerical.decimalOutputScaleMaximum !== 12
  ) {
    throw new TypeError("result numerical safety declaration is invalid");
  }
  const numericalTolerance = assertDecimal(
    diagnostics.numerical.declaredTolerance,
    "result.diagnostics.numerical.declaredTolerance",
    0,
    1,
  );
  if (numericalTolerance <= 0) throw new TypeError("result numerical tolerance must be positive");

  assertPlainRecord(diagnostics.range as unknown, "result.diagnostics.range");
  assertExactKeys(
    diagnostics.range as unknown as Record<string, unknown>,
    ["passed", "clampingActivations", "maxPreClampExcess"],
    "result.diagnostics.range",
  );
  if (diagnostics.range.passed !== true) {
    throw new TypeError("bounded simulation range diagnostic must pass");
  }
  assertInteger(
    diagnostics.range.clampingActivations,
    "result.diagnostics.range.clampingActivations",
    0,
    25_000_000,
  );
  assertDecimal(
    diagnostics.range.maxPreClampExcess,
    "result.diagnostics.range.maxPreClampExcess",
    0,
  );

  if (!Array.isArray(diagnostics.conservation) || diagnostics.conservation.length > 32) {
    throw new TypeError("result conservation diagnostics exceed the resource bound");
  }
  uniqueBy(diagnostics.conservation, (item) => item.invariantKey, "conservation diagnostics");
  for (const [index, item] of diagnostics.conservation.entries()) {
    const field = `result.diagnostics.conservation[${index}]`;
    assertPlainRecord(item as unknown, field);
    assertExactKeys(
      item as unknown as Record<string, unknown>,
      ["invariantKey", "tolerance", "maxDeviation", "passed"],
      field,
    );
    assertKey(item.invariantKey, `${field}.invariantKey`);
    const tolerance = assertDecimal(item.tolerance, `${field}.tolerance`, 0, 1_000_000);
    const deviation = assertDecimal(item.maxDeviation, `${field}.maxDeviation`, 0);
    if (typeof item.passed !== "boolean") throw new TypeError(`${field}.passed must be boolean`);
    if (item.passed !== deviation <= tolerance + numericalTolerance) {
      throw new TypeError(`${field}.passed disagrees with its declared tolerance`);
    }
  }

  assertPlainRecord(diagnostics.convergence as unknown, "result.diagnostics.convergence");
  assertExactKeys(
    diagnostics.convergence as unknown as Record<string, unknown>,
    ["windowSteps", "tolerance", "maxDelta", "passed"],
    "result.diagnostics.convergence",
  );
  assertInteger(
    diagnostics.convergence.windowSteps,
    "result.diagnostics.convergence.windowSteps",
    1,
    result.stepsPerMember,
  );
  const convergenceTolerance = assertDecimal(
    diagnostics.convergence.tolerance,
    "result.diagnostics.convergence.tolerance",
    0,
    1_000_000,
  );
  const maxDelta = assertDecimal(
    diagnostics.convergence.maxDelta,
    "result.diagnostics.convergence.maxDelta",
    0,
  );
  if (
    typeof diagnostics.convergence.passed !== "boolean" ||
    diagnostics.convergence.passed !== maxDelta <= convergenceTolerance + numericalTolerance
  ) {
    throw new TypeError("result convergence status disagrees with its declared tolerance");
  }

  assertPlainRecord(diagnostics.equilibrium as unknown, "result.diagnostics.equilibrium");
  assertExactKeys(
    diagnostics.equilibrium as unknown as Record<string, unknown>,
    ["tolerance", "maxOneStepResidual", "passed"],
    "result.diagnostics.equilibrium",
  );
  const equilibriumTolerance = assertDecimal(
    diagnostics.equilibrium.tolerance,
    "result.diagnostics.equilibrium.tolerance",
    0,
    1_000_000,
  );
  const maxResidual = assertDecimal(
    diagnostics.equilibrium.maxOneStepResidual,
    "result.diagnostics.equilibrium.maxOneStepResidual",
    0,
  );
  if (
    typeof diagnostics.equilibrium.passed !== "boolean" ||
    diagnostics.equilibrium.passed !== maxResidual <= equilibriumTolerance + numericalTolerance
  ) {
    throw new TypeError("result equilibrium status disagrees with its declared tolerance");
  }

  assertPlainRecord(diagnostics.stability as unknown, "result.diagnostics.stability");
  assertExactKeys(
    diagnostics.stability as unknown as Record<string, unknown>,
    ["jacobianInfinityNormUpperBound", "locallyContractiveWithinTolerance"],
    "result.diagnostics.stability",
  );
  const norm = assertDecimal(
    diagnostics.stability.jacobianInfinityNormUpperBound,
    "result.diagnostics.stability.jacobianInfinityNormUpperBound",
    0,
  );
  if (
    typeof diagnostics.stability.locallyContractiveWithinTolerance !== "boolean" ||
    diagnostics.stability.locallyContractiveWithinTolerance !== norm <= 1 + numericalTolerance
  ) {
    throw new TypeError("result stability status disagrees with its declared tolerance");
  }

  if (!Array.isArray(diagnostics.sensitivity) || diagnostics.sensitivity.length > 16) {
    throw new TypeError("result sensitivity diagnostics exceed the resource bound");
  }
  uniqueBy(diagnostics.sensitivity, (item) => item.parameterKey, "sensitivity diagnostics");
  for (const [index, item] of diagnostics.sensitivity.entries()) {
    const field = `result.diagnostics.sensitivity[${index}]`;
    assertPlainRecord(item as unknown, field);
    assertExactKeys(
      item as unknown as Record<string, unknown>,
      ["parameterKey", "lowValue", "highValue", "maxEndpointSpread", "finiteAndBounded"],
      field,
    );
    assertKey(item.parameterKey, `${field}.parameterKey`);
    const low = assertDecimal(item.lowValue, `${field}.lowValue`);
    const high = assertDecimal(item.highValue, `${field}.highValue`);
    if (low > high) throw new TypeError(`${field} endpoints are reversed`);
    assertDecimal(item.maxEndpointSpread, `${field}.maxEndpointSpread`, 0);
    if (item.finiteAndBounded !== true) {
      throw new TypeError(`${field} must retain its finite-and-bounded declaration`);
    }
  }

  assertUncertaintyIntegrity(result.uncertainty, result.completedMembers);
  if (
    !Array.isArray(result.limitations) ||
    result.limitations.length !== LIMITATIONS.length ||
    result.limitations.some((limitation, index) => limitation !== LIMITATIONS[index])
  ) {
    throw new TypeError("simulation result interpretation limitations are incomplete or reordered");
  }
}

function assertUncertaintyIntegrity(
  uncertainty: SimulationUncertaintyBreakdown,
  completedMembers: number,
): void {
  assertPlainRecord(uncertainty as unknown, "result.uncertainty");
  assertExactKeys(
    uncertainty as unknown as Record<string, unknown>,
    ["parameter", "model", "input", "monteCarlo", "structural"],
    "result.uncertainty",
  );
  assertPlainRecord(uncertainty.parameter as unknown, "result.uncertainty.parameter");
  assertExactKeys(
    uncertainty.parameter as unknown as Record<string, unknown>,
    ["status", "sampledParameterKeys"],
    "result.uncertainty.parameter",
  );
  assertCanonicalKeyList(
    uncertainty.parameter.sampledParameterKeys,
    "result.uncertainty.parameter.sampledParameterKeys",
    128,
  );
  if (
    uncertainty.parameter.status !==
    (uncertainty.parameter.sampledParameterKeys.length === 0 ? "fixed" : "sampled")
  ) {
    throw new TypeError("result parameter uncertainty status is inconsistent");
  }
  assertPlainRecord(uncertainty.model as unknown, "result.uncertainty.model");
  assertExactKeys(
    uncertainty.model as unknown as Record<string, unknown>,
    ["status", "reason"],
    "result.uncertainty.model",
  );
  if (uncertainty.model.status !== "not_quantified") {
    throw new TypeError("result model uncertainty status is invalid");
  }
  assertNonBlank(uncertainty.model.reason, "result.uncertainty.model.reason", 2_000);
  assertPlainRecord(uncertainty.input as unknown, "result.uncertainty.input");
  assertExactKeys(
    uncertainty.input as unknown as Record<string, unknown>,
    ["status", "sampledInputKeys"],
    "result.uncertainty.input",
  );
  assertCanonicalKeyList(
    uncertainty.input.sampledInputKeys,
    "result.uncertainty.input.sampledInputKeys",
    128,
  );
  if (
    uncertainty.input.status !==
    (uncertainty.input.sampledInputKeys.length === 0 ? "not_declared" : "sampled")
  ) {
    throw new TypeError("result input uncertainty status is inconsistent");
  }
  assertPlainRecord(uncertainty.monteCarlo as unknown, "result.uncertainty.monteCarlo");
  assertExactKeys(
    uncertainty.monteCarlo as unknown as Record<string, unknown>,
    ["status", "ensembleSize", "quantileMethod"],
    "result.uncertainty.monteCarlo",
  );
  if (
    uncertainty.monteCarlo.status !== "finite_ensemble_summary" ||
    uncertainty.monteCarlo.ensembleSize !== completedMembers ||
    uncertainty.monteCarlo.quantileMethod !== "linear_order_statistic_v1"
  ) {
    throw new TypeError("result Monte Carlo uncertainty does not match the completed ensemble");
  }
  assertPlainRecord(uncertainty.structural as unknown, "result.uncertainty.structural");
  assertExactKeys(
    uncertainty.structural as unknown as Record<string, unknown>,
    ["status", "assumptionKeys", "reason"],
    "result.uncertainty.structural",
  );
  assertCanonicalKeyList(
    uncertainty.structural.assumptionKeys,
    "result.uncertainty.structural.assumptionKeys",
    128,
  );
  const expectedStructuralStatus =
    uncertainty.structural.assumptionKeys.length === 0 ? "not_quantified" : "sensitivity_only";
  if (uncertainty.structural.status !== expectedStructuralStatus) {
    throw new TypeError("result structural uncertainty status is inconsistent");
  }
  assertNonBlank(uncertainty.structural.reason, "result.uncertainty.structural.reason", 2_000);
}

function assertCanonicalKeyList(values: readonly string[], field: string, maximum: number): void {
  if (!Array.isArray(values) || values.length > maximum) {
    throw new TypeError(`${field} exceeds its resource bound`);
  }
  uniqueBy(values, (value) => value, field);
  for (const value of values) assertKey(value, `${field} item`);
  if (values.some((value, index) => index > 0 && value <= (values[index - 1] ?? ""))) {
    throw new TypeError(`${field} must be in deterministic ascending order`);
  }
}

export interface ReproducibilityReceiptInput {
  readonly schemaVersion: 1;
  readonly receiptId: string;
  readonly comparedAt: string;
  readonly first: CompletedSimulationResult;
  readonly second: CompletedSimulationResult;
  readonly tolerance: string;
}

export interface ReproducibilityReceipt {
  readonly schemaVersion: 1;
  readonly receiptId: string;
  readonly comparedAt: string;
  readonly replayIdentitySha256: string;
  readonly firstResultSha256: string;
  readonly secondResultSha256: string;
  readonly exactContentMatch: boolean;
  readonly numericWithinTolerance: boolean;
  readonly maxAbsoluteDifference: string;
  readonly status: "exact_match" | "within_tolerance" | "mismatch";
  readonly manifestSha256: string;
}

interface ComparableDistribution {
  readonly unit: string;
  readonly sampleCount: number;
  readonly values: readonly number[];
}

function distributionValues(
  result: CompletedSimulationResult,
): Map<string, ComparableDistribution> {
  return new Map(
    result.distributions.map((item) => [
      `${item.populationKey}:${item.stateKey}`,
      {
        unit: item.unit,
        sampleCount: item.sampleCount,
        values: [
          Number(item.minimum),
          Number(item.maximum),
          Number(item.mean),
          Number(item.quantiles.p05),
          Number(item.quantiles.p50),
          Number(item.quantiles.p95),
        ],
      },
    ]),
  );
}

export function createReproducibilityReceipt(
  input: ReproducibilityReceiptInput,
): Readonly<ReproducibilityReceipt> {
  if (input.schemaVersion !== 1) throw new TypeError("receipt.schemaVersion must be 1");
  assertUuid(input.receiptId, "receiptId");
  assertIsoInstant(input.comparedAt, "receipt.comparedAt");
  assertCompletedResultIntegrity(input.first);
  assertCompletedResultIntegrity(input.second);
  if (input.first.replayIdentitySha256 !== input.second.replayIdentitySha256) {
    throw new TypeError("reproducibility comparison requires the same replay identity");
  }
  const tolerance = assertDecimal(input.tolerance, "receipt.tolerance", 0, 1);
  if (tolerance <= 0) throw new TypeError("receipt tolerance must be positive");
  const first = distributionValues(input.first);
  const second = distributionValues(input.second);
  let structurallyComparable =
    first.size === second.size &&
    input.first.runPlanSha256 === input.second.runPlanSha256 &&
    input.first.systemDefinitionSha256 === input.second.systemDefinitionSha256 &&
    input.first.calibrationManifestSha256 === input.second.calibrationManifestSha256 &&
    input.first.worldSha256 === input.second.worldSha256 &&
    input.first.completedMembers === input.second.completedMembers &&
    input.first.stepsPerMember === input.second.stepsPerMember;
  let maxDifference = 0;
  for (const [key, left] of first) {
    const right = second.get(key);
    if (
      !right ||
      right.unit !== left.unit ||
      right.sampleCount !== left.sampleCount ||
      right.values.length !== left.values.length
    ) {
      structurallyComparable = false;
      continue;
    }
    for (const [index, value] of left.values.entries()) {
      maxDifference = Math.max(
        maxDifference,
        Math.abs(value - (right.values[index] ?? Number.NaN)),
      );
    }
  }
  const exactContentMatch = input.first.manifestSha256 === input.second.manifestSha256;
  const numericWithinTolerance = structurallyComparable && maxDifference <= tolerance;
  return immutableWithDigest({
    schemaVersion: 1 as const,
    receiptId: input.receiptId,
    comparedAt: input.comparedAt,
    replayIdentitySha256: input.first.replayIdentitySha256,
    firstResultSha256: input.first.manifestSha256,
    secondResultSha256: input.second.manifestSha256,
    exactContentMatch,
    numericWithinTolerance,
    maxAbsoluteDifference: canonicalDecimal(maxDifference),
    status: exactContentMatch
      ? ("exact_match" as const)
      : numericWithinTolerance
        ? ("within_tolerance" as const)
        : ("mismatch" as const),
  });
}

export function registeredKernelSource(kernelId: string): "built_in_bounded_linear_equations" {
  if (kernelId !== "bounded-linear-stock-flow.v1") {
    throw new TypeError("unregistered kernels and user-supplied code are forbidden");
  }
  return "built_in_bounded_linear_equations";
}
