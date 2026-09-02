# EconomyOS Security Architecture

Status: baseline threat and control architecture

## Security objectives

Protect tenant-private data, identity/session/API secrets, licensed datasets, proprietary models, forecasts/scenarios, audit evidence, platform availability, and scientific integrity. A security failure includes silent data/model tampering or cross-tenant analytical contamination, not only confidentiality loss.

## Trust boundaries

- browser/mobile client to edge/API;
- external API client to public API;
- API to PostgreSQL/Timescale, Valkey, object storage, workflow system, graph store;
- worker to data providers and model/artifact stores;
- product API to Python scientific service;
- tenant-private data to global/public model/data;
- administrator/support access to customer environments;
- untrusted documents/provider payloads to parsing, rendering, retrieval, and AI tools;
- CI/CD to registries, cloud accounts, signing keys, and deployments.

## Identity and session controls

- OIDC/OAuth 2.1 baseline; enterprise SAML through a brokered identity boundary.
- MFA/passkeys and step-up authentication for high-impact operations.
- Secure, HttpOnly, SameSite cookies for browser sessions; CSRF protection on mutations.
- Rotating sessions, refresh-token reuse detection, revocation, device/session inventory.
- API credentials are hashed at rest, scoped, expiring where possible, and shown once.
- Service identities use workload identity/mTLS, not shared long-lived credentials.

## Authorization

RBAC supplies understandable role bundles; ABAC enforces organization/workspace, dataset/model classification, geography/residency, purpose, plan, and resource attributes. Policies deny by default and are versioned.

For governed API reads, the API's governed-authorization service evaluates subject-aware role grants, classification ceilings, and entitlement capabilities inside the same repeatable-read, read-only tenant transaction used for data access. Narrow PostgreSQL `SECURITY DEFINER` wrappers independently enforce tenant/workspace scope and applicable legal, temporal, admission, and quality invariants while keeping canonical base tables unavailable to the runtime role. Those wrappers are least-privilege serving boundaries, not subject-aware RBAC or entitlement engines; both layers are required.

Enforcement occurs at:

- route and application service;
- database row-level security and security-definer boundaries;
- object-store prefix/key policy;
- graph query scope;
- search/vector filters;
- cache key and invalidation;
- workflow/job admission and worker activity;
- export/report/render and AI retrieval;
- realtime subscription and alert delivery.

UI hiding is never an authorization control.

## Tenant isolation

Every tenant-private row contains `organization_id`. Composite foreign keys or trigger checks prevent cross-organization references. Connection transactions set a verified organization context; RLS requires it. Background jobs carry signed tenant context and reauthorize access. Global/public records use explicit scope rather than null being interpreted ambiguously.

Dedicated databases/VPC/private deployment are supported for high-assurance tiers through the same application contracts.

## Temporal ingestion trust boundary

The bounded ingestion flow is `trusted signer -> Temporal -> worker authorization guard -> repository tenant transaction -> PostgreSQL RLS`, with separate worker flows to the provider and immutable object storage. The signed envelope contains identifiers and digests, not the HMAC key or source payload. Production transport requires TLS plus API-key or mTLS authentication; plaintext is an explicit loopback-only development/test mode.

| STRIDE | Threat | DREAD | Implemented mitigation | Owner / residual action |
|---|---|---:|---|---|
| Spoofing | forged tenant or global workflow authority | 8.0 | HMAC-SHA-256, bounded key set, constant-time verification, short expiry, exact organization/dataset/series/run/workflow claims | Platform Security: provision and rotate keys through the secret manager |
| Tampering | connector, parser, quality policy, or input identity changed after authorization | 7.4 | canonical signed digests plus worker-side context recomputation before each activity | Data Platform: retain contract-forgery tests on every parser change |
| Repudiation / replay | a valid envelope is reused in a different Temporal execution | 7.0 | namespace/type/workflow/execution binding, nonce registry, deterministic run identity, terminal manifest replay, database idempotency | Platform Security: the nonce registry is process-local; add a shared ledger before accepting untrusted multi-cluster workflow submitters |
| Information disclosure | signing or Temporal credentials enter source, logs, or workflow history | 6.4 | credentials load only from runtime configuration; envelopes contain key IDs and signatures; repository and CI secret gates scan committed files | Platform Security: monitor secret-manager access and redact runtime diagnostics |
| Denial of service | nonce/cardinality floods exhaust worker admission | 6.2 | bounded registry, strict TTL/claim sizes, activity retry limits, fail-closed capacity | Platform: add queue/rate controls with the production workflow submission API |
| Elevation of privilege | worker code sets an attacker-selected organization context | 8.2 | every repository transaction requires an active verified async authorization scope before `SET LOCAL`; the runtime database role is non-owner and cannot bypass RLS | Platform Security: preserve the repository guard as a mandatory construction dependency |

The process-local replay registry is acceptable only with the current trusted Temporal submission boundary and database idempotency. It is not represented as distributed nonce uniqueness.

## Data protection

- TLS 1.2+ externally and encrypted service links internally.
- Managed encryption at rest; tenant-specific envelope keys where required.
- Separate secrets manager; no secrets in source, images, logs, or client bundles.
- Object-store versioning, encryption, retention, legal holds, and signed short-lived access.
- Sensitive exports are watermarked/audited and expire.
- Logs redact secrets and exclude raw licensed/private payloads.
- Backups are encrypted, access-controlled, and restore-tested.

## Input and boundary security

- Runtime schema validation with strict unknown-field policies.
- Body, row, series, graph-depth, time-range, and file-size limits.
- Parameterized SQL/Cypher; no query construction from untrusted text.
- SSRF-resistant provider configuration: allowlists, DNS/IP checks, egress policy, redirect validation.
- Archive decompression limits, MIME verification, parser sandboxing, malware scanning where appropriate.
- HTML/Markdown sanitization, CSP, output encoding, safe link schemes.
- No `eval`, dynamic code execution, unsafe deserialization, or shell interpolation of user input.
- Formula/spreadsheet export injection mitigation.

## API and abuse controls

- Cost-aware rate limits by credential, organization, route, and workload class.
- Idempotency keys for expensive/mutating requests.
- Quotas and admission controls before model/scenario/export work starts.
- Bounded concurrency, queues, graph traversal, and client buffers.
- Uniform public errors with trace IDs; internal causes remain in protected logs.
- Replay protection for signed webhooks and event envelopes.
- DDoS/WAF controls at the edge, with application-level semantic limits.

## Scientific integrity controls

- Immutable raw payload digests and dataset/model artifacts.
- Signed/attested model release manifests for production.
- Separation of research, validation, approval, and deployment roles.
- Append-only forecast and audit ledgers.
- Provenance required for derived values.
- Model and data status cannot be elevated by presentation code.
- Demo/synthetic data blocked by a production policy guard.
- Analyst overrides are versioned annotations, never silent replacements.

## AI-specific security

- Retrieval filters apply tenant and entitlements before content reaches a model.
- Tools expose narrow schemas, authorization, budgets, and read/write classification.
- Retrieved documents are untrusted data, not instructions.
- Prompt/model/tool versions and evidence IDs are logged without sensitive prompt leakage.
- Numerical responses are validated against tool outputs; unsupported claims are rejected.
- Provider abstraction supports private deployment and data-processing controls.
- AI cannot grant permissions, deploy models, alter forecasts, or execute trades autonomously.

## Audit events

Record login/session changes, permission/role changes, dataset import/delete, license/entitlement change, model approval/deployment/disable, scenario run, report/export, API credential lifecycle, subscription/billing changes, alert changes, administrator access, and policy denials. Events include actor, tenant, action, resource, outcome, policy version, trace, time, and tamper-evident sequence/hash.

## Secure development lifecycle

- protected branches and least-privilege CI identities;
- lockfiles, provenance attestations, SBOM, dependency/license/advisory scanning;
- secret scanning, SAST, IaC/container scanning, migration validation;
- signed images, pinned base-image digests, staged rollout, rollback;
- security diff review for authorization, tenancy, parsing, crypto, secrets, and public contracts;
- recurring penetration tests and threat-model reviews before enterprise launch.

## Incident response

Severity classification covers confidentiality, integrity, availability, tenant isolation, model/data corruption, and license breach. Runbooks define containment, key/session revocation, affected-data/artifact identification via lineage, customer/regulator notification, forensic preservation, recovery, and post-incident corrective actions.

## Phase gates

### Foundation

Structured errors, strict validation, security headers, secret hygiene, tenant context contract, deny-by-default authorization interfaces, audit schema, safe demo guard, dependency scans.

### Commercial authentication

Session rotation/revocation, MFA, organization/workspace administration, RLS isolation tests, API-key lifecycle, rate limits, privacy export/deletion.

### Institutional hardening

SAML/SCIM, customer-managed keys where required, private networking, dedicated deployments, advanced audit export, penetration assessment, HA/DR evidence.

## Residual risks

Data licensing and model misuse cannot be solved solely by technical controls. They require legal review, customer terms, usage monitoring, model cards, human oversight, and enforced entitlements. Production-ready status is prohibited until those operational controls have owners and evidence.
