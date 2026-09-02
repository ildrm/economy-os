# Phase 6 Investment-Intelligence Operations Runbook

## Purpose

Use this runbook to construct and challenge Phase 6 research manifests. Never use the current package to execute trades, personalize advice, determine customer suitability, or present model outputs as validated expected returns.

## Prepare an assessment

1. Pin the country, strategy, assessment `asOf`, knowledge cutoff, system cutoff, snapshot, and data vintage.
2. Confirm the snapshot recording and vintage availability precede their respective cutoffs.
3. Pin one candidate model version and artifact digest whose status was effective by the assessment cutoff.
4. Provide all nine decision dimensions and exactly one declared macro weight for each.
5. Bind each input to evidence and counter-evidence. Record an explicit absence reason when either set is empty.
6. Declare uncertainty, assumptions, limitations, and invalidation criteria before calculation.
7. Supply valuation components only where the method and evidence are applicable. Otherwise use an explicit unavailable reason.

Create the immutable output with `createCapitalAllocationManifest`. Preserve the resulting digest with the source snapshot and model artifact. A replay with the same identity must reproduce identical content; changed inputs require a new manifest identity in the future persistence boundary.

## Persist and serve an assessment

1. Call `evidence.prepare_capital_research_assessment` with the exact tenant/workspace, PIT snapshot/vintage/model identities, research-only semantics, and bounded manifest header.
2. Add each evidence/counter-evidence item with `evidence.bind_capital_assessment_evidence`; the database rechecks workspace ownership, availability, vintage, freshness, and role.
3. Append each complete asset manifest with `evidence.append_capital_assessment_asset`; SQL recomputes all contributions and preserves unavailable valuation as `null`.
4. Seal atomically with `evidence.complete_capital_research_assessment`. Sealed inputs and completions are immutable.
5. Serve only through `app.get_capital_research_assessment(workspace, assessment)`, which is non-enumerating for foreign, incomplete, restricted, or otherwise unservable artifacts.
6. Create approved outcome definitions/validation plans through the governed mutation functions. The current schema persists plans and folds, not executed fold observations or scores.
7. Create comparisons through `evidence.create_capital_country_comparison` and read them with `app.get_capital_country_comparison(workspace, comparison)`. Preserve requested order and incomparability; never add ranking.
8. Product clients read completed artifacts through `GET /v1/capital-research/assessments/:assessmentId?workspaceId=...` and `GET /v1/capital-research/comparisons/:comparisonId?workspaceId=...`. Treat a 404 as deliberately non-enumerating; do not add a less-restricted fallback query.

## Review a result

Review macro, valuation, and combined suitability separately. Inspect every contribution and evidence freshness status. A combined value is usable for research comparison only when its status is `available`. Do not infer a combined score from macro suitability when valuation is missing.

Treat display-only confidence shrinkage as presentation metadata. It is not an alternative model result. Escalate any stale evidence, invalidation criterion, out-of-scope country/strategy, or unsupported asset to model review.

## Compare countries

1. Declare two to twelve exact country identities and one reference country.
2. Supply at most one integrity-checked manifest per requested country.
3. Use the exact comparison policy for model identity, point-in-time context, and valuation availability.
4. Call `createCountryComparison` and retain every structured incomparability reason.
5. Display results in requested order. Do not sort by score or add a rank/recommendation downstream.

## Run research validation

1. Approve and content-address the outcome definition before inspecting test outcomes.
2. Define expanding or rolling folds with training, calibration, test, and any embargo interval.
3. Pin all leakage-sentinel cutoffs inside their permitted training or calibration windows.
4. Materialize canonical point-in-time features for each fold; do not reuse a later snapshot.
5. Retain predictions before outcomes become available.
6. Score only after the outcome window and declared availability lag are complete.
7. Report missing/unresolved results under the declared policy, never as zero performance.

## Failure handling

| Symptom | Meaning | Required action |
|---|---|---|
| point-in-time validation fails | a snapshot, vintage, or model state is not knowable at the declared cutoff | correct the upstream binding; do not move the cutoff silently |
| evidence is stale | declared maximum age was exceeded | refresh through a new vintage or mark the assessment limited/unavailable |
| valuation is unavailable | combined comparison is scientifically unsupported | retain `null` and its reason; do not impute neutral valuation |
| country is incomparable | model, point-in-time, strategy, identity, asset, or valuation contract differs | show the structured reason or rebuild genuinely comparable manifests |
| digest integrity fails | stored content changed or was decoded incorrectly | quarantine it and compare against the retained canonical artifact |
| temporal plan rejects a fold | ordering, embargo, or fitting cutoff leaks into evaluation | rebuild the fold before any performance claim |
| output contains advice language | the research-only claim boundary was breached | reject the output and review the calling integration |

## Verification

From the repository root, run:

```text
corepack pnpm --filter @economyos/capital-allocation build
corepack pnpm --filter @economyos/capital-allocation typecheck
vitest run packages/capital-allocation/src
vitest run packages/capital-allocation/src --coverage --coverage.include='packages/capital-allocation/src/**'
biome check packages/capital-allocation
```

The package gate is necessary but not the Phase 6 acceptance gate. Clean-room persistence, tenant/authorization checks, and exact read APIs now pass. Remaining acceptance work is mutation/orchestration APIs, UI access, worker execution and durable workflow around the stored contracts, executed chronological evidence, independent validation, monitoring, and release approval.

## Forward-only recovery

Preserve affected manifests and comparison digests. Restrict or retire the candidate model, issue a new versioned definition or artifact, rebuild point-in-time assessments, rerun chronological validation, and record why the earlier output is no longer eligible. Never rewrite historical research evidence in place.
