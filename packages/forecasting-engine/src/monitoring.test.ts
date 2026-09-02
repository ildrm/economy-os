import { describe, expect, it } from "vitest";
import {
  assertDriftSignalIntegrity,
  createDriftSignal,
  DRIFT_CATEGORIES,
  type DriftCategory,
  type DriftReviewInput,
  type DriftSignal,
  type DriftSignalInput,
  recommendDriftReview,
} from "./monitoring.js";

const id = (suffix: number) => `00000000-0000-8000-8000-${suffix.toString().padStart(12, "0")}`;
const A = "a".repeat(64);

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

function signalInput(
  suffix: number,
  category: DriftCategory,
  observedValue = "0.2",
  severity: DriftSignalInput["severity"] = "warning",
  breachDirection: DriftSignalInput["breachDirection"] = "above",
): DriftSignalInput {
  return {
    schemaVersion: 1,
    signalId: id(suffix),
    modelId: id(100),
    modelVersion: "1.0.0",
    category,
    metricKey: `${category}.drift_metric`,
    evaluationWindow: { start: "2025-01-01T00:00:00Z", end: "2025-02-01T00:00:00Z" },
    measuredAt: "2025-02-02T00:00:00Z",
    observedValue,
    threshold: "0.1",
    breachDirection,
    severity,
    supportingArtifactSha256: A,
    sampleSize: 1_000,
    limitations: ["Short monitoring windows can overstate transient changes."],
  };
}

function reviewInput(signals: readonly DriftSignal[]): DriftReviewInput {
  return {
    schemaVersion: 1,
    reviewId: id(200),
    createdAt: "2025-02-03T00:00:00Z",
    modelId: id(100),
    modelVersion: "1.0.0",
    signals,
    policy: {
      minimumCategoriesForRestriction: 2,
      minimumHighSignalsForRestriction: 2,
      criticalSignalRecommendsDisable: true,
    },
    reviewerRoleRequired: "model_risk_manager",
  };
}

describe("drift monitoring and governed recommendations", () => {
  it("emits all required drift categories with computed, immutable breach flags", () => {
    const signals = DRIFT_CATEGORIES.map((category, index) =>
      createDriftSignal(signalInput(index + 1, category)),
    );
    expect(signals.map((signal) => signal.category)).toEqual(DRIFT_CATEGORIES);
    expect(signals.every((signal) => signal.breached)).toBe(true);
    for (const signal of signals) assertDriftSignalIntegrity(signal);

    const below = createDriftSignal(signalInput(10, "input", "0.05", "info", "below"));
    expect(below.breached).toBe(true);
    const notBelow = createDriftSignal(signalInput(11, "input", "0.2", "info", "below"));
    expect(notBelow.breached).toBe(false);
  });

  it("never mutates lifecycle and escalates multi-category breaches for governed restriction", () => {
    const recommendation = recommendDriftReview(
      reviewInput([
        createDriftSignal(signalInput(1, "input")),
        createDriftSignal(signalInput(2, "calibration")),
      ]),
    );
    expect(recommendation).toMatchObject({
      recommendation: "restrict_pending_review",
      automaticLifecycleMutation: false,
      requiresGovernedReview: true,
      reviewerRoleRequired: "model_risk_manager",
    });
    expect(recommendation.breachedCategories).toEqual(["calibration", "input"]);
  });

  it("opens review for a single warning, continues without breach, and recommends disable for critical", () => {
    const warning = recommendDriftReview(
      reviewInput([createDriftSignal(signalInput(1, "feature"))]),
    );
    expect(warning.recommendation).toBe("open_review");

    const clear = recommendDriftReview(
      reviewInput([createDriftSignal(signalInput(2, "feature", "0.05"))]),
    );
    expect(clear.recommendation).toBe("continue_monitoring");

    const critical = recommendDriftReview(
      reviewInput([createDriftSignal(signalInput(3, "error", "0.2", "critical"))]),
    );
    expect(critical.recommendation).toBe("disable_pending_review");
  });

  it("can escalate repeated high breaches even in one category", () => {
    const recommendation = recommendDriftReview(
      reviewInput([
        createDriftSignal(signalInput(1, "output", "0.2", "high")),
        createDriftSignal(signalInput(2, "output", "0.3", "high")),
      ]),
    );
    expect(recommendation.recommendation).toBe("restrict_pending_review");
  });

  it.each([
    ["invalid chronology", { measuredAt: "2025-01-01T00:00:00Z" }],
    ["empty limitations", { limitations: [] }],
    ["zero samples", { sampleSize: 0 }],
    ["non-semantic model version", { modelVersion: "latest" }],
  ])("rejects drift signal with %s", (_label, override) => {
    expect(() => createDriftSignal({ ...signalInput(1, "input"), ...override })).toThrow(TypeError);
  });

  it("rejects tampering, duplicate signals, mixed model versions, and future evidence", () => {
    const original = createDriftSignal(signalInput(1, "input"));
    const tampered = mutable(original);
    tampered.breached = false;
    expect(() => assertDriftSignalIntegrity(tampered)).toThrow(/breach flag/);

    expect(() => recommendDriftReview(reviewInput([original, original]))).toThrow(/unique/);

    const otherModel = createDriftSignal({ ...signalInput(2, "input"), modelId: id(999) });
    expect(() => recommendDriftReview(reviewInput([otherModel]))).toThrow(/mix model versions/);

    const future = createDriftSignal({
      ...signalInput(3, "input"),
      measuredAt: "2025-03-01T00:00:00Z",
    });
    expect(() => recommendDriftReview(reviewInput([future]))).toThrow(/future signals/);
  });

  it("fails closed when no signals or proper separation-of-duties reviewer exists", () => {
    expect(() => recommendDriftReview(reviewInput([]))).toThrow(/needs monitoring signals/);
    const invalid = {
      ...reviewInput([createDriftSignal(signalInput(1, "input"))]),
      reviewerRoleRequired: "model_owner",
    };
    expect(() => recommendDriftReview(invalid as unknown as DriftReviewInput)).toThrow(
      /model risk manager/,
    );
  });
});
