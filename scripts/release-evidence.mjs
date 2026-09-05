import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const evidenceDirectory = resolve(repositoryRoot, "artifacts/release-evidence");
const manifestPath = resolve(evidenceDirectory, "release-manifest.json");
const sbomPath = resolve(evidenceDirectory, "sbom.cdx.json");
const provenancePath = resolve(evidenceDirectory, "provenance-unsigned.intoto.json");
const schemaVersion = 1;
const requiredExternalActions = [
  "archive the exact build artifact and evidence bundle",
  "generate a trusted signed provenance attestation for the candidate",
  "execute and independently approve all Phase 15 external evidence gates",
];

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function command(commandName, arguments_, options = {}) {
  const { trim = true, ...spawnOptions } = options;
  const result = spawnSync(commandName, arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...spawnOptions,
  });
  if (result.status !== 0) {
    const details = (result.stderr || result.stdout).trim();
    throw new Error(
      `${commandName} ${arguments_.join(" ")} failed${details ? `: ${details}` : ""}`,
    );
  }
  return trim ? result.stdout.trim() : result.stdout;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function repositoryPath(absolutePath) {
  const candidate = relative(repositoryRoot, absolutePath).split(sep).join("/");
  if (!candidate || candidate === ".." || candidate.startsWith("../")) {
    throw new Error(`Path escapes the repository: ${absolutePath}`);
  }
  return candidate;
}

function assertContainedPathWithoutSymlinks(absolutePath) {
  const relativePath = repositoryPath(absolutePath);
  let current = repositoryRoot;
  for (const segment of relativePath.split("/")) {
    current = resolve(current, segment);
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`Evidence path cannot traverse a symbolic link: ${relativePath}`);
    }
  }
  const realRepository = realpathSync(repositoryRoot);
  const realTarget = realpathSync(absolutePath);
  const realRelation = relative(realRepository, realTarget).split(sep).join("/");
  if (realRelation === ".." || realRelation.startsWith("../")) {
    throw new Error(`Evidence path resolves outside the repository: ${relativePath}`);
  }
}

function fileEvidence(relativePath) {
  if (
    !relativePath ||
    relativePath.startsWith("/") ||
    relativePath === ".." ||
    relativePath.startsWith("../")
  ) {
    throw new Error(`Invalid repository-relative evidence path: ${relativePath}`);
  }
  const absolutePath = resolve(repositoryRoot, relativePath);
  assertContainedPathWithoutSymlinks(absolutePath);
  const stats = statSync(absolutePath);
  if (!stats.isFile()) throw new Error(`Evidence target is not a file: ${relativePath}`);
  const bytes = readFileSync(absolutePath);
  return { path: relativePath, bytes: stats.size, sha256: sha256(bytes) };
}

export function aggregateFileEvidence(files) {
  const normalized = [...files].sort((left, right) => compareCodeUnits(left.path, right.path));
  const serialized = normalized
    .map((file) => `${file.path}\0${file.bytes}\0${file.sha256}\n`)
    .join("");
  return { files: normalized, sha256: sha256(serialized) };
}

function sourceEvidence() {
  const listed = command("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    trim: false,
  });
  const paths = listed.split("\0").filter(Boolean);
  if (paths.length === 0) throw new Error("No source files were enumerated for release evidence");
  return aggregateFileEvidence(paths.map(fileEvidence));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function workspaceManifests() {
  const manifests = [];
  for (const group of ["apps", "packages", "services"]) {
    const groupPath = resolve(repositoryRoot, group);
    if (!existsSync(groupPath)) continue;
    assertContainedPathWithoutSymlinks(groupPath);
    for (const entry of readdirSync(groupPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = resolve(groupPath, entry.name, "package.json");
      if (existsSync(path)) manifests.push({ path, manifest: readJson(path) });
    }
  }
  return manifests.sort((left, right) => compareCodeUnits(left.path, right.path));
}

function shouldIgnoreBuildPath(relativePath) {
  return (
    relativePath.includes("/.next/cache/") ||
    relativePath.endsWith("/.next/trace") ||
    relativePath.includes("/.next/diagnostics/")
  );
}

function walkBuildFiles(absoluteDirectory, collected) {
  assertContainedPathWithoutSymlinks(absoluteDirectory);
  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const absolutePath = resolve(absoluteDirectory, entry.name);
    const relativePath = repositoryPath(absolutePath);
    if (shouldIgnoreBuildPath(relativePath)) continue;
    assertContainedPathWithoutSymlinks(absolutePath);
    if (entry.isDirectory()) walkBuildFiles(absolutePath, collected);
    else if (entry.isFile()) collected.add(relativePath);
  }
}

function buildEvidence() {
  const collected = new Set();
  let buildableWorkspaces = 0;

  for (const { path, manifest } of workspaceManifests()) {
    if (typeof manifest.scripts?.build !== "string") continue;
    buildableWorkspaces += 1;
    const workspaceRoot = dirname(path);

    if (typeof manifest.main === "string" && manifest.main.trim() !== "") {
      const mainPath = resolve(workspaceRoot, manifest.main);
      if (!existsSync(mainPath) || !statSync(mainPath).isFile()) {
        throw new Error(`${repositoryPath(mainPath)} is missing; build the workspace first`);
      }
      walkBuildFiles(dirname(mainPath), collected);
      continue;
    }

    if (manifest.dependencies?.next) {
      const nextRoot = resolve(workspaceRoot, ".next");
      const buildId = resolve(nextRoot, "BUILD_ID");
      if (!existsSync(buildId) || !statSync(buildId).isFile()) {
        throw new Error(`${repositoryPath(buildId)} is missing; build the web application first`);
      }
      walkBuildFiles(nextRoot, collected);
      continue;
    }

    throw new Error(`${repositoryPath(path)} has a build script but no known artifact contract`);
  }

  if (buildableWorkspaces === 0 || collected.size === 0) {
    throw new Error("No build artifacts were found for release evidence");
  }
  return {
    buildableWorkspaces,
    ...aggregateFileEvidence([...collected].map(fileEvidence)),
  };
}

function readPackageManifest(node) {
  if (typeof node.path !== "string" || node.path === "") return undefined;
  const path = resolve(node.path, "package.json");
  if (!existsSync(path)) return undefined;
  try {
    return readJson(path);
  } catch {
    return undefined;
  }
}

function scopedPackageName(name) {
  if (!name.startsWith("@")) return { name };
  const separator = name.indexOf("/");
  if (separator < 2 || separator === name.length - 1) return { name };
  return { group: name.slice(0, separator), name: name.slice(separator + 1) };
}

function npmPurl(name, version) {
  const scoped = scopedPackageName(name);
  const encodedName = scoped.group
    ? `${encodeURIComponent(scoped.group)}/${encodeURIComponent(scoped.name)}`
    : encodeURIComponent(scoped.name);
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

function declaredLicense(manifest) {
  const declaration = manifest?.license ?? manifest?.licenses;
  if (typeof declaration === "string" && declaration.trim()) return declaration.trim();
  if (Array.isArray(declaration)) {
    const values = declaration.map((entry) => (typeof entry === "string" ? entry : entry?.type));
    if (values.every((value) => typeof value === "string" && value.trim())) {
      return values.join(" OR ");
    }
  }
  if (declaration && typeof declaration === "object" && typeof declaration.type === "string") {
    return declaration.type.trim() || undefined;
  }
  return undefined;
}

function workspaceLocation(node) {
  if (typeof node.path !== "string" || node.path === "") return undefined;
  const location = relative(repositoryRoot, resolve(node.path)).split(sep).join("/");
  if (
    !location ||
    location === ".." ||
    location.startsWith("../") ||
    location.includes("/node_modules/") ||
    location === "node_modules"
  ) {
    return undefined;
  }
  return location;
}

function componentForNode(node) {
  const manifest = readPackageManifest(node);
  const name = manifest?.name ?? node.name ?? node.from;
  const rawVersion = manifest?.version ?? node.version;
  if (typeof name !== "string" || !name || typeof rawVersion !== "string" || !rawVersion) {
    throw new Error("pnpm returned a production dependency without a name and version");
  }
  const location = workspaceLocation(node);
  const version = rawVersion.startsWith("link:") ? manifest?.version : rawVersion;
  if (typeof version !== "string" || !version || version.startsWith("link:")) {
    throw new Error(`Unable to resolve the version of ${name}`);
  }
  const purl = npmPurl(name, version);
  const scoped = scopedPackageName(name);
  const license = declaredLicense(manifest);
  const properties = [];
  if (location) properties.push({ name: "economyos:workspace-path", value: location });
  if (manifest?.private === true) properties.push({ name: "economyos:private", value: "true" });

  return {
    "bom-ref": location ? `workspace:${location}` : purl,
    type: location && !location.startsWith("packages/") ? "application" : "library",
    ...(scoped.group ? { group: scoped.group } : {}),
    name: scoped.name,
    version,
    purl,
    ...(license && !/^SEE LICENSE IN\s+/i.test(license)
      ? { licenses: [{ expression: license }] }
      : {}),
    ...(properties.length > 0 ? { properties } : {}),
  };
}

function dependencyCollections(node) {
  return [node.dependencies, node.optionalDependencies].filter(
    (collection) => collection && typeof collection === "object",
  );
}

export function cyclonedxFromPnpmList(roots, metadata) {
  if (!Array.isArray(roots)) throw new Error("pnpm production dependency output is not an array");
  const components = new Map();
  const dependencies = new Map([[metadata.rootRef, new Set()]]);
  const activeNodes = new Set();

  function visit(node, parentRef, rootWorkspace = false) {
    if (!node || typeof node !== "object") return;
    if (typeof node.path === "string" && resolve(node.path) === repositoryRoot) {
      for (const collection of dependencyCollections(node)) {
        for (const dependency of Object.values(collection)) visit(dependency, metadata.rootRef);
      }
      return;
    }
    const component = componentForNode(node);
    const reference = component["bom-ref"];
    if (reference !== metadata.rootRef) {
      const prior = components.get(reference);
      if (prior && canonicalJson(prior) !== canonicalJson(component)) {
        throw new Error(`Conflicting SBOM component identity ${reference}`);
      }
      components.set(reference, component);
    }
    if (!dependencies.has(reference)) dependencies.set(reference, new Set());
    if (parentRef && parentRef !== reference) {
      if (!dependencies.has(parentRef)) dependencies.set(parentRef, new Set());
      dependencies.get(parentRef).add(reference);
    }
    if (rootWorkspace && reference !== metadata.rootRef) {
      dependencies.get(metadata.rootRef).add(reference);
    }

    if (activeNodes.has(node)) throw new Error(`Cyclic pnpm dependency object at ${reference}`);
    activeNodes.add(node);
    for (const collection of dependencyCollections(node)) {
      for (const dependency of Object.values(collection)) visit(dependency, reference);
    }
    activeNodes.delete(node);
  }

  for (const root of roots) visit(root, metadata.rootRef, true);
  if (components.size === 0)
    throw new Error("Production SBOM contains no workspace or dependency components");

  const knownReferences = new Set([metadata.rootRef, ...components.keys()]);
  const dependencyEntries = [...dependencies]
    .map(([reference, dependsOn]) => ({
      ref: reference,
      dependsOn: [...dependsOn].sort(compareCodeUnits),
    }))
    .filter((entry) => knownReferences.has(entry.ref))
    .sort((left, right) => compareCodeUnits(left.ref, right.ref));
  for (const dependency of dependencyEntries) {
    for (const reference of dependency.dependsOn) {
      if (!knownReferences.has(reference)) {
        throw new Error(`SBOM dependency references missing component ${reference}`);
      }
    }
  }

  return {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    serialNumber: metadata.serialNumber,
    version: 1,
    metadata: {
      timestamp: metadata.generatedAt,
      tools: {
        components: [
          {
            type: "application",
            name: "economyos-release-evidence",
            version: "1",
          },
        ],
      },
      component: metadata.rootComponent,
      properties: [
        { name: "economyos:dependency-scope", value: "production" },
        { name: "economyos:lockfile-sha256", value: metadata.lockfileSha256 },
      ],
    },
    components: [...components.values()].sort((left, right) =>
      compareCodeUnits(left["bom-ref"], right["bom-ref"]),
    ),
    dependencies: dependencyEntries,
  };
}

function productionSbom(metadata) {
  const output = command("corepack", [
    "pnpm",
    "list",
    "--prod",
    "--recursive",
    "--json",
    "--depth",
    "Infinity",
  ]);
  return cyclonedxFromPnpmList(JSON.parse(output), metadata);
}

function uuidFromDigest(digest) {
  const characters = digest.slice(0, 32).split("");
  characters[12] = "5";
  characters[16] = ((Number.parseInt(characters[16], 16) & 3) | 8).toString(16);
  const value = characters.join("");
  return `urn:uuid:${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function generatedAt() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch !== undefined) {
    if (!/^\d{1,12}$/.test(epoch)) throw new Error("SOURCE_DATE_EPOCH must be whole seconds");
    const date = new Date(Number(epoch) * 1_000);
    if (!Number.isFinite(date.getTime())) throw new Error("SOURCE_DATE_EPOCH is out of range");
    return date.toISOString();
  }
  return new Date().toISOString();
}

function gitState() {
  const revision = command("git", ["rev-parse", "HEAD"]);
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("Git HEAD is not a SHA-1 revision");
  const dirty = command("git", ["status", "--porcelain=v1", "--untracked-files=all"]) !== "";
  return { revision, dirty };
}

function toolchain() {
  return {
    node: process.version,
    corepack: command("corepack", ["--version"]),
    pnpm: command("corepack", ["pnpm", "--version"]),
    platform: process.platform,
    architecture: process.arch,
  };
}

function rootComponent(rootManifest) {
  return {
    "bom-ref": "economyos:product",
    type: "application",
    name: rootManifest.name,
    version: rootManifest.version,
    properties: [{ name: "economyos:distribution", value: "private" }],
  };
}

function provenanceFor({
  artifact,
  candidateId,
  generatedAt: timestamp,
  git,
  lockfileSha256,
  source,
  tools,
}) {
  const github = process.env.GITHUB_ACTIONS === "true";
  return {
    _type: "https://in-toto.io/Statement/v1",
    subject: [
      { name: "economyos-build-output", digest: { sha256: artifact.sha256 } },
      { name: "economyos-source", digest: { sha256: source.sha256 } },
    ],
    predicateType: "https://economyos.dev/attestations/unsigned-build/v1",
    predicate: {
      candidateId,
      generatedAt: timestamp,
      buildDefinition: {
        buildType: "https://economyos.dev/builds/pnpm-monorepo/v1",
        externalParameters: { productionDependencyScope: true },
        internalParameters: {
          sourceRevision: git.revision,
          sourceDirty: git.dirty,
          lockfileSha256,
        },
        resolvedDependencies: [
          { uri: "git+local:economyos", digest: { sha1: git.revision } },
          { uri: "file:pnpm-lock.yaml", digest: { sha256: lockfileSha256 } },
        ],
      },
      runDetails: {
        builder: {
          id: github
            ? "https://github.com/actions/runner"
            : "https://economyos.dev/builders/local-untrusted",
        },
        metadata: {
          invocationId: github
            ? `github:${process.env.GITHUB_RUN_ID ?? "unknown"}:${process.env.GITHUB_RUN_ATTEMPT ?? "unknown"}`
            : "local:unsigned",
        },
        toolchain: tools,
      },
      signature: {
        status: "absent",
        productionReleaseAuthorization: false,
        requiredNextStep: "sign and attest this exact candidate in the approved release system",
      },
    },
  };
}

function assertExpectedToolchain(rootManifest, tools) {
  const expectedNode = rootManifest.engines?.node;
  const expectedPnpm = rootManifest.engines?.pnpm;
  const expectedCorepack = rootManifest.config?.releaseToolchain?.corepack;
  const packageManager = rootManifest.packageManager;
  if (typeof expectedNode !== "string" || process.version !== `v${expectedNode}`) {
    throw new Error(`Release evidence requires Node ${expectedNode}; received ${tools.node}`);
  }
  if (tools.pnpm !== expectedPnpm || packageManager !== `pnpm@${tools.pnpm}`) {
    throw new Error(
      `Release evidence requires the exact packageManager/engines pnpm version; received ${tools.pnpm}`,
    );
  }
  if (typeof expectedCorepack !== "string" || tools.corepack !== expectedCorepack) {
    throw new Error(
      `Release evidence requires Corepack ${expectedCorepack}; received ${tools.corepack}`,
    );
  }
}

function allowDirtyEvidence() {
  return process.env.ECONOMYOS_ALLOW_DIRTY_RELEASE_EVIDENCE === "true";
}

function releaseManifestFor({
  artifact,
  candidateId,
  generatedAt: timestamp,
  git,
  lockfileSha256,
  provenanceBytes,
  sbom,
  sbomBytes,
  source,
  tools,
}) {
  return {
    schemaVersion,
    candidateId,
    generatedAt: timestamp,
    repositoryEvidenceComplete: !git.dirty,
    productionReleaseAuthorized: false,
    externalEvidenceSatisfied: false,
    source: { ...git, ...source },
    build: { ...artifact, toolchain: tools },
    lockfile: { path: "pnpm-lock.yaml", sha256: lockfileSha256 },
    sbom: {
      path: repositoryPath(sbomPath),
      format: "CycloneDX",
      specVersion: "1.6",
      sha256: sha256(sbomBytes),
      components: sbom.components.length,
    },
    provenance: {
      path: repositoryPath(provenancePath),
      format: "in-toto Statement v1",
      predicateType: "https://economyos.dev/attestations/unsigned-build/v1",
      signatureStatus: "unsigned",
      sha256: sha256(provenanceBytes),
    },
    requiredExternalActions,
  };
}

function generate() {
  const rootManifest = readJson(resolve(repositoryRoot, "package.json"));
  const git = gitState();
  if (git.dirty && !allowDirtyEvidence()) {
    throw new Error(
      "Refusing release evidence for a dirty source tree; use ECONOMYOS_ALLOW_DIRTY_RELEASE_EVIDENCE=true only for local testing",
    );
  }
  const tools = toolchain();
  assertExpectedToolchain(rootManifest, tools);
  const source = sourceEvidence();
  const artifact = buildEvidence();
  const lockfileSha256 = fileEvidence("pnpm-lock.yaml").sha256;
  const timestamp = generatedAt();
  const candidateId = `sha256:${sha256(`${source.sha256}\0${artifact.sha256}`)}`;
  const root = rootComponent(rootManifest);
  const serialNumber = uuidFromDigest(candidateId.slice("sha256:".length));
  const sbom = productionSbom({
    generatedAt: timestamp,
    lockfileSha256,
    rootComponent: root,
    rootRef: root["bom-ref"],
    serialNumber,
  });
  const provenance = provenanceFor({
    artifact,
    candidateId,
    generatedAt: timestamp,
    git,
    lockfileSha256,
    source,
    tools,
  });
  const sbomBytes = canonicalJson(sbom);
  const provenanceBytes = canonicalJson(provenance);

  rmSync(evidenceDirectory, { recursive: true, force: true });
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(sbomPath, sbomBytes, { encoding: "utf8", mode: 0o644 });
  writeFileSync(provenancePath, provenanceBytes, { encoding: "utf8", mode: 0o644 });

  const manifest = releaseManifestFor({
    artifact,
    candidateId,
    generatedAt: timestamp,
    git,
    lockfileSha256,
    provenanceBytes,
    sbom,
    sbomBytes,
    source,
    tools,
  });
  writeFileSync(manifestPath, canonicalJson(manifest), { encoding: "utf8", mode: 0o644 });
  process.stdout.write(
    `Generated unsigned release evidence for ${candidateId}: ${artifact.files.length} build files and ${sbom.components.length} production components.\n`,
  );
}

function assertEqual(actual, expected, label) {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} does not match the current repository state`);
  }
}

function verify() {
  if (!existsSync(manifestPath) || !existsSync(sbomPath) || !existsSync(provenancePath)) {
    throw new Error("Release evidence is incomplete; run release:evidence:generate after build");
  }
  const manifest = readJson(manifestPath);
  const sbom = readJson(sbomPath);
  const provenance = readJson(provenancePath);
  if (manifest.schemaVersion !== schemaVersion)
    throw new Error("Unsupported release manifest schema");
  if (
    manifest.productionReleaseAuthorized !== false ||
    manifest.externalEvidenceSatisfied !== false
  ) {
    throw new Error("Repository evidence must not claim external production authorization");
  }
  if (manifest.provenance?.signatureStatus !== "unsigned") {
    throw new Error("Local provenance must be explicitly unsigned");
  }
  if (
    provenance.predicate?.signature?.status !== "absent" ||
    provenance.predicate?.signature?.productionReleaseAuthorization !== false
  ) {
    throw new Error("Unsigned provenance contains an invalid signature claim");
  }

  const rootManifest = readJson(resolve(repositoryRoot, "package.json"));
  const tools = toolchain();
  assertExpectedToolchain(rootManifest, tools);
  assertEqual(manifest.build.toolchain, tools, "Build toolchain");
  const git = gitState();
  if (git.dirty && !allowDirtyEvidence()) {
    throw new Error("Release evidence verification requires a clean source tree");
  }
  assertEqual(
    { revision: manifest.source.revision, dirty: manifest.source.dirty },
    git,
    "Git state",
  );
  if (manifest.repositoryEvidenceComplete !== !git.dirty) {
    throw new Error("Repository evidence completeness does not match Git state");
  }

  const source = sourceEvidence();
  const artifact = buildEvidence();
  assertEqual(
    { files: manifest.source.files, sha256: manifest.source.sha256 },
    source,
    "Source evidence",
  );
  assertEqual(
    {
      buildableWorkspaces: manifest.build.buildableWorkspaces,
      files: manifest.build.files,
      sha256: manifest.build.sha256,
    },
    artifact,
    "Build evidence",
  );
  const candidateId = `sha256:${sha256(`${source.sha256}\0${artifact.sha256}`)}`;
  if (manifest.candidateId !== candidateId) throw new Error("Release candidate identity mismatch");

  const sbomBytes = readFileSync(sbomPath);
  const provenanceBytes = readFileSync(provenancePath);
  if (manifest.sbom.sha256 !== sha256(sbomBytes)) throw new Error("SBOM checksum mismatch");
  if (manifest.provenance.sha256 !== sha256(provenanceBytes)) {
    throw new Error("Unsigned provenance checksum mismatch");
  }
  if (
    sbom.bomFormat !== "CycloneDX" ||
    sbom.specVersion !== "1.6" ||
    sbom.metadata?.properties?.find((property) => property.name === "economyos:lockfile-sha256")
      ?.value !== manifest.lockfile.sha256
  ) {
    throw new Error("SBOM metadata is invalid or not bound to the lockfile");
  }
  if (manifest.lockfile.sha256 !== fileEvidence("pnpm-lock.yaml").sha256) {
    throw new Error("Release manifest lockfile checksum mismatch");
  }
  if (!Array.isArray(sbom.components) || manifest.sbom.components !== sbom.components.length) {
    throw new Error("SBOM component count mismatch");
  }
  const knownReferences = new Set([
    sbom.metadata?.component?.["bom-ref"],
    ...sbom.components.map((component) => component["bom-ref"]),
  ]);
  for (const dependency of sbom.dependencies ?? []) {
    if (!knownReferences.has(dependency.ref)) throw new Error("SBOM dependency source is missing");
    for (const reference of dependency.dependsOn ?? []) {
      if (!knownReferences.has(reference)) throw new Error("SBOM dependency target is missing");
    }
  }
  const root = rootComponent(rootManifest);
  const expectedSbom = productionSbom({
    generatedAt: manifest.generatedAt,
    lockfileSha256: manifest.lockfile.sha256,
    rootComponent: root,
    rootRef: root["bom-ref"],
    serialNumber: uuidFromDigest(candidateId.slice("sha256:".length)),
  });
  assertEqual(sbom, expectedSbom, "Production SBOM");

  const subjects = new Map(
    (provenance.subject ?? []).map((subject) => [subject.name, subject.digest?.sha256]),
  );
  if (
    provenance.predicate?.candidateId !== candidateId ||
    subjects.get("economyos-build-output") !== artifact.sha256 ||
    subjects.get("economyos-source") !== source.sha256
  ) {
    throw new Error("Unsigned provenance is not bound to the current candidate");
  }
  const expectedProvenance = provenanceFor({
    artifact,
    candidateId,
    generatedAt: manifest.generatedAt,
    git,
    lockfileSha256: manifest.lockfile.sha256,
    source,
    tools,
  });
  assertEqual(provenance, expectedProvenance, "Unsigned provenance");
  const expectedManifest = releaseManifestFor({
    artifact,
    candidateId,
    generatedAt: manifest.generatedAt,
    git,
    lockfileSha256: manifest.lockfile.sha256,
    provenanceBytes,
    sbom,
    sbomBytes,
    source,
    tools,
  });
  assertEqual(manifest, expectedManifest, "Release manifest");
  process.stdout.write(
    `Verified unsigned release evidence for ${candidateId}; signing and external Phase 15 evidence remain required.\n`,
  );
}

function main() {
  const action = process.argv[2];
  if (action === "generate") generate();
  else if (action === "verify") verify();
  else throw new Error("Usage: release-evidence.mjs <generate|verify>");
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
