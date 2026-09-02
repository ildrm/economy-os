import { describe, expect, it } from "vitest";
import {
  baselineWorld,
  calibrationInput,
  completeFixture,
  definitionInput,
  IDS,
  planInput,
  required,
} from "./fixtures.test-helper.js";
import {
  assertCalibrationIntegrity,
  assertCheckpointIntegrity,
  assertCompletedResultIntegrity,
  createCalibrationManifest,
  createRandomStream,
  createReproducibilityReceipt,
  createSimulationRunPlan,
  createSimulationWorld,
  createSystemDefinition,
  runSimulation,
} from "./index.js";
import {
  assertDecimal,
  assertExactKeys,
  assertInteger,
  assertIsoInstant,
  assertKey,
  assertNonBlank,
  assertNonnegativeIntegerText,
  assertPlainRecord,
  assertSemver,
  assertSha256,
  assertUuid,
  canonicalDecimal,
  cloneCanonical,
  compareInstants,
  deepFreeze,
  digestJson,
  immutableWithDigest,
  uniqueBy,
} from "./internals.js";

describe("adversarial validation and numerical boundaries", () => {
  it("rejects malformed primitive contracts and non-canonical JSON", () => {
    expect(() => assertPlainRecord([], "record")).toThrow("plain record");
    expect(() => assertPlainRecord(new Date(), "record")).toThrow("plain record");
    expect(() => assertExactKeys({ a: 1 }, ["b"], "shape")).toThrow("missing or unknown");
    expect(() => assertUuid("not-a-uuid", "id")).toThrow("UUID");
    expect(() => assertSha256("ABC", "digest")).toThrow("SHA-256");
    expect(() => assertKey("9-invalid", "key")).toThrow("canonical key");
    expect(() => assertSemver("v1", "version")).toThrow("semantic version");
    expect(() => assertNonBlank(" padded ", "text")).toThrow("nonblank");
    expect(() => assertIsoInstant("2026-01-01", "instant")).toThrow("UTC instant");
    expect(() => assertIsoInstant("2026-99-99T00:00:00Z", "instant")).toThrow("real UTC");
    expect(() => assertIsoInstant("2026-02-31T00:00:00Z", "instant")).toThrow("real UTC");
    expect(
      compareInstants("2026-01-01T00:00:00.000000001Z", "2026-01-01T00:00:00Z"),
    ).toBeGreaterThan(0);
    expect(() => assertInteger(1.5, "count", 1, 2)).toThrow("integer");
    expect(() => assertDecimal("-0", "decimal")).toThrow("canonical exact decimal");
    expect(() => assertDecimal("2", "decimal", 0, 1)).toThrow("between");
    expect(() => assertDecimal("0.1234567890123", "decimal")).toThrow("canonical exact decimal");
    expect(() => assertNonnegativeIntegerText("01", "seed")).toThrow("canonical nonnegative");
    expect(() => assertNonnegativeIntegerText("18446744073709551616", "seed")).toThrow(
      "unsigned 64-bit",
    );
    expect(() => canonicalDecimal(Number.POSITIVE_INFINITY)).toThrow("finite numeric bound");
    expect(canonicalDecimal(1e-14)).toBe("0");
    expect(() => digestJson({ value: Number.NaN })).toThrow("non-finite");
    expect(() => digestJson({ value: undefined })).toThrow("not canonical JSON");
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => cloneCanonical(cyclic)).toThrow("cycle");
    expect(digestJson([null, true, "x", 2])).toMatch(/^[0-9a-f]{64}$/);
    expect(deepFreeze(2)).toBe(2);
    expect(Object.isFrozen(deepFreeze({ nested: { value: true } }).nested)).toBe(true);
    expect(() => uniqueBy(["same", "same"], (item) => item, "items")).toThrow("duplicate");
    expect(() => required(undefined)).toThrow("fixture item");
  });

  it("fails closed across definition collections and invariant contracts", () => {
    const base = definitionInput();
    expect(() => createSystemDefinition({ ...base, stateVariables: [] })).toThrow("1..64");
    expect(() =>
      createSystemDefinition({
        ...base,
        stateVariables: [required(base.stateVariables[0]), required(base.stateVariables[0])],
      }),
    ).toThrow("duplicate");
    expect(() => createSystemDefinition({ ...base, agentTypes: [] })).toThrow("1..32");
    expect(() =>
      createSystemDefinition({
        ...base,
        populations: [{ ...required(base.populations[0]), agentTypeKey: "missing-type" }],
      }),
    ).toThrow("unknown agent type");
    expect(() =>
      createSystemDefinition({
        ...base,
        transitionEquations: [required(base.transitionEquations[0])],
      }),
    ).toThrow("exactly one equation");
    expect(() =>
      createSystemDefinition({
        ...base,
        transitionEquations: [
          {
            ...required(base.transitionEquations[0]),
            influences: [
              {
                sourceStateKey: "missing-state",
                coefficient: "0.1",
                coefficientUnit: "unit/unit",
              },
            ],
          },
          required(base.transitionEquations[1]),
        ],
      }),
    ).toThrow("influence source is unknown");
    expect(() =>
      createSystemDefinition({
        ...base,
        conservationInvariants: [
          { ...required(base.conservationInvariants[0]), weightedStateKeys: [] },
        ],
      }),
    ).toThrow("requires state terms");
    expect(() =>
      createSystemDefinition({
        ...base,
        usageBoundary: { ...base.usageBoundary, researchOnly: false as true },
      }),
    ).toThrow("boundaries");
    expect(() => createSystemDefinition({ ...base, limitations: [] })).toThrow("1..32");
    expect(() => createSystemDefinition({ ...base, unknown: true } as never)).toThrow(
      "missing or unknown fields",
    );
  });

  it("rejects calibration identity, chronology, bounds, and unsupported parameter variants", () => {
    const definition = createSystemDefinition(definitionInput());
    const base = calibrationInput(definition);
    expect(() =>
      createCalibrationManifest({ ...base, systemDefinitionSha256: "e".repeat(64) }, definition),
    ).toThrow("exact system definition");
    expect(() =>
      createCalibrationManifest(
        { ...base, trainingDataCutoff: "2026-01-01T00:00:01Z" },
        definition,
      ),
    ).toThrow("trainingDataCutoff");
    expect(() =>
      createCalibrationManifest(
        {
          ...base,
          observedEvidence: [
            {
              ...required(base.observedEvidence[0]),
              availableAt: "2025-10-01T00:00:00Z",
            },
          ],
        },
        definition,
      ),
    ).toThrow("before observation");
    expect(() =>
      createCalibrationManifest(
        {
          ...base,
          observedEvidence: [
            {
              ...required(base.observedEvidence[0]),
              reviewedAt: "2025-10-01T00:00:00Z",
            },
          ],
        },
        definition,
      ),
    ).toThrow("reviewed before");
    expect(() =>
      createCalibrationManifest(
        {
          ...base,
          parameterValues: [
            { ...required(base.parameterValues[0]), value: "2" },
            required(base.parameterValues[1]),
          ],
        },
        definition,
      ),
    ).toThrow("violates its declared contract");
    expect(() =>
      createCalibrationManifest(
        {
          ...base,
          parameterValues: [
            {
              ...required(base.parameterValues[0]),
              uncertainty: { kind: "uniform", lower: "0.1", upper: "0.2" },
            },
            required(base.parameterValues[1]),
          ],
        },
        definition,
      ),
    ).toThrow("must contain value");
    expect(() =>
      createCalibrationManifest(
        { ...base, parameterValues: [required(base.parameterValues[0])] },
        definition,
      ),
    ).toThrow("cover every");
    const calibration = createCalibrationManifest(base, definition);
    expect(() =>
      assertCalibrationIntegrity({ ...calibration, codeSha256: "e".repeat(64) }, definition),
    ).toThrow("digest does not match");
  });

  it("rejects invalid world chronology, identities, populations, values, and actions", () => {
    const definition = createSystemDefinition(definitionInput());
    const baseline = baselineWorld(definition);
    const { manifestSha256: _baselineDigest, ...baselineBody } = baseline;
    expect(() =>
      createSimulationWorld(
        {
          ...baselineBody,
          worldId: IDS.scenario,
          worldKind: "scenario_counterfactual",
          canonicalDatasetEligible: false,
          baselineWorldId: IDS.world,
          scenarioAuthoredBy: IDS.author,
          notObservedFact: true,
          interventions: [],
          shocks: [
            {
              shockKey: "bad-population",
              populationKey: "missing",
              stateKey: "wealth",
              atStep: 0,
              additiveDelta: "1",
              rationale: "Invalid population fixture.",
            },
          ],
        } as never,
        definition,
      ),
    ).toThrow("unknown population");
    expect(() =>
      createSimulationWorld(
        {
          ...baselineBody,
          createdAt: "2025-12-31T00:00:00Z",
        } as never,
        definition,
      ),
    ).toThrow("cannot follow");
  });

  it("rejects invalid run bounds and exercises clamping diagnostics", () => {
    const fixture = completeFixture();
    const base = planInput(fixture.definition, fixture.calibration, fixture.world);
    expect(() =>
      createSimulationRunPlan(
        { ...base, outputStateKeys: ["missing"] },
        fixture.definition,
        fixture.calibration,
        fixture.world,
      ),
    ).toThrow("unknown state");
    expect(() =>
      createSimulationRunPlan(
        { ...base, numericalTolerance: "0" },
        fixture.definition,
        fixture.calibration,
        fixture.world,
      ),
    ).toThrow("must be positive");
    expect(() =>
      createSimulationRunPlan(
        { ...base, resourceBudget: { ...base.resourceBudget, maxOutputCells: 1 } },
        fixture.definition,
        fixture.calibration,
        fixture.world,
      ),
    ).toThrow("maxOutputCells");
    const actionWorld = createSimulationWorld(
      {
        schemaVersion: 1,
        worldId: IDS.scenario,
        systemId: fixture.definition.systemId,
        systemVersion: fixture.definition.systemVersion,
        systemDefinitionSha256: fixture.definition.manifestSha256,
        asOf: "2026-01-01T00:00:00Z",
        createdAt: "2026-01-02T00:00:00Z",
        label: "Clamping scenario",
        worldKind: "scenario_counterfactual",
        canonicalDatasetEligible: false,
        inputDatasetSnapshotSha256: "d".repeat(64),
        baselineWorldId: IDS.world,
        scenarioAuthoredBy: IDS.author,
        notObservedFact: true,
        interventions: [],
        shocks: [
          {
            shockKey: "large-shock",
            populationKey: "*",
            stateKey: "wealth",
            atStep: 0,
            additiveDelta: "1000",
            rationale: "Exercises declared range clamping.",
          },
        ],
      },
      fixture.definition,
    );
    const clampPlan = createSimulationRunPlan(
      planInput(fixture.definition, fixture.calibration, actionWorld),
      fixture.definition,
      fixture.calibration,
      actionWorld,
    );
    const result = runSimulation(clampPlan, fixture.definition, fixture.calibration, actionWorld);
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.diagnostics.range.clampingActivations).toBeGreaterThan(0);
      expect(Number(result.diagnostics.range.maxPreClampExcess)).toBeGreaterThan(0);
    }
  });

  it("detects invalid completed results and receipt comparison boundaries", () => {
    const fixture = completeFixture();
    const result = runSimulation(
      fixture.plan,
      fixture.definition,
      fixture.calibration,
      fixture.world,
    );
    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;
    expect(() => assertCompletedResultIntegrity({ ...result, completedMembers: 0 })).toThrow();
    const { manifestSha256: _resultDigest, ...resultBody } = result;
    const invalidCount = immutableWithDigest({
      ...resultBody,
      distributions: [
        { ...required(result.distributions[0]), sampleCount: result.completedMembers + 1 },
        ...result.distributions.slice(1),
      ],
    });
    expect(() => assertCompletedResultIntegrity(invalidCount)).toThrow(/sampleCount/);
    const reversedQuantiles = immutableWithDigest({
      ...resultBody,
      distributions: [
        {
          ...required(result.distributions[0]),
          quantiles: {
            ...required(result.distributions[0]).quantiles,
            p05: required(result.distributions[0]).maximum,
          },
        },
        ...result.distributions.slice(1),
      ],
    });
    expect(() => assertCompletedResultIntegrity(reversedQuantiles)).toThrow(/not ordered/);
    const weakenedNumerics = immutableWithDigest({
      ...resultBody,
      diagnostics: {
        ...result.diagnostics,
        numerical: { ...result.diagnostics.numerical, allFinite: false as true },
      },
    });
    expect(() => assertCompletedResultIntegrity(weakenedNumerics)).toThrow(/numerical safety/);
    const incompleteLimitations = immutableWithDigest({
      ...resultBody,
      limitations: result.limitations.slice(1),
    });
    expect(() => assertCompletedResultIntegrity(incompleteLimitations)).toThrow(
      /limitations are incomplete/,
    );
    const inconsistentInputUncertainty = immutableWithDigest({
      ...resultBody,
      uncertainty: {
        ...result.uncertainty,
        input: { ...result.uncertainty.input, status: "sampled" as const, sampledInputKeys: [] },
      },
    });
    expect(() => assertCompletedResultIntegrity(inconsistentInputUncertainty)).toThrow(
      /input uncertainty status/,
    );
    const changedDistribution = {
      ...required(result.distributions[0]),
      mean: canonicalDecimal(Number(required(result.distributions[0]).mean) + 0.0000000005),
    };
    const { manifestSha256: _digest, ...body } = result;
    const close = immutableWithDigest({
      ...body,
      distributions: [changedDistribution, ...result.distributions.slice(1)],
    });
    const receipt = createReproducibilityReceipt({
      schemaVersion: 1,
      receiptId: IDS.receipt,
      comparedAt: "2026-01-04T00:00:00Z",
      first: result,
      second: close,
      tolerance: "0.000000001",
    });
    expect(receipt.status).toBe("within_tolerance");
    expect(receipt.exactContentMatch).toBe(false);
    const differentUnit = immutableWithDigest({
      ...body,
      distributions: [
        { ...required(result.distributions[0]), unit: "incompatible-unit" },
        ...result.distributions.slice(1),
      ],
    });
    expect(
      createReproducibilityReceipt({
        schemaVersion: 1,
        receiptId: IDS.receipt,
        comparedAt: "2026-01-04T00:00:00Z",
        first: result,
        second: differentUnit,
        tolerance: "0.000000001",
      }).status,
    ).toBe("mismatch");
    expect(() =>
      createReproducibilityReceipt({
        schemaVersion: 1,
        receiptId: IDS.receipt,
        comparedAt: "2026-01-04T00:00:00Z",
        first: result,
        second: immutableWithDigest({ ...body, replayIdentitySha256: "e".repeat(64) }),
        tolerance: "0.000000001",
      }),
    ).toThrow("same replay identity");
  });

  it("rejects malformed random partitions and validates fixed-range draws", () => {
    expect(() => createRandomStream("1", [])).toThrow("1..16");
    expect(() => createRandomStream("1", ["Bad Partition"])).toThrow("canonical key");
    expect(createRandomStream("1", ["fixed.range"]).uniform(2, 2)).toBe(2);
  });

  it("rejects checkpoint count and ordering corruption after content re-addressing", () => {
    const fixture = completeFixture();
    const cancelled = runSimulation(
      fixture.plan,
      fixture.definition,
      fixture.calibration,
      fixture.world,
      { isCancellationRequested: () => true },
    );
    expect(cancelled.status).toBe("cancelled");
    if (cancelled.status !== "cancelled") return;
    const { manifestSha256: _digest, ...checkpointBody } = cancelled.checkpoint;
    expect(() =>
      assertCheckpointIntegrity(
        immutableWithDigest({ ...checkpointBody, nextMemberIndex: 1 }),
        fixture.plan,
      ),
    ).toThrow("member count");
  });
});
