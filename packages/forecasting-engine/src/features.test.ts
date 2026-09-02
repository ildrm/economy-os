import { describe, expect, it } from "vitest";
import {
  assertPointInTimeFeatureSnapshotIntegrity,
  materializePointInTimeFeatures,
  type PointInTimeFeatureSnapshotInput,
} from "./features.js";

const U1 = "00000000-0000-8000-8000-000000000001";
const U2 = "00000000-0000-8000-8000-000000000002";
const U3 = "00000000-0000-8000-8000-000000000003";
const U4 = "00000000-0000-8000-8000-000000000004";
const U5 = "00000000-0000-8000-8000-000000000005";
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[K] extends object
      ? Mutable<T[K]>
      : T[K];
};

function mutable<T>(value: T): Mutable<T> {
  return structuredClone(value) as Mutable<T>;
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("fixture value is missing");
  return value;
}

function featureInput(): PointInTimeFeatureSnapshotInput {
  return {
    schemaVersion: 1,
    snapshotId: U1,
    geographyKey: "irn",
    asOf: "2025-01-10T00:00:00Z",
    materializedAt: "2025-01-10T01:00:00Z",
    datasetSnapshotId: U2,
    datasetSnapshotSha256: A,
    featureDefinitionSha256: B,
    materializerCodeSha256: C,
    transformationFitThrough: "2025-01-01T00:00:00Z",
    selectionPolicy: "latest_available_then_latest_observed_then_observation_id",
    definitions: [
      { featureKey: "inflation.rate", unit: "percent", valueSemantics: "rate" },
      { featureKey: "fx.index", unit: "index", valueSemantics: "index" },
      { featureKey: "output.gap", unit: "percent", valueSemantics: "change" },
    ],
    observations: [
      {
        observationId: U3,
        featureKey: "inflation.rate",
        value: "12.5",
        missingReason: null,
        observedAt: "2024-12-31T00:00:00Z",
        availableAt: "2025-01-02T00:00:00Z",
        vintageId: U4,
        vintageSha256: A,
        observationSha256: B,
      },
      {
        observationId: U4,
        featureKey: "inflation.rate",
        value: "13.1",
        missingReason: null,
        observedAt: "2025-01-05T00:00:00Z",
        availableAt: "2025-01-08T00:00:00Z",
        vintageId: U5,
        vintageSha256: B,
        observationSha256: C,
      },
      {
        observationId: U5,
        featureKey: "inflation.rate",
        value: "99",
        missingReason: null,
        observedAt: "2025-01-09T00:00:00Z",
        availableAt: "2025-01-11T00:00:00Z",
        vintageId: U5,
        vintageSha256: C,
        observationSha256: A,
      },
      {
        observationId: "00000000-0000-8000-8000-000000000006",
        featureKey: "fx.index",
        value: null,
        missingReason: "source did not publish this vintage",
        observedAt: "2025-01-01T00:00:00Z",
        availableAt: "2025-01-03T00:00:00Z",
        vintageId: U5,
        vintageSha256: C,
        observationSha256: A,
      },
    ],
  };
}

describe("point-in-time feature materialization", () => {
  it("selects only the latest vintage known at cutoff and records explicit missingness", () => {
    const snapshot = materializePointInTimeFeatures(featureInput());

    expect(snapshot.features.map((feature) => feature.featureKey)).toEqual([
      "fx.index",
      "inflation.rate",
      "output.gap",
    ]);
    expect(snapshot.features[1]?.valueAsKnown).toBe("13.1");
    expect(snapshot.features[1]?.availableAt).toBe("2025-01-08T00:00:00Z");
    expect(snapshot.features[0]?.missingReason).toBe("source did not publish this vintage");
    expect(snapshot.features[2]).toMatchObject({
      valueAsKnown: null,
      missingReason: "no_vintage_known_at_cutoff",
      selectedObservationId: null,
      vintageSha256: null,
    });
    expect(snapshot.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(snapshot.features)).toBe(true);
    assertPointInTimeFeatureSnapshotIntegrity(snapshot);
  });

  it("uses deterministic tie breaking for equally timed observations", () => {
    const input = featureInput();
    const original = input.observations[0];
    if (!original) throw new Error("fixture missing");
    const tied = {
      ...original,
      observationId: "00000000-0000-8000-8000-000000000000",
      value: "11",
    };
    const snapshot = materializePointInTimeFeatures({
      ...input,
      observations: [tied, ...input.observations],
      asOf: "2025-01-02T00:00:00Z",
    });
    expect(
      snapshot.features.find((feature) => feature.featureKey === "inflation.rate")?.valueAsKnown,
    ).toBe("11");
  });

  it.each([
    [
      "future transformation fit",
      (input: PointInTimeFeatureSnapshotInput) => ({
        ...input,
        transformationFitThrough: "2025-02-01T00:00:00Z",
      }),
    ],
    [
      "materialized before cutoff",
      (input: PointInTimeFeatureSnapshotInput) => ({
        ...input,
        materializedAt: "2025-01-01T00:00:00Z",
      }),
    ],
    [
      "empty definitions",
      (input: PointInTimeFeatureSnapshotInput) => ({ ...input, definitions: [] }),
    ],
    [
      "duplicate definition",
      (input: PointInTimeFeatureSnapshotInput) => ({
        ...input,
        definitions: [...input.definitions, required(input.definitions[0])],
      }),
    ],
    [
      "duplicate observation",
      (input: PointInTimeFeatureSnapshotInput) => ({
        ...input,
        observations: [...input.observations, required(input.observations[0])],
      }),
    ],
    [
      "unknown feature",
      (input: PointInTimeFeatureSnapshotInput) => ({
        ...input,
        observations: [{ ...required(input.observations[0]), featureKey: "unknown.feature" }],
      }),
    ],
    [
      "available before observed",
      (input: PointInTimeFeatureSnapshotInput) => ({
        ...input,
        observations: [{ ...required(input.observations[0]), availableAt: "2024-01-01T00:00:00Z" }],
      }),
    ],
    [
      "value and missingness",
      (input: PointInTimeFeatureSnapshotInput) => ({
        ...input,
        observations: [{ ...required(input.observations[0]), missingReason: "also missing" }],
      }),
    ],
    [
      "no value explanation",
      (input: PointInTimeFeatureSnapshotInput) => ({
        ...input,
        observations: [{ ...required(input.observations[0]), value: null, missingReason: null }],
      }),
    ],
  ])("rejects %s", (_label, mutate) => {
    expect(() => materializePointInTimeFeatures(mutate(featureInput()))).toThrow(TypeError);
  });

  it("detects tampered immutable content and malformed restored provenance", () => {
    const snapshot = materializePointInTimeFeatures(featureInput());
    const tampered = mutable(snapshot);
    required(tampered.features[1]).valueAsKnown = "17";
    expect(() => assertPointInTimeFeatureSnapshotIntegrity(tampered)).toThrow(/digest/);

    const malformed = mutable(snapshot);
    required(malformed.features[2]).availableAt = "2025-01-01T00:00:00Z";
    expect(() => assertPointInTimeFeatureSnapshotIntegrity(malformed)).toThrow(/inconsistent/);
  });
});
