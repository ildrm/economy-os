# Testing Strategy

## Test philosophy

Tests protect meaning, time, isolation, and reproducibility—not only code paths. Every defect in canonical data, tenant isolation, authorization, leakage, billing, or model governance receives a regression fixture. Tests use deterministic clocks, seeded randomness, hermetic provider fixtures, and explicit time zones.

## Test layers

| Layer | Scope | Required examples |
|---|---|---|
| Unit | pure domain, formulas, policies, parsing | units, intervals, missingness, locale, grant decisions |
| Property | invariants across generated values | PIT monotonicity, idempotency, interval algebra, cursor stability |
| Contract | schemas and provider/consumer compatibility | OpenAPI, protobuf, source adapters, event envelopes |
| Integration | databases, object store, cache, workflows | RLS, migrations, release insertion, manifests, retries |
| End-to-end | critical user journeys | tenant login, evidence trace, alert triage, scenario run |
| Data | source and dataset quality | uniqueness, conformance, freshness, release/revision behavior |
| Model | research and production evidence | temporal split, leakage, baselines, calibration, subgroup behavior |
| Security | abuse and boundary behavior | IDOR, token validation, SSRF, upload, injection, policy bypass |
| Performance | latency, throughput, capacity, recovery | PIT query, ingestion, scenario scheduling, export, failover |
| Accessibility/i18n | perceivability and locale behavior | keyboard, screen reader, RTL, pseudo-locales, contrast |

## Canonical temporal suite

Every observation fixture can carry event, release, valid, and system times. Required sentinels:

- a revised value is invisible before its release;
- a late-arriving record is invisible before system admission when system-time replay is requested;
- latest-revised and true-vintage results deliberately differ;
- timezone boundaries do not move economic periods;
- backtests fail when any feature or label postdates the prediction cutoff;
- an imputation is visible only after its own method/input availability;
- adding future releases cannot change a pinned snapshot hash.

Mutation testing targets cutoff comparisons because off-by-one operators create silent leakage.

## Tenant and authorization suite

Run the same integration suite for two tenants with colliding human-readable names. Test direct IDs, cursors, caches, background jobs, objects, search, logs, exports, support access, and error behavior. RLS remains enabled during tests. A privileged maintenance path must be separately credentialed and audited.

Authorization uses a generated action/resource matrix covering allow, explicit deny, absent grant, wrong tenant, expired role, classification, jurisdiction, model status, entitlement, and break-glass cases.

## Data and connector suite

Golden payload fixtures cover normal, empty, paginated, revised, duplicated, corrupt, throttled, timeout, schema-drift, and partial responses. Live smoke tests are opt-in, read-only, rate-limited, and never the sole acceptance evidence. Golden transformations include source checksum and parser version.

## Model validation tests

- Target/event definitions and label construction.
- Chronological train/validation/test splits and embargo where needed.
- No future availability in features, normalization, imputation, or sample selection.
- Naive and incumbent baselines.
- Discrimination/error, calibration, coverage, stability, and subgroup metrics appropriate to output type.
- Determinism or documented numerical tolerance.
- Serialization parity and rollback compatibility.
- Model-card and manifest completeness.

A metric threshold alone cannot approve a model; the governance workflow consumes this evidence.

## Frontend tests

Component tests cover all states and interactions. Visual tests span themes, density, EN/FA, representative scripts, forced RTL, and pseudo-expansion. E2E tests verify URLs restore tenant/locale/PIT context, charts have accessible tables, and screenshots distinguish observed/forecast/scenario.

## Performance and resilience

Benchmarks record dataset shape, hardware/runner class, concurrency, warm/cold state, and commit. SLO tests use representative distributions rather than a single average. Chaos tests cover provider outage, workflow-worker loss, cache loss, object latency, database failover, and duplicate delivery. Recovery tests prove idempotency and reconciliation.

## CI gates

1. Formatting, lint, type checks, dependency/license checks, secret scan.
2. Unit/property/contract tests and coverage by risk area.
3. Integration with real service versions and migrations from supported prior schema.
4. Frontend accessibility/visual/E2E.
5. Security and temporal leakage suites.
6. Artifact/SBOM/provenance generation and deploy verification.

Flaky tests are quarantined only with owner, issue, expiry, and risk assessment; critical boundary tests cannot be quarantined. Coverage percentages are diagnostic, not substitutes for scenario coverage.

## Acceptance evidence

Each phase records commands, environment/tool versions, exit status, summaries, artifact hashes, known skips, and rationale. A skipped live provider test is not reported as a pass for source availability.

