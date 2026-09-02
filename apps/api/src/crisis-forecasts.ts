import { assertIsoInstant, type Principal } from "@economyos/contracts";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PostgresRuntime, type TenantTransaction } from "./database.js";
import { GovernedAuthorizationService } from "./governed-authorization.js";
import { WorkspaceAccessService } from "./workspaces.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const PROBABILITY = /^(?:0(?:\.[0-9]{1,18})?|1(?:\.0{1,18})?)$/;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const INDICATOR_KEY = /^[a-z][a-z0-9_.-]{2,127}$/;
const STABLE_KEY = /^[a-z][a-z0-9_.-]{0,127}$/;
const MAX_SLOT_ITEMS = 100;
const MAX_ASSUMPTIONS_BYTES = 128 * 1_024;
const MAX_INVALIDATION_BYTES = 256 * 1_024;
const HAZARDS = ["FX", "BANK", "SOV", "MON", "POL", "COUP", "CIV", "WAR"] as const;
const HORIZONS = [30, 90, 180, 365] as const;
const CALIBRATION_STATUSES = ["calibrated", "uncalibrated"] as const;
const EVIDENCE_ROLES = ["supports", "contradicts"] as const;
const EVIDENCE_DIRECTIONS = ["increases_risk", "decreases_risk"] as const;
const EVIDENCE_SOURCE_KINDS = [
  "canonical_admission",
  "relationship_evidence",
  "economic_state_run",
] as const;
const INVALIDATION_OPERATORS = [
  "less_than",
  "less_than_or_equal",
  "greater_than",
  "greater_than_or_equal",
  "equals",
] as const;
const DETAIL_QUERY_FIELDS = new Set(["workspaceId"]);
const PAGE_QUERY_FIELDS = new Set([
  "workspaceId",
  "geographyId",
  "limit",
  "beforeGeneratedAt",
  "beforeRunId",
]);

export type CrisisHazard = (typeof HAZARDS)[number];
export type CrisisHorizonDays = (typeof HORIZONS)[number];

export interface CrisisForecastRunQuery {
  readonly workspaceId: string;
}

export interface CrisisForecastRunPageQuery extends CrisisForecastRunQuery {
  readonly geographyId: string;
  readonly limit: number;
  readonly beforeGeneratedAt: string | null;
  readonly beforeRunId: string | null;
}

export interface CrisisForecastSlotPointer {
  readonly slotId: string;
  readonly hazard: CrisisHazard;
  readonly horizonDays: CrisisHorizonDays;
  readonly slotSha256: string;
}

export interface CrisisForecastEvidencePointer {
  readonly bindingId: string;
  readonly role: "contradicts" | "supports";
  readonly indicatorKey: string;
  readonly direction: "decreases_risk" | "increases_risk";
  readonly observedAt: string;
  readonly availableAt: string;
  readonly sourceKind: "canonical_admission" | "economic_state_run" | "relationship_evidence";
  readonly sourceId: string;
  readonly sourceSha256: string;
  readonly dataVintageId: string;
  readonly dataVintageSha256: string;
  readonly bindingSha256: string;
}

export interface CrisisForecastInvalidationCriterion {
  readonly criterionId: string;
  readonly description: string;
  readonly indicatorKey: string;
  readonly operator: (typeof INVALIDATION_OPERATORS)[number];
  readonly threshold: string;
  readonly requiredObservations: number;
}

export interface CrisisForecastSlotDetail {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly slotId: string;
  readonly runId: string;
  readonly geographyId: string;
  readonly hazard: CrisisHazard;
  readonly horizonDays: CrisisHorizonDays;
  readonly asOf: string;
  readonly generatedAt: string;
  readonly runSha256: string;
  readonly slotSha256: string;
  readonly probability: {
    readonly raw: string;
    readonly calibrated: string;
    readonly aggregate: null;
  };
  readonly uncertainty: {
    readonly lower: string;
    readonly upper: string;
    readonly confidence: string;
    readonly method: string;
  };
  readonly calibrationStatus: "calibrated" | "uncalibrated";
  readonly outOfDomain: boolean;
  readonly model: {
    readonly artifactId: string;
    readonly artifactSha256: string;
    readonly version: string;
    readonly trainingDataCutoff: string;
    readonly calibratedThrough: string;
    readonly configurationSha256: string;
    readonly codeSha256: string;
  };
  readonly assumptions: readonly string[];
  readonly invalidationCriteria: readonly CrisisForecastInvalidationCriterion[];
  readonly evidenceAbsenceReason: string | null;
  readonly counterEvidenceAbsenceReason: string | null;
  readonly evidence: readonly CrisisForecastEvidencePointer[];
}

export interface CrisisForecastRunPointer {
  readonly runId: string;
  readonly geographyId: string;
  readonly asOf: string;
  readonly generatedAt: string;
  readonly datasetSnapshotId: string;
  readonly runSha256: string;
  readonly completionId: string;
  readonly completionSha256: string;
}

export interface CrisisForecastRun extends CrisisForecastRunPointer {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly datasetSnapshotSha256: string;
  readonly slotCount: 32;
  readonly slots: readonly CrisisForecastSlotPointer[];
  readonly semantics: {
    readonly hazardsAreIndependent: true;
    readonly aggregateProbability: null;
  };
}

export interface CrisisForecastRunPage {
  readonly workspaceId: string;
  readonly geographyId: string;
  readonly count: number;
  readonly runs: readonly CrisisForecastRunPointer[];
  readonly nextCursor: {
    readonly beforeGeneratedAt: string;
    readonly beforeRunId: string;
  } | null;
}

interface CrisisForecastRunRow extends Record<string, unknown> {
  readonly run_id: unknown;
  readonly geography_id: unknown;
  readonly as_of: unknown;
  readonly generated_at: unknown;
  readonly dataset_snapshot_id: unknown;
  readonly dataset_snapshot_sha256: unknown;
  readonly run_sha256: unknown;
  readonly completion_id: unknown;
  readonly completion_sha256: unknown;
  readonly slot_pointers: unknown;
}

interface CrisisForecastRunPointerRow extends Record<string, unknown> {
  readonly run_id: unknown;
  readonly geography_id: unknown;
  readonly as_of: unknown;
  readonly generated_at: unknown;
  readonly dataset_snapshot_id: unknown;
  readonly run_sha256: unknown;
  readonly completion_id: unknown;
  readonly completion_sha256: unknown;
}

interface CrisisForecastSlotRow extends Record<string, unknown> {
  readonly slot_id: unknown;
  readonly run_id: unknown;
  readonly geography_id: unknown;
  readonly hazard: unknown;
  readonly horizon_days: unknown;
  readonly as_of: unknown;
  readonly generated_at: unknown;
  readonly run_sha256: unknown;
  readonly slot_sha256: unknown;
  readonly raw_probability: unknown;
  readonly calibrated_probability: unknown;
  readonly uncertainty_lower: unknown;
  readonly uncertainty_upper: unknown;
  readonly uncertainty_confidence: unknown;
  readonly uncertainty_method: unknown;
  readonly calibration_status: unknown;
  readonly out_of_domain: unknown;
  readonly model_artifact_id: unknown;
  readonly model_artifact_sha256: unknown;
  readonly model_version: unknown;
  readonly training_data_cutoff: unknown;
  readonly calibrated_through: unknown;
  readonly model_configuration_sha256: unknown;
  readonly model_code_sha256: unknown;
  readonly assumptions: unknown;
  readonly invalidation_criteria: unknown;
  readonly evidence_absence_reason: unknown;
  readonly counter_evidence_absence_reason: unknown;
  readonly evidence_pointers: unknown;
}

export function parseCrisisForecastRunQuery(
  raw: Readonly<Record<string, unknown>>,
): CrisisForecastRunQuery {
  assertOnlyFields(raw, DETAIL_QUERY_FIELDS);
  return Object.freeze({ workspaceId: uuidField(raw.workspaceId, "workspaceId") });
}

export function parseCrisisForecastRunPageQuery(
  raw: Readonly<Record<string, unknown>>,
): CrisisForecastRunPageQuery {
  assertOnlyFields(raw, PAGE_QUERY_FIELDS);
  const beforeGeneratedAt = optionalInstantField(raw.beforeGeneratedAt, "beforeGeneratedAt");
  const beforeRunId = optionalUuidField(raw.beforeRunId, "beforeRunId");
  if ((beforeGeneratedAt === null) !== (beforeRunId === null)) {
    return invalidRequest("beforeGeneratedAt");
  }
  return Object.freeze({
    workspaceId: uuidField(raw.workspaceId, "workspaceId"),
    geographyId: uuidField(raw.geographyId, "geographyId"),
    limit: boundedIntegerField(raw.limit, "limit", 50, 1, 100),
    beforeGeneratedAt,
    beforeRunId,
  });
}

@Injectable()
export class CrisisForecastService {
  constructor(
    @Inject(PostgresRuntime) private readonly database: PostgresRuntime,
    @Inject(WorkspaceAccessService) private readonly workspaceAccess: WorkspaceAccessService,
    @Inject(GovernedAuthorizationService)
    private readonly authorization: GovernedAuthorizationService,
  ) {}

  async get(
    principal: Principal,
    requestedRunId: string,
    query: CrisisForecastRunQuery,
  ): Promise<CrisisForecastRun> {
    const runId = uuidField(requestedRunId, "runId");
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.assertAccess(principal, query.workspaceId, transaction);
      const result = await transaction.query<CrisisForecastRunRow>(GET_RUN_SQL, [
        query.workspaceId,
        runId,
      ]);
      if (result.rows.length > 1) {
        throw new Error("Crisis forecast run resolver returned multiple rows");
      }
      const row = result.rows[0];
      if (!row) throw runNotFound();
      return mapRun(query.workspaceId, row);
    });
  }

  async getSlot(
    principal: Principal,
    requestedSlotId: string,
    query: CrisisForecastRunQuery,
  ): Promise<CrisisForecastSlotDetail> {
    const slotId = uuidField(requestedSlotId, "slotId");
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.assertAccess(principal, query.workspaceId, transaction);
      const result = await transaction.query<CrisisForecastSlotRow>(GET_SLOT_SQL, [
        query.workspaceId,
        slotId,
      ]);
      if (result.rows.length > 1) {
        throw new Error("Crisis forecast slot resolver returned multiple rows");
      }
      const row = result.rows[0];
      if (!row) throw slotNotFound();
      return mapSlotDetail(query.workspaceId, row);
    });
  }

  async list(
    principal: Principal,
    query: CrisisForecastRunPageQuery,
  ): Promise<CrisisForecastRunPage> {
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.assertAccess(principal, query.workspaceId, transaction);
      const result = await transaction.query<CrisisForecastRunPointerRow>(LIST_RUNS_SQL, [
        query.workspaceId,
        query.geographyId,
        query.limit,
        query.beforeGeneratedAt,
        query.beforeRunId,
      ]);
      if (result.rows.length > query.limit) throw invalidDatabaseValue("run_page.limit");
      const runs = Object.freeze(result.rows.map(mapRunPointer));
      if (runs.some((run) => run.geographyId !== query.geographyId)) {
        throw invalidDatabaseValue("geography_id");
      }
      assertRunPageOrder(runs);
      const last = runs.at(-1);
      return Object.freeze({
        workspaceId: query.workspaceId,
        geographyId: query.geographyId,
        count: runs.length,
        runs,
        nextCursor:
          runs.length === query.limit && last
            ? Object.freeze({
                beforeGeneratedAt: last.generatedAt,
                beforeRunId: last.runId,
              })
            : null,
      });
    });
  }

  private async assertAccess(
    principal: Principal,
    workspaceId: string,
    transaction: TenantTransaction,
  ): Promise<void> {
    await this.workspaceAccess.assertMembership(principal, workspaceId, transaction);
    await this.authorization.assertEconomicStateAccess(principal, workspaceId, transaction);
  }
}

const GET_RUN_SQL = `
  SELECT
    run_id::text,
    geography_id::text,
    to_char(as_of AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS as_of,
    to_char(generated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS generated_at,
    dataset_snapshot_id::text,
    dataset_snapshot_sha256,
    run_sha256,
    completion_id::text,
    completion_sha256,
    slot_pointers
  FROM app.get_crisis_forecast_run($1::uuid, $2::uuid)
`;

const GET_SLOT_SQL = `
  SELECT
    slot_id::text,
    run_id::text,
    geography_id::text,
    hazard,
    horizon_days,
    to_char(as_of AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS as_of,
    to_char(generated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS generated_at,
    run_sha256,
    slot_sha256,
    raw_probability,
    calibrated_probability,
    uncertainty_lower,
    uncertainty_upper,
    uncertainty_confidence,
    uncertainty_method,
    calibration_status,
    out_of_domain,
    model_artifact_id::text,
    model_artifact_sha256,
    model_version,
    to_char(training_data_cutoff AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      AS training_data_cutoff,
    to_char(calibrated_through AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      AS calibrated_through,
    model_configuration_sha256,
    model_code_sha256,
    assumptions,
    invalidation_criteria,
    evidence_absence_reason,
    counter_evidence_absence_reason,
    evidence_pointers
  FROM app.get_crisis_forecast_slot($1::uuid, $2::uuid)
`;

const LIST_RUNS_SQL = `
  SELECT
    run_id::text,
    geography_id::text,
    to_char(as_of AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS as_of,
    to_char(generated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS generated_at,
    dataset_snapshot_id::text,
    run_sha256,
    completion_id::text,
    completion_sha256
  FROM app.list_crisis_forecast_runs(
    $1::uuid, $2::uuid, $3::integer, $4::timestamptz, $5::uuid
  )
  ORDER BY generated_at DESC, run_id DESC
`;

function mapSlotDetail(workspaceId: string, row: CrisisForecastSlotRow): CrisisForecastSlotDetail {
  const asOf = databaseInstant(row.as_of, "as_of");
  const generatedAt = databaseInstant(row.generated_at, "generated_at");
  const trainingDataCutoff = databaseInstant(row.training_data_cutoff, "training_data_cutoff");
  const calibratedThrough = databaseInstant(row.calibrated_through, "calibrated_through");
  if (
    compareDatabaseInstants(generatedAt, asOf) < 0 ||
    compareDatabaseInstants(trainingDataCutoff, calibratedThrough) > 0 ||
    compareDatabaseInstants(calibratedThrough, asOf) > 0
  ) {
    throw invalidDatabaseValue("temporal_provenance");
  }
  const raw = databaseProbability(row.raw_probability, "raw_probability", true);
  const calibrated = databaseProbability(
    row.calibrated_probability,
    "calibrated_probability",
    true,
  );
  const lower = databaseProbability(row.uncertainty_lower, "uncertainty_lower", true);
  const upper = databaseProbability(row.uncertainty_upper, "uncertainty_upper", true);
  const confidence = databaseProbability(
    row.uncertainty_confidence,
    "uncertainty_confidence",
    false,
  );
  if (compareProbabilities(lower, calibrated) > 0 || compareProbabilities(calibrated, upper) > 0) {
    throw invalidDatabaseValue("uncertainty_interval");
  }
  const evidence = mapEvidencePointers(row.evidence_pointers, asOf);
  const evidenceAbsenceReason = databaseNullableText(
    row.evidence_absence_reason,
    "evidence_absence_reason",
    500,
    10,
  );
  const counterEvidenceAbsenceReason = databaseNullableText(
    row.counter_evidence_absence_reason,
    "counter_evidence_absence_reason",
    500,
    10,
  );
  assertEvidencePresence(evidence, "supports", evidenceAbsenceReason, "evidence_absence_reason");
  assertEvidencePresence(
    evidence,
    "contradicts",
    counterEvidenceAbsenceReason,
    "counter_evidence_absence_reason",
  );
  return Object.freeze({
    schemaVersion: 1 as const,
    workspaceId,
    slotId: databaseUuid(row.slot_id, "slot_id"),
    runId: databaseUuid(row.run_id, "run_id"),
    geographyId: databaseUuid(row.geography_id, "geography_id"),
    hazard: databaseEnum(row.hazard, "hazard", HAZARDS),
    horizonDays: databaseIntegerEnum(row.horizon_days, "horizon_days", HORIZONS),
    asOf,
    generatedAt,
    runSha256: databaseSha256(row.run_sha256, "run_sha256"),
    slotSha256: databaseSha256(row.slot_sha256, "slot_sha256"),
    probability: Object.freeze({ raw, calibrated, aggregate: null }),
    uncertainty: Object.freeze({
      lower,
      upper,
      confidence,
      method: databaseText(row.uncertainty_method, "uncertainty_method", 128, 3),
    }),
    calibrationStatus: databaseEnum(
      row.calibration_status,
      "calibration_status",
      CALIBRATION_STATUSES,
    ),
    outOfDomain: databaseBoolean(row.out_of_domain, "out_of_domain"),
    model: Object.freeze({
      artifactId: databaseUuid(row.model_artifact_id, "model_artifact_id"),
      artifactSha256: databaseSha256(row.model_artifact_sha256, "model_artifact_sha256"),
      version: databaseSemver(row.model_version, "model_version"),
      trainingDataCutoff,
      calibratedThrough,
      configurationSha256: databaseSha256(
        row.model_configuration_sha256,
        "model_configuration_sha256",
      ),
      codeSha256: databaseSha256(row.model_code_sha256, "model_code_sha256"),
    }),
    assumptions: mapAssumptions(row.assumptions),
    invalidationCriteria: mapInvalidationCriteria(row.invalidation_criteria),
    evidenceAbsenceReason,
    counterEvidenceAbsenceReason,
    evidence,
  });
}

function mapEvidencePointers(
  value: unknown,
  asOf: string,
): readonly CrisisForecastEvidencePointer[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw invalidDatabaseValue("evidence_pointers");
  }
  const seen = new Set<string>();
  let previousOrder = -1;
  let previousId = "";
  const pointers = value.map((candidate, index): CrisisForecastEvidencePointer => {
    if (!isRecord(candidate)) throw invalidDatabaseValue(`evidence_pointers[${index}]`);
    assertExactDatabaseKeys(
      candidate,
      [
        "bindingId",
        "role",
        "indicatorKey",
        "direction",
        "observedAt",
        "availableAt",
        "sourceKind",
        "sourceId",
        "sourceSha256",
        "dataVintageId",
        "dataVintageSha256",
        "bindingSha256",
      ],
      `evidence_pointers[${index}]`,
    );
    const bindingId = databaseUuid(candidate.bindingId, `evidence_pointers[${index}].bindingId`);
    if (seen.has(bindingId)) throw invalidDatabaseValue("evidence_pointers.bindingId");
    seen.add(bindingId);
    const role = databaseEnum(candidate.role, `evidence_pointers[${index}].role`, EVIDENCE_ROLES);
    const roleOrder = role === "supports" ? 0 : 1;
    if (roleOrder < previousOrder || (roleOrder === previousOrder && bindingId <= previousId)) {
      throw invalidDatabaseValue("evidence_pointers.order");
    }
    previousOrder = roleOrder;
    previousId = bindingId;
    const observedAt = databaseInstant(
      candidate.observedAt,
      `evidence_pointers[${index}].observedAt`,
    );
    const availableAt = databaseInstant(
      candidate.availableAt,
      `evidence_pointers[${index}].availableAt`,
    );
    if (
      compareDatabaseInstants(observedAt, availableAt) > 0 ||
      compareDatabaseInstants(availableAt, asOf) > 0
    ) {
      throw invalidDatabaseValue(`evidence_pointers[${index}].temporal`);
    }
    return Object.freeze({
      bindingId,
      role,
      indicatorKey: databaseKey(candidate.indicatorKey, `evidence_pointers[${index}].indicatorKey`),
      direction: databaseEnum(
        candidate.direction,
        `evidence_pointers[${index}].direction`,
        EVIDENCE_DIRECTIONS,
      ),
      observedAt,
      availableAt,
      sourceKind: databaseEnum(
        candidate.sourceKind,
        `evidence_pointers[${index}].sourceKind`,
        EVIDENCE_SOURCE_KINDS,
      ),
      sourceId: databaseUuid(candidate.sourceId, `evidence_pointers[${index}].sourceId`),
      sourceSha256: databaseSha256(
        candidate.sourceSha256,
        `evidence_pointers[${index}].sourceSha256`,
      ),
      dataVintageId: databaseUuid(
        candidate.dataVintageId,
        `evidence_pointers[${index}].dataVintageId`,
      ),
      dataVintageSha256: databaseSha256(
        candidate.dataVintageSha256,
        `evidence_pointers[${index}].dataVintageSha256`,
      ),
      bindingSha256: databaseSha256(
        candidate.bindingSha256,
        `evidence_pointers[${index}].bindingSha256`,
      ),
    });
  });
  return Object.freeze(pointers);
}

function assertEvidencePresence(
  pointers: readonly CrisisForecastEvidencePointer[],
  role: CrisisForecastEvidencePointer["role"],
  absenceReason: string | null,
  field: string,
): void {
  const hasEvidence = pointers.some((pointer) => pointer.role === role);
  if (hasEvidence === (absenceReason !== null)) throw invalidDatabaseValue(field);
}

function mapAssumptions(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SLOT_ITEMS) {
    throw invalidDatabaseValue("assumptions");
  }
  const assumptions = Object.freeze(
    value.map((assumption, index) => databaseText(assumption, `assumptions[${index}]`, 2_000)),
  );
  if (Buffer.byteLength(JSON.stringify(assumptions), "utf8") > MAX_ASSUMPTIONS_BYTES) {
    throw invalidDatabaseValue("assumptions");
  }
  return assumptions;
}

function mapInvalidationCriteria(value: unknown): readonly CrisisForecastInvalidationCriterion[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SLOT_ITEMS) {
    throw invalidDatabaseValue("invalidation_criteria");
  }
  const seen = new Set<string>();
  const criteria = value.map((candidate, index): CrisisForecastInvalidationCriterion => {
    const field = `invalidation_criteria[${index}]`;
    if (!isRecord(candidate)) throw invalidDatabaseValue(field);
    assertExactDatabaseKeys(
      candidate,
      [
        "criterionId",
        "description",
        "indicatorKey",
        "operator",
        "threshold",
        "requiredObservations",
      ],
      field,
    );
    const criterionId = databaseStableKey(candidate.criterionId, `${field}.criterionId`);
    if (seen.has(criterionId)) throw invalidDatabaseValue("invalidation_criteria.criterionId");
    seen.add(criterionId);
    return Object.freeze({
      criterionId,
      description: databaseText(candidate.description, `${field}.description`, 2_000),
      indicatorKey: databaseStableKey(candidate.indicatorKey, `${field}.indicatorKey`),
      operator: databaseEnum(candidate.operator, `${field}.operator`, INVALIDATION_OPERATORS),
      threshold: databaseText(candidate.threshold, `${field}.threshold`, 2_000),
      requiredObservations: databasePositiveInteger(
        candidate.requiredObservations,
        `${field}.requiredObservations`,
        999_999,
      ),
    });
  });
  const frozen = Object.freeze(criteria);
  if (Buffer.byteLength(JSON.stringify(frozen), "utf8") > MAX_INVALIDATION_BYTES) {
    throw invalidDatabaseValue("invalidation_criteria");
  }
  return frozen;
}

function mapRun(workspaceId: string, row: CrisisForecastRunRow): CrisisForecastRun {
  const pointer = mapRunPointer(row);
  const slots = mapSlots(row.slot_pointers);
  return Object.freeze({
    schemaVersion: 1 as const,
    workspaceId,
    ...pointer,
    datasetSnapshotSha256: databaseSha256(row.dataset_snapshot_sha256, "dataset_snapshot_sha256"),
    slotCount: 32 as const,
    slots,
    semantics: Object.freeze({
      hazardsAreIndependent: true as const,
      aggregateProbability: null,
    }),
  });
}

function mapRunPointer(row: CrisisForecastRunPointerRow): CrisisForecastRunPointer {
  const asOf = databaseInstant(row.as_of, "as_of");
  const generatedAt = databaseInstant(row.generated_at, "generated_at");
  if (compareDatabaseInstants(generatedAt, asOf) < 0) {
    throw invalidDatabaseValue("generated_at");
  }
  return Object.freeze({
    runId: databaseUuid(row.run_id, "run_id"),
    geographyId: databaseUuid(row.geography_id, "geography_id"),
    asOf,
    generatedAt,
    datasetSnapshotId: databaseUuid(row.dataset_snapshot_id, "dataset_snapshot_id"),
    runSha256: databaseSha256(row.run_sha256, "run_sha256"),
    completionId: databaseUuid(row.completion_id, "completion_id"),
    completionSha256: databaseSha256(row.completion_sha256, "completion_sha256"),
  });
}

function assertRunPageOrder(runs: readonly CrisisForecastRunPointer[]): void {
  const seen = new Set<string>();
  for (const [index, run] of runs.entries()) {
    if (seen.has(run.runId)) throw invalidDatabaseValue("run_page.run_id");
    seen.add(run.runId);
    const previous = runs[index - 1];
    if (!previous) continue;
    const generatedOrder = compareDatabaseInstants(previous.generatedAt, run.generatedAt);
    if (generatedOrder < 0 || (generatedOrder === 0 && previous.runId <= run.runId)) {
      throw invalidDatabaseValue("run_page.order");
    }
  }
}

function mapSlots(value: unknown): readonly CrisisForecastSlotPointer[] {
  if (!Array.isArray(value) || value.length !== 32) throw invalidDatabaseValue("slot_pointers");
  const slots = value.map((candidate, index): CrisisForecastSlotPointer => {
    if (!isRecord(candidate)) throw invalidDatabaseValue(`slot_pointers[${index}]`);
    const keys = Object.keys(candidate).sort();
    if (keys.join(",") !== "hazard,horizonDays,slotId,slotSha256") {
      throw invalidDatabaseValue(`slot_pointers[${index}]`);
    }
    const expectedHazard = HAZARDS[Math.floor(index / HORIZONS.length)];
    const expectedHorizon = HORIZONS[index % HORIZONS.length];
    if (expectedHazard === undefined || expectedHorizon === undefined) {
      throw invalidDatabaseValue(`slot_pointers[${index}].identity`);
    }
    if (candidate.hazard !== expectedHazard || candidate.horizonDays !== expectedHorizon) {
      throw invalidDatabaseValue(`slot_pointers[${index}].identity`);
    }
    return Object.freeze({
      slotId: databaseUuid(candidate.slotId, `slot_pointers[${index}].slotId`),
      hazard: expectedHazard,
      horizonDays: expectedHorizon,
      slotSha256: databaseSha256(candidate.slotSha256, `slot_pointers[${index}].slotSha256`),
    });
  });
  if (new Set(slots.map((slot) => slot.slotId)).size !== slots.length) {
    throw invalidDatabaseValue("slot_pointers.slotId");
  }
  return Object.freeze(slots);
}

function assertOnlyFields(
  raw: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
): void {
  const unexpected = Object.keys(raw).find((key) => !allowed.has(key));
  if (unexpected !== undefined) invalidRequest(unexpected);
}

function uuidField(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value)) return invalidRequest(field);
  return value.toLowerCase();
}

function optionalUuidField(value: unknown, field: string): string | null {
  return value === undefined ? null : uuidField(value, field);
}

function optionalInstantField(value: unknown, field: string): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string") return invalidRequest(field);
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
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    return invalidRequest(field);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    return invalidRequest(field);
  }
  return parsed;
}

function databaseUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw invalidDatabaseValue(field);
  return value.toLowerCase();
}

function databaseSha256(value: unknown, field: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) throw invalidDatabaseValue(field);
  return value;
}

function databaseProbability(value: unknown, field: string, allowZero: boolean): string {
  if (typeof value !== "string" || !PROBABILITY.test(value)) {
    throw invalidDatabaseValue(field);
  }
  if (!allowZero && probabilityKey(value) === 0n) throw invalidDatabaseValue(field);
  return value;
}

function compareProbabilities(left: string, right: string): number {
  const leftKey = probabilityKey(left);
  const rightKey = probabilityKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function probabilityKey(value: string): bigint {
  const [whole = "", fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000_000_000_000_000n + BigInt(fraction.padEnd(18, "0"));
}

function databaseEnum<const Values extends readonly string[]>(
  value: unknown,
  field: string,
  values: Values,
): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw invalidDatabaseValue(field);
  }
  return value as Values[number];
}

function databaseIntegerEnum<const Values extends readonly number[]>(
  value: unknown,
  field: string,
  values: Values,
): Values[number] {
  if (typeof value !== "number" || !Number.isInteger(value) || !values.includes(value)) {
    throw invalidDatabaseValue(field);
  }
  return value as Values[number];
}

function databaseText(value: unknown, field: string, maximum: number, minimum = 1): string {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    value.trim() !== value
  ) {
    throw invalidDatabaseValue(field);
  }
  return value;
}

function databaseNullableText(
  value: unknown,
  field: string,
  maximum: number,
  minimum = 1,
): string | null {
  return value === null ? null : databaseText(value, field, maximum, minimum);
}

function databaseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw invalidDatabaseValue(field);
  return value;
}

function databaseSemver(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length > 128 || !SEMVER.test(value)) {
    throw invalidDatabaseValue(field);
  }
  return value;
}

function databaseKey(value: unknown, field: string): string {
  if (typeof value !== "string" || !INDICATOR_KEY.test(value)) {
    throw invalidDatabaseValue(field);
  }
  return value;
}

function databaseStableKey(value: unknown, field: string): string {
  if (typeof value !== "string" || !STABLE_KEY.test(value)) {
    throw invalidDatabaseValue(field);
  }
  return value;
}

function databasePositiveInteger(
  value: unknown,
  field: string,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw invalidDatabaseValue(field);
  }
  return value;
}

function databaseInstant(value: unknown, field: string): string {
  if (typeof value !== "string") throw invalidDatabaseValue(field);
  try {
    return assertIsoInstant(value, field);
  } catch {
    throw invalidDatabaseValue(field);
  }
}

function compareDatabaseInstants(left: string, right: string): number {
  const leftKey = databaseInstantKey(left);
  const rightKey = databaseInstantKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function databaseInstantKey(value: string): bigint {
  const [seconds = "", fraction = ""] = value.slice(0, -1).split(".");
  const milliseconds = Date.parse(`${seconds}Z`);
  if (!Number.isFinite(milliseconds)) throw invalidDatabaseValue("instant");
  return BigInt(milliseconds) * 1_000_000n + BigInt(fraction.padEnd(9, "0"));
}

function assertExactDatabaseKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  field: string,
): void {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw invalidDatabaseValue(field);
  }
}

function invalidDatabaseValue(field: string): Error {
  return new Error(`Crisis forecast database contract is invalid at ${field}`);
}

function invalidRequest(field: string): never {
  throw new BadRequestException({
    code: "INVALID_CRISIS_FORECAST_REQUEST",
    errors: [{ path: field, code: "INVALID" }],
  });
}

function runNotFound(): NotFoundException {
  return new NotFoundException({ code: "CRISIS_FORECAST_RUN_NOT_FOUND" });
}

function slotNotFound(): NotFoundException {
  return new NotFoundException({ code: "CRISIS_FORECAST_SLOT_NOT_FOUND" });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
