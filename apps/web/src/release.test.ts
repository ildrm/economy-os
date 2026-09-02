import { LOCALES } from "@economyos/i18n";
import { describe, expect, it } from "vitest";
import {
  buildLocaleMetadata,
  getRouteStateCopy,
  PRIVATE_ROBOTS,
  resolveRouteLocale,
} from "../app/_lib/release";
import { workbenchContextField } from "../app/[locale]/intelligence/_lib/copy";
import {
  CONTEXT_FIELD_NAMES,
  validateContext,
} from "../app/[locale]/intelligence/_lib/intelligence";
import robots from "../app/robots";

describe("release-facing localization", () => {
  it("provides complete route-state copy for every supported locale", () => {
    for (const locale of LOCALES) {
      const values = Object.values(getRouteStateCopy(locale));
      expect(values).toHaveLength(9);
      expect(values.every((value) => value.trim().length > 0)).toBe(true);
    }
  });

  it("falls back safely for invalid or missing locale parameters", () => {
    expect(resolveRouteLocale("fa")).toBe("fa");
    expect(resolveRouteLocale(["ar", "ignored"])).toBe("ar");
    expect(resolveRouteLocale("unsupported")).toBe("en");
    expect(resolveRouteLocale(undefined)).toBe("en");
  });

  it("maps every validation key to a localized human-readable field label", () => {
    for (const locale of LOCALES) {
      for (const field of CONTEXT_FIELD_NAMES) {
        const label = workbenchContextField(locale, field);
        expect(label.trim()).not.toBe("");
        expect(label).not.toBe(field);
      }
    }
  });
});

describe("private product metadata", () => {
  it("emits localized Open Graph and restrictive indexing directives without an invented origin", () => {
    for (const locale of LOCALES) {
      const metadata = buildLocaleMetadata(locale);
      expect(metadata.title).toBeTruthy();
      expect(metadata.description).toBeTruthy();
      expect(metadata.openGraph).toMatchObject({ type: "website", locale });
      expect(metadata.robots).toEqual(PRIVATE_ROBOTS);
      expect(metadata.metadataBase).toBeUndefined();
      expect(metadata.alternates?.canonical).toBeUndefined();
      expect(JSON.stringify(metadata)).not.toMatch(/https?:\/\//);
    }
  });

  it("disallows every crawler without advertising a host or sitemap", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});

describe("research context validation feedback", () => {
  it("keeps the untouched form neutral while retaining its request guard", () => {
    const validation = validateContext(new URLSearchParams());
    expect(validation.attempted).toBe(false);
    expect(validation.context).toBeNull();
    expect(validation.issues).toEqual(["workspaceId", "snapshotId", "knownAt", "policy"]);
  });

  it("marks malformed direct query context as attempted and de-duplicates field issues", () => {
    const validation = validateContext(
      new URLSearchParams({
        workspaceId: "not-a-uuid",
        snapshotId: "not-a-uuid",
        knownAt: "yesterday",
        policy: "reconstructed",
        systemAt: "",
      }),
    );
    expect(validation.attempted).toBe(true);
    expect(validation.context).toBeNull();
    expect(validation.issues).toEqual(["workspaceId", "snapshotId", "knownAt", "systemAt"]);
  });

  it("accepts a complete governed context", () => {
    const validation = validateContext(
      new URLSearchParams({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        snapshotId: "00000000-0000-4000-8000-000000000002",
        knownAt: "2026-08-31T12:00:00.123456Z",
        policy: "true_vintage",
        systemAt: "null",
      }),
    );
    expect(validation.attempted).toBe(true);
    expect(validation.issues).toEqual([]);
    expect(validation.context?.systemAt).toBeNull();
  });

  it("rejects calendar-invalid and rollover UTC instants", () => {
    for (const knownAt of [
      "2026-02-29T12:00:00Z",
      "2026-04-31T12:00:00Z",
      "2026-08-31T24:00:00Z",
      "0000-01-01T00:00:00Z",
    ]) {
      const validation = validateContext(
        new URLSearchParams({
          workspaceId: "00000000-0000-4000-8000-000000000001",
          snapshotId: "00000000-0000-4000-8000-000000000002",
          knownAt,
          policy: "true_vintage",
          systemAt: "null",
        }),
      );
      expect(validation.issues).toContain("knownAt");
    }
  });

  it("accepts a real leap day with the supported exact microsecond precision", () => {
    const validation = validateContext(
      new URLSearchParams({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        snapshotId: "00000000-0000-4000-8000-000000000002",
        knownAt: "2028-02-29T23:59:59.123456Z",
        policy: "reconstructed",
        systemAt: "2028-03-01T00:00:00.000001Z",
      }),
    );
    expect(validation.issues).toEqual([]);
    expect(validation.context?.knownAt).toBe("2028-02-29T23:59:59.123456Z");
  });
});
