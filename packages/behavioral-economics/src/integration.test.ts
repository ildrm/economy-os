import type { RelationshipAssertionInput } from "@economyos/causal-graph";
import { describe, expect, it } from "vitest";
import { createBehavioralStudy } from "./evidence.js";
import { date, id, studyInput, tenant } from "./fixtures.test-helper.js";
import {
  assembleBehavioralStateAsOf,
  type BehavioralConstructInput,
  type BehavioralPredictiveValidation,
  behavioralConstructGraphNode,
  createBehavioralCausalHypothesis,
  createBehavioralConstruct,
  materializeBehavioralForecastFeature,
} from "./integration.js";
import { integrity } from "./internals.js";

function measurementInput(): BehavioralConstructInput {
  return {
    measurementId: id(70),
    scope: tenant,
    construct: "consumer_confidence",
    population: "aggregate employees",
    jurisdiction: "fixture-jurisdiction",
    definitionSha256: "a".repeat(64),
    value: "42.5",
    missingReason: null,
    unit: "survey-index",
    valueSemantics: "index",
    epistemicClass: "estimated",
    observedAt: "2023-12-01T00:00:00Z",
    availableAt: "2024-01-01T00:00:00Z",
    recordedAt: "2024-01-02T00:00:00Z",
    measurementMethod: "Fixture aggregate measurement",
    uncertainty: "Not quantified in synthetic fixture",
    evidence: createBehavioralStudy(studyInput()),
  };
}
function validation(): BehavioralPredictiveValidation {
  return {
    definitionSha256: "a".repeat(64),
    population: "aggregate employees",
    jurisdiction: "fixture-jurisdiction",
    reviewerId: id(71),
    reviewedAt: "2024-02-01T00:00:00Z",
    recordedAt: "2024-02-02T00:00:00Z",
    calibrationThrough: "2022-12-31T00:00:00Z",
    evaluationStartsAt: "2023-01-01T00:00:00Z",
    evaluationEndsAt: "2023-12-31T00:00:00Z",
    pairedEvaluationSha256: "b".repeat(64),
    leakageAuditSha256: "c".repeat(64),
    metric: "mean_squared_error",
    baselineLoss: "2",
    augmentedLoss: "1.5",
    sampleCount: 20,
    limitations: ["Fixture reports only; no validated real prediction performance"],
  };
}
describe("cross-domain behavioral integration", () => {
  it("preserves a large agreeing source group and detects a final conflicting source across equivalent instant formats", () => {
    const base = measurementInput();
    const measurements = Array.from({ length: 1024 }, (_, index) =>
      createBehavioralConstruct({
        ...base,
        measurementId: id(1000 + index),
        observedAt: index % 2 === 0 ? base.observedAt : "2023-12-01T00:00:00.000Z",
      }),
    );
    const input = {
      scope: tenant,
      knownAt: date,
      systemAt: date,
      population: base.population,
      jurisdiction: base.jurisdiction,
      measurements,
    };
    const agreeing = assembleBehavioralStateAsOf(input).dimensions[0];
    expect(agreeing?.measurements).toHaveLength(1024);
    expect(agreeing?.sourceDisagreement).toBe(false);
    const conflict = createBehavioralConstruct({ ...base, measurementId: id(2024), value: "30" });
    const disagreeing = assembleBehavioralStateAsOf({
      ...input,
      measurements: [...measurements, conflict],
    }).dimensions[0];
    expect(disagreeing?.measurements).toHaveLength(1025);
    expect(disagreeing?.sourceDisagreement).toBe(true);
    expect(disagreeing?.measurements.slice(0, 1024)).toEqual(agreeing?.measurements);
  });
  it("preserves behavioral constructs separately, revisions and conflicting definitions without a universal score", () => {
    const measure = createBehavioralConstruct(measurementInput());
    const revision = createBehavioralConstruct({
      ...measurementInput(),
      measurementId: id(73),
      availableAt: "2024-04-01T00:00:00Z",
      recordedAt: "2024-04-02T00:00:00Z",
      value: "60",
    });
    const alternative = createBehavioralConstruct({
      ...measurementInput(),
      measurementId: id(74),
      definitionSha256: "d".repeat(64),
      value: "20",
    });
    const input = {
      scope: tenant,
      knownAt: date,
      systemAt: date,
      population: measure.population,
      jurisdiction: measure.jurisdiction,
      measurements: [measure, revision, alternative],
    };
    const result = assembleBehavioralStateAsOf(input);
    expect(result.overallScore).toBeNull();
    const dimension = result.dimensions.find((item) => item.construct === measure.construct);
    expect(dimension?.measurements.map((item) => item?.value)).toEqual(["42.5", "20"]);
    expect(dimension?.definitionDisagreement).toBe(true);
    expect(
      result.dimensions.find((item) => item.construct === "risk_perception")?.missingReason,
    ).toBe("no_measurement_known_at_cutoff");
    expect(() =>
      assembleBehavioralStateAsOf({ ...input, measurements: [measure, measure] }),
    ).toThrow(/Duplicate/);
    expect(() => createBehavioralConstruct({ ...measurementInput(), population: "other" })).toThrow(
      /population/,
    );
    const sourceDisagreement = createBehavioralConstruct({
      ...measurementInput(),
      measurementId: id(75),
      value: "30",
    });
    const conflicting = assembleBehavioralStateAsOf({
      ...input,
      measurements: [measure, sourceDisagreement],
    });
    expect(conflicting.dimensions[0]?.measurements).toHaveLength(2);
    expect(conflicting.dimensions[0]?.sourceDisagreement).toBe(true);
    expect(() =>
      createBehavioralConstruct({ ...measurementInput(), availableAt: "2023-12-31T00:00:00Z" }),
    ).toThrow(/evidence/);
  });
  it("excludes scenario values from observed state and preserves explicit missing measurements", () => {
    const simulated = createBehavioralConstruct({
      ...measurementInput(),
      epistemicClass: "simulation",
    });
    const missing = createBehavioralConstruct({
      ...measurementInput(),
      value: null,
      missingReason: "survey_not_collected",
    });
    const input = {
      scope: tenant,
      knownAt: date,
      systemAt: date,
      population: simulated.population,
      jurisdiction: simulated.jurisdiction,
      measurements: [simulated],
    };
    expect(assembleBehavioralStateAsOf(input).dimensions[0]?.measurements).toHaveLength(0);
    expect(
      assembleBehavioralStateAsOf({ ...input, measurements: [missing] }).dimensions[0]
        ?.measurements[0]?.missingReason,
    ).toBe("survey_not_collected");
    expect(() => createBehavioralConstruct({ ...measurementInput(), value: null })).toThrow(
      /missingness/,
    );
  });
  it("materializes through the forecasting engine only after PIT validation and measured baseline improvement", () => {
    const input = {
      scope: tenant,
      knownAt: date,
      systemAt: date,
      measurement: createBehavioralConstruct(measurementInput()),
      validation: validation(),
      snapshotId: id(80),
      datasetSnapshotId: id(81),
      datasetSnapshotSha256: "d".repeat(64),
      materializerCodeSha256: "e".repeat(64),
    };
    const feature = materializeBehavioralForecastFeature(input).featureSnapshot.features[0];
    expect(feature?.valueAsKnown).toBe("42.5");
    expect(feature?.featureKey).toBe("behavioral.consumer_confidence");
    expect(() =>
      materializeBehavioralForecastFeature({
        ...input,
        validation: { ...validation(), augmentedLoss: "3" },
      }),
    ).toThrow(/improvement/);
    expect(() =>
      materializeBehavioralForecastFeature({
        ...input,
        validation: { ...validation(), calibrationThrough: validation().evaluationStartsAt },
      }),
    ).toThrow(/leak/);
    expect(() =>
      materializeBehavioralForecastFeature({
        ...input,
        validation: { ...validation(), definitionSha256: "f".repeat(64) },
      }),
    ).toThrow(/definition/);
    expect(() =>
      materializeBehavioralForecastFeature({ ...input, knownAt: "2024-01-31T23:59:59.999999999Z" }),
    ).toThrow(/leak/);
    expect(() =>
      materializeBehavioralForecastFeature({
        ...input,
        measurement: createBehavioralConstruct({
          ...measurementInput(),
          epistemicClass: "simulation",
        }),
      }),
    ).toThrow(/Simulation/);
    const missing = createBehavioralConstruct({
      ...measurementInput(),
      value: null,
      missingReason: "not_collected",
    });
    expect(
      materializeBehavioralForecastFeature({ ...input, measurement: missing }).featureSnapshot
        .features[0]?.missingReason,
    ).toBe("not_collected");
  });
  it("uses graph contracts while keeping evidence-backed pathways as proposed hypotheses", () => {
    const measure = createBehavioralConstruct(measurementInput());
    const node = behavioralConstructGraphNode(measure, measure.measurementId);
    expect(node.nodeType).toBe("economic_concept");
    expect(node.visibility).toBe("workspace");
    expect(() => behavioralConstructGraphNode(measure, id(99))).toThrow(/identity/);
    const input: RelationshipAssertionInput = {
      schemaVersion: 1,
      ...tenant,
      assertionId: id(90),
      subjectId: measure.measurementId,
      predicate: "affects",
      objectId: id(91),
      validTime: { from: measure.observedAt, until: null },
      systemTime: { from: date, until: null },
      discoveredAt: date,
      discoveryMethod: "manual",
      claimKind: "hypothesis",
      causalClassification: "hypothesized_causal_pathway",
      method: {
        name: "Explicit behavioral pathway hypothesis",
        version: "1.0.0",
        identificationStrategy: null,
        diagnosticEvidenceIds: [],
        limitations: ["No causal estimate"],
      },
      scope: {
        description: "Synthetic fixture only",
        population: measure.population,
        temporalFrom: measure.observedAt,
        temporalUntil: null,
        horizonDays: null,
      },
      assumptions: ["Hypothesized link only"],
      evidenceIds: [measure.evidence.studyId],
      ownerId: id(92),
      status: "proposed",
      effect: {
        direction: "unknown",
        strength: null,
        strengthUnit: null,
        strengthScale: "not_estimated",
        lagMinDays: 0,
        lagMaxDays: 0,
        lagDistribution: "not_estimated",
        confidence: "0",
        uncertaintyMethod: "Uncalibrated fixture",
        uncertainty: [{ kind: "data_measurement", description: "No empirical interpretation" }],
      },
      regimeDependence: ["unknown"],
      geographicScope: [id(93)],
      sources: { modelVersionId: null, expertPrincipalId: id(92), sourceVersionId: null },
      supersedesAssertionId: null,
    };
    expect(createBehavioralCausalHypothesis(input, measure).causalClassification).toBe(
      "hypothesized_causal_pathway",
    );
    expect(() =>
      createBehavioralCausalHypothesis(
        { ...input, scope: { ...input.scope, population: "other" } },
        measure,
      ),
    ).toThrow(/cannot claim/);
    expect(() =>
      createBehavioralCausalHypothesis(
        { ...input, effect: { ...input.effect, strength: "0.5" } },
        measure,
      ),
    ).toThrow(/cannot claim/);
    expect(() =>
      createBehavioralCausalHypothesis({ ...input, discoveredAt: "2023-01-01T00:00:00Z" }, measure),
    ).toThrow(/predates/);
    expect(() =>
      behavioralConstructGraphNode({ ...measure, ...integrity(measure), value: "90" }, id(95)),
    ).toThrow(/integrity/);
  });
});
