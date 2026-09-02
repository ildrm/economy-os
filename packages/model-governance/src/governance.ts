import type {
  DataManifest,
  LabelManifest,
  ModelArtifactManifest,
  ModelCard,
  ModelInventory,
  ModelVersion,
} from "./artifacts.js";
import {
  assertEnum,
  assertIsoInstant,
  assertSchemaVersion,
  assertSha256,
  assertText,
  assertTexts,
  assertUuid,
  deepFreeze,
  digestJson,
  immutableWithDigest,
} from "./internals.js";
import type { ReproducibilityReceipt } from "./research.js";

export const GOVERNANCE_ROLES = [
  "model_owner",
  "model_developer",
  "data_owner",
  "independent_validator",
  "model_risk_manager",
  "deployment_approver",
  "business_owner",
  "security_privacy_legal_reviewer",
] as const;
export type GovernanceRole = (typeof GOVERNANCE_ROLES)[number];

export const APPROVAL_SCOPES = [
  "validation",
  "risk_acceptance",
  "intended_use",
  "security_privacy_legal",
  "staging_deployment",
  "production_deployment",
  "re_enable",
  "retirement",
] as const;
export type ApprovalScope = (typeof APPROVAL_SCOPES)[number];

export interface ApprovalInput {
  readonly schemaVersion: 1;
  readonly approvalId: string;
  readonly modelVersionId: string;
  readonly subjectSha256: string;
  readonly role: GovernanceRole;
  readonly scope: ApprovalScope;
  readonly principalId: string;
  readonly decision: "approved" | "rejected";
  readonly conditions: readonly string[];
  readonly decidedAt: string;
}

export interface Approval extends ApprovalInput {
  readonly manifestSha256: string;
}

const SCOPE_ROLE: Readonly<Record<ApprovalScope, GovernanceRole>> = {
  validation: "independent_validator",
  risk_acceptance: "model_risk_manager",
  intended_use: "business_owner",
  security_privacy_legal: "security_privacy_legal_reviewer",
  staging_deployment: "deployment_approver",
  production_deployment: "deployment_approver",
  re_enable: "model_risk_manager",
  retirement: "model_owner",
};

export function createApproval(input: ApprovalInput): Approval {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.approvalId, "approvalId");
  assertUuid(input.modelVersionId, "modelVersionId");
  assertSha256(input.subjectSha256, "subjectSha256");
  assertEnum(input.role, GOVERNANCE_ROLES, "role");
  assertEnum(input.scope, APPROVAL_SCOPES, "scope");
  if (SCOPE_ROLE[input.scope] !== input.role) {
    throw new TypeError(`${input.scope} must be decided by ${SCOPE_ROLE[input.scope]}`);
  }
  assertUuid(input.principalId, "principalId");
  assertEnum(input.decision, ["approved", "rejected"] as const, "decision");
  if (input.conditions.length > 100) throw new TypeError("conditions cannot exceed 100 entries");
  if (input.conditions.length > 0) assertTexts(input.conditions, "conditions", { minimum: 0 });
  assertIsoInstant(input.decidedAt, "decidedAt");
  return immutableWithDigest(input);
}

export const VALIDATION_CHECKS = [
  "model_card",
  "data_label_manifests",
  "reproducibility",
  "pit_semantics",
  "leakage",
  "chronological_design",
  "holdout",
  "calibration",
  "causal_identification",
  "robustness_sensitivity",
  "subgroup_regime",
  "security_license",
  "operational_failure_modes",
  "monitoring_runbook",
  "deployment_rollback",
] as const;
export type ValidationCheck = (typeof VALIDATION_CHECKS)[number];

export interface ValidationEvidenceInput {
  readonly schemaVersion: 1;
  readonly evidenceId: string;
  readonly modelVersionId: string;
  readonly check: ValidationCheck;
  readonly origin:
    | "empirical_observed"
    | "method_audit"
    | "operational_test"
    | "synthetic"
    | "demo";
  readonly result: "passed" | "failed";
  readonly admittedForGate: boolean;
  readonly artifactSha256: string;
  readonly performedByPrincipalId: string;
  readonly performedAt: string;
  readonly description: string;
}

export interface ValidationEvidence extends ValidationEvidenceInput {
  readonly manifestSha256: string;
}

export function createValidationEvidence(input: ValidationEvidenceInput): ValidationEvidence {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.evidenceId, "evidenceId");
  assertUuid(input.modelVersionId, "modelVersionId");
  assertEnum(input.check, VALIDATION_CHECKS, "check");
  assertEnum(
    input.origin,
    ["empirical_observed", "method_audit", "operational_test", "synthetic", "demo"] as const,
    "origin",
  );
  assertEnum(input.result, ["passed", "failed"] as const, "result");
  if (input.admittedForGate && (input.origin === "synthetic" || input.origin === "demo")) {
    throw new TypeError("synthetic/demo evidence cannot be admitted to a validation gate");
  }
  assertSha256(input.artifactSha256, "artifactSha256");
  assertUuid(input.performedByPrincipalId, "performedByPrincipalId");
  assertIsoInstant(input.performedAt, "performedAt");
  assertText(input.description, "description");
  return immutableWithDigest(input);
}

export interface ValidationCondition {
  readonly check: ValidationCheck;
  readonly status: "passed" | "failed" | "not_applicable";
  readonly evidenceIds: readonly string[];
  readonly rationale: string;
}

export interface ValidationReportInput {
  readonly schemaVersion: 1;
  readonly validationReportId: string;
  readonly modelVersionId: string;
  readonly modelVersionSha256: string;
  readonly validatorPrincipalId: string;
  readonly conditions: readonly ValidationCondition[];
  readonly reproducibilityReceiptId: string;
  readonly conclusion: "validated" | "rejected";
  readonly limitations: readonly string[];
  readonly completedAt: string;
}

export interface ValidationReport extends ValidationReportInput {
  readonly manifestSha256: string;
}

export function createValidationReport(input: ValidationReportInput): ValidationReport {
  assertSchemaVersion(input.schemaVersion);
  assertUuid(input.validationReportId, "validationReportId");
  assertUuid(input.modelVersionId, "modelVersionId");
  assertSha256(input.modelVersionSha256, "modelVersionSha256");
  assertUuid(input.validatorPrincipalId, "validatorPrincipalId");
  if (input.conditions.length === 0 || input.conditions.length > VALIDATION_CHECKS.length) {
    throw new TypeError("conditions must contain 1..15 entries");
  }
  const checks = new Set<ValidationCheck>();
  for (const [index, condition] of input.conditions.entries()) {
    assertEnum(condition.check, VALIDATION_CHECKS, `conditions[${index}].check`);
    assertEnum(
      condition.status,
      ["passed", "failed", "not_applicable"] as const,
      `conditions[${index}].status`,
    );
    if (checks.has(condition.check)) throw new TypeError("validation checks must be unique");
    checks.add(condition.check);
    if (condition.status === "not_applicable") {
      if (condition.evidenceIds.length !== 0) {
        throw new TypeError("not-applicable conditions cannot cite evidence");
      }
    } else if (condition.evidenceIds.length === 0) {
      throw new TypeError("passed/failed conditions require evidence");
    }
    const evidenceIds = new Set<string>();
    for (const evidenceId of condition.evidenceIds) {
      assertUuid(evidenceId, "condition evidenceId");
      if (evidenceIds.has(evidenceId)) throw new TypeError("condition evidenceIds must be unique");
      evidenceIds.add(evidenceId);
    }
    assertText(condition.rationale, `conditions[${index}].rationale`);
  }
  assertUuid(input.reproducibilityReceiptId, "reproducibilityReceiptId");
  assertEnum(input.conclusion, ["validated", "rejected"] as const, "conclusion");
  if (
    input.conclusion === "validated" &&
    input.conditions.some((item) => item.status === "failed")
  ) {
    throw new TypeError("a validated report cannot contain failed conditions");
  }
  assertTexts(input.limitations, "limitations");
  assertIsoInstant(input.completedAt, "completedAt");
  return immutableWithDigest(input);
}

export type GovernedClaimKind =
  | "descriptive"
  | "risk_index"
  | "uncalibrated_risk_estimate"
  | "calibrated_probability"
  | "causal_effect"
  | "production_ready";

export interface ReadinessContext {
  readonly inventory: ModelInventory;
  readonly version: ModelVersion;
  readonly card: ModelCard;
  readonly artifact: ModelArtifactManifest;
  readonly dataManifest: DataManifest;
  readonly labelManifest: LabelManifest;
  readonly report: ValidationReport | null;
  readonly evidence: readonly ValidationEvidence[];
  readonly receipt: ReproducibilityReceipt | null;
  readonly approvals: readonly Approval[];
}

export interface ReadinessResult {
  readonly ready: boolean;
  readonly blockers: readonly string[];
  readonly evaluatedEvidenceIds: readonly string[];
  readonly readinessSha256: string;
}

function requiredValidationChecks(context: ReadinessContext): readonly ValidationCheck[] {
  const required: ValidationCheck[] = [
    "model_card",
    "data_label_manifests",
    "reproducibility",
    "pit_semantics",
    "leakage",
    "robustness_sensitivity",
    "subgroup_regime",
  ];
  if (context.card.temporalTarget) required.push("chronological_design", "holdout");
  if (context.card.claimsCalibratedProbability) required.push("calibration");
  if (context.card.claimsCausalEffect) required.push("causal_identification");
  return required;
}

function approvalFor(context: ReadinessContext, scope: ApprovalScope): Approval | undefined {
  const decisions = context.approvals.filter(
    (approval) =>
      approval.modelVersionId === context.version.modelVersionId &&
      approval.subjectSha256 === context.version.manifestSha256 &&
      approval.scope === scope,
  );
  if (decisions.some((approval) => approval.decision === "rejected")) return undefined;
  return decisions.find(
    (approval) => approval.decision === "approved" && approval.conditions.length === 0,
  );
}

function validateContextBindings(context: ReadinessContext, blockers: string[]): void {
  if (context.version.modelId !== context.inventory.modelId)
    blockers.push("version_model_mismatch");
  if (
    context.card.modelId !== context.inventory.modelId ||
    context.card.modelVersion !== context.version.version ||
    context.card.manifestSha256 !== context.version.modelCardSha256
  ) {
    blockers.push("model_card_binding_mismatch");
  }
  if (
    context.artifact.modelId !== context.inventory.modelId ||
    context.artifact.modelVersion !== context.version.version ||
    context.artifact.manifestSha256 !== context.version.artifactManifestSha256
  ) {
    blockers.push("artifact_binding_mismatch");
  }
  if (context.dataManifest.manifestSha256 !== context.version.dataManifestSha256) {
    blockers.push("data_manifest_binding_mismatch");
  }
  if (
    context.labelManifest.manifestSha256 !== context.version.labelManifestSha256 ||
    context.labelManifest.manifestSha256 !== context.artifact.labelManifestSha256
  ) {
    blockers.push("label_manifest_binding_mismatch");
  }
  if (
    context.artifact.orderedFeatureKeys.join("\u0000") !==
    context.card.orderedFeatureKeys.join("\u0000")
  ) {
    blockers.push("ordered_feature_mismatch");
  }
}

export function evaluateValidationReadiness(context: ReadinessContext): ReadinessResult {
  const blockers: string[] = [];
  const evaluated = new Set<string>();
  validateContextBindings(context, blockers);
  const report = context.report;
  if (
    report === null ||
    report.modelVersionId !== context.version.modelVersionId ||
    report.modelVersionSha256 !== context.version.manifestSha256 ||
    report.conclusion !== "validated"
  ) {
    blockers.push("validated_report_missing_or_mismatched");
  } else {
    const evidenceById = new Map(context.evidence.map((item) => [item.evidenceId, item]));
    const conditionByCheck = new Map(report.conditions.map((item) => [item.check, item]));
    for (const check of requiredValidationChecks(context)) {
      const condition = conditionByCheck.get(check);
      if (condition?.status !== "passed") {
        blockers.push(`validation_check_not_passed:${check}`);
        continue;
      }
      if (condition.evidenceIds.length === 0) {
        blockers.push(`validation_check_has_no_evidence:${check}`);
      }
      for (const evidenceId of condition.evidenceIds) {
        const evidence = evidenceById.get(evidenceId);
        evaluated.add(evidenceId);
        if (
          !evidence ||
          evidence.modelVersionId !== context.version.modelVersionId ||
          evidence.check !== check ||
          evidence.result !== "passed" ||
          !evidence.admittedForGate ||
          evidence.origin === "synthetic" ||
          evidence.origin === "demo"
        ) {
          blockers.push(`invalid_gate_evidence:${check}:${evidenceId}`);
        }
      }
    }
  }
  if (
    context.receipt === null ||
    context.receipt.receiptId !== report?.reproducibilityReceiptId ||
    context.receipt.subjectType !== "model_version" ||
    context.receipt.subjectId !== context.version.modelVersionId ||
    context.receipt.result !== "passed"
  ) {
    blockers.push("passed_reproducibility_receipt_missing_or_mismatched");
  }
  const validationApproval = approvalFor(context, "validation");
  if (!validationApproval) blockers.push("independent_validation_approval_missing");
  if (
    validationApproval &&
    report &&
    validationApproval.principalId !== report.validatorPrincipalId
  ) {
    blockers.push("validation_approval_must_match_report_validator");
  }
  const highImpact =
    context.inventory.riskTier === "high" ||
    context.inventory.riskTier === "critical" ||
    context.inventory.impactTier === "high" ||
    context.inventory.impactTier === "systemic";
  if (
    highImpact &&
    (context.version.developerPrincipalIds.includes(report?.validatorPrincipalId ?? "") ||
      context.version.developerPrincipalIds.includes(validationApproval?.principalId ?? ""))
  ) {
    blockers.push("high_impact_validator_must_be_independent");
  }
  if (
    (context.card.claimsCalibratedProbability || context.card.claimsCausalEffect) &&
    (context.card.pointInTimeGrade !== "verified" ||
      context.dataManifest.snapshots.some((snapshot) => snapshot.pointInTimeGrade !== "verified"))
  ) {
    blockers.push("verified_point_in_time_inputs_required_for_claims");
  }
  if (context.card.claimsCalibratedProbability) {
    const positiveEvents = context.labelManifest.labels.reduce(
      (total, label) => total + label.positiveCount,
      0,
    );
    if (positiveEvents < context.card.minimumCalibrationEventCount) {
      blockers.push("calibration_event_count_below_model_card_minimum");
    }
  }
  const uniqueBlockers = [...new Set(blockers)].sort();
  const evaluatedEvidenceIds = [...evaluated].sort();
  return deepFreeze({
    ready: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    evaluatedEvidenceIds,
    readinessSha256: digestJson({
      modelVersionSha256: context.version.manifestSha256,
      blockers: uniqueBlockers,
      evaluatedEvidenceIds,
    }),
  });
}

export function evaluateApprovalReadiness(context: ReadinessContext): ReadinessResult {
  const validation = evaluateValidationReadiness(context);
  const blockers = [...validation.blockers];
  if (!approvalFor(context, "risk_acceptance")) blockers.push("risk_acceptance_approval_missing");
  if (!approvalFor(context, "intended_use"))
    blockers.push("business_intended_use_approval_missing");
  const uniqueBlockers = [...new Set(blockers)].sort();
  return deepFreeze({
    ready: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    evaluatedEvidenceIds: validation.evaluatedEvidenceIds,
    readinessSha256: digestJson({
      modelVersionSha256: context.version.manifestSha256,
      stage: "approval",
      blockers: uniqueBlockers,
      evidence: validation.evaluatedEvidenceIds,
    }),
  });
}

export function evaluateProductionReadiness(context: ReadinessContext): ReadinessResult {
  const approval = evaluateApprovalReadiness(context);
  const blockers = [...approval.blockers];
  for (const scope of ["security_privacy_legal", "production_deployment"] as const) {
    if (!approvalFor(context, scope)) blockers.push(`${scope}_approval_missing`);
  }
  const reportChecks = new Map(context.report?.conditions.map((item) => [item.check, item.status]));
  for (const check of [
    "security_license",
    "operational_failure_modes",
    "monitoring_runbook",
    "deployment_rollback",
  ] as const) {
    if (reportChecks.get(check) !== "passed") {
      blockers.push(`production_check_not_passed:${check}`);
      continue;
    }
    const condition = context.report?.conditions.find((item) => item.check === check);
    const backed =
      condition !== undefined &&
      condition.evidenceIds.length > 0 &&
      condition.evidenceIds.every((evidenceId) =>
        context.evidence.some(
          (item) =>
            item.evidenceId === evidenceId &&
            item.modelVersionId === context.version.modelVersionId &&
            item.check === check &&
            item.result === "passed" &&
            item.admittedForGate &&
            item.origin !== "synthetic" &&
            item.origin !== "demo",
        ),
      );
    if (!backed) blockers.push(`invalid_production_evidence:${check}`);
  }
  const productionApprover = approvalFor(context, "production_deployment");
  const validationApprover = approvalFor(context, "validation");
  const highImpact =
    ["high", "critical"].includes(context.inventory.riskTier) ||
    ["high", "systemic"].includes(context.inventory.impactTier);
  if (
    highImpact &&
    (context.version.developerPrincipalIds.includes(productionApprover?.principalId ?? "") ||
      productionApprover?.principalId === validationApprover?.principalId)
  ) {
    blockers.push("high_impact_production_approver_must_be_independent");
  }
  const uniqueBlockers = [...new Set(blockers)].sort();
  return deepFreeze({
    ready: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    evaluatedEvidenceIds: approval.evaluatedEvidenceIds,
    readinessSha256: digestJson({
      modelVersionSha256: context.version.manifestSha256,
      stage: "production",
      blockers: uniqueBlockers,
      evidence: approval.evaluatedEvidenceIds,
    }),
  });
}

export function assertClaimAuthorized(
  context: ReadinessContext,
  lifecycleStatus:
    | "proposed"
    | "research"
    | "validated"
    | "approved"
    | "staged"
    | "production"
    | "restricted"
    | "disabled"
    | "retired",
  claim: GovernedClaimKind,
): void {
  assertEnum(
    claim,
    [
      "descriptive",
      "risk_index",
      "uncalibrated_risk_estimate",
      "calibrated_probability",
      "causal_effect",
      "production_ready",
    ] as const,
    "claim",
  );
  if (
    lifecycleStatus === "proposed" ||
    lifecycleStatus === "disabled" ||
    lifecycleStatus === "retired"
  ) {
    throw new TypeError(`${lifecycleStatus} models cannot issue governed claims`);
  }
  if (claim === "production_ready") {
    if (lifecycleStatus !== "production" || !evaluateProductionReadiness(context).ready) {
      throw new TypeError("production-ready language requires a production-ready governed version");
    }
    return;
  }
  if (claim === "calibrated_probability") {
    if (!context.card.claimsCalibratedProbability) {
      throw new TypeError("model card does not permit calibrated probability language");
    }
    if (!evaluateValidationReadiness(context).ready) {
      throw new TypeError("calibrated probability requires the complete validation gate");
    }
    if (context.artifact.calibrationSnapshotSha256 === null) {
      throw new TypeError("calibrated probability requires a pinned calibration snapshot");
    }
    const positiveEvents = context.card.minimumCalibrationEventCount;
    if (positiveEvents < 1) throw new TypeError("calibration event denominator is unsupported");
    return;
  }
  if (claim === "causal_effect") {
    if (
      !context.card.claimsCausalEffect ||
      context.inventory.causalClassification !== "causal_estimate"
    ) {
      throw new TypeError("model definition does not permit causal-effect language");
    }
    if (!evaluateValidationReadiness(context).ready) {
      throw new TypeError("causal-effect language requires reviewed identification evidence");
    }
  }
}
