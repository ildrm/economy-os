import { randomBytes } from "node:crypto";
import { structuredLog } from "@economyos/observability";
import {
  context as otelContext,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import type { AuthenticatedRequest } from "./http.js";

const tracer = trace.getTracer("economyos-api");
const W3C_TRACE_ID = /^[0-9a-f]{32}$/;
const ZERO_TRACE_ID = "0".repeat(32);

interface HookReply {
  readonly statusCode: number;
  header(name: string, value: string): unknown;
}

type HookDone = () => void;

interface HookRegistrar {
  addHook(
    name: "onRequest",
    hook: (request: unknown, reply: HookReply, done: HookDone) => void,
  ): void;
  addHook(
    name: "onError",
    hook: (request: unknown, reply: HookReply, error: unknown, done: HookDone) => void,
  ): void;
  addHook(
    name: "onResponse",
    hook: (request: unknown, reply: HookReply, done: HookDone) => void,
  ): void;
}

export function registerHttpTelemetry(server: unknown): void {
  const hooks = server as HookRegistrar;
  hooks.addHook("onRequest", (rawRequest, reply, done) => {
    const request = rawRequest as unknown as AuthenticatedRequest;
    const parent = propagation.extract(ROOT_CONTEXT, request.headers);
    const route = request.routeOptions?.url ?? "unmatched";
    const span = tracer.startSpan(
      `${request.method} ${route}`,
      {
        kind: SpanKind.SERVER,
        attributes: {
          "http.request.method": request.method,
          "http.route": route,
          "server.address": request.hostname,
        },
      },
      parent,
    );
    const spanContext = trace.setSpan(parent, span);
    const traceId = usableTraceId(span.spanContext().traceId);
    request.traceId = traceId;
    request.apiTelemetry = {
      span,
      context: spanContext,
      startedAt: performance.now(),
      traceId,
      ended: false,
    };
    reply.header("x-trace-id", traceId);
    otelContext.with(spanContext, done);
  });

  hooks.addHook("onError", (rawRequest, _reply, error, done) => {
    recordRequestException(rawRequest as unknown as AuthenticatedRequest, error, 500);
    done();
  });

  hooks.addHook("onResponse", (rawRequest, reply, done) => {
    const request = rawRequest as unknown as AuthenticatedRequest;
    const telemetry = request.apiTelemetry;
    if (!telemetry || telemetry.ended) {
      done();
      return;
    }
    telemetry.ended = true;
    const route = request.routeOptions?.url ?? "unmatched";
    telemetry.span.updateName(`${request.method} ${route}`);
    telemetry.span.setAttribute("http.route", route);
    telemetry.span.setAttribute("http.response.status_code", reply.statusCode);
    if (reply.statusCode >= 500) telemetry.span.setStatus({ code: SpanStatusCode.ERROR });
    telemetry.span.end();
    process.stdout.write(
      `${JSON.stringify(
        structuredLog({
          level: reply.statusCode >= 500 ? "error" : "info",
          service: "economyos-api",
          message: "request complete",
          traceId: telemetry.traceId,
          fields: {
            method: request.method,
            route,
            statusCode: reply.statusCode,
            durationMilliseconds: Math.round((performance.now() - telemetry.startedAt) * 100) / 100,
          },
        }),
      )}\n`,
    );
    done();
  });
}

export function recordRequestException(
  request: AuthenticatedRequest,
  error: unknown,
  statusCode: number,
): void {
  const telemetry = request.apiTelemetry;
  if (!telemetry || statusCode < 500) return;
  telemetry.span.setStatus({ code: SpanStatusCode.ERROR });
  if (error instanceof Error) telemetry.span.recordException(error);
}

export function createTraceId(candidate?: string): string {
  return candidate !== undefined && W3C_TRACE_ID.test(candidate) && candidate !== ZERO_TRACE_ID
    ? candidate
    : randomBytes(16).toString("hex");
}

function usableTraceId(candidate: string): string {
  return createTraceId(candidate);
}
