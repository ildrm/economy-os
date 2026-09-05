# EconomyOS

EconomyOS is an evidence-first economic intelligence and research platform. It connects economic observations to their sources, preserves what was knowable at a particular time, and provides governed tools for economic-state analysis, causal research, forecasting, and hypothetical scenarios.

The project is designed for analysts, researchers, and organizations that need to inspect how a result was produced: which data release it used, which assumptions it made, which model version ran, and which access and usage rules applied. It is a TypeScript monorepo with a Next.js web application, a NestJS/Fastify API, a Temporal ingestion worker, and PostgreSQL/TimescaleDB persistence.

**Status:** the foundation and canonical data platform have passed their declared local acceptance gates. Analytical product phases remain in progress, and the complete product is **not cleared for production release**. Working research kernels and local tests do not establish empirical model validity or production readiness.

## Contents

- [What EconomyOS provides](#what-economyos-provides)
- [Evidence and point-in-time semantics](#evidence-and-point-in-time-semantics)
- [Architecture and repository layout](#architecture-and-repository-layout)
- [Prerequisites](#prerequisites)
- [Local setup](#local-setup)
- [Running in development](#running-in-development)
- [Authentication and API access](#authentication-and-api-access)
- [Configuration reference](#configuration-reference)
- [Testing and verification](#testing-and-verification)
- [Production builds and deployment](#production-builds-and-deployment)
- [Command reference](#command-reference)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Documentation map](#documentation-map)
- [License](#license)

## What EconomyOS provides

Capabilities have different levels of integration. A domain package may contain executable, tested models while its complete API, user workflow, or empirical acceptance remains unfinished.

| Area | Implemented scope | Current boundary |
| --- | --- | --- |
| Canonical economic evidence | Source and dataset identities, releases, exact values, missingness, raw payload checksums, transformation lineage, legal/quality admission, and point-in-time reads | Real use requires admitted datasets and source permissions; installation does not populate a live global dataset |
| Durable ingestion | World Bank WDI connector, immutable object landing, parsing/reparsing, quality checks, quarantine, promotion, replay, and release-notification workflows | Requires separately configured Temporal, storage, catalog records, and signed workflow authorization |
| Economic intelligence | Economic-state calculation and persistence, governed vector discovery/detail/comparison APIs, and global/country/comparison web surfaces | Broader product workflows and empirical validation remain open |
| Crisis, relationships, and capital research | Domain engines and selected persisted, protected read APIs | Package implementation does not mean all analyst workflows are delivered |
| Behavioral economics | Theory registry, study/evidence contracts, source-span intervention candidates, explicit-parameter choice models, and bounded forecast/graph integration | Intervention matches are lexical candidates; model outputs are hypothetical or unvalidated research |
| Allocation and planning | Independent regime dimensions, plan/target/control contracts, exact material balance, shortages, fulfillment, and a one-period planner/enterprise simulation | Full plan management, national allocation optimization, and multi-period enterprise dynamics are not implemented |
| Research workspace | Authenticated immutable research runs; localized intertemporal-choice and material-balance forms; theory exploration and provenance display | The API supports four research kinds; the UI exposes two calculation flows. Full study/review/planning workspaces remain open |
| Additional research and governance | Narrative intelligence, forecasting, causal inference, simulation, scenarios, systemic risk, model governance, collaboration, and enterprise-hardening packages | Integration and release acceptance are tracked separately for each phase |
| Platform controls | OIDC/JWKS verification, tenant/workspace authorization, PostgreSQL row-level security, immutable scientific records, structured errors, tracing, accessibility, and localization | Production identity, deployment, recovery, security, and operational evidence are still required |

The interface supports 12 locale identifiers: `en`, `fa`, `de`, `fr`, `zh-Hans`, `ru`, `es`, `pt`, `hi`, `ar`, `hy`, and `tr`. Persian and Arabic use right-to-left layouts. Technical theory metadata may retain explicitly marked English text; automated locale coverage does not replace human translation and accessibility review.

For precise completion claims, use the [implementation status](docs/21-implementation-status.md), [roadmap](docs/16-roadmap.md), [capability traceability](docs/TRACEABILITY.md), and [audit coverage and remaining gaps](docs/audit-product-coverage.md).

## Evidence and point-in-time semantics

EconomyOS distinguishes observed data, estimates, forecasts, scenarios, synthetic demo/research data, and unknown values. A missing input remains missing; it is not silently converted to zero, a neutral score, or fabricated evidence. Research runs are stored as scenarios with caller-supplied, unverified inputs, separately from admitted observations.

Economic data changes after its first publication. A backtest using a later revision can accidentally include information unavailable at the prediction date. Governed requests therefore carry a knowledge cutoff, `knownAt`, and a declared policy:

| Policy | Meaning |
| --- | --- |
| `true_vintage` | Select evidence under verified historical availability constraints |
| `reconstructed` | Use explicitly identified reconstructed availability where that quality is supported |
| `latest_revised` | Use the latest-revised policy without claiming that the values were historically available |

Where supported, `systemAt` also constrains what had entered the platform by a particular system time. Release time, economic period, knowledge time, and system admission time are distinct. Exact decimals travel as strings, and timestamp precision is validated by the relevant endpoint. Provenance connects admitted results to source, release, payload, parser, configuration, and quality evidence.

Tenant identity comes from verified authentication and is reconciled with current database-backed membership and authorization. A workspace identifier in a request is a requested scope, not permission to access it. Governed database operations use restricted roles and tenant-scoped transactions.

See the [canonical data model](docs/05-canonical-data-model.md), [point-in-time architecture](docs/06-point-in-time-data-architecture.md), [security architecture](docs/07-security-architecture.md), and [multi-tenant architecture](docs/08-multi-tenant-architecture.md).

## Architecture and repository layout

The current deployable application units are the web application, product API, and ingestion worker. Shared packages hold domain logic and contracts. PostgreSQL stores governed records; the worker preserves raw payloads in S3-compatible storage and executes durable workflows through Temporal.

```text
Browser
  -> deployment-provided same-origin authentication gateway
       -> Next.js web application
       -> /api/v1/* -> NestJS/Fastify API -> PostgreSQL / TimescaleDB

Authorized workflow client -> Temporal -> ingestion worker
                                          -> source connector
                                          -> S3-compatible raw payload storage
                                          -> PostgreSQL / TimescaleDB
```

The gateway shown above is a deployment requirement; this repository does not include a working browser login/session gateway. Local Compose includes **only PostgreSQL/TimescaleDB and S3Mock**. Broader architecture documents describe future or production services such as Valkey, scientific services, MLflow, and graph infrastructure; these are not additional runnable services in the current Compose file.

```text
apps/
  api/                         NestJS/Fastify API and apply-only migration runner
  web/                         Next.js App Router UI and locale routes
packages/
  contracts/                   Shared domain contracts
  canonical-data/              Canonical records and source connector
  data-admission/              Ingestion, quality, and admission contracts
  economic-state/              Economic-state calculations
  crisis-engine/               Crisis research
  causal-graph/                Relationship and causal graph contracts
  causal-inference/            Causal estimation research
  capital-allocation/          Capital research
  narrative-intelligence/      Narrative evidence and analysis
  forecasting-engine/          Forecasting research
  behavioral-economics/        Behavioral models, evidence, and integrations
  allocation-planning/         Planning contracts and exact allocation kernels
  simulation-engine/          Simulation research
  scenario-lab/                Scenario contracts and execution logic
  systemic-risk/              Systemic-risk research
  model-governance/            Model lifecycle and governance
  collaboration-ecosystem/     Collaboration and ecosystem contracts
  enterprise-hardening/        Enterprise and release evidence contracts
  config/                     Validated API configuration
  security/                   Authentication and authorization policies
  object-storage/             Immutable S3 adapter
  observability/              Logging and telemetry
  i18n/                       Locale definitions and translations
  design-tokens/              Shared design foundations
services/
  ingestion-worker/           Temporal worker and authorized workflow client
database/
  migrations/                 Ordered, checksum-locked SQL migrations
  verify.ts                   Disposable-database verification runner
  benchmark.ts                Governed database PIT benchmark
scripts/                      Repository, integration, performance, release gates
tests/                        Playwright accessibility and product tests
docs/                         Requirements, methodology, runbooks, audit evidence
.github/workflows/ci.yml       Continuous verification; no deployment job
docker-compose.yml            Pinned local integration services
```

## Prerequisites

Use the exact repository toolchain rather than an arbitrary current Node.js or pnpm version.

| Requirement | Version or purpose |
| --- | --- |
| Node.js | **26.5.0**, pinned in [`.node-version`](.node-version) and [`package.json`](package.json) |
| Corepack | **0.34.6**, pinned in the root release-toolchain configuration |
| pnpm | **11.15.1**, selected by the root `packageManager` field |
| Git | Clone the repository and bind release evidence to a source revision |
| Docker with Compose v2 | Local PostgreSQL/TimescaleDB, S3Mock, database verification, and Compose validation |
| Chromium via Playwright | Browser and accessibility tests; installed separately below |
| Temporal service | Needed to run the ingestion worker; its dedicated integration test starts a temporary server |
| OIDC provider | Needed for authenticated API access; not needed to view the web shell |

Install Node.js 26.5.0 with your preferred version manager, then activate the package-manager toolchain as CI does:

```bash
npm install --global corepack@0.34.6 --ignore-scripts
corepack enable
node --version
corepack --version
corepack pnpm --version
docker compose version
```

The expected Node/Corepack/pnpm outputs are `v26.5.0`, `0.34.6`, and `11.15.1`. Package installation, image pulls, advisory checks, browser installation, and the initial Temporal test-server download require network access. An offline frozen install works only after the required packages are cached.

## Local setup

Run commands from the repository root unless a step explicitly says otherwise. Examples use a POSIX-compatible shell, such as Bash or Zsh.

### 1. Clone and install

```bash
git clone https://github.com/ildrm/economy-os.git
cd economy-os
corepack pnpm install --frozen-lockfile
corepack pnpm release:automation:verify
```

The frozen install preserves the committed dependency graph. The release-automation check validates toolchain pins, Compose configuration, and verification contracts; it does not start the application.

### 2. Create local configuration

Copy the example only if you do not already have a local `.env`:

```bash
test -f .env || cp .env.example .env
```

The checked-in [`.env.example`](.env.example) contains development-only database identities and S3Mock credentials. Its OIDC addresses intentionally use `.invalid` placeholders. Replace the OIDC configuration to exercise protected endpoints. Keep actual secrets in the ignored `.env` or your secret-management system.

The API, ingestion worker, and database administration scripts load the root `.env`; environment variables already supplied by the process take precedence. The web app does not load the root `.env` through those loaders. Do not source the root file into every shell: its `PORT=4000` is for the API, and its other values include server-only credentials.

### 3. Start dependencies and prepare the application database

```bash
docker compose up --detach --wait postgres s3mock
corepack pnpm db:setup:local
```

`db:setup:local` applies the migrations to the local `economyos` database and creates the fixed restricted login roles `economyos_app_local` and `economyos_ingest_local`. It requires the local confirmation values supplied in `.env.example`, checks that all three database URLs point to the same loopback database, and refuses production mode.

The migration owner is separate from the runtime logins. **Do not replace `DATABASE_URL` with the migration-owner URL**: the API rejects owner, superuser, RLS-bypass, and other privileged runtime identities.

Bootstrap is not a demo-account or economic-data seeder. It does not issue access tokens, provision an OIDC provider, or give a browser user tenant membership and grants. Those records and admitted data must be provisioned through the appropriate controlled integration process. Verification fixtures belong to disposable test databases.

### 4. Build shared packages

```bash
corepack pnpm --filter './packages/**' build
```

Workspace consumers import compiled package outputs. Run this before starting the API or web application on a fresh checkout, and rebuild affected shared packages after changing them.

### Local addresses

| Service | Address | Notes |
| --- | --- | --- |
| Web development server | `http://127.0.0.1:3000/en` | Started manually in the next section |
| API | `http://127.0.0.1:4000/api/v1` | Root `.env` defaults |
| Swagger UI | `http://127.0.0.1:4000/api/docs` | Available outside production mode |
| PostgreSQL | `127.0.0.1:55432` | Compose maps to container port `5432` |
| S3Mock | `http://127.0.0.1:59090` | Test bucket: `economyos-local` |
| Temporal | `127.0.0.1:7233` | Expected default; not started by Compose |
| Playwright web server | `http://127.0.0.1:4401` | Managed by the browser test runner |

PostgreSQL data persists in the Compose named volume. S3Mock is a local integration fixture, not the production object-storage service.

## Running in development

### Web and API

After local setup, run these in separate terminals at the repository root.

API with source watching:

```bash
corepack pnpm --filter @economyos/api dev
```

Web with development reload:

```bash
corepack pnpm --filter @economyos/web dev --hostname 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000/en`. Useful routes include `/en/intelligence/global`, `/en/intelligence/countries`, `/en/intelligence/compare`, and `/en/intelligence/research`. Replace `en` with a supported locale to inspect localization and RTL behavior.

The web shell and theory explorer can be viewed without a populated API. Live governed reads and research execution need the [authentication and same-origin integration](#authentication-and-api-access) described below. Starting both servers on separate ports does not automatically wire the browser to the API.

Check the running API in another terminal:

```bash
curl --fail-with-body http://127.0.0.1:4000/api/v1/health/live
curl --fail-with-body http://127.0.0.1:4000/api/v1/health/ready
```

Liveness reports the process and implementation-phase status. Readiness checks API initialization and PostgreSQL connectivity, returning `503` when unavailable. It does not prove that OIDC, Temporal, storage, or a complete user journey is healthy. The API must establish its restricted database identity before it starts serving.

There is no root `dev` command. The API watcher watches its application sources; it is not a monorepo-wide rebuild service. After shared-package changes, rerun the shared-package build and restart consumers if needed.

### Ingestion worker

The worker is optional for viewing the UI and executing research calculations. To run ingestion, first provide a reachable Temporal development service matching `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, and `TEMPORAL_TASK_QUEUE`. The repository's Temporal integration tests pin CLI `1.8.1`; Compose does not provision a long-running Temporal service.

With the local database and S3Mock running, shared packages built, and root `.env` configured:

```bash
corepack pnpm --filter @economyos/ingestion-worker build
corepack pnpm --filter @economyos/ingestion-worker start
```

For local plaintext Temporal, the worker requires `NODE_ENV=development` or `test`, a loopback address, and `TEMPORAL_ALLOW_INSECURE_LOCAL=true`. The example configuration supplies that opt-in. The worker checks its database repositories and object storage before polling its task queue.

Starting a worker does not submit an ingestion job. Workflow submission uses the [authorized client](services/ingestion-worker/src/client.ts), approved dataset/parser identities, and an authorization envelope verified with `INGESTION_AUTHORIZATION_KEYS`. There is no generic root `ingest` CLI or automatic live-data seed. See the [data-source strategy](docs/14-data-source-strategy.md) and [implementation status](docs/21-implementation-status.md) before introducing a provider.

### Stopping and restarting

Use `Ctrl+C` to stop host application processes. Stop the local dependencies while retaining their containers and PostgreSQL data:

```bash
docker compose stop postgres s3mock
```

Restart with the same `docker compose up --detach --wait postgres s3mock` command. `docker compose down` removes the containers while retaining the named volume. Adding `--volumes` deletes the local PostgreSQL volume; reserve that for an intentional reset or an isolated CI environment.

## Authentication and API access

### Identity configuration

Protected endpoints require `Authorization: Bearer <access-token>`. The API validates RS256 or ES256 signatures through the configured JWKS, issuer, audience, token times, and required claims. The `.invalid` provider in `.env.example` cannot authenticate users.

Configure the provider to supply these mappings, or change the corresponding environment variables:

| Environment variable | Default claim name | Expected identity |
| --- | --- | --- |
| `OIDC_SUBJECT_CLAIM` | `https://economyos.dev/subject_id` | Internal subject UUID |
| `OIDC_TENANT_CLAIM` | `https://economyos.dev/tenant_id` | Organization UUID |
| `OIDC_WORKSPACE_CLAIM` | `https://economyos.dev/workspaces` | Array of workspace UUIDs |

A valid token alone does not create membership, grant a role, or enable an entitlement. The subject, organization, workspace membership, grants, and applicable entitlements must agree with active database records. Research execution requires `model.execute`; research reads require `model.read`, with workspace and other policy checks.

Once an access token has been supplied securely as `ECONOMYOS_ACCESS_TOKEN`, this request checks the reconciled principal:

```bash
curl --fail-with-body \
  -H "Authorization: Bearer ${ECONOMYOS_ACCESS_TOKEN:?Set an OIDC access token first}" \
  http://127.0.0.1:4000/api/v1/me
```

### Browser integration

The current web clients call relative `/api/v1/*` URLs with credentials included. They do not attach a bearer token themselves. There is no Next.js API rewrite, bundled OIDC login flow, or `NEXT_PUBLIC_API_URL` switch that connects the standalone web server to port `4000`.

An authenticated deployment therefore needs a same-origin gateway/BFF integration that routes application pages to Next.js, routes `/api/v1/*` to the product API, and supplies the API's verified bearer-token flow from a securely managed user session. Forwarding a browser cookie to the API without that integration will not authenticate it. This deployment integration remains outside the supplied local bootstrap.

### API surface

All product routes below use the `/api/v1` prefix. Browse `/api/docs` in development or test mode for endpoint schemas, required query parameters, and error responses.

| Route group | Purpose |
| --- | --- |
| `GET /health`, `/health/live`, `/health/ready` | Public process and database readiness checks |
| `GET /me`, `/workspaces/:workspaceId/access` | Reconciled identity and workspace membership |
| `/evidence/series/:seriesId/*` | Governed observations, releases, release schedules, and subscriptions |
| `GET /evidence/observations/:observationId/provenance` | Governed source and transformation lineage |
| `/economic-state/*` | Models, runs, components, vectors, and comparisons |
| `/crisis/*`, `/relationship-graph/*`, `/capital-research/*` | Selected governed research reads |
| `/notifications/releases` | Release-notification records |
| `POST /research/runs` | Execute and preserve a scenario research run |
| `GET /research/runs/:id` | Read a run within workspace, knowledge, and system cutoffs |

Research commands include an `id`, `workspaceId`, `knownAt`, `kind`, and domain-specific `input`. Supported kinds are `behavioral_choice`, `material_balance`, `allocation_simulation`, and `intervention_detection`. Creation accepts millisecond-or-coarser knowledge cutoffs; read requests require both `knownAt` and `systemAt`. Repeating an identical command with the same ID returns its immutable original; conflicting reuse is rejected. See the [research controller](apps/api/src/research-workbench.controller.ts) and [input parser/service](apps/api/src/research-workbench.ts) for the complete contract.

## Configuration reference

The source of truth is [`.env.example`](.env.example), the [API configuration validator](packages/config/src/index.ts), the [worker validator](services/ingestion-worker/src/config.ts), and the [migration runner](apps/api/scripts/database-admin.mjs). Variables listed here are server configuration unless stated otherwise; never place credentials in client-visible environment variables.

| Variable or group | Purpose and behavior |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production`; API/worker default to `development` |
| `HOST`, `PORT` | API bind address and port; defaults `127.0.0.1:4000`. Set web host/port with its CLI flags |
| `DATABASE_URL` | Required API PostgreSQL URL using a restricted application login |
| `INGESTION_DATABASE_URL` | Separate ingestion login; worker falls back to `DATABASE_URL` if absent, so set it explicitly |
| `MIGRATION_DATABASE_URL` | Privileged schema-migration connection; not an application runtime credential |
| `ECONOMYOS_MIGRATION_CONFIRM_DATABASE` | Must exactly match the database name in the migration URL |
| `ECONOMYOS_MIGRATION_ALLOW_REMOTE` | Must be `true` for non-loopback migrations, which also require `sslmode=verify-full` |
| `ECONOMYOS_LOCAL_BOOTSTRAP_CONFIRM` | Must be `local-only` for the restricted local role bootstrap |
| `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URI` | Required API identity-provider settings |
| `OIDC_SUBJECT_CLAIM`, `OIDC_TENANT_CLAIM`, `OIDC_WORKSPACE_CLAIM` | Identity claim mappings described above |
| `S3_REGION`, `S3_BUCKET` | Required storage settings in API configuration and worker configuration |
| `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` | Optional custom endpoint and path-style addressing; local profile uses S3Mock |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` | AWS SDK credential inputs when not using another supported credential-provider mechanism; use workload credentials in deployment |
| `S3_MAXIMUM_OBJECT_BYTES`, `S3_REQUEST_TIMEOUT_MS` | Default object-size bound `50000000` bytes and timeout `30000` ms |
| `S3_KMS_KEY_ID` | Optional KMS encryption key; worker otherwise requests `AES256` server-side encryption |
| `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_TASK_QUEUE` | Defaults `127.0.0.1:7233`, `default`, and `economyos-ingestion-v1` |
| `TEMPORAL_TLS`, `TEMPORAL_ALLOW_INSECURE_LOCAL` | TLS policy and explicit development/test loopback plaintext opt-in |
| `TEMPORAL_API_KEY` | Worker identity option for authenticated Temporal connections |
| `TEMPORAL_MTLS_CLIENT_CERTIFICATE_PATH`, `TEMPORAL_MTLS_CLIENT_KEY_PATH` | Alternative mTLS identity; both paths required together |
| `TEMPORAL_SERVER_ROOT_CA_PATH`, `TEMPORAL_SERVER_NAME_OVERRIDE` | Optional Temporal TLS trust and server-name configuration |
| `INGESTION_AUTHORIZATION_KEYS` | Required worker verification keys: comma-separated `key-id:base64url-secret` entries, 32–64 decoded bytes per key, up to 16 rotation keys |
| `INGESTION_AUTHORIZATION_MAXIMUM_TTL_MS` | Default and maximum envelope TTL `900000` ms |
| `INGESTION_AUTHORIZATION_CLOCK_SKEW_MS` | Default allowed clock skew `30000` ms |
| `INGESTION_AUTHORIZATION_REPLAY_CAPACITY` | Default bounded replay capacity `10000` |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Optional API trace export endpoint; omit or leave empty when no collector is configured |
| `ECONOMYOS_VERIFY_DATABASE`, `ECONOMYOS_BENCHMARK_DATABASE`, `ECONOMYOS_VERIFY_RUN_ID` | Explicit, exported disposable-database ownership settings for verification; not runtime database settings |
| `S3_VERIFY_ENDPOINT`, `S3_VERIFY_BUCKET`, `S3_VERIFY_REGION` | Optional object-storage verification overrides; endpoint restricted to local HTTP |
| `ECONOMYOS_ALLOW_DIRTY_RELEASE_EVIDENCE` | Local script-testing escape hatch only; `true` marks repository evidence incomplete |

The API validates shared storage and Temporal configuration even if you are only using a read endpoint. The worker additionally validates connection credentials, authorization keys, namespace/task queue names, and readiness. Arbitrary environment names such as `staging` are not accepted for `NODE_ENV`; a staging deployment uses production mode with staging-specific services and secrets.

## Testing and verification

Use separate layers while developing, then run the complete CI gates for a release candidate. `check` alone does not run database, browser, Temporal, object-storage, performance, or release-evidence verification.

### Test environment versus application mode

Unit and browser runners manage their own test execution. You do not need to change the root `.env` to `NODE_ENV=test` to run them. Database and storage integration commands use the explicitly isolated targets described below; setting `NODE_ENV=test` by itself does **not** redirect any database connection.

For manual API integration against an independently configured test application database, build the API and inject that environment's restricted `DATABASE_URL` and other required settings before running:

```bash
corepack pnpm --filter @economyos/api build
NODE_ENV=test HOST=127.0.0.1 PORT=4001 corepack pnpm --filter @economyos/api start
```

Shared packages must already be built. If you do not override `DATABASE_URL`, the root `.env` still points at your local application database. This manual test server is separate from `db:verify` and from Playwright's built web server on port `4401`. Do not globally export `NODE_ENV=test` into the web build/start environment; the browser suites intentionally exercise a production web build.

### Lint, types, unit tests, and coverage

After dependency installation:

```bash
corepack pnpm check
corepack pnpm test:coverage
```

`check` runs lint, type checking, and Vitest in order. Type checking first builds shared packages. On a fresh checkout, build shared packages before invoking `test` directly. To focus on a domain while iterating:

```bash
corepack pnpm test packages/behavioral-economics/src
corepack pnpm test packages/allocation-planning/src
```

Root Vitest discovers tests in packages, applications, and services. V8 coverage gates apply to `packages/*/src/**/*.ts`, with minimums of 85% statements, 80% branches, 85% functions, and 85% lines. Reports include terminal output and `coverage/coverage-summary.json`. Those thresholds do not describe whole-application browser coverage.

### Database integration and performance

Database verification uses the pinned Compose PostgreSQL service and a newly created disposable database. It does not use the application `DATABASE_URL` as its test target, and `db:setup:local` is not required for this isolated test sequence.

```bash
docker compose up --detach --wait postgres s3mock

export ECONOMYOS_VERIFY_RUN_ID="readme-$(date -u +%Y%m%d%H%M%S)-$$"
export ECONOMYOS_VERIFY_DATABASE="economyos_verify_$(date -u +%Y%m%d%H%M%S)_$$"
export ECONOMYOS_BENCHMARK_DATABASE="$ECONOMYOS_VERIFY_DATABASE"

corepack pnpm db:prepare
corepack pnpm db:verify
corepack pnpm benchmark:db
```

The two database variables must match, and the database must not already exist. `db:prepare` records ownership using the run ID. `db:verify` applies all 40 current migrations and runs SQL checks for tenant isolation, RLS, temporal selection, immutability, admission, governance, and domain persistence. Run the benchmark after verification establishes the schema.

After reviewing the results, clean up in the **same shell with the same exported values**, including after a test failure:

```bash
corepack pnpm db:drop
```

Cleanup refuses an ownership mismatch. Keep cleanup unconditional in automated jobs, as CI does. Do not use these fixture/benchmark routines against application or production databases. If setup refuses an existing name, choose a fresh name rather than removing the ownership safeguards.

### Storage and durable workflows

With S3Mock running and shared packages built:

```bash
corepack pnpm object-storage:verify
corepack pnpm ingestion:temporal:verify
```

The storage gate checks readiness, exact bytes, checksums, conditional creation, and replay behavior against S3Mock. It supplies local test credentials when AWS credentials are absent; run it without production AWS credentials in the environment.

The Temporal gate downloads/caches and starts a pinned temporary local server, executes workflow tests, and tears the server down. It does not require your separately running development Temporal service, and it uses mocked activities rather than fetching live economic data. It is separate from the default root unit-test command.

### Browser, accessibility, and localization tests

Install Chromium once, then build before running the browser suites:

```bash
corepack pnpm exec playwright install chromium
corepack pnpm build
corepack pnpm test:a11y
corepack pnpm test:intelligence
corepack pnpm test:research
```

On Linux CI, use `corepack pnpm exec playwright install --with-deps chromium` to install required browser system libraries as well.

Playwright starts the built Next.js app on `127.0.0.1:4401`. It runs desktop Chromium and a mobile Chromium profile with zero retries and retains traces on failure under `test-results/`. Outside CI it may reuse an existing server on that port; stop stale servers before testing a new build. Set `CI=true` when you want the configured CI behavior instead of reuse.

The suites cover all 12 locales, RTL, keyboard and layout behavior, accessibility checks, intelligence views, and research interactions. Product tests use explicitly synthetic routed responses for governed data. Passing them does not prove a live browser-to-OIDC-to-API-to-database session.

### Repository and release checks

```bash
corepack pnpm repository:verify
corepack pnpm policy:self-test
corepack pnpm licenses:verify
corepack pnpm release:automation:verify
corepack pnpm audit --prod
corepack pnpm benchmark:pit
corepack pnpm benchmark:research
```

Build shared packages before the in-memory benchmarks. Run performance gates sequentially on an otherwise idle runner; unrelated concurrent builds can distort latency. Benchmarks use synthetic research fixtures and measure local capacity, not economic validity.

The exact CI order and unconditional cleanup are in [`.github/workflows/ci.yml`](.github/workflows/ci.yml). The workflow also generates and verifies the candidate evidence bundle described below. It does not deploy the application.

### Recorded verification baseline

The 2026-09-05 audit recorded three consecutive full local runs, each with **1,168 unit/contract tests, 106 browser tests, 2 Temporal tests, and all 40 migrations plus SQL verifiers passing**. Package statement coverage was **91.58%**. These are dated measurements of that audit snapshot, not a promise about an untested future change or an external deployment.

See the [verification report and limitations](docs/audit-remediation-report.md#final-measured-verification-results), [machine-readable command results](docs/audit-verification-results.json), and [testing strategy](docs/17-testing-strategy.md).

## Production builds and deployment

### Build the application artifacts

Use a clean checkout and the pinned toolchain in the build environment. Install build dependencies as well as runtime dependencies; TypeScript, Nest, and other build tools are development dependencies.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm check
corepack pnpm test:coverage
corepack pnpm build
```

The root build runs workspace builds in dependency order. Shared packages, the API, and worker produce `dist/`; the web application produces `apps/web/.next/`. Next.js uses the committed `next build --webpack` script. Keep workspace package outputs and the runtime dependency graph available to the application; copying only the API's `dist/` is not a complete deployment.

For a local smoke check of the compiled API, after completing local setup, use `NODE_ENV=development corepack pnpm --filter @economyos/api start`. This runs the built artifact with local configuration; it is not a production-mode deployment.

### Provision the deployment environment

The repository does not ship production Dockerfiles, Kubernetes manifests, a production Compose stack, or an automated deployment command. [Deployment architecture](docs/18-deployment-architecture.md) describes the intended topology; your deployment system must provide the actual infrastructure and process supervision.

Before starting production-mode processes, supply:

1. PostgreSQL with the required TimescaleDB extension, backups, and independently provisioned application and ingestion logins inheriting the appropriate restricted roles. Runtime identities must not own the database or assume privileged roles.
2. Separate migration credentials and a confirmed migration target. Remote migration and runtime database connections require `sslmode=verify-full` with valid certificate trust.
3. Real HTTPS OIDC issuer/JWKS endpoints, correct audience and claim mappings, and database-backed subjects, organizations, memberships, grants, and entitlements.
4. Approved S3-compatible storage and credentials, bucket configuration, encryption, and lifecycle policies. Custom production storage endpoints must use HTTPS; S3Mock and its local credentials are test fixtures.
5. TLS-enabled Temporal. The worker requires either an API key or both mTLS client certificate/key paths. Remove the insecure-local opt-in and supply production ingestion authorization keys through your secret manager.
6. A same-origin authenticated gateway, HTTPS ingress, process supervision, logs, and monitoring. If API trace export is configured, its production OTLP endpoint must use HTTPS.

Inject environment-specific secrets through the deployment system. Do not ship the development `.env`. The API's production validator requires `TEMPORAL_TLS=true` even when the API itself does not run a Temporal worker.

### Apply schema migrations

Use the apply-only migration command in a dedicated deployment job, before starting application versions that need the new schema. The migration job must already have `MIGRATION_DATABASE_URL` and the matching `ECONOMYOS_MIGRATION_CONFIRM_DATABASE` injected. For a remote production target:

```bash
: "${MIGRATION_DATABASE_URL:?Inject the migration URL}"
: "${ECONOMYOS_MIGRATION_CONFIRM_DATABASE:?Confirm the exact database name}"
NODE_ENV=production ECONOMYOS_MIGRATION_ALLOW_REMOTE=true corepack pnpm db:migrate
```

The runner checks the connection identity and target, takes an advisory lock, and applies pending migrations in individual transactions. Already applied files must retain their recorded checksums. It does not drop the database or execute verification fixtures, and it refuses `economyos_verify_*` targets.

There is no automatic down-migration command. Use reviewed forward recovery and the approved application rollback/restore procedure. Do not edit an applied migration or run `db:setup:local` in production. Provision production login roles through deployment administration; `db:migrate` does not perform the local-login bootstrap.

### Start production-mode processes

With the built workspace and production configuration present, these are the process entry points. Run each under its own service/process supervisor rather than sequentially in one foreground shell:

```bash
# Product API
NODE_ENV=production HOST=0.0.0.0 PORT=4000 corepack pnpm --filter @economyos/api start

# Next.js application
NODE_ENV=production corepack pnpm --filter @economyos/web start --hostname 0.0.0.0 --port 3000

# Ingestion worker
NODE_ENV=production corepack pnpm --filter @economyos/ingestion-worker start
```

The API start script executes `node dist/main.js`; the worker does the same within its workspace; the web uses `next start`. Binding to `0.0.0.0` is appropriate behind the deployment's network and ingress controls. Keep database and worker credentials scoped to their own processes, and keep migration credentials out of runtime services.

Use `/api/v1/health/live` and `/api/v1/health/ready` as distinct API probes. Production mode disables Swagger UI. Validate authenticated reads, denied access, gateway routing, worker polling, and storage/Temporal connectivity against the actual deployment. A successful process start is only one part of that validation.

### Release evidence and promotion

After all gates and build outputs are final, generate the local candidate bundle from a clean Git tree:

```bash
corepack pnpm release:evidence:generate
corepack pnpm release:evidence:verify
```

The ignored `artifacts/release-evidence/` directory contains `release-manifest.json`, a CycloneDX `sbom.cdx.json`, and `provenance-unsigned.intoto.json`. They bind source revision, lockfile, toolchain, production dependency identities, and build-output hashes. Changes to those inputs require fresh evidence.

This bundle is explicitly **unsigned**. `ECONOMYOS_ALLOW_DIRTY_RELEASE_EVIDENCE=true` is only for local script testing and records incomplete repository evidence. Neither a clean bundle nor green CI authorizes production release.

Production promotion requires the same immutable artifacts, trusted signing and retention, production-shaped staging and recovery exercises, and independent Phase 15 evidence and approval. Outstanding evidence includes identity, residency, restore/recovery, capacity, penetration testing, privacy, localization, commercial operations, SLOs, and operational readiness. Follow the [product release gate](docs/49-product-release-gate-runbook.md) and [release automation runbook](docs/50-release-automation-runbook.md).

## Command reference

Run root scripts with `corepack pnpm <command>`. This table includes prerequisites that are easy to miss when running a command in isolation.

| Command | Purpose / prerequisite |
| --- | --- |
| `install --frozen-lockfile` | Install the committed dependency graph |
| `build` | Build all workspaces with build scripts, in dependency order |
| `lint` | Check formatting and lint rules without rewriting files |
| `format` | Apply Biome's formatting and supported fixes; review the resulting diff |
| `typecheck` | Build shared packages, then type-check workspaces |
| `test` | Run root Vitest unit/contract tests; build shared dependencies first |
| `check` | Run `lint`, `typecheck`, and `test` sequentially |
| `test:coverage` | Run Vitest with package coverage reports and thresholds |
| `test:a11y` | Accessibility/localization browser suite; requires web build and Chromium |
| `test:intelligence` | Intelligence browser suite; requires web build and Chromium |
| `test:research` | Research browser suite; requires web build and Chromium |
| `db:setup:local` | Apply migrations and create restricted local runtime logins; requires local `.env` and PostgreSQL |
| `db:migrate` | Apply-only checksum-verified migrations to an explicitly confirmed target |
| `db:prepare` | Create a new owned disposable verification database |
| `db:verify` | Apply migrations and SQL integration assertions to the prepared disposable database |
| `db:drop` | Drop only the disposable database matching the exported ownership contract |
| `object-storage:verify` | Build the adapter and check the local S3Mock integration |
| `ingestion:temporal:verify` | Run dedicated workflow integration tests against a temporary pinned Temporal server |
| `benchmark:pit` | In-memory PIT latency gate; requires built shared packages |
| `benchmark:research` | Material-balance and prospect-theory capacity gates; requires built shared packages |
| `benchmark:db` | Governed PIT database latency gate; requires verified disposable database |
| `repository:verify` | Scan repository text for known secret patterns and broken relative Markdown targets |
| `policy:self-test` | Exercise repository and license-policy checks against adversarial fixtures |
| `licenses:verify` | Inspect installed production dependency license metadata and policy |
| `release:automation:verify` | Validate pinned tooling, Compose, CI, cleanup, and evidence-generation contracts |
| `audit --prod` | Query the package advisory service for the production dependency graph |
| `release:evidence:generate` | Generate unsigned candidate manifests/SBOM after builds; clean tree required by default |
| `release:evidence:verify` | Check candidate bundle consistency against source, lockfile, and artifacts |

Application commands use workspace filters: `--filter @economyos/api dev` or `start`, `--filter @economyos/web dev` or `start`, and `--filter @economyos/ingestion-worker start`. There is no root `start` script, and the worker has no `dev` watcher script.

## Troubleshooting

| Symptom | Check and resolution |
| --- | --- |
| Toolchain or frozen-install gate fails | Compare Node/Corepack/pnpm with pinned versions. Use Corepack and the committed lockfile; do not regenerate dependencies merely to bypass a mismatch |
| Missing `@economyos/*` exports or `dist` modules | Run `corepack pnpm --filter './packages/**' build`; then rebuild/restart the consuming application |
| API reports missing configuration | Confirm root `.env` exists or inject required variables. API OIDC, database, storage region, and bucket settings are required even for a local start |
| API rejects its database identity | Use the application login from `.env.example` after `db:setup:local`. Owner, privileged, and RLS-bypass logins are deliberately rejected |
| PostgreSQL connection refused | Check Docker is running, `docker compose ps` shows PostgreSQL healthy, and the host URL uses port `55432` |
| Local bootstrap is refused | Check `NODE_ENV`, the `local-only` confirmation, exact database-name confirmation, fixed local role names, and matching loopback URLs |
| Applied migration checksum differs | Restore the original applied migration and add a new migration for the change; do not edit migration history to suppress the failure |
| Web renders, but `/api/v1/*` returns 404 | Standalone Next.js has no API proxy. Configure the documented same-origin gateway or exercise the API directly |
| Protected API returns 401 | Supply a valid bearer token from the configured provider; check issuer, audience, claim mappings, expiry, and signature. Example OIDC addresses cannot authenticate |
| Authenticated API returns 403 or hides a record | Check active membership, role grants, entitlements, source permissions, and requested tenant/workspace/PIT scope; token claims do not create database access |
| UI is empty or says data is unavailable | Bootstrap does not seed live observations or research history. Missing data and denied access must not be replaced with demo results |
| Identity-provider-unavailable response | Check JWKS reachability, provider configuration, and valid key responses; malformed or unavailable JWKS can produce 503 |
| Worker cannot connect to Temporal | Start/configure a separate Temporal service; verify address, namespace, TLS/identity, and explicit loopback opt-in in development |
| Object-storage check fails | Confirm S3Mock health and the `economyos-local` bucket; verification uses `S3_VERIFY_*` overrides, not the runtime `S3_ENDPOINT` variable |
| Trace exporter cannot reach port 4318 | Start your collector or remove/empty `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`; Compose does not include a collector |
| Browser executable or production build missing | Install Chromium, then run `corepack pnpm build` before Playwright |
| Browser tests use stale content or port 4401 is busy | Stop the existing listener; Playwright may reuse it outside CI. Rebuild after UI changes |
| Verification database already exists or cleanup refuses | Keep the original run ID for its owned database, or create a fresh uniquely named database for a new run; never bypass ownership checks |
| Benchmark latency fails while builds are running | Rerun on an idle runner and record the environment; preserve the declared budget and investigate repeatable failures |
| Release evidence rejects a dirty tree or changed artifact | Commit intended source changes and regenerate after the final build; the dirty-tree escape hatch is not production evidence |
| Production start rejects the development example | Supply real HTTPS identity/storage settings, verified database TLS and restricted credentials, plus TLS-enabled Temporal configuration |

Useful local diagnostics:

```bash
docker compose ps
docker compose logs --tail=100 postgres s3mock
corepack pnpm release:automation:verify
```

Application logs appear in the terminal or supervisor running each process. Inspect logs locally and remove credentials, tokens, personal data, and restricted payloads before sharing diagnostics.

## Contributing

Start with the [requirements](docs/01-product-requirements.md), [domain model](docs/03-domain-model.md), and the methodology/runbook for the area you are changing. Keep numerical and policy logic in domain packages, transport and authorization in the API boundary, and presentation in the web application.

- Preserve exact decimals, explicit missingness, tenant isolation, immutable provenance, and point-in-time constraints. Do not use synthetic fixtures as observed production evidence.
- Add a new migration for schema changes; existing applied migrations are checksum-locked.
- Add regression coverage for changed calculations, admission, authorization, temporal behavior, and meaningful failure modes. Use disposable databases for SQL fixtures.
- Keep locale catalogs, RTL behavior, keyboard access, and error/loading/empty states consistent when changing UI. Follow the web-specific [agent instructions](apps/web/AGENTS.md) when working there.
- Run the relevant local tests, `check`, and repository verification before submitting a change. Run broader integration/browser/release gates when the change affects those boundaries.
- Update methodology, implementation status, and traceability when capabilities or acceptance evidence change. State incomplete work and empirical limits explicitly.
- Commit source and lockfile changes intentionally. Generated `dist`, `.next`, coverage, browser results, and release-evidence artifacts are ignored; secrets must remain untracked.

For a bug report, include the source revision, toolchain, command, expected and actual behavior, reproducible inputs with appropriate synthetic labeling, and redacted logs. The repository does not include a dedicated private security-reporting policy; do not place secrets or sensitive exploitation details in a public issue.

## Documentation map

| Topic | Documents |
| --- | --- |
| Product and delivery | [Requirements](docs/01-product-requirements.md), [roadmap](docs/16-roadmap.md), [status and acceptance](docs/21-implementation-status.md), [traceability](docs/TRACEABILITY.md) |
| Architecture and domain | [System architecture](docs/02-system-architecture.md), [domain model](docs/03-domain-model.md), [economic ontology](docs/04-economic-ontology.md), [canonical data](docs/05-canonical-data-model.md) |
| Temporal and security boundaries | [PIT architecture](docs/06-point-in-time-data-architecture.md), [security](docs/07-security-architecture.md), [multi-tenancy](docs/08-multi-tenant-architecture.md), [API architecture](docs/13-api-architecture.md) |
| Product experience | [UX specification](docs/10-ux-specification.md), [design system](docs/11-design-system.md), [internationalization](docs/12-internationalization.md) |
| Data and models | [Model governance](docs/09-model-governance.md), [sources](docs/14-data-source-strategy.md), [economic-state baselines](docs/22-economic-state-baselines.md), [contradiction resolution](docs/20-contradiction-resolution.md) |
| Behavioral and allocation research | [Behavioral methodology](docs/behavioral-economics-methodology.md), [allocation/planning methodology](docs/allocation-planning-methodology.md) |
| Other analytical domains | [Crisis](docs/25-phase4-crisis-methodology.md), [causal graph](docs/27-phase5-causal-graph-methodology.md), [investment](docs/29-phase6-investment-intelligence-methodology.md), [narratives](docs/31-phase7-narrative-intelligence-methodology.md), [forecasting](docs/33-phase8-forecasting-methodology.md), [causal inference](docs/35-phase9-causal-inference-methodology.md) |
| Simulation and governance | [Simulation](docs/37-phase10-simulation-methodology.md), [scenario lab](docs/39-phase11-scenario-lab-methodology.md), [systemic risk](docs/41-phase12-systemic-risk-methodology.md), [model lifecycle](docs/43-phase13-model-governance-methodology.md), [collaboration](docs/45-phase14-collaboration-ecosystem-methodology.md) |
| Operations and release | [Testing](docs/17-testing-strategy.md), [deployment](docs/18-deployment-architecture.md), [enterprise operations](docs/48-phase15-enterprise-hardening-operations-runbook.md), [product release gate](docs/49-product-release-gate-runbook.md), [release automation](docs/50-release-automation-runbook.md) |
| Commercial and risk | [Entitlements](docs/15-commercial-entitlements.md), [risk register](docs/19-risk-register.md) |
| Audit evidence and limits | [Audit report](docs/audit-remediation-report.md), [security findings](docs/audit-security-findings.md), [coverage gaps](docs/audit-product-coverage.md), [verification results](docs/audit-verification-results.json), [audit inventory](docs/51-repository-audit-inventory.md) |

Specifications describe intended architecture and acceptance requirements; dated status and audit documents identify what has actually been implemented and verified. When they differ in scope, do not infer a delivered service from a design document alone.

## License

EconomyOS source code is licensed under the [MIT License](LICENSE), copyright 2026 Shahin ILDEREMI. Third-party dependencies and economic data sources retain their own licenses, attribution requirements, and permitted-use restrictions. The code license does not grant access to restricted datasets or permission to redistribute source data.
