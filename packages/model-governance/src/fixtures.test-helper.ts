import {
  createDataManifest,
  createLabelManifest,
  createModelArtifactManifest,
  createModelCard,
  createModelInventory,
  createModelVersion,
} from "./artifacts.js";
import {
  type ApprovalScope,
  createApproval,
  createValidationEvidence,
  createValidationReport,
  type GovernanceRole,
  VALIDATION_CHECKS,
} from "./governance.js";
import { type EventMetadata, ModelGovernanceLedger, type ModelLifecycleStatus } from "./ledger.js";
import { createReproducibilityReceipt } from "./research.js";

export const principal = {
  owner: "10000000-0000-4000-8000-000000000001",
  business: "10000000-0000-4000-8000-000000000002",
  developer: "10000000-0000-4000-8000-000000000003",
  validator: "10000000-0000-4000-8000-000000000004",
  risk: "10000000-0000-4000-8000-000000000005",
  deployer: "10000000-0000-4000-8000-000000000006",
  security: "10000000-0000-4000-8000-000000000007",
  researcher: "10000000-0000-4000-8000-000000000008",
} as const;

export function uuid(index: number): string {
  return `20000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

export function sha(character: string): string {
  return character.repeat(64);
}

export function metadataFactory(start = 0): (actorPrincipalId?: string) => EventMetadata {
  let counter = start;
  return (actorPrincipalId = principal.owner) => {
    counter += 1;
    return {
      eventId: uuid(7000 + counter),
      occurredAt: `2025-01-01T00:${Math.floor(counter / 60)
        .toString()
        .padStart(2, "0")}:${(counter % 60).toString().padStart(2, "0")}Z`,
      actorPrincipalId,
    };
  };
}

export function createFixtureBundle() {
  const inventory = createModelInventory({
    schemaVersion: 1,
    modelId: uuid(1),
    modelKey: "sovereign.hazard",
    name: "Sovereign hazard research model",
    ownerPrincipalId: principal.owner,
    businessOwnerPrincipalId: principal.business,
    purpose: "Estimate a versioned sovereign distress hazard for governed research workflows.",
    intendedUsers: ["economic analysts"],
    supportedDecisions: ["research prioritization"],
    targetOrEstimand: "Distress onset in a fixed twelve-month horizon.",
    entityPopulation: "Sovereign economies with required point-in-time coverage.",
    horizons: ["12 months"],
    outputSemantics: "A separately validated event probability when all probability gates pass.",
    modelFamily: "regularized discrete-time hazard",
    requiredFeatureKeys: ["gdp_growth"],
    requiredDatasetKeys: ["official_macro"],
    assumptions: ["Publication timestamps bound the information set."],
    knownLimitations: ["Rare events limit precision in thin regimes."],
    prohibitedUses: ["Automated investment or lending decisions."],
    legalLanguage: "Research output; not investment advice.",
    causalClassification: "causal_estimate",
    riskTier: "high",
    impactTier: "high",
    validationCadenceDays: 90,
    createdAt: "2024-12-01T00:00:00Z",
  });
  const dataManifest = createDataManifest({
    schemaVersion: 1,
    dataManifestId: uuid(2),
    createdAt: "2024-12-10T00:00:00Z",
    createdBy: principal.developer,
    snapshots: [
      {
        datasetKey: "official_macro",
        snapshotId: uuid(3),
        snapshotSha256: sha("a"),
        sourceLicenseId: "official.open",
        observedThrough: "2024-11-01T00:00:00Z",
        availableAt: "2024-11-15T00:00:00Z",
        rowCount: 500,
        pointInTimeGrade: "verified",
      },
    ],
    featureSnapshotSha256: sha("b"),
    preprocessingFitScope: "inside_each_fold",
    imputationFitScope: "inside_each_fold",
    sourceDisagreementPolicy: "Keep source vintages separate and expose disagreement.",
  });
  const labelManifest = createLabelManifest({
    schemaVersion: 1,
    labelManifestId: uuid(4),
    taxonomyVersion: "1.0.0",
    frozenAt: "2024-12-10T00:00:00Z",
    labelsSnapshotSha256: sha("c"),
    labels: [
      {
        labelKey: "distress_onset",
        definition: "First verified onset under the frozen taxonomy.",
        horizon: "12 months",
        onsetRule: "The earliest date supported by two governed sources.",
        ambiguityPolicy: "Ambiguous onsets are excluded from the primary evaluation.",
        positiveCount: 30,
        totalCount: 500,
      },
    ],
  });
  const card = createModelCard({
    schemaVersion: 1,
    modelCardId: uuid(5),
    modelId: inventory.modelId,
    modelVersion: "1.0.0",
    ownerPrincipalId: principal.owner,
    purpose: inventory.purpose,
    target: inventory.targetOrEstimand,
    trainingPeriods: [{ start: "2010-01-01T00:00:00Z", end: "2020-01-01T00:00:00Z" }],
    orderedFeatureKeys: ["gdp_growth"],
    pointInTimeGrade: "verified",
    preprocessing: "Fit winsorization and scaling inside every chronological fold.",
    method: "Regularized discrete-time hazard with a prespecified identification design.",
    hyperparametersOrPriors: { penalty: "0.1" },
    uncertaintyComponents: ["calibration uncertainty", "data revision uncertainty"],
    validationDesign: "Expanding chronological folds plus country and regime holdouts.",
    metrics: [
      {
        metricKey: "brier_score",
        value: "0.12",
        evaluationSlice: "frozen final holdout",
        evidenceOrigin: "empirical_observed",
        presentedAsEmpirical: true,
        evidenceId: uuid(6),
      },
    ],
    subgroupAndRegimePerformance: "Reported separately for each supported regime and region.",
    robustness: "Placebo, sensitivity, and feature-era exclusions are reported.",
    fairnessAndConsequences: "No automated decisions; subgroup failures force restriction.",
    outOfDomainRules: ["Return insufficient_evidence outside supported feature ranges."],
    monitoringThresholds: [
      {
        thresholdKey: "calibration_drift",
        metricKey: "brier_delta",
        operator: "gt",
        warningValue: "0.1",
        criticalValue: "0.2",
        minimumConsecutiveBreaches: 2,
      },
    ],
    retrainingPolicy: "Retraining creates a new immutable version and requires validation.",
    limitations: inventory.knownLimitations,
    prohibitedUses: inventory.prohibitedUses,
    temporalTarget: true,
    claimsCalibratedProbability: true,
    claimsCausalEffect: true,
    minimumCalibrationEventCount: 20,
    createdAt: "2024-12-11T00:00:00Z",
  });
  const artifact = createModelArtifactManifest({
    schemaVersion: 1,
    artifactManifestId: uuid(7),
    modelId: inventory.modelId,
    modelVersion: card.modelVersion,
    codeCommitSha256: sha("d"),
    packageLockSha256: sha("e"),
    sbomSha256: sha("f"),
    environmentSha256: sha("1"),
    configurationSha256: sha("2"),
    orderedFeatureKeys: card.orderedFeatureKeys,
    preprocessingSha256: sha("3"),
    trainingSnapshotSha256: sha("4"),
    calibrationSnapshotSha256: sha("5"),
    validationSnapshotSha256: sha("6"),
    labelManifestSha256: labelManifest.manifestSha256,
    randomSeeds: [42],
    serializedModelSha256: sha("7"),
    metricsSha256: sha("8"),
    createdAt: "2024-12-11T00:00:00Z",
  });
  const version = createModelVersion({
    schemaVersion: 1,
    modelVersionId: uuid(8),
    modelId: inventory.modelId,
    version: card.modelVersion,
    parentModelVersionId: null,
    changeClass: "major",
    changeSummary: "Initial governed model version.",
    developerPrincipalIds: [principal.developer],
    dataManifestSha256: dataManifest.manifestSha256,
    labelManifestSha256: labelManifest.manifestSha256,
    modelCardSha256: card.manifestSha256,
    artifactManifestSha256: artifact.manifestSha256,
    createdAt: "2024-12-11T00:00:00Z",
  });
  return { inventory, dataManifest, labelManifest, card, artifact, version };
}

const roleByScope: Record<ApprovalScope, GovernanceRole> = {
  validation: "independent_validator",
  risk_acceptance: "model_risk_manager",
  intended_use: "business_owner",
  security_privacy_legal: "security_privacy_legal_reviewer",
  staging_deployment: "deployment_approver",
  production_deployment: "deployment_approver",
  re_enable: "model_risk_manager",
  retirement: "model_owner",
};

const principalByScope: Record<ApprovalScope, string> = {
  validation: principal.validator,
  risk_acceptance: principal.risk,
  intended_use: principal.business,
  security_privacy_legal: principal.security,
  staging_deployment: principal.deployer,
  production_deployment: principal.deployer,
  re_enable: principal.risk,
  retirement: principal.owner,
};

export function approval(
  scope: ApprovalScope,
  versionId: string,
  versionSha: string,
  index: number,
) {
  return createApproval({
    schemaVersion: 1,
    approvalId: uuid(index),
    modelVersionId: versionId,
    subjectSha256: versionSha,
    role: roleByScope[scope],
    scope,
    principalId: principalByScope[scope],
    decision: "approved",
    conditions: [],
    decidedAt: "2024-12-20T00:00:00Z",
  });
}

export function createGovernedFixture(target: ModelLifecycleStatus = "production") {
  const ledger = new ModelGovernanceLedger();
  const next = metadataFactory();
  const bundle = createFixtureBundle();
  ledger.registerInventory(bundle.inventory, next());
  ledger.registerVersion(
    {
      inventoryId: bundle.inventory.modelId,
      version: bundle.version,
      card: bundle.card,
      artifact: bundle.artifact,
      dataManifest: bundle.dataManifest,
      labelManifest: bundle.labelManifest,
    },
    next(),
  );
  if (target === "proposed") return { ledger, next, ...bundle };
  ledger.transition(bundle.version.modelVersionId, "research", "Begin governed research.", next());
  if (target === "research") return { ledger, next, ...bundle };

  const evidence = VALIDATION_CHECKS.map((check, index) =>
    createValidationEvidence({
      schemaVersion: 1,
      evidenceId: uuid(100 + index),
      modelVersionId: bundle.version.modelVersionId,
      check,
      origin: check === "calibration" ? "empirical_observed" : "method_audit",
      result: "passed",
      admittedForGate: true,
      artifactSha256: sha(index.toString(16)),
      performedByPrincipalId: principal.validator,
      performedAt: "2024-12-19T00:00:00Z",
      description: `Independent evidence for ${check}.`,
    }),
  );
  for (const item of evidence) ledger.recordValidationEvidence(item, next(principal.validator));
  const receipt = createReproducibilityReceipt({
    schemaVersion: 1,
    receiptId: uuid(130),
    subjectType: "model_version",
    subjectId: bundle.version.modelVersionId,
    codeSha256: bundle.artifact.codeCommitSha256,
    dataManifestSha256: bundle.dataManifest.manifestSha256,
    environmentSha256: bundle.artifact.environmentSha256,
    configurationSha256: bundle.artifact.configurationSha256,
    commandArgv: ["pnpm", "model:reproduce", "--version", "1.0.0"],
    expectedOutputSha256s: [sha("a")],
    actualOutputSha256s: [sha("a")],
    deterministicTolerance: "0",
    result: "passed",
    executedAt: "2024-12-19T00:00:00Z",
    executedByPrincipalId: principal.validator,
  });
  ledger.recordReproducibilityReceipt(receipt, next(principal.validator));
  const report = createValidationReport({
    schemaVersion: 1,
    validationReportId: uuid(131),
    modelVersionId: bundle.version.modelVersionId,
    modelVersionSha256: bundle.version.manifestSha256,
    validatorPrincipalId: principal.validator,
    conditions: VALIDATION_CHECKS.map((check, index) => ({
      check,
      status: "passed" as const,
      evidenceIds: [evidence[index]?.evidenceId ?? ""],
      rationale: `The ${check} check passed independent review.`,
    })),
    reproducibilityReceiptId: receipt.receiptId,
    conclusion: "validated",
    limitations: ["Evidence supports only the documented population and horizons."],
    completedAt: "2024-12-20T00:00:00Z",
  });
  ledger.recordValidationReport(report, next(principal.validator));
  ledger.recordApproval(
    approval("validation", bundle.version.modelVersionId, bundle.version.manifestSha256, 140),
    next(principal.validator),
  );
  ledger.transition(
    bundle.version.modelVersionId,
    "validated",
    "Independent validation passed.",
    next(),
  );
  if (target === "validated") return { ledger, next, evidence, receipt, report, ...bundle };

  ledger.recordApproval(
    approval("risk_acceptance", bundle.version.modelVersionId, bundle.version.manifestSha256, 141),
    next(principal.risk),
  );
  ledger.recordApproval(
    approval("intended_use", bundle.version.modelVersionId, bundle.version.manifestSha256, 142),
    next(principal.business),
  );
  ledger.recordApproval(
    approval(
      "staging_deployment",
      bundle.version.modelVersionId,
      bundle.version.manifestSha256,
      143,
    ),
    next(principal.deployer),
  );
  ledger.transition(
    bundle.version.modelVersionId,
    "approved",
    "Risk and intended use approved.",
    next(),
  );
  if (target === "approved") return { ledger, next, evidence, receipt, report, ...bundle };

  ledger.recordDeployment(
    {
      schemaVersion: 1,
      deploymentId: uuid(150),
      modelVersionId: bundle.version.modelVersionId,
      modelVersionSha256: bundle.version.manifestSha256,
      modelArtifactSha256: bundle.artifact.manifestSha256,
      environment: "staging",
      approvedPolicySha256: sha("9"),
      deploymentReference: "staging/model/sovereign-hazard/1.0.0",
      rollbackArtifactSha256: sha("a"),
      previousDeploymentId: null,
      deployedAt: "2024-12-21T00:00:00Z",
      deployedByPrincipalId: principal.deployer,
    },
    next(principal.deployer),
  );
  ledger.transition(bundle.version.modelVersionId, "staged", "Staging checks passed.", next());
  if (target === "staged") return { ledger, next, evidence, receipt, report, ...bundle };

  ledger.recordApproval(
    approval(
      "security_privacy_legal",
      bundle.version.modelVersionId,
      bundle.version.manifestSha256,
      144,
    ),
    next(principal.security),
  );
  ledger.recordApproval(
    approval(
      "production_deployment",
      bundle.version.modelVersionId,
      bundle.version.manifestSha256,
      145,
    ),
    next(principal.deployer),
  );
  ledger.recordDeployment(
    {
      schemaVersion: 1,
      deploymentId: uuid(151),
      modelVersionId: bundle.version.modelVersionId,
      modelVersionSha256: bundle.version.manifestSha256,
      modelArtifactSha256: bundle.artifact.manifestSha256,
      environment: "production",
      approvedPolicySha256: sha("9"),
      deploymentReference: "production/model/sovereign-hazard/1.0.0",
      rollbackArtifactSha256: sha("a"),
      previousDeploymentId: null,
      deployedAt: "2024-12-22T00:00:00Z",
      deployedByPrincipalId: principal.deployer,
    },
    next(principal.deployer),
  );
  ledger.transition(
    bundle.version.modelVersionId,
    "production",
    "Production gates passed.",
    next(),
  );
  return { ledger, next, evidence, receipt, report, ...bundle };
}
