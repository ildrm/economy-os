import { describe, expect, it } from "vitest";
import {
  assertSharedWorkspaceIntegrity,
  authorizeApiCredential,
  authorizeWorkspaceAction,
  type CollaborationEvent,
  CollaborationLedger,
  createApiCredential,
  createMembershipPolicy,
  createSharedWorkspace,
} from "./collaboration.js";
import {
  ARTIFACT,
  authorization,
  CITATION,
  IDS,
  policyWith,
  TIMES,
} from "./fixtures.test-helper.js";
import { chainedEvent, sha256Text } from "./internals.js";

const CREDENTIAL_SECRET = "test-only-api-credential-secret-material";

describe("workspace and authorization policy", () => {
  it("creates a deterministic immutable workspace manifest", () => {
    const input = {
      workspaceId: IDS.workspace,
      organizationId: IDS.organization,
      name: "Macro research",
      visibility: "workspace_private" as const,
      classification: "confidential" as const,
      createdBy: IDS.owner,
      createdAt: TIMES.issue,
    };
    const first = createSharedWorkspace(input);
    const second = createSharedWorkspace({ ...input });
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(() => assertSharedWorkspaceIntegrity(first)).not.toThrow();
    expect(() => createSharedWorkspace({ ...input, surprise: true } as never)).toThrow(/exactly/);
    expect(() => createSharedWorkspace({ ...input, visibility: "public" } as never)).toThrow(
      /visibility/,
    );
    expect(() => createSharedWorkspace({ ...input, classification: "secret" } as never)).toThrow(
      /classification/,
    );
    expect(() => createSharedWorkspace({ ...input, createdAt: "not-a-time" })).toThrow(/instant/);
    expect(() => assertSharedWorkspaceIntegrity({ ...first, name: "Changed" })).toThrow(/match/);
  });

  it("normalizes membership order and rejects unsafe histories", () => {
    const policy = policyWith([
      { principalId: IDS.viewer, role: "viewer" },
      { principalId: IDS.owner, role: "organization_owner" },
    ]);
    expect(policy.grants.map((grant) => grant.principalId)).toEqual([IDS.owner, IDS.viewer]);
    expect(() =>
      policyWith([
        { principalId: IDS.owner, role: "organization_owner" },
        { principalId: IDS.owner, role: "organization_owner" },
      ]),
    ).toThrow(/duplicate/);
    expect(() =>
      createMembershipPolicy({
        policyId: IDS.policy,
        policyVersion: "policy.v2",
        organizationId: IDS.organization,
        workspaceId: IDS.workspace,
        issuedAt: TIMES.issue,
        grants: [
          {
            principalId: IDS.owner,
            role: "organization_owner",
            grantedAt: TIMES.eval,
            revokedAt: null,
          },
        ],
      }),
    ).toThrow(/after policy issuance/);
    expect(() =>
      createMembershipPolicy({
        policyId: IDS.policy,
        policyVersion: "policy.v2",
        organizationId: IDS.organization,
        workspaceId: IDS.workspace,
        issuedAt: TIMES.issue,
        grants: [
          {
            principalId: IDS.owner,
            role: "organization_owner",
            grantedAt: TIMES.grant,
            revokedAt: TIMES.grant,
          },
        ],
      }),
    ).toThrow(/revocation/);
  });

  it.each([
    ["tenant_mismatch", { organizationId: IDS.otherOrganization }],
    ["workspace_mismatch", { workspaceId: IDS.otherWorkspace }],
    ["policy_not_yet_valid", { evaluatedAt: TIMES.grant }],
    ["membership_inactive", { principalId: "30000000-0000-4000-8000-000000000009" }],
    ["permission_missing", { principalId: IDS.viewer }],
    ["classification_denied", { classificationAllowed: false }],
    ["governance_denied", { governanceAllowed: false }],
    ["entitlement_denied", { entitlementAllowed: false }],
    ["allowed", {}],
  ] as const)("returns stable %s authorization decisions", (reason, changes) => {
    const decision = authorization("collaboration.annotation.create", changes);
    expect(decision.reason).toBe(reason);
    expect(decision.allowed).toBe(reason === "allowed");
    expect(decision.manifestSha256).toHaveLength(64);
  });

  it("denies a revoked membership and malformed policy requests", () => {
    const policy = policyWith([
      { principalId: IDS.owner, role: "organization_owner", revokedAt: TIMES.issue },
    ]);
    expect(authorization("workspace.manage", { policy }).reason).toBe("membership_inactive");
    expect(() =>
      authorizeWorkspaceAction(policyWith(), {
        principalId: IDS.owner,
        organizationId: IDS.organization,
        workspaceId: IDS.workspace,
        resourceOrganizationId: IDS.organization,
        resourceWorkspaceId: IDS.workspace,
        action: "workspace.manage",
        evaluatedAt: TIMES.eval,
        entitlementAllowed: true,
        classificationAllowed: true,
        governanceAllowed: true,
        unknown: true,
      } as never),
    ).toThrow(/exactly/);
  });
});

describe("API credentials", () => {
  const base = {
    credentialId: IDS.credential,
    principalId: IDS.owner,
    organizationId: IDS.organization,
    workspaceId: IDS.workspace,
    scopes: ["api_credential.use"],
    secretSha256: sha256Text(CREDENTIAL_SECRET),
    issuedAt: TIMES.issue,
    expiresAt: TIMES.expiry,
    revokedAt: null,
  } as const;

  it("stores only a sorted scope and secret digest", () => {
    const credential = createApiCredential({
      ...base,
      scopes: ["workspace.manage", "api_credential.use"],
    });
    expect(credential.scopes).toEqual(["api_credential.use", "workspace.manage"]);
    expect(JSON.stringify(credential)).not.toContain("plain-secret");
    expect(() => createApiCredential({ ...base, secretSha256: "bad" })).toThrow(/SHA-256/);
    expect(() => createApiCredential({ ...base, expiresAt: TIMES.issue })).toThrow(/expiry/);
    expect(() => createApiCredential({ ...base, revokedAt: TIMES.grant })).toThrow(/revocation/);
  });

  it.each([
    ["credential_tenant_mismatch", { organizationId: IDS.otherOrganization }],
    ["credential_workspace_mismatch", { workspaceId: IDS.otherWorkspace }],
    ["credential_not_yet_valid", { evaluatedAt: TIMES.grant }],
    ["credential_expired", { evaluatedAt: TIMES.expiry }],
    ["credential_scope_missing", { action: "workspace.manage" }],
  ] as const)("denies %s", (reason, change) => {
    const credential = createApiCredential(base);
    const overrides = change as Partial<{
      organizationId: string;
      workspaceId: string;
      action: string;
      evaluatedAt: string;
    }>;
    const organizationId = overrides.organizationId ?? IDS.organization;
    const workspaceId = overrides.workspaceId ?? IDS.workspace;
    const action = overrides.action ?? "api_credential.use";
    const evaluatedAt = overrides.evaluatedAt ?? TIMES.eval;
    const decision = authorizeApiCredential({
      credential,
      authorization: authorization(action, {
        organizationId,
        workspaceId,
        evaluatedAt,
      }),
      organizationId,
      workspaceId,
      action,
      evaluatedAt,
      presentedSecret: CREDENTIAL_SECRET,
    });
    expect(decision.reason).toBe(reason);
    expect(decision.allowed).toBe(false);
  });

  it("denies revoked and independently denied authorization, then allows the exact request", () => {
    const revoked = createApiCredential({ ...base, revokedAt: TIMES.eval });
    expect(
      authorizeApiCredential({
        credential: revoked,
        authorization: authorization("api_credential.use"),
        organizationId: IDS.organization,
        workspaceId: IDS.workspace,
        action: "api_credential.use",
        evaluatedAt: TIMES.eval,
        presentedSecret: CREDENTIAL_SECRET,
      }).reason,
    ).toBe("credential_revoked");

    const credential = createApiCredential(base);
    const denied = authorization("api_credential.use", { entitlementAllowed: false });
    expect(
      authorizeApiCredential({
        credential,
        authorization: denied,
        organizationId: IDS.organization,
        workspaceId: IDS.workspace,
        action: "api_credential.use",
        evaluatedAt: TIMES.eval,
        presentedSecret: CREDENTIAL_SECRET,
      }).reason,
    ).toBe("authorization_denied");
    expect(
      authorizeApiCredential({
        credential,
        authorization: authorization("api_credential.use"),
        organizationId: IDS.organization,
        workspaceId: IDS.workspace,
        action: "api_credential.use",
        evaluatedAt: TIMES.eval,
        presentedSecret: CREDENTIAL_SECRET,
      }),
    ).toMatchObject({ allowed: true, reason: "allowed" });
    expect(
      authorizeApiCredential({
        credential,
        authorization: authorization("api_credential.use"),
        organizationId: IDS.organization,
        workspaceId: IDS.workspace,
        action: "api_credential.use",
        evaluatedAt: TIMES.eval,
        presentedSecret: "wrong-secret-material-that-is-long-enough",
      }).reason,
    ).toBe("credential_authentication_failed");
  });
});

describe("cited append-only collaboration", () => {
  it("preserves creation, revision, and resolution without copying scientific values", () => {
    const ledger = new CollaborationLedger(IDS.organization, IDS.workspace);
    const created = ledger.create({
      recordId: IDS.record,
      actorId: IDS.owner,
      occurredAt: TIMES.eval,
      authorization: authorization("collaboration.annotation.create"),
      kind: "annotation",
      artifact: ARTIFACT,
      citations: [CITATION],
      body: "The release merits a sensitivity review.",
    });
    const revised = ledger.revise({
      recordId: IDS.record,
      actorId: IDS.owner,
      occurredAt: TIMES.next,
      authorization: authorization("collaboration.record.edit", { evaluatedAt: TIMES.next }),
      citations: [CITATION],
      body: "The release merits an expanded sensitivity review.",
    });
    const resolved = ledger.resolve({
      recordId: IDS.record,
      actorId: IDS.owner,
      occurredAt: TIMES.later,
      authorization: authorization("collaboration.record.resolve", { evaluatedAt: TIMES.later }),
      resolutionCitations: [CITATION],
    });
    expect([created.recordVersion, revised.recordVersion, resolved.recordVersion]).toEqual([
      1, 2, 3,
    ]);
    expect(resolved.body).toBeNull();
    expect(resolved.artifact).toEqual(ARTIFACT);
    expect(Object.keys(resolved)).not.toContain("value");
    CollaborationLedger.verifyReplay(ledger.events());
    expect(Object.isFrozen(ledger.events())).toBe(true);
    expect(() =>
      ledger.revise({
        recordId: IDS.record,
        actorId: IDS.owner,
        occurredAt: TIMES.muchLater,
        authorization: authorization("collaboration.record.edit", {
          evaluatedAt: TIMES.muchLater,
        }),
        citations: [CITATION],
        body: "Late mutation.",
      }),
    ).toThrow(/final/);
  });

  it("supports comments and rejects duplicate, missing, cross-tenant, stale, and unauthorized writes", () => {
    const ledger = new CollaborationLedger(IDS.organization, IDS.workspace);
    ledger.create({
      recordId: IDS.record2,
      actorId: IDS.analyst,
      occurredAt: TIMES.eval,
      authorization: authorization("collaboration.comment.create", {
        principalId: IDS.analyst,
      }),
      kind: "comment",
      artifact: ARTIFACT,
      citations: [CITATION],
      body: "Please inspect this evidence.",
    });
    expect(() =>
      ledger.create({
        recordId: IDS.record2,
        actorId: IDS.analyst,
        occurredAt: TIMES.next,
        authorization: authorization("collaboration.comment.create", {
          principalId: IDS.analyst,
          evaluatedAt: TIMES.next,
        }),
        kind: "comment",
        artifact: ARTIFACT,
        citations: [CITATION],
        body: "Duplicate.",
      }),
    ).toThrow(/already exists/);
    expect(() =>
      ledger.revise({
        recordId: IDS.record,
        actorId: IDS.owner,
        occurredAt: TIMES.next,
        authorization: authorization("collaboration.record.edit", { evaluatedAt: TIMES.next }),
        citations: [CITATION],
        body: "Missing.",
      }),
    ).toThrow(/does not exist/);
    expect(() =>
      ledger.revise({
        recordId: IDS.record2,
        actorId: IDS.owner,
        occurredAt: TIMES.eval,
        authorization: authorization("collaboration.record.edit"),
        citations: [CITATION],
        body: "Stale.",
      }),
    ).toThrow(/follow/);
    expect(() =>
      ledger.resolve({
        recordId: IDS.record2,
        actorId: IDS.viewer,
        occurredAt: TIMES.next,
        authorization: authorization("collaboration.record.resolve", {
          principalId: IDS.viewer,
          evaluatedAt: TIMES.next,
        }),
        resolutionCitations: [CITATION],
      }),
    ).toThrow(/does not allow/);

    const otherLedger = new CollaborationLedger(IDS.organization, IDS.workspace);
    expect(() =>
      otherLedger.create({
        recordId: IDS.record,
        actorId: IDS.owner,
        occurredAt: TIMES.eval,
        authorization: authorization("collaboration.annotation.create"),
        kind: "annotation",
        artifact: { ...ARTIFACT, organizationId: IDS.otherOrganization },
        citations: [CITATION],
        body: "Cross tenant.",
      }),
    ).toThrow(/tenant boundary/);
  });

  it("fails replay on digest tampering and structurally invalid transitions", () => {
    const ledger = new CollaborationLedger(IDS.organization, IDS.workspace);
    const created = ledger.create({
      recordId: IDS.record,
      actorId: IDS.owner,
      occurredAt: TIMES.eval,
      authorization: authorization("collaboration.annotation.create"),
      kind: "annotation",
      artifact: ARTIFACT,
      citations: [CITATION],
      body: "Original.",
    });
    const tampered = JSON.parse(JSON.stringify(ledger.events())) as CollaborationEvent[];
    Object.assign(tampered[0] as CollaborationEvent, { body: "Changed." });
    expect(() => CollaborationLedger.verifyReplay(tampered)).toThrow(/digest/);

    const { eventSha256: _ignored, ...body } = created;
    const invalid = chainedEvent({
      ...body,
      action: "revised" as const,
    }) as CollaborationEvent;
    expect(() => CollaborationLedger.verifyReplay([invalid])).toThrow(/invalid creation/);
  });

  it("rejects malformed citation, artifact, kind, and unknown scientific fields", () => {
    const ledger = new CollaborationLedger(IDS.organization, IDS.workspace);
    const base = {
      recordId: IDS.record,
      actorId: IDS.owner,
      occurredAt: TIMES.eval,
      authorization: authorization("collaboration.annotation.create"),
      kind: "annotation" as const,
      artifact: ARTIFACT,
      citations: [CITATION],
      body: "Review.",
    };
    expect(() => ledger.create({ ...base, value: "42" } as never)).toThrow(/exactly/);
    expect(() => ledger.create({ ...base, kind: "note" } as never)).toThrow(/kind/);
    expect(() => ledger.create({ ...base, citations: [] })).toThrow(/1..20/);
    expect(() =>
      ledger.create({
        ...base,
        citations: [{ ...CITATION, evidenceVersionSha256: "bad" }],
      }),
    ).toThrow(/SHA-256/);
    expect(() =>
      ledger.create({ ...base, artifact: { ...ARTIFACT, artifactVersionSha256: "bad" } }),
    ).toThrow(/SHA-256/);
    expect(() =>
      ledger.create({
        ...base,
        citations: [
          {
            ...CITATION,
            availableAt: TIMES.next,
            temporalRelation: "available_by_artifact_cutoff",
          },
        ],
      }),
    ).toThrow(/point-in-time cutoff/);
    expect(() => ledger.create({ ...base, artifact: { ...ARTIFACT, asOf: TIMES.next } })).toThrow(
      /cutoff/,
    );
  });

  it("labels later counter-evidence explicitly without changing the pinned artifact", () => {
    const ledger = new CollaborationLedger(IDS.organization, IDS.workspace);
    const event = ledger.create({
      recordId: IDS.record,
      actorId: IDS.owner,
      occurredAt: TIMES.next,
      authorization: authorization("collaboration.annotation.create", {
        evaluatedAt: TIMES.next,
      }),
      kind: "annotation",
      artifact: ARTIFACT,
      citations: [
        {
          ...CITATION,
          availableAt: TIMES.eval,
          temporalRelation: "subsequent_evidence",
        },
      ],
      body: "Later evidence challenges the pinned result.",
    });
    expect(event.artifact.asOf).toBe(TIMES.issue);
    expect(event.citations[0]?.temporalRelation).toBe("subsequent_evidence");
    expect(event.contentClass).toBe("non_authoritative_commentary");
    CollaborationLedger.verifyReplay(ledger.events());
  });
});
