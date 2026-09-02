# Phase 14 Collaboration and API Ecosystem Methodology

Status: `in_progress` — the tenant-safe domain core and forced-RLS persistence are implemented; product integrations and external certification remain outstanding.

## Collaboration and citation boundary

`@economyos/collaboration-ecosystem` models shared workspaces, membership, annotations, disputes, review records, and citations without copying or mutating scientific evidence. Every record is organization/workspace scoped, content addressed, chronologically validated, and linked to an immutable artifact version.

A citation records its evidence classification and availability relative to the artifact cutoff. Evidence available by that cutoff and evidence discovered later remain distinct. Subsequent evidence may challenge an artifact, but it cannot be relabeled as information available to the original analysis.

## Credentials, compatibility, and quotas

API credentials store identifiers and SHA-256 secret digests only. Presented secrets are checked in constant time, and authorization decisions bind principal, organization, workspace, action, policy, and evaluation time.

SDK, CLI, and extension contracts use strict semantic-version rules. Compatibility decisions validate requested capabilities and produce stable machine-readable reasons. Quota reservations and usage events bind the exact capability, principal, workspace, request digest, request time, amount, policy window, and authorization decision. Re-addressing an event cannot bypass state or chronology checks.

## Webhooks and extensions

Webhook endpoints require bounded public HTTPS destinations and caller-supplied secret custody. Delivery envelopes are signed outside the package and recorded in an append-only state machine with exact payload digest, attempts, outcome, and replay identity. Timestamp and nonce checks are bounded; production still requires runtime DNS/IP rebinding protection and a durable nonce store.

Connector and model-extension manifests declare capabilities, egress, data classes, resource ceilings, isolation, compatibility, evidence, and limitations before certification. Certification is version- and workspace-specific. Admission requires a separate authorization, compatible contract, active certification, and quota receipt bound to the exact admission request. Revocation is a distinct authorized event. The package never executes extension code.

## Audit and developer surface

Security- and collaboration-relevant actions append tamper-evident audit records with actor, scope, trace, time, resource, decision, and preceding digest. Developer-portal records are immutable listing contracts over compatible, admitted assets; they are not a rendered portal or executable SDK.

## Executable evidence and limits

- 81 tests pass across seven files.
- Focused coverage: 91.65% statements, 87.76% branches, 100% functions, and 93.06% lines.
- TypeScript typecheck/build, Biome, and distribution export checks pass.
- Migration `0035_collaboration_ecosystem_persistence.sql` persists twelve tenant-scoped collaboration and integration relations behind forced RLS, append-only mutation boundaries, narrow app-role functions, strict content-addressed manifests, and atomic replay/conflict rules. Its clean-room verifier exercises two tenants, reused tenant-local identifiers, quotas, webhook transitions, certification/revocation, portal/audit records, and non-enumerating reads as part of the all-35-migration database gate.
- Frozen SHA-256 values: migration `b849b51689f42935c54716245708f59e01bb0ce67b78088793c2f1ac140d1a26`; dedicated verifier `6610fc36e704eb60606b6d1d85ddec7c0e9fa5ca6e573ccf59bfe5b506afa02f`.

The current implementation has no HTTP developer portal, published SDK/CLI, webhook transport, extension runtime, shared secret manager, billing provider, deployed distributed quota/rate-limit service, or external sandbox/security certification. Database verification proves the local persistence contract; it does not prove production deployment, cross-region coordination, billing accuracy, delivery reliability, or safe execution of untrusted code.
