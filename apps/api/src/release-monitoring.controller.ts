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
import type { AuthenticatedRequest } from "./http.js";
import { ProblemDetailsDto } from "./problem.dto.js";
import {
  type GovernedReleasePage,
  type GovernedReleaseSchedule,
  parseRecentReleaseQuery,
  parseReleaseScheduleQuery,
  ReleaseMonitoringService,
} from "./release-monitoring.js";

class ReleaseParserDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  version!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  codeSha256!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  configurationSha256!: string;
}

class ReleaseProvenanceDto {
  @ApiProperty({ format: "uuid" })
  representativeObservationId!: string;

  @ApiProperty({ format: "uuid" })
  transformationRunId!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  ingestionRunId!: string | null;

  @ApiProperty({ format: "uuid" })
  canonicalAdmissionId!: string;

  @ApiProperty({ format: "uuid" })
  canonicalAdmissionEvidenceId!: string;

  @ApiProperty({ format: "uuid" })
  admissionLicenseReviewId!: string;

  @ApiProperty({ format: "uuid" })
  admissionSourceDecisionId!: string;

  @ApiProperty({ format: "uuid" })
  currentLicenseReviewId!: string;

  @ApiProperty({ format: "uuid" })
  currentSourceDecisionId!: string;

  @ApiProperty({ enum: ["durable_ingestion_v1", "legacy_verified_v1"] })
  admissionBasis!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  admissionManifestSha256!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  admissionEvidenceSha256!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$", nullable: true })
  outputManifestSha256!: string | null;

  @ApiProperty({ minimum: 1, maximum: 10000 })
  qualityResultCount!: number;

  @ApiProperty({ format: "date-time" })
  admittedAt!: string;

  @ApiProperty({ format: "date-time" })
  admissionRecordedAt!: string;

  @ApiProperty({
    example: "/api/v1/evidence/observations/018f47ac-19fc-7c92-ae91-0242ac120008/provenance",
  })
  observationProvenance!: string;
}

class GovernedReleaseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  seriesId!: string;

  @ApiProperty({ format: "uuid" })
  sourceId!: string;

  @ApiProperty({ format: "uuid" })
  datasetId!: string;

  @ApiProperty({ format: "uuid" })
  rawPayloadId!: string;

  @ApiProperty()
  externalKey!: string;

  @ApiProperty({ format: "date-time" })
  monitoringTime!: string;

  @ApiProperty({
    enum: [
      "source_publication_time",
      "release_time",
      "availability_time",
      "payload_fetched_at",
      "canonical_recorded_at",
    ],
  })
  monitoringTimeBasis!: string;

  @ApiProperty({ format: "date-time", nullable: true })
  releaseTime!: string | null;

  @ApiProperty({ format: "date-time", nullable: true })
  sourcePublicationTime!: string | null;

  @ApiProperty({ format: "date-time", nullable: true })
  originalReleaseTime!: string | null;

  @ApiProperty({ format: "date-time", nullable: true })
  availabilityTime!: string | null;

  @ApiProperty({ format: "date-time", nullable: true })
  revisionTime!: string | null;

  @ApiProperty({ type: Number, nullable: true, minimum: 0 })
  revisionSequence!: number | null;

  @ApiProperty({ enum: ["true_vintage", "reconstructed_only", "latest_revised_only"] })
  pitQuality!: string;

  @ApiProperty({ format: "date-time" })
  payloadFetchedAt!: string;

  @ApiProperty({ format: "date-time" })
  recordedAt!: string;

  @ApiProperty({ type: ReleaseParserDto })
  parser!: ReleaseParserDto;

  @ApiProperty({ type: ReleaseProvenanceDto })
  provenance!: ReleaseProvenanceDto;
}

class ReleaseWindowDto {
  @ApiProperty({ format: "date-time" })
  releasedAfter!: string;

  @ApiProperty({ format: "date-time" })
  releasedBefore!: string;

  @ApiProperty({ enum: ["exclusive_inclusive"] })
  boundary!: "exclusive_inclusive";
}

class GovernedReleasePageDto {
  @ApiProperty({ format: "uuid" })
  seriesId!: string;

  @ApiProperty({ format: "date-time" })
  evaluatedAt!: string;

  @ApiProperty({ type: ReleaseWindowDto })
  window!: ReleaseWindowDto;

  @ApiProperty({ minimum: 0, maximum: 100 })
  count!: number;

  @ApiProperty({ description: "True when the caller must narrow the requested time window." })
  truncated!: boolean;

  @ApiProperty({ type: [GovernedReleaseDto] })
  releases!: readonly GovernedReleaseDto[];
}

class ScheduleProvenanceDto {
  @ApiProperty({ format: "uuid" })
  currentLicenseReviewId!: string;

  @ApiProperty({ format: "uuid" })
  currentSourceDecisionId!: string;
}

class GovernedReleaseScheduleDto {
  @ApiProperty({ format: "uuid" })
  seriesId!: string;

  @ApiProperty({ format: "uuid" })
  sourceId!: string;

  @ApiProperty({ format: "uuid" })
  datasetId!: string;

  @ApiProperty({ format: "date-time" })
  evaluatedAt!: string;

  @ApiProperty({ format: "date-time" })
  asOf!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  expectedFrequency!: string | null;

  @ApiProperty({
    enum: ["not_declared", "scheduled", "no_upcoming_release", "unstructured"],
  })
  status!: string;

  @ApiProperty({ format: "date-time", nullable: true })
  nextReleaseAt!: string | null;

  @ApiProperty({ enum: [1], nullable: true })
  scheduleSchemaVersion!: 1 | null;

  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: 256 })
  declaredReleaseCount!: number | null;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  declarationSha256!: string;

  @ApiProperty({ type: ScheduleProvenanceDto })
  provenance!: ScheduleProvenanceDto;
}

@ApiTags("evidence")
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: ProblemDetailsDto,
  description: "Access token missing or invalid",
})
@ApiForbiddenResponse({
  type: ProblemDetailsDto,
  description: "Role, classification, entitlement, or organization access denied",
})
@ApiBadRequestResponse({
  type: ProblemDetailsDto,
  description: "A path or query parameter is invalid",
})
@Controller("evidence/series/:seriesId")
export class ReleaseMonitoringController {
  constructor(
    @Inject(ReleaseMonitoringService) private readonly releases: ReleaseMonitoringService,
  ) {}

  @Get("releases")
  @ApiOperation({
    summary: "List recent governed releases for one authorized series",
    description:
      "Returns only persisted releases with immutable canonical-admission evidence, passing quality, and current API/legal admission. The monitoring timestamp is exact and its persisted basis is explicit; the service never invents a provider release time.",
  })
  @ApiParam({ name: "seriesId", format: "uuid" })
  @ApiQuery({ name: "releasedAfter", format: "date-time", description: "Exclusive bound" })
  @ApiQuery({ name: "releasedBefore", format: "date-time", description: "Inclusive bound" })
  @ApiQuery({ name: "limit", required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ type: GovernedReleasePageDto })
  recentReleases(
    @Req() request: AuthenticatedRequest,
    @Param("seriesId") seriesId: string,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ): Promise<GovernedReleasePage> {
    return this.releases.recentReleases(
      authenticatedPrincipal(request),
      seriesId,
      parseRecentReleaseQuery(rawQuery),
    );
  }

  @Get("release-schedule")
  @ApiOperation({
    summary: "Read persisted upcoming-release status for one authorized series",
    description:
      "Derives nextReleaseAt only from a bounded persisted {schemaVersion: 1, releaseTimes: [...]} declaration. Empty or legacy/unstructured metadata returns an explicit status and null, never a forecast.",
  })
  @ApiParam({ name: "seriesId", format: "uuid" })
  @ApiQuery({ name: "asOf", format: "date-time" })
  @ApiOkResponse({ type: GovernedReleaseScheduleDto })
  @ApiNotFoundResponse({
    type: ProblemDetailsDto,
    description: "No currently admitted schedule resource was visible",
  })
  releaseSchedule(
    @Req() request: AuthenticatedRequest,
    @Param("seriesId") seriesId: string,
    @Query() rawQuery: Readonly<Record<string, unknown>>,
  ): Promise<GovernedReleaseSchedule> {
    return this.releases.releaseSchedule(
      authenticatedPrincipal(request),
      seriesId,
      parseReleaseScheduleQuery(rawQuery),
    );
  }
}

function authenticatedPrincipal(request: AuthenticatedRequest): Principal {
  if (!request.principal) throw new Error("Authentication guard invariant failed");
  return request.principal;
}
