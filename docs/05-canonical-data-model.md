# EconomyOS Canonical Data Model

Status: approved logical schema  
Storage baseline: PostgreSQL 17 + TimescaleDB

## Modeling rules

- UUIDv7 identifiers are application-generated for sortable global identity.
- Timestamps are UTC `timestamptz`; economic dates may also use `date` plus declared precision.
- Money and published decimal values use `numeric`; analytical arrays may use floating point with method/tolerance metadata.
- Immutable records are appended and superseded, never updated in place.
- Tenant-private tables contain `organization_id`; global records use explicit public scope.
- JSONB is used for extensible metadata, not to avoid normalized core relations.
- Every table has created time and source/execution identity where relevant.

## Identity and access tables

### `organizations`

`id`, `slug`, `name`, `status`, `residency_policy`, `security_profile`, `created_at`, `disabled_at`.

### `workspaces`

`id`, `organization_id`, `slug`, `name`, `visibility`, `created_at`, `archived_at`. Unique `(organization_id, slug)`.

### `principals`

User/service/API identities: `id`, `kind`, external identity reference, status, profile locale/time zone, created/disabled time. Authentication secrets are not stored in general profile columns.

### `memberships`, `roles`, `permissions`, `role_permissions`, `principal_roles`

Membership and grants always include organization/workspace scope and validity. Attribute constraints and policy version accompany decisions.

## Economic identity tables

### `entities`

`id`, `entity_type`, canonical label, jurisdiction/parent references, validity interval, resolution status, public/private scope, organization/workspace if private.

### `entity_aliases`

`entity_id`, locale, script, alias, source, `valid_from`, `valid_until`, confidence. Search normalization is stored separately from display value.

### `external_identifiers`

`entity_id`, namespace, value, validity interval, source. Unique namespace/value/interval constraints prevent silent collisions.

## Source, license, and dataset tables

### `sources`

Provider/institution identity, authority class, access type, canonical URL, health policy, attribution, and active state.

### `licenses`

License name/version, terms URL, reviewed time, commercial/derivative/redistribution flags, retention/attribution text, legal review status.

### `datasets`

Source, license, logical name, description, coverage, cadence, revision behavior, point-in-time capability, public/private ownership, and data classification.

### `dataset_versions`

Immutable version/vintage identifier, release time, retrieval time, source version, raw-manifest digest, schema version, license snapshot, status, and supersession.

### `raw_objects`

Dataset version, object key, SHA-256 digest, size, media type, request/response metadata, retrieval time, encryption key reference, parser version, retention date, and quarantine status. Unique content digest plus dataset context provides idempotency.

## Indicator and series tables

### `indicator_definitions`

Stable ID, ontology concept, canonical name, definition, unit family, preferred frequency, nominal/real and adjustment applicability, valid range, aggregation rules, localization key, methodology version.

### `units`

UCUM-compatible code where possible, dimension, scale, currency/base-year metadata, localized display rules, and conversion policy.

### `series`

Indicator, subject entity, source/dataset mapping, source series code, unit, currency, frequency, seasonal adjustment, nominal/real, price basis, population basis, transformation status, validity interval, and license entitlement.

### `observations`

Logical observation identity: `id`, series, subject, economic period start/end and precision, value/status, unit, dataset version, source record key, quality record, raw object, organization scope, and `recorded_at`.

### `observation_revisions`

Append-only published versions: observation identity, revision sequence, value/status, original release time, source publication time, availability time, retrieval time, revision time, vintage, revision status, raw object, digest, supersedes ID, and recorded transaction interval.

Only revisions contain published values. `observations` identifies the economic fact slot; a query selects an eligible revision.

### `observation_flags`

Outlier, suspected break, unit change, source disagreement, manual review, embargo, license restriction, and other quality/governance flags with evidence and validity.

## Quality and provenance tables

### `quality_assessments`

Subject type/ID, assessment version, completeness, timeliness, consistency, revision stability, authority, outlier score, cross-source agreement, overall score, hard gates, explanation, and computed time.

The overall score is derived and does not replace components.

### `lineage_nodes`

Typed references to raw object, dataset version, observation revision, transformation, feature, model artifact, run, forecast, scenario, report, and export.

### `lineage_edges`

`from_node`, `to_node`, operation, parameter/config digest, code version, created time, organization scope. Acyclic provenance edges are enforced at service level; feedback belongs in the economic graph, not provenance.

### `transformations`

Name/version, executable artifact, input/output contracts, temporal alignment, formula/config, owner, validation, status.

## Feature and state tables

### `feature_definitions`

Versioned feature identity, inputs, formula, time alignment, normalization, missing/imputation policy, leakage controls, applicable entity/regime, output unit, owner, maturity.

### `feature_values`

Entity, feature version, period, `as_of`, point-in-time grade, value/status, uncertainty, quality, run, and lineage node. Timescale hypertable partitioned by period or as-of according to query profile.

### `state_definitions`

State dimension/version, included feature/concept definitions, aggregation/model artifact, output contract, methodology, owner, maturity.

### `state_snapshots`

Entity, dimension, as-of, horizon where applicable, state version, values JSON with normalized relational summaries, regime distribution, trend/acceleration, coverage, confidence, uncertainty, quality, flags, run, and lineage.

## Model governance and forecast tables

### `model_definitions`, `model_versions`, `model_cards`

Purpose/target/family/owner plus immutable version artifact, training data/features, config/code/environment digest, validation report, approval, stage, and card content.

### `model_runs`

Organization/workspace, model version, run type, as-of, input snapshot digest, feature set, seed, configuration, environment, status, start/end, cost, outputs, logs, and trace.

### `forecasts`

Immutable issuance: target, entity, hazard, origin/as-of, horizon, raw estimate, calibrated estimate, estimate label, uncertainty components, base rate, confidence, coverage, calibration/OOD/PIT status, evidence, counter-evidence, invalidation set, model/data/run, and issued time. A database trigger prevents update/delete for ordinary roles.

### `forecast_outcomes`, `forecast_scores`

Outcome definition/version, observation time/value/status, label snapshot, attached time; scoring method/version and contributions. Multiple legitimate outcome definitions coexist rather than overwrite.

### `invalidation_conditions`, `invalidation_observations`

Machine-readable condition, threshold/direction/window, evidence source, activation state, and evaluations over time.

## Graph tables

### `relationship_assertions`

Canonical audited metadata for subject/predicate/object, valid/discovered times, causal class, direction/strength/lag, uncertainty, regime/geography, evidence/model/expert, status, tenant/license.

### `relationship_evidence`

Many-to-many assertion/evidence links with support/contradict role and excerpt locator. Document text remains in licensed storage.

### `network_edges`

Subject/object, channel, period, value/unit/status, quality, dataset version, valid interval, and lineage. Timescale or partitioned PostgreSQL supports matrices; Neo4j mirrors accepted traversable edges later.

## Scenario and consequence tables

`scenarios`, `scenario_versions`, `scenario_shocks`, `shock_dependencies`, `scenario_runs`, `scenario_trajectories`, `population_segments`, `consequences`, and `policy_frontiers` preserve version parents, assumptions, baseline, model/data/run identity, uncertainty, and visibility.

## Product/commercial tables

`plans`, `features`, `entitlement_grants`, `dataset_grants`, `model_grants`, `quotas`, `usage_records`, `subscriptions`, `billing_accounts`, `api_credentials`, `feature_flags`, `dashboards`, `reports`, `exports`, `alert_rules`, `alert_events`, `comments`, `annotations`, and `audit_events` are organization-scoped and versioned where user-visible history matters.

## Time-series hypertables

Initial candidates:

- `observation_revisions` by economic period with space partition on series;
- `feature_values` by period/as-of;
- `state_snapshots` by as-of;
- `forecasts` by origin;
- `network_edges` by period;
- high-frequency market observations by event time;
- `quality_assessments` and source health by computed/observed time.

Hypertable choice follows benchmark evidence. PostgreSQL declarative partitioning remains valid for low-frequency economic series.

## Required constraints

- finite/numeric and status/value consistency;
- period start not after period end;
- release not before a documented permissible boundary unless flagged;
- retrieval not before release for true-vintage source records;
- non-overlapping exclusive entity/currency/regime intervals;
- valid quality/probability ranges;
- unique source observation/version identities;
- organization consistency across private foreign keys;
- immutable forecast/raw/model/audit records;
- lineage required for derived/imputed/model outputs;
- imputation metadata required when provenance is imputed.

## Deletion and retention

Global/public economic facts are retained per source license and reproducibility requirements. Tenant-private raw data obey contractual retention. Personal data deletion separates identity erasure from scientifically required pseudonymous audit history. Object deletion is a governed workflow with tombstone, authorization, legal hold check, and audit event.
