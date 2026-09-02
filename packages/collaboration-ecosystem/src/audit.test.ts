import { describe, expect, it } from "vitest";

import { type IntegrationAuditEvent, IntegrationAuditLedger } from "./audit.js";
import { IDS, SHA_A, SHA_B, SHA_C, TIMES } from "./fixtures.test-helper.js";
import { chainedEvent } from "./internals.js";

function input(changes: Record<string, unknown> = {}) {
  return {
    auditEventId: IDS.audit,
    organizationId: IDS.organization,
    workspaceId: IDS.workspace,
    principalId: IDS.owner,
    integrationId: IDS.integration,
    action: "extension.admit",
    resource: {
      resourceType: "extension.version",
      resourceId: IDS.extension,
      resourceVersionSha256: SHA_A,
    },
    outcome: "succeeded" as const,
    reasonCode: "extension.admitted",
    policyVersion: "policy.v1",
    traceId: IDS.trace,
    occurredAt: TIMES.eval,
    classification: "internal" as const,
    requestSha256: SHA_B,
    relatedReceiptSha256: [SHA_C],
    ...changes,
  };
}

describe("developer integration audit receipts", () => {
  it("appends pointer-only, tenant-bound, hash-chained receipts", () => {
    const ledger = new IntegrationAuditLedger(IDS.organization);
    const first = ledger.append(input());
    const second = ledger.append(
      input({
        auditEventId: IDS.audit2,
        occurredAt: TIMES.next,
        outcome: "failed",
        reasonCode: "endpoint.timeout",
        relatedReceiptSha256: [SHA_A, SHA_C],
      }),
    );
    expect(first.recordClass).toBe("integration_audit_pointer_only");
    expect(second.previousEventSha256).toBe(first.eventSha256);
    expect(Object.keys(first)).not.toContain("payload");
    IntegrationAuditLedger.verifyReplay(IDS.organization, ledger.events());
    expect(Object.isFrozen(ledger.events())).toBe(true);
  });

  it("rejects tenant crossing, duplicate identity, chronology, values, and unknown fields", () => {
    const ledger = new IntegrationAuditLedger(IDS.organization);
    expect(() => ledger.append(input({ organizationId: IDS.otherOrganization }))).toThrow(
      /tenant boundary/,
    );
    ledger.append(input());
    expect(() => ledger.append(input({ occurredAt: TIMES.next }))).toThrow(/already exists/);
    expect(() =>
      ledger.append(input({ auditEventId: IDS.audit2, occurredAt: TIMES.grant })),
    ).toThrow(/predates/);
    expect(() =>
      ledger.append(input({ auditEventId: IDS.audit2, relatedReceiptSha256: [SHA_A, SHA_A] })),
    ).toThrow(/duplicates/);
    expect(() => ledger.append(input({ auditEventId: IDS.audit2, value: "42" }))).toThrow(
      /exactly/,
    );
    expect(() => ledger.append(input({ auditEventId: IDS.audit2, outcome: "maybe" }))).toThrow(
      /outcome/,
    );
  });

  it("detects digest and tenant replay tampering", () => {
    const ledger = new IntegrationAuditLedger(IDS.organization);
    ledger.append(input());
    const digestTamper = JSON.parse(JSON.stringify(ledger.events())) as IntegrationAuditEvent[];
    Object.assign(digestTamper[0] as IntegrationAuditEvent, { reasonCode: "changed" });
    expect(() => IntegrationAuditLedger.verifyReplay(IDS.organization, digestTamper)).toThrow(
      /digest/,
    );
    expect(() =>
      IntegrationAuditLedger.verifyReplay(IDS.otherOrganization, ledger.events()),
    ).toThrow(/scope/);

    const original = ledger.events()[0] as IntegrationAuditEvent;
    const { eventSha256: _eventSha256, ...body } = original;
    const invalid = chainedEvent({ ...body, outcome: "invented" as never });
    expect(() =>
      IntegrationAuditLedger.verifyReplay(IDS.organization, [invalid as IntegrationAuditEvent]),
    ).toThrow(/outcome/);
  });
});
