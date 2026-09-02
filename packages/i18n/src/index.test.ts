import { describe, expect, it } from "vitest";
import {
  bidiIsolate,
  LOCALE_METADATA,
  LOCALES,
  messages,
  resolveLocale,
  translate,
} from "./index.js";

describe("internationalization foundation", () => {
  it("resolves explicit preferences before weighted browser languages", () => {
    expect(resolveLocale({ explicit: "fa", acceptLanguage: "de;q=1" })).toBe("fa");
    expect(resolveLocale({ acceptLanguage: "fr;q=0.5, de;q=0.9" })).toBe("de");
    expect(resolveLocale({ acceptLanguage: "zh-CN" })).toBe("zh-Hans");
    expect(resolveLocale({ acceptLanguage: "fa;q=0, tr;q=0.8" })).toBe("tr");
    expect(resolveLocale({ acceptLanguage: "zh-TW, de;q=0.7" })).toBe("de");
    expect(resolveLocale({ acceptLanguage: "*;q=1, ru;q=0" })).toBe("en");
  });

  it("declares RTL independently in locale metadata", () => {
    expect(LOCALE_METADATA.fa.direction).toBe("rtl");
    expect(LOCALE_METADATA.ar.direction).toBe("rtl");
    expect(LOCALE_METADATA.en.direction).toBe("ltr");
  });

  it("ships a complete translated catalog for every advertised locale", () => {
    const sourceKeys = Object.keys(messages.en).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(messages[locale]).sort()).toEqual(sourceKeys);
      for (const value of Object.values(messages[locale])) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
      if (locale !== "en") {
        expect(translate(locale, "app.tagline")).not.toBe(messages.en["app.tagline"]);
        expect(translate(locale, "status.unknown")).not.toBe(messages.en["status.unknown"]);
      }
    }
  });

  it("returns translated messages without silent catalog fallback", () => {
    expect(translate("fa", "nav.evidence")).toBe("شواهد");
    expect(translate("de", "nav.evidence")).toBe("Belege");
    expect(translate("ar", "status.unknown")).toContain("غير معروف");
    expect(bidiIsolate("USD -12.5%")).toBe("⁨USD -12.5%⁩");
  });
});
