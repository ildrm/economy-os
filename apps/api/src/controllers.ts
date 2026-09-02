import type { Principal } from "@economyos/contracts";
import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Req,
  ServiceUnavailableException,
} from "@nestjs/common";
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
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Public } from "./auth.js";
import { PostgresRuntime } from "./database.js";
import {
  GovernedEvidenceService,
  parseObservationQuery,
  parseProvenanceQuery,
} from "./evidence.js";
import type { AuthenticatedRequest } from "./http.js";
import { ProblemDetailsDto } from "./problem.dto.js";
import { WorkspaceAccessService } from "./workspaces.js";

class LiveHealthDto {
  @ApiProperty({ example: "ok" })
  status!: "ok";

  @ApiProperty({ example: "economyos-api" })
  service!: string;

  @ApiProperty({
    example: {
      foundation: "accepted",
      canonicalData: "accepted",
      analytics: "in_progress",
    },
  })
  phase!: Readonly<Record<string, string>>;
}

class ReadyHealthDto {
  @ApiProperty({ example: "ready" })
  status!: "ready";

  @ApiProperty({ example: "economyos-api" })
  service!: string;

  @ApiProperty({ example: { database: "ready" } })
  dependencies!: { readonly database: "ready" };
}

class PrincipalDto {
  @ApiProperty({ format: "uuid" })
  subjectId!: string;

  @ApiProperty({ format: "uuid" })
  organizationId!: string;

  @ApiProperty({ type: [String], format: "uuid" })
  workspaceIds!: readonly string[];

  @ApiProperty({ type: [String] })
  scopes!: readonly string[];

  @ApiProperty({ enum: ["oidc", "service"] })
  authenticationMethod!: string;

  @ApiProperty({ format: "date-time" })
  issuedAt!: string;

  @ApiProperty({ format: "date-time" })
  expiresAt!: string;
}

class WorkspaceAccessDto {
  @ApiProperty({ format: "uuid" })
  workspaceId!: string;

  @ApiProperty({ example: "member" })
  access!: "member";
}

class PointInTimeDto {
  @ApiProperty({ format: "date-time" })
  knownAt!: string;

  @ApiProperty({ enum: ["true_vintage", "reconstructed", "latest_revised"] })
  policy!: string;

  @ApiPropertyOptional({ format: "date-time" })
  systemAt?: string;
}

class GovernedObservationDto {
  @ApiProperty({ format: "uuid" })
  observationId!: string;

  @ApiProperty({ format: "uuid" })
  seriesId!: string;

  @ApiProperty({ format: "uuid" })
  releaseId!: string;

  @ApiProperty({ format: "uuid" })
  rawPayloadId!: string;

  @ApiProperty({ format: "uuid" })
  transformationRunId!: string;

  @ApiProperty({ format: "date-time" })
  periodStart!: string;

  @ApiProperty({ format: "date-time" })
  periodEnd!: string;

  @ApiProperty({ nullable: true, type: String, description: "Exact decimal encoded as a string" })
  value!: string | null;

  @ApiProperty({ nullable: true, type: String })
  missingReason!: string | null;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  parserVersion!: string;

  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  releaseTime!: string | null;

  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  availabilityTime!: string | null;

  @ApiProperty({ format: "date-time" })
  retrievedAt!: string;

  @ApiProperty({ enum: ["true_vintage", "reconstructed_only", "latest_revised_only"] })
  pitQuality!: string;

  @ApiProperty({ format: "date-time" })
  recordedAt!: string;
}

class GovernedObservationPageDto {
  @ApiProperty({ format: "uuid" })
  seriesId!: string;

  @ApiProperty({ type: PointInTimeDto })
  pointInTime!: PointInTimeDto;

  @ApiProperty({ minimum: 0, maximum: 1000 })
  count!: number;

  @ApiProperty({ type: [GovernedObservationDto] })
  observations!: readonly GovernedObservationDto[];
}

class ProvenanceDatasetDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  externalKey!: string;
}

class ProvenanceSourceDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ format: "uri" })
  homepageUri!: string;

  @ApiProperty()
  license!: string;

  @ApiProperty()
  attribution!: string;
}

class ProvenanceRawPayloadDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  objectUri!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  checksumSha256!: string;

  @ApiProperty({ format: "date-time" })
  fetchedAt!: string;
}

class ProvenanceReleaseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  releaseTime!: string | null;

  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  availabilityTime!: string | null;

  @ApiProperty({ enum: ["true_vintage", "reconstructed_only", "latest_revised_only"] })
  pitQuality!: string;
}

class ProvenanceTransformationDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  parser!: string;

  @ApiProperty()
  parserVersion!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  codeSha256!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  configurationSha256!: string;
}

class ProvenanceQualityDto {
  @ApiProperty()
  code!: string;

  @ApiProperty({ enum: ["pass", "warn", "fail"] })
  status!: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  details!: Readonly<Record<string, unknown>>;

  @ApiProperty({ format: "date-time" })
  checkedAt!: string;
}

class GovernedProvenanceDto {
  @ApiProperty({ format: "uuid" })
  observationId!: string;

  @ApiProperty({ format: "uuid" })
  seriesId!: string;

  @ApiProperty({ type: ProvenanceDatasetDto })
  dataset!: ProvenanceDatasetDto;

  @ApiProperty({ type: ProvenanceSourceDto })
  source!: ProvenanceSourceDto;

  @ApiProperty({ type: ProvenanceRawPayloadDto })
  rawPayload!: ProvenanceRawPayloadDto;

  @ApiProperty({ type: ProvenanceReleaseDto })
  release!: ProvenanceReleaseDto;

  @ApiProperty({ type: ProvenanceTransformationDto })
  transformation!: ProvenanceTransformationDto;

  @ApiProperty({ type: [ProvenanceQualityDto] })
  quality!: readonly ProvenanceQualityDto[];
}

@ApiTags("operations")
@Controller("health")
export class HealthController {
  constructor(@Inject(PostgresRuntime) private readonly database: PostgresRuntime) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Process liveness and implementation-phase status" })
  @ApiOkResponse({ type: LiveHealthDto })
  health(): LiveHealthDto {
    return this.live();
  }

  @Public()
  @Get("live")
  @ApiOperation({ summary: "Process liveness" })
  @ApiOkResponse({ type: LiveHealthDto })
  live(): LiveHealthDto {
    return {
      status: "ok",
      service: "economyos-api",
      phase: { foundation: "accepted", canonicalData: "accepted", analytics: "in_progress" },
    };
  }

  @Public()
  @Get("ready")
  @ApiOperation({ summary: "Traffic readiness, including the PostgreSQL dependency" })
  @ApiOkResponse({ type: ReadyHealthDto })
  @ApiServiceUnavailableResponse({
    type: ProblemDetailsDto,
    description: "A required dependency is unavailable",
  })
  async ready(): Promise<ReadyHealthDto> {
    if (!(await this.database.isReady())) {
      throw new ServiceUnavailableException({ code: "DATABASE_UNAVAILABLE" });
    }
    return { status: "ready", service: "economyos-api", dependencies: { database: "ready" } };
  }
}

@ApiTags("identity")
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: ProblemDetailsDto,
  description: "Access token missing or invalid",
})
@ApiForbiddenResponse({
  type: ProblemDetailsDto,
  description: "Database identity or membership is inactive",
})
@Controller("me")
export class IdentityController {
  constructor(
    @Inject(WorkspaceAccessService) private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Return authenticated context reconciled with active membership" })
  @ApiOkResponse({ type: PrincipalDto })
  async me(@Req() request: AuthenticatedRequest): Promise<Principal> {
    return this.workspaceAccess.reconcilePrincipal(authenticatedPrincipal(request));
  }
}

@ApiTags("workspaces")
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: ProblemDetailsDto,
  description: "Access token missing or invalid",
})
@ApiForbiddenResponse({ type: ProblemDetailsDto, description: "Workspace access denied" })
@Controller("workspaces")
export class WorkspacesController {
  constructor(@Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService) {}

  @Get(":workspaceId/access")
  @ApiOperation({ summary: "Verify active database-backed workspace membership" })
  @ApiParam({ name: "workspaceId", format: "uuid" })
  @ApiOkResponse({ type: WorkspaceAccessDto })
  async accessCheck(
    @Req() request: AuthenticatedRequest,
    @Param("workspaceId") requestedId: string,
  ): Promise<WorkspaceAccessDto> {
    const id = await this.access.assertMembership(authenticatedPrincipal(request), requestedId);
    return { workspaceId: id, access: "member" };
  }
}

@ApiTags("evidence")
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: ProblemDetailsDto,
  description: "Access token missing or invalid",
})
@ApiForbiddenResponse({
  type: ProblemDetailsDto,
  description: "Organization access or data license denied",
})
@ApiBadRequestResponse({
  type: ProblemDetailsDto,
  description: "A path or query parameter is invalid",
})
@Controller("evidence")
export class EvidenceController {
  constructor(
    @Inject(GovernedEvidenceService) private readonly evidence: GovernedEvidenceService,
  ) {}

  @Get("series/:seriesId/observations")
  @ApiOperation({
    summary: "Read organization/global observations through governed point-in-time semantics",
  })
  @ApiParam({ name: "seriesId", format: "uuid" })
  @ApiQuery({ name: "knownAt", format: "date-time" })
  @ApiQuery({ name: "policy", enum: ["true_vintage", "reconstructed", "latest_revised"] })
  @ApiQuery({ name: "systemAt", required: false, format: "date-time" })
  @ApiQuery({ name: "limit", required: false, type: Number, minimum: 1, maximum: 1000 })
  @ApiOkResponse({ type: GovernedObservationPageDto })
  observations(
    @Req() request: AuthenticatedRequest,
    @Param("seriesId") seriesId: string,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ) {
    return this.evidence.observations(
      authenticatedPrincipal(request),
      seriesId,
      parseObservationQuery(rawQuery),
    );
  }

  @Get("observations/:observationId/provenance")
  @ApiOperation({
    summary: "Read organization/global source, transformation, quality, and license provenance",
  })
  @ApiParam({ name: "observationId", format: "uuid" })
  @ApiOkResponse({ type: GovernedProvenanceDto, description: "Governed observation provenance" })
  @ApiNotFoundResponse({
    type: ProblemDetailsDto,
    description: "No visible governed observation was found",
  })
  provenance(
    @Req() request: AuthenticatedRequest,
    @Param("observationId") observationId: string,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ) {
    return this.evidence.provenance(
      authenticatedPrincipal(request),
      observationId,
      parseProvenanceQuery(rawQuery),
    );
  }
}

function authenticatedPrincipal(request: AuthenticatedRequest): Principal {
  if (!request.principal) throw new Error("Authentication guard invariant failed");
  return request.principal;
}
