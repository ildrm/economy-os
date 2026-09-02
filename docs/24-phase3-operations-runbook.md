# Phase 3 Economic-State Operations Runbook

## Scope

This runbook operates the transparent research-baseline state engine, vector discovery/comparison, global/country workbench, effective model lifecycle, release monitoring, and in-app release-notification workflow. It does not authorize production decision use or later-phase forecasts, hazards, causal claims, scenarios, or advice.

## Preconditions

- Apply every checksum-locked migration in numeric order and run `corepack pnpm db:verify` against the intended database.
- Use the restricted `economyos_app` identity for the API and `economyos_ingest` identity for ingestion/notification activities. Neither identity may own the database, bypass RLS, create roles/databases, replicate, or assume a privileged role.
- Configure OIDC/JWKS, Temporal, object storage, database TLS, and workflow authorization exactly as described by `.env.example`; production credentials must come from the deployment secret manager.
- Admit World Development Indicators source `2` with current license review and source decision evidence before binding a research definition.
- Keep the registry digest from `23-phase3-methodology-review.md` and each bound artifact/feature-contract digest in the release evidence.

## Admit and bind a baseline

1. Select one of the five definitions in `PHASE3_RESEARCH_BASELINES`.
2. Resolve every external indicator code to an exact canonical concept and active series whose source/dataset, parser, unit, frequency, seasonal-adjustment class, license, and quality contract match the definition.
3. Call `bindResearchBaselineModel`; reject any indicator mismatch or artifact whose configuration digest does not equal the definition digest.
4. Persist the immutable artifact, model, component definitions, PIT-bound run, component evidence, and exactly five vector slots.
5. Run `analyzeCompositeSensitivity` using the exact governed inputs. Retain its manifest beside the model review. A threshold crossing, wide range, sparse component, or bound failure is review evidence, never something to suppress.
6. Leave the effective lifecycle at `research` until a permitted transition has its required review evidence. A frozen manifest status is not the current serving decision.

## Serve and investigate

1. Require the organization/workspace, dataset snapshot, knowledge cutoff, PIT policy, and system cutoff where applicable.
2. Discover vectors using the bounded keyset route, or request one opaque vector ID directly.
3. Compare only 2–10 explicitly requested vector IDs. If snapshot, PIT context, model definition, artifact, or coverage differs, display the incompatibility rather than ranking or normalizing it.
4. From each dimension, open its component evidence and then observation provenance. A displayed metric must reach source/release evidence within three interactions.
5. Treat generic `404` as non-enumerating missing-or-inaccessible. Do not distinguish foreign, restricted, legally withdrawn, or absent resources.
6. Treat `partial` and `insufficient_data` as valid analytical outcomes. Never fill an absent component/dimension with zero, a historical mean, or a neutral score.

## Release monitoring and notifications

1. Monitor only an exact admitted series. Persisted provider schedule metadata may report an upcoming release; no workflow may invent a provider timestamp.
2. Create or reactivate an in-app subscription only after subject-aware workspace, role, classification, and entitlement authorization.
3. Start `deliverReleaseNotifications` with the exact organization/workspace/series/release identity, monitoring time, and release-manifest digest. The deterministic workflow ID makes replay idempotent.
4. Preparation resolves a bounded set of currently active subscriptions. Delivery rechecks current release servability; withdrawn evidence is suppressed rather than delivered.
5. A terminal run stores one canonical output manifest containing delivered and suppressed records. Replaying the same input returns that manifest; changed input under the same identity is a conflict.
6. In-app notification content is only a pointer. Reading the target must repeat normal governed authorization and legal checks.

## Failure handling

| Symptom | Immediate action | Recovery |
|---|---|---|
| Artifact becomes restricted/retired | stop serving affected runs and vectors through the effective lifecycle gate | create a reviewed forward lifecycle event; never rewrite history |
| Source/license withdrawal | suspend the source/series and allow governed serving to fail closed | admit a new decision/evidence set before reactivation |
| PIT or manifest mismatch | quarantine the run/vector and capture its immutable IDs | correct code/configuration in a new artifact/version and recompute |
| Coverage below threshold | show `insufficient_data` with missing reasons | ingest admitted evidence or approve a new model definition; do not impute silently |
| Notification activity retrying | inspect Temporal history and the durable run/delivery rows | repair the transient dependency and retry; unique identities prevent duplicates |
| Notification conflict/permanent failure | leave the failed terminal evidence visible | fix the input/schema/model and start a new deterministic identity where semantics changed |
| Cross-tenant or enumeration suspicion | revoke access, preserve trace/audit IDs, and follow the security incident process | restore only after RLS/authorization regression verification passes |

## Forward-only rollback

Scientific records, lifecycle events, runs, vectors, notifications, and audit evidence are not deleted or rewritten. To roll back behavior:

1. restrict the affected artifact or suspend its source/series;
2. disable the application release through deployment controls;
3. deploy a forward migration or new semantic version;
4. replay verification against a clean database;
5. reactivate only with a new review event and retained rollback evidence.

## Release gate

Before declaring the Phase 3 research scope accepted, retain output from:

```text
corepack pnpm check
corepack pnpm test:coverage
corepack pnpm build
corepack pnpm db:verify
corepack pnpm ingestion:temporal:verify
corepack pnpm test:a11y
corepack pnpm test:intelligence
corepack pnpm policy:self-test
corepack pnpm repository:verify
corepack pnpm licenses:verify
```

Also run compiled API smoke tests through the restricted runtime identity, confirm `private, no-store`, and verify vector detail/discovery/comparison plus notification non-enumeration. Record exact test counts, coverage, migrations, benchmark results, known limitations, and temporary-resource cleanup in `21-implementation-status.md`.
