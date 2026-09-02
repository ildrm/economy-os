import { createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_INSTANT =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d{1,3}))?Z$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const KEY = /^[a-z][a-z0-9_.-]{0,127}$/;
const CANONICAL_PROBABILITY = /^(?:0(?:\.\d*[1-9])?|1)$/;

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

export function deterministicUuid(...parts: readonly string[]): string {
  const hash = createHash("sha256");
  if (parts.length === 0 || parts.some((part) => part.length === 0)) {
    throw new TypeError("deterministic UUID parts must be non-empty");
  }
  for (const part of parts) {
    const bytes = Buffer.from(part, "utf8");
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(bytes.byteLength);
    hash.update(length);
    hash.update(bytes);
  }
  const bytes = hash.digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function assertUuid(value: string, field: string): void {
  if (!UUID.test(value)) throw new TypeError(`${field} must be a lowercase UUID`);
}

export function assertSha256(value: string, field: string): void {
  if (!SHA256.test(value)) throw new TypeError(`${field} must be a lowercase SHA-256 digest`);
}

export function assertIsoInstant(value: string, field: string): void {
  const match = ISO_INSTANT.exec(value);
  if (!match?.groups || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${field} must be a valid RFC 3339 UTC instant`);
  }
  const parsed = new Date(value);
  const normalizedFraction = (match.groups.fraction ?? "").padEnd(3, "0");
  const normalizedInput = `${value.slice(0, 19)}.${normalizedFraction}Z`;
  if (normalizedInput !== parsed.toISOString()) {
    throw new TypeError(`${field} must be a valid RFC 3339 UTC instant`);
  }
}

export function assertSemver(value: string, field: string): void {
  if (!SEMVER.test(value)) throw new TypeError(`${field} must be a semantic version`);
}

export function assertKey(value: string, field: string): void {
  if (!KEY.test(value)) throw new TypeError(`${field} must be a stable lowercase key`);
}

export function assertNonBlank(value: string, field: string, maximum = 2_000): void {
  if (value.trim() !== value || value.length === 0 || value.length > maximum) {
    throw new TypeError(`${field} must be a non-blank trimmed string`);
  }
}

export function assertProbability(value: string, field: string): void {
  if (!CANONICAL_PROBABILITY.test(value) || decimalPlaces(value) > 12) {
    throw new TypeError(`${field} must be a canonical probability between 0 and 1`);
  }
}

export function compareProbability(left: string, right: string): number {
  const a = probabilityUnits(left);
  const b = probabilityUnits(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function probabilityUnits(value: string): bigint {
  assertProbability(value, "probability");
  const [integer = "0", fraction = ""] = value.split(".");
  return BigInt(integer) * 1_000_000_000_000n + BigInt(fraction.padEnd(12, "0") || "0");
}

function decimalPlaces(value: string): number {
  return value.includes(".") ? (value.split(".")[1]?.length ?? 0) : 0;
}

export function formatScaled(value: bigint, scale: bigint, signed = false): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const integer = absolute / scale;
  const fractionalWidth = scale.toString().length - 1;
  const fraction = (absolute % scale).toString().padStart(fractionalWidth, "0").replace(/0+$/, "");
  const sign = negative ? "-" : signed && value > 0n ? "+" : "";
  return `${sign}${integer.toString()}${fraction ? `.${fraction}` : ""}`;
}

export function formatMetric(value: number): string {
  if (!Number.isFinite(value)) throw new TypeError("metric must be finite");
  const normalized = Math.abs(value) < 0.0000000000005 ? 0 : value;
  return normalized
    .toFixed(12)
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function cloneCanonical<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}

export function compareInstant(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

export function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError(`${field} must be a positive integer`);
}
