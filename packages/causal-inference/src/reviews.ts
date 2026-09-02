import {
  assertExactKeys,
  assertIsoInstant,
  assertRecord,
  assertSha256,
  assertSorted,
  assertText,
  assertUuid,
  cloneCanonical,
  compareInstant,
  deepFreeze,
  digestJson,
  expectArray,
  expectInteger,
  expectString,
  sortedUnique,
} from "./internals.js";
import { assertCausalAnalysisResultIntegrity, type CausalAnalysisResult } from "./results.js";

export type IndependentReviewRole = "independent_validator" | "model_risk_manager";
export type ReviewDecisionKind = "approve" | "reject" | "request_changes";
export type ReviewStatus = "approved" | "changes_requested" | "pending" | "rejected";

export interface IndependentReviewDecisionInput {
  readonly schemaVersion: 1;
  readonly decisionId: string;
  readonly resultId: string;
  readonly resultSha256: string;
  readonly sequence: number;
  readonly role: IndependentReviewRole;
  readonly decision: ReviewDecisionKind;
  readonly reviewerId: string;
  readonly decidedAt: string;
  readonly rationale: string;
  readonly evidenceSha256: readonly string[];
  readonly previousDecisionSha256: string | null;
}

export interface IndependentReviewDecision extends IndependentReviewDecisionInput {
  readonly decisionSha256: string;
}

export interface IndependentReviewLedger {
  readonly schemaVersion: 1;
  readonly ledgerId: string;
  readonly resultId: string;
  readonly resultSha256: string;
  readonly excludedReviewerIds: readonly string[];
  readonly openedAt: string;
  readonly currentStatus: ReviewStatus;
  readonly decisions: readonly IndependentReviewDecision[];
  readonly ledgerSha256: string;
}

const DECISION_KEYS = [
  "schemaVersion",
  "decisionId",
  "resultId",
  "resultSha256",
  "sequence",
  "role",
  "decision",
  "reviewerId",
  "decidedAt",
  "rationale",
  "evidenceSha256",
  "previousDecisionSha256",
] as const;

function parseDecisionBody(value: unknown): IndependentReviewDecisionInput {
  assertRecord(value, "independentReview.decision");
  assertExactKeys(value, DECISION_KEYS, "independentReview.decision");
  if (value.schemaVersion !== 1) throw new TypeError("review decision schemaVersion must be 1");
  const decisionId = expectString(value.decisionId, "independentReview.decisionId");
  const resultId = expectString(value.resultId, "independentReview.resultId");
  const resultSha256 = expectString(value.resultSha256, "independentReview.resultSha256");
  const role = expectString(value.role, "independentReview.role");
  const decision = expectString(value.decision, "independentReview.decision");
  const reviewerId = expectString(value.reviewerId, "independentReview.reviewerId");
  const decidedAt = expectString(value.decidedAt, "independentReview.decidedAt");
  const rationale = expectString(value.rationale, "independentReview.rationale");
  for (const [field, id] of [
    ["decisionId", decisionId],
    ["resultId", resultId],
    ["reviewerId", reviewerId],
  ] as const) {
    assertUuid(id, `independentReview.${field}`);
  }
  assertSha256(resultSha256, "independentReview.resultSha256");
  if (role !== "independent_validator" && role !== "model_risk_manager") {
    throw new TypeError("review role must be independent_validator or model_risk_manager");
  }
  if (decision !== "approve" && decision !== "reject" && decision !== "request_changes") {
    throw new TypeError("review decision is not allowed");
  }
  assertIsoInstant(decidedAt, "independentReview.decidedAt");
  assertText(rationale, "independentReview.rationale", 4_000);
  const evidenceSha256 = sortedUnique(
    expectArray(value.evidenceSha256, "independentReview.evidenceSha256").map((item, index) =>
      expectString(item, `independentReview.evidenceSha256[${index}]`),
    ),
    "independentReview.evidenceSha256",
    assertSha256,
  );
  const previousDecisionSha256 =
    value.previousDecisionSha256 === null
      ? null
      : expectString(value.previousDecisionSha256, "independentReview.previousDecisionSha256");
  if (previousDecisionSha256 !== null) {
    assertSha256(previousDecisionSha256, "independentReview.previousDecisionSha256");
  }
  return {
    schemaVersion: 1,
    decisionId,
    resultId,
    resultSha256,
    sequence: expectInteger(value.sequence, "independentReview.sequence", 1, 1_000_000),
    role,
    decision,
    reviewerId,
    decidedAt,
    rationale,
    evidenceSha256,
    previousDecisionSha256,
  };
}

export function createIndependentReviewDecision(
  value: unknown,
): Readonly<IndependentReviewDecision> {
  const body = cloneCanonical(parseDecisionBody(value));
  return deepFreeze({ ...body, decisionSha256: digestJson(body) });
}

export function assertIndependentReviewDecisionIntegrity(
  value: unknown,
): asserts value is IndependentReviewDecision {
  assertRecord(value, "independentReview.decision");
  assertExactKeys(value, [...DECISION_KEYS, "decisionSha256"], "independentReview.decision");
  const decisionSha256 = expectString(value.decisionSha256, "independentReview.decisionSha256");
  assertSha256(decisionSha256, "independentReview.decisionSha256");
  const body = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "decisionSha256"),
  );
  const parsed = parseDecisionBody(body);
  assertSorted(parsed.evidenceSha256, "independentReview.evidenceSha256");
  if (digestJson(parsed) !== decisionSha256) {
    throw new TypeError("independent review decision digest does not match");
  }
}

export interface OpenReviewLedgerInput {
  readonly ledgerId: string;
  readonly result: CausalAnalysisResult;
  readonly excludedReviewerIds: readonly string[];
  readonly openedAt: string;
}

export function openIndependentReviewLedger(
  input: OpenReviewLedgerInput,
): Readonly<IndependentReviewLedger> {
  assertCausalAnalysisResultIntegrity(input.result);
  assertUuid(input.ledgerId, "independentReview.ledgerId");
  assertIsoInstant(input.openedAt, "independentReview.openedAt");
  if (compareInstant(input.openedAt, input.result.generatedAt) < 0) {
    throw new TypeError("review ledger cannot open before result generation");
  }
  const excludedReviewerIds = sortedUnique(
    input.excludedReviewerIds,
    "independentReview.excludedReviewerIds",
    assertUuid,
  );
  if (!excludedReviewerIds.includes(input.result.analystId)) {
    throw new TypeError("result analyst must be excluded from independent review");
  }
  const body = {
    schemaVersion: 1 as const,
    ledgerId: input.ledgerId,
    resultId: input.result.resultId,
    resultSha256: input.result.resultSha256,
    excludedReviewerIds,
    openedAt: input.openedAt,
    currentStatus: "pending" as const,
    decisions: [] as readonly IndependentReviewDecision[],
  };
  return deepFreeze({ ...body, ledgerSha256: digestJson(body) });
}

function deriveReviewStatus(decisions: readonly IndependentReviewDecision[]): ReviewStatus {
  if (decisions.some((item) => item.decision === "reject")) return "rejected";
  if (decisions.some((item) => item.decision === "request_changes")) return "changes_requested";
  const validator = decisions.find(
    (item) => item.role === "independent_validator" && item.decision === "approve",
  );
  const riskManager = decisions.find(
    (item) => item.role === "model_risk_manager" && item.decision === "approve",
  );
  return validator && riskManager ? "approved" : "pending";
}

export function assertIndependentReviewLedgerIntegrity(
  value: unknown,
): asserts value is IndependentReviewLedger {
  assertRecord(value, "independentReview.ledger");
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "ledgerId",
      "resultId",
      "resultSha256",
      "excludedReviewerIds",
      "openedAt",
      "currentStatus",
      "decisions",
      "ledgerSha256",
    ],
    "independentReview.ledger",
  );
  if (value.schemaVersion !== 1) throw new TypeError("review ledger schemaVersion must be 1");
  const ledgerId = expectString(value.ledgerId, "independentReview.ledgerId");
  const resultId = expectString(value.resultId, "independentReview.resultId");
  const resultSha256 = expectString(value.resultSha256, "independentReview.resultSha256");
  const openedAt = expectString(value.openedAt, "independentReview.openedAt");
  assertUuid(ledgerId, "independentReview.ledgerId");
  assertUuid(resultId, "independentReview.resultId");
  assertSha256(resultSha256, "independentReview.resultSha256");
  assertIsoInstant(openedAt, "independentReview.openedAt");
  const excludedReviewerIds = expectArray(
    value.excludedReviewerIds,
    "independentReview.excludedReviewerIds",
  ).map((item, index) => {
    const id = expectString(item, `independentReview.excludedReviewerIds[${index}]`);
    assertUuid(id, `independentReview.excludedReviewerIds[${index}]`);
    return id;
  });
  assertSorted(excludedReviewerIds, "independentReview.excludedReviewerIds");
  const decisions = expectArray(value.decisions, "independentReview.decisions").map((item) => {
    assertIndependentReviewDecisionIntegrity(item);
    return item;
  });
  let previous: string | null = null;
  let previousTime = openedAt;
  const decisionIds = new Set<string>();
  const reviewerRoles = new Map<string, IndependentReviewRole>();
  for (const [index, decision] of decisions.entries()) {
    if (
      decision.resultId !== resultId ||
      decision.resultSha256 !== resultSha256 ||
      decision.sequence !== index + 1 ||
      decision.previousDecisionSha256 !== previous
    ) {
      throw new TypeError("independent review decision chain is broken");
    }
    if (decisionIds.has(decision.decisionId)) {
      throw new TypeError("independent review decision ID is duplicated");
    }
    decisionIds.add(decision.decisionId);
    if (excludedReviewerIds.includes(decision.reviewerId)) {
      throw new TypeError("excluded principal cannot perform independent review");
    }
    if (compareInstant(decision.decidedAt, previousTime) <= 0) {
      throw new TypeError("review decisions must advance strictly in time");
    }
    const existingRole = reviewerRoles.get(decision.reviewerId);
    if (existingRole && existingRole !== decision.role) {
      throw new TypeError("one reviewer cannot satisfy both independent roles");
    }
    reviewerRoles.set(decision.reviewerId, decision.role);
    previous = decision.decisionSha256;
    previousTime = decision.decidedAt;
  }
  const currentStatus = expectString(value.currentStatus, "independentReview.currentStatus");
  if (currentStatus !== deriveReviewStatus(decisions)) {
    throw new TypeError("independent review ledger status does not match its decisions");
  }
  const body = {
    schemaVersion: 1 as const,
    ledgerId,
    resultId,
    resultSha256,
    excludedReviewerIds,
    openedAt,
    currentStatus: currentStatus as ReviewStatus,
    decisions,
  };
  const ledgerSha256 = expectString(value.ledgerSha256, "independentReview.ledgerSha256");
  assertSha256(ledgerSha256, "independentReview.ledgerSha256");
  if (digestJson(body) !== ledgerSha256) {
    throw new TypeError("independent review ledger digest does not match");
  }
}

export function appendIndependentReviewDecision(
  ledger: IndependentReviewLedger,
  value: unknown,
): Readonly<IndependentReviewLedger> {
  assertIndependentReviewLedgerIntegrity(ledger);
  if (ledger.currentStatus !== "pending") {
    throw new TypeError(`review ledger is terminal in status ${ledger.currentStatus}`);
  }
  const decision = createIndependentReviewDecision(value);
  const previous = ledger.decisions.at(-1);
  if (
    decision.resultId !== ledger.resultId ||
    decision.resultSha256 !== ledger.resultSha256 ||
    decision.sequence !== ledger.decisions.length + 1 ||
    decision.previousDecisionSha256 !== (previous?.decisionSha256 ?? null)
  ) {
    throw new TypeError("review decision does not append to this ledger");
  }
  if (ledger.excludedReviewerIds.includes(decision.reviewerId)) {
    throw new TypeError("analyst, developer, or owner cannot independently review this result");
  }
  if (ledger.decisions.some((item) => item.decisionId === decision.decisionId)) {
    throw new TypeError("independent review decision ID is duplicated");
  }
  if (compareInstant(decision.decidedAt, previous?.decidedAt ?? ledger.openedAt) <= 0) {
    throw new TypeError("review decisions must advance strictly in time");
  }
  const existingRole = ledger.decisions.find(
    (item) => item.reviewerId === decision.reviewerId,
  )?.role;
  if (existingRole && existingRole !== decision.role) {
    throw new TypeError("one reviewer cannot satisfy both independent roles");
  }
  const decisions = [...ledger.decisions, decision];
  const body = {
    schemaVersion: 1 as const,
    ledgerId: ledger.ledgerId,
    resultId: ledger.resultId,
    resultSha256: ledger.resultSha256,
    excludedReviewerIds: [...ledger.excludedReviewerIds],
    openedAt: ledger.openedAt,
    currentStatus: deriveReviewStatus(decisions),
    decisions,
  };
  return deepFreeze({ ...cloneCanonical(body), ledgerSha256: digestJson(body) });
}
