# Phase 9 Causal Inference Operations Runbook

Status: domain-core runbook; no production estimator service is implied.

## Governed workflow

1. Register immutable outcome, treatment, population, and estimand definitions.
2. Freeze a PIT input manifest whose sources were available by the declared cutoff.
3. Predeclare one typed identification design, its assumptions, diagnostics, falsification and sensitivity checks, holdouts, and multiplicity treatment.
4. Run the separately validated estimator outside this package and bind its artifact digest and exact evidence into an effect-candidate result.
5. Recompute readiness and diagnostic outcomes. Do not accept caller-supplied pass labels.
6. Obtain independent validation and model-risk decisions from distinct principals against the exact result digest.
7. Ask the claim gate which language is permitted. Never bypass it or automatically promote a result to the causal graph.
8. Append the artifact and review events to the result registry and verify deterministic replay.

## Verification

```bash
corepack pnpm exec vitest run packages/causal-inference/src
corepack pnpm --filter @economyos/causal-inference typecheck
corepack pnpm --filter @economyos/causal-inference build
corepack pnpm exec biome check packages/causal-inference
```

Stop publication when a PIT source is late, a design assumption or required diagnostic is absent, falsification/sensitivity fails, reviewer roles overlap, a digest no longer matches, or replay diverges. Preserve rejected and negative results; do not rewrite their history.

## Remaining production work

Before operational use, add governed estimator execution, persistent storage and APIs, empirical reference studies, independent validation, monitoring, access policy, and UI disclosure. The domain core alone does not establish a causal effect.

