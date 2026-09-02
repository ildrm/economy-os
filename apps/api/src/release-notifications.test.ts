import { organizationId, type Principal, subjectId, workspaceId } from "@economyos/contracts";
import { deterministicUuid } from "@economyos/data-admission";
import { describe, expect, it, vi } from "vitest";
import type { PostgresRuntime, QueryResult, TenantTransaction } from "./database.js";
import type { GovernedAuthorizationService } from "./governed-authorization.js";
import {
  parseReleaseNotificationQuery,
  parseReleaseSubscriptionCommand,
  parseReleaseSubscriptionQuery,
  ReleaseNotificationService,
} from "./release-notifications.js";
import type { WorkspaceAccessService } from "./workspaces.js";

const ORGANIZATION_ID = organizationId("118f47ac-19fc-7c92-ae91-0242ac120001");
const WORKSPACE_ID = workspaceId("218f47ac-19fc-7c92-ae91-0242ac120001");
const SUBJECT_ID = subjectId("318f47ac-19fc-7c92-ae91-0242ac120001");
const SERIES_ID = "418f47ac-19fc-7c92-ae91-0242ac120001";
const SUBSCRIPTION_ID = "518f47ac-19fc-7c92-ae91-0242ac120001";
const EVENT_ID = "618f47ac-19fc-7c92-ae91-0242ac120001";

const principal: Principal = {
  organizationId: ORGANIZATION_ID,
  workspaceIds: [WORKSPACE_ID],
  subjectId: SUBJECT_ID,
  scopes: ["observation.read"],
  authenticationMethod: "oidc",
  issuedAt: "2026-09-01T00:00:00Z",
  expiresAt: "2026-09-01T12:00:00Z",
};

describe("release notification request parsing", () => {
  it("accepts strict subscription queries and commands", () => {
    expect(parseReleaseSubscriptionQuery({ workspaceId: WORKSPACE_ID })).toEqual({
      workspaceId: WORKSPACE_ID,
    });
    expect(
      parseReleaseSubscriptionCommand({
        workspaceId: WORKSPACE_ID,
        active: true,
        reason: "Follow this official release.",
      }),
    ).toEqual({
      workspaceId: WORKSPACE_ID,
      active: true,
      reason: "Follow this official release.",
    });
  });

  it("requires a complete notification keyset and rejects unknown input", () => {
    expect(
      parseReleaseNotificationQuery({
        workspaceId: WORKSPACE_ID,
        limit: "20",
        beforeOccurredAt: "2026-09-01T10:00:00Z",
        beforeDeliveryId: "718f47ac-19fc-7c92-ae91-0242ac120001",
      }),
    ).toMatchObject({ limit: 20, beforeDeliveryId: expect.any(String) });
    expect(() =>
      parseReleaseNotificationQuery({
        workspaceId: WORKSPACE_ID,
        beforeOccurredAt: "2026-09-01T10:00:00Z",
      }),
    ).toThrow("Bad Request");
    expect(() =>
      parseReleaseSubscriptionCommand({
        workspaceId: WORKSPACE_ID,
        active: true,
        reason: " valid content with padding ",
      }),
    ).toThrow("Bad Request");
    expect(() =>
      parseReleaseSubscriptionQuery({ workspaceId: WORKSPACE_ID, surprise: "field" }),
    ).toThrow("Bad Request");
  });
});

describe("ReleaseNotificationService", () => {
  it("reads one current subject-scoped subscription after workspace and series authorization", async () => {
    const transaction = transactionWith(async (text) => {
      if (text.includes("app.get_current_release_subscription")) return [subscriptionRow()];
      return [];
    });
    const { service, membership, authorization } = serviceWith(transaction);

    await expect(
      service.subscription(principal, SERIES_ID, { workspaceId: WORKSPACE_ID }),
    ).resolves.toMatchObject({
      workspaceId: WORKSPACE_ID,
      seriesId: SERIES_ID,
      subscription: {
        subscriptionId: SUBSCRIPTION_ID,
        active: true,
        eventSha256: "a".repeat(64),
      },
    });
    expect(membership).toHaveBeenCalledWith(principal, WORKSPACE_ID, transaction);
    expect(authorization).toHaveBeenCalledWith(principal, SERIES_ID, transaction);
  });

  it("creates a deterministic idempotent identity and then resolves persisted state", async () => {
    let subscriptionReads = 0;
    const calls: Array<{ readonly text: string; readonly values?: readonly unknown[] }> = [];
    const transaction = transactionWith(async (text, values) => {
      calls.push({ text, ...(values ? { values } : {}) });
      if (text.includes("app.get_current_release_subscription")) {
        subscriptionReads += 1;
        return subscriptionReads === 1
          ? []
          : [
              subscriptionRow({
                subscription_id: deterministicUuid(
                  "economyos:release-subscription:v1",
                  ORGANIZATION_ID,
                  WORKSPACE_ID,
                  SUBJECT_ID,
                  SERIES_ID,
                  "in_app",
                ),
              }),
            ];
      }
      return [];
    });
    const { service } = serviceWith(transaction);

    const result = await service.setSubscription(principal, SERIES_ID, {
      workspaceId: WORKSPACE_ID,
      active: true,
      reason: "Enable release monitoring.",
    });

    const create = calls.find(({ text }) => text.includes("app.create_release_subscription"));
    expect(create?.values).toEqual([
      deterministicUuid(
        "economyos:release-subscription:v1",
        ORGANIZATION_ID,
        WORKSPACE_ID,
        SUBJECT_ID,
        SERIES_ID,
        "in_app",
      ),
      WORKSPACE_ID,
      SERIES_ID,
      "Enable release monitoring.",
    ]);
    expect(result.subscription?.active).toBe(true);
  });

  it("records a changed state and leaves an absent inactive subscription as an idempotent no-op", async () => {
    const toggleCalls: Array<readonly unknown[] | undefined> = [];
    let active = true;
    const transaction = transactionWith(async (text, values) => {
      if (text.includes("app.get_current_release_subscription")) {
        return [subscriptionRow({ active })];
      }
      if (text.includes("app.set_release_subscription_active")) {
        toggleCalls.push(values);
        active = false;
      }
      return [];
    });
    const { service } = serviceWith(transaction);
    await expect(
      service.setSubscription(principal, SERIES_ID, {
        workspaceId: WORKSPACE_ID,
        active: false,
        reason: "Pause release monitoring.",
      }),
    ).resolves.toMatchObject({ subscription: { active: false } });
    expect(toggleCalls).toEqual([[SUBSCRIPTION_ID, false, "Pause release monitoring."]]);

    let absentQueries = 0;
    const absent = transactionWith(async () => {
      absentQueries += 1;
      return [];
    });
    const absentService = serviceWith(absent).service;
    await expect(
      absentService.setSubscription(principal, SERIES_ID, {
        workspaceId: WORKSPACE_ID,
        active: false,
        reason: "Remain unsubscribed.",
      }),
    ).resolves.toMatchObject({ subscription: null });
    expect(absentQueries).toBe(2);
  });

  it("maps a bounded pointer-only notification page and emits a continuation keyset", async () => {
    const transaction = transactionWith(async (text) => {
      if (!text.includes("app.list_delivered_release_notifications")) return [];
      return [
        notificationRow("01", "2026-09-01T10:00:02.000000Z"),
        notificationRow("02", "2026-09-01T10:00:01.000000Z"),
      ];
    });
    const { service } = serviceWith(transaction);

    await expect(
      service.list(principal, {
        workspaceId: WORKSPACE_ID,
        limit: 2,
        beforeOccurredAt: null,
        beforeDeliveryId: null,
      }),
    ).resolves.toMatchObject({
      count: 2,
      notifications: [
        { target: { type: "economic_release", seriesId: SERIES_ID } },
        { target: { type: "economic_release", seriesId: SERIES_ID } },
      ],
      nextCursor: {
        beforeOccurredAt: "2026-09-01T10:00:01.000000Z",
        beforeDeliveryId: "718f47ac-19fc-7c92-ae91-0242ac120002",
      },
    });
  });

  it("fails closed when the database violates the digest contract", async () => {
    const transaction = transactionWith(async () => [subscriptionRow({ event_sha256: "bad" })]);
    const { service } = serviceWith(transaction);
    await expect(
      service.subscription(principal, SERIES_ID, { workspaceId: WORKSPACE_ID }),
    ).rejects.toThrow("event_sha256");
  });

  it("maps governed rejection and retry SQL states without exposing database messages", async () => {
    for (const [code, expected] of [
      ["23514", "Bad Request"],
      ["42501", "Forbidden"],
      ["40001", "Conflict"],
    ] as const) {
      const transaction = transactionWith(async () => {
        throw Object.assign(new Error("sensitive database detail"), { code });
      });
      const { service } = serviceWith(transaction);
      await expect(
        service.setSubscription(principal, SERIES_ID, {
          workspaceId: WORKSPACE_ID,
          active: true,
          reason: "Enable release monitoring.",
        }),
      ).rejects.toThrow(expected);
    }
  });
});

function serviceWith(transaction: TenantTransaction): {
  readonly service: ReleaseNotificationService;
  readonly membership: ReturnType<typeof vi.fn>;
  readonly authorization: ReturnType<typeof vi.fn>;
} {
  const database = {
    withPrincipal: async (
      _principal: Principal,
      operation: (inner: TenantTransaction) => Promise<unknown>,
    ) => operation(transaction),
    withPrincipalMutation: async (
      _principal: Principal,
      operation: (inner: TenantTransaction) => Promise<unknown>,
    ) => operation(transaction),
  };
  const membership = vi.fn(async () => WORKSPACE_ID);
  const authorization = vi.fn(async () => undefined);
  return {
    service: new ReleaseNotificationService(
      database as unknown as PostgresRuntime,
      { assertMembership: membership } as unknown as WorkspaceAccessService,
      {
        assertEvidenceSeriesAccess: authorization,
      } as unknown as GovernedAuthorizationService,
    ),
    membership,
    authorization,
  };
}

function transactionWith(
  responder: (
    text: string,
    values?: readonly unknown[],
  ) => Promise<readonly Record<string, unknown>[]>,
): TenantTransaction {
  return {
    async query<Row extends Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<QueryResult<Row>> {
      const rows = await responder(text, values);
      return { rows: rows as readonly Row[], rowCount: rows.length };
    },
  };
}

function subscriptionRow(
  override: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    subscription_id: SUBSCRIPTION_ID,
    workspace_id: WORKSPACE_ID,
    series_id: SERIES_ID,
    channel: "in_app",
    active: true,
    resolved_event_id: EVENT_ID,
    effective_at: "2026-09-01T10:00:00.000000Z",
    recorded_at: "2026-09-01T10:00:00.000001Z",
    event_sha256: "a".repeat(64),
    ...override,
  };
}

function notificationRow(suffix: string, occurredAt: string): Record<string, unknown> {
  return {
    delivery_id: `718f47ac-19fc-7c92-ae91-0242ac1200${suffix}`,
    workflow_id: `818f47ac-19fc-7c92-ae91-0242ac1200${suffix}`,
    subscription_id: SUBSCRIPTION_ID,
    series_id: SERIES_ID,
    release_id: `918f47ac-19fc-7c92-ae91-0242ac1200${suffix}`,
    occurred_at: occurredAt,
    delivery_sha256: "b".repeat(64),
  };
}
