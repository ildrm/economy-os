# EconomyOS Domain Model

Status: canonical conceptual model

## Aggregate map

```text
Organization
  -> Workspace
     -> Dataset / Model / Scenario / Dashboard / Report / API Credential

EconomicEntity
  -> IndicatorSeries
     -> Observation -> Revision/Vintage
        -> Transformation -> FeatureValue -> StateSnapshot
           -> ModelRun -> Forecast -> OutcomeScore
           -> ScenarioRun -> Consequence

EvidenceItem -> RelationshipAssertion -> Temporal Graph
LineageNode  -> LineageEdge            -> Provenance Graph
```

## Identity and tenancy

### Organization

Commercial tenant and legal/account boundary. Key fields: identifier, name, residency policy, security profile, plan, status, created/disabled time.

### Workspace

Collaboration and data-isolation scope inside an organization. Public/global datasets can be referenced; private data and artifacts are owned by exactly one organization and normally one workspace.

### Principal and membership

A principal is a user, service account, or API credential. Membership links principals to organizations/workspaces with roles and attributes. Authorization decisions are recorded with policy version.

## Economic identity

### EconomicEntity

Stable canonical identity with type, names, localized aliases, external identifiers, valid interval, jurisdiction, and parent relationships. Types include country, region, city, institution, government, central bank, bank, company, industry, household group, currency, commodity, asset, instrument, port, route, policy, law, event, conflict, concept, and crisis.

### EntityAlias

Locale/source-specific name valid over time. Alias resolution never silently merges identities; uncertain matches create reviewed resolution candidates.

## Data assets

### Source

Provider/institution identity, authority class, terms URL, review date, attribution, access method, and source health policy.

### Dataset

Versioned logical product from a source. Contains license rights, geography/time coverage, revision policy, expected cadence, redistribution constraints, and tenant entitlement metadata.

### SeriesDefinition

Canonical indicator/instrument series with entity, indicator, unit, frequency, seasonal/real/nominal treatment, currency, price basis, transformation status, valid ranges, and source mapping.

### Observation

Immutable published value or explicit missing-status record. It has economic period, publication/release, retrieval, availability, effective, and system-recorded times; vintage/revision identity; source/dataset/series; unit/value/status; quality dimensions; raw object; and lineage.

Corrections create new observation revisions. A current view is a query, never an overwrite.

### RawObject

Immutable source payload manifest: content digest, object-store key, media type, request parameters, retrieval time, encryption, license, parser version, and retention policy.

## Scientific definitions

### IndicatorDefinition

Meaning, unit semantics, valid transformations, frequency, source preferences, comparability notes, and localized label.

### FeatureDefinition

Versioned formula/input contract, time alignment, missing policy, normalization, applicable entities/regimes, leakage constraints, and lineage rules.

### ConceptDefinition

Versioned measurement class (`direct`, `derived`, `latent`, `composite`, `normative_proxy`, `risk_estimate`, `structural`) plus evidence requirements, weights, interpretation, limitations, prohibited claims, and model owner.

### StateSnapshot

Entity/as-of/model-version representation of one state dimension. It contains feature references, results, trends, acceleration, percentiles, regime probabilities, quality, coverage, confidence, uncertainty, flags, and execution manifest.

Economic state is a composition of independently queryable snapshots; there is no required single scalar.

## Models and forecasts

### ModelDefinition and ModelVersion

Model purpose, target, horizon, owner, family, features, data requirements, assumptions, prohibited uses, code artifact, training/evaluation windows, approval, and lifecycle status.

### ModelRun

Immutable execution with as-of, data snapshot, feature set, code/config/environment, seed, model artifact, tenant, status, metrics, logs, and outputs.

### Forecast

Immutable target/entity/origin/horizon estimate. Stores raw and calibrated values separately, uncertainty components, base rate, evidence/counter-evidence, invalidations, calibration and OOD status, point-in-time grade, model/data versions, and issuance record.

### ForecastOutcome

Later observation of the target plus scoring metadata. It links to, never mutates, the forecast. Scores can include Brier/log-loss contribution, direction/magnitude error, lead time, and error classification.

## Events, hazards, and graphs

### CrisisEvent

Versioned hazard-specific event with onset interval, canonical onset, continuation/recovery, severity, source snapshot, adjudication, and shared cluster identifier.

### RelationshipAssertion

Directed relation between entities, valid interval, discovery time, evidence set, direction/strength/lag, uncertainty, regime/geographic scope, source/model/expert identity, and causal classification.

Causal classifications are controlled vocabulary: observed association, predictive relationship, hypothesized pathway, econometrically estimated effect, structurally assumed relation, expert-defined relation, or simulation assumption.

### NetworkEdge

Dated, channel-specific exposure such as trade, banking, sovereign debt, currency, commodity, energy, technology, supply chain, shipping, sanctions, migration, remittance, or investment. Edge weights retain unit and source; absent data is not zero exposure.

## Scenarios and consequences

### ScenarioDefinition and ScenarioVersion

Name, scope, assumptions, probability status, start/duration, shocks, dependencies, policy reactions, author, sharing/entitlement, and revision parent. Published versions are immutable.

### Shock

Variable, entity scope, magnitude/range, start, duration, probability/uncertainty, mechanism, evidence, and assumption classification.

### ScenarioRun

Execution manifest plus baseline/scenario trajectories, uncertainty, causal/assumed paths, consequences, and failure/coverage information.

### PopulationSegment

Versioned intersection of income, wealth, age, employment, occupation, housing tenure/mortgage, geography, household size, and retirement dimensions. Small-cell/privacy controls apply to private data.

### Consequence

Scenario/segment/metric/horizon result with baseline, delta/range, winners/losers direction, mechanism, model, evidence, uncertainty, and limitations.

## Product objects

Dashboard, widget, report, export, watchlist, alert rule, alert event, comment, annotation, feature flag, subscription, plan, entitlement grant, quota, usage record, and audit event are product aggregates. They reference scientific artifacts by immutable identifiers rather than copying mutable values.

## Invariants

1. Every tenant-private aggregate has an organization identifier.
2. Every analytical value references a definition/version and execution manifest.
3. Every observation is either finite and unit-valid or explicitly missing with no numeric value.
4. Release, retrieval, period, availability, effective, and system times are never substituted silently.
5. Forecasts, published scenario versions, raw objects, model artifacts, and audit events are append-only.
6. A probability requires a declared target, horizon, calibration status, and supported domain.
7. A causal label requires a causal classification and supporting identification/evidence.
8. License and entitlement checks apply before query/export, not only in the UI.
9. Deletion of personal/private content uses governed tombstones/retention workflows without erasing required immutable scientific history.

## Legacy mapping

- Humanity `Observation` and `ConceptResult` map to canonical Observation, ConceptDefinition, and StateSnapshot.
- Investment `AssetScore` maps to a model result with separate macro and valuation components.
- FX-CPM `ForecastRecord`, events, alerts, and PIT modes map nearly one-to-one after identifier and manifest normalization.
- Kavosh candle/snapshot contracts map to SeriesDefinition, Observation, FeatureValue, and StateSnapshot in the market dimension.
