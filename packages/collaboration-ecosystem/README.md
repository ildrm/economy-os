# Collaboration Ecosystem

Phase 14 domain core for tenant-safe shared workspaces, point-in-time classified citations,
constant-time API-credential verification, atomic quota accounting, signed webhook delivery,
SDK/CLI compatibility, developer-portal listings, and connector/model extension admission.

The package is deliberately transport- and storage-agnostic. Its immutable manifests,
hash-chained ledgers, strict runtime schemas, deterministic replay checks, and stable decision
codes are intended to sit behind the versioned EconomyOS API. Collaboration records only point
to versioned artifacts and evidence; they never embed or replace scientific values.

## Commands

From the repository root:

```sh
corepack pnpm --filter @economyos/collaboration-ecosystem typecheck
corepack pnpm --filter @economyos/collaboration-ecosystem build
corepack pnpm exec vitest run packages/collaboration-ecosystem/src
```

## Security boundaries

- Every workspace, membership, credential, quota, webhook, extension, and audit operation is
  organization-scoped and deny-by-default.
- API secrets are represented only by SHA-256 digests; signing keys remain caller-owned.
- Citation pointers bind an immutable artifact version and analytical `asOf`; evidence published
  later remains usable only when explicitly labeled `subsequent_evidence`.
- Webhook verification requires bounded timestamps and a durable nonce store supplied by the
  caller. The included memory store is for deterministic single-process execution and tests.
- Extensions declare all capabilities, egress, resource ceilings, and runtime isolation before
  workspace-scoped certification and admission. Admission binds compatibility and quota evidence
  to the exact principal, workspace, extension version, and request time; it never executes
  provider or model code.
- Append-only in-memory ledgers prove state-machine and replay semantics, but production requires
  transactional durable storage with cross-process uniqueness.

## Honest limits

This is a domain core. It provides the immutable developer-portal listing contract, not a rendered
portal or HTTP routes. It also does not provide SDK packaging, CLI binaries, webhook transport,
extension execution, persistent storage, distributed locks, secret management, billing-provider
integration, or user interface. Production webhook DNS/IP resolution still requires the runtime
SSRF/egress guard. Certification means validation of supplied evidence under these contracts, not
an external security assessment. Reservation consumption and admission persistence must share a
durable transaction/uniqueness boundary in the product service.
