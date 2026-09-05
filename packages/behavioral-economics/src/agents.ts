import { createHash } from "node:crypto";
import {
  type BehavioralScope,
  decimal,
  decimalUnits,
  digest,
  enumeration,
  hash,
  instant,
  integrity,
  keys,
  sameScope,
  scope,
  seal,
  text,
  texts,
  uuid,
} from "./internals.js";
import {
  assertProspectParameters,
  cumulativeProspectValue,
  expectedValue,
  logitChoiceProbabilities,
  type ProspectParameters,
  type RiskyOutcome,
} from "./models.js";

export interface BehavioralChoiceModelInput {
  readonly schemaVersion: 1;
  readonly modelId: string;
  readonly version: string;
  readonly scope: BehavioralScope;
  readonly family: "expected_value" | "cumulative_prospect";
  readonly parameters: ProspectParameters | Readonly<Record<string, never>>;
  readonly parameterBasis:
    | { readonly kind: "explicit_assumption"; readonly rationale: string }
    | {
        readonly kind: "estimated";
        readonly studySha256: string;
        readonly estimatedAt: string;
        readonly population: string;
      };
  readonly population: string;
  readonly jurisdiction: string;
  readonly ownerId: string;
  readonly createdAt: string;
  readonly availableAt: string;
  readonly assumptions: readonly string[];
  readonly boundaryConditions: readonly string[];
  readonly prohibitedUses: readonly string[];
}
export type BehavioralChoiceModel = BehavioralChoiceModelInput & {
  readonly manifestSha256: string;
};
export function createBehavioralChoiceModel(
  input: BehavioralChoiceModelInput,
): BehavioralChoiceModel {
  keys(input, [
    "schemaVersion",
    "modelId",
    "version",
    "scope",
    "family",
    "parameters",
    "parameterBasis",
    "population",
    "jurisdiction",
    "ownerId",
    "createdAt",
    "availableAt",
    "assumptions",
    "boundaryConditions",
    "prohibitedUses",
  ]);
  if (input.schemaVersion !== 1 || !/^\d+\.\d+\.\d+$/.test(input.version))
    throw new TypeError("Versioned behavioral model required");
  uuid(input.modelId);
  uuid(input.ownerId);
  scope(input.scope);
  enumeration(input.family, ["expected_value", "cumulative_prospect"], "model family");
  if (input.family === "cumulative_prospect")
    assertProspectParameters(input.parameters as ProspectParameters);
  else keys(input.parameters, []);
  text(input.population, "population");
  text(input.jurisdiction, "jurisdiction");
  if (instant(input.availableAt) < instant(input.createdAt))
    throw new TypeError("Model availability predates creation");
  if (input.parameterBasis.kind === "explicit_assumption") {
    keys(input.parameterBasis, ["kind", "rationale"]);
    text(input.parameterBasis.rationale, "parameter rationale");
  } else if (input.parameterBasis.kind === "estimated") {
    keys(input.parameterBasis, ["kind", "studySha256", "estimatedAt", "population"]);
    hash(input.parameterBasis.studySha256);
    text(input.parameterBasis.population, "estimation population");
    if (
      instant(input.parameterBasis.estimatedAt) > instant(input.createdAt) ||
      input.parameterBasis.population !== input.population
    )
      throw new TypeError("Estimation chronology/population differs from model");
  } else throw new TypeError("Explicit parameter provenance required");
  texts(input.assumptions, "assumptions");
  texts(input.boundaryConditions, "boundary conditions");
  texts(input.prohibitedUses, "prohibited uses");
  return seal(input);
}
export function behavioralChoiceModelCard(model: BehavioralChoiceModel) {
  createBehavioralChoiceModel(integrity(model));
  return seal({
    modelId: model.modelId,
    version: model.version,
    modelSha256: model.manifestSha256,
    ownerId: model.ownerId,
    purpose: "Reproducible aggregate choice experiments under explicit assumptions",
    family: model.family,
    theory:
      model.family === "cumulative_prospect"
        ? "Tversky-Kahneman cumulative prospect values with one-parameter Prelec weighting"
        : "Risk-neutral expected-value benchmark",
    parameters: model.parameters,
    parameterBasis: model.parameterBasis,
    population: model.population,
    jurisdiction: model.jurisdiction,
    availableAt: model.availableAt,
    assumptions: model.assumptions,
    boundaryConditions: model.boundaryConditions,
    prohibitedUses: model.prohibitedUses,
    validation: "mathematical_tests_only_no_empirical_deployment_validation",
    calibrationUncertainty:
      model.parameterBasis.kind === "explicit_assumption"
        ? "assumed_not_estimated"
        : "not_quantified",
    transferability:
      "Not established outside the declared population, jurisdiction, decision menu and parameterization",
    sensitivity:
      "Parameters can be varied explicitly; no sensitivity study is implied by this card",
    approval: "research_only_no_production_approval",
    retirement: "not_retired",
    limitations: [
      "Use the platform model-governance validation and approval workflow before any deployment.",
      "No empirical evidence or individual behavioral profiles ship with this package.",
    ],
  });
}
export interface BehavioralChoice {
  readonly choiceId: string;
  readonly outcomes: readonly RiskyOutcome[];
}
export interface BehavioralChoiceSimulationInput {
  readonly model: BehavioralChoiceModel;
  readonly scope: BehavioralScope;
  readonly knownAt: string;
  readonly systemAt: string;
  readonly seed: string;
  readonly choices: readonly BehavioralChoice[];
  readonly choiceRule:
    | { readonly kind: "maximum" }
    | { readonly kind: "logit"; readonly precision: string };
}
function bestChoice(values: readonly string[]): number {
  const first = values[0];
  if (first === undefined) throw new TypeError("No evaluated choices");
  let selected = 0;
  let best = decimalUnits(first);
  for (const [index, value] of values.entries()) {
    const candidate = decimalUnits(value);
    if (candidate > best) {
      selected = index;
      best = candidate;
    }
  }
  return selected;
}
/** A one-step decision kernel for aggregate agent scenarios; no investment recommendation. */
export function simulateBehavioralChoice(input: BehavioralChoiceSimulationInput) {
  keys(input, ["model", "scope", "knownAt", "systemAt", "seed", "choices", "choiceRule"]);
  createBehavioralChoiceModel(integrity(input.model));
  sameScope(input.scope, input.model.scope);
  if (
    instant(input.model.availableAt) > instant(input.knownAt) ||
    instant(input.model.createdAt) > instant(input.systemAt)
  )
    throw new TypeError("Model unavailable at simulation cutoff");
  if (!/^(?:0|[1-9]\d{0,19})$/.test(input.seed))
    throw new TypeError("Seed must be a bounded nonnegative integer string");
  if (input.choices.length < 1 || input.choices.length > 100)
    throw new TypeError("Simulation requires 1..100 choices");
  const ids = new Set<string>();
  for (const choice of input.choices) {
    keys(choice, ["choiceId", "outcomes"]);
    text(choice.choiceId, "choiceId", 100);
    if (ids.has(choice.choiceId)) throw new TypeError("Duplicate choice ID");
    ids.add(choice.choiceId);
  }
  const utilities = input.choices.map((choice) =>
    input.model.family === "cumulative_prospect"
      ? cumulativeProspectValue(choice.outcomes, input.model.parameters as ProspectParameters)
      : expectedValue(choice.outcomes),
  );
  const rationalUtilities = input.choices.map((choice) => expectedValue(choice.outcomes));
  let probabilities: readonly string[];
  let selected = bestChoice(utilities);
  if (input.choiceRule.kind === "maximum") {
    keys(input.choiceRule, ["kind"]);
    probabilities = utilities.map((_, index) => (index === selected ? "1" : "0"));
  } else if (input.choiceRule.kind === "logit") {
    keys(input.choiceRule, ["kind", "precision"]);
    probabilities = logitChoiceProbabilities(utilities, input.choiceRule.precision);
    const randomHex = createHash("sha256")
      .update(
        `behavioral-choice-v1:${input.seed}:${digest({ utilities, choices: input.choices, rule: input.choiceRule })}`,
      )
      .digest("hex")
      .slice(0, 13);
    const uniform = Number.parseInt(randomHex, 16) / 0x10_0000_0000_0000;
    let cumulative = 0;
    selected = probabilities.length - 1;
    // Renormalize only rounded numerical probabilities, not scientific missingness.
    const total = probabilities.reduce((sum, value) => sum + decimal(value), 0);
    for (const [index, probability] of probabilities.entries()) {
      cumulative += decimal(probability) / total;
      if (uniform < cumulative) {
        selected = index;
        break;
      }
    }
  } else throw new TypeError("Choice rule is not registered");
  const selectedChoice = input.choices[selected];
  const rationalChoice = input.choices[bestChoice(rationalUtilities)];
  if (!selectedChoice || !rationalChoice) throw new TypeError("Missing choice");
  return seal({
    schemaVersion: 1 as const,
    classification: "simulation" as const,
    modelSha256: input.model.manifestSha256,
    inputSha256: digest(input),
    scope: input.scope,
    knownAt: input.knownAt,
    systemAt: input.systemAt,
    seed: input.seed,
    algorithm: "behavioral_choice_sha256_52bit_v1" as const,
    tieBreak: "first_in_explicit_choice_order" as const,
    selectedChoiceId: selectedChoice.choiceId,
    choices: input.choices.map((choice, index) => ({
      choiceId: choice.choiceId,
      utility: utilities[index],
      probability: probabilities[index],
    })),
    rationalBenchmark: {
      family: "risk_neutral_expected_value" as const,
      selectedChoiceId: rationalChoice.choiceId,
      utilities: rationalUtilities,
    },
    assumptions: input.model.assumptions,
    uncertainty: {
      parameter:
        input.model.parameterBasis.kind === "explicit_assumption"
          ? ("assumed_not_estimated" as const)
          : ("estimate_uncertainty_not_quantified" as const),
      model: "not_quantified" as const,
      stochasticChoice:
        input.choiceRule.kind === "logit" ? ("seeded_logit_rule" as const) : ("none" as const),
      numerical: "IEEE754_kernel_decimal_output_12_places" as const,
    },
    limitations: [
      "A descriptive decision model; no optimal-policy or investment recommendation.",
      "The benchmark is risk-neutral expected value, not the entire expected-utility family.",
      "An estimated parameter citation is provenance, not independent validation or production approval.",
    ],
  });
}

export interface BehavioralModelComparisonInput {
  readonly outcomes: readonly {
    readonly observedChoiceId: string;
    readonly probabilities: readonly { readonly choiceId: string; readonly probability: string }[];
  }[];
  readonly calibrationThrough: string;
  readonly evaluationStartsAt: string;
  readonly evaluationEndsAt: string;
  readonly sampleSha256: string;
}
/** Brier score on held-out categorical choices. The caller supplies real evaluation predictions. */
export function evaluateBehavioralChoicePredictions(input: BehavioralModelComparisonInput) {
  keys(input, [
    "outcomes",
    "calibrationThrough",
    "evaluationStartsAt",
    "evaluationEndsAt",
    "sampleSha256",
  ]);
  if (
    instant(input.calibrationThrough) >= instant(input.evaluationStartsAt) ||
    instant(input.evaluationStartsAt) > instant(input.evaluationEndsAt)
  )
    throw new TypeError("Evaluation must strictly follow calibration");
  hash(input.sampleSha256);
  if (input.outcomes.length < 1 || input.outcomes.length > 10000)
    throw new TypeError("Evaluation sample outside resource bounds");
  let score = 0;
  for (const outcome of input.outcomes) {
    keys(outcome, ["observedChoiceId", "probabilities"]);
    text(outcome.observedChoiceId, "observed choice");
    if (outcome.probabilities.length < 2 || outcome.probabilities.length > 100)
      throw new TypeError("Invalid evaluation choice set");
    const ids = new Set<string>();
    let mass = 0;
    for (const item of outcome.probabilities) {
      keys(item, ["choiceId", "probability"]);
      text(item.choiceId, "choiceId");
      if (ids.has(item.choiceId)) throw new TypeError("Duplicate prediction choice");
      ids.add(item.choiceId);
      const p = decimal(item.probability, 0, 1);
      mass += p;
      score += (p - (item.choiceId === outcome.observedChoiceId ? 1 : 0)) ** 2;
    }
    if (!ids.has(outcome.observedChoiceId) || Math.abs(mass - 1) > 1e-10)
      throw new TypeError("Predictions do not cover the observed choice or sum to one");
  }
  return seal({
    metric: "multiclass_brier_sum_per_observation" as const,
    value: (score / input.outcomes.length).toFixed(12),
    sampleCount: input.outcomes.length,
    sampleSha256: input.sampleSha256,
    calibrationThrough: input.calibrationThrough,
    evaluationStartsAt: input.evaluationStartsAt,
    evaluationEndsAt: input.evaluationEndsAt,
    interpretation: "predictive_performance_not_causal_identification" as const,
  });
}
