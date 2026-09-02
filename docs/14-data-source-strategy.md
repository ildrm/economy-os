# Data Source Strategy

## Objective

Build a lawful, reproducible, provider-resilient evidence base. A connector succeeding is not data admission: source identity, license, semantics, release timing, quality, and provenance must all pass.

## Source hierarchy

1. Official statistical offices, central banks, ministries, regulators, and treaty organizations.
2. Reputable multilateral institutions with documented methods.
3. Licensed market, news, survey, geospatial, and alternative-data providers.
4. Academic/open research datasets with citable methodology and compatible license.
5. Community or analyst submissions, quarantined until governed review.

Priority does not imply comparability. The source registry records whether a value is official, harmonized, modeled, provisional, revised, or privately estimated.

## Registry contract

Each source/provider/dataset record includes owner, stable ID, homepage and documentation, jurisdiction, license/SPDX expression where applicable, redistribution and derivative rights, attribution, retention/deletion rules, authentication class, update/release schedule, latency expectation, geography/period coverage, methodology version, unit/frequency/seasonal treatment, revision behavior, PIT quality, SLA, cost, classification, and review dates.

Credentials live only in the secrets manager. Provider configuration references secret handles.

## Candidate families

The audited Humanity adapters provide useful starting patterns for FRED, ECB, Bank of Canada, Banco Central do Brasil, and World Bank APIs, but their licenses and terms are re-approved before migration. Future candidates include official national statistical/central-bank endpoints, IMF, OECD, BIS, Eurostat, UN agencies, and contractually approved market providers. Listing a candidate is not an assertion that use or redistribution is permitted.

The Investment repository's source registry and freshness metadata are reusable patterns; its bundled values are not automatically canonical. FX-CPM contributes provider interfaces and synthetic research fixtures, not real provider coverage. Kavosh contributes retry/cache/health boundaries but no live feeds.

## Data zones

- Landing: byte-identical fetched payload plus request metadata and checksum; immutable.
- Quarantine: parsed but unadmitted records and validation results.
- Canonical: typed observations/releases linked to registry identities.
- Curated: PIT-safe datasets and features with manifests.
- Serving: read models and caches reproducible from canonical/curated artifacts.

Original payloads are retained or tombstoned according to contract and classification. A manifest preserves lineage even when licensed bytes must expire.

## Connector requirements

Connectors implement discovery, fetch, checkpoint, parse, normalize, validate, emit, and reconcile as separable steps. Fetches have bounded timeouts, retries with jitter, conditional requests, pagination guards, rate limits, circuit breakers, request IDs, checksums, and replay-safe idempotency. Parser versions are recorded. Provider failures never fabricate observations.

A cursor is committed only after durable payload and canonical transaction success. Backfills use explicit bounded ranges and separate capacity. Reconciliation detects silent provider revisions, disappearances, duplicates, and schema drift.

## Admission gates

1. Legal/security review and data-processing classification.
2. Source and dataset registry approval.
3. Contract/schema and semantic mapping approval.
4. Payload integrity and malware/content checks.
5. Type, unit, geography, period, frequency, range, uniqueness, and referential checks.
6. Release-time/PIT assessment and revision behavior classification.
7. Comparative/anomaly review without overwriting unusual valid values.
8. Provenance and reproducibility verification.
9. Steward approval and quality SLO assignment.

Failed records enter quarantine with machine-readable reasons. Corrections create new records/events; they do not edit accepted evidence in place.

## Missingness and quality

Missing, suppressed, not applicable, not collected, delayed, parse failure, and license-withheld are distinct. Imputation is a versioned transformation with method, inputs, uncertainty, and use restriction. Observed and imputed values cannot share an unmarked series.

Quality dimensions include completeness, timeliness, conformance, uniqueness, consistency, revision magnitude, source stability, and PIT fidelity. Scores do not replace their component measurements or data-confidence caveats.

## Provider resilience

Provider health is measured separately from data freshness. Critical series may have a governed fallback mapping; switching source creates a comparability event and cannot silently splice methods. Cache serves only data within its approved staleness policy and identifies the underlying release.

## Synthetic and user data

Synthetic data is allowed only in tests, demos, and documented simulations with `dataClass=synthetic_demo` or `synthetic_research`. Production analytical queries reject demo datasets by policy. Uploaded customer data stays tenant-scoped, classified, scanned, and subject to contract and deletion policy.

## Acceptance criteria

- Every served observation resolves to source, payload checksum, parser, release, and admission result.
- Replaying an unchanged payload is idempotent.
- A provider revision creates a release/version transition without rewriting prior knowledge.
- License/retention controls are enforceable in exports and deletion workflows.
- Connector test suites include rate limit, pagination loop, timeout, corrupt payload, schema drift, duplicate, and revision fixtures.

