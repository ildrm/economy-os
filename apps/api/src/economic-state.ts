import type { Principal } from "@economyos/contracts";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PostgresRuntime, type TenantTransaction } from "./database.js";
import { GovernedAuthorizationService } from "./governed-authorization.js";
import { WorkspaceAccessService } from "./workspaces.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_QUERY_FIELDS = new Set(["workspaceId", "cursor", "limit"]);
const RUN_QUERY_FIELDS = new Set([
  "workspaceId",
  "cursor",
  "limit",
  "modelId",
  "geographyId",
  "status",
]);
const RESOURCE_QUERY_FIELDS = new Set(["workspaceId"]);
const RUN_STATUSES = ["complete", "partial", "insufficient_data"] as const;
const STATE_VECTOR_DIMENSIONS = [
  "macroeconomic",
  "human_economic",
  "financial_system",
  "market",
  "regime",
] as const;
const STATE_ARTIFACT_LIFECYCLE_STATUSES = [
  "research",
  "validated",
  "approved",
  "restricted",
  "retired",
] as const;

export type EconomicStateRunStatus = (typeof RUN_STATUSES)[number];

export interface StatePageQuery {
  readonly workspaceId: string;
  readonly cursor?: string;
  readonly limit: number;
}

export interface StateRunPageQuery extends StatePageQuery {
  readonly modelId?: string;
  readonly geographyId?: string;
  readonly status?: EconomicStateRunStatus;
}

export interface StateResourceQuery {
  readonly workspaceId: string;
}

export interface StateModel {
  readonly id: string;
  readonly key: string;
  readonly version: string;
  readonly dimension: string;
  readonly governanceSchemaVersion: 1 | 2;
  readonly modelArtifactId: string | null;
  readonly modelArtifactSha256: string | null;
  readonly minimumCoverage: string;
  readonly definitionSha256: string;
  readonly componentCount: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly links: {
    readonly self: string;
    readonly components: string;
  };
}

export interface StateModelPage {
  readonly count: number;
  readonly nextCursor: string | null;
  readonly models: readonly StateModel[];
}

export interface StateModelComponent {
  readonly key: string;
  readonly concept: {
    readonly id: string;
    readonly canonicalKey: string;
    readonly name: string;
  };
  readonly seriesId: string | null;
  readonly unitCode: string | null;
  readonly frequency: string | null;
  readonly seasonalAdjustment: string | null;
  readonly parser: StateComponentParser | null;
  readonly featureContractSha256: string | null;
  readonly weight: string;
  readonly polarity: string;
  readonly lowerBound: string;
  readonly upperBound: string;
  readonly createdAt: string;
}

export interface StateComponentParser {
  readonly name: string;
  readonly version: string;
  readonly codeSha256: string;
  readonly configurationSha256: string;
}

export interface StateModelComponentCollection {
  readonly modelId: string;
  readonly count: number;
  readonly components: readonly StateModelComponent[];
}

export interface StateRun {
  readonly id: string;
  readonly model: {
    readonly id: string;
    readonly key: string;
    readonly version: string;
    readonly dimension: string;
    readonly governanceSchemaVersion: 1 | 2;
    readonly definitionSha256: string;
  };
  readonly modelArtifactId: string | null;
  readonly modelArtifactSha256: string | null;
  readonly snapshot: {
    readonly id: string;
    readonly manifestSha256: string;
  };
  readonly geography: {
    readonly id: string;
    readonly codeScheme: string;
    readonly code: string;
    readonly name: string;
  };
  readonly pointInTime: {
    readonly knownAt: string;
    readonly policy: string;
    readonly systemAt: string | null;
  };
  readonly status: EconomicStateRunStatus;
  readonly score: string | null;
  readonly missingReason: string | null;
  readonly completeness: string;
  readonly sourceCoverage: string;
  readonly confidence: string;
  readonly distinctSourceCount: number;
  readonly renormalized: boolean;
  readonly resultManifestSha256: string;
  readonly calculatedBy: string;
  readonly calculatedAt: string;
  readonly links: {
    readonly self: string;
    readonly model: string;
    readonly components: string;
  };
}

export interface StateRunPage {
  readonly count: number;
  readonly nextCursor: string | null;
  readonly runs: readonly StateRun[];
}

export interface StateEvidenceLink {
  readonly observationId: string;
  readonly sourceId: string;
  readonly provenance: string;
}

export interface StateLicenseReviewEvidence {
  readonly id: string;
  readonly sourceSlug: string;
  readonly datasetExternalKey: string | null;
  readonly evidenceUri: string;
  readonly licenseExpression: string;
  readonly intendedUses: readonly string[];
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly evidenceSha256: string;
  readonly reviewedBy: string;
  readonly reviewedAt: string;
  readonly expiresAt: string | null;
  readonly createdAt: string;
}

export interface StateSourceAdmissionDecisionEvidence {
  readonly id: string;
  readonly organizationId: string | null;
  readonly sourceId: string;
  readonly sourceDatasetId: string | null;
  readonly decision: string;
  readonly permittedActions: readonly string[];
  readonly licenseReviewId: string;
  readonly reason: string;
  readonly decidedBy: string;
  readonly decidedAt: string;
  readonly recordedAt: string;
}

export interface StateLegalEvidenceManifest {
  readonly schemaVersion: 1;
  readonly action: "derive";
  readonly organizationId: string;
  readonly observationId: string;
  readonly sourceId: string;
  readonly sourceDatasetId: string;
  readonly licenseReview: StateLicenseReviewEvidence;
  readonly sourceAdmissionDecision: StateSourceAdmissionDecisionEvidence;
}

export interface StateRunComponent {
  readonly key: string;
  readonly concept: {
    readonly id: string;
    readonly canonicalKey: string;
    readonly name: string;
  };
  readonly seriesId: string | null;
  readonly unitCode: string | null;
  readonly frequency: string | null;
  readonly seasonalAdjustment: string | null;
  readonly parser: StateComponentParser | null;
  readonly featureContractSha256: string | null;
  readonly weight: string;
  readonly polarity: string;
  readonly lowerBound: string;
  readonly upperBound: string;
  readonly rawValue: string | null;
  readonly normalizedValue: string | null;
  readonly contribution: string | null;
  readonly missingReason: string | null;
  readonly quality: string | null;
  readonly qualityEvidenceSha256: string | null;
  readonly sourceDatasetId: string | null;
  readonly licenseReviewId: string | null;
  readonly sourceAdmissionDecisionId: string | null;
  readonly legalEvidenceSha256: string | null;
  readonly legalEvidenceManifest: StateLegalEvidenceManifest | null;
  readonly evidence: StateEvidenceLink | null;
}

export interface StateRunComponentCollection {
  readonly runId: string;
  readonly count: number;
  readonly components: readonly StateRunComponent[];
}

export type StateVectorDimensionName = (typeof STATE_VECTOR_DIMENSIONS)[number];
export type StateArtifactLifecycleStatus = (typeof STATE_ARTIFACT_LIFECYCLE_STATUSES)[number];

export interface StateVectorArtifact {
  readonly id: string;
  readonly sha256: string;
  readonly algorithmKey: string;
  readonly algorithmVersion: string;
  readonly configurationSha256: string;
  readonly normalizationSha256: string;
  readonly assumptionsSha256: string;
  readonly approvalSha256: string;
  readonly lifecycleStatus: StateArtifactLifecycleStatus;
}

export interface StateVectorModel {
  readonly id: string;
  readonly key: string;
  readonly version: string;
  readonly dimension: StateVectorDimensionName;
  readonly governanceSchemaVersion: 2;
  readonly definitionSha256: string;
  readonly artifact: StateVectorArtifact;
  readonly links: {
    readonly self: string;
    readonly components: string;
  };
}

export interface StateVectorRun {
  readonly id: string;
  readonly modelDefinitionSha256: string;
  readonly modelArtifactId: string;
  readonly modelArtifactSha256: string;
  readonly status: EconomicStateRunStatus;
  readonly score: string | null;
  readonly missingReason: string | null;
  readonly completeness: string;
  readonly sourceCoverage: string;
  readonly confidence: string;
  readonly distinctSourceCount: number;
  readonly renormalized: boolean;
  readonly resultManifestSha256: string;
  readonly calculatedBy: string;
  readonly calculatedAt: string;
  readonly links: {
    readonly self: string;
    readonly components: string;
  };
}

export interface StateVectorDimension {
  readonly ordinal: number;
  readonly dimension: StateVectorDimensionName;
  readonly model: StateVectorModel | null;
  readonly run: StateVectorRun | null;
  readonly missingReason: string | null;
}

export interface StateVectorDiagnostics {
  readonly dimensionCount: 5;
  readonly reportedDimensionCount: number;
  readonly scoredDimensionCount: number;
  readonly insufficientDimensionCount: number;
  readonly missingDimensionCount: number;
  readonly dimensionCoverage: string;
  readonly scoredDimensionCoverage: string;
  readonly evidenceCoverage: string;
  readonly confidenceCoverage: string;
  readonly evidenceQuality: string | null;
  readonly reportedComponentCount: number;
  readonly observedComponentCount: number;
  readonly distinctSourceCount: number;
  readonly distinctSourceCoverage: string | null;
}

export interface StateVector {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly methodologyScope: "research_baseline";
  readonly geography: {
    readonly id: string;
    readonly kind: string;
    readonly codeScheme: string;
    readonly code: string;
    readonly name: string;
  };
  readonly snapshot: {
    readonly id: string;
    readonly manifestSha256: string;
  };
  readonly pointInTime: {
    readonly knownAt: string;
    readonly policy: string;
    readonly systemAt: string | null;
  };
  readonly contextSha256: string;
  readonly diagnostics: StateVectorDiagnostics;
  readonly dimensions: readonly StateVectorDimension[];
  readonly stateManifestSha256: string;
  readonly assembledBy: string;
  readonly assembledAt: string;
  readonly links: {
    readonly self: string;
  };
}

interface StateModelRow extends Record<string, unknown> {
  readonly id: string;
  readonly model_key: string;
  readonly model_version: string;
  readonly dimension: string;
  readonly governance_schema_version: 1 | 2;
  readonly model_artifact_id: string | null;
  readonly model_artifact_sha256: string | null;
  readonly minimum_coverage: string;
  readonly definition_sha256: string;
  readonly component_count: number;
  readonly created_by: string;
  readonly created_at: string;
}

interface StateModelComponentRow extends Record<string, unknown> {
  readonly component_key: string;
  readonly concept_id: string;
  readonly canonical_key: string;
  readonly concept_name: string;
  readonly series_id: string | null;
  readonly unit_code: string | null;
  readonly frequency: string | null;
  readonly seasonal_adjustment: string | null;
  readonly parser_name: string | null;
  readonly parser_version: string | null;
  readonly parser_code_sha256: string | null;
  readonly parser_configuration_sha256: string | null;
  readonly feature_contract_sha256: string | null;
  readonly weight: string;
  readonly polarity: string;
  readonly lower_bound: string;
  readonly upper_bound: string;
  readonly created_at: string;
}

interface StateRunRow extends Record<string, unknown> {
  readonly id: string;
  readonly snapshot_id: string;
  readonly snapshot_manifest_sha256: string;
  readonly model_id: string;
  readonly model_key: string;
  readonly model_version: string;
  readonly dimension: string;
  readonly governance_schema_version: 1 | 2;
  readonly model_definition_sha256: string;
  readonly model_artifact_id: string | null;
  readonly model_artifact_sha256: string | null;
  readonly geography_id: string;
  readonly geography_code_scheme: string;
  readonly geography_code: string;
  readonly geography_name: string;
  readonly known_at: string;
  readonly policy: string;
  readonly system_at: string | null;
  readonly status: EconomicStateRunStatus;
  readonly score: string | null;
  readonly missing_reason: string | null;
  readonly completeness: string;
  readonly source_coverage: string;
  readonly confidence: string;
  readonly independent_source_count: number;
  readonly renormalized: boolean;
  readonly result_manifest_sha256: string;
  readonly calculated_by: string;
  readonly calculated_at: string;
}

interface StateRunComponentRow extends StateModelComponentRow {
  readonly result_organization_id: string;
  readonly observation_id: string | null;
  readonly source_id: string | null;
  readonly source_dataset_id: string | null;
  readonly license_review_id: string | null;
  readonly source_admission_event_id: string | null;
  readonly legal_evidence_manifest: unknown | null;
  readonly legal_evidence_sha256: string | null;
  readonly raw_value: string | null;
  readonly normalized_value: string | null;
  readonly contribution: string | null;
  readonly missing_reason: string | null;
  readonly quality: string | null;
  readonly quality_evidence_sha256: string | null;
}

interface StateVectorRow extends Record<string, unknown> {
  readonly vector_id: string;
  readonly geography_id: string;
  readonly geography_kind: string;
  readonly geography_code_scheme: string;
  readonly geography_code: string;
  readonly geography_name: string;
  readonly snapshot_id: string;
  readonly snapshot_manifest_sha256: string;
  readonly known_at: string;
  readonly policy: string;
  readonly system_at: string | null;
  readonly context_sha256: string;
  readonly dimension_count: number;
  readonly reported_dimension_count: number;
  readonly scored_dimension_count: number;
  readonly insufficient_dimension_count: number;
  readonly missing_dimension_count: number;
  readonly dimension_coverage: string;
  readonly scored_dimension_coverage: string;
  readonly evidence_coverage: string;
  readonly confidence_coverage: string;
  readonly evidence_quality: string | null;
  readonly reported_component_count: number;
  readonly observed_component_count: number;
  readonly distinct_source_count: number;
  readonly distinct_source_coverage: string | null;
  readonly state_manifest_sha256: string;
  readonly assembled_by: string;
  readonly assembled_at: string;
  readonly ordinal: number;
  readonly dimension: string;
  readonly slot_missing_reason: string | null;
  readonly model_id: string | null;
  readonly model_key: string | null;
  readonly model_version: string | null;
  readonly model_dimension: string | null;
  readonly governance_schema_version: number | null;
  readonly model_definition_sha256: string | null;
  readonly artifact_id: string | null;
  readonly artifact_sha256: string | null;
  readonly artifact_algorithm_key: string | null;
  readonly artifact_algorithm_version: string | null;
  readonly artifact_configuration_sha256: string | null;
  readonly artifact_normalization_sha256: string | null;
  readonly artifact_assumptions_sha256: string | null;
  readonly artifact_approval_sha256: string | null;
  readonly artifact_lifecycle_status: string | null;
  readonly state_run_id: string | null;
  readonly run_model_definition_sha256: string | null;
  readonly run_model_artifact_id: string | null;
  readonly run_model_artifact_sha256: string | null;
  readonly run_status: string | null;
  readonly run_score: string | null;
  readonly run_missing_reason: string | null;
  readonly run_completeness: string | null;
  readonly run_source_coverage: string | null;
  readonly run_confidence: string | null;
  readonly run_distinct_source_count: number | null;
  readonly run_renormalized: boolean | null;
  readonly run_result_manifest_sha256: string | null;
  readonly run_calculated_by: string | null;
  readonly run_calculated_at: string | null;
}

export function parseStatePageQuery(raw: Readonly<Record<string, unknown>>): StatePageQuery {
  assertOnlyFields(raw, PAGE_QUERY_FIELDS);
  return Object.freeze({
    workspaceId: uuidField(raw.workspaceId, "workspaceId"),
    ...optionalUuidProperty(raw.cursor, "cursor"),
    limit: boundedIntegerField(raw.limit, "limit", 50, 1, 100),
  });
}

export function parseStateRunPageQuery(raw: Readonly<Record<string, unknown>>): StateRunPageQuery {
  assertOnlyFields(raw, RUN_QUERY_FIELDS);
  const statusValue = optionalStringField(raw.status, "status");
  if (statusValue !== undefined && !RUN_STATUSES.includes(statusValue as EconomicStateRunStatus)) {
    invalidRequest("status");
  }
  return Object.freeze({
    workspaceId: uuidField(raw.workspaceId, "workspaceId"),
    ...optionalUuidProperty(raw.cursor, "cursor"),
    ...optionalUuidProperty(raw.modelId, "modelId"),
    ...optionalUuidProperty(raw.geographyId, "geographyId"),
    ...(statusValue === undefined ? {} : { status: statusValue as EconomicStateRunStatus }),
    limit: boundedIntegerField(raw.limit, "limit", 50, 1, 100),
  });
}

export function parseStateResourceQuery(
  raw: Readonly<Record<string, unknown>>,
): StateResourceQuery {
  assertOnlyFields(raw, RESOURCE_QUERY_FIELDS);
  return Object.freeze({ workspaceId: uuidField(raw.workspaceId, "workspaceId") });
}

export function parseStateResourceId(value: string, field: string): string {
  return uuidField(value, field);
}

@Injectable()
export class EconomicStateService {
  constructor(
    @Inject(PostgresRuntime) private readonly database: PostgresRuntime,
    @Inject(WorkspaceAccessService) private readonly workspaceAccess: WorkspaceAccessService,
    @Inject(GovernedAuthorizationService)
    private readonly governedAuthorization: GovernedAuthorizationService,
  ) {}

  async models(principal: Principal, query: StatePageQuery): Promise<StateModelPage> {
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.authorize(principal, query.workspaceId, transaction);
      const result = await transaction.query<StateModelRow>(MODEL_LIST_SQL, [
        principal.organizationId,
        query.workspaceId,
        query.cursor ?? null,
        query.limit + 1,
      ]);
      const pageRows = result.rows.slice(0, query.limit);
      return Object.freeze({
        count: pageRows.length,
        nextCursor: result.rows.length > query.limit ? (pageRows.at(-1)?.id ?? null) : null,
        models: Object.freeze(pageRows.map((row) => mapModel(row, query.workspaceId))),
      });
    });
  }

  async model(
    principal: Principal,
    requestedModelId: string,
    query: StateResourceQuery,
  ): Promise<StateModel> {
    const modelId = parseStateResourceId(requestedModelId, "modelId");
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.authorize(principal, query.workspaceId, transaction);
      return mapModel(
        await this.requireModel(transaction, principal.organizationId, query.workspaceId, modelId),
        query.workspaceId,
      );
    });
  }

  async modelComponents(
    principal: Principal,
    requestedModelId: string,
    query: StateResourceQuery,
  ): Promise<StateModelComponentCollection> {
    const modelId = parseStateResourceId(requestedModelId, "modelId");
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.authorize(principal, query.workspaceId, transaction);
      await this.requireModel(transaction, principal.organizationId, query.workspaceId, modelId);
      const result = await transaction.query<StateModelComponentRow>(MODEL_COMPONENTS_SQL, [
        principal.organizationId,
        query.workspaceId,
        modelId,
      ]);
      const components = result.rows.map(mapModelComponent);
      return Object.freeze({
        modelId,
        count: components.length,
        components: Object.freeze(components),
      });
    });
  }

  async runs(principal: Principal, query: StateRunPageQuery): Promise<StateRunPage> {
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.authorize(principal, query.workspaceId, transaction);
      const result = await transaction.query<StateRunRow>(RUN_LIST_SQL, [
        principal.organizationId,
        query.workspaceId,
        query.modelId ?? null,
        query.geographyId ?? null,
        query.status ?? null,
        query.cursor ?? null,
        query.limit + 1,
      ]);
      const pageRows = result.rows.slice(0, query.limit);
      return Object.freeze({
        count: pageRows.length,
        nextCursor: result.rows.length > query.limit ? (pageRows.at(-1)?.id ?? null) : null,
        runs: Object.freeze(pageRows.map((row) => mapRun(row, query.workspaceId))),
      });
    });
  }

  async run(
    principal: Principal,
    requestedRunId: string,
    query: StateResourceQuery,
  ): Promise<StateRun> {
    const runId = parseStateResourceId(requestedRunId, "runId");
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.authorize(principal, query.workspaceId, transaction);
      return mapRun(
        await this.requireRun(transaction, principal.organizationId, query.workspaceId, runId),
        query.workspaceId,
      );
    });
  }

  async runComponents(
    principal: Principal,
    requestedRunId: string,
    query: StateResourceQuery,
  ): Promise<StateRunComponentCollection> {
    const runId = parseStateResourceId(requestedRunId, "runId");
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.authorize(principal, query.workspaceId, transaction);
      await this.requireRun(transaction, principal.organizationId, query.workspaceId, runId);
      const result = await transaction.query<StateRunComponentRow>(RUN_COMPONENTS_SQL, [
        principal.organizationId,
        query.workspaceId,
        runId,
      ]);
      if (result.rows.length === 0) throw stateNotFound();
      const components = result.rows.map(mapRunComponent);
      return Object.freeze({
        runId,
        count: components.length,
        components: Object.freeze(components),
      });
    });
  }

  async vector(
    principal: Principal,
    requestedVectorId: string,
    query: StateResourceQuery,
  ): Promise<StateVector> {
    const vectorId = parseStateResourceId(requestedVectorId, "vectorId");
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.authorize(principal, query.workspaceId, transaction);
      const result = await transaction.query<StateVectorRow>(VECTOR_BY_ID_SQL, [
        principal.organizationId,
        query.workspaceId,
        vectorId,
      ]);
      if (result.rows.length === 0) throw stateNotFound();
      return mapVector(result.rows, query.workspaceId);
    });
  }

  private authorize(
    principal: Principal,
    workspaceId: string,
    transaction: TenantTransaction,
  ): Promise<void> {
    return this.authorizeGovernedState(principal, workspaceId, transaction);
  }

  private async authorizeGovernedState(
    principal: Principal,
    workspaceId: string,
    transaction: TenantTransaction,
  ): Promise<void> {
    await this.workspaceAccess.assertMembership(principal, workspaceId, transaction);
    await this.governedAuthorization.assertEconomicStateAccess(principal, workspaceId, transaction);
  }

  private async requireModel(
    transaction: TenantTransaction,
    organizationId: string,
    workspaceId: string,
    modelId: string,
  ): Promise<StateModelRow> {
    const result = await transaction.query<StateModelRow>(MODEL_BY_ID_SQL, [
      organizationId,
      workspaceId,
      modelId,
    ]);
    const model = result.rows[0];
    if (!model) throw stateNotFound();
    return model;
  }

  private async requireRun(
    transaction: TenantTransaction,
    organizationId: string,
    workspaceId: string,
    runId: string,
  ): Promise<StateRunRow> {
    const result = await transaction.query<StateRunRow>(RUN_BY_ID_SQL, [
      organizationId,
      workspaceId,
      runId,
    ]);
    const run = result.rows[0];
    if (!run) throw stateNotFound();
    return run;
  }
}

const MODEL_PROJECTION = `
  model.id::text,
  model.model_key,
  model.model_version,
  model.dimension,
  model.governance_schema_version,
  model.model_artifact_id::text,
  model.model_artifact_sha256,
  model.minimum_coverage,
  model.definition_sha256,
  component_count.value AS component_count,
  model.created_by::text,
  to_char(model.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
`;

const MODEL_FROM = `
  FROM evidence.economic_state_models model
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS value
    FROM evidence.economic_state_model_components component
    WHERE component.organization_id = model.organization_id
      AND component.workspace_id = model.workspace_id
      AND component.model_id = model.id
  ) component_count
`;

const MODEL_LIST_SQL = `
  SELECT ${MODEL_PROJECTION}
  ${MODEL_FROM}
  WHERE model.organization_id = $1::uuid
    AND model.workspace_id = $2::uuid
    AND ($3::uuid IS NULL OR model.id > $3::uuid)
  ORDER BY model.id
  LIMIT $4::integer
`;

const MODEL_BY_ID_SQL = `
  SELECT ${MODEL_PROJECTION}
  ${MODEL_FROM}
  WHERE model.organization_id = $1::uuid
    AND model.workspace_id = $2::uuid
    AND model.id = $3::uuid
`;

const MODEL_COMPONENTS_SQL = `
  SELECT
    component.component_key,
    component.concept_id::text,
    concept.canonical_key,
    concept.name AS concept_name,
    component.series_id::text,
    component.unit_code,
    component.frequency,
    component.seasonal_adjustment,
    component.parser_name,
    component.parser_version,
    component.parser_code_sha256,
    component.parser_configuration_sha256,
    component.feature_contract_sha256,
    component.weight,
    component.polarity,
    component.lower_bound,
    component.upper_bound,
    to_char(component.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      AS created_at
  FROM evidence.economic_state_model_components component
  JOIN evidence.concepts concept ON concept.id = component.concept_id
  WHERE component.organization_id = $1::uuid
    AND component.workspace_id = $2::uuid
    AND component.model_id = $3::uuid
  ORDER BY component.component_key COLLATE "C"
  LIMIT 100
`;

const RUN_PROJECTION = `
  run.id::text,
  run.snapshot_id::text,
  run.snapshot_manifest_sha256,
  run.model_id::text,
  model.model_key,
  run.model_version,
  model.dimension,
  model.governance_schema_version,
  run.model_definition_sha256,
  run.model_artifact_id::text,
  run.model_artifact_sha256,
  run.geography_id::text,
  geography.code_scheme AS geography_code_scheme,
  geography.code AS geography_code,
  geography.name AS geography_name,
  to_char(run.known_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS known_at,
  run.policy,
  CASE WHEN run.system_at IS NULL THEN NULL ELSE
    to_char(run.system_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS system_at,
  run.status,
  run.score,
  run.missing_reason,
  run.completeness,
  run.source_coverage,
  run.confidence,
  run.independent_source_count,
  run.renormalized,
  run.result_manifest_sha256,
  run.calculated_by::text,
  to_char(run.calculated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    AS calculated_at
`;

const RUN_FROM = `
  FROM evidence.economic_state_runs run
  JOIN evidence.economic_state_models model
    ON model.organization_id = run.organization_id
    AND model.workspace_id = run.workspace_id
    AND model.id = run.model_id
  JOIN evidence.geographies geography ON geography.id = run.geography_id
`;

const RUN_API_SERVABILITY_PREDICATE = `
  AND evidence.economic_state_run_is_currently_servable(run.id, 'api')
`;

const RUN_LIST_SQL = `
  SELECT ${RUN_PROJECTION}
  ${RUN_FROM}
  WHERE run.organization_id = $1::uuid
    AND run.workspace_id = $2::uuid
    ${RUN_API_SERVABILITY_PREDICATE}
    AND ($3::uuid IS NULL OR run.model_id = $3::uuid)
    AND ($4::uuid IS NULL OR run.geography_id = $4::uuid)
    AND ($5::text IS NULL OR run.status = $5::text)
    AND ($6::uuid IS NULL OR run.id > $6::uuid)
  ORDER BY run.id
  LIMIT $7::integer
`;

const RUN_BY_ID_SQL = `
  SELECT ${RUN_PROJECTION}
  ${RUN_FROM}
  WHERE run.organization_id = $1::uuid
    AND run.workspace_id = $2::uuid
    ${RUN_API_SERVABILITY_PREDICATE}
    AND run.id = $3::uuid
`;

const RUN_COMPONENTS_SQL = `
  SELECT
    result.organization_id::text AS result_organization_id,
    definition.component_key,
    definition.concept_id::text,
    concept.canonical_key,
    concept.name AS concept_name,
    definition.series_id::text,
    definition.unit_code,
    definition.frequency,
    definition.seasonal_adjustment,
    definition.parser_name,
    definition.parser_version,
    definition.parser_code_sha256,
    definition.parser_configuration_sha256,
    definition.feature_contract_sha256,
    definition.weight,
    definition.polarity,
    definition.lower_bound,
    definition.upper_bound,
    to_char(result.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      AS created_at,
    result.observation_id::text,
    result.source_id::text,
    result.source_dataset_id::text,
    result.license_review_id::text,
    result.source_admission_event_id::text,
    result.legal_evidence_manifest,
    result.legal_evidence_sha256,
    result.raw_value,
    result.normalized_value,
    result.contribution,
    result.missing_reason,
    result.quality,
    result.quality_evidence_sha256
  FROM evidence.economic_state_component_results result
  JOIN evidence.economic_state_runs run
    ON run.organization_id = result.organization_id
    AND run.workspace_id = result.workspace_id
    AND run.id = result.run_id
    AND run.model_id = result.model_id
  JOIN evidence.economic_state_model_components definition
    ON definition.organization_id = result.organization_id
    AND definition.workspace_id = result.workspace_id
    AND definition.model_id = result.model_id
    AND definition.component_key = result.component_key
  JOIN evidence.concepts concept ON concept.id = definition.concept_id
  WHERE result.organization_id = $1::uuid
    AND result.workspace_id = $2::uuid
    AND result.run_id = $3::uuid
    ${RUN_API_SERVABILITY_PREDICATE}
  ORDER BY result.component_key COLLATE "C"
  LIMIT 100
`;

const VECTOR_BY_ID_SQL = `
  WITH servable_vector AS MATERIALIZED (
    SELECT vector.*
    FROM evidence.economic_state_vectors vector
    WHERE vector.organization_id = $1::uuid
      AND vector.workspace_id = $2::uuid
      AND vector.id = $3::uuid
      AND NOT EXISTS (
        SELECT 1
        FROM evidence.economic_state_vector_dimensions reported
        WHERE reported.organization_id = vector.organization_id
          AND reported.workspace_id = vector.workspace_id
          AND reported.vector_id = vector.id
          AND reported.state_run_id IS NOT NULL
          AND evidence.economic_state_run_is_currently_servable(reported.state_run_id, 'api') IS NOT TRUE
      )
  )
  SELECT
    vector.id::text AS vector_id,
    vector.geography_id::text,
    geography.kind AS geography_kind,
    geography.code_scheme AS geography_code_scheme,
    geography.code AS geography_code,
    geography.name AS geography_name,
    vector.snapshot_id::text,
    vector.snapshot_manifest_sha256,
    to_char(vector.known_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      AS known_at,
    vector.policy,
    CASE WHEN vector.system_at IS NULL THEN NULL ELSE
      to_char(vector.system_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    END AS system_at,
    vector.context_sha256,
    vector.dimension_count,
    vector.reported_dimension_count,
    vector.scored_dimension_count,
    vector.insufficient_dimension_count,
    vector.missing_dimension_count,
    vector.dimension_coverage,
    vector.scored_dimension_coverage,
    vector.evidence_coverage,
    vector.confidence_coverage,
    vector.evidence_quality,
    vector.reported_component_count,
    vector.observed_component_count,
    vector.distinct_source_count,
    vector.distinct_source_coverage,
    vector.state_manifest_sha256,
    vector.assembled_by::text,
    to_char(vector.assembled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      AS assembled_at,
    slot.ordinal,
    slot.dimension,
    slot.missing_reason AS slot_missing_reason,
    model.id::text AS model_id,
    model.model_key,
    model.model_version,
    model.dimension AS model_dimension,
    model.governance_schema_version,
    model.definition_sha256 AS model_definition_sha256,
    artifact.id::text AS artifact_id,
    artifact.artifact_sha256,
    artifact.algorithm_key AS artifact_algorithm_key,
    artifact.algorithm_version AS artifact_algorithm_version,
    artifact.configuration_sha256 AS artifact_configuration_sha256,
    artifact.normalization_sha256 AS artifact_normalization_sha256,
    artifact.assumptions_sha256 AS artifact_assumptions_sha256,
    artifact.approval_sha256 AS artifact_approval_sha256,
    artifact.lifecycle_status AS artifact_lifecycle_status,
    run.id::text AS state_run_id,
    run.model_definition_sha256 AS run_model_definition_sha256,
    run.model_artifact_id::text AS run_model_artifact_id,
    run.model_artifact_sha256 AS run_model_artifact_sha256,
    run.status AS run_status,
    run.score AS run_score,
    run.missing_reason AS run_missing_reason,
    run.completeness AS run_completeness,
    run.source_coverage AS run_source_coverage,
    run.confidence AS run_confidence,
    run.independent_source_count AS run_distinct_source_count,
    run.renormalized AS run_renormalized,
    run.result_manifest_sha256 AS run_result_manifest_sha256,
    run.calculated_by::text AS run_calculated_by,
    CASE WHEN run.calculated_at IS NULL THEN NULL ELSE
      to_char(run.calculated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    END AS run_calculated_at
  FROM servable_vector vector
  JOIN evidence.geographies geography ON geography.id = vector.geography_id
  JOIN evidence.economic_state_vector_dimensions slot
    ON slot.organization_id = vector.organization_id
    AND slot.workspace_id = vector.workspace_id
    AND slot.vector_id = vector.id
  LEFT JOIN evidence.economic_state_models model
    ON model.organization_id = slot.organization_id
    AND model.workspace_id = slot.workspace_id
    AND model.id = slot.model_id
  LEFT JOIN evidence.economic_state_model_artifacts artifact
    ON artifact.organization_id = model.organization_id
    AND artifact.workspace_id = model.workspace_id
    AND artifact.id = model.model_artifact_id
    AND artifact.artifact_sha256 = model.model_artifact_sha256
  LEFT JOIN evidence.economic_state_runs run
    ON run.organization_id = slot.organization_id
    AND run.workspace_id = slot.workspace_id
    AND run.id = slot.state_run_id
    AND run.model_id = slot.model_id
  ORDER BY slot.ordinal
  LIMIT 6
`;

function mapModel(row: StateModelRow, workspaceId: string): StateModel {
  const resource = `/api/v1/economic-state/models/${row.id}`;
  return Object.freeze({
    id: row.id,
    key: row.model_key,
    version: row.model_version,
    dimension: row.dimension,
    governanceSchemaVersion: row.governance_schema_version,
    modelArtifactId: row.model_artifact_id,
    modelArtifactSha256: row.model_artifact_sha256,
    minimumCoverage: row.minimum_coverage,
    definitionSha256: row.definition_sha256,
    componentCount: row.component_count,
    createdBy: row.created_by,
    createdAt: row.created_at,
    links: Object.freeze({
      self: withWorkspace(resource, workspaceId),
      components: withWorkspace(`${resource}/components`, workspaceId),
    }),
  });
}

function mapModelComponent(row: StateModelComponentRow): StateModelComponent {
  return Object.freeze({
    key: row.component_key,
    concept: Object.freeze({
      id: row.concept_id,
      canonicalKey: row.canonical_key,
      name: row.concept_name,
    }),
    seriesId: row.series_id,
    unitCode: row.unit_code,
    frequency: row.frequency,
    seasonalAdjustment: row.seasonal_adjustment,
    parser: mapParser(row),
    featureContractSha256: row.feature_contract_sha256,
    weight: row.weight,
    polarity: row.polarity,
    lowerBound: row.lower_bound,
    upperBound: row.upper_bound,
    createdAt: row.created_at,
  });
}

function mapRun(row: StateRunRow, workspaceId: string): StateRun {
  const resource = `/api/v1/economic-state/runs/${row.id}`;
  return Object.freeze({
    id: row.id,
    model: Object.freeze({
      id: row.model_id,
      key: row.model_key,
      version: row.model_version,
      dimension: row.dimension,
      governanceSchemaVersion: row.governance_schema_version,
      definitionSha256: row.model_definition_sha256,
    }),
    modelArtifactId: row.model_artifact_id,
    modelArtifactSha256: row.model_artifact_sha256,
    snapshot: Object.freeze({
      id: row.snapshot_id,
      manifestSha256: row.snapshot_manifest_sha256,
    }),
    geography: Object.freeze({
      id: row.geography_id,
      codeScheme: row.geography_code_scheme,
      code: row.geography_code,
      name: row.geography_name,
    }),
    pointInTime: Object.freeze({
      knownAt: row.known_at,
      policy: row.policy,
      systemAt: row.system_at,
    }),
    status: row.status,
    score: row.score,
    missingReason: row.missing_reason,
    completeness: row.completeness,
    sourceCoverage: row.source_coverage,
    confidence: row.confidence,
    distinctSourceCount: row.independent_source_count,
    renormalized: row.renormalized,
    resultManifestSha256: row.result_manifest_sha256,
    calculatedBy: row.calculated_by,
    calculatedAt: row.calculated_at,
    links: Object.freeze({
      self: withWorkspace(resource, workspaceId),
      model: withWorkspace(`/api/v1/economic-state/models/${row.model_id}`, workspaceId),
      components: withWorkspace(`${resource}/components`, workspaceId),
    }),
  });
}

function mapRunComponent(row: StateRunComponentRow): StateRunComponent {
  const observed = row.raw_value !== null;
  const evidenceBindings = [
    row.observation_id,
    row.source_id,
    row.quality_evidence_sha256,
    row.source_dataset_id,
    row.license_review_id,
    row.source_admission_event_id,
    row.legal_evidence_manifest,
    row.legal_evidence_sha256,
  ];
  if (evidenceBindings.some((binding) => (binding !== null) !== observed)) {
    throw new Error("Database returned an inconsistent economic-state evidence binding");
  }
  const legalEvidenceManifest = mapLegalEvidenceManifest(row);
  return Object.freeze({
    key: row.component_key,
    concept: Object.freeze({
      id: row.concept_id,
      canonicalKey: row.canonical_key,
      name: row.concept_name,
    }),
    seriesId: row.series_id,
    unitCode: row.unit_code,
    frequency: row.frequency,
    seasonalAdjustment: row.seasonal_adjustment,
    parser: mapParser(row),
    featureContractSha256: row.feature_contract_sha256,
    weight: row.weight,
    polarity: row.polarity,
    lowerBound: row.lower_bound,
    upperBound: row.upper_bound,
    rawValue: row.raw_value,
    normalizedValue: row.normalized_value,
    contribution: row.contribution,
    missingReason: row.missing_reason,
    quality: row.quality,
    qualityEvidenceSha256: row.quality_evidence_sha256,
    sourceDatasetId: row.source_dataset_id,
    licenseReviewId: row.license_review_id,
    sourceAdmissionDecisionId: row.source_admission_event_id,
    legalEvidenceSha256: row.legal_evidence_sha256,
    legalEvidenceManifest,
    evidence:
      !observed || row.observation_id === null || row.source_id === null
        ? null
        : Object.freeze({
            observationId: row.observation_id,
            sourceId: row.source_id,
            provenance: `/api/v1/evidence/observations/${row.observation_id}/provenance`,
          }),
  });
}

function mapVector(rows: readonly StateVectorRow[], workspaceId: string): StateVector {
  if (rows.length !== STATE_VECTOR_DIMENSIONS.length) throw stateVectorIntegrityError();
  const header = rows[0];
  if (!header || header.dimension_count !== STATE_VECTOR_DIMENSIONS.length) {
    throw stateVectorIntegrityError();
  }

  const dimensions = rows.map((row, index) => {
    const expectedDimension = STATE_VECTOR_DIMENSIONS[index];
    if (
      expectedDimension === undefined ||
      row.ordinal !== index + 1 ||
      row.dimension !== expectedDimension ||
      !sameVectorHeader(header, row)
    ) {
      throw stateVectorIntegrityError();
    }
    return mapVectorDimension(row, expectedDimension, workspaceId);
  });

  return Object.freeze({
    schemaVersion: 1 as const,
    id: header.vector_id,
    methodologyScope: "research_baseline" as const,
    geography: Object.freeze({
      id: header.geography_id,
      kind: header.geography_kind,
      codeScheme: header.geography_code_scheme,
      code: header.geography_code,
      name: header.geography_name,
    }),
    snapshot: Object.freeze({
      id: header.snapshot_id,
      manifestSha256: header.snapshot_manifest_sha256,
    }),
    pointInTime: Object.freeze({
      knownAt: header.known_at,
      policy: header.policy,
      systemAt: header.system_at,
    }),
    contextSha256: header.context_sha256,
    diagnostics: Object.freeze({
      dimensionCount: 5 as const,
      reportedDimensionCount: header.reported_dimension_count,
      scoredDimensionCount: header.scored_dimension_count,
      insufficientDimensionCount: header.insufficient_dimension_count,
      missingDimensionCount: header.missing_dimension_count,
      dimensionCoverage: header.dimension_coverage,
      scoredDimensionCoverage: header.scored_dimension_coverage,
      evidenceCoverage: header.evidence_coverage,
      confidenceCoverage: header.confidence_coverage,
      evidenceQuality: header.evidence_quality,
      reportedComponentCount: header.reported_component_count,
      observedComponentCount: header.observed_component_count,
      distinctSourceCount: header.distinct_source_count,
      distinctSourceCoverage: header.distinct_source_coverage,
    }),
    dimensions: Object.freeze(dimensions),
    stateManifestSha256: header.state_manifest_sha256,
    assembledBy: header.assembled_by,
    assembledAt: header.assembled_at,
    links: Object.freeze({
      self: withWorkspace(`/api/v1/economic-state/vectors/${header.vector_id}`, workspaceId),
    }),
  });
}

function mapVectorDimension(
  row: StateVectorRow,
  dimension: StateVectorDimensionName,
  workspaceId: string,
): StateVectorDimension {
  const reported = row.state_run_id !== null;
  const boundValues = [
    row.model_id,
    row.model_key,
    row.model_version,
    row.model_dimension,
    row.governance_schema_version,
    row.model_definition_sha256,
    row.artifact_id,
    row.artifact_sha256,
    row.artifact_algorithm_key,
    row.artifact_algorithm_version,
    row.artifact_configuration_sha256,
    row.artifact_normalization_sha256,
    row.artifact_assumptions_sha256,
    row.artifact_approval_sha256,
    row.artifact_lifecycle_status,
    row.state_run_id,
    row.run_model_definition_sha256,
    row.run_model_artifact_id,
    row.run_model_artifact_sha256,
    row.run_status,
    row.run_completeness,
    row.run_source_coverage,
    row.run_confidence,
    row.run_distinct_source_count,
    row.run_renormalized,
    row.run_result_manifest_sha256,
    row.run_calculated_by,
    row.run_calculated_at,
  ];

  if (!reported) {
    if (
      row.slot_missing_reason === null ||
      row.run_score !== null ||
      row.run_missing_reason !== null ||
      boundValues.some((value) => value !== null)
    ) {
      throw stateVectorIntegrityError();
    }
    return Object.freeze({
      ordinal: row.ordinal,
      dimension,
      model: null,
      run: null,
      missingReason: row.slot_missing_reason,
    });
  }

  if (
    row.slot_missing_reason !== null ||
    boundValues.some((value) => value === null) ||
    row.governance_schema_version !== 2 ||
    row.model_dimension !== dimension ||
    row.model_definition_sha256 !== row.run_model_definition_sha256 ||
    row.artifact_id !== row.run_model_artifact_id ||
    row.artifact_sha256 !== row.run_model_artifact_sha256 ||
    !STATE_ARTIFACT_LIFECYCLE_STATUSES.includes(
      row.artifact_lifecycle_status as StateArtifactLifecycleStatus,
    ) ||
    !RUN_STATUSES.includes(row.run_status as EconomicStateRunStatus) ||
    (row.run_status === "insufficient_data" &&
      (row.run_score !== null || row.run_missing_reason !== "insufficient_component_coverage")) ||
    (row.run_status !== "insufficient_data" &&
      (row.run_score === null || row.run_missing_reason !== null))
  ) {
    throw stateVectorIntegrityError();
  }

  const modelResource = `/api/v1/economic-state/models/${row.model_id as string}`;
  const runResource = `/api/v1/economic-state/runs/${row.state_run_id as string}`;
  return Object.freeze({
    ordinal: row.ordinal,
    dimension,
    model: Object.freeze({
      id: row.model_id as string,
      key: row.model_key as string,
      version: row.model_version as string,
      dimension,
      governanceSchemaVersion: 2 as const,
      definitionSha256: row.model_definition_sha256 as string,
      artifact: Object.freeze({
        id: row.artifact_id as string,
        sha256: row.artifact_sha256 as string,
        algorithmKey: row.artifact_algorithm_key as string,
        algorithmVersion: row.artifact_algorithm_version as string,
        configurationSha256: row.artifact_configuration_sha256 as string,
        normalizationSha256: row.artifact_normalization_sha256 as string,
        assumptionsSha256: row.artifact_assumptions_sha256 as string,
        approvalSha256: row.artifact_approval_sha256 as string,
        lifecycleStatus: row.artifact_lifecycle_status as StateArtifactLifecycleStatus,
      }),
      links: Object.freeze({
        self: withWorkspace(modelResource, workspaceId),
        components: withWorkspace(`${modelResource}/components`, workspaceId),
      }),
    }),
    run: Object.freeze({
      id: row.state_run_id as string,
      modelDefinitionSha256: row.run_model_definition_sha256 as string,
      modelArtifactId: row.run_model_artifact_id as string,
      modelArtifactSha256: row.run_model_artifact_sha256 as string,
      status: row.run_status as EconomicStateRunStatus,
      score: row.run_score,
      missingReason: row.run_missing_reason,
      completeness: row.run_completeness as string,
      sourceCoverage: row.run_source_coverage as string,
      confidence: row.run_confidence as string,
      distinctSourceCount: row.run_distinct_source_count as number,
      renormalized: row.run_renormalized as boolean,
      resultManifestSha256: row.run_result_manifest_sha256 as string,
      calculatedBy: row.run_calculated_by as string,
      calculatedAt: row.run_calculated_at as string,
      links: Object.freeze({
        self: withWorkspace(runResource, workspaceId),
        components: withWorkspace(`${runResource}/components`, workspaceId),
      }),
    }),
    missingReason: null,
  });
}

function sameVectorHeader(left: StateVectorRow, right: StateVectorRow): boolean {
  return (
    left.vector_id === right.vector_id &&
    left.geography_id === right.geography_id &&
    left.snapshot_id === right.snapshot_id &&
    left.snapshot_manifest_sha256 === right.snapshot_manifest_sha256 &&
    left.known_at === right.known_at &&
    left.policy === right.policy &&
    left.system_at === right.system_at &&
    left.context_sha256 === right.context_sha256 &&
    left.state_manifest_sha256 === right.state_manifest_sha256
  );
}

function mapLegalEvidenceManifest(row: StateRunComponentRow): StateLegalEvidenceManifest | null {
  if (row.legal_evidence_manifest === null) return null;
  const manifest = legalEvidenceRecord(row.legal_evidence_manifest);
  const review = legalEvidenceRecord(manifest.licenseReview);
  const decision = legalEvidenceRecord(manifest.sourceAdmissionDecision);
  const schemaVersion = manifest.schemaVersion;
  const action = manifest.action;
  if (schemaVersion !== 1 || action !== "derive") throw legalEvidenceMismatch();

  const mappedReview: StateLicenseReviewEvidence = Object.freeze({
    id: legalEvidenceString(review.id),
    sourceSlug: legalEvidenceString(review.sourceSlug),
    datasetExternalKey: legalEvidenceNullableString(review.datasetExternalKey),
    evidenceUri: legalEvidenceString(review.evidenceUri),
    licenseExpression: legalEvidenceString(review.licenseExpression),
    intendedUses: legalEvidenceStringArray(review.intendedUses),
    evidence: Object.freeze({ ...legalEvidenceRecord(review.evidence) }),
    evidenceSha256: legalEvidenceString(review.evidenceSha256),
    reviewedBy: legalEvidenceString(review.reviewedBy),
    reviewedAt: legalEvidenceString(review.reviewedAt),
    expiresAt: legalEvidenceNullableString(review.expiresAt),
    createdAt: legalEvidenceString(review.createdAt),
  });
  const mappedDecision: StateSourceAdmissionDecisionEvidence = Object.freeze({
    id: legalEvidenceString(decision.id),
    organizationId: legalEvidenceNullableString(decision.organizationId),
    sourceId: legalEvidenceString(decision.sourceId),
    sourceDatasetId: legalEvidenceNullableString(decision.sourceDatasetId),
    decision: legalEvidenceString(decision.decision),
    permittedActions: legalEvidenceStringArray(decision.permittedActions),
    licenseReviewId: legalEvidenceString(decision.licenseReviewId),
    reason: legalEvidenceString(decision.reason),
    decidedBy: legalEvidenceString(decision.decidedBy),
    decidedAt: legalEvidenceString(decision.decidedAt),
    recordedAt: legalEvidenceString(decision.recordedAt),
  });
  const mapped: StateLegalEvidenceManifest = Object.freeze({
    schemaVersion: 1,
    action: "derive",
    organizationId: legalEvidenceString(manifest.organizationId),
    observationId: legalEvidenceString(manifest.observationId),
    sourceId: legalEvidenceString(manifest.sourceId),
    sourceDatasetId: legalEvidenceString(manifest.sourceDatasetId),
    licenseReview: mappedReview,
    sourceAdmissionDecision: mappedDecision,
  });

  if (
    mapped.organizationId !== row.result_organization_id ||
    mapped.observationId !== row.observation_id ||
    mapped.sourceId !== row.source_id ||
    mapped.sourceDatasetId !== row.source_dataset_id ||
    mapped.licenseReview.id !== row.license_review_id ||
    mapped.sourceAdmissionDecision.id !== row.source_admission_event_id ||
    mapped.sourceAdmissionDecision.sourceId !== row.source_id ||
    mapped.sourceAdmissionDecision.licenseReviewId !== row.license_review_id ||
    (mapped.sourceAdmissionDecision.organizationId !== null &&
      mapped.sourceAdmissionDecision.organizationId !== row.result_organization_id) ||
    (mapped.sourceAdmissionDecision.sourceDatasetId !== null &&
      mapped.sourceAdmissionDecision.sourceDatasetId !== row.source_dataset_id) ||
    mapped.sourceAdmissionDecision.decision !== "approved" ||
    !mapped.sourceAdmissionDecision.permittedActions.includes("derive") ||
    !mapped.licenseReview.intendedUses.includes("derive")
  ) {
    throw legalEvidenceMismatch();
  }
  return mapped;
}

function legalEvidenceRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw legalEvidenceMismatch();
  }
  return value as Record<string, unknown>;
}

function legalEvidenceString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw legalEvidenceMismatch();
  return value;
}

function legalEvidenceNullableString(value: unknown): string | null {
  if (value === null) return null;
  return legalEvidenceString(value);
}

function legalEvidenceStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw legalEvidenceMismatch();
  }
  return Object.freeze([...value]);
}

function legalEvidenceMismatch(): Error {
  return new Error("Database returned an inconsistent economic-state legal evidence manifest");
}

function mapParser(row: StateModelComponentRow): StateComponentParser | null {
  const values = [
    row.parser_name,
    row.parser_version,
    row.parser_code_sha256,
    row.parser_configuration_sha256,
  ];
  if (values.every((value) => value === null)) return null;
  if (values.some((value) => value === null)) {
    throw new Error("Database returned an incomplete economic-state parser binding");
  }
  return Object.freeze({
    name: row.parser_name as string,
    version: row.parser_version as string,
    codeSha256: row.parser_code_sha256 as string,
    configurationSha256: row.parser_configuration_sha256 as string,
  });
}

function withWorkspace(path: string, workspaceId: string): string {
  return `${path}?workspaceId=${encodeURIComponent(workspaceId)}`;
}

function optionalUuidProperty(value: unknown, field: string): Readonly<Record<string, string>> {
  if (value === undefined) return Object.freeze({});
  return Object.freeze({ [field]: uuidField(value, field) });
}

function assertOnlyFields(
  raw: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) invalidRequest(key);
  }
}

function uuidField(value: unknown, field: string): string {
  const parsed = stringField(value, field);
  if (!UUID.test(parsed)) invalidRequest(field);
  return parsed;
}

function optionalStringField(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return stringField(value, field);
}

function stringField(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    return invalidRequest(field);
  }
  return value;
}

function boundedIntegerField(
  value: unknown,
  field: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9]\d{0,2}$/.test(value)) invalidRequest(field);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    invalidRequest(field);
  }
  return parsed;
}

function invalidRequest(field: string): never {
  throw new BadRequestException({ code: "REQUEST_INVALID", field });
}

function stateNotFound(): NotFoundException {
  return new NotFoundException({ code: "ECONOMIC_STATE_NOT_FOUND" });
}

function stateVectorIntegrityError(): Error {
  return new Error("Database returned an inconsistent economic-state vector");
}
