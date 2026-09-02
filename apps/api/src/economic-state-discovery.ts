import type { Principal } from "@economyos/contracts";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PostgresRuntime, type TenantTransaction } from "./database.js";
import type {
  EconomicStateRunStatus,
  StateVectorDiagnostics,
  StateVectorDimensionName,
} from "./economic-state.js";
import { GovernedAuthorizationService } from "./governed-authorization.js";
import { WorkspaceAccessService } from "./workspaces.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z$/;
const PIT_POLICIES = ["true_vintage", "reconstructed", "latest_revised"] as const;
const DIMENSIONS = [
  "macroeconomic",
  "human_economic",
  "financial_system",
  "market",
  "regime",
] as const;
const DISCOVERY_FIELDS = new Set([
  "workspaceId",
  "snapshotId",
  "knownAt",
  "policy",
  "systemAt",
  "geographyId",
  "cursor",
  "limit",
]);
const COMPARISON_FIELDS = new Set(["workspaceId", "vectorIds"]);

export type StatePointInTimePolicy = (typeof PIT_POLICIES)[number];

export interface StateVectorDiscoveryQuery {
  readonly workspaceId: string;
  readonly snapshotId: string;
  readonly knownAt: string;
  readonly policy: StatePointInTimePolicy;
  readonly systemAt: string | null;
  readonly geographyId?: string;
  readonly cursor?: string;
  readonly limit: number;
}

export interface StateVectorComparisonQuery {
  readonly workspaceId: string;
  readonly vectorIds: readonly string[];
}

export interface StateVectorSummary {
  readonly id: string;
  readonly geography: StateVectorGeography;
  readonly snapshot: StateVectorSnapshot;
  readonly pointInTime: StateVectorPointInTime;
  readonly contextSha256: string;
  readonly diagnostics: StateVectorDiagnostics;
  readonly stateManifestSha256: string;
  readonly assembledAt: string;
  readonly links: { readonly self: string };
}

export interface StateVectorGeography {
  readonly id: string;
  readonly kind: string;
  readonly codeScheme: string;
  readonly code: string;
  readonly name: string;
}

export interface StateVectorSnapshot {
  readonly id: string;
  readonly manifestSha256: string;
}

export interface StateVectorPointInTime {
  readonly knownAt: string;
  readonly policy: StatePointInTimePolicy;
  readonly systemAt: string | null;
}

export interface StateVectorDiscoveryPage {
  readonly schemaVersion: 1;
  readonly methodologyScope: "research_baseline";
  readonly context: {
    readonly workspaceId: string;
    readonly snapshot: { readonly id: string };
    readonly pointInTime: StateVectorPointInTime;
    readonly geographyId: string | null;
  };
  readonly count: number;
  readonly nextCursor: string | null;
  readonly vectors: readonly StateVectorSummary[];
}

export interface StateVectorComparisonDimension {
  readonly ordinal: number;
  readonly dimension: StateVectorDimensionName;
  readonly modelId: string | null;
  readonly modelDefinitionSha256: string | null;
  readonly modelArtifactId: string | null;
  readonly modelArtifactSha256: string | null;
  readonly status: EconomicStateRunStatus | null;
  readonly score: string | null;
  readonly missingReason: string | null;
  readonly completeness: string | null;
  readonly sourceCoverage: string | null;
  readonly confidence: string | null;
  readonly renormalized: boolean | null;
}

export interface StateVectorComparisonItem extends StateVectorSummary {
  readonly dimensions: readonly StateVectorComparisonDimension[];
}

export type SnapshotCompatibilityReason = "same_snapshot" | "snapshot_mismatch";
export type PointInTimeCompatibilityReason = "same_point_in_time" | "point_in_time_mismatch";
export type DimensionCompatibilityReason =
  | "same_model_and_artifact"
  | "all_missing"
  | "coverage_mismatch"
  | "model_definition_mismatch"
  | "model_artifact_mismatch";

export interface StateVectorComparison {
  readonly schemaVersion: 1;
  readonly methodologyScope: "research_baseline";
  readonly requestedVectorIds: readonly string[];
  readonly vectorCount: number;
  readonly context: {
    readonly workspaceId: string;
    readonly ordering: "requested";
    readonly comparisonBasis: {
      readonly snapshot: "exact_id_and_manifest";
      readonly pointInTime: "exact_policy_known_at_system_at";
      readonly dimension: "exact_model_and_artifact_identity";
      readonly scoreTreatment: "persisted_exact_no_normalization";
    };
  };
  readonly compatibility: {
    readonly compatible: boolean;
    readonly snapshot: {
      readonly compatible: boolean;
      readonly reason: SnapshotCompatibilityReason;
      readonly sharedId: string | null;
      readonly sharedManifestSha256: string | null;
    };
    readonly pointInTime: {
      readonly compatible: boolean;
      readonly reason: PointInTimeCompatibilityReason;
      readonly sharedKnownAt: string | null;
      readonly sharedPolicy: StatePointInTimePolicy | null;
      readonly sharedSystemAt: string | null;
    };
    readonly dimensions: readonly {
      readonly ordinal: number;
      readonly dimension: StateVectorDimensionName;
      readonly compatible: boolean;
      readonly reason: DimensionCompatibilityReason;
      readonly sharedModelId: string | null;
      readonly sharedModelDefinitionSha256: string | null;
      readonly sharedModelArtifactId: string | null;
      readonly sharedModelArtifactSha256: string | null;
    }[];
  };
  readonly vectors: readonly StateVectorComparisonItem[];
}

interface VectorSummaryRow extends Record<string, unknown> {
  readonly vector_id: string;
  readonly geography_id: string;
  readonly geography_kind: string;
  readonly geography_code_scheme: string;
  readonly geography_code: string;
  readonly geography_name: string;
  readonly snapshot_id: string;
  readonly snapshot_manifest_sha256: string;
  readonly known_at: string;
  readonly policy: StatePointInTimePolicy;
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
  readonly assembled_at: string;
}

interface ComparisonRow extends VectorSummaryRow {
  readonly request_ordinal: number;
  readonly slot_ordinal: number;
  readonly dimension: string;
  readonly slot_missing_reason: string | null;
  readonly model_id: string | null;
  readonly model_definition_sha256: string | null;
  readonly model_artifact_id: string | null;
  readonly model_artifact_sha256: string | null;
  readonly run_model_definition_sha256: string | null;
  readonly run_model_artifact_id: string | null;
  readonly run_model_artifact_sha256: string | null;
  readonly run_status: string | null;
  readonly run_score: string | null;
  readonly run_missing_reason: string | null;
  readonly run_completeness: string | null;
  readonly run_source_coverage: string | null;
  readonly run_confidence: string | null;
  readonly run_renormalized: boolean | null;
}

export function parseStateVectorDiscoveryQuery(
  raw: Readonly<Record<string, unknown>>,
): StateVectorDiscoveryQuery {
  assertOnlyFields(raw, DISCOVERY_FIELDS);
  const policy = policyField(raw.policy);
  const systemAt = nullableTimestampField(raw.systemAt, "systemAt");
  if (policy === "reconstructed" && systemAt === null) invalidRequest("systemAt");
  if (policy === "latest_revised" && systemAt !== null) invalidRequest("systemAt");
  return Object.freeze({
    workspaceId: uuidField(raw.workspaceId, "workspaceId"),
    snapshotId: uuidField(raw.snapshotId, "snapshotId"),
    knownAt: timestampField(raw.knownAt, "knownAt"),
    policy,
    systemAt,
    ...optionalUuid(raw.geographyId, "geographyId"),
    ...optionalUuid(raw.cursor, "cursor"),
    limit: boundedIntegerField(raw.limit, "limit", 50, 1, 100),
  });
}

export function parseStateVectorComparisonQuery(
  raw: Readonly<Record<string, unknown>>,
): StateVectorComparisonQuery {
  assertOnlyFields(raw, COMPARISON_FIELDS);
  const serialized = stringField(raw.vectorIds, "vectorIds", 370);
  if (serialized.includes(" ") || serialized.startsWith(",") || serialized.endsWith(",")) {
    invalidRequest("vectorIds");
  }
  const vectorIds = serialized.split(",");
  if (vectorIds.length < 2 || vectorIds.length > 10) invalidRequest("vectorIds");
  if (new Set(vectorIds.map((value) => value.toLowerCase())).size !== vectorIds.length) {
    invalidRequest("vectorIds");
  }
  for (const vectorId of vectorIds) {
    if (!UUID.test(vectorId)) invalidRequest("vectorIds");
  }
  return Object.freeze({
    workspaceId: uuidField(raw.workspaceId, "workspaceId"),
    vectorIds: Object.freeze(vectorIds.map((vectorId) => vectorId.toLowerCase())),
  });
}

@Injectable()
export class EconomicStateDiscoveryService {
  constructor(
    @Inject(PostgresRuntime) private readonly database: PostgresRuntime,
    @Inject(WorkspaceAccessService) private readonly workspaceAccess: WorkspaceAccessService,
    @Inject(GovernedAuthorizationService)
    private readonly governedAuthorization: GovernedAuthorizationService,
  ) {}

  async vectors(
    principal: Principal,
    query: StateVectorDiscoveryQuery,
  ): Promise<StateVectorDiscoveryPage> {
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.authorize(principal, query.workspaceId, transaction);
      const result = await transaction.query<VectorSummaryRow>(VECTOR_DISCOVERY_SQL, [
        principal.organizationId,
        query.workspaceId,
        query.snapshotId,
        query.knownAt,
        query.policy,
        query.systemAt,
        query.geographyId ?? null,
        query.cursor ?? null,
        query.limit + 1,
      ]);
      const pageRows = result.rows.slice(0, query.limit);
      assertUniqueRows(pageRows);
      return Object.freeze({
        schemaVersion: 1 as const,
        methodologyScope: "research_baseline" as const,
        context: Object.freeze({
          workspaceId: query.workspaceId,
          snapshot: Object.freeze({ id: query.snapshotId }),
          pointInTime: Object.freeze({
            knownAt: query.knownAt,
            policy: query.policy,
            systemAt: query.systemAt,
          }),
          geographyId: query.geographyId ?? null,
        }),
        count: pageRows.length,
        nextCursor: result.rows.length > query.limit ? (pageRows.at(-1)?.vector_id ?? null) : null,
        vectors: Object.freeze(pageRows.map((row) => mapSummary(row, query.workspaceId))),
      });
    });
  }

  async compare(
    principal: Principal,
    query: StateVectorComparisonQuery,
  ): Promise<StateVectorComparison> {
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.authorize(principal, query.workspaceId, transaction);
      const result = await transaction.query<ComparisonRow>(VECTOR_COMPARISON_SQL, [
        principal.organizationId,
        query.workspaceId,
        query.vectorIds,
      ]);
      const vectors = mapComparisonVectors(result.rows, query);
      const snapshot = compareSnapshot(vectors);
      const pointInTime = comparePointInTime(vectors);
      const dimensions = DIMENSIONS.map((dimension, index) =>
        compareDimension(vectors, dimension, index),
      );
      return Object.freeze({
        schemaVersion: 1 as const,
        methodologyScope: "research_baseline" as const,
        requestedVectorIds: Object.freeze([...query.vectorIds]),
        vectorCount: vectors.length,
        context: Object.freeze({
          workspaceId: query.workspaceId,
          ordering: "requested" as const,
          comparisonBasis: Object.freeze({
            snapshot: "exact_id_and_manifest" as const,
            pointInTime: "exact_policy_known_at_system_at" as const,
            dimension: "exact_model_and_artifact_identity" as const,
            scoreTreatment: "persisted_exact_no_normalization" as const,
          }),
        }),
        compatibility: Object.freeze({
          compatible:
            snapshot.compatible &&
            pointInTime.compatible &&
            dimensions.every((dimension) => dimension.compatible),
          snapshot,
          pointInTime,
          dimensions: Object.freeze(dimensions),
        }),
        vectors: Object.freeze(vectors),
      });
    });
  }

  private async authorize(
    principal: Principal,
    workspaceId: string,
    transaction: TenantTransaction,
  ): Promise<void> {
    await this.workspaceAccess.assertMembership(principal, workspaceId, transaction);
    await this.governedAuthorization.assertEconomicStateAccess(principal, workspaceId, transaction);
  }
}

const SUMMARY_PROJECTION = `
  vector.id::text AS vector_id,
  vector.geography_id::text,
  geography.kind AS geography_kind,
  geography.code_scheme AS geography_code_scheme,
  geography.code AS geography_code,
  geography.name AS geography_name,
  vector.snapshot_id::text,
  vector.snapshot_manifest_sha256,
  to_char(vector.known_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS known_at,
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
  to_char(vector.assembled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    AS assembled_at
`;

const SERVABLE_VECTOR_PREDICATE = `
  AND NOT EXISTS (
    SELECT 1
    FROM evidence.economic_state_vector_dimensions reported
    WHERE reported.organization_id = vector.organization_id
      AND reported.workspace_id = vector.workspace_id
      AND reported.vector_id = vector.id
      AND reported.state_run_id IS NOT NULL
      AND evidence.economic_state_run_is_currently_servable(reported.state_run_id, 'api')
        IS NOT TRUE
  )
`;

const VECTOR_DISCOVERY_SQL = `
  SELECT ${SUMMARY_PROJECTION}
  FROM evidence.economic_state_vectors vector
  JOIN evidence.geographies geography ON geography.id = vector.geography_id
  WHERE vector.organization_id = $1::uuid
    AND vector.workspace_id = $2::uuid
    AND vector.snapshot_id = $3::uuid
    AND vector.known_at = $4::timestamptz
    AND vector.policy = $5::text
    AND vector.system_at IS NOT DISTINCT FROM $6::timestamptz
    AND ($7::uuid IS NULL OR vector.geography_id = $7::uuid)
    AND ($8::uuid IS NULL OR vector.id > $8::uuid)
    ${SERVABLE_VECTOR_PREDICATE}
  ORDER BY vector.id
  LIMIT $9::integer
`;

const VECTOR_COMPARISON_SQL = `
  WITH requested(vector_id, request_ordinal) AS MATERIALIZED (
    SELECT requested_id, ordinality::integer
    FROM unnest($3::uuid[]) WITH ORDINALITY AS request(requested_id, ordinality)
  ),
  servable_vectors AS MATERIALIZED (
    SELECT vector.*, requested.request_ordinal
    FROM requested
    JOIN evidence.economic_state_vectors vector ON vector.id = requested.vector_id
    WHERE vector.organization_id = $1::uuid
      AND vector.workspace_id = $2::uuid
      ${SERVABLE_VECTOR_PREDICATE}
  )
  SELECT
    vector.request_ordinal,
    ${SUMMARY_PROJECTION}
    , slot.ordinal AS slot_ordinal,
    slot.dimension,
    slot.missing_reason AS slot_missing_reason,
    model.id::text AS model_id,
    model.definition_sha256 AS model_definition_sha256,
    model.model_artifact_id::text,
    model.model_artifact_sha256,
    run.model_definition_sha256 AS run_model_definition_sha256,
    run.model_artifact_id::text AS run_model_artifact_id,
    run.model_artifact_sha256 AS run_model_artifact_sha256,
    run.status AS run_status,
    run.score AS run_score,
    run.missing_reason AS run_missing_reason,
    run.completeness AS run_completeness,
    run.source_coverage AS run_source_coverage,
    run.confidence AS run_confidence,
    run.renormalized AS run_renormalized
  FROM servable_vectors vector
  JOIN evidence.geographies geography ON geography.id = vector.geography_id
  JOIN evidence.economic_state_vector_dimensions slot
    ON slot.organization_id = vector.organization_id
    AND slot.workspace_id = vector.workspace_id
    AND slot.vector_id = vector.id
  LEFT JOIN evidence.economic_state_models model
    ON model.organization_id = slot.organization_id
    AND model.workspace_id = slot.workspace_id
    AND model.id = slot.model_id
  LEFT JOIN evidence.economic_state_runs run
    ON run.organization_id = slot.organization_id
    AND run.workspace_id = slot.workspace_id
    AND run.id = slot.state_run_id
    AND run.model_id = slot.model_id
  ORDER BY vector.request_ordinal, slot.ordinal
  LIMIT 51
`;

function mapSummary(row: VectorSummaryRow, workspaceId: string): StateVectorSummary {
  if (row.dimension_count !== DIMENSIONS.length) throw integrityError();
  return Object.freeze({
    id: row.vector_id,
    geography: Object.freeze({
      id: row.geography_id,
      kind: row.geography_kind,
      codeScheme: row.geography_code_scheme,
      code: row.geography_code,
      name: row.geography_name,
    }),
    snapshot: Object.freeze({
      id: row.snapshot_id,
      manifestSha256: row.snapshot_manifest_sha256,
    }),
    pointInTime: Object.freeze({
      knownAt: row.known_at,
      policy: row.policy,
      systemAt: row.system_at,
    }),
    contextSha256: row.context_sha256,
    diagnostics: Object.freeze({
      dimensionCount: 5 as const,
      reportedDimensionCount: row.reported_dimension_count,
      scoredDimensionCount: row.scored_dimension_count,
      insufficientDimensionCount: row.insufficient_dimension_count,
      missingDimensionCount: row.missing_dimension_count,
      dimensionCoverage: row.dimension_coverage,
      scoredDimensionCoverage: row.scored_dimension_coverage,
      evidenceCoverage: row.evidence_coverage,
      confidenceCoverage: row.confidence_coverage,
      evidenceQuality: row.evidence_quality,
      reportedComponentCount: row.reported_component_count,
      observedComponentCount: row.observed_component_count,
      distinctSourceCount: row.distinct_source_count,
      distinctSourceCoverage: row.distinct_source_coverage,
    }),
    stateManifestSha256: row.state_manifest_sha256,
    assembledAt: row.assembled_at,
    links: Object.freeze({
      self: `/api/v1/economic-state/vectors/${row.vector_id}?workspaceId=${encodeURIComponent(workspaceId)}`,
    }),
  });
}

function mapComparisonVectors(
  rows: readonly ComparisonRow[],
  query: StateVectorComparisonQuery,
): readonly StateVectorComparisonItem[] {
  if (rows.length !== query.vectorIds.length * DIMENSIONS.length) throw stateNotFound();
  const vectors: StateVectorComparisonItem[] = [];
  for (let vectorIndex = 0; vectorIndex < query.vectorIds.length; vectorIndex += 1) {
    const expectedId = query.vectorIds[vectorIndex];
    const group = rows.slice(
      vectorIndex * DIMENSIONS.length,
      (vectorIndex + 1) * DIMENSIONS.length,
    );
    const header = group[0];
    if (!header || header.vector_id !== expectedId || header.request_ordinal !== vectorIndex + 1) {
      throw stateNotFound();
    }
    const dimensions = group.map((row, dimensionIndex) =>
      mapComparisonDimension(row, header, dimensionIndex),
    );
    assertDiagnosticCounts(header, dimensions);
    vectors.push(
      Object.freeze({
        ...mapSummary(header, query.workspaceId),
        dimensions: Object.freeze(dimensions),
      }),
    );
  }
  return Object.freeze(vectors);
}

function mapComparisonDimension(
  row: ComparisonRow,
  header: ComparisonRow,
  index: number,
): StateVectorComparisonDimension {
  const dimension = DIMENSIONS[index];
  if (
    dimension === undefined ||
    row.vector_id !== header.vector_id ||
    row.request_ordinal !== header.request_ordinal ||
    row.slot_ordinal !== index + 1 ||
    row.dimension !== dimension ||
    !sameHeader(row, header)
  ) {
    throw integrityError();
  }
  const runValues = [
    row.model_id,
    row.model_definition_sha256,
    row.model_artifact_id,
    row.model_artifact_sha256,
    row.run_model_definition_sha256,
    row.run_model_artifact_id,
    row.run_model_artifact_sha256,
    row.run_status,
    row.run_completeness,
    row.run_source_coverage,
    row.run_confidence,
    row.run_renormalized,
  ];
  const missing = row.slot_missing_reason !== null;
  if (missing) {
    if (
      runValues.some((value) => value !== null) ||
      row.run_score !== null ||
      row.run_missing_reason !== null
    ) {
      throw integrityError();
    }
    return Object.freeze({
      ordinal: index + 1,
      dimension,
      modelId: null,
      modelDefinitionSha256: null,
      modelArtifactId: null,
      modelArtifactSha256: null,
      status: null,
      score: null,
      missingReason: row.slot_missing_reason,
      completeness: null,
      sourceCoverage: null,
      confidence: null,
      renormalized: null,
    });
  }
  if (
    runValues.some((value) => value === null) ||
    row.model_definition_sha256 !== row.run_model_definition_sha256 ||
    row.model_artifact_id !== row.run_model_artifact_id ||
    row.model_artifact_sha256 !== row.run_model_artifact_sha256 ||
    !["complete", "partial", "insufficient_data"].includes(row.run_status as string) ||
    (row.run_status === "insufficient_data" &&
      (row.run_score !== null || row.run_missing_reason !== "insufficient_component_coverage")) ||
    (row.run_status !== "insufficient_data" &&
      (row.run_score === null || row.run_missing_reason !== null))
  ) {
    throw integrityError();
  }
  return Object.freeze({
    ordinal: index + 1,
    dimension,
    modelId: row.model_id,
    modelDefinitionSha256: row.model_definition_sha256,
    modelArtifactId: row.model_artifact_id,
    modelArtifactSha256: row.model_artifact_sha256,
    status: row.run_status as EconomicStateRunStatus,
    score: row.run_score,
    missingReason: row.run_missing_reason,
    completeness: row.run_completeness,
    sourceCoverage: row.run_source_coverage,
    confidence: row.run_confidence,
    renormalized: row.run_renormalized,
  });
}

function compareSnapshot(vectors: readonly StateVectorComparisonItem[]) {
  const first = vectors[0]?.snapshot;
  if (!first) throw integrityError();
  const compatible = vectors.every(
    (vector) =>
      vector.snapshot.id === first.id && vector.snapshot.manifestSha256 === first.manifestSha256,
  );
  return Object.freeze({
    compatible,
    reason: (compatible ? "same_snapshot" : "snapshot_mismatch") as SnapshotCompatibilityReason,
    sharedId: compatible ? first.id : null,
    sharedManifestSha256: compatible ? first.manifestSha256 : null,
  });
}

function comparePointInTime(vectors: readonly StateVectorComparisonItem[]) {
  const first = vectors[0]?.pointInTime;
  if (!first) throw integrityError();
  const compatible = vectors.every(
    (vector) =>
      vector.pointInTime.knownAt === first.knownAt &&
      vector.pointInTime.policy === first.policy &&
      vector.pointInTime.systemAt === first.systemAt,
  );
  return Object.freeze({
    compatible,
    reason: (compatible
      ? "same_point_in_time"
      : "point_in_time_mismatch") as PointInTimeCompatibilityReason,
    sharedKnownAt: compatible ? first.knownAt : null,
    sharedPolicy: compatible ? first.policy : null,
    sharedSystemAt: compatible ? first.systemAt : null,
  });
}

function compareDimension(
  vectors: readonly StateVectorComparisonItem[],
  dimension: StateVectorDimensionName,
  index: number,
) {
  const slots = vectors.map((vector) => vector.dimensions[index]);
  if (slots.some((slot) => slot?.dimension !== dimension)) throw integrityError();
  const reported = slots.filter(
    (slot): slot is StateVectorComparisonDimension => slot?.modelDefinitionSha256 !== null,
  );
  if (reported.length === 0) {
    return dimensionCompatibility(index, dimension, true, "all_missing", null, null, null, null);
  }
  if (reported.length !== slots.length) {
    return dimensionCompatibility(
      index,
      dimension,
      false,
      "coverage_mismatch",
      null,
      null,
      null,
      null,
    );
  }
  const first = reported[0];
  if (!first) throw integrityError();
  if (
    reported.some(
      (slot) =>
        slot.modelId !== first.modelId ||
        slot.modelDefinitionSha256 !== first.modelDefinitionSha256,
    )
  ) {
    return dimensionCompatibility(
      index,
      dimension,
      false,
      "model_definition_mismatch",
      null,
      null,
      null,
      null,
    );
  }
  if (
    reported.some(
      (slot) =>
        slot.modelArtifactId !== first.modelArtifactId ||
        slot.modelArtifactSha256 !== first.modelArtifactSha256,
    )
  ) {
    return dimensionCompatibility(
      index,
      dimension,
      false,
      "model_artifact_mismatch",
      first.modelId,
      first.modelDefinitionSha256,
      null,
      null,
    );
  }
  return dimensionCompatibility(
    index,
    dimension,
    true,
    "same_model_and_artifact",
    first.modelId,
    first.modelDefinitionSha256,
    first.modelArtifactId,
    first.modelArtifactSha256,
  );
}

function dimensionCompatibility(
  index: number,
  dimension: StateVectorDimensionName,
  compatible: boolean,
  reason: DimensionCompatibilityReason,
  sharedModelId: string | null,
  sharedModelDefinitionSha256: string | null,
  sharedModelArtifactId: string | null,
  sharedModelArtifactSha256: string | null,
) {
  return Object.freeze({
    ordinal: index + 1,
    dimension,
    compatible,
    reason,
    sharedModelId,
    sharedModelDefinitionSha256,
    sharedModelArtifactId,
    sharedModelArtifactSha256,
  });
}

function sameHeader(left: ComparisonRow, right: ComparisonRow): boolean {
  return (
    left.snapshot_id === right.snapshot_id &&
    left.snapshot_manifest_sha256 === right.snapshot_manifest_sha256 &&
    left.geography_id === right.geography_id &&
    left.known_at === right.known_at &&
    left.policy === right.policy &&
    left.system_at === right.system_at &&
    left.context_sha256 === right.context_sha256 &&
    left.state_manifest_sha256 === right.state_manifest_sha256
  );
}

function assertDiagnosticCounts(
  header: ComparisonRow,
  dimensions: readonly StateVectorComparisonDimension[],
): void {
  const reported = dimensions.filter((dimension) => dimension.status !== null).length;
  const scored = dimensions.filter(
    (dimension) => dimension.status === "complete" || dimension.status === "partial",
  ).length;
  const insufficient = dimensions.filter(
    (dimension) => dimension.status === "insufficient_data",
  ).length;
  const missing = dimensions.filter((dimension) => dimension.status === null).length;
  if (
    header.dimension_count !== DIMENSIONS.length ||
    header.reported_dimension_count !== reported ||
    header.scored_dimension_count !== scored ||
    header.insufficient_dimension_count !== insufficient ||
    header.missing_dimension_count !== missing
  ) {
    throw integrityError();
  }
}

function assertUniqueRows(rows: readonly VectorSummaryRow[]): void {
  if (new Set(rows.map((row) => row.vector_id)).size !== rows.length) throw integrityError();
}

function policyField(value: unknown): StatePointInTimePolicy {
  const parsed = stringField(value, "policy", 32);
  if (!PIT_POLICIES.includes(parsed as StatePointInTimePolicy)) invalidRequest("policy");
  return parsed as StatePointInTimePolicy;
}

function nullableTimestampField(value: unknown, field: string): string | null {
  if (value === "null") return null;
  return timestampField(value, field);
}

function timestampField(value: unknown, field: string): string {
  const parsed = stringField(value, field, 32);
  const match = UTC_TIMESTAMP.exec(parsed);
  if (!match) return invalidRequest(field);
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map((part) => Number(part));
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    year < 1000 ||
    month < 1 ||
    month > 12 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return invalidRequest(field);
  }
  const instant = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    instant.getUTCFullYear() !== year ||
    instant.getUTCMonth() !== month - 1 ||
    instant.getUTCDate() !== day
  ) {
    return invalidRequest(field);
  }
  const fraction = (match[7] ?? "").padEnd(6, "0");
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${fraction}Z`;
}

function optionalUuid(value: unknown, field: string): Readonly<Record<string, string>> {
  if (value === undefined) return Object.freeze({});
  return Object.freeze({ [field]: uuidField(value, field) });
}

function uuidField(value: unknown, field: string): string {
  const parsed = stringField(value, field, 128);
  if (!UUID.test(parsed)) invalidRequest(field);
  return parsed;
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

function stringField(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    return invalidRequest(field);
  }
  return value;
}

function assertOnlyFields(
  raw: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
): void {
  for (const field of Object.keys(raw)) {
    if (!allowed.has(field)) invalidRequest(field);
  }
}

function invalidRequest(field: string): never {
  throw new BadRequestException({ code: "INVALID_ECONOMIC_STATE_QUERY", field });
}

function stateNotFound(): NotFoundException {
  return new NotFoundException({ code: "ECONOMIC_STATE_NOT_FOUND" });
}

function integrityError(): Error {
  return new Error("Database returned an inconsistent economic-state comparison");
}
