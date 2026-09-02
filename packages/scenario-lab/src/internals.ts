import { createHash } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const KEY_PATTERN = /^[a-z][a-z0-9_.-]{1,126}[a-z0-9]$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/;
const ISO_INSTANT_PATTERN =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d{1,9}))?Z$/;
const UINT64_PATTERN = /^(?:0|[1-9]\d*)$/;
const UINT64_MAX = 18_446_744_073_709_551_615n;

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
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${field} must be a plain record`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${field} must be a plain record`);
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
    throw new TypeError(`${field} contains missing or unknown fields`);
  }
}

export function assertUuid(value: string, field: string): void {
  if (!UUID_PATTERN.test(value)) throw new TypeError(`${field} must be a lowercase UUID`);
}

export function assertSha256(value: string, field: string): void {
  if (!SHA256_PATTERN.test(value)) throw new TypeError(`${field} must be a lowercase SHA-256`);
}

export function assertKey(value: string, field: string): void {
  if (!KEY_PATTERN.test(value)) throw new TypeError(`${field} must be a canonical key`);
}

export function assertKeyOrWildcard(value: string, field: string): void {
  if (value !== "*") assertKey(value, field);
}

export function assertSemver(value: string, field: string): void {
  if (!SEMVER_PATTERN.test(value)) throw new TypeError(`${field} must be semantic version text`);
}

export function assertNonBlank(value: string, field: string, maxLength = 2_000): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength ||
    value.trim() !== value
  ) {
    throw new TypeError(`${field} must be nonblank, trimmed, and at most ${maxLength} characters`);
  }
}

export function assertIsoInstant(value: string, field: string): void {
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be a real canonical UTC instant`);
  }
  const match = ISO_INSTANT_PATTERN.exec(value);
  if (!match?.groups) throw new TypeError(`${field} must be a real canonical UTC instant`);
  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);
  const second = Number(match.groups.second);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    year === 0 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > (daysInMonth[month - 1] ?? 0) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new TypeError(`${field} must be a real canonical UTC instant`);
  }
}

export function compareInstants(left: string, right: string): number {
  assertIsoInstant(left, "left instant");
  assertIsoInstant(right, "right instant");
  const leftKey = instantSortKey(left);
  const rightKey = instantSortKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function instantSortKey(value: string): string {
  const match = ISO_INSTANT_PATTERN.exec(value);
  if (!match?.groups) throw new TypeError("instant must be canonical UTC text");
  return `${value.slice(0, 19)}.${(match.groups.fraction ?? "").padEnd(9, "0")}`;
}

export function assertInteger(
  value: number,
  field: string,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} must be an integer from ${minimum} through ${maximum}`);
  }
}

export function assertDecimal(
  value: string,
  field: string,
  minimum = -1_000_000_000_000,
  maximum = 1_000_000_000_000,
): number {
  const fractionalDigits = typeof value === "string" ? (value.split(".")[1]?.length ?? 0) : 0;
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    fractionalDigits > 12 ||
    !DECIMAL_PATTERN.test(value) ||
    value === "-0"
  ) {
    throw new TypeError(`${field} must be a canonical exact decimal string`);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < minimum || numeric > maximum) {
    throw new TypeError(`${field} must be between ${minimum} and ${maximum}`);
  }
  return numeric;
}

export function canonicalDecimal(value: number, field = "numeric output"): string {
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000_000) {
    throw new TypeError(`${field} exceeded its finite numeric bound`);
  }
  const rounded = Math.abs(value) < 5e-13 ? 0 : Number(value.toFixed(12));
  return String(rounded);
}

export function assertUint64(value: string, field: string): void {
  if (typeof value !== "string" || !UINT64_PATTERN.test(value) || BigInt(value) > UINT64_MAX) {
    throw new TypeError(`${field} must be a canonical unsigned 64-bit integer string`);
  }
}

export function assertStringArray(
  values: readonly string[],
  field: string,
  minimum: number,
  maximum: number,
  itemMaximum = 2_000,
): void {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum) {
    throw new TypeError(`${field} must contain ${minimum}..${maximum} items`);
  }
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    assertNonBlank(value, `${field}[${index}]`, itemMaximum);
    if (seen.has(value)) throw new TypeError(`${field} contains duplicate items`);
    seen.add(value);
  }
}

export function uniqueBy<T>(
  values: readonly T[],
  selector: (value: T) => string,
  field: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const key = selector(value);
    if (seen.has(key)) throw new TypeError(`${field} contains duplicate ${key}`);
    seen.add(key);
  }
}

function canonicalize(value: unknown, path: string, seen: WeakSet<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number`);
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value !== "object") throw new TypeError(`${path} is not canonical JSON`);
  if (seen.has(value)) throw new TypeError(`${path} contains a cycle`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item, index) => canonicalize(item, `${path}[${index}]`, seen)).join(",")}]`;
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

export function digestJson(value: unknown): string {
  return createHash("sha256")
    .update(canonicalize(value, "value", new WeakSet()))
    .digest("hex");
}

export function canonicalJson(value: unknown): string {
  return canonicalize(value, "value", new WeakSet());
}

export function cloneCanonical<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

export function immutableWithDigest<T extends object>(
  input: T,
): Readonly<T & { readonly manifestSha256: string }> {
  const body = cloneCanonical(input);
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function assertDigestIntegrity<T extends object>(
  artifact: T & { readonly manifestSha256: string },
  field: string,
): void {
  assertSha256(artifact.manifestSha256, `${field}.manifestSha256`);
  const { manifestSha256, ...body } = artifact;
  if (digestJson(body) !== manifestSha256) {
    throw new TypeError(`${field} digest does not match content`);
  }
}

export function assertHttpsOrUrn(value: string, field: string): void {
  assertNonBlank(value, field, 2_000);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${field} must be an HTTPS URL or URN`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "urn:") {
    throw new TypeError(`${field} must be an HTTPS URL or URN`);
  }
}
