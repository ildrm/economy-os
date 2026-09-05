# EconomyOS audit and remediation report — 2026-09-05

## Scope and conclusion

This change implements and exercises a substantial behavioral/allocation research increment and repairs reproduced security, numerical, migration, verification and documentation defects. It does **not** complete the entire comprehensive assignment. In particular, full planning/evidence product workflows, empirical behavioral validation, broad causal estimators, behavioral contagion, planning optimization and production qualification remain outstanding. The [40-criterion coverage ledger](audit-product-coverage.md) distinguishes these gaps from implemented work. No phase acceptance is promoted.

The audit used an isolated archive of the original commit for baseline measurements, rather than attributing concurrently edited files to the baseline. The working checkout initially had no changes. [Execution refinements](50-audit-execution-specification.md) and [workspace/dependency inventory](51-repository-audit-inventory.md) describe the inspected boundaries. Every workspace manifest and public entry inventory was mapped; lexical/import checks and passing tests do not establish an exhaustive semantic/security review of every file.

## Initial problems and remediation

| ID / severity | Location | Root cause / reproduction | Fix | Verification |
|---|---|---|---|---|
| A01 / P2 | `packages/security/src/oidc.ts` | JWKS response limit applied after full buffering; absent/false Content-Length defeats memory bound | Streaming byte limit, cancellation and length validation | Oversized streaming JWKS and header regressions |
| A02 / P2 | OIDC verifier | Unsupported JOSE critical headers ignored | Reject unimplemented critical-header semantics | Signed malformed-header fixtures |
| A03 / P3 | security redirect helper | Slash + control character + slash can normalize to external URL | Reject C0/DEL control characters | Browser-normalization redirect vectors; no production caller was identified |
| A04 / P2 | authorization policy | Prototype membership accepted inherited classification keys | Own-key membership validation | Invalid/inherited classification regressions |
| A05 / P2 | authorization policy | Date.parse truncation admitted sub-millisecond future entitlement activation | Nanosecond-accurate instant comparisons | Exact activation/expiry boundaries |
| A06 / P2 | simulation numerical output | String(Number(toFixed())) emitted exponent notation rejected by its own contract | Preserve fixed decimal text and normalize negative zero | 11 numeric-format special cases plus existing simulation suite |
| A07 / P1 | collaboration migration/write paths | `0038` added required registrar/actor columns that existing functions omitted; real DB rejected quota registration | Forward `0040` defaults derive authenticated caller and server time while preserving guards | Existing ecosystem operations plus new caller-provenance assertions |
| A08 / P2 | collaboration lifecycle SQL verifier | Fixture stopped after constructing payloads, omitted assertions/rollback and was absent from runner | Complete executable lifecycle/tenant/immutability cases and include in runner | Real PostgreSQL full verification |
| A09 / P2 | production lock graph | Nest brought Fastify 5.11.3 despite API directly pinning 5.12.1; advisory service returned two moderate findings | Scope override aligns Nest Fastify with pinned 5.12.1 | Re-audit: no known vulnerabilities; license policy passes |
| A10 / P3 | database/release administration scripts | Existing formatting/import ordering failed baseline lint | Biome formatting/import corrections | Original baseline 3 diagnostics in 2 files; final lint gate |
| A12 / P3 | `biome.json` | A successful release-evidence generation made the next lint run fail on generated SBOM formatting | Exclude only the generated release-evidence directory from source formatting; dedicated artifact verification remains mandatory | Repeated full verification including release generation and checksum/schema verification |
| A11 / P2 | status/traceability documents | 29-migration/204-test snapshot and absent-feature claims contradicted current code | Preserve old measurements as historical; correct phase3 discovery/lifecycle/notification claims and link current evidence | Repository link policy plus product coverage review |

The Fastify advisories are [root primitive coercion](https://github.com/advisories/GHSA-w2qp-rph6-63g4) and [forwarded-header spoofing](https://github.com/advisories/GHSA-3m5p-2c4r-xxw2). They were dependency findings; this audit does not claim a demonstrated exploit of EconomyOS, whose proxy trust is disabled.

## Defects caught while building this increment

Independent scientific review caught loss of small reference-point differences when subtracting large binary floating values, same-definition source disagreement being discarded, future reporting periods admitted as actuals, and graph node/population binding mismatches. These are covered by targeted regression tests. API review caught incorrect SQL-error mappings and a microsecond timestamp round-trip gap. Browser review caught a scrollable manifest without keyboard focus. These findings were corrected rather than waived or represented as initial-repository defects.

## Architecture and operational contract

- `@economyos/behavioral-economics` composes existing canonical, narrative, forecasting and causal-graph protocols. It adds theory/evidence/replication representation, decision kernels, source-span candidates, governed aggregate constructs and research model cards. All empirical conclusions remain context-specific.
- `@economyos/allocation-planning` has no runtime package dependency. Exact rational arithmetic handles nonterminating fulfillment ratios and bottlenecks. Ownership, price formation, allocation mechanisms and decision rights remain independent.
- Scientific equations remain outside controllers and browser code. The API validates bounded envelopes, establishes live workspace membership and model grants/entitlements in the same tenant transaction, then calls domain kernels.
- Migration `0039` stores immutable scenario input/result manifests with server recording time, actor-bound idempotency, forced RLS, narrow definer functions and no app-role base-table access. Its generic JSON integrity checks do not independently validate an economic model or admit observational evidence.
- API reads require `model.read`; execution requires `model.execute`, both with current workspace membership and entitlements. SQL independently requires analyst/steward/validator/admin writes. Allocation API `tenantId` is the authenticated `organizationId/workspaceId` composite; callers cannot select another scope.
- `POST /api/v1/research/runs` supports explicit intertemporal utility assumptions, governed risky-choice simulation, material balances, planner/enterprise simulation and public-document intervention candidates. `GET /api/v1/research/runs/{id}` applies exact knowledge/system cutoffs. The POST returns 200 on identical replay and 409 on changed input under the same ID.
- Detection uses the existing immutable document/snapshot/hash/span and license contracts. The API accepts public-document research only and strips raw source text before persistence/response, retaining source bindings. It does not independently approve source licenses or create canonical production evidence.
- The localized research workspace supports intertemporal and material-balance forms, rational benchmark/sensitivity views, explicit missingness, theory exploration and inspectable manifests. No field silently supplies a behavioral coefficient or a zero quantity.
- Existing HTTP telemetry covers the new routes and safe problem codes. Dedicated behavioral queue/model counters, new ingestion workflows and live feeds are not implemented.

## Scientific coverage and limitations

Behavioral theory coverage and primary references are in [the behavioral methodology](behavioral-economics-methodology.md); allocation formulas, scenario assumptions and scope are in [the allocation methodology](allocation-planning-methodology.md). The executable kernels include cumulative prospect values with Prelec weighting, quasi-hyperbolic utility, inequality aversion, satisficing, logit choice, disposition-effect measurements, material balance, shortage/surplus, Leontief bottlenecks, source-specific plan fulfillment, price premiums and explicit planner/enterprise hypotheses.

A registry entry is not an executable model. An executable equation is not calibrated empirical science. Explicit assumed parameters, study provenance, replication disagreement, context and limitations remain visible. The rational investor benchmark is risk-neutral expected value, not all expected-utility models. The planner scenario is one-period/one-enterprise/one-input and is not a market-clearing model. Nonlinear behavioral kernels use controlled numerical approximation; allocation arithmetic is exact. Numerical tolerance is not model uncertainty.

The detector is bounded English lexical extraction with uncalibrated confidence. It neither establishes implemented policy nor causality, effectiveness, deception or manipulation. No candidates does not mean no intervention. Unsupported languages abstain. All 12 UI locales are supported; authored theory names/descriptions and raw manifests are explicitly marked English.

Forecast integration is a governed eligibility/materialization bridge with paired holdout and nonbehavioral-baseline checks. It does not independently reproduce the empirical validation manifest. Graph bridges produce hypotheses; broad causal estimators and empirical intervention identification are not newly implemented here. State construction retains independent dimensions and source disagreement without a universal behavioral score.

## Verification record

Baseline unchanged checkout: 1,033 tests in 86 files passed; coverage 91.34% statements, 84.10% branches, 97.80% functions, 93.17% lines. Baseline typecheck passed; lint failed with 3 diagnostics in 2 files. Historical status-document counts were not reused as current measurements.

The final code passed three consecutive full sequential runs after the generated-artifact formatter fix. The earlier attempt (one clean run followed by the reproduced SBOM lint failure) is retained in `/tmp/economyos-audit/final-attempt-1`; it is not counted toward these three runs. Logs are retained under `/tmp/economyos-audit` for this session; they are not production economic data or deployment approvals.

## Review passes

1. Architecture: manifest cycles, import direction, new adapter ownership and existing scientific formatting reviewed by the allocation reviewer and parent. No manifest cycle or direct SQL/HTTP/UI import in scanned scientific packages was found. Transitive/source-level lexical analysis is not a proof of total architecture correctness.
2. Security/data integrity: security reviewer reproduced policy/OIDC/redirect defects, implemented regression tests and reviewed API/ledger scope/error/replay/PIT contracts. Parent runs real SQL. This is not an external penetration test.
3. Economic/scientific: behavioral and allocation implementers cross-reviewed each other; numerical/PIT/disagreement findings were fixed with regressions. Literature validation remains limited to sourced formulas and explicit boundaries, not a systematic review of all named researchers.
4. UX/accessibility/i18n: browser reviewer tested desktop/mobile, all locales, keyboard and axe, then parent visually inspected the mobile artifact. Native-language translation validation is not claimed.
5. Product/failure modes: separate definition-of-done mapping exposes implemented slices and remaining gaps, followed by parent report/status/traceability reconciliation. Full product completion is not claimed.

## Outstanding scope

See [the criterion-level gap record](audit-product-coverage.md). Material remaining work includes admitted live behavioral/plan data; normalized study/plan/control persistence and complete CRUD/explorer workflows; empirical calibration/replication synthesis; full causal evaluation; behavioral crisis/systemic contagion; multi-agent/network simulation; plan graphs and optimization; sensitive-segmentation governance; production authentication deployment, recovery, multi-user load and independent model approval. These are unimplemented or externally unvalidated capabilities, not passing gates hidden behind package names.

## Final measured verification results

Machine-readable command exits/durations are preserved in [audit-verification-results.json](audit-verification-results.json). All **57 gate executions (19 per run × 3 consecutive runs) exited zero**. Full-run durations were 236.54 s, 230.23 s and 237.14 s. No assertions, retries or performance budgets were relaxed. Browser retries remain zero.

| Gate | Exact result per full run |
|---|---|
| Unit/contracts | 1,168 passed in 93 files; 0 failed, 0 skipped |
| Coverage | Statements 91.58%; branches 84.51%; functions 97.79%; lines 93.36% in all three runs |
| Browsers | Accessibility 32 + intelligence 38 + research 36 = 106 passed; 0 failed, 0 skipped |
| Temporal | 2 tests in 2 files passed against pinned local Temporal |
| Database | All 40 checksum-locked migrations and enabled SQL verifiers passed, including tenant/PIT/lifecycle/research-ledger invariants |
| Storage | Adobe S3Mock readiness, checksum, exact replay, conflicting-replay rejection and AES256 default passed |
| Policy | 53 policy self-test assertions; repository links/secrets checks and release-automation contracts passed |
| Licensing | 345 installed external production packages, 13 SPDX expressions; 53 optional target-incompatible packages explicitly skipped |
| Production dependencies | Post-remediation advisory query reported no known vulnerabilities; this is a time-scoped advisory result |
| Build/install | Frozen offline installation, strict typechecks and full production builds passed in each run |
| Release artifacts | Generation + checksum/schema verification passed using explicit dirty-tree **local-testing** mode; artifacts are unsigned and repositoryEvidenceComplete=false |

Each run executed `corepack pnpm` with: `install --frozen-lockfile --offline`, `repository:verify`, `policy:self-test`, `licenses:verify`, `release:automation:verify`, `check`, `test:coverage`, `build`, `db:verify`, `ingestion:temporal:verify`, `object-storage:verify`, `test:a11y`, `test:intelligence`, `test:research`, `benchmark:pit`, `benchmark:research`, `benchmark:db`, `release:evidence:generate`, and `release:evidence:verify`. The successful initial dependency installation also used `install --frozen-lockfile`; offline final runs reused those exact pinned dependencies.

| Synthetic capacity workload | Run 1 p95 | Run 2 p95 | Run 3 p95 | Unchanged budget |
|---|---:|---:|---:|---:|
| In-memory PIT, 50,000 versions / 10,000 periods | 212.83 ms | 254.41 ms | 197.36 ms | 500 ms |
| Governed PostgreSQL PIT, 50,000 rows / 10,000 selections | 243.76 ms | 183.58 ms | 189.36 ms | 1,000 ms |
| 1,000 exact material balances | 5.37 ms | 5.24 ms | 5.33 ms | 1,000 ms |
| 100 cumulative-prospect choices × 100 outcomes | 33.06 ms | 32.46 ms | 33.12 ms | 1,000 ms |

Every benchmark uses 3 warmups and 20 measured samples with nearest-rank p95; the SQL fixture additionally enforces its unchanged 2,000 ms warm-up maximum. Fixture construction/admission is outside query timing. An earlier in-memory run under concurrent workloads recorded p95 658.57 ms; a controlled isolated diagnosis passed at 198.95 ms without a code/budget change, and all three subsequent sequential runs passed. Contention is consistent with the initial tail spike; its exact cause was not proven by wall-clock timing alone. These figures measure local synthetic capacity, not economic accuracy or production multi-user performance.

The final browser product revision was exercised with routed synthetic API fixtures. A deployed authenticated browser-to-API-to-database session was not verified; the UI assumes the existing same-origin authenticated API gateway contract. The API and real SQL boundaries were tested separately. No cloud deployment, external empirical calibration, systematic literature/replication review, independent penetration test or production readiness claim is made.
