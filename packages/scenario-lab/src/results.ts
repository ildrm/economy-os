import type { BaselineIdentity, ScenarioDefinition } from "./definitions.js";
import { assertBaselineIntegrity, assertScenarioDefinitionIntegrity } from "./definitions.js";
import {
  assertDecimal,
  assertDigestIntegrity,
  assertExactKeys,
  assertIsoInstant,
  assertKey,
  assertNonBlank,
  assertPlainRecord,
  assertSha256,
  assertStringArray,
  assertUuid,
  canonicalDecimal,
  canonicalJson,
  compareInstants,
  immutableWithDigest,
  uniqueBy,
} from "./internals.js";
import type { ScenarioRun, ScenarioRunRequest } from "./runs.js";
import { assertScenarioRunIntegrity } from "./runs.js";

export interface BaselineMetricValue {
  readonly pointEstimate: string;
  readonly uncertainty: {
    readonly kind: "baseline_interval";
    readonly lower: string;
    readonly upper: string;
    readonly source: "pinned_baseline_artifact";
  };
}

export interface ScenarioMetricValue {
  readonly pointEstimate: string;
  readonly uncertainty: {
    readonly kind: "scenario_ensemble_interval";
    readonly lower: string;
    readonly p50: string;
    readonly upper: string;
    readonly ensembleSize: number;
    readonly notForecastProbability: true;
  };
}

export interface ScenarioMetricResult {
  readonly metricKey: string;
  readonly geographyKey: string;
  readonly sectorKey: string;
  readonly unit: string;
  readonly baseline: BaselineMetricValue;
  readonly scenario: ScenarioMetricValue;
  readonly deltaFromBaseline: string;
}

export interface SensitivityResult {
  readonly sensitivityKey: string;
  readonly parameterKey: string;
  readonly metricKey: string;
  readonly geographyKey: string;
  readonly sectorKey: string;
  readonly lowInput: string;
  readonly highInput: string;
  readonly lowOutcome: string;
  readonly highOutcome: string;
  readonly uncertainty: {
    readonly kind: "endpoint_range_not_probability";
    readonly interactionsUnquantified: true;
    readonly modelUncertainty: "not_quantified";
  };
}

export interface SpilloverResult {
  readonly spilloverKey: string;
  readonly sourceGeographyKey: string;
  readonly sourceSectorKey: string;
  readonly targetGeographyKey: string;
  readonly targetSectorKey: string;
  readonly metricKey: string;
  readonly unit: string;
  readonly direction: "positive" | "negative" | "mixed";
  readonly effectLower: string;
  readonly effectUpper: string;
  readonly uncertainty: {
    readonly kind: "structural_spillover_range_not_probability";
    readonly modelUncertainty: "not_quantified";
    readonly notCausalEstimate: true;
  };
}

export interface ScenarioResultArtifactInput {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly resultId: string;
  readonly runId: string;
  readonly runRequestSha256: string;
  readonly replayIdentitySha256: string;
  readonly scenarioId: string;
  readonly scenarioDefinitionSha256: string;
  readonly baselineIdentitySha256: string;
  readonly workerOutputArtifactSha256: string;
  readonly generatedAt: string;
  readonly ensembleMembers: number;
  readonly dataClass: "scenario_result_only";
  readonly canonicalObservedDatasetEligible: false;
  readonly notObservedFact: true;
  readonly metrics: readonly ScenarioMetricResult[];
  readonly sensitivities: readonly SensitivityResult[];
  readonly spillovers: readonly SpilloverResult[];
  readonly limitations: readonly string[];
  readonly usageBoundary: {
    readonly researchOnly: true;
    readonly scenarioNotForecast: true;
    readonly notCausalEstimate: true;
    readonly notPolicyAdvice: true;
    readonly noPolicyOptimalityClaim: true;
  };
}

export interface ScenarioResultArtifact extends ScenarioResultArtifactInput {
  readonly manifestSha256: string;
}

function metricCoordinates(metric: {
  readonly metricKey: string;
  readonly geographyKey: string;
  readonly sectorKey: string;
}): string {
  return `${metric.metricKey}|${metric.geographyKey}|${metric.sectorKey}`;
}

function assertInterval(
  lowerText: string,
  centerText: string,
  upperText: string,
  field: string,
): void {
  const lower = assertDecimal(lowerText, `${field}.lower`);
  const center = assertDecimal(centerText, `${field}.center`);
  const upper = assertDecimal(upperText, `${field}.upper`);
  if (lower > center || center > upper) throw new TypeError(`${field} interval is not ordered`);
}

function validateMetric(metric: ScenarioMetricResult, request: ScenarioRunRequest): void {
  assertPlainRecord(metric, "result.metric");
  assertExactKeys(
    metric,
    ["metricKey", "geographyKey", "sectorKey", "unit", "baseline", "scenario", "deltaFromBaseline"],
    "result.metric",
  );
  assertKey(metric.metricKey, "result.metricKey");
  assertKey(metric.geographyKey, "result.geographyKey");
  assertKey(metric.sectorKey, "result.sectorKey");
  assertNonBlank(metric.unit, "result.unit", 100);
  if (!request.outputMetricKeys.includes(metric.metricKey)) {
    throw new TypeError("result contains an unrequested metric");
  }
  assertPlainRecord(metric.baseline, "result.baseline");
  assertExactKeys(metric.baseline, ["pointEstimate", "uncertainty"], "result.baseline");
  assertPlainRecord(metric.baseline.uncertainty, "result.baseline.uncertainty");
  assertExactKeys(
    metric.baseline.uncertainty,
    ["kind", "lower", "upper", "source"],
    "result.baseline.uncertainty",
  );
  assertInterval(
    metric.baseline.uncertainty.lower,
    metric.baseline.pointEstimate,
    metric.baseline.uncertainty.upper,
    "result.baseline",
  );
  if (
    metric.baseline.uncertainty.kind !== "baseline_interval" ||
    metric.baseline.uncertainty.source !== "pinned_baseline_artifact"
  ) {
    throw new TypeError("baseline metric uncertainty must retain its distinct provenance");
  }
  assertPlainRecord(metric.scenario, "result.scenario");
  assertExactKeys(metric.scenario, ["pointEstimate", "uncertainty"], "result.scenario");
  assertPlainRecord(metric.scenario.uncertainty, "result.scenario.uncertainty");
  assertExactKeys(
    metric.scenario.uncertainty,
    ["kind", "lower", "p50", "upper", "ensembleSize", "notForecastProbability"],
    "result.scenario.uncertainty",
  );
  assertInterval(
    metric.scenario.uncertainty.lower,
    metric.scenario.uncertainty.p50,
    metric.scenario.uncertainty.upper,
    "result.scenario",
  );
  const scenarioPoint = assertDecimal(
    metric.scenario.pointEstimate,
    "result.scenario.pointEstimate",
  );
  if (
    metric.scenario.uncertainty.kind !== "scenario_ensemble_interval" ||
    metric.scenario.uncertainty.ensembleSize !== request.ensembleSize ||
    metric.scenario.uncertainty.notForecastProbability !== true
  ) {
    throw new TypeError("scenario ensemble uncertainty contract does not match the run");
  }
  const baselinePoint = Number(metric.baseline.pointEstimate);
  const expectedDelta = canonicalDecimal(scenarioPoint - baselinePoint);
  if (metric.deltaFromBaseline !== expectedDelta) {
    throw new TypeError("deltaFromBaseline does not equal scenario minus pinned baseline");
  }
}

function validateSensitivities(
  items: readonly SensitivityResult[],
  metrics: ReadonlySet<string>,
): void {
  if (!Array.isArray(items) || items.length > 256) {
    throw new TypeError("sensitivities must contain at most 256 items");
  }
  uniqueBy(items, (item) => item.sensitivityKey, "sensitivities");
  for (const item of items) {
    assertPlainRecord(item as unknown, "sensitivity");
    assertExactKeys(
      item,
      [
        "sensitivityKey",
        "parameterKey",
        "metricKey",
        "geographyKey",
        "sectorKey",
        "lowInput",
        "highInput",
        "lowOutcome",
        "highOutcome",
        "uncertainty",
      ],
      "sensitivity",
    );
    assertKey(item.sensitivityKey, "sensitivity.sensitivityKey");
    assertKey(item.parameterKey, "sensitivity.parameterKey");
    assertKey(item.metricKey, "sensitivity.metricKey");
    assertKey(item.geographyKey, "sensitivity.geographyKey");
    assertKey(item.sectorKey, "sensitivity.sectorKey");
    if (!metrics.has(metricCoordinates(item))) {
      throw new TypeError("sensitivity refers to an absent result metric");
    }
    const lowInput = assertDecimal(item.lowInput, "sensitivity.lowInput");
    const highInput = assertDecimal(item.highInput, "sensitivity.highInput");
    if (lowInput >= highInput) throw new TypeError("sensitivity input endpoints must increase");
    assertDecimal(item.lowOutcome, "sensitivity.lowOutcome");
    assertDecimal(item.highOutcome, "sensitivity.highOutcome");
    assertPlainRecord(item.uncertainty, "sensitivity.uncertainty");
    assertExactKeys(
      item.uncertainty,
      ["kind", "interactionsUnquantified", "modelUncertainty"],
      "sensitivity.uncertainty",
    );
    if (
      item.uncertainty.kind !== "endpoint_range_not_probability" ||
      item.uncertainty.interactionsUnquantified !== true ||
      item.uncertainty.modelUncertainty !== "not_quantified"
    ) {
      throw new TypeError("sensitivity uncertainty must not masquerade as probability");
    }
  }
}

function validateSpillovers(items: readonly SpilloverResult[], metrics: ReadonlySet<string>): void {
  if (!Array.isArray(items) || items.length > 256) {
    throw new TypeError("spillovers must contain at most 256 items");
  }
  uniqueBy(items, (item) => item.spilloverKey, "spillovers");
  for (const item of items) {
    assertPlainRecord(item as unknown, "spillover");
    assertExactKeys(
      item,
      [
        "spilloverKey",
        "sourceGeographyKey",
        "sourceSectorKey",
        "targetGeographyKey",
        "targetSectorKey",
        "metricKey",
        "unit",
        "direction",
        "effectLower",
        "effectUpper",
        "uncertainty",
      ],
      "spillover",
    );
    assertKey(item.spilloverKey, "spillover.spilloverKey");
    assertKey(item.sourceGeographyKey, "spillover.sourceGeographyKey");
    assertKey(item.sourceSectorKey, "spillover.sourceSectorKey");
    assertKey(item.targetGeographyKey, "spillover.targetGeographyKey");
    assertKey(item.targetSectorKey, "spillover.targetSectorKey");
    assertKey(item.metricKey, "spillover.metricKey");
    assertNonBlank(item.unit, "spillover.unit", 100);
    if (!metrics.has(`${item.metricKey}|${item.targetGeographyKey}|${item.targetSectorKey}`)) {
      throw new TypeError("spillover target must have a corresponding result metric");
    }
    const lower = assertDecimal(item.effectLower, "spillover.effectLower");
    const upper = assertDecimal(item.effectUpper, "spillover.effectUpper");
    if (lower > upper) throw new TypeError("spillover effect range is not ordered");
    if (!(["positive", "negative", "mixed"] as const).includes(item.direction)) {
      throw new TypeError("spillover direction is not registered");
    }
    assertPlainRecord(item.uncertainty, "spillover.uncertainty");
    assertExactKeys(
      item.uncertainty,
      ["kind", "modelUncertainty", "notCausalEstimate"],
      "spillover.uncertainty",
    );
    if (
      item.uncertainty.kind !== "structural_spillover_range_not_probability" ||
      item.uncertainty.modelUncertainty !== "not_quantified" ||
      item.uncertainty.notCausalEstimate !== true
    ) {
      throw new TypeError("spillover uncertainty cannot claim probability or causality");
    }
  }
}

function buildScenarioResult(
  input: ScenarioResultArtifactInput,
  run: ScenarioRun,
  request: ScenarioRunRequest,
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
): Readonly<ScenarioResultArtifact> {
  assertBaselineIntegrity(baseline);
  assertScenarioDefinitionIntegrity(definition, baseline);
  assertScenarioRunIntegrity(run, request);
  assertPlainRecord(input, "scenarioResult");
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "tenantId",
      "resultId",
      "runId",
      "runRequestSha256",
      "replayIdentitySha256",
      "scenarioId",
      "scenarioDefinitionSha256",
      "baselineIdentitySha256",
      "workerOutputArtifactSha256",
      "generatedAt",
      "ensembleMembers",
      "dataClass",
      "canonicalObservedDatasetEligible",
      "notObservedFact",
      "metrics",
      "sensitivities",
      "spillovers",
      "limitations",
      "usageBoundary",
    ],
    "scenarioResult",
  );
  if (input.schemaVersion !== 1) throw new TypeError("result schemaVersion must be 1");
  assertUuid(input.tenantId, "result.tenantId");
  assertUuid(input.resultId, "result.resultId");
  assertUuid(input.runId, "result.runId");
  if (
    run.status !== "succeeded" ||
    input.tenantId !== run.tenantId ||
    input.runId !== run.runId ||
    input.runRequestSha256 !== request.manifestSha256 ||
    input.replayIdentitySha256 !== request.replayIdentitySha256 ||
    input.scenarioId !== definition.scenarioId ||
    input.scenarioDefinitionSha256 !== definition.manifestSha256 ||
    input.baselineIdentitySha256 !== baseline.manifestSha256 ||
    input.workerOutputArtifactSha256 !== run.outputArtifactSha256
  ) {
    throw new TypeError("result must bind exact succeeded run, scenario, and baseline identities");
  }
  assertSha256(input.runRequestSha256, "result.runRequestSha256");
  assertSha256(input.replayIdentitySha256, "result.replayIdentitySha256");
  assertSha256(input.scenarioDefinitionSha256, "result.scenarioDefinitionSha256");
  assertSha256(input.baselineIdentitySha256, "result.baselineIdentitySha256");
  assertSha256(input.workerOutputArtifactSha256, "result.workerOutputArtifactSha256");
  assertIsoInstant(input.generatedAt, "result.generatedAt");
  if (compareInstants(input.generatedAt, run.events.at(-1)?.occurredAt ?? "") < 0) {
    throw new TypeError("result cannot predate succeeded run transition");
  }
  if (input.ensembleMembers !== request.ensembleSize) {
    throw new TypeError("result ensemble member count must equal the request");
  }
  if (
    input.dataClass !== "scenario_result_only" ||
    input.canonicalObservedDatasetEligible !== false ||
    input.notObservedFact !== true
  ) {
    throw new TypeError("scenario results must remain permanently non-observed");
  }
  if (
    !Array.isArray(input.metrics) ||
    input.metrics.length === 0 ||
    input.metrics.length > request.resourceBudget.maxOutputCells
  ) {
    throw new TypeError("result metrics violate the output cell budget");
  }
  uniqueBy(input.metrics, metricCoordinates, "result metrics");
  for (const metric of input.metrics) validateMetric(metric, request);
  const metricSet = new Set(input.metrics.map(metricCoordinates));
  validateSensitivities(input.sensitivities, metricSet);
  validateSpillovers(input.spillovers, metricSet);
  assertStringArray(input.limitations, "result.limitations", 1, 64, 2_000);
  const usage = input.usageBoundary;
  assertPlainRecord(usage, "result.usageBoundary");
  assertExactKeys(
    usage,
    [
      "researchOnly",
      "scenarioNotForecast",
      "notCausalEstimate",
      "notPolicyAdvice",
      "noPolicyOptimalityClaim",
    ],
    "result.usageBoundary",
  );
  if (
    usage.researchOnly !== true ||
    usage.scenarioNotForecast !== true ||
    usage.notCausalEstimate !== true ||
    usage.notPolicyAdvice !== true ||
    usage.noPolicyOptimalityClaim !== true
  ) {
    throw new TypeError("result usage boundary cannot be weakened");
  }
  const result = immutableWithDigest(input);
  if (Buffer.byteLength(canonicalJson(result), "utf8") > request.resourceBudget.maxArtifactBytes) {
    throw new TypeError("result exceeds maxArtifactBytes resource budget");
  }
  return result;
}

export function createScenarioResultArtifact(
  input: ScenarioResultArtifactInput,
  run: ScenarioRun,
  request: ScenarioRunRequest,
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
): Readonly<ScenarioResultArtifact> {
  return buildScenarioResult(input, run, request, definition, baseline);
}

export function assertScenarioResultIntegrity(
  result: ScenarioResultArtifact,
  run: ScenarioRun,
  request: ScenarioRunRequest,
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
): void {
  assertDigestIntegrity(result, "scenarioResult");
  const { manifestSha256: _manifest, ...body } = result;
  buildScenarioResult(body, run, request, definition, baseline);
}

export interface ScenarioComparisonInput {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly comparisonId: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface ComparedMetric {
  readonly metricKey: string;
  readonly geographyKey: string;
  readonly sectorKey: string;
  readonly unit: string;
  readonly pinnedBaselinePointEstimate: string;
  readonly scenarios: readonly {
    readonly scenarioId: string;
    readonly resultSha256: string;
    readonly scenarioPointEstimate: string;
    readonly deltaFromBaseline: string;
  }[];
  readonly pairwiseDifferences: readonly {
    readonly leftScenarioId: string;
    readonly rightScenarioId: string;
    readonly leftMinusRight: string;
  }[];
}

export interface ScenarioComparison extends ScenarioComparisonInput {
  readonly baselineIdentitySha256: string;
  readonly resultSha256s: readonly string[];
  readonly metrics: readonly ComparedMetric[];
  readonly noRankingOrRecommendation: true;
  readonly manifestSha256: string;
}

export function createScenarioComparison(
  input: ScenarioComparisonInput,
  results: readonly ScenarioResultArtifact[],
): Readonly<ScenarioComparison> {
  assertPlainRecord(input as unknown, "scenarioComparison");
  assertExactKeys(
    input as unknown as Record<string, unknown>,
    ["schemaVersion", "tenantId", "comparisonId", "createdBy", "createdAt"],
    "scenarioComparison",
  );
  if (input.schemaVersion !== 1) throw new TypeError("comparison schemaVersion must be 1");
  assertUuid(input.tenantId, "comparison.tenantId");
  assertUuid(input.comparisonId, "comparison.comparisonId");
  assertUuid(input.createdBy, "comparison.createdBy");
  assertIsoInstant(input.createdAt, "comparison.createdAt");
  if (!Array.isArray(results) || results.length < 2 || results.length > 8) {
    throw new TypeError("comparison requires 2..8 scenario results");
  }
  for (const result of results) {
    assertDigestIntegrity(result, "comparison.result");
    if (result.tenantId !== input.tenantId)
      throw new TypeError("comparison crosses tenant boundary");
  }
  uniqueBy(results, (result) => result.scenarioId, "comparison scenarios");
  const baselineSha = results[0]?.baselineIdentitySha256;
  if (!baselineSha || results.some((result) => result.baselineIdentitySha256 !== baselineSha)) {
    throw new TypeError("scenario comparison requires the exact same pinned baseline digest");
  }
  const sortedResults: ScenarioResultArtifact[] = [...results].sort((left, right) =>
    left.scenarioId.localeCompare(right.scenarioId),
  );
  const first = sortedResults[0];
  if (!first) throw new TypeError("comparison result disappeared");
  const metrics: ComparedMetric[] = [...first.metrics]
    .sort((left, right) => metricCoordinates(left).localeCompare(metricCoordinates(right)))
    .map((baseMetric) => {
      const coordinates = metricCoordinates(baseMetric);
      const aligned = sortedResults.map((result) => {
        const metric = result.metrics.find(
          (candidate) => metricCoordinates(candidate) === coordinates,
        );
        if (!metric || metric.unit !== baseMetric.unit) {
          throw new TypeError(
            "comparison results do not have compatible metric coordinates and units",
          );
        }
        if (metric.baseline.pointEstimate !== baseMetric.baseline.pointEstimate) {
          throw new TypeError("comparison results disagree on the pinned baseline metric value");
        }
        return { result, metric };
      });
      for (const result of sortedResults) {
        if (result.metrics.length !== first.metrics.length) {
          throw new TypeError("comparison results must contain the same metric set");
        }
      }
      const scenarios = aligned.map(({ result, metric }) => ({
        scenarioId: result.scenarioId,
        resultSha256: result.manifestSha256,
        scenarioPointEstimate: metric.scenario.pointEstimate,
        deltaFromBaseline: metric.deltaFromBaseline,
      }));
      const pairwiseDifferences: ComparedMetric["pairwiseDifferences"][number][] = [];
      for (let leftIndex = 0; leftIndex < scenarios.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < scenarios.length; rightIndex += 1) {
          const left = scenarios[leftIndex];
          const right = scenarios[rightIndex];
          if (!left || !right) continue;
          pairwiseDifferences.push({
            leftScenarioId: left.scenarioId,
            rightScenarioId: right.scenarioId,
            leftMinusRight: canonicalDecimal(
              Number(left.scenarioPointEstimate) - Number(right.scenarioPointEstimate),
            ),
          });
        }
      }
      return {
        metricKey: baseMetric.metricKey,
        geographyKey: baseMetric.geographyKey,
        sectorKey: baseMetric.sectorKey,
        unit: baseMetric.unit,
        pinnedBaselinePointEstimate: baseMetric.baseline.pointEstimate,
        scenarios,
        pairwiseDifferences,
      };
    });
  return immutableWithDigest({
    ...input,
    baselineIdentitySha256: baselineSha,
    resultSha256s: sortedResults.map((result) => result.manifestSha256),
    metrics,
    noRankingOrRecommendation: true as const,
  });
}

export function assertScenarioComparisonIntegrity(
  comparison: ScenarioComparison,
  results: readonly ScenarioResultArtifact[],
): void {
  assertDigestIntegrity(comparison, "scenarioComparison");
  assertSha256(comparison.baselineIdentitySha256, "comparison.baselineIdentitySha256");
  for (const digest of comparison.resultSha256s) assertSha256(digest, "comparison.resultSha256");
  if (comparison.noRankingOrRecommendation !== true) {
    throw new TypeError("scenario comparison cannot rank or recommend scenarios");
  }
  const {
    manifestSha256: _manifest,
    baselineIdentitySha256: _baseline,
    resultSha256s: _results,
    metrics: _metrics,
    noRankingOrRecommendation: _boundary,
    ...input
  } = comparison;
  const rebuilt = createScenarioComparison(input, results);
  if (rebuilt.manifestSha256 !== comparison.manifestSha256) {
    throw new TypeError("scenario comparison does not match its exact result inputs");
  }
}

export function assertScenarioDerivedArtifactNotObserved(
  artifact: Pick<ScenarioResultArtifact, "dataClass" | "canonicalObservedDatasetEligible">,
): never {
  if (artifact.canonicalObservedDatasetEligible === false) {
    throw new TypeError(
      `${artifact.dataClass} cannot be admitted to an observed canonical dataset`,
    );
  }
  throw new TypeError("artifact is not eligible observed data");
}
