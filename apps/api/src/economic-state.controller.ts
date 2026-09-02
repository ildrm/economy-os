import type { Principal } from "@economyos/contracts";
import { Controller, Get, Inject, Param, Query, Req } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  EconomicStateService,
  parseStatePageQuery,
  parseStateResourceQuery,
  parseStateRunPageQuery,
  type StateModel,
  type StateModelComponentCollection,
  type StateModelPage,
  type StateRun,
  type StateRunComponentCollection,
  type StateRunPage,
  type StateVector,
} from "./economic-state.js";
import type { AuthenticatedRequest } from "./http.js";
import { ProblemDetailsDto } from "./problem.dto.js";

class StateLinksDto {
  @ApiProperty({ example: "/api/v1/economic-state/runs/018f...?workspaceId=018f..." })
  self!: string;

  @ApiPropertyOptional({ example: "/api/v1/economic-state/models/018f...?workspaceId=018f..." })
  model?: string;

  @ApiProperty({ example: "/api/v1/economic-state/runs/018f.../components?workspaceId=018f..." })
  components!: string;
}

class StateModelDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "macroeconomic.output-labor" })
  key!: string;

  @ApiProperty({ example: "1.0.0" })
  version!: string;

  @ApiProperty({
    enum: ["macroeconomic", "human_economic", "financial_system", "market", "regime"],
  })
  dimension!: string;

  @ApiProperty({ enum: [1, 2], description: "Immutable model governance contract version" })
  governanceSchemaVersion!: number;

  @ApiProperty({ nullable: true, type: String, format: "uuid" })
  modelArtifactId!: string | null;

  @ApiProperty({ nullable: true, type: String, pattern: "^[0-9a-f]{64}$" })
  modelArtifactSha256!: string | null;

  @ApiProperty({ type: String, example: "0.6", description: "Exact decimal encoded as a string" })
  minimumCoverage!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  definitionSha256!: string;

  @ApiProperty({ minimum: 1, maximum: 100 })
  componentCount!: number;

  @ApiProperty({ format: "uuid" })
  createdBy!: string;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ type: StateLinksDto })
  links!: StateLinksDto;
}

class StateModelPageDto {
  @ApiProperty({ minimum: 0, maximum: 100 })
  count!: number;

  @ApiProperty({ nullable: true, type: String, format: "uuid" })
  nextCursor!: string | null;

  @ApiProperty({ type: [StateModelDto] })
  models!: readonly StateModelDto[];
}

class ConceptDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "economy.output.gdp" })
  canonicalKey!: string;

  @ApiProperty({ example: "Gross domestic product" })
  name!: string;
}

class StateComponentParserDto {
  @ApiProperty({ example: "wdi-json-stat-v2" })
  name!: string;

  @ApiProperty({ example: "2.0.0" })
  version!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  codeSha256!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  configurationSha256!: string;
}

class StateModelComponentDto {
  @ApiProperty({ example: "gdp" })
  key!: string;

  @ApiProperty({ type: ConceptDto })
  concept!: ConceptDto;

  @ApiProperty({ nullable: true, type: String, format: "uuid" })
  seriesId!: string | null;

  @ApiProperty({ nullable: true, type: String, example: "USD" })
  unitCode!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    enum: ["event", "daily", "weekly", "monthly", "quarterly", "annual", "irregular"],
  })
  frequency!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    enum: ["adjusted", "unadjusted", "not_applicable", "unknown"],
  })
  seasonalAdjustment!: string | null;

  @ApiProperty({ nullable: true, type: StateComponentParserDto })
  parser!: StateComponentParserDto | null;

  @ApiProperty({ nullable: true, type: String, pattern: "^[0-9a-f]{64}$" })
  featureContractSha256!: string | null;

  @ApiProperty({ type: String, example: "0.6", description: "Exact decimal encoded as a string" })
  weight!: string;

  @ApiProperty({ enum: ["positive", "negative"] })
  polarity!: string;

  @ApiProperty({ type: String, example: "0", description: "Exact decimal encoded as a string" })
  lowerBound!: string;

  @ApiProperty({ type: String, example: "100", description: "Exact decimal encoded as a string" })
  upperBound!: string;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

class StateModelComponentCollectionDto {
  @ApiProperty({ format: "uuid" })
  modelId!: string;

  @ApiProperty({ minimum: 1, maximum: 100 })
  count!: number;

  @ApiProperty({ type: [StateModelComponentDto], maxItems: 100 })
  components!: readonly StateModelComponentDto[];
}

class StateRunModelDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  key!: string;

  @ApiProperty()
  version!: string;

  @ApiProperty()
  dimension!: string;

  @ApiProperty({ enum: [1, 2] })
  governanceSchemaVersion!: number;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  definitionSha256!: string;
}

class StateSnapshotDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  manifestSha256!: string;
}

class GeographyDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  codeScheme!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

class StatePointInTimeDto {
  @ApiProperty({ format: "date-time" })
  knownAt!: string;

  @ApiProperty({ enum: ["true_vintage", "reconstructed", "latest_revised"] })
  policy!: string;

  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  systemAt!: string | null;
}

class StateRunDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: StateRunModelDto })
  model!: StateRunModelDto;

  @ApiProperty({ nullable: true, type: String, format: "uuid" })
  modelArtifactId!: string | null;

  @ApiProperty({ nullable: true, type: String, pattern: "^[0-9a-f]{64}$" })
  modelArtifactSha256!: string | null;

  @ApiProperty({ type: StateSnapshotDto })
  snapshot!: StateSnapshotDto;

  @ApiProperty({ type: GeographyDto })
  geography!: GeographyDto;

  @ApiProperty({ type: StatePointInTimeDto })
  pointInTime!: StatePointInTimeDto;

  @ApiProperty({ enum: ["complete", "partial", "insufficient_data"] })
  status!: string;

  @ApiProperty({ nullable: true, type: String, description: "Exact decimal encoded as a string" })
  score!: string | null;

  @ApiProperty({ nullable: true, type: String })
  missingReason!: string | null;

  @ApiProperty({ type: String, description: "Exact decimal encoded as a string" })
  completeness!: string;

  @ApiProperty({ type: String, description: "Exact decimal encoded as a string" })
  sourceCoverage!: string;

  @ApiProperty({ type: String, description: "Exact decimal encoded as a string" })
  confidence!: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  distinctSourceCount!: number;

  @ApiProperty()
  renormalized!: boolean;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  resultManifestSha256!: string;

  @ApiProperty({ format: "uuid" })
  calculatedBy!: string;

  @ApiProperty({ format: "date-time" })
  calculatedAt!: string;

  @ApiProperty({ type: StateLinksDto })
  links!: StateLinksDto;
}

class StateRunPageDto {
  @ApiProperty({ minimum: 0, maximum: 100 })
  count!: number;

  @ApiProperty({ nullable: true, type: String, format: "uuid" })
  nextCursor!: string | null;

  @ApiProperty({ type: [StateRunDto] })
  runs!: readonly StateRunDto[];
}

class StateEvidenceLinkDto {
  @ApiProperty({ format: "uuid" })
  observationId!: string;

  @ApiProperty({ format: "uuid" })
  sourceId!: string;

  @ApiProperty({ example: "/api/v1/evidence/observations/018f.../provenance" })
  provenance!: string;
}

class StateLicenseReviewEvidenceDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  sourceSlug!: string;

  @ApiProperty({ nullable: true, type: String })
  datasetExternalKey!: string | null;

  @ApiProperty({ format: "uri" })
  evidenceUri!: string;

  @ApiProperty()
  licenseExpression!: string;

  @ApiProperty({ type: [String], enum: ["view", "api", "export", "derive", "train"] })
  intendedUses!: readonly string[];

  @ApiProperty({ type: "object", additionalProperties: true })
  evidence!: Readonly<Record<string, unknown>>;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  evidenceSha256!: string;

  @ApiProperty()
  reviewedBy!: string;

  @ApiProperty({ format: "date-time" })
  reviewedAt!: string;

  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  expiresAt!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

class StateSourceAdmissionDecisionEvidenceDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ nullable: true, type: String, format: "uuid" })
  organizationId!: string | null;

  @ApiProperty({ format: "uuid" })
  sourceId!: string;

  @ApiProperty({ nullable: true, type: String, format: "uuid" })
  sourceDatasetId!: string | null;

  @ApiProperty({ enum: ["approved"] })
  decision!: string;

  @ApiProperty({ type: [String], enum: ["view", "api", "export", "derive", "train"] })
  permittedActions!: readonly string[];

  @ApiProperty({ format: "uuid" })
  licenseReviewId!: string;

  @ApiProperty()
  reason!: string;

  @ApiProperty()
  decidedBy!: string;

  @ApiProperty({ format: "date-time" })
  decidedAt!: string;

  @ApiProperty({ format: "date-time" })
  recordedAt!: string;
}

class StateLegalEvidenceManifestDto {
  @ApiProperty({ enum: [1] })
  schemaVersion!: number;

  @ApiProperty({ enum: ["derive"] })
  action!: string;

  @ApiProperty({ format: "uuid" })
  organizationId!: string;

  @ApiProperty({ format: "uuid" })
  observationId!: string;

  @ApiProperty({ format: "uuid" })
  sourceId!: string;

  @ApiProperty({ format: "uuid" })
  sourceDatasetId!: string;

  @ApiProperty({ type: StateLicenseReviewEvidenceDto })
  licenseReview!: StateLicenseReviewEvidenceDto;

  @ApiProperty({ type: StateSourceAdmissionDecisionEvidenceDto })
  sourceAdmissionDecision!: StateSourceAdmissionDecisionEvidenceDto;
}

class StateRunComponentDto {
  @ApiProperty()
  key!: string;

  @ApiProperty({ type: ConceptDto })
  concept!: ConceptDto;

  @ApiProperty({ nullable: true, type: String, format: "uuid" })
  seriesId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  unitCode!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    enum: ["event", "daily", "weekly", "monthly", "quarterly", "annual", "irregular"],
  })
  frequency!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    enum: ["adjusted", "unadjusted", "not_applicable", "unknown"],
  })
  seasonalAdjustment!: string | null;

  @ApiProperty({ nullable: true, type: StateComponentParserDto })
  parser!: StateComponentParserDto | null;

  @ApiProperty({ nullable: true, type: String, pattern: "^[0-9a-f]{64}$" })
  featureContractSha256!: string | null;

  @ApiProperty({ type: String, description: "Exact decimal encoded as a string" })
  weight!: string;

  @ApiProperty({ enum: ["positive", "negative"] })
  polarity!: string;

  @ApiProperty({ type: String, description: "Exact decimal encoded as a string" })
  lowerBound!: string;

  @ApiProperty({ type: String, description: "Exact decimal encoded as a string" })
  upperBound!: string;

  @ApiProperty({ nullable: true, type: String, description: "Exact decimal encoded as a string" })
  rawValue!: string | null;

  @ApiProperty({ nullable: true, type: String, description: "Exact decimal encoded as a string" })
  normalizedValue!: string | null;

  @ApiProperty({ nullable: true, type: String, description: "Exact decimal encoded as a string" })
  contribution!: string | null;

  @ApiProperty({ nullable: true, type: String })
  missingReason!: string | null;

  @ApiProperty({ nullable: true, type: String, description: "Exact decimal encoded as a string" })
  quality!: string | null;

  @ApiProperty({ nullable: true, type: String, pattern: "^[0-9a-f]{64}$" })
  qualityEvidenceSha256!: string | null;

  @ApiProperty({ nullable: true, type: String, format: "uuid" })
  sourceDatasetId!: string | null;

  @ApiProperty({ nullable: true, type: String, format: "uuid" })
  licenseReviewId!: string | null;

  @ApiProperty({ nullable: true, type: String, format: "uuid" })
  sourceAdmissionDecisionId!: string | null;

  @ApiProperty({ nullable: true, type: String, pattern: "^[0-9a-f]{64}$" })
  legalEvidenceSha256!: string | null;

  @ApiProperty({ nullable: true, type: StateLegalEvidenceManifestDto })
  legalEvidenceManifest!: StateLegalEvidenceManifestDto | null;

  @ApiProperty({ nullable: true, type: StateEvidenceLinkDto })
  evidence!: StateEvidenceLinkDto | null;
}

class StateRunComponentCollectionDto {
  @ApiProperty({ format: "uuid" })
  runId!: string;

  @ApiProperty({ minimum: 1, maximum: 100 })
  count!: number;

  @ApiProperty({ type: [StateRunComponentDto], maxItems: 100 })
  components!: readonly StateRunComponentDto[];
}

class StateVectorGeographyDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: ["world", "region", "country", "economy", "subnational"] })
  kind!: string;

  @ApiProperty()
  codeScheme!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

class StateVectorArtifactDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  sha256!: string;

  @ApiProperty()
  algorithmKey!: string;

  @ApiProperty()
  algorithmVersion!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  configurationSha256!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  normalizationSha256!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  assumptionsSha256!: string;

  @ApiProperty({
    pattern: "^[0-9a-f]{64}$",
    description: "Frozen approval-evidence digest; not a current production approval claim",
  })
  approvalSha256!: string;

  @ApiProperty({
    enum: ["research", "validated", "approved", "restricted", "retired"],
    description: "Frozen artifact-manifest lifecycle identity, not a current serving status",
  })
  lifecycleStatus!: string;
}

class StateVectorModelDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  key!: string;

  @ApiProperty()
  version!: string;

  @ApiProperty({
    enum: ["macroeconomic", "human_economic", "financial_system", "market", "regime"],
  })
  dimension!: string;

  @ApiProperty({ enum: [2] })
  governanceSchemaVersion!: number;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  definitionSha256!: string;

  @ApiProperty({ type: StateVectorArtifactDto })
  artifact!: StateVectorArtifactDto;

  @ApiProperty({ type: StateLinksDto })
  links!: StateLinksDto;
}

class StateVectorRunDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  modelDefinitionSha256!: string;

  @ApiProperty({ format: "uuid" })
  modelArtifactId!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  modelArtifactSha256!: string;

  @ApiProperty({ enum: ["complete", "partial", "insufficient_data"] })
  status!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: "Exact model-specific decimal; not a cross-dimension score",
  })
  score!: string | null;

  @ApiProperty({ nullable: true, type: String })
  missingReason!: string | null;

  @ApiProperty({ type: String, description: "Exact decimal encoded as a string" })
  completeness!: string;

  @ApiProperty({ type: String, description: "Exact decimal encoded as a string" })
  sourceCoverage!: string;

  @ApiProperty({
    type: String,
    description: "Exact evidence-confidence diagnostic; not a probability",
  })
  confidence!: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  distinctSourceCount!: number;

  @ApiProperty()
  renormalized!: boolean;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  resultManifestSha256!: string;

  @ApiProperty({ format: "uuid" })
  calculatedBy!: string;

  @ApiProperty({ format: "date-time" })
  calculatedAt!: string;

  @ApiProperty({ type: StateLinksDto })
  links!: StateLinksDto;
}

class StateVectorDimensionDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  ordinal!: number;

  @ApiProperty({
    enum: ["macroeconomic", "human_economic", "financial_system", "market", "regime"],
  })
  dimension!: string;

  @ApiProperty({ nullable: true, type: StateVectorModelDto })
  model!: StateVectorModelDto | null;

  @ApiProperty({ nullable: true, type: StateVectorRunDto })
  run!: StateVectorRunDto | null;

  @ApiProperty({ nullable: true, type: String })
  missingReason!: string | null;
}

class StateVectorDiagnosticsDto {
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

class StateVectorLinksDto {
  @ApiProperty({ example: "/api/v1/economic-state/vectors/018f...?workspaceId=018f..." })
  self!: string;
}

class StateVectorDto {
  @ApiProperty({ enum: [1], description: "Economic-state vector API response schema" })
  schemaVersion!: number;

  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({
    enum: ["research_baseline"],
    description: "Methodology scope; not a production-validation or decision-use claim",
  })
  methodologyScope!: string;

  @ApiProperty({ type: StateVectorGeographyDto })
  geography!: StateVectorGeographyDto;

  @ApiProperty({ type: StateSnapshotDto })
  snapshot!: StateSnapshotDto;

  @ApiProperty({ type: StatePointInTimeDto })
  pointInTime!: StatePointInTimeDto;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  contextSha256!: string;

  @ApiProperty({ type: StateVectorDiagnosticsDto })
  diagnostics!: StateVectorDiagnosticsDto;

  @ApiProperty({ type: [StateVectorDimensionDto], minItems: 5, maxItems: 5 })
  dimensions!: readonly StateVectorDimensionDto[];

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  stateManifestSha256!: string;

  @ApiProperty({ format: "uuid" })
  assembledBy!: string;

  @ApiProperty({ format: "date-time" })
  assembledAt!: string;

  @ApiProperty({ type: StateVectorLinksDto })
  links!: StateVectorLinksDto;
}

@ApiTags("economic-state")
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: ProblemDetailsDto,
  description: "Access token missing or invalid",
})
@ApiForbiddenResponse({
  type: ProblemDetailsDto,
  description: "Organization identity or workspace membership denied",
})
@ApiBadRequestResponse({
  type: ProblemDetailsDto,
  description: "A path, filter, cursor, or page limit is invalid",
})
@Controller("economic-state")
export class EconomicStateController {
  constructor(@Inject(EconomicStateService) private readonly state: EconomicStateService) {}

  @Get("models")
  @ApiOperation({ summary: "List immutable economic-state model definitions" })
  @ApiQuery({ name: "workspaceId", format: "uuid" })
  @ApiQuery({ name: "cursor", required: false, format: "uuid" })
  @ApiQuery({ name: "limit", required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ type: StateModelPageDto })
  models(
    @Req() request: AuthenticatedRequest,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ): Promise<StateModelPage> {
    return this.state.models(authenticatedPrincipal(request), parseStatePageQuery(rawQuery));
  }

  @Get("models/:modelId")
  @ApiOperation({ summary: "Read one immutable economic-state model definition" })
  @ApiParam({ name: "modelId", format: "uuid" })
  @ApiQuery({ name: "workspaceId", format: "uuid" })
  @ApiOkResponse({ type: StateModelDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto, description: "No visible model was found" })
  model(
    @Req() request: AuthenticatedRequest,
    @Param("modelId") modelId: string,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ): Promise<StateModel> {
    return this.state.model(
      authenticatedPrincipal(request),
      modelId,
      parseStateResourceQuery(rawQuery),
    );
  }

  @Get("models/:modelId/components")
  @ApiOperation({ summary: "Read the bounded component definition set for a state model" })
  @ApiParam({ name: "modelId", format: "uuid" })
  @ApiQuery({ name: "workspaceId", format: "uuid" })
  @ApiOkResponse({ type: StateModelComponentCollectionDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto, description: "No visible model was found" })
  modelComponents(
    @Req() request: AuthenticatedRequest,
    @Param("modelId") modelId: string,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ): Promise<StateModelComponentCollection> {
    return this.state.modelComponents(
      authenticatedPrincipal(request),
      modelId,
      parseStateResourceQuery(rawQuery),
    );
  }

  @Get("runs")
  @ApiOperation({
    summary: "List reproducible economic-state calculation runs",
    description:
      "Fails closed: runs are omitted when an observed component dataset is no longer admitted or its source no longer permits current API serving.",
  })
  @ApiQuery({ name: "workspaceId", format: "uuid" })
  @ApiQuery({ name: "modelId", required: false, format: "uuid" })
  @ApiQuery({ name: "geographyId", required: false, format: "uuid" })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["complete", "partial", "insufficient_data"],
  })
  @ApiQuery({ name: "cursor", required: false, format: "uuid" })
  @ApiQuery({ name: "limit", required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ type: StateRunPageDto })
  runs(
    @Req() request: AuthenticatedRequest,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ): Promise<StateRunPage> {
    return this.state.runs(authenticatedPrincipal(request), parseStateRunPageQuery(rawQuery));
  }

  @Get("runs/:runId")
  @ApiOperation({
    summary: "Read one reproducible economic-state calculation run",
    description:
      "Returns no resource when an observed component dataset is not currently admitted or its source lacks an approved, unexpired API license.",
  })
  @ApiParam({ name: "runId", format: "uuid" })
  @ApiQuery({ name: "workspaceId", format: "uuid" })
  @ApiOkResponse({ type: StateRunDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto, description: "No visible run was found" })
  run(
    @Req() request: AuthenticatedRequest,
    @Param("runId") runId: string,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ): Promise<StateRun> {
    return this.state.run(
      authenticatedPrincipal(request),
      runId,
      parseStateResourceQuery(rawQuery),
    );
  }

  @Get("runs/:runId/components")
  @ApiOperation({
    summary: "Read exact component results with governed legal and provenance evidence",
    description:
      "Includes immutable calculation-time derive authorization; the parent run must also pass the current API-servability gate.",
  })
  @ApiParam({ name: "runId", format: "uuid" })
  @ApiQuery({ name: "workspaceId", format: "uuid" })
  @ApiOkResponse({ type: StateRunComponentCollectionDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto, description: "No visible run was found" })
  runComponents(
    @Req() request: AuthenticatedRequest,
    @Param("runId") runId: string,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ): Promise<StateRunComponentCollection> {
    return this.state.runComponents(
      authenticatedPrincipal(request),
      runId,
      parseStateResourceQuery(rawQuery),
    );
  }

  @Get("vectors/:vectorId")
  @ApiOperation({
    summary: "Read one persisted five-dimensional economic-state vector",
    description:
      "Returns a Phase 3 research baseline with explicit missingness and no overall score or rank. The whole vector is hidden if any reported run is not currently serveable through the API.",
  })
  @ApiParam({ name: "vectorId", format: "uuid" })
  @ApiQuery({ name: "workspaceId", format: "uuid" })
  @ApiOkResponse({ type: StateVectorDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto, description: "No visible vector was found" })
  vector(
    @Req() request: AuthenticatedRequest,
    @Param("vectorId") vectorId: string,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ): Promise<StateVector> {
    return this.state.vector(
      authenticatedPrincipal(request),
      vectorId,
      parseStateResourceQuery(rawQuery),
    );
  }
}

function authenticatedPrincipal(request: AuthenticatedRequest): Principal {
  if (!request.principal) throw new Error("Authentication guard invariant failed");
  return request.principal;
}
