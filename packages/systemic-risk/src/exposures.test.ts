import { describe, expect, it } from "vitest";
import {
  assertExposureNetworkSnapshotIntegrity,
  createExposureNetworkSnapshot,
  summarizeCoverage,
} from "./exposures.js";
import { id, mustAt, mutable, snapshotInput } from "./fixtures.test-helper.js";

describe("exposure network snapshots", () => {
  it("creates an immutable, content-addressed point-in-time network", () => {
    const snapshot = createExposureNetworkSnapshot(snapshotInput());
    expect(snapshot.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.edges)).toBe(true);
    expect(() => assertExposureNetworkSnapshotIntegrity(snapshot)).not.toThrow();
  });

  it("canonicalizes collection order before hashing", () => {
    const original = snapshotInput();
    const reversed = {
      ...original,
      nodes: [...original.nodes].reverse(),
      edges: [...original.edges].reverse(),
    };
    expect(createExposureNetworkSnapshot(reversed).manifestSha256).toBe(
      createExposureNetworkSnapshot(original).manifestSha256,
    );
  });

  it("reports limited coverage without converting confidence into probability", () => {
    const summary = summarizeCoverage(createExposureNetworkSnapshot(snapshotInput()));
    expect(summary).toEqual({
      status: "limited",
      minimumAmountCoverageRatio: "0.8",
      incompleteExposureKinds: ["trade"],
      caveats: [
        "Complete only for the declared regulated-bank universe.",
        "One expected reporting counterparty is missing.",
      ],
    });
  });

  it("reports unknown coverage when the denominator is unavailable", () => {
    const input = mutable(snapshotInput());
    input.coverage[1] = {
      ...mustAt(input.coverage, 1),
      status: "unknown",
      amountCoverageRatio: null,
      expectedCounterparties: null,
      missingExposureTreatment: "zero_is_unknown",
    };
    expect(summarizeCoverage(createExposureNetworkSnapshot(input)).status).toBe("unknown");
  });

  it("rejects future source availability at the as-of", () => {
    const input = mutable(snapshotInput());
    mustAt(input.sources, 0).availableAt = "2025-02-02T00:00:00Z";
    expect(() => createExposureNetworkSnapshot(input)).toThrow(/unavailable.*as-of/);
  });

  it("rejects calendar-invalid instants instead of accepting Date normalization", () => {
    const input = mutable(snapshotInput());
    input.asOf = "2025-02-31T00:00:00Z";
    expect(() => createExposureNetworkSnapshot(input)).toThrow(/real instant/);
  });

  it("does not collapse point-in-time ordering below millisecond precision", () => {
    const input = mutable(snapshotInput());
    input.asOf = "2025-01-31T00:00:00.000000000Z";
    mustAt(input.sources, 0).availableAt = "2025-01-31T00:00:00.000000001Z";
    expect(() => createExposureNetworkSnapshot(input)).toThrow(/unavailable.*as-of/);
  });

  it("rejects future edge availability at the as-of", () => {
    const input = mutable(snapshotInput());
    mustAt(input.edges, 0).availableAt = "2025-02-02T00:00:00Z";
    expect(() => createExposureNetworkSnapshot(input)).toThrow(/unavailable.*as-of/);
  });

  it("does not allow an edge to predate its source snapshot", () => {
    const input = mutable(snapshotInput());
    mustAt(input.edges, 0).availableAt = "2025-01-29T00:00:00Z";
    expect(() => createExposureNetworkSnapshot(input)).toThrow(/predate its source/);
  });

  it("rejects observation chronology inversions", () => {
    const input = mutable(snapshotInput());
    mustAt(input.edges, 0).observedAt = "2025-01-31T00:00:00Z";
    mustAt(input.edges, 0).availableAt = "2025-01-30T00:00:00Z";
    expect(() => createExposureNetworkSnapshot(input)).toThrow(/availability precedes observation/);
  });

  it("rejects unknown node and source references", () => {
    const unknownNode = mutable(snapshotInput());
    mustAt(unknownNode.edges, 0).targetNodeId = id(99);
    expect(() => createExposureNetworkSnapshot(unknownNode)).toThrow(/unknown node/);

    const unknownSource = mutable(snapshotInput());
    mustAt(unknownSource.edges, 0).sourceId = id(99);
    expect(() => createExposureNetworkSnapshot(unknownSource)).toThrow(/unknown source/);
  });

  it("rejects self-loops and duplicate semantic edges", () => {
    const selfLoop = mutable(snapshotInput());
    mustAt(selfLoop.edges, 0).targetNodeId = mustAt(selfLoop.edges, 0).sourceNodeId;
    expect(() => createExposureNetworkSnapshot(selfLoop)).toThrow(/self-loop/);

    const duplicate = mutable(snapshotInput());
    duplicate.edges.push({ ...mustAt(duplicate.edges, 0), edgeId: id(29) });
    expect(() => createExposureNetworkSnapshot(duplicate)).toThrow(/duplicate/);
  });

  it("requires caveats for every non-observed measurement", () => {
    const input = mutable(snapshotInput());
    mustAt(input.edges, 1).caveat = null;
    expect(() => createExposureNetworkSnapshot(input)).toThrow(/estimates require a caveat/);
  });

  it("rejects out-of-range normalized exposure and confidence", () => {
    const exposure = mutable(snapshotInput());
    mustAt(exposure.edges, 0).normalizedExposure = "1.1";
    expect(() => createExposureNetworkSnapshot(exposure)).toThrow(/between 0 and 1/);

    const confidence = mutable(snapshotInput());
    mustAt(confidence.edges, 0).confidence = "-0.1";
    expect(() => createExposureNetworkSnapshot(confidence)).toThrow(/between 0 and 1/);
  });

  it("does not accept incomplete coverage as complete", () => {
    const wrongRatio = mutable(snapshotInput());
    mustAt(wrongRatio.coverage, 0).amountCoverageRatio = "0.9";
    expect(() => createExposureNetworkSnapshot(wrongRatio)).toThrow(/complete denominators/);

    const wrongCount = mutable(snapshotInput());
    mustAt(wrongCount.coverage, 0).observedCounterparties = 1;
    expect(() => createExposureNetworkSnapshot(wrongCount)).toThrow(/complete denominators/);
  });

  it("requires missing-exposure treatment for incomplete coverage", () => {
    const input = mutable(snapshotInput());
    mustAt(input.coverage, 1).missingExposureTreatment = "none";
    expect(() => createExposureNetworkSnapshot(input)).toThrow(
      /cannot treat missing exposure as none/,
    );
  });

  it("requires a coverage disclosure for every represented exposure kind", () => {
    const input = mutable(snapshotInput());
    input.coverage = input.coverage.slice(0, 1);
    expect(() => createExposureNetworkSnapshot(input)).toThrow(/coverage omits.*trade/);
  });

  it("rejects impossible counterparty denominators", () => {
    const input = mutable(snapshotInput());
    mustAt(input.coverage, 1).observedCounterparties = 4;
    expect(() => createExposureNetworkSnapshot(input)).toThrow(/exceed.*expected/);
  });

  it("rejects an amount ratio when coverage is unknown", () => {
    const input = mutable(snapshotInput());
    mustAt(input.coverage, 1).status = "unknown";
    expect(() => createExposureNetworkSnapshot(input)).toThrow(/unknown coverage cannot claim/);
  });

  it("rejects duplicate nodes, coverage slices, and assumptions", () => {
    const nodes = mutable(snapshotInput());
    mustAt(nodes.nodes, 1).entityKey = mustAt(nodes.nodes, 0).entityKey;
    expect(() => createExposureNetworkSnapshot(nodes)).toThrow(/duplicate/);

    const coverage = mutable(snapshotInput());
    coverage.coverage.push({ ...mustAt(coverage.coverage, 0), coverageId: id(39) });
    expect(() => createExposureNetworkSnapshot(coverage)).toThrow(/duplicate/);

    const assumptions = mutable(snapshotInput());
    assumptions.assumptions.push(mustAt(assumptions.assumptions, 0));
    expect(() => createExposureNetworkSnapshot(assumptions)).toThrow(/duplicate/);
  });

  it("detects content tampering after creation", () => {
    const snapshot = mutable(createExposureNetworkSnapshot(snapshotInput()));
    mustAt(snapshot.edges, 0).grossAmount = "999";
    expect(() => assertExposureNetworkSnapshotIntegrity(snapshot)).toThrow(/digest/);
  });

  it("rejects noncanonical identifiers and empty governance lists", () => {
    const badId = mutable(snapshotInput());
    badId.snapshotId = "NOT-A-UUID";
    expect(() => createExposureNetworkSnapshot(badId)).toThrow(/UUID/);

    const empty = mutable(snapshotInput());
    empty.prohibitedClaims = [];
    expect(() => createExposureNetworkSnapshot(empty)).toThrow(/prohibitedClaims.length/);
  });

  it("bounds decimal precision used by deterministic calculations", () => {
    const input = mutable(snapshotInput());
    mustAt(input.edges, 0).grossAmount = "1.1234567890123";
    expect(() => createExposureNetworkSnapshot(input)).toThrow(/at most 12 fractional digits/);
  });
});
