import { assertExtractedClaimIntegrity, type ExtractedClaim } from "./artifacts.js";
import {
  assertExactKeys,
  assertIsoInstant,
  assertNonBlank,
  assertRecord,
  assertSameTenant,
  assertSha256,
  assertUuid,
  boundedInteger,
  cloneCanonical,
  compareInstant,
  deepFreeze,
  digestJson,
  enumValue,
  expectArray,
  expectInteger,
  expectNullableString,
  expectString,
  literalOne,
  parseTenant,
  seal,
  uniqueSortedStrings,
  verifyManifest,
} from "./internals.js";

export interface ContradictionGroupInput {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly contradictionGroupId: string;
  readonly claimIds: readonly string[];
  readonly subjectKey: string;
  readonly predicateKey: string;
  readonly detectedAt: string;
  readonly knownAt: string;
  readonly detectionCodeSha256: string;
  readonly detectionConfigSha256: string;
  readonly workflowStatus: "hypothesis";
  readonly adjudication: "unadjudicated";
  readonly limitations: readonly string[];
  readonly invalidationConditions: readonly string[];
}

export interface ContradictionGroup extends ContradictionGroupInput {
  readonly claimManifestSha256s: readonly string[];
  readonly manifestSha256: string;
}

export type ReviewDecisionKind =
  | "confirm_contradiction"
  | "dismiss_contradiction"
  | "request_evidence"
  | "supersede";

export interface AnalystReviewDecisionInput {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly decisionId: string;
  readonly contradictionGroupId: string;
  readonly contradictionGroupManifestSha256: string;
  readonly sequence: number;
  readonly decisionKind: ReviewDecisionKind;
  readonly reviewerPrincipalId: string;
  readonly decidedAt: string;
  readonly rationale: string;
  readonly evidenceClaimIds: readonly string[];
  readonly supersedesDecisionId: string | null;
  readonly independenceAttestationSha256: string;
  readonly previousDecisionSha256: string | null;
}

export interface AnalystReviewDecision extends AnalystReviewDecisionInput {
  readonly manifestSha256: string;
}

export interface ContradictionReviewLedger {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly contradictionGroupId: string;
  readonly contradictionGroupManifestSha256: string;
  readonly contradictionDetectedAt: string;
  readonly claimIds: readonly string[];
  readonly excludedReviewerPrincipalIds: readonly string[];
  readonly decisions: readonly Readonly<AnalystReviewDecision>[];
  readonly manifestSha256: string;
}

export interface ContradictionDetectionRequest {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly knownAt: string;
  readonly maxClaims: number;
  readonly maxGroups: number;
}

export interface ContradictionCandidate {
  readonly claimIds: readonly [string, string];
  readonly subjectKey: string;
  readonly predicateKey: string;
  readonly reason: "opposing_polarity" | "reported_value_disagreement";
  readonly adjudication: "unadjudicated";
  readonly candidateSha256: string;
}

const GROUP_INPUT_KEYS = [
  "schemaVersion",
  "organizationId",
  "workspaceId",
  "contradictionGroupId",
  "claimIds",
  "subjectKey",
  "predicateKey",
  "detectedAt",
  "knownAt",
  "detectionCodeSha256",
  "detectionConfigSha256",
  "workflowStatus",
  "adjudication",
  "limitations",
  "invalidationConditions",
] as const;
const GROUP_KEYS = [...GROUP_INPUT_KEYS, "claimManifestSha256s", "manifestSha256"] as const;
const DECISION_INPUT_KEYS = [
  "schemaVersion",
  "organizationId",
  "workspaceId",
  "decisionId",
  "contradictionGroupId",
  "contradictionGroupManifestSha256",
  "sequence",
  "decisionKind",
  "reviewerPrincipalId",
  "decidedAt",
  "rationale",
  "evidenceClaimIds",
  "supersedesDecisionId",
  "independenceAttestationSha256",
  "previousDecisionSha256",
] as const;
const LEDGER_UNSIGNED_KEYS = [
  "schemaVersion",
  "organizationId",
  "workspaceId",
  "contradictionGroupId",
  "contradictionGroupManifestSha256",
  "contradictionDetectedAt",
  "claimIds",
  "excludedReviewerPrincipalIds",
  "decisions",
] as const;

function contradictionReason(
  left: Readonly<ExtractedClaim>,
  right: Readonly<ExtractedClaim>,
): ContradictionCandidate["reason"] | null {
  const leftFact = left.structuredFact;
  const rightFact = right.structuredFact;
  const validityOverlaps =
    (left.validUntil === null || compareInstant(right.validFrom, left.validUntil) < 0) &&
    (right.validUntil === null || compareInstant(left.validFrom, right.validUntil) < 0);
  if (
    !validityOverlaps ||
    leftFact.subjectKey !== rightFact.subjectKey ||
    leftFact.predicateKey !== rightFact.predicateKey
  ) {
    return null;
  }
  if (
    leftFact.canonicalValue === rightFact.canonicalValue &&
    leftFact.objectKind === rightFact.objectKind &&
    leftFact.unit === rightFact.unit &&
    leftFact.polarity !== rightFact.polarity
  ) {
    return "opposing_polarity";
  }
  if (
    leftFact.polarity === "affirm" &&
    rightFact.polarity === "affirm" &&
    leftFact.objectKind === rightFact.objectKind &&
    leftFact.unit === rightFact.unit &&
    leftFact.canonicalValue !== rightFact.canonicalValue
  ) {
    return "reported_value_disagreement";
  }
  return null;
}

function parseGroupInput(value: unknown): ContradictionGroupInput {
  assertRecord(value, "contradictionGroup");
  assertExactKeys(value, GROUP_INPUT_KEYS, "contradictionGroup");
  const tenant = parseTenant(value, "contradictionGroup");
  const contradictionGroupId = expectString(
    value.contradictionGroupId,
    "contradictionGroup.contradictionGroupId",
  );
  const subjectKey = expectString(value.subjectKey, "contradictionGroup.subjectKey");
  const predicateKey = expectString(value.predicateKey, "contradictionGroup.predicateKey");
  const detectedAt = expectString(value.detectedAt, "contradictionGroup.detectedAt");
  const knownAt = expectString(value.knownAt, "contradictionGroup.knownAt");
  const detectionCodeSha256 = expectString(
    value.detectionCodeSha256,
    "contradictionGroup.detectionCodeSha256",
  );
  const detectionConfigSha256 = expectString(
    value.detectionConfigSha256,
    "contradictionGroup.detectionConfigSha256",
  );
  assertUuid(contradictionGroupId, "contradictionGroup.contradictionGroupId");
  for (const [field, key] of [
    ["subjectKey", subjectKey],
    ["predicateKey", predicateKey],
  ] as const) {
    if (!/^[a-z][a-z0-9_.-]{0,127}$/.test(key)) {
      throw new TypeError(`contradictionGroup.${field} must be a stable lowercase key`);
    }
  }
  assertIsoInstant(detectedAt, "contradictionGroup.detectedAt");
  assertIsoInstant(knownAt, "contradictionGroup.knownAt");
  if (compareInstant(knownAt, detectedAt) > 0) {
    throw new TypeError("contradiction detection cannot occur before its known-at cutoff");
  }
  assertSha256(detectionCodeSha256, "contradictionGroup.detectionCodeSha256");
  assertSha256(detectionConfigSha256, "contradictionGroup.detectionConfigSha256");
  return {
    schemaVersion: literalOne(value.schemaVersion, "contradictionGroup.schemaVersion"),
    ...tenant,
    contradictionGroupId,
    claimIds: uniqueSortedStrings(
      expectArray(value.claimIds, "contradictionGroup.claimIds"),
      "contradictionGroup.claimIds",
      assertUuid,
      false,
    ),
    subjectKey,
    predicateKey,
    detectedAt,
    knownAt,
    detectionCodeSha256,
    detectionConfigSha256,
    workflowStatus: enumValue(
      value.workflowStatus,
      ["hypothesis"] as const,
      "contradictionGroup.workflowStatus",
    ),
    adjudication: enumValue(
      value.adjudication,
      ["unadjudicated"] as const,
      "contradictionGroup.adjudication",
    ),
    limitations: uniqueSortedStrings(
      expectArray(value.limitations, "contradictionGroup.limitations"),
      "contradictionGroup.limitations",
      (item, field) => assertNonBlank(item, field, 1_000),
      false,
    ),
    invalidationConditions: uniqueSortedStrings(
      expectArray(value.invalidationConditions, "contradictionGroup.invalidationConditions"),
      "contradictionGroup.invalidationConditions",
      (item, field) => assertNonBlank(item, field, 1_000),
      false,
    ),
  };
}

export function createContradictionGroup(
  value: unknown,
  claims: readonly Readonly<ExtractedClaim>[],
): Readonly<ContradictionGroup> {
  const parsed = parseGroupInput(value);
  if (parsed.claimIds.length < 2 || parsed.claimIds.length > 100) {
    throw new TypeError("contradiction groups require 2..100 claims");
  }
  const byId = new Map<string, Readonly<ExtractedClaim>>();
  for (const claim of claims) {
    assertExtractedClaimIntegrity(claim);
    assertSameTenant(parsed, claim, "contradiction group claim");
    if (byId.has(claim.claimId))
      throw new TypeError("contradiction group input has duplicate claim IDs");
    byId.set(claim.claimId, claim);
  }
  const selected = parsed.claimIds.map((claimId) => {
    const claim = byId.get(claimId);
    if (claim === undefined) throw new TypeError(`contradiction group has orphan claim ${claimId}`);
    if (
      claim.structuredFact.subjectKey !== parsed.subjectKey ||
      claim.structuredFact.predicateKey !== parsed.predicateKey
    ) {
      throw new TypeError("contradiction group claims must share its subject and predicate keys");
    }
    if (
      compareInstant(claim.extractedAt, parsed.knownAt) > 0 ||
      compareInstant(claim.cutoffs.systemCutoff, parsed.knownAt) > 0
    ) {
      throw new TypeError("contradiction group cannot use claims later than knownAt");
    }
    return claim;
  });
  if (
    !selected.some((left, index) =>
      selected.slice(index + 1).some((right) => contradictionReason(left, right) !== null),
    )
  ) {
    throw new TypeError("contradiction group has no contradictory claim pair");
  }
  return seal({
    ...parsed,
    claimManifestSha256s: selected.map((claim) => claim.manifestSha256).sort(),
  });
}

export function assertContradictionGroupIntegrity(
  value: unknown,
): asserts value is Readonly<ContradictionGroup> {
  assertRecord(value, "contradictionGroup");
  assertExactKeys(value, GROUP_KEYS, "contradictionGroup");
  const manifest = expectString(value.manifestSha256, "contradictionGroup.manifestSha256");
  const claimIds = parseGroupInput(
    Object.fromEntries(GROUP_INPUT_KEYS.map((key) => [key, value[key]])),
  ).claimIds;
  const claimManifests = uniqueSortedStrings(
    expectArray(value.claimManifestSha256s, "contradictionGroup.claimManifestSha256s"),
    "contradictionGroup.claimManifestSha256s",
    assertSha256,
    false,
  );
  if (claimIds.length < 2 || claimIds.length > 100 || claimIds.length !== claimManifests.length) {
    throw new TypeError("contradiction group requires 2..100 one-to-one claim manifests");
  }
  verifyManifest(value, manifest, "contradictionGroup");
}

function parseDecisionInput(value: unknown): AnalystReviewDecisionInput {
  assertRecord(value, "analystReviewDecision");
  assertExactKeys(value, DECISION_INPUT_KEYS, "analystReviewDecision");
  const tenant = parseTenant(value, "analystReviewDecision");
  const decisionId = expectString(value.decisionId, "analystReviewDecision.decisionId");
  const contradictionGroupId = expectString(
    value.contradictionGroupId,
    "analystReviewDecision.contradictionGroupId",
  );
  const contradictionGroupManifestSha256 = expectString(
    value.contradictionGroupManifestSha256,
    "analystReviewDecision.contradictionGroupManifestSha256",
  );
  const reviewerPrincipalId = expectString(
    value.reviewerPrincipalId,
    "analystReviewDecision.reviewerPrincipalId",
  );
  const decidedAt = expectString(value.decidedAt, "analystReviewDecision.decidedAt");
  const rationale = expectString(value.rationale, "analystReviewDecision.rationale");
  const supersedesDecisionId = expectNullableString(
    value.supersedesDecisionId,
    "analystReviewDecision.supersedesDecisionId",
  );
  const independenceAttestationSha256 = expectString(
    value.independenceAttestationSha256,
    "analystReviewDecision.independenceAttestationSha256",
  );
  const previousDecisionSha256 = expectNullableString(
    value.previousDecisionSha256,
    "analystReviewDecision.previousDecisionSha256",
  );
  assertUuid(decisionId, "analystReviewDecision.decisionId");
  assertUuid(contradictionGroupId, "analystReviewDecision.contradictionGroupId");
  assertUuid(reviewerPrincipalId, "analystReviewDecision.reviewerPrincipalId");
  assertSha256(
    contradictionGroupManifestSha256,
    "analystReviewDecision.contradictionGroupManifestSha256",
  );
  assertIsoInstant(decidedAt, "analystReviewDecision.decidedAt");
  assertNonBlank(rationale, "analystReviewDecision.rationale", 2_000);
  if (supersedesDecisionId !== null)
    assertUuid(supersedesDecisionId, "analystReviewDecision.supersedesDecisionId");
  assertSha256(
    independenceAttestationSha256,
    "analystReviewDecision.independenceAttestationSha256",
  );
  if (previousDecisionSha256 !== null)
    assertSha256(previousDecisionSha256, "analystReviewDecision.previousDecisionSha256");
  const decisionKind = enumValue(
    value.decisionKind,
    ["confirm_contradiction", "dismiss_contradiction", "request_evidence", "supersede"] as const,
    "analystReviewDecision.decisionKind",
  );
  if ((decisionKind === "supersede") !== (supersedesDecisionId !== null)) {
    throw new TypeError("only supersede decisions must identify the decision they supersede");
  }
  return {
    schemaVersion: literalOne(value.schemaVersion, "analystReviewDecision.schemaVersion"),
    ...tenant,
    decisionId,
    contradictionGroupId,
    contradictionGroupManifestSha256,
    sequence: expectInteger(value.sequence, "analystReviewDecision.sequence", 1),
    decisionKind,
    reviewerPrincipalId,
    decidedAt,
    rationale,
    evidenceClaimIds: uniqueSortedStrings(
      expectArray(value.evidenceClaimIds, "analystReviewDecision.evidenceClaimIds"),
      "analystReviewDecision.evidenceClaimIds",
      assertUuid,
      false,
    ),
    supersedesDecisionId,
    independenceAttestationSha256,
    previousDecisionSha256,
  };
}

export function createAnalystReviewDecision(value: unknown): Readonly<AnalystReviewDecision> {
  return seal(parseDecisionInput(value));
}

export function assertAnalystReviewDecisionIntegrity(
  value: unknown,
): asserts value is Readonly<AnalystReviewDecision> {
  assertRecord(value, "analystReviewDecision");
  assertExactKeys(value, [...DECISION_INPUT_KEYS, "manifestSha256"], "analystReviewDecision");
  const manifest = expectString(value.manifestSha256, "analystReviewDecision.manifestSha256");
  parseDecisionInput(Object.fromEntries(DECISION_INPUT_KEYS.map((key) => [key, value[key]])));
  verifyManifest(value, manifest, "analystReviewDecision");
}

function ledgerUnsigned(
  value: ContradictionReviewLedger,
): Omit<ContradictionReviewLedger, "manifestSha256"> {
  return {
    schemaVersion: value.schemaVersion,
    organizationId: value.organizationId,
    workspaceId: value.workspaceId,
    contradictionGroupId: value.contradictionGroupId,
    contradictionGroupManifestSha256: value.contradictionGroupManifestSha256,
    contradictionDetectedAt: value.contradictionDetectedAt,
    claimIds: value.claimIds,
    excludedReviewerPrincipalIds: value.excludedReviewerPrincipalIds,
    decisions: value.decisions,
  };
}

export function createContradictionReviewLedger(
  group: Readonly<ContradictionGroup>,
  claims: readonly Readonly<ExtractedClaim>[],
): Readonly<ContradictionReviewLedger> {
  assertContradictionGroupIntegrity(group);
  const byId = new Map<string, Readonly<ExtractedClaim>>();
  for (const claim of claims) {
    assertExtractedClaimIntegrity(claim);
    assertSameTenant(group, claim, "review ledger claim");
    if (byId.has(claim.claimId)) throw new TypeError("review ledger input has duplicate claim IDs");
    byId.set(claim.claimId, claim);
  }
  const selected = group.claimIds.map((claimId) => {
    const claim = byId.get(claimId);
    if (claim === undefined) throw new TypeError(`review ledger has orphan claim ${claimId}`);
    return claim;
  });
  const actualManifests = selected.map((claim) => claim.manifestSha256).sort();
  if (actualManifests.join(":") !== group.claimManifestSha256s.join(":")) {
    throw new TypeError("review ledger claims do not match the contradiction group manifests");
  }
  if (
    !selected.some((left, index) =>
      selected.slice(index + 1).some((right) => contradictionReason(left, right) !== null),
    )
  ) {
    throw new TypeError("review ledger group has no contradictory claim pair");
  }
  return seal({
    schemaVersion: 1 as const,
    organizationId: group.organizationId,
    workspaceId: group.workspaceId,
    contradictionGroupId: group.contradictionGroupId,
    contradictionGroupManifestSha256: group.manifestSha256,
    contradictionDetectedAt: group.detectedAt,
    claimIds: group.claimIds,
    excludedReviewerPrincipalIds: [
      ...new Set(selected.map((claim) => claim.extraction.extractorPrincipalId)),
    ].sort(),
    decisions: [] as readonly Readonly<AnalystReviewDecision>[],
  });
}

export function assertContradictionReviewLedgerIntegrity(
  value: unknown,
): asserts value is Readonly<ContradictionReviewLedger> {
  assertRecord(value, "contradictionReviewLedger");
  assertExactKeys(value, [...LEDGER_UNSIGNED_KEYS, "manifestSha256"], "contradictionReviewLedger");
  const tenant = parseTenant(value, "contradictionReviewLedger");
  if (value.schemaVersion !== 1)
    throw new TypeError("contradictionReviewLedger.schemaVersion must be 1");
  const groupId = expectString(
    value.contradictionGroupId,
    "contradictionReviewLedger.contradictionGroupId",
  );
  const groupManifest = expectString(
    value.contradictionGroupManifestSha256,
    "contradictionReviewLedger.contradictionGroupManifestSha256",
  );
  assertUuid(groupId, "contradictionReviewLedger.contradictionGroupId");
  assertSha256(groupManifest, "contradictionReviewLedger.contradictionGroupManifestSha256");
  const contradictionDetectedAt = expectString(
    value.contradictionDetectedAt,
    "contradictionReviewLedger.contradictionDetectedAt",
  );
  assertIsoInstant(contradictionDetectedAt, "contradictionReviewLedger.contradictionDetectedAt");
  const claimIds = uniqueSortedStrings(
    expectArray(value.claimIds, "contradictionReviewLedger.claimIds"),
    "contradictionReviewLedger.claimIds",
    assertUuid,
    false,
  );
  const excluded = uniqueSortedStrings(
    expectArray(
      value.excludedReviewerPrincipalIds,
      "contradictionReviewLedger.excludedReviewerPrincipalIds",
    ),
    "contradictionReviewLedger.excludedReviewerPrincipalIds",
    assertUuid,
    false,
  );
  const decisions = expectArray(value.decisions, "contradictionReviewLedger.decisions");
  let previous: Readonly<AnalystReviewDecision> | undefined;
  const ids = new Set<string>();
  const superseded = new Set<string>();
  for (const rawDecision of decisions) {
    assertAnalystReviewDecisionIntegrity(rawDecision);
    const decision = rawDecision as Readonly<AnalystReviewDecision>;
    assertSameTenant(tenant, decision, "review decision");
    if (
      decision.contradictionGroupId !== groupId ||
      decision.contradictionGroupManifestSha256 !== groupManifest
    ) {
      throw new TypeError("review decision is not bound to this contradiction group");
    }
    if (decision.sequence !== (previous?.sequence ?? 0) + 1) {
      throw new TypeError("review decision sequence is not contiguous");
    }
    if (decision.previousDecisionSha256 !== (previous?.manifestSha256 ?? null)) {
      throw new TypeError("review decision previous digest chain is invalid");
    }
    if (previous !== undefined && compareInstant(decision.decidedAt, previous.decidedAt) < 0) {
      throw new TypeError("review decision times must be monotonic");
    }
    if (compareInstant(decision.decidedAt, contradictionDetectedAt) < 0) {
      throw new TypeError("review decision cannot predate contradiction detection");
    }
    if (ids.has(decision.decisionId)) throw new TypeError("review decision IDs must be unique");
    if (excluded.includes(decision.reviewerPrincipalId)) {
      throw new TypeError("reviewer is not independent from claim extraction");
    }
    if (decision.evidenceClaimIds.some((claimId) => !claimIds.includes(claimId))) {
      throw new TypeError("review decision cites a claim outside the contradiction group");
    }
    if (decision.supersedesDecisionId !== null) {
      if (
        decision.supersedesDecisionId === decision.decisionId ||
        !ids.has(decision.supersedesDecisionId) ||
        superseded.has(decision.supersedesDecisionId)
      ) {
        throw new TypeError("review decision supersession target is missing or already superseded");
      }
      superseded.add(decision.supersedesDecisionId);
    }
    ids.add(decision.decisionId);
    previous = decision;
  }
  const manifest = expectString(value.manifestSha256, "contradictionReviewLedger.manifestSha256");
  verifyManifest(value, manifest, "contradictionReviewLedger");
}

export function appendAnalystReviewDecision(
  ledger: Readonly<ContradictionReviewLedger>,
  decision: Readonly<AnalystReviewDecision>,
): Readonly<ContradictionReviewLedger> {
  assertContradictionReviewLedgerIntegrity(ledger);
  assertAnalystReviewDecisionIntegrity(decision);
  const next = seal({ ...ledgerUnsigned(ledger), decisions: [...ledger.decisions, decision] });
  assertContradictionReviewLedgerIntegrity(next);
  return next;
}

function parseDetectionRequest(value: unknown): ContradictionDetectionRequest {
  assertRecord(value, "contradictionDetectionRequest");
  assertExactKeys(
    value,
    ["schemaVersion", "organizationId", "workspaceId", "knownAt", "maxClaims", "maxGroups"],
    "contradictionDetectionRequest",
  );
  const tenant = parseTenant(value, "contradictionDetectionRequest");
  const knownAt = expectString(value.knownAt, "contradictionDetectionRequest.knownAt");
  assertIsoInstant(knownAt, "contradictionDetectionRequest.knownAt");
  return {
    schemaVersion: literalOne(value.schemaVersion, "contradictionDetectionRequest.schemaVersion"),
    ...tenant,
    knownAt,
    maxClaims: boundedInteger(value.maxClaims, "contradictionDetectionRequest.maxClaims", 2, 500),
    maxGroups: boundedInteger(value.maxGroups, "contradictionDetectionRequest.maxGroups", 1, 100),
  };
}

export function detectContradictionCandidates(
  claims: readonly Readonly<ExtractedClaim>[],
  value: unknown,
): readonly Readonly<ContradictionCandidate>[] {
  const request = parseDetectionRequest(value);
  if (claims.length > request.maxClaims) {
    throw new TypeError("contradiction candidate input exceeds maxClaims");
  }
  const ids = new Set<string>();
  const visible = claims
    .map((claim) => {
      assertExtractedClaimIntegrity(claim);
      assertSameTenant(request, claim, "contradiction detection claim");
      if (ids.has(claim.claimId))
        throw new TypeError("contradiction detection has duplicate claim IDs");
      ids.add(claim.claimId);
      return claim;
    })
    .filter(
      (claim) =>
        compareInstant(claim.extractedAt, request.knownAt) <= 0 &&
        compareInstant(claim.cutoffs.systemCutoff, request.knownAt) <= 0,
    )
    .sort((left, right) => left.claimId.localeCompare(right.claimId));
  const candidates: ContradictionCandidate[] = [];
  for (let leftIndex = 0; leftIndex < visible.length; leftIndex += 1) {
    const left = visible[leftIndex];
    if (left === undefined) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < visible.length; rightIndex += 1) {
      const right = visible[rightIndex];
      if (right === undefined) continue;
      const reason = contradictionReason(left, right);
      if (reason === null) continue;
      const unsigned = {
        claimIds: [left.claimId, right.claimId] as const,
        subjectKey: left.structuredFact.subjectKey,
        predicateKey: left.structuredFact.predicateKey,
        reason,
        adjudication: "unadjudicated" as const,
      };
      candidates.push({ ...unsigned, candidateSha256: digestJson(unsigned) });
      if (candidates.length >= request.maxGroups) return deepFreeze(cloneCanonical(candidates));
    }
  }
  return deepFreeze(cloneCanonical(candidates));
}
