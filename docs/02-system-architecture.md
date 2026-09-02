# EconomyOS System Architecture

Status: accepted baseline

## Architecture decision

EconomyOS begins as a contract-driven modular monolith with separately runnable Python scientific workers and durable workflow workers. This minimizes distributed failure modes while preserving extractable domain boundaries.

```text
Browser / API client
        |
        v
Next.js web ----> NestJS/Fastify product API
                         |
          +--------------+----------------+
          |              |                |
     PostgreSQL      Valkey cache     Object storage
     + Timescale     and queues       raw/artifacts
          |
          +---- durable workflow coordinator ----+
                                                  |
                                      Python scientific workers
                                      state / crisis / scenario
                                                  |
                                      graph port / model registry
```

Neo4j is introduced behind a graph repository port in Phase 5. ClickHouse, Kafka/Redpanda, Kubernetes, and a separate vector service are deferred until measured load or isolation needs justify them.

## Repository tree

```text
apps/
  web/                 localized institutional interface
  api/                 product/public API and authorization boundary
  worker/              TypeScript durable/queue activities
  admin/               later commercial operations surface
services/
  scientific/          Python workspace and service entry points
  adapters/            legacy-engine adapters and ingestion plugins
packages/
  contracts/           Zod, JSON Schema, OpenAPI and protobuf sources
  database/            migrations, query ports and tenant context
  auth/                identity/authorization policies
  i18n/                locale registry, messages and format contracts
  design-tokens/       themes, density and visualization tokens
  ui/                  accessible product-agnostic components
  observability/       trace/log/metric conventions
  testing/             deterministic fixtures and contract harnesses
research/
  experiments/         non-production model experiments
  validation/          chronological evaluation artifacts
data/
  schemas/             canonical data and source schemas
  metadata/            ontologies, units, licenses, source catalog
infrastructure/
  compose/             local dependencies
  deployment/          staged container deployment
docs/                  governed product/science/operations documents
```

## Bounded contexts

| Context | Owns | Does not own |
| --- | --- | --- |
| Identity and tenancy | organizations, workspaces, memberships, principals | economic data or models |
| Entitlements | plans, grants, datasets/models/features, quotas | billing provider internals |
| Canonical data | entities, sources, datasets, series, observations, vintages | domain interpretation |
| Provenance | lineage nodes/edges, digests, execution manifests | scientific formulas |
| Economic state | feature/state definitions and state snapshots | source transport |
| Model governance | models, versions, cards, approvals, deployments, monitoring | product subscriptions |
| Forecast ledger | forecasts, outcomes, scores, invalidations | mutable current-only forecasts |
| Causal graph | temporal relations, evidence and classifications | automatic causal verification |
| Scenario | definitions, versions, runs, assumptions and outputs | ad hoc undocumented calculations |
| Product API | authentication, authorization, orchestration, quotas | scientific arithmetic |
| Reporting | immutable report manifests and render jobs | rewriting model outputs |

## Dependency rule

Delivery and infrastructure depend inward on application/domain contracts:

```text
web/api/worker -> application services -> domain contracts
adapters/database/object-store -> domain ports
scientific implementations -> scientific protocols -> canonical contracts
```

The domain cannot import HTTP, SQL, rendering, provider SDKs, tenant session state, or LLM clients. A browser package cannot import server configuration or database code.

## Runtime units

### Web

Next.js Server Components provide initial data and localized shells. Client islands are limited to charts, graph interaction, command palette, and live updates. Large datasets remain server-filtered.

### Product API

NestJS with Fastify owns authentication, authorization, tenant context, validation, idempotency, quotas, API versioning, collaboration, and orchestration. It delegates scientific calculations through typed ports.

### Scientific service

Python owns econometrics, causal inference, forecasting, simulation, optimization, and validation. Initial deployment may be one process with module boundaries. Long-running work executes through durable workflows; synchronous endpoints are bounded and cancellable.

### Data stores

- PostgreSQL: transactional metadata, tenancy, workflows, forecasts, scenarios, graph metadata, audit pointers.
- TimescaleDB: canonical time-series observations, feature values, state history, market data, forecasts.
- S3-compatible storage: immutable raw objects, Parquet, dataset snapshots, model artifacts, reports, exports.
- Valkey: replaceable cache, rate counters, ephemeral coordination, and bounded queues.
- Neo4j: temporal knowledge/dependency/causal traversal after Phase 5; PostgreSQL retains canonical relation metadata and audit identity.
- pgvector: initial document embeddings with tenant and entitlement filters.

## Contract strategy

One canonical contract source is used per boundary:

- Zod for TypeScript runtime request/response validation;
- JSON Schema generated or hand-governed for storage/external interchange;
- OpenAPI generated from route contracts and checked for drift;
- protobuf for internal high-volume scientific calls;
- SQL constraints for invariants that must survive application bugs.

Contracts are additive within a major version. Material scientific semantic changes require a new model/methodology version even if the JSON shape is unchanged.

## Request flow

1. Gateway establishes principal, organization, workspace, locale, trace, and request limits.
2. Authorization resolves role, attributes, feature entitlements, and dataset/model grants.
3. Application service validates an explicit `as_of` and vintage policy.
4. Canonical query applies tenant, license, point-in-time, and quality filters.
5. Scientific service receives only authorized normalized inputs plus lineage references.
6. Results are validated, assigned maturity/status, and linked to evidence/model manifests.
7. Response exposes public structured errors and never internal stack traces.

## Asynchronous flow

Durable workflows orchestrate ingestion, historical rebuild, training, backtest, simulation, report, and export jobs. Every job has a tenant, idempotency key, input digest, cancellation state, retry policy, cost attribution, trace, and output manifest. Activities are bounded and retry only classified transient failures.

## Failure behavior

| Failure | Required behavior |
| --- | --- |
| Source outage | preserve last valid data with stale status; never synthesize replacement |
| Partial ingestion | raw object retained; canonical promotion blocked or partial status recorded |
| Valkey outage | durable truth remains; caches/ephemeral jobs degrade |
| Scientific service outage | evidence browsing remains; calculations return retryable service error |
| LLM outage | deterministic product and reports remain available |
| Graph outage | graph exploration degrades; canonical observations/forecasts remain accessible |
| Database outage | readiness fails; no silent write acceptance |
| Object store outage | raw/artifact-dependent workflows pause; metadata records failure |

## Observability

Every boundary propagates W3C trace context. Structured events include tenant-safe identifiers, operation, model/dataset version, point-in-time grade, duration, result status, and error code. Secrets, raw private payloads, and licensed data values are excluded from logs. Metrics cover latency, errors, queue depth, source health, freshness, quality, model execution, calibration/drift, scenario cost, cache behavior, and entitlement denials.

## Evolution triggers

A module becomes a service only when at least one is measured:

- independent scaling profile;
- isolation or data-residency requirement;
- materially different release cadence/ownership;
- failure-domain or language/runtime requirement;
- workload that cannot meet budgets inside the modular deployment.

Each extraction requires an ADR, ownership/SLO, threat-model update, data migration plan, contract test, rollback plan, and before/after measurements.

## Architecture status

This baseline is `approved`. Production readiness depends on phase-specific implementation and acceptance evidence; the diagram is not a claim that every runtime exists today.
