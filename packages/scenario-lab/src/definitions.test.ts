import { describe, expect, it } from "vitest";
import {
  applyScenarioActionsAtStep,
  assertBaselineIntegrity,
  assertNotObservedDatasetEligible,
  assertScenarioDefinitionIntegrity,
  type BaselineIdentity,
  createBaselineIdentity,
  createScenarioDefinition,
  reviseScenarioDefinition,
  type ScenarioDefinition,
  type ScenarioDefinitionInput,
} from "./definitions.js";
import {
  baselineInput,
  definitionInput,
  IDS,
  makeBaseline,
  makeDefinition,
  required,
  sha,
} from "./fixtures.test-helper.js";

describe("pinned baseline identity", () => {
  it("creates a stable deeply immutable point-in-time identity", () => {
    const first = makeBaseline();
    const second = makeBaseline();

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.model)).toBe(true);
    expect(first.canonicalObservedDatasetEligible).toBe(false);
    expect(() => assertBaselineIntegrity(first)).not.toThrow();
  });

  it.each([
    [
      "observed availability",
      {
        observedSnapshot: {
          ...baselineInput().observedSnapshot,
          availableAt: "2026-01-01T00:00:01Z",
        },
      },
    ],
    [
      "observation time",
      {
        observedSnapshot: {
          ...baselineInput().observedSnapshot,
          observedThrough: "2026-01-01T00:00:01Z",
        },
      },
    ],
    [
      "forecast generation",
      {
        forecastSnapshot: {
          ...baselineInput().forecastSnapshot,
          generatedAt: "2026-01-01T00:00:01Z",
        },
      },
    ],
    [
      "forecast information",
      {
        forecastSnapshot: {
          ...baselineInput().forecastSnapshot,
          informationCutoff: "2026-01-01T00:00:01Z",
        },
      },
    ],
    [
      "model training",
      { model: { ...baselineInput().model, trainingDataCutoff: "2026-01-01T00:00:01Z" } },
    ],
  ])("rejects point-in-time leakage through %s", (_label, override) => {
    expect(() => createBaselineIdentity(baselineInput(override))).toThrow(
      /point-in-time|chronology/,
    );
  });

  it("rejects future chronology, weak classification, malformed pins, and unknown fields", () => {
    expect(() =>
      createBaselineIdentity(baselineInput({ createdAt: "2025-12-31T23:00:00Z" })),
    ).toThrow(/created before/);
    expect(() =>
      createBaselineIdentity(baselineInput({ canonicalObservedDatasetEligible: true as false })),
    ).toThrow(/research artifacts/);
    expect(() => createBaselineIdentity(baselineInput({ baselineResultSha256: "bad" }))).toThrow(
      /SHA-256/,
    );
    const extra = { ...baselineInput(), surprise: true };
    expect(() => createBaselineIdentity(extra as never)).toThrow(/unknown fields/);
  });

  it("rejects calendar normalization, sub-millisecond leakage, and detached forecast training", () => {
    expect(() =>
      createBaselineIdentity(baselineInput({ pointInTimeCutoff: "2026-02-31T00:00:00Z" })),
    ).toThrow(/UTC instant/);
    expect(() =>
      createBaselineIdentity(
        baselineInput({
          createdAt: "2026-01-01T00:00:00.000000000Z",
          pointInTimeCutoff: "2026-01-01T00:00:00.000000001Z",
        }),
      ),
    ).toThrow(/created before/);
    expect(() =>
      createBaselineIdentity(
        baselineInput({
          observedSnapshot: {
            ...baselineInput().observedSnapshot,
            availableAt: "2025-12-29T00:00:00Z",
          },
        }),
      ),
    ).toThrow(/available before/);
    expect(() =>
      createBaselineIdentity(
        baselineInput({
          model: {
            ...baselineInput().model,
            trainingDataCutoff: "2025-12-31T00:00:01Z",
          },
        }),
      ),
    ).toThrow(/information cutoff/);
  });

  it("detects baseline tampering", () => {
    const tampered = structuredClone(makeBaseline()) as BaselineIdentity & {
      baselineResultSha256: string;
    };
    tampered.baselineResultSha256 = sha("0");
    expect(() => assertBaselineIntegrity(tampered)).toThrow(/digest/);
  });
});

describe("scenario definition and executable action composition", () => {
  it("orders overlapping shocks and interventions deterministically", () => {
    const baseline = makeBaseline();
    const definition = makeDefinition(baseline);
    const output = applyScenarioActionsAtStep(
      definition,
      {
        geographyKey: "gbr",
        sectorKey: "manufacturing",
        metricKey: "output_index",
        unit: "index_points",
      },
      2,
      "100",
    );

    expect(definition.conflicts).toHaveLength(1);
    expect(definition.orderedActionKeys).toEqual(["energy_shock", "temporary_support"]);
    expect(output).toEqual({
      value: "81",
      appliedActionKeys: ["energy_shock", "temporary_support"],
    });
    expect(Object.isFrozen(output.appliedActionKeys)).toBe(true);
  });

  it("normalizes set-like definition collections into a stable manifest", () => {
    const baseline = makeBaseline();
    const input = definitionInput(baseline);
    const reversed = {
      ...input,
      shocks: [...input.shocks].reverse(),
      policyInterventions: [...input.policyInterventions].reverse(),
      contributorIds: [...input.contributorIds].reverse(),
    };
    expect(createScenarioDefinition(reversed, baseline).manifestSha256).toBe(
      createScenarioDefinition(input, baseline).manifestSha256,
    );
  });

  it("supports wildcard targets and ignores inactive or nonmatching actions", () => {
    const baseline = makeBaseline();
    const input = definitionInput(baseline);
    const firstShock = required(input.shocks[0], "first shock");
    const wildcardShock = {
      ...firstShock,
      target: { ...firstShock.target, geographyKey: "*", sectorKey: "*" },
    };
    const definition = createScenarioDefinition(
      { ...input, shocks: [wildcardShock], policyInterventions: [] },
      baseline,
    );
    const target = {
      geographyKey: "usa",
      sectorKey: "services",
      metricKey: "output_index",
      unit: "index_points",
    };
    expect(applyScenarioActionsAtStep(definition, target, 1, "50").value).toBe("40");
    expect(applyScenarioActionsAtStep(definition, target, 8, "50")).toEqual({
      value: "50",
      appliedActionKeys: [],
    });
    expect(
      applyScenarioActionsAtStep(definition, { ...target, metricKey: "employment_index" }, 1, "50")
        .value,
    ).toBe("50");
  });

  it("rejects overlapping targets when configured to fail closed", () => {
    const baseline = makeBaseline();
    const input = definitionInput(baseline);
    expect(() =>
      createScenarioDefinition(
        {
          ...input,
          conflictResolution: {
            mode: "reject_overlap",
            explanation: "Reject all ambiguous overlaps.",
          },
        },
        baseline,
      ),
    ).toThrow(/overlap/);
  });

  it("advances revisions exactly once without baseline drift", () => {
    const baseline = makeBaseline();
    const previous = makeDefinition(baseline);
    const nextInput = definitionInput(baseline, {
      definitionVersion: 2,
      previousDefinitionSha256: previous.manifestSha256,
      createdAt: "2026-01-02T04:00:00Z",
      title: "Revised energy-cost stress exploration",
    });
    const next = reviseScenarioDefinition(previous, nextInput, baseline);

    expect(next.definitionVersion).toBe(2);
    expect(() => assertScenarioDefinitionIntegrity(next, baseline)).not.toThrow();
    expect(() =>
      reviseScenarioDefinition(previous, { ...nextInput, definitionVersion: 3 }, baseline),
    ).toThrow(/advance exactly one/);

    const otherBaseline = makeBaseline({
      baselineId: "00000000-0000-4000-8000-000000000099",
      baselineResultSha256: sha("1"),
    });
    expect(() =>
      reviseScenarioDefinition(
        previous,
        definitionInput(otherBaseline, {
          scenarioId: previous.scenarioId,
          definitionVersion: 2,
          previousDefinitionSha256: previous.manifestSha256,
        }),
        otherBaseline,
      ),
    ).toThrow(/baseline drift|same-tenant baseline/);
  });

  it.each([
    ["no actions", { shocks: [], policyInterventions: [] }],
    ["duplicate contributor", { contributorIds: [IDS.contributor, IDS.contributor] }],
    ["author duplicated", { contributorIds: [IDS.author] }],
    ["weak data class", { canonicalObservedDatasetEligible: true as false }],
    ["missing limitations", { limitations: [] }],
    ["unknown operation", { shocks: [] }],
  ])("rejects invalid scenario contract: %s", (label, override) => {
    const baseline = makeBaseline();
    let adjusted: Partial<ScenarioDefinitionInput> = override;
    if (label === "unknown operation") {
      const input = definitionInput(baseline);
      const firstShock = required(input.shocks[0], "first shock");
      adjusted = {
        shocks: [{ ...firstShock, operation: "divide" as "set" }],
        policyInterventions: [],
      };
    }
    expect(() => makeDefinition(baseline, adjusted)).toThrow();
  });

  it("enforces action bounds, target shape, and finite composition", () => {
    const baseline = makeBaseline();
    const input = definitionInput(baseline);
    const firstShock = required(input.shocks[0], "first shock");
    expect(() =>
      makeDefinition(baseline, {
        shocks: Array.from({ length: 129 }, (_, index) => ({
          ...firstShock,
          actionKey: `shock_${String(index).padStart(3, "0")}`,
        })),
        policyInterventions: [],
      }),
    ).toThrow(/bounded actions/);
    expect(() =>
      makeDefinition(baseline, {
        shocks: [{ ...firstShock, startStep: 5, endStep: 4 }],
        policyInterventions: [],
      }),
    ).toThrow(/integer/);
    const huge = makeDefinition(baseline, {
      shocks: [{ ...firstShock, operation: "multiply", value: "100" }],
      policyInterventions: [],
    });
    expect(() => applyScenarioActionsAtStep(huge, firstShock.target, 1, "1000000000000")).toThrow(
      /numeric bounds/,
    );
  });

  it("detects definition tampering and bars observed-data admission", () => {
    const baseline = makeBaseline();
    const definition = makeDefinition(baseline);
    const tampered = structuredClone(definition) as ScenarioDefinition & { title: string };
    tampered.title = "Silently changed";
    expect(() => assertScenarioDefinitionIntegrity(tampered, baseline)).toThrow(/digest/);
    expect(() => assertNotObservedDatasetEligible(definition)).toThrow(/cannot be admitted/);
  });

  it("fails closed across malformed action, version, assumption, and boundary variants", () => {
    expect(() => createBaselineIdentity(baselineInput({ schemaVersion: 2 as 1 }))).toThrow(
      /schemaVersion/,
    );

    const baseline = makeBaseline();
    const base = definitionInput(baseline);
    const shock = required(base.shocks[0], "first shock");
    const intervention = required(base.policyInterventions[0], "first intervention");
    const assumption = required(base.assumptions[0], "first assumption");
    expect(() => makeDefinition(baseline, { shocks: null as never })).toThrow(/arrays/);
    expect(() =>
      makeDefinition(baseline, {
        shocks: [{ ...shock, actionKind: "policy_intervention" as "shock" }],
        policyInterventions: [],
      }),
    ).toThrow(/actionKind/);
    expect(() =>
      makeDefinition(baseline, {
        shocks: [{ ...shock, shockType: "unknown" as "supply" }],
        policyInterventions: [],
      }),
    ).toThrow(/shockType/);
    expect(() =>
      makeDefinition(baseline, {
        shocks: [{ ...shock, operation: "multiply", value: "101" }],
        policyInterventions: [],
      }),
    ).toThrow(/between -100 and 100/);
    expect(() =>
      makeDefinition(baseline, {
        shocks: [],
        policyInterventions: [{ ...intervention, hypothetical: false as true }],
      }),
    ).toThrow(/hypothetical/);
    expect(() =>
      makeDefinition(baseline, {
        assumptions: [{ ...assumption, sensitivityRequired: "yes" as never }],
      }),
    ).toThrow(/must be boolean/);
    expect(() => makeDefinition(baseline, { schemaVersion: 2 as 1 })).toThrow(/schemaVersion/);
    expect(() => makeDefinition(baseline, { previousDefinitionSha256: sha("1") })).toThrow(
      /first scenario/,
    );
    expect(() =>
      makeDefinition(baseline, { definitionVersion: 2, previousDefinitionSha256: null }),
    ).toThrow(/predecessor/);
    expect(() =>
      makeDefinition(baseline, {
        conflictResolution: {
          mode: "implicit" as "reject_overlap",
          explanation: "Unsupported policy.",
        },
      }),
    ).toThrow(/not registered/);
    expect(() =>
      makeDefinition(baseline, {
        usageBoundary: { ...base.usageBoundary, notPolicyAdvice: false as true },
      }),
    ).toThrow(/cannot be weakened/);

    const previous = makeDefinition(baseline);
    expect(() =>
      reviseScenarioDefinition(
        previous,
        definitionInput(baseline, {
          definitionVersion: 2,
          previousDefinitionSha256: previous.manifestSha256,
          createdAt: "2026-01-01T23:00:00Z",
        }),
        baseline,
      ),
    ).toThrow(/backward/);

    const setDefinition = makeDefinition(baseline, {
      shocks: [{ ...shock, operation: "set", value: "77" }],
      policyInterventions: [],
    });
    expect(applyScenarioActionsAtStep(setDefinition, shock.target, 1, "100").value).toBe("77");
    expect(() =>
      assertNotObservedDatasetEligible({
        dataClass: "scenario_counterfactual_only",
        canonicalObservedDatasetEligible: true,
      } as never),
    ).toThrow(/not a recognized/);
  });
});
