# Phase 4 Crisis-Engine Methodology

## Audience and scope

This document explains the implemented Phase 4 domain, persistence, validation, and governed read boundary to model developers, independent validators, and research operators. It covers deterministic contracts, scoring, chronological validation, alert semantics in `packages/crisis-engine`, migration `0033_crisis_forecast_persistence.sql`, and the crisis forecast API.

It does not claim that EconomyOS currently has trained crisis models, empirical calibration evidence, a crisis UI, operational model execution, production alerts, or production approval. Those remain acceptance work.

## Independent hazards

The engine preserves exactly eight hazard identities:

- `FX`: foreign-exchange crisis;
- `BANK`: banking crisis;
- `SOV`: sovereign crisis;
- `MON`: monetary instability;
- `POL`: political instability;
- `COUP`: coup risk;
- `CIV`: civil conflict;
- `WAR`: interstate war.

Every forecast addresses one hazard and one canonical horizon: 30, 90, 180, or 365 days. A complete forecast run contains all 32 hazard/horizon slots. The package intentionally has no aggregate crisis score or combined probability. Dependence, cascades, and shared evidence do not make distinct event definitions interchangeable.

## Forecast contract

Each immutable forecast binds:

- geography, hazard, horizon, generation time, and point-in-time cutoff;
- exact decimal raw and calibrated probabilities;
- a calibrated-probability interval, confidence level, and uncertainty method;
- evidence and counter-evidence with observation time, availability time, vintage, and digest;
- leading indicators, assumptions, and explicit invalidation criteria;
- model/version, code, configuration, data-vintage, training-cutoff, and calibration-cutoff provenance.

Evidence available after the forecast cutoff is rejected. Evidence and counter-evidence cannot reuse an identity, and every evidence item must bind the forecast's declared data vintage. Runtime validators reject unknown hazard, direction, invalidation-operator, probability, timestamp, and provenance values rather than relying on TypeScript types alone.

Canonical JSON and SHA-256 make the forecast content-addressed and replay-comparable. A digest proves that content did not change; it is not a signature, approval, or proof that the model is correct.

## Durable governed evidence

Migration `0033` persists 14 append-only, tenant-isolated record types covering episode definitions and versions, declarations, forecast runs and slots, evidence bindings, run completions, backtests and folds, outcomes and scores, alert policies and events, and postmortems. All tables use forced row-level security and restricted runtime grants.

A run becomes readable only after it contains every one of the 32 exact hazard/horizon slots and passes completion checks. Slot payloads enforce the engine's bounded assumption and invalidation schemas rather than accepting arbitrary JSON. Supporting and contradicting evidence retain separate roles and cannot be replaced by an unexplained absence reason. Replays with changed content fail instead of rewriting history.

The app role exposes only bounded, non-enumerating reads. Run-list responses carry immutable pointers; run detail returns the exact 32 slot identities and digests without probability content. Slot detail exposes one independent hazard/horizon probability, uncertainty, provenance, assumptions, invalidation criteria, and point-in-time evidence pointers. It explicitly returns `aggregate: null`.

## Forecast ledger and outcomes

The in-memory ledger is append-only by construction. Forecast identities are unique and historical forecasts are never overwritten. Once a horizon is observable, an outcome can be attached exactly once with:

- realized event state and event time;
- exact Brier contribution and calibration residual;
- bounded log-loss contribution;
- threshold classification, direction accuracy, false-positive, and false-negative state;
- lead time for realized events.

Ledger integrity validates more than stored digests. It rebinds every score to a known forecast, rejects duplicate forecast or score identities, revalidates outcome timing, and recomputes every derived field. An attacker cannot make altered scoring fields valid merely by recomputing an unkeyed digest.

## Chronological validation

Backtests are expanding-window or rolling-window sequences with explicit training, calibration, and test intervals. Training and calibration precede each test interval. Feature engineering, normalization, hyperparameter selection, threshold selection, and calibration each declare their fit-through cutoff; any cutoff entering the test period is rejected. Test folds are ordered and non-overlapping.

This contract is a leakage sentinel, not empirical validation by itself. A valid fold definition still needs frozen point-in-time features, declared episode labels, executed model artifacts, and retained predictions.

## Calibration and rare-event metrics

Reliability output is hazard-specific and includes sample size, Brier score, log loss, expected and maximum calibration error, and explicit probability bins. Empty bins remain empty rather than receiving fabricated rates.

Rare-event output includes average precision, precision-recall area, operational precision/recall, false-alert and missed-event rates, recall at a fixed false-positive-rate constraint, and true-positive lead time. Equal predicted probabilities are evaluated as one threshold group, so metrics do not depend on arbitrary record order. No metric is reported across mixed hazard definitions.

## Episodes and alerts

Episode declarations bind a dated onset, optional end, hazard, geography, definition version, evidence, code, configuration, and assumptions. Event-cluster identity is deterministic over the dated episode definition, which prevents label aliases from silently becoming separate events.

Alert policies are hazard-specific research baselines. They require separate entry and exit thresholds, consecutive-observation hysteresis, a minimum evidence count, and an uncalibrated severity ceiling. Out-of-domain or insufficient-evidence observations suppress the alert instead of lowering uncertainty invisibly. Alert observations must be strictly chronological.

## Scientific limitations and acceptance boundary

The implementation establishes enforceable contracts and deterministic calculations. It does not establish:

- predictive skill, probability calibration, or transportability to a country or regime;
- approved episode definitions or label quality;
- suitable thresholds, false-alert tolerance, or operational response policy;
- independence of data sources or hazards;
- causality, a crisis cascade probability, or a combined safety judgment.

Phase 4 therefore remains `in_progress`. Tenant-isolated persistence, canonical bindings, exact run/slot reads, and the deterministic domain core are implemented. Acceptance still requires executed chronological backtests against representative point-in-time data, reviewed calibration evidence, model execution and monitoring, operational alert replay, crisis UI delivery, and an independent operations/model-risk gate.
