import {
  createGraphNode,
  createRelationshipAssertion,
  type RelationshipAssertionInput,
} from "@economyos/causal-graph";
import {
  type FeatureValueSemantics,
  materializePointInTimeFeatures,
} from "@economyos/forecasting-engine";
import { type BehavioralStudy, createBehavioralStudy } from "./evidence.js";
import {
  type BehavioralScope,
  decimal,
  enumeration,
  hash,
  instant,
  integer,
  integrity,
  keys,
  sameScope,
  scope,
  seal,
  text,
  texts,
  uuid,
} from "./internals.js";

export const BEHAVIORAL_CONSTRUCTS = [
  "consumer_confidence",
  "investor_sentiment",
  "inflation_expectation_anchoring",
  "risk_perception",
  "ambiguity_perception",
  "attention_pressure",
  "financial_stress_perception",
  "narrative_prevalence",
  "herding_pressure",
  "trust",
  "institutional_confidence",
  "precautionary_orientation",
  "scarcity_pressure",
] as const;
export interface BehavioralConstructInput {
  readonly measurementId: string;
  readonly scope: BehavioralScope;
  readonly construct: (typeof BEHAVIORAL_CONSTRUCTS)[number];
  readonly population: string;
  readonly jurisdiction: string;
  readonly definitionSha256: string;
  readonly value: string | null;
  readonly missingReason: string | null;
  readonly unit: string;
  readonly valueSemantics: FeatureValueSemantics;
  readonly epistemicClass: "observed" | "derived" | "estimated" | "simulation";
  readonly observedAt: string;
  readonly availableAt: string;
  readonly recordedAt: string;
  readonly measurementMethod: string;
  readonly uncertainty: string;
  readonly evidence: BehavioralStudy;
}
export type BehavioralConstruct = BehavioralConstructInput & { readonly manifestSha256: string };
export function createBehavioralConstruct(input: BehavioralConstructInput): BehavioralConstruct {
  keys(input, [
    "measurementId",
    "scope",
    "construct",
    "population",
    "jurisdiction",
    "definitionSha256",
    "value",
    "missingReason",
    "unit",
    "valueSemantics",
    "epistemicClass",
    "observedAt",
    "availableAt",
    "recordedAt",
    "measurementMethod",
    "uncertainty",
    "evidence",
  ]);
  uuid(input.measurementId);
  scope(input.scope);
  hash(input.definitionSha256);
  enumeration(input.construct, BEHAVIORAL_CONSTRUCTS, "construct");
  enumeration(
    input.epistemicClass,
    ["observed", "derived", "estimated", "simulation"],
    "epistemicClass",
  );
  enumeration(
    input.valueSemantics,
    ["level", "change", "rate", "index", "binary"],
    "valueSemantics",
  );
  for (const value of [
    input.population,
    input.jurisdiction,
    input.unit,
    input.measurementMethod,
    input.uncertainty,
  ])
    text(value, "measurement context");
  if (input.value === null) {
    if (input.missingReason === null)
      throw new TypeError("Construct missingness requires explicit reason");
    text(input.missingReason, "missing reason");
  } else {
    decimal(input.value);
    if (input.missingReason !== null)
      throw new TypeError("Construct value and missing reason conflict");
  }
  createBehavioralStudy(integrity(input.evidence));
  sameScope(input.scope, input.evidence.scope);
  if (
    input.population !== input.evidence.population ||
    input.jurisdiction !== input.evidence.jurisdiction
  )
    throw new TypeError("Construct must preserve evidence population and jurisdiction");
  if (
    instant(input.observedAt) > instant(input.availableAt) ||
    instant(input.evidence.availableAt) > instant(input.availableAt) ||
    instant(input.availableAt) > instant(input.recordedAt) ||
    instant(input.evidence.recordedAt) > instant(input.recordedAt)
  )
    throw new TypeError("Construct cannot predate its evidence availability");
  return seal(input);
}
export function assembleBehavioralStateAsOf(input: {
  readonly scope: BehavioralScope;
  readonly knownAt: string;
  readonly systemAt: string;
  readonly population: string;
  readonly jurisdiction: string;
  readonly measurements: readonly BehavioralConstruct[];
}) {
  keys(input, ["scope", "knownAt", "systemAt", "population", "jurisdiction", "measurements"]);
  scope(input.scope);
  text(input.population, "population");
  text(input.jurisdiction, "jurisdiction");
  const knownAt = instant(input.knownAt);
  const systemAt = instant(input.systemAt);
  integer(input.measurements.length, 0, 10000);
  const ids = new Set<string>();
  for (const measure of input.measurements) {
    createBehavioralConstruct(integrity(measure));
    sameScope(input.scope, measure.scope);
    if (ids.has(measure.measurementId)) throw new TypeError("Duplicate construct measurement");
    ids.add(measure.measurementId);
  }
  const visible = input.measurements.filter(
    (measure) =>
      measure.population === input.population &&
      measure.jurisdiction === input.jurisdiction &&
      instant(measure.availableAt) <= knownAt &&
      instant(measure.recordedAt) <= systemAt &&
      measure.epistemicClass !== "simulation",
  );
  return seal({
    scope: input.scope,
    knownAt: input.knownAt,
    systemAt: input.systemAt,
    population: input.population,
    jurisdiction: input.jurisdiction,
    dimensions: BEHAVIORAL_CONSTRUCTS.map((construct) => {
      const measurements = visible
        .filter((measure) => measure.construct === construct)
        .sort((a, b) =>
          instant(a.availableAt) > instant(b.availableAt)
            ? -1
            : instant(a.availableAt) < instant(b.availableAt)
              ? 1
              : a.measurementId < b.measurementId
                ? -1
                : 1,
        );
      const definitions = new Set(measurements.map((measurement) => measurement.definitionSha256));
      const valuesByDefinitionAndInstant = new Map<string, string | null>();
      let sourceDisagreement = false;
      for (const measurement of measurements) {
        const group = `${measurement.definitionSha256}:${instant(measurement.observedAt)}`;
        if (valuesByDefinitionAndInstant.has(group)) {
          if (valuesByDefinitionAndInstant.get(group) !== measurement.value) {
            sourceDisagreement = true;
            break;
          }
        } else {
          valuesByDefinitionAndInstant.set(group, measurement.value);
        }
      }
      // Incompatible measurement definitions remain separate instead of selecting a single apparent truth.
      return {
        construct,
        measurements,
        missingReason: measurements.length ? null : "no_measurement_known_at_cutoff",
        definitionDisagreement: definitions.size > 1,
        revisionPolicy: "all_available_measurements_no_silent_source_resolution",
        sourceDisagreement,
      };
    }),
    overallScore: null,
    interpretation:
      "Independent constructs; no universal behavioral score and no missing-as-neutral values.",
  });
}
export interface BehavioralPredictiveValidation {
  readonly definitionSha256: string;
  readonly population: string;
  readonly jurisdiction: string;
  readonly reviewerId: string;
  readonly reviewedAt: string;
  readonly recordedAt: string;
  readonly calibrationThrough: string;
  readonly evaluationStartsAt: string;
  readonly evaluationEndsAt: string;
  readonly pairedEvaluationSha256: string;
  readonly leakageAuditSha256: string;
  readonly metric: "mean_squared_error";
  readonly baselineLoss: string;
  readonly augmentedLoss: string;
  readonly sampleCount: number;
  readonly limitations: readonly string[];
}
/** Route a temporally reviewed behavioral measurement through the existing PIT feature materializer. */
export function materializeBehavioralForecastFeature(input: {
  readonly measurement: BehavioralConstruct;
  readonly validation: BehavioralPredictiveValidation;
  readonly scope: BehavioralScope;
  readonly knownAt: string;
  readonly systemAt: string;
  readonly snapshotId: string;
  readonly datasetSnapshotId: string;
  readonly datasetSnapshotSha256: string;
  readonly materializerCodeSha256: string;
}) {
  keys(input, [
    "measurement",
    "validation",
    "scope",
    "knownAt",
    "systemAt",
    "snapshotId",
    "datasetSnapshotId",
    "datasetSnapshotSha256",
    "materializerCodeSha256",
  ]);
  const measurement = createBehavioralConstruct(integrity(input.measurement));
  sameScope(input.scope, measurement.scope);
  const validation = input.validation;
  keys(validation, [
    "definitionSha256",
    "population",
    "jurisdiction",
    "reviewerId",
    "reviewedAt",
    "recordedAt",
    "calibrationThrough",
    "evaluationStartsAt",
    "evaluationEndsAt",
    "pairedEvaluationSha256",
    "leakageAuditSha256",
    "metric",
    "baselineLoss",
    "augmentedLoss",
    "sampleCount",
    "limitations",
  ]);
  if (measurement.epistemicClass === "simulation")
    throw new TypeError("Simulation output cannot enter observed forecasting features");
  if (
    validation.definitionSha256 !== measurement.definitionSha256 ||
    validation.population !== measurement.population ||
    validation.jurisdiction !== measurement.jurisdiction
  )
    throw new TypeError("Forecast validation must bind exact construct definition and context");
  uuid(validation.reviewerId);
  hash(validation.pairedEvaluationSha256);
  hash(validation.leakageAuditSha256);
  texts(validation.limitations, "validation limitations");
  integer(validation.sampleCount, 2, 1e9);
  if (
    validation.metric !== "mean_squared_error" ||
    decimal(validation.baselineLoss, 0) <= decimal(validation.augmentedLoss, 0)
  )
    throw new TypeError(
      "Feature requires measured improvement against matched nonbehavioral baseline",
    );
  if (
    instant(validation.calibrationThrough) >= instant(validation.evaluationStartsAt) ||
    instant(validation.evaluationStartsAt) > instant(validation.evaluationEndsAt) ||
    instant(validation.evaluationEndsAt) > instant(validation.reviewedAt) ||
    instant(validation.reviewedAt) > instant(input.knownAt) ||
    instant(validation.reviewedAt) > instant(validation.recordedAt) ||
    instant(validation.recordedAt) > instant(input.systemAt) ||
    instant(measurement.recordedAt) > instant(input.systemAt)
  )
    throw new TypeError("Forecast validation/replay chronology would leak future information");
  const feature = materializePointInTimeFeatures({
    schemaVersion: 1,
    snapshotId: input.snapshotId,
    geographyKey: measurement.jurisdiction,
    asOf: input.knownAt,
    materializedAt: input.systemAt,
    datasetSnapshotId: input.datasetSnapshotId,
    datasetSnapshotSha256: input.datasetSnapshotSha256,
    featureDefinitionSha256: measurement.definitionSha256,
    materializerCodeSha256: input.materializerCodeSha256,
    transformationFitThrough: validation.calibrationThrough,
    selectionPolicy: "latest_available_then_latest_observed_then_observation_id",
    definitions: [
      {
        featureKey: `behavioral.${measurement.construct}`,
        unit: measurement.unit,
        valueSemantics: measurement.valueSemantics,
      },
    ],
    observations: [
      {
        observationId: measurement.measurementId,
        featureKey: `behavioral.${measurement.construct}`,
        value: measurement.value,
        missingReason: measurement.missingReason,
        observedAt: measurement.observedAt,
        availableAt: measurement.availableAt,
        vintageId: measurement.measurementId,
        vintageSha256: measurement.manifestSha256,
        observationSha256: measurement.manifestSha256,
      },
    ],
  });
  return seal({
    scope: input.scope,
    featureSnapshot: feature,
    validation,
    measurementSha256: measurement.manifestSha256,
    interpretation:
      "Incremental held-out prediction evidence does not establish causality or universal transportability.",
  });
}
/** Use the graph's existing economic_concept ontology rather than silently adding incompatible node enums. */
export function behavioralConstructGraphNode(measurement: BehavioralConstruct, nodeId: string) {
  createBehavioralConstruct(integrity(measurement));
  if (nodeId !== measurement.measurementId)
    throw new TypeError("Behavioral graph node must bind its measurement identity");
  return createGraphNode({
    schemaVersion: 1,
    ...measurement.scope,
    nodeId,
    nodeType: "economic_concept",
    canonicalLabel: `behavioral.${measurement.construct}`,
    ontologyVersion: "1.0.0",
    validTime: { from: measurement.observedAt, until: null },
    systemTime: { from: measurement.recordedAt, until: null },
    discoveredAt: measurement.recordedAt,
    resolutionStatus: "resolved",
    visibility: "workspace",
  });
}
/** The caller supplies direction, lags, uncertainty and evidence; the bridge cannot promote a hypothesis to a causal result. */
export function createBehavioralCausalHypothesis(
  input: RelationshipAssertionInput,
  measurement: BehavioralConstruct,
) {
  createBehavioralConstruct(integrity(measurement));
  sameScope(input, measurement.scope);
  if (
    input.subjectId !== measurement.measurementId ||
    input.scope.population !== measurement.population ||
    input.claimKind !== "hypothesis" ||
    input.causalClassification !== "hypothesized_causal_pathway" ||
    input.effect.strength !== null ||
    input.effect.strengthUnit !== null ||
    !input.evidenceIds.includes(measurement.evidence.studyId)
  )
    throw new TypeError(
      "Behavioral hypothesis must bind its measurement/evidence and cannot claim estimated causal strength",
    );
  if (instant(input.discoveredAt) < instant(measurement.recordedAt))
    throw new TypeError("Hypothesis predates measurement evidence");
  return createRelationshipAssertion(input);
}
