import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

// This is deliberately an allowlist. An SPDX identifier that has not been
// reviewed is a policy failure, even when it appears as one branch of an OR.
export const allowedLicenseIdentifiers = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "LGPL-3.0-or-later",
  "MIT",
  "MIT-0",
  "MPL-2.0",
  "Python-2.0",
  "Unlicense",
  "WTFPL",
  "Zlib",
]);

export const allowedLicenseExceptions = new Set(["LLVM-exception"]);

const reviewedMetadataOverrides = new Map([
  // unionfs omits package.json#license, but its shipped LICENSE is the
  // unmodified Unlicense text. Keep the override version-scoped.
  ["unionfs@4.6.0", "Unlicense"],
]);

function tokenizeSpdx(expression) {
  const tokens = [];
  let offset = 0;
  while (offset < expression.length) {
    const remaining = expression.slice(offset);
    const whitespace = remaining.match(/^\s+/);
    if (whitespace) {
      offset += whitespace[0].length;
      continue;
    }
    const punctuation = remaining[0];
    if (punctuation === "(" || punctuation === ")") {
      tokens.push({ kind: punctuation, value: punctuation });
      offset += 1;
      continue;
    }
    const identifier = remaining.match(/^[A-Za-z0-9][A-Za-z0-9.-]*/);
    if (!identifier) {
      throw new Error(`invalid SPDX character at offset ${offset}`);
    }
    const value = identifier[0];
    const operator = value.toUpperCase();
    tokens.push(
      operator === "AND" || operator === "OR" || operator === "WITH"
        ? { kind: operator, value: operator }
        : { kind: "identifier", value },
    );
    offset += value.length;
  }
  return tokens;
}

function parseSpdx(expression) {
  const tokens = tokenizeSpdx(expression);
  let cursor = 0;

  const peek = () => tokens[cursor];
  const take = (kind) => {
    const token = peek();
    if (!token || token.kind !== kind) {
      throw new Error(`expected ${kind} at token ${cursor}`);
    }
    cursor += 1;
    return token;
  };

  const parsePrimary = () => {
    if (peek()?.kind === "(") {
      take("(");
      const node = parseOr();
      take(")");
      return node;
    }
    return { kind: "license", identifier: take("identifier").value };
  };

  const parseWith = () => {
    const license = parsePrimary();
    if (peek()?.kind !== "WITH") return license;
    if (license.kind !== "license") {
      throw new Error("WITH may only follow a single license identifier");
    }
    take("WITH");
    return {
      kind: "with",
      license,
      exception: take("identifier").value,
    };
  };

  const parseAnd = () => {
    let node = parseWith();
    while (peek()?.kind === "AND") {
      take("AND");
      node = { kind: "and", left: node, right: parseWith() };
    }
    return node;
  };

  function parseOr() {
    let node = parseAnd();
    while (peek()?.kind === "OR") {
      take("OR");
      node = { kind: "or", left: node, right: parseAnd() };
    }
    return node;
  }

  if (tokens.length === 0) throw new Error("empty SPDX expression");
  const root = parseOr();
  if (cursor !== tokens.length) {
    throw new Error(`unexpected ${tokens[cursor]?.value ?? "token"} at token ${cursor}`);
  }
  return root;
}

function collectPolicyViolations(node, violations) {
  if (node.kind === "license") {
    if (!allowedLicenseIdentifiers.has(node.identifier)) {
      violations.add(`unreviewed license identifier ${node.identifier}`);
    }
    return;
  }
  if (node.kind === "with") {
    collectPolicyViolations(node.license, violations);
    if (!allowedLicenseExceptions.has(node.exception)) {
      violations.add(`unreviewed license exception ${node.exception}`);
    }
    return;
  }
  collectPolicyViolations(node.left, violations);
  collectPolicyViolations(node.right, violations);
}

export function evaluateLicenseExpression(expression) {
  if (typeof expression !== "string" || expression.trim() === "") {
    return { allowed: false, reason: "missing license expression" };
  }
  let parsed;
  try {
    parsed = parseSpdx(expression.trim());
  } catch (error) {
    return {
      allowed: false,
      reason: `invalid SPDX expression: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const violations = new Set();
  collectPolicyViolations(parsed, violations);
  return violations.size === 0
    ? { allowed: true }
    : { allowed: false, reason: [...violations].join(", ") };
}

function licenseExpressionFromReferencedText(text) {
  if (text.length > 512_000 || text.includes("\0")) return undefined;
  const declarations = [...text.matchAll(/^\s*SPDX-License-Identifier:\s*(.+?)\s*$/gim)].map(
    (match) => match[1]?.trim(),
  );
  if (declarations.length !== 1 || !declarations[0]) return undefined;
  return declarations[0];
}

export function resolveLicenseDeclaration(declared, readReferencedLicense) {
  if (typeof declared !== "string") {
    return { expression: undefined, reason: "license metadata is not a string" };
  }
  const normalized = declared.trim();
  const seeLicense = normalized.match(/^SEE LICENSE IN\s+(.+)$/i);
  if (!seeLicense) return { expression: normalized };

  const target = seeLicense[1]?.trim();
  if (!target || target.includes("\0")) {
    return { expression: undefined, reason: "SEE LICENSE IN has an invalid target" };
  }
  let text;
  try {
    text = readReferencedLicense(target);
  } catch (error) {
    return {
      expression: undefined,
      reason: `unable to read referenced license: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const expression = licenseExpressionFromReferencedText(text);
  return expression
    ? { expression }
    : {
        expression: undefined,
        reason: "referenced license lacks one unambiguous SPDX-License-Identifier declaration",
      };
}

function readContainedLicenseFile(packagePath, target) {
  const packageRoot = realpathSync(packagePath);
  const candidate = resolve(packageRoot, target);
  const relation = relative(packageRoot, candidate);
  if (relation === "" || relation === ".." || relation.startsWith(`..${sep}`)) {
    throw new Error("referenced license target escapes the package directory");
  }
  const realCandidate = realpathSync(candidate);
  const realRelation = relative(packageRoot, realCandidate);
  if (realRelation === "" || realRelation === ".." || realRelation.startsWith(`..${sep}`)) {
    throw new Error("referenced license resolves outside the package directory");
  }
  return readFileSync(realCandidate, "utf8");
}

function declaredLicense(manifest) {
  const declared = manifest.license ?? manifest.licenses;
  if (typeof declared === "string") return declared;
  if (Array.isArray(declared)) {
    const expressions = declared.map((entry) => (typeof entry === "string" ? entry : entry?.type));
    return expressions.every((entry) => typeof entry === "string" && entry.trim() !== "")
      ? expressions.join(" OR ")
      : undefined;
  }
  if (declared && typeof declared === "object" && typeof declared.type === "string") {
    return declared.type;
  }
  return undefined;
}

function collectGraphNodes(roots, optionalEdges, targetConstraints, target) {
  const nodes = new Map();
  const collect = (dependencies, inheritedOptional, incompatibleBranch, parentIdentity) => {
    if (!dependencies || typeof dependencies !== "object") return;
    for (const [dependencyName, dependency] of Object.entries(dependencies)) {
      if (!dependency || typeof dependency !== "object") continue;
      const name =
        typeof dependency.name === "string" && dependency.name !== ""
          ? dependency.name
          : dependencyName;
      const version = typeof dependency.version === "string" ? dependency.version : undefined;
      const identity = version ? `${name}@${version}` : name;
      const optional =
        inheritedOptional ||
        dependency.optional === true ||
        optionalEdges.get(parentIdentity)?.has(name) === true;
      const constraints = targetConstraints.get(identity);
      const targetIncompatible =
        incompatibleBranch ||
        (optional && constraints !== undefined && !isTargetCompatible(constraints, target));
      const skippable = optional && targetIncompatible;
      if (typeof dependency.path === "string" && dependency.path.includes("/node_modules/.pnpm/")) {
        const current = nodes.get(dependency.path);
        nodes.set(dependency.path, {
          path: dependency.path,
          name,
          version,
          skippable: (current?.skippable ?? true) && skippable,
        });
      }
      collect(dependency.dependencies, optional, targetIncompatible, identity);
      collect(dependency.optionalDependencies, true, targetIncompatible, identity);
    }
  };
  for (const root of roots) {
    collect(root.dependencies, false, false, undefined);
    collect(root.optionalDependencies, true, false, undefined);
  }
  return [...nodes.values()];
}

function unquoteYamlScalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

function parseInlineYamlList(value) {
  const match = value.trim().match(/^\[(.*)]$/);
  if (!match) return undefined;
  const body = match[1]?.trim();
  if (!body) return [];
  return body.split(",").map(unquoteYamlScalar);
}

export function parsePnpmTargetConstraints(lockfile) {
  const constraints = new Map();
  let inPackages = false;
  let currentKey;
  for (const line of lockfile.split(/\r?\n/)) {
    if (line === "packages:") {
      inPackages = true;
      continue;
    }
    if (inPackages && /^\S/.test(line)) break;
    if (!inPackages) continue;
    const packageEntry = line.match(/^ {2}(\S.*):\s*$/);
    if (packageEntry) {
      currentKey = unquoteYamlScalar(packageEntry[1] ?? "").replace(/\(.+$/, "");
      constraints.set(currentKey, {});
      continue;
    }
    const targetEntry = line.match(/^ {4}(cpu|os|libc):\s*(.+)\s*$/);
    if (!currentKey || !targetEntry) continue;
    const values = parseInlineYamlList(targetEntry[2] ?? "");
    if (values) constraints.get(currentKey)[targetEntry[1]] = values;
  }
  return constraints;
}

export function parsePnpmOptionalEdges(lockfile) {
  const optionalEdges = new Map();
  let inSnapshots = false;
  let currentParent;
  let inOptionalDependencies = false;
  for (const line of lockfile.split(/\r?\n/)) {
    if (line === "snapshots:") {
      inSnapshots = true;
      continue;
    }
    if (inSnapshots && /^\S/.test(line)) break;
    if (!inSnapshots) continue;
    const snapshotEntry = line.match(/^ {2}(\S.*):\s*$/);
    if (snapshotEntry) {
      currentParent = unquoteYamlScalar(snapshotEntry[1] ?? "").replace(/\(.+$/, "");
      inOptionalDependencies = false;
      continue;
    }
    const section = line.match(/^ {4}([A-Za-z]\S*):\s*$/);
    if (section) {
      inOptionalDependencies = section[1] === "optionalDependencies";
      continue;
    }
    if (!currentParent || !inOptionalDependencies) continue;
    const dependencyEntry = line.match(/^ {6}(\S.*):\s*(.+)\s*$/);
    if (!dependencyEntry) continue;
    const dependencyName = unquoteYamlScalar(dependencyEntry[1] ?? "");
    const children = optionalEdges.get(currentParent) ?? new Set();
    children.add(dependencyName);
    optionalEdges.set(currentParent, children);
  }
  return optionalEdges;
}

function matchesTargetList(values, current) {
  if (!values || values.length === 0) return true;
  if (!current) return true;
  const denied = values.some((value) => value === `!${current}`);
  if (denied) return false;
  const positive = values.filter((value) => !value.startsWith("!"));
  return positive.length === 0 || positive.includes(current);
}

export function isTargetCompatible(constraints, target) {
  return (
    matchesTargetList(constraints.os, target.platform) &&
    matchesTargetList(constraints.cpu, target.arch) &&
    matchesTargetList(constraints.libc, target.libc)
  );
}

function currentTarget() {
  const report = process.report?.getReport();
  return {
    platform: process.platform,
    arch: process.arch,
    libc:
      process.platform === "linux"
        ? report?.header?.glibcVersionRuntime
          ? "glibc"
          : "musl"
        : undefined,
  };
}

export function verifyProductionLicenses({ roots, lockfile, target = currentTarget() }) {
  const targetConstraints = parsePnpmTargetConstraints(lockfile);
  const optionalEdges = parsePnpmOptionalEdges(lockfile);
  const nodes = collectGraphNodes(roots, optionalEdges, targetConstraints, target);
  const failures = [];
  const licenseCounts = new Map();
  let skippedIncompatibleOptionalPackages = 0;

  for (const node of nodes.sort((left, right) => left.path.localeCompare(right.path))) {
    const manifestPath = `${node.path}/package.json`;
    if (!existsSync(manifestPath)) {
      const identity = node.version ? `${node.name}@${node.version}` : node.name;
      if (node.skippable) {
        skippedIncompatibleOptionalPackages += 1;
        continue;
      }
      failures.push(
        `${identity}: missing package manifest without proof of an optional, target-incompatible edge`,
      );
      continue;
    }

    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (error) {
      failures.push(
        `${node.path}: unreadable package manifest: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    const identity = `${manifest.name ?? node.name}@${manifest.version ?? node.version ?? "unknown"}`;
    const metadata = declaredLicense(manifest) ?? reviewedMetadataOverrides.get(identity);
    if (!metadata) {
      failures.push(`${identity}: missing license metadata`);
      continue;
    }
    const resolved = resolveLicenseDeclaration(metadata, (targetName) =>
      readContainedLicenseFile(node.path, targetName),
    );
    if (!resolved.expression) {
      failures.push(`${identity}: ${resolved.reason}`);
      continue;
    }
    const policy = evaluateLicenseExpression(resolved.expression);
    if (!policy.allowed) {
      failures.push(`${identity}: ${resolved.expression}: ${policy.reason}`);
      continue;
    }
    licenseCounts.set(resolved.expression, (licenseCounts.get(resolved.expression) ?? 0) + 1);
  }

  return {
    failures,
    installedPackages: nodes.length - skippedIncompatibleOptionalPackages,
    skippedIncompatibleOptionalPackages,
    licenseCounts,
  };
}

function main() {
  const listed = spawnSync(
    "corepack",
    ["pnpm", "list", "--prod", "--json", "--depth", "Infinity"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  if (listed.status !== 0) {
    const diagnostic = listed.stderr.trim() || listed.stdout.trim() || "no diagnostic output";
    throw new Error(`Unable to enumerate production dependencies: ${diagnostic}`);
  }

  let roots;
  try {
    roots = JSON.parse(listed.stdout);
  } catch (error) {
    throw new Error(
      `Unable to parse production dependency graph: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(roots)) throw new Error("Production dependency graph is not an array");

  const lockfilePath = resolve(repositoryRoot, "pnpm-lock.yaml");
  if (!existsSync(lockfilePath))
    throw new Error("pnpm-lock.yaml is required for target validation");
  const result = verifyProductionLicenses({
    roots,
    lockfile: readFileSync(lockfilePath, "utf8"),
  });
  if (result.failures.length > 0) {
    throw new Error(`Production license policy failed:\n${result.failures.join("\n")}`);
  }
  process.stdout.write(
    `Production license policy passed for ${result.installedPackages} installed external packages across ${result.licenseCounts.size} reviewed SPDX expressions (${result.skippedIncompatibleOptionalPackages} optional target-incompatible packages skipped).\n`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) main();
