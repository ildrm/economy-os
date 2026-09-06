import { describe, expect, it } from "vitest";
import { annualReferenceObservation, wdiObservationMetadata } from "./annual-reference.js";
import {
  assertEconomicObservation,
  convertObservationCurrency,
  type EconomicObservation,
  PRICE_TYPES,
  type SourceProfile,
  type SourceRequest,
  selectSources,
  sourceAccessProblems,
} from "./source-policy.js";

const asOf = "2026-09-06T10:00:00Z";
const request: SourceRequest = {
  country_code: "GB",
  variable: "completed-home-sale",
  value_type: "transaction_price",
  unit: "GBP/home",
  frequency: "event",
  purpose: "research",
  domain: "general",
  eu_member: false,
  as_of: asOf,
};
function profile(overrides: Partial<SourceProfile> = {}): SourceProfile {
  return {
    id: "land-registry",
    name: "HM Land Registry",
    grade: "A",
    type: "government",
    is_official: true,
    country_codes: ["GB"],
    variables: [
      {
        key: request.variable,
        value_type: request.value_type,
        unit: request.unit,
        frequency: request.frequency,
      },
    ],
    interfaces: ["csv"],
    selected_interface: "csv",
    free_access: true,
    review: null,
    ...overrides,
  };
}
function observation(overrides: Partial<EconomicObservation> = {}): EconomicObservation {
  return {
    country_code: "GB",
    category: "property",
    source_name: "HM Land Registry",
    source_grade: "A",
    source_type: "government",
    source_id: "land-registry",
    source_url: "https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads",
    instrument_or_item: "completed-home-sale",
    value: "123456.78",
    value_type: "transaction_price",
    price_type: "transaction_price",
    currency: "GBP",
    unit: "GBP/home",
    geography: "England and Wales",
    observation_date: "2026-08-01",
    retrieval_timestamp: asOf,
    retrieval_time: asOf,
    frequency: "event",
    is_official: true,
    is_preliminary: null,
    revision_status: "unknown",
    original_value: "123456.78",
    original_currency: "GBP",
    original_unit: "GBP/home",
    missing_reason: null,
    observation_time: null,
    delay_minutes: null,
    timeliness: "historical",
    exchange_name: null,
    index_base: null,
    aggregation: "individual",
    transaction_status: "completed",
    ...overrides,
  };
}
const approved: NonNullable<SourceProfile["review"]> = {
  terms_url: "https://example.org/terms",
  reviewed_at: "2026-09-01T00:00:00Z",
  expires_at: "2026-10-01T00:00:00Z",
  automated_access: true,
  robots_allowed: true,
  commercial_display: true,
  non_display: true,
  redistribution: true,
};

describe("source selection policy", () => {
  it("selects Grade A independent of input order", () => {
    const a = profile();
    const b = profile({
      id: "official-manual",
      grade: "B",
      interfaces: ["html"],
      selected_interface: "html",
    });
    expect(selectSources([b, a], request).selected?.id).toBe(a.id);
    expect(selectSources([a, b], request).selected?.id).toBe(a.id);
  });
  it("does not substitute third parties when an official variable is blocked", () => {
    const official = profile();
    const commercial = profile({
      id: "third-party",
      grade: "C",
      is_official: false,
      type: "aggregator",
      review: approved,
    });
    const result = selectSources([commercial, official], {
      ...request,
      purpose: "commercial_display",
    });
    expect(result.selected).toBeNull();
    expect(result.status).toBe("blocked");
    expect(result.blocked[0]?.reasons).toContain("usage_license_not_approved");
  });
  it.each(["variable", "value_type", "unit", "frequency", "country_code"] as const)(
    "requires matching %s instead of matching category",
    (key) => {
      expect(
        selectSources([profile()], { ...request, [key]: "different" } as SourceRequest).status,
      ).toBe("coverage_gap");
    },
  );
  it("does not downgrade a blocked Grade A to B", () => {
    expect(
      selectSources([profile(), profile({ id: "b", grade: "B", review: approved })], {
        ...request,
        purpose: "redistribution",
      }).selected,
    ).toBeNull();
  });
  it("rejects unresolved grades, false A classifications and duplicate identities", () => {
    expect(sourceAccessProblems(profile({ grade: "A/B" as "A" }), request)).toContain(
      "unresolved_source_grade",
    );
    expect(sourceAccessProblems(profile({ is_official: false }), request)).toContain(
      "invalid_grade_a",
    );
    expect(sourceAccessProblems(profile({ free_access: false }), request)).toContain(
      "invalid_grade_a",
    );
    expect(() => selectSources([profile(), profile()], request)).toThrow("Duplicate");
  });
  it("requires the national statistics office plus a distinct EU HICP collection", () => {
    const nso = profile({ id: "national-statistics", type: "statistics_office" });
    const wdi = profile({ id: "wdi", type: "multilateral" });
    const result = selectSources([wdi, nso], {
      ...request,
      domain: "domestic_consumer_prices",
      eu_member: true,
    });
    expect(result.selected?.id).toBe(nso.id);
    expect(result.additional_required).toEqual(["eurostat-hicp"]);
    expect(selectSources([wdi], { ...request, domain: "domestic_consumer_prices" }).status).toBe(
      "coverage_gap",
    );
  });
  it("keeps Pink Sheet primary and IMF as a validation requirement", () => {
    const wb = profile({ id: "world-bank-pink-sheet", type: "multilateral" });
    const imf = profile({ id: "imf-primary-commodity-prices", type: "multilateral" });
    expect(selectSources([imf, wb], { ...request, domain: "global_commodities" })).toMatchObject({
      selected: wb,
      additional_required: [imf.id],
    });
    expect(selectSources([imf], { ...request, domain: "global_commodities" }).selected).toBeNull();
  });
  it("keeps crypto native prices and aggregate references separate", () => {
    const coinbase = profile({ id: "coinbase", type: "exchange" });
    const cg = profile({ id: "coingecko", grade: "C", is_official: false, type: "aggregator" });
    expect(
      selectSources([cg, coinbase], { ...request, domain: "crypto_native" }).selected?.id,
    ).toBe("coinbase");
    expect(selectSources([cg], { ...request, domain: "crypto_native" }).selected).toBeNull();
  });
  it("prefers official machine interfaces to HTML and checks declared interfaces", () => {
    expect(
      sourceAccessProblems(
        profile({ interfaces: ["csv", "html"], selected_interface: "html" }),
        request,
      ),
    ).toContain("use_machine_readable_interface");
    expect(sourceAccessProblems(profile({ selected_interface: "xml" }), request)).toContain(
      "unsupported_interface",
    );
  });
  it("requires current marketplace terms AND access approval", () => {
    const marketplace = profile({ grade: "D", type: "marketplace", is_official: false });
    expect(sourceAccessProblems(marketplace, request)).toContain("marketplace_access_not_approved");
    expect(sourceAccessProblems({ ...marketplace, review: approved }, request)).toEqual([]);
    for (const review of [
      { ...approved, robots_allowed: false },
      { ...approved, automated_access: false },
      { ...approved, expires_at: asOf },
      { ...approved, reviewed_at: "2026-09-07T00:00:00Z" },
    ]) {
      expect(sourceAccessProblems({ ...marketplace, review }, request)).toContain(
        "marketplace_access_not_approved",
      );
    }
  });
  it.each(["euronext", "nasdaq-nordic", "lse"])(
    "requires an applicable usage review for %s",
    (id) => {
      for (const purpose of ["commercial_display", "non_display", "redistribution"] as const) {
        expect(
          sourceAccessProblems(profile({ id, type: "exchange", grade: "B" }), {
            ...request,
            purpose,
          }),
        ).toContain("usage_license_not_approved");
        expect(
          sourceAccessProblems(profile({ id, type: "exchange", grade: "B", review: approved }), {
            ...request,
            purpose,
          }),
        ).toEqual([]);
      }
    },
  );
});

describe("economic observations", () => {
  it("retains exact values, unknown revision flags and independent geography", () => {
    expect(assertEconomicObservation(observation())).toMatchObject({
      value: "123456.78",
      is_preliminary: null,
      revision_status: "unknown",
      geography: "England and Wales",
    });
  });
  it.each([
    "country_code",
    "category",
    "source_name",
    "source_grade",
    "source_type",
    "instrument_or_item",
    "value",
    "value_type",
    "currency",
    "unit",
    "geography",
    "observation_date",
    "retrieval_timestamp",
    "frequency",
    "is_official",
    "is_preliminary",
    "revision_status",
  ] as const)("requires field %s at the runtime boundary", (key) => {
    const invalid = { ...observation() };
    delete (invalid as unknown as Record<string, unknown>)[key];
    expect(() => assertEconomicObservation(invalid)).toThrow();
  });
  it.each(PRICE_TYPES)("distinguishes %s from other prices", (type) => {
    const price = observation({
      category: "goods",
      value_type: type,
      price_type: type,
      currency: type === "price_index" ? null : "GBP",
      original_currency: type === "price_index" ? null : "GBP",
      index_base: type === "price_index" ? "2025 = 100" : null,
    });
    expect(assertEconomicObservation(price).value_type).toBe(type);
    expect(() => assertEconomicObservation({ ...price, price_type: null })).toThrow();
  });
  it("never treats a price index as a monetary amount or converts it to currency", () => {
    const index = observation({
      category: "consumer_prices",
      value: "112.4",
      original_value: "112.4",
      value_type: "price_index",
      price_type: "price_index",
      currency: null,
      original_currency: null,
      unit: "index",
      index_base: "2025 = 100",
    });
    expect(assertEconomicObservation(index).value).toBe("112.4");
    expect(() => assertEconomicObservation({ ...index, currency: "EUR" })).toThrow();
    expect(() => assertEconomicObservation({ ...index, index_base: null })).toThrow();
    expect(() =>
      convertObservationCurrency(index, {
        fx_rate: "1.2",
        fx_source: "https://example.org/fx",
        target_currency: "USD",
        conversion_timestamp: asOf,
      }),
    ).toThrow();
  });
  it("separates marketplace offers, official completed sales, FIPE and RDW", () => {
    expect(() =>
      assertEconomicObservation(
        observation({ source_type: "marketplace", source_grade: "D", is_official: false }),
      ),
    ).toThrow("asking_price");
    expect(
      assertEconomicObservation(
        observation({
          source_type: "marketplace",
          source_grade: "D",
          is_official: false,
          value_type: "asking_price",
          price_type: "asking_price",
        }),
      ).price_type,
    ).toBe("asking_price");
    expect(() =>
      assertEconomicObservation(
        observation({ value_type: "asking_price", price_type: "asking_price" }),
      ),
    ).toThrow("transaction_price");
    expect(() =>
      assertEconomicObservation(observation({ category: "vehicles", source_id: "fipe" })),
    ).toThrow("FIPE");
    expect(
      assertEconomicObservation(
        observation({
          category: "vehicles",
          source_id: "fipe",
          value_type: "reference_price",
          price_type: "reference_price",
        }),
      ).price_type,
    ).toBe("reference_price");
    expect(() =>
      assertEconomicObservation(
        observation({
          category: "vehicles",
          source_id: "rdw",
          instrument_or_item: "catalogusprijs",
          value_type: "reference_price",
          price_type: "reference_price",
        }),
      ),
    ).toThrow("RDW");
    expect(
      assertEconomicObservation(
        observation({
          category: "vehicles",
          source_id: "rdw",
          instrument_or_item: "catalogusprijs",
          value_type: "catalog_price",
          price_type: "catalog_price",
        }),
      ).price_type,
    ).toBe("catalog_price");
  });
  it("preserves exchange event time and declared delay; does not infer delay from last-trade age", () => {
    const trade = observation({
      category: "stocks",
      source_type: "exchange",
      exchange_name: "Euronext Paris",
      observation_time: "2026-09-04T09:00:00Z",
      delay_minutes: 15,
      timeliness: "delayed",
    });
    expect(assertEconomicObservation(trade).delay_minutes).toBe(15);
    expect(() => assertEconomicObservation({ ...trade, timeliness: "real_time" })).toThrow(
      "Delayed",
    );
    expect(() => assertEconomicObservation({ ...trade, observation_time: null })).toThrow(
      "observation_time",
    );
    expect(() =>
      assertEconomicObservation({ ...trade, observation_time: "2026-09-07T00:00:00Z" }),
    ).toThrow("after retrieval");
    expect(() => assertEconomicObservation({ ...trade, delay_minutes: null })).toThrow(
      "declared delay",
    );
  });
  it("requires native crypto venue identity and marks CoinGecko as an aggregate", () => {
    const trade = observation({
      country_code: "GLOBAL",
      category: "cryptocurrency",
      source_id: "coinbase",
      source_type: "exchange",
      exchange_name: "Coinbase",
      value_type: "market_trade_price",
      price_type: "market_trade_price",
      observation_time: "2026-09-06T09:59:00Z",
      timeliness: "unknown",
    });
    expect(assertEconomicObservation(trade).exchange_name).toBe("Coinbase");
    expect(() => assertEconomicObservation({ ...trade, exchange_name: "Binance" })).toThrow(
      "venue identity",
    );
    const aggregate = {
      ...trade,
      source_id: "coingecko",
      source_grade: "C",
      source_type: "aggregator",
      is_official: false,
      value_type: "reference_price",
      price_type: "reference_price",
      aggregation: "aggregate",
      exchange_name: "multiple_exchanges",
    } as const;
    expect(assertEconomicObservation(aggregate).is_official).toBe(false);
    expect(() => assertEconomicObservation({ ...aggregate, is_official: true })).toThrow(
      "not official",
    );
  });
  it("does not treat missing as zero, guess preliminary flags or accept invalid dates", () => {
    expect(
      assertEconomicObservation(
        observation({ value: null, original_value: null, missing_reason: "source_missing" }),
      ).value,
    ).toBeNull();
    for (const invalid of [
      { value: null },
      { revision_status: "final" },
      { observation_date: "2026-02-30" },
      { value: "NaN", original_value: "NaN" },
      { original_value: "1" },
      { retrieval_time: "2026-09-01T00:00:00Z" },
    ])
      expect(() =>
        assertEconomicObservation(observation(invalid as Partial<EconomicObservation>)),
      ).toThrow();
  });
  it("converts currency as a separate exact-decimal transformation", () => {
    const original = observation({ value: "0.10", original_value: "0.10" });
    const converted = convertObservationCurrency(original, {
      fx_rate: "1.23456789",
      fx_source: "https://example.org/fx/GBP-USD",
      target_currency: "USD",
      conversion_timestamp: asOf,
    });
    expect(converted).toMatchObject({
      original_value: "0.10",
      original_currency: "GBP",
      fx_rate: "1.23456789",
      converted_value: "0.1234567890",
      target_currency: "USD",
    });
    expect(original.value).toBe("0.10");
    expect(
      convertObservationCurrency(observation({ value: "-1.2e2", original_value: "-1.2e2" }), {
        fx_rate: "1e-2",
        fx_source: "https://example.org/fx",
        target_currency: "EUR",
        conversion_timestamp: asOf,
      }).converted_value,
    ).toBe("-1.2");
    expect(() =>
      convertObservationCurrency(original, {
        fx_rate: "0",
        fx_source: "https://example.org/fx",
        target_currency: "USD",
        conversion_timestamp: asOf,
      }),
    ).toThrow();
  });
  it("expands annual normalized WDI rows without inventing a day or raw unit", () => {
    const definition = {
      code: "FP.CPI.TOTL",
      topic: "prices",
      unit: "index",
      valueType: "price_index",
      currency: null,
      indexBase: "2010 = 100",
    } as const;
    const source = {
      code: definition.code,
      indicatorUrl: "https://data.worldbank.org/indicator/FP.CPI.TOTL",
      retrievedAt: asOf,
      observationMetadata: wdiObservationMetadata("", ""),
    };
    expect(
      annualReferenceObservation(definition, source, { code: "GB", name: "United Kingdom" }, [
        2024,
        "112.4",
      ]),
    ).toMatchObject({
      observation_date: "2024",
      original_unit: "",
      revision_status: "unknown",
      currency: null,
    });
    expect(() => wdiObservationMetadata("", "P")).toThrow("requires review");
    expect(() =>
      annualReferenceObservation(
        { ...definition, code: "other" },
        source,
        { code: "GB", name: "UK" },
        [2024, "112.4"],
      ),
    ).toThrow("identity");
  });
});
