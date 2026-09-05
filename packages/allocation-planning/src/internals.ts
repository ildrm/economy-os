import { createHash } from "node:crypto";

export function text(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim() !== value || !value || value.length > 2000)
    throw new TypeError(`${field} must be bounded nonblank text`);
}
export function keys(value: unknown, expected: readonly string[]): void {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new TypeError("Expected plain object");
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort()))
    throw new TypeError("Missing or unknown fields");
}
export function oneOf<T extends string>(value: unknown, choices: readonly T[]): asserts value is T {
  if (typeof value !== "string" || !choices.includes(value as T))
    throw new TypeError("Unknown enumeration value");
}
export function list(value: unknown, maximum = 1000): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new TypeError("Expected bounded array");
}
export function unique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) throw new TypeError("Duplicate identifiers");
}
export function instant(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new TypeError("Expected UTC instant with millisecond precision at most");
  if (
    new Date(value).toISOString() !==
    `${value.slice(0, 19)}.${(value.split(".")[1]?.slice(0, -1) ?? "").padEnd(3, "0")}Z`
  )
    throw new TypeError("Invalid calendar instant");
}
export function hash(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    throw new TypeError("Expected SHA-256");
}
export function freeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export function canonical(value: unknown, depth = 0): string {
  if (depth > 30) throw new TypeError("Artifact nesting exceeds resource bounds");
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item, depth + 1)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    keys(value, Object.keys(value));
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key], depth + 1)}`)
      .join(",")}}`;
  }
  throw new TypeError("Expected canonical JSON");
}
export function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function artifact<T>(value: T): Readonly<T & { manifestSha256: string }> {
  const body = JSON.parse(canonical(value)) as T;
  return freeze({ ...body, manifestSha256: digest(body) });
}
export function integrity(value: { readonly manifestSha256: string }): void {
  hash(value.manifestSha256);
  const { manifestSha256, ...body } = value;
  if (digest(body) !== manifestSha256) throw new TypeError("Artifact integrity failure");
}

/** Exact rational arithmetic. Decimal inputs are bounded to 32 digits and 12 places. */
export interface ExactRatio {
  readonly numerator: string;
  readonly denominator: string;
}
export interface Rational {
  readonly n: bigint;
  readonly d: bigint;
}
function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a < 0n ? -a : a;
}
export function rational(n: bigint, d = 1n): Rational {
  if (d === 0n) throw new TypeError("Zero denominator");
  const divisor = gcd(n, d) * (d < 0n ? -1n : 1n);
  return { n: n / divisor, d: d / divisor };
}
export function decimal(value: unknown, nonnegative = true): Rational {
  if (
    typeof value !== "string" ||
    value.length > 32 ||
    !/^-?(?:0|[1-9]\d*)(?:\.\d{0,11}[1-9])?$/.test(value) ||
    value === "-0"
  )
    throw new TypeError("Expected canonical decimal with at most 12 places");
  const [integer = "0", fraction = ""] = value.split(".");
  const denominator = 10n ** BigInt(fraction.length);
  const numerator =
    BigInt(integer) * denominator + BigInt(fraction || "0") * (value.startsWith("-") ? -1n : 1n);
  if (nonnegative && numerator < 0n) throw new TypeError("Expected nonnegative quantity");
  return rational(numerator, denominator);
}
export const add = (a: Rational, b: Rational): Rational =>
  rational(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Rational, b: Rational): Rational =>
  rational(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Rational, b: Rational): Rational => rational(a.n * b.n, a.d * b.d);
export const div = (a: Rational, b: Rational): Rational => rational(a.n * b.d, a.d * b.n);
export const cmp = (a: Rational, b: Rational): number =>
  a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
export const ratio = (value: Rational): ExactRatio => ({
  numerator: String(value.n),
  denominator: String(value.d),
});
export const zero = rational(0n);
export const one = rational(1n);
export function probability(value: unknown): Rational {
  const result = decimal(value);
  if (cmp(result, one) > 0) throw new TypeError("Probability exceeds one");
  return result;
}
export function format(value: Rational): string {
  let d = value.d;
  let twos = 0;
  let fives = 0;
  while (d % 2n === 0n) {
    d /= 2n;
    twos++;
  }
  while (d % 5n === 0n) {
    d /= 5n;
    fives++;
  }
  if (d !== 1n) throw new TypeError("Nonterminating decimal requires exact ratio output");
  const places = Math.max(twos, fives);
  const units = value.n * (10n ** BigInt(places) / value.d);
  const digits = (units < 0n ? -units : units).toString().padStart(places + 1, "0");
  return `${units < 0n ? "-" : ""}${places ? `${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/\.?0+$/, "") : digits}`;
}
