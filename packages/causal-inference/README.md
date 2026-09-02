# `@economyos/causal-inference`

Phase 9 domain core for governing causal analyses. The package creates immutable,
content-addressed contracts for estimands, identification designs, predeclared plans,
point-in-time inputs, result evidence, independent review, claim language, and append-only
result registries.

It supports method-specific contracts for difference-in-differences, synthetic control,
instrumental variables, regression discontinuity, event studies, intervention analysis,
structural time series, structural equation models, Bayesian causal models, causal forests,
heterogeneous treatment effects, and dynamic Bayesian networks.

The package deliberately does **not** execute a statistical estimator, fetch data, establish
empirical identification, or validate a real-world causal claim. Callers must supply estimator
artifacts and evidence produced by separately validated scientific runtimes. A recorded effect is
only an `identified_effect_candidate`; causal language additionally requires passing predeclared
diagnostics, falsification and sensitivity evidence, plus approvals from distinct independent
validation and model-risk reviewers. Predictive and causal-discovery outputs remain explicitly
hypothesis-labeled. Automatic causal-graph promotion is prohibited.
