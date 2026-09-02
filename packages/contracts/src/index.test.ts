import { describe, expect, it } from "vitest";
import {
  assertPointInTimeContext,
  DomainProblem,
  isProductionDataClass,
  organizationId,
  traceId,
  workspaceId,
} from "./index.js";

describe("canonical contracts", () => {
  it("brands valid UUID identifiers and rejects ambiguous IDs", () => {
    expect(organizationId("018f47ac-19fc-7c92-ae91-0242ac120002")).toContain("018f47ac");
    expect(() => workspaceId("tenant-a")).toThrow("WorkspaceId must be a UUID");
  });

  it("uses the W3C/OpenTelemetry trace identifier format", () => {
    expect(traceId("0123456789abcdef0123456789abcdef")).toHaveLength(32);
    expect(() => traceId("018f47ac-19fc-7c92-ae91-0242ac120002")).toThrow("W3C");
    expect(() => traceId("0".repeat(32))).toThrow("non-zero");
  });

  it("requires explicit UTC point-in-time cutoffs", () => {
    expect(
      assertPointInTimeContext({
        knownAt: "2026-01-15T10:30:00Z",
        policy: "true_vintage",
      }),
    ).toEqual({ knownAt: "2026-01-15T10:30:00Z", policy: "true_vintage" });
    expect(() =>
      assertPointInTimeContext({ knownAt: "2026-01-15", policy: "true_vintage" }),
    ).toThrow("knownAt");
    expect(() =>
      assertPointInTimeContext({
        knownAt: "2026-01-15T10:30:00Z",
        systemAt: "2026-01-15T10:30:00Z",
        policy: "latest_revised",
      }),
    ).toThrow("historical system-time");
  });

  it("keeps synthetic classes out of production paths", () => {
    expect(isProductionDataClass("observed")).toBe(true);
    expect(isProductionDataClass("synthetic_demo")).toBe(false);
    expect(isProductionDataClass("synthetic_research")).toBe(false);
  });

  it("preserves structured domain failures and rejects impossible instants", () => {
    const error = new DomainProblem({
      type: "https://economyos.dev/problems/test",
      title: "Test",
      status: 422,
      code: "TEST_INVALID",
      detail: "Test failure",
    });
    expect(error.name).toBe("DomainProblem");
    expect(error.problem.code).toBe("TEST_INVALID");
    expect(() =>
      assertPointInTimeContext({ knownAt: "2026-13-40T10:30:00Z", policy: "true_vintage" }),
    ).toThrow("valid instant");
    expect(() =>
      assertPointInTimeContext({ knownAt: "2026-02-29T10:30:00Z", policy: "true_vintage" }),
    ).toThrow("valid instant");
    expect(
      assertPointInTimeContext({ knownAt: "2028-02-29T10:30:00Z", policy: "true_vintage" }),
    ).toMatchObject({ knownAt: "2028-02-29T10:30:00Z" });
    expect(() =>
      assertPointInTimeContext({ knownAt: "2026-01-01T24:00:00Z", policy: "true_vintage" }),
    ).toThrow("valid instant");
  });
});
