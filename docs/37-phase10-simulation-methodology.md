# Phase 10 Structural and Behavioral Simulation Methodology

Status: `in_progress` — executable research kernel implemented; empirical calibration and production workflow remain outstanding.

## Purpose and model boundary

`@economyos/simulation-engine` executes registered, bounded structural simulations against immutable system definitions, calibration manifests, worlds, and run plans. It never evaluates supplied source text. Observed evidence and structural assumptions use different provenance classes, and scenario/counterfactual output is permanently non-observed.

The built-in deterministic stock-flow kernel advances versioned states through declared equations, interventions, and bounded timesteps. Partitioned random streams make ensemble members reproducible. A run plan pins the system, calibration, world, seed, resource limits, tolerances, requested outputs, and sensitivity parameters.

## Execution and uncertainty

- PIT calibration rejects evidence unavailable at the calibration cutoff.
- Structural assumptions require explicit sensitivity treatment and cannot masquerade as observed calibration.
- Ensembles report distributions without claiming forecast probability or causal identification.
- Stability, invariants, equilibrium/convergence, and sensitivity diagnostics remain separate.
- Cancellation creates a content-addressed checkpoint at a complete member boundary; resume preserves replay identity.
- Reproducibility receipts compare complete runs under the plan's explicit numerical tolerance.

Binary floating-point calculations are normalized to canonical decimal strings with no more than 12 fractional digits. This documented numerical tolerance is not model uncertainty.

## Interpretation limits

Outputs describe behavior under declared equations and assumptions. They are not observations, forecasts, causal estimates, calibrated probabilities, optimized policy, or advice. The current package provides one bounded kernel and in-memory execution; it does not quantify empirical model/structural uncertainty, validate calibration against reality, persist jobs, or provide a production scheduler/API/UI.

## Executable evidence

- 24 tests pass.
- Focused coverage: 89.71% statements, 80.13% branches, 95.67% functions, 92.63% lines.
- TypeScript typecheck, build, and Biome checks pass.
