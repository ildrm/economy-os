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
} from "../_components/context-panel";
import { PageHeader } from "../_components/page-header";
import { workbenchCopy, workbenchDimension } from "../_lib/copy";
import {
  contextParams,
  formatInstant,
  formatPercent,
  listUrl,
  parseVectorPage,
  type QueryContext,
  type RequestFailureKind,
  requestJson,
  VECTOR_DIMENSIONS,
  type VectorSummary,
  validateContext,
} from "../_lib/intelligence";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly vectors: readonly VectorSummary[] }
  | {
      readonly status: "failed";
      readonly kind: RequestFailureKind;
      readonly traceId: string | null;
    };

export function GlobalClient({
  locale,
  directoryMode = false,
}: {
  readonly locale: Locale;
  readonly directoryMode?: boolean;
}) {
  const search = useSearchParams();
  const validation = useMemo(() => validateContext(search), [search]);
  const [reload, setReload] = useState(0);
  const [selection, setSelection] = useState<readonly string[]>([]);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const copy = workbenchCopy(locale);
  const context = validation.context;

  useEffect(() => {
    void reload;
    if (!context) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadVectors(context, controller.signal)
      .then(setState)
      .catch(() => undefined);
    return () => controller.abort();
  }, [context, reload]);

  return (
    <main id="main-content" className="intelligenceMain" tabIndex={-1}>
      <nav className="breadcrumbs" aria-label={copy.breadcrumb}>
        <Link href={`/${locale}`}>EconomyOS</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{directoryMode ? copy.countriesTitle : copy.globalTitle}</span>
      </nav>
      <PageHeader
        locale={locale}
        eyebrow={directoryMode ? copy.countryDirectory : copy.globalEyebrow}
        title={directoryMode ? copy.countriesTitle : copy.globalTitle}
        lede={copy.globalLede}
      />
      <TemporalLens locale={locale} validation={validation} />
      {!context ? (
        <SetupState locale={locale} />
      ) : (
        <>
          <ContextSummary locale={locale} context={context} />
          {state.status === "loading" ? <LoadingState locale={locale} /> : null}
          {state.status === "failed" ? (
            <FailureState
              locale={locale}
              kind={state.kind}
              traceId={state.traceId}
              onRetry={() => setReload((value) => value + 1)}
            />
          ) : null}
          {state.status === "ready" && state.vectors.length === 0 ? (
            <EmptyState
              title={`${copy.globalTitle}: ${copy.unavailable}`}
              detail={copy.setupDetail}
            />
          ) : null}
          {state.status === "ready" && state.vectors.length > 0 ? (
            <GlobalResults
              locale={locale}
              context={context}
              vectors={state.vectors}
              selection={selection}
              onSelection={setSelection}
            />
          ) : null}
        </>
      )}
    </main>
  );
}

function GlobalResults({
  locale,
  context,
  vectors,
  selection,
  onSelection,
}: {
  readonly locale: Locale;
  readonly context: QueryContext;
  readonly vectors: readonly VectorSummary[];
  readonly selection: readonly string[];
  readonly onSelection: (ids: readonly string[]) => void;
}) {
  const copy = workbenchCopy(locale);
  const ordered = [...vectors].sort((left, right) => {
    const coverage =
      Number(right.diagnostics.evidenceCoverage) - Number(left.diagnostics.evidenceCoverage);
    return coverage || left.geography.name.localeCompare(right.geography.name, locale);
  });
  const compareParams = contextParams(context);
  compareParams.set("vectorIds", selection.join(","));
  return (
    <section className="resultsField" aria-labelledby="field-title">
      <div className="sectionHeading">
        <div>
          <p className="sectionKicker">{copy.coverageOrder}</p>
          <h2 id="field-title">{copy.dimensionFieldTitle}</h2>
        </div>
        <div className="selectionAction" aria-live="polite">
          <span>
            {selection.length} / 10 {copy.selected}
          </span>
          {selection.length >= 2 ? (
            <Link
              className="primaryAction"
              href={`/${locale}/intelligence/compare?${compareParams.toString()}`}
            >
              {copy.compareSelected}
            </Link>
          ) : (
            <span className="disabledAction" aria-disabled="true">
              {copy.selectTwo}
            </span>
          )}
        </div>
      </div>
      <figure className="stateMatrix">
        <figcaption>
          {copy.exactDimensionState}: {copy.notLoaded}. {copy.evidenceCoverage}:{" "}
          {copy.aggregateDiagnostics}.
        </figcaption>
        <div className="matrixHeader" aria-hidden="true">
          <span>{copy.country}</span>
          <span>
            {copy.exactDimensionState} · {copy.notLoaded}
          </span>
          <span>{copy.evidenceCoverage}</span>
          <span>{copy.aggregateDiagnostics}</span>
        </div>
        <ol className="matrixRows">
          {ordered.map((summary) => (
            <li key={summary.id}>
              <Link href={countryHref(locale, context, summary)} className="matrixCountry">
                <strong>{summary.geography.name}</strong>
                <span className="matrixCountryCode" dir="ltr">
                  {summary.geography.code}
                </span>
              </Link>
              <span className="dimensionOverview">
                {VECTOR_DIMENSIONS.map((dimension) => (
                  <span
                    className="dimensionUnavailable"
                    key={dimension}
                    title={`${workbenchDimension(locale, dimension)}: ${copy.notLoaded}`}
                  >
                    <span className="dimensionUnavailableLabel">
                      {workbenchDimension(locale, dimension)}
                    </span>
                    <strong>{copy.notLoaded}</strong>
                  </span>
                ))}
              </span>
              <span className="coverageTrack">
                <meter min="0" max="1" value={Number(summary.diagnostics.evidenceCoverage)}>
                  {formatPercent(locale, summary.diagnostics.evidenceCoverage)}
                </meter>
                <span>{formatPercent(locale, summary.diagnostics.evidenceCoverage)}</span>
              </span>
              <span className="matrixDiagnostics">
                <span>
                  {copy.reported} {summary.diagnostics.reportedDimensionCount} / 5
                </span>
                <span>
                  {copy.scored} {summary.diagnostics.scoredDimensionCount} / 5
                </span>
                <span className="missingMetric">
                  {copy.missing} {summary.diagnostics.missingDimensionCount}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </figure>
      <div className="tableWrap">
        <table className="evidenceTable">
          <caption>{copy.equivalentTable}</caption>
          <thead>
            <tr>
              <th scope="col">{copy.select}</th>
              <th scope="col">{copy.country}</th>
              {VECTOR_DIMENSIONS.map((dimension) => (
                <th scope="col" key={dimension}>
                  {workbenchDimension(locale, dimension)}
                </th>
              ))}
              <th scope="col">{copy.reported}</th>
              <th scope="col">{copy.scored}</th>
              <th scope="col">{copy.missing}</th>
              <th scope="col">{copy.evidenceCoverage}</th>
              <th scope="col">{copy.confidenceCoverage}</th>
              <th scope="col">{copy.assembled}</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((summary) => {
              const checked = selection.includes(summary.id);
              return (
                <tr key={summary.id}>
                  <td data-label={copy.select}>
                    <input
                      type="checkbox"
                      aria-label={`${copy.select}: ${summary.geography.name}`}
                      checked={checked}
                      disabled={!checked && selection.length >= 10}
                      onChange={() => onSelection(toggle(selection, summary.id))}
                    />
                  </td>
                  <th data-label={copy.country} scope="row">
                    <Link href={countryHref(locale, context, summary)}>
                      {summary.geography.name} <span dir="ltr">{summary.geography.code}</span>
                    </Link>
                  </th>
                  {VECTOR_DIMENSIONS.map((dimension) => (
                    <td data-label={workbenchDimension(locale, dimension)} key={dimension}>
                      {copy.notLoaded}
                    </td>
                  ))}
                  <td data-label={copy.reported}>
                    {summary.diagnostics.reportedDimensionCount} / 5
                  </td>
                  <td data-label={copy.scored}>{summary.diagnostics.scoredDimensionCount} / 5</td>
                  <td data-label={copy.missing}>{summary.diagnostics.missingDimensionCount}</td>
                  <td
                    data-label={copy.evidenceCoverage}
                    title={summary.diagnostics.evidenceCoverage}
                  >
                    {formatPercent(locale, summary.diagnostics.evidenceCoverage)}
                  </td>
                  <td
                    data-label={copy.confidenceCoverage}
                    title={summary.diagnostics.confidenceCoverage}
                  >
                    {formatPercent(locale, summary.diagnostics.confidenceCoverage)}
                  </td>
                  <td data-label={copy.assembled}>
                    <time dateTime={summary.assembledAt}>
                      {formatInstant(locale, summary.assembledAt)}
                    </time>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function loadVectors(context: QueryContext, signal: AbortSignal): Promise<LoadState> {
  const page = await requestJson(listUrl(context), parseVectorPage, signal);
  if (!page.ok) return { status: "failed", kind: page.kind, traceId: page.traceId };
  return { status: "ready", vectors: page.data.vectors };
}

function toggle(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function countryHref(locale: Locale, context: QueryContext, vector: VectorSummary): string {
  const params = contextParams(context);
  params.set("vectorId", vector.id);
  return `/${locale}/intelligence/countries/${encodeURIComponent(vector.geography.code)}?${params.toString()}`;
}
