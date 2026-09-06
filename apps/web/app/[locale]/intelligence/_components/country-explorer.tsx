"use client";

import type { Locale } from "@economyos/i18n";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { type PublicView, publicHref, words } from "../_lib/public-copy";
import {
  annualAssociation,
  type CountrySeries,
  comparisonPoints,
  displayCountry,
  ECONOMIC_TOPICS,
  formatValue,
  HEADLINE_IDS,
  INDICATORS,
  indicatorName,
  latestPoint,
  ORDERED_INDICATORS,
  PUBLIC_DATA,
  type YearMode,
} from "../_lib/public-economy";
import { useCountryData } from "../_lib/use-country-data";
import {
  DataLoadState,
  DownloadData,
  HistoryChart,
  IndicatorTable,
  RelatedResearch,
  SourceNote,
  YearSelect,
} from "./economic-data-display";

const popular = ["IR", "DE", "US", "CN", "GB", "FR", "TR", "JP", "CA", "BR", "SA", "IN"];

export function CountryExplorer({
  locale,
  view,
  countryCode,
}: {
  locale: Locale;
  view: PublicView;
  countryCode?: string;
}) {
  if (view === "compare") return <CountryComparison locale={locale} />;
  if (view === "country") return <CountryProfile locale={locale} countryCode={countryCode ?? ""} />;
  return <CountryDirectory locale={locale} />;
}

function CountryOptions({ locale, excluded = [] }: { locale: Locale; excluded?: string[] }) {
  return [...PUBLIC_DATA.countries]
    .sort(
      (a, b) =>
        (PUBLIC_DATA.countryOrder[locale]?.indexOf(a.code) ?? 0) -
        (PUBLIC_DATA.countryOrder[locale]?.indexOf(b.code) ?? 0),
    )
    .map((country) => (
      <option key={country.code} value={country.code} disabled={excluded.includes(country.code)}>
        {displayCountry(country.code, locale)}
      </option>
    ));
}

function TopicSelect({
  locale,
  value,
  onChange,
}: {
  locale: Locale;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="dataSelect">
      <span>{words(locale, "Economic topic", "موضوع اقتصادی")}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="headline">{words(locale, "Key measures", "شاخص‌های اصلی")}</option>
        {ECONOMIC_TOPICS.map(([id, en, fa]) => (
          <option key={id} value={id}>
            {locale === "fa" ? fa : en}
          </option>
        ))}
      </select>
    </label>
  );
}

function filteredIndicators(topic: string) {
  return ORDERED_INDICATORS.filter(
    (indicator) =>
      topic === "all" ||
      (topic === "headline" ? HEADLINE_IDS.includes(indicator.id) : indicator.topic === topic),
  );
}

function CountryDirectory({ locale }: { locale: Locale }) {
  const [region, setRegion] = useState("all");
  const [income, setIncome] = useState("all");
  const [page, setPage] = useState(0);
  const w = (en: string, fa: string) => words(locale, en, fa);
  const countries = [...PUBLIC_DATA.countries]
    .filter(
      (country) =>
        (region === "all" || country.region === region) &&
        (income === "all" || country.income === income),
    )
    .sort((a, b) => {
      const rank = (code: string) =>
        popular.includes(code) ? popular.indexOf(code) : popular.length;
      return (
        rank(a.code) - rank(b.code) ||
        (PUBLIC_DATA.countryOrder[locale]?.indexOf(a.code) ?? 0) -
          (PUBLIC_DATA.countryOrder[locale]?.indexOf(b.code) ?? 0)
      );
    });
  const pageCount = Math.max(1, Math.ceil(countries.length / 24));
  return (
    <>
      <header className="publicHeader dataHeader">
        <h1>{w("Every economy, in context.", "هر اقتصاد، در زمینه خود.")}</h1>
        <p>
          {w(
            "Explore published indicators, historical trends and plain-language analysis across",
            "شاخص‌های منتشرشده، روند تاریخی و تحلیل ساده را در",
          )}{" "}
          {new Intl.NumberFormat(locale).format(PUBLIC_DATA.countries.length)}{" "}
          {w("economies.", "اقتصاد بررسی کنید.")}
        </p>
      </header>
      <SourceNote locale={locale} />
      <div className="dataToolbar directoryFilters">
        <label className="dataSelect">
          <span>{w("Region", "منطقه")}</span>
          <select
            value={region}
            onChange={(event) => {
              setRegion(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">{w("All regions", "همه مناطق")}</option>
            {[...new Set(PUBLIC_DATA.countries.map((country) => country.region))]
              .sort()
              .map((item) => (
                <option key={item} value={item}>
                  {regionLabel(item, locale)}
                </option>
              ))}
          </select>
        </label>
        <label className="dataSelect">
          <span>{w("Income group", "گروه درآمدی")}</span>
          <select
            value={income}
            onChange={(event) => {
              setIncome(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">{w("All income groups", "همه گروه‌های درآمدی")}</option>
            {[...new Set(PUBLIC_DATA.countries.map((country) => country.income))]
              .sort()
              .map((item) => (
                <option key={item} value={item}>
                  {incomeLabel(item, locale)}
                </option>
              ))}
          </select>
        </label>
        <Link className="primaryAction" href={publicHref(locale, "compare")}>
          {w("Compare economies", "مقایسه اقتصادها")}
        </Link>
      </div>
      <p className="resultCount" aria-live="polite">
        {new Intl.NumberFormat(locale).format(countries.length)} {w("economies", "اقتصاد")} ·{" "}
        {w("Page", "صفحه")} {new Intl.NumberFormat(locale).format(page + 1)} /{" "}
        {new Intl.NumberFormat(locale).format(pageCount)}
      </p>
      <div className="economyDirectory">
        {countries.slice(page * 24, (page + 1) * 24).map((country) => (
          <article key={country.code} className="economyTile">
            <h2>
              <Link href={`/${locale}/intelligence/countries/${country.code}`}>
                {displayCountry(country.code, locale)}
              </Link>
            </h2>
            <p>
              {regionLabel(country.region, locale)} · {incomeLabel(country.income, locale)}
            </p>
            <dl>
              {["growth", "inflation"].map((id) => {
                const point = PUBLIC_DATA.highlights[country.code]?.[id];
                const indicator = INDICATORS.find((item) => item.id === id);
                if (!indicator) return null;
                return (
                  <div key={id}>
                    <dt>{indicatorName(indicator, locale)}</dt>
                    <dd>
                      {point?.[1] !== null && point?.[1] !== undefined ? (
                        <>
                          <bdi>{formatValue(point[1], indicator, locale)}</bdi>{" "}
                          <small>{point[0]}</small>
                        </>
                      ) : (
                        w("Not reported", "گزارش نشده")
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <Link
              className="countryReadMore"
              href={`/${locale}/intelligence/countries/${country.code}`}
            >
              {w("Open the economic profile", "دیدن نمایه اقتصادی")} →
            </Link>
          </article>
        ))}
      </div>
      <div className="dataPagination">
        <button
          type="button"
          className="secondaryAction"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          {w("Previous economies", "اقتصادهای قبلی")}
        </button>
        <button
          type="button"
          className="secondaryAction"
          disabled={page + 1 >= pageCount}
          onClick={() => setPage(page + 1)}
        >
          {w("More economies", "اقتصادهای بیشتر")}
        </button>
      </div>
    </>
  );
}

export function regionLabel(value: string, locale: Locale): string {
  const fa: Record<string, string> = {
    "East Asia & Pacific": "شرق آسیا و اقیانوس آرام",
    "Europe & Central Asia": "اروپا و آسیای مرکزی",
    "Latin America & Caribbean": "آمریکای لاتین و کارائیب",
    "Middle East, North Africa, Afghanistan & Pakistan":
      "خاورمیانه، شمال آفریقا، افغانستان و پاکستان",
    "Middle East & North Africa": "خاورمیانه و شمال آفریقا",
    "North America": "آمریکای شمالی",
    "South Asia": "جنوب آسیا",
    "Sub-Saharan Africa": "آفریقای جنوب صحرا",
  };
  return locale === "fa" ? (fa[value] ?? value) : value;
}
export function incomeLabel(value: string, locale: Locale): string {
  const fa: Record<string, string> = {
    "High income": "درآمد بالا",
    "Upper middle income": "درآمد متوسط رو به بالا",
    "Lower middle income": "درآمد متوسط رو به پایین",
    "Low income": "درآمد پایین",
    "Not classified": "طبقه‌بندی نشده",
  };
  return locale === "fa" ? (fa[value] ?? value) : value;
}

function CountryComparison({ locale }: { locale: Locale }) {
  const search = useSearchParams();
  const w = (en: string, fa: string) => words(locale, en, fa);
  const raw = search.has("countries") ? (search.get("countries") ?? "") : "IR,DE,US";
  const codes = [
    ...new Set(
      raw
        .split(",")
        .filter((code) => PUBLIC_DATA.countries.some((country) => country.code === code)),
    ),
  ].slice(0, 4);
  const requestedTopic = search.get("topic");
  const topic = ECONOMIC_TOPICS.some(([id]) => id === requestedTopic)
    ? (requestedTopic ?? "headline")
    : "headline";
  const requestedYear = search.get("year");
  const mode: YearMode =
    requestedYear === "latest" ||
    (requestedYear &&
      /^\d{4}$/.test(requestedYear) &&
      Number(requestedYear) >= PUBLIC_DATA.startYear &&
      Number(requestedYear) <= PUBLIC_DATA.endYear)
      ? (requestedYear as YearMode)
      : "common";
  const load = useCountryData(codes);
  const countries = codes.map((code) => load.data[code]);
  const indicators = filteredIndicators(topic);
  const setSelection = (next: string[], nextMode = mode, nextTopic = topic) => {
    const params = new URLSearchParams({
      countries: next.join(","),
      year: nextMode,
      topic: nextTopic,
    });
    window.history.replaceState(null, "", `${publicHref(locale, "compare")}?${params}`);
  };
  return (
    <>
      <header className="publicHeader dataHeader">
        <h1>{w("Compare economies", "مقایسه اقتصادها")}</h1>
        <p>
          {w(
            "Real indicators, shared years, and the evidence behind each difference.",
            "شاخص واقعی، سال مشترک و شواهد پشت هر تفاوت.",
          )}
        </p>
      </header>
      <section
        className="comparisonControls"
        aria-label={w("Choose countries to compare", "انتخاب کشور برای مقایسه")}
      >
        <div className="countrySelectors">
          {codes.map((code, index) => (
            <div className="countrySelection" key={["first", "second", "third", "fourth"][index]}>
              <label className="dataSelect">
                <span>
                  {w("Country", "کشور")} {index + 1}
                </span>
                <select
                  value={code}
                  onChange={(event) =>
                    setSelection(
                      codes.map((item, candidate) =>
                        candidate === index ? event.target.value : item,
                      ),
                    )
                  }
                >
                  <CountryOptions
                    locale={locale}
                    excluded={codes.filter((item) => item !== code)}
                  />
                </select>
              </label>
              <button
                type="button"
                className="textAction removeCountry"
                onClick={() => setSelection(codes.filter((_, candidate) => candidate !== index))}
                aria-label={`${w("Remove", "حذف")} ${displayCountry(code, locale)}`}
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="secondaryAction"
            type="button"
            disabled={codes.length >= 4}
            onClick={() => {
              const next = popular.find((code) => !codes.includes(code));
              if (next) setSelection([...codes, next]);
            }}
          >
            {w("Add country", "افزودن کشور")}
          </button>
        </div>
        <div className="dataToolbar">
          <TopicSelect
            locale={locale}
            value={topic}
            onChange={(next) => setSelection(codes, mode, next)}
          />
          <YearSelect locale={locale} value={mode} onChange={(next) => setSelection(codes, next)} />
          <DownloadData
            locale={locale}
            codes={codes}
            countries={countries}
            indicators={indicators}
            mode={mode}
          />
        </div>
        <div className="comparisonPresets">
          <span>{w("Quick comparisons", "مقایسه آماده")}:</span>
          {[
            ["IR", "DE", "US"],
            ["US", "CN", "DE", "JP"],
            ["IR", "TR", "SA", "AE"],
          ].map((preset) => (
            <button type="button" key={preset.join()} onClick={() => setSelection(preset)}>
              {preset.map((code) => displayCountry(code, locale)).join(" · ")}
            </button>
          ))}
        </div>
        <SourceNote locale={locale} />
      </section>
      <DataLoadState locale={locale} {...load} />
      {codes.length < 2 ? (
        <div className="gentleState" role="status">
          <h2>{w("Choose at least two countries", "حداقل دو کشور انتخاب کنید")}</h2>
          <p>
            {w(
              "Use Add country, then select a name. No identifiers or typed numbers are needed.",
              "کشور را اضافه و نام را انتخاب کنید؛ به شناسه یا تایپ عدد نیاز نیست.",
            )}
          </p>
        </div>
      ) : (
        <>
          <p className="comparisonMethod">
            {mode === "common"
              ? w(
                  "Each row uses the most recent year reported by every selected country. Different rows may use different years.",
                  "هر ردیف آخرین سال گزارش‌شده مشترک همه کشورهای انتخابی را نشان می‌دهد. سال ردیف‌ها ممکن است متفاوت باشد.",
                )
              : mode === "latest"
                ? w(
                    "Each country uses its latest reported value. Years may differ; treat differences as descriptive, not a same-year ranking.",
                    "هر کشور آخرین مقدار گزارش‌شده خود را دارد. سال‌ها ممکن است متفاوت باشند؛ تفاوت توصیفی است، نه رتبه‌بندی هم‌سال.",
                  )
                : w(
                    "Every value is from the selected year. Unreported observations remain explicitly missing.",
                    "همه مقادیر متعلق به سال انتخابی‌اند. مشاهده گزارش‌نشده صریحاً مشخص است.",
                  )}
          </p>
          <IndicatorTable
            locale={locale}
            codes={codes}
            countries={countries}
            indicators={indicators}
            mode={mode}
            loading={load.loading}
          />
          <div className="analysisGrid">
            <HistoryChart locale={locale} codes={codes} countries={countries} />
            <ComparisonInsight locale={locale} codes={codes} countries={countries} mode={mode} />
          </div>
          <RelatedResearch locale={locale} />
        </>
      )}
    </>
  );
}

function ComparisonInsight({
  locale,
  codes,
  countries,
  mode,
}: {
  locale: Locale;
  codes: string[];
  countries: (CountrySeries | undefined)[];
  mode: YearMode;
}) {
  const w = (en: string, fa: string) => words(locale, en, fa);
  const [metric, setMetric] = useState("inflation");
  const indicator = INDICATORS.find((item) => item.id === metric);
  if (!indicator) return null;
  const points = comparisonPoints(countries, indicator, mode);
  const [left, right] = points;
  const comparable =
    left?.[1] !== null &&
    left?.[1] !== undefined &&
    right?.[1] !== null &&
    right?.[1] !== undefined &&
    left[0] === right[0];
  const gap = comparable ? Number(left[1]) - Number(right[1]) : null;
  return (
    <aside className="insightPanel" aria-label={w("Indicator interpretation", "تفسیر شاخص")}>
      <h2>{w("Read the difference", "تفاوت را بخوانید")}</h2>
      <label className="dataSelect">
        <span>{w("Compare a rate", "مقایسه یک نرخ")}</span>
        <select value={metric} onChange={(event) => setMetric(event.target.value)}>
          {INDICATORS.filter(
            (item) => item.countryComparable && item.unit.startsWith("percent"),
          ).map((item) => (
            <option key={item.id} value={item.id}>
              {indicatorName(item, locale)}
            </option>
          ))}
        </select>
      </label>
      {gap !== null ? (
        <>
          <p>
            {displayCountry(codes[0] ?? "IR", locale)} · {displayCountry(codes[1] ?? "DE", locale)}{" "}
            · {left?.[0]}
          </p>
          <bdi className="insightNumber">
            {new Intl.NumberFormat(locale, {
              maximumFractionDigits: 2,
              signDisplay: "always",
            }).format(gap)}
          </bdi>
          <p>
            {w(
              "percentage points: first country minus second.",
              "واحد درصد: کشور اول منهای کشور دوم.",
            )}
          </p>
          <p>
            {w(
              "This compares the recorded rates. It does not explain the causes or say which economy is better overall.",
              "این مقایسه نرخ ثبت‌شده است؛ علت یا بهتر بودن کل اقتصاد را مشخص نمی‌کند.",
            )}
          </p>
        </>
      ) : (
        <p>
          {w(
            "A same-year pair is needed for this calculation. Choose a shared year or another measure.",
            "برای این محاسبه به دو مقدار هم‌سال نیاز است. سال مشترک یا شاخص دیگر انتخاب کنید.",
          )}
        </p>
      )}
    </aside>
  );
}

function CountryProfile({ locale, countryCode }: { locale: Locale; countryCode: string }) {
  const country = PUBLIC_DATA.countries.find(
    (item) => item.code === countryCode.toUpperCase() || item.iso3 === countryCode.toUpperCase(),
  );
  const code = country?.code ?? "";
  const load = useCountryData(code ? [code] : []);
  const [mode, setMode] = useState<YearMode>("latest");
  const [topic, setTopic] = useState("headline");
  const snapshot = load.data[code];
  const w = (en: string, fa: string) => words(locale, en, fa);
  if (!country)
    return (
      <div className="gentleState">
        <h1>{w("Choose an available economy", "یک اقتصاد موجود را انتخاب کنید")}</h1>
        <Link href={publicHref(locale, "countries")}>
          {w("Browse the country directory", "دیدن فهرست کشورها")}
        </Link>
      </div>
    );
  const year = mode === "latest" ? PUBLIC_DATA.endYear : Number(mode);
  const indicators = filteredIndicators(topic);
  return (
    <>
      <header className="publicHeader dataHeader">
        <h1>{displayCountry(code, locale)}</h1>
        <p>
          {regionLabel(country.region, locale)} · {incomeLabel(country.income, locale)}
        </p>
      </header>
      <div className="dataToolbar">
        <label className="dataSelect">
          <span>{w("Economy", "اقتصاد")}</span>
          <select
            value={code}
            onChange={(event) => {
              window.location.href = `/${locale}/intelligence/countries/${event.target.value}`;
            }}
          >
            <CountryOptions locale={locale} />
          </select>
        </label>
        <YearSelect locale={locale} value={mode} onChange={setMode} single />
        <Link
          className="primaryAction"
          href={`${publicHref(locale, "compare")}?countries=${code},${code === "US" ? "DE" : "US"}`}
        >
          {w("Compare this economy", "مقایسه این اقتصاد")}
        </Link>
      </div>
      <SourceNote locale={locale} />
      <DataLoadState locale={locale} {...load} />
      <div className="economicFacts">
        {["growth", "inflation", "unemployment", "population"].map((id) => {
          const indicator = INDICATORS.find((item) => item.id === id);
          if (!indicator) return null;
          const point = comparisonPoints([snapshot], indicator, mode)[0];
          return (
            <article key={id}>
              <h2>{indicatorName(indicator, locale)}</h2>
              <bdi>
                {point?.[1] !== null && point?.[1] !== undefined
                  ? formatValue(point[1], indicator, locale)
                  : load.loading
                    ? "…"
                    : w("Not reported", "گزارش نشده")}
              </bdi>
              <small>
                {point?.[0]} {indicator.sourceEstimate ? w("· ILO estimate", "· برآورد ILO") : ""}
              </small>
            </article>
          );
        })}
      </div>
      <div className="analysisGrid">
        <HistoryChart locale={locale} codes={[code]} countries={[snapshot]} />
        <CountryInterpretation locale={locale} country={snapshot} before={year} />
      </div>
      <div className="dataToolbar">
        <h2>{w("Explore the full economic picture", "تصویر کامل اقتصاد را بررسی کنید")}</h2>
        <TopicSelect locale={locale} value={topic} onChange={setTopic} />
        <DownloadData
          locale={locale}
          codes={[code]}
          countries={[snapshot]}
          indicators={indicators}
          mode={mode}
        />
      </div>
      <IndicatorTable
        locale={locale}
        codes={[code]}
        countries={[snapshot]}
        indicators={indicators}
        mode={mode}
        loading={load.loading}
      />
      <div className="analysisGrid">
        <AssociationPanel locale={locale} country={snapshot} />
        <RelatedResearch locale={locale} />
      </div>
    </>
  );
}

function CountryInterpretation({
  locale,
  country,
  before,
}: {
  locale: Locale;
  country: CountrySeries | undefined;
  before: number;
}) {
  const w = (en: string, fa: string) => words(locale, en, fa);
  const inflation = latestPoint(country?.series.inflation, before);
  const growth = latestPoint(country?.series.growth, before);
  const current = latestPoint(country?.series["current-account"], before);
  const index = country?.series["price-index"] ?? [];
  const lastIndex = latestPoint(index, before);
  const base = index.find(([year, value]) => year === 2015 && value !== null);
  const purchasing =
    base?.[1] && lastIndex?.[1] && lastIndex[0] > 2015 && Number(lastIndex[1]) > 0
      ? (100 * Number(base[1])) / Number(lastIndex[1])
      : null;
  const percent = (value: string) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(value));
  return (
    <aside className="insightPanel" aria-label={w("Indicator interpretation", "تفسیر شاخص")}>
      <h2>{w("What these numbers mean", "این اعداد چه معنایی دارند")}</h2>
      <ul className="plainInsights">
        {growth?.[1] ? (
          <li>
            <strong>
              {w("Output", "تولید")} · {growth[0]}
            </strong>
            <p>
              {Number(growth[1]) >= 0
                ? w("Real output grew by", "تولید واقعی رشد کرد:")
                : w("Real output contracted by", "تولید واقعی کاهش یافت:")}{" "}
              {percent(String(Math.abs(Number(growth[1]))))}%.{" "}
              {w(
                "This does not show how gains or losses were shared.",
                "این عدد توزیع سود یا زیان را نشان نمی‌دهد.",
              )}
            </p>
          </li>
        ) : null}
        {inflation?.[1] ? (
          <li>
            <strong>
              {w("Prices", "قیمت‌ها")} · {inflation[0]}
            </strong>
            <p>
              {Number(inflation[1]) >= 0
                ? w("Consumer prices rose by", "قیمت مصرف‌کننده افزایش یافت:")
                : w("Consumer prices fell by", "قیمت مصرف‌کننده کاهش یافت:")}{" "}
              {percent(String(Math.abs(Number(inflation[1]))))}%.{" "}
              {w(
                "Your personal basket may change differently.",
                "سبد شخصی شما ممکن است متفاوت تغییر کند.",
              )}
            </p>
          </li>
        ) : null}
        {current?.[1] ? (
          <li>
            <strong>
              {w("External balance", "تراز خارجی")} · {current[0]}
              {before - current[0] > 4 ? w(" · older observation", " · مشاهده قدیمی") : ""}
            </strong>
            <p>
              {w("The current account was", "حساب جاری برابر بود با")} {percent(current[1])}%{" "}
              {w(
                "of GDP. Financing terms and accessible reserves matter for resilience.",
                "تولید. شرایط تأمین مالی و ذخایر قابل دسترس برای تاب‌آوری مهم‌اند.",
              )}
            </p>
          </li>
        ) : null}
        {purchasing !== null ? (
          <li>
            <strong>{w("Purchasing power since 2015", "قدرت خرید نسبت به ۲۰۱۵")}</strong>
            <p>
              {w(
                "An unchanged amount of 100 has the purchasing power of approximately",
                "مبلغ ثابت ۱۰۰ تقریباً قدرت خریدی برابر دارد با",
              )}{" "}
              <bdi>{percent(String(purchasing))}</bdi>{" "}
              {w("in 2015 prices by", "به قیمت ۲۰۱۵، در سال")} {lastIndex?.[0]}.{" "}
              {w(
                "Derived from the CPI ratio; assumes no interest or income change.",
                "محاسبه از نسبت شاخص قیمت؛ با فرض نبود بهره یا تغییر درآمد.",
              )}
            </p>
          </li>
        ) : null}
      </ul>
      <p className="sourceNote">
        {w(
          "Descriptive calculations from published series; no causal or forecast claim. Each statement uses the year shown.",
          "محاسبه توصیفی از سری منتشرشده، بدون ادعای علّی یا پیش‌بینی. هر جمله سال مشخص خود را دارد.",
        )}
      </p>
    </aside>
  );
}

function AssociationPanel({
  locale,
  country,
}: {
  locale: Locale;
  country: CountrySeries | undefined;
}) {
  const [left, setLeft] = useState("growth");
  const [right, setRight] = useState("inflation");
  const result = annualAssociation(country?.series[left] ?? [], country?.series[right] ?? []);
  const options = INDICATORS.filter((indicator) =>
    [
      "growth",
      "inflation",
      "person-growth",
      "money-growth",
      "unemployment",
      "investment",
      "current-account",
    ].includes(indicator.id),
  );
  const w = (en: string, fa: string) => words(locale, en, fa);
  return (
    <section className="associationPanel">
      <h2>{w("Do these indicators move together?", "آیا این شاخص‌ها با هم حرکت می‌کنند؟")}</h2>
      <div className="dataToolbar">
        {[
          { value: left, set: setLeft, label: w("First indicator", "شاخص اول") },
          { value: right, set: setRight, label: w("Second indicator", "شاخص دوم") },
        ].map((control) => (
          <label className="dataSelect" key={control.label}>
            <span>{control.label}</span>
            <select value={control.value} onChange={(event) => control.set(event.target.value)}>
              {options.map((item) => (
                <option key={item.id} value={item.id}>
                  {indicatorName(item, locale)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {result ? (
        <>
          <bdi className="associationNumber">
            {new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(result.correlation)}
          </bdi>
          <p>
            {w("Historical correlation across", "همبستگی تاریخی در")} {result.count}{" "}
            {w("matched annual observations", "مشاهده سالانه هم‌زمان")} ({result.from}–{result.to}).
          </p>
        </>
      ) : (
        <p>
          {w(
            "At least eight matched years and variation in both series are needed.",
            "حداقل هشت سال مشترک و تغییرپذیری در هر دو سری لازم است.",
          )}
        </p>
      )}
      <p>
        {w(
          "+1 means moving together, −1 means opposite movement, and 0 means no linear association. Correlation does not establish causation; cycles, time trends and omitted variables can affect it.",
          "۱+ حرکت هم‌جهت، ۱− حرکت خلاف جهت و صفر نبود رابطه خطی است. همبستگی علیت را ثابت نمی‌کند؛ چرخه، روند زمانی و متغیر حذف‌شده مؤثرند.",
        )}
      </p>
      <details>
        <summary>{w("Method", "روش")}</summary>
        <p>
          {w(
            "Pearson correlation, using only years reported in both series. No interpolation, lag search, causal inference or statistical-significance claim.",
            "همبستگی پیرسون فقط برای سال‌های گزارش‌شده در هر دو سری؛ بدون درون‌یابی، جست‌وجوی وقفه، استنباط علّی یا ادعای معناداری آماری.",
          )}
        </p>
      </details>
    </section>
  );
}
