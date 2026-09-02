# Phase 15 Enterprise Hardening Operations Runbook

Status: readiness-contract runbook; repository tests alone cannot authorize production release.

## Prepare the release candidate

1. Freeze the release artifact, source revision, lockfile/SBOM, configuration, policy, topology, migrations, and rollback target by digest.
2. Validate the tenant's identity, MFA/step-up, SCIM, session, revocation, residency, deployment-mode, privacy, audit, commercial, localization, recovery, capacity, and SLO policies.
3. Validate every critical service and dependency in the production topology, including failure domains, private networking, workload identity, administrative access, backups, and regional data routes.
4. Confirm the deployment mode does not enable a prohibited external provider, especially for air-gapped operation.

## Execute and admit evidence

1. Run every required gate in production or its explicitly approved production-shaped environment.
2. Retain the raw external artifacts, sampled observations, commands/configuration, environment identity, start/end times, limitations, and result.
3. Obtain a detached signature from the authorized producer and independent review from a different actor.
4. Verify the artifact digest and signature against the approved trust store; reject revoked, expired, partial, synthetic, staging-only, or mismatched evidence.
5. Admit the immutable evidence envelope and retain its external verification receipt.
6. Re-run any gate whose evidence expires, is revoked, refers to another release/policy/topology, or gains an unaccepted limitation.

## Assess and authorize

1. Build the complete thirteen-kind evidence set for one exact tenant, release, policy, and topology.
2. Compute the deterministic assessment and verify its replay digest and canonical gate order.
3. Stop if any gate fails or the assessment is expired.
4. Have an independent release approver record a bounded approval whose validity does not exceed the assessment.
5. Check assessment, approval, evidence, and trust-store revocation again immediately before rollout.
6. Roll out progressively, observe the declared production SLOs and error budget, and halt or roll back on a gate breach.
7. Record an explicit revocation when authorization is withdrawn; never delete or mutate the prior approval.

## Repository verification

```bash
corepack pnpm exec vitest run packages/enterprise-hardening/src
corepack pnpm exec vitest run packages/enterprise-hardening/src --coverage --coverage.include='packages/enterprise-hardening/src/**/*.ts'
corepack pnpm --filter @economyos/enterprise-hardening typecheck
corepack pnpm --filter @economyos/enterprise-hardening build
corepack pnpm exec biome check packages/enterprise-hardening
```

These commands verify contract behavior only. Also require the repository-wide unit/coverage/build gates, all migrations on a disposable database, object-storage and Temporal integration, browser accessibility/localization, security/advisory scans, a signed SBOM/provenance artifact, staging deployment, rollback rehearsal, and the real external evidence above.

## Immediate stop conditions

Stop release on a digest/signature/trust failure, revoked or expired evidence, wrong tenant/release/policy/topology, missing evidence kind, actor-duty overlap, open security exception, failed privacy deletion, incomplete locale validation, breached RPO/RTO or SLO, insufficient capacity headroom, unresolved penetration finding, reconciliation mismatch, unavailable rollback, or failed operational drill.

## Current external obligations

Integrate a real IdP and SCIM service; persistent append-only evidence and revocation stores; signed artifact verification; production-shaped regional/private deployment; HA/failover and restore exercises; representative load and capacity tests; independent penetration test; privacy/legal/compliance review; commercial reconciliation; human review for all twelve locales; operational/on-call drills; and approved production SLO observations.
