import {
  assertExactKeys,
  assertIsoInstant,
  assertKey,
  assertPlainRecord,
  assertSha256,
  assertUuid,
  chainedEvent,
  cloneCanonical,
  compareInstants,
  deepFreeze,
  verifyHashChain,
} from "./internals.js";

export interface IntegrationResourcePointer {
  readonly resourceType: string;
  readonly resourceId: string;
  readonly resourceVersionSha256: string;
}

export interface IntegrationAuditInput {
  readonly auditEventId: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly principalId: string;
  readonly integrationId: string;
  readonly action: string;
  readonly resource: IntegrationResourcePointer;
  readonly outcome: "allowed" | "denied" | "succeeded" | "failed";
  readonly reasonCode: string;
  readonly policyVersion: string;
  readonly traceId: string;
  readonly occurredAt: string;
  readonly classification: "public" | "internal" | "confidential" | "restricted";
  readonly requestSha256: string;
  readonly relatedReceiptSha256: readonly string[];
}

export interface IntegrationAuditEvent extends IntegrationAuditInput {
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly previousEventSha256: string | null;
  readonly eventSha256: string;
  readonly recordClass: "integration_audit_pointer_only";
}

function validateResource(resource: IntegrationResourcePointer, field: string): void {
  assertPlainRecord(resource, field);
  assertExactKeys(resource, ["resourceType", "resourceId", "resourceVersionSha256"], field);
  assertKey(resource.resourceType, `${field}.resourceType`);
  assertUuid(resource.resourceId, `${field}.resourceId`);
  assertSha256(resource.resourceVersionSha256, `${field}.resourceVersionSha256`);
}

function validateAuditInput(input: IntegrationAuditInput, field: string): void {
  assertPlainRecord(input, field);
  assertExactKeys(
    input,
    [
      "auditEventId",
      "organizationId",
      "workspaceId",
      "principalId",
      "integrationId",
      "action",
      "resource",
      "outcome",
      "reasonCode",
      "policyVersion",
      "traceId",
      "occurredAt",
      "classification",
      "requestSha256",
      "relatedReceiptSha256",
    ],
    field,
  );
  assertUuid(input.auditEventId, `${field}.auditEventId`);
  assertUuid(input.organizationId, `${field}.organizationId`);
  if (input.workspaceId !== null) assertUuid(input.workspaceId, `${field}.workspaceId`);
  assertUuid(input.principalId, `${field}.principalId`);
  assertUuid(input.integrationId, `${field}.integrationId`);
  assertKey(input.action, `${field}.action`);
  validateResource(input.resource, `${field}.resource`);
  if (!(["allowed", "denied", "succeeded", "failed"] as const).includes(input.outcome)) {
    throw new TypeError(`${field}.outcome is invalid`);
  }
  assertKey(input.reasonCode, `${field}.reasonCode`);
  assertKey(input.policyVersion, `${field}.policyVersion`);
  assertUuid(input.traceId, `${field}.traceId`);
  assertIsoInstant(input.occurredAt, `${field}.occurredAt`);
  if (
    !(["public", "internal", "confidential", "restricted"] as const).includes(input.classification)
  ) {
    throw new TypeError(`${field}.classification is invalid`);
  }
  assertSha256(input.requestSha256, `${field}.requestSha256`);
  if (!Array.isArray(input.relatedReceiptSha256) || input.relatedReceiptSha256.length > 100) {
    throw new TypeError(`${field}.relatedReceiptSha256 must contain 0..100 digests`);
  }
  const seen = new Set<string>();
  for (const [index, digest] of input.relatedReceiptSha256.entries()) {
    assertSha256(digest, `${field}.relatedReceiptSha256[${index}]`);
    if (seen.has(digest)) throw new TypeError(`${field}.relatedReceiptSha256 contains duplicates`);
    seen.add(digest);
  }
}

export class IntegrationAuditLedger {
  readonly #organizationId: string;
  readonly #events: IntegrationAuditEvent[] = [];
  readonly #eventIds = new Set<string>();

  constructor(organizationId: string) {
    assertUuid(organizationId, "integration audit organizationId");
    this.#organizationId = organizationId;
  }

  append(input: IntegrationAuditInput): IntegrationAuditEvent {
    validateAuditInput(input, "integration audit input");
    if (input.organizationId !== this.#organizationId) {
      throw new TypeError("integration audit event crosses the ledger tenant boundary");
    }
    if (this.#eventIds.has(input.auditEventId)) {
      throw new TypeError("integration audit event ID already exists");
    }
    const prior = this.#events.at(-1);
    if (prior && compareInstants(input.occurredAt, prior.occurredAt) < 0) {
      throw new TypeError("integration audit event predates the ledger head");
    }
    const event = chainedEvent({
      schemaVersion: 1 as const,
      sequence: this.#events.length + 1,
      previousEventSha256: prior?.eventSha256 ?? null,
      recordClass: "integration_audit_pointer_only" as const,
      ...input,
      relatedReceiptSha256: [...input.relatedReceiptSha256].sort(),
    });
    this.#events.push(event);
    this.#eventIds.add(input.auditEventId);
    return event;
  }

  events(): readonly IntegrationAuditEvent[] {
    return deepFreeze(cloneCanonical(this.#events));
  }

  static verifyReplay(organizationId: string, events: readonly IntegrationAuditEvent[]): void {
    assertUuid(organizationId, "integration audit replay organizationId");
    verifyHashChain(events, "integration audit events");
    const identities = new Set<string>();
    let priorAt: string | null = null;
    for (const [index, event] of events.entries()) {
      assertPlainRecord(event, `integration audit events[${index}]`);
      assertExactKeys(
        event,
        [
          "schemaVersion",
          "sequence",
          "previousEventSha256",
          "eventSha256",
          "recordClass",
          "auditEventId",
          "organizationId",
          "workspaceId",
          "principalId",
          "integrationId",
          "action",
          "resource",
          "outcome",
          "reasonCode",
          "policyVersion",
          "traceId",
          "occurredAt",
          "classification",
          "requestSha256",
          "relatedReceiptSha256",
        ],
        `integration audit events[${index}]`,
      );
      if (
        event.schemaVersion !== 1 ||
        event.organizationId !== organizationId ||
        event.recordClass !== "integration_audit_pointer_only"
      ) {
        throw new TypeError(`integration audit events[${index}] crosses scope or record class`);
      }
      const {
        schemaVersion: _schemaVersion,
        sequence: _sequence,
        previousEventSha256: _previousEventSha256,
        eventSha256: _eventSha256,
        recordClass: _recordClass,
        ...input
      } = event;
      validateAuditInput(input, `integration audit events[${index}]`);
      if (identities.has(event.auditEventId)) {
        throw new TypeError(`integration audit events[${index}] repeats an event ID`);
      }
      if (priorAt !== null && compareInstants(event.occurredAt, priorAt) < 0) {
        throw new TypeError(`integration audit events[${index}] breaks chronology`);
      }
      identities.add(event.auditEventId);
      priorAt = event.occurredAt;
    }
  }
}
