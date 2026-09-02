import { assertIsoInstant, type Principal } from "@economyos/contracts";
import { deterministicUuid } from "@economyos/data-admission";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { PostgresRuntime, type TenantTransaction } from "./database.js";
import { GovernedAuthorizationService } from "./governed-authorization.js";
import { WorkspaceAccessService } from "./workspaces.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const SUBSCRIPTION_QUERY_FIELDS = new Set(["workspaceId"]);
const SUBSCRIPTION_COMMAND_FIELDS = new Set(["workspaceId", "active", "reason"]);
const NOTIFICATION_QUERY_FIELDS = new Set([
  "workspaceId",
  "limit",
  "beforeOccurredAt",
  "beforeDeliveryId",
]);

export interface ReleaseSubscriptionQuery {
  readonly workspaceId: string;
}

export interface ReleaseSubscriptionCommand extends ReleaseSubscriptionQuery {
  readonly active: boolean;
  readonly reason: string;
}

export interface ReleaseSubscriptionState {
  readonly subscriptionId: string;
  readonly workspaceId: string;
  readonly seriesId: string;
  readonly channel: "in_app";
  readonly active: boolean;
  readonly resolvedEventId: string;
  readonly effectiveAt: string;
  readonly recordedAt: string;
  readonly eventSha256: string;
}

export interface ReleaseSubscriptionEnvelope {
  readonly workspaceId: string;
  readonly seriesId: string;
  readonly subscription: ReleaseSubscriptionState | null;
}

export interface ReleaseNotificationQuery {
  readonly workspaceId: string;
  readonly limit: number;
  readonly beforeOccurredAt: string | null;
  readonly beforeDeliveryId: string | null;
}

export interface ReleaseNotificationPointer {
  readonly deliveryId: string;
  readonly workflowId: string;
  readonly subscriptionId: string;
  readonly target: {
    readonly type: "economic_release";
    readonly seriesId: string;
    readonly releaseId: string;
  };
  readonly occurredAt: string;
  readonly deliverySha256: string;
}

export interface ReleaseNotificationPage {
  readonly workspaceId: string;
  readonly count: number;
  readonly notifications: readonly ReleaseNotificationPointer[];
  readonly nextCursor: {
    readonly beforeOccurredAt: string;
    readonly beforeDeliveryId: string;
  } | null;
}

interface SubscriptionRow extends Record<string, unknown> {
  readonly subscription_id: unknown;
  readonly workspace_id: unknown;
  readonly series_id: unknown;
  readonly channel: unknown;
  readonly active: unknown;
  readonly resolved_event_id: unknown;
  readonly effective_at: unknown;
  readonly recorded_at: unknown;
  readonly event_sha256: unknown;
}

interface NotificationRow extends Record<string, unknown> {
  readonly delivery_id: unknown;
  readonly workflow_id: unknown;
  readonly subscription_id: unknown;
  readonly series_id: unknown;
  readonly release_id: unknown;
  readonly occurred_at: unknown;
  readonly delivery_sha256: unknown;
}

export function parseReleaseSubscriptionQuery(
  raw: Readonly<Record<string, unknown>>,
): ReleaseSubscriptionQuery {
  assertOnlyFields(raw, SUBSCRIPTION_QUERY_FIELDS);
  return Object.freeze({ workspaceId: uuidField(raw.workspaceId, "workspaceId") });
}

export function parseReleaseSubscriptionCommand(raw: unknown): ReleaseSubscriptionCommand {
  if (!isRecord(raw)) return invalidRequest("body");
  assertOnlyFields(raw, SUBSCRIPTION_COMMAND_FIELDS);
  if (typeof raw.active !== "boolean") return invalidRequest("active");
  if (
    typeof raw.reason !== "string" ||
    raw.reason.length < 3 ||
    raw.reason.length > 1_000 ||
    raw.reason.trim() !== raw.reason
  ) {
    return invalidRequest("reason");
  }
  return Object.freeze({
    workspaceId: uuidField(raw.workspaceId, "workspaceId"),
    active: raw.active,
    reason: raw.reason,
  });
}

export function parseReleaseNotificationQuery(
  raw: Readonly<Record<string, unknown>>,
): ReleaseNotificationQuery {
  assertOnlyFields(raw, NOTIFICATION_QUERY_FIELDS);
  const beforeOccurredAt = optionalInstantField(raw.beforeOccurredAt, "beforeOccurredAt");
  const beforeDeliveryId = optionalUuidField(raw.beforeDeliveryId, "beforeDeliveryId");
  if ((beforeOccurredAt === null) !== (beforeDeliveryId === null)) {
    return invalidRequest("beforeOccurredAt");
  }
  return Object.freeze({
    workspaceId: uuidField(raw.workspaceId, "workspaceId"),
    limit: boundedIntegerField(raw.limit, "limit", 50, 1, 100),
    beforeOccurredAt,
    beforeDeliveryId,
  });
}

@Injectable()
export class ReleaseNotificationService {
  constructor(
    @Inject(PostgresRuntime) private readonly database: PostgresRuntime,
    @Inject(WorkspaceAccessService) private readonly workspaceAccess: WorkspaceAccessService,
    @Inject(GovernedAuthorizationService)
    private readonly authorization: GovernedAuthorizationService,
  ) {}

  async subscription(
    principal: Principal,
    requestedSeriesId: string,
    query: ReleaseSubscriptionQuery,
  ): Promise<ReleaseSubscriptionEnvelope> {
    const seriesId = uuidField(requestedSeriesId, "seriesId");
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.workspaceAccess.assertMembership(principal, query.workspaceId, transaction);
      await this.authorization.assertEvidenceSeriesAccess(principal, seriesId, transaction);
      return subscriptionEnvelope(
        query.workspaceId,
        seriesId,
        await loadSubscription(transaction, query.workspaceId, seriesId),
      );
    });
  }

  async setSubscription(
    principal: Principal,
    requestedSeriesId: string,
    command: ReleaseSubscriptionCommand,
  ): Promise<ReleaseSubscriptionEnvelope> {
    const seriesId = uuidField(requestedSeriesId, "seriesId");
    try {
      return await this.database.withPrincipalMutation(principal, async (transaction) => {
        await this.workspaceAccess.assertMembership(principal, command.workspaceId, transaction);
        await this.authorization.assertEvidenceSeriesAccess(principal, seriesId, transaction);
        const existing = await loadSubscription(transaction, command.workspaceId, seriesId);
        if (!existing && command.active) {
          const subscriptionId = deterministicUuid(
            "economyos:release-subscription:v1",
            principal.organizationId,
            command.workspaceId,
            principal.subjectId,
            seriesId,
            "in_app",
          );
          await transaction.query(CREATE_SUBSCRIPTION_SQL, [
            subscriptionId,
            command.workspaceId,
            seriesId,
            command.reason,
          ]);
        } else if (existing && existing.active !== command.active) {
          await transaction.query(SET_SUBSCRIPTION_ACTIVE_SQL, [
            existing.subscriptionId,
            command.active,
            command.reason,
          ]);
        }
        const current = await loadSubscription(transaction, command.workspaceId, seriesId);
        return subscriptionEnvelope(command.workspaceId, seriesId, current);
      });
    } catch (error) {
      throw publicMutationError(error);
    }
  }

  async list(
    principal: Principal,
    query: ReleaseNotificationQuery,
  ): Promise<ReleaseNotificationPage> {
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.workspaceAccess.assertMembership(principal, query.workspaceId, transaction);
      const result = await transaction.query<NotificationRow>(LIST_NOTIFICATIONS_SQL, [
        query.workspaceId,
        query.limit,
        query.beforeOccurredAt,
        query.beforeDeliveryId,
      ]);
      const notifications = Object.freeze(result.rows.map(mapNotification));
      const last = notifications.at(-1);
      const nextCursor =
        notifications.length === query.limit && last
          ? Object.freeze({
              beforeOccurredAt: last.occurredAt,
              beforeDeliveryId: last.deliveryId,
            })
          : null;
      return Object.freeze({
        workspaceId: query.workspaceId,
        count: notifications.length,
        notifications,
        nextCursor,
      });
    });
  }
}

const CURRENT_SUBSCRIPTION_SQL = `
  SELECT
    subscription_id::text,
    workspace_id::text,
    series_id::text,
    channel,
    active,
    resolved_event_id::text,
    to_char(effective_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS effective_at,
    to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS recorded_at,
    event_sha256
  FROM app.get_current_release_subscription($1::uuid, $2::uuid)
`;

const CREATE_SUBSCRIPTION_SQL = `
  SELECT app.create_release_subscription($1::uuid, $2::uuid, $3::uuid, $4::text)::text
    AS subscription_id
`;

const SET_SUBSCRIPTION_ACTIVE_SQL = `
  SELECT app.set_release_subscription_active($1::uuid, $2::boolean, $3::text)::text
    AS event_id
`;

const LIST_NOTIFICATIONS_SQL = `
  SELECT
    delivery_id::text,
    workflow_id::text,
    subscription_id::text,
    series_id::text,
    release_id::text,
    to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at,
    delivery_sha256
  FROM app.list_delivered_release_notifications(
    $1::uuid, $2::integer, $3::timestamptz, $4::uuid
  )
  ORDER BY occurred_at DESC, delivery_id DESC
`;

async function loadSubscription(
  transaction: TenantTransaction,
  workspaceId: string,
  seriesId: string,
): Promise<ReleaseSubscriptionState | null> {
  const result = await transaction.query<SubscriptionRow>(CURRENT_SUBSCRIPTION_SQL, [
    workspaceId,
    seriesId,
  ]);
  if (result.rows.length > 1) throw new Error("Subscription resolver returned multiple rows");
  return result.rows[0] ? mapSubscription(result.rows[0]) : null;
}

function subscriptionEnvelope(
  workspaceId: string,
  seriesId: string,
  subscription: ReleaseSubscriptionState | null,
): ReleaseSubscriptionEnvelope {
  return Object.freeze({ workspaceId, seriesId, subscription });
}

function mapSubscription(row: SubscriptionRow): ReleaseSubscriptionState {
  return Object.freeze({
    subscriptionId: databaseUuid(row.subscription_id, "subscription_id"),
    workspaceId: databaseUuid(row.workspace_id, "workspace_id"),
    seriesId: databaseUuid(row.series_id, "series_id"),
    channel: databaseLiteral(row.channel, "channel", "in_app"),
    active: databaseBoolean(row.active, "active"),
    resolvedEventId: databaseUuid(row.resolved_event_id, "resolved_event_id"),
    effectiveAt: databaseInstant(row.effective_at, "effective_at"),
    recordedAt: databaseInstant(row.recorded_at, "recorded_at"),
    eventSha256: databaseSha256(row.event_sha256, "event_sha256"),
  });
}

function mapNotification(row: NotificationRow): ReleaseNotificationPointer {
  return Object.freeze({
    deliveryId: databaseUuid(row.delivery_id, "delivery_id"),
    workflowId: databaseUuid(row.workflow_id, "workflow_id"),
    subscriptionId: databaseUuid(row.subscription_id, "subscription_id"),
    target: Object.freeze({
      type: "economic_release" as const,
      seriesId: databaseUuid(row.series_id, "series_id"),
      releaseId: databaseUuid(row.release_id, "release_id"),
    }),
    occurredAt: databaseInstant(row.occurred_at, "occurred_at"),
    deliverySha256: databaseSha256(row.delivery_sha256, "delivery_sha256"),
  });
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

function databaseInstant(value: unknown, field: string): string {
  if (typeof value !== "string") throw invalidDatabaseValue(field);
  try {
    return assertIsoInstant(value, field);
  } catch {
    throw invalidDatabaseValue(field);
  }
}

function databaseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw invalidDatabaseValue(field);
  return value;
}

function databaseLiteral<const Value extends string>(
  value: unknown,
  field: string,
  expected: Value,
): Value {
  if (value !== expected) throw invalidDatabaseValue(field);
  return expected;
}

function invalidDatabaseValue(field: string): Error {
  return new Error(`Release notification database contract is invalid at ${field}`);
}

function publicMutationError(error: unknown): unknown {
  if (error instanceof HttpException) return error;
  const code =
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : undefined;
  if (code === "42501") {
    return new ForbiddenException({ code: "RELEASE_SUBSCRIPTION_DENIED" });
  }
  if (code === "22023" || code === "23514") {
    return new BadRequestException({ code: "RELEASE_SUBSCRIPTION_REJECTED" });
  }
  if (code === "23505" || code === "40001" || code === "40P01") {
    return new ConflictException({ code: "RELEASE_SUBSCRIPTION_RETRY" });
  }
  return error;
}

function invalidRequest(field: string): never {
  throw new BadRequestException({
    code: "INVALID_RELEASE_NOTIFICATION_REQUEST",
    errors: [{ path: field, code: "INVALID" }],
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
