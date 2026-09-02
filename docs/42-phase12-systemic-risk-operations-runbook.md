# Phase 12 Systemic Risk Operations Runbook

Status: domain-core runbook; no empirical or production approval is implied.

## Snapshot workflow

1. Freeze every licensed source release and record its availability, citation, license, dataset ID, and SHA-256.
2. Create canonical nodes and directed exposure edges. Label each measurement `observed`, `reported_estimate`, or `modeled_estimate` and provide required caveats.
3. Record a coverage slice for every represented exposure kind, including known denominator, lag, missing-exposure treatment, and caveat.
4. Create the immutable network snapshot and verify its digest before analysis.

## Analysis workflow

1. Select a currency before calculating concentration; never add unlike currencies.
2. For path analysis, declare one bounded transmission coefficient and rationale for every exposure kind in the snapshot.
3. For propagation, bind the exact snapshot, explicit hypothetical shocks, coefficients, missing-exposure multiplier, resource bounds, convergence tolerance, and interpretation assumptions.
4. Run low/base/high sensitivity with an identical snapshot and shock definition. Vary only transmission and missing-exposure assumptions.
5. Verify result integrity and deterministic replay. Publish coverage caveats alongside every result.
6. Keep `combinedProbability` absent and describe output only as a scenario stress/path/concentration index.

## Verification

```bash
corepack pnpm exec vitest run packages/systemic-risk/src
corepack pnpm --filter @economyos/systemic-risk typecheck
corepack pnpm --filter @economyos/systemic-risk build
corepack pnpm exec biome check packages/systemic-risk
```

Stop analysis on a PIT/source chronology violation, unknown node/source, missing coverage slice, estimate without a caveat, absent transmission rule, non-finite/out-of-bound calculation, digest mismatch, sensitivity invariant change, or replay divergence. Preserve failed inputs for audit.

## Remaining production work

Add governed connectors and source reconciliation, persistent snapshot/run storage, APIs and graph UI, durable execution/cancellation, empirical coefficient validation, network-coverage acceptance thresholds, monitoring, authorization, quotas, and independent model-risk approval.

