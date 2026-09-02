import type { Principal } from "@economyos/contracts";
import { Controller, Get, Inject, Query, Req } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  EconomicStateDiscoveryService,
  parseStateVectorComparisonQuery,
  parseStateVectorDiscoveryQuery,
  type StateVectorComparison,
  type StateVectorDiscoveryPage,
} from "./economic-state-discovery.js";
import type { AuthenticatedRequest } from "./http.js";
import { ProblemDetailsDto } from "./problem.dto.js";

class DiscoveryGeographyDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Geography-neutral persisted kind, such as country or region" })
  kind!: string;

  @ApiProperty()
  codeScheme!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

class DiscoverySnapshotDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  manifestSha256!: string;
}

class DiscoveryPointInTimeDto {
  @ApiProperty({ format: "date-time" })
  knownAt!: string;

  @ApiProperty({ enum: ["true_vintage", "reconstructed", "latest_revised"] })
  policy!: string;

  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  systemAt!: string | null;
}

class DiscoveryDiagnosticsDto {
  @ApiProperty({ enum: [5] })
  dimensionCount!: number;

  @ApiProperty({ minimum: 0, maximum: 5 })
  reportedDimensionCount!: number;

  @ApiProperty({ minimum: 0, maximum: 5 })
  scoredDimensionCount!: number;

  @ApiProperty({ minimum: 0, maximum: 5 })
  insufficientDimensionCount!: number;

  @ApiProperty({ minimum: 0, maximum: 5 })
  missingDimensionCount!: number;

  @ApiProperty({ type: String, description: "Exact decimal encoded as a string" })
  dimensionCoverage!: string;

  @ApiProperty({ type: String, description: "Exact decimal encoded as a string" })
  scoredDimensionCoverage!: string;

  @ApiProperty({ type: String, description: "Exact decimal encoded as a string" })
  evidenceCoverage!: string;

  @ApiProperty({ type: String, description: "Exact decimal encoded as a string" })
  confidenceCoverage!: string;

  @ApiProperty({ nullable: true, type: String, description: "Exact decimal encoded as a string" })
  evidenceQuality!: string | null;

  @ApiProperty({ minimum: 0, maximum: 500 })
  reportedComponentCount!: number;

  @ApiProperty({ minimum: 0, maximum: 500 })
  observedComponentCount!: number;

  @ApiProperty({ minimum: 0, maximum: 500 })
  distinctSourceCount!: number;

  @ApiProperty({ nullable: true, type: String, description: "Exact decimal encoded as a string" })
  distinctSourceCoverage!: string | null;
}

class DiscoveryVectorLinksDto {
  @ApiProperty({ example: "/api/v1/economic-state/vectors/018f...?workspaceId=018f..." })
  self!: string;
}

class DiscoveryVectorSummaryDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: DiscoveryGeographyDto })
  geography!: DiscoveryGeographyDto;

  @ApiProperty({ type: DiscoverySnapshotDto })
  snapshot!: DiscoverySnapshotDto;

  @ApiProperty({ type: DiscoveryPointInTimeDto })
  pointInTime!: DiscoveryPointInTimeDto;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  contextSha256!: string;

  @ApiProperty({ type: DiscoveryDiagnosticsDto })
  diagnostics!: DiscoveryDiagnosticsDto;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  stateManifestSha256!: string;

  @ApiProperty({ format: "date-time" })
  assembledAt!: string;

  @ApiProperty({ type: DiscoveryVectorLinksDto })
  links!: DiscoveryVectorLinksDto;
}

class DiscoveryFilterSnapshotDto {
  @ApiProperty({ format: "uuid" })
  id!: string;
}

class DiscoveryContextDto {
  @ApiProperty({ format: "uuid" })
  workspaceId!: string;

  @ApiProperty({ type: DiscoveryFilterSnapshotDto })
  snapshot!: DiscoveryFilterSnapshotDto;

  @ApiProperty({ type: DiscoveryPointInTimeDto })
  pointInTime!: DiscoveryPointInTimeDto;

  @ApiProperty({ nullable: true, type: String, format: "uuid" })
  geographyId!: string | null;
}

class StateVectorDiscoveryPageDto {
  @ApiProperty({ enum: [1] })
  schemaVersion!: number;

  @ApiProperty({ enum: ["research_baseline"] })
  methodologyScope!: string;

  @ApiProperty({ type: DiscoveryContextDto })
  context!: DiscoveryContextDto;

  @ApiProperty({ minimum: 0, maximum: 100 })
  count!: number;

  @ApiProperty({ nullable: true, type: String, format: "uuid" })
  nextCursor!: string | null;

  @ApiProperty({ type: [DiscoveryVectorSummaryDto], maxItems: 100 })
  vectors!: readonly DiscoveryVectorSummaryDto[];
}

class ComparisonDimensionDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  ordinal!: number;

  @ApiProperty({
    enum: ["macroeconomic", "human_economic", "financial_system", "market", "regime"],
  })
  dimension!: string;

  @ApiProperty({ nullable: true, type: String, format: "uuid" })
  modelId!: string | null;

  @ApiProperty({ nullable: true, type: String, pattern: "^[0-9a-f]{64}$" })
  modelDefinitionSha256!: string | null;

  @ApiProperty({ nullable: true, type: String, format: "uuid" })
  modelArtifactId!: string | null;

  @ApiProperty({ nullable: true, type: String, pattern: "^[0-9a-f]{64}$" })
  modelArtifactSha256!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    enum: ["complete", "partial", "insufficient_data"],
  })
  status!: string | null;

  @ApiProperty({ nullable: true, type: String, description: "Exact decimal; never normalized" })
  score!: string | null;

  @ApiProperty({ nullable: true, type: String })
  missingReason!: string | null;

  @ApiProperty({ nullable: true, type: String, description: "Exact decimal encoded as a string" })
  completeness!: string | null;

  @ApiProperty({ nullable: true, type: String, description: "Exact decimal encoded as a string" })
  sourceCoverage!: string | null;

  @ApiProperty({ nullable: true, type: String, description: "Exact decimal encoded as a string" })
  confidence!: string | null;

  @ApiProperty({ nullable: true, type: Boolean })
  renormalized!: boolean | null;
}

class ComparisonVectorDto extends DiscoveryVectorSummaryDto {
  @ApiProperty({ type: [ComparisonDimensionDto], minItems: 5, maxItems: 5 })
  dimensions!: readonly ComparisonDimensionDto[];
}

class SnapshotCompatibilityDto {
  @ApiProperty()
  compatible!: boolean;

  @ApiProperty({ enum: ["same_snapshot", "snapshot_mismatch"] })
  reason!: string;

  @ApiProperty({ nullable: true, type: String, format: "uuid" })
  sharedId!: string | null;

  @ApiProperty({ nullable: true, type: String, pattern: "^[0-9a-f]{64}$" })
  sharedManifestSha256!: string | null;
}

class PointInTimeCompatibilityDto {
  @ApiProperty()
  compatible!: boolean;

  @ApiProperty({ enum: ["same_point_in_time", "point_in_time_mismatch"] })
  reason!: string;

  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  sharedKnownAt!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    enum: ["true_vintage", "reconstructed", "latest_revised"],
  })
  sharedPolicy!: string | null;

  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  sharedSystemAt!: string | null;
}

class DimensionCompatibilityDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  ordinal!: number;

  @ApiProperty({
    enum: ["macroeconomic", "human_economic", "financial_system", "market", "regime"],
  })
  dimension!: string;

  @ApiProperty()
  compatible!: boolean;

  @ApiProperty({
    enum: [
      "same_model_and_artifact",
      "all_missing",
      "coverage_mismatch",
      "model_definition_mismatch",
      "model_artifact_mismatch",
    ],
  })
  reason!: string;

  @ApiProperty({ nullable: true, type: String, format: "uuid" })
  sharedModelId!: string | null;

  @ApiProperty({ nullable: true, type: String, pattern: "^[0-9a-f]{64}$" })
  sharedModelDefinitionSha256!: string | null;

  @ApiProperty({ nullable: true, type: String, format: "uuid" })
  sharedModelArtifactId!: string | null;

  @ApiProperty({ nullable: true, type: String, pattern: "^[0-9a-f]{64}$" })
  sharedModelArtifactSha256!: string | null;
}

class ComparisonCompatibilityDto {
  @ApiProperty()
  compatible!: boolean;

  @ApiProperty({ type: SnapshotCompatibilityDto })
  snapshot!: SnapshotCompatibilityDto;

  @ApiProperty({ type: PointInTimeCompatibilityDto })
  pointInTime!: PointInTimeCompatibilityDto;

  @ApiProperty({ type: [DimensionCompatibilityDto], minItems: 5, maxItems: 5 })
  dimensions!: readonly DimensionCompatibilityDto[];
}

class ComparisonBasisDto {
  @ApiProperty({ enum: ["exact_id_and_manifest"] })
  snapshot!: string;

  @ApiProperty({ enum: ["exact_policy_known_at_system_at"] })
  pointInTime!: string;

  @ApiProperty({ enum: ["exact_model_and_artifact_identity"] })
  dimension!: string;

  @ApiProperty({ enum: ["persisted_exact_no_normalization"] })
  scoreTreatment!: string;
}

class ComparisonContextDto {
  @ApiProperty({ format: "uuid" })
  workspaceId!: string;

  @ApiProperty({ enum: ["requested"] })
  ordering!: string;

  @ApiProperty({ type: ComparisonBasisDto })
  comparisonBasis!: ComparisonBasisDto;
}

class StateVectorComparisonDto {
  @ApiProperty({ enum: [1] })
  schemaVersion!: number;

  @ApiProperty({ enum: ["research_baseline"] })
  methodologyScope!: string;

  @ApiProperty({ type: [String], minItems: 2, maxItems: 10, uniqueItems: true })
  requestedVectorIds!: readonly string[];

  @ApiProperty({ minimum: 2, maximum: 10 })
  vectorCount!: number;

  @ApiProperty({ type: ComparisonContextDto })
  context!: ComparisonContextDto;

  @ApiProperty({ type: ComparisonCompatibilityDto })
  compatibility!: ComparisonCompatibilityDto;

  @ApiProperty({ type: [ComparisonVectorDto], minItems: 2, maxItems: 10 })
  vectors!: readonly ComparisonVectorDto[];
}

@ApiTags("economic-state")
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: ProblemDetailsDto,
  description: "Access token missing or invalid",
})
@ApiForbiddenResponse({
  type: ProblemDetailsDto,
  description: "Organization identity, workspace membership, role, or entitlement denied",
})
@ApiBadRequestResponse({
  type: ProblemDetailsDto,
  description: "A filter, cursor, limit, PIT cutoff, or comparison identifier list is invalid",
})
@Controller("economic-state")
export class EconomicStateDiscoveryController {
  constructor(
    @Inject(EconomicStateDiscoveryService)
    private readonly discovery: EconomicStateDiscoveryService,
  ) {}

  @Get("vectors")
  @ApiOperation({
    summary: "Discover governed economic-state vectors in one exact PIT context",
    description:
      "Uses stable UUID keyset pagination. Every PIT filter is exact and every vector is hidden whole when one of its reported runs is not currently API-servable.",
  })
  @ApiQuery({ name: "workspaceId", format: "uuid" })
  @ApiQuery({ name: "snapshotId", format: "uuid" })
  @ApiQuery({ name: "knownAt", type: String, format: "date-time" })
  @ApiQuery({ name: "policy", enum: ["true_vintage", "reconstructed", "latest_revised"] })
  @ApiQuery({
    name: "systemAt",
    type: String,
    description: "Exact UTC cutoff or the literal `null`; required to avoid implicit PIT defaults",
  })
  @ApiQuery({ name: "geographyId", required: false, format: "uuid" })
  @ApiQuery({ name: "cursor", required: false, format: "uuid" })
  @ApiQuery({ name: "limit", required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ type: StateVectorDiscoveryPageDto })
  vectors(
    @Req() request: AuthenticatedRequest,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ): Promise<StateVectorDiscoveryPage> {
    return this.discovery.vectors(
      authenticatedPrincipal(request),
      parseStateVectorDiscoveryQuery(rawQuery),
    );
  }

  @Get("comparisons")
  @ApiOperation({
    summary: "Compare two to ten governed vectors without aggregation or ranking",
    description:
      "Preserves caller order and geography kinds. Compatibility is explicit for snapshots, PIT cutoffs, and each model/artifact identity; scores remain exact persisted strings and are never silently normalized.",
  })
  @ApiQuery({ name: "workspaceId", format: "uuid" })
  @ApiQuery({
    name: "vectorIds",
    type: String,
    pattern: "^[0-9a-fA-F-]{36}(,[0-9a-fA-F-]{36}){1,9}$",
    description: "Two to ten unique UUIDs as one comma-separated list, in requested order",
  })
  @ApiOkResponse({ type: StateVectorComparisonDto })
  @ApiNotFoundResponse({
    type: ProblemDetailsDto,
    description: "One or more requested vectors is absent, out of scope, or not currently servable",
  })
  compare(
    @Req() request: AuthenticatedRequest,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ): Promise<StateVectorComparison> {
    return this.discovery.compare(
      authenticatedPrincipal(request),
      parseStateVectorComparisonQuery(rawQuery),
    );
  }
}

function authenticatedPrincipal(request: AuthenticatedRequest): Principal {
  if (!request.principal) throw new Error("Authentication guard invariant failed");
  return request.principal;
}
