import { createHash } from "node:crypto";
import { assertIsoInstant } from "@economyos/contracts";

export function text(value: string, field: string, maximum = 2000): void {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > maximum
  )
    throw new TypeError(`${field} must be bounded, trimmed, nonempty text`);
}
export function keys(value: object, expected: readonly string[]): void {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new TypeError("Expected a plain object");
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort()))
    throw new TypeError(`Expected exactly these fields: ${expected.join(", ")}`);
}
export function enumeration<T extends string>(
  value: T,
  values: readonly string[],
  field: string,
): void {
  if (!values.includes(value)) throw new TypeError(`${field} is not registered`);
}
export function texts(values: readonly string[], field: string, min = 1, max = 100): void {
  if (!Array.isArray(values) || values.length < min || values.length > max)
    throw new TypeError(`${field} has invalid length`);
  for (const value of values) text(value, field);
  if (new Set(values).size !== values.length) throw new TypeError(`${field} must be unique`);
}
export function uuid(value: string): void {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  )
    throw new TypeError("Expected lowercase UUID");
}
export function hash(value: string): void {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value))
    throw new TypeError("Expected SHA-256");
}
export function instant(value: string): bigint {
  assertIsoInstant(value, "instant");
  const whole = value.slice(0, 19);
  const fraction = value.slice(19, -1).replace(/^\./, "");
  return BigInt(Date.parse(`${whole}Z`)) * 1_000_000n + BigInt(fraction.padEnd(9, "0"));
}
export function integer(value: number, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new TypeError("Integer outside resource bounds");
}
export const SCALE = 1_000_000_000_000n;
export function decimalUnits(value: string): bigint {
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,12})?$/.test(value))
    throw new TypeError("Expected decimal text with at most 12 integer and 12 fractional digits");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  return (negative ? -1n : 1n) * (BigInt(whole ?? "0") * SCALE + BigInt(fraction.padEnd(12, "0")));
}
export function decimal(value: string, min = -1e12, max = 1e12): number {
  const units = decimalUnits(value);
  const result = Number(units) / Number(SCALE);
  if (result < min || result > max) throw new TypeError("Decimal outside model bounds");
  return result;
}
export function numericOutput(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e12)
    throw new TypeError("Model output exceeds finite numerical envelope");
  const output = value.toFixed(12).replace(/\.?0+$/, "") || "0";
  return output === "-0" ? "0" : output;
}
function canonical(value: unknown, depth = 0): unknown {
  if (depth > 30) throw new TypeError("Manifest nesting exceeds bounds");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => canonical(item, depth + 1));
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => [key, canonical(child, depth + 1)]),
    );
  throw new TypeError("Manifest contains unsupported data");
}
export function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
export function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export function seal<T extends object>(value: T): T & { readonly manifestSha256: string } {
  const copy = canonical(value) as T;
  return freeze({ ...copy, manifestSha256: digest(copy) });
}
export function integrity<T extends { readonly manifestSha256: string }>(
  value: T,
): Omit<T, "manifestSha256"> {
  const { manifestSha256, ...body } = value;
  hash(manifestSha256);
  if (digest(body) !== manifestSha256)
    throw new TypeError("Behavioral manifest integrity mismatch");
  return body;
}
export interface BehavioralScope {
  readonly organizationId: string;
  readonly workspaceId: string;
}
export function scope(value: BehavioralScope): void {
  keys(value, ["organizationId", "workspaceId"]);
  uuid(value.organizationId);
  uuid(value.workspaceId);
}
export function sameScope(left: BehavioralScope, right: BehavioralScope): void {
  uuid(left.organizationId);
  uuid(left.workspaceId);
  uuid(right.organizationId);
  uuid(right.workspaceId);
  if (left.organizationId !== right.organizationId || left.workspaceId !== right.workspaceId)
    throw new TypeError("Behavioral resource is outside requested scope");
}
