# Phase 9 Causal Inference Methodology

Status: `in_progress` — governed domain core implemented; empirical estimation and independent real-world validation remain outstanding.

## Purpose and boundary

`@economyos/causal-inference` governs what a causal study means, which evidence it used, and which language its review state permits. It does not estimate an effect or turn predictive association into causality. Estimator runtimes must supply separately governed artifacts and evidence.

## Scientific contracts

- Estimands pin population, treatment, outcome, horizon, unit, contrast, interference assumptions, and versioned definitions.
- Point-in-time manifests bind every dataset snapshot and require availability before the analysis cutoff.
- Predeclared plans bind an estimand, one of twelve typed identification designs, diagnostics, falsification checks, sensitivity analyses, multiplicity treatment, and holdouts before results exist.
- Diagnostic pass/fail is recomputed from exact observed values, comparators, and thresholds; callers cannot assert a passing label independently.
- Results preserve effect candidates, heterogeneity, overlap/balance, separated uncertainty classes, limitations, and invalidation criteria.

Supported design contracts cover difference-in-differences, synthetic control, instrumental variables, regression discontinuity, event study, intervention analysis, structural time series, structural equation models, Bayesian causal models, causal forests, heterogeneous treatment effects, and dynamic Bayesian networks. A supported contract is not evidence that its identifying assumptions hold.

## Claim gate

Predictive associations and causal-discovery output remain hypothesis-labeled. A result may use reviewed causal-effect language only when the predeclared readiness gate passes, required diagnostics/falsification/sensitivity evidence passes, and distinct independent-validation and model-risk reviewers approve the exact result digest. Automatic promotion into the authoritative causal graph is prohibited.

## Reproducibility and limitations

Artifacts are immutable, content-addressed, and stored through a deterministic append-only result registry with replay verification. The package does not fetch data, run estimators, prove identification, establish external validity, or approve policy actions. Those claims require governed scientific execution, empirical review, and the Phase 13 lifecycle.

## Executable evidence

- 124 tests pass.
- Focused coverage: 93.68% statements, 84.66% branches, 98.49% functions, 94.96% lines.
- TypeScript typecheck, build, Biome, and built-export smoke checks pass.
