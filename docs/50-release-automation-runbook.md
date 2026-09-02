# Release Automation Runbook

This runbook covers repository and local-integration evidence only. The CI workflow does not deploy, publish, sign, attest, or authorize a production release. The independent Phase 15 evidence and approval process in [the product release gate runbook](49-product-release-gate-runbook.md) remains mandatory.

## Pinned execution contract

Release automation uses the exact versions declared in the repository:

- Node.js is read from `.node-version` and must equal `package.json#engines.node`.
- pnpm must equal both `package.json#engines.pnpm` and `package.json#packageManager`.
- Corepack must equal `package.json#config.releaseToolchain.corepack`.
- Every Compose integration image must be pinned by SHA-256 digest.

Run `corepack pnpm release:automation:verify` before the longer gates. It validates these pins, Compose syntax, CI gate order, disposable-database cleanup, and the production-SBOM primitives.

## Apply-only schema migration and local bootstrap

`corepack pnpm db:migrate` is the apply-only schema migration entry point. It reads `MIGRATION_DATABASE_URL`, requires `ECONOMYOS_MIGRATION_CONFIRM_DATABASE` to exactly repeat the URL's database name, refuses runtime-role credentials and `economyos_verify_*` targets, verifies immutable checksums, and serializes runners with a PostgreSQL advisory lock. It never runs destructive verification fixtures or drops a database. A non-loopback target additionally requires `ECONOMYOS_MIGRATION_ALLOW_REMOTE=true` and `sslmode=verify-full`.

For the pinned Compose profile, copy `.env.example` to the ignored `.env`, start PostgreSQL, and run `corepack pnpm db:setup:local`. The command applies migrations to the confirmed loopback `economyos` database and creates only the fixed least-privilege application and ingestion login roles using the development-only passwords in their URLs. It is disabled under `NODE_ENV=production` and requires `ECONOMYOS_LOCAL_BOOTSTRAP_CONFIRM=local-only`.

Production migration credentials, TLS roots, secret delivery, backup/restore, rollback/forward recovery, and change approval belong to the deployment system. The local bootstrap must never be used as a production provisioning mechanism.

## Owned disposable database

Database verification never runs against the default `economyos` database. Set all three values for one run:

```text
ECONOMYOS_VERIFY_DATABASE=economyos_verify_<unique>
ECONOMYOS_BENCHMARK_DATABASE=economyos_verify_<same_unique>
ECONOMYOS_VERIFY_RUN_ID=<non-secret-unique-run-id>
```

The two database names must match. `corepack pnpm db:prepare` refuses a database that already exists, creates a clean database, and writes an ownership marker bound to the run ID. `corepack pnpm db:drop` refuses cleanup if that marker is missing or does not match. This prevents a failed setup from turning an unconditional cleanup step into deletion of somebody else's database.

With the pinned Compose services running, use this sequence:

```bash
corepack pnpm db:prepare
corepack pnpm db:verify
corepack pnpm benchmark:db
corepack pnpm db:drop
```

Keep the drop step under an unconditional CI cleanup condition. A failed or refused cleanup is itself a gate failure. `docker compose down --volumes` is appropriate only for the isolated CI/local Compose project because it removes the complete local PostgreSQL volume.

## Candidate evidence bundle

After the production build and repository gates pass, run:

```bash
corepack pnpm release:evidence:generate
corepack pnpm release:evidence:verify
```

Generation defaults to a clean Git tree and fails closed for missing workspace build outputs, toolchain drift, symbolic links in captured artifacts, missing production dependency identities, or an unreadable dependency graph. `ECONOMYOS_ALLOW_DIRTY_RELEASE_EVIDENCE=true` exists only for local script testing; such a manifest records `repositoryEvidenceComplete: false` and is not release evidence.

The ignored `artifacts/release-evidence/` directory contains:

- `release-manifest.json`: source and build-output file hashes, aggregate candidate identity, lockfile binding, toolchain, and explicit external actions;
- `sbom.cdx.json`: CycloneDX 1.6 production dependency inventory from the installed frozen pnpm graph; and
- `provenance-unsigned.intoto.json`: an in-toto Statement bound to source, build output, revision, and lockfile.

The local statement deliberately says that its signature is absent, external evidence is unsatisfied, and production release is unauthorized. Verification detects workspace, artifact, lockfile, candidate, SBOM, or statement drift, but cannot establish signer authenticity. Archive the exact build and evidence bundle in the approved release system, then create and verify trusted signed provenance there.

## CI boundary

`.github/workflows/ci.yml` executes repository policy, dependency audit, license, lint, type, unit, coverage, build, Temporal, PostgreSQL, object-storage, performance, accessibility, localization, browser intelligence, and release-evidence gates. It generates and verifies the local evidence bundle but intentionally does not upload or publish it. Until an approved immutable artifact archive and trusted signing/attestation job retains the exact candidate outputs, a green CI run is still **DO NOT SHIP**.

Dependency installation, the advisory audit, Playwright browser installation, and the Temporal test environment require organization-approved network access in CI. The remaining external release blockers include artifact signing/retention, source/container/IaC scanning, production-shaped deployment and rollback, backup restoration and recovery exercises, load/capacity evidence, independent penetration testing, real identity/residency controls, production SLO evidence, and independent Phase 15 approval.
