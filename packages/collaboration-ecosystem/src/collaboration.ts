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
  chainedEvent,
  cloneCanonical,
  compareInstants,
  deepFreeze,
  digestJson,
  immutableWithDigest,
  sha256Text,
  signaturesEqual,
  verifyHashChain,
} from "./internals.js";

export const WORKSPACE_ROLES = [
  "organization_owner",
  "workspace_admin",
  "analyst",
  "researcher",
  "viewer",
  "model_validator",
  "data_steward",
  "billing_admin",
  "api_operator",
  "auditor",
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

const ROLE_PERMISSIONS: Readonly<Record<WorkspaceRole, ReadonlySet<string>>> = {
  organization_owner: new Set([
    "workspace.manage",
    "collaboration.annotation.create",
    "collaboration.comment.create",
    "collaboration.record.edit",
    "collaboration.record.resolve",
    "api_credential.use",
    "developer.integration.manage",
    "webhook.manage",
    "extension.certify",
    "extension.revoke",
    "extension.admit",
    "extension.execute",
    "quota.reconcile",
    "audit.read",
  ]),
  workspace_admin: new Set([
    "workspace.manage",
    "collaboration.annotation.create",
    "collaboration.comment.create",
    "collaboration.record.edit",
    "collaboration.record.resolve",
    "api_credential.use",
    "developer.integration.manage",
    "webhook.manage",
    "extension.admit",
    "extension.execute",
    "quota.reconcile",
    "audit.read",
  ]),
  analyst: new Set([
    "collaboration.annotation.create",
    "collaboration.comment.create",
    "collaboration.record.edit",
    "collaboration.record.resolve",
  ]),
  researcher: new Set([
    "collaboration.annotation.create",
    "collaboration.comment.create",
    "collaboration.record.edit",
  ]),
  viewer: new Set(),
  model_validator: new Set([
    "collaboration.annotation.create",
    "collaboration.comment.create",
    "collaboration.record.resolve",
    "extension.certify",
  ]),
  data_steward: new Set([
    "collaboration.annotation.create",
    "collaboration.comment.create",
    "collaboration.record.resolve",
    "extension.certify",
  ]),
  billing_admin: new Set(),
  api_operator: new Set([
    "api_credential.use",
    "developer.integration.manage",
    "webhook.manage",
    "extension.admit",
    "extension.execute",
    "quota.reconcile",
  ]),
  auditor: new Set(["audit.read"]),
};

function assertRole(value: string, field: string): asserts value is WorkspaceRole {
  if (!WORKSPACE_ROLES.includes(value as WorkspaceRole)) {
    throw new TypeError(`${field} is not a supported workspace role`);
  }
}

export interface SharedWorkspaceInput {
  readonly workspaceId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly visibility: "organization_private" | "workspace_private";
  readonly classification: "public" | "internal" | "confidential" | "restricted";
  readonly createdBy: string;
  readonly createdAt: string;
}

export type SharedWorkspace = Readonly<
  SharedWorkspaceInput & { readonly schemaVersion: 1; readonly manifestSha256: string }
>;

export function createSharedWorkspace(input: SharedWorkspaceInput): SharedWorkspace {
  assertPlainRecord(input, "workspace");
  assertExactKeys(
    input,
    [
      "workspaceId",
      "organizationId",
      "name",
      "visibility",
      "classification",
      "createdBy",
      "createdAt",
    ],
    "workspace",
  );
  assertUuid(input.workspaceId, "workspace.workspaceId");
  assertUuid(input.organizationId, "workspace.organizationId");
  assertUuid(input.createdBy, "workspace.createdBy");
  assertText(input.name, "workspace.name", 160);
  if (!(["organization_private", "workspace_private"] as const).includes(input.visibility)) {
    throw new TypeError("workspace.visibility is invalid");
  }
  if (
    !(["public", "internal", "confidential", "restricted"] as const).includes(input.classification)
  ) {
    throw new TypeError("workspace.classification is invalid");
  }
  assertIsoInstant(input.createdAt, "workspace.createdAt");
  return immutableWithDigest({ schemaVersion: 1 as const, ...input });
}

export function assertSharedWorkspaceIntegrity(workspace: SharedWorkspace): void {
  assertPlainRecord(workspace, "workspace");
  assertExactKeys(
    workspace,
    [
      "schemaVersion",
      "workspaceId",
      "organizationId",
      "name",
      "visibility",
      "classification",
      "createdBy",
      "createdAt",
      "manifestSha256",
    ],
    "workspace",
  );
  if (workspace.schemaVersion !== 1) throw new TypeError("workspace schema is unsupported");
  assertDigestIntegrity(workspace, "workspace");
  const { schemaVersion: _schemaVersion, manifestSha256: _manifestSha256, ...body } = workspace;
  if (createSharedWorkspace(body).manifestSha256 !== workspace.manifestSha256) {
    throw new TypeError("workspace is not canonical");
  }
}

export interface MembershipGrantInput {
  readonly principalId: string;
  readonly role: WorkspaceRole;
  readonly grantedAt: string;
  readonly revokedAt: string | null;
}

export interface MembershipPolicyInput {
  readonly policyId: string;
  readonly policyVersion: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly issuedAt: string;
  readonly grants: readonly MembershipGrantInput[];
}

export type MembershipPolicy = Readonly<
  Omit<MembershipPolicyInput, "grants"> & {
    readonly schemaVersion: 1;
    readonly grants: readonly Readonly<MembershipGrantInput>[];
    readonly manifestSha256: string;
  }
>;

export function createMembershipPolicy(input: MembershipPolicyInput): MembershipPolicy {
  assertPlainRecord(input, "membership policy");
  assertExactKeys(
    input,
    ["policyId", "policyVersion", "organizationId", "workspaceId", "issuedAt", "grants"],
    "membership policy",
  );
  assertUuid(input.policyId, "membership policy.policyId");
  assertUuid(input.organizationId, "membership policy.organizationId");
  assertUuid(input.workspaceId, "membership policy.workspaceId");
  assertKey(input.policyVersion, "membership policy.policyVersion");
  assertIsoInstant(input.issuedAt, "membership policy.issuedAt");
  if (!Array.isArray(input.grants) || input.grants.length > 10_000) {
    throw new TypeError("membership policy.grants must contain 0..10000 entries");
  }
  const identities = new Set<string>();
  const grants = input.grants.map((grant, index) => {
    assertPlainRecord(grant, `membership policy.grants[${index}]`);
    assertExactKeys(
      grant,
      ["principalId", "role", "grantedAt", "revokedAt"],
      `membership policy.grants[${index}]`,
    );
    const typedGrant = grant as unknown as MembershipGrantInput;
    assertUuid(typedGrant.principalId, `membership policy.grants[${index}].principalId`);
    assertRole(typedGrant.role, `membership policy.grants[${index}].role`);
    assertIsoInstant(typedGrant.grantedAt, `membership policy.grants[${index}].grantedAt`);
    if (compareInstants(typedGrant.grantedAt, input.issuedAt) > 0) {
      throw new TypeError("membership grant cannot begin after policy issuance");
    }
    if (typedGrant.revokedAt !== null) {
      assertIsoInstant(typedGrant.revokedAt, `membership policy.grants[${index}].revokedAt`);
      if (compareInstants(typedGrant.revokedAt, typedGrant.grantedAt) <= 0) {
        throw new TypeError("membership revocation must follow grant time");
      }
    }
    const identity = `${typedGrant.principalId}:${typedGrant.role}`;
    if (identities.has(identity))
      throw new TypeError("membership policy contains duplicate grants");
    identities.add(identity);
    return typedGrant;
  });
  grants.sort((left, right) =>
    `${left.principalId}:${left.role}`.localeCompare(`${right.principalId}:${right.role}`),
  );
  return immutableWithDigest({
    schemaVersion: 1 as const,
    ...input,
    grants,
  });
}

export function assertMembershipPolicyIntegrity(policy: MembershipPolicy): void {
  assertPlainRecord(policy, "membership policy");
  assertExactKeys(
    policy,
    [
      "schemaVersion",
      "policyId",
      "policyVersion",
      "organizationId",
      "workspaceId",
      "issuedAt",
      "grants",
      "manifestSha256",
    ],
    "membership policy",
  );
  if (policy.schemaVersion !== 1) throw new TypeError("membership policy schema is unsupported");
  assertDigestIntegrity(policy, "membership policy");
  const { schemaVersion: _schemaVersion, manifestSha256: _manifestSha256, ...body } = policy;
  if (createMembershipPolicy(body).manifestSha256 !== policy.manifestSha256) {
    throw new TypeError("membership policy is not canonical");
  }
}

export interface AuthorizationRequest {
  readonly principalId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly resourceOrganizationId: string;
  readonly resourceWorkspaceId: string;
  readonly action: string;
  readonly evaluatedAt: string;
  readonly entitlementAllowed: boolean;
  readonly classificationAllowed: boolean;
  readonly governanceAllowed: boolean;
}

export type AuthorizationReason =
  | "tenant_mismatch"
  | "workspace_mismatch"
  | "policy_not_yet_valid"
  | "membership_inactive"
  | "permission_missing"
  | "classification_denied"
  | "governance_denied"
  | "entitlement_denied"
  | "allowed";

export type AuthorizationDecision = Readonly<{
  readonly schemaVersion: 1;
  readonly principalId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly action: string;
  readonly evaluatedAt: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly allowed: boolean;
  readonly reason: AuthorizationReason;
  readonly manifestSha256: string;
}>;

export function authorizeWorkspaceAction(
  policy: MembershipPolicy,
  request: AuthorizationRequest,
): AuthorizationDecision {
  assertMembershipPolicyIntegrity(policy);
  assertPlainRecord(request, "authorization request");
  assertExactKeys(
    request,
    [
      "principalId",
      "organizationId",
      "workspaceId",
      "resourceOrganizationId",
      "resourceWorkspaceId",
      "action",
      "evaluatedAt",
      "entitlementAllowed",
      "classificationAllowed",
      "governanceAllowed",
    ],
    "authorization request",
  );
  for (const [field, value] of [
    ["principalId", request.principalId],
    ["organizationId", request.organizationId],
    ["workspaceId", request.workspaceId],
    ["resourceOrganizationId", request.resourceOrganizationId],
    ["resourceWorkspaceId", request.resourceWorkspaceId],
  ] as const) {
    assertUuid(value, `authorization request.${field}`);
  }
  assertKey(request.action, "authorization request.action");
  assertIsoInstant(request.evaluatedAt, "authorization request.evaluatedAt");
  if (
    typeof request.entitlementAllowed !== "boolean" ||
    typeof request.classificationAllowed !== "boolean" ||
    typeof request.governanceAllowed !== "boolean"
  ) {
    throw new TypeError("authorization policy flags must be boolean");
  }

  let reason: AuthorizationReason;
  if (
    request.organizationId !== policy.organizationId ||
    request.resourceOrganizationId !== policy.organizationId
  ) {
    reason = "tenant_mismatch";
  } else if (
    request.workspaceId !== policy.workspaceId ||
    request.resourceWorkspaceId !== policy.workspaceId
  ) {
    reason = "workspace_mismatch";
  } else if (compareInstants(request.evaluatedAt, policy.issuedAt) < 0) {
    reason = "policy_not_yet_valid";
  } else {
    const active = policy.grants.filter(
      (grant) =>
        grant.principalId === request.principalId &&
        compareInstants(grant.grantedAt, request.evaluatedAt) <= 0 &&
        (grant.revokedAt === null || compareInstants(request.evaluatedAt, grant.revokedAt) < 0),
    );
    if (active.length === 0) reason = "membership_inactive";
    else if (!active.some((grant) => ROLE_PERMISSIONS[grant.role].has(request.action))) {
      reason = "permission_missing";
    } else if (!request.classificationAllowed) reason = "classification_denied";
    else if (!request.governanceAllowed) reason = "governance_denied";
    else if (!request.entitlementAllowed) reason = "entitlement_denied";
    else reason = "allowed";
  }

  return immutableWithDigest({
    schemaVersion: 1 as const,
    principalId: request.principalId,
    organizationId: request.organizationId,
    workspaceId: request.workspaceId,
    action: request.action,
    evaluatedAt: request.evaluatedAt,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    allowed: reason === "allowed",
    reason,
  });
}

const AUTHORIZATION_REASONS: readonly AuthorizationReason[] = [
  "tenant_mismatch",
  "workspace_mismatch",
  "policy_not_yet_valid",
  "membership_inactive",
  "permission_missing",
  "classification_denied",
  "governance_denied",
  "entitlement_denied",
  "allowed",
];

export function assertAuthorizationDecisionIntegrity(decision: AuthorizationDecision): void {
  assertPlainRecord(decision, "authorization decision");
  assertExactKeys(
    decision,
    [
      "schemaVersion",
      "principalId",
      "organizationId",
      "workspaceId",
      "action",
      "evaluatedAt",
      "policyId",
      "policyVersion",
      "allowed",
      "reason",
      "manifestSha256",
    ],
    "authorization decision",
  );
  if (decision.schemaVersion !== 1)
    throw new TypeError("authorization decision schema is unsupported");
  assertUuid(decision.principalId, "authorization decision.principalId");
  assertUuid(decision.organizationId, "authorization decision.organizationId");
  assertUuid(decision.workspaceId, "authorization decision.workspaceId");
  assertUuid(decision.policyId, "authorization decision.policyId");
  assertKey(decision.action, "authorization decision.action");
  assertKey(decision.policyVersion, "authorization decision.policyVersion");
  assertIsoInstant(decision.evaluatedAt, "authorization decision.evaluatedAt");
  if (
    typeof decision.allowed !== "boolean" ||
    !AUTHORIZATION_REASONS.includes(decision.reason) ||
    decision.allowed !== (decision.reason === "allowed")
  ) {
    throw new TypeError("authorization decision has inconsistent outcome fields");
  }
  assertDigestIntegrity(decision, "authorization decision");
}

export interface ApiCredentialInput {
  readonly credentialId: string;
  readonly principalId: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly scopes: readonly string[];
  readonly secretSha256: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

export type ApiCredential = Readonly<
  ApiCredentialInput & { readonly schemaVersion: 1; readonly manifestSha256: string }
>;

export function createApiCredential(input: ApiCredentialInput): ApiCredential {
  assertPlainRecord(input, "API credential");
  assertExactKeys(
    input,
    [
      "credentialId",
      "principalId",
      "organizationId",
      "workspaceId",
      "scopes",
      "secretSha256",
      "issuedAt",
      "expiresAt",
      "revokedAt",
    ],
    "API credential",
  );
  assertUuid(input.credentialId, "API credential.credentialId");
  assertUuid(input.principalId, "API credential.principalId");
  assertUuid(input.organizationId, "API credential.organizationId");
  if (input.workspaceId !== null) assertUuid(input.workspaceId, "API credential.workspaceId");
  assertUniqueKeys(input.scopes, "API credential.scopes", 1, 100);
  assertSha256(input.secretSha256, "API credential.secretSha256");
  assertIsoInstant(input.issuedAt, "API credential.issuedAt");
  assertIsoInstant(input.expiresAt, "API credential.expiresAt");
  if (compareInstants(input.expiresAt, input.issuedAt) <= 0) {
    throw new TypeError("API credential expiry must follow issuance");
  }
  if (input.revokedAt !== null) {
    assertIsoInstant(input.revokedAt, "API credential.revokedAt");
    if (compareInstants(input.revokedAt, input.issuedAt) < 0) {
      throw new TypeError("API credential revocation cannot predate issuance");
    }
  }
  return immutableWithDigest({
    schemaVersion: 1 as const,
    ...input,
    scopes: [...input.scopes].sort(),
  });
}

export function assertApiCredentialIntegrity(credential: ApiCredential): void {
  assertPlainRecord(credential, "API credential");
  assertExactKeys(
    credential,
    [
      "schemaVersion",
      "credentialId",
      "principalId",
      "organizationId",
      "workspaceId",
      "scopes",
      "secretSha256",
      "issuedAt",
      "expiresAt",
      "revokedAt",
      "manifestSha256",
    ],
    "API credential",
  );
  if (credential.schemaVersion !== 1) throw new TypeError("API credential schema is unsupported");
  assertDigestIntegrity(credential, "API credential");
  const { schemaVersion: _schemaVersion, manifestSha256: _manifestSha256, ...body } = credential;
  if (createApiCredential(body).manifestSha256 !== credential.manifestSha256) {
    throw new TypeError("API credential is not canonical");
  }
}

export type CredentialDecision = Readonly<{
  readonly allowed: boolean;
  readonly reason:
    | "credential_authentication_failed"
    | "credential_tenant_mismatch"
    | "credential_workspace_mismatch"
    | "credential_not_yet_valid"
    | "credential_expired"
    | "credential_revoked"
    | "credential_scope_missing"
    | "authorization_denied"
    | "allowed";
  readonly credentialId: string;
  readonly action: string;
  readonly evaluatedAt: string;
  readonly authorizationDecisionSha256: string;
  readonly manifestSha256: string;
}>;

export function authorizeApiCredential(input: {
  readonly credential: ApiCredential;
  readonly authorization: AuthorizationDecision;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly action: string;
  readonly evaluatedAt: string;
  readonly presentedSecret: string;
}): CredentialDecision {
  assertPlainRecord(input, "credential authorization");
  assertExactKeys(
    input,
    [
      "credential",
      "authorization",
      "organizationId",
      "workspaceId",
      "action",
      "evaluatedAt",
      "presentedSecret",
    ],
    "credential authorization",
  );
  assertApiCredentialIntegrity(input.credential);
  assertAuthorizationDecisionIntegrity(input.authorization);
  assertUuid(input.organizationId, "credential authorization.organizationId");
  assertUuid(input.workspaceId, "credential authorization.workspaceId");
  assertKey(input.action, "credential authorization.action");
  assertIsoInstant(input.evaluatedAt, "credential authorization.evaluatedAt");
  if (
    typeof input.presentedSecret !== "string" ||
    input.presentedSecret.length < 32 ||
    input.presentedSecret.length > 4_096
  ) {
    throw new TypeError(
      "credential authorization.presentedSecret must contain 32..4096 characters",
    );
  }

  let reason: CredentialDecision["reason"];
  if (!signaturesEqual(sha256Text(input.presentedSecret), input.credential.secretSha256)) {
    reason = "credential_authentication_failed";
  } else if (input.credential.organizationId !== input.organizationId) {
    reason = "credential_tenant_mismatch";
  } else if (
    input.credential.workspaceId !== null &&
    input.credential.workspaceId !== input.workspaceId
  ) {
    reason = "credential_workspace_mismatch";
  } else if (compareInstants(input.evaluatedAt, input.credential.issuedAt) < 0) {
    reason = "credential_not_yet_valid";
  } else if (compareInstants(input.evaluatedAt, input.credential.expiresAt) >= 0) {
    reason = "credential_expired";
  } else if (
    input.credential.revokedAt !== null &&
    compareInstants(input.evaluatedAt, input.credential.revokedAt) >= 0
  ) {
    reason = "credential_revoked";
  } else if (!input.credential.scopes.includes(input.action)) {
    reason = "credential_scope_missing";
  } else if (
    !input.authorization.allowed ||
    input.authorization.principalId !== input.credential.principalId ||
    input.authorization.organizationId !== input.organizationId ||
    input.authorization.workspaceId !== input.workspaceId ||
    input.authorization.action !== input.action ||
    input.authorization.evaluatedAt !== input.evaluatedAt
  ) {
    reason = "authorization_denied";
  } else {
    reason = "allowed";
  }
  return immutableWithDigest({
    allowed: reason === "allowed",
    reason,
    credentialId: input.credential.credentialId,
    action: input.action,
    evaluatedAt: input.evaluatedAt,
    authorizationDecisionSha256: input.authorization.manifestSha256,
  });
}

export interface ArtifactReference {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly artifactId: string;
  readonly artifactType: string;
  readonly artifactVersionSha256: string;
  readonly asOf: string;
  readonly pointInTimeGrade: "exact_vintage" | "release_aware" | "retrieval_only";
}

export interface EvidenceCitation {
  readonly evidenceId: string;
  readonly evidenceVersionSha256: string;
  readonly locator: string;
  readonly availableAt: string;
  readonly temporalRelation: "available_by_artifact_cutoff" | "subsequent_evidence";
}

export type CollaborationRecordKind = "annotation" | "comment";
export type CollaborationEventAction = "created" | "revised" | "resolved";

export interface CollaborationEvent {
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly previousEventSha256: string | null;
  readonly recordId: string;
  readonly recordVersion: number;
  readonly kind: CollaborationRecordKind;
  readonly action: CollaborationEventAction;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly artifact: Readonly<ArtifactReference>;
  readonly citations: readonly Readonly<EvidenceCitation>[];
  readonly body: string | null;
  readonly contentClass: "non_authoritative_commentary";
  readonly authorizationDecisionSha256: string;
  readonly previousRecordEventSha256: string | null;
  readonly eventSha256: string;
}

interface CollaborationWriteBase {
  readonly recordId: string;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly authorization: AuthorizationDecision;
}

export interface CreateCollaborationRecordInput extends CollaborationWriteBase {
  readonly kind: CollaborationRecordKind;
  readonly artifact: ArtifactReference;
  readonly citations: readonly EvidenceCitation[];
  readonly body: string;
}

export interface ReviseCollaborationRecordInput extends CollaborationWriteBase {
  readonly citations: readonly EvidenceCitation[];
  readonly body: string;
}

export interface ResolveCollaborationRecordInput extends CollaborationWriteBase {
  readonly resolutionCitations: readonly EvidenceCitation[];
}

function validateArtifact(value: ArtifactReference, field: string): void {
  assertPlainRecord(value, field);
  assertExactKeys(
    value,
    [
      "organizationId",
      "workspaceId",
      "artifactId",
      "artifactType",
      "artifactVersionSha256",
      "asOf",
      "pointInTimeGrade",
    ],
    field,
  );
  assertUuid(value.organizationId, `${field}.organizationId`);
  assertUuid(value.workspaceId, `${field}.workspaceId`);
  assertUuid(value.artifactId, `${field}.artifactId`);
  assertKey(value.artifactType, `${field}.artifactType`);
  assertSha256(value.artifactVersionSha256, `${field}.artifactVersionSha256`);
  assertIsoInstant(value.asOf, `${field}.asOf`);
  if (
    !("exact_vintage release_aware retrieval_only" as const)
      .split(" ")
      .includes(value.pointInTimeGrade)
  ) {
    throw new TypeError(`${field}.pointInTimeGrade is invalid`);
  }
}

function validateCitations(
  values: readonly EvidenceCitation[],
  field: string,
  artifactAsOf: string,
): void {
  if (!Array.isArray(values) || values.length < 1 || values.length > 20) {
    throw new TypeError(`${field} must contain 1..20 evidence pointers`);
  }
  const identities = new Set<string>();
  for (const [index, citation] of values.entries()) {
    assertPlainRecord(citation, `${field}[${index}]`);
    assertExactKeys(
      citation,
      ["evidenceId", "evidenceVersionSha256", "locator", "availableAt", "temporalRelation"],
      `${field}[${index}]`,
    );
    const typedCitation = citation as unknown as EvidenceCitation;
    assertUuid(typedCitation.evidenceId, `${field}[${index}].evidenceId`);
    assertSha256(typedCitation.evidenceVersionSha256, `${field}[${index}].evidenceVersionSha256`);
    assertText(typedCitation.locator, `${field}[${index}].locator`, 500);
    assertIsoInstant(typedCitation.availableAt, `${field}[${index}].availableAt`);
    const expectedRelation =
      compareInstants(typedCitation.availableAt, artifactAsOf) <= 0
        ? "available_by_artifact_cutoff"
        : "subsequent_evidence";
    if (typedCitation.temporalRelation !== expectedRelation) {
      throw new TypeError(
        `${field}[${index}].temporalRelation does not match the artifact point-in-time cutoff`,
      );
    }
    const identity = digestJson(typedCitation);
    if (identities.has(identity)) throw new TypeError(`${field} contains duplicate citations`);
    identities.add(identity);
  }
}

function requiredAction(kind: CollaborationRecordKind, action: CollaborationEventAction): string {
  if (action === "created") return `collaboration.${kind}.create`;
  if (action === "revised") return "collaboration.record.edit";
  return "collaboration.record.resolve";
}

function validateWriteAuthorization(
  authorization: AuthorizationDecision,
  action: string,
  actorId: string,
  organizationId: string,
  workspaceId: string,
  occurredAt: string,
): void {
  assertAuthorizationDecisionIntegrity(authorization);
  if (
    !authorization.allowed ||
    authorization.action !== action ||
    authorization.principalId !== actorId ||
    authorization.organizationId !== organizationId ||
    authorization.workspaceId !== workspaceId ||
    authorization.evaluatedAt !== occurredAt
  ) {
    throw new TypeError("collaboration authorization does not allow this exact write");
  }
}

function assertRecordKind(value: string): asserts value is CollaborationRecordKind {
  if (value !== "annotation" && value !== "comment") {
    throw new TypeError("collaboration kind is invalid");
  }
}

export class CollaborationLedger {
  readonly #organizationId: string;
  readonly #workspaceId: string;
  readonly #events: CollaborationEvent[] = [];

  constructor(organizationId: string, workspaceId: string) {
    assertUuid(organizationId, "ledger organizationId");
    assertUuid(workspaceId, "ledger workspaceId");
    this.#organizationId = organizationId;
    this.#workspaceId = workspaceId;
  }

  create(input: CreateCollaborationRecordInput): CollaborationEvent {
    assertPlainRecord(input, "collaboration create");
    assertExactKeys(
      input,
      [
        "recordId",
        "actorId",
        "occurredAt",
        "authorization",
        "kind",
        "artifact",
        "citations",
        "body",
      ],
      "collaboration create",
    );
    assertUuid(input.recordId, "collaboration create.recordId");
    assertUuid(input.actorId, "collaboration create.actorId");
    assertIsoInstant(input.occurredAt, "collaboration create.occurredAt");
    assertRecordKind(input.kind);
    assertText(input.body, "collaboration create.body", 10_000);
    validateArtifact(input.artifact, "collaboration create.artifact");
    validateCitations(input.citations, "collaboration create.citations", input.artifact.asOf);
    if (compareInstants(input.artifact.asOf, input.occurredAt) > 0) {
      throw new TypeError("collaboration artifact cutoff cannot follow record creation");
    }
    if (this.#events.some((event) => event.recordId === input.recordId)) {
      throw new TypeError("collaboration record already exists");
    }
    if (
      input.artifact.organizationId !== this.#organizationId ||
      input.artifact.workspaceId !== this.#workspaceId
    ) {
      throw new TypeError("artifact pointer crosses the collaboration ledger tenant boundary");
    }
    validateWriteAuthorization(
      input.authorization,
      requiredAction(input.kind, "created"),
      input.actorId,
      this.#organizationId,
      this.#workspaceId,
      input.occurredAt,
    );
    return this.#append({
      recordId: input.recordId,
      recordVersion: 1,
      kind: input.kind,
      action: "created",
      actorId: input.actorId,
      occurredAt: input.occurredAt,
      artifact: input.artifact,
      citations: input.citations,
      body: input.body,
      authorizationDecisionSha256: input.authorization.manifestSha256,
      previousRecordEventSha256: null,
    });
  }

  revise(input: ReviseCollaborationRecordInput): CollaborationEvent {
    assertPlainRecord(input, "collaboration revision");
    assertExactKeys(
      input,
      ["recordId", "actorId", "occurredAt", "authorization", "citations", "body"],
      "collaboration revision",
    );
    assertUuid(input.recordId, "collaboration revision.recordId");
    assertUuid(input.actorId, "collaboration revision.actorId");
    assertIsoInstant(input.occurredAt, "collaboration revision.occurredAt");
    assertText(input.body, "collaboration revision.body", 10_000);
    const current = this.#current(input.recordId);
    validateCitations(input.citations, "collaboration revision.citations", current.artifact.asOf);
    if (current.action === "resolved")
      throw new TypeError("resolved collaboration record is final");
    if (compareInstants(input.occurredAt, current.occurredAt) <= 0) {
      throw new TypeError("collaboration revision must follow the current record event");
    }
    validateWriteAuthorization(
      input.authorization,
      requiredAction(current.kind, "revised"),
      input.actorId,
      this.#organizationId,
      this.#workspaceId,
      input.occurredAt,
    );
    return this.#append({
      recordId: current.recordId,
      recordVersion: current.recordVersion + 1,
      kind: current.kind,
      action: "revised",
      actorId: input.actorId,
      occurredAt: input.occurredAt,
      artifact: current.artifact,
      citations: input.citations,
      body: input.body,
      authorizationDecisionSha256: input.authorization.manifestSha256,
      previousRecordEventSha256: current.eventSha256,
    });
  }

  resolve(input: ResolveCollaborationRecordInput): CollaborationEvent {
    assertPlainRecord(input, "collaboration resolution");
    assertExactKeys(
      input,
      ["recordId", "actorId", "occurredAt", "authorization", "resolutionCitations"],
      "collaboration resolution",
    );
    assertUuid(input.recordId, "collaboration resolution.recordId");
    assertUuid(input.actorId, "collaboration resolution.actorId");
    assertIsoInstant(input.occurredAt, "collaboration resolution.occurredAt");
    const current = this.#current(input.recordId);
    validateCitations(
      input.resolutionCitations,
      "collaboration resolution.resolutionCitations",
      current.artifact.asOf,
    );
    if (current.action === "resolved")
      throw new TypeError("collaboration record is already resolved");
    if (compareInstants(input.occurredAt, current.occurredAt) <= 0) {
      throw new TypeError("collaboration resolution must follow the current record event");
    }
    validateWriteAuthorization(
      input.authorization,
      requiredAction(current.kind, "resolved"),
      input.actorId,
      this.#organizationId,
      this.#workspaceId,
      input.occurredAt,
    );
    return this.#append({
      recordId: current.recordId,
      recordVersion: current.recordVersion + 1,
      kind: current.kind,
      action: "resolved",
      actorId: input.actorId,
      occurredAt: input.occurredAt,
      artifact: current.artifact,
      citations: input.resolutionCitations,
      body: null,
      authorizationDecisionSha256: input.authorization.manifestSha256,
      previousRecordEventSha256: current.eventSha256,
    });
  }

  events(): readonly CollaborationEvent[] {
    return deepFreeze(cloneCanonical(this.#events));
  }

  static verifyReplay(events: readonly CollaborationEvent[]): void {
    verifyHashChain(events, "collaboration events");
    const current = new Map<string, CollaborationEvent>();
    let organizationId: string | null = null;
    let workspaceId: string | null = null;
    let previousOccurredAt: string | null = null;
    for (const [index, event] of events.entries()) {
      assertPlainRecord(event, `collaboration events[${index}]`);
      assertExactKeys(
        event,
        [
          "schemaVersion",
          "sequence",
          "previousEventSha256",
          "recordId",
          "recordVersion",
          "kind",
          "action",
          "organizationId",
          "workspaceId",
          "actorId",
          "occurredAt",
          "artifact",
          "citations",
          "body",
          "contentClass",
          "authorizationDecisionSha256",
          "previousRecordEventSha256",
          "eventSha256",
        ],
        `collaboration events[${index}]`,
      );
      if (event.schemaVersion !== 1) {
        throw new TypeError(`collaboration events[${index}] has an unsupported schema`);
      }
      assertUuid(event.recordId, `collaboration events[${index}].recordId`);
      assertUuid(event.organizationId, `collaboration events[${index}].organizationId`);
      assertUuid(event.workspaceId, `collaboration events[${index}].workspaceId`);
      assertUuid(event.actorId, `collaboration events[${index}].actorId`);
      assertIsoInstant(event.occurredAt, `collaboration events[${index}].occurredAt`);
      assertSha256(
        event.authorizationDecisionSha256,
        `collaboration events[${index}].authorizationDecisionSha256`,
      );
      if (event.previousRecordEventSha256 !== null) {
        assertSha256(
          event.previousRecordEventSha256,
          `collaboration events[${index}].previousRecordEventSha256`,
        );
      }
      assertRecordKind(event.kind);
      if (!(["created", "revised", "resolved"] as const).includes(event.action)) {
        throw new TypeError(`collaboration events[${index}] has an invalid action`);
      }
      if (!Number.isSafeInteger(event.recordVersion) || event.recordVersion < 1) {
        throw new TypeError(`collaboration events[${index}] has an invalid record version`);
      }
      const prior = current.get(event.recordId);
      if (event.contentClass !== "non_authoritative_commentary") {
        throw new TypeError(`collaboration events[${index}] has an authoritative value class`);
      }
      validateArtifact(event.artifact, `collaboration events[${index}].artifact`);
      validateCitations(
        event.citations,
        `collaboration events[${index}].citations`,
        event.artifact.asOf,
      );
      if (event.body !== null)
        assertText(event.body, `collaboration events[${index}].body`, 10_000);
      organizationId ??= event.organizationId;
      workspaceId ??= event.workspaceId;
      if (
        event.organizationId !== organizationId ||
        event.workspaceId !== workspaceId ||
        event.artifact.organizationId !== organizationId ||
        event.artifact.workspaceId !== workspaceId ||
        compareInstants(event.artifact.asOf, event.occurredAt) > 0 ||
        (previousOccurredAt !== null && compareInstants(event.occurredAt, previousOccurredAt) < 0)
      ) {
        throw new TypeError(`collaboration events[${index}] crosses scope or chronology`);
      }
      if (prior === undefined) {
        if (
          event.action !== "created" ||
          event.recordVersion !== 1 ||
          event.previousRecordEventSha256 !== null ||
          event.body === null
        ) {
          throw new TypeError(`collaboration events[${index}] has an invalid creation`);
        }
      } else {
        if (
          prior.action === "resolved" ||
          event.action === "created" ||
          event.kind !== prior.kind ||
          digestJson(event.artifact) !== digestJson(prior.artifact) ||
          event.recordVersion !== prior.recordVersion + 1 ||
          event.previousRecordEventSha256 !== prior.eventSha256 ||
          compareInstants(event.occurredAt, prior.occurredAt) <= 0 ||
          (event.action === "resolved" ? event.body !== null : event.body === null)
        ) {
          throw new TypeError(`collaboration events[${index}] has an invalid transition`);
        }
      }
      current.set(event.recordId, event);
      previousOccurredAt = event.occurredAt;
    }
  }

  #current(recordId: string): CollaborationEvent {
    const event = [...this.#events].reverse().find((candidate) => candidate.recordId === recordId);
    if (!event) throw new TypeError("collaboration record does not exist");
    return event;
  }

  #append(
    input: Omit<
      CollaborationEvent,
      | "schemaVersion"
      | "sequence"
      | "previousEventSha256"
      | "organizationId"
      | "workspaceId"
      | "contentClass"
      | "eventSha256"
    >,
  ): CollaborationEvent {
    const previous = this.#events.at(-1);
    if (previous && compareInstants(input.occurredAt, previous.occurredAt) < 0) {
      throw new TypeError("collaboration event predates the ledger head");
    }
    const event = chainedEvent({
      schemaVersion: 1 as const,
      sequence: this.#events.length + 1,
      previousEventSha256: previous?.eventSha256 ?? null,
      organizationId: this.#organizationId,
      workspaceId: this.#workspaceId,
      contentClass: "non_authoritative_commentary" as const,
      ...input,
    });
    this.#events.push(event);
    return event;
  }
}
