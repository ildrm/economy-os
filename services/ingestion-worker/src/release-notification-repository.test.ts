import { deterministicUuid } from "@economyos/data-admission";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { ReleaseNotificationConflictError } from "./release-notification-activities.js";
import { PgReleaseNotificationRepository } from "./release-notification-repository.js";
import {
  createReleaseNotificationWorkflowInput,
  releaseNotificationOutputManifest,
} from "./release-notifications.js";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SERIES_ID = "33333333-3333-4333-8333-333333333333";
const RELEASE_ID = "44444444-4444-4444-8444-444444444444";
const SUBSCRIPTION_ID = "55555555-5555-4555-8555-555555555555";
const SUBJECT_ID = "66666666-6666-4666-8666-666666666666";

function workflow() {
  return createReleaseNotificationWorkflowInput({
    organizationId: ORGANIZATION_ID,
    workspaceId: WORKSPACE_ID,
    seriesId: SERIES_ID,
    releaseId: RELEASE_ID,
    monitoringTime: "2026-09-01T00:00:00Z",
    releaseManifestSha256: "a".repeat(64),
  });
}

function deliveryId(workflowId: string): string {
  return deterministicUuid(
    "economyos:release-notification-delivery:v1",
    workflowId,
    SUBSCRIPTION_ID,
  );
}

function poolWith(
  operation: (text: string, values: readonly unknown[] | undefined) => Promise<readonly unknown[]>,
) {
  const client = {
    query: vi.fn(async (text: string, values?: readonly unknown[]) => {
      if (
        text === "BEGIN" ||
        text === "COMMIT" ||
        text === "ROLLBACK" ||
        text.startsWith("SET LOCAL") ||
        text.startsWith("SELECT set_config")
      ) {
        return { rows: [], rowCount: 0 };
      }
      const rows = await operation(text, values);
      return { rows, rowCount: rows.length };
    }),
    release: vi.fn(),
  };
  const pool = {
    connect: vi.fn(async () => client),
  } as unknown as Pool;
  return { pool, client };
}

describe("PostgreSQL release notification repository", () => {
  it("sets an exact tenant-local ingest role and maps the frozen candidate set", async () => {
    const input = workflow();
    const candidate = {
      deliveryId: deliveryId(input.workflowId),
      subscriptionId: SUBSCRIPTION_ID,
      subjectId: SUBJECT_ID,
      channel: "in_app",
    };
    const { pool, client } = poolWith(async (text, values) => {
      expect(text).toContain("evidence.prepare_release_notifications");
      expect(values).toEqual([
        input.workflowId,
        input.organizationId,
        input.workspaceId,
        input.seriesId,
        input.releaseId,
        input.monitoringTime,
        input.releaseManifestSha256,
        input.inputSha256,
      ]);
      return [{ disposition: "execute", candidates: [candidate], existing_output: null }];
    });

    await expect(new PgReleaseNotificationRepository(pool).prepare(input)).resolves.toEqual({
      disposition: "execute",
      candidates: [candidate],
      existingOutput: null,
    });
    expect(client.query).toHaveBeenCalledWith("SET LOCAL ROLE economyos_ingest");
    expect(client.query).toHaveBeenCalledWith(
      "SELECT set_config('app.organization_id', $1, true)",
      [ORGANIZATION_ID],
    );
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });

  it("rejects a database candidate whose deterministic delivery identity changed", async () => {
    const input = workflow();
    const { pool, client } = poolWith(async () => [
      {
        disposition: "execute",
        candidates: [
          {
            deliveryId: "77777777-7777-4777-8777-777777777777",
            subscriptionId: SUBSCRIPTION_ID,
            subjectId: SUBJECT_ID,
            channel: "in_app",
          },
        ],
        existing_output: null,
      },
    ]);

    await expect(new PgReleaseNotificationRepository(pool).prepare(input)).rejects.toBeInstanceOf(
      ReleaseNotificationConflictError,
    );
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.query).not.toHaveBeenCalledWith("COMMIT");
  });

  it("verifies a completed output against its exact canonical delivery evidence", async () => {
    const input = workflow();
    const delivery = {
      deliveryId: deliveryId(input.workflowId),
      subscriptionId: SUBSCRIPTION_ID,
      subjectId: SUBJECT_ID,
      channel: "in_app" as const,
      status: "delivered" as const,
      reason: "delivered" as const,
      occurredAt: "2026-09-01T00:00:01Z",
    };
    const output = releaseNotificationOutputManifest({
      workflow: input,
      deliveries: [delivery],
      completedAt: "2026-09-01T00:00:02Z",
    });
    const { pool } = poolWith(async (text, values) => {
      expect(text).toContain("evidence.complete_release_notifications");
      expect(values).toEqual([input.workflowId, input.inputSha256, JSON.stringify(output)]);
      return [{ output }];
    });

    await expect(
      new PgReleaseNotificationRepository(pool).complete({ workflow: input, output }),
    ).resolves.toEqual(output);
  });

  it("fails readiness when any narrow database function is unavailable", async () => {
    const { pool, client } = poolWith(async (text) => {
      expect(text).toContain("to_regprocedure");
      return [{ ready: false }];
    });
    await expect(new PgReleaseNotificationRepository(pool).checkReady()).rejects.toThrow(
      "functions are unavailable",
    );
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });
});
