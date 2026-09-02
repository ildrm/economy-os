import {
  assertCapitalAllocationManifestIntegrity,
  assertCountryComparisonIntegrity,
} from "@economyos/capital-allocation";
import { organizationId, type Principal, subjectId, workspaceId } from "@economyos/contracts";
import { describe, expect, it, vi } from "vitest";
import { CapitalResearchService, parseCapitalResearchQuery } from "./capital-research.js";
import type { PostgresRuntime, QueryResult, TenantTransaction } from "./database.js";
import type { GovernedAuthorizationService } from "./governed-authorization.js";
import type { WorkspaceAccessService } from "./workspaces.js";

vi.mock("@economyos/capital-allocation", () => ({
  assertCapitalAllocationManifestIntegrity: vi.fn(),
  assertCountryComparisonIntegrity: vi.fn(),
}));

const ORGANIZATION_ID = organizationId("118f47ac-19fc-7c92-ae91-0242ac120001");
const WORKSPACE_ID = workspaceId("218f47ac-19fc-7c92-ae91-0242ac120001");
const SUBJECT_ID = subjectId("318f47ac-19fc-7c92-ae91-0242ac120001");
const ASSESSMENT_ID = "418f47ac-19fc-7c92-ae91-0242ac120001";
const COUNTRY_ID = "518f47ac-19fc-7c92-ae91-0242ac120001";
const MODEL_ID = "618f47ac-19fc-7c92-ae91-0242ac120001";
const COMPLETION_ID = "718f47ac-19fc-7c92-ae91-0242ac120001";
const COMPARISON_ID = "818f47ac-19fc-7c92-ae91-0242ac120001";
const SHA = "a".repeat(64);

const principal: Principal = {
  organizationId: ORGANIZATION_ID,
  workspaceIds: [WORKSPACE_ID],
  subjectId: SUBJECT_ID,
  scopes: ["model.read"],
  authenticationMethod: "oidc",
  issuedAt: "2026-09-02T00:00:00Z",
  expiresAt: "2026-09-02T12:00:00Z",
};

describe("capital research request parsing", () => {
  it("accepts only one canonical workspace selector", () => {
    expect(parseCapitalResearchQuery({ workspaceId: WORKSPACE_ID.toUpperCase() })).toEqual({
      workspaceId: WORKSPACE_ID,
    });
    expect(() => parseCapitalResearchQuery({ workspaceId: WORKSPACE_ID, extra: true })).toThrow(
      "Bad Request",
    );
    expect(() => parseCapitalResearchQuery({ workspaceId: "bad" })).toThrow("Bad Request");
  });
});

describe("CapitalResearchService", () => {
  it("authorizes and maps a content-validated immutable assessment", async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const transaction = transactionWith(async (text, values) => {
      calls.push({ text, ...(values ? { values } : {}) });
      return [assessmentRow()];
    });
    const { service, membership, authorization } = serviceWith(transaction);
    const result = await service.getAssessment(principal, ASSESSMENT_ID, {
      workspaceId: WORKSPACE_ID,
    });

    expect(result).toMatchObject({
      schemaVersion: 1,
      workspaceId: WORKSPACE_ID,
      assessmentId: ASSESSMENT_ID,
      countryId: COUNTRY_ID,
      countryCode: "USA",
      strategyKey: "balanced-research",
      asOf: "2026-09-01T00:00:00.000Z",
      modelArtifactId: MODEL_ID,
      modelArtifactSha256: SHA,
      completionId: COMPLETION_ID,
      manifestSha256: SHA,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.manifest)).toBe(true);
    expect(calls[0]?.text).toContain("app.get_capital_research_assessment($1::uuid, $2::uuid)");
    expect(calls[0]?.values).toEqual([WORKSPACE_ID, ASSESSMENT_ID]);
    expect(membership).toHaveBeenCalledWith(principal, WORKSPACE_ID, transaction);
    expect(authorization).toHaveBeenCalledWith(principal, WORKSPACE_ID, transaction);
    expect(assertCapitalAllocationManifestIntegrity).toHaveBeenCalled();
  });

  it("keeps missing or unservable assessments non-enumerating", async () => {
    const { service } = serviceWith(transactionWith(async () => []));
    await expect(
      service.getAssessment(principal, ASSESSMENT_ID, { workspaceId: WORKSPACE_ID }),
    ).rejects.toMatchObject({ response: { code: "CAPITAL_ASSESSMENT_NOT_FOUND" } });
  });

  it("fails closed on duplicate rows, malformed content, and metadata mismatch", async () => {
    const duplicate = serviceWith(
      transactionWith(async () => [assessmentRow(), assessmentRow()]),
    ).service;
    await expect(
      duplicate.getAssessment(principal, ASSESSMENT_ID, { workspaceId: WORKSPACE_ID }),
    ).rejects.toThrow(/multiple rows/);

    const malformed = assessmentRow();
    malformed.model_artifact_sha256 = "bad";
    await expect(
      serviceWith(transactionWith(async () => [malformed])).service.getAssessment(
        principal,
        ASSESSMENT_ID,
        { workspaceId: WORKSPACE_ID },
      ),
    ).rejects.toThrow(/model_artifact_sha256/);

    const mismatch = assessmentRow();
    mismatch.country_code = "DEU";
    await expect(
      serviceWith(transactionWith(async () => [mismatch])).service.getAssessment(
        principal,
        ASSESSMENT_ID,
        { workspaceId: WORKSPACE_ID },
      ),
    ).rejects.toThrow(/assessment_manifest.metadata/);

    const subMillisecondMismatch = assessmentRow();
    subMillisecondMismatch.assessment_manifest.pointInTime = {
      asOf: "2026-09-01T00:00:00.000000001Z",
    };
    await expect(
      serviceWith(transactionWith(async () => [subMillisecondMismatch])).service.getAssessment(
        principal,
        ASSESSMENT_ID,
        { workspaceId: WORKSPACE_ID },
      ),
    ).rejects.toThrow(/assessment_manifest.metadata/);
  });

  it("wraps a scientific manifest validation failure as a database contract violation", async () => {
    vi.mocked(assertCapitalAllocationManifestIntegrity).mockImplementationOnce(() => {
      throw new TypeError("digest mismatch");
    });
    await expect(
      serviceWith(transactionWith(async () => [assessmentRow()])).service.getAssessment(
        principal,
        ASSESSMENT_ID,
        { workspaceId: WORKSPACE_ID },
      ),
    ).rejects.toThrow(/assessment_manifest/);
  });

  it("maps requested-order comparison content without adding a rank", async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const transaction = transactionWith(async (text, values) => {
      calls.push({ text, ...(values ? { values } : {}) });
      return [comparisonRow()];
    });
    const { service } = serviceWith(transaction);
    const result = await service.getComparison(principal, COMPARISON_ID, {
      workspaceId: WORKSPACE_ID,
    });

    expect(result).toMatchObject({
      schemaVersion: 1,
      workspaceId: WORKSPACE_ID,
      comparisonId: COMPARISON_ID,
      referenceCountryId: COUNTRY_ID,
      assetClass: "sovereign_bond",
      strategyKey: "balanced-research",
      manifestSha256: SHA,
    });
    expect(JSON.stringify(result)).not.toMatch(/"rank"|"winner"|"recommendation"/);
    expect(Object.isFrozen(result.comparison)).toBe(true);
    expect(calls[0]?.text).toContain("app.get_capital_country_comparison($1::uuid, $2::uuid)");
    expect(calls[0]?.values).toEqual([WORKSPACE_ID, COMPARISON_ID]);
    expect(assertCountryComparisonIntegrity).toHaveBeenCalled();
  });

  it("keeps missing comparisons non-enumerating and rejects detached metadata", async () => {
    const missing = serviceWith(transactionWith(async () => [])).service;
    await expect(
      missing.getComparison(principal, COMPARISON_ID, { workspaceId: WORKSPACE_ID }),
    ).rejects.toMatchObject({ response: { code: "CAPITAL_COMPARISON_NOT_FOUND" } });

    const detached = comparisonRow();
    detached.asset_class = "equity";
    await expect(
      serviceWith(transactionWith(async () => [detached])).service.getComparison(
        principal,
        COMPARISON_ID,
        { workspaceId: WORKSPACE_ID },
      ),
    ).rejects.toThrow(/comparison_manifest.metadata/);

    const invalidCalendar = comparisonRow();
    invalidCalendar.created_at = "2026-02-31T00:00:00Z";
    await expect(
      serviceWith(transactionWith(async () => [invalidCalendar])).service.getComparison(
        principal,
        COMPARISON_ID,
        { workspaceId: WORKSPACE_ID },
      ),
    ).rejects.toThrow(/created_at/);
  });
});

function serviceWith(transaction: TenantTransaction): {
  readonly service: CapitalResearchService;
  readonly membership: ReturnType<typeof vi.fn>;
  readonly authorization: ReturnType<typeof vi.fn>;
} {
  const database = {
    withPrincipal: async (
      _principal: Principal,
      operation: (inner: TenantTransaction) => Promise<unknown>,
    ) => operation(transaction),
  };
  const membership = vi.fn(async () => WORKSPACE_ID);
  const authorization = vi.fn(async () => undefined);
  return {
    service: new CapitalResearchService(
      database as unknown as PostgresRuntime,
      { assertMembership: membership } as unknown as WorkspaceAccessService,
      { assertEconomicStateAccess: authorization } as unknown as GovernedAuthorizationService,
    ),
    membership,
    authorization,
  };
}

function transactionWith(
  responder: (
    text: string,
    values?: readonly unknown[],
  ) => Promise<readonly Record<string, unknown>[]>,
): TenantTransaction {
  return {
    query: async <Row extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<QueryResult<Row>> => {
      const rows = await responder(text, values);
      return { rows: rows as readonly Row[], rowCount: rows.length };
    },
  };
}

function assessmentRow(): Record<string, unknown> & {
  assessment_manifest: Record<string, unknown>;
} {
  return {
    assessment_id: ASSESSMENT_ID,
    country_id: COUNTRY_ID,
    country_code: "USA",
    strategy_key: "balanced-research",
    as_of: "2026-09-01T00:00:00.000000Z",
    model_artifact_id: MODEL_ID,
    model_artifact_sha256: SHA,
    completion_id: COMPLETION_ID,
    assessment_manifest: {
      schemaVersion: 1,
      manifestId: ASSESSMENT_ID,
      manifestSha256: SHA,
      country: { countryId: COUNTRY_ID, countryCode: "USA" },
      strategyKey: "balanced-research",
      pointInTime: { asOf: "2026-09-01T00:00:00.000Z" },
      model: { modelId: MODEL_ID, artifactSha256: SHA },
      semantics: {
        purpose: "research_only",
        decisionUse: "prohibited",
        adviceStatus: "not_investment_advice",
      },
    },
    manifest_sha256: SHA,
  };
}

function comparisonRow(): Record<string, unknown> & {
  comparison_manifest: Record<string, unknown>;
} {
  return {
    comparison_id: COMPARISON_ID,
    reference_country_id: COUNTRY_ID,
    asset_class: "sovereign_bond",
    strategy_key: "balanced-research",
    created_at: "2026-09-02T00:00:00.000000Z",
    comparison_manifest: {
      schemaVersion: 1,
      comparisonId: COMPARISON_ID,
      referenceCountryId: COUNTRY_ID,
      assetClass: "sovereign_bond",
      strategyKey: "balanced-research",
      manifestSha256: SHA,
      results: [{ country: { countryId: COUNTRY_ID, countryCode: "USA" }, status: "comparable" }],
      semantics: {
        purpose: "research_only",
        decisionUse: "prohibited",
        adviceStatus: "not_investment_advice",
      },
    },
    manifest_sha256: SHA,
  };
}
