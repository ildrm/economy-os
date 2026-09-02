import {
  absoluteDecimal,
  assertDecimal,
  assertEnum,
  assertExactKeys,
  assertInteger,
  assertIsoInstant,
  assertKey,
  assertProbability,
  assertSemver,
  assertSha256,
  assertText,
  assertUniqueKeys,
  assertUuid,
  cloneCanonical,
  compareDecimal,
  compareInstant,
  deepFreeze,
  digestJson,
  formatMetric,
  squareDecimal,
  subtractDecimal,
} from "./internals.js";
import type { TargetTask } from "./targets.js";

export type ForecastOutputSemantics =
  | "calibrated_probability"
  | "uncalibrated_risk_estimate"
  | "continuous_nowcast"
  | "insufficient_evidence";

export interface UncertaintyAssessment {
  readonly status: "quantified" | "qualitative" | "not_available";
  readonly lower: string | null;
  readonly upper: string | null;
  readonly method: string | null;
  readonly explanation: string;
}

export interface SeparatedForecastUncertainty {
  readonly parameterModel: UncertaintyAssessment;
  readonly calibration: UncertaintyAssessment;
  readonly dataRevisionMeasurement: UncertaintyAssessment;
  readonly inputSourceDisagreement: UncertaintyAssessment;
  readonly scenarioStructuralAssumption: UncertaintyAssessment;
  readonly ensembleDisagreement: UncertaintyAssessment;
  readonly labelOnsetAmbiguity: UncertaintyAssessment;
}

export interface CalibrationGate {
  readonly status: "passed" | "failed" | "not_evaluated" | "not_applicable" | "insufficient_events";
  readonly languagePermitted: boolean;
  readonly reportSha256: string | null;
  readonly calibratedThrough: string | null;
  readonly sampleSize: number;
  readonly eventCount: number;
}

export interface DomainAssessment {
  readonly status: "in_domain" | "warning" | "out_of_domain";
  readonly method: string;
  readonly distance: string | null;
  readonly threshold: string | null;
  readonly drivers: readonly string[];
  readonly requiredAction: "allow" | "allow_with_warning" | "restrict" | "disable";
}

export interface ForecastModelReference {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly artifactSha256: string;
  readonly configurationSha256: string;
  readonly codeSha256: string;
  readonly role: "champion" | "shadow_challenger";
  readonly lifecycleStatus: "research" | "validated" | "approved" | "production" | "restricted";
  readonly deploymentApprovalId: string | null;
}

export interface ProbabilisticForecastInput {
  readonly schemaVersion: 1;
  readonly forecastId: string;
  readonly runId: string;
  readonly issuedAt: string;
  readonly asOf: string;
  readonly geographyKey: string;
  readonly regimeKey: string;
  readonly task: TargetTask;
  readonly targetDefinitionId: string;
  readonly targetDefinitionSha256: string;
  readonly horizonDays: number;
  readonly evaluationWindow: Readonly<{ start: string; end: string }>;
  readonly model: ForecastModelReference;
  readonly featureSnapshotId: string;
  readonly featureSnapshotSha256: string;
  readonly featureSnapshotAsOf: string;
  readonly outputSemantics: ForecastOutputSemantics;
  readonly value: string | null;
  readonly calibrationGate: CalibrationGate;
  readonly uncertainty: SeparatedForecastUncertainty;
  readonly domainAssessment: DomainAssessment;
  readonly limitations: readonly string[];
  readonly prohibitedUses: readonly string[];
  readonly operationalActionPermission: "eligible" | "prohibited";
}

export interface ProbabilisticForecast extends ProbabilisticForecastInput {
  readonly manifestSha256: string;
}

function validateUncertaintyAssessment(
  assessment: UncertaintyAssessment,
  field: string,
  task: TargetTask,
): void {
  assertExactKeys(assessment, ["status", "lower", "upper", "method", "explanation"], field);
  assertEnum(assessment.status, ["quantified", "qualitative", "not_available"], `${field}.status`);
  assertText(assessment.explanation, `${field}.explanation`, 1_000);
  if (assessment.status === "quantified") {
    if (assessment.lower === null || assessment.upper === null || assessment.method === null) {
      throw new TypeError(`${field} quantified uncertainty needs bounds and a method`);
    }
    if (task === "binary_event_probability") {
      assertProbability(assessment.lower, `${field}.lower`);
      assertProbability(assessment.upper, `${field}.upper`);
    } else {
      assertDecimal(assessment.lower, `${field}.lower`);
      assertDecimal(assessment.upper, `${field}.upper`);
    }
    if (compareDecimal(assessment.lower, assessment.upper) > 0) {
      throw new TypeError(`${field} lower bound cannot exceed upper bound`);
    }
    assertText(assessment.method, `${field}.method`, 500);
  } else if (assessment.lower !== null || assessment.upper !== null || assessment.method !== null) {
    throw new TypeError(
      `${field} non-quantified uncertainty cannot claim numeric bounds or method`,
    );
  }
}

function validateCalibrationGate(gate: CalibrationGate, task: TargetTask): void {
  assertExactKeys(
    gate,
    [
      "status",
      "languagePermitted",
      "reportSha256",
      "calibratedThrough",
      "sampleSize",
      "eventCount",
    ],
    "forecast.calibrationGate",
  );
  assertEnum(
    gate.status,
    ["passed", "failed", "not_evaluated", "not_applicable", "insufficient_events"],
    "forecast.calibrationGate.status",
  );
  assertInteger(gate.sampleSize, "forecast.calibrationGate.sampleSize", 0, 100_000_000);
  assertInteger(gate.eventCount, "forecast.calibrationGate.eventCount", 0, gate.sampleSize);
  if (task === "continuous_nowcast") {
    if (
      gate.status !== "not_applicable" ||
      gate.languagePermitted ||
      gate.reportSha256 !== null ||
      gate.calibratedThrough !== null ||
      gate.eventCount !== 0
    ) {
      throw new TypeError("continuous nowcasts cannot claim a probability calibration gate");
    }
    return;
  }
  if (gate.status === "passed") {
    if (!gate.languagePermitted || gate.reportSha256 === null || gate.calibratedThrough === null) {
      throw new TypeError("passed calibration needs permission, report, and cutoff");
    }
    if (gate.sampleSize === 0 || gate.eventCount === 0) {
      throw new TypeError("passed calibration needs non-zero held-out observations and events");
    }
    assertSha256(gate.reportSha256, "forecast.calibrationGate.reportSha256");
    assertIsoInstant(gate.calibratedThrough, "forecast.calibrationGate.calibratedThrough");
  } else if (gate.languagePermitted) {
    throw new TypeError("probability language is prohibited unless calibration passed");
  }
  if (gate.reportSha256 !== null) {
    assertSha256(gate.reportSha256, "forecast.calibrationGate.reportSha256");
  }
  if (gate.calibratedThrough !== null) {
    assertIsoInstant(gate.calibratedThrough, "forecast.calibrationGate.calibratedThrough");
  }
}

function validateDomainAssessment(assessment: DomainAssessment): void {
  assertExactKeys(
    assessment,
    ["status", "method", "distance", "threshold", "drivers", "requiredAction"],
    "forecast.domainAssessment",
  );
  assertEnum(assessment.status, ["in_domain", "warning", "out_of_domain"], "domain status");
  assertText(assessment.method, "forecast.domainAssessment.method", 500);
  if ((assessment.distance === null) !== (assessment.threshold === null)) {
    throw new TypeError("domain distance and threshold must be supplied together");
  }
  if (assessment.distance !== null && assessment.threshold !== null) {
    assertDecimal(assessment.distance, "forecast.domainAssessment.distance", false);
    assertDecimal(assessment.threshold, "forecast.domainAssessment.threshold", false);
  }
  assertUniqueKeys(assessment.drivers, "forecast.domainAssessment.drivers");
  assertEnum(
    assessment.requiredAction,
    ["allow", "allow_with_warning", "restrict", "disable"],
    "forecast.domainAssessment.requiredAction",
  );
  const expectedAction =
    assessment.status === "in_domain"
      ? "allow"
      : assessment.status === "warning"
        ? "allow_with_warning"
        : assessment.requiredAction;
  if (assessment.status !== "out_of_domain" && assessment.requiredAction !== expectedAction) {
    throw new TypeError("domain status and required action disagree");
  }
  if (
    assessment.status === "out_of_domain" &&
    assessment.requiredAction !== "restrict" &&
    assessment.requiredAction !== "disable"
  ) {
    throw new TypeError("out-of-domain forecasts must be restricted or disabled");
  }
}

function validateModelReference(model: ForecastModelReference): void {
  assertExactKeys(
    model,
    [
      "modelId",
      "modelVersion",
      "artifactSha256",
      "configurationSha256",
      "codeSha256",
      "role",
      "lifecycleStatus",
      "deploymentApprovalId",
    ],
    "forecast.model",
  );
  assertUuid(model.modelId, "forecast.model.modelId");
  assertSemver(model.modelVersion, "forecast.model.modelVersion");
  assertSha256(model.artifactSha256, "forecast.model.artifactSha256");
  assertSha256(model.configurationSha256, "forecast.model.configurationSha256");
  assertSha256(model.codeSha256, "forecast.model.codeSha256");
  assertEnum(model.role, ["champion", "shadow_challenger"], "forecast.model.role");
  assertEnum(
    model.lifecycleStatus,
    ["research", "validated", "approved", "production", "restricted"],
    "forecast.model.lifecycleStatus",
  );
  if (model.deploymentApprovalId !== null) {
    assertUuid(model.deploymentApprovalId, "forecast.model.deploymentApprovalId");
  }
}

function validateForecastBody(input: ProbabilisticForecastInput): void {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "forecastId",
      "runId",
      "issuedAt",
      "asOf",
      "geographyKey",
      "regimeKey",
      "task",
      "targetDefinitionId",
      "targetDefinitionSha256",
      "horizonDays",
      "evaluationWindow",
      "model",
      "featureSnapshotId",
      "featureSnapshotSha256",
      "featureSnapshotAsOf",
      "outputSemantics",
      "value",
      "calibrationGate",
      "uncertainty",
      "domainAssessment",
      "limitations",
      "prohibitedUses",
      "operationalActionPermission",
    ],
    "forecast",
  );
  if (input.schemaVersion !== 1) throw new TypeError("forecast.schemaVersion must be 1");
  assertUuid(input.forecastId, "forecast.forecastId");
  assertUuid(input.runId, "forecast.runId");
  assertIsoInstant(input.issuedAt, "forecast.issuedAt");
  assertIsoInstant(input.asOf, "forecast.asOf");
  if (compareInstant(input.issuedAt, input.asOf) < 0) {
    throw new TypeError("forecast cannot be issued before its as-of cutoff");
  }
  assertKey(input.geographyKey, "forecast.geographyKey");
  assertKey(input.regimeKey, "forecast.regimeKey");
  assertEnum(input.task, ["binary_event_probability", "continuous_nowcast"], "forecast.task");
  assertUuid(input.targetDefinitionId, "forecast.targetDefinitionId");
  assertSha256(input.targetDefinitionSha256, "forecast.targetDefinitionSha256");
  assertInteger(
    input.horizonDays,
    "forecast.horizonDays",
    input.task === "continuous_nowcast" ? 0 : 1,
    3_650,
  );
  assertExactKeys(input.evaluationWindow, ["start", "end"], "forecast.evaluationWindow");
  assertIsoInstant(input.evaluationWindow.start, "forecast.evaluationWindow.start");
  assertIsoInstant(input.evaluationWindow.end, "forecast.evaluationWindow.end");
  if (
    compareInstant(input.evaluationWindow.start, input.asOf) < 0 ||
    compareInstant(input.evaluationWindow.end, input.evaluationWindow.start) <= 0
  ) {
    throw new TypeError("forecast evaluation window must be future-facing and non-empty");
  }
  validateModelReference(input.model);
  assertUuid(input.featureSnapshotId, "forecast.featureSnapshotId");
  assertSha256(input.featureSnapshotSha256, "forecast.featureSnapshotSha256");
  assertIsoInstant(input.featureSnapshotAsOf, "forecast.featureSnapshotAsOf");
  if (compareInstant(input.featureSnapshotAsOf, input.asOf) > 0) {
    throw new TypeError("forecast cannot reference a future feature snapshot");
  }
  assertEnum(
    input.outputSemantics,
    [
      "calibrated_probability",
      "uncalibrated_risk_estimate",
      "continuous_nowcast",
      "insufficient_evidence",
    ],
    "forecast.outputSemantics",
  );
  if (input.outputSemantics === "insufficient_evidence") {
    if (input.value !== null) throw new TypeError("insufficient evidence cannot claim a value");
  } else {
    if (input.value === null) throw new TypeError("forecast output needs an exact value");
    if (input.task === "binary_event_probability") assertProbability(input.value, "forecast.value");
    else assertDecimal(input.value, "forecast.value");
  }
  if (
    input.task === "continuous_nowcast" &&
    input.outputSemantics !== "continuous_nowcast" &&
    input.outputSemantics !== "insufficient_evidence"
  ) {
    throw new TypeError("continuous target cannot use probability semantics");
  }
  if (input.task === "binary_event_probability" && input.outputSemantics === "continuous_nowcast") {
    throw new TypeError("binary event target cannot use nowcast semantics");
  }
  validateCalibrationGate(input.calibrationGate, input.task);
  if (
    input.calibrationGate.calibratedThrough !== null &&
    compareInstant(input.calibrationGate.calibratedThrough, input.asOf) > 0
  ) {
    throw new TypeError("forecast calibration cutoff cannot be after its as-of time");
  }
  if (
    input.outputSemantics === "calibrated_probability" &&
    (input.calibrationGate.status !== "passed" || !input.calibrationGate.languagePermitted)
  ) {
    throw new TypeError("calibrated probability language requires a passed gate");
  }
  assertExactKeys(
    input.uncertainty,
    [
      "parameterModel",
      "calibration",
      "dataRevisionMeasurement",
      "inputSourceDisagreement",
      "scenarioStructuralAssumption",
      "ensembleDisagreement",
      "labelOnsetAmbiguity",
    ],
    "forecast.uncertainty",
  );
  for (const [name, assessment] of Object.entries(input.uncertainty)) {
    validateUncertaintyAssessment(assessment, `forecast.uncertainty.${name}`, input.task);
    if (
      assessment.status === "quantified" &&
      input.value !== null &&
      input.outputSemantics !== "insufficient_evidence" &&
      (compareDecimal(input.value, assessment.lower ?? input.value) < 0 ||
        compareDecimal(input.value, assessment.upper ?? input.value) > 0)
    ) {
      throw new TypeError(`forecast.uncertainty.${name} must contain the point output`);
    }
  }
  validateDomainAssessment(input.domainAssessment);
  if (
    input.domainAssessment.status === "out_of_domain" &&
    input.outputSemantics === "calibrated_probability"
  ) {
    throw new TypeError("out-of-domain output cannot claim calibrated probability language");
  }
  if (input.limitations.length === 0 || input.prohibitedUses.length === 0) {
    throw new TypeError("forecast limitations and prohibited uses must be explicit");
  }
  for (const limitation of input.limitations) assertText(limitation, "forecast limitation", 1_000);
  for (const prohibitedUse of input.prohibitedUses) {
    assertText(prohibitedUse, "forecast prohibited use", 1_000);
  }
  const canOperate =
    input.model.role === "champion" &&
    input.model.lifecycleStatus === "production" &&
    input.model.deploymentApprovalId !== null &&
    input.task === "binary_event_probability" &&
    input.outputSemantics === "calibrated_probability" &&
    input.calibrationGate.status === "passed" &&
    input.domainAssessment.status === "in_domain";
  if (input.operationalActionPermission !== (canOperate ? "eligible" : "prohibited")) {
    throw new TypeError("operational action permission does not match governed eligibility");
  }
}

export function createProbabilisticForecast(
  input: ProbabilisticForecastInput,
): Readonly<ProbabilisticForecast> {
  validateForecastBody(input);
  const body = cloneCanonical(input);
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function assertProbabilisticForecastIntegrity(forecast: ProbabilisticForecast): void {
  assertSha256(forecast.manifestSha256, "forecast.manifestSha256");
  const { manifestSha256, ...body } = forecast;
  validateForecastBody(body);
  if (digestJson(body) !== manifestSha256) {
    throw new TypeError("forecast digest does not match immutable content");
  }
}

export interface ForecastLedger {
  readonly schemaVersion: 1;
  readonly ledgerId: string;
  readonly sequence: number;
  readonly previousLedgerSha256: string | null;
  readonly forecasts: readonly ProbabilisticForecast[];
  readonly manifestSha256: string;
}

function createLedgerVersion(
  ledgerId: string,
  sequence: number,
  previousLedgerSha256: string | null,
  forecasts: readonly ProbabilisticForecast[],
): Readonly<ForecastLedger> {
  const body = cloneCanonical({
    schemaVersion: 1 as const,
    ledgerId,
    sequence,
    previousLedgerSha256,
    forecasts,
  });
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function createForecastLedger(ledgerId: string): Readonly<ForecastLedger> {
  assertUuid(ledgerId, "ledgerId");
  return createLedgerVersion(ledgerId, 0, null, []);
}

export function appendForecast(
  ledger: ForecastLedger,
  forecast: ProbabilisticForecast,
): Readonly<ForecastLedger> {
  assertForecastLedgerIntegrity(ledger);
  assertProbabilisticForecastIntegrity(forecast);
  if (ledger.forecasts.some((existing) => existing.forecastId === forecast.forecastId)) {
    throw new TypeError("append-only forecast ledger rejects duplicate forecastId");
  }
  return createLedgerVersion(ledger.ledgerId, ledger.sequence + 1, ledger.manifestSha256, [
    ...ledger.forecasts,
    forecast,
  ]);
}

export function assertForecastLedgerIntegrity(ledger: ForecastLedger): void {
  assertExactKeys(
    ledger,
    [
      "schemaVersion",
      "ledgerId",
      "sequence",
      "previousLedgerSha256",
      "forecasts",
      "manifestSha256",
    ],
    "forecastLedger",
  );
  if (ledger.schemaVersion !== 1) throw new TypeError("forecast ledger schemaVersion must be 1");
  assertUuid(ledger.ledgerId, "forecastLedger.ledgerId");
  assertInteger(ledger.sequence, "forecastLedger.sequence", 0, 100_000_000);
  if (ledger.sequence !== ledger.forecasts.length) {
    throw new TypeError("forecast ledger sequence must match append count");
  }
  if (ledger.sequence === 0) {
    if (ledger.previousLedgerSha256 !== null) {
      throw new TypeError("initial forecast ledger cannot have a predecessor");
    }
  } else if (ledger.previousLedgerSha256 === null) {
    throw new TypeError("appended forecast ledger must retain predecessor digest");
  }
  if (ledger.previousLedgerSha256 !== null) {
    assertSha256(ledger.previousLedgerSha256, "forecastLedger.previousLedgerSha256");
  }
  const ids = new Set<string>();
  for (const forecast of ledger.forecasts) {
    assertProbabilisticForecastIntegrity(forecast);
    if (ids.has(forecast.forecastId)) throw new TypeError("forecast ledger has duplicate IDs");
    ids.add(forecast.forecastId);
  }
  assertSha256(ledger.manifestSha256, "forecastLedger.manifestSha256");
  const { manifestSha256, ...body } = ledger;
  if (digestJson(body) !== manifestSha256) {
    throw new TypeError("forecast ledger digest does not match immutable content");
  }
}

export interface ForecastOutcomeInput {
  readonly schemaVersion: 1;
  readonly outcomeId: string;
  readonly forecastId: string;
  readonly evaluationWindow: Readonly<{ start: string; end: string }>;
  readonly realizedValue: "0" | "1";
  readonly observedAt: string;
  readonly availableAt: string;
  readonly recordedAt: string;
  readonly outcomeDatasetSnapshotId: string;
  readonly outcomeDatasetSnapshotSha256: string;
}

export interface ForecastOutcome extends ForecastOutcomeInput {
  readonly manifestSha256: string;
}

function validateForecastOutcomeBody(input: ForecastOutcomeInput): void {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "outcomeId",
      "forecastId",
      "evaluationWindow",
      "realizedValue",
      "observedAt",
      "availableAt",
      "recordedAt",
      "outcomeDatasetSnapshotId",
      "outcomeDatasetSnapshotSha256",
    ],
    "forecastOutcome",
  );
  if (input.schemaVersion !== 1) throw new TypeError("forecastOutcome.schemaVersion must be 1");
  assertUuid(input.outcomeId, "forecastOutcome.outcomeId");
  assertUuid(input.forecastId, "forecastOutcome.forecastId");
  assertExactKeys(input.evaluationWindow, ["start", "end"], "forecastOutcome.evaluationWindow");
  assertIsoInstant(input.evaluationWindow.start, "forecastOutcome.evaluationWindow.start");
  assertIsoInstant(input.evaluationWindow.end, "forecastOutcome.evaluationWindow.end");
  assertEnum(input.realizedValue, ["0", "1"], "forecastOutcome.realizedValue");
  assertIsoInstant(input.observedAt, "forecastOutcome.observedAt");
  assertIsoInstant(input.availableAt, "forecastOutcome.availableAt");
  assertIsoInstant(input.recordedAt, "forecastOutcome.recordedAt");
  if (
    compareInstant(input.evaluationWindow.end, input.evaluationWindow.start) <= 0 ||
    compareInstant(input.observedAt, input.evaluationWindow.end) < 0 ||
    compareInstant(input.availableAt, input.observedAt) < 0 ||
    compareInstant(input.recordedAt, input.availableAt) < 0
  ) {
    throw new TypeError("forecast outcome chronology is invalid");
  }
  assertUuid(input.outcomeDatasetSnapshotId, "forecastOutcome.outcomeDatasetSnapshotId");
  assertSha256(input.outcomeDatasetSnapshotSha256, "forecastOutcome.outcomeDatasetSnapshotSha256");
}

export function createForecastOutcome(input: ForecastOutcomeInput): Readonly<ForecastOutcome> {
  validateForecastOutcomeBody(input);
  const body = cloneCanonical(input);
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function assertForecastOutcomeIntegrity(outcome: ForecastOutcome): void {
  assertSha256(outcome.manifestSha256, "forecastOutcome.manifestSha256");
  const { manifestSha256, ...body } = outcome;
  validateForecastOutcomeBody(body);
  if (digestJson(body) !== manifestSha256) {
    throw new TypeError("forecast outcome digest does not match immutable content");
  }
}

export interface ContinuousForecastOutcomeInput {
  readonly schemaVersion: 1;
  readonly outcomeId: string;
  readonly forecastId: string;
  readonly evaluationWindow: Readonly<{ start: string; end: string }>;
  readonly realizedValue: string;
  readonly unit: string;
  readonly observedAt: string;
  readonly availableAt: string;
  readonly recordedAt: string;
  readonly outcomeDatasetSnapshotId: string;
  readonly outcomeDatasetSnapshotSha256: string;
}

export interface ContinuousForecastOutcome extends ContinuousForecastOutcomeInput {
  readonly manifestSha256: string;
}

function validateContinuousOutcomeBody(input: ContinuousForecastOutcomeInput): void {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "outcomeId",
      "forecastId",
      "evaluationWindow",
      "realizedValue",
      "unit",
      "observedAt",
      "availableAt",
      "recordedAt",
      "outcomeDatasetSnapshotId",
      "outcomeDatasetSnapshotSha256",
    ],
    "continuousForecastOutcome",
  );
  if (input.schemaVersion !== 1) {
    throw new TypeError("continuousForecastOutcome.schemaVersion must be 1");
  }
  assertUuid(input.outcomeId, "continuousForecastOutcome.outcomeId");
  assertUuid(input.forecastId, "continuousForecastOutcome.forecastId");
  assertExactKeys(
    input.evaluationWindow,
    ["start", "end"],
    "continuousForecastOutcome.evaluationWindow",
  );
  assertIsoInstant(
    input.evaluationWindow.start,
    "continuousForecastOutcome.evaluationWindow.start",
  );
  assertIsoInstant(input.evaluationWindow.end, "continuousForecastOutcome.evaluationWindow.end");
  assertDecimal(input.realizedValue, "continuousForecastOutcome.realizedValue");
  assertText(input.unit, "continuousForecastOutcome.unit", 80);
  assertIsoInstant(input.observedAt, "continuousForecastOutcome.observedAt");
  assertIsoInstant(input.availableAt, "continuousForecastOutcome.availableAt");
  assertIsoInstant(input.recordedAt, "continuousForecastOutcome.recordedAt");
  if (
    compareInstant(input.evaluationWindow.end, input.evaluationWindow.start) <= 0 ||
    compareInstant(input.observedAt, input.evaluationWindow.end) < 0 ||
    compareInstant(input.availableAt, input.observedAt) < 0 ||
    compareInstant(input.recordedAt, input.availableAt) < 0
  ) {
    throw new TypeError("continuous forecast outcome chronology is invalid");
  }
  assertUuid(input.outcomeDatasetSnapshotId, "continuousForecastOutcome.outcomeDatasetSnapshotId");
  assertSha256(
    input.outcomeDatasetSnapshotSha256,
    "continuousForecastOutcome.outcomeDatasetSnapshotSha256",
  );
}

export function createContinuousForecastOutcome(
  input: ContinuousForecastOutcomeInput,
): Readonly<ContinuousForecastOutcome> {
  validateContinuousOutcomeBody(input);
  const body = cloneCanonical(input);
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function assertContinuousForecastOutcomeIntegrity(outcome: ContinuousForecastOutcome): void {
  assertSha256(outcome.manifestSha256, "continuousForecastOutcome.manifestSha256");
  const { manifestSha256, ...body } = outcome;
  validateContinuousOutcomeBody(body);
  if (digestJson(body) !== manifestSha256) {
    throw new TypeError("continuous forecast outcome digest does not match immutable content");
  }
}

export interface ForecastScore {
  readonly schemaVersion: 1;
  readonly scoreId: string;
  readonly forecastId: string;
  readonly forecastSha256: string;
  readonly outcomeId: string;
  readonly outcomeSha256: string;
  readonly scoredAt: string;
  readonly scoringRuleVersion: "binary-probability-v1";
  readonly probabilityUsed: string;
  readonly realizedValue: "0" | "1";
  readonly brierScore: string;
  readonly logLoss: string;
  readonly manifestSha256: string;
}

function binaryScoreMetrics(
  probabilityValue: string,
  realizedValue: "0" | "1",
): Readonly<{ brierScore: string; logLoss: string }> {
  const probability = Number(probabilityValue);
  const realized = realizedValue === "1" ? 1 : 0;
  const clipped = Math.min(1 - 1e-12, Math.max(1e-12, probability));
  return Object.freeze({
    brierScore: squareDecimal(subtractDecimal(probabilityValue, realizedValue)),
    logLoss: formatMetric(-(realized * Math.log(clipped) + (1 - realized) * Math.log(1 - clipped))),
  });
}

export function scoreBinaryForecast(
  scoreId: string,
  forecast: ProbabilisticForecast,
  outcome: ForecastOutcome,
  scoredAt: string,
): Readonly<ForecastScore> {
  assertUuid(scoreId, "scoreId");
  assertProbabilisticForecastIntegrity(forecast);
  assertForecastOutcomeIntegrity(outcome);
  assertIsoInstant(scoredAt, "scoredAt");
  if (forecast.task !== "binary_event_probability" || forecast.value === null) {
    throw new TypeError("only numeric binary-event forecasts can be scored with probability rules");
  }
  if (outcome.forecastId !== forecast.forecastId) {
    throw new TypeError("outcome does not belong to forecast");
  }
  if (
    outcome.evaluationWindow.start !== forecast.evaluationWindow.start ||
    outcome.evaluationWindow.end !== forecast.evaluationWindow.end
  ) {
    throw new TypeError("outcome evaluation window does not match forecast");
  }
  if (compareInstant(scoredAt, outcome.recordedAt) < 0) {
    throw new TypeError("score cannot precede outcome recording");
  }
  const metrics = binaryScoreMetrics(forecast.value, outcome.realizedValue);
  const body = cloneCanonical({
    schemaVersion: 1 as const,
    scoreId,
    forecastId: forecast.forecastId,
    forecastSha256: forecast.manifestSha256,
    outcomeId: outcome.outcomeId,
    outcomeSha256: outcome.manifestSha256,
    scoredAt,
    scoringRuleVersion: "binary-probability-v1" as const,
    probabilityUsed: forecast.value,
    realizedValue: outcome.realizedValue,
    ...metrics,
  });
  const score = { ...body, manifestSha256: digestJson(body) };
  assertForecastScoreIntegrity(score);
  return deepFreeze(score);
}

export function assertForecastScoreIntegrity(score: ForecastScore): void {
  assertExactKeys(
    score,
    [
      "schemaVersion",
      "scoreId",
      "forecastId",
      "forecastSha256",
      "outcomeId",
      "outcomeSha256",
      "scoredAt",
      "scoringRuleVersion",
      "probabilityUsed",
      "realizedValue",
      "brierScore",
      "logLoss",
      "manifestSha256",
    ],
    "forecastScore",
  );
  if (score.schemaVersion !== 1) throw new TypeError("forecastScore.schemaVersion must be 1");
  assertUuid(score.scoreId, "forecastScore.scoreId");
  assertUuid(score.forecastId, "forecastScore.forecastId");
  assertSha256(score.forecastSha256, "forecastScore.forecastSha256");
  assertUuid(score.outcomeId, "forecastScore.outcomeId");
  assertSha256(score.outcomeSha256, "forecastScore.outcomeSha256");
  assertIsoInstant(score.scoredAt, "forecastScore.scoredAt");
  if (score.scoringRuleVersion !== "binary-probability-v1") {
    throw new TypeError("forecastScore.scoringRuleVersion is unsupported");
  }
  assertProbability(score.probabilityUsed, "forecastScore.probabilityUsed");
  if (score.realizedValue !== "0" && score.realizedValue !== "1") {
    throw new TypeError("forecastScore.realizedValue must be binary");
  }
  assertDecimal(score.brierScore, "forecastScore.brierScore", false);
  assertDecimal(score.logLoss, "forecastScore.logLoss", false);
  const expected = binaryScoreMetrics(score.probabilityUsed, score.realizedValue);
  if (score.brierScore !== expected.brierScore || score.logLoss !== expected.logLoss) {
    throw new TypeError("forecast score metrics do not match probability and outcome");
  }
  const { manifestSha256, ...body } = score;
  assertSha256(manifestSha256, "forecastScore.manifestSha256");
  if (digestJson(body) !== manifestSha256) {
    throw new TypeError("forecast score digest does not match immutable content");
  }
}

export interface ContinuousNowcastScore {
  readonly schemaVersion: 1;
  readonly scoreId: string;
  readonly forecastId: string;
  readonly forecastSha256: string;
  readonly outcomeId: string;
  readonly outcomeSha256: string;
  readonly scoredAt: string;
  readonly scoringRuleVersion: "continuous-point-v1";
  readonly predictedValue: string;
  readonly realizedValue: string;
  readonly signedError: string;
  readonly absoluteError: string;
  readonly squaredError: string;
  readonly manifestSha256: string;
}

function continuousScoreMetrics(
  predictedValue: string,
  realizedValue: string,
): Readonly<{ signedError: string; absoluteError: string; squaredError: string }> {
  const signed = subtractDecimal(predictedValue, realizedValue);
  return Object.freeze({
    signedError: signed,
    absoluteError: absoluteDecimal(signed),
    squaredError: squareDecimal(signed),
  });
}

export function scoreContinuousNowcast(
  scoreId: string,
  forecast: ProbabilisticForecast,
  outcome: ContinuousForecastOutcome,
  scoredAt: string,
): Readonly<ContinuousNowcastScore> {
  assertUuid(scoreId, "scoreId");
  assertProbabilisticForecastIntegrity(forecast);
  assertContinuousForecastOutcomeIntegrity(outcome);
  assertIsoInstant(scoredAt, "scoredAt");
  if (
    forecast.task !== "continuous_nowcast" ||
    forecast.outputSemantics !== "continuous_nowcast" ||
    forecast.value === null
  ) {
    throw new TypeError("continuous scoring requires a numeric continuous nowcast");
  }
  if (outcome.forecastId !== forecast.forecastId) {
    throw new TypeError("continuous outcome does not belong to forecast");
  }
  if (
    outcome.evaluationWindow.start !== forecast.evaluationWindow.start ||
    outcome.evaluationWindow.end !== forecast.evaluationWindow.end
  ) {
    throw new TypeError("continuous outcome evaluation window does not match forecast");
  }
  if (compareInstant(scoredAt, outcome.recordedAt) < 0) {
    throw new TypeError("continuous score cannot precede outcome recording");
  }
  const metrics = continuousScoreMetrics(forecast.value, outcome.realizedValue);
  const body = cloneCanonical({
    schemaVersion: 1 as const,
    scoreId,
    forecastId: forecast.forecastId,
    forecastSha256: forecast.manifestSha256,
    outcomeId: outcome.outcomeId,
    outcomeSha256: outcome.manifestSha256,
    scoredAt,
    scoringRuleVersion: "continuous-point-v1" as const,
    predictedValue: forecast.value,
    realizedValue: outcome.realizedValue,
    ...metrics,
  });
  const score = { ...body, manifestSha256: digestJson(body) };
  assertContinuousNowcastScoreIntegrity(score);
  return deepFreeze(score);
}

export function assertContinuousNowcastScoreIntegrity(score: ContinuousNowcastScore): void {
  assertExactKeys(
    score,
    [
      "schemaVersion",
      "scoreId",
      "forecastId",
      "forecastSha256",
      "outcomeId",
      "outcomeSha256",
      "scoredAt",
      "scoringRuleVersion",
      "predictedValue",
      "realizedValue",
      "signedError",
      "absoluteError",
      "squaredError",
      "manifestSha256",
    ],
    "continuousNowcastScore",
  );
  if (score.schemaVersion !== 1) {
    throw new TypeError("continuousNowcastScore.schemaVersion must be 1");
  }
  assertUuid(score.scoreId, "continuousNowcastScore.scoreId");
  assertUuid(score.forecastId, "continuousNowcastScore.forecastId");
  assertSha256(score.forecastSha256, "continuousNowcastScore.forecastSha256");
  assertUuid(score.outcomeId, "continuousNowcastScore.outcomeId");
  assertSha256(score.outcomeSha256, "continuousNowcastScore.outcomeSha256");
  assertIsoInstant(score.scoredAt, "continuousNowcastScore.scoredAt");
  if (score.scoringRuleVersion !== "continuous-point-v1") {
    throw new TypeError("continuousNowcastScore.scoringRuleVersion is unsupported");
  }
  for (const [field, value] of [
    ["predictedValue", score.predictedValue],
    ["realizedValue", score.realizedValue],
    ["signedError", score.signedError],
  ] as const) {
    assertDecimal(value, `continuousNowcastScore.${field}`);
  }
  assertDecimal(score.absoluteError, "continuousNowcastScore.absoluteError", false);
  assertDecimal(score.squaredError, "continuousNowcastScore.squaredError", false);
  const expected = continuousScoreMetrics(score.predictedValue, score.realizedValue);
  if (
    score.signedError !== expected.signedError ||
    score.absoluteError !== expected.absoluteError ||
    score.squaredError !== expected.squaredError
  ) {
    throw new TypeError("continuous nowcast score metrics do not match prediction and outcome");
  }
  const { manifestSha256, ...body } = score;
  assertSha256(manifestSha256, "continuousNowcastScore.manifestSha256");
  if (digestJson(body) !== manifestSha256) {
    throw new TypeError("continuous nowcast score digest does not match immutable content");
  }
}

export function assertOperationalActionAllowed(forecast: ProbabilisticForecast): void {
  assertProbabilisticForecastIntegrity(forecast);
  if (forecast.model.role === "shadow_challenger") {
    throw new TypeError("shadow challengers are categorically barred from operational actions");
  }
  if (forecast.operationalActionPermission !== "eligible") {
    throw new TypeError("forecast is not approved for operational action");
  }
}
