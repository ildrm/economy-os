import type { CrisisHazard } from "./forecast.js";
import { CRISIS_HAZARDS } from "./forecast.js";
import {
  assertIsoInstant,
  assertNonBlank,
  assertProbability,
  cloneCanonical,
  compareInstant,
  compareProbability,
  deepFreeze,
  digestJson,
  formatMetric,
} from "./internals.js";
import type { ForecastLedger, ForecastOutcomeScore } from "./ledger.js";
import { assertForecastLedgerIntegrity } from "./ledger.js";

export interface TimeInterval {
  readonly start: string;
  readonly end: string;
}

export interface ChronologicalFold {
  readonly foldId: string;
  readonly training: TimeInterval;
  readonly calibration: TimeInterval;
  readonly test: TimeInterval;
  readonly featureEngineeringFitThrough: string;
  readonly normalizationFitThrough: string;
  readonly thresholdSelectionFitThrough: string;
  readonly hyperparameterSelectionFitThrough: string;
  readonly calibrationFitThrough: string;
}

export interface ChronologicalBacktest {
  readonly schemaVersion: 1;
  readonly mode: "expanding_window" | "rolling_window";
  readonly folds: readonly ChronologicalFold[];
}

export interface ValidatedChronologicalBacktest extends ChronologicalBacktest {
  readonly manifestSha256: string;
}

function assertInterval(interval: TimeInterval, field: string): void {
  assertIsoInstant(interval.start, `${field}.start`);
  assertIsoInstant(interval.end, `${field}.end`);
  if (compareInstant(interval.start, interval.end) >= 0) {
    throw new TypeError(`${field} must have a start before its end`);
  }
}

export function assertChronologicalBacktest(
  input: ChronologicalBacktest,
): Readonly<ValidatedChronologicalBacktest> {
  if (input.schemaVersion !== 1) throw new TypeError("backtest.schemaVersion must be 1");
  if (input.mode !== "expanding_window" && input.mode !== "rolling_window") {
    throw new TypeError("mode must be expanding_window or rolling_window");
  }
  if (input.folds.length === 0)
    throw new TypeError("chronological backtest requires at least one fold");
  const foldIds = new Set<string>();
  for (const [index, fold] of input.folds.entries()) {
    assertNonBlank(fold.foldId, `folds[${index}].foldId`, 128);
    if (foldIds.has(fold.foldId)) throw new TypeError("chronological foldId must be unique");
    foldIds.add(fold.foldId);
    assertInterval(fold.training, `folds[${index}].training`);
    assertInterval(fold.calibration, `folds[${index}].calibration`);
    assertInterval(fold.test, `folds[${index}].test`);
    if (compareInstant(fold.training.end, fold.calibration.start) >= 0) {
      throw new TypeError("training and calibration periods must be strictly chronological");
    }
    if (compareInstant(fold.calibration.end, fold.test.start) >= 0) {
      throw new TypeError("calibration and test periods must be strictly chronological");
    }
    const fittingCutoffs = [
      ["featureEngineeringFitThrough", fold.featureEngineeringFitThrough],
      ["normalizationFitThrough", fold.normalizationFitThrough],
      ["thresholdSelectionFitThrough", fold.thresholdSelectionFitThrough],
      ["hyperparameterSelectionFitThrough", fold.hyperparameterSelectionFitThrough],
      ["calibrationFitThrough", fold.calibrationFitThrough],
    ] as const;
    for (const [field, cutoff] of fittingCutoffs) {
      assertIsoInstant(cutoff, `folds[${index}].${field}`);
      if (compareInstant(cutoff, fold.test.start) >= 0) {
        throw new TypeError(`${field} leaks into the test period`);
      }
    }
    for (const [field, cutoff] of [
      ["featureEngineeringFitThrough", fold.featureEngineeringFitThrough],
      ["normalizationFitThrough", fold.normalizationFitThrough],
      ["hyperparameterSelectionFitThrough", fold.hyperparameterSelectionFitThrough],
    ] as const) {
      if (compareInstant(cutoff, fold.training.end) > 0) {
        throw new TypeError(`${field} must be fitted inside the training period`);
      }
    }
    for (const [field, cutoff] of [
      ["thresholdSelectionFitThrough", fold.thresholdSelectionFitThrough],
      ["calibrationFitThrough", fold.calibrationFitThrough],
    ] as const) {
      if (compareInstant(cutoff, fold.calibration.end) > 0) {
        throw new TypeError(`${field} must be fitted inside the calibration period`);
      }
    }
    const previous = input.folds[index - 1];
    if (previous) {
      if (compareInstant(previous.test.end, fold.test.start) >= 0) {
        throw new TypeError("test folds must be ordered and non-overlapping");
      }
      if (compareInstant(previous.training.end, fold.training.end) >= 0) {
        throw new TypeError("training windows must advance chronologically");
      }
      if (input.mode === "expanding_window" && previous.training.start !== fold.training.start) {
        throw new TypeError("expanding-window folds must preserve the training start");
      }
      if (
        input.mode === "rolling_window" &&
        compareInstant(previous.training.start, fold.training.start) > 0
      ) {
        throw new TypeError("rolling-window training starts cannot move backward");
      }
    }
  }
  const body = cloneCanonical(input);
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

interface HazardScoreRecord {
  readonly score: ForecastOutcomeScore;
  readonly probability: number;
}

function hazardRecords(ledger: ForecastLedger, hazard: CrisisHazard): HazardScoreRecord[] {
  assertForecastLedgerIntegrity(ledger);
  if (!(CRISIS_HAZARDS as readonly string[]).includes(hazard)) {
    throw new TypeError("metrics require one of the eight independent hazards");
  }
  const forecasts = new Map(
    ledger.forecasts
      .filter((forecast) => forecast.hazard === hazard)
      .map((forecast) => [forecast.forecastId, forecast]),
  );
  const records: HazardScoreRecord[] = [];
  for (const score of ledger.outcomeScores) {
    const forecast = forecasts.get(score.forecastId);
    if (!forecast) continue;
    assertProbability(score.probabilityUsed, "score.probabilityUsed");
    if (score.probabilityUsed !== forecast.calibratedProbability) {
      throw new TypeError("score probability does not match its hazard forecast");
    }
    records.push({ score, probability: Number(score.probabilityUsed) });
  }
  if (records.length === 0) throw new TypeError(`no scored forecasts for hazard ${hazard}`);
  return records;
}

export interface ReliabilityBin {
  readonly lowerProbability: string;
  readonly upperProbability: string;
  readonly includesUpperBoundary: boolean;
  readonly count: number;
  readonly meanForecastProbability: string | null;
  readonly observedFrequency: string | null;
  readonly calibrationGap: string | null;
  readonly meanBrierScore: string | null;
}

export interface ReliabilityMetrics {
  readonly schemaVersion: 1;
  readonly hazard: CrisisHazard;
  readonly sampleSize: number;
  readonly averageBrierScore: string;
  readonly averageLogLoss: string;
  readonly expectedCalibrationError: string;
  readonly maximumCalibrationError: string;
  readonly bins: readonly ReliabilityBin[];
  readonly manifestSha256: string;
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function computeReliabilityMetrics(
  ledger: ForecastLedger,
  hazard: CrisisHazard,
  binEdges: readonly string[],
): Readonly<ReliabilityMetrics> {
  if (binEdges.length < 2) throw new TypeError("reliability bins require at least two edges");
  for (const edge of binEdges) assertProbability(edge, "reliability bin edge");
  if (binEdges[0] !== "0" || binEdges.at(-1) !== "1") {
    throw new TypeError("reliability bin edges must span exactly zero to one");
  }
  for (let index = 1; index < binEdges.length; index += 1) {
    const previous = binEdges[index - 1];
    const current = binEdges[index];
    if (previous === undefined || current === undefined) {
      throw new TypeError("reliability bin edge is missing");
    }
    if (compareProbability(previous, current) >= 0) {
      throw new TypeError("reliability bin edges must be strictly increasing");
    }
  }
  const records = hazardRecords(ledger, hazard);
  const bins: ReliabilityBin[] = [];
  for (let index = 0; index < binEdges.length - 1; index += 1) {
    const lowerProbability = binEdges[index];
    const upperProbability = binEdges[index + 1];
    if (lowerProbability === undefined || upperProbability === undefined) {
      throw new TypeError("reliability bin boundary is missing");
    }
    const lower = Number(lowerProbability);
    const upper = Number(upperProbability);
    const includesUpperBoundary = index === binEdges.length - 2;
    const selected = records.filter(
      ({ probability }) =>
        probability >= lower &&
        (includesUpperBoundary ? probability <= upper : probability < upper),
    );
    if (selected.length === 0) {
      bins.push({
        lowerProbability,
        upperProbability,
        includesUpperBoundary,
        count: 0,
        meanForecastProbability: null,
        observedFrequency: null,
        calibrationGap: null,
        meanBrierScore: null,
      });
      continue;
    }
    const meanProbability = average(selected.map(({ probability }) => probability));
    const observedFrequency = average(selected.map(({ score }) => (score.realizedOutcome ? 1 : 0)));
    bins.push({
      lowerProbability,
      upperProbability,
      includesUpperBoundary,
      count: selected.length,
      meanForecastProbability: formatMetric(meanProbability),
      observedFrequency: formatMetric(observedFrequency),
      calibrationGap: formatMetric(Math.abs(meanProbability - observedFrequency)),
      meanBrierScore: formatMetric(average(selected.map(({ score }) => Number(score.brierScore)))),
    });
  }
  const populated = bins.filter((bin) => bin.count > 0);
  const expectedCalibrationError = populated.reduce(
    (sum, bin) => sum + (bin.count / records.length) * Number(bin.calibrationGap),
    0,
  );
  const body = cloneCanonical({
    schemaVersion: 1 as const,
    hazard,
    sampleSize: records.length,
    averageBrierScore: formatMetric(average(records.map(({ score }) => Number(score.brierScore)))),
    averageLogLoss: formatMetric(average(records.map(({ score }) => Number(score.logLoss)))),
    expectedCalibrationError: formatMetric(expectedCalibrationError),
    maximumCalibrationError: formatMetric(
      Math.max(...populated.map((bin) => Number(bin.calibrationGap))),
    ),
    bins,
  });
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export interface RareEventMetricOptions {
  readonly operationalThreshold: string;
  readonly fixedFalsePositiveRate: string;
}

export interface RareEventMetrics {
  readonly schemaVersion: 1;
  readonly hazard: CrisisHazard;
  readonly sampleSize: number;
  readonly eventCount: number;
  readonly nonEventCount: number;
  readonly averagePrecision: string | null;
  readonly prAuc: string | null;
  readonly falseAlertRate: string | null;
  readonly missedEventRate: string | null;
  readonly fixedFalsePositiveRate: string;
  readonly fixedFprRecall: string | null;
  readonly operationalThreshold: string;
  readonly operationalPrecision: string | null;
  readonly operationalRecall: string | null;
  readonly meanTruePositiveLeadTimeSeconds: number | null;
  readonly medianTruePositiveLeadTimeSeconds: number | null;
  readonly manifestSha256: string;
}

function divide(numerator: number, denominator: number): string | null {
  return denominator === 0 ? null : formatMetric(numerator / denominator);
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function computeRareEventMetrics(
  ledger: ForecastLedger,
  hazard: CrisisHazard,
  options: RareEventMetricOptions,
): Readonly<RareEventMetrics> {
  assertProbability(options.operationalThreshold, "operationalThreshold");
  assertProbability(options.fixedFalsePositiveRate, "fixedFalsePositiveRate");
  const records = hazardRecords(ledger, hazard).sort(
    (left, right) =>
      right.probability - left.probability ||
      left.score.forecastId.localeCompare(right.score.forecastId),
  );
  const eventCount = records.filter(({ score }) => score.realizedOutcome).length;
  const nonEventCount = records.length - eventCount;
  let truePositive = 0;
  let falsePositive = 0;
  let averagePrecisionSum = 0;
  let prAucValue = 0;
  let previousRecall = 0;
  let previousPrecision = 1;
  let fixedFprRecall = 0;
  let index = 0;
  while (index < records.length) {
    const thresholdProbability = records[index]?.score.probabilityUsed;
    if (thresholdProbability === undefined) {
      throw new TypeError("rare-event threshold group is missing");
    }
    let groupTruePositive = 0;
    let groupFalsePositive = 0;
    while (
      index < records.length &&
      records[index]?.score.probabilityUsed === thresholdProbability
    ) {
      if (records[index]?.score.realizedOutcome) groupTruePositive += 1;
      else groupFalsePositive += 1;
      index += 1;
    }
    truePositive += groupTruePositive;
    falsePositive += groupFalsePositive;
    const precision = truePositive / (truePositive + falsePositive);
    const recall = eventCount === 0 ? 0 : truePositive / eventCount;
    averagePrecisionSum += (recall - previousRecall) * precision;
    prAucValue += (recall - previousRecall) * ((previousPrecision + precision) / 2);
    previousRecall = recall;
    previousPrecision = precision;
    const fpr = nonEventCount === 0 ? 0 : falsePositive / nonEventCount;
    if (fpr <= Number(options.fixedFalsePositiveRate))
      fixedFprRecall = Math.max(fixedFprRecall, recall);
  }
  const operational = records.filter(
    ({ score }) => compareProbability(score.probabilityUsed, options.operationalThreshold) >= 0,
  );
  const operationalTp = operational.filter(({ score }) => score.realizedOutcome).length;
  const operationalFp = operational.length - operationalTp;
  const falseNegatives = eventCount - operationalTp;
  const trueNegatives = nonEventCount - operationalFp;
  const leadTimes = operational
    .filter(({ score }) => score.realizedOutcome && score.leadTimeSeconds !== null)
    .map(({ score }) => score.leadTimeSeconds as number);
  const body = cloneCanonical({
    schemaVersion: 1 as const,
    hazard,
    sampleSize: records.length,
    eventCount,
    nonEventCount,
    averagePrecision: eventCount === 0 ? null : formatMetric(averagePrecisionSum),
    prAuc: eventCount === 0 ? null : formatMetric(prAucValue),
    falseAlertRate: divide(operationalFp, operationalFp + trueNegatives),
    missedEventRate: divide(falseNegatives, falseNegatives + operationalTp),
    fixedFalsePositiveRate: options.fixedFalsePositiveRate,
    fixedFprRecall: eventCount === 0 || nonEventCount === 0 ? null : formatMetric(fixedFprRecall),
    operationalThreshold: options.operationalThreshold,
    operationalPrecision: divide(operationalTp, operationalTp + operationalFp),
    operationalRecall: divide(operationalTp, eventCount),
    meanTruePositiveLeadTimeSeconds: leadTimes.length === 0 ? null : Math.round(average(leadTimes)),
    medianTruePositiveLeadTimeSeconds: median(leadTimes),
  });
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}
