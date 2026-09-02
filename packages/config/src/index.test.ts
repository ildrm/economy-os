import { describe, expect, it } from "vitest";
import { loadConfig } from "./index.js";

const baseline = {
  DATABASE_URL: "postgresql://economyos:economyos-local-only@localhost:55432/economyos",
  OIDC_AUDIENCE: "economyos-api",
  OIDC_ISSUER: "https://identity.example.invalid/",
  OIDC_JWKS_URI: "https://identity.example.invalid/jwks.json",
  S3_BUCKET: "economyos-local",
  S3_REGION: "us-east-1",
};

describe("configuration", () => {
  it("loads a typed development configuration", () => {
    const config = loadConfig({
      ...baseline,
      NODE_ENV: "development",
      PORT: "4100",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://127.0.0.1:4318/v1/traces",
    });
    expect(config.port).toBe(4100);
    expect(config.oidc.audience).toBe("economyos-api");
    expect(config.telemetry.tracesEndpoint?.port).toBe("4318");
    expect(config.objectStorage.maximumObjectBytes).toBe(50_000_000);
    expect(config.temporal.taskQueue).toBe("economyos-ingestion-v1");
    expect(config.temporal.tls).toBe(false);
  });

  it("rejects placeholder identity and local credentials in production", () => {
    expect(() => loadConfig({ ...baseline, NODE_ENV: "production" })).toThrow(
      "example placeholders",
    );
  });

  it("rejects invalid ports and missing required values", () => {
    expect(() => loadConfig({ ...baseline, PORT: "70000" })).toThrow("PORT");
    expect(() => loadConfig({ ...baseline, OIDC_AUDIENCE: "" })).toThrow("OIDC_AUDIENCE");
  });

  it("rejects invalid environments, URLs, and insecure production endpoints", () => {
    expect(() => loadConfig({ ...baseline, NODE_ENV: "preview" })).toThrow("NODE_ENV");
    expect(() => loadConfig({ ...baseline, OIDC_ISSUER: "not-a-url" })).toThrow("absolute URL");
    expect(() =>
      loadConfig({
        ...baseline,
        NODE_ENV: "production",
        OIDC_ISSUER: "http://identity.economyos.dev/",
        OIDC_JWKS_URI: "https://identity.economyos.dev/jwks.json",
      }),
    ).toThrow("HTTPS");
    expect(() =>
      loadConfig({
        ...baseline,
        NODE_ENV: "production",
        OIDC_ISSUER: "https://identity.economyos.dev/",
        OIDC_JWKS_URI: "https://identity.economyos.dev/jwks.json",
      }),
    ).toThrow("Local database credentials");
    expect(() =>
      loadConfig({
        ...baseline,
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://app:secret@db.economyos.dev/economyos",
        OIDC_ISSUER: "https://identity.economyos.dev/",
        OIDC_JWKS_URI: "https://identity.economyos.dev/jwks.json",
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://collector.economyos.dev/v1/traces",
      }),
    ).toThrow("sslmode=verify-full");
    expect(() =>
      loadConfig({ ...baseline, DATABASE_URL: "https://db.example.test/value" }),
    ).toThrow("postgres");
    expect(() => loadConfig({ ...baseline, S3_FORCE_PATH_STYLE: "sometimes" })).toThrow(
      "true or false",
    );
    expect(() =>
      loadConfig({
        ...baseline,
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://app:secret@db.economyos.dev/economyos?sslmode=verify-full",
        OIDC_ISSUER: "https://identity.economyos.dev/",
        OIDC_JWKS_URI: "https://identity.economyos.dev/jwks.json",
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://collector.economyos.dev/v1/traces",
      }),
    ).toThrow("OTLP");
    expect(() =>
      loadConfig({
        ...baseline,
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://app:secret@db.economyos.dev/economyos?sslmode=verify-full",
        OIDC_ISSUER: "https://identity.economyos.dev/",
        OIDC_JWKS_URI: "https://identity.economyos.dev/jwks.json",
      }),
    ).toThrow("Temporal");
  });
});
