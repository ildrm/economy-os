import {
  ASSET_CLASSES,
  type AssetClass,
  assertCapitalAllocationManifestIntegrity,
  type CapitalAllocationManifest,
  type CountryIdentity,
  RESEARCH_ONLY_SEMANTICS,
  type ResearchOnlySemantics,
} from "./assessment.js";
import {
  assertCountryCode,
  assertEnum,
  assertExactKeys,
  assertKey,
  assertResearchNarrative,
  assertSha256,
  assertUnitScore,
  assertUuid,
  cloneCanonical,
  deepFreeze,
  digestJson,
} from "./internals.js";

export const MAX_COMPARISON_COUNTRIES = 12;

export const EXACT_COMPARISON_POLICY = Object.freeze({
  modelIdentity: "exact_model_version_and_artifact" as const,
  pointInTime: "same_as_of_and_policy" as const,
  valuation: "required_for_combined_comparison" as const,
});

export interface CountryComparisonPolicy {
  readonly modelIdentity: "exact_model_version_and_artifact";
  readonly pointInTime: "same_as_of_and_policy";
  readonly valuation: "required_for_combined_comparison";
}

export interface CountryComparisonInput {
  readonly schemaVersion: 1;
  readonly comparisonId: string;
  readonly semantics: ResearchOnlySemantics;
  readonly assetClass: AssetClass;
  readonly strategyKey: string;
  readonly referenceCountryId: string;
  readonly requestedCountries: readonly CountryIdentity[];
  readonly compatibilityPolicy: CountryComparisonPolicy;
  readonly manifests: readonly CapitalAllocationManifest[];
}

export type IncomparabilityCode =
  | "missing_assessment"
  | "country_identity_mismatch"
  | "strategy_scope_mismatch"
  | "asset_not_assessed"
  | "reference_assessment_missing"
  | "model_identity_mismatch"
  | "point_in_time_mismatch"
  | "valuation_unavailable";

export interface IncomparabilityReason {
  readonly code: IncomparabilityCode;
  readonly detail: string;
}

export interface ComparableCountryResult {
  readonly country: CountryIdentity;
  readonly status: "comparable";
  readonly sourceManifestSha256: string;
  readonly macroSuitability: string;
  readonly valuationSuitability: string;
  readonly combinedSuitability: string;
}

export interface IncomparableCountryResult {
  readonly country: CountryIdentity;
  readonly status: "incomparable";
  readonly sourceManifestSha256: string | null;
  readonly reasons: readonly IncomparabilityReason[];
}

export type CountryComparisonResult = ComparableCountryResult | IncomparableCountryResult;

export interface CountryComparison {
  readonly schemaVersion: 1;
  readonly comparisonId: string;
  readonly semantics: ResearchOnlySemantics;
  readonly assetClass: AssetClass;
  readonly strategyKey: string;
  readonly referenceCountryId: string;
  readonly requestedCountries: readonly CountryIdentity[];
  readonly compatibilityPolicy: CountryComparisonPolicy;
  readonly sourceManifestDigests: readonly Readonly<{
    countryId: string;
    manifestSha256: string;
  }>[];
  /** Always in requestedCountries order. No rank is computed or stored. */
  readonly results: readonly CountryComparisonResult[];
  readonly manifestSha256: string;
}

function validateSemantics(semantics: ResearchOnlySemantics): void {
  assertExactKeys(
    semantics,
    ["purpose", "decisionUse", "adviceStatus", "disclaimer"],
    "comparison.semantics",
  );
  if (
    semantics.purpose !== RESEARCH_ONLY_SEMANTICS.purpose ||
    semantics.decisionUse !== RESEARCH_ONLY_SEMANTICS.decisionUse ||
    semantics.adviceStatus !== RESEARCH_ONLY_SEMANTICS.adviceStatus ||
    semantics.disclaimer !== RESEARCH_ONLY_SEMANTICS.disclaimer
  ) {
    throw new TypeError("comparison must use exact research-only semantics");
  }
}

function validateCountry(country: CountryIdentity, field: string): void {
  assertExactKeys(country, ["countryId", "countryCode"], field);
  assertUuid(country.countryId, `${field}.countryId`);
  assertCountryCode(country.countryCode, `${field}.countryCode`);
}

function validatePolicy(policy: CountryComparisonPolicy): void {
  assertExactKeys(
    policy,
    ["modelIdentity", "pointInTime", "valuation"],
    "comparison.compatibilityPolicy",
  );
  if (
    policy.modelIdentity !== EXACT_COMPARISON_POLICY.modelIdentity ||
    policy.pointInTime !== EXACT_COMPARISON_POLICY.pointInTime ||
    policy.valuation !== EXACT_COMPARISON_POLICY.valuation
  ) {
    throw new TypeError("comparison compatibility policy must be explicit and exact");
  }
}

function reason(code: IncomparabilityCode, detail: string): IncomparabilityReason {
  return { code, detail };
}

function sameModel(left: CapitalAllocationManifest, right: CapitalAllocationManifest): boolean {
  return (
    left.model.modelId === right.model.modelId &&
    left.model.version === right.model.version &&
    left.model.artifactSha256 === right.model.artifactSha256
  );
}

function samePointInTime(
  left: CapitalAllocationManifest,
  right: CapitalAllocationManifest,
): boolean {
  return (
    left.pointInTime.asOf === right.pointInTime.asOf &&
    left.pointInTime.policy === right.pointInTime.policy
  );
}

export function createCountryComparison(
  input: CountryComparisonInput,
): Readonly<CountryComparison> {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "comparisonId",
      "semantics",
      "assetClass",
      "strategyKey",
      "referenceCountryId",
      "requestedCountries",
      "compatibilityPolicy",
      "manifests",
    ],
    "comparison",
  );
  if (input.schemaVersion !== 1) throw new TypeError("comparison.schemaVersion must be 1");
  assertUuid(input.comparisonId, "comparison.comparisonId");
  validateSemantics(input.semantics);
  assertEnum(input.assetClass, ASSET_CLASSES, "comparison.assetClass");
  assertKey(input.strategyKey, "comparison.strategyKey");
  assertUuid(input.referenceCountryId, "comparison.referenceCountryId");
  validatePolicy(input.compatibilityPolicy);
  if (
    !Array.isArray(input.requestedCountries) ||
    input.requestedCountries.length < 2 ||
    input.requestedCountries.length > MAX_COMPARISON_COUNTRIES
  ) {
    throw new TypeError(
      `comparison.requestedCountries must contain between 2 and ${MAX_COMPARISON_COUNTRIES} countries`,
    );
  }
  const requestedIds = new Set<string>();
  for (const [index, country] of input.requestedCountries.entries()) {
    validateCountry(country, `comparison.requestedCountries[${index}]`);
    if (requestedIds.has(country.countryId)) {
      throw new TypeError("comparison.requestedCountries must be unique");
    }
    requestedIds.add(country.countryId);
  }
  if (!requestedIds.has(input.referenceCountryId)) {
    throw new TypeError("comparison.referenceCountryId must be requested explicitly");
  }
  if (!Array.isArray(input.manifests) || input.manifests.length > input.requestedCountries.length) {
    throw new TypeError("comparison.manifests exceeds the requested country set");
  }
  const manifests = new Map<string, CapitalAllocationManifest>();
  for (const manifest of input.manifests) {
    assertCapitalAllocationManifestIntegrity(manifest);
    if (!requestedIds.has(manifest.country.countryId)) {
      throw new TypeError("comparison contains a manifest for an unrequested country");
    }
    if (manifests.has(manifest.country.countryId)) {
      throw new TypeError("comparison contains duplicate country manifests");
    }
    manifests.set(manifest.country.countryId, manifest);
  }
  const reference = manifests.get(input.referenceCountryId);
  const results: CountryComparisonResult[] = input.requestedCountries.map((country) => {
    const manifest = manifests.get(country.countryId);
    const reasons: IncomparabilityReason[] = [];
    if (!manifest) {
      reasons.push(reason("missing_assessment", "No governed assessment manifest was supplied."));
    } else {
      if (manifest.country.countryCode !== country.countryCode) {
        reasons.push(
          reason(
            "country_identity_mismatch",
            "Country code does not match the requested identity.",
          ),
        );
      }
      if (manifest.strategyKey !== input.strategyKey) {
        reasons.push(
          reason(
            "strategy_scope_mismatch",
            "Assessment strategy does not match the comparison strategy.",
          ),
        );
      }
      const asset = manifest.assets.find((candidate) => candidate.assetClass === input.assetClass);
      if (!asset) {
        reasons.push(
          reason("asset_not_assessed", "Requested asset is absent from this assessment."),
        );
      }
      if (!reference) {
        reasons.push(
          reason(
            "reference_assessment_missing",
            "The explicit reference-country assessment is absent.",
          ),
        );
      } else {
        if (!sameModel(manifest, reference)) {
          reasons.push(
            reason(
              "model_identity_mismatch",
              "Candidate model identity, version, or artifact differs.",
            ),
          );
        }
        if (!samePointInTime(manifest, reference)) {
          reasons.push(
            reason(
              "point_in_time_mismatch",
              "Point-in-time asOf or policy differs from the reference.",
            ),
          );
        }
      }
      if (asset?.valuationSuitability.status === "unavailable") {
        reasons.push(
          reason(
            "valuation_unavailable",
            "Valuation is unavailable; no combined comparison is permitted.",
          ),
        );
      }
      if (
        reasons.length === 0 &&
        asset?.valuationSuitability.status === "available" &&
        asset.combinedSuitability.status === "available"
      ) {
        return {
          country: cloneCanonical(country),
          status: "comparable",
          sourceManifestSha256: manifest.manifestSha256,
          macroSuitability: asset.macroSuitability.score,
          valuationSuitability: asset.valuationSuitability.score,
          combinedSuitability: asset.combinedSuitability.score,
        };
      }
    }
    return {
      country: cloneCanonical(country),
      status: "incomparable",
      sourceManifestSha256: manifest?.manifestSha256 ?? null,
      reasons,
    };
  });
  const body = cloneCanonical({
    schemaVersion: 1 as const,
    comparisonId: input.comparisonId,
    semantics: input.semantics,
    assetClass: input.assetClass,
    strategyKey: input.strategyKey,
    referenceCountryId: input.referenceCountryId,
    requestedCountries: input.requestedCountries,
    compatibilityPolicy: input.compatibilityPolicy,
    sourceManifestDigests: input.requestedCountries.flatMap((country) => {
      const manifest = manifests.get(country.countryId);
      return manifest
        ? [{ countryId: country.countryId, manifestSha256: manifest.manifestSha256 }]
        : [];
    }),
    results,
  });
  const output = { ...body, manifestSha256: digestJson(body) };
  assertCountryComparisonIntegrity(output);
  return deepFreeze(output);
}

export function assertCountryComparisonIntegrity(comparison: CountryComparison): void {
  assertExactKeys(
    comparison,
    [
      "schemaVersion",
      "comparisonId",
      "semantics",
      "assetClass",
      "strategyKey",
      "referenceCountryId",
      "requestedCountries",
      "compatibilityPolicy",
      "sourceManifestDigests",
      "results",
      "manifestSha256",
    ],
    "comparison",
  );
  const { manifestSha256, ...body } = comparison;
  assertSha256(manifestSha256, "comparison.manifestSha256");
  if (comparison.schemaVersion !== 1) throw new TypeError("comparison.schemaVersion must be 1");
  assertUuid(comparison.comparisonId, "comparison.comparisonId");
  validateSemantics(comparison.semantics);
  assertEnum(comparison.assetClass, ASSET_CLASSES, "comparison.assetClass");
  assertKey(comparison.strategyKey, "comparison.strategyKey");
  assertUuid(comparison.referenceCountryId, "comparison.referenceCountryId");
  validatePolicy(comparison.compatibilityPolicy);
  if (
    !Array.isArray(comparison.requestedCountries) ||
    comparison.requestedCountries.length < 2 ||
    comparison.requestedCountries.length > MAX_COMPARISON_COUNTRIES ||
    comparison.results.length !== comparison.requestedCountries.length
  ) {
    throw new TypeError("comparison result count must match the bounded request");
  }
  const requestedIds = new Set<string>();
  comparison.requestedCountries.forEach((country, index) => {
    validateCountry(country, `comparison.requestedCountries[${index}]`);
    if (requestedIds.has(country.countryId))
      throw new TypeError("requested countries must be unique");
    requestedIds.add(country.countryId);
    const result = comparison.results[index];
    if (
      !result ||
      result.country.countryId !== country.countryId ||
      result.country.countryCode !== country.countryCode
    ) {
      throw new TypeError("comparison results must preserve exact requested-country order");
    }
  });
  if (!requestedIds.has(comparison.referenceCountryId)) {
    throw new TypeError("comparison reference must be in the request");
  }
  const sourceCountries = new Set<string>();
  for (const [index, source] of comparison.sourceManifestDigests.entries()) {
    assertExactKeys(
      source,
      ["countryId", "manifestSha256"],
      `comparison.sourceManifestDigests[${index}]`,
    );
    assertUuid(source.countryId, `comparison.sourceManifestDigests[${index}].countryId`);
    assertSha256(
      source.manifestSha256,
      `comparison.sourceManifestDigests[${index}].manifestSha256`,
    );
    if (!requestedIds.has(source.countryId) || sourceCountries.has(source.countryId)) {
      throw new TypeError("comparison source manifest references must be unique and requested");
    }
    sourceCountries.add(source.countryId);
  }
  for (const [index, result] of comparison.results.entries()) {
    const field = `comparison.results[${index}]`;
    validateCountry(result.country, `${field}.country`);
    if (result.status === "comparable") {
      assertExactKeys(
        result,
        [
          "country",
          "status",
          "sourceManifestSha256",
          "macroSuitability",
          "valuationSuitability",
          "combinedSuitability",
        ],
        field,
      );
      assertSha256(result.sourceManifestSha256, `${field}.sourceManifestSha256`);
      assertUnitScore(result.macroSuitability, `${field}.macroSuitability`);
      assertUnitScore(result.valuationSuitability, `${field}.valuationSuitability`);
      assertUnitScore(result.combinedSuitability, `${field}.combinedSuitability`);
    } else {
      assertExactKeys(result, ["country", "status", "sourceManifestSha256", "reasons"], field);
      if (result.status !== "incomparable") throw new TypeError(`${field}.status is unsupported`);
      if (result.sourceManifestSha256 !== null) {
        assertSha256(result.sourceManifestSha256, `${field}.sourceManifestSha256`);
      }
      if (!Array.isArray(result.reasons) || result.reasons.length === 0) {
        throw new TypeError(`${field}.reasons must explain incomparability`);
      }
      for (const [reasonIndex, item] of result.reasons.entries()) {
        assertExactKeys(item, ["code", "detail"], `${field}.reasons[${reasonIndex}]`);
        assertEnum(
          item.code,
          [
            "missing_assessment",
            "country_identity_mismatch",
            "strategy_scope_mismatch",
            "asset_not_assessed",
            "reference_assessment_missing",
            "model_identity_mismatch",
            "point_in_time_mismatch",
            "valuation_unavailable",
          ],
          `${field}.reasons[${reasonIndex}].code`,
        );
        assertResearchNarrative(item.detail, `${field}.reasons[${reasonIndex}].detail`);
      }
    }
  }
  if (digestJson(body) !== manifestSha256) {
    throw new TypeError("country-comparison manifest digest does not match its content");
  }
}
