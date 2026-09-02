# Phase 15 Enterprise Hardening Methodology

Status: `in_progress` — fail-closed policy and readiness contracts are implemented; real production-shaped execution evidence is not yet accepted.

## Purpose and evidence rule

`@economyos/enterprise-hardening` turns enterprise requirements into immutable policy, topology, evidence, assessment, approval, expiry, and revocation contracts. It deliberately cannot turn a plan, synthetic fixture, staging-only observation, partial result, self-attestation, or document into proof that a production control was executed.

Each admitted evidence envelope pins the policy, topology, release artifact, configuration, statement, external artifact, signer, verification receipt, execution environment, validity period, limitations, and content digest. The caller must authenticate the signer, fetch and verify external artifacts, and consult the current revocation registry. A matching SHA-256 proves content identity relative to a pinned digest, not authorship.

## Enterprise policy and topology

Tenant policy covers brokered SAML, SCIM lifecycle, MFA and step-up, session rotation and refresh-reuse response, role/revocation targets, data-class routing, storage/processing/backup/support/export regions, deployment modes, privacy, localization, audit, commercial controls, SLOs, recovery, and capacity.

Production topology validates every critical service, at least three active failure domains, private networking, workload identity, JIT/MFA administrative access, encrypted point-in-time backups, bounded dependencies, and allowed regional routes. Shared, dedicated, customer-VPC, on-premise, and air-gapped modes remain distinct; air-gapped mode cannot silently retain an external provider.

## Required execution gates

A complete assessment contains thirteen externally attested evidence kinds:

1. identity and access;
2. SCIM lifecycle;
3. residency/private deployment;
4. backup restoration;
5. recovery exercise;
6. production SLO window;
7. load and capacity;
8. penetration test;
9. security and compliance controls;
10. privacy controls;
11. all-locale release evidence;
12. commercial operations; and
13. operational readiness.

The validators enforce production environment, exact release/policy/topology binding, bounded and recent observations, required sample/artifact/queue evidence, recovery RPO/RTO, tenant/PIT/encryption/artifact integrity, exact integer SLO error budgets, closed control findings, privacy-store correspondence, twelve distinct locales, reconciliation, runbooks, drills, and accepted limitations.

## Assessment, approval, and revocation

Assessment output has a canonical gate order and deterministic digest. `ready` is possible only when every required gate passes and the assessment remains valid. Evidence producer, reviewer, assessor, and release approver duties are separated. Approval has its own expiry and cannot outlive the assessment. Revocation is a later independently recorded immutable event and immediately makes authorization false.

## Executable evidence and limits

- 171 tests pass across three files.
- Focused coverage: 95.49% statements, 91.39% branches, 100% functions, and 95.94% lines.
- TypeScript typecheck/build, Biome, and distribution export checks pass.

The package does not operate an IdP/SCIM service, cloud or private deployment, trust/revocation store, audit store, monitor, billing system, translation workflow, deployment controller, or evidence repository. No real HA/failover, restore, disaster-recovery, load/capacity, penetration, privacy-deletion, legal/compliance, commercial, human-locale, or production-SLO execution has been performed by the package. Phase 15 and product release remain unaccepted until those external obligations are executed and independently approved.
