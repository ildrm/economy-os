"use client";

import { LOCALE_METADATA, LOCALES, type Locale, translate } from "@economyos/i18n";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { contextParams, validateContext } from "../_lib/intelligence";
import { PUBLIC_NAV, publicHref, publicLanguage, publicNavLabel, words } from "../_lib/public-copy";

export function WorkbenchShell({
  locale,
  children,
}: {
  readonly locale: Locale;
  readonly children: ReactNode;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const suffix = pathname.replace(/^\/[A-Za-z-]+/, "");
  const query = search.toString();
  const context = validateContext(search).context;
  const advanced = search.get("advanced") === "1";
  const current = pathname.includes("/countries")
    ? "countries"
    : pathname.endsWith("/compare")
      ? "compare"
      : pathname.endsWith("/science")
        ? "science"
        : pathname.endsWith("/research")
          ? "lab"
          : (search.get("view") ?? "overview");
  return (
    <div className="workbenchShell publicShell">
      <a className="skipLink" href="#main-content">
        {translate(locale, "a11y.skipToContent")}
      </a>
      <header className="workbenchTopbar">
        <Link className="brand" href={`/${locale}`}>
          <span className="brandMark" aria-hidden="true">
            E
          </span>
          <span>EconomyOS</span>
        </Link>
        <span className="brandPromise" lang={publicLanguage(locale)}>
          {words(locale, "Economics, made understandable", "اقتصاد، به زبان قابل فهم")}
        </span>
        <label className="languageSelect">
          <span className="srOnly">{translate(locale, "a11y.language")}</span>
          <select
            value={locale}
            onChange={(event) =>
              router.push(`/${event.target.value}${suffix}${query ? `?${query}` : ""}`)
            }
          >
            {LOCALES.map((candidate) => (
              <option key={candidate} value={candidate} lang={candidate}>
                {LOCALE_METADATA[candidate].nativeName}
              </option>
            ))}
          </select>
        </label>
      </header>
      <aside
        className="workbenchSidebar sidebar"
        aria-label={translate(locale, "a11y.moduleNavigation")}
      >
        <nav aria-label={translate(locale, "a11y.primary")}>
          <ul>
            {PUBLIC_NAV.map((view) => (
              <li key={view}>
                <Link
                  className="moduleLink"
                  href={
                    context && ["overview", "countries", "compare"].includes(view)
                      ? `${publicHref(locale, view)}?${contextParams(context)}`
                      : publicHref(locale, view)
                  }
                  aria-current={current === view && !advanced ? "page" : undefined}
                  prefetch={false}
                >
                  {publicNavLabel(locale, view)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebarResearch" lang={publicLanguage(locale)}>
          <p>{words(locale, "For deeper analysis", "برای تحلیل عمیق‌تر")}</p>
          <Link
            className="moduleLink"
            aria-current={advanced ? "page" : undefined}
            href={`/${locale}/intelligence/research?advanced=1`}
            prefetch={false}
          >
            {words(locale, "Research workspace", "فضای پژوهش")}
          </Link>
        </div>
      </aside>
      {children}
    </div>
  );
}
