import type { Principal } from "@economyos/contracts";
import { Body, Controller, Get, Inject, Param, Put, Query, Req } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
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
  parseReleaseNotificationQuery,
  parseReleaseSubscriptionCommand,
  parseReleaseSubscriptionQuery,
  type ReleaseNotificationPage,
  ReleaseNotificationService,
  type ReleaseSubscriptionEnvelope,
} from "./release-notifications.js";

class ReleaseSubscriptionCommandDto {
  @ApiProperty({ format: "uuid" })
  workspaceId!: string;

  @ApiProperty()
  active!: boolean;

  @ApiProperty({ minLength: 3, maxLength: 1000 })
  reason!: string;
}

class ReleaseSubscriptionStateDto {
  @ApiProperty({ format: "uuid" })
  subscriptionId!: string;

  @ApiProperty({ format: "uuid" })
  workspaceId!: string;

  @ApiProperty({ format: "uuid" })
  seriesId!: string;

  @ApiProperty({ enum: ["in_app"] })
  channel!: "in_app";

  @ApiProperty()
  active!: boolean;

  @ApiProperty({ format: "uuid" })
  resolvedEventId!: string;

  @ApiProperty({ format: "date-time" })
  effectiveAt!: string;

  @ApiProperty({ format: "date-time" })
  recordedAt!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  eventSha256!: string;
}

class ReleaseSubscriptionEnvelopeDto {
  @ApiProperty({ format: "uuid" })
  workspaceId!: string;

  @ApiProperty({ format: "uuid" })
  seriesId!: string;

  @ApiProperty({ type: ReleaseSubscriptionStateDto, nullable: true })
  subscription!: ReleaseSubscriptionStateDto | null;
}

class ReleaseNotificationTargetDto {
  @ApiProperty({ enum: ["economic_release"] })
  type!: "economic_release";

  @ApiProperty({ format: "uuid" })
  seriesId!: string;

  @ApiProperty({ format: "uuid" })
  releaseId!: string;
}

class ReleaseNotificationPointerDto {
  @ApiProperty({ format: "uuid" })
  deliveryId!: string;

  @ApiProperty({ format: "uuid" })
  workflowId!: string;

  @ApiProperty({ format: "uuid" })
  subscriptionId!: string;

  @ApiProperty({ type: ReleaseNotificationTargetDto })
  target!: ReleaseNotificationTargetDto;

  @ApiProperty({ format: "date-time" })
  occurredAt!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  deliverySha256!: string;
}

class ReleaseNotificationCursorDto {
  @ApiProperty({ format: "date-time" })
  beforeOccurredAt!: string;

  @ApiProperty({ format: "uuid" })
  beforeDeliveryId!: string;
}

class ReleaseNotificationPageDto {
  @ApiProperty({ format: "uuid" })
  workspaceId!: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  count!: number;

  @ApiProperty({ type: [ReleaseNotificationPointerDto] })
  notifications!: readonly ReleaseNotificationPointerDto[];

  @ApiProperty({ type: ReleaseNotificationCursorDto, nullable: true })
  nextCursor!: ReleaseNotificationCursorDto | null;
}

@ApiTags("release notifications")
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
@Controller("evidence/series/:seriesId/release-subscription")
export class ReleaseSubscriptionController {
  constructor(
    @Inject(ReleaseNotificationService)
    private readonly notifications: ReleaseNotificationService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Read the current subject's in-app subscription for one series" })
  @ApiParam({ name: "seriesId", format: "uuid" })
  @ApiQuery({ name: "workspaceId", format: "uuid" })
  @ApiOkResponse({ type: ReleaseSubscriptionEnvelopeDto })
  subscription(
    @Req() request: AuthenticatedRequest,
    @Param("seriesId") seriesId: string,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ): Promise<ReleaseSubscriptionEnvelope> {
    return this.notifications.subscription(
      authenticatedPrincipal(request),
      seriesId,
      parseReleaseSubscriptionQuery(rawQuery),
    );
  }

  @Put()
  @ApiOperation({
    summary: "Idempotently activate or deactivate an in-app series subscription",
    description:
      "The immutable subscription identity and append-only state events are scoped to the authenticated subject and authorized workspace.",
  })
  @ApiParam({ name: "seriesId", format: "uuid" })
  @ApiBody({ type: ReleaseSubscriptionCommandDto })
  @ApiOkResponse({ type: ReleaseSubscriptionEnvelopeDto })
  setSubscription(
    @Req() request: AuthenticatedRequest,
    @Param("seriesId") seriesId: string,
    @Body() rawBody: unknown,
  ): Promise<ReleaseSubscriptionEnvelope> {
    return this.notifications.setSubscription(
      authenticatedPrincipal(request),
      seriesId,
      parseReleaseSubscriptionCommand(rawBody),
    );
  }
}

@ApiTags("release notifications")
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: ProblemDetailsDto,
  description: "Access token missing or invalid",
})
@ApiForbiddenResponse({ type: ProblemDetailsDto, description: "Workspace access denied" })
@ApiBadRequestResponse({ type: ProblemDetailsDto, description: "Request input is invalid" })
@Controller("notifications/releases")
export class ReleaseNotificationsController {
  constructor(
    @Inject(ReleaseNotificationService)
    private readonly notifications: ReleaseNotificationService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List delivered in-app release pointers for the current subject",
    description:
      "Returns immutable pointers only. Following a pointer repeats the target's normal authorization and legal checks.",
  })
  @ApiQuery({ name: "workspaceId", format: "uuid" })
  @ApiQuery({ name: "limit", required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiQuery({ name: "beforeOccurredAt", required: false, format: "date-time" })
  @ApiQuery({ name: "beforeDeliveryId", required: false, format: "uuid" })
  @ApiOkResponse({ type: ReleaseNotificationPageDto })
  list(
    @Req() request: AuthenticatedRequest,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ): Promise<ReleaseNotificationPage> {
    return this.notifications.list(
      authenticatedPrincipal(request),
      parseReleaseNotificationQuery(rawQuery),
    );
  }
}

function authenticatedPrincipal(request: AuthenticatedRequest): Principal {
  if (!request.principal) throw new Error("Authentication guard invariant failed");
  return request.principal;
}
