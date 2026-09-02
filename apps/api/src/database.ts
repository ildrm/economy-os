import type { Principal } from "@economyos/contracts";
import { structuredLog } from "@economyos/observability";
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";

export const DATABASE_POOL = Symbol("economyos.api.database-pool");

export interface QueryResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  readonly rows: readonly Row[];
  readonly rowCount: number | null;
}

export interface DatabaseConnection {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
  release(error?: Error): void;
}

export interface DatabasePool {
  connect(): Promise<DatabaseConnection>;
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
  end(): Promise<void>;
}

class PostgresConnectionAdapter implements DatabaseConnection {
  constructor(private readonly client: PoolClient) {}

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>> {
    const result = await this.client.query(text, values === undefined ? undefined : [...values]);
    return { rows: result.rows as readonly Row[], rowCount: result.rowCount };
  }

  release(error?: Error): void {
    this.client.release(error);
  }
}

class PostgresPoolAdapter implements DatabasePool {
  constructor(private readonly pool: Pool) {}

  async connect(): Promise<DatabaseConnection> {
    return new PostgresConnectionAdapter(await this.pool.connect());
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>> {
    const result = await this.pool.query(text, values === undefined ? undefined : [...values]);
    return { rows: result.rows as readonly Row[], rowCount: result.rowCount };
  }

  async end(): Promise<void> {
    await this.pool.end();
  }
}

export async function createPostgresPool(connectionString: string): Promise<DatabasePool> {
  const { Pool: NodePostgresPool } = await import("pg");
  const pool = new NodePostgresPool({
    connectionString,
    application_name: "economyos-api",
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    query_timeout: 12_000,
    statement_timeout: 10_000,
    idle_in_transaction_session_timeout: 10_000,
    allowExitOnIdle: false,
  });
  pool.on("error", (error) => {
    process.stderr.write(
      `${JSON.stringify(
        structuredLog({
          level: "error",
          service: "economyos-api",
          message: "database pool idle client failed",
          fields: { errorName: error.name },
        }),
      )}\n`,
    );
  });
  return new PostgresPoolAdapter(pool);
}

export type TenantTransaction = Pick<DatabaseConnection, "query">;

interface RuntimeIdentityRow extends Record<string, unknown> {
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
  readonly app_role_member: boolean;
}

export interface RuntimeIdentity {
  readonly loginName: string;
  readonly effectiveName: string;
}

const IDENTITY_QUERY = `
  SELECT
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
      SELECT 1
      FROM pg_catalog.pg_roles assumable_role
      WHERE pg_has_role(session_user, assumable_role.oid, 'MEMBER')
        AND (
          assumable_role.rolsuper
          OR assumable_role.rolbypassrls
          OR assumable_role.rolcreaterole
          OR assumable_role.rolcreatedb
          OR assumable_role.rolreplication
        )
    ) AS login_can_assume_privileged_role,
    pg_has_role(session_user, database.datdba, 'MEMBER') AS login_can_assume_database_owner,
    pg_has_role(session_user, 'economyos_app', 'MEMBER') AS app_role_member
  FROM pg_catalog.pg_roles login_role
  JOIN pg_catalog.pg_roles effective_role ON effective_role.rolname = current_user
  JOIN pg_catalog.pg_database database ON database.datname = current_database()
  WHERE login_role.rolname = session_user
`;

function unsafeIdentity(row: RuntimeIdentityRow): boolean {
  return (
    row.login_superuser ||
    row.effective_superuser ||
    row.login_bypass_rls ||
    row.effective_bypass_rls ||
    row.login_create_role ||
    row.effective_create_role ||
    row.login_create_db ||
    row.effective_create_db ||
    row.login_replication ||
    row.effective_replication ||
    row.login_owns_database ||
    row.effective_owns_database ||
    row.login_can_assume_privileged_role ||
    row.login_can_assume_database_owner
  );
}

@Injectable()
export class PostgresRuntime implements OnModuleInit, OnModuleDestroy {
  private initialized = false;
  private closing = false;
  private poolEnded = false;
  private runtimeIdentity?: RuntimeIdentity;

  constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  async onModuleInit(): Promise<void> {
    try {
      const result = await this.pool.query<RuntimeIdentityRow>(IDENTITY_QUERY);
      const identity = result.rows[0];
      if (!identity) throw new Error("Database runtime identity could not be inspected");
      if (unsafeIdentity(identity)) {
        throw new Error(
          "Unsafe database runtime identity: owner and privileged roles cannot serve requests",
        );
      }
      if (!identity.app_role_member) {
        throw new Error("Database runtime identity must be a member of economyos_app");
      }
      this.runtimeIdentity = Object.freeze({
        loginName: identity.login_name,
        effectiveName: identity.effective_name,
      });
      this.initialized = true;
    } catch (error) {
      await this.endPool().catch(() => undefined);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    this.initialized = false;
    await this.endPool();
  }

  identity(): RuntimeIdentity | undefined {
    return this.runtimeIdentity;
  }

  async isReady(): Promise<boolean> {
    if (!this.initialized || this.closing) return false;
    try {
      const result = await this.pool.query<{ readonly ready: number }>("SELECT 1 AS ready");
      return result.rows[0]?.ready === 1;
    } catch {
      return false;
    }
  }

  async withPrincipal<Result>(
    principal: Principal,
    operation: (transaction: TenantTransaction) => Promise<Result>,
  ): Promise<Result> {
    return this.withPrincipalTransaction(
      principal,
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      operation,
    );
  }

  async withPrincipalMutation<Result>(
    principal: Principal,
    operation: (transaction: TenantTransaction) => Promise<Result>,
  ): Promise<Result> {
    return this.withPrincipalTransaction(
      principal,
      "BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE, READ WRITE",
      operation,
    );
  }

  private async withPrincipalTransaction<Result>(
    principal: Principal,
    beginStatement: string,
    operation: (transaction: TenantTransaction) => Promise<Result>,
  ): Promise<Result> {
    if (!this.initialized || this.closing) throw new Error("Database runtime is not ready");
    const connection = await this.pool.connect();
    let transactionStarted = false;
    let releaseError: Error | undefined;
    try {
      await connection.query(beginStatement);
      transactionStarted = true;
      await connection.query("SET LOCAL ROLE economyos_app");
      await connection.query(
        `SELECT
          set_config('app.organization_id', $1::text, true),
          set_config('app.subject_id', $2::text, true)`,
        [principal.organizationId, principal.subjectId],
      );
      const result = await operation(connection);
      await connection.query("COMMIT");
      transactionStarted = false;
      return result;
    } catch (error) {
      if (transactionStarted) {
        try {
          await connection.query("ROLLBACK");
        } catch (rollbackError) {
          releaseError = new Error("Database transaction cleanup failed", { cause: rollbackError });
        }
      }
      throw error;
    } finally {
      connection.release(releaseError);
    }
  }

  private async endPool(): Promise<void> {
    if (this.poolEnded) return;
    this.poolEnded = true;
    await this.pool.end();
  }
}
