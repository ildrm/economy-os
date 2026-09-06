import { assertIsoInstant } from "./index.js";
import {
  assertEconomicObservation,
  type EconomicObservation,
  type SourceProfile,
  sourceAccessProblems,
} from "./source-policy.js";

export const EVIDENCE_TYPES = [
  "observation",
  "descriptive_statistic",
  "association",
  "experimental_result",
  "model_estimate",
  "scenario",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export const UNAVAILABLE_REASONS = [
  "no_observations",
  "insufficient_history",
  "incompatible_measurements",
  "incomplete_valuation",
  "permission_required",
  "source_outage",
  "model_not_approved",
  "outside_model_domain",
  "unsupported_question",
] as const;
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];
export interface EvidenceReference {
  readonly datasetId: string;
  readonly snapshotSha256: string;
  readonly sourceUrl: string;
  readonly observationIds: readonly string[];
}
export interface AnalysisContext {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly evidenceType: EvidenceType;
  readonly entity: string;
  readonly period: { readonly start: string; readonly end: string } | null;
  readonly horizonMonths: number | null;
  readonly method: { readonly id: string; readonly version: string };
  readonly evidence: readonly EvidenceReference[];
  readonly explanationKey: string;
  readonly limitationKeys: readonly string[];
  readonly freshness: {
    readonly retrievedAt: string | null;
    readonly expectedNextRelease: string | null;
    readonly state: "current" | "stale" | "unknown";
  };
  readonly coverage: {
    readonly observations: number;
    readonly requiredObservations: number;
    readonly includedEntities: readonly string[];
    readonly excludedEntities: readonly string[];
    readonly scope: "complete" | "subset";
  };
}
export type AnalyticalResult = AnalysisContext &
  (
    | {
        readonly availability: "available";
        readonly value: number;
        readonly unit: string;
        readonly uncertainty: {
          readonly lower: number;
          readonly upper: number;
          readonly level: number;
          readonly kind: "confidence_interval" | "prediction_interval" | "sensitivity_range";
        } | null;
      }
    | {
        readonly availability: "unavailable";
        readonly reason: UnavailableReason;
        readonly value: null;
        readonly unit: string;
        readonly uncertainty: null;
      }
  );

export function assertAnalyticalResult(result: AnalyticalResult): AnalyticalResult {
  if (
    result.schemaVersion !== 1 ||
    !EVIDENCE_TYPES.includes(result.evidenceType) ||
    !result.id ||
    !result.entity ||
    !result.method.id ||
    !result.method.version ||
    !result.explanationKey ||
    !result.unit
  )
    throw new TypeError("Invalid analysis identity");
  if (result.freshness.retrievedAt !== null)
    assertIsoInstant(result.freshness.retrievedAt, "retrievedAt");
  if (result.freshness.expectedNextRelease !== null)
    assertIsoInstant(result.freshness.expectedNextRelease, "expectedNextRelease");
  const coverage = result.coverage;
  if (
    result.horizonMonths !== null &&
    (!Number.isSafeInteger(result.horizonMonths) || result.horizonMonths < 0)
  )
    throw new TypeError("Invalid analytical horizon");
  if (
    result.period !== null &&
    (!result.period.start || !result.period.end || result.period.start > result.period.end)
  )
    throw new TypeError("Invalid analytical period");
  if (
    !["current", "stale", "unknown"].includes(result.freshness.state) ||
    !["complete", "subset"].includes(coverage.scope)
  )
    throw new TypeError("Invalid analytical state");
  if (
    !Number.isSafeInteger(coverage.observations) ||
    coverage.observations < 0 ||
    !Number.isSafeInteger(coverage.requiredObservations) ||
    coverage.requiredObservations < 0 ||
    (coverage.scope === "complete" && coverage.excludedEntities.length > 0)
  )
    throw new TypeError("Invalid analysis coverage");
  for (const reference of result.evidence) {
    if (
      !reference.datasetId ||
      !/^[a-f0-9]{64}$/.test(reference.snapshotSha256) ||
      !/^https:\/\//.test(reference.sourceUrl)
    )
      throw new TypeError("Invalid analysis evidence");
  }
  if (result.availability === "unavailable") {
    if (
      !UNAVAILABLE_REASONS.includes(result.reason) ||
      result.value !== null ||
      result.uncertainty !== null
    )
      throw new TypeError("Unavailable results cannot contain estimates");
  } else if (result.availability === "available") {
    if (!Number.isFinite(result.value) || coverage.observations < coverage.requiredObservations)
      throw new TypeError("Unsupported analytical value");
    if (result.evidenceType !== "scenario" && result.evidence.length === 0)
      throw new TypeError("Measured analysis requires source evidence");
    const interval = result.uncertainty;
    if (
      interval &&
      (!Number.isFinite(interval.lower) ||
        !Number.isFinite(interval.upper) ||
        interval.lower > interval.upper ||
        !Number.isFinite(interval.level) ||
        interval.level <= 0 ||
        interval.level >= 1 ||
        !["confidence_interval", "prediction_interval", "sensitivity_range"].includes(
          interval.kind,
        ))
    )
      throw new TypeError("Invalid uncertainty interval");
  } else throw new TypeError("Invalid availability");
  return result;
}

export interface InstrumentIdentity {
  readonly id: string;
  readonly name: string;
  readonly kind:
    | "equity"
    | "bond"
    | "fund"
    | "cash"
    | "currency_pair"
    | "crypto_pair"
    | "commodity_reference"
    | "property_measure"
    | "vehicle_reference"
    | "index";
  readonly issuerId: string | null;
  readonly venue: string | null;
  readonly listingId: string | null;
  readonly countryCode: string | null;
  readonly sector: string | null;
  readonly baseAsset: { readonly code: string; readonly kind: "fiat" | "crypto" } | null;
  readonly quoteAsset: { readonly code: string; readonly kind: "fiat" | "crypto" } | null;
  readonly investable: boolean;
}
export function assertInstrument(instrument: InstrumentIdentity): InstrumentIdentity {
  if (!instrument.id || !instrument.name) throw new TypeError("Instrument identity is required");
  if (
    ![
      "equity",
      "bond",
      "fund",
      "cash",
      "currency_pair",
      "crypto_pair",
      "commodity_reference",
      "property_measure",
      "vehicle_reference",
      "index",
    ].includes(instrument.kind) ||
    typeof instrument.investable !== "boolean"
  )
    throw new TypeError("Invalid instrument classification");
  for (const asset of [instrument.baseAsset, instrument.quoteAsset]) {
    if (
      asset &&
      (!["fiat", "crypto"].includes(asset.kind) ||
        !/^[A-Z0-9]{2,16}$/.test(asset.code) ||
        (asset.kind === "fiat" && !/^[A-Z]{3}$/.test(asset.code)))
    )
      throw new TypeError("Invalid asset denomination");
    if (asset?.kind === "fiat" && ["USDT", "USDC", "BTC", "ETH"].includes(asset.code))
      throw new TypeError("A crypto asset is not fiat currency");
  }
  if (
    ["crypto_pair", "currency_pair"].includes(instrument.kind) &&
    (!instrument.baseAsset || !instrument.quoteAsset || !instrument.venue)
  )
    throw new TypeError("Venue and both asset denominations are required");
  if (
    ["commodity_reference", "property_measure", "vehicle_reference", "index"].includes(
      instrument.kind,
    ) &&
    instrument.investable
  )
    throw new TypeError("A reference measurement is not an investable instrument");
  return instrument;
}

export interface ObservationRecord {
  readonly schemaVersion: 2;
  readonly id: string;
  readonly datasetId: string;
  readonly semanticsVersion: string;
  readonly observation: EconomicObservation;
  readonly raw: {
    readonly sha256: string;
    readonly locator: string;
    readonly value: string | null;
    readonly unit: string;
    readonly status: string | null;
  };
  readonly population: string;
  readonly seasonalAdjustment: "adjusted" | "unadjusted" | "not_applicable" | "unknown";
  readonly methodologicalBreak: string | null;
  readonly knownAt: string | null;
  readonly vintage: "true_vintage" | "reconstructed_only" | "latest_revised_only";
}
export function assertObservationRecord(record: ObservationRecord): ObservationRecord {
  assertEconomicObservation(record.observation);
  if (
    record.schemaVersion !== 2 ||
    !record.id ||
    !record.datasetId ||
    !record.semanticsVersion ||
    !record.population ||
    !record.raw.locator ||
    !/^[a-f0-9]{64}$/.test(record.raw.sha256)
  )
    throw new TypeError("Incomplete versioned observation");
  if (
    !["adjusted", "unadjusted", "not_applicable", "unknown"].includes(record.seasonalAdjustment) ||
    !["true_vintage", "reconstructed_only", "latest_revised_only"].includes(record.vintage)
  )
    throw new TypeError("Invalid observation methodology");
  if (
    record.raw.value !== record.observation.original_value ||
    record.raw.unit !== record.observation.original_unit
  )
    throw new TypeError("Raw observation was changed");
  if (record.knownAt !== null) {
    assertIsoInstant(record.knownAt, "knownAt");
    if (Date.parse(record.knownAt) > Date.parse(record.observation.retrieval_timestamp))
      throw new TypeError("Known time cannot follow retrieval");
  }
  if (record.vintage === "true_vintage" && record.knownAt === null)
    throw new TypeError("True vintage requires actual availability evidence");
  return record;
}

/** Acquisition and public publication are separate checks, repeated at execution time. */
export function assertSourceUse(
  source: SourceProfile,
  asOf: string,
  purpose: "acquisition" | "commercial_display" | "non_display" | "redistribution",
): void {
  assertIsoInstant(asOf, "asOf");
  const review = source.review;
  if (!review?.automated_access || !/^https:\/\//.test(review.terms_url))
    throw new TypeError("Source automation is not approved");
  assertIsoInstant(review.reviewed_at, "reviewed_at");
  assertIsoInstant(review.expires_at, "expires_at");
  if (
    Date.parse(review.reviewed_at) > Date.parse(asOf) ||
    Date.parse(review.expires_at) <= Date.parse(asOf)
  )
    throw new TypeError("Source review is not current");
  const problems = sourceAccessProblems(source, {
    as_of: asOf,
    purpose: purpose === "acquisition" ? "research" : purpose,
  });
  if (problems.length) throw new TypeError(`Source use blocked: ${problems.join(", ")}`);
}
