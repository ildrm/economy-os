import type { SystemDefinition } from "./definitions.js";
import { assertSystemDefinitionIntegrity } from "./definitions.js";
import {
  assertDecimal,
  assertDigestIntegrity,
  assertInteger,
  assertIsoInstant,
  assertKey,
  assertNonBlank,
  assertSha256,
  assertUuid,
  compareInstants,
  immutableWithDigest,
  uniqueBy,
} from "./internals.js";

export interface StateIntervention {
  readonly interventionKey: string;
  readonly populationKey: string | "*";
  readonly stateKey: string;
  readonly startStep: number;
  readonly endStep: number;
  readonly mode: "set" | "additive_shift";
  readonly value: string;
  readonly rationale: string;
}

export interface ExogenousShock {
  readonly shockKey: string;
  readonly populationKey: string | "*";
  readonly stateKey: string;
  readonly atStep: number;
  readonly additiveDelta: string;
  readonly rationale: string;
}

interface WorldCommon {
  readonly schemaVersion: 1;
  readonly worldId: string;
  readonly systemId: string;
  readonly systemVersion: string;
  readonly systemDefinitionSha256: string;
  readonly asOf: string;
  readonly createdAt: string;
  readonly label: string;
}

export interface ObservedBaselineWorldInput extends WorldCommon {
  readonly worldKind: "observed_baseline";
  readonly canonicalDatasetEligible: true;
  readonly inputDatasetSnapshotSha256: string;
  readonly interventions: readonly [];
  readonly shocks: readonly [];
}

export interface CounterfactualWorldInput extends WorldCommon {
  readonly worldKind: "scenario_counterfactual";
  readonly canonicalDatasetEligible: false;
  readonly inputDatasetSnapshotSha256: string;
  readonly baselineWorldId: string;
  readonly scenarioAuthoredBy: string;
  readonly notObservedFact: true;
  readonly interventions: readonly StateIntervention[];
  readonly shocks: readonly ExogenousShock[];
}

export type SimulationWorldInput = ObservedBaselineWorldInput | CounterfactualWorldInput;
export type SimulationWorld = SimulationWorldInput & { readonly manifestSha256: string };

function validateCommon(input: SimulationWorldInput, definition: SystemDefinition): void {
  assertSystemDefinitionIntegrity(definition);
  if (input.schemaVersion !== 1) throw new TypeError("world.schemaVersion must be 1");
  assertUuid(input.worldId, "worldId");
  if (
    input.systemId !== definition.systemId ||
    input.systemVersion !== definition.systemVersion ||
    input.systemDefinitionSha256 !== definition.manifestSha256
  ) {
    throw new TypeError("world must bind the exact system definition version and digest");
  }
  assertIsoInstant(input.asOf, "world.asOf");
  assertIsoInstant(input.createdAt, "world.createdAt");
  if (compareInstants(input.asOf, input.createdAt) > 0)
    throw new TypeError("world.asOf cannot follow createdAt");
  assertNonBlank(input.label, "world.label", 200);
  assertSha256(input.inputDatasetSnapshotSha256, "world.inputDatasetSnapshotSha256");
}

function validateCounterfactual(
  input: CounterfactualWorldInput,
  definition: SystemDefinition,
): void {
  if (input.canonicalDatasetEligible !== false || input.notObservedFact !== true) {
    throw new TypeError("counterfactual worlds must be explicitly barred from canonical datasets");
  }
  assertUuid(input.baselineWorldId, "baselineWorldId");
  if (input.baselineWorldId === input.worldId)
    throw new TypeError("counterfactual world cannot reference itself as baseline");
  assertUuid(input.scenarioAuthoredBy, "scenarioAuthoredBy");
  if (input.interventions.length + input.shocks.length === 0)
    throw new TypeError("counterfactual world requires an intervention or shock");
  if (input.interventions.length > 128 || input.shocks.length > 128)
    throw new TypeError("world exceeds scenario action bounds");
  const populations = new Set(definition.populations.map((item) => item.populationKey));
  const stateContracts = new Map(definition.stateVariables.map((item) => [item.stateKey, item]));
  uniqueBy(input.interventions, (item) => item.interventionKey, "interventions");
  for (const intervention of input.interventions) {
    assertKey(intervention.interventionKey, "interventionKey");
    if (intervention.populationKey !== "*" && !populations.has(intervention.populationKey)) {
      throw new TypeError("intervention refers to unknown population");
    }
    const state = stateContracts.get(intervention.stateKey);
    if (!state) throw new TypeError("intervention refers to unknown state variable");
    assertInteger(intervention.startStep, "intervention.startStep", 0, 9_999);
    assertInteger(intervention.endStep, "intervention.endStep", intervention.startStep, 9_999);
    const value = assertDecimal(intervention.value, "intervention.value");
    if (intervention.mode !== "set" && intervention.mode !== "additive_shift") {
      throw new TypeError("intervention mode is not registered");
    }
    if (
      intervention.mode === "set" &&
      (value < Number(state.minimum) || value > Number(state.maximum))
    ) {
      throw new TypeError("set intervention value violates state range");
    }
    assertNonBlank(intervention.rationale, "intervention.rationale", 1_000);
  }
  const sorted = [...input.interventions].sort((left, right) =>
    `${left.populationKey}:${left.stateKey}:${left.startStep}`.localeCompare(
      `${right.populationKey}:${right.stateKey}:${right.startStep}`,
    ),
  );
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (
      previous &&
      current &&
      previous.populationKey === current.populationKey &&
      previous.stateKey === current.stateKey &&
      current.startStep <= previous.endStep
    ) {
      throw new TypeError("overlapping interventions on the same target are ambiguous");
    }
  }
  uniqueBy(input.shocks, (item) => item.shockKey, "shocks");
  for (const shock of input.shocks) {
    assertKey(shock.shockKey, "shockKey");
    if (shock.populationKey !== "*" && !populations.has(shock.populationKey)) {
      throw new TypeError("shock refers to unknown population");
    }
    if (!stateContracts.has(shock.stateKey))
      throw new TypeError("shock refers to unknown state variable");
    assertInteger(shock.atStep, "shock.atStep", 0, 9_999);
    assertDecimal(shock.additiveDelta, "shock.additiveDelta");
    assertNonBlank(shock.rationale, "shock.rationale", 1_000);
  }
}

export function createSimulationWorld(
  input: SimulationWorldInput,
  definition: SystemDefinition,
): Readonly<SimulationWorld> {
  validateCommon(input, definition);
  if (input.worldKind === "observed_baseline") {
    if (
      input.canonicalDatasetEligible !== true ||
      input.interventions.length !== 0 ||
      input.shocks.length !== 0
    ) {
      throw new TypeError("observed baseline worlds cannot contain scenario actions");
    }
  } else if (input.worldKind === "scenario_counterfactual") {
    validateCounterfactual(input, definition);
  } else {
    throw new TypeError("worldKind is not registered");
  }
  return immutableWithDigest(input);
}

export function assertWorldIntegrity(world: SimulationWorld, definition: SystemDefinition): void {
  assertDigestIntegrity(world, "world");
  const { manifestSha256: _digest, ...body } = world;
  createSimulationWorld(body, definition);
}

export function assertEligibleForObservedCanonicalDataset(world: SimulationWorld): void {
  if (world.worldKind !== "observed_baseline" || world.canonicalDatasetEligible !== true) {
    throw new TypeError(
      "scenario/counterfactual worlds and their outputs cannot enter observed canonical datasets",
    );
  }
}
