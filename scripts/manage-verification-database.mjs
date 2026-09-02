import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const disposableDatabasePattern = /^economyos_verify_[a-z0-9_]{1,44}$/;
const runIdPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

export function resolveDisposableDatabaseContract(environment) {
  const verifyDatabase = environment.ECONOMYOS_VERIFY_DATABASE;
  const benchmarkDatabase = environment.ECONOMYOS_BENCHMARK_DATABASE;
  const runId = environment.ECONOMYOS_VERIFY_RUN_ID;

  if (
    !verifyDatabase ||
    !disposableDatabasePattern.test(verifyDatabase) ||
    verifyDatabase === "economyos"
  ) {
    throw new Error(
      "ECONOMYOS_VERIFY_DATABASE must name an explicit disposable economyos_verify_* database",
    );
  }
  if (benchmarkDatabase !== verifyDatabase) {
    throw new Error("ECONOMYOS_BENCHMARK_DATABASE must exactly match ECONOMYOS_VERIFY_DATABASE");
  }
  if (!runId || !runIdPattern.test(runId)) {
    throw new Error("ECONOMYOS_VERIFY_RUN_ID must be a non-secret, 1-128 character run identifier");
  }

  return { databaseName: verifyDatabase, runId };
}

function psql(databaseName, input) {
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
    { cwd: repositoryRoot, encoding: "utf8", input },
  );
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout).trim();
    throw new Error(message || `psql exited with status ${result.status}`);
  }
  return result.stdout.trim();
}

function databaseExists(databaseName) {
  return psql("postgres", `SELECT 1 FROM pg_database WHERE datname = '${databaseName}';`) === "1";
}

function createDatabase({ databaseName, runId }) {
  if (databaseExists(databaseName)) {
    throw new Error(
      `Refusing to reuse ${databaseName}; verification databases must start absent and clean`,
    );
  }

  psql("postgres", `CREATE DATABASE "${databaseName}";`);
  try {
    psql(
      databaseName,
      `
        CREATE TABLE public.economyos_disposable_database (
          singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
          database_name text NOT NULL,
          run_id text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT clock_timestamp()
        );
        INSERT INTO public.economyos_disposable_database (database_name, run_id)
        VALUES ('${databaseName}', '${runId}');
        REVOKE ALL ON public.economyos_disposable_database FROM PUBLIC;
      `,
    );
  } catch (error) {
    psql("postgres", `DROP DATABASE "${databaseName}" WITH (FORCE);`);
    throw error;
  }

  process.stdout.write(`Created owned disposable verification database ${databaseName}.\n`);
}

function dropDatabase({ databaseName, runId }) {
  if (!databaseExists(databaseName)) {
    process.stdout.write(`Disposable verification database ${databaseName} is already absent.\n`);
    return;
  }

  const owner = psql(
    databaseName,
    `
      SELECT database_name || E'\\n' || run_id
      FROM public.economyos_disposable_database
      WHERE singleton;
    `,
  ).split("\n");
  if (owner.length !== 2 || owner[0] !== databaseName || owner[1] !== runId) {
    throw new Error(
      `Refusing to drop ${databaseName}; its ownership marker does not match this run`,
    );
  }

  psql("postgres", `DROP DATABASE "${databaseName}" WITH (FORCE);`);
  process.stdout.write(`Dropped owned disposable verification database ${databaseName}.\n`);
}

function main() {
  const action = process.argv[2];
  if (action !== "create" && action !== "drop") {
    throw new Error("Usage: manage-verification-database.mjs <create|drop>");
  }
  const contract = resolveDisposableDatabaseContract(process.env);
  if (action === "create") createDatabase(contract);
  else dropDatabase(contract);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
