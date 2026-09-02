import { createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const KEY = /^[a-z][a-z0-9_.-]{0,127}$/;
const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/;
const ISO_INSTANT =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d{1,3}))?Z$/;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

function normalizeJson(value: unknown, path: string, seen: Set<object>): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`${path} contains a non-safe integer; exact decimals must be strings`);
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") throw new TypeError(`${path} is not canonical JSON`);
  if (seen.has(value)) throw new TypeError(`${path} contains a cycle`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => normalizeJson(item, `${path}[${index}]`, seen));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain plain JSON objects`);
    }
    const output = Object.create(null) as Record<string, JsonValue>;
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      output[key] = normalizeJson((value as Record<string, unknown>)[key], `${path}.${key}`, seen);
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value, "value", new Set()));
}

export function digestJson(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function cloneCanonical<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function immutableWithDigest<T extends object>(
  input: T,
  digestField = "manifestSha256",
): Readonly<T> & { readonly manifestSha256: string } {
  const copy = cloneCanonical(input);
  const digest = digestJson(copy);
  return deepFreeze({ ...copy, [digestField]: digest }) as Readonly<T> & {
    readonly manifestSha256: string;
  };
}

export function assertDigest(value: object, field = "manifestSha256"): void {
  const record = value as Record<string, unknown>;
  const stored = record[field];
  if (typeof stored !== "string") throw new TypeError(`${field} is required`);
  assertSha256(stored, field);
  const { [field]: _ignored, ...unsigned } = record;
  if (digestJson(unsigned) !== stored) throw new TypeError(`${field} does not match content`);
}

export function assertUuid(value: string, field: string): void {
  if (!UUID.test(value)) throw new TypeError(`${field} must be a lowercase UUID`);
}

export function assertSha256(value: string, field: string): void {
  if (!SHA256.test(value)) throw new TypeError(`${field} must be a lowercase SHA-256 digest`);
}

export function assertSemver(value: string, field: string): void {
  const baseParts = value.split("-")[0]?.split(".") ?? [];
  if (
    value.length > 128 ||
    !SEMVER.test(value) ||
    baseParts.some((part) => !Number.isSafeInteger(Number(part)))
  ) {
    throw new TypeError(`${field} must be bounded semantic versioning`);
  }
}

export function assertSchemaVersion(value: number): void {
  if (value !== 1) throw new TypeError("schemaVersion must equal 1");
}

export function assertKey(value: string, field: string): void {
  if (!KEY.test(value)) throw new TypeError(`${field} must be a stable lowercase key`);
}

export function assertText(value: string, field: string, maximum = 2_000): void {
  if (value.trim() !== value || value.length === 0 || value.length > maximum) {
    throw new TypeError(`${field} must be a non-blank trimmed string up to ${maximum} characters`);
  }
}

export function assertTexts(
  values: readonly string[],
  field: string,
  options: { readonly minimum?: number; readonly maximum?: number } = {},
): void {
  const minimum = options.minimum ?? 1;
  const maximum = options.maximum ?? 100;
  if (values.length < minimum || values.length > maximum) {
    throw new TypeError(`${field} must contain ${minimum}..${maximum} entries`);
  }
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    assertText(value, `${field}[${index}]`);
    if (seen.has(value)) throw new TypeError(`${field} must not contain duplicates`);
    seen.add(value);
  }
}

export function assertKeys(
  values: readonly string[],
  field: string,
  options: { readonly minimum?: number; readonly maximum?: number } = {},
): void {
  const minimum = options.minimum ?? 1;
  const maximum = options.maximum ?? 100;
  if (values.length < minimum || values.length > maximum) {
    throw new TypeError(`${field} must contain ${minimum}..${maximum} entries`);
  }
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    assertKey(value, `${field}[${index}]`);
    if (seen.has(value)) throw new TypeError(`${field} must not contain duplicates`);
    seen.add(value);
  }
}

export function assertIsoInstant(value: string, field: string): void {
  const match = ISO_INSTANT.exec(value);
  if (!match?.groups || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${field} must be a valid RFC 3339 UTC instant`);
  }
  const fraction = (match.groups.fraction ?? "").padEnd(3, "0");
  if (`${value.slice(0, 19)}.${fraction}Z` !== new Date(value).toISOString()) {
    throw new TypeError(`${field} must be a valid RFC 3339 UTC instant`);
  }
}

export function compareInstant(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

export function assertDecimal(value: string, field: string): void {
  const scale = value.includes(".") ? (value.split(".")[1]?.length ?? 0) : 0;
  if (value.length > 128 || !DECIMAL.test(value) || value === "-0" || scale > 12) {
    throw new TypeError(`${field} must be a canonical exact decimal with at most 12 places`);
  }
}

export function compareDecimal(left: string, right: string): number {
  const scale = 1_000_000_000_000n;
  const units = (value: string): bigint => {
    assertDecimal(value, "decimal");
    const negative = value.startsWith("-");
    const absolute = negative ? value.slice(1) : value;
    const [integer = "0", fraction = ""] = absolute.split(".");
    const result = BigInt(integer) * scale + BigInt(fraction.padEnd(12, "0") || "0");
    return negative ? -result : result;
  };
  const a = units(left);
  const b = units(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function assertInteger(
  value: number,
  field: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} must be an integer between ${minimum} and ${maximum}`);
  }
}

export function assertEnum<const T extends readonly string[]>(
  value: string,
  values: T,
  field: string,
): asserts value is T[number] {
  if (!values.includes(value)) throw new TypeError(`${field} is not an allowed value`);
}

export function assertRecord(
  value: unknown,
  field: string,
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${field} must be a plain object`);
  }
}

export function assertExactKeys(value: object, expected: readonly string[], field: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${field} must contain exactly: ${wanted.join(", ")}`);
  }
}

export function unreachable(value: never): never {
  throw new TypeError(`unsupported exhaustive value: ${String(value)}`);
}
