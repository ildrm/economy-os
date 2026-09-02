import {
  assertIsoInstant,
  assertSha256,
  assertUuid,
  deterministicUuid,
  digestJson,
  transformationConfiguration,
} from "@economyos/data-admission";
import type {
  AdmissionDecision,
  BeginRunResult,
  IngestionOutputManifest,
  IngestionStage,
  IngestionWorkflowInput,
  LandedRawPayload,
  LandingResult,
  PromotionResult,
  ReconciliationResult,
  RecordStageInput,
} from "@economyos/data-admission/workflow-contracts";
import type { Pool, PoolClient, QueryResultRow } from "pg";

import type { IngestionAuthorizationGuard } from "./authorization.js";

export class IngestionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestionConflictError";
  }
}

export interface PersistLandingInput {
  readonly workflow: IngestionWorkflowInput;
  readonly payload: LandedRawPayload;
  readonly attempt: number;
}

export interface IngestionRepository {
  checkReady(): Promise<void>;
  beginRun(input: IngestionWorkflowInput): Promise<BeginRunResult>;
  recordStage(input: RecordStageInput): Promise<void>;
  findLanding(input: IngestionWorkflowInput): Promise<LandedRawPayload | null>;
  persistLanding(input: PersistLandingInput): Promise<LandedRawPayload>;
  persistQuarantine(input: {
    readonly workflow: IngestionWorkflowInput;
    readonly landing: LandingResult;
    readonly decision: AdmissionDecision;
    readonly attempt: number;
    readonly completedAt: string;
  }): Promise<void>;
  promote(input: {
    readonly workflow: IngestionWorkflowInput;
    readonly landing: LandingResult;
    readonly decision: AdmissionDecision;
    readonly attempt: number;
    readonly completedAt: string;
  }): Promise<PromotionResult>;
  writeLineage(input: {
    readonly workflow: IngestionWorkflowInput;
    readonly landing: LandingResult;
    readonly promotion: PromotionResult;
    readonly committedAt: string;
  }): Promise<void>;
  reconcileAndCheckpoint(input: {
    readonly workflow: IngestionWorkflowInput;
    readonly landing: LandingResult;
    readonly promotion: PromotionResult;
    readonly committedAt: string;
  }): Promise<ReconciliationResult>;
  failRun(input: {
    readonly workflow: IngestionWorkflowInput;
    readonly stage: IngestionStage;
    readonly attempt: number;
    readonly errorCode: string;
    readonly message: string;
    readonly occurredAt: string;
  }): Promise<void>;
}

interface IngestionRunRow extends QueryResultRow {
  readonly status: "pending" | "running" | "succeeded" | "failed" | "quarantined";
  readonly workflow_id: string;
  readonly dataset_id: string;
  readonly idempotency_key: string;
  readonly input_manifest: unknown;
  readonly output_manifest: unknown | null;
  readonly error_code: string | null;
}

interface RawPayloadRow extends QueryResultRow {
  readonly id: string;
  readonly dataset_id: string;
  readonly request_uri: string;
  readonly object_uri: string;
  readonly media_type: string;
  readonly checksum_sha256: string;
  readonly byte_length: string;
  readonly fetched_at: Date | string;
  readonly provider_request_id: string | null;
}

interface CheckpointRow extends QueryResultRow {
  readonly value: unknown;
  readonly value_sha256: string;
  readonly payload_checksum_sha256: string | null;
}

interface FetchEventRow extends QueryResultRow {
  readonly id: string;
  readonly dataset_id: string;
  readonly raw_payload_id: string;
  readonly request_uri: string;
  readonly fetched_at: Date | string;
  readonly provider_request_id: string | null;
  readonly response_status: number;
  readonly attempt: number;
  readonly workflow_id: string;
  readonly ingestion_run_id: string;
}

interface ConnectorBindingRow extends QueryResultRow {
  readonly dataset_id: string;
  readonly series_id: string;
  readonly connector_code: string;
  readonly configuration: unknown;
  readonly configuration_sha256: string;
  readonly status: string;
}

interface ReleaseRow extends QueryResultRow {
  readonly id: string;
  readonly dataset_id: string;
  readonly raw_payload_id: string;
  readonly release_time: Date | string | null;
  readonly pit_quality: string;
  readonly revision_sequence: number | null;
  readonly source_publication_time: Date | string | null;
  readonly original_release_time: Date | string | null;
  readonly availability_time: Date | string | null;
  readonly revision_time: Date | string | null;
}

interface ObservationRow extends QueryResultRow {
  readonly id: string;
  readonly series_id: string;
  readonly release_id: string;
  readonly period_start: Date | string;
  readonly period_end: Date | string;
  readonly value_numeric: string | null;
  readonly missing_reason: string | null;
  readonly status: string;
  readonly parser_version: string;
  readonly transformation_run_id: string;
  readonly recorded_at: Date | string;
}

interface RuntimeIdentityRow extends QueryResultRow {
  readonly login_name: string;
  readonly effective_name: string;
  readonly login_superuser: boolean;
  readonly effective_superuser: boolean;
  readonly login_bypass_rls: boolean;
  readonly effective_bypass_rls: boolean;
  readonly login_create_role: boolean;
  readonly effective_create_role: boolean;
  readonly login_create_db: boolean;
  readonly effective_create_db: boolean;
  readonly login_replication: boolean;
  readonly effective_replication: boolean;
  readonly login_owns_database: boolean;
  readonly effective_owns_database: boolean;
  readonly login_can_assume_privileged_role: boolean;
  readonly login_can_assume_database_owner: boolean;
  readonly ingest_role_member: boolean;
}

function dbStage(stage: IngestionStage): string {
  switch (stage) {
    case "start":
    case "complete":
    case "quarantine":
      return "workflow";
    case "persist_raw":
      return "persist";
    default:
      return stage;
  }
}

function databaseInstant(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableDatabaseInstant(value: Date | string | null): string | null {
  return value === null ? null : databaseInstant(value);
}

function sameOptionalInstant(actual: Date | string | null, expected: string | null): boolean {
  return (
    nullableDatabaseInstant(actual) ===
    (expected === null ? null : new Date(expected).toISOString())
  );
}

function normalizedDecimal(value: string): string {
  const match = /^(?<sign>-?)(?<integer>\d+)(?:\.(?<fraction>\d+))?$/.exec(value);
  if (!match?.groups) throw new IngestionConflictError("Canonical numeric value is invalid");
  const integer = (match.groups.integer ?? "").replace(/^0+(?=\d)/, "");
  const fraction = (match.groups.fraction ?? "").replace(/0+$/, "");
  const magnitude = fraction ? `${integer}.${fraction}` : integer;
  return match.groups.sign === "-" && magnitude !== "0" ? `-${magnitude}` : magnitude;
}

function asOutputManifest(
  value: unknown,
  input: IngestionWorkflowInput,
  status: "succeeded" | "quarantined",
): IngestionOutputManifest | null {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new IngestionConflictError("Stored ingestion output manifest is invalid");
  }
  const candidate = value as Partial<IngestionOutputManifest>;
  try {
    if (
      candidate.schemaVersion !== 1 ||
      candidate.runId !== input.runId ||
      candidate.status !== status ||
      candidate.inputSha256 !== input.inputSha256 ||
      !Array.isArray(candidate.rawPayloads) ||
      candidate.rawPayloads.length !== 1 ||
      !Array.isArray(candidate.observationIds) ||
      !Array.isArray(candidate.qualityResults) ||
      typeof candidate.qualityScore !== "number" ||
      !Number.isFinite(candidate.qualityScore) ||
      candidate.qualityScore < 0 ||
      candidate.qualityScore > 1
    ) {
      throw new TypeError("output identity or shape is invalid");
    }
    assertSha256(candidate.candidateSha256 ?? "", "output.candidateSha256");
    assertUuid(candidate.transformationRunId ?? "", "output.transformationRunId");
    assertIsoInstant(candidate.completedAt ?? "", "output.completedAt");
    const payload = candidate.rawPayloads[0];
    if (
      !payload ||
      Object.hasOwn(payload, "objectKey") ||
      typeof payload.requestUri !== "string" ||
      typeof payload.objectUri !== "string" ||
      !payload.objectUri.startsWith("s3://") ||
      typeof payload.mediaType !== "string" ||
      payload.mediaType.length === 0 ||
      !Number.isSafeInteger(payload.byteLength) ||
      payload.byteLength < 0 ||
      (payload.providerRequestId !== null && typeof payload.providerRequestId !== "string")
    ) {
      throw new TypeError("output raw payload is invalid");
    }
    new URL(payload.requestUri);
    assertUuid(payload.payloadId, "output.payloadId");
    assertSha256(payload.checksumSha256, "output.checksumSha256");
    assertIsoInstant(payload.fetchedAt, "output.fetchedAt");
    const observationIds = candidate.observationIds;
    for (const observationId of observationIds) {
      if (typeof observationId !== "string") throw new TypeError("observation ID is invalid");
      assertUuid(observationId, "output.observationId");
    }
    if (new Set(observationIds).size !== observationIds.length) {
      throw new TypeError("output observation IDs are duplicated");
    }
    for (const quality of candidate.qualityResults) {
      if (
        !quality ||
        typeof quality !== "object" ||
        typeof quality.checkCode !== "string" ||
        !/^[a-z][a-z0-9_]{1,127}$/.test(quality.checkCode) ||
        (quality.status !== "pass" && quality.status !== "warn" && quality.status !== "fail") ||
        !Number.isFinite(quality.weight) ||
        quality.weight < 0 ||
        quality.weight > 1 ||
        !quality.details ||
        typeof quality.details !== "object" ||
        Array.isArray(quality.details)
      ) {
        throw new TypeError("output quality result is invalid");
      }
      digestJson(quality.details);
    }
    if (status === "quarantined") {
      if (
        candidate.releaseId !== null ||
        observationIds.length !== 0 ||
        candidate.observationSetSha256 !== null ||
        candidate.reconciliation !== null
      ) {
        throw new TypeError("quarantine output contains promoted content");
      }
    } else {
      if (
        typeof candidate.releaseId !== "string" ||
        typeof candidate.observationSetSha256 !== "string" ||
        !candidate.reconciliation ||
        typeof candidate.reconciliation !== "object"
      ) {
        throw new TypeError("successful output is missing promoted content");
      }
      assertUuid(candidate.releaseId, "output.releaseId");
      assertSha256(candidate.observationSetSha256, "output.observationSetSha256");
      if (digestJson([...observationIds].sort()) !== candidate.observationSetSha256) {
        throw new TypeError("output observation set digest is invalid");
      }
      const reconciliation = candidate.reconciliation;
      if (
        !Number.isSafeInteger(reconciliation.expectedRows) ||
        reconciliation.expectedRows < 0 ||
        !Number.isSafeInteger(reconciliation.persistedRows) ||
        reconciliation.persistedRows < 0 ||
        !Array.isArray(reconciliation.missingPeriods) ||
        !Array.isArray(reconciliation.unexpectedPeriods) ||
        !Array.isArray(reconciliation.mismatchedPeriods) ||
        !reconciliation.missingPeriods.every((period) => typeof period === "string") ||
        !reconciliation.unexpectedPeriods.every((period) => typeof period === "string") ||
        !reconciliation.mismatchedPeriods.every((period) => typeof period === "string")
      ) {
        throw new TypeError("output reconciliation is invalid");
      }
      assertSha256(reconciliation.checkpointSha256, "output.checkpointSha256");
    }
    digestJson(candidate);
  } catch (error) {
    if (error instanceof IngestionConflictError) throw error;
    throw new IngestionConflictError("Stored ingestion output manifest is invalid");
  }
  return candidate as IngestionOutputManifest;
}

function assertSameJson(actual: unknown, expected: unknown, message: string): void {
  if (digestJson(actual) !== digestJson(expected)) throw new IngestionConflictError(message);
}

function inputManifest(input: IngestionWorkflowInput): Readonly<Record<string, unknown>> {
  const {
    inputSha256: _inputSha256,
    workflowId: _workflowId,
    authorization: _authorization,
    ...manifest
  } = input;
  return manifest;
}

async function setTenant(client: PoolClient, organizationId: string | null): Promise<void> {
  await client.query("SET LOCAL ROLE economyos_ingest");
  await client.query("SELECT set_config('app.organization_id', $1, true)", [organizationId ?? ""]);
}

async function insertCheckpoint(
  client: PoolClient,
  input: {
    readonly organizationId: string | null;
    readonly runId: string;
    readonly stage:
      | Exclude<IngestionStage, "start" | "complete" | "quarantine" | "persist_raw">
      | "persist";
    readonly key: string;
    readonly value: Readonly<Record<string, unknown>>;
    readonly payloadChecksumSha256: string | null;
    readonly committedAt: string;
  },
): Promise<void> {
  const id = deterministicUuid(
    "economyos:ingestion-checkpoint:v1",
    input.organizationId ?? "global",
    input.runId,
    input.stage,
    input.key,
  );
  // Store both the complete checkpoint digest and the digest of its domain value.
  const value = { ...input.value, canonicalSha256: digestJson(input.value) };
  const valueSha256 = digestJson(value);
  await client.query(
    `WITH prepared AS (SELECT $6::jsonb AS value)
     INSERT INTO evidence.ingestion_checkpoints (
       id, organization_id, ingestion_run_id, stage, checkpoint_key, value,
       value_sha256, payload_checksum_sha256, committed_at
     )
     SELECT $1::uuid, $2::uuid, $3::uuid, $4, $5, prepared.value, $7, $8, $9::timestamptz
     FROM prepared
     ON CONFLICT (tenant_scope, ingestion_run_id, stage, checkpoint_key) DO NOTHING`,
    [
      id,
      input.organizationId,
      input.runId,
      input.stage,
      input.key,
      JSON.stringify(value),
      valueSha256,
      input.payloadChecksumSha256,
      input.committedAt,
    ],
  );
  const stored = await client.query<CheckpointRow>(
    `SELECT value, value_sha256, payload_checksum_sha256
     FROM evidence.ingestion_checkpoints
     WHERE id = $1::uuid`,
    [id],
  );
  const row = stored.rows[0];
  if (!row) throw new Error("Ingestion checkpoint was not persisted");
  assertSameJson(row.value, value, "Checkpoint replay changed its content");
  if (
    row.value_sha256 !== valueSha256 ||
    row.payload_checksum_sha256 !== input.payloadChecksumSha256
  ) {
    throw new IngestionConflictError("Checkpoint replay changed its payload checksum");
  }
}

export class PgIngestionRepository implements IngestionRepository {
  readonly #pool: Pool;
  readonly #authorization: IngestionAuthorizationGuard;

  constructor(pool: Pool, authorization: IngestionAuthorizationGuard) {
    this.#pool = pool;
    this.#authorization = authorization;
  }

  async #transaction<T>(
    workflow: IngestionWorkflowInput,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    this.#authorization.assertCurrent(workflow);
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      await setTenant(client, workflow.organizationId);
      await client.query("SET LOCAL statement_timeout = '45s'");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '60s'");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async #readinessTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE economyos_ingest");
      await client.query("SET LOCAL statement_timeout = '10s'");
      const result = await operation(client);
      await client.query("ROLLBACK");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async checkReady(): Promise<void> {
    const result = await this.#pool.query<RuntimeIdentityRow>(
      `SELECT
         session_user::text AS login_name,
         current_user::text AS effective_name,
         login_role.rolsuper AS login_superuser,
         effective_role.rolsuper AS effective_superuser,
         login_role.rolbypassrls AS login_bypass_rls,
         effective_role.rolbypassrls AS effective_bypass_rls,
         login_role.rolcreaterole AS login_create_role,
         effective_role.rolcreaterole AS effective_create_role,
         login_role.rolcreatedb AS login_create_db,
         effective_role.rolcreatedb AS effective_create_db,
         login_role.rolreplication AS login_replication,
         effective_role.rolreplication AS effective_replication,
         database.datdba = login_role.oid AS login_owns_database,
         database.datdba = effective_role.oid AS effective_owns_database,
         EXISTS (
           SELECT 1 FROM pg_catalog.pg_roles assumable_role
           WHERE pg_has_role(session_user, assumable_role.oid, 'MEMBER')
             AND (
               assumable_role.rolsuper OR assumable_role.rolbypassrls
               OR assumable_role.rolcreaterole OR assumable_role.rolcreatedb
               OR assumable_role.rolreplication
             )
         ) AS login_can_assume_privileged_role,
         pg_has_role(session_user, database.datdba, 'MEMBER')
           AS login_can_assume_database_owner,
         pg_has_role(session_user, 'economyos_ingest', 'MEMBER') AS ingest_role_member
       FROM pg_catalog.pg_roles login_role
       JOIN pg_catalog.pg_roles effective_role ON effective_role.rolname = current_user
       JOIN pg_catalog.pg_database database ON database.datname = current_database()
       WHERE login_role.rolname = session_user`,
    );
    const identity = result.rows[0];
    if (!identity) throw new Error("Ingestion database runtime identity could not be inspected");
    if (
      identity.login_superuser ||
      identity.effective_superuser ||
      identity.login_bypass_rls ||
      identity.effective_bypass_rls ||
      identity.login_create_role ||
      identity.effective_create_role ||
      identity.login_create_db ||
      identity.effective_create_db ||
      identity.login_replication ||
      identity.effective_replication ||
      identity.login_owns_database ||
      identity.effective_owns_database ||
      identity.login_can_assume_privileged_role ||
      identity.login_can_assume_database_owner
    ) {
      throw new Error(
        "Unsafe ingestion database identity: owner and privileged roles are forbidden",
      );
    }
    if (!identity.ingest_role_member) {
      throw new Error("Ingestion database identity must be a member of economyos_ingest");
    }
    const bindingAvailable = await this.#readinessTransaction(async (client) => {
      const bindings = await client.query<QueryResultRow & { available: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM evidence.connector_bindings WHERE status = 'active'
         ) AS available`,
      );
      return bindings.rows[0]?.available === true;
    });
    if (!bindingAvailable) {
      throw new Error("Ingestion database has no active global connector binding");
    }
  }

  async beginRun(input: IngestionWorkflowInput): Promise<BeginRunResult> {
    return this.#transaction(input, async (client) => {
      const expectedConnectorConfiguration = {
        countryCode: input.connector.countryCode,
        indicatorCode: input.connector.indicatorCode,
        sourceId: 2,
      };
      const expectedConnectorConfigurationSha256 = digestJson(expectedConnectorConfiguration);
      const bindingResult = await client.query<ConnectorBindingRow>(
        `SELECT dataset_id, series_id, connector_code, configuration,
           configuration_sha256, status
         FROM evidence.connector_bindings
         WHERE tenant_scope = coalesce($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND dataset_id = $2::uuid AND series_id = $3::uuid
           AND connector_code = 'world-bank-v2' AND status = 'active'`,
        [input.organizationId, input.datasetId, input.seriesId],
      );
      const binding = bindingResult.rows[0];
      if (
        !binding ||
        binding.dataset_id !== input.datasetId ||
        binding.series_id !== input.seriesId ||
        binding.connector_code !== "world-bank-v2" ||
        binding.configuration_sha256 !== expectedConnectorConfigurationSha256 ||
        binding.status !== "active"
      ) {
        throw new IngestionConflictError(
          "Ingestion input does not match an active connector binding",
        );
      }
      assertSameJson(
        binding.configuration,
        expectedConnectorConfiguration,
        "Ingestion input changed the admitted connector configuration",
      );
      const manifest = inputManifest(input);
      await client.query(
        `INSERT INTO evidence.ingestion_runs (
           id, organization_id, dataset_id, workflow_id, idempotency_key,
           input_manifest, input_sha256, status, requested_at
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb, $7, 'pending', $8::timestamptz
         )
         ON CONFLICT (tenant_scope, dataset_id, idempotency_key) DO NOTHING`,
        [
          input.runId,
          input.organizationId,
          input.datasetId,
          input.workflowId,
          input.idempotencyKey,
          JSON.stringify(manifest),
          input.inputSha256,
          input.requestedAt,
        ],
      );
      const selected = await client.query<IngestionRunRow>(
        `SELECT status, workflow_id, dataset_id, idempotency_key, input_manifest,
           output_manifest, error_code
         FROM evidence.ingestion_runs
         WHERE tenant_scope = coalesce($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND dataset_id = $2::uuid AND idempotency_key = $3`,
        [input.organizationId, input.datasetId, input.idempotencyKey],
      );
      const row = selected.rows[0];
      if (!row) throw new Error("Ingestion run was not persisted");
      if (
        row.workflow_id !== input.workflowId ||
        row.dataset_id !== input.datasetId ||
        row.idempotency_key !== input.idempotencyKey
      ) {
        throw new IngestionConflictError("Idempotency key is bound to another ingestion run");
      }
      assertSameJson(row.input_manifest, manifest, "Idempotent replay changed the ingestion input");
      const terminal =
        row.status === "succeeded" || row.status === "failed" || row.status === "quarantined";
      if (terminal) {
        if (row.status === "failed") {
          if (row.output_manifest !== null) {
            throw new IngestionConflictError("Failed ingestion run contains an output manifest");
          }
          throw new IngestionConflictError(
            `The idempotent ingestion run previously failed with ${row.error_code ?? "UNKNOWN"}`,
          );
        }
        const output = asOutputManifest(row.output_manifest, input, row.status);
        if (!output) {
          throw new IngestionConflictError("Terminal ingestion run is missing its output manifest");
        }
        return { disposition: "return_existing", status: row.status, existingOutput: output };
      }
      return { disposition: "execute", status: row.status, existingOutput: null };
    });
  }

  async recordStage(input: RecordStageInput): Promise<void> {
    await this.#transition(input.workflow, input);
  }

  async findLanding(input: IngestionWorkflowInput): Promise<LandedRawPayload | null> {
    return this.#transaction(input, async (client) => {
      const selected = await client.query<RawPayloadRow>(
        `SELECT payload.id, payload.dataset_id, payload.request_uri, payload.object_uri,
           payload.media_type, payload.checksum_sha256, payload.byte_length::text,
           fetch.fetched_at, fetch.provider_request_id
         FROM evidence.fetch_events fetch
         JOIN evidence.raw_payloads payload
           ON payload.id = fetch.raw_payload_id AND payload.tenant_scope = fetch.tenant_scope
         WHERE fetch.ingestion_run_id = $1::uuid
         ORDER BY fetch.attempt, fetch.fetched_at, fetch.id
         LIMIT 1`,
        [input.runId],
      );
      const row = selected.rows[0];
      if (!row) return null;
      if (row.dataset_id !== input.datasetId || !row.object_uri.startsWith("s3://")) {
        throw new IngestionConflictError("Landed payload scope or object URI is invalid");
      }
      const objectKey = row.object_uri.slice(row.object_uri.indexOf("/", 5) + 1);
      if (!objectKey) throw new IngestionConflictError("Landed payload object key is invalid");
      const byteLength = Number(row.byte_length);
      if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
        throw new IngestionConflictError("Landed payload byte length is invalid");
      }
      return {
        payloadId: row.id,
        requestUri: row.request_uri,
        objectUri: row.object_uri,
        objectKey,
        mediaType: row.media_type,
        checksumSha256: row.checksum_sha256,
        byteLength,
        fetchedAt: databaseInstant(row.fetched_at),
        providerRequestId: row.provider_request_id,
      };
    });
  }

  async #transition(workflow: IngestionWorkflowInput, input: RecordStageInput): Promise<void> {
    await this.#transaction(workflow, async (client) => {
      const stage = dbStage(input.stage);
      await client.query(
        `SELECT evidence.transition_ingestion_run(
           $1::uuid, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::timestamptz
         )`,
        [
          input.workflow.runId,
          input.expectedStatus,
          input.nextStatus,
          stage,
          input.attempt,
          JSON.stringify(input.details),
          input.outputManifest ? JSON.stringify(input.outputManifest) : null,
          input.errorCode ?? null,
          input.occurredAt,
        ],
      );
    });
  }

  async persistLanding(input: PersistLandingInput): Promise<LandedRawPayload> {
    return this.#transaction(input.workflow, async (client) => {
      const payload = input.payload;
      await client.query(
        `INSERT INTO evidence.raw_payloads (
           id, organization_id, dataset_id, request_uri, object_uri, media_type,
           checksum_sha256, byte_length, fetched_at, provider_request_id,
           parser_name, parser_version
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9::timestamptz,
           $10, $11, $12
         ) ON CONFLICT (tenant_scope, dataset_id, checksum_sha256) DO NOTHING`,
        [
          payload.payloadId,
          input.workflow.organizationId,
          input.workflow.datasetId,
          payload.requestUri,
          payload.objectUri,
          payload.mediaType,
          payload.checksumSha256,
          payload.byteLength,
          payload.fetchedAt,
          payload.providerRequestId,
          input.workflow.parser.name,
          input.workflow.parser.version,
        ],
      );
      const selected = await client.query<RawPayloadRow>(
        `SELECT id, dataset_id, request_uri, object_uri, media_type, checksum_sha256,
           byte_length::text, fetched_at, provider_request_id
         FROM evidence.raw_payloads
         WHERE tenant_scope = coalesce($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND dataset_id = $2::uuid AND checksum_sha256 = $3`,
        [input.workflow.organizationId, input.workflow.datasetId, payload.checksumSha256],
      );
      const row = selected.rows[0];
      if (!row) throw new Error("Raw payload metadata was not persisted");
      if (
        row.id !== payload.payloadId ||
        row.dataset_id !== input.workflow.datasetId ||
        row.request_uri !== payload.requestUri ||
        row.object_uri !== payload.objectUri ||
        row.media_type !== payload.mediaType ||
        row.checksum_sha256 !== payload.checksumSha256 ||
        row.byte_length !== String(payload.byteLength)
      ) {
        throw new IngestionConflictError("Raw payload replay changed immutable metadata");
      }

      const fetchEventId = deterministicUuid(
        "economyos:fetch-event:v1",
        input.workflow.runId,
        payload.requestUri,
        String(input.attempt),
      );
      await client.query(
        `INSERT INTO evidence.fetch_events (
           id, organization_id, dataset_id, raw_payload_id, request_uri, fetched_at,
           provider_request_id, response_status, attempt, workflow_id, ingestion_run_id
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::timestamptz,
           $7, 200, $8, $9, $10::uuid
         ) ON CONFLICT (tenant_scope, workflow_id, request_uri, attempt) DO NOTHING`,
        [
          fetchEventId,
          input.workflow.organizationId,
          input.workflow.datasetId,
          row.id,
          row.request_uri,
          payload.fetchedAt,
          payload.providerRequestId,
          input.attempt,
          input.workflow.workflowId,
          input.workflow.runId,
        ],
      );
      const fetchEvent = await client.query<FetchEventRow>(
        `SELECT id, dataset_id, raw_payload_id, request_uri, fetched_at, provider_request_id, response_status,
           attempt, workflow_id, ingestion_run_id
         FROM evidence.fetch_events
         WHERE tenant_scope = coalesce($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND workflow_id = $2 AND request_uri = $3 AND attempt = $4`,
        [
          input.workflow.organizationId,
          input.workflow.workflowId,
          payload.requestUri,
          input.attempt,
        ],
      );
      const event = fetchEvent.rows[0];
      if (
        !event ||
        event.id !== fetchEventId ||
        event.dataset_id !== input.workflow.datasetId ||
        event.raw_payload_id !== row.id ||
        event.request_uri !== row.request_uri ||
        databaseInstant(event.fetched_at) !== new Date(payload.fetchedAt).toISOString() ||
        event.provider_request_id !== payload.providerRequestId ||
        event.response_status !== 200 ||
        event.attempt !== input.attempt ||
        event.workflow_id !== input.workflow.workflowId ||
        event.ingestion_run_id !== input.workflow.runId
      ) {
        throw new IngestionConflictError("Fetch event replay changed immutable content");
      }
      const persisted: LandedRawPayload = {
        ...payload,
        payloadId: row.id,
        fetchedAt: databaseInstant(event.fetched_at),
        providerRequestId: event.provider_request_id,
      };
      await insertCheckpoint(client, {
        organizationId: input.workflow.organizationId,
        runId: input.workflow.runId,
        stage: "fetch",
        key: payload.payloadId,
        value: {
          payloadId: persisted.payloadId,
          requestUri: persisted.requestUri,
          fetchedAt: persisted.fetchedAt,
          responseStatus: 200,
        },
        payloadChecksumSha256: persisted.checksumSha256,
        committedAt: persisted.fetchedAt,
      });
      await insertCheckpoint(client, {
        organizationId: input.workflow.organizationId,
        runId: input.workflow.runId,
        stage: "persist",
        key: payload.payloadId,
        value: {
          payloadId: persisted.payloadId,
          objectUri: persisted.objectUri,
          checksumSha256: persisted.checksumSha256,
          byteLength: persisted.byteLength,
        },
        payloadChecksumSha256: persisted.checksumSha256,
        committedAt: persisted.fetchedAt,
      });
      return persisted;
    });
  }

  async persistQuarantine(input: {
    readonly workflow: IngestionWorkflowInput;
    readonly landing: LandingResult;
    readonly decision: AdmissionDecision;
    readonly attempt: number;
    readonly completedAt: string;
  }): Promise<void> {
    await this.#persistTransformation({ ...input, status: "quarantined" });
  }

  async #persistTransformation(input: {
    readonly workflow: IngestionWorkflowInput;
    readonly landing: LandingResult;
    readonly decision: AdmissionDecision;
    readonly attempt: number;
    readonly completedAt: string;
    readonly status: "succeeded" | "quarantined";
  }): Promise<string> {
    const payload = input.landing.payloads[0];
    if (!payload) throw new IngestionConflictError("A transformation requires one raw payload");
    const effectiveConfiguration = transformationConfiguration(input.workflow);
    const effectiveConfigurationSha256 = digestJson(effectiveConfiguration);
    if (effectiveConfigurationSha256 !== input.decision.transformationConfigurationSha256) {
      throw new IngestionConflictError(
        "Transformation configuration digest changed after admission",
      );
    }
    const transformationAttempt = 1;
    return this.#transaction(input.workflow, async (client) => {
      await client.query(
        `INSERT INTO evidence.transformation_runs (
           id, organization_id, dataset_id, raw_payload_id, parser_name, parser_version,
           code_sha256, configuration, configuration_sha256, status, started_at,
           completed_at, error_code, workflow_id, attempt, ingestion_run_id
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8::jsonb, $9,
           $10, $11::timestamptz, $12::timestamptz, $13, $14, $15, $16::uuid
         ) ON CONFLICT (tenant_scope, raw_payload_id, parser_name, parser_version,
           code_sha256, configuration_sha256, attempt) DO NOTHING`,
        [
          input.decision.transformationRunId,
          input.workflow.organizationId,
          input.workflow.datasetId,
          payload.payloadId,
          input.workflow.parser.name,
          input.workflow.parser.version,
          input.workflow.parser.codeSha256,
          JSON.stringify(effectiveConfiguration),
          effectiveConfigurationSha256,
          input.status,
          input.workflow.requestedAt,
          input.completedAt,
          input.status === "quarantined" ? "QUALITY_GATE_FAILED" : null,
          input.workflow.workflowId,
          transformationAttempt,
          input.workflow.runId,
        ],
      );
      const transformation = await client.query<
        QueryResultRow & {
          id: string;
          dataset_id: string;
          raw_payload_id: string;
          parser_name: string;
          parser_version: string;
          code_sha256: string;
          configuration: unknown;
          configuration_sha256: string;
          status: string;
          completed_at: Date | string;
          attempt: number;
        }
      >(
        `SELECT id, dataset_id, raw_payload_id, parser_name, parser_version, code_sha256,
           configuration, configuration_sha256, status, completed_at, attempt
         FROM evidence.transformation_runs
         WHERE tenant_scope = coalesce($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND raw_payload_id = $2::uuid AND parser_name = $3 AND parser_version = $4
           AND code_sha256 = $5 AND configuration_sha256 = $6 AND attempt = $7`,
        [
          input.workflow.organizationId,
          payload.payloadId,
          input.workflow.parser.name,
          input.workflow.parser.version,
          input.workflow.parser.codeSha256,
          effectiveConfigurationSha256,
          transformationAttempt,
        ],
      );
      const row = transformation.rows[0];
      if (
        !row ||
        row.id !== input.decision.transformationRunId ||
        row.dataset_id !== input.workflow.datasetId ||
        row.raw_payload_id !== payload.payloadId ||
        row.parser_name !== input.workflow.parser.name ||
        row.parser_version !== input.workflow.parser.version ||
        row.code_sha256 !== input.workflow.parser.codeSha256 ||
        row.configuration_sha256 !== effectiveConfigurationSha256 ||
        row.status !== input.status ||
        row.attempt !== transformationAttempt
      ) {
        throw new IngestionConflictError("Transformation replay changed immutable identity");
      }
      assertSameJson(
        row.configuration,
        effectiveConfiguration,
        "Transformation replay changed its configuration",
      );
      const effectiveCompletedAt = databaseInstant(row.completed_at);
      for (const quality of input.decision.results) {
        const qualityId = deterministicUuid(
          "economyos:quality-result:v1",
          input.decision.transformationRunId,
          quality.checkCode,
        );
        const details = { ...quality.details, weight: quality.weight };
        await client.query(
          `INSERT INTO evidence.quality_results (
             id, organization_id, dataset_id, raw_payload_id, transformation_run_id,
             check_code, status, details, checked_at
           ) VALUES (
             $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8::jsonb,
             $9::timestamptz
           ) ON CONFLICT (tenant_scope, transformation_run_id, check_code) DO NOTHING`,
          [
            qualityId,
            input.workflow.organizationId,
            input.workflow.datasetId,
            payload.payloadId,
            input.decision.transformationRunId,
            quality.checkCode,
            quality.status,
            JSON.stringify(details),
            effectiveCompletedAt,
          ],
        );
        const storedQuality = await client.query<
          QueryResultRow & {
            id: string;
            dataset_id: string;
            raw_payload_id: string;
            transformation_run_id: string;
            status: string;
            details: unknown;
            checked_at: Date | string;
          }
        >(
          `SELECT id, dataset_id, raw_payload_id, transformation_run_id, status, details, checked_at
           FROM evidence.quality_results
           WHERE tenant_scope = coalesce($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
             AND transformation_run_id = $2::uuid AND check_code = $3`,
          [input.workflow.organizationId, input.decision.transformationRunId, quality.checkCode],
        );
        const stored = storedQuality.rows[0];
        if (
          !stored ||
          stored.id !== qualityId ||
          stored.dataset_id !== input.workflow.datasetId ||
          stored.raw_payload_id !== payload.payloadId ||
          stored.transformation_run_id !== input.decision.transformationRunId ||
          stored.status !== quality.status ||
          databaseInstant(stored.checked_at) !== effectiveCompletedAt
        ) {
          throw new IngestionConflictError("Quality replay changed immutable identity");
        }
        assertSameJson(stored.details, details, "Quality replay changed its result details");
      }
      await insertCheckpoint(client, {
        organizationId: input.workflow.organizationId,
        runId: input.workflow.runId,
        stage: "quality",
        key: input.decision.transformationRunId,
        value: {
          transformationRunId: input.decision.transformationRunId,
          disposition: input.decision.disposition,
          score: input.decision.score,
          candidateSha256: input.decision.candidateSha256,
        },
        payloadChecksumSha256: payload.checksumSha256,
        committedAt: effectiveCompletedAt,
      });
      return effectiveCompletedAt;
    });
  }

  async promote(input: {
    readonly workflow: IngestionWorkflowInput;
    readonly landing: LandingResult;
    readonly decision: AdmissionDecision;
    readonly attempt: number;
    readonly completedAt: string;
  }): Promise<PromotionResult> {
    if (input.decision.disposition !== "promote") {
      throw new IngestionConflictError("A quarantined batch cannot be promoted");
    }
    const transformationCompletedAt = await this.#persistTransformation({
      ...input,
      status: "succeeded",
    });
    const payload = input.landing.payloads[0];
    if (!payload) throw new IngestionConflictError("A promotion requires one raw payload");
    return this.#transaction(input.workflow, async (client) => {
      const first = input.landing.candidates[0];
      const pitQuality = first?.pitQuality ?? input.workflow.qualityPolicy.requiredPitQuality;
      const releaseTime = first?.releaseTime ?? null;
      const availabilityTime = first?.availabilityTime ?? null;
      await client.query(
        `INSERT INTO evidence.releases (
           id, organization_id, dataset_id, raw_payload_id, external_release_key,
           release_time, pit_quality, revision_sequence, source_publication_time,
           original_release_time, availability_time, revision_time, recorded_at
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::timestamptz, $7, 0,
           $6::timestamptz, $6::timestamptz, $8::timestamptz, $6::timestamptz,
           $9::timestamptz
         ) ON CONFLICT (tenant_scope, dataset_id, external_release_key) DO NOTHING`,
        [
          input.decision.releaseId,
          input.workflow.organizationId,
          input.workflow.datasetId,
          payload.payloadId,
          `ingestion:${input.decision.releaseId}`,
          releaseTime,
          pitQuality,
          availabilityTime,
          transformationCompletedAt,
        ],
      );
      const storedRelease = await client.query<ReleaseRow>(
        `SELECT id, dataset_id, raw_payload_id, release_time, pit_quality, revision_sequence,
           source_publication_time, original_release_time, availability_time, revision_time
         FROM evidence.releases
         WHERE tenant_scope = coalesce($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND dataset_id = $2::uuid AND external_release_key = $3`,
        [
          input.workflow.organizationId,
          input.workflow.datasetId,
          `ingestion:${input.decision.releaseId}`,
        ],
      );
      const release = storedRelease.rows[0];
      if (
        !release ||
        release.id !== input.decision.releaseId ||
        release.dataset_id !== input.workflow.datasetId ||
        release.raw_payload_id !== payload.payloadId ||
        release.pit_quality !== pitQuality ||
        release.revision_sequence !== 0 ||
        !sameOptionalInstant(release.release_time, releaseTime) ||
        !sameOptionalInstant(release.source_publication_time, releaseTime) ||
        !sameOptionalInstant(release.original_release_time, releaseTime) ||
        !sameOptionalInstant(release.availability_time, availabilityTime) ||
        !sameOptionalInstant(release.revision_time, releaseTime)
      ) {
        throw new IngestionConflictError("Release replay changed immutable content");
      }
      const observationIds: string[] = [];
      for (const candidate of input.landing.candidates) {
        const observationId = deterministicUuid(
          "economyos:observation:v1",
          input.workflow.organizationId ?? "global",
          input.workflow.seriesId,
          input.decision.releaseId,
          candidate.periodStart,
          candidate.periodEnd,
          input.decision.transformationRunId,
        );
        observationIds.push(observationId);
        await client.query(
          `INSERT INTO evidence.observations (
             id, organization_id, series_id, release_id, period_start, period_end,
             value_numeric, missing_reason, status, parser_version, recorded_at,
             transformation_run_id
           ) VALUES (
             $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::timestamptz,
             $6::timestamptz, $7::numeric, $8, 'final', $9, $10::timestamptz,
             $11::uuid
           ) ON CONFLICT (tenant_scope, series_id, release_id, period_start, period_end,
             transformation_run_id) DO NOTHING`,
          [
            observationId,
            input.workflow.organizationId,
            input.workflow.seriesId,
            input.decision.releaseId,
            candidate.periodStart,
            candidate.periodEnd,
            candidate.value,
            candidate.missingReason,
            input.workflow.parser.version,
            transformationCompletedAt,
            input.decision.transformationRunId,
          ],
        );
        const storedObservation = await client.query<ObservationRow>(
          `SELECT id, series_id, release_id, period_start, period_end, value_numeric::text,
             missing_reason, status, parser_version, transformation_run_id, recorded_at
           FROM evidence.observations
           WHERE tenant_scope = coalesce($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
             AND series_id = $2::uuid AND release_id = $3::uuid
             AND period_start = $4::timestamptz AND period_end = $5::timestamptz
             AND transformation_run_id = $6::uuid`,
          [
            input.workflow.organizationId,
            input.workflow.seriesId,
            input.decision.releaseId,
            candidate.periodStart,
            candidate.periodEnd,
            input.decision.transformationRunId,
          ],
        );
        const stored = storedObservation.rows[0];
        if (
          !stored ||
          stored.id !== observationId ||
          stored.series_id !== input.workflow.seriesId ||
          stored.release_id !== input.decision.releaseId ||
          databaseInstant(stored.period_start) !== new Date(candidate.periodStart).toISOString() ||
          databaseInstant(stored.period_end) !== new Date(candidate.periodEnd).toISOString() ||
          (stored.value_numeric === null) !== (candidate.value === null) ||
          (stored.value_numeric !== null &&
            candidate.value !== null &&
            normalizedDecimal(stored.value_numeric) !== normalizedDecimal(candidate.value)) ||
          stored.missing_reason !== candidate.missingReason ||
          stored.status !== "final" ||
          stored.parser_version !== input.workflow.parser.version ||
          stored.transformation_run_id !== input.decision.transformationRunId ||
          databaseInstant(stored.recorded_at) !== transformationCompletedAt
        ) {
          throw new IngestionConflictError("Observation replay changed immutable content");
        }
      }
      observationIds.sort();
      const observationSetSha256 = digestJson(observationIds);
      await insertCheckpoint(client, {
        organizationId: input.workflow.organizationId,
        runId: input.workflow.runId,
        stage: "promote",
        key: input.decision.transformationRunId,
        value: {
          releaseId: input.decision.releaseId,
          observationIds,
          observationSetSha256,
        },
        payloadChecksumSha256: payload.checksumSha256,
        committedAt: transformationCompletedAt,
      });
      return {
        transformationRunId: input.decision.transformationRunId,
        releaseId: input.decision.releaseId,
        observationIds: Object.freeze(observationIds),
        observationSetSha256,
      };
    });
  }

  async writeLineage(input: {
    readonly workflow: IngestionWorkflowInput;
    readonly landing: LandingResult;
    readonly promotion: PromotionResult;
    readonly committedAt: string;
  }): Promise<void> {
    await this.#transaction(input.workflow, async (client) => {
      const transformation = await client.query<
        QueryResultRow & { status: string; completed_at: Date | string }
      >(
        `SELECT status, completed_at FROM evidence.transformation_runs
         WHERE id = $1::uuid`,
        [input.promotion.transformationRunId],
      );
      const transformationRow = transformation.rows[0];
      if (transformationRow?.status !== "succeeded") {
        throw new IngestionConflictError("Lineage requires a successful transformation");
      }
      const lineageTime = databaseInstant(transformationRow.completed_at);
      const edges: Array<readonly [string, string, string, string, string]> = [];
      for (const payload of input.landing.payloads) {
        edges.push([
          "payload",
          payload.payloadId,
          "run",
          input.promotion.transformationRunId,
          "parsed_into",
        ]);
      }
      edges.push([
        "run",
        input.promotion.transformationRunId,
        "release",
        input.promotion.releaseId,
        "produced",
      ]);
      for (const observationId of input.promotion.observationIds) {
        edges.push([
          "release",
          input.promotion.releaseId,
          "observation",
          observationId,
          "produced",
        ]);
      }
      for (const [fromType, fromId, toType, toId, relation] of edges) {
        const id = deterministicUuid(
          "economyos:lineage-edge:v1",
          input.workflow.organizationId ?? "global",
          fromType,
          fromId,
          toType,
          toId,
          relation,
        );
        await client.query(
          `INSERT INTO evidence.lineage_edges (
           id, organization_id, from_type, from_id, to_type, to_id, relation,
             transformation_version, created_at
           ) VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6::uuid, $7, $8, $9::timestamptz)
           ON CONFLICT DO NOTHING`,
          [
            id,
            input.workflow.organizationId,
            fromType,
            fromId,
            toType,
            toId,
            relation,
            input.workflow.parser.version,
            lineageTime,
          ],
        );
        const storedEdge = await client.query<
          QueryResultRow & {
            id: string;
            transformation_version: string | null;
            created_at: Date | string;
          }
        >(
          `SELECT id, transformation_version, created_at
           FROM evidence.lineage_edges
           WHERE organization_id IS NOT DISTINCT FROM $1::uuid
             AND from_type = $2 AND from_id = $3::uuid
             AND to_type = $4 AND to_id = $5::uuid AND relation = $6`,
          [input.workflow.organizationId, fromType, fromId, toType, toId, relation],
        );
        const stored = storedEdge.rows[0];
        if (
          !stored ||
          stored.id !== id ||
          stored.transformation_version !== input.workflow.parser.version ||
          databaseInstant(stored.created_at) !== lineageTime
        ) {
          throw new IngestionConflictError("Lineage replay changed immutable content");
        }
      }
      await insertCheckpoint(client, {
        organizationId: input.workflow.organizationId,
        runId: input.workflow.runId,
        stage: "lineage",
        key: input.promotion.transformationRunId,
        value: {
          edgeCount: edges.length,
          transformationRunId: input.promotion.transformationRunId,
        },
        payloadChecksumSha256: input.landing.payloads[0]?.checksumSha256 ?? null,
        committedAt: lineageTime,
      });
    });
  }

  async reconcileAndCheckpoint(input: {
    readonly workflow: IngestionWorkflowInput;
    readonly landing: LandingResult;
    readonly promotion: PromotionResult;
    readonly committedAt: string;
  }): Promise<ReconciliationResult> {
    return this.#transaction(input.workflow, async (client) => {
      const transformation = await client.query<
        QueryResultRow & { status: string; completed_at: Date | string }
      >("SELECT status, completed_at FROM evidence.transformation_runs WHERE id = $1::uuid", [
        input.promotion.transformationRunId,
      ]);
      const transformationRow = transformation.rows[0];
      if (transformationRow?.status !== "succeeded") {
        throw new IngestionConflictError("Reconciliation requires a successful transformation");
      }
      const transformationCompletedAt = databaseInstant(transformationRow.completed_at);
      const actual = await client.query<ObservationRow>(
        `SELECT id, series_id, release_id, period_start, period_end, value_numeric::text,
           missing_reason, status, parser_version, transformation_run_id, recorded_at
         FROM evidence.observations
         WHERE transformation_run_id = $1::uuid
         ORDER BY period_start, period_end`,
        [input.promotion.transformationRunId],
      );
      const periodKey = (start: string | Date, end: string | Date) =>
        `${new Date(start).toISOString()}/${new Date(end).toISOString()}`;
      const expectedByPeriod = new Map(
        input.landing.candidates.map((candidate) => [
          periodKey(candidate.periodStart, candidate.periodEnd),
          candidate,
        ]),
      );
      const actualByPeriod = new Map(
        actual.rows.map((observation) => [
          periodKey(observation.period_start, observation.period_end),
          observation,
        ]),
      );
      const expectedPeriods = new Set(expectedByPeriod.keys());
      const actualPeriods = new Set(actualByPeriod.keys());
      const missingPeriods = [...expectedPeriods]
        .filter((period) => !actualPeriods.has(period))
        .sort();
      const unexpectedPeriods = [...actualPeriods]
        .filter((period) => !expectedPeriods.has(period))
        .sort();
      const mismatchedPeriods = [...expectedByPeriod.entries()]
        .filter(([period, candidate]) => {
          const observation = actualByPeriod.get(period);
          if (!observation) return false;
          const expectedId = deterministicUuid(
            "economyos:observation:v1",
            input.workflow.organizationId ?? "global",
            input.workflow.seriesId,
            input.promotion.releaseId,
            candidate.periodStart,
            candidate.periodEnd,
            input.promotion.transformationRunId,
          );
          return (
            observation.id !== expectedId ||
            observation.series_id !== input.workflow.seriesId ||
            observation.release_id !== input.promotion.releaseId ||
            observation.transformation_run_id !== input.promotion.transformationRunId ||
            observation.parser_version !== input.workflow.parser.version ||
            observation.status !== "final" ||
            databaseInstant(observation.recorded_at) !== transformationCompletedAt ||
            observation.missing_reason !== candidate.missingReason ||
            (observation.value_numeric === null) !== (candidate.value === null) ||
            (observation.value_numeric !== null &&
              candidate.value !== null &&
              normalizedDecimal(observation.value_numeric) !== normalizedDecimal(candidate.value))
          );
        })
        .map(([period]) => period)
        .sort();
      const checkpointBody = {
        expectedRows: input.landing.candidates.length,
        persistedRows: actual.rows.length,
        missingPeriods,
        unexpectedPeriods,
        mismatchedPeriods,
      };
      const checkpointSha256 = digestJson(checkpointBody);
      const reconciliation: ReconciliationResult = {
        ...checkpointBody,
        missingPeriods: Object.freeze(missingPeriods),
        unexpectedPeriods: Object.freeze(unexpectedPeriods),
        mismatchedPeriods: Object.freeze(mismatchedPeriods),
        checkpointSha256,
      };
      await insertCheckpoint(client, {
        organizationId: input.workflow.organizationId,
        runId: input.workflow.runId,
        stage: "reconcile",
        key: "canonical-periods",
        value: { ...reconciliation },
        payloadChecksumSha256: input.landing.payloads[0]?.checksumSha256 ?? null,
        committedAt: transformationCompletedAt,
      });
      return reconciliation;
    });
  }

  async failRun(input: {
    readonly workflow: IngestionWorkflowInput;
    readonly stage: IngestionStage;
    readonly attempt: number;
    readonly errorCode: string;
    readonly message: string;
    readonly occurredAt: string;
  }): Promise<void> {
    assertUuid(input.workflow.runId, "runId");
    assertSha256(input.workflow.inputSha256, "inputSha256");
    assertIsoInstant(input.occurredAt, "occurredAt");
    const current = await this.#transaction(input.workflow, async (client) => {
      const result = await client.query<QueryResultRow & { status: string }>(
        "SELECT status FROM evidence.ingestion_runs WHERE id = $1::uuid",
        [input.workflow.runId],
      );
      return result.rows[0]?.status;
    });
    if (current === "succeeded" || current === "failed" || current === "quarantined") return;
    if (current === undefined) return;
    if (current === "pending") {
      await this.#transition(input.workflow, {
        workflow: input.workflow,
        expectedStatus: "pending",
        nextStatus: "running",
        stage: "start",
        attempt: input.attempt,
        occurredAt: input.occurredAt,
        details: { recovery: "terminal_failure" },
      });
    }
    await this.#transition(input.workflow, {
      workflow: input.workflow,
      expectedStatus: "running",
      nextStatus: "failed",
      stage: input.stage,
      attempt: input.attempt,
      occurredAt: input.occurredAt,
      details: { errorCode: input.errorCode, message: input.message },
      errorCode: input.errorCode,
    });
  }
}
