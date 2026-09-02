# Phase 5 Temporal Relationship Graph Operations Runbook

## Scope

This runbook covers the governed PostgreSQL relationship store, relationship review workflow, bounded graph-domain operations, provenance-cycle protection, and PostgreSQL-to-Neo4j projection contract. It does not authorize an empirical causal claim or a production Neo4j deployment.

## Preconditions

- Apply all checksum-locked migrations in numeric order and run `corepack pnpm db:verify` against a fresh verification database.
- Use `economyos_app` only through an authenticated principal transaction. Use `economyos_ingest` only for projection outbox delivery and receipt recording. Neither role receives direct table, sequence, or internal-helper access.
- Require organization, workspace, subject, valid cutoff, and system cutoff explicitly. Never obtain analytical time from a wall clock inside a replay or historical query.
- Verify role, classification, entitlement, evidence-license, and current-servability gates before returning a private claim or following its evidence.
- Treat PostgreSQL as authoritative even when a Neo4j projection is available.

## Author and review a relationship

1. Create or resolve both endpoints using stable canonical keys. Ambiguous entity resolution must remain explicit; do not merge identities silently.
2. Create the initial association or causal-hypothesis claim with method, scope, assumptions, uncertainty, effect/lag metadata, owner, valid time, and discovery time.
3. Record immutable evidence, then link it to the claim with an explicit role and rationale. Retain contradicting and qualifying evidence alongside supporting evidence.
4. Record append-only review decisions. The reviewer of a causal promotion must be independent from the claim author/owner as required by the database gate.
5. To strengthen, correct, or narrow a claim, create a superseding claim. Never update historical claim content or decisions.
6. Resolve status using both valid and system cutoffs before serving or projecting it.

## Project to a graph read model

1. Read a bounded batch of pending projection events through the ingest-only outbox function.
2. Reconstruct the exact PostgreSQL snapshot and verify every node, relationship, provenance node, lineage edge, tenant identity, and manifest digest.
3. Validate that provenance lineage is acyclic. Economic feedback loops are allowed and must not be passed through the lineage validator.
4. Build only the package's fixed, parameterized Cypher commands.
5. Execute the batch through `Neo4jDriverProjectionAdapter`; it accepts only fixed templates in canonical order, rechecks every row's tenant and projection digest, and uses one managed write transaction.
6. Record a success receipt containing the projected digest, or a bounded failure code/message. Never mark success before the Neo4j transaction commits.
7. Replay the same immutable event after a transient failure. A changed payload requires a new projection identity.

## Query and exploration safeguards

- Use the governed API commands for endpoint/claim/evidence/link/decision writes; never call owner-level tables from an application identity.
- Resolve claim status with both `effectiveAt` and `systemAt`; a latest-only answer cannot be represented as historical evidence.
- Enforce the request tenant before traversal and again on every node and edge returned by an adapter.
- Require explicit point-in-time cutoffs; never silently switch to latest-revised state.
- Enforce depth, node, edge, and result limits before execution.
- Preserve claim kind, causal classification, status, evidence, scope, and uncertainty on every edge.
- Return missing and inaccessible resources through the same non-enumerating boundary.
- Do not summarize a path as causal when any edge is association, hypothesis, disputed, retired, or unavailable at the selected cutoff.

## Failure handling

| Symptom | Immediate action | Recovery |
|---|---|---|
| Claim digest or decision-chain mismatch | stop serving and projecting the affected claim | preserve IDs and traces; create a corrected forward claim/decision after investigation |
| Causal promotion rejected | leave the source association/hypothesis unchanged | add valid independent review or identification evidence; never bypass the transition gate |
| Provenance cycle rejected | quarantine the proposed lineage edge | correct the derivation graph and emit a new edge identity |
| Neo4j projection fails | retain the failed receipt and keep PostgreSQL authoritative | repair the transient dependency and replay the same outbox event |
| Neo4j differs from projection digest | remove the derived projection from service | rebuild from the exact PostgreSQL snapshot and record a new verified receipt |
| Cross-tenant or enumeration signal | deny access and preserve audit/trace evidence | follow the security incident process; restore only after RLS and authorization regression tests pass |
| Evidence becomes legally unservable | fail closed on affected serving paths | record a forward restriction/review decision; never erase scientific history |

## Forward-only rollback

Endpoint, claim, evidence, decision, outbox, and receipt records are immutable scientific/governance evidence. To roll back behavior:

1. stop the API or projection worker release through deployment controls;
2. retire or supersede affected claims with new governed decisions;
3. deploy a forward migration or package version;
4. rebuild derived graph projections from a pinned PostgreSQL snapshot;
5. rerun clean-room database, package, authorization, and adapter verification before reactivation.

## Current acceptance boundary

Retain output from the focused package tests and coverage, migration `0032`'s adversarial verifier, and the current full clean-room migration suite. The governed relationship API and transaction adapter have executable contract evidence. Before Phase 5 can be accepted, additionally retain projection recovery against a real Neo4j server, graph-explorer UI authorization/non-enumeration, representative point-in-time graph fixtures, operational capacity, backup/rebuild, and independent scientific/governance review.
