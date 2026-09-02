import { organizationId, type Principal, subjectId, workspaceId } from "@economyos/contracts";
import { describe, expect, it } from "vitest";
import { authorize, type Grant } from "./policy.js";

const orgA = organizationId("018f47ac-19fc-7c92-ae91-0242ac120002");
const orgB = organizationId("018f47ac-19fc-7c92-ae91-0242ac120003");
const workspaceA = workspaceId("018f47ac-19fc-7c92-ae91-0242ac120004");
const workspaceB = workspaceId("018f47ac-19fc-7c92-ae91-0242ac120005");
const subject = subjectId("018f47ac-19fc-7c92-ae91-0242ac120006");
const principal: Principal = {
  subjectId: subject,
  organizationId: orgA,
  workspaceIds: [workspaceA],
  scopes: [],
  authenticationMethod: "oidc",
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-01T01:00:00.000Z",
};
const baseGrant: Grant = {
  subjectId: subject,
  action: "observation.*",
  resourceType: "observation",
  workspaceId: workspaceA,
  maximumClassification: "confidential",
};
const grants: Grant[] = [baseGrant];

describe("authorization policy", () => {
  const request = {
    principal,
    action: "observation.read",
    resourceType: "observation",
    resource: {
      organizationId: orgA,
      workspaceId: workspaceA,
      classification: "internal" as const,
    },
    requiredCapability: "observation.read",
    at: "2026-01-01T00:30:00Z",
  };
  const entitlement = {
    capabilities: new Set(["observation.read"]),
    effectiveFrom: "2025-01-01T00:00:00Z",
    version: "contract-1",
  };

  it("allows the exact tenant, workspace, grant, classification, and entitlement", () => {
    expect(authorize(request, grants, entitlement)).toMatchObject({ allowed: true, code: "ALLOW" });
  });

  it("denies another organization before considering grants", () => {
    expect(
      authorize(
        { ...request, resource: { ...request.resource, organizationId: orgB } },
        grants,
        entitlement,
      ),
    ).toMatchObject({ allowed: false, code: "TENANT_MISMATCH" });
  });

  it("denies a workspace not in the authenticated principal", () => {
    expect(
      authorize(
        { ...request, resource: { ...request.resource, workspaceId: workspaceB } },
        grants,
        entitlement,
      ),
    ).toMatchObject({ allowed: false, code: "WORKSPACE_MISMATCH" });
  });

  it("keeps commercial capability separate from role grants", () => {
    expect(authorize(request, grants)).toMatchObject({
      allowed: false,
      code: "ENTITLEMENT_MISSING",
    });
    expect(
      authorize(
        { ...request, resource: { ...request.resource, classification: "restricted" } },
        grants,
        entitlement,
      ),
    ).toMatchObject({ allowed: false, code: "CLASSIFICATION_DENIED" });
  });

  it("denies absent and expired grants and inactive contracts", () => {
    expect(authorize(request, [], entitlement)).toMatchObject({ allowed: false, code: "NO_GRANT" });
    expect(
      authorize(request, [{ ...baseGrant, expiresAt: "2026-01-01T00:15:00Z" }], entitlement),
    ).toMatchObject({ allowed: false, code: "GRANT_EXPIRED" });
    expect(
      authorize(request, grants, { ...entitlement, effectiveFrom: "2026-02-01T00:00:00Z" }),
    ).toMatchObject({ allowed: false, code: "ENTITLEMENT_INACTIVE" });
  });

  it("denies a request evaluated outside the authenticated principal lifetime", () => {
    expect(
      authorize({ ...request, at: "2025-12-31T23:59:59Z" }, grants, entitlement),
    ).toMatchObject({ allowed: false, code: "PRINCIPAL_INACTIVE" });
    expect(authorize({ ...request, at: principal.expiresAt }, grants, entitlement)).toMatchObject({
      allowed: false,
      code: "PRINCIPAL_INACTIVE",
    });
  });

  it("fails closed on malformed policy instants", () => {
    expect(authorize({ ...request, at: "not-an-instant" }, grants, entitlement)).toMatchObject({
      allowed: false,
      code: "INPUT_INVALID",
    });
    expect(
      authorize({ ...request, at: "2026-02-30T00:30:00Z" }, grants, entitlement),
    ).toMatchObject({ allowed: false, code: "INPUT_INVALID" });
    expect(
      authorize(request, [{ ...baseGrant, expiresAt: "tomorrow" }], entitlement),
    ).toMatchObject({ allowed: false, code: "INPUT_INVALID" });
    expect(
      authorize(request, grants, { ...entitlement, effectiveFrom: "2026-01-01" }),
    ).toMatchObject({ allowed: false, code: "INPUT_INVALID" });
    expect(
      authorize(request, grants, {
        ...entitlement,
        effectiveUntil: "2024-01-01T00:00:00Z",
      }),
    ).toMatchObject({ allowed: false, code: "INPUT_INVALID" });
    expect(
      authorize(
        {
          ...request,
          principal: { ...principal, expiresAt: "invalid" },
        },
        grants,
        entitlement,
      ),
    ).toMatchObject({ allowed: false, code: "INPUT_INVALID" });
  });

  it("selects a valid grant even when an earlier matching grant is unusable", () => {
    const expired = { ...baseGrant, expiresAt: "2026-01-01T00:15:00Z" };
    const restricted = { ...baseGrant, maximumClassification: "public" as const };
    expect(authorize(request, [expired, baseGrant], entitlement)).toMatchObject({
      allowed: true,
      grant: baseGrant,
    });
    expect(authorize(request, [restricted, baseGrant], entitlement)).toMatchObject({
      allowed: true,
      grant: baseGrant,
    });
  });
});
