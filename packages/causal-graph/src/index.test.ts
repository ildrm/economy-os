import { describe, expect, it, vi } from "vitest";

import {
  appendClaimDecision,
  appendEvidence,
  assertClaimDecisionIntegrity,
  assertClaimDecisionLedgerIntegrity,
  assertClaimEvidenceIntegrity,
  assertEvidenceLedgerIntegrity,
  assertGraphNodeIntegrity,
  assertLineageEdgeIntegrity,
  assertPostgresGraphProjectionIntegrity,
  assertProvenanceNodeIntegrity,
  assertRelationshipIntegrity,
  buildNeo4jProjectionCommands,
  CAUSAL_CLASSIFICATIONS,
  type ClaimDecision,
  type ClaimDecisionLedger,
  type ClaimEvidenceInput,
  createClaimDecision,
  createClaimDecisionLedger,
  createClaimEvidence,
  createEvidenceLedger,
  createGraphNode,
  createLineageEdge,
  createPostgresGraphProjection,
  createProvenanceNode,
  createRelationshipAssertion,
  ECONOMIC_RELATIONSHIP_TYPES,
  exploreTemporalGraph,
  GRAPH_NODE_TYPES,
  type GraphNode,
  type GraphNodeInput,
  governedCausalReviewTransition,
  type LineageEdge,
  type Neo4jDriverPort,
  Neo4jDriverProjectionAdapter,
  type Neo4jProjectionPort,
  type PostgresGraphProjectionInput,
  type ProvenanceNode,
  projectPostgresSnapshotToNeo4j,
  type RelationshipAssertion,
  type RelationshipAssertionInput,
  validateAcyclicLineage,
} from "./index.js";

const id = (suffix: number): string =>
  `11111111-1111-8111-8111-${suffix.toString().padStart(12, "0")}`;
const ORG = id(1);
const WORKSPACE = id(2);
const COUNTRY = id(3);
const INDICATOR = id(4);
const CONCEPT = id(5);
const OWNER = id(6);
const REVIEWER = id(7);
const APPROVER = id(8);
const SOURCE = id(9);
const MODEL = id(10);
const EVIDENCE = id(11);
const DIAGNOSTIC = id(12);
const BASE_SHA = "a".repeat(64);

function graphNodeInput(
  nodeId: string,
  nodeType: GraphNodeInput["nodeType"],
  canonicalLabel: string,
): GraphNodeInput {
  return {
    schemaVersion: 1,
    organizationId: ORG,
    workspaceId: WORKSPACE,
    nodeId,
    nodeType,
    canonicalLabel,
    ontologyVersion: "1.0.0",
    validTime: { from: "2000-01-01T00:00:00Z", until: null },
    systemTime: { from: "2020-01-01T00:00:00Z", until: null },
    discoveredAt: "2019-12-31T00:00:00Z",
    resolutionStatus: "resolved",
    visibility: "workspace",
  };
}

function evidenceInput(evidenceId = EVIDENCE): ClaimEvidenceInput {
  return {
    schemaVersion: 1,
    organizationId: ORG,
    workspaceId: WORKSPACE,
    evidenceId,
    evidenceType: "observation",
    sourceId: SOURCE,
    sourceVersion: "release-2020-01",
    availableAt: "2019-12-20T00:00:00Z",
    validTime: { from: "2019-01-01T00:00:00Z", until: null },
    systemTime: { from: "2020-01-01T00:00:00Z", until: null },
    contentSha256: BASE_SHA,
    locator: "observation://fixture/1",
    licenseEntitlementSha256: "b".repeat(64),
  };
}

function relationshipInput(
  assertionId = id(20),
  subjectId = COUNTRY,
  objectId = INDICATOR,
): RelationshipAssertionInput {
  return {
    schemaVersion: 1,
    organizationId: ORG,
    workspaceId: WORKSPACE,
    assertionId,
    subjectId,
    predicate: "associated_with",
    objectId,
    validTime: { from: "2010-01-01T00:00:00Z", until: null },
    systemTime: { from: "2020-01-01T00:00:00Z", until: null },
    discoveredAt: "2019-12-31T00:00:00Z",
    discoveryMethod: "manual",
    claimKind: "association",
    causalClassification: "observed_association",
    method: {
      name: "dated descriptive comparison",
      version: "1.0.0",
      identificationStrategy: null,
      diagnosticEvidenceIds: [],
      limitations: ["Association is not a causal estimate."],
    },
    scope: {
      description: "Synthetic contract fixture only; no empirical claim.",
      population: "Fixture population",
      temporalFrom: "2010-01-01T00:00:00Z",
      temporalUntil: null,
      horizonDays: null,
    },
    assumptions: ["The fixture is used only to test contract behavior."],
    evidenceIds: [EVIDENCE],
    ownerId: OWNER,
    status: "proposed",
    effect: {
      direction: "unknown",
      strength: null,
      strengthUnit: null,
      strengthScale: "not_estimated",
      lagMinDays: 0,
      lagMaxDays: 0,
      lagDistribution: "not_estimated",
      confidence: "0.5",
      uncertaintyMethod: "qualitative contract fixture",
      uncertainty: [
        {
          kind: "data_measurement",
          description: "Synthetic fixture has no empirical interpretation.",
        },
      ],
    },
    regimeDependence: ["fixture_regime"],
    geographicScope: [COUNTRY],
    sources: {
      modelVersionId: null,
      expertPrincipalId: null,
      sourceVersionId: SOURCE,
    },
    supersedesAssertionId: null,
  };
}

function decision(
  relationship: RelationshipAssertion,
  sequence: number,
  fromStatus: ClaimDecision["fromStatus"],
  toStatus: ClaimDecision["toStatus"],
  decidedBy: string,
  previousDecisionSha256: string | null,
  decidedAt: string,
): ClaimDecision {
  const decisionKind =
    toStatus === "reviewed"
      ? "scientific_review"
      : toStatus === "accepted"
        ? "acceptance"
        : toStatus === "disputed"
          ? "dispute"
          : "deprecation";
  return createClaimDecision({
    schemaVersion: 1,
    organizationId: relationship.organizationId,
    workspaceId: relationship.workspaceId,
    decisionId: id(100 + sequence),
    assertionId: relationship.assertionId,
    sequence,
    fromStatus,
    toStatus,
    decisionKind,
    decidedBy,
    decidedAt,
    rationale: `Fixture ${decisionKind} with explicit rationale.`,
    evidenceIds: relationship.evidenceIds,
    previousDecisionSha256,
  });
}

function acceptedLedger(relationship: RelationshipAssertion): ClaimDecisionLedger {
  let ledger = createClaimDecisionLedger(relationship);
  const reviewed = decision(
    relationship,
    1,
    "proposed",
    "reviewed",
    REVIEWER,
    null,
    "2020-02-01T00:00:00Z",
  );
  ledger = appendClaimDecision(ledger, reviewed);
  ledger = appendClaimDecision(
    ledger,
    decision(
      relationship,
      2,
      "reviewed",
      "accepted",
      APPROVER,
      reviewed.manifestSha256,
      "2020-03-01T00:00:00Z",
    ),
  );
  return ledger;
}

function causalReplacementInput(source: RelationshipAssertion): RelationshipAssertionInput {
  return {
    ...relationshipInput(id(21), source.subjectId, source.objectId),
    predicate: "causes",
    discoveryMethod: "manual",
    claimKind: "reviewed_causal",
    causalClassification: "econometrically_estimated_causal_effect",
    method: {
      name: "difference-in-differences fixture",
      version: "1.0.0",
      identificationStrategy: "difference_in_differences",
      diagnosticEvidenceIds: [DIAGNOSTIC],
      limitations: ["Synthetic contract fixture; no estimated real-world effect."],
    },
    evidenceIds: [source.evidenceIds[0] ?? EVIDENCE, DIAGNOSTIC],
    sources: {
      modelVersionId: MODEL,
      expertPrincipalId: null,
      sourceVersionId: SOURCE,
    },
    supersedesAssertionId: source.assertionId,
  };
}

function provenanceNode(
  lineageNodeId: string,
  artifactType: ProvenanceNode["artifactType"],
): ProvenanceNode {
  return createProvenanceNode({
    schemaVersion: 1,
    organizationId: ORG,
    workspaceId: WORKSPACE,
    lineageNodeId,
    artifactType,
    artifactId: id(500 + Number(lineageNodeId.slice(-1))),
    artifactSha256: "c".repeat(64),
    label: `${artifactType} fixture`,
    availableAt: "2020-01-01T00:00:00Z",
    systemTime: { from: "2020-01-02T00:00:00Z", until: null },
  });
}

function lineageEdge(
  lineageEdgeId: string,
  fromLineageNodeId: string,
  toLineageNodeId: string,
): LineageEdge {
  return createLineageEdge({
    schemaVersion: 1,
    organizationId: ORG,
    workspaceId: WORKSPACE,
    lineageEdgeId,
    fromLineageNodeId,
    predicate: "transformed_into",
    toLineageNodeId,
    systemTime: { from: "2020-01-02T00:00:00Z", until: null },
    evidenceSha256: "d".repeat(64),
  });
}

describe("canonical causal graph contracts", () => {
  it("exposes the required economic vocabularies without conflating claim classes", () => {
    expect(GRAPH_NODE_TYPES).toEqual(
      expect.arrayContaining([
        "country",
        "city",
        "central_bank",
        "financial_institution",
        "currency",
        "commodity",
        "bond",
        "equity_index",
        "economic_indicator",
        "tariff",
        "sanction",
        "trade_route",
        "supply_chain",
        "economic_concept",
        "crisis",
      ]),
    );
    expect(ECONOMIC_RELATIONSHIP_TYPES).toEqual(
      expect.arrayContaining([
        "causes",
        "contributes_to",
        "depends_on",
        "exports_to",
        "finances",
        "owes",
        "transmits_to",
        "correlated_with",
        "competes_with",
      ]),
    );
    expect(CAUSAL_CLASSIFICATIONS).toHaveLength(7);
  });

  it("seals nodes canonically, freezes them, rejects extra fields, and detects tampering", () => {
    const node = createGraphNode(graphNodeInput(COUNTRY, "country", "Fixture Country"));
    expect(node.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(node)).toBe(true);
    expect(() => assertGraphNodeIntegrity({ ...node, canonicalLabel: "Forged" })).toThrow(
      "digest does not match",
    );
    expect(() =>
      createGraphNode({ ...graphNodeInput(COUNTRY, "country", "Fixture"), surprise: true }),
    ).toThrow("extra: surprise");
    expect(() =>
      createGraphNode({
        ...graphNodeInput(COUNTRY, "country", "Fixture"),
        validTime: { from: "2021-01-01T00:00:00Z", until: "2020-01-01T00:00:00Z" },
      }),
    ).toThrow("half-open and non-empty");
    expect(() =>
      createGraphNode({
        ...graphNodeInput(COUNTRY, "country", "Fixture"),
        discoveredAt: "2021-01-01T00:00:00Z",
      }),
    ).toThrow("cannot be after");
    expect(() => assertGraphNodeIntegrity({ ...node, injected: "field" })).toThrow(
      "extra: injected",
    );
  });

  it("keeps evidence immutable, replay-idempotent, tenant-bound, and tamper evident", () => {
    const item = createClaimEvidence(evidenceInput());
    assertClaimEvidenceIntegrity(item);
    let ledger = createEvidenceLedger(ORG, WORKSPACE);
    ledger = appendEvidence(ledger, item);
    expect(appendEvidence(ledger, item)).toBe(ledger);
    assertEvidenceLedgerIntegrity(ledger);
    const forged = { ...item, locator: "observation://forged" };
    expect(() => assertClaimEvidenceIntegrity(forged)).toThrow("digest does not match");
    const conflicting = createClaimEvidence({ ...evidenceInput(), locator: "observation://other" });
    expect(() => appendEvidence(ledger, conflicting)).toThrow("replay has different content");
    const otherTenant = createClaimEvidence({ ...evidenceInput(id(13)), organizationId: id(999) });
    expect(() => appendEvidence(ledger, otherTenant)).toThrow("cross-tenant");
    expect(() =>
      createClaimEvidence({ ...evidenceInput(), availableAt: "2021-01-01T00:00:00Z" }),
    ).toThrow("cannot be after");
    expect(() =>
      assertEvidenceLedgerIntegrity({ ...ledger, ledgerSha256: "f".repeat(64) }),
    ).toThrow("ledger digest does not match");
  });

  it("canonicalizes set-valued claim fields and enforces causal humility", () => {
    const base = relationshipInput();
    const one = createRelationshipAssertion({
      ...base,
      assumptions: ["Second assumption.", "First assumption."],
      evidenceIds: [id(14), EVIDENCE],
    });
    const two = createRelationshipAssertion({
      ...base,
      assumptions: ["First assumption.", "Second assumption."],
      evidenceIds: [EVIDENCE, id(14)],
    });
    expect(one.manifestSha256).toBe(two.manifestSha256);
    expect(one.assumptions).toEqual(["First assumption.", "Second assumption."]);
    expect(() => createRelationshipAssertion(causalReplacementInput(one))).toThrow(
      "governed causal review transition",
    );
    expect(() =>
      createRelationshipAssertion({
        ...base,
        predicate: "causes",
        claimKind: "hypothesis",
        causalClassification: "hypothesized_causal_pathway",
      }),
    ).toThrow("reserved for governed reviewed causal");
    expect(() =>
      createRelationshipAssertion({ ...base, discoveryMethod: "causal_discovery" }),
    ).toThrow("must remain hypotheses");
    expect(() =>
      createRelationshipAssertion({ ...base, causalClassification: "predictive_relationship" }),
    ).not.toThrow();
    expect(() => createRelationshipAssertion({ ...base, claimKind: "hypothesis" })).toThrow(
      "requires claimKind association",
    );
  });

  it("requires attributable methods, scope, assumptions, evidence and explained uncertainty", () => {
    const base = relationshipInput();
    expect(() => createRelationshipAssertion({ ...base, assumptions: [] })).toThrow(
      "must not be empty",
    );
    expect(() => createRelationshipAssertion({ ...base, evidenceIds: [] })).toThrow(
      "must not be empty",
    );
    expect(() =>
      createRelationshipAssertion({
        ...base,
        method: { ...base.method, surprise: true },
      }),
    ).toThrow("extra: surprise");
    expect(() =>
      createRelationshipAssertion({
        ...base,
        effect: { ...base.effect, uncertainty: [] },
      }),
    ).toThrow("uncertainty must not be empty");
    expect(() =>
      createRelationshipAssertion({
        ...base,
        effect: { ...base.effect, strength: "1.20", strengthUnit: "points" },
      }),
    ).toThrow("canonical exact decimal");
    expect(() =>
      createRelationshipAssertion({
        ...base,
        sources: { modelVersionId: null, expertPrincipalId: null, sourceVersionId: null },
      }),
    ).toThrow("at least one attributable source");
    expect(() =>
      createRelationshipAssertion({
        ...base,
        predicate: "affects",
        claimKind: "hypothesis",
        causalClassification: "expert_defined_relationship",
      }),
    ).toThrow("expertPrincipalId");
    expect(() =>
      assertRelationshipIntegrity({ ...createRelationshipAssertion(base), ownerId: id(99) }),
    ).toThrow("digest does not match");
  });

  it("rejects malformed primitive, enum, temporal, identity and set values at runtime", () => {
    const node = graphNodeInput(COUNTRY, "country", "Fixture");
    expect(() => createGraphNode(null)).toThrow("plain object");
    expect(() => createGraphNode({ ...node, schemaVersion: 2 })).toThrow("must be 1");
    expect(() => createGraphNode({ ...node, organizationId: "UPPER" })).toThrow("lowercase UUID");
    expect(() => createGraphNode({ ...node, nodeType: "planet" })).toThrow("must be one of");
    expect(() => createGraphNode({ ...node, canonicalLabel: 3 })).toThrow("must be a string");
    expect(() => createGraphNode({ ...node, ontologyVersion: "latest" })).toThrow(
      "semantic version",
    );
    expect(() => createGraphNode({ ...node, discoveredAt: "not-an-instant" })).toThrow("RFC 3339");
    expect(() => createGraphNode({ ...node, resolutionStatus: "unknown" })).toThrow(
      "must be one of",
    );
    expect(() =>
      createGraphNode({ ...node, validTime: { from: node.validTime.from, until: 3 } }),
    ).toThrow("must be a string");

    const base = relationshipInput();
    expect(() => createRelationshipAssertion({ ...base, subjectId: base.objectId })).toThrow(
      "must differ",
    );
    expect(() =>
      createRelationshipAssertion({ ...base, supersedesAssertionId: base.assertionId }),
    ).toThrow("cannot supersede itself");
    expect(() =>
      createRelationshipAssertion({ ...base, discoveredAt: "2021-01-01T00:00:00Z" }),
    ).toThrow("cannot be after");
    expect(() =>
      createRelationshipAssertion({
        ...base,
        method: {
          ...base.method,
          identificationStrategy: "event_study",
          diagnosticEvidenceIds: [DIAGNOSTIC],
        },
        evidenceIds: [EVIDENCE, DIAGNOSTIC],
      }),
    ).toThrow("cannot claim reviewed identification");
    expect(() =>
      createRelationshipAssertion({
        ...base,
        scope: {
          ...base.scope,
          temporalUntil: "2009-01-01T00:00:00Z",
          horizonDays: 0,
        },
      }),
    ).toThrow("temporal interval must be non-empty");
    expect(() =>
      createRelationshipAssertion({
        ...base,
        effect: { ...base.effect, strength: "1", strengthUnit: null },
      }),
    ).toThrow("both be set or null");
    expect(() =>
      createRelationshipAssertion({
        ...base,
        effect: { ...base.effect, lagMinDays: 2, lagMaxDays: 1 },
      }),
    ).toThrow("lagMinDays exceeds");
    expect(() =>
      createRelationshipAssertion({
        ...base,
        effect: {
          ...base.effect,
          uncertainty: [base.effect.uncertainty[0], base.effect.uncertainty[0]],
        },
      }),
    ).toThrow("kinds must be unique");
    expect(() =>
      createRelationshipAssertion({ ...base, evidenceIds: [EVIDENCE, EVIDENCE] }),
    ).toThrow("must not contain duplicates");
  });
});

describe("append-only governed claim workflow", () => {
  it("records separated review and approval decisions with replay idempotency", () => {
    const relationship = createRelationshipAssertion(relationshipInput());
    let ledger = createClaimDecisionLedger(relationship);
    const reviewed = decision(
      relationship,
      1,
      "proposed",
      "reviewed",
      REVIEWER,
      null,
      "2020-02-01T00:00:00Z",
    );
    assertClaimDecisionIntegrity(reviewed);
    ledger = appendClaimDecision(ledger, reviewed);
    expect(appendClaimDecision(ledger, reviewed)).toBe(ledger);
    const accepted = decision(
      relationship,
      2,
      "reviewed",
      "accepted",
      APPROVER,
      reviewed.manifestSha256,
      "2020-03-01T00:00:00Z",
    );
    ledger = appendClaimDecision(ledger, accepted);
    expect(ledger.currentStatus).toBe("accepted");
    expect(ledger.decisions).toHaveLength(2);
    assertClaimDecisionLedgerIntegrity(ledger);
    expect(Object.isFrozen(ledger.decisions)).toBe(true);
  });

  it("rejects invalid transitions, role collapse, temporal inversion, and chain tampering", () => {
    const relationship = createRelationshipAssertion(relationshipInput());
    const empty = createClaimDecisionLedger(relationship);
    expect(() =>
      createClaimDecision({
        ...decision(
          relationship,
          1,
          "proposed",
          "reviewed",
          REVIEWER,
          null,
          "2020-02-01T00:00:00Z",
        ),
        manifestSha256: undefined,
      }),
    ).toThrow("extra: manifestSha256");
    const ownerReview = decision(
      relationship,
      1,
      "proposed",
      "reviewed",
      OWNER,
      null,
      "2020-02-01T00:00:00Z",
    );
    expect(() => appendClaimDecision(empty, ownerReview)).toThrow("cannot independently review");
    const predating = decision(
      relationship,
      1,
      "proposed",
      "reviewed",
      REVIEWER,
      null,
      "2019-12-01T00:00:00Z",
    );
    expect(() => appendClaimDecision(empty, predating)).toThrow("cannot predate");
    const validReview = decision(
      relationship,
      1,
      "proposed",
      "reviewed",
      REVIEWER,
      null,
      "2020-02-01T00:00:00Z",
    );
    const { manifestSha256: _validReviewDigest, ...invalidTransition } = validReview;
    expect(() =>
      createClaimDecision({
        ...invalidTransition,
        toStatus: "accepted",
        decisionKind: "acceptance",
      }),
    ).toThrow("proposed -> accepted");
    const accepted = acceptedLedger(relationship);
    expect(() =>
      assertClaimDecisionLedgerIntegrity({ ...accepted, currentStatus: "reviewed" }),
    ).toThrow("currentStatus is incorrect");
    expect(() =>
      assertClaimDecisionLedgerIntegrity({ ...accepted, ledgerSha256: "e".repeat(64) }),
    ).toThrow("ledger digest does not match");
  });

  it("permits reviewed causal language only through an accepted-source review transition", () => {
    const source = createRelationshipAssertion(relationshipInput());
    const sourceLedger = acceptedLedger(source);
    const replacement = causalReplacementInput(source);
    const transitioned = governedCausalReviewTransition(source, sourceLedger, replacement, {
      decisionId: id(200),
      decidedBy: REVIEWER,
      decidedAt: "2020-04-01T00:00:00Z",
      rationale: "Identification assumptions and diagnostics reviewed as a contract fixture.",
      evidenceIds: [DIAGNOSTIC],
    });
    expect(transitioned.relationship.claimKind).toBe("reviewed_causal");
    expect(transitioned.relationship.supersedesAssertionId).toBe(source.assertionId);
    expect(transitioned.decisionLedger.currentStatus).toBe("reviewed");
    expect(transitioned.relationship.method.identificationStrategy).toBe(
      "difference_in_differences",
    );
    expect(() =>
      governedCausalReviewTransition(source, createClaimDecisionLedger(source), replacement, {
        decisionId: id(201),
        decidedBy: REVIEWER,
        decidedAt: "2020-04-01T00:00:00Z",
        rationale: "Not yet governed.",
        evidenceIds: [DIAGNOSTIC],
      }),
    ).toThrow("must be accepted");
    expect(() =>
      governedCausalReviewTransition(source, sourceLedger, replacement, {
        decisionId: id(202),
        decidedBy: OWNER,
        decidedAt: "2020-04-01T00:00:00Z",
        rationale: "Owner attempted self-review.",
        evidenceIds: [DIAGNOSTIC],
      }),
    ).toThrow("independent");
    expect(() =>
      governedCausalReviewTransition(source, sourceLedger, replacement, {
        decisionId: id(203),
        decidedBy: REVIEWER,
        decidedAt: "2020-04-01T00:00:00Z",
        rationale: "Diagnostics omitted.",
        evidenceIds: [EVIDENCE],
      }),
    ).toThrow("cite every identification diagnostic");
    expect(() =>
      governedCausalReviewTransition(source, sourceLedger, replacement, {
        decisionId: id(205),
        decidedBy: REVIEWER,
        decidedAt: "2020-04-01T00:00:00Z",
        rationale: "Unexpected field.",
        evidenceIds: [DIAGNOSTIC],
        unexpected: true,
      } as never),
    ).toThrow("extra: unexpected");
    expect(() =>
      governedCausalReviewTransition(
        source,
        sourceLedger,
        { ...replacement, objectId: CONCEPT },
        {
          decisionId: id(204),
          decidedBy: REVIEWER,
          decidedAt: "2020-04-01T00:00:00Z",
          rationale: "Endpoint changed.",
          evidenceIds: [DIAGNOSTIC],
        },
      ),
    ).toThrow("preserve tenant and relationship endpoints");
  });

  it("fails closed on replay conflicts, foreign decisions, collapsed acceptance, and bad promotion chains", () => {
    const source = createRelationshipAssertion(relationshipInput());
    const review = decision(
      source,
      1,
      "proposed",
      "reviewed",
      REVIEWER,
      null,
      "2020-02-01T00:00:00Z",
    );
    let ledger = appendClaimDecision(createClaimDecisionLedger(source), review);
    const reviewerAcceptance = decision(
      source,
      2,
      "reviewed",
      "accepted",
      REVIEWER,
      review.manifestSha256,
      "2020-03-01T00:00:00Z",
    );
    expect(() => appendClaimDecision(ledger, reviewerAcceptance)).toThrow(
      "separated from ownership and scientific review",
    );
    const { manifestSha256: _reviewDigest, ...reviewBody } = review;
    const conflictingReplay = createClaimDecision({
      ...reviewBody,
      rationale: "Different rationale.",
    });
    expect(() => appendClaimDecision(ledger, conflictingReplay)).toThrow(
      "replay has different content",
    );
    const foreign = createClaimDecision({
      ...reviewBody,
      decisionId: id(211),
      organizationId: id(999),
    });
    expect(() => appendClaimDecision(ledger, foreign)).toThrow("cross-tenant or foreign-claim");
    const broken = createClaimDecision({
      ...reviewBody,
      decisionId: id(212),
      sequence: 3,
      previousDecisionSha256: review.manifestSha256,
    });
    expect(() => appendClaimDecision(ledger, broken)).toThrow("does not continue");

    const accepted = acceptedLedger(source);
    const replacement = causalReplacementInput(source);
    expect(() =>
      governedCausalReviewTransition(
        source,
        accepted,
        { ...replacement, evidenceIds: [DIAGNOSTIC] },
        {
          decisionId: id(213),
          decidedBy: REVIEWER,
          decidedAt: "2020-04-01T00:00:00Z",
          rationale: "Source evidence omitted.",
          evidenceIds: [DIAGNOSTIC],
        },
      ),
    ).toThrow("retain the source evidence chain");
    expect(() =>
      governedCausalReviewTransition(
        source,
        accepted,
        { ...replacement, supersedesAssertionId: null },
        {
          decisionId: id(214),
          decidedBy: REVIEWER,
          decidedAt: "2020-04-01T00:00:00Z",
          rationale: "Missing supersession link.",
          evidenceIds: [DIAGNOSTIC],
        },
      ),
    ).toThrow("linked to its source");

    const disputed = createClaimDecision({
      ...reviewBody,
      decisionId: id(215),
      fromStatus: "reviewed",
      toStatus: "disputed",
      decisionKind: "dispute",
      sequence: 2,
      previousDecisionSha256: review.manifestSha256,
      decidedAt: "2020-03-01T00:00:00Z",
    });
    ledger = appendClaimDecision(ledger, disputed);
    const deprecated = createClaimDecision({
      ...reviewBody,
      decisionId: id(216),
      fromStatus: "disputed",
      toStatus: "deprecated",
      decisionKind: "deprecation",
      sequence: 3,
      previousDecisionSha256: disputed.manifestSha256,
      decidedAt: "2020-04-01T00:00:00Z",
    });
    expect(appendClaimDecision(ledger, deprecated).currentStatus).toBe("deprecated");
  });
});

describe("bounded point-in-time graph exploration and separate lineage", () => {
  function cyclicDataset() {
    const nodes = [
      createGraphNode(graphNodeInput(COUNTRY, "country", "Country")),
      createGraphNode(graphNodeInput(INDICATOR, "economic_indicator", "Indicator")),
      createGraphNode(graphNodeInput(CONCEPT, "economic_concept", "Concept")),
    ];
    const relationships = [
      createRelationshipAssertion(relationshipInput(id(30), COUNTRY, INDICATOR)),
      createRelationshipAssertion(relationshipInput(id(31), INDICATOR, CONCEPT)),
      createRelationshipAssertion(relationshipInput(id(32), CONCEPT, COUNTRY)),
    ];
    return {
      nodes,
      relationships,
      decisions: relationships.map(acceptedLedger),
    };
  }

  function request(overrides: Record<string, unknown> = {}) {
    return {
      schemaVersion: 1,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      startNodeIds: [COUNTRY],
      effectiveAt: "2021-01-01T00:00:00Z",
      knownAt: "2021-01-01T00:00:00Z",
      direction: "both",
      predicates: [],
      statuses: ["accepted"],
      maxDepth: 5,
      maxNodes: 20,
      maxRelationships: 20,
      ...overrides,
    };
  }

  it("allows legitimate causal feedback cycles while terminating deterministically", () => {
    const result = exploreTemporalGraph(cyclicDataset(), request());
    expect(result.nodes.map((node) => node.nodeId)).toEqual([COUNTRY, INDICATOR, CONCEPT].sort());
    expect(result.relationships).toHaveLength(3);
    expect(result.truncated).toBe(false);
    expect(result.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(exploreTemporalGraph(cyclicDataset(), request()).snapshotSha256).toBe(
      result.snapshotSha256,
    );
  });

  it("uses decision time in PIT status and enforces exploration bounds", () => {
    const data = cyclicDataset();
    const beforeReview = exploreTemporalGraph(
      data,
      request({ knownAt: "2020-01-15T00:00:00Z", statuses: ["proposed"] }),
    );
    expect(beforeReview.relationships).toHaveLength(3);
    expect(beforeReview.relationships.every((edge) => edge.status === "proposed")).toBe(true);
    const bounded = exploreTemporalGraph(data, request({ maxNodes: 2, maxRelationships: 1 }));
    expect(bounded.nodes).toHaveLength(2);
    expect(bounded.relationships).toHaveLength(1);
    expect(bounded.truncated).toBe(true);
    expect(() => exploreTemporalGraph(data, request({ maxDepth: 9 }))).toThrow("must be <= 8");
    expect(() => exploreTemporalGraph(data, request({ unknown: true }))).toThrow("extra: unknown");
    expect(() => exploreTemporalGraph({ ...data, unknown: true } as never, request())).toThrow(
      "extra: unknown",
    );
  });

  it("fails closed on unavailable identities, bitemporal overlap, missing governance, and tenants", () => {
    const data = cyclicDataset();
    expect(() => exploreTemporalGraph(data, request({ startNodeIds: [id(999)] }))).toThrow(
      "unavailable at the requested PIT",
    );
    expect(() =>
      exploreTemporalGraph(
        {
          ...data,
          nodes: [
            ...data.nodes,
            { ...(data.nodes[0] as GraphNode), manifestSha256: "0".repeat(64) },
          ],
        },
        request(),
      ),
    ).toThrow("node manifest digest does not match");
    expect(() =>
      exploreTemporalGraph({ ...data, decisions: data.decisions.slice(1) }, request()),
    ).toThrow("requires its matching decision ledger");
    const foreignNode = createGraphNode({
      ...graphNodeInput(id(50), "country", "Foreign"),
      organizationId: id(999),
    });
    expect(() =>
      exploreTemporalGraph({ ...data, nodes: [...data.nodes, foreignNode] }, request()),
    ).toThrow("cross-tenant node");
    const overlapping = createGraphNode({
      ...graphNodeInput(COUNTRY, "country", "Second version"),
      systemTime: { from: "2020-06-01T00:00:00Z", until: null },
    });
    expect(() =>
      exploreTemporalGraph({ ...data, nodes: [...data.nodes, overlapping] }, request()),
    ).toThrow("overlapping system-time versions");
  });

  it("validates provenance as a PIT-aware DAG and rejects lineage cycles separately", () => {
    const source = provenanceNode(id(60), "source");
    const dataset = provenanceNode(id(61), "dataset");
    const observation = provenanceNode(id(62), "observation");
    const edges = [
      lineageEdge(id(70), source.lineageNodeId, dataset.lineageNodeId),
      lineageEdge(id(71), dataset.lineageNodeId, observation.lineageNodeId),
    ];
    const valid = validateAcyclicLineage([source, dataset, observation], edges, {
      schemaVersion: 1,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      knownAt: "2021-01-01T00:00:00Z",
    });
    expect(valid.topologicalOrder).toEqual([
      source.lineageNodeId,
      dataset.lineageNodeId,
      observation.lineageNodeId,
    ]);
    const backEdge = lineageEdge(id(72), observation.lineageNodeId, source.lineageNodeId);
    expect(() =>
      validateAcyclicLineage([source, dataset, observation], [...edges, backEdge], {
        schemaVersion: 1,
        organizationId: ORG,
        workspaceId: WORKSPACE,
        knownAt: "2021-01-01T00:00:00Z",
      }),
    ).toThrow("must be acyclic");
    assertProvenanceNodeIntegrity(source);
    assertLineageEdgeIntegrity(edges[0]);
    expect(() => assertProvenanceNodeIntegrity({ ...source, label: "forged" })).toThrow(
      "digest does not match",
    );
    expect(() => assertLineageEdgeIntegrity({ ...edges[0], predicate: "contains" })).toThrow(
      "digest does not match",
    );
  });
});

describe("PostgreSQL-sourced parameterized Neo4j projection", () => {
  function projectionInput(): PostgresGraphProjectionInput {
    const nodes = [
      createGraphNode(graphNodeInput(COUNTRY, "country", "Country } MATCH (x) DETACH DELETE x")),
      createGraphNode(graphNodeInput(INDICATOR, "economic_indicator", "Indicator")),
    ];
    const relationship = createRelationshipAssertion(relationshipInput());
    const source = provenanceNode(id(80), "source");
    const dataset = provenanceNode(id(81), "dataset");
    return {
      schemaVersion: 1,
      sourceOfTruth: "postgresql",
      organizationId: ORG,
      workspaceId: WORKSPACE,
      effectiveAt: "2021-01-01T00:00:00Z",
      knownAt: "2021-01-01T00:00:00Z",
      sourceSnapshotSha256: "e".repeat(64),
      nodes,
      relationships: [{ relationship, status: "accepted" }],
      provenanceNodes: [source, dataset],
      lineageEdges: [lineageEdge(id(82), source.lineageNodeId, dataset.lineageNodeId)],
    };
  }

  it("builds only fixed Cypher templates and carries all content as parameters", () => {
    const projection = createPostgresGraphProjection(projectionInput());
    assertPostgresGraphProjectionIntegrity(projection);
    const commands = buildNeo4jProjectionCommands(projection);
    expect(commands.map((command) => command.commandName).sort()).toEqual([
      "project_economic_nodes",
      "project_economic_relationships",
      "project_lineage_edges",
      "project_provenance_nodes",
    ]);
    for (const command of commands) {
      expect(command.cypher).toContain("$rows");
      expect(command.cypher).not.toContain("DETACH DELETE");
      expect(Object.isFrozen(command)).toBe(true);
    }
    expect(JSON.stringify(commands[0]?.parameters)).toContain("DETACH DELETE");
  });

  it("executes through the projection port and verifies the tenant-bound receipt", async () => {
    const projection = createPostgresGraphProjection(projectionInput());
    const writeProjection = vi.fn<Neo4jProjectionPort["writeProjection"]>(async (commands) => ({
      organizationId: ORG,
      workspaceId: WORKSPACE,
      projectionSha256: projection.manifestSha256,
      appliedCommandCount: commands.length,
    }));
    const receipt = await projectPostgresSnapshotToNeo4j(projection, { writeProjection });
    expect(receipt.appliedCommandCount).toBe(4);
    expect(writeProjection).toHaveBeenCalledOnce();
    await expect(
      projectPostgresSnapshotToNeo4j(projection, {
        writeProjection: async () => ({
          organizationId: id(999),
          workspaceId: WORKSPACE,
          projectionSha256: projection.manifestSha256,
          appliedCommandCount: 4,
        }),
      }),
    ).rejects.toThrow("does not match the PostgreSQL snapshot");
    await expect(
      projectPostgresSnapshotToNeo4j(projection, {
        writeProjection: async () => ({
          organizationId: ORG,
          workspaceId: WORKSPACE,
          projectionSha256: projection.manifestSha256,
          appliedCommandCount: 1,
        }),
      }),
    ).rejects.toThrow("command count does not match");
  });

  it("fails closed on non-PostgreSQL authority, foreign data, missing endpoints and tampering", () => {
    const input = projectionInput();
    expect(() => createPostgresGraphProjection({ ...input, sourceOfTruth: "neo4j" })).toThrow(
      "PostgreSQL must be declared",
    );
    expect(() =>
      createPostgresGraphProjection({
        ...input,
        nodes: [
          ...input.nodes,
          createGraphNode({
            ...graphNodeInput(id(90), "country", "Foreign"),
            workspaceId: id(999),
          }),
        ],
      }),
    ).toThrow("crosses the projection tenant boundary");
    expect(() =>
      createPostgresGraphProjection({ ...input, nodes: input.nodes.slice(0, 1) }),
    ).toThrow("endpoints must be present");
    const projection = createPostgresGraphProjection(input);
    expect(() =>
      assertPostgresGraphProjectionIntegrity({
        ...projection,
        sourceSnapshotSha256: "f".repeat(64),
      }),
    ).toThrow("digest does not match");
    expect(() => createPostgresGraphProjection({ ...input, unexpected: true })).toThrow(
      "extra: unexpected",
    );
  });

  it("supports an empty bounded snapshot without synthesizing graph content", async () => {
    const projection = createPostgresGraphProjection({
      ...projectionInput(),
      nodes: [],
      relationships: [],
      provenanceNodes: [],
      lineageEdges: [],
    });
    expect(buildNeo4jProjectionCommands(projection)).toEqual([]);
    const receipt = await projectPostgresSnapshotToNeo4j(projection, {
      writeProjection: async (commands) => ({
        organizationId: ORG,
        workspaceId: WORKSPACE,
        projectionSha256: projection.manifestSha256,
        appliedCommandCount: commands.length,
      }),
    });
    expect(receipt.appliedCommandCount).toBe(0);
  });

  it("executes fixed commands atomically through a tenant-bound Neo4j driver adapter", async () => {
    const projection = createPostgresGraphProjection(projectionInput());
    const run = vi.fn(async (_cypher: string, _parameters: Readonly<Record<string, unknown>>) => ({
      records: [],
    }));
    const close = vi.fn(async () => undefined);
    const executeWrite = vi.fn(async (operation: (transaction: { run: typeof run }) => unknown) =>
      operation({ run }),
    );
    const session = vi.fn(() => ({ executeWrite, close }));
    const adapter = new Neo4jDriverProjectionAdapter({ session } as unknown as Neo4jDriverPort, {
      database: "economyos",
    });

    const receipt = await projectPostgresSnapshotToNeo4j(projection, adapter);

    expect(receipt).toEqual({
      organizationId: ORG,
      workspaceId: WORKSPACE,
      projectionSha256: projection.manifestSha256,
      appliedCommandCount: 4,
    });
    expect(session).toHaveBeenCalledWith({ database: "economyos", defaultAccessMode: "WRITE" });
    expect(executeWrite).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledTimes(4);
    expect(close).toHaveBeenCalledOnce();
    expect(Object.isFrozen(receipt)).toBe(true);
    for (const [, parameters] of run.mock.calls) {
      const rows = parameters?.rows;
      if (!Array.isArray(rows)) throw new Error("expected parameterized Neo4j rows");
      expect(rows[0]).toMatchObject({
        organizationId: ORG,
        workspaceId: WORKSPACE,
        projectionSha256: projection.manifestSha256,
      });
    }
  });

  it("rejects dynamic or cross-tenant Cypher and always closes failed write sessions", async () => {
    const projection = createPostgresGraphProjection(projectionInput());
    const commands = buildNeo4jProjectionCommands(projection);
    const session = vi.fn(() => ({
      executeWrite: async (operation: (transaction: { run: () => Promise<never> }) => unknown) =>
        operation({ run: async () => Promise.reject(new Error("neo4j unavailable")) }),
      close: vi.fn(async () => undefined),
    }));
    const adapter = new Neo4jDriverProjectionAdapter({ session } as unknown as Neo4jDriverPort, {
      database: "economyos",
    });
    const context = {
      organizationId: ORG,
      workspaceId: WORKSPACE,
      projectionSha256: projection.manifestSha256,
    };
    const first = commands[0];
    if (!first) throw new Error("expected node projection command");

    await expect(
      adapter.writeProjection([{ ...first, cypher: "MATCH (n) DETACH DELETE n" }], context),
    ).rejects.toThrow("fixed templates");
    const foreignCommand = structuredClone(first) as unknown as {
      commandName: typeof first.commandName;
      cypher: string;
      parameters: { rows: Array<Record<string, unknown>> };
    };
    const foreignRow = foreignCommand.parameters.rows[0];
    if (!foreignRow) throw new Error("expected node projection row");
    foreignRow.organizationId = id(999);
    await expect(
      adapter.writeProjection([foreignCommand as unknown as typeof first], context),
    ).rejects.toThrow("tenant or snapshot boundary");
    const protectedProperty = structuredClone(first) as unknown as {
      commandName: typeof first.commandName;
      cypher: string;
      parameters: { rows: Array<{ properties: Record<string, unknown> }> };
    };
    const protectedRow = protectedProperty.parameters.rows[0];
    if (!protectedRow) throw new Error("expected node projection row");
    protectedRow.properties.organizationId = id(999);
    await expect(
      adapter.writeProjection([protectedProperty as unknown as typeof first], context),
    ).rejects.toThrow("extra: organizationId");
    expect(session).not.toHaveBeenCalled();

    await expect(projectPostgresSnapshotToNeo4j(projection, adapter)).rejects.toThrow(
      "neo4j unavailable",
    );
    expect(session).toHaveBeenCalledOnce();
    expect(session.mock.results[0]?.value.close).toHaveBeenCalledOnce();
    expect(
      () =>
        new Neo4jDriverProjectionAdapter({ session } as unknown as Neo4jDriverPort, {
          database: "Bad Database",
        }),
    ).toThrow("bounded stable lowercase key");
  });

  it("does not open a Neo4j session for a valid empty projection", async () => {
    const session = vi.fn();
    const adapter = new Neo4jDriverProjectionAdapter({ session } as unknown as Neo4jDriverPort, {
      database: "economyos",
    });
    const projection = createPostgresGraphProjection({
      ...projectionInput(),
      nodes: [],
      relationships: [],
      provenanceNodes: [],
      lineageEdges: [],
    });

    const receipt = await projectPostgresSnapshotToNeo4j(projection, adapter);

    expect(receipt.appliedCommandCount).toBe(0);
    expect(session).not.toHaveBeenCalled();
  });
});
