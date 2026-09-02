import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDisposableDatabaseContract } from "./manage-verification-database.mjs";
import { aggregateFileEvidence, cyclonedxFromPnpmList } from "./release-evidence.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

function read(relativePath) {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

function checkDockerCompose() {
  const result = spawnSync("docker", ["compose", "config", "--quiet"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `docker-compose.yml is invalid: ${(result.stderr || result.stdout).trim()}`,
  );
}

function checkDatabaseContract() {
  assert.deepEqual(
    resolveDisposableDatabaseContract({
      ECONOMYOS_VERIFY_DATABASE: "economyos_verify_ci",
      ECONOMYOS_BENCHMARK_DATABASE: "economyos_verify_ci",
      ECONOMYOS_VERIFY_RUN_ID: "github-123-1",
    }),
    { databaseName: "economyos_verify_ci", runId: "github-123-1" },
  );
  for (const environment of [
    {
      ECONOMYOS_VERIFY_DATABASE: "economyos",
      ECONOMYOS_BENCHMARK_DATABASE: "economyos",
      ECONOMYOS_VERIFY_RUN_ID: "test",
    },
    {
      ECONOMYOS_VERIFY_DATABASE: "economyos_verify_ci",
      ECONOMYOS_BENCHMARK_DATABASE: "economyos_verify_other",
      ECONOMYOS_VERIFY_RUN_ID: "test",
    },
    {
      ECONOMYOS_VERIFY_DATABASE: "economyos_verify_ci",
      ECONOMYOS_BENCHMARK_DATABASE: "economyos_verify_ci",
      ECONOMYOS_VERIFY_RUN_ID: "unsafe run id",
    },
  ]) {
    assert.throws(() => resolveDisposableDatabaseContract(environment));
  }
}

function checkEvidencePrimitives() {
  const first = { path: "b", bytes: 2, sha256: "b".repeat(64) };
  const second = { path: "a", bytes: 1, sha256: "a".repeat(64) };
  assert.deepEqual(
    aggregateFileEvidence([first, second]),
    aggregateFileEvidence([second, first]),
    "aggregate file evidence must be order independent",
  );

  const rootComponent = {
    "bom-ref": "economyos:product",
    type: "application",
    name: "economyos",
    version: "0.1.0",
  };
  const bom = cyclonedxFromPnpmList(
    [
      {
        name: "@economyos/api",
        version: "0.1.0",
        dependencies: {
          fastify: { name: "fastify", version: "5.12.1" },
        },
        unsavedDependencies: {
          vitest: { name: "vitest", version: "4.1.11" },
        },
      },
    ],
    {
      generatedAt: "2026-09-02T00:00:00.000Z",
      lockfileSha256: "c".repeat(64),
      rootComponent,
      rootRef: rootComponent["bom-ref"],
      serialNumber: "urn:uuid:00000000-0000-5000-8000-000000000000",
    },
  );
  assert.equal(bom.bomFormat, "CycloneDX");
  assert.deepEqual(
    bom.components.map((component) => component.name).sort(),
    ["api", "fastify"],
    "production SBOM must omit pnpm unsaved/dev dependencies",
  );
  assert.ok(
    bom.dependencies.find((dependency) => dependency.ref === "economyos:product")?.dependsOn
      .length === 1,
  );
}

function checkRepositoryContracts() {
  const rootManifest = JSON.parse(read("package.json"));
  const workflow = read(".github/workflows/ci.yml");
  const nodeVersion = read(".node-version").trim();
  const gitignore = read(".gitignore");
  const compose = read("docker-compose.yml");

  assert.equal(rootManifest.engines.node, nodeVersion);
  assert.equal(rootManifest.packageManager, `pnpm@${rootManifest.engines.pnpm}`);
  assert.equal(rootManifest.config?.releaseToolchain?.corepack, "0.34.6");
  assert.equal(
    rootManifest.scripts["db:prepare"],
    "node scripts/manage-verification-database.mjs create",
  );
  assert.equal(
    rootManifest.scripts["db:drop"],
    "node scripts/manage-verification-database.mjs drop",
  );
  assert.equal(
    rootManifest.scripts["release:evidence:generate"],
    "node scripts/release-evidence.mjs generate",
  );
  assert.equal(
    rootManifest.scripts["release:evidence:verify"],
    "node scripts/release-evidence.mjs verify",
  );

  assert.match(workflow, /node-version-file: \.node-version/);
  assert.match(workflow, /ECONOMYOS_VERIFY_DATABASE: economyos_verify_ci/);
  assert.match(workflow, /ECONOMYOS_BENCHMARK_DATABASE: economyos_verify_ci/);
  assert.match(workflow, /ECONOMYOS_VERIFY_RUN_ID: github-\$\{\{ github\.run_id }}/);
  const prepare = workflow.indexOf("corepack pnpm db:prepare");
  const verify = workflow.indexOf("corepack pnpm db:verify");
  const benchmark = workflow.indexOf("corepack pnpm benchmark:db");
  const cleanup = workflow.indexOf("corepack pnpm db:drop");
  assert.ok(
    prepare >= 0 && prepare < verify,
    "CI must create a clean disposable DB before verification",
  );
  assert.ok(verify < benchmark, "CI must migrate and verify before the DB benchmark");
  assert.ok(benchmark < cleanup, "CI must retain the verified DB through the benchmark");
  assert.match(
    workflow.slice(Math.max(0, cleanup - 160), cleanup + 160),
    /if: always\(\)/,
    "disposable DB cleanup must run even after a failed gate",
  );
  assert.ok(
    workflow.indexOf("corepack pnpm release:evidence:generate") >
      workflow.indexOf("corepack pnpm build"),
    "release evidence must be generated after the production build",
  );
  assert.ok(
    workflow.indexOf("corepack pnpm release:evidence:verify") >
      workflow.indexOf("corepack pnpm release:evidence:generate"),
    "release evidence must be verified after generation",
  );
  assert.match(gitignore, /^artifacts\/release-evidence\/$/m);

  const imageLines = compose
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("image:"));
  assert.ok(imageLines.length > 0, "integration services must declare images");
  for (const line of imageLines) assert.match(line, /@sha256:[0-9a-f]{64}$/);
}

checkDatabaseContract();
checkEvidencePrimitives();
checkRepositoryContracts();
checkDockerCompose();
process.stdout.write(
  "Release automation contracts passed: pinned toolchain/images, owned disposable DB lifecycle, CI ordering/cleanup, and production SBOM primitives.\n",
);
