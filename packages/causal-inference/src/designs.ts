import {
  assertDecimal,
  assertEnum,
  assertExactKeys,
  assertIsoInstant,
  assertKey,
  assertProbability,
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

export const IDENTIFICATION_METHODS = [
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
] as const;
export type IdentificationMethod = (typeof IDENTIFICATION_METHODS)[number];

export interface AssumptionDeclaration {
  readonly key: string;
  readonly statement: string;
  readonly assessmentPlan: string;
  readonly falsifiable: boolean;
}

export interface DiagnosticDeclaration {
  readonly key: string;
  readonly procedure: string;
  readonly passCriterion: string;
  readonly required: true;
}

export interface PreTreatmentWindow {
  readonly start: string;
  readonly end: string;
}

export interface DifferenceInDifferencesSpecification {
  readonly treatedGroupKey: string;
  readonly comparisonGroupKeys: readonly string[];
  readonly treatmentTiming: "common" | "staggered";
  readonly effectAggregation: "cohort_weighted" | "group_time";
  readonly anticipationWindowDays: number;
}

export interface SyntheticControlSpecification {
  readonly treatedUnitKey: string;
  readonly donorPoolKeys: readonly string[];
  readonly predictorKeys: readonly string[];
  readonly pretreatmentPeriods: number;
  readonly fitMetric: "mae" | "mse" | "rmspe";
}

export interface InstrumentalVariablesSpecification {
  readonly instrumentKeys: readonly string[];
  readonly endogenousExposureKey: string;
  readonly stageModel: "linear_2sls" | "limited_information" | "nonlinear_control_function";
  readonly estimandPopulation: "compliers";
}

export interface RegressionDiscontinuitySpecification {
  readonly runningVariableKey: string;
  readonly cutoff: string;
  readonly assignmentSide: "above" | "below";
  readonly design: "fuzzy" | "sharp";
  readonly bandwidthPolicy: string;
  readonly polynomialOrder: number;
}

export interface EventStudySpecification {
  readonly eventKey: string;
  readonly preEventDays: number;
  readonly postEventDays: number;
  readonly comparisonModel: string;
  readonly clusteredBy: string;
  readonly concurrentShockPolicy: string;
}

export interface InterventionAnalysisSpecification {
  readonly interventionKey: string;
  readonly responseSeriesKey: string;
  readonly controlSeriesKeys: readonly string[];
  readonly interruptionForm: "pulse" | "ramp" | "step";
  readonly maximumLagDays: number;
}

export interface StructuralTimeSeriesSpecification {
  readonly responseSeriesKey: string;
  readonly controlSeriesKeys: readonly string[];
  readonly components: readonly string[];
  readonly priorManifestSha256: string;
  readonly posteriorDraws: number;
}

export interface StructuralEquationSpecification {
  readonly equationManifestSha256: string;
  readonly measurementModelSha256: string;
  readonly identifiedPathKeys: readonly string[];
  readonly estimatorKey: string;
}

export interface BayesianCausalSpecification {
  readonly dagSha256: string;
  readonly priorManifestSha256: string;
  readonly likelihoodKey: string;
  readonly posteriorDraws: number;
  readonly chains: number;
}

export interface CausalForestSpecification {
  readonly featureKeys: readonly string[];
  readonly nuisanceModelSha256: string;
  readonly crossFitFolds: number;
  readonly honestyFraction: string;
  readonly minimumLeafSize: number;
}

export interface HeterogeneousTreatmentEffectsSpecification {
  readonly baseDesignId: string;
  readonly baseDesignSha256: string;
  readonly moderatorKeys: readonly string[];
  readonly minimumSubgroupSize: number;
  readonly multiplicityPolicy:
    | "benjamini_hochberg"
    | "family_wise_error"
    | "hierarchical_partial_pooling";
}

export interface DynamicBayesianNetworkSpecification {
  readonly graphSha256: string;
  readonly nodeKeys: readonly string[];
  readonly maximumLag: number;
  readonly timeSlices: number;
  readonly interventionNodeKeys: readonly string[];
}

export type IdentificationSpecification =
  | BayesianCausalSpecification
  | CausalForestSpecification
  | DifferenceInDifferencesSpecification
  | DynamicBayesianNetworkSpecification
  | EventStudySpecification
  | HeterogeneousTreatmentEffectsSpecification
  | InstrumentalVariablesSpecification
  | InterventionAnalysisSpecification
  | RegressionDiscontinuitySpecification
  | StructuralEquationSpecification
  | StructuralTimeSeriesSpecification
  | SyntheticControlSpecification;

interface IdentificationDesignCommon {
  readonly schemaVersion: 1;
  readonly designId: string;
  readonly version: string;
  readonly estimandId: string;
  readonly estimandSha256: string;
  readonly preTreatmentWindow: PreTreatmentWindow;
  readonly treatmentStartsAt: string;
  readonly assumptions: readonly AssumptionDeclaration[];
  readonly diagnostics: readonly DiagnosticDeclaration[];
  readonly ownerId: string;
  readonly createdAt: string;
  readonly limitations: readonly string[];
}

export type IdentificationDesignInput = IdentificationDesignCommon &
  (
    | {
        readonly method: "difference_in_differences";
        readonly specification: DifferenceInDifferencesSpecification;
      }
    | {
        readonly method: "synthetic_control";
        readonly specification: SyntheticControlSpecification;
      }
    | {
        readonly method: "instrumental_variables";
        readonly specification: InstrumentalVariablesSpecification;
      }
    | {
        readonly method: "regression_discontinuity";
        readonly specification: RegressionDiscontinuitySpecification;
      }
    | { readonly method: "event_study"; readonly specification: EventStudySpecification }
    | {
        readonly method: "intervention_analysis";
        readonly specification: InterventionAnalysisSpecification;
      }
    | {
        readonly method: "structural_time_series";
        readonly specification: StructuralTimeSeriesSpecification;
      }
    | {
        readonly method: "structural_equation_model";
        readonly specification: StructuralEquationSpecification;
      }
    | {
        readonly method: "bayesian_causal_model";
        readonly specification: BayesianCausalSpecification;
      }
    | { readonly method: "causal_forest"; readonly specification: CausalForestSpecification }
    | {
        readonly method: "heterogeneous_treatment_effects";
        readonly specification: HeterogeneousTreatmentEffectsSpecification;
      }
    | {
        readonly method: "dynamic_bayesian_network";
        readonly specification: DynamicBayesianNetworkSpecification;
      }
  );

export type IdentificationDesign = IdentificationDesignInput & { readonly manifestSha256: string };

const BODY_KEYS = [
  "schemaVersion",
  "designId",
  "version",
  "estimandId",
  "estimandSha256",
  "method",
  "preTreatmentWindow",
  "treatmentStartsAt",
  "assumptions",
  "diagnostics",
  "specification",
  "ownerId",
  "createdAt",
  "limitations",
] as const;

export const REQUIRED_ASSUMPTIONS: Readonly<Record<IdentificationMethod, readonly string[]>> = {
  difference_in_differences: [
    "interference_scope",
    "no_anticipation",
    "parallel_trends",
    "stable_composition",
  ],
  synthetic_control: [
    "convex_hull_support",
    "donor_pool_uncontaminated",
    "interference_scope",
    "stable_relationship",
  ],
  instrumental_variables: [
    "exclusion_restriction",
    "independence",
    "interference_scope",
    "monotonicity",
    "relevance",
  ],
  regression_discontinuity: [
    "continuity",
    "interference_scope",
    "local_exclusion",
    "no_precise_manipulation",
  ],
  event_study: [
    "counterfactual_path",
    "interference_scope",
    "no_anticipation",
    "no_concurrent_shocks",
  ],
  intervention_analysis: [
    "control_uncontaminated",
    "interference_scope",
    "no_concurrent_intervention",
    "stable_preintervention_process",
  ],
  structural_time_series: [
    "control_uncontaminated",
    "correct_time_structure",
    "interference_scope",
    "stable_control_relationship",
  ],
  structural_equation_model: [
    "identifiability",
    "interference_scope",
    "measurement_validity",
    "no_omitted_confounding",
    "structural_equations",
  ],
  bayesian_causal_model: [
    "consistency",
    "dag_sufficiency",
    "interference_scope",
    "positivity",
    "prior_transparency",
  ],
  causal_forest: ["consistency", "interference_scope", "overlap", "unconfoundedness"],
  heterogeneous_treatment_effects: [
    "interference_scope",
    "subgroup_predefinition",
    "transportability",
    "within_subgroup_overlap",
  ],
  dynamic_bayesian_network: [
    "causal_markov",
    "faithfulness",
    "interference_scope",
    "no_hidden_confounding",
    "temporal_order",
  ],
};

export const REQUIRED_DIAGNOSTICS: Readonly<Record<IdentificationMethod, readonly string[]>> = {
  difference_in_differences: [
    "alternative_timing",
    "event_time_balance",
    "overlap",
    "pretrend_test",
  ],
  synthetic_control: ["in_space_placebo", "in_time_placebo", "leave_one_out", "pretreatment_fit"],
  instrumental_variables: [
    "exclusion_sensitivity",
    "first_stage_strength",
    "instrument_balance",
    "weak_instrument",
  ],
  regression_discontinuity: [
    "bandwidth_sensitivity",
    "covariate_continuity",
    "density_manipulation",
    "polynomial_sensitivity",
  ],
  event_study: ["contamination_check", "event_clustering", "pretrend_test", "window_sensitivity"],
  intervention_analysis: [
    "control_sensitivity",
    "parameter_stability",
    "placebo_time",
    "residual_autocorrelation",
  ],
  structural_time_series: [
    "placebo_time",
    "posterior_predictive",
    "pretreatment_fit",
    "residual_autocorrelation",
  ],
  structural_equation_model: [
    "alternative_specification",
    "measurement_fit",
    "rank_identification",
    "residual_diagnostics",
  ],
  bayesian_causal_model: [
    "convergence",
    "posterior_predictive",
    "prior_predictive",
    "prior_sensitivity",
  ],
  causal_forest: ["covariate_balance", "effect_calibration", "nuisance_cross_fit", "overlap"],
  heterogeneous_treatment_effects: [
    "effect_calibration",
    "minimum_information",
    "multiplicity_control",
    "subgroup_overlap",
  ],
  dynamic_bayesian_network: [
    "conditional_independence",
    "intervention_validation",
    "lag_sensitivity",
    "structure_stability",
  ],
};

function textArray(value: unknown, field: string): string[] {
  const values = expectArray(value, field).map((item, index) => {
    const text = expectString(item, `${field}[${index}]`);
    assertText(text, `${field}[${index}]`, 1_000);
    return text;
  });
  if (values.length === 0) throw new TypeError(`${field} must not be empty`);
  return values;
}

function keyArray(value: unknown, field: string): string[] {
  return sortedUnique(
    expectArray(value, field).map((item, index) => expectString(item, `${field}[${index}]`)),
    field,
    assertKey,
  );
}

function parseAssumptions(value: unknown, method: IdentificationMethod): AssumptionDeclaration[] {
  const assumptions = expectArray(value, "identificationDesign.assumptions").map((item, index) => {
    const field = `identificationDesign.assumptions[${index}]`;
    assertRecord(item, field);
    assertExactKeys(item, ["key", "statement", "assessmentPlan", "falsifiable"], field);
    const key = expectString(item.key, `${field}.key`);
    const statement = expectString(item.statement, `${field}.statement`);
    const assessmentPlan = expectString(item.assessmentPlan, `${field}.assessmentPlan`);
    assertKey(key, `${field}.key`);
    assertText(statement, `${field}.statement`, 2_000);
    assertText(assessmentPlan, `${field}.assessmentPlan`, 2_000);
    return {
      key,
      statement,
      assessmentPlan,
      falsifiable: expectBoolean(item.falsifiable, `${field}.falsifiable`),
    };
  });
  const keys = assumptions.map((item) => item.key);
  if (new Set(keys).size !== keys.length) throw new TypeError("assumption keys must be unique");
  for (const required of REQUIRED_ASSUMPTIONS[method]) {
    if (!keys.includes(required)) throw new TypeError(`${method} requires assumption ${required}`);
  }
  return assumptions.sort((left, right) => left.key.localeCompare(right.key));
}

function parseDiagnostics(value: unknown, method: IdentificationMethod): DiagnosticDeclaration[] {
  const diagnostics = expectArray(value, "identificationDesign.diagnostics").map((item, index) => {
    const field = `identificationDesign.diagnostics[${index}]`;
    assertRecord(item, field);
    assertExactKeys(item, ["key", "procedure", "passCriterion", "required"], field);
    const key = expectString(item.key, `${field}.key`);
    const procedure = expectString(item.procedure, `${field}.procedure`);
    const passCriterion = expectString(item.passCriterion, `${field}.passCriterion`);
    assertKey(key, `${field}.key`);
    assertText(procedure, `${field}.procedure`, 2_000);
    assertText(passCriterion, `${field}.passCriterion`, 1_000);
    if (expectBoolean(item.required, `${field}.required`) !== true) {
      throw new TypeError("design diagnostics must be mandatory once predeclared");
    }
    return { key, procedure, passCriterion, required: true as const };
  });
  const keys = diagnostics.map((item) => item.key);
  if (new Set(keys).size !== keys.length) throw new TypeError("diagnostic keys must be unique");
  for (const required of REQUIRED_DIAGNOSTICS[method]) {
    if (!keys.includes(required)) throw new TypeError(`${method} requires diagnostic ${required}`);
  }
  return diagnostics.sort((left, right) => left.key.localeCompare(right.key));
}

function enumString<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
  field: string,
): Values[number] {
  const result = expectString(value, field);
  assertEnum(result, values, field);
  return result;
}

function key(value: unknown, field: string): string {
  const result = expectString(value, field);
  assertKey(result, field);
  return result;
}

function sha(value: unknown, field: string): string {
  const result = expectString(value, field);
  assertSha256(result, field);
  return result;
}

function parseSpecification(
  method: IdentificationMethod,
  value: unknown,
): IdentificationSpecification {
  assertRecord(value, `identificationDesign.${method}.specification`);
  const field = `identificationDesign.${method}.specification`;
  switch (method) {
    case "difference_in_differences": {
      assertExactKeys(
        value,
        [
          "treatedGroupKey",
          "comparisonGroupKeys",
          "treatmentTiming",
          "effectAggregation",
          "anticipationWindowDays",
        ],
        field,
      );
      const treatedGroupKey = key(value.treatedGroupKey, `${field}.treatedGroupKey`);
      const comparisonGroupKeys = keyArray(
        value.comparisonGroupKeys,
        `${field}.comparisonGroupKeys`,
      );
      if (comparisonGroupKeys.includes(treatedGroupKey)) {
        throw new TypeError("DiD treated group cannot appear in comparison groups");
      }
      return {
        treatedGroupKey,
        comparisonGroupKeys,
        treatmentTiming: enumString(
          value.treatmentTiming,
          ["common", "staggered"],
          `${field}.treatmentTiming`,
        ),
        effectAggregation: enumString(
          value.effectAggregation,
          ["cohort_weighted", "group_time"],
          `${field}.effectAggregation`,
        ),
        anticipationWindowDays: expectInteger(
          value.anticipationWindowDays,
          `${field}.anticipationWindowDays`,
          0,
          3_650,
        ),
      };
    }
    case "synthetic_control": {
      assertExactKeys(
        value,
        ["treatedUnitKey", "donorPoolKeys", "predictorKeys", "pretreatmentPeriods", "fitMetric"],
        field,
      );
      const treatedUnitKey = key(value.treatedUnitKey, `${field}.treatedUnitKey`);
      const donorPoolKeys = keyArray(value.donorPoolKeys, `${field}.donorPoolKeys`);
      if (donorPoolKeys.includes(treatedUnitKey)) {
        throw new TypeError("synthetic-control treated unit cannot be a donor");
      }
      return {
        treatedUnitKey,
        donorPoolKeys,
        predictorKeys: keyArray(value.predictorKeys, `${field}.predictorKeys`),
        pretreatmentPeriods: expectInteger(
          value.pretreatmentPeriods,
          `${field}.pretreatmentPeriods`,
          3,
          100_000,
        ),
        fitMetric: enumString(value.fitMetric, ["mae", "mse", "rmspe"], `${field}.fitMetric`),
      };
    }
    case "instrumental_variables":
      assertExactKeys(
        value,
        ["instrumentKeys", "endogenousExposureKey", "stageModel", "estimandPopulation"],
        field,
      );
      return {
        instrumentKeys: keyArray(value.instrumentKeys, `${field}.instrumentKeys`),
        endogenousExposureKey: key(value.endogenousExposureKey, `${field}.endogenousExposureKey`),
        stageModel: enumString(
          value.stageModel,
          ["linear_2sls", "limited_information", "nonlinear_control_function"],
          `${field}.stageModel`,
        ),
        estimandPopulation: enumString(
          value.estimandPopulation,
          ["compliers"],
          `${field}.estimandPopulation`,
        ),
      };
    case "regression_discontinuity": {
      assertExactKeys(
        value,
        [
          "runningVariableKey",
          "cutoff",
          "assignmentSide",
          "design",
          "bandwidthPolicy",
          "polynomialOrder",
        ],
        field,
      );
      const cutoff = expectString(value.cutoff, `${field}.cutoff`);
      const bandwidthPolicy = expectString(value.bandwidthPolicy, `${field}.bandwidthPolicy`);
      assertDecimal(cutoff, `${field}.cutoff`);
      assertText(bandwidthPolicy, `${field}.bandwidthPolicy`, 1_000);
      return {
        runningVariableKey: key(value.runningVariableKey, `${field}.runningVariableKey`),
        cutoff,
        assignmentSide: enumString(
          value.assignmentSide,
          ["above", "below"],
          `${field}.assignmentSide`,
        ),
        design: enumString(value.design, ["fuzzy", "sharp"], `${field}.design`),
        bandwidthPolicy,
        polynomialOrder: expectInteger(value.polynomialOrder, `${field}.polynomialOrder`, 1, 3),
      };
    }
    case "event_study": {
      assertExactKeys(
        value,
        [
          "eventKey",
          "preEventDays",
          "postEventDays",
          "comparisonModel",
          "clusteredBy",
          "concurrentShockPolicy",
        ],
        field,
      );
      const comparisonModel = expectString(value.comparisonModel, `${field}.comparisonModel`);
      const concurrentShockPolicy = expectString(
        value.concurrentShockPolicy,
        `${field}.concurrentShockPolicy`,
      );
      assertText(comparisonModel, `${field}.comparisonModel`, 1_000);
      assertText(concurrentShockPolicy, `${field}.concurrentShockPolicy`, 1_000);
      return {
        eventKey: key(value.eventKey, `${field}.eventKey`),
        preEventDays: expectInteger(value.preEventDays, `${field}.preEventDays`, 1, 3_650),
        postEventDays: expectInteger(value.postEventDays, `${field}.postEventDays`, 1, 3_650),
        comparisonModel,
        clusteredBy: key(value.clusteredBy, `${field}.clusteredBy`),
        concurrentShockPolicy,
      };
    }
    case "intervention_analysis":
      assertExactKeys(
        value,
        [
          "interventionKey",
          "responseSeriesKey",
          "controlSeriesKeys",
          "interruptionForm",
          "maximumLagDays",
        ],
        field,
      );
      return {
        interventionKey: key(value.interventionKey, `${field}.interventionKey`),
        responseSeriesKey: key(value.responseSeriesKey, `${field}.responseSeriesKey`),
        controlSeriesKeys: keyArray(value.controlSeriesKeys, `${field}.controlSeriesKeys`),
        interruptionForm: enumString(
          value.interruptionForm,
          ["pulse", "ramp", "step"],
          `${field}.interruptionForm`,
        ),
        maximumLagDays: expectInteger(value.maximumLagDays, `${field}.maximumLagDays`, 0, 3_650),
      };
    case "structural_time_series":
      assertExactKeys(
        value,
        [
          "responseSeriesKey",
          "controlSeriesKeys",
          "components",
          "priorManifestSha256",
          "posteriorDraws",
        ],
        field,
      );
      return {
        responseSeriesKey: key(value.responseSeriesKey, `${field}.responseSeriesKey`),
        controlSeriesKeys: keyArray(value.controlSeriesKeys, `${field}.controlSeriesKeys`),
        components: keyArray(value.components, `${field}.components`),
        priorManifestSha256: sha(value.priorManifestSha256, `${field}.priorManifestSha256`),
        posteriorDraws: expectInteger(
          value.posteriorDraws,
          `${field}.posteriorDraws`,
          500,
          10_000_000,
        ),
      };
    case "structural_equation_model":
      assertExactKeys(
        value,
        ["equationManifestSha256", "measurementModelSha256", "identifiedPathKeys", "estimatorKey"],
        field,
      );
      return {
        equationManifestSha256: sha(
          value.equationManifestSha256,
          `${field}.equationManifestSha256`,
        ),
        measurementModelSha256: sha(
          value.measurementModelSha256,
          `${field}.measurementModelSha256`,
        ),
        identifiedPathKeys: keyArray(value.identifiedPathKeys, `${field}.identifiedPathKeys`),
        estimatorKey: key(value.estimatorKey, `${field}.estimatorKey`),
      };
    case "bayesian_causal_model":
      assertExactKeys(
        value,
        ["dagSha256", "priorManifestSha256", "likelihoodKey", "posteriorDraws", "chains"],
        field,
      );
      return {
        dagSha256: sha(value.dagSha256, `${field}.dagSha256`),
        priorManifestSha256: sha(value.priorManifestSha256, `${field}.priorManifestSha256`),
        likelihoodKey: key(value.likelihoodKey, `${field}.likelihoodKey`),
        posteriorDraws: expectInteger(
          value.posteriorDraws,
          `${field}.posteriorDraws`,
          500,
          10_000_000,
        ),
        chains: expectInteger(value.chains, `${field}.chains`, 2, 64),
      };
    case "causal_forest": {
      assertExactKeys(
        value,
        [
          "featureKeys",
          "nuisanceModelSha256",
          "crossFitFolds",
          "honestyFraction",
          "minimumLeafSize",
        ],
        field,
      );
      const honestyFraction = expectString(value.honestyFraction, `${field}.honestyFraction`);
      assertProbability(honestyFraction, `${field}.honestyFraction`);
      if (compareDecimal(honestyFraction, "0") <= 0 || compareDecimal(honestyFraction, "1") >= 0) {
        throw new TypeError("causal-forest honesty fraction must be strictly between zero and one");
      }
      return {
        featureKeys: keyArray(value.featureKeys, `${field}.featureKeys`),
        nuisanceModelSha256: sha(value.nuisanceModelSha256, `${field}.nuisanceModelSha256`),
        crossFitFolds: expectInteger(value.crossFitFolds, `${field}.crossFitFolds`, 2, 100),
        honestyFraction,
        minimumLeafSize: expectInteger(
          value.minimumLeafSize,
          `${field}.minimumLeafSize`,
          2,
          1_000_000,
        ),
      };
    }
    case "heterogeneous_treatment_effects":
      assertExactKeys(
        value,
        [
          "baseDesignId",
          "baseDesignSha256",
          "moderatorKeys",
          "minimumSubgroupSize",
          "multiplicityPolicy",
        ],
        field,
      );
      return {
        baseDesignId: (() => {
          const id = expectString(value.baseDesignId, `${field}.baseDesignId`);
          assertUuid(id, `${field}.baseDesignId`);
          return id;
        })(),
        baseDesignSha256: sha(value.baseDesignSha256, `${field}.baseDesignSha256`),
        moderatorKeys: keyArray(value.moderatorKeys, `${field}.moderatorKeys`),
        minimumSubgroupSize: expectInteger(
          value.minimumSubgroupSize,
          `${field}.minimumSubgroupSize`,
          20,
          1_000_000_000,
        ),
        multiplicityPolicy: enumString(
          value.multiplicityPolicy,
          ["benjamini_hochberg", "family_wise_error", "hierarchical_partial_pooling"],
          `${field}.multiplicityPolicy`,
        ),
      };
    case "dynamic_bayesian_network": {
      assertExactKeys(
        value,
        ["graphSha256", "nodeKeys", "maximumLag", "timeSlices", "interventionNodeKeys"],
        field,
      );
      const nodeKeys = keyArray(value.nodeKeys, `${field}.nodeKeys`);
      const interventionNodeKeys = keyArray(
        value.interventionNodeKeys,
        `${field}.interventionNodeKeys`,
      );
      if (interventionNodeKeys.some((node) => !nodeKeys.includes(node))) {
        throw new TypeError("dynamic-Bayesian intervention nodes must belong to the graph");
      }
      return {
        graphSha256: sha(value.graphSha256, `${field}.graphSha256`),
        nodeKeys,
        maximumLag: expectInteger(value.maximumLag, `${field}.maximumLag`, 1, 1_000),
        timeSlices: expectInteger(value.timeSlices, `${field}.timeSlices`, 3, 1_000_000),
        interventionNodeKeys,
      };
    }
  }
}

function parseDesignBody(value: unknown): IdentificationDesignInput {
  assertRecord(value, "identificationDesign");
  assertExactKeys(value, BODY_KEYS, "identificationDesign");
  if (value.schemaVersion !== 1) {
    throw new TypeError("identificationDesign.schemaVersion must be 1");
  }
  const designId = expectString(value.designId, "identificationDesign.designId");
  const version = expectString(value.version, "identificationDesign.version");
  const estimandId = expectString(value.estimandId, "identificationDesign.estimandId");
  const estimandSha256 = expectString(value.estimandSha256, "identificationDesign.estimandSha256");
  const method = expectString(value.method, "identificationDesign.method");
  const ownerId = expectString(value.ownerId, "identificationDesign.ownerId");
  const createdAt = expectString(value.createdAt, "identificationDesign.createdAt");
  const treatmentStartsAt = expectString(
    value.treatmentStartsAt,
    "identificationDesign.treatmentStartsAt",
  );
  assertUuid(designId, "identificationDesign.designId");
  assertSemver(version, "identificationDesign.version");
  assertUuid(estimandId, "identificationDesign.estimandId");
  assertSha256(estimandSha256, "identificationDesign.estimandSha256");
  assertEnum(method, IDENTIFICATION_METHODS, "identificationDesign.method");
  assertUuid(ownerId, "identificationDesign.ownerId");
  assertIsoInstant(createdAt, "identificationDesign.createdAt");
  assertIsoInstant(treatmentStartsAt, "identificationDesign.treatmentStartsAt");

  assertRecord(value.preTreatmentWindow, "identificationDesign.preTreatmentWindow");
  assertExactKeys(
    value.preTreatmentWindow,
    ["start", "end"],
    "identificationDesign.preTreatmentWindow",
  );
  const start = expectString(
    value.preTreatmentWindow.start,
    "identificationDesign.preTreatmentWindow.start",
  );
  const end = expectString(
    value.preTreatmentWindow.end,
    "identificationDesign.preTreatmentWindow.end",
  );
  assertIsoInstant(start, "identificationDesign.preTreatmentWindow.start");
  assertIsoInstant(end, "identificationDesign.preTreatmentWindow.end");
  if (compareInstant(start, end) >= 0 || compareInstant(end, treatmentStartsAt) >= 0) {
    throw new TypeError("pre-treatment window must end strictly before treatment starts");
  }

  const parsed = {
    schemaVersion: 1 as const,
    designId,
    version,
    estimandId,
    estimandSha256,
    method,
    preTreatmentWindow: { start, end },
    treatmentStartsAt,
    assumptions: parseAssumptions(value.assumptions, method),
    diagnostics: parseDiagnostics(value.diagnostics, method),
    specification: parseSpecification(method, value.specification),
    ownerId,
    createdAt,
    limitations: textArray(value.limitations, "identificationDesign.limitations"),
  };
  return parsed as IdentificationDesignInput;
}

export function createIdentificationDesign(value: unknown): Readonly<IdentificationDesign> {
  const body = cloneCanonical(parseDesignBody(value));
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function assertIdentificationDesignIntegrity(
  value: unknown,
): asserts value is IdentificationDesign {
  assertRecord(value, "identificationDesign");
  assertExactKeys(value, [...BODY_KEYS, "manifestSha256"], "identificationDesign");
  const manifestSha256 = expectString(value.manifestSha256, "identificationDesign.manifestSha256");
  assertSha256(manifestSha256, "identificationDesign.manifestSha256");
  const body = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "manifestSha256"),
  );
  const parsed = parseDesignBody(body);
  assertSorted(
    parsed.assumptions.map((assumption) => assumption.key),
    "identificationDesign.assumptions",
  );
  assertSorted(
    parsed.diagnostics.map((diagnostic) => diagnostic.key),
    "identificationDesign.diagnostics",
  );
  if (digestJson(parsed) !== manifestSha256) {
    throw new TypeError("identification design digest does not match immutable content");
  }
}

export function requiredDiagnosticKeys(design: IdentificationDesign): readonly string[] {
  assertIdentificationDesignIntegrity(design);
  return REQUIRED_DIAGNOSTICS[design.method];
}
