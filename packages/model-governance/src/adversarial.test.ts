import { describe, expect, it } from "vitest";
import {
  type ChangeClass,
  createDataManifest,
  createLabelManifest,
  createModelArtifactManifest,
  createModelCard,
  createModelVersion,
} from "./artifacts.js";
import {
  approval,
  createFixtureBundle,
  createGovernedFixture,
  metadataFactory,
  principal,
  sha,
  uuid,
} from "./fixtures.test-helper.js";
import { createValidationEvidence, evaluateProductionReadiness } from "./governance.js";
import { digestJson } from "./internals.js";
import {
  type DeploymentRecordInput,
  type ForecastRecordInput,
  type GovernanceEvent,
  ModelGovernanceLedger,
  type MonitoringIncidentInput,
} from "./ledger.js";
import {
  createExperiment,
  createPeerReview,
  createReproducibilityReceipt,
  createResearchArtifact,
} from "./research.js";

function unsigned<T extends { readonly manifestSha256: string }>(
  value: T,
): Omit<T, "manifestSha256"> {
  const { manifestSha256: _digest, ...input } = value;
  return input;
}

function createChild(changeClass: ChangeClass, versionName: string) {
  const parent = createFixtureBundle();
  const card = createModelCard({
    ...unsigned(parent.card),
    modelCardId: uuid(600),
    modelVersion: versionName,
  });
  const artifact = createModelArtifactManifest({
    ...unsigned(parent.artifact),
    artifactManifestId: uuid(601),
    modelVersion: versionName,
  });
  const version = createModelVersion({
    ...unsigned(parent.version),
    modelVersionId: uuid(602),
    version: versionName,
    parentModelVersionId: parent.version.modelVersionId,
    changeClass,
    modelCardSha256: card.manifestSha256,
    artifactManifestSha256: artifact.manifestSha256,
  });
  return { parent, card, artifact, version };
}

describe("adversarial manifest admission", () => {
  it("rejects missing, duplicate, unbounded, and invalid data snapshots", () => {
    const { dataManifest } = createFixtureBundle();
    const input = unsigned(dataManifest);
    const snapshot = input.snapshots[0];
    if (!snapshot) throw new Error("fixture snapshot missing");
    expect(() => createDataManifest({ ...input, snapshots: [] })).toThrow(/1..500/);
    expect(() => createDataManifest({ ...input, snapshots: [snapshot, snapshot] })).toThrow(
      /datasetKey must be unique/,
    );
    expect(() =>
      createDataManifest({ ...input, snapshots: [{ ...snapshot, rowCount: 0 }] }),
    ).toThrow(/rowCount/);
    expect(() =>
      createDataManifest({
        ...input,
        snapshots: [{ ...snapshot, pointInTimeGrade: "bad" as never }],
      }),
    ).toThrow(/allowed/);
    expect(() => createDataManifest({ ...input, imputationFitScope: "global" as never })).toThrow(
      /allowed/,
    );
  });

  it("rejects malformed label, card, threshold, artifact, and version collections", () => {
    const { labelManifest, card, artifact, version } = createFixtureBundle();
    const labelInput = unsigned(labelManifest);
    const cardInput = unsigned(card);
    const artifactInput = unsigned(artifact);
    const versionInput = unsigned(version);
    const label = labelInput.labels[0];
    const metric = cardInput.metrics[0];
    const threshold = cardInput.monitoringThresholds[0];
    if (!label || !metric || !threshold) throw new Error("fixture manifest entry missing");
    expect(() => createLabelManifest({ ...labelInput, labels: [] })).toThrow(/1..100/);
    expect(() =>
      createLabelManifest({
        ...labelInput,
        labels: [label, label],
      }),
    ).toThrow(/labelKey must be unique/);
    expect(() => createModelCard({ ...cardInput, trainingPeriods: [] })).toThrow(/trainingPeriods/);
    expect(() =>
      createModelCard({
        ...cardInput,
        trainingPeriods: [{ start: "2020-01-01T00:00:00Z", end: "2019-01-01T00:00:00Z" }],
      }),
    ).toThrow(/start must precede/);
    expect(() => createModelCard({ ...cardInput, hyperparametersOrPriors: {} })).toThrow(
      /hyperparametersOrPriors/,
    );
    expect(() => createModelCard({ ...cardInput, metrics: [] })).toThrow(/metrics/);
    expect(() => createModelCard({ ...cardInput, metrics: [metric, metric] })).toThrow(
      /metric and evaluation slice/,
    );
    expect(() => createModelCard({ ...cardInput, monitoringThresholds: [] })).toThrow(
      /monitoringThresholds/,
    );
    expect(() =>
      createModelCard({
        ...cardInput,
        monitoringThresholds: [{ ...threshold, criticalValue: "0.05" }],
      }),
    ).toThrow(/beyond warning/);
    expect(() =>
      createModelCard({
        ...cardInput,
        monitoringThresholds: [{ ...threshold, minimumConsecutiveBreaches: 0 }],
      }),
    ).toThrow(/minimumConsecutive/);
    expect(() => createModelArtifactManifest({ ...artifactInput, randomSeeds: [] })).toThrow(
      /1..1000/,
    );
    expect(() => createModelArtifactManifest({ ...artifactInput, randomSeeds: [-1] })).toThrow(
      /non-negative/,
    );
    expect(() => createModelVersion({ ...versionInput, developerPrincipalIds: [] })).toThrow(
      /1..100/,
    );
    expect(() =>
      createModelVersion({ ...versionInput, parentModelVersionId: versionInput.modelVersionId }),
    ).not.toThrow();
  });

  it("applies semantic change classes against an exact parent version", () => {
    for (const [changeClass, versionName, message] of [
      ["patch", "1.1.0", /patch change/],
      ["minor", "1.0.2", /minor change/],
      ["major", "1.1.0", /major change/],
    ] as const) {
      const child = createChild(changeClass, versionName);
      const ledger = new ModelGovernanceLedger();
      const next = metadataFactory();
      ledger.registerInventory(child.parent.inventory, next());
      ledger.registerVersion(
        {
          inventoryId: child.parent.inventory.modelId,
          version: child.parent.version,
          card: child.parent.card,
          artifact: child.parent.artifact,
          dataManifest: child.parent.dataManifest,
          labelManifest: child.parent.labelManifest,
        },
        next(),
      );
      expect(() =>
        ledger.registerVersion(
          {
            inventoryId: child.parent.inventory.modelId,
            version: child.version,
            card: child.card,
            artifact: child.artifact,
            dataManifest: child.parent.dataManifest,
            labelManifest: child.parent.labelManifest,
          },
          next(),
        ),
      ).toThrow(message);
    }

    const valid = createChild("patch", "1.0.1");
    const ledger = new ModelGovernanceLedger();
    const next = metadataFactory();
    ledger.registerInventory(valid.parent.inventory, next());
    ledger.registerVersion(
      {
        inventoryId: valid.parent.inventory.modelId,
        version: valid.parent.version,
        card: valid.parent.card,
        artifact: valid.parent.artifact,
        dataManifest: valid.parent.dataManifest,
        labelManifest: valid.parent.labelManifest,
      },
      next(),
    );
    expect(() =>
      ledger.registerVersion(
        {
          inventoryId: valid.parent.inventory.modelId,
          version: valid.version,
          card: valid.card,
          artifact: valid.artifact,
          dataManifest: valid.parent.dataManifest,
          labelManifest: valid.parent.labelManifest,
        },
        next(),
      ),
    ).not.toThrow();
  });

  it("validates research state combinations and provenance bounds", () => {
    const experiment = {
      schemaVersion: 1 as const,
      experimentId: uuid(610),
      modelVersionId: uuid(8),
      title: "Experiment",
      hypothesis: "A bounded hypothesis.",
      status: "failed" as const,
      startedAt: "2024-02-02T00:00:00Z",
      completedAt: "2024-02-01T00:00:00Z",
      runByPrincipalId: principal.researcher,
      codeSha256: sha("a"),
      dataManifestSha256: sha("b"),
      configurationSha256: sha("c"),
      randomSeeds: [1],
      metrics: [],
      findings: ["No result."],
      failureReason: "Failed.",
      replacesExperimentId: null,
    };
    expect(() => createExperiment(experiment)).toThrow(/completedAt cannot precede/);
    expect(() =>
      createExperiment({
        ...experiment,
        status: "running",
        completedAt: null,
        findings: ["Premature finding."],
        failureReason: null,
      }),
    ).toThrow(/cannot claim findings/);
    expect(() =>
      createExperiment({ ...experiment, completedAt: "2024-02-03T00:00:00Z", failureReason: null }),
    ).toThrow(/failureReason/);
    expect(() =>
      createExperiment({
        ...experiment,
        experimentId: uuid(611),
        completedAt: "2024-02-03T00:00:00Z",
        replacesExperimentId: uuid(611),
      }),
    ).toThrow(/replace itself/);

    const receiptInput = {
      schemaVersion: 1 as const,
      receiptId: uuid(612),
      subjectType: "experiment" as const,
      subjectId: uuid(610),
      codeSha256: sha("a"),
      dataManifestSha256: sha("b"),
      environmentSha256: sha("c"),
      configurationSha256: sha("d"),
      commandArgv: ["run"],
      expectedOutputSha256s: [sha("e")],
      actualOutputSha256s: [sha("f")],
      deterministicTolerance: "0",
      result: "failed" as const,
      executedAt: "2024-02-03T00:00:00Z",
      executedByPrincipalId: principal.researcher,
    };
    expect(createReproducibilityReceipt(receiptInput).result).toBe("failed");
    expect(() => createReproducibilityReceipt({ ...receiptInput, commandArgv: [] })).toThrow(
      /commandArgv/,
    );
    expect(() =>
      createReproducibilityReceipt({ ...receiptInput, deterministicTolerance: "-0.1" }),
    ).toThrow(/cannot be negative/);

    const research = createResearchArtifact({
      schemaVersion: 1,
      researchArtifactId: uuid(613),
      modelVersionId: uuid(8),
      kind: "analysis",
      title: "Static analysis",
      authorPrincipalIds: [principal.developer],
      contentSha256: sha("a"),
      codeCommitSha256: sha("b"),
      environmentSha256: sha("c"),
      dataManifestSha256s: [sha("d")],
      executedCellOrderSha256: null,
      outputSha256: sha("e"),
      createdAt: "2024-02-03T00:00:00Z",
      limitations: ["Static artifact."],
    });
    expect(research.executedCellOrderSha256).toBeNull();
    expect(() => createResearchArtifact({ ...unsigned(research), authorPrincipalIds: [] })).toThrow(
      /authorPrincipalIds/,
    );
    expect(() =>
      createResearchArtifact({ ...unsigned(research), dataManifestSha256s: [sha("d"), sha("d")] }),
    ).toThrow(/must be unique/);
    expect(() =>
      createPeerReview({
        schemaVersion: 1,
        peerReviewId: uuid(614),
        researchArtifactId: research.researchArtifactId,
        researchArtifactSha256: research.manifestSha256,
        reviewerPrincipalId: principal.validator,
        authorPrincipalIds: [principal.developer, principal.developer],
        decision: "approved",
        findings: ["Duplicate authors."],
        reviewedAt: "2024-02-04T00:00:00Z",
      }),
    ).toThrow(/must be unique/);
  });
});

describe("adversarial event ledger and lifecycle", () => {
  it("rejects duplicate, out-of-order, forged, and actor-mismatched events", () => {
    const fixture = createGovernedFixture("research");
    const reused = fixture.next(principal.validator);
    const evidence = createValidationEvidence({
      schemaVersion: 1,
      evidenceId: uuid(620),
      modelVersionId: fixture.version.modelVersionId,
      check: "leakage",
      origin: "method_audit",
      result: "passed",
      admittedForGate: true,
      artifactSha256: sha("a"),
      performedByPrincipalId: principal.validator,
      performedAt: "2025-01-01T00:00:00Z",
      description: "A fresh leakage check.",
    });
    fixture.ledger.recordValidationEvidence(evidence, reused);
    expect(() => fixture.ledger.recordValidationEvidence(evidence, reused)).toThrow(
      /eventId already/,
    );
    expect(() =>
      fixture.ledger.recordApproval(
        approval("validation", fixture.version.modelVersionId, fixture.version.manifestSha256, 622),
        fixture.next(principal.owner),
      ),
    ).toThrow(/event actor/);

    const events = structuredClone(fixture.ledger.events) as GovernanceEvent[];
    const firstEvent = events[0];
    if (!firstEvent) throw new Error("fixture event missing");
    events[0] = { ...firstEvent, sequence: 2 };
    expect(() => ModelGovernanceLedger.replay(events)).toThrow(/sequence/);
    const forged = structuredClone(fixture.ledger.events) as GovernanceEvent[];
    const forgedFirst = forged[0];
    if (!forgedFirst) throw new Error("fixture event missing");
    forged[0] = { ...forgedFirst, eventSha256: sha("f") };
    expect(() => ModelGovernanceLedger.replay(forged)).toThrow(/digest/);
  });

  it("rejects a semantically invalid artifact even if an attacker recomputes the event chain", () => {
    const fixture = createGovernedFixture("proposed");
    const events = structuredClone(fixture.ledger.events) as GovernanceEvent[];
    const first = events[0];
    const second = events[1];
    if (!first || !second) throw new Error("fixture events missing");
    const { manifestSha256: _manifest, ...originalPayload } = first.payload as unknown as Record<
      string,
      unknown
    >;
    const badPayloadUnsigned = { ...originalPayload, riskTier: "unbounded" };
    const badPayload = {
      ...badPayloadUnsigned,
      manifestSha256: digestJson(badPayloadUnsigned),
    };
    const firstUnsigned = { ...first, payload: badPayload } as Record<string, unknown>;
    delete firstUnsigned.eventSha256;
    events[0] = { ...first, payload: badPayload as never, eventSha256: digestJson(firstUnsigned) };
    const changedFirst = events[0];
    if (!changedFirst) throw new Error("changed event missing");
    const secondUnsigned = { ...second, previousEventSha256: changedFirst.eventSha256 } as Record<
      string,
      unknown
    >;
    delete secondUnsigned.eventSha256;
    events[1] = {
      ...second,
      previousEventSha256: changedFirst.eventSha256,
      eventSha256: digestJson(secondUnsigned),
    };
    expect(() => ModelGovernanceLedger.replay(events)).toThrow(/riskTier/);
  });

  it("blocks incomplete promotion and conditional or rejected approvals", () => {
    const fixture = createGovernedFixture("research");
    expect(() =>
      fixture.ledger.transition(
        fixture.version.modelVersionId,
        "validated",
        "No evidence exists.",
        fixture.next(),
      ),
    ).toThrow(/readiness gate/);
    expect(() =>
      fixture.ledger.transition(
        fixture.version.modelVersionId,
        "retired",
        "Attempt to bypass the retirement record.",
        fixture.next(),
      ),
    ).toThrow(/retirement record/);

    const production = createGovernedFixture("production");
    const context = production.ledger.readinessContext(production.version.modelVersionId);
    const riskApproval = context.approvals.find((item) => item.scope === "risk_acceptance");
    if (!riskApproval) throw new Error("risk approval fixture missing");
    expect(
      evaluateProductionReadiness({
        ...context,
        approvals: context.approvals.map((item) =>
          item.approvalId === riskApproval.approvalId
            ? { ...item, conditions: ["Open condition."] }
            : item,
        ),
      }).blockers,
    ).toContain("risk_acceptance_approval_missing");
    expect(
      evaluateProductionReadiness({
        ...context,
        approvals: context.approvals.map((item) =>
          item.approvalId === riskApproval.approvalId ? { ...item, decision: "rejected" } : item,
        ),
      }).blockers,
    ).toContain("risk_acceptance_approval_missing");
  });

  it("validates deployment state, identity, and active-parent lineage", () => {
    const fixture = createGovernedFixture("proposed");
    const input: DeploymentRecordInput = {
      schemaVersion: 1,
      deploymentId: uuid(630),
      modelVersionId: fixture.version.modelVersionId,
      modelVersionSha256: fixture.version.manifestSha256,
      modelArtifactSha256: fixture.artifact.manifestSha256,
      environment: "staging",
      approvedPolicySha256: sha("a"),
      deploymentReference: "staging/invalid",
      rollbackArtifactSha256: sha("b"),
      previousDeploymentId: null,
      deployedAt: "2025-01-01T00:00:00Z",
      deployedByPrincipalId: principal.deployer,
    };
    expect(() => fixture.ledger.recordDeployment(input, fixture.next(principal.deployer))).toThrow(
      /approved or recoverable/,
    );

    const production = createGovernedFixture("production");
    expect(() =>
      production.ledger.recordDeployment(
        {
          ...input,
          deploymentId: uuid(631),
          modelVersionId: production.version.modelVersionId,
          modelVersionSha256: production.version.manifestSha256,
          modelArtifactSha256: production.artifact.manifestSha256,
          environment: "production",
          previousDeploymentId: null,
        },
        production.next(principal.deployer),
      ),
    ).toThrow(/previousDeploymentId/);
    expect(() =>
      production.ledger.recordDeployment(
        {
          ...input,
          deploymentId: uuid(632),
          modelVersionId: production.version.modelVersionId,
          modelVersionSha256: sha("f"),
          modelArtifactSha256: production.artifact.manifestSha256,
          environment: "production",
          previousDeploymentId: uuid(151),
        },
        production.next(principal.deployer),
      ),
    ).toThrow(/does not bind/);
    expect(() =>
      production.ledger.recordRollback(
        {
          schemaVersion: 1,
          rollbackId: uuid(633),
          failedDeploymentId: uuid(151),
          restoredDeploymentId: uuid(151),
          reason: "Invalid self rollback.",
          evidenceSha256: sha("a"),
          performedAt: "2025-01-01T00:00:00Z",
          performedByPrincipalId: principal.deployer,
        },
        production.next(principal.deployer),
      ),
    ).toThrow(/different deployment/);
  });
});

describe("adversarial monitoring and prediction ledger", () => {
  it("covers normal, warning, restriction, and chronological monitoring outcomes", () => {
    const fixture = createGovernedFixture("production");
    for (const [index, value] of ["0.05", "0.15", "0.15"].entries()) {
      fixture.ledger.recordMonitoringObservation(
        {
          schemaVersion: 1,
          observationId: uuid(640 + index),
          modelVersionId: fixture.version.modelVersionId,
          thresholdKey: "calibration_drift",
          metricValue: value,
          sourceArtifactSha256: sha("a"),
          observedAt: `2025-01-0${index + 1}T00:00:00Z`,
        },
        fixture.next(),
      );
    }
    expect(fixture.ledger.getMonitoringObservations(fixture.version.modelVersionId)).toMatchObject([
      { severity: "normal", recommendation: "none", consecutiveBreaches: 0 },
      { severity: "warning", recommendation: "review", consecutiveBreaches: 1 },
      { severity: "warning", recommendation: "restrict", consecutiveBreaches: 2 },
    ]);
    expect(() =>
      fixture.ledger.recordMonitoringObservation(
        {
          schemaVersion: 1,
          observationId: uuid(643),
          modelVersionId: fixture.version.modelVersionId,
          thresholdKey: "calibration_drift",
          metricValue: "0.3",
          sourceArtifactSha256: sha("b"),
          observedAt: "2025-01-02T00:00:00Z",
        },
        fixture.next(),
      ),
    ).toThrow(/chronological/);
    expect(() =>
      fixture.ledger.recordMonitoringObservation(
        {
          schemaVersion: 1,
          observationId: uuid(644),
          modelVersionId: fixture.version.modelVersionId,
          thresholdKey: "missing_threshold",
          metricValue: "1",
          sourceArtifactSha256: sha("c"),
          observedAt: "2025-01-04T00:00:00Z",
        },
        fixture.next(),
      ),
    ).toThrow(/unknown monitoring threshold/);
  });

  it("rejects incidents without matching observations or critical support", () => {
    const fixture = createGovernedFixture("production");
    const base: MonitoringIncidentInput = {
      schemaVersion: 1,
      incidentId: uuid(650),
      modelVersionId: fixture.version.modelVersionId,
      observationIds: [uuid(999)],
      severity: "critical",
      status: "open",
      recommendation: "disable",
      summary: "Missing observation incident.",
      openedAt: "2025-01-01T00:00:00Z",
      resolvedAt: null,
      ownerPrincipalId: principal.owner,
    };
    expect(() => fixture.ledger.recordMonitoringIncident(base, fixture.next())).toThrow(
      /missing or mismatched/,
    );
    expect(() =>
      fixture.ledger.recordMonitoringIncident({ ...base, observationIds: [] }, fixture.next()),
    ).toThrow(/1..1000/);
    expect(() =>
      fixture.ledger.recordMonitoringIncident(
        {
          ...base,
          status: "resolved",
          resolvedAt: "2024-12-01T00:00:00Z",
        },
        fixture.next(),
      ),
    ).toThrow(/resolvedAt cannot precede/);
  });

  it("allows an explicit research shadow but blocks operational or ungated claims", () => {
    const research = createGovernedFixture("research");
    const input: ForecastRecordInput = {
      schemaVersion: 1,
      forecastId: uuid(660),
      modelVersionId: research.version.modelVersionId,
      modelVersionSha256: research.version.manifestSha256,
      modelArtifactSha256: research.artifact.manifestSha256,
      dataSnapshotSha256: research.dataManifest.featureSnapshotSha256,
      claimKind: "descriptive",
      outputSemantics: "A research-only descriptive output.",
      outputValue: "1",
      predictionAsOf: "2024-12-01T00:00:00Z",
      validFor: "research snapshot",
      shadowOrChallenger: true,
      createdAt: "2025-01-01T00:00:00Z",
    };
    expect(research.ledger.recordForecast(input, research.next()).type).toBe("forecast_recorded");
    expect(() =>
      research.ledger.recordForecast(
        { ...input, forecastId: uuid(661), shadowOrChallenger: false },
        research.next(),
      ),
    ).toThrow(/operational forecasts/);
    expect(() =>
      research.ledger.recordForecast(
        { ...input, forecastId: uuid(662), claimKind: "calibrated_probability" },
        research.next(),
      ),
    ).toThrow(/validation gate/);

    const production = createGovernedFixture("production");
    expect(() =>
      production.ledger.recordForecast(
        {
          ...input,
          forecastId: uuid(663),
          modelVersionId: production.version.modelVersionId,
          modelVersionSha256: sha("f"),
          modelArtifactSha256: production.artifact.manifestSha256,
          claimKind: "calibrated_probability",
          shadowOrChallenger: false,
        },
        production.next(),
      ),
    ).toThrow(/does not bind/);
    expect(() =>
      production.ledger.recordForecast(
        {
          ...input,
          forecastId: uuid(665),
          modelVersionId: production.version.modelVersionId,
          modelVersionSha256: production.version.manifestSha256,
          modelArtifactSha256: production.artifact.manifestSha256,
          claimKind: "calibrated_probability",
          outputValue: "1.01",
          shadowOrChallenger: false,
        },
        production.next(),
      ),
    ).toThrow(/between 0 and 1/);
    expect(() =>
      production.ledger.recordForecast(
        { ...input, forecastId: uuid(664), predictionAsOf: "2026-01-01T00:00:00Z" },
        production.next(),
      ),
    ).toThrow(/predictionAsOf/);
  });

  it("rejects orphan, premature, and duplicate outcome or score attachments", () => {
    const fixture = createGovernedFixture("production");
    expect(() =>
      fixture.ledger.recordForecastOutcome(
        {
          schemaVersion: 1,
          outcomeId: uuid(670),
          forecastId: uuid(999),
          actualValue: "1",
          observedAt: "2025-01-01T00:00:00Z",
          availableAt: "2025-01-02T00:00:00Z",
          sourceSnapshotSha256: sha("a"),
        },
        fixture.next(),
      ),
    ).toThrow(/unknown forecast/);
    expect(() =>
      fixture.ledger.recordForecastOutcome(
        {
          schemaVersion: 1,
          outcomeId: uuid(671),
          forecastId: uuid(999),
          actualValue: "1",
          observedAt: "2025-01-03T00:00:00Z",
          availableAt: "2025-01-02T00:00:00Z",
          sourceSnapshotSha256: sha("a"),
        },
        fixture.next(),
      ),
    ).toThrow(/observedAt/);
    expect(() =>
      fixture.ledger.recordForecastScore(
        {
          schemaVersion: 1,
          scoreId: uuid(672),
          forecastId: uuid(999),
          outcomeId: uuid(998),
          metricKey: "brier_score",
          metricValue: "1",
          scoringMethodSha256: sha("b"),
          scoredAt: "2025-01-03T00:00:00Z",
        },
        fixture.next(),
      ),
    ).toThrow(/missing or mismatched/);
  });
});
