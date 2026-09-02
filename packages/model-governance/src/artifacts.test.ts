import { describe, expect, it } from "vitest";
import {
  createDataManifest,
  createLabelManifest,
  createModelArtifactManifest,
  createModelCard,
  createModelInventory,
  createModelVersion,
} from "./artifacts.js";
import { createFixtureBundle, principal, sha, uuid } from "./fixtures.test-helper.js";
import { canonicalJson, digestJson } from "./internals.js";
import {
  createExperiment,
  createPeerReview,
  createReproducibilityReceipt,
  createResearchArtifact,
  evidenceOriginCanSupportEmpiricalClaim,
} from "./research.js";

describe("immutable governance artifacts", () => {
  it("creates deterministic, deeply immutable content-addressed artifacts", () => {
    const first = createFixtureBundle();
    const second = createFixtureBundle();

    expect(first.inventory.manifestSha256).toBe(second.inventory.manifestSha256);
    expect(Object.isFrozen(first.inventory)).toBe(true);
    expect(Object.isFrozen(first.inventory.assumptions)).toBe(true);
    expect(() => {
      (first.inventory.assumptions as string[])[0] = "silently changed";
    }).toThrow();
    expect(digestJson({ b: 2, a: 1 })).toBe(digestJson({ a: 1, b: 2 }));
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("rejects demo and synthetic performance represented as empirical", () => {
    const { card } = createFixtureBundle();
    const unsigned = { ...card };
    // @ts-expect-error deliberate removal for constructor input
    delete unsigned.manifestSha256;
    const metric = unsigned.metrics[0];
    if (!metric) throw new Error("fixture metric missing");

    expect(() =>
      createModelCard({
        ...unsigned,
        metrics: [
          {
            ...metric,
            evidenceOrigin: "synthetic",
            presentedAsEmpirical: true,
          },
        ],
      }),
    ).toThrow(/synthetic\/demo metrics/);
  });

  it("validates PIT chronology and label denominators", () => {
    const { dataManifest, labelManifest } = createFixtureBundle();
    const { manifestSha256: _dataDigest, ...dataInput } = dataManifest;
    const { manifestSha256: _labelDigest, ...labelInput } = labelManifest;
    const snapshot = dataInput.snapshots[0];
    const label = labelInput.labels[0];
    if (!snapshot || !label) throw new Error("fixture data missing");

    expect(() =>
      createDataManifest({
        ...dataInput,
        snapshots: [
          {
            ...snapshot,
            observedThrough: "2025-01-01T00:00:00Z",
            availableAt: "2024-01-01T00:00:00Z",
          },
        ],
      }),
    ).toThrow(/observedThrough/);
    expect(() =>
      createLabelManifest({
        ...labelInput,
        labels: [{ ...label, positiveCount: 501, totalCount: 500 }],
      }),
    ).toThrow(/label counts/);
  });

  it("requires a calibration denominator and exact artifact manifests", () => {
    const { card, artifact } = createFixtureBundle();
    const { manifestSha256: _cardDigest, ...cardInput } = card;
    const { manifestSha256: _artifactDigest, ...artifactInput } = artifact;
    expect(() => createModelCard({ ...cardInput, minimumCalibrationEventCount: 0 })).toThrow(
      /positive minimum/,
    );
    expect(() =>
      createModelArtifactManifest({ ...artifactInput, codeCommitSha256: "not-a-digest" }),
    ).toThrow(/SHA-256/);
    expect(() => createModelArtifactManifest({ ...artifactInput, randomSeeds: [42, 42] })).toThrow(
      /unique/,
    );
  });

  it("enforces bounded model inventory and version identity inputs", () => {
    const { inventory, version } = createFixtureBundle();
    const { manifestSha256: _inventoryDigest, ...inventoryInput } = inventory;
    const { manifestSha256: _versionDigest, ...versionInput } = version;
    expect(() => createModelInventory({ ...inventoryInput, validationCadenceDays: 0 })).toThrow(
      /validationCadenceDays/,
    );
    expect(() => createModelVersion({ ...versionInput, version: "latest" })).toThrow(/semantic/);
    expect(() =>
      createModelVersion({
        ...versionInput,
        developerPrincipalIds: [principal.developer, principal.developer],
      }),
    ).toThrow(/unique/);
  });
});

describe("research operations artifacts", () => {
  it("preserves negative and failed experiments as immutable records", () => {
    const base = {
      schemaVersion: 1 as const,
      modelVersionId: uuid(8),
      title: "Feature ablation",
      hypothesis: "The proposed feature materially improves the frozen holdout.",
      startedAt: "2024-12-01T00:00:00Z",
      completedAt: "2024-12-02T00:00:00Z",
      runByPrincipalId: principal.researcher,
      codeSha256: sha("a"),
      dataManifestSha256: sha("b"),
      configurationSha256: sha("c"),
      randomSeeds: [1],
      metrics: [],
      replacesExperimentId: null,
    };
    const negative = createExperiment({
      ...base,
      experimentId: uuid(300),
      status: "negative",
      findings: ["The feature did not improve the frozen holdout."],
      failureReason: null,
    });
    const failed = createExperiment({
      ...base,
      experimentId: uuid(301),
      status: "failed",
      findings: ["The run stopped before producing admissible metrics."],
      failureReason: "Numerical convergence failed.",
    });

    expect(negative.status).toBe("negative");
    expect(failed.failureReason).toMatch(/convergence/);
    expect(Object.isFrozen(negative)).toBe(true);
  });

  it("rejects incomplete experiment state and synthetic empirical experiment metrics", () => {
    const input = {
      schemaVersion: 1 as const,
      experimentId: uuid(302),
      modelVersionId: uuid(8),
      title: "Candidate run",
      hypothesis: "A candidate may improve stability.",
      status: "running" as const,
      startedAt: "2024-12-01T00:00:00Z",
      completedAt: null,
      runByPrincipalId: principal.researcher,
      codeSha256: sha("a"),
      dataManifestSha256: sha("b"),
      configurationSha256: sha("c"),
      randomSeeds: [1],
      metrics: [],
      findings: [],
      failureReason: null,
      replacesExperimentId: null,
    };
    expect(() => createExperiment({ ...input, completedAt: "2024-12-02T00:00:00Z" })).toThrow(
      /only terminal/,
    );
    expect(() =>
      createExperiment({
        ...input,
        metrics: [
          {
            metricKey: "accuracy",
            value: "0.9",
            evaluationSlice: "demo fixture",
            evidenceOrigin: "demo",
            presentedAsEmpirical: true,
            evidenceId: uuid(303),
          },
        ],
      }),
    ).toThrow(/cannot be empirical/);
  });

  it("makes deterministic reproduction receipts fail closed", () => {
    const input = {
      schemaVersion: 1 as const,
      receiptId: uuid(310),
      subjectType: "experiment" as const,
      subjectId: uuid(300),
      codeSha256: sha("a"),
      dataManifestSha256: sha("b"),
      environmentSha256: sha("c"),
      configurationSha256: sha("d"),
      commandArgv: ["node", "reproduce.js"],
      expectedOutputSha256s: [sha("e")],
      actualOutputSha256s: [sha("e")],
      deterministicTolerance: "0",
      result: "passed" as const,
      executedAt: "2024-12-03T00:00:00Z",
      executedByPrincipalId: principal.validator,
    };
    expect(createReproducibilityReceipt(input).result).toBe("passed");
    expect(() =>
      createReproducibilityReceipt({ ...input, actualOutputSha256s: [sha("f")] }),
    ).toThrow(/exact ordered output/);
    expect(() =>
      createReproducibilityReceipt({ ...input, result: "failed", actualOutputSha256s: [sha("e")] }),
    ).toThrow(/differing output/);
  });

  it("pins notebook execution provenance and requires independent peer review", () => {
    const artifact = createResearchArtifact({
      schemaVersion: 1,
      researchArtifactId: uuid(320),
      modelVersionId: uuid(8),
      kind: "notebook",
      title: "Temporal validation audit",
      authorPrincipalIds: [principal.developer],
      contentSha256: sha("a"),
      codeCommitSha256: sha("b"),
      environmentSha256: sha("c"),
      dataManifestSha256s: [sha("d")],
      executedCellOrderSha256: sha("e"),
      outputSha256: sha("f"),
      createdAt: "2024-12-03T00:00:00Z",
      limitations: ["Notebook output is evidence, not a production authorization."],
    });
    const reviewInput = {
      schemaVersion: 1 as const,
      peerReviewId: uuid(321),
      researchArtifactId: artifact.researchArtifactId,
      researchArtifactSha256: artifact.manifestSha256,
      reviewerPrincipalId: principal.validator,
      authorPrincipalIds: artifact.authorPrincipalIds,
      decision: "approved" as const,
      findings: ["Inputs and execution order reproduced."],
      reviewedAt: "2024-12-04T00:00:00Z",
    };
    expect(createPeerReview(reviewInput).decision).toBe("approved");
    expect(() =>
      createPeerReview({ ...reviewInput, reviewerPrincipalId: principal.developer }),
    ).toThrow(/independent/);
    expect(() =>
      createResearchArtifact({
        ...artifact,
        executedCellOrderSha256: null,
        manifestSha256: undefined,
      } as never),
    ).toThrow();
    expect(evidenceOriginCanSupportEmpiricalClaim("empirical_observed")).toBe(true);
    expect(evidenceOriginCanSupportEmpiricalClaim("synthetic")).toBe(false);
  });
});
