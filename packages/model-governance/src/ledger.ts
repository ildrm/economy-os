import {
  createDataManifest,
  createLabelManifest,
  createModelArtifactManifest,
  createModelCard,
  createModelInventory,
  createModelVersion,
  type DataManifest,
  type DataManifestInput,
  type LabelManifest,
  type LabelManifestInput,
  type ModelArtifactManifest,
  type ModelArtifactManifestInput,
  type ModelCard,
  type ModelCardInput,
  type ModelInventory,
  type ModelInventoryInput,
  type ModelVersion,
  type ModelVersionInput,
  type MonitoringThresholdDefinition,
} from "./artifacts.js";
import {
  type Approval,
  type ApprovalInput,
  type ApprovalScope,
  assertClaimAuthorized,
  createApproval,
  createValidationEvidence,
  createValidationReport,
  evaluateApprovalReadiness,
  evaluateProductionReadiness,
  evaluateValidationReadiness,
  type GovernedClaimKind,
  type ReadinessContext,
  type ValidationEvidence,
  type ValidationEvidenceInput,
  type ValidationReport,
  type ValidationReportInput,
} from "./governance.js";
import {
  assertDecimal,
  assertDigest,
  assertEnum,
  assertIsoInstant,
  assertKey,
  assertSchemaVersion,
  assertSemver,
  assertSha256,
  assertText,
  assertUuid,
  canonicalJson,
  cloneCanonical,
  compareDecimal,
  compareInstant,
  deepFreeze,
  digestJson,
  immutableWithDigest,
  unreachable,
} from "./internals.js";
import type {
  Experiment,
  ExperimentInput,
  PeerReview,
  PeerReviewInput,
  ReproducibilityReceipt,
  ReproducibilityReceiptInput,
  ResearchArtifact,
  ResearchArtifactInput,
} from "./research.js";
import {
  createExperiment,
  createPeerReview,
  createReproducibilityReceipt,
  createResearchArtifact,
} from "./research.js";

export const MODEL_LIFECYCLE_STATUSES = [
  "proposed",
  "research",
  "validated",
  "approved",
  "staged",
  "production",
  "restricted",
  "disabled",
  "retired",
] as const;
export type ModelLifecycleStatus = (typeof MODEL_LIFECYCLE_STATUSES)[number];

const ALLOWED_TRANSITIONS: Readonly<Record<ModelLifecycleStatus, readonly ModelLifecycleStatus[]>> =
  {
    proposed: ["research", "retired"],
    research: ["validated", "disabled", "retired"],
    validated: ["research", "approved", "restricted", "disabled", "retired"],
    approved: ["staged", "restricted", "disabled", "retired"],
    staged: ["approved", "production", "restricted", "disabled", "retired"],
    production: ["restricted", "disabled", "retired"],
    restricted: ["staged", "disabled", "retired"],
    disabled: ["staged", "retired"],
    retired: [],
  };

export interface EventMetadata {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly actorPrincipalId: string;
}

export interface DeploymentRecordInput {
  readonly schemaVersion: 1;
  readonly deploymentId: string;
  readonly modelVersionId: string;
  readonly modelVersionSha256: string;
  readonly modelArtifactSha256: string;
  readonly environment: "staging" | "production";
  readonly approvedPolicySha256: string;
  readonly deploymentReference: string;
  readonly rollbackArtifactSha256: string;
  readonly previousDeploymentId: string | null;
  readonly deployedAt: string;
  readonly deployedByPrincipalId: string;
}

export interface DeploymentRecord extends DeploymentRecordInput {
  readonly manifestSha256: string;
}

export interface RollbackRecordInput {
  readonly schemaVersion: 1;
  readonly rollbackId: string;
  readonly failedDeploymentId: string;
  readonly restoredDeploymentId: string;
  readonly reason: string;
  readonly evidenceSha256: string;
  readonly performedAt: string;
  readonly performedByPrincipalId: string;
}

export interface RollbackRecord extends RollbackRecordInput {
  readonly manifestSha256: string;
}

export interface MonitoringObservationInput {
  readonly schemaVersion: 1;
  readonly observationId: string;
  readonly modelVersionId: string;
  readonly thresholdKey: string;
  readonly metricValue: string;
  readonly sourceArtifactSha256: string;
  readonly observedAt: string;
}

export interface MonitoringObservation extends MonitoringObservationInput {
  readonly severity: "normal" | "warning" | "critical";
  readonly consecutiveBreaches: number;
  readonly recommendation: "none" | "review" | "restrict" | "disable";
  readonly manifestSha256: string;
}

export interface MonitoringIncidentInput {
  readonly schemaVersion: 1;
  readonly incidentId: string;
  readonly modelVersionId: string;
  readonly observationIds: readonly string[];
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly status: "open" | "contained" | "resolved";
  readonly recommendation: "none" | "restrict" | "disable";
  readonly summary: string;
  readonly openedAt: string;
  readonly resolvedAt: string | null;
  readonly ownerPrincipalId: string;
}

export interface MonitoringIncident extends MonitoringIncidentInput {
  readonly manifestSha256: string;
}

export interface ForecastRecordInput {
  readonly schemaVersion: 1;
  readonly forecastId: string;
  readonly modelVersionId: string;
  readonly modelVersionSha256: string;
  readonly modelArtifactSha256: string;
  readonly dataSnapshotSha256: string;
  readonly claimKind: Exclude<GovernedClaimKind, "production_ready">;
  readonly outputSemantics: string;
  readonly outputValue: string;
  readonly predictionAsOf: string;
  readonly validFor: string;
  readonly shadowOrChallenger: boolean;
  readonly createdAt: string;
}

export interface ForecastRecord extends ForecastRecordInput {
  readonly manifestSha256: string;
}

export interface ForecastOutcomeInput {
  readonly schemaVersion: 1;
  readonly outcomeId: string;
  readonly forecastId: string;
  readonly actualValue: string;
  readonly observedAt: string;
  readonly availableAt: string;
  readonly sourceSnapshotSha256: string;
}

export interface ForecastOutcome extends ForecastOutcomeInput {
  readonly manifestSha256: string;
}

export interface ForecastScoreInput {
  readonly schemaVersion: 1;
  readonly scoreId: string;
  readonly forecastId: string;
  readonly outcomeId: string;
  readonly metricKey: string;
  readonly metricValue: string;
  readonly scoringMethodSha256: string;
  readonly scoredAt: string;
}

export interface ForecastScore extends ForecastScoreInput {
  readonly manifestSha256: string;
}

export interface RetirementRecordInput {
  readonly schemaVersion: 1;
  readonly retirementId: string;
  readonly modelVersionId: string;
  readonly reason: string;
  readonly replacementModelVersionId: string | null;
  readonly archiveArtifactSha256: string;
  readonly retentionPolicy: string;
  readonly retiredAt: string;
  readonly retiredByPrincipalId: string;
}

export interface RetirementRecord extends RetirementRecordInput {
  readonly manifestSha256: string;
}

export interface RegisteredVersionPayload {
  readonly inventoryId: string;
  readonly version: ModelVersion;
  readonly card: ModelCard;
  readonly artifact: ModelArtifactManifest;
  readonly dataManifest: DataManifest;
  readonly labelManifest: LabelManifest;
}

interface LifecyclePayload {
  readonly modelVersionId: string;
  readonly from: ModelLifecycleStatus;
  readonly to: ModelLifecycleStatus;
  readonly rationale: string;
}

export type GovernanceEventType =
  | "inventory_registered"
  | "version_registered"
  | "approval_recorded"
  | "validation_evidence_recorded"
  | "validation_report_recorded"
  | "reproducibility_receipt_recorded"
  | "experiment_recorded"
  | "research_artifact_recorded"
  | "peer_review_recorded"
  | "lifecycle_transitioned"
  | "deployment_recorded"
  | "rollback_recorded"
  | "monitoring_observation_recorded"
  | "monitoring_incident_recorded"
  | "forecast_recorded"
  | "forecast_outcome_recorded"
  | "forecast_score_recorded"
  | "retirement_recorded";

export type GovernanceEventPayload =
  | ModelInventory
  | RegisteredVersionPayload
  | Approval
  | ValidationEvidence
  | ValidationReport
  | ReproducibilityReceipt
  | Experiment
  | ResearchArtifact
  | PeerReview
  | LifecyclePayload
  | DeploymentRecord
  | RollbackRecord
  | MonitoringObservation
  | MonitoringIncident
  | ForecastRecord
  | ForecastOutcome
  | ForecastScore
  | RetirementRecord;

export interface GovernanceEvent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly actorPrincipalId: string;
  readonly previousEventSha256: string;
  readonly type: GovernanceEventType;
  readonly payload: GovernanceEventPayload;
  readonly eventSha256: string;
}

export interface ModelVersionBundle {
  readonly inventory: ModelInventory;
  readonly version: ModelVersion;
  readonly card: ModelCard;
  readonly artifact: ModelArtifactManifest;
  readonly dataManifest: DataManifest;
  readonly labelManifest: LabelManifest;
  readonly lifecycleStatus: ModelLifecycleStatus;
}

const GENESIS_SHA256 = "0".repeat(64);

function withoutManifestDigest<T extends { readonly manifestSha256: string }>(
  value: T,
): Omit<T, "manifestSha256"> {
  const { manifestSha256: _digest, ...input } = value;
  return input;
}

function createDeployment(input: DeploymentRecordInput): DeploymentRecord {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.deploymentId, "deploymentId");
  assertUuid(input.modelVersionId, "modelVersionId");
  assertSha256(input.modelVersionSha256, "modelVersionSha256");
  assertSha256(input.modelArtifactSha256, "modelArtifactSha256");
  assertEnum(input.environment, ["staging", "production"] as const, "environment");
  assertSha256(input.approvedPolicySha256, "approvedPolicySha256");
  assertText(input.deploymentReference, "deploymentReference", 500);
  assertSha256(input.rollbackArtifactSha256, "rollbackArtifactSha256");
  if (input.previousDeploymentId !== null)
    assertUuid(input.previousDeploymentId, "previousDeploymentId");
  assertIsoInstant(input.deployedAt, "deployedAt");
  assertUuid(input.deployedByPrincipalId, "deployedByPrincipalId");
  return immutableWithDigest(input);
}

function createRollback(input: RollbackRecordInput): RollbackRecord {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.rollbackId, "rollbackId");
  assertUuid(input.failedDeploymentId, "failedDeploymentId");
  assertUuid(input.restoredDeploymentId, "restoredDeploymentId");
  if (input.failedDeploymentId === input.restoredDeploymentId) {
    throw new TypeError("rollback must restore a different deployment");
  }
  assertText(input.reason, "reason");
  assertSha256(input.evidenceSha256, "evidenceSha256");
  assertIsoInstant(input.performedAt, "performedAt");
  assertUuid(input.performedByPrincipalId, "performedByPrincipalId");
  return immutableWithDigest(input);
}

function createIncident(input: MonitoringIncidentInput): MonitoringIncident {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.incidentId, "incidentId");
  assertUuid(input.modelVersionId, "modelVersionId");
  if (input.observationIds.length === 0 || input.observationIds.length > 1_000) {
    throw new TypeError("observationIds must contain 1..1000 entries");
  }
  const observations = new Set<string>();
  for (const observationId of input.observationIds) {
    assertUuid(observationId, "observationId");
    if (observations.has(observationId)) throw new TypeError("observationIds must be unique");
    observations.add(observationId);
  }
  assertEnum(input.severity, ["low", "medium", "high", "critical"] as const, "severity");
  assertEnum(input.status, ["open", "contained", "resolved"] as const, "status");
  assertEnum(input.recommendation, ["none", "restrict", "disable"] as const, "recommendation");
  assertText(input.summary, "summary");
  assertIsoInstant(input.openedAt, "openedAt");
  if ((input.status === "resolved") !== (input.resolvedAt !== null)) {
    throw new TypeError("only resolved incidents must have resolvedAt");
  }
  if (input.resolvedAt !== null) {
    assertIsoInstant(input.resolvedAt, "resolvedAt");
    if (compareInstant(input.openedAt, input.resolvedAt) > 0) {
      throw new TypeError("resolvedAt cannot precede openedAt");
    }
  }
  assertUuid(input.ownerPrincipalId, "ownerPrincipalId");
  return immutableWithDigest(input);
}

function createForecast(input: ForecastRecordInput): ForecastRecord {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.forecastId, "forecastId");
  assertUuid(input.modelVersionId, "modelVersionId");
  assertSha256(input.modelVersionSha256, "modelVersionSha256");
  assertSha256(input.modelArtifactSha256, "modelArtifactSha256");
  assertSha256(input.dataSnapshotSha256, "dataSnapshotSha256");
  assertEnum(
    input.claimKind,
    [
      "descriptive",
      "risk_index",
      "uncalibrated_risk_estimate",
      "calibrated_probability",
      "causal_effect",
    ] as const,
    "claimKind",
  );
  assertText(input.outputSemantics, "outputSemantics");
  assertDecimal(input.outputValue, "outputValue");
  assertIsoInstant(input.predictionAsOf, "predictionAsOf");
  assertText(input.validFor, "validFor", 200);
  assertIsoInstant(input.createdAt, "createdAt");
  if (compareInstant(input.predictionAsOf, input.createdAt) > 0) {
    throw new TypeError("predictionAsOf cannot be after createdAt");
  }
  return immutableWithDigest(input);
}

function createOutcome(input: ForecastOutcomeInput): ForecastOutcome {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.outcomeId, "outcomeId");
  assertUuid(input.forecastId, "forecastId");
  assertDecimal(input.actualValue, "actualValue");
  assertIsoInstant(input.observedAt, "observedAt");
  assertIsoInstant(input.availableAt, "availableAt");
  if (compareInstant(input.observedAt, input.availableAt) > 0) {
    throw new TypeError("outcome observedAt cannot be after availableAt");
  }
  assertSha256(input.sourceSnapshotSha256, "sourceSnapshotSha256");
  return immutableWithDigest(input);
}

function createScore(input: ForecastScoreInput): ForecastScore {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.scoreId, "scoreId");
  assertUuid(input.forecastId, "forecastId");
  assertUuid(input.outcomeId, "outcomeId");
  assertKey(input.metricKey, "metricKey");
  assertDecimal(input.metricValue, "metricValue");
  assertSha256(input.scoringMethodSha256, "scoringMethodSha256");
  assertIsoInstant(input.scoredAt, "scoredAt");
  return immutableWithDigest(input);
}

function createRetirement(input: RetirementRecordInput): RetirementRecord {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.retirementId, "retirementId");
  assertUuid(input.modelVersionId, "modelVersionId");
  assertText(input.reason, "reason");
  if (input.replacementModelVersionId !== null) {
    assertUuid(input.replacementModelVersionId, "replacementModelVersionId");
    if (input.replacementModelVersionId === input.modelVersionId) {
      throw new TypeError("a retired version cannot replace itself");
    }
  }
  assertSha256(input.archiveArtifactSha256, "archiveArtifactSha256");
  assertText(input.retentionPolicy, "retentionPolicy");
  assertIsoInstant(input.retiredAt, "retiredAt");
  assertUuid(input.retiredByPrincipalId, "retiredByPrincipalId");
  return immutableWithDigest(input);
}

function thresholdBreached(
  threshold: MonitoringThresholdDefinition,
  value: string,
  boundary: string,
): boolean {
  const comparison = compareDecimal(value, boundary);
  switch (threshold.operator) {
    case "gt":
      return comparison > 0;
    case "gte":
      return comparison >= 0;
    case "lt":
      return comparison < 0;
    case "lte":
      return comparison <= 0;
    default:
      return unreachable(threshold.operator);
  }
}

function versionParts(version: string): readonly [number, number, number] {
  assertSemver(version, "version");
  const [major = "0", minor = "0", patch = "0"] = version.split("-")[0]?.split(".") ?? [];
  return [Number(major), Number(minor), Number(patch)];
}

function assertChangeClass(parent: ModelVersion, child: ModelVersion): void {
  const [parentMajor, parentMinor, parentPatch] = versionParts(parent.version);
  const [childMajor, childMinor, childPatch] = versionParts(child.version);
  if (
    child.changeClass === "patch" &&
    !(childMajor === parentMajor && childMinor === parentMinor && childPatch > parentPatch)
  ) {
    throw new TypeError("patch change requires an increased patch version only");
  }
  if (child.changeClass === "minor" && !(childMajor === parentMajor && childMinor > parentMinor)) {
    throw new TypeError("minor change requires an increased minor version only");
  }
  if (child.changeClass === "major" && !(childMajor > parentMajor)) {
    throw new TypeError("major change requires an increased major version");
  }
}

function hasUnconditionalApproval(context: ReadinessContext, scope: ApprovalScope): boolean {
  const decisions = context.approvals.filter((approval) => approval.scope === scope);
  return (
    !decisions.some((approval) => approval.decision === "rejected") &&
    decisions.some(
      (approval) => approval.decision === "approved" && approval.conditions.length === 0,
    )
  );
}

export class ModelGovernanceLedger {
  readonly #events: GovernanceEvent[] = [];
  readonly #inventories = new Map<string, ModelInventory>();
  readonly #inventoryKeys = new Set<string>();
  readonly #versions = new Map<string, ModelVersion>();
  readonly #versionNames = new Set<string>();
  readonly #cards = new Map<string, ModelCard>();
  readonly #artifacts = new Map<string, ModelArtifactManifest>();
  readonly #dataManifests = new Map<string, DataManifest>();
  readonly #labelManifests = new Map<string, LabelManifest>();
  readonly #statuses = new Map<string, ModelLifecycleStatus>();
  readonly #approvals = new Map<string, Approval>();
  readonly #evidence = new Map<string, ValidationEvidence>();
  readonly #reports = new Map<string, ValidationReport>();
  readonly #receipts = new Map<string, ReproducibilityReceipt>();
  readonly #experiments = new Map<string, Experiment>();
  readonly #researchArtifacts = new Map<string, ResearchArtifact>();
  readonly #peerReviews = new Map<string, PeerReview>();
  readonly #deployments = new Map<string, DeploymentRecord>();
  readonly #activeDeploymentByEnvironment = new Map<string, string>();
  readonly #rollbacks = new Map<string, RollbackRecord>();
  readonly #monitoring = new Map<string, MonitoringObservation>();
  readonly #incidents = new Map<string, MonitoringIncident>();
  readonly #forecasts = new Map<string, ForecastRecord>();
  readonly #outcomes = new Map<string, ForecastOutcome>();
  readonly #outcomeByForecast = new Map<string, string>();
  readonly #scores = new Map<string, ForecastScore>();
  readonly #scoreKeys = new Set<string>();
  readonly #retirements = new Map<string, RetirementRecord>();
  readonly #eventIds = new Set<string>();

  static replay(events: readonly GovernanceEvent[]): ModelGovernanceLedger {
    const ledger = new ModelGovernanceLedger();
    for (const event of events) ledger.#ingestReplayEvent(event);
    return ledger;
  }

  get events(): readonly GovernanceEvent[] {
    return deepFreeze(cloneCanonical(this.#events));
  }

  get headSha256(): string {
    return this.#events.at(-1)?.eventSha256 ?? GENESIS_SHA256;
  }

  get lifecycleHistory(): readonly GovernanceEvent[] {
    return this.events.filter(
      (event) => event.type === "lifecycle_transitioned" || event.type === "retirement_recorded",
    );
  }

  getInventory(modelId: string): ModelInventory | undefined {
    return this.#inventories.get(modelId);
  }

  getVersionBundle(modelVersionId: string): ModelVersionBundle | undefined {
    const version = this.#versions.get(modelVersionId);
    if (!version) return undefined;
    const inventory = this.#inventories.get(version.modelId);
    const card = this.#cards.get(modelVersionId);
    const artifact = this.#artifacts.get(modelVersionId);
    const dataManifest = this.#dataManifests.get(modelVersionId);
    const labelManifest = this.#labelManifests.get(modelVersionId);
    const lifecycleStatus = this.#statuses.get(modelVersionId);
    if (!inventory || !card || !artifact || !dataManifest || !labelManifest || !lifecycleStatus) {
      throw new TypeError("ledger contains an incomplete version bundle");
    }
    return deepFreeze({
      inventory,
      version,
      card,
      artifact,
      dataManifest,
      labelManifest,
      lifecycleStatus,
    });
  }

  getForecast(forecastId: string): ForecastRecord | undefined {
    return this.#forecasts.get(forecastId);
  }

  getLifecycleStatus(modelVersionId: string): ModelLifecycleStatus | undefined {
    return this.#statuses.get(modelVersionId);
  }

  getExperiments(modelVersionId: string): readonly Experiment[] {
    return deepFreeze(
      [...this.#experiments.values()].filter((item) => item.modelVersionId === modelVersionId),
    );
  }

  getMonitoringObservations(modelVersionId: string): readonly MonitoringObservation[] {
    return deepFreeze(
      [...this.#monitoring.values()].filter((item) => item.modelVersionId === modelVersionId),
    );
  }

  getForecastScores(forecastId: string): readonly ForecastScore[] {
    return deepFreeze([...this.#scores.values()].filter((item) => item.forecastId === forecastId));
  }

  getOutcomeForForecast(forecastId: string): ForecastOutcome | undefined {
    const outcomeId = this.#outcomeByForecast.get(forecastId);
    return outcomeId ? this.#outcomes.get(outcomeId) : undefined;
  }

  getActiveDeployment(
    modelVersionId: string,
    environment: "staging" | "production",
  ): DeploymentRecord | undefined {
    const deploymentId = this.#activeDeploymentByEnvironment.get(
      `${modelVersionId}:${environment}`,
    );
    return deploymentId ? this.#deployments.get(deploymentId) : undefined;
  }

  readinessContext(modelVersionId: string): ReadinessContext {
    const bundle = this.getVersionBundle(modelVersionId);
    if (!bundle) throw new TypeError("unknown model version");
    const reports = [...this.#reports.values()].filter(
      (item) => item.modelVersionId === modelVersionId,
    );
    const report = reports.at(-1) ?? null;
    const receipt = report ? (this.#receipts.get(report.reproducibilityReceiptId) ?? null) : null;
    return deepFreeze({
      inventory: bundle.inventory,
      version: bundle.version,
      card: bundle.card,
      artifact: bundle.artifact,
      dataManifest: bundle.dataManifest,
      labelManifest: bundle.labelManifest,
      report,
      evidence: [...this.#evidence.values()].filter(
        (item) => item.modelVersionId === modelVersionId,
      ),
      receipt,
      approvals: [...this.#approvals.values()].filter(
        (item) => item.modelVersionId === modelVersionId,
      ),
    });
  }

  registerInventory(inventory: ModelInventory, metadata: EventMetadata): GovernanceEvent {
    assertDigest(inventory);
    return this.#append("inventory_registered", inventory, metadata);
  }

  registerVersion(payload: RegisteredVersionPayload, metadata: EventMetadata): GovernanceEvent {
    assertDigest(payload.version);
    assertDigest(payload.card);
    assertDigest(payload.artifact);
    assertDigest(payload.dataManifest);
    assertDigest(payload.labelManifest);
    return this.#append("version_registered", payload, metadata);
  }

  recordApproval(approval: Approval, metadata: EventMetadata): GovernanceEvent {
    assertDigest(approval);
    return this.#append("approval_recorded", approval, metadata);
  }

  recordValidationEvidence(evidence: ValidationEvidence, metadata: EventMetadata): GovernanceEvent {
    assertDigest(evidence);
    return this.#append("validation_evidence_recorded", evidence, metadata);
  }

  recordValidationReport(report: ValidationReport, metadata: EventMetadata): GovernanceEvent {
    assertDigest(report);
    return this.#append("validation_report_recorded", report, metadata);
  }

  recordReproducibilityReceipt(
    receipt: ReproducibilityReceipt,
    metadata: EventMetadata,
  ): GovernanceEvent {
    assertDigest(receipt);
    return this.#append("reproducibility_receipt_recorded", receipt, metadata);
  }

  recordExperiment(experiment: Experiment, metadata: EventMetadata): GovernanceEvent {
    assertDigest(experiment);
    return this.#append("experiment_recorded", experiment, metadata);
  }

  recordResearchArtifact(artifact: ResearchArtifact, metadata: EventMetadata): GovernanceEvent {
    assertDigest(artifact);
    return this.#append("research_artifact_recorded", artifact, metadata);
  }

  recordPeerReview(review: PeerReview, metadata: EventMetadata): GovernanceEvent {
    assertDigest(review);
    return this.#append("peer_review_recorded", review, metadata);
  }

  transition(
    modelVersionId: string,
    to: ModelLifecycleStatus,
    rationale: string,
    metadata: EventMetadata,
  ): GovernanceEvent {
    assertUuid(modelVersionId, "modelVersionId");
    assertEnum(to, MODEL_LIFECYCLE_STATUSES, "to");
    assertText(rationale, "rationale");
    const from = this.#statuses.get(modelVersionId);
    if (!from) throw new TypeError("unknown model version");
    return this.#append(
      "lifecycle_transitioned",
      { modelVersionId, from, to, rationale },
      metadata,
    );
  }

  recordDeployment(input: DeploymentRecordInput, metadata: EventMetadata): GovernanceEvent {
    return this.#append("deployment_recorded", createDeployment(input), metadata);
  }

  recordRollback(input: RollbackRecordInput, metadata: EventMetadata): GovernanceEvent {
    return this.#append("rollback_recorded", createRollback(input), metadata);
  }

  recordMonitoringObservation(
    input: MonitoringObservationInput,
    metadata: EventMetadata,
  ): GovernanceEvent {
    return this.#append(
      "monitoring_observation_recorded",
      this.#deriveMonitoringObservation(input),
      metadata,
    );
  }

  #deriveMonitoringObservation(input: MonitoringObservationInput): MonitoringObservation {
    assertSchemaVersion(input.schemaVersion);
    assertUuid(input.observationId, "observationId");
    assertUuid(input.modelVersionId, "modelVersionId");
    assertKey(input.thresholdKey, "thresholdKey");
    assertDecimal(input.metricValue, "metricValue");
    assertSha256(input.sourceArtifactSha256, "sourceArtifactSha256");
    assertIsoInstant(input.observedAt, "observedAt");
    const card = this.#cards.get(input.modelVersionId);
    if (!card) throw new TypeError("unknown model version");
    const threshold = card.monitoringThresholds.find(
      (item) => item.thresholdKey === input.thresholdKey,
    );
    if (!threshold) throw new TypeError("unknown monitoring threshold");
    const critical = thresholdBreached(threshold, input.metricValue, threshold.criticalValue);
    const warning =
      critical || thresholdBreached(threshold, input.metricValue, threshold.warningValue);
    const preceding = [...this.#monitoring.values()]
      .filter(
        (item) =>
          item.modelVersionId === input.modelVersionId && item.thresholdKey === input.thresholdKey,
      )
      .sort((left, right) => compareInstant(left.observedAt, right.observedAt));
    const last = preceding.at(-1);
    if (last && compareInstant(last.observedAt, input.observedAt) >= 0) {
      throw new TypeError("monitoring observations must be chronological per threshold");
    }
    const consecutiveBreaches = warning
      ? last?.severity === "normal"
        ? 1
        : (last?.consecutiveBreaches ?? 0) + 1
      : 0;
    const severity: MonitoringObservation["severity"] = critical
      ? "critical"
      : warning
        ? "warning"
        : "normal";
    const recommendation: MonitoringObservation["recommendation"] = !warning
      ? "none"
      : consecutiveBreaches < threshold.minimumConsecutiveBreaches
        ? "review"
        : critical
          ? "disable"
          : "restrict";
    const observation = immutableWithDigest({
      ...input,
      severity,
      consecutiveBreaches,
      recommendation,
    });
    return observation;
  }

  recordMonitoringIncident(
    input: MonitoringIncidentInput,
    metadata: EventMetadata,
  ): GovernanceEvent {
    return this.#append("monitoring_incident_recorded", createIncident(input), metadata);
  }

  recordForecast(input: ForecastRecordInput, metadata: EventMetadata): GovernanceEvent {
    const forecast = createForecast(input);
    if (
      input.claimKind === "calibrated_probability" &&
      (compareDecimal(input.outputValue, "0") < 0 || compareDecimal(input.outputValue, "1") > 0)
    ) {
      throw new TypeError("calibrated probability outputValue must be between 0 and 1");
    }
    const context = this.readinessContext(input.modelVersionId);
    const status = this.#statuses.get(input.modelVersionId);
    if (!status) throw new TypeError("unknown model version");
    assertClaimAuthorized(context, status, input.claimKind);
    if (input.shadowOrChallenger && status === "production") {
      // It may run in production infrastructure, but remains explicitly non-operational.
    } else if (!input.shadowOrChallenger && status !== "production") {
      throw new TypeError("operational forecasts require a production model version");
    }
    return this.#append("forecast_recorded", forecast, metadata);
  }

  recordForecastOutcome(input: ForecastOutcomeInput, metadata: EventMetadata): GovernanceEvent {
    return this.#append("forecast_outcome_recorded", createOutcome(input), metadata);
  }

  recordForecastScore(input: ForecastScoreInput, metadata: EventMetadata): GovernanceEvent {
    return this.#append("forecast_score_recorded", createScore(input), metadata);
  }

  retire(input: RetirementRecordInput, metadata: EventMetadata): GovernanceEvent {
    return this.#append("retirement_recorded", createRetirement(input), metadata);
  }

  verifyIntegrity(): void {
    ModelGovernanceLedger.replay(this.#events);
  }

  exportCanonical(): string {
    return canonicalJson(this.#events);
  }

  #append(
    type: GovernanceEventType,
    payload: GovernanceEventPayload,
    metadata: EventMetadata,
  ): GovernanceEvent {
    assertUuid(metadata.eventId, "eventId");
    assertIsoInstant(metadata.occurredAt, "occurredAt");
    assertUuid(metadata.actorPrincipalId, "actorPrincipalId");
    if (this.#eventIds.has(metadata.eventId)) throw new TypeError("eventId already exists");
    const previous = this.#events.at(-1);
    if (previous && compareInstant(previous.occurredAt, metadata.occurredAt) > 0) {
      throw new TypeError("events must be chronological");
    }
    const unsigned = {
      schemaVersion: 1 as const,
      eventId: metadata.eventId,
      sequence: this.#events.length + 1,
      occurredAt: metadata.occurredAt,
      actorPrincipalId: metadata.actorPrincipalId,
      previousEventSha256: previous?.eventSha256 ?? GENESIS_SHA256,
      type,
      payload: cloneCanonical(payload),
    };
    const event = deepFreeze({ ...unsigned, eventSha256: digestJson(unsigned) }) as GovernanceEvent;
    this.#applyEvent(event);
    this.#events.push(event);
    this.#eventIds.add(event.eventId);
    return event;
  }

  #ingestReplayEvent(candidate: GovernanceEvent): void {
    const event = cloneCanonical(candidate);
    assertSchemaVersion(event.schemaVersion);
    assertUuid(event.eventId, "eventId");
    assertIsoInstant(event.occurredAt, "occurredAt");
    assertUuid(event.actorPrincipalId, "actorPrincipalId");
    assertEnum(
      event.type,
      [
        "inventory_registered",
        "version_registered",
        "approval_recorded",
        "validation_evidence_recorded",
        "validation_report_recorded",
        "reproducibility_receipt_recorded",
        "experiment_recorded",
        "research_artifact_recorded",
        "peer_review_recorded",
        "lifecycle_transitioned",
        "deployment_recorded",
        "rollback_recorded",
        "monitoring_observation_recorded",
        "monitoring_incident_recorded",
        "forecast_recorded",
        "forecast_outcome_recorded",
        "forecast_score_recorded",
        "retirement_recorded",
      ] as const,
      "event.type",
    );
    if (event.sequence !== this.#events.length + 1)
      throw new TypeError("event sequence is not contiguous");
    if (this.#eventIds.has(event.eventId)) throw new TypeError("eventId already exists");
    const previous = this.#events.at(-1);
    if (event.previousEventSha256 !== (previous?.eventSha256 ?? GENESIS_SHA256)) {
      throw new TypeError("event hash chain is broken");
    }
    if (previous && compareInstant(previous.occurredAt, event.occurredAt) > 0) {
      throw new TypeError("events are not chronological");
    }
    const { eventSha256, ...unsigned } = event;
    assertSha256(eventSha256, "eventSha256");
    if (digestJson(unsigned) !== eventSha256)
      throw new TypeError("event digest does not match content");
    this.#applyEvent(event);
    const frozen = deepFreeze(event) as GovernanceEvent;
    this.#events.push(frozen);
    this.#eventIds.add(event.eventId);
  }

  #applyEvent(event: GovernanceEvent): void {
    this.#assertEventActor(event);
    switch (event.type) {
      case "inventory_registered":
        this.#applyInventory(event.payload as ModelInventory);
        return;
      case "version_registered":
        this.#applyVersion(event.payload as RegisteredVersionPayload);
        return;
      case "approval_recorded":
        this.#applyApproval(event.payload as Approval);
        return;
      case "validation_evidence_recorded":
        this.#applyEvidence(event.payload as ValidationEvidence);
        return;
      case "validation_report_recorded":
        this.#applyReport(event.payload as ValidationReport);
        return;
      case "reproducibility_receipt_recorded":
        this.#applyReceipt(event.payload as ReproducibilityReceipt);
        return;
      case "experiment_recorded":
        this.#applyExperiment(event.payload as Experiment);
        return;
      case "research_artifact_recorded":
        this.#applyResearchArtifact(event.payload as ResearchArtifact);
        return;
      case "peer_review_recorded":
        this.#applyPeerReview(event.payload as PeerReview);
        return;
      case "lifecycle_transitioned":
        this.#applyTransition(event.payload as LifecyclePayload);
        return;
      case "deployment_recorded":
        this.#applyDeployment(event.payload as DeploymentRecord);
        return;
      case "rollback_recorded":
        this.#applyRollback(event.payload as RollbackRecord);
        return;
      case "monitoring_observation_recorded":
        this.#applyMonitoring(event.payload as MonitoringObservation);
        return;
      case "monitoring_incident_recorded":
        this.#applyIncident(event.payload as MonitoringIncident);
        return;
      case "forecast_recorded":
        this.#applyForecast(event.payload as ForecastRecord);
        return;
      case "forecast_outcome_recorded":
        this.#applyOutcome(event.payload as ForecastOutcome);
        return;
      case "forecast_score_recorded":
        this.#applyScore(event.payload as ForecastScore);
        return;
      case "retirement_recorded":
        this.#applyRetirement(event.payload as RetirementRecord);
        return;
      default:
        unreachable(event.type);
    }
  }

  #assertEventActor(event: GovernanceEvent): void {
    let expected: string | undefined;
    switch (event.type) {
      case "approval_recorded":
        expected = (event.payload as Approval).principalId;
        break;
      case "validation_evidence_recorded":
        expected = (event.payload as ValidationEvidence).performedByPrincipalId;
        break;
      case "validation_report_recorded":
        expected = (event.payload as ValidationReport).validatorPrincipalId;
        break;
      case "reproducibility_receipt_recorded":
        expected = (event.payload as ReproducibilityReceipt).executedByPrincipalId;
        break;
      case "experiment_recorded":
        expected = (event.payload as Experiment).runByPrincipalId;
        break;
      case "peer_review_recorded":
        expected = (event.payload as PeerReview).reviewerPrincipalId;
        break;
      case "deployment_recorded":
        expected = (event.payload as DeploymentRecord).deployedByPrincipalId;
        break;
      case "rollback_recorded":
        expected = (event.payload as RollbackRecord).performedByPrincipalId;
        break;
      case "retirement_recorded":
        expected = (event.payload as RetirementRecord).retiredByPrincipalId;
        break;
      case "research_artifact_recorded":
        if (
          !(event.payload as ResearchArtifact).authorPrincipalIds.includes(event.actorPrincipalId)
        ) {
          throw new TypeError("research artifact event actor must be one of its authors");
        }
        return;
      default:
        return;
    }
    if (event.actorPrincipalId !== expected) {
      throw new TypeError("event actor does not match the accountable record principal");
    }
  }

  #applyInventory(inventory: ModelInventory): void {
    assertDigest(inventory);
    createModelInventory(withoutManifestDigest(inventory) as ModelInventoryInput);
    if (this.#inventories.has(inventory.modelId)) throw new TypeError("modelId already exists");
    if (this.#inventoryKeys.has(inventory.modelKey)) throw new TypeError("modelKey already exists");
    this.#inventories.set(inventory.modelId, deepFreeze(inventory));
    this.#inventoryKeys.add(inventory.modelKey);
  }

  #applyVersion(payload: RegisteredVersionPayload): void {
    const { version, card, artifact, dataManifest, labelManifest } = payload;
    for (const manifest of [version, card, artifact, dataManifest, labelManifest])
      assertDigest(manifest);
    createModelVersion(withoutManifestDigest(version) as ModelVersionInput);
    createModelCard(withoutManifestDigest(card) as ModelCardInput);
    createModelArtifactManifest(withoutManifestDigest(artifact) as ModelArtifactManifestInput);
    createDataManifest(withoutManifestDigest(dataManifest) as DataManifestInput);
    createLabelManifest(withoutManifestDigest(labelManifest) as LabelManifestInput);
    const inventory = this.#inventories.get(payload.inventoryId);
    if (!inventory || version.modelId !== inventory.modelId)
      throw new TypeError("unknown or mismatched inventory");
    if (this.#versions.has(version.modelVersionId))
      throw new TypeError("modelVersionId already exists");
    const versionIdentity = `${version.modelId}:${version.version}`;
    if (this.#versionNames.has(versionIdentity))
      throw new TypeError("model semantic version already exists");
    if (
      card.modelId !== version.modelId ||
      card.modelVersion !== version.version ||
      card.manifestSha256 !== version.modelCardSha256
    ) {
      throw new TypeError("model card does not bind to version");
    }
    if (
      artifact.modelId !== version.modelId ||
      artifact.modelVersion !== version.version ||
      artifact.manifestSha256 !== version.artifactManifestSha256
    ) {
      throw new TypeError("model artifact does not bind to version");
    }
    if (dataManifest.manifestSha256 !== version.dataManifestSha256) {
      throw new TypeError("data manifest does not bind to version");
    }
    if (
      labelManifest.manifestSha256 !== version.labelManifestSha256 ||
      artifact.labelManifestSha256 !== labelManifest.manifestSha256
    ) {
      throw new TypeError("label manifest does not bind to version/artifact");
    }
    if (artifact.orderedFeatureKeys.join("\u0000") !== card.orderedFeatureKeys.join("\u0000")) {
      throw new TypeError("artifact and card ordered features differ");
    }
    if (inventory.requiredFeatureKeys.some((key) => !card.orderedFeatureKeys.includes(key))) {
      throw new TypeError("model card omits an inventory-required feature");
    }
    if (
      inventory.requiredDatasetKeys.some(
        (key) => !dataManifest.snapshots.some((item) => item.datasetKey === key),
      )
    ) {
      throw new TypeError("data manifest omits an inventory-required dataset");
    }
    for (const [field, createdAt] of [
      ["inventory", inventory.createdAt],
      ["data manifest", dataManifest.createdAt],
      ["label manifest", labelManifest.frozenAt],
      ["model card", card.createdAt],
      ["artifact manifest", artifact.createdAt],
    ] as const) {
      if (compareInstant(createdAt, version.createdAt) > 0) {
        throw new TypeError(`${field} cannot be created after the model version`);
      }
    }
    if (version.parentModelVersionId === null) {
      if ([...this.#versions.values()].some((item) => item.modelId === version.modelId)) {
        throw new TypeError("later model versions require a parent");
      }
      if (version.changeClass !== "major")
        throw new TypeError("initial version must be a major change");
    } else {
      const parent = this.#versions.get(version.parentModelVersionId);
      if (!parent || parent.modelId !== version.modelId)
        throw new TypeError("parent model version is invalid");
      assertChangeClass(parent, version);
    }
    this.#versions.set(version.modelVersionId, deepFreeze(version));
    this.#versionNames.add(versionIdentity);
    this.#cards.set(version.modelVersionId, deepFreeze(card));
    this.#artifacts.set(version.modelVersionId, deepFreeze(artifact));
    this.#dataManifests.set(version.modelVersionId, deepFreeze(dataManifest));
    this.#labelManifests.set(version.modelVersionId, deepFreeze(labelManifest));
    this.#statuses.set(version.modelVersionId, "proposed");
  }

  #assertVersionExists(modelVersionId: string): void {
    if (!this.#versions.has(modelVersionId)) throw new TypeError("unknown model version");
  }

  #applyApproval(approval: Approval): void {
    assertDigest(approval);
    createApproval(withoutManifestDigest(approval) as ApprovalInput);
    this.#assertVersionExists(approval.modelVersionId);
    const version = this.#versions.get(approval.modelVersionId);
    if (approval.subjectSha256 !== version?.manifestSha256) {
      throw new TypeError("approval subject does not match model version");
    }
    if (this.#approvals.has(approval.approvalId)) throw new TypeError("approvalId already exists");
    const duplicate = [...this.#approvals.values()].some(
      (item) =>
        item.modelVersionId === approval.modelVersionId &&
        item.scope === approval.scope &&
        item.principalId === approval.principalId,
    );
    if (duplicate)
      throw new TypeError(
        "approval decision is append-only; create a new principal decision scope",
      );
    this.#approvals.set(approval.approvalId, deepFreeze(approval));
  }

  #applyEvidence(evidence: ValidationEvidence): void {
    assertDigest(evidence);
    createValidationEvidence(withoutManifestDigest(evidence) as ValidationEvidenceInput);
    this.#assertVersionExists(evidence.modelVersionId);
    if (this.#evidence.has(evidence.evidenceId)) throw new TypeError("evidenceId already exists");
    this.#evidence.set(evidence.evidenceId, deepFreeze(evidence));
  }

  #applyReport(report: ValidationReport): void {
    assertDigest(report);
    createValidationReport(withoutManifestDigest(report) as ValidationReportInput);
    this.#assertVersionExists(report.modelVersionId);
    const version = this.#versions.get(report.modelVersionId);
    if (report.modelVersionSha256 !== version?.manifestSha256)
      throw new TypeError("validation report version mismatch");
    if (this.#reports.has(report.validationReportId))
      throw new TypeError("validationReportId already exists");
    for (const condition of report.conditions) {
      for (const evidenceId of condition.evidenceIds) {
        const evidence = this.#evidence.get(evidenceId);
        if (
          !evidence ||
          evidence.modelVersionId !== report.modelVersionId ||
          evidence.check !== condition.check
        ) {
          throw new TypeError("validation report cites missing or mismatched evidence");
        }
      }
    }
    this.#reports.set(report.validationReportId, deepFreeze(report));
  }

  #applyReceipt(receipt: ReproducibilityReceipt): void {
    assertDigest(receipt);
    createReproducibilityReceipt(withoutManifestDigest(receipt) as ReproducibilityReceiptInput);
    if (this.#receipts.has(receipt.receiptId)) throw new TypeError("receiptId already exists");
    if (receipt.subjectType === "model_version") this.#assertVersionExists(receipt.subjectId);
    else if (receipt.subjectType === "experiment" && !this.#experiments.has(receipt.subjectId)) {
      throw new TypeError("receipt refers to an unknown experiment");
    } else if (receipt.subjectType === "validation" && !this.#reports.has(receipt.subjectId)) {
      throw new TypeError("receipt refers to an unknown validation report");
    } else if (
      receipt.subjectType === "research_artifact" &&
      !this.#researchArtifacts.has(receipt.subjectId)
    ) {
      throw new TypeError("receipt refers to an unknown research artifact");
    }
    this.#receipts.set(receipt.receiptId, deepFreeze(receipt));
  }

  #applyExperiment(experiment: Experiment): void {
    assertDigest(experiment);
    createExperiment(withoutManifestDigest(experiment) as ExperimentInput);
    this.#assertVersionExists(experiment.modelVersionId);
    if (this.#experiments.has(experiment.experimentId))
      throw new TypeError("experimentId already exists");
    if (
      experiment.replacesExperimentId !== null &&
      !this.#experiments.has(experiment.replacesExperimentId)
    ) {
      throw new TypeError("replacement experiment refers to an unknown prior experiment");
    }
    this.#experiments.set(experiment.experimentId, deepFreeze(experiment));
  }

  #applyResearchArtifact(artifact: ResearchArtifact): void {
    assertDigest(artifact);
    createResearchArtifact(withoutManifestDigest(artifact) as ResearchArtifactInput);
    this.#assertVersionExists(artifact.modelVersionId);
    if (this.#researchArtifacts.has(artifact.researchArtifactId)) {
      throw new TypeError("researchArtifactId already exists");
    }
    this.#researchArtifacts.set(artifact.researchArtifactId, deepFreeze(artifact));
  }

  #applyPeerReview(review: PeerReview): void {
    assertDigest(review);
    createPeerReview(withoutManifestDigest(review) as PeerReviewInput);
    if (this.#peerReviews.has(review.peerReviewId))
      throw new TypeError("peerReviewId already exists");
    const artifact = this.#researchArtifacts.get(review.researchArtifactId);
    if (
      !artifact ||
      artifact.manifestSha256 !== review.researchArtifactSha256 ||
      artifact.authorPrincipalIds.join("\u0000") !== review.authorPrincipalIds.join("\u0000")
    ) {
      throw new TypeError("peer review does not bind to the recorded research artifact");
    }
    this.#peerReviews.set(review.peerReviewId, deepFreeze(review));
  }

  #applyTransition(payload: LifecyclePayload): void {
    assertUuid(payload.modelVersionId, "modelVersionId");
    assertEnum(payload.from, MODEL_LIFECYCLE_STATUSES, "from");
    assertEnum(payload.to, MODEL_LIFECYCLE_STATUSES, "to");
    assertText(payload.rationale, "rationale");
    const current = this.#statuses.get(payload.modelVersionId);
    if (!current || current !== payload.from)
      throw new TypeError("lifecycle transition has a stale source state");
    if (!ALLOWED_TRANSITIONS[current].includes(payload.to)) {
      throw new TypeError(`lifecycle transition ${current} -> ${payload.to} is not allowed`);
    }
    if (payload.to === "retired") {
      throw new TypeError("retirement requires an immutable retirement record and owner approval");
    }
    if (
      payload.to === "validated" &&
      !evaluateValidationReadiness(this.readinessContext(payload.modelVersionId)).ready
    ) {
      throw new TypeError("validation readiness gate failed");
    }
    if (
      payload.to === "approved" &&
      !evaluateApprovalReadiness(this.readinessContext(payload.modelVersionId)).ready
    ) {
      throw new TypeError("approval readiness gate failed");
    }
    if (payload.to === "staged") {
      const context = this.readinessContext(payload.modelVersionId);
      if (!evaluateApprovalReadiness(context).ready)
        throw new TypeError("staging readiness gate failed");
      const stagingApproval = hasUnconditionalApproval(context, "staging_deployment");
      if (!stagingApproval) throw new TypeError("staging deployment approval is missing");
      if (!this.getActiveDeployment(payload.modelVersionId, "staging")) {
        throw new TypeError("staging deployment evidence is missing");
      }
      if (current === "disabled") {
        const reEnable = hasUnconditionalApproval(context, "re_enable");
        if (!reEnable) throw new TypeError("re-enable approval is missing");
      }
    }
    if (payload.to === "production") {
      if (!evaluateProductionReadiness(this.readinessContext(payload.modelVersionId)).ready) {
        throw new TypeError("production readiness gate failed");
      }
      if (!this.getActiveDeployment(payload.modelVersionId, "production")) {
        throw new TypeError("production deployment evidence is missing");
      }
    }
    this.#statuses.set(payload.modelVersionId, payload.to);
  }

  #applyDeployment(deployment: DeploymentRecord): void {
    assertDigest(deployment);
    createDeployment(withoutManifestDigest(deployment) as DeploymentRecordInput);
    this.#assertVersionExists(deployment.modelVersionId);
    if (this.#deployments.has(deployment.deploymentId))
      throw new TypeError("deploymentId already exists");
    const version = this.#versions.get(deployment.modelVersionId);
    const artifact = this.#artifacts.get(deployment.modelVersionId);
    if (
      deployment.modelVersionSha256 !== version?.manifestSha256 ||
      deployment.modelArtifactSha256 !== artifact?.manifestSha256
    ) {
      throw new TypeError("deployment does not bind to the recorded model version/artifact");
    }
    const state = this.#statuses.get(deployment.modelVersionId);
    if (
      deployment.environment === "staging" &&
      !["approved", "staged", "restricted", "disabled"].includes(state ?? "")
    ) {
      throw new TypeError("staging deployment requires an approved or recoverable model state");
    }
    if (deployment.environment === "production" && state !== "staged" && state !== "production") {
      throw new TypeError("production deployment requires staged/production state");
    }
    const key = `${deployment.modelVersionId}:${deployment.environment}`;
    const active = this.#activeDeploymentByEnvironment.get(key) ?? null;
    if (deployment.previousDeploymentId !== active) {
      throw new TypeError("previousDeploymentId must match the active environment deployment");
    }
    this.#deployments.set(deployment.deploymentId, deepFreeze(deployment));
    this.#activeDeploymentByEnvironment.set(key, deployment.deploymentId);
  }

  #applyRollback(rollback: RollbackRecord): void {
    assertDigest(rollback);
    createRollback(withoutManifestDigest(rollback) as RollbackRecordInput);
    if (this.#rollbacks.has(rollback.rollbackId)) throw new TypeError("rollbackId already exists");
    const failed = this.#deployments.get(rollback.failedDeploymentId);
    const restored = this.#deployments.get(rollback.restoredDeploymentId);
    if (
      !failed ||
      !restored ||
      failed.modelVersionId !== restored.modelVersionId ||
      failed.environment !== restored.environment
    ) {
      throw new TypeError("rollback deployments must exist in the same version/environment");
    }
    const key = `${failed.modelVersionId}:${failed.environment}`;
    if (this.#activeDeploymentByEnvironment.get(key) !== failed.deploymentId) {
      throw new TypeError("rollback failedDeploymentId is not active");
    }
    this.#rollbacks.set(rollback.rollbackId, deepFreeze(rollback));
    this.#activeDeploymentByEnvironment.set(key, restored.deploymentId);
  }

  #applyMonitoring(observation: MonitoringObservation): void {
    assertDigest(observation);
    this.#assertVersionExists(observation.modelVersionId);
    if (this.#monitoring.has(observation.observationId))
      throw new TypeError("observationId already exists");
    const {
      manifestSha256: _manifestSha256,
      severity: _severity,
      consecutiveBreaches: _consecutiveBreaches,
      recommendation: _recommendation,
      ...input
    } = observation;
    const recomputed = this.#deriveMonitoringObservation(input);
    if (recomputed.manifestSha256 !== observation.manifestSha256) {
      throw new TypeError("monitoring observation derivation does not match its threshold history");
    }
    this.#monitoring.set(observation.observationId, deepFreeze(observation));
  }

  #applyIncident(incident: MonitoringIncident): void {
    assertDigest(incident);
    createIncident(withoutManifestDigest(incident) as MonitoringIncidentInput);
    this.#assertVersionExists(incident.modelVersionId);
    if (this.#incidents.has(incident.incidentId)) throw new TypeError("incidentId already exists");
    for (const observationId of incident.observationIds) {
      const observation = this.#monitoring.get(observationId);
      if (!observation || observation.modelVersionId !== incident.modelVersionId) {
        throw new TypeError("incident cites missing or mismatched monitoring observation");
      }
    }
    if (
      incident.recommendation === "disable" &&
      !incident.observationIds.some((id) => this.#monitoring.get(id)?.recommendation === "disable")
    ) {
      throw new TypeError("disable incident recommendation needs a matching critical observation");
    }
    this.#incidents.set(incident.incidentId, deepFreeze(incident));
  }

  #applyForecast(forecast: ForecastRecord): void {
    assertDigest(forecast);
    createForecast(withoutManifestDigest(forecast) as ForecastRecordInput);
    this.#assertVersionExists(forecast.modelVersionId);
    if (this.#forecasts.has(forecast.forecastId)) {
      throw new TypeError("forecastId already exists; forecasts cannot be rewritten");
    }
    const version = this.#versions.get(forecast.modelVersionId);
    const artifact = this.#artifacts.get(forecast.modelVersionId);
    if (
      forecast.modelVersionSha256 !== version?.manifestSha256 ||
      forecast.modelArtifactSha256 !== artifact?.manifestSha256
    ) {
      throw new TypeError("forecast does not bind to recorded model version/artifact");
    }
    this.#forecasts.set(forecast.forecastId, deepFreeze(forecast));
  }

  #applyOutcome(outcome: ForecastOutcome): void {
    assertDigest(outcome);
    createOutcome(withoutManifestDigest(outcome) as ForecastOutcomeInput);
    const forecast = this.#forecasts.get(outcome.forecastId);
    if (!forecast) throw new TypeError("forecast outcome refers to unknown forecast");
    if (compareInstant(forecast.createdAt, outcome.availableAt) > 0) {
      throw new TypeError(
        "forecast outcome cannot have been available before the forecast was created",
      );
    }
    if (this.#outcomes.has(outcome.outcomeId) || this.#outcomeByForecast.has(outcome.forecastId)) {
      throw new TypeError("forecast outcome already exists and cannot be rewritten");
    }
    this.#outcomes.set(outcome.outcomeId, deepFreeze(outcome));
    this.#outcomeByForecast.set(outcome.forecastId, outcome.outcomeId);
  }

  #applyScore(score: ForecastScore): void {
    assertDigest(score);
    createScore(withoutManifestDigest(score) as ForecastScoreInput);
    const outcome = this.#outcomes.get(score.outcomeId);
    if (
      !this.#forecasts.has(score.forecastId) ||
      !outcome ||
      outcome.forecastId !== score.forecastId
    ) {
      throw new TypeError("forecast score refers to missing or mismatched forecast/outcome");
    }
    if (compareInstant(outcome.availableAt, score.scoredAt) > 0) {
      throw new TypeError("forecast score cannot predate outcome availability");
    }
    if (this.#scores.has(score.scoreId)) throw new TypeError("scoreId already exists");
    const key = `${score.forecastId}:${score.outcomeId}:${score.metricKey}`;
    if (this.#scoreKeys.has(key)) throw new TypeError("forecast metric score already exists");
    this.#scores.set(score.scoreId, deepFreeze(score));
    this.#scoreKeys.add(key);
  }

  #applyRetirement(retirement: RetirementRecord): void {
    assertDigest(retirement);
    createRetirement(withoutManifestDigest(retirement) as RetirementRecordInput);
    this.#assertVersionExists(retirement.modelVersionId);
    if (this.#retirements.has(retirement.retirementId))
      throw new TypeError("retirementId already exists");
    const state = this.#statuses.get(retirement.modelVersionId);
    if (!state || !ALLOWED_TRANSITIONS[state].includes("retired")) {
      throw new TypeError("model version cannot be retired from its current state");
    }
    const context = this.readinessContext(retirement.modelVersionId);
    const retirementApproval =
      hasUnconditionalApproval(context, "retirement") &&
      context.approvals.some(
        (approval) =>
          approval.scope === "retirement" &&
          approval.decision === "approved" &&
          approval.conditions.length === 0 &&
          approval.principalId === context.inventory.ownerPrincipalId &&
          approval.principalId === retirement.retiredByPrincipalId,
      );
    if (!retirementApproval) throw new TypeError("retirement requires model-owner approval");
    if (retirement.replacementModelVersionId !== null)
      this.#assertVersionExists(retirement.replacementModelVersionId);
    this.#retirements.set(retirement.retirementId, deepFreeze(retirement));
    this.#statuses.set(retirement.modelVersionId, "retired");
  }
}
