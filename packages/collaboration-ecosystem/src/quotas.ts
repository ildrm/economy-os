import {
  type AuthorizationDecision,
  assertAuthorizationDecisionIntegrity,
} from "./collaboration.js";
import {
  assertDigestIntegrity,
  assertExactKeys,
  assertInteger,
  assertIsoInstant,
  assertKey,
  assertPlainRecord,
  assertSha256,
  assertText,
  assertUuid,
  chainedEvent,
  cloneCanonical,
  compareInstants,
  deepFreeze,
  digestJson,
  immutableWithDigest,
  verifyHashChain,
} from "./internals.js";

export interface QuotaPolicyInput {
  readonly quotaId: string;
  readonly organizationId: string;
  readonly capability: string;
  readonly mode: "hard" | "soft";
  readonly limitUnits: number;
  readonly windowStartsAt: string;
  readonly windowEndsAt: string;
  readonly policyVersion: string;
}

export type QuotaPolicy = Readonly<
  QuotaPolicyInput & { readonly schemaVersion: 1; readonly manifestSha256: string }
>;

export function createQuotaPolicy(input: QuotaPolicyInput): QuotaPolicy {
  assertPlainRecord(input, "quota policy");
  assertExactKeys(
    input,
    [
      "quotaId",
      "organizationId",
      "capability",
      "mode",
      "limitUnits",
      "windowStartsAt",
      "windowEndsAt",
      "policyVersion",
    ],
    "quota policy",
  );
  assertUuid(input.quotaId, "quota policy.quotaId");
  assertUuid(input.organizationId, "quota policy.organizationId");
  assertKey(input.capability, "quota policy.capability");
  if (input.mode !== "hard" && input.mode !== "soft") {
    throw new TypeError("quota policy.mode is invalid");
  }
  assertInteger(input.limitUnits, "quota policy.limitUnits", 1, 1_000_000_000_000);
  assertIsoInstant(input.windowStartsAt, "quota policy.windowStartsAt");
  assertIsoInstant(input.windowEndsAt, "quota policy.windowEndsAt");
  if (compareInstants(input.windowEndsAt, input.windowStartsAt) <= 0) {
    throw new TypeError("quota policy window end must follow its start");
  }
  assertKey(input.policyVersion, "quota policy.policyVersion");
  return immutableWithDigest({ schemaVersion: 1 as const, ...input });
}

export function assertQuotaPolicyIntegrity(policy: QuotaPolicy): void {
  assertPlainRecord(policy, "quota policy");
  assertExactKeys(
    policy,
    [
      "schemaVersion",
      "quotaId",
      "organizationId",
      "capability",
      "mode",
      "limitUnits",
      "windowStartsAt",
      "windowEndsAt",
      "policyVersion",
      "manifestSha256",
    ],
    "quota policy",
  );
  if (policy.schemaVersion !== 1) throw new TypeError("quota policy schema is unsupported");
  assertDigestIntegrity(policy, "quota policy");
  const { schemaVersion: _schemaVersion, manifestSha256: _manifestSha256, ...body } = policy;
  if (createQuotaPolicy(body).manifestSha256 !== policy.manifestSha256) {
    throw new TypeError("quota policy is not canonical");
  }
}

export type QuotaEventAction = "reserved" | "settled" | "expired" | "reconciled";

export interface QuotaEvent {
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly previousEventSha256: string | null;
  readonly eventSha256: string;
  readonly quotaId: string;
  readonly organizationId: string;
  readonly capability: string;
  readonly action: QuotaEventAction;
  readonly reservationId: string | null;
  readonly principalId: string;
  readonly quantityUnits: number;
  readonly adjustmentUnits: number;
  readonly idempotencyKey: string | null;
  readonly requestSha256: string | null;
  readonly usageEventId: string | null;
  readonly reason: string | null;
  readonly occurredAt: string;
  readonly reservationExpiresAt: string | null;
  readonly authorizationDecisionSha256: string;
  readonly totalConsumedUnits: number;
  readonly totalOutstandingUnits: number;
}

export function assertQuotaEventIntegrity(event: QuotaEvent): void {
  assertPlainRecord(event, "quota event");
  assertExactKeys(
    event,
    [
      "schemaVersion",
      "sequence",
      "previousEventSha256",
      "eventSha256",
      "quotaId",
      "organizationId",
      "capability",
      "action",
      "reservationId",
      "principalId",
      "quantityUnits",
      "adjustmentUnits",
      "idempotencyKey",
      "requestSha256",
      "usageEventId",
      "reason",
      "occurredAt",
      "reservationExpiresAt",
      "authorizationDecisionSha256",
      "totalConsumedUnits",
      "totalOutstandingUnits",
    ],
    "quota event",
  );
  if (event.schemaVersion !== 1) throw new TypeError("quota event schema is unsupported");
  assertInteger(event.sequence, "quota event.sequence", 1);
  if (event.previousEventSha256 !== null) {
    assertSha256(event.previousEventSha256, "quota event.previousEventSha256");
  }
  assertSha256(event.eventSha256, "quota event.eventSha256");
  assertUuid(event.quotaId, "quota event.quotaId");
  assertUuid(event.organizationId, "quota event.organizationId");
  assertKey(event.capability, "quota event.capability");
  if (!(["reserved", "settled", "expired", "reconciled"] as const).includes(event.action)) {
    throw new TypeError("quota event.action is invalid");
  }
  if (event.reservationId !== null) assertUuid(event.reservationId, "quota event.reservationId");
  assertUuid(event.principalId, "quota event.principalId");
  assertInteger(event.quantityUnits, "quota event.quantityUnits", 0, 1_000_000_000_000);
  if (
    !Number.isSafeInteger(event.adjustmentUnits) ||
    Math.abs(event.adjustmentUnits) > 1_000_000_000_000
  ) {
    throw new TypeError("quota event.adjustmentUnits must be a bounded integer");
  }
  if (event.idempotencyKey !== null)
    assertText(event.idempotencyKey, "quota event.idempotencyKey", 200);
  if (event.requestSha256 !== null) assertSha256(event.requestSha256, "quota event.requestSha256");
  if (event.usageEventId !== null) assertUuid(event.usageEventId, "quota event.usageEventId");
  if (event.reason !== null) assertText(event.reason, "quota event.reason", 1_000);
  assertIsoInstant(event.occurredAt, "quota event.occurredAt");
  if (event.reservationExpiresAt !== null) {
    assertIsoInstant(event.reservationExpiresAt, "quota event.reservationExpiresAt");
  }
  assertSha256(event.authorizationDecisionSha256, "quota event.authorizationDecisionSha256");
  assertInteger(event.totalConsumedUnits, "quota event.totalConsumedUnits", 0, 1_000_000_000_000);
  assertInteger(
    event.totalOutstandingUnits,
    "quota event.totalOutstandingUnits",
    0,
    1_000_000_000_000,
  );
  const { eventSha256, ...body } = event;
  if (digestJson(body) !== eventSha256)
    throw new TypeError("quota event digest does not match content");
}

export interface ReserveQuotaInput {
  readonly reservationId: string;
  readonly idempotencyKey: string;
  readonly requestSha256: string;
  readonly principalId: string;
  readonly organizationId: string;
  readonly capability: string;
  readonly requestedUnits: number;
  readonly reservedAt: string;
  readonly expiresAt: string;
  readonly authorization: AuthorizationDecision;
}

export interface SettleQuotaInput {
  readonly reservationId: string;
  readonly settledUnits: number;
  readonly usageEventId: string;
  readonly occurredAt: string;
}

export interface ExpireQuotaInput {
  readonly reservationId: string;
  readonly occurredAt: string;
}

export interface ReconcileQuotaInput {
  readonly reconciliationId: string;
  readonly expectedConsumedUnits: number;
  readonly principalId: string;
  readonly occurredAt: string;
  readonly reason: string;
  readonly authorization: AuthorizationDecision;
}

interface ReservationState {
  readonly reservationId: string;
  readonly principalId: string;
  readonly requestedUnits: number;
  readonly reservedAt: string;
  readonly expiresAt: string;
  readonly idempotencyIdentity: string;
  readonly requestSha256: string;
  readonly reservedEvent: QuotaEvent;
  status: "reserved" | "settled" | "expired";
}

function validateAuthorization(
  authorization: AuthorizationDecision,
  principalId: string,
  organizationId: string,
  action: string,
  at: string,
): void {
  assertAuthorizationDecisionIntegrity(authorization);
  if (
    !authorization.allowed ||
    authorization.principalId !== principalId ||
    authorization.organizationId !== organizationId ||
    authorization.action !== action ||
    authorization.evaluatedAt !== at
  ) {
    throw new TypeError("quota authorization does not allow this exact operation");
  }
}

export class QuotaLedger {
  readonly #policy: QuotaPolicy;
  readonly #events: QuotaEvent[] = [];
  readonly #reservations = new Map<string, ReservationState>();
  readonly #idempotency = new Map<string, ReservationState>();
  readonly #usageEvents = new Set<string>();
  readonly #reconciliationIds = new Set<string>();
  #consumedUnits = 0;
  #outstandingUnits = 0;

  constructor(policy: QuotaPolicy) {
    assertQuotaPolicyIntegrity(policy);
    this.#policy = policy;
  }

  reserve(input: ReserveQuotaInput): QuotaEvent {
    assertPlainRecord(input, "quota reservation");
    assertExactKeys(
      input,
      [
        "reservationId",
        "idempotencyKey",
        "requestSha256",
        "principalId",
        "organizationId",
        "capability",
        "requestedUnits",
        "reservedAt",
        "expiresAt",
        "authorization",
      ],
      "quota reservation",
    );
    assertUuid(input.reservationId, "quota reservation.reservationId");
    assertText(input.idempotencyKey, "quota reservation.idempotencyKey", 200);
    assertSha256(input.requestSha256, "quota reservation.requestSha256");
    assertUuid(input.principalId, "quota reservation.principalId");
    assertUuid(input.organizationId, "quota reservation.organizationId");
    assertKey(input.capability, "quota reservation.capability");
    assertInteger(input.requestedUnits, "quota reservation.requestedUnits", 1, 1_000_000_000_000);
    assertIsoInstant(input.reservedAt, "quota reservation.reservedAt");
    assertIsoInstant(input.expiresAt, "quota reservation.expiresAt");
    validateAuthorization(
      input.authorization,
      input.principalId,
      input.organizationId,
      input.capability,
      input.reservedAt,
    );
    if (
      input.organizationId !== this.#policy.organizationId ||
      input.capability !== this.#policy.capability
    ) {
      throw new TypeError("quota reservation crosses its policy scope");
    }
    if (
      compareInstants(input.reservedAt, this.#policy.windowStartsAt) < 0 ||
      compareInstants(input.reservedAt, this.#policy.windowEndsAt) >= 0 ||
      compareInstants(input.expiresAt, input.reservedAt) <= 0 ||
      compareInstants(input.expiresAt, this.#policy.windowEndsAt) > 0
    ) {
      throw new TypeError("quota reservation is outside the policy window");
    }

    const idempotencyIdentity = `${input.principalId}:${input.idempotencyKey}`;
    const replay = this.#idempotency.get(idempotencyIdentity);
    if (replay) {
      if (
        replay.requestSha256 !== input.requestSha256 ||
        replay.reservationId !== input.reservationId ||
        replay.requestedUnits !== input.requestedUnits
      ) {
        throw new TypeError("idempotency key was reused for a different quota request");
      }
      return replay.reservedEvent;
    }
    if (this.#reservations.has(input.reservationId)) {
      throw new TypeError("quota reservation ID already exists");
    }
    const projected = this.#consumedUnits + this.#outstandingUnits + input.requestedUnits;
    if (this.#policy.mode === "hard" && projected > this.#policy.limitUnits) {
      throw new RangeError("hard quota limit would be exceeded");
    }

    const nextOutstanding = this.#outstandingUnits + input.requestedUnits;
    const event = this.#append({
      action: "reserved",
      reservationId: input.reservationId,
      principalId: input.principalId,
      quantityUnits: input.requestedUnits,
      adjustmentUnits: 0,
      idempotencyKey: input.idempotencyKey,
      requestSha256: input.requestSha256,
      usageEventId: null,
      reason: null,
      occurredAt: input.reservedAt,
      reservationExpiresAt: input.expiresAt,
      authorizationDecisionSha256: input.authorization.manifestSha256,
      totalConsumedUnits: this.#consumedUnits,
      totalOutstandingUnits: nextOutstanding,
    });
    const state: ReservationState = {
      reservationId: input.reservationId,
      principalId: input.principalId,
      requestedUnits: input.requestedUnits,
      reservedAt: input.reservedAt,
      expiresAt: input.expiresAt,
      idempotencyIdentity,
      requestSha256: input.requestSha256,
      reservedEvent: event,
      status: "reserved",
    };
    this.#outstandingUnits = nextOutstanding;
    this.#reservations.set(input.reservationId, state);
    this.#idempotency.set(idempotencyIdentity, state);
    return event;
  }

  settle(input: SettleQuotaInput): QuotaEvent {
    assertPlainRecord(input, "quota settlement");
    assertExactKeys(
      input,
      ["reservationId", "settledUnits", "usageEventId", "occurredAt"],
      "quota settlement",
    );
    assertUuid(input.reservationId, "quota settlement.reservationId");
    assertInteger(input.settledUnits, "quota settlement.settledUnits", 0, 1_000_000_000_000);
    assertUuid(input.usageEventId, "quota settlement.usageEventId");
    assertIsoInstant(input.occurredAt, "quota settlement.occurredAt");
    const state = this.#activeReservation(input.reservationId);
    if (input.settledUnits > state.requestedUnits) {
      throw new RangeError("settlement cannot exceed the reserved units");
    }
    if (
      compareInstants(input.occurredAt, state.reservedAt) < 0 ||
      compareInstants(input.occurredAt, state.expiresAt) >= 0
    ) {
      throw new TypeError("quota settlement is outside the reservation interval");
    }
    if (this.#usageEvents.has(input.usageEventId)) {
      throw new TypeError("usage event has already been settled");
    }
    const nextOutstanding = this.#outstandingUnits - state.requestedUnits;
    const nextConsumed = this.#consumedUnits + input.settledUnits;
    const event = this.#append({
      action: "settled",
      reservationId: state.reservationId,
      principalId: state.principalId,
      quantityUnits: input.settledUnits,
      adjustmentUnits: 0,
      idempotencyKey: null,
      requestSha256: null,
      usageEventId: input.usageEventId,
      reason: null,
      occurredAt: input.occurredAt,
      reservationExpiresAt: null,
      authorizationDecisionSha256: state.reservedEvent.authorizationDecisionSha256,
      totalConsumedUnits: nextConsumed,
      totalOutstandingUnits: nextOutstanding,
    });
    state.status = "settled";
    this.#outstandingUnits = nextOutstanding;
    this.#consumedUnits = nextConsumed;
    this.#usageEvents.add(input.usageEventId);
    return event;
  }

  expire(input: ExpireQuotaInput): QuotaEvent {
    assertPlainRecord(input, "quota expiry");
    assertExactKeys(input, ["reservationId", "occurredAt"], "quota expiry");
    assertUuid(input.reservationId, "quota expiry.reservationId");
    assertIsoInstant(input.occurredAt, "quota expiry.occurredAt");
    const state = this.#activeReservation(input.reservationId);
    if (compareInstants(input.occurredAt, state.expiresAt) < 0) {
      throw new TypeError("quota reservation cannot expire before expiresAt");
    }
    const nextOutstanding = this.#outstandingUnits - state.requestedUnits;
    const event = this.#append({
      action: "expired",
      reservationId: state.reservationId,
      principalId: state.principalId,
      quantityUnits: state.requestedUnits,
      adjustmentUnits: 0,
      idempotencyKey: null,
      requestSha256: null,
      usageEventId: null,
      reason: null,
      occurredAt: input.occurredAt,
      reservationExpiresAt: null,
      authorizationDecisionSha256: state.reservedEvent.authorizationDecisionSha256,
      totalConsumedUnits: this.#consumedUnits,
      totalOutstandingUnits: nextOutstanding,
    });
    state.status = "expired";
    this.#outstandingUnits = nextOutstanding;
    return event;
  }

  reconcile(input: ReconcileQuotaInput): QuotaEvent {
    assertPlainRecord(input, "quota reconciliation");
    assertExactKeys(
      input,
      [
        "reconciliationId",
        "expectedConsumedUnits",
        "principalId",
        "occurredAt",
        "reason",
        "authorization",
      ],
      "quota reconciliation",
    );
    assertUuid(input.reconciliationId, "quota reconciliation.reconciliationId");
    assertInteger(
      input.expectedConsumedUnits,
      "quota reconciliation.expectedConsumedUnits",
      0,
      1_000_000_000_000,
    );
    assertUuid(input.principalId, "quota reconciliation.principalId");
    assertIsoInstant(input.occurredAt, "quota reconciliation.occurredAt");
    assertText(input.reason, "quota reconciliation.reason", 1_000);
    validateAuthorization(
      input.authorization,
      input.principalId,
      this.#policy.organizationId,
      "quota.reconcile",
      input.occurredAt,
    );
    if (
      compareInstants(input.occurredAt, this.#policy.windowStartsAt) < 0 ||
      compareInstants(input.occurredAt, this.#policy.windowEndsAt) >= 0
    ) {
      throw new TypeError("quota reconciliation is outside the policy window");
    }
    if (this.#reconciliationIds.has(input.reconciliationId)) {
      throw new TypeError("quota reconciliation ID already exists");
    }
    if (
      this.#policy.mode === "hard" &&
      input.expectedConsumedUnits + this.#outstandingUnits > this.#policy.limitUnits
    ) {
      throw new RangeError("reconciliation would violate the hard quota limit");
    }
    const adjustmentUnits = input.expectedConsumedUnits - this.#consumedUnits;
    const event = this.#append({
      action: "reconciled",
      reservationId: null,
      principalId: input.principalId,
      quantityUnits: input.expectedConsumedUnits,
      adjustmentUnits,
      idempotencyKey: null,
      requestSha256: null,
      usageEventId: input.reconciliationId,
      reason: input.reason,
      occurredAt: input.occurredAt,
      reservationExpiresAt: null,
      authorizationDecisionSha256: input.authorization.manifestSha256,
      totalConsumedUnits: input.expectedConsumedUnits,
      totalOutstandingUnits: this.#outstandingUnits,
    });
    this.#consumedUnits = input.expectedConsumedUnits;
    this.#reconciliationIds.add(input.reconciliationId);
    return event;
  }

  snapshot(): Readonly<{
    consumedUnits: number;
    outstandingUnits: number;
    availableUnits: number | null;
    overSoftLimit: boolean;
  }> {
    const allocated = this.#consumedUnits + this.#outstandingUnits;
    return deepFreeze({
      consumedUnits: this.#consumedUnits,
      outstandingUnits: this.#outstandingUnits,
      availableUnits: this.#policy.mode === "hard" ? this.#policy.limitUnits - allocated : null,
      overSoftLimit: this.#policy.mode === "soft" && allocated > this.#policy.limitUnits,
    });
  }

  events(): readonly QuotaEvent[] {
    return deepFreeze(cloneCanonical(this.#events));
  }

  static verifyReplay(policy: QuotaPolicy, events: readonly QuotaEvent[]): void {
    assertQuotaPolicyIntegrity(policy);
    verifyHashChain(events, "quota events");
    const reservations = new Map<
      string,
      {
        requested: number;
        principalId: string;
        reservedAt: string;
        expiresAt: string;
        authorizationDecisionSha256: string;
        state: "reserved" | "terminal";
      }
    >();
    const idempotency = new Set<string>();
    const usage = new Set<string>();
    let consumed = 0;
    let outstanding = 0;
    let priorOccurredAt: string | null = null;
    for (const [index, event] of events.entries()) {
      assertQuotaEventIntegrity(event);
      if (
        event.quotaId !== policy.quotaId ||
        event.organizationId !== policy.organizationId ||
        event.capability !== policy.capability
      ) {
        throw new TypeError(`quota events[${index}] crosses policy scope`);
      }
      if (priorOccurredAt !== null && compareInstants(event.occurredAt, priorOccurredAt) < 0) {
        throw new TypeError(`quota events[${index}] breaks ledger chronology`);
      }
      if (event.action === "reserved") {
        if (
          event.reservationId === null ||
          event.idempotencyKey === null ||
          event.requestSha256 === null ||
          event.reservationExpiresAt === null ||
          event.quantityUnits < 1 ||
          event.adjustmentUnits !== 0 ||
          event.usageEventId !== null ||
          event.reason !== null ||
          compareInstants(event.occurredAt, policy.windowStartsAt) < 0 ||
          compareInstants(event.occurredAt, policy.windowEndsAt) >= 0 ||
          compareInstants(event.reservationExpiresAt, event.occurredAt) <= 0 ||
          compareInstants(event.reservationExpiresAt, policy.windowEndsAt) > 0 ||
          reservations.has(event.reservationId)
        ) {
          throw new TypeError(`quota events[${index}] is not a unique reservation`);
        }
        const identity = `${event.principalId}:${event.idempotencyKey}`;
        if (idempotency.has(identity)) throw new TypeError("quota event reuses an idempotency key");
        idempotency.add(identity);
        reservations.set(event.reservationId, {
          requested: event.quantityUnits,
          principalId: event.principalId,
          reservedAt: event.occurredAt,
          expiresAt: event.reservationExpiresAt,
          authorizationDecisionSha256: event.authorizationDecisionSha256,
          state: "reserved",
        });
        outstanding += event.quantityUnits;
      } else if (event.action === "settled" || event.action === "expired") {
        const state =
          event.reservationId === null ? undefined : reservations.get(event.reservationId);
        if (state?.state !== "reserved") {
          throw new TypeError(`quota events[${index}] terminates a missing reservation`);
        }
        if (event.action === "settled") {
          if (
            event.quantityUnits > state.requested ||
            event.usageEventId === null ||
            event.adjustmentUnits !== 0 ||
            event.idempotencyKey !== null ||
            event.requestSha256 !== null ||
            event.reason !== null ||
            event.reservationExpiresAt !== null ||
            event.principalId !== state.principalId ||
            event.authorizationDecisionSha256 !== state.authorizationDecisionSha256 ||
            compareInstants(event.occurredAt, state.reservedAt) < 0 ||
            compareInstants(event.occurredAt, state.expiresAt) >= 0 ||
            usage.has(event.usageEventId)
          ) {
            throw new TypeError(`quota events[${index}] has an invalid settlement`);
          }
          usage.add(event.usageEventId);
          consumed += event.quantityUnits;
        } else if (
          event.quantityUnits !== state.requested ||
          event.adjustmentUnits !== 0 ||
          event.idempotencyKey !== null ||
          event.requestSha256 !== null ||
          event.usageEventId !== null ||
          event.reason !== null ||
          event.reservationExpiresAt !== null ||
          event.principalId !== state.principalId ||
          event.authorizationDecisionSha256 !== state.authorizationDecisionSha256 ||
          compareInstants(event.occurredAt, state.expiresAt) < 0
        ) {
          throw new TypeError(`quota events[${index}] has an invalid expiry`);
        }
        outstanding -= state.requested;
        state.state = "terminal";
      } else if (event.action === "reconciled") {
        if (
          event.reservationId !== null ||
          event.usageEventId === null ||
          event.idempotencyKey !== null ||
          event.requestSha256 !== null ||
          event.reservationExpiresAt !== null ||
          event.reason === null ||
          compareInstants(event.occurredAt, policy.windowStartsAt) < 0 ||
          compareInstants(event.occurredAt, policy.windowEndsAt) >= 0 ||
          usage.has(event.usageEventId) ||
          event.adjustmentUnits !== event.quantityUnits - consumed
        ) {
          throw new TypeError(`quota events[${index}] has an invalid reconciliation`);
        }
        usage.add(event.usageEventId);
        consumed = event.quantityUnits;
      } else {
        throw new TypeError(`quota events[${index}] has an unknown action`);
      }
      if (
        event.totalConsumedUnits !== consumed ||
        event.totalOutstandingUnits !== outstanding ||
        (policy.mode === "hard" && consumed + outstanding > policy.limitUnits)
      ) {
        throw new TypeError(`quota events[${index}] has invalid running totals`);
      }
      priorOccurredAt = event.occurredAt;
    }
  }

  #activeReservation(reservationId: string): ReservationState {
    const state = this.#reservations.get(reservationId);
    if (!state) throw new TypeError("quota reservation does not exist");
    if (state.status !== "reserved") throw new TypeError("quota reservation is already terminal");
    return state;
  }

  #append(
    input: Omit<
      QuotaEvent,
      | "schemaVersion"
      | "sequence"
      | "previousEventSha256"
      | "eventSha256"
      | "quotaId"
      | "organizationId"
      | "capability"
    >,
  ): QuotaEvent {
    const previous = this.#events.at(-1);
    if (previous && compareInstants(input.occurredAt, previous.occurredAt) < 0) {
      throw new TypeError("quota event predates the ledger head");
    }
    const event = chainedEvent({
      schemaVersion: 1 as const,
      sequence: this.#events.length + 1,
      previousEventSha256: previous?.eventSha256 ?? null,
      quotaId: this.#policy.quotaId,
      organizationId: this.#policy.organizationId,
      capability: this.#policy.capability,
      ...input,
    });
    this.#events.push(event);
    return event;
  }
}
