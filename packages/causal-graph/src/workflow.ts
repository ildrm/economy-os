import {
  assertRelationshipIntegrity,
  createReviewedRelationshipAfterGovernedReview,
  type RelationshipAssertion,
  type RelationshipAssertionInput,
} from "./contracts.js";
import {
  assertExactKeys,
  assertIsoInstant,
  assertNonBlank,
  assertRecord,
  assertSha256,
  assertUuid,
  cloneCanonical,
  compareInstant,
  deepFreeze,
  digestJson,
  expectArray,
  expectInteger,
  expectNullableString,
  expectString,
  uniqueSortedStrings,
} from "./internals.js";

export type ClaimStatus = "accepted" | "deprecated" | "disputed" | "proposed" | "reviewed";
export type ClaimDecisionKind = "acceptance" | "deprecation" | "dispute" | "scientific_review";

export interface ClaimDecisionInput {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly decisionId: string;
  readonly assertionId: string;
  readonly sequence: number;
  readonly fromStatus: ClaimStatus;
  readonly toStatus: ClaimStatus;
  readonly decisionKind: ClaimDecisionKind;
  readonly decidedBy: string;
  readonly decidedAt: string;
  readonly rationale: string;
  readonly evidenceIds: readonly string[];
  readonly previousDecisionSha256: string | null;
}

export interface ClaimDecision extends ClaimDecisionInput {
  readonly manifestSha256: string;
}

export interface ClaimDecisionLedger {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly assertionId: string;
  readonly assertionSha256: string;
  readonly ownerId: string;
  readonly assertionRecordedAt: string;
  readonly currentStatus: ClaimStatus;
  readonly decisions: readonly ClaimDecision[];
  readonly ledgerSha256: string;
}

export interface CausalReviewDecision {
  readonly decisionId: string;
  readonly decidedBy: string;
  readonly decidedAt: string;
  readonly rationale: string;
  readonly evidenceIds: readonly string[];
}

export interface GovernedCausalTransition {
  readonly relationship: Readonly<RelationshipAssertion>;
  readonly decisionLedger: Readonly<ClaimDecisionLedger>;
}

const STATUS_VALUES = ["accepted", "deprecated", "disputed", "proposed", "reviewed"] as const;
const DECISION_KINDS = ["acceptance", "deprecation", "dispute", "scientific_review"] as const;
const DECISION_INPUT_KEYS = [
  "schemaVersion",
  "organizationId",
  "workspaceId",
  "decisionId",
  "assertionId",
  "sequence",
  "fromStatus",
  "toStatus",
  "decisionKind",
  "decidedBy",
  "decidedAt",
  "rationale",
  "evidenceIds",
  "previousDecisionSha256",
] as const;

function enumValue<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
  field: string,
): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new TypeError(`${field} must be one of: ${values.join(", ")}`);
  }
  return value as Values[number];
}

function assertTransition(
  fromStatus: ClaimStatus,
  toStatus: ClaimStatus,
  decisionKind: ClaimDecisionKind,
): void {
  const expectedKind =
    toStatus === "reviewed"
      ? "scientific_review"
      : toStatus === "accepted"
        ? "acceptance"
        : toStatus === "disputed"
          ? "dispute"
          : toStatus === "deprecated"
            ? "deprecation"
            : null;
  if (expectedKind === null || decisionKind !== expectedKind) {
    throw new TypeError(`decision kind ${decisionKind} cannot transition to ${toStatus}`);
  }
  const allowed =
    (fromStatus === "proposed" && (toStatus === "reviewed" || toStatus === "disputed")) ||
    (fromStatus === "reviewed" &&
      (toStatus === "accepted" || toStatus === "disputed" || toStatus === "deprecated")) ||
    (fromStatus === "accepted" && (toStatus === "disputed" || toStatus === "deprecated")) ||
    (fromStatus === "disputed" && (toStatus === "reviewed" || toStatus === "deprecated"));
  if (!allowed) throw new TypeError(`claim transition ${fromStatus} -> ${toStatus} is not allowed`);
}

function parseDecisionInput(value: unknown): ClaimDecisionInput {
  assertRecord(value, "decision");
  assertExactKeys(value, DECISION_INPUT_KEYS, "decision");
  if (value.schemaVersion !== 1) throw new TypeError("decision.schemaVersion must be 1");
  const organizationId = expectString(value.organizationId, "decision.organizationId");
  const workspaceId = expectString(value.workspaceId, "decision.workspaceId");
  const decisionId = expectString(value.decisionId, "decision.decisionId");
  const assertionId = expectString(value.assertionId, "decision.assertionId");
  const decidedBy = expectString(value.decidedBy, "decision.decidedBy");
  for (const [field, id] of [
    ["organizationId", organizationId],
    ["workspaceId", workspaceId],
    ["decisionId", decisionId],
    ["assertionId", assertionId],
    ["decidedBy", decidedBy],
  ] as const) {
    assertUuid(id, `decision.${field}`);
  }
  const fromStatus = enumValue(value.fromStatus, STATUS_VALUES, "decision.fromStatus");
  const toStatus = enumValue(value.toStatus, STATUS_VALUES, "decision.toStatus");
  const decisionKind = enumValue(value.decisionKind, DECISION_KINDS, "decision.decisionKind");
  assertTransition(fromStatus, toStatus, decisionKind);
  const decidedAt = expectString(value.decidedAt, "decision.decidedAt");
  const rationale = expectString(value.rationale, "decision.rationale");
  assertIsoInstant(decidedAt, "decision.decidedAt");
  assertNonBlank(rationale, "decision.rationale", 2_000);
  const previousDecisionSha256 = expectNullableString(
    value.previousDecisionSha256,
    "decision.previousDecisionSha256",
  );
  if (previousDecisionSha256 !== null) {
    assertSha256(previousDecisionSha256, "decision.previousDecisionSha256");
  }
  return {
    schemaVersion: 1,
    organizationId,
    workspaceId,
    decisionId,
    assertionId,
    sequence: expectInteger(value.sequence, "decision.sequence", 1),
    fromStatus,
    toStatus,
    decisionKind,
    decidedBy,
    decidedAt,
    rationale,
    evidenceIds: uniqueSortedStrings(
      expectArray(value.evidenceIds, "decision.evidenceIds"),
      "decision.evidenceIds",
      assertUuid,
      false,
    ),
    previousDecisionSha256,
  };
}

export function createClaimDecision(value: unknown): Readonly<ClaimDecision> {
  const body = cloneCanonical(parseDecisionInput(value));
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function assertClaimDecisionIntegrity(value: unknown): asserts value is ClaimDecision {
  assertRecord(value, "decision");
  assertExactKeys(value, [...DECISION_INPUT_KEYS, "manifestSha256"], "decision");
  const manifestSha256 = expectString(value.manifestSha256, "decision.manifestSha256");
  assertSha256(manifestSha256, "decision.manifestSha256");
  const body = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "manifestSha256"),
  );
  const parsed = parseDecisionInput(body);
  if (digestJson(parsed) !== manifestSha256) {
    throw new TypeError("claim decision manifest digest does not match");
  }
}

export function createClaimDecisionLedger(
  relationship: RelationshipAssertion,
): Readonly<ClaimDecisionLedger> {
  assertRelationshipIntegrity(relationship);
  const body = {
    schemaVersion: 1 as const,
    organizationId: relationship.organizationId,
    workspaceId: relationship.workspaceId,
    assertionId: relationship.assertionId,
    assertionSha256: relationship.manifestSha256,
    ownerId: relationship.ownerId,
    assertionRecordedAt: relationship.systemTime.from,
    currentStatus: "proposed" as const,
    decisions: [],
  };
  return deepFreeze({ ...body, ledgerSha256: digestJson(body) });
}

export function assertClaimDecisionLedgerIntegrity(
  value: unknown,
): asserts value is ClaimDecisionLedger {
  assertRecord(value, "decisionLedger");
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "organizationId",
      "workspaceId",
      "assertionId",
      "assertionSha256",
      "ownerId",
      "assertionRecordedAt",
      "currentStatus",
      "decisions",
      "ledgerSha256",
    ],
    "decisionLedger",
  );
  if (value.schemaVersion !== 1) throw new TypeError("decisionLedger.schemaVersion must be 1");
  const organizationId = expectString(value.organizationId, "decisionLedger.organizationId");
  const workspaceId = expectString(value.workspaceId, "decisionLedger.workspaceId");
  const assertionId = expectString(value.assertionId, "decisionLedger.assertionId");
  const assertionSha256 = expectString(value.assertionSha256, "decisionLedger.assertionSha256");
  const ownerId = expectString(value.ownerId, "decisionLedger.ownerId");
  const assertionRecordedAt = expectString(
    value.assertionRecordedAt,
    "decisionLedger.assertionRecordedAt",
  );
  for (const [field, id] of [
    ["organizationId", organizationId],
    ["workspaceId", workspaceId],
    ["assertionId", assertionId],
    ["ownerId", ownerId],
  ] as const) {
    assertUuid(id, `decisionLedger.${field}`);
  }
  assertSha256(assertionSha256, "decisionLedger.assertionSha256");
  assertIsoInstant(assertionRecordedAt, "decisionLedger.assertionRecordedAt");
  const currentStatus = enumValue(
    value.currentStatus,
    STATUS_VALUES,
    "decisionLedger.currentStatus",
  );
  const decisions = expectArray(value.decisions, "decisionLedger.decisions");
  let derivedStatus: ClaimStatus = "proposed";
  let previousDigest: string | null = null;
  let previousAt: string | null = null;
  let reviewer: string | null = null;
  const ids = new Set<string>();
  for (const [index, decision] of decisions.entries()) {
    assertClaimDecisionIntegrity(decision);
    if (
      decision.organizationId !== organizationId ||
      decision.workspaceId !== workspaceId ||
      decision.assertionId !== assertionId
    ) {
      throw new TypeError("decision ledger contains a cross-tenant or foreign-claim decision");
    }
    if (decision.sequence !== index + 1) throw new TypeError("decision sequence is not contiguous");
    if (decision.fromStatus !== derivedStatus)
      throw new TypeError("decision status chain is broken");
    if (decision.previousDecisionSha256 !== previousDigest) {
      throw new TypeError("decision digest chain is broken");
    }
    if (previousAt !== null && compareInstant(previousAt, decision.decidedAt) >= 0) {
      throw new TypeError("claim decisions must have strictly increasing decision times");
    }
    if (compareInstant(decision.decidedAt, assertionRecordedAt) < 0) {
      throw new TypeError("claim decision cannot predate the relationship system record");
    }
    if (ids.has(decision.decisionId))
      throw new TypeError("decision ledger contains a duplicate ID");
    if (decision.decisionKind === "scientific_review") {
      if (decision.decidedBy === ownerId) {
        throw new TypeError("claim owner cannot independently review their own claim");
      }
      reviewer = decision.decidedBy;
    }
    if (
      decision.decisionKind === "acceptance" &&
      (decision.decidedBy === ownerId || decision.decidedBy === reviewer)
    ) {
      throw new TypeError(
        "claim acceptance must be separated from ownership and scientific review",
      );
    }
    ids.add(decision.decisionId);
    derivedStatus = decision.toStatus;
    previousDigest = decision.manifestSha256;
    previousAt = decision.decidedAt;
  }
  if (derivedStatus !== currentStatus)
    throw new TypeError("decisionLedger.currentStatus is incorrect");
  const ledgerSha256 = expectString(value.ledgerSha256, "decisionLedger.ledgerSha256");
  assertSha256(ledgerSha256, "decisionLedger.ledgerSha256");
  const body = {
    schemaVersion: 1 as const,
    organizationId,
    workspaceId,
    assertionId,
    assertionSha256,
    ownerId,
    assertionRecordedAt,
    currentStatus,
    decisions,
  };
  if (digestJson(body) !== ledgerSha256) {
    throw new TypeError("claim decision ledger digest does not match");
  }
}

export function appendClaimDecision(
  ledger: ClaimDecisionLedger,
  decision: ClaimDecision,
): Readonly<ClaimDecisionLedger> {
  assertClaimDecisionLedgerIntegrity(ledger);
  assertClaimDecisionIntegrity(decision);
  if (
    decision.organizationId !== ledger.organizationId ||
    decision.workspaceId !== ledger.workspaceId ||
    decision.assertionId !== ledger.assertionId
  ) {
    throw new TypeError("cannot append a cross-tenant or foreign-claim decision");
  }
  const replay = ledger.decisions.find((existing) => existing.decisionId === decision.decisionId);
  if (replay !== undefined) {
    if (replay.manifestSha256 !== decision.manifestSha256) {
      throw new TypeError("decision ID replay has different content");
    }
    return ledger;
  }
  const previous = ledger.decisions.at(-1) ?? null;
  if (
    decision.sequence !== ledger.decisions.length + 1 ||
    decision.fromStatus !== ledger.currentStatus ||
    decision.previousDecisionSha256 !== (previous === null ? null : previous.manifestSha256)
  ) {
    throw new TypeError("decision does not continue the current append-only claim chain");
  }
  const body = {
    schemaVersion: 1 as const,
    organizationId: ledger.organizationId,
    workspaceId: ledger.workspaceId,
    assertionId: ledger.assertionId,
    assertionSha256: ledger.assertionSha256,
    ownerId: ledger.ownerId,
    assertionRecordedAt: ledger.assertionRecordedAt,
    currentStatus: decision.toStatus,
    decisions: [...ledger.decisions, decision],
  };
  const next = deepFreeze({ ...cloneCanonical(body), ledgerSha256: digestJson(body) });
  assertClaimDecisionLedgerIntegrity(next);
  return next;
}

export function governedCausalReviewTransition(
  source: RelationshipAssertion,
  sourceLedger: ClaimDecisionLedger,
  replacementInput: RelationshipAssertionInput,
  review: CausalReviewDecision,
): GovernedCausalTransition {
  assertRelationshipIntegrity(source);
  assertClaimDecisionLedgerIntegrity(sourceLedger);
  assertRecord(review, "causalReview");
  assertExactKeys(
    review,
    ["decisionId", "decidedBy", "decidedAt", "rationale", "evidenceIds"],
    "causalReview",
  );
  if (
    sourceLedger.assertionId !== source.assertionId ||
    sourceLedger.assertionSha256 !== source.manifestSha256
  ) {
    throw new TypeError("source decision ledger does not belong to the source relationship");
  }
  if (source.claimKind === "reviewed_causal") {
    throw new TypeError("a reviewed causal relationship does not require causal promotion");
  }
  if (sourceLedger.currentStatus !== "accepted") {
    throw new TypeError("source association or hypothesis must be accepted before causal review");
  }
  if (
    replacementInput.organizationId !== source.organizationId ||
    replacementInput.workspaceId !== source.workspaceId ||
    replacementInput.subjectId !== source.subjectId ||
    replacementInput.objectId !== source.objectId
  ) {
    throw new TypeError(
      "causal review replacement must preserve tenant and relationship endpoints",
    );
  }
  if (
    replacementInput.claimKind !== "reviewed_causal" ||
    replacementInput.causalClassification !== "econometrically_estimated_causal_effect" ||
    replacementInput.supersedesAssertionId !== source.assertionId
  ) {
    throw new TypeError(
      "causal review must create an econometrically estimated replacement linked to its source",
    );
  }
  for (const evidenceId of source.evidenceIds) {
    if (!replacementInput.evidenceIds.includes(evidenceId)) {
      throw new TypeError("causal review replacement must retain the source evidence chain");
    }
  }
  if (review.decidedBy === replacementInput.ownerId) {
    throw new TypeError("causal reviewer must be independent from the replacement owner");
  }
  for (const diagnosticId of replacementInput.method.diagnosticEvidenceIds) {
    if (!review.evidenceIds.includes(diagnosticId)) {
      throw new TypeError("causal review decision must cite every identification diagnostic");
    }
  }
  const relationship = createReviewedRelationshipAfterGovernedReview(replacementInput);
  let decisionLedger = createClaimDecisionLedger(relationship);
  decisionLedger = appendClaimDecision(
    decisionLedger,
    createClaimDecision({
      schemaVersion: 1,
      organizationId: relationship.organizationId,
      workspaceId: relationship.workspaceId,
      decisionId: review.decisionId,
      assertionId: relationship.assertionId,
      sequence: 1,
      fromStatus: "proposed",
      toStatus: "reviewed",
      decisionKind: "scientific_review",
      decidedBy: review.decidedBy,
      decidedAt: review.decidedAt,
      rationale: review.rationale,
      evidenceIds: review.evidenceIds,
      previousDecisionSha256: null,
    }),
  );
  return deepFreeze({ relationship, decisionLedger });
}
