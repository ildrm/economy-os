import {
  admitEnterpriseEvidence,
  assessEnterpriseRelease,
  createEnterpriseTenantPolicy,
  createProductionTopology,
  DATA_CLASSES,
  type EnterpriseActor,
  type EnterpriseEvidence,
  type EnterpriseEvidenceInput,
  type EnterpriseEvidencePayload,
  type EnterpriseReleaseAssessmentInput,
  type EnterpriseTenantPolicyInput,
  EVIDENCE_KINDS,
  type EvidenceKind,
  type ProductionTopologyInput,
  REQUIRED_AUDIT_EVENT_CLASSES,
  REQUIRED_LOCALES,
} from "./index.js";

export const TENANT = "11111111-1111-4111-8111-111111111111";
export const OTHER_TENANT = "99999999-9999-4999-8999-999999999999";
export const RELEASE_ID = "11111111-1111-4111-8111-111111111112";
export const ARTIFACT = "a".repeat(64);
export const ASSESSED_AT = "2026-06-01T00:00:00Z";
export const POLICY_OWNER: EnterpriseActor = {
  actorId: "11111111-1111-4111-8111-111111111121",
  tenantId: TENANT,
  role: "policy_owner",
};
export const ASSESSOR: EnterpriseActor = {
  actorId: "11111111-1111-4111-8111-111111111122",
  tenantId: TENANT,
  role: "release_assessor",
};
export const APPROVER: EnterpriseActor = {
  actorId: "11111111-1111-4111-8111-111111111123",
  tenantId: TENANT,
  role: "independent_release_approver",
};

const actor = (
  suffix: string,
  role: "evidence_producer" | "evidence_reviewer",
): EnterpriseActor => ({
  actorId: `11111111-1111-4111-8111-${suffix.padStart(12, "0")}`,
  tenantId: TENANT,
  role,
});

export function policyInput(): EnterpriseTenantPolicyInput {
  return {
    schemaVersion: 1,
    tenantId: TENANT,
    policyId: "11111111-1111-4111-8111-111111111130",
    policyVersion: 1,
    previousManifestSha256: null,
    createdAt: "2026-01-01T00:00:00Z",
    createdBy: POLICY_OWNER,
    identity: {
      samlRequired: true,
      brokeredIdentityBoundaryRequired: true,
      signedAssertionsRequired: true,
      encryptedAssertionsRequired: true,
      idpConfigurationSha256: "b".repeat(64),
      allowedClockSkewSeconds: 60,
      mfaRequired: true,
      phishingResistantMfaForPrivileged: true,
      stepUpActions: ["model.deploy", "tenant.delete"],
      session: {
        maximumLifetimeSeconds: 28_800,
        idleTimeoutSeconds: 1_800,
        rotationIntervalSeconds: 300,
        refreshReuseDetectionRequired: true,
        revocationTargetSeconds: 60,
        secureHttpOnlySameSiteCookiesRequired: true,
        csrfProtectionRequired: true,
      },
    },
    scim: {
      required: true,
      configurationSha256: "c".repeat(64),
      provisioningTargetSeconds: 300,
      deprovisioningTargetSeconds: 60,
      reconciliationTargetSeconds: 3_600,
      failClosedOnInvalidMapping: true,
    },
    residency: {
      deploymentMode: "dedicated_managed",
      primaryRegion: "eu-west-1",
      allowedRegions: ["eu-west-1", "eu-central-1"],
      routes: DATA_CLASSES.map((dataClass) => ({
        dataClass,
        storageRegions: ["eu-west-1"],
        processingRegions: ["eu-west-1"],
        backupRegions: ["eu-central-1"],
        supportRegions: ["eu-west-1"],
        exportRegions: ["eu-west-1"],
      })),
    },
    reliability: {
      criticalRpoTargetSeconds: 300,
      criticalRtoTargetSeconds: 3_600,
      minimumFailureDomains: 3,
      minimumSloObjectiveBps: 9_900,
      minimumSloWindowSeconds: 604_800,
      maximumEvidenceAgeSeconds: 31_536_000,
      minimumEvidenceValiditySeconds: 3_600,
    },
    privacy: {
      exportExpiryTargetSeconds: 3_600,
      deletionTargetSeconds: 604_800,
      backupDeletionTargetSeconds: 2_592_000,
      legalHoldEnforcementRequired: true,
      pseudonymousAuditRetentionRequired: true,
    },
    localization: {
      generalCoverageThresholdBps: 9_500,
      humanReviewRequired: true,
      pseudoLocaleRequired: true,
    },
  };
}

export function topologyInput(policyManifestSha256: string): ProductionTopologyInput {
  return {
    schemaVersion: 1,
    topologyId: "11111111-1111-4111-8111-111111111131",
    topologyVersion: 1,
    tenantId: TENANT,
    policyManifestSha256,
    declaredAt: "2026-01-02T00:00:00Z",
    declaredBy: POLICY_OWNER,
    regions: ["eu-west-1", "eu-central-1"],
    failureDomains: ["eu-west-1a", "eu-west-1b", "eu-west-1c"],
    dataStores: ["object-store", "postgresql", "search-index", "workflow-history"],
    criticalServices: ["evidence-api", "alert-triage"].map((service) => ({
      service,
      activeFailureDomains: ["eu-west-1a", "eu-west-1b", "eu-west-1c"],
      stateful: service === "evidence-api",
    })),
    synchronousRegionalDatabaseHa: true,
    encryptedPointInTimeBackups: true,
    objectVersioningAndReplication: true,
    durableWorkflowPersistence: true,
    defaultDenyNetworkPolicy: true,
    tlsEverywhere: true,
    privateNetworkIsolation: true,
    workloadIdentity: true,
    jitMfaAdministrativeAccess: true,
    externalProviderMode: "residency_restricted",
    deploymentContractSha256: "d".repeat(64),
    policyCatalogIncludedInRecovery: true,
  };
}

function payload(kind: EvidenceKind): EnterpriseEvidencePayload {
  switch (kind) {
    case "identity_access":
      return {
        kind,
        saml: {
          attempts: 8,
          failures: 0,
          brokerBoundaryObserved: true,
          signedAssertionEnforced: true,
          encryptedAssertionEnforced: true,
          invalidIssuerRejected: true,
          invalidAudienceRejected: true,
          replayRejected: true,
          excessiveClockSkewRejected: true,
        },
        mfa: {
          attempts: 5,
          failures: 0,
          requiredForAllUsers: true,
          phishingResistantForPrivileged: true,
          testedStepUpActions: ["model.deploy", "tenant.delete"],
        },
        session: {
          attempts: 7,
          failures: 0,
          rotationObserved: true,
          refreshReuseRejected: true,
          secureCookieObserved: true,
          csrfMutationRejected: true,
          deviceInventoryObserved: true,
          maximumObservedRevocationSeconds: 30,
        },
      };
    case "scim_lifecycle":
      return {
        kind,
        provisionAttempts: 10,
        updateAttempts: 10,
        suspendAttempts: 5,
        deprovisionAttempts: 5,
        failures: 0,
        maximumProvisionSeconds: 120,
        maximumDeprovisionSeconds: 30,
        maximumReconciliationSeconds: 1_800,
        deprovisionedAccessDenied: true,
        invalidMappingRejected: true,
        pseudonymousSubjectReferences: true,
        lifecycleEventLedgerSha256: "d".repeat(64),
      };
    case "residency_deployment":
      return {
        kind,
        deploymentMode: "dedicated_managed",
        deploymentContractSha256: "d".repeat(64),
        observedRoutes: DATA_CLASSES.map((dataClass) => ({
          dataClass,
          storageRegions: ["eu-west-1"],
          processingRegions: ["eu-west-1"],
          backupRegions: ["eu-central-1"],
          supportRegions: ["eu-west-1"],
          exportRegions: ["eu-west-1"],
        })),
        sameApplicationContractsPassed: true,
        tenantIsolationPassed: true,
        eligibleJobRoutingPassed: true,
        crossRegionDenialsPassed: true,
        privateNetworkIsolationPassed: true,
        egressAllowlistPassed: true,
        jitMfaAdministrativeAccessAudited: true,
        providerIntegrationsMode: "residency_restricted",
      };
    case "recovery_exercise":
      return {
        kind,
        exerciseId: "11111111-1111-4111-8111-111111111140",
        testedFailureDomains: ["eu-west-1a", "eu-west-1b", "eu-west-1c"],
        lastDurableWriteAt: "2026-05-31T21:59:00Z",
        recoveredThroughAt: "2026-05-31T21:58:00Z",
        disruptionDetectedAt: "2026-05-31T21:00:00Z",
        criticalServicesRestoredAt: "2026-05-31T21:30:00Z",
        missingRecords: 0,
        duplicateRecords: 0,
        tenantIsolationVerified: true,
        encryptionVerified: true,
        pointInTimeSemanticsVerified: true,
        artifactReferencesVerified: true,
        policyAndCatalogRecovered: true,
        workflowReconciliationVerified: true,
        recoveredManifestSha256: "e".repeat(64),
      };
    case "backup_restore":
      return {
        kind,
        backupManifestSha256: "f".repeat(64),
        restoredManifestSha256: "f".repeat(64),
        requestedPointInTime: "2026-05-31T22:00:00Z",
        restoredPointInTime: "2026-05-31T21:59:00Z",
        objectVersionsVerified: true,
        encryptedAtRestVerified: true,
        tenantBoundariesVerified: true,
        artifactReferencesVerified: true,
        legalHoldsPreserved: true,
        restoreWasCleanEnvironment: true,
        missingObjects: 0,
        corruptObjects: 0,
      };
    case "slo_window":
      return {
        kind,
        windowStart: "2026-05-01T00:00:00Z",
        windowEnd: "2026-05-31T00:00:00Z",
        telemetrySha256: "1".repeat(64),
        metrics: ["evidence-api", "alert-triage"].map((service) => ({
          service,
          objectiveBps: 9_990,
          totalEvents: 100_000,
          goodEvents: 99_950,
          latencyTargetMilliseconds: 1_000,
          p95LatencyMilliseconds: 500,
        })),
      };
    case "load_capacity":
      return {
        kind,
        declaredWorkload: {
          datasetRecords: 50_000_000,
          concurrentUsers: 1_000,
          scenarioConcurrency: 100,
          targetRequestsPerSecond: 100,
          durationSeconds: 3_600,
          warmColdState: "mixed",
          runnerClass: "cloud-isolated-16cpu",
          hardwareSha256: "2".repeat(64),
          commitSha256: ARTIFACT,
          requestDistributionSha256: "3".repeat(64),
        },
        declaredThresholds: {
          maximumP95Milliseconds: 1_000,
          maximumP99Milliseconds: 2_000,
          maximumErrorRateBps: 25,
          maximumSaturationBps: 8_000,
          minimumHeadroomBps: 2_000,
          maximumQueueAgeP95Milliseconds: 500,
        },
        observedResults: {
          samples: 500_000,
          sustainedRequestsPerSecond: 120,
          acceptedCapacityRequestsPerSecond: 150,
          p95Milliseconds: 600,
          p99Milliseconds: 1_200,
          errorRateBps: 5,
          saturationBps: 6_000,
          queueAgeP95Milliseconds: 100,
        },
      };
    case "penetration_test":
      return {
        kind,
        scopeSha256: "4".repeat(64),
        methodology:
          "External authenticated and unauthenticated application, API, tenant, and deployment assessment",
        productionShaped: true,
        findings: [
          {
            findingId: "finding.high-1",
            severity: "high",
            status: "remediated",
            remediationEvidenceSha256: "5".repeat(64),
            independentlyVerifiedBy: "11111111-1111-4111-8111-111111111199",
            verifiedAt: "2026-05-31T21:00:00Z",
            riskAcceptance: null,
          },
        ],
      };
    case "privacy_controls":
      return {
        kind,
        storesInventoried: ["object-store", "postgresql", "search-index", "workflow-history"],
        exportTenantIsolationVerified: true,
        exportEntitlementsVerified: true,
        sensitiveExportWatermarkVerified: true,
        maximumObservedExportExpirySeconds: 1_800,
        deletionInventoryComplete: true,
        credentialsRevoked: true,
        maximumObservedDeletionSeconds: 86_400,
        backupExpiryScheduledWithinSeconds: 604_800,
        pseudonymousAuditRetentionVerified: true,
        legalHoldBlockedDeletion: true,
        legalHoldReleaseAudited: true,
        directDatabaseDeletionRejected: true,
      };
    case "security_compliance":
      return {
        kind,
        threatModelSha256: "4".repeat(64),
        controlMatrixSha256: "5".repeat(64),
        mappedFrameworks: ["iso-27001", "soc-2"],
        testedAuditEventClasses: [...REQUIRED_AUDIT_EVENT_CLASSES],
        tamperEvidentAuditSequenceVerified: true,
        tenantScopedAuditExportVerified: true,
        jitMfaReasonExpiryAdminAccessVerified: true,
        encryptionInTransitAndAtRestVerified: true,
        secretsRedactionAndDlpVerified: true,
        shortLivedObjectAccessVerified: true,
        forensicPreservationVerified: true,
        notificationWorkflowVerified: true,
        openControlExceptions: [],
      };
    case "locale_release":
      return {
        kind,
        locales: REQUIRED_LOCALES.map((locale) => ({
          locale,
          catalogSha256: "6".repeat(64),
          criticalCoverageBps: 10_000,
          generalCoverageBps: 9_900,
          layoutPassed: true,
          accessibilityPassed: true,
          formatterPassed: true,
          qualifiedHumanReviewPassed: true,
          rtlPassed: locale === "fa" || locale === "ar" ? true : null,
        })),
        pseudoLocalePassed: true,
        enFaCriticalScreenshotsPassed: true,
        representativeScriptsPassed: true,
        localeSwitchPreservedContext: true,
        translatedLogicAbsent: true,
        bidiEconomicValuesPassed: true,
        criticalFallbackCount: 0,
      };
    case "commercial_operations":
      return {
        kind,
        catalogManifestSha256: "7".repeat(64),
        entitlementHistoryReplayPassed: true,
        securityDenialOverridesEntitlement: true,
        providerIdentifiersAbsentFromPolicy: true,
        usageReplayDidNotDoubleCharge: true,
        correctionsWereAppendOnly: true,
        webhookSignatureAndAgeVerified: true,
        webhookIdempotencyVerified: true,
        providerOutagePreservedLastEntitlement: true,
        cancellationPreservedExportRetentionDeletionAndHold: true,
        supportEscalationOwner: "Commercial operations duty manager",
        billingReconciliationSha256: "8".repeat(64),
        reconciliationRuns: 3,
        reconciledUsageRecords: 50_000,
        unmatchedUsageRecords: 0,
        entitlementMismatches: 0,
        incorrectCharges: 0,
      };
    case "operational_readiness":
      return {
        kind,
        services: ["evidence-api", "alert-triage"].map((service) => ({
          service,
          owner: `${service} service owner`,
          onCallScheduleSha256: "9".repeat(64),
          runbookUri: `https://runbooks.example.test/${service}`,
          runbookSha256: "a".repeat(64),
          alertPolicySha256: "b".repeat(64),
          lastDrillAt: "2026-05-20T00:00:00Z",
          drillEvidenceSha256: "c".repeat(64),
        })),
        freshEnvironmentPassed: true,
        compatibleMigrationUnderTrafficPassed: true,
        rollbackRehearsed: true,
        workerRedeliveryIdempotencyPassed: true,
        syntheticDataProductionGuardPassed: true,
        developmentAuthenticationGuardPassed: true,
        incidentContainmentAndNotificationRunbookPassed: true,
        sbomProduced: true,
        provenanceAttested: true,
        imagesSigned: true,
        dependencySecretSastIacContainerScansPassed: true,
      };
  }
}

export interface ReadyFixture {
  readonly assessmentInput: EnterpriseReleaseAssessmentInput;
  readonly evidence: readonly EnterpriseEvidence[];
}

export type Mutable<T> = T extends (...arguments_: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? Mutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
      : T;

export function readyFixture(): ReadyFixture {
  const policy = createEnterpriseTenantPolicy(policyInput());
  const topology = createProductionTopology(topologyInput(policy.manifestSha256), policy);
  const evidence = EVIDENCE_KINDS.map((kind, index) =>
    admitEnterpriseEvidence({
      envelope: {
        schemaVersion: 1,
        evidenceId: `11111111-1111-4111-8111-${String(200 + index).padStart(12, "0")}`,
        kind,
        tenantId: TENANT,
        releaseArtifactSha256: ARTIFACT,
        policyManifestSha256: policy.manifestSha256,
        topologyManifestSha256: topology.manifestSha256,
        evidenceSource: "externally_attested_execution",
        producer: actor(String(300 + index * 2), "evidence_producer"),
        reviewer: actor(String(301 + index * 2), "evidence_reviewer"),
        executedByOrganization: "Independent assurance provider",
        startedAt: "2026-05-31T20:00:00Z",
        completedAt: "2026-05-31T22:00:00Z",
        expiresAt: "2026-08-01T00:00:00Z",
        revokedAt: null,
        revocationReason: null,
        environment: kind === "slo_window" ? "production" : "production_shaped_staging",
        artifactUri: `urn:evidence:${kind}:2026-05-31`,
        artifactSha256: String((index % 8) + 1).repeat(64),
        configurationSha256: String(((index + 1) % 8) + 1).repeat(64),
        verification: {
          statementUri: `urn:evidence:attestation:${kind}:2026-05-31`,
          statementSha256: String(((index + 2) % 8) + 1).repeat(64),
          detachedSignatureSha256: String(((index + 3) % 8) + 1).repeat(64),
          signerKeyId: `external-assurance.${index + 1}`,
          verifiedAt: "2026-05-31T23:00:00Z",
          artifactDigestVerified: true,
          detachedSignatureVerified: true,
          executionEnvironmentVerified: true,
        },
        tool: { name: "external-assurance-runner", version: "2026.5" },
        result: "passed",
        limitations: [],
      },
      payload: payload(kind),
    }),
  );
  return {
    evidence,
    assessmentInput: {
      schemaVersion: 1,
      assessmentId: "11111111-1111-4111-8111-111111111132",
      releaseId: RELEASE_ID,
      tenantId: TENANT,
      releaseArtifactSha256: ARTIFACT,
      assessedAt: ASSESSED_AT,
      assessor: ASSESSOR,
      policy,
      topology,
      evidence,
    },
  };
}

export function replaceEvidence(
  fixture: ReadyFixture,
  kind: EvidenceKind,
  mutate: (input: Mutable<EnterpriseEvidenceInput>) => void,
): ReadyFixture {
  const evidence = fixture.evidence.map((item) => {
    if (item.payload.kind !== kind) return item;
    const input = structuredClone({
      envelope: item.envelope,
      payload: item.payload,
    }) as Mutable<EnterpriseEvidenceInput>;
    mutate(input);
    return admitEnterpriseEvidence(input as EnterpriseEvidenceInput);
  });
  return {
    evidence,
    assessmentInput: { ...fixture.assessmentInput, evidence },
  };
}

export function readyAssessment() {
  const fixture = readyFixture();
  return { fixture, assessment: assessEnterpriseRelease(fixture.assessmentInput) };
}
