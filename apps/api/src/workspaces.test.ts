import { organizationId, type Principal, subjectId, workspaceId } from "@economyos/contracts";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceAccessService, type WorkspaceMembershipPort } from "./workspaces.js";

const allowed = "018f47ac-19fc-7c92-ae91-0242ac120004";
const denied = "018f47ac-19fc-7c92-ae91-0242ac120005";
const principal: Principal = {
  subjectId: subjectId("018f47ac-19fc-7c92-ae91-0242ac120006"),
  organizationId: organizationId("018f47ac-19fc-7c92-ae91-0242ac120002"),
  workspaceIds: [workspaceId(allowed)],
  scopes: [],
  authenticationMethod: "oidc",
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-01T01:00:00.000Z",
};

describe("workspace access", () => {
  const memberships: WorkspaceMembershipPort = {
    loadActiveContext: vi.fn(async () => ({
      identityActive: true,
      workspaceIds: [workspaceId(allowed)],
    })),
  };
  const service = new WorkspaceAccessService(memberships);

  it("requires a workspace in both authenticated claims and the active database state", async () => {
    await expect(service.assertMembership(principal, allowed)).resolves.toBe(allowed);
  });

  it("does not treat a JWT workspace claim as proof of membership", async () => {
    const noDatabaseMembership = new WorkspaceAccessService({
      loadActiveContext: async () => ({ identityActive: true, workspaceIds: [] }),
    });
    await expect(noDatabaseMembership.assertMembership(principal, allowed)).rejects.toThrow(
      "Forbidden",
    );
  });

  it("does not expand token authority from database memberships absent from claims", async () => {
    const databaseHasForeignMembership = new WorkspaceAccessService({
      loadActiveContext: async () => ({
        identityActive: true,
        workspaceIds: [workspaceId(denied)],
      }),
    });
    await expect(databaseHasForeignMembership.assertMembership(principal, denied)).rejects.toThrow(
      "Forbidden",
    );
  });

  it("uses the same non-enumerating denial for invalid and foreign IDs", async () => {
    await expect(service.assertMembership(principal, denied)).rejects.toThrow("Forbidden");
    await expect(service.assertMembership(principal, "not-an-id")).rejects.toThrow("Forbidden");
  });

  it("reconciles exposed workspace context with active database memberships", async () => {
    await expect(service.reconcilePrincipal(principal)).resolves.toMatchObject({
      workspaceIds: [allowed],
    });
    const inactive = new WorkspaceAccessService({
      loadActiveContext: async () => ({
        identityActive: false,
        workspaceIds: [workspaceId(allowed)],
      }),
    });
    await expect(inactive.reconcilePrincipal(principal)).rejects.toThrow("Forbidden");
  });
});
