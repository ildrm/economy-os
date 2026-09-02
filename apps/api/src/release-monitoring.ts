import { assertIsoInstant, type Principal } from "@economyos/contracts";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PostgresRuntime } from "./database.js";
import { GovernedAuthorizationService } from "./governed-authorization.js";
import { WorkspaceAccessService } from "./workspaces.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECENT_RELEASE_QUERY_FIELDS = new Set(["releasedAfter", "releasedBefore", "limit"]);
const RELEASE_SCHEDULE_QUERY_FIELDS = new Set(["asOf"]);
const MAX_RELEASE_WINDOW_NANOSECONDS = 366n * 24n * 60n * 60n * 1_000_000_000n;
const MAX_DECLARED_RELEASE_TIMES = 256;

export interface RecentReleaseQuery {
  readonly releasedAfter: string;
  readonly releasedBefore: string;
  readonly limit: number;
}

export interface ReleaseScheduleQuery {
  readonly asOf: string;
}

export type ReleaseMonitoringTimeBasis =
  | "source_publication_time"
  | "release_time"
  | "availability_time"
  | "payload_fetched_at"
  | "canonical_recorded_at";

export interface GovernedReleaseProvenance {
  readonly representativeObservationId: string;
  readonly transformationRunId: string;
  readonly ingestionRunId: string | null;
  readonly canonicalAdmissionId: string;
  readonly canonicalAdmissionEvidenceId: string;
  readonly admissionLicenseReviewId: string;
  readonly admissionSourceDecisionId: string;
  readonly currentLicenseReviewId: string;
  readonly currentSourceDecisionId: string;
  readonly admissionBasis: string;
  readonly admissionManifestSha256: string;
  readonly admissionEvidenceSha256: string;
  readonly outputManifestSha256: string | null;
  readonly qualityResultCount: number;
  readonly admittedAt: string;
  readonly admissionRecordedAt: string;
  readonly observationProvenance: string;
}

export interface GovernedRelease {
  readonly id: string;
  readonly seriesId: string;
  readonly sourceId: string;
  readonly datasetId: string;
  readonly rawPayloadId: string;
  readonly externalKey: string;
  readonly monitoringTime: string;
  readonly monitoringTimeBasis: ReleaseMonitoringTimeBasis;
  readonly releaseTime: string | null;
  readonly sourcePublicationTime: string | null;
  readonly originalReleaseTime: string | null;
  readonly availabilityTime: string | null;
  readonly revisionTime: string | null;
  readonly revisionSequence: number | null;
  readonly pitQuality: string;
  readonly payloadFetchedAt: string;
  readonly recordedAt: string;
  readonly parser: {
    readonly name: string;
    readonly version: string;
    readonly codeSha256: string;
    readonly configurationSha256: string;
  };
  readonly provenance: GovernedReleaseProvenance;
}

export interface GovernedReleasePage {
  readonly seriesId: string;
  readonly evaluatedAt: string;
  readonly window: {
    readonly releasedAfter: string;
    readonly releasedBefore: string;
    readonly boundary: "exclusive_inclusive";
  };
  readonly count: number;
  readonly truncated: boolean;
  readonly releases: readonly GovernedRelease[];
}

export type ReleaseScheduleStatus =
  | "not_declared"
  | "scheduled"
  | "no_upcoming_release"
  | "unstructured";

export interface GovernedReleaseSchedule {
  readonly seriesId: string;
  readonly sourceId: string;
  readonly datasetId: string;
  readonly evaluatedAt: string;
  readonly asOf: string;
  readonly expectedFrequency: string | null;
  readonly status: ReleaseScheduleStatus;
  readonly nextReleaseAt: string | null;
  readonly scheduleSchemaVersion: 1 | null;
  readonly declaredReleaseCount: number | null;
  readonly declarationSha256: string;
  readonly provenance: {
    readonly currentLicenseReviewId: string;
    readonly currentSourceDecisionId: string;
  };
}

interface RecentReleaseRow extends Record<string, unknown> {
  readonly evaluated_at: string;
  readonly release_id: string | null;
  readonly series_id: string | null;
  readonly source_id: string | null;
  readonly dataset_id: string | null;
  readonly raw_payload_id: string | null;
  readonly external_release_key: string | null;
  readonly monitoring_time: string | null;
  readonly monitoring_time_basis: ReleaseMonitoringTimeBasis | null;
  readonly release_time: string | null;
  readonly source_publication_time: string | null;
  readonly original_release_time: string | null;
  readonly availability_time: string | null;
  readonly revision_time: string | null;
  readonly revision_sequence: number | null;
  readonly pit_quality: string | null;
  readonly payload_fetched_at: string | null;
  readonly recorded_at: string | null;
  readonly parser_name: string | null;
  readonly parser_version: string | null;
  readonly parser_code_sha256: string | null;
  readonly parser_configuration_sha256: string | null;
  readonly representative_observation_id: string | null;
  readonly transformation_run_id: string | null;
  readonly ingestion_run_id: string | null;
  readonly canonical_admission_id: string | null;
  readonly canonical_admission_evidence_id: string | null;
  readonly admission_license_review_id: string | null;
  readonly admission_source_decision_id: string | null;
  readonly current_license_review_id: string | null;
  readonly current_source_decision_id: string | null;
  readonly admission_basis: string | null;
  readonly admission_manifest_sha256: string | null;
  readonly admission_evidence_sha256: string | null;
  readonly output_manifest_sha256: string | null;
  readonly quality_result_count: number | null;
  readonly admitted_at: string | null;
  readonly admission_recorded_at: string | null;
}

interface ReleaseScheduleRow extends Record<string, unknown> {
  readonly series_id: string;
  readonly source_id: string;
  readonly dataset_id: string;
  readonly evaluated_at: string;
  readonly expected_frequency: string | null;
  readonly release_schedule: unknown | null;
  readonly release_schedule_within_bound: boolean;
  readonly declaration_sha256: string;
  readonly current_license_review_id: string;
  readonly current_source_decision_id: string;
}

export function parseRecentReleaseQuery(
  raw: Readonly<Record<string, unknown>>,
): RecentReleaseQuery {
  assertOnlyFields(raw, RECENT_RELEASE_QUERY_FIELDS);
  const releasedAfter = instantField(raw.releasedAfter, "releasedAfter");
  const releasedBefore = instantField(raw.releasedBefore, "releasedBefore");
  const after = instantEpochNanoseconds(releasedAfter);
  const before = instantEpochNanoseconds(releasedBefore);
  if (after >= before || before - after > MAX_RELEASE_WINDOW_NANOSECONDS) {
    return invalidRequest("releasedBefore");
  }
  return Object.freeze({
    releasedAfter,
    releasedBefore,
    limit: boundedIntegerField(raw.limit, "limit", 50, 1, 100),
  });
}

export function parseReleaseScheduleQuery(
  raw: Readonly<Record<string, unknown>>,
): ReleaseScheduleQuery {
  assertOnlyFields(raw, RELEASE_SCHEDULE_QUERY_FIELDS);
  return Object.freeze({ asOf: instantField(raw.asOf, "asOf") });
}

@Injectable()
export class ReleaseMonitoringService {
  constructor(
    @Inject(PostgresRuntime) private readonly database: PostgresRuntime,
    @Inject(WorkspaceAccessService) private readonly workspaceAccess: WorkspaceAccessService,
    @Inject(GovernedAuthorizationService)
    private readonly authorization: GovernedAuthorizationService,
  ) {}

  async recentReleases(
    principal: Principal,
    requestedSeriesId: string,
    query: RecentReleaseQuery,
  ): Promise<GovernedReleasePage> {
    const seriesId = resourceId(requestedSeriesId, "seriesId");
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.workspaceAccess.reconcilePrincipal(principal, transaction);
      await this.authorization.assertEvidenceSeriesAccess(principal, seriesId, transaction);
      const result = await transaction.query<RecentReleaseRow>(RECENT_RELEASES_SQL, [
        seriesId,
        query.releasedAfter,
        query.releasedBefore,
        "api",
        query.limit + 1,
      ]);
      const evaluatedAt = result.rows[0]?.evaluated_at;
      if (evaluatedAt === undefined)
        throw new Error("Release query did not return its evaluation time");
      const mapped = result.rows.flatMap((row) =>
        row.release_id === null ? [] : [mapRelease(requireCompleteReleaseRow(row))],
      );
      const truncated = mapped.length > query.limit;
      const releases = Object.freeze(mapped.slice(0, query.limit));
      return Object.freeze({
        seriesId,
        evaluatedAt,
        window: Object.freeze({
          releasedAfter: query.releasedAfter,
          releasedBefore: query.releasedBefore,
          boundary: "exclusive_inclusive" as const,
        }),
        count: releases.length,
        truncated,
        releases,
      });
    });
  }

  async releaseSchedule(
    principal: Principal,
    requestedSeriesId: string,
    query: ReleaseScheduleQuery,
  ): Promise<GovernedReleaseSchedule> {
    const seriesId = resourceId(requestedSeriesId, "seriesId");
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.workspaceAccess.reconcilePrincipal(principal, transaction);
      await this.authorization.assertEvidenceSeriesAccess(principal, seriesId, transaction);
      const result = await transaction.query<ReleaseScheduleRow>(RELEASE_SCHEDULE_SQL, [
        seriesId,
        "api",
      ]);
      const row = result.rows[0];
      if (!row) throw new NotFoundException({ code: "RELEASE_SCHEDULE_NOT_FOUND" });
      const schedule = summarizeSchedule(
        row.release_schedule_within_bound ? row.release_schedule : null,
        row.release_schedule_within_bound,
        query.asOf,
      );
      return Object.freeze({
        seriesId: row.series_id,
        sourceId: row.source_id,
        datasetId: row.dataset_id,
        evaluatedAt: row.evaluated_at,
        asOf: query.asOf,
        expectedFrequency: row.expected_frequency,
        ...schedule,
        declarationSha256: row.declaration_sha256,
        provenance: Object.freeze({
          currentLicenseReviewId: row.current_license_review_id,
          currentSourceDecisionId: row.current_source_decision_id,
        }),
      });
    });
  }
}

const UTC_TIMESTAMP = (expression: string): string =>
  `to_char(${expression} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const NULLABLE_UTC_TIMESTAMP = (expression: string): string =>
  `CASE WHEN ${expression} IS NULL THEN NULL ELSE ${UTC_TIMESTAMP(expression)} END`;

const RECENT_RELEASES_SQL = `
  WITH request_context AS MATERIALIZED (
    SELECT statement_timestamp() AS evaluated_at
  )
  SELECT
    ${UTC_TIMESTAMP("request_context.evaluated_at")} AS evaluated_at,
    governed.release_id::text,
    governed.series_id::text,
    governed.source_id::text,
    governed.dataset_id::text,
    governed.raw_payload_id::text,
    governed.external_release_key,
    ${UTC_TIMESTAMP("governed.monitoring_time")} AS monitoring_time,
    governed.monitoring_time_basis,
    ${NULLABLE_UTC_TIMESTAMP("governed.release_time")} AS release_time,
    ${NULLABLE_UTC_TIMESTAMP("governed.source_publication_time")} AS source_publication_time,
    ${NULLABLE_UTC_TIMESTAMP("governed.original_release_time")} AS original_release_time,
    ${NULLABLE_UTC_TIMESTAMP("governed.availability_time")} AS availability_time,
    ${NULLABLE_UTC_TIMESTAMP("governed.revision_time")} AS revision_time,
    governed.revision_sequence,
    governed.pit_quality,
    ${UTC_TIMESTAMP("governed.payload_fetched_at")} AS payload_fetched_at,
    ${UTC_TIMESTAMP("governed.recorded_at")} AS recorded_at,
    governed.parser_name,
    governed.parser_version,
    governed.parser_code_sha256,
    governed.parser_configuration_sha256,
    governed.representative_observation_id::text,
    governed.transformation_run_id::text,
    governed.ingestion_run_id::text,
    governed.canonical_admission_id::text,
    governed.canonical_admission_evidence_id::text,
    governed.admission_license_review_id::text,
    governed.admission_source_decision_id::text,
    governed.current_license_review_id::text,
    governed.current_source_decision_id::text,
    governed.admission_basis,
    governed.admission_manifest_sha256,
    governed.admission_evidence_sha256,
    governed.output_manifest_sha256,
    governed.quality_result_count,
    ${UTC_TIMESTAMP("governed.admitted_at")} AS admitted_at,
    ${UTC_TIMESTAMP("governed.admission_recorded_at")} AS admission_recorded_at
  FROM request_context
  LEFT JOIN LATERAL evidence.governed_series_releases(
    $1::uuid, $2::timestamptz, $3::timestamptz, $4::text, $5::integer
  ) governed ON true
  ORDER BY governed.monitoring_time DESC NULLS LAST, governed.release_id DESC NULLS LAST
`;

const RELEASE_SCHEDULE_SQL = `
  SELECT
    governed.series_id::text,
    governed.source_id::text,
    governed.dataset_id::text,
    ${UTC_TIMESTAMP("governed.evaluated_at")} AS evaluated_at,
    governed.expected_frequency,
    governed.release_schedule,
    governed.release_schedule_within_bound,
    governed.declaration_sha256,
    governed.current_license_review_id::text,
    governed.current_source_decision_id::text
  FROM evidence.governed_series_release_schedule($1::uuid, $2::text) governed
`;

function mapRelease(row: CompleteRecentReleaseRow): GovernedRelease {
  const observationProvenance = `/api/v1/evidence/observations/${row.representative_observation_id}/provenance`;
  return Object.freeze({
    id: row.release_id,
    seriesId: row.series_id,
    sourceId: row.source_id,
    datasetId: row.dataset_id,
    rawPayloadId: row.raw_payload_id,
    externalKey: row.external_release_key,
    monitoringTime: row.monitoring_time,
    monitoringTimeBasis: row.monitoring_time_basis,
    releaseTime: row.release_time,
    sourcePublicationTime: row.source_publication_time,
    originalReleaseTime: row.original_release_time,
    availabilityTime: row.availability_time,
    revisionTime: row.revision_time,
    revisionSequence: row.revision_sequence,
    pitQuality: row.pit_quality,
    payloadFetchedAt: row.payload_fetched_at,
    recordedAt: row.recorded_at,
    parser: Object.freeze({
      name: row.parser_name,
      version: row.parser_version,
      codeSha256: row.parser_code_sha256,
      configurationSha256: row.parser_configuration_sha256,
    }),
    provenance: Object.freeze({
      representativeObservationId: row.representative_observation_id,
      transformationRunId: row.transformation_run_id,
      ingestionRunId: row.ingestion_run_id,
      canonicalAdmissionId: row.canonical_admission_id,
      canonicalAdmissionEvidenceId: row.canonical_admission_evidence_id,
      admissionLicenseReviewId: row.admission_license_review_id,
      admissionSourceDecisionId: row.admission_source_decision_id,
      currentLicenseReviewId: row.current_license_review_id,
      currentSourceDecisionId: row.current_source_decision_id,
      admissionBasis: row.admission_basis,
      admissionManifestSha256: row.admission_manifest_sha256,
      admissionEvidenceSha256: row.admission_evidence_sha256,
      outputManifestSha256: row.output_manifest_sha256,
      qualityResultCount: row.quality_result_count,
      admittedAt: row.admitted_at,
      admissionRecordedAt: row.admission_recorded_at,
      observationProvenance,
    }),
  });
}

type CompleteRecentReleaseRow = RecentReleaseRow & {
  readonly release_id: string;
  readonly series_id: string;
  readonly source_id: string;
  readonly dataset_id: string;
  readonly raw_payload_id: string;
  readonly external_release_key: string;
  readonly monitoring_time: string;
  readonly monitoring_time_basis: ReleaseMonitoringTimeBasis;
  readonly pit_quality: string;
  readonly payload_fetched_at: string;
  readonly recorded_at: string;
  readonly parser_name: string;
  readonly parser_version: string;
  readonly parser_code_sha256: string;
  readonly parser_configuration_sha256: string;
  readonly representative_observation_id: string;
  readonly transformation_run_id: string;
  readonly canonical_admission_id: string;
  readonly canonical_admission_evidence_id: string;
  readonly admission_license_review_id: string;
  readonly admission_source_decision_id: string;
  readonly current_license_review_id: string;
  readonly current_source_decision_id: string;
  readonly admission_basis: string;
  readonly admission_manifest_sha256: string;
  readonly admission_evidence_sha256: string;
  readonly quality_result_count: number;
  readonly admitted_at: string;
  readonly admission_recorded_at: string;
};

function requireCompleteReleaseRow(row: RecentReleaseRow): CompleteRecentReleaseRow {
  const required: readonly (keyof RecentReleaseRow)[] = [
    "release_id",
    "series_id",
    "source_id",
    "dataset_id",
    "raw_payload_id",
    "external_release_key",
    "monitoring_time",
    "monitoring_time_basis",
    "pit_quality",
    "payload_fetched_at",
    "recorded_at",
    "parser_name",
    "parser_version",
    "parser_code_sha256",
    "parser_configuration_sha256",
    "representative_observation_id",
    "transformation_run_id",
    "canonical_admission_id",
    "canonical_admission_evidence_id",
    "admission_license_review_id",
    "admission_source_decision_id",
    "current_license_review_id",
    "current_source_decision_id",
    "admission_basis",
    "admission_manifest_sha256",
    "admission_evidence_sha256",
    "quality_result_count",
    "admitted_at",
    "admission_recorded_at",
  ];
  if (required.some((key) => row[key] === null || row[key] === undefined)) {
    throw new Error("Database returned incomplete governed release provenance");
  }
  return row as CompleteRecentReleaseRow;
}

function summarizeSchedule(
  value: unknown,
  withinReadBound: boolean,
  asOf: string,
): Pick<
  GovernedReleaseSchedule,
  "status" | "nextReleaseAt" | "scheduleSchemaVersion" | "declaredReleaseCount"
> {
  if (!withinReadBound || !isRecord(value)) return unstructuredSchedule();
  if (Object.keys(value).length === 0) {
    return Object.freeze({
      status: "not_declared" as const,
      nextReleaseAt: null,
      scheduleSchemaVersion: null,
      declaredReleaseCount: null,
    });
  }
  if (
    value.schemaVersion !== 1 ||
    !Array.isArray(value.releaseTimes) ||
    value.releaseTimes.length > MAX_DECLARED_RELEASE_TIMES
  ) {
    return unstructuredSchedule();
  }
  const releaseTimes: string[] = [];
  for (const candidate of value.releaseTimes) {
    if (typeof candidate !== "string") return unstructuredSchedule();
    try {
      releaseTimes.push(assertIsoInstant(candidate, "releaseTimes"));
    } catch {
      return unstructuredSchedule();
    }
  }
  const asOfNanoseconds = instantEpochNanoseconds(asOf);
  const nextReleaseAt =
    releaseTimes
      .filter((candidate) => instantEpochNanoseconds(candidate) > asOfNanoseconds)
      .sort((left, right) => compareInstants(left, right))[0] ?? null;
  return Object.freeze({
    status: nextReleaseAt === null ? ("no_upcoming_release" as const) : ("scheduled" as const),
    nextReleaseAt,
    scheduleSchemaVersion: 1 as const,
    declaredReleaseCount: releaseTimes.length,
  });
}

function unstructuredSchedule(): Pick<
  GovernedReleaseSchedule,
  "status" | "nextReleaseAt" | "scheduleSchemaVersion" | "declaredReleaseCount"
> {
  return Object.freeze({
    status: "unstructured",
    nextReleaseAt: null,
    scheduleSchemaVersion: null,
    declaredReleaseCount: null,
  });
}

function compareInstants(left: string, right: string): number {
  const leftValue = instantEpochNanoseconds(left);
  const rightValue = instantEpochNanoseconds(right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function instantEpochNanoseconds(value: string): bigint {
  const match = /^(?<base>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(?<fraction>\d{1,9}))?Z$/.exec(
    value,
  );
  if (!match?.groups?.base) throw new TypeError("instant must already be validated");
  const wholeSeconds = Date.parse(`${match.groups.base}Z`);
  if (!Number.isFinite(wholeSeconds)) throw new TypeError("instant must already be validated");
  const fraction = BigInt((match.groups.fraction ?? "").padEnd(9, "0") || "0");
  return BigInt(wholeSeconds) * 1_000_000n + fraction;
}

function assertOnlyFields(
  raw: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) invalidRequest(key);
  }
}

function resourceId(value: string, field: string): string {
  if (!UUID.test(value)) invalidRequest(field);
  return value;
}

function instantField(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    return invalidRequest(field);
  }
  try {
    return assertIsoInstant(value, field);
  } catch {
    return invalidRequest(field);
  }
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
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) invalidRequest(field);
  return parsed;
}

function invalidRequest(field: string): never {
  throw new BadRequestException({ code: "REQUEST_INVALID", field });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
