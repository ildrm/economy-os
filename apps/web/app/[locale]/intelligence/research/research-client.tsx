"use client";

import type { Locale } from "@economyos/i18n";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { PageHeader } from "../_components/page-header";
import { workbenchCopy } from "../_lib/copy";
import { researchCopy } from "../_lib/research-copy";
import styles from "./research.module.css";

const quantities = [
  "production",
  "imports",
  "openingInventory",
  "intermediateDemand",
  "householdDemand",
  "governmentDemand",
  "investmentDemand",
  "exports",
  "closingInventory",
] as const;
type Mode = "behavioral_choice" | "material_balance";
type Fields = Record<string, string>;
type Theory = {
  readonly id: string;
  readonly name: string;
  readonly authors: readonly string[];
  readonly description: string;
  readonly implementation: string;
  readonly boundaryConditions: readonly string[];
};
type Envelope = Record<string, unknown> & { result: Record<string, unknown> };
type State =
  | { status: "empty" | "pending" | "denied" | "error" }
  | { status: "saved"; envelope: Envelope };

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (object(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function sameInstant(left: string, right: string): boolean {
  const normalized = (value: string) => {
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
    return match ? `${match[1]}.${(match[2] ?? "").padEnd(9, "0")}Z` : null;
  };
  const first = normalized(left);
  return first !== null && first === normalized(right);
}

export function ResearchClient({
  locale,
  theories,
}: {
  readonly locale: Locale;
  readonly theories: readonly Theory[];
}) {
  const copy = researchCopy(locale);
  const common = workbenchCopy(locale);
  const [mode, setMode] = useState<Mode>("behavioral_choice");
  const [fields, setFields] = useState<Fields>({});
  const [state, setState] = useState<State>({ status: "empty" });
  const [search, setSearch] = useState("");
  const active = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const retry = useRef<{ signature: string; id: string } | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
    },
    [],
  );

  function invalidate() {
    revision.current += 1;
    active.current?.abort();
    active.current = null;
    setState({ status: "empty" });
  }
  function update(name: string, value: string) {
    invalidate();
    setFields((previous) => ({ ...previous, [name]: value }));
  }
  function field(name: string, label: string, numeric = false, required = true) {
    return (
      <label className={styles.field} key={name} htmlFor={`research-${name}`}>
        <span>{label}</span>
        <input
          id={`research-${name}`}
          name={name}
          value={fields[name] ?? ""}
          onChange={(event) => update(name, event.target.value)}
          required={required}
          inputMode={numeric ? "decimal" : "text"}
          dir={numeric || name === "workspaceId" || name === "knownAt" ? "ltr" : undefined}
          maxLength={name === "utilities" ? 20000 : 2000}
          aria-describedby={
            quantities.includes(name as (typeof quantities)[number])
              ? "research-unknown-help"
              : undefined
          }
          autoComplete="off"
        />
      </label>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current) return;
    const input =
      mode === "behavioral_choice"
        ? {
            utilities: (fields.utilities ?? "").split(/[,،]/).map((value) => value.trim()),
            beta: fields.beta?.trim() ?? "",
            delta: fields.delta?.trim() ?? "",
            assumption: fields.assumption?.trim() ?? "",
            population: fields.population?.trim() ?? "",
            periodUnit: fields.periodUnit?.trim() ?? "",
          }
        : {
            commodityKey: fields.commodityKey?.trim() ?? "",
            unit: fields.unit?.trim() ?? "",
            ...Object.fromEntries(quantities.map((name) => [name, fields[name]?.trim() || null])),
          };
    const command = {
      workspaceId: fields.workspaceId?.trim() ?? "",
      knownAt: fields.knownAt?.trim() ?? "",
      kind: mode,
      input,
    };
    const signature = stable(command);
    if (retry.current?.signature !== signature)
      retry.current = { signature, id: crypto.randomUUID() };
    const id = retry.current.id;
    const controller = new AbortController();
    active.current = controller;
    const version = revision.current;
    setState({ status: "pending" });
    try {
      const response = await fetch("/api/v1/research/runs", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ id, ...command }),
      });
      if (controller.signal.aborted || revision.current !== version) return;
      if (response.status === 401 || response.status === 403) {
        setState({ status: "denied" });
        return;
      }
      if (!response.ok) throw new Error("research unavailable");
      const envelope: unknown = await response.json();
      if (controller.signal.aborted || revision.current !== version) return;
      if (
        !object(envelope) ||
        !object(envelope.result) ||
        envelope.id !== id ||
        envelope.workspaceId !== command.workspaceId ||
        envelope.kind !== command.kind ||
        typeof envelope.knownAt !== "string" ||
        !sameInstant(envelope.knownAt, command.knownAt) ||
        envelope.dataClass !== "scenario" ||
        envelope.evidenceStatus !== "caller_supplied_unverified" ||
        stable(envelope.input) !== stable(input) ||
        typeof envelope.recordedAt !== "string" ||
        typeof envelope.manifestSha256 !== "string" ||
        !/^[0-9a-f]{64}$/.test(envelope.manifestSha256)
      ) {
        throw new Error("research response context mismatch");
      }
      setState({ status: "saved", envelope: envelope as Envelope });
    } catch {
      if (!controller.signal.aborted && revision.current === version) setState({ status: "error" });
    } finally {
      if (active.current === controller) active.current = null;
    }
  }

  const foundTheories = theories.filter((theory) =>
    `${theory.name} ${theory.authors.join(" ")} ${theory.description}`
      .toLocaleLowerCase(locale)
      .includes(search.toLocaleLowerCase(locale)),
  );
  return (
    <main id="main-content" className="intelligenceMain" tabIndex={-1}>
      <PageHeader
        locale={locale}
        eyebrow={common.researchBaseline}
        title={copy.title}
        lede={copy.description}
      />
      <p className={styles.notice}>{copy.hypothetical}</p>
      <div className={styles.workspace}>
        <form onSubmit={submit} className={styles.form}>
          <fieldset className={styles.context}>
            <legend>{common.queryContext}</legend>
            <div className={styles.grid}>
              {field("workspaceId", common.workspaceUuid)}
              {field("knownAt", `${common.asKnownAt} (UTC / ISO 8601)`)}
            </div>
          </fieldset>
          <fieldset className={styles.mode}>
            <legend>{common.model}</legend>
            {(["behavioral_choice", "material_balance"] as const).map((candidate) => (
              <label key={candidate}>
                <input
                  type="radio"
                  name="research-mode"
                  value={candidate}
                  checked={mode === candidate}
                  onChange={() => {
                    invalidate();
                    setMode(candidate);
                  }}
                />
                {candidate === "behavioral_choice" ? copy.behavioral : copy.allocation}
              </label>
            ))}
          </fieldset>
          <div className={styles.grid}>
            {mode === "behavioral_choice" ? (
              <>
                {field("utilities", copy.utilities)}
                {field("beta", copy.beta, true)}
                {field("delta", copy.delta, true)}
                {field("population", copy.population)}
                {field("periodUnit", copy.periodUnit)}
                {field("assumption", copy.assumption)}
              </>
            ) : (
              <>
                <p className={styles.full} id="research-unknown-help">
                  {copy.unknownHelp}
                </p>
                {field("commodityKey", copy.commodity)}
                {field("unit", copy.unit)}
                {quantities.map((name) => field(name, copy[name], true, false))}
              </>
            )}
          </div>
          <button className={styles.run} type="submit" disabled={state.status === "pending"}>
            {state.status === "pending" ? copy.running : copy.run}
          </button>
        </form>
        <section
          className={styles.results}
          aria-labelledby="research-result-title"
          aria-busy={state.status === "pending"}
        >
          <h2 id="research-result-title">{copy.result}</h2>
          {state.status === "empty" ? <p role="status">{copy.empty}</p> : null}
          {state.status === "pending" ? <p role="status">{copy.running}</p> : null}
          {state.status === "error" ? <p role="alert">{copy.failed}</p> : null}
          {state.status === "denied" ? (
            <div role="alert">
              <p>{common.policyOrEntitlementDenied}</p>
              <p>{common.deniedDetail}</p>
            </div>
          ) : null}
          {state.status === "saved" ? (
            <SavedResult envelope={state.envelope} locale={locale} />
          ) : null}
        </section>
      </div>
      <section className={styles.theories} aria-labelledby="research-theories-title">
        <h2 id="research-theories-title">{copy.theories}</h2>
        <label className={styles.field} htmlFor="research-theory-search">
          <span>{copy.search}</span>
          <input
            id="research-theory-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <ul className={styles.theoryList}>
          {foundTheories.map((theory) => (
            <li key={theory.id} lang="en" dir="ltr">
              <details>
                <summary>{theory.name}</summary>
                <p>{theory.authors.join(", ")}</p>
                <p>{theory.description}</p>
                <p>
                  <code>{theory.implementation}</code>
                </p>
                {theory.boundaryConditions.map((boundary) => (
                  <p key={boundary}>{boundary}</p>
                ))}
              </details>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function SavedResult({
  envelope,
  locale,
}: {
  readonly envelope: Envelope;
  readonly locale: Locale;
}) {
  const copy = researchCopy(locale);
  const common = workbenchCopy(locale);
  const result = envelope.result;
  const display = (value: unknown) => (typeof value === "string" ? value : common.unknown);
  const missing = Array.isArray(result.missingFields)
    ? result.missingFields.filter((item): item is string => typeof item === "string")
    : [];
  return (
    <div className={styles.saved}>
      <p role="status">{copy.saved}</p>
      <dl className={styles.metrics}>
        {envelope.kind === "behavioral_choice" ? (
          <>
            <div>
              <dt>{copy.result}</dt>
              <dd dir="ltr">{display(result.utility)}</dd>
            </div>
            <div>
              <dt>{copy.benchmark}</dt>
              <dd dir="ltr">{display(result.exponentialBenchmark)}</dd>
            </div>
          </>
        ) : (
          (["supply", "uses", "imbalance", "shortage", "surplus"] as const).map((name) => (
            <div key={name}>
              <dt>{copy[name]}</dt>
              <dd dir="ltr">{display(result[name])}</dd>
            </div>
          ))
        )}
      </dl>
      {missing.length ? (
        <div>
          <h3>{copy.missing}</h3>
          <ul>
            {missing.map((name) => (
              <li key={name}>
                {quantities.includes(name as (typeof quantities)[number])
                  ? copy[name as (typeof quantities)[number]]
                  : name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {Array.isArray(result.sensitivity) ? (
        <div>
          <h3>{copy.sensitivity}</h3>
          <ul>
            {result.sensitivity.filter(object).map((item) => (
              <li key={String(item.beta)}>
                <bdi>
                  β = {display(item.beta)}: {display(item.utility)}
                </bdi>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <dl className={styles.provenance}>
        <div>
          <dt>{common.asKnownAt}</dt>
          <dd>
            <bdi>{display(envelope.knownAt)}</bdi>
          </dd>
        </div>
        <div>
          <dt>{common.systemTime}</dt>
          <dd>
            <bdi>{display(envelope.recordedAt)}</bdi>
          </dd>
        </div>
      </dl>
      <details className={styles.manifest}>
        <summary>{copy.evidence}</summary>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: The bounded manifest scroll region needs keyboard access. */}
        <section className={styles.manifestViewport} aria-label={copy.evidence} tabIndex={0}>
          <pre lang="en" dir="ltr">
            {JSON.stringify(envelope, null, 2)}
          </pre>
        </section>
      </details>
    </div>
  );
}
