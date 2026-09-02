# Requirement Traceability

## Purpose

This matrix connects the implementation mandate to normative specifications and acceptance phases. It is intentionally at capability level; code-level links are added as modules land.

| Requirement area | Normative documents | Acceptance phase(s) |
|---|---|---|
| repository audit and migration decisions | `00-repository-audit.md`, `20-contradiction-resolution.md` | 0 |
| product outcomes, personas, non-goals | `01-product-requirements.md`, `10-ux-specification.md` | 0; validated throughout |
| modular platform and required stack | `02-system-architecture.md`, `18-deployment-architecture.md` | 1, 2, 5, 15 |
| economic entities and bounded contexts | `03-domain-model.md`, `04-economic-ontology.md` | 2–13 |
| canonical observations/releases/datasets | `05-canonical-data-model.md`, `14-data-source-strategy.md` | 2 |
| point-in-time, bitemporal, provenance, reproducibility | `06-point-in-time-data-architecture.md`, `17-testing-strategy.md` | 2 and every analytical phase |
| security, identity, audit, privacy | `07-security-architecture.md`, `18-deployment-architecture.md` | 1 and 15 |
| tenancy, RLS, isolation, residency | `08-multi-tenant-architecture.md`, `17-testing-strategy.md` | 1, 2, 15 |
| model lifecycle, validation, calibration, monitoring | `09-model-governance.md`, `17-testing-strategy.md` | 4, 6, 8–13 |
| accessible evidence-first workflows | `10-ux-specification.md`, `11-design-system.md` | 1 and feature phases |
| themes, tokens, charts, responsive behavior | `11-design-system.md` | 1, 3, 4, 11 |
| 12 locales and RTL | `12-internationalization.md` | 1 architecture; all locales by 15 |
| REST/gRPC/events, errors, idempotency, streaming | `13-api-architecture.md` | 1–2 and feature phases |
| lawful, resilient source ingestion | `14-data-source-strategy.md` | 2 onward |
| plans, quotas, billing decoupling | `15-commercial-entitlements.md` | 1 policy port; commercial acceptance by 15 |
| phases and honest completion gates | `16-roadmap.md` | 0–15 |
| unit through E2E, data/model/security/load/a11y tests | `17-testing-strategy.md` | every phase |
| local/cloud deployment, CI/CD, HA/DR, observability | `18-deployment-architecture.md` | 1 and 15 |
| delivery/data/model/security/commercial risks | `19-risk-register.md` | reviewed every gate |
| contradictions and sequencing tradeoffs | `20-contradiction-resolution.md` | 0; revised by ADR |

## Legacy capability disposition

- Humanity Economy: concept vocabulary, evidence gates, source adapters, transparent indices -> Phases 2–3 after admission/validation.
- Countries Investment Model: strategy abstraction, provenance/freshness patterns -> Phase 6 after injected clock and temporal validation.
- FX Crisis Early Warning: PIT modes, hazard contracts, backtesting/calibration/alert concepts -> Phase 4 on canonical evidence.
- Kavosh: modular-monolith structure, typed contracts, RTL shell, deterministic technical indicators -> Phase 1 foundation and later market context, with demo/auth/schema issues corrected.

## Evidence convention

An accepted phase adds links to tests, migration IDs, API schemas, screenshots/accessibility results, security/data/model reviews, runbooks, and deployment artifacts. A document, stub, mocked endpoint, or passing unit suite alone does not establish end-to-end acceptance.

## Current executable evidence

- Phase 1: `packages/security`, `packages/config`, `packages/observability`, `packages/i18n`, `apps/api`, `apps/web`, migrations `0001` and `0005`, and `tests/accessibility.spec.ts`.
- Phase 2: `packages/canonical-data`, `packages/data-admission`, `packages/object-storage`, `services/ingestion-worker`, migrations `0002`–`0011`, `0015`, `0019`, and `0022`; plus shared governed-serving hardening in `0023`–`0029`. Executable evidence includes `database/verify-pit.sql`, `database/verify-ingestion.sql`, `database/verify-terminal-admission.sql`, `database/verify-governance.sql`, `database/verify-bound-catalog.sql`, `database/verify-lineage-security.sql`, `database/benchmark-pit.sql`, and `scripts/verify-object-storage.mjs`. The later migrations freeze admission-time legal/quality/catalog evidence, make bound source/dataset/concept/geography identity append-only, deny legacy provenance without frozen evidence, close lineage enumeration/helper-ACL gaps, validate admission digests at write time, and retain fail-closed PIT invariants while meeting the measured query budget.
- Governed authorization shared by Phases 2–3: `apps/api/src/governed-authorization.ts` and its contract tests evaluate subject-aware role grants, classification ceilings, and entitlement capabilities inside the governed read's repeatable-read, read-only tenant transaction. Migration `0023` exposes only narrow classification/current-servability resolvers, and `database/verify-authorization.sql` verifies their role/ACL boundary. PostgreSQL independently enforces tenant/workspace, legal, temporal, quality, and base-table access constraints; it is not the subject-entitlement engine.
- Phase 3 in progress: `packages/economic-state`; the protected economic-state API, exact-ID five-dimensional vector detail, and component provenance drill-down; the protected, series-scoped release list and persisted schedule-status API; migrations `0012`–`0018` and `0020`–`0024`; `apps/api/src/economic-state.test.ts`, `database/verify-economic-state.sql`, `database/verify-release-monitoring.sql`, `database/verify-bound-catalog.sql`; and `22-economic-state-baselines.md`. Vector detail is schema-versioned, canonical-order, whole-resource fail-closed on current run servability, and explicitly research-baseline only. Release monitoring is polling-only and never synthesizes an unrecorded provider time.
- Phase 3 is not accepted: accepted real-data model definitions, coverage/sensitivity studies and economic review, vector discovery, a geography-neutral comparability contract, effective model-lifecycle governance, global/country comparison and interactive drill-down UI, and durable notifications still require implementation and acceptance evidence.
- The full database invariant suite is green across 29 checksum-locked migrations. A clean-room real-PostgreSQL 50,000-revision/10,000-selection benchmark records a true p95 of 936.21 ms and max of 1,444.49 ms against the 1,000 ms p95 local gate; the in-memory benchmark records median 170.88 ms and p95 179.43 ms. Consolidated unit, coverage, build, policy, accessibility, object-storage, Temporal, licensing, and declared-limit evidence is maintained in `21-implementation-status.md`.
