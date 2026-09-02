import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { Catch, HttpException, HttpStatus } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import type { AuthenticatedRequest } from "./http.js";
import { createTraceId, recordRequestException } from "./telemetry.js";

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<AuthenticatedRequest>();
    const response = context.getResponse<FastifyReply>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const code =
      typeof body === "object" && body !== null && "code" in body && typeof body.code === "string"
        ? body.code
        : status === 500
          ? "INTERNAL_ERROR"
          : "REQUEST_FAILED";
    const title = titleForStatus(status);
    const traceId = createTraceId(request.traceId);
    request.traceId = traceId;
    recordRequestException(request, exception, status);
    response
      .status(status)
      .type("application/problem+json")
      .header("cache-control", "no-store")
      .header("x-trace-id", traceId)
      .send({
        type: `https://economyos.dev/problems/${code.toLowerCase().replaceAll("_", "-")}`,
        title,
        status,
        code,
        detail: status >= 500 ? "The request could not be completed." : title,
        instance: request.url,
        traceId,
      });
  }
}

function titleForStatus(status: number): string {
  if (status === 400) return "Invalid request";
  if (status === 401) return "Authentication failed";
  if (status === 403) return "Access denied";
  if (status === 404) return "Resource not found";
  if (status === 503) return "Service unavailable";
  return "Request failed";
}
