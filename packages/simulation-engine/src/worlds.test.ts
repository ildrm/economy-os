import { describe, expect, it } from "vitest";
import { baselineWorld, definitionInput, IDS, scenarioWorld } from "./fixtures.test-helper.js";
import {
  assertEligibleForObservedCanonicalDataset,
  assertWorldIntegrity,
  createSimulationWorld,
  createSystemDefinition,
} from "./index.js";

describe("observed and counterfactual world separation", () => {
  it("admits only action-free observed baselines to canonical observed datasets", () => {
    const definition = createSystemDefinition(definitionInput());
    const baseline = baselineWorld(definition);
    expect(() => assertEligibleForObservedCanonicalDataset(baseline)).not.toThrow();
    assertWorldIntegrity(baseline, definition);
  });

  it("marks scenario worlds as non-observed and rejects canonical admission", () => {
    const definition = createSystemDefinition(definitionInput());
    const scenario = scenarioWorld(definition);
    expect(scenario).toMatchObject({
      worldKind: "scenario_counterfactual",
      canonicalDatasetEligible: false,
      notObservedFact: true,
    });
    expect(() => assertEligibleForObservedCanonicalDataset(scenario)).toThrow(
      "cannot enter observed canonical datasets",
    );
  });

  it("rejects empty, invalid, and ambiguous scenario actions", () => {
    const definition = createSystemDefinition(definitionInput());
    const common = {
      schemaVersion: 1 as const,
      worldId: IDS.scenario,
      systemId: definition.systemId,
      systemVersion: definition.systemVersion,
      systemDefinitionSha256: definition.manifestSha256,
      asOf: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-02T00:00:00Z",
      label: "Invalid scenario",
      worldKind: "scenario_counterfactual" as const,
      canonicalDatasetEligible: false as const,
      inputDatasetSnapshotSha256: "d".repeat(64),
      baselineWorldId: IDS.world,
      scenarioAuthoredBy: IDS.author,
      notObservedFact: true as const,
    };
    expect(() =>
      createSimulationWorld({ ...common, interventions: [], shocks: [] }, definition),
    ).toThrow("requires an intervention or shock");
    const action = {
      interventionKey: "first-action",
      populationKey: "households" as const,
      stateKey: "wealth",
      startStep: 1,
      endStep: 3,
      mode: "set" as const,
      value: "50",
      rationale: "First overlapping action.",
    };
    expect(() =>
      createSimulationWorld(
        {
          ...common,
          interventions: [
            action,
            { ...action, interventionKey: "second-action", startStep: 3, endStep: 4 },
          ],
          shocks: [],
        },
        definition,
      ),
    ).toThrow("overlapping interventions");
    expect(() =>
      createSimulationWorld(
        {
          ...common,
          interventions: [{ ...action, stateKey: "missing-state" }],
          shocks: [],
        },
        definition,
      ),
    ).toThrow("unknown state variable");
  });
});
