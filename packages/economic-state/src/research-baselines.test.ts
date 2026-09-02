import { describe, expect, it } from "vitest";

import {
  bindResearchBaselineModel,
  PHASE3_RESEARCH_BASELINE_REGISTRY_SHA256,
  PHASE3_RESEARCH_BASELINES,
  type ResearchBaselineDefinition,
  validateResearchBaselineRegistry,
} from "./research-baselines.js";

describe("Phase 3 admitted-provider research baseline registry", () => {
  it("defines one transparent no-imputation baseline for every canonical dimension", () => {
    expect(PHASE3_RESEARCH_BASELINES.map(({ dimension }) => dimension)).toEqual([
      "macroeconomic",
      "human_economic",
      "financial_system",
      "market",
      "regime",
    ]);
    expect(validateResearchBaselineRegistry()).toBe(PHASE3_RESEARCH_BASELINE_REGISTRY_SHA256);
    expect(PHASE3_RESEARCH_BASELINE_REGISTRY_SHA256).toMatch(/^[0-9a-f]{64}$/);
    for (const definition of PHASE3_RESEARCH_BASELINES) {
      expect(definition).toMatchObject({
        schemaVersion: 1,
        status: "accepted_for_research_baseline",
        outputSemantics: "descriptive_composite_index_0_100",
        missingnessPolicy: "explicit_abstain_no_imputation",
        providerCatalog: { sourceId: 2, license: "CC-BY-4.0" },
        methodologyReview: {
          outcome: "accepted_for_transparent_research_use",
          independence: "repository_review_not_independent_validation",
        },
      });
      expect(Object.isFrozen(definition.components)).toBe(true);
      expect(definition.components.every(({ imputation }) => imputation === "none")).toBe(true);
      expect(definition.components.every(({ limitations }) => limitations.length > 0)).toBe(true);
    }
  });

  it("retains exact real-provider indicator identities and explicit proxy semantics", () => {
    const indicators = PHASE3_RESEARCH_BASELINES.flatMap(({ components }) => components);
    expect(indicators.map(({ indicatorCode }) => indicatorCode)).toEqual(
      expect.arrayContaining([
        "NY.GDP.MKTP.KD.ZG",
        "FP.CPI.TOTL.ZG",
        "SL.UEM.TOTL.ZS",
        "SI.POV.GINI",
        "FB.BNK.CAPA.ZS",
        "FB.AST.NPER.ZS",
        "FS.AST.PRVT.GD.ZS",
        "CM.MKT.LCAP.GD.ZS",
        "CM.MKT.TRNR",
        "CM.MKT.INDX.ZG",
        "BN.CAB.XOKA.GD.ZS",
      ]),
    );
    expect(indicators.filter(({ measurementClass }) => measurementClass === "proxy")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "gdp-per-capita-growth" }),
        expect.objectContaining({ key: "private-credit-depth" }),
      ]),
    );
    expect(indicators.filter(({ measurementClass }) => measurementClass === "estimated")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "unemployment", indicatorCode: "SL.UEM.TOTL.ZS" }),
      ]),
    );
  });

  it("fails closed on reordered dimensions, weight drift, provider drift, and digest forgery", () => {
    const clone = (): ResearchBaselineDefinition[] =>
      structuredClone(PHASE3_RESEARCH_BASELINES) as ResearchBaselineDefinition[];

    const reordered = clone();
    [reordered[0], reordered[1]] = [
      reordered[1] as ResearchBaselineDefinition,
      reordered[0] as ResearchBaselineDefinition,
    ];
    expect(() => validateResearchBaselineRegistry(reordered)).toThrow("canonical order");

    const changedWeight = clone() as unknown as Array<{
      components: Array<{ weight: string }>;
    }>;
    const weightComponent = changedWeight[0]?.components[0];
    if (!weightComponent) throw new Error("test fixture is incomplete");
    weightComponent.weight = "0.5";
    expect(() =>
      validateResearchBaselineRegistry(changedWeight as unknown as ResearchBaselineDefinition[]),
    ).toThrow("sum exactly to one");

    const changedProvider = clone() as unknown as Array<{
      components: Array<{ providerSourceId: number }>;
    }>;
    const providerComponent = changedProvider[0]?.components[0];
    if (!providerComponent) throw new Error("test fixture is incomplete");
    providerComponent.providerSourceId = 11;
    expect(() =>
      validateResearchBaselineRegistry(changedProvider as unknown as ResearchBaselineDefinition[]),
    ).toThrow("invalid provider contract");

    const forgedDigest = clone() as unknown as Array<{ definitionSha256: string }>;
    (forgedDigest[0] as { definitionSha256: string }).definitionSha256 = "0".repeat(64);
    expect(() =>
      validateResearchBaselineRegistry(forgedDigest as unknown as ResearchBaselineDefinition[]),
    ).toThrow("digest does not match");
  });

  it("binds a reviewed provider definition to exact governed series and parser identities", () => {
    const definition = PHASE3_RESEARCH_BASELINES[0] as ResearchBaselineDefinition;
    const model = bindResearchBaselineModel(definition, {
      modelId: "b38f47ac-19fc-7c92-ae91-0242ac120001",
      artifact: {
        id: "c38f47ac-19fc-7c92-ae91-0242ac120001",
        sha256: "1".repeat(64),
        algorithmKey: "economic-state.weighted-minmax",
        algorithmVersion: "1.0.0",
        configurationSha256: definition.definitionSha256,
        normalizationSha256: "2".repeat(64),
        assumptionsSha256: "3".repeat(64),
        approvalSha256: "4".repeat(64),
        lifecycleStatus: "research",
      },
      series: definition.components.map((component, index) => ({
        componentKey: component.key,
        indicatorCode: component.indicatorCode,
        conceptId: `d38f47ac-19fc-7c92-ae91-0242ac1200${index + 11}`,
        seriesId: `e38f47ac-19fc-7c92-ae91-0242ac1200${index + 11}`,
        parser: {
          name: "world-bank-wdi",
          version: "1.0.0",
          codeSha256: "5".repeat(64),
          configurationSha256: "6".repeat(64),
        },
      })),
    });

    expect(model).toMatchObject({
      schemaVersion: 2,
      key: definition.key,
      dimension: "macroeconomic",
      minimumCoverage: "0.6",
      artifact: { configurationSha256: definition.definitionSha256, lifecycleStatus: "research" },
    });
    expect(model.components).toHaveLength(3);
    expect(
      model.components.every(({ featureContractSha256 }) => featureContractSha256.length === 64),
    ).toBe(true);
    expect(Object.isFrozen(model.components)).toBe(true);

    expect(() =>
      bindResearchBaselineModel(definition, {
        modelId: model.id,
        artifact: { ...model.artifact, configurationSha256: "0".repeat(64) },
        series: [],
      }),
    ).toThrow("exact definition digest");
  });
});
