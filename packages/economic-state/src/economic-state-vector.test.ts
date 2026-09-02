import { digestJson } from "@economyos/data-admission";
import { describe, expect, it } from "vitest";
import {
  assembleEconomicState,
  type CompositeStateContext,
  type CompositeStateModel,
  type CompositeStateResult,
  computeCompositeState,
  ECONOMIC_STATE_DIMENSIONS,
  type EconomicStateDimension,
  type EconomicStateDimensionInput,
} from "./index.js";

const context: CompositeStateContext = {
  geographyId: "058f47ac-19fc-7c92-ae91-0242ac120100",
  knownAt: "2026-08-31T00:00:00Z",
  policy: "latest_revised",
  snapshotSha256: "b".repeat(64),
};

function uuid(suffix: number): string {
  return `058f47ac-19fc-7c92-ae91-0242ac12${suffix.toString().padStart(4, "0")}`;
}

function makeModel(dimension: EconomicStateDimension, index: number): CompositeStateModel {
  const conceptId = uuid(300 + index);
  const seriesId = uuid(600 + index);
  const parser = {
    name: "governed-fixture-parser",
    version: "1.0.0",
    codeSha256: "a".repeat(64),
    configurationSha256: "b".repeat(64),
  } as const;
  const featureContract = {
    schemaVersion: 1,
    seriesId,
    conceptId,
    unitCode: "index_points",
    frequency: "annual",
    seasonalAdjustment: "not_applicable",
    parser,
  } as const;
  return {
    schemaVersion: 2,
    id: uuid(200 + index),
    key: `state.${dimension}`,
    version: "1.0.0",
    dimension,
    minimumCoverage: "0",
    artifact: {
      id: uuid(700 + index),
      sha256: ((5 + index) % 16).toString(16).repeat(64),
      algorithmKey: "economic-state.weighted-minmax",
      algorithmVersion: "1.0.0",
      configurationSha256: "c".repeat(64),
      normalizationSha256: "d".repeat(64),
      assumptionsSha256: "e".repeat(64),
      approvalSha256: "f".repeat(64),
      lifecycleStatus: "validated",
    },
    components: [
      {
        key: `indicator-${index}`,
        conceptId,
        seriesId,
        unitCode: featureContract.unitCode,
        frequency: featureContract.frequency,
        seasonalAdjustment: featureContract.seasonalAdjustment,
        parser,
        featureContractSha256: digestJson(featureContract),
        weight: "1",
        polarity: "positive",
        lowerBound: "0",
        upperBound: "100",
      },
    ],
  };
}

function makeResult(
  dimension: EconomicStateDimension,
  index: number,
  stateContext: CompositeStateContext = context,
  options: { readonly missing?: boolean; readonly quality?: string } = {},
): CompositeStateResult {
  const model = makeModel(dimension, index);
  return computeCompositeState(model, stateContext, [
    options.missing
      ? {
          componentKey: `indicator-${index}`,
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
        }
      : {
          componentKey: `indicator-${index}`,
          value: `${60 + index}`,
          missingReason: null,
          observationId: uuid(400 + index),
          sourceId: uuid(500 + index),
          sourceDatasetId: uuid(800 + index),
          licenseReviewId: uuid(900 + index),
          sourceAdmissionDecisionId: uuid(1000 + index),
          quality: options.quality ?? "0.8",
          qualityEvidenceSha256: `${(index % 10).toString()}`.repeat(64),
          legalEvidenceSha256: ((10 + index) % 16).toString(16).repeat(64),
        },
  ]);
}

function completeDimensionInputs(
  stateContext: CompositeStateContext = context,
): readonly EconomicStateDimensionInput[] {
  return ECONOMIC_STATE_DIMENSIONS.map((dimension, index) => ({
    dimension,
    model: makeModel(dimension, index),
    result: makeResult(dimension, index, stateContext),
    missingReason: null,
  }));
}

function resign(
  result: CompositeStateResult,
  changes: Partial<CompositeStateResult>,
): CompositeStateResult {
  const { manifestSha256: _priorManifest, ...body } = { ...result, ...changes };
  return { ...body, manifestSha256: digestJson(body) } as CompositeStateResult;
}

describe("multidimensional EconomicState vector", () => {
  it("preserves all five dimension results without inventing a mega-score", () => {
    const inputs = completeDimensionInputs();
    const state = assembleEconomicState(context, [...inputs].reverse());

    expect(state.dimensions.map(({ dimension }) => dimension)).toEqual(ECONOMIC_STATE_DIMENSIONS);
    expect(state.dimensions.map(({ result }) => result?.score)).toEqual([
      "60",
      "61",
      "62",
      "63",
      "64",
    ]);
    expect(state).not.toHaveProperty("score");
    expect(state.diagnostics).not.toHaveProperty("score");
    expect(state.diagnostics).toEqual({
      dimensionCount: 5,
      reportedDimensionCount: 5,
      scoredDimensionCount: 5,
      insufficientDimensionCount: 0,
      missingDimensionCount: 0,
      dimensionCoverage: "1",
      scoredDimensionCoverage: "1",
      evidenceCoverage: "1",
      confidenceCoverage: "0.8",
      evidenceQuality: "0.8",
      reportedComponentCount: 5,
      observedComponentCount: 5,
      distinctSourceCount: 5,
      distinctSourceCoverage: "1",
    });
    expect(state.contextSha256).toBe(digestJson(state.context));
    const { manifestSha256, ...body } = state;
    expect(manifestSha256).toBe(digestJson(body));
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.dimensions[0]?.result?.components)).toBe(true);
  });

  it("separates unscored evidence, absent dimensions, coverage, and evidence quality", () => {
    const state = assembleEconomicState(context, [
      {
        dimension: "macroeconomic",
        model: makeModel("macroeconomic", 0),
        result: makeResult("macroeconomic", 0, context, { quality: "0.75" }),
        missingReason: null,
      },
      {
        dimension: "human_economic",
        model: makeModel("human_economic", 1),
        result: makeResult("human_economic", 1, context, { missing: true }),
        missingReason: null,
      },
      {
        dimension: "financial_system",
        model: null,
        result: null,
        missingReason: "not_modeled",
      },
      { dimension: "market", model: null, result: null, missingReason: "source_missing" },
      { dimension: "regime", model: null, result: null, missingReason: "model_unavailable" },
    ]);

    expect(state.diagnostics).toMatchObject({
      reportedDimensionCount: 2,
      scoredDimensionCount: 1,
      insufficientDimensionCount: 1,
      missingDimensionCount: 3,
      dimensionCoverage: "0.4",
      scoredDimensionCoverage: "0.2",
      evidenceCoverage: "0.2",
      confidenceCoverage: "0.15",
      evidenceQuality: "0.75",
      reportedComponentCount: 2,
      observedComponentCount: 1,
      distinctSourceCount: 1,
      distinctSourceCoverage: "0.5",
    });
    expect(state.dimensions[1]?.result).toMatchObject({
      status: "insufficient_data",
      score: null,
      completeness: "0",
    });
    expect(state.dimensions[2]).toEqual({
      dimension: "financial_system",
      model: null,
      result: null,
      missingReason: "not_modeled",
    });
  });

  it("does not manufacture confidence or source coverage when every dimension is missing", () => {
    const state = assembleEconomicState(
      context,
      ECONOMIC_STATE_DIMENSIONS.map((dimension) => ({
        dimension,
        model: null,
        result: null,
        missingReason: "not_modeled",
      })),
    );
    expect(state.diagnostics).toMatchObject({
      dimensionCoverage: "0",
      scoredDimensionCoverage: "0",
      evidenceCoverage: "0",
      confidenceCoverage: "0",
      evidenceQuality: null,
      distinctSourceCoverage: null,
    });
  });

  it("requires one explicit result or missing reason for every named dimension", () => {
    const inputs = [...completeDimensionInputs()];
    expect(() => assembleEconomicState(context, inputs.slice(0, 4))).toThrow("exactly one record");
    expect(() =>
      assembleEconomicState(context, [
        ...inputs.slice(0, 4),
        { dimension: "regime", model: null, result: null, missingReason: null },
      ]),
    ).toThrow("exactly one result or explicit missing reason");
    expect(() =>
      assembleEconomicState(context, [
        ...inputs.slice(0, 4),
        {
          dimension: "regime",
          model: inputs[4]?.model ?? null,
          result: inputs[4]?.result ?? null,
          missingReason: "not_modeled",
        },
      ]),
    ).toThrow("exactly one result or explicit missing reason");
    expect(() =>
      assembleEconomicState(context, [
        ...inputs.slice(0, 4),
        {
          dimension: "regime",
          model: null,
          result: null,
          missingReason: "mysteriously_absent" as "not_modeled",
        },
      ]),
    ).toThrow("missing reason is invalid");
    expect(() =>
      assembleEconomicState(context, [
        ...inputs.slice(0, 4),
        {
          dimension: "regime",
          model: null,
          result: inputs[4]?.result ?? null,
          missingReason: null,
        },
      ]),
    ).toThrow("requires its model definition");
    expect(() =>
      assembleEconomicState(context, [
        ...inputs.slice(0, 4),
        {
          dimension: "regime",
          model: inputs[4]?.model ?? null,
          result: null,
          missingReason: "not_modeled",
        },
      ]),
    ).toThrow("cannot declare a model");
    expect(() =>
      assembleEconomicState(context, [
        ...inputs.slice(0, 4),
        {
          dimension: "macroeconomic",
          model: inputs[0]?.model ?? null,
          result: inputs[0]?.result ?? null,
          missingReason: null,
        },
      ]),
    ).toThrow("macroeconomic is duplicated");
  });

  it("rejects every cross-dimension geography, PIT, and snapshot mismatch", () => {
    const inputs = [...completeDimensionInputs()];
    const macro = inputs[0]?.result;
    const macroModel = inputs[0]?.model;
    if (!macro || !macroModel) throw new Error("test fixture is incomplete");
    const replaceMacro = (result: CompositeStateResult): EconomicStateDimensionInput[] => [
      { dimension: "macroeconomic", model: macroModel, result, missingReason: null },
      ...(inputs.slice(1) as EconomicStateDimensionInput[]),
    ];

    expect(() =>
      assembleEconomicState(context, replaceMacro(resign(macro, { geographyId: uuid(999) }))),
    ).toThrow("does not share");
    expect(() =>
      assembleEconomicState(
        context,
        replaceMacro(resign(macro, { knownAt: "2026-08-30T00:00:00Z" })),
      ),
    ).toThrow("does not share");
    expect(() =>
      assembleEconomicState(context, replaceMacro(resign(macro, { policy: "true_vintage" }))),
    ).toThrow("does not share");
    expect(() =>
      assembleEconomicState(
        context,
        replaceMacro(resign(macro, { snapshotSha256: "c".repeat(64) })),
      ),
    ).toThrow("does not share");

    const trueVintageContext: CompositeStateContext = {
      ...context,
      policy: "true_vintage",
    };
    const trueVintageInputs = [...completeDimensionInputs(trueVintageContext)];
    const trueVintageMacro = trueVintageInputs[0]?.result;
    const trueVintageMacroModel = trueVintageInputs[0]?.model;
    if (!trueVintageMacro || !trueVintageMacroModel) {
      throw new Error("test fixture is incomplete");
    }
    expect(() =>
      assembleEconomicState(trueVintageContext, [
        {
          dimension: "macroeconomic",
          model: trueVintageMacroModel,
          result: resign(trueVintageMacro, { systemAt: "2026-08-30T00:00:00Z" }),
          missingReason: null,
        },
        ...(trueVintageInputs.slice(1) as EconomicStateDimensionInput[]),
      ]),
    ).toThrow("does not share");
  });

  it("verifies nested integrity and reproduces arithmetic without claiming authenticity", () => {
    const inputs = [...completeDimensionInputs()];
    const macro = inputs[0]?.result;
    const macroModel = inputs[0]?.model;
    if (!macro || !macroModel) throw new Error("test fixture is incomplete");

    expect(() =>
      assembleEconomicState(context, [
        {
          dimension: "macroeconomic",
          model: macroModel,
          result: { ...macro, score: "99" },
          missingReason: null,
        },
        ...(inputs.slice(1) as EconomicStateDimensionInput[]),
      ]),
    ).toThrow("manifest digest does not match");
    expect(() =>
      assembleEconomicState(context, [
        {
          dimension: "macroeconomic",
          model: macroModel,
          result: resign(macro, { score: null }),
          missingReason: null,
        },
        ...(inputs.slice(1) as EconomicStateDimensionInput[]),
      ]),
    ).toThrow("complete status is inconsistent");
    expect(() =>
      assembleEconomicState(context, [
        {
          dimension: "macroeconomic",
          model: macroModel,
          result: makeResult("human_economic", 20),
          missingReason: null,
        },
        ...(inputs.slice(1) as EconomicStateDimensionInput[]),
      ]),
    ).toThrow("does not match its macroeconomic slot");
    expect(() =>
      assembleEconomicState(context, [
        {
          dimension: "macroeconomic",
          model: macroModel,
          result: resign(macro, { score: "99" }),
          missingReason: null,
        },
        ...(inputs.slice(1) as EconomicStateDimensionInput[]),
      ]),
    ).toThrow("not reproducible from its bound model");
  });

  it("rejects re-signed artifact/legal forgery and non-C punctuation key order", () => {
    const inputs = [...completeDimensionInputs()];
    const macro = inputs[0]?.result;
    const macroModel = inputs[0]?.model;
    const component = macro?.components[0];
    if (!macro || !macroModel || !component) throw new Error("test fixture is incomplete");
    const replaceMacro = (result: CompositeStateResult): EconomicStateDimensionInput[] => [
      { dimension: "macroeconomic", model: macroModel, result, missingReason: null },
      ...(inputs.slice(1) as EconomicStateDimensionInput[]),
    ];

    expect(() =>
      assembleEconomicState(context, replaceMacro(resign(macro, { modelArtifactId: uuid(999) }))),
    ).toThrow("does not bind its exact model and artifact identity");
    expect(() =>
      assembleEconomicState(
        context,
        replaceMacro(resign(macro, { modelArtifactSha256: "0".repeat(64) })),
      ),
    ).toThrow("does not bind its exact model and artifact identity");
    expect(() =>
      assembleEconomicState(
        context,
        replaceMacro(
          resign(macro, {
            components: [{ ...component, legalEvidenceSha256: "unbound" }],
          }),
        ),
      ),
    ).toThrow("legalEvidenceSha256 must be a lowercase SHA-256 digest");
    expect(() =>
      assembleEconomicState(
        context,
        replaceMacro(
          resign(macro, {
            components: [{ ...component, sourceDatasetId: "not-a-uuid" }],
          }),
        ),
      ),
    ).toThrow("sourceDatasetId must be a lowercase UUID");

    const missingMacro = makeResult("macroeconomic", 0, context, { missing: true });
    const missingComponent = missingMacro.components[0];
    if (!missingComponent) throw new Error("test fixture is incomplete");
    expect(() =>
      assembleEconomicState(
        context,
        replaceMacro(
          resign(missingMacro, {
            components: [{ ...missingComponent, legalEvidenceSha256: "0".repeat(64) }],
          }),
        ),
      ),
    ).toThrow("missing component indicator-0 has invalid evidence");

    const nonCanonicalComponents = [
      { ...component, componentKey: "indicator_under" },
      { ...component, componentKey: "indicator-dash" },
      { ...component, componentKey: "indicator.dot" },
    ];
    expect(() =>
      assembleEconomicState(
        context,
        replaceMacro(resign(macro, { components: nonCanonicalComponents })),
      ),
    ).toThrow("components must use canonical key order");
  });

  it("is deterministic across dimension input ordering", () => {
    const inputs = completeDimensionInputs();
    expect(assembleEconomicState(context, [...inputs].reverse())).toEqual(
      assembleEconomicState(context, inputs),
    );
  });
});
