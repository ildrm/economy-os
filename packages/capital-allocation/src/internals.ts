import { createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_INSTANT =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d{1,3}))?Z$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const KEY = /^[a-z][a-z0-9_.-]{0,127}$/;
const COUNTRY_CODE = /^[A-Z]{2}$/;
const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/;
const DECIMAL_SCALE = 1_000_000_000_000n;

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

function normalizeJson(value: unknown, path: string, seen: Set<object>): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw new TypeError(`${path} contains a non-safe-integer number; exact decimals use strings`);
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

export function assertRecord<T>(
  value: T,
  field: string,
): asserts value is T & Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${field} must be a plain object`);
  }
}

export function assertExactKeys<T>(
  value: T,
  keys: readonly string[],
  field: string,
): asserts value is T & Record<string, unknown> {
  assertRecord(value, field);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${field} must contain exactly: ${expected.join(", ")}`);
  }
}

export function assertUuid(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new TypeError(`${field} must be a lowercase UUID`);
  }
}

export function assertSha256(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new TypeError(`${field} must be a lowercase SHA-256 digest`);
  }
}

export function assertIsoInstant(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") throw new TypeError(`${field} must be an RFC 3339 UTC instant`);
  const match = ISO_INSTANT.exec(value);
  if (!match?.groups || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${field} must be a valid RFC 3339 UTC instant`);
  }
  const normalizedFraction = (match.groups.fraction ?? "").padEnd(3, "0");
  const normalizedInput = `${value.slice(0, 19)}.${normalizedFraction}Z`;
  if (new Date(value).toISOString() !== normalizedInput) {
    throw new TypeError(`${field} must be a valid RFC 3339 UTC instant`);
  }
}

export function assertSemver(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !SEMVER.test(value)) {
    throw new TypeError(`${field} must be a semantic version`);
  }
}

export function assertKey(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !KEY.test(value)) {
    throw new TypeError(`${field} must be a stable lowercase key`);
  }
}

export function assertCountryCode(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !COUNTRY_CODE.test(value)) {
    throw new TypeError(`${field} must be an uppercase ISO-style alpha-2 country code`);
  }
}

export function assertNonBlank(
  value: unknown,
  field: string,
  maximum = 2_000,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maximum
  ) {
    throw new TypeError(`${field} must be a non-blank trimmed string`);
  }
}

export function assertSafeInteger(
  value: unknown,
  field: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new TypeError(`${field} must be an integer between ${minimum} and ${maximum}`);
  }
}

export function assertBoolean(value: unknown, field: string): asserts value is boolean {
  if (typeof value !== "boolean") throw new TypeError(`${field} must be boolean`);
}

export function compareInstant(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

export function secondsBetween(earlier: string, later: string): number {
  const milliseconds = Date.parse(later) - Date.parse(earlier);
  if (milliseconds < 0 || milliseconds % 1_000 !== 0) {
    throw new TypeError("instant difference must be a non-negative whole number of seconds");
  }
  const seconds = milliseconds / 1_000;
  if (!Number.isSafeInteger(seconds)) throw new TypeError("instant difference exceeds safe range");
  return seconds;
}

function decimalPlaces(value: string): number {
  return value.includes(".") ? (value.split(".")[1]?.length ?? 0) : 0;
}

export function decimalUnits(value: unknown, field: string): bigint {
  if (
    typeof value !== "string" ||
    value.length > 32 ||
    !DECIMAL.test(value) ||
    decimalPlaces(value) > 12 ||
    value === "-0"
  ) {
    throw new TypeError(`${field} must be a canonical decimal with at most 12 places`);
  }
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [integer = "0", fraction = ""] = unsigned.split(".");
  const units = BigInt(integer) * DECIMAL_SCALE + BigInt(fraction.padEnd(12, "0") || "0");
  return negative ? -units : units;
}

export function assertUnitScore(value: unknown, field: string): asserts value is string {
  const units = decimalUnits(value, field);
  if (units < -DECIMAL_SCALE || units > DECIMAL_SCALE) {
    throw new TypeError(`${field} must be between -1 and 1`);
  }
}

export function assertProbability(value: unknown, field: string): asserts value is string {
  const units = decimalUnits(value, field);
  if (units < 0n || units > DECIMAL_SCALE) {
    throw new TypeError(`${field} must be between 0 and 1`);
  }
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  const quotient = absoluteNumerator / absoluteDenominator;
  const remainder = absoluteNumerator % absoluteDenominator;
  const rounded = remainder * 2n >= absoluteDenominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

export function multiplyDecimal(left: string, right: string): string {
  return formatUnits(
    divideRounded(decimalUnits(left, "left") * decimalUnits(right, "right"), DECIMAL_SCALE),
  );
}

export function addDecimals(values: readonly string[]): string {
  return formatUnits(values.reduce((sum, value) => sum + decimalUnits(value, "value"), 0n));
}

export function weightedDecimal(
  left: string,
  leftWeight: string,
  right: string,
  rightWeight: string,
): string {
  const numerator =
    decimalUnits(left, "left") * decimalUnits(leftWeight, "leftWeight") +
    decimalUnits(right, "right") * decimalUnits(rightWeight, "rightWeight");
  return formatUnits(divideRounded(numerator, DECIMAL_SCALE));
}

export function compareDecimal(left: string, right: string): number {
  const leftUnits = decimalUnits(left, "left");
  const rightUnits = decimalUnits(right, "right");
  return leftUnits < rightUnits ? -1 : leftUnits > rightUnits ? 1 : 0;
}

export function formatUnits(units: bigint): string {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const integer = absolute / DECIMAL_SCALE;
  const fraction = (absolute % DECIMAL_SCALE).toString().padStart(12, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
}

export function assertEnum<T extends string>(
  value: unknown,
  values: readonly T[],
  field: string,
): asserts value is T {
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
    throw new TypeError(`${field} is not a supported value`);
  }
}

export function assertUniqueStrings(
  values: unknown,
  field: string,
  validator: (value: unknown, field: string) => asserts value is string,
  allowEmpty = false,
): asserts values is string[] {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw new TypeError(`${field} must be ${allowEmpty ? "an" : "a non-empty"} array`);
  }
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    validator(value, `${field}[${index}]`);
    if (seen.has(value)) throw new TypeError(`${field} must contain unique values`);
    seen.add(value);
  }
}

const ADVICE_PATTERNS = [
  /^\s*(?:buy|sell|hold|invest|allocate)\b/i,
  /\b(?:we\s+)?recommend(?:s|ed|ing|ation)?\b/i,
  /\byou\s+(?:should|must|ought\s+to)\b/i,
  /\b(?:should|must)\s+(?:buy|sell|invest|allocate)\b/i,
  /\b(?:target|recommended)\s+(?:allocation|portfolio\s+weight)\b/i,
  /\bguaranteed\s+returns?\b/i,
] as const;

export function assertResearchNarrative(value: unknown, field: string, maximum = 2_000): void {
  assertNonBlank(value, field, maximum);
  if (ADVICE_PATTERNS.some((pattern) => pattern.test(value))) {
    throw new TypeError(`${field} contains prohibited investment-advice language`);
  }
}
