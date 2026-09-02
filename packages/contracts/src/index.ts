export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type OrganizationId = Brand<string, "OrganizationId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type SubjectId = Brand<string, "SubjectId">;
export type TraceId = Brand<string, "TraceId">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function brandedId<Name extends string>(value: string, name: Name): Brand<string, Name> {
  if (!UUID.test(value)) throw new TypeError(`${name} must be a UUID`);
  return value as Brand<string, Name>;
}

export const organizationId = (value: string): OrganizationId => brandedId(value, "OrganizationId");
export const workspaceId = (value: string): WorkspaceId => brandedId(value, "WorkspaceId");
export const subjectId = (value: string): SubjectId => brandedId(value, "SubjectId");
export const traceId = (value: string): TraceId => {
  if (!/^[0-9a-f]{32}$/.test(value) || value === "0".repeat(32)) {
    throw new TypeError("TraceId must be a non-zero lowercase W3C trace identifier");
  }
  return value as TraceId;
};

export const DATA_CLASSES = [
  "observed",
  "estimated",
  "forecast",
  "scenario",
  "synthetic_demo",
  "synthetic_research",
  "unknown",
] as const;
export type DataClass = (typeof DATA_CLASSES)[number];

export const CLASSIFICATIONS = ["public", "internal", "confidential", "restricted"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export interface Principal {
  readonly subjectId: SubjectId;
  readonly organizationId: OrganizationId;
  readonly workspaceIds: readonly WorkspaceId[];
  readonly scopes: readonly string[];
  readonly authenticationMethod: "oidc" | "service";
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface ResourceContext {
  readonly organizationId: OrganizationId;
  readonly workspaceId?: WorkspaceId;
  readonly classification: Classification;
  readonly ownerSubjectId?: SubjectId;
  readonly modelStatus?: "draft" | "research" | "validated" | "production" | "retired";
  readonly jurisdiction?: string;
}

export interface ProblemField {
  readonly path: string;
  readonly code: string;
}

export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly instance?: string;
  readonly traceId?: string;
  readonly errors?: readonly ProblemField[];
}

export class DomainProblem extends Error {
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail);
    this.name = "DomainProblem";
    this.problem = Object.freeze({ ...problem });
  }
}

export interface AuditEvent {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly workspaceId?: WorkspaceId;
  readonly actorSubjectId: SubjectId;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId?: string;
  readonly decision: "allow" | "deny" | "not_applicable";
  readonly reasonCode: string;
  readonly occurredAt: string;
  readonly traceId: TraceId;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface PointInTimeContext {
  readonly knownAt: string;
  readonly systemAt?: string;
  readonly policy: "true_vintage" | "reconstructed" | "latest_revised";
}

export function assertIsoInstant(value: string, field: string): string {
  const match =
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d{1,9})?Z$/.exec(
      value,
    );
  if (!match?.groups) {
    throw new TypeError(`${field} must be an RFC 3339 UTC instant`);
  }
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
    throw new TypeError(`${field} is not a valid instant`);
  }
  return value;
}

export function assertPointInTimeContext(value: PointInTimeContext): PointInTimeContext {
  assertIsoInstant(value.knownAt, "knownAt");
  if (value.systemAt !== undefined) assertIsoInstant(value.systemAt, "systemAt");
  if (value.policy === "latest_revised" && value.systemAt !== undefined) {
    throw new TypeError("latest_revised cannot claim a historical system-time replay");
  }
  return Object.freeze({ ...value });
}

export function isProductionDataClass(value: DataClass): boolean {
  return value !== "synthetic_demo" && value !== "synthetic_research";
}
