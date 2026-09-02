import { describe, expect, it } from "vitest";
import {
  appendGovernanceEvent,
  assertGovernanceLedgerIntegrity,
  assertLedgerApprovesDefinition,
  createGovernanceLedger,
  type ScenarioGovernanceLedger,
} from "./collaboration.js";
import { reviseScenarioDefinition } from "./definitions.js";
import {
  definitionInput,
  IDS,
  makeApprovedLedger,
  makeBaseline,
  makeDefinition,
  required,
  sha,
} from "./fixtures.test-helper.js";

function proposed() {
  const baseline = makeBaseline();
  const definition = makeDefinition(baseline);
  const ledger = createGovernanceLedger(definition, baseline, {
    tenantId: IDS.tenant,
    eventId: IDS.proposal,
    eventType: "proposal",
    actorId: IDS.author,
    actorRole: "author",
    occurredAt: "2026-01-02T01:00:00Z",
    scenarioDefinitionSha256: definition.manifestSha256,
    definitionVersion: 1,
    rationale: "Submit for review.",
  });
  return { baseline, definition, ledger };
}

describe("collaborative scenario governance", () => {
  it("records an immutable independently reviewed approval chain", () => {
    const baseline = makeBaseline();
    const definition = makeDefinition(baseline);
    const ledger = makeApprovedLedger(definition, baseline);

    expect(ledger.status).toBe("approved");
    expect(ledger.events).toHaveLength(3);
    expect(ledger.events[1]?.previousEventSha256).toBe(ledger.events[0]?.eventSha256);
    expect(Object.isFrozen(ledger.events)).toBe(true);
    expect(() => assertGovernanceLedgerIntegrity(ledger)).not.toThrow();
    expect(() => assertLedgerApprovesDefinition(ledger, definition)).not.toThrow();
  });

  it("makes requested changes visible as an exact versioned revision", () => {
    const initial = proposed();
    let ledger = appendGovernanceEvent(initial.ledger, {
      tenantId: IDS.tenant,
      eventId: IDS.review,
      eventType: "review",
      actorId: IDS.reviewer,
      actorRole: "reviewer",
      occurredAt: "2026-01-02T02:00:00Z",
      scenarioDefinitionSha256: initial.definition.manifestSha256,
      definitionVersion: 1,
      decision: "changes_requested",
      findings: ["Clarify the declared shock duration."],
    });
    expect(ledger.status).toBe("changes_requested");

    const revised = reviseScenarioDefinition(
      initial.definition,
      definitionInput(initial.baseline, {
        definitionVersion: 2,
        previousDefinitionSha256: initial.definition.manifestSha256,
        createdAt: "2026-01-02T03:00:00Z",
        title: "Clarified energy-cost stress exploration",
      }),
      initial.baseline,
    );
    ledger = appendGovernanceEvent(ledger, {
      tenantId: IDS.tenant,
      eventId: IDS.revision,
      eventType: "revision",
      actorId: IDS.contributor,
      actorRole: "contributor",
      occurredAt: "2026-01-02T03:00:00Z",
      previousDefinitionSha256: initial.definition.manifestSha256,
      scenarioDefinitionSha256: revised.manifestSha256,
      definitionVersion: 2,
      changeSummary: "Clarified scenario duration and wording.",
    });
    expect(ledger.currentScenarioDefinitionSha256).toBe(revised.manifestSha256);
    expect(ledger.status).toBe("proposed");

    ledger = appendGovernanceEvent(ledger, {
      tenantId: IDS.tenant,
      eventId: "00000000-0000-4000-8000-000000000031",
      eventType: "review",
      actorId: IDS.reviewer,
      actorRole: "reviewer",
      occurredAt: "2026-01-02T04:00:00Z",
      scenarioDefinitionSha256: revised.manifestSha256,
      definitionVersion: 2,
      decision: "accepted_for_approval",
      findings: [],
    });
    ledger = appendGovernanceEvent(ledger, {
      tenantId: IDS.tenant,
      eventId: "00000000-0000-4000-8000-000000000032",
      eventType: "approval",
      actorId: IDS.approver,
      actorRole: "approver",
      occurredAt: "2026-01-02T05:00:00Z",
      scenarioDefinitionSha256: revised.manifestSha256,
      definitionVersion: 2,
      decision: "approved",
      rationale: "Independent review is complete.",
    });
    expect(() => assertLedgerApprovesDefinition(ledger, revised)).not.toThrow();
  });

  it("enforces reviewer and approver separation", () => {
    const { ledger, definition } = proposed();
    expect(() =>
      appendGovernanceEvent(ledger, {
        tenantId: IDS.tenant,
        eventId: IDS.review,
        eventType: "review",
        actorId: IDS.author,
        actorRole: "reviewer",
        occurredAt: "2026-01-02T02:00:00Z",
        scenarioDefinitionSha256: definition.manifestSha256,
        definitionVersion: 1,
        decision: "accepted_for_approval",
        findings: [],
      }),
    ).toThrow(/independent/);

    const reviewed = appendGovernanceEvent(ledger, {
      tenantId: IDS.tenant,
      eventId: IDS.review,
      eventType: "review",
      actorId: IDS.reviewer,
      actorRole: "reviewer",
      occurredAt: "2026-01-02T02:00:00Z",
      scenarioDefinitionSha256: definition.manifestSha256,
      definitionVersion: 1,
      decision: "accepted_for_approval",
      findings: [],
    });
    expect(() =>
      appendGovernanceEvent(reviewed, {
        tenantId: IDS.tenant,
        eventId: IDS.approval,
        eventType: "approval",
        actorId: IDS.reviewer,
        actorRole: "approver",
        occurredAt: "2026-01-02T03:00:00Z",
        scenarioDefinitionSha256: definition.manifestSha256,
        definitionVersion: 1,
        decision: "approved",
        rationale: "Self approval attempt.",
      }),
    ).toThrow(/independent/);
  });

  it("rejects silent edits, missing findings, duplicate events, cross-tenant events, and backward time", () => {
    const { ledger, definition } = proposed();
    const baseReview = {
      tenantId: IDS.tenant,
      eventId: IDS.review,
      eventType: "review" as const,
      actorId: IDS.reviewer,
      actorRole: "reviewer" as const,
      occurredAt: "2026-01-02T02:00:00Z",
      scenarioDefinitionSha256: definition.manifestSha256,
      definitionVersion: 1,
      decision: "changes_requested" as const,
      findings: ["A material change is required."],
    };
    expect(() =>
      appendGovernanceEvent(ledger, { ...baseReview, scenarioDefinitionSha256: sha("1") }),
    ).toThrow(/current definition/);
    expect(() => appendGovernanceEvent(ledger, { ...baseReview, findings: [] })).toThrow(/finding/);
    expect(() => appendGovernanceEvent(ledger, { ...baseReview, tenantId: IDS.tenantTwo })).toThrow(
      /tenant/,
    );
    expect(() =>
      appendGovernanceEvent(ledger, { ...baseReview, occurredAt: "2026-01-01T00:00:00Z" }),
    ).toThrow(/backward/);
    expect(() => appendGovernanceEvent(ledger, { ...baseReview, eventId: IDS.proposal })).toThrow(
      /duplicated/,
    );
  });

  it("rejects invalid revision links and disallows edits after approval", () => {
    const initial = proposed();
    expect(() =>
      appendGovernanceEvent(initial.ledger, {
        tenantId: IDS.tenant,
        eventId: IDS.revision,
        eventType: "revision",
        actorId: IDS.contributor,
        actorRole: "contributor",
        occurredAt: "2026-01-02T02:00:00Z",
        previousDefinitionSha256: sha("1"),
        scenarioDefinitionSha256: sha("2"),
        definitionVersion: 2,
        changeSummary: "Unlinked revision.",
      }),
    ).toThrow(/successor/);

    const approved = makeApprovedLedger(initial.definition, initial.baseline);
    expect(() =>
      appendGovernanceEvent(approved, {
        tenantId: IDS.tenant,
        eventId: IDS.revision,
        eventType: "revision",
        actorId: IDS.author,
        actorRole: "author",
        occurredAt: "2026-01-03T00:00:00Z",
        previousDefinitionSha256: initial.definition.manifestSha256,
        scenarioDefinitionSha256: sha("2"),
        definitionVersion: 2,
        changeSummary: "Attempted silent post-approval edit.",
      }),
    ).toThrow(/immutable/);
  });

  it("detects event-chain and materialized-state tampering", () => {
    const baseline = makeBaseline();
    const definition = makeDefinition(baseline);
    const ledger = makeApprovedLedger(definition, baseline);
    const tampered = structuredClone(ledger) as ScenarioGovernanceLedger & { status: "rejected" };
    tampered.status = "rejected";
    expect(() => assertGovernanceLedgerIntegrity(tampered)).toThrow(/digest/);

    const eventTamper = structuredClone(ledger) as ScenarioGovernanceLedger & {
      events: Array<{ eventSha256: string }>;
    };
    required(eventTamper.events[1], "second governance event").eventSha256 = sha("0");
    expect(() => assertGovernanceLedgerIntegrity(eventTamper)).toThrow(/digest/);
  });
});
