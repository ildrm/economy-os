import { describe, expect, it, vi } from "vitest";
import {
  ASSET_CLASSES,
  type AssetAssessmentInput,
  type AssetClass,
  assertCapitalAllocationManifestIntegrity,
  assertCountryComparisonIntegrity,
  assertOutcomeDefinitionIntegrity,
  assertTemporalValidationPlanIntegrity,
  type CapitalAllocationManifest,
  type CapitalAllocationManifestInput,
  type CountryIdentity,
  createCapitalAllocationManifest,
  createCountryComparison,
  createOutcomeDefinition,
  createTemporalValidationPlan,
  DECISION_INPUT_DIMENSIONS,
  EXACT_COMPARISON_POLICY,
  MAX_COMPARISON_COUNTRIES,
  type OutcomeDefinition,
  type OutcomeDefinitionInput,
  RESEARCH_ONLY_SEMANTICS,
  type TemporalValidationFold,
  type TemporalValidationPlan,
  type TemporalValidationPlanInput,
} from "./index.js";

const IDS = {
  manifest: "00000000-0000-8000-8000-000000000001",
  model: "00000000-0000-8000-8000-000000000002",
  countryUs: "00000000-0000-8000-8000-000000000003",
  countryDe: "00000000-0000-8000-8000-000000000004",
  countryGb: "00000000-0000-8000-8000-000000000005",
  snapshot: "00000000-0000-8000-8000-000000000006",
  vintage: "00000000-0000-8000-8000-000000000007",
  evidence: "00000000-0000-8000-8000-000000000008",
  counterEvidence: "00000000-0000-8000-8000-000000000009",
  outcome: "00000000-0000-8000-8000-000000000010",
  plan: "00000000-0000-8000-8000-000000000011",
  comparison: "00000000-0000-8000-8000-000000000012",
} as const;

const SHA = {
  snapshot: "a".repeat(64),
  vintage: "b".repeat(64),
  model: "c".repeat(64),
} as const;

function copy<T>(value: T): T {
  return structuredClone(value);
}

function required<T>(value: T | undefined, field = "fixture value"): T {
  if (value === undefined) throw new Error(`${field} is missing`);
  return value;
}

function makeAsset(
  assetClass: AssetClass = "gold",
  valuationAvailable = true,
): AssetAssessmentInput {
  const decisionInputs = DECISION_INPUT_DIMENSIONS.map((dimension) => ({
    dimension,
    value: "0.4",
    uncertainty: "0.2",
    evidenceIds: [IDS.evidence],
    rationale: `${dimension.replaceAll("_", " ")} is an explicit research input.`,
  }));
  const macroWeights = DECISION_INPUT_DIMENSIONS.map((dimension, index) => ({
    dimension,
    weight: index === DECISION_INPUT_DIMENSIONS.length - 1 ? "0.2" : "0.1",
  }));
  return {
    assetClass,
    decisionInputs,
    macroWeights,
    macroUncertainty: {
      lower: "0.1",
      upper: "0.7",
      confidenceLevel: "0.8",
      method: "bounded component review",
    },
    valuationSuitability: valuationAvailable
      ? {
          status: "available",
          components: [
            {
              componentKey: "real_yield_signal",
              signal: "0.2",
              weight: "1",
              evidenceIds: [IDS.evidence],
              rationale: "The declared real-yield signal supports this research estimate.",
            },
          ],
          uncertainty: {
            lower: "-0.2",
            upper: "0.6",
            confidenceLevel: "0.7",
            method: "bounded valuation review",
          },
        }
      : {
          status: "unavailable",
          reasonCode: "missing_data",
          explanation: "No point-in-time valuation observation is available.",
        },
    combinationPolicy: {
      method: "weighted_linear",
      macroWeight: "0.6",
      valuationWeight: "0.4",
    },
    evidence: {
      items: [
        {
          evidenceId: IDS.evidence,
          kind: "observation",
          sourceKey: "governed.market.series",
          summary: "A governed market observation available before the declared cutoff.",
          observedAt: "2025-01-01T00:00:00Z",
          availableAt: "2025-01-02T00:00:00Z",
          maximumAgeDays: 20,
          snapshotId: IDS.snapshot,
          snapshotSha256: SHA.snapshot,
          dataVintageId: IDS.vintage,
          dataVintageSha256: SHA.vintage,
        },
      ],
      absenceReason: null,
    },
    counterEvidence: {
      items: [],
      absenceReason: "No governed counter-evidence was available at the declared cutoff.",
    },
    assumptions: ["Market access remains observable during the research horizon."],
    limitations: ["This candidate method has not been empirically validated."],
    invalidationCriteria: [
      {
        criterionId: "market_data_missing",
        description: "The input becomes unavailable under the declared point-in-time policy.",
        indicatorKey: "governed.market.series",
        operator: "becomes_unavailable",
        threshold: "unavailable",
      },
    ],
    presentationParameters: valuationAvailable
      ? {
          method: "linear_confidence_shrinkage",
          target: "0",
          confidenceWeight: "0.5",
        }
      : null,
  };
}

interface ManifestOptions {
  readonly manifestId?: string;
  readonly country?: CountryIdentity;
  readonly countryScope?: readonly string[];
  readonly strategyKey?: string;
  readonly strategyScope?: readonly string[];
  readonly assetClass?: AssetClass;
  readonly valuationAvailable?: boolean;
  readonly asOf?: string;
  readonly knowledgeCutoff?: string;
  readonly systemCutoff?: string;
  readonly modelArtifactSha256?: string;
}

function makeManifestInput(options: ManifestOptions = {}): CapitalAllocationManifestInput {
  const country = options.country ?? { countryId: IDS.countryUs, countryCode: "US" };
  const asOf = options.asOf ?? "2025-01-31T00:00:00Z";
  return {
    schemaVersion: 1,
    manifestId: options.manifestId ?? IDS.manifest,
    semantics: RESEARCH_ONLY_SEMANTICS,
    pointInTime: {
      policy: "strict_system_and_knowledge_cutoff",
      asOf,
      knowledgeCutoff: options.knowledgeCutoff ?? "2025-01-30T00:00:00Z",
      systemCutoff: options.systemCutoff ?? "2025-01-30T12:00:00Z",
      snapshotId: IDS.snapshot,
      snapshotSha256: SHA.snapshot,
      snapshotRecordedAt: "2025-01-29T00:00:00Z",
      dataVintageId: IDS.vintage,
      dataVintageSha256: SHA.vintage,
      dataVintageAvailableAt: "2025-01-02T00:00:00Z",
    },
    model: {
      kind: "candidate_model",
      modelId: IDS.model,
      version: "1.0.0",
      artifactSha256: options.modelArtifactSha256 ?? SHA.model,
      status: "candidate",
      statusEffectiveAt: "2024-12-01T00:00:00Z",
      countryScope: options.countryScope ?? ["US", "DE", "GB"],
      strategyScope: options.strategyScope ?? ["balanced", "defensive"],
    },
    country,
    strategyKey: options.strategyKey ?? "balanced",
    assets: [makeAsset(options.assetClass, options.valuationAvailable)],
    assumptions: ["The point-in-time snapshot is the sole research information set."],
    limitations: ["Scores are candidate research outputs rather than allocation instructions."],
  };
}

function makeManifest(options: ManifestOptions = {}): CapitalAllocationManifest {
  return createCapitalAllocationManifest(makeManifestInput(options));
}

function makeOutcomeInput(): OutcomeDefinitionInput {
  return {
    schemaVersion: 1,
    outcomeDefinitionId: IDS.outcome,
    version: "1.0.0",
    purpose: "research_validation_only",
    assetClass: "gold",
    metricKey: "twelve_month_real_total_return",
    description: "Inflation-adjusted total return over the declared observation window.",
    countryScope: ["US", "DE"],
    strategyScope: ["defensive", "balanced"],
    horizonDays: 365,
    observationWindow: { startOffsetDays: 1, endOffsetDays: 365 },
    direction: "higher_is_better",
    calculationMethod: "Compound the governed return series and subtract observed inflation.",
    sourceSeriesKeys: ["price.total_return", "price.inflation"],
    availabilityLagDays: 45,
    revisionPolicy: "fixed_vintage",
    missingDataPolicy: "score_as_unresolved",
  };
}

function makeFold(
  foldId: string,
  trainingEnd: string,
  calibrationStart: string,
  calibrationEnd: string,
  testStart: string,
  testEnd: string,
): TemporalValidationFold {
  return {
    foldId,
    training: { start: "2020-01-01T00:00:00Z", end: trainingEnd },
    calibration: { start: calibrationStart, end: calibrationEnd },
    test: { start: testStart, end: testEnd },
    embargoDays: 1,
    sentinels: {
      outcomeDefinitionLockedAt: "2019-12-31T00:00:00Z",
      featureEngineeringFitThrough: trainingEnd,
      normalizationFitThrough: trainingEnd,
      hyperparameterSelectionFitThrough: trainingEnd,
      valuationModelFitThrough: trainingEnd,
      latestTrainingLabelAvailableAt: trainingEnd,
      calibrationFitThrough: calibrationEnd,
      thresholdSelectionFitThrough: calibrationEnd,
    },
  };
}

function makeValidationInput(outcome: OutcomeDefinition): TemporalValidationPlanInput {
  return {
    schemaVersion: 1,
    validationPlanId: IDS.plan,
    purpose: "chronological_research_validation",
    mode: "expanding_window",
    model: {
      modelId: IDS.model,
      version: "1.0.0",
      artifactSha256: SHA.model,
      status: "candidate",
    },
    outcomeDefinitionId: outcome.outcomeDefinitionId,
    outcomeDefinitionSha256: outcome.manifestSha256,
    folds: [
      makeFold(
        "fold_1",
        "2022-12-31T00:00:00Z",
        "2023-01-02T00:00:00Z",
        "2023-03-31T00:00:00Z",
        "2023-04-02T00:00:00Z",
        "2023-06-30T00:00:00Z",
      ),
      makeFold(
        "fold_2",
        "2023-06-30T00:00:00Z",
        "2023-07-02T00:00:00Z",
        "2023-09-30T00:00:00Z",
        "2023-10-02T00:00:00Z",
        "2023-12-31T00:00:00Z",
      ),
    ],
  };
}

describe("capital-allocation assessment manifests", () => {
  it("publishes the complete stable asset taxonomy", () => {
    expect(ASSET_CLASSES).toEqual([
      "cash",
      "money_market",
      "government_bonds",
      "inflation_linked_bonds",
      "investment_grade_corporate_credit",
      "high_yield_credit",
      "equities",
      "real_estate",
      "infrastructure",
      "gold",
      "silver",
      "industrial_metals",
      "agriculture",
      "energy",
      "foreign_exchange",
      "bitcoin",
      "ethereum",
      "private_credit",
    ]);
  });

  it("creates an immutable deterministic manifest with separate suitability scores", () => {
    const input = makeManifestInput();
    const secondAsset = makeAsset("cash");
    const firstAsset = copy(input.assets[0]);
    if (!firstAsset) throw new Error("fixture asset is missing");
    const shuffledFirst = {
      ...firstAsset,
      decisionInputs: [...firstAsset.decisionInputs].reverse(),
      macroWeights: [...firstAsset.macroWeights].reverse(),
    };
    const reversed = {
      ...copy(input),
      assets: [shuffledFirst, secondAsset].reverse(),
      assumptions: [...input.assumptions].reverse(),
    };

    const manifest = createCapitalAllocationManifest(reversed);
    const canonical = createCapitalAllocationManifest({
      ...input,
      assets: [secondAsset, required(input.assets[0])],
    });
    expect(manifest.manifestSha256).toBe(canonical.manifestSha256);
    expect(manifest.assets.map((asset) => asset.assetClass)).toEqual(["cash", "gold"]);
    const gold = manifest.assets[1];
    expect(gold?.decisionInputs.map((item) => item.dimension)).toEqual(DECISION_INPUT_DIMENSIONS);
    expect(gold?.macroSuitability.score).toBe("0.4");
    expect(gold?.valuationSuitability.score).toBe("0.2");
    expect(gold?.combinedSuitability.score).toBe("0.32");
    expect(gold?.presentationStatistic).toMatchObject({
      label: "display_only_not_a_validated_score",
      basedOnCombinedSuitability: "0.32",
      value: "0.16",
    });
    expect(gold?.evidence.items[0]?.freshnessAsOf).toMatchObject({
      asOf: "2025-01-31T00:00:00Z",
      ageSeconds: 2_592_000,
      maximumAgeSeconds: 1_728_000,
      status: "stale",
    });
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(gold?.macroSuitability)).toBe(true);
    expect(() => assertCapitalAllocationManifestIntegrity(manifest)).not.toThrow();
  });

  it("does not consult wall-clock time", () => {
    const wallClock = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("wall-clock access is prohibited");
    });
    expect(() => createCapitalAllocationManifest(makeManifestInput())).not.toThrow();
    expect(wallClock).not.toHaveBeenCalled();
    wallClock.mockRestore();
  });

  it("rejects forged digests and semantically altered derived values", () => {
    const manifest = makeManifest();
    const forgedDigest = { ...manifest, manifestSha256: "0".repeat(64) };
    expect(() => assertCapitalAllocationManifestIntegrity(forgedDigest)).toThrow(/digest/);

    const altered = copy(manifest) as unknown as {
      assets: Array<{ combinedSuitability: { score: string } }>;
      manifestSha256: string;
    };
    if (!altered.assets[0]) throw new Error("fixture asset is missing");
    altered.assets[0].combinedSuitability.score = "0.33";
    expect(() =>
      assertCapitalAllocationManifestIntegrity(altered as unknown as CapitalAllocationManifest),
    ).toThrow(/component contributions|does not match/);
  });

  it("rejects future, mismatched, and duplicated evidence", () => {
    const future = copy(makeManifestInput()) as unknown as {
      assets: Array<{ evidence: { items: Array<{ availableAt: string }> } }>;
    };
    required(required(future.assets[0]).evidence.items[0]).availableAt = "2025-01-31T00:00:00Z";
    expect(() =>
      createCapitalAllocationManifest(future as unknown as CapitalAllocationManifestInput),
    ).toThrow(/not available/);

    const futureObservation = copy(makeManifestInput()) as unknown as {
      assets: Array<{ evidence: { items: Array<{ observedAt: string; availableAt: string }> } }>;
    };
    const futureItem = required(required(futureObservation.assets[0]).evidence.items[0]);
    futureItem.observedAt = "2025-02-01T00:00:00Z";
    futureItem.availableAt = "2025-02-02T00:00:00Z";
    expect(() =>
      createCapitalAllocationManifest(
        futureObservation as unknown as CapitalAllocationManifestInput,
      ),
    ).toThrow(/future evidence/);

    const mismatched = copy(makeManifestInput()) as unknown as {
      assets: Array<{ evidence: { items: Array<{ dataVintageSha256: string }> } }>;
    };
    required(required(mismatched.assets[0]).evidence.items[0]).dataVintageSha256 = "d".repeat(64);
    expect(() =>
      createCapitalAllocationManifest(mismatched as unknown as CapitalAllocationManifestInput),
    ).toThrow(/provenance/);

    const duplicate = copy(makeManifestInput()) as unknown as {
      assets: Array<{
        evidence: { items: Array<Record<string, unknown>> };
        counterEvidence: { items: Array<Record<string, unknown>>; absenceReason: string | null };
      }>;
    };
    const duplicateAsset = required(duplicate.assets[0]);
    duplicateAsset.counterEvidence = {
      items: [copy(required(duplicateAsset.evidence.items[0]))],
      absenceReason: null,
    };
    expect(() =>
      createCapitalAllocationManifest(duplicate as unknown as CapitalAllocationManifestInput),
    ).toThrow(/same evidenceId/);
  });

  it("keeps absent valuation explicit and never substitutes a neutral combined score", () => {
    const manifest = makeManifest({ valuationAvailable: false });
    const asset = manifest.assets[0];
    expect(asset?.valuationSuitability).toMatchObject({ status: "unavailable", score: null });
    expect(asset?.combinedSuitability).toMatchObject({
      status: "unavailable",
      score: null,
      reasonCode: "valuation_unavailable",
    });
    expect(asset?.presentationStatistic).toBeNull();

    const missing = copy(makeManifestInput()) as unknown as {
      assets: Array<Record<string, unknown>>;
    };
    delete missing.assets[0]?.valuationSuitability;
    expect(() =>
      createCapitalAllocationManifest(missing as unknown as CapitalAllocationManifestInput),
    ).toThrow(/exactly|mandatory/);

    const syntheticPresentation = copy(
      makeManifestInput({ valuationAvailable: false }),
    ) as unknown as {
      assets: Array<Record<string, unknown>>;
    };
    required(syntheticPresentation.assets[0]).presentationParameters = {
      method: "linear_confidence_shrinkage",
      target: "0",
      confidenceWeight: "0.5",
    };
    expect(() =>
      createCapitalAllocationManifest(
        syntheticPresentation as unknown as CapitalAllocationManifestInput,
      ),
    ).toThrow(/requires available combined/);
  });

  it("rejects scope/type mismatches, duplicates, range errors, and excess precision", () => {
    expect(() =>
      createCapitalAllocationManifest(makeManifestInput({ countryScope: ["DE"] })),
    ).toThrow(/countryScope/);
    expect(() =>
      createCapitalAllocationManifest(
        makeManifestInput({ strategyKey: "growth", strategyScope: ["balanced"] }),
      ),
    ).toThrow(/strategyScope/);

    const base = copy(makeManifestInput());
    const duplicateAsset = {
      ...base,
      assets: [required(base.assets[0]), copy(required(base.assets[0]))],
    };
    expect(() => createCapitalAllocationManifest(duplicateAsset)).toThrow(/duplicate assetClass/);

    const duplicateDimension = copy(makeManifestInput()) as unknown as {
      assets: Array<{ decisionInputs: Array<{ dimension: string }> }>;
    };
    required(required(duplicateDimension.assets[0]).decisionInputs[1]).dimension = "access";
    expect(() =>
      createCapitalAllocationManifest(
        duplicateDimension as unknown as CapitalAllocationManifestInput,
      ),
    ).toThrow(/duplicate dimension/);

    const range = copy(makeManifestInput()) as unknown as {
      assets: Array<{ decisionInputs: Array<{ value: string }> }>;
    };
    const rangedInput = required(required(range.assets[0]).decisionInputs[0]);
    rangedInput.value = "1.1";
    expect(() =>
      createCapitalAllocationManifest(range as unknown as CapitalAllocationManifestInput),
    ).toThrow(/between -1 and 1/);
    rangedInput.value = "0.1234567890123";
    expect(() =>
      createCapitalAllocationManifest(range as unknown as CapitalAllocationManifestInput),
    ).toThrow(/12 places/);
  });

  it("rejects advice language, unknown fields, invalid cutoffs, and inconsistent weights", () => {
    const advice = { ...copy(makeManifestInput()), limitations: ["Buy gold now."] };
    expect(() => createCapitalAllocationManifest(advice)).toThrow(/advice language/);

    const unknownField = copy(makeManifestInput()) as unknown as Record<string, unknown>;
    unknownField.generatedAt = "2025-01-31T00:00:00Z";
    expect(() =>
      createCapitalAllocationManifest(unknownField as unknown as CapitalAllocationManifestInput),
    ).toThrow(/exactly/);

    expect(() =>
      createCapitalAllocationManifest(
        makeManifestInput({ knowledgeCutoff: "2025-02-01T00:00:00Z" }),
      ),
    ).toThrow(/cutoffs/);

    const weights = copy(makeManifestInput()) as unknown as {
      assets: Array<{ macroWeights: Array<{ weight: string }> }>;
    };
    required(required(weights.assets[0]).macroWeights[0]).weight = "0.2";
    expect(() =>
      createCapitalAllocationManifest(weights as unknown as CapitalAllocationManifestInput),
    ).toThrow(/sum exactly/);
  });

  it("fails closed across nested policy, provenance, scoring, and completeness invariants", () => {
    function rejectAt(path: readonly PropertyKey[], value: unknown, pattern: RegExp): void {
      const draft = copy(makeManifestInput());
      let target: unknown = draft;
      for (const segment of path.slice(0, -1)) {
        target = Reflect.get(target as object, segment);
      }
      Reflect.set(target as object, required(path.at(-1), "mutation path"), value);
      expect(() => createCapitalAllocationManifest(draft)).toThrow(pattern);
    }

    rejectAt(["semantics", "purpose"], "portfolio_advice", /research-only/);
    rejectAt(["pointInTime", "policy"], "latest", /strict system and knowledge/);
    rejectAt(["pointInTime", "snapshotRecordedAt"], "2025-01-31T00:00:00Z", /recorded after/);
    rejectAt(
      ["pointInTime", "dataVintageAvailableAt"],
      "2025-01-30T12:00:00Z",
      /available after knowledgeCutoff/,
    );
    rejectAt(["model", "kind"], "production_model", /candidate_model/);
    rejectAt(["model", "statusEffectiveAt"], "2025-02-01T00:00:00Z", /not effective/);
    rejectAt(["assets", 0, "macroUncertainty", "lower"], "0.8", /lower bound/);
    rejectAt(["assets", 0, "macroUncertainty", "lower"], "0.5", /contain its score/);
    rejectAt(
      ["assets", 0, "evidence", "items", 0, "observedAt"],
      "2025-01-03T00:00:00Z",
      /available before/,
    );
    rejectAt(["assets", 0, "evidence", "items"], [], /explicit absenceReason/);
    rejectAt(
      ["assets", 0, "evidence", "absenceReason"],
      "Unexpected reason alongside evidence.",
      /must be null/,
    );

    const evidence = required(required(makeManifestInput().assets[0]).evidence.items[0]);
    rejectAt(
      ["assets", 0, "evidence", "items"],
      [evidence, copy(evidence)],
      /duplicate evidenceId/,
    );
    rejectAt(
      ["assets", 0, "decisionInputs", 0, "evidenceIds"],
      ["00000000-0000-8000-8000-000000000099"],
      /unknown evidenceId/,
    );
    rejectAt(["assets", 0, "combinationPolicy", "method"], "sum", /unsupported/);
    rejectAt(["assets", 0, "invalidationCriteria"], [], /non-empty/);
    rejectAt(
      ["assets", 0, "decisionInputs"],
      makeAsset().decisionInputs.slice(1),
      /cover every required/,
    );
    rejectAt(
      ["assets", 0, "macroWeights"],
      makeAsset().macroWeights.slice(1),
      /cover every required/,
    );
    rejectAt(["assets", 0, "macroWeights", 1, "dimension"], "access", /duplicate dimension/);
    rejectAt(["assets", 0, "valuationSuitability", "components"], [], /at least one/);
    const fixtureValuation = makeAsset().valuationSuitability;
    const component =
      fixtureValuation.status === "available" ? fixtureValuation.components[0] : undefined;
    if (!component) throw new Error("fixture valuation component is missing");
    rejectAt(
      ["assets", 0, "valuationSuitability", "components"],
      [component, copy(component)],
      /componentKey must be unique/,
    );
    rejectAt(
      ["assets", 0, "valuationSuitability", "components", 0, "evidenceIds"],
      ["00000000-0000-8000-8000-000000000099"],
      /unknown evidenceId/,
    );
    rejectAt(
      ["assets", 0, "valuationSuitability", "components", 0, "weight"],
      "0.9",
      /sum exactly/,
    );
    rejectAt(["assets", 0, "presentationParameters", "method"], "opaque", /unsupported/);
    rejectAt(["schemaVersion"], 2, /schemaVersion/);
    rejectAt(["assets"], [], /between 1 and/);
  });
});

describe("outcome definitions and chronological validation", () => {
  it("creates deterministic immutable outcome contracts", () => {
    const input = makeOutcomeInput();
    const reversed = {
      ...input,
      countryScope: [...input.countryScope].reverse(),
      strategyScope: [...input.strategyScope].reverse(),
      sourceSeriesKeys: [...input.sourceSeriesKeys].reverse(),
    };
    const outcome = createOutcomeDefinition(input);
    expect(createOutcomeDefinition(reversed).manifestSha256).toBe(outcome.manifestSha256);
    expect(outcome.countryScope).toEqual(["DE", "US"]);
    expect(outcome.strategyScope).toEqual(["balanced", "defensive"]);
    expect(Object.isFrozen(outcome)).toBe(true);
    expect(() => assertOutcomeDefinitionIntegrity(outcome)).not.toThrow();
  });

  it("rejects forged, advisory, malformed, and duplicate outcome contracts", () => {
    const outcome = createOutcomeDefinition(makeOutcomeInput());
    expect(() =>
      assertOutcomeDefinitionIntegrity({ ...outcome, manifestSha256: "f".repeat(64) }),
    ).toThrow(/digest/);

    const advisory = { ...makeOutcomeInput(), description: "We recommend this metric." };
    expect(() => createOutcomeDefinition(advisory)).toThrow(/advice language/);

    const window = {
      ...makeOutcomeInput(),
      observationWindow: { startOffsetDays: 365, endOffsetDays: 1 },
    };
    expect(() => createOutcomeDefinition(window)).toThrow(/positive duration/);

    const duplicates = {
      ...makeOutcomeInput(),
      sourceSeriesKeys: ["price.total_return", "price.total_return"],
    };
    expect(() => createOutcomeDefinition(duplicates)).toThrow(/unique/);
  });

  it("accepts chronological expanding folds with explicit leakage sentinels", () => {
    const outcome = createOutcomeDefinition(makeOutcomeInput());
    const plan = createTemporalValidationPlan(makeValidationInput(outcome));
    expect(plan.folds.map((fold) => fold.foldId)).toEqual(["fold_1", "fold_2"]);
    expect(Object.isFrozen(plan.folds[0]?.sentinels)).toBe(true);
    expect(() => assertTemporalValidationPlanIntegrity(plan)).not.toThrow();
  });

  it("rejects leakage, broken chronology, insufficient embargo, and forged plans", () => {
    const outcome = createOutcomeDefinition(makeOutcomeInput());
    const input = makeValidationInput(outcome);
    const leakage = copy(input) as unknown as {
      folds: Array<{
        test: { start: string };
        sentinels: { featureEngineeringFitThrough: string };
      }>;
    };
    const leakingFold = required(leakage.folds[0]);
    leakingFold.sentinels.featureEngineeringFitThrough = leakingFold.test.start;
    expect(() =>
      createTemporalValidationPlan(leakage as unknown as TemporalValidationPlanInput),
    ).toThrow(/leaks/);

    const chronology = copy(input) as unknown as {
      folds: Array<{ calibration: { start: string } }>;
    };
    required(chronology.folds[0]).calibration.start = "2022-12-30T00:00:00Z";
    expect(() =>
      createTemporalValidationPlan(chronology as unknown as TemporalValidationPlanInput),
    ).toThrow(/training must end/);

    const embargo = copy(input) as unknown as { folds: Array<{ embargoDays: number }> };
    required(embargo.folds[0]).embargoDays = 3;
    expect(() =>
      createTemporalValidationPlan(embargo as unknown as TemporalValidationPlanInput),
    ).toThrow(/embargoDays/);

    const expanding = copy(input) as unknown as {
      folds: Array<{ training: { start: string } }>;
    };
    required(expanding.folds[1]).training.start = "2020-02-01T00:00:00Z";
    expect(() =>
      createTemporalValidationPlan(expanding as unknown as TemporalValidationPlanInput),
    ).toThrow(/preserve the training start/);

    const plan = createTemporalValidationPlan(input);
    const forged = { ...plan, manifestSha256: "0".repeat(64) };
    expect(() => assertTemporalValidationPlanIntegrity(forged as TemporalValidationPlan)).toThrow(
      /digest/,
    );
  });
});

describe("bounded country comparison", () => {
  const us: CountryIdentity = { countryId: IDS.countryUs, countryCode: "US" };
  const de: CountryIdentity = { countryId: IDS.countryDe, countryCode: "DE" };
  const gb: CountryIdentity = { countryId: IDS.countryGb, countryCode: "GB" };

  function comparisonInput(
    requestedCountries: readonly CountryIdentity[],
    manifests: readonly CapitalAllocationManifest[],
    referenceCountryId = IDS.countryUs,
  ) {
    return {
      schemaVersion: 1 as const,
      comparisonId: IDS.comparison,
      semantics: RESEARCH_ONLY_SEMANTICS,
      assetClass: "gold" as const,
      strategyKey: "balanced",
      referenceCountryId,
      requestedCountries,
      compatibilityPolicy: EXACT_COMPARISON_POLICY,
      manifests,
    };
  }

  it("preserves requested order, explains missing data, and emits no hidden ranks", () => {
    const usManifest = makeManifest({ country: us });
    const deManifest = makeManifest({
      manifestId: "00000000-0000-8000-8000-000000000013",
      country: de,
    });
    const comparison = createCountryComparison(
      comparisonInput([de, us, gb], [usManifest, deManifest]),
    );
    expect(comparison.results.map((result) => result.country.countryCode)).toEqual([
      "DE",
      "US",
      "GB",
    ]);
    expect(comparison.results.map((result) => result.status)).toEqual([
      "comparable",
      "comparable",
      "incomparable",
    ]);
    expect(comparison.results[2]).toMatchObject({
      sourceManifestSha256: null,
      reasons: [{ code: "missing_assessment" }],
    });
    expect(comparison.sourceManifestDigests.map((source) => source.countryId)).toEqual([
      IDS.countryDe,
      IDS.countryUs,
    ]);
    expect(comparison.results.every((result) => !("rank" in result))).toBe(true);
    expect(() => assertCountryComparisonIntegrity(comparison)).not.toThrow();
  });

  it("exposes valuation, model, point-in-time, strategy, identity, and asset incompatibility", () => {
    const usManifest = makeManifest({ country: us });
    const unavailable = makeManifest({
      manifestId: "00000000-0000-8000-8000-000000000014",
      country: de,
      valuationAvailable: false,
    });
    const valuation = createCountryComparison(comparisonInput([us, de], [usManifest, unavailable]));
    expect(valuation.results[1]).toMatchObject({
      status: "incomparable",
      reasons: [{ code: "valuation_unavailable" }],
    });

    const incompatible = makeManifest({
      manifestId: "00000000-0000-8000-8000-000000000015",
      country: de,
      strategyKey: "defensive",
      modelArtifactSha256: "d".repeat(64),
      asOf: "2025-02-01T00:00:00Z",
      knowledgeCutoff: "2025-01-31T00:00:00Z",
      systemCutoff: "2025-01-31T12:00:00Z",
      assetClass: "cash",
    });
    const mismatch = createCountryComparison(
      comparisonInput([{ ...de, countryCode: "FR" }, us], [incompatible, usManifest]),
    );
    expect(
      mismatch.results[0]?.status === "incomparable"
        ? mismatch.results[0].reasons.map((item) => item.code)
        : [],
    ).toEqual([
      "country_identity_mismatch",
      "strategy_scope_mismatch",
      "asset_not_assessed",
      "model_identity_mismatch",
      "point_in_time_mismatch",
    ]);
  });

  it("explains a missing reference and enforces hard bounds and source identity", () => {
    const deManifest = makeManifest({
      manifestId: "00000000-0000-8000-8000-000000000016",
      country: de,
    });
    const missingReference = createCountryComparison(comparisonInput([us, de], [deManifest]));
    expect(missingReference.results[0]).toMatchObject({
      reasons: [{ code: "missing_assessment" }],
    });
    expect(missingReference.results[1]).toMatchObject({
      reasons: [{ code: "reference_assessment_missing" }],
    });

    const tooMany = Array.from({ length: MAX_COMPARISON_COUNTRIES + 1 }, (_, index) => ({
      countryId: `00000000-0000-8000-8000-${(100 + index).toString().padStart(12, "0")}`,
      countryCode: "US",
    }));
    expect(() => createCountryComparison(comparisonInput(tooMany, []))).toThrow(/between 2 and/);

    const unrequested = makeManifest({ country: gb });
    expect(() => createCountryComparison(comparisonInput([us, de], [unrequested]))).toThrow(
      /unrequested/,
    );
    expect(() =>
      createCountryComparison(comparisonInput([us, de], [deManifest, deManifest])),
    ).toThrow(/duplicate country manifests/);
  });

  it("rejects reordered results and forged comparison digests", () => {
    const comparison = createCountryComparison(
      comparisonInput([us, de], [makeManifest({ country: us })]),
    );
    const reordered = copy(comparison) as unknown as {
      results: unknown[];
      manifestSha256: string;
    };
    reordered.results.reverse();
    expect(() =>
      assertCountryComparisonIntegrity(
        reordered as unknown as ReturnType<typeof createCountryComparison>,
      ),
    ).toThrow(/requested-country order/);

    const forged = { ...comparison, manifestSha256: "1".repeat(64) };
    expect(() => assertCountryComparisonIntegrity(forged)).toThrow(/digest/);
  });
});
