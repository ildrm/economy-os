# Cross-Document Contradiction Resolution

## Review result

The Phase 0 specifications were reviewed as one system before implementation. The decisions below resolve conflicts in the source prompt, legacy repositories, and proposed architecture. These decisions are normative unless replaced by an explicit architecture/model/data decision record.

## Resolutions

| ID | Tension | Decision | Consequence |
|---|---|---|---|
| C-01 | Broad distributed stack vs simplest reliable delivery | Begin with a modular monolith plus separately deployable scientific/workflow workers. PostgreSQL/Timescale, object storage, Valkey, and Temporal are foundational. | Service splits require measured ownership, scale, security, or SLO need. |
| C-02 | Neo4j is named vs graph capability arrives in Phase 5 | Define a graph port and canonical relation records now; deploy Neo4j in Phase 5. | PostgreSQL is authoritative for identities, evidence, approvals, and relation metadata until graph acceptance. |
| C-03 | ClickHouse/Kafka/Kubernetes are attractive vs unnecessary early complexity | Defer them until workload thresholds and an ADR justify adoption. | No early feature assumes their semantics. |
| C-04 | Temporal for durability vs BullMQ for simple jobs | Temporal owns ingestion, backfill, validation, model, export, and scenario processes whose state must survive. BullMQ is limited to short reconstructible jobs. | A durable workflow is not disguised as a queue callback chain. |
| C-05 | Twelve required languages vs phased implementation | Architecture supports all twelve now; EN/FA are the first fully validated catalogs. No locale is advertised until its release gate passes; all are required before broad GA. | Foundation work is honest without weakening the final requirement. |
| C-06 | Authentication foundation vs SAML/SCIM/MFA enterprise phase | OIDC/PKCE, service identity, tenant/policy boundaries, and MFA-capable identity claims begin in Phase 1. SAML/SCIM and enterprise policy acceptance complete in Phase 15. | Enterprise features share the same identity abstraction and audit model. |
| C-07 | Legacy `latest` data behavior vs strict historical analysis | Canonical analytical queries require a `knownAt` cutoff or an explicit named latest policy. Legacy data imports do not carry PIT claims they cannot prove. | FX-CPM's strictest PIT semantics become the platform baseline. |
| C-08 | Humanity source merge vs canonical observation identity | Source values remain separate observations/releases. Harmonization is a versioned transformation with source priority and comparability evidence. | No overwrite-style merge survives migration. |
| C-09 | Legacy composite scores vs production decision models | Humanity and investment composites enter as transparent research baselines/expert priors. | Their thresholds and weights are not labeled empirical probabilities or advice. |
| C-10 | Independent FX hazards vs demand for one systemic risk number | Preserve hazard-specific outputs. A summary may be a labeled stress index; probability of any crisis requires an explicit joint model. | No independence assumption is hidden in aggregation. |
| C-11 | Causal economic loops vs provenance DAG | Causal/economic relation graphs may contain feedback cycles. Execution and lineage graphs are versioned acyclic dependency graphs. | Graph validators apply different invariants by edge type. |
| C-12 | Missing data vs convenient scoring | Missing remains typed unknown. Imputation is a separate versioned transformation and uncertainty source; neutral/zero substitution is forbidden. | Coverage is always displayed beside output. |
| C-13 | Demo usefulness vs prohibition on fake production data | Synthetic fixtures are labeled `synthetic_demo`/`synthetic_research`, isolated, and rejected by production analytical policies. | Demos remain possible without deceptive provenance. |
| C-14 | Server-generated translated messages vs stable API contracts | APIs return stable codes and locale-neutral data; approved user-facing labels may be localized via `Accept-Language`. | Client logic never depends on translated text. |
| C-15 | Language vs direction, digits, calendar, currency | Model these as separate preferences; locale metadata provides defaults only. | Persian/Arabic UI does not silently change economic data conventions. |
| C-16 | Billing plans vs access control | Applications request action/resource authorization. Commercial entitlements are one policy input and cannot override security/governance denial. | Provider product IDs and plan names stay out of feature code. |
| C-17 | Feature flags via environment vs runtime governance requirement | Environment config may bootstrap the flag provider; flags and history are runtime governed data. | Auditable changes do not require arbitrary process configuration edits. |
| C-18 | Latest dependency versions vs reproducible operation | Pin lockfiles and runtime/container versions; updates pass compatibility/security gates. | `latest` tags are prohibited in accepted deployment artifacts. |
| C-19 | Raw immutable evidence vs privacy/license deletion | Preserve immutable metadata, lineage, checksums, and tombstone events while deleting/crypto-erasing bytes when required. | Immutability means append-only history, not unlawful permanent retention. |
| C-20 | Tenant shared infrastructure vs sovereign isolation | One tenancy/policy model supports shared, pooled-isolated, and dedicated deployments. | Dedicated operation is topology/configuration, not a forked product. |
| C-21 | Forecast/causal/simulation features vs a unified output table | Share manifests and typed output envelopes while preserving method-specific schemas and claims. | UI comparison cannot erase epistemic differences. |
| C-22 | Investment model wall-clock freshness vs reproducibility | All clocks are injected and captured. Freshness is computed relative to a declared cutoff. | Replays do not change because today's date changed. |
| C-23 | Existing Kavosh demo generator in runtime code vs source truth | Test/demo generation moves to explicit fixture packages unavailable to production paths. | Product modules cannot fall back to plausible synthetic market/economic data. |
| C-24 | RLS vs privileged jobs | Tenant-scoped workers use tenant-bound database roles/context. Cross-tenant maintenance uses separate restricted identities and audit. | Disabling RLS in ordinary tests or jobs is forbidden. |
| C-25 | Prompt names MinIO vs archived vulnerable open-source releases | Preserve the S3-compatible storage port, but prohibit the archived open-source MinIO image. Deploy managed S3, a supported patched AIStor release, or another security-approved compatible service. | The decision follows the [upstream archive status](https://github.com/minio/minio/releases) and advisories affecting all final OSS releases for [unauthenticated object writes](https://github.com/minio/minio/security/advisories/GHSA-hv4r-mvr4-25vw) and [SSE metadata injection](https://github.com/minio/minio/security/advisories/GHSA-3rh2-v3gr-35p9). |

## Terminology consistency check

- `eventTime`: when the measured event/period occurred.
- `releaseTime`: when the publisher released the value.
- `validTime`: business-world applicability interval.
- `systemTime`: platform record interval.
- `knownAt`: visibility cutoff evaluated against release and system admission.
- `observed`, `estimated`, `forecast`, `scenario`, `synthetic_demo`, and `unknown`: mutually distinguishable data/output classes.
- `confidence`: evidence/data/model support measure only under a named method; it is not probability by default.
- `hazard probability`: allowed only for a calibrated probabilistic model and specified horizon/event.

These definitions match the canonical data, PIT, model governance, API, UX, testing, and deployment documents.

## Implementation gate

The review found no unresolved contradiction that prevents Phase 1. The deferred systems and catalog rollout above are sequencing decisions, not silent requirement removals. Implementation must link material deviations to an ADR and update affected acceptance tests and traceability.
