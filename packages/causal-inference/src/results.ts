import {
  assertIdentificationDesignIntegrity,
  type IdentificationDesign,
  type IdentificationMethod,
} from "./designs.js";
import { assertEstimandDefinitionIntegrity, type EstimandDefinition } from "./estimands.js";
import {
  assertDecimal,
  assertEnum,
  assertExactKeys,
  assertIsoInstant,
  assertKey,
  assertPositiveDecimal,
  assertProbability,
  assertRecord,
  assertSha256,
  assertSorted,
  assertText,
  assertUuid,
  cloneCanonical,
  compareDecimal,
  compareInstant,
  deepFreeze,
  digestJson,
  expectArray,
  expectBoolean,
  expectInteger,
  expectNullableString,
  expectString,
} from "./internals.js";
import {
  assertPointInTimeAnalysisManifestIntegrity,
  type PointInTimeAnalysisManifest,
} from "./manifests.js";
import {
  type AnalysisPlan,
  type AnalysisReadinessReceipt,
  assertAnalysisPlanIntegrity,
  assertAnalysisReadinessReceiptIntegrity,
  evaluateDiagnosticThreshold,
} from "./plans.js";

export const RESULT_KINDS = [
  "discovered_association",
  "hypothesis",
  "identified_effect_candidate",
  "observed_association",
  "predictive_association",
] as const;
export type CausalResultKind = (typeof RESULT_KINDS)[number];

export const UNCERTAINTY_KINDS = [
  "data_measurement",
  "identification",
  "model",
  "statistical",
] as const;
export type CausalUncertaintyKind = (typeof UNCERTAINTY_KINDS)[number];

export interface EffectInterval {
  readonly lower: string;
  readonly upper: string;
  readonly level: string;
  readonly kind: "confidence" | "credible";
}

export interface EffectEstimate {
  readonly scale: string;
  readonly pointEstimate: string;
  readonly standardError: string | null;
  readonly interval: EffectInterval;
}

export interface CausalUncertaintyRecord {
  readonly kind: CausalUncertaintyKind;
  readonly magnitude: string | null;
  readonly description: string;
  readonly evidenceSha256: string;
}

export interface DiagnosticResult {
  readonly diagnosticKey: string;
  readonly status: "failed" | "inconclusive" | "passed";
  readonly observedValue: string | null;
  readonly threshold: string;
  readonly evidenceSha256: string;
}

export interface FalsificationResult {
  readonly testKey: string;
  readonly kind:
    | "negative_control_exposure"
    | "negative_control_outcome"
    | "placebo_outcome"
    | "placebo_time"
    | "placebo_treatment";
  readonly status: "failed" | "inconclusive" | "passed";
  readonly summary: string;
  readonly evidenceSha256: string;
}

export interface SensitivityResult {
  readonly analysisKey: string;
  readonly status: "fragile" | "inconclusive" | "robust";
  readonly minimumEstimate: string;
  readonly maximumEstimate: string;
  readonly summary: string;
  readonly evidenceSha256: string;
}

export interface OverlapBalanceRecord {
  readonly overlapStatus: "adequate" | "inadequate" | "not_applicable";
  readonly balanceStatus: "balanced" | "imbalanced" | "not_applicable";
  readonly minimumOverlapScore: string | null;
  readonly maximumAbsoluteStandardizedDifference: string | null;
  readonly rationale: string;
}

export interface HeterogeneityResult {
  readonly moderatorKey: string;
  readonly subgroupKey: string;
  readonly sampleSize: number;
  readonly estimate: string;
  readonly adjustedPValue: string;
}

export interface MultiplicityRecord {
  readonly policy: "benjamini_hochberg" | "family_wise_error" | "hierarchical_partial_pooling";
  readonly familyKeys: readonly string[];
  readonly hypothesesTested: number;
  readonly adjustmentApplied: boolean;
}

export interface CausalAnalysisResultInput {
  readonly schemaVersion: 1;
  readonly resultId: string;
  readonly analysisId: string;
  readonly resultKind: CausalResultKind;
  readonly method: IdentificationMethod;
  readonly estimandId: string;
  readonly estimandSha256: string;
  readonly designId: string;
  readonly designSha256: string;
  readonly planId: string;
  readonly planSha256: string;
  readonly dataManifestId: string;
  readonly dataManifestSha256: string;
  readonly readinessReceiptId: string;
  readonly readinessReceiptSha256: string;
  readonly estimate: EffectEstimate | null;
  readonly uncertainty: readonly CausalUncertaintyRecord[];
  readonly diagnostics: readonly DiagnosticResult[];
  readonly falsificationResults: readonly FalsificationResult[];
  readonly sensitivityResults: readonly SensitivityResult[];
  readonly overlapAndBalance: OverlapBalanceRecord;
  readonly heterogeneityResults: readonly HeterogeneityResult[];
  readonly multiplicity: MultiplicityRecord;
  readonly planDeviation: "none";
  readonly automaticGraphPromotion: "prohibited";
  readonly analystId: string;
  readonly generatedAt: string;
  readonly limitations: readonly string[];
}

export interface CausalAnalysisResult extends CausalAnalysisResultInput {
  readonly resultSha256: string;
}

export interface CausalResultContext {
  readonly estimand: EstimandDefinition;
  readonly design: IdentificationDesign;
  readonly plan: AnalysisPlan;
  readonly dataManifest: PointInTimeAnalysisManifest;
  readonly readinessReceipt: AnalysisReadinessReceipt;
}

const BODY_KEYS = [
  "schemaVersion",
  "resultId",
  "analysisId",
  "resultKind",
  "method",
  "estimandId",
  "estimandSha256",
  "designId",
  "designSha256",
  "planId",
  "planSha256",
  "dataManifestId",
  "dataManifestSha256",
  "readinessReceiptId",
  "readinessReceiptSha256",
  "estimate",
  "uncertainty",
  "diagnostics",
  "falsificationResults",
  "sensitivityResults",
  "overlapAndBalance",
  "heterogeneityResults",
  "multiplicity",
  "planDeviation",
  "automaticGraphPromotion",
  "analystId",
  "generatedAt",
  "limitations",
] as const;

function parseEstimate(value: unknown, resultKind: CausalResultKind): EffectEstimate | null {
  if (value === null) {
    if (resultKind !== "hypothesis") throw new TypeError(`${resultKind} requires an estimate`);
    return null;
  }
  if (resultKind === "hypothesis")
    throw new TypeError("hypothesis result cannot contain an estimate");
  assertRecord(value, "causalResult.estimate");
  assertExactKeys(
    value,
    ["scale", "pointEstimate", "standardError", "interval"],
    "causalResult.estimate",
  );
  const scale = expectString(value.scale, "causalResult.estimate.scale");
  const pointEstimate = expectString(value.pointEstimate, "causalResult.estimate.pointEstimate");
  const standardError = expectNullableString(
    value.standardError,
    "causalResult.estimate.standardError",
  );
  assertKey(scale, "causalResult.estimate.scale");
  assertDecimal(pointEstimate, "causalResult.estimate.pointEstimate");
  if (standardError !== null)
    assertPositiveDecimal(standardError, "causalResult.estimate.standardError");
  assertRecord(value.interval, "causalResult.estimate.interval");
  assertExactKeys(
    value.interval,
    ["lower", "upper", "level", "kind"],
    "causalResult.estimate.interval",
  );
  const lower = expectString(value.interval.lower, "causalResult.estimate.interval.lower");
  const upper = expectString(value.interval.upper, "causalResult.estimate.interval.upper");
  const level = expectString(value.interval.level, "causalResult.estimate.interval.level");
  const kind = expectString(value.interval.kind, "causalResult.estimate.interval.kind");
  assertDecimal(lower, "causalResult.estimate.interval.lower");
  assertDecimal(upper, "causalResult.estimate.interval.upper");
  assertProbability(level, "causalResult.estimate.interval.level");
  assertEnum(kind, ["confidence", "credible"], "causalResult.estimate.interval.kind");
  if (compareDecimal(level, "0") <= 0 || compareDecimal(level, "1") >= 0) {
    throw new TypeError("effect interval level must be strictly between zero and one");
  }
  if (
    compareDecimal(lower, upper) > 0 ||
    compareDecimal(pointEstimate, lower) < 0 ||
    compareDecimal(pointEstimate, upper) > 0
  ) {
    throw new TypeError("effect interval must be ordered and contain the point estimate");
  }
  return { scale, pointEstimate, standardError, interval: { lower, upper, level, kind } };
}

function parseUncertainty(value: unknown): CausalUncertaintyRecord[] {
  const records = expectArray(value, "causalResult.uncertainty").map((item, index) => {
    const field = `causalResult.uncertainty[${index}]`;
    assertRecord(item, field);
    assertExactKeys(item, ["kind", "magnitude", "description", "evidenceSha256"], field);
    const kind = expectString(item.kind, `${field}.kind`);
    const magnitude = expectNullableString(item.magnitude, `${field}.magnitude`);
    const description = expectString(item.description, `${field}.description`);
    const evidenceSha256 = expectString(item.evidenceSha256, `${field}.evidenceSha256`);
    assertEnum(kind, UNCERTAINTY_KINDS, `${field}.kind`);
    if (magnitude !== null) assertDecimal(magnitude, `${field}.magnitude`, false);
    assertText(description, `${field}.description`, 2_000);
    assertSha256(evidenceSha256, `${field}.evidenceSha256`);
    return { kind, magnitude, description, evidenceSha256 };
  });
  const kinds = records.map((record) => record.kind);
  if (
    kinds.length !== UNCERTAINTY_KINDS.length ||
    UNCERTAINTY_KINDS.some((kind) => !kinds.includes(kind))
  ) {
    throw new TypeError(
      "result must keep statistical, model, data, and identification uncertainty distinct",
    );
  }
  return records.sort((left, right) => left.kind.localeCompare(right.kind));
}

function parseDiagnostics(value: unknown): DiagnosticResult[] {
  const records = expectArray(value, "causalResult.diagnostics").map((item, index) => {
    const field = `causalResult.diagnostics[${index}]`;
    assertRecord(item, field);
    assertExactKeys(
      item,
      ["diagnosticKey", "status", "observedValue", "threshold", "evidenceSha256"],
      field,
    );
    const diagnosticKey = expectString(item.diagnosticKey, `${field}.diagnosticKey`);
    const status = expectString(item.status, `${field}.status`);
    const observedValue = expectNullableString(item.observedValue, `${field}.observedValue`);
    const threshold = expectString(item.threshold, `${field}.threshold`);
    const evidenceSha256 = expectString(item.evidenceSha256, `${field}.evidenceSha256`);
    assertKey(diagnosticKey, `${field}.diagnosticKey`);
    assertEnum(status, ["failed", "inconclusive", "passed"], `${field}.status`);
    if (observedValue !== null) assertDecimal(observedValue, `${field}.observedValue`);
    assertDecimal(threshold, `${field}.threshold`);
    assertSha256(evidenceSha256, `${field}.evidenceSha256`);
    return { diagnosticKey, status, observedValue, threshold, evidenceSha256 };
  });
  const keys = records.map((record) => record.diagnosticKey);
  if (new Set(keys).size !== keys.length)
    throw new TypeError("diagnostic result keys must be unique");
  return records.sort((left, right) => left.diagnosticKey.localeCompare(right.diagnosticKey));
}

function parseFalsification(value: unknown): FalsificationResult[] {
  const records = expectArray(value, "causalResult.falsificationResults").map((item, index) => {
    const field = `causalResult.falsificationResults[${index}]`;
    assertRecord(item, field);
    assertExactKeys(item, ["testKey", "kind", "status", "summary", "evidenceSha256"], field);
    const testKey = expectString(item.testKey, `${field}.testKey`);
    const kind = expectString(item.kind, `${field}.kind`);
    const status = expectString(item.status, `${field}.status`);
    const summary = expectString(item.summary, `${field}.summary`);
    const evidenceSha256 = expectString(item.evidenceSha256, `${field}.evidenceSha256`);
    assertKey(testKey, `${field}.testKey`);
    assertEnum(
      kind,
      [
        "negative_control_exposure",
        "negative_control_outcome",
        "placebo_outcome",
        "placebo_time",
        "placebo_treatment",
      ],
      `${field}.kind`,
    );
    assertEnum(status, ["failed", "inconclusive", "passed"], `${field}.status`);
    assertText(summary, `${field}.summary`, 2_000);
    assertSha256(evidenceSha256, `${field}.evidenceSha256`);
    return { testKey, kind, status, summary, evidenceSha256 };
  });
  const keys = records.map((record) => record.testKey);
  if (new Set(keys).size !== keys.length)
    throw new TypeError("falsification result keys must be unique");
  return records.sort((left, right) => left.testKey.localeCompare(right.testKey));
}

function parseSensitivity(value: unknown): SensitivityResult[] {
  const records = expectArray(value, "causalResult.sensitivityResults").map((item, index) => {
    const field = `causalResult.sensitivityResults[${index}]`;
    assertRecord(item, field);
    assertExactKeys(
      item,
      ["analysisKey", "status", "minimumEstimate", "maximumEstimate", "summary", "evidenceSha256"],
      field,
    );
    const analysisKey = expectString(item.analysisKey, `${field}.analysisKey`);
    const status = expectString(item.status, `${field}.status`);
    const minimumEstimate = expectString(item.minimumEstimate, `${field}.minimumEstimate`);
    const maximumEstimate = expectString(item.maximumEstimate, `${field}.maximumEstimate`);
    const summary = expectString(item.summary, `${field}.summary`);
    const evidenceSha256 = expectString(item.evidenceSha256, `${field}.evidenceSha256`);
    assertKey(analysisKey, `${field}.analysisKey`);
    assertEnum(status, ["fragile", "inconclusive", "robust"], `${field}.status`);
    assertDecimal(minimumEstimate, `${field}.minimumEstimate`);
    assertDecimal(maximumEstimate, `${field}.maximumEstimate`);
    if (compareDecimal(minimumEstimate, maximumEstimate) > 0) {
      throw new TypeError(`${field} estimate range is reversed`);
    }
    assertText(summary, `${field}.summary`, 2_000);
    assertSha256(evidenceSha256, `${field}.evidenceSha256`);
    return {
      analysisKey,
      status,
      minimumEstimate,
      maximumEstimate,
      summary,
      evidenceSha256,
    };
  });
  const keys = records.map((record) => record.analysisKey);
  if (new Set(keys).size !== keys.length)
    throw new TypeError("sensitivity result keys must be unique");
  return records.sort((left, right) => left.analysisKey.localeCompare(right.analysisKey));
}

function parseOverlap(value: unknown): OverlapBalanceRecord {
  assertRecord(value, "causalResult.overlapAndBalance");
  assertExactKeys(
    value,
    [
      "overlapStatus",
      "balanceStatus",
      "minimumOverlapScore",
      "maximumAbsoluteStandardizedDifference",
      "rationale",
    ],
    "causalResult.overlapAndBalance",
  );
  const overlapStatus = expectString(
    value.overlapStatus,
    "causalResult.overlapAndBalance.overlapStatus",
  );
  const balanceStatus = expectString(
    value.balanceStatus,
    "causalResult.overlapAndBalance.balanceStatus",
  );
  const minimumOverlapScore = expectNullableString(
    value.minimumOverlapScore,
    "causalResult.overlapAndBalance.minimumOverlapScore",
  );
  const maximumAbsoluteStandardizedDifference = expectNullableString(
    value.maximumAbsoluteStandardizedDifference,
    "causalResult.overlapAndBalance.maximumAbsoluteStandardizedDifference",
  );
  const rationale = expectString(value.rationale, "causalResult.overlapAndBalance.rationale");
  assertEnum(
    overlapStatus,
    ["adequate", "inadequate", "not_applicable"],
    "causalResult.overlapAndBalance.overlapStatus",
  );
  assertEnum(
    balanceStatus,
    ["balanced", "imbalanced", "not_applicable"],
    "causalResult.overlapAndBalance.balanceStatus",
  );
  assertText(rationale, "causalResult.overlapAndBalance.rationale", 2_000);
  const isNotApplicable = overlapStatus === "not_applicable" && balanceStatus === "not_applicable";
  if (isNotApplicable) {
    if (minimumOverlapScore !== null || maximumAbsoluteStandardizedDifference !== null) {
      throw new TypeError("not-applicable overlap/balance cannot report metrics");
    }
  } else {
    if (
      overlapStatus === "not_applicable" ||
      balanceStatus === "not_applicable" ||
      minimumOverlapScore === null ||
      maximumAbsoluteStandardizedDifference === null
    ) {
      throw new TypeError("applicable overlap/balance requires both exact metrics and statuses");
    }
    assertProbability(minimumOverlapScore, "causalResult.overlapAndBalance.minimumOverlapScore");
    assertDecimal(
      maximumAbsoluteStandardizedDifference,
      "causalResult.overlapAndBalance.maximumAbsoluteStandardizedDifference",
      false,
    );
  }
  return {
    overlapStatus,
    balanceStatus,
    minimumOverlapScore,
    maximumAbsoluteStandardizedDifference,
    rationale,
  };
}

function parseHeterogeneity(value: unknown): HeterogeneityResult[] {
  const records = expectArray(value, "causalResult.heterogeneityResults").map((item, index) => {
    const field = `causalResult.heterogeneityResults[${index}]`;
    assertRecord(item, field);
    assertExactKeys(
      item,
      ["moderatorKey", "subgroupKey", "sampleSize", "estimate", "adjustedPValue"],
      field,
    );
    const moderatorKey = expectString(item.moderatorKey, `${field}.moderatorKey`);
    const subgroupKey = expectString(item.subgroupKey, `${field}.subgroupKey`);
    const estimate = expectString(item.estimate, `${field}.estimate`);
    const adjustedPValue = expectString(item.adjustedPValue, `${field}.adjustedPValue`);
    assertKey(moderatorKey, `${field}.moderatorKey`);
    assertKey(subgroupKey, `${field}.subgroupKey`);
    assertDecimal(estimate, `${field}.estimate`);
    assertProbability(adjustedPValue, `${field}.adjustedPValue`);
    return {
      moderatorKey,
      subgroupKey,
      sampleSize: expectInteger(item.sampleSize, `${field}.sampleSize`, 1, 1_000_000_000),
      estimate,
      adjustedPValue,
    };
  });
  const keys = records.map((record) => `${record.moderatorKey}:${record.subgroupKey}`);
  if (new Set(keys).size !== keys.length) throw new TypeError("heterogeneity cells must be unique");
  return records.sort((left, right) =>
    `${left.moderatorKey}:${left.subgroupKey}`.localeCompare(
      `${right.moderatorKey}:${right.subgroupKey}`,
    ),
  );
}

function parseMultiplicity(value: unknown): MultiplicityRecord {
  assertRecord(value, "causalResult.multiplicity");
  assertExactKeys(
    value,
    ["policy", "familyKeys", "hypothesesTested", "adjustmentApplied"],
    "causalResult.multiplicity",
  );
  const policy = expectString(value.policy, "causalResult.multiplicity.policy");
  assertEnum(
    policy,
    ["benjamini_hochberg", "family_wise_error", "hierarchical_partial_pooling"],
    "causalResult.multiplicity.policy",
  );
  const familyKeys = expectArray(value.familyKeys, "causalResult.multiplicity.familyKeys").map(
    (item, index) => expectString(item, `causalResult.multiplicity.familyKeys[${index}]`),
  );
  for (const familyKey of familyKeys) assertKey(familyKey, "causalResult.multiplicity.familyKey");
  if (familyKeys.length === 0 || new Set(familyKeys).size !== familyKeys.length) {
    throw new TypeError("multiplicity family keys must be non-empty and unique");
  }
  const hypothesesTested = expectInteger(
    value.hypothesesTested,
    "causalResult.multiplicity.hypothesesTested",
    1,
    1_000_000_000,
  );
  const adjustmentApplied = expectBoolean(
    value.adjustmentApplied,
    "causalResult.multiplicity.adjustmentApplied",
  );
  if (hypothesesTested > 1 && !adjustmentApplied) {
    throw new TypeError("multiple hypotheses require multiplicity adjustment");
  }
  return { policy, familyKeys: [...familyKeys].sort(), hypothesesTested, adjustmentApplied };
}

function parseLimitations(value: unknown): string[] {
  const limitations = expectArray(value, "causalResult.limitations").map((item, index) => {
    const text = expectString(item, `causalResult.limitations[${index}]`);
    assertText(text, `causalResult.limitations[${index}]`, 2_000);
    return text;
  });
  if (limitations.length === 0) throw new TypeError("causal result limitations must not be empty");
  return limitations;
}

function parseResultBody(value: unknown): CausalAnalysisResultInput {
  assertRecord(value, "causalResult");
  assertExactKeys(value, BODY_KEYS, "causalResult");
  if (value.schemaVersion !== 1) throw new TypeError("causalResult.schemaVersion must be 1");
  const resultId = expectString(value.resultId, "causalResult.resultId");
  const analysisId = expectString(value.analysisId, "causalResult.analysisId");
  const resultKind = expectString(value.resultKind, "causalResult.resultKind");
  const method = expectString(value.method, "causalResult.method");
  const estimandId = expectString(value.estimandId, "causalResult.estimandId");
  const estimandSha256 = expectString(value.estimandSha256, "causalResult.estimandSha256");
  const designId = expectString(value.designId, "causalResult.designId");
  const designSha256 = expectString(value.designSha256, "causalResult.designSha256");
  const planId = expectString(value.planId, "causalResult.planId");
  const planSha256 = expectString(value.planSha256, "causalResult.planSha256");
  const dataManifestId = expectString(value.dataManifestId, "causalResult.dataManifestId");
  const dataManifestSha256 = expectString(
    value.dataManifestSha256,
    "causalResult.dataManifestSha256",
  );
  const readinessReceiptId = expectString(
    value.readinessReceiptId,
    "causalResult.readinessReceiptId",
  );
  const readinessReceiptSha256 = expectString(
    value.readinessReceiptSha256,
    "causalResult.readinessReceiptSha256",
  );
  const analystId = expectString(value.analystId, "causalResult.analystId");
  const generatedAt = expectString(value.generatedAt, "causalResult.generatedAt");
  for (const [field, id] of [
    ["resultId", resultId],
    ["analysisId", analysisId],
    ["estimandId", estimandId],
    ["designId", designId],
    ["planId", planId],
    ["dataManifestId", dataManifestId],
    ["readinessReceiptId", readinessReceiptId],
    ["analystId", analystId],
  ] as const) {
    assertUuid(id, `causalResult.${field}`);
  }
  for (const [field, digest] of [
    ["estimandSha256", estimandSha256],
    ["designSha256", designSha256],
    ["planSha256", planSha256],
    ["dataManifestSha256", dataManifestSha256],
    ["readinessReceiptSha256", readinessReceiptSha256],
  ] as const) {
    assertSha256(digest, `causalResult.${field}`);
  }
  assertEnum(resultKind, RESULT_KINDS, "causalResult.resultKind");
  assertEnum(
    method,
    [
      "bayesian_causal_model",
      "causal_forest",
      "difference_in_differences",
      "dynamic_bayesian_network",
      "event_study",
      "heterogeneous_treatment_effects",
      "instrumental_variables",
      "intervention_analysis",
      "regression_discontinuity",
      "structural_equation_model",
      "structural_time_series",
      "synthetic_control",
    ],
    "causalResult.method",
  );
  assertIsoInstant(generatedAt, "causalResult.generatedAt");
  if (value.planDeviation !== "none") {
    throw new TypeError("causal result with plan deviation requires a new analysis-plan version");
  }
  if (value.automaticGraphPromotion !== "prohibited") {
    throw new TypeError("automatic causal-graph promotion is prohibited");
  }
  return {
    schemaVersion: 1,
    resultId,
    analysisId,
    resultKind,
    method,
    estimandId,
    estimandSha256,
    designId,
    designSha256,
    planId,
    planSha256,
    dataManifestId,
    dataManifestSha256,
    readinessReceiptId,
    readinessReceiptSha256,
    estimate: parseEstimate(value.estimate, resultKind),
    uncertainty: parseUncertainty(value.uncertainty),
    diagnostics: parseDiagnostics(value.diagnostics),
    falsificationResults: parseFalsification(value.falsificationResults),
    sensitivityResults: parseSensitivity(value.sensitivityResults),
    overlapAndBalance: parseOverlap(value.overlapAndBalance),
    heterogeneityResults: parseHeterogeneity(value.heterogeneityResults),
    multiplicity: parseMultiplicity(value.multiplicity),
    planDeviation: "none",
    automaticGraphPromotion: "prohibited",
    analystId,
    generatedAt,
    limitations: parseLimitations(value.limitations),
  };
}

function assertContext(input: CausalAnalysisResultInput, context: CausalResultContext): void {
  assertEstimandDefinitionIntegrity(context.estimand);
  assertIdentificationDesignIntegrity(context.design);
  assertAnalysisPlanIntegrity(context.plan);
  assertPointInTimeAnalysisManifestIntegrity(context.dataManifest);
  assertAnalysisReadinessReceiptIntegrity(context.readinessReceipt);
  if (
    input.analysisId !== context.plan.analysisId ||
    input.estimandId !== context.estimand.estimandId ||
    input.estimandSha256 !== context.estimand.manifestSha256 ||
    input.designId !== context.design.designId ||
    input.designSha256 !== context.design.manifestSha256 ||
    input.planId !== context.plan.planId ||
    input.planSha256 !== context.plan.manifestSha256 ||
    input.dataManifestId !== context.dataManifest.manifestId ||
    input.dataManifestSha256 !== context.dataManifest.manifestSha256 ||
    input.readinessReceiptId !== context.readinessReceipt.receiptId ||
    input.readinessReceiptSha256 !== context.readinessReceipt.receiptSha256 ||
    input.method !== context.design.method
  ) {
    throw new TypeError("causal result does not match its governed analysis context");
  }
  if (context.readinessReceipt.analysisId !== input.analysisId) {
    throw new TypeError("causal result readiness receipt belongs to another analysis");
  }
  if (compareInstant(input.generatedAt, context.readinessReceipt.checkedAt) < 0) {
    throw new TypeError("causal result cannot predate its readiness gate");
  }
  const diagnosticKeys = input.diagnostics.map((record) => record.diagnosticKey);
  if (
    diagnosticKeys.length !== context.plan.requiredDiagnosticKeys.length ||
    context.plan.requiredDiagnosticKeys.some((key) => !diagnosticKeys.includes(key))
  ) {
    throw new TypeError("causal result must report every predeclared diagnostic exactly once");
  }
  for (const threshold of context.plan.diagnosticThresholds) {
    const result = input.diagnostics.find(
      (record) => record.diagnosticKey === threshold.diagnosticKey,
    );
    if (!result || result.threshold !== threshold.threshold) {
      throw new TypeError(
        `diagnostic ${threshold.diagnosticKey} changed its predeclared threshold`,
      );
    }
    if (result.status !== evaluateDiagnosticThreshold(result.observedValue, threshold)) {
      throw new TypeError(
        `diagnostic ${threshold.diagnosticKey} status disagrees with its exact predeclared threshold`,
      );
    }
  }
  const falsificationByKey = new Map(
    input.falsificationResults.map((item) => [item.testKey, item]),
  );
  if (
    falsificationByKey.size !== context.plan.falsificationTests.length ||
    context.plan.falsificationTests.some(
      (planned) => falsificationByKey.get(planned.key)?.kind !== planned.kind,
    )
  ) {
    throw new TypeError("causal result must report every predeclared falsification test");
  }
  const sensitivityKeys = input.sensitivityResults.map((item) => item.analysisKey);
  if (
    sensitivityKeys.length !== context.plan.sensitivityAnalyses.length ||
    context.plan.sensitivityAnalyses.some((planned) => !sensitivityKeys.includes(planned.key))
  ) {
    throw new TypeError("causal result must report every predeclared sensitivity analysis");
  }
  if (!context.plan.heterogeneity.enabled && input.heterogeneityResults.length !== 0) {
    throw new TypeError("unplanned heterogeneity results are prohibited");
  }
  if (context.plan.heterogeneity.enabled) {
    for (const moderator of context.plan.heterogeneity.moderatorKeys) {
      if (!input.heterogeneityResults.some((result) => result.moderatorKey === moderator)) {
        throw new TypeError(`heterogeneity result is missing moderator ${moderator}`);
      }
    }
    const minimum = context.plan.heterogeneity.minimumSubgroupSize ?? Number.MAX_SAFE_INTEGER;
    if (input.heterogeneityResults.some((result) => result.sampleSize < minimum)) {
      throw new TypeError("heterogeneity subgroup is smaller than the predeclared minimum");
    }
  }
  if (
    input.multiplicity.familyKeys.length !== context.plan.multiplicityFamilyKeys.length ||
    context.plan.multiplicityFamilyKeys.some((key) => !input.multiplicity.familyKeys.includes(key))
  ) {
    throw new TypeError("multiplicity result does not match its predeclared family");
  }
}

export function createCausalAnalysisResult(
  value: unknown,
  context: CausalResultContext,
): Readonly<CausalAnalysisResult> {
  const parsed = parseResultBody(value);
  assertContext(parsed, context);
  const body = cloneCanonical(parsed);
  return deepFreeze({ ...body, resultSha256: digestJson(body) });
}

export function assertCausalAnalysisResultIntegrity(
  value: unknown,
): asserts value is CausalAnalysisResult {
  assertRecord(value, "causalResult");
  assertExactKeys(value, [...BODY_KEYS, "resultSha256"], "causalResult");
  const resultSha256 = expectString(value.resultSha256, "causalResult.resultSha256");
  assertSha256(resultSha256, "causalResult.resultSha256");
  const body = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "resultSha256"));
  const parsed = parseResultBody(body);
  for (const [field, keys] of [
    ["uncertainty", parsed.uncertainty.map((item) => item.kind)],
    ["diagnostics", parsed.diagnostics.map((item) => item.diagnosticKey)],
    ["falsificationResults", parsed.falsificationResults.map((item) => item.testKey)],
    ["sensitivityResults", parsed.sensitivityResults.map((item) => item.analysisKey)],
    ["multiplicity.familyKeys", parsed.multiplicity.familyKeys],
  ] as const) {
    assertSorted(keys, `causalResult.${field}`);
  }
  if (digestJson(parsed) !== resultSha256) {
    throw new TypeError("causal result digest does not match immutable content");
  }
}

export function resultPassesIdentificationEvidence(result: CausalAnalysisResult): boolean {
  assertCausalAnalysisResultIntegrity(result);
  return (
    result.resultKind === "identified_effect_candidate" &&
    result.diagnostics.every((item) => item.status === "passed") &&
    result.falsificationResults.every((item) => item.status === "passed") &&
    result.sensitivityResults.every((item) => item.status === "robust") &&
    result.overlapAndBalance.overlapStatus !== "inadequate" &&
    result.overlapAndBalance.balanceStatus !== "imbalanced"
  );
}
