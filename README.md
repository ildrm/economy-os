# EconomyOS

EconomyOS is an evidence-first, point-in-time economic intelligence and causal world-model platform. It is being delivered through explicit acceptance phases; the repository does not use feature stubs or demo data to claim production capability.

## Current status

- Phase 0 — repository audit and specification: **accepted**
- Phase 1 — foundation: **accepted**
- Phase 2 — canonical economic data platform: **accepted**
- Phases 3–6 — product intelligence, crisis, causal graph, and investment slices: **in progress**
- Phases 7–15 — governed analytical, collaboration, and enterprise-hardening cores: **in progress**

No Phase 3–15 status is promoted from package tests alone. Persistence, APIs, workers, UI, empirical validation, and external operational evidence remain phase-specific gates. The normative roadmap is in [`docs/16-roadmap.md`](docs/16-roadmap.md), current evidence is in [`docs/21-implementation-status.md`](docs/21-implementation-status.md), capability mapping is in [`docs/TRACEABILITY.md`](docs/TRACEABILITY.md), and the product release procedure is in [`docs/49-product-release-gate-runbook.md`](docs/49-product-release-gate-runbook.md).

The behavioral and allocation research increment adds explicit-assumption decision models, source-span intervention candidates, multidimensional planning contracts, exact material-balance kernels, and a localized research workspace at `/en/intelligence/research` (all 12 locales supported). Results remain hypothetical or unvalidated research. See the [audit report](docs/audit-remediation-report.md) and [coverage gaps](docs/audit-product-coverage.md).

## Repository layout

```text
apps/          Product API and web application
packages/      Shared contracts, configuration, security, i18n, and platform code
services/      Durable TypeScript workflow workers; scientific services land in later phases
database/      Append-only SQL migrations and database verification
docs/          Product, architecture, governance, and delivery specifications
```

## Prerequisites

- Node.js 26.5.0 (from `.node-version`)
- pnpm 11.15.1 through Corepack
- Docker for database integration tests

## Commands

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm release:automation:verify
corepack pnpm policy:self-test
corepack pnpm repository:verify
corepack pnpm licenses:verify
corepack pnpm check
corepack pnpm test:coverage
corepack pnpm build
docker compose up --detach --wait postgres s3mock
corepack pnpm db:setup:local
export ECONOMYOS_VERIFY_DATABASE=economyos_verify_local_20260902_001
export ECONOMYOS_BENCHMARK_DATABASE=$ECONOMYOS_VERIFY_DATABASE
export ECONOMYOS_VERIFY_RUN_ID=local-20260902-001
corepack pnpm db:prepare
corepack pnpm db:verify
corepack pnpm benchmark:db
corepack pnpm object-storage:verify
corepack pnpm ingestion:temporal:verify
corepack pnpm test:a11y
corepack pnpm test:intelligence
corepack pnpm test:research
corepack pnpm benchmark:research
corepack pnpm benchmark:pit
corepack pnpm release:evidence:generate
corepack pnpm release:evidence:verify
corepack pnpm db:drop
```

Copy `.env.example` to a local untracked environment file and provide an OIDC issuer/audience for authenticated API requests. Secrets must not be committed. The owned disposable-database lifecycle and unsigned candidate evidence boundary are detailed in [`docs/50-release-automation-runbook.md`](docs/50-release-automation-runbook.md).

## Evidence rules

All analytical data must be typed as observed, estimated, forecast, scenario, synthetic demo/research, or unknown. Governed point-in-time queries require a knowledge cutoff. Synthetic demo records are excluded from production paths by policy.

The repository is not yet cleared for production. Phase 15 contracts require real, signed, independently reviewed identity, residency, HA/DR, restore, capacity, penetration, privacy, localization, commercial, SLO, and operational evidence for one immutable release candidate.
