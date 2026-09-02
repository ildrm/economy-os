# Phase 8 Nowcasting and Forecasting Operations Runbook

## Purpose

Use this runbook to construct and challenge governed forecasting artifacts. The current package is a research contract, not a deployed forecasting service or permission to publish a calibrated probability.

## Materialize features

1. Pin geography, `asOf`, canonical dataset snapshot/digest, feature definitions, materializer code, and transformation-fit cutoff.
2. Supply immutable observations with observation and availability times plus vintage/observation digests.
3. Run `materializePointInTimeFeatures`; retain explicit missingness and the deterministic selection identity.
4. Reject any selected observation or transformation fitted after its declared cutoff.
5. Preserve the snapshot manifest. Rebuilding after later releases must reproduce the historical selection, not use today's latest value.

## Define targets and validation

1. Freeze target meaning, task, population, horizon, window, label availability, revision, and scoring policy.
2. Declare naive/base-rate and simple interpretable baselines before inspecting final test results.
3. Build expanding or rolling folds with separated training, calibration, and test intervals.
4. Pin every preprocessing, selection, tuning, calibration, threshold, and label cutoff in its permitted earlier interval.
5. Retain predictions, model/data artifacts, and failed experiments per cell. Never replace a chronological fold with a random split.

## Run a model tournament

1. Evaluate each model and baseline in the same geography/target/horizon/regime cell.
2. Record exact held-out metrics, calibration, stability, interpretability, cost, sample size, and event count.
3. Apply a predeclared champion-selection policy with materially positive minimum benefit.
4. Require an independent validation-review identity.
5. Treat `promote_challenger` only as a recommendation; obtain a separate deployment approval.
6. Keep challengers in shadow mode until approval. Shadow output must never trigger an operational action.

## Issue and score forecasts

1. Pin target, model artifact, feature snapshot, issuance/knowledge times, evaluation window, calibration gate, domain state, limitations, and prohibited uses.
2. Use calibrated-probability language only when every calibration condition passes. Otherwise use the explicit lower-authority semantic or abstain.
3. Append the immutable forecast to its ledger before the outcome is observable.
4. Attach an outcome only after the evaluation window and label-availability conditions complete.
5. Compute the task-appropriate score and retain it separately. Never revise the issued forecast.

## Monitor drift

1. Measure all applicable input, feature, missingness, output, error, and calibration signals over fixed windows.
2. Bind each signal to supporting artifact evidence, sample size, threshold, direction, severity, and limitations.
3. Aggregate breached signals through the declared review policy.
4. Open a model-risk review for restriction/disable recommendations. Do not mutate lifecycle automatically.

## Failure handling

| Symptom | Meaning | Required action |
|---|---|---|
| feature snapshot rejects an observation | data is late, malformed, duplicated, or foreign to the contract | correct the upstream binding; never relax the cutoff |
| validation fold fails | a fitting step leaks or chronology overlaps | rebuild before training/evaluation claims |
| challenger fails one gate | evidence is insufficient for promotion | retain the incumbent and record the failed gate |
| calibration gate is unavailable/failed | probability language is unsupported | downgrade semantics or abstain |
| model is out of domain | current input lies outside supported use | restrict/disable as declared and open review |
| ledger digest fails | forecast history changed | quarantine the ledger and reconcile from retained manifests |
| drift breach occurs | review threshold was crossed | preserve the signal and follow governed review; do not auto-promote/disable |

## Verification

From the repository root, run:

```text
corepack pnpm --filter @economyos/forecasting-engine build
corepack pnpm --filter @economyos/forecasting-engine typecheck
vitest run packages/forecasting-engine/src
vitest run packages/forecasting-engine/src --coverage --coverage.include='packages/forecasting-engine/src/**'
biome check packages/forecasting-engine
```

The package gate is not Phase 8 acceptance. Add clean-room persistence/RLS, real runner and data integration, API/UI, durable workflows, empirical temporal/calibration evidence, monitoring operation, and independent model-risk approval before changing status.

## Forward-only recovery

Preserve feature, target, validation, tournament, forecast, outcome, score, and drift manifests. Restrict the affected model, issue a new version/artifact or corrected source vintage, rerun chronological validation, and create forward deployment/review evidence. Never overwrite historical predictions or test results.
