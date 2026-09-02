# Phase 12 Systemic Risk Methodology

Status: `in_progress` — governed domain core implemented; live network ingestion, empirical validation, persistence, and product workflow remain outstanding.

## Purpose and boundary

`@economyos/systemic-risk` represents directed cross-border and cross-sector exposures without collapsing independent hazards or evidence confidence into a false event probability. Immutable point-in-time snapshots bind nodes, exposure edges, source releases, measurement class, currency, normalized exposure, evidence confidence, coverage, assumptions, and prohibited claims.

Supported exposure channels include bank claims, sovereign debt, trade, portfolios, direct investment, funding, payments, supply chains, energy, and technology. “Supported” means the schema can represent the channel; it does not mean adequate data are present.

## Coverage and missingness

Every represented exposure kind requires an explicit coverage disclosure. Complete coverage requires an explicit amount ratio and counterparty denominator. Partial or unknown coverage must declare how missing exposure is treated, and unknown coverage cannot claim a measured amount ratio. Edge evidence cannot predate its source snapshot or the network as-of. Reported and modeled estimates require caveats and remain distinct from observations.

## Analysis

- Concentration is currency-specific and uses fixed-point sums and ratios for gross exposure, counterparty count, HHI, and largest-counterparty share.
- Path analysis multiplies declared exposure strengths and scenario transmission coefficients across acyclic paths with explicit hop, returned-path, and generated-state budgets; path strength is not probability.
- Stress propagation uses explicit hypothetical shocks and a bounded complementary-accumulation kernel. Outputs are `scenario_stress_index`, with `combinedProbability` structurally fixed to `null`.
- Low/base/high sensitivity variants may change only transmission and missing-exposure assumptions. The underlying snapshot, shocks, cutoff, convergence settings, and interpretation assumptions remain fixed.
- Every result embeds or pins its exact inputs, carries a content digest, and supports deterministic replay.

Scenario calculations round stress indices to at most 12 decimal places. This numerical convention is separate from evidence confidence, missing-exposure uncertainty, and model uncertainty.

## Interpretation limits

The package does not fetch or estimate exposure data, infer causal transmission, calibrate coefficients, establish real-world network completeness, forecast crises, recommend investments/credit/policy, or execute autonomous actions. It is currently an in-memory research domain core without persistence, scheduling, API, graph UI, or production monitoring.

## Executable evidence

- 49 tests pass.
- Focused coverage: 92.94% statements, 81.21% branches, 98.48% functions, 95.49% lines.
- TypeScript typecheck, build, and Biome checks pass.
