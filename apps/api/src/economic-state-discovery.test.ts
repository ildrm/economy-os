import { organizationId, type Principal, subjectId, workspaceId } from "@economyos/contracts";
import { describe, expect, it, vi } from "vitest";
import type { PostgresRuntime, QueryResult, TenantTransaction } from "./database.js";
import {
  EconomicStateDiscoveryService,
  parseStateVectorComparisonQuery,
  parseStateVectorDiscoveryQuery,
} from "./economic-state-discovery.js";
import type { GovernedAuthorizationService } from "./governed-authorization.js";
import type { WorkspaceAccessService } from "./workspaces.js";

const organization = "078f47ac-19fc-7c92-ae91-0242ac120001";
const workspace = "078f47ac-19fc-7c92-ae91-0242ac120002";
const snapshot = "078f47ac-19fc-7c92-ae91-0242ac120003";
const geography = "078f47ac-19fc-7c92-ae91-0242ac120004";
const vectorA = "078f47ac-19fc-7c92-ae91-0242ac120005";
const vectorB = "078f47ac-19fc-7c92-ae91-0242ac120006";
const vectorC = "078f47ac-19fc-7c92-ae91-0242ac120007";
const artifact = "078f47ac-19fc-7c92-ae91-0242ac120008";
const otherArtifact = "078f47ac-19fc-7c92-ae91-0242ac120009";
const model = "078f47ac-19fc-7c92-ae91-0242ac12000b";
const knownAt = "2026-03-01T00:00:00.123456Z";
const principal: Principal = Object.freeze({
  subjectId: subjectId("078f47ac-19fc-7c92-ae91-0242ac12000a"),
  organizationId: organizationId(organization),
  workspaceIds: Object.freeze([workspaceId(workspace)]),
  scopes: Object.freeze([]),
  authenticationMethod: "oidc",
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-01T01:00:00.000Z",
});

const summaryA = summaryRow(vectorA, geography, "country", "IRN");
const summaryB = summaryRow(vectorB, vectorC, "region", "MENA");

describe("economic-state vector discovery validation", () => {
  it("requires and canonicalizes the complete PIT context", () => {
    expect(
      parseStateVectorDiscoveryQuery({
        workspaceId: workspace,
        snapshotId: snapshot,
        knownAt: "2026-03-01T00:00:00.123Z",
        policy: "reconstructed",
        systemAt: "2026-03-01T01:00:00Z",
        geographyId: geography,
        cursor: vectorA,
        limit: "100",
      }),
    ).toEqual({
      workspaceId: workspace,
      snapshotId: snapshot,
      knownAt: "2026-03-01T00:00:00.123000Z",
      policy: "reconstructed",
      systemAt: "2026-03-01T01:00:00.000000Z",
      geographyId: geography,
      cursor: vectorA,
      limit: 100,
    });
    expect(
      parseStateVectorDiscoveryQuery({
        workspaceId: workspace,
        snapshotId: snapshot,
        knownAt,
        policy: "latest_revised",
        systemAt: "null",
      }),
    ).toMatchObject({ systemAt: null, limit: 50 });
  });

  it("preserves comparison order while canonicalizing UUID casing", () => {
    const query = parseStateVectorComparisonQuery({
      workspaceId: workspace,
      vectorIds: `${vectorB.toUpperCase()},${vectorA}`,
    });
    expect(query.vectorIds).toEqual([vectorB, vectorA]);
  });

  it.each([
    ["unknown discovery field", () => discoveryQuery({ extra: "x" })],
    ["invalid calendar date", () => discoveryQuery({ knownAt: "2026-02-30T00:00:00Z" })],
    ["implicit system cutoff", () => discoveryQuery({ systemAt: undefined })],
    [
      "reconstructed without system cutoff",
      () => discoveryQuery({ policy: "reconstructed", systemAt: "null" }),
    ],
    [
      "latest revised with system cutoff",
      () => discoveryQuery({ policy: "latest_revised", systemAt: knownAt }),
    ],
    ["one comparison vector", () => comparisonQuery(vectorA)],
    ["duplicate comparison vectors", () => comparisonQuery(`${vectorA},${vectorA}`)],
    ["comparison whitespace", () => comparisonQuery(`${vectorA}, ${vectorB}`)],
    ["comparison array pollution", () => comparisonQuery([vectorA, vectorB])],
    ["unknown comparison field", () => comparisonQuery(`${vectorA},${vectorB}`, { extra: "x" })],
    [
      "more than ten vectors",
      () => comparisonQuery(Array.from({ length: 11 }, (_, index) => uuidAt(index + 20)).join(",")),
    ],
  ])("rejects %s", (_description, parse) => {
    expect(parse).toThrow("Bad Request");
  });
});

describe("EconomicStateDiscoveryService", () => {
  it("authorizes once and discovers a bounded stable page with exact decimals", async () => {
    const calls: Array<{ readonly text: string; readonly values?: readonly unknown[] }> = [];
    const transaction = transactionWith(async (text, values) => {
      calls.push({ text, ...(values ? { values } : {}) });
      return rows([summaryA, { ...summaryA, vector_id: vectorB }]);
    });
    const { service, access, authorization } = serviceWith(transaction);
    const query = parseStateVectorDiscoveryQuery({
      workspaceId: workspace,
      snapshotId: snapshot,
      knownAt,
      policy: "true_vintage",
      systemAt: "null",
      geographyId: geography,
      limit: "1",
    });

    const page = await service.vectors(principal, query);

    expect(access.assertMembership).toHaveBeenCalledWith(principal, workspace, transaction);
    expect(authorization.assertEconomicStateAccess).toHaveBeenCalledWith(
      principal,
      workspace,
      transaction,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.values).toEqual([
      organization,
      workspace,
      snapshot,
      knownAt,
      "true_vintage",
      null,
      geography,
      null,
      2,
    ]);
    expect(calls[0]?.text).toContain("ORDER BY vector.id");
    expect(calls[0]?.text).toContain("LIMIT $9::integer");
    expectWholeVectorServability(calls[0]?.text ?? "");
    expect(page).toMatchObject({
      schemaVersion: 1,
      methodologyScope: "research_baseline",
      count: 1,
      nextCursor: vectorA,
      context: {
        snapshot: { id: snapshot },
        pointInTime: { knownAt, policy: "true_vintage", systemAt: null },
        geographyId: geography,
      },
      vectors: [
        {
          id: vectorA,
          geography: { kind: "country" },
          diagnostics: {
            dimensionCoverage: "0.200001",
            evidenceQuality: "0.987654",
          },
          links: {
            self: `/api/v1/economic-state/vectors/${vectorA}?workspaceId=${workspace}`,
          },
        },
      ],
    });
  });

  it("compares geography-neutral vectors in requested order without coercion or aggregation", async () => {
    const databaseRows = [...comparisonRows(summaryB, 1), ...comparisonRows(summaryA, 2)];
    const calls: Array<{ readonly text: string; readonly values?: readonly unknown[] }> = [];
    const transaction = transactionWith(async (text, values) => {
      calls.push({ text, ...(values ? { values } : {}) });
      return rows(databaseRows);
    });
    const { service } = serviceWith(transaction);
    const query = parseStateVectorComparisonQuery({
      workspaceId: workspace,
      vectorIds: `${vectorB},${vectorA}`,
    });

    const comparison = await service.compare(principal, query);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.values).toEqual([organization, workspace, [vectorB, vectorA]]);
    expect(calls[0]?.text).toContain("unnest($3::uuid[]) WITH ORDINALITY");
    expect(calls[0]?.text).toContain("ORDER BY vector.request_ordinal, slot.ordinal");
    expect(calls[0]?.text).toContain("LIMIT 51");
    expectWholeVectorServability(calls[0]?.text ?? "");
    expect(comparison).toMatchObject({
      schemaVersion: 1,
      methodologyScope: "research_baseline",
      requestedVectorIds: [vectorB, vectorA],
      vectorCount: 2,
      compatibility: {
        compatible: true,
        snapshot: { compatible: true, reason: "same_snapshot", sharedId: snapshot },
        pointInTime: {
          compatible: true,
          reason: "same_point_in_time",
          sharedKnownAt: knownAt,
        },
      },
    });
    expect(comparison.compatibility.dimensions[0]).toMatchObject({
      dimension: "macroeconomic",
      compatible: true,
      reason: "same_model_and_artifact",
      sharedModelArtifactId: artifact,
    });
    expect(comparison.compatibility.dimensions[1]).toMatchObject({
      dimension: "human_economic",
      compatible: true,
      reason: "all_missing",
    });
    expect(comparison.vectors[0]).toMatchObject({
      id: vectorB,
      geography: { kind: "region", code: "MENA" },
    });
    expect(comparison.vectors[0]?.dimensions[0]).toMatchObject({
      dimension: "macroeconomic",
      score: "99.123456789012345678",
      completeness: "0.600001",
      renormalized: true,
    });
    expect(comparison.vectors[1]).toMatchObject({
      id: vectorA,
      geography: { kind: "country", code: "IRN" },
    });
    expect(comparison).not.toHaveProperty("rank");
    expect(comparison).not.toHaveProperty("overallScore");
    expect(comparison.vectors[0]).not.toHaveProperty("normalizedScore");
  });

  it("marks snapshot, PIT, artifact, and coverage mismatches explicitly", async () => {
    const secondRows = comparisonRows(
      {
        ...summaryB,
        snapshot_id: vectorC,
        snapshot_manifest_sha256: "3".repeat(64),
        known_at: "2026-04-01T00:00:00.000000Z",
      },
      2,
    ).map((row, index) =>
      index === 0
        ? {
            ...row,
            reported_dimension_count: 2,
            scored_dimension_count: 2,
            missing_dimension_count: 3,
            dimension_coverage: "0.4",
            scored_dimension_coverage: "0.4",
            model_artifact_id: otherArtifact,
            model_artifact_sha256: "4".repeat(64),
            run_model_artifact_id: otherArtifact,
            run_model_artifact_sha256: "4".repeat(64),
          }
        : index === 1
          ? reportedSlot(
              {
                ...row,
                reported_dimension_count: 2,
                scored_dimension_count: 2,
                missing_dimension_count: 3,
                dimension_coverage: "0.4",
                scored_dimension_coverage: "0.4",
              },
              2,
              "human_economic",
            )
          : {
              ...row,
              reported_dimension_count: 2,
              scored_dimension_count: 2,
              missing_dimension_count: 3,
              dimension_coverage: "0.4",
              scored_dimension_coverage: "0.4",
            },
    );
    const transaction = transactionWith(async () =>
      rows([...comparisonRows(summaryA, 1), ...secondRows]),
    );
    const { service } = serviceWith(transaction);

    const result = await service.compare(
      principal,
      parseStateVectorComparisonQuery({
        workspaceId: workspace,
        vectorIds: `${vectorA},${vectorB}`,
      }),
    );

    expect(result.compatibility).toMatchObject({
      compatible: false,
      snapshot: {
        compatible: false,
        reason: "snapshot_mismatch",
        sharedId: null,
        sharedManifestSha256: null,
      },
      pointInTime: {
        compatible: false,
        reason: "point_in_time_mismatch",
        sharedKnownAt: null,
      },
    });
    expect(result.compatibility.dimensions[0]).toMatchObject({
      dimension: "macroeconomic",
      compatible: false,
      reason: "model_artifact_mismatch",
    });
    expect(result.compatibility.dimensions[1]).toMatchObject({
      dimension: "human_economic",
      compatible: false,
      reason: "coverage_mismatch",
    });
    expect(result.vectors[1]?.dimensions[1]).toMatchObject({
      status: "partial",
      score: "99.123456789012345678",
      missingReason: null,
    });
  });

  it("returns one generic miss if any requested vector is absent or unservable", async () => {
    const transaction = transactionWith(async () => rows(comparisonRows(summaryA, 1)));
    const { service } = serviceWith(transaction);

    await expect(
      service.compare(
        principal,
        parseStateVectorComparisonQuery({
          workspaceId: workspace,
          vectorIds: `${vectorA},${vectorB}`,
        }),
      ),
    ).rejects.toThrow("Not Found");
  });

  it("fails closed for a malformed five-slot comparison package", async () => {
    const forged = comparisonRows(summaryB, 2).map((row, index) =>
      index === 2 ? { ...row, dimension: "market" } : row,
    );
    const transaction = transactionWith(async () =>
      rows([...comparisonRows(summaryA, 1), ...forged]),
    );
    const { service } = serviceWith(transaction);

    await expect(
      service.compare(
        principal,
        parseStateVectorComparisonQuery({
          workspaceId: workspace,
          vectorIds: `${vectorA},${vectorB}`,
        }),
      ),
    ).rejects.toThrow("inconsistent economic-state comparison");
  });

  it("does not read vectors when governed authorization is denied", async () => {
    const transaction = transactionWith(async () => rows([]));
    const database = {
      withPrincipal: vi.fn(async (_principal, operation) => operation(transaction)),
    };
    const access = { assertMembership: vi.fn(async () => workspaceId(workspace)) };
    const authorization = {
      assertEconomicStateAccess: vi.fn(async () => {
        throw new Error("denied");
      }),
    };
    const service = new EconomicStateDiscoveryService(
      database as unknown as PostgresRuntime,
      access as unknown as WorkspaceAccessService,
      authorization as unknown as GovernedAuthorizationService,
    );

    await expect(
      service.vectors(
        principal,
        parseStateVectorDiscoveryQuery({
          workspaceId: workspace,
          snapshotId: snapshot,
          knownAt,
          policy: "true_vintage",
          systemAt: "null",
        }),
      ),
    ).rejects.toThrow("denied");
    expect(transaction.query).not.toHaveBeenCalled();
  });
});

function summaryRow(id: string, geographyId: string, kind: string, code: string) {
  return {
    vector_id: id,
    geography_id: geographyId,
    geography_kind: kind,
    geography_code_scheme: kind === "country" ? "ISO-3166-1-alpha-3" : "ECONOMYOS-REGION",
    geography_code: code,
    geography_name: code === "IRN" ? "Iran" : "Middle East and North Africa",
    snapshot_id: snapshot,
    snapshot_manifest_sha256: "a".repeat(64),
    known_at: knownAt,
    policy: "true_vintage" as const,
    system_at: null,
    context_sha256: "b".repeat(64),
    dimension_count: 5,
    reported_dimension_count: 1,
    scored_dimension_count: 1,
    insufficient_dimension_count: 0,
    missing_dimension_count: 4,
    dimension_coverage: "0.200001",
    scored_dimension_coverage: "0.200001",
    evidence_coverage: "0.123456",
    confidence_coverage: "0.111111",
    evidence_quality: "0.987654",
    reported_component_count: 2,
    observed_component_count: 1,
    distinct_source_count: 1,
    distinct_source_coverage: "0.5",
    state_manifest_sha256: "c".repeat(64),
    assembled_at: "2026-03-01T01:00:00.000000Z",
  };
}

function comparisonRows(summary: ReturnType<typeof summaryRow>, requestOrdinal: number) {
  return [
    reportedSlot(
      {
        ...summary,
        request_ordinal: requestOrdinal,
        slot_ordinal: 1,
        dimension: "macroeconomic",
        slot_missing_reason: null,
      },
      1,
      "macroeconomic",
    ),
    missingSlot(summary, requestOrdinal, 2, "human_economic", "not_modeled"),
    missingSlot(summary, requestOrdinal, 3, "financial_system", "model_unavailable"),
    missingSlot(summary, requestOrdinal, 4, "market", "source_missing"),
    missingSlot(summary, requestOrdinal, 5, "regime", "pipeline_failure"),
  ];
}

function reportedSlot<Row extends Record<string, unknown>>(
  row: Row,
  ordinal: number,
  dimension: string,
) {
  return {
    ...row,
    slot_ordinal: ordinal,
    dimension,
    slot_missing_reason: null,
    model_id: model,
    model_definition_sha256: "d".repeat(64),
    model_artifact_id: artifact,
    model_artifact_sha256: "e".repeat(64),
    run_model_definition_sha256: "d".repeat(64),
    run_model_artifact_id: artifact,
    run_model_artifact_sha256: "e".repeat(64),
    run_status: "partial",
    run_score: "99.123456789012345678",
    run_missing_reason: null,
    run_completeness: "0.600001",
    run_source_coverage: "0.500001",
    run_confidence: "0.900001",
    run_renormalized: true,
  };
}

function missingSlot(
  summary: ReturnType<typeof summaryRow>,
  requestOrdinal: number,
  ordinal: number,
  dimension: string,
  reason: string,
) {
  return {
    ...summary,
    request_ordinal: requestOrdinal,
    slot_ordinal: ordinal,
    dimension,
    slot_missing_reason: reason,
    model_id: null,
    model_definition_sha256: null,
    model_artifact_id: null,
    model_artifact_sha256: null,
    run_model_definition_sha256: null,
    run_model_artifact_id: null,
    run_model_artifact_sha256: null,
    run_status: null,
    run_score: null,
    run_missing_reason: null,
    run_completeness: null,
    run_source_coverage: null,
    run_confidence: null,
    run_renormalized: null,
  };
}

function discoveryQuery(overrides: Readonly<Record<string, unknown>>): unknown {
  return parseStateVectorDiscoveryQuery({
    workspaceId: workspace,
    snapshotId: snapshot,
    knownAt,
    policy: "true_vintage",
    systemAt: "null",
    ...overrides,
  });
}

function comparisonQuery(
  vectorIds: unknown,
  overrides: Readonly<Record<string, unknown>> = {},
): unknown {
  return parseStateVectorComparisonQuery({ workspaceId: workspace, vectorIds, ...overrides });
}

function uuidAt(value: number): string {
  return `078f47ac-19fc-7c92-ae91-${value.toString(16).padStart(12, "0")}`;
}

function serviceWith(transaction: TenantTransaction) {
  const database = {
    withPrincipal: vi.fn(async (_principal, operation) => operation(transaction)),
  };
  const access = { assertMembership: vi.fn(async () => workspaceId(workspace)) };
  const authorization = { assertEconomicStateAccess: vi.fn(async () => undefined) };
  return {
    service: new EconomicStateDiscoveryService(
      database as unknown as PostgresRuntime,
      access as unknown as WorkspaceAccessService,
      authorization as unknown as GovernedAuthorizationService,
    ),
    access,
    authorization,
  };
}

function transactionWith(
  responder: (
    text: string,
    values?: readonly unknown[],
  ) => Promise<QueryResult<Record<string, unknown>>>,
): TenantTransaction & { readonly query: ReturnType<typeof vi.fn> } {
  const query = vi.fn(async (text: string, values?: readonly unknown[]) => responder(text, values));
  return { query } as unknown as TenantTransaction & { readonly query: ReturnType<typeof vi.fn> };
}

function rows<Row extends Record<string, unknown>>(values: readonly Row[]): QueryResult<Row> {
  return { rows: values, rowCount: values.length };
}

function expectWholeVectorServability(sql: string): void {
  expect(sql).toContain(
    "evidence.economic_state_run_is_currently_servable(reported.state_run_id, 'api')",
  );
  expect(sql).toContain("IS NOT TRUE");
}
