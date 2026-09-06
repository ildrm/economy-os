import {
  assertEconomicObservation,
  type EconomicObservation,
  type ValueType,
} from "./source-policy.js";

export interface AnnualReferenceDefinition {
  readonly code: string;
  readonly topic: string;
  readonly unit: string;
  readonly valueType: ValueType;
  readonly currency: string | null;
  readonly indexBase: string | null;
}

export function wdiObservationMetadata(originalUnit: string, originalStatus: string) {
  if (typeof originalUnit !== "string" || originalStatus !== "")
    throw new TypeError("Unmapped WDI unit/status metadata requires review");
  return {
    schema_version: 1,
    source_id: "world-bank-wdi",
    source_name: "World Bank — World Development Indicators",
    source_grade: "A",
    source_type: "multilateral",
    is_official: true,
    is_preliminary: null,
    revision_status: "unknown",
    original_unit: originalUnit,
    original_status: originalStatus,
  } as const;
}
export interface AnnualReferenceSource {
  readonly code: string;
  readonly indicatorUrl: string;
  readonly retrievedAt: string;
  readonly observationMetadata: ReturnType<typeof wdiObservationMetadata>;
}

/** Expand normalized on-disk metadata + an exact annual tuple into a complete observation.
 * Unknown source revision flags remain unknown even though the dataset is latest-revised.
 * WDI is a macro reference series, not a direct NSO consumer-price collection.
 */
export function annualReferenceObservation(
  definition: AnnualReferenceDefinition,
  source: AnnualReferenceSource,
  country: { readonly code: string; readonly name: string },
  point: readonly [number, string | null],
): EconomicObservation {
  if (
    source.code !== definition.code ||
    !Number.isInteger(point[0]) ||
    point[0] < 1 ||
    point[0] > 9999
  )
    throw new TypeError("Reference observation identity mismatch");
  const metadata = source.observationMetadata;
  const expected = wdiObservationMetadata(metadata.original_unit, metadata.original_status);
  if (
    Object.keys(metadata).length !== Object.keys(expected).length ||
    Object.entries(expected).some(
      ([key, value]) => metadata[key as keyof typeof metadata] !== value,
    )
  )
    throw new TypeError("Unreviewed reference source metadata");
  return assertEconomicObservation({
    country_code: country.code,
    category: definition.topic,
    source_name: metadata.source_name,
    source_grade: metadata.source_grade,
    source_type: metadata.source_type,
    source_id: metadata.source_id,
    source_url: source.indicatorUrl,
    instrument_or_item: definition.code,
    value: point[1],
    value_type: definition.valueType,
    price_type: definition.valueType === "price_index" ? "price_index" : null,
    currency: definition.currency,
    unit: definition.unit,
    geography: country.name,
    observation_date: String(point[0]).padStart(4, "0"),
    retrieval_timestamp: source.retrievedAt,
    frequency: "annual",
    is_official: metadata.is_official,
    is_preliminary: metadata.is_preliminary,
    revision_status: metadata.revision_status,
    original_value: point[1],
    original_unit: metadata.original_unit,
    original_currency: definition.currency,
    missing_reason: point[1] === null ? "source_missing" : null,
    observation_time: null,
    retrieval_time: source.retrievedAt,
    delay_minutes: null,
    timeliness: "historical",
    exchange_name: null,
    index_base: definition.indexBase,
    aggregation: "aggregate",
  });
}
