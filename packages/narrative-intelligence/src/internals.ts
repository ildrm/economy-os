import { createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const KEY = /^[a-z][a-z0-9_.-]{0,127}$/;
const BCP47 = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const LOCALE = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|-\d{3})?$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const PROBABILITY = /^(?:0(?:\.\d*[1-9])?|1)$/;
const EXACT_DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d{1,3}))?Z$/;

export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJson[]
  | { readonly [key: string]: CanonicalJson };

function normalize(value: unknown, path: string, seen: Set<object>): CanonicalJson {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || !Number.isFinite(value)) {
      throw new TypeError(`${path} contains a non-safe integer; exact decimals must be strings`);
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") throw new TypeError(`${path} is not canonical JSON`);
  if (seen.has(value)) throw new TypeError(`${path} contains a cycle`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => normalize(item, `${path}[${index}]`, seen));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain plain JSON objects`);
    }
    const output = Object.create(null) as Record<string, CanonicalJson>;
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      output[key] = normalize((value as Record<string, unknown>)[key], `${path}.${key}`, seen);
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value, "value", new Set()));
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function digestJson(value: unknown): string {
  return sha256Text(canonicalJson(value));
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

export function seal<T extends object>(
  value: T,
): Readonly<T & { readonly manifestSha256: string }> {
  const canonical = cloneCanonical(value);
  return deepFreeze({ ...canonical, manifestSha256: digestJson(canonical) });
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
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    const extras = actual.filter((key) => !wanted.includes(key));
    const missing = wanted.filter((key) => !actual.includes(key));
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

export function expectBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${field} must be a boolean`);
  return value;
}

export function expectInteger(value: unknown, field: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new TypeError(`${field} must be a safe integer >= ${minimum}`);
  }
  return value as number;
}

export function expectArray(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  return value;
}

export function enumValue<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
  field: string,
): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new TypeError(`${field} must be one of: ${values.join(", ")}`);
  }
  return value as Values[number];
}

export function literalOne(value: unknown, field: string): 1 {
  if (value !== 1) throw new TypeError(`${field} must be 1`);
  return 1;
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

export function assertLanguage(value: string, field: string): void {
  if (!BCP47.test(value)) throw new TypeError(`${field} must be a BCP 47 language tag`);
}

export function assertLocale(value: string, field: string): void {
  if (!LOCALE.test(value)) throw new TypeError(`${field} must be a normalized locale`);
}

export function assertNonBlank(value: string, field: string, maximum = 4_000): void {
  if (value.trim() !== value || value.length === 0 || value.length > maximum) {
    throw new TypeError(`${field} must be a non-blank trimmed string`);
  }
}

export function assertIsoInstant(value: string, field: string): void {
  const match = ISO_INSTANT.exec(value);
  if (!match?.groups || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${field} must be a valid RFC 3339 UTC instant`);
  }
  const milliseconds = (match.groups.fraction ?? "").padEnd(3, "0");
  if (`${value.slice(0, 19)}.${milliseconds}Z` !== new Date(value).toISOString()) {
    throw new TypeError(`${field} must be a valid RFC 3339 UTC instant`);
  }
}

export function assertIsoDate(value: string, field: string): void {
  if (
    !ISO_DATE.test(value) ||
    `${value}T00:00:00.000Z` !== new Date(`${value}T00:00:00Z`).toISOString()
  ) {
    throw new TypeError(`${field} must be a valid ISO date`);
  }
}

export function assertProbability(value: string, field: string): void {
  if (!PROBABILITY.test(value) || decimalPlaces(value) > 12) {
    throw new TypeError(`${field} must be a canonical probability between 0 and 1`);
  }
}

export function assertExactDecimal(value: string, field: string): void {
  if (!EXACT_DECIMAL.test(value) || decimalPlaces(value) > 12) {
    throw new TypeError(`${field} must be a canonical exact decimal with at most 12 places`);
  }
}

function decimalPlaces(value: string): number {
  return value.includes(".") ? (value.split(".")[1]?.length ?? 0) : 0;
}

export function compareInstant(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

export function boundedInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = expectInteger(value, field, minimum);
  if (parsed > maximum) throw new TypeError(`${field} must be <= ${maximum}`);
  return parsed;
}

export function uniqueSortedStrings(
  values: readonly unknown[],
  field: string,
  validate: (value: string, field: string) => void,
  allowEmpty = true,
): readonly string[] {
  if (!allowEmpty && values.length === 0) throw new TypeError(`${field} must not be empty`);
  const parsed = values.map((value, index) => {
    const item = expectString(value, `${field}[${index}]`);
    validate(item, `${field}[${index}]`);
    return item;
  });
  const unique = [...new Set(parsed)].sort();
  if (unique.length !== parsed.length) throw new TypeError(`${field} must not contain duplicates`);
  return unique;
}

export function tenantKey(organizationId: string, workspaceId: string): string {
  return `${organizationId}:${workspaceId}`;
}

export function assertSameTenant(
  expected: { readonly organizationId: string; readonly workspaceId: string },
  actual: { readonly organizationId: string; readonly workspaceId: string },
  field: string,
): void {
  if (
    expected.organizationId !== actual.organizationId ||
    expected.workspaceId !== actual.workspaceId
  ) {
    throw new TypeError(`${field} crosses organization or workspace boundaries`);
  }
}

export function parseTenant(
  value: Record<string, unknown>,
  field: string,
): {
  readonly organizationId: string;
  readonly workspaceId: string;
} {
  const organizationId = expectString(value.organizationId, `${field}.organizationId`);
  const workspaceId = expectString(value.workspaceId, `${field}.workspaceId`);
  assertUuid(organizationId, `${field}.organizationId`);
  assertUuid(workspaceId, `${field}.workspaceId`);
  return { organizationId, workspaceId };
}

export function verifyManifest(
  value: Record<string, unknown>,
  manifestSha256: string,
  field: string,
): void {
  assertSha256(manifestSha256, `${field}.manifestSha256`);
  const unsigned = { ...value };
  delete unsigned.manifestSha256;
  if (digestJson(unsigned) !== manifestSha256) {
    throw new TypeError(`${field} manifest digest does not match its content`);
  }
}
