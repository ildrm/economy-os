import { organizationId, type Principal, subjectId, workspaceId } from "@economyos/contracts";
import { describe, expect, it, vi } from "vitest";
import type { QueryResult, TenantTransaction } from "./database.js";
import { GovernedAuthorizationService } from "./governed-authorization.js";

const organization = "088f47ac-19fc-7c92-ae91-0242ac120001";
const workspace = "088f47ac-19fc-7c92-ae91-0242ac120002";
const series = "088f47ac-19fc-7c92-ae91-0242ac120003";
const observation = "088f47ac-19fc-7c92-ae91-0242ac120004";
const evaluatedAt = "2026-01-01T00:30:00.000000Z";
const principal: Principal = {
  subjectId: subjectId("088f47ac-19fc-7c92-ae91-0242ac120005"),
  organizationId: organizationId(organization),
  workspaceIds: [workspaceId(workspace)],
  scopes: [],
  authenticationMethod: "oidc",
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-01T01:00:00.000Z",
};

describe("GovernedAuthorizationService", () => {
  it("allows an evidence read only with an active grant, classification ceiling, and capability", async () => {
    const transaction = authorizationTransaction({ classification: "confidential" });
    const service = new GovernedAuthorizationService();

    await expect(
      service.assertEvidenceSeriesAccess(principal, series, transaction),
    ).resolves.toBeUndefined();

    const resourceCall = transaction.query.mock.calls.find(([text]) =>
      String(text).includes("authorization_series_classification"),
    );
    const grantCall = transaction.query.mock.calls.find(([text]) =>
      String(text).includes("FROM app.role_grants"),
    );
    expect(resourceCall?.[1]).toEqual([series]);
    expect(grantCall?.[1]).toEqual([organization, principal.subjectId, evaluatedAt]);
  });

  it.each([
    {
      description: "the role grant is absent",
      options: { grants: [] },
    },
    {
      description: "the source classification exceeds the grant",
      options: { classification: "restricted", maximumClassification: "confidential" },
    },
    {
      description: "the matching role grant has expired",
      options: { validUntil: "2026-01-01T00:15:00.000000Z" },
    },
    {
      description: "the named entitlement is absent",
      options: { capabilities: {} },
    },
    {
      description: "the entitlement contract is no longer active",
      options: { entitlementUntil: "2026-01-01T00:15:00.000000Z" },
    },
  ] as const)("fails closed when $description", async ({ options }) => {
    const service = new GovernedAuthorizationService();
    const transaction = authorizationTransaction(options);

    await expect(
      service.assertEvidenceObservationAccess(principal, observation, transaction),
    ).rejects.toThrow("Forbidden");
  });

  it("uses workspace-scoped model rights and the maximum governed state classification", async () => {
    const transaction = authorizationTransaction({
      classification: "restricted",
      action: "model.read",
      resourceType: "model",
      grantWorkspaceId: workspace,
      maximumClassification: "restricted",
      capabilities: { "model.read": true },
    });
    const service = new GovernedAuthorizationService();

    await expect(
      service.assertEconomicStateAccess(principal, workspace, transaction),
    ).resolves.toBeUndefined();
    const contextCall = transaction.query.mock.calls.find(([text]) =>
      String(text).includes("authorization_economic_state_classification"),
    );
    expect(contextCall?.[1]).toEqual([workspace]);
  });

  it("separates relationship reads and writes at the active workspace classification", async () => {
    const transaction = authorizationTransaction({
      classification: "restricted",
      action: "relationship.write",
      resourceType: "relationship",
      grantWorkspaceId: workspace,
      maximumClassification: "restricted",
      capabilities: { "relationship.write": true },
    });
    const service = new GovernedAuthorizationService();

    await expect(
      service.assertRelationshipWorkspaceAccess(principal, workspace, "write", transaction),
    ).resolves.toBeUndefined();
    const contextCall = transaction.query.mock.calls.find(([text]) =>
      String(text).includes("FROM app.workspaces workspace"),
    );
    expect(contextCall?.[1]).toEqual([workspace, organization]);

    await expect(
      service.assertRelationshipWorkspaceAccess(principal, workspace, "read", transaction),
    ).rejects.toThrow("Forbidden");
  });

  it("does not enumerate a missing governed resource or accept non-boolean capabilities", async () => {
    const service = new GovernedAuthorizationService();
    const missing = authorizationTransaction({ resourceMissing: true });
    await expect(service.assertEvidenceSeriesAccess(principal, series, missing)).rejects.toThrow(
      "Forbidden",
    );
    expect(missing.query).toHaveBeenCalledTimes(1);

    const malformed = authorizationTransaction({ capabilities: { "observation.read": "yes" } });
    await expect(service.assertEvidenceSeriesAccess(principal, series, malformed)).rejects.toThrow(
      "Forbidden",
    );
  });
});

interface AuthorizationOptions {
  readonly classification?: string;
  readonly grants?: readonly Record<string, unknown>[];
  readonly action?: string;
  readonly resourceType?: string;
  readonly grantWorkspaceId?: string | null;
  readonly maximumClassification?: string | null;
  readonly validUntil?: string | null;
  readonly capabilities?: Readonly<Record<string, unknown>>;
  readonly entitlementUntil?: string | null;
  readonly resourceMissing?: boolean;
}

function authorizationTransaction(
  options: AuthorizationOptions = {},
): TenantTransaction & { readonly query: ReturnType<typeof vi.fn> } {
  const query = vi.fn(async (text: string): Promise<QueryResult<Record<string, unknown>>> => {
    if (
      text.includes("authorization_series_classification") ||
      text.includes("authorization_observation_classification") ||
      text.includes("authorization_economic_state_classification") ||
      text.includes("FROM app.workspaces workspace")
    ) {
      return rows(
        options.resourceMissing
          ? []
          : [
              {
                classification: options.classification ?? "confidential",
                evaluated_at: evaluatedAt,
              },
            ],
      );
    }
    if (text.includes("FROM app.role_grants")) {
      return rows(
        options.grants ?? [
          {
            workspace_id: options.grantWorkspaceId ?? null,
            action: options.action ?? "observation.read",
            resource_type: options.resourceType ?? "observation",
            maximum_classification: options.maximumClassification ?? "confidential",
            valid_until: options.validUntil ?? null,
          },
        ],
      );
    }
    if (text.includes("FROM app.entitlement_snapshots")) {
      return rows([
        {
          contract_version: "contract-1",
          capabilities: options.capabilities ?? { "observation.read": true },
          effective_from: "2025-01-01T00:00:00.000000Z",
          effective_until: options.entitlementUntil ?? null,
        },
      ]);
    }
    throw new Error(`Unexpected authorization query: ${text}`);
  });
  return { query } as unknown as TenantTransaction & { readonly query: ReturnType<typeof vi.fn> };
}

function rows<Row extends Record<string, unknown>>(values: readonly Row[]): QueryResult<Row> {
  return { rows: values, rowCount: values.length };
}
