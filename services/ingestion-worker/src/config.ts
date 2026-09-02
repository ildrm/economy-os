import type { ObjectStorageConfig } from "@economyos/object-storage";

export interface WorkerConfig {
  readonly databaseUrl: string;
  readonly temporal: {
    readonly address: string;
    readonly namespace: string;
    readonly taskQueue: string;
    readonly tls: boolean;
    readonly allowInsecureLocal: boolean;
    readonly apiKey?: string;
    readonly serverRootCaPath?: string;
    readonly clientCertificatePath?: string;
    readonly clientPrivateKeyPath?: string;
    readonly serverNameOverride?: string;
  };
  readonly authorization: {
    readonly keys: Readonly<Record<string, string>>;
    readonly maximumTtlMs: number;
    readonly clockSkewMs: number;
    readonly replayCapacity: number;
  };
  readonly objectStorage: ObjectStorageConfig;
}

const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

type Environment = Readonly<Record<string, string | undefined>>;

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required worker configuration: ${name}`);
  return value;
}

function integer(
  environment: Environment,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(environment[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function boolean(environment: Environment, name: string, fallback = false): boolean {
  const value = environment[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function optionalPath(environment: Environment, name: string): string | undefined {
  const value = environment[name]?.trim();
  if (!value) return undefined;
  if (value.length > 4_096 || value.includes("\0")) throw new Error(`${name} is invalid`);
  return value;
}

function authorizationKeys(environment: Environment): Readonly<Record<string, string>> {
  const entries = required(environment, "INGESTION_AUTHORIZATION_KEYS").split(",");
  if (entries.length > 16) {
    throw new Error("INGESTION_AUTHORIZATION_KEYS supports at most 16 rotation keys");
  }
  const keys: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const entry of entries) {
    const separator = entry.indexOf(":");
    const keyId = entry.slice(0, separator);
    const encoded = entry.slice(separator + 1);
    if (separator < 1 || !KEY_ID.test(keyId) || !BASE64URL.test(encoded)) {
      throw new Error("INGESTION_AUTHORIZATION_KEYS contains an invalid key entry");
    }
    if (Object.hasOwn(keys, keyId)) {
      throw new Error("INGESTION_AUTHORIZATION_KEYS contains a duplicate key ID");
    }
    const bytes = Buffer.from(encoded, "base64url");
    if (bytes.byteLength < 32 || bytes.byteLength > 64 || bytes.toString("base64url") !== encoded) {
      throw new Error(
        "INGESTION_AUTHORIZATION_KEYS values must be canonical base64url (32-64 bytes)",
      );
    }
    keys[keyId] = encoded;
  }
  return Object.freeze(keys);
}

export function loadWorkerConfig(environment: Environment): WorkerConfig {
  const runtime = environment.NODE_ENV?.trim() || "development";
  if (runtime !== "development" && runtime !== "test" && runtime !== "production") {
    throw new Error("NODE_ENV must be development, test, or production");
  }
  const production = runtime === "production";
  const databaseUrl = new URL(
    environment.INGESTION_DATABASE_URL?.trim() || required(environment, "DATABASE_URL"),
  );
  if (databaseUrl.protocol !== "postgres:" && databaseUrl.protocol !== "postgresql:") {
    throw new Error("INGESTION_DATABASE_URL must use postgres or postgresql");
  }
  if (production) {
    if (databaseUrl.searchParams.get("sslmode") !== "verify-full") {
      throw new Error("Production ingestion database connections require sslmode=verify-full");
    }
    if (databaseUrl.username === "economyos" || databaseUrl.username === "postgres") {
      throw new Error("Production ingestion cannot use a database owner login");
    }
  }

  const address = environment.TEMPORAL_ADDRESS?.trim() || "127.0.0.1:7233";
  const addressMatch = /^(?<host>[A-Za-z0-9.-]+):(?<port>\d{1,5})$/.exec(address);
  const port = Number(addressMatch?.groups?.port);
  if (!addressMatch || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("TEMPORAL_ADDRESS must be a valid host and port");
  }
  const temporalTls = boolean(environment, "TEMPORAL_TLS");
  if (production && !temporalTls) throw new Error("Production Temporal connections require TLS");
  const allowInsecureLocal = boolean(environment, "TEMPORAL_ALLOW_INSECURE_LOCAL");
  const temporalHost = addressMatch?.groups?.host?.toLowerCase();
  if (!temporalTls) {
    if (
      production ||
      !allowInsecureLocal ||
      (temporalHost !== "127.0.0.1" && temporalHost !== "localhost")
    ) {
      throw new Error(
        "Insecure Temporal transport requires an explicit development/test loopback opt-in",
      );
    }
  }
  const temporalApiKey = environment.TEMPORAL_API_KEY?.trim();
  if (
    temporalApiKey &&
    (temporalApiKey.length < 16 ||
      temporalApiKey.length > 4_096 ||
      [...temporalApiKey].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127;
      }))
  ) {
    throw new Error("TEMPORAL_API_KEY is invalid");
  }
  const clientCertificatePath = optionalPath(environment, "TEMPORAL_MTLS_CLIENT_CERTIFICATE_PATH");
  const clientPrivateKeyPath = optionalPath(environment, "TEMPORAL_MTLS_CLIENT_KEY_PATH");
  if ((clientCertificatePath === undefined) !== (clientPrivateKeyPath === undefined)) {
    throw new Error("Temporal mTLS requires both client certificate and private key paths");
  }
  if (production && !temporalApiKey && !clientCertificatePath) {
    throw new Error("Production Temporal requires an API key or an mTLS client identity");
  }
  const serverRootCaPath = optionalPath(environment, "TEMPORAL_SERVER_ROOT_CA_PATH");
  const serverNameOverride = environment.TEMPORAL_SERVER_NAME_OVERRIDE?.trim();
  if (
    serverNameOverride &&
    (!/^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/.test(serverNameOverride) ||
      serverNameOverride.includes(".."))
  ) {
    throw new Error("TEMPORAL_SERVER_NAME_OVERRIDE is invalid");
  }
  if (
    !temporalTls &&
    (temporalApiKey || clientCertificatePath || serverRootCaPath || serverNameOverride)
  ) {
    throw new Error("Temporal credentials and TLS overrides require TEMPORAL_TLS=true");
  }

  const endpointText = environment.S3_ENDPOINT?.trim();
  const endpoint = endpointText ? new URL(endpointText) : undefined;
  if (production && endpoint && endpoint.protocol !== "https:") {
    throw new Error("Production S3 endpoints require HTTPS");
  }
  const forcePathStyle = boolean(environment, "S3_FORCE_PATH_STYLE");
  const kmsKeyId = environment.S3_KMS_KEY_ID?.trim();
  const namespace = environment.TEMPORAL_NAMESPACE?.trim() || "default";
  const taskQueue = environment.TEMPORAL_TASK_QUEUE?.trim() || "economyos-ingestion-v1";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(namespace)) {
    throw new Error("TEMPORAL_NAMESPACE is invalid");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(taskQueue)) {
    throw new Error("TEMPORAL_TASK_QUEUE is invalid");
  }
  return Object.freeze({
    databaseUrl: databaseUrl.href,
    temporal: Object.freeze({
      address,
      namespace,
      taskQueue,
      tls: temporalTls,
      allowInsecureLocal,
      ...(temporalApiKey ? { apiKey: temporalApiKey } : {}),
      ...(serverRootCaPath ? { serverRootCaPath } : {}),
      ...(clientCertificatePath ? { clientCertificatePath } : {}),
      ...(clientPrivateKeyPath ? { clientPrivateKeyPath } : {}),
      ...(serverNameOverride ? { serverNameOverride } : {}),
    }),
    authorization: Object.freeze({
      keys: authorizationKeys(environment),
      maximumTtlMs: integer(
        environment,
        "INGESTION_AUTHORIZATION_MAXIMUM_TTL_MS",
        900_000,
        1_000,
        900_000,
      ),
      clockSkewMs: integer(environment, "INGESTION_AUTHORIZATION_CLOCK_SKEW_MS", 30_000, 0, 60_000),
      replayCapacity: integer(
        environment,
        "INGESTION_AUTHORIZATION_REPLAY_CAPACITY",
        10_000,
        1,
        100_000,
      ),
    }),
    objectStorage: Object.freeze({
      region: required(environment, "S3_REGION"),
      bucket: required(environment, "S3_BUCKET"),
      ...(endpoint ? { endpoint: endpoint.href } : {}),
      forcePathStyle,
      allowInsecureLocalEndpoint: !production,
      maximumObjectBytes: integer(
        environment,
        "S3_MAXIMUM_OBJECT_BYTES",
        50_000_000,
        1,
        1_000_000_000,
      ),
      requestTimeoutMs: integer(environment, "S3_REQUEST_TIMEOUT_MS", 30_000, 100, 300_000),
      serverSideEncryption: kmsKeyId
        ? { type: "aws:kms" as const, keyId: kmsKeyId }
        : { type: "AES256" as const },
    }),
  });
}
