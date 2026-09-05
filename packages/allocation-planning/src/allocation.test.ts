import { describe, expect, it } from "vitest";
import {
  ALLOCATION_DIMENSIONS,
  type AllocationRegimeProfileInput,
  assertAllocationVisible,
  assertPlanIntegrity,
  computeLeontiefBottleneck,
  computeMaterialBalance,
  computeParallelMarketPremium,
  computeShortage,
  createAllocationRegimeProfile,
  createEconomicPlanVersion,
  createPlanActual,
  type EconomicPlanVersionInput,
  type GovernedRecord,
  type MaterialBalanceInput,
  type PlanActualInput,
  type PlannerEnterpriseScenarioInput,
  plannerEnterpriseSensitivity,
  projectPlanFulfillment,
  simulatePlannerEnterprise,
} from "./index.js";

function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("Missing test fixture item");
  return item;
}

const evidence = [
  {
    sourceId: "test-study",
    sourceSha256: "a".repeat(64),
    sourceUrl: "https://example.org/study",
    sourceSpan: "Table 1 (synthetic test fixture)",
    availableAt: "2025-01-01T00:00:00Z",
  },
];
const governed: GovernedRecord = {
  schemaVersion: 1,
  tenantId: "tenant-a",
  id: "record-a",
  version: "1.0.0",
  geographyKey: "test-region",
  sectorKey: "manufacturing",
  effectiveFrom: "2025-01-01T00:00:00Z",
  effectiveTo: null,
  publishedAt: "2025-01-01T00:00:00Z",
  availableAt: "2025-01-01T00:00:00Z",
  admittedAt: "2025-01-02T00:00:00Z",
  recordedAt: "2025-01-02T00:00:00Z",
  evidenceRefs: evidence,
  methodologyVersion: "1.0.0",
};
const context = {
  tenantId: "tenant-a",
  knowledgeCutoff: "2025-02-01T00:00:00Z",
  effectiveAt: "2025-01-10T00:00:00Z",
};
function profile(): AllocationRegimeProfileInput {
  return {
    ...governed,
    ownership: [
      {
        sectorKey: "manufacturing",
        assetKey: "factory",
        kind: "state",
        coverage: null,
        evidenceRefs: evidence,
      },
    ],
    priceFormation: [
      {
        sectorKey: "manufacturing",
        commodityKey: "steel",
        mechanism: "market",
        evidenceRefs: evidence,
      },
    ],
    mechanisms: [
      {
        sectorKey: "manufacturing",
        mechanism: "market",
        decisionActor: "firm",
        decisionRight: "production",
      },
    ],
    measurements: [],
  };
}
function planInput(): EconomicPlanVersionInput {
  return {
    ...governed,
    planId: "plan-a",
    previousVersionSha256: null,
    authority: { authorityId: "authority-a", name: "Test authority" },
    objectives: [{ objectiveId: "objective-a", description: "Test production objective" }],
    targets: [
      {
        targetId: "target-a",
        commodityKey: "steel",
        unit: "tonne",
        target: "3",
        periodStart: "2025-01-01T00:00:00Z",
        periodEnd: "2025-02-01T00:00:00Z",
        enterpriseKey: null,
        evidenceRefs: evidence,
      },
    ],
    controls: [
      {
        controlId: "quota-a",
        kind: "production_quota",
        targetId: "target-a",
        commodityKey: "steel",
        value: "3",
        unit: "tonne",
        binding: "indicative",
        evidenceRefs: evidence,
      },
    ],
  };
}
function actualInput(): PlanActualInput {
  const plan = createEconomicPlanVersion(planInput());
  return {
    ...governed,
    id: "actual-a",
    publishedAt: "2025-02-01T00:00:00Z",
    availableAt: "2025-02-01T00:00:00Z",
    admittedAt: "2025-02-01T00:00:00Z",
    recordedAt: "2025-02-01T00:00:00Z",
    planVersionSha256: plan.manifestSha256,
    targetId: "target-a",
    commodityKey: "steel",
    unit: "tonne",
    periodStart: "2025-01-01T00:00:00Z",
    periodEnd: "2025-02-01T00:00:00Z",
    value: "1",
    actualKind: "independent_estimate",
  };
}
function material(): MaterialBalanceInput {
  return {
    commodityKey: "steel",
    unit: "tonne",
    production: "0.1",
    imports: "0.2",
    openingInventory: "0",
    intermediateDemand: "0",
    householdDemand: "0.3",
    governmentDemand: "0",
    investmentDemand: "0",
    exports: "0",
    closingInventory: "0",
  };
}
function scenario(): PlannerEnterpriseScenarioInput {
  return {
    schemaVersion: 1,
    tenantId: "tenant-a",
    scenarioId: "scenario-a",
    baselineSha256: "b".repeat(64),
    knowledgeCutoff: context.knowledgeCutoff,
    modelVersion: "1.0.0",
    evidenceRefs: evidence,
    assumptions: ["Illustrative fixture only; no empirical calibration."],
    capacity: "100",
    target: "100",
    inputAvailable: "200",
    inputCoefficient: "2",
    householdDemand: "100",
    previousDemand: null,
    informationMode: "perfect",
    parameters: {
      capacityConcealment: "0",
      inputOverRequest: "0",
      inventoryHoarding: "0",
      targetBargaining: "0",
      reportingDistortion: "0",
      householdStockpiling: "0",
      informationError: "0",
    },
  };
}

describe("governed allocation and planning", () => {
  it("keeps ownership, price formation and decision rights separate, fills unknown dimensions", () => {
    const result = createAllocationRegimeProfile(profile());
    expect(result.ownership[0]?.kind).toBe("state");
    expect(result.priceFormation[0]?.mechanism).toBe("market");
    expect(result.measurements).toHaveLength(ALLOCATION_DIMENSIONS.length);
    expect(result.measurements.every((item) => item.status === "missing")).toBe(true);
    expect(result).not.toHaveProperty("score");
    expect(Object.isFrozen(result.measurements)).toBe(true);
  });
  it("retains explicit observed/estimated values and interval", () => {
    const result = createAllocationRegimeProfile({
      ...profile(),
      measurements: [
        {
          dimension: "state_ownership_share",
          status: "estimated",
          value: "0.3",
          unit: "share",
          evidenceRefs: evidence,
          uncertainty: { lower: "0.2", upper: "0.4" },
        },
        { dimension: "shortage_prevalence", status: "missing", reason: "No observations" },
      ],
    });
    expect(
      result.measurements.find((item) => item.dimension === "state_ownership_share"),
    ).toMatchObject({ value: "0.3", uncertainty: { lower: "0.2", upper: "0.4" } });
  });
  it("preserves disagreeing source measurements and rejects missing/measured contradictions", () => {
    const measurement = {
      dimension: "state_ownership_share" as const,
      status: "observed" as const,
      value: "0.5",
      unit: "share",
      evidenceRefs: evidence,
      uncertainty: null,
    };
    const result = createAllocationRegimeProfile({
      ...profile(),
      measurements: [
        measurement,
        {
          ...measurement,
          value: "0.7",
          evidenceRefs: [{ ...first(evidence), sourceId: "independent-source" }],
        },
      ],
    });
    expect(
      result.measurements.filter((item) => item.dimension === "state_ownership_share"),
    ).toHaveLength(2);
    expect(() =>
      createAllocationRegimeProfile({
        ...profile(),
        measurements: [
          measurement,
          { dimension: "state_ownership_share", status: "missing", reason: "No evidence" },
        ],
      }),
    ).toThrow("conflict");
    expect(() =>
      createAllocationRegimeProfile({
        ...profile(),
        measurements: [{ ...measurement, uncertainty: { lower: "0", upper: "1.1" } }],
      }),
    ).toThrow("Probability");
  });
  it.each(["2025-02-30T00:00:00Z", "2025-01-01T00:00:00.000001Z", "2025-01-01T00:00:00+00:00"])(
    "rejects invalid or unsupported precision %s",
    (recordedAt) =>
      expect(() => createAllocationRegimeProfile({ ...profile(), recordedAt })).toThrow(),
  );
  it("blocks same millisecond temporal leakage by rejecting sub-ms inputs and checks milliseconds exactly", () => {
    const p = createAllocationRegimeProfile({
      ...profile(),
      recordedAt: "2025-01-02T00:00:00.001Z",
    });
    expect(() =>
      assertAllocationVisible(p, { ...context, knowledgeCutoff: "2025-01-02T00:00:00.000Z" }),
    ).toThrow("cutoff");
    expect(() =>
      assertAllocationVisible(p, { ...context, knowledgeCutoff: "2025-01-02T00:00:00.001Z" }),
    ).not.toThrow();
  });
  it("blocks late admission, wrong tenant and end-exclusive effective bounds", () => {
    expect(() => assertAllocationVisible(governed, { ...context, tenantId: "tenant-b" })).toThrow(
      "Tenant",
    );
    expect(() =>
      assertAllocationVisible(governed, { ...context, knowledgeCutoff: "2025-01-01T12:00:00Z" }),
    ).toThrow("cutoff");
    expect(() =>
      assertAllocationVisible({ ...governed, effectiveTo: context.effectiveAt }, context),
    ).toThrow("effective");
    expect(() =>
      assertAllocationVisible(governed, { ...context, effectiveAt: "2024-01-01T00:00:00Z" }),
    ).toThrow("effective");
  });
  it("rejects malformed direct visibility requests instead of bypassing cutoff checks through NaN", () => {
    expect(() => assertAllocationVisible({ ...governed, availableAt: "invalid" }, context)).toThrow(
      "instant",
    );
  });
  it("rejects reversed chronology, source leakage and arbitrary top-level fields", () => {
    expect(() =>
      createAllocationRegimeProfile({ ...profile(), admittedAt: "2024-01-01T00:00:00Z" }),
    ).toThrow("timeline");
    expect(() =>
      createAllocationRegimeProfile({
        ...profile(),
        evidenceRefs: [{ ...first(evidence), availableAt: "2026-01-01T00:00:00Z" }],
      }),
    ).toThrow("unavailable");
    expect(() =>
      createAllocationRegimeProfile({ ...profile(), score: "0.5" } as AllocationRegimeProfileInput),
    ).toThrow("fields");
    expect(() =>
      createAllocationRegimeProfile({ ...profile(), effectiveTo: governed.effectiveFrom }),
    ).toThrow("interval");
  });
  it("rejects malformed provenance and unknown measurements", () => {
    expect(() => createAllocationRegimeProfile({ ...profile(), evidenceRefs: [] })).toThrow(
      "Evidence",
    );
    expect(() =>
      createAllocationRegimeProfile({
        ...profile(),
        evidenceRefs: [{ ...first(evidence), sourceUrl: "file:///private/secret" }],
      }),
    ).toThrow("URL");
    expect(() =>
      createAllocationRegimeProfile({
        ...profile(),
        evidenceRefs: [{ ...first(evidence), sourceSha256: "bad" }],
      }),
    ).toThrow("SHA");
    expect(() =>
      createAllocationRegimeProfile({
        ...profile(),
        measurements: [{ dimension: "command_score", status: "missing", reason: "test" }],
      } as unknown as AllocationRegimeProfileInput),
    ).toThrow("enumeration");
  });
  it("validates intervals, duplicate dimensions and probability bounds", () => {
    const measurement = {
      dimension: "state_ownership_share" as const,
      status: "observed" as const,
      value: "0.5",
      unit: "share",
      evidenceRefs: evidence,
      uncertainty: null,
    };
    expect(() =>
      createAllocationRegimeProfile({ ...profile(), measurements: [measurement, measurement] }),
    ).toThrow("Duplicate");
    expect(() =>
      createAllocationRegimeProfile({
        ...profile(),
        measurements: [{ ...measurement, value: "1.1" }],
      }),
    ).toThrow("Probability");
    expect(() =>
      createAllocationRegimeProfile({
        ...profile(),
        measurements: [{ ...measurement, uncertainty: { lower: "0.6", upper: "1" } }],
      }),
    ).toThrow("interval");
  });
  it("creates immutable versions, verifies digests, rejects dangling directives and malformed targets", () => {
    const input = planInput();
    const plan = createEconomicPlanVersion(input);
    expect(() => assertPlanIntegrity(plan)).not.toThrow();
    expect(() => assertPlanIntegrity({ ...plan, planId: "altered" })).toThrow("integrity");
    expect(() => createEconomicPlanVersion({ ...input, previousVersionSha256: "bad" })).toThrow(
      "SHA",
    );
    expect(() =>
      createEconomicPlanVersion({
        ...input,
        controls: [{ ...first(input.controls), targetId: "absent" }],
      }),
    ).toThrow("Dangling");
    expect(() =>
      createEconomicPlanVersion({
        ...input,
        targets: [{ ...first(input.targets), periodEnd: first(input.targets).periodStart }],
      }),
    ).toThrow("period");
    expect(Object.isFrozen(plan.targets)).toBe(true);
  });
  it("preserves disagreeing actuals and calculates repeating fulfillment exactly", () => {
    const plan = createEconomicPlanVersion(planInput());
    const actual = actualInput();
    const result = projectPlanFulfillment(
      plan,
      [
        createPlanActual(actual),
        { ...actual, id: "official-a", value: "2", actualKind: "officially_reported_actual" },
      ],
      context,
    );
    expect(result.targets[0]?.actuals.map((a) => a.fulfillment)).toEqual([
      { status: "computed", ratio: { numerator: "1", denominator: "3" } },
      { status: "computed", ratio: { numerator: "2", denominator: "3" } },
    ]);
    expect(projectPlanFulfillment(plan, [], context).targets[0]?.coverage).toBe("missing");
  });
  it("makes zero target undefined, while zero actual is a measured zero", () => {
    const input = planInput();
    const plan = createEconomicPlanVersion({
      ...input,
      targets: [{ ...first(input.targets), target: "0" }],
    });
    const result = projectPlanFulfillment(
      plan,
      [{ ...actualInput(), planVersionSha256: plan.manifestSha256, value: "0" }],
      context,
    );
    expect(result.targets[0]?.actuals[0]?.fulfillment).toEqual({
      status: "undefined",
      reason: "zero_target",
    });
  });
  it("rejects a future full-period actual even when the plan target dates match", () => {
    const input = planInput();
    const target = {
      ...first(input.targets),
      periodStart: "2025-02-01T00:00:00Z",
      periodEnd: "2025-03-01T00:00:00Z",
    };
    const plan = createEconomicPlanVersion({ ...input, targets: [target] });
    const actual = {
      ...actualInput(),
      planVersionSha256: plan.manifestSha256,
      periodStart: target.periodStart,
      periodEnd: target.periodEnd,
    };
    expect(() => createPlanActual(actual)).toThrow("completed reporting period");
    expect(() => projectPlanFulfillment(plan, [actual], context)).toThrow(
      "completed reporting period",
    );
  });
  it.each([
    { unit: "kg" },
    { commodityKey: "wheat" },
    { planVersionSha256: "c".repeat(64) },
    { geographyKey: "other" },
    { sectorKey: "other" },
    { periodEnd: "2025-03-01T00:00:00Z" },
    { targetId: "unknown" },
  ])("rejects incomparable actual %j", (change) =>
    expect(() =>
      projectPlanFulfillment(
        createEconomicPlanVersion(planInput()),
        [{ ...actualInput(), ...change }],
        context,
      ),
    ).toThrow(),
  );
});

describe("exact material and shortage mechanics", () => {
  it("conserves fractional decimal values without binary rounding", () =>
    expect(computeMaterialBalance(material())).toMatchObject({
      status: "computed",
      supply: "0.3",
      uses: "0.3",
      imbalance: "0",
      shortage: "0",
      surplus: "0",
    }));
  it("distinguishes planned closing stock from expendable supply", () =>
    expect(computeMaterialBalance({ ...material(), closingInventory: "0.1" })).toMatchObject({
      imbalance: "-0.1",
      shortage: "0.1",
    }));
  it("does not impute absent observations", () => {
    expect(computeMaterialBalance({ ...material(), imports: null })).toEqual({
      status: "missing",
      missingFields: ["imports"],
    });
    expect(computeShortage({ demand: null, availableSupply: "0" })).toEqual({
      status: "missing",
      missingFields: ["demand"],
    });
  });
  it("calculates both surplus and shortage", () => {
    expect(computeMaterialBalance({ ...material(), production: "1" })).toMatchObject({
      surplus: "0.9",
    });
    expect(computeShortage({ demand: "2", availableSupply: "1" })).toEqual({
      status: "computed",
      shortage: "1",
      surplus: "0",
    });
    expect(computeShortage({ demand: "1", availableSupply: "2" })).toEqual({
      status: "computed",
      shortage: "0",
      surplus: "1",
    });
  });
  it.each(["-1", "-0", "1e2", "NaN", "0.10", "0.0000000000001", ""])(
    "rejects invalid decimal %s",
    (production) => expect(() => computeMaterialBalance({ ...material(), production })).toThrow(),
  );
  it("reports parallel price premiums without inferring illicit activity", () => {
    expect(
      computeParallelMarketPremium({
        officialPrice: "3",
        parallelPrice: "4",
        evidenceRefs: evidence,
      }),
    ).toEqual({
      status: "computed",
      premium: { numerator: "1", denominator: "3" },
      interpretation: "price_difference_only",
    });
    expect(
      computeParallelMarketPremium({
        officialPrice: "3",
        parallelPrice: "2",
        evidenceRefs: evidence,
      }),
    ).toMatchObject({ premium: { numerator: "-1", denominator: "3" } });
    expect(
      computeParallelMarketPremium({
        officialPrice: "0",
        parallelPrice: "2",
        evidenceRefs: evidence,
      }),
    ).toEqual({ status: "undefined", reason: "zero_official_price" });
    expect(
      computeParallelMarketPremium({
        officialPrice: null,
        parallelPrice: "2",
        evidenceRefs: evidence,
      }),
    ).toMatchObject({ status: "missing" });
  });
  it("finds all binding constraints with exact Leontief quotients", () => {
    expect(
      computeLeontiefBottleneck({
        capacity: "1",
        inputs: [{ inputKey: "steel", available: "1", coefficient: "3" }],
        labor: { available: "2", coefficient: "6" },
      }),
    ).toEqual({
      status: "computed",
      output: { numerator: "1", denominator: "3" },
      bindingConstraints: ["input:steel", "labor"],
    });
    expect(computeLeontiefBottleneck({ capacity: "0", inputs: [], labor: null })).toMatchObject({
      output: { numerator: "0", denominator: "1" },
      bindingConstraints: ["capacity"],
    });
  });
  it("requires missing essential inputs but excludes known zero requirements", () => {
    expect(
      computeLeontiefBottleneck({
        capacity: "1",
        inputs: [{ inputKey: "steel", available: null, coefficient: "1" }],
        labor: null,
      }),
    ).toEqual({ status: "missing", missingFields: ["input:steel"] });
    expect(
      computeLeontiefBottleneck({
        capacity: "1",
        inputs: [{ inputKey: "steel", available: null, coefficient: "0" }],
        labor: null,
      }),
    ).toMatchObject({ status: "computed", output: { numerator: "1", denominator: "1" } });
    expect(
      computeLeontiefBottleneck({
        capacity: null,
        inputs: [],
        labor: { available: null, coefficient: "1" },
      }),
    ).toEqual({ status: "missing", missingFields: ["capacity", "labor"] });
  });
  it("satisfies shortage complementarity and supply monotonicity over a grid", () => {
    for (let demand = 0; demand <= 10; demand++)
      for (let supply = 0; supply <= 10; supply++) {
        const result = computeShortage({ demand: String(demand), availableSupply: String(supply) });
        if (result.status !== "computed") throw new Error("Unexpected missing result");
        expect(BigInt(result.shortage) * BigInt(result.surplus)).toBe(0n);
        expect(BigInt(result.shortage) - BigInt(result.surplus)).toBe(BigInt(demand - supply));
      }
  });
});

describe("planner enterprise scenario hypothesis", () => {
  it("reduces neutral behavior to physical capacity and produces immutable replay", () => {
    const input = scenario();
    const before = JSON.stringify(input);
    const result = simulatePlannerEnterprise(input);
    expect(result.outputs.actualOutput).toEqual({ numerator: "100", denominator: "1" });
    expect(result.outputs.shortage.numerator).toBe("0");
    expect(result.diagnostics).toMatchObject({
      inputConservation: true,
      outputConservation: true,
      arithmetic: "exact_rational",
      modelUncertainty: "not_quantified",
    });
    expect(result).toEqual(simulatePlannerEnterprise(input));
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(result.outputs)).toBe(true);
  });
  it("separates reporting, concealment, hoarding and household stockpiling channels", () => {
    const input = scenario();
    const result = simulatePlannerEnterprise({
      ...input,
      parameters: {
        ...input.parameters,
        capacityConcealment: "0.2",
        inventoryHoarding: "0.5",
        reportingDistortion: "1",
        householdStockpiling: "0.1",
      },
    });
    expect(result.outputs.reportedCapacity.numerator).toBe("80");
    expect(result.outputs.actualOutput.numerator).toBe("40");
    expect(result.outputs.reportedOutput.numerator).toBe("80");
    expect(result.outputs.shortage.numerator).toBe("70");
    expect(result.outputs.inputConsumed.numerator).toBe("80");
    expect(result.outputs.inputUnused.numerator).toBe("80");
  });
  it("retains overrequested unused inventory and honors target bargaining", () => {
    const input = scenario();
    const result = simulatePlannerEnterprise({
      ...input,
      parameters: { ...input.parameters, inputOverRequest: "1", targetBargaining: "0.5" },
    });
    expect(result.outputs.actualOutput.numerator).toBe("50");
    expect(result.outputs.inputUnused.numerator).toBe("100");
  });
  it("compares perfect, delayed and noisy planner information explicitly", () => {
    expect(
      simulatePlannerEnterprise({ ...scenario(), informationMode: "delayed", previousDemand: "40" })
        .outputs.actualOutput.numerator,
    ).toBe("40");
    const input = scenario();
    expect(
      simulatePlannerEnterprise({
        ...input,
        informationMode: "noisy",
        parameters: { ...input.parameters, informationError: "-0.5" },
      }).outputs.actualOutput.numerator,
    ).toBe("50");
    expect(() => simulatePlannerEnterprise({ ...input, informationMode: "delayed" })).toThrow(
      "previousDemand",
    );
    expect(() =>
      simulatePlannerEnterprise({
        ...input,
        parameters: { ...input.parameters, informationError: "0.1" },
      }),
    ).toThrow("only applies");
  });
  it("retains zero-target undefined ratios and arbitrarily repeating exact output", () => {
    expect(
      simulatePlannerEnterprise({ ...scenario(), target: "0" }).outputs.actualFulfillment,
    ).toBeNull();
    expect(
      simulatePlannerEnterprise({ ...scenario(), inputAvailable: "1", inputCoefficient: "3" })
        .outputs.actualOutput,
    ).toEqual({ numerator: "1", denominator: "3" });
  });
  it("exposes sensitivity without presenting it as uncertainty or optimization", () => {
    const result = plannerEnterpriseSensitivity(scenario(), "inventoryHoarding", "0", "1");
    expect(result.lower.outputs.actualOutput.numerator).toBe("100");
    expect(result.upper.outputs.actualOutput.numerator).toBe("0");
    expect(() => plannerEnterpriseSensitivity(scenario(), "inventoryHoarding", "1", "0")).toThrow(
      "Reversed",
    );
  });
  it("rejects unsupported models, unbounded parameters, zero technology and future evidence", () => {
    const input = scenario();
    expect(() =>
      simulatePlannerEnterprise({
        ...input,
        modelVersion: "2.0.0",
      } as unknown as PlannerEnterpriseScenarioInput),
    ).toThrow("Unsupported");
    expect(() =>
      simulatePlannerEnterprise({
        ...input,
        parameters: { ...input.parameters, reportingDistortion: "-1.1" },
      }),
    ).toThrow("distortion");
    expect(() =>
      simulatePlannerEnterprise({
        ...input,
        parameters: { ...input.parameters, inventoryHoarding: "1.1" },
      }),
    ).toThrow("Probability");
    expect(() => simulatePlannerEnterprise({ ...input, inputCoefficient: "0" })).toThrow(
      "positive",
    );
    expect(() => simulatePlannerEnterprise({ ...input, assumptions: [] })).toThrow("assumptions");
    expect(() =>
      simulatePlannerEnterprise({
        ...input,
        evidenceRefs: [{ ...first(evidence), availableAt: "2026-01-01T00:00:00Z" }],
      }),
    ).toThrow("cutoff");
  });
});
