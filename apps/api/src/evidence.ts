import { assertIsoInstant, type Principal } from "@economyos/contracts";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PostgresRuntime } from "./database.js";
import { GovernedAuthorizationService } from "./governed-authorization.js";
import { WorkspaceAccessService } from "./workspaces.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUERY_FIELDS = new Set(["knownAt", "policy", "systemAt", "limit"]);
const PROVENANCE_QUERY_FIELDS = new Set<string>();
const VISIBILITY_POLICIES = ["true_vintage", "reconstructed", "latest_revised"] as const;

export type VisibilityPolicy = (typeof VISIBILITY_POLICIES)[number];

export interface ObservationQuery {
  readonly knownAt: string;
  readonly policy: VisibilityPolicy;
  readonly systemAt?: string;
  readonly limit: number;
}

export type ProvenanceQuery = Readonly<Record<never, never>>;

interface GovernedObservationRow extends Record<string, unknown> {
  readonly observation_id: string;
  readonly series_id: string;
  readonly release_id: string;
  readonly raw_payload_id: string;
  readonly transformation_run_id: string;
  readonly period_start: string;
  readonly period_end: string;
  readonly value_numeric: string | null;
  readonly missing_reason: string | null;
  readonly observation_status: string;
  readonly parser_version: string;
  readonly release_time: string | null;
  readonly availability_time: string | null;
  readonly retrieved_at: string;
  readonly pit_quality: string;
  readonly recorded_at: string;
}

interface ProvenanceRow extends Record<string, unknown> {
  readonly provenance: unknown;
}

export interface GovernedObservation {
  readonly observationId: string;
  readonly seriesId: string;
  readonly releaseId: string;
  readonly rawPayloadId: string;
  readonly transformationRunId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly value: string | null;
  readonly missingReason: string | null;
  readonly status: string;
  readonly parserVersion: string;
  readonly releaseTime: string | null;
  readonly availabilityTime: string | null;
  readonly retrievedAt: string;
  readonly pitQuality: string;
  readonly recordedAt: string;
}

export interface GovernedObservationPage {
  readonly seriesId: string;
  readonly pointInTime: {
    readonly knownAt: string;
    readonly policy: VisibilityPolicy;
    readonly systemAt?: string;
  };
  readonly count: number;
  readonly observations: readonly GovernedObservation[];
}

export function parseObservationQuery(raw: Readonly<Record<string, unknown>>): ObservationQuery {
  assertOnlyFields(raw, QUERY_FIELDS);
  const knownAt = instantField(raw.knownAt, "knownAt");
  const policyValue = stringField(raw.policy, "policy");
  if (!VISIBILITY_POLICIES.includes(policyValue as VisibilityPolicy)) invalidRequest("policy");
  const policy = policyValue as VisibilityPolicy;
  const systemAt = optionalInstantField(raw.systemAt, "systemAt");
  if (policy === "reconstructed" && systemAt === undefined) invalidRequest("systemAt");
  if (policy === "latest_revised" && systemAt !== undefined) invalidRequest("systemAt");
  const limit = boundedIntegerField(raw.limit, "limit", 1000, 1, 1000);
  return Object.freeze({
    knownAt,
    policy,
    ...(systemAt === undefined ? {} : { systemAt }),
    limit,
  });
}

export function parseProvenanceQuery(raw: Readonly<Record<string, unknown>>): ProvenanceQuery {
  assertOnlyFields(raw, PROVENANCE_QUERY_FIELDS);
  return Object.freeze({});
}

export function parseResourceId(value: string, field: string): string {
  return uuidField(value, field);
}

@Injectable()
export class GovernedEvidenceService {
  constructor(
    @Inject(PostgresRuntime) private readonly database: PostgresRuntime,
    @Inject(WorkspaceAccessService) private readonly workspaceAccess: WorkspaceAccessService,
    @Inject(GovernedAuthorizationService)
    private readonly authorization: GovernedAuthorizationService,
  ) {}

  async observations(
    principal: Principal,
    requestedSeriesId: string,
    query: ObservationQuery,
  ): Promise<GovernedObservationPage> {
    const seriesId = parseResourceId(requestedSeriesId, "seriesId");
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.workspaceAccess.reconcilePrincipal(principal, transaction);
      await this.authorization.assertEvidenceSeriesAccess(principal, seriesId, transaction);
      const result = await transaction.query<GovernedObservationRow>(governedObservationsSql(), [
        seriesId,
        query.knownAt,
        query.policy,
        query.systemAt ?? null,
        "api",
        query.limit,
      ]);
      const observations = result.rows.map(mapObservation);
      return Object.freeze({
        seriesId,
        pointInTime: Object.freeze({
          knownAt: query.knownAt,
          policy: query.policy,
          ...(query.systemAt === undefined ? {} : { systemAt: query.systemAt }),
        }),
        count: observations.length,
        observations: Object.freeze(observations),
      });
    });
  }

  async provenance(
    principal: Principal,
    requestedObservationId: string,
    _query: ProvenanceQuery,
  ): Promise<Readonly<Record<string, unknown>>> {
    const observationId = parseResourceId(requestedObservationId, "observationId");
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.workspaceAccess.reconcilePrincipal(principal, transaction);
      await this.authorization.assertEvidenceObservationAccess(
        principal,
        observationId,
        transaction,
      );
      const result = await transaction.query<ProvenanceRow>(
        `SELECT evidence.governed_observation_provenance($1::uuid, $2::text) AS provenance`,
        [observationId, "api"],
      );
      const provenance = result.rows[0]?.provenance;
      if (!isRecord(provenance)) {
        throw new NotFoundException({ code: "EVIDENCE_NOT_FOUND" });
      }
      return Object.freeze({ ...provenance });
    });
  }
}

function governedObservationsSql(): string {
  return `
    SELECT
      observation_id::text,
      series_id::text,
      release_id::text,
      raw_payload_id::text,
      transformation_run_id::text,
      to_char(period_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS period_start,
      to_char(period_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS period_end,
      value_numeric::text,
      missing_reason,
      observation_status,
      parser_version,
      CASE WHEN release_time IS NULL THEN NULL ELSE
        to_char(release_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS release_time,
      CASE WHEN availability_time IS NULL THEN NULL ELSE
        to_char(availability_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END
        AS availability_time,
      to_char(retrieved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS retrieved_at,
      pit_quality,
      to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS recorded_at
    FROM evidence.governed_observations_as_known(
      $1::uuid, $2::timestamptz, $3::text, $4::timestamptz, $5::text, $6::integer
    )
    ORDER BY period_start, period_end, observation_id
  `;
}

function mapObservation(row: GovernedObservationRow): GovernedObservation {
  return Object.freeze({
    observationId: row.observation_id,
    seriesId: row.series_id,
    releaseId: row.release_id,
    rawPayloadId: row.raw_payload_id,
    transformationRunId: row.transformation_run_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    value: row.value_numeric,
    missingReason: row.missing_reason,
    status: row.observation_status,
    parserVersion: row.parser_version,
    releaseTime: row.release_time,
    availabilityTime: row.availability_time,
    retrievedAt: row.retrieved_at,
    pitQuality: row.pit_quality,
    recordedAt: row.recorded_at,
  });
}

function assertOnlyFields(
  raw: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) invalidRequest(key);
  }
}

function uuidField(value: unknown, field: string): string {
  const parsed = stringField(value, field);
  if (!UUID.test(parsed)) invalidRequest(field);
  return parsed;
}

function instantField(value: unknown, field: string): string {
  const parsed = stringField(value, field);
  try {
    return assertIsoInstant(parsed, field);
  } catch {
    return invalidRequest(field);
  }
}

function optionalInstantField(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return instantField(value, field);
}

function stringField(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    return invalidRequest(field);
  }
  return value;
}

function boundedIntegerField(
  value: unknown,
  field: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9]\d{0,3}$/.test(value)) invalidRequest(field);
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
