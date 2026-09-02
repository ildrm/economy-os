import { organizationId, type Principal, subjectId, workspaceId } from "@economyos/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  type CrisisForecastRunPageQuery,
  CrisisForecastService,
  parseCrisisForecastRunPageQuery,
  parseCrisisForecastRunQuery,
} from "./crisis-forecasts.js";
import type { PostgresRuntime, QueryResult, TenantTransaction } from "./database.js";
import type { GovernedAuthorizationService } from "./governed-authorization.js";
import type { WorkspaceAccessService } from "./workspaces.js";

const ORGANIZATION_ID = organizationId("118f47ac-19fc-7c92-ae91-0242ac120001");
const WORKSPACE_ID = workspaceId("218f47ac-19fc-7c92-ae91-0242ac120001");
const SUBJECT_ID = subjectId("318f47ac-19fc-7c92-ae91-0242ac120001");
const RUN_ID = "418f47ac-19fc-7c92-ae91-0242ac120001";
const GEOGRAPHY_ID = "518f47ac-19fc-7c92-ae91-0242ac120001";
const SNAPSHOT_ID = "618f47ac-19fc-7c92-ae91-0242ac120001";
const COMPLETION_ID = "718f47ac-19fc-7c92-ae91-0242ac120001";
const SLOT_ID = "818f47ac-19fc-7c92-ae91-0242ac120001";
const MODEL_ID = "918f47ac-19fc-7c92-ae91-0242ac120001";

const principal: Principal = {
  organizationId: ORGANIZATION_ID,
  workspaceIds: [WORKSPACE_ID],
  subjectId: SUBJECT_ID,
  scopes: ["model.read"],
  authenticationMethod: "oidc",
  issuedAt: "2026-09-02T00:00:00Z",
  expiresAt: "2026-09-02T12:00:00Z",
};

describe("crisis forecast request parsing", () => {
  it("accepts a strict detail query and a complete descending keyset", () => {
    expect(parseCrisisForecastRunQuery({ workspaceId: WORKSPACE_ID })).toEqual({
      workspaceId: WORKSPACE_ID,
    });
    expect(
      parseCrisisForecastRunPageQuery({
        workspaceId: WORKSPACE_ID,
        geographyId: GEOGRAPHY_ID,
        limit: "25",
        beforeGeneratedAt: "2026-09-02T08:00:00Z",
        beforeRunId: RUN_ID,
      }),
    ).toEqual({
      workspaceId: WORKSPACE_ID,
      geographyId: GEOGRAPHY_ID,
      limit: 25,
      beforeGeneratedAt: "2026-09-02T08:00:00Z",
      beforeRunId: RUN_ID,
    });
  });

  it("rejects partial cursors, unknown fields, malformed IDs, timestamps, and bounds", () => {
    for (const query of [
      { workspaceId: WORKSPACE_ID, geographyId: GEOGRAPHY_ID, beforeRunId: RUN_ID },
      { workspaceId: WORKSPACE_ID, geographyId: GEOGRAPHY_ID, surprise: "field" },
      { workspaceId: WORKSPACE_ID, geographyId: "bad" },
      {
        workspaceId: WORKSPACE_ID,
        geographyId: GEOGRAPHY_ID,
        beforeGeneratedAt: "not-an-instant",
        beforeRunId: RUN_ID,
      },
      { workspaceId: WORKSPACE_ID, geographyId: GEOGRAPHY_ID, limit: "101" },
    ]) {
      expect(() => parseCrisisForecastRunPageQuery(query)).toThrow("Bad Request");
    }
  });
});

describe("CrisisForecastService", () => {
  it("authorizes and maps one exact 32-slot manifest without probability content", async () => {
    const calls: Array<{ readonly text: string; readonly values?: readonly unknown[] }> = [];
    const transaction = transactionWith(async (text, values) => {
      calls.push({ text, ...(values ? { values } : {}) });
      return [detailRow()];
    });
    const { service, membership, authorization } = serviceWith(transaction);

    const result = await service.get(principal, RUN_ID, { workspaceId: WORKSPACE_ID });

    expect(result).toMatchObject({
      schemaVersion: 1,
      workspaceId: WORKSPACE_ID,
      runId: RUN_ID,
      geographyId: GEOGRAPHY_ID,
      slotCount: 32,
      semantics: { hazardsAreIndependent: true, aggregateProbability: null },
    });
    expect(result.slots).toHaveLength(32);
    expect(result.slots[0]).toMatchObject({ hazard: "FX", horizonDays: 30 });
    expect(result.slots[31]).toMatchObject({ hazard: "WAR", horizonDays: 365 });
    expect(JSON.stringify(result)).not.toMatch(/rawProbability|calibratedProbability/);
    expect(result.slots.every((slot) => !("probability" in slot))).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.slots)).toBe(true);
    expect(calls[0]?.text).toContain("app.get_crisis_forecast_run($1::uuid, $2::uuid)");
    expect(calls[0]?.values).toEqual([WORKSPACE_ID, RUN_ID]);
    expect(membership).toHaveBeenCalledWith(principal, WORKSPACE_ID, transaction);
    expect(authorization).toHaveBeenCalledWith(principal, WORKSPACE_ID, transaction);
  });

  it("keeps missing, foreign, incomplete, and unservable runs non-enumerating", async () => {
    const { service } = serviceWith(transactionWith(async () => []));
    await expect(service.get(principal, RUN_ID, { workspaceId: WORKSPACE_ID })).rejects.toThrow(
      "Not Found",
    );
  });

  it("maps one independent slot with exact decimals, provenance, and bitemporal evidence", async () => {
    const calls: Array<{ readonly text: string; readonly values?: readonly unknown[] }> = [];
    const transaction = transactionWith(async (text, values) => {
      calls.push({ text, ...(values ? { values } : {}) });
      return [slotDetailRow()];
    });
    const { service } = serviceWith(transaction);

    const result = await service.getSlot(principal, SLOT_ID, { workspaceId: WORKSPACE_ID });

    expect(result).toMatchObject({
      schemaVersion: 1,
      workspaceId: WORKSPACE_ID,
      slotId: SLOT_ID,
      runId: RUN_ID,
      hazard: "FX",
      horizonDays: 30,
      probability: {
        raw: "0.250000000000000000",
        calibrated: "0.300000000000000000",
        aggregate: null,
      },
      uncertainty: {
        lower: "0.200000000000000000",
        upper: "0.400000000000000000",
        confidence: "0.900000000000000000",
      },
      model: { artifactId: MODEL_ID, version: "1.2.3" },
      assumptions: ["Published series remains comparable for this declared vintage."],
      invalidationCriteria: [
        expect.objectContaining({ criterionId: "fx.reserve.cover", requiredObservations: 2 }),
      ],
    });
    expect(result.evidence).toHaveLength(2);
    expect(result.evidence.map((pointer) => pointer.role)).toEqual(["supports", "contradicts"]);
    expect(result.evidence.every((pointer) => pointer.availableAt <= result.asOf)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.invalidationCriteria)).toBe(true);
    expect(calls[0]?.text).toContain("app.get_crisis_forecast_slot($1::uuid, $2::uuid)");
    expect(calls[0]?.values).toEqual([WORKSPACE_ID, SLOT_ID]);
  });

  it("keeps missing, foreign, incomplete, and unservable slots non-enumerating", async () => {
    const { service } = serviceWith(transactionWith(async () => []));
    await expect(
      service.getSlot(principal, SLOT_ID, { workspaceId: WORKSPACE_ID }),
    ).rejects.toMatchObject({ response: { code: "CRISIS_FORECAST_SLOT_NOT_FOUND" } });
  });

  it("fails closed on invalid slot probability, chronology, evidence shape, and absence semantics", async () => {
    const invalidProbability = slotDetailRow();
    invalidProbability.calibrated_probability = "1.100000000000000000";
    await expect(
      serviceWith(transactionWith(async () => [invalidProbability])).service.getSlot(
        principal,
        SLOT_ID,
        { workspaceId: WORKSPACE_ID },
      ),
    ).rejects.toThrow("calibrated_probability");

    const futureEvidence = slotDetailRow();
    const futurePointer = futureEvidence.evidence_pointers[0];
    if (futurePointer) futurePointer.availableAt = "2026-09-01T00:00:00.000001Z";
    await expect(
      serviceWith(transactionWith(async () => [futureEvidence])).service.getSlot(
        principal,
        SLOT_ID,
        { workspaceId: WORKSPACE_ID },
      ),
    ).rejects.toThrow("evidence_pointers[0].temporal");

    const malformedEvidence = slotDetailRow();
    if (malformedEvidence.evidence_pointers[0]) {
      delete malformedEvidence.evidence_pointers[0].bindingSha256;
    }
    await expect(
      serviceWith(transactionWith(async () => [malformedEvidence])).service.getSlot(
        principal,
        SLOT_ID,
        { workspaceId: WORKSPACE_ID },
      ),
    ).rejects.toThrow("evidence_pointers[0]");

    const legacyDirection = slotDetailRow();
    const legacyPointer = legacyDirection.evidence_pointers[0];
    if (legacyPointer) legacyPointer.direction = "increases";
    await expect(
      serviceWith(transactionWith(async () => [legacyDirection])).service.getSlot(
        principal,
        SLOT_ID,
        { workspaceId: WORKSPACE_ID },
      ),
    ).rejects.toThrow("evidence_pointers[0].direction");

    const contradictoryAbsence = slotDetailRow();
    contradictoryAbsence.evidence_absence_reason = "No supporting evidence was available.";
    await expect(
      serviceWith(transactionWith(async () => [contradictoryAbsence])).service.getSlot(
        principal,
        SLOT_ID,
        { workspaceId: WORKSPACE_ID },
      ),
    ).rejects.toThrow("evidence_absence_reason");
  });

  it("fails closed on malformed or duplicate invalidation criteria", async () => {
    const malformed = slotDetailRow();
    malformed.invalidation_criteria.push({ ...malformed.invalidation_criteria[0] });
    await expect(
      serviceWith(transactionWith(async () => [malformed])).service.getSlot(principal, SLOT_ID, {
        workspaceId: WORKSPACE_ID,
      }),
    ).rejects.toThrow("invalidation_criteria.criterionId");

    const unbounded = slotDetailRow();
    const firstCriterion = unbounded.invalidation_criteria[0];
    if (firstCriterion) firstCriterion.requiredObservations = 1_000_000;
    await expect(
      serviceWith(transactionWith(async () => [unbounded])).service.getSlot(principal, SLOT_ID, {
        workspaceId: WORKSPACE_ID,
      }),
    ).rejects.toThrow("requiredObservations");
  });

  it("returns a bounded pointer page and emits a complete continuation keyset", async () => {
    const calls: Array<readonly unknown[] | undefined> = [];
    const transaction = transactionWith(async (text, values) => {
      if (text.includes("app.list_crisis_forecast_runs")) {
        calls.push(values);
        return [pointerRow("418f47ac-19fc-7c92-ae91-0242ac120002"), pointerRow(RUN_ID)];
      }
      return [];
    });
    const { service } = serviceWith(transaction);
    const query: CrisisForecastRunPageQuery = {
      workspaceId: WORKSPACE_ID,
      geographyId: GEOGRAPHY_ID,
      limit: 2,
      beforeGeneratedAt: null,
      beforeRunId: null,
    };

    const result = await service.list(principal, query);

    expect(result).toMatchObject({
      count: 2,
      runs: [{ runId: "418f47ac-19fc-7c92-ae91-0242ac120002" }, { runId: RUN_ID }],
      nextCursor: {
        beforeGeneratedAt: "2026-09-02T08:00:00.000000Z",
        beforeRunId: RUN_ID,
      },
    });
    expect(calls).toEqual([[WORKSPACE_ID, GEOGRAPHY_ID, 2, null, null]]);
  });

  it("fails closed on malformed slot identities, digests, duplicates, and foreign page rows", async () => {
    const malformed = detailRow();
    malformed.slot_pointers[0] = { ...malformed.slot_pointers[0], hazard: "BANK" };
    await expect(
      serviceWith(transactionWith(async () => [malformed])).service.get(principal, RUN_ID, {
        workspaceId: WORKSPACE_ID,
      }),
    ).rejects.toThrow("slot_pointers[0].identity");

    const badDigest = detailRow();
    badDigest.slot_pointers[0] = { ...badDigest.slot_pointers[0], slotSha256: "bad" };
    await expect(
      serviceWith(transactionWith(async () => [badDigest])).service.get(principal, RUN_ID, {
        workspaceId: WORKSPACE_ID,
      }),
    ).rejects.toThrow("slotSha256");

    const duplicate = detailRow();
    duplicate.slot_pointers[1] = {
      ...duplicate.slot_pointers[1],
      slotId: duplicate.slot_pointers[0]?.slotId,
    };
    await expect(
      serviceWith(transactionWith(async () => [duplicate])).service.get(principal, RUN_ID, {
        workspaceId: WORKSPACE_ID,
      }),
    ).rejects.toThrow("slot_pointers.slotId");

    const foreignPage = pointerRow(RUN_ID);
    foreignPage.geography_id = "518f47ac-19fc-7c92-ae91-0242ac120099";
    await expect(
      serviceWith(transactionWith(async () => [foreignPage])).service.list(principal, {
        workspaceId: WORKSPACE_ID,
        geographyId: GEOGRAPHY_ID,
        limit: 50,
        beforeGeneratedAt: null,
        beforeRunId: null,
      }),
    ).rejects.toThrow("geography_id");

    const outOfOrder = [pointerRow(RUN_ID), pointerRow("418f47ac-19fc-7c92-ae91-0242ac120002")];
    await expect(
      serviceWith(transactionWith(async () => outOfOrder)).service.list(principal, {
        workspaceId: WORKSPACE_ID,
        geographyId: GEOGRAPHY_ID,
        limit: 2,
        beforeGeneratedAt: null,
        beforeRunId: null,
      }),
    ).rejects.toThrow("run_page.order");

    const impossibleChronology = detailRow();
    impossibleChronology.generated_at = "2026-08-31T23:59:59.999999Z";
    await expect(
      serviceWith(transactionWith(async () => [impossibleChronology])).service.get(
        principal,
        RUN_ID,
        { workspaceId: WORKSPACE_ID },
      ),
    ).rejects.toThrow("generated_at");
  });
});

function serviceWith(transaction: TenantTransaction): {
  readonly service: CrisisForecastService;
  readonly membership: ReturnType<typeof vi.fn>;
  readonly authorization: ReturnType<typeof vi.fn>;
} {
  const database = {
    withPrincipal: async (
      _principal: Principal,
      operation: (inner: TenantTransaction) => Promise<unknown>,
    ) => operation(transaction),
  };
  const membership = vi.fn(async () => WORKSPACE_ID);
  const authorization = vi.fn(async () => undefined);
  return {
    service: new CrisisForecastService(
      database as unknown as PostgresRuntime,
      { assertMembership: membership } as unknown as WorkspaceAccessService,
      { assertEconomicStateAccess: authorization } as unknown as GovernedAuthorizationService,
    ),
    membership,
    authorization,
  };
}

function transactionWith(
  responder: (
    text: string,
    values?: readonly unknown[],
  ) => Promise<readonly Record<string, unknown>[]>,
): TenantTransaction {
  return {
    query: async <Row extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<QueryResult<Row>> => {
      const rows = await responder(text, values);
      return { rows: rows as readonly Row[], rowCount: rows.length };
    },
  };
}

function pointerRow(runId: string): Record<string, unknown> {
  return {
    run_id: runId,
    geography_id: GEOGRAPHY_ID,
    as_of: "2026-09-01T00:00:00.000000Z",
    generated_at: "2026-09-02T08:00:00.000000Z",
    dataset_snapshot_id: SNAPSHOT_ID,
    run_sha256: "a".repeat(64),
    completion_id: COMPLETION_ID,
    completion_sha256: "b".repeat(64),
  };
}

function detailRow(): Record<string, unknown> & {
  slot_pointers: Array<Record<string, unknown>>;
} {
  const slots: Array<Record<string, unknown>> = [];
  let index = 1;
  for (const hazard of ["FX", "BANK", "SOV", "MON", "POL", "COUP", "CIV", "WAR"] as const) {
    for (const horizonDays of [30, 90, 180, 365] as const) {
      slots.push({
        slotId: `818f47ac-19fc-7c92-ae91-${String(index).padStart(12, "0")}`,
        hazard,
        horizonDays,
        slotSha256: index.toString(16).padStart(64, "0"),
      });
      index += 1;
    }
  }
  return {
    ...pointerRow(RUN_ID),
    dataset_snapshot_sha256: "c".repeat(64),
    slot_pointers: slots,
  };
}

function slotDetailRow(): Record<string, unknown> & {
  evidence_pointers: Array<Record<string, unknown>>;
  invalidation_criteria: Array<Record<string, unknown>>;
} {
  return {
    slot_id: SLOT_ID,
    run_id: RUN_ID,
    geography_id: GEOGRAPHY_ID,
    hazard: "FX",
    horizon_days: 30,
    as_of: "2026-09-01T00:00:00.000000Z",
    generated_at: "2026-09-02T08:00:00.000000Z",
    run_sha256: "a".repeat(64),
    slot_sha256: "d".repeat(64),
    raw_probability: "0.250000000000000000",
    calibrated_probability: "0.300000000000000000",
    uncertainty_lower: "0.200000000000000000",
    uncertainty_upper: "0.400000000000000000",
    uncertainty_confidence: "0.900000000000000000",
    uncertainty_method: "conformal interval",
    calibration_status: "calibrated",
    out_of_domain: false,
    model_artifact_id: MODEL_ID,
    model_artifact_sha256: "e".repeat(64),
    model_version: "1.2.3",
    training_data_cutoff: "2026-07-01T00:00:00.000000Z",
    calibrated_through: "2026-08-01T00:00:00.000000Z",
    model_configuration_sha256: "f".repeat(64),
    model_code_sha256: "1".repeat(64),
    assumptions: ["Published series remains comparable for this declared vintage."],
    invalidation_criteria: [
      {
        criterionId: "fx.reserve.cover",
        description: "Invalidate if reserve cover remains below the declared boundary.",
        indicatorKey: "fx.reserve.cover",
        operator: "less_than",
        threshold: "3 months",
        requiredObservations: 2,
      },
    ],
    evidence_absence_reason: null,
    counter_evidence_absence_reason: null,
    evidence_pointers: [
      evidencePointer("a18f47ac-19fc-7c92-ae91-0242ac120001", "supports", "2"),
      evidencePointer("b18f47ac-19fc-7c92-ae91-0242ac120001", "contradicts", "3"),
    ],
  };
}

function evidencePointer(
  bindingId: string,
  role: "contradicts" | "supports",
  digestCharacter: string,
): Record<string, unknown> {
  return {
    bindingId,
    role,
    indicatorKey: "fx.reserve.cover",
    direction: role === "supports" ? "increases_risk" : "decreases_risk",
    observedAt: "2026-07-30T00:00:00.000000Z",
    availableAt: "2026-08-02T00:00:00.000000Z",
    sourceKind: "canonical_admission",
    sourceId: `${digestCharacter}18f47ac-19fc-7c92-ae91-0242ac120001`,
    sourceSha256: digestCharacter.repeat(64),
    dataVintageId: SNAPSHOT_ID,
    dataVintageSha256: "4".repeat(64),
    bindingSha256: "5".repeat(64),
  };
}
