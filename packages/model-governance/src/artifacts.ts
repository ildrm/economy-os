import {
  assertDecimal,
  assertEnum,
  assertIsoInstant,
  assertKey,
  assertKeys,
  assertSchemaVersion,
  assertSemver,
  assertSha256,
  assertText,
  assertTexts,
  assertUuid,
  compareDecimal,
  compareInstant,
  immutableWithDigest,
} from "./internals.js";

export const MODEL_RISK_TIERS = ["low", "medium", "high", "critical"] as const;
export type ModelRiskTier = (typeof MODEL_RISK_TIERS)[number];

export const MODEL_IMPACT_TIERS = ["minimal", "limited", "high", "systemic"] as const;
export type ModelImpactTier = (typeof MODEL_IMPACT_TIERS)[number];

export const CHANGE_CLASSES = ["patch", "minor", "major"] as const;
export type ChangeClass = (typeof CHANGE_CLASSES)[number];

export const CAUSAL_CLASSIFICATIONS = [
  "descriptive",
  "predictive",
  "causal_hypothesis",
  "causal_estimate",
] as const;
export type CausalClassification = (typeof CAUSAL_CLASSIFICATIONS)[number];

export interface ModelInventoryInput {
  readonly schemaVersion: 1;
  readonly modelId: string;
  readonly modelKey: string;
  readonly name: string;
  readonly ownerPrincipalId: string;
  readonly businessOwnerPrincipalId: string;
  readonly purpose: string;
  readonly intendedUsers: readonly string[];
  readonly supportedDecisions: readonly string[];
  readonly targetOrEstimand: string;
  readonly entityPopulation: string;
  readonly horizons: readonly string[];
  readonly outputSemantics: string;
  readonly modelFamily: string;
  readonly requiredFeatureKeys: readonly string[];
  readonly requiredDatasetKeys: readonly string[];
  readonly assumptions: readonly string[];
  readonly knownLimitations: readonly string[];
  readonly prohibitedUses: readonly string[];
  readonly legalLanguage: string;
  readonly causalClassification: CausalClassification;
  readonly riskTier: ModelRiskTier;
  readonly impactTier: ModelImpactTier;
  readonly validationCadenceDays: number;
  readonly createdAt: string;
}

export interface ModelInventory extends ModelInventoryInput {
  readonly manifestSha256: string;
}

export function createModelInventory(input: ModelInventoryInput): ModelInventory {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.modelId, "modelId");
  assertKey(input.modelKey, "modelKey");
  assertText(input.name, "name", 200);
  assertUuid(input.ownerPrincipalId, "ownerPrincipalId");
  assertUuid(input.businessOwnerPrincipalId, "businessOwnerPrincipalId");
  assertText(input.purpose, "purpose");
  assertTexts(input.intendedUsers, "intendedUsers");
  assertTexts(input.supportedDecisions, "supportedDecisions");
  assertText(input.targetOrEstimand, "targetOrEstimand");
  assertText(input.entityPopulation, "entityPopulation");
  assertTexts(input.horizons, "horizons");
  assertText(input.outputSemantics, "outputSemantics");
  assertText(input.modelFamily, "modelFamily", 200);
  assertKeys(input.requiredFeatureKeys, "requiredFeatureKeys");
  assertKeys(input.requiredDatasetKeys, "requiredDatasetKeys");
  assertTexts(input.assumptions, "assumptions");
  assertTexts(input.knownLimitations, "knownLimitations");
  assertTexts(input.prohibitedUses, "prohibitedUses");
  assertText(input.legalLanguage, "legalLanguage");
  assertEnum(input.causalClassification, CAUSAL_CLASSIFICATIONS, "causalClassification");
  assertEnum(input.riskTier, MODEL_RISK_TIERS, "riskTier");
  assertEnum(input.impactTier, MODEL_IMPACT_TIERS, "impactTier");
  if (
    !Number.isSafeInteger(input.validationCadenceDays) ||
    input.validationCadenceDays < 1 ||
    input.validationCadenceDays > 3_650
  ) {
    throw new TypeError("validationCadenceDays must be an integer between 1 and 3650");
  }
  assertIsoInstant(input.createdAt, "createdAt");
  return immutableWithDigest(input);
}

export interface DatasetSnapshot {
  readonly datasetKey: string;
  readonly snapshotId: string;
  readonly snapshotSha256: string;
  readonly sourceLicenseId: string;
  readonly observedThrough: string;
  readonly availableAt: string;
  readonly rowCount: number;
  readonly pointInTimeGrade: "verified" | "bounded" | "unverified";
}

export interface DataManifestInput {
  readonly schemaVersion: 1;
  readonly dataManifestId: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly snapshots: readonly DatasetSnapshot[];
  readonly featureSnapshotSha256: string;
  readonly preprocessingFitScope: "inside_each_fold" | "fixed_prior";
  readonly imputationFitScope: "inside_each_fold" | "none";
  readonly sourceDisagreementPolicy: string;
}

export interface DataManifest extends DataManifestInput {
  readonly manifestSha256: string;
}

export function createDataManifest(input: DataManifestInput): DataManifest {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.dataManifestId, "dataManifestId");
  assertIsoInstant(input.createdAt, "createdAt");
  assertUuid(input.createdBy, "createdBy");
  if (input.snapshots.length === 0 || input.snapshots.length > 500) {
    throw new TypeError("snapshots must contain 1..500 entries");
  }
  const seen = new Set<string>();
  for (const [index, snapshot] of input.snapshots.entries()) {
    assertKey(snapshot.datasetKey, `snapshots[${index}].datasetKey`);
    assertUuid(snapshot.snapshotId, `snapshots[${index}].snapshotId`);
    assertSha256(snapshot.snapshotSha256, `snapshots[${index}].snapshotSha256`);
    assertKey(snapshot.sourceLicenseId, `snapshots[${index}].sourceLicenseId`);
    assertIsoInstant(snapshot.observedThrough, `snapshots[${index}].observedThrough`);
    assertIsoInstant(snapshot.availableAt, `snapshots[${index}].availableAt`);
    if (compareInstant(snapshot.observedThrough, snapshot.availableAt) > 0) {
      throw new TypeError("snapshot observedThrough cannot be after availableAt");
    }
    if (!Number.isSafeInteger(snapshot.rowCount) || snapshot.rowCount < 1) {
      throw new TypeError("snapshot rowCount must be a positive integer");
    }
    assertEnum(
      snapshot.pointInTimeGrade,
      ["verified", "bounded", "unverified"] as const,
      `snapshots[${index}].pointInTimeGrade`,
    );
    if (seen.has(snapshot.datasetKey)) throw new TypeError("datasetKey must be unique");
    seen.add(snapshot.datasetKey);
  }
  assertSha256(input.featureSnapshotSha256, "featureSnapshotSha256");
  assertEnum(
    input.preprocessingFitScope,
    ["inside_each_fold", "fixed_prior"] as const,
    "preprocessingFitScope",
  );
  assertEnum(input.imputationFitScope, ["inside_each_fold", "none"] as const, "imputationFitScope");
  assertText(input.sourceDisagreementPolicy, "sourceDisagreementPolicy");
  return immutableWithDigest(input);
}

export interface LabelDefinition {
  readonly labelKey: string;
  readonly definition: string;
  readonly horizon: string;
  readonly onsetRule: string;
  readonly ambiguityPolicy: string;
  readonly positiveCount: number;
  readonly totalCount: number;
}

export interface LabelManifestInput {
  readonly schemaVersion: 1;
  readonly labelManifestId: string;
  readonly taxonomyVersion: string;
  readonly frozenAt: string;
  readonly labelsSnapshotSha256: string;
  readonly labels: readonly LabelDefinition[];
}

export interface LabelManifest extends LabelManifestInput {
  readonly manifestSha256: string;
}

export function createLabelManifest(input: LabelManifestInput): LabelManifest {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.labelManifestId, "labelManifestId");
  assertSemver(input.taxonomyVersion, "taxonomyVersion");
  assertIsoInstant(input.frozenAt, "frozenAt");
  assertSha256(input.labelsSnapshotSha256, "labelsSnapshotSha256");
  if (input.labels.length === 0 || input.labels.length > 100) {
    throw new TypeError("labels must contain 1..100 entries");
  }
  const seen = new Set<string>();
  for (const [index, label] of input.labels.entries()) {
    assertKey(label.labelKey, `labels[${index}].labelKey`);
    assertText(label.definition, `labels[${index}].definition`);
    assertText(label.horizon, `labels[${index}].horizon`, 200);
    assertText(label.onsetRule, `labels[${index}].onsetRule`);
    assertText(label.ambiguityPolicy, `labels[${index}].ambiguityPolicy`);
    if (
      !Number.isSafeInteger(label.positiveCount) ||
      !Number.isSafeInteger(label.totalCount) ||
      label.positiveCount < 0 ||
      label.totalCount < 1 ||
      label.positiveCount > label.totalCount
    ) {
      throw new TypeError("label counts must be valid integers with positives <= total");
    }
    if (seen.has(label.labelKey)) throw new TypeError("labelKey must be unique");
    seen.add(label.labelKey);
  }
  return immutableWithDigest(input);
}

export type EvidenceOrigin =
  | "empirical_observed"
  | "method_audit"
  | "operational_test"
  | "synthetic"
  | "demo";

export interface ModelMetric {
  readonly metricKey: string;
  readonly value: string;
  readonly evaluationSlice: string;
  readonly evidenceOrigin: EvidenceOrigin;
  readonly presentedAsEmpirical: boolean;
  readonly evidenceId: string;
}

export interface MonitoringThresholdDefinition {
  readonly thresholdKey: string;
  readonly metricKey: string;
  readonly operator: "gt" | "gte" | "lt" | "lte";
  readonly warningValue: string;
  readonly criticalValue: string;
  readonly minimumConsecutiveBreaches: number;
}

export interface ModelCardInput {
  readonly schemaVersion: 1;
  readonly modelCardId: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly ownerPrincipalId: string;
  readonly purpose: string;
  readonly target: string;
  readonly trainingPeriods: readonly { readonly start: string; readonly end: string }[];
  readonly orderedFeatureKeys: readonly string[];
  readonly pointInTimeGrade: "verified" | "bounded" | "unverified";
  readonly preprocessing: string;
  readonly method: string;
  readonly hyperparametersOrPriors: Readonly<Record<string, string>>;
  readonly uncertaintyComponents: readonly string[];
  readonly validationDesign: string;
  readonly metrics: readonly ModelMetric[];
  readonly subgroupAndRegimePerformance: string;
  readonly robustness: string;
  readonly fairnessAndConsequences: string;
  readonly outOfDomainRules: readonly string[];
  readonly monitoringThresholds: readonly MonitoringThresholdDefinition[];
  readonly retrainingPolicy: string;
  readonly limitations: readonly string[];
  readonly prohibitedUses: readonly string[];
  readonly temporalTarget: boolean;
  readonly claimsCalibratedProbability: boolean;
  readonly claimsCausalEffect: boolean;
  readonly minimumCalibrationEventCount: number;
  readonly createdAt: string;
}

export interface ModelCard extends ModelCardInput {
  readonly manifestSha256: string;
}

function assertMetrics(metrics: readonly ModelMetric[]): void {
  if (metrics.length === 0 || metrics.length > 500)
    throw new TypeError("metrics must contain 1..500 entries");
  const seen = new Set<string>();
  for (const [index, metric] of metrics.entries()) {
    assertKey(metric.metricKey, `metrics[${index}].metricKey`);
    assertDecimal(metric.value, `metrics[${index}].value`);
    assertText(metric.evaluationSlice, `metrics[${index}].evaluationSlice`, 500);
    assertEnum(
      metric.evidenceOrigin,
      ["empirical_observed", "method_audit", "operational_test", "synthetic", "demo"] as const,
      `metrics[${index}].evidenceOrigin`,
    );
    assertUuid(metric.evidenceId, `metrics[${index}].evidenceId`);
    if (
      metric.presentedAsEmpirical &&
      (metric.evidenceOrigin === "synthetic" || metric.evidenceOrigin === "demo")
    ) {
      throw new TypeError("synthetic/demo metrics cannot be presented as empirical evidence");
    }
    const identity = `${metric.metricKey}:${metric.evaluationSlice}`;
    if (seen.has(identity)) throw new TypeError("metric and evaluation slice must be unique");
    seen.add(identity);
  }
}

function assertMonitoringThresholds(thresholds: readonly MonitoringThresholdDefinition[]): void {
  if (thresholds.length === 0 || thresholds.length > 100) {
    throw new TypeError("monitoringThresholds must contain 1..100 entries");
  }
  const seen = new Set<string>();
  for (const [index, threshold] of thresholds.entries()) {
    assertKey(threshold.thresholdKey, `monitoringThresholds[${index}].thresholdKey`);
    assertKey(threshold.metricKey, `monitoringThresholds[${index}].metricKey`);
    assertEnum(
      threshold.operator,
      ["gt", "gte", "lt", "lte"] as const,
      `monitoringThresholds[${index}].operator`,
    );
    assertDecimal(threshold.warningValue, `monitoringThresholds[${index}].warningValue`);
    assertDecimal(threshold.criticalValue, `monitoringThresholds[${index}].criticalValue`);
    const thresholdOrder = compareDecimal(threshold.criticalValue, threshold.warningValue);
    if (
      ((threshold.operator === "gt" || threshold.operator === "gte") && thresholdOrder <= 0) ||
      ((threshold.operator === "lt" || threshold.operator === "lte") && thresholdOrder >= 0)
    ) {
      throw new TypeError("critical threshold must be beyond warning in the operator direction");
    }
    if (
      !Number.isSafeInteger(threshold.minimumConsecutiveBreaches) ||
      threshold.minimumConsecutiveBreaches < 1 ||
      threshold.minimumConsecutiveBreaches > 100
    ) {
      throw new TypeError("minimumConsecutiveBreaches must be an integer between 1 and 100");
    }
    if (seen.has(threshold.thresholdKey)) throw new TypeError("thresholdKey must be unique");
    seen.add(threshold.thresholdKey);
  }
}

export function createModelCard(input: ModelCardInput): ModelCard {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.modelCardId, "modelCardId");
  assertUuid(input.modelId, "modelId");
  assertSemver(input.modelVersion, "modelVersion");
  assertUuid(input.ownerPrincipalId, "ownerPrincipalId");
  assertText(input.purpose, "purpose");
  assertText(input.target, "target");
  if (input.trainingPeriods.length === 0 || input.trainingPeriods.length > 100) {
    throw new TypeError("trainingPeriods must contain 1..100 entries");
  }
  for (const [index, period] of input.trainingPeriods.entries()) {
    assertIsoInstant(period.start, `trainingPeriods[${index}].start`);
    assertIsoInstant(period.end, `trainingPeriods[${index}].end`);
    if (compareInstant(period.start, period.end) >= 0)
      throw new TypeError("training period start must precede end");
  }
  assertKeys(input.orderedFeatureKeys, "orderedFeatureKeys");
  assertEnum(
    input.pointInTimeGrade,
    ["verified", "bounded", "unverified"] as const,
    "pointInTimeGrade",
  );
  assertText(input.preprocessing, "preprocessing");
  assertText(input.method, "method");
  const hyperparameterEntries = Object.entries(input.hyperparametersOrPriors);
  if (hyperparameterEntries.length === 0 || hyperparameterEntries.length > 500) {
    throw new TypeError("hyperparametersOrPriors must contain 1..500 entries");
  }
  for (const [key, value] of hyperparameterEntries) {
    assertKey(key, "hyperparameter key");
    assertText(value, `hyperparameter ${key}`, 500);
  }
  assertTexts(input.uncertaintyComponents, "uncertaintyComponents");
  assertText(input.validationDesign, "validationDesign");
  assertMetrics(input.metrics);
  assertText(input.subgroupAndRegimePerformance, "subgroupAndRegimePerformance");
  assertText(input.robustness, "robustness");
  assertText(input.fairnessAndConsequences, "fairnessAndConsequences");
  assertTexts(input.outOfDomainRules, "outOfDomainRules");
  assertMonitoringThresholds(input.monitoringThresholds);
  assertText(input.retrainingPolicy, "retrainingPolicy");
  assertTexts(input.limitations, "limitations");
  assertTexts(input.prohibitedUses, "prohibitedUses");
  if (
    !Number.isSafeInteger(input.minimumCalibrationEventCount) ||
    input.minimumCalibrationEventCount < 0 ||
    input.minimumCalibrationEventCount > 10_000_000
  ) {
    throw new TypeError("minimumCalibrationEventCount must be an integer between 0 and 10000000");
  }
  if (input.claimsCalibratedProbability && input.minimumCalibrationEventCount < 1) {
    throw new TypeError("probability claims require a positive minimum calibration event count");
  }
  assertIsoInstant(input.createdAt, "createdAt");
  return immutableWithDigest(input);
}

export interface ModelArtifactManifestInput {
  readonly schemaVersion: 1;
  readonly artifactManifestId: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly codeCommitSha256: string;
  readonly packageLockSha256: string;
  readonly sbomSha256: string;
  readonly environmentSha256: string;
  readonly configurationSha256: string;
  readonly orderedFeatureKeys: readonly string[];
  readonly preprocessingSha256: string;
  readonly trainingSnapshotSha256: string;
  readonly calibrationSnapshotSha256: string | null;
  readonly validationSnapshotSha256: string;
  readonly labelManifestSha256: string;
  readonly randomSeeds: readonly number[];
  readonly serializedModelSha256: string;
  readonly metricsSha256: string;
  readonly createdAt: string;
}

export interface ModelArtifactManifest extends ModelArtifactManifestInput {
  readonly manifestSha256: string;
}

export function createModelArtifactManifest(
  input: ModelArtifactManifestInput,
): ModelArtifactManifest {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.artifactManifestId, "artifactManifestId");
  assertUuid(input.modelId, "modelId");
  assertSemver(input.modelVersion, "modelVersion");
  for (const [field, digest] of Object.entries({
    codeCommitSha256: input.codeCommitSha256,
    packageLockSha256: input.packageLockSha256,
    sbomSha256: input.sbomSha256,
    environmentSha256: input.environmentSha256,
    configurationSha256: input.configurationSha256,
    preprocessingSha256: input.preprocessingSha256,
    trainingSnapshotSha256: input.trainingSnapshotSha256,
    validationSnapshotSha256: input.validationSnapshotSha256,
    labelManifestSha256: input.labelManifestSha256,
    serializedModelSha256: input.serializedModelSha256,
    metricsSha256: input.metricsSha256,
  })) {
    assertSha256(digest, field);
  }
  if (input.calibrationSnapshotSha256 !== null) {
    assertSha256(input.calibrationSnapshotSha256, "calibrationSnapshotSha256");
  }
  assertKeys(input.orderedFeatureKeys, "orderedFeatureKeys");
  if (input.randomSeeds.length === 0 || input.randomSeeds.length > 1_000) {
    throw new TypeError("randomSeeds must contain 1..1000 entries");
  }
  const seenSeeds = new Set<number>();
  for (const seed of input.randomSeeds) {
    if (!Number.isSafeInteger(seed) || seed < 0)
      throw new TypeError("random seed must be a non-negative integer");
    if (seenSeeds.has(seed)) throw new TypeError("randomSeeds must be unique");
    seenSeeds.add(seed);
  }
  assertIsoInstant(input.createdAt, "createdAt");
  return immutableWithDigest(input);
}

export interface ModelVersionInput {
  readonly schemaVersion: 1;
  readonly modelVersionId: string;
  readonly modelId: string;
  readonly version: string;
  readonly parentModelVersionId: string | null;
  readonly changeClass: ChangeClass;
  readonly changeSummary: string;
  readonly developerPrincipalIds: readonly string[];
  readonly dataManifestSha256: string;
  readonly labelManifestSha256: string;
  readonly modelCardSha256: string;
  readonly artifactManifestSha256: string;
  readonly createdAt: string;
}

export interface ModelVersion extends ModelVersionInput {
  readonly manifestSha256: string;
}

export function createModelVersion(input: ModelVersionInput): ModelVersion {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.modelVersionId, "modelVersionId");
  assertUuid(input.modelId, "modelId");
  assertSemver(input.version, "version");
  if (input.parentModelVersionId !== null)
    assertUuid(input.parentModelVersionId, "parentModelVersionId");
  assertEnum(input.changeClass, CHANGE_CLASSES, "changeClass");
  assertText(input.changeSummary, "changeSummary");
  if (input.developerPrincipalIds.length === 0 || input.developerPrincipalIds.length > 100) {
    throw new TypeError("developerPrincipalIds must contain 1..100 entries");
  }
  const developers = new Set<string>();
  for (const principalId of input.developerPrincipalIds) {
    assertUuid(principalId, "developerPrincipalIds item");
    if (developers.has(principalId)) throw new TypeError("developerPrincipalIds must be unique");
    developers.add(principalId);
  }
  for (const [field, digest] of Object.entries({
    dataManifestSha256: input.dataManifestSha256,
    labelManifestSha256: input.labelManifestSha256,
    modelCardSha256: input.modelCardSha256,
    artifactManifestSha256: input.artifactManifestSha256,
  })) {
    assertSha256(digest, field);
  }
  assertIsoInstant(input.createdAt, "createdAt");
  return immutableWithDigest(input);
}
