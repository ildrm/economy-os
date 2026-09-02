import {
  type AuthorizationDecision,
  assertAuthorizationDecisionIntegrity,
} from "./collaboration.js";
import {
  assertClientCompatibilityContractIntegrity,
  type ClientCompatibilityContract,
} from "./compatibility.js";
import {
  assertDigestIntegrity,
  assertExactKeys,
  assertIsoInstant,
  assertKey,
  assertPlainRecord,
  assertSha256,
  assertText,
  assertUniqueKeys,
  assertUuid,
  immutableWithDigest,
} from "./internals.js";

export type DeveloperAssetKind = "sdk" | "cli" | "webhook" | "connector" | "model_extension";
export type DeveloperEntryStatus = "draft" | "published" | "suspended" | "retired";

export interface DeveloperPortalEntryInput {
  readonly entryId: string;
  readonly integrationId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly ownerPrincipalId: string;
  readonly actorId: string;
  readonly assetKind: DeveloperAssetKind;
  readonly slug: string;
  readonly displayName: string;
  readonly summary: string;
  readonly documentationPath: string;
  readonly artifactSha256: string;
  readonly capabilities: readonly string[];
  readonly compatibilityContract: ClientCompatibilityContract;
  readonly extensionCertificationSha256: string | null;
  readonly status: DeveloperEntryStatus;
  readonly issuedAt: string;
  readonly authorization: AuthorizationDecision;
}

export type DeveloperPortalEntry = Readonly<{
  readonly schemaVersion: 1;
  readonly entryId: string;
  readonly integrationId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly ownerPrincipalId: string;
  readonly assetKind: DeveloperAssetKind;
  readonly slug: string;
  readonly displayName: string;
  readonly summary: string;
  readonly documentationPath: string;
  readonly artifactSha256: string;
  readonly capabilities: readonly string[];
  readonly compatibilityContractSha256: string;
  readonly extensionCertificationSha256: string | null;
  readonly status: DeveloperEntryStatus;
  readonly issuedAt: string;
  readonly authorizationDecisionSha256: string;
  readonly manifestSha256: string;
}>;

const ASSET_KINDS: readonly DeveloperAssetKind[] = [
  "sdk",
  "cli",
  "webhook",
  "connector",
  "model_extension",
];
const ENTRY_STATUSES: readonly DeveloperEntryStatus[] = [
  "draft",
  "published",
  "suspended",
  "retired",
];

export function createDeveloperPortalEntry(input: DeveloperPortalEntryInput): DeveloperPortalEntry {
  assertPlainRecord(input, "developer portal entry");
  assertExactKeys(
    input,
    [
      "entryId",
      "integrationId",
      "organizationId",
      "workspaceId",
      "ownerPrincipalId",
      "actorId",
      "assetKind",
      "slug",
      "displayName",
      "summary",
      "documentationPath",
      "artifactSha256",
      "capabilities",
      "compatibilityContract",
      "extensionCertificationSha256",
      "status",
      "issuedAt",
      "authorization",
    ],
    "developer portal entry",
  );
  assertUuid(input.entryId, "developer portal entry.entryId");
  assertUuid(input.integrationId, "developer portal entry.integrationId");
  assertUuid(input.organizationId, "developer portal entry.organizationId");
  assertUuid(input.workspaceId, "developer portal entry.workspaceId");
  assertUuid(input.ownerPrincipalId, "developer portal entry.ownerPrincipalId");
  assertUuid(input.actorId, "developer portal entry.actorId");
  if (!ASSET_KINDS.includes(input.assetKind)) {
    throw new TypeError("developer portal entry.assetKind is invalid");
  }
  assertKey(input.slug, "developer portal entry.slug");
  assertText(input.displayName, "developer portal entry.displayName", 160);
  assertText(input.summary, "developer portal entry.summary", 2_000);
  if (input.documentationPath !== `/developers/integrations/${input.slug}`) {
    throw new TypeError(
      "developer portal entry.documentationPath must be its canonical local path",
    );
  }
  assertSha256(input.artifactSha256, "developer portal entry.artifactSha256");
  assertUniqueKeys(input.capabilities, "developer portal entry.capabilities", 1, 100);
  assertClientCompatibilityContractIntegrity(input.compatibilityContract);
  if (
    input.capabilities.some(
      (capability) => !input.compatibilityContract.capabilities.includes(capability),
    )
  ) {
    throw new TypeError(
      "developer portal entry requests a capability outside its compatibility contract",
    );
  }
  if (input.extensionCertificationSha256 !== null) {
    assertSha256(
      input.extensionCertificationSha256,
      "developer portal entry.extensionCertificationSha256",
    );
  }
  const extensionAsset = input.assetKind === "connector" || input.assetKind === "model_extension";
  if (
    (extensionAsset &&
      input.status === "published" &&
      input.extensionCertificationSha256 === null) ||
    (!extensionAsset && input.extensionCertificationSha256 !== null)
  ) {
    throw new TypeError("developer portal entry has an invalid extension certification binding");
  }
  if (!ENTRY_STATUSES.includes(input.status)) {
    throw new TypeError("developer portal entry.status is invalid");
  }
  assertIsoInstant(input.issuedAt, "developer portal entry.issuedAt");
  assertAuthorizationDecisionIntegrity(input.authorization);
  if (
    !input.authorization.allowed ||
    input.authorization.action !== "developer.integration.manage" ||
    input.authorization.organizationId !== input.organizationId ||
    input.authorization.workspaceId !== input.workspaceId ||
    input.authorization.principalId !== input.actorId ||
    input.authorization.evaluatedAt !== input.issuedAt
  ) {
    throw new TypeError("developer portal authorization does not allow this exact publication");
  }
  return immutableWithDigest({
    schemaVersion: 1 as const,
    entryId: input.entryId,
    integrationId: input.integrationId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    ownerPrincipalId: input.ownerPrincipalId,
    assetKind: input.assetKind,
    slug: input.slug,
    displayName: input.displayName,
    summary: input.summary,
    documentationPath: input.documentationPath,
    artifactSha256: input.artifactSha256,
    capabilities: [...input.capabilities].sort(),
    compatibilityContractSha256: input.compatibilityContract.manifestSha256,
    extensionCertificationSha256: input.extensionCertificationSha256,
    status: input.status,
    issuedAt: input.issuedAt,
    authorizationDecisionSha256: input.authorization.manifestSha256,
  });
}

export function assertDeveloperPortalEntryIntegrity(entry: DeveloperPortalEntry): void {
  assertPlainRecord(entry, "developer portal entry");
  assertExactKeys(
    entry,
    [
      "schemaVersion",
      "entryId",
      "integrationId",
      "organizationId",
      "workspaceId",
      "ownerPrincipalId",
      "assetKind",
      "slug",
      "displayName",
      "summary",
      "documentationPath",
      "artifactSha256",
      "capabilities",
      "compatibilityContractSha256",
      "extensionCertificationSha256",
      "status",
      "issuedAt",
      "authorizationDecisionSha256",
      "manifestSha256",
    ],
    "developer portal entry",
  );
  if (entry.schemaVersion !== 1) {
    throw new TypeError("developer portal entry schema is unsupported");
  }
  assertDigestIntegrity(entry, "developer portal entry");
  assertUuid(entry.entryId, "developer portal entry.entryId");
  assertUuid(entry.integrationId, "developer portal entry.integrationId");
  assertUuid(entry.organizationId, "developer portal entry.organizationId");
  assertUuid(entry.workspaceId, "developer portal entry.workspaceId");
  assertUuid(entry.ownerPrincipalId, "developer portal entry.ownerPrincipalId");
  if (!ASSET_KINDS.includes(entry.assetKind) || !ENTRY_STATUSES.includes(entry.status)) {
    throw new TypeError("developer portal entry kind or status is invalid");
  }
  assertKey(entry.slug, "developer portal entry.slug");
  assertText(entry.displayName, "developer portal entry.displayName", 160);
  assertText(entry.summary, "developer portal entry.summary", 2_000);
  if (entry.documentationPath !== `/developers/integrations/${entry.slug}`) {
    throw new TypeError("developer portal entry.documentationPath is not canonical");
  }
  assertSha256(entry.artifactSha256, "developer portal entry.artifactSha256");
  assertSha256(
    entry.compatibilityContractSha256,
    "developer portal entry.compatibilityContractSha256",
  );
  if (entry.extensionCertificationSha256 !== null) {
    assertSha256(
      entry.extensionCertificationSha256,
      "developer portal entry.extensionCertificationSha256",
    );
  }
  assertUniqueKeys(entry.capabilities, "developer portal entry.capabilities", 1, 100);
  assertIsoInstant(entry.issuedAt, "developer portal entry.issuedAt");
  assertSha256(
    entry.authorizationDecisionSha256,
    "developer portal entry.authorizationDecisionSha256",
  );
}
