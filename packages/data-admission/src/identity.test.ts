import { describe, expect, it } from "vitest";

import {
  assertWorkflowInput,
  canonicalJson,
  createIngestionWorkflowInput,
  deterministicUuid,
  digestJson,
  sha256Hex,
  verifyIngestionWorkflowAuthorization,
  WORLD_BANK_WDI_PARSER_IDENTITY,
} from "./index.js";

const AUTHORIZATION_KEY = new TextEncoder().encode(
  "economyos-identity-test-authorization-key-only",
);
const AUTHORIZATION = {
  keyId: "identity-test-v1",
  key: AUTHORIZATION_KEY,
  issuedAt: "2026-08-31T09:59:00.000Z",
  expiresAt: "2026-08-31T10:09:00.000Z",
  nonce: "aWRlbnRpdHktdGVzdC1ub25jZS0wMDAx",
} as const;

function createInput(token = "scheduled:usa-gdp:2026-08-31") {
  return createIngestionWorkflowInput(
    {
      organizationId: null,
      datasetId: "038f47ac-19fc-7c92-ae91-0242ac120003",
      seriesId: "038f47ac-19fc-7c92-ae91-0242ac120007",
      idempotencyToken: token,
      requestedAt: "2026-08-31T10:00:00.000Z",
      connector: {
        type: "world-bank-wdi",
        countryCode: "USA",
        indicatorCode: "NY.GDP.MKTP.CD",
        startYear: 2020,
        endYear: 2025,
      },
      parser: WORLD_BANK_WDI_PARSER_IDENTITY,
      qualityPolicy: {
        minimumCompleteness: 0.8,
        maximumRows: 10,
        requiredPitQuality: "latest_revised_only",
        allowEmptyPayload: false,
      },
    },
    AUTHORIZATION,
  );
}

describe("canonical ingestion identity", () => {
  it("canonicalizes nested object keys and preserves array order", () => {
    expect(canonicalJson({ z: 1, a: { y: true, x: [2, 1] } })).toBe(
      '{"a":{"x":[2,1],"y":true},"z":1}',
    );
    expect(digestJson({ b: 2, a: 1 })).toBe(digestJson({ a: 1, b: 2 }));
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    const prototypeKey = JSON.parse('{"__proto__":"admitted","a":1}') as unknown;
    expect(canonicalJson(prototypeKey)).toBe('{"__proto__":"admitted","a":1}');
    expect(digestJson(prototypeKey)).not.toBe(digestJson({ a: 1 }));
  });

  it("rejects values that cannot be portable canonical JSON", () => {
    expect(() => canonicalJson({ value: Number.NaN })).toThrow("non-finite");
    expect(() => canonicalJson({ value: 1 / 3 })).toThrow("numeric precision");
    expect(() => canonicalJson({ value: undefined })).toThrow("not JSON serializable");
    expect(() => canonicalJson({ café: true })).toThrow("non-ASCII");
    expect(() => canonicalJson({ value: "\u0000" })).toThrow("null character");
    expect(() => canonicalJson({ value: "\ud800" })).toThrow("unpaired Unicode");
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow("cycle");
    expect(() => canonicalJson(new Date())).toThrow("plain JSON objects");
  });

  it("creates stable RFC 9562 UUIDv8 identities with length-delimited inputs", () => {
    const first = deterministicUuid("ab", "c");
    expect(first).toBe(deterministicUuid("ab", "c"));
    expect(first).not.toBe(deterministicUuid("a", "bc"));
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("binds a private idempotency token to one validated workflow manifest", () => {
    const first = createInput();
    const replay = createInput();
    expect(replay).toEqual(first);
    expect(first.idempotencyKey).toHaveLength(64);
    expect(first.idempotencyKey).not.toContain("scheduled");
    expect(first.workflowId).toBe(`economyos-ingestion-${first.runId}-${first.inputSha256}`);
    const {
      inputSha256: _inputSha256,
      workflowId: _workflowId,
      authorization: _authorization,
      ...manifest
    } = first;
    expect(digestJson(manifest)).toBe(first.inputSha256);
    expect(assertWorkflowInput(first)).toBe(first);
    expect(createInput("another-run").runId).not.toBe(first.runId);
  });

  it("rejects a tampered workflow manifest or parser configuration", () => {
    const input = createInput();
    expect(() => assertWorkflowInput({ ...input, seriesId: input.datasetId })).toThrow(
      "inputSha256",
    );
    expect(() =>
      createIngestionWorkflowInput(
        {
          organizationId: input.organizationId,
          datasetId: input.datasetId,
          seriesId: input.seriesId,
          idempotencyToken: "new",
          requestedAt: input.requestedAt,
          connector: input.connector,
          parser: { ...input.parser, configuration: { sourceId: 3 } },
          qualityPolicy: input.qualityPolicy,
        },
        AUTHORIZATION,
      ),
    ).toThrow("configuration digest");
  });

  it("signs a short-lived authorization envelope and verifies rotated keys", () => {
    const input = createInput();
    expect(
      verifyIngestionWorkflowAuthorization(input, {
        keys: new Map([
          ["retired-v1", new TextEncoder().encode("economyos-retired-authorization-key-only-0001")],
          [AUTHORIZATION.keyId, AUTHORIZATION_KEY],
        ]),
        now: new Date("2026-08-31T10:00:00.000Z"),
      }),
    ).toMatchObject({
      organizationScope: { type: "global" },
      datasetId: input.datasetId,
      seriesId: input.seriesId,
      runId: input.runId,
      workflowId: input.workflowId,
    });

    expect(() =>
      verifyIngestionWorkflowAuthorization(input, {
        keys: { [AUTHORIZATION.keyId]: new Uint8Array(32).fill(7) },
        now: new Date("2026-08-31T10:00:00.000Z"),
      }),
    ).toThrow("signature is invalid");
    expect(() =>
      verifyIngestionWorkflowAuthorization(input, {
        keys: { [AUTHORIZATION.keyId]: AUTHORIZATION_KEY },
        now: new Date("2026-08-31T10:09:00.000Z"),
      }),
    ).toThrow("has expired");

    const changedClaims = {
      ...input.authorization.claims,
      seriesId: input.datasetId,
    };
    expect(() =>
      assertWorkflowInput({
        ...input,
        authorization: { ...input.authorization, claims: changedClaims },
      }),
    ).toThrow("does not match the workflow context");
  });

  it("binds changed input to a distinct workflow while preserving the idempotency run", () => {
    const first = createInput();
    const changed = createIngestionWorkflowInput(
      {
        organizationId: first.organizationId,
        datasetId: first.datasetId,
        seriesId: first.seriesId,
        idempotencyToken: "scheduled:usa-gdp:2026-08-31",
        requestedAt: first.requestedAt,
        connector: { ...first.connector, startYear: 2021 },
        parser: first.parser,
        qualityPolicy: first.qualityPolicy,
      },
      AUTHORIZATION,
    );
    expect(changed.runId).toBe(first.runId);
    expect(changed.inputSha256).not.toBe(first.inputSha256);
    expect(changed.workflowId).not.toBe(first.workflowId);
  });

  it("rejects invalid calendar instants, connector discriminators, and excess policy precision", () => {
    const input = createInput();
    expect(() => assertWorkflowInput({ ...input, schemaVersion: 2 as 1 })).toThrow("schemaVersion");
    expect(() =>
      createIngestionWorkflowInput(
        {
          organizationId: input.organizationId,
          datasetId: input.datasetId,
          seriesId: input.seriesId,
          idempotencyToken: "bad-date",
          requestedAt: "2026-02-30T10:00:00Z",
          connector: input.connector,
          parser: input.parser,
          qualityPolicy: input.qualityPolicy,
        },
        AUTHORIZATION,
      ),
    ).toThrow("valid RFC 3339");
    expect(() =>
      createIngestionWorkflowInput(
        {
          organizationId: input.organizationId,
          datasetId: input.datasetId,
          seriesId: input.seriesId,
          idempotencyToken: "bad-policy",
          requestedAt: input.requestedAt,
          connector: input.connector,
          parser: input.parser,
          qualityPolicy: { ...input.qualityPolicy, minimumCompleteness: 0.1234567 },
        },
        AUTHORIZATION,
      ),
    ).toThrow("six decimal places");
    expect(() =>
      createIngestionWorkflowInput(
        {
          organizationId: input.organizationId,
          datasetId: input.datasetId,
          seriesId: input.seriesId,
          idempotencyToken: "bad-policy-type",
          requestedAt: input.requestedAt,
          connector: input.connector,
          parser: input.parser,
          qualityPolicy: {
            ...input.qualityPolicy,
            allowEmptyPayload: "false" as unknown as boolean,
          },
        },
        AUTHORIZATION,
      ),
    ).toThrow("allowEmptyPayload must be a boolean");
    expect(() =>
      createIngestionWorkflowInput(
        {
          organizationId: input.organizationId,
          datasetId: input.datasetId,
          seriesId: input.seriesId,
          idempotencyToken: "uninstalled-parser",
          requestedAt: input.requestedAt,
          connector: input.connector,
          parser: { ...input.parser, codeSha256: "a".repeat(64) },
          qualityPolicy: input.qualityPolicy,
        },
        AUTHORIZATION,
      ),
    ).toThrow("installed World Bank parser");
  });
});
