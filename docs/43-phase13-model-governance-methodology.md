# Phase 13 Model Governance and Research Operations Methodology

Status: `in_progress` — the governed domain core is implemented; durable services, external trust, and empirical model validation remain outstanding.

## Purpose and boundary

`@economyos/model-governance` defines the immutable records and lifecycle rules used to review EconomyOS models. It separates model identity, research evidence, validation, release authorization, deployment, monitoring, outcomes, scoring, incidents, restrictions, rollback, and retirement. A passing package gate proves those rules are executable; it does not validate any real economic model.

Synthetic or demonstration evidence cannot authorize empirical, calibrated, causal, or production claims. A SHA-256 manifest establishes content identity relative to a pinned value, not signer authenticity.

## Inventory and reproducibility

A model version binds its model card, code and configuration, runtime environment, package/SBOM identity, ordered feature contract, data and label snapshots, training and calibration cutoffs, artifacts, random seeds, metrics, limitations, and owners. Material changes create a new immutable version.

Experiments retain successful, failed, and negative results. Reproducibility receipts bind the exact command, environment, inputs, outputs, and tolerances. Notebook and research records preserve authorship, dependencies, execution provenance, limitations, and independent peer review without treating a notebook as an approved deployment artifact.

## Lifecycle and separation of duties

Lifecycle changes are append-only hash-chained events. Runtime integrity checks validate every event, its preceding digest, chronology, actor role, model/version identity, evidence references, and requested transition. High-impact validation and release steps require independent actors; a producer cannot approve the evidence they produced.

Validation gates cover point-in-time availability, leakage and chronology, holdout design, baseline comparison, calibration where claimed, causal identification where claimed, reproducibility, security and licensing, operational ownership, monitoring, rollback, and user-visible limitations. Production additionally requires accepted deployment and rollback evidence plus an active monitoring contract.

## Monitoring, outcomes, and retirement

Forecasts are immutable ledger entries. Realized outcomes and scores are separate later records, so observation cannot rewrite a forecast. Monitoring observations, incidents, restrictions, disable recommendations, rollback records, and retirement events preserve their own timing and evidence. Emergency restriction remains auditable; re-enable or replacement requires a new reviewed event.

## Executable evidence and limits

- 49 tests pass.
- Focused coverage: 90.44% statements, 82.06% branches, 98.79% functions, and 92.46% lines.
- TypeScript typecheck/build, Biome, and distribution export checks pass.

The package is an in-process domain implementation. It has no forced-RLS persistence, authenticated transport, artifact/signature trust store, notebook sandbox, monitoring worker, deployment controller, model UI, or empirical validation of an actual model. Those remain required before Phase 13 acceptance or any production-model claim.
