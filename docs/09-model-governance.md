# EconomyOS Model Governance Framework

Status: mandatory governance policy

## Principles

Models are versioned scientific products with owners, evidence, limitations, approval, monitoring, and retirement. Complexity does not confer authority. A model cannot use probability language, enter a production scenario, or trigger a severe alert merely because it executes successfully.

## Roles and separation

| Role | Responsibility |
| --- | --- |
| Model owner | purpose, maintenance, monitoring, remediation |
| Model developer | implementation and research evidence |
| Data owner/steward | data fitness, license, quality, lineage |
| Independent validator | reproduce, challenge, test limitations |
| Model risk manager | tier, approval conditions, inventory |
| Deployment approver | authorize environment/stage promotion |
| Business owner | intended use, user controls, consequence ownership |
| Security/privacy/legal reviewer | threat, personal/licensed data and claim boundaries |

High-impact models require independent approval; one principal cannot be sole developer, validator, and production approver.

## Model inventory

Every model definition records:

- identifier, owner, purpose, users, decisions supported;
- target/estimand, entity population, horizon, output semantics;
- family and implementation artifact;
- feature and dataset requirements;
- assumptions, causal classification, known limitations;
- prohibited uses and legal language;
- impact/risk tier and validation cadence;
- current lifecycle status.

Lifecycle: proposed, research, validated, approved, staged, production, restricted, disabled, retired. Status history is append-only.

## Model card

Each version includes purpose, target, training data and periods, features, point-in-time grade, preprocessing, method, hyperparameters/priors, uncertainty, calibration, validation design/results, subgroup/regime performance, robustness, fairness/consequence concerns, OOD rules, monitoring, retraining, owner, approvals, version history, and prohibited uses.

No performance field may contain synthetic/demo results as empirical evidence.

## Model artifact manifest

Content-addressed artifact includes code commit, package lock/SBOM, environment, configuration, ordered features, normalization/imputation, training/calibration/validation snapshots, label taxonomy, random seeds, serialized model, metrics, approval, and digest/signature.

## Development and evaluation

- temporal targets use chronological expanding/rolling folds;
- preprocessing, imputation, normalization, selection, tuning, calibration, and thresholds occur inside their allowed folds;
- final test data are inspected once after design freeze;
- country, regime, event-cluster, and feature-era holdouts are required where relevant;
- baselines include naive/base-rate and simple interpretable models;
- model tournament evaluates country × target × horizon × regime;
- challengers replace champions only with material held-out benefit and acceptable calibration/stability/interpretability/cost;
- failed experiments and negative FX/feature ablations remain visible.

## Probability and calibration gate

Output may be called a calibrated probability only when:

1. target and horizon are versioned;
2. frozen empirical labels and base rates exist;
3. predictions are out of sample under verified chronological design;
4. calibration is fit before final test and evaluated with Brier/log loss/reliability;
5. current score lies in supported calibration/model domain;
6. event counts support the claimed precision;
7. model card and approval explicitly permit the language.

Otherwise use `uncalibrated_risk_estimate`, `risk_index`, `scenario_assumption`, or `insufficient_evidence`.

## Causal model gate

Causal outputs require an identification strategy (for example DiD, synthetic control, IV, RD, event study, or structural assumption), pre-treatment checks, interference/parallel-trend/exclusion/continuity assumptions as relevant, sensitivity/placebo/falsification tests, and a limitations review. Causal discovery creates hypotheses only.

## Uncertainty

Store separately where possible:

- parameter/model uncertainty;
- calibration uncertainty;
- data/revision/measurement uncertainty;
- input/source disagreement;
- scenario/structural assumption uncertainty;
- ensemble disagreement;
- label/onset ambiguity.

Do not compress incomparable uncertainty into an unexplained interval. Confidence in evidence is not event probability.

## Independent validation checklist

- reproduce data snapshot and environment;
- audit PIT semantics and leakage;
- compare equations/code with methodology;
- verify numerical stability and library parity;
- challenge missingness/imputation and source selection;
- rerun chronological and holdout results;
- assess calibration, rare-event denominators, subgroup/regime performance;
- conduct robustness, sensitivity, stress, and OOD tests;
- inspect explanation fidelity and invalidation criteria;
- review security, privacy, licensing, cost, and operational failure modes.

## Deployment and prediction ledger

Production deployment pins a model version and approved policy. Every inference creates or references an immutable run. Forecasts are append-only. A later model version never rewrites old predictions. Outcomes and scores attach through separate records. Shadow/challenger outputs are labeled and cannot trigger operational actions unless approved.

## Monitoring

Monitor input/feature/missingness/quality drift, source health, domain distance, output distribution, calibration, forecast error, alert burden, false positives/negatives, lead time, subgroup/regime performance, latency, failures, and cost. Threshold breaches create review records and may restrict/disable the model.

## Change classes

- Patch: implementation correction with unchanged semantics and demonstrated parity.
- Minor: additive feature/config or retraining within approved method; requires validation.
- Major: target, formula, data family, causal claim, calibration, or output meaning changes; requires new model version and full approval.

All changes preserve prior artifacts and predictions.

## Human oversight

Analysts may annotate, dispute evidence, flag relationships, propose model restrictions, and approve releases. They cannot silently edit model history or source observations. Emergency disable is immediate and audited; re-enable requires documented review.

## Legacy model admission

- Humanity composites enter as `expert_prior`/transparent baseline models until validated.
- Investment scores enter as `macro_suitability` candidate models, never recommendations.
- FX-CPM contracts and reference algorithms enter research status; no bundled probability claim is admitted.
- Kavosh technical intelligence enters as deterministic descriptive analysis with heuristic evidence agreement.

## Release evidence

A model status becomes `validated` only when its validation report, card, artifact, data/label manifests, approvals, and reproducible commands are stored and checks pass. `Production` additionally requires monitoring, runbook, owner/on-call, security/license approval, deployment/rollback evidence, and user-facing limitations.
