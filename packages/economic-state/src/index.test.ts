import { digestJson } from "@economyos/data-admission";
import { describe, expect, it } from "vitest";
import {
  type CompositeComponentDefinition,
  type CompositeComponentInput,
  type CompositeStateContext,
  type CompositeStateModel,
  computeCompositeState,
} from "./index.js";

const parser = {
  name: "governed-fixture-parser",
  version: "1.0.0",
  codeSha256: "8".repeat(64),
  configurationSha256: "9".repeat(64),
} as const;

function component(
  definition: Pick<
    CompositeComponentDefinition,
    "key" | "conceptId" | "seriesId" | "weight" | "polarity" | "lowerBound" | "upperBound"
  > &
    Partial<Pick<CompositeComponentDefinition, "unitCode" | "frequency" | "seasonalAdjustment">>,
): CompositeComponentDefinition {
  const featureContract = {
    schemaVersion: 1,
    seriesId: definition.seriesId,
    conceptId: definition.conceptId,
    unitCode: definition.unitCode ?? "index_points",
    frequency: definition.frequency ?? "annual",
    seasonalAdjustment: definition.seasonalAdjustment ?? "not_applicable",
    parser,
  } as const;
  return {
    ...definition,
    unitCode: featureContract.unitCode,
    frequency: featureContract.frequency,
    seasonalAdjustment: featureContract.seasonalAdjustment,
    parser,
    featureContractSha256: digestJson(featureContract),
  };
}

const model = {
  schemaVersion: 2,
  id: "058f47ac-19fc-7c92-ae91-0242ac120001",
  key: "human.household-resilience",
  version: "1.0.0",
  dimension: "human_economic",
  minimumCoverage: "0.5",
  artifact: {
    id: "058f47ac-19fc-7c92-ae91-0242ac120009",
    sha256: "d".repeat(64),
    algorithmKey: "economic-state.weighted-minmax",
    algorithmVersion: "1.0.0",
    configurationSha256: "e".repeat(64),
    normalizationSha256: "f".repeat(64),
    assumptionsSha256: "1".repeat(64),
    approvalSha256: "2".repeat(64),
    lifecycleStatus: "validated",
  },
  components: [
    component({
      key: "purchasing-power",
      conceptId: "058f47ac-19fc-7c92-ae91-0242ac120002",
      seriesId: "058f47ac-19fc-7c92-ae91-0242ac120012",
      weight: "0.6",
      polarity: "positive",
      lowerBound: "0",
      upperBound: "100",
    }),
    component({
      key: "housing-burden",
      conceptId: "058f47ac-19fc-7c92-ae91-0242ac120003",
      seriesId: "058f47ac-19fc-7c92-ae91-0242ac120013",
      weight: "0.4",
      polarity: "negative",
      lowerBound: "0",
      upperBound: "100",
    }),
  ],
} as const satisfies CompositeStateModel;

const context: CompositeStateContext = {
  geographyId: "058f47ac-19fc-7c92-ae91-0242ac120004",
  knownAt: "2026-08-31T00:00:00Z",
  policy: "latest_revised",
  snapshotSha256: "a".repeat(64),
};

const completeInputs: readonly CompositeComponentInput[] = [
  {
    componentKey: "purchasing-power",
    value: "75",
    missingReason: null,
    observationId: "058f47ac-19fc-7c92-ae91-0242ac120005",
    sourceId: "058f47ac-19fc-7c92-ae91-0242ac120006",
    sourceDatasetId: "058f47ac-19fc-7c92-ae91-0242ac120014",
    licenseReviewId: "058f47ac-19fc-7c92-ae91-0242ac120015",
    sourceAdmissionDecisionId: "058f47ac-19fc-7c92-ae91-0242ac120016",
    quality: "1",
    qualityEvidenceSha256: "b".repeat(64),
    legalEvidenceSha256: "4".repeat(64),
  },
  {
    componentKey: "housing-burden",
    value: "20",
    missingReason: null,
    observationId: "058f47ac-19fc-7c92-ae91-0242ac120007",
    sourceId: "058f47ac-19fc-7c92-ae91-0242ac120008",
    sourceDatasetId: "058f47ac-19fc-7c92-ae91-0242ac120017",
    licenseReviewId: "058f47ac-19fc-7c92-ae91-0242ac120018",
    sourceAdmissionDecisionId: "058f47ac-19fc-7c92-ae91-0242ac120019",
    quality: "0.9",
    qualityEvidenceSha256: "c".repeat(64),
    legalEvidenceSha256: "5".repeat(64),
  },
];

describe("transparent composite economic state", () => {
  it("computes exact weighted polarity, completeness, confidence, and provenance", () => {
    const result = computeCompositeState(model, context, completeInputs);
    expect(result).toMatchObject({
      schemaVersion: 2,
      modelArtifactId: model.artifact.id,
      modelArtifactSha256: model.artifact.sha256,
      status: "complete",
      score: "77",
      completeness: "1",
      sourceCoverage: "1",
      confidence: "0.96",
      distinctSourceCount: 2,
      renormalized: false,
      missingReason: null,
    });
    expect(result.components.map((component) => component.normalizedValue)).toEqual([
      "0.8",
      "0.75",
    ]);
    expect(result.components[0]).toMatchObject({
      sourceDatasetId: completeInputs[1]?.sourceDatasetId,
      licenseReviewId: completeInputs[1]?.licenseReviewId,
      sourceAdmissionDecisionId: completeInputs[1]?.sourceAdmissionDecisionId,
      legalEvidenceSha256: completeInputs[1]?.legalEvidenceSha256,
    });
    expect(result.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    const { manifestSha256, ...body } = result;
    expect(manifestSha256).toBe(digestJson(body));
  });

  it("keeps missingness explicit and renormalizes available evidence instead of treating it as neutral", () => {
    const result = computeCompositeState(model, context, [
      completeInputs[0] as CompositeComponentInput,
      {
        componentKey: "housing-burden",
        value: null,
        missingReason: "not_collected",
        observationId: null,
        sourceId: null,
        sourceDatasetId: null,
        licenseReviewId: null,
        sourceAdmissionDecisionId: null,
        quality: null,
        qualityEvidenceSha256: null,
        legalEvidenceSha256: null,
      },
    ]);
    expect(result).toMatchObject({
      status: "partial",
      score: "75",
      completeness: "0.6",
      confidence: "0.6",
      renormalized: true,
    });
    expect(result.components[0]).toMatchObject({
      missingReason: "not_collected",
      sourceDatasetId: null,
      licenseReviewId: null,
      sourceAdmissionDecisionId: null,
      legalEvidenceSha256: null,
    });
  });

  it("rejects missing components that claim legal-admission evidence", () => {
    expect(() =>
      computeCompositeState(model, context, [
        completeInputs[0] as CompositeComponentInput,
        {
          componentKey: "housing-burden",
          value: null,
          missingReason: "not_collected",
          observationId: null,
          sourceId: null,
          sourceDatasetId: "058f47ac-19fc-7c92-ae91-0242ac120017",
          licenseReviewId: null,
          sourceAdmissionDecisionId: null,
          quality: null,
          qualityEvidenceSha256: null,
          legalEvidenceSha256: null,
        },
      ]),
    ).toThrow("cannot claim evidence bindings");
  });

  it("fails closed when explicit available weight is below the model threshold", () => {
    const result = computeCompositeState(model, context, [
      {
        componentKey: "purchasing-power",
        value: null,
        missingReason: "delayed",
        observationId: null,
        sourceId: null,
        sourceDatasetId: null,
        licenseReviewId: null,
        sourceAdmissionDecisionId: null,
        quality: null,
        qualityEvidenceSha256: null,
        legalEvidenceSha256: null,
      },
      completeInputs[1] as CompositeComponentInput,
    ]);
    expect(result).toMatchObject({
      status: "insufficient_data",
      score: null,
      missingReason: "insufficient_component_coverage",
      completeness: "0.4",
      renormalized: false,
    });
  });

  it("never produces a score without evidence even when a model declares a zero threshold", () => {
    const missingInputs: readonly CompositeComponentInput[] = model.components.map((component) => ({
      componentKey: component.key,
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
    }));
    expect(
      computeCompositeState({ ...model, minimumCoverage: "0" }, context, missingInputs),
    ).toMatchObject({
      status: "insufficient_data",
      score: null,
      completeness: "0",
      confidence: "0",
    });
  });

  it("is deterministic across input ordering and exact decimal arithmetic", () => {
    const first = computeCompositeState(model, context, completeInputs);
    const second = computeCompositeState(model, context, [...completeInputs].reverse());
    expect(second).toEqual(first);
  });

  it("rejects forged series identity and feature-contract digests", () => {
    const forgedSeriesModel = {
      ...model,
      components: [
        {
          ...model.components[0],
          seriesId: "058f47ac-19fc-7c92-ae91-0242ac120099",
        },
        model.components[1],
      ],
    } satisfies CompositeStateModel;
    expect(() => computeCompositeState(forgedSeriesModel, context, completeInputs)).toThrow(
      "does not bind its exact series and parser contract",
    );

    const forgedContractModel = {
      ...model,
      components: [
        { ...model.components[0], featureContractSha256: "0".repeat(64) },
        model.components[1],
      ],
    } satisfies CompositeStateModel;
    expect(() => computeCompositeState(forgedContractModel, context, completeInputs)).toThrow(
      "does not bind its exact series and parser contract",
    );
  });

  it("orders punctuation-bearing component keys by C/code-unit order", () => {
    const punctuationModel: CompositeStateModel = {
      ...model,
      id: "058f47ac-19fc-7c92-ae91-0242ac120030",
      components: [
        component({
          key: "signal_under",
          conceptId: "058f47ac-19fc-7c92-ae91-0242ac120031",
          seriesId: "058f47ac-19fc-7c92-ae91-0242ac120041",
          weight: "1",
          polarity: "positive",
          lowerBound: "0",
          upperBound: "100",
        }),
        component({
          key: "signal.dot",
          conceptId: "058f47ac-19fc-7c92-ae91-0242ac120032",
          seriesId: "058f47ac-19fc-7c92-ae91-0242ac120042",
          weight: "1",
          polarity: "positive",
          lowerBound: "0",
          upperBound: "100",
        }),
        component({
          key: "signal-dash",
          conceptId: "058f47ac-19fc-7c92-ae91-0242ac120033",
          seriesId: "058f47ac-19fc-7c92-ae91-0242ac120043",
          weight: "1",
          polarity: "positive",
          lowerBound: "0",
          upperBound: "100",
        }),
      ],
    };
    const punctuationInputs: CompositeComponentInput[] = punctuationModel.components.map(
      (definition, index) => ({
        componentKey: definition.key,
        value: `${20 + index}`,
        missingReason: null,
        observationId: `058f47ac-19fc-7c92-ae91-0242ac1200${50 + index}`,
        sourceId: `058f47ac-19fc-7c92-ae91-0242ac1200${60 + index}`,
        sourceDatasetId: `058f47ac-19fc-7c92-ae91-0242ac1200${70 + index}`,
        licenseReviewId: `058f47ac-19fc-7c92-ae91-0242ac1200${80 + index}`,
        sourceAdmissionDecisionId: `058f47ac-19fc-7c92-ae91-0242ac1200${90 + index}`,
        quality: "1",
        qualityEvidenceSha256: `${3 + index}`.repeat(64),
        legalEvidenceSha256: `${6 + index}`.repeat(64),
      }),
    );

    expect(
      computeCompositeState(punctuationModel, context, punctuationInputs).components.map(
        ({ componentKey }) => componentKey,
      ),
    ).toEqual(["signal-dash", "signal.dot", "signal_under"]);
  });

  it("rejects implicit missingness, out-of-bounds evidence, and invalid PIT context", () => {
    expect(() =>
      computeCompositeState(model, context, [completeInputs[0] as CompositeComponentInput]),
    ).toThrow("Every model component");
    expect(() =>
      computeCompositeState(model, context, [
        { ...(completeInputs[0] as CompositeComponentInput), value: "101" },
        completeInputs[1] as CompositeComponentInput,
      ]),
    ).toThrow("outside its governed normalization bounds");
    expect(() =>
      computeCompositeState(model, { ...context, policy: "reconstructed" }, completeInputs),
    ).toThrow("requires systemAt");
    expect(() =>
      computeCompositeState(model, { ...context, systemAt: context.knownAt }, completeInputs),
    ).toThrow("latest_revised policy cannot declare systemAt");
    expect(
      computeCompositeState(
        model,
        { ...context, policy: "true_vintage", systemAt: context.knownAt },
        completeInputs,
      ).status,
    ).toBe("complete");
    expect(() =>
      computeCompositeState(
        {
          ...model,
          components: [
            { ...model.components[0], polarity: "sideways" as "positive" },
            model.components[1],
          ],
        },
        context,
        completeInputs,
      ),
    ).toThrow("component polarity is invalid");
    expect(() =>
      computeCompositeState(
        model,
        { ...context, policy: "timeless" as "latest_revised" },
        completeInputs,
      ),
    ).toThrow("point-in-time policy is invalid");
    expect(() =>
      computeCompositeState(model, context, [
        {
          ...(completeInputs[0] as CompositeComponentInput),
          value: "1".repeat(129),
        },
        completeInputs[1] as CompositeComponentInput,
      ]),
    ).toThrow("bounded canonical decimal");
    expect(() =>
      computeCompositeState(model, context, [
        {
          ...(completeInputs[0] as CompositeComponentInput),
          qualityEvidenceSha256: null,
        },
        completeInputs[1] as CompositeComponentInput,
      ]),
    ).toThrow("requires provenance, legal admission, quality, and evidence digests");
    expect(() =>
      computeCompositeState(model, context, [
        {
          ...(completeInputs[0] as CompositeComponentInput),
          qualityEvidenceSha256: "unbound",
        },
        completeInputs[1] as CompositeComponentInput,
      ]),
    ).toThrow("qualityEvidenceSha256 must be a lowercase SHA-256 digest");
    expect(() =>
      computeCompositeState(model, context, [
        {
          ...(completeInputs[0] as CompositeComponentInput),
          legalEvidenceSha256: "unbound",
        },
        completeInputs[1] as CompositeComponentInput,
      ]),
    ).toThrow("legalEvidenceSha256 must be a lowercase SHA-256 digest");
  });
});
