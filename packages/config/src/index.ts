export type RuntimeEnvironment = "development" | "test" | "production";
export type Environment = Readonly<Record<string, string | undefined>>;

export interface AppConfig {
  readonly environment: RuntimeEnvironment;
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: URL;
  readonly objectStorage: {
    readonly region: string;
    readonly bucket: string;
    readonly endpoint?: URL;
    readonly forcePathStyle: boolean;
    readonly maximumObjectBytes: number;
    readonly requestTimeoutMs: number;
    readonly kmsKeyId?: string;
  };
  readonly temporal: {
    readonly address: string;
    readonly namespace: string;
    readonly taskQueue: string;
    readonly tls: boolean;
  };
  readonly oidc: {
    readonly issuer: URL;
    readonly audience: string;
    readonly subjectClaim: string;
    readonly tenantClaim: string;
    readonly workspaceClaim: string;
    readonly jwksUri: URL;
  };
  readonly telemetry: {
    readonly tracesEndpoint?: URL;
  };
}

function required(env: Environment, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
}

function url(value: string, name: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
}

function integer(
  env: Environment,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const value = Number(env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function boolean(env: Environment, name: string, fallback = false): boolean {
  const value = env[name]?.trim().toLowerCase();
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

export function loadConfig(env: Environment): AppConfig {
  const environment = env.NODE_ENV ?? "development";
  if (
    !(["development", "test", "production"] as const).includes(environment as RuntimeEnvironment)
  ) {
    throw new Error("NODE_ENV must be development, test, or production");
  }
  const port = Number(env.PORT ?? "4000");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT is invalid");

  const issuer = url(required(env, "OIDC_ISSUER"), "OIDC_ISSUER");
  const jwksUri = url(required(env, "OIDC_JWKS_URI"), "OIDC_JWKS_URI");
  const databaseUrl = url(required(env, "DATABASE_URL"), "DATABASE_URL");
  if (databaseUrl.protocol !== "postgres:" && databaseUrl.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql scheme");
  }
  const storageEndpointValue = env.S3_ENDPOINT?.trim();
  const storageEndpoint = storageEndpointValue
    ? url(storageEndpointValue, "S3_ENDPOINT")
    : undefined;
  const s3MaximumObjectBytes = integer(
    env,
    "S3_MAXIMUM_OBJECT_BYTES",
    50_000_000,
    1,
    1_000_000_000,
  );
  const s3RequestTimeoutMs = integer(env, "S3_REQUEST_TIMEOUT_MS", 30_000, 100, 300_000);
  const temporalAddress = env.TEMPORAL_ADDRESS?.trim() || "127.0.0.1:7233";
  if (!/^[A-Za-z0-9.-]+:\d{1,5}$/.test(temporalAddress)) {
    throw new Error("TEMPORAL_ADDRESS must be a host and port");
  }
  const temporalPort = Number(temporalAddress.slice(temporalAddress.lastIndexOf(":") + 1));
  if (temporalPort < 1 || temporalPort > 65_535)
    throw new Error("TEMPORAL_ADDRESS port is invalid");
  const temporalTls = boolean(env, "TEMPORAL_TLS");
  const kmsKeyId = env.S3_KMS_KEY_ID?.trim();
  const tracesEndpointValue = env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();
  const tracesEndpoint = tracesEndpointValue
    ? url(tracesEndpointValue, "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
    : undefined;
  if (environment === "production") {
    if (issuer.protocol !== "https:" || jwksUri.protocol !== "https:") {
      throw new Error("Production OIDC endpoints must use HTTPS");
    }
    if (issuer.hostname.endsWith(".invalid") || jwksUri.hostname.endsWith(".invalid")) {
      throw new Error("Production OIDC endpoints cannot use example placeholders");
    }
    if (databaseUrl.username === "economyos" && databaseUrl.password === "economyos-local-only") {
      throw new Error("Local database credentials are forbidden in production");
    }
    if (databaseUrl.searchParams.get("sslmode") !== "verify-full") {
      throw new Error("Production database connections must use sslmode=verify-full");
    }
    if (databaseUrl.username === "economyos" || databaseUrl.username === "postgres") {
      throw new Error("Production runtime database connections cannot use an owner identity");
    }
    if (storageEndpoint && storageEndpoint.protocol !== "https:") {
      throw new Error("Production S3 endpoints must use HTTPS");
    }
    if (tracesEndpoint && tracesEndpoint.protocol !== "https:") {
      throw new Error("Production OTLP endpoint must use HTTPS");
    }
    if (!temporalTls) throw new Error("Production Temporal connections must use TLS");
  }

  return Object.freeze({
    environment: environment as RuntimeEnvironment,
    host: env.HOST?.trim() || "127.0.0.1",
    port,
    databaseUrl,
    objectStorage: Object.freeze({
      region: required(env, "S3_REGION"),
      bucket: required(env, "S3_BUCKET"),
      ...(storageEndpoint ? { endpoint: storageEndpoint } : {}),
      forcePathStyle: boolean(env, "S3_FORCE_PATH_STYLE"),
      maximumObjectBytes: s3MaximumObjectBytes,
      requestTimeoutMs: s3RequestTimeoutMs,
      ...(kmsKeyId ? { kmsKeyId } : {}),
    }),
    temporal: Object.freeze({
      address: temporalAddress,
      namespace: env.TEMPORAL_NAMESPACE?.trim() || "default",
      taskQueue: env.TEMPORAL_TASK_QUEUE?.trim() || "economyos-ingestion-v1",
      tls: temporalTls,
    }),
    oidc: Object.freeze({
      issuer,
      audience: required(env, "OIDC_AUDIENCE"),
      subjectClaim: env.OIDC_SUBJECT_CLAIM?.trim() || "https://economyos.dev/subject_id",
      tenantClaim: env.OIDC_TENANT_CLAIM?.trim() || "https://economyos.dev/tenant_id",
      workspaceClaim: env.OIDC_WORKSPACE_CLAIM?.trim() || "https://economyos.dev/workspaces",
      jwksUri,
    }),
    telemetry: Object.freeze({ ...(tracesEndpoint ? { tracesEndpoint } : {}) }),
  });
}
