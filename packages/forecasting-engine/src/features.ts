import {
  assertDecimal,
  assertEnum,
  assertExactKeys,
  assertIsoInstant,
  assertKey,
  assertOrdered,
  assertSha256,
  assertText,
  assertUniqueKeys,
  assertUuid,
  cloneCanonical,
  compareInstant,
  deepFreeze,
  digestJson,
} from "./internals.js";

export const FEATURE_VALUE_SEMANTICS = ["level", "change", "rate", "index", "binary"] as const;
export type FeatureValueSemantics = (typeof FEATURE_VALUE_SEMANTICS)[number];

export interface PointInTimeFeatureDefinition {
  readonly featureKey: string;
  readonly unit: string;
  readonly valueSemantics: FeatureValueSemantics;
}

export interface FeatureObservation {
  readonly observationId: string;
  readonly featureKey: string;
  readonly value: string | null;
  readonly missingReason: string | null;
  readonly observedAt: string;
  readonly availableAt: string;
  readonly vintageId: string;
  readonly vintageSha256: string;
  readonly observationSha256: string;
}

export interface MaterializedFeature {
  readonly featureKey: string;
  readonly unit: string;
  readonly valueSemantics: FeatureValueSemantics;
  readonly valueAsKnown: string | null;
  readonly missingReason: string | null;
  readonly selectedObservationId: string | null;
  readonly observedAt: string | null;
  readonly availableAt: string | null;
  readonly vintageId: string | null;
  readonly vintageSha256: string | null;
  readonly observationSha256: string | null;
}

export interface PointInTimeFeatureSnapshotInput {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly geographyKey: string;
  readonly asOf: string;
  readonly materializedAt: string;
  readonly datasetSnapshotId: string;
  readonly datasetSnapshotSha256: string;
  readonly featureDefinitionSha256: string;
  readonly materializerCodeSha256: string;
  readonly transformationFitThrough: string;
  readonly selectionPolicy: "latest_available_then_latest_observed_then_observation_id";
  readonly definitions: readonly PointInTimeFeatureDefinition[];
  readonly observations: readonly FeatureObservation[];
}

export interface PointInTimeFeatureSnapshot {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly geographyKey: string;
  readonly asOf: string;
  readonly materializedAt: string;
  readonly datasetSnapshotId: string;
  readonly datasetSnapshotSha256: string;
  readonly featureDefinitionSha256: string;
  readonly materializerCodeSha256: string;
  readonly transformationFitThrough: string;
  readonly selectionPolicy: "latest_available_then_latest_observed_then_observation_id";
  readonly features: readonly MaterializedFeature[];
  readonly manifestSha256: string;
}

function assertDefinition(definition: PointInTimeFeatureDefinition, field: string): void {
  assertExactKeys(definition, ["featureKey", "unit", "valueSemantics"], field);
  assertKey(definition.featureKey, `${field}.featureKey`);
  assertText(definition.unit, `${field}.unit`, 80);
  assertEnum(definition.valueSemantics, FEATURE_VALUE_SEMANTICS, `${field}.valueSemantics`);
}

function assertObservation(observation: FeatureObservation, field: string): void {
  assertExactKeys(
    observation,
    [
      "observationId",
      "featureKey",
      "value",
      "missingReason",
      "observedAt",
      "availableAt",
      "vintageId",
      "vintageSha256",
      "observationSha256",
    ],
    field,
  );
  assertUuid(observation.observationId, `${field}.observationId`);
  assertKey(observation.featureKey, `${field}.featureKey`);
  if (observation.value === null) {
    if (observation.missingReason === null) {
      throw new TypeError(`${field} needs a value or an explicit missing reason`);
    }
    assertText(observation.missingReason, `${field}.missingReason`, 500);
  } else {
    assertDecimal(observation.value, `${field}.value`);
    if (observation.missingReason !== null) {
      throw new TypeError(`${field}.missingReason must be null when a value exists`);
    }
  }
  assertIsoInstant(observation.observedAt, `${field}.observedAt`);
  assertIsoInstant(observation.availableAt, `${field}.availableAt`);
  if (compareInstant(observation.availableAt, observation.observedAt) < 0) {
    throw new TypeError(`${field} cannot be available before it was observed`);
  }
  assertUuid(observation.vintageId, `${field}.vintageId`);
  assertSha256(observation.vintageSha256, `${field}.vintageSha256`);
  assertSha256(observation.observationSha256, `${field}.observationSha256`);
}

function compareObservationRecency(left: FeatureObservation, right: FeatureObservation): number {
  const availability = compareInstant(right.availableAt, left.availableAt);
  if (availability !== 0) return availability;
  const observation = compareInstant(right.observedAt, left.observedAt);
  if (observation !== 0) return observation;
  return left.observationId.localeCompare(right.observationId);
}

function selectedFeature(
  definition: PointInTimeFeatureDefinition,
  observations: readonly FeatureObservation[],
  asOf: string,
): MaterializedFeature {
  const candidates = observations
    .filter(
      (observation) =>
        observation.featureKey === definition.featureKey &&
        compareInstant(observation.availableAt, asOf) <= 0,
    )
    .sort(compareObservationRecency);
  const selected = candidates[0];
  if (!selected) {
    return {
      ...definition,
      valueAsKnown: null,
      missingReason: "no_vintage_known_at_cutoff",
      selectedObservationId: null,
      observedAt: null,
      availableAt: null,
      vintageId: null,
      vintageSha256: null,
      observationSha256: null,
    };
  }
  return {
    ...definition,
    valueAsKnown: selected.value,
    missingReason: selected.missingReason,
    selectedObservationId: selected.observationId,
    observedAt: selected.observedAt,
    availableAt: selected.availableAt,
    vintageId: selected.vintageId,
    vintageSha256: selected.vintageSha256,
    observationSha256: selected.observationSha256,
  };
}

function validateSnapshotHeader(input: PointInTimeFeatureSnapshotInput): void {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "snapshotId",
      "geographyKey",
      "asOf",
      "materializedAt",
      "datasetSnapshotId",
      "datasetSnapshotSha256",
      "featureDefinitionSha256",
      "materializerCodeSha256",
      "transformationFitThrough",
      "selectionPolicy",
      "definitions",
      "observations",
    ],
    "featureMaterialization",
  );
  if (input.schemaVersion !== 1) throw new TypeError("feature snapshot schemaVersion must be 1");
  assertUuid(input.snapshotId, "featureMaterialization.snapshotId");
  assertKey(input.geographyKey, "featureMaterialization.geographyKey");
  assertIsoInstant(input.asOf, "featureMaterialization.asOf");
  assertIsoInstant(input.materializedAt, "featureMaterialization.materializedAt");
  if (compareInstant(input.materializedAt, input.asOf) < 0) {
    throw new TypeError("feature snapshot cannot be materialized before its as-of cutoff");
  }
  assertUuid(input.datasetSnapshotId, "featureMaterialization.datasetSnapshotId");
  assertSha256(input.datasetSnapshotSha256, "featureMaterialization.datasetSnapshotSha256");
  assertSha256(input.featureDefinitionSha256, "featureMaterialization.featureDefinitionSha256");
  assertSha256(input.materializerCodeSha256, "featureMaterialization.materializerCodeSha256");
  assertIsoInstant(
    input.transformationFitThrough,
    "featureMaterialization.transformationFitThrough",
  );
  if (compareInstant(input.transformationFitThrough, input.asOf) > 0) {
    throw new TypeError("feature transformation fitting cannot see beyond the as-of cutoff");
  }
  if (input.selectionPolicy !== "latest_available_then_latest_observed_then_observation_id") {
    throw new TypeError("feature selection policy must be deterministic and point-in-time safe");
  }
}

export function materializePointInTimeFeatures(
  input: PointInTimeFeatureSnapshotInput,
): Readonly<PointInTimeFeatureSnapshot> {
  validateSnapshotHeader(input);
  if (input.definitions.length === 0) throw new TypeError("feature definitions must not be empty");
  for (const [index, definition] of input.definitions.entries()) {
    assertDefinition(definition, `definitions[${index}]`);
  }
  assertUniqueKeys(
    input.definitions.map((definition) => definition.featureKey),
    "definition feature keys",
  );
  const observationIds = new Set<string>();
  const definitionKeys = new Set(input.definitions.map((definition) => definition.featureKey));
  for (const [index, observation] of input.observations.entries()) {
    assertObservation(observation, `observations[${index}]`);
    if (observationIds.has(observation.observationId)) {
      throw new TypeError("feature observationId must be unique");
    }
    observationIds.add(observation.observationId);
    if (!definitionKeys.has(observation.featureKey)) {
      throw new TypeError("observation references an undeclared feature");
    }
  }
  const definitions = [...input.definitions].sort((left, right) =>
    left.featureKey.localeCompare(right.featureKey),
  );
  const features = definitions.map((definition) =>
    selectedFeature(definition, input.observations, input.asOf),
  );
  const body = cloneCanonical({
    schemaVersion: input.schemaVersion,
    snapshotId: input.snapshotId,
    geographyKey: input.geographyKey,
    asOf: input.asOf,
    materializedAt: input.materializedAt,
    datasetSnapshotId: input.datasetSnapshotId,
    datasetSnapshotSha256: input.datasetSnapshotSha256,
    featureDefinitionSha256: input.featureDefinitionSha256,
    materializerCodeSha256: input.materializerCodeSha256,
    transformationFitThrough: input.transformationFitThrough,
    selectionPolicy: input.selectionPolicy,
    features,
  });
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

function assertMaterializedFeature(
  feature: MaterializedFeature,
  field: string,
  asOf: string,
): void {
  assertExactKeys(
    feature,
    [
      "featureKey",
      "unit",
      "valueSemantics",
      "valueAsKnown",
      "missingReason",
      "selectedObservationId",
      "observedAt",
      "availableAt",
      "vintageId",
      "vintageSha256",
      "observationSha256",
    ],
    field,
  );
  assertDefinition(
    {
      featureKey: feature.featureKey,
      unit: feature.unit,
      valueSemantics: feature.valueSemantics,
    },
    field,
  );
  if (feature.selectedObservationId === null) {
    if (
      feature.valueAsKnown !== null ||
      feature.missingReason !== "no_vintage_known_at_cutoff" ||
      feature.observedAt !== null ||
      feature.availableAt !== null ||
      feature.vintageId !== null ||
      feature.vintageSha256 !== null ||
      feature.observationSha256 !== null
    ) {
      throw new TypeError(`${field} has an inconsistent absent-vintage representation`);
    }
    return;
  }
  assertUuid(feature.selectedObservationId, `${field}.selectedObservationId`);
  if (feature.valueAsKnown === null) {
    if (feature.missingReason === null) throw new TypeError(`${field} needs a missing reason`);
    assertText(feature.missingReason, `${field}.missingReason`, 500);
  } else {
    assertDecimal(feature.valueAsKnown, `${field}.valueAsKnown`);
    if (feature.missingReason !== null)
      throw new TypeError(`${field} cannot mix value and missingness`);
  }
  if (
    feature.observedAt === null ||
    feature.availableAt === null ||
    feature.vintageId === null ||
    feature.vintageSha256 === null ||
    feature.observationSha256 === null
  ) {
    throw new TypeError(`${field} selected vintage provenance is incomplete`);
  }
  assertIsoInstant(feature.observedAt, `${field}.observedAt`);
  assertIsoInstant(feature.availableAt, `${field}.availableAt`);
  if (
    compareInstant(feature.availableAt, feature.observedAt) < 0 ||
    compareInstant(feature.availableAt, asOf) > 0
  ) {
    throw new TypeError(`${field} violates known-at chronology`);
  }
  assertUuid(feature.vintageId, `${field}.vintageId`);
  assertSha256(feature.vintageSha256, `${field}.vintageSha256`);
  assertSha256(feature.observationSha256, `${field}.observationSha256`);
}

export function assertPointInTimeFeatureSnapshotIntegrity(
  snapshot: PointInTimeFeatureSnapshot,
): void {
  assertExactKeys(
    snapshot,
    [
      "schemaVersion",
      "snapshotId",
      "geographyKey",
      "asOf",
      "materializedAt",
      "datasetSnapshotId",
      "datasetSnapshotSha256",
      "featureDefinitionSha256",
      "materializerCodeSha256",
      "transformationFitThrough",
      "selectionPolicy",
      "features",
      "manifestSha256",
    ],
    "featureSnapshot",
  );
  assertSha256(snapshot.manifestSha256, "featureSnapshot.manifestSha256");
  validateSnapshotHeader({
    schemaVersion: snapshot.schemaVersion,
    snapshotId: snapshot.snapshotId,
    geographyKey: snapshot.geographyKey,
    asOf: snapshot.asOf,
    materializedAt: snapshot.materializedAt,
    datasetSnapshotId: snapshot.datasetSnapshotId,
    datasetSnapshotSha256: snapshot.datasetSnapshotSha256,
    featureDefinitionSha256: snapshot.featureDefinitionSha256,
    materializerCodeSha256: snapshot.materializerCodeSha256,
    transformationFitThrough: snapshot.transformationFitThrough,
    selectionPolicy: snapshot.selectionPolicy,
    definitions: snapshot.features.map(({ featureKey, unit, valueSemantics }) => ({
      featureKey,
      unit,
      valueSemantics,
    })),
    observations: [],
  });
  if (snapshot.features.length === 0) throw new TypeError("feature snapshot must not be empty");
  for (const [index, feature] of snapshot.features.entries()) {
    assertMaterializedFeature(feature, `features[${index}]`, snapshot.asOf);
  }
  const keys = snapshot.features.map((feature) => feature.featureKey);
  assertUniqueKeys(keys, "feature keys");
  assertOrdered(keys, "feature keys");
  const { manifestSha256, ...body } = snapshot;
  if (digestJson(body) !== manifestSha256) {
    throw new TypeError("feature snapshot digest does not match immutable content");
  }
}
