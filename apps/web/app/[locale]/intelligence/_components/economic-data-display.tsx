"use client";

import type { Locale } from "@economyos/i18n";
import Link from "next/link";
import { useId, useState } from "react";
import { publicHref, words } from "../_lib/public-copy";
import {
  type AnnualPoint,
  type CountrySeries,
  comparisonCsv,
  comparisonPoints,
  displayCountry,
  formatValue,
  INDICATORS,
  type Indicator,
  indicatorName,
  PUBLIC_DATA,
  unitLabel,
  type YearMode,
} from "../_lib/public-economy";

export function SourceNote({ locale }: { locale: Locale }) {
  return (
    <p className="sourceNote">
      <a href="https://datacatalog.worldbank.org/search/dataset/0037712/world-development-indicators">
        {words(
          locale,
          "World Bank · World Development Indicators",
          "بانک جهانی · شاخص‌های توسعه جهانی",
        )}
      </a>
      {" · "}
      {words(locale, "Annual series · retrieved", "سری سالانه · دریافت")}{" "}
      <time dateTime={PUBLIC_DATA.retrievedAt}>
        {new Intl.DateTimeFormat(locale, {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(PUBLIC_DATA.retrievedAt))}
      </time>
      {" · "}
      {words(
        locale,
        "Revised data; observation years vary",
        "داده بازنگری‌شده؛ سال مشاهده متفاوت است",
      )}
    </p>
  );
}

export function DataLoadState({
  locale,
  loading,
  errors,
  retry,
}: {
  locale: Locale;
  loading: boolean;
  errors: string[];
  retry: () => void;
}) {
  if (errors.length)
    return (
      <div className="dataError" role="alert">
        <p>
          {words(
            locale,
            "Could not load the published snapshot for",
            "نسخه منتشرشده این کشورها بارگذاری نشد:",
          )}{" "}
          {errors.map((code) => displayCountry(code, locale)).join("، ")}.{" "}
          {words(
            locale,
            "This is a loading problem, not missing economic evidence.",
            "این مشکل بارگذاری است، نه نبود شواهد اقتصادی.",
          )}
        </p>
        <button className="secondaryAction" type="button" onClick={retry}>
          {words(locale, "Try again", "تلاش دوباره")}
        </button>
      </div>
    );
  return loading ? (
    <p role="status" className="sourceNote">
      {words(
        locale,
        "Loading published country indicators…",
        "در حال بارگذاری شاخص‌های منتشرشده کشورها…",
      )}
    </p>
  ) : null;
}

export function MetricDetails({ indicator, locale }: { indicator: Indicator; locale: Locale }) {
  const source = PUBLIC_DATA.indicators[indicator.id];
  return (
    <details className="metricDetails">
      <summary>{words(locale, "Meaning, limits & source", "معنی، محدودیت و منبع")}</summary>
      <p>{locale === "fa" ? indicator.descriptionFa : indicator.descriptionEn}</p>
      <p>{locale === "fa" ? indicator.boundaryFa : indicator.boundaryEn}</p>
      {indicator.valueType === "price_index" ? (
        <p>
          {words(
            locale,
            "This is a price index, not an amount of money. 112.4 index points does not mean a price of 112.4 dollars or euros.",
            "این شاخص قیمت است، نه مبلغ پول. عدد ۱۱۲٫۴ در شاخص به معنی قیمت ۱۱۲٫۴ دلار یا یورو نیست.",
          )}
        </p>
      ) : null}
      {indicator.sourceEstimate ? (
        <p>
          {words(
            locale,
            "ILO modelled estimate, distributed by the World Bank.",
            "برآورد مدل سازمان بین‌المللی کار، منتشرشده توسط بانک جهانی.",
          )}
        </p>
      ) : null}
      {source ? (
        <>
          <a href={source.indicatorUrl}>
            {words(locale, "Open indicator at the source", "دیدن شاخص در منبع")}
          </a>
          <p className="sourceNote" lang="en">
            {source.organization}
          </p>
          <p className="sourceNote">
            {words(
              locale,
              "Grade A · official, free, machine-readable macro reference data. Individual revision and preliminary flags are not supplied by this feed.",
              "درجه A · داده مرجع کلان رسمی، رایگان و ماشین‌خوان. این منبع وضعیت مقدماتی یا بازنگری هر مشاهده را اعلام نمی‌کند.",
            )}
          </p>
          <p className="sourceNote">
            {words(locale, "Provider dataset updated", "به‌روزرسانی مجموعه در منبع")}:{" "}
            <time>{source.sourceUpdatedAt}</time>
          </p>
        </>
      ) : null}
    </details>
  );
}

export function YearSelect({
  locale,
  value,
  onChange,
  single = false,
}: {
  locale: Locale;
  value: YearMode;
  onChange: (mode: YearMode) => void;
  single?: boolean;
}) {
  return (
    <label className="dataSelect">
      <span>{words(locale, "Observation year", "سال مشاهده")}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as YearMode)}>
        {!single ? (
          <option value="common">
            {words(locale, "Latest common year for each measure", "آخرین سال مشترک برای هر شاخص")}
          </option>
        ) : null}
        <option value="latest">
          {words(locale, "Latest reported for each country", "آخرین مقدار گزارش‌شده هر کشور")}
        </option>
        {Array.from(
          { length: PUBLIC_DATA.endYear - PUBLIC_DATA.startYear + 1 },
          (_, index) => PUBLIC_DATA.endYear - index,
        ).map((year) => (
          <option key={year} value={year}>
            {new Intl.NumberFormat(locale, { useGrouping: false }).format(year)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DownloadData({
  locale,
  codes,
  countries,
  indicators,
  mode,
}: {
  locale: Locale;
  codes: string[];
  countries: (CountrySeries | undefined)[];
  indicators: readonly Indicator[];
  mode: YearMode;
}) {
  return (
    <button
      className="secondaryAction"
      type="button"
      disabled={countries.some((country) => !country)}
      onClick={() => {
        const csv = comparisonCsv(codes, countries, indicators, mode, locale);
        const url = URL.createObjectURL(
          new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = `economyos-${codes.join("-")}-${mode}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      }}
    >
      {words(locale, "Download CSV", "دریافت CSV")}
    </button>
  );
}

export function IndicatorTable({
  locale,
  codes,
  countries,
  indicators,
  mode,
  loading = false,
}: {
  locale: Locale;
  codes: string[];
  countries: (CountrySeries | undefined)[];
  indicators: readonly Indicator[];
  mode: YearMode;
  loading?: boolean;
}) {
  return (
    <>
      <p className="tableScrollHint">
        {words(
          locale,
          "Scroll sideways to see every country. Open a measure to see its source and limits.",
          "برای دیدن همه کشورها جدول را افقی جابه‌جا کنید. هر شاخص را برای دیدن منبع و محدودیت باز کنید.",
        )}
      </p>
      <section
        className="dataTableWrap"
        aria-label={words(locale, "Published economic indicators", "شاخص‌های اقتصادی منتشرشده")}
      >
        <table className="economicTable" style={{ minWidth: `${16 + codes.length * 10}rem` }}>
          <caption>
            {words(
              locale,
              "Values retain their observation year. Missing data is never replaced with zero.",
              "سال مشاهده کنار هر مقدار حفظ شده است. داده گمشده هرگز صفر در نظر گرفته نمی‌شود.",
            )}
          </caption>
          <thead>
            <tr>
              <th scope="col">{words(locale, "Economic measure", "شاخص اقتصادی")}</th>
              {codes.map((code) => (
                <th scope="col" key={code}>
                  {displayCountry(code, locale)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {indicators.map((indicator) => {
              const points = comparisonPoints(countries, indicator, mode);
              return (
                <tr key={indicator.id}>
                  <th scope="row">
                    <strong>{indicatorName(indicator, locale)}</strong>
                    <small>{unitLabel(indicator.unit, locale)}</small>
                    {!indicator.countryComparable ? (
                      <span className="comparabilityNote">
                        {words(locale, "Country-specific scale", "مقیاس ویژه هر کشور")}
                      </span>
                    ) : null}
                    <MetricDetails indicator={indicator} locale={locale} />
                  </th>
                  {codes.map((code, index) => {
                    const point = points[index];
                    return (
                      <td key={code}>
                        {point?.[1] !== null && point?.[1] !== undefined ? (
                          <>
                            <bdi className="economicValue">
                              {formatValue(point[1], indicator, locale)}
                            </bdi>
                            <span className="observationYear">
                              {new Intl.NumberFormat(locale, { useGrouping: false }).format(
                                point[0],
                              )}
                              {PUBLIC_DATA.endYear - point[0] > 4
                                ? ` · ${words(locale, "older observation", "مشاهده قدیمی")}`
                                : ""}
                            </span>
                          </>
                        ) : (
                          <span className="missingValue">
                            {loading && !countries[index]
                              ? words(locale, "Loading…", "بارگذاری…")
                              : mode === "common" &&
                                  countries[index]?.series[indicator.id]?.some(
                                    ([, value]) => value !== null,
                                  )
                                ? words(locale, "No shared year", "سال مشترک نداریم")
                                : words(locale, "Not reported", "گزارش نشده")}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}

const CHART_COLORS = ["#173b63", "#087f80", "#a66000", "#8842a1"];
export function HistoryChart({
  locale,
  codes,
  countries,
  initialIndicator = "inflation",
}: {
  locale: Locale;
  codes: string[];
  countries: (CountrySeries | undefined)[];
  initialIndicator?: string;
}) {
  const [metric, setMetric] = useState(initialIndicator);
  const [years, setYears] = useState(10);
  const titleId = useId();
  const indicator = INDICATORS.find((item) => item.id === metric) ?? INDICATORS[0];
  if (!indicator) return null;
  const lastYear = PUBLIC_DATA.endYear;
  const firstYear = Math.max(PUBLIC_DATA.startYear, lastYear - years + 1);
  const series = countries.map((country) =>
    (country?.series[indicator.id] ?? []).filter(([year]) => year >= firstYear && year <= lastYear),
  );
  const values = series.flatMap((points) =>
    points.flatMap(([, value]) => (value === null ? [] : [Number(value)])),
  );
  const min = values.length ? Math.min(0, ...values) : 0;
  const max = values.length ? Math.max(...values, min + 1) : 1;
  const span = max - min;
  const low = min - span * 0.05;
  const high = max + span * 0.08;
  const x = (year: number) => 70 + ((year - firstYear) / Math.max(1, lastYear - firstYear)) * 600;
  const y = (value: string | number) => 258 - ((Number(value) - low) / (high - low)) * 216;
  const paths = (points: readonly AnnualPoint[]) => {
    let previous: number | null = null;
    return points
      .map(([year, value]) => {
        if (value === null) {
          previous = null;
          return "";
        }
        const prefix = previous !== null && year === previous + 1 ? "L" : "M";
        previous = year;
        return `${prefix}${x(year).toFixed(2)},${y(value).toFixed(2)}`;
      })
      .join(" ");
  };
  return (
    <section className="historyPanel" aria-labelledby={titleId}>
      <div className="sectionHeading">
        <h2 id={titleId}>
          {words(locale, "See the change over time", "تغییر را در طول زمان ببینید")}
        </h2>
      </div>
      <div className="dataToolbar chartToolbar">
        <label className="dataSelect">
          <span>{words(locale, "Chart measure", "شاخص نمودار")}</span>
          <select value={metric} onChange={(event) => setMetric(event.target.value)}>
            {INDICATORS.map((item) => (
              <option key={item.id} value={item.id}>
                {indicatorName(item, locale)}
              </option>
            ))}
          </select>
        </label>
        <fieldset
          className="choiceButtons"
          aria-label={words(locale, "Chart history", "بازه نمودار")}
        >
          {[5, 10, 26].map((count) => (
            <button
              type="button"
              aria-pressed={years === count}
              key={count}
              onClick={() => setYears(count)}
            >
              {count === 26
                ? words(locale, "Since 2000", "از ۲۰۰۰")
                : `${new Intl.NumberFormat(locale).format(count)} ${words(locale, "years", "سال")}`}
            </button>
          ))}
        </fieldset>
      </div>
      {!indicator.countryComparable && codes.length > 1 ? (
        <p className="methodWarning">
          {locale === "fa" ? indicator.boundaryFa : indicator.boundaryEn}
        </p>
      ) : null}
      <p className="sourceNote">
        {unitLabel(indicator.unit, locale)} ·{" "}
        {words(
          locale,
          "Gaps are unreported years; lines do not fill them.",
          "شکاف‌ها سال‌های گزارش‌نشده‌اند؛ خط آن‌ها را پر نمی‌کند.",
        )}
      </p>
      {values.length ? (
        <svg
          viewBox="0 0 720 310"
          className="economicChart"
          role="img"
          aria-labelledby={`${titleId}-description`}
        >
          <title id={`${titleId}-description`}>
            {indicatorName(indicator, locale)}:{" "}
            {codes.map((code) => displayCountry(code, locale)).join(", ")}, {firstYear}–{lastYear}.{" "}
            {words(locale, "Exact values are in the table below.", "مقدار دقیق در جدول زیر است.")}
          </title>
          {[0, 1, 2, 3, 4].map((step) => {
            const value = min + (span * step) / 4;
            return (
              <g key={step}>
                <line x1="70" x2="680" y1={y(value)} y2={y(value)} className="chartGrid" />
                <text x="60" y={y(value) + 4} textAnchor="end">
                  {new Intl.NumberFormat(locale, {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(value)}
                </text>
              </g>
            );
          })}
          {[firstYear, Math.round((firstYear + lastYear) / 2), lastYear].map((year) => (
            <text key={year} x={x(year)} y="290" textAnchor="middle">
              {new Intl.NumberFormat(locale, { useGrouping: false }).format(year)}
            </text>
          ))}
          {series.map((points, index) => (
            <g key={codes[index]}>
              <path
                d={paths(points)}
                stroke={CHART_COLORS[index]}
                fill="none"
                strokeWidth="2.5"
                strokeDasharray={index === 1 ? "7 3" : index === 2 ? "3 3" : undefined}
              />
              {points
                .filter(([, value]) => value !== null)
                .map(([year, value]) => (
                  <circle
                    key={year}
                    cx={x(year)}
                    cy={y(value ?? "0")}
                    r="3"
                    fill={CHART_COLORS[index]}
                  >
                    <title>
                      {displayCountry(codes[index] ?? "WLD", locale)} {year}:{" "}
                      {formatValue(value ?? "0", indicator, locale, false)}
                    </title>
                  </circle>
                ))}
            </g>
          ))}
        </svg>
      ) : (
        <p role="status">
          {words(
            locale,
            "No published values in this period. Choose another measure or a longer history.",
            "در این بازه مقدار منتشرشده نداریم. شاخص دیگر یا بازه بلندتر انتخاب کنید.",
          )}
        </p>
      )}
      <ul className="chartLegend">
        {codes.map((code, index) => (
          <li key={code}>
            <span style={{ background: CHART_COLORS[index] }} />
            {displayCountry(code, locale)}
          </li>
        ))}
      </ul>
      <details className="historyData">
        <summary>{words(locale, "View exact annual data", "دیدن داده دقیق سالانه")}</summary>
        <div className="dataTableWrap">
          <table className="economicTable">
            <caption>
              {indicatorName(indicator, locale)} · {unitLabel(indicator.unit, locale)}
            </caption>
            <thead>
              <tr>
                <th scope="col">{words(locale, "Year", "سال")}</th>
                {codes.map((code) => (
                  <th key={code} scope="col">
                    {displayCountry(code, locale)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: lastYear - firstYear + 1 }, (_, index) => lastYear - index).map(
                (year) => (
                  <tr key={year}>
                    <th scope="row">{year}</th>
                    {series.map((points, index) => (
                      <td key={codes[index]}>
                        {points.find(([candidate]) => candidate === year)?.[1] ??
                          words(locale, "Not reported", "گزارش نشده")}
                      </td>
                    ))}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </details>
      <MetricDetails indicator={indicator} locale={locale} />
    </section>
  );
}

export function RelatedResearch({ locale }: { locale: Locale }) {
  return (
    <aside
      className="relatedResearch"
      aria-label={words(locale, "Related scientific research", "پژوهش علمی مرتبط")}
    >
      <h2>
        {words(
          locale,
          "Why the same economy can feel different",
          "چرا یک اقتصاد برای افراد متفاوت احساس می‌شود",
        )}
      </h2>
      <p>
        {words(
          locale,
          "Explore reference points, present bias, defaults and fairness in the scientific evidence. These are research mechanisms, not diagnoses of a population.",
          "نقاط مرجع، سوگیری حال، پیش‌فرض‌ها و انصاف را در شواهد علمی بررسی کنید. این‌ها سازوکار پژوهشی‌اند، نه تشخیص ویژگی یک جمعیت.",
        )}
      </p>
      <Link href={publicHref(locale, "science")}>
        {words(locale, "Explore scientific evidence and models", "دیدن شواهد علمی و مدل‌ها")}
      </Link>
    </aside>
  );
}
