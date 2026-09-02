import {
  assertIsoInstant,
  assertSha256,
  assertUuid,
  canonicalJson,
  deterministicUuid,
} from "@economyos/data-admission";
import type { Pool, PoolClient, QueryResultRow } from "pg";

import {
  ReleaseNotificationConflictError,
  type ReleaseNotificationRepository,
} from "./release-notification-activities.js";
import {
  type PrepareReleaseNotificationsResult,
  type ReleaseNotificationCandidate,
  type ReleaseNotificationDeliveryResult,
  type ReleaseNotificationOutputManifest,
  type ReleaseNotificationWorkflowInput,
  releaseNotificationOutputManifest,
} from "./release-notifications.js";

interface PreparationRow extends QueryResultRow {
  readonly disposition: unknown;
  readonly candidates: unknown;
  readonly existing_output: unknown;
}

interface DeliveryRow extends QueryResultRow {
  readonly delivery_id: unknown;
  readonly subscription_id: unknown;
  readonly subject_id: unknown;
  readonly channel: unknown;
  readonly status: unknown;
  readonly reason: unknown;
  readonly occurred_at_text: unknown;
}

interface CompletionRow extends QueryResultRow {
  readonly output: unknown;
}

interface ReadinessRow extends QueryResultRow {
  readonly ready: boolean;
}

const REQUIRED_FUNCTIONS = [
  "evidence.prepare_release_notifications(uuid,uuid,uuid,uuid,uuid,text,text,text)",
  "evidence.deliver_release_notification(uuid,text,uuid,uuid,uuid,text)",
  "evidence.complete_release_notifications(uuid,text,jsonb)",
  "evidence.fail_release_notifications(uuid,text,text,text,text)",
] as const;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}

function candidateFromJson(value: unknown, workflowId: string): ReleaseNotificationCandidate {
  const candidate = object(value);
  if (
    !candidate ||
    !exactKeys(candidate, ["deliveryId", "subscriptionId", "subjectId", "channel"]) ||
    candidate.channel !== "in_app"
  ) {
    throw new ReleaseNotificationConflictError("Stored notification candidate is invalid");
  }
  try {
    assertUuid(candidate.deliveryId as string, "deliveryId");
    assertUuid(candidate.subscriptionId as string, "subscriptionId");
    assertUuid(candidate.subjectId as string, "subjectId");
  } catch {
    throw new ReleaseNotificationConflictError("Stored notification candidate is invalid");
  }
  const deliveryId = candidate.deliveryId as string;
  const subscriptionId = candidate.subscriptionId as string;
  if (
    deliveryId !==
    deterministicUuid("economyos:release-notification-delivery:v1", workflowId, subscriptionId)
  ) {
    throw new ReleaseNotificationConflictError("Stored notification candidate identity is invalid");
  }
  return Object.freeze({
    deliveryId,
    subscriptionId,
    subjectId: candidate.subjectId as string,
    channel: "in_app" as const,
  });
}

function deliveryFromRow(
  value: DeliveryRow,
  workflowId: string,
): ReleaseNotificationDeliveryResult {
  const candidate = candidateFromJson(
    {
      deliveryId: value.delivery_id,
      subscriptionId: value.subscription_id,
      subjectId: value.subject_id,
      channel: value.channel,
    },
    workflowId,
  );
  if (
    (value.status !== "delivered" && value.status !== "suppressed") ||
    (value.reason !== "delivered" &&
      value.reason !== "subscription_inactive" &&
      value.reason !== "release_not_servable") ||
    typeof value.occurred_at_text !== "string" ||
    (value.status === "delivered" && value.reason !== "delivered") ||
    (value.status === "suppressed" && value.reason === "delivered")
  ) {
    throw new ReleaseNotificationConflictError("Stored notification delivery is invalid");
  }
  try {
    assertIsoInstant(value.occurred_at_text, "occurredAt");
  } catch {
    throw new ReleaseNotificationConflictError("Stored notification delivery time is invalid");
  }
  return Object.freeze({
    ...candidate,
    status: value.status,
    reason: value.reason,
    occurredAt: value.occurred_at_text,
  });
}

function outputFromJson(
  value: unknown,
  workflow: ReleaseNotificationWorkflowInput,
): ReleaseNotificationOutputManifest {
  const output = object(value);
  if (
    !output ||
    !exactKeys(output, [
      "schemaVersion",
      "workflowId",
      "inputSha256",
      "releaseId",
      "status",
      "candidateCount",
      "deliveredCount",
      "suppressedCount",
      "deliveries",
      "completedAt",
      "manifestSha256",
    ]) ||
    output.schemaVersion !== 1 ||
    output.workflowId !== workflow.workflowId ||
    output.inputSha256 !== workflow.inputSha256 ||
    output.releaseId !== workflow.releaseId ||
    output.status !== "succeeded" ||
    !Number.isSafeInteger(output.candidateCount) ||
    !Number.isSafeInteger(output.deliveredCount) ||
    !Number.isSafeInteger(output.suppressedCount) ||
    typeof output.completedAt !== "string" ||
    typeof output.manifestSha256 !== "string" ||
    !Array.isArray(output.deliveries)
  ) {
    throw new ReleaseNotificationConflictError("Stored notification output manifest is invalid");
  }
  try {
    assertIsoInstant(output.completedAt, "completedAt");
    assertSha256(output.manifestSha256, "manifestSha256");
    const deliveries = output.deliveries.map((delivery) => {
      const record = object(delivery);
      if (!record) {
        throw new ReleaseNotificationConflictError("Stored notification delivery is invalid");
      }
      return deliveryFromRow(
        {
          delivery_id: record.deliveryId,
          subscription_id: record.subscriptionId,
          subject_id: record.subjectId,
          channel: record.channel,
          status: record.status,
          reason: record.reason,
          occurred_at_text: record.occurredAt,
        },
        workflow.workflowId,
      );
    });
    const expected = releaseNotificationOutputManifest({
      workflow,
      deliveries,
      completedAt: output.completedAt,
    });
    if (canonicalJson(expected) !== canonicalJson(output)) {
      throw new ReleaseNotificationConflictError("Stored notification output manifest is invalid");
    }
    return expected;
  } catch (error) {
    if (error instanceof ReleaseNotificationConflictError) throw error;
    throw new ReleaseNotificationConflictError("Stored notification output manifest is invalid");
  }
}

export class PgReleaseNotificationRepository implements ReleaseNotificationRepository {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async #transaction<T>(
    organizationId: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    assertUuid(organizationId, "organizationId");
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE economyos_ingest");
      await client.query("SELECT set_config('app.organization_id', $1, true)", [organizationId]);
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

  async checkReady(): Promise<void> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE economyos_ingest");
      await client.query("SET LOCAL statement_timeout = '10s'");
      const result = await client.query<ReadinessRow>(
        `SELECT bool_and(
           to_regprocedure(signature) IS NOT NULL
           AND has_function_privilege(
             current_user, to_regprocedure(signature), 'EXECUTE'
           )
         ) AS ready
         FROM unnest($1::text[]) AS required(signature)`,
        [[...REQUIRED_FUNCTIONS]],
      );
      if (result.rows.length !== 1 || result.rows[0]?.ready !== true) {
        throw new Error("Release notification database functions are unavailable");
      }
      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async prepare(
    input: ReleaseNotificationWorkflowInput,
  ): Promise<PrepareReleaseNotificationsResult> {
    return this.#transaction(input.organizationId, async (client) => {
      const result = await client.query<PreparationRow>(
        `SELECT disposition, candidates, existing_output
         FROM evidence.prepare_release_notifications(
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8
         )`,
        [
          input.workflowId,
          input.organizationId,
          input.workspaceId,
          input.seriesId,
          input.releaseId,
          input.monitoringTime,
          input.releaseManifestSha256,
          input.inputSha256,
        ],
      );
      const row = result.rows[0];
      if (
        result.rows.length !== 1 ||
        !row ||
        (row.disposition !== "execute" && row.disposition !== "return_existing") ||
        !Array.isArray(row.candidates)
      ) {
        throw new ReleaseNotificationConflictError("Notification preparation result is invalid");
      }
      const candidates = Object.freeze(
        row.candidates.map((candidate) => candidateFromJson(candidate, input.workflowId)),
      );
      const existingOutput =
        row.existing_output === null ? null : outputFromJson(row.existing_output, input);
      return Object.freeze({
        disposition: row.disposition,
        candidates,
        existingOutput,
      });
    });
  }

  async deliver(input: {
    readonly workflow: ReleaseNotificationWorkflowInput;
    readonly candidate: ReleaseNotificationCandidate;
    readonly occurredAt: string;
  }): Promise<ReleaseNotificationDeliveryResult> {
    return this.#transaction(input.workflow.organizationId, async (client) => {
      const result = await client.query<DeliveryRow>(
        `SELECT delivery_id, subscription_id, subject_id, channel,
           status, reason, occurred_at_text
         FROM evidence.deliver_release_notification(
           $1::uuid, $2, $3::uuid, $4::uuid, $5::uuid, $6
         )`,
        [
          input.workflow.workflowId,
          input.workflow.inputSha256,
          input.candidate.deliveryId,
          input.candidate.subscriptionId,
          input.candidate.subjectId,
          input.occurredAt,
        ],
      );
      const row = result.rows[0];
      if (result.rows.length !== 1 || !row) {
        throw new ReleaseNotificationConflictError("Notification delivery result is invalid");
      }
      return deliveryFromRow(row, input.workflow.workflowId);
    });
  }

  async complete(input: {
    readonly workflow: ReleaseNotificationWorkflowInput;
    readonly output: ReleaseNotificationOutputManifest;
  }): Promise<ReleaseNotificationOutputManifest> {
    return this.#transaction(input.workflow.organizationId, async (client) => {
      const result = await client.query<CompletionRow>(
        `SELECT evidence.complete_release_notifications($1::uuid, $2, $3::jsonb) AS output`,
        [input.workflow.workflowId, input.workflow.inputSha256, JSON.stringify(input.output)],
      );
      const row = result.rows[0];
      if (result.rows.length !== 1 || !row) {
        throw new ReleaseNotificationConflictError("Notification completion result is invalid");
      }
      return outputFromJson(row.output, input.workflow);
    });
  }

  async fail(input: {
    readonly workflow: ReleaseNotificationWorkflowInput;
    readonly errorCode: string;
    readonly message: string;
    readonly occurredAt: string;
  }): Promise<void> {
    await this.#transaction(input.workflow.organizationId, async (client) => {
      await client.query(`SELECT evidence.fail_release_notifications($1::uuid, $2, $3, $4, $5)`, [
        input.workflow.workflowId,
        input.workflow.inputSha256,
        input.errorCode,
        input.message,
        input.occurredAt,
      ]);
    });
  }
}
