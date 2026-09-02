# Deployment Architecture

## Environments

- Local: reproducible development profile with seeded synthetic-demo fixtures only.
- CI: ephemeral isolated services and immutable test artifacts.
- Development: shared integration, no production credentials/data.
- Staging: production-shaped topology and sanitized or approved synthetic data.
- Production: regional tenant/data policy, HA, controlled changes, monitored SLOs.

Environment promotion deploys the same signed artifacts and configuration schemas. Builds do not contact production systems.

## Deployable units

- Next.js web application/BFF edge where required.
- NestJS/Fastify product API.
- Python scientific service and batch workers.
- Temporal workers for durable ingestion, validation, model, export, and scenario workflows.
- BullMQ workers only for short, reconstructible jobs.
- PostgreSQL with TimescaleDB, Valkey, and S3-compatible object storage.
- MLflow tracking/artifact integration.
- Neo4j from Phase 5; ClickHouse only after measured workload justifies it.

The modular monolith is the initial application boundary. Units split only with ownership, scaling, reliability, or security evidence.

## Local profile

Container Compose pins image digests or immutable versions for PostgreSQL/Timescale, Valkey, an approved S3-compatible service, and Temporal dependencies. Application processes may run on the host for feedback speed. Bootstrap creates development databases/buckets and labeled synthetic fixtures; it refuses production-like environment markers. The archived open-source MinIO image is prohibited because all final releases are affected by later high-severity advisories; use managed S3, a supported patched AIStor release, or another security-approved S3-compatible implementation behind the storage port.

One documented command validates prerequisites, starts dependencies, migrates schema, seeds demo identities/data, and reports health. A separate non-destructive doctor command checks ports, versions, disk, clock, and connectivity.

## Production topology

Stateless web/API replicas run across at least three failure domains behind managed load balancing and web application protection. PostgreSQL uses synchronous regional HA and PIT backups; read replicas serve only workloads whose consistency contract permits. Object storage uses versioning, encryption, lifecycle, and replication. Valkey is disposable except for explicitly configured durable queue semantics.

Temporal is deployed/managed with persistence, visibility, multi-worker task queues, and tested recovery. Production workers and clients require server-authenticated TLS plus either an API key or an mTLS client certificate/key identity for the configured namespace. Plaintext Temporal is accepted only with an explicit development/test loopback opt-in. Scientific workloads have separate resource pools and egress policy. Network policies default deny. Workloads use short-lived workload identity to reach secrets and cloud resources.

## Configuration and secrets

Typed configuration is validated at startup. Environment variables may locate bootstrap configuration and secret handles; secrets come from the approved manager and are rotated. Feature flags are runtime governed records/provider values—not scattered environment switches. Secret values never enter images, source, logs, traces, or client bundles.

Ingestion authorization rotation publishes a new signing key ID while workers retain prior verification keys for at least the maximum envelope TTL plus clock skew and until already-started workflows are terminal. Bounded ingestion must complete while its envelope is valid; recovery after expiry requires a newly authorized run, and operators monitor non-terminal runs for that condition.

## Delivery pipeline

1. Verify formatting, types, tests, temporal/security gates, schemas, and migrations.
2. Build hermetically; create SBOM and signed provenance/attestation.
3. Scan source, dependencies, containers, IaC, and secrets.
4. Deploy to ephemeral/staging; run smoke, contract, migration, accessibility, and rollback tests.
5. Require approvals according to environment and change risk.
6. Progressive production rollout with health/error/latency/data-quality checks.
7. Promote or automatically halt/roll back stateless components.

Database and data changes use expand/migrate/contract. A deployment never assumes rollback can reverse an irreversible migration. Data backfills are observable durable workflows with pause, resume, rate limits, and reconciliation.

## Observability and SLOs

OpenTelemetry connects browser request (where safe), API, workflow, provider fetch, transformation, model run, and artifact. Metrics cover availability/latency/errors/saturation plus ingestion lag, source freshness, quarantine, workflow age, model drift, and alert delivery. Logs are structured and classified.

Initial SLOs are proposed and validated with users before production: evidence reads and alert triage receive higher availability priority than bulk export and research computation. Error budgets govern release pace; they are not contractual claims until approved.

## Backup, recovery, and continuity

- PostgreSQL: encrypted full/incremental/PIT backups with routine restore verification.
- Object store: versioning/replication and manifest integrity scans.
- Neo4j/MLflow: backed up consistent with their source-of-truth role and reproducibility dependencies.
- Configuration/policy/catalog: versioned and included in recovery.

Target architecture is designed toward regional RPO <= 5 minutes and RTO <= 60 minutes for critical evidence/alert services; final values require business approval and successful exercises. Scenario/research compute may have longer targets. Restore tests verify tenant isolation, encryption, PIT semantics, and artifact references—not merely process startup.

## Security and residency

TLS is mandatory in transit and managed encryption at rest. Egress is allowlisted per connector. Administrative access is JIT, MFA-bound, session-recorded where lawful, and audited. Data residency policy controls storage, processing, backup, support, and export location. Tenant-dedicated deployment is an enterprise option, not a separate codebase.

## Cost and capacity

Tag and meter tenant/workload cost without exposing shared-infrastructure detail. Capacity models include observation volume, releases, retained payloads, queries, scenarios, models, egress, and translations. Autoscaling uses queue age and resource signals with bounded spend. ClickHouse/Kafka/Kubernetes expansion follows measured thresholds and an architecture decision.

## Acceptance criteria

- A fresh environment reaches healthy state from versioned instructions and pinned artifacts.
- Schema migration and compatible application rollout succeed under traffic, and rollback behavior is rehearsed.
- Backup restoration meets declared test targets with evidence.
- Loss and redelivery of a worker do not duplicate admitted observations or billed usage.
- Production cannot load synthetic-demo data or development authentication.
