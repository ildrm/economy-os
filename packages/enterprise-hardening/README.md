# Enterprise hardening domain contracts

This package is the Phase 15 fail-closed policy and release-readiness core. It models immutable
tenant policy, production topology, externally attested execution evidence, deterministic gate
assessment, independent approval, expiry, and explicit approval revocation.

## What it enforces

- brokered SAML, SCIM lifecycle, MFA/step-up, session rotation, refresh-reuse detection, and
  measured revocation targets;
- allowed storage, processing, backup, support, and export regions for every data class;
- shared, dedicated, customer-VPC, on-premise, and air-gapped deployment contracts, including
  external-provider disablement for air-gapped deployments;
- at least three failure domains for every critical service, encrypted PIT backup declarations,
  private networking, workload identity, JIT/MFA administrative access, and bounded topology;
- executed recovery and clean-environment restore evidence with RPO/RTO, tenant, encryption,
  point-in-time, artifact, policy/catalog, and workflow-integrity checks;
- production SLO windows and bounded load/capacity observations with exact integer error-budget
  calculations, release-artifact pinning, latency/error/saturation/queue targets, and headroom;
- penetration, advanced audit, security-control, privacy/deletion, commercial reconciliation,
  twelve-locale, software-supply-chain, drill, runbook, and operational-readiness gates;
- producer/reviewer/assessor/approver separation, evidence age and validity, immutable SHA-256
  manifests, replay equality, canonical result ordering, and independently recorded revocation.

Plans, synthetic declarations, partial results, failed results, revoked results, unaccepted
limitations, staging SLOs, stale evidence, unsigned/unverified execution receipts, open security
exceptions, and incomplete gate sets cannot produce a `ready` assessment. Test fixtures simulate
the shape of externally executed evidence; they are never product-release evidence.

## Trust and claim boundary

This is a pure, in-memory domain package. It does **not** implement an identity provider, SCIM
server, deployment controller, audit store, billing provider, translation workflow, monitoring
backend, or evidence repository. It does not run a penetration test, load test, restore exercise,
failover, privacy deletion, human translation review, or production drill.

The evidence envelope records a detached-signature verification receipt and pins its statement,
artifact, configuration, release, policy, and topology digests. The caller remains responsible for
fetching those external artifacts, authenticating the signer against an approved trust store,
performing the signature and digest verification, checking the current revocation registry, and
persisting append-only records. A manifest SHA-256 detects changes relative to a pinned digest; it
is not by itself proof of authorship. Framework mappings are control evidence, not a claim of SOC,
ISO, privacy, or regulatory certification.

Consequently, this package can establish that a supplied evidence set satisfies the declared Phase
15 contract. EconomyOS cannot claim production readiness until real production or
production-shaped external executions have been admitted, independently accepted, persisted, and
kept current. Cloud HA/DR, capacity, penetration, legal/privacy, commercial, and all-locale release
evidence remain external release obligations.

## Verification

From the repository root:

```bash
pnpm exec vitest run packages/enterprise-hardening/src
pnpm exec vitest run packages/enterprise-hardening/src --coverage \
  --coverage.include='packages/enterprise-hardening/src/**/*.ts'
pnpm --filter @economyos/enterprise-hardening typecheck
pnpm --filter @economyos/enterprise-hardening build
pnpm exec biome check packages/enterprise-hardening
```

The package coverage gate is at least 85% statements, lines, and functions and at least 80%
branches. Verification is deterministic and uses no network or external service.
