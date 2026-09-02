import { describe, expect, it } from "vitest";

import { IDS, TIMES } from "./fixtures.test-helper.js";
import { chainedEvent } from "./internals.js";
import {
  assertWebhookEndpointIntegrity,
  createWebhookEndpoint,
  MemoryWebhookNonceStore,
  signWebhookEnvelope,
  verifyWebhookEnvelope,
  type WebhookDeliveryEvent,
  WebhookDeliveryLedger,
  type WebhookEndpointInput,
  type WebhookEnvelope,
} from "./webhooks.js";

const SECRET = "test-only-webhook-secret-material-32-bytes";

function endpoint(changes: Partial<WebhookEndpointInput> = {}) {
  return createWebhookEndpoint({
    endpointId: IDS.endpoint,
    organizationId: IDS.organization,
    url: "https://hooks.example.com/economyos",
    eventTypes: ["forecast.published", "scenario.completed"],
    signingKeyId: "webhook.key.v1",
    maxAttempts: 2,
    baseRetrySeconds: 10,
    maxRetrySeconds: 60,
    active: true,
    ...changes,
  });
}

function envelope(changes: Partial<Parameters<typeof signWebhookEnvelope>[0]> = {}) {
  return signWebhookEnvelope(
    {
      deliveryId: IDS.delivery,
      eventId: IDS.event,
      endpointId: IDS.endpoint,
      organizationId: IDS.organization,
      eventType: "forecast.published",
      occurredAt: TIMES.eval,
      signedAt: TIMES.eval,
      nonce: "nonce-0000000001",
      keyId: "webhook.key.v1",
      payload: { artifactId: IDS.artifact, status: "published" },
      ...changes,
    },
    SECRET,
  );
}

describe("webhook endpoint and signing", () => {
  it("creates strict endpoints with normalized event order", () => {
    const configured = endpoint();
    expect(configured.eventTypes).toEqual(["forecast.published", "scenario.completed"]);
    expect(Object.isFrozen(configured)).toBe(true);
    expect(() => endpoint({ url: "http://hooks.example.com" })).toThrow(/HTTPS/);
    expect(() => endpoint({ url: "https://user:pass@hooks.example.com" })).toThrow(/credential/);
    expect(() => endpoint({ url: "https://127.0.0.1/hooks" })).toThrow(/public DNS/);
    expect(() => endpoint({ eventTypes: ["forecast.published", "forecast.published"] })).toThrow(
      /duplicates/,
    );
    expect(() => endpoint({ baseRetrySeconds: 100, maxRetrySeconds: 10 })).toThrow(/maximum/);
    expect(() => endpoint({ active: "yes" as never })).toThrow(/boolean/);
    expect(() => assertWebhookEndpointIntegrity(configured)).not.toThrow();
    expect(() => new WebhookDeliveryLedger({ ...configured, active: false })).toThrow(
      /digest|canonical/,
    );
  });

  it("signs canonical payloads deterministically and binds every envelope field", () => {
    const first = envelope({ payload: { b: 2, a: 1 } });
    const second = envelope({ payload: { a: 1, b: 2 } });
    expect(first.signature).toBe(second.signature);
    expect(first.payloadSha256).toBe(second.payloadSha256);
    expect(() => envelope({ occurredAt: TIMES.next, signedAt: TIMES.eval })).toThrow(/after/);
    expect(() =>
      signWebhookEnvelope(
        {
          deliveryId: IDS.delivery,
          eventId: IDS.event,
          endpointId: IDS.endpoint,
          organizationId: IDS.organization,
          eventType: "forecast.published",
          occurredAt: TIMES.eval,
          signedAt: TIMES.eval,
          nonce: "nonce",
          keyId: "webhook.key.v1",
          payload: { unsafe: 0.1 },
        },
        SECRET,
      ),
    ).toThrow(/inexact/);
    const signed = envelope();
    const {
      schemaVersion: _schemaVersion,
      payloadSha256: _payloadSha256,
      signature: _signature,
      ...unsigned
    } = signed;
    expect(() => signWebhookEnvelope(unsigned, "short")).toThrow(/32/);
  });
});

describe("webhook verification", () => {
  function verify(
    candidate: WebhookEnvelope,
    changes: Partial<Parameters<typeof verifyWebhookEnvelope>[0]> = {},
  ) {
    return verifyWebhookEnvelope({
      envelope: candidate,
      receivedAt: TIMES.next,
      maxAgeSeconds: 600,
      maximumFutureSkewSeconds: 30,
      resolveSecret: () => SECRET,
      nonces: new MemoryWebhookNonceStore(),
      ...changes,
    });
  }

  it("accepts once and rejects nonce replay", () => {
    const nonces = new MemoryWebhookNonceStore();
    const signed = envelope();
    const first = verify(signed, { nonces });
    const second = verify(signed, { nonces });
    expect(first).toMatchObject({ accepted: true, reason: "accepted" });
    expect(second).toMatchObject({ accepted: false, reason: "nonce_replayed" });
    expect(nonces.prune(TIMES.expiry)).toBe(1);
    expect(nonces.prune(TIMES.expiry)).toBe(0);
  });

  it.each([
    ["unknown_key", { resolveSecret: () => null }],
    ["timestamp_too_old", { receivedAt: TIMES.muchLater, maxAgeSeconds: 30 }],
    ["timestamp_too_old", { receivedAt: "2026-01-03T00:10:00Z", maxAgeSeconds: 600 }],
  ] as const)("returns %s without consuming the nonce", (reason, changes) => {
    expect(verify(envelope(), changes)).toMatchObject({ accepted: false, reason });
  });

  it("rejects invalid signatures, future timestamps, payload tampering, and bad verifier ports", () => {
    const signed = envelope();
    const badSignature = { ...signed, signature: "0".repeat(64) };
    expect(verify(badSignature)).toMatchObject({ reason: "signature_invalid" });

    const future = envelope({
      deliveryId: "b0000000-0000-4000-8000-000000000009",
      occurredAt: TIMES.next,
      signedAt: TIMES.next,
    });
    expect(verify(future, { receivedAt: TIMES.eval })).toMatchObject({
      reason: "timestamp_in_future",
    });

    const tampered = { ...signed, payload: { status: "changed" } } as WebhookEnvelope;
    expect(() => verify(tampered)).toThrow(/payload digest/);
    expect(() => verify(signed, { resolveSecret: "bad" as never })).toThrow(/function/);
    expect(() => verify(signed, { nonces: {} as never })).toThrow(/claim/);
  });
});

describe("webhook delivery state machine", () => {
  it("retries with deterministic backoff and reaches delivered", () => {
    const configured = endpoint();
    const ledger = new WebhookDeliveryLedger(configured);
    const signed = envelope();
    const queued = ledger.enqueue({ envelope: signed, queuedAt: TIMES.eval });
    expect(ledger.enqueue({ envelope: signed, queuedAt: TIMES.eval })).toBe(queued);
    ledger.beginAttempt({ deliveryId: IDS.delivery, occurredAt: TIMES.eval });
    const retry = ledger.fail({
      deliveryId: IDS.delivery,
      occurredAt: TIMES.next,
      outcomeCode: "endpoint.timeout",
      retryable: true,
    });
    expect(retry).toMatchObject({
      status: "retry_scheduled",
      retryAt: "2026-01-03T00:01:10.000Z",
    });
    expect(() => ledger.beginAttempt({ deliveryId: IDS.delivery, occurredAt: TIMES.next })).toThrow(
      /before retryAt/,
    );
    ledger.beginAttempt({
      deliveryId: IDS.delivery,
      occurredAt: "2026-01-03T00:01:10.000Z",
    });
    const delivered = ledger.succeed({
      deliveryId: IDS.delivery,
      occurredAt: "2026-01-03T00:01:11.000Z",
      outcomeCode: "http.204",
    });
    expect(delivered.status).toBe("delivered");
    WebhookDeliveryLedger.verifyReplay(configured, ledger.events());
  });

  it("dead-letters permanent and exhausted deliveries", () => {
    const configured = endpoint();
    const permanent = new WebhookDeliveryLedger(configured);
    permanent.enqueue({ envelope: envelope(), queuedAt: TIMES.eval });
    permanent.beginAttempt({ deliveryId: IDS.delivery, occurredAt: TIMES.eval });
    expect(
      permanent.fail({
        deliveryId: IDS.delivery,
        occurredAt: TIMES.next,
        outcomeCode: "http.410",
        retryable: false,
      }).status,
    ).toBe("dead_lettered");

    const exhausted = new WebhookDeliveryLedger(configured);
    exhausted.enqueue({ envelope: envelope(), queuedAt: TIMES.eval });
    exhausted.beginAttempt({ deliveryId: IDS.delivery, occurredAt: TIMES.eval });
    exhausted.fail({
      deliveryId: IDS.delivery,
      occurredAt: TIMES.next,
      outcomeCode: "http.503",
      retryable: true,
    });
    exhausted.beginAttempt({
      deliveryId: IDS.delivery,
      occurredAt: "2026-01-03T00:01:10.000Z",
    });
    expect(
      exhausted.fail({
        deliveryId: IDS.delivery,
        occurredAt: TIMES.later,
        outcomeCode: "http.503",
        retryable: true,
      }).status,
    ).toBe("dead_lettered");
  });

  it("rejects inactive/out-of-scope queues and invalid transitions", () => {
    expect(() =>
      new WebhookDeliveryLedger(endpoint({ active: false })).enqueue({
        envelope: envelope(),
        queuedAt: TIMES.eval,
      }),
    ).toThrow(/inactive/);
    expect(() =>
      new WebhookDeliveryLedger(endpoint()).enqueue({
        envelope: envelope({ eventType: "unknown.event" }),
        queuedAt: TIMES.eval,
      }),
    ).toThrow(/outside endpoint/);

    const ledger = new WebhookDeliveryLedger(endpoint());
    expect(() => ledger.enqueue({ envelope: envelope(), queuedAt: TIMES.issue })).toThrow(
      /before envelope signing/,
    );
    ledger.enqueue({ envelope: envelope(), queuedAt: TIMES.eval });
    expect(() =>
      ledger.succeed({
        deliveryId: IDS.delivery,
        occurredAt: TIMES.next,
        outcomeCode: "http.200",
      }),
    ).toThrow(/active attempt/);
    ledger.beginAttempt({ deliveryId: IDS.delivery, occurredAt: TIMES.eval });
    expect(() => ledger.beginAttempt({ deliveryId: IDS.delivery, occurredAt: TIMES.next })).toThrow(
      /not ready/,
    );
    expect(() =>
      ledger.fail({
        deliveryId: IDS.delivery,
        occurredAt: TIMES.grant,
        outcomeCode: "http.500",
        retryable: true,
      }),
    ).toThrow(/predates/);
  });

  it("rejects delivery identity reuse and detects replay tampering", () => {
    const configured = endpoint();
    const ledger = new WebhookDeliveryLedger(configured);
    ledger.enqueue({ envelope: envelope(), queuedAt: TIMES.eval });
    expect(() =>
      ledger.enqueue({
        envelope: envelope({ eventId: "b0000000-0000-4000-8000-000000000009" }),
        queuedAt: TIMES.eval,
      }),
    ).toThrow(/reused/);
    const tampered = JSON.parse(JSON.stringify(ledger.events())) as WebhookDeliveryEvent[];
    Object.assign(tampered[0] as WebhookDeliveryEvent, { attempt: 4 });
    expect(() => WebhookDeliveryLedger.verifyReplay(configured, tampered)).toThrow(/digest/);

    const queued = ledger.events()[0] as WebhookDeliveryEvent;
    const { eventSha256: _eventSha256, ...body } = queued;
    const invalid = chainedEvent({
      ...body,
      status: "delivering" as const,
      attempt: 1,
      outcomeCode: "http.200",
    }) as WebhookDeliveryEvent;
    expect(() => WebhookDeliveryLedger.verifyReplay(configured, [invalid])).toThrow(/start queued/);
  });
});
