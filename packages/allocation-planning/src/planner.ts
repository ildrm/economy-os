import { type EvidenceReference, validateEvidence } from "./contracts.js";
import {
  add,
  artifact,
  cmp,
  decimal,
  div,
  hash,
  instant,
  keys,
  list,
  mul,
  one,
  oneOf,
  probability,
  type Rational,
  ratio,
  sub,
  text,
  zero,
} from "./internals.js";

export interface PlannerEnterpriseParameters {
  readonly capacityConcealment: string;
  readonly inputOverRequest: string;
  readonly inventoryHoarding: string;
  readonly targetBargaining: string;
  readonly reportingDistortion: string;
  readonly householdStockpiling: string;
  readonly informationError: string;
}
export interface PlannerEnterpriseScenarioInput {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly scenarioId: string;
  readonly baselineSha256: string;
  readonly knowledgeCutoff: string;
  readonly modelVersion: "1.0.0";
  readonly evidenceRefs: readonly EvidenceReference[];
  readonly assumptions: readonly string[];
  readonly capacity: string;
  readonly target: string;
  readonly inputAvailable: string;
  readonly inputCoefficient: string;
  readonly householdDemand: string;
  readonly previousDemand: string | null;
  readonly informationMode: "perfect" | "delayed" | "noisy";
  readonly parameters: PlannerEnterpriseParameters;
}
const PARAMETERS = [
  "capacityConcealment",
  "inputOverRequest",
  "inventoryHoarding",
  "targetBargaining",
  "reportingDistortion",
  "householdStockpiling",
  "informationError",
] as const;
const minimum = (...values: Rational[]): Rational =>
  values.reduce((current, value) => (cmp(value, current) < 0 ? value : current), values[0] ?? zero);
/** One-period, one-enterprise, one-input hypothesis; no equilibrium or causal estimator. */
export function simulatePlannerEnterprise(input: PlannerEnterpriseScenarioInput) {
  keys(input, [
    "schemaVersion",
    "tenantId",
    "scenarioId",
    "baselineSha256",
    "knowledgeCutoff",
    "modelVersion",
    "evidenceRefs",
    "assumptions",
    "capacity",
    "target",
    "inputAvailable",
    "inputCoefficient",
    "householdDemand",
    "previousDemand",
    "informationMode",
    "parameters",
  ]);
  if (input.schemaVersion !== 1 || input.modelVersion !== "1.0.0")
    throw new TypeError("Unsupported model/schema version");
  text(input.tenantId, "tenantId");
  text(input.scenarioId, "scenarioId");
  hash(input.baselineSha256);
  instant(input.knowledgeCutoff);
  validateEvidence(input.evidenceRefs);
  if (
    input.evidenceRefs.some(
      (ref) => Date.parse(ref.availableAt) > Date.parse(input.knowledgeCutoff),
    )
  )
    throw new TypeError("Scenario evidence unavailable at cutoff");
  list(input.assumptions, 100);
  if (!input.assumptions.length) throw new TypeError("Explicit scenario assumptions required");
  for (const assumption of input.assumptions) text(assumption, "assumption");
  oneOf(input.informationMode, ["perfect", "delayed", "noisy"]);
  keys(input.parameters, PARAMETERS);
  const p = {} as Record<(typeof PARAMETERS)[number], Rational>;
  for (const key of PARAMETERS) {
    if (key === "reportingDistortion" || key === "informationError") {
      const value = decimal(input.parameters[key], false);
      if (cmp(value, sub(zero, one)) < 0 || cmp(value, one) > 0)
        throw new TypeError("Signed distortion outside [-1,1]");
      p[key] = value;
    } else p[key] = probability(input.parameters[key]);
  }
  if (input.informationMode !== "noisy" && p.informationError.n !== 0n)
    throw new TypeError("Information error only applies to noisy information mode");
  const capacity = decimal(input.capacity);
  const target = decimal(input.target);
  const inputAvailable = decimal(input.inputAvailable);
  const coefficient = decimal(input.inputCoefficient);
  if (coefficient.n === 0n) throw new TypeError("This model requires a positive input coefficient");
  const baseDemand = decimal(input.householdDemand);
  if (input.previousDemand !== null) decimal(input.previousDemand);
  if (input.informationMode === "delayed" && input.previousDemand === null)
    throw new TypeError("Delayed information requires previousDemand; missing cannot become zero");
  const perceivedDemand =
    input.informationMode === "delayed"
      ? decimal(input.previousDemand)
      : input.informationMode === "noisy"
        ? mul(baseDemand, add(one, p.informationError))
        : baseDemand;
  const reportedCapacity = mul(capacity, sub(one, p.capacityConcealment));
  const bargainedTarget = mul(target, sub(one, p.targetBargaining));
  const plannedOutput = minimum(reportedCapacity, bargainedTarget, perceivedDemand);
  const inputRequest = mul(mul(plannedOutput, coefficient), add(one, p.inputOverRequest));
  const inputAllocated = minimum(inputRequest, inputAvailable);
  const inputHoarded = mul(inputAllocated, p.inventoryHoarding);
  const usableInput = sub(inputAllocated, inputHoarded);
  const actualOutput = minimum(capacity, plannedOutput, div(usableInput, coefficient));
  const inputConsumed = mul(actualOutput, coefficient);
  const inputUnused = sub(inputAllocated, inputConsumed);
  const reportedOutput = mul(actualOutput, add(one, p.reportingDistortion));
  const demand = mul(baseDemand, add(one, p.householdStockpiling));
  const delivered = minimum(actualOutput, demand);
  const shortage = sub(demand, delivered);
  const surplus = sub(actualOutput, delivered);
  return artifact({
    schemaVersion: 1,
    kind: "scenario" as const,
    status: "simulated" as const,
    modelVersion: input.modelVersion,
    tenantId: input.tenantId,
    scenarioId: input.scenarioId,
    baselineSha256: input.baselineSha256,
    knowledgeCutoff: input.knowledgeCutoff,
    inputManifest: artifact(input),
    assumptions: [...input.assumptions],
    outputs: {
      perceivedDemand: ratio(perceivedDemand),
      reportedCapacity: ratio(reportedCapacity),
      bargainedTarget: ratio(bargainedTarget),
      plannedOutput: ratio(plannedOutput),
      inputRequest: ratio(inputRequest),
      inputAllocated: ratio(inputAllocated),
      inputHoarded: ratio(inputHoarded),
      inputConsumed: ratio(inputConsumed),
      inputUnused: ratio(inputUnused),
      actualOutput: ratio(actualOutput),
      reportedOutput: ratio(reportedOutput),
      householdDemand: ratio(demand),
      delivered: ratio(delivered),
      shortage: ratio(shortage),
      surplus: ratio(surplus),
      actualFulfillment: target.n === 0n ? null : ratio(div(actualOutput, target)),
      reportedFulfillment: target.n === 0n ? null : ratio(div(reportedOutput, target)),
    },
    diagnostics: {
      inputConservation: cmp(add(inputConsumed, inputUnused), inputAllocated) === 0,
      outputConservation: cmp(add(delivered, surplus), actualOutput) === 0,
      zeroTarget: target.n === 0n,
      arithmetic: "exact_rational" as const,
      modelUncertainty: "not_quantified" as const,
    },
    limitations: [
      "One enterprise and one essential input in one period; no substitution, network, endogenous prices, bailout rule, or equilibrium.",
      "Parameters are explicit scenario hypotheses, not estimated behavioral effects or policy recommendations.",
      "Physical output follows a bargained target cap; over-requested inputs may remain unused. Reported output never changes physical availability.",
      "No random draws; identical canonical input yields identical digest and exact results. Source references are provenance, not empirical validation.",
    ],
  });
}
export function plannerEnterpriseSensitivity(
  input: PlannerEnterpriseScenarioInput,
  parameter: keyof PlannerEnterpriseParameters,
  low: string,
  high: string,
) {
  oneOf(parameter, PARAMETERS);
  if (cmp(decimal(low, false), decimal(high, false)) > 0)
    throw new TypeError("Reversed sensitivity endpoints");
  const baseline = simulatePlannerEnterprise(input);
  const lower = simulatePlannerEnterprise({
    ...input,
    parameters: { ...input.parameters, [parameter]: low },
  });
  const upper = simulatePlannerEnterprise({
    ...input,
    parameters: { ...input.parameters, [parameter]: high },
  });
  return artifact({
    kind: "endpoint_sensitivity" as const,
    parameter,
    low,
    high,
    baseline,
    lower,
    upper,
    limitation: "Endpoint scenarios are not a confidence interval and do not prove monotonicity.",
  });
}
