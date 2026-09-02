import { describe, expect, it } from "vitest";
import {
  baselineWorld,
  calibrationInput,
  completeFixture,
  definitionInput,
  IDS,
  planInput,
  scenarioWorld,
} from "./fixtures.test-helper.js";
import {
  assertCheckpointIntegrity,
  assertCompletedResultIntegrity,
  createCalibrationManifest,
  createRandomStream,
  createReproducibilityReceipt,
  createSimulationRunPlan,
  createSystemDefinition,
  runSimulation,
} from "./index.js";

describe("deterministic bounded simulation runtime", () => {
  it("partitions stable random streams without order coupling", () => {
    const first = createRandomStream("42", ["run.fixture", "member.0", "parameter.bias"]);
    const replay = createRandomStream("42", ["run.fixture", "member.0", "parameter.bias"]);
    const other = createRandomStream("42", ["run.fixture", "member.1", "parameter.bias"]);
    expect([first.nextUnitInterval(), first.nextUnitInterval()]).toEqual([
      replay.nextUnitInterval(),
      replay.nextUnitInterval(),
    ]);
    expect(other.identity.streamSha256).not.toBe(first.identity.streamSha256);
    expect(() => createRandomStream("-1", ["run.fixture"])).toThrow("nonnegative integer");
    expect(() => first.uniform(2, 1)).toThrow("finite and ordered");
  });

  it("executes the built-in stock-flow kernel and returns exact-string ensemble summaries", () => {
    const fixture = completeFixture();
    const result = runSimulation(
      fixture.plan,
      fixture.definition,
      fixture.calibration,
      fixture.world,
    );
    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;
    expect(result.completedMembers).toBe(16);
    expect(result.distributions).toHaveLength(2);
    expect(result.distributions[0]?.quantiles.method).toBe("linear_order_statistic_v1");
    expect(
      result.distributions.every((item) => /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(item.mean)),
    ).toBe(true);
    expect(result.diagnostics).toMatchObject({
      range: { passed: true },
      conservation: [{ invariantKey: "total-balance", passed: true }],
      stability: { locallyContractiveWithinTolerance: true },
      numerical: { allFinite: true },
    });
    expect(result.uncertainty).toMatchObject({
      parameter: { status: "sampled", sampledParameterKeys: ["bias"] },
      model: { status: "not_quantified" },
      input: { status: "not_declared" },
      monteCarlo: { ensembleSize: 16 },
      structural: { status: "sensitivity_only", assumptionKeys: ["friction-form"] },
    });
    expect(result.limitations.join(" ")).toContain("not policy advice");
    assertCompletedResultIntegrity(result);
  });

  it("replays byte-identically for the same plan and emits an exact reproducibility receipt", () => {
    const fixture = completeFixture();
    const first = runSimulation(
      fixture.plan,
      fixture.definition,
      fixture.calibration,
      fixture.world,
    );
    const second = runSimulation(
      fixture.plan,
      fixture.definition,
      fixture.calibration,
      fixture.world,
    );
    expect(first.status).toBe("completed");
    expect(second.status).toBe("completed");
    if (first.status !== "completed" || second.status !== "completed") return;
    expect(first.manifestSha256).toBe(second.manifestSha256);
    const receipt = createReproducibilityReceipt({
      schemaVersion: 1,
      receiptId: IDS.receipt,
      comparedAt: "2026-01-04T00:00:00Z",
      first,
      second,
      tolerance: "0.000000001",
    });
    expect(receipt).toMatchObject({
      exactContentMatch: true,
      numericWithinTolerance: true,
      maxAbsoluteDifference: "0",
      status: "exact_match",
    });
  });

  it("cancels at a deterministic boundary, checkpoints complete members, and resumes exactly", () => {
    const fixture = completeFixture();
    let checks = 0;
    const cancelled = runSimulation(
      fixture.plan,
      fixture.definition,
      fixture.calibration,
      fixture.world,
      {
        isCancellationRequested: () => {
          checks += 1;
          return checks > 24;
        },
      },
    );
    expect(cancelled.status).toBe("cancelled");
    if (cancelled.status !== "cancelled") return;
    expect(cancelled.completedMembers).toBe(1);
    assertCheckpointIntegrity(cancelled.checkpoint, fixture.plan);
    const resumed = runSimulation(
      fixture.plan,
      fixture.definition,
      fixture.calibration,
      fixture.world,
      { checkpoint: cancelled.checkpoint },
    );
    const fresh = runSimulation(
      fixture.plan,
      fixture.definition,
      fixture.calibration,
      fixture.world,
    );
    expect(resumed.status).toBe("completed");
    expect(fresh.status).toBe("completed");
    if (resumed.status === "completed" && fresh.status === "completed") {
      expect(resumed.manifestSha256).toBe(fresh.manifestSha256);
    }
  });

  it("emits stable periodic checkpoints and rejects a checkpoint from another replay", () => {
    const fixture = completeFixture();
    const checkpoints: string[] = [];
    const result = runSimulation(
      fixture.plan,
      fixture.definition,
      fixture.calibration,
      fixture.world,
      {
        onCheckpoint: (checkpoint) => checkpoints.push(checkpoint.manifestSha256),
      },
    );
    expect(result.status).toBe("completed");
    expect(checkpoints).toHaveLength(3);
    let calls = 0;
    const cancelled = runSimulation(
      fixture.plan,
      fixture.definition,
      fixture.calibration,
      fixture.world,
      {
        isCancellationRequested: () => {
          calls += 1;
          return calls === 1;
        },
      },
    );
    expect(cancelled.status).toBe("cancelled");
    if (cancelled.status !== "cancelled") return;
    expect(() =>
      assertCheckpointIntegrity(
        { ...cancelled.checkpoint, replayIdentitySha256: "f".repeat(64) },
        fixture.plan,
      ),
    ).toThrow();
  });

  it("executes explicit shocks/interventions while retaining scenario limitations", () => {
    const definition = createSystemDefinition(definitionInput());
    const calibration = createCalibrationManifest(calibrationInput(definition), definition);
    const world = scenarioWorld(definition);
    const plan = createSimulationRunPlan(
      planInput(definition, calibration, world),
      definition,
      calibration,
      world,
    );
    const result = runSimulation(plan, definition, calibration, world);
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.worldSha256).toBe(world.manifestSha256);
      expect(result.limitations.join(" ")).toContain("not forecasts");
    }
  });

  it("samples declared input uncertainty separately from parameter and structural uncertainty", () => {
    const definition = createSystemDefinition(definitionInput());
    const calibration = createCalibrationManifest(calibrationInput(definition), definition);
    const world = baselineWorld(definition);
    const base = planInput(definition, calibration, world);
    const plan = createSimulationRunPlan(
      {
        ...base,
        inputUncertainty: [
          {
            uncertaintyKey: "wealth-measurement",
            populationKey: "households",
            stateKey: "wealth",
            kind: "uniform",
            lower: "59",
            upper: "61",
            measurementRationale: "Declared measurement interval in the test fixture.",
          },
        ],
      },
      definition,
      calibration,
      world,
    );
    const result = runSimulation(plan, definition, calibration, world);
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.uncertainty.input).toEqual({
        status: "sampled",
        sampledInputKeys: ["wealth-measurement"],
      });
      expect(result.diagnostics.conservation[0]?.passed).toBe(false);
    }
  });

  it("fails closed on missing sensitivity, excess work, future calibration, and bad run references", () => {
    const definition = createSystemDefinition(definitionInput());
    const calibration = createCalibrationManifest(calibrationInput(definition), definition);
    const world = baselineWorld(definition);
    const base = planInput(definition, calibration, world);
    expect(() =>
      createSimulationRunPlan(
        { ...base, sensitivityParameterKeys: [] },
        definition,
        calibration,
        world,
      ),
    ).toThrow("structurally assumed parameter");
    expect(() =>
      createSimulationRunPlan(
        { ...base, resourceBudget: { ...base.resourceBudget, maxStateUpdates: 10 } },
        definition,
        calibration,
        world,
      ),
    ).toThrow("exceeds maxStateUpdates");
    expect(() =>
      createSimulationRunPlan(
        { ...base, worldSha256: "f".repeat(64) },
        definition,
        calibration,
        world,
      ),
    ).toThrow("bind exact");
    const futureCalibration = createCalibrationManifest(
      {
        ...calibrationInput(definition),
        calibratedAsOf: "2026-01-02T12:00:00Z",
        createdAt: "2026-01-03T00:00:00Z",
      },
      definition,
    );
    expect(() =>
      createSimulationRunPlan(
        {
          ...base,
          calibrationManifestSha256: futureCalibration.manifestSha256,
          createdAt: "2026-01-04T00:00:00Z",
        },
        definition,
        futureCalibration,
        world,
      ),
    ).toThrow("after world.asOf");
  });
});
