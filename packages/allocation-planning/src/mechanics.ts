import {
  type AllocationReadContext,
  assertAllocationVisible,
  assertPlanIntegrity,
  type EconomicPlanVersion,
  type EvidenceReference,
  type GovernedRecord,
  validateEvidence,
  validateGoverned,
} from "./contracts.js";
import {
  add,
  artifact,
  cmp,
  decimal,
  div,
  type ExactRatio,
  format,
  hash,
  instant,
  integrity,
  keys,
  list,
  oneOf,
  type Rational,
  ratio,
  sub,
  text,
  unique,
  zero,
} from "./internals.js";

export type MissingResult = {
  readonly status: "missing";
  readonly missingFields: readonly string[];
};
export interface MaterialBalanceInput {
  readonly commodityKey: string;
  readonly unit: string;
  readonly production: string | null;
  readonly imports: string | null;
  readonly openingInventory: string | null;
  readonly intermediateDemand: string | null;
  readonly householdDemand: string | null;
  readonly governmentDemand: string | null;
  readonly investmentDemand: string | null;
  readonly exports: string | null;
  readonly closingInventory: string | null;
}
const SUPPLY = ["production", "imports", "openingInventory"] as const;
const USES = [
  "intermediateDemand",
  "householdDemand",
  "governmentDemand",
  "investmentDemand",
  "exports",
  "closingInventory",
] as const;
export function computeMaterialBalance(input: MaterialBalanceInput):
  | MissingResult
  | {
      readonly status: "computed";
      readonly commodityKey: string;
      readonly unit: string;
      readonly supply: string;
      readonly uses: string;
      readonly imbalance: string;
      readonly shortage: string;
      readonly surplus: string;
    } {
  keys(input, ["commodityKey", "unit", ...SUPPLY, ...USES]);
  text(input.commodityKey, "commodityKey");
  text(input.unit, "unit");
  const missingFields: string[] = [];
  for (const field of [...SUPPLY, ...USES]) {
    if (input[field] === null) missingFields.push(field);
    else decimal(input[field]);
  }
  if (missingFields.length) return { status: "missing", missingFields };
  const supply = SUPPLY.reduce((sum, field) => add(sum, decimal(input[field])), zero);
  const uses = USES.reduce((sum, field) => add(sum, decimal(input[field])), zero);
  const imbalance = sub(supply, uses);
  return {
    status: "computed",
    commodityKey: input.commodityKey,
    unit: input.unit,
    supply: format(supply),
    uses: format(uses),
    imbalance: format(imbalance),
    shortage: format(cmp(imbalance, zero) < 0 ? sub(zero, imbalance) : zero),
    surplus: format(cmp(imbalance, zero) > 0 ? imbalance : zero),
  };
}
export function computeShortage(input: {
  readonly demand: string | null;
  readonly availableSupply: string | null;
}):
  | MissingResult
  | { readonly status: "computed"; readonly shortage: string; readonly surplus: string } {
  keys(input, ["demand", "availableSupply"]);
  const missingFields: string[] = [];
  for (const field of ["demand", "availableSupply"] as const) {
    if (input[field] === null) missingFields.push(field);
    else decimal(input[field]);
  }
  if (missingFields.length) return { status: "missing", missingFields };
  const gap = sub(decimal(input.demand), decimal(input.availableSupply));
  return {
    status: "computed",
    shortage: format(cmp(gap, zero) > 0 ? gap : zero),
    surplus: format(cmp(gap, zero) < 0 ? sub(zero, gap) : zero),
  };
}
export function computeParallelMarketPremium(input: {
  readonly officialPrice: string | null;
  readonly parallelPrice: string | null;
  readonly evidenceRefs: readonly EvidenceReference[];
}):
  | MissingResult
  | { readonly status: "undefined"; readonly reason: "zero_official_price" }
  | {
      readonly status: "computed";
      readonly premium: ExactRatio;
      readonly interpretation: "price_difference_only";
    } {
  keys(input, ["officialPrice", "parallelPrice", "evidenceRefs"]);
  validateEvidence(input.evidenceRefs);
  const missingFields: string[] = [];
  for (const field of ["officialPrice", "parallelPrice"] as const) {
    if (input[field] === null) missingFields.push(field);
    else decimal(input[field]);
  }
  if (missingFields.length) return { status: "missing", missingFields };
  const official = decimal(input.officialPrice);
  const parallel = decimal(input.parallelPrice);
  if (official.n === 0n) return { status: "undefined", reason: "zero_official_price" };
  return {
    status: "computed",
    premium: ratio(div(sub(parallel, official), official)),
    interpretation: "price_difference_only",
  };
}
export interface BottleneckInput {
  readonly capacity: string | null;
  readonly inputs: readonly {
    readonly inputKey: string;
    readonly available: string | null;
    readonly coefficient: string;
  }[];
  /** Null explicitly means no labor constraint in this specification. Unknown labor uses available:null. */
  readonly labor: { readonly available: string | null; readonly coefficient: string } | null;
}
export function computeLeontiefBottleneck(input: BottleneckInput):
  | MissingResult
  | {
      readonly status: "computed";
      readonly output: ExactRatio;
      readonly bindingConstraints: readonly string[];
    } {
  keys(input, ["capacity", "inputs", "labor"]);
  list(input.inputs, 1000);
  unique(input.inputs.map((item) => item.inputKey));
  const missingFields: string[] = [];
  const bounds: { key: string; value: Rational }[] = [];
  if (input.capacity === null) missingFields.push("capacity");
  else bounds.push({ key: "capacity", value: decimal(input.capacity) });
  const include = (key: string, available: string | null, coefficient: string) => {
    const c = decimal(coefficient);
    if (available !== null) decimal(available);
    if (c.n === 0n) return; // A known zero technology coefficient consumes no input.
    if (available === null) missingFields.push(key);
    else bounds.push({ key, value: div(decimal(available), c) });
  };
  for (const item of input.inputs) {
    keys(item, ["inputKey", "available", "coefficient"]);
    text(item.inputKey, "inputKey");
    include(`input:${item.inputKey}`, item.available, item.coefficient);
  }
  if (input.labor !== null) {
    keys(input.labor, ["available", "coefficient"]);
    include("labor", input.labor.available, input.labor.coefficient);
  }
  if (missingFields.length) return { status: "missing", missingFields };
  const minimum = bounds.reduce(
    (current, item) => (cmp(item.value, current) < 0 ? item.value : current),
    bounds[0]?.value ?? zero,
  );
  return {
    status: "computed",
    output: ratio(minimum),
    bindingConstraints: bounds
      .filter((item) => cmp(item.value, minimum) === 0)
      .map((item) => item.key)
      .sort(),
  };
}
export interface PlanActualInput extends GovernedRecord {
  readonly targetId: string;
  readonly planVersionSha256: string;
  readonly commodityKey: string;
  readonly unit: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly value: string;
  readonly actualKind:
    | "officially_reported_actual"
    | "independent_estimate"
    | "reconstructed_actual";
}
export type PlanActual = PlanActualInput & { readonly manifestSha256: string };
export function createPlanActual(input: PlanActualInput): PlanActual {
  validateGoverned(input, [
    "targetId",
    "planVersionSha256",
    "commodityKey",
    "unit",
    "periodStart",
    "periodEnd",
    "value",
    "actualKind",
  ]);
  text(input.targetId, "targetId");
  text(input.commodityKey, "commodityKey");
  text(input.unit, "unit");
  decimal(input.value);
  oneOf(input.actualKind, [
    "officially_reported_actual",
    "independent_estimate",
    "reconstructed_actual",
  ]);
  // The exact period/digest are checked against the target by the projection.
  instant(input.periodStart);
  instant(input.periodEnd);
  if (Date.parse(input.periodStart) >= Date.parse(input.periodEnd))
    throw new TypeError("Actual period is empty");
  if (Date.parse(input.periodEnd) > Date.parse(input.publishedAt))
    throw new TypeError("Actual requires a completed reporting period before publication");
  hash(input.planVersionSha256);
  return artifact(input);
}
export function projectPlanFulfillment(
  plan: EconomicPlanVersion,
  actuals: readonly (PlanActualInput | PlanActual)[],
  context: AllocationReadContext,
) {
  assertPlanIntegrity(plan);
  assertAllocationVisible(plan, context);
  list(actuals, 1000);
  unique(actuals.map((item) => `${item.id}:${item.version}`));
  for (const actual of actuals) {
    if ("manifestSha256" in actual) {
      integrity(actual);
      const { manifestSha256: _digest, ...body } = actual;
      createPlanActual(body);
    } else createPlanActual(actual);
    assertAllocationVisible(actual, context);
    if (
      actual.planVersionSha256 !== plan.manifestSha256 ||
      actual.geographyKey !== plan.geographyKey ||
      actual.sectorKey !== plan.sectorKey
    )
      throw new TypeError("Actual scope or plan version mismatch");
    const target = plan.targets.find((target) => target.targetId === actual.targetId);
    if (
      !target ||
      actual.unit !== target.unit ||
      actual.commodityKey !== target.commodityKey ||
      actual.periodStart !== target.periodStart ||
      actual.periodEnd !== target.periodEnd
    )
      throw new TypeError("Actual and target are not comparable");
  }
  return artifact({
    schemaVersion: 1,
    kind: "plan_fulfillment" as const,
    planVersionSha256: plan.manifestSha256,
    context,
    targets: plan.targets.map((target) => ({
      targetId: target.targetId,
      target: target.target,
      unit: target.unit,
      actuals: actuals
        .filter((actual) => actual.targetId === target.targetId)
        .map((actual) => ({
          id: actual.id,
          version: actual.version,
          actualKind: actual.actualKind,
          value: actual.value,
          evidenceRefs: actual.evidenceRefs,
          availableAt: actual.availableAt,
          recordedAt: actual.recordedAt,
          fulfillment:
            decimal(target.target).n === 0n
              ? { status: "undefined" as const, reason: "zero_target" as const }
              : {
                  status: "computed" as const,
                  ratio: ratio(div(decimal(actual.value), decimal(target.target))),
                },
        })),
      coverage: actuals.some((actual) => actual.targetId === target.targetId)
        ? ("available" as const)
        : ("missing" as const),
    })),
  });
}
