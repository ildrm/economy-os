"use client";

import type { Locale } from "@economyos/i18n";
import Link from "next/link";
import { useState } from "react";
import { publicHref, words } from "../_lib/public-copy";
import {
  displayCountry,
  ECONOMIC_TOPICS,
  formatValue,
  INDICATORS,
  indicatorName,
  latestPoint,
  PUBLIC_DATA,
} from "../_lib/public-economy";
import { useCountryData } from "../_lib/use-country-data";
import { DataLoadState, HistoryChart, RelatedResearch, SourceNote } from "./economic-data-display";

export function EconomyOverview({ locale }: { locale: Locale }) {
  const [perspective, setPerspective] = useState("everyday");
  const [ranking, setRanking] = useState("gdp");
  const load = useCountryData(["WLD"]);
  const world = load.data.WLD;
  const w = (en: string, fa: string) => words(locale, en, fa);
  const rankingIndicator = INDICATORS.find((item) => item.id === ranking) ?? INDICATORS[0];
  const rankingYear = PUBLIC_DATA.referenceYear;
  const ranked = PUBLIC_DATA.countries
    .flatMap((country) => {
      const point = PUBLIC_DATA.referenceHighlights[country.code]?.[ranking];
      return point?.[1] !== null && point?.[1] !== undefined && point[0] === rankingYear
        ? [{ country, point }]
        : [];
    })
    .sort((a, b) => Number(b.point[1]) - Number(a.point[1]));
  const perspectiveCopy =
    {
      everyday: [
        w("For everyday life", "برای زندگی روزمره"),
        w(
          "Connect prices, work and public services to household conditions. National averages do not describe every household.",
          "قیمت، کار و خدمات عمومی را به شرایط خانوار پیوند دهید. میانگین ملی همه خانوارها را توصیف نمی‌کند.",
        ),
        "inflation",
        "unemployment",
        "life-expectancy",
      ],
      business: [
        w("For business decisions", "برای تصمیم کسب‌وکار"),
        w(
          "Explore demand, capital formation, trade exposure and financing conditions. Published macro data is a starting point for sector-specific investigation.",
          "تقاضا، تشکیل سرمایه، وابستگی تجاری و شرایط تأمین مالی را بررسی کنید. داده کلان نقطه شروع بررسی بخش خاص است.",
        ),
        "growth",
        "investment",
        "trade",
      ],
      research: [
        w("For economic research", "برای پژوهش اقتصادی"),
        w(
          "Inspect source definitions, matched observation years, historical association and competing behavioral mechanisms. Separate descriptive evidence from causal claims.",
          "تعریف منبع، سال مشاهده مشترک، رابطه تاریخی و سازوکار رفتاری رقیب را بررسی کنید. شواهد توصیفی را از ادعای علّی جدا کنید.",
        ),
        "current-account",
        "inequality",
        "money-growth",
      ],
    }[perspective] ?? [];
  return (
    <>
      <header className="publicHeader dataHeader">
        <h1>{w("Understand the economy through evidence.", "اقتصاد را با شواهد بشناسید.")}</h1>
        <p>
          {w(
            "Explore what changed, compare countries, and connect economic conditions to the science behind decisions.",
            "تغییرات را بررسی کنید، کشورها را مقایسه کنید و شرایط اقتصادی را به علم تصمیم‌گیری پیوند دهید.",
          )}
        </p>
      </header>
      <div className="dataCoverage">
        <strong>
          {new Intl.NumberFormat(locale).format(PUBLIC_DATA.countries.length)}{" "}
          {w("economies", "اقتصاد")}
        </strong>
        <span>
          {INDICATORS.length} {w("indicators", "شاخص")}
        </span>
        <span>
          {PUBLIC_DATA.startYear}–{PUBLIC_DATA.endYear}
        </span>
        <span>
          {new Intl.NumberFormat(locale).format(PUBLIC_DATA.observations)}{" "}
          {w("published annual values", "مقدار سالانه منتشرشده")}
        </span>
      </div>
      <SourceNote locale={locale} />
      <DataLoadState locale={locale} {...load} />
      <h2 className="worldHeading">{w("The world in published data", "جهان در داده منتشرشده")}</h2>
      <div className="economicFacts">
        {["growth", "gdp", "population", "unemployment"].map((id) => {
          const indicator = INDICATORS.find((item) => item.id === id);
          const point = latestPoint(world?.series[id]);
          return indicator ? (
            <article key={id}>
              <h3>{indicatorName(indicator, locale)}</h3>
              <bdi>
                {point?.[1] !== null && point?.[1] !== undefined
                  ? formatValue(point[1], indicator, locale)
                  : load.loading
                    ? "…"
                    : w("Not reported", "گزارش نشده")}
              </bdi>
              <small>
                {point?.[0]} · {w("World Bank world aggregate", "تجمیع جهانی بانک جهانی")}
              </small>
            </article>
          ) : null;
        })}
      </div>
      <div className="analysisGrid">
        <HistoryChart
          locale={locale}
          codes={["WLD"]}
          countries={[world]}
          initialIndicator="growth"
        />
        <section className="insightPanel audiencePanel">
          <h2>{w("Read it through your perspective", "از زاویه خود بخوانید")}</h2>
          <fieldset className="choiceButtons" aria-label={w("Your perspective", "زاویه نگاه شما")}>
            {[
              ["everyday", w("Everyday life", "زندگی روزمره")],
              ["business", w("Business", "کسب‌وکار")],
              ["research", w("Research", "پژوهش")],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={perspective === id}
                onClick={() => setPerspective(id ?? "everyday")}
              >
                {label}
              </button>
            ))}
          </fieldset>
          <h3>{perspectiveCopy[0]}</h3>
          <p>{perspectiveCopy[1]}</p>
          <ul>
            {perspectiveCopy.slice(2).map((id) => {
              const indicator = INDICATORS.find((item) => item.id === id);
              return indicator ? (
                <li key={id}>
                  <Link
                    href={`${publicHref(locale, "compare")}?countries=IR,DE,US&topic=${indicator.topic}`}
                  >
                    {indicatorName(indicator, locale)}
                  </Link>
                </li>
              ) : null;
            })}
          </ul>
          <Link className="primaryAction" href={publicHref(locale, "countries")}>
            {w("Explore a country", "بررسی یک کشور")}
          </Link>
        </section>
      </div>
      <div className="analysisGrid">
        <section className="rankingPanel">
          <div className="sectionHeading">
            <h2>{w("Compare the scale of economies", "اندازه اقتصادها را مقایسه کنید")}</h2>
          </div>
          <label className="dataSelect">
            <span>{w("Order by", "مرتب‌سازی بر پایه")}</span>
            <select value={ranking} onChange={(event) => setRanking(event.target.value)}>
              {["gdp", "population"].map((id) => {
                const indicator = INDICATORS.find((item) => item.id === id);
                return indicator ? (
                  <option key={id} value={id}>
                    {indicatorName(indicator, locale)}
                  </option>
                ) : null;
              })}
            </select>
          </label>
          <p className="sourceNote">
            {rankingYear} · {ranked.length}{" "}
            {w(
              "economies with matching-year data. Size is not wellbeing or investment quality.",
              "اقتصاد با داده هم‌سال. اندازه، رفاه یا کیفیت سرمایه‌گذاری نیست.",
            )}
          </p>
          <ol className="countryRanking">
            {ranked.slice(0, 8).map(({ country, point }) => (
              <li key={country.code}>
                <Link href={`/${locale}/intelligence/countries/${country.code}`}>
                  {displayCountry(country.code, locale)}
                </Link>
                <bdi>
                  {rankingIndicator ? formatValue(point[1] ?? "0", rankingIndicator, locale) : ""}
                </bdi>
              </li>
            ))}
          </ol>
        </section>
        <RelatedResearch locale={locale} />
      </div>
      <section className="economicTopicLinks">
        <h2>{w("Explore six sides of an economy", "شش وجه اقتصاد را بررسی کنید")}</h2>
        <div>
          {ECONOMIC_TOPICS.filter(([id]) => id !== "all").map(([id, en, fa]) => (
            <Link key={id} href={`${publicHref(locale, "compare")}?countries=IR,DE,US&topic=${id}`}>
              <strong>{locale === "fa" ? fa : en}</strong>
              <span>
                {INDICATORS.filter((indicator) => indicator.topic === id).length}{" "}
                {w("indicators with definitions and sources", "شاخص با تعریف و منبع")}
              </span>
              →
            </Link>
          ))}
        </div>
      </section>
      <p className="methodWarning">
        {w(
          "Public reference data includes statistical estimates and later revisions. These pages do not reconstruct what was known in an earlier year or issue calibrated crisis forecasts.",
          "داده مرجع عمومی شامل برآورد آماری و بازنگری بعدی است. این صفحات اطلاعات در دسترس در گذشته را بازسازی نمی‌کنند و پیش‌بینی کالیبره‌شده بحران ارائه نمی‌دهند.",
        )}
      </p>
    </>
  );
}
