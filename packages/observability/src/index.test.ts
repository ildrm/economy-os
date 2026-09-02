import { describe, expect, it } from "vitest";
import { createTraceparent, parseTraceparent, startTelemetry, structuredLog } from "./index.js";

describe("observability foundation", () => {
  it("creates and parses W3C trace context", () => {
    const value = createTraceparent(true);
    expect(value).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(parseTraceparent(value)).toMatchObject({ sampled: true });
    expect(parseTraceparent(`00-${"0".repeat(32)}-${"1".repeat(16)}-01`)).toBeNull();
    expect(parseTraceparent("invalid")).toBeNull();
  });

  it("emits deterministic structured logs with recursive redaction", () => {
    expect(
      structuredLog({
        level: "info",
        service: "economyos-api",
        message: "request complete",
        fields: { route: "/health", nested: { authorization: "Bearer secret" } },
        traceId: "1".repeat(32),
        now: new Date("2026-01-01T00:00:00Z"),
      }),
    ).toEqual({
      timestamp: "2026-01-01T00:00:00.000Z",
      level: "info",
      service: "economyos-api",
      message: "request complete",
      traceId: "1".repeat(32),
      fields: { route: "/health", nested: { authorization: "[REDACTED]" } },
    });
  });

  it("rejects malformed log records", () => {
    expect(() => structuredLog({ level: "info", service: "api", message: "" })).toThrow("message");
    expect(() =>
      structuredLog({ level: "info", service: "api", message: "ok", traceId: "invalid" }),
    ).toThrow("trace ID");
  });

  it("validates telemetry endpoints and starts a no-export SDK", async () => {
    expect(() =>
      startTelemetry({ serviceName: "API", serviceVersion: "1", environment: "test" }),
    ).toThrow("service name");
    expect(() =>
      startTelemetry({ serviceName: "api-service", serviceVersion: "", environment: "test" }),
    ).toThrow("version");
    expect(() =>
      startTelemetry({
        serviceName: "api-service",
        serviceVersion: "1",
        environment: "production",
        otlpTracesEndpoint: "http://collector.example.test/v1/traces",
      }),
    ).toThrow("HTTPS");
    const sdk = startTelemetry({
      serviceName: "api-service",
      serviceVersion: "1",
      environment: "test",
    });
    await sdk.shutdown();
  });
});
