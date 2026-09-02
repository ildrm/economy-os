import {
  assertIdentificationDesignIntegrity,
  type IdentificationDesign,
  requiredDiagnosticKeys,
} from "./designs.js";
import { assertEstimandDefinitionIntegrity, type EstimandDefinition } from "./estimands.js";
import {
  assertDecimal,
  assertEnum,
  assertExactKeys,
  assertIsoInstant,
  assertKey,
  assertRecord,
  assertSemver,
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
  expectString,
  sortedUnique,
} from "./internals.js";
import {
  assertPointInTimeAnalysisManifestIntegrity,
  type PointInTimeAnalysisManifest,
} from "./manifests.js";

export interface EstimatorExecutionContract {
  readonly estimatorKey: string;
  readonly implementationSha256: string;
  readonly tuningPolicy: string;
  readonly preprocessingFitThrough: string;
  readonly covariateMeasurementThrough: string;
}

export interface DiagnosticThreshold {
  readonly diagnosticKey: string;
  readonly metricKey: string;
  readonly comparator: "eq" | "gt" | "gte" | "lt" | "lte";
  readonly threshold: string;
}

export type DiagnosticThresholdStatus = "failed" | "inconclusive" | "passed";

export function evaluateDiagnosticThreshold(
  observedValue: string | null,
  threshold: DiagnosticThreshold,
): DiagnosticThresholdStatus {
  assertExactKeys(
    threshold,
    ["diagnosticKey", "metricKey", "comparator", "threshold"],
    "diagnosticThreshold",
  );
  assertKey(threshold.diagnosticKey, "diagnosticThreshold.diagnosticKey");
  assertKey(threshold.metricKey, "diagnosticThreshold.metricKey");
  assertEnum(
    threshold.comparator,
    ["eq", "gt", "gte", "lt", "lte"],
    "diagnosticThreshold.comparator",
  );
  if (observedValue === null) return "inconclusive";
  assertDecimal(observedValue, "diagnosticThreshold.observedValue");
  assertDecimal(threshold.threshold, "diagnosticThreshold.threshold");
  const comparison = compareDecimal(observedValue, threshold.threshold);
  const passed =
    threshold.comparator === "eq"
      ? comparison === 0
      : threshold.comparator === "gt"
        ? comparison > 0
        : threshold.comparator === "gte"
          ? comparison >= 0
          : threshold.comparator === "lt"
            ? comparison < 0
            : comparison <= 0;
  return passed ? "passed" : "failed";
}

export interface FalsificationPlan {
  readonly key: string;
  readonly kind:
    | "negative_control_exposure"
    | "negative_control_outcome"
    | "placebo_outcome"
    | "placebo_time"
    | "placebo_treatment";
  readonly procedure: string;
  readonly passCriterion: string;
}

export interface SensitivityPlan {
  readonly key: string;
  readonly parameterRange: string;
  readonly robustnessCriterion: string;
}

export interface HeterogeneityPlan {
  readonly enabled: boolean;
  readonly moderatorKeys: readonly string[];
  readonly minimumSubgroupSize: number | null;
  readonly multiplicityPolicy:
    | "benjamini_hochberg"
    | "family_wise_error"
    | "hierarchical_partial_pooling"
    | "not_applicable";
}

export interface AnalysisPlanInput {
  readonly schemaVersion: 1;
  readonly planId: string;
  readonly version: string;
  readonly analysisId: string;
  readonly estimandId: string;
  readonly estimandSha256: string;
  readonly designId: string;
  readonly designSha256: string;
  readonly registeredAt: string;
  readonly firstDataAccessAllowedAt: string;
  readonly treatmentStartsAt: string;
  readonly outcomeObservationEndsAt: string;
  readonly covariateKeys: readonly string[];
  readonly exclusionRules: readonly string[];
  readonly missingDataPolicy: string;
  readonly estimator: EstimatorExecutionContract;
  readonly requiredDiagnosticKeys: readonly string[];
  readonly diagnosticThresholds: readonly DiagnosticThreshold[];
  readonly falsificationTests: readonly FalsificationPlan[];
  readonly sensitivityAnalyses: readonly SensitivityPlan[];
  readonly heterogeneity: HeterogeneityPlan;
  readonly multiplicityFamilyKeys: readonly string[];
  readonly deviationPolicy: "requires_new_plan_version";
  readonly ownerId: string;
  readonly limitations: readonly string[];
}

export interface AnalysisPlan extends AnalysisPlanInput {
  readonly manifestSha256: string;
}

export interface AnalysisReadinessReceipt {
  readonly schemaVersion: 1;
  readonly receiptId: string;
  readonly analysisId: string;
  readonly planSha256: string;
  readonly designSha256: string;
  readonly estimandSha256: string;
  readonly dataManifestSha256: string;
  readonly checkedAt: string;
  readonly gates: readonly [
    "references_match",
    "plan_predeclared",
    "pre_treatment_fit",
    "point_in_time_cutoffs",
    "diagnostic_coverage",
  ];
  readonly receiptSha256: string;
}

const BODY_KEYS = [
  "schemaVersion",
  "planId",
  "version",
  "analysisId",
  "estimandId",
  "estimandSha256",
  "designId",
  "designSha256",
  "registeredAt",
  "firstDataAccessAllowedAt",
  "treatmentStartsAt",
  "outcomeObservationEndsAt",
  "covariateKeys",
  "exclusionRules",
  "missingDataPolicy",
  "estimator",
  "requiredDiagnosticKeys",
  "diagnosticThresholds",
  "falsificationTests",
  "sensitivityAnalyses",
  "heterogeneity",
  "multiplicityFamilyKeys",
  "deviationPolicy",
  "ownerId",
  "limitations",
] as const;

function textArray(value: unknown, field: string, allowEmpty = false): string[] {
  const result = expectArray(value, field).map((item, index) => {
    const text = expectString(item, `${field}[${index}]`);
    assertText(text, `${field}[${index}]`, 2_000);
    return text;
  });
  if (!allowEmpty && result.length === 0) throw new TypeError(`${field} must not be empty`);
  return result;
}

function keyArray(value: unknown, field: string, allowEmpty = false): string[] {
  return sortedUnique(
    expectArray(value, field).map((item, index) => expectString(item, `${field}[${index}]`)),
    field,
    assertKey,
    allowEmpty,
  );
}

function parseEstimator(value: unknown, treatmentStartsAt: string): EstimatorExecutionContract {
  assertRecord(value, "analysisPlan.estimator");
  assertExactKeys(
    value,
    [
      "estimatorKey",
      "implementationSha256",
      "tuningPolicy",
      "preprocessingFitThrough",
      "covariateMeasurementThrough",
    ],
    "analysisPlan.estimator",
  );
  const estimatorKey = expectString(value.estimatorKey, "analysisPlan.estimator.estimatorKey");
  const implementationSha256 = expectString(
    value.implementationSha256,
    "analysisPlan.estimator.implementationSha256",
  );
  const tuningPolicy = expectString(value.tuningPolicy, "analysisPlan.estimator.tuningPolicy");
  const preprocessingFitThrough = expectString(
    value.preprocessingFitThrough,
    "analysisPlan.estimator.preprocessingFitThrough",
  );
  const covariateMeasurementThrough = expectString(
    value.covariateMeasurementThrough,
    "analysisPlan.estimator.covariateMeasurementThrough",
  );
  assertKey(estimatorKey, "analysisPlan.estimator.estimatorKey");
  assertSha256(implementationSha256, "analysisPlan.estimator.implementationSha256");
  assertText(tuningPolicy, "analysisPlan.estimator.tuningPolicy");
  assertIsoInstant(preprocessingFitThrough, "analysisPlan.estimator.preprocessingFitThrough");
  assertIsoInstant(
    covariateMeasurementThrough,
    "analysisPlan.estimator.covariateMeasurementThrough",
  );
  if (
    compareInstant(preprocessingFitThrough, treatmentStartsAt) >= 0 ||
    compareInstant(covariateMeasurementThrough, treatmentStartsAt) >= 0
  ) {
    throw new TypeError("preprocessing and covariates must be frozen strictly before treatment");
  }
  return {
    estimatorKey,
    implementationSha256,
    tuningPolicy,
    preprocessingFitThrough,
    covariateMeasurementThrough,
  };
}

function parseThresholds(value: unknown, required: readonly string[]): DiagnosticThreshold[] {
  const thresholds = expectArray(value, "analysisPlan.diagnosticThresholds").map((item, index) => {
    const field = `analysisPlan.diagnosticThresholds[${index}]`;
    assertRecord(item, field);
    assertExactKeys(item, ["diagnosticKey", "metricKey", "comparator", "threshold"], field);
    const diagnosticKey = expectString(item.diagnosticKey, `${field}.diagnosticKey`);
    const metricKey = expectString(item.metricKey, `${field}.metricKey`);
    const comparator = expectString(item.comparator, `${field}.comparator`);
    const threshold = expectString(item.threshold, `${field}.threshold`);
    assertKey(diagnosticKey, `${field}.diagnosticKey`);
    assertKey(metricKey, `${field}.metricKey`);
    assertEnum(comparator, ["eq", "gt", "gte", "lt", "lte"], `${field}.comparator`);
    assertDecimal(threshold, `${field}.threshold`);
    return { diagnosticKey, metricKey, comparator, threshold };
  });
  const keys = thresholds.map((item) => item.diagnosticKey);
  if (new Set(keys).size !== keys.length)
    throw new TypeError("diagnostic thresholds must be unique");
  if (keys.length !== required.length || required.some((key) => !keys.includes(key))) {
    throw new TypeError(
      "diagnostic thresholds must exactly cover predeclared required diagnostics",
    );
  }
  return thresholds.sort((left, right) => left.diagnosticKey.localeCompare(right.diagnosticKey));
}

function parseFalsificationTests(value: unknown): FalsificationPlan[] {
  const tests = expectArray(value, "analysisPlan.falsificationTests").map((item, index) => {
    const field = `analysisPlan.falsificationTests[${index}]`;
    assertRecord(item, field);
    assertExactKeys(item, ["key", "kind", "procedure", "passCriterion"], field);
    const key = expectString(item.key, `${field}.key`);
    const kind = expectString(item.kind, `${field}.kind`);
    const procedure = expectString(item.procedure, `${field}.procedure`);
    const passCriterion = expectString(item.passCriterion, `${field}.passCriterion`);
    assertKey(key, `${field}.key`);
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
    assertText(procedure, `${field}.procedure`);
    assertText(passCriterion, `${field}.passCriterion`);
    return { key, kind, procedure, passCriterion };
  });
  const keys = tests.map((test) => test.key);
  if (new Set(keys).size !== keys.length)
    throw new TypeError("falsification test keys must be unique");
  if (!tests.some((test) => test.kind.startsWith("placebo_"))) {
    throw new TypeError("analysis plan requires a placebo test");
  }
  if (!tests.some((test) => test.kind.startsWith("negative_control_"))) {
    throw new TypeError("analysis plan requires a negative control");
  }
  return tests.sort((left, right) => left.key.localeCompare(right.key));
}

function parseSensitivityAnalyses(value: unknown): SensitivityPlan[] {
  const analyses = expectArray(value, "analysisPlan.sensitivityAnalyses").map((item, index) => {
    const field = `analysisPlan.sensitivityAnalyses[${index}]`;
    assertRecord(item, field);
    assertExactKeys(item, ["key", "parameterRange", "robustnessCriterion"], field);
    const key = expectString(item.key, `${field}.key`);
    const parameterRange = expectString(item.parameterRange, `${field}.parameterRange`);
    const robustnessCriterion = expectString(
      item.robustnessCriterion,
      `${field}.robustnessCriterion`,
    );
    assertKey(key, `${field}.key`);
    assertText(parameterRange, `${field}.parameterRange`);
    assertText(robustnessCriterion, `${field}.robustnessCriterion`);
    return { key, parameterRange, robustnessCriterion };
  });
  if (analyses.length === 0) throw new TypeError("analysis plan requires sensitivity analysis");
  const keys = analyses.map((analysis) => analysis.key);
  if (new Set(keys).size !== keys.length) throw new TypeError("sensitivity keys must be unique");
  return analyses.sort((left, right) => left.key.localeCompare(right.key));
}

function parseHeterogeneity(value: unknown): HeterogeneityPlan {
  assertRecord(value, "analysisPlan.heterogeneity");
  assertExactKeys(
    value,
    ["enabled", "moderatorKeys", "minimumSubgroupSize", "multiplicityPolicy"],
    "analysisPlan.heterogeneity",
  );
  const enabled = expectBoolean(value.enabled, "analysisPlan.heterogeneity.enabled");
  const moderatorKeys = keyArray(
    value.moderatorKeys,
    "analysisPlan.heterogeneity.moderatorKeys",
    !enabled,
  );
  const multiplicityPolicy = expectString(
    value.multiplicityPolicy,
    "analysisPlan.heterogeneity.multiplicityPolicy",
  );
  assertEnum(
    multiplicityPolicy,
    ["benjamini_hochberg", "family_wise_error", "hierarchical_partial_pooling", "not_applicable"],
    "analysisPlan.heterogeneity.multiplicityPolicy",
  );
  if (!enabled) {
    if (moderatorKeys.length !== 0 || value.minimumSubgroupSize !== null) {
      throw new TypeError("disabled heterogeneity must not declare moderators or subgroup size");
    }
    if (multiplicityPolicy !== "not_applicable") {
      throw new TypeError("disabled heterogeneity requires not_applicable multiplicity policy");
    }
    return { enabled, moderatorKeys, minimumSubgroupSize: null, multiplicityPolicy };
  }
  if (multiplicityPolicy === "not_applicable") {
    throw new TypeError("enabled heterogeneity requires multiplicity control");
  }
  return {
    enabled,
    moderatorKeys,
    minimumSubgroupSize: expectInteger(
      value.minimumSubgroupSize,
      "analysisPlan.heterogeneity.minimumSubgroupSize",
      20,
      1_000_000_000,
    ),
    multiplicityPolicy,
  };
}

function parsePlanBody(value: unknown): AnalysisPlanInput {
  assertRecord(value, "analysisPlan");
  assertExactKeys(value, BODY_KEYS, "analysisPlan");
  if (value.schemaVersion !== 1) throw new TypeError("analysisPlan.schemaVersion must be 1");
  const planId = expectString(value.planId, "analysisPlan.planId");
  const version = expectString(value.version, "analysisPlan.version");
  const analysisId = expectString(value.analysisId, "analysisPlan.analysisId");
  const estimandId = expectString(value.estimandId, "analysisPlan.estimandId");
  const estimandSha256 = expectString(value.estimandSha256, "analysisPlan.estimandSha256");
  const designId = expectString(value.designId, "analysisPlan.designId");
  const designSha256 = expectString(value.designSha256, "analysisPlan.designSha256");
  const registeredAt = expectString(value.registeredAt, "analysisPlan.registeredAt");
  const firstDataAccessAllowedAt = expectString(
    value.firstDataAccessAllowedAt,
    "analysisPlan.firstDataAccessAllowedAt",
  );
  const treatmentStartsAt = expectString(value.treatmentStartsAt, "analysisPlan.treatmentStartsAt");
  const outcomeObservationEndsAt = expectString(
    value.outcomeObservationEndsAt,
    "analysisPlan.outcomeObservationEndsAt",
  );
  const ownerId = expectString(value.ownerId, "analysisPlan.ownerId");
  for (const [field, id] of [
    ["planId", planId],
    ["analysisId", analysisId],
    ["estimandId", estimandId],
    ["designId", designId],
    ["ownerId", ownerId],
  ] as const) {
    assertUuid(id, `analysisPlan.${field}`);
  }
  assertSemver(version, "analysisPlan.version");
  assertSha256(estimandSha256, "analysisPlan.estimandSha256");
  assertSha256(designSha256, "analysisPlan.designSha256");
  for (const [field, instant] of [
    ["registeredAt", registeredAt],
    ["firstDataAccessAllowedAt", firstDataAccessAllowedAt],
    ["treatmentStartsAt", treatmentStartsAt],
    ["outcomeObservationEndsAt", outcomeObservationEndsAt],
  ] as const) {
    assertIsoInstant(instant, `analysisPlan.${field}`);
  }
  if (compareInstant(registeredAt, firstDataAccessAllowedAt) >= 0) {
    throw new TypeError("analysis plan must be registered before first data access");
  }
  if (compareInstant(treatmentStartsAt, outcomeObservationEndsAt) >= 0) {
    throw new TypeError("outcome observation must end after treatment starts");
  }
  const missingDataPolicy = expectString(value.missingDataPolicy, "analysisPlan.missingDataPolicy");
  assertText(missingDataPolicy, "analysisPlan.missingDataPolicy");
  const requiredDiagnostics = keyArray(
    value.requiredDiagnosticKeys,
    "analysisPlan.requiredDiagnosticKeys",
  );
  const deviationPolicy = expectString(value.deviationPolicy, "analysisPlan.deviationPolicy");
  assertEnum(deviationPolicy, ["requires_new_plan_version"], "analysisPlan.deviationPolicy");
  return {
    schemaVersion: 1,
    planId,
    version,
    analysisId,
    estimandId,
    estimandSha256,
    designId,
    designSha256,
    registeredAt,
    firstDataAccessAllowedAt,
    treatmentStartsAt,
    outcomeObservationEndsAt,
    covariateKeys: keyArray(value.covariateKeys, "analysisPlan.covariateKeys"),
    exclusionRules: textArray(value.exclusionRules, "analysisPlan.exclusionRules"),
    missingDataPolicy,
    estimator: parseEstimator(value.estimator, treatmentStartsAt),
    requiredDiagnosticKeys: requiredDiagnostics,
    diagnosticThresholds: parseThresholds(value.diagnosticThresholds, requiredDiagnostics),
    falsificationTests: parseFalsificationTests(value.falsificationTests),
    sensitivityAnalyses: parseSensitivityAnalyses(value.sensitivityAnalyses),
    heterogeneity: parseHeterogeneity(value.heterogeneity),
    multiplicityFamilyKeys: keyArray(
      value.multiplicityFamilyKeys,
      "analysisPlan.multiplicityFamilyKeys",
    ),
    deviationPolicy,
    ownerId,
    limitations: textArray(value.limitations, "analysisPlan.limitations"),
  };
}

export function createAnalysisPlan(value: unknown): Readonly<AnalysisPlan> {
  const body = cloneCanonical(parsePlanBody(value));
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function assertAnalysisPlanIntegrity(value: unknown): asserts value is AnalysisPlan {
  assertRecord(value, "analysisPlan");
  assertExactKeys(value, [...BODY_KEYS, "manifestSha256"], "analysisPlan");
  const manifestSha256 = expectString(value.manifestSha256, "analysisPlan.manifestSha256");
  assertSha256(manifestSha256, "analysisPlan.manifestSha256");
  const body = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "manifestSha256"),
  );
  const parsed = parsePlanBody(body);
  for (const [field, values] of [
    ["requiredDiagnosticKeys", parsed.requiredDiagnosticKeys],
    ["covariateKeys", parsed.covariateKeys],
    ["multiplicityFamilyKeys", parsed.multiplicityFamilyKeys],
  ] as const) {
    assertSorted(values, `analysisPlan.${field}`);
  }
  if (digestJson(parsed) !== manifestSha256) {
    throw new TypeError("analysis plan digest does not match immutable content");
  }
}

export interface AnalysisReadinessInput {
  readonly receiptId: string;
  readonly plan: AnalysisPlan;
  readonly design: IdentificationDesign;
  readonly estimand: EstimandDefinition;
  readonly dataManifest: PointInTimeAnalysisManifest;
  readonly checkedAt: string;
}

export function createAnalysisReadinessReceipt(
  input: AnalysisReadinessInput,
): Readonly<AnalysisReadinessReceipt> {
  assertAnalysisPlanIntegrity(input.plan);
  assertIdentificationDesignIntegrity(input.design);
  assertEstimandDefinitionIntegrity(input.estimand);
  assertPointInTimeAnalysisManifestIntegrity(input.dataManifest);
  assertUuid(input.receiptId, "analysisReadiness.receiptId");
  assertIsoInstant(input.checkedAt, "analysisReadiness.checkedAt");
  if (compareInstant(input.checkedAt, input.dataManifest.frozenAt) < 0) {
    throw new TypeError("readiness cannot be checked before the data manifest is frozen");
  }
  if (
    input.plan.estimandId !== input.estimand.estimandId ||
    input.plan.estimandSha256 !== input.estimand.manifestSha256 ||
    input.design.estimandId !== input.estimand.estimandId ||
    input.design.estimandSha256 !== input.estimand.manifestSha256
  ) {
    throw new TypeError("analysis readiness estimand references do not match");
  }
  if (
    input.plan.designId !== input.design.designId ||
    input.plan.designSha256 !== input.design.manifestSha256
  ) {
    throw new TypeError("analysis readiness design references do not match");
  }
  if (
    input.dataManifest.analysisId !== input.plan.analysisId ||
    input.dataManifest.estimand.id !== input.estimand.estimandId ||
    input.dataManifest.estimand.sha256 !== input.estimand.manifestSha256 ||
    input.dataManifest.identificationDesign.id !== input.design.designId ||
    input.dataManifest.identificationDesign.sha256 !== input.design.manifestSha256 ||
    input.dataManifest.analysisPlan.id !== input.plan.planId ||
    input.dataManifest.analysisPlan.sha256 !== input.plan.manifestSha256
  ) {
    throw new TypeError("point-in-time manifest references do not match governed analysis");
  }
  if (
    input.plan.treatmentStartsAt !== input.design.treatmentStartsAt ||
    compareInstant(
      input.plan.estimator.preprocessingFitThrough,
      input.design.preTreatmentWindow.end,
    ) > 0 ||
    compareInstant(
      input.plan.estimator.covariateMeasurementThrough,
      input.design.preTreatmentWindow.end,
    ) > 0
  ) {
    throw new TypeError("analysis plan violates its pre-treatment design window");
  }
  if (
    compareInstant(
      input.dataManifest.model.fitThrough,
      input.plan.estimator.preprocessingFitThrough,
    ) > 0
  ) {
    throw new TypeError("frozen model artifact exceeds the predeclared preprocessing fit cutoff");
  }
  if (
    compareInstant(
      input.dataManifest.cutoffs.knowledgeCutoff,
      input.plan.outcomeObservationEndsAt,
    ) < 0
  ) {
    throw new TypeError("knowledge cutoff does not cover the outcome observation window");
  }
  if (compareInstant(input.plan.firstDataAccessAllowedAt, input.dataManifest.frozenAt) > 0) {
    throw new TypeError("data manifest was frozen before data access was allowed");
  }
  const designDiagnostics = requiredDiagnosticKeys(input.design);
  if (
    designDiagnostics.length !== input.plan.requiredDiagnosticKeys.length ||
    designDiagnostics.some((key) => !input.plan.requiredDiagnosticKeys.includes(key))
  ) {
    throw new TypeError("analysis plan does not cover all method-specific diagnostics");
  }
  const body = {
    schemaVersion: 1 as const,
    receiptId: input.receiptId,
    analysisId: input.plan.analysisId,
    planSha256: input.plan.manifestSha256,
    designSha256: input.design.manifestSha256,
    estimandSha256: input.estimand.manifestSha256,
    dataManifestSha256: input.dataManifest.manifestSha256,
    checkedAt: input.checkedAt,
    gates: [
      "references_match",
      "plan_predeclared",
      "pre_treatment_fit",
      "point_in_time_cutoffs",
      "diagnostic_coverage",
    ] as const,
  };
  return deepFreeze({ ...body, receiptSha256: digestJson(body) });
}

export function assertAnalysisReadinessReceiptIntegrity(
  value: unknown,
): asserts value is AnalysisReadinessReceipt {
  assertRecord(value, "analysisReadiness");
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "receiptId",
      "analysisId",
      "planSha256",
      "designSha256",
      "estimandSha256",
      "dataManifestSha256",
      "checkedAt",
      "gates",
      "receiptSha256",
    ],
    "analysisReadiness",
  );
  if (value.schemaVersion !== 1) throw new TypeError("analysisReadiness.schemaVersion must be 1");
  const receiptId = expectString(value.receiptId, "analysisReadiness.receiptId");
  const analysisId = expectString(value.analysisId, "analysisReadiness.analysisId");
  assertUuid(receiptId, "analysisReadiness.receiptId");
  assertUuid(analysisId, "analysisReadiness.analysisId");
  const body: Omit<AnalysisReadinessReceipt, "receiptSha256"> = {
    schemaVersion: 1,
    receiptId,
    analysisId,
    planSha256: expectString(value.planSha256, "analysisReadiness.planSha256"),
    designSha256: expectString(value.designSha256, "analysisReadiness.designSha256"),
    estimandSha256: expectString(value.estimandSha256, "analysisReadiness.estimandSha256"),
    dataManifestSha256: expectString(
      value.dataManifestSha256,
      "analysisReadiness.dataManifestSha256",
    ),
    checkedAt: expectString(value.checkedAt, "analysisReadiness.checkedAt"),
    gates: expectArray(
      value.gates,
      "analysisReadiness.gates",
    ) as unknown as AnalysisReadinessReceipt["gates"],
  };
  for (const [field, digest] of [
    ["planSha256", body.planSha256],
    ["designSha256", body.designSha256],
    ["estimandSha256", body.estimandSha256],
    ["dataManifestSha256", body.dataManifestSha256],
  ] as const) {
    assertSha256(digest, `analysisReadiness.${field}`);
  }
  assertIsoInstant(body.checkedAt, "analysisReadiness.checkedAt");
  const expectedGates = [
    "references_match",
    "plan_predeclared",
    "pre_treatment_fit",
    "point_in_time_cutoffs",
    "diagnostic_coverage",
  ];
  if (
    body.gates.length !== expectedGates.length ||
    body.gates.some((gate, index) => gate !== expectedGates[index])
  ) {
    throw new TypeError("analysis readiness gates are incomplete or reordered");
  }
  const receiptSha256 = expectString(value.receiptSha256, "analysisReadiness.receiptSha256");
  assertSha256(receiptSha256, "analysisReadiness.receiptSha256");
  if (digestJson(body) !== receiptSha256) {
    throw new TypeError("analysis readiness receipt digest does not match");
  }
}
