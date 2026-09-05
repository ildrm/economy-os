import type {
  Classification,
  Principal,
  ResourceContext,
  SubjectId,
  WorkspaceId,
} from "@economyos/contracts";

export interface Grant {
  readonly subjectId: SubjectId;
  readonly action: string;
  readonly resourceType: string;
  readonly workspaceId?: WorkspaceId;
  readonly maximumClassification?: Classification;
  readonly expiresAt?: string;
}

export interface EntitlementSnapshot {
  readonly capabilities: ReadonlySet<string>;
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly version: string;
}

export interface AuthorizationRequest {
  readonly principal: Principal;
  readonly action: string;
  readonly resourceType: string;
  readonly resource: ResourceContext;
  readonly requiredCapability?: string;
  readonly at: string;
}

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly code:
    | "ALLOW"
    | "TENANT_MISMATCH"
    | "WORKSPACE_MISMATCH"
    | "NO_GRANT"
    | "CLASSIFICATION_DENIED"
    | "ENTITLEMENT_MISSING"
    | "GRANT_EXPIRED"
    | "ENTITLEMENT_INACTIVE"
    | "PRINCIPAL_INACTIVE"
    | "INPUT_INVALID";
  readonly grant?: Grant;
  readonly policyVersion: "foundation-1";
}

const classificationRank: Readonly<Record<Classification, number>> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

function matches(pattern: string, value: string): boolean {
  return (
    pattern === "*" ||
    pattern === value ||
    (pattern.endsWith(".*") && value.startsWith(pattern.slice(0, -1)))
  );
}

function parseInstant(value: string): bigint | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  if (!match) return undefined;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > (daysInMonth[month - 1] ?? 0) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return undefined;
  }
  const parseable = fraction ? `${value.slice(0, value.indexOf("."))}Z` : value;
  const parsed = Date.parse(parseable);
  return Number.isFinite(parsed)
    ? BigInt(parsed) * 1_000_000n + BigInt((fraction ?? "0").padEnd(9, "0"))
    : undefined;
}

export function authorize(
  request: AuthorizationRequest,
  grants: readonly Grant[],
  entitlement?: EntitlementSnapshot,
): AuthorizationDecision {
  const deny = (code: Exclude<AuthorizationDecision["code"], "ALLOW">): AuthorizationDecision => ({
    allowed: false,
    code,
    policyVersion: "foundation-1",
  });

  const at = parseInstant(request.at);
  const principalIssuedAt = parseInstant(request.principal.issuedAt);
  const principalExpiresAt = parseInstant(request.principal.expiresAt);
  if (
    at === undefined ||
    principalIssuedAt === undefined ||
    principalExpiresAt === undefined ||
    principalExpiresAt <= principalIssuedAt ||
    !Object.hasOwn(classificationRank, request.resource.classification)
  ) {
    return deny("INPUT_INVALID");
  }
  if (at < principalIssuedAt || at >= principalExpiresAt) return deny("PRINCIPAL_INACTIVE");

  const grantExpiries = new Map<Grant, bigint | undefined>();
  for (const grant of grants) {
    if (
      grant.maximumClassification !== undefined &&
      !Object.hasOwn(classificationRank, grant.maximumClassification)
    ) {
      return deny("INPUT_INVALID");
    }
    if (grant.expiresAt !== undefined) {
      const expiresAt = parseInstant(grant.expiresAt);
      if (expiresAt === undefined) return deny("INPUT_INVALID");
      grantExpiries.set(grant, expiresAt);
    }
  }

  let entitlementEffectiveFrom: bigint | undefined;
  let entitlementEffectiveUntil: bigint | undefined;
  if (entitlement !== undefined) {
    entitlementEffectiveFrom = parseInstant(entitlement.effectiveFrom);
    if (entitlementEffectiveFrom === undefined) return deny("INPUT_INVALID");
    if (entitlement.effectiveUntil !== undefined) {
      entitlementEffectiveUntil = parseInstant(entitlement.effectiveUntil);
      if (
        entitlementEffectiveUntil === undefined ||
        entitlementEffectiveUntil <= entitlementEffectiveFrom
      ) {
        return deny("INPUT_INVALID");
      }
    }
  }

  if (request.principal.organizationId !== request.resource.organizationId) {
    return deny("TENANT_MISMATCH");
  }
  if (
    request.resource.workspaceId !== undefined &&
    !request.principal.workspaceIds.includes(request.resource.workspaceId)
  ) {
    return deny("WORKSPACE_MISMATCH");
  }
  if (request.requiredCapability !== undefined) {
    if (!entitlement?.capabilities.has(request.requiredCapability))
      return deny("ENTITLEMENT_MISSING");
    if (
      entitlementEffectiveFrom === undefined ||
      at < entitlementEffectiveFrom ||
      (entitlementEffectiveUntil !== undefined && at >= entitlementEffectiveUntil)
    ) {
      return deny("ENTITLEMENT_INACTIVE");
    }
  }

  const candidates = grants.filter(
    (grant) =>
      grant.subjectId === request.principal.subjectId &&
      matches(grant.action, request.action) &&
      matches(grant.resourceType, request.resourceType) &&
      (grant.workspaceId === undefined || grant.workspaceId === request.resource.workspaceId),
  );
  if (candidates.length === 0) return deny("NO_GRANT");
  const unexpired = candidates.filter((grant) => {
    const expiresAt = grantExpiries.get(grant);
    return expiresAt === undefined || at < expiresAt;
  });
  if (unexpired.length === 0) return deny("GRANT_EXPIRED");
  const requestedRank = classificationRank[request.resource.classification];
  const candidate = unexpired.find(
    (grant) =>
      grant.maximumClassification === undefined ||
      requestedRank <= classificationRank[grant.maximumClassification],
  );
  if (!candidate) return deny("CLASSIFICATION_DENIED");
  return { allowed: true, code: "ALLOW", grant: candidate, policyVersion: "foundation-1" };
}
