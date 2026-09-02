# Phase 10 Simulation Operations Runbook

Status: research-runtime runbook; no production deployment approval is implied.

## Run workflow

1. Register and retain the immutable system-definition digest.
2. Create a calibration manifest against that definition. Verify every observed source was available by `calibratedAsOf`; keep structural assumptions separate.
3. Create an observed baseline or an explicitly non-canonical counterfactual world.
4. Create a bounded run plan binding the definition, calibration, world, uint64 seed, ensemble size, timesteps, tolerances, output cells, and sensitivity parameters.
5. Execute only a registered kernel. Reject source text, unknown kernels, mismatched digests, and unbounded resources.
6. If cancelled, retain the checkpoint and resume only with the identical plan and completed-member boundary.
7. Run invariant, stability, sensitivity, and reproducibility checks before interpretation.
8. Keep every scenario artifact outside observed-data admission.

## Verification

```bash
corepack pnpm exec vitest run packages/simulation-engine/src
corepack pnpm --filter @economyos/simulation-engine typecheck
corepack pnpm --filter @economyos/simulation-engine build
corepack pnpm exec biome check packages/simulation-engine
```

Stop or quarantine a run on digest mismatch, PIT leakage, non-finite/bounded-output failure, invariant violation, numerical instability, unsafe checkpoint mismatch, or replay outside the declared tolerance. Preserve the failed artifact and diagnostic evidence.

## Remaining production work

Add durable orchestration/persistence, quotas and isolation, additional independently validated kernels, empirical calibration and backtesting, monitoring, APIs/UI, recovery exercises, and model-governance approval. Do not admit scenario output to observed datasets.

