"use client";

import { assertObservationRecord, type ObservationRecord } from "@economyos/contracts";
import type { Locale } from "@economyos/i18n";
import { useEffect, useId, useState } from "react";
import manifest from "../../../../public/behavioral/manifest.json";
import { type BehavioralCopyKey, behavioralText } from "../_lib/behavioral-copy";
import { type DecisionCopyKey, decisionText } from "../_lib/decision-copy";
import { displayCountry } from "../_lib/public-economy";

const metrics = manifest.metrics.filter(
  (metric) => !["inflation-q25", "inflation-q75"].includes(metric.id),
);
type Country = keyof typeof manifest.countries;
type Point = { month: string; value: number; evidence: readonly ObservationRecord[] };
function pointsFor(records: readonly ObservationRecord[], metric: string): Point[] {
  if (metric === "disagreement") {
    const lower = records.filter(
      (record) => record.observation.instrument_or_item === "inflation-q25",
    );
    return lower
      .flatMap((record) => {
        const upper = records.find(
          (item) =>
            item.observation.instrument_or_item === "inflation-q75" &&
            item.observation.observation_date === record.observation.observation_date,
        );
        if (!upper || record.observation.value === null || upper.observation.value === null)
          return [];
        const value = Number(upper.observation.value) - Number(record.observation.value);
        if (value < 0) throw new TypeError("Invalid published percentile ordering");
        return [{ month: record.observation.observation_date, value, evidence: [record, upper] }];
      })
      .sort((a, b) => a.month.localeCompare(b.month));
  }
  return records
    .filter(
      (record) =>
        record.observation.instrument_or_item === metric && record.observation.value !== null,
    )
    .map((record) => ({
      month: record.observation.observation_date,
      value: Number(record.observation.value),
      evidence: [record],
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function BehavioralObservatory({ locale }: { locale: Locale }) {
  const t = (key: BehavioralCopyKey) => behavioralText(locale, key);
  const d = (key: DecisionCopyKey) => decisionText(locale, key);
  const [country, setCountry] = useState<Country>("DE");
  const [metric, setMetric] = useState<BehavioralCopyKey>("expected-inflation-1y");
  const [records, setRecords] = useState<ObservationRecord[]>([]);
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const controlId = useId();
  const titleId = useId();
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const date = (month: string) =>
    new Intl.DateTimeFormat(locale, {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
      calendar: "gregory",
    }).format(new Date(`${month}-01T00:00:00Z`));
  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setRecords([]);
    void (async () => {
      const expected = manifest.countries[country];
      if (Date.parse(manifest.source.review.expires_at) <= Date.now())
        throw new Error("Source review expired");
      const response = await fetch(`/behavioral/${country}.json?v=${expected.sha256}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
        cache: attempt ? "reload" : "default",
      });
      if (!response.ok) throw new Error("Behavioral data unavailable");
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== expected.bytes || bytes.byteLength > 4_000_000)
        throw new Error("Invalid behavioral data size");
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      if (hash !== expected.sha256) throw new Error("Behavioral integrity failure");
      const document = JSON.parse(new TextDecoder().decode(bytes));
      if (
        document.schemaVersion !== 2 ||
        document.country !== country ||
        !Array.isArray(document.records)
      )
        throw new Error("Invalid behavioral projection");
      const verified: ObservationRecord[] = document.records.map(assertObservationRecord);
      if (!controller.signal.aborted) {
        setRecords(verified);
        setState("loaded");
      }
    })().catch(() => {
      if (!controller.signal.aborted) setState("failed");
    });
    return () => controller.abort();
  }, [country, attempt]);
  const points = pointsFor(records, metric);
  const latest = points.at(-1);
  const ordinal = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
  const first = points[0];
  const low = Math.min(0, ...points.map((point) => point.value));
  const high = Math.max(1, ...points.map((point) => point.value));
  let previousMonth: number | null = null;
  const path = points
    .map((point) => {
      const month = ordinal(point.month);
      const prefix = previousMonth === month - 1 ? "L" : "M";
      previousMonth = month;
      const x =
        48 +
        ((month - ordinal(first?.month ?? point.month)) /
          Math.max(
            1,
            ordinal(latest?.month ?? point.month) - ordinal(first?.month ?? point.month),
          )) *
          720;
      return `${prefix}${x.toFixed(2)},${(245 - ((point.value - low) / (high - low)) * 205).toFixed(2)}`;
    })
    .join(" ");
  const valueLabel = (value: number, id: string) =>
    `${number.format(value)} ${["disagreement", "inflation-uncertainty"].includes(id) ? t("points") : "%"}`;
  const exportEvidence = () => {
    const artifact = {
      schemaVersion: 1,
      evidenceType: "descriptive_statistic",
      country,
      metric,
      method:
        metric === "disagreement"
          ? "weighted-percentile-difference/1.0.0"
          : "source-published-weighted-statistic/1.0.0",
      source: manifest.source,
      snapshot: manifest.countries[country].sha256,
      locale,
      explanation: t("meaning"),
      limitations: t("limits"),
      attribution: t("free"),
      observations: points.map((point) => ({
        period: point.month,
        value: point.value,
        inputs: point.evidence,
      })),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(artifact, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `economyos-survey-${country}-${metric}-${locale}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="intelligenceMain publicMain decisionRoom"
      lang={locale}
      dir={["fa", "ar"].includes(locale) ? "rtl" : "ltr"}
    >
      <header className="decisionHero">
        <div>
          <p className="eyebrow">{t("measured")}</p>
          <h1>{t("title")}</h1>
          <p>{t("intro")}</p>
        </div>
        <label htmlFor={controlId}>
          {d("country")}
          <select
            id={controlId}
            value={country}
            onChange={(event) => setCountry(event.target.value as Country)}
          >
            {Object.keys(manifest.countries).map((code) => (
              <option key={code} value={code}>
                {displayCountry(code, locale)}
              </option>
            ))}
          </select>
        </label>
      </header>
      <p className="sourceNote">
        <a href="https://data.ecb.europa.eu/data/datasets/CES">{t("free")}</a>
      </p>
      {state === "loading" ? (
        <p role="status">{d("loading")}</p>
      ) : state === "failed" ? (
        <div role="alert">
          <p>{d("downloadFailed")}</p>
          <button type="button" onClick={() => setAttempt(attempt + 1)}>
            {d("retry")}
          </button>
        </div>
      ) : (
        <>
          <section className="behavioralHeadlines" aria-label={d("happening")}>
            {(
              [
                "expected-inflation-1y",
                "expected-inflation-3y",
                "disagreement",
                "inflation-uncertainty",
              ] as const
            ).map((id) => {
              const point = pointsFor(records, id).at(-1);
              return (
                <button
                  className="decisionMetric"
                  type="button"
                  key={id}
                  aria-pressed={metric === id}
                  onClick={() => setMetric(id)}
                >
                  <span>{t(id)}</span>
                  <strong>
                    {point ? (
                      <>
                        {number.format(point.value)}
                        <small className="behavioralUnit">
                          {" "}
                          {["disagreement", "inflation-uncertainty"].includes(id)
                            ? t("points")
                            : "%"}
                        </small>
                      </>
                    ) : (
                      d("missing")
                    )}
                  </strong>
                  {point ? <time dateTime={point.month}>{date(point.month)}</time> : null}
                </button>
              );
            })}
          </section>
          <section className="behavioralChart" aria-labelledby={titleId}>
            <label htmlFor={`${controlId}-metric`}>
              {t("select")}
              <select
                id={`${controlId}-metric`}
                value={metric}
                onChange={(event) => setMetric(event.target.value as BehavioralCopyKey)}
              >
                {metrics.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(item.id as BehavioralCopyKey)}
                  </option>
                ))}
                <option value="disagreement">{t("disagreement")}</option>
              </select>
            </label>
            <h2 id={titleId}>{t(metric)}</h2>
            {latest ? (
              <>
                <div className="behavioralLatest">
                  <strong>{valueLabel(latest.value, metric)}</strong>
                  <time dateTime={latest.month}>{date(latest.month)}</time>
                </div>
                <svg
                  viewBox="0 0 820 290"
                  role="img"
                  aria-label={`${t(metric)} · ${first ? date(first.month) : ""} – ${date(latest.month)}`}
                  style={{ direction: "ltr" }}
                >
                  {[0, 1, 2, 3, 4].map((index) => {
                    const y = 245 - (index / 4) * 205;
                    return (
                      <g key={index}>
                        <line x1="48" x2="768" y1={y} y2={y} stroke="#dbe4dd" />
                        <text x="40" y={y + 4} textAnchor="end" fontSize="11" fill="#52695f">
                          {number.format(low + (index / 4) * (high - low))}
                        </text>
                      </g>
                    );
                  })}
                  <path d={path} fill="none" stroke="#247859" strokeWidth="3" />
                  <text x="48" y="274" fontSize="12" fill="#52695f">
                    {first ? date(first.month) : ""}
                  </text>
                  <text x="768" y="274" textAnchor="end" fontSize="12" fill="#52695f">
                    {date(latest.month)}
                  </text>
                </svg>
              </>
            ) : (
              <p>{d("missing")}</p>
            )}
            <details>
              <summary>{d("evidence")}</summary>
              <div className="decisionHistory">
                <table>
                  <caption>
                    {t(metric)} · {displayCountry(country, locale)}
                  </caption>
                  <tbody>
                    {[...points].reverse().map((point) => (
                      <tr key={point.month}>
                        <th scope="row">{date(point.month)}</th>
                        <td>{valueLabel(point.value, metric)}</td>
                        <td>
                          <a href={point.evidence[0]?.observation.source_url}>{d("source")} ↗</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <button type="button" className="secondaryAction" onClick={exportEvidence}>
              {t("export")} ↓
            </button>
          </section>
        </>
      )}
      <div className="decisionReading">
        <section>
          <h2>{d("matters")}</h2>
          <p>{t("meaning")}</p>
          <p>{t("distinction")}</p>
        </section>
        <section>
          <h2>{d("limits")}</h2>
          <p>{t("limits")}</p>
          <p>{d("noProbability")}</p>
        </section>
      </div>
    </main>
  );
}
