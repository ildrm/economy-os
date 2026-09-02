import { describe, expect, it } from "vitest";
import {
  APPROVER,
  ARTIFACT,
  ASSESSED_AT,
  ASSESSOR,
  type Mutable,
  OTHER_TENANT,
  RELEASE_ID,
  readyAssessment,
  readyFixture,
  replaceEvidence,
  TENANT,
} from "./fixtures.test-helper.js";
import {
  assertEnterpriseReleaseApproval,
  assertEnterpriseReleaseAssessment,
  assertEnterpriseReleaseRevocation,
  assessEnterpriseRelease,
  type EnterpriseEvidenceInput,
  type EnterpriseReleaseApprovalBody,
  type EnterpriseReleaseApprovalInput,
  type EnterpriseReleaseAssessment,
  type EnterpriseReleaseAssessmentBody,
  type EnterpriseReleaseRevocationInput,
  type EvidenceKind,
  isEnterpriseReleaseAuthorized,
  recordEnterpriseReleaseApproval,
  recordEnterpriseReleaseRevocation,
  replayEnterpriseAssessment,
} from "./index.js";
import { manifest } from "./internals.js";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("required fixture item is missing");
  return value;
}

function approvalInput(overrides: Partial<EnterpriseReleaseApprovalInput> = {}) {
  return {
    schemaVersion: 1,
    approvalId: "11111111-1111-4111-8111-111111111150",
    assessmentManifestSha256: "0".repeat(64),
    tenantId: TENANT,
    decision: "approve",
    rationale: "All bounded enterprise evidence gates passed independent review.",
    approver: APPROVER,
    decidedAt: "2026-06-01T00:10:00Z",
    expiresAt: "2026-07-01T00:00:00Z",
    ...overrides,
  } satisfies EnterpriseReleaseApprovalInput;
}

function gate(assessment: EnterpriseReleaseAssessment, name: EvidenceKind | "topology") {
  const result = assessment.gates.find((item) => item.gate === name);
  if (!result) throw new Error(`missing gate ${name}`);
  return result;
}

interface GateFailureCase {
  readonly name: string;
  readonly kind: EvidenceKind;
  readonly code: string;
  readonly mutate: (input: Mutable<EnterpriseEvidenceInput>) => void;
}

const GATE_FAILURE_CASES: readonly GateFailureCase[] = [
  {
    name: "unpassed evidence",
    kind: "identity_access",
    code: "evidence.result_not_passed",
    mutate: (input) => {
      input.envelope.result = "failed";
    },
  },
  {
    name: "unaccepted limitation",
    kind: "identity_access",
    code: "evidence.unaccepted_limitations",
    mutate: (input) => {
      input.envelope.limitations = ["control scope omitted privileged users"];
    },
  },
  {
    name: "revoked evidence",
    kind: "identity_access",
    code: "evidence.revoked",
    mutate: (input) => {
      input.envelope.revokedAt = "2026-05-31T23:30:00Z";
      input.envelope.revocationReason = "assurance provider withdrew the result";
    },
  },
  {
    name: "tenant mismatch",
    kind: "identity_access",
    code: "evidence.tenant_mismatch",
    mutate: (input) => {
      input.envelope.tenantId = OTHER_TENANT;
      input.envelope.producer.tenantId = OTHER_TENANT;
      input.envelope.reviewer.tenantId = OTHER_TENANT;
    },
  },
  {
    name: "artifact mismatch",
    kind: "identity_access",
    code: "evidence.release_artifact_mismatch",
    mutate: (input) => {
      input.envelope.releaseArtifactSha256 = "f".repeat(64);
    },
  },
  {
    name: "policy drift",
    kind: "identity_access",
    code: "evidence.policy_drift",
    mutate: (input) => {
      input.envelope.policyManifestSha256 = "f".repeat(64);
    },
  },
  {
    name: "topology drift",
    kind: "identity_access",
    code: "evidence.topology_drift",
    mutate: (input) => {
      input.envelope.topologyManifestSha256 = "f".repeat(64);
    },
  },
  {
    name: "future completion",
    kind: "identity_access",
    code: "evidence.completed_in_future",
    mutate: (input) => {
      input.envelope.completedAt = "2026-06-02T00:00:00Z";
      input.envelope.verification.verifiedAt = "2026-06-02T00:01:00Z";
    },
  },
  {
    name: "stale completion",
    kind: "identity_access",
    code: "evidence.too_old",
    mutate: (input) => {
      input.envelope.startedAt = "2025-05-29T00:00:00Z";
      input.envelope.completedAt = "2025-05-30T00:00:00Z";
      input.envelope.verification.verifiedAt = "2025-05-30T01:00:00Z";
    },
  },
  {
    name: "insufficient validity",
    kind: "identity_access",
    code: "evidence.expired_or_expiring",
    mutate: (input) => {
      input.envelope.expiresAt = "2026-06-01T00:30:00Z";
    },
  },
  {
    name: "future verification",
    kind: "identity_access",
    code: "evidence.verification_in_future",
    mutate: (input) => {
      input.envelope.verification.verifiedAt = "2026-06-01T00:01:00Z";
    },
  },
  {
    name: "SAML cases",
    kind: "identity_access",
    code: "identity.saml_cases_failed_or_insufficient",
    mutate: (input) => {
      if (input.payload.kind === "identity_access") input.payload.saml.attempts = 5;
    },
  },
  {
    name: "SAML control",
    kind: "identity_access",
    code: "identity.saml_control_failed",
    mutate: (input) => {
      if (input.payload.kind === "identity_access")
        input.payload.saml.signedAssertionEnforced = false;
    },
  },
  {
    name: "SAML encryption",
    kind: "identity_access",
    code: "identity.encryption_not_enforced",
    mutate: (input) => {
      if (input.payload.kind === "identity_access")
        input.payload.saml.encryptedAssertionEnforced = false;
    },
  },
  {
    name: "MFA cases",
    kind: "identity_access",
    code: "identity.mfa_cases_failed_or_insufficient",
    mutate: (input) => {
      if (input.payload.kind === "identity_access") input.payload.mfa.attempts = 2;
    },
  },
  {
    name: "MFA control",
    kind: "identity_access",
    code: "identity.mfa_control_failed",
    mutate: (input) => {
      if (input.payload.kind === "identity_access") input.payload.mfa.requiredForAllUsers = false;
    },
  },
  {
    name: "step-up coverage",
    kind: "identity_access",
    code: "identity.step_up_incomplete",
    mutate: (input) => {
      if (input.payload.kind === "identity_access") input.payload.mfa.testedStepUpActions.pop();
    },
  },
  {
    name: "session cases",
    kind: "identity_access",
    code: "identity.session_cases_failed_or_insufficient",
    mutate: (input) => {
      if (input.payload.kind === "identity_access") input.payload.session.attempts = 4;
    },
  },
  {
    name: "session control",
    kind: "identity_access",
    code: "identity.session_control_failed",
    mutate: (input) => {
      if (input.payload.kind === "identity_access")
        input.payload.session.refreshReuseRejected = false;
    },
  },
  {
    name: "session revocation",
    kind: "identity_access",
    code: "identity.revocation_target_missed",
    mutate: (input) => {
      if (input.payload.kind === "identity_access")
        input.payload.session.maximumObservedRevocationSeconds = 61;
    },
  },
  {
    name: "SCIM failure",
    kind: "scim_lifecycle",
    code: "scim.lifecycle_failure",
    mutate: (input) => {
      if (input.payload.kind === "scim_lifecycle") input.payload.failures = 1;
    },
  },
  {
    name: "SCIM provisioning",
    kind: "scim_lifecycle",
    code: "scim.provisioning_target_missed",
    mutate: (input) => {
      if (input.payload.kind === "scim_lifecycle") input.payload.maximumProvisionSeconds = 301;
    },
  },
  {
    name: "SCIM deprovisioning",
    kind: "scim_lifecycle",
    code: "scim.deprovisioning_target_missed",
    mutate: (input) => {
      if (input.payload.kind === "scim_lifecycle") input.payload.maximumDeprovisionSeconds = 61;
    },
  },
  {
    name: "SCIM reconciliation",
    kind: "scim_lifecycle",
    code: "scim.reconciliation_target_missed",
    mutate: (input) => {
      if (input.payload.kind === "scim_lifecycle")
        input.payload.maximumReconciliationSeconds = 3_601;
    },
  },
  {
    name: "SCIM control",
    kind: "scim_lifecycle",
    code: "scim.control_failed",
    mutate: (input) => {
      if (input.payload.kind === "scim_lifecycle") input.payload.invalidMappingRejected = false;
    },
  },
  {
    name: "residency mode",
    kind: "residency_deployment",
    code: "residency.deployment_mode_mismatch",
    mutate: (input) => {
      if (input.payload.kind === "residency_deployment")
        input.payload.deploymentMode = "shared_saas";
    },
  },
  {
    name: "residency contract",
    kind: "residency_deployment",
    code: "residency.deployment_contract_mismatch",
    mutate: (input) => {
      if (input.payload.kind === "residency_deployment")
        input.payload.deploymentContractSha256 = "f".repeat(64);
    },
  },
  {
    name: "residency route",
    kind: "residency_deployment",
    code: "residency.route_observation_mismatch",
    mutate: (input) => {
      if (input.payload.kind === "residency_deployment")
        required(input.payload.observedRoutes[0]).storageRegions = ["eu-central-1"];
    },
  },
  {
    name: "residency control",
    kind: "residency_deployment",
    code: "residency.control_failed",
    mutate: (input) => {
      if (input.payload.kind === "residency_deployment")
        input.payload.crossRegionDenialsPassed = false;
    },
  },
  {
    name: "residency provider mode",
    kind: "residency_deployment",
    code: "residency.provider_mode_mismatch",
    mutate: (input) => {
      if (input.payload.kind === "residency_deployment")
        input.payload.providerIntegrationsMode = "disabled";
    },
  },
  {
    name: "recovery domain count",
    kind: "recovery_exercise",
    code: "recovery.failure_domain_coverage_insufficient",
    mutate: (input) => {
      if (input.payload.kind === "recovery_exercise") input.payload.testedFailureDomains.pop();
    },
  },
  {
    name: "recovery unknown domain",
    kind: "recovery_exercise",
    code: "recovery.unknown_failure_domain",
    mutate: (input) => {
      if (input.payload.kind === "recovery_exercise")
        input.payload.testedFailureDomains[0] = "eu-west-1d";
    },
  },
  {
    name: "recovery RPO",
    kind: "recovery_exercise",
    code: "recovery.rpo_target_missed",
    mutate: (input) => {
      if (input.payload.kind === "recovery_exercise")
        input.payload.recoveredThroughAt = "2026-05-31T21:50:00Z";
    },
  },
  {
    name: "recovery RTO",
    kind: "recovery_exercise",
    code: "recovery.rto_target_missed",
    mutate: (input) => {
      if (input.payload.kind === "recovery_exercise")
        input.payload.disruptionDetectedAt = "2026-05-31T20:00:00Z";
    },
  },
  {
    name: "recovery records",
    kind: "recovery_exercise",
    code: "recovery.record_integrity_failed",
    mutate: (input) => {
      if (input.payload.kind === "recovery_exercise") input.payload.missingRecords = 1;
    },
  },
  {
    name: "recovery semantics",
    kind: "recovery_exercise",
    code: "recovery.semantic_integrity_failed",
    mutate: (input) => {
      if (input.payload.kind === "recovery_exercise")
        input.payload.pointInTimeSemanticsVerified = false;
    },
  },
  {
    name: "backup manifest",
    kind: "backup_restore",
    code: "backup.manifest_mismatch",
    mutate: (input) => {
      if (input.payload.kind === "backup_restore")
        input.payload.restoredManifestSha256 = "0".repeat(64);
    },
  },
  {
    name: "backup object integrity",
    kind: "backup_restore",
    code: "backup.object_integrity_failed",
    mutate: (input) => {
      if (input.payload.kind === "backup_restore") input.payload.corruptObjects = 1;
    },
  },
  {
    name: "backup point in time",
    kind: "backup_restore",
    code: "backup.point_in_time_target_missed",
    mutate: (input) => {
      if (input.payload.kind === "backup_restore")
        input.payload.restoredPointInTime = "2026-05-31T21:00:00Z";
    },
  },
  {
    name: "backup control",
    kind: "backup_restore",
    code: "backup.control_failed",
    mutate: (input) => {
      if (input.payload.kind === "backup_restore") input.payload.encryptedAtRestVerified = false;
    },
  },
  {
    name: "nonproduction SLO",
    kind: "slo_window",
    code: "slo.not_production_observation",
    mutate: (input) => {
      input.envelope.environment = "production_shaped_staging";
    },
  },
  {
    name: "short SLO window",
    kind: "slo_window",
    code: "slo.window_too_short",
    mutate: (input) => {
      if (input.payload.kind === "slo_window") input.payload.windowStart = "2026-05-30T23:00:01Z";
    },
  },
  {
    name: "SLO service coverage",
    kind: "slo_window",
    code: "slo.service_coverage_mismatch",
    mutate: (input) => {
      if (input.payload.kind === "slo_window")
        required(input.payload.metrics[0]).service = "other-api";
    },
  },
  {
    name: "SLO objective",
    kind: "slo_window",
    code: "slo.objective_below_policy",
    mutate: (input) => {
      if (input.payload.kind === "slo_window")
        required(input.payload.metrics[0]).objectiveBps = 9_899;
    },
  },
  {
    name: "SLO budget",
    kind: "slo_window",
    code: "slo.error_budget_exhausted",
    mutate: (input) => {
      if (input.payload.kind === "slo_window")
        required(input.payload.metrics[0]).goodEvents = 99_000;
    },
  },
  {
    name: "SLO latency",
    kind: "slo_window",
    code: "slo.latency_target_missed",
    mutate: (input) => {
      if (input.payload.kind === "slo_window")
        required(input.payload.metrics[0]).p95LatencyMilliseconds = 1_001;
    },
  },
  {
    name: "load throughput",
    kind: "load_capacity",
    code: "load.throughput_target_missed",
    mutate: (input) => {
      if (input.payload.kind === "load_capacity")
        input.payload.observedResults.sustainedRequestsPerSecond = 90;
    },
  },
  {
    name: "load artifact",
    kind: "load_capacity",
    code: "load.release_artifact_mismatch",
    mutate: (input) => {
      if (input.payload.kind === "load_capacity")
        input.payload.declaredWorkload.commitSha256 = "f".repeat(64);
    },
  },
  {
    name: "load sample coverage",
    kind: "load_capacity",
    code: "load.sample_coverage_insufficient",
    mutate: (input) => {
      if (input.payload.kind === "load_capacity") input.payload.observedResults.samples = 1;
    },
  },
  {
    name: "load p95",
    kind: "load_capacity",
    code: "load.p95_target_missed",
    mutate: (input) => {
      if (input.payload.kind === "load_capacity")
        input.payload.observedResults.p95Milliseconds = 1_100;
    },
  },
  {
    name: "load p99",
    kind: "load_capacity",
    code: "load.p99_target_missed",
    mutate: (input) => {
      if (input.payload.kind === "load_capacity")
        input.payload.observedResults.p99Milliseconds = 2_001;
    },
  },
  {
    name: "load errors",
    kind: "load_capacity",
    code: "load.error_target_missed",
    mutate: (input) => {
      if (input.payload.kind === "load_capacity") input.payload.observedResults.errorRateBps = 26;
    },
  },
  {
    name: "load saturation",
    kind: "load_capacity",
    code: "load.saturation_target_missed",
    mutate: (input) => {
      if (input.payload.kind === "load_capacity")
        input.payload.observedResults.saturationBps = 8_001;
    },
  },
  {
    name: "load headroom",
    kind: "load_capacity",
    code: "load.headroom_target_missed",
    mutate: (input) => {
      if (input.payload.kind === "load_capacity")
        input.payload.observedResults.acceptedCapacityRequestsPerSecond = 130;
    },
  },
  {
    name: "load queue age",
    kind: "load_capacity",
    code: "load.queue_age_target_missed",
    mutate: (input) => {
      if (input.payload.kind === "load_capacity")
        input.payload.observedResults.queueAgeP95Milliseconds = 501;
    },
  },
  {
    name: "penetration environment",
    kind: "penetration_test",
    code: "pentest.not_production_shaped",
    mutate: (input) => {
      if (input.payload.kind === "penetration_test") input.payload.productionShaped = false;
    },
  },
  {
    name: "critical penetration finding",
    kind: "penetration_test",
    code: "pentest.critical_not_remediated.finding.high-1",
    mutate: (input) => {
      if (input.payload.kind !== "penetration_test") return;
      const finding = required(input.payload.findings[0]);
      finding.severity = "critical";
      finding.status = "open";
      finding.remediationEvidenceSha256 = null;
      finding.independentlyVerifiedBy = null;
      finding.verifiedAt = null;
    },
  },
  {
    name: "high penetration finding",
    kind: "penetration_test",
    code: "pentest.high_open.finding.high-1",
    mutate: (input) => {
      if (input.payload.kind !== "penetration_test") return;
      const finding = required(input.payload.findings[0]);
      finding.status = "open";
      finding.remediationEvidenceSha256 = null;
      finding.independentlyVerifiedBy = null;
      finding.verifiedAt = null;
    },
  },
  {
    name: "self-verified remediation",
    kind: "penetration_test",
    code: "pentest.self_verified.finding.high-1",
    mutate: (input) => {
      if (input.payload.kind === "penetration_test")
        required(input.payload.findings[0]).independentlyVerifiedBy =
          input.envelope.producer.actorId;
    },
  },
  {
    name: "expired risk acceptance",
    kind: "penetration_test",
    code: "pentest.risk_expired.finding.high-1",
    mutate: (input) => {
      if (input.payload.kind !== "penetration_test") return;
      const finding = required(input.payload.findings[0]);
      finding.severity = "medium";
      finding.status = "risk_accepted";
      finding.remediationEvidenceSha256 = null;
      finding.independentlyVerifiedBy = null;
      finding.verifiedAt = null;
      finding.riskAcceptance = {
        scope: "single bounded endpoint",
        durationSeconds: 3_600,
        compensatingControl: "route disabled until remediation",
        approvedBy: APPROVER.actorId,
        expiresAt: "2026-05-31T23:00:00Z",
      };
    },
  },
  {
    name: "non-independent risk acceptance",
    kind: "penetration_test",
    code: "pentest.risk_not_independent.finding.high-1",
    mutate: (input) => {
      if (input.payload.kind !== "penetration_test") return;
      const finding = required(input.payload.findings[0]);
      finding.severity = "medium";
      finding.status = "risk_accepted";
      finding.remediationEvidenceSha256 = null;
      finding.independentlyVerifiedBy = null;
      finding.verifiedAt = null;
      finding.riskAcceptance = {
        scope: "single bounded endpoint",
        durationSeconds: 31_536_000,
        compensatingControl: "route disabled until remediation",
        approvedBy: input.envelope.reviewer.actorId,
        expiresAt: "2026-07-01T00:00:00Z",
      };
    },
  },
  {
    name: "risk acceptance duration",
    kind: "penetration_test",
    code: "pentest.risk_duration_mismatch.finding.high-1",
    mutate: (input) => {
      if (input.payload.kind !== "penetration_test") return;
      const finding = required(input.payload.findings[0]);
      finding.severity = "medium";
      finding.status = "risk_accepted";
      finding.remediationEvidenceSha256 = null;
      finding.independentlyVerifiedBy = null;
      finding.verifiedAt = null;
      finding.riskAcceptance = {
        scope: "single bounded endpoint",
        durationSeconds: 1,
        compensatingControl: "route disabled until remediation",
        approvedBy: APPROVER.actorId,
        expiresAt: "2026-07-01T00:00:00Z",
      };
    },
  },
  {
    name: "audit event coverage",
    kind: "security_compliance",
    code: "security.audit_event_coverage_mismatch",
    mutate: (input) => {
      if (input.payload.kind === "security_compliance") input.payload.testedAuditEventClasses.pop();
    },
  },
  {
    name: "security control",
    kind: "security_compliance",
    code: "security.control_failed",
    mutate: (input) => {
      if (input.payload.kind === "security_compliance")
        input.payload.tamperEvidentAuditSequenceVerified = false;
    },
  },
  {
    name: "security exception",
    kind: "security_compliance",
    code: "security.open_control_exception",
    mutate: (input) => {
      if (input.payload.kind === "security_compliance")
        input.payload.openControlExceptions = ["audit.export-gap"];
    },
  },
  {
    name: "privacy stores",
    kind: "privacy_controls",
    code: "privacy.store_inventory_mismatch",
    mutate: (input) => {
      if (input.payload.kind === "privacy_controls") input.payload.storesInventoried.pop();
    },
  },
  {
    name: "privacy export expiry",
    kind: "privacy_controls",
    code: "privacy.export_expiry_target_missed",
    mutate: (input) => {
      if (input.payload.kind === "privacy_controls")
        input.payload.maximumObservedExportExpirySeconds = 3_601;
    },
  },
  {
    name: "privacy deletion",
    kind: "privacy_controls",
    code: "privacy.deletion_target_missed",
    mutate: (input) => {
      if (input.payload.kind === "privacy_controls")
        input.payload.maximumObservedDeletionSeconds = 604_801;
    },
  },
  {
    name: "privacy backup expiry",
    kind: "privacy_controls",
    code: "privacy.backup_expiry_target_missed",
    mutate: (input) => {
      if (input.payload.kind === "privacy_controls")
        input.payload.backupExpiryScheduledWithinSeconds = 2_592_001;
    },
  },
  {
    name: "privacy control",
    kind: "privacy_controls",
    code: "privacy.control_failed",
    mutate: (input) => {
      if (input.payload.kind === "privacy_controls")
        input.payload.directDatabaseDeletionRejected = false;
    },
  },
  {
    name: "locale translation coverage",
    kind: "locale_release",
    code: "locale.translation_coverage_failed",
    mutate: (input) => {
      if (input.payload.kind === "locale_release")
        required(input.payload.locales[0]).criticalCoverageBps = 9_999;
    },
  },
  {
    name: "locale quality",
    kind: "locale_release",
    code: "locale.quality_gate_failed",
    mutate: (input) => {
      if (input.payload.kind === "locale_release")
        required(input.payload.locales[0]).layoutPassed = false;
    },
  },
  {
    name: "locale RTL",
    kind: "locale_release",
    code: "locale.rtl_gate_failed",
    mutate: (input) => {
      if (input.payload.kind !== "locale_release") return;
      const locale = input.payload.locales.find((item) => item.locale === "fa");
      if (locale) locale.rtlPassed = false;
    },
  },
  {
    name: "locale release control",
    kind: "locale_release",
    code: "locale.release_control_failed",
    mutate: (input) => {
      if (input.payload.kind === "locale_release") input.payload.pseudoLocalePassed = false;
    },
  },
  {
    name: "locale critical fallback",
    kind: "locale_release",
    code: "locale.critical_fallback_detected",
    mutate: (input) => {
      if (input.payload.kind === "locale_release") input.payload.criticalFallbackCount = 1;
    },
  },
  {
    name: "commercial control",
    kind: "commercial_operations",
    code: "commercial.control_failed",
    mutate: (input) => {
      if (input.payload.kind === "commercial_operations")
        input.payload.usageReplayDidNotDoubleCharge = false;
    },
  },
  {
    name: "commercial reconciliation",
    kind: "commercial_operations",
    code: "commercial.reconciliation_failed_or_insufficient",
    mutate: (input) => {
      if (input.payload.kind === "commercial_operations") input.payload.incorrectCharges = 1;
    },
  },
  {
    name: "operations service coverage",
    kind: "operational_readiness",
    code: "operations.service_coverage_mismatch",
    mutate: (input) => {
      if (input.payload.kind === "operational_readiness")
        required(input.payload.services[0]).service = "other-api";
    },
  },
  {
    name: "operations stale drill",
    kind: "operational_readiness",
    code: "operations.drill_stale_or_future",
    mutate: (input) => {
      if (input.payload.kind === "operational_readiness")
        required(input.payload.services[0]).lastDrillAt = "2025-05-01T00:00:00Z";
    },
  },
  {
    name: "operations control",
    kind: "operational_readiness",
    code: "operations.control_failed",
    mutate: (input) => {
      if (input.payload.kind === "operational_readiness") input.payload.rollbackRehearsed = false;
    },
  },
];

describe("enterprise release assessment", () => {
  it("accepts only the complete independently reviewed Phase 15 evidence set", () => {
    const { fixture, assessment } = readyAssessment();
    expect(assessment.status).toBe("ready");
    expect(assessment.validUntil).toBe("2026-08-01T00:00:00Z");
    expect(assessment.gates.every((result) => result.passed)).toBe(true);
    expect(gate(assessment, "topology").reasonCodes).toEqual([]);
    expect(assessment.evidenceManifestSha256s).toHaveLength(fixture.evidence.length);
    expect(Object.isFrozen(assessment.gates)).toBe(true);
    expect(() => assertEnterpriseReleaseAssessment(assessment)).not.toThrow();
    expect(replayEnterpriseAssessment(fixture.assessmentInput, assessment)).toEqual(assessment);
  });

  it.each(GATE_FAILURE_CASES)("fails closed for $name", ({ kind, code, mutate }) => {
    const fixture = replaceEvidence(readyFixture(), kind, mutate);
    const assessment = assessEnterpriseRelease(fixture.assessmentInput);
    expect(assessment.status).toBe("not_ready");
    expect(gate(assessment, kind).reasonCodes).toContain(code);
  });

  it("rejects incomplete, duplicate, cross-tenant, and tampered assessment inputs", () => {
    const fixture = readyFixture();
    expect(() =>
      assessEnterpriseRelease({ ...fixture.assessmentInput, evidence: fixture.evidence.slice(1) }),
    ).toThrow(/exactly one/);
    expect(() =>
      assessEnterpriseRelease({
        ...fixture.assessmentInput,
        evidence: [...fixture.evidence.slice(0, -1), required(fixture.evidence[0])],
      }),
    ).toThrow(/duplicate evidence kinds/);
    expect(() =>
      assessEnterpriseRelease({ ...fixture.assessmentInput, tenantId: OTHER_TENANT }),
    ).toThrow(/assessor|tenant/);
    const tampered = structuredClone(required(fixture.evidence[0])) as Mutable<
      (typeof fixture.evidence)[number]
    >;
    tampered.payload.kind = "scim_lifecycle";
    expect(() =>
      assessEnterpriseRelease({
        ...fixture.assessmentInput,
        evidence: [tampered, ...fixture.evidence.slice(1)],
      }),
    ).toThrow(/digest/);
  });

  it("rejects an assessor who also produced release evidence", () => {
    const collided = replaceEvidence(readyFixture(), "identity_access", (input) => {
      input.envelope.producer.actorId = ASSESSOR.actorId;
    });
    expect(() => assessEnterpriseRelease(collided.assessmentInput)).toThrow(/duties/);
  });

  it("rejects forged assessment summaries even when their digest is recomputed", () => {
    const { assessment } = readyAssessment();
    const forge = (
      mutate: (body: Mutable<EnterpriseReleaseAssessmentBody>) => void,
    ): EnterpriseReleaseAssessment => {
      const { manifestSha256: _digest, ...body } = structuredClone(assessment);
      mutate(body as Mutable<EnterpriseReleaseAssessmentBody>);
      return manifest(body) as EnterpriseReleaseAssessment;
    };
    expect(() =>
      assertEnterpriseReleaseAssessment(
        forge((body) => {
          body.evidenceManifestSha256s[1] = structuredClone(
            required(body.evidenceManifestSha256s[0]),
          );
        }),
      ),
    ).toThrow(/duplicates/);
    expect(() =>
      assertEnterpriseReleaseAssessment(
        forge((body) => {
          body.gates[1] = structuredClone(required(body.gates[0]));
        }),
      ),
    ).toThrow(/duplicates/);
    expect(() =>
      assertEnterpriseReleaseAssessment(
        forge((body) => {
          body.separatedActorIds = body.separatedActorIds.filter(
            (actorId) => actorId !== body.assessor.actorId,
          );
        }),
      ),
    ).toThrow(/separated actors/);
    expect(() =>
      assertEnterpriseReleaseAssessment(
        forge((body) => {
          body.assessor.role = "policy_owner";
        }),
      ),
    ).toThrow(/release_assessor/);
  });

  it("detects assessment replay drift", () => {
    const { fixture, assessment } = readyAssessment();
    expect(() =>
      replayEnterpriseAssessment(
        { ...fixture.assessmentInput, assessmentId: "11111111-1111-4111-8111-111111111199" },
        assessment,
      ),
    ).toThrow(/replay digest mismatch/);
  });
});

describe("independent approval, expiry, and revocation", () => {
  it("authorizes a bound ready assessment only inside both validity windows", () => {
    const { assessment } = readyAssessment();
    const approval = recordEnterpriseReleaseApproval(
      assessment,
      approvalInput({ assessmentManifestSha256: assessment.manifestSha256 }),
    );
    expect(() => assertEnterpriseReleaseApproval(approval)).not.toThrow();
    expect(isEnterpriseReleaseAuthorized(approval, assessment, "2026-06-02T00:00:00Z")).toBe(true);
    expect(isEnterpriseReleaseAuthorized(approval, assessment, "2026-06-01T00:09:59Z")).toBe(false);
    expect(isEnterpriseReleaseAuthorized(approval, assessment, "2026-07-01T00:00:00Z")).toBe(false);
  });

  it("records denial but never authorizes it", () => {
    const { assessment } = readyAssessment();
    const approval = recordEnterpriseReleaseApproval(
      assessment,
      approvalInput({
        assessmentManifestSha256: assessment.manifestSha256,
        decision: "reject",
        rationale: "Independent approver withheld release authorization.",
      }),
    );
    expect(approval.disposition).toBe("denied");
    expect(isEnterpriseReleaseAuthorized(approval, assessment, "2026-06-02T00:00:00Z")).toBe(false);
  });

  it("refuses approval of a failed gate, a participant, bad chronology, or excess lifetime", () => {
    const { assessment } = readyAssessment();
    const failedFixture = replaceEvidence(readyFixture(), "identity_access", (input) => {
      input.envelope.result = "failed";
    });
    const failed = assessEnterpriseRelease(failedFixture.assessmentInput);
    expect(() =>
      recordEnterpriseReleaseApproval(
        failed,
        approvalInput({ assessmentManifestSha256: failed.manifestSha256 }),
      ),
    ).toThrow(/not-ready/);
    expect(() =>
      recordEnterpriseReleaseApproval(
        assessment,
        approvalInput({
          assessmentManifestSha256: assessment.manifestSha256,
          approver: ASSESSOR,
        }),
      ),
    ).toThrow(/independent/);
    expect(() =>
      recordEnterpriseReleaseApproval(
        assessment,
        approvalInput({
          assessmentManifestSha256: assessment.manifestSha256,
          decidedAt: "2026-05-31T23:59:59Z",
        }),
      ),
    ).toThrow(/timestamps/);
    expect(() =>
      recordEnterpriseReleaseApproval(
        assessment,
        approvalInput({
          assessmentManifestSha256: assessment.manifestSha256,
          expiresAt: "2026-09-01T00:00:00Z",
        }),
      ),
    ).toThrow(/outlive/);
  });

  it("rejects a recomputed malformed approval", () => {
    const { assessment } = readyAssessment();
    const approval = recordEnterpriseReleaseApproval(
      assessment,
      approvalInput({ assessmentManifestSha256: assessment.manifestSha256 }),
    );
    const { manifestSha256: _digest, ...body } = structuredClone(approval);
    const malformed = body as Mutable<EnterpriseReleaseApprovalBody>;
    malformed.approver.role = "release_assessor";
    expect(() => assertEnterpriseReleaseApproval(manifest(malformed) as typeof approval)).toThrow(
      /independent approver/,
    );
  });

  it("revokes an active authorization with an immutable independently owned receipt", () => {
    const { assessment } = readyAssessment();
    const approval = recordEnterpriseReleaseApproval(
      assessment,
      approvalInput({ assessmentManifestSha256: assessment.manifestSha256 }),
    );
    const input: EnterpriseReleaseRevocationInput = {
      schemaVersion: 1,
      revocationId: "11111111-1111-4111-8111-111111111151",
      approvalManifestSha256: approval.manifestSha256,
      assessmentManifestSha256: assessment.manifestSha256,
      tenantId: TENANT,
      releaseId: RELEASE_ID,
      releaseArtifactSha256: ARTIFACT,
      revokedBy: APPROVER,
      revokedAt: "2026-06-03T00:00:00Z",
      reason: "Evidence provider revoked a previously accepted assurance statement.",
    };
    const revocation = recordEnterpriseReleaseRevocation(approval, assessment, input);
    expect(() => assertEnterpriseReleaseRevocation(revocation)).not.toThrow();
    expect(
      isEnterpriseReleaseAuthorized(approval, assessment, "2026-06-02T00:00:00Z", [revocation]),
    ).toBe(true);
    expect(
      isEnterpriseReleaseAuthorized(approval, assessment, "2026-06-03T00:00:00Z", [revocation]),
    ).toBe(false);
  });

  it("rejects unbound, late, malformed, and unbounded revocation inputs", () => {
    const { assessment } = readyAssessment();
    const approval = recordEnterpriseReleaseApproval(
      assessment,
      approvalInput({ assessmentManifestSha256: assessment.manifestSha256 }),
    );
    const base: EnterpriseReleaseRevocationInput = {
      schemaVersion: 1,
      revocationId: "11111111-1111-4111-8111-111111111151",
      approvalManifestSha256: approval.manifestSha256,
      assessmentManifestSha256: assessment.manifestSha256,
      tenantId: TENANT,
      releaseId: RELEASE_ID,
      releaseArtifactSha256: ARTIFACT,
      revokedBy: APPROVER,
      revokedAt: "2026-06-03T00:00:00Z",
      reason: "Assurance statement withdrawn.",
    };
    expect(() =>
      recordEnterpriseReleaseRevocation(approval, assessment, {
        ...base,
        approvalManifestSha256: "f".repeat(64),
      }),
    ).toThrow(/does not bind/);
    expect(() =>
      recordEnterpriseReleaseRevocation(approval, assessment, {
        ...base,
        revokedAt: "2026-07-01T00:00:00Z",
      }),
    ).toThrow(/active/);
    const revocation = recordEnterpriseReleaseRevocation(approval, assessment, base);
    const { manifestSha256: _digest, ...body } = structuredClone(revocation);
    const malformed = body as Mutable<EnterpriseReleaseRevocationInput>;
    malformed.revokedBy.role = "evidence_reviewer";
    expect(() =>
      assertEnterpriseReleaseRevocation(manifest(malformed) as typeof revocation),
    ).toThrow(/independent approver/);
    expect(() =>
      isEnterpriseReleaseAuthorized(
        approval,
        assessment,
        ASSESSED_AT,
        Array.from({ length: 65 }, () => revocation),
      ),
    ).toThrow(/at most 64/);
  });
});
