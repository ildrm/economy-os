import { organizationId, type Principal, subjectId, workspaceId } from "@economyos/contracts";
import { describe, expect, it, vi } from "vitest";
import type { PostgresRuntime, QueryResult, TenantTransaction } from "./database.js";
import type { GovernedAuthorizationService } from "./governed-authorization.js";
import {
  parseRecentReleaseQuery,
  parseReleaseScheduleQuery,
  ReleaseMonitoringService,
} from "./release-monitoring.js";
import type { WorkspaceAccessService } from "./workspaces.js";

const organization = "018f47ac-19fc-7c92-ae91-0242ac120002";
const workspace = "018f47ac-19fc-7c92-ae91-0242ac120004";
const series = "018f47ac-19fc-7c92-ae91-0242ac120007";
const principal: Principal = {
  subjectId: subjectId("018f47ac-19fc-7c92-ae91-0242ac120006"),
  organizationId: organizationId(organization),
  workspaceIds: [workspaceId(workspace)],
  scopes: [],
  authenticationMethod: "oidc",
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-01T01:00:00.000Z",
};

describe("release-monitoring query validation", () => {
  it("accepts an explicit bounded release window and schedule cutoff", () => {
    expect(
      parseRecentReleaseQuery({
        releasedAfter: "2026-01-01T00:00:00.000000001Z",
        releasedBefore: "2026-02-01T00:00:00Z",
        limit: "25",
      }),
    ).toEqual({
      releasedAfter: "2026-01-01T00:00:00.000000001Z",
      releasedBefore: "2026-02-01T00:00:00Z",
      limit: 25,
    });
    expect(parseReleaseScheduleQuery({ asOf: "2026-09-01T00:00:00Z" })).toEqual({
      asOf: "2026-09-01T00:00:00Z",
    });
  });

  const invalidQueries: ReadonlyArray<Readonly<Record<string, unknown>>> = [
    { releasedAfter: "bad", releasedBefore: "2026-02-01T00:00:00Z" },
    {
      releasedAfter: "2026-02-01T00:00:00Z",
      releasedBefore: "2026-01-01T00:00:00Z",
    },
    {
      releasedAfter: "2026-01-01T00:00:00Z",
      releasedBefore: "2027-01-03T00:00:00Z",
    },
    {
      releasedAfter: "2026-01-01T00:00:00.000000002Z",
      releasedBefore: "2026-01-01T00:00:00.000000001Z",
    },
    {
      releasedAfter: "2026-01-01T00:00:00Z",
      releasedBefore: "2026-02-01T00:00:00Z",
      limit: "101",
    },
    {
      releasedAfter: "2026-01-01T00:00:00Z",
      releasedBefore: "2026-02-01T00:00:00Z",
      workspaceId: workspace,
    },
  ];

  it.each(invalidQueries)("rejects invalid or misleading release query %s", (query) => {
    expect(() => parseRecentReleaseQuery(query)).toThrow("Bad Request");
  });

  it("rejects missing, malformed, and unknown schedule query fields", () => {
    expect(() => parseReleaseScheduleQuery({})).toThrow("Bad Request");
    expect(() => parseReleaseScheduleQuery({ asOf: "2026-09-01" })).toThrow("Bad Request");
    expect(() =>
      parseReleaseScheduleQuery({ asOf: "2026-09-01T00:00:00Z", workspaceId: workspace }),
    ).toThrow("Bad Request");
  });
});

describe("ReleaseMonitoringService", () => {
  it("authorizes first and returns only bounded, terminally admitted release provenance", async () => {
    const calls: Array<{ readonly text: string; readonly values?: readonly unknown[] }> = [];
    const transaction = transactionReturning(calls, [releaseRow()]);
    const access = { reconcilePrincipal: vi.fn(async () => principal) };
    const authorization = { assertEvidenceSeriesAccess: vi.fn(async () => undefined) };
    const service = serviceWith(transaction, access, authorization);
    const query = parseRecentReleaseQuery({
      releasedAfter: "2026-01-01T00:00:00Z",
      releasedBefore: "2026-02-01T00:00:00Z",
      limit: "1",
    });

    const page = await service.recentReleases(principal, series, query);

    expect(access.reconcilePrincipal).toHaveBeenCalledWith(principal, transaction);
    expect(authorization.assertEvidenceSeriesAccess).toHaveBeenCalledWith(
      principal,
      series,
      transaction,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.values).toEqual([
      series,
      "2026-01-01T00:00:00Z",
      "2026-02-01T00:00:00Z",
      "api",
      2,
    ]);
    expect(calls[0]?.text).toContain("evidence.governed_series_releases");
    expect(calls[0]?.text).not.toContain("FROM evidence.releases");
    expect(calls[0]?.text).not.toContain("FROM evidence.canonical_admissions");
    expect(page).toMatchObject({
      seriesId: series,
      evaluatedAt: "2026-02-01T00:00:00.000000Z",
      count: 1,
      truncated: false,
      window: { boundary: "exclusive_inclusive" },
      releases: [
        {
          id: "018f47ac-19fc-7c92-ae91-0242ac120010",
          monitoringTimeBasis: "source_publication_time",
          parser: { version: "1.0.0" },
          provenance: {
            representativeObservationId: "018f47ac-19fc-7c92-ae91-0242ac120014",
            currentSourceDecisionId: "018f47ac-19fc-7c92-ae91-0242ac120018",
          },
        },
      ],
    });
    expect(page.releases[0]?.provenance.observationProvenance).toBe(
      "/api/v1/evidence/observations/018f47ac-19fc-7c92-ae91-0242ac120014/provenance",
    );
  });

  it("uses limit plus one only to signal truncation", async () => {
    const first = releaseRow();
    const second = {
      ...releaseRow(),
      release_id: "018f47ac-19fc-7c92-ae91-0242ac120020",
      external_release_key: "release-2",
    };
    const transaction = transactionReturning([], [first, second]);
    const service = serviceWith(
      transaction,
      { reconcilePrincipal: async () => principal },
      { assertEvidenceSeriesAccess: async () => undefined },
    );

    const page = await service.recentReleases(
      principal,
      series,
      parseRecentReleaseQuery({
        releasedAfter: "2026-01-01T00:00:00Z",
        releasedBefore: "2026-02-01T00:00:00Z",
        limit: "1",
      }),
    );

    expect(page.count).toBe(1);
    expect(page.truncated).toBe(true);
    expect(page.releases).toHaveLength(1);
  });

  it("does not query release data when classification, role, or entitlement access is denied", async () => {
    const transaction = { query: vi.fn() } as unknown as TenantTransaction;
    const service = serviceWith(
      transaction,
      { reconcilePrincipal: async () => principal },
      {
        assertEvidenceSeriesAccess: async () => {
          throw new Error("denied");
        },
      },
    );

    await expect(
      service.recentReleases(
        principal,
        series,
        parseRecentReleaseQuery({
          releasedAfter: "2026-01-01T00:00:00Z",
          releasedBefore: "2026-02-01T00:00:00Z",
        }),
      ),
    ).rejects.toThrow("denied");
    expect(transaction.query).not.toHaveBeenCalled();
  });

  it("selects the earliest exact persisted future schedule time without forecasting", async () => {
    const calls: Array<{ readonly text: string; readonly values?: readonly unknown[] }> = [];
    const transaction = transactionReturning(calls, [
      scheduleRow({
        schemaVersion: 1,
        releaseTimes: [
          "2026-10-01T00:00:00Z",
          "2026-08-01T00:00:00Z",
          "2026-09-15T12:30:00.123456789Z",
        ],
      }),
    ]);
    const service = serviceWith(
      transaction,
      { reconcilePrincipal: async () => principal },
      { assertEvidenceSeriesAccess: async () => undefined },
    );

    const schedule = await service.releaseSchedule(
      principal,
      series,
      parseReleaseScheduleQuery({ asOf: "2026-09-01T00:00:00Z" }),
    );

    expect(calls[0]?.values).toEqual([series, "api"]);
    expect(calls[0]?.text).toContain("evidence.governed_series_release_schedule");
    expect(calls[0]?.text).not.toContain("FROM evidence.source_datasets");
    expect(schedule).toMatchObject({
      status: "scheduled",
      nextReleaseAt: "2026-09-15T12:30:00.123456789Z",
      scheduleSchemaVersion: 1,
      declaredReleaseCount: 3,
      declarationSha256: "a".repeat(64),
      provenance: {
        currentLicenseReviewId: "018f47ac-19fc-7c92-ae91-0242ac120017",
        currentSourceDecisionId: "018f47ac-19fc-7c92-ae91-0242ac120018",
      },
    });
  });

  it("reports legacy schedule metadata as unstructured and never guesses a timestamp", async () => {
    const transaction = transactionReturning(
      [],
      [
        scheduleRow({
          releaseTime: "not supplied by Indicators API",
          eligiblePolicy: "latest_revised",
        }),
      ],
    );
    const service = serviceWith(
      transaction,
      { reconcilePrincipal: async () => principal },
      { assertEvidenceSeriesAccess: async () => undefined },
    );

    const schedule = await service.releaseSchedule(
      principal,
      series,
      parseReleaseScheduleQuery({ asOf: "2026-09-01T00:00:00Z" }),
    );

    expect(schedule.status).toBe("unstructured");
    expect(schedule.nextReleaseAt).toBeNull();
    expect(schedule.scheduleSchemaVersion).toBeNull();
    expect(schedule.declaredReleaseCount).toBeNull();
  });

  it("distinguishes an empty declaration and a supported schedule with no future release", async () => {
    let rows: readonly Record<string, unknown>[] = [scheduleRow({})];
    const transaction: TenantTransaction = {
      async query<Row extends Record<string, unknown>>(): Promise<QueryResult<Row>> {
        return { rows: rows as readonly Row[], rowCount: rows.length };
      },
    };
    const service = serviceWith(
      transaction,
      { reconcilePrincipal: async () => principal },
      { assertEvidenceSeriesAccess: async () => undefined },
    );
    const query = parseReleaseScheduleQuery({ asOf: "2026-09-01T00:00:00Z" });

    await expect(service.releaseSchedule(principal, series, query)).resolves.toMatchObject({
      status: "not_declared",
      nextReleaseAt: null,
    });
    rows = [scheduleRow({ schemaVersion: 1, releaseTimes: ["2026-08-01T00:00:00Z"] })];
    await expect(service.releaseSchedule(principal, series, query)).resolves.toMatchObject({
      status: "no_upcoming_release",
      nextReleaseAt: null,
      declaredReleaseCount: 1,
    });
  });

  it("maps a legally invisible schedule to a non-enumerating not-found response", async () => {
    const transaction = transactionReturning([], []);
    const service = serviceWith(
      transaction,
      { reconcilePrincipal: async () => principal },
      { assertEvidenceSeriesAccess: async () => undefined },
    );

    await expect(
      service.releaseSchedule(
        principal,
        series,
        parseReleaseScheduleQuery({ asOf: "2026-09-01T00:00:00Z" }),
      ),
    ).rejects.toThrow("Not Found");
  });
});

function serviceWith(
  transaction: TenantTransaction,
  access: Pick<WorkspaceAccessService, "reconcilePrincipal">,
  authorization: Pick<GovernedAuthorizationService, "assertEvidenceSeriesAccess">,
): ReleaseMonitoringService {
  const database = {
    withPrincipal: async (
      _principal: Principal,
      operation: (inner: TenantTransaction) => Promise<unknown>,
    ) => operation(transaction),
  };
  return new ReleaseMonitoringService(
    database as unknown as PostgresRuntime,
    access as WorkspaceAccessService,
    authorization as GovernedAuthorizationService,
  );
}

function transactionReturning(
  calls: Array<{ readonly text: string; readonly values?: readonly unknown[] }>,
  rows: readonly Record<string, unknown>[],
): TenantTransaction {
  return {
    async query<Row extends Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<QueryResult<Row>> {
      calls.push({ text, ...(values === undefined ? {} : { values }) });
      return { rows: rows as readonly Row[], rowCount: rows.length };
    },
  };
}

function releaseRow(): Record<string, unknown> {
  return {
    evaluated_at: "2026-02-01T00:00:00.000000Z",
    release_id: "018f47ac-19fc-7c92-ae91-0242ac120010",
    series_id: series,
    source_id: "018f47ac-19fc-7c92-ae91-0242ac120011",
    dataset_id: "018f47ac-19fc-7c92-ae91-0242ac120012",
    raw_payload_id: "018f47ac-19fc-7c92-ae91-0242ac120013",
    external_release_key: "release-1",
    monitoring_time: "2026-01-15T10:00:00.000000Z",
    monitoring_time_basis: "source_publication_time",
    release_time: "2026-01-15T10:00:00.000000Z",
    source_publication_time: "2026-01-15T10:00:00.000000Z",
    original_release_time: "2026-01-15T10:00:00.000000Z",
    availability_time: "2026-01-15T10:01:00.000000Z",
    revision_time: null,
    revision_sequence: 0,
    pit_quality: "true_vintage",
    payload_fetched_at: "2026-01-15T10:02:00.000000Z",
    recorded_at: "2026-01-15T10:03:00.000000Z",
    parser_name: "fixture-parser",
    parser_version: "1.0.0",
    parser_code_sha256: "b".repeat(64),
    parser_configuration_sha256: "c".repeat(64),
    representative_observation_id: "018f47ac-19fc-7c92-ae91-0242ac120014",
    transformation_run_id: "018f47ac-19fc-7c92-ae91-0242ac120015",
    ingestion_run_id: "018f47ac-19fc-7c92-ae91-0242ac120016",
    canonical_admission_id: "018f47ac-19fc-7c92-ae91-0242ac120019",
    canonical_admission_evidence_id: "018f47ac-19fc-7c92-ae91-0242ac12001a",
    admission_license_review_id: "018f47ac-19fc-7c92-ae91-0242ac120017",
    admission_source_decision_id: "018f47ac-19fc-7c92-ae91-0242ac120018",
    current_license_review_id: "018f47ac-19fc-7c92-ae91-0242ac120017",
    current_source_decision_id: "018f47ac-19fc-7c92-ae91-0242ac120018",
    admission_basis: "durable_ingestion_v1",
    admission_manifest_sha256: "d".repeat(64),
    admission_evidence_sha256: "e".repeat(64),
    output_manifest_sha256: "f".repeat(64),
    quality_result_count: 2,
    admitted_at: "2026-01-15T10:04:00.000000Z",
    admission_recorded_at: "2026-01-15T10:04:00.000000Z",
  };
}

function scheduleRow(schedule: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return {
    series_id: series,
    source_id: "018f47ac-19fc-7c92-ae91-0242ac120011",
    dataset_id: "018f47ac-19fc-7c92-ae91-0242ac120012",
    evaluated_at: "2026-09-01T00:00:00.000000Z",
    expected_frequency: "monthly",
    release_schedule: schedule,
    release_schedule_within_bound: true,
    declaration_sha256: "a".repeat(64),
    current_license_review_id: "018f47ac-19fc-7c92-ae91-0242ac120017",
    current_source_decision_id: "018f47ac-19fc-7c92-ae91-0242ac120018",
  };
}
