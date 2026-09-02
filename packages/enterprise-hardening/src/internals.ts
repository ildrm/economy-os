import { createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const KEY = /^[a-z][a-z0-9_.-]{1,126}[a-z0-9]$/;

export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json };

export function record<T>(value: T, field: string): asserts value is T & Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${field} must be a plain record`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${field} must be a plain record`);
  }
}

export function exact(
  value: Record<string, unknown>,
  keys: readonly string[],
  field: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${field} contains missing or unknown fields`);
  }
}

export function uuid(value: string, field: string): void {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new TypeError(`${field} must be a lowercase UUID`);
  }
}

export function sha(value: string, field: string): void {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new TypeError(`${field} must be a lowercase SHA-256`);
  }
}

export function key(value: string, field: string): void {
  if (typeof value !== "string" || !KEY.test(value)) {
    throw new TypeError(`${field} must be a canonical key`);
  }
}

export function text(value: string, field: string, maximum = 2_000): void {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maximum
  ) {
    throw new TypeError(`${field} must be nonblank, trimmed, and at most ${maximum} characters`);
  }
}

export function instant(value: string, field: string): void {
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be a real canonical UTC instant`);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  if (!match) throw new TypeError(`${field} must be a real canonical UTC instant`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  parsed.setUTCHours(hour, minute, second, 0);
  if (
    year < 1 ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second
  ) {
    throw new TypeError(`${field} must be a real canonical UTC instant`);
  }
}

export function integer(value: number, field: string, minimum: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} must be an integer from ${minimum} through ${maximum}`);
  }
}

export function oneOf<T extends string>(
  value: string,
  values: readonly T[],
  field: string,
): asserts value is T {
  if (!values.includes(value as T)) throw new TypeError(`${field} is unsupported`);
}

export function strings(
  values: readonly string[],
  field: string,
  minimum: number,
  maximum: number,
  validate: (value: string, field: string) => void = text,
): void {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum) {
    throw new TypeError(`${field} must contain ${minimum}..${maximum} items`);
  }
  const seen = new Set<string>();
  values.forEach((value, index) => {
    validate(value, `${field}[${index}]`);
    if (seen.has(value)) throw new TypeError(`${field} contains duplicate items`);
    seen.add(value);
  });
}

export function httpsOrUrn(value: string, field: string): void {
  text(value, field, 1_000);
  if (/^urn:evidence:[a-z0-9][a-z0-9._:-]{0,499}$/.test(value)) return;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${field} must be HTTPS or an evidence URN`);
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    throw new TypeError(`${field} must be HTTPS or an evidence URN`);
  }
}

function canonical(value: unknown, path: string, seen: WeakSet<object>): string {
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
      if (Object.keys(value).length !== value.length) {
        throw new TypeError(`${path} contains a sparse or decorated array`);
      }
      return `[${value.map((item, index) => canonical(item, `${path}[${index}]`, seen)).join(",")}]`;
    }
    record(value, path);
    return `{${Object.keys(value)
      .sort()
      .map((name) => `${JSON.stringify(name)}:${canonical(value[name], `${path}.${name}`, seen)}`)
      .join(",")}}`;
  } finally {
    seen.delete(value);
  }
}

export function digest(value: unknown): string {
  return createHash("sha256")
    .update(canonical(value, "value", new WeakSet()))
    .digest("hex");
}

export function clone<T>(value: T): T {
  return JSON.parse(canonical(value, "value", new WeakSet())) as T;
}

export function freeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
}

export type Manifest<T extends object> = Readonly<T & { readonly manifestSha256: string }>;

export function manifest<T extends object>(input: T): Manifest<T> {
  const body = clone(input);
  return freeze({ ...body, manifestSha256: digest(body) });
}

export function integrity<T extends object>(
  value: T & { readonly manifestSha256: string },
  field: string,
): void {
  sha(value.manifestSha256, `${field}.manifestSha256`);
  const { manifestSha256, ...body } = value;
  if (digest(body) !== manifestSha256)
    throw new TypeError(`${field} digest does not match content`);
}

export function milliseconds(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

export function secondsCeil(left: string, right: string): number {
  return Math.max(0, Math.ceil(milliseconds(left, right) / 1_000));
}
