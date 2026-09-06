import {
  type AnnualReferenceSource,
  annualReferenceObservation,
  type EconomicObservation,
  type ValueType,
} from "@economyos/contracts";
import type { Locale } from "@economyos/i18n";
import definitions from "../../../../../../data/public-economy/indicators.json";
import manifest from "../../../../public/economy/manifest.json";

export type AnnualPoint = readonly [number, string | null];
export interface CountrySeries {
  schemaVersion: 1;
  countryCode: string;
  iso3: string;
  retrievedAt: string;
  series: Record<string, AnnualPoint[]>;
}
export interface CountryMetadata {
  code: string;
  iso3: string;
  name: string;
  region: string;
  income: string;
  capital: string;
}
export interface Indicator {
  id: string;
  code: string;
  topic: string;
  en: string;
  fa: string;
  unit: string;
  descriptionEn: string;
  descriptionFa: string;
  boundaryEn: string;
  boundaryFa: string;
  countryComparable: boolean;
  sourceEstimate: boolean;
  valueType: ValueType;
  currency: string | null;
  indexBase: string | null;
}
export interface SourceMetadata {
  code: string;
  name: string;
  organization: string;
  definition: string;
  url: string;
  indicatorUrl: string;
  retrievedAt: string;
  sourceUpdatedAt: string;
  sha256: string;
  reported: number;
  observationMetadata: AnnualReferenceSource["observationMetadata"];
}
export interface PublicManifest {
  schemaVersion: number;
  retrievedAt: string;
  startYear: number;
  endYear: number;
  observations: number;
  countries: CountryMetadata[];
  indicators: Record<string, SourceMetadata>;
  countryNames: Record<string, Record<string, string>>;
  countryOrder: Record<string, string[]>;
  referenceYear: number;
  referenceHighlights: Record<string, Record<string, AnnualPoint | null>>;
  highlights: Record<string, Record<string, AnnualPoint | null>>;
  files: Record<string, { sha256: string; bytes: number }>;
}
export const PUBLIC_DATA = manifest as unknown as PublicManifest;
export const INDICATORS = definitions as readonly Indicator[];
export const ECONOMIC_TOPICS = [
  ["all", "All indicators", "همه شاخص‌ها"],
  ["prices", "Prices & money", "قیمت و پول"],
  ["output", "Output & investment", "تولید و سرمایه‌گذاری"],
  ["jobs", "Work & livelihoods", "کار و معیشت"],
  ["external", "Trade & external finances", "تجارت و مالیه خارجی"],
  ["living", "Living standards", "سطح زندگی"],
  ["public", "Public services & energy", "خدمات عمومی و انرژی"],
] as const;
export const HEADLINE_IDS = [
  "inflation",
  "growth",
  "gdp",
  "gdp-person",
  "unemployment",
  "population",
];
export const ORDERED_INDICATORS = [...INDICATORS].sort((left, right) => {
  const rank = (id: string) =>
    HEADLINE_IDS.includes(id) ? HEADLINE_IDS.indexOf(id) : HEADLINE_IDS.length;
  return rank(left.id) - rank(right.id);
});
export type YearMode = "common" | "latest" | `${number}`;

export function indicatorName(indicator: Indicator, locale: Locale): string {
  return locale === "fa" ? indicator.fa : indicator.en;
}

export function displayCountry(code: string, locale: Locale): string {
  if (code === "WLD") return locale === "fa" ? "جهان" : "World";
  return (
    PUBLIC_DATA.countryNames[code]?.[locale] ??
    PUBLIC_DATA.countries.find((country) => country.code === code)?.name ??
    code
  );
}

export function unitLabel(unit: string, locale: Locale): string {
  const labels: Record<string, readonly [string, string]> = {
    percent: ["%", "٪"],
    "percent-gdp": ["% of GDP", "٪ تولید"],
    usd: ["current US$", "دلار جاری آمریکا"],
    people: ["people", "نفر"],
    "international-dollar": ["constant international $", "دلار بین‌المللی ثابت"],
    months: ["months of imports", "ماه واردات"],
    years: ["years", "سال"],
    gini: ["0–100", "۰–۱۰۰"],
    index: ["source base = 100", "پایه منبع = ۱۰۰"],
    "local-per-usd": ["local currency / US$", "پول محلی / دلار"],
    "percent-exports": ["% of exports & primary income", "٪ صادرات و درآمد اولیه"],
  };
  return labels[unit]?.[locale === "fa" ? 1 : 0] ?? unit;
}

export function formatValue(
  value: string | number,
  indicator: Indicator,
  locale: Locale,
  compact = true,
): string {
  const number = Number(value);
  const monetary = indicator.unit === "usd";
  const useCompact =
    compact &&
    ["usd", "people", "international-dollar"].includes(indicator.unit) &&
    Math.abs(number) >= 1_000_000;
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: indicator.unit === "people" && !useCompact ? 0 : 2,
    ...(useCompact ? { notation: "compact" as const } : {}),
    ...(monetary
      ? { style: "currency" as const, currency: "USD", currencyDisplay: "narrowSymbol" as const }
      : {}),
  }).format(number);
  return indicator.unit.startsWith("percent")
    ? `${formatted}${locale === "fa" ? "٪" : "%"}`
    : formatted;
}

export function latestPoint(
  series: readonly AnnualPoint[] | undefined,
  before = PUBLIC_DATA.endYear,
): AnnualPoint | null {
  return (
    [...(series ?? [])].reverse().find(([year, value]) => year <= before && value !== null) ?? null
  );
}

export function comparisonPoints(
  countries: readonly (CountrySeries | undefined)[],
  indicator: Indicator,
  mode: YearMode,
): (AnnualPoint | null)[] {
  const series = countries.map((country) => country?.series[indicator.id] ?? []);
  if (mode === "latest") return series.map((points) => latestPoint(points));
  if (mode !== "common") {
    return series.map(
      (points) => points.find(([year, value]) => year === Number(mode) && value !== null) ?? null,
    );
  }
  if (series.some((points) => points.length === 0)) return series.map(() => null);
  const common =
    series[0]?.filter(
      ([year, value]) =>
        value !== null &&
        series.every((points) =>
          points.some(([candidate, number]) => candidate === year && number !== null),
        ),
    ) ?? [];
  const year = common.at(-1)?.[0];
  return series.map((points) => points.find(([candidate]) => candidate === year) ?? null);
}

export function annualAssociation(left: readonly AnnualPoint[], right: readonly AnnualPoint[]) {
  const pairs = left.flatMap(([year, value]) => {
    const other = right.find(([candidate]) => candidate === year)?.[1];
    return value !== null && other !== null && other !== undefined
      ? [[year, Number(value), Number(other)] as const]
      : [];
  });
  if (pairs.length < 8) return null;
  const meanX = pairs.reduce((sum, point) => sum + point[1], 0) / pairs.length;
  const meanY = pairs.reduce((sum, point) => sum + point[2], 0) / pairs.length;
  let cross = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (const [, x, y] of pairs) {
    cross += (x - meanX) * (y - meanY);
    varianceX += (x - meanX) ** 2;
    varianceY += (y - meanY) ** 2;
  }
  if (varianceX === 0 || varianceY === 0) return null;
  return {
    correlation: Math.max(-1, Math.min(1, cross / Math.sqrt(varianceX * varianceY))),
    count: pairs.length,
    from: pairs[0]?.[0],
    to: pairs.at(-1)?.[0],
  };
}

export function validateCountrySeries(value: unknown, code: string): CountrySeries {
  if (!value || typeof value !== "object") throw new Error("Invalid country data");
  const country = value as CountrySeries;
  if (
    country.schemaVersion !== 1 ||
    country.countryCode !== code ||
    country.retrievedAt !== PUBLIC_DATA.retrievedAt ||
    !country.series
  )
    throw new Error("Country data and source manifest do not match");
  for (const indicator of INDICATORS) {
    const points = country.series[indicator.id];
    if (!Array.isArray(points) || points.length > PUBLIC_DATA.endYear - PUBLIC_DATA.startYear + 1)
      throw new Error("Incomplete indicator data");
    let previous = PUBLIC_DATA.startYear - 1;
    for (const point of points) {
      if (!Array.isArray(point) || point.length !== 2)
        throw new Error("Invalid annual observation");
      const [year, number] = point;
      if (
        !Number.isInteger(year) ||
        year <= previous ||
        year > PUBLIC_DATA.endYear ||
        (number !== null &&
          (typeof number !== "string" || number.trim() === "" || !Number.isFinite(Number(number))))
      )
        throw new Error("Invalid annual observation");
      previous = year;
    }
  }
  return country;
}

export function comparisonCsv(
  codes: string[],
  countries: (CountrySeries | undefined)[],
  indicators: readonly Indicator[],
  mode: YearMode,
  locale: Locale,
): string {
  const provenanceFields: readonly (keyof EconomicObservation)[] = [
    "country_code",
    "category",
    "source_name",
    "source_grade",
    "source_type",
    "instrument_or_item",
    "value",
    "value_type",
    "price_type",
    "currency",
    "unit",
    "geography",
    "observation_date",
    "retrieval_timestamp",
    "frequency",
    "is_official",
    "is_preliminary",
    "revision_status",
    "source_id",
    "source_url",
    "original_value",
    "original_currency",
    "original_unit",
    "missing_reason",
    "observation_time",
    "retrieval_time",
    "delay_minutes",
    "timeliness",
    "exchange_name",
    "index_base",
    "aggregation",
  ];
  const rows: (string | number)[][] = [
    [
      "Indicator",
      "Country",
      "Year",
      "Value",
      "Unit",
      "Status",
      "Provider",
      "Source updated",
      "Retrieved",
      "Source URL",
      ...provenanceFields,
    ],
  ];
  for (const indicator of indicators) {
    const points = comparisonPoints(countries, indicator, mode);
    const source = PUBLIC_DATA.indicators[indicator.id];
    codes.forEach((code, index) => {
      const point = points[index];
      const observation =
        source && point
          ? annualReferenceObservation(
              indicator,
              source,
              {
                code,
                name:
                  PUBLIC_DATA.countries.find((country) => country.code === code)?.name ?? "World",
              },
              point,
            )
          : null;
      rows.push([
        indicatorName(indicator, locale),
        displayCountry(code, locale),
        point?.[0] ?? "",
        point?.[1] ?? "",
        unitLabel(indicator.unit, locale),
        point
          ? indicator.sourceEstimate
            ? "source model estimate"
            : "published reference value"
          : "not reported for selected period",
        source?.organization ?? "World Bank WDI",
        source?.sourceUpdatedAt ?? "",
        source?.retrievedAt ?? "",
        source?.indicatorUrl ?? "",
        ...provenanceFields.map((field) => {
          if (!observation) return "";
          const value = observation[field];
          return value === null ? "null" : String(value);
        }),
      ]);
    });
  }
  return rows
    .map((row) =>
      row
        .map((value) => {
          let text = String(value);
          if (/^[=+@\t\r]/.test(text) || (text.startsWith("-") && !Number.isFinite(Number(text))))
            text = `'${text}`;
          return `"${text.replaceAll('"', '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
}
