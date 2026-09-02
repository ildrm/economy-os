# EconomyOS Point-in-Time Data Architecture

Status: non-negotiable scientific baseline

## Goal

For any historical analysis time, reconstruct the information set that a qualified analyst could have possessed, state the quality of that reconstruction, and prevent later releases/revisions from entering calculations.

## Time dimensions

Every observation revision stores independent fields:

| Time | Meaning |
| --- | --- |
| `period_start`, `period_end` | when the phenomenon occurred |
| `source_publication_time` | source publication timestamp where distinct |
| `original_release_time` | first public availability of this revision/value |
| `availability_time` | earliest platform-authorized availability after embargo/license rules |
| `retrieval_time` | when EconomyOS obtained the payload |
| `revision_time` | when a revision became public |
| `effective_from`, `effective_until` | valid-world interval for entities/relations/policies |
| `recorded_at`, `superseded_at` | system transaction interval |
| `model_execution_time` | when a derived/model result was run |
| `as_of` | requested information cutoff |

No field substitutes for another without a documented reconstruction policy.

## Point-in-time grades

### `TRUE_VINTAGE`

The exact release/revision existed and was retrieved/archived by the cutoff. Eligibility requires release, availability, and retrieval on or before `as_of`.

### `RECONSTRUCTED_POINT_IN_TIME`

Documented historical release timing is known, but the payload was archived later or the value may be a current revision. Reconstruction rules and revised-value share are disclosed.

### `REVISED_HISTORY_ONLY`

Only period boundaries are defensible; current revised history is used. Results are research sensitivity analyses and never called real-time backtests.

### `MIXED`

Inputs use multiple grades. The result reports shares by grade and inherits the weakest material limitation.

### `UNKNOWN`

Release/availability semantics are insufficient. The record cannot enter a point-in-time model unless a preapproved conservative lag rule applies.

## Eligibility algorithm

For each series/economic-period identity:

1. Reject periods ending after `as_of`.
2. Apply dataset license/embargo availability.
3. Under true vintage, require release, availability, and retrieval no later than `as_of`.
4. Under reconstructed mode, require observed/documented release no later than `as_of`; later retrieval is retained as a limitation.
5. Under revised-history mode, admit eligible periods and mark the grade.
6. Select the newest eligible revision by scientific release/revision order; use a source vintage token only as a deterministic tie-breaker.
7. Never replace explicit missing/source-failure status with zero.
8. Return selected and excluded records with reason counts.

## Query contract

Every analytical data query includes:

```json
{
  "as_of": "2007-09-01T23:59:59Z",
  "vintage_policy": "TRUE_VINTAGE",
  "entity_ids": ["..."],
  "series_ids": ["..."],
  "quality_floor": null,
  "include_exclusions": true
}
```

Responses include achieved grade, selected revisions, exclusions/reasons, coverage, revised-value share, release-lag assumptions, dataset versions, and a snapshot digest.

`as_of` is mandatory for scientific and report endpoints. A current UI supplies the current server time explicitly.

## Bitemporal persistence

World validity (`effective_*`) and system record time (`recorded_*`) are distinct. Observations use economic period plus release/revision time, while mutable metadata such as entity names or regime classifications uses valid and transaction intervals. Historical corrections append a new system version and preserve what the platform believed previously.

## Ingestion flow

```text
Source response
 -> immutable raw object + digest
 -> schema/parser validation
 -> release/retrieval/license metadata validation
 -> normalized candidate revisions
 -> quality checks and source comparison
 -> canonical append
 -> lineage edges
 -> dataset snapshot manifest
 -> downstream feature invalidation/rebuild event
```

Raw zones are immutable. Promotion does not modify raw payloads. Parser corrections produce a new transformation/run and canonical revision, linked to the prior output.

## Historical feature computation

- Feature time alignment uses only selected revisions available at each origin.
- Scaling, imputation, threshold selection, feature selection, and dimensionality reduction are fit inside the training window.
- Derived release time is the maximum availability time of its material inputs plus actual computation availability.
- Derived grade cannot be stronger than its weakest material input.
- Training datasets are frozen by content digest; rebuilding creates a new dataset snapshot.
- Rolling and cross-sectional calculations expose the reference window and constituent record IDs.

## Economic Time Machine

The time-machine context is an application-wide state containing `as_of`, vintage policy, model-version policy, locale, tenant, and entitlements. Navigation preserves it. Charts, documents, news, scenarios, model results, and evidence show if they are unavailable at the selected historical date. Later revisions may be displayed only in a separately labeled comparison mode.

## Forecast and label timing

Forecast issuance uses the information cutoff. Outcome labels can be attached after the horizon elapses, but a label database's publication time cannot enter model features. Frozen label snapshots record version/retrieval/license/digest. Crisis cluster membership is used to prevent related-event leakage.

## Conservative release rules

A source adapter declares exactly one:

1. observed release timestamp;
2. versioned release calendar with archive evidence;
3. conservative lag rule approved for a dataset/version;
4. unknown/ineligible.

Conservative lag rules live in versioned metadata, are tested against known releases, and appear in outputs. They are not embedded in ad hoc feature code.

## Leakage tests

- future releases and revisions are excluded;
- retrieval and release are not conflated;
- all preprocessing fits within folds;
- peer/network inputs use dated edges;
- feature store online/offline selection matches;
- current-year incomplete outcome windows are not coded negative;
- post-event exclusion rules are enforced;
- model/calibration/threshold artifacts predate test forecasts;
- repeated historical query reproduces the same snapshot digest.

## Performance

Indexes begin with tenant/visibility, series/entity, period, release/availability, and revision order. Current and as-of views use parameterized SQL and bounded pagination. Frequently requested immutable snapshots may be cached by tenant, entitlement digest, query, as-of, policy, and dataset snapshot; cache never becomes source of truth.

## Acceptance criteria

- canonical PIT selector passes reference cases ported from Humanity and FX-CPM;
- database constraints reject inconsistent dates/statuses;
- every feature/model run records a snapshot digest and achieved grade;
- no historical result can claim true vintage when any material input is revised-history-only;
- excluded records and their reasons are inspectable;
- temporal backtests demonstrate preprocessing and calibration isolation.
