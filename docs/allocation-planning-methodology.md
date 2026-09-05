# Economic allocation and planning methodology

Status: implemented and locally verified for the bounded contracts and exact kernels listed below. This does not establish empirical validity, production approval, complete historical coverage, or acceptance of the platform's simulation/scenario phases.

## Prompt refinement and audit findings

| Original requirement | Issue | Refinement and implementation effect |
| --- | --- | --- |
| `EconomicCoordination = Ownership + PriceFormation + AllocationMechanisms + DecisionRights` | Categories with different units cannot be added meaningfully. | Treat this as a decomposition into independent descriptive dimensions. Profiles preserve ownership, price formation, allocation mechanisms, and decision rights separately; there is no score or automatic regime ranking. |
| Leontief-like bottleneck output | Fixed-coefficient physical rationing differs from estimating a national input-output inverse or a causal fiscal multiplier. | Implement the stated physical minimum constraint with supplied coefficients. No national multiplier, equilibrium, or causal interpretation is returned. |
| Planner/enterprise strategic behavior | Universal behavioral coefficients or inferred intent would be unsupported. | Implement an explicit, uncalibrated one-period scenario with user-specified parameters and provenance. Every channel is an assumption, including a zero parameter; none is populated from missing evidence. |
| Exact economic values and simulation tolerance | Division can have a nonterminating decimal expansion. | Use reduced bigint rational output for ratios and all planner outputs. Decimal sums and differences are exact; no numerical tolerance is substituted for model uncertainty. |
| Planner optimization versus simulation | A hidden welfare objective would make the simulator an unreviewable recommender. | The simulator consumes explicit capacity, targets, supply, and behavioral parameters. It contains no optimizer or objective function. An external proposal must enter as an explicitly identified baseline/target and be evaluated by the same simulator. |
| Temporal precision | `Date.parse` loses precision beyond milliseconds. | This package rejects input instants finer than milliseconds and uses calendar roundtrip validation. It never rounds a finer timestamp into the cutoff. Other platform contexts may support nanoseconds; adapters must preserve this package's declared precision restriction. |

Inspection covered the existing canonical contracts, simulation kernels, scenario definitions, and governance contracts before expansion. An existing defect in `packages/simulation-engine/src/internals.ts` converted small fixed decimal outputs back through `Number`, causing values such as `0.000000000001` to become forbidden exponent notation. The fix retains fixed decimal text and normalizes negative zero. Regression cases cover small positive/negative values, zero, the numeric boundary, and invalid nonfinite values.

## Domain contracts and provenance

`packages/allocation-planning` has no HTTP, database, UI, or provider dependencies. Its public exports are in `src/index.ts`. Runtime validation checks exact object keys, bounded lists/text, valid calendar instants, nonnegative quantities, explicit missingness, and source references. Artifacts are cloned, recursively frozen, and hashed over canonical JSON.

`AllocationRegimeProfile` carries independent sector/asset ownership and price formation, actor-specific decision rights, and 27 separately identified measurements. Absent measurements become `status: missing` with a reason. An observed zero is retained as evidence-backed zero. State ownership does not imply administrative allocation. Distinct source-backed measurements of the same dimension coexist without pooling; a dimension cannot simultaneously be missing and measured. Dimension values retain units and an optional uncertainty interval; an interval is not inferred from a confidence label.

`EconomicPlanVersion` carries an authority, objectives, targets, and explicit mandatory/indicative controls. Control kinds cover allocation directives, production/input quotas, administered prices, rationing, procurement, directed credit, and investment. A previous-version digest identifies revision lineage; the package does not itself implement an append-only database or validate that an earlier digest exists in storage.

Every governed record has effective start/end, publication, availability, admission, recording, source references, methodology version, version identity, and an opaque tenant scope. Effective intervals are end-exclusive. `assertAllocationVisible` requires both effective membership and every knowledge/admission/recording instant at or before the requested cutoff. This is a conservative single-cutoff read contract. A caller cannot use a late-admitted backfill in an earlier replay. The API adapter derives the tenant scope as `${organizationId}/${workspaceId}` from the authenticated organization **and workspace**. A self-authored tenant identifier is not authentication.

Source references contain source ID, content SHA-256, source URL, a locator/span, and availability. They do not retrieve the source, establish its license, or prove the assertion. Admission/storage adapters remain responsible for license enforcement, immutable source retrieval, authorization, and verifying that referenced records exist. A SHA-256 is an integrity fingerprint, not a digital signature or evidence of approval.

`createPlanActual` distinguishes officially reported actuals, independent estimates, and reconstructed actuals. `projectPlanFulfillment` requires matching plan-version digest, geography, sector, commodity, unit, and target period. It requires the full reporting period to end at or before publication, preventing a future full-period value from being labelled actual. Partial-period observations would require a separate explicit contract and are not inferred. It retains each actual and its provenance separately. It never selects one source as truth or averages disagreement. No actual produces missing coverage; a zero target produces an explicitly undefined ratio.

## Exact kernels

Decimal inputs are canonical strings, at most 32 characters and 12 fractional places. Nonterminating results are `{ numerator, denominator }` strings in lowest terms. All required unknown quantities use `null`, and missingness propagates explicitly.

| Export | Calculation | Scientific interpretation |
| --- | --- | --- |
| `computeMaterialBalance` | Supply = production + imports + opening inventory. Uses = intermediate + household + government + investment demand + exports + closing inventory. Imbalance = supply − uses. | Accounting comparison for one commodity/unit/period supplied by the caller. Desired closing stock is a use. Supply and demand must be commensurate; no unit conversion is inferred. |
| `computeShortage` | Shortage = max(0, demand − available supply); surplus = max(0, available supply − demand). | Quantity gap conditional on the declared demand/supply concept. No observation does not mean no shortage. |
| `computeLeontiefBottleneck` | Minimum of capacity and every positive-coefficient available-input/coefficient bound, including labor when specified. | Essential inputs are nonsubstitutable. A known zero coefficient consumes no input and creates no bound. Missing a positive-coefficient input makes the result missing. Returns every tied binding constraint. |
| `computeParallelMarketPremium` | (parallel price − official price) / official price. | Requires source references, reports only a price difference, and does not infer illicit activity. A zero official price makes the ratio undefined. Caller must establish matching commodity/quality/currency/time before invoking this kernel. |
| `projectPlanFulfillment` | Each independently sourced actual / the matched plan target. | Descriptive fulfillment, not output quality, welfare, plan optimality, or causal effectiveness. |

BEA's [requirements-table explanation](https://www.bea.gov/help/faq/32) distinguishes direct from total input requirements. Its [input-output methodology](https://www.bea.gov/resources/methodologies/concepts-methods-io-accounts) also distinguishes gross-output requirements from macroeconomic fiscal multipliers. The physical kernel here does not estimate either set of empirical coefficients.

## Planner–enterprise and household scenario

`simulatePlannerEnterprise` is version `1.0.0`, one enterprise, one essential input, one period. It pins a baseline digest, tenant, knowledge cutoff, source references, explicit assumptions, and all parameters. There are no random draws, data-dependent defaults, or mutable baseline writes. Canonically identical input produces identical results and digests.

Let capacity be C, target T, available input X, input coefficient a > 0, household demand D, and parameters c (concealment), o (over-requesting), h (hoarding), b (bargaining), r (reporting distortion), s (stockpiling), e (information error). All parameters except r/e are in [0,1]; r/e are in [−1,1]. These are scenario envelopes rather than empirical parameter estimates.

1. Perceived demand is D in perfect-information mode, explicitly supplied previous demand in delayed mode, or D(1+e) in noisy mode. Delayed mode rejects missing previous demand. An error parameter is permitted only in noisy mode.
2. Reported capacity is C(1−c); bargained target is T(1−b); planned output is min(reported capacity, bargained target, perceived demand).
3. Requested input is planned output × a × (1+o). Allocated input is min(requested input, X).
4. Hoarded input is allocated input × h. Physical output is min(C, planned output, (allocated input − hoarded input)/a).
5. Actual input consumed is physical output × a. All remaining allocated input is retained as unused inventory; it includes hoarded and excess requested input.
6. Reported output is physical output × (1+r), which never changes physical availability. Household demand is D(1+s); delivered output is min(physical output, household demand). Undelivered demand and unsold output are exposed separately.

Returned actual/reporting fulfillment uses the original target T; zero T is explicitly marked by diagnostics and null ratios. Exact input/output conservation diagnostics accompany every result. `plannerEnterpriseSensitivity` executes explicit low/high parameter scenarios and retains the baseline; its output is not a confidence interval or proof of monotonicity.

The [Kornai, Maskin and Roland article, *Understanding the Soft Budget Constraint* (2003)](https://maskin.scholars.harvard.edu/publications/understanding-soft-budget-constraint) motivates treating financing expectations and institutional incentives as distinct research questions. This implementation does **not** estimate bailout expectations or reproduce that paper's strategic models. Its concealment, reporting, hoarding, and stockpiling equations are documented scenario hypotheses, not findings attributed to the paper.

## Model card and limits

| Field | Current state |
| --- | --- |
| Purpose/model family | Exact descriptive accounting and a deterministic structural scenario hypothesis |
| Theory/literature | Fixed-coefficient resource constraints; literature references above establish conceptual context only |
| Parameters/calibration | All parameters supplied explicitly; no training or calibration dataset |
| Population/geography/period | Supplied by governed records; no supported empirical generalization claim |
| Assumptions/boundaries | Single enterprise/input/period; fixed technology; target-capped output; exogenous input allocation limit and household stockpiling |
| Validation | Formula special cases, exact rational arithmetic, bounds, missingness, PIT and tenant sentinels, replay, conservation, source disagreement, endpoint sensitivity |
| Sensitivity | Explicit single-parameter endpoints; no structural ensemble or empirical confidence intervals |
| Owner/approval | Repository maintainers; no empirical validation approval or production model approval granted |
| Version/retirement | Version 1.0.0 pinned in input; unsupported versions rejected; retirement must be enforced by model-governance/application policy |
| Prohibited interpretations | Policy recommendation, welfare optimization, causal effect, psychological diagnosis, ideological regime ranking, forecast |

Not implemented in this bounded package: a network production equilibrium, national input-output inverse estimation, plan-graph persistence, historical source ingestion, automatic probabilistic regime classification, wage/employment dynamics, endogenous prices, queue/stockout estimation, bailouts, quantity/quality substitution, year-end bunching, repeated ratchet games, innovation avoidance, or a planning optimizer. These are not silently represented by zero coefficients or claimed complete because related labels exist. General plans/controls can carry source-backed observations for downstream work; that alone does not establish these mechanisms.

## Verification

Local commands (prefix with `rtk proxy` in this workspace):

```sh
node_modules/.bin/tsc -p packages/allocation-planning/tsconfig.json --noEmit
node_modules/.bin/vitest run packages/allocation-planning packages/simulation-engine
node_modules/.bin/vitest run packages/allocation-planning --coverage --coverage.include='packages/allocation-planning/src/*.ts' --coverage.exclude='packages/allocation-planning/src/*.test.ts' --coverage.reporter=text
node_modules/.bin/biome check packages/allocation-planning packages/simulation-engine/src/internals.ts packages/simulation-engine/src/internals.test.ts
```

Focused verification passed 45 allocation tests plus 35 existing/new simulation tests (80 total). Allocation coverage at that run: 97.96% lines, 96.87% statements, 92.59% branches, 100% functions. These are scoped test results; full repository and external database/API/UI verification are recorded separately by the root execution report. No source data or production evidence is seeded by this package; all invented numbers and citations in tests are explicitly test fixtures.

A local microbenchmark ran 10,000 exact material-balance computations (including correctness assertions) in 57 ms against an explicit 2,000 ms local budget. This is an in-process kernel measurement on the development machine, not an API, database, throughput, or production capacity claim.
