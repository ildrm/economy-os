# Phase 7 Narrative and Institutional Intelligence Operations Runbook

## Purpose

Use this runbook to create and challenge narrative research artifacts. Do not present machine extraction, contradiction detection, or analyst interpretation as an independently verified fact or causal finding.

## Admit source evidence

1. Verify the publisher, canonical URI, publication time, original language/locale, classification, attribution, and current license terms.
2. Declare the exact internal-text, citation-snippet, derived-export, and maximum-snippet permissions.
3. Capture immutable provider bytes as a source snapshot with retrieval, availability, and system-recording times.
4. Create source spans against the snapshot's declared UTF-16 offsets. Recompute each selected substring digest from the retained source text.
5. Quarantine any changed bytes, invalid offsets, digest mismatch, late availability, or unclear license. Never repair an existing identity in place.

## Translate for review

1. Keep the original span as evidence authority.
2. Create a separate translation artifact with human, hybrid, or machine method.
3. Pin translator/model and configuration identity plus limitations.
4. Review material numeric/date/entity statements against the original span. A translation digest cannot validate the original source.

## Extract an artifact

1. Pin publication, retrieval, availability, and system cutoffs before extraction.
2. Record the human/model extractor identity and code, configuration, and prompt digests.
3. Cite exact source-span identities. Ground structured numeric/date values in those spans.
4. Record confidence, uncertainty kinds, entity-resolution state, limitations, and invalidation conditions.
5. Label reported facts separately from analyst interpretation and retain `descriptive_non_causal` scope.
6. Issue a new superseding identity when a claim, event, or measure changes; never edit the earlier artifact.

## Review contradictions

1. Run bounded contradiction detection only over tenant-matched, point-in-time-comparable claims.
2. Treat each result as a hypothesis with `truthAdjudication: none`.
3. Create a contradiction group that preserves the candidate evidence and reason.
4. Append an independent analyst decision. Record deferral or unresolved ambiguity rather than forcing agreement.
5. Verify the complete review ledger before serving a resolution.

## Query and export

1. Require organization/workspace, effective and knowledge cutoffs, kinds, languages, cursor, and item bound.
2. Revalidate dataset and artifact integrity before query or comparison.
3. For export, recheck authorization, classification, document policy, license capabilities, purpose, requester, and citation count.
4. Return only bounded citation snippets or an allowed derived artifact. Confirm `fullTextIncluded` is always `false`.
5. A denied/restricted source, absent permission, invalid span, or mixed-policy evidence fails the complete export.

## Failure handling

| Symptom | Meaning | Required action |
|---|---|---|
| span digest mismatch | offsets, encoding, or retained bytes differ | quarantine the snapshot/span and re-ingest under a new identity |
| evidence is after cutoff | the artifact leaks future knowledge | reject it and rerun from an eligible snapshot |
| numeric/date grounding fails | structured content is not supported by cited surface text | remove or correct the extraction; do not infer the value |
| entity remains ambiguous | canonical identity is not established | preserve ambiguous/unresolved state and restrict aggregation |
| contradiction detected | claims may conflict; truth is undecided | route to independent analyst review |
| export denied | license, classification, authorization, or mode gate failed | return no content; obtain a forward legal/authorization decision if appropriate |
| ledger integrity fails | evidence or review history changed | stop serving, preserve IDs/traces, and investigate tampering/decoding |

## Verification

From the repository root, run:

```text
corepack pnpm --filter @economyos/narrative-intelligence build
corepack pnpm --filter @economyos/narrative-intelligence typecheck
vitest run packages/narrative-intelligence/src
vitest run packages/narrative-intelligence/src --coverage --coverage.include='packages/narrative-intelligence/src/**'
biome check packages/narrative-intelligence
```

The package gate is not Phase 7 acceptance. Add clean-room persistence/RLS, ingestion/provider, API/UI, multilingual empirical evaluation, source-license, authorization, security, and operational evidence before changing phase status.

## Forward-only recovery

Preserve source and artifact manifests, restrict affected content, create a new snapshot/extraction/review identity, re-run point-in-time and license checks, and supersede forward. Never erase the historical evidence or silently replace cited text.
