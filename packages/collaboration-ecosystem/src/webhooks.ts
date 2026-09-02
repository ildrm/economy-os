import {
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
  type Json,
  signaturesEqual,
  signJson,
  verifyHashChain,
} from "./internals.js";

export interface WebhookEndpointInput {
  readonly endpointId: string;
  readonly organizationId: string;
  readonly url: string;
  readonly eventTypes: readonly string[];
  readonly signingKeyId: string;
  readonly maxAttempts: number;
  readonly baseRetrySeconds: number;
  readonly maxRetrySeconds: number;
  readonly active: boolean;
}

export type WebhookEndpoint = Readonly<
  WebhookEndpointInput & { readonly schemaVersion: 1; readonly manifestSha256: string }
>;

export function createWebhookEndpoint(input: WebhookEndpointInput): WebhookEndpoint {
  assertPlainRecord(input, "webhook endpoint");
  assertExactKeys(
    input,
    [
      "endpointId",
      "organizationId",
      "url",
      "eventTypes",
      "signingKeyId",
      "maxAttempts",
      "baseRetrySeconds",
      "maxRetrySeconds",
      "active",
    ],
    "webhook endpoint",
  );
  assertUuid(input.endpointId, "webhook endpoint.endpointId");
  assertUuid(input.organizationId, "webhook endpoint.organizationId");
  assertText(input.url, "webhook endpoint.url", 2_000);
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    throw new TypeError("webhook endpoint.url must be an HTTPS URL");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== ""
  ) {
    throw new TypeError("webhook endpoint.url must be credential-free HTTPS without a fragment");
  }
  if (
    parsed.hostname !== parsed.hostname.toLowerCase() ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
      parsed.hostname,
    ) ||
    parsed.hostname === "localhost" ||
    parsed.hostname.endsWith(".local") ||
    parsed.hostname.endsWith(".internal")
  ) {
    throw new TypeError("webhook endpoint.url must use a public DNS hostname");
  }
  if (
    !Array.isArray(input.eventTypes) ||
    input.eventTypes.length < 1 ||
    input.eventTypes.length > 100
  ) {
    throw new TypeError("webhook endpoint.eventTypes must contain 1..100 entries");
  }
  const eventTypes = [...input.eventTypes];
  for (const [index, eventType] of eventTypes.entries()) {
    assertKey(eventType, `webhook endpoint.eventTypes[${index}]`);
  }
  if (new Set(eventTypes).size !== eventTypes.length) {
    throw new TypeError("webhook endpoint.eventTypes must not contain duplicates");
  }
  assertKey(input.signingKeyId, "webhook endpoint.signingKeyId");
  assertInteger(input.maxAttempts, "webhook endpoint.maxAttempts", 1, 20);
  assertInteger(input.baseRetrySeconds, "webhook endpoint.baseRetrySeconds", 1, 86_400);
  assertInteger(input.maxRetrySeconds, "webhook endpoint.maxRetrySeconds", 1, 604_800);
  if (input.maxRetrySeconds < input.baseRetrySeconds) {
    throw new TypeError("webhook endpoint maximum retry must cover the base retry");
  }
  if (typeof input.active !== "boolean")
    throw new TypeError("webhook endpoint.active must be boolean");
  return immutableWithDigest({
    schemaVersion: 1 as const,
    ...input,
    eventTypes: eventTypes.sort(),
    url: parsed.toString(),
  });
}

export function assertWebhookEndpointIntegrity(endpoint: WebhookEndpoint): void {
  assertPlainRecord(endpoint, "webhook endpoint");
  assertExactKeys(
    endpoint,
    [
      "schemaVersion",
      "endpointId",
      "organizationId",
      "url",
      "eventTypes",
      "signingKeyId",
      "maxAttempts",
      "baseRetrySeconds",
      "maxRetrySeconds",
      "active",
      "manifestSha256",
    ],
    "webhook endpoint",
  );
  if (endpoint.schemaVersion !== 1) {
    throw new TypeError("webhook endpoint schema is unsupported");
  }
  const { schemaVersion: _schemaVersion, manifestSha256, ...body } = endpoint;
  assertSha256(manifestSha256, "webhook endpoint.manifestSha256");
  if (createWebhookEndpoint(body).manifestSha256 !== manifestSha256) {
    throw new TypeError("webhook endpoint manifest digest or canonical form is invalid");
  }
}

export interface UnsignedWebhookInput {
  readonly deliveryId: string;
  readonly eventId: string;
  readonly endpointId: string;
  readonly organizationId: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly signedAt: string;
  readonly nonce: string;
  readonly keyId: string;
  readonly payload: Json;
}

export interface WebhookEnvelope extends UnsignedWebhookInput {
  readonly schemaVersion: 1;
  readonly payloadSha256: string;
  readonly signature: string;
}

function validateUnsigned(input: UnsignedWebhookInput): void {
  assertPlainRecord(input, "webhook input");
  assertExactKeys(
    input,
    [
      "deliveryId",
      "eventId",
      "endpointId",
      "organizationId",
      "eventType",
      "occurredAt",
      "signedAt",
      "nonce",
      "keyId",
      "payload",
    ],
    "webhook input",
  );
  assertUuid(input.deliveryId, "webhook input.deliveryId");
  assertUuid(input.eventId, "webhook input.eventId");
  assertUuid(input.endpointId, "webhook input.endpointId");
  assertUuid(input.organizationId, "webhook input.organizationId");
  assertKey(input.eventType, "webhook input.eventType");
  assertIsoInstant(input.occurredAt, "webhook input.occurredAt");
  assertIsoInstant(input.signedAt, "webhook input.signedAt");
  if (compareInstants(input.occurredAt, input.signedAt) > 0) {
    throw new TypeError("webhook event cannot occur after it is signed");
  }
  assertText(input.nonce, "webhook input.nonce", 200);
  assertKey(input.keyId, "webhook input.keyId");
  digestJson(input.payload);
}

export function signWebhookEnvelope(
  input: UnsignedWebhookInput,
  secret: string | Uint8Array,
): Readonly<WebhookEnvelope> {
  validateUnsigned(input);
  const unsigned = {
    schemaVersion: 1 as const,
    ...input,
    payloadSha256: digestJson(input.payload),
  };
  return deepFreeze({ ...cloneCanonical(unsigned), signature: signJson(unsigned, secret) });
}

function validateEnvelope(envelope: WebhookEnvelope): void {
  assertPlainRecord(envelope, "webhook envelope");
  assertExactKeys(
    envelope,
    [
      "schemaVersion",
      "deliveryId",
      "eventId",
      "endpointId",
      "organizationId",
      "eventType",
      "occurredAt",
      "signedAt",
      "nonce",
      "keyId",
      "payload",
      "payloadSha256",
      "signature",
    ],
    "webhook envelope",
  );
  if (envelope.schemaVersion !== 1) throw new TypeError("webhook envelope version is unsupported");
  const {
    schemaVersion: _schemaVersion,
    payloadSha256: _payloadSha256,
    signature: _signature,
    ...unsigned
  } = envelope;
  validateUnsigned(unsigned);
  assertSha256(envelope.payloadSha256, "webhook envelope.payloadSha256");
  assertSha256(envelope.signature, "webhook envelope.signature");
  if (digestJson(envelope.payload) !== envelope.payloadSha256) {
    throw new TypeError("webhook envelope payload digest does not match payload");
  }
}

export interface WebhookNonceStore {
  claim(identity: string, expiresAt: string): boolean;
}

export class MemoryWebhookNonceStore implements WebhookNonceStore {
  readonly #claims = new Map<string, string>();

  claim(identity: string, expiresAt: string): boolean {
    assertText(identity, "nonce identity", 1_000);
    assertIsoInstant(expiresAt, "nonce expiry");
    if (this.#claims.has(identity)) return false;
    this.#claims.set(identity, expiresAt);
    return true;
  }

  prune(at: string): number {
    assertIsoInstant(at, "nonce prune time");
    let removed = 0;
    for (const [identity, expiry] of this.#claims) {
      if (compareInstants(expiry, at) <= 0) {
        this.#claims.delete(identity);
        removed += 1;
      }
    }
    return removed;
  }
}

export type WebhookVerification = Readonly<{
  readonly accepted: boolean;
  readonly reason:
    | "accepted"
    | "unknown_key"
    | "signature_invalid"
    | "timestamp_too_old"
    | "timestamp_in_future"
    | "nonce_replayed";
  readonly deliveryId: string;
  readonly verifiedAt: string;
  readonly envelopeSha256: string;
}>;

export function verifyWebhookEnvelope(input: {
  readonly envelope: WebhookEnvelope;
  readonly receivedAt: string;
  readonly maxAgeSeconds: number;
  readonly maximumFutureSkewSeconds: number;
  readonly resolveSecret: (keyId: string) => string | Uint8Array | null;
  readonly nonces: WebhookNonceStore;
}): WebhookVerification {
  assertPlainRecord(input, "webhook verification");
  assertExactKeys(
    input,
    [
      "envelope",
      "receivedAt",
      "maxAgeSeconds",
      "maximumFutureSkewSeconds",
      "resolveSecret",
      "nonces",
    ],
    "webhook verification",
  );
  validateEnvelope(input.envelope);
  assertIsoInstant(input.receivedAt, "webhook verification.receivedAt");
  assertInteger(input.maxAgeSeconds, "webhook verification.maxAgeSeconds", 1, 86_400);
  assertInteger(
    input.maximumFutureSkewSeconds,
    "webhook verification.maximumFutureSkewSeconds",
    0,
    300,
  );
  if (typeof input.resolveSecret !== "function") {
    throw new TypeError("webhook verification.resolveSecret must be a function");
  }
  if (!input.nonces || typeof input.nonces.claim !== "function") {
    throw new TypeError("webhook verification.nonces must implement claim");
  }
  const envelopeSha256 = digestJson(input.envelope);
  const ageMilliseconds = compareInstants(input.receivedAt, input.envelope.signedAt);
  const secret = input.resolveSecret(input.envelope.keyId);
  let reason: WebhookVerification["reason"];
  if (secret === null) {
    reason = "unknown_key";
  } else {
    const { signature, ...unsigned } = input.envelope;
    if (!signaturesEqual(signature, signJson(unsigned, secret))) {
      reason = "signature_invalid";
    } else if (ageMilliseconds >= input.maxAgeSeconds * 1_000) {
      reason = "timestamp_too_old";
    } else if (ageMilliseconds < -input.maximumFutureSkewSeconds * 1_000) {
      reason = "timestamp_in_future";
    } else {
      const nonceIdentity = `${input.envelope.organizationId}:${input.envelope.endpointId}:${input.envelope.keyId}:${input.envelope.nonce}`;
      const expiry = new Date(
        Date.parse(input.envelope.signedAt) + input.maxAgeSeconds * 1_000,
      ).toISOString();
      reason = input.nonces.claim(nonceIdentity, expiry) ? "accepted" : "nonce_replayed";
    }
  }
  return deepFreeze({
    accepted: reason === "accepted",
    reason,
    deliveryId: input.envelope.deliveryId,
    verifiedAt: input.receivedAt,
    envelopeSha256,
  });
}

export type WebhookDeliveryStatus =
  | "queued"
  | "delivering"
  | "retry_scheduled"
  | "delivered"
  | "dead_lettered";

export interface WebhookDeliveryEvent {
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly previousEventSha256: string | null;
  readonly eventSha256: string;
  readonly deliveryId: string;
  readonly endpointId: string;
  readonly organizationId: string;
  readonly envelopeSha256: string;
  readonly status: WebhookDeliveryStatus;
  readonly attempt: number;
  readonly occurredAt: string;
  readonly retryAt: string | null;
  readonly outcomeCode: string | null;
}

export class WebhookDeliveryLedger {
  readonly #endpoint: WebhookEndpoint;
  readonly #events: WebhookDeliveryEvent[] = [];
  readonly #envelopes = new Map<string, string>();

  constructor(endpoint: WebhookEndpoint) {
    assertWebhookEndpointIntegrity(endpoint);
    this.#endpoint = endpoint;
  }

  enqueue(input: {
    readonly envelope: WebhookEnvelope;
    readonly queuedAt: string;
  }): WebhookDeliveryEvent {
    assertPlainRecord(input, "webhook enqueue");
    assertExactKeys(input, ["envelope", "queuedAt"], "webhook enqueue");
    validateEnvelope(input.envelope);
    assertIsoInstant(input.queuedAt, "webhook enqueue.queuedAt");
    if (compareInstants(input.queuedAt, input.envelope.signedAt) < 0) {
      throw new TypeError("webhook delivery cannot be queued before envelope signing");
    }
    if (!this.#endpoint.active) throw new TypeError("webhook endpoint is inactive");
    if (
      input.envelope.endpointId !== this.#endpoint.endpointId ||
      input.envelope.organizationId !== this.#endpoint.organizationId ||
      input.envelope.keyId !== this.#endpoint.signingKeyId ||
      !this.#endpoint.eventTypes.includes(input.envelope.eventType)
    ) {
      throw new TypeError("webhook envelope is outside endpoint scope");
    }
    const envelopeSha256 = digestJson(input.envelope);
    const existing = this.#envelopes.get(input.envelope.deliveryId);
    if (existing) {
      if (existing !== envelopeSha256)
        throw new TypeError("delivery ID was reused for another envelope");
      const queued = this.#events.find(
        (event) => event.deliveryId === input.envelope.deliveryId && event.status === "queued",
      );
      if (!queued) throw new TypeError("delivery replay is missing its queued event");
      return queued;
    }
    const event = this.#append({
      deliveryId: input.envelope.deliveryId,
      envelopeSha256,
      status: "queued",
      attempt: 0,
      occurredAt: input.queuedAt,
      retryAt: null,
      outcomeCode: null,
    });
    this.#envelopes.set(input.envelope.deliveryId, envelopeSha256);
    return event;
  }

  beginAttempt(input: {
    readonly deliveryId: string;
    readonly occurredAt: string;
  }): WebhookDeliveryEvent {
    assertPlainRecord(input, "webhook attempt");
    assertExactKeys(input, ["deliveryId", "occurredAt"], "webhook attempt");
    assertUuid(input.deliveryId, "webhook attempt.deliveryId");
    assertIsoInstant(input.occurredAt, "webhook attempt.occurredAt");
    const current = this.#current(input.deliveryId);
    if (current.status !== "queued" && current.status !== "retry_scheduled") {
      throw new TypeError("webhook delivery is not ready for an attempt");
    }
    if (current.retryAt !== null && compareInstants(input.occurredAt, current.retryAt) < 0) {
      throw new TypeError("webhook retry cannot begin before retryAt");
    }
    if (compareInstants(input.occurredAt, current.occurredAt) < 0) {
      throw new TypeError("webhook attempt cannot predate its queued state");
    }
    return this.#append({
      deliveryId: current.deliveryId,
      envelopeSha256: current.envelopeSha256,
      status: "delivering",
      attempt: current.attempt + 1,
      occurredAt: input.occurredAt,
      retryAt: null,
      outcomeCode: null,
    });
  }

  succeed(input: {
    readonly deliveryId: string;
    readonly occurredAt: string;
    readonly outcomeCode: string;
  }): WebhookDeliveryEvent {
    assertPlainRecord(input, "webhook success");
    assertExactKeys(input, ["deliveryId", "occurredAt", "outcomeCode"], "webhook success");
    assertUuid(input.deliveryId, "webhook success.deliveryId");
    assertIsoInstant(input.occurredAt, "webhook success.occurredAt");
    assertKey(input.outcomeCode, "webhook success.outcomeCode");
    const current = this.#currentDelivering(input.deliveryId, input.occurredAt);
    return this.#append({
      deliveryId: current.deliveryId,
      envelopeSha256: current.envelopeSha256,
      status: "delivered",
      attempt: current.attempt,
      occurredAt: input.occurredAt,
      retryAt: null,
      outcomeCode: input.outcomeCode,
    });
  }

  fail(input: {
    readonly deliveryId: string;
    readonly occurredAt: string;
    readonly outcomeCode: string;
    readonly retryable: boolean;
  }): WebhookDeliveryEvent {
    assertPlainRecord(input, "webhook failure");
    assertExactKeys(
      input,
      ["deliveryId", "occurredAt", "outcomeCode", "retryable"],
      "webhook failure",
    );
    assertUuid(input.deliveryId, "webhook failure.deliveryId");
    assertIsoInstant(input.occurredAt, "webhook failure.occurredAt");
    assertKey(input.outcomeCode, "webhook failure.outcomeCode");
    if (typeof input.retryable !== "boolean") {
      throw new TypeError("webhook failure.retryable must be boolean");
    }
    const current = this.#currentDelivering(input.deliveryId, input.occurredAt);
    const retry = input.retryable && current.attempt < this.#endpoint.maxAttempts;
    const retrySeconds = Math.min(
      this.#endpoint.maxRetrySeconds,
      this.#endpoint.baseRetrySeconds * 2 ** (current.attempt - 1),
    );
    return this.#append({
      deliveryId: current.deliveryId,
      envelopeSha256: current.envelopeSha256,
      status: retry ? "retry_scheduled" : "dead_lettered",
      attempt: current.attempt,
      occurredAt: input.occurredAt,
      retryAt: retry
        ? new Date(Date.parse(input.occurredAt) + retrySeconds * 1_000).toISOString()
        : null,
      outcomeCode: input.outcomeCode,
    });
  }

  events(): readonly WebhookDeliveryEvent[] {
    return deepFreeze(cloneCanonical(this.#events));
  }

  static verifyReplay(endpoint: WebhookEndpoint, events: readonly WebhookDeliveryEvent[]): void {
    assertWebhookEndpointIntegrity(endpoint);
    verifyHashChain(events, "webhook delivery events");
    const current = new Map<string, WebhookDeliveryEvent>();
    let previousOccurredAt: string | null = null;
    for (const [index, event] of events.entries()) {
      assertPlainRecord(event, `webhook delivery events[${index}]`);
      assertExactKeys(
        event,
        [
          "schemaVersion",
          "sequence",
          "previousEventSha256",
          "eventSha256",
          "deliveryId",
          "endpointId",
          "organizationId",
          "envelopeSha256",
          "status",
          "attempt",
          "occurredAt",
          "retryAt",
          "outcomeCode",
        ],
        `webhook delivery events[${index}]`,
      );
      if (event.schemaVersion !== 1) {
        throw new TypeError(`webhook delivery events[${index}] has an unsupported schema`);
      }
      assertUuid(event.deliveryId, `webhook delivery events[${index}].deliveryId`);
      assertUuid(event.endpointId, `webhook delivery events[${index}].endpointId`);
      assertUuid(event.organizationId, `webhook delivery events[${index}].organizationId`);
      assertSha256(event.envelopeSha256, `webhook delivery events[${index}].envelopeSha256`);
      assertInteger(event.attempt, `webhook delivery events[${index}].attempt`, 0, 20);
      assertIsoInstant(event.occurredAt, `webhook delivery events[${index}].occurredAt`);
      if (event.retryAt !== null) {
        assertIsoInstant(event.retryAt, `webhook delivery events[${index}].retryAt`);
      }
      if (event.outcomeCode !== null) {
        assertKey(event.outcomeCode, `webhook delivery events[${index}].outcomeCode`);
      }
      if (
        event.endpointId !== endpoint.endpointId ||
        event.organizationId !== endpoint.organizationId
      ) {
        throw new TypeError(`webhook delivery events[${index}] crosses endpoint scope`);
      }
      const prior = current.get(event.deliveryId);
      if (prior === undefined) {
        if (
          event.status !== "queued" ||
          event.attempt !== 0 ||
          event.retryAt !== null ||
          event.outcomeCode !== null
        ) {
          throw new TypeError(`webhook delivery events[${index}] must start queued`);
        }
      } else if (event.status === "delivering") {
        if (
          (prior.status !== "queued" && prior.status !== "retry_scheduled") ||
          event.attempt !== prior.attempt + 1 ||
          event.retryAt !== null ||
          event.outcomeCode !== null ||
          (prior.retryAt !== null && compareInstants(event.occurredAt, prior.retryAt) < 0)
        ) {
          throw new TypeError(`webhook delivery events[${index}] has an invalid attempt`);
        }
      } else if (event.status === "retry_scheduled") {
        const expectedSeconds = Math.min(
          endpoint.maxRetrySeconds,
          endpoint.baseRetrySeconds * 2 ** (event.attempt - 1),
        );
        const expectedRetryAt = new Date(
          Date.parse(event.occurredAt) + expectedSeconds * 1_000,
        ).toISOString();
        if (
          prior.status !== "delivering" ||
          event.attempt !== prior.attempt ||
          event.attempt >= endpoint.maxAttempts ||
          event.retryAt !== expectedRetryAt ||
          event.outcomeCode === null
        ) {
          throw new TypeError(`webhook delivery events[${index}] has an invalid retry`);
        }
      } else if (event.status === "delivered" || event.status === "dead_lettered") {
        if (
          prior.status !== "delivering" ||
          event.attempt !== prior.attempt ||
          event.retryAt !== null ||
          event.outcomeCode === null
        ) {
          throw new TypeError(`webhook delivery events[${index}] has an invalid terminal state`);
        }
      } else {
        throw new TypeError(`webhook delivery events[${index}] repeats queued state`);
      }
      if (
        (previousOccurredAt !== null &&
          compareInstants(event.occurredAt, previousOccurredAt) < 0) ||
        (prior !== undefined &&
          (prior.envelopeSha256 !== event.envelopeSha256 ||
            compareInstants(event.occurredAt, prior.occurredAt) < 0))
      ) {
        throw new TypeError(`webhook delivery events[${index}] breaks envelope chronology`);
      }
      current.set(event.deliveryId, event);
      previousOccurredAt = event.occurredAt;
    }
  }

  #current(deliveryId: string): WebhookDeliveryEvent {
    const current = [...this.#events].reverse().find((event) => event.deliveryId === deliveryId);
    if (!current) throw new TypeError("webhook delivery does not exist");
    return current;
  }

  #currentDelivering(deliveryId: string, occurredAt: string): WebhookDeliveryEvent {
    const current = this.#current(deliveryId);
    if (current.status !== "delivering")
      throw new TypeError("webhook delivery has no active attempt");
    if (compareInstants(occurredAt, current.occurredAt) < 0) {
      throw new TypeError("webhook attempt outcome predates its start");
    }
    return current;
  }

  #append(
    input: Omit<
      WebhookDeliveryEvent,
      | "schemaVersion"
      | "sequence"
      | "previousEventSha256"
      | "eventSha256"
      | "endpointId"
      | "organizationId"
    >,
  ): WebhookDeliveryEvent {
    const previous = this.#events.at(-1);
    if (previous && compareInstants(input.occurredAt, previous.occurredAt) < 0) {
      throw new TypeError("webhook delivery event predates the ledger head");
    }
    const event = chainedEvent({
      schemaVersion: 1 as const,
      sequence: this.#events.length + 1,
      previousEventSha256: previous?.eventSha256 ?? null,
      endpointId: this.#endpoint.endpointId,
      organizationId: this.#endpoint.organizationId,
      ...input,
    });
    this.#events.push(event);
    return event;
  }
}
