# Forecasting Engine

This package is the Phase 8 domain core for point-in-time nowcasting and forecasting. It provides
immutable feature, target, validation, tournament, forecast, outcome, score, and drift-review
artifacts. All scientific decimals are retained as strings at the contract boundary. Promotion and
operational-action checks fail closed.

The package intentionally does **not** claim that an empirical model, calibrated production
probability, data feed, persistence adapter, scheduler, or monitoring deployment exists. It ships no
trained weights and no synthetic metric is admissible as validation evidence. A production adapter
must separately provide approved point-in-time datasets, model cards and artifacts, independent
validation, persistence, authorization, monitoring, and deployment/rollback evidence required by
[`docs/09-model-governance.md`](../../docs/09-model-governance.md).
