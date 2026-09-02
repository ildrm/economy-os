# Phase 11 Scenario Laboratory Methodology

Status: `in_progress` — governed domain/runtime core implemented; persistence, workers, UI, and empirical validation remain outstanding.

## Baseline and scenario identity

`@economyos/scenario-lab` pins each scenario to exact point-in-time observed and forecast snapshots, model artifact, code/configuration digests, and baseline-result digest. Inputs must have been available by the cutoff. Definitions and outputs are permanently counterfactual research artifacts and cannot enter canonical observed datasets.

A versioned definition records authors/contributors, citations, assumptions, limitations, typed shocks, and explicitly hypothetical policy interventions. Multi-action application is deterministic. Overlapping actions either fail closed or follow the declared priority/action-key resolution policy; conflicts cannot depend on insertion order.

## Collaboration and execution

Proposal, revision, independent review, and independent approval form a hash-chained ledger. Actor separation prevents self-approval, and changes to an approved definition require a new revision. Only approved definitions can produce replay-addressed, idempotent, resource-bounded run requests.

The durable state contract covers queued, running, checkpointed, succeeded, failed, and cancelled states with optimistic versions. Retry is allowed only from failed/cancelled state with a durable reason and identical replay identity. Checkpoints contain contiguous completed ensemble members and resume only the exact request.

## Results and interpretation

Results retain baseline uncertainty and ensemble disagreement separately. Sensitivity endpoints and cross-geography/sector spillover ranges are structural scenario ranges, not probability intervals or model uncertainty. Comparisons require the exact same baseline digest and metric values, retain caller order, and compute no rank.

Report export fails closed unless baseline, forecast, model, scenario, and result provenance is complete and every output claim is cited. Forecast-probability, causal, policy-recommendation, and policy-optimality language is prohibited.

## Executable evidence and limits

- 78 tests pass.
- Focused coverage: 89.99% statements, 85.69% branches, 97.77% functions, 92.14% lines.
- TypeScript typecheck/build, Biome, and repository starter validation pass.

The current package supplies in-memory validation/orchestration logic, not storage, a queue worker, distributed locking, UI, authenticated actor establishment, calibrated models, empirical validation, or production authorization.
