import type { Principal } from "@economyos/contracts";
import { Body, Controller, Get, Inject, Param, Put, Query, Req } from "@nestjs/common";
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
  GOVERNED_RELATIONSHIP_TYPES,
  parseRelationshipClaimCommand,
  parseRelationshipDecisionCommand,
  parseRelationshipEndpointCommand,
  parseRelationshipEvidenceCommand,
  parseRelationshipEvidenceLinkCommand,
  parseRelationshipResourceId,
  parseRelationshipStatusQuery,
  RELATIONSHIP_CAUSAL_CLASSIFICATIONS,
  RELATIONSHIP_CLAIM_KINDS,
  RELATIONSHIP_DECISION_STATUSES,
  RELATIONSHIP_DISCOVERY_METHODS,
  RELATIONSHIP_EFFECT_DIRECTIONS,
  RELATIONSHIP_ENDPOINT_TYPES,
  RELATIONSHIP_EVIDENCE_ROLES,
  RELATIONSHIP_EVIDENCE_TYPES,
  RELATIONSHIP_REFERENCE_TYPES,
  RELATIONSHIP_RESOLVED_STATUSES,
  type RelationshipClaimStatus,
  RelationshipGraphService,
  type RelationshipWriteReceipt,
} from "./relationship-graph.js";

class RelationshipEndpointCommandDto {
  @ApiProperty({ format: "uuid" })
  workspaceId!: string;

  @ApiProperty({ enum: RELATIONSHIP_ENDPOINT_TYPES })
  endpointType!: string;

  @ApiProperty({ pattern: "^[a-z0-9][a-z0-9_.:-]{2,255}$" })
  canonicalKey!: string;

  @ApiProperty({ minLength: 1, maxLength: 300 })
  displayName!: string;

  @ApiProperty({ enum: RELATIONSHIP_REFERENCE_TYPES })
  referenceType!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  referenceId!: string | null;
}

class RelationshipClaimCommandDto {
  @ApiProperty({ format: "uuid" })
  workspaceId!: string;

  @ApiProperty({ format: "uuid" })
  fromEndpointId!: string;

  @ApiProperty({ format: "uuid" })
  toEndpointId!: string;

  @ApiProperty({ enum: GOVERNED_RELATIONSHIP_TYPES })
  relationshipType!: string;

  @ApiProperty({ enum: RELATIONSHIP_CLAIM_KINDS })
  claimKind!: string;

  @ApiProperty({ enum: RELATIONSHIP_CAUSAL_CLASSIFICATIONS })
  causalClassification!: string;

  @ApiProperty({ enum: RELATIONSHIP_DISCOVERY_METHODS })
  discoveryMethod!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  hypothesisSourceClaimId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  supersedesClaimId!: string | null;

  @ApiProperty({ type: Object, additionalProperties: true })
  methodSpecification!: Readonly<Record<string, unknown>>;

  @ApiProperty({ type: Object, additionalProperties: true })
  scope!: Readonly<Record<string, unknown>>;

  @ApiProperty({ type: "array", items: {} })
  assumptions!: readonly unknown[];

  @ApiProperty({ type: Object, additionalProperties: true })
  uncertainty!: Readonly<Record<string, unknown>>;

  @ApiProperty({ type: String, pattern: "^(?:0(?:\\.\\d{1,18})?|1(?:\\.0{1,18})?)$" })
  confidence!: string;

  @ApiProperty({ enum: RELATIONSHIP_EFFECT_DIRECTIONS })
  effectDirection!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    pattern: "^(?:0(?:\\.\\d{1,18})?|1(?:\\.0{1,18})?)$",
  })
  effectStrength!: string | null;

  @ApiProperty({ type: Number, minimum: 0, maximum: 31_557_600_000, nullable: true })
  lagMinSeconds!: number | null;

  @ApiProperty({ type: Number, minimum: 0, maximum: 31_557_600_000, nullable: true })
  lagMaxSeconds!: number | null;

  @ApiProperty({ type: Object, additionalProperties: true })
  regimeScope!: Readonly<Record<string, unknown>>;

  @ApiProperty({ type: Object, additionalProperties: true })
  geographicScope!: Readonly<Record<string, unknown>>;

  @ApiProperty({ format: "date-time" })
  validFrom!: string;

  @ApiProperty({ format: "date-time", nullable: true })
  validUntil!: string | null;

  @ApiProperty({ format: "date-time" })
  discoveredAt!: string;
}

class RelationshipEvidenceCommandDto {
  @ApiProperty({ format: "uuid" })
  workspaceId!: string;

  @ApiProperty({ enum: RELATIONSHIP_EVIDENCE_TYPES })
  evidenceType!: string;

  @ApiProperty({ minLength: 8, maxLength: 2048 })
  evidenceUri!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  sourceSha256!: string;

  @ApiProperty({ type: Object, additionalProperties: true })
  locator!: Readonly<Record<string, unknown>>;

  @ApiProperty({ format: "date-time" })
  observedAt!: string;

  @ApiProperty({ format: "date-time" })
  validFrom!: string;

  @ApiProperty({ format: "date-time", nullable: true })
  validUntil!: string | null;
}

class RelationshipEvidenceLinkCommandDto {
  @ApiProperty({ format: "uuid" })
  workspaceId!: string;

  @ApiProperty({ format: "uuid" })
  evidenceId!: string;

  @ApiProperty({ enum: RELATIONSHIP_EVIDENCE_ROLES })
  evidenceRole!: string;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  rationale!: string;

  @ApiProperty({ format: "date-time" })
  linkedAt!: string;
}

class RelationshipDecisionCommandDto {
  @ApiProperty({ format: "uuid" })
  workspaceId!: string;

  @ApiProperty({ enum: RELATIONSHIP_DECISION_STATUSES })
  toStatus!: string;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  reason!: string;

  @ApiProperty({ format: "date-time" })
  effectiveAt!: string;
}

class RelationshipWriteReceiptDto {
  @ApiProperty({
    enum: [
      "relationship_endpoint",
      "relationship_claim",
      "relationship_evidence",
      "relationship_evidence_link",
      "relationship_decision",
    ],
  })
  resource!: string;

  @ApiProperty({ format: "uuid" })
  id!: string;
}

class RelationshipClaimStatusDto {
  @ApiProperty({ format: "uuid" })
  resolvedClaimId!: string;

  @ApiProperty({ format: "uuid" })
  rootClaimId!: string;

  @ApiProperty({ format: "uuid" })
  fromEndpointId!: string;

  @ApiProperty({ format: "uuid" })
  toEndpointId!: string;

  @ApiProperty({ enum: GOVERNED_RELATIONSHIP_TYPES })
  relationshipType!: string;

  @ApiProperty({ enum: RELATIONSHIP_CLAIM_KINDS })
  claimKind!: string;

  @ApiProperty({ enum: RELATIONSHIP_CAUSAL_CLASSIFICATIONS })
  causalClassification!: string;

  @ApiProperty({ enum: RELATIONSHIP_RESOLVED_STATUSES })
  status!: string;

  @ApiProperty({ format: "date-time" })
  validFrom!: string;

  @ApiProperty({ format: "date-time", nullable: true })
  validUntil!: string | null;

  @ApiProperty({ format: "date-time" })
  recordedAt!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  claimSha256!: string;

  @ApiProperty({ format: "uuid" })
  decisionId!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  decisionSha256!: string;

  @ApiProperty({ format: "date-time" })
  effectiveAt!: string;

  @ApiProperty({ format: "date-time" })
  systemAt!: string;
}

@ApiTags("relationship graph")
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
@ApiNotFoundResponse({
  type: ProblemDetailsDto,
  description: "The governed relationship resource is unavailable in the authorized context",
})
@ApiConflictResponse({
  type: ProblemDetailsDto,
  description: "The immutable replay or governance transition conflicts with current state",
})
@Controller("relationship-graph")
export class RelationshipGraphController {
  constructor(
    @Inject(RelationshipGraphService)
    private readonly graph: RelationshipGraphService,
  ) {}

  @Put("endpoints/:endpointId")
  @ApiOperation({
    summary: "Author an immutable governed relationship endpoint",
    description:
      "The authenticated principal supplies no tenant or subject identity. Replaying the same identifier is idempotent only when its evidence is unchanged.",
  })
  @ApiParam({ name: "endpointId", format: "uuid" })
  @ApiBody({ type: RelationshipEndpointCommandDto })
  @ApiOkResponse({ type: RelationshipWriteReceiptDto })
  authorEndpoint(
    @Req() request: AuthenticatedRequest,
    @Param("endpointId") endpointId: string,
    @Body() rawBody: unknown,
  ): Promise<RelationshipWriteReceipt> {
    return this.graph.authorEndpoint(
      authenticatedPrincipal(request),
      parseRelationshipResourceId(endpointId, "endpointId"),
      parseRelationshipEndpointCommand(rawBody),
    );
  }

  @Put("claims/:claimId")
  @ApiOperation({
    summary: "Author an immutable governed relationship claim",
    description:
      "Association, causal-hypothesis, and causal classifications remain explicit. Authoring never promotes a claim to reviewed or approved status.",
  })
  @ApiParam({ name: "claimId", format: "uuid" })
  @ApiBody({ type: RelationshipClaimCommandDto })
  @ApiOkResponse({ type: RelationshipWriteReceiptDto })
  authorClaim(
    @Req() request: AuthenticatedRequest,
    @Param("claimId") claimId: string,
    @Body() rawBody: unknown,
  ): Promise<RelationshipWriteReceipt> {
    return this.graph.authorClaim(
      authenticatedPrincipal(request),
      parseRelationshipResourceId(claimId, "claimId"),
      parseRelationshipClaimCommand(rawBody),
    );
  }

  @Put("evidence/:evidenceId")
  @ApiOperation({ summary: "Add immutable evidence for governed relationship claims" })
  @ApiParam({ name: "evidenceId", format: "uuid" })
  @ApiBody({ type: RelationshipEvidenceCommandDto })
  @ApiOkResponse({ type: RelationshipWriteReceiptDto })
  addEvidence(
    @Req() request: AuthenticatedRequest,
    @Param("evidenceId") evidenceId: string,
    @Body() rawBody: unknown,
  ): Promise<RelationshipWriteReceipt> {
    return this.graph.addEvidence(
      authenticatedPrincipal(request),
      parseRelationshipResourceId(evidenceId, "evidenceId"),
      parseRelationshipEvidenceCommand(rawBody),
    );
  }

  @Put("claims/:claimId/evidence-links/:linkId")
  @ApiOperation({ summary: "Link immutable evidence to one governed relationship claim" })
  @ApiParam({ name: "claimId", format: "uuid" })
  @ApiParam({ name: "linkId", format: "uuid" })
  @ApiBody({ type: RelationshipEvidenceLinkCommandDto })
  @ApiOkResponse({ type: RelationshipWriteReceiptDto })
  linkEvidence(
    @Req() request: AuthenticatedRequest,
    @Param("claimId") claimId: string,
    @Param("linkId") linkId: string,
    @Body() rawBody: unknown,
  ): Promise<RelationshipWriteReceipt> {
    return this.graph.linkEvidence(
      authenticatedPrincipal(request),
      parseRelationshipResourceId(claimId, "claimId"),
      parseRelationshipResourceId(linkId, "linkId"),
      parseRelationshipEvidenceLinkCommand(rawBody),
    );
  }

  @Put("claims/:claimId/decisions/:decisionId")
  @ApiOperation({
    summary: "Record an independent governed claim review or status decision",
    description:
      "Only the requested transition is recorded. PostgreSQL evidence gates and reviewer/approver separation remain authoritative.",
  })
  @ApiParam({ name: "claimId", format: "uuid" })
  @ApiParam({ name: "decisionId", format: "uuid" })
  @ApiBody({ type: RelationshipDecisionCommandDto })
  @ApiOkResponse({ type: RelationshipWriteReceiptDto })
  decide(
    @Req() request: AuthenticatedRequest,
    @Param("claimId") claimId: string,
    @Param("decisionId") decisionId: string,
    @Body() rawBody: unknown,
  ): Promise<RelationshipWriteReceipt> {
    return this.graph.decide(
      authenticatedPrincipal(request),
      parseRelationshipResourceId(claimId, "claimId"),
      parseRelationshipResourceId(decisionId, "decisionId"),
      parseRelationshipDecisionCommand(rawBody),
    );
  }

  @Get("claims/:claimId/status")
  @ApiOperation({
    summary: "Resolve a governed relationship claim at explicit valid and system-time cutoffs",
    description:
      "Both temporal cutoffs are mandatory. Missing and foreign claims share the same non-enumerating response.",
  })
  @ApiParam({ name: "claimId", format: "uuid" })
  @ApiQuery({ name: "workspaceId", format: "uuid" })
  @ApiQuery({ name: "effectiveAt", format: "date-time" })
  @ApiQuery({ name: "systemAt", format: "date-time" })
  @ApiOkResponse({ type: RelationshipClaimStatusDto })
  status(
    @Req() request: AuthenticatedRequest,
    @Param("claimId") claimId: string,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ): Promise<RelationshipClaimStatus> {
    return this.graph.status(
      authenticatedPrincipal(request),
      parseRelationshipResourceId(claimId, "claimId"),
      parseRelationshipStatusQuery(rawQuery),
    );
  }
}

function authenticatedPrincipal(request: AuthenticatedRequest): Principal {
  if (!request.principal) throw new Error("Authentication guard invariant failed");
  return request.principal;
}
