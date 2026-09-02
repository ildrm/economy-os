# EconomyOS Simulation Engine

Phase 10 domain/runtime package for bounded structural and behavioral scenario simulation. It provides immutable versioned system definitions, point-in-time calibration manifests, explicit observed-versus-structural provenance, typed counterfactual worlds, a built-in deterministic stock-flow kernel, partitioned random streams, bounded ensembles, cancellation/checkpoint replay, exact-decimal output summaries, diagnostics, and reproducibility receipts.

The package executes only registered kernels. It never evaluates source text or user-provided code. Scenario and counterfactual worlds are permanently marked as non-observed and cannot pass the canonical observed-dataset admission guard.

## Commands

From the repository root, after the workspace lock has been refreshed by the repository owner:

```sh
corepack pnpm --filter @economyos/simulation-engine typecheck
corepack pnpm --filter @economyos/simulation-engine build
corepack pnpm exec vitest run packages/simulation-engine/src
corepack pnpm exec biome check packages/simulation-engine
```

## Execution contract

1. Create and retain a `SystemDefinition` digest.
2. Create a `CalibrationManifest` against that exact digest. Observed evidence must have been available by `calibratedAsOf`; structural assumptions use a separate collection and require sensitivity analysis.
3. Create an observed baseline or explicitly non-canonical counterfactual `SimulationWorld`.
4. Create a resource-bounded `SimulationRunPlan` binding all three artifact digests, a uint64 seed, ensemble size, convergence/equilibrium tolerances, output cells, and sensitivity parameters.
5. Call `runSimulation`. A cancelled run returns a content-addressed checkpoint containing only fully completed ensemble members. Passing that checkpoint back resumes the same replay identity.
6. Compare completed replays with `createReproducibilityReceipt` under an explicit numerical tolerance.

## Interpretation limits

The runtime demonstrates model behavior under declared equations and assumptions. Outputs are research scenarios, not forecasts, causal estimates, probabilities, policy advice, or evidence of an optimal intervention. Model and structural uncertainty remain explicitly unquantified unless a caller supplies governed extensions in a later phase; endpoint sensitivity is not a substitute for empirical validation. Binary floating-point calculations are rounded to canonical decimal strings with at most 12 fractional digits and compared only within the plan's declared tolerance.
