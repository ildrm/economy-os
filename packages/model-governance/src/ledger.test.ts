import { describe, expect, it } from "vitest";
import {
  approval,
  createFixtureBundle,
  createGovernedFixture,
  metadataFactory,
  principal,
  sha,
  uuid,
} from "./fixtures.test-helper.js";
import { createApproval } from "./governance.js";
import { type ForecastRecordInput, type GovernanceEvent, ModelGovernanceLedger } from "./ledger.js";
import { createExperiment, createPeerReview, createResearchArtifact } from "./research.js";

function forecastInput(fixture: ReturnType<typeof createGovernedFixture>): ForecastRecordInput {
  return {
    schemaVersion: 1,
    forecastId: uuid(500),
    modelVersionId: fixture.version.modelVersionId,
    modelVersionSha256: fixture.version.manifestSha256,
    modelArtifactSha256: fixture.artifact.manifestSha256,
    dataSnapshotSha256: fixture.dataManifest.featureSnapshotSha256,
    claimKind: "calibrated_probability",
    outputSemantics: "Probability of frozen distress onset in the next twelve months.",
    outputValue: "0.2",
    predictionAsOf: "2024-11-15T00:00:00Z",
    validFor: "12 months",
    shadowOrChallenger: false,
    createdAt: "2025-01-02T00:00:00Z",
  };
}

describe("append-only governance ledger", () => {
  it("replays a fully governed lifecycle deterministically with a valid hash chain", () => {
    const fixture = createGovernedFixture("production");
    const events = fixture.ledger.events;
    const replayed = ModelGovernanceLedger.replay(events);

    expect(replayed.headSha256).toBe(fixture.ledger.headSha256);
    expect(replayed.exportCanonical()).toBe(fixture.ledger.exportCanonical());
    expect(replayed.getLifecycleStatus(fixture.version.modelVersionId)).toBe("production");
    expect(replayed.getVersionBundle(fixture.version.modelVersionId)?.artifact.manifestSha256).toBe(
      fixture.artifact.manifestSha256,
    );
    expect(() => fixture.ledger.verifyIntegrity()).not.toThrow();
    expect(Object.isFrozen(events)).toBe(true);
    expect(Object.isFrozen(events[0])).toBe(true);
  });

  it("rejects illegal lifecycle skips and stale transition sources", () => {
    const fixture = createGovernedFixture("proposed");
    expect(() =>
      fixture.ledger.transition(
        fixture.version.modelVersionId,
        "approved",
        "Attempt to skip research and validation.",
        fixture.next(principal.researcher),
      ),
    ).toThrow(/not allowed/);

    const event = fixture.ledger.transition(
      fixture.version.modelVersionId,
      "research",
      "Begin research.",
      fixture.next(),
    );
    const forged = structuredClone(event) as GovernanceEvent;
    (forged.payload as { from: string }).from = "research";
    expect(() =>
      ModelGovernanceLedger.replay([...fixture.ledger.events.slice(0, -1), forged]),
    ).toThrow(/digest|stale/);
  });

  it("records failed and negative experiments instead of erasing them", () => {
    const fixture = createGovernedFixture("research");
    for (const [index, status] of (["negative", "failed"] as const).entries()) {
      fixture.ledger.recordExperiment(
        createExperiment({
          schemaVersion: 1,
          experimentId: uuid(510 + index),
          modelVersionId: fixture.version.modelVersionId,
          title: `${status} governed experiment`,
          hypothesis: "A prespecified challenger should improve held-out stability.",
          status,
          startedAt: "2024-12-01T00:00:00Z",
          completedAt: "2024-12-02T00:00:00Z",
          runByPrincipalId: principal.researcher,
          codeSha256: sha("a"),
          dataManifestSha256: fixture.dataManifest.manifestSha256,
          configurationSha256: sha("b"),
          randomSeeds: [index + 1],
          metrics: [],
          findings: [`The experiment ended with status ${status}.`],
          failureReason: status === "failed" ? "Numerical instability." : null,
          replacesExperimentId: null,
        }),
        fixture.next(principal.researcher),
      );
    }

    expect(
      fixture.ledger.getExperiments(fixture.version.modelVersionId).map((item) => item.status),
    ).toEqual(["negative", "failed"]);
  });

  it("binds notebook provenance to an independent peer review", () => {
    const fixture = createGovernedFixture("research");
    const artifact = createResearchArtifact({
      schemaVersion: 1,
      researchArtifactId: uuid(520),
      modelVersionId: fixture.version.modelVersionId,
      kind: "notebook",
      title: "Point-in-time audit notebook",
      authorPrincipalIds: [principal.developer],
      contentSha256: sha("a"),
      codeCommitSha256: sha("b"),
      environmentSha256: sha("c"),
      dataManifestSha256s: [fixture.dataManifest.manifestSha256],
      executedCellOrderSha256: sha("d"),
      outputSha256: sha("e"),
      createdAt: "2024-12-01T00:00:00Z",
      limitations: ["The notebook is not itself production approval."],
    });
    fixture.ledger.recordResearchArtifact(artifact, fixture.next(principal.developer));
    const review = createPeerReview({
      schemaVersion: 1,
      peerReviewId: uuid(521),
      researchArtifactId: artifact.researchArtifactId,
      researchArtifactSha256: artifact.manifestSha256,
      reviewerPrincipalId: principal.validator,
      authorPrincipalIds: artifact.authorPrincipalIds,
      decision: "approved",
      findings: ["The notebook reproduces in the pinned environment."],
      reviewedAt: "2024-12-02T00:00:00Z",
    });
    expect(fixture.ledger.recordPeerReview(review, fixture.next(principal.validator)).type).toBe(
      "peer_review_recorded",
    );
  });
});

describe("deployment, monitoring, forecasts, and retirement", () => {
  it("pins deployments and records a reversible rollback without deleting history", () => {
    const fixture = createGovernedFixture("production");
    const secondDeploymentId = uuid(530);
    fixture.ledger.recordDeployment(
      {
        schemaVersion: 1,
        deploymentId: secondDeploymentId,
        modelVersionId: fixture.version.modelVersionId,
        modelVersionSha256: fixture.version.manifestSha256,
        modelArtifactSha256: fixture.artifact.manifestSha256,
        environment: "production",
        approvedPolicySha256: sha("9"),
        deploymentReference: "production/model/sovereign-hazard/redeploy-1",
        rollbackArtifactSha256: sha("a"),
        previousDeploymentId: uuid(151),
        deployedAt: "2025-01-02T00:00:00Z",
        deployedByPrincipalId: principal.deployer,
      },
      fixture.next(principal.deployer),
    );
    expect(
      fixture.ledger.getActiveDeployment(fixture.version.modelVersionId, "production")
        ?.deploymentId,
    ).toBe(secondDeploymentId);

    fixture.ledger.recordRollback(
      {
        schemaVersion: 1,
        rollbackId: uuid(531),
        failedDeploymentId: secondDeploymentId,
        restoredDeploymentId: uuid(151),
        reason: "Post-deployment integrity checks failed.",
        evidenceSha256: sha("b"),
        performedAt: "2025-01-02T00:10:00Z",
        performedByPrincipalId: principal.deployer,
      },
      fixture.next(principal.deployer),
    );
    expect(
      fixture.ledger.getActiveDeployment(fixture.version.modelVersionId, "production")
        ?.deploymentId,
    ).toBe(uuid(151));
    expect(fixture.ledger.events.some((event) => event.type === "deployment_recorded")).toBe(true);
    expect(fixture.ledger.events.some((event) => event.type === "rollback_recorded")).toBe(true);
  });

  it("derives monitoring recommendations from exact thresholds and consecutive breaches", () => {
    const fixture = createGovernedFixture("production");
    const first = fixture.ledger.recordMonitoringObservation(
      {
        schemaVersion: 1,
        observationId: uuid(540),
        modelVersionId: fixture.version.modelVersionId,
        thresholdKey: "calibration_drift",
        metricValue: "0.15",
        sourceArtifactSha256: sha("a"),
        observedAt: "2025-01-02T00:00:00Z",
      },
      fixture.next(),
    ).payload;
    const second = fixture.ledger.recordMonitoringObservation(
      {
        schemaVersion: 1,
        observationId: uuid(541),
        modelVersionId: fixture.version.modelVersionId,
        thresholdKey: "calibration_drift",
        metricValue: "0.25",
        sourceArtifactSha256: sha("b"),
        observedAt: "2025-01-03T00:00:00Z",
      },
      fixture.next(),
    ).payload;

    expect(first).toMatchObject({
      severity: "warning",
      consecutiveBreaches: 1,
      recommendation: "review",
    });
    expect(second).toMatchObject({
      severity: "critical",
      consecutiveBreaches: 2,
      recommendation: "disable",
    });
    fixture.ledger.recordMonitoringIncident(
      {
        schemaVersion: 1,
        incidentId: uuid(542),
        modelVersionId: fixture.version.modelVersionId,
        observationIds: [uuid(540), uuid(541)],
        severity: "critical",
        status: "open",
        recommendation: "disable",
        summary: "Calibration drift exceeded the critical threshold twice.",
        openedAt: "2025-01-03T00:10:00Z",
        resolvedAt: null,
        ownerPrincipalId: principal.owner,
      },
      fixture.next(),
    );
    fixture.ledger.transition(
      fixture.version.modelVersionId,
      "disabled",
      "Emergency disable following critical monitoring incident.",
      fixture.next(),
    );
    expect(fixture.ledger.getLifecycleStatus(fixture.version.modelVersionId)).toBe("disabled");
  });

  it("keeps forecasts immutable while attaching outcomes and scores separately", () => {
    const fixture = createGovernedFixture("production");
    const forecast = forecastInput(fixture);
    fixture.ledger.recordForecast(forecast, fixture.next());
    const originalSha = fixture.ledger.getForecast(forecast.forecastId)?.manifestSha256;
    expect(() =>
      fixture.ledger.recordForecast({ ...forecast, outputValue: "0.3" }, fixture.next()),
    ).toThrow(/cannot be rewritten/);
    expect(fixture.ledger.getForecast(forecast.forecastId)?.manifestSha256).toBe(originalSha);

    fixture.ledger.recordForecastOutcome(
      {
        schemaVersion: 1,
        outcomeId: uuid(550),
        forecastId: forecast.forecastId,
        actualValue: "1",
        observedAt: "2025-12-31T00:00:00Z",
        availableAt: "2026-01-02T00:00:00Z",
        sourceSnapshotSha256: sha("c"),
      },
      fixture.next(),
    );
    fixture.ledger.recordForecastScore(
      {
        schemaVersion: 1,
        scoreId: uuid(551),
        forecastId: forecast.forecastId,
        outcomeId: uuid(550),
        metricKey: "brier_score",
        metricValue: "0.64",
        scoringMethodSha256: sha("d"),
        scoredAt: "2026-01-03T00:00:00Z",
      },
      fixture.next(),
    );
    expect(fixture.ledger.getOutcomeForForecast(forecast.forecastId)?.actualValue).toBe("1");
    expect(fixture.ledger.getForecastScores(forecast.forecastId)).toHaveLength(1);
    expect(fixture.ledger.getForecast(forecast.forecastId)?.manifestSha256).toBe(originalSha);
  });

  it("retires with owner approval while retaining the complete history", () => {
    const fixture = createGovernedFixture("production");
    fixture.ledger.recordApproval(
      approval("retirement", fixture.version.modelVersionId, fixture.version.manifestSha256, 560),
      fixture.next(),
    );
    const eventCount = fixture.ledger.events.length;
    fixture.ledger.retire(
      {
        schemaVersion: 1,
        retirementId: uuid(561),
        modelVersionId: fixture.version.modelVersionId,
        reason: "A separately governed successor replaced this version.",
        replacementModelVersionId: null,
        archiveArtifactSha256: sha("e"),
        retentionPolicy: "Retain artifacts, forecasts, approvals, and outcomes for seven years.",
        retiredAt: "2026-01-01T00:00:00Z",
        retiredByPrincipalId: principal.owner,
      },
      fixture.next(),
    );

    expect(fixture.ledger.getLifecycleStatus(fixture.version.modelVersionId)).toBe("retired");
    expect(fixture.ledger.events).toHaveLength(eventCount + 1);
    expect(fixture.ledger.lifecycleHistory.at(-1)?.type).toBe("retirement_recorded");
    expect(() => fixture.ledger.recordForecast(forecastInput(fixture), fixture.next())).toThrow(
      /retired models/,
    );
  });

  it("does not allow retirement without an exact model-owner decision", () => {
    const fixture = createGovernedFixture("research");
    const wrongApproval = createApproval({
      schemaVersion: 1,
      approvalId: uuid(570),
      modelVersionId: fixture.version.modelVersionId,
      subjectSha256: fixture.version.manifestSha256,
      role: "model_owner",
      scope: "retirement",
      principalId: principal.business,
      decision: "approved",
      conditions: [],
      decidedAt: "2025-01-01T00:00:00Z",
    });
    fixture.ledger.recordApproval(wrongApproval, fixture.next(principal.business));
    expect(() =>
      fixture.ledger.retire(
        {
          schemaVersion: 1,
          retirementId: uuid(571),
          modelVersionId: fixture.version.modelVersionId,
          reason: "Unauthorized retirement attempt.",
          replacementModelVersionId: null,
          archiveArtifactSha256: sha("f"),
          retentionPolicy: "Retain all artifacts.",
          retiredAt: "2025-01-01T00:00:00Z",
          retiredByPrincipalId: principal.owner,
        },
        fixture.next(),
      ),
    ).toThrow(/model-owner approval/);
  });
});

describe("registry constraints", () => {
  it("rejects duplicate inventory identifiers and keys", () => {
    const bundle = createFixtureBundle();
    const ledger = new ModelGovernanceLedger();
    const next = metadataFactory();
    ledger.registerInventory(bundle.inventory, next());
    expect(() => ledger.registerInventory(bundle.inventory, next())).toThrow(/modelId already/);
  });
});
