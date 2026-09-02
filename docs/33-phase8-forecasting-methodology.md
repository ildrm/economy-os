# Phase 8 Nowcasting and Forecasting Methodology

## Scope and evidence boundary

`packages/forecasting-engine` implements deterministic point-in-time feature, target, baseline, chronological-validation, tournament, forecast-ledger, outcome-scoring, and drift-review contracts. It ships no trained weights, data feed, empirical performance claim, or production-approved probability.

A structurally valid forecast is not necessarily accurate or calibrated. Synthetic/demo metrics cannot satisfy an empirical validation gate.

## Point-in-time feature materialization

A feature snapshot pins geography, economic cutoff, materialization time, canonical dataset snapshot/digest, feature-definition digest, materializer code digest, and transformation-fit cutoff. Each feature definition declares a stable key, unit, and value semantics.

Candidate observations retain observation and availability times, vintage identity/digest, and observation digest. Materialization selects only information available by `asOf`, using the deterministic order `latest_available_then_latest_observed_then_observation_id`. Missing features remain `null` with an explicit reason. Later vintages cannot replace the historical selection.

## Targets and baselines

Target definitions are versioned for either binary event probability or continuous nowcast tasks. They pin entity population, outcome/series identity, horizon, evaluation-window rule, label availability lag, revision policy, and metric policy.

Every tournament includes declared baselines. The supported baseline classes are naive, historical base-rate, and simple interpretable. A complex challenger is compared against these references; complexity itself is never selection evidence.

## Chronological validation

Validation plans permit expanding or rolling windows only. Each fold declares training, calibration, and test intervals plus leakage sentinels for feature engineering, normalization, imputation, feature selection, hyperparameter and threshold selection, calibration, and label availability. Every fitting decision must remain inside its authorized earlier interval, and test folds advance without overlap.

This contract detects temporal leakage in supplied metadata. It does not prove that an external training implementation honored the contract; executed model/data artifacts and retained fold predictions are still required.

## Model tournament and champion/challenger gate

Tournament cells are explicit geography × target × horizon × regime combinations. Entries retain held-out Brier/log-loss, expected calibration error, stability, interpretability, inference cost, sample/event counts, model role, and artifact identity.

A challenger is recommended only when it clears all predeclared gates:

- material held-out improvement over the incumbent on the primary metric;
- calibration, stability, and interpretability bounds;
- inference-cost bound;
- minimum sample and event counts;
- independent validation-review identity.

Even a passing recommendation requires a separate deployment approval. It does not mutate lifecycle state automatically.

## Forecast semantics and uncertainty

Forecast manifests pin target/horizon/evaluation window, model/version/artifact/code/configuration, feature snapshot, issuance and knowledge times, domain assessment, limitations, prohibited uses, and exact decimal output.

Output language is one of `calibrated_probability`, `uncalibrated_risk_estimate`, `continuous_nowcast`, or `insufficient_evidence`. Calibrated-probability language is allowed only when the explicit calibration gate passes and the model/domain/lifecycle conditions permit it. Out-of-domain or insufficient inputs cannot be hidden behind a number.

Uncertainty remains separated into parameter/model, calibration, data/revision/measurement, input/source disagreement, scenario/structural assumption, ensemble disagreement, and label/onset ambiguity. Incomparable uncertainty sources are not collapsed into an unexplained interval.

Shadow challengers always carry `operationalActionPermission: prohibited`, regardless of metric performance.

## Ledger, outcomes, and monitoring

Forecasts append to a digest-linked immutable ledger. Binary outcomes are attached only after their evaluation window and support Brier/log-loss scoring. Continuous outcomes support exact error and squared-error scoring. Outcomes and scores never rewrite the issued forecast.

Drift signals cover input, feature, missingness, output, error, and calibration categories. Threshold evaluation is deterministic and limitations/sample size are mandatory. A drift review may recommend continue, open review, restrict, or disable, but always records `automaticLifecycleMutation: false` and requires governed human review.

## Limitations and acceptance boundary

Phase 8 remains `in_progress`. Acceptance requires durable tenant-isolated feature/forecast/evaluation persistence, real model runners and data, executed temporal benchmarks, calibration/reliability evidence, production champion/challenger workflow, API/UI, scheduled monitoring, workflow recovery, and independent validation/approval.
