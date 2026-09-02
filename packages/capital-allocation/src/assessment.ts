import {
  addDecimals,
  assertCountryCode,
  assertEnum,
  assertExactKeys,
  assertIsoInstant,
  assertKey,
  assertNonBlank,
  assertProbability,
  assertResearchNarrative,
  assertSafeInteger,
  assertSemver,
  assertSha256,
  assertUniqueStrings,
  assertUnitScore,
  assertUuid,
  cloneCanonical,
  compareDecimal,
  compareInstant,
  decimalUnits,
  deepFreeze,
  digestJson,
  formatUnits,
  multiplyDecimal,
  secondsBetween,
  weightedDecimal,
} from "./internals.js";

export const ASSET_CLASSES = [
  "cash",
  "money_market",
  "government_bonds",
  "inflation_linked_bonds",
  "investment_grade_corporate_credit",
  "high_yield_credit",
  "equities",
  "real_estate",
  "infrastructure",
  "gold",
  "silver",
  "industrial_metals",
  "agriculture",
  "energy",
  "foreign_exchange",
  "bitcoin",
  "ethereum",
  "private_credit",
] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const DECISION_INPUT_DIMENSIONS = [
  "access",
  "liquidity",
  "currency",
  "crisis",
  "contagion",
  "human_sustainability",
  "tail_risk",
  "drawdown",
  "historical_analog",
] as const;
export type DecisionInputDimension = (typeof DECISION_INPUT_DIMENSIONS)[number];

export const CANDIDATE_MODEL_STATUSES = ["candidate", "under_review", "retired"] as const;
export type CandidateModelStatus = (typeof CANDIDATE_MODEL_STATUSES)[number];

export const RESEARCH_ONLY_SEMANTICS = Object.freeze({
  purpose: "research_only" as const,
  decisionUse: "prohibited" as const,
  adviceStatus: "not_investment_advice" as const,
  disclaimer: "Research only; not investment advice." as const,
});

export interface ResearchOnlySemantics {
  readonly purpose: "research_only";
  readonly decisionUse: "prohibited";
  readonly adviceStatus: "not_investment_advice";
  readonly disclaimer: "Research only; not investment advice.";
}

export interface PointInTimeContext {
  readonly policy: "strict_system_and_knowledge_cutoff";
  readonly asOf: string;
  readonly knowledgeCutoff: string;
  readonly systemCutoff: string;
  readonly snapshotId: string;
  readonly snapshotSha256: string;
  readonly snapshotRecordedAt: string;
  readonly dataVintageId: string;
  readonly dataVintageSha256: string;
  readonly dataVintageAvailableAt: string;
}

export interface CandidateModelIdentity {
  readonly kind: "candidate_model";
  readonly modelId: string;
  readonly version: string;
  readonly artifactSha256: string;
  readonly status: CandidateModelStatus;
  readonly statusEffectiveAt: string;
  readonly countryScope: readonly string[];
  readonly strategyScope: readonly string[];
}

export interface CountryIdentity {
  readonly countryId: string;
  readonly countryCode: string;
}

export interface EvidenceItemInput {
  readonly evidenceId: string;
  readonly kind: "observation" | "research" | "model_output" | "expert_judgment";
  readonly sourceKey: string;
  readonly summary: string;
  readonly observedAt: string;
  readonly availableAt: string;
  readonly maximumAgeDays: number;
  readonly snapshotId: string;
  readonly snapshotSha256: string;
  readonly dataVintageId: string;
  readonly dataVintageSha256: string;
}

export interface EvidenceFreshness {
  readonly asOf: string;
  readonly ageSeconds: number;
  readonly maximumAgeSeconds: number;
  readonly status: "fresh" | "stale";
}

export interface EvidenceItem extends EvidenceItemInput {
  readonly freshnessAsOf: EvidenceFreshness;
}

export interface EvidenceAssessmentInput {
  readonly items: readonly EvidenceItemInput[];
  readonly absenceReason: string | null;
}

export interface EvidenceAssessment {
  readonly items: readonly EvidenceItem[];
  readonly absenceReason: string | null;
}

export interface DecisionInput {
  readonly dimension: DecisionInputDimension;
  readonly value: string;
  readonly uncertainty: string;
  readonly evidenceIds: readonly string[];
  readonly rationale: string;
}

export interface ScoreWeight {
  readonly dimension: DecisionInputDimension;
  readonly weight: string;
}

export interface ValuationComponentInput {
  readonly componentKey: string;
  readonly signal: string;
  readonly weight: string;
  readonly evidenceIds: readonly string[];
  readonly rationale: string;
}

export interface ScoreUncertainty {
  readonly lower: string;
  readonly upper: string;
  readonly confidenceLevel: string;
  readonly method: string;
}

export interface AvailableValuationInput {
  readonly status: "available";
  readonly components: readonly ValuationComponentInput[];
  readonly uncertainty: ScoreUncertainty;
}

export interface UnavailableValuationInput {
  readonly status: "unavailable";
  readonly reasonCode:
    | "missing_data"
    | "stale_data"
    | "unsupported_asset"
    | "market_dislocation"
    | "method_not_applicable";
  readonly explanation: string;
}

export type ValuationSuitabilityInput = AvailableValuationInput | UnavailableValuationInput;

export interface CombinationPolicy {
  readonly method: "weighted_linear";
  readonly macroWeight: string;
  readonly valuationWeight: string;
}

export interface InvalidationCriterion {
  readonly criterionId: string;
  readonly description: string;
  readonly indicatorKey: string;
  readonly operator:
    | "less_than"
    | "less_than_or_equal"
    | "greater_than"
    | "greater_than_or_equal"
    | "equals"
    | "becomes_unavailable";
  readonly threshold: string;
}

export interface PresentationParameters {
  readonly method: "linear_confidence_shrinkage";
  readonly target: string;
  readonly confidenceWeight: string;
}

export interface AssetAssessmentInput {
  readonly assetClass: AssetClass;
  readonly decisionInputs: readonly DecisionInput[];
  readonly macroWeights: readonly ScoreWeight[];
  readonly macroUncertainty: ScoreUncertainty;
  readonly valuationSuitability: ValuationSuitabilityInput;
  readonly combinationPolicy: CombinationPolicy;
  readonly evidence: EvidenceAssessmentInput;
  readonly counterEvidence: EvidenceAssessmentInput;
  readonly assumptions: readonly string[];
  readonly limitations: readonly string[];
  readonly invalidationCriteria: readonly InvalidationCriterion[];
  readonly presentationParameters: PresentationParameters | null;
}

export interface ScoreContribution {
  readonly componentKey: string;
  readonly inputValue: string;
  readonly weight: string;
  readonly contribution: string;
}

export interface AvailableSuitability {
  readonly status: "available";
  readonly score: string;
  readonly uncertainty: ScoreUncertainty;
  readonly componentContributions: readonly ScoreContribution[];
}

export interface UnavailableSuitability {
  readonly status: "unavailable";
  readonly score: null;
  readonly uncertainty: null;
  readonly componentContributions: readonly [];
  readonly reasonCode: UnavailableValuationInput["reasonCode"] | "valuation_unavailable";
  readonly explanation: string;
}

export type Suitability = AvailableSuitability | UnavailableSuitability;

export interface CombinedSuitabilityAvailable extends AvailableSuitability {
  readonly method: "weighted_linear";
  readonly macroWeight: string;
  readonly valuationWeight: string;
}

export interface CombinedSuitabilityUnavailable extends UnavailableSuitability {
  readonly reasonCode: "valuation_unavailable";
  readonly method: "weighted_linear";
  readonly macroWeight: string;
  readonly valuationWeight: string;
}

export type CombinedSuitability = CombinedSuitabilityAvailable | CombinedSuitabilityUnavailable;

export interface ConfidenceShrunkPresentation {
  readonly label: "display_only_not_a_validated_score";
  readonly method: "linear_confidence_shrinkage";
  readonly basedOnCombinedSuitability: string;
  readonly target: string;
  readonly confidenceWeight: string;
  readonly value: string;
}

export interface AssetAssessment {
  readonly assetClass: AssetClass;
  readonly decisionInputs: readonly DecisionInput[];
  readonly macroSuitability: AvailableSuitability;
  readonly valuationSuitability: Suitability;
  readonly combinedSuitability: CombinedSuitability;
  readonly combinationPolicy: CombinationPolicy;
  readonly evidence: EvidenceAssessment;
  readonly counterEvidence: EvidenceAssessment;
  readonly assumptions: readonly string[];
  readonly limitations: readonly string[];
  readonly invalidationCriteria: readonly InvalidationCriterion[];
  readonly presentationStatistic: ConfidenceShrunkPresentation | null;
}

export interface CapitalAllocationManifestInput {
  readonly schemaVersion: 1;
  readonly manifestId: string;
  readonly semantics: ResearchOnlySemantics;
  readonly pointInTime: PointInTimeContext;
  readonly model: CandidateModelIdentity;
  readonly country: CountryIdentity;
  readonly strategyKey: string;
  readonly assets: readonly AssetAssessmentInput[];
  readonly assumptions: readonly string[];
  readonly limitations: readonly string[];
}

export interface CapitalAllocationManifest extends Omit<CapitalAllocationManifestInput, "assets"> {
  readonly assets: readonly AssetAssessment[];
  readonly manifestSha256: string;
}

function validateSemantics(value: ResearchOnlySemantics): void {
  assertExactKeys(value, ["purpose", "decisionUse", "adviceStatus", "disclaimer"], "semantics");
  if (
    value.purpose !== RESEARCH_ONLY_SEMANTICS.purpose ||
    value.decisionUse !== RESEARCH_ONLY_SEMANTICS.decisionUse ||
    value.adviceStatus !== RESEARCH_ONLY_SEMANTICS.adviceStatus ||
    value.disclaimer !== RESEARCH_ONLY_SEMANTICS.disclaimer
  ) {
    throw new TypeError("semantics must use the exact research-only, not-advice contract");
  }
}

export function assertPointInTimeContext(value: PointInTimeContext): void {
  assertExactKeys(
    value,
    [
      "policy",
      "asOf",
      "knowledgeCutoff",
      "systemCutoff",
      "snapshotId",
      "snapshotSha256",
      "snapshotRecordedAt",
      "dataVintageId",
      "dataVintageSha256",
      "dataVintageAvailableAt",
    ],
    "pointInTime",
  );
  if (value.policy !== "strict_system_and_knowledge_cutoff") {
    throw new TypeError("pointInTime.policy must declare strict system and knowledge cutoffs");
  }
  assertIsoInstant(value.asOf, "pointInTime.asOf");
  assertIsoInstant(value.knowledgeCutoff, "pointInTime.knowledgeCutoff");
  assertIsoInstant(value.systemCutoff, "pointInTime.systemCutoff");
  assertIsoInstant(value.snapshotRecordedAt, "pointInTime.snapshotRecordedAt");
  assertIsoInstant(value.dataVintageAvailableAt, "pointInTime.dataVintageAvailableAt");
  if (
    compareInstant(value.knowledgeCutoff, value.asOf) > 0 ||
    compareInstant(value.systemCutoff, value.asOf) > 0
  ) {
    throw new TypeError("point-in-time cutoffs cannot be after asOf");
  }
  if (compareInstant(value.snapshotRecordedAt, value.systemCutoff) > 0) {
    throw new TypeError("snapshot was recorded after systemCutoff");
  }
  if (compareInstant(value.dataVintageAvailableAt, value.knowledgeCutoff) > 0) {
    throw new TypeError("data vintage was available after knowledgeCutoff");
  }
  assertUuid(value.snapshotId, "pointInTime.snapshotId");
  assertSha256(value.snapshotSha256, "pointInTime.snapshotSha256");
  assertUuid(value.dataVintageId, "pointInTime.dataVintageId");
  assertSha256(value.dataVintageSha256, "pointInTime.dataVintageSha256");
}

function validateModel(value: CandidateModelIdentity, context: PointInTimeContext): void {
  assertExactKeys(
    value,
    [
      "kind",
      "modelId",
      "version",
      "artifactSha256",
      "status",
      "statusEffectiveAt",
      "countryScope",
      "strategyScope",
    ],
    "model",
  );
  if (value.kind !== "candidate_model") throw new TypeError("model.kind must be candidate_model");
  assertUuid(value.modelId, "model.modelId");
  assertSemver(value.version, "model.version");
  assertSha256(value.artifactSha256, "model.artifactSha256");
  assertEnum(value.status, CANDIDATE_MODEL_STATUSES, "model.status");
  assertIsoInstant(value.statusEffectiveAt, "model.statusEffectiveAt");
  if (compareInstant(value.statusEffectiveAt, context.asOf) > 0) {
    throw new TypeError("model status was not effective at pointInTime.asOf");
  }
  assertUniqueStrings(value.countryScope, "model.countryScope", assertCountryCode);
  assertUniqueStrings(value.strategyScope, "model.strategyScope", assertKey);
}

function validateCountry(value: CountryIdentity): void {
  assertExactKeys(value, ["countryId", "countryCode"], "country");
  assertUuid(value.countryId, "country.countryId");
  assertCountryCode(value.countryCode, "country.countryCode");
}

function validateUncertainty(value: ScoreUncertainty, field: string, score: string): void {
  assertExactKeys(value, ["lower", "upper", "confidenceLevel", "method"], field);
  assertUnitScore(value.lower, `${field}.lower`);
  assertUnitScore(value.upper, `${field}.upper`);
  assertProbability(value.confidenceLevel, `${field}.confidenceLevel`);
  assertNonBlank(value.method, `${field}.method`, 200);
  if (compareDecimal(value.lower, value.upper) > 0) {
    throw new TypeError(`${field} lower bound cannot exceed upper bound`);
  }
  if (compareDecimal(value.lower, score) > 0 || compareDecimal(score, value.upper) > 0) {
    throw new TypeError(`${field} must contain its score`);
  }
}

function assertStringList(values: readonly string[], field: string, allowEmpty = false): void {
  assertUniqueStrings(
    values,
    field,
    (value, name) => assertResearchNarrative(value, name),
    allowEmpty,
  );
}

function buildEvidenceItem(
  item: EvidenceItemInput,
  field: string,
  context: PointInTimeContext,
): EvidenceItem {
  assertExactKeys(
    item,
    [
      "evidenceId",
      "kind",
      "sourceKey",
      "summary",
      "observedAt",
      "availableAt",
      "maximumAgeDays",
      "snapshotId",
      "snapshotSha256",
      "dataVintageId",
      "dataVintageSha256",
    ],
    field,
  );
  assertUuid(item.evidenceId, `${field}.evidenceId`);
  assertEnum(
    item.kind,
    ["observation", "research", "model_output", "expert_judgment"],
    `${field}.kind`,
  );
  assertKey(item.sourceKey, `${field}.sourceKey`);
  assertResearchNarrative(item.summary, `${field}.summary`);
  assertIsoInstant(item.observedAt, `${field}.observedAt`);
  assertIsoInstant(item.availableAt, `${field}.availableAt`);
  if (compareInstant(item.observedAt, item.availableAt) > 0) {
    throw new TypeError(`${field} cannot be available before it was observed`);
  }
  if (compareInstant(item.observedAt, context.asOf) > 0) {
    throw new TypeError(`${field} is future evidence relative to pointInTime.asOf`);
  }
  if (compareInstant(item.availableAt, context.knowledgeCutoff) > 0) {
    throw new TypeError(`${field} was not available by pointInTime.knowledgeCutoff`);
  }
  assertSafeInteger(item.maximumAgeDays, `${field}.maximumAgeDays`, 1, 36_500);
  assertUuid(item.snapshotId, `${field}.snapshotId`);
  assertSha256(item.snapshotSha256, `${field}.snapshotSha256`);
  assertUuid(item.dataVintageId, `${field}.dataVintageId`);
  assertSha256(item.dataVintageSha256, `${field}.dataVintageSha256`);
  if (
    item.snapshotId !== context.snapshotId ||
    item.snapshotSha256 !== context.snapshotSha256 ||
    item.dataVintageId !== context.dataVintageId ||
    item.dataVintageSha256 !== context.dataVintageSha256
  ) {
    throw new TypeError(`${field} provenance must match the mandatory point-in-time context`);
  }
  const ageSeconds = secondsBetween(item.observedAt, context.asOf);
  const maximumAgeSeconds = item.maximumAgeDays * 86_400;
  return {
    ...cloneCanonical(item),
    freshnessAsOf: {
      asOf: context.asOf,
      ageSeconds,
      maximumAgeSeconds,
      status: ageSeconds <= maximumAgeSeconds ? "fresh" : "stale",
    },
  };
}

function buildEvidenceAssessment(
  assessment: EvidenceAssessmentInput,
  field: "evidence" | "counterEvidence",
  context: PointInTimeContext,
): EvidenceAssessment {
  assertExactKeys(assessment, ["items", "absenceReason"], field);
  if (!Array.isArray(assessment.items)) throw new TypeError(`${field}.items must be an array`);
  if (assessment.items.length === 0) {
    if (assessment.absenceReason === null) {
      throw new TypeError(`${field} requires items or an explicit absenceReason`);
    }
    assertResearchNarrative(assessment.absenceReason, `${field}.absenceReason`);
  } else if (assessment.absenceReason !== null) {
    throw new TypeError(`${field}.absenceReason must be null when items are present`);
  }
  const ids = new Set<string>();
  const items = assessment.items.map((item, index) => {
    const built = buildEvidenceItem(item, `${field}.items[${index}]`, context);
    if (ids.has(built.evidenceId)) throw new TypeError(`${field} contains duplicate evidenceId`);
    ids.add(built.evidenceId);
    return built;
  });
  return {
    items: items.sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)),
    absenceReason: assessment.absenceReason,
  };
}

function validateFreshEvidenceItem(
  item: EvidenceItem,
  field: string,
  context: PointInTimeContext,
): void {
  assertExactKeys(
    item,
    [
      "evidenceId",
      "kind",
      "sourceKey",
      "summary",
      "observedAt",
      "availableAt",
      "maximumAgeDays",
      "snapshotId",
      "snapshotSha256",
      "dataVintageId",
      "dataVintageSha256",
      "freshnessAsOf",
    ],
    field,
  );
  const { freshnessAsOf: _freshness, ...input } = item;
  const expected = buildEvidenceItem(input, field, context);
  assertExactKeys(
    item.freshnessAsOf,
    ["asOf", "ageSeconds", "maximumAgeSeconds", "status"],
    `${field}.freshnessAsOf`,
  );
  if (
    item.freshnessAsOf.asOf !== expected.freshnessAsOf.asOf ||
    item.freshnessAsOf.ageSeconds !== expected.freshnessAsOf.ageSeconds ||
    item.freshnessAsOf.maximumAgeSeconds !== expected.freshnessAsOf.maximumAgeSeconds ||
    item.freshnessAsOf.status !== expected.freshnessAsOf.status
  ) {
    throw new TypeError(`${field}.freshnessAsOf does not match the injected asOf context`);
  }
}

function validateEvidenceAssessment(
  assessment: EvidenceAssessment,
  field: "evidence" | "counterEvidence",
  context: PointInTimeContext,
): void {
  assertExactKeys(assessment, ["items", "absenceReason"], field);
  if (!Array.isArray(assessment.items)) throw new TypeError(`${field}.items must be an array`);
  if (assessment.items.length === 0) {
    if (assessment.absenceReason === null) throw new TypeError(`${field} requires absenceReason`);
    assertResearchNarrative(assessment.absenceReason, `${field}.absenceReason`);
  } else if (assessment.absenceReason !== null) {
    throw new TypeError(`${field}.absenceReason must be null when items are present`);
  }
  const ids = new Set<string>();
  let previous = "";
  for (const [index, item] of assessment.items.entries()) {
    validateFreshEvidenceItem(item, `${field}.items[${index}]`, context);
    if (ids.has(item.evidenceId)) throw new TypeError(`${field} contains duplicate evidenceId`);
    if (item.evidenceId.localeCompare(previous) < 0) {
      throw new TypeError(`${field} items must use deterministic evidenceId order`);
    }
    ids.add(item.evidenceId);
    previous = item.evidenceId;
  }
}

function validateDecisionInput(
  input: DecisionInput,
  field: string,
  evidenceIds: ReadonlySet<string>,
): void {
  assertExactKeys(input, ["dimension", "value", "uncertainty", "evidenceIds", "rationale"], field);
  assertEnum(input.dimension, DECISION_INPUT_DIMENSIONS, `${field}.dimension`);
  assertUnitScore(input.value, `${field}.value`);
  assertProbability(input.uncertainty, `${field}.uncertainty`);
  assertUniqueStrings(input.evidenceIds, `${field}.evidenceIds`, assertUuid);
  for (const evidenceId of input.evidenceIds) {
    if (!evidenceIds.has(evidenceId)) throw new TypeError(`${field} references unknown evidenceId`);
  }
  assertResearchNarrative(input.rationale, `${field}.rationale`);
}

function validateCombinationPolicy(policy: CombinationPolicy, field: string): void {
  assertExactKeys(policy, ["method", "macroWeight", "valuationWeight"], field);
  if (policy.method !== "weighted_linear") throw new TypeError(`${field}.method is unsupported`);
  assertProbability(policy.macroWeight, `${field}.macroWeight`);
  assertProbability(policy.valuationWeight, `${field}.valuationWeight`);
  if (
    decimalUnits(policy.macroWeight, "macroWeight") +
      decimalUnits(policy.valuationWeight, "valuationWeight") !==
    1_000_000_000_000n
  ) {
    throw new TypeError(`${field} weights must sum exactly to 1`);
  }
}

function validateInvalidationCriteria(
  criteria: readonly InvalidationCriterion[],
  field: string,
): void {
  if (!Array.isArray(criteria) || criteria.length === 0) {
    throw new TypeError(`${field} must be a non-empty array`);
  }
  const ids = new Set<string>();
  let previous = "";
  for (const [index, criterion] of criteria.entries()) {
    const itemField = `${field}[${index}]`;
    assertExactKeys(
      criterion,
      ["criterionId", "description", "indicatorKey", "operator", "threshold"],
      itemField,
    );
    assertKey(criterion.criterionId, `${itemField}.criterionId`);
    if (ids.has(criterion.criterionId)) throw new TypeError(`${field} criterionId must be unique`);
    if (criterion.criterionId.localeCompare(previous) < 0) {
      throw new TypeError(`${field} must use deterministic criterionId order`);
    }
    ids.add(criterion.criterionId);
    previous = criterion.criterionId;
    assertResearchNarrative(criterion.description, `${itemField}.description`);
    assertKey(criterion.indicatorKey, `${itemField}.indicatorKey`);
    assertEnum(
      criterion.operator,
      [
        "less_than",
        "less_than_or_equal",
        "greater_than",
        "greater_than_or_equal",
        "equals",
        "becomes_unavailable",
      ],
      `${itemField}.operator`,
    );
    assertNonBlank(criterion.threshold, `${itemField}.threshold`, 200);
  }
}

function buildAvailableScore(
  contributions: readonly ScoreContribution[],
  uncertainty: ScoreUncertainty,
): AvailableSuitability {
  const score = addDecimals(contributions.map((component) => component.contribution));
  assertUnitScore(score, "suitability.score");
  validateUncertainty(uncertainty, "suitability.uncertainty", score);
  return {
    status: "available",
    score,
    uncertainty: cloneCanonical(uncertainty),
    componentContributions: cloneCanonical(contributions),
  };
}

function buildAssetAssessment(
  input: AssetAssessmentInput,
  context: PointInTimeContext,
): AssetAssessment {
  assertExactKeys(
    input,
    [
      "assetClass",
      "decisionInputs",
      "macroWeights",
      "macroUncertainty",
      "valuationSuitability",
      "combinationPolicy",
      "evidence",
      "counterEvidence",
      "assumptions",
      "limitations",
      "invalidationCriteria",
      "presentationParameters",
    ],
    "asset",
  );
  assertEnum(input.assetClass, ASSET_CLASSES, "asset.assetClass");
  const evidence = buildEvidenceAssessment(input.evidence, "evidence", context);
  const counterEvidence = buildEvidenceAssessment(
    input.counterEvidence,
    "counterEvidence",
    context,
  );
  const evidenceIds = new Set(evidence.items.map((item) => item.evidenceId));
  for (const item of counterEvidence.items) {
    if (evidenceIds.has(item.evidenceId)) {
      throw new TypeError("same evidenceId cannot appear in evidence and counterEvidence");
    }
    evidenceIds.add(item.evidenceId);
  }
  if (
    !Array.isArray(input.decisionInputs) ||
    input.decisionInputs.length !== DECISION_INPUT_DIMENSIONS.length
  ) {
    throw new TypeError(
      "asset.decisionInputs must cover every required decision input exactly once",
    );
  }
  const decisionByDimension = new Map<DecisionInputDimension, DecisionInput>();
  for (const [index, decisionInput] of input.decisionInputs.entries()) {
    validateDecisionInput(decisionInput, `asset.decisionInputs[${index}]`, evidenceIds);
    if (decisionByDimension.has(decisionInput.dimension)) {
      throw new TypeError("asset.decisionInputs contains a duplicate dimension");
    }
    decisionByDimension.set(decisionInput.dimension, decisionInput);
  }
  if (
    !Array.isArray(input.macroWeights) ||
    input.macroWeights.length !== DECISION_INPUT_DIMENSIONS.length
  ) {
    throw new TypeError("asset.macroWeights must cover every required decision input exactly once");
  }
  const weightByDimension = new Map<DecisionInputDimension, string>();
  for (const [index, weight] of input.macroWeights.entries()) {
    assertExactKeys(weight, ["dimension", "weight"], `asset.macroWeights[${index}]`);
    assertEnum(
      weight.dimension,
      DECISION_INPUT_DIMENSIONS,
      `asset.macroWeights[${index}].dimension`,
    );
    assertProbability(weight.weight, `asset.macroWeights[${index}].weight`);
    if (weightByDimension.has(weight.dimension)) {
      throw new TypeError("asset.macroWeights contains a duplicate dimension");
    }
    weightByDimension.set(weight.dimension, weight.weight);
  }
  if (
    [...weightByDimension.values()].reduce(
      (sum, weight) => sum + decimalUnits(weight, "weight"),
      0n,
    ) !== 1_000_000_000_000n
  ) {
    throw new TypeError("asset.macroWeights must sum exactly to 1");
  }
  const decisionInputs = DECISION_INPUT_DIMENSIONS.map((dimension) => {
    const decision = decisionByDimension.get(dimension);
    if (!decision) throw new TypeError(`asset.decisionInputs is missing ${dimension}`);
    return cloneCanonical(decision);
  });
  const macroContributions = DECISION_INPUT_DIMENSIONS.map((dimension) => {
    const decision = decisionByDimension.get(dimension);
    const weight = weightByDimension.get(dimension);
    if (!decision || !weight) throw new TypeError(`asset macro score is missing ${dimension}`);
    return {
      componentKey: dimension,
      inputValue: decision.value,
      weight,
      contribution: multiplyDecimal(decision.value, weight),
    };
  });
  const macroSuitability = buildAvailableScore(macroContributions, input.macroUncertainty);
  validateCombinationPolicy(input.combinationPolicy, "asset.combinationPolicy");

  let valuationSuitability: Suitability;
  if (input.valuationSuitability === undefined) {
    throw new TypeError("asset.valuationSuitability is mandatory and cannot be omitted");
  }
  if (input.valuationSuitability.status === "available") {
    assertExactKeys(
      input.valuationSuitability,
      ["status", "components", "uncertainty"],
      "asset.valuationSuitability",
    );
    if (
      !Array.isArray(input.valuationSuitability.components) ||
      input.valuationSuitability.components.length === 0
    ) {
      throw new TypeError("available valuation requires at least one component");
    }
    const components = new Map<string, ScoreContribution>();
    let weightUnits = 0n;
    for (const [index, component] of input.valuationSuitability.components.entries()) {
      const field = `asset.valuationSuitability.components[${index}]`;
      assertExactKeys(
        component,
        ["componentKey", "signal", "weight", "evidenceIds", "rationale"],
        field,
      );
      assertKey(component.componentKey, `${field}.componentKey`);
      if (components.has(component.componentKey))
        throw new TypeError("valuation componentKey must be unique");
      assertUnitScore(component.signal, `${field}.signal`);
      assertProbability(component.weight, `${field}.weight`);
      weightUnits += decimalUnits(component.weight, `${field}.weight`);
      assertUniqueStrings(component.evidenceIds, `${field}.evidenceIds`, assertUuid);
      for (const evidenceId of component.evidenceIds) {
        if (!evidenceIds.has(evidenceId))
          throw new TypeError(`${field} references unknown evidenceId`);
      }
      assertResearchNarrative(component.rationale, `${field}.rationale`);
      components.set(component.componentKey, {
        componentKey: component.componentKey,
        inputValue: component.signal,
        weight: component.weight,
        contribution: multiplyDecimal(component.signal, component.weight),
      });
    }
    if (weightUnits !== 1_000_000_000_000n) {
      throw new TypeError("valuation component weights must sum exactly to 1");
    }
    valuationSuitability = buildAvailableScore(
      [...components.values()].sort((left, right) =>
        left.componentKey.localeCompare(right.componentKey),
      ),
      input.valuationSuitability.uncertainty,
    );
  } else {
    assertExactKeys(
      input.valuationSuitability,
      ["status", "reasonCode", "explanation"],
      "asset.valuationSuitability",
    );
    if (input.valuationSuitability.status !== "unavailable") {
      throw new TypeError("asset.valuationSuitability.status is unsupported");
    }
    assertEnum(
      input.valuationSuitability.reasonCode,
      [
        "missing_data",
        "stale_data",
        "unsupported_asset",
        "market_dislocation",
        "method_not_applicable",
      ],
      "asset.valuationSuitability.reasonCode",
    );
    assertResearchNarrative(
      input.valuationSuitability.explanation,
      "asset.valuationSuitability.explanation",
    );
    valuationSuitability = {
      status: "unavailable",
      score: null,
      uncertainty: null,
      componentContributions: [],
      reasonCode: input.valuationSuitability.reasonCode,
      explanation: input.valuationSuitability.explanation,
    };
  }

  let combinedSuitability: CombinedSuitability;
  if (valuationSuitability.status === "unavailable") {
    combinedSuitability = {
      status: "unavailable",
      score: null,
      uncertainty: null,
      componentContributions: [],
      reasonCode: "valuation_unavailable",
      explanation:
        "Combined suitability is unavailable because valuation suitability is unavailable.",
      method: input.combinationPolicy.method,
      macroWeight: input.combinationPolicy.macroWeight,
      valuationWeight: input.combinationPolicy.valuationWeight,
    };
  } else {
    const score = weightedDecimal(
      macroSuitability.score,
      input.combinationPolicy.macroWeight,
      valuationSuitability.score,
      input.combinationPolicy.valuationWeight,
    );
    const lower = weightedDecimal(
      macroSuitability.uncertainty.lower,
      input.combinationPolicy.macroWeight,
      valuationSuitability.uncertainty.lower,
      input.combinationPolicy.valuationWeight,
    );
    const upper = weightedDecimal(
      macroSuitability.uncertainty.upper,
      input.combinationPolicy.macroWeight,
      valuationSuitability.uncertainty.upper,
      input.combinationPolicy.valuationWeight,
    );
    const confidenceLevel =
      compareDecimal(
        macroSuitability.uncertainty.confidenceLevel,
        valuationSuitability.uncertainty.confidenceLevel,
      ) <= 0
        ? macroSuitability.uncertainty.confidenceLevel
        : valuationSuitability.uncertainty.confidenceLevel;
    combinedSuitability = {
      status: "available",
      score,
      uncertainty: {
        lower,
        upper,
        confidenceLevel,
        method: "weighted_component_intervals",
      },
      componentContributions: [
        {
          componentKey: "macro_suitability",
          inputValue: macroSuitability.score,
          weight: input.combinationPolicy.macroWeight,
          contribution: multiplyDecimal(
            macroSuitability.score,
            input.combinationPolicy.macroWeight,
          ),
        },
        {
          componentKey: "valuation_suitability",
          inputValue: valuationSuitability.score,
          weight: input.combinationPolicy.valuationWeight,
          contribution: multiplyDecimal(
            valuationSuitability.score,
            input.combinationPolicy.valuationWeight,
          ),
        },
      ],
      method: input.combinationPolicy.method,
      macroWeight: input.combinationPolicy.macroWeight,
      valuationWeight: input.combinationPolicy.valuationWeight,
    };
    validateUncertainty(combinedSuitability.uncertainty, "combinedSuitability.uncertainty", score);
  }

  let presentationStatistic: ConfidenceShrunkPresentation | null = null;
  if (input.presentationParameters !== null) {
    assertExactKeys(
      input.presentationParameters,
      ["method", "target", "confidenceWeight"],
      "asset.presentationParameters",
    );
    if (input.presentationParameters.method !== "linear_confidence_shrinkage") {
      throw new TypeError("presentationParameters.method is unsupported");
    }
    assertUnitScore(input.presentationParameters.target, "presentationParameters.target");
    assertProbability(
      input.presentationParameters.confidenceWeight,
      "presentationParameters.confidenceWeight",
    );
    if (combinedSuitability.status === "unavailable") {
      throw new TypeError("presentation statistic requires available combined suitability");
    }
    const complement = formatUnits(
      1_000_000_000_000n -
        decimalUnits(input.presentationParameters.confidenceWeight, "confidenceWeight"),
    );
    presentationStatistic = {
      label: "display_only_not_a_validated_score",
      method: input.presentationParameters.method,
      basedOnCombinedSuitability: combinedSuitability.score,
      target: input.presentationParameters.target,
      confidenceWeight: input.presentationParameters.confidenceWeight,
      value: weightedDecimal(
        combinedSuitability.score,
        input.presentationParameters.confidenceWeight,
        input.presentationParameters.target,
        complement,
      ),
    };
  }

  assertStringList(input.assumptions, "asset.assumptions");
  assertStringList(input.limitations, "asset.limitations");
  const invalidationCriteria = [...input.invalidationCriteria].sort((left, right) =>
    left.criterionId.localeCompare(right.criterionId),
  );
  validateInvalidationCriteria(invalidationCriteria, "asset.invalidationCriteria");
  return {
    assetClass: input.assetClass,
    decisionInputs,
    macroSuitability,
    valuationSuitability,
    combinedSuitability,
    combinationPolicy: cloneCanonical(input.combinationPolicy),
    evidence,
    counterEvidence,
    assumptions: [...input.assumptions].sort(),
    limitations: [...input.limitations].sort(),
    invalidationCriteria: cloneCanonical(invalidationCriteria),
    presentationStatistic,
  };
}

function validateContribution(
  contribution: ScoreContribution,
  field: string,
  expectedKey?: string,
): void {
  assertExactKeys(contribution, ["componentKey", "inputValue", "weight", "contribution"], field);
  assertKey(contribution.componentKey, `${field}.componentKey`);
  if (expectedKey && contribution.componentKey !== expectedKey) {
    throw new TypeError(`${field}.componentKey must be ${expectedKey}`);
  }
  assertUnitScore(contribution.inputValue, `${field}.inputValue`);
  assertProbability(contribution.weight, `${field}.weight`);
  assertUnitScore(contribution.contribution, `${field}.contribution`);
  if (multiplyDecimal(contribution.inputValue, contribution.weight) !== contribution.contribution) {
    throw new TypeError(`${field}.contribution does not match its input and weight`);
  }
}

function validateAvailableSuitability(
  value: AvailableSuitability,
  field: string,
  expectedKeys?: readonly string[],
  additionalKeys: readonly string[] = [],
): void {
  assertExactKeys(
    value,
    ["status", "score", "uncertainty", "componentContributions", ...additionalKeys],
    field,
  );
  if (value.status !== "available") throw new TypeError(`${field}.status must be available`);
  assertUnitScore(value.score, `${field}.score`);
  if (!Array.isArray(value.componentContributions) || value.componentContributions.length === 0) {
    throw new TypeError(`${field}.componentContributions must be non-empty`);
  }
  if (expectedKeys && value.componentContributions.length !== expectedKeys.length) {
    throw new TypeError(`${field}.componentContributions does not cover its required components`);
  }
  value.componentContributions.forEach((contribution, index) => {
    validateContribution(
      contribution,
      `${field}.componentContributions[${index}]`,
      expectedKeys?.[index],
    );
  });
  if (!expectedKeys) {
    const keys = new Set<string>();
    let previous = "";
    for (const component of value.componentContributions) {
      if (keys.has(component.componentKey) || component.componentKey.localeCompare(previous) < 0) {
        throw new TypeError(`${field}.componentContributions must be unique and deterministic`);
      }
      keys.add(component.componentKey);
      previous = component.componentKey;
    }
  }
  if (
    value.componentContributions.reduce(
      (sum, item) => sum + decimalUnits(item.weight, `${field}.weight`),
      0n,
    ) !== 1_000_000_000_000n
  ) {
    throw new TypeError(`${field}.componentContributions weights must sum exactly to 1`);
  }
  if (addDecimals(value.componentContributions.map((item) => item.contribution)) !== value.score) {
    throw new TypeError(`${field}.score does not equal its component contributions`);
  }
  validateUncertainty(value.uncertainty, `${field}.uncertainty`, value.score);
}

function validateAssetAssessment(asset: AssetAssessment, context: PointInTimeContext): void {
  assertExactKeys(
    asset,
    [
      "assetClass",
      "decisionInputs",
      "macroSuitability",
      "valuationSuitability",
      "combinedSuitability",
      "combinationPolicy",
      "evidence",
      "counterEvidence",
      "assumptions",
      "limitations",
      "invalidationCriteria",
      "presentationStatistic",
    ],
    "asset",
  );
  assertEnum(asset.assetClass, ASSET_CLASSES, "asset.assetClass");
  validateEvidenceAssessment(asset.evidence, "evidence", context);
  validateEvidenceAssessment(asset.counterEvidence, "counterEvidence", context);
  const evidenceIds = new Set(asset.evidence.items.map((item) => item.evidenceId));
  for (const item of asset.counterEvidence.items) {
    if (evidenceIds.has(item.evidenceId))
      throw new TypeError("duplicate evidence across assessments");
    evidenceIds.add(item.evidenceId);
  }
  if (
    !Array.isArray(asset.decisionInputs) ||
    asset.decisionInputs.length !== DECISION_INPUT_DIMENSIONS.length
  ) {
    throw new TypeError("asset.decisionInputs must cover all dimensions");
  }
  asset.decisionInputs.forEach((item, index) => {
    if (item.dimension !== DECISION_INPUT_DIMENSIONS[index]) {
      throw new TypeError("asset.decisionInputs must use canonical dimension order");
    }
    validateDecisionInput(item, `asset.decisionInputs[${index}]`, evidenceIds);
  });
  validateAvailableSuitability(
    asset.macroSuitability,
    "asset.macroSuitability",
    DECISION_INPUT_DIMENSIONS,
  );
  for (const [index, contribution] of asset.macroSuitability.componentContributions.entries()) {
    const decision = asset.decisionInputs[index];
    if (!decision || contribution.inputValue !== decision.value) {
      throw new TypeError("macro contribution input must match its decision input");
    }
  }
  validateCombinationPolicy(asset.combinationPolicy, "asset.combinationPolicy");
  if (asset.valuationSuitability.status === "available") {
    validateAvailableSuitability(asset.valuationSuitability, "asset.valuationSuitability");
  } else {
    assertExactKeys(
      asset.valuationSuitability,
      ["status", "score", "uncertainty", "componentContributions", "reasonCode", "explanation"],
      "asset.valuationSuitability",
    );
    if (
      asset.valuationSuitability.score !== null ||
      asset.valuationSuitability.uncertainty !== null ||
      asset.valuationSuitability.componentContributions.length !== 0
    ) {
      throw new TypeError("unavailable valuation must not carry a neutral or synthetic score");
    }
    assertEnum(
      asset.valuationSuitability.reasonCode,
      [
        "missing_data",
        "stale_data",
        "unsupported_asset",
        "market_dislocation",
        "method_not_applicable",
      ],
      "asset.valuationSuitability.reasonCode",
    );
    assertResearchNarrative(
      asset.valuationSuitability.explanation,
      "asset.valuationSuitability.explanation",
    );
  }
  if (asset.combinedSuitability.status === "available") {
    assertExactKeys(
      asset.combinedSuitability,
      [
        "status",
        "score",
        "uncertainty",
        "componentContributions",
        "method",
        "macroWeight",
        "valuationWeight",
      ],
      "asset.combinedSuitability",
    );
    if (asset.valuationSuitability.status !== "available") {
      throw new TypeError("combined suitability cannot be available without valuation suitability");
    }
    validateAvailableSuitability(
      asset.combinedSuitability,
      "asset.combinedSuitability",
      ["macro_suitability", "valuation_suitability"],
      ["method", "macroWeight", "valuationWeight"],
    );
    if (
      asset.combinedSuitability.method !== asset.combinationPolicy.method ||
      asset.combinedSuitability.macroWeight !== asset.combinationPolicy.macroWeight ||
      asset.combinedSuitability.valuationWeight !== asset.combinationPolicy.valuationWeight
    ) {
      throw new TypeError("combined suitability does not match combinationPolicy");
    }
    const expected = weightedDecimal(
      asset.macroSuitability.score,
      asset.combinationPolicy.macroWeight,
      asset.valuationSuitability.score,
      asset.combinationPolicy.valuationWeight,
    );
    if (asset.combinedSuitability.score !== expected) {
      throw new TypeError("combined suitability score does not match macro and valuation scores");
    }
  } else {
    assertExactKeys(
      asset.combinedSuitability,
      [
        "status",
        "score",
        "uncertainty",
        "componentContributions",
        "reasonCode",
        "explanation",
        "method",
        "macroWeight",
        "valuationWeight",
      ],
      "asset.combinedSuitability",
    );
    if (
      asset.valuationSuitability.status !== "unavailable" ||
      asset.combinedSuitability.reasonCode !== "valuation_unavailable" ||
      asset.combinedSuitability.score !== null ||
      asset.combinedSuitability.uncertainty !== null ||
      asset.combinedSuitability.componentContributions.length !== 0
    ) {
      throw new TypeError(
        "unavailable combined suitability must be caused by unavailable valuation",
      );
    }
  }
  assertStringList(asset.assumptions, "asset.assumptions");
  assertStringList(asset.limitations, "asset.limitations");
  if ([...asset.assumptions].sort().some((item, index) => item !== asset.assumptions[index])) {
    throw new TypeError("asset.assumptions must use deterministic order");
  }
  if ([...asset.limitations].sort().some((item, index) => item !== asset.limitations[index])) {
    throw new TypeError("asset.limitations must use deterministic order");
  }
  validateInvalidationCriteria(asset.invalidationCriteria, "asset.invalidationCriteria");
  if (asset.presentationStatistic !== null) {
    assertExactKeys(
      asset.presentationStatistic,
      ["label", "method", "basedOnCombinedSuitability", "target", "confidenceWeight", "value"],
      "asset.presentationStatistic",
    );
    if (
      asset.presentationStatistic.label !== "display_only_not_a_validated_score" ||
      asset.presentationStatistic.method !== "linear_confidence_shrinkage"
    ) {
      throw new TypeError("presentation statistic must remain explicitly display-only");
    }
    if (asset.combinedSuitability.status !== "available") {
      throw new TypeError("presentation statistic requires available combined suitability");
    }
    assertUnitScore(asset.presentationStatistic.target, "presentationStatistic.target");
    assertProbability(
      asset.presentationStatistic.confidenceWeight,
      "presentationStatistic.confidenceWeight",
    );
    assertUnitScore(asset.presentationStatistic.value, "presentationStatistic.value");
    if (
      asset.presentationStatistic.basedOnCombinedSuitability !== asset.combinedSuitability.score
    ) {
      throw new TypeError("presentation statistic must identify the combined score it presents");
    }
    const complement = formatUnits(
      1_000_000_000_000n -
        decimalUnits(asset.presentationStatistic.confidenceWeight, "confidenceWeight"),
    );
    const expected = weightedDecimal(
      asset.combinedSuitability.score,
      asset.presentationStatistic.confidenceWeight,
      asset.presentationStatistic.target,
      complement,
    );
    if (asset.presentationStatistic.value !== expected) {
      throw new TypeError("presentation statistic does not match its declared shrinkage method");
    }
  }
}

function normalizeModel(model: CandidateModelIdentity): CandidateModelIdentity {
  return {
    ...cloneCanonical(model),
    countryScope: [...model.countryScope].sort(),
    strategyScope: [...model.strategyScope].sort(),
  };
}

function normalizeNarratives(values: readonly string[], field: string): readonly string[] {
  assertStringList(values, field);
  return [...values].sort();
}

export function createCapitalAllocationManifest(
  input: CapitalAllocationManifestInput,
): Readonly<CapitalAllocationManifest> {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "manifestId",
      "semantics",
      "pointInTime",
      "model",
      "country",
      "strategyKey",
      "assets",
      "assumptions",
      "limitations",
    ],
    "manifest",
  );
  if (input.schemaVersion !== 1) throw new TypeError("manifest.schemaVersion must be 1");
  assertUuid(input.manifestId, "manifest.manifestId");
  validateSemantics(input.semantics);
  assertPointInTimeContext(input.pointInTime);
  validateModel(input.model, input.pointInTime);
  validateCountry(input.country);
  assertKey(input.strategyKey, "manifest.strategyKey");
  if (!input.model.countryScope.includes(input.country.countryCode)) {
    throw new TypeError("manifest country is outside candidate model countryScope");
  }
  if (!input.model.strategyScope.includes(input.strategyKey)) {
    throw new TypeError("manifest strategy is outside candidate model strategyScope");
  }
  if (
    !Array.isArray(input.assets) ||
    input.assets.length === 0 ||
    input.assets.length > ASSET_CLASSES.length
  ) {
    throw new TypeError(
      `manifest.assets must contain between 1 and ${ASSET_CLASSES.length} assets`,
    );
  }
  const assets = new Map<AssetClass, AssetAssessment>();
  for (const asset of input.assets) {
    const built = buildAssetAssessment(asset, input.pointInTime);
    if (assets.has(built.assetClass))
      throw new TypeError("manifest.assets contains duplicate assetClass");
    assets.set(built.assetClass, built);
  }
  const orderedAssets = ASSET_CLASSES.flatMap((assetClass) => {
    const asset = assets.get(assetClass);
    return asset ? [asset] : [];
  });
  const body = cloneCanonical({
    schemaVersion: 1 as const,
    manifestId: input.manifestId,
    semantics: input.semantics,
    pointInTime: input.pointInTime,
    model: normalizeModel(input.model),
    country: input.country,
    strategyKey: input.strategyKey,
    assets: orderedAssets,
    assumptions: normalizeNarratives(input.assumptions, "manifest.assumptions"),
    limitations: normalizeNarratives(input.limitations, "manifest.limitations"),
  });
  const output = { ...body, manifestSha256: digestJson(body) };
  assertCapitalAllocationManifestIntegrity(output);
  return deepFreeze(output);
}

export function assertCapitalAllocationManifestIntegrity(
  manifest: CapitalAllocationManifest,
): void {
  assertExactKeys(
    manifest,
    [
      "schemaVersion",
      "manifestId",
      "semantics",
      "pointInTime",
      "model",
      "country",
      "strategyKey",
      "assets",
      "assumptions",
      "limitations",
      "manifestSha256",
    ],
    "manifest",
  );
  const { manifestSha256, ...body } = manifest;
  assertSha256(manifestSha256, "manifest.manifestSha256");
  if (manifest.schemaVersion !== 1) throw new TypeError("manifest.schemaVersion must be 1");
  assertUuid(manifest.manifestId, "manifest.manifestId");
  validateSemantics(manifest.semantics);
  assertPointInTimeContext(manifest.pointInTime);
  validateModel(manifest.model, manifest.pointInTime);
  validateCountry(manifest.country);
  assertKey(manifest.strategyKey, "manifest.strategyKey");
  if (!manifest.model.countryScope.includes(manifest.country.countryCode)) {
    throw new TypeError("manifest country is outside candidate model countryScope");
  }
  if (!manifest.model.strategyScope.includes(manifest.strategyKey)) {
    throw new TypeError("manifest strategy is outside candidate model strategyScope");
  }
  if (
    !Array.isArray(manifest.assets) ||
    manifest.assets.length === 0 ||
    manifest.assets.length > ASSET_CLASSES.length
  ) {
    throw new TypeError("manifest.assets count is invalid");
  }
  let priorOrder = -1;
  const assetClasses = new Set<AssetClass>();
  for (const asset of manifest.assets) {
    validateAssetAssessment(asset, manifest.pointInTime);
    const order = ASSET_CLASSES.indexOf(asset.assetClass);
    if (order <= priorOrder || assetClasses.has(asset.assetClass)) {
      throw new TypeError("manifest.assets must be unique and use canonical taxonomy order");
    }
    priorOrder = order;
    assetClasses.add(asset.assetClass);
  }
  assertStringList(manifest.assumptions, "manifest.assumptions");
  assertStringList(manifest.limitations, "manifest.limitations");
  if (
    [...manifest.assumptions].sort().some((item, index) => item !== manifest.assumptions[index])
  ) {
    throw new TypeError("manifest.assumptions must use deterministic order");
  }
  if (
    [...manifest.limitations].sort().some((item, index) => item !== manifest.limitations[index])
  ) {
    throw new TypeError("manifest.limitations must use deterministic order");
  }
  if (digestJson(body) !== manifestSha256) {
    throw new TypeError("capital-allocation manifest digest does not match its content");
  }
}
