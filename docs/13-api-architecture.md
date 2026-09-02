# API Architecture

## Style and boundaries

The public product API is versioned REST over HTTPS under `/api/v1`. OpenAPI is generated from shared contracts and is the external contract. Internal high-throughput scientific calls may use gRPC with protobuf. Durable workflows are started through commands and observed through resources/events; request threads do not own long computations.

The API layer authenticates, authorizes, validates, resolves tenant context, and orchestrates application services. It does not implement indicators, models, or database-specific analytical logic.

## Resource conventions

- Resource names are plural nouns; actions are exceptional command endpoints.
- IDs are opaque UUID/ULID strings and never encode tenant.
- JSON fields are `camelCase`; timestamps are RFC 3339 UTC strings.
- Precise decimal observations are strings with explicit units.
- Unknown is `null` plus reason/status where relevant; never numeric zero.
- Enums are additive only within a version, with unknown-value client handling documented.

## Principal resources

| Area | Representative routes |
|---|---|
| Identity | `/me`, `/organizations`, `/workspaces`, `/service-accounts` |
| Catalog | `/geographies`, `/concepts`, `/indicators`, `/sources`, `/series` |
| Evidence | `/observations`, `/releases`, `/datasets`, `/lineage` |
| Analysis | `/country-snapshots`, `/comparisons`, `/hazards`, `/alerts` |
| Models | `/models`, `/model-versions`, `/model-runs`, `/validations` |
| Scenarios | `/scenarios`, `/scenario-runs`, `/interventions`, `/outcomes` |
| Operations | `/ingestion-runs`, `/quality-incidents`, `/workflow-runs` |
| Governance | `/approvals`, `/audit-events`, `/policies`, `/entitlements` |

Observation queries require geography/series plus effective interval and an explicit `knownAt` or a named `latest` policy. Governed analytical endpoints reject an omitted cutoff. Responses echo the resolved cutoff and dataset snapshot.

## Authentication and authorization

Browser clients use Authorization Code with PKCE via OIDC and secure, rotating server-managed sessions. APIs accept short-lived JWT access tokens validated by issuer, audience, algorithm, expiry, and key rotation. Service accounts use OAuth client credentials or mTLS-bound tokens. SAML is brokered through the identity layer for enterprise tenants.

The API's governed-authorization service evaluates subject-aware role grants, classification ceilings, and entitlement capabilities inside the repeatable-read, read-only tenant transaction used for the governed read. Narrow database `SECURITY DEFINER` wrappers independently enforce tenant/workspace scope and applicable legal, temporal, admission, and quality boundaries while preserving base-table least privilege. They do not evaluate subject grants or entitlements, so they complement rather than replace the API decision. Cross-tenant misses return a non-enumerating response.

## Requests

- Schema validation is strict; unknown properties are rejected for commands.
- Mutation requests accept `Idempotency-Key`; the key is scoped to principal, tenant, action, and canonical request hash.
- Optimistic concurrency uses `ETag`/`If-Match` for mutable resources.
- Correlation and trace context are accepted only in valid formats and regenerated when untrusted.
- Uploads use short-lived signed object-storage operations followed by server-side validation and admission.

## Responses and errors

Success envelopes are omitted for single resources. Collections contain `items` and `page`. Errors use `application/problem+json`:

```json
{
  "type": "https://economyos.dev/problems/validation",
  "title": "Request validation failed",
  "status": 422,
  "code": "REQUEST_INVALID",
  "detail": "One or more fields are invalid.",
  "instance": "/api/v1/scenarios/01.../runs",
  "traceId": "01...",
  "errors": [{"path": "assumptions[0].unit", "code": "UNIT_INCOMPATIBLE"}]
}
```

Details are safe for the caller. Stack traces, SQL, provider responses, secret identifiers, and existence of unauthorized resources are excluded.

## Pagination, filtering, and ordering

Cursor pagination is default. Cursors are signed opaque encodings of a stable order and tenant/query scope. Clients choose only allowlisted filters and order fields. Time-series endpoints support bounded windows and deterministic `(eventTime, releaseTime, id)` order. Maximum ranges and response sizes are resource-specific.

### Governed release monitoring

Release monitoring is series-scoped so classification, role grant, entitlement, tenant, and legal-admission decisions are exact before release metadata is served:

- `GET /evidence/series/{seriesId}/releases` requires explicit `releasedAfter` (exclusive) and `releasedBefore` (inclusive) UTC instants. The window is limited to 366 days and the response to 100 releases. `truncated: true` requires a narrower time window.
- `GET /evidence/series/{seriesId}/release-schedule` requires an explicit `asOf` comparison instant. It reports the current persisted dataset declaration; it does not predict a provider date.

The release list is current-only and fails closed unless a release has immutable post-`0022` canonical-admission evidence, a successful terminal/verified transformation path, passing quality, an active non-synthetic series, and a current API-permitting source decision and license review. Each item identifies the source, dataset, payload, representative observation, transformation, canonical admission, frozen legal evidence, and current legal decision. `monitoringTimeBasis` distinguishes an exact provider publication/release/availability timestamp from payload-fetch or canonical-recording fallback time.

An exact upcoming timestamp is recognized only from bounded persisted metadata shaped as `{"schemaVersion":1,"releaseTimes":["<RFC3339 UTC instant>"]}`. Empty metadata yields `not_declared`; valid metadata with or without a future entry yields `scheduled` or `no_upcoming_release`; legacy, malformed, oversized, or otherwise unstructured metadata yields `unstructured`. All non-`scheduled` states return `nextReleaseAt: null` rather than fabricating a forecast.

## Long-running operations and streaming

Commands return `202 Accepted`, a workflow-run resource, and polling location. Server-sent events provide resumable status/alert streams with event IDs and heartbeats. WebSockets are reserved for genuinely bidirectional collaboration. Streaming is an optimization; durable state remains queryable.

Cancel means requested, not necessarily completed. A terminal workflow exposes result/error classification, retryability, timings, artifact references, and manifest.

## Versioning and compatibility

Additive changes do not require a new major API version. Breaking semantics, removals, or required fields do. Deprecation is announced in headers, changelog, and telemetry with a migration window. Dataset, ontology, formula, and model versions are independent of transport API version and always explicit.

## Limits and resilience

Limits apply by identity, tenant, action cost, and entitlement. Expensive queries have budgets and explainable rejection. Provider calls use timeouts, bounded retries with jitter, circuit breakers, and concurrency limits. Mutation retries rely on idempotency. Load shedding protects evidence reads and alert triage before bulk exports.

## Contract acceptance

- OpenAPI validates examples and backward compatibility in CI.
- Consumer contract tests cover web, CLI/SDK, and scientific adapters.
- Authorization tests exercise every declared action across tenant boundaries.
- PIT endpoints prove cutoff monotonicity and reject leakage fixtures.
- Logs and traces contain IDs and classifications but no tokens or raw restricted data.
