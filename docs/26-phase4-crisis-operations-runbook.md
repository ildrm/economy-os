# Phase 4 Crisis-Engine Operations Runbook

## Purpose

Use this runbook to exercise and review the implemented crisis-domain core. It is a research workflow, not a procedure for issuing production warnings.

## Preconditions

Before creating a forecast:

1. Pin the geography, exact `asOf` cutoff, and canonical 30/90/180/365-day horizon.
2. Bind one immutable model/version, configuration, code digest, data vintage, and training/calibration cutoff.
3. Confirm every feature and evidence item was available by `asOf`; observation time alone is insufficient.
4. Declare one of the eight exact hazard definitions. Do not substitute an aggregate label.
5. Record evidence, counter-evidence, uncertainty method, assumptions, leading indicators, and invalidation criteria.
6. Keep the model in research scope unless the independent governance lifecycle authorizes a later state.

## Issue and retain forecasts

1. Create each forecast with `createCrisisForecast` and retain its manifest digest.
2. For a complete country run, create exactly one forecast for every hazard/horizon slot with `createCrisisForecastRun`.
3. Append each issued forecast to a `ForecastLedger`. A duplicate forecast identity is a conflict; never replace the earlier record.
4. Through the ingest role, call `evidence.prepare_crisis_forecast_run`, append each slot with `evidence.append_crisis_forecast_slot`, and bind source evidence with `evidence.bind_crisis_forecast_evidence`.
5. Call `evidence.complete_crisis_forecast_run` only after all 32 identities and their required evidence/absence semantics are present. A changed replay is a conflict.
6. Serve bounded pointers through `app.list_crisis_forecast_runs`, exact manifests through `app.get_crisis_forecast_run`, and one probability-bearing slot through `app.get_crisis_forecast_slot`. Never expose an invented aggregate probability.

## Score outcomes

1. Wait until the complete forecast horizon is observable.
2. Apply the versioned episode definition that existed for the evaluation.
3. Record the realized outcome and event time, or an explicit non-event.
4. Append one outcome score. The engine recomputes Brier, log loss, residual, classification, error type, and lead time.
5. Run ledger integrity validation after deserialization and before computing metrics.
6. Never revise an old score in place. A label correction requires a forward, versioned persistence contract and retained supersession evidence.

## Run chronological validation

1. Define ordered training, calibration, and test intervals.
2. Record separate fit-through cutoffs for feature engineering, normalization, hyperparameters, thresholds, and calibration.
3. Validate the fold contract before training or scoring.
4. Materialize features through the canonical point-in-time path using the fold's knowledge cutoff.
5. Retain issued fold forecasts in the ledger; do not regenerate them after outcomes are known.
6. Compute reliability and rare-event metrics separately for each hazard and evaluation population.
7. Treat empty-event, empty-non-event, and empty-bin results as unavailable evidence, not zero performance.

## Evaluate alerts

1. Use a hazard-specific policy with explicit entry, warning, critical, and lower exit thresholds.
2. Set evidence minimums and consecutive entry/exit counts before evaluation.
3. Feed observations in strict chronological order.
4. Suppress out-of-domain or insufficient-evidence points.
5. Cap uncalibrated severity at the policy ceiling.
6. Retain the policy digest and complete alert timeline so a transition can be reproduced.

## Investigate failures

| Symptom | Interpretation | Action |
|---|---|---|
| forecast creation rejects evidence | evidence is late, contradictory, foreign to the vintage, or malformed | correct the upstream binding; never weaken the cutoff |
| run rejects a slot | one of 32 exact hazard/horizon identities is missing or duplicated | rebuild the run manifest from the issued forecasts |
| outcome scoring is early | the horizon is not fully observable | wait; do not shorten the declared horizon after issuance |
| ledger integrity fails | content, identity, timing, or a derived score changed | quarantine the artifact and compare it with the retained source manifest |
| backtest rejects a fold | a fit cutoff leaks, intervals overlap, or chronology regresses | rebuild the fold without using test-period information |
| alert is suppressed | evidence minimum or domain gate failed | expose the gate reason; do not publish a lower-confidence severity |
| calibration looks strong on few events | sampling uncertainty dominates | report counts and uncertainty; do not claim validated skill |

## Verification

Run the focused domain gate from the repository root:

```text
corepack pnpm --filter @economyos/crisis-engine build
corepack pnpm --filter @economyos/crisis-engine typecheck
vitest run packages/crisis-engine/src
vitest run packages/crisis-engine/src --coverage --coverage.include='packages/crisis-engine/src/**'
vitest run apps/api/src/crisis-forecasts.test.ts apps/api/src/crisis-forecasts.controller.test.ts
corepack pnpm db:verify
biome check packages/crisis-engine
```

The migration, forced-RLS, replay, tenant/authorization, exact 32-slot completion, API contract, and package gates are implemented. The full Phase 4 acceptance gate must still add representative point-in-time model fixtures, crisis UI tests, durable model-execution workflow recovery, empirical calibration review, and operational alert replay.

## Forward-only recovery

Do not edit an issued forecast, outcome, episode, policy, or alert history. Restrict the affected model, preserve its manifests, create a new versioned definition or artifact, replay chronological validation, and reactivate only after review. Historical failures remain part of the evidence.
