import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTraceId, registerHttpTelemetry } from "./telemetry.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("API trace identifiers", () => {
  it("preserves a valid non-zero W3C trace identifier", () => {
    const traceId = "0123456789abcdef0123456789abcdef";
    expect(createTraceId(traceId)).toBe(traceId);
  });

  it.each([undefined, "00000000000000000000000000000000", "not-a-trace", "ABCDEF"])(
    "creates a valid fallback for %s",
    (candidate) => {
      expect(createTraceId(candidate)).toMatch(/^(?!0{32})[0-9a-f]{32}$/);
    },
  );

  it("covers pre-handler denials, unmatched routes, and handler errors", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const server = Fastify();
    registerHttpTelemetry(server);
    server.get(
      "/guarded",
      {
        preHandler: async (_request, reply) => {
          await reply.code(401).send({ code: "AUTHENTICATION_REQUIRED" });
        },
      },
      async () => ({ unreachable: true }),
    );
    server.get("/error", async () => {
      throw new Error("handler failed");
    });

    const guarded = await server.inject({ method: "GET", url: "/guarded" });
    const unmatched = await server.inject({ method: "GET", url: "/missing" });
    const failed = await server.inject({ method: "GET", url: "/error" });
    await server.close();

    expect(guarded.statusCode).toBe(401);
    expect(unmatched.statusCode).toBe(404);
    expect(failed.statusCode).toBe(500);
    for (const response of [guarded, unmatched, failed]) {
      expect(response.headers["x-trace-id"]).toMatch(/^(?!0{32})[0-9a-f]{32}$/);
    }
  });
});
