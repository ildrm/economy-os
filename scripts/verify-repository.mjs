import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const maximumScannedFileBytes = 2_000_000;

export const secretPatterns = [
  {
    name: "private key",
    expression: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g,
  },
  { name: "AWS access key", expression: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "GitHub token", expression: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { name: "GitHub fine-grained token", expression: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: "npm token", expression: /\bnpm_[A-Za-z0-9]{20,}\b/g },
  { name: "Stripe live secret key", expression: /\bsk_live_[A-Za-z0-9]{16,}\b/g },
  { name: "Google API key", expression: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "OpenAI key", expression: /\bsk-(?:proj|svcacct)-[A-Za-z0-9_-]{20,}\b/g },
  { name: "Slack token", expression: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
];

function lineAt(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

export function findSecretFindings(relativePath, text) {
  const findings = [];
  for (const pattern of secretPatterns) {
    pattern.expression.lastIndex = 0;
    for (const match of text.matchAll(pattern.expression)) {
      findings.push(`${relativePath}:${lineAt(text, match.index)}: possible ${pattern.name}`);
    }
  }
  return findings;
}

function maskRange(characters, start, end) {
  for (let index = start; index < end; index += 1) {
    if (characters[index] !== "\n" && characters[index] !== "\r") characters[index] = " ";
  }
}

function maskMarkdownCodeAndComments(text) {
  // Regex offsets and string slicing use UTF-16 code units, so keep the mask
  // indexed the same way even when a document contains non-BMP characters.
  const characters = text.split("");
  let lineStart = 0;
  let activeFence;
  while (lineStart < text.length) {
    const newline = text.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? text.length : newline + 1;
    const line = text.slice(lineStart, lineEnd);
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (activeFence) {
      maskRange(characters, lineStart, lineEnd);
      if (fence && fence[1]?.[0] === activeFence.marker && fence[1].length >= activeFence.length) {
        activeFence = undefined;
      }
    } else if (fence?.[1]) {
      activeFence = { marker: fence[1][0], length: fence[1].length };
      maskRange(characters, lineStart, lineEnd);
    }
    lineStart = lineEnd;
  }

  let masked = characters.join("");
  for (const match of masked.matchAll(/<!--[\s\S]*?-->/g)) {
    maskRange(characters, match.index, match.index + match[0].length);
  }
  masked = characters.join("");
  for (const match of masked.matchAll(/(`+)[^\n]*?\1/g)) {
    maskRange(characters, match.index, match.index + match[0].length);
  }
  return characters.join("");
}

function normalizeReference(identifier) {
  return identifier.trim().replace(/\s+/g, " ").toLowerCase();
}

function checkMarkdownTarget({ relativePath, text, offset, rawTarget, targetExists }) {
  const findings = [];
  const target = rawTarget.trim().replace(/^<|>$/g, "");
  if (
    !target ||
    target.startsWith("#") ||
    target.startsWith("/") ||
    /^[a-z][a-z0-9+.-]*:/i.test(target)
  ) {
    return findings;
  }
  const pathOnly = target.split(/[?#]/, 1)[0];
  if (!pathOnly) return findings;
  let decoded;
  try {
    decoded = decodeURIComponent(pathOnly);
  } catch {
    findings.push(
      `${relativePath}:${lineAt(text, offset)}: malformed percent-encoded Markdown link ${target}`,
    );
    return findings;
  }
  const absoluteTarget = resolve(repositoryRoot, dirname(relativePath), decoded);
  if (!targetExists(absoluteTarget)) {
    findings.push(
      `${relativePath}:${lineAt(text, offset)}: missing local Markdown target ${target}`,
    );
  }
  return findings;
}

export function findMarkdownFindings(relativePath, text, targetExists = existsSync) {
  const findings = [];
  const markdown = maskMarkdownCodeAndComments(text);
  const definitions = new Map();

  for (const match of markdown.matchAll(
    /^ {0,3}\[([^\]\n]+)]\s*:\s*(<[^>\n]+>|[^\s\n]+)(?:\s+.*)?$/gm,
  )) {
    const identifier = normalizeReference(match[1] ?? "");
    const rawTarget = match[2] ?? "";
    if (!identifier || definitions.has(identifier)) continue;
    definitions.set(identifier, { rawTarget, offset: match.index });
    findings.push(
      ...checkMarkdownTarget({
        relativePath,
        text,
        offset: match.index,
        rawTarget,
        targetExists,
      }),
    );
  }

  for (const match of markdown.matchAll(/\[[^\]\n]*]\(\s*(<[^>\n]+>|[^\s)\n]+)/g)) {
    findings.push(
      ...checkMarkdownTarget({
        relativePath,
        text,
        offset: match.index,
        rawTarget: match[1] ?? "",
        targetExists,
      }),
    );
  }

  for (const match of markdown.matchAll(/\[([^\]\n]+)]\[([^\]\n]*)]/g)) {
    const identifier = normalizeReference(match[2] || match[1] || "");
    if (!identifier || definitions.has(identifier)) continue;
    findings.push(
      `${relativePath}:${lineAt(text, match.index)}: missing Markdown reference definition [${identifier}]`,
    );
  }

  return findings;
}

export function verifyRepositoryFiles(files) {
  const findings = [];
  let scannedFiles = 0;
  let skippedBinaryFiles = 0;
  let skippedOversizedFiles = 0;

  for (const relativePath of files) {
    const absolutePath = resolve(repositoryRoot, relativePath);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) continue;
    const bytes = readFileSync(absolutePath);
    if (bytes.byteLength > maximumScannedFileBytes) {
      skippedOversizedFiles += 1;
      continue;
    }
    if (bytes.includes(0)) {
      skippedBinaryFiles += 1;
      continue;
    }
    const text = bytes.toString("utf8");
    scannedFiles += 1;
    findings.push(...findSecretFindings(relativePath, text));
    if (relativePath.endsWith(".md")) {
      findings.push(...findMarkdownFindings(relativePath, text));
    }
  }

  return { findings, scannedFiles, skippedBinaryFiles, skippedOversizedFiles };
}

function main() {
  const listed = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );
  if (listed.status !== 0) {
    throw new Error(`Unable to enumerate repository files: ${listed.stderr.trim()}`);
  }

  const result = verifyRepositoryFiles(listed.stdout.split("\0").filter(Boolean));
  if (result.findings.length > 0) {
    throw new Error(`Repository policy verification failed:\n${result.findings.join("\n")}`);
  }
  process.stdout.write(
    `Repository policy verification passed for ${result.scannedFiles} text files no larger than ${maximumScannedFileBytes} bytes (high-confidence secret patterns, inline/reference local Markdown targets; ${result.skippedOversizedFiles} oversized and ${result.skippedBinaryFiles} NUL-containing binary files explicitly out of scan scope).\n`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) main();
