import {
  CLASSIFICATIONS,
  type Classification,
  type Principal,
  workspaceId,
} from "@economyos/contracts";
import { authorize, type EntitlementSnapshot, type Grant } from "@economyos/security";
import { ForbiddenException, Injectable } from "@nestjs/common";
import type { TenantTransaction } from "./database.js";

const EVIDENCE_READ_ACTION = "observation.read";
const EVIDENCE_RESOURCE_TYPE = "observation";
const ECONOMIC_STATE_READ_ACTION = "model.read";
const ECONOMIC_STATE_RESOURCE_TYPE = "model";
const RELATIONSHIP_RESOURCE_TYPE = "relationship";

export type RelationshipAccess = "read" | "write";

interface ResourceAuthorizationRow extends Record<string, unknown> {
  readonly classification: string;
  readonly evaluated_at: string;
}

interface RoleGrantRow extends Record<string, unknown> {
  readonly workspace_id: string | null;
  readonly action: string;
  readonly resource_type: string;
  readonly maximum_classification: string | null;
  readonly valid_until: string | null;
}

interface EntitlementRow extends Record<string, unknown> {
  readonly contract_version: string;
  readonly capabilities: unknown;
  readonly effective_from: string;
  readonly effective_until: string | null;
}

@Injectable()
export class GovernedAuthorizationService {
  async assertEvidenceSeriesAccess(
    principal: Principal,
    seriesId: string,
    transaction: TenantTransaction,
  ): Promise<void> {
    const result = await transaction.query<ResourceAuthorizationRow>(EVIDENCE_SERIES_CONTEXT_SQL, [
      seriesId,
    ]);
    await this.assertAuthorized(
      principal,
      result.rows[0],
      EVIDENCE_READ_ACTION,
      EVIDENCE_RESOURCE_TYPE,
      undefined,
      transaction,
    );
  }

  async assertEvidenceObservationAccess(
    principal: Principal,
    observationId: string,
    transaction: TenantTransaction,
  ): Promise<void> {
    const result = await transaction.query<ResourceAuthorizationRow>(
      EVIDENCE_OBSERVATION_CONTEXT_SQL,
      [observationId],
    );
    await this.assertAuthorized(
      principal,
      result.rows[0],
      EVIDENCE_READ_ACTION,
      EVIDENCE_RESOURCE_TYPE,
      undefined,
      transaction,
    );
  }

  async assertEconomicStateAccess(
    principal: Principal,
    requestedWorkspaceId: string,
    transaction: TenantTransaction,
  ): Promise<void> {
    const result = await transaction.query<ResourceAuthorizationRow>(ECONOMIC_STATE_CONTEXT_SQL, [
      requestedWorkspaceId,
    ]);
    await this.assertAuthorized(
      principal,
      result.rows[0],
      ECONOMIC_STATE_READ_ACTION,
      ECONOMIC_STATE_RESOURCE_TYPE,
      requestedWorkspaceId,
      transaction,
    );
  }

  async assertRelationshipWorkspaceAccess(
    principal: Principal,
    requestedWorkspaceId: string,
    access: RelationshipAccess,
    transaction: TenantTransaction,
  ): Promise<void> {
    const result = await transaction.query<ResourceAuthorizationRow>(RELATIONSHIP_CONTEXT_SQL, [
      requestedWorkspaceId,
      principal.organizationId,
    ]);
    const action = `relationship.${access}`;
    await this.assertAuthorized(
      principal,
      result.rows[0],
      action,
      RELATIONSHIP_RESOURCE_TYPE,
      requestedWorkspaceId,
      transaction,
    );
  }

  async assertResearchWorkspaceAccess(
    principal: Principal,
    requestedWorkspaceId: string,
    access: "read" | "execute",
    transaction: TenantTransaction,
  ): Promise<void> {
    const result = await transaction.query<ResourceAuthorizationRow>(ECONOMIC_STATE_CONTEXT_SQL, [
      requestedWorkspaceId,
    ]);
    await this.assertAuthorized(
      principal,
      result.rows[0],
      `model.${access}`,
      "model",
      requestedWorkspaceId,
      transaction,
    );
  }

  private async assertAuthorized(
    principal: Principal,
    context: ResourceAuthorizationRow | undefined,
    action: string,
    resourceType: string,
    requestedWorkspaceId: string | undefined,
    transaction: TenantTransaction,
  ): Promise<void> {
    if (!context) throw accessDenied();
    const classification = parseClassification(context.classification);
    if (!classification) throw accessDenied();

    const [grants, entitlement] = await Promise.all([
      this.loadGrants(principal, context.evaluated_at, transaction),
      this.loadEntitlement(principal, context.evaluated_at, transaction),
    ]);
    const decision = authorize(
      {
        principal,
        action,
        resourceType,
        resource: {
          organizationId: principal.organizationId,
          ...(requestedWorkspaceId === undefined
            ? {}
            : { workspaceId: workspaceId(requestedWorkspaceId) }),
          classification,
        },
        requiredCapability: action,
        at: context.evaluated_at,
      },
      grants,
      entitlement,
    );
    if (!decision.allowed) throw accessDenied();
  }

  private async loadGrants(
    principal: Principal,
    evaluatedAt: string,
    transaction: TenantTransaction,
  ): Promise<readonly Grant[]> {
    const result = await transaction.query<RoleGrantRow>(ROLE_GRANTS_SQL, [
      principal.organizationId,
      principal.subjectId,
      evaluatedAt,
    ]);
    return Object.freeze(
      result.rows.map((row) => {
        const maximumClassification =
          row.maximum_classification === null
            ? undefined
            : parseClassification(row.maximum_classification);
        if (row.maximum_classification !== null && maximumClassification === undefined) {
          throw accessDenied();
        }
        return Object.freeze({
          subjectId: principal.subjectId,
          action: row.action,
          resourceType: row.resource_type,
          ...(row.workspace_id === null ? {} : { workspaceId: workspaceId(row.workspace_id) }),
          ...(maximumClassification === undefined ? {} : { maximumClassification }),
          ...(row.valid_until === null ? {} : { expiresAt: row.valid_until }),
        });
      }),
    );
  }

  private async loadEntitlement(
    principal: Principal,
    evaluatedAt: string,
    transaction: TenantTransaction,
  ): Promise<EntitlementSnapshot | undefined> {
    const result = await transaction.query<EntitlementRow>(ENTITLEMENT_SQL, [
      principal.organizationId,
      evaluatedAt,
    ]);
    const row = result.rows[0];
    if (!row || !isRecord(row.capabilities)) return undefined;
    const capabilities = new Set(
      Object.entries(row.capabilities)
        .filter(([, enabled]) => enabled === true)
        .map(([capability]) => capability),
    );
    return Object.freeze({
      capabilities,
      effectiveFrom: row.effective_from,
      ...(row.effective_until === null ? {} : { effectiveUntil: row.effective_until }),
      version: row.contract_version,
    });
  }
}

const RESOURCE_TIMESTAMP_PROJECTION = `
  to_char(
    statement_timestamp() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  ) AS evaluated_at
`;

const EVIDENCE_SERIES_CONTEXT_SQL = `
  SELECT
    evidence.authorization_series_classification($1::uuid) AS classification,
    ${RESOURCE_TIMESTAMP_PROJECTION}
`;

const EVIDENCE_OBSERVATION_CONTEXT_SQL = `
  SELECT
    evidence.authorization_observation_classification($1::uuid) AS classification,
    ${RESOURCE_TIMESTAMP_PROJECTION}
`;

const ECONOMIC_STATE_CONTEXT_SQL = `
  SELECT
    evidence.authorization_economic_state_classification($1::uuid) AS classification,
    ${RESOURCE_TIMESTAMP_PROJECTION}
`;

const RELATIONSHIP_CONTEXT_SQL = `
  SELECT
    workspace.classification,
    ${RESOURCE_TIMESTAMP_PROJECTION}
  FROM app.workspaces workspace
  WHERE workspace.id = $1::uuid
    AND workspace.organization_id = $2::uuid
    AND workspace.status = 'active'
  LIMIT 1
`;

const ROLE_GRANTS_SQL = `
  SELECT
    workspace_id::text,
    action,
    resource_type,
    maximum_classification,
    CASE WHEN valid_until IS NULL THEN NULL ELSE
      to_char(valid_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    END AS valid_until
  FROM app.role_grants
  WHERE organization_id = $1::uuid
    AND subject_id = $2::uuid
    AND valid_from <= $3::timestamptz
  ORDER BY created_at, id
`;

const ENTITLEMENT_SQL = `
  SELECT
    contract_version,
    capabilities,
    to_char(effective_from AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      AS effective_from,
    CASE WHEN effective_until IS NULL THEN NULL ELSE
      to_char(effective_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    END AS effective_until
  FROM app.entitlement_snapshots
  WHERE organization_id = $1::uuid
  ORDER BY (effective_from <= $2::timestamptz) DESC, effective_from DESC, recorded_at DESC, id DESC
  LIMIT 1
`;

function parseClassification(value: string): Classification | undefined {
  return CLASSIFICATIONS.includes(value as Classification) ? (value as Classification) : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function accessDenied(): ForbiddenException {
  return new ForbiddenException({ code: "RESOURCE_ACCESS_DENIED" });
}
