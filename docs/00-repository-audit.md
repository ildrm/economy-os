# EconomyOS Repository Audit Report

Status: validated discovery artifact  
Audit date: 2026-08-31  
Scope: current public `main` branch snapshots of the four required repositories

## Executive decision

EconomyOS will integrate ideas and stable contracts, not merge the repositories. The four projects have compatible scientific instincts—explicit provenance, missingness, confidence, deterministic calculations, and honest status labels—but incompatible data models and maturity levels. The target is a modular monolith with separately deployable scientific workers. Each legacy engine is placed behind a canonical adapter and remains independently testable during migration.

The strongest reusable assets are:

1. Humanity Economy's measurement ontology, evidence gates, transparent aggregation, confidence decomposition, source adapters, and sensitivity analysis.
2. Countries Investment Model's separation of macro suitability from valuation suitability and its country-strategy pattern.
3. FX-CPM's explicit hazard taxonomy, point-in-time grades, immutable forecast semantics, chronological evaluation, calibration gates, crisis clustering, alert hysteresis, and contagion primitives.
4. Kavosh's TypeScript modular-monolith shape, runtime contracts, deterministic market evidence, bilingual RTL design, API error handling, workspace tooling, and operational budgets.

No current project is production-ready as an EconomyOS subsystem without adaptation. In particular, none supplies production multi-tenancy, complete authentication, enterprise authorization, durable audit immutability, licensed live-data operations, or the canonical bitemporal lineage model required here.

## Repositories and pinned evidence

| Repository | Audited commit | Commit date | License | Current status |
| --- | --- | --- | --- | --- |
| [Humanity Economy](https://github.com/ildrm/humanity-economy) | `aff787dab529d90507929817534a508d7aa4b4ce` | 2026-08-25 | MIT code; source data retain their own terms | Functional research engine |
| [Countries Investment Model](https://github.com/ildrm/countries-investment-model) | `5fb90439e361954fa210a69a79a449cc027bab01` | 2026-08-24 | MIT code; source data retain their own terms | Partially validated research engine |
| [FX Crisis Early Warning / FX-CPM](https://github.com/ildrm/foreign-exchange-crisis-early-warning-system) | `03c565e18b6eab1db908bd0fd2dfc247df1cabfd` | 2026-08-27 | MIT code; no empirical dataset bundled | Validated scientific foundation, not an operational model |
| [Kavosh Market Intelligence](https://github.com/ildrm/kavosh-market-intelligence) | `00c360f630d0bb3b4a77decb342a8a6a72741b4a` | 2026-08-25 | MIT code; provider data unbundled | Functional Phase 1 product foundation |

The audit inspected all tracked files, dependency manifests, schemas, migrations, tests, documentation, and public entry points. Generated reports were treated as samples, not as evidence of model validity.

## Executable audit results

| Repository | Tests | Coverage | Lint/type/build | Security/dependency result |
| --- | --- | --- | --- | --- |
| Humanity Economy | 72 passed, 1 opt-in live test skipped | 85% combined branch/statement report | Ruff passed | No hard-coded secrets or dynamic execution found; bounded HTTPS and safe rendering are tested |
| Countries Investment Model | 22 passed, 1 failed | 52% statements | Ruff passed | No hard-coded secrets or dynamic execution found; national scraping paths have low coverage |
| FX-CPM | 98 passed | 82% statements | Ruff passed | No secrets/dynamic execution found; provider implementations are largely absent by design |
| Kavosh | 19 passed | 93.64% statements, 74.48% branches, 96.39% lines for the selected core packages | Biome passed; direct workspace typecheck passed; API/worker builds passed; web build passed with webpack | `pnpm audit --prod` reported no known vulnerabilities |

Important qualifications:

- Countries Investment Model's regression test expected `data_confidence=0.2759` for Iran but produced `0.2602` on 2026-08-31. Confidence depends on wall-clock staleness while the regression fixture is not clock-injected. This is a reproducibility defect, not merely an environment dependency.
- Kavosh's root `typecheck` script recursively calls a `pnpm` shim. It fails in a Corepack-only shell even though the underlying workspace typechecks pass. The default Turbopack build also could not bind an internal local port in the audit environment; the webpack production build completed. Both are developer-experience/portability findings, not TypeScript errors.
- Kavosh's coverage threshold excludes contracts, configuration, database, i18n, UI, and app delivery code from the reported aggregate. Those areas have selected tests but are not governed by the same coverage floor.
- Python projects use ranged dependencies without lockfiles. Reproducible application builds require generated, reviewed lock artifacts and software bills of materials.

## Humanity Economy audit

### Architecture and domain

The package follows inward dependencies: presentation and source adapters call application services, which call a standard-library domain. Immutable dataclasses represent observations, features, concept definitions, drivers, sensitivity intervals, results, country configuration, and source health. Architecture tests enforce the boundary.

The domain registry contains 77 concepts across macro, labor, household pressure, distribution, basic needs, financial structure, sovereign structure, economic structure, normative fairness, and exclusion/vulnerability. Measurement class and evidence status are separate. Direct values remain in native units.

### Data and ingestion

Implemented structured adapters cover FRED CSV, ECB SDMX-CSV, Bank of Canada Valet, Banco Central do Brasil SGS, and batched World Bank Indicators. Country metadata and explicit seed observations support offline research. HTTP is HTTPS-only with an allowlist, timeouts, retry/backoff, streaming size bounds, atomic cache writes, and response/cache size limits.

Source precedence combines authority, declared quality, original frequency, freshness, release/period dates, and bounded manual override. A source tier is not allowed to win solely by list position.

### Point-in-time and provenance

`Observation` separates period start/end, release date, retrieval timestamp, revision status, vintage, source tier/type/quality, official/estimate flags, and seasonal-adjustment status. Historical visibility requires a release on or before the analysis date; when release is unknown, actual retrieval and period end must both be no later than the analysis date. This is conservative and safe, though it cannot make revised World Bank histories into true vintages.

Lineage is embedded in derived observation notes and driver source URLs. It is useful but not yet a normalized provenance graph with content digests, transformation identifiers, code commits, dataset manifests, or many-to-many lineage edges.

### Statistical and scoring methods

- Reference normalization: `z=(x-target)/scale`, bounded with `tanh(z/2)`.
- Transparent aggregate: `score=50+50*sum(effective_weight*directed_signal)` with explicit missing-data gates.
- Confidence: source quality, source tier, freshness, estimate/release penalties, coverage, concordance, historical depth, and a measurement-class factor.
- Sensitivity: deterministic weight perturbation plus confidence-scaled signal noise; correctly labeled sensitivity ranges rather than confidence intervals.
- Robustness: equal-weight and leave-one-feature-out spread.
- Optional statistics: first principal component, local-level Kalman filter, Pearson and lead/lag correlation, classification metrics.

Weights are theory/expert priors, not empirically calibrated. Risk scores are not probabilities. Declared relationships are explicitly non-causal.

### Outputs and interfaces

One CLI supports country selection, concepts, as-of reconstruction, source audit, validation, manual evidence, JSON, console, and self-contained HTML. JSON has a versioned schema. There is no service API.

### Reuse decision

Adopt the measurement/evidence enums, evidence gates, normalization registry concept, transparent contribution model, point-in-time selection tests, source health contract, and sensitivity/robustness logic after porting them to canonical EconomyOS contracts. Retain Python calculations behind the Human Economic State adapter. Replace embedded dictionaries and URL-only lineage with database-backed versioned definitions and provenance edges.

### Debt and risks

- Large registries and functions (`concepts.py`, country seeds, report orchestration) need data-driven decomposition.
- True vintage support is incomplete; World Bank/FRED histories can be revised.
- Confidence factors and composite weights are heuristic.
- History service and time-series functions have materially lower coverage than the aggregate.
- HTML/CLI presentation must not become a second source of business rules.
- Seeds are legitimate fixtures but cannot enter production outputs unless visibly classified as demonstration or analyst-supplied assumptions.

## Countries Investment Model audit

### Architecture and domain

The project uses domain/application/infrastructure/country/presentation layers. It represents observations, country configuration, regimes, asset scores, profiles, and confidence policies. A strategy protocol separates the generic macro rules from Iran-specific monetary dynamics.

### Data and ingestion

The project combines manual input, live national sources, annual World Bank auxiliary observations, and offline seeds. FRED and national-source scraping/parsing exist for a subset of countries. The Iran adapter includes HTML, spreadsheet, PDF, and optional browser extraction paths. HTTP sessions use retries and timeouts, but live parsing and source-contract coverage are thin relative to source variability.

### Methods and scores

The generic engine derives inflation pressure, disinflation pressure, growth strength, money impulse, and a real-rate proxy; regime classification is deterministic threshold logic. Thirteen asset groups receive weighted macro scores, then optional valuation inputs adjust selected assets. Iran has a separate inflation/liquidity/debasement rule set.

The valuable scientific distinction is:

- `MACRO_ONLY`: regime suitability only;
- `MACRO_PLUS_VALUATION`: at least one relevant market valuation input was supplied;
- confidence-shrunk comparison score: `50 + (raw-50)*analysis_confidence`.

The model correctly states that macro support is not a recommendation. However, weights, thresholds, fair-value references, score ranges, and uncertainty bands are heuristics without historical calibration or return backtests.

### Provenance and time

Observation records separate period, release, and retrieval fields and penalize seed/forecast provenance. The project lacks a complete as-of query mode, vintage selector, immutable dataset manifests, or release-aware historical feature store. It is therefore unsuitable for historical capital-allocation claims until placed on EconomyOS point-in-time data.

### Outputs and interfaces

The CLI emits console, JSON, and self-contained HTML. No versioned public API or formal JSON Schema is present. One broad test module covers offline pipelines and architectural invariants.

### Reuse decision

Reuse the strategy boundary, stable asset taxonomy/profile separation, macro-versus-valuation scope, confidence shrinkage as an optional presentation statistic, and evidence-gated assessment labels. Port formulas as versioned `expert_prior` candidate models, never as validated allocation recommendations. Rebuild time access, contracts, and validation on the canonical platform.

### Debt and risks

- A wall-clock-dependent regression test currently fails, so a clock/as-of date must be mandatory.
- Coverage is 52%; national adapters are mostly 23–33% covered.
- `domain/strategies.py` is an 848-line concentration of thresholds, weights, prose, and valuation rules.
- Several provider parsers scrape presentation formats and need fixture/contract monitoring.
- No chronological return evaluation, uncertainty calibration, or market-liquidity/tax/access normalization exists.
- The current merge policy and time semantics are less rigorous than Humanity Economy and FX-CPM.

## FX-CPM audit

### Architecture and domain

FX-CPM is the most complete scientific contract. It separates domain, application, sources, countries, infrastructure, and presentation. Country, currency, and exchange-rate regime are distinct dated entities. Eight hazards remain independent: FX, banking, sovereign, monetary, political instability, coup, internal conflict, and interstate conflict.

### Data and provenance

The repository deliberately bundles synthetic demonstrations only. It catalogs World Bank, IMF, BIS, ECB, FRED/ALFRED, national sources, UCDP, V-Dem, crisis databases, licensed market feeds, and network sources with license/revision cautions. A source record requires provider, series, release/retrieval/vintage, license, authority/quality, and lineage.

Observations distinguish available/stale/missing/not-applicable/unreliable/source-failure/insufficient-history. Derived values require transformation lineage. Imputation requires original missing status, method, uncertainty, and training end.

Point-in-time selection supports `TRUE_VINTAGE`, `RECONSTRUCTED_POINT_IN_TIME`, and `REVISED_HISTORY_ONLY`; true vintage requires both release and actual retrieval before the cutoff. The service selects eligible revisions without using a vintage label as the primary scientific ordering.

### Methods

- Regime-aware FX returns, volatility, drawdown, parallel-market premium, exchange-market pressure, and residual FX surprise.
- Dependency-light logistic/L2 logistic, discrete-time hazard, generalized additive, boosted-tree, random-forest, regime-interaction, competing-risk, and stacking reference implementations.
- Platt and isotonic calibration primitives, reliability bins, Brier score, log loss, calibration diagnostics, and domain support.
- Expanding chronological windows; country, regime, event-cluster, and feature-era holdouts; FX/no-FX paired ablation.
- Rare-event metrics including average precision, PR-AUC, false-alert/missed-crisis rates, fixed-FPR recall, operational precision, and lead time.
- Hazard-specific alert artifacts with entry/exit hysteresis, evidence gates, out-of-domain controls, and an uncalibrated severity ceiling.
- Historical analog distance and directed, dated, channel-specific contagion pressure.

The model card correctly reports no empirical performance and prohibits calibrated probability language.

### Outputs and interfaces

One CLI supports synthetic reports, schema validation, source audit, panel construction, backtest smoke tests, JSON, self-contained HTML, and optional PDF. There is no hosted API and most source provider packages are empty boundaries.

### Reuse decision

Adopt the hazard taxonomy, forecast record, point-in-time grades, missingness/imputation contracts, dated regime model, chronological split contract, calibration/alert gates, event-cluster isolation, model tournament manifest, and provenance audit. Keep actual candidate estimators in Python workers. Do not copy synthetic forecasts or present reference model families as validated.

### Debt and risks

- Source adapters are mostly absent, so empirical readiness is planned rather than implemented.
- The 2,932-line HTML renderer and 570-line chart module are maintenance hotspots.
- Similar concepts exist in both `domain` and `application` (observations/PIT, alerts, calibration), requiring contract consolidation.
- Custom numerical estimators need comparison against established libraries, convergence diagnostics, property tests, and independent validation.
- Code-quality scan found 536 smells and 15 structural warnings, concentrated in presentation and large scientific modules; tests remain strong at 82% coverage.
- No deployed registry, feature store, artifact store, or immutable prediction database exists.

## Kavosh audit

### Architecture and product shape

Kavosh is a pnpm modular monolith containing Next.js web, NestJS/Fastify API, BullMQ worker, shared runtime contracts, domain packages, Drizzle mappings, SQL migrations, i18n, security helpers, design documentation, and CI. It explicitly reports planned capabilities instead of presenting empty screens as complete.

The deterministic pipeline validates canonical symbols and OHLCV candles, computes EMA/RSI/ATR/MACD, builds evidence and disagreements, classifies a market regime, produces hypotheses and invalidation conditions, and attaches versions/freshness. Confidence measures factor agreement and freshness, not return probability.

### Data and time

Provider event time and platform receive time are separate. UTC is canonical. PostgreSQL numeric types store price/volume, while analytical calculations use floating point. The migration defines instruments, providers, market candles, snapshots, and provider health; market candles and health are Timescale hypertables.

The schema is market-specific rather than a canonical economic observation model. It lacks dataset/source license tables, release/vintage bitemporality, tenants, row-level security, immutable forecasts, and generalized lineage.

### Interfaces and UX

Implemented API endpoints are health, capability status, and deterministic analysis, with Zod validation and OpenAPI metadata. Errors use a request identifier and hide unknown stack traces. The web interface supports English/Persian, logical RTL layout, an LTR time axis, dark/light/system themes, keyboard command palette, accessible labels, explicit demo state, and a restrained institutional palette.

### Security and operations

The API has a 1 MiB body limit, strict candle count, configurable CORS, baseline security headers, structured logging, and secret redaction. Worker concurrency is bounded. Authentication and privileged endpoints are honestly absent. Production rate limiting, CSRF/session controls, tenant isolation, durable idempotency, audit immutability, and provider egress policy remain planned.

### Reuse decision

Use Kavosh as the delivery-pattern reference: pnpm workspace, TypeScript package boundaries, Zod contracts, NestJS error boundary, server-first localized web shell, deterministic market engine boundary, explicit capability states, Timescale migration style, CI, and performance budgets. Rename and generalize packages for EconomyOS; do not import the Kavosh repository or market-specific database schema wholesale.

### Debt and risks

- The dashboard page is 603 lines and mixes layout, demo composition, localization choices, and view components.
- Demo data comes from a package named `testing` listed as a web runtime dependency; production packaging should use a separately gated demo-data package or server-only fixture boundary.
- Root scripts assume a globally available `pnpm` shim in nested scripts.
- Default Turbopack needs environmental allowances not present in the audit runner; webpack build succeeds.
- API request rate limiting and authentication are not implemented.
- Drizzle types do not encode every SQL check constraint, so migration and ORM schema can drift.
- Default Docker images use mutable tags and local credentials; production requires digests and secret management.

## Cross-repository duplicate responsibilities

| Concern | Existing overlap | Canonical owner |
| --- | --- | --- |
| Observation/time/provenance | All Python projects plus Kavosh market time | `packages/contracts` + canonical database |
| Confidence/data quality | Humanity, Investment, FX-CPM, Kavosh | `services/data-quality` contract; domain-specific confidence components remain separate |
| HTTP/cache/JSON | Three Python projects | shared Python ingestion SDK with source-specific adapters |
| Country registry | Three Python projects | canonical entity registry |
| Regime classification | Humanity, Investment, FX-CPM | economic-state service with versioned model plugins |
| Report rendering | All four | web/report service consuming canonical result contracts |
| Alert semantics | FX-CPM and Kavosh plans | product alert service; scientific threshold artifact remains model-owned |
| Model versions | Humanity, FX-CPM, Kavosh | model registry and immutable artifact manifest |

## Formal migration and integration map

| Source asset | Target subsystem | Integration form | Preconditions |
| --- | --- | --- | --- |
| Humanity `Observation`, measurement/evidence enums | Canonical data + Human Economic State | semantic port; map fields, preserve original payload | canonical IDs, dataset/license manifest, bitemporal migration |
| Humanity concept definitions and transparent aggregation | Human Economic State | Python adapter with versioned registry | independent methodology review; weight/model card registration |
| Humanity FRED/ECB/BoC/BCB/WB adapters | Ingestion | refactor into shared source SDK | contract fixtures, observed release policy, raw-object retention |
| Investment generic/Iran strategy objects | Capital Allocation and Regime | candidate expert-prior model plugins | clock injection, PIT features, historical evaluation, asset ontology |
| Investment asset profiles and scope labels | Capital Allocation | canonical asset/profile records | localization and entitlement metadata |
| FX-CPM observations/PIT grades | Canonical PIT platform | primary semantic baseline | consolidate duplicate application/domain representations |
| FX-CPM hazard/event/forecast/alert contracts | Crisis Engine | versioned protobuf/JSON contracts and Python service | empirical frozen labels, model registry, prediction ledger |
| FX-CPM backtest/calibration/tournament | Model governance | research runner and validation jobs | external-library parity tests, immutable artifacts |
| FX-CPM contagion/analog primitives | Contagion and Historical Intelligence | candidate algorithms | dated network data and leakage-safe reference windows |
| Kavosh contracts/API/worker pattern | Platform foundation | reimplement generalized workspace packages | tenant/security contracts and generalized error model |
| Kavosh deterministic intelligence | Market Reflexivity | adapter around normalized market observations | licensed providers, freshness/SLA policy, market ontology |
| Kavosh RTL/design patterns | EconomyOS web/design system | token/component concepts | all 12 locales, WCAG testing, density modes |

## Integration acceptance rules

1. Legacy outputs remain labeled with their original method and maturity.
2. No adapter may drop release, retrieval, revision, vintage, missingness, source, license, or lineage metadata.
3. A legacy score is not renamed a probability.
4. A revised-history result cannot be promoted to true point-in-time status.
5. Every imported formula receives a model card, version, owner, validation status, and prohibited-use statement.
6. Integration tests compare canonical adapter output with pinned legacy fixtures before the old path can be retired.
7. Source code is not copied unless provenance, license, ownership, tests, and a deliberate refactor justify it.
8. Each legacy repository remains independently runnable until its target subsystem reaches validated parity.

## Audit conclusion

Phase 0 repository discovery passes. The assets are scientifically compatible enough to integrate through contracts, but not structurally compatible enough for a direct merge. EconomyOS must establish one canonical observation/provenance model first, use FX-CPM's point-in-time rigor as the floor, use Humanity's measurement humility for human-state modeling, preserve Investment's scope distinction, and use Kavosh's product foundation as a delivery reference.
