import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("./", import.meta.url));
const expected = readFileSync(new URL(".python-version", import.meta.url), "utf8").trim();
const candidates =
  process.platform === "win32"
    ? [
        ["py", ["-3"]],
        ["python", []],
      ]
    : [
        ["python3", []],
        ["python", []],
      ];
const selected = candidates.find(([command, prefix]) => {
  const result = spawnSync(command, [...prefix, "--version"], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim() === `Python ${expected}`;
});
if (!selected) throw new Error(`Install Python ${expected} for the scientific worker`);
const [command, prefix] = selected;
const args = process.argv.includes("--test")
  ? ["-m", "unittest", "discover", "-s", "tests", "-v"]
  : ["build.py"];
const result = spawnSync(command, [...prefix, ...args], { cwd, stdio: "inherit" });
process.exitCode = result.status ?? 1;
