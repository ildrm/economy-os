import { organizationId, type Principal, subjectId, workspaceId } from "@economyos/contracts";
import { describe, expect, it, vi } from "vitest";
import type { PostgresRuntime, QueryResult, TenantTransaction } from "./database.js";
import {
  GovernedEvidenceService,
  parseObservationQuery,
  parseProvenanceQuery,
  parseResourceId,
} from "./evidence.js";
import type { GovernedAuthorizationService } from "./governed-authorization.js";
import type { WorkspaceAccessService } from "./workspaces.js";

const organization = "018f47ac-19fc-7c92-ae91-0242ac120002";
const workspace = "018f47ac-19fc-7c92-ae91-0242ac120004";
const series = "018f47ac-19fc-7c92-ae91-0242ac120007";
const observation = "018f47ac-19fc-7c92-ae91-0242ac120008";
const principal: Principal = {
  subjectId: subjectId("018f47ac-19fc-7c92-ae91-0242ac120006"),
  organizationId: organizationId(organization),
  workspaceIds: [workspaceId(workspace)],
  scopes: [],
  authenticationMethod: "oidc",
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-01T01:00:00.000Z",
};

describe("evidence query validation", () => {
  it("parses a bounded true-vintage request", () => {
    expect(
      parseObservationQuery({
        knownAt: "2026-01-01T00:00:00.000Z",
        policy: "true_vintage",
        limit: "25",
      }),
    ).toEqual({
      knownAt: "2026-01-01T00:00:00.000Z",
      policy: "true_vintage",
      limit: 25,
    });
  });

  const invalidQueries: ReadonlyArray<readonly [Readonly<Record<string, unknown>>, string]> = [
    [{ knownAt: "bad", policy: "true_vintage" }, "invalid instant"],
    [
      { knownAt: "2026-01-01T00:00:00Z", policy: "reconstructed" },
      "reconstruction without system time",
    ],
    [
      {
        knownAt: "2026-01-01T00:00:00Z",
        policy: "latest_revised",
        systemAt: "2026-01-01T00:00:00Z",
      },
      "latest-revised historical claim",
    ],
    [
      {
        knownAt: "2026-01-01T00:00:00Z",
        policy: "true_vintage",
        limit: "1001",
      },
      "oversized page",
    ],
    [
      {
        knownAt: "2026-01-01T00:00:00Z",
        policy: "true_vintage",
        unexpected: "field",
      },
      "unknown field",
    ],
    [
      {
        workspaceId: workspace,
        knownAt: "2026-01-01T00:00:00Z",
        policy: "true_vintage",
      },
      "misleading workspace scope",
    ],
  ];

  it.each(invalidQueries)("rejects %s (%s)", (query, _description) => {
    expect(() => parseObservationQuery(query)).toThrow("Bad Request");
  });

  it("strictly validates provenance and resource identifiers", () => {
    expect(parseProvenanceQuery({})).toEqual({});
    expect(() => parseProvenanceQuery({ workspaceId: workspace })).toThrow("Bad Request");
    expect(() => parseResourceId("not-a-uuid", "seriesId")).toThrow("Bad Request");
  });
});

describe("GovernedEvidenceService", () => {
  it("reconciles active organization membership and calls only the governed PIT function", async () => {
    const calls: Array<{ readonly text: string; readonly values?: readonly unknown[] }> = [];
    const transaction: TenantTransaction = {
      async query<Row extends Record<string, unknown>>(
        text: string,
        values?: readonly unknown[],
      ): Promise<QueryResult<Row>> {
        calls.push({ text, ...(values === undefined ? {} : { values }) });
        return {
          rows: [
            {
              observation_id: observation,
              series_id: series,
              release_id: "018f47ac-19fc-7c92-ae91-0242ac120009",
              raw_payload_id: "018f47ac-19fc-7c92-ae91-0242ac12000a",
              transformation_run_id: "018f47ac-19fc-7c92-ae91-0242ac12000b",
              period_start: "2025-01-01T00:00:00.000000Z",
              period_end: "2025-12-31T00:00:00.000000Z",
              value_numeric: "12345678901234567890.123456789",
              missing_reason: null,
              observation_status: "observed",
              parser_version: "wdi-v1",
              release_time: "2026-01-01T00:00:00.000000Z",
              availability_time: "2026-01-01T00:01:00.000000Z",
              retrieved_at: "2026-01-01T00:02:00.000000Z",
              pit_quality: "true_vintage",
              recorded_at: "2026-01-01T00:03:00.000000Z",
            },
          ] as unknown as readonly Row[],
          rowCount: 1,
        };
      },
    };
    const database = {
      withPrincipal: vi.fn(async (_principal, operation) => operation(transaction)),
    };
    const access = { reconcilePrincipal: vi.fn(async () => principal) };
    const authorization = { assertEvidenceSeriesAccess: vi.fn(async () => undefined) };
    const service = new GovernedEvidenceService(
      database as unknown as PostgresRuntime,
      access as unknown as WorkspaceAccessService,
      authorization as unknown as GovernedAuthorizationService,
    );
    const query = parseObservationQuery({
      knownAt: "2026-01-01T00:00:00Z",
      policy: "true_vintage",
      limit: "1",
    });

    const page = await service.observations(principal, series, query);

    expect(access.reconcilePrincipal).toHaveBeenCalledWith(principal, transaction);
    expect(authorization.assertEvidenceSeriesAccess).toHaveBeenCalledWith(
      principal,
      series,
      transaction,
    );
    expect(calls[0]?.text).toContain("evidence.governed_observations_as_known");
    expect(calls[0]?.values).toEqual([
      series,
      "2026-01-01T00:00:00Z",
      "true_vintage",
      null,
      "api",
      1,
    ]);
    expect(page.observations[0]?.value).toBe("12345678901234567890.123456789");
  });

  it("returns governed provenance and maps an invisible result to a non-enumerating 404", async () => {
    let provenance: unknown = { observationId: observation, source: { name: "World Bank" } };
    const transaction: TenantTransaction = {
      async query<Row extends Record<string, unknown>>(): Promise<QueryResult<Row>> {
        return { rows: [{ provenance }] as unknown as readonly Row[], rowCount: 1 };
      },
    };
    const database = {
      withPrincipal: async (_principal: Principal, operation: (tx: TenantTransaction) => unknown) =>
        operation(transaction),
    };
    const access = { reconcilePrincipal: async () => principal };
    const authorization = { assertEvidenceObservationAccess: async () => undefined };
    const service = new GovernedEvidenceService(
      database as unknown as PostgresRuntime,
      access as unknown as WorkspaceAccessService,
      authorization as unknown as GovernedAuthorizationService,
    );
    const query = parseProvenanceQuery({});

    await expect(service.provenance(principal, observation, query)).resolves.toMatchObject({
      observationId: observation,
    });
    provenance = null;
    await expect(service.provenance(principal, observation, query)).rejects.toThrow("Not Found");
  });

  it("does not call a governed value function when resource authorization is denied", async () => {
    const transaction = { query: vi.fn() } as unknown as TenantTransaction;
    const database = {
      withPrincipal: async (_principal: Principal, operation: (tx: TenantTransaction) => unknown) =>
        operation(transaction),
    };
    const access = { reconcilePrincipal: vi.fn(async () => principal) };
    const authorization = {
      assertEvidenceSeriesAccess: vi.fn(async () => {
        throw new Error("denied");
      }),
    };
    const service = new GovernedEvidenceService(
      database as unknown as PostgresRuntime,
      access as unknown as WorkspaceAccessService,
      authorization as unknown as GovernedAuthorizationService,
    );

    await expect(
      service.observations(
        principal,
        series,
        parseObservationQuery({
          knownAt: "2026-01-01T00:00:00Z",
          policy: "true_vintage",
          limit: "1",
        }),
      ),
    ).rejects.toThrow("denied");
    expect(transaction.query).not.toHaveBeenCalled();
  });
});
