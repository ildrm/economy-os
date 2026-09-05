# Security and data-integrity review

Review date: 2026-09-05. This is a bounded source and regression review, not an exhaustive penetration test or a production-security certification.

## Findings and remediation

| ID | Severity | Location and root cause | Change | Verification |
| --- | --- | --- | --- | --- |
| SEC-01 | Medium, availability | `packages/security/src/oidc.ts`: the 1 MiB JWKS bound was checked after `Response.text()` buffered the entire remote document. Missing or false Content-Length allowed unbounded buffering before rejection. | Stream the body, count bytes before retaining chunks, cancel on limit/error, reject invalid declared lengths. | Missing and understated Content-Length stream regressions require cancellation after the fifth 256 KiB chunk. |
| SEC-02 | Medium, protocol integrity | `packages/security/src/oidc.ts`: signed JWT headers with critical extensions were accepted while the extension semantics were ignored. A signature does not authorize ignoring mandatory processing requirements. | Reject all critical extensions because none are implemented; reject alternate unsupported payload encodings before JWKS/network work. | Five header cases, including unknown critical extension, malformed/empty critical lists, and `b64:false`; zero fetches required. |
| SEC-03 | Low, latent redirect utility | `packages/security/src/redaction.ts`: slash/control-character/slash inputs passed the local redirect check; browser URL parsing removes raw tabs/newlines and can create a network-path URL. No production caller was found in this review. | Reject raw or percent-decoded C0/DEL characters alongside existing slash/backslash checks. | Five regressions failed before the patch and pass after it. |
| SEC-04 | Low, policy input integrity | `packages/security/src/policy.ts`: inherited object properties such as `toString` passed the classification-rank existence check; with an unrestricted grant, an invalid classification was allowed. The reviewed API classification parser already rejects these values. | Validate classifications using own-property membership. | Three adversarial classification cases failed before the patch and pass after it. |
| SEC-05 | Low, temporal precision | `packages/security/src/policy.ts`: accepted fractional instants were truncated to milliseconds, permitting an entitlement up to one millisecond early and denying grants slightly early. Database authorization timestamps have microseconds. | Compare parsed instants as integer nanoseconds; retain existing strict calendar/UTC validation. | Submillisecond activation, pre-expiry allow, and exclusive expiry regressions; early entitlement case failed before patch. |

SEC-02 follows the critical-header processing requirement in [RFC 7515, section 4.1.11](https://www.rfc-editor.org/rfc/rfc7515#section-4.1.11). This is a protocol-conformance correction; the review did not demonstrate arbitrary signature forgery.

## New research persistence boundary

Migration `0039_behavioral_allocation_research.sql` introduces a narrow research ledger, separate from admitted canonical observations. The only permitted top-level data class is `scenario`; the evidence status is always `caller_supplied_unverified`. These labels describe the trust of caller-provided assumptions and citations, even when deterministic computation is performed by the API.

The ledger:

- requires an active subject, organization, organization membership, workspace and workspace membership;
- limits append to analyst/steward/validator/admin workspace roles, with additional action/classification/entitlement checks performed by the API in the same tenant transaction;
- denies app/ingestion base-table privileges and PUBLIC function execution, and forces workspace row security;
- derives organization/actor from transaction context and binds workspace through a composite foreign key;
- seals canonical SHA-256 manifests using a server-generated recording timestamp;
- rejects update/delete and changed same-identity replay, while identical actor/content replay returns the original manifest;
- preserves separate caller-declared knowledge cutoff and server recording time; reads require both cutoffs;
- restricts each input/result object to 256 KiB, 20,000 visited JSON nodes and depth 32 before canonical digest computation;
- rejects future or nonfinite write knowledge cutoffs.

The transaction-scoped application role/context remains a trusted backend boundary. A compromised backend/database credential that can set arbitrary tenant variables is outside the protection offered by user-token checks alone. These functions do not verify literature citations, calibrate scientific models, prove causality, or admit research results as observed evidence.

## Inspected scope

- OIDC verification, key selection/cache, signature/claim checks, authorization policy, security redaction and redirect utility.
- API access-token guard, governed authorization, workspace claim/database reconciliation, tenant transaction setup/cleanup, runtime database-role validation.
- New research adapter/controller and governed authorization addition for classification, tenant membership, malformed requests, replay and PIT boundaries. Cross-layer error-code mapping and microsecond read-cutoff issues were sent to the API owner for correction.
- S3 key identity validation, immutable write precondition, checksums, URI/bucket matching and bounded reads.
- Ingestion activity authorization, Temporal execution binding, signed input checks, immutable payload replay, failure classification and worker transport configuration.
- Selected SQL governance/resolver patterns and migration 0039: forced RLS, private helpers, fixed search paths, tenant/workspace foreign keys, server time and mutation triggers. Existing migrations 0001–0038 were not exhaustively reviewed statement by statement.
- Existing package boundaries: scientific computation stays in domain packages, the API orchestrates authorization and transport, and the SQL ledger persists explicitly hypothetical research. Package existence is not evidence of end-to-end phase acceptance.

## Executed verification

`node node_modules/vitest/vitest.mjs run packages/security/src apps/api/src/database.test.ts apps/api/src/workspaces.test.ts apps/api/src/governed-authorization.test.ts packages/object-storage/src/index.test.ts services/ingestion-worker/src/activities.test.ts services/ingestion-worker/src/repository.test.ts` passed: **9 files, 76 tests, zero failures**.

`node node_modules/typescript/bin/tsc -p packages/security/tsconfig.json --noEmit` passed. Biome checked/formatted changed security sources and tests.

The initial OIDC regression command could not load the then-unbuilt contracts package; it is not reported as an observed pre-fix regression failure. Redirect and policy regression failures were observed before their corresponding fixes. Direct local Vitest invocation was used while concurrent workspace additions temporarily caused pnpm's workspace-install consistency check to reject execution.

SQL verification is integrated into `database/verify.ts`. The dedicated SQL suite covers app/ingestion/PUBLIC privileges, tenant and sibling-workspace denial, viewer write denial, actor attribution, exact replay, changed replay, canonical digest, inclusive knowledge/system cutoffs, microsecond exclusion, malformed/oversized/future inputs, direct-read denial, mutation and deletion. At this report's initial writing, Docker access from the review agent was blocked by socket permissions; SQL execution results must be taken from the root task's verification log, not inferred from the presence of test code.

## Remaining limits

No live identity provider, hostile-network load test, multi-process JWKS outage test, S3 integration environment, production role inventory, distributed ingestion replay attack or production database deployment was exercised by this review agent. In-process ingestion replay tracking was inspected; its process scope is not claimed as a globally durable replay registry. Existing database admission/idempotency guards need deployment-level verification alongside worker authorization. No critical/high exploitable finding was established within this inspected scope; that statement is not evidence that uninspected surfaces are free of such defects.

## Research interface implementation and browser review

Implemented `/[locale]/intelligence/research` with intertemporal-choice and material-balance forms, a searchable server-provided theory catalogue, parsed result displays and full research manifests. All numeric values start blank; material quantities remain null unless explicitly entered. There are no client-side economic calculations or seeded production examples. Requests use the authenticated same-origin API, no-store caching, per-command retry identities and abort/revision checks to prevent stale context from displaying a late response. Response workspace, run identity, kind, input, knowledge cutoff and research classification are checked before rendering.

The interface uses the existing twelve locales: en, fa, de, fr, zh-Hans, ru, es, pt, hi, ar, hy and tr. Scientific catalogue entries and raw manifests retain explicit English language metadata; UI labels and states are localized. Desktop/mobile screenshots were inspected. A real accessibility defect found during testing—keyboard-inaccessible scrolling in the manifest viewer—was corrected with a named, focusable scroll region. Existing navigation tests were updated to assert the new third active module link and its localized research href.

A later independent review caught millisecond truncation in frontend response-context checks. The client now compares normalized UTC fractions exactly to nine digits: PostgreSQL's zero-padded microsecond representation is accepted, but a response one microsecond beyond the requested cutoff is rejected. The browser suite includes both cases.

Production web build and web TypeScript checks passed. Final combined browser command:

```sh
rtk proxy corepack pnpm exec playwright test tests/research.spec.ts tests/accessibility.spec.ts tests/intelligence.spec.ts
```

Result: **106 passed, zero failed, zero skipped**, covering 36 research tests, 32 existing accessibility tests and 38 existing intelligence tests across desktop/mobile Chromium (47.2 seconds for the final observed clean run). The research browser suite uses clearly marked synthetic mocked API responses, so it establishes UI, locale, accessibility, retry and context-isolation behavior; it does not establish a deployed browser-to-identity-provider-to-database authentication flow. Other browsers and independent external design evaluation were not exercised.

## In-memory PIT performance diagnosis

The original concurrent verification run selected 10,000 periods from 50,000 synthetic observation versions with reported median 204.91 ms and p95 658.57 ms, failing the unchanged 500 ms p95 gate. A single planned isolated diagnostic run, after coordinating a pause in other heavy workloads, measured median 182.78 ms and p95 198.95 ms; the gate passed. The observed JSON is retained at `/tmp/economyos-audit/benchmark-pit-isolated.json`. No budget, selector, or benchmark timing code was changed, and no retry-until-pass loop was used.

Source inspection confirms fixture construction is outside the measured region; three warmup calls precede twenty measured selector calls; `performance.now()` measures elapsed selector execution; nearest-rank p95 uses the nineteenth sorted sample correctly. The algorithm validates every input and selects in O(n + k log k), with repeated timestamp parsing a visible cost but no newly introduced algorithmic degradation. The reported median is the upper middle sample for the even sample size, rather than the arithmetic midpoint; that reporting convention does not affect the p95 gate. The tail inflation with relatively similar medians is consistent with scheduling/GC contention during simultaneous builds, browsers and database work, but elapsed timings alone do not establish which mechanism caused the original spike. This isolated result is a local performance observation, not a production capacity guarantee.
