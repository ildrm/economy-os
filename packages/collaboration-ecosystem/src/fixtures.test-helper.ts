import {
  type AuthorizationDecision,
  authorizeWorkspaceAction,
  createMembershipPolicy,
  type MembershipPolicy,
  type WorkspaceRole,
} from "./collaboration.js";

export const IDS = {
  organization: "10000000-0000-4000-8000-000000000001",
  otherOrganization: "10000000-0000-4000-8000-000000000002",
  workspace: "20000000-0000-4000-8000-000000000001",
  otherWorkspace: "20000000-0000-4000-8000-000000000002",
  owner: "30000000-0000-4000-8000-000000000001",
  analyst: "30000000-0000-4000-8000-000000000002",
  viewer: "30000000-0000-4000-8000-000000000003",
  policy: "40000000-0000-4000-8000-000000000001",
  artifact: "50000000-0000-4000-8000-000000000001",
  evidence: "60000000-0000-4000-8000-000000000001",
  record: "70000000-0000-4000-8000-000000000001",
  record2: "70000000-0000-4000-8000-000000000002",
  credential: "80000000-0000-4000-8000-000000000001",
  quota: "90000000-0000-4000-8000-000000000001",
  reservation: "a0000000-0000-4000-8000-000000000001",
  reservation2: "a0000000-0000-4000-8000-000000000002",
  usage: "a0000000-0000-4000-8000-000000000003",
  reconciliation: "a0000000-0000-4000-8000-000000000004",
  endpoint: "b0000000-0000-4000-8000-000000000001",
  event: "b0000000-0000-4000-8000-000000000002",
  delivery: "b0000000-0000-4000-8000-000000000003",
  contract: "c0000000-0000-4000-8000-000000000001",
  extension: "d0000000-0000-4000-8000-000000000001",
  extension2: "d0000000-0000-4000-8000-000000000002",
  publisher: "d0000000-0000-4000-8000-000000000003",
  certification: "e0000000-0000-4000-8000-000000000001",
  revocation: "e0000000-0000-4000-8000-000000000002",
  audit: "f0000000-0000-4000-8000-000000000001",
  audit2: "f0000000-0000-4000-8000-000000000002",
  integration: "f0000000-0000-4000-8000-000000000003",
  trace: "f0000000-0000-4000-8000-000000000004",
} as const;

export const SHA_A = "a".repeat(64);
export const SHA_B = "b".repeat(64);
export const SHA_C = "c".repeat(64);
export const SHA_D = "d".repeat(64);

export const TIMES = {
  grant: "2026-01-01T00:00:00Z",
  issue: "2026-01-02T00:00:00Z",
  eval: "2026-01-03T00:00:00Z",
  next: "2026-01-03T00:01:00Z",
  later: "2026-01-03T00:02:00Z",
  muchLater: "2026-01-03T01:00:00Z",
  expiry: "2026-01-04T00:00:00Z",
  end: "2026-02-01T00:00:00Z",
} as const;

export function policyWith(
  roles: readonly { principalId: string; role: WorkspaceRole; revokedAt?: string | null }[] = [
    { principalId: IDS.owner, role: "organization_owner" },
    { principalId: IDS.analyst, role: "analyst" },
    { principalId: IDS.viewer, role: "viewer" },
  ],
): MembershipPolicy {
  return createMembershipPolicy({
    policyId: IDS.policy,
    policyVersion: "policy.v1",
    organizationId: IDS.organization,
    workspaceId: IDS.workspace,
    issuedAt: TIMES.issue,
    grants: roles.map((item) => ({
      principalId: item.principalId,
      role: item.role,
      grantedAt: TIMES.grant,
      revokedAt: item.revokedAt ?? null,
    })),
  });
}

export function authorization(
  action: string,
  options: {
    principalId?: string;
    organizationId?: string;
    workspaceId?: string;
    resourceOrganizationId?: string;
    resourceWorkspaceId?: string;
    evaluatedAt?: string;
    entitlementAllowed?: boolean;
    classificationAllowed?: boolean;
    governanceAllowed?: boolean;
    policy?: MembershipPolicy;
  } = {},
): AuthorizationDecision {
  const policy = options.policy ?? policyWith();
  const organizationId = options.organizationId ?? IDS.organization;
  const workspaceId = options.workspaceId ?? IDS.workspace;
  return authorizeWorkspaceAction(policy, {
    principalId: options.principalId ?? IDS.owner,
    organizationId,
    workspaceId,
    resourceOrganizationId: options.resourceOrganizationId ?? organizationId,
    resourceWorkspaceId: options.resourceWorkspaceId ?? workspaceId,
    action,
    evaluatedAt: options.evaluatedAt ?? TIMES.eval,
    entitlementAllowed: options.entitlementAllowed ?? true,
    classificationAllowed: options.classificationAllowed ?? true,
    governanceAllowed: options.governanceAllowed ?? true,
  });
}

export const ARTIFACT = {
  organizationId: IDS.organization,
  workspaceId: IDS.workspace,
  artifactId: IDS.artifact,
  artifactType: "forecast.run",
  artifactVersionSha256: SHA_A,
  asOf: TIMES.issue,
  pointInTimeGrade: "exact_vintage",
} as const;

export const CITATION = {
  evidenceId: IDS.evidence,
  evidenceVersionSha256: SHA_B,
  locator: "series/observation/42",
  availableAt: TIMES.issue,
  temporalRelation: "available_by_artifact_cutoff",
} as const;
