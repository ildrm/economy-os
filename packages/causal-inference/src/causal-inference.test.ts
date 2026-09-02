import { describe, expect, it } from "vitest";
import {
  appendCausalResult,
  appendIndependentReviewDecision,
  assertAnalysisReadinessReceiptIntegrity,
  assertAutomaticGraphPromotionProhibited,
  assertCausalAnalysisResultIntegrity,
  assertCausalResultRegistryIntegrity,
  assertClaimLanguageAuthorizationIntegrity,
  assertEstimandDefinitionIntegrity,
  assertIdentificationDesignIntegrity,
  assertIndependentReviewLedgerIntegrity,
  assertPointInTimeAnalysisManifestIntegrity,
  assertResultRegistryReplayIntegrity,
  authorizeClaimLanguage,
  type CausalAnalysisResult,
  type CausalAnalysisResultInput,
  type CausalResultContext,
  createAnalysisPlan,
  createAnalysisReadinessReceipt,
  createCausalAnalysisResult,
  createEstimandDefinition,
  createIdentificationDesign,
  createPointInTimeAnalysisManifest,
  type EstimandDefinition,
  evaluateDiagnosticThreshold,
  IDENTIFICATION_METHODS,
  type IdentificationDesign,
  type IdentificationMethod,
  openCausalResultRegistry,
  openIndependentReviewLedger,
  REQUIRED_ASSUMPTIONS,
  REQUIRED_DIAGNOSTICS,
  replayCausalResultRegistry,
  resultPassesIdentificationEvidence,
} from "./index.js";
import { digestJson } from "./internals.js";

const U = Array.from(
  { length: 30 },
  (_, index) => `00000000-0000-8000-8000-${(index + 1).toString().padStart(12, "0")}`,
);
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);

function id(index: number): string {
  const value = U[index];
  if (!value) throw new Error(`missing UUID fixture ${index}`);
  return value;
}

function mutable<T>(value: T): T {
  return structuredClone(value);
}

function estimandInput(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    estimandId: id(0),
    estimandKey: "fx_policy.output_effect",
    version: "1.0.0",
    population: {
      unitType: "country",
      unitDefinition: "Eligible sovereign economies with monthly output observations.",
      inclusionCriteria: ["Published exposure and outcome data before each cutoff."],
      exclusionCriteria: ["Active armed conflict at time zero."],
      geographicScope: ["tur", "irn"],
    },
    treatment: {
      exposureKey: "policy.fx_intervention",
      exposureType: "binary",
      assignmentUnit: "country",
      interventionDescription: "Publicly announced foreign-exchange intervention.",
      versionsHeldConstant: ["Spot-market purchase under the declared operating rule."],
    },
    comparator: {
      kind: "no_exposure",
      description: "No intervention during the aligned time-zero window.",
      valueLabel: null,
    },
    outcome: {
      outcomeKey: "macro.output_index",
      description: "First-release output index.",
      unit: "index_points",
      aggregationLevel: "country_month",
    },
    timeZero: {
      anchorKey: "announcement_time",
      definition: "UTC instant of the first official intervention announcement.",
      alignmentToleranceDays: 1,
    },
    outcomeWindow: { startOffsetDays: 1, endOffsetDays: 180, horizonDays: 180 },
    aggregation: {
      summary: "average_treatment_effect",
      weighting: "equal_unit",
      weightingDescription: "Each eligible country receives equal weight.",
    },
    interference: {
      scope: "partial_interference",
      clusterKey: "trade_bloc",
      exposureMapping: "Interference is permitted only within predeclared trade blocs.",
    },
    sutva: {
      consistencyStatement: "Observed exposure maps to the declared intervention version.",
      hiddenVersionsPolicy: "Undocumented implementation variants invalidate the estimand.",
      interferenceStatement: "Cross-bloc spillovers are assumed absent and tested as a limitation.",
    },
    ownerId: id(1),
    createdAt: "2024-01-01T00:00:00Z",
    limitations: ["The estimand does not transport beyond the declared population."],
  };
}

function specification(method: IdentificationMethod): Record<string, unknown> {
  switch (method) {
    case "difference_in_differences":
      return {
        treatedGroupKey: "treated",
        comparisonGroupKeys: ["control_b", "control_a"],
        treatmentTiming: "staggered",
        effectAggregation: "group_time",
        anticipationWindowDays: 14,
      };
    case "synthetic_control":
      return {
        treatedUnitKey: "treated",
        donorPoolKeys: ["donor_b", "donor_a"],
        predictorKeys: ["inflation", "output"],
        pretreatmentPeriods: 24,
        fitMetric: "rmspe",
      };
    case "instrumental_variables":
      return {
        instrumentKeys: ["instrument_z"],
        endogenousExposureKey: "policy_exposure",
        stageModel: "linear_2sls",
        estimandPopulation: "compliers",
      };
    case "regression_discontinuity":
      return {
        runningVariableKey: "eligibility_score",
        cutoff: "50",
        assignmentSide: "above",
        design: "sharp",
        bandwidthPolicy: "Predeclared local-linear MSE-optimal bandwidth with sensitivity grid.",
        polynomialOrder: 1,
      };
    case "event_study":
      return {
        eventKey: "policy_announcement",
        preEventDays: 30,
        postEventDays: 60,
        comparisonModel: "Predeclared market-adjusted counterfactual.",
        clusteredBy: "event_cluster",
        concurrentShockPolicy: "Exclude event windows with independently dated major shocks.",
      };
    case "intervention_analysis":
      return {
        interventionKey: "policy_start",
        responseSeriesKey: "output_index",
        controlSeriesKeys: ["regional_output"],
        interruptionForm: "step",
        maximumLagDays: 90,
      };
    case "structural_time_series":
      return {
        responseSeriesKey: "output_index",
        controlSeriesKeys: ["regional_output"],
        components: ["local_level", "seasonality"],
        priorManifestSha256: A,
        posteriorDraws: 2_000,
      };
    case "structural_equation_model":
      return {
        equationManifestSha256: A,
        measurementModelSha256: B,
        identifiedPathKeys: ["policy_to_output"],
        estimatorKey: "robust_ml",
      };
    case "bayesian_causal_model":
      return {
        dagSha256: A,
        priorManifestSha256: B,
        likelihoodKey: "gaussian",
        posteriorDraws: 2_000,
        chains: 4,
      };
    case "causal_forest":
      return {
        featureKeys: ["inflation", "output"],
        nuisanceModelSha256: A,
        crossFitFolds: 5,
        honestyFraction: "0.5",
        minimumLeafSize: 20,
      };
    case "heterogeneous_treatment_effects":
      return {
        baseDesignId: id(20),
        baseDesignSha256: A,
        moderatorKeys: ["income_group"],
        minimumSubgroupSize: 50,
        multiplicityPolicy: "benjamini_hochberg",
      };
    case "dynamic_bayesian_network":
      return {
        graphSha256: A,
        nodeKeys: ["output", "policy"],
        maximumLag: 3,
        timeSlices: 48,
        interventionNodeKeys: ["policy"],
      };
  }
}

function designInput(
  method: IdentificationMethod,
  estimand: EstimandDefinition,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    designId: id(2),
    version: "1.0.0",
    estimandId: estimand.estimandId,
    estimandSha256: estimand.manifestSha256,
    method,
    preTreatmentWindow: { start: "2020-01-01T00:00:00Z", end: "2024-12-01T00:00:00Z" },
    treatmentStartsAt: "2025-01-01T00:00:00Z",
    assumptions: REQUIRED_ASSUMPTIONS[method].map((key) => ({
      key,
      statement: `The ${key} condition is declared for the target population.`,
      assessmentPlan: `Assess ${key} with predeclared evidence and report failures.`,
      falsifiable: true,
    })),
    diagnostics: REQUIRED_DIAGNOSTICS[method].map((key) => ({
      key,
      procedure: `Run the predeclared ${key} diagnostic on frozen data.`,
      passCriterion: `${key} metric must be no greater than 0.1.`,
      required: true,
    })),
    specification: specification(method),
    ownerId: id(1),
    createdAt: "2024-01-01T00:00:00Z",
    limitations: ["Identification depends on the declared assumptions and diagnostics."],
  };
}

function governedContext(
  method: IdentificationMethod = "difference_in_differences",
  heterogeneityEnabled = false,
) {
  const estimand = createEstimandDefinition(estimandInput());
  const design = createIdentificationDesign(designInput(method, estimand));
  const plan = createAnalysisPlan({
    schemaVersion: 1,
    planId: id(3),
    version: "1.0.0",
    analysisId: id(4),
    estimandId: estimand.estimandId,
    estimandSha256: estimand.manifestSha256,
    designId: design.designId,
    designSha256: design.manifestSha256,
    registeredAt: "2024-01-01T00:00:00Z",
    firstDataAccessAllowedAt: "2024-01-02T00:00:00Z",
    treatmentStartsAt: design.treatmentStartsAt,
    outcomeObservationEndsAt: "2025-06-30T00:00:00Z",
    covariateKeys: ["output", "inflation"],
    exclusionRules: ["Exclude units missing the treatment assignment at time zero."],
    missingDataPolicy: "Report missingness and apply only the predeclared within-fold procedure.",
    estimator: {
      estimatorKey: "group_time_att",
      implementationSha256: A,
      tuningPolicy: "No tuning after the registered first-data-access boundary.",
      preprocessingFitThrough: "2024-11-30T00:00:00Z",
      covariateMeasurementThrough: "2024-11-30T00:00:00Z",
    },
    requiredDiagnosticKeys: REQUIRED_DIAGNOSTICS[method],
    diagnosticThresholds: REQUIRED_DIAGNOSTICS[method].map((diagnosticKey) => ({
      diagnosticKey,
      metricKey: `${diagnosticKey}.metric`,
      comparator: "lte",
      threshold: "0.1",
    })),
    falsificationTests: [
      {
        key: "negative_outcome",
        kind: "negative_control_outcome",
        procedure: "Estimate the specification on a predeclared unaffected outcome.",
        passCriterion: "The negative-control result must meet its equivalence margin.",
      },
      {
        key: "placebo_timing",
        kind: "placebo_time",
        procedure: "Move treatment to a pre-treatment placebo date.",
        passCriterion: "The placebo-time effect must meet its equivalence margin.",
      },
    ],
    sensitivityAnalyses: [
      {
        key: "window_grid",
        parameterRange: "Pre-treatment windows from 18 through 48 months.",
        robustnessCriterion: "Direction and substantive conclusion remain stable.",
      },
    ],
    heterogeneity: {
      enabled: heterogeneityEnabled,
      moderatorKeys: heterogeneityEnabled ? ["income_group"] : [],
      minimumSubgroupSize: heterogeneityEnabled ? 50 : null,
      multiplicityPolicy: heterogeneityEnabled ? "benjamini_hochberg" : "not_applicable",
    },
    multiplicityFamilyKeys: ["primary_outcome"],
    deviationPolicy: "requires_new_plan_version",
    ownerId: id(1),
    limitations: ["The plan governs records but does not execute an estimator."],
  });
  const dataManifest = createPointInTimeAnalysisManifest({
    schemaVersion: 1,
    manifestId: id(5),
    analysisId: plan.analysisId,
    estimand: { id: estimand.estimandId, sha256: estimand.manifestSha256 },
    identificationDesign: { id: design.designId, sha256: design.manifestSha256 },
    analysisPlan: { id: plan.planId, sha256: plan.manifestSha256 },
    cutoffs: {
      knowledgeCutoff: "2025-07-01T00:00:00Z",
      systemCutoff: "2025-07-01T00:00:00Z",
    },
    cohort: {
      snapshotId: id(6),
      snapshotSha256: A,
      selectedAsOf: "2024-12-01T00:00:00Z",
      latestUnitAvailableAt: "2024-11-30T00:00:00Z",
      latestUnitSystemRecordedAt: "2024-12-01T00:00:00Z",
      populationCount: 120,
    },
    datasets: [
      {
        datasetKey: "outcomes",
        snapshotId: id(7),
        snapshotSha256: B,
        latestAvailableAt: "2025-06-30T00:00:00Z",
        latestSystemRecordedAt: "2025-06-30T12:00:00Z",
      },
      {
        datasetKey: "covariates",
        snapshotId: id(8),
        snapshotSha256: C,
        latestAvailableAt: "2024-11-30T00:00:00Z",
        latestSystemRecordedAt: "2024-12-01T00:00:00Z",
      },
    ],
    model: {
      artifactId: id(9),
      version: "1.0.0",
      family: "group_time_att",
      artifactSha256: A,
      trainingDataSha256: B,
      fitThrough: "2024-11-01T00:00:00Z",
    },
    code: { commitSha256: A, packageLockSha256: B, environmentSha256: C },
    configuration: { configurationSha256: D, randomSeeds: [23, 11] },
    frozenAt: "2025-07-02T00:00:00Z",
  });
  const readinessReceipt = createAnalysisReadinessReceipt({
    receiptId: id(10),
    plan,
    design,
    estimand,
    dataManifest,
    checkedAt: "2025-07-03T00:00:00Z",
  });
  return { estimand, design, plan, dataManifest, readinessReceipt };
}

function resultInput(
  context: CausalResultContext,
  overrides: Partial<CausalAnalysisResultInput> = {},
): CausalAnalysisResultInput {
  return {
    schemaVersion: 1,
    resultId: id(11),
    analysisId: context.plan.analysisId,
    resultKind: "identified_effect_candidate",
    method: context.design.method,
    estimandId: context.estimand.estimandId,
    estimandSha256: context.estimand.manifestSha256,
    designId: context.design.designId,
    designSha256: context.design.manifestSha256,
    planId: context.plan.planId,
    planSha256: context.plan.manifestSha256,
    dataManifestId: context.dataManifest.manifestId,
    dataManifestSha256: context.dataManifest.manifestSha256,
    readinessReceiptId: context.readinessReceipt.receiptId,
    readinessReceiptSha256: context.readinessReceipt.receiptSha256,
    estimate: {
      scale: "index_points",
      pointEstimate: "1.25",
      standardError: "0.3",
      interval: { lower: "0.66", upper: "1.84", level: "0.95", kind: "confidence" },
    },
    uncertainty: [
      {
        kind: "statistical",
        magnitude: "0.3",
        description: "Sampling uncertainty.",
        evidenceSha256: A,
      },
      {
        kind: "model",
        magnitude: "0.2",
        description: "Specification uncertainty.",
        evidenceSha256: B,
      },
      {
        kind: "data_measurement",
        magnitude: "0.1",
        description: "Measurement and revision uncertainty.",
        evidenceSha256: C,
      },
      {
        kind: "identification",
        magnitude: null,
        description: "Unquantified uncertainty in identifying assumptions.",
        evidenceSha256: D,
      },
    ],
    diagnostics: context.plan.diagnosticThresholds.map((threshold) => ({
      diagnosticKey: threshold.diagnosticKey,
      status: "passed",
      observedValue: "0.05",
      threshold: threshold.threshold,
      evidenceSha256: A,
    })),
    falsificationResults: context.plan.falsificationTests.map((test) => ({
      testKey: test.key,
      kind: test.kind,
      status: "passed",
      summary: "The predeclared falsification criterion passed.",
      evidenceSha256: B,
    })),
    sensitivityResults: context.plan.sensitivityAnalyses.map((analysis) => ({
      analysisKey: analysis.key,
      status: "robust",
      minimumEstimate: "0.9",
      maximumEstimate: "1.4",
      summary: "The conclusion is stable over the predeclared grid.",
      evidenceSha256: C,
    })),
    overlapAndBalance: {
      overlapStatus: "adequate",
      balanceStatus: "balanced",
      minimumOverlapScore: "0.2",
      maximumAbsoluteStandardizedDifference: "0.08",
      rationale: "Overlap and balance meet the predeclared thresholds.",
    },
    heterogeneityResults: context.plan.heterogeneity.enabled
      ? [
          {
            moderatorKey: "income_group",
            subgroupKey: "upper_middle",
            sampleSize: 60,
            estimate: "1.1",
            adjustedPValue: "0.04",
          },
        ]
      : [],
    multiplicity: {
      policy: context.plan.heterogeneity.enabled ? "benjamini_hochberg" : "family_wise_error",
      familyKeys: context.plan.multiplicityFamilyKeys,
      hypothesesTested: context.plan.heterogeneity.enabled ? 2 : 1,
      adjustmentApplied: context.plan.heterogeneity.enabled,
    },
    planDeviation: "none",
    automaticGraphPromotion: "prohibited",
    analystId: id(12),
    generatedAt: "2025-07-04T00:00:00Z",
    limitations: ["This record is not causal language authorization."],
    ...overrides,
  };
}

function validResult(context = governedContext()): CausalAnalysisResult {
  return createCausalAnalysisResult(resultInput(context), context);
}

function decisionInput(
  result: CausalAnalysisResult,
  sequence: number,
  role: "independent_validator" | "model_risk_manager",
  reviewerId: string,
  decidedAt: string,
  previousDecisionSha256: string | null,
) {
  return {
    schemaVersion: 1,
    decisionId: id(13 + sequence),
    resultId: result.resultId,
    resultSha256: result.resultSha256,
    sequence,
    role,
    decision: "approve",
    reviewerId,
    decidedAt,
    rationale: "Independent reproduction and limitations review passed the declared scope.",
    evidenceSha256: [B, A],
    previousDecisionSha256,
  };
}

describe("versioned estimands and identification designs", () => {
  it("creates an immutable exact estimand and detects content tampering", () => {
    const estimand = createEstimandDefinition(estimandInput());
    expect(estimand.population.geographicScope).toEqual(["irn", "tur"]);
    expect(Object.isFrozen(estimand.treatment)).toBe(true);
    assertEstimandDefinitionIntegrity(estimand);

    const tampered = mutable(estimand);
    (tampered.outcome as { description: string }).description = "Changed outcome.";
    expect(() => assertEstimandDefinitionIntegrity(tampered)).toThrow(/digest/);
  });

  it.each([
    [
      "bad comparator",
      (input: Record<string, unknown>) => ({
        ...input,
        comparator: { kind: "trajectory", description: "Counterfactual.", valueLabel: null },
      }),
    ],
    [
      "window mismatch",
      (input: Record<string, unknown>) => ({
        ...input,
        outcomeWindow: { startOffsetDays: 1, endOffsetDays: 180, horizonDays: 90 },
      }),
    ],
    [
      "missing interference cluster",
      (input: Record<string, unknown>) => ({
        ...input,
        interference: {
          scope: "network_interference",
          clusterKey: null,
          exposureMapping: "Network exposure.",
        },
      }),
    ],
    ["blank limitation", (input: Record<string, unknown>) => ({ ...input, limitations: [" "] })],
  ])("rejects an estimand with %s", (_label, mutate) => {
    expect(() => createEstimandDefinition(mutate(estimandInput()))).toThrow(TypeError);
  });

  it.each(IDENTIFICATION_METHODS)("validates and seals the %s design", (method) => {
    const estimand = createEstimandDefinition(estimandInput());
    const design = createIdentificationDesign(designInput(method, estimand));
    expect(design.method).toBe(method);
    expect(design.assumptions.map((item) => item.key)).toEqual(REQUIRED_ASSUMPTIONS[method]);
    assertIdentificationDesignIntegrity(design);
  });

  it.each(IDENTIFICATION_METHODS)("rejects %s when a method assumption is omitted", (method) => {
    const estimand = createEstimandDefinition(estimandInput());
    const input = designInput(method, estimand);
    input.assumptions = (input.assumptions as unknown[]).slice(1);
    expect(() => createIdentificationDesign(input)).toThrow(/requires assumption/);
  });

  it.each([
    [
      "difference_in_differences",
      {
        treatedGroupKey: "treated",
        comparisonGroupKeys: ["treated"],
        treatmentTiming: "common",
        effectAggregation: "group_time",
        anticipationWindowDays: 0,
      },
    ],
    [
      "synthetic_control",
      {
        treatedUnitKey: "treated",
        donorPoolKeys: ["treated"],
        predictorKeys: ["output"],
        pretreatmentPeriods: 12,
        fitMetric: "mse",
      },
    ],
    [
      "instrumental_variables",
      {
        instrumentKeys: [],
        endogenousExposureKey: "x",
        stageModel: "linear_2sls",
        estimandPopulation: "compliers",
      },
    ],
    [
      "regression_discontinuity",
      {
        runningVariableKey: "score",
        cutoff: "01",
        assignmentSide: "above",
        design: "sharp",
        bandwidthPolicy: "Fixed before access.",
        polynomialOrder: 1,
      },
    ],
    [
      "event_study",
      {
        eventKey: "event",
        preEventDays: 0,
        postEventDays: 3,
        comparisonModel: "Model.",
        clusteredBy: "cluster",
        concurrentShockPolicy: "Exclude shocks.",
      },
    ],
    [
      "intervention_analysis",
      {
        interventionKey: "event",
        responseSeriesKey: "y",
        controlSeriesKeys: [],
        interruptionForm: "step",
        maximumLagDays: 1,
      },
    ],
    [
      "structural_time_series",
      {
        responseSeriesKey: "y",
        controlSeriesKeys: ["x"],
        components: ["level"],
        priorManifestSha256: A,
        posteriorDraws: 10,
      },
    ],
    [
      "structural_equation_model",
      {
        equationManifestSha256: "bad",
        measurementModelSha256: B,
        identifiedPathKeys: ["path"],
        estimatorKey: "ml",
      },
    ],
    [
      "bayesian_causal_model",
      {
        dagSha256: A,
        priorManifestSha256: B,
        likelihoodKey: "normal",
        posteriorDraws: 1_000,
        chains: 1,
      },
    ],
    [
      "causal_forest",
      {
        featureKeys: ["x"],
        nuisanceModelSha256: A,
        crossFitFolds: 2,
        honestyFraction: "1",
        minimumLeafSize: 10,
      },
    ],
    [
      "heterogeneous_treatment_effects",
      {
        baseDesignId: id(20),
        baseDesignSha256: A,
        moderatorKeys: ["group"],
        minimumSubgroupSize: 2,
        multiplicityPolicy: "benjamini_hochberg",
      },
    ],
    [
      "dynamic_bayesian_network",
      {
        graphSha256: A,
        nodeKeys: ["x"],
        maximumLag: 1,
        timeSlices: 4,
        interventionNodeKeys: ["y"],
      },
    ],
  ] as const)("enforces the method-specific %s specification", (method, invalidSpecification) => {
    const estimand = createEstimandDefinition(estimandInput());
    expect(() =>
      createIdentificationDesign({
        ...designInput(method, estimand),
        specification: invalidSpecification,
      }),
    ).toThrow(TypeError);
  });
});

describe("point-in-time manifests and predeclared readiness", () => {
  it("freezes separate cohort, dataset, model, code, and configuration pointers", () => {
    const context = governedContext();
    expect(context.dataManifest.datasets.map((dataset) => dataset.datasetKey)).toEqual([
      "covariates",
      "outcomes",
    ]);
    expect(context.dataManifest.configuration.randomSeeds).toEqual([11, 23]);
    assertPointInTimeAnalysisManifestIntegrity(context.dataManifest);
    assertAnalysisReadinessReceiptIntegrity(context.readinessReceipt);
  });

  it.each([
    ["future availability", "latestAvailableAt", "2025-07-02T00:00:00Z"],
    ["future system record", "latestSystemRecordedAt", "2025-07-02T00:00:00Z"],
  ])("rejects dataset %s leakage", (_label, field, instant) => {
    const context = governedContext();
    const manifest = mutable(context.dataManifest) as unknown as Record<string, unknown>;
    delete manifest.manifestSha256;
    const datasets = manifest.datasets as Array<Record<string, unknown>>;
    const first = datasets[0];
    if (!first) throw new Error("missing dataset fixture");
    first[field] = instant;
    expect(() => createPointInTimeAnalysisManifest(manifest)).toThrow(/cutoff/);
  });

  it("rejects plan registration and pre-treatment leakage", () => {
    const context = governedContext();
    const plan = mutable(context.plan) as unknown as Record<string, unknown>;
    delete plan.manifestSha256;
    plan.registeredAt = plan.firstDataAccessAllowedAt;
    expect(() => createAnalysisPlan(plan)).toThrow(/registered before/);

    const leaked = mutable(context.plan) as unknown as Record<string, unknown>;
    delete leaked.manifestSha256;
    (leaked.estimator as Record<string, unknown>).preprocessingFitThrough = "2025-01-01T00:00:00Z";
    expect(() => createAnalysisPlan(leaked)).toThrow(/strictly before treatment/);
  });

  it("fails readiness when governed references or pre-treatment fit do not match", () => {
    const context = governedContext();
    const wrongDesign = mutable(context.design);
    (wrongDesign as { manifestSha256: string }).manifestSha256 = B;
    expect(() =>
      createAnalysisReadinessReceipt({
        receiptId: id(10),
        ...context,
        design: wrongDesign as IdentificationDesign,
        checkedAt: "2025-07-03T00:00:00Z",
      }),
    ).toThrow(/digest/);

    expect(() =>
      createAnalysisReadinessReceipt({
        receiptId: id(10),
        ...context,
        checkedAt: "2025-07-01T00:00:00Z",
      }),
    ).toThrow(/before the data manifest/);
  });

  it("detects tampering in a frozen analysis manifest", () => {
    const manifest = mutable(governedContext().dataManifest);
    (manifest.cohort as { populationCount: number }).populationCount = 121;
    expect(() => assertPointInTimeAnalysisManifestIntegrity(manifest)).toThrow(/digest/);
  });

  it.each([
    [
      "future cohort selection",
      (manifest: Record<string, unknown>) => {
        (manifest.cohort as Record<string, unknown>).selectedAsOf = "2025-07-02T00:00:00Z";
      },
    ],
    [
      "future cohort availability",
      (manifest: Record<string, unknown>) => {
        (manifest.cohort as Record<string, unknown>).latestUnitAvailableAt = "2025-07-02T00:00:00Z";
      },
    ],
    [
      "future cohort system record",
      (manifest: Record<string, unknown>) => {
        (manifest.cohort as Record<string, unknown>).latestUnitSystemRecordedAt =
          "2025-07-02T00:00:00Z";
      },
    ],
    [
      "no dataset",
      (manifest: Record<string, unknown>) => {
        manifest.datasets = [];
      },
    ],
    [
      "duplicate dataset",
      (manifest: Record<string, unknown>) => {
        const datasets = manifest.datasets as unknown[];
        manifest.datasets = [datasets[0], datasets[0]];
      },
    ],
    [
      "future model fit",
      (manifest: Record<string, unknown>) => {
        (manifest.model as Record<string, unknown>).fitThrough = "2025-07-02T00:00:00Z";
      },
    ],
    [
      "no random seed",
      (manifest: Record<string, unknown>) => {
        (manifest.configuration as Record<string, unknown>).randomSeeds = [];
      },
    ],
    [
      "duplicate random seed",
      (manifest: Record<string, unknown>) => {
        (manifest.configuration as Record<string, unknown>).randomSeeds = [11, 11];
      },
    ],
    [
      "cutoff after freeze",
      (manifest: Record<string, unknown>) => {
        (manifest.cutoffs as Record<string, unknown>).knowledgeCutoff = "2025-07-03T00:00:00Z";
      },
    ],
  ])("rejects a PIT manifest with %s", (_label, mutateManifest) => {
    const manifest = mutable(governedContext().dataManifest) as unknown as Record<string, unknown>;
    delete manifest.manifestSha256;
    mutateManifest(manifest);
    expect(() => createPointInTimeAnalysisManifest(manifest)).toThrow(TypeError);
  });

  it.each([
    [
      "only placebo tests",
      (plan: Record<string, unknown>) => {
        plan.falsificationTests = (plan.falsificationTests as unknown[]).slice(1);
      },
    ],
    [
      "only negative-control tests",
      (plan: Record<string, unknown>) => {
        plan.falsificationTests = (plan.falsificationTests as unknown[]).slice(0, 1);
      },
    ],
    [
      "duplicate falsification keys",
      (plan: Record<string, unknown>) => {
        const tests = plan.falsificationTests as unknown[];
        plan.falsificationTests = [tests[0], tests[0], tests[1]];
      },
    ],
    [
      "no sensitivity analysis",
      (plan: Record<string, unknown>) => {
        plan.sensitivityAnalyses = [];
      },
    ],
    [
      "duplicate sensitivity keys",
      (plan: Record<string, unknown>) => {
        const analyses = plan.sensitivityAnalyses as unknown[];
        plan.sensitivityAnalyses = [analyses[0], analyses[0]];
      },
    ],
    [
      "disabled heterogeneity fields",
      (plan: Record<string, unknown>) => {
        (plan.heterogeneity as Record<string, unknown>).moderatorKeys = ["income_group"];
      },
    ],
    [
      "enabled heterogeneity without multiplicity",
      (plan: Record<string, unknown>) => {
        plan.heterogeneity = {
          enabled: true,
          moderatorKeys: ["income_group"],
          minimumSubgroupSize: 50,
          multiplicityPolicy: "not_applicable",
        };
      },
    ],
    [
      "incomplete diagnostic thresholds",
      (plan: Record<string, unknown>) => {
        plan.diagnosticThresholds = (plan.diagnosticThresholds as unknown[]).slice(1);
      },
    ],
    [
      "non-forward outcome window",
      (plan: Record<string, unknown>) => {
        plan.outcomeObservationEndsAt = plan.treatmentStartsAt;
      },
    ],
    [
      "empty multiplicity family",
      (plan: Record<string, unknown>) => {
        plan.multiplicityFamilyKeys = [];
      },
    ],
  ])("rejects a predeclared plan with %s", (_label, mutatePlan) => {
    const plan = mutable(governedContext().plan) as unknown as Record<string, unknown>;
    delete plan.manifestSha256;
    mutatePlan(plan);
    expect(() => createAnalysisPlan(plan)).toThrow(TypeError);
  });
});

describe("results, independent review, and causal-language gate", () => {
  it("keeps uncertainty distinct and blocks causal language until two-role approval", () => {
    const context = governedContext();
    const result = validResult(context);
    expect(resultPassesIdentificationEvidence(result)).toBe(true);
    assertCausalAnalysisResultIntegrity(result);

    let ledger = openIndependentReviewLedger({
      ledgerId: id(17),
      result,
      excludedReviewerIds: [context.plan.ownerId, result.analystId],
      openedAt: "2025-07-05T00:00:00Z",
    });
    expect(() =>
      authorizeClaimLanguage({
        authorizationId: id(18),
        result,
        reviewLedger: ledger,
        requestedLanguage: "causal_effect",
        authorizedBy: id(19),
        authorizedAt: "2025-07-08T00:00:00Z",
      }),
    ).toThrow(/requires approved/);

    ledger = appendIndependentReviewDecision(
      ledger,
      decisionInput(result, 1, "independent_validator", id(20), "2025-07-06T00:00:00Z", null),
    );
    expect(ledger.currentStatus).toBe("pending");
    ledger = appendIndependentReviewDecision(
      ledger,
      decisionInput(
        result,
        2,
        "model_risk_manager",
        id(21),
        "2025-07-07T00:00:00Z",
        ledger.decisions[0]?.decisionSha256 ?? null,
      ),
    );
    expect(ledger.currentStatus).toBe("approved");
    assertIndependentReviewLedgerIntegrity(ledger);

    const authorization = authorizeClaimLanguage({
      authorizationId: id(18),
      result,
      reviewLedger: ledger,
      requestedLanguage: "causal_effect",
      authorizedBy: id(19),
      authorizedAt: "2025-07-08T00:00:00Z",
    });
    expect(authorization.authorizedLabel).toBe("reviewed_causal_effect");
    expect(authorization.automaticGraphPromotion).toBe("prohibited");
    assertClaimLanguageAuthorizationIntegrity(authorization);
    assertAutomaticGraphPromotionProhibited(authorization);
  });

  it("prevents analysts and a single reviewer from satisfying independent roles", () => {
    const context = governedContext();
    const result = validResult(context);
    let ledger = openIndependentReviewLedger({
      ledgerId: id(17),
      result,
      excludedReviewerIds: [result.analystId],
      openedAt: "2025-07-05T00:00:00Z",
    });
    expect(() =>
      appendIndependentReviewDecision(
        ledger,
        decisionInput(
          result,
          1,
          "independent_validator",
          result.analystId,
          "2025-07-06T00:00:00Z",
          null,
        ),
      ),
    ).toThrow(/cannot independently review/);
    ledger = appendIndependentReviewDecision(
      ledger,
      decisionInput(result, 1, "independent_validator", id(20), "2025-07-06T00:00:00Z", null),
    );
    expect(() =>
      appendIndependentReviewDecision(
        ledger,
        decisionInput(
          result,
          2,
          "model_risk_manager",
          id(20),
          "2025-07-07T00:00:00Z",
          ledger.decisions[0]?.decisionSha256 ?? null,
        ),
      ),
    ).toThrow(/both independent roles/);
  });

  it("rejects re-addressed review chronology, duplicate decision IDs, and detached claim labels", () => {
    const context = governedContext();
    const result = validResult(context);
    let ledger = openIndependentReviewLedger({
      ledgerId: id(17),
      result,
      excludedReviewerIds: [result.analystId],
      openedAt: "2025-07-05T00:00:00Z",
    });
    ledger = appendIndependentReviewDecision(
      ledger,
      decisionInput(result, 1, "independent_validator", id(20), "2025-07-06T00:00:00Z", null),
    );
    expect(() =>
      appendIndependentReviewDecision(ledger, {
        ...decisionInput(
          result,
          2,
          "model_risk_manager",
          id(21),
          "2025-07-07T00:00:00Z",
          ledger.decisions[0]?.decisionSha256 ?? null,
        ),
        decisionId: ledger.decisions[0]?.decisionId ?? id(14),
      }),
    ).toThrow(/decision ID is duplicated/);

    ledger = appendIndependentReviewDecision(
      ledger,
      decisionInput(
        result,
        2,
        "model_risk_manager",
        id(21),
        "2025-07-07T00:00:00Z",
        ledger.decisions[0]?.decisionSha256 ?? null,
      ),
    );
    expect(() =>
      authorizeClaimLanguage({
        authorizationId: id(18),
        result,
        reviewLedger: ledger,
        requestedLanguage: "causal_effect",
        authorizedBy: id(19),
        authorizedAt: "2025-07-06T12:00:00Z",
      }),
    ).toThrow(/latest independent review decision/);

    const originalSecond = ledger.decisions[1];
    if (!originalSecond) throw new TypeError("second review decision fixture disappeared");
    const { decisionSha256: _secondSha, ...originalSecondBody } = originalSecond;
    const secondBody = { ...originalSecondBody, decidedAt: "2025-07-05T12:00:00Z" };
    const second = { ...secondBody, decisionSha256: digestJson(secondBody) };
    const { ledgerSha256: _ledgerSha, ...originalLedgerBody } = ledger;
    const ledgerBody = {
      ...originalLedgerBody,
      decisions: [ledger.decisions[0], second],
    };
    const readdressedLedger = { ...ledgerBody, ledgerSha256: digestJson(ledgerBody) };
    expect(() => assertIndependentReviewLedgerIntegrity(readdressedLedger)).toThrow(
      /advance strictly in time/,
    );

    const authorization = authorizeClaimLanguage({
      authorizationId: id(18),
      result,
      reviewLedger: ledger,
      requestedLanguage: "causal_effect",
      authorizedBy: id(19),
      authorizedAt: "2025-07-08T00:00:00Z",
    });
    const { authorizationSha256: _authorizationSha, ...originalAuthorizationBody } = authorization;
    const authorizationBody = {
      ...originalAuthorizationBody,
      requestedLanguage: "association" as const,
      causalLanguageAllowed: false,
    };
    const detached = {
      ...authorizationBody,
      authorizationSha256: digestJson(authorizationBody),
    };
    expect(() => assertClaimLanguageAuthorizationIntegrity(detached)).toThrow(
      /label does not match/,
    );
  });

  it.each([
    [
      "missing uncertainty",
      (input: CausalAnalysisResultInput) => ({
        ...input,
        uncertainty: input.uncertainty.slice(1),
      }),
    ],
    [
      "reversed interval",
      (input: CausalAnalysisResultInput) => ({
        ...input,
        estimate: {
          ...input.estimate,
          interval: { lower: "2", upper: "1", level: "0.95", kind: "confidence" },
        },
      }),
    ],
    [
      "changed threshold",
      (input: CausalAnalysisResultInput) => ({
        ...input,
        diagnostics: input.diagnostics.map((item, index) =>
          index === 0 ? { ...item, threshold: "0.2" } : item,
        ),
      }),
    ],
    [
      "plan deviation",
      (input: CausalAnalysisResultInput) => ({ ...input, planDeviation: "unregistered" }),
    ],
    [
      "graph promotion",
      (input: CausalAnalysisResultInput) => ({ ...input, automaticGraphPromotion: "automatic" }),
    ],
    [
      "missing falsification",
      (input: CausalAnalysisResultInput) => ({
        ...input,
        falsificationResults: input.falsificationResults.slice(1),
      }),
    ],
    [
      "missing sensitivity",
      (input: CausalAnalysisResultInput) => ({ ...input, sensitivityResults: [] }),
    ],
    [
      "unplanned heterogeneity",
      (input: CausalAnalysisResultInput) => ({
        ...input,
        heterogeneityResults: [
          {
            moderatorKey: "income_group",
            subgroupKey: "high",
            sampleSize: 60,
            estimate: "1",
            adjustedPValue: "0.1",
          },
        ],
      }),
    ],
    [
      "wrong multiplicity family",
      (input: CausalAnalysisResultInput) => ({
        ...input,
        multiplicity: { ...input.multiplicity, familyKeys: ["secondary_outcome"] },
      }),
    ],
    [
      "unadjusted multiple hypotheses",
      (input: CausalAnalysisResultInput) => ({
        ...input,
        multiplicity: { ...input.multiplicity, hypothesesTested: 2 },
      }),
    ],
    [
      "metrics on non-applicable overlap",
      (input: CausalAnalysisResultInput) => ({
        ...input,
        overlapAndBalance: {
          overlapStatus: "not_applicable",
          balanceStatus: "not_applicable",
          minimumOverlapScore: "0.2",
          maximumAbsoluteStandardizedDifference: null,
          rationale: "Not applicable.",
        },
      }),
    ],
    [
      "partial overlap record",
      (input: CausalAnalysisResultInput) => ({
        ...input,
        overlapAndBalance: { ...input.overlapAndBalance, minimumOverlapScore: null },
      }),
    ],
    [
      "reversed sensitivity range",
      (input: CausalAnalysisResultInput) => ({
        ...input,
        sensitivityResults: input.sensitivityResults.map((result) => ({
          ...result,
          minimumEstimate: "2",
          maximumEstimate: "1",
        })),
      }),
    ],
    ["empty limitations", (input: CausalAnalysisResultInput) => ({ ...input, limitations: [] })],
    [
      "generation before readiness",
      (input: CausalAnalysisResultInput) => ({
        ...input,
        generatedAt: "2025-07-02T00:00:00Z",
      }),
    ],
  ])("rejects a result with %s", (_label, mutate) => {
    const context = governedContext();
    expect(() => createCausalAnalysisResult(mutate(resultInput(context)), context)).toThrow(
      TypeError,
    );
  });

  it("denies causal language when a required diagnostic fails", () => {
    const context = governedContext();
    const original = resultInput(context);
    const input = {
      ...original,
      diagnostics: original.diagnostics.map((diagnostic, index) =>
        index === 0
          ? { ...diagnostic, status: "failed" as const, observedValue: "0.2" }
          : diagnostic,
      ),
    };
    const result = createCausalAnalysisResult(input, context);
    expect(resultPassesIdentificationEvidence(result)).toBe(false);
    let ledger = openIndependentReviewLedger({
      ledgerId: id(17),
      result,
      excludedReviewerIds: [result.analystId],
      openedAt: "2025-07-05T00:00:00Z",
    });
    ledger = appendIndependentReviewDecision(
      ledger,
      decisionInput(result, 1, "independent_validator", id(20), "2025-07-06T00:00:00Z", null),
    );
    ledger = appendIndependentReviewDecision(
      ledger,
      decisionInput(
        result,
        2,
        "model_risk_manager",
        id(21),
        "2025-07-07T00:00:00Z",
        ledger.decisions[0]?.decisionSha256 ?? null,
      ),
    );
    expect(() =>
      authorizeClaimLanguage({
        authorizationId: id(18),
        result,
        reviewLedger: ledger,
        requestedLanguage: "causal_effect",
        authorizedBy: id(19),
        authorizedAt: "2025-07-08T00:00:00Z",
      }),
    ).toThrow(/passing identification/);
  });

  it.each([
    ["observed_association", "association", "observed_association"],
    ["predictive_association", "predictive_association", "predictive_association_hypothesis"],
    ["discovered_association", "hypothesis", "causal_discovery_hypothesis"],
    ["hypothesis", "hypothesis", "research_hypothesis"],
  ] as const)("keeps %s separately typed", (resultKind, requestedLanguage, expectedLabel) => {
    const context = governedContext();
    const result = createCausalAnalysisResult(
      resultInput(context, {
        resultKind,
        estimate: resultKind === "hypothesis" ? null : resultInput(context).estimate,
      }),
      context,
    );
    const ledger = openIndependentReviewLedger({
      ledgerId: id(17),
      result,
      excludedReviewerIds: [result.analystId],
      openedAt: "2025-07-05T00:00:00Z",
    });
    const authorization = authorizeClaimLanguage({
      authorizationId: id(18),
      result,
      reviewLedger: ledger,
      requestedLanguage,
      authorizedBy: id(19),
      authorizedAt: "2025-07-06T00:00:00Z",
    });
    expect(authorization.authorizedLabel).toBe(expectedLabel);
    expect(authorization.causalLanguageAllowed).toBe(false);
  });

  it("detects result and review-ledger tampering", () => {
    const result = validResult();
    const tampered = mutable(result);
    (tampered.estimate as { pointEstimate: string }).pointEstimate = "1.3";
    expect(() => assertCausalAnalysisResultIntegrity(tampered)).toThrow(/digest/);

    const ledger = openIndependentReviewLedger({
      ledgerId: id(17),
      result,
      excludedReviewerIds: [result.analystId],
      openedAt: "2025-07-05T00:00:00Z",
    });
    const badLedger = mutable(ledger);
    (badLedger as { resultSha256: string }).resultSha256 = A;
    expect(() => assertIndependentReviewLedgerIntegrity(badLedger)).toThrow(/digest/);
  });

  it("records explicit non-applicability and only predeclared heterogeneity", () => {
    const plainContext = governedContext();
    const nonApplicable = createCausalAnalysisResult(
      resultInput(plainContext, {
        estimate: {
          scale: "index_points",
          pointEstimate: "1.25",
          standardError: null,
          interval: { lower: "0.6", upper: "1.9", level: "0.9", kind: "credible" },
        },
        overlapAndBalance: {
          overlapStatus: "not_applicable",
          balanceStatus: "not_applicable",
          minimumOverlapScore: null,
          maximumAbsoluteStandardizedDifference: null,
          rationale: "This time-series design has no cross-sectional propensity overlap metric.",
        },
      }),
      plainContext,
    );
    expect(nonApplicable.overlapAndBalance.overlapStatus).toBe("not_applicable");

    const heterogeneousContext = governedContext("difference_in_differences", true);
    const heterogeneous = validResult(heterogeneousContext);
    expect(heterogeneous.heterogeneityResults).toHaveLength(1);
    expect(heterogeneous.multiplicity.adjustmentApplied).toBe(true);
  });

  it("derives diagnostic status from exact predeclared comparators", () => {
    expect(
      evaluateDiagnosticThreshold("0.1", {
        diagnosticKey: "balance",
        metricKey: "balance.smd",
        comparator: "eq",
        threshold: "0.1",
      }),
    ).toBe("passed");
    expect(
      evaluateDiagnosticThreshold("0.2", {
        diagnosticKey: "balance",
        metricKey: "balance.smd",
        comparator: "lt",
        threshold: "0.1",
      }),
    ).toBe("failed");
    expect(
      evaluateDiagnosticThreshold(null, {
        diagnosticKey: "balance",
        metricKey: "balance.smd",
        comparator: "lte",
        threshold: "0.1",
      }),
    ).toBe("inconclusive");

    const context = governedContext();
    const input = resultInput(context);
    expect(() =>
      createCausalAnalysisResult(
        {
          ...input,
          diagnostics: input.diagnostics.map((diagnostic, index) =>
            index === 0 ? { ...diagnostic, observedValue: "0.2", status: "passed" } : diagnostic,
          ),
        },
        context,
      ),
    ).toThrow(/status disagrees/);
  });

  it.each(["association", "predictive_association", "hypothesis"] as const)(
    "rejects %s wording for an identified-effect result",
    (requestedLanguage) => {
      const result = validResult();
      const ledger = openIndependentReviewLedger({
        ledgerId: id(17),
        result,
        excludedReviewerIds: [result.analystId],
        openedAt: "2025-07-05T00:00:00Z",
      });
      expect(() =>
        authorizeClaimLanguage({
          authorizationId: id(18),
          result,
          reviewLedger: ledger,
          requestedLanguage,
          authorizedBy: id(19),
          authorizedAt: "2025-07-06T00:00:00Z",
        }),
      ).toThrow(/separately typed/);
    },
  );

  it("records terminal rejection and change-request decisions", () => {
    const result = validResult();
    const base = openIndependentReviewLedger({
      ledgerId: id(17),
      result,
      excludedReviewerIds: [result.analystId],
      openedAt: "2025-07-05T00:00:00Z",
    });
    const rejected = appendIndependentReviewDecision(base, {
      ...decisionInput(result, 1, "independent_validator", id(20), "2025-07-06T00:00:00Z", null),
      decision: "reject",
    });
    expect(rejected.currentStatus).toBe("rejected");
    expect(() =>
      appendIndependentReviewDecision(
        rejected,
        decisionInput(
          result,
          2,
          "model_risk_manager",
          id(21),
          "2025-07-07T00:00:00Z",
          rejected.decisions[0]?.decisionSha256 ?? null,
        ),
      ),
    ).toThrow(/terminal/);

    const changes = appendIndependentReviewDecision(base, {
      ...decisionInput(result, 1, "independent_validator", id(20), "2025-07-06T00:00:00Z", null),
      decision: "request_changes",
    });
    expect(changes.currentStatus).toBe("changes_requested");
  });
});

describe("append-only deterministic result registry", () => {
  it("appends, verifies, and exactly replays immutable results", () => {
    const result = validResult();
    let registry = openCausalResultRegistry({
      registryId: id(22),
      organizationId: id(23),
      workspaceId: id(24),
      openedAt: "2025-01-01T00:00:00Z",
    });
    registry = appendCausalResult(registry, {
      result,
      recordedBy: id(25),
      recordedAt: "2025-07-09T00:00:00Z",
    });
    assertCausalResultRegistryIntegrity(registry);
    const replay = replayCausalResultRegistry(registry, [result]);
    expect(replay.orderedResultSha256).toEqual([result.resultSha256]);
    assertResultRegistryReplayIntegrity(replay);
    expect(() => replayCausalResultRegistry(registry, [])).toThrow(/exactly/);
    expect(() =>
      appendCausalResult(registry, {
        result,
        recordedBy: id(25),
        recordedAt: "2025-07-10T00:00:00Z",
      }),
    ).toThrow(/already registered/);
  });

  it("detects registry chain tampering", () => {
    const result = validResult();
    const registry = appendCausalResult(
      openCausalResultRegistry({
        registryId: id(22),
        organizationId: id(23),
        workspaceId: id(24),
        openedAt: "2025-01-01T00:00:00Z",
      }),
      { result, recordedBy: id(25), recordedAt: "2025-07-09T00:00:00Z" },
    );
    const tampered = mutable(registry);
    const entry = tampered.entries[0] as { recordedBy: string } | undefined;
    if (!entry) throw new Error("missing registry entry");
    entry.recordedBy = id(26);
    expect(() => assertCausalResultRegistryIntegrity(tampered)).toThrow(/entry digest/);
  });
});
