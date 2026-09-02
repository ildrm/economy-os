import {
  assertDecimal,
  assertEnum,
  assertExactKeys,
  assertInteger,
  assertIsoInstant,
  assertKey,
  assertSemver,
  assertSha256,
  assertText,
  assertUuid,
  cloneCanonical,
  compareDecimal,
  compareInstant,
  deepFreeze,
  digestJson,
} from "./internals.js";

export const DRIFT_CATEGORIES = [
  "input",
  "feature",
  "missingness",
  "output",
  "error",
  "calibration",
] as const;
export type DriftCategory = (typeof DRIFT_CATEGORIES)[number];

export interface DriftSignalInput {
  readonly schemaVersion: 1;
  readonly signalId: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly category: DriftCategory;
  readonly metricKey: string;
  readonly evaluationWindow: Readonly<{ start: string; end: string }>;
  readonly measuredAt: string;
  readonly observedValue: string;
  readonly threshold: string;
  readonly breachDirection: "above" | "below";
  readonly severity: "info" | "warning" | "high" | "critical";
  readonly supportingArtifactSha256: string;
  readonly sampleSize: number;
  readonly limitations: readonly string[];
}

export interface DriftSignal extends DriftSignalInput {
  readonly breached: boolean;
  readonly manifestSha256: string;
}

function validateDriftSignalBody(input: DriftSignalInput): boolean {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "signalId",
      "modelId",
      "modelVersion",
      "category",
      "metricKey",
      "evaluationWindow",
      "measuredAt",
      "observedValue",
      "threshold",
      "breachDirection",
      "severity",
      "supportingArtifactSha256",
      "sampleSize",
      "limitations",
    ],
    "driftSignal",
  );
  if (input.schemaVersion !== 1) throw new TypeError("driftSignal.schemaVersion must be 1");
  assertUuid(input.signalId, "driftSignal.signalId");
  assertUuid(input.modelId, "driftSignal.modelId");
  assertSemver(input.modelVersion, "driftSignal.modelVersion");
  assertEnum(input.category, DRIFT_CATEGORIES, "driftSignal.category");
  assertKey(input.metricKey, "driftSignal.metricKey");
  assertExactKeys(input.evaluationWindow, ["start", "end"], "driftSignal.evaluationWindow");
  assertIsoInstant(input.evaluationWindow.start, "driftSignal.evaluationWindow.start");
  assertIsoInstant(input.evaluationWindow.end, "driftSignal.evaluationWindow.end");
  assertIsoInstant(input.measuredAt, "driftSignal.measuredAt");
  if (
    compareInstant(input.evaluationWindow.end, input.evaluationWindow.start) <= 0 ||
    compareInstant(input.measuredAt, input.evaluationWindow.end) < 0
  ) {
    throw new TypeError("drift evaluation chronology is invalid");
  }
  assertDecimal(input.observedValue, "driftSignal.observedValue");
  assertDecimal(input.threshold, "driftSignal.threshold");
  assertEnum(input.breachDirection, ["above", "below"], "driftSignal.breachDirection");
  assertEnum(input.severity, ["info", "warning", "high", "critical"], "driftSignal.severity");
  assertSha256(input.supportingArtifactSha256, "driftSignal.supportingArtifactSha256");
  assertInteger(input.sampleSize, "driftSignal.sampleSize", 1, 100_000_000);
  if (input.limitations.length === 0)
    throw new TypeError("drift signal limitations must be explicit");
  for (const limitation of input.limitations)
    assertText(limitation, "drift signal limitation", 1_000);
  const comparison = compareDecimal(input.observedValue, input.threshold);
  return input.breachDirection === "above" ? comparison > 0 : comparison < 0;
}

export function createDriftSignal(input: DriftSignalInput): Readonly<DriftSignal> {
  const breached = validateDriftSignalBody(input);
  const body = cloneCanonical({ ...input, breached });
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function assertDriftSignalIntegrity(signal: DriftSignal): void {
  assertSha256(signal.manifestSha256, "driftSignal.manifestSha256");
  const { breached, manifestSha256, ...body } = signal;
  if (validateDriftSignalBody(body) !== breached) {
    throw new TypeError("drift signal breach flag does not match its threshold rule");
  }
  if (digestJson({ ...body, breached }) !== manifestSha256) {
    throw new TypeError("drift signal digest does not match immutable content");
  }
}

export interface DriftReviewPolicy {
  readonly minimumCategoriesForRestriction: number;
  readonly minimumHighSignalsForRestriction: number;
  readonly criticalSignalRecommendsDisable: boolean;
}

export interface DriftReviewInput {
  readonly schemaVersion: 1;
  readonly reviewId: string;
  readonly createdAt: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly signals: readonly DriftSignal[];
  readonly policy: DriftReviewPolicy;
  readonly reviewerRoleRequired: "model_risk_manager";
}

export interface DriftReviewRecommendation extends DriftReviewInput {
  readonly breachedSignalIds: readonly string[];
  readonly breachedCategories: readonly DriftCategory[];
  readonly recommendation:
    | "continue_monitoring"
    | "open_review"
    | "restrict_pending_review"
    | "disable_pending_review";
  readonly automaticLifecycleMutation: false;
  readonly requiresGovernedReview: true;
  readonly manifestSha256: string;
}

export function recommendDriftReview(input: DriftReviewInput): Readonly<DriftReviewRecommendation> {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "reviewId",
      "createdAt",
      "modelId",
      "modelVersion",
      "signals",
      "policy",
      "reviewerRoleRequired",
    ],
    "driftReview",
  );
  if (input.schemaVersion !== 1) throw new TypeError("driftReview.schemaVersion must be 1");
  assertUuid(input.reviewId, "driftReview.reviewId");
  assertIsoInstant(input.createdAt, "driftReview.createdAt");
  assertUuid(input.modelId, "driftReview.modelId");
  assertSemver(input.modelVersion, "driftReview.modelVersion");
  if (input.signals.length === 0) throw new TypeError("drift review needs monitoring signals");
  if (input.reviewerRoleRequired !== "model_risk_manager") {
    throw new TypeError("drift restrictions require a model risk manager review");
  }
  assertExactKeys(
    input.policy,
    [
      "minimumCategoriesForRestriction",
      "minimumHighSignalsForRestriction",
      "criticalSignalRecommendsDisable",
    ],
    "driftReview.policy",
  );
  assertInteger(
    input.policy.minimumCategoriesForRestriction,
    "driftReview.policy.minimumCategoriesForRestriction",
    1,
    DRIFT_CATEGORIES.length,
  );
  assertInteger(
    input.policy.minimumHighSignalsForRestriction,
    "driftReview.policy.minimumHighSignalsForRestriction",
    1,
    100,
  );
  const signalIds = new Set<string>();
  for (const signal of input.signals) {
    assertDriftSignalIntegrity(signal);
    if (signalIds.has(signal.signalId))
      throw new TypeError("drift review signal IDs must be unique");
    signalIds.add(signal.signalId);
    if (signal.modelId !== input.modelId || signal.modelVersion !== input.modelVersion) {
      throw new TypeError("drift review cannot mix model versions");
    }
    if (compareInstant(signal.measuredAt, input.createdAt) > 0) {
      throw new TypeError("drift review cannot include future signals");
    }
  }
  const breached = input.signals.filter((signal) => signal.breached);
  const breachedCategories = [...new Set(breached.map((signal) => signal.category))].sort();
  const highCount = breached.filter(
    (signal) => signal.severity === "high" || signal.severity === "critical",
  ).length;
  const hasCritical = breached.some((signal) => signal.severity === "critical");
  let recommendation: DriftReviewRecommendation["recommendation"] = "continue_monitoring";
  if (hasCritical && input.policy.criticalSignalRecommendsDisable) {
    recommendation = "disable_pending_review";
  } else if (
    breachedCategories.length >= input.policy.minimumCategoriesForRestriction ||
    highCount >= input.policy.minimumHighSignalsForRestriction
  ) {
    recommendation = "restrict_pending_review";
  } else if (breached.length > 0) {
    recommendation = "open_review";
  }
  const body = cloneCanonical({
    ...input,
    signals: [...input.signals].sort((left, right) => left.signalId.localeCompare(right.signalId)),
    breachedSignalIds: breached.map((signal) => signal.signalId).sort(),
    breachedCategories,
    recommendation,
    automaticLifecycleMutation: false as const,
    requiresGovernedReview: true as const,
  });
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}
