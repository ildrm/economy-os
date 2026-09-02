import {
  exact,
  freeze,
  httpsOrUrn,
  instant,
  integer,
  integrity,
  key,
  type Manifest,
  manifest,
  oneOf,
  record,
  sha,
  strings,
  uuid,
} from "./internals.js";

export const DATA_CLASSES = [
  "public",
  "licensed",
  "organization_private",
  "workspace_private",
  "restricted",
] as const;
export type DataClass = (typeof DATA_CLASSES)[number];

export const DEPLOYMENT_MODES = [
  "shared_saas",
  "dedicated_managed",
  "customer_vpc",
  "on_premise",
  "air_gapped_sovereign",
] as const;
export type DeploymentMode = (typeof DEPLOYMENT_MODES)[number];

export interface EnterpriseActor {
  readonly actorId: string;
  readonly tenantId: string;
  readonly role:
    | "policy_owner"
    | "evidence_producer"
    | "evidence_reviewer"
    | "release_assessor"
    | "independent_release_approver";
}

export interface DataClassRoute {
  readonly dataClass: DataClass;
  readonly storageRegions: readonly string[];
  readonly processingRegions: readonly string[];
  readonly backupRegions: readonly string[];
  readonly supportRegions: readonly string[];
  readonly exportRegions: readonly string[];
}

export interface EnterpriseTenantPolicyInput {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly previousManifestSha256: string | null;
  readonly createdAt: string;
  readonly createdBy: EnterpriseActor;
  readonly identity: {
    readonly samlRequired: true;
    readonly brokeredIdentityBoundaryRequired: true;
    readonly signedAssertionsRequired: true;
    readonly encryptedAssertionsRequired: boolean;
    readonly idpConfigurationSha256: string;
    readonly allowedClockSkewSeconds: number;
    readonly mfaRequired: true;
    readonly phishingResistantMfaForPrivileged: true;
    readonly stepUpActions: readonly string[];
    readonly session: {
      readonly maximumLifetimeSeconds: number;
      readonly idleTimeoutSeconds: number;
      readonly rotationIntervalSeconds: number;
      readonly refreshReuseDetectionRequired: true;
      readonly revocationTargetSeconds: number;
      readonly secureHttpOnlySameSiteCookiesRequired: true;
      readonly csrfProtectionRequired: true;
    };
  };
  readonly scim: {
    readonly required: true;
    readonly configurationSha256: string;
    readonly provisioningTargetSeconds: number;
    readonly deprovisioningTargetSeconds: number;
    readonly reconciliationTargetSeconds: number;
    readonly failClosedOnInvalidMapping: true;
  };
  readonly residency: {
    readonly deploymentMode: DeploymentMode;
    readonly primaryRegion: string;
    readonly allowedRegions: readonly string[];
    readonly routes: readonly DataClassRoute[];
  };
  readonly reliability: {
    readonly criticalRpoTargetSeconds: number;
    readonly criticalRtoTargetSeconds: number;
    readonly minimumFailureDomains: number;
    readonly minimumSloObjectiveBps: number;
    readonly minimumSloWindowSeconds: number;
    readonly maximumEvidenceAgeSeconds: number;
    readonly minimumEvidenceValiditySeconds: number;
  };
  readonly privacy: {
    readonly exportExpiryTargetSeconds: number;
    readonly deletionTargetSeconds: number;
    readonly backupDeletionTargetSeconds: number;
    readonly legalHoldEnforcementRequired: true;
    readonly pseudonymousAuditRetentionRequired: true;
  };
  readonly localization: {
    readonly generalCoverageThresholdBps: number;
    readonly humanReviewRequired: true;
    readonly pseudoLocaleRequired: true;
  };
}

export type EnterpriseTenantPolicy = Manifest<EnterpriseTenantPolicyInput>;

const ACTOR_KEYS = ["actorId", "tenantId", "role"] as const;

export function validateActor(actor: EnterpriseActor, field: string): void {
  record(actor, field);
  exact(actor, ACTOR_KEYS, field);
  uuid(actor.actorId, `${field}.actorId`);
  uuid(actor.tenantId, `${field}.tenantId`);
  oneOf(
    actor.role,
    [
      "policy_owner",
      "evidence_producer",
      "evidence_reviewer",
      "release_assessor",
      "independent_release_approver",
    ],
    `${field}.role`,
  );
}

function validateRegionList(
  values: readonly string[],
  allowed: ReadonlySet<string>,
  field: string,
): void {
  strings(values, field, 1, 32, key);
  for (const value of values) {
    if (!allowed.has(value))
      throw new TypeError(`${field} contains a region outside allowedRegions`);
  }
}

function validatePolicyInput(input: EnterpriseTenantPolicyInput): void {
  record(input, "policy");
  exact(
    input,
    [
      "schemaVersion",
      "tenantId",
      "policyId",
      "policyVersion",
      "previousManifestSha256",
      "createdAt",
      "createdBy",
      "identity",
      "scim",
      "residency",
      "reliability",
      "privacy",
      "localization",
    ],
    "policy",
  );
  if (input.schemaVersion !== 1) throw new TypeError("policy.schemaVersion must be 1");
  uuid(input.tenantId, "policy.tenantId");
  uuid(input.policyId, "policy.policyId");
  integer(input.policyVersion, "policy.policyVersion", 1, 1_000_000);
  if (input.previousManifestSha256 !== null)
    sha(input.previousManifestSha256, "policy.previousManifestSha256");
  instant(input.createdAt, "policy.createdAt");
  validateActor(input.createdBy, "policy.createdBy");
  if (input.createdBy.tenantId !== input.tenantId || input.createdBy.role !== "policy_owner") {
    throw new TypeError("policy creator must be a policy_owner in the same tenant");
  }

  record(input.identity, "policy.identity");
  exact(
    input.identity,
    [
      "samlRequired",
      "brokeredIdentityBoundaryRequired",
      "signedAssertionsRequired",
      "encryptedAssertionsRequired",
      "idpConfigurationSha256",
      "allowedClockSkewSeconds",
      "mfaRequired",
      "phishingResistantMfaForPrivileged",
      "stepUpActions",
      "session",
    ],
    "policy.identity",
  );
  if (
    input.identity.samlRequired !== true ||
    input.identity.brokeredIdentityBoundaryRequired !== true ||
    input.identity.signedAssertionsRequired !== true ||
    input.identity.mfaRequired !== true ||
    input.identity.phishingResistantMfaForPrivileged !== true
  ) {
    throw new TypeError(
      "enterprise SAML, broker, MFA, and privileged phishing resistance are mandatory",
    );
  }
  if (typeof input.identity.encryptedAssertionsRequired !== "boolean") {
    throw new TypeError("policy.identity.encryptedAssertionsRequired must be boolean");
  }
  sha(input.identity.idpConfigurationSha256, "policy.identity.idpConfigurationSha256");
  integer(
    input.identity.allowedClockSkewSeconds,
    "policy.identity.allowedClockSkewSeconds",
    0,
    300,
  );
  strings(input.identity.stepUpActions, "policy.identity.stepUpActions", 1, 32, key);
  record(input.identity.session, "policy.identity.session");
  exact(
    input.identity.session,
    [
      "maximumLifetimeSeconds",
      "idleTimeoutSeconds",
      "rotationIntervalSeconds",
      "refreshReuseDetectionRequired",
      "revocationTargetSeconds",
      "secureHttpOnlySameSiteCookiesRequired",
      "csrfProtectionRequired",
    ],
    "policy.identity.session",
  );
  const session = input.identity.session;
  integer(
    session.maximumLifetimeSeconds,
    "policy.identity.session.maximumLifetimeSeconds",
    300,
    604_800,
  );
  integer(
    session.idleTimeoutSeconds,
    "policy.identity.session.idleTimeoutSeconds",
    60,
    session.maximumLifetimeSeconds,
  );
  integer(
    session.rotationIntervalSeconds,
    "policy.identity.session.rotationIntervalSeconds",
    30,
    session.idleTimeoutSeconds,
  );
  integer(
    session.revocationTargetSeconds,
    "policy.identity.session.revocationTargetSeconds",
    1,
    3_600,
  );
  if (
    session.refreshReuseDetectionRequired !== true ||
    session.secureHttpOnlySameSiteCookiesRequired !== true ||
    session.csrfProtectionRequired !== true
  ) {
    throw new TypeError("enterprise session hardening controls are mandatory");
  }

  record(input.scim, "policy.scim");
  exact(
    input.scim,
    [
      "required",
      "configurationSha256",
      "provisioningTargetSeconds",
      "deprovisioningTargetSeconds",
      "reconciliationTargetSeconds",
      "failClosedOnInvalidMapping",
    ],
    "policy.scim",
  );
  if (input.scim.required !== true || input.scim.failClosedOnInvalidMapping !== true) {
    throw new TypeError("SCIM and fail-closed mapping are mandatory");
  }
  sha(input.scim.configurationSha256, "policy.scim.configurationSha256");
  integer(input.scim.provisioningTargetSeconds, "policy.scim.provisioningTargetSeconds", 1, 86_400);
  integer(
    input.scim.deprovisioningTargetSeconds,
    "policy.scim.deprovisioningTargetSeconds",
    1,
    86_400,
  );
  integer(
    input.scim.reconciliationTargetSeconds,
    "policy.scim.reconciliationTargetSeconds",
    1,
    604_800,
  );

  record(input.residency, "policy.residency");
  exact(
    input.residency,
    ["deploymentMode", "primaryRegion", "allowedRegions", "routes"],
    "policy.residency",
  );
  oneOf(input.residency.deploymentMode, DEPLOYMENT_MODES, "policy.residency.deploymentMode");
  key(input.residency.primaryRegion, "policy.residency.primaryRegion");
  strings(input.residency.allowedRegions, "policy.residency.allowedRegions", 1, 32, key);
  const allowed = new Set(input.residency.allowedRegions);
  if (!allowed.has(input.residency.primaryRegion))
    throw new TypeError("primaryRegion must be allowed");
  if (
    !Array.isArray(input.residency.routes) ||
    input.residency.routes.length !== DATA_CLASSES.length
  ) {
    throw new TypeError("policy.residency.routes must contain every data class exactly once");
  }
  const classes = new Set<DataClass>();
  for (const [index, route] of input.residency.routes.entries()) {
    record(route, `policy.residency.routes[${index}]`);
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
      `policy.residency.routes[${index}]`,
    );
    oneOf(route.dataClass, DATA_CLASSES, `policy.residency.routes[${index}].dataClass`);
    if (classes.has(route.dataClass))
      throw new TypeError("policy.residency.routes contains a duplicate data class");
    classes.add(route.dataClass);
    validateRegionList(
      route.storageRegions,
      allowed,
      `policy.residency.routes[${index}].storageRegions`,
    );
    validateRegionList(
      route.processingRegions,
      allowed,
      `policy.residency.routes[${index}].processingRegions`,
    );
    validateRegionList(
      route.backupRegions,
      allowed,
      `policy.residency.routes[${index}].backupRegions`,
    );
    validateRegionList(
      route.supportRegions,
      allowed,
      `policy.residency.routes[${index}].supportRegions`,
    );
    validateRegionList(
      route.exportRegions,
      allowed,
      `policy.residency.routes[${index}].exportRegions`,
    );
  }

  record(input.reliability, "policy.reliability");
  exact(
    input.reliability,
    [
      "criticalRpoTargetSeconds",
      "criticalRtoTargetSeconds",
      "minimumFailureDomains",
      "minimumSloObjectiveBps",
      "minimumSloWindowSeconds",
      "maximumEvidenceAgeSeconds",
      "minimumEvidenceValiditySeconds",
    ],
    "policy.reliability",
  );
  integer(
    input.reliability.criticalRpoTargetSeconds,
    "policy.reliability.criticalRpoTargetSeconds",
    0,
    86_400,
  );
  integer(
    input.reliability.criticalRtoTargetSeconds,
    "policy.reliability.criticalRtoTargetSeconds",
    1,
    604_800,
  );
  integer(
    input.reliability.minimumFailureDomains,
    "policy.reliability.minimumFailureDomains",
    3,
    32,
  );
  integer(
    input.reliability.minimumSloObjectiveBps,
    "policy.reliability.minimumSloObjectiveBps",
    9_000,
    10_000,
  );
  integer(
    input.reliability.minimumSloWindowSeconds,
    "policy.reliability.minimumSloWindowSeconds",
    3_600,
    31_536_000,
  );
  integer(
    input.reliability.maximumEvidenceAgeSeconds,
    "policy.reliability.maximumEvidenceAgeSeconds",
    3_600,
    31_536_000,
  );
  integer(
    input.reliability.minimumEvidenceValiditySeconds,
    "policy.reliability.minimumEvidenceValiditySeconds",
    0,
    2_592_000,
  );

  record(input.privacy, "policy.privacy");
  exact(
    input.privacy,
    [
      "exportExpiryTargetSeconds",
      "deletionTargetSeconds",
      "backupDeletionTargetSeconds",
      "legalHoldEnforcementRequired",
      "pseudonymousAuditRetentionRequired",
    ],
    "policy.privacy",
  );
  integer(
    input.privacy.exportExpiryTargetSeconds,
    "policy.privacy.exportExpiryTargetSeconds",
    1,
    604_800,
  );
  integer(
    input.privacy.deletionTargetSeconds,
    "policy.privacy.deletionTargetSeconds",
    1,
    31_536_000,
  );
  integer(
    input.privacy.backupDeletionTargetSeconds,
    "policy.privacy.backupDeletionTargetSeconds",
    1,
    31_536_000,
  );
  if (
    input.privacy.legalHoldEnforcementRequired !== true ||
    input.privacy.pseudonymousAuditRetentionRequired !== true
  ) {
    throw new TypeError("legal hold enforcement and pseudonymous audit retention are mandatory");
  }

  record(input.localization, "policy.localization");
  exact(
    input.localization,
    ["generalCoverageThresholdBps", "humanReviewRequired", "pseudoLocaleRequired"],
    "policy.localization",
  );
  integer(
    input.localization.generalCoverageThresholdBps,
    "policy.localization.generalCoverageThresholdBps",
    9_000,
    10_000,
  );
  if (
    input.localization.humanReviewRequired !== true ||
    input.localization.pseudoLocaleRequired !== true
  ) {
    throw new TypeError("human locale review and pseudo-locale testing are mandatory");
  }
}

export function createEnterpriseTenantPolicy(
  input: EnterpriseTenantPolicyInput,
): EnterpriseTenantPolicy {
  validatePolicyInput(input);
  if (input.policyVersion === 1 && input.previousManifestSha256 !== null) {
    throw new TypeError("initial policy cannot have a predecessor");
  }
  if (input.policyVersion > 1 && input.previousManifestSha256 === null) {
    throw new TypeError("revised policy must pin its predecessor");
  }
  return manifest(input);
}

export function reviseEnterpriseTenantPolicy(
  previous: EnterpriseTenantPolicy,
  next: EnterpriseTenantPolicyInput,
): EnterpriseTenantPolicy {
  assertEnterpriseTenantPolicy(previous);
  if (
    next.tenantId !== previous.tenantId ||
    next.policyId !== previous.policyId ||
    next.policyVersion !== previous.policyVersion + 1 ||
    next.previousManifestSha256 !== previous.manifestSha256 ||
    Date.parse(next.createdAt) <= Date.parse(previous.createdAt)
  ) {
    throw new TypeError("policy revision identity, chain, version, or time is invalid");
  }
  return createEnterpriseTenantPolicy(next);
}

export function assertEnterpriseTenantPolicy(policy: EnterpriseTenantPolicy): void {
  record(policy, "policy");
  integrity(policy, "policy");
  const { manifestSha256: _manifestSha256, ...body } = policy;
  validatePolicyInput(body);
}

export interface ProductionTopologyInput {
  readonly schemaVersion: 1;
  readonly topologyId: string;
  readonly topologyVersion: number;
  readonly tenantId: string;
  readonly policyManifestSha256: string;
  readonly declaredAt: string;
  readonly declaredBy: EnterpriseActor;
  readonly regions: readonly string[];
  readonly failureDomains: readonly string[];
  readonly dataStores: readonly string[];
  readonly criticalServices: readonly {
    readonly service: string;
    readonly activeFailureDomains: readonly string[];
    readonly stateful: boolean;
  }[];
  readonly synchronousRegionalDatabaseHa: true;
  readonly encryptedPointInTimeBackups: true;
  readonly objectVersioningAndReplication: true;
  readonly durableWorkflowPersistence: true;
  readonly defaultDenyNetworkPolicy: true;
  readonly tlsEverywhere: true;
  readonly privateNetworkIsolation: true;
  readonly workloadIdentity: true;
  readonly jitMfaAdministrativeAccess: true;
  readonly externalProviderMode: "residency_restricted" | "disabled";
  readonly deploymentContractSha256: string;
  readonly policyCatalogIncludedInRecovery: true;
}

export type ProductionTopology = Manifest<ProductionTopologyInput>;

function validateTopologyInput(
  input: ProductionTopologyInput,
  policy?: EnterpriseTenantPolicy,
): void {
  record(input, "topology");
  exact(
    input,
    [
      "schemaVersion",
      "topologyId",
      "topologyVersion",
      "tenantId",
      "policyManifestSha256",
      "declaredAt",
      "declaredBy",
      "regions",
      "failureDomains",
      "dataStores",
      "criticalServices",
      "synchronousRegionalDatabaseHa",
      "encryptedPointInTimeBackups",
      "objectVersioningAndReplication",
      "durableWorkflowPersistence",
      "defaultDenyNetworkPolicy",
      "tlsEverywhere",
      "privateNetworkIsolation",
      "workloadIdentity",
      "jitMfaAdministrativeAccess",
      "externalProviderMode",
      "deploymentContractSha256",
      "policyCatalogIncludedInRecovery",
    ],
    "topology",
  );
  if (input.schemaVersion !== 1) throw new TypeError("topology.schemaVersion must be 1");
  uuid(input.topologyId, "topology.topologyId");
  uuid(input.tenantId, "topology.tenantId");
  integer(input.topologyVersion, "topology.topologyVersion", 1, 1_000_000);
  sha(input.policyManifestSha256, "topology.policyManifestSha256");
  instant(input.declaredAt, "topology.declaredAt");
  validateActor(input.declaredBy, "topology.declaredBy");
  if (input.declaredBy.tenantId !== input.tenantId || input.declaredBy.role !== "policy_owner") {
    throw new TypeError("topology declarer must be a policy_owner in the same tenant");
  }
  strings(input.regions, "topology.regions", 1, 32, key);
  strings(input.failureDomains, "topology.failureDomains", 3, 128, key);
  strings(input.dataStores, "topology.dataStores", 1, 64, key);
  if (
    !Array.isArray(input.criticalServices) ||
    input.criticalServices.length < 1 ||
    input.criticalServices.length > 64
  ) {
    throw new TypeError("topology.criticalServices must contain 1..64 services");
  }
  const domains = new Set(input.failureDomains);
  const services = new Set<string>();
  input.criticalServices.forEach((service, index) => {
    const field = `topology.criticalServices[${index}]`;
    record(service, field);
    exact(service, ["service", "activeFailureDomains", "stateful"], field);
    key(service.service, `${field}.service`);
    if (services.has(service.service))
      throw new TypeError("topology contains a duplicate critical service");
    services.add(service.service);
    strings(service.activeFailureDomains, `${field}.activeFailureDomains`, 1, 32, key);
    if (service.activeFailureDomains.some((domain: string) => !domains.has(domain))) {
      throw new TypeError(`${field} contains an unknown failure domain`);
    }
    if (typeof service.stateful !== "boolean")
      throw new TypeError(`${field}.stateful must be boolean`);
  });
  for (const control of [
    input.synchronousRegionalDatabaseHa,
    input.encryptedPointInTimeBackups,
    input.objectVersioningAndReplication,
    input.durableWorkflowPersistence,
    input.defaultDenyNetworkPolicy,
    input.tlsEverywhere,
    input.privateNetworkIsolation,
    input.workloadIdentity,
    input.jitMfaAdministrativeAccess,
    input.policyCatalogIncludedInRecovery,
  ]) {
    if (control !== true) throw new TypeError("topology production controls must be true");
  }
  oneOf(
    input.externalProviderMode,
    ["residency_restricted", "disabled"],
    "topology.externalProviderMode",
  );
  sha(input.deploymentContractSha256, "topology.deploymentContractSha256");
  if (policy) {
    assertEnterpriseTenantPolicy(policy);
    if (
      input.tenantId !== policy.tenantId ||
      input.policyManifestSha256 !== policy.manifestSha256
    ) {
      throw new TypeError("topology must pin the same tenant policy");
    }
    if (input.failureDomains.length < policy.reliability.minimumFailureDomains) {
      throw new TypeError("topology does not meet the declared failure-domain target");
    }
    if (
      input.criticalServices.some(
        (service) => service.activeFailureDomains.length < policy.reliability.minimumFailureDomains,
      )
    ) {
      throw new TypeError("topology contains an under-replicated critical service");
    }
    const allowed = new Set(policy.residency.allowedRegions);
    if (input.regions.some((region) => !allowed.has(region))) {
      throw new TypeError("topology contains a region disallowed by policy");
    }
    if (
      policy.residency.deploymentMode === "air_gapped_sovereign" &&
      input.externalProviderMode !== "disabled"
    ) {
      throw new TypeError("air-gapped deployments must disable external providers");
    }
  }
}

export function createProductionTopology(
  input: ProductionTopologyInput,
  policy: EnterpriseTenantPolicy,
): ProductionTopology {
  validateTopologyInput(input, policy);
  return manifest(input);
}

export function assertProductionTopology(
  topology: ProductionTopology,
  policy?: EnterpriseTenantPolicy,
): void {
  record(topology, "topology");
  integrity(topology, "topology");
  const { manifestSha256: _manifestSha256, ...body } = topology;
  validateTopologyInput(body, policy);
}

export function topologyServiceNames(topology: ProductionTopology): readonly string[] {
  assertProductionTopology(topology);
  return freeze(topology.criticalServices.map((service) => service.service).sort());
}

export function validateRunbookReference(uri: string, digest: string, field: string): void {
  httpsOrUrn(uri, `${field}.uri`);
  sha(digest, `${field}.sha256`);
}
