# Phase 7 Narrative and Institutional Intelligence Methodology

## Scope

`packages/narrative-intelligence` implements the governed domain and validation core for cited narrative evidence, extracted claims and events, institutional measures, multilingual identity, contradiction review, point-in-time querying, and license-aware export.

The package does not contain a source corpus, LLM/provider call, empirically validated extraction model, persistence layer, API, UI, or production approval. Extracted content is evidence-linked research material, not economic truth or a causal conclusion.

## Source identity and licensing

A source document pins tenant, publisher, canonical URI, source type, original language/locale, publication time, classification, attribution, and an explicit license/export policy. Snapshots bind exact content length and SHA-256, media type, retrieval/availability/system times, and UTF-16 code-unit offset semantics.

Source spans identify one immutable snapshot, locator, exact start/end offsets, and text digest. When source text is available for verification, the selected substring must reproduce that digest. Optional citation snippets carry their own offsets and remain bounded by the document's license policy.

Export policy is fail-closed:

- `deny` exports nothing;
- `citation_only` permits only authorized bounded snippets;
- `derived_only` permits a governed derived artifact when the license allows it;
- full source text is never included in an export result.

Classification and license permission are independent. An internally readable document is not automatically exportable.

## Multilingual evidence

Original evidence identity never changes when translated. A translation is a separate content-addressed artifact that binds its source span, source/target language, target locale, method, translator or model identity, configuration digest, creation time, and limitations. Claims cite original spans; a translation assists review but does not replace the source text.

## Claims, events, and measures

Every artifact records extraction method and actor/model identity, code/configuration/prompt digests, publication/retrieval/availability/system cutoffs, extraction time, exact confidence, uncertainty statements, entity-resolution state, limitations, and invalidation conditions.

Claims additionally carry a structured subject–predicate–object fact, canonical value/unit, source surface text, polarity, effective interval, and supporting span identities. Events retain occurrence time and distinguish reported fact from analyst interpretation. Institutional measures retain the responsible institution, announcement/effective times, and the same basis distinction.

Numeric and date values must be grounded in cited source spans. Evidence snapshots available after the artifact cutoff are rejected. All three artifact kinds fix epistemic scope to `descriptive_non_causal`; extraction confidence is not event probability or causal confidence.

## Contradictions and analyst review

Deterministic comparison may surface a `contradiction_hypothesis` when claims are comparable and conflict in polarity or canonical fact. It never adjudicates truth. Incomparable claims remain explicitly incomparable.

A contradiction group binds the candidate claims and reason. Analyst decisions are append-only and independently identified; they may confirm, reject, defer, or supersede the hypothesis according to the package workflow. Tampering with an earlier decision or manifest breaks ledger integrity rather than rewriting history.

## Bounded dataset, query, and comparison

A narrative dataset is a deterministic tenant-scoped snapshot of documents, source snapshots, spans, translations, artifacts, contradictions, and reviews. Integrity validation recursively rechecks identities, digests, evidence links, tenant boundaries, chronology, and referential consistency.

Queries require effective and knowledge cutoffs, explicit artifact kinds/languages, a cursor, and a maximum item count. Ordering and pagination are deterministic. Claim comparison is bounded and preserves `truthAdjudication: none`.

## Limitations and acceptance boundary

The code establishes evidence and governance contracts; it does not establish extraction precision/recall, entity-resolution quality, corpus completeness, source independence, translation fidelity, institutional-measure comparability, or legal approval for a future corpus.

Phase 7 remains `in_progress` until durable tenant-isolated persistence, lawful source ingestion, provider isolation, representative multilingual evaluation, analyst API/UI, authorization/export tests, monitoring, and independent legal/model review are implemented and accepted.
