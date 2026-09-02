# Economic State Baseline Methodology

## Scope

This document governs the first Phase 3 research baseline. It defines a reproducible composite-state calculation for macroeconomic, human-economic, financial-system, market, and regime dimensions. It is not a forecast, causal estimate, welfare judgment, or claim that a multidimensional economy can be reduced to one number.

Every schema-v2 run binds a model ID and semantic version, the exact governed model-artifact ID and SHA-256 digest, geography, governed dataset snapshot, point-in-time policy, knowledge cutoff, optional system cutoff, component observations, and output-manifest digest. Changing a bound, weight, polarity, coverage threshold, feature series, parser interpretation, model artifact, or input snapshot creates a different model or run.

The model artifact identity records its immutable ID and digest, algorithm key and semantic version, configuration, normalization, assumptions, and approval digests, plus lifecycle status (`research`, `validated`, `approved`, `restricted`, or `retired`). The artifact digest commits to the larger artifact manifest persisted by the governance boundary, including code, lockfile, SBOM, and environment evidence; those larger fields are intentionally not duplicated in every model definition.

Each component binds one exact active series ID, concept ID, unit code, frequency, seasonal-adjustment classification, and parser name/version/code/configuration identity. `featureContractSha256` is recomputed from that normalized feature contract before calculation. A stale digest therefore rejects changes to any series or parser field instead of silently applying the old model to a different feature.

## Normalization and aggregation

Each component declares a positive weight, governed lower and upper bounds, and a polarity. Inputs outside those bounds fail closed; they are not silently clipped. Positive-polarity inputs use min-max normalization. Negative-polarity inputs use one minus that normalized value.

All decimal parsing and weighted arithmetic use exact integer fractions. Only published fields are rounded to six decimal places, deterministically. For the available component set, the displayed 0–100 score is:

```text
100 × sum(weight × normalized value) / sum(available weight)
```

The output records every normalized value and weighted contribution. A score therefore remains reproducible without relying on floating-point evaluation order.

## Missingness and coverage

Every observed component must provide an observation ID, source ID, source-dataset ID, license-review ID, effective source-admission-decision ID, quality value, `qualityEvidenceSha256`, and `legalEvidenceSha256`. The legal digest commits to the canonical immutable evidence that the named license review and approved admission decision authorized `derive` for that source dataset when the component was calculated. The package validates and preserves these exact bindings; the database reconstructs and authenticates their evidence manifests.

An unobserved component instead requires an explicit missing reason and every provenance, legal-admission, quality, and evidence-digest field must be null. Missing components never receive a neutral, zero, historical-average, or imputed value.

Completeness is available component weight divided by total model weight. When completeness is below the versioned model threshold—or no evidence is available—the result is `insufficient_data` and has no score. Above the threshold, an incomplete result is `partial`; available weights are explicitly renormalized and the output carries `renormalized: true` plus the full missing-component list.

Confidence is the total-weight-normalized sum of available weight multiplied by input quality; missing evidence contributes no confidence. Source coverage records distinct source IDs relative to model component count, alongside the absolute distinct-source count. Distinct IDs do not establish statistical, editorial, or institutional independence. These fields are diagnostics, not probabilities.

## Five-dimensional EconomicState vector

The Phase 3 `EconomicState` envelope always has exactly five named slots, in canonical order:

```text
macroeconomic
human_economic
financial_system
market
regime
```

Each slot contains either its canonical model definition plus full serialized composite result (including components, provenance, coverage, confidence, and manifest) or an explicit dimension-level missing reason. An `insufficient_data` composite remains a reported result with a null score; it is distinct from a dimension that was not modeled, unavailable, or failed before producing a result. Absent slots are rejected, as are slots that claim both a result and a missing reason.

All reported dimensions must bind the exact same geography ID, knowledge cutoff, point-in-time policy, optional system cutoff, and governed snapshot digest. String equality is intentional: two economically similar but operationally different snapshots or cutoffs are not the same reproducible state. Each schema-v2 result must also repeat the exact artifact ID and SHA-256 digest from its model. Every nested digest is recalculated, every feature-contract digest is reconstructed from its series/parser fields, and every composite is recalculated from its bound model and serialized component evidence before assembly. The vector records a digest of the shared context and a canonical digest over the complete ordered envelope, including every artifact identity, model definition, series/parser contract, source dataset, license review, admission decision, quality/legal evidence binding, nested component, and explicit missing reason.

Component and result arrays use ascending PostgreSQL `COLLATE "C"` / JavaScript UTF-16 code-unit order, never locale-sensitive sorting. This matters for punctuation-bearing canonical keys (`-` before `.` before `_`) and keeps database and package manifests byte-for-byte deterministic.

Governed vectors are persisted as one immutable workspace-scoped envelope plus exactly five canonical dimension slots. Deferred database validation rebuilds every nested model definition and run result, recomputes the shared context, diagnostics, complete ordered manifest, and digest, and rejects incomplete or inconsistent slot sets at transaction commit. Row-level security hides vectors and slots outside the subject's workspace memberships. Immutable lineage uses explicit `state_run` and `state_vector` endpoint types and automatically records model-to-run, observed-evidence-to-run, and reported-run-to-vector edges.

These checks establish canonical integrity and internal arithmetic reproducibility, not external authenticity. A caller can calculate its own SHA-256 digest or consistently forge an entire disconnected envelope. The governed persistence or serving boundary remains responsible for authorizing the caller and resolving artifact, model, series, parser, observation, source, source-dataset, license-review, source-admission, snapshot, and evidence identifiers to immutable admitted records.

The envelope deliberately has no cross-dimension score, overall rank, or weighted average. Macro, human, financial, market, and regime models answer different questions; flattening their scores would imply an unreviewed utility function and allow strong data in one dimension to conceal missing data in another.

Instead, the vector publishes separate diagnostics:

- `dimensionCoverage`: reported dimension results divided by five;
- `scoredDimensionCoverage`: dimensions with a non-null composite score divided by five;
- `evidenceCoverage`: the sum of reported per-dimension completeness divided by five;
- `confidenceCoverage`: the sum of reported per-dimension confidence divided by five;
- `evidenceQuality`: confidence divided by completeness, or null when no evidence exists;
- reported/observed component counts and distinct-source counts, plus distinct source IDs divided by component slots in reported dimensions.

Vector diagnostics parse the canonical six-place composite fields back into exact integer fractions, aggregate those fractions, and round only the published vector fields to six places. The coverage diagnostics treat missingness as absence of coverage, never as an indicator value. `evidenceQuality` is conditional on evidence and must always be interpreted beside `evidenceCoverage`; a high conditional quality cannot compensate for an unreported dimension. Count-based distinct-source coverage is a diversity diagnostic, not proof of independence, an authority score, or a substitute for source-level quality and license review.

## Interpretation boundaries

- Direct observations, proxies, derived variables, latent estimates, composite scores, and normative interpretations remain distinct types.
- A higher score means only what the named, versioned model and component polarities define.
- No score may be labeled as human welfare, prosperity, resilience, regime probability, or risk without a separately reviewed definition and validation record.
- Historical percentiles, trends, acceleration, regime probabilities, and risk flags require their own versioned transformations and are not inferred by this baseline.
- Production calculations may consume only governed, license-authorized, quality-passing point-in-time evidence. Synthetic fixtures remain excluded from serving paths.

## Acceptance evidence

The executable contract lives in `packages/economic-state`. Its tests prove exact weighted polarity, quality and legal-evidence binding, null-closed missingness, deterministic manifests, explicit partial results, no-evidence failure, governed-bound rejection, point-in-time context validation, complete five-slot assembly, cross-dimension context rejection, schema-v2 model/artifact/result binding, series and feature-contract forgery rejection, C/code-unit punctuation ordering, model-bound arithmetic reproduction, and the absence of a mega-score. Database authenticity, persistence, and tenant isolation are verified separately by the Phase 3 migration suite.
