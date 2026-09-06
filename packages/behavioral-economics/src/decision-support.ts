/** Public factual decision support. Does not change the research-only scoring contract. */
export const SCENARIO_FAMILIES = [
  "inflation",
  "recession",
  "rates",
  "currency",
  "energy",
  "food",
  "equities",
  "housing",
  "credit",
  "funding",
] as const;
export type ScenarioFamily = (typeof SCENARIO_FAMILIES)[number];
export type ScenarioAudience = "household" | "business" | "investor";
export type Severity = "mild" | "moderate" | "severe";

/** Separate risk dimensions. A change in an indicator is not a calibrated crisis probability. */
export const RISK_DIMENSIONS = {
  external: ["current-account", "reserves", "short-debt-reserves", "external-debt-income"],
  banking: ["nonperforming-loans", "bank-capital", "private-credit", "lending-rate"],
  sovereign: ["government-debt", "fiscal-balance", "interest-revenue", "tax-revenue"],
  monetary: ["inflation", "money-growth", "deposit-rate", "real-interest"],
} as const;

/** Difference in source units; gaps are not turned into one-year changes. */
export function consecutiveAnnualChange(points: readonly (readonly [number, string | null])[]) {
  let previousYear = -Infinity;
  for (const [year, value] of points) {
    if (
      !Number.isSafeInteger(year) ||
      year <= previousYear ||
      (value !== null && (!value.trim() || !Number.isFinite(Number(value))))
    )
      throw new TypeError("Invalid annual history");
    previousYear = year;
  }
  const latest = [...points].reverse().find((point) => point[1] !== null);
  const previous =
    latest && points.find((point) => point[0] === latest[0] - 1 && point[1] !== null);
  if (!latest || !previous)
    return {
      availability: "unavailable" as const,
      reason: "no_consecutive_years" as const,
      difference: null,
    };
  const difference = Number(latest[1]) - Number(previous[1]);
  if (!Number.isFinite(difference))
    throw new TypeError("Annual difference is outside supported numeric range");
  return {
    availability: "available" as const,
    evidenceType: "descriptive_statistic" as const,
    from: previous[0],
    to: latest[0],
    difference,
    direction: difference > 0 ? "increased" : difference < 0 ? "decreased" : "unchanged",
    methodVersion: "consecutive-annual-difference/1.0.0",
  };
}

export const EXPOSURE_PRESETS = {
  household: {
    energyWeight: 0.1,
    foodWeight: 0.2,
    importWeight: 0.15,
    variableDebtWeight: 0.2,
    equityWeight: 0.1,
    housingWeight: 0.5,
    cashWeight: 0.2,
    bondWeight: 0.2,
    bondDuration: 4,
  },
  business: {
    energyWeight: 0.2,
    foodWeight: 0.05,
    importWeight: 0.4,
    variableDebtWeight: 0.4,
    equityWeight: 0.2,
    housingWeight: 0.2,
    cashWeight: 0.4,
    bondWeight: 0.2,
    bondDuration: 3,
  },
  investor: {
    energyWeight: 0.08,
    foodWeight: 0.15,
    importWeight: 0.2,
    variableDebtWeight: 0.1,
    equityWeight: 0.5,
    housingWeight: 0.2,
    cashWeight: 0.1,
    bondWeight: 0.2,
    bondDuration: 5,
  },
} as const;

/** Illustrative exposure assumptions; these are not estimated national spending baskets. */
export function runDecisionScenario(
  family: ScenarioFamily,
  audience: ScenarioAudience,
  severity: Severity,
) {
  if (
    !SCENARIO_FAMILIES.includes(family) ||
    !Object.hasOwn(EXPOSURE_PRESETS, audience) ||
    !["mild", "moderate", "severe"].includes(severity)
  )
    throw new TypeError("Unsupported scenario preset");
  const scale = { mild: 0.5, moderate: 1, severe: 2 }[severity];
  const exposure = EXPOSURE_PRESETS[audience];
  let costChange = 0;
  let incomeChange = 0;
  let assetChange = 0;
  let annualInterestPerDebt = 0;
  const assumptions: { channel: string; change: number; exposure: number }[] = [];
  const cost = (channel: string, shock: number, weight: number) => {
    const change = shock * scale;
    costChange += change * weight;
    assumptions.push({ channel, change, exposure: weight });
  };
  if (family === "inflation") cost("general_prices", 0.05, 1);
  if (family === "recession") {
    incomeChange = -0.05 * scale;
    assumptions.push({ channel: "income", change: incomeChange, exposure: 1 });
    cost("general_prices", -0.01, 1);
  }
  if (["rates", "credit", "funding"].includes(family)) {
    const rateShock = (family === "credit" ? 0.03 : 0.02) * scale;
    annualInterestPerDebt = rateShock * exposure.variableDebtWeight;
    assumptions.push({
      channel: "borrowing_rate",
      change: rateShock,
      exposure: exposure.variableDebtWeight,
    });
    if (family === "rates") {
      assetChange = -exposure.bondDuration * rateShock * exposure.bondWeight;
      assumptions.push({ channel: "bond_yield", change: rateShock, exposure: exposure.bondWeight });
    }
  }
  if (["currency", "funding"].includes(family)) cost("import_fx_quote", 0.1, exposure.importWeight);
  if (["energy", "funding"].includes(family)) cost("energy_prices", 0.25, exposure.energyWeight);
  if (family === "food") cost("food_prices", 0.2, exposure.foodWeight);
  if (family === "equities") {
    assetChange = -0.2 * scale * exposure.equityWeight;
    assumptions.push({
      channel: "equity_prices",
      change: -0.2 * scale,
      exposure: exposure.equityWeight,
    });
  }
  if (family === "housing") {
    assetChange = -0.15 * scale * exposure.housingWeight;
    assumptions.push({
      channel: "housing_prices",
      change: -0.15 * scale,
      exposure: exposure.housingWeight,
    });
  }
  return {
    schemaVersion: 1 as const,
    evidenceType: "scenario" as const,
    methodVersion: "exposure-arithmetic/1.0.0",
    family,
    audience,
    severity,
    baselineIndex: 100,
    exposure,
    assumptions,
    results: {
      costIndex: 100 * (1 + costChange),
      purchasingPowerIndex: (100 * (1 + incomeChange)) / (1 + costChange),
      assetValueIndex: 100 * (1 + assetChange),
      extraAnnualInterestPer100Debt: 100 * annualInterestPerDebt,
    },
    limitations: [
      "assumed_exposures",
      "constant_quantities",
      "no_estimated_pass_through",
      "no_second_round_effects",
      "not_a_forecast",
      ...(family === "rates" ? ["first_order_duration"] : []),
    ],
  };
}

export interface AllocationWeight {
  readonly instrumentId: string;
  readonly weight: number;
  readonly currency: string | null;
  readonly issuer: string | null;
  readonly country: string | null;
  readonly sector: string | null;
  readonly priceAvailable: boolean;
}
export function allocationConcentration(holdings: readonly AllocationWeight[]) {
  if (
    !holdings.length ||
    holdings.length > 200 ||
    new Set(holdings.map((h) => h.instrumentId)).size !== holdings.length
  )
    throw new TypeError("Select between 1 and 200 distinct holdings");
  if (
    holdings.some(
      (h) => !h.instrumentId || !Number.isFinite(h.weight) || h.weight < 0 || h.weight > 1,
    ) ||
    Math.abs(holdings.reduce((sum, h) => sum + h.weight, 0) - 1) > 1e-8
  )
    throw new TypeError("Allocation weights must sum to 100%");
  const group = (field: "currency" | "issuer" | "country" | "sector") => {
    const totals = new Map<string, number>();
    for (const holding of holdings) {
      const key = holding[field] ?? "unknown";
      totals.set(key, (totals.get(key) ?? 0) + holding.weight);
    }
    return [...totals]
      .map(([name, weight]) => ({ name, weight }))
      .sort((a, b) => b.weight - a.weight);
  };
  const hhi = holdings.reduce((sum, h) => sum + h.weight ** 2, 0);
  return {
    largestHolding: Math.max(...holdings.map((h) => h.weight)),
    concentrationIndex: hhi,
    effectiveHoldings: 1 / hhi,
    pricedWeight: holdings.filter((h) => h.priceAvailable).reduce((sum, h) => sum + h.weight, 0),
    unpricedHoldings: holdings
      .filter((h) => !h.priceAvailable && h.weight > 0)
      .map((h) => h.instrumentId),
    currency: group("currency"),
    issuer: group("issuer"),
    country: group("country"),
    sector: group("sector"),
  };
}
