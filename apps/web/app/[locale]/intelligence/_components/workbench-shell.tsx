"use client";

import { LOCALE_METADATA, LOCALES, type Locale, translate } from "@economyos/i18n";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { workbenchCopy } from "../_lib/copy";

export function WorkbenchShell({
  locale,
  children,
}: {
  readonly locale: Locale;
  readonly children: ReactNode;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const suffix = pathname.replace(/^\/[A-Za-z-]+/, "");
  const query = search.toString();
  const globalHref = intelligenceHref(locale, "/intelligence/global", query);
  const countriesHref = intelligenceHref(locale, "/intelligence/countries", query);
  const copy = workbenchCopy(locale);
  return (
    <div className="workbenchShell">
      <a className="skipLink" href="#main-content">
        {translate(locale, "a11y.skipToContent")}
      </a>
      <header className="workbenchTopbar">
        <Link className="brand" href={`/${locale}`}>
          <span className="brandMark" aria-hidden="true">
            E
          </span>
          <span>{translate(locale, "app.name")}</span>
          <span className="productMode">{copy.intelligence}</span>
        </Link>
        <nav aria-label={translate(locale, "a11y.language")} className="languageRail">
          <ul className="localeList">
            {LOCALES.map((candidate) => (
              <li key={candidate}>
                <Link
                  href={`${`/${candidate}${suffix}`}${query ? `?${query}` : ""}`}
                  hrefLang={candidate}
                  aria-current={candidate === locale ? "page" : undefined}
                >
                  {LOCALE_METADATA[candidate].nativeName}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <aside
        className="workbenchSidebar sidebar"
        aria-label={translate(locale, "a11y.moduleNavigation")}
      >
        <nav aria-label={translate(locale, "a11y.primary")}>
          <ul>
            <li>
              <Link
                className="moduleLink"
                aria-current={pathname.endsWith("/global") ? "page" : undefined}
                href={globalHref}
                prefetch={false}
              >
                <span className="navIndex" aria-hidden="true">
                  01
                </span>
                {translate(locale, "nav.global")}
              </Link>
            </li>
            <li>
              <Link
                className="moduleLink"
                aria-current={pathname.includes("/countries") ? "page" : undefined}
                href={countriesHref}
                prefetch={false}
              >
                <span className="navIndex" aria-hidden="true">
                  02
                </span>
                {translate(locale, "nav.countries")}
              </Link>
            </li>
            {(["evidence", "models", "scenarios"] as const).map((item, index) => (
              <li key={item}>
                <span className="moduleStatus" aria-disabled="true">
                  <span className="navIndex" aria-hidden="true">
                    0{index + 3}
                  </span>
                  {translate(locale, `nav.${item}`)}
                </span>
              </li>
            ))}
          </ul>
        </nav>
        <p className="sidebarNote">PIT / v1</p>
      </aside>
      {children}
    </div>
  );
}

function intelligenceHref(locale: Locale, suffix: string, query: string): string {
  return `/${locale}${suffix}${query ? `?${query}` : ""}`;
}
