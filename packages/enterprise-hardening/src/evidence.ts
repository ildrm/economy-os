import {
  exact,
  httpsOrUrn,
  instant,
  integer,
  integrity,
  key,
  type Manifest,
  manifest,
  milliseconds,
  oneOf,
  record,
  secondsCeil,
  sha,
  strings,
  text,
  uuid,
} from "./internals.js";
import {
  DATA_CLASSES,
  type DataClassRoute,
  DEPLOYMENT_MODES,
  type DeploymentMode,
  type EnterpriseActor,
  validateActor,
  validateRunbookReference,
} from "./policy.js";

export const EVIDENCE_KINDS = [
  "identity_access",
  "scim_lifecycle",
  "residency_deployment",
  "recovery_exercise",
  "backup_restore",
  "slo_window",
  "load_capacity",
  "penetration_test",
  "security_compliance",
  "privacy_controls",
  "locale_release",
  "commercial_operations",
  "operational_readiness",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const REQUIRED_AUDIT_EVENT_CLASSES = [
  "administrator_access",
  "alert_change",
  "api_credential_lifecycle",
  "dataset_import_delete",
  "entitlement_change",
  "export_report",
  "login_session_change",
  "model_lifecycle",
  "permission_role_change",
  "policy_denial",
  "scenario_run",
  "subscription_billing_change",
] as const;

export const REQUIRED_LOCALES = [
  "en",
  "fa",
  "de",
  "fr",
  "zh-Hans",
  "ru",
  "es",
  "pt",
  "hi",
  "ar",
  "hy",
  "tr",
] as const;

export interface EvidenceEnvelope {
  readonly schemaVersion: 1;
  readonly evidenceId: string;
  readonly kind: EvidenceKind;
  readonly tenantId: string;
  readonly releaseArtifactSha256: string;
  readonly policyManifestSha256: string;
  readonly topologyManifestSha256: string | null;
  readonly evidenceSource: "externally_attested_execution";
  readonly producer: EnterpriseActor;
  readonly reviewer: EnterpriseActor;
  readonly executedByOrganization: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly revocationReason: string | null;
  readonly environment: "production" | "production_shaped_staging";
  readonly artifactUri: string;
  readonly artifactSha256: string;
  readonly configurationSha256: string;
  readonly verification: {
    readonly statementUri: string;
    readonly statementSha256: string;
    readonly detachedSignatureSha256: string;
    readonly signerKeyId: string;
    readonly verifiedAt: string;
    readonly artifactDigestVerified: true;
    readonly detachedSignatureVerified: true;
    readonly executionEnvironmentVerified: true;
  };
  readonly tool: { readonly name: string; readonly version: string };
  readonly result: "passed" | "failed" | "partially_passed";
  readonly limitations: readonly string[];
}

export interface IdentityAccessPayload {
  readonly kind: "identity_access";
  readonly saml: {
    readonly attempts: number;
    readonly failures: number;
    readonly brokerBoundaryObserved: boolean;
    readonly signedAssertionEnforced: boolean;
    readonly encryptedAssertionEnforced: boolean;
    readonly invalidIssuerRejected: boolean;
    readonly invalidAudienceRejected: boolean;
    readonly replayRejected: boolean;
    readonly excessiveClockSkewRejected: boolean;
  };
  readonly mfa: {
    readonly attempts: number;
    readonly failures: number;
    readonly requiredForAllUsers: boolean;
    readonly phishingResistantForPrivileged: boolean;
    readonly testedStepUpActions: readonly string[];
  };
  readonly session: {
    readonly attempts: number;
    readonly failures: number;
    readonly rotationObserved: boolean;
    readonly refreshReuseRejected: boolean;
    readonly secureCookieObserved: boolean;
    readonly csrfMutationRejected: boolean;
    readonly deviceInventoryObserved: boolean;
    readonly maximumObservedRevocationSeconds: number;
  };
}

export interface ScimLifecyclePayload {
  readonly kind: "scim_lifecycle";
  readonly provisionAttempts: number;
  readonly updateAttempts: number;
  readonly suspendAttempts: number;
  readonly deprovisionAttempts: number;
  readonly failures: number;
  readonly maximumProvisionSeconds: number;
  readonly maximumDeprovisionSeconds: number;
  readonly maximumReconciliationSeconds: number;
  readonly deprovisionedAccessDenied: boolean;
  readonly invalidMappingRejected: boolean;
  readonly pseudonymousSubjectReferences: boolean;
  readonly lifecycleEventLedgerSha256: string;
}

export interface ResidencyDeploymentPayload {
  readonly kind: "residency_deployment";
  readonly deploymentMode: DeploymentMode;
  readonly deploymentContractSha256: string;
  readonly observedRoutes: readonly DataClassRoute[];
  readonly sameApplicationContractsPassed: boolean;
  readonly tenantIsolationPassed: boolean;
  readonly eligibleJobRoutingPassed: boolean;
  readonly crossRegionDenialsPassed: boolean;
  readonly privateNetworkIsolationPassed: boolean;
  readonly egressAllowlistPassed: boolean;
  readonly jitMfaAdministrativeAccessAudited: boolean;
  readonly providerIntegrationsMode: "residency_restricted" | "disabled";
}

export interface RecoveryExercisePayload {
  readonly kind: "recovery_exercise";
  readonly exerciseId: string;
  readonly testedFailureDomains: readonly string[];
  readonly lastDurableWriteAt: string;
  readonly recoveredThroughAt: string;
  readonly disruptionDetectedAt: string;
  readonly criticalServicesRestoredAt: string;
  readonly missingRecords: number;
  readonly duplicateRecords: number;
  readonly tenantIsolationVerified: boolean;
  readonly encryptionVerified: boolean;
  readonly pointInTimeSemanticsVerified: boolean;
  readonly artifactReferencesVerified: boolean;
  readonly policyAndCatalogRecovered: boolean;
  readonly workflowReconciliationVerified: boolean;
  readonly recoveredManifestSha256: string;
}

export interface BackupRestorePayload {
  readonly kind: "backup_restore";
  readonly backupManifestSha256: string;
  readonly restoredManifestSha256: string;
  readonly requestedPointInTime: string;
  readonly restoredPointInTime: string;
  readonly objectVersionsVerified: boolean;
  readonly encryptedAtRestVerified: boolean;
  readonly tenantBoundariesVerified: boolean;
  readonly artifactReferencesVerified: boolean;
  readonly legalHoldsPreserved: boolean;
  readonly restoreWasCleanEnvironment: boolean;
  readonly missingObjects: number;
  readonly corruptObjects: number;
}

export interface SloWindowPayload {
  readonly kind: "slo_window";
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly telemetrySha256: string;
  readonly metrics: readonly {
    readonly service: string;
    readonly objectiveBps: number;
    readonly totalEvents: number;
    readonly goodEvents: number;
    readonly latencyTargetMilliseconds: number;
    readonly p95LatencyMilliseconds: number;
  }[];
}

export interface LoadCapacityPayload {
  readonly kind: "load_capacity";
  readonly declaredWorkload: {
    readonly datasetRecords: number;
    readonly concurrentUsers: number;
    readonly scenarioConcurrency: number;
    readonly targetRequestsPerSecond: number;
    readonly durationSeconds: number;
    readonly warmColdState: "cold" | "warm" | "mixed";
    readonly runnerClass: string;
    readonly hardwareSha256: string;
    readonly commitSha256: string;
    readonly requestDistributionSha256: string;
  };
  readonly declaredThresholds: {
    readonly maximumP95Milliseconds: number;
    readonly maximumP99Milliseconds: number;
    readonly maximumErrorRateBps: number;
    readonly maximumSaturationBps: number;
    readonly minimumHeadroomBps: number;
    readonly maximumQueueAgeP95Milliseconds: number;
  };
  readonly observedResults: {
    readonly samples: number;
    readonly sustainedRequestsPerSecond: number;
    readonly acceptedCapacityRequestsPerSecond: number;
    readonly p95Milliseconds: number;
    readonly p99Milliseconds: number;
    readonly errorRateBps: number;
    readonly saturationBps: number;
    readonly queueAgeP95Milliseconds: number;
  };
}

export interface PenetrationTestPayload {
  readonly kind: "penetration_test";
  readonly scopeSha256: string;
  readonly methodology: string;
  readonly productionShaped: boolean;
  readonly findings: readonly {
    readonly findingId: string;
    readonly severity: "critical" | "high" | "medium" | "low" | "informational";
    readonly status: "open" | "remediated" | "risk_accepted";
    readonly remediationEvidenceSha256: string | null;
    readonly independentlyVerifiedBy: string | null;
    readonly verifiedAt: string | null;
    readonly riskAcceptance: {
      readonly scope: string;
      readonly durationSeconds: number;
      readonly compensatingControl: string;
      readonly approvedBy: string;
      readonly expiresAt: string;
    } | null;
  }[];
}

export interface PrivacyControlsPayload {
  readonly kind: "privacy_controls";
  readonly storesInventoried: readonly string[];
  readonly exportTenantIsolationVerified: boolean;
  readonly exportEntitlementsVerified: boolean;
  readonly sensitiveExportWatermarkVerified: boolean;
  readonly maximumObservedExportExpirySeconds: number;
  readonly deletionInventoryComplete: boolean;
  readonly credentialsRevoked: boolean;
  readonly maximumObservedDeletionSeconds: number;
  readonly backupExpiryScheduledWithinSeconds: number;
  readonly pseudonymousAuditRetentionVerified: boolean;
  readonly legalHoldBlockedDeletion: boolean;
  readonly legalHoldReleaseAudited: boolean;
  readonly directDatabaseDeletionRejected: boolean;
}

export interface SecurityCompliancePayload {
  readonly kind: "security_compliance";
  readonly threatModelSha256: string;
  readonly controlMatrixSha256: string;
  readonly mappedFrameworks: readonly string[];
  readonly testedAuditEventClasses: readonly string[];
  readonly tamperEvidentAuditSequenceVerified: boolean;
  readonly tenantScopedAuditExportVerified: boolean;
  readonly jitMfaReasonExpiryAdminAccessVerified: boolean;
  readonly encryptionInTransitAndAtRestVerified: boolean;
  readonly secretsRedactionAndDlpVerified: boolean;
  readonly shortLivedObjectAccessVerified: boolean;
  readonly forensicPreservationVerified: boolean;
  readonly notificationWorkflowVerified: boolean;
  readonly openControlExceptions: readonly string[];
}

export interface LocaleReleasePayload {
  readonly kind: "locale_release";
  readonly locales: readonly {
    readonly locale: string;
    readonly catalogSha256: string;
    readonly criticalCoverageBps: number;
    readonly generalCoverageBps: number;
    readonly layoutPassed: boolean;
    readonly accessibilityPassed: boolean;
    readonly formatterPassed: boolean;
    readonly qualifiedHumanReviewPassed: boolean;
    readonly rtlPassed: boolean | null;
  }[];
  readonly pseudoLocalePassed: boolean;
  readonly enFaCriticalScreenshotsPassed: boolean;
  readonly representativeScriptsPassed: boolean;
  readonly localeSwitchPreservedContext: boolean;
  readonly translatedLogicAbsent: boolean;
  readonly bidiEconomicValuesPassed: boolean;
  readonly criticalFallbackCount: number;
}

export interface CommercialOperationsPayload {
  readonly kind: "commercial_operations";
  readonly catalogManifestSha256: string;
  readonly entitlementHistoryReplayPassed: boolean;
  readonly securityDenialOverridesEntitlement: boolean;
  readonly providerIdentifiersAbsentFromPolicy: boolean;
  readonly usageReplayDidNotDoubleCharge: boolean;
  readonly correctionsWereAppendOnly: boolean;
  readonly webhookSignatureAndAgeVerified: boolean;
  readonly webhookIdempotencyVerified: boolean;
  readonly providerOutagePreservedLastEntitlement: boolean;
  readonly cancellationPreservedExportRetentionDeletionAndHold: boolean;
  readonly supportEscalationOwner: string;
  readonly billingReconciliationSha256: string;
  readonly reconciliationRuns: number;
  readonly reconciledUsageRecords: number;
  readonly unmatchedUsageRecords: number;
  readonly entitlementMismatches: number;
  readonly incorrectCharges: number;
}

export interface OperationalReadinessPayload {
  readonly kind: "operational_readiness";
  readonly services: readonly {
    readonly service: string;
    readonly owner: string;
    readonly onCallScheduleSha256: string;
    readonly runbookUri: string;
    readonly runbookSha256: string;
    readonly alertPolicySha256: string;
    readonly lastDrillAt: string;
    readonly drillEvidenceSha256: string;
  }[];
  readonly freshEnvironmentPassed: boolean;
  readonly compatibleMigrationUnderTrafficPassed: boolean;
  readonly rollbackRehearsed: boolean;
  readonly workerRedeliveryIdempotencyPassed: boolean;
  readonly syntheticDataProductionGuardPassed: boolean;
  readonly developmentAuthenticationGuardPassed: boolean;
  readonly incidentContainmentAndNotificationRunbookPassed: boolean;
  readonly sbomProduced: boolean;
  readonly provenanceAttested: boolean;
  readonly imagesSigned: boolean;
  readonly dependencySecretSastIacContainerScansPassed: boolean;
}

export type EnterpriseEvidencePayload =
  | IdentityAccessPayload
  | ScimLifecyclePayload
  | ResidencyDeploymentPayload
  | RecoveryExercisePayload
  | BackupRestorePayload
  | SloWindowPayload
  | LoadCapacityPayload
  | PenetrationTestPayload
  | SecurityCompliancePayload
  | PrivacyControlsPayload
  | LocaleReleasePayload
  | CommercialOperationsPayload
  | OperationalReadinessPayload;

export interface EnterpriseEvidenceInput {
  readonly envelope: EvidenceEnvelope;
  readonly payload: EnterpriseEvidencePayload;
}

export type EnterpriseEvidence = Manifest<EnterpriseEvidenceInput>;

function boolean(value: boolean, field: string): void {
  if (typeof value !== "boolean") throw new TypeError(`${field} must be boolean`);
}

function testCounts(attempts: number, failures: number, field: string): void {
  integer(attempts, `${field}.attempts`, 1, 1_000_000);
  integer(failures, `${field}.failures`, 0, attempts);
}

function validateEnvelope(envelope: EvidenceEnvelope): void {
  record(envelope, "evidence.envelope");
  exact(
    envelope,
    [
      "schemaVersion",
      "evidenceId",
      "kind",
      "tenantId",
      "releaseArtifactSha256",
      "policyManifestSha256",
      "topologyManifestSha256",
      "evidenceSource",
      "producer",
      "reviewer",
      "executedByOrganization",
      "startedAt",
      "completedAt",
      "expiresAt",
      "revokedAt",
      "revocationReason",
      "environment",
      "artifactUri",
      "artifactSha256",
      "configurationSha256",
      "verification",
      "tool",
      "result",
      "limitations",
    ],
    "evidence.envelope",
  );
  if (envelope.schemaVersion !== 1)
    throw new TypeError("evidence envelope schemaVersion must be 1");
  uuid(envelope.evidenceId, "evidence.envelope.evidenceId");
  oneOf(envelope.kind, EVIDENCE_KINDS, "evidence.envelope.kind");
  uuid(envelope.tenantId, "evidence.envelope.tenantId");
  sha(envelope.releaseArtifactSha256, "evidence.envelope.releaseArtifactSha256");
  sha(envelope.policyManifestSha256, "evidence.envelope.policyManifestSha256");
  if (envelope.topologyManifestSha256 !== null)
    sha(envelope.topologyManifestSha256, "evidence.envelope.topologyManifestSha256");
  if (envelope.evidenceSource !== "externally_attested_execution") {
    throw new TypeError("plans, synthetic declarations, and unattested evidence are not admitted");
  }
  validateActor(envelope.producer, "evidence.envelope.producer");
  validateActor(envelope.reviewer, "evidence.envelope.reviewer");
  if (
    envelope.producer.role !== "evidence_producer" ||
    envelope.reviewer.role !== "evidence_reviewer" ||
    envelope.producer.actorId === envelope.reviewer.actorId ||
    envelope.producer.tenantId !== envelope.tenantId ||
    envelope.reviewer.tenantId !== envelope.tenantId
  ) {
    throw new TypeError("evidence requires separate producer and reviewer in the same tenant");
  }
  text(envelope.executedByOrganization, "evidence.envelope.executedByOrganization", 200);
  instant(envelope.startedAt, "evidence.envelope.startedAt");
  instant(envelope.completedAt, "evidence.envelope.completedAt");
  instant(envelope.expiresAt, "evidence.envelope.expiresAt");
  if (
    milliseconds(envelope.completedAt, envelope.startedAt) < 0 ||
    milliseconds(envelope.expiresAt, envelope.completedAt) <= 0
  ) {
    throw new TypeError("evidence timestamps must be ordered started, completed, expires");
  }
  if ((envelope.revokedAt === null) !== (envelope.revocationReason === null)) {
    throw new TypeError("evidence revocation time and reason must be supplied together");
  }
  if (envelope.revokedAt !== null && envelope.revocationReason !== null) {
    instant(envelope.revokedAt, "evidence.envelope.revokedAt");
    text(envelope.revocationReason, "evidence.envelope.revocationReason", 500);
    if (
      milliseconds(envelope.revokedAt, envelope.completedAt) < 0 ||
      milliseconds(envelope.expiresAt, envelope.revokedAt) <= 0
    ) {
      throw new TypeError("evidence revocation must occur after completion and before expiry");
    }
  }
  oneOf(
    envelope.environment,
    ["production", "production_shaped_staging"],
    "evidence.envelope.environment",
  );
  httpsOrUrn(envelope.artifactUri, "evidence.envelope.artifactUri");
  sha(envelope.artifactSha256, "evidence.envelope.artifactSha256");
  sha(envelope.configurationSha256, "evidence.envelope.configurationSha256");
  record(envelope.verification, "evidence.envelope.verification");
  exact(
    envelope.verification,
    [
      "statementUri",
      "statementSha256",
      "detachedSignatureSha256",
      "signerKeyId",
      "verifiedAt",
      "artifactDigestVerified",
      "detachedSignatureVerified",
      "executionEnvironmentVerified",
    ],
    "evidence.envelope.verification",
  );
  httpsOrUrn(envelope.verification.statementUri, "evidence.envelope.verification.statementUri");
  sha(envelope.verification.statementSha256, "evidence.envelope.verification.statementSha256");
  sha(
    envelope.verification.detachedSignatureSha256,
    "evidence.envelope.verification.detachedSignatureSha256",
  );
  key(envelope.verification.signerKeyId, "evidence.envelope.verification.signerKeyId");
  instant(envelope.verification.verifiedAt, "evidence.envelope.verification.verifiedAt");
  if (
    milliseconds(envelope.verification.verifiedAt, envelope.completedAt) < 0 ||
    milliseconds(envelope.expiresAt, envelope.verification.verifiedAt) <= 0 ||
    envelope.verification.artifactDigestVerified !== true ||
    envelope.verification.detachedSignatureVerified !== true ||
    envelope.verification.executionEnvironmentVerified !== true
  ) {
    throw new TypeError("external execution attestation is invalid or outside its validity window");
  }
  record(envelope.tool, "evidence.envelope.tool");
  exact(envelope.tool, ["name", "version"], "evidence.envelope.tool");
  text(envelope.tool.name, "evidence.envelope.tool.name", 100);
  text(envelope.tool.version, "evidence.envelope.tool.version", 100);
  oneOf(envelope.result, ["passed", "failed", "partially_passed"], "evidence.envelope.result");
  strings(envelope.limitations, "evidence.envelope.limitations", 0, 32);
}

function validateIdentity(payload: IdentityAccessPayload): void {
  record(payload.saml, "identity.saml");
  exact(
    payload.saml,
    [
      "attempts",
      "failures",
      "brokerBoundaryObserved",
      "signedAssertionEnforced",
      "encryptedAssertionEnforced",
      "invalidIssuerRejected",
      "invalidAudienceRejected",
      "replayRejected",
      "excessiveClockSkewRejected",
    ],
    "identity.saml",
  );
  testCounts(payload.saml.attempts, payload.saml.failures, "identity.saml");
  for (const name of [
    "brokerBoundaryObserved",
    "signedAssertionEnforced",
    "encryptedAssertionEnforced",
    "invalidIssuerRejected",
    "invalidAudienceRejected",
    "replayRejected",
    "excessiveClockSkewRejected",
  ] as const) {
    boolean(payload.saml[name], `identity.saml.${name}`);
  }
  record(payload.mfa, "identity.mfa");
  exact(
    payload.mfa,
    [
      "attempts",
      "failures",
      "requiredForAllUsers",
      "phishingResistantForPrivileged",
      "testedStepUpActions",
    ],
    "identity.mfa",
  );
  testCounts(payload.mfa.attempts, payload.mfa.failures, "identity.mfa");
  boolean(payload.mfa.requiredForAllUsers, "identity.mfa.requiredForAllUsers");
  boolean(
    payload.mfa.phishingResistantForPrivileged,
    "identity.mfa.phishingResistantForPrivileged",
  );
  strings(payload.mfa.testedStepUpActions, "identity.mfa.testedStepUpActions", 1, 32, key);
  record(payload.session, "identity.session");
  exact(
    payload.session,
    [
      "attempts",
      "failures",
      "rotationObserved",
      "refreshReuseRejected",
      "secureCookieObserved",
      "csrfMutationRejected",
      "deviceInventoryObserved",
      "maximumObservedRevocationSeconds",
    ],
    "identity.session",
  );
  testCounts(payload.session.attempts, payload.session.failures, "identity.session");
  for (const name of [
    "rotationObserved",
    "refreshReuseRejected",
    "secureCookieObserved",
    "csrfMutationRejected",
    "deviceInventoryObserved",
  ] as const) {
    boolean(payload.session[name], `identity.session.${name}`);
  }
  integer(
    payload.session.maximumObservedRevocationSeconds,
    "identity.session.maximumObservedRevocationSeconds",
    0,
    86_400,
  );
}

function validateScim(payload: ScimLifecyclePayload): void {
  for (const name of [
    "provisionAttempts",
    "updateAttempts",
    "suspendAttempts",
    "deprovisionAttempts",
  ] as const) {
    integer(payload[name], `scim.${name}`, 1, 1_000_000);
  }
  integer(payload.failures, "scim.failures", 0, 1_000_000);
  if (
    payload.failures >
    payload.provisionAttempts +
      payload.updateAttempts +
      payload.suspendAttempts +
      payload.deprovisionAttempts
  ) {
    throw new TypeError("scim.failures cannot exceed total lifecycle attempts");
  }
  for (const name of [
    "maximumProvisionSeconds",
    "maximumDeprovisionSeconds",
    "maximumReconciliationSeconds",
  ] as const) {
    integer(payload[name], `scim.${name}`, 0, 604_800);
  }
  for (const name of [
    "deprovisionedAccessDenied",
    "invalidMappingRejected",
    "pseudonymousSubjectReferences",
  ] as const) {
    boolean(payload[name], `scim.${name}`);
  }
  sha(payload.lifecycleEventLedgerSha256, "scim.lifecycleEventLedgerSha256");
}

function validateResidency(payload: ResidencyDeploymentPayload): void {
  oneOf(payload.deploymentMode, DEPLOYMENT_MODES, "residency.deploymentMode");
  sha(payload.deploymentContractSha256, "residency.deploymentContractSha256");
  if (
    !Array.isArray(payload.observedRoutes) ||
    payload.observedRoutes.length !== DATA_CLASSES.length
  ) {
    throw new TypeError("residency.observedRoutes must contain every data class exactly once");
  }
  const classes = new Set<string>();
  payload.observedRoutes.forEach((route, index) => {
    const field = `residency.observedRoutes[${index}]`;
    record(route, field);
    exact(
      route,
      [
        "dataClass",
        "storageRegions",
        "processingRegions",
        "backupRegions",
        "supportRegions",
        "exportRegions",
      ],
      field,
    );
    oneOf(route.dataClass, DATA_CLASSES, `${field}.dataClass`);
    if (classes.has(route.dataClass)) {
      throw new TypeError("residency.observedRoutes contains a duplicate data class");
    }
    classes.add(route.dataClass);
    for (const name of [
      "storageRegions",
      "processingRegions",
      "backupRegions",
      "supportRegions",
      "exportRegions",
    ] as const) {
      strings(route[name], `${field}.${name}`, 1, 32, key);
    }
  });
  for (const name of [
    "sameApplicationContractsPassed",
    "tenantIsolationPassed",
    "eligibleJobRoutingPassed",
    "crossRegionDenialsPassed",
    "privateNetworkIsolationPassed",
    "egressAllowlistPassed",
    "jitMfaAdministrativeAccessAudited",
  ] as const) {
    boolean(payload[name], `residency.${name}`);
  }
  oneOf(
    payload.providerIntegrationsMode,
    ["residency_restricted", "disabled"],
    "residency.providerIntegrationsMode",
  );
}

function validateRecovery(payload: RecoveryExercisePayload): void {
  uuid(payload.exerciseId, "recovery.exerciseId");
  strings(payload.testedFailureDomains, "recovery.testedFailureDomains", 1, 128, key);
  for (const name of [
    "lastDurableWriteAt",
    "recoveredThroughAt",
    "disruptionDetectedAt",
    "criticalServicesRestoredAt",
  ] as const)
    instant(payload[name], `recovery.${name}`);
  if (milliseconds(payload.criticalServicesRestoredAt, payload.disruptionDetectedAt) < 0)
    throw new TypeError("recovery restoration precedes disruption");
  integer(payload.missingRecords, "recovery.missingRecords", 0, 1_000_000_000);
  integer(payload.duplicateRecords, "recovery.duplicateRecords", 0, 1_000_000_000);
  for (const name of [
    "tenantIsolationVerified",
    "encryptionVerified",
    "pointInTimeSemanticsVerified",
    "artifactReferencesVerified",
    "policyAndCatalogRecovered",
    "workflowReconciliationVerified",
  ] as const)
    boolean(payload[name], `recovery.${name}`);
  sha(payload.recoveredManifestSha256, "recovery.recoveredManifestSha256");
}

function validateBackup(payload: BackupRestorePayload): void {
  sha(payload.backupManifestSha256, "backup.backupManifestSha256");
  sha(payload.restoredManifestSha256, "backup.restoredManifestSha256");
  instant(payload.requestedPointInTime, "backup.requestedPointInTime");
  instant(payload.restoredPointInTime, "backup.restoredPointInTime");
  if (milliseconds(payload.restoredPointInTime, payload.requestedPointInTime) > 0)
    throw new TypeError("backup restored beyond requested point in time");
  for (const name of [
    "objectVersionsVerified",
    "encryptedAtRestVerified",
    "tenantBoundariesVerified",
    "artifactReferencesVerified",
    "legalHoldsPreserved",
    "restoreWasCleanEnvironment",
  ] as const)
    boolean(payload[name], `backup.${name}`);
  integer(payload.missingObjects, "backup.missingObjects", 0, 1_000_000_000);
  integer(payload.corruptObjects, "backup.corruptObjects", 0, 1_000_000_000);
}

function validateSlo(payload: SloWindowPayload): void {
  instant(payload.windowStart, "slo.windowStart");
  instant(payload.windowEnd, "slo.windowEnd");
  if (milliseconds(payload.windowEnd, payload.windowStart) <= 0)
    throw new TypeError("SLO window must be positive");
  sha(payload.telemetrySha256, "slo.telemetrySha256");
  if (!Array.isArray(payload.metrics) || payload.metrics.length < 1 || payload.metrics.length > 64)
    throw new TypeError("slo.metrics must contain 1..64 services");
  const services = new Set<string>();
  payload.metrics.forEach((metric, index) => {
    const field = `slo.metrics[${index}]`;
    record(metric, field);
    exact(
      metric,
      [
        "service",
        "objectiveBps",
        "totalEvents",
        "goodEvents",
        "latencyTargetMilliseconds",
        "p95LatencyMilliseconds",
      ],
      field,
    );
    key(metric.service, `${field}.service`);
    if (services.has(metric.service))
      throw new TypeError("slo.metrics contains a duplicate service");
    services.add(metric.service);
    integer(metric.objectiveBps, `${field}.objectiveBps`, 0, 10_000);
    integer(metric.totalEvents, `${field}.totalEvents`, 1, 1_000_000_000_000);
    integer(metric.goodEvents, `${field}.goodEvents`, 0, metric.totalEvents);
    integer(metric.latencyTargetMilliseconds, `${field}.latencyTargetMilliseconds`, 1, 3_600_000);
    integer(metric.p95LatencyMilliseconds, `${field}.p95LatencyMilliseconds`, 0, 3_600_000);
  });
}

function validateLoad(payload: LoadCapacityPayload): void {
  record(payload.declaredWorkload, "load.declaredWorkload");
  exact(
    payload.declaredWorkload,
    [
      "datasetRecords",
      "concurrentUsers",
      "scenarioConcurrency",
      "targetRequestsPerSecond",
      "durationSeconds",
      "warmColdState",
      "runnerClass",
      "hardwareSha256",
      "commitSha256",
      "requestDistributionSha256",
    ],
    "load.declaredWorkload",
  );
  integer(
    payload.declaredWorkload.datasetRecords,
    "load.declaredWorkload.datasetRecords",
    1,
    1_000_000_000_000,
  );
  integer(
    payload.declaredWorkload.concurrentUsers,
    "load.declaredWorkload.concurrentUsers",
    1,
    10_000_000,
  );
  integer(
    payload.declaredWorkload.scenarioConcurrency,
    "load.declaredWorkload.scenarioConcurrency",
    1,
    1_000_000,
  );
  integer(
    payload.declaredWorkload.targetRequestsPerSecond,
    "load.declaredWorkload.targetRequestsPerSecond",
    1,
    10_000_000,
  );
  integer(
    payload.declaredWorkload.durationSeconds,
    "load.declaredWorkload.durationSeconds",
    60,
    604_800,
  );
  oneOf(
    payload.declaredWorkload.warmColdState,
    ["cold", "warm", "mixed"],
    "load.declaredWorkload.warmColdState",
  );
  text(payload.declaredWorkload.runnerClass, "load.declaredWorkload.runnerClass", 200);
  sha(payload.declaredWorkload.hardwareSha256, "load.declaredWorkload.hardwareSha256");
  sha(payload.declaredWorkload.commitSha256, "load.declaredWorkload.commitSha256");
  sha(
    payload.declaredWorkload.requestDistributionSha256,
    "load.declaredWorkload.requestDistributionSha256",
  );
  record(payload.declaredThresholds, "load.declaredThresholds");
  exact(
    payload.declaredThresholds,
    [
      "maximumP95Milliseconds",
      "maximumP99Milliseconds",
      "maximumErrorRateBps",
      "maximumSaturationBps",
      "minimumHeadroomBps",
      "maximumQueueAgeP95Milliseconds",
    ],
    "load.declaredThresholds",
  );
  integer(
    payload.declaredThresholds.maximumP95Milliseconds,
    "load.declaredThresholds.maximumP95Milliseconds",
    1,
    3_600_000,
  );
  integer(
    payload.declaredThresholds.maximumP99Milliseconds,
    "load.declaredThresholds.maximumP99Milliseconds",
    payload.declaredThresholds.maximumP95Milliseconds,
    3_600_000,
  );
  integer(
    payload.declaredThresholds.maximumErrorRateBps,
    "load.declaredThresholds.maximumErrorRateBps",
    0,
    10_000,
  );
  integer(
    payload.declaredThresholds.maximumSaturationBps,
    "load.declaredThresholds.maximumSaturationBps",
    1,
    10_000,
  );
  integer(
    payload.declaredThresholds.minimumHeadroomBps,
    "load.declaredThresholds.minimumHeadroomBps",
    0,
    100_000,
  );
  integer(
    payload.declaredThresholds.maximumQueueAgeP95Milliseconds,
    "load.declaredThresholds.maximumQueueAgeP95Milliseconds",
    0,
    3_600_000,
  );
  record(payload.observedResults, "load.observedResults");
  exact(
    payload.observedResults,
    [
      "samples",
      "sustainedRequestsPerSecond",
      "acceptedCapacityRequestsPerSecond",
      "p95Milliseconds",
      "p99Milliseconds",
      "errorRateBps",
      "saturationBps",
      "queueAgeP95Milliseconds",
    ],
    "load.observedResults",
  );
  integer(payload.observedResults.samples, "load.observedResults.samples", 1, 1_000_000_000_000);
  for (const name of ["sustainedRequestsPerSecond", "acceptedCapacityRequestsPerSecond"] as const)
    integer(payload.observedResults[name], `load.observedResults.${name}`, 1, 10_000_000);
  for (const name of ["p95Milliseconds", "p99Milliseconds", "queueAgeP95Milliseconds"] as const)
    integer(payload.observedResults[name], `load.observedResults.${name}`, 0, 3_600_000);
  integer(payload.observedResults.errorRateBps, "load.observedResults.errorRateBps", 0, 10_000);
  integer(payload.observedResults.saturationBps, "load.observedResults.saturationBps", 0, 10_000);
  if (payload.observedResults.p99Milliseconds < payload.observedResults.p95Milliseconds)
    throw new TypeError("load p99 must be at least p95");
}

function validatePenTest(payload: PenetrationTestPayload): void {
  sha(payload.scopeSha256, "pentest.scopeSha256");
  text(payload.methodology, "pentest.methodology", 1_000);
  boolean(payload.productionShaped, "pentest.productionShaped");
  if (!Array.isArray(payload.findings) || payload.findings.length > 500)
    throw new TypeError("pentest.findings must contain 0..500 findings");
  const ids = new Set<string>();
  payload.findings.forEach((finding, index) => {
    const field = `pentest.findings[${index}]`;
    record(finding, field);
    exact(
      finding,
      [
        "findingId",
        "severity",
        "status",
        "remediationEvidenceSha256",
        "independentlyVerifiedBy",
        "verifiedAt",
        "riskAcceptance",
      ],
      field,
    );
    key(finding.findingId, `${field}.findingId`);
    if (ids.has(finding.findingId)) throw new TypeError("pentest findings contain a duplicate ID");
    ids.add(finding.findingId);
    oneOf(
      finding.severity,
      ["critical", "high", "medium", "low", "informational"],
      `${field}.severity`,
    );
    oneOf(finding.status, ["open", "remediated", "risk_accepted"], `${field}.status`);
    if (finding.status === "remediated") {
      if (
        finding.remediationEvidenceSha256 === null ||
        finding.independentlyVerifiedBy === null ||
        finding.verifiedAt === null ||
        finding.riskAcceptance !== null
      )
        throw new TypeError(`${field} remediation evidence is incomplete`);
      sha(finding.remediationEvidenceSha256, `${field}.remediationEvidenceSha256`);
      uuid(finding.independentlyVerifiedBy, `${field}.independentlyVerifiedBy`);
      instant(finding.verifiedAt, `${field}.verifiedAt`);
    } else if (finding.status === "risk_accepted") {
      if (
        finding.severity === "critical" ||
        finding.riskAcceptance === null ||
        finding.remediationEvidenceSha256 !== null ||
        finding.independentlyVerifiedBy !== null ||
        finding.verifiedAt !== null
      )
        throw new TypeError(`${field} risk acceptance is invalid`);
      record(finding.riskAcceptance, `${field}.riskAcceptance`);
      exact(
        finding.riskAcceptance,
        ["scope", "durationSeconds", "compensatingControl", "approvedBy", "expiresAt"],
        `${field}.riskAcceptance`,
      );
      text(finding.riskAcceptance.scope, `${field}.riskAcceptance.scope`, 500);
      integer(
        finding.riskAcceptance.durationSeconds,
        `${field}.riskAcceptance.durationSeconds`,
        1,
        31_536_000,
      );
      text(
        finding.riskAcceptance.compensatingControl,
        `${field}.riskAcceptance.compensatingControl`,
        1_000,
      );
      uuid(finding.riskAcceptance.approvedBy, `${field}.riskAcceptance.approvedBy`);
      instant(finding.riskAcceptance.expiresAt, `${field}.riskAcceptance.expiresAt`);
    } else if (
      finding.remediationEvidenceSha256 !== null ||
      finding.independentlyVerifiedBy !== null ||
      finding.verifiedAt !== null ||
      finding.riskAcceptance !== null
    ) {
      throw new TypeError(`${field} open finding cannot carry closure evidence`);
    }
  });
}

function validatePrivacy(payload: PrivacyControlsPayload): void {
  strings(payload.storesInventoried, "privacy.storesInventoried", 1, 64, key);
  for (const name of [
    "exportTenantIsolationVerified",
    "exportEntitlementsVerified",
    "sensitiveExportWatermarkVerified",
    "deletionInventoryComplete",
    "credentialsRevoked",
    "pseudonymousAuditRetentionVerified",
    "legalHoldBlockedDeletion",
    "legalHoldReleaseAudited",
    "directDatabaseDeletionRejected",
  ] as const)
    boolean(payload[name], `privacy.${name}`);
  integer(
    payload.maximumObservedExportExpirySeconds,
    "privacy.maximumObservedExportExpirySeconds",
    0,
    604_800,
  );
  integer(
    payload.maximumObservedDeletionSeconds,
    "privacy.maximumObservedDeletionSeconds",
    0,
    31_536_000,
  );
  integer(
    payload.backupExpiryScheduledWithinSeconds,
    "privacy.backupExpiryScheduledWithinSeconds",
    0,
    31_536_000,
  );
}

function validateSecurityCompliance(payload: SecurityCompliancePayload): void {
  sha(payload.threatModelSha256, "security.threatModelSha256");
  sha(payload.controlMatrixSha256, "security.controlMatrixSha256");
  strings(payload.mappedFrameworks, "security.mappedFrameworks", 1, 32, key);
  strings(payload.testedAuditEventClasses, "security.testedAuditEventClasses", 1, 64, key);
  for (const name of [
    "tamperEvidentAuditSequenceVerified",
    "tenantScopedAuditExportVerified",
    "jitMfaReasonExpiryAdminAccessVerified",
    "encryptionInTransitAndAtRestVerified",
    "secretsRedactionAndDlpVerified",
    "shortLivedObjectAccessVerified",
    "forensicPreservationVerified",
    "notificationWorkflowVerified",
  ] as const) {
    boolean(payload[name], `security.${name}`);
  }
  strings(payload.openControlExceptions, "security.openControlExceptions", 0, 64, key);
}

function validateLocales(payload: LocaleReleasePayload): void {
  if (!Array.isArray(payload.locales) || payload.locales.length !== REQUIRED_LOCALES.length)
    throw new TypeError("locale evidence must contain every target locale exactly once");
  const locales = new Set<string>();
  payload.locales.forEach((locale, index) => {
    const field = `locale.locales[${index}]`;
    record(locale, field);
    exact(
      locale,
      [
        "locale",
        "catalogSha256",
        "criticalCoverageBps",
        "generalCoverageBps",
        "layoutPassed",
        "accessibilityPassed",
        "formatterPassed",
        "qualifiedHumanReviewPassed",
        "rtlPassed",
      ],
      field,
    );
    oneOf(locale.locale, REQUIRED_LOCALES, `${field}.locale`);
    if (locales.has(locale.locale))
      throw new TypeError("locale evidence contains a duplicate locale");
    locales.add(locale.locale);
    sha(locale.catalogSha256, `${field}.catalogSha256`);
    integer(locale.criticalCoverageBps, `${field}.criticalCoverageBps`, 0, 10_000);
    integer(locale.generalCoverageBps, `${field}.generalCoverageBps`, 0, 10_000);
    for (const name of [
      "layoutPassed",
      "accessibilityPassed",
      "formatterPassed",
      "qualifiedHumanReviewPassed",
    ] as const)
      boolean(locale[name], `${field}.${name}`);
    if (locale.locale === "fa" || locale.locale === "ar")
      boolean(locale.rtlPassed as boolean, `${field}.rtlPassed`);
    else if (locale.rtlPassed !== null)
      throw new TypeError(`${field}.rtlPassed must be null for LTR locales`);
  });
  for (const name of [
    "pseudoLocalePassed",
    "enFaCriticalScreenshotsPassed",
    "representativeScriptsPassed",
    "localeSwitchPreservedContext",
    "translatedLogicAbsent",
    "bidiEconomicValuesPassed",
  ] as const)
    boolean(payload[name], `locale.${name}`);
  integer(payload.criticalFallbackCount, "locale.criticalFallbackCount", 0, 1_000_000_000);
}

function validateCommercial(payload: CommercialOperationsPayload): void {
  sha(payload.catalogManifestSha256, "commercial.catalogManifestSha256");
  for (const name of [
    "entitlementHistoryReplayPassed",
    "securityDenialOverridesEntitlement",
    "providerIdentifiersAbsentFromPolicy",
    "usageReplayDidNotDoubleCharge",
    "correctionsWereAppendOnly",
    "webhookSignatureAndAgeVerified",
    "webhookIdempotencyVerified",
    "providerOutagePreservedLastEntitlement",
    "cancellationPreservedExportRetentionDeletionAndHold",
  ] as const)
    boolean(payload[name], `commercial.${name}`);
  text(payload.supportEscalationOwner, "commercial.supportEscalationOwner", 200);
  sha(payload.billingReconciliationSha256, "commercial.billingReconciliationSha256");
  integer(payload.reconciliationRuns, "commercial.reconciliationRuns", 1, 1_000_000);
  integer(
    payload.reconciledUsageRecords,
    "commercial.reconciledUsageRecords",
    1,
    1_000_000_000_000,
  );
  for (const name of [
    "unmatchedUsageRecords",
    "entitlementMismatches",
    "incorrectCharges",
  ] as const) {
    integer(payload[name], `commercial.${name}`, 0, 1_000_000_000_000);
  }
}

function validateOperations(payload: OperationalReadinessPayload): void {
  if (
    !Array.isArray(payload.services) ||
    payload.services.length < 1 ||
    payload.services.length > 64
  )
    throw new TypeError("operations.services must contain 1..64 services");
  const services = new Set<string>();
  payload.services.forEach((service, index) => {
    const field = `operations.services[${index}]`;
    record(service, field);
    exact(
      service,
      [
        "service",
        "owner",
        "onCallScheduleSha256",
        "runbookUri",
        "runbookSha256",
        "alertPolicySha256",
        "lastDrillAt",
        "drillEvidenceSha256",
      ],
      field,
    );
    key(service.service, `${field}.service`);
    if (services.has(service.service))
      throw new TypeError("operations contains a duplicate service");
    services.add(service.service);
    text(service.owner, `${field}.owner`, 200);
    sha(service.onCallScheduleSha256, `${field}.onCallScheduleSha256`);
    validateRunbookReference(service.runbookUri, service.runbookSha256, `${field}.runbook`);
    sha(service.alertPolicySha256, `${field}.alertPolicySha256`);
    instant(service.lastDrillAt, `${field}.lastDrillAt`);
    sha(service.drillEvidenceSha256, `${field}.drillEvidenceSha256`);
  });
  for (const name of [
    "freshEnvironmentPassed",
    "compatibleMigrationUnderTrafficPassed",
    "rollbackRehearsed",
    "workerRedeliveryIdempotencyPassed",
    "syntheticDataProductionGuardPassed",
    "developmentAuthenticationGuardPassed",
    "incidentContainmentAndNotificationRunbookPassed",
    "sbomProduced",
    "provenanceAttested",
    "imagesSigned",
    "dependencySecretSastIacContainerScansPassed",
  ] as const)
    boolean(payload[name], `operations.${name}`);
}

const PAYLOAD_KEYS: Record<EvidenceKind, readonly string[]> = {
  identity_access: ["kind", "saml", "mfa", "session"],
  scim_lifecycle: [
    "kind",
    "provisionAttempts",
    "updateAttempts",
    "suspendAttempts",
    "deprovisionAttempts",
    "failures",
    "maximumProvisionSeconds",
    "maximumDeprovisionSeconds",
    "maximumReconciliationSeconds",
    "deprovisionedAccessDenied",
    "invalidMappingRejected",
    "pseudonymousSubjectReferences",
    "lifecycleEventLedgerSha256",
  ],
  residency_deployment: [
    "kind",
    "deploymentMode",
    "deploymentContractSha256",
    "observedRoutes",
    "sameApplicationContractsPassed",
    "tenantIsolationPassed",
    "eligibleJobRoutingPassed",
    "crossRegionDenialsPassed",
    "privateNetworkIsolationPassed",
    "egressAllowlistPassed",
    "jitMfaAdministrativeAccessAudited",
    "providerIntegrationsMode",
  ],
  recovery_exercise: [
    "kind",
    "exerciseId",
    "testedFailureDomains",
    "lastDurableWriteAt",
    "recoveredThroughAt",
    "disruptionDetectedAt",
    "criticalServicesRestoredAt",
    "missingRecords",
    "duplicateRecords",
    "tenantIsolationVerified",
    "encryptionVerified",
    "pointInTimeSemanticsVerified",
    "artifactReferencesVerified",
    "policyAndCatalogRecovered",
    "workflowReconciliationVerified",
    "recoveredManifestSha256",
  ],
  backup_restore: [
    "kind",
    "backupManifestSha256",
    "restoredManifestSha256",
    "requestedPointInTime",
    "restoredPointInTime",
    "objectVersionsVerified",
    "encryptedAtRestVerified",
    "tenantBoundariesVerified",
    "artifactReferencesVerified",
    "legalHoldsPreserved",
    "restoreWasCleanEnvironment",
    "missingObjects",
    "corruptObjects",
  ],
  slo_window: ["kind", "windowStart", "windowEnd", "telemetrySha256", "metrics"],
  load_capacity: ["kind", "declaredWorkload", "declaredThresholds", "observedResults"],
  penetration_test: ["kind", "scopeSha256", "methodology", "productionShaped", "findings"],
  security_compliance: [
    "kind",
    "threatModelSha256",
    "controlMatrixSha256",
    "mappedFrameworks",
    "testedAuditEventClasses",
    "tamperEvidentAuditSequenceVerified",
    "tenantScopedAuditExportVerified",
    "jitMfaReasonExpiryAdminAccessVerified",
    "encryptionInTransitAndAtRestVerified",
    "secretsRedactionAndDlpVerified",
    "shortLivedObjectAccessVerified",
    "forensicPreservationVerified",
    "notificationWorkflowVerified",
    "openControlExceptions",
  ],
  privacy_controls: [
    "kind",
    "storesInventoried",
    "exportTenantIsolationVerified",
    "exportEntitlementsVerified",
    "sensitiveExportWatermarkVerified",
    "maximumObservedExportExpirySeconds",
    "deletionInventoryComplete",
    "credentialsRevoked",
    "maximumObservedDeletionSeconds",
    "backupExpiryScheduledWithinSeconds",
    "pseudonymousAuditRetentionVerified",
    "legalHoldBlockedDeletion",
    "legalHoldReleaseAudited",
    "directDatabaseDeletionRejected",
  ],
  locale_release: [
    "kind",
    "locales",
    "pseudoLocalePassed",
    "enFaCriticalScreenshotsPassed",
    "representativeScriptsPassed",
    "localeSwitchPreservedContext",
    "translatedLogicAbsent",
    "bidiEconomicValuesPassed",
    "criticalFallbackCount",
  ],
  commercial_operations: [
    "kind",
    "catalogManifestSha256",
    "entitlementHistoryReplayPassed",
    "securityDenialOverridesEntitlement",
    "providerIdentifiersAbsentFromPolicy",
    "usageReplayDidNotDoubleCharge",
    "correctionsWereAppendOnly",
    "webhookSignatureAndAgeVerified",
    "webhookIdempotencyVerified",
    "providerOutagePreservedLastEntitlement",
    "cancellationPreservedExportRetentionDeletionAndHold",
    "supportEscalationOwner",
    "billingReconciliationSha256",
    "reconciliationRuns",
    "reconciledUsageRecords",
    "unmatchedUsageRecords",
    "entitlementMismatches",
    "incorrectCharges",
  ],
  operational_readiness: [
    "kind",
    "services",
    "freshEnvironmentPassed",
    "compatibleMigrationUnderTrafficPassed",
    "rollbackRehearsed",
    "workerRedeliveryIdempotencyPassed",
    "syntheticDataProductionGuardPassed",
    "developmentAuthenticationGuardPassed",
    "incidentContainmentAndNotificationRunbookPassed",
    "sbomProduced",
    "provenanceAttested",
    "imagesSigned",
    "dependencySecretSastIacContainerScansPassed",
  ],
};

function validatePayload(payload: EnterpriseEvidencePayload): void {
  record(payload, "evidence.payload");
  oneOf(payload.kind, EVIDENCE_KINDS, "evidence.payload.kind");
  exact(payload, PAYLOAD_KEYS[payload.kind], "evidence.payload");
  switch (payload.kind) {
    case "identity_access":
      validateIdentity(payload);
      break;
    case "scim_lifecycle":
      validateScim(payload);
      break;
    case "residency_deployment":
      validateResidency(payload);
      break;
    case "recovery_exercise":
      validateRecovery(payload);
      break;
    case "backup_restore":
      validateBackup(payload);
      break;
    case "slo_window":
      validateSlo(payload);
      break;
    case "load_capacity":
      validateLoad(payload);
      break;
    case "penetration_test":
      validatePenTest(payload);
      break;
    case "security_compliance":
      validateSecurityCompliance(payload);
      break;
    case "privacy_controls":
      validatePrivacy(payload);
      break;
    case "locale_release":
      validateLocales(payload);
      break;
    case "commercial_operations":
      validateCommercial(payload);
      break;
    case "operational_readiness":
      validateOperations(payload);
      break;
  }
}

function validateEvidenceInput(input: EnterpriseEvidenceInput): void {
  record(input, "evidence");
  exact(input, ["envelope", "payload"], "evidence");
  validateEnvelope(input.envelope);
  validatePayload(input.payload);
  if (input.envelope.kind !== input.payload.kind)
    throw new TypeError("evidence envelope and payload kinds differ");
  const { completedAt, startedAt } = input.envelope;
  switch (input.payload.kind) {
    case "recovery_exercise":
      if (
        milliseconds(input.payload.disruptionDetectedAt, startedAt) < 0 ||
        milliseconds(input.payload.criticalServicesRestoredAt, completedAt) > 0 ||
        milliseconds(input.payload.lastDurableWriteAt, completedAt) > 0 ||
        milliseconds(input.payload.recoveredThroughAt, input.payload.lastDurableWriteAt) > 0
      ) {
        throw new TypeError("recovery observations fall outside the executed exercise window");
      }
      break;
    case "backup_restore":
      if (
        milliseconds(input.payload.requestedPointInTime, completedAt) > 0 ||
        milliseconds(input.payload.restoredPointInTime, completedAt) > 0
      ) {
        throw new TypeError("backup observations cannot postdate evidence completion");
      }
      break;
    case "slo_window":
      if (milliseconds(input.payload.windowEnd, completedAt) > 0) {
        throw new TypeError("SLO observation window cannot postdate evidence completion");
      }
      break;
    case "penetration_test":
      for (const finding of input.payload.findings) {
        if (finding.verifiedAt !== null && milliseconds(finding.verifiedAt, completedAt) > 0) {
          throw new TypeError(
            "penetration remediation cannot be verified after evidence completion",
          );
        }
        if (
          finding.riskAcceptance !== null &&
          milliseconds(finding.riskAcceptance.expiresAt, completedAt) <= 0
        ) {
          throw new TypeError("penetration risk acceptance must remain active after completion");
        }
      }
      break;
    case "operational_readiness":
      if (
        input.payload.services.some((service) => milliseconds(service.lastDrillAt, completedAt) > 0)
      ) {
        throw new TypeError("operational drills cannot postdate evidence completion");
      }
      break;
    default:
      break;
  }
}

export function admitEnterpriseEvidence(input: EnterpriseEvidenceInput): EnterpriseEvidence {
  validateEvidenceInput(input);
  return manifest(input);
}

export function assertEnterpriseEvidence(evidence: EnterpriseEvidence): void {
  record(evidence, "evidence");
  integrity(evidence, "evidence");
  const { manifestSha256: _manifestSha256, ...body } = evidence;
  validateEvidenceInput(body);
}

export function observedRecovery(evidence: EnterpriseEvidence): {
  readonly rpoSeconds: number;
  readonly rtoSeconds: number;
} {
  assertEnterpriseEvidence(evidence);
  if (evidence.payload.kind !== "recovery_exercise")
    throw new TypeError("recovery evidence required");
  return {
    rpoSeconds: secondsCeil(
      evidence.payload.lastDurableWriteAt,
      evidence.payload.recoveredThroughAt,
    ),
    rtoSeconds: secondsCeil(
      evidence.payload.criticalServicesRestoredAt,
      evidence.payload.disruptionDetectedAt,
    ),
  };
}

export interface SloErrorBudgetMetric {
  readonly service: string;
  readonly allowedBadEvents: number;
  readonly consumedBadEvents: number;
  readonly remainingBadEvents: number;
  readonly achievedBps: number;
}

export function observedSloErrorBudgets(
  evidence: EnterpriseEvidence,
): readonly SloErrorBudgetMetric[] {
  assertEnterpriseEvidence(evidence);
  if (evidence.payload.kind !== "slo_window") throw new TypeError("SLO evidence required");
  return evidence.payload.metrics.map((metric) => {
    const allowedBadEvents = Number(
      (BigInt(metric.totalEvents) * BigInt(10_000 - metric.objectiveBps)) / 10_000n,
    );
    const consumedBadEvents = metric.totalEvents - metric.goodEvents;
    return {
      service: metric.service,
      allowedBadEvents,
      consumedBadEvents,
      remainingBadEvents: allowedBadEvents - consumedBadEvents,
      achievedBps: Number((BigInt(metric.goodEvents) * 10_000n) / BigInt(metric.totalEvents)),
    };
  });
}

export function observedCapacityHeadroomBps(evidence: EnterpriseEvidence): number {
  assertEnterpriseEvidence(evidence);
  if (evidence.payload.kind !== "load_capacity")
    throw new TypeError("load/capacity evidence required");
  const observed = evidence.payload.observedResults;
  return Math.floor(
    ((observed.acceptedCapacityRequestsPerSecond - observed.sustainedRequestsPerSecond) * 10_000) /
      observed.sustainedRequestsPerSecond,
  );
}
