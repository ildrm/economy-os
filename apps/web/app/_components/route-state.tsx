"use client";

import { LOCALE_METADATA, type Locale, translate } from "@economyos/i18n";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getRouteStateCopy, resolveRouteLocale } from "../_lib/release";

export type RouteStateKind = "not-found" | "error" | "loading";

export function LocalizedRouteState({
  kind,
  onRetry,
  embedded = false,
}: {
  readonly kind: RouteStateKind;
  readonly onRetry?: () => void;
  readonly embedded?: boolean;
}) {
  const params = useParams<{ locale?: string | string[] }>();
  return (
    <RouteState
      locale={resolveRouteLocale(params.locale)}
      kind={kind}
      embedded={embedded}
      {...(onRetry ? { onRetry } : {})}
    />
  );
}

export function RouteState({
  locale,
  kind,
  onRetry,
  embedded = false,
}: {
  readonly locale: Locale;
  readonly kind: RouteStateKind;
  readonly onRetry?: () => void;
  readonly embedded?: boolean;
}) {
  const copy = getRouteStateCopy(locale);
  const title =
    kind === "not-found"
      ? copy.notFoundTitle
      : kind === "error"
        ? copy.errorTitle
        : copy.loadingTitle;
  const detail =
    kind === "not-found"
      ? copy.notFoundDetail
      : kind === "error"
        ? copy.errorDetail
        : copy.loadingDetail;
  const stateCode = kind === "not-found" ? "404" : kind === "error" ? "500" : "PIT";
  const announcement =
    kind === "loading"
      ? ({ role: "status", "aria-live": "polite", "aria-busy": true } as const)
      : kind === "error"
        ? ({ role: "alert" } as const)
        : {};
  const titleId = embedded ? "intelligence-route-state-title" : "route-state-title";
  const panel = (
    <section className="routeStatePanel" aria-labelledby={titleId} {...announcement}>
      <span className="routeStateCode" aria-hidden="true">
        {stateCode}
      </span>
      <div className="routeStateMessage">
        <p className="eyebrow">{copy.workspace}</p>
        <h1 id={titleId}>{title}</h1>
        <p className="lede">{detail}</p>
        {kind === "loading" ? (
          <span className="routeStateProgress" aria-hidden="true">
            <span />
          </span>
        ) : (
          <div className="routeStateActions">
            {kind === "error" && onRetry ? (
              <button
                className="routeStateAction routeStateActionPrimary"
                type="button"
                onClick={onRetry}
              >
                {copy.retryAction}
              </button>
            ) : null}
            <Link className="routeStateAction" href={`/${locale}`}>
              {copy.homeAction}
            </Link>
          </div>
        )}
      </div>
    </section>
  );

  if (embedded) {
    return (
      <main
        id="main-content"
        className={`routeStateMain routeStateEmbedded routeState-${kind}`}
        lang={locale}
        dir={LOCALE_METADATA[locale].direction}
        tabIndex={-1}
      >
        {panel}
      </main>
    );
  }

  return (
    <div
      className={`routeStateShell routeState-${kind}`}
      lang={locale}
      dir={LOCALE_METADATA[locale].direction}
    >
      <a className="skipLink" href="#route-state-content">
        {translate(locale, "a11y.skipToContent")}
      </a>
      <header className="routeStateTopbar">
        <Link className="brand" href={`/${locale}`}>
          <span className="brandMark" aria-hidden="true">
            E
          </span>
          <span>{translate(locale, "app.name")}</span>
        </Link>
        <span className="routeStateMode">{copy.workspace}</span>
      </header>
      <main id="route-state-content" className="routeStateMain" tabIndex={-1}>
        {panel}
      </main>
    </div>
  );
}
