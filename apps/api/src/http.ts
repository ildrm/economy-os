import type { Principal } from "@economyos/contracts";
import type { Context, Span } from "@opentelemetry/api";
import type { FastifyRequest } from "fastify";

export interface RequestTelemetry {
  readonly span: Span;
  readonly context: Context;
  readonly startedAt: number;
  readonly traceId: string;
  ended: boolean;
}

export interface AuthenticatedRequest extends FastifyRequest {
  principal?: Principal;
  traceId?: string;
  apiTelemetry?: RequestTelemetry;
}
