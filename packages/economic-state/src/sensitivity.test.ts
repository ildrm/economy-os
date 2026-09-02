import { digestJson } from "@economyos/data-admission";
import { describe, expect, it } from "vitest";

import {
  analyzeCompositeSensitivity,
  type CompositeComponentDefinition,
  type CompositeComponentInput,
  type CompositeStateContext,
  type CompositeStateModel,
} from "./index.js";

const parser = {
  name: "phase3-review-parser",
  version: "1.0.0",
  codeSha256: "1".repeat(64),
  configurationSha256: "2".repeat(64),
} as const;

function component(
  key: string,
  suffix: string,
  weight: string,
  polarity: "positive" | "negative",
): CompositeComponentDefinition {
  const definition = {
    schemaVersion: 1,
    seriesId: `138f47ac-19fc-7c92-ae91-0242ac1200${suffix}`,
    conceptId: `238f47ac-19fc-7c92-ae91-0242ac1200${suffix}`,
    unitCode: "index_points",
    frequency: "annual" as const,
    seasonalAdjustment: "not_applicable" as const,
    parser,
  };
  return {
    key,
    seriesId: definition.seriesId,
    conceptId: definition.conceptId,
    unitCode: definition.unitCode,
    frequency: definition.frequency,
    seasonalAdjustment: definition.seasonalAdjustment,
    parser,
    featureContractSha256: digestJson(definition),
    weight,
    polarity,
    lowerBound: "0",
    upperBound: "100",
  };
}

const model: CompositeStateModel = {
  schemaVersion: 2,
  id: "338f47ac-19fc-7c92-ae91-0242ac120001",
  key: "phase3.sensitivity-fixture",
  version: "1.0.0",
  dimension: "human_economic",
  minimumCoverage: "0.6",
  artifact: {
    id: "438f47ac-19fc-7c92-ae91-0242ac120001",
    sha256: "3".repeat(64),
    algorithmKey: "economic-state.weighted-minmax",
    algorithmVersion: "1.0.0",
    configurationSha256: "4".repeat(64),
    normalizationSha256: "5".repeat(64),
    assumptionsSha256: "6".repeat(64),
    approvalSha256: "7".repeat(64),
    lifecycleStatus: "research",
  },
  components: [
    component("component-a", "11", "0.5", "positive"),
    component("component-b", "12", "0.3", "negative"),
    component("component-c", "13", "0.2", "positive"),
  ],
};

const context: CompositeStateContext = {
  geographyId: "538f47ac-19fc-7c92-ae91-0242ac120001",
  knownAt: "2026-09-01T00:00:00Z",
  policy: "true_vintage",
  systemAt: "2026-09-01T00:00:01Z",
  snapshotSha256: "8".repeat(64),
};

function observed(componentKey: string, value: string, suffix: string): CompositeComponentInput {
  return {
    componentKey,
    value,
    missingReason: null,
    observationId: `638f47ac-19fc-7c92-ae91-0242ac1200${suffix}`,
    sourceId: `738f47ac-19fc-7c92-ae91-0242ac1200${suffix}`,
    sourceDatasetId: `838f47ac-19fc-7c92-ae91-0242ac1200${suffix}`,
    licenseReviewId: `938f47ac-19fc-7c92-ae91-0242ac1200${suffix}`,
    sourceAdmissionDecisionId: `a38f47ac-19fc-7c92-ae91-0242ac1200${suffix}`,
    quality: "0.9",
    qualityEvidenceSha256: "9".repeat(64),
    legalEvidenceSha256: "a".repeat(64),
  };
}

const inputs = [
  observed("component-a", "80", "11"),
  observed("component-b", "20", "12"),
  observed("component-c", "50", "13"),
] as const;

describe("composite coverage and sensitivity study", () => {
  it("records deterministic omission and weight scenarios without inventing neutral values", () => {
    const study = analyzeCompositeSensitivity(model, context, inputs);

    expect(study).toMatchObject({
      schemaVersion: 1,
      methodologyScope: "research_baseline",
      baselineStatus: "complete",
      baselineScore: "74",
      baselineCompleteness: "1",
      weightPerturbation: "0.1",
      baselineMissingComponentKeys: [],
      coverageThresholdCrossingComponentKeys: ["component-a"],
      scoreRange: { minimum: "71.428571", maximum: "80", spread: "8.571429" },
    });
    expect(study.scenarios).toHaveLength(9);
    expect(study.scenarios.slice(0, 3).map(({ kind }) => kind)).toEqual([
      "component_omission",
      "weight_decrease",
      "weight_increase",
    ]);
    expect(study.scenarios[0]).toMatchObject({
      componentKey: "component-a",
      status: "insufficient_data",
      score: null,
      scoreDelta: null,
      completeness: "0.5",
      renormalized: false,
      missingReason: "insufficient_component_coverage",
    });
    expect(study.scenarios[3]).toMatchObject({
      componentKey: "component-b",
      status: "partial",
      score: "71.428571",
      completeness: "0.7",
      renormalized: true,
    });
    expect(study.manifestSha256).toHaveLength(64);
    expect(analyzeCompositeSensitivity(model, context, inputs)).toEqual(study);
    expect(Object.isFrozen(study.scenarios)).toBe(true);
  });

  it("makes pre-existing missingness explicit and excludes it from perturbation scenarios", () => {
    const missing = {
      componentKey: "component-c",
      value: null,
      missingReason: "source_missing",
      observationId: null,
      sourceId: null,
      sourceDatasetId: null,
      licenseReviewId: null,
      sourceAdmissionDecisionId: null,
      quality: null,
      qualityEvidenceSha256: null,
      legalEvidenceSha256: null,
    } as const;
    const study = analyzeCompositeSensitivity(model, context, [inputs[0], inputs[1], missing]);
    expect(study.baselineMissingComponentKeys).toEqual(["component-c"]);
    expect(study.scenarios).toHaveLength(6);
    expect(study.scenarios.some(({ componentKey }) => componentKey === "component-c")).toBe(false);
  });

  it("rejects unbounded sensitivity knobs", () => {
    expect(() =>
      analyzeCompositeSensitivity(model, context, inputs, { weightPerturbation: "0" }),
    ).toThrow("greater than zero");
    expect(() =>
      analyzeCompositeSensitivity(model, context, inputs, { weightPerturbation: "0.500001" }),
    ).toThrow("at most 0.5");
    expect(() =>
      analyzeCompositeSensitivity(model, context, inputs, {
        omissionReason: "not-a-reason" as never,
      }),
    ).toThrow("omissionReason is invalid");
  });
});
