# Product Release Gate Runbook

This how-to guide is for release engineers and approvers preparing an EconomyOS release candidate. It does not authorize deployment by itself. A candidate is releasable only when repository gates and the Phase 15 externally executed evidence set both pass for the same immutable release.

## 1. Freeze one candidate

Record immutable digests for:

- source revision and clean change set;
- `pnpm-lock.yaml`, production dependency graph, license report, and SBOM;
- application/container artifacts and configuration schema;
- database migrations and supported prior schema;
- tenant enterprise policy and production topology;
- model, parser, connector, dataset, and ontology artifacts included in the release;
- rollback application artifact and forward database-recovery plan.

Do not rebuild between staging evidence and production promotion. A changed digest is a new candidate and requires re-execution of affected gates.

## 2. Run hermetic repository gates

Use Node.js 26.5.0, Corepack 0.34.6, and pnpm 11.15.1. Install from the committed lockfile, then run:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm release:automation:verify
corepack pnpm policy:self-test
corepack pnpm repository:verify
corepack pnpm licenses:verify
corepack pnpm check
corepack pnpm test:coverage
corepack pnpm build
corepack pnpm benchmark:pit
```

Run the production advisory audit in an organization-approved network because it sends the production package graph to the configured advisory service:

```bash
corepack pnpm audit --prod
```

A prior audit is not evidence for a changed lockfile. Preserve commands, tool versions, timestamps, exit codes, and reports.

## 3. Verify real local integrations

Start only the pinned local integration services:

```bash
docker compose up --detach --wait postgres s3mock
```

Create a uniquely named disposable verification database. Never point destructive setup or verification work at the default `economyos` database. Set `ECONOMYOS_VERIFY_DATABASE` and `ECONOMYOS_BENCHMARK_DATABASE` to that exact disposable name and set a non-secret unique `ECONOMYOS_VERIFY_RUN_ID`, then run:

```bash
corepack pnpm db:prepare
corepack pnpm db:verify
corepack pnpm benchmark:db
corepack pnpm object-storage:verify
corepack pnpm ingestion:temporal:verify
corepack pnpm db:drop
```

The prepare command refuses an existing database and binds a new database to the run ID; cleanup refuses a missing or mismatched ownership marker. The database gate must apply every migration from a clean schema and verify forced RLS, two-tenant isolation, append-only records, idempotency, point-in-time behavior, legal/quality serving boundaries, exact decimals, and all phase-specific persistence invariants. Preserve the disposable database until the evidence is reviewed, then run the ownership-checked drop command.

## 4. Verify the product surface

Build the production web/API artifacts and run:

```bash
corepack pnpm test:a11y
corepack pnpm test:intelligence
```

Inspect desktop and mobile results across all twelve locales, including Persian and Arabic RTL. Confirm keyboard operation, focus behavior, overflow, semantic error/loading/not-found states, evidence drill-down, cutoff restoration, and clear separation of observed, forecast, causal, and scenario content.

Run authenticated API smoke and abuse tests against the compiled artifact. Confirm global authentication, tenant/workspace authorization, non-enumerating failures, bounded pagination/body/query limits, rate and quota behavior, security/no-store headers, trace IDs, and redacted problem responses.

Generate the local candidate inventory after all build outputs are final:

```bash
corepack pnpm release:evidence:generate
corepack pnpm release:evidence:verify
```

These commands bind a CycloneDX production SBOM and explicitly unsigned in-toto statement to the source, lockfile, toolchain, and build-output digests. They do not sign, archive, publish, or authorize the candidate; follow [`docs/50-release-automation-runbook.md`](50-release-automation-runbook.md) and complete those actions in the approved release system.

## 5. Produce Phase 15 external evidence

For the exact release, policy, and topology, execute and independently review all thirteen evidence kinds defined by `@economyos/enterprise-hardening`:

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
11. all-locale release validation;
12. commercial operations; and
13. operational readiness.

Store raw signed artifacts in the approved evidence system. Verify signer trust and current revocation, artifact digest, environment, execution time, validity, limitations, tenant, release, policy, and topology. Synthetic fixtures, plans, incomplete runs, staging SLOs, expired receipts, or self-review do not satisfy the gate.

## 6. Rehearse rollout and recovery

- Deploy the same signed artifact to a production-shaped staging environment.
- Migrate from every supported prior schema under representative traffic.
- Exercise progressive rollout, automatic halt, stateless rollback, and the forward database-recovery path.
- Restore PostgreSQL, object, workflow, policy/catalog, graph, and model artifacts; verify tenant isolation, encryption, PIT semantics, and cross-store references.
- Exercise worker loss/redelivery, dependency degradation, and duplicate delivery without duplicated observations or billed usage.
- Confirm on-call ownership, alerts, runbooks, communications, status page, incident roles, and stop authority.

## 7. Make the decision

The release approver must be independent of evidence production and assessment. Immediately before approval, recheck evidence expiry/revocation, open findings, advisory status, error budget, capacity headroom, rollback availability, and artifact identity.

Decision rules:

- `DO NOT SHIP`: any critical repository failure, missing/failed Phase 15 gate, unverified signature, expired/revoked evidence, open critical/high security issue, failed restore/rollback, or unresolved tenant/privacy boundary.
- `SHIP WITH CAUTION`: no critical failure, but explicitly accepted bounded noncritical risks remain. Record owner, mitigation, expiry, and stop condition.
- `CLEAR TO SHIP`: all automated and external gates pass for the same candidate, every limitation is accepted, and an unexpired independent approval exists.

After rollout, retain the decision and all evidence, monitor the declared SLO/error budget, and record any authorization withdrawal as an immutable revocation.
