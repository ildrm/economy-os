import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const KEY_PATTERN = /^[a-z][a-z0-9_.-]{0,126}[a-z0-9]$/;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const INSTANT_PATTERN = /^(?!0000-)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json };

export function assertPlainRecord(
  value: unknown,
  field: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${field} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${field} must be a plain object`);
  }
}

export function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  field: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${field} must contain exactly: ${wanted.join(", ")}`);
  }
}

export function assertUuid(value: string, field: string): void {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a lowercase UUID`);
  }
}

export function assertSha256(value: string, field: string): void {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a lowercase SHA-256 digest`);
  }
}

export function assertKey(value: string, field: string): void {
  if (typeof value !== "string" || !KEY_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a canonical lowercase key`);
  }
}

export function assertText(value: string, field: string, maximum = 2_000): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value
  ) {
    throw new TypeError(`${field} must be nonblank, trimmed, and at most ${maximum} characters`);
  }
}

export function assertIsoInstant(value: string, field: string): void {
  if (
    typeof value !== "string" ||
    !INSTANT_PATTERN.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new TypeError(`${field} must be a real RFC 3339 UTC instant`);
  }
  const milliseconds = Date.parse(value);
  if (new Date(milliseconds).toISOString().replace(".000Z", "Z") !== value) {
    const normalized = new Date(milliseconds).toISOString();
    if (normalized !== value) {
      throw new TypeError(`${field} must be a canonical RFC 3339 UTC instant`);
    }
  }
}

export function compareInstants(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

export interface SemanticVersion {
  readonly major: string;
  readonly minor: string;
  readonly patch: string;
  readonly prerelease: string | null;
  readonly build: string | null;
}

export function parseSemver(value: string, field: string): SemanticVersion {
  if (typeof value !== "string" || value.length < 5 || value.length > 128) {
    throw new TypeError(`${field} must be 5..128 characters of semantic version text`);
  }
  const match = SEMVER_PATTERN.exec(value);
  if (!match) throw new TypeError(`${field} must be semantic version text`);
  const major = match[1];
  const minor = match[2];
  const patch = match[3];
  if (major === undefined || minor === undefined || patch === undefined) {
    throw new TypeError(`${field} must contain semantic version core components`);
  }
  const prerelease = match[4] ?? null;
  if (
    prerelease
      ?.split(".")
      .some((identifier) => /^\d+$/.test(identifier) && /^0\d+/.test(identifier))
  ) {
    throw new TypeError(`${field} contains a numeric prerelease identifier with a leading zero`);
  }
  return {
    major,
    minor,
    patch,
    prerelease,
    build: match[5] ?? null,
  };
}

function comparePrerelease(left: string, right: string): number {
  const a = left.split(".");
  const b = right.split(".");
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const leftPart = a[index];
    const rightPart = b[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      if (leftPart.length !== rightPart.length) return leftPart.length < rightPart.length ? -1 : 1;
      return leftPart < rightPart ? -1 : 1;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

export function compareSemver(left: string, right: string): number {
  const a = parseSemver(left, "left version");
  const b = parseSemver(right, "right version");
  for (const field of ["major", "minor", "patch"] as const) {
    if (a[field] === b[field]) continue;
    if (a[field].length !== b[field].length) {
      return a[field].length < b[field].length ? -1 : 1;
    }
    return a[field] < b[field] ? -1 : 1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  return comparePrerelease(a.prerelease, b.prerelease);
}

export function assertInteger(
  value: number,
  field: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} must be an integer from ${minimum} through ${maximum}`);
  }
}

export function assertUniqueKeys(
  values: readonly string[],
  field: string,
  minimum = 1,
  maximum = 100,
): void {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum) {
    throw new TypeError(`${field} must contain ${minimum}..${maximum} keys`);
  }
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    assertKey(value, `${field}[${index}]`);
    if (seen.has(value)) throw new TypeError(`${field} must not contain duplicates`);
    seen.add(value);
  }
}

function canonicalize(value: unknown, path: string, seen: WeakSet<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`${path} contains an inexact number; exact decimals must be strings`);
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value !== "object") throw new TypeError(`${path} is not canonical JSON`);
  if (seen.has(value)) throw new TypeError(`${path} contains a cycle`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value
        .map((item, index) => canonicalize(item, `${path}[${index}]`, seen))
        .join(",")}]`;
    }
    assertPlainRecord(value, path);
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], `${path}.${key}`, seen)}`)
      .join(",")}}`;
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return canonicalize(value, "value", new WeakSet());
}

export function digestJson(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function signJson(value: unknown, secret: string | Uint8Array): string {
  if (typeof secret === "string" && secret.length < 32) {
    throw new TypeError("signing secret must contain at least 32 characters");
  }
  if (secret instanceof Uint8Array && secret.byteLength < 32) {
    throw new TypeError("signing secret must contain at least 32 bytes");
  }
  return createHmac("sha256", secret).update(canonicalJson(value)).digest("hex");
}

export function signaturesEqual(left: string, right: string): boolean {
  if (!SHA256_PATTERN.test(left) || !SHA256_PATTERN.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function cloneCanonical<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

export function immutableWithDigest<T extends object>(
  input: T,
): Readonly<T & { readonly manifestSha256: string }> {
  const body = cloneCanonical(input);
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function assertDigestIntegrity(
  value: object & { readonly manifestSha256: string },
  field: string,
): void {
  assertSha256(value.manifestSha256, `${field}.manifestSha256`);
  const { manifestSha256, ...body } = value;
  if (digestJson(body) !== manifestSha256) {
    throw new TypeError(`${field}.manifestSha256 does not match its content`);
  }
}

export interface ChainedEventBody {
  readonly sequence: number;
  readonly previousEventSha256: string | null;
}

export function chainedEvent<T extends ChainedEventBody>(
  input: T,
): Readonly<T & { readonly eventSha256: string }> {
  const body = cloneCanonical(input);
  return deepFreeze({ ...body, eventSha256: digestJson(body) });
}

export function verifyHashChain<T extends ChainedEventBody & { readonly eventSha256: string }>(
  events: readonly T[],
  field: string,
): void {
  let previous: string | null = null;
  for (const [index, event] of events.entries()) {
    if (event.sequence !== index + 1 || event.previousEventSha256 !== previous) {
      throw new TypeError(`${field}[${index}] breaks append-only sequence`);
    }
    const { eventSha256, ...body } = event;
    assertSha256(eventSha256, `${field}[${index}].eventSha256`);
    if (digestJson(body) !== eventSha256) {
      throw new TypeError(`${field}[${index}] digest does not match content`);
    }
    previous = eventSha256;
  }
}
