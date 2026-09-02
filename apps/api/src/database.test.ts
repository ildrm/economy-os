import { organizationId, type Principal, subjectId } from "@economyos/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  type DatabaseConnection,
  type DatabasePool,
  PostgresRuntime,
  type QueryResult,
} from "./database.js";

const principal: Principal = {
  subjectId: subjectId("018f47ac-19fc-7c92-ae91-0242ac120006"),
  organizationId: organizationId("018f47ac-19fc-7c92-ae91-0242ac120002"),
  workspaceIds: [],
  scopes: [],
  authenticationMethod: "oidc",
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-01T01:00:00.000Z",
};

function safeIdentity(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    login_name: "economyos_app_local",
    effective_name: "economyos_app_local",
    login_superuser: false,
    effective_superuser: false,
    login_bypass_rls: false,
    effective_bypass_rls: false,
    login_create_role: false,
    effective_create_role: false,
    login_create_db: false,
    effective_create_db: false,
    login_replication: false,
    effective_replication: false,
    login_owns_database: false,
    effective_owns_database: false,
    login_can_assume_privileged_role: false,
    login_can_assume_database_owner: false,
    app_role_member: true,
    ...overrides,
  };
}

class MockConnection implements DatabaseConnection {
  readonly queries: Array<{ readonly text: string; readonly values?: readonly unknown[] }> = [];
  readonly release = vi.fn();
  responder: (text: string) => QueryResult = () => ({ rows: [], rowCount: 0 });

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>> {
    this.queries.push({ text, ...(values === undefined ? {} : { values }) });
    return this.responder(text) as QueryResult<Row>;
  }
}

class MockPool implements DatabasePool {
  readonly connection = new MockConnection();
  readonly end = vi.fn(async () => undefined);
  identity = safeIdentity();
  ready = true;

  async connect(): Promise<DatabaseConnection> {
    return this.connection;
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
  ): Promise<QueryResult<Row>> {
    const rows = text.includes("pg_catalog.pg_roles")
      ? [this.identity]
      : this.ready
        ? [{ ready: 1 }]
        : [];
    return { rows: rows as unknown as readonly Row[], rowCount: rows.length };
  }
}

describe("PostgresRuntime", () => {
  it("accepts an unprivileged app-role member and exposes dependency readiness", async () => {
    const pool = new MockPool();
    const runtime = new PostgresRuntime(pool);
    await runtime.onModuleInit();

    expect(runtime.identity()).toEqual({
      loginName: "economyos_app_local",
      effectiveName: "economyos_app_local",
    });
    await expect(runtime.isReady()).resolves.toBe(true);
  });

  it.each([
    ["superuser login", { login_superuser: true }],
    ["BYPASSRLS effective role", { effective_bypass_rls: true }],
    ["database owner login", { login_owns_database: true }],
    ["role-creating login", { login_create_role: true }],
    ["replication login", { login_replication: true }],
    ["login able to assume a privileged role", { login_can_assume_privileged_role: true }],
    ["login able to assume the database owner", { login_can_assume_database_owner: true }],
  ])("rejects an unsafe %s before serving", async (_label, override) => {
    const pool = new MockPool();
    pool.identity = safeIdentity(override);
    const runtime = new PostgresRuntime(pool);

    await expect(runtime.onModuleInit()).rejects.toThrow("Unsafe database runtime identity");
    expect(pool.end).toHaveBeenCalledOnce();
  });

  it("requires membership in the restricted application role", async () => {
    const pool = new MockPool();
    pool.identity = safeIdentity({ app_role_member: false });
    const runtime = new PostgresRuntime(pool);

    await expect(runtime.onModuleInit()).rejects.toThrow("must be a member of economyos_app");
  });

  it("sets role and tenant context transaction-locally around each request", async () => {
    const pool = new MockPool();
    const runtime = new PostgresRuntime(pool);
    await runtime.onModuleInit();
    pool.connection.responder = (text) =>
      text === "SELECT governed"
        ? { rows: [{ permitted: true }], rowCount: 1 }
        : { rows: [], rowCount: 0 };

    await expect(
      runtime.withPrincipal(principal, async (transaction) => {
        const result = await transaction.query<{ permitted: boolean }>("SELECT governed");
        return result.rows[0]?.permitted;
      }),
    ).resolves.toBe(true);

    expect(pool.connection.queries.map(({ text }) => text.trim().split("\n")[0])).toEqual([
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      "SET LOCAL ROLE economyos_app",
      "SELECT",
      "SELECT governed",
      "COMMIT",
    ]);
    expect(pool.connection.queries[2]?.values).toEqual([
      principal.organizationId,
      principal.subjectId,
    ]);
    expect(pool.connection.release).toHaveBeenCalledOnce();
  });

  it("uses a serializable tenant transaction for governed mutations", async () => {
    const pool = new MockPool();
    const runtime = new PostgresRuntime(pool);
    await runtime.onModuleInit();

    await expect(
      runtime.withPrincipalMutation(principal, async (transaction) => {
        await transaction.query("SELECT app.create_release_subscription($1)", [
          "338f47ac-19fc-7c92-ae91-0242ac120001",
        ]);
        return "created";
      }),
    ).resolves.toBe("created");

    expect(pool.connection.queries.map(({ text }) => text.trim().split("\n")[0])).toEqual([
      "BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE, READ WRITE",
      "SET LOCAL ROLE economyos_app",
      "SELECT",
      "SELECT app.create_release_subscription($1)",
      "COMMIT",
    ]);
    expect(pool.connection.release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases the connection when request work fails", async () => {
    const pool = new MockPool();
    const runtime = new PostgresRuntime(pool);
    await runtime.onModuleInit();

    await expect(
      runtime.withPrincipal(principal, async () => {
        throw new Error("query failed");
      }),
    ).rejects.toThrow("query failed");

    expect(pool.connection.queries.at(-1)?.text).toBe("ROLLBACK");
    expect(pool.connection.release).toHaveBeenCalledOnce();
  });
});
