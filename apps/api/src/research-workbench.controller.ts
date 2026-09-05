import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
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
import type { AuthenticatedRequest } from "./http.js";
import { ProblemDetailsDto } from "./problem.dto.js";
import {
  parseResearchCommand,
  parseResearchRead,
  ResearchWorkbenchService,
} from "./research-workbench.js";

class ResearchCommandDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) workspaceId!: string;
  @ApiProperty({
    format: "date-time",
    description: "Declared knowledge cutoff; millisecond precision or coarser.",
  })
  knownAt!: string;
  @ApiProperty({
    enum: [
      "behavioral_choice",
      "material_balance",
      "allocation_simulation",
      "intervention_detection",
    ],
  })
  kind!: string;
  @ApiProperty({
    type: Object,
    description:
      "Versioned domain inputs; exact decimals are strings and hypothetical parameters must be explicit.",
  })
  input!: Record<string, unknown>;
}

@ApiTags("behavioral and allocation research")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ProblemDetailsDto })
@ApiForbiddenResponse({ type: ProblemDetailsDto })
@ApiBadRequestResponse({ type: ProblemDetailsDto })
@Controller("research/runs")
export class ResearchWorkbenchController {
  constructor(
    @Inject(ResearchWorkbenchService) private readonly service: ResearchWorkbenchService,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: "Execute and preserve hypothetical behavioral or allocation research",
    description:
      "Requires model.execute and workspace membership. Results are scenario research, never observed evidence. Same-ID identical retries return the immutable original.",
  })
  @ApiBody({ type: ResearchCommandDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiOkResponse({ schema: { type: "object", additionalProperties: true } })
  execute(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    if (!request.principal) throw new Error("Authentication guard invariant failed");
    return this.service.execute(request.principal, parseResearchCommand(body));
  }

  @Get(":id")
  @ApiOperation({ summary: "Read a research run within workspace and knowledge/system cutoffs" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiQuery({ name: "workspaceId", format: "uuid" })
  @ApiQuery({ name: "knownAt", type: String })
  @ApiQuery({ name: "systemAt", type: String })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiOkResponse({ schema: { type: "object", additionalProperties: true } })
  get(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Query() query: Record<string, unknown>,
  ) {
    if (!request.principal) throw new Error("Authentication guard invariant failed");
    return this.service.get(request.principal, id, parseResearchRead(query));
  }
}
