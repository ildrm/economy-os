import { organizationId, type Principal, subjectId, workspaceId } from "@economyos/contracts";
import { ForbiddenException, type HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PostgresRuntime, QueryResult, TenantTransaction } from "./database.js";
import type { GovernedAuthorizationService } from "./governed-authorization.js";
import {
  parseRelationshipClaimCommand,
  parseRelationshipDecisionCommand,
  parseRelationshipEndpointCommand,
  parseRelationshipEvidenceCommand,
  parseRelationshipEvidenceLinkCommand,
  parseRelationshipStatusQuery,
  RelationshipGraphService,
} from "./relationship-graph.js";
import type { WorkspaceAccessService } from "./workspaces.js";

const ORGANIZATION_ID = organizationId("128f47ac-19fc-7c92-ae91-0242ac120001");
const WORKSPACE_ID = workspaceId("228f47ac-19fc-7c92-ae91-0242ac120001");
const SUBJECT_ID = subjectId("328f47ac-19fc-7c92-ae91-0242ac120001");
const ENDPOINT_ID = "428f47ac-19fc-7c92-ae91-0242ac120001";
const TARGET_ENDPOINT_ID = "428f47ac-19fc-7c92-ae91-0242ac120002";
const CLAIM_ID = "528f47ac-19fc-7c92-ae91-0242ac120001";
const EVIDENCE_ID = "628f47ac-19fc-7c92-ae91-0242ac120001";
const LINK_ID = "728f47ac-19fc-7c92-ae91-0242ac120001";
const DECISION_ID = "828f47ac-19fc-7c92-ae91-0242ac120001";
const NOW = "2026-09-02T08:00:00.000000Z";

const principal: Principal = {
  organizationId: ORGANIZATION_ID,
  workspaceIds: [WORKSPACE_ID],
  subjectId: SUBJECT_ID,
  scopes: ["relationship.read", "relationship.write"],
  authenticationMethod: "oidc",
  issuedAt: "2026-09-02T00:00:00Z",
  expiresAt: "2026-09-03T00:00:00Z",
};

describe("relationship graph request parsing", () => {
  it("accepts the strict endpoint, evidence-link, decision, and bitemporal query contracts", () => {
    expect(parseRelationshipEndpointCommand(endpointBody())).toMatchObject({
      endpointType: "economic_indicator",
      referenceType: "series",
      referenceId: TARGET_ENDPOINT_ID,
    });
    expect(parseRelationshipEvidenceLinkCommand(linkBody())).toMatchObject({
      evidenceRole: "supports",
    });
    expect(parseRelationshipDecisionCommand(decisionBody())).toMatchObject({
      toStatus: "reviewed",
    });
    expect(
      parseRelationshipStatusQuery({
        workspaceId: WORKSPACE_ID,
        effectiveAt: NOW,
        systemAt: "2026-09-02T08:00:01.000000Z",
      }),
    ).toEqual({
      workspaceId: WORKSPACE_ID,
      effectiveAt: NOW,
      systemAt: "2026-09-02T08:00:01.000000Z",
    });
  });

  it("rejects extra tenant/subject fields, malformed identifiers, instants, enums, and padding", () => {
    expect(() =>
      parseRelationshipEndpointCommand({ ...endpointBody(), organizationId: ORGANIZATION_ID }),
    ).toThrow("Bad Request");
    expect(() =>
      parseRelationshipEndpointCommand({ ...endpointBody(), subjectId: SUBJECT_ID }),
    ).toThrow("Bad Request");
    expect(() =>
      parseRelationshipEvidenceLinkCommand({ ...linkBody(), evidenceId: "not-a-uuid" }),
    ).toThrow("Bad Request");
    expect(() =>
      parseRelationshipDecisionCommand({ ...decisionBody(), effectiveAt: "2026-09-02" }),
    ).toThrow("Bad Request");
    expect(() =>
      parseRelationshipDecisionCommand({ ...decisionBody(), toStatus: "discovered" }),
    ).toThrow("Bad Request");
    expect(() =>
      parseRelationshipDecisionCommand({ ...decisionBody(), reason: " padded governance reason " }),
    ).toThrow("Bad Request");
  });

  it("preserves association, hypothesis, and causal distinctions without implicit promotion", () => {
    expect(parseRelationshipClaimCommand(claimBody()).claimKind).toBe("association");
    expect(
      parseRelationshipClaimCommand({
        ...claimBody(),
        claimKind: "causal_hypothesis",
        causalClassification: "hypothesized_causal_pathway",
      }).claimKind,
    ).toBe("causal_hypothesis");
    expect(
      parseRelationshipClaimCommand({
        ...claimBody(),
        claimKind: "causal",
        causalClassification: "econometrically_estimated_causal_relationship",
        discoveryMethod: "econometric_identification",
        methodSpecification: {
          name: "Panel event study",
          identificationStrategy: "event_study",
        },
        assumptions: ["Parallel pre-trends remain plausible."],
      }).claimKind,
    ).toBe("causal");

    expect(() =>
      parseRelationshipClaimCommand({
        ...claimBody(),
        claimKind: "association",
        causalClassification: "econometrically_estimated_causal_relationship",
      }),
    ).toThrow("Bad Request");
    expect(() =>
      parseRelationshipClaimCommand({
        ...claimBody(),
        claimKind: "causal",
        causalClassification: "econometrically_estimated_causal_relationship",
        discoveryMethod: "causal_discovery",
        methodSpecification: { name: "Discovery output" },
        assumptions: [],
      }),
    ).toThrow("Bad Request");
  });

  it("bounds JSON, numerics, temporal intervals, references, and evidence locators", () => {
    let deep: unknown = "leaf";
    for (let index = 0; index < 8; index += 1) deep = { next: deep };
    expect(() => parseRelationshipClaimCommand({ ...claimBody(), uncertainty: deep })).toThrow(
      "Bad Request",
    );
    expect(() => parseRelationshipClaimCommand({ ...claimBody(), confidence: 0.7 })).toThrow(
      "Bad Request",
    );
    expect(() =>
      parseRelationshipClaimCommand({ ...claimBody(), lagMaxSeconds: 31_557_600_001 }),
    ).toThrow("Bad Request");
    expect(() =>
      parseRelationshipClaimCommand({ ...claimBody(), validUntil: "2025-01-01T00:00:00Z" }),
    ).toThrow("Bad Request");
    expect(() =>
      parseRelationshipEndpointCommand({ ...endpointBody(), referenceType: "workspace_native" }),
    ).toThrow("Bad Request");
    expect(() => parseRelationshipEvidenceCommand({ ...evidenceBody(), locator: {} })).toThrow(
      "Bad Request",
    );
  });
});

describe("RelationshipGraphService", () => {
  it("authors an endpoint through the exact parameterized function after same-transaction auth", async () => {
    const calls: QueryCall[] = [];
    const transaction = transactionWith(async (text, values) => {
      calls.push({ text, values });
      return [{ result_id: ENDPOINT_ID }];
    });
    const { service, membership, authorization, mutation } = serviceWith(transaction);

    await expect(
      service.authorEndpoint(
        principal,
        ENDPOINT_ID,
        parseRelationshipEndpointCommand(endpointBody()),
      ),
    ).resolves.toEqual({ resource: "relationship_endpoint", id: ENDPOINT_ID });
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(membership).toHaveBeenCalledWith(principal, WORKSPACE_ID, transaction);
    expect(authorization).toHaveBeenCalledWith(principal, WORKSPACE_ID, "write", transaction);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain("evidence.create_relationship_endpoint(");
    expect(calls[0]?.text).toContain("$7::uuid");
    expect(calls[0]?.values).toEqual([
      ENDPOINT_ID,
      WORKSPACE_ID,
      "economic_indicator",
      "indicator.real_gdp_growth",
      "Real GDP growth",
      "series",
      TARGET_ENDPOINT_ID,
    ]);
    expect(calls[0]?.text).not.toContain(ENDPOINT_ID);
    expect(calls[0]?.values).not.toContain(ORGANIZATION_ID);
    expect(calls[0]?.values).not.toContain(SUBJECT_ID);
  });

  it("authors a claim with all 24 frozen arguments and never supplies a status decision", async () => {
    const calls: QueryCall[] = [];
    const transaction = transactionWith(async (text, values) => {
      calls.push({ text, values });
      return [{ result_id: CLAIM_ID }];
    });
    const { service } = serviceWith(transaction);
    const command = parseRelationshipClaimCommand(claimBody());

    await expect(service.authorClaim(principal, CLAIM_ID, command)).resolves.toEqual({
      resource: "relationship_claim",
      id: CLAIM_ID,
    });
    expect(calls[0]?.text).toContain("evidence.create_relationship_claim(");
    expect(calls[0]?.text).toContain("$24::timestamptz");
    expect(calls[0]?.values).toHaveLength(24);
    expect(calls[0]?.values?.slice(0, 10)).toEqual([
      CLAIM_ID,
      WORKSPACE_ID,
      ENDPOINT_ID,
      TARGET_ENDPOINT_ID,
      "affects",
      "association",
      "observed_association",
      "manual_review",
      null,
      null,
    ]);
    expect(calls[0]?.values).not.toContain("reviewed");
    expect(calls[0]?.values).not.toContain("approved");
  });

  it("adds and links evidence with injection-shaped text only in bind values", async () => {
    const calls: QueryCall[] = [];
    const transaction = transactionWith(async (text, values) => {
      calls.push({ text, values });
      if (text.includes("create_relationship_evidence")) return [{ result_id: EVIDENCE_ID }];
      return [{ result_id: LINK_ID }];
    });
    const { service } = serviceWith(transaction);
    const injectionUri = "https://evidence.test/item'); DROP TABLE app.workspaces;--";
    const injectionRationale =
      "Supports the estimate'); DROP TABLE evidence.relationship_claims;--";

    await service.addEvidence(
      principal,
      EVIDENCE_ID,
      parseRelationshipEvidenceCommand({ ...evidenceBody(), evidenceUri: injectionUri }),
    );
    await service.linkEvidence(
      principal,
      CLAIM_ID,
      LINK_ID,
      parseRelationshipEvidenceLinkCommand({ ...linkBody(), rationale: injectionRationale }),
    );

    expect(calls[0]?.text).toContain("evidence.create_relationship_evidence(");
    expect(calls[1]?.text).toContain("evidence.link_relationship_evidence(");
    expect(calls[0]?.text).not.toContain("DROP TABLE");
    expect(calls[1]?.text).not.toContain("DROP TABLE");
    expect(calls[0]?.values).toContain(injectionUri);
    expect(calls[1]?.values).toContain(injectionRationale);
  });

  it("records only the requested decision through the independent-review database boundary", async () => {
    const calls: QueryCall[] = [];
    const transaction = transactionWith(async (text, values) => {
      calls.push({ text, values });
      return [{ result_id: DECISION_ID }];
    });
    const { service } = serviceWith(transaction);

    await expect(
      service.decide(
        principal,
        CLAIM_ID,
        DECISION_ID,
        parseRelationshipDecisionCommand(decisionBody()),
      ),
    ).resolves.toEqual({ resource: "relationship_decision", id: DECISION_ID });
    expect(calls[0]?.text).toContain("evidence.record_relationship_claim_decision(");
    expect(calls[0]?.values).toEqual([
      DECISION_ID,
      CLAIM_ID,
      "reviewed",
      "Independent validation completed with linked evidence.",
      NOW,
    ]);
  });

  it("resolves one immutable status at the exact valid/system cutoffs", async () => {
    const calls: QueryCall[] = [];
    const transaction = transactionWith(async (text, values) => {
      calls.push({ text, values });
      return [statusRow()];
    });
    const { service, read, authorization } = serviceWith(transaction);
    const query = parseRelationshipStatusQuery({
      workspaceId: WORKSPACE_ID,
      effectiveAt: NOW,
      systemAt: "2026-09-02T08:00:01.000000Z",
    });

    await expect(service.status(principal, CLAIM_ID, query)).resolves.toMatchObject({
      resolvedClaimId: CLAIM_ID,
      claimKind: "association",
      causalClassification: "observed_association",
      status: "reviewed",
      effectiveAt: NOW,
      systemAt: "2026-09-02T08:00:01.000000Z",
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(authorization).toHaveBeenCalledWith(principal, WORKSPACE_ID, "read", transaction);
    expect(calls[0]?.text).toContain("evidence.relationship_claim_status_at(");
    expect(calls[0]?.values).toEqual([CLAIM_ID, NOW, "2026-09-02T08:00:01.000000Z"]);
  });

  it("denies before issuing a relationship function call when workspace membership fails", async () => {
    const transaction = transactionWith(async () => {
      throw new Error("relationship SQL must not execute");
    });
    const { service, authorization } = serviceWith(transaction, {
      membershipError: new ForbiddenException({ code: "WORKSPACE_ACCESS_DENIED" }),
    });

    await expect(
      service.authorClaim(principal, CLAIM_ID, parseRelationshipClaimCommand(claimBody())),
    ).rejects.toThrow("Forbidden");
    expect(transaction.query).not.toHaveBeenCalled();
    expect(authorization).not.toHaveBeenCalled();
  });

  it("uses one non-enumerating 404 for missing, foreign, and independent-review target failures", async () => {
    const missingService = serviceWith(transactionWith(async () => [])).service;
    const query = parseRelationshipStatusQuery({
      workspaceId: WORKSPACE_ID,
      effectiveAt: NOW,
      systemAt: NOW,
    });
    const missing = await publicFailure(missingService.status(principal, CLAIM_ID, query));

    const deniedTransaction = transactionWith(async () => {
      throw Object.assign(new Error("sensitive ownership and reviewer details"), { code: "42501" });
    });
    const deniedService = serviceWith(deniedTransaction).service;
    const foreign = await publicFailure(
      deniedService.linkEvidence(
        principal,
        CLAIM_ID,
        LINK_ID,
        parseRelationshipEvidenceLinkCommand(linkBody()),
      ),
    );
    const independent = await publicFailure(
      deniedService.decide(
        principal,
        CLAIM_ID,
        DECISION_ID,
        parseRelationshipDecisionCommand(decisionBody()),
      ),
    );

    expect(missing).toEqual({ status: 404, response: { code: "RELATIONSHIP_RESOURCE_NOT_FOUND" } });
    expect(foreign).toEqual(missing);
    expect(independent).toEqual(missing);
    expect(JSON.stringify(independent)).not.toContain("reviewer");
  });

  it("maps expected SQL states safely and leaves unexpected failures internal", async () => {
    for (const [code, status] of [
      ["22023", 400],
      ["23503", 404],
      ["23514", 409],
      ["23505", 409],
      ["40001", 409],
      ["40P01", 409],
    ] as const) {
      const databaseFailure = Object.assign(new Error("private database message"), { code });
      const service = serviceWith(
        transactionWith(async () => {
          throw databaseFailure;
        }),
      ).service;
      const failure = await publicFailure(
        service.authorEndpoint(
          principal,
          ENDPOINT_ID,
          parseRelationshipEndpointCommand(endpointBody()),
        ),
      );
      expect(failure.status).toBe(status);
      expect(JSON.stringify(failure.response)).not.toContain("private database message");
    }

    const unexpected = new Error("unexpected adapter failure");
    const service = serviceWith(
      transactionWith(async () => {
        throw unexpected;
      }),
    ).service;
    await expect(
      service.authorEndpoint(
        principal,
        ENDPOINT_ID,
        parseRelationshipEndpointCommand(endpointBody()),
      ),
    ).rejects.toBe(unexpected);
  });

  it("fails closed on malformed or identity-changing database rows", async () => {
    const changedIdentity = serviceWith(
      transactionWith(async () => [{ result_id: TARGET_ENDPOINT_ID }]),
    ).service;
    await expect(
      changedIdentity.authorEndpoint(
        principal,
        ENDPOINT_ID,
        parseRelationshipEndpointCommand(endpointBody()),
      ),
    ).rejects.toThrow("identity");

    const malformedStatus = serviceWith(
      transactionWith(async () => [statusRow({ decision_sha256: "not-a-digest" })]),
    ).service;
    await expect(
      malformedStatus.status(
        principal,
        CLAIM_ID,
        parseRelationshipStatusQuery({
          workspaceId: WORKSPACE_ID,
          effectiveAt: NOW,
          systemAt: NOW,
        }),
      ),
    ).rejects.toThrow("decision_sha256");
  });
});

interface QueryCall {
  readonly text: string;
  readonly values: readonly unknown[] | undefined;
}

function serviceWith(
  transaction: TenantTransaction & { readonly query: ReturnType<typeof vi.fn> },
  options: { readonly membershipError?: Error; readonly authorizationError?: Error } = {},
): {
  readonly service: RelationshipGraphService;
  readonly membership: ReturnType<typeof vi.fn>;
  readonly authorization: ReturnType<typeof vi.fn>;
  readonly mutation: ReturnType<typeof vi.fn>;
  readonly read: ReturnType<typeof vi.fn>;
} {
  const mutation = vi.fn(
    async (_principal: Principal, operation: (inner: TenantTransaction) => Promise<unknown>) =>
      operation(transaction),
  );
  const read = vi.fn(
    async (_principal: Principal, operation: (inner: TenantTransaction) => Promise<unknown>) =>
      operation(transaction),
  );
  const membership = vi.fn(async () => {
    if (options.membershipError) throw options.membershipError;
    return WORKSPACE_ID;
  });
  const authorization = vi.fn(async () => {
    if (options.authorizationError) throw options.authorizationError;
  });
  return {
    service: new RelationshipGraphService(
      { withPrincipalMutation: mutation, withPrincipal: read } as unknown as PostgresRuntime,
      { assertMembership: membership } as unknown as WorkspaceAccessService,
      {
        assertRelationshipWorkspaceAccess: authorization,
      } as unknown as GovernedAuthorizationService,
    ),
    membership,
    authorization,
    mutation,
    read,
  };
}

function transactionWith(
  responder: (
    text: string,
    values?: readonly unknown[],
  ) => Promise<readonly Record<string, unknown>[]>,
): TenantTransaction & { readonly query: ReturnType<typeof vi.fn> } {
  const query = vi.fn(
    async <Row extends Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<QueryResult<Row>> => {
      const rows = await responder(text, values);
      return { rows: rows as readonly Row[], rowCount: rows.length };
    },
  );
  return { query } as unknown as TenantTransaction & { readonly query: ReturnType<typeof vi.fn> };
}

async function publicFailure(
  operation: Promise<unknown>,
): Promise<{ readonly status: number; readonly response: string | object }> {
  try {
    await operation;
    throw new Error("Expected operation to fail");
  } catch (error) {
    if (!isHttpException(error)) throw error;
    return { status: error.getStatus(), response: error.getResponse() };
  }
}

function isHttpException(value: unknown): value is HttpException {
  return (
    typeof value === "object" &&
    value !== null &&
    "getStatus" in value &&
    typeof value.getStatus === "function" &&
    "getResponse" in value &&
    typeof value.getResponse === "function"
  );
}

function endpointBody(): Readonly<Record<string, unknown>> {
  return {
    workspaceId: WORKSPACE_ID,
    endpointType: "economic_indicator",
    canonicalKey: "indicator.real_gdp_growth",
    displayName: "Real GDP growth",
    referenceType: "series",
    referenceId: TARGET_ENDPOINT_ID,
  };
}

function claimBody(): Readonly<Record<string, unknown>> {
  return {
    workspaceId: WORKSPACE_ID,
    fromEndpointId: ENDPOINT_ID,
    toEndpointId: TARGET_ENDPOINT_ID,
    relationshipType: "affects",
    claimKind: "association",
    causalClassification: "observed_association",
    discoveryMethod: "manual_review",
    hypothesisSourceClaimId: null,
    supersedesClaimId: null,
    methodSpecification: { name: "Documented analyst review" },
    scope: { population: "National economy" },
    assumptions: [],
    uncertainty: { type: "qualitative" },
    confidence: "0.70",
    effectDirection: "positive",
    effectStrength: "0.25",
    lagMinSeconds: 0,
    lagMaxSeconds: 86_400,
    regimeScope: {},
    geographicScope: { countryCodes: ["TST"] },
    validFrom: "2026-01-01T00:00:00Z",
    validUntil: null,
    discoveredAt: "2026-09-02T07:00:00Z",
  };
}

function evidenceBody(): Readonly<Record<string, unknown>> {
  return {
    workspaceId: WORKSPACE_ID,
    evidenceType: "official_data",
    evidenceUri: "https://evidence.test/series/real-gdp-growth",
    sourceSha256: "a".repeat(64),
    locator: { table: "observations", row: 42 },
    observedAt: "2026-08-31T00:00:00Z",
    validFrom: "2026-01-01T00:00:00Z",
    validUntil: null,
  };
}

function linkBody(): Readonly<Record<string, unknown>> {
  return {
    workspaceId: WORKSPACE_ID,
    evidenceId: EVIDENCE_ID,
    evidenceRole: "supports",
    rationale: "Supports the documented association with official observations.",
    linkedAt: NOW,
  };
}

function decisionBody(): Readonly<Record<string, unknown>> {
  return {
    workspaceId: WORKSPACE_ID,
    toStatus: "reviewed",
    reason: "Independent validation completed with linked evidence.",
    effectiveAt: NOW,
  };
}

function statusRow(override: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    resolved_claim_id: CLAIM_ID,
    root_claim_id: CLAIM_ID,
    from_endpoint_id: ENDPOINT_ID,
    to_endpoint_id: TARGET_ENDPOINT_ID,
    relationship_type: "affects",
    claim_kind: "association",
    causal_classification: "observed_association",
    status: "reviewed",
    valid_from: "2026-01-01T00:00:00.000000Z",
    valid_until: null,
    recorded_at: "2026-09-02T07:00:00.000001Z",
    claim_sha256: "b".repeat(64),
    decision_id: DECISION_ID,
    decision_sha256: "c".repeat(64),
    ...override,
  };
}
