import { describe, expect, it } from "vitest";

import { authorization, IDS, SHA_A, TIMES } from "./fixtures.test-helper.js";
import { chainedEvent } from "./internals.js";
import {
  createQuotaPolicy,
  type QuotaEvent,
  QuotaLedger,
  type ReserveQuotaInput,
} from "./quotas.js";

function policy(mode: "hard" | "soft" = "hard", limitUnits = 10) {
  return createQuotaPolicy({
    quotaId: IDS.quota,
    organizationId: IDS.organization,
    capability: "extension.execute",
    mode,
    limitUnits,
    windowStartsAt: TIMES.issue,
    windowEndsAt: TIMES.end,
    policyVersion: "quota.v1",
  });
}

function reservation(changes: Partial<ReserveQuotaInput> = {}): ReserveQuotaInput {
  const reservedAt = changes.reservedAt ?? TIMES.eval;
  return {
    reservationId: IDS.reservation,
    idempotencyKey: "extension-run-1",
    requestSha256: SHA_A,
    principalId: IDS.owner,
    organizationId: IDS.organization,
    capability: "extension.execute",
    requestedUnits: 6,
    reservedAt,
    expiresAt: TIMES.expiry,
    authorization: authorization("extension.execute", { evaluatedAt: reservedAt }),
    ...changes,
  };
}

describe("quota policy", () => {
  it("creates immutable hard and soft policies and validates bounds", () => {
    expect(policy().mode).toBe("hard");
    expect(Object.isFrozen(policy("soft"))).toBe(true);
    expect(() => policy("hard", 0)).toThrow(/integer/);
    expect(() =>
      createQuotaPolicy({
        ...policy(),
        schemaVersion: 1,
        manifestSha256: SHA_A,
      } as never),
    ).toThrow(/exactly/);
    expect(() =>
      createQuotaPolicy({
        quotaId: IDS.quota,
        organizationId: IDS.organization,
        capability: "extension.execute",
        mode: "hard",
        limitUnits: 10,
        windowStartsAt: TIMES.issue,
        windowEndsAt: TIMES.grant,
        policyVersion: "quota.v1",
      }),
    ).toThrow(/window end/);
  });
});

describe("atomic quota lifecycle", () => {
  it("reserves idempotently, settles actual usage, and preserves replay", () => {
    const quotaPolicy = policy();
    const ledger = new QuotaLedger(quotaPolicy);
    const input = reservation();
    const reserved = ledger.reserve(input);
    expect(ledger.reserve(input)).toBe(reserved);
    expect(ledger.snapshot()).toEqual({
      consumedUnits: 0,
      outstandingUnits: 6,
      availableUnits: 4,
      overSoftLimit: false,
    });
    const settled = ledger.settle({
      reservationId: IDS.reservation,
      settledUnits: 4,
      usageEventId: IDS.usage,
      occurredAt: TIMES.next,
    });
    expect(settled.totalConsumedUnits).toBe(4);
    expect(settled.totalOutstandingUnits).toBe(0);
    expect(ledger.snapshot().availableUnits).toBe(6);
    QuotaLedger.verifyReplay(quotaPolicy, ledger.events());
  });

  it("expires unused reservations and reconciles append-only corrections", () => {
    const quotaPolicy = policy();
    const ledger = new QuotaLedger(quotaPolicy);
    ledger.reserve(reservation());
    expect(() => ledger.expire({ reservationId: IDS.reservation, occurredAt: TIMES.next })).toThrow(
      /before expiresAt/,
    );
    const expired = ledger.expire({
      reservationId: IDS.reservation,
      occurredAt: TIMES.expiry,
    });
    expect(expired.action).toBe("expired");
    const reconciled = ledger.reconcile({
      reconciliationId: IDS.reconciliation,
      expectedConsumedUnits: 3,
      principalId: IDS.owner,
      occurredAt: "2026-01-05T00:00:00Z",
      reason: "Durable billing ledger reconciliation.",
      authorization: authorization("quota.reconcile", {
        evaluatedAt: "2026-01-05T00:00:00Z",
      }),
    });
    expect(reconciled.adjustmentUnits).toBe(3);
    expect(ledger.snapshot().consumedUnits).toBe(3);
    QuotaLedger.verifyReplay(quotaPolicy, ledger.events());
    expect(() =>
      ledger.reconcile({
        reconciliationId: IDS.reconciliation,
        expectedConsumedUnits: 3,
        principalId: IDS.owner,
        occurredAt: "2026-01-05T00:01:00Z",
        reason: "Duplicate.",
        authorization: authorization("quota.reconcile", {
          evaluatedAt: "2026-01-05T00:01:00Z",
        }),
      }),
    ).toThrow(/already exists/);
  });

  it("enforces hard limits atomically without appending rejected work", () => {
    const ledger = new QuotaLedger(policy());
    ledger.reserve(reservation({ requestedUnits: 7 }));
    expect(() =>
      ledger.reserve(
        reservation({
          reservationId: IDS.reservation2,
          idempotencyKey: "extension-run-2",
          requestSha256: "b".repeat(64),
          requestedUnits: 4,
        }),
      ),
    ).toThrow(/hard quota/);
    expect(ledger.events()).toHaveLength(1);
    expect(() => ledger.reserve({ ...reservation(), requestedUnits: 5 })).toThrow(/idempotency/);
    expect(() =>
      ledger.reserve({
        ...reservation(),
        idempotencyKey: "new-key",
      }),
    ).toThrow(/reservation ID/);
  });

  it("allows observable soft-limit overage", () => {
    const ledger = new QuotaLedger(policy("soft", 2));
    ledger.reserve(reservation({ requestedUnits: 6 }));
    expect(ledger.snapshot()).toMatchObject({ availableUnits: null, overSoftLimit: true });
  });

  it("rejects scope, interval, authorization, settlement, and terminal misuse", () => {
    const ledger = new QuotaLedger(policy());
    expect(() => ledger.reserve(reservation({ organizationId: IDS.otherOrganization }))).toThrow(
      /authorization|scope/,
    );
    expect(() =>
      ledger.reserve(
        reservation({
          reservedAt: TIMES.grant,
          authorization: authorization("extension.execute", { evaluatedAt: TIMES.grant }),
        }),
      ),
    ).toThrow(/authorization|outside/);
    expect(() =>
      ledger.reserve(
        reservation({
          expiresAt: TIMES.eval,
        }),
      ),
    ).toThrow(/outside/);
    expect(() =>
      ledger.reserve({
        ...reservation(),
        authorization: authorization("extension.execute", { entitlementAllowed: false }),
      }),
    ).toThrow(/authorization/);

    ledger.reserve(reservation());
    expect(() =>
      ledger.settle({
        reservationId: IDS.reservation,
        settledUnits: 7,
        usageEventId: IDS.usage,
        occurredAt: TIMES.next,
      }),
    ).toThrow(/exceed/);
    expect(() =>
      ledger.settle({
        reservationId: IDS.reservation,
        settledUnits: 1,
        usageEventId: IDS.usage,
        occurredAt: TIMES.grant,
      }),
    ).toThrow(/interval/);
    expect(() =>
      ledger.settle({
        reservationId: IDS.reservation,
        settledUnits: 1,
        usageEventId: IDS.usage,
        occurredAt: TIMES.expiry,
      }),
    ).toThrow(/interval/);
    ledger.settle({
      reservationId: IDS.reservation,
      settledUnits: 1,
      usageEventId: IDS.usage,
      occurredAt: TIMES.next,
    });
    expect(() =>
      ledger.settle({
        reservationId: IDS.reservation,
        settledUnits: 1,
        usageEventId: IDS.usage,
        occurredAt: TIMES.later,
      }),
    ).toThrow(/terminal/);
    expect(() =>
      ledger.expire({ reservationId: IDS.reservation2, occurredAt: TIMES.expiry }),
    ).toThrow(/does not exist/);
  });

  it("rejects duplicate usage and reconciliation beyond a hard ceiling", () => {
    const ledger = new QuotaLedger(policy());
    ledger.reserve(reservation());
    ledger.settle({
      reservationId: IDS.reservation,
      settledUnits: 4,
      usageEventId: IDS.usage,
      occurredAt: TIMES.next,
    });
    ledger.reserve(
      reservation({
        reservationId: IDS.reservation2,
        idempotencyKey: "extension-run-2",
        requestSha256: "b".repeat(64),
        requestedUnits: 2,
        reservedAt: TIMES.later,
        authorization: authorization("extension.execute", { evaluatedAt: TIMES.later }),
      }),
    );
    expect(() =>
      ledger.settle({
        reservationId: IDS.reservation2,
        settledUnits: 1,
        usageEventId: IDS.usage,
        occurredAt: TIMES.muchLater,
      }),
    ).toThrow(/already/);
    expect(() =>
      ledger.reconcile({
        reconciliationId: IDS.reconciliation,
        expectedConsumedUnits: 9,
        principalId: IDS.owner,
        occurredAt: TIMES.muchLater,
        reason: "Would exceed with outstanding reservation.",
        authorization: authorization("quota.reconcile", { evaluatedAt: TIMES.muchLater }),
      }),
    ).toThrow(/hard quota/);
  });

  it("detects replay tampering", () => {
    const quotaPolicy = policy();
    const ledger = new QuotaLedger(quotaPolicy);
    ledger.reserve(reservation());
    const tampered = JSON.parse(JSON.stringify(ledger.events())) as QuotaEvent[];
    Object.assign(tampered[0] as QuotaEvent, { quantityUnits: 9 });
    expect(() => QuotaLedger.verifyReplay(quotaPolicy, tampered)).toThrow(/digest/);

    const original = ledger.events()[0] as QuotaEvent;
    const { eventSha256: _eventSha256, ...body } = original;
    const malformed = chainedEvent({
      ...body,
      action: "reserved" as const,
      quantityUnits: 0,
      totalOutstandingUnits: 0,
    }) as QuotaEvent;
    expect(() => QuotaLedger.verifyReplay(quotaPolicy, [malformed])).toThrow(/reservation/);
  });

  it("enforces global event chronology and the reconciliation policy window", () => {
    const ledger = new QuotaLedger(policy("soft"));
    ledger.reserve(
      reservation({
        reservedAt: TIMES.next,
        authorization: authorization("extension.execute", { evaluatedAt: TIMES.next }),
      }),
    );
    expect(() =>
      ledger.reserve(
        reservation({
          reservationId: IDS.reservation2,
          idempotencyKey: "older-reservation",
          requestSha256: "b".repeat(64),
          reservedAt: TIMES.eval,
          authorization: authorization("extension.execute"),
        }),
      ),
    ).toThrow(/predates/);
    expect(() =>
      ledger.reconcile({
        reconciliationId: IDS.reconciliation,
        expectedConsumedUnits: 0,
        principalId: IDS.owner,
        occurredAt: TIMES.end,
        reason: "Outside the policy window.",
        authorization: authorization("quota.reconcile", { evaluatedAt: TIMES.end }),
      }),
    ).toThrow(/outside/);
  });
});
