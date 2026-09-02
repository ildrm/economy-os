# EconomyOS Multi-Tenant Architecture

Status: accepted isolation model

## Tenant hierarchy

```text
Organization (legal/account/isolation boundary)
  -> Workspace (collaboration and private-data scope)
     -> Team
        -> Principal membership
```

Datasets, models, scenarios, dashboards, reports, API credentials, comments, alerts, jobs, exports, and feature flags declare visibility: global public, licensed shared, organization private, or workspace private. The implemented canonical evidence ledger currently supports global and organization-private rows; workspace IDs scope snapshots and derived economic-state artifacts, not canonical observations.

## Isolation strategy

The shared SaaS tier uses one PostgreSQL cluster with mandatory `organization_id`, transaction-scoped tenant context, row-level security, and organization-consistent foreign keys. High-assurance tiers can place the same logical schema in a dedicated database/cluster/VPC or on-premise deployment.

Null tenant identifiers are not used to mean both public and unknown. Public/shared assets use explicit scope and a grant model.

## Request context

After authentication, a trusted gateway builds:

```text
principal_id
organization_id
workspace_id
roles and attributes
feature/dataset/model entitlement digest
locale and time zone
request/trace identifier
```

Clients cannot set trusted organization context directly. Organization switching revalidates membership and rotates/refreshes context.

## Database enforcement

- RLS policies deny access when tenant context is missing.
- Inserts derive or verify organization from context.
- Private foreign keys include organization or use validation triggers.
- Security-definer functions are minimal, reviewed, and pin `search_path`.
- Migration and maintenance roles are separated from runtime roles.
- Support/admin access uses explicit audited elevation with reason and expiry.
- Automated tests create at least two tenants and attempt every CRUD/search/export path across them.

## Shared and licensed data

Global observations can be read only if a customer's dataset grant and source license permit the operation. A licensed dataset may allow screen display but deny bulk export or API redistribution. Entitlement evaluates action (`view`, `derive`, `export`, `api`, `train_model`) rather than a single boolean.

Derived artifacts inherit source restrictions through lineage unless a reviewed license rule states otherwise.

The governed evidence API therefore authorizes an active organization membership and does not accept a cosmetic workspace parameter. A workspace-private canonical evidence path requires workspace columns, workspace-consistent foreign keys/RLS, ingestion binding, and contract tests across the entire source-to-observation chain before it can be exposed.

## Private economic twin

The target architecture gives tenant-private observations and documents the same canonical contracts but distinct storage scope, encryption policy, lineage, and model permissions. That workspace-private canonical ingestion path is not implemented in the current phase. A future model run that mixes global and private inputs must explicitly list both snapshots. Cross-tenant aggregation is prohibited unless inputs are anonymized and approved under a separate product and legal basis.

## Cache, queue, search, graph, and object storage

- Cache keys start with organization, workspace, entitlement digest, and resource version.
- Durable ingestion inputs carry a short-lived HMAC-SHA-256 envelope with a rotation key ID. The signed claims bind an explicit global/tenant scope, dataset, series, connector, parser and configuration digests, input digest, ingestion run, Temporal workflow, issue/expiry times, and a cryptographic nonce. Activities verify the signature, lifetime, namespace, workflow type/ID, and replay binding before provider, object-storage, or repository work; the repository refuses tenant context setup outside that verified activity scope.
- Legitimate Temporal activity retries may reuse the same nonce only for the same immutable workflow execution. A nonce observed with another context in a worker's bounded replay registry is rejected; database idempotency remains the cross-worker duplicate-delivery control until a shared nonce ledger is introduced.
- Search/vector indexes store tenant and dataset-grant filters; retrieval enforces them before ranking/content return.
- Graph nodes/edges contain scope; traversals cannot cross into unauthorized subgraphs through a public intermediary.
- Object keys use opaque IDs under organization prefixes; access uses short-lived server-generated URLs.
- Logs and metrics use non-sensitive tenant identifiers and never raw customer data.

## Authorization model

Initial roles: organization owner, workspace admin, analyst, researcher, viewer, model validator, data steward, billing admin, API operator, and auditor. Roles grant permissions; attributes constrain them by workspace, dataset, model stage, geography, environment, and resource owner.

High-impact actions require separation of duties:

- model author cannot solely approve production deployment;
- dataset importer cannot approve license redistribution;
- billing admin cannot read private research by default;
- support personnel receive no standing data access.

## Data residency and deployment modes

Organization policy selects allowed regions and services. Jobs are routed only to eligible compute/storage. Enterprise modes:

1. shared SaaS with logical isolation;
2. dedicated database/compute in managed cloud;
3. customer VPC/private cloud;
4. on-premise;
5. air-gapped sovereign deployment.

Contracts and migration history remain common; provider/AI integrations are configurable and may be disabled.

## Lifecycle

### Provisioning

Create organization, default workspace, owner membership, encryption/billing/entitlement policy, audit event, and baseline quotas atomically.

### Suspension

Block new sessions/jobs/API use while retaining data under contract. Alert/export delivery stops except required notices.

### Deletion

Verified request starts an inventory via lineage and object manifests, checks legal holds/license retention, revokes credentials, removes personal/private data according to policy, records tombstones and audit evidence, and schedules backup expiry. Deletion is never an untracked direct database command.

## Isolation acceptance criteria

- RLS and application authorization both deny cross-tenant access;
- private artifacts cannot enter shared caches/search/graphs;
- exports/reports/AI retrieve only licensed and entitled inputs;
- background jobs fail closed when tenant context is absent/expired;
- organization deletion inventory is complete across every store;
- dedicated and shared deployment modes pass identical contract tests;
- audit records identify all administrative tenant access.
