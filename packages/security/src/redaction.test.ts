import { describe, expect, it } from "vitest";
import { isSafeRelativeRedirect, redactSensitive, SECURITY_HEADERS } from "./redaction.js";

describe("security utilities", () => {
  it("redacts nested credentials including arrays", () => {
    expect(redactSensitive({ user: "a", nested: [{ apiKey: "secret" }] })).toEqual({
      user: "a",
      nested: [{ apiKey: "[REDACTED]" }],
    });
  });

  it("allows only local relative redirects", () => {
    expect(isSafeRelativeRedirect("/en/evidence")).toBe(true);
    expect(isSafeRelativeRedirect("//evil.test")).toBe(false);
    expect(isSafeRelativeRedirect("/%2f%2fevil.test")).toBe(false);
    expect(isSafeRelativeRedirect("/safe%5c..%5cevil")).toBe(false);
  });

  it("does not cache responses across authorization or legal-state changes", () => {
    expect(SECURITY_HEADERS["cache-control"]).toBe("private, no-store");
  });
});
