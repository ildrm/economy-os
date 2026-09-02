import type { EvidenceOrigin, ModelMetric } from "./artifacts.js";
import {
  assertDecimal,
  assertEnum,
  assertIsoInstant,
  assertKey,
  assertSchemaVersion,
  assertSha256,
  assertText,
  assertTexts,
  assertUuid,
  compareInstant,
  immutableWithDigest,
} from "./internals.js";

export const EXPERIMENT_STATUSES = [
  "planned",
  "running",
  "succeeded",
  "failed",
  "negative",
  "inconclusive",
] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export interface ExperimentInput {
  readonly schemaVersion: 1;
  readonly experimentId: string;
  readonly modelVersionId: string;
  readonly title: string;
  readonly hypothesis: string;
  readonly status: ExperimentStatus;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly runByPrincipalId: string;
  readonly codeSha256: string;
  readonly dataManifestSha256: string;
  readonly configurationSha256: string;
  readonly randomSeeds: readonly number[];
  readonly metrics: readonly ModelMetric[];
  readonly findings: readonly string[];
  readonly failureReason: string | null;
  readonly replacesExperimentId: string | null;
}

export interface Experiment extends ExperimentInput {
  readonly manifestSha256: string;
}

function assertExperimentMetric(metric: ModelMetric, index: number): void {
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
    throw new TypeError("synthetic/demo experiment metrics cannot be empirical evidence");
  }
}

export function createExperiment(input: ExperimentInput): Experiment {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.experimentId, "experimentId");
  assertUuid(input.modelVersionId, "modelVersionId");
  assertText(input.title, "title", 300);
  assertText(input.hypothesis, "hypothesis");
  assertEnum(input.status, EXPERIMENT_STATUSES, "status");
  assertIsoInstant(input.startedAt, "startedAt");
  assertUuid(input.runByPrincipalId, "runByPrincipalId");
  assertSha256(input.codeSha256, "codeSha256");
  assertSha256(input.dataManifestSha256, "dataManifestSha256");
  assertSha256(input.configurationSha256, "configurationSha256");
  if (input.randomSeeds.length === 0 || input.randomSeeds.length > 1_000) {
    throw new TypeError("randomSeeds must contain 1..1000 entries");
  }
  const seeds = new Set<number>();
  for (const seed of input.randomSeeds) {
    if (!Number.isSafeInteger(seed) || seed < 0)
      throw new TypeError("random seed must be non-negative");
    if (seeds.has(seed)) throw new TypeError("randomSeeds must be unique");
    seeds.add(seed);
  }
  if (input.metrics.length > 500) throw new TypeError("metrics cannot exceed 500 entries");
  input.metrics.forEach(assertExperimentMetric);
  const terminal = ["succeeded", "failed", "negative", "inconclusive"].includes(input.status);
  if (terminal !== (input.completedAt !== null)) {
    throw new TypeError("only terminal experiments must have completedAt");
  }
  if (input.completedAt !== null) {
    assertIsoInstant(input.completedAt, "completedAt");
    if (compareInstant(input.startedAt, input.completedAt) > 0) {
      throw new TypeError("completedAt cannot precede startedAt");
    }
  }
  if (terminal) assertTexts(input.findings, "findings");
  else if (input.findings.length !== 0)
    throw new TypeError("non-terminal experiments cannot claim findings");
  if ((input.status === "failed") !== (input.failureReason !== null)) {
    throw new TypeError("failureReason is required only for failed experiments");
  }
  if (input.failureReason !== null) assertText(input.failureReason, "failureReason");
  if (input.replacesExperimentId !== null) {
    assertUuid(input.replacesExperimentId, "replacesExperimentId");
    if (input.replacesExperimentId === input.experimentId)
      throw new TypeError("experiment cannot replace itself");
  }
  return immutableWithDigest(input);
}

export interface ReproducibilityReceiptInput {
  readonly schemaVersion: 1;
  readonly receiptId: string;
  readonly subjectType: "model_version" | "experiment" | "validation" | "research_artifact";
  readonly subjectId: string;
  readonly codeSha256: string;
  readonly dataManifestSha256: string;
  readonly environmentSha256: string;
  readonly configurationSha256: string;
  readonly commandArgv: readonly string[];
  readonly expectedOutputSha256s: readonly string[];
  readonly actualOutputSha256s: readonly string[];
  readonly deterministicTolerance: string;
  readonly result: "passed" | "failed";
  readonly executedAt: string;
  readonly executedByPrincipalId: string;
}

export interface ReproducibilityReceipt extends ReproducibilityReceiptInput {
  readonly manifestSha256: string;
}

export function createReproducibilityReceipt(
  input: ReproducibilityReceiptInput,
): ReproducibilityReceipt {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.receiptId, "receiptId");
  assertEnum(
    input.subjectType,
    ["model_version", "experiment", "validation", "research_artifact"] as const,
    "subjectType",
  );
  assertUuid(input.subjectId, "subjectId");
  for (const [field, digest] of Object.entries({
    codeSha256: input.codeSha256,
    dataManifestSha256: input.dataManifestSha256,
    environmentSha256: input.environmentSha256,
    configurationSha256: input.configurationSha256,
  })) {
    assertSha256(digest, field);
  }
  if (input.commandArgv.length === 0 || input.commandArgv.length > 100) {
    throw new TypeError("commandArgv must contain 1..100 arguments");
  }
  for (const [index, argument] of input.commandArgv.entries()) {
    assertText(argument, `commandArgv[${index}]`, 2_000);
  }
  if (
    input.expectedOutputSha256s.length === 0 ||
    input.expectedOutputSha256s.length > 1_000 ||
    input.actualOutputSha256s.length > 1_000
  ) {
    throw new TypeError("receipt output digest collections are outside bounds");
  }
  input.expectedOutputSha256s.forEach((digest, index) => {
    assertSha256(digest, `expectedOutputSha256s[${index}]`);
  });
  input.actualOutputSha256s.forEach((digest, index) => {
    assertSha256(digest, `actualOutputSha256s[${index}]`);
  });
  assertDecimal(input.deterministicTolerance, "deterministicTolerance");
  if (input.deterministicTolerance.startsWith("-")) {
    throw new TypeError("deterministicTolerance cannot be negative");
  }
  assertEnum(input.result, ["passed", "failed"] as const, "result");
  const outputsMatch =
    input.expectedOutputSha256s.length === input.actualOutputSha256s.length &&
    input.expectedOutputSha256s.every(
      (digest, index) => digest === input.actualOutputSha256s[index],
    );
  if (input.result === "passed" && !outputsMatch) {
    throw new TypeError("a passed reproducibility receipt requires exact ordered output digests");
  }
  if (input.result === "failed" && outputsMatch) {
    throw new TypeError("a failed reproducibility receipt must record differing output digests");
  }
  assertIsoInstant(input.executedAt, "executedAt");
  assertUuid(input.executedByPrincipalId, "executedByPrincipalId");
  return immutableWithDigest(input);
}

export interface ResearchArtifactInput {
  readonly schemaVersion: 1;
  readonly researchArtifactId: string;
  readonly modelVersionId: string;
  readonly kind: "notebook" | "protocol" | "analysis" | "report";
  readonly title: string;
  readonly authorPrincipalIds: readonly string[];
  readonly contentSha256: string;
  readonly codeCommitSha256: string;
  readonly environmentSha256: string;
  readonly dataManifestSha256s: readonly string[];
  readonly executedCellOrderSha256: string | null;
  readonly outputSha256: string;
  readonly createdAt: string;
  readonly limitations: readonly string[];
}

export interface ResearchArtifact extends ResearchArtifactInput {
  readonly manifestSha256: string;
}

export function createResearchArtifact(input: ResearchArtifactInput): ResearchArtifact {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.researchArtifactId, "researchArtifactId");
  assertUuid(input.modelVersionId, "modelVersionId");
  assertEnum(input.kind, ["notebook", "protocol", "analysis", "report"] as const, "kind");
  assertText(input.title, "title", 300);
  if (input.authorPrincipalIds.length === 0 || input.authorPrincipalIds.length > 100) {
    throw new TypeError("authorPrincipalIds must contain 1..100 entries");
  }
  const authors = new Set<string>();
  for (const author of input.authorPrincipalIds) {
    assertUuid(author, "authorPrincipalIds item");
    if (authors.has(author)) throw new TypeError("authorPrincipalIds must be unique");
    authors.add(author);
  }
  assertSha256(input.contentSha256, "contentSha256");
  assertSha256(input.codeCommitSha256, "codeCommitSha256");
  assertSha256(input.environmentSha256, "environmentSha256");
  if (input.dataManifestSha256s.length === 0 || input.dataManifestSha256s.length > 100) {
    throw new TypeError("dataManifestSha256s must contain 1..100 entries");
  }
  input.dataManifestSha256s.forEach((digest, index) => {
    assertSha256(digest, `dataManifestSha256s[${index}]`);
  });
  if (new Set(input.dataManifestSha256s).size !== input.dataManifestSha256s.length) {
    throw new TypeError("dataManifestSha256s must be unique");
  }
  if (input.kind === "notebook" && input.executedCellOrderSha256 === null) {
    throw new TypeError("notebooks require an executed-cell-order digest");
  }
  if (input.executedCellOrderSha256 !== null) {
    assertSha256(input.executedCellOrderSha256, "executedCellOrderSha256");
  }
  assertSha256(input.outputSha256, "outputSha256");
  assertIsoInstant(input.createdAt, "createdAt");
  assertTexts(input.limitations, "limitations");
  return immutableWithDigest(input);
}

export interface PeerReviewInput {
  readonly schemaVersion: 1;
  readonly peerReviewId: string;
  readonly researchArtifactId: string;
  readonly researchArtifactSha256: string;
  readonly reviewerPrincipalId: string;
  readonly authorPrincipalIds: readonly string[];
  readonly decision: "approved" | "changes_requested" | "rejected";
  readonly findings: readonly string[];
  readonly reviewedAt: string;
}

export interface PeerReview extends PeerReviewInput {
  readonly manifestSha256: string;
}

export function createPeerReview(input: PeerReviewInput): PeerReview {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.peerReviewId, "peerReviewId");
  assertUuid(input.researchArtifactId, "researchArtifactId");
  assertSha256(input.researchArtifactSha256, "researchArtifactSha256");
  assertUuid(input.reviewerPrincipalId, "reviewerPrincipalId");
  if (input.authorPrincipalIds.length === 0)
    throw new TypeError("authorPrincipalIds must not be empty");
  const authors = new Set<string>();
  for (const author of input.authorPrincipalIds) {
    assertUuid(author, "authorPrincipalIds item");
    if (authors.has(author)) throw new TypeError("authorPrincipalIds must be unique");
    authors.add(author);
    if (author === input.reviewerPrincipalId)
      throw new TypeError("peer reviewer must be independent of authors");
  }
  assertEnum(input.decision, ["approved", "changes_requested", "rejected"] as const, "decision");
  assertTexts(input.findings, "findings");
  assertIsoInstant(input.reviewedAt, "reviewedAt");
  return immutableWithDigest(input);
}

export function evidenceOriginCanSupportEmpiricalClaim(origin: EvidenceOrigin): boolean {
  return origin === "empirical_observed";
}
