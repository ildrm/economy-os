# Phase 3 Research-Baseline Methodology Review

## Decision

The five provider-level definitions in `packages/economic-state/src/research-baselines.ts` are accepted for transparent Phase 3 research-baseline use. The registry digest is:

```text
bb47cda7f133698f971eeb78484576537f5250ab188b65a965b062675110d3e6
```

This is a repository semantic/formula review, not independent model validation or production approval. Every definition remains `research`, supports descriptive evidence exploration only, and prohibits forecasting, probability, causal, welfare, safety, eligibility, investment, credit, and policy-decision claims. Phase 13 remains responsible for independent validation and the full governed production lifecycle.

## Admitted source contract

All components use World Development Indicators provider source `2`, with its existing governed CC BY 4.0 license/admission evidence. The registry fixes the external indicator identity but does not authorize or serve data by itself. A calculation must still bind each indicator to an exact active series, immutable parser contract, admitted release, quality evidence, legal evidence, and point-in-time snapshot.

The reviewed external identities are:

| Dimension | Indicator contracts |
|---|---|
| macroeconomic | `NY.GDP.MKTP.KD.ZG`, `FP.CPI.TOTL.ZG`, `SL.UEM.TOTL.ZS` |
| human economic | `NY.GDP.PCAP.KD.ZG`, `SL.UEM.TOTL.ZS`, `SI.POV.GINI` |
| financial system | `FB.BNK.CAPA.ZS`, `FB.AST.NPER.ZS`, `FS.AST.PRVT.GD.ZS` |
| market | `CM.MKT.LCAP.GD.ZS`, `CM.MKT.TRNR`, `CM.MKT.INDX.ZG` |
| regime balance | `NY.GDP.MKTP.KD.ZG`, `FP.CPI.TOTL.ZG`, `BN.CAB.XOKA.GD.ZS` |

The World Bank catalog remains the authority for definitions, attribution, release coverage, and revisions. Sparse or unavailable country-period observations stay missing; they are never replaced with a neutral value.

## Formula and semantic review

Each definition uses the already governed exact-fraction weighted min-max algorithm, a `0.6` minimum evidence-coverage threshold, no imputation, explicit polarity, and explicit research bounds. The following findings are accepted and exposed as limitations rather than hidden:

- Growth, credit depth, capital, market size, and turnover are not universally beneficial when larger.
- Inflation and current-account balances have country-specific targets and interpretations; monotonic research polarity is deliberately simplistic.
- GDP per-capita growth is only a household-income proxy. Unemployment omits informality and job quality. Gini observations are sparse and survey concepts vary.
- Accounting capital and reported nonperforming loans are not complete stress-loss measures.
- Annual market and macro data cannot detect intra-year turning points and do not create a regime probability.
- Cross-country comparison is allowed only when the comparison API confirms the same methodology/artifact and explicit PIT compatibility. It never creates a rank or silently normalizes unlike definitions.

These limitations make the models suitable as transparent research baselines and unsuitable as decision products.

## Coverage and sensitivity gate

`analyzeCompositeSensitivity` creates deterministic, content-addressed diagnostics for every observed component:

1. leave one component out and erase every evidence binding;
2. reduce that component's weight by the declared relative perturbation;
3. increase that component's weight by the same perturbation;
4. report status, score or abstention, completeness, confidence, renormalization, delta, threshold crossings, and the total observed score range.

The default perturbation is `0.1` and is bounded to `(0, 0.5]`. Scenarios are diagnostics, not alternate governed model runs, and receive separate perturbation digests. Tests prove that an omitted high-weight component crosses the coverage gate and produces `insufficient_data`, while other omissions renormalize only above the threshold. Pre-existing missing components are recorded and excluded from weight scenarios.

## Acceptance boundary

Phase 3 may use these definitions to demonstrate reproducible five-dimensional country/global research state, coverage, missingness, evidence navigation, and methodology-compatible comparison. Acceptance does not imply:

- empirical predictive performance;
- calibrated regime probabilities;
- a welfare, prosperity, resilience, or investment ranking;
- independent validation;
- production lifecycle approval;
- suitability for an automated decision.

Those claims require later phase-specific evidence and cannot be inferred from a passing Phase 3 engineering gate.
