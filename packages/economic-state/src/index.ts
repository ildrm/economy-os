import { assertIsoInstant } from "@economyos/contracts";
import { canonicalJson, digestJson } from "@economyos/data-admission";

export * from "./research-baselines.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DECIMAL = /^(?<sign>-?)(?<integer>0|[1-9]\d*)(?:\.(?<fraction>\d{1,18}))?$/;
const KEY = /^[a-z][a-z0-9_.-]{2,127}$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export const ECONOMIC_STATE_DIMENSIONS = [
  "macroeconomic",
  "human_economic",
  "financial_system",
  "market",
  "regime",
] as const;
export type EconomicStateDimension = (typeof ECONOMIC_STATE_DIMENSIONS)[number];

export const STATE_MISSING_REASONS = [
  "source_missing",
  "not_collected",
  "not_applicable",
  "suppressed",
  "delayed",
  "parse_failure",
  "license_withheld",
] as const;
export type StateMissingReason = (typeof STATE_MISSING_REASONS)[number];

export const ECONOMIC_STATE_DIMENSION_MISSING_REASONS = [
  ...STATE_MISSING_REASONS,
  "not_modeled",
  "model_unavailable",
  "pipeline_failure",
] as const;
export type EconomicStateDimensionMissingReason =
  (typeof ECONOMIC_STATE_DIMENSION_MISSING_REASONS)[number];

export const ECONOMIC_STATE_FREQUENCIES = [
  "event",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "annual",
  "irregular",
] as const;
export type EconomicStateFrequency = (typeof ECONOMIC_STATE_FREQUENCIES)[number];

export const ECONOMIC_STATE_SEASONAL_ADJUSTMENTS = [
  "adjusted",
  "unadjusted",
  "not_applicable",
  "unknown",
] as const;
export type EconomicStateSeasonalAdjustment = (typeof ECONOMIC_STATE_SEASONAL_ADJUSTMENTS)[number];

export const ECONOMIC_STATE_ARTIFACT_LIFECYCLE_STATUSES = [
  "research",
  "validated",
  "approved",
  "restricted",
  "retired",
] as const;
export type EconomicStateArtifactLifecycleStatus =
  (typeof ECONOMIC_STATE_ARTIFACT_LIFECYCLE_STATUSES)[number];

export interface CompositeStateModelArtifactIdentity {
  readonly id: string;
  readonly sha256: string;
  readonly algorithmKey: string;
  readonly algorithmVersion: string;
  readonly configurationSha256: string;
  readonly normalizationSha256: string;
  readonly assumptionsSha256: string;
  readonly approvalSha256: string;
  readonly lifecycleStatus: EconomicStateArtifactLifecycleStatus;
}

export interface CompositeComponentParserIdentity {
  readonly name: string;
  readonly version: string;
  readonly codeSha256: string;
  readonly configurationSha256: string;
}

export interface CompositeComponentDefinition {
  readonly key: string;
  readonly conceptId: string;
  readonly seriesId: string;
  readonly unitCode: string;
  readonly frequency: EconomicStateFrequency;
  readonly seasonalAdjustment: EconomicStateSeasonalAdjustment;
  readonly parser: Readonly<CompositeComponentParserIdentity>;
  readonly featureContractSha256: string;
  readonly weight: string;
  readonly polarity: "positive" | "negative";
  readonly lowerBound: string;
  readonly upperBound: string;
}

export interface CompositeStateModel {
  readonly schemaVersion: 2;
  readonly id: string;
  readonly key: string;
  readonly version: string;
  readonly dimension: EconomicStateDimension;
  readonly minimumCoverage: string;
  readonly artifact: Readonly<CompositeStateModelArtifactIdentity>;
  readonly components: readonly CompositeComponentDefinition[];
}

export interface CompositeComponentInput {
  readonly componentKey: string;
  readonly value: string | null;
  readonly missingReason: StateMissingReason | null;
  readonly observationId: string | null;
  readonly sourceId: string | null;
  readonly sourceDatasetId: string | null;
  readonly licenseReviewId: string | null;
  readonly sourceAdmissionDecisionId: string | null;
  readonly quality: string | null;
  readonly qualityEvidenceSha256: string | null;
  readonly legalEvidenceSha256: string | null;
}

export interface CompositeStateContext {
  readonly geographyId: string;
  readonly knownAt: string;
  readonly policy: "true_vintage" | "reconstructed" | "latest_revised";
  readonly systemAt?: string;
  readonly snapshotSha256: string;
}

export interface CompositeComponentResult {
  readonly componentKey: string;
  readonly observationId: string | null;
  readonly sourceId: string | null;
  readonly sourceDatasetId: string | null;
  readonly licenseReviewId: string | null;
  readonly sourceAdmissionDecisionId: string | null;
  readonly rawValue: string | null;
  readonly normalizedValue: string | null;
  readonly contribution: string | null;
  readonly missingReason: StateMissingReason | null;
  readonly quality: string | null;
  readonly qualityEvidenceSha256: string | null;
  readonly legalEvidenceSha256: string | null;
}

export interface CompositeStateResult {
  readonly schemaVersion: 2;
  readonly modelId: string;
  readonly modelKey: string;
  readonly modelVersion: string;
  readonly modelArtifactId: string;
  readonly modelArtifactSha256: string;
  readonly dimension: EconomicStateDimension;
  readonly geographyId: string;
  readonly knownAt: string;
  readonly policy: CompositeStateContext["policy"];
  readonly systemAt?: string;
  readonly snapshotSha256: string;
  readonly status: "complete" | "partial" | "insufficient_data";
  readonly score: string | null;
  readonly missingReason: "insufficient_component_coverage" | null;
  readonly completeness: string;
  readonly sourceCoverage: string;
  readonly confidence: string;
  readonly distinctSourceCount: number;
  readonly renormalized: boolean;
  readonly components: readonly CompositeComponentResult[];
  readonly manifestSha256: string;
}

/**
 * A reported slot requires both `model` and `result`; an absent slot requires
 * an explicit `missingReason`. Keeping all fields explicit makes missing
 * dimensions survive JSON and database boundaries without `undefined`.
 */
export interface EconomicStateDimensionInput {
  readonly dimension: EconomicStateDimension;
  readonly model: CompositeStateModel | null;
  readonly result: CompositeStateResult | null;
  readonly missingReason: EconomicStateDimensionMissingReason | null;
}

export interface EconomicStateDiagnostics {
  readonly dimensionCount: 5;
  readonly reportedDimensionCount: number;
  readonly scoredDimensionCount: number;
  readonly insufficientDimensionCount: number;
  readonly missingDimensionCount: number;
  /** Reported dimension results divided by the five required dimensions. */
  readonly dimensionCoverage: string;
  /** Dimension results with a non-null score divided by five. */
  readonly scoredDimensionCoverage: string;
  /** Sum of reported dimension completeness divided by five. */
  readonly evidenceCoverage: string;
  /** Sum of reported dimension confidence divided by five. */
  readonly confidenceCoverage: string;
  /** Confidence divided by completeness; null when there is no evidence. */
  readonly evidenceQuality: string | null;
  readonly reportedComponentCount: number;
  readonly observedComponentCount: number;
  readonly distinctSourceCount: number;
  /** Distinct source IDs divided by component slots in reported dimensions. */
  readonly distinctSourceCoverage: string | null;
}

export interface EconomicState {
  readonly schemaVersion: 1;
  readonly context: Readonly<CompositeStateContext>;
  readonly contextSha256: string;
  /** Always ordered according to ECONOMIC_STATE_DIMENSIONS. */
  readonly dimensions: readonly Readonly<EconomicStateDimensionInput>[];
  readonly diagnostics: Readonly<EconomicStateDiagnostics>;
  readonly manifestSha256: string;
}

export type CompositeSensitivityScenarioKind =
  | "component_omission"
  | "weight_decrease"
  | "weight_increase";

export interface CompositeSensitivityScenario {
  readonly kind: CompositeSensitivityScenarioKind;
  readonly componentKey: string;
  /** Digest of the explicit diagnostic perturbation, never a governed model artifact identity. */
  readonly perturbationSha256: string;
  readonly status: CompositeStateResult["status"];
  readonly score: string | null;
  readonly scoreDelta: string | null;
  readonly completeness: string;
  readonly confidence: string;
  readonly renormalized: boolean;
  readonly missingReason: CompositeStateResult["missingReason"];
  readonly manifestSha256: string;
}

export interface CompositeSensitivityStudy {
  readonly schemaVersion: 1;
  readonly methodologyScope: "research_baseline";
  readonly modelId: string;
  readonly modelArtifactId: string;
  readonly baselineManifestSha256: string;
  readonly baselineStatus: CompositeStateResult["status"];
  readonly baselineScore: string | null;
  readonly baselineCompleteness: string;
  readonly weightPerturbation: string;
  readonly baselineMissingComponentKeys: readonly string[];
  readonly scenarios: readonly CompositeSensitivityScenario[];
  readonly scoreRange: Readonly<{ minimum: string; maximum: string; spread: string }> | null;
  readonly coverageThresholdCrossingComponentKeys: readonly string[];
  readonly manifestSha256: string;
}

export interface CompositeSensitivityOptions {
  /** Relative one-at-a-time weight change. Must be greater than zero and at most 0.5. */
  readonly weightPerturbation?: string;
  /** Evidence-free reason used by leave-one-component-out coverage tests. */
  readonly omissionReason?: StateMissingReason;
}

interface Fraction {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

const ZERO: Fraction = { numerator: 0n, denominator: 1n };
const ONE: Fraction = { numerator: 1n, denominator: 1n };

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

function fraction(numerator: bigint, denominator = 1n): Fraction {
  if (denominator === 0n) throw new TypeError("Decimal division by zero");
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = gcd(numerator, denominator);
  return {
    numerator: (numerator / divisor) * sign,
    denominator: (denominator / divisor) * sign,
  };
}

function parseDecimal(value: string, field: string): Fraction {
  if (typeof value !== "string" || value.length < 1 || value.length > 128) {
    throw new TypeError(`${field} must be a bounded canonical decimal`);
  }
  const match = DECIMAL.exec(value);
  if (!match?.groups)
    throw new TypeError(`${field} must be a canonical decimal with at most 18 places`);
  const digits = `${match.groups.integer}${match.groups.fraction ?? ""}`;
  const coefficient = BigInt(digits) * (match.groups.sign === "-" ? -1n : 1n);
  return fraction(coefficient, 10n ** BigInt(match.groups.fraction?.length ?? 0));
}

function add(left: Fraction, right: Fraction): Fraction {
  return fraction(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function subtract(left: Fraction, right: Fraction): Fraction {
  return fraction(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiply(left: Fraction, right: Fraction): Fraction {
  return fraction(left.numerator * right.numerator, left.denominator * right.denominator);
}

function divide(left: Fraction, right: Fraction): Fraction {
  return fraction(left.numerator * right.denominator, left.denominator * right.numerator);
}

function compare(left: Fraction, right: Fraction): number {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function decimalString(value: Fraction, places = 6): string {
  const scale = 10n ** BigInt(places);
  const negative = value.numerator < 0n;
  const absolute = negative ? -value.numerator : value.numerator;
  const scaledNumerator = absolute * scale;
  let rounded = scaledNumerator / value.denominator;
  const remainder = scaledNumerator % value.denominator;
  if (remainder * 2n >= value.denominator) rounded += 1n;
  const integer = rounded / scale;
  const fractional = (rounded % scale).toString().padStart(places, "0").replace(/0+$/, "");
  const sign = negative && rounded !== 0n ? "-" : "";
  return `${sign}${integer}${fractional ? `.${fractional}` : ""}`;
}

function assertUuid(value: string, field: string): void {
  if (!UUID.test(value)) throw new TypeError(`${field} must be a lowercase UUID`);
}

function assertSha256(value: string, field: string): void {
  if (!SHA256.test(value)) throw new TypeError(`${field} must be a lowercase SHA-256 digest`);
}

function assertBoundedIdentityText(value: string, field: string): void {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 200 ||
    value !== value.trim()
  ) {
    throw new TypeError(`${field} must be bounded, non-empty, and canonical`);
  }
}

function assertUnitInterval(value: Fraction, field: string): void {
  if (compare(value, ZERO) < 0 || compare(value, ONE) > 0) {
    throw new TypeError(`${field} must be between zero and one`);
  }
}

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertAllowedKeys(value: object, allowedKeys: readonly string[], field: string): void {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${field} must be a plain object`);
  }
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw new TypeError(
      `${field} contains unsupported schema fields: ${unexpected.sort().join(", ")}`,
    );
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function immutableCanonicalCopy<T>(value: T): T {
  return deepFreeze(JSON.parse(canonicalJson(value)) as T);
}

function validateContext(context: CompositeStateContext): void {
  if (typeof context !== "object" || context === null || Array.isArray(context)) {
    throw new TypeError("Economic state context must be an object");
  }
  assertAllowedKeys(
    context,
    ["geographyId", "knownAt", "policy", "systemAt", "snapshotSha256"],
    "Economic state context",
  );
  assertUuid(context.geographyId, "geographyId");
  assertIsoInstant(context.knownAt, "knownAt");
  if (
    context.policy !== "true_vintage" &&
    context.policy !== "reconstructed" &&
    context.policy !== "latest_revised"
  ) {
    throw new TypeError("point-in-time policy is invalid");
  }
  if (!SHA256.test(context.snapshotSha256)) {
    throw new TypeError("snapshotSha256 must be a lowercase SHA-256 digest");
  }
  if (context.policy === "reconstructed") {
    if (context.systemAt === undefined)
      throw new TypeError("reconstructed policy requires systemAt");
    assertIsoInstant(context.systemAt, "systemAt");
  } else if (context.policy === "latest_revised" && context.systemAt !== undefined) {
    throw new TypeError("latest_revised policy cannot declare systemAt");
  } else if (context.systemAt !== undefined) {
    assertIsoInstant(context.systemAt, "systemAt");
  }
}

function normalizedContext(context: CompositeStateContext): Readonly<CompositeStateContext> {
  validateContext(context);
  return Object.freeze({
    geographyId: context.geographyId,
    knownAt: context.knownAt,
    policy: context.policy,
    ...(context.systemAt === undefined ? {} : { systemAt: context.systemAt }),
    snapshotSha256: context.snapshotSha256,
  });
}

function validatedArtifact(
  artifact: CompositeStateModelArtifactIdentity,
): Readonly<CompositeStateModelArtifactIdentity> {
  if (typeof artifact !== "object" || artifact === null || Array.isArray(artifact)) {
    throw new TypeError("model.artifact must be an object");
  }
  assertAllowedKeys(
    artifact,
    [
      "id",
      "sha256",
      "algorithmKey",
      "algorithmVersion",
      "configurationSha256",
      "normalizationSha256",
      "assumptionsSha256",
      "approvalSha256",
      "lifecycleStatus",
    ],
    "model.artifact",
  );
  assertUuid(artifact.id, "model.artifact.id");
  assertSha256(artifact.sha256, "model.artifact.sha256");
  if (!KEY.test(artifact.algorithmKey)) {
    throw new TypeError("model.artifact.algorithmKey is invalid");
  }
  if (
    typeof artifact.algorithmVersion !== "string" ||
    artifact.algorithmVersion.length > 64 ||
    !VERSION.test(artifact.algorithmVersion)
  ) {
    throw new TypeError("model.artifact.algorithmVersion must be a bounded semantic version");
  }
  assertSha256(artifact.configurationSha256, "model.artifact.configurationSha256");
  assertSha256(artifact.normalizationSha256, "model.artifact.normalizationSha256");
  assertSha256(artifact.assumptionsSha256, "model.artifact.assumptionsSha256");
  assertSha256(artifact.approvalSha256, "model.artifact.approvalSha256");
  if (
    !(ECONOMIC_STATE_ARTIFACT_LIFECYCLE_STATUSES as readonly string[]).includes(
      artifact.lifecycleStatus,
    )
  ) {
    throw new TypeError("model.artifact.lifecycleStatus is invalid");
  }
  return Object.freeze({
    id: artifact.id,
    sha256: artifact.sha256,
    algorithmKey: artifact.algorithmKey,
    algorithmVersion: artifact.algorithmVersion,
    configurationSha256: artifact.configurationSha256,
    normalizationSha256: artifact.normalizationSha256,
    assumptionsSha256: artifact.assumptionsSha256,
    approvalSha256: artifact.approvalSha256,
    lifecycleStatus: artifact.lifecycleStatus,
  });
}

function validatedParser(
  parser: CompositeComponentParserIdentity,
  componentKey: string,
): Readonly<CompositeComponentParserIdentity> {
  if (typeof parser !== "object" || parser === null || Array.isArray(parser)) {
    throw new TypeError(`component.${componentKey}.parser must be an object`);
  }
  assertAllowedKeys(
    parser,
    ["name", "version", "codeSha256", "configurationSha256"],
    `component.${componentKey}.parser`,
  );
  assertBoundedIdentityText(parser.name, `component.${componentKey}.parser.name`);
  assertBoundedIdentityText(parser.version, `component.${componentKey}.parser.version`);
  assertSha256(parser.codeSha256, `component.${componentKey}.parser.codeSha256`);
  assertSha256(parser.configurationSha256, `component.${componentKey}.parser.configurationSha256`);
  return Object.freeze({
    name: parser.name,
    version: parser.version,
    codeSha256: parser.codeSha256,
    configurationSha256: parser.configurationSha256,
  });
}

function featureContractManifest(
  component: Pick<
    CompositeComponentDefinition,
    "seriesId" | "conceptId" | "unitCode" | "frequency" | "seasonalAdjustment" | "parser"
  >,
): object {
  return {
    schemaVersion: 1,
    seriesId: component.seriesId,
    conceptId: component.conceptId,
    unitCode: component.unitCode,
    frequency: component.frequency,
    seasonalAdjustment: component.seasonalAdjustment,
    parser: {
      name: component.parser.name,
      version: component.parser.version,
      codeSha256: component.parser.codeSha256,
      configurationSha256: component.parser.configurationSha256,
    },
  };
}

function validatedModel(model: CompositeStateModel): {
  readonly artifact: Readonly<CompositeStateModelArtifactIdentity>;
  readonly components: readonly (CompositeComponentDefinition & {
    readonly parsedWeight: Fraction;
    readonly parsedLower: Fraction;
    readonly parsedUpper: Fraction;
  })[];
  readonly minimumCoverage: Fraction;
  readonly totalWeight: Fraction;
} {
  if (typeof model !== "object" || model === null || Array.isArray(model)) {
    throw new TypeError("model must be an object");
  }
  assertAllowedKeys(
    model,
    [
      "schemaVersion",
      "id",
      "key",
      "version",
      "dimension",
      "minimumCoverage",
      "artifact",
      "components",
    ],
    "model",
  );
  if (model.schemaVersion !== 2) throw new TypeError("model schemaVersion must be 2");
  assertUuid(model.id, "model.id");
  if (!KEY.test(model.key)) throw new TypeError("model.key is invalid");
  if (
    typeof model.version !== "string" ||
    model.version.length > 64 ||
    !VERSION.test(model.version)
  ) {
    throw new TypeError("model.version must be a bounded semantic version");
  }
  if (!(ECONOMIC_STATE_DIMENSIONS as readonly string[]).includes(model.dimension)) {
    throw new TypeError("model.dimension is invalid");
  }
  const minimumCoverage = parseDecimal(model.minimumCoverage, "model.minimumCoverage");
  assertUnitInterval(minimumCoverage, "model.minimumCoverage");
  const artifact = validatedArtifact(model.artifact);
  if (
    !Array.isArray(model.components) ||
    model.components.length < 1 ||
    model.components.length > 100
  ) {
    throw new TypeError("model.components must contain between 1 and 100 components");
  }
  const keys = new Set<string>();
  const concepts = new Set<string>();
  const series = new Set<string>();
  let totalWeight = ZERO;
  const components = model.components
    .map((component) => {
      if (typeof component !== "object" || component === null || Array.isArray(component)) {
        throw new TypeError("model components must be objects");
      }
      if (!KEY.test(component.key)) {
        throw new TypeError("component keys must be unique canonical keys");
      }
      return component;
    })
    .sort((left, right) => lexicalCompare(left.key, right.key))
    .map((component) => {
      assertAllowedKeys(
        component,
        [
          "key",
          "conceptId",
          "seriesId",
          "unitCode",
          "frequency",
          "seasonalAdjustment",
          "parser",
          "featureContractSha256",
          "weight",
          "polarity",
          "lowerBound",
          "upperBound",
        ],
        "model component",
      );
      if (!KEY.test(component.key) || keys.has(component.key)) {
        throw new TypeError("component keys must be unique canonical keys");
      }
      assertUuid(component.conceptId, `component.${component.key}.conceptId`);
      if (concepts.has(component.conceptId)) {
        throw new TypeError("component concept IDs must be unique");
      }
      assertUuid(component.seriesId, `component.${component.key}.seriesId`);
      if (series.has(component.seriesId)) {
        throw new TypeError("component series IDs must be unique");
      }
      assertBoundedIdentityText(component.unitCode, `component.${component.key}.unitCode`);
      if (!(ECONOMIC_STATE_FREQUENCIES as readonly string[]).includes(component.frequency)) {
        throw new TypeError(`component.${component.key}.frequency is invalid`);
      }
      if (
        !(ECONOMIC_STATE_SEASONAL_ADJUSTMENTS as readonly string[]).includes(
          component.seasonalAdjustment,
        )
      ) {
        throw new TypeError(`component.${component.key}.seasonalAdjustment is invalid`);
      }
      const parser = validatedParser(component.parser, component.key);
      assertSha256(
        component.featureContractSha256,
        `component.${component.key}.featureContractSha256`,
      );
      const expectedFeatureContractSha256 = digestJson(
        featureContractManifest({ ...component, parser }),
      );
      if (component.featureContractSha256 !== expectedFeatureContractSha256) {
        throw new TypeError(
          `component.${component.key}.featureContractSha256 does not bind its exact series and parser contract`,
        );
      }
      keys.add(component.key);
      concepts.add(component.conceptId);
      series.add(component.seriesId);
      const parsedWeight = parseDecimal(component.weight, `component.${component.key}.weight`);
      const parsedLower = parseDecimal(
        component.lowerBound,
        `component.${component.key}.lowerBound`,
      );
      const parsedUpper = parseDecimal(
        component.upperBound,
        `component.${component.key}.upperBound`,
      );
      if (compare(parsedWeight, ZERO) <= 0)
        throw new TypeError("component weights must be positive");
      if (component.polarity !== "positive" && component.polarity !== "negative") {
        throw new TypeError("component polarity is invalid");
      }
      if (compare(parsedUpper, parsedLower) <= 0) {
        throw new TypeError("component upperBound must exceed lowerBound");
      }
      totalWeight = add(totalWeight, parsedWeight);
      return Object.freeze({
        key: component.key,
        conceptId: component.conceptId,
        seriesId: component.seriesId,
        unitCode: component.unitCode,
        frequency: component.frequency,
        seasonalAdjustment: component.seasonalAdjustment,
        parser,
        featureContractSha256: component.featureContractSha256,
        weight: component.weight,
        polarity: component.polarity,
        lowerBound: component.lowerBound,
        upperBound: component.upperBound,
        parsedWeight,
        parsedLower,
        parsedUpper,
      });
    });
  return Object.freeze({
    artifact,
    components: Object.freeze(components),
    minimumCoverage,
    totalWeight,
  });
}

function normalizedModel(model: CompositeStateModel): Readonly<CompositeStateModel> {
  const validated = validatedModel(model);
  return Object.freeze({
    schemaVersion: 2 as const,
    id: model.id,
    key: model.key,
    version: model.version,
    dimension: model.dimension,
    minimumCoverage: model.minimumCoverage,
    artifact: validated.artifact,
    components: Object.freeze(
      validated.components.map((component) =>
        Object.freeze({
          key: component.key,
          conceptId: component.conceptId,
          seriesId: component.seriesId,
          unitCode: component.unitCode,
          frequency: component.frequency,
          seasonalAdjustment: component.seasonalAdjustment,
          parser: component.parser,
          featureContractSha256: component.featureContractSha256,
          weight: component.weight,
          polarity: component.polarity,
          lowerBound: component.lowerBound,
          upperBound: component.upperBound,
        }),
      ),
    ),
  });
}

function stableManifest(value: unknown): string {
  return digestJson(value);
}

export function computeCompositeState(
  model: CompositeStateModel,
  context: CompositeStateContext,
  inputs: readonly CompositeComponentInput[],
): CompositeStateResult {
  validateContext(context);
  const validated = validatedModel(model);
  if (!Array.isArray(inputs) || inputs.length !== validated.components.length) {
    throw new TypeError("Every model component requires one explicit input or missingness record");
  }
  const inputByKey = new Map<string, CompositeComponentInput>();
  for (const input of inputs) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new TypeError("Component inputs must be objects");
    }
    assertAllowedKeys(
      input,
      [
        "componentKey",
        "value",
        "missingReason",
        "observationId",
        "sourceId",
        "sourceDatasetId",
        "licenseReviewId",
        "sourceAdmissionDecisionId",
        "quality",
        "qualityEvidenceSha256",
        "legalEvidenceSha256",
      ],
      "component input",
    );
    if (inputByKey.has(input.componentKey)) throw new TypeError("Component inputs must be unique");
    inputByKey.set(input.componentKey, input);
  }

  let availableWeight = ZERO;
  let weightedScore = ZERO;
  let weightedConfidence = ZERO;
  const sources = new Set<string>();
  const results: CompositeComponentResult[] = [];

  for (const component of validated.components) {
    const input = inputByKey.get(component.key);
    if (!input) throw new TypeError(`Missing explicit input for ${component.key}`);
    const hasValue = input.value !== null;
    if (hasValue === (input.missingReason !== null)) {
      throw new TypeError(
        `Exactly one of value and missingReason is required for ${component.key}`,
      );
    }
    if (!hasValue) {
      if (!(STATE_MISSING_REASONS as readonly string[]).includes(input.missingReason ?? "")) {
        throw new TypeError(`Missing reason is invalid for ${component.key}`);
      }
      if (
        input.observationId !== null ||
        input.sourceId !== null ||
        input.sourceDatasetId !== null ||
        input.licenseReviewId !== null ||
        input.sourceAdmissionDecisionId !== null ||
        input.quality !== null ||
        input.qualityEvidenceSha256 !== null ||
        input.legalEvidenceSha256 !== null
      ) {
        throw new TypeError(`Missing component ${component.key} cannot claim evidence bindings`);
      }
      results.push(
        Object.freeze({
          componentKey: component.key,
          observationId: null,
          sourceId: null,
          sourceDatasetId: null,
          licenseReviewId: null,
          sourceAdmissionDecisionId: null,
          rawValue: null,
          normalizedValue: null,
          contribution: null,
          missingReason: input.missingReason,
          quality: null,
          qualityEvidenceSha256: null,
          legalEvidenceSha256: null,
        }),
      );
      continue;
    }

    if (
      input.observationId === null ||
      input.sourceId === null ||
      input.sourceDatasetId === null ||
      input.licenseReviewId === null ||
      input.sourceAdmissionDecisionId === null ||
      input.quality === null ||
      input.qualityEvidenceSha256 === null ||
      input.legalEvidenceSha256 === null
    ) {
      throw new TypeError(
        `Observed component ${component.key} requires provenance, legal admission, quality, and evidence digests`,
      );
    }
    assertUuid(input.observationId, `input.${component.key}.observationId`);
    assertUuid(input.sourceId, `input.${component.key}.sourceId`);
    assertUuid(input.sourceDatasetId, `input.${component.key}.sourceDatasetId`);
    assertUuid(input.licenseReviewId, `input.${component.key}.licenseReviewId`);
    assertUuid(input.sourceAdmissionDecisionId, `input.${component.key}.sourceAdmissionDecisionId`);
    assertSha256(input.qualityEvidenceSha256, `input.${component.key}.qualityEvidenceSha256`);
    assertSha256(input.legalEvidenceSha256, `input.${component.key}.legalEvidenceSha256`);
    const value = parseDecimal(input.value, `input.${component.key}.value`);
    const quality = parseDecimal(input.quality, `input.${component.key}.quality`);
    assertUnitInterval(quality, `input.${component.key}.quality`);
    if (compare(value, component.parsedLower) < 0 || compare(value, component.parsedUpper) > 0) {
      throw new RangeError(`Input ${component.key} is outside its governed normalization bounds`);
    }
    let normalized = divide(
      subtract(value, component.parsedLower),
      subtract(component.parsedUpper, component.parsedLower),
    );
    if (component.polarity === "negative") normalized = subtract(ONE, normalized);
    const contribution = multiply(component.parsedWeight, normalized);
    availableWeight = add(availableWeight, component.parsedWeight);
    weightedScore = add(weightedScore, contribution);
    weightedConfidence = add(weightedConfidence, multiply(component.parsedWeight, quality));
    sources.add(input.sourceId);
    results.push(
      Object.freeze({
        componentKey: component.key,
        observationId: input.observationId,
        sourceId: input.sourceId,
        sourceDatasetId: input.sourceDatasetId,
        licenseReviewId: input.licenseReviewId,
        sourceAdmissionDecisionId: input.sourceAdmissionDecisionId,
        rawValue: input.value,
        normalizedValue: decimalString(normalized),
        contribution: decimalString(contribution),
        missingReason: null,
        quality: decimalString(quality),
        qualityEvidenceSha256: input.qualityEvidenceSha256,
        legalEvidenceSha256: input.legalEvidenceSha256,
      }),
    );
  }

  const completeness = divide(availableWeight, validated.totalWeight);
  const confidence = divide(weightedConfidence, validated.totalWeight);
  const sourceCoverage = fraction(BigInt(sources.size), BigInt(validated.components.length));
  const enoughCoverage =
    compare(availableWeight, ZERO) > 0 && compare(completeness, validated.minimumCoverage) >= 0;
  const complete = compare(completeness, ONE) === 0;
  const score =
    enoughCoverage && compare(availableWeight, ZERO) > 0
      ? decimalString(multiply(divide(weightedScore, availableWeight), fraction(100n)))
      : null;
  const body = Object.freeze({
    schemaVersion: 2 as const,
    modelId: model.id,
    modelKey: model.key,
    modelVersion: model.version,
    modelArtifactId: validated.artifact.id,
    modelArtifactSha256: validated.artifact.sha256,
    dimension: model.dimension,
    geographyId: context.geographyId,
    knownAt: context.knownAt,
    policy: context.policy,
    ...(context.systemAt === undefined ? {} : { systemAt: context.systemAt }),
    snapshotSha256: context.snapshotSha256,
    status: enoughCoverage
      ? complete
        ? ("complete" as const)
        : ("partial" as const)
      : ("insufficient_data" as const),
    score,
    missingReason: enoughCoverage ? null : ("insufficient_component_coverage" as const),
    completeness: decimalString(completeness),
    sourceCoverage: decimalString(sourceCoverage),
    confidence: decimalString(confidence),
    distinctSourceCount: sources.size,
    renormalized: enoughCoverage && !complete,
    components: Object.freeze(results),
  });
  return Object.freeze({ ...body, manifestSha256: stableManifest(body) });
}

const COMPOSITE_RESULT_FIELDS = [
  "schemaVersion",
  "modelId",
  "modelKey",
  "modelVersion",
  "modelArtifactId",
  "modelArtifactSha256",
  "dimension",
  "geographyId",
  "knownAt",
  "policy",
  "systemAt",
  "snapshotSha256",
  "status",
  "score",
  "missingReason",
  "completeness",
  "sourceCoverage",
  "confidence",
  "distinctSourceCount",
  "renormalized",
  "components",
  "manifestSha256",
] as const;

const COMPOSITE_COMPONENT_RESULT_FIELDS = [
  "componentKey",
  "observationId",
  "sourceId",
  "sourceDatasetId",
  "licenseReviewId",
  "sourceAdmissionDecisionId",
  "rawValue",
  "normalizedValue",
  "contribution",
  "missingReason",
  "quality",
  "qualityEvidenceSha256",
  "legalEvidenceSha256",
] as const;

function validateCompositeResultForVector(
  candidate: CompositeStateResult,
  expectedDimension: EconomicStateDimension,
  expectedContext: Readonly<CompositeStateContext>,
): CompositeStateResult {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new TypeError(`Dimension ${expectedDimension} result must be an object`);
  }
  assertAllowedKeys(candidate, COMPOSITE_RESULT_FIELDS, `Dimension ${expectedDimension} result`);
  if (candidate.schemaVersion !== 2) {
    throw new TypeError(`Dimension ${expectedDimension} result schemaVersion must be 2`);
  }
  assertUuid(candidate.modelId, `dimension.${expectedDimension}.modelId`);
  if (!KEY.test(candidate.modelKey)) {
    throw new TypeError(`Dimension ${expectedDimension} modelKey is invalid`);
  }
  if (
    typeof candidate.modelVersion !== "string" ||
    candidate.modelVersion.length > 64 ||
    !VERSION.test(candidate.modelVersion)
  ) {
    throw new TypeError(`Dimension ${expectedDimension} modelVersion is invalid`);
  }
  assertUuid(candidate.modelArtifactId, `dimension.${expectedDimension}.modelArtifactId`);
  assertSha256(candidate.modelArtifactSha256, `dimension.${expectedDimension}.modelArtifactSha256`);
  if (candidate.dimension !== expectedDimension) {
    throw new TypeError(`Dimension result does not match its ${expectedDimension} slot`);
  }

  const candidateContext: CompositeStateContext = {
    geographyId: candidate.geographyId,
    knownAt: candidate.knownAt,
    policy: candidate.policy,
    ...(candidate.systemAt === undefined ? {} : { systemAt: candidate.systemAt }),
    snapshotSha256: candidate.snapshotSha256,
  };
  validateContext(candidateContext);
  if (
    candidateContext.geographyId !== expectedContext.geographyId ||
    candidateContext.knownAt !== expectedContext.knownAt ||
    candidateContext.policy !== expectedContext.policy ||
    candidateContext.systemAt !== expectedContext.systemAt ||
    candidateContext.snapshotSha256 !== expectedContext.snapshotSha256
  ) {
    throw new TypeError(
      `Dimension ${expectedDimension} does not share the EconomicState geography/PIT/snapshot context`,
    );
  }

  if (
    !Array.isArray(candidate.components) ||
    candidate.components.length < 1 ||
    candidate.components.length > 100
  ) {
    throw new TypeError(`Dimension ${expectedDimension} must retain its component manifest`);
  }
  const componentKeys = new Set<string>();
  const sources = new Set<string>();
  let observedComponentCount = 0;
  let previousKey: string | null = null;
  for (const component of candidate.components) {
    if (typeof component !== "object" || component === null || Array.isArray(component)) {
      throw new TypeError(`Dimension ${expectedDimension} has an invalid component result`);
    }
    assertAllowedKeys(
      component,
      COMPOSITE_COMPONENT_RESULT_FIELDS,
      `Dimension ${expectedDimension} component`,
    );
    if (!KEY.test(component.componentKey) || componentKeys.has(component.componentKey)) {
      throw new TypeError(
        `Dimension ${expectedDimension} component keys must be canonical and unique`,
      );
    }
    if (previousKey !== null && lexicalCompare(previousKey, component.componentKey) >= 0) {
      throw new TypeError(`Dimension ${expectedDimension} components must use canonical key order`);
    }
    previousKey = component.componentKey;
    componentKeys.add(component.componentKey);
    const observed = component.rawValue !== null;
    if (observed === (component.missingReason !== null)) {
      throw new TypeError(
        `Dimension ${expectedDimension} component ${component.componentKey} must be observed or explicitly missing`,
      );
    }
    if (!observed) {
      if (
        !(STATE_MISSING_REASONS as readonly string[]).includes(component.missingReason ?? "") ||
        component.observationId !== null ||
        component.sourceId !== null ||
        component.sourceDatasetId !== null ||
        component.licenseReviewId !== null ||
        component.sourceAdmissionDecisionId !== null ||
        component.normalizedValue !== null ||
        component.contribution !== null ||
        component.quality !== null ||
        component.qualityEvidenceSha256 !== null ||
        component.legalEvidenceSha256 !== null
      ) {
        throw new TypeError(
          `Dimension ${expectedDimension} missing component ${component.componentKey} has invalid evidence`,
        );
      }
      continue;
    }
    if (
      component.observationId === null ||
      component.sourceId === null ||
      component.sourceDatasetId === null ||
      component.licenseReviewId === null ||
      component.sourceAdmissionDecisionId === null ||
      component.normalizedValue === null ||
      component.contribution === null ||
      component.quality === null ||
      component.qualityEvidenceSha256 === null ||
      component.legalEvidenceSha256 === null
    ) {
      throw new TypeError(
        `Dimension ${expectedDimension} observed component ${component.componentKey} lacks provenance`,
      );
    }
    assertUuid(
      component.observationId,
      `dimension.${expectedDimension}.${component.componentKey}.observationId`,
    );
    assertUuid(
      component.sourceId,
      `dimension.${expectedDimension}.${component.componentKey}.sourceId`,
    );
    assertUuid(
      component.sourceDatasetId,
      `dimension.${expectedDimension}.${component.componentKey}.sourceDatasetId`,
    );
    assertUuid(
      component.licenseReviewId,
      `dimension.${expectedDimension}.${component.componentKey}.licenseReviewId`,
    );
    assertUuid(
      component.sourceAdmissionDecisionId,
      `dimension.${expectedDimension}.${component.componentKey}.sourceAdmissionDecisionId`,
    );
    assertSha256(
      component.qualityEvidenceSha256,
      `dimension.${expectedDimension}.${component.componentKey}.qualityEvidenceSha256`,
    );
    assertSha256(
      component.legalEvidenceSha256,
      `dimension.${expectedDimension}.${component.componentKey}.legalEvidenceSha256`,
    );
    parseDecimal(
      component.rawValue,
      `dimension.${expectedDimension}.${component.componentKey}.rawValue`,
    );
    const normalized = parseDecimal(
      component.normalizedValue,
      `dimension.${expectedDimension}.${component.componentKey}.normalizedValue`,
    );
    assertUnitInterval(
      normalized,
      `dimension.${expectedDimension}.${component.componentKey}.normalizedValue`,
    );
    const contribution = parseDecimal(
      component.contribution,
      `dimension.${expectedDimension}.${component.componentKey}.contribution`,
    );
    if (compare(contribution, ZERO) < 0) {
      throw new TypeError(
        `dimension.${expectedDimension}.${component.componentKey}.contribution cannot be negative`,
      );
    }
    const quality = parseDecimal(
      component.quality,
      `dimension.${expectedDimension}.${component.componentKey}.quality`,
    );
    assertUnitInterval(quality, `dimension.${expectedDimension}.${component.componentKey}.quality`);
    sources.add(component.sourceId);
    observedComponentCount += 1;
  }

  const completeness = parseDecimal(
    candidate.completeness,
    `dimension.${expectedDimension}.completeness`,
  );
  const confidence = parseDecimal(
    candidate.confidence,
    `dimension.${expectedDimension}.confidence`,
  );
  const sourceCoverage = parseDecimal(
    candidate.sourceCoverage,
    `dimension.${expectedDimension}.sourceCoverage`,
  );
  assertUnitInterval(completeness, `dimension.${expectedDimension}.completeness`);
  assertUnitInterval(confidence, `dimension.${expectedDimension}.confidence`);
  assertUnitInterval(sourceCoverage, `dimension.${expectedDimension}.sourceCoverage`);
  if (compare(confidence, completeness) > 0) {
    throw new TypeError(`Dimension ${expectedDimension} confidence cannot exceed completeness`);
  }
  if (
    (observedComponentCount === 0 && compare(completeness, ZERO) !== 0) ||
    (observedComponentCount > 0 && compare(completeness, ZERO) <= 0) ||
    (observedComponentCount === candidate.components.length && compare(completeness, ONE) !== 0) ||
    (observedComponentCount < candidate.components.length && compare(completeness, ONE) >= 0)
  ) {
    throw new TypeError(`Dimension ${expectedDimension} completeness contradicts its evidence`);
  }
  if (
    !Number.isSafeInteger(candidate.distinctSourceCount) ||
    candidate.distinctSourceCount !== sources.size
  ) {
    throw new TypeError(`Dimension ${expectedDimension} distinct source count is inconsistent`);
  }
  const expectedSourceCoverage = decimalString(
    fraction(BigInt(sources.size), BigInt(candidate.components.length)),
  );
  if (candidate.sourceCoverage !== expectedSourceCoverage) {
    throw new TypeError(`Dimension ${expectedDimension} source coverage is inconsistent`);
  }

  if (candidate.status === "complete") {
    if (
      compare(completeness, ONE) !== 0 ||
      candidate.score === null ||
      candidate.missingReason !== null ||
      candidate.renormalized
    ) {
      throw new TypeError(`Dimension ${expectedDimension} complete status is inconsistent`);
    }
  } else if (candidate.status === "partial") {
    if (
      compare(completeness, ZERO) <= 0 ||
      compare(completeness, ONE) >= 0 ||
      candidate.score === null ||
      candidate.missingReason !== null ||
      !candidate.renormalized
    ) {
      throw new TypeError(`Dimension ${expectedDimension} partial status is inconsistent`);
    }
  } else if (candidate.status === "insufficient_data") {
    if (
      compare(completeness, ONE) >= 0 ||
      candidate.score !== null ||
      candidate.missingReason !== "insufficient_component_coverage" ||
      candidate.renormalized
    ) {
      throw new TypeError(`Dimension ${expectedDimension} insufficient status is inconsistent`);
    }
  } else {
    throw new TypeError(`Dimension ${expectedDimension} status is invalid`);
  }
  if (candidate.score !== null) {
    const score = parseDecimal(candidate.score, `dimension.${expectedDimension}.score`);
    if (compare(score, ZERO) < 0 || compare(score, fraction(100n)) > 0) {
      throw new TypeError(`Dimension ${expectedDimension} score must be between zero and 100`);
    }
  }

  if (!SHA256.test(candidate.manifestSha256)) {
    throw new TypeError(`Dimension ${expectedDimension} manifest digest is invalid`);
  }
  const { manifestSha256, ...manifestBody } = candidate;
  if (stableManifest(manifestBody) !== manifestSha256) {
    throw new TypeError(
      `Dimension ${expectedDimension} manifest digest does not match its content`,
    );
  }
  return immutableCanonicalCopy(candidate);
}

/**
 * Assemble the five Phase 3 dimension results into a reproducible state vector.
 * This function deliberately publishes no cross-dimension score: dimensions
 * retain their own model semantics, score, completeness, and provenance.
 */
export function assembleEconomicState(
  context: CompositeStateContext,
  inputs: readonly EconomicStateDimensionInput[],
): EconomicState {
  const stateContext = normalizedContext(context);
  if (!Array.isArray(inputs) || inputs.length !== ECONOMIC_STATE_DIMENSIONS.length) {
    throw new TypeError(
      "EconomicState requires exactly one record for each of its five dimensions",
    );
  }

  const inputByDimension = new Map<EconomicStateDimension, EconomicStateDimensionInput>();
  const modelIds = new Set<string>();
  for (const input of inputs) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new TypeError("EconomicState dimension records must be objects");
    }
    assertAllowedKeys(
      input,
      ["dimension", "model", "result", "missingReason"],
      "EconomicState dimension",
    );
    if (
      !Object.hasOwn(input, "model") ||
      !Object.hasOwn(input, "result") ||
      !Object.hasOwn(input, "missingReason")
    ) {
      throw new TypeError(
        "EconomicState dimensions require explicit model, result, and missingReason fields",
      );
    }
    if (!(ECONOMIC_STATE_DIMENSIONS as readonly string[]).includes(input.dimension)) {
      throw new TypeError("EconomicState dimension is invalid");
    }
    if (inputByDimension.has(input.dimension)) {
      throw new TypeError(`EconomicState dimension ${input.dimension} is duplicated`);
    }
    const hasResult = input.result !== null;
    const hasModel = input.model !== null;
    const hasMissingReason = input.missingReason !== null;
    if (hasResult === hasMissingReason) {
      throw new TypeError(
        `Dimension ${input.dimension} requires exactly one result or explicit missing reason`,
      );
    }
    if (!hasResult) {
      if (hasModel) {
        throw new TypeError(`Missing dimension ${input.dimension} cannot declare a model`);
      }
      if (
        !(ECONOMIC_STATE_DIMENSION_MISSING_REASONS as readonly string[]).includes(
          input.missingReason ?? "",
        )
      ) {
        throw new TypeError(`Dimension ${input.dimension} missing reason is invalid`);
      }
      inputByDimension.set(
        input.dimension,
        Object.freeze({
          dimension: input.dimension,
          model: null,
          result: null,
          missingReason: input.missingReason,
        }),
      );
      continue;
    }
    if (!hasModel) {
      throw new TypeError(`Reported dimension ${input.dimension} requires its model definition`);
    }
    const model = normalizedModel(input.model as CompositeStateModel);
    if (model.dimension !== input.dimension) {
      throw new TypeError(`Dimension model does not match its ${input.dimension} slot`);
    }
    const result = validateCompositeResultForVector(
      input.result as CompositeStateResult,
      input.dimension,
      stateContext,
    );
    if (
      result.modelId !== model.id ||
      result.modelKey !== model.key ||
      result.modelVersion !== model.version ||
      result.modelArtifactId !== model.artifact.id ||
      result.modelArtifactSha256 !== model.artifact.sha256
    ) {
      throw new TypeError(
        `Dimension ${input.dimension} result does not bind its exact model and artifact identity`,
      );
    }
    const reproduced = computeCompositeState(
      model,
      stateContext,
      result.components.map((component) => ({
        componentKey: component.componentKey,
        value: component.rawValue,
        missingReason: component.missingReason,
        observationId: component.observationId,
        sourceId: component.sourceId,
        sourceDatasetId: component.sourceDatasetId,
        licenseReviewId: component.licenseReviewId,
        sourceAdmissionDecisionId: component.sourceAdmissionDecisionId,
        quality: component.quality,
        qualityEvidenceSha256: component.qualityEvidenceSha256,
        legalEvidenceSha256: component.legalEvidenceSha256,
      })),
    );
    if (canonicalJson(reproduced) !== canonicalJson(result)) {
      throw new TypeError(
        `Dimension ${input.dimension} result is not reproducible from its bound model and component evidence`,
      );
    }
    if (modelIds.has(model.id)) {
      throw new TypeError("EconomicState dimension model IDs must be unique");
    }
    modelIds.add(model.id);
    inputByDimension.set(
      input.dimension,
      Object.freeze({ dimension: input.dimension, model, result, missingReason: null }),
    );
  }

  const dimensions = Object.freeze(
    ECONOMIC_STATE_DIMENSIONS.map((dimension) => {
      const input = inputByDimension.get(dimension);
      if (!input) throw new TypeError(`EconomicState dimension ${dimension} is missing`);
      return input;
    }),
  );

  let reportedDimensionCount = 0;
  let scoredDimensionCount = 0;
  let insufficientDimensionCount = 0;
  let evidenceCompleteness = ZERO;
  let evidenceConfidence = ZERO;
  let reportedComponentCount = 0;
  let observedComponentCount = 0;
  const sources = new Set<string>();
  for (const dimension of dimensions) {
    const result = dimension.result;
    if (result === null) continue;
    reportedDimensionCount += 1;
    if (result.score !== null) scoredDimensionCount += 1;
    if (result.status === "insufficient_data") insufficientDimensionCount += 1;
    evidenceCompleteness = add(
      evidenceCompleteness,
      parseDecimal(result.completeness, `dimension.${dimension.dimension}.completeness`),
    );
    evidenceConfidence = add(
      evidenceConfidence,
      parseDecimal(result.confidence, `dimension.${dimension.dimension}.confidence`),
    );
    reportedComponentCount += result.components.length;
    for (const component of result.components) {
      if (component.rawValue !== null) observedComponentCount += 1;
      if (component.sourceId !== null) sources.add(component.sourceId);
    }
  }

  const dimensionDenominator = fraction(BigInt(ECONOMIC_STATE_DIMENSIONS.length));
  const diagnostics = Object.freeze({
    dimensionCount: 5 as const,
    reportedDimensionCount,
    scoredDimensionCount,
    insufficientDimensionCount,
    missingDimensionCount: ECONOMIC_STATE_DIMENSIONS.length - reportedDimensionCount,
    dimensionCoverage: decimalString(
      divide(fraction(BigInt(reportedDimensionCount)), dimensionDenominator),
    ),
    scoredDimensionCoverage: decimalString(
      divide(fraction(BigInt(scoredDimensionCount)), dimensionDenominator),
    ),
    evidenceCoverage: decimalString(divide(evidenceCompleteness, dimensionDenominator)),
    confidenceCoverage: decimalString(divide(evidenceConfidence, dimensionDenominator)),
    evidenceQuality:
      compare(evidenceCompleteness, ZERO) === 0
        ? null
        : decimalString(divide(evidenceConfidence, evidenceCompleteness)),
    reportedComponentCount,
    observedComponentCount,
    distinctSourceCount: sources.size,
    distinctSourceCoverage:
      reportedComponentCount === 0
        ? null
        : decimalString(fraction(BigInt(sources.size), BigInt(reportedComponentCount))),
  });
  const contextSha256 = stableManifest(stateContext);
  const body = Object.freeze({
    schemaVersion: 1 as const,
    context: stateContext,
    contextSha256,
    dimensions,
    diagnostics,
  });
  return Object.freeze({ ...body, manifestSha256: stableManifest(body) });
}

function omittedSensitivityInput(
  input: CompositeComponentInput,
  omissionReason: StateMissingReason,
): CompositeComponentInput {
  return Object.freeze({
    componentKey: input.componentKey,
    value: null,
    missingReason: omissionReason,
    observationId: null,
    sourceId: null,
    sourceDatasetId: null,
    licenseReviewId: null,
    sourceAdmissionDecisionId: null,
    quality: null,
    qualityEvidenceSha256: null,
    legalEvidenceSha256: null,
  });
}

function sensitivityScenario(
  kind: CompositeSensitivityScenarioKind,
  componentKey: string,
  perturbation: Readonly<Record<string, unknown>>,
  result: CompositeStateResult,
  baselineScore: string | null,
): CompositeSensitivityScenario {
  const scoreDelta =
    result.score === null || baselineScore === null
      ? null
      : decimalString(
          subtract(
            parseDecimal(result.score, "scenario score"),
            parseDecimal(baselineScore, "baseline score"),
          ),
        );
  const body = Object.freeze({
    kind,
    componentKey,
    perturbationSha256: stableManifest(perturbation),
    status: result.status,
    score: result.score,
    scoreDelta,
    completeness: result.completeness,
    confidence: result.confidence,
    renormalized: result.renormalized,
    missingReason: result.missingReason,
  });
  return Object.freeze({ ...body, manifestSha256: stableManifest(body) });
}

/**
 * Run deterministic one-at-a-time coverage and weight sensitivity diagnostics.
 *
 * Perturbed weights are diagnostic counterfactuals only. They receive their own
 * perturbation digests and are never returned as governed model runs or artifact
 * versions. Omission scenarios erase every evidence binding, proving that a
 * missing input is never converted into a neutral observation.
 */
export function analyzeCompositeSensitivity(
  model: CompositeStateModel,
  context: CompositeStateContext,
  inputs: readonly CompositeComponentInput[],
  options: CompositeSensitivityOptions = {},
): CompositeSensitivityStudy {
  const baseline = computeCompositeState(model, context, inputs);
  const validated = validatedModel(model);
  const perturbation = parseDecimal(options.weightPerturbation ?? "0.1", "weightPerturbation");
  if (compare(perturbation, ZERO) <= 0 || compare(perturbation, fraction(1n, 2n)) > 0) {
    throw new TypeError("weightPerturbation must be greater than zero and at most 0.5");
  }
  const omissionReason = options.omissionReason ?? "not_collected";
  if (!(STATE_MISSING_REASONS as readonly string[]).includes(omissionReason)) {
    throw new TypeError("omissionReason is invalid");
  }

  const inputByKey = new Map(inputs.map((input) => [input.componentKey, input] as const));
  const scenarios: CompositeSensitivityScenario[] = [];
  const thresholdCrossings = new Set<string>();
  const baselineMissingComponentKeys: string[] = [];
  const scores: Fraction[] =
    baseline.score === null ? [] : [parseDecimal(baseline.score, "baseline score")];

  for (const component of validated.components) {
    const input = inputByKey.get(component.key);
    if (!input) throw new TypeError(`Missing explicit input for ${component.key}`);
    if (input.value === null) {
      baselineMissingComponentKeys.push(component.key);
      continue;
    }

    const omittedInputs = inputs.map((candidate) =>
      candidate.componentKey === component.key
        ? omittedSensitivityInput(candidate, omissionReason)
        : candidate,
    );
    const omissionResult = computeCompositeState(model, context, omittedInputs);
    const omission = sensitivityScenario(
      "component_omission",
      component.key,
      {
        schemaVersion: 1,
        kind: "component_omission",
        componentKey: component.key,
        missingReason: omissionReason,
        baselineManifestSha256: baseline.manifestSha256,
      },
      omissionResult,
      baseline.score,
    );
    scenarios.push(omission);
    if (omissionResult.status === "insufficient_data") thresholdCrossings.add(component.key);
    if (omissionResult.score !== null)
      scores.push(parseDecimal(omissionResult.score, "omission score"));

    for (const direction of ["weight_decrease", "weight_increase"] as const) {
      const multiplier =
        direction === "weight_decrease" ? subtract(ONE, perturbation) : add(ONE, perturbation);
      const changedWeight = decimalString(multiply(component.parsedWeight, multiplier), 18);
      const variant: CompositeStateModel = {
        ...model,
        components: model.components.map((candidate) =>
          candidate.key === component.key ? { ...candidate, weight: changedWeight } : candidate,
        ),
      };
      const result = computeCompositeState(variant, context, inputs);
      scenarios.push(
        sensitivityScenario(
          direction,
          component.key,
          {
            schemaVersion: 1,
            kind: direction,
            componentKey: component.key,
            baselineWeight: component.weight,
            changedWeight,
            relativePerturbation: decimalString(perturbation, 18),
            baselineManifestSha256: baseline.manifestSha256,
          },
          result,
          baseline.score,
        ),
      );
      if (result.score !== null) scores.push(parseDecimal(result.score, "weight scenario score"));
    }
  }

  let scoreRange: CompositeSensitivityStudy["scoreRange"] = null;
  if (scores.length > 0) {
    let minimum = scores[0] as Fraction;
    let maximum = scores[0] as Fraction;
    for (const score of scores.slice(1)) {
      if (compare(score, minimum) < 0) minimum = score;
      if (compare(score, maximum) > 0) maximum = score;
    }
    scoreRange = Object.freeze({
      minimum: decimalString(minimum),
      maximum: decimalString(maximum),
      spread: decimalString(subtract(maximum, minimum)),
    });
  }

  const body = Object.freeze({
    schemaVersion: 1 as const,
    methodologyScope: "research_baseline" as const,
    modelId: model.id,
    modelArtifactId: model.artifact.id,
    baselineManifestSha256: baseline.manifestSha256,
    baselineStatus: baseline.status,
    baselineScore: baseline.score,
    baselineCompleteness: baseline.completeness,
    weightPerturbation: decimalString(perturbation, 18),
    baselineMissingComponentKeys: Object.freeze(baselineMissingComponentKeys),
    scenarios: Object.freeze(scenarios),
    scoreRange,
    coverageThresholdCrossingComponentKeys: Object.freeze([...thresholdCrossings]),
  });
  return immutableCanonicalCopy({ ...body, manifestSha256: stableManifest(body) });
}
