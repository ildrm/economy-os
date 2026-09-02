"use client";

import type { Locale } from "@economyos/i18n";
import { usePathname, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { workbenchContextField, workbenchCopy } from "../_lib/copy";
import {
  type ContextIssue,
  type ContextValidation,
  type QueryContext,
  type RequestFailureKind,
  validateContext,
} from "../_lib/intelligence";

const UUID_PATTERN =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89ab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}";
const UTC_INSTANT_PATTERN =
  "[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]{1,6})?Z";
const CONTEXT_FIELD_IDS: Readonly<Record<ContextIssue, string>> = {
  workspaceId: "context-workspace-id",
  snapshotId: "context-snapshot-id",
  knownAt: "context-known-at",
  policy: "context-policy",
  systemAt: "context-system-at",
};

export function TrustStrip({ locale }: { readonly locale: Locale }) {
  const copy = workbenchCopy(locale);
  return (
    <ul className="trustStrip" aria-label={copy.methodologyBoundaries}>
      <li>{copy.researchBaseline}</li>
      <li>{copy.pointInTime}</li>
      <li>{copy.noCompositeScore}</li>
    </ul>
  );
}

export function TemporalLens({
  locale,
  validation,
}: {
  readonly locale: Locale;
  readonly validation: ContextValidation;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const copy = workbenchCopy(locale);
  const context = validation.context;
  const [feedback, setFeedback] = useState(validation);
  const summaryRef = useRef<HTMLDivElement>(null);
  const shouldFocusSummary = useRef(validation.attempted && validation.issues.length > 0);
  const issues = new Set(feedback.attempted ? feedback.issues : []);
  const invalid = (field: ContextIssue) => issues.has(field);

  useEffect(() => {
    setFeedback(validation);
    shouldFocusSummary.current = validation.attempted && validation.issues.length > 0;
  }, [validation]);

  useEffect(() => {
    if (!shouldFocusSummary.current || feedback.issues.length === 0) return;
    summaryRef.current?.focus();
    shouldFocusSummary.current = false;
  }, [feedback]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const submitted = validateContext(formSearchParams(event.currentTarget));
    if (submitted.context) return;
    event.preventDefault();
    shouldFocusSummary.current = true;
    setFeedback(submitted);
  };

  const handleInput = (event: FormEvent<HTMLFormElement>) => {
    if (!feedback.attempted) return;
    setFeedback(validateContext(formSearchParams(event.currentTarget)));
  };

  return (
    <section className="temporalLens" aria-labelledby="temporal-lens-title">
      <div className="lensHeading">
        <p className="sectionKicker">{copy.temporalLens}</p>
        <h2 id="temporal-lens-title">{copy.queryContext}</h2>
      </div>
      <form
        className="contextForm"
        action={pathname}
        method="get"
        noValidate
        onInput={handleInput}
        onSubmit={handleSubmit}
      >
        <label>
          <span>{copy.effectiveAt}</span>
          <input value={copy.unavailable} disabled aria-describedby="effective-help" />
          <small id="effective-help">{copy.effectiveHelp}</small>
        </label>
        <label>
          <span>{copy.asKnownAt}</span>
          <input
            id={CONTEXT_FIELD_IDS.knownAt}
            name="knownAt"
            defaultValue={context?.knownAt ?? params.get("knownAt") ?? ""}
            placeholder="2026-08-31T12:00:00Z"
            inputMode="text"
            pattern={UTC_INSTANT_PATTERN}
            required
            dir="ltr"
            aria-invalid={invalid("knownAt") || undefined}
            aria-describedby={invalid("knownAt") ? issueId("knownAt") : undefined}
          />
          <FieldIssue locale={locale} field="knownAt" visible={invalid("knownAt")} />
        </label>
        <label>
          <span>{copy.systemTime}</span>
          <input
            id={CONTEXT_FIELD_IDS.systemAt}
            name="systemAt"
            defaultValue={context?.systemAt ?? params.get("systemAt") ?? "null"}
            placeholder="null / UTC RFC 3339"
            pattern={`(?:null|${UTC_INSTANT_PATTERN})`}
            dir="ltr"
            aria-invalid={invalid("systemAt") || undefined}
            aria-describedby={invalid("systemAt") ? issueId("systemAt") : undefined}
          />
          <FieldIssue locale={locale} field="systemAt" visible={invalid("systemAt")} />
        </label>
        <label>
          <span>{copy.policy}</span>
          <select
            id={CONTEXT_FIELD_IDS.policy}
            name="policy"
            defaultValue={context?.policy ?? params.get("policy") ?? ""}
            required
            aria-invalid={invalid("policy") || undefined}
            aria-describedby={invalid("policy") ? issueId("policy") : undefined}
          >
            <option value="" disabled>
              {copy.selectPolicy}
            </option>
            <option value="true_vintage">true_vintage</option>
            <option value="reconstructed">reconstructed</option>
            <option value="latest_revised">latest_revised</option>
          </select>
          <FieldIssue locale={locale} field="policy" visible={invalid("policy")} />
        </label>
        {feedback.attempted && feedback.issues.length > 0 ? (
          <div
            ref={summaryRef}
            className="contextIssues fieldIssues"
            role="alert"
            tabIndex={-1}
            aria-labelledby="context-issues-title"
          >
            <p id="context-issues-title">{copy.checkFields}:</p>
            <ul>
              {feedback.issues.map((field) => (
                <li key={field}>
                  <a href={`#${CONTEXT_FIELD_IDS[field]}`}>
                    {workbenchContextField(locale, field)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <details
          className="contextDisclosure"
          open={!context || invalid("workspaceId") || invalid("snapshotId")}
        >
          <summary>{copy.workspaceAndSnapshot}</summary>
          <div className="identityFields">
            <label>
              <span>{copy.workspaceUuid}</span>
              <input
                id={CONTEXT_FIELD_IDS.workspaceId}
                name="workspaceId"
                defaultValue={context?.workspaceId ?? params.get("workspaceId") ?? ""}
                pattern={UUID_PATTERN}
                required
                dir="ltr"
                aria-invalid={invalid("workspaceId") || undefined}
                aria-describedby={invalid("workspaceId") ? issueId("workspaceId") : undefined}
              />
              <FieldIssue locale={locale} field="workspaceId" visible={invalid("workspaceId")} />
            </label>
            <label>
              <span>{copy.snapshotUuid}</span>
              <input
                id={CONTEXT_FIELD_IDS.snapshotId}
                name="snapshotId"
                defaultValue={context?.snapshotId ?? params.get("snapshotId") ?? ""}
                pattern={UUID_PATTERN}
                required
                dir="ltr"
                aria-invalid={invalid("snapshotId") || undefined}
                aria-describedby={invalid("snapshotId") ? issueId("snapshotId") : undefined}
              />
              <FieldIssue locale={locale} field="snapshotId" visible={invalid("snapshotId")} />
            </label>
          </div>
        </details>
        <button className="primaryAction" type="submit">
          {copy.applyContext}
        </button>
      </form>
    </section>
  );
}

export function SetupState({ locale }: { readonly locale: Locale }) {
  const copy = workbenchCopy(locale);
  return (
    <section className="statePanel setupState" aria-labelledby="setup-title">
      <span className="stateGlyph" aria-hidden="true">
        ⌁
      </span>
      <div>
        <p className="sectionKicker">{copy.contextRequired}</p>
        <h2 id="setup-title">{copy.setupTitle}</h2>
        <p>{copy.setupDetail}</p>
      </div>
    </section>
  );
}

function FieldIssue({
  locale,
  field,
  visible,
}: {
  readonly locale: Locale;
  readonly field: ContextIssue;
  readonly visible: boolean;
}) {
  if (!visible) return null;
  const copy = workbenchCopy(locale);
  return (
    <small id={issueId(field)} className="fieldError">
      {copy.checkFields}: {workbenchContextField(locale, field)}.
    </small>
  );
}

function issueId(field: ContextIssue): string {
  return `${CONTEXT_FIELD_IDS[field]}-error`;
}

function formSearchParams(form: HTMLFormElement): URLSearchParams {
  const params = new URLSearchParams();
  for (const [name, value] of new FormData(form)) {
    if (typeof value === "string") params.append(name, value);
  }
  return params;
}

export function LoadingState({
  locale,
  label,
}: {
  readonly locale: Locale;
  readonly label?: string;
}) {
  const copy = workbenchCopy(locale);
  return (
    <section className="statePanel loadingState" aria-live="polite" aria-busy="true">
      <span className="loadingMark" aria-hidden="true" />
      <p>{label ?? `${copy.intelligence}…`}</p>
    </section>
  );
}

export function EmptyState({ title, detail }: { readonly title: string; readonly detail: string }) {
  return (
    <section className="statePanel" aria-live="polite">
      <span className="stateGlyph" aria-hidden="true">
        —
      </span>
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
    </section>
  );
}

export function FailureState({
  locale,
  kind,
  traceId,
  onRetry,
}: {
  readonly locale: Locale;
  readonly kind: RequestFailureKind;
  readonly traceId: string | null;
  readonly onRetry: () => void;
}) {
  const copy = workbenchCopy(locale);
  const denied = kind === "permission_denied" || kind === "policy_denied";
  const title = denied
    ? copy.policyOrEntitlementDenied
    : kind === "offline"
      ? copy.networkUnavailable
      : kind === "malformed"
        ? `${copy.status}: ${copy.unavailable}`
        : `${copy.intelligence}: ${copy.unavailable}`;
  const detail = denied
    ? copy.deniedDetail
    : kind === "offline"
      ? copy.offlineDetail
      : kind === "malformed"
        ? copy.allValuesUnknown
        : copy.setupDetail;
  return (
    <section className="statePanel failureState" aria-live="polite">
      <span className="stateGlyph" aria-hidden="true">
        !
      </span>
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
        {traceId ? (
          <p className="traceId" dir="ltr">
            {copy.status} {traceId}
          </p>
        ) : null}
        <button className="secondaryAction" type="button" onClick={onRetry}>
          {copy.retrySafely}
        </button>
      </div>
    </section>
  );
}

export function ContextSummary({
  locale,
  context,
}: {
  readonly locale: Locale;
  readonly context: QueryContext;
}) {
  const copy = workbenchCopy(locale);
  return (
    <dl className="querySummary">
      <div>
        <dt>{copy.snapshotUuid}</dt>
        <dd dir="ltr">{context.snapshotId}</dd>
      </div>
      <div>
        <dt>{copy.asKnownAt}</dt>
        <dd dir="ltr">{context.knownAt}</dd>
      </div>
      <div>
        <dt>{copy.policy}</dt>
        <dd dir="ltr">{context.policy}</dd>
      </div>
      <div>
        <dt>{copy.systemTime}</dt>
        <dd dir="ltr">{context.systemAt ?? "null"}</dd>
      </div>
    </dl>
  );
}
