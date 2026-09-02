"use client";

import type { Locale } from "@economyos/i18n";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ContextSummary,
  EmptyState,
  FailureState,
  LoadingState,
  SetupState,
  TemporalLens,
} from "../../_components/context-panel";
import { PageHeader } from "../../_components/page-header";
import { workbenchCopy, workbenchDimension } from "../../_lib/copy";
import {
  contextParams,
  detailUrl,
  formatInstant,
  formatPercent,
  formatScore,
  listUrl,
  parseVectorDetail,
  parseVectorPage,
  type QueryContext,
  type RequestFailureKind,
  requestJson,
  type VectorDetail,
  type VectorDimension,
  validateContext,
} from "../../_lib/intelligence";

type State =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly detail: VectorDetail | null }
  | {
      readonly status: "failed";
      readonly kind: RequestFailureKind;
      readonly traceId: string | null;
    };

export function CountryClient({
  locale,
  countryCode,
}: {
  readonly locale: Locale;
  readonly countryCode: string;
}) {
  const search = useSearchParams();
  const validation = useMemo(() => validateContext(search), [search]);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<State>({ status: "loading" });
  const context = validation.context;
  const copy = workbenchCopy(locale);

  useEffect(() => {
    void reload;
    if (!context) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadCountry(context, countryCode, controller.signal)
      .then(setState)
      .catch(() => undefined);
    return () => controller.abort();
  }, [context, countryCode, reload]);

  const title =
    state.status === "ready" && state.detail ? state.detail.geography.name : copy.countriesTitle;
  return (
    <main id="main-content" className="intelligenceMain" tabIndex={-1}>
      <nav className="breadcrumbs" aria-label={copy.breadcrumb}>
        <Link href={`/${locale}`}>EconomyOS</Link>
        <span aria-hidden="true">/</span>
        <Link
          href={
            context
              ? `/${locale}/intelligence/countries?${contextParams(context).toString()}`
              : `/${locale}/intelligence/countries`
          }
        >
          {copy.countriesTitle}
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" dir="ltr">
          {countryCode}
        </span>
      </nav>
      <PageHeader
        locale={locale}
        eyebrow={`${copy.countriesTitle} / ${copy.dimensionFieldTitle}`}
        title={title}
        lede={copy.countryLede}
        actions={
          state.status === "ready" && state.detail && context ? (
            <CompareAction locale={locale} context={context} vectorId={state.detail.id} />
          ) : undefined
        }
      />
      <TemporalLens locale={locale} validation={validation} />
      {!context ? (
        <SetupState locale={locale} />
      ) : (
        <>
          <ContextSummary locale={locale} context={context} />
          {state.status === "loading" ? (
            <LoadingState locale={locale} label={`${copy.countriesTitle}: ${countryCode}…`} />
          ) : null}
          {state.status === "failed" ? (
            <FailureState
              locale={locale}
              kind={state.kind}
              traceId={state.traceId}
              onRetry={() => setReload((value) => value + 1)}
            />
          ) : null}
          {state.status === "ready" && !state.detail ? (
            <EmptyState
              title={`${copy.countriesTitle}: ${copy.unavailable}`}
              detail={copy.setupDetail}
            />
          ) : null}
          {state.status === "ready" && state.detail ? (
            <CountryResults locale={locale} detail={state.detail} context={context} />
          ) : null}
        </>
      )}
    </main>
  );
}

function CompareAction({
  locale,
  context,
  vectorId,
}: {
  readonly locale: Locale;
  readonly context: QueryContext;
  readonly vectorId: string;
}) {
  const copy = workbenchCopy(locale);
  const params = contextParams(context);
  params.set("vectorIds", vectorId);
  return (
    <Link className="secondaryAction" href={`/${locale}/intelligence/compare?${params.toString()}`}>
      {copy.addToComparison}
    </Link>
  );
}

function CountryResults({
  locale,
  detail,
  context,
}: {
  readonly locale: Locale;
  readonly detail: VectorDetail;
  readonly context: QueryContext;
}) {
  const copy = workbenchCopy(locale);
  const partial =
    detail.diagnostics.missingDimensionCount > 0 ||
    detail.dimensions.some((dimension) => dimension.run?.status !== "complete");
  return (
    <section className="countryResults" aria-labelledby="country-state-title">
      <div className="countryIdentity">
        <div>
          <p className="sectionKicker">{copy.country}</p>
          <h2 id="country-state-title">{copy.exactDimensionState}</h2>
        </div>
        <dl>
          <div>
            <dt>{copy.country}</dt>
            <dd dir="ltr">
              {detail.geography.codeScheme}:{detail.geography.code}
            </dd>
          </div>
          <div>
            <dt>{copy.assembled}</dt>
            <dd>
              <time dateTime={detail.assembledAt}>{formatInstant(locale, detail.assembledAt)}</time>
            </dd>
          </div>
          <div>
            <dt>{copy.evidenceCoverage}</dt>
            <dd title={detail.diagnostics.evidenceCoverage}>
              {formatPercent(locale, detail.diagnostics.evidenceCoverage)}
            </dd>
          </div>
          <div>
            <dt>{copy.confidenceCoverage}</dt>
            <dd title={detail.diagnostics.confidenceCoverage}>
              {formatPercent(locale, detail.diagnostics.confidenceCoverage)}
            </dd>
          </div>
        </dl>
      </div>
      {partial ? (
        <p className="partialBanner" role="status">
          <strong>{copy.partialState}.</strong> {copy.missing}: {copy.unknown}.
        </p>
      ) : null}
      <section className="fiveTrackTape" aria-label={copy.dimensionFieldTitle}>
        {detail.dimensions.map((dimension) => (
          <DimensionPanel
            key={dimension.dimension}
            locale={locale}
            dimension={dimension}
            workspaceId={context.workspaceId}
          />
        ))}
      </section>
      <details className="manifestDisclosure">
        <summary>{copy.workspaceAndSnapshot}</summary>
        <dl className="manifestGrid">
          <div>
            <dt>UUID</dt>
            <dd dir="ltr">{detail.id}</dd>
          </div>
          <div>
            <dt>{copy.snapshotUuid} · SHA-256</dt>
            <dd dir="ltr">{detail.snapshot.manifestSha256}</dd>
          </div>
          <div>
            <dt>{copy.exactDimensionState} · SHA-256</dt>
            <dd dir="ltr">{detail.stateManifestSha256}</dd>
          </div>
          <div>
            <dt>{copy.queryContext} · SHA-256</dt>
            <dd dir="ltr">{detail.contextSha256}</dd>
          </div>
        </dl>
      </details>
    </section>
  );
}

function DimensionPanel({
  locale,
  dimension,
  workspaceId,
}: {
  readonly locale: Locale;
  readonly dimension: VectorDimension;
  readonly workspaceId: string;
}) {
  const copy = workbenchCopy(locale);
  const run = dimension.run;
  const evidenceHref = run ? governedLink(run.links.components, workspaceId) : null;
  return (
    <details className={`dimensionPanel ${run ? "hasEvidence" : "isMissing"}`}>
      <summary>
        <span className="dimensionOrdinal" aria-hidden="true">
          0{dimension.ordinal}
        </span>
        <span className="dimensionName">{workbenchDimension(locale, dimension.dimension)}</span>
        <span className="dimensionType">{run ? copy.estimated : copy.unknown}</span>
        <strong className="dimensionScore" title={run?.score ?? undefined}>
          {run ? formatScore(locale, run.score) : copy.unknown}
        </strong>
      </summary>
      {run && dimension.model ? (
        <div className="dimensionBody">
          <dl className="dimensionMetrics">
            <div>
              <dt>{copy.status}</dt>
              <dd>{run.status}</dd>
            </div>
            <div>
              <dt>{copy.completeness}</dt>
              <dd title={run.completeness}>{formatPercent(locale, run.completeness)}</dd>
            </div>
            <div>
              <dt>{copy.sourceCoverage}</dt>
              <dd title={run.sourceCoverage}>{formatPercent(locale, run.sourceCoverage)}</dd>
            </div>
            <div>
              <dt>{copy.confidence}</dt>
              <dd title={run.confidence}>{formatPercent(locale, run.confidence)}</dd>
            </div>
            <div>
              <dt>{copy.distinctSources}</dt>
              <dd>{run.distinctSourceCount}</dd>
            </div>
            <div>
              <dt>{copy.renormalized}</dt>
              <dd>{run.renormalized ? copy.yes : copy.no}</dd>
            </div>
          </dl>
          {run.missingReason ? (
            <p className="missingReason">
              <strong>{copy.unknown}:</strong> {run.missingReason}
            </p>
          ) : null}
          <div className="modelIdentity">
            <p>
              <span className="modelIdentityLabel">{copy.model}</span>{" "}
              <bdi>
                {dimension.model.key}@{dimension.model.version}
              </bdi>
            </p>
            <p>
              <span className="modelIdentityLabel">UUID</span> <bdi>{run.id}</bdi>
            </p>
            <p>
              <span className="modelIdentityLabel">{copy.artifactLifecycleAtRun}</span>{" "}
              {dimension.model.artifact.lifecycleStatus}
            </p>
            <p className="artifactWarning">{copy.artifactFrozenWarning}</p>
          </div>
          {evidenceHref ? (
            <a className="evidenceLink" href={evidenceHref}>
              {copy.evidence} <span aria-hidden="true">→</span>
            </a>
          ) : null}
        </div>
      ) : (
        <div className="dimensionBody missingBody">
          <p>
            <strong>{copy.unknown}.</strong>{" "}
            {dimension.missingReason ?? `${copy.reported}: ${copy.unknown}.`}
          </p>
        </div>
      )}
    </details>
  );
}

async function loadCountry(
  context: QueryContext,
  countryCode: string,
  signal: AbortSignal,
): Promise<State> {
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
    const page = await requestJson(listUrl(context, cursor, 100), parseVectorPage, signal);
    if (!page.ok) return { status: "failed", kind: page.kind, traceId: page.traceId };
    const summary = page.data.vectors.find(
      (vector) =>
        vector.geography.code.toLocaleUpperCase("en-US") === countryCode.toLocaleUpperCase("en-US"),
    );
    if (summary) {
      const url = detailUrl(summary.links.self, context.workspaceId);
      if (!url) return { status: "failed", kind: "malformed", traceId: null };
      const detail = await requestJson(url, parseVectorDetail, signal);
      return detail.ok
        ? { status: "ready", detail: detail.data }
        : { status: "failed", kind: detail.kind, traceId: detail.traceId };
    }
    if (!page.data.nextCursor) return { status: "ready", detail: null };
    cursor = page.data.nextCursor;
  }
  return { status: "failed", kind: "failed", traceId: null };
}

function governedLink(path: string, workspaceId: string): string | null {
  if (!path.startsWith("/api/v1/economic-state/runs/")) return null;
  const url = new URL(path, "https://economyos.invalid");
  if (url.origin !== "https://economyos.invalid") return null;
  url.searchParams.set("workspaceId", workspaceId);
  return `${url.pathname}?${url.searchParams.toString()}`;
}
