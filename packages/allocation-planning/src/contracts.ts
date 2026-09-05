import {
  artifact,
  decimal,
  hash,
  instant,
  integrity,
  keys,
  list,
  oneOf,
  probability,
  text,
  unique,
} from "./internals.js";

export const ALLOCATION_DIMENSIONS = [
  "state_ownership_share",
  "strategic_sector_state_control",
  "administered_price_coverage",
  "production_target_coverage",
  "mandatory_output_quota_coverage",
  "input_allocation_centralization",
  "capital_allocation_centralization",
  "directed_credit_intensity",
  "enterprise_autonomy",
  "labor_allocation_control",
  "wage_control_intensity",
  "fx_allocation_control",
  "import_allocation_control",
  "export_allocation_control",
  "rationing_coverage",
  "state_procurement_share",
  "soft_budget_constraint",
  "plan_binding_strength",
  "plan_enforcement_strength",
  "market_residual_share",
  "parallel_market_activity",
  "shortage_prevalence",
  "surplus_prevalence",
  "plan_revision_frequency",
  "reporting_distortion_risk",
  "information_centralization",
  "local_planning_autonomy",
] as const;
export const ALLOCATION_MECHANISMS = [
  "market",
  "administrative_assignment",
  "quota",
  "rationing",
  "procurement",
  "material_balance",
  "directed_credit",
  "planner_optimization",
  "strategic_reserve",
  "priority_allocation",
] as const;
export type AllocationDimension = (typeof ALLOCATION_DIMENSIONS)[number];
export interface EvidenceReference {
  readonly sourceId: string;
  readonly sourceSha256: string;
  readonly sourceUrl: string;
  readonly sourceSpan: string;
  readonly availableAt: string;
}
export interface GovernedRecord {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly id: string;
  readonly version: string;
  readonly geographyKey: string;
  readonly sectorKey: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly publishedAt: string;
  readonly availableAt: string;
  readonly admittedAt: string;
  readonly recordedAt: string;
  readonly evidenceRefs: readonly EvidenceReference[];
  readonly methodologyVersion: string;
}
const GOVERNED_KEYS = [
  "schemaVersion",
  "tenantId",
  "id",
  "version",
  "geographyKey",
  "sectorKey",
  "effectiveFrom",
  "effectiveTo",
  "publishedAt",
  "availableAt",
  "admittedAt",
  "recordedAt",
  "evidenceRefs",
  "methodologyVersion",
];
export interface AllocationReadContext {
  readonly tenantId: string;
  readonly knowledgeCutoff: string;
  readonly effectiveAt: string;
}
export function validateEvidence(refs: readonly EvidenceReference[]): void {
  list(refs, 100);
  if (!refs.length) throw new TypeError("Evidence is required");
  for (const ref of refs) {
    keys(ref, ["sourceId", "sourceSha256", "sourceUrl", "sourceSpan", "availableAt"]);
    text(ref.sourceId, "sourceId");
    hash(ref.sourceSha256);
    text(ref.sourceSpan, "sourceSpan");
    instant(ref.availableAt);
    text(ref.sourceUrl, "sourceUrl");
    const url = new URL(ref.sourceUrl);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
      throw new TypeError("Invalid source URL");
  }
}
export function validateGoverned(record: GovernedRecord, extraKeys: readonly string[]): void {
  keys(record, [...GOVERNED_KEYS, ...extraKeys]);
  if (record.schemaVersion !== 1) throw new TypeError("Unsupported schema version");
  for (const field of [
    "tenantId",
    "id",
    "version",
    "geographyKey",
    "sectorKey",
    "methodologyVersion",
  ] as const)
    text(record[field], field);
  for (const field of [
    "effectiveFrom",
    "publishedAt",
    "availableAt",
    "admittedAt",
    "recordedAt",
  ] as const)
    instant(record[field]);
  if (record.effectiveTo !== null) {
    instant(record.effectiveTo);
    if (Date.parse(record.effectiveTo) <= Date.parse(record.effectiveFrom))
      throw new TypeError("Empty effective interval");
  }
  const timeline = [
    record.publishedAt,
    record.availableAt,
    record.admittedAt,
    record.recordedAt,
  ].map(Date.parse);
  if (timeline.some((value, index) => index > 0 && value < (timeline[index - 1] ?? 0)))
    throw new TypeError("Reversed knowledge timeline");
  validateEvidence(record.evidenceRefs);
  if (
    record.evidenceRefs.some((ref) => Date.parse(ref.availableAt) > Date.parse(record.availableAt))
  )
    throw new TypeError("Evidence unavailable at record availability");
}
export function assertAllocationVisible(
  record: GovernedRecord,
  context: AllocationReadContext,
): void {
  keys(context, ["tenantId", "knowledgeCutoff", "effectiveAt"]);
  text(context.tenantId, "tenantId");
  instant(context.knowledgeCutoff);
  instant(context.effectiveAt);
  for (const time of [
    record.effectiveFrom,
    record.publishedAt,
    record.availableAt,
    record.admittedAt,
    record.recordedAt,
  ])
    instant(time);
  if (record.effectiveTo !== null) instant(record.effectiveTo);
  validateEvidence(record.evidenceRefs);
  if (record.tenantId !== context.tenantId) throw new TypeError("Tenant scope mismatch");
  const cutoff = Date.parse(context.knowledgeCutoff);
  const effective = Date.parse(context.effectiveAt);
  if (
    [
      record.publishedAt,
      record.availableAt,
      record.admittedAt,
      record.recordedAt,
      ...record.evidenceRefs.map((ref) => ref.availableAt),
    ].some((time) => Date.parse(time) > cutoff)
  )
    throw new TypeError("Record unavailable at knowledge cutoff");
  if (
    effective < Date.parse(record.effectiveFrom) ||
    (record.effectiveTo !== null && effective >= Date.parse(record.effectiveTo))
  )
    throw new TypeError("Record outside effective interval");
}
export type DimensionMeasurement =
  | {
      readonly dimension: AllocationDimension;
      readonly status: "observed" | "estimated";
      readonly value: string;
      readonly unit: string;
      readonly evidenceRefs: readonly EvidenceReference[];
      readonly uncertainty: { readonly lower: string; readonly upper: string } | null;
    }
  | {
      readonly dimension: AllocationDimension;
      readonly status: "missing";
      readonly reason: string;
    };
export interface AllocationRegimeProfileInput extends GovernedRecord {
  readonly ownership: readonly {
    readonly sectorKey: string;
    readonly assetKey: string;
    readonly kind: "private" | "cooperative" | "municipal" | "state" | "mixed" | "foreign";
    readonly coverage: string | null;
    readonly evidenceRefs: readonly EvidenceReference[];
  }[];
  readonly priceFormation: readonly {
    readonly sectorKey: string;
    readonly commodityKey: string;
    readonly mechanism:
      | "market"
      | "auction"
      | "negotiated"
      | "regulated"
      | "administered"
      | "fixed"
      | "dual_track"
      | "rationed";
    readonly evidenceRefs: readonly EvidenceReference[];
  }[];
  readonly measurements: readonly DimensionMeasurement[];
  readonly mechanisms: readonly {
    readonly sectorKey: string;
    readonly mechanism: (typeof ALLOCATION_MECHANISMS)[number];
    readonly decisionActor: string;
    readonly decisionRight:
      | "production"
      | "investment"
      | "pricing"
      | "employment"
      | "credit"
      | "imports"
      | "exports"
      | "fx"
      | "capital_expenditure";
  }[];
}
export type AllocationRegimeProfile = AllocationRegimeProfileInput & {
  readonly manifestSha256: string;
};
export function createAllocationRegimeProfile(
  input: AllocationRegimeProfileInput,
): AllocationRegimeProfile {
  validateGoverned(input, ["ownership", "priceFormation", "measurements", "mechanisms"]);
  list(input.ownership, 1000);
  list(input.priceFormation, 1000);
  for (const item of input.ownership) {
    keys(item, ["sectorKey", "assetKey", "kind", "coverage", "evidenceRefs"]);
    text(item.sectorKey, "sectorKey");
    text(item.assetKey, "assetKey");
    oneOf(item.kind, ["private", "cooperative", "municipal", "state", "mixed", "foreign"]);
    if (item.coverage !== null) probability(item.coverage);
    validateEvidence(item.evidenceRefs);
  }
  for (const item of input.priceFormation) {
    keys(item, ["sectorKey", "commodityKey", "mechanism", "evidenceRefs"]);
    text(item.sectorKey, "sectorKey");
    text(item.commodityKey, "commodityKey");
    oneOf(item.mechanism, [
      "market",
      "auction",
      "negotiated",
      "regulated",
      "administered",
      "fixed",
      "dual_track",
      "rationed",
    ]);
    validateEvidence(item.evidenceRefs);
  }
  if (
    [...input.ownership, ...input.priceFormation].some((item) =>
      item.evidenceRefs.some((ref) => Date.parse(ref.availableAt) > Date.parse(input.availableAt)),
    )
  )
    throw new TypeError("Regime evidence unavailable");
  list(input.measurements, 1000);
  unique(
    input.measurements.map((item) =>
      item.status === "missing"
        ? `${item.dimension}:missing`
        : `${item.dimension}:${item.status}:${item.evidenceRefs
            .map((ref) => `${ref.sourceId}:${ref.sourceSha256}`)
            .sort()
            .join(",")}`,
    ),
  );
  for (const dimension of ALLOCATION_DIMENSIONS) {
    const matching = input.measurements.filter((item) => item.dimension === dimension);
    if (matching.length > 1 && matching.some((item) => item.status === "missing"))
      throw new TypeError("Missing and measured dimension conflict");
  }
  for (const item of input.measurements) {
    oneOf(item.dimension, ALLOCATION_DIMENSIONS);
    oneOf(item.status, ["observed", "estimated", "missing"]);
    if (item.status === "missing") {
      keys(item, ["dimension", "status", "reason"]);
      text(item.reason, "reason");
    } else {
      keys(item, ["dimension", "status", "value", "unit", "evidenceRefs", "uncertainty"]);
      const value = decimal(item.value);
      text(item.unit, "unit");
      validateEvidence(item.evidenceRefs);
      if (
        item.evidenceRefs.some((ref) => Date.parse(ref.availableAt) > Date.parse(input.availableAt))
      )
        throw new TypeError("Measurement evidence unavailable");
      if (item.uncertainty !== null) {
        keys(item.uncertainty, ["lower", "upper"]);
        const lower = decimal(item.uncertainty.lower);
        const upper = decimal(item.uncertainty.upper);
        if (lower.n * value.d > value.n * lower.d || upper.n * value.d < value.n * upper.d)
          throw new TypeError("Uncertainty interval excludes measurement");
      }
      if (item.unit === "share") {
        probability(item.value);
        if (item.uncertainty !== null) {
          probability(item.uncertainty.lower);
          probability(item.uncertainty.upper);
        }
      }
    }
  }
  list(input.mechanisms, 100);
  for (const mechanism of input.mechanisms) {
    keys(mechanism, ["sectorKey", "mechanism", "decisionActor", "decisionRight"]);
    text(mechanism.sectorKey, "sectorKey");
    text(mechanism.decisionActor, "decisionActor");
    oneOf(mechanism.mechanism, ALLOCATION_MECHANISMS);
    oneOf(mechanism.decisionRight, [
      "production",
      "investment",
      "pricing",
      "employment",
      "credit",
      "imports",
      "exports",
      "fx",
      "capital_expenditure",
    ]);
  }
  // Every unmeasured dimension is explicit; no missing-as-neutral imputation.
  const present = new Set(input.measurements.map((item) => item.dimension));
  return artifact({
    ...input,
    measurements: [
      ...input.measurements,
      ...ALLOCATION_DIMENSIONS.filter((dimension) => !present.has(dimension)).map((dimension) => ({
        dimension,
        status: "missing" as const,
        reason: "No admitted measurement",
      })),
    ].sort((a, b) => a.dimension.localeCompare(b.dimension)),
  });
}
export interface PlanTarget {
  readonly targetId: string;
  readonly commodityKey: string;
  readonly unit: string;
  readonly target: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly enterpriseKey: string | null;
  readonly evidenceRefs: readonly EvidenceReference[];
}
export const CONTROL_KINDS = [
  "allocation_directive",
  "production_quota",
  "input_quota",
  "administered_price",
  "rationing_program",
  "procurement_mandate",
  "credit_directive",
  "investment_directive",
] as const;
export interface AllocationControl {
  readonly controlId: string;
  readonly kind: (typeof CONTROL_KINDS)[number];
  readonly targetId: string | null;
  readonly commodityKey: string;
  readonly value: string;
  readonly unit: string;
  readonly binding: "mandatory" | "indicative";
  readonly evidenceRefs: readonly EvidenceReference[];
}
export interface EconomicPlanVersionInput extends GovernedRecord {
  readonly planId: string;
  readonly previousVersionSha256: string | null;
  readonly authority: { readonly authorityId: string; readonly name: string };
  readonly objectives: readonly { readonly objectiveId: string; readonly description: string }[];
  readonly targets: readonly PlanTarget[];
  readonly controls: readonly AllocationControl[];
}
export type EconomicPlanVersion = EconomicPlanVersionInput & { readonly manifestSha256: string };
export function createEconomicPlanVersion(input: EconomicPlanVersionInput): EconomicPlanVersion {
  validateGoverned(input, [
    "planId",
    "previousVersionSha256",
    "authority",
    "objectives",
    "targets",
    "controls",
  ]);
  text(input.planId, "planId");
  if (input.previousVersionSha256 !== null) hash(input.previousVersionSha256);
  keys(input.authority, ["authorityId", "name"]);
  text(input.authority.authorityId, "authorityId");
  text(input.authority.name, "authority name");
  list(input.objectives, 100);
  unique(input.objectives.map((item) => item.objectiveId));
  for (const objective of input.objectives) {
    keys(objective, ["objectiveId", "description"]);
    text(objective.objectiveId, "objectiveId");
    text(objective.description, "description");
  }
  list(input.targets);
  unique(input.targets.map((item) => item.targetId));
  for (const target of input.targets) {
    keys(target, [
      "targetId",
      "commodityKey",
      "unit",
      "target",
      "periodStart",
      "periodEnd",
      "enterpriseKey",
      "evidenceRefs",
    ]);
    for (const field of ["targetId", "commodityKey", "unit"] as const) text(target[field], field);
    decimal(target.target);
    instant(target.periodStart);
    instant(target.periodEnd);
    if (Date.parse(target.periodStart) >= Date.parse(target.periodEnd))
      throw new TypeError("Target period is empty");
    if (target.enterpriseKey !== null) text(target.enterpriseKey, "enterpriseKey");
    validateEvidence(target.evidenceRefs);
  }
  list(input.controls);
  unique(input.controls.map((item) => item.controlId));
  for (const control of input.controls) {
    keys(control, [
      "controlId",
      "kind",
      "targetId",
      "commodityKey",
      "value",
      "unit",
      "binding",
      "evidenceRefs",
    ]);
    text(control.controlId, "controlId");
    oneOf(control.kind, CONTROL_KINDS);
    oneOf(control.binding, ["mandatory", "indicative"]);
    if (
      control.targetId !== null &&
      !input.targets.some((target) => target.targetId === control.targetId)
    )
      throw new TypeError("Dangling control target");
    text(control.commodityKey, "commodityKey");
    text(control.unit, "unit");
    decimal(control.value);
    validateEvidence(control.evidenceRefs);
  }
  if (
    [...input.targets, ...input.controls].some((item) =>
      item.evidenceRefs.some((ref) => Date.parse(ref.availableAt) > Date.parse(input.availableAt)),
    )
  )
    throw new TypeError("Plan evidence unavailable");
  return artifact(input);
}
export function assertPlanIntegrity(plan: EconomicPlanVersion): void {
  integrity(plan);
  const { manifestSha256: _digest, ...body } = plan;
  createEconomicPlanVersion(body);
}
