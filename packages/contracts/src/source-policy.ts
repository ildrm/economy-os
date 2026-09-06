import { assertIsoInstant } from "./index.js";

export const PRICE_TYPES = [
  "transaction_price",
  "market_trade_price",
  "close_price",
  "asking_price",
  "reference_price",
  "manufacturer_price",
  "catalog_price",
  "price_index",
  "average_price",
  "median_price",
] as const;
export type PriceType = (typeof PRICE_TYPES)[number];
export const VALUE_TYPES = [
  ...PRICE_TYPES,
  "monetary_amount",
  "rate",
  "ratio",
  "count",
  "index",
  "duration",
  "exchange_rate",
  "ppp_amount",
] as const;
export type ValueType = (typeof VALUE_TYPES)[number];
export type SourceGrade = "A" | "B" | "C" | "D";
export type SourceType =
  | "government"
  | "statistics_office"
  | "multilateral"
  | "exchange"
  | "manufacturer"
  | "reference_publisher"
  | "aggregator"
  | "marketplace";
export type DataInterface =
  | "api"
  | "sdmx"
  | "pxweb"
  | "odata"
  | "json"
  | "csv"
  | "xml"
  | "xlsx"
  | "bulk"
  | "websocket"
  | "html";
export interface AccessReview {
  readonly terms_url: string;
  readonly reviewed_at: string;
  readonly expires_at: string;
  readonly automated_access: boolean;
  readonly robots_allowed: boolean;
  readonly commercial_display: boolean;
  readonly non_display: boolean;
  readonly redistribution: boolean;
}
export interface SourceProfile {
  readonly id: string;
  readonly name: string;
  readonly grade: SourceGrade;
  readonly type: SourceType;
  readonly is_official: boolean;
  readonly country_codes: readonly string[];
  /** Exact variables, including basket/base/aggregation. Category alone is insufficient. */
  readonly variables: readonly {
    key: string;
    value_type: ValueType;
    unit: string;
    frequency: string;
  }[];
  readonly interfaces: readonly DataInterface[];
  readonly selected_interface: DataInterface;
  readonly free_access: boolean;
  readonly review: AccessReview | null;
}
export interface SourceRequest {
  readonly country_code: string;
  readonly variable: string;
  readonly value_type: ValueType;
  readonly unit: string;
  readonly frequency: string;
  readonly purpose: "research" | "commercial_display" | "non_display" | "redistribution";
  readonly domain:
    | "general"
    | "domestic_consumer_prices"
    | "global_commodities"
    | "crypto_native"
    | "crypto_reference";
  /** Supplied by a dated country-membership registry, never inferred from continent. */
  readonly eu_member: boolean;
  readonly as_of: string;
}
const grades: Record<SourceGrade, number> = { A: 0, B: 1, C: 2, D: 3 };

function currentReview(source: SourceProfile, asOf: string): AccessReview | null {
  const review = source.review;
  if (!review) return null;
  assertIsoInstant(review.reviewed_at, "reviewed_at");
  assertIsoInstant(review.expires_at, "expires_at");
  if (!/^https:\/\//.test(review.terms_url)) return null;
  return Date.parse(review.reviewed_at) <= Date.parse(asOf) &&
    Date.parse(asOf) < Date.parse(review.expires_at)
    ? review
    : null;
}

export function sourceAccessProblems(
  source: SourceProfile,
  request: Pick<SourceRequest, "purpose" | "as_of">,
): string[] {
  assertIsoInstant(request.as_of, "as_of");
  const problems: string[] = [];
  if (!(source.grade in grades)) problems.push("unresolved_source_grade");
  if (["aggregator", "marketplace"].includes(source.type) && source.is_official)
    problems.push("invalid_official_classification");
  if (
    source.grade === "A" &&
    (!source.is_official ||
      !source.free_access ||
      !source.interfaces.some((item) => item !== "html"))
  )
    problems.push("invalid_grade_a");
  if (!source.interfaces.includes(source.selected_interface))
    problems.push("unsupported_interface");
  if (source.selected_interface === "html" && source.interfaces.some((item) => item !== "html"))
    problems.push("use_machine_readable_interface");
  const review = currentReview(source, request.as_of);
  if (source.type === "marketplace" && (!review?.automated_access || !review.robots_allowed))
    problems.push("marketplace_access_not_approved");
  // Free delayed access is not permission to redistribute or use data commercially.
  if (request.purpose !== "research" && !review?.[request.purpose])
    problems.push("usage_license_not_approved");
  return problems;
}

export function selectSources(profiles: readonly SourceProfile[], request: SourceRequest) {
  assertIsoInstant(request.as_of, "as_of");
  if (new Set(profiles.map((source) => source.id)).size !== profiles.length)
    throw new TypeError("Duplicate source identity");
  const matches = profiles.filter(
    (source) =>
      source.country_codes.includes(request.country_code) &&
      source.variables.some(
        (variable) =>
          variable.key === request.variable &&
          variable.value_type === request.value_type &&
          variable.unit === request.unit &&
          variable.frequency === request.frequency,
      ),
  );
  // Determine authority before checking access. A blocked official feed is a coverage gap,
  // not authorization to silently replace it with a marketplace/third-party feed.
  let eligible = matches.some((source) => source.is_official)
    ? matches.filter((source) => source.is_official)
    : matches;
  if (request.domain === "domestic_consumer_prices")
    eligible = eligible.filter((source) => source.type === "statistics_office");
  if (request.domain === "global_commodities")
    eligible = eligible.filter((source) => source.id === "world-bank-pink-sheet");
  if (request.domain === "crypto_native")
    eligible = eligible.filter((source) => ["coinbase", "binance"].includes(source.id));
  if (request.domain === "crypto_reference")
    eligible = matches.filter(
      (source) => source.id === "coingecko" && request.value_type === "reference_price",
    );
  eligible = [...eligible].sort(
    (left, right) =>
      (grades[left.grade] ?? 99) - (grades[right.grade] ?? 99) || left.id.localeCompare(right.id),
  );
  // Do not downgrade a Grade A variable because its access review has not been completed.
  const preferred = eligible.filter((source) => source.grade === eligible[0]?.grade);
  const selected =
    preferred.find((source) => sourceAccessProblems(source, request).length === 0) ?? null;
  const additionalRequired =
    request.domain === "global_commodities"
      ? ["imf-primary-commodity-prices"]
      : request.domain === "domestic_consumer_prices" && request.eu_member
        ? ["eurostat-hicp"]
        : [];
  return {
    selected,
    status: selected ? "selected" : preferred.length ? "blocked" : "coverage_gap",
    blocked: preferred
      .filter((source) => sourceAccessProblems(source, request).length > 0)
      .map((source) => ({ source_id: source.id, reasons: sourceAccessProblems(source, request) })),
    // Companions use their own variable, units, methodology and access review; never splice series.
    additional_required: additionalRequired,
  } as const;
}

export interface EconomicObservation {
  readonly country_code: string;
  readonly category: string;
  readonly source_name: string;
  readonly source_grade: SourceGrade;
  readonly source_type: SourceType;
  readonly instrument_or_item: string;
  readonly value: string | null;
  readonly value_type: ValueType;
  readonly price_type: PriceType | null;
  readonly currency: string | null;
  readonly unit: string;
  readonly geography: string;
  /** Precision is retained: YYYY, YYYY-MM, or YYYY-MM-DD. Never invent a day for an annual observation. */
  readonly observation_date: string;
  readonly retrieval_timestamp: string;
  readonly frequency:
    | "event"
    | "daily"
    | "weekly"
    | "monthly"
    | "quarterly"
    | "annual"
    | "irregular";
  readonly is_official: boolean;
  readonly is_preliminary: boolean | null;
  readonly revision_status: "unknown" | "preliminary" | "original" | "revised" | "final";
  readonly source_id: string;
  readonly source_url: string;
  readonly original_value: string | null;
  /** Empty is allowed when the raw provider field is empty; the documented unit remains above. */
  readonly original_unit: string;
  readonly original_currency: string | null;
  readonly missing_reason: string | null;
  readonly observation_time: string | null;
  readonly retrieval_time: string;
  /** Provider-declared dissemination delay, not the age of the last trade. */
  readonly delay_minutes: number | null;
  readonly timeliness: "historical" | "delayed" | "real_time" | "unknown";
  readonly exchange_name: string | null;
  readonly index_base: string | null;
  readonly aggregation: "individual" | "aggregate";
  readonly transaction_status?: "completed" | null;
}
const monetary = new Set<ValueType>(PRICE_TYPES.filter((type) => type !== "price_index"));
monetary.add("monetary_amount");
const decimal = /^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
function checkDecimal(value: unknown, field: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > 512 ||
    !decimal.test(value) ||
    !Number.isFinite(Number(value))
  )
    throw new TypeError(`${field} must be a finite decimal string`);
}

export function assertEconomicObservation(observation: EconomicObservation): EconomicObservation {
  for (const field of [
    "country_code",
    "category",
    "source_name",
    "source_id",
    "instrument_or_item",
    "unit",
    "geography",
    "source_url",
  ] as const) {
    if (typeof observation[field] !== "string" || !observation[field].trim())
      throw new TypeError(`Missing ${field}`);
  }
  if (!/^(?:[A-Z]{2,3}|GLOBAL)$/.test(observation.country_code))
    throw new TypeError("Invalid country_code");
  if (!/^https:\/\//.test(observation.source_url)) throw new TypeError("Invalid source_url");
  if (
    !(observation.source_grade in grades) ||
    ![
      "government",
      "statistics_office",
      "multilateral",
      "exchange",
      "manufacturer",
      "reference_publisher",
      "aggregator",
      "marketplace",
    ].includes(observation.source_type)
  )
    throw new TypeError("Invalid source classification");
  if (!VALUE_TYPES.includes(observation.value_type)) throw new TypeError("Invalid value_type");
  const isPrice = (PRICE_TYPES as readonly string[]).includes(observation.value_type);
  if (observation.price_type !== (isPrice ? observation.value_type : null))
    throw new TypeError("price_type must match value_type");
  if (observation.currency !== null && !/^[A-Z]{3}$/.test(observation.currency))
    throw new TypeError("Invalid currency");
  if (monetary.has(observation.value_type) && observation.currency === null)
    throw new TypeError("A monetary value requires currency");
  if (!monetary.has(observation.value_type) && observation.currency !== null)
    throw new TypeError("An index, rate, count or PPP unit is not a monetary price");
  if (["price_index", "index"].includes(observation.value_type) && !observation.index_base)
    throw new TypeError("An index requires its source base");
  if (observation.value !== null) checkDecimal(observation.value, "value");
  if (
    observation.original_value !== observation.value ||
    observation.original_currency !== observation.currency ||
    typeof observation.original_unit !== "string"
  )
    throw new TypeError("Preserve raw values; currency conversion is a separate transformation");
  if (
    (observation.value === null) !==
      (typeof observation.missing_reason === "string" && observation.missing_reason.length > 0) ||
    (observation.value !== null && observation.missing_reason !== null)
  )
    throw new TypeError("Missing values require a reason");
  if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(observation.observation_date))
    throw new TypeError("Invalid observation_date");
  const date = observation.observation_date;
  assertIsoInstant(
    `${date}${date.length === 4 ? "-01-01" : date.length === 7 ? "-01" : ""}T00:00:00Z`,
    "observation_date",
  );
  assertIsoInstant(observation.retrieval_timestamp, "retrieval_timestamp");
  assertIsoInstant(observation.retrieval_time, "retrieval_time");
  if (observation.retrieval_time !== observation.retrieval_timestamp)
    throw new TypeError("Retrieval timestamps disagree");
  if (
    !["event", "daily", "weekly", "monthly", "quarterly", "annual", "irregular"].includes(
      observation.frequency,
    )
  )
    throw new TypeError("Invalid frequency");
  if (
    typeof observation.is_official !== "boolean" ||
    ![true, false, null].includes(observation.is_preliminary)
  )
    throw new TypeError("Unknown preliminary status must be null");
  if (observation.source_grade === "A" && !observation.is_official)
    throw new TypeError("Grade A requires an official source");
  if (["aggregator", "marketplace"].includes(observation.source_type) && observation.is_official)
    throw new TypeError("Aggregators and marketplaces are not official sources");
  if (observation.unit === "index" && !["price_index", "index"].includes(observation.value_type))
    throw new TypeError("Index units require an index value_type");
  if (
    !["unknown", "preliminary", "original", "revised", "final"].includes(
      observation.revision_status,
    )
  )
    throw new TypeError("Invalid revision_status");
  if (
    (observation.revision_status === "preliminary" && observation.is_preliminary !== true) ||
    (observation.revision_status === "final" && observation.is_preliminary !== false)
  )
    throw new TypeError("Contradictory revision status");
  if (!["individual", "aggregate"].includes(observation.aggregation))
    throw new TypeError("Invalid aggregation");
  if (!["historical", "delayed", "real_time", "unknown"].includes(observation.timeliness))
    throw new TypeError("Invalid timeliness");
  if (
    observation.delay_minutes !== null &&
    (!Number.isFinite(observation.delay_minutes) || observation.delay_minutes < 0)
  )
    throw new TypeError("Invalid delay_minutes");
  if (observation.observation_time !== null) {
    assertIsoInstant(observation.observation_time, "observation_time");
    if (Date.parse(observation.observation_time) > Date.parse(observation.retrieval_time))
      throw new TypeError("Observation time is after retrieval");
  }
  if ((observation.delay_minutes ?? 0) > 0 && observation.timeliness === "real_time")
    throw new TypeError("Delayed data cannot be real_time");
  if (
    observation.timeliness === "delayed" &&
    !(observation.delay_minutes !== null && observation.delay_minutes > 0)
  )
    throw new TypeError("Delayed data requires its declared delay");
  if (
    observation.timeliness === "real_time" &&
    (observation.delay_minutes !== 0 || observation.observation_time === null)
  )
    throw new TypeError("Real-time classification requires timing evidence");
  if (
    observation.source_type === "exchange" &&
    (!observation.exchange_name || observation.observation_time === null)
  )
    throw new TypeError("Exchange data requires venue and observation_time");
  if (
    observation.source_type === "marketplace" &&
    ["property", "vehicles"].includes(observation.category) &&
    observation.value_type !== "asking_price"
  )
    throw new TypeError("Marketplace property/vehicles must be asking_price");
  if (
    observation.category === "property" &&
    observation.is_official &&
    observation.transaction_status === "completed" &&
    observation.aggregation === "individual" &&
    observation.value_type !== "transaction_price"
  )
    throw new TypeError("Individual completed property sales must be transaction_price");
  if (observation.source_id === "fipe" && observation.value_type !== "reference_price")
    throw new TypeError("FIPE must be reference_price");
  if (
    observation.source_id === "rdw" &&
    observation.instrument_or_item === "catalogusprijs" &&
    observation.value_type !== "catalog_price"
  )
    throw new TypeError("RDW catalogusprijs must be catalog_price");
  if (observation.category === "cryptocurrency") {
    if (!observation.exchange_name)
      throw new TypeError("Crypto requires exchange_name; identify aggregates explicitly");
    if (observation.source_id === "coingecko") {
      if (
        observation.value_type !== "reference_price" ||
        observation.aggregation !== "aggregate" ||
        observation.is_official ||
        observation.exchange_name !== "multiple_exchanges"
      )
        throw new TypeError("CoinGecko is an aggregated reference");
    } else if (
      !["coinbase", "binance"].includes(observation.source_id) ||
      observation.exchange_name.toLowerCase() !== observation.source_id ||
      observation.source_type !== "exchange"
    )
      throw new TypeError("Use Coinbase/Binance with their own venue identity");
  }
  return Object.freeze({ ...observation });
}

/** Exact base-10 multiplication. No float conversion and no implicit currency rounding. */
function decimalParts(value: string): [bigint, number] {
  checkDecimal(value, "decimal");
  const [mantissa = "", exponent = "0"] = value.toLowerCase().split("e");
  const [whole = "", fraction = ""] = mantissa.split(".");
  const scale = fraction.length - Number(exponent);
  if (Math.abs(scale) > 512) throw new TypeError("Decimal scale exceeds limit");
  return [BigInt(`${whole}${fraction}`), scale];
}
export function convertObservationCurrency(
  observation: EconomicObservation,
  input: {
    fx_rate: string;
    fx_source: string;
    target_currency: string;
    conversion_timestamp: string;
  },
) {
  assertEconomicObservation(observation);
  if (
    !monetary.has(observation.value_type) ||
    observation.value === null ||
    observation.currency === null
  )
    throw new TypeError("Only reported monetary amounts/prices may be converted");
  if (!/^[A-Z]{3}$/.test(input.target_currency) || !/^https:\/\//.test(input.fx_source))
    throw new TypeError("Provide target currency and FX evidence URL");
  assertIsoInstant(input.conversion_timestamp, "conversion_timestamp");
  if (Date.parse(input.conversion_timestamp) < Date.parse(observation.retrieval_timestamp))
    throw new TypeError("Conversion predates retrieval");
  const [amount, amountScale] = decimalParts(observation.value);
  const [rate, rateScale] = decimalParts(input.fx_rate);
  if (rate <= 0n) throw new TypeError("FX rate must be positive");
  const product = amount * rate;
  const scale = amountScale + rateScale;
  let digits = (product < 0n ? -product : product).toString();
  digits = scale > 0 ? digits.padStart(scale + 1, "0") : digits + "0".repeat(-scale);
  const converted = scale > 0 ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  return Object.freeze({
    original_value: observation.value,
    original_currency: observation.currency,
    fx_rate: input.fx_rate,
    fx_source: input.fx_source,
    converted_value: `${product < 0n ? "-" : ""}${converted}`,
    target_currency: input.target_currency,
    conversion_timestamp: input.conversion_timestamp,
    rate_convention: "target currency per 1 original currency",
    rounding: "none",
  });
}
