import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv, parseEcbCes } from "./ecb-ces.js";

const profile = JSON.parse(
  readFileSync(new URL("../../../data/intelligence/ecb-ces-source.json", import.meta.url), "utf8"),
);
const headers =
  "KEY,FREQ,REF_AREA,CES_BREAKDOWN,CES_CUSTOM,CES_VARIABLE,CES_ANSWER,CES_DENOM,TIME_PERIOD,OBS_VALUE,OBS_STATUS,CONF_STATUS,UNIT,UNIT_MULT,TITLE";
const fields = [
  "CES.M.DE.ALL.T.C1120.NUM_VAR.WM",
  "M",
  "DE",
  "ALL",
  "T",
  "C1120",
  "NUM_VAR",
  "WM",
  "2025-01",
  "2.10",
  "A",
  "F",
  "PN",
  "0",
  profile.metrics[0].titlePrefix,
];
const run = (changes: Record<number, string> = {}, suffix = "") => {
  const row = fields
    .map((value, index) => changes[index] ?? value)
    .map((value) => `"${value.replaceAll('"', '""')}"`)
    .join(",");
  return parseEcbCes({
    bytes: Buffer.from(`${headers}\n${row}\n${suffix}`),
    source: profile.source,
    country: "DE",
    retrievedAt: "2026-09-06T07:00:00Z",
    requestUrl:
      "https://data-api.ecb.europa.eu/service/data/CES/M.DE.ALL.T.C1120.NUM_VAR.WM?format=csvdata",
    metrics: profile.metrics,
  });
};
describe("ECB aggregate admission", () => {
  it("retains source decimals and distinguishes normal from final status", () => {
    const result = run()[0];
    expect(result?.raw.value).toBe("2.10");
    expect(result?.observation.value).toBe("2.10");
    expect(result?.observation.revision_status).toBe("unknown");
    expect(result?.observation.is_preliminary).toBeNull();
    expect(result?.knownAt).toBeNull();
    expect(result?.vintage).toBe("latest_revised_only");
    expect(run({ 10: "P" })[0]?.observation.is_preliminary).toBe(true);
    expect(run({ 9: "", 10: "M" })[0]?.observation.missing_reason).toBe("source_missing");
  });
  it.each([
    { 12: "EUR" },
    { 13: "2" },
    { 11: "C" },
    { 10: "F" },
    { 10: "M" },
    { 8: "2025-13" },
    { 14: "Wrong measure" },
  ])("rejects changed or protected semantics %j", (changes) => {
    expect(() => run(changes)).toThrow();
  });
  it("keeps CSV quoting, non-ASCII characters and embedded newlines intact", () => {
    expect(parseCsv('a,b\r\n"Économie","line 1\nline ""2"""\r\n')).toEqual([
      { a: "Économie", b: 'line 1\nline "2"' },
    ]);
    for (const value of ["a,a\n1,2", "a,b\n1", 'a\n"bad', 'a\n"closed"tail'])
      expect(() => parseCsv(value)).toThrow();
  });
  it("rejects expired acquisition permissions", () => {
    expect(() =>
      parseEcbCes({
        bytes: Buffer.from("a\nb"),
        source: profile.source,
        country: "DE",
        retrievedAt: "2028-01-01T00:00:00Z",
        requestUrl: "https://data-api.ecb.europa.eu/service/data/CES/M.DE",
        metrics: profile.metrics,
      }),
    ).toThrow("not current");
  });
});
