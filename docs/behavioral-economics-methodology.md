# Behavioral economics: methodology and implemented research boundary

The `@economyos/behavioral-economics` package implements governed research contracts, bounded mathematical kernels, source-grounded intervention candidates, and explicit bridges to narrative evidence, graph hypotheses and point-in-time forecasting. It does not ship empirical behavioral observations, a universal behavioral score, default empirical parameter estimates, or production model approvals.

## Prompt refinement decisions

| Original requirement | Issue | Implemented refinement | Reason and consequence |
| --- | --- | --- | --- |
| Cover every major theory and named researcher | A catalog entry does not implement or validate a theory | Versioned entries distinguish `conceptual_registry` from `executable_research_kernel`; unverified bibliographies are explicit | Prevents feature count from becoming an empirical or implementation claim |
| Prospect theory with probability weighting | Separately weighting each outcome is not cumulative prospect theory | Ranked cumulative gain/loss weights with the one-parameter Prelec function; independent gain/loss curvature parameters | Reproduces linear probability/value benchmarks without asserting universal calibration |
| Detect interventions actually used by institutions | Keywords cannot establish implementation, exposure, effect, intent or manipulation | A bounded English lexical detector emits candidates; independent dated review can document choice architecture but cannot establish its effect | Candidate detection and causal evaluation remain distinct |
| Behavioral source/evidence contracts | Existing narrative contracts already enforce source identities, full-text permissions and citation limits | Reuse `SourceDocument`, `SourceSnapshot` and `SourceSpan`; require their digest bindings and source chronology in studies | Avoids a second, weaker source or licensing system |
| Behavioral score/state throughout the platform | Combining unrelated psychological constructs is not a defensible universal index | Independent constructs with units, definition digests, context, uncertainty and missing reasons | Preserves source and definition disagreement; no missing-as-neutral treatment |
| Forecast integration | Availability of a behavioral measurement does not establish predictive value | Reuse the forecasting materializer after scoped, dated, definition-bound paired evaluation and leakage review | Rejects future review/fit information, simulated observations and absent baseline improvement |
| Causal graph integration | New labels cannot bypass the graph's reviewed causal transition | Use existing `economic_concept` nodes and `hypothesized_causal_pathway` assertions with no numerical causal strength | Preserves graph gates; stronger claims need the separate causal-inference workflow |
| Every model has governance | A mathematical unit test is not empirical validation or deployment approval | Choice models expose a research-only card; parameter citation is provenance, not validation | Existing `model-governance` gates remain necessary for deployment |

## Architecture and ontology

The package contains separate modules for theory registration, mathematical kernels, choice agents, intervention detection/review, study evidence, and cross-domain integration. It imports canonical instant validation, narrative source contracts, graph factories and the forecasting feature materializer. It has no HTTP, database, UI, global session, LLM or external-provider dependency. The Node cryptographic primitive creates deterministic manifest and text digests.

`BEHAVIORAL_THEORIES` has 20 versioned families. Each records mechanisms, authors, description, executable bindings, boundary conditions, alternative explanations, prohibited claims, bibliography status and research-maintainer ownership. Author membership records intellectual context; it does not assert that every author supports every listed mechanism. Verified foundational references do not constitute a systematic evidence review of the entire family. New entries can be registered through `registerBehavioralTheory`; registering an executable binding does not dynamically install arbitrary code.

| Family and researchers accounted for | Concrete package representation | Executable boundary |
| --- | --- | --- |
| Simon: bounded rationality, satisficing | Search order, aspiration threshold and budget | First acceptable utility; no hidden fallback when aspiration is unmet |
| Kahneman/Tversky; Gigerenzer: heuristics and critique | Anchoring, availability, representativeness, framing, base-rate/conjunction hypotheses | Conceptual catalog; competing information/design explanations remain explicit |
| Kahneman/Tversky; Prelec: prospect theory | Reference point, gain/loss curvature, loss aversion, cumulative weighting | Value and cumulative risky-prospect utility kernels |
| Thaler: mental accounting | Earmarking, transaction utility, windfall/payment coupling | Conceptual catalog |
| Thaler/Kahneman/Knetsch; Samuelson/Zeckhauser | Endowment, status quo, ownership, switching costs | Conceptual catalog, distinct from loss-aversion attribution |
| Thaler/Sunstein; Madrian/Shea; Johnson | Defaults, consent architecture, endorsement and friction | Source-grounded lexical candidates and review; no uptake/effect model |
| Laibson; O'Donoghue/Rabin; Ainslie; Thaler/Benartzi/Shefrin | Present bias and commitment | Quasi-hyperbolic utility of supplied flows; no dynamic commitment equilibrium |
| Loewenstein and related projection-bias work | Projection, hot/cold states, temptation | Conceptual catalog; no sensitive individual-state inference |
| Fehr/Schmidt; Rabin; Bolton/Ockenfels | Distributional utility versus intentions/relative shares | Fehr-Schmidt utility only; reciprocity/ERC remain conceptual |
| Fehr/Gächter; Ostrom; Schelling | Cooperation, punishment, norms, reputation and coordination | Conceptual catalog |
| Camerer/Ho/Chong | Level-k, cognitive hierarchy, learning and logit response | Numerically stable logit response; no solved strategic equilibrium |
| Vernon Smith; List/Gneezy | Experimental design, incentives, field validity | Study contracts and replication metadata; no fabricated experimental results |
| Mullainathan/Shafir | Scarcity, bandwidth and tunneling | Conceptual catalog; poverty is not a psychological diagnosis |
| Akerlof/Kranton | Identity and role norms | Conceptual catalog; protected-attribute profiling excluded |
| Shiller/Akerlof | Narratives, confidence and collective expectations | Narrative-source integration and construct/hypothesis representation; no contagion estimator |
| Shiller/Thaler/Barberis/Shleifer/Vishny; Shefrin/Statman/Odean; Barber/Odean | Disposition, overconfidence, trading, herding, home bias, extrapolation, limits to arbitrage | Opportunity-adjusted disposition statistic and governed investor choice kernel; other mechanisms conceptual |
| Ellsberg/Allais; Wakker/Wu | Ambiguity, unknown probabilities and preference competition | Explicit distinction; known-risk kernels reject incomplete mass |
| Sims/Gabaix | Limited attention, information costs, rational inattention | Conceptual catalog; rational inattention is not automatically classified as bias |
| Chetty/DellaVigna; Gneezy/Fehr | Public finance, benefits, labor/organization mechanisms | Choice-architecture candidates and study/construct contracts; no automatic welfare conclusions |
| Context dependence, salience, regret/disappointment | Menus, decoys, reference prices and competing interpretations | Conceptual catalog and reference-price candidate detection |

Catalog coverage is broader than executable model coverage. The remaining dynamic games, learning rules, mental-accounting budgets, ambiguity preferences, social/identity utility, narrative transmission, macroeconomic aggregation, multi-agent market clearing and causal estimators are not implemented by this package.

## Mathematical specifications

**Prospect values.** A supplied outcome is compared with the supplied reference point. The difference is calculated in exact fixed-point decimal units *before* conversion to numerical exponentiation, preserving small differences near large balances. Gains use `difference ^ gainCurvature`; losses use `-lossAversion * (-difference) ^ lossCurvature`. Curvatures are in `(0, 1]`; the positive loss multiplier is explicitly supplied, with a computational upper bound of 100. These are supported model-domain bounds, not estimated population restrictions. No default value of 2.25 is introduced.

**Cumulative weighting.** The one-parameter Prelec function is `exp(-(-log(p)) ^ alpha)`, with exact endpoints at zero and one. Outcomes are ordered by exact decimal value. Loss probabilities accumulate from the worst loss; gain probabilities accumulate from the greatest gain. Each decision weight is a difference of cumulative transformed mass. Input probabilities sum exactly to one in fixed-point arithmetic; the function never normalizes missing probability mass. `alpha=1` and linear value parameters recover expected-value behavior up to the documented nonlinear-kernel numerical precision. A certain equal outcome and coalesced equal outcomes agree.

**Intertemporal choice.** `quasiHyperbolicUtility` consumes already-transformed utility flows in equally spaced periods. The present flow has weight one and flow `k>0` has weight `beta * delta^k`. `beta=1` recovers exponential discounting; `beta=0` removes future utility. Consumption cannot be substituted for utility without an explicit utility specification outside this function.

**Social preferences.** `inequalityAversionUtility` implements Fehr-Schmidt's mean disadvantageous and advantageous payoff penalties over other participants, with `alpha >= beta`, `0 <= beta < 1`, and at least two participants. Zero parameters recover own payoff; equal allocations have no inequality penalty. It does not implement intention-based reciprocity.

**Bounded choice and response.** Satisficing preserves explicit menu order and returns a null choice when the search budget expires without meeting the aspiration. Logit response uses a maximum-subtracted exponential to avoid overflow; zero precision is uniform. This is a response rule given utilities, not a quantal-response game equilibrium.

**Behavioral finance.** Disposition measures use `realized gains/(realized gains + paper gains)` and the analogous loss rate. The difference is descriptive. Missing gain/loss opportunities return null rates and explicit reasons. Taxes, liquidity needs, transaction costs, portfolio rebalancing, reference-price construction and dependence across observations require separate empirical treatment; the function returns no significance test or psychological attribution.

**Numerical envelope.** Contract values are decimal strings with at most 12 integer and 12 fractional digits. Expected values accumulate and round exact fixed-point products; reference subtraction and probability mass use `BigInt`. Powers, logarithms, exponentials, discounted sums and social utility use bounded IEEE-754 numerical kernels, with output rounded to 12 decimal places. Negative zero is normalized. Scientific/model uncertainty is never equated with these numerical limits. For very large utilities, significant-digit loss in nonlinear kernels remains possible; their output is research numerical computation, not an exact monetary ledger.

## Agent models, competition and governance

`createBehavioralChoiceModel` binds a model UUID, version, workspace, owner, population, jurisdiction, availability, parameters, explicit assumptions, boundary conditions and prohibited uses. The executable families are risk-neutral expected value and cumulative prospect choice. Parameters are either declared assumptions or cited estimates with population and estimation time. Estimate citations are not independently authenticated empirical validation; no model is promoted to deployment merely because the citation exists.

`simulateBehavioralChoice` accepts an explicit finite menu and deterministic seed. It emits input/model digests, utilities, response probabilities, a selected choice, and a risk-neutral expected-value benchmark. Maximum choice uses the first item in the explicit menu for exact ties. Logit sampling derives a 52-bit uniform variate from SHA-256 with a versioned domain separator. Choice variation is distinguished from unquantified model/parameter uncertainty. Menu probabilities are rounded numerical response probabilities; any sampling normalization only corrects their rounding, never missing evidence.

`behavioralChoiceModelCard` makes research-only approval, parameter provenance, transferability limits, unquantified calibration uncertainty, and lack of empirical deployment validation visible. It is a research card supplement, not a replacement for the platform's model inventory, independent validation and production-approval workflow.

`evaluateBehavioralChoicePredictions` computes a multiclass Brier score from supplied predictions and observed choices. Evaluation must strictly follow calibration and binds an evaluation-sample digest. This enables side-by-side model comparison; it does not manufacture real observations, select a fashionable model automatically, or claim causal identification. No empirical benchmark dataset is bundled.

## Evidence and point-in-time methodology

Studies retain population, jurisdiction, decision context, intervention, comparator, outcome, estimand, sample size or missing reason, preregistration if known, effect unit, estimate and interval or uncertainty reason, replication relationships, external-validity limits, alternative explanations, attrition, multiple-testing and publication-bias assessments. Theoretical studies can explicitly have no sample or quantitative effect. A replication conclusion requires related study IDs; self-replication references are rejected. No statistical-significance-to-economic-importance rule is applied.

Each study includes narrative source documents, snapshots and exact spans. Constructors verify manifest bindings, workspace, source chronology and bounded span offsets. A study cannot claim knowledge before its sources were available or system recording before source recording. Raw snapshot text is verified during narrative snapshot/span creation; study queries do not rediscover or fetch that text.

Knowledge time, economic study period and system-recorded time remain separate. New behavioral contract timestamps accept canonical UTC fractions up to nanoseconds and compare with `BigInt` nanoseconds, avoiding `Date.parse` truncation of accepted fractional precision. Evidence queries require both knowledge and system cutoffs; future revisions are excluded. Cross-workspace/organization input fails closed instead of returning an empty result that could conceal an authorization mistake.

`assessBehavioralEvidenceAsOf` preserves matching individual studies and lists evidence in other population/jurisdiction contexts separately. It returns `unknown` evidence grade pending contextual human synthesis. It deliberately does not pool incomparable effect units, vote by study count, or assign a universal replication grade. The seven supported evidence-grade names are vocabulary for governed assessments; an automatic grading algorithm is not implemented.

## Intervention detection, review and ethics

The versioned English detector covers default enrollment, opt-in/out, social-information messages, scarcity messages, reminders, commitment, reference prices, automatic renewal, goal setting, simplification and cancellation friction. It processes at most 200,000 UTF-16 code units and emits at most 1,000 candidates. Fixed lexical rules are bounded; source documents are untrusted data and no prompt, code or URL is executed. Unsupported languages and no-match results explicitly mean no conclusion about intervention absence.

Every candidate binds the source document/snapshot, deterministic rule identity, UTF-16 offsets, exact text digest, licensed citation snippet, supplied actor/context, source dates, detection time, uncalibrated confidence, alternative interpretations, pending review and an explicit noncausal claim. Actor attribution is supplied by the caller and requires review. Negated, quoted, hypothetical or historical statements may match; this is documented in the output. The detector has no measured precision/recall and is not a general semantic document extractor.

The detector respects internal-full-text permissions, export restrictions and per-source snippet limits. Full text is not copied into its output. The application must separately enforce request authorization and export policy; content digests establish reproducible integrity, not an author's identity or a cryptographic signature of truth. No source text or psychological profile is logged by the domain.

`reviewBehavioralCandidate` creates an immutable dated decision with reviewer, criteria, rationale, candidate digest, implementation date where documented, and an ethical-review state. Review can reject a candidate, leave it unresolved, or document implemented choice architecture. It cannot declare effectiveness, deception, dark patterns, welfare improvement or a causal effect. Queries exclude later human decisions from earlier knowledge/system cutoffs. The product must verify the reviewer identity through its authorization boundary; the pure domain does not authenticate principals.

## Cross-domain integration

`createBehavioralConstruct` records independently queryable aggregate measurements with definition digest, class, units, uncertainty, measurement methodology and source-backed study. `assembleBehavioralStateAsOf` excludes simulations from observed state and preserves all known measurements, including conflicting values under the same definition. Conflicting definitions remain explicit. No silent source selection or cross-construct overall score occurs.

`materializeBehavioralForecastFeature` requires validation tied to the same definition/population/jurisdiction, explicit reviewer and recording time, a strictly out-of-calibration evaluation interval, matched baseline/augmented MSE, sample count, evaluation and leakage-audit digests, limitations, and measured baseline improvement. It then delegates feature materialization to `@economyos/forecasting-engine`. Simulations are rejected; missing values remain missing. This contract validates submitted review facts; it does not run the underlying evaluation or prove statistical significance/transportability.

`behavioralConstructGraphNode` binds an existing `economic_concept` graph node to the measurement identity. `createBehavioralCausalHypothesis` requires matching measurement, study reference and population, preserves caller-declared direction/lag/uncertainty, and only permits a proposed hypothesized pathway with no numerical causal strength. The existing graph contract still governs acceptance; actual causal studies/results belong in the causal-inference subsystem. Crisis, macroeconomic, labor, organizational and investment pathways can use these generic constructs and hypotheses; calibrated cross-domain effect equations are not supplied.

## Verification and review evidence

Tests exercise mathematical identity cases, reference-point transitions down to `1e-12` near billion-unit balances, monotonic/bounded weighting, cumulative-weight coalescing, exact probability mass, parameter boundaries, equal-payoff fairness, search exhaustion, overflow-stable logit, absent disposition opportunities, deterministic replay and seed-distribution sanity. Governance tests cover poisoned text, unsupported language, negation, licensing, human review, cross-tenant rejection, chronology leakage at nanosecond boundaries, source-proof requirements, immutable digests, explicit missingness, replication constraints and held-out model comparison. Integration tests cover construct disagreement, simulation exclusion, missing forecasting features, baseline/fit leakage and hypothesis-only graph assertions.

Independent review identified and corrected three defects during development: floating-point reference subtraction could erase small gains/losses; study span references alone lacked source chronology proofs; state projection could silently choose one same-definition source. Graph node identity and hypothesis population checks were also tightened. The repository tests include these regression cases.

See the final repository verification report for exact final commands and counts. Package-local verification is not a claim of external empirical validation, production deployment, comprehensive calibration, dark-pattern adjudication, multi-agent equilibrium, contagion modeling, or completion of every roadmap phase.

## Foundational sources checked for this implementation

- [Tversky and Kahneman (1992), *Advances in Prospect Theory: Cumulative Representation of Uncertainty*](https://doi.org/10.1007/BF00122574): cumulative rather than independent decision weights; gain/loss treatment.
- [Prelec (1998), *The Probability Weighting Function*](https://nel.mit.edu/wp-content/uploads/2016/10/26probabilitycopy.pdf): the implemented one-parameter probability-weighting family.
- [Laibson (1997), *Golden Eggs and Hyperbolic Discounting*](https://laibson.scholars.harvard.edu/publications/golden-eggs-and-hyperbolic-discounting): quasi-hyperbolic preferences and commitment context.
- [Fehr and Schmidt (1999), *A Theory of Fairness, Competition, and Cooperation*](https://web.stanford.edu/~niederle/Fehr.Schmidt.1999.QJE.pdf): the inequality-aversion utility restrictions and interpretation.
- [Odean (1998), *Are Investors Reluctant to Realize Their Losses?*](https://onlinelibrary.wiley.com/doi/10.1111/0022-1082.00072): realization rates relative to opportunities; reference-point and tax considerations.
- [Madrian and Shea (2000 working paper), *The Power of Suggestion*](https://www.nber.org/papers/w7682): default enrollment as a concrete institutional research context, not a universal effect-size calibration.
- [Shiller (2017), *Narrative Economics*](https://www.aeaweb.org/articles?id=10.1257/aer.107.4.967): narrative mechanisms as research hypotheses.
- [Chetty (2015), *Behavioral Economics and Public Policy: A Pragmatic Perspective*](https://www.aeaweb.org/articles?id=10.1257/aer.p20151108): predictive and policy evaluation motivation, distinct from untested behavioral labels.

The bibliography is foundational, not a systematic replication/meta-analysis review. Families whose original sources were not verified in this development increment say `bibliography_not_verified` in the executable catalog. Empirical evidence strength must be assessed for the actual population and context, using admitted studies and competing evidence.
