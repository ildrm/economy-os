# Phase 5 Temporal Relationship Graph Methodology

## Audience and scope

This document describes the implemented Phase 5 relationship-graph foundation for researchers, independent reviewers, data engineers, and operators. The authoritative persistence contract is migration `0032_governed_temporal_relationship_graph.sql`; the deterministic domain, traversal, lineage, and Neo4j-projection contracts live in `packages/causal-graph`.

The implementation governs economic relationships and their evidence. It does not establish that any relationship is empirically true, deploy a Neo4j cluster, or turn causal discovery into causal proof.

## Two graphs with different cycle rules

EconomyOS keeps two graph semantics separate:

- The economic relationship graph may contain feedback. For example, exchange-rate pressure may affect inflation while monetary policy affects the exchange rate.
- The provenance lineage graph must remain acyclic. An artifact cannot directly or indirectly derive from itself.

Traversal and validation apply the appropriate rule to each graph. A cycle in the economic graph is not treated as corrupted lineage, and permission to represent feedback never weakens the provenance DAG check.

## Authoritative identities and time

PostgreSQL is the system of record for endpoint identity, claims, evidence, review decisions, and projection delivery state. Each private record binds organization and workspace identity and is protected by forced row-level security and narrow role grants.

Claims carry both valid-time and system-time meaning:

- `valid_from` and `valid_until` describe when the relationship is asserted to hold in the economic world;
- `discovered_at` records when evidence or analysis first identified it;
- `recorded_at` and append-only decision history describe what EconomyOS knew at a system cutoff.

Point-in-time resolution requires explicit valid and system cutoffs. A later review, correction, or retirement cannot silently alter a historical answer.

## Claim classes and causal humility

Every relationship has an explicit claim kind and causal classification. The database distinguishes association, causal hypothesis, and causal claim; the package exposes the corresponding association, hypothesis, and reviewed-causal domain states.

An association cannot be relabeled as causal in place. Promotion requires a new linked claim, retained source history, method and scope, assumptions, uncertainty, supporting evidence, and an independent decision chain. Causal-discovery output remains hypothesis-generating unless reviewed identification evidence supports a stronger classification.

Each claim records:

- typed source and destination endpoints and one governed relationship predicate;
- method specification, discovery method, owner, and independent reviewer identity;
- population, geographic, temporal, horizon, and regime scope;
- effect direction, bounded strength where applicable, lag, confidence, and uncertainty;
- assumptions, limitations, evidence roles, and supersession history;
- canonical JSON and SHA-256 identity.

A digest establishes content identity and replay equivalence. It is not a signature, scientific validation, or authorization decision.

## Evidence and decisions

Evidence is immutable and may support, contradict, qualify, identify, or validate a claim. Source digest, locator, observation/valid time, author, and record time are retained. Relationship status is reconstructed from append-only decisions rather than overwritten on the claim.

The workflow prevents self-review for causal approval and verifies that required method, evidence, and hypothesis lineage exist before a causal claim can advance. Rejected, disputed, retired, and superseded history remains available at the correct authorized cutoff.

## Bounded graph exploration

The domain package validates tenant identity, point-in-time windows, node and edge integrity, deterministic ordering, and explicit traversal limits. Economic exploration may revisit a node through a feedback path but is bounded by depth, node, edge, and result limits. Cross-tenant nodes or edges fail closed.

No traversal result implies causation merely because a path exists. Each returned edge retains its own claim kind, status, evidence identity, scope, and uncertainty.

## Governed relationship API

The authenticated API exposes replay-safe immutable commands for endpoints, claims, evidence records, evidence links, and independent review decisions, plus a read that resolves one claim at explicit valid-time and system-time cutoffs. Request bodies cannot supply actor or organization identity. Membership, `relationship.read`/`relationship.write` grants, classification ceilings, and entitlements are evaluated inside the tenant transaction; PostgreSQL repeats tenant, role, transition, and evidence gates.

Association, causal-hypothesis, and causal classifications remain distinct at the boundary. Authoring a claim never promotes it, and missing, foreign, or inaccessible target identities share a non-enumerating response.

## PostgreSQL-to-Neo4j projection

Neo4j is a derived read model. Projection input must declare PostgreSQL as its source of truth and bind a source snapshot digest, tenant, valid cutoff, system cutoff, nodes, governed relationships, provenance nodes, and lineage edges.

Projection commands use fixed Cypher templates and parameters; labels, identifiers, and user text are never interpolated into executable Cypher. A projection is content-addressed, replayable, and recorded through an append-only outbox/receipt protocol. Failed delivery may be followed by a successful receipt without rewriting the failed attempt.

`Neo4jDriverProjectionAdapter` binds those commands to the official driver's session and managed-transaction shape. It rejects dynamic, reordered, empty-row, or cross-tenant commands before opening a session, executes the complete canonical batch in one write transaction, and closes the session on success or failure. An empty authoritative projection returns a zero-command receipt without inventing graph content.

Neo4j cannot approve a claim, create canonical identity, or become the sole copy of evidence. A lost projection is rebuilt from the PostgreSQL snapshot and immutable projection evidence.

## Scientific and delivery limitations

This foundation does not establish:

- empirical identification, external validity, transportability, or effect-size correctness;
- completeness of the economic ontology or relationship inventory;
- independence, quality, or licensing of every future evidence source;
- a configured production Neo4j client and cluster, live recovery exercise, backup, capacity profile, or operations qualification;
- a complete graph exploration UI or reviewed corpus of causal claims.

Phase 5 therefore remains `in_progress` until the graph-explorer UI, deployed Neo4j binding, operational projection replay against a real server, representative point-in-time fixtures, and acceptance review are complete. The governed relationship API and atomic driver adapter are implemented, but no Phase 5 artifact permits unsupported causal language.
