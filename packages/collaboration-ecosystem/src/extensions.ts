import {
  type AuthorizationDecision,
  assertAuthorizationDecisionIntegrity,
} from "./collaboration.js";
import {
  assertClientCompatibilityContractIntegrity,
  assertCompatibilityDecisionIntegrity,
  type ClientCompatibilityContract,
  type CompatibilityDecision,
  evaluateClientCompatibility,
} from "./compatibility.js";
import {
  assertDigestIntegrity,
  assertExactKeys,
  assertInteger,
  assertIsoInstant,
  assertKey,
  assertPlainRecord,
  assertSha256,
  assertText,
  assertUniqueKeys,
  assertUuid,
  cloneCanonical,
  compareInstants,
  deepFreeze,
  immutableWithDigest,
  parseSemver,
} from "./internals.js";
import { assertQuotaEventIntegrity, type QuotaEvent } from "./quotas.js";

export type ExtensionKind = "connector" | "model";
export type ExtensionRuntime = "wasm" | "oci_sandbox";
export type DataClassification = "public" | "internal" | "confidential" | "restricted";

export interface ExtensionEgressPolicy {
  readonly mode: "denied" | "allowlist";
  readonly hosts: readonly string[];
}

export interface ExtensionResources {
  readonly memoryMiB: number;
  readonly cpuMillis: number;
  readonly wallClockMillis: number;
  readonly outputBytes: number;
  readonly concurrency: number;
}

export interface ExtensionManifestInput {
  readonly extensionId: string;
  readonly publisherId: string;
  readonly organizationId: string;
  readonly kind: ExtensionKind;
  readonly name: string;
  readonly version: string;
  readonly extensionApiVersion: string;
  readonly artifactSha256: string;
  readonly runtime: ExtensionRuntime;
  readonly capabilities: readonly string[];
  readonly egress: ExtensionEgressPolicy;
  readonly resources: ExtensionResources;
  readonly inputClassifications: readonly DataClassification[];
  readonly outputClassifications: readonly DataClassification[];
  readonly createdAt: string;
}

export type ExtensionManifest = Readonly<
  ExtensionManifestInput & { readonly schemaVersion: 1; readonly manifestSha256: string }
>;

const CLASSIFICATIONS = ["public", "internal", "confidential", "restricted"] as const;
const FORBIDDEN_EXTENSION_CAPABILITIES = new Set([
  "workspace.manage",
  "extension.certify",
  "extension.admit",
  "quota.reconcile",
  "audit.read",
]);
const REQUIRED_CERTIFICATION_TESTS = [
  "audit_receipt",
  "deterministic_shutdown",
  "filesystem_isolation",
  "network_egress",
  "quota_enforcement",
  "tenant_boundary",
] as const;

function validateClassifications(values: readonly DataClassification[], field: string): void {
  if (!Array.isArray(values) || values.length < 1 || values.length > CLASSIFICATIONS.length) {
    throw new TypeError(`${field} must contain 1..${CLASSIFICATIONS.length} classifications`);
  }
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (!CLASSIFICATIONS.includes(value)) {
      throw new TypeError(`${field}[${index}] is not a known classification`);
    }
    if (seen.has(value)) throw new TypeError(`${field} contains duplicate classifications`);
    seen.add(value);
  }
}

function validateHost(host: string, field: string): void {
  assertText(host, field, 253);
  if (
    host !== host.toLowerCase() ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new TypeError(`${field} must be a lowercase public DNS hostname without wildcards`);
  }
}

function validateEgress(egress: ExtensionEgressPolicy, field: string): void {
  assertPlainRecord(egress, field);
  assertExactKeys(egress, ["mode", "hosts"], field);
  if (egress.mode !== "denied" && egress.mode !== "allowlist") {
    throw new TypeError(`${field}.mode is invalid`);
  }
  if (!Array.isArray(egress.hosts) || egress.hosts.length > 100) {
    throw new TypeError(`${field}.hosts must contain 0..100 entries`);
  }
  const seen = new Set<string>();
  for (const [index, host] of egress.hosts.entries()) {
    validateHost(host, `${field}.hosts[${index}]`);
    if (seen.has(host)) throw new TypeError(`${field}.hosts contains duplicates`);
    seen.add(host);
  }
  if (egress.mode === "denied" && egress.hosts.length !== 0) {
    throw new TypeError(`${field}.hosts must be empty when egress is denied`);
  }
  if (egress.mode === "allowlist" && egress.hosts.length === 0) {
    throw new TypeError(`${field}.hosts is required for allowlisted egress`);
  }
}

function validateResources(resources: ExtensionResources, field: string): void {
  assertPlainRecord(resources, field);
  assertExactKeys(
    resources,
    ["memoryMiB", "cpuMillis", "wallClockMillis", "outputBytes", "concurrency"],
    field,
  );
  assertInteger(resources.memoryMiB, `${field}.memoryMiB`, 16, 262_144);
  assertInteger(resources.cpuMillis, `${field}.cpuMillis`, 1, 86_400_000);
  assertInteger(resources.wallClockMillis, `${field}.wallClockMillis`, 1, 86_400_000);
  assertInteger(resources.outputBytes, `${field}.outputBytes`, 1, 10_000_000_000);
  assertInteger(resources.concurrency, `${field}.concurrency`, 1, 10_000);
}

export function createExtensionManifest(input: ExtensionManifestInput): ExtensionManifest {
  assertPlainRecord(input, "extension manifest");
  assertExactKeys(
    input,
    [
      "extensionId",
      "publisherId",
      "organizationId",
      "kind",
      "name",
      "version",
      "extensionApiVersion",
      "artifactSha256",
      "runtime",
      "capabilities",
      "egress",
      "resources",
      "inputClassifications",
      "outputClassifications",
      "createdAt",
    ],
    "extension manifest",
  );
  assertUuid(input.extensionId, "extension manifest.extensionId");
  assertUuid(input.publisherId, "extension manifest.publisherId");
  assertUuid(input.organizationId, "extension manifest.organizationId");
  if (input.kind !== "connector" && input.kind !== "model") {
    throw new TypeError("extension manifest.kind is invalid");
  }
  assertKey(input.name, "extension manifest.name");
  parseSemver(input.version, "extension manifest.version");
  parseSemver(input.extensionApiVersion, "extension manifest.extensionApiVersion");
  assertSha256(input.artifactSha256, "extension manifest.artifactSha256");
  if (input.runtime !== "wasm" && input.runtime !== "oci_sandbox") {
    throw new TypeError("extension manifest.runtime is invalid");
  }
  assertUniqueKeys(input.capabilities, "extension manifest.capabilities", 1, 100);
  if (input.capabilities.some((capability) => FORBIDDEN_EXTENSION_CAPABILITIES.has(capability))) {
    throw new TypeError("extension manifest requests a platform-administrative capability");
  }
  validateEgress(input.egress, "extension manifest.egress");
  validateResources(input.resources, "extension manifest.resources");
  validateClassifications(input.inputClassifications, "extension manifest.inputClassifications");
  validateClassifications(input.outputClassifications, "extension manifest.outputClassifications");
  assertIsoInstant(input.createdAt, "extension manifest.createdAt");
  return immutableWithDigest({
    schemaVersion: 1 as const,
    ...input,
    capabilities: [...input.capabilities].sort(),
    egress: { ...input.egress, hosts: [...input.egress.hosts].sort() },
    inputClassifications: [...input.inputClassifications].sort(),
    outputClassifications: [...input.outputClassifications].sort(),
  });
}

export function assertExtensionManifestIntegrity(manifest: ExtensionManifest): void {
  assertPlainRecord(manifest, "extension manifest");
  assertExactKeys(
    manifest,
    [
      "schemaVersion",
      "extensionId",
      "publisherId",
      "organizationId",
      "kind",
      "name",
      "version",
      "extensionApiVersion",
      "artifactSha256",
      "runtime",
      "capabilities",
      "egress",
      "resources",
      "inputClassifications",
      "outputClassifications",
      "createdAt",
      "manifestSha256",
    ],
    "extension manifest",
  );
  if (manifest.schemaVersion !== 1) {
    throw new TypeError("extension manifest schema is unsupported");
  }
  assertDigestIntegrity(manifest, "extension manifest");
  const { schemaVersion: _schemaVersion, manifestSha256: _manifestSha256, ...body } = manifest;
  if (createExtensionManifest(body).manifestSha256 !== manifest.manifestSha256) {
    throw new TypeError("extension manifest is not canonical");
  }
}

export interface ExtensionCertificationInput {
  readonly certificationId: string;
  readonly extensionId: string;
  readonly extensionVersion: string;
  readonly extensionManifestSha256: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly certifiedBy: string;
  readonly issuedAt: string;
  readonly validUntil: string;
  readonly compatibilityContract: ClientCompatibilityContract;
  readonly isolationProfileSha256: string;
  readonly testEvidenceSha256: readonly string[];
  readonly passedTests: readonly string[];
  readonly authorization: AuthorizationDecision;
}

export type ExtensionCertification = Readonly<{
  readonly schemaVersion: 1;
  readonly certificationId: string;
  readonly extensionId: string;
  readonly extensionVersion: string;
  readonly extensionManifestSha256: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly certifiedBy: string;
  readonly issuedAt: string;
  readonly validUntil: string;
  readonly compatibilityContractSha256: string;
  readonly compatibilityDecisionSha256: string;
  readonly isolationProfileSha256: string;
  readonly testEvidenceSha256: readonly string[];
  readonly passedTests: readonly string[];
  readonly authorizationDecisionSha256: string;
  readonly manifestSha256: string;
}>;

export interface ExtensionRevocationInput {
  readonly revocationId: string;
  readonly extensionId: string;
  readonly extensionVersion: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly revokedBy: string;
  readonly revokedAt: string;
  readonly reason: string;
  readonly authorization: AuthorizationDecision;
}

export type ExtensionRevocation = Readonly<{
  readonly schemaVersion: 1;
  readonly revocationId: string;
  readonly extensionId: string;
  readonly extensionVersion: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly revokedBy: string;
  readonly revokedAt: string;
  readonly reason: string;
  readonly authorizationDecisionSha256: string;
  readonly manifestSha256: string;
}>;

function validateAuthorization(
  authorization: AuthorizationDecision,
  organizationId: string,
  workspaceId: string,
  principalId: string,
  action: string,
  at: string,
): void {
  assertAuthorizationDecisionIntegrity(authorization);
  if (
    !authorization.allowed ||
    authorization.organizationId !== organizationId ||
    authorization.workspaceId !== workspaceId ||
    authorization.principalId !== principalId ||
    authorization.action !== action ||
    authorization.evaluatedAt !== at
  ) {
    throw new TypeError("extension authorization does not allow this exact operation");
  }
}

function extensionIdentity(extensionId: string, extensionVersion: string): string {
  return `${extensionId}:${extensionVersion}`;
}

export class ExtensionRegistry {
  readonly #manifests = new Map<string, ExtensionManifest>();
  readonly #certifications = new Map<string, ExtensionCertification[]>();
  readonly #revocations = new Map<string, ExtensionRevocation>();
  readonly #certificationIds = new Set<string>();
  readonly #revocationIds = new Set<string>();

  register(manifest: ExtensionManifest): ExtensionManifest {
    assertExtensionManifestIntegrity(manifest);
    const identity = extensionIdentity(manifest.extensionId, manifest.version);
    const prior = this.#manifests.get(identity);
    if (prior) {
      if (prior.manifestSha256 !== manifest.manifestSha256) {
        throw new TypeError("extension identity is immutable and already has different content");
      }
      return prior;
    }
    this.#manifests.set(identity, manifest);
    return manifest;
  }

  certify(input: ExtensionCertificationInput): ExtensionCertification {
    assertPlainRecord(input, "extension certification");
    assertExactKeys(
      input,
      [
        "certificationId",
        "extensionId",
        "extensionVersion",
        "extensionManifestSha256",
        "organizationId",
        "workspaceId",
        "certifiedBy",
        "issuedAt",
        "validUntil",
        "compatibilityContract",
        "isolationProfileSha256",
        "testEvidenceSha256",
        "passedTests",
        "authorization",
      ],
      "extension certification",
    );
    assertUuid(input.certificationId, "extension certification.certificationId");
    assertUuid(input.extensionId, "extension certification.extensionId");
    parseSemver(input.extensionVersion, "extension certification.extensionVersion");
    assertSha256(input.extensionManifestSha256, "extension certification.extensionManifestSha256");
    assertUuid(input.organizationId, "extension certification.organizationId");
    assertUuid(input.workspaceId, "extension certification.workspaceId");
    assertUuid(input.certifiedBy, "extension certification.certifiedBy");
    assertIsoInstant(input.issuedAt, "extension certification.issuedAt");
    assertIsoInstant(input.validUntil, "extension certification.validUntil");
    if (compareInstants(input.validUntil, input.issuedAt) <= 0) {
      throw new TypeError("extension certification validity must follow issuance");
    }
    assertClientCompatibilityContractIntegrity(input.compatibilityContract);
    assertSha256(input.isolationProfileSha256, "extension certification.isolationProfileSha256");
    if (
      !Array.isArray(input.testEvidenceSha256) ||
      input.testEvidenceSha256.length < 1 ||
      input.testEvidenceSha256.length > 100
    ) {
      throw new TypeError("extension certification.testEvidenceSha256 must contain 1..100 digests");
    }
    const evidence = new Set<string>();
    for (const [index, digest] of input.testEvidenceSha256.entries()) {
      assertSha256(digest, `extension certification.testEvidenceSha256[${index}]`);
      if (evidence.has(digest)) throw new TypeError("certification evidence must be unique");
      evidence.add(digest);
    }
    assertUniqueKeys(input.passedTests, "extension certification.passedTests", 1, 100);
    if (!REQUIRED_CERTIFICATION_TESTS.every((test) => input.passedTests.includes(test))) {
      throw new TypeError("extension certification is missing a mandatory isolation test");
    }
    validateAuthorization(
      input.authorization,
      input.organizationId,
      input.workspaceId,
      input.certifiedBy,
      "extension.certify",
      input.issuedAt,
    );
    if (this.#certificationIds.has(input.certificationId)) {
      throw new TypeError("extension certification ID already exists");
    }
    const identity = extensionIdentity(input.extensionId, input.extensionVersion);
    const manifest = this.#manifests.get(identity);
    if (
      !manifest ||
      manifest.organizationId !== input.organizationId ||
      manifest.manifestSha256 !== input.extensionManifestSha256
    ) {
      throw new TypeError("extension certification does not bind the registered tenant manifest");
    }
    if (manifest.publisherId === input.certifiedBy) {
      throw new TypeError("extension publisher cannot certify its own extension");
    }
    if (
      compareInstants(input.issuedAt, manifest.createdAt) < 0 ||
      compareInstants(input.issuedAt, input.compatibilityContract.issuedAt) < 0
    ) {
      throw new TypeError(
        "extension certification predates its manifest or compatibility contract",
      );
    }
    if (this.#revocations.has(identity))
      throw new TypeError("revoked extension cannot be certified");
    const priorCertifications = this.#certifications.get(identity) ?? [];
    const priorCertification = priorCertifications.at(-1);
    if (priorCertification && compareInstants(input.issuedAt, priorCertification.issuedAt) <= 0) {
      throw new TypeError("extension certification must follow the prior certification");
    }
    const compatibility = evaluateClientCompatibility(input.compatibilityContract, {
      clientKind: "extension",
      clientVersion: manifest.extensionApiVersion,
      transportApiVersion: input.compatibilityContract.transportApiVersion,
      requiredCapabilities: manifest.capabilities,
    });
    if (!compatibility.compatible) {
      throw new TypeError(`extension certification is incompatible: ${compatibility.reason}`);
    }
    const certification = immutableWithDigest({
      schemaVersion: 1 as const,
      certificationId: input.certificationId,
      extensionId: input.extensionId,
      extensionVersion: input.extensionVersion,
      extensionManifestSha256: input.extensionManifestSha256,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      certifiedBy: input.certifiedBy,
      issuedAt: input.issuedAt,
      validUntil: input.validUntil,
      compatibilityContractSha256: input.compatibilityContract.manifestSha256,
      compatibilityDecisionSha256: compatibility.manifestSha256,
      isolationProfileSha256: input.isolationProfileSha256,
      testEvidenceSha256: [...input.testEvidenceSha256].sort(),
      passedTests: [...input.passedTests].sort(),
      authorizationDecisionSha256: input.authorization.manifestSha256,
    });
    const certifications = priorCertifications;
    certifications.push(certification);
    this.#certifications.set(identity, certifications);
    this.#certificationIds.add(input.certificationId);
    return certification;
  }

  revoke(input: ExtensionRevocationInput): ExtensionRevocation {
    assertPlainRecord(input, "extension revocation");
    assertExactKeys(
      input,
      [
        "revocationId",
        "extensionId",
        "extensionVersion",
        "organizationId",
        "workspaceId",
        "revokedBy",
        "revokedAt",
        "reason",
        "authorization",
      ],
      "extension revocation",
    );
    assertUuid(input.revocationId, "extension revocation.revocationId");
    assertUuid(input.extensionId, "extension revocation.extensionId");
    parseSemver(input.extensionVersion, "extension revocation.extensionVersion");
    assertUuid(input.organizationId, "extension revocation.organizationId");
    assertUuid(input.workspaceId, "extension revocation.workspaceId");
    assertUuid(input.revokedBy, "extension revocation.revokedBy");
    assertIsoInstant(input.revokedAt, "extension revocation.revokedAt");
    assertText(input.reason, "extension revocation.reason", 1_000);
    validateAuthorization(
      input.authorization,
      input.organizationId,
      input.workspaceId,
      input.revokedBy,
      "extension.revoke",
      input.revokedAt,
    );
    if (this.#revocationIds.has(input.revocationId)) {
      throw new TypeError("extension revocation ID already exists");
    }
    const identity = extensionIdentity(input.extensionId, input.extensionVersion);
    const manifest = this.#manifests.get(identity);
    if (!manifest || manifest.organizationId !== input.organizationId) {
      throw new TypeError("extension revocation does not target a registered tenant manifest");
    }
    const latestCertification = this.#certifications.get(identity)?.at(-1);
    if (
      compareInstants(input.revokedAt, manifest.createdAt) < 0 ||
      (latestCertification && compareInstants(input.revokedAt, latestCertification.issuedAt) < 0)
    ) {
      throw new TypeError("extension revocation predates the manifest or certification");
    }
    if (this.#revocations.has(identity))
      throw new TypeError("extension version is already revoked");
    const revocation = immutableWithDigest({
      schemaVersion: 1 as const,
      revocationId: input.revocationId,
      extensionId: input.extensionId,
      extensionVersion: input.extensionVersion,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      revokedBy: input.revokedBy,
      revokedAt: input.revokedAt,
      reason: input.reason,
      authorizationDecisionSha256: input.authorization.manifestSha256,
    });
    this.#revocations.set(identity, revocation);
    this.#revocationIds.add(input.revocationId);
    return revocation;
  }

  resolve(extensionId: string, version: string): ExtensionManifest | null {
    assertUuid(extensionId, "extension ID");
    parseSemver(version, "extension version");
    return this.#manifests.get(extensionIdentity(extensionId, version)) ?? null;
  }

  certificationAt(
    extensionId: string,
    version: string,
    workspaceId: string,
    at: string,
  ): ExtensionCertification | null {
    assertUuid(extensionId, "extension ID");
    parseSemver(version, "extension version");
    assertUuid(workspaceId, "certification lookup workspace ID");
    assertIsoInstant(at, "certification lookup time");
    const certifications = this.#certifications.get(extensionIdentity(extensionId, version)) ?? [];
    return (
      [...certifications]
        .reverse()
        .find(
          (certification) =>
            certification.workspaceId === workspaceId &&
            compareInstants(certification.issuedAt, at) <= 0 &&
            compareInstants(at, certification.validUntil) < 0,
        ) ?? null
    );
  }

  revocationAt(extensionId: string, version: string, at: string): ExtensionRevocation | null {
    assertUuid(extensionId, "extension ID");
    parseSemver(version, "extension version");
    assertIsoInstant(at, "revocation lookup time");
    const revocation = this.#revocations.get(extensionIdentity(extensionId, version));
    return revocation && compareInstants(revocation.revokedAt, at) <= 0 ? revocation : null;
  }
}

export interface ExtensionAdmissionInput {
  readonly extensionId: string;
  readonly extensionVersion: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly principalId: string;
  readonly requestedAt: string;
  readonly authorization: AuthorizationDecision;
  readonly compatibility: CompatibilityDecision;
  readonly quotaReservation: QuotaEvent;
  readonly authorizedCapabilities: readonly string[];
  readonly allowedEgressHosts: readonly string[];
  readonly resourceCeiling: ExtensionResources;
}

export type ExtensionAdmissionReason =
  | "extension_not_registered"
  | "extension_revoked"
  | "extension_uncertified"
  | "certification_contract_mismatch"
  | "compatibility_denied"
  | "authorization_denied"
  | "capability_denied"
  | "egress_denied"
  | "resources_denied"
  | "quota_denied"
  | "admitted";

export type ExtensionAdmissionReceipt = Readonly<{
  readonly schemaVersion: 1;
  readonly admitted: boolean;
  readonly reason: ExtensionAdmissionReason;
  readonly extensionId: string;
  readonly extensionVersion: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly principalId: string;
  readonly requestedAt: string;
  readonly extensionManifestSha256: string | null;
  readonly certificationSha256: string | null;
  readonly authorizationDecisionSha256: string;
  readonly compatibilityDecisionSha256: string;
  readonly quotaReservationEventSha256: string;
  readonly isolationRuntime: ExtensionRuntime | null;
  readonly manifestSha256: string;
}>;

export interface ExtensionAdmissionQuotaRequest {
  readonly extensionId: string;
  readonly extensionVersion: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly principalId: string;
  readonly requestedAt: string;
}

export function extensionAdmissionQuotaRequestSha256(
  input: ExtensionAdmissionQuotaRequest,
): string {
  assertPlainRecord(input, "extension admission quota request");
  assertExactKeys(
    input,
    [
      "extensionId",
      "extensionVersion",
      "organizationId",
      "workspaceId",
      "principalId",
      "requestedAt",
    ],
    "extension admission quota request",
  );
  assertUuid(input.extensionId, "extension admission quota request.extensionId");
  parseSemver(input.extensionVersion, "extension admission quota request.extensionVersion");
  assertUuid(input.organizationId, "extension admission quota request.organizationId");
  assertUuid(input.workspaceId, "extension admission quota request.workspaceId");
  assertUuid(input.principalId, "extension admission quota request.principalId");
  assertIsoInstant(input.requestedAt, "extension admission quota request.requestedAt");
  return immutableWithDigest({
    schemaVersion: 1 as const,
    capability: "extension.execute" as const,
    ...input,
  }).manifestSha256;
}

function resourcesFit(requested: ExtensionResources, ceiling: ExtensionResources): boolean {
  return (
    requested.memoryMiB <= ceiling.memoryMiB &&
    requested.cpuMillis <= ceiling.cpuMillis &&
    requested.wallClockMillis <= ceiling.wallClockMillis &&
    requested.outputBytes <= ceiling.outputBytes &&
    requested.concurrency <= ceiling.concurrency
  );
}

export function admitExtension(
  registry: ExtensionRegistry,
  input: ExtensionAdmissionInput,
): ExtensionAdmissionReceipt {
  assertPlainRecord(input, "extension admission");
  assertExactKeys(
    input,
    [
      "extensionId",
      "extensionVersion",
      "organizationId",
      "workspaceId",
      "principalId",
      "requestedAt",
      "authorization",
      "compatibility",
      "quotaReservation",
      "authorizedCapabilities",
      "allowedEgressHosts",
      "resourceCeiling",
    ],
    "extension admission",
  );
  assertUuid(input.extensionId, "extension admission.extensionId");
  parseSemver(input.extensionVersion, "extension admission.extensionVersion");
  assertUuid(input.organizationId, "extension admission.organizationId");
  assertUuid(input.workspaceId, "extension admission.workspaceId");
  assertUuid(input.principalId, "extension admission.principalId");
  assertIsoInstant(input.requestedAt, "extension admission.requestedAt");
  assertDigestIntegrity(input.authorization, "extension admission.authorization");
  assertCompatibilityDecisionIntegrity(input.compatibility);
  assertQuotaEventIntegrity(input.quotaReservation);
  assertUniqueKeys(
    input.authorizedCapabilities,
    "extension admission.authorizedCapabilities",
    0,
    200,
  );
  if (!Array.isArray(input.allowedEgressHosts) || input.allowedEgressHosts.length > 100) {
    throw new TypeError("extension admission.allowedEgressHosts must contain 0..100 hosts");
  }
  const hostSet = new Set<string>();
  for (const [index, host] of input.allowedEgressHosts.entries()) {
    validateHost(host, `extension admission.allowedEgressHosts[${index}]`);
    if (hostSet.has(host)) throw new TypeError("extension admission allowed hosts must be unique");
    hostSet.add(host);
  }
  validateResources(input.resourceCeiling, "extension admission.resourceCeiling");

  const manifest = registry.resolve(input.extensionId, input.extensionVersion);
  const certification = registry.certificationAt(
    input.extensionId,
    input.extensionVersion,
    input.workspaceId,
    input.requestedAt,
  );
  const revocation = registry.revocationAt(
    input.extensionId,
    input.extensionVersion,
    input.requestedAt,
  );
  let reason: ExtensionAdmissionReason;
  if (!manifest || manifest.organizationId !== input.organizationId) {
    reason = "extension_not_registered";
  } else if (revocation !== null) {
    reason = "extension_revoked";
  } else if (certification === null) {
    reason = "extension_uncertified";
  } else if (
    certification.extensionManifestSha256 !== manifest.manifestSha256 ||
    certification.compatibilityContractSha256 !== input.compatibility.contractSha256 ||
    certification.compatibilityDecisionSha256 !== input.compatibility.manifestSha256
  ) {
    reason = "certification_contract_mismatch";
  } else if (
    !input.compatibility.compatible ||
    input.compatibility.reason !== "compatible" ||
    input.compatibility.clientKind !== "extension" ||
    input.compatibility.clientVersion !== manifest.extensionApiVersion
  ) {
    reason = "compatibility_denied";
  } else if (
    !input.authorization.allowed ||
    input.authorization.action !== "extension.admit" ||
    input.authorization.principalId !== input.principalId ||
    input.authorization.organizationId !== input.organizationId ||
    input.authorization.workspaceId !== input.workspaceId ||
    input.authorization.evaluatedAt !== input.requestedAt
  ) {
    reason = "authorization_denied";
  } else if (
    manifest.capabilities.some((capability) => !input.authorizedCapabilities.includes(capability))
  ) {
    reason = "capability_denied";
  } else if (
    manifest.egress.mode === "allowlist" &&
    manifest.egress.hosts.some((host) => !hostSet.has(host))
  ) {
    reason = "egress_denied";
  } else if (!resourcesFit(manifest.resources, input.resourceCeiling)) {
    reason = "resources_denied";
  } else if (
    input.quotaReservation.action !== "reserved" ||
    input.quotaReservation.organizationId !== input.organizationId ||
    input.quotaReservation.principalId !== input.principalId ||
    input.quotaReservation.capability !== "extension.execute" ||
    input.quotaReservation.reservationId === null ||
    input.quotaReservation.quantityUnits < 1 ||
    input.quotaReservation.requestSha256 !==
      extensionAdmissionQuotaRequestSha256({
        extensionId: input.extensionId,
        extensionVersion: input.extensionVersion,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        principalId: input.principalId,
        requestedAt: input.requestedAt,
      }) ||
    compareInstants(input.quotaReservation.occurredAt, input.requestedAt) > 0 ||
    input.quotaReservation.reservationExpiresAt === null ||
    compareInstants(input.requestedAt, input.quotaReservation.reservationExpiresAt) >= 0
  ) {
    reason = "quota_denied";
  } else {
    reason = "admitted";
  }

  return immutableWithDigest({
    schemaVersion: 1 as const,
    admitted: reason === "admitted",
    reason,
    extensionId: input.extensionId,
    extensionVersion: input.extensionVersion,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    principalId: input.principalId,
    requestedAt: input.requestedAt,
    extensionManifestSha256: manifest?.manifestSha256 ?? null,
    certificationSha256: certification?.manifestSha256 ?? null,
    authorizationDecisionSha256: input.authorization.manifestSha256,
    compatibilityDecisionSha256: input.compatibility.manifestSha256,
    quotaReservationEventSha256: input.quotaReservation.eventSha256,
    isolationRuntime: manifest?.runtime ?? null,
  });
}

export function cloneExtensionRegistrySnapshot(
  registry: ExtensionRegistry,
  identities: readonly {
    readonly extensionId: string;
    readonly version: string;
  }[],
): readonly ExtensionManifest[] {
  const result = identities.map(({ extensionId, version }) =>
    registry.resolve(extensionId, version),
  );
  if (result.some((manifest) => manifest === null)) {
    throw new TypeError("extension registry snapshot contains an unknown identity");
  }
  return deepFreeze(cloneCanonical(result as ExtensionManifest[]));
}
