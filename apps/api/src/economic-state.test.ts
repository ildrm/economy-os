import { organizationId, type Principal, subjectId, workspaceId } from "@economyos/contracts";
import { describe, expect, it, vi } from "vitest";
import type { PostgresRuntime, QueryResult, TenantTransaction } from "./database.js";
import {
  EconomicStateService,
  parseStatePageQuery,
  parseStateResourceQuery,
  parseStateRunPageQuery,
} from "./economic-state.js";
import type { GovernedAuthorizationService } from "./governed-authorization.js";
import type { WorkspaceAccessService } from "./workspaces.js";

const organization = "078f47ac-19fc-7c92-ae91-0242ac120001";
const workspace = "078f47ac-19fc-7c92-ae91-0242ac120002";
const model = "078f47ac-19fc-7c92-ae91-0242ac120003";
const secondModel = "078f47ac-19fc-7c92-ae91-0242ac120004";
const geography = "078f47ac-19fc-7c92-ae91-0242ac120005";
const run = "078f47ac-19fc-7c92-ae91-0242ac120006";
const secondRun = "078f47ac-19fc-7c92-ae91-0242ac120007";
const vector = "078f47ac-19fc-7c92-ae91-0242ac120013";
const observation = "078f47ac-19fc-7c92-ae91-0242ac120008";
const source = "078f47ac-19fc-7c92-ae91-0242ac120009";
const concept = "078f47ac-19fc-7c92-ae91-0242ac12000a";
const artifact = "078f47ac-19fc-7c92-ae91-0242ac12000d";
const series = "078f47ac-19fc-7c92-ae91-0242ac12000e";
const sourceDataset = "078f47ac-19fc-7c92-ae91-0242ac120010";
const licenseReview = "078f47ac-19fc-7c92-ae91-0242ac120011";
const sourceAdmissionDecision = "078f47ac-19fc-7c92-ae91-0242ac120012";
const principal: Principal = {
  subjectId: subjectId("078f47ac-19fc-7c92-ae91-0242ac12000b"),
  organizationId: organizationId(organization),
  workspaceIds: [workspaceId(workspace)],
  scopes: [],
  authenticationMethod: "oidc",
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-01T01:00:00.000Z",
};

const modelRow = {
  id: model,
  model_key: "macroeconomic.output-labor",
  model_version: "1.0.0",
  dimension: "macroeconomic",
  governance_schema_version: 2,
  model_artifact_id: artifact,
  model_artifact_sha256: "e".repeat(64),
  minimum_coverage: "0.600000000000000001",
  definition_sha256: "a".repeat(64),
  component_count: 2,
  created_by: principal.subjectId,
  created_at: "2026-03-01T00:00:00.000000Z",
};

const runRow = {
  id: run,
  snapshot_id: "078f47ac-19fc-7c92-ae91-0242ac12000c",
  snapshot_manifest_sha256: "b".repeat(64),
  model_id: model,
  model_key: "macroeconomic.output-labor",
  model_version: "1.0.0",
  dimension: "macroeconomic",
  governance_schema_version: 2,
  model_definition_sha256: "a".repeat(64),
  model_artifact_id: artifact,
  model_artifact_sha256: "e".repeat(64),
  geography_id: geography,
  geography_code_scheme: "ISO-3166-1-alpha-3",
  geography_code: "IRN",
  geography_name: "Iran",
  known_at: "2026-03-01T00:00:00.000000Z",
  policy: "true_vintage",
  system_at: "2026-03-01T01:00:00.000000Z",
  status: "partial",
  score: "99.123456",
  missing_reason: null,
  completeness: "0.600001",
  source_coverage: "0.500001",
  confidence: "0.900001",
  independent_source_count: 1,
  renormalized: true,
  result_manifest_sha256: "c".repeat(64),
  calculated_by: principal.subjectId,
  calculated_at: "2026-03-01T01:00:01.000000Z",
} as const;

const legalEvidenceManifest = {
  schemaVersion: 1,
  action: "derive",
  organizationId: organization,
  observationId: observation,
  sourceId: source,
  sourceDatasetId: sourceDataset,
  licenseReview: {
    id: licenseReview,
    sourceSlug: "world-bank",
    datasetExternalKey: "wdi",
    evidenceUri: "https://example.test/licenses/wdi",
    licenseExpression: "CC-BY-4.0",
    intendedUses: ["api", "derive"],
    evidence: { catalog: "world-development-indicators" },
    evidenceSha256: "4".repeat(64),
    reviewedBy: "legal@example.test",
    reviewedAt: "2026-02-01T00:00:00.000000Z",
    expiresAt: null,
    createdAt: "2026-02-01T00:00:01.000000Z",
  },
  sourceAdmissionDecision: {
    id: sourceAdmissionDecision,
    organizationId: null,
    sourceId: source,
    sourceDatasetId: sourceDataset,
    decision: "approved",
    permittedActions: ["api", "derive"],
    licenseReviewId: licenseReview,
    reason: "Approved for governed derivation",
    decidedBy: "legal@example.test",
    decidedAt: "2026-02-01T00:00:02.000000Z",
    recordedAt: "2026-02-01T00:00:03.000000Z",
  },
} as const;

const observedComponentRow = {
  result_organization_id: organization,
  component_key: "gdp",
  concept_id: concept,
  canonical_key: "economy.output.gdp",
  concept_name: "Gross domestic product",
  series_id: series,
  unit_code: "USD",
  frequency: "annual",
  seasonal_adjustment: "not_applicable",
  parser_name: "wdi-json-stat-v2",
  parser_version: "2.0.0",
  parser_code_sha256: "f".repeat(64),
  parser_configuration_sha256: "1".repeat(64),
  feature_contract_sha256: "2".repeat(64),
  weight: "0.6",
  polarity: "positive",
  lower_bound: "0",
  upper_bound: "100",
  created_at: "2026-03-01T00:00:00.000000Z",
  observation_id: observation,
  source_id: source,
  source_dataset_id: sourceDataset,
  license_review_id: licenseReview,
  source_admission_event_id: sourceAdmissionDecision,
  legal_evidence_manifest: legalEvidenceManifest,
  legal_evidence_sha256: "5".repeat(64),
  raw_value: "75.123456789012345678",
  normalized_value: "0.751235",
  contribution: "0.450741",
  missing_reason: null,
  quality: "0.999999",
  quality_evidence_sha256: "d".repeat(64),
} as const;

const missingComponentRow = {
  ...observedComponentRow,
  component_key: "unemployment",
  canonical_key: "economy.labor.unemployment.rate",
  concept_name: "Unemployment rate",
  series_id: "078f47ac-19fc-7c92-ae91-0242ac12000f",
  unit_code: "PERCENT",
  feature_contract_sha256: "3".repeat(64),
  weight: "0.4",
  polarity: "negative",
  observation_id: null,
  source_id: null,
  source_dataset_id: null,
  license_review_id: null,
  source_admission_event_id: null,
  legal_evidence_manifest: null,
  legal_evidence_sha256: null,
  raw_value: null,
  normalized_value: null,
  contribution: null,
  missing_reason: "not_collected",
  quality: null,
  quality_evidence_sha256: null,
} as const;

const vectorBaseRow = {
  vector_id: vector,
  geography_id: geography,
  geography_kind: "country",
  geography_code_scheme: "ISO-3166-1-alpha-3",
  geography_code: "IRN",
  geography_name: "Iran",
  snapshot_id: runRow.snapshot_id,
  snapshot_manifest_sha256: runRow.snapshot_manifest_sha256,
  known_at: runRow.known_at,
  policy: runRow.policy,
  system_at: runRow.system_at,
  context_sha256: "6".repeat(64),
  dimension_count: 5,
  reported_dimension_count: 1,
  scored_dimension_count: 1,
  insufficient_dimension_count: 0,
  missing_dimension_count: 4,
  dimension_coverage: "0.2",
  scored_dimension_coverage: "0.2",
  evidence_coverage: "0.12",
  confidence_coverage: "0.11",
  evidence_quality: "0.916667",
  reported_component_count: 2,
  observed_component_count: 1,
  distinct_source_count: 1,
  distinct_source_coverage: "0.5",
  state_manifest_sha256: "7".repeat(64),
  assembled_by: principal.subjectId,
  assembled_at: "2026-03-01T01:00:02.000000Z",
} as const;

const reportedVectorDimensionRow = {
  ...vectorBaseRow,
  ordinal: 1,
  dimension: "macroeconomic",
  slot_missing_reason: null,
  model_id: model,
  model_key: modelRow.model_key,
  model_version: modelRow.model_version,
  model_dimension: modelRow.dimension,
  governance_schema_version: 2,
  model_definition_sha256: modelRow.definition_sha256,
  artifact_id: artifact,
  artifact_sha256: "e".repeat(64),
  artifact_algorithm_key: "weighted.minmax",
  artifact_algorithm_version: "1.0.0",
  artifact_configuration_sha256: "8".repeat(64),
  artifact_normalization_sha256: "9".repeat(64),
  artifact_assumptions_sha256: "a".repeat(64),
  artifact_approval_sha256: "b".repeat(64),
  artifact_lifecycle_status: "research",
  state_run_id: run,
  run_model_definition_sha256: modelRow.definition_sha256,
  run_model_artifact_id: artifact,
  run_model_artifact_sha256: "e".repeat(64),
  run_status: "partial",
  run_score: "99.123456",
  run_missing_reason: null,
  run_completeness: "0.600001",
  run_source_coverage: "0.500001",
  run_confidence: "0.900001",
  run_distinct_source_count: 1,
  run_renormalized: true,
  run_result_manifest_sha256: "c".repeat(64),
  run_calculated_by: principal.subjectId,
  run_calculated_at: "2026-03-01T01:00:01.000000Z",
} as const;

const missingVectorDimensionRows = [
  [2, "human_economic", "not_modeled"],
  [3, "financial_system", "model_unavailable"],
  [4, "market", "source_missing"],
  [5, "regime", "pipeline_failure"],
].map(([ordinal, dimension, missingReason]) => ({
  ...vectorBaseRow,
  ordinal,
  dimension,
  slot_missing_reason: missingReason,
  model_id: null,
  model_key: null,
  model_version: null,
  model_dimension: null,
  governance_schema_version: null,
  model_definition_sha256: null,
  artifact_id: null,
  artifact_sha256: null,
  artifact_algorithm_key: null,
  artifact_algorithm_version: null,
  artifact_configuration_sha256: null,
  artifact_normalization_sha256: null,
  artifact_assumptions_sha256: null,
  artifact_approval_sha256: null,
  artifact_lifecycle_status: null,
  state_run_id: null,
  run_model_definition_sha256: null,
  run_model_artifact_id: null,
  run_model_artifact_sha256: null,
  run_status: null,
  run_score: null,
  run_missing_reason: null,
  run_completeness: null,
  run_source_coverage: null,
  run_confidence: null,
  run_distinct_source_count: null,
  run_renormalized: null,
  run_result_manifest_sha256: null,
  run_calculated_by: null,
  run_calculated_at: null,
})) as readonly Record<string, unknown>[];

describe("economic-state query validation", () => {
  it("parses bounded keyset pages and typed run filters", () => {
    expect(parseStatePageQuery({ workspaceId: workspace })).toEqual({
      workspaceId: workspace,
      limit: 50,
    });
    expect(
      parseStateRunPageQuery({
        workspaceId: workspace,
        cursor: run,
        modelId: model,
        geographyId: geography,
        status: "partial",
        limit: "100",
      }),
    ).toEqual({
      workspaceId: workspace,
      cursor: run,
      modelId: model,
      geographyId: geography,
      status: "partial",
      limit: 100,
    });
    expect(parseStateResourceQuery({ workspaceId: workspace })).toEqual({ workspaceId: workspace });
  });

  const invalidQueries: ReadonlyArray<readonly [() => unknown, string]> = [
    [() => parseStatePageQuery({ workspaceId: workspace, limit: "101" }), "oversized page"],
    [() => parseStatePageQuery({ workspaceId: [workspace] }), "array pollution"],
    [() => parseStatePageQuery({ workspaceId: workspace, cursor: "bad" }), "invalid cursor"],
    [() => parseStatePageQuery({ workspaceId: workspace, extra: "x" }), "unknown field"],
    [
      () => parseStateRunPageQuery({ workspaceId: workspace, status: "complete-ish" }),
      "invalid status",
    ],
    [
      () => parseStateRunPageQuery({ workspaceId: workspace, modelId: "not-a-uuid" }),
      "invalid filter identifier",
    ],
    [
      () => parseStateResourceQuery({ workspaceId: workspace, limit: "1" }),
      "resource query pollution",
    ],
  ];

  it.each(invalidQueries)("rejects %s (%s)", (parse, _description) => {
    expect(parse).toThrow("Bad Request");
  });
});

describe("EconomicStateService", () => {
  it("authorizes in-transaction and keyset-paginates models with exact decimal strings", async () => {
    const calls: Array<{ readonly text: string; readonly values?: readonly unknown[] }> = [];
    const transaction = transactionWith(async (text, values) => {
      calls.push({ text, ...(values === undefined ? {} : { values }) });
      return rows([modelRow, { ...modelRow, id: secondModel, model_key: "regime.inflation" }]);
    });
    const { service, access } = serviceWith(transaction);

    const page = await service.models(
      principal,
      parseStatePageQuery({ workspaceId: workspace, limit: "1" }),
    );

    expect(access.assertMembership).toHaveBeenCalledWith(principal, workspace, transaction);
    expect(calls[0]?.text).toContain("model.organization_id = $1::uuid");
    expect(calls[0]?.text).toContain("model.workspace_id = $2::uuid");
    expect(calls[0]?.values).toEqual([organization, workspace, null, 2]);
    expect(page).toMatchObject({ count: 1, nextCursor: model });
    expect(page.models[0]?.minimumCoverage).toBe("0.600000000000000001");
    expect(page.models[0]).toMatchObject({
      governanceSchemaVersion: 2,
      modelArtifactId: artifact,
      modelArtifactSha256: "e".repeat(64),
    });
    expect(page.models[0]?.links.components).toBe(
      `/api/v1/economic-state/models/${model}/components?workspaceId=${workspace}`,
    );
  });

  it("loads a bounded model component set only after verifying the scoped parent", async () => {
    const calls: Array<{ readonly text: string; readonly values?: readonly unknown[] }> = [];
    const transaction = transactionWith(async (text, values) => {
      calls.push({ text, ...(values === undefined ? {} : { values }) });
      if (text.includes("FROM evidence.economic_state_model_components component\n  JOIN")) {
        return rows([
          {
            component_key: "gdp",
            concept_id: concept,
            canonical_key: "economy.output.gdp",
            concept_name: "Gross domestic product",
            series_id: series,
            unit_code: "USD",
            frequency: "annual",
            seasonal_adjustment: "not_applicable",
            parser_name: "wdi-json-stat-v2",
            parser_version: "2.0.0",
            parser_code_sha256: "f".repeat(64),
            parser_configuration_sha256: "1".repeat(64),
            feature_contract_sha256: "2".repeat(64),
            weight: "0.600000000000000001",
            polarity: "positive",
            lower_bound: "0",
            upper_bound: "100000000000000000000.000000000000000001",
            created_at: "2026-03-01T00:00:00.000000Z",
          },
        ]);
      }
      return rows([modelRow]);
    });
    const { service } = serviceWith(transaction);

    const collection = await service.modelComponents(
      principal,
      model,
      parseStateResourceQuery({ workspaceId: workspace }),
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.values).toEqual([organization, workspace, model]);
    expect(calls[1]?.text).toContain("LIMIT 100");
    expect(calls[1]?.text).toContain('ORDER BY component.component_key COLLATE "C"');
    expect(calls[1]?.values).toEqual([organization, workspace, model]);
    expect(collection.components[0]?.upperBound).toBe("100000000000000000000.000000000000000001");
    expect(collection.components[0]).toMatchObject({
      seriesId: series,
      unitCode: "USD",
      frequency: "annual",
      seasonalAdjustment: "not_applicable",
      parser: {
        name: "wdi-json-stat-v2",
        version: "2.0.0",
        codeSha256: "f".repeat(64),
        configurationSha256: "1".repeat(64),
      },
      featureContractSha256: "2".repeat(64),
    });
  });

  it("filters and paginates run summaries without numeric coercion", async () => {
    const calls: Array<{ readonly text: string; readonly values?: readonly unknown[] }> = [];
    const transaction = transactionWith(async (text, values) => {
      calls.push({ text, ...(values === undefined ? {} : { values }) });
      return rows([runRow, { ...runRow, id: secondRun }]);
    });
    const { service } = serviceWith(transaction);
    const page = await service.runs(
      principal,
      parseStateRunPageQuery({
        workspaceId: workspace,
        modelId: model,
        geographyId: geography,
        status: "partial",
        limit: "1",
      }),
    );

    expect(calls[0]?.text).toContain("run.organization_id = $1::uuid");
    expect(calls[0]?.text).toContain("run.workspace_id = $2::uuid");
    expectRunApiServabilityGate(calls[0]?.text ?? "");
    expect(calls[0]?.values).toEqual([
      organization,
      workspace,
      model,
      geography,
      "partial",
      null,
      2,
    ]);
    expect(page.nextCursor).toBe(run);
    expect(page.runs[0]).toMatchObject({
      model: { governanceSchemaVersion: 2 },
      modelArtifactId: artifact,
      modelArtifactSha256: "e".repeat(64),
      score: "99.123456",
      completeness: "0.600001",
      confidence: "0.900001",
    });
  });

  it("applies the same current API-license gate to run detail reads", async () => {
    const calls: string[] = [];
    const transaction = transactionWith(async (text) => {
      calls.push(text);
      return rows([runRow]);
    });
    const { service } = serviceWith(transaction);

    await service.run(principal, run, parseStateResourceQuery({ workspaceId: workspace }));

    expect(calls).toHaveLength(1);
    expectRunApiServabilityGate(calls[0] ?? "");
  });

  it("returns one bounded research-baseline vector with five canonical slots", async () => {
    const calls: Array<{ readonly text: string; readonly values?: readonly unknown[] }> = [];
    const transaction = transactionWith(async (text, values) => {
      calls.push({ text, ...(values === undefined ? {} : { values }) });
      return rows([reportedVectorDimensionRow, ...missingVectorDimensionRows]);
    });
    const { service, access } = serviceWith(transaction);

    const result = await service.vector(
      principal,
      vector,
      parseStateResourceQuery({ workspaceId: workspace }),
    );

    expect(calls).toHaveLength(1);
    expect(access.assertMembership).toHaveBeenCalledWith(principal, workspace, transaction);
    expect(calls[0]?.values).toEqual([organization, workspace, vector]);
    expect(calls[0]?.text).toContain("vector.organization_id = $1::uuid");
    expect(calls[0]?.text).toContain("vector.workspace_id = $2::uuid");
    expect(calls[0]?.text).toContain("vector.id = $3::uuid");
    expect(calls[0]?.text).toContain(
      "evidence.economic_state_run_is_currently_servable(reported.state_run_id, 'api')",
    );
    expect(calls[0]?.text).toContain(
      "evidence.economic_state_run_is_currently_servable(reported.state_run_id, 'api') IS NOT TRUE",
    );
    expect(calls[0]?.text).toContain("LIMIT 6");
    expect(result).toMatchObject({
      schemaVersion: 1,
      id: vector,
      methodologyScope: "research_baseline",
      geography: { id: geography, kind: "country", code: "IRN" },
      snapshot: { id: runRow.snapshot_id, manifestSha256: "b".repeat(64) },
      pointInTime: {
        knownAt: runRow.known_at,
        policy: "true_vintage",
        systemAt: runRow.system_at,
      },
      diagnostics: {
        dimensionCount: 5,
        reportedDimensionCount: 1,
        scoredDimensionCount: 1,
        missingDimensionCount: 4,
        evidenceQuality: "0.916667",
      },
      stateManifestSha256: "7".repeat(64),
      assembledBy: principal.subjectId,
      dimensions: [
        {
          ordinal: 1,
          dimension: "macroeconomic",
          missingReason: null,
          model: {
            id: model,
            governanceSchemaVersion: 2,
            definitionSha256: "a".repeat(64),
            artifact: {
              id: artifact,
              sha256: "e".repeat(64),
              lifecycleStatus: "research",
              algorithmKey: "weighted.minmax",
            },
          },
          run: {
            id: run,
            status: "partial",
            score: "99.123456",
            resultManifestSha256: "c".repeat(64),
          },
        },
        { ordinal: 2, dimension: "human_economic", missingReason: "not_modeled" },
        { ordinal: 3, dimension: "financial_system", missingReason: "model_unavailable" },
        { ordinal: 4, dimension: "market", missingReason: "source_missing" },
        { ordinal: 5, dimension: "regime", missingReason: "pipeline_failure" },
      ],
      links: {
        self: `/api/v1/economic-state/vectors/${vector}?workspaceId=${workspace}`,
      },
    });
    expect(result).not.toHaveProperty("overallScore");
    expect(result).not.toHaveProperty("rank");
    expect(result).not.toHaveProperty("stateManifest");
    expect(result.dimensions[0]?.run?.links.components).toBe(
      `/api/v1/economic-state/runs/${run}/components?workspaceId=${workspace}`,
    );
  });

  it("returns a non-enumerating miss when a vector or any reported run is unservable", async () => {
    const transaction = transactionWith(async () => rows([]));
    const { service } = serviceWith(transaction);

    await expect(
      service.vector(principal, vector, parseStateResourceQuery({ workspaceId: workspace })),
    ).rejects.toThrow("Not Found");
  });

  it("fails closed when the database does not return all five canonical vector slots", async () => {
    const transaction = transactionWith(async () =>
      rows([reportedVectorDimensionRow, ...missingVectorDimensionRows.slice(0, 3)]),
    );
    const { service } = serviceWith(transaction);

    await expect(
      service.vector(principal, vector, parseStateResourceQuery({ workspaceId: workspace })),
    ).rejects.toThrow("inconsistent economic-state vector");
  });

  it("fails closed when a missing vector slot claims any run result", async () => {
    const forgedMissingSlot = {
      ...missingVectorDimensionRows[0],
      run_score: "50",
    };
    const transaction = transactionWith(async () =>
      rows([reportedVectorDimensionRow, forgedMissingSlot, ...missingVectorDimensionRows.slice(1)]),
    );
    const { service } = serviceWith(transaction);

    await expect(
      service.vector(principal, vector, parseStateResourceQuery({ workspaceId: workspace })),
    ).rejects.toThrow("inconsistent economic-state vector");
  });

  it("keeps insufficient data as a reported dimension with a null score", async () => {
    const insufficientDimension = {
      ...reportedVectorDimensionRow,
      scored_dimension_count: 0,
      insufficient_dimension_count: 1,
      scored_dimension_coverage: "0",
      run_status: "insufficient_data",
      run_score: null,
      run_missing_reason: "insufficient_component_coverage",
      run_renormalized: false,
    };
    const transaction = transactionWith(async () =>
      rows([insufficientDimension, ...missingVectorDimensionRows]),
    );
    const { service } = serviceWith(transaction);

    const result = await service.vector(
      principal,
      vector,
      parseStateResourceQuery({ workspaceId: workspace }),
    );

    expect(result.dimensions[0]).toMatchObject({
      dimension: "macroeconomic",
      missingReason: null,
      model: { id: model },
      run: {
        status: "insufficient_data",
        score: null,
        missingReason: "insufficient_component_coverage",
        renormalized: false,
      },
    });
  });

  it.each([
    {
      description: "a run bound to another artifact digest",
      row: { ...reportedVectorDimensionRow, run_model_artifact_sha256: "f".repeat(64) },
    },
    {
      description: "an unknown frozen artifact lifecycle",
      row: { ...reportedVectorDimensionRow, artifact_lifecycle_status: "production" },
    },
  ])("fails closed for $description", async ({ row }) => {
    const transaction = transactionWith(async () => rows([row, ...missingVectorDimensionRows]));
    const { service } = serviceWith(transaction);

    await expect(
      service.vector(principal, vector, parseStateResourceQuery({ workspaceId: workspace })),
    ).rejects.toThrow("inconsistent economic-state vector");
  });

  it("returns exact component results and governed provenance drill-down links", async () => {
    const calls: Array<{ readonly text: string; readonly values?: readonly unknown[] }> = [];
    const transaction = transactionWith(async (text, values) => {
      calls.push({ text, ...(values === undefined ? {} : { values }) });
      if (text.includes("FROM evidence.economic_state_component_results result")) {
        return rows([observedComponentRow, missingComponentRow]);
      }
      return rows([runRow]);
    });
    const { service } = serviceWith(transaction);

    const collection = await service.runComponents(
      principal,
      run,
      parseStateResourceQuery({ workspaceId: workspace }),
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.values).toEqual([organization, workspace, run]);
    expectRunApiServabilityGate(calls[0]?.text ?? "");
    expect(calls[1]?.text).toContain("result.organization_id = $1::uuid");
    expect(calls[1]?.text).toContain("result.workspace_id = $2::uuid");
    expectRunApiServabilityGate(calls[1]?.text ?? "");
    expect(calls[1]?.text).toContain("LIMIT 100");
    expect(calls[1]?.text).toContain('ORDER BY result.component_key COLLATE "C"');
    expect(collection.components[0]).toMatchObject({
      seriesId: series,
      parser: {
        name: "wdi-json-stat-v2",
        codeSha256: "f".repeat(64),
        configurationSha256: "1".repeat(64),
      },
      featureContractSha256: "2".repeat(64),
      rawValue: "75.123456789012345678",
      qualityEvidenceSha256: "d".repeat(64),
      sourceDatasetId: sourceDataset,
      licenseReviewId: licenseReview,
      sourceAdmissionDecisionId: sourceAdmissionDecision,
      legalEvidenceSha256: "5".repeat(64),
      legalEvidenceManifest: {
        schemaVersion: 1,
        action: "derive",
        observationId: observation,
        sourceId: source,
        sourceDatasetId: sourceDataset,
        licenseReview: { id: licenseReview, intendedUses: ["api", "derive"] },
        sourceAdmissionDecision: {
          id: sourceAdmissionDecision,
          sourceId: source,
          sourceDatasetId: sourceDataset,
          licenseReviewId: licenseReview,
          decision: "approved",
          permittedActions: ["api", "derive"],
        },
      },
      evidence: {
        observationId: observation,
        sourceId: source,
        provenance: `/api/v1/evidence/observations/${observation}/provenance`,
      },
    });
    expect(collection.components[1]).toMatchObject({
      missingReason: "not_collected",
      qualityEvidenceSha256: null,
      sourceDatasetId: null,
      licenseReviewId: null,
      sourceAdmissionDecisionId: null,
      legalEvidenceSha256: null,
      legalEvidenceManifest: null,
      evidence: null,
    });
  });

  it("fails closed if a run stops being servable between detail and component reads", async () => {
    let call = 0;
    const transaction = transactionWith(async () => {
      call += 1;
      return call === 1 ? rows([runRow]) : rows([]);
    });
    const { service } = serviceWith(transaction);

    await expect(
      service.runComponents(principal, run, parseStateResourceQuery({ workspaceId: workspace })),
    ).rejects.toThrow("Not Found");
  });

  const invalidLegalBindings = [
    {
      description: "an observed result with one missing legal identifier",
      row: { ...observedComponentRow, license_review_id: null },
      error: "inconsistent economic-state evidence binding",
    },
    {
      description: "a missing result that claims legal evidence",
      row: { ...missingComponentRow, source_dataset_id: sourceDataset },
      error: "inconsistent economic-state evidence binding",
    },
    {
      description: "a legal manifest bound to another observation",
      row: {
        ...observedComponentRow,
        legal_evidence_manifest: { ...legalEvidenceManifest, observationId: secondRun },
      },
      error: "inconsistent economic-state legal evidence manifest",
    },
  ] as const;

  it.each(invalidLegalBindings)("fails closed for $description", async ({ row, error }) => {
    const transaction = transactionWith(async (text) =>
      text.includes("FROM evidence.economic_state_component_results result")
        ? rows([row])
        : rows([runRow]),
    );
    const { service } = serviceWith(transaction);

    await expect(
      service.runComponents(principal, run, parseStateResourceQuery({ workspaceId: workspace })),
    ).rejects.toThrow(error);
  });

  it("uses a non-enumerating 404 for resources outside the exact scoped workspace", async () => {
    const transaction = transactionWith(async () => rows([]));
    const { service } = serviceWith(transaction);
    const query = parseStateResourceQuery({ workspaceId: workspace });

    await expect(service.model(principal, model, query)).rejects.toThrow("Not Found");
    await expect(service.run(principal, run, query)).rejects.toThrow("Not Found");
  });

  it("does not query state tables when active workspace membership is denied", async () => {
    const transaction = transactionWith(async () => rows([]));
    const database = {
      withPrincipal: vi.fn(async (_principal, operation) => operation(transaction)),
    };
    const access = {
      assertMembership: vi.fn(async () => {
        throw new Error("denied");
      }),
    };
    const service = new EconomicStateService(
      database as unknown as PostgresRuntime,
      access as unknown as WorkspaceAccessService,
      {
        assertEconomicStateAccess: vi.fn(async () => undefined),
      } as unknown as GovernedAuthorizationService,
    );

    await expect(
      service.models(principal, parseStatePageQuery({ workspaceId: workspace })),
    ).rejects.toThrow("denied");
    expect(transaction.query).not.toHaveBeenCalled();
  });

  it("does not query state resources when governed authorization is denied", async () => {
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
    const service = new EconomicStateService(
      database as unknown as PostgresRuntime,
      access as unknown as WorkspaceAccessService,
      authorization as unknown as GovernedAuthorizationService,
    );

    await expect(
      service.models(principal, parseStatePageQuery({ workspaceId: workspace })),
    ).rejects.toThrow("denied");
    expect(access.assertMembership).toHaveBeenCalledWith(principal, workspace, transaction);
    expect(transaction.query).not.toHaveBeenCalled();
  });
});

function serviceWith(transaction: TenantTransaction): {
  readonly service: EconomicStateService;
  readonly access: { readonly assertMembership: ReturnType<typeof vi.fn> };
} {
  const database = {
    withPrincipal: vi.fn(async (_principal, operation) => operation(transaction)),
  };
  const access = { assertMembership: vi.fn(async () => workspaceId(workspace)) };
  const authorization = { assertEconomicStateAccess: vi.fn(async () => undefined) };
  return {
    service: new EconomicStateService(
      database as unknown as PostgresRuntime,
      access as unknown as WorkspaceAccessService,
      authorization as unknown as GovernedAuthorizationService,
    ),
    access,
  };
}

function transactionWith(
  responder: (
    text: string,
    values?: readonly unknown[],
  ) => Promise<QueryResult<Record<string, unknown>>>,
): TenantTransaction & { readonly query: ReturnType<typeof vi.fn> } {
  const query = vi.fn(async (text: string, values?: readonly unknown[]) => responder(text, values));
  return { query } as unknown as TenantTransaction & {
    readonly query: ReturnType<typeof vi.fn>;
  };
}

function rows<Row extends Record<string, unknown>>(values: readonly Row[]): QueryResult<Row> {
  return { rows: values, rowCount: values.length };
}

function expectRunApiServabilityGate(sql: string): void {
  expect(sql).toContain("evidence.economic_state_run_is_currently_servable(run.id, 'api')");
  expect(sql).not.toContain("FROM evidence.source_datasets");
  expect(sql).not.toContain("FROM evidence.sources");
}
