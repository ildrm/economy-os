import {
  assertEnterpriseEvidence,
  type EnterpriseEvidence,
  EVIDENCE_KINDS,
  type EvidenceKind,
  observedCapacityHeadroomBps,
  observedRecovery,
  observedSloErrorBudgets,
  REQUIRED_AUDIT_EVENT_CLASSES,
  REQUIRED_LOCALES,
} from "./evidence.js";
import {
  clone,
  digest,
  exact,
  freeze,
  instant,
  integrity,
  key,
  type Manifest,
  manifest,
  milliseconds,
  oneOf,
  record,
  sha,
  strings,
  text,
  uuid,
} from "./internals.js";
import {
  assertEnterpriseTenantPolicy,
  assertProductionTopology,
  type EnterpriseActor,
  type EnterpriseTenantPolicy,
  type ProductionTopology,
  topologyServiceNames,
  validateActor,
} from "./policy.js";

export type ReadinessGate = "topology" | EvidenceKind;

export interface GateResult {
  readonly gate: ReadinessGate;
  readonly passed: boolean;
  readonly reasonCodes: readonly string[];
}

export interface EnterpriseReleaseAssessmentInput {
  readonly schemaVersion: 1;
  readonly assessmentId: string;
  readonly releaseId: string;
  readonly tenantId: string;
  readonly releaseArtifactSha256: string;
  readonly assessedAt: string;
  readonly assessor: EnterpriseActor;
  readonly policy: EnterpriseTenantPolicy;
  readonly topology: ProductionTopology;
  readonly evidence: readonly EnterpriseEvidence[];
}

export interface EnterpriseReleaseAssessmentBody {
  readonly schemaVersion: 1;
  readonly assessmentId: string;
  readonly releaseId: string;
  readonly tenantId: string;
  readonly releaseArtifactSha256: string;
  readonly policyManifestSha256: string;
  readonly topologyManifestSha256: string;
  readonly assessedAt: string;
  readonly assessor: EnterpriseActor;
  readonly evidenceManifestSha256s: readonly {
    readonly kind: EvidenceKind;
    readonly manifestSha256: string;
  }[];
  readonly gates: readonly GateResult[];
  readonly status: "ready" | "not_ready";
  readonly validUntil: string;
  readonly separatedActorIds: readonly string[];
}

export type EnterpriseReleaseAssessment = Manifest<EnterpriseReleaseAssessmentBody>;

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}

function sorted(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || (values[index - 1] ?? "") < value);
}

function failed(codes: string[], condition: boolean, code: string): void {
  if (!condition) codes.push(code);
}

function allTrue(value: object, excluded: readonly string[] = []): boolean {
  return Object.entries(value).every(([name, item]) => excluded.includes(name) || item !== false);
}

function routeSetDigest(routes: EnterpriseTenantPolicy["residency"]["routes"]): string {
  return digest(
    routes
      .map((route) => ({
        ...route,
        storageRegions: [...route.storageRegions].sort(),
        processingRegions: [...route.processingRegions].sort(),
        backupRegions: [...route.backupRegions].sort(),
        supportRegions: [...route.supportRegions].sort(),
        exportRegions: [...route.exportRegions].sort(),
      }))
      .sort((left, right) => left.dataClass.localeCompare(right.dataClass)),
  );
}

function commonEvidenceCodes(
  evidence: EnterpriseEvidence,
  input: EnterpriseReleaseAssessmentInput,
): string[] {
  const codes: string[] = [];
  const envelope = evidence.envelope;
  failed(codes, envelope.result === "passed", "evidence.result_not_passed");
  failed(codes, envelope.limitations.length === 0, "evidence.unaccepted_limitations");
  failed(codes, envelope.revokedAt === null, "evidence.revoked");
  failed(codes, envelope.tenantId === input.tenantId, "evidence.tenant_mismatch");
  failed(
    codes,
    envelope.releaseArtifactSha256 === input.releaseArtifactSha256,
    "evidence.release_artifact_mismatch",
  );
  failed(
    codes,
    envelope.policyManifestSha256 === input.policy.manifestSha256,
    "evidence.policy_drift",
  );
  failed(
    codes,
    envelope.topologyManifestSha256 === input.topology.manifestSha256,
    "evidence.topology_drift",
  );
  failed(
    codes,
    milliseconds(input.assessedAt, envelope.completedAt) >= 0,
    "evidence.completed_in_future",
  );
  failed(
    codes,
    milliseconds(input.assessedAt, envelope.verification.verifiedAt) >= 0,
    "evidence.verification_in_future",
  );
  failed(
    codes,
    milliseconds(input.assessedAt, envelope.completedAt) <=
      input.policy.reliability.maximumEvidenceAgeSeconds * 1_000,
    "evidence.too_old",
  );
  failed(
    codes,
    milliseconds(envelope.expiresAt, input.assessedAt) >=
      input.policy.reliability.minimumEvidenceValiditySeconds * 1_000,
    "evidence.expired_or_expiring",
  );
  return codes;
}

function topologyGate(input: EnterpriseReleaseAssessmentInput): GateResult {
  const codes: string[] = [];
  failed(
    codes,
    input.topology.failureDomains.length >= input.policy.reliability.minimumFailureDomains,
    "topology.insufficient_failure_domains",
  );
  for (const service of input.topology.criticalServices) {
    failed(
      codes,
      service.activeFailureDomains.length >= input.policy.reliability.minimumFailureDomains,
      `topology.service_under_replicated.${service.service}`,
    );
  }
  return freeze({ gate: "topology", passed: codes.length === 0, reasonCodes: codes.sort() });
}

function evidenceGate(
  evidence: EnterpriseEvidence,
  input: EnterpriseReleaseAssessmentInput,
): GateResult {
  const codes = commonEvidenceCodes(evidence, input);
  const policy = input.policy;
  const payload = evidence.payload;
  const services = topologyServiceNames(input.topology);
  switch (payload.kind) {
    case "identity_access": {
      failed(
        codes,
        payload.saml.failures === 0 && payload.saml.attempts >= 6,
        "identity.saml_cases_failed_or_insufficient",
      );
      failed(
        codes,
        allTrue(payload.saml, ["attempts", "failures", "encryptedAssertionEnforced"]),
        "identity.saml_control_failed",
      );
      failed(
        codes,
        !policy.identity.encryptedAssertionsRequired || payload.saml.encryptedAssertionEnforced,
        "identity.encryption_not_enforced",
      );
      failed(
        codes,
        payload.mfa.failures === 0 && payload.mfa.attempts >= 3,
        "identity.mfa_cases_failed_or_insufficient",
      );
      failed(
        codes,
        payload.mfa.requiredForAllUsers && payload.mfa.phishingResistantForPrivileged,
        "identity.mfa_control_failed",
      );
      failed(
        codes,
        policy.identity.stepUpActions.every((action) =>
          payload.mfa.testedStepUpActions.includes(action),
        ),
        "identity.step_up_incomplete",
      );
      failed(
        codes,
        payload.session.failures === 0 && payload.session.attempts >= 5,
        "identity.session_cases_failed_or_insufficient",
      );
      failed(
        codes,
        allTrue(payload.session, ["attempts", "failures", "maximumObservedRevocationSeconds"]),
        "identity.session_control_failed",
      );
      failed(
        codes,
        payload.session.maximumObservedRevocationSeconds <=
          policy.identity.session.revocationTargetSeconds,
        "identity.revocation_target_missed",
      );
      break;
    }
    case "scim_lifecycle":
      failed(codes, payload.failures === 0, "scim.lifecycle_failure");
      failed(
        codes,
        payload.maximumProvisionSeconds <= policy.scim.provisioningTargetSeconds,
        "scim.provisioning_target_missed",
      );
      failed(
        codes,
        payload.maximumDeprovisionSeconds <= policy.scim.deprovisioningTargetSeconds,
        "scim.deprovisioning_target_missed",
      );
      failed(
        codes,
        payload.maximumReconciliationSeconds <= policy.scim.reconciliationTargetSeconds,
        "scim.reconciliation_target_missed",
      );
      failed(
        codes,
        payload.deprovisionedAccessDenied &&
          payload.invalidMappingRejected &&
          payload.pseudonymousSubjectReferences,
        "scim.control_failed",
      );
      break;
    case "residency_deployment":
      failed(
        codes,
        payload.deploymentMode === policy.residency.deploymentMode,
        "residency.deployment_mode_mismatch",
      );
      failed(
        codes,
        payload.deploymentContractSha256 === input.topology.deploymentContractSha256,
        "residency.deployment_contract_mismatch",
      );
      failed(
        codes,
        routeSetDigest(payload.observedRoutes) === routeSetDigest(policy.residency.routes),
        "residency.route_observation_mismatch",
      );
      failed(
        codes,
        allTrue(payload, [
          "kind",
          "deploymentMode",
          "deploymentContractSha256",
          "observedRoutes",
          "providerIntegrationsMode",
        ]),
        "residency.control_failed",
      );
      failed(
        codes,
        payload.providerIntegrationsMode === input.topology.externalProviderMode,
        "residency.provider_mode_mismatch",
      );
      failed(
        codes,
        policy.residency.deploymentMode !== "air_gapped_sovereign" ||
          payload.providerIntegrationsMode === "disabled",
        "residency.air_gap_provider_enabled",
      );
      break;
    case "recovery_exercise": {
      const observed = observedRecovery(evidence);
      const topologyDomains = new Set(input.topology.failureDomains);
      failed(
        codes,
        payload.testedFailureDomains.length >= policy.reliability.minimumFailureDomains,
        "recovery.failure_domain_coverage_insufficient",
      );
      failed(
        codes,
        payload.testedFailureDomains.every((domain) => topologyDomains.has(domain)),
        "recovery.unknown_failure_domain",
      );
      failed(
        codes,
        observed.rpoSeconds <= policy.reliability.criticalRpoTargetSeconds,
        "recovery.rpo_target_missed",
      );
      failed(
        codes,
        observed.rtoSeconds <= policy.reliability.criticalRtoTargetSeconds,
        "recovery.rto_target_missed",
      );
      failed(
        codes,
        payload.missingRecords === 0 && payload.duplicateRecords === 0,
        "recovery.record_integrity_failed",
      );
      failed(
        codes,
        allTrue(payload, [
          "kind",
          "exerciseId",
          "testedFailureDomains",
          "lastDurableWriteAt",
          "recoveredThroughAt",
          "disruptionDetectedAt",
          "criticalServicesRestoredAt",
          "missingRecords",
          "duplicateRecords",
          "recoveredManifestSha256",
        ]),
        "recovery.semantic_integrity_failed",
      );
      break;
    }
    case "backup_restore":
      failed(
        codes,
        payload.backupManifestSha256 === payload.restoredManifestSha256,
        "backup.manifest_mismatch",
      );
      failed(
        codes,
        payload.missingObjects === 0 && payload.corruptObjects === 0,
        "backup.object_integrity_failed",
      );
      failed(
        codes,
        milliseconds(payload.requestedPointInTime, payload.restoredPointInTime) <=
          policy.reliability.criticalRpoTargetSeconds * 1_000,
        "backup.point_in_time_target_missed",
      );
      failed(
        codes,
        allTrue(payload, [
          "kind",
          "backupManifestSha256",
          "restoredManifestSha256",
          "requestedPointInTime",
          "restoredPointInTime",
          "missingObjects",
          "corruptObjects",
        ]),
        "backup.control_failed",
      );
      break;
    case "slo_window": {
      const budgets = observedSloErrorBudgets(evidence);
      failed(
        codes,
        evidence.envelope.environment === "production",
        "slo.not_production_observation",
      );
      failed(
        codes,
        milliseconds(payload.windowEnd, payload.windowStart) >=
          policy.reliability.minimumSloWindowSeconds * 1_000,
        "slo.window_too_short",
      );
      failed(
        codes,
        sameMembers(
          payload.metrics.map((metric) => metric.service),
          services,
        ),
        "slo.service_coverage_mismatch",
      );
      failed(
        codes,
        payload.metrics.every(
          (metric) => metric.objectiveBps >= policy.reliability.minimumSloObjectiveBps,
        ),
        "slo.objective_below_policy",
      );
      failed(
        codes,
        budgets.every((budget) => budget.remainingBadEvents >= 0),
        "slo.error_budget_exhausted",
      );
      failed(
        codes,
        payload.metrics.every(
          (metric) => metric.p95LatencyMilliseconds <= metric.latencyTargetMilliseconds,
        ),
        "slo.latency_target_missed",
      );
      break;
    }
    case "load_capacity": {
      const headroom = observedCapacityHeadroomBps(evidence);
      failed(
        codes,
        payload.observedResults.sustainedRequestsPerSecond >=
          payload.declaredWorkload.targetRequestsPerSecond,
        "load.throughput_target_missed",
      );
      failed(
        codes,
        payload.declaredWorkload.commitSha256 === input.releaseArtifactSha256,
        "load.release_artifact_mismatch",
      );
      failed(
        codes,
        payload.observedResults.samples >=
          payload.observedResults.sustainedRequestsPerSecond *
            payload.declaredWorkload.durationSeconds,
        "load.sample_coverage_insufficient",
      );
      failed(
        codes,
        payload.observedResults.p95Milliseconds <=
          payload.declaredThresholds.maximumP95Milliseconds,
        "load.p95_target_missed",
      );
      failed(
        codes,
        payload.observedResults.p99Milliseconds <=
          payload.declaredThresholds.maximumP99Milliseconds,
        "load.p99_target_missed",
      );
      failed(
        codes,
        payload.observedResults.errorRateBps <= payload.declaredThresholds.maximumErrorRateBps,
        "load.error_target_missed",
      );
      failed(
        codes,
        payload.observedResults.saturationBps <= payload.declaredThresholds.maximumSaturationBps,
        "load.saturation_target_missed",
      );
      failed(
        codes,
        headroom >= payload.declaredThresholds.minimumHeadroomBps,
        "load.headroom_target_missed",
      );
      failed(
        codes,
        payload.observedResults.queueAgeP95Milliseconds <=
          payload.declaredThresholds.maximumQueueAgeP95Milliseconds,
        "load.queue_age_target_missed",
      );
      break;
    }
    case "penetration_test":
      failed(codes, payload.productionShaped, "pentest.not_production_shaped");
      for (const finding of payload.findings) {
        if (finding.severity === "critical")
          failed(
            codes,
            finding.status === "remediated",
            `pentest.critical_not_remediated.${finding.findingId}`,
          );
        if (finding.severity === "high")
          failed(codes, finding.status !== "open", `pentest.high_open.${finding.findingId}`);
        if (finding.status === "remediated") {
          failed(
            codes,
            finding.independentlyVerifiedBy !== evidence.envelope.producer.actorId,
            `pentest.self_verified.${finding.findingId}`,
          );
        }
        if (finding.status === "risk_accepted" && finding.riskAcceptance !== null) {
          failed(
            codes,
            milliseconds(finding.riskAcceptance.expiresAt, input.assessedAt) > 0,
            `pentest.risk_expired.${finding.findingId}`,
          );
          failed(
            codes,
            finding.riskAcceptance.approvedBy !== evidence.envelope.producer.actorId &&
              finding.riskAcceptance.approvedBy !== evidence.envelope.reviewer.actorId,
            `pentest.risk_not_independent.${finding.findingId}`,
          );
          failed(
            codes,
            milliseconds(finding.riskAcceptance.expiresAt, evidence.envelope.completedAt) <=
              finding.riskAcceptance.durationSeconds * 1_000,
            `pentest.risk_duration_mismatch.${finding.findingId}`,
          );
        }
      }
      break;
    case "security_compliance":
      failed(
        codes,
        sameMembers(payload.testedAuditEventClasses, REQUIRED_AUDIT_EVENT_CLASSES),
        "security.audit_event_coverage_mismatch",
      );
      failed(
        codes,
        allTrue(payload, [
          "kind",
          "threatModelSha256",
          "controlMatrixSha256",
          "mappedFrameworks",
          "testedAuditEventClasses",
          "openControlExceptions",
        ]),
        "security.control_failed",
      );
      failed(codes, payload.openControlExceptions.length === 0, "security.open_control_exception");
      break;
    case "privacy_controls":
      failed(
        codes,
        sameMembers(payload.storesInventoried, input.topology.dataStores),
        "privacy.store_inventory_mismatch",
      );
      failed(
        codes,
        payload.maximumObservedExportExpirySeconds <= policy.privacy.exportExpiryTargetSeconds,
        "privacy.export_expiry_target_missed",
      );
      failed(
        codes,
        payload.maximumObservedDeletionSeconds <= policy.privacy.deletionTargetSeconds,
        "privacy.deletion_target_missed",
      );
      failed(
        codes,
        payload.backupExpiryScheduledWithinSeconds <= policy.privacy.backupDeletionTargetSeconds,
        "privacy.backup_expiry_target_missed",
      );
      failed(
        codes,
        allTrue(payload, [
          "kind",
          "storesInventoried",
          "maximumObservedExportExpirySeconds",
          "maximumObservedDeletionSeconds",
          "backupExpiryScheduledWithinSeconds",
        ]),
        "privacy.control_failed",
      );
      break;
    case "locale_release":
      failed(
        codes,
        sameMembers(
          payload.locales.map((locale) => locale.locale),
          REQUIRED_LOCALES,
        ),
        "locale.coverage_mismatch",
      );
      failed(
        codes,
        payload.locales.every(
          (locale) =>
            locale.criticalCoverageBps === 10_000 &&
            locale.generalCoverageBps >= policy.localization.generalCoverageThresholdBps,
        ),
        "locale.translation_coverage_failed",
      );
      failed(
        codes,
        payload.locales.every(
          (locale) =>
            locale.layoutPassed &&
            locale.accessibilityPassed &&
            locale.formatterPassed &&
            locale.qualifiedHumanReviewPassed,
        ),
        "locale.quality_gate_failed",
      );
      failed(
        codes,
        payload.locales
          .filter((locale) => locale.locale === "fa" || locale.locale === "ar")
          .every((locale) => locale.rtlPassed === true),
        "locale.rtl_gate_failed",
      );
      failed(
        codes,
        allTrue(payload, ["kind", "locales", "criticalFallbackCount"]),
        "locale.release_control_failed",
      );
      failed(codes, payload.criticalFallbackCount === 0, "locale.critical_fallback_detected");
      break;
    case "commercial_operations":
      failed(
        codes,
        allTrue(payload, [
          "kind",
          "catalogManifestSha256",
          "supportEscalationOwner",
          "billingReconciliationSha256",
        ]),
        "commercial.control_failed",
      );
      failed(
        codes,
        payload.reconciliationRuns >= 2 &&
          payload.reconciledUsageRecords > 0 &&
          payload.unmatchedUsageRecords === 0 &&
          payload.entitlementMismatches === 0 &&
          payload.incorrectCharges === 0,
        "commercial.reconciliation_failed_or_insufficient",
      );
      break;
    case "operational_readiness": {
      const evidenceServices = payload.services.map((service) => service.service);
      failed(
        codes,
        sameMembers(evidenceServices, services),
        "operations.service_coverage_mismatch",
      );
      failed(
        codes,
        payload.services.every(
          (service) =>
            milliseconds(input.assessedAt, service.lastDrillAt) >= 0 &&
            milliseconds(input.assessedAt, service.lastDrillAt) <=
              policy.reliability.maximumEvidenceAgeSeconds * 1_000,
        ),
        "operations.drill_stale_or_future",
      );
      failed(codes, allTrue(payload, ["kind", "services"]), "operations.control_failed");
      break;
    }
  }
  return freeze({
    gate: payload.kind,
    passed: codes.length === 0,
    reasonCodes: [...new Set(codes)].sort(),
  });
}

function validateAssessmentInput(input: EnterpriseReleaseAssessmentInput): void {
  record(input, "assessment input");
  exact(
    input,
    [
      "schemaVersion",
      "assessmentId",
      "releaseId",
      "tenantId",
      "releaseArtifactSha256",
      "assessedAt",
      "assessor",
      "policy",
      "topology",
      "evidence",
    ],
    "assessment input",
  );
  if (input.schemaVersion !== 1) throw new TypeError("assessment schemaVersion must be 1");
  uuid(input.assessmentId, "assessment.assessmentId");
  uuid(input.releaseId, "assessment.releaseId");
  uuid(input.tenantId, "assessment.tenantId");
  sha(input.releaseArtifactSha256, "assessment.releaseArtifactSha256");
  instant(input.assessedAt, "assessment.assessedAt");
  validateActor(input.assessor, "assessment.assessor");
  if (input.assessor.role !== "release_assessor" || input.assessor.tenantId !== input.tenantId)
    throw new TypeError("assessment requires a release_assessor in the same tenant");
  assertEnterpriseTenantPolicy(input.policy);
  assertProductionTopology(input.topology, input.policy);
  if (input.policy.tenantId !== input.tenantId || input.topology.tenantId !== input.tenantId)
    throw new TypeError("assessment tenant does not match policy/topology");
  if (!Array.isArray(input.evidence) || input.evidence.length !== EVIDENCE_KINDS.length)
    throw new TypeError("assessment requires exactly one item for every evidence kind");
  const kinds = new Set<EvidenceKind>();
  const ids = new Set<string>();
  const producerIds = new Set<string>();
  const reviewerIds = new Set<string>();
  const policyAuthorityIds = new Set([
    input.policy.createdBy.actorId,
    input.topology.declaredBy.actorId,
  ]);
  input.evidence.forEach((evidence) => {
    assertEnterpriseEvidence(evidence);
    if (kinds.has(evidence.payload.kind))
      throw new TypeError("assessment contains duplicate evidence kinds");
    if (ids.has(evidence.envelope.evidenceId))
      throw new TypeError("assessment contains duplicate evidence IDs");
    kinds.add(evidence.payload.kind);
    ids.add(evidence.envelope.evidenceId);
    const producerId = evidence.envelope.producer.actorId;
    const reviewerId = evidence.envelope.reviewer.actorId;
    if (
      producerId === input.assessor.actorId ||
      reviewerId === input.assessor.actorId ||
      policyAuthorityIds.has(producerId) ||
      policyAuthorityIds.has(reviewerId)
    ) {
      throw new TypeError("policy, evidence, and assessment duties must be separated");
    }
    producerIds.add(producerId);
    reviewerIds.add(reviewerId);
  });
  if (
    policyAuthorityIds.has(input.assessor.actorId) ||
    [...producerIds].some((actorId) => reviewerIds.has(actorId))
  ) {
    throw new TypeError("policy, evidence, and assessment duties must be separated");
  }
  if (EVIDENCE_KINDS.some((kind) => !kinds.has(kind)))
    throw new TypeError("assessment is missing a required evidence kind");
}

export function assessEnterpriseRelease(
  input: EnterpriseReleaseAssessmentInput,
): EnterpriseReleaseAssessment {
  validateAssessmentInput(input);
  const orderedEvidence = [...input.evidence].sort((left, right) =>
    left.payload.kind.localeCompare(right.payload.kind),
  );
  const gates = [
    topologyGate(input),
    ...orderedEvidence.map((evidence) => evidenceGate(evidence, input)),
  ].sort((left, right) => left.gate.localeCompare(right.gate));
  const separatedActorIds = [
    input.assessor.actorId,
    input.policy.createdBy.actorId,
    input.topology.declaredBy.actorId,
    ...orderedEvidence.flatMap((evidence) => [
      evidence.envelope.producer.actorId,
      evidence.envelope.reviewer.actorId,
    ]),
  ];
  const validUntil = orderedEvidence.reduce(
    (earliest, evidence) =>
      milliseconds(evidence.envelope.expiresAt, earliest) < 0
        ? evidence.envelope.expiresAt
        : earliest,
    orderedEvidence[0]?.envelope.expiresAt ?? input.assessedAt,
  );
  return manifest({
    schemaVersion: 1,
    assessmentId: input.assessmentId,
    releaseId: input.releaseId,
    tenantId: input.tenantId,
    releaseArtifactSha256: input.releaseArtifactSha256,
    policyManifestSha256: input.policy.manifestSha256,
    topologyManifestSha256: input.topology.manifestSha256,
    assessedAt: input.assessedAt,
    assessor: clone(input.assessor),
    evidenceManifestSha256s: orderedEvidence.map((evidence) => ({
      kind: evidence.payload.kind,
      manifestSha256: evidence.manifestSha256,
    })),
    gates,
    status: gates.every((gate) => gate.passed) ? "ready" : "not_ready",
    validUntil,
    separatedActorIds: [...new Set(separatedActorIds)].sort(),
  });
}

export function assertEnterpriseReleaseAssessment(assessment: EnterpriseReleaseAssessment): void {
  record(assessment, "assessment");
  integrity(assessment, "assessment");
  exact(
    assessment,
    [
      "schemaVersion",
      "assessmentId",
      "releaseId",
      "tenantId",
      "releaseArtifactSha256",
      "policyManifestSha256",
      "topologyManifestSha256",
      "assessedAt",
      "assessor",
      "evidenceManifestSha256s",
      "gates",
      "status",
      "validUntil",
      "separatedActorIds",
      "manifestSha256",
    ],
    "assessment",
  );
  if (assessment.schemaVersion !== 1) throw new TypeError("assessment schemaVersion must be 1");
  uuid(assessment.assessmentId, "assessment.assessmentId");
  uuid(assessment.releaseId, "assessment.releaseId");
  uuid(assessment.tenantId, "assessment.tenantId");
  sha(assessment.releaseArtifactSha256, "assessment.releaseArtifactSha256");
  sha(assessment.policyManifestSha256, "assessment.policyManifestSha256");
  sha(assessment.topologyManifestSha256, "assessment.topologyManifestSha256");
  instant(assessment.assessedAt, "assessment.assessedAt");
  instant(assessment.validUntil, "assessment.validUntil");
  validateActor(assessment.assessor, "assessment.assessor");
  if (
    assessment.assessor.role !== "release_assessor" ||
    assessment.assessor.tenantId !== assessment.tenantId
  ) {
    throw new TypeError("assessment assessor must be a release_assessor in the same tenant");
  }
  oneOf(assessment.status, ["ready", "not_ready"], "assessment.status");
  strings(assessment.separatedActorIds, "assessment.separatedActorIds", 1, 64, uuid);
  if (
    !sorted(assessment.separatedActorIds) ||
    !assessment.separatedActorIds.includes(assessment.assessor.actorId)
  ) {
    throw new TypeError("assessment separated actors are incomplete or noncanonical");
  }
  if (
    !Array.isArray(assessment.evidenceManifestSha256s) ||
    assessment.evidenceManifestSha256s.length !== EVIDENCE_KINDS.length
  )
    throw new TypeError("assessment evidence digest set is incomplete");
  const evidenceKinds = new Set<EvidenceKind>();
  const evidenceDigests = new Set<string>();
  assessment.evidenceManifestSha256s.forEach((item, index) => {
    record(item, `assessment.evidenceManifestSha256s[${index}]`);
    exact(item, ["kind", "manifestSha256"], `assessment.evidenceManifestSha256s[${index}]`);
    oneOf(item.kind, EVIDENCE_KINDS, `assessment.evidenceManifestSha256s[${index}].kind`);
    sha(item.manifestSha256, `assessment.evidenceManifestSha256s[${index}].manifestSha256`);
    if (evidenceKinds.has(item.kind) || evidenceDigests.has(item.manifestSha256)) {
      throw new TypeError("assessment evidence digest set contains duplicates");
    }
    evidenceKinds.add(item.kind);
    evidenceDigests.add(item.manifestSha256);
  });
  if (
    !sameMembers(
      assessment.evidenceManifestSha256s.map((item) => item.kind),
      EVIDENCE_KINDS,
    ) ||
    !sorted(assessment.evidenceManifestSha256s.map((item) => item.kind))
  ) {
    throw new TypeError("assessment evidence digest set is incomplete or noncanonical");
  }
  if (!Array.isArray(assessment.gates) || assessment.gates.length !== EVIDENCE_KINDS.length + 1)
    throw new TypeError("assessment gate set is incomplete");
  const gateNames = new Set<ReadinessGate>();
  assessment.gates.forEach((gate, index) => {
    record(gate, `assessment.gates[${index}]`);
    exact(gate, ["gate", "passed", "reasonCodes"], `assessment.gates[${index}]`);
    oneOf(gate.gate, ["topology", ...EVIDENCE_KINDS], `assessment.gates[${index}].gate`);
    if (gateNames.has(gate.gate)) throw new TypeError("assessment gate set contains duplicates");
    gateNames.add(gate.gate);
    if (typeof gate.passed !== "boolean")
      throw new TypeError(`assessment.gates[${index}].passed must be boolean`);
    strings(gate.reasonCodes, `assessment.gates[${index}].reasonCodes`, 0, 64, key);
    if (!sorted(gate.reasonCodes))
      throw new TypeError("assessment gate reason codes must be canonical");
    if (gate.passed !== (gate.reasonCodes.length === 0))
      throw new TypeError("assessment gate result is inconsistent");
  });
  const requiredGates: readonly ReadinessGate[] = ["topology", ...EVIDENCE_KINDS];
  if (
    !sameMembers(
      assessment.gates.map((gate) => gate.gate),
      requiredGates,
    ) ||
    !sorted(assessment.gates.map((gate) => gate.gate))
  ) {
    throw new TypeError("assessment gate set is incomplete or noncanonical");
  }
  if ((assessment.status === "ready") !== assessment.gates.every((gate) => gate.passed))
    throw new TypeError("assessment status is inconsistent with gates");
  if (
    assessment.status === "ready" &&
    milliseconds(assessment.validUntil, assessment.assessedAt) <= 0
  )
    throw new TypeError("ready assessment cannot be expired");
}

export function replayEnterpriseAssessment(
  input: EnterpriseReleaseAssessmentInput,
  expected: EnterpriseReleaseAssessment,
): EnterpriseReleaseAssessment {
  assertEnterpriseReleaseAssessment(expected);
  const replayed = assessEnterpriseRelease(input);
  if (replayed.manifestSha256 !== expected.manifestSha256)
    throw new TypeError("assessment replay digest mismatch");
  return replayed;
}

export interface EnterpriseReleaseApprovalInput {
  readonly schemaVersion: 1;
  readonly approvalId: string;
  readonly assessmentManifestSha256: string;
  readonly tenantId: string;
  readonly decision: "approve" | "reject";
  readonly rationale: string;
  readonly approver: EnterpriseActor;
  readonly decidedAt: string;
  readonly expiresAt: string;
}

export interface EnterpriseReleaseApprovalBody extends EnterpriseReleaseApprovalInput {
  readonly releaseId: string;
  readonly releaseArtifactSha256: string;
  readonly disposition: "authorized" | "denied";
}

export type EnterpriseReleaseApproval = Manifest<EnterpriseReleaseApprovalBody>;

export function recordEnterpriseReleaseApproval(
  assessment: EnterpriseReleaseAssessment,
  input: EnterpriseReleaseApprovalInput,
): EnterpriseReleaseApproval {
  assertEnterpriseReleaseAssessment(assessment);
  record(input, "approval input");
  exact(
    input,
    [
      "schemaVersion",
      "approvalId",
      "assessmentManifestSha256",
      "tenantId",
      "decision",
      "rationale",
      "approver",
      "decidedAt",
      "expiresAt",
    ],
    "approval input",
  );
  if (input.schemaVersion !== 1) throw new TypeError("approval schemaVersion must be 1");
  uuid(input.approvalId, "approval.approvalId");
  sha(input.assessmentManifestSha256, "approval.assessmentManifestSha256");
  uuid(input.tenantId, "approval.tenantId");
  oneOf(input.decision, ["approve", "reject"], "approval.decision");
  text(input.rationale, "approval.rationale", 2_000);
  validateActor(input.approver, "approval.approver");
  instant(input.decidedAt, "approval.decidedAt");
  instant(input.expiresAt, "approval.expiresAt");
  if (
    input.assessmentManifestSha256 !== assessment.manifestSha256 ||
    input.tenantId !== assessment.tenantId
  )
    throw new TypeError("approval does not bind the assessment tenant and digest");
  if (
    input.approver.role !== "independent_release_approver" ||
    input.approver.tenantId !== assessment.tenantId ||
    assessment.separatedActorIds.includes(input.approver.actorId)
  )
    throw new TypeError("approval requires an independent approver in the same tenant");
  if (
    milliseconds(input.decidedAt, assessment.assessedAt) < 0 ||
    milliseconds(input.expiresAt, input.decidedAt) <= 0
  )
    throw new TypeError("approval timestamps are not ordered");
  if (input.decision === "approve") {
    if (assessment.status !== "ready")
      throw new TypeError("a not-ready assessment cannot be approved");
    if (
      milliseconds(assessment.validUntil, input.decidedAt) <= 0 ||
      milliseconds(input.expiresAt, assessment.validUntil) > 0
    )
      throw new TypeError("approval cannot outlive its evidence");
  }
  return manifest({
    ...clone(input),
    releaseId: assessment.releaseId,
    releaseArtifactSha256: assessment.releaseArtifactSha256,
    disposition: input.decision === "approve" ? "authorized" : "denied",
  });
}

export function assertEnterpriseReleaseApproval(approval: EnterpriseReleaseApproval): void {
  record(approval, "approval");
  integrity(approval, "approval");
  exact(
    approval,
    [
      "schemaVersion",
      "approvalId",
      "assessmentManifestSha256",
      "tenantId",
      "decision",
      "rationale",
      "approver",
      "decidedAt",
      "expiresAt",
      "releaseId",
      "releaseArtifactSha256",
      "disposition",
      "manifestSha256",
    ],
    "approval",
  );
  if (approval.schemaVersion !== 1) throw new TypeError("approval schemaVersion must be 1");
  uuid(approval.approvalId, "approval.approvalId");
  sha(approval.assessmentManifestSha256, "approval.assessmentManifestSha256");
  uuid(approval.tenantId, "approval.tenantId");
  oneOf(approval.decision, ["approve", "reject"], "approval.decision");
  text(approval.rationale, "approval.rationale", 2_000);
  validateActor(approval.approver, "approval.approver");
  if (
    approval.approver.role !== "independent_release_approver" ||
    approval.approver.tenantId !== approval.tenantId
  ) {
    throw new TypeError("approval requires an independent approver in the same tenant");
  }
  instant(approval.decidedAt, "approval.decidedAt");
  instant(approval.expiresAt, "approval.expiresAt");
  if (milliseconds(approval.expiresAt, approval.decidedAt) <= 0) {
    throw new TypeError("approval must expire after its decision time");
  }
  uuid(approval.releaseId, "approval.releaseId");
  sha(approval.releaseArtifactSha256, "approval.releaseArtifactSha256");
  oneOf(approval.disposition, ["authorized", "denied"], "approval.disposition");
  if ((approval.decision === "approve") !== (approval.disposition === "authorized"))
    throw new TypeError("approval disposition is inconsistent");
}

export interface EnterpriseReleaseRevocationInput {
  readonly schemaVersion: 1;
  readonly revocationId: string;
  readonly approvalManifestSha256: string;
  readonly assessmentManifestSha256: string;
  readonly tenantId: string;
  readonly releaseId: string;
  readonly releaseArtifactSha256: string;
  readonly revokedBy: EnterpriseActor;
  readonly revokedAt: string;
  readonly reason: string;
}

export type EnterpriseReleaseRevocation = Manifest<EnterpriseReleaseRevocationInput>;

function validateRevocationInput(input: EnterpriseReleaseRevocationInput): void {
  record(input, "revocation");
  exact(
    input,
    [
      "schemaVersion",
      "revocationId",
      "approvalManifestSha256",
      "assessmentManifestSha256",
      "tenantId",
      "releaseId",
      "releaseArtifactSha256",
      "revokedBy",
      "revokedAt",
      "reason",
    ],
    "revocation",
  );
  if (input.schemaVersion !== 1) throw new TypeError("revocation schemaVersion must be 1");
  uuid(input.revocationId, "revocation.revocationId");
  sha(input.approvalManifestSha256, "revocation.approvalManifestSha256");
  sha(input.assessmentManifestSha256, "revocation.assessmentManifestSha256");
  uuid(input.tenantId, "revocation.tenantId");
  uuid(input.releaseId, "revocation.releaseId");
  sha(input.releaseArtifactSha256, "revocation.releaseArtifactSha256");
  validateActor(input.revokedBy, "revocation.revokedBy");
  if (
    input.revokedBy.role !== "independent_release_approver" ||
    input.revokedBy.tenantId !== input.tenantId
  ) {
    throw new TypeError("revocation requires an independent approver in the same tenant");
  }
  instant(input.revokedAt, "revocation.revokedAt");
  text(input.reason, "revocation.reason", 2_000);
}

export function recordEnterpriseReleaseRevocation(
  approval: EnterpriseReleaseApproval,
  assessment: EnterpriseReleaseAssessment,
  input: EnterpriseReleaseRevocationInput,
): EnterpriseReleaseRevocation {
  assertEnterpriseReleaseApproval(approval);
  assertEnterpriseReleaseAssessment(assessment);
  validateRevocationInput(input);
  if (
    approval.disposition !== "authorized" ||
    input.approvalManifestSha256 !== approval.manifestSha256 ||
    input.assessmentManifestSha256 !== assessment.manifestSha256 ||
    input.tenantId !== approval.tenantId ||
    input.releaseId !== approval.releaseId ||
    input.releaseArtifactSha256 !== approval.releaseArtifactSha256 ||
    approval.assessmentManifestSha256 !== assessment.manifestSha256
  ) {
    throw new TypeError("revocation does not bind the authorized release approval");
  }
  if (
    milliseconds(input.revokedAt, approval.decidedAt) < 0 ||
    milliseconds(approval.expiresAt, input.revokedAt) <= 0
  ) {
    throw new TypeError("revocation must occur while the approval is active");
  }
  return manifest(input);
}

export function assertEnterpriseReleaseRevocation(revocation: EnterpriseReleaseRevocation): void {
  record(revocation, "revocation");
  integrity(revocation, "revocation");
  const { manifestSha256: _manifestSha256, ...body } = revocation;
  validateRevocationInput(body);
}

export function isEnterpriseReleaseAuthorized(
  approval: EnterpriseReleaseApproval,
  assessment: EnterpriseReleaseAssessment,
  at: string,
  revocations: readonly EnterpriseReleaseRevocation[] = [],
): boolean {
  assertEnterpriseReleaseApproval(approval);
  assertEnterpriseReleaseAssessment(assessment);
  instant(at, "authorization time");
  if (!Array.isArray(revocations) || revocations.length > 64) {
    throw new TypeError("release revocations must contain at most 64 items");
  }
  const revoked = revocations.some((revocation) => {
    assertEnterpriseReleaseRevocation(revocation);
    if (
      revocation.approvalManifestSha256 !== approval.manifestSha256 ||
      revocation.assessmentManifestSha256 !== assessment.manifestSha256 ||
      revocation.tenantId !== approval.tenantId ||
      revocation.releaseId !== approval.releaseId ||
      revocation.releaseArtifactSha256 !== approval.releaseArtifactSha256
    ) {
      throw new TypeError("release revocation does not bind the supplied approval");
    }
    return milliseconds(at, revocation.revokedAt) >= 0;
  });
  return (
    !revoked &&
    approval.disposition === "authorized" &&
    assessment.status === "ready" &&
    approval.assessmentManifestSha256 === assessment.manifestSha256 &&
    approval.tenantId === assessment.tenantId &&
    approval.releaseId === assessment.releaseId &&
    approval.releaseArtifactSha256 === assessment.releaseArtifactSha256 &&
    milliseconds(at, approval.decidedAt) >= 0 &&
    milliseconds(approval.expiresAt, at) > 0 &&
    milliseconds(assessment.validUntil, at) > 0
  );
}
