# Phased Implementation Roadmap

## Delivery rule

Each phase is a shippable increment with evidence. A phase is complete only when its acceptance criteria, tests, documentation, security/data review, operational runbook, and honest known-limitations record pass. Later-phase interfaces may be created early; later capability may not be claimed early.

## Status vocabulary

- `not_started`: no acceptance evidence.
- `in_progress`: active work, incomplete gate.
- `implemented_unvalidated`: code exists but one or more required gates have not passed.
- `accepted`: all named gates passed for the declared scope.
- `blocked`: external dependency prevents meaningful progress and is documented.

## Phases

### Phase 0 — Repository audit and specification

Deliver the four-repository audit, PRD, architecture, domain/ontology/data/PIT contracts, security and tenant design, governance, UX/design/i18n, API/source/entitlement strategies, roadmap, test/deployment plans, risk register, contradiction decisions, and traceability matrix.

Gate: documents are internally consistent and every imported legacy responsibility has a migration decision.

### Phase 1 — Foundation

Create the monorepo, reproducible toolchains, shared contracts, configuration/secrets boundaries, observability, error model, localization shell, design tokens, tenant context, identity/authentication adapters, authorization port, audit events, health endpoints, migration runner, local development environment, CI checks, and initial deployment manifests.

Gate: an authenticated principal can access only an authorized workspace in two test tenants; EN/FA shell and error flows pass RTL/accessibility tests; builds and migrations are reproducible.

### Phase 2 — Canonical PIT data platform

Implement source registry, immutable payload/release/observation model, event/valid/system time, ingestion/admission workflow, quality/quarantine, object manifests, PIT queries, provenance, feature snapshot contracts, and at least one approved official-source connector.

Gate: a revision fixture proves no hindsight leakage; an observation traces to raw checksum and parser; replay is idempotent; cross-tenant data tests pass.

### Phase 3 — Economic state and global/country intelligence

Migrate accepted Humanity concepts and transparent baselines into the canonical ontology. Integrate macroeconomic, human-economic, financial-system, market, and regime dimensions; implement global/country views, evidence drill-down, comparisons, release monitoring, and governed composite research models.

Gate: coverage and missingness are explicit; scores reproduce from manifests; no missing-as-neutral behavior.

### Phase 4 — Sovereign and FX crisis monitor

Migrate FX hazard contracts, episodes, forecasts, calibration, alerts, backtests, postmortems, and operations. Preserve hazard independence.

Gate: chronological tests and leakage sentinels pass; alerts reproduce; each production output has calibration/limitations evidence.

### Phase 5 — Causal knowledge graph

Introduce the Neo4j graph adapter, causal claim/evidence schema, provenance graph projection, graph exploration, and governed relationship workflow. PostgreSQL remains the system of record for approvals and identities.

Gate: causal claims identify method, scope, assumptions, evidence, owner, and status; graph cycles do not corrupt acyclic lineage.

### Phase 6 — Investment intelligence

Migrate macro-suitability and valuation-context models with explicit identity and validation. Add country comparison and investment research workflows, never hidden advice.

Gate: outcome definitions and temporal validation are approved; wall-clock-dependent scoring is eliminated.

### Phase 7 — Narrative and institutional intelligence

Add cited narrative evidence, event extraction, institutional measures, multilingual source handling, contradiction surfacing, and analyst review.

Gate: every extracted claim links to source spans and confidence; restricted text obeys licensing/export controls.

### Phase 8 — Nowcasting and forecasting

Add feature materialization, baselines, model tournament, probabilistic forecasts, calibration, evaluation windows, drift monitoring, and champion/challenger deployment.

Gate: temporal benchmarks beat or contextualize baselines; predictions retain model/data snapshots.

### Phase 9 — Causal inference engine

Add estimand/specification contracts, identification strategies, diagnostics, sensitivity, heterogeneity, and result registry.

Gate: causal language is allowed only for reviewed identification; association remains separately typed.

### Phase 10 — Structural and behavioral simulation

Add versioned agent/system definitions, calibration, Monte Carlo execution, intervention semantics, stability checks, and reproducible artifacts.

Gate: observed validation and simulation assumptions are separable; runs reproduce within documented numerical tolerance.

### Phase 11 — Scenario laboratory

Deliver collaborative scenario construction, durable runs, ensembles, sensitivity/spillover analysis, comparison, and report export.

Gate: baseline is pinned; scenario outputs cannot enter observed datasets; cancellation/retry are safe.

### Phase 12 — Systemic risk graph

Model cross-border and cross-sector exposures, contagion paths, stress propagation, concentration, and uncertainty without collapsing independent hazards into a false probability.

Gate: network source coverage and assumptions are visible; results include sensitivity and missing-exposure caveats.

### Phase 13 — Model governance and research operations

Complete registry workflows, experiment tracking, approvals, reproducibility services, research notebooks, peer review, monitoring, and retirement.

Gate: governed production models satisfy the full lifecycle in `09-model-governance.md`.

### Phase 14 — Collaboration and API ecosystem

Add annotations, shared workspaces, citations, SDK/CLI, webhooks, developer portal, connector/model extension contracts, and integration certification.

Gate: extension isolation, compatibility, authorization, quotas, and audit are verified.

### Phase 15 — Enterprise hardening

Complete SAML/SCIM/MFA policy, regional/residency options, HA/DR, scale testing, advanced security/compliance evidence, commercial operations, all-locale release gates, and production SLOs.

Gate: recovery exercise, penetration test, load/capacity evidence, privacy controls, and operational readiness are accepted.

## Dependency order

Phase 2 is the evidence foundation for all analytics. Phases 3–4 can progress in parallel after it. Graph work starts after ontology/provenance stability. Forecasting precedes causal and simulation claims. Scenario UX depends on governed models and durable workflow infrastructure. Enterprise controls evolve throughout; Phase 15 is their full acceptance, not their first appearance.

## Current declaration

Phase 0 is `accepted`: all required artifacts exist, the repository audit records executable verification, the contradiction review has no unresolved implementation blocker, internal document references resolve, and the capability traceability matrix is complete. Phase 1 and Phase 2 are `accepted` with executable evidence recorded in `21-implementation-status.md`.

Phases 3–15 are `in_progress`. Each now has executable repository work and explicit limitations, but none is promoted merely because its domain tests pass. Phase 3 includes the protected state, comparison, evidence, release-monitoring, notification, and product-view slices. Phases 4–6 add governed crisis, graph, and capital-allocation packages with durable persistence and protected API surfaces. Phases 7–15 add tested narrative, forecasting, causal, simulation, scenario, systemic-risk, governance, collaboration, and enterprise-readiness cores; their methodology and runbooks are recorded in documents `31`–`49`.

Remaining acceptance work includes the persistence/API/UI/worker and empirical gaps named by each phase, plus real Phase 15 identity, regional deployment, HA/DR, recovery, load/capacity, penetration, privacy/legal, commercial, all-locale human review, production SLO, and operational evidence. Current executed evidence and exact release blockers are maintained in `21-implementation-status.md`. Status changes require repository-linked verification and cannot be inferred from feature count.

## Behavioral and allocation integration (2026-09-05)

The new behavioral and allocation bounded contexts extend phases 3–13 without promoting acceptance. Implemented research interfaces, API/ledger/UI slices and outstanding product/empirical gates are mapped in [audit-product-coverage.md](audit-product-coverage.md). Core equations, registry entries, unit tests or conceptual graph edges alone are insufficient to accept forecasting, causal inference, simulation, planning or systemic-risk phases. The optimizer remains separate and unimplemented; no hidden social objective is introduced.
