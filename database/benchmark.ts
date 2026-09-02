import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const databaseName = process.env.ECONOMYOS_BENCHMARK_DATABASE;
if (
  !databaseName ||
  !/^economyos_verify_[a-z0-9_]{1,44}$/.test(databaseName) ||
  databaseName === "economyos"
) {
  throw new Error(
    "ECONOMYOS_BENCHMARK_DATABASE must name an explicit disposable economyos_verify_* database",
  );
}

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
    "--no-psqlrc",
  ],
  {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    input: readFileSync(new URL("./benchmark-pit.sql", import.meta.url), "utf8"),
  },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}
process.stdout.write(result.stderr);
process.stdout.write("Production SQL PIT benchmark gate passed.\n");
