# Phase 6 Investment-Intelligence Methodology

## Scope and claim boundary

The implemented Phase 6 core is a deterministic research contract for comparing macro suitability and valuation context across countries and asset classes. It is not a portfolio optimizer, trade recommendation, suitability determination, expected-return forecast, or production-approved model.

Every manifest carries the exact `research_only`, `decisionUse: prohibited`, and `not_investment_advice` semantics. Narrative fields that attempt to issue buy, sell, allocation, or personalized-advice instructions are rejected at runtime.

## Identity and point-in-time inputs

An assessment pins one candidate-model identity, semantic version, artifact digest, country identity, strategy key, and strict point-in-time context. The context separately records:

- economic `asOf`, knowledge, and system cutoffs;
- immutable feature-snapshot identity, digest, and recording time;
- data-vintage identity, digest, and availability time.

The validator rejects a snapshot recorded after the system cutoff, a vintage released after the knowledge cutoff, or model status established after the assessment cutoff. Callers must inject this context; the library does not consult the wall clock or silently select a latest vintage.

## Asset and input model

The contract recognizes 18 explicit asset classes. Each assessment supplies all nine decision dimensions: access, liquidity, currency, crisis, contagion, human sustainability, tail risk, drawdown, and historical analogue. A dimension includes its exact decimal value, uncertainty statement, evidence identities, and rationale.

This vocabulary does not imply that every asset or country is empirically covered. Unsupported or stale valuation inputs remain unavailable with a reason; they are never replaced by a neutral value.

## Macro, valuation, and combined suitability

Macro suitability is an auditable weighted-linear research statistic. Every contribution is retained separately, and declared weights must cover each dimension exactly once. Valuation suitability is independently computed from its declared components when available.

The combined statistic is emitted only when valuation is available. An unavailable valuation produces `score: null`, no component contributions, and a reason. It cannot silently become zero, neutral, or a macro-only combined result.

Optional confidence shrinkage is labeled `display_only_not_a_validated_score`. It does not overwrite the underlying macro, valuation, or combined values.

## Evidence, uncertainty, and invalidation

Evidence and counter-evidence are first-class, content-bound inputs. Each item records observation and availability times, source and evidence identities, snapshot and vintage digests, and a maximum age. Freshness is evaluated against the manifest cutoff. Missing evidence requires an explicit absence reason.

Each asset retains distinct uncertainty, assumptions, limitations, and invalidation criteria. The output also retains every weighted contribution so a reviewer can reproduce the calculation without reverse-engineering an aggregate number.

## Comparison semantics

Country comparison requires:

- the same exact model identity, version, and artifact;
- the same point-in-time policy and `asOf` instant;
- a caller-declared reference country;
- available valuation for combined comparison.

Results stay in caller-requested order. The library deliberately computes no rank, winner, portfolio weight, or recommendation. Incompatible and missing assessments remain visible with structured reasons.

## Outcome and temporal-validation contracts

An outcome definition pins asset class, metric, scope, horizon, observation window, calculation method, source series, availability lag, revision policy, and missing-data policy. Its purpose is fixed to research validation.

Validation plans permit only expanding- or rolling-window folds. Training precedes calibration, calibration precedes testing, embargoes are enforced, and every feature, normalization, hyperparameter, valuation, label, calibration, and threshold cutoff must remain outside the test interval. Random splitting is not represented by the contract.

These checks prevent several classes of leakage; they do not demonstrate predictive skill. Skill claims still require executed point-in-time folds, retained predictions and outcomes, reviewed metrics, and independent validation.

## Integrity and limitations

Canonical JSON and SHA-256 bind definitions, assessments, and comparisons to their exact content. Digests establish content identity, not scientific validity, authorization, or authenticity by themselves.

Migration `0034_capital_allocation_persistence.sql` now provides append-only, tenant-isolated PostgreSQL persistence for assessments, evidence bindings, asset manifests, immutable completions, outcome definitions, validation plans/folds, and country comparisons. The database independently recomputes macro, valuation, combined, and comparison artifacts; unavailable valuation fails closed. Exact app reads return only currently servable artifacts, and all nine Phase 6 tables use forced RLS. Two independent fresh runs of all 34 migrations and every verifier passed.

The authenticated API now exposes exact completed assessments at `GET /v1/capital-research/assessments/:assessmentId` and comparisons at `GET /v1/capital-research/comparisons/:comparisonId`. Both require workspace membership and governed economic-state access, remain non-enumerating for inaccessible/unservable objects, re-run the package integrity validator against returned JSON, cross-check relational metadata, and deep-freeze the response. The comparison endpoint preserves requested order and adds no rank, winner, allocation, or recommendation.

The package gate currently passes 23 tests with 90.21% statement and 84.58% branch coverage. Migration SHA-256 is `de6cac81985d1099f2bd92f5d34fd16ae0ba113a0a38a6f5e04f3fb28bd16781`; verifier SHA-256 is `67cfe0e22100f6d98de105ebb89e9c336a04ee5046f2fe7cd13ca07e02fd9004`.

The Capital Research API adds seven focused tests with 92.07% statement, 87.30% branch, and 100% function coverage; the complete API suite passes 153 tests.

Phase 6 remains `in_progress`. It has no trained/approved empirical model, executed fold observations or score outputs, mutation/orchestration API, UI, worker execution, monitoring, or production release. The SQL intentionally duplicates the immutable package vocabulary; any vocabulary change requires a forward migration. Those boundaries must be completed and validated before this phase can be accepted.
