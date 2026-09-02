import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const { Client } = pg;
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const migrationDirectory = resolve(repositoryRoot, "database/migrations");
const databaseNamePattern = /^[a-z][a-z0-9_]{0,62}$/;
const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
const runtimeRoleNames = new Set([
  "economyos_app",
  "economyos_app_local",
  "economyos_ingest",
  "economyos_ingest_local",
]);

function decoded(value, label) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`${label} contains invalid percent encoding`);
  }
}

function parsePostgresUrl(rawUrl, label) {
  if (typeof rawUrl !== "string" || rawUrl === "") throw new Error(`${label} is required`);
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${label} must be a valid PostgreSQL URL`);
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${label} must use postgresql:// or postgres://`);
  }
  const databaseName = decoded(url.pathname.slice(1), `${label} database name`);
  const username = decoded(url.username, `${label} username`);
  const password = decoded(url.password, `${label} password`);
  if (!databaseNamePattern.test(databaseName)) {
    throw new Error(`${label} must contain one explicit lowercase database name`);
  }
  if (!username) throw new Error(`${label} must contain an explicit username`);
  return { rawUrl, url, databaseName, username, password };
}

export function resolveMigrationContract(environment) {
  const connection = parsePostgresUrl(environment.MIGRATION_DATABASE_URL, "MIGRATION_DATABASE_URL");
  if (connection.databaseName.startsWith("economyos_verify_")) {
    throw new Error(
      "db:migrate refuses economyos_verify_* databases; use the isolated verification workflow",
    );
  }
  if (environment.ECONOMYOS_MIGRATION_CONFIRM_DATABASE !== connection.databaseName) {
    throw new Error(
      "ECONOMYOS_MIGRATION_CONFIRM_DATABASE must exactly match the URL database name",
    );
  }
  if (runtimeRoleNames.has(connection.username)) {
    throw new Error("A runtime database role cannot be used as the schema migrator");
  }
  if (!loopbackHosts.has(connection.url.hostname)) {
    if (environment.ECONOMYOS_MIGRATION_ALLOW_REMOTE !== "true") {
      throw new Error("Remote schema migration requires ECONOMYOS_MIGRATION_ALLOW_REMOTE=true");
    }
    if (connection.url.searchParams.get("sslmode") !== "verify-full") {
      throw new Error("Remote schema migration requires sslmode=verify-full");
    }
  }
  return connection;
}

function sameEndpoint(left, right) {
  const defaultPort = (url) => url.port || "5432";
  return (
    left.url.hostname === right.url.hostname &&
    defaultPort(left.url) === defaultPort(right.url) &&
    left.databaseName === right.databaseName
  );
}

export function resolveLocalBootstrapContract(environment) {
  if (environment.NODE_ENV === "production") {
    throw new Error("Local database bootstrap is disabled when NODE_ENV=production");
  }
  if (environment.ECONOMYOS_LOCAL_BOOTSTRAP_CONFIRM !== "local-only") {
    throw new Error("Local database bootstrap requires ECONOMYOS_LOCAL_BOOTSTRAP_CONFIRM=local-only");
  }
  const migration = resolveMigrationContract(environment);
  const application = parsePostgresUrl(environment.DATABASE_URL, "DATABASE_URL");
  const ingestion = parsePostgresUrl(environment.INGESTION_DATABASE_URL, "INGESTION_DATABASE_URL");
  if (
    migration.databaseName !== "economyos" ||
    !loopbackHosts.has(migration.url.hostname) ||
    environment.ECONOMYOS_MIGRATION_ALLOW_REMOTE === "true"
  ) {
    throw new Error("Local bootstrap is restricted to the loopback economyos database");
  }
  if (!sameEndpoint(migration, application) || !sameEndpoint(migration, ingestion)) {
    throw new Error("Local migration, application, and ingestion URLs must target one endpoint");
  }
  if (
    application.username !== "economyos_app_local" ||
    ingestion.username !== "economyos_ingest_local"
  ) {
    throw new Error("Local runtime URLs must use the fixed least-privilege local role names");
  }
  if (!application.password || !ingestion.password) {
    throw new Error("Local runtime URLs must contain non-empty development-only passwords");
  }
  return { migration, application, ingestion };
}

function migrationFiles() {
  return readdirSync(migrationDirectory)
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
    .sort();
}

async function connectedClient(connection) {
  const client = new Client({
    connectionString: connection.rawUrl,
    application_name: "economyos-schema-migrator",
  });
  await client.connect();
  const identity = await client.query(
    "SELECT current_database() AS database_name, current_user AS username, pg_is_in_recovery() AS replica, current_setting('transaction_read_only') AS transaction_read_only",
  );
  const row = identity.rows[0];
  if (
    row?.database_name !== connection.databaseName ||
    row?.username !== connection.username ||
    row?.replica !== false ||
    row?.transaction_read_only !== "off"
  ) {
    await client.end();
    throw new Error("Migration connection identity is read-only, a replica, or not the confirmed target");
  }
  return client;
}

async function applyMigrations(connection) {
  const client = await connectedClient(connection);
  let locked = false;
  let transactionOpen = false;
  let applied = 0;
  const files = migrationFiles();
  try {
    const lock = await client.query(
      "SELECT pg_try_advisory_lock(hashtextextended('economyos-schema-migrations', 0)) AS locked",
    );
    locked = lock.rows[0]?.locked === true;
    if (!locked) throw new Error("Another EconomyOS schema migration is already running");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        id text PRIMARY KEY,
        checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )
    `);
    for (const file of files) {
      const migrationId = file.slice(0, -4);
      const migration = readFileSync(resolve(migrationDirectory, file), "utf8");
      if (/^\\/m.test(migration)) {
        throw new Error(`${file} contains a psql meta-command and cannot be applied safely`);
      }
      const checksum = createHash("sha256").update(migration).digest("hex");
      const stored = await client.query(
        "SELECT checksum_sha256 FROM public.schema_migrations WHERE id = $1",
        [migrationId],
      );
      if (stored.rowCount === 1) {
        if (stored.rows[0]?.checksum_sha256 !== checksum) {
          throw new Error(`Applied migration ${migrationId} has changed`);
        }
        continue;
      }

      await client.query("BEGIN");
      transactionOpen = true;
      try {
        await client.query(migration);
        await client.query(
          "INSERT INTO public.schema_migrations (id, checksum_sha256) VALUES ($1, $2)",
          [migrationId, checksum],
        );
        await client.query("COMMIT");
        transactionOpen = false;
        applied += 1;
      } catch (error) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        throw error;
      }
    }
  } finally {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    if (locked) {
      await client
        .query("SELECT pg_advisory_unlock(hashtextextended('economyos-schema-migrations', 0))")
        .catch(() => undefined);
    }
    await client.end();
  }
  process.stdout.write(
    `${files.length} immutable migrations verified on ${connection.databaseName}; ${applied} applied.\n`,
  );
}

function sqlLiteral(value) {
  if (value.includes("\0")) throw new Error("Database passwords cannot contain NUL bytes");
  return `E'${value.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
}

async function ensureLocalRole(client, roleName, password, inheritedRole, statementTimeout) {
  const existing = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [roleName]);
  const passwordLiteral = sqlLiteral(password);
  if (existing.rowCount === 0) {
    await client.query(
      `CREATE ROLE "${roleName}" LOGIN PASSWORD ${passwordLiteral} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT`,
    );
  } else {
    await client.query(
      `ALTER ROLE "${roleName}" LOGIN PASSWORD ${passwordLiteral} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT`,
    );
  }
  await client.query(`GRANT "${inheritedRole}" TO "${roleName}"`);
  await client.query(`ALTER ROLE "${roleName}" SET statement_timeout = '${statementTimeout}'`);
  await client.query(
    `ALTER ROLE "${roleName}" SET idle_in_transaction_session_timeout = '10s'`,
  );
}

async function bootstrapLocalRoles(contract) {
  const client = await connectedClient(contract.migration);
  try {
    await ensureLocalRole(
      client,
      "economyos_app_local",
      contract.application.password,
      "economyos_app",
      "5s",
    );
    await ensureLocalRole(
      client,
      "economyos_ingest_local",
      contract.ingestion.password,
      "economyos_ingest",
      "60s",
    );
    const roles = await client.query(`
      SELECT count(*)::integer AS valid_roles
      FROM pg_roles
      WHERE rolname IN ('economyos_app_local', 'economyos_ingest_local')
        AND rolcanlogin
        AND NOT rolsuper
        AND NOT rolbypassrls
        AND NOT rolcreatedb
        AND NOT rolcreaterole
        AND NOT rolreplication
    `);
    if (roles.rows[0]?.valid_roles !== 2) {
      throw new Error("Local runtime roles were not created with the required least privilege");
    }
  } finally {
    await client.end();
  }
  process.stdout.write("Local application and ingestion runtime roles are ready.\n");
}

function redactedError(error) {
  let message = error instanceof Error ? error.message : String(error);
  for (const value of [
    process.env.MIGRATION_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.INGESTION_DATABASE_URL,
  ]) {
    if (value) message = message.replaceAll(value, "[redacted-database-url]");
  }
  return message;
}

async function main() {
  const action = process.argv[2];
  if (action === "migrate") {
    await applyMigrations(resolveMigrationContract(process.env));
    return;
  }
  if (action === "setup-local") {
    const contract = resolveLocalBootstrapContract(process.env);
    await applyMigrations(contract.migration);
    await bootstrapLocalRoles(contract);
    return;
  }
  throw new Error("Usage: database-admin.mjs <migrate|setup-local>");
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${redactedError(error)}\n`);
    process.exitCode = 1;
  });
}
