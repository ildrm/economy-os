import type { BaselineIdentity, ScenarioDefinition } from "./definitions.js";
import { assertScenarioDefinitionIntegrity } from "./definitions.js";
import {
  assertDigestIntegrity,
  assertExactKeys,
  assertIsoInstant,
  assertNonBlank,
  assertPlainRecord,
  assertSha256,
  assertUuid,
  compareInstants,
  deepFreeze,
  digestJson,
  immutableWithDigest,
} from "./internals.js";

interface GovernanceEventCommon {
  readonly tenantId: string;
  readonly eventId: string;
  readonly actorId: string;
  readonly occurredAt: string;
}

export interface ProposalEventInput extends GovernanceEventCommon {
  readonly eventType: "proposal";
  readonly actorRole: "author";
  readonly scenarioDefinitionSha256: string;
  readonly definitionVersion: 1;
  readonly rationale: string;
}

export interface RevisionEventInput extends GovernanceEventCommon {
  readonly eventType: "revision";
  readonly actorRole: "author" | "contributor";
  readonly previousDefinitionSha256: string;
  readonly scenarioDefinitionSha256: string;
  readonly definitionVersion: number;
  readonly changeSummary: string;
}

export interface ReviewEventInput extends GovernanceEventCommon {
  readonly eventType: "review";
  readonly actorRole: "reviewer";
  readonly scenarioDefinitionSha256: string;
  readonly definitionVersion: number;
  readonly decision: "accepted_for_approval" | "changes_requested";
  readonly findings: readonly string[];
}

export interface ApprovalEventInput extends GovernanceEventCommon {
  readonly eventType: "approval";
  readonly actorRole: "approver";
  readonly scenarioDefinitionSha256: string;
  readonly definitionVersion: number;
  readonly decision: "approved" | "rejected";
  readonly rationale: string;
}

export type GovernanceEventInput =
  | ProposalEventInput
  | RevisionEventInput
  | ReviewEventInput
  | ApprovalEventInput;

export type GovernanceEvent = GovernanceEventInput & {
  readonly previousEventSha256: string | null;
  readonly eventSha256: string;
};

export type GovernanceStatus =
  | "proposed"
  | "changes_requested"
  | "reviewed"
  | "approved"
  | "rejected";

export interface ScenarioGovernanceLedger {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly scenarioId: string;
  readonly authorId: string;
  readonly contributorIds: readonly string[];
  readonly currentDefinitionVersion: number;
  readonly currentScenarioDefinitionSha256: string;
  readonly status: GovernanceStatus;
  readonly events: readonly GovernanceEvent[];
  readonly manifestSha256: string;
}

interface ReplayState {
  readonly status: GovernanceStatus;
  readonly version: number;
  readonly definitionSha256: string;
  readonly lastAt: string;
  readonly previousEventSha256: string;
  readonly participantIds: ReadonlySet<string>;
  readonly reviewerIds: ReadonlySet<string>;
}

function eventSha(input: GovernanceEventInput, previousEventSha256: string | null): string {
  return digestJson({ ...input, previousEventSha256 });
}

function validateCommonEvent(
  event: GovernanceEventInput,
  tenantId: string,
  previousAt: string | null,
): void {
  assertPlainRecord(event as unknown, "governance.event");
  const commonKeys = [
    "tenantId",
    "eventId",
    "eventType",
    "actorId",
    "actorRole",
    "occurredAt",
    "scenarioDefinitionSha256",
    "definitionVersion",
  ];
  if (event.eventType === "proposal") {
    assertExactKeys(
      event as unknown as Record<string, unknown>,
      [...commonKeys, "rationale"],
      "governance.proposal",
    );
  } else if (event.eventType === "revision") {
    assertExactKeys(
      event as unknown as Record<string, unknown>,
      [...commonKeys, "previousDefinitionSha256", "changeSummary"],
      "governance.revision",
    );
  } else if (event.eventType === "review") {
    assertExactKeys(
      event as unknown as Record<string, unknown>,
      [...commonKeys, "decision", "findings"],
      "governance.review",
    );
  } else if (event.eventType === "approval") {
    assertExactKeys(
      event as unknown as Record<string, unknown>,
      [...commonKeys, "decision", "rationale"],
      "governance.approval",
    );
  } else {
    throw new TypeError("governance eventType is not registered");
  }
  if (event.tenantId !== tenantId) throw new TypeError("governance event crosses tenant boundary");
  assertUuid(event.eventId, "governance.eventId");
  assertUuid(event.actorId, "governance.actorId");
  assertIsoInstant(event.occurredAt, "governance.occurredAt");
  if (previousAt && compareInstants(event.occurredAt, previousAt) < 0) {
    throw new TypeError("governance chronology cannot move backward");
  }
}

function validateFindings(findings: readonly string[]): void {
  if (!Array.isArray(findings) || findings.length > 64) {
    throw new TypeError("review findings must contain at most 64 items");
  }
  for (const finding of findings) assertNonBlank(finding, "review.finding", 2_000);
}

function applyEvent(
  event: GovernanceEventInput,
  current: ReplayState | null,
  ledger: Pick<ScenarioGovernanceLedger, "tenantId" | "authorId" | "contributorIds">,
): ReplayState {
  validateCommonEvent(event, ledger.tenantId, current?.lastAt ?? null);
  if (!current) {
    if (
      event.eventType !== "proposal" ||
      event.actorRole !== "author" ||
      event.actorId !== ledger.authorId ||
      event.definitionVersion !== 1
    ) {
      throw new TypeError("governance ledger must begin with its author's version-one proposal");
    }
    assertSha256(event.scenarioDefinitionSha256, "proposal.scenarioDefinitionSha256");
    assertNonBlank(event.rationale, "proposal.rationale", 2_000);
    return {
      status: "proposed",
      version: 1,
      definitionSha256: event.scenarioDefinitionSha256,
      lastAt: event.occurredAt,
      previousEventSha256: eventSha(event, null),
      participantIds: new Set([ledger.authorId, ...ledger.contributorIds]),
      reviewerIds: new Set(),
    };
  }

  if (current.status === "approved") {
    throw new TypeError("approved governance ledger is immutable; create a new revision cycle");
  }
  const participantIds = new Set(current.participantIds);
  const reviewerIds = new Set(current.reviewerIds);
  let status: GovernanceStatus = current.status;
  let version = current.version;
  let definitionSha256 = current.definitionSha256;

  if (event.eventType === "revision") {
    if (
      (current.status !== "proposed" &&
        current.status !== "changes_requested" &&
        current.status !== "rejected") ||
      !participantIds.has(event.actorId) ||
      event.definitionVersion !== current.version + 1 ||
      event.previousDefinitionSha256 !== current.definitionSha256 ||
      event.scenarioDefinitionSha256 === current.definitionSha256
    ) {
      throw new TypeError("revision is not a valid explicit successor of the current definition");
    }
    if (
      (event.actorId === ledger.authorId && event.actorRole !== "author") ||
      (event.actorId !== ledger.authorId && event.actorRole !== "contributor")
    ) {
      throw new TypeError("revision actor role does not match the contributor registry");
    }
    assertSha256(event.previousDefinitionSha256, "revision.previousDefinitionSha256");
    assertSha256(event.scenarioDefinitionSha256, "revision.scenarioDefinitionSha256");
    assertNonBlank(event.changeSummary, "revision.changeSummary", 2_000);
    version = event.definitionVersion;
    definitionSha256 = event.scenarioDefinitionSha256;
    status = "proposed";
    reviewerIds.clear();
  } else if (event.eventType === "review") {
    if (
      current.status !== "proposed" ||
      event.actorRole !== "reviewer" ||
      participantIds.has(event.actorId) ||
      event.scenarioDefinitionSha256 !== current.definitionSha256 ||
      event.definitionVersion !== current.version
    ) {
      throw new TypeError("review must cover the current definition with independent authorship");
    }
    if (event.decision !== "accepted_for_approval" && event.decision !== "changes_requested") {
      throw new TypeError("review decision is not registered");
    }
    validateFindings(event.findings);
    if (event.decision === "changes_requested" && event.findings.length === 0) {
      throw new TypeError("changes_requested review requires at least one finding");
    }
    reviewerIds.add(event.actorId);
    status = event.decision === "accepted_for_approval" ? "reviewed" : "changes_requested";
  } else if (event.eventType === "approval") {
    if (
      current.status !== "reviewed" ||
      event.actorRole !== "approver" ||
      participantIds.has(event.actorId) ||
      reviewerIds.has(event.actorId) ||
      event.scenarioDefinitionSha256 !== current.definitionSha256 ||
      event.definitionVersion !== current.version
    ) {
      throw new TypeError("approval requires an independent actor and an accepted current review");
    }
    if (event.decision !== "approved" && event.decision !== "rejected") {
      throw new TypeError("approval decision is not registered");
    }
    assertNonBlank(event.rationale, "approval.rationale", 2_000);
    status = event.decision === "approved" ? "approved" : "rejected";
  } else {
    throw new TypeError("proposal can only be the first governance event");
  }

  return {
    status,
    version,
    definitionSha256,
    lastAt: event.occurredAt,
    previousEventSha256: eventSha(event, current.previousEventSha256),
    participantIds,
    reviewerIds,
  };
}

function replayLedger(
  ledger: Pick<ScenarioGovernanceLedger, "tenantId" | "authorId" | "contributorIds" | "events">,
): ReplayState {
  let state: ReplayState | null = null;
  let previousSha: string | null = null;
  const eventIds = new Set<string>();
  for (const event of ledger.events) {
    if (eventIds.has(event.eventId)) throw new TypeError("governance eventId is duplicated");
    eventIds.add(event.eventId);
    if (event.previousEventSha256 !== previousSha) {
      throw new TypeError("governance event chain predecessor does not match");
    }
    const { previousEventSha256: _previous, eventSha256: actualSha, ...input } = event;
    const expectedSha = eventSha(input, previousSha);
    if (actualSha !== expectedSha) throw new TypeError("governance event digest does not match");
    state = applyEvent(input, state, ledger);
    previousSha = actualSha;
  }
  if (!state) throw new TypeError("governance ledger cannot be empty");
  return state;
}

function buildLedger(
  definition: ScenarioDefinition,
  initial: ProposalEventInput,
): Readonly<ScenarioGovernanceLedger> {
  const event: GovernanceEvent = deepFreeze({
    ...initial,
    previousEventSha256: null,
    eventSha256: eventSha(initial, null),
  });
  const partial = {
    schemaVersion: 1 as const,
    tenantId: definition.tenantId,
    scenarioId: definition.scenarioId,
    authorId: definition.authoredBy,
    contributorIds: definition.contributorIds,
    events: [event],
  };
  const state = replayLedger(partial);
  return immutableWithDigest({
    ...partial,
    currentDefinitionVersion: state.version,
    currentScenarioDefinitionSha256: state.definitionSha256,
    status: state.status,
  });
}

export function createGovernanceLedger(
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
  proposal: ProposalEventInput,
): Readonly<ScenarioGovernanceLedger> {
  assertScenarioDefinitionIntegrity(definition, baseline);
  if (
    proposal.tenantId !== definition.tenantId ||
    proposal.scenarioDefinitionSha256 !== definition.manifestSha256 ||
    proposal.definitionVersion !== definition.definitionVersion
  ) {
    throw new TypeError("proposal must bind the exact scenario definition");
  }
  return buildLedger(definition, proposal);
}

export function assertGovernanceLedgerIntegrity(ledger: ScenarioGovernanceLedger): void {
  assertDigestIntegrity(ledger, "governanceLedger");
  if (ledger.schemaVersion !== 1) throw new TypeError("governance ledger schemaVersion must be 1");
  assertUuid(ledger.tenantId, "governanceLedger.tenantId");
  assertUuid(ledger.scenarioId, "governanceLedger.scenarioId");
  assertUuid(ledger.authorId, "governanceLedger.authorId");
  for (const contributorId of ledger.contributorIds) {
    assertUuid(contributorId, "governanceLedger.contributorId");
  }
  const state = replayLedger(ledger);
  if (
    state.status !== ledger.status ||
    state.version !== ledger.currentDefinitionVersion ||
    state.definitionSha256 !== ledger.currentScenarioDefinitionSha256
  ) {
    throw new TypeError("governance materialized state does not match its event replay");
  }
}

export function appendGovernanceEvent(
  ledger: ScenarioGovernanceLedger,
  input: Exclude<GovernanceEventInput, ProposalEventInput>,
): Readonly<ScenarioGovernanceLedger> {
  assertGovernanceLedgerIntegrity(ledger);
  if (ledger.events.some((event) => event.eventId === input.eventId)) {
    throw new TypeError("governance eventId is duplicated");
  }
  const current = replayLedger(ledger);
  const next = applyEvent(input, current, ledger);
  const previousEventSha256 = current.previousEventSha256;
  const event: GovernanceEvent = deepFreeze({
    ...input,
    previousEventSha256,
    eventSha256: eventSha(input, previousEventSha256),
  });
  return immutableWithDigest({
    schemaVersion: 1 as const,
    tenantId: ledger.tenantId,
    scenarioId: ledger.scenarioId,
    authorId: ledger.authorId,
    contributorIds: ledger.contributorIds,
    currentDefinitionVersion: next.version,
    currentScenarioDefinitionSha256: next.definitionSha256,
    status: next.status,
    events: [...ledger.events, event],
  });
}

export function assertLedgerApprovesDefinition(
  ledger: ScenarioGovernanceLedger,
  definition: ScenarioDefinition,
): void {
  assertGovernanceLedgerIntegrity(ledger);
  if (
    ledger.tenantId !== definition.tenantId ||
    ledger.scenarioId !== definition.scenarioId ||
    ledger.status !== "approved" ||
    ledger.currentDefinitionVersion !== definition.definitionVersion ||
    ledger.currentScenarioDefinitionSha256 !== definition.manifestSha256
  ) {
    throw new TypeError("governance ledger does not approve this exact scenario definition");
  }
}
