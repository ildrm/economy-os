import { decimal, decimalUnits, integer, keys, numericOutput, SCALE } from "./internals.js";

export interface ProspectParameters {
  readonly referencePoint: string;
  readonly gainCurvature: string;
  readonly lossCurvature: string;
  readonly lossAversion: string;
  readonly gainWeighting: string;
  readonly lossWeighting: string;
}
export interface RiskyOutcome {
  readonly value: string;
  readonly probability: string;
}

export function assertProspectParameters(parameters: ProspectParameters): void {
  keys(parameters, [
    "referencePoint",
    "gainCurvature",
    "lossCurvature",
    "lossAversion",
    "gainWeighting",
    "lossWeighting",
  ]);
  decimal(parameters.referencePoint);
  for (const value of [
    parameters.gainCurvature,
    parameters.lossCurvature,
    parameters.gainWeighting,
    parameters.lossWeighting,
  ]) {
    if (decimal(value, 0, 1) === 0) throw new TypeError("Curvature and weighting must be positive");
  }
  if (decimal(parameters.lossAversion, 0, 100) === 0)
    throw new TypeError("lossAversion must be positive");
}
function valueFunction(value: string, parameters: ProspectParameters): number {
  const difference =
    Number(decimalUnits(value) - decimalUnits(parameters.referencePoint)) / Number(SCALE);
  return difference >= 0
    ? difference ** decimal(parameters.gainCurvature)
    : -decimal(parameters.lossAversion) * (-difference) ** decimal(parameters.lossCurvature);
}
/** Pure numerical kernel; parameters are assumptions until bound to a governed model. */
export function prospectValue(value: string, parameters: ProspectParameters): string {
  assertProspectParameters(parameters);
  decimal(value);
  return numericOutput(valueFunction(value, parameters));
}
function weight(probability: number, curvature: number): number {
  if (probability === 0 || probability === 1) return probability;
  return Math.exp(-((-Math.log(probability)) ** curvature));
}
/** One-parameter Prelec (1998), including alpha=1 as the probability-linear benchmark. */
export function weightProbabilityPrelec(probability: string, curvature: string): string {
  const alpha = decimal(curvature, 0, 1);
  if (alpha === 0) throw new TypeError("Weighting curvature must be positive");
  return numericOutput(weight(decimal(probability, 0, 1), alpha));
}
function outcomes(values: readonly RiskyOutcome[]): readonly RiskyOutcome[] {
  integer(values.length, 1, 1000);
  let mass = 0n;
  for (const item of values) {
    keys(item, ["value", "probability"]);
    decimal(item.value);
    decimal(item.probability, 0, 1);
    mass += decimalUnits(item.probability);
  }
  if (mass !== SCALE)
    throw new TypeError(
      "Probabilities must sum exactly to one; unknown probabilities are not risk",
    );
  return [...values].sort((a, b) =>
    decimalUnits(a.value) < decimalUnits(b.value)
      ? -1
      : decimalUnits(a.value) > decimalUnits(b.value)
        ? 1
        : 0,
  );
}
export function expectedValue(values: readonly RiskyOutcome[]): string {
  const numerator = outcomes(values).reduce(
    (sum, item) => sum + decimalUnits(item.value) * decimalUnits(item.probability),
    0n,
  );
  const magnitude = numerator < 0n ? -numerator : numerator;
  const roundedUnits = (magnitude + SCALE / 2n) / SCALE;
  const digits = roundedUnits.toString().padStart(13, "0");
  const result = `${digits.slice(0, -12)}.${digits.slice(-12)}`.replace(/\.?0+$/, "");
  return numerator < 0n && roundedUnits !== 0n ? `-${result}` : result;
}
/** Rank-dependent cumulative decision weights: losses accumulate from worst; gains from best. */
export function cumulativeProspectValue(
  values: readonly RiskyOutcome[],
  parameters: ProspectParameters,
): string {
  assertProspectParameters(parameters);
  const ordered = outcomes(values);
  const reference = decimalUnits(parameters.referencePoint);
  let sum = 0;
  for (const lossSide of [true, false]) {
    const side = ordered.filter((item) => decimalUnits(item.value) < reference === lossSide);
    if (!lossSide) side.reverse();
    let cumulative = 0n;
    const curvature = decimal(lossSide ? parameters.lossWeighting : parameters.gainWeighting);
    for (const item of side) {
      const previousWeight = weight(Number(cumulative) / Number(SCALE), curvature);
      cumulative += decimalUnits(item.probability);
      const nextWeight = weight(Number(cumulative) / Number(SCALE), curvature);
      sum += (nextWeight - previousWeight) * valueFunction(item.value, parameters);
    }
  }
  return numericOutput(sum);
}
/** Inputs are utility flows per equally spaced period, not untransformed consumption. */
export function quasiHyperbolicUtility(
  utilities: readonly string[],
  beta: string,
  delta: string,
): string {
  integer(utilities.length, 1, 10000);
  const presentBias = decimal(beta, 0, 1);
  const discount = decimal(delta, 0, 1);
  return numericOutput(
    utilities.reduce(
      (sum, utility, period) =>
        sum + decimal(utility) * (period === 0 ? 1 : presentBias * discount ** period),
      0,
    ),
  );
}
export function inequalityAversionUtility(
  payoffs: readonly string[],
  personIndex: number,
  alpha: string,
  beta: string,
): string {
  integer(payoffs.length, 2, 1000);
  integer(personIndex, 0, payoffs.length - 1);
  const disadvantage = decimal(alpha, 0, 100);
  const advantage = decimal(beta, 0, 1);
  if (advantage >= 1 || disadvantage < advantage)
    throw new TypeError("Fehr-Schmidt requires 0 <= beta < 1 and alpha >= beta");
  const values = payoffs.map((value) => decimal(value));
  const own = values[personIndex];
  if (own === undefined) throw new TypeError("Missing payoff");
  const penalty =
    values.reduce(
      (sum, other, index) =>
        sum +
        (index === personIndex
          ? 0
          : disadvantage * Math.max(other - own, 0) + advantage * Math.max(own - other, 0)),
      0,
    ) /
    (values.length - 1);
  return numericOutput(own - penalty);
}
export function selectSatisficingChoice(
  utilities: readonly string[],
  aspiration: string,
  searchBudget: number,
): {
  readonly selectedIndex: number | null;
  readonly inspected: number;
  readonly status: "satisfied" | "aspiration_not_met";
} {
  integer(utilities.length, 1, 1000);
  integer(searchBudget, 1, utilities.length);
  const threshold = decimalUnits(aspiration);
  const values = utilities.map((utility) => decimalUnits(utility));
  for (let index = 0; index < searchBudget; index++) {
    const value = values[index];
    if (value !== undefined && value >= threshold)
      return Object.freeze({ selectedIndex: index, inspected: index + 1, status: "satisfied" });
  }
  return Object.freeze({
    selectedIndex: null,
    inspected: searchBudget,
    status: "aspiration_not_met",
  });
}
/** Logit response to supplied utilities, not a solved quantal-response game equilibrium. */
export function logitChoiceProbabilities(
  utilities: readonly string[],
  precision: string,
): readonly string[] {
  integer(utilities.length, 1, 1000);
  const scale = decimal(precision, 0, 1000);
  const values = utilities.map((value) => decimal(value));
  const maximum = Math.max(...values);
  const exponentials = values.map((value) => Math.exp(scale * (value - maximum)));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return Object.freeze(exponentials.map((value) => numericOutput(value / total)));
}
/** Opportunity-adjusted descriptive rates (Odean 1998); no psychological attribution. */
export function dispositionEffect(input: {
  readonly realizedGains: number;
  readonly paperGains: number;
  readonly realizedLosses: number;
  readonly paperLosses: number;
}): {
  readonly gainRealizationRate: string | null;
  readonly lossRealizationRate: string | null;
  readonly difference: string | null;
  readonly missingReason:
    | "no_gain_opportunities"
    | "no_loss_opportunities"
    | "no_opportunities"
    | null;
  readonly interpretation: "descriptive_association_not_causal";
} {
  keys(input, ["realizedGains", "paperGains", "realizedLosses", "paperLosses"]);
  for (const value of Object.values(input)) integer(value, 0, 1e9);
  const gainN = input.realizedGains + input.paperGains;
  const lossN = input.realizedLosses + input.paperLosses;
  const gain = gainN > 0 ? input.realizedGains / gainN : null;
  const loss = lossN > 0 ? input.realizedLosses / lossN : null;
  return Object.freeze({
    gainRealizationRate: gain === null ? null : numericOutput(gain),
    lossRealizationRate: loss === null ? null : numericOutput(loss),
    difference: gain === null || loss === null ? null : numericOutput(gain - loss),
    missingReason:
      gain === null && loss === null
        ? "no_opportunities"
        : gain === null
          ? "no_gain_opportunities"
          : loss === null
            ? "no_loss_opportunities"
            : null,
    interpretation: "descriptive_association_not_causal",
  });
}
