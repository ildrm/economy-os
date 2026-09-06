"use client";

import type { Locale } from "@economyos/i18n";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type PublicView, publicHref, publicLanguage, words } from "../_lib/public-copy";
import { ConceptExplorer } from "./concept-explorer";
import { CountryExplorer } from "./country-explorer";
import { SourceNote } from "./economic-data-display";
import { EconomyOverview } from "./economy-overview";
import { SourcesGuide } from "./sources-guide";

export function PublicExperience({
  locale,
  view = "overview",
  countryCode,
}: {
  locale: Locale;
  view?: PublicView;
  countryCode?: string;
}) {
  const search = useSearchParams();
  const w = (en: string, fa: string) => words(locale, en, fa);
  const selectedView =
    view === "overview" && search.get("view") === "concepts"
      ? "concepts"
      : view === "overview" && search.get("view") === "sources"
        ? "sources"
        : view;
  return (
    <main
      id="main-content"
      className="intelligenceMain publicMain"
      tabIndex={-1}
      lang={publicLanguage(locale)}
      dir={locale === "fa" ? "rtl" : "ltr"}
    >
      {locale !== "en" && locale !== "fa" ? (
        <p className="translationNote" lang="en">
          Navigation is localized. Public data explanations and learning guides are currently
          available in English and Persian.
        </p>
      ) : null}
      {selectedView === "overview" ? (
        <EconomyOverview locale={locale} />
      ) : selectedView === "concepts" ? (
        <ConceptExplorer locale={locale} />
      ) : selectedView === "sources" ? (
        <SourcesGuide locale={locale} />
      ) : (
        <CountryExplorer
          locale={locale}
          view={selectedView}
          {...(countryCode ? { countryCode } : {})}
        />
      )}
      <footer className="publicFooter">
        <span>EconomyOS</span>
        <p>
          {w(
            "Understand the evidence. Explore the possibilities.",
            "شواهد را بشناسید. امکان‌ها را بررسی کنید.",
          )}
        </p>
        <Link href={publicHref(locale, "sources")}>
          {w("How to read this platform", "راهنمای خواندن اطلاعات")}
        </Link>
      </footer>
    </main>
  );
}

export function DataNotice({ locale }: { locale: Locale }) {
  return <SourceNote locale={locale} />;
}

export function EvidenceLegend({ locale }: { locale: Locale }) {
  const w = (en: string, fa: string) => words(locale, en, fa);
  return (
    <ul className="evidenceLegend" aria-label={w("Types of information", "انواع اطلاعات")}>
      {[
        [
          "reported",
          w("Reported data", "داده گزارش‌شده"),
          w("A published observation with a source and date.", "مشاهده منتشرشده با منبع و تاریخ."),
        ],
        [
          "estimate",
          w("Model estimate", "برآورد مدل"),
          w(
            "A calculation that depends on evidence and assumptions.",
            "محاسبه وابسته به شواهد و فرض‌ها.",
          ),
        ],
        [
          "scenario",
          w("What-if example", "مثال فرضی"),
          w("An illustrative scenario to build understanding.", "سناریویی آموزشی برای درک بهتر."),
        ],
        [
          "missing",
          w("Not enough evidence", "شواهد ناکافی"),
          w(
            "No supported conclusion; not a zero or a safe signal.",
            "نتیجه قابل اتکا نداریم؛ نه صفر و نه علامت امنیت.",
          ),
        ],
      ].map(([kind, name, description]) => (
        <li key={kind}>
          <span className={`evidenceDot ${kind}`} aria-hidden="true" />
          <div>
            <strong>{name}</strong>
            <p>{description}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
