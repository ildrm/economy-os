# EconomyOS Scenario Laboratory

Phase 11 domain/runtime package for governed collaborative scenario work. It pins every scenario to an exact point-in-time observed snapshot, forecast snapshot, model artifact, code digest, configuration digest, and baseline-result digest. Scenario definitions and outputs are permanently classified as counterfactual research artifacts and cannot be admitted to canonical observed datasets.

## Included

- Versioned immutable scenario definitions with authors, contributors, cited assumptions, limitations, shocks, and explicitly hypothetical policy interventions.
- Deterministic multi-action ordering, wildcard-aware overlap detection, a fail-closed rejection policy, and an explicit priority/key resolution policy.
- Hash-chained proposal, revision, independent review, and independent approval events. Definition changes must appear as revision events; approved ledgers cannot be silently edited.
- Idempotent, replay-addressed run requests and exact-computation retries.
- A durable queued/running/checkpointed/succeeded/failed/cancelled state machine with optimistic state versions, cancellation, bounded checkpoints, and exact resume tokens.
- Bounded scenario results with baseline and ensemble uncertainty kept distinct, endpoint sensitivity contracts, structural cross-geography/sector spillover ranges, exact-baseline comparison, and no rankings.
- Citation-complete report exports that reject forecast-probability, causal, policy-recommendation, and policy-optimality claims.

## Commands

From the repository root, after the repository owner refreshes the workspace lockfile:

```sh
corepack pnpm --filter @economyos/scenario-lab typecheck
corepack pnpm --filter @economyos/scenario-lab build
corepack pnpm exec vitest run packages/scenario-lab/src
corepack pnpm exec vitest run packages/scenario-lab/src --coverage --coverage.include='packages/scenario-lab/src/**/*.ts'
corepack pnpm exec biome check packages/scenario-lab
```

## Workflow

1. Create a `BaselineIdentity` whose every observed, forecast, and model input was available by its point-in-time cutoff.
2. Create and revise a `ScenarioDefinition` against that exact baseline digest. Under `priority_then_action_key`, active actions are applied by start step, ascending priority, action kind, then action key; later `set` actions therefore have final precedence.
3. Record proposal, revisions, independent review, and independent approval in a `ScenarioGovernanceLedger`.
4. Create or idempotently register a bounded `ScenarioRunRequest`, then persist each state returned by `transitionScenarioRun`. Checkpoints include only contiguous completed ensemble members and resume only their exact replay identity.
5. After a worker output is marked succeeded, create a `ScenarioResultArtifact`. Compare results only when every result binds the same exact baseline digest and baseline metric values.
6. Export a report only after supplying complete observed-baseline, forecast-baseline, model, scenario-definition, and scenario-result provenance plus cited claims covering every output.

## Interpretation and delivery limits

This package provides in-memory domain validation and deterministic orchestration logic. It does not include persistence, a queue worker, UI, distributed locking, empirical models, model calibration, empirical validation, or production authorization. Callers must persist every returned immutable artifact atomically and enforce authentication before constructing actor identifiers.

Scenario outputs demonstrate declared model behavior. They are not observations, forecasts, forecast probabilities, causal estimates, policy advice, rankings, or evidence of a policy optimum. Sensitivity endpoint ranges and structural spillover ranges are not probability intervals and do not quantify model uncertainty.
