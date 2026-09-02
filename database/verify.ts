import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

const databaseName = process.env.ECONOMYOS_VERIFY_DATABASE;
if (
  !databaseName ||
  !/^economyos_verify_[a-z0-9_]{1,44}$/.test(databaseName) ||
  databaseName === "economyos"
) {
  throw new Error(
    "ECONOMYOS_VERIFY_DATABASE must name an explicit disposable economyos_verify_* database",
  );
}

function psql(input: string): string {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "--username=economyos",
      `--dbname=${databaseName}`,
      "--set=ON_ERROR_STOP=1",
      "--no-psqlrc",
      "--quiet",
      "--tuples-only",
      "--no-align",
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8", input },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

psql(`
  CREATE TABLE IF NOT EXISTS public.schema_migrations (
    id text PRIMARY KEY,
    checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
    applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
`);
const migrationDirectory = new URL("./migrations/", import.meta.url);
const migrationFiles = readdirSync(migrationDirectory)
  .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
  .sort();
for (const file of migrationFiles) {
  const migrationId = file.slice(0, -4);
  const migration = readFileSync(new URL(file, migrationDirectory), "utf8");
  const checksum = createHash("sha256").update(migration).digest("hex");
  const storedChecksum = psql(
    `SELECT checksum_sha256 FROM public.schema_migrations WHERE id = '${migrationId}';`,
  );
  if (storedChecksum && storedChecksum !== checksum) {
    throw new Error(`Applied migration ${migrationId} has changed`);
  }
  if (!storedChecksum) {
    psql(
      `BEGIN;\n${migration}\nINSERT INTO public.schema_migrations (id, checksum_sha256) VALUES ('${migrationId}', '${checksum}');\nCOMMIT;`,
    );
  }
}
psql(`
  DO $local_runtime_roles$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'economyos_app_local') THEN
      CREATE ROLE economyos_app_local LOGIN PASSWORD 'economyos-app-local-only'
        NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT;
    ELSE
      ALTER ROLE economyos_app_local LOGIN PASSWORD 'economyos-app-local-only'
        NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'economyos_ingest_local') THEN
      CREATE ROLE economyos_ingest_local LOGIN PASSWORD 'economyos-ingest-local-only'
        NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT;
    ELSE
      ALTER ROLE economyos_ingest_local LOGIN PASSWORD 'economyos-ingest-local-only'
        NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT;
    END IF;
  END
  $local_runtime_roles$;
  GRANT economyos_app TO economyos_app_local;
  GRANT economyos_ingest TO economyos_ingest_local;
  ALTER ROLE economyos_app_local SET statement_timeout = '5s';
  ALTER ROLE economyos_app_local SET idle_in_transaction_session_timeout = '5s';
  ALTER ROLE economyos_ingest_local SET statement_timeout = '60s';
  ALTER ROLE economyos_ingest_local SET idle_in_transaction_session_timeout = '10s';

  DO $verify_runtime_roles$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_roles
      WHERE rolname IN ('economyos_app_local', 'economyos_ingest_local')
        AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR NOT rolcanlogin)
    ) THEN
      RAISE EXCEPTION 'local runtime roles are over-privileged or cannot log in';
    END IF;
  END
  $verify_runtime_roles$;
`);
for (const verification of [
  "verify.sql",
  "verify-canonical-json.sql",
  "verify-pit.sql",
  "verify-ingestion.sql",
  "verify-terminal-admission.sql",
  "verify-governance.sql",
  "verify-economic-state.sql",
  "verify-model-lifecycle.sql",
  "verify-authorization.sql",
  "verify-release-monitoring.sql",
  "verify-release-notifications.sql",
  "verify-bound-catalog.sql",
  "verify-lineage-security.sql",
  "verify-temporal-relationship-graph.sql",
  "verify-crisis-forecast-persistence.sql",
  "verify-capital-allocation-persistence.sql",
  "verify-collaboration-ecosystem-persistence.sql",
  "verify-timescale.sql",
]) {
  psql(readFileSync(new URL(`./${verification}`, import.meta.url), "utf8"));
}
process.stdout.write(
  `${migrationFiles.length} database migrations; two-tenant RLS, append-only, PIT, ingestion, terminal admission, governance, economic-state, model lifecycle, authorization, release monitoring, durable notifications, bound catalog, lineage security, temporal relationship graph, crisis forecast persistence, capital-allocation persistence, collaboration ecosystem persistence, and Timescale verification passed.\n`,
);
