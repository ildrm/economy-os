import { createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const KEY = /^[a-z][a-z0-9_.-]{0,127}$/;
const ISO_INSTANT =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d{1,3}))?Z$/;
const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/;
const PROBABILITY = /^(?:0(?:\.\d*[1-9])?|1)$/;
const DECIMAL_SCALE = 1_000_000_000_000n;

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

export function cloneCanonical<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}

export function digestJson(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function assertRecord(
  value: unknown,
  field: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
}

export function expectString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new TypeError(`${field} must be a string`);
  return value;
}

export function expectInteger(
  value: unknown,
  field: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (typeof value !== "number") throw new TypeError(`${field} must be an integer`);
  assertInteger(value, field, minimum, maximum);
  return value;
}

export function expectArray(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  if (value.length > 10_000) throw new TypeError(`${field} exceeds the 10000-item resource bound`);
  return value;
}

export function expectNullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  return expectString(value, field);
}

export function expectBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${field} must be a boolean`);
  return value;
}

export function assertExactKeys(value: object, expected: readonly string[], field: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${field} must contain exactly: ${wanted.join(", ")}`);
  }
}

export function assertUuid(value: string, field: string): void {
  if (!UUID.test(value)) throw new TypeError(`${field} must be a lowercase UUID`);
}

export function assertSha256(value: string, field: string): void {
  if (!SHA256.test(value)) throw new TypeError(`${field} must be a lowercase SHA-256 digest`);
}

export function assertSemver(value: string, field: string): void {
  if (!SEMVER.test(value)) throw new TypeError(`${field} must be a semantic version`);
}

export function assertKey(value: string, field: string): void {
  if (!KEY.test(value)) throw new TypeError(`${field} must be a stable lowercase key`);
}

export function assertText(value: string, field: string, maximum = 2_000): void {
  if (value.trim() !== value || value.length === 0 || value.length > maximum) {
    throw new TypeError(`${field} must be a non-blank trimmed string`);
  }
}

export function assertIsoInstant(value: string, field: string): void {
  const match = ISO_INSTANT.exec(value);
  if (!match?.groups || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${field} must be a valid RFC 3339 UTC instant`);
  }
  const normalizedFraction = (match.groups.fraction ?? "").padEnd(3, "0");
  if (`${value.slice(0, 19)}.${normalizedFraction}Z` !== new Date(value).toISOString()) {
    throw new TypeError(`${field} must be a valid RFC 3339 UTC instant`);
  }
}

export function compareInstant(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
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

function decimalPlaces(value: string): number {
  return value.includes(".") ? (value.split(".")[1]?.length ?? 0) : 0;
}

export function assertDecimal(value: string, field: string, allowNegative = true): void {
  if (
    value.length > 128 ||
    !DECIMAL.test(value) ||
    value === "-0" ||
    decimalPlaces(value) > 12 ||
    (!allowNegative && value.startsWith("-"))
  ) {
    throw new TypeError(`${field} must be a canonical exact decimal string`);
  }
}

export function assertPositiveDecimal(value: string, field: string): void {
  assertDecimal(value, field, false);
  if (compareDecimal(value, "0") <= 0) throw new TypeError(`${field} must be positive`);
}

export function assertProbability(value: string, field: string): void {
  if (!PROBABILITY.test(value) || decimalPlaces(value) > 12) {
    throw new TypeError(`${field} must be a canonical probability between 0 and 1`);
  }
}

function decimalUnits(value: string): bigint {
  assertDecimal(value, "decimal");
  const negative = value.startsWith("-");
  const absolute = negative ? value.slice(1) : value;
  const [integer = "0", fraction = ""] = absolute.split(".");
  const units = BigInt(integer) * DECIMAL_SCALE + BigInt(fraction.padEnd(12, "0") || "0");
  return negative ? -units : units;
}

export function compareDecimal(left: string, right: string): number {
  const a = decimalUnits(left);
  const b = decimalUnits(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function assertEnum<const Values extends readonly string[]>(
  value: string,
  values: Values,
  field: string,
): asserts value is Values[number] {
  if (!values.includes(value)) throw new TypeError(`${field} is not an allowed value`);
}

export function assertUniqueStrings(
  values: readonly string[],
  field: string,
  validate: (value: string, field: string) => void = assertKey,
  allowEmpty = false,
): void {
  if (!allowEmpty && values.length === 0) throw new TypeError(`${field} must not be empty`);
  const seen = new Set<string>();
  for (const value of values) {
    validate(value, `${field} item`);
    if (seen.has(value)) throw new TypeError(`${field} must be unique`);
    seen.add(value);
  }
}

export function assertSorted(values: readonly string[], field: string): void {
  if (values.some((value, index) => index > 0 && value <= (values[index - 1] ?? ""))) {
    throw new TypeError(`${field} must be in deterministic ascending order`);
  }
}

export function sortedUnique(
  values: readonly string[],
  field: string,
  validate: (value: string, field: string) => void = assertKey,
  allowEmpty = false,
): string[] {
  assertUniqueStrings(values, field, validate, allowEmpty);
  return [...values].sort();
}
