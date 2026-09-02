import { isLocale, LOCALE_METADATA, LOCALES, translate } from "@economyos/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function FoundationPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const nav = ["global", "countries", "evidence", "models", "scenarios"] as const;
  return (
    <div className="shell">
      <a className="skipLink" href="#main-content">
        {translate(locale, "a11y.skipToContent")}
      </a>
      <header className="topbar">
        <Link className="brand" href={`/${locale}`}>
          <span className="brandMark" aria-hidden="true">
            E
          </span>
          <span>{translate(locale, "app.name")}</span>
        </Link>
        <nav aria-label={translate(locale, "a11y.language")}>
          <ul className="localeList">
            {LOCALES.map((candidate) => (
              <li key={candidate}>
                <Link
                  href={`/${candidate}`}
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
      <aside className="sidebar" aria-label={translate(locale, "a11y.moduleNavigation")}>
        <nav aria-label={translate(locale, "a11y.primary")}>
          <ul>
            {nav.map((item) => (
              <li key={item}>
                {item === "global" || item === "countries" ? (
                  <Link
                    className="moduleLink"
                    href={`/${locale}/intelligence/${item === "global" ? "global" : "countries"}`}
                  >
                    {translate(locale, `nav.${item}`)}
                  </Link>
                ) : (
                  <span className="moduleStatus" aria-disabled="true">
                    {translate(locale, `nav.${item}`)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main id="main-content" tabIndex={-1}>
        <p className="eyebrow">{translate(locale, "status.foundation")}</p>
        <h1>{translate(locale, "app.tagline")}</h1>
        <p className="lede">{translate(locale, "status.lede")}</p>
        <section id="module-status" className="evidenceCard" aria-labelledby="evidence-title">
          <div>
            <p className="label">{translate(locale, "time.knownAt")}</p>
            <p id="evidence-title" className="value">
              —
            </p>
          </div>
          <p className="unknown">{translate(locale, "status.unknown")}</p>
        </section>
      </main>
    </div>
  );
}
