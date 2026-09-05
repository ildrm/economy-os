import {
  createBehavioralChoiceModel,
  detectBehavioralInterventions,
} from "@economyos/behavioral-economics";
import { organizationId, type Principal, subjectId, workspaceId } from "@economyos/contracts";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  modelInput,
  source,
  tenant,
} from "../../../packages/behavioral-economics/src/fixtures.test-helper.js";
import type { PostgresRuntime, TenantTransaction } from "./database.js";
import type { GovernedAuthorizationService } from "./governed-authorization.js";
import {
  executeResearch,
  parseResearchCommand,
  parseResearchRead,
  ResearchWorkbenchService,
} from "./research-workbench.js";
import type { WorkspaceAccessService } from "./workspaces.js";

const principal: Principal = {
  organizationId: organizationId("10000000-0000-4000-8000-000000000001"),
  subjectId: subjectId("10000000-0000-4000-8000-000000000002"),
  workspaceIds: [workspaceId("10000000-0000-4000-8000-000000000003")],
  scopes: [],
  authenticationMethod: "oidc",
  issuedAt: "2026-01-01T00:00:00Z",
  expiresAt: "2027-01-01T00:00:00Z",
};
const raw = {
  id: "10000000-0000-4000-8000-000000000004",
  workspaceId: principal.workspaceIds[0],
  knownAt: "2026-01-01T00:00:00Z",
  kind: "behavioral_choice",
  input: {
    utilities: ["10", "10"],
    beta: "0.5",
    delta: "1",
    assumption: "Explicit illustrative utility flows",
    population: "Hypothetical aggregate",
    periodUnit: "year",
  },
};
const balance = {
  commodityKey: "energy",
  unit: "MWh",
  production: "0.1",
  imports: "0.2",
  openingInventory: "0",
  intermediateDemand: "0",
  householdDemand: "0.3",
  governmentDemand: "0",
  investmentDemand: "0",
  exports: "0",
  closingInventory: "0",
};
function harness(result: unknown = { id: raw.id, dataClass: "scenario" }) {
  const query = vi.fn().mockResolvedValue({ rows: [{ envelope: result }], rowCount: 1 });
  const transaction = { query } as TenantTransaction;
  const withPrincipal = vi.fn(async (_principal, operation) => operation(transaction));
  const withPrincipalMutation = vi.fn(async (_principal, operation) => operation(transaction));
  const assertMembership = vi.fn().mockResolvedValue(raw.workspaceId);
  const assertResearchWorkspaceAccess = vi.fn().mockResolvedValue(undefined);
  const service = new ResearchWorkbenchService(
    { withPrincipal, withPrincipalMutation } as unknown as PostgresRuntime,
    { assertMembership } as unknown as WorkspaceAccessService,
    { assertResearchWorkspaceAccess } as unknown as GovernedAuthorizationService,
  );
  return {
    service,
    query,
    transaction,
    assertMembership,
    assertResearchWorkspaceAccess,
    withPrincipal,
    withPrincipalMutation,
  };
}

describe("research contracts and scientific dispatch", () => {
  it("computes the explicit present-bias case, exponential benchmark and sensitivity", () => {
    expect(executeResearch(parseResearchCommand(raw))).toMatchObject({
      utility: "15",
      exponentialBenchmark: "20",
      parameterSource: "scenario_assumption",
      modelUncertainty: "not_estimated",
      sensitivity: [
        { beta: "0", utility: "10" },
        { beta: "0.5", utility: "15" },
        { beta: "1", utility: "20" },
      ],
    });
  });
  it("uses exact allocation arithmetic and preserves unknowns", () => {
    expect(
      executeResearch(parseResearchCommand({ ...raw, kind: "material_balance", input: balance })),
    ).toMatchObject({ imbalance: "0", shortage: "0", surplus: "0", supply: "0.3" });
    expect(
      executeResearch(
        parseResearchCommand({
          ...raw,
          kind: "material_balance",
          input: { ...balance, imports: null },
        }),
      ),
    ).toEqual({ status: "missing", missingFields: ["imports"] });
  });
  it.each([
    null,
    {},
    { ...raw, tenantId: principal.organizationId },
    { ...raw, kind: "observed" },
    { ...raw, workspaceId: "bad" },
    { ...raw, knownAt: "2026-02-30T00:00:00Z" },
    { ...raw, knownAt: "2026-01-01T00:00:00.000001Z" },
    { ...raw, input: [] },
  ])("rejects malformed or smuggled command %j", (input) => {
    expect(() => parseResearchCommand(input)).toThrow(BadRequestException);
  });
  it.each([
    { beta: "-1" },
    { utilities: ["1e20"] },
    { assumption: "" },
    { utilities: ["1", null] },
  ])("rejects invalid numerical/provenance input %j", (override) => {
    expect(() =>
      executeResearch(parseResearchCommand({ ...raw, input: { ...raw.input, ...override } })),
    ).toThrow(BadRequestException);
  });
  it("round-trips server microsecond system cutoffs without rounding", () => {
    const input = {
      workspaceId: raw.workspaceId,
      knownAt: raw.knownAt,
      systemAt: "2026-01-01T00:00:00.123456Z",
    };
    expect(parseResearchRead(input)).toEqual(input);
    expect(() =>
      parseResearchRead({ ...input, systemAt: "2026-01-01T00:00:00.1234567Z" }),
    ).toThrow();
  });
  it("rejects oversized bodies before numerical work", () => {
    expect(() => parseResearchCommand({ ...raw, input: { text: "a".repeat(100001) } })).toThrow(
      BadRequestException,
    );
  });
  it.each([{ toString: null }, ["behavioral_choice"], null])(
    "rejects non-string kinds without coercion",
    (kind) => {
      expect(() => parseResearchCommand({ ...raw, kind })).toThrow(BadRequestException);
    },
  );
});

describe("research authorization and persistence adapter", () => {
  it("dispatches a governed prospect model with a rational benchmark", () => {
    const model = createBehavioralChoiceModel(modelInput());
    const result = executeResearch(
      parseResearchCommand({
        ...raw,
        input: {
          model,
          scope: tenant,
          knownAt: raw.knownAt,
          systemAt: raw.knownAt,
          seed: "4",
          choices: [
            { choiceId: "a", outcomes: [{ value: "1", probability: "1" }] },
            { choiceId: "b", outcomes: [{ value: "2", probability: "1" }] },
          ],
          choiceRule: { kind: "maximum" },
        },
      }),
    );
    expect(result).toMatchObject({
      classification: "simulation",
      selectedChoiceId: "b",
      rationalBenchmark: { selectedChoiceId: "b" },
    });
  });
  it("persists candidate extraction with exact source bindings but no raw source text", async () => {
    const input = source();
    expect(() => detectBehavioralInterventions(input)).not.toThrow();
    const sourcePrincipal: Principal = {
      ...principal,
      organizationId: organizationId(tenant.organizationId),
      workspaceIds: [workspaceId(tenant.workspaceId)],
    };
    const h = harness();
    await h.service.execute(
      sourcePrincipal,
      parseResearchCommand({
        ...raw,
        workspaceId: tenant.workspaceId,
        knownAt: input.knownAt,
        kind: "intervention_detection",
        input,
      }),
    );
    const values = h.query.mock.calls[0]?.[1] as string[];
    expect(JSON.parse(values[4] ?? "{}")).not.toHaveProperty("sourceText");
    expect(JSON.parse(values[4] ?? "{}")).toHaveProperty(
      "snapshot.contentSha256",
      input.snapshot.contentSha256,
    );
    expect(JSON.parse(values[5] ?? "{}")).toMatchObject({
      status: "candidates_found",
      candidates: expect.arrayContaining([
        expect.objectContaining({ claim: "candidate_mechanism_not_proven" }),
      ]),
    });
  });
  it("rejects restricted documents and cross-workspace extraction", async () => {
    const denied = source(undefined, { exportPolicy: "deny" });
    expect(() =>
      executeResearch(
        parseResearchCommand({ ...raw, kind: "intervention_detection", input: denied }),
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      executeResearch(
        parseResearchCommand({
          ...raw,
          kind: "intervention_detection",
          input: source(undefined, { classification: "restricted" }),
        }),
      ),
    ).toThrow(BadRequestException);
    const h = harness();
    await expect(
      h.service.execute(
        principal,
        parseResearchCommand({ ...raw, kind: "intervention_detection", input: source() }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.query).not.toHaveBeenCalled();
  });
  it("uses the same mutation transaction for membership, grant and immutable write", async () => {
    const h = harness();
    await expect(h.service.execute(principal, parseResearchCommand(raw))).resolves.toMatchObject({
      dataClass: "scenario",
    });
    expect(h.assertMembership).toHaveBeenCalledWith(principal, raw.workspaceId, h.transaction);
    expect(h.assertResearchWorkspaceAccess).toHaveBeenCalledWith(
      principal,
      raw.workspaceId,
      "execute",
      h.transaction,
    );
    expect(h.query.mock.calls[0]?.[1]).toEqual([
      raw.workspaceId,
      raw.id,
      raw.kind,
      raw.knownAt,
      JSON.stringify(raw.input),
      expect.any(String),
    ]);
  });
  it.each(["membership", "entitlement"])(
    "denies %s before calculation or write",
    async (boundary) => {
      const h = harness();
      (boundary === "membership"
        ? h.assertMembership
        : h.assertResearchWorkspaceAccess
      ).mockRejectedValue(new ForbiddenException());
      await expect(
        h.service.execute(principal, parseResearchCommand({ ...raw, input: {} })),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(h.query).not.toHaveBeenCalled();
    },
  );
  it("rejects forged allocation scope and input cutoff before invoking kernel", async () => {
    const h = harness();
    await expect(
      h.service.execute(
        principal,
        parseResearchCommand({
          ...raw,
          kind: "allocation_simulation",
          input: { tenantId: "foreign", knowledgeCutoff: raw.knownAt },
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.query).not.toHaveBeenCalled();
  });
  it.each([
    ["23514", ConflictException],
    ["23505", ConflictException],
    ["40001", ConflictException],
    ["22023", BadRequestException],
    ["42501", ForbiddenException],
  ] as const)("maps SQLSTATE %s without leaking diagnostics", async (code, errorType) => {
    const h = harness();
    h.query.mockRejectedValue({ code, message: "sensitive database diagnostic" });
    await expect(h.service.execute(principal, parseResearchCommand(raw))).rejects.toBeInstanceOf(
      errorType,
    );
  });
  it("uses read authorization and exact PIT arguments", async () => {
    const h = harness();
    const read = parseResearchRead({
      workspaceId: raw.workspaceId,
      knownAt: raw.knownAt,
      systemAt: "2026-01-01T00:00:00.123456Z",
    });
    await h.service.get(principal, raw.id, read);
    expect(h.assertResearchWorkspaceAccess).toHaveBeenCalledWith(
      principal,
      raw.workspaceId,
      "read",
      h.transaction,
    );
    expect(h.query.mock.calls[0]?.[1]).toEqual([
      raw.workspaceId,
      raw.id,
      read.knownAt,
      read.systemAt,
    ]);
  });
  it("does not distinguish invisible and absent records", async () => {
    const h = harness(null);
    await expect(
      h.service.get(
        principal,
        raw.id,
        parseResearchRead({
          workspaceId: raw.workspaceId,
          knownAt: raw.knownAt,
          systemAt: raw.knownAt,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
