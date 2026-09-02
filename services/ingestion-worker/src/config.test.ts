import { describe, expect, it } from "vitest";

import { loadWorkerConfig } from "./config.js";

const baseline = {
  NODE_ENV: "test",
  INGESTION_DATABASE_URL: "postgresql://economyos_ingest_local:local@127.0.0.1:55432/economyos",
  S3_REGION: "us-east-1",
  S3_BUCKET: "economyos-local",
  S3_ENDPOINT: "http://127.0.0.1:59090",
  S3_FORCE_PATH_STYLE: "true",
  TEMPORAL_ALLOW_INSECURE_LOCAL: "true",
  INGESTION_AUTHORIZATION_KEYS: "local-v1:ZWNvbm9teW9zLWxvY2FsLWF1dGhvcml6YXRpb24ta2V5LW9ubHk",
};

describe("ingestion worker configuration", () => {
  it("loads bounded local defaults", () => {
    const config = loadWorkerConfig(baseline);
    expect(config.temporal).toEqual({
      address: "127.0.0.1:7233",
      namespace: "default",
      taskQueue: "economyos-ingestion-v1",
      tls: false,
      allowInsecureLocal: true,
    });
    expect(config.objectStorage).toMatchObject({
      endpoint: "http://127.0.0.1:59090/",
      forcePathStyle: true,
      maximumObjectBytes: 50_000_000,
      requestTimeoutMs: 30_000,
    });
  });

  it("rejects owner credentials and insecure transports in production", () => {
    expect(() =>
      loadWorkerConfig({
        ...baseline,
        NODE_ENV: "production",
        INGESTION_DATABASE_URL: "postgresql://economyos:secret@db.example/economyos",
        S3_ENDPOINT: "https://objects.example",
        TEMPORAL_TLS: "true",
        TEMPORAL_API_KEY: "production-temporal-api-key",
      }),
    ).toThrow("sslmode=verify-full");
    expect(() =>
      loadWorkerConfig({
        ...baseline,
        NODE_ENV: "production",
        INGESTION_DATABASE_URL:
          "postgresql://economyos_ingest:secret@db.example/economyos?sslmode=verify-full",
        S3_ENDPOINT: "http://objects.example",
        TEMPORAL_TLS: "true",
        TEMPORAL_API_KEY: "production-temporal-api-key",
      }),
    ).toThrow("S3 endpoints require HTTPS");

    const awsDefault = { ...baseline };
    delete (awsDefault as Partial<typeof baseline>).S3_ENDPOINT;
    expect(() =>
      loadWorkerConfig({
        ...awsDefault,
        NODE_ENV: "production",
        INGESTION_DATABASE_URL:
          "postgresql://economyos_ingest:secret@db.example/economyos?sslmode=verify-full",
        TEMPORAL_TLS: "true",
        TEMPORAL_API_KEY: "production-temporal-api-key",
      }),
    ).not.toThrow();
  });

  it("requires authenticated Temporal identity in production", () => {
    expect(() =>
      loadWorkerConfig({
        ...baseline,
        NODE_ENV: "production",
        INGESTION_DATABASE_URL:
          "postgresql://economyos_ingest:secret@db.example/economyos?sslmode=verify-full",
        S3_ENDPOINT: "https://objects.example",
        TEMPORAL_TLS: "true",
      }),
    ).toThrow("API key or an mTLS client identity");
    expect(() =>
      loadWorkerConfig({
        ...baseline,
        TEMPORAL_ADDRESS: "temporal.example:7233",
      }),
    ).toThrow("development/test loopback opt-in");
  });

  it("rejects malformed bounds and Temporal endpoints", () => {
    expect(() => loadWorkerConfig({ ...baseline, TEMPORAL_ADDRESS: "localhost:70000" })).toThrow(
      "valid host and port",
    );
    expect(() => loadWorkerConfig({ ...baseline, S3_MAXIMUM_OBJECT_BYTES: "NaN" })).toThrow(
      "S3_MAXIMUM_OBJECT_BYTES",
    );
  });

  it("loads bounded HMAC rotation keys and rejects duplicate key IDs", () => {
    const encoded = "ZWNvbm9teW9zLWxvY2FsLWF1dGhvcml6YXRpb24ta2V5LW9ubHk";
    const rotated = loadWorkerConfig({
      ...baseline,
      INGESTION_AUTHORIZATION_KEYS: `current-v2:${encoded},retired-v1:${encoded}`,
    });
    expect(Object.keys(rotated.authorization.keys)).toEqual(["current-v2", "retired-v1"]);
    expect(() =>
      loadWorkerConfig({
        ...baseline,
        INGESTION_AUTHORIZATION_KEYS: `duplicate:${encoded},duplicate:${encoded}`,
      }),
    ).toThrow("duplicate key ID");

    const missing = { ...baseline } as Record<string, string>;
    delete missing.INGESTION_AUTHORIZATION_KEYS;
    expect(() => loadWorkerConfig(missing)).toThrow("INGESTION_AUTHORIZATION_KEYS");
  });
});
