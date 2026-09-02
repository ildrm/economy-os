# EconomyOS Product Requirements Document

Status: approved for phased implementation  
Product: EconomyOS  
Scientific architecture: Causal Economic World Model (CEWM)

## Product thesis

EconomyOS is an institutional economic intelligence and simulation platform that reconstructs what was knowable at a chosen time, represents uncertainty and competing evidence, estimates separate risks, simulates declared assumptions, and traces every material output to data and model artifacts.

It serves observation, explanation, forecasting, counterfactual simulation, and consequence analysis without treating an LLM, a composite index, a historical analogue, or a market price as a source of economic truth.

## Primary users

| Persona | Core job | Required trust signal |
| --- | --- | --- |
| Economist/researcher | Reconstruct, compare, test, publish | vintages, methodology, reproducibility |
| Sovereign/risk analyst | Monitor distinct hazards and cascades | calibration, base rates, alert history, counter-evidence |
| Investor/strategist | Compare regimes, markets, and allocation suitability | macro/valuation separation, invalidation, no advice claim |
| Policy analyst | Explore interventions and trade-offs | causal classification, assumptions, Pareto frontier |
| Corporate strategist | Combine global state with private exposures | tenant isolation, private twin, scenario lineage |
| Government/regulator | Stress test and audit national systems | deployment control, model governance, immutable audit |
| Data/API customer | Consume licensed canonical observations and results | stable contracts, entitlements, SLAs, provenance |

## Jobs to be done

1. Determine what is happening and whether the evidence is current, complete, and consistent.
2. Understand plausible mechanisms while distinguishing association, prediction, hypothesis, assumption, and identified causal effect.
3. Inspect separate crisis, regime, market, human, and financial-system estimates over explicit horizons.
4. Reconstruct an historical information set without future releases or revisions.
5. Compare baseline and counterfactual scenarios with widening uncertainty.
6. Identify winners, losers, transmission channels, cross-border exposures, and invalidation conditions.
7. Publish a reproducible report or API result with sources, versions, assumptions, and disclaimers.
8. Track forecasts after issuance and retain failures.

## Product principles

- Evidence first: no orphan metric or conclusion.
- Point-in-time first: all analytical reads require an `as_of` context.
- Missing is not zero; unavailable is not safe.
- Uncertainty and model status are mandatory beside estimates.
- Causal language is controlled by identification class.
- Human welfare and market performance are independent state families.
- Hazards remain separate; cascades describe conditional paths.
- LLMs plan, retrieve, and explain validated tool output; they do not calculate authoritative numbers.
- Capabilities declare `planned`, `scaffolded`, `functional`, `validated`, or `production_ready`.

## Scope by capability family

### Observation and evidence

- countries, regions, institutions, currencies, assets, commodities, household groups;
- canonical indicators and units;
- raw, validated, normalized, derived, latent, composite, forecast, scenario, and report artifacts;
- release/revision/retrieval/effective/model-execution time;
- data quality, freshness, source health, license, and lineage.

### Economic state

- macroeconomic, human, financial-system, political/institutional, crisis, capital, market, trade/supply-chain, dependency, and resilience dimensions;
- probabilistic multidimensional regimes;
- trends, acceleration, percentiles, coverage, uncertainty, and flags.

### Risk and forecast

- distinct hazard/horizon models;
- model tournament, calibration, backtesting, drift, and out-of-domain status;
- immutable prediction ledger and scored outcomes;
- explicit invalidation criteria.

### Graph and explanation

- temporal entities and relationships;
- evidence-backed causal classifications;
- provenance paths and dependency/contagion channels;
- relationship dispute and analyst annotation without history overwrite.

### Scenario and policy

- single and correlated shocks;
- declared magnitudes, durations, scopes, probabilities, dependencies, and assumptions;
- baseline comparisons, human/market consequences, contagion, and policy trade-offs;
- multi-objective policy optimization with constraints and Pareto results.

### Product and commercial platform

- organizations, workspaces, teams, users, roles, permissions, attributes, entitlements, private datasets/models;
- dashboards, reports, alerts, comments, watchlists, saved scenarios, search, command palette;
- API keys/OAuth, quotas, usage records, billing-provider abstraction, feature flags, white label;
- 12 languages, RTL, accessibility, density, light/dark/high-contrast themes.

## Non-goals and prohibited claims

- guaranteed investment or policy advice;
- invented or interpolated official statistics without a declared model;
- one opaque crisis score replacing hazard probabilities;
- causal claims from correlations or causal discovery alone;
- random train/test splits for temporal forecasting;
- retroactive replacement of forecasts, data vintages, or model artifacts;
- production activation of demo or seed data;
- silent source substitution or cross-tenant data access;
- a single-provider AI dependency for domain logic.

## Functional requirements

### FR-1 Point-in-time truth

Every analytical query accepts `as_of`. The platform returns only records available under the selected vintage policy and reports the achieved point-in-time grade.

### FR-2 Evidence inspection

Every material number exposes observation, source, release/retrieval/vintage, transformations, model use, quality, revisions, license, and lineage.

### FR-3 Canonical state

For each entity and time, state dimensions expose observations, derived values, confidence/uncertainty, completeness, regime probabilities, trends, and flags without flattening dimensions into one score.

### FR-4 Forecast accountability

Forecasts are append-only. Outcomes and scores attach later. Revisions create new records linked to prior records.

### FR-5 Scenario reproducibility

Each simulation records inputs, assumptions, model versions, data snapshot, seed, execution environment, outputs, and uncertainty.

### FR-6 Tenant and entitlement enforcement

Access is checked at route, service, query, export, search, report, graph, cache, queue, and object-store boundaries.

### FR-7 Honest AI

Copilot responses cite authorized evidence, state uncertainty, distinguish fact/model/scenario/hypothesis, and reject numerical claims unsupported by tools.

## Non-functional requirements

| Area | Requirement |
| --- | --- |
| Scientific integrity | leakage tests, causal classification, model cards, independent validation |
| Data integrity | append-only raw data, bitemporal constraints, idempotent ingestion, content digests |
| Security | least privilege, deny by default, tenant isolation, audit, encryption, secure secrets |
| Availability | health/readiness, graceful source degradation, restore-tested backups |
| Performance | endpoint budgets by category, server aggregation, pagination, virtualization |
| Accessibility | WCAG 2.2 AA, keyboard, semantic tables, chart summaries, reduced motion |
| Localization | all visible strings keyed; locale formats; Persian/Arabic RTL; charts remain coherent |
| Reproducibility | data/model/code/config/seed/environment manifests |
| Observability | correlated traces/logs/metrics, data freshness, model and job telemetry |
| Legal | source/license entitlement, attribution, retention, privacy controls, disclaimers |

## Initial releases

### Release A: trustworthy foundation

Contracts, tenant context, structured errors, PostgreSQL/Timescale migrations, object-store manifest, localization/design tokens, observability hooks, developer tooling, and health/capability APIs.

### Release B: point-in-time data kernel

Canonical entities, sources/datasets/series/observations/vintages, quality dimensions, lineage, as-of queries, raw-object manifests, and demonstration data marked as such.

### Release C: state and crisis research

Human/macro state adapters, regime probabilities, independent crisis forecasts, model registry, validation runner, immutable prediction ledger, and evidence explorer.

Later releases follow the roadmap and cannot bypass earlier scientific gates.

## Success measures

- 100% of material result contracts include provenance and maturity status.
- 100% of historical model tests assert chronological and point-in-time behavior.
- Zero cross-tenant reads in automated isolation tests.
- Zero production data paths use demo data.
- Forecast ledger preserves every issued forecast and scored outcome.
- Users can reach evidence for a displayed analytical value within one interaction.
- Core localized flows pass keyboard and screen-reader checks in English and Persian before expanding to all locales.

## Release acceptance

A capability may be `validated` only when implementation, tests, methodology, security, observability, lineage, UX, localization, accessibility, performance, and documentation pass its declared acceptance criteria. `Production_ready` additionally requires operational ownership, deployment evidence, restore testing, incident procedures, and approved data/model licenses.
