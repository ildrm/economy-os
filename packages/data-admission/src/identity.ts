import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type {
  IngestionAuthorizationClaims,
  IngestionAuthorizationEnvelope,
  IngestionWorkflowInput,
  ParserIdentity,
  QualityPolicy,
  WorldBankWdiConnectorInput,
} from "./workflow-contracts.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_INSTANT =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d{1,6}))?Z$/;
const ASCII_JSON_KEY = /^[\x20-\x7e]{1,256}$/;
const MAX_CANONICAL_DECIMAL_PLACES = 6;
const AUTHORIZATION_KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const AUTHORIZATION_DOMAIN = "economyos:ingestion-authorization:v1\n";

export const MAX_INGESTION_AUTHORIZATION_TTL_MS = 15 * 60 * 1_000;
export const DEFAULT_INGESTION_AUTHORIZATION_TTL_MS = 5 * 60 * 1_000;

/**
 * Provenance of the only parser artifact installed in the Phase 2 worker.
 * The worker test hashes packages/canonical-data/src/world-bank.ts so source
 * changes cannot silently retain this identity.
 */
export const WORLD_BANK_WDI_PARSER_IDENTITY: ParserIdentity = Object.freeze({
  name: "world-bank-wdi",
  version: "1.0.0",
  codeSha256: "b68d8e249d57cf6fab6f51382edef1101d19056bcb2b75ac89c8daf054925a8d",
  configuration: Object.freeze({ sourceId: 2 }),
  configurationSha256: "2a35dbceb04e1b04c77a6276c4ac799ca5370d0ffeea44707db97cdcd1b7b383",
});

export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJson[]
  | { readonly [key: string]: CanonicalJson };

function assertPortableString(value: string, path: string): string {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit === 0) throw new TypeError(`${path} contains a null character`);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) {
        throw new TypeError(`${path} contains an unpaired Unicode surrogate`);
      }
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) {
        throw new TypeError(`${path} contains an unpaired Unicode surrogate`);
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError(`${path} contains an unpaired Unicode surrogate`);
    }
  }
  return value;
}

function normalizeJson(value: unknown, path: string, seen: Set<object>): CanonicalJson {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return assertPortableString(value, path);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number`);
    const normalized = Object.is(value, -0) ? 0 : value;
    if (
      !Number.isSafeInteger(normalized) &&
      (Math.abs(normalized) >= 1_000_000_000_000_000 ||
        (normalized !== 0 && Math.abs(normalized) < 0.000001) ||
        Math.round(normalized * 10 ** MAX_CANONICAL_DECIMAL_PLACES) /
          10 ** MAX_CANONICAL_DECIMAL_PLACES !==
          normalized)
    ) {
      throw new TypeError(`${path} has unsupported numeric precision for canonical JSON`);
    }
    return normalized;
  }
  if (typeof value !== "object") throw new TypeError(`${path} is not JSON serializable`);
  if (seen.has(value)) throw new TypeError(`${path} contains a cycle`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => normalizeJson(item, `${path}[${index}]`, seen));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain only plain JSON objects`);
    }
    // A null prototype is required because JSON permits an own "__proto__" key.
    // Assigning that key to a normal object invokes its legacy prototype setter
    // and would silently remove input from the digest.
    const result = Object.create(null) as Record<string, CanonicalJson>;
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (!ASCII_JSON_KEY.test(key)) {
        throw new TypeError(`${path} contains a non-ASCII or oversized JSON key`);
      }
      result[key] = normalizeJson((value as Record<string, unknown>)[key], `${path}.${key}`, seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value, "value", new Set()));
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function digestJson(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

export function deterministicUuid(...parts: readonly string[]): string {
  if (parts.length === 0 || parts.some((part) => part.length === 0)) {
    throw new TypeError("deterministic UUID parts must be non-empty");
  }
  const hash = createHash("sha256");
  for (const part of parts) {
    const bytes = Buffer.from(part, "utf8");
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(bytes.byteLength);
    hash.update(length);
    hash.update(bytes);
  }
  const bytes = hash.digest().subarray(0, 16);
  const versionByte = bytes[6];
  const variantByte = bytes[8];
  if (versionByte === undefined || variantByte === undefined) throw new Error("SHA-256 failed");
  bytes[6] = (versionByte & 0x0f) | 0x80;
  bytes[8] = (variantByte & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function assertUuid(value: string, field: string): string {
  if (!UUID.test(value)) throw new TypeError(`${field} must be a lowercase UUID`);
  return value;
}

export function assertSha256(value: string, field: string): string {
  if (!SHA256.test(value)) throw new TypeError(`${field} must be a lowercase SHA-256 digest`);
  return value;
}

export function assertIsoInstant(value: string, field: string): string {
  const match = ISO_INSTANT.exec(value);
  if (!match?.groups) {
    throw new TypeError(`${field} must be a valid RFC 3339 UTC instant`);
  }
  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);
  const second = Number(match.groups.second);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > (days[month - 1] ?? 0) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new TypeError(`${field} must be a valid RFC 3339 UTC instant`);
  }
  return value;
}

function assertParser(parser: ParserIdentity): void {
  if (!parser.name.trim() || parser.name.length > 200)
    throw new TypeError("parser name is invalid");
  if (!parser.version.trim() || parser.version.length > 200) {
    throw new TypeError("parser version is invalid");
  }
  assertSha256(parser.codeSha256, "parser.codeSha256");
  assertSha256(parser.configurationSha256, "parser.configurationSha256");
  const calculated = digestJson(parser.configuration);
  if (calculated !== parser.configurationSha256) {
    throw new TypeError("parser configuration digest does not match its canonical JSON");
  }
  if (
    parser.name !== WORLD_BANK_WDI_PARSER_IDENTITY.name ||
    parser.version !== WORLD_BANK_WDI_PARSER_IDENTITY.version ||
    parser.codeSha256 !== WORLD_BANK_WDI_PARSER_IDENTITY.codeSha256 ||
    parser.configurationSha256 !== WORLD_BANK_WDI_PARSER_IDENTITY.configurationSha256
  ) {
    throw new TypeError("parser identity does not match the installed World Bank parser");
  }
}

function assertQualityPolicy(policy: QualityPolicy): void {
  if (
    policy.requiredPitQuality !== "true_vintage" &&
    policy.requiredPitQuality !== "reconstructed_only" &&
    policy.requiredPitQuality !== "latest_revised_only"
  ) {
    throw new TypeError("requiredPitQuality is invalid");
  }
  if (typeof policy.allowEmptyPayload !== "boolean") {
    throw new TypeError("allowEmptyPayload must be a boolean");
  }
  if (
    !Number.isFinite(policy.minimumCompleteness) ||
    policy.minimumCompleteness < 0 ||
    policy.minimumCompleteness > 1
  ) {
    throw new TypeError("minimumCompleteness must be between zero and one");
  }
  if (
    Math.round(policy.minimumCompleteness * 1_000_000) / 1_000_000 !==
    policy.minimumCompleteness
  ) {
    throw new TypeError("minimumCompleteness supports at most six decimal places");
  }
  if (
    !Number.isSafeInteger(policy.maximumRows) ||
    policy.maximumRows < 1 ||
    policy.maximumRows > 1_000_000
  ) {
    throw new TypeError("maximumRows must be an integer between 1 and 1000000");
  }
}

function assertConnector(connector: WorldBankWdiConnectorInput): void {
  if (connector.type !== "world-bank-wdi") {
    throw new TypeError("connector type is not supported");
  }
  if (!/^[A-Z]{3}$/.test(connector.countryCode)) {
    throw new TypeError("connector countryCode must be ISO alpha-3");
  }
  if (!/^[A-Z0-9._]{2,64}$/.test(connector.indicatorCode)) {
    throw new TypeError("connector indicatorCode is invalid");
  }
  if (
    !Number.isInteger(connector.startYear) ||
    !Number.isInteger(connector.endYear) ||
    connector.startYear < 1800 ||
    connector.endYear > 2200 ||
    connector.endYear < connector.startYear ||
    connector.endYear - connector.startYear > 200
  ) {
    throw new TypeError("connector year range is invalid");
  }
}

export interface CreateIngestionWorkflowInput {
  readonly organizationId: string | null;
  readonly datasetId: string;
  readonly seriesId: string;
  readonly idempotencyToken: string;
  readonly requestedAt: string;
  readonly connector: WorldBankWdiConnectorInput;
  readonly parser: ParserIdentity;
  readonly qualityPolicy: QualityPolicy;
}

export interface IngestionAuthorizationSigningOptions {
  readonly keyId: string;
  readonly key: Uint8Array;
  readonly issuedAt?: string;
  readonly expiresAt?: string;
  readonly ttlMs?: number;
  readonly nonce?: string;
  readonly clock?: () => Date;
}

export interface IngestionAuthorizationVerificationOptions {
  readonly keys: ReadonlyMap<string, Uint8Array> | Readonly<Record<string, Uint8Array | undefined>>;
  readonly now?: Date;
  readonly maximumTtlMs?: number;
  readonly clockSkewMs?: number;
}

type UnsignedIngestionWorkflowInput = Omit<IngestionWorkflowInput, "authorization">;

function authorizationKey(key: Uint8Array): Buffer {
  const copied = Buffer.from(key);
  if (copied.byteLength < 32 || copied.byteLength > 64) {
    throw new TypeError("ingestion authorization keys must contain between 32 and 64 bytes");
  }
  return copied;
}

function assertKeyId(keyId: string): string {
  if (!AUTHORIZATION_KEY_ID.test(keyId)) {
    throw new TypeError("ingestion authorization keyId is invalid");
  }
  return keyId;
}

function assertNonce(nonce: string): string {
  if (!BASE64URL.test(nonce)) throw new TypeError("ingestion authorization nonce is invalid");
  const decoded = Buffer.from(nonce, "base64url");
  if (
    decoded.byteLength < 16 ||
    decoded.byteLength > 64 ||
    decoded.toString("base64url") !== nonce
  ) {
    throw new TypeError("ingestion authorization nonce must be canonical base64url (16-64 bytes)");
  }
  return nonce;
}

function assertAuthorizationLifetime(
  issuedAt: string,
  expiresAt: string,
  maximumTtlMs: number,
): { readonly issuedAtMs: number; readonly expiresAtMs: number } {
  assertIsoInstant(issuedAt, "authorization.issuedAt");
  assertIsoInstant(expiresAt, "authorization.expiresAt");
  if (
    !Number.isSafeInteger(maximumTtlMs) ||
    maximumTtlMs < 1_000 ||
    maximumTtlMs > MAX_INGESTION_AUTHORIZATION_TTL_MS
  ) {
    throw new TypeError(
      `authorization maximum TTL must be between 1000 and ${MAX_INGESTION_AUTHORIZATION_TTL_MS} milliseconds`,
    );
  }
  const issuedAtMs = Date.parse(issuedAt);
  const expiresAtMs = Date.parse(expiresAt);
  if (expiresAtMs <= issuedAtMs || expiresAtMs - issuedAtMs > maximumTtlMs) {
    throw new TypeError("ingestion authorization lifetime is invalid or exceeds the maximum TTL");
  }
  return { issuedAtMs, expiresAtMs };
}

function expectedAuthorizationClaims(
  input: UnsignedIngestionWorkflowInput,
  issuedAt: string,
  expiresAt: string,
  nonce: string,
): IngestionAuthorizationClaims {
  return Object.freeze({
    schemaVersion: 1 as const,
    organizationScope:
      input.organizationId === null
        ? Object.freeze({ type: "global" as const })
        : Object.freeze({ type: "tenant" as const, organizationId: input.organizationId }),
    datasetId: input.datasetId,
    seriesId: input.seriesId,
    connectorSha256: digestJson(input.connector),
    parserSha256: digestJson(input.parser),
    configurationSha256: digestJson({
      connector: input.connector,
      parserConfiguration: input.parser.configuration,
      qualityPolicy: input.qualityPolicy,
    }),
    inputSha256: input.inputSha256,
    runId: input.runId,
    workflowId: input.workflowId,
    issuedAt,
    expiresAt,
    nonce,
  });
}

function authorizationMessage(keyId: string, claims: IngestionAuthorizationClaims): string {
  return `${AUTHORIZATION_DOMAIN}${canonicalJson({
    schemaVersion: 1,
    algorithm: "hmac-sha256",
    keyId,
    claims,
  })}`;
}

function signAuthorization(
  input: UnsignedIngestionWorkflowInput,
  options: IngestionAuthorizationSigningOptions,
): IngestionAuthorizationEnvelope {
  const keyId = assertKeyId(options.keyId);
  const key = authorizationKey(options.key);
  const clock = options.clock ?? (() => new Date());
  const issuedAt = options.issuedAt ?? clock().toISOString();
  const issuedAtMs = Date.parse(assertIsoInstant(issuedAt, "authorization.issuedAt"));
  const ttlMs = options.ttlMs ?? DEFAULT_INGESTION_AUTHORIZATION_TTL_MS;
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > MAX_INGESTION_AUTHORIZATION_TTL_MS) {
    throw new TypeError(
      `authorization ttlMs must be between 1000 and ${MAX_INGESTION_AUTHORIZATION_TTL_MS}`,
    );
  }
  const expiresAt = options.expiresAt ?? new Date(issuedAtMs + ttlMs).toISOString();
  assertAuthorizationLifetime(issuedAt, expiresAt, MAX_INGESTION_AUTHORIZATION_TTL_MS);
  const nonce = assertNonce(options.nonce ?? randomBytes(24).toString("base64url"));
  const claims = expectedAuthorizationClaims(input, issuedAt, expiresAt, nonce);
  let signatureSha256: string;
  try {
    signatureSha256 = createHmac("sha256", key)
      .update(authorizationMessage(keyId, claims))
      .digest("hex");
  } finally {
    key.fill(0);
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    algorithm: "hmac-sha256" as const,
    keyId,
    claims,
    signatureSha256,
  });
}

function assertAuthorizationContext(input: IngestionWorkflowInput): IngestionAuthorizationEnvelope {
  const envelope = input.authorization;
  if (
    envelope?.schemaVersion !== 1 ||
    envelope.algorithm !== "hmac-sha256" ||
    typeof envelope.signatureSha256 !== "string"
  ) {
    throw new TypeError("ingestion authorization envelope is invalid");
  }
  assertKeyId(envelope.keyId);
  assertSha256(envelope.signatureSha256, "authorization.signatureSha256");
  assertNonce(envelope.claims?.nonce ?? "");
  assertAuthorizationLifetime(
    envelope.claims?.issuedAt ?? "",
    envelope.claims?.expiresAt ?? "",
    MAX_INGESTION_AUTHORIZATION_TTL_MS,
  );
  const { authorization: _authorization, ...unsigned } = input;
  const expected = expectedAuthorizationClaims(
    unsigned,
    envelope.claims.issuedAt,
    envelope.claims.expiresAt,
    envelope.claims.nonce,
  );
  if (digestJson(envelope.claims) !== digestJson(expected)) {
    throw new TypeError("ingestion authorization does not match the workflow context");
  }
  return envelope;
}

function verificationKey(
  keys: IngestionAuthorizationVerificationOptions["keys"],
  keyId: string,
): Uint8Array | undefined {
  if ("get" in keys && typeof keys.get === "function") return keys.get(keyId);
  return (keys as Readonly<Record<string, Uint8Array | undefined>>)[keyId];
}

export function verifyIngestionWorkflowAuthorization(
  input: IngestionWorkflowInput,
  options: IngestionAuthorizationVerificationOptions,
): IngestionAuthorizationClaims {
  const envelope = assertAuthorizationContext(input);
  const maximumTtlMs = options.maximumTtlMs ?? MAX_INGESTION_AUTHORIZATION_TTL_MS;
  const { issuedAtMs, expiresAtMs } = assertAuthorizationLifetime(
    envelope.claims.issuedAt,
    envelope.claims.expiresAt,
    maximumTtlMs,
  );
  const clockSkewMs = options.clockSkewMs ?? 0;
  if (!Number.isSafeInteger(clockSkewMs) || clockSkewMs < 0 || clockSkewMs > 60_000) {
    throw new TypeError("authorization clock skew must be between zero and 60000 milliseconds");
  }
  const nowMs = (options.now ?? new Date()).getTime();
  if (!Number.isFinite(nowMs)) throw new TypeError("authorization verification time is invalid");
  if (nowMs + clockSkewMs < issuedAtMs) {
    throw new TypeError("ingestion authorization is not active yet");
  }
  if (nowMs - clockSkewMs >= expiresAtMs) {
    throw new TypeError("ingestion authorization has expired");
  }
  const configuredKey = verificationKey(options.keys, envelope.keyId);
  const key = configuredKey ? authorizationKey(configuredKey) : Buffer.alloc(32);
  let expected: Buffer;
  try {
    expected = createHmac("sha256", key)
      .update(authorizationMessage(envelope.keyId, envelope.claims))
      .digest();
  } finally {
    key.fill(0);
  }
  const supplied = Buffer.from(envelope.signatureSha256, "hex");
  let valid = false;
  try {
    valid = timingSafeEqual(expected, supplied);
  } finally {
    expected.fill(0);
    supplied.fill(0);
  }
  if (!configuredKey || !valid) {
    throw new TypeError("ingestion authorization signature is invalid");
  }
  return envelope.claims;
}

export function createIngestionWorkflowInput(
  input: CreateIngestionWorkflowInput,
  authorization: IngestionAuthorizationSigningOptions,
): IngestionWorkflowInput {
  if (input.organizationId !== null) assertUuid(input.organizationId, "organizationId");
  assertUuid(input.datasetId, "datasetId");
  assertUuid(input.seriesId, "seriesId");
  assertIsoInstant(input.requestedAt, "requestedAt");
  if (!input.idempotencyToken.trim() || input.idempotencyToken.length > 1_024) {
    throw new TypeError("idempotencyToken must contain between 1 and 1024 characters");
  }
  assertConnector(input.connector);
  assertParser(input.parser);
  assertQualityPolicy(input.qualityPolicy);

  const idempotencyKey = sha256Hex(input.idempotencyToken);
  const runId = deterministicUuid(
    "economyos:ingestion-run:v1",
    input.organizationId ?? "global",
    input.datasetId,
    idempotencyKey,
  );
  const manifest = {
    schemaVersion: 1,
    runId,
    organizationId: input.organizationId,
    datasetId: input.datasetId,
    seriesId: input.seriesId,
    idempotencyKey,
    requestedAt: input.requestedAt,
    connector: input.connector,
    parser: input.parser,
    qualityPolicy: input.qualityPolicy,
  } as const;
  const inputSha256 = digestJson(manifest);
  const unsigned = Object.freeze({
    ...manifest,
    workflowId: `economyos-ingestion-${runId}-${inputSha256}`,
    inputSha256,
  });
  return Object.freeze({ ...unsigned, authorization: signAuthorization(unsigned, authorization) });
}

export function assertWorkflowInput(input: IngestionWorkflowInput): IngestionWorkflowInput {
  if (input.schemaVersion !== 1) throw new TypeError("workflow schemaVersion must be 1");
  // The private idempotency token is already digested, so validate the public
  // manifest directly instead of recreating it through the signing factory.
  if (input.organizationId !== null) assertUuid(input.organizationId, "organizationId");
  assertUuid(input.datasetId, "datasetId");
  assertUuid(input.seriesId, "seriesId");
  assertIsoInstant(input.requestedAt, "requestedAt");
  assertConnector(input.connector);
  assertParser(input.parser);
  assertQualityPolicy(input.qualityPolicy);
  assertSha256(input.idempotencyKey, "idempotencyKey");
  assertUuid(input.runId, "runId");
  const expectedRunId = deterministicUuid(
    "economyos:ingestion-run:v1",
    input.organizationId ?? "global",
    input.datasetId,
    input.idempotencyKey,
  );
  if (input.runId !== expectedRunId) throw new TypeError("runId does not match its identity");
  const {
    inputSha256: _inputSha256,
    workflowId: _workflowId,
    authorization: _authorization,
    ...manifest
  } = input;
  if (digestJson(manifest) !== input.inputSha256) {
    throw new TypeError("inputSha256 does not match the workflow manifest");
  }
  if (input.workflowId !== `economyos-ingestion-${input.runId}-${input.inputSha256}`) {
    throw new TypeError("workflowId does not match the run and input manifest");
  }
  assertAuthorizationContext(input);
  return input;
}

export function transformationConfiguration(input: IngestionWorkflowInput): Readonly<{
  parser: Readonly<Record<string, unknown>>;
  qualityPolicy: QualityPolicy;
}> {
  return Object.freeze({
    parser: input.parser.configuration,
    qualityPolicy: input.qualityPolicy,
  });
}
