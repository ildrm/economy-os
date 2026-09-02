import type { CrisisForecast } from "./forecast.js";
import { assertForecastIntegrity } from "./forecast.js";
import {
  assertIsoInstant,
  assertProbability,
  assertSha256,
  assertUuid,
  cloneCanonical,
  compareInstant,
  compareProbability,
  deepFreeze,
  digestJson,
  formatMetric,
  formatScaled,
  probabilityUnits,
} from "./internals.js";

const PROBABILITY_SCALE = 1_000_000_000_000n;
const BRIER_SCALE = PROBABILITY_SCALE * PROBABILITY_SCALE;

export interface OutcomeObservationInput {
  readonly schemaVersion: 1;
  readonly scoreId: string;
  readonly forecastId: string;
  readonly observedAt: string;
  readonly realizedOutcome: boolean;
  readonly eventOccurredAt: string | null;
  readonly classificationThreshold: string;
  readonly logLossEpsilon: string;
}

export interface ForecastOutcomeScore extends OutcomeObservationInput {
  readonly probabilityUsed: string;
  readonly brierScore: string;
  readonly logLoss: string;
  readonly calibrationResidual: string;
  readonly leadTimeSeconds: number | null;
  readonly predictedPositive: boolean;
  readonly directionAccurate: boolean;
  readonly falsePositive: boolean;
  readonly falseNegative: boolean;
  readonly scoreSha256: string;
}

export interface ForecastLedger {
  readonly schemaVersion: 1;
  readonly forecasts: readonly CrisisForecast[];
  readonly outcomeScores: readonly ForecastOutcomeScore[];
  readonly manifestSha256: string;
}

function ledgerFrom(
  forecasts: readonly CrisisForecast[],
  outcomeScores: readonly ForecastOutcomeScore[],
): Readonly<ForecastLedger> {
  const body = cloneCanonical({ schemaVersion: 1 as const, forecasts, outcomeScores });
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function createForecastLedger(): Readonly<ForecastLedger> {
  return ledgerFrom([], []);
}

function assertScoreIntegrity(score: ForecastOutcomeScore): void {
  const { scoreSha256, ...body } = score;
  assertSha256(scoreSha256, "score.scoreSha256");
  if (digestJson(body) !== scoreSha256) throw new TypeError("outcome score digest does not match");
}

export function assertForecastLedgerIntegrity(ledger: ForecastLedger): void {
  if (ledger.schemaVersion !== 1) throw new TypeError("ledger.schemaVersion must be 1");
  assertSha256(ledger.manifestSha256, "ledger.manifestSha256");
  const forecasts = new Map<string, CrisisForecast>();
  for (const forecast of ledger.forecasts) {
    assertForecastIntegrity(forecast);
    if (forecasts.has(forecast.forecastId)) {
      throw new TypeError("forecast ledger contains a duplicate forecastId");
    }
    forecasts.set(forecast.forecastId, forecast);
  }
  const scoreIds = new Set<string>();
  const scoredForecastIds = new Set<string>();
  for (const score of ledger.outcomeScores) {
    assertScoreIntegrity(score);
    if (scoreIds.has(score.scoreId)) {
      throw new TypeError("forecast ledger contains a duplicate scoreId");
    }
    scoreIds.add(score.scoreId);
    const forecast = forecasts.get(score.forecastId);
    if (!forecast) throw new TypeError("outcome score references an unknown forecastId");
    if (scoredForecastIds.has(score.forecastId)) {
      throw new TypeError("forecast has more than one outcome score");
    }
    scoredForecastIds.add(score.forecastId);
    const expected = deriveOutcomeScoreBody(forecast, {
      schemaVersion: score.schemaVersion,
      scoreId: score.scoreId,
      forecastId: score.forecastId,
      observedAt: score.observedAt,
      realizedOutcome: score.realizedOutcome,
      eventOccurredAt: score.eventOccurredAt,
      classificationThreshold: score.classificationThreshold,
      logLossEpsilon: score.logLossEpsilon,
    });
    const { scoreSha256: _digest, ...actual } = score;
    if (digestJson(expected) !== digestJson(actual)) {
      throw new TypeError("derived outcome fields do not match the bound forecast");
    }
  }
  const { manifestSha256, ...body } = ledger;
  if (digestJson(body) !== manifestSha256)
    throw new TypeError("forecast ledger digest does not match");
}

export function appendForecast(
  ledger: ForecastLedger,
  forecast: CrisisForecast,
): Readonly<ForecastLedger> {
  assertForecastLedgerIntegrity(ledger);
  assertForecastIntegrity(forecast);
  if (ledger.forecasts.some((existing) => existing.forecastId === forecast.forecastId)) {
    throw new TypeError("forecastId already exists in the immutable ledger");
  }
  return ledgerFrom([...ledger.forecasts, forecast], ledger.outcomeScores);
}

function horizonEnd(forecast: CrisisForecast): number {
  return Date.parse(forecast.asOf) + forecast.horizon.days * 86_400_000;
}

function exactBrier(probability: string, realizedOutcome: boolean): string {
  const outcome = realizedOutcome ? PROBABILITY_SCALE : 0n;
  const delta = probabilityUnits(probability) - outcome;
  return formatScaled(delta * delta, BRIER_SCALE);
}

function exactResidual(probability: string, realizedOutcome: boolean): string {
  const outcome = realizedOutcome ? PROBABILITY_SCALE : 0n;
  return formatScaled(probabilityUnits(probability) - outcome, PROBABILITY_SCALE);
}

function logLoss(probability: string, realizedOutcome: boolean, epsilon: string): string {
  const p = Number(probability);
  const e = Number(epsilon);
  const bounded = Math.min(1 - e, Math.max(e, p));
  return formatMetric(-(realizedOutcome ? Math.log(bounded) : Math.log(1 - bounded)));
}

function validateOutcomeInput(input: OutcomeObservationInput): void {
  if (input.schemaVersion !== 1) throw new TypeError("outcome.schemaVersion must be 1");
  assertUuid(input.scoreId, "scoreId");
  assertUuid(input.forecastId, "forecastId");
  assertIsoInstant(input.observedAt, "outcome.observedAt");
  assertProbability(input.classificationThreshold, "classificationThreshold");
  assertProbability(input.logLossEpsilon, "logLossEpsilon");
  if (
    compareProbability(input.logLossEpsilon, "0") <= 0 ||
    compareProbability(input.logLossEpsilon, "0.5") >= 0
  ) {
    throw new TypeError("logLossEpsilon must be greater than zero and below 0.5");
  }
  if (typeof input.realizedOutcome !== "boolean") {
    throw new TypeError("realizedOutcome must be a boolean");
  }
  if (input.realizedOutcome !== (input.eventOccurredAt !== null)) {
    throw new TypeError("eventOccurredAt must be present exactly when the outcome occurred");
  }
  if (input.eventOccurredAt !== null) assertIsoInstant(input.eventOccurredAt, "eventOccurredAt");
}

function deriveOutcomeScoreBody(
  forecast: CrisisForecast,
  input: OutcomeObservationInput,
): Omit<ForecastOutcomeScore, "scoreSha256"> {
  validateOutcomeInput(input);
  if (input.forecastId !== forecast.forecastId) {
    throw new TypeError("outcome score forecastId does not match its bound forecast");
  }
  const end = horizonEnd(forecast);
  if (Date.parse(input.observedAt) < end) {
    throw new TypeError("outcome cannot be scored before the forecast horizon is observable");
  }
  if (
    input.eventOccurredAt !== null &&
    (compareInstant(input.eventOccurredAt, forecast.asOf) <= 0 ||
      Date.parse(input.eventOccurredAt) > end)
  ) {
    throw new TypeError("eventOccurredAt must be inside the forecast horizon");
  }
  const predictedPositive =
    compareProbability(forecast.calibratedProbability, input.classificationThreshold) >= 0;
  const leadTimeSeconds =
    input.eventOccurredAt === null
      ? null
      : Math.floor((Date.parse(input.eventOccurredAt) - Date.parse(forecast.generatedAt)) / 1_000);
  if (leadTimeSeconds !== null && leadTimeSeconds < 0) {
    throw new TypeError("eventOccurredAt cannot precede forecast generation");
  }
  return cloneCanonical({
    schemaVersion: 1 as const,
    scoreId: input.scoreId,
    forecastId: input.forecastId,
    observedAt: input.observedAt,
    realizedOutcome: input.realizedOutcome,
    eventOccurredAt: input.eventOccurredAt,
    classificationThreshold: input.classificationThreshold,
    logLossEpsilon: input.logLossEpsilon,
    probabilityUsed: forecast.calibratedProbability,
    brierScore: exactBrier(forecast.calibratedProbability, input.realizedOutcome),
    logLoss: logLoss(forecast.calibratedProbability, input.realizedOutcome, input.logLossEpsilon),
    calibrationResidual: exactResidual(forecast.calibratedProbability, input.realizedOutcome),
    leadTimeSeconds,
    predictedPositive,
    directionAccurate: predictedPositive === input.realizedOutcome,
    falsePositive: predictedPositive && !input.realizedOutcome,
    falseNegative: !predictedPositive && input.realizedOutcome,
  });
}

export function appendOutcomeScore(
  ledger: ForecastLedger,
  input: OutcomeObservationInput,
): Readonly<ForecastLedger> {
  assertForecastLedgerIntegrity(ledger);
  const forecast = ledger.forecasts.find((candidate) => candidate.forecastId === input.forecastId);
  if (!forecast) throw new TypeError("outcome score references an unknown forecastId");
  if (ledger.outcomeScores.some((score) => score.forecastId === input.forecastId)) {
    throw new TypeError("forecast already has an outcome score");
  }
  if (ledger.outcomeScores.some((score) => score.scoreId === input.scoreId)) {
    throw new TypeError("scoreId already exists in the append-only ledger");
  }
  const body = deriveOutcomeScoreBody(forecast, input);
  const score = deepFreeze({ ...body, scoreSha256: digestJson(body) });
  return ledgerFrom(ledger.forecasts, [...ledger.outcomeScores, score]);
}
