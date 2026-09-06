"use client";

import {
  consecutiveAnnualChange,
  RISK_DIMENSIONS,
  runDecisionScenario,
  SCENARIO_FAMILIES,
  type ScenarioAudience,
  type ScenarioFamily,
  type Severity,
} from "@economyos/behavioral-economics/decision-support";
import type { Locale } from "@economyos/i18n";
import Link from "next/link";
import { useId, useState } from "react";
import { type DecisionCopyKey, decisionText } from "../_lib/decision-copy";
import {
  type AnnualPoint,
  displayCountry,
  formatValue,
  INDICATORS,
  indicatorName,
  latestPoint,
  PUBLIC_DATA,
  unitLabel,
} from "../_lib/public-economy";
import { useCountryData } from "../_lib/use-country-data";

const priority = [
  "AM",
  "AZ",
  "BE",
  "BR",
  "CA",
  "CN",
  "FI",
  "FR",
  "DE",
  "IR",
  "IT",
  "JP",
  "NL",
  "ES",
  "SE",
  "TR",
  "GB",
  "US",
];
const perspectives = {
  household: [
    "inflation",
    "consumption-growth",
    "unemployment",
    "youth-neet",
    "deposit-rate",
    "vulnerable-employment",
    "wage-employment",
    "age-dependency",
  ],
  business: [
    "growth",
    "lending-rate",
    "private-credit",
    "manufacturing-growth",
    "export-growth",
    "import-growth",
    "fuel-imports",
    "food-imports",
  ],
  investor: [
    "growth",
    "inflation",
    "real-interest",
    "current-account",
    "government-debt",
    "fiscal-balance",
    "bank-capital",
    "savings",
  ],
  radar: [
    "inflation",
    "money-growth",
    "reserves",
    "short-debt-reserves",
    "nonperforming-loans",
    "bank-capital",
    "government-debt",
    "interest-revenue",
  ],
} as const;

function Sparkline({ points }: { points: readonly AnnualPoint[] }) {
  const usable = points.filter((point): point is readonly [number, string] => point[1] !== null);
  if (usable.length < 2) return null;
  const values = usable.map(([, value]) => Number(value));
  const first = usable[0]?.[0] ?? 0;
  const last = usable.at(-1)?.[0] ?? first + 1;
  const low = Math.min(...values);
  const high = Math.max(...values);
  let previous: number | null = null;
  const path = points
    .map(([year, value]) => {
      if (value === null) {
        previous = null;
        return "";
      }
      const start = previous === year - 1 ? "L" : "M";
      previous = year;
      return `${start}${8 + ((year - first) / Math.max(1, last - first)) * 284},${54 - ((Number(value) - low) / (high - low || 1)) * 42}`;
    })
    .join(" ");
  return (
    <svg className="decisionSpark" viewBox="0 0 300 65" aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

export function DecisionRoom({ locale }: { locale: Locale }) {
  const t = (key: DecisionCopyKey) => decisionText(locale, key);
  const [country, setCountry] = useState(locale === "fa" ? "IR" : "US");
  const [perspective, setPerspective] = useState<keyof typeof perspectives>("household");
  const [riskDimension, setRiskDimension] = useState<keyof typeof RISK_DIMENSIONS>("external");
  const [family, setFamily] = useState<ScenarioFamily>("energy");
  const [audience, setAudience] = useState<ScenarioAudience>("household");
  const [severity, setSeverity] = useState<Severity>("moderate");
  const { data, loading, errors, retry } = useCountryData([country]);
  const countryId = useId();
  const scenarioId = useId();
  const riskId = useId();
  const result = runDecisionScenario(family, audience, severity);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const yearNumber = new Intl.NumberFormat(locale, { useGrouping: false });
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const download = () => {
    const artifact = {
      ...result,
      locale,
      countryContext: country,
      countryContextIsNotCalibration: true,
      labels: {
        family: t(family),
        audience: t(audience),
        severity: t(severity),
        assumptions: t("scenarioNote"),
      },
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(artifact, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `economyos-scenario-${family}-${locale}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <main
      id="main-content"
      className="intelligenceMain publicMain decisionRoom"
      tabIndex={-1}
      lang={locale}
      dir={["fa", "ar"].includes(locale) ? "rtl" : "ltr"}
    >
      <header className="decisionHero">
        <div>
          <p className="eyebrow">EconomyOS · {number.format(INDICATORS.length)}</p>
          <h1>{t("title")}</h1>
          <p>{t("intro")}</p>
        </div>
        <label htmlFor={countryId}>
          {t("country")}
          <select
            id={countryId}
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          >
            {priority.map((code) => (
              <option key={code} value={code}>
                {displayCountry(code, locale)}
              </option>
            ))}
          </select>
        </label>
      </header>
      <fieldset className="decisionPerspectives" aria-label={t("title")}>
        {(["household", "business", "investor", "radar"] as const).map((item) => (
          <button
            type="button"
            key={item}
            aria-pressed={perspective === item}
            onClick={() => setPerspective(item)}
          >
            {t(item)}
          </button>
        ))}
        <a href="#decision-scenarios">{t("scenarios")} ↓</a>
      </fieldset>
      {perspective === "radar" && (
        <section className="decisionContext" aria-label={t("radar")}>
          <div>
            <p>{t("riskNote")}</p>
          </div>
          <label htmlFor={riskId}>
            {t("dimension")}
            <select
              id={riskId}
              value={riskDimension}
              onChange={(event) =>
                setRiskDimension(event.target.value as keyof typeof RISK_DIMENSIONS)
              }
            >
              {(Object.keys(RISK_DIMENSIONS) as (keyof typeof RISK_DIMENSIONS)[]).map(
                (dimension) => (
                  <option key={dimension} value={dimension}>
                    {t(dimension)}
                  </option>
                ),
              )}
            </select>
          </label>
        </section>
      )}
      <section className="decisionContext" aria-labelledby="decision-heading">
        <div>
          <p className="eyebrow">{displayCountry(country, locale)}</p>
          <h2 id="decision-heading">{t("happening")}</h2>
          <p>{t("annual")}</p>
        </div>
        <Link className="secondaryAction" href={`/${locale}/intelligence/countries/${country}`}>
          {t("allData")} ↗
        </Link>
      </section>
      {loading ? (
        <p role="status">{t("loading")}</p>
      ) : errors.length ? (
        <div role="alert">
          <p>{t("downloadFailed")}</p>
          <button type="button" onClick={retry}>
            {t("retry")}
          </button>
        </div>
      ) : (
        <div className="decisionMetricGrid">
          {(perspective === "radar"
            ? RISK_DIMENSIONS[riskDimension]
            : perspectives[perspective]
          ).map((id) => {
            const indicator = INDICATORS.find((item) => item.id === id);
            if (!indicator) return null;
            const history = data[country]?.series[id] ?? [];
            const point = latestPoint(history);
            const change = perspective === "radar" ? consecutiveAnnualChange(history) : null;
            const source = PUBLIC_DATA.indicators[id];
            return (
              <article className="decisionMetric" key={`${country}-${id}`}>
                <p className="decisionMetricName" lang={locale === "fa" ? "fa" : "en"}>
                  {indicatorName(indicator, locale)}
                </p>
                {change && (
                  <p className="decisionMetricName">
                    {change.availability === "available" ? (
                      <>
                        {t("annualChange")}: {number.format(change.difference)}{" "}
                        {unitLabel(
                          ["percent", "percent-gdp", "percent-exports"].includes(indicator.unit)
                            ? "percentage-points"
                            : indicator.unit,
                          locale,
                        )}{" "}
                        · {yearNumber.format(change.from)}–{yearNumber.format(change.to)}
                      </>
                    ) : (
                      t("noAnnualChange")
                    )}
                  </p>
                )}
                {point?.[1] !== null && point ? (
                  <>
                    <div className="decisionValue">
                      {formatValue(point[1], indicator, locale)}
                      <time dateTime={String(point[0])}>{yearNumber.format(point[0])}</time>
                    </div>
                    <small>{unitLabel(indicator.unit, locale)}</small>
                    <Sparkline points={history.slice(-12)} />
                  </>
                ) : (
                  <p className="decisionMissing">{t("missing")}</p>
                )}
                <details>
                  <summary>{t("evidence")}</summary>
                  <p lang={locale === "fa" ? "fa" : "en"}>
                    {locale === "fa" ? indicator.descriptionFa : indicator.descriptionEn}
                  </p>
                  <p lang={locale === "fa" ? "fa" : "en"}>
                    {locale === "fa" ? indicator.boundaryFa : indicator.boundaryEn}
                  </p>
                  {source ? <a href={source.indicatorUrl}>{t("source")} ↗</a> : null}
                  <div className="decisionHistory">
                    <table>
                      <caption>
                        {indicatorName(indicator, locale)} · {t("evidence")}
                      </caption>
                      <tbody>
                        {[...history]
                          .reverse()
                          .filter(([, value]) => value !== null)
                          .map(([year, value]) => (
                            <tr key={year}>
                              <th scope="row">{yearNumber.format(year)}</th>
                              <td>
                                {value === null
                                  ? t("missing")
                                  : formatValue(value, indicator, locale, false)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      )}
      <div className="decisionReading">
        <section>
          <h2>{t("matters")}</h2>
          <p>
            {t(
              perspective === "household"
                ? "householdWhy"
                : perspective === "business"
                  ? "businessWhy"
                  : "investorWhy",
            )}
          </p>
        </section>
        <section>
          <h2>{t("limits")}</h2>
          <p>{t("interpretation")}</p>
          <p>{t("noProbability")}</p>
        </section>
      </div>
      <section id="decision-scenarios" className="decisionScenario" aria-labelledby={scenarioId}>
        <header>
          <p className="eyebrow">{t("hypothetical")}</p>
          <h2 id={scenarioId}>{t("scenarios")}</h2>
          <p>{t("scenarioNote")}</p>
        </header>
        <fieldset className="scenarioChoices" aria-label={t("scenarios")}>
          {SCENARIO_FAMILIES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === family}
              onClick={() => setFamily(item)}
            >
              {t(item)}
            </button>
          ))}
        </fieldset>
        <div className="scenarioControls">
          <fieldset aria-label={t("title")}>
            {(["household", "business", "investor"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={item === audience}
                onClick={() => setAudience(item)}
              >
                {t(item)}
              </button>
            ))}
          </fieldset>
          <fieldset aria-label={t("hypothetical")}>
            {(["mild", "moderate", "severe"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={item === severity}
                onClick={() => setSeverity(item)}
              >
                {t(item)}
              </button>
            ))}
          </fieldset>
        </div>
        <div className="scenarioResults" aria-live="polite" aria-atomic="true">
          {(
            [
              ["cost", result.results.costIndex],
              ["power", result.results.purchasingPowerIndex],
              ["assets", result.results.assetValueIndex],
              ["interest", result.results.extraAnnualInterestPer100Debt],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <span>{t(label)}</span>
              <strong>{number.format(value)}</strong>
            </div>
          ))}
        </div>
        <details>
          <summary>{t("assumptions")}</summary>
          <p>{t("scenarioNote")}</p>
          <table>
            <tbody>
              {result.assumptions.map((item) => (
                <tr key={item.channel}>
                  <th scope="row">{t(item.channel as DecisionCopyKey)}</th>
                  <td>
                    {percent.format(item.change)} × {percent.format(item.exposure)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>{t("powerFormula")}</p>
          <p dir="ltr">{result.methodVersion}</p>
        </details>
        <button className="secondaryAction" type="button" onClick={download}>
          {t("export")} ↓
        </button>
      </section>
    </main>
  );
}
