import { randomBytes } from "node:crypto";
import { redactSensitive } from "@economyos/security";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

export interface TelemetryConfig {
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly environment: string;
  readonly otlpTracesEndpoint?: string;
}

export interface TraceContext {
  readonly traceId: string;
  readonly parentSpanId: string;
  readonly sampled: boolean;
}

export interface StructuredLog {
  readonly timestamp: string;
  readonly level: "debug" | "info" | "warn" | "error";
  readonly service: string;
  readonly message: string;
  readonly traceId?: string;
  readonly fields: unknown;
}

function assertTelemetryConfig(config: TelemetryConfig): void {
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(config.serviceName)) {
    throw new TypeError("Telemetry service name is invalid");
  }
  if (!config.serviceVersion.trim() || !config.environment.trim()) {
    throw new TypeError("Telemetry version and environment are required");
  }
  if (config.otlpTracesEndpoint) {
    const endpoint = new URL(config.otlpTracesEndpoint);
    const local = endpoint.hostname === "127.0.0.1" || endpoint.hostname === "localhost";
    if (endpoint.protocol !== "https:" && !(local && config.environment !== "production")) {
      throw new TypeError("Production OTLP endpoints must use HTTPS");
    }
  }
}

export function startTelemetry(config: TelemetryConfig): NodeSDK {
  assertTelemetryConfig(config);
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: config.serviceVersion,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: config.environment,
    }),
    ...(config.otlpTracesEndpoint
      ? { traceExporter: new OTLPTraceExporter({ url: config.otlpTracesEndpoint }) }
      : {}),
  });
  sdk.start();
  return sdk;
}

export function parseTraceparent(value: string): TraceContext | null {
  const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(value);
  const traceId = match?.[1];
  const parentSpanId = match?.[2];
  const flags = match?.[3];
  if (
    !traceId ||
    !parentSpanId ||
    !flags ||
    traceId === "0".repeat(32) ||
    parentSpanId === "0".repeat(16)
  ) {
    return null;
  }
  return Object.freeze({
    traceId,
    parentSpanId,
    sampled: (Number.parseInt(flags, 16) & 1) === 1,
  });
}

export function createTraceparent(sampled = true): string {
  const traceId = randomBytes(16).toString("hex");
  const spanId = randomBytes(8).toString("hex");
  return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`;
}

export function structuredLog(input: {
  level: StructuredLog["level"];
  service: string;
  message: string;
  fields?: unknown;
  traceId?: string;
  now?: Date;
}): StructuredLog {
  if (!input.message.trim()) throw new TypeError("Log message is required");
  if (input.traceId && !/^[0-9a-f]{32}$/.test(input.traceId)) {
    throw new TypeError("Log trace ID is invalid");
  }
  return Object.freeze({
    timestamp: (input.now ?? new Date()).toISOString(),
    level: input.level,
    service: input.service,
    message: input.message,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    fields: redactSensitive(input.fields ?? {}),
  });
}
