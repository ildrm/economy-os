import type { Principal, WorkspaceId } from "@economyos/contracts";
import { workspaceId } from "@economyos/contracts";
import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { PostgresRuntime, type TenantTransaction } from "./database.js";

export const WORKSPACE_MEMBERSHIPS = Symbol("economyos.api.workspace-memberships");

interface MembershipContextRow extends Record<string, unknown> {
  readonly identity_active: boolean;
  readonly workspace_ids: readonly string[] | null;
}

export interface ActiveMembershipContext {
  readonly identityActive: boolean;
  readonly workspaceIds: readonly WorkspaceId[];
}

export interface WorkspaceMembershipPort {
  loadActiveContext(
    principal: Principal,
    transaction?: TenantTransaction,
  ): Promise<ActiveMembershipContext>;
}

const ACTIVE_CONTEXT_QUERY = `
  SELECT
    EXISTS (
      SELECT 1
      FROM app.subjects subject
      JOIN app.organization_memberships organization_membership
        ON organization_membership.subject_id = subject.id
      JOIN app.organizations organization
        ON organization.id = organization_membership.organization_id
      WHERE subject.id = $1::uuid
        AND organization.id = $2::uuid
        AND subject.status = 'active'
        AND organization.status = 'active'
        AND organization_membership.valid_from <= statement_timestamp()
        AND (
          organization_membership.valid_until IS NULL
          OR organization_membership.valid_until > statement_timestamp()
        )
    ) AS identity_active,
    coalesce(array_agg(active_workspace.workspace_id) FILTER (
      WHERE active_workspace.workspace_id IS NOT NULL
    ), ARRAY[]::uuid[]) AS workspace_ids
  FROM (
    SELECT workspace_membership.workspace_id
    FROM app.workspace_memberships workspace_membership
    JOIN app.workspaces workspace
      ON workspace.id = workspace_membership.workspace_id
      AND workspace.organization_id = workspace_membership.organization_id
    WHERE workspace_membership.subject_id = $1::uuid
      AND workspace_membership.organization_id = $2::uuid
      AND workspace.status = 'active'
      AND workspace_membership.valid_from <= statement_timestamp()
      AND (
        workspace_membership.valid_until IS NULL
        OR workspace_membership.valid_until > statement_timestamp()
      )
  ) active_workspace
`;

@Injectable()
export class PostgresWorkspaceMembershipRepository implements WorkspaceMembershipPort {
  constructor(@Inject(PostgresRuntime) private readonly database: PostgresRuntime) {}

  async loadActiveContext(
    principal: Principal,
    transaction?: TenantTransaction,
  ): Promise<ActiveMembershipContext> {
    if (transaction) return this.query(transaction, principal);
    return this.database.withPrincipal(principal, (activeTransaction) =>
      this.query(activeTransaction, principal),
    );
  }

  private async query(
    transaction: TenantTransaction,
    principal: Principal,
  ): Promise<ActiveMembershipContext> {
    const result = await transaction.query<MembershipContextRow>(ACTIVE_CONTEXT_QUERY, [
      principal.subjectId,
      principal.organizationId,
    ]);
    const row = result.rows[0];
    if (!row) return { identityActive: false, workspaceIds: [] };
    const activeIds: WorkspaceId[] = [];
    for (const value of row.workspace_ids ?? []) {
      try {
        activeIds.push(workspaceId(value));
      } catch {
        throw new Error("Database returned an invalid workspace identifier");
      }
    }
    return Object.freeze({
      identityActive: row.identity_active,
      workspaceIds: Object.freeze(activeIds),
    });
  }
}

@Injectable()
export class WorkspaceAccessService {
  constructor(
    @Inject(WORKSPACE_MEMBERSHIPS) private readonly memberships: WorkspaceMembershipPort,
  ) {}

  async assertMembership(
    principal: Principal,
    requestedId: string,
    transaction?: TenantTransaction,
  ): Promise<WorkspaceId> {
    let candidate: WorkspaceId;
    try {
      candidate = workspaceId(requestedId);
    } catch {
      throw accessDenied();
    }

    // Claims constrain the token, but never establish membership by themselves.
    if (!principal.workspaceIds.includes(candidate)) throw accessDenied();
    const context = await this.memberships.loadActiveContext(principal, transaction);
    if (!context.identityActive || !context.workspaceIds.includes(candidate)) throw accessDenied();
    return candidate;
  }

  async reconcilePrincipal(
    principal: Principal,
    transaction?: TenantTransaction,
  ): Promise<Principal> {
    const context = await this.memberships.loadActiveContext(principal, transaction);
    if (!context.identityActive) throw accessDenied();
    const activeClaimedIds = context.workspaceIds.filter((id) =>
      principal.workspaceIds.includes(id),
    );
    return Object.freeze({ ...principal, workspaceIds: Object.freeze(activeClaimedIds) });
  }
}

function accessDenied(): ForbiddenException {
  return new ForbiddenException({ code: "WORKSPACE_ACCESS_DENIED" });
}
