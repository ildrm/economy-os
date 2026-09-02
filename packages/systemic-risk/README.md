# `@economyos/systemic-risk`

Governed Phase 12 primitives for cross-border and cross-sector exposure networks. The package creates immutable point-in-time network snapshots, reports source coverage and missing exposures, traces contagion paths, propagates bounded scenario stresses, measures concentration, and compares explicit sensitivity variants.

The engine does not manufacture a combined crisis probability. Exposure weights, coverage, assumptions, stress inputs, and uncertainty variants remain separate and visible. Outputs are deterministic research artifacts and are not investment, credit, safety, or autonomous policy advice.

Scenario propagation uses a bounded complementary-accumulation kernel and rounds calculated stress indices to 12 decimal places. Concentration amounts and ratios use fixed-point arithmetic. Contagion traversal has explicit hop, result, and generated-state budgets. Every result pins its inputs and carries a reproducibility receipt. Source confidence is evidence quality, never event probability.

Current limits: this package is an in-memory domain core. It does not fetch exposure data, estimate transmission coefficients, establish empirical causal validity, persist or schedule runs, render a graph UI, or validate real-world network coverage. Production use still requires governed persistence/API workflows, empirical validation, operational monitoring, and independent approval.

## Commands

```bash
corepack pnpm --filter @economyos/systemic-risk typecheck
corepack pnpm --filter @economyos/systemic-risk build
corepack pnpm exec vitest run packages/systemic-risk/src
```
