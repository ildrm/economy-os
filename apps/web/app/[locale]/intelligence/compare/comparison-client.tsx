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
  type ComparisonResult,
  comparisonUrl,
  formatPercent,
  formatScore,
  parseComparison,
  parseVectorIds,
  type RequestFailureKind,
  requestJson,
  validateContext,
} from "../_lib/intelligence";

type State =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly comparison: ComparisonResult }
  | {
      readonly status: "failed";
      readonly kind: RequestFailureKind;
      readonly traceId: string | null;
    };

export function ComparisonClient({ locale }: { readonly locale: Locale }) {
  const search = useSearchParams();
  const validation = useMemo(() => validateContext(search), [search]);
  const vectorIds = useMemo(() => parseVectorIds(search.get("vectorIds")), [search]);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<State>({ status: "loading" });
  const context = validation.context;
  const copy = workbenchCopy(locale);

  useEffect(() => {
    void reload;
    if (!context || !vectorIds) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    void requestJson(comparisonUrl(context, vectorIds), parseComparison, controller.signal)
      .then((result) => {
        setState(
          result.ok
            ? { status: "ready", comparison: result.data }
            : { status: "failed", kind: result.kind, traceId: result.traceId },
        );
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [context, vectorIds, reload]);

  return (
    <main id="main-content" className="intelligenceMain" tabIndex={-1}>
      <nav className="breadcrumbs" aria-label={copy.breadcrumb}>
        <Link href={`/${locale}`}>EconomyOS</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{copy.compareTitle}</span>
      </nav>
      <PageHeader
        locale={locale}
        eyebrow={`${copy.compareTitle} / 2–10`}
        title={copy.compareTitle}
        lede={copy.globalLede}
      />
      <TemporalLens locale={locale} validation={validation} />
      {!context ? (
        <SetupState locale={locale} />
      ) : (
        <>
          <ContextSummary locale={locale} context={context} />
          {!vectorIds ? <ComparisonSetup locale={locale} /> : null}
          {vectorIds && state.status === "loading" ? (
            <LoadingState locale={locale} label={`${copy.compatibility}…`} />
          ) : null}
          {vectorIds && state.status === "failed" ? (
            <FailureState
              locale={locale}
              kind={state.kind}
              traceId={state.traceId}
              onRetry={() => setReload((value) => value + 1)}
            />
          ) : null}
          {vectorIds && state.status === "ready" ? (
            <ComparisonResults locale={locale} comparison={state.comparison} />
          ) : null}
        </>
      )}
    </main>
  );
}

function ComparisonSetup({ locale }: { readonly locale: Locale }) {
  return (
    <EmptyState
      title={`${workbenchCopy(locale).selectTwo}: 2–10`}
      detail={workbenchCopy(locale).globalLede}
    />
  );
}

function ComparisonResults({
  locale,
  comparison,
}: {
  readonly locale: Locale;
  readonly comparison: ComparisonResult;
}) {
  const copy = workbenchCopy(locale);
  return (
    <section className="comparisonResults" aria-labelledby="comparison-result-title">
      <div
        className={`compatibilityLead ${comparison.contextComparable ? "isComparable" : "hasDifferences"}`}
      >
        <p className="sectionKicker">{copy.compatibility}</p>
        <h2 id="comparison-result-title">
          {comparison.contextComparable ? copy.comparable : copy.differencesDetected}
        </h2>
        <p>{comparison.contextComparable ? copy.exactModelIdentity : copy.noRecommendation}</p>
        {comparison.contextDifferences.length > 0 ? (
          <ul>
            {comparison.contextDifferences.map((difference) => (
              <li key={difference}>{difference}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <section className="compatibilityTape" aria-label={copy.compatibility}>
        {comparison.dimensions.map((dimension, index) => {
          const availability = dimensionAvailability(comparison, dimension.dimension);
          const state = availability === "available" ? "compatible" : availability;
          return (
            <div className={state} key={dimension.dimension}>
              <span className="compatibilityOrdinal" aria-hidden="true">
                0{index + 1}
              </span>
              <strong>{workbenchDimension(locale, dimension.dimension)}</strong>
              <em className="compatibilityState">
                {availability === "available"
                  ? copy.comparable
                  : availability === "unavailable"
                    ? copy.allValuesUnknown
                    : copy.incompatible}
              </em>
              {dimension.reason ? (
                <small className="compatibilityReason">{dimension.reason}</small>
              ) : null}
            </div>
          );
        })}
      </section>
      <section className="comparisonBands" aria-label={copy.dimensionFieldTitle}>
        {comparison.dimensions.map((compatibility) => {
          const availability = dimensionAvailability(comparison, compatibility.dimension);
          return (
            <section
              key={compatibility.dimension}
              aria-labelledby={`band-${compatibility.dimension}`}
            >
              <header>
                <h3 id={`band-${compatibility.dimension}`}>
                  {workbenchDimension(locale, compatibility.dimension)}
                </h3>
                <span>
                  {availability === "available"
                    ? `${copy.estimated} / ${copy.exactModelIdentity}`
                    : availability === "unavailable"
                      ? `${copy.allValuesUnknown} / ${copy.comparable}`
                      : `${copy.incompatible} / ${copy.unknown}`}
                </span>
              </header>
              <ul>
                {comparison.vectors.map((vector) => {
                  const dimension = vector.dimensions.find(
                    (item) => item.dimension === compatibility.dimension,
                  );
                  const displayScore =
                    availability === "available" && dimension
                      ? formatScore(locale, dimension.score)
                      : copy.unknown;
                  return (
                    <li key={vector.id}>
                      <span>
                        <strong>{vector.geography.name}</strong>
                        <small dir="ltr">{vector.geography.code}</small>
                      </span>
                      <span
                        className={
                          displayScore === copy.unknown ? "unknownValue" : "estimatedValue"
                        }
                        title={dimension?.score ?? undefined}
                      >
                        {displayScore}
                      </span>
                      <small>
                        {dimension?.status ?? copy.unknown}
                        {dimension?.renormalized ? ` · ${copy.renormalized}` : ""}
                      </small>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </section>
      <section
        aria-label={copy.comparisonEquivalentTable}
        className="tableWrap comparisonTableWrap"
      >
        <a className="tableScrollAnchor" href="#comparison-table-end">
          {copy.select}: {copy.comparisonEquivalentTable}
        </a>
        <table className="evidenceTable comparisonTable">
          <caption>{copy.comparisonEquivalentTable}</caption>
          <thead>
            <tr>
              <th scope="col">{copy.country}</th>
              <th scope="col">{copy.exactDimensionState}</th>
              <th scope="col">{copy.compatibility}</th>
              <th scope="col">{copy.status}</th>
              <th scope="col">{copy.estimated}</th>
              <th scope="col">{copy.completeness}</th>
              <th scope="col">{copy.sourceCoverage}</th>
              <th scope="col">{copy.confidence}</th>
            </tr>
          </thead>
          <tbody>
            {comparison.vectors.flatMap((vector) =>
              vector.dimensions.map((dimension) => (
                <tr key={`${vector.id}:${dimension.dimension}`}>
                  <th data-label={copy.country} scope="row">
                    {vector.geography.name}
                  </th>
                  <td data-label={copy.exactDimensionState}>
                    {workbenchDimension(locale, dimension.dimension)}
                  </td>
                  <td data-label={copy.compatibility}>
                    {dimensionAvailability(comparison, dimension.dimension) === "available"
                      ? copy.comparable
                      : dimensionAvailability(comparison, dimension.dimension) === "unavailable"
                        ? copy.allValuesUnknown
                        : copy.incompatible}
                  </td>
                  <td data-label={copy.status}>{dimension.status ?? copy.unknown}</td>
                  <td data-label={copy.estimated} title={dimension.score ?? undefined}>
                    {dimensionAvailability(comparison, dimension.dimension) === "available"
                      ? formatScore(locale, dimension.score)
                      : copy.unknown}
                  </td>
                  <td data-label={copy.completeness} title={dimension.completeness ?? undefined}>
                    {formatPercent(locale, dimension.completeness)}
                  </td>
                  <td
                    data-label={copy.sourceCoverage}
                    title={dimension.sourceCoverage ?? undefined}
                  >
                    {formatPercent(locale, dimension.sourceCoverage)}
                  </td>
                  <td data-label={copy.confidence} title={dimension.confidence ?? undefined}>
                    {formatPercent(locale, dimension.confidence)}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </section>
      <p className="methodologyFootnote" id="comparison-table-end">
        <strong>{copy.noCompositeScore}.</strong> {copy.noRecommendation}
      </p>
    </section>
  );
}

function dimensionAvailability(
  comparison: ComparisonResult,
  dimensionName: ComparisonResult["dimensions"][number]["dimension"],
): "available" | "unavailable" | "incompatible" {
  const compatibility = comparison.dimensions.find(
    (dimension) => dimension.dimension === dimensionName,
  );
  if (!compatibility?.compatible) return "incompatible";
  if (
    compatibility.reason === "all_missing" ||
    comparison.vectors.every(
      (vector) =>
        vector.dimensions.find((dimension) => dimension.dimension === dimensionName)?.score ===
        null,
    )
  ) {
    return "unavailable";
  }
  return "available";
}
