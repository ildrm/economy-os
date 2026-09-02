import { describe, expect, it } from "vitest";
import {
  assertConcentrationReproducibility,
  assertConcentrationResultIntegrity,
  assertContagionPathReportIntegrity,
  assertContagionPathReproducibility,
  assertStressPropagationReproducibility,
  assertStressPropagationResultIntegrity,
  assertStressSensitivityResultIntegrity,
  type ConcentrationResult,
  type ContagionPathReport,
  calculateExposureConcentration,
  nodeLabel,
  propagateScenarioStress,
  runStressSensitivity,
  type StressPropagationInput,
  type StressPropagationResult,
  type StressSensitivityResult,
  traceContagionPaths,
} from "./analysis.js";
import { createExposureNetworkSnapshot } from "./exposures.js";
import {
  A,
  id,
  mustAt,
  mutable,
  rules,
  snapshotInput,
  stressInput,
} from "./fixtures.test-helper.js";
import { digestJson } from "./internals.js";

function fixtureRun(
  snapshotSha256: string,
  runSuffix = 40,
  coefficientScale = 1,
): StressPropagationInput {
  return { ...stressInput(runSuffix, coefficientScale), snapshotSha256 };
}

function resign<T extends { manifestSha256: string }>(artifact: T): T {
  const { manifestSha256: _manifestSha256, ...body } = artifact;
  artifact.manifestSha256 = digestJson(body);
  return artifact;
}

describe("bounded scenario stress propagation", () => {
  it("propagates stress deterministically while keeping probability absent", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    const input = fixtureRun(snapshot.manifestSha256);
    const result = propagateScenarioStress(snapshot, input, "2025-02-01T01:01:00Z");

    expect(result).toMatchObject({
      outputSemantics: "scenario_stress_index",
      combinedProbability: null,
      converged: true,
      roundsExecuted: 3,
      coverageStatus: "limited",
    });
    expect(result.nodeResults).toEqual([
      {
        nodeId: id(10),
        entityKey: "country.alpha",
        exogenousStress: "0.5",
        propagatedStress: "0",
        totalStress: "0.5",
      },
      {
        nodeId: id(11),
        entityKey: "country.beta",
        exogenousStress: "0",
        propagatedStress: "0.1",
        totalStress: "0.1",
      },
      {
        nodeId: id(12),
        entityKey: "sector.gamma-energy",
        exogenousStress: "0",
        propagatedStress: "0.05152",
        totalStress: "0.05152",
      },
    ]);
    expect(() => assertStressPropagationResultIntegrity(result)).not.toThrow();
    expect(() => assertStressPropagationReproducibility(snapshot, result)).not.toThrow();
    expect(result.scenarioInputSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(propagateScenarioStress(snapshot, input, "2025-02-01T01:01:00Z").manifestSha256).toBe(
      result.manifestSha256,
    );
  });

  it("combines multiple explicit shocks without summing beyond one", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    const input = mutable(fixtureRun(snapshot.manifestSha256));
    input.shocks.push({
      ...mustAt(input.shocks, 0),
      shockId: id(42),
      channel: "liquidity",
      severity: "0.8",
    });
    const result = propagateScenarioStress(snapshot, input, "2025-02-01T01:01:00Z");
    expect(result.nodeResults.find((node) => node.nodeId === id(10))?.exogenousStress).toBe("0.9");
  });

  it("fails closed when the run does not pin the exact network", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    expect(() => propagateScenarioStress(snapshot, fixtureRun(A), "2025-02-01T01:01:00Z")).toThrow(
      /pin.*snapshot/,
    );
  });

  it("rejects unknown shock nodes and duplicate shocks", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    const unknown = mutable(fixtureRun(snapshot.manifestSha256));
    mustAt(unknown.shocks, 0).nodeId = id(99);
    expect(() => propagateScenarioStress(snapshot, unknown, "2025-02-01T01:01:00Z")).toThrow(
      /unknown node/,
    );

    const duplicate = mutable(fixtureRun(snapshot.manifestSha256));
    duplicate.shocks.push({ ...mustAt(duplicate.shocks, 0) });
    expect(() => propagateScenarioStress(snapshot, duplicate, "2025-02-01T01:01:00Z")).toThrow(
      /duplicate/,
    );
  });

  it("requires a transmission rule for every represented exposure kind", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    const input = mutable(fixtureRun(snapshot.manifestSha256));
    input.transmissionRules = input.transmissionRules.slice(0, 1);
    expect(() => propagateScenarioStress(snapshot, input, "2025-02-01T01:01:00Z")).toThrow(
      /omit exposure kind trade/,
    );
  });

  it("rejects probability semantics and chronology inversions", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    const semantic = mutable(fixtureRun(snapshot.manifestSha256)) as unknown as Record<
      string,
      unknown
    >;
    semantic.outputSemantics = "probability";
    expect(() =>
      propagateScenarioStress(
        snapshot,
        semantic as unknown as StressPropagationInput,
        "2025-02-01T01:01:00Z",
      ),
    ).toThrow(/scenario_stress_index/);

    const early = mutable(fixtureRun(snapshot.manifestSha256));
    early.issuedAt = "2025-01-01T00:00:00Z";
    expect(() => propagateScenarioStress(snapshot, early, "2025-02-01T01:01:00Z")).toThrow(
      /cannot precede.*as-of/,
    );
    expect(() =>
      propagateScenarioStress(
        snapshot,
        fixtureRun(snapshot.manifestSha256),
        "2025-01-31T00:00:00Z",
      ),
    ).toThrow(/completedAt cannot precede/);
  });

  it("respects bounded rounds and reports non-convergence", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    const input = mutable(fixtureRun(snapshot.manifestSha256));
    input.maximumRounds = 1;
    input.convergenceTolerance = "0";
    const result = propagateScenarioStress(snapshot, input, "2025-02-01T01:01:00Z");
    expect(result).toMatchObject({ converged: false, roundsExecuted: 1 });
  });

  it("detects altered result content", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    const result = mutable(
      propagateScenarioStress(
        snapshot,
        fixtureRun(snapshot.manifestSha256),
        "2025-02-01T01:01:00Z",
      ),
    );
    mustAt(result.nodeResults, 0).totalStress = "0.99";
    expect(() => assertStressPropagationResultIntegrity(result)).toThrow(/digest/);
  });
});

describe("network concentration and contagion paths", () => {
  it("calculates currency-specific counterparty concentration", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    const result = calculateExposureConcentration(snapshot, id(10), "outgoing", "usd");
    expect(result).toMatchObject({
      grossAmount: "140",
      counterpartyCount: 2,
      hhi: "0.591836734694",
      largestCounterpartyShare: "0.714285714286",
      outputSemantics: "exposure_concentration_index",
      coverageStatus: "limited",
    });
    expect(result.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(() => assertConcentrationResultIntegrity(result)).not.toThrow();
    expect(() => assertConcentrationReproducibility(snapshot, result)).not.toThrow();
  });

  it("returns explicit absence when no edge exists in the selected currency", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    expect(calculateExposureConcentration(snapshot, id(10), "incoming", "eur")).toMatchObject({
      grossAmount: "0",
      counterpartyCount: 0,
      hhi: null,
      largestCounterpartyShare: null,
    });
  });

  it("keeps zero-valued reported counterparties valid while concentration remains undefined", () => {
    const input = mutable(snapshotInput());
    mustAt(input.edges, 0).grossAmount = "0";
    mustAt(input.edges, 2).grossAmount = "0";
    const snapshot = createExposureNetworkSnapshot(input);
    const result = calculateExposureConcentration(snapshot, id(10), "outgoing", "usd");
    expect(result).toMatchObject({
      grossAmount: "0",
      counterpartyCount: 2,
      hhi: null,
      largestCounterpartyShare: null,
    });
    expect(() => assertConcentrationResultIntegrity(result)).not.toThrow();
    expect(() => assertConcentrationReproducibility(snapshot, result)).not.toThrow();
  });

  it("keeps large and fractional concentration arithmetic exact", () => {
    const input = mutable(snapshotInput());
    mustAt(input.edges, 0).grossAmount = "900719925474099.3";
    mustAt(input.edges, 2).grossAmount = "300239975158033.1";
    const snapshot = createExposureNetworkSnapshot(input);
    const result = calculateExposureConcentration(snapshot, id(10), "outgoing", "usd");
    expect(result.grossAmount).toBe("1200959900632132.4");
    expect(result.largestCounterpartyShare).toBe("0.75");
    expect(result.hhi).toBe("0.625");
  });

  it("rejects unknown concentration nodes and invalid directions", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    expect(() => calculateExposureConcentration(snapshot, id(99), "incoming", "usd")).toThrow(
      /unknown/,
    );
    expect(() =>
      calculateExposureConcentration(snapshot, id(10), "sideways" as "incoming", "usd"),
    ).toThrow(/direction/);
  });

  it("orders direct and indirect contagion paths by scenario strength", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    const report = traceContagionPaths(snapshot, id(10), id(12), rules());
    expect(report.outputSemantics).toBe("scenario_transmission_path_strength");
    expect(report.paths).toEqual([
      { nodeIds: [id(10), id(12)], edgeIds: [id(22)], pathStrength: "0.08" },
      { nodeIds: [id(10), id(11), id(12)], edgeIds: [id(20), id(21)], pathStrength: "0.024" },
    ]);
    expect(report.pathInputSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(() => assertContagionPathReportIntegrity(report)).not.toThrow();
    expect(() => assertContagionPathReproducibility(snapshot, report)).not.toThrow();
  });

  it("returns no path rather than fabricating connectivity", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    expect(traceContagionPaths(snapshot, id(12), id(10), rules()).paths).toEqual([]);
  });

  it("rejects identical, unknown, and overlong path requests", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    expect(() => traceContagionPaths(snapshot, id(10), id(10), rules())).toThrow(/must differ/);
    expect(() => traceContagionPaths(snapshot, id(10), id(99), rules())).toThrow(/unknown/);
    expect(() => traceContagionPaths(snapshot, id(10), id(12), rules(), 9)).toThrow(/1 through 8/);
  });

  it("requires complete transmission rules for path analysis", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    expect(() => traceContagionPaths(snapshot, id(10), id(12), rules().slice(0, 1))).toThrow(
      /omit exposure kind trade/,
    );
  });

  it("fails closed when path exploration exceeds its explicit state budget", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    expect(() => traceContagionPaths(snapshot, id(10), id(12), rules(), 4, 25, 1)).toThrow(
      /maximum state budget/,
    );
  });

  it("resolves a node only from the pinned snapshot", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    expect(nodeLabel(snapshot, id(11)).entityKey).toBe("country.beta");
    expect(() => nodeLabel(snapshot, id(99))).toThrow(/unknown/);
  });
});

describe("bounded missing-exposure sensitivity", () => {
  it("runs ordered low, base, and high variants with separate receipts", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    const low = mutable(fixtureRun(snapshot.manifestSha256, 50, 0.5));
    const base = mutable(fixtureRun(snapshot.manifestSha256, 51, 1));
    const high = mutable(fixtureRun(snapshot.manifestSha256, 52, 1.5));
    low.missingExposureMultiplier = "0.5";
    high.missingExposureMultiplier = "1.5";
    const result = runStressSensitivity(snapshot, { low, base, high }, "2025-02-01T01:01:00Z");
    expect(result.combinedProbability).toBeNull();
    expect(result.outputSemantics).toBe("scenario_sensitivity_range");
    expect(result.lowRunSha256).not.toBe(result.baseRunSha256);
    const gamma = result.nodeRanges.find((node) => node.nodeId === id(12));
    expect(Number(gamma?.lowStress)).toBeLessThan(Number(gamma?.baseStress));
    expect(Number(gamma?.baseStress)).toBeLessThan(Number(gamma?.highStress));
    expect(() => assertStressSensitivityResultIntegrity(result)).not.toThrow();
  });

  it("rejects unordered transmission coefficients", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    const low = fixtureRun(snapshot.manifestSha256, 50, 1.5);
    const base = fixtureRun(snapshot.manifestSha256, 51, 1);
    const high = fixtureRun(snapshot.manifestSha256, 52, 0.5);
    expect(() =>
      runStressSensitivity(snapshot, { low, base, high }, "2025-02-01T01:01:00Z"),
    ).toThrow(/complete and ordered/);
  });

  it("rejects unordered missing-exposure multipliers", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    const low = mutable(fixtureRun(snapshot.manifestSha256, 50));
    const base = mutable(fixtureRun(snapshot.manifestSha256, 51));
    const high = mutable(fixtureRun(snapshot.manifestSha256, 52));
    low.missingExposureMultiplier = "2";
    expect(() =>
      runStressSensitivity(snapshot, { low, base, high }, "2025-02-01T01:01:00Z"),
    ).toThrow(/multipliers must be ordered/);
  });

  it("does not let a sensitivity variant change the underlying shock", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    const low = mutable(fixtureRun(snapshot.manifestSha256, 50, 0.5));
    const base = mutable(fixtureRun(snapshot.manifestSha256, 51, 1));
    const high = mutable(fixtureRun(snapshot.manifestSha256, 52, 1.5));
    mustAt(high.shocks, 0).severity = "0.7";
    expect(() =>
      runStressSensitivity(snapshot, { low, base, high }, "2025-02-01T01:01:00Z"),
    ).toThrow(/may change only transmission/);
  });

  it("requires unique run identities for sensitivity variants", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    const low = fixtureRun(snapshot.manifestSha256, 50, 0.5);
    const base = fixtureRun(snapshot.manifestSha256, 50, 1);
    const high = fixtureRun(snapshot.manifestSha256, 52, 1.5);
    expect(() =>
      runStressSensitivity(snapshot, { low, base, high }, "2025-02-01T01:01:00Z"),
    ).toThrow(/distinct run identifiers/);
  });
});

describe("artifact integrity rejects re-signed semantic corruption", () => {
  it("rejects probability semantics and a detached scenario-input receipt", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    const original = propagateScenarioStress(
      snapshot,
      fixtureRun(snapshot.manifestSha256),
      "2025-02-01T01:01:00Z",
    );
    const semantic = mutable(original) as unknown as Record<string, unknown> & {
      manifestSha256: string;
    };
    semantic.combinedProbability = "0.2";
    resign(semantic);
    expect(() =>
      assertStressPropagationResultIntegrity(semantic as unknown as StressPropagationResult),
    ).toThrow(/cannot claim.*probability/);

    const receipt = mutable(original);
    receipt.scenarioInputSha256 = A;
    resign(receipt);
    expect(() => assertStressPropagationResultIntegrity(receipt)).toThrow(/scenario input digest/);
  });

  it("rejects inconsistent stress components and dangling edge transmissions", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    const original = propagateScenarioStress(
      snapshot,
      fixtureRun(snapshot.manifestSha256),
      "2025-02-01T01:01:00Z",
    );
    const components = mutable(original);
    mustAt(components.nodeResults, 1).propagatedStress = "0.2";
    resign(components);
    expect(() => assertStressPropagationResultIntegrity(components)).toThrow(/components/);

    const dangling = mutable(original);
    mustAt(dangling.edgeTransmissions, 0).sourceNodeId = id(99);
    resign(dangling);
    expect(() => assertStressPropagationResultIntegrity(dangling)).toThrow(/unknown result node/);
  });

  it("rejects inconsistent concentration absence semantics", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    const result = mutable(calculateExposureConcentration(snapshot, id(10), "incoming", "eur"));
    result.hhi = "0.5";
    resign(result);
    expect(() => assertConcentrationResultIntegrity(result as ConcentrationResult)).toThrow(
      /absence semantics/,
    );
  });

  it("rejects detached path inputs and malformed path topology", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    const original = traceContagionPaths(snapshot, id(10), id(12), rules());
    const receipt = mutable(original);
    receipt.maximumPaths = 26;
    resign(receipt);
    expect(() => assertContagionPathReportIntegrity(receipt as ContagionPathReport)).toThrow(
      /input digest/,
    );

    const topology = mutable(original);
    mustAt(topology.paths, 0).edgeIds = [];
    resign(topology);
    expect(() => assertContagionPathReportIntegrity(topology as ContagionPathReport)).toThrow(
      /invalid topology/,
    );
  });

  it("rejects detached sensitivity run pointers and altered ranges", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    const original = runStressSensitivity(
      snapshot,
      {
        low: fixtureRun(snapshot.manifestSha256, 50, 0.5),
        base: fixtureRun(snapshot.manifestSha256, 51, 1),
        high: fixtureRun(snapshot.manifestSha256, 52, 1.5),
      },
      "2025-02-01T01:01:00Z",
    );
    const pointer = mutable(original);
    pointer.lowRunSha256 = A;
    resign(pointer);
    expect(() =>
      assertStressSensitivityResultIntegrity(pointer as StressSensitivityResult),
    ).toThrow(/digest pointer/);

    const range = mutable(original);
    mustAt(range.nodeRanges, 0).lowStress = "0.4";
    resign(range);
    expect(() => assertStressSensitivityResultIntegrity(range as StressSensitivityResult)).toThrow(
      /does not match/,
    );
  });
});
