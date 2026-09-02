import { createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const KEY = /^[a-z][a-z0-9_.-]{0,127}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const EXACT_DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/;
const PROBABILITY = /^(?:0(?:\.\d*[1-9])?|1)$/;
const ISO_INSTANT =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d{1,3}))?Z$/;

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

function normalizeJson(value: unknown, path: string, seen: Set<object>): CanonicalJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw new TypeError(
        `${path} contains a non-safe-integer number; exact decimals must be strings`,
      );
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
    const output = Object.create(null) as Record<string, CanonicalJsonValue>;
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

export function assertRecord(
  value: unknown,
  field: string,
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw new TypeError(`${field} must be a plain object`);
  }
}

export function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  field: string,
): void {
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();
  if (
    actual.length !== canonicalExpected.length ||
    actual.some((key, index) => key !== canonicalExpected[index])
  ) {
    const extras = actual.filter((key) => !canonicalExpected.includes(key));
    const missing = canonicalExpected.filter((key) => !actual.includes(key));
    throw new TypeError(
      `${field} has invalid fields (extra: ${extras.join(",") || "none"}; missing: ${missing.join(",") || "none"})`,
    );
  }
}

export function expectString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new TypeError(`${field} must be a string`);
  return value;
}

export function expectNullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  return expectString(value, field);
}

export function expectInteger(value: unknown, field: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new TypeError(`${field} must be a safe integer >= ${minimum}`);
  }
  return value as number;
}

export function expectBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${field} must be a boolean`);
  return value;
}

export function expectArray(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  return value;
}

export function assertUuid(value: string, field: string): void {
  if (!UUID.test(value)) throw new TypeError(`${field} must be a lowercase UUID`);
}

export function assertSha256(value: string, field: string): void {
  if (!SHA256.test(value)) throw new TypeError(`${field} must be a lowercase SHA-256 digest`);
}

export function assertKey(value: string, field: string): void {
  if (!KEY.test(value)) throw new TypeError(`${field} must be a stable lowercase key`);
}

export function assertSemver(value: string, field: string): void {
  if (!SEMVER.test(value)) throw new TypeError(`${field} must be a semantic version`);
}

export function assertNonBlank(value: string, field: string, maximum = 2_000): void {
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

export function assertExactDecimal(value: string, field: string): void {
  if (!EXACT_DECIMAL.test(value) || decimalPlaces(value) > 12) {
    throw new TypeError(`${field} must be a canonical exact decimal with at most 12 places`);
  }
}

export function assertProbability(value: string, field: string): void {
  if (!PROBABILITY.test(value) || decimalPlaces(value) > 12) {
    throw new TypeError(`${field} must be a canonical probability between 0 and 1`);
  }
}

function decimalPlaces(value: string): number {
  return value.includes(".") ? (value.split(".")[1]?.length ?? 0) : 0;
}

export function compareInstant(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

export function isInHalfOpenWindow(at: string, from: string, until: string | null): boolean {
  return compareInstant(at, from) >= 0 && (until === null || compareInstant(at, until) < 0);
}

export function uniqueSortedStrings(
  values: readonly unknown[],
  field: string,
  validate: (value: string, field: string) => void,
  allowEmpty = true,
): readonly string[] {
  if (!allowEmpty && values.length === 0) throw new TypeError(`${field} must not be empty`);
  const normalized = values.map((value, index) => {
    const stringValue = expectString(value, `${field}[${index}]`);
    validate(stringValue, `${field}[${index}]`);
    return stringValue;
  });
  const unique = [...new Set(normalized)].sort();
  if (unique.length !== normalized.length)
    throw new TypeError(`${field} must not contain duplicates`);
  return unique;
}

export function tenantKey(organizationId: string, workspaceId: string): string {
  return `${organizationId}:${workspaceId}`;
}
