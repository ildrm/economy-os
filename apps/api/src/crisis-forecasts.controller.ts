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
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  type CrisisForecastRun,
  type CrisisForecastRunPage,
  CrisisForecastService,
  type CrisisForecastSlotDetail,
  parseCrisisForecastRunPageQuery,
  parseCrisisForecastRunQuery,
} from "./crisis-forecasts.js";
import type { AuthenticatedRequest } from "./http.js";
import { ProblemDetailsDto } from "./problem.dto.js";

class CrisisForecastSlotPointerDto {
  @ApiProperty({ format: "uuid" })
  slotId!: string;

  @ApiProperty({ enum: ["FX", "BANK", "SOV", "MON", "POL", "COUP", "CIV", "WAR"] })
  hazard!: string;

  @ApiProperty({ enum: [30, 90, 180, 365] })
  horizonDays!: number;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  slotSha256!: string;
}

class CrisisForecastSemanticsDto {
  @ApiProperty({ enum: [true] })
  hazardsAreIndependent!: true;

  @ApiProperty({ nullable: true, type: String, example: null })
  aggregateProbability!: null;
}

class CrisisForecastRunPointerDto {
  @ApiProperty({ format: "uuid" })
  runId!: string;

  @ApiProperty({ format: "uuid" })
  geographyId!: string;

  @ApiProperty({ format: "date-time" })
  asOf!: string;

  @ApiProperty({ format: "date-time" })
  generatedAt!: string;

  @ApiProperty({ format: "uuid" })
  datasetSnapshotId!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  runSha256!: string;

  @ApiProperty({ format: "uuid" })
  completionId!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  completionSha256!: string;
}

class CrisisForecastRunDto extends CrisisForecastRunPointerDto {
  @ApiProperty({ enum: [1] })
  schemaVersion!: 1;

  @ApiProperty({ format: "uuid" })
  workspaceId!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  datasetSnapshotSha256!: string;

  @ApiProperty({ enum: [32] })
  slotCount!: 32;

  @ApiProperty({ type: [CrisisForecastSlotPointerDto], minItems: 32, maxItems: 32 })
  slots!: readonly CrisisForecastSlotPointerDto[];

  @ApiProperty({ type: CrisisForecastSemanticsDto })
  semantics!: CrisisForecastSemanticsDto;
}

class CrisisForecastCursorDto {
  @ApiProperty({ format: "date-time" })
  beforeGeneratedAt!: string;

  @ApiProperty({ format: "uuid" })
  beforeRunId!: string;
}

class CrisisForecastRunPageDto {
  @ApiProperty({ format: "uuid" })
  workspaceId!: string;

  @ApiProperty({ format: "uuid" })
  geographyId!: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  count!: number;

  @ApiProperty({ type: [CrisisForecastRunPointerDto], maxItems: 100 })
  runs!: readonly CrisisForecastRunPointerDto[];

  @ApiProperty({ type: CrisisForecastCursorDto, nullable: true })
  nextCursor!: CrisisForecastCursorDto | null;
}

class CrisisForecastProbabilityDto {
  @ApiProperty({ type: String, pattern: "^(?:0(?:\\.[0-9]{1,18})?|1(?:\\.0{1,18})?)$" })
  raw!: string;

  @ApiProperty({ type: String, pattern: "^(?:0(?:\\.[0-9]{1,18})?|1(?:\\.0{1,18})?)$" })
  calibrated!: string;

  @ApiProperty({ nullable: true, type: String, example: null })
  aggregate!: null;
}

class CrisisForecastUncertaintyDto {
  @ApiProperty({ type: String, pattern: "^(?:0(?:\\.[0-9]{1,18})?|1(?:\\.0{1,18})?)$" })
  lower!: string;

  @ApiProperty({ type: String, pattern: "^(?:0(?:\\.[0-9]{1,18})?|1(?:\\.0{1,18})?)$" })
  upper!: string;

  @ApiProperty({ type: String, pattern: "^(?:0(?:\\.[0-9]{1,18})?|1(?:\\.0{1,18})?)$" })
  confidence!: string;

  @ApiProperty({ minLength: 3, maxLength: 128 })
  method!: string;
}

class CrisisForecastModelDto {
  @ApiProperty({ format: "uuid" })
  artifactId!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  artifactSha256!: string;

  @ApiProperty({ pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?$" })
  version!: string;

  @ApiProperty({ format: "date-time" })
  trainingDataCutoff!: string;

  @ApiProperty({ format: "date-time" })
  calibratedThrough!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  configurationSha256!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  codeSha256!: string;
}

class CrisisForecastInvalidationCriterionDto {
  @ApiProperty({ pattern: "^[a-z][a-z0-9_.-]{0,127}$" })
  criterionId!: string;

  @ApiProperty({ minLength: 1, maxLength: 2_000 })
  description!: string;

  @ApiProperty({ pattern: "^[a-z][a-z0-9_.-]{0,127}$" })
  indicatorKey!: string;

  @ApiProperty({
    enum: ["less_than", "less_than_or_equal", "greater_than", "greater_than_or_equal", "equals"],
  })
  operator!: string;

  @ApiProperty({ minLength: 1, maxLength: 2_000 })
  threshold!: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: 999_999 })
  requiredObservations!: number;
}

class CrisisForecastEvidencePointerDto {
  @ApiProperty({ format: "uuid" })
  bindingId!: string;

  @ApiProperty({ enum: ["supports", "contradicts"] })
  role!: string;

  @ApiProperty({ pattern: "^[a-z][a-z0-9_.-]{2,127}$" })
  indicatorKey!: string;

  @ApiProperty({ enum: ["increases_risk", "decreases_risk"] })
  direction!: string;

  @ApiProperty({ format: "date-time" })
  observedAt!: string;

  @ApiProperty({ format: "date-time" })
  availableAt!: string;

  @ApiProperty({
    enum: ["canonical_admission", "relationship_evidence", "economic_state_run"],
  })
  sourceKind!: string;

  @ApiProperty({ format: "uuid" })
  sourceId!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  sourceSha256!: string;

  @ApiProperty({ format: "uuid" })
  dataVintageId!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  dataVintageSha256!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  bindingSha256!: string;
}

class CrisisForecastSlotDetailDto {
  @ApiProperty({ enum: [1] })
  schemaVersion!: 1;

  @ApiProperty({ format: "uuid" })
  workspaceId!: string;

  @ApiProperty({ format: "uuid" })
  slotId!: string;

  @ApiProperty({ format: "uuid" })
  runId!: string;

  @ApiProperty({ format: "uuid" })
  geographyId!: string;

  @ApiProperty({ enum: ["FX", "BANK", "SOV", "MON", "POL", "COUP", "CIV", "WAR"] })
  hazard!: string;

  @ApiProperty({ enum: [30, 90, 180, 365] })
  horizonDays!: number;

  @ApiProperty({ format: "date-time" })
  asOf!: string;

  @ApiProperty({ format: "date-time" })
  generatedAt!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  runSha256!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  slotSha256!: string;

  @ApiProperty({ type: CrisisForecastProbabilityDto })
  probability!: CrisisForecastProbabilityDto;

  @ApiProperty({ type: CrisisForecastUncertaintyDto })
  uncertainty!: CrisisForecastUncertaintyDto;

  @ApiProperty({ enum: ["calibrated", "uncalibrated"] })
  calibrationStatus!: string;

  @ApiProperty({ type: Boolean })
  outOfDomain!: boolean;

  @ApiProperty({ type: CrisisForecastModelDto })
  model!: CrisisForecastModelDto;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 100 })
  assumptions!: readonly string[];

  @ApiProperty({ type: [CrisisForecastInvalidationCriterionDto], minItems: 1, maxItems: 100 })
  invalidationCriteria!: readonly CrisisForecastInvalidationCriterionDto[];

  @ApiProperty({ type: String, nullable: true, minLength: 10, maxLength: 500 })
  evidenceAbsenceReason!: string | null;

  @ApiProperty({ type: String, nullable: true, minLength: 10, maxLength: 500 })
  counterEvidenceAbsenceReason!: string | null;

  @ApiProperty({ type: [CrisisForecastEvidencePointerDto], maxItems: 100 })
  evidence!: readonly CrisisForecastEvidencePointerDto[];
}

@ApiTags("crisis forecasts")
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: ProblemDetailsDto,
  description: "Access token missing or invalid",
})
@ApiForbiddenResponse({
  type: ProblemDetailsDto,
  description: "Workspace, role, classification, entitlement, or organization access denied",
})
@ApiBadRequestResponse({ type: ProblemDetailsDto, description: "Request input is invalid" })
@Controller("crisis/forecast-runs")
export class CrisisForecastController {
  constructor(
    @Inject(CrisisForecastService)
    private readonly forecasts: CrisisForecastService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List completed crisis-forecast run pointers for one geography",
    description:
      "Returns bounded immutable pointers only. Independent hazards are never collapsed into an aggregate probability.",
  })
  @ApiQuery({ name: "workspaceId", format: "uuid" })
  @ApiQuery({ name: "geographyId", format: "uuid" })
  @ApiQuery({ name: "limit", required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiQuery({ name: "beforeGeneratedAt", required: false, format: "date-time" })
  @ApiQuery({ name: "beforeRunId", required: false, format: "uuid" })
  @ApiOkResponse({ type: CrisisForecastRunPageDto })
  list(
    @Req() request: AuthenticatedRequest,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ): Promise<CrisisForecastRunPage> {
    return this.forecasts.list(
      authenticatedPrincipal(request),
      parseCrisisForecastRunPageQuery(rawQuery),
    );
  }

  @Get(":runId")
  @ApiOperation({
    summary: "Read one completed crisis-forecast run manifest",
    description:
      "Returns the exact 32 hazard/horizon slot identities and digests, not unreviewed probability content.",
  })
  @ApiParam({ name: "runId", format: "uuid" })
  @ApiQuery({ name: "workspaceId", format: "uuid" })
  @ApiOkResponse({ type: CrisisForecastRunDto })
  @ApiNotFoundResponse({
    type: ProblemDetailsDto,
    description: "Run is missing, inaccessible, incomplete, or no longer currently servable",
  })
  get(
    @Req() request: AuthenticatedRequest,
    @Param("runId") runId: string,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ): Promise<CrisisForecastRun> {
    return this.forecasts.get(
      authenticatedPrincipal(request),
      runId,
      parseCrisisForecastRunQuery(rawQuery),
    );
  }
}

@ApiTags("crisis forecasts")
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: ProblemDetailsDto,
  description: "Access token missing or invalid",
})
@ApiForbiddenResponse({
  type: ProblemDetailsDto,
  description: "Workspace, role, classification, entitlement, or organization access denied",
})
@ApiBadRequestResponse({ type: ProblemDetailsDto, description: "Request input is invalid" })
@Controller("crisis/forecast-slots")
export class CrisisForecastSlotController {
  constructor(
    @Inject(CrisisForecastService)
    private readonly forecasts: CrisisForecastService,
  ) {}

  @Get(":slotId")
  @ApiOperation({
    summary: "Read one completed crisis-forecast slot",
    description:
      "Returns one independently calibrated hazard/horizon probability with uncertainty, model provenance, assumptions, invalidation criteria, and point-in-time evidence pointers. No aggregate crisis probability is produced.",
  })
  @ApiParam({ name: "slotId", format: "uuid" })
  @ApiQuery({ name: "workspaceId", format: "uuid" })
  @ApiOkResponse({ type: CrisisForecastSlotDetailDto })
  @ApiNotFoundResponse({
    type: ProblemDetailsDto,
    description: "Slot is missing, inaccessible, incomplete, or no longer currently servable",
  })
  get(
    @Req() request: AuthenticatedRequest,
    @Param("slotId") slotId: string,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ): Promise<CrisisForecastSlotDetail> {
    return this.forecasts.getSlot(
      authenticatedPrincipal(request),
      slotId,
      parseCrisisForecastRunQuery(rawQuery),
    );
  }
}

function authenticatedPrincipal(request: AuthenticatedRequest): Principal {
  if (!request.principal) throw new Error("Authentication guard invariant failed");
  return request.principal;
}
