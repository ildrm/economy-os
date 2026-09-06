import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type AnnualPoint,
  annualAssociation,
  type CountrySeries,
  comparisonCsv,
  comparisonPoints,
  displayCountry,
  INDICATORS,
  latestPoint,
  PUBLIC_DATA,
  validateCountrySeries,
} from "../app/[locale]/intelligence/_lib/public-economy";
import { buildScienceModels } from "../app/[locale]/intelligence/_lib/science-models";

const inflation = INDICATORS.find((item) => item.id === "inflation");
if (!inflation) throw new Error("Inflation definition missing");
const series = (points: AnnualPoint[]): CountrySeries => ({
  schemaVersion: 1,
  countryCode: "IR",
  iso3: "IRN",
  retrievedAt: PUBLIC_DATA.retrievedAt,
  series: { inflation: points },
});
const readCountry = (code: string) =>
  JSON.parse(readFileSync(new URL(`../public/economy/${code}.json`, import.meta.url), "utf8"));

describe("published comparisons", () => {
  it("uses the latest common year without substituting newer country values", () => {
    const countries = [
      series([
        [2023, "10"],
        [2024, "20"],
        [2025, "30"],
      ]),
      series([
        [2023, "0"],
        [2024, "-1"],
        [2025, null],
      ]),
    ];
    expect(comparisonPoints(countries, inflation, "common")).toEqual([
      [2024, "20"],
      [2024, "-1"],
    ]);
    expect(comparisonPoints(countries, inflation, "latest")).toEqual([
      [2025, "30"],
      [2024, "-1"],
    ]);
    expect(comparisonPoints(countries, inflation, "2025")).toEqual([[2025, "30"], null]);
    expect(comparisonPoints(countries, inflation, "2023")).toEqual([
      [2023, "10"],
      [2023, "0"],
    ]);
  });
  it("does not turn missing data, failed countries or non-overlapping periods into zero", () => {
    const one = series([[2024, "0"]]);
    expect(latestPoint(one.series.inflation)).toEqual([2024, "0"]);
    expect(comparisonPoints([one, undefined], inflation, "common")).toEqual([null, null]);
    expect(comparisonPoints([one, series([[2023, "1"]])], inflation, "common")).toEqual([
      null,
      null,
    ]);
    expect(latestPoint([[2024, null]])).toBeNull();
  });
  it("reproduces the actual Iran/Germany/US snapshot", () => {
    const countries = ["IR", "DE", "US"].map(readCountry);
    const result = comparisonPoints(countries, inflation, "common");
    expect(result).toEqual([
      [2024, "32.455871402917"],
      [2024, "2.2564981433876"],
      [2024, "2.94952520485207"],
    ]);
    expect(result.some((point) => point === null)).toBe(false);
  });
  it("preserves exact source decimals and provenance in exports", () => {
    const csv = comparisonCsv(
      ["IR", "DE", "US"],
      ["IR", "DE", "US"].map(readCountry),
      [inflation],
      "common",
      "en",
    );
    expect(csv).toContain('"2024","32.455871402917"');
    expect(csv).toContain("https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG");
    expect(csv).toContain('"Unit","Status","Provider","Source updated","Retrieved"');
    const missing = comparisonCsv(["US"], [readCountry("US")], [inflation], "2025", "en");
    expect(missing).toContain('"","","%","not reported for selected period"');
  });
  it("uses stable, human-readable names for provider-specific country codes", () => {
    expect(displayCountry("JG", "en")).toBe("Channel Islands");
    expect(displayCountry("IR", "fa")).toBe("ایران");
  });
  it("marks country-specific scales and modeled labor series", () => {
    for (const id of ["exchange", "price-index", "poverty"])
      expect(INDICATORS.find((item) => item.id === id)?.countryComparable).toBe(false);
    expect(INDICATORS.find((item) => item.id === "unemployment")?.sourceEstimate).toBe(true);
  });
});

describe("descriptive annual association", () => {
  const first: AnnualPoint[] = Array.from({ length: 10 }, (_, i) => [2000 + i, `${i}`]);
  it("matches years and ignores absent observations instead of interpolating", () => {
    const second: AnnualPoint[] = first.map(([year, value]) => [year, `${Number(value) * -3 + 2}`]);
    second[4] = [2004, null];
    expect(annualAssociation(first, second)?.correlation).toBeCloseTo(-1, 12);
    expect(annualAssociation(first, second)).toMatchObject({
      count: 9,
      from: 2000,
      to: 2009,
    });
  });
  it("requires eight shared observations and rejects zero-variance series", () => {
    expect(annualAssociation(first.slice(0, 7), first)).toBeNull();
    expect(
      annualAssociation(
        first,
        first.map(([year]) => [year, "1"]),
      ),
    ).toBeNull();
    expect(
      annualAssociation(
        first,
        first.map(([year, value]) => [year + 100, value]),
      ),
    ).toBeNull();
  });
});

describe("browser snapshot validation", () => {
  it("accepts the source snapshot and rejects identity/revision mismatch, duplicate years and missing measures", () => {
    const country = readCountry("IR");
    expect(validateCountrySeries(country, "IR")).toEqual(country);
    expect(() => validateCountrySeries(country, "US")).toThrow();
    expect(() => validateCountrySeries({ ...country, retrievedAt: "2000-01-01" }, "IR")).toThrow();
    expect(() => validateCountrySeries({ ...country, series: {} }, "IR")).toThrow();
    for (const points of [
      [
        [2024, "1"],
        [2024, "2"],
      ],
      [[1999, "1"]],
      [[2024, "NaN"]],
      [[2024, ""]],
    ]) {
      expect(() =>
        validateCountrySeries(
          { ...country, series: { ...country.series, inflation: points } },
          "IR",
        ),
      ).toThrow();
    }
  });
});

describe("public models execute existing behavioral kernels", () => {
  const models = buildScienceModels();
  it("keeps a zero expected-value lottery distinct from prospect valuation", () => {
    expect(Number(models.losses[0]?.prospectLottery)).toBe(0);
    expect(Number(models.losses[6]?.gain)).toBe(100);
    expect(Number(models.losses[6]?.loss)).toBe(-160);
    expect(Number(models.losses[6]?.prospectLottery)).toBe(-30);
    expect(Number(models.losses[6]?.expectedLottery)).toBe(0);
  });
  it("shows present-bias preference reversal with unchanged future discounting", () => {
    expect(models.time.map((item) => Number(item.later))).toEqual([95, 76, 47.5]);
    expect(models.time.map((item) => Number(item.now))).toEqual([80, 80, 80]);
  });
  it("shows social utility, satisficing failure and genuinely missing selling opportunities", () => {
    expect(models.fairness.map((item) => Number(item.utility))).toEqual([50, 20, 50]);
    expect(models.search.map((item) => item.result.selectedIndex)).toEqual([1, 2, null]);
    expect(models.disposition[2]?.result.gainRealizationRate).toBeNull();
    expect(models.disposition[2]?.result.lossRealizationRate).toBeNull();
  });
  it("normalizes logit choices and preserves the original theory registry", () => {
    expect(models.theories).toHaveLength(20);
    for (const item of models.choices)
      expect(item.probabilities.reduce((sum, p) => sum + Number(p), 0)).toBeCloseTo(1, 10);
  });
});
