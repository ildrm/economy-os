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
  type CapitalCountryComparison,
  type CapitalResearchAssessment,
  CapitalResearchService,
  parseCapitalResearchQuery,
} from "./capital-research.js";
import type { AuthenticatedRequest } from "./http.js";
import { ProblemDetailsDto } from "./problem.dto.js";

class CapitalResearchAssessmentDto {
  @ApiProperty({ enum: [1] })
  schemaVersion!: 1;

  @ApiProperty({ format: "uuid" })
  workspaceId!: string;

  @ApiProperty({ format: "uuid" })
  assessmentId!: string;

  @ApiProperty({ format: "uuid" })
  countryId!: string;

  @ApiProperty({ minLength: 2, maxLength: 3 })
  countryCode!: string;

  @ApiProperty({ minLength: 3, maxLength: 128 })
  strategyKey!: string;

  @ApiProperty({ format: "date-time" })
  asOf!: string;

  @ApiProperty({ format: "uuid" })
  modelArtifactId!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  modelArtifactSha256!: string;

  @ApiProperty({ format: "uuid" })
  completionId!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  manifestSha256!: string;

  @ApiProperty({
    type: Object,
    description:
      "Exact immutable research-only assessment manifest; scientific decimals remain strings.",
  })
  manifest!: Record<string, unknown>;
}

class CapitalCountryComparisonDto {
  @ApiProperty({ enum: [1] })
  schemaVersion!: 1;

  @ApiProperty({ format: "uuid" })
  workspaceId!: string;

  @ApiProperty({ format: "uuid" })
  comparisonId!: string;

  @ApiProperty({ format: "uuid" })
  referenceCountryId!: string;

  @ApiProperty({ minLength: 3, maxLength: 64 })
  assetClass!: string;

  @ApiProperty({ minLength: 3, maxLength: 128 })
  strategyKey!: string;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  manifestSha256!: string;

  @ApiProperty({
    type: Object,
    description:
      "Exact immutable requested-order comparison with incomparability retained and no rank.",
  })
  comparison!: Record<string, unknown>;
}

@ApiTags("capital research")
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
@Controller("capital-research/assessments")
export class CapitalResearchAssessmentController {
  constructor(
    @Inject(CapitalResearchService)
    private readonly capitalResearch: CapitalResearchService,
  ) {}

  @Get(":assessmentId")
  @ApiOperation({
    summary: "Read one completed investment-research assessment",
    description:
      "Returns an immutable research-only macro/valuation context. It is not investment advice, a recommendation, expected return, or suitability decision.",
  })
  @ApiParam({ name: "assessmentId", format: "uuid" })
  @ApiQuery({ name: "workspaceId", format: "uuid" })
  @ApiOkResponse({ type: CapitalResearchAssessmentDto })
  @ApiNotFoundResponse({
    type: ProblemDetailsDto,
    description: "Assessment is missing, inaccessible, incomplete, restricted, or unservable",
  })
  get(
    @Req() request: AuthenticatedRequest,
    @Param("assessmentId") assessmentId: string,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ): Promise<CapitalResearchAssessment> {
    return this.capitalResearch.getAssessment(
      authenticatedPrincipal(request),
      assessmentId,
      parseCapitalResearchQuery(rawQuery),
    );
  }
}

@ApiTags("capital research")
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
@Controller("capital-research/comparisons")
export class CapitalCountryComparisonController {
  constructor(
    @Inject(CapitalResearchService)
    private readonly capitalResearch: CapitalResearchService,
  ) {}

  @Get(":comparisonId")
  @ApiOperation({
    summary: "Read one completed country research comparison",
    description:
      "Returns requested-order comparable/incomparable research results. The API never adds a rank, winner, allocation, or recommendation.",
  })
  @ApiParam({ name: "comparisonId", format: "uuid" })
  @ApiQuery({ name: "workspaceId", format: "uuid" })
  @ApiOkResponse({ type: CapitalCountryComparisonDto })
  @ApiNotFoundResponse({
    type: ProblemDetailsDto,
    description: "Comparison is missing, inaccessible, restricted, or unservable",
  })
  get(
    @Req() request: AuthenticatedRequest,
    @Param("comparisonId") comparisonId: string,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ): Promise<CapitalCountryComparison> {
    return this.capitalResearch.getComparison(
      authenticatedPrincipal(request),
      comparisonId,
      parseCapitalResearchQuery(rawQuery),
    );
  }
}

function authenticatedPrincipal(request: AuthenticatedRequest): Principal {
  if (!request.principal) throw new Error("Authentication guard invariant failed");
  return request.principal;
}
