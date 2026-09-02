import { describe, expect, it } from "vitest";
import {
  IDS,
  makeApprovedLedger,
  makeBaseline,
  makeDefinition,
  makeRequest,
  sha,
} from "./fixtures.test-helper.js";
import { digestJson, immutableWithDigest } from "./internals.js";
import {
  assertRetryMatchesOriginal,
  assertScenarioCheckpointIntegrity,
  assertScenarioRunIntegrity,
  assertScenarioRunRequestIntegrity,
  createRetryRunRequest,
  createScenarioCheckpoint,
  createScenarioRun,
  createScenarioRunRequest,
  registerIdempotentRunRequest,
  resumeScenarioRun,
  type ScenarioCheckpoint,
  type ScenarioRun,
  serializedRunSize,
  transitionScenarioRun,
} from "./runs.js";

function context() {
  const baseline = makeBaseline();
  const definition = makeDefinition(baseline);
  const ledger = makeApprovedLedger(definition, baseline);
  const request = makeRequest(definition, baseline, ledger);
  return { baseline, definition, ledger, request };
}

function startRun() {
  const ctx = context();
  const queued = createScenarioRun(ctx.request);
  const running = transitionScenarioRun(
    queued,
    {
      tenantId: IDS.tenant,
      eventId: IDS.start,
      actorId: IDS.worker,
      actorRole: "worker",
      occurredAt: "2026-01-03T01:00:00Z",
      expectedStateVersion: 1,
      toStatus: "running",
      reason: "Worker started the run.",
      checkpoint: null,
      outputArtifactSha256: null,
    },
    ctx.request,
  );
  return { ...ctx, queued, running };
}

function checkpointInput(ctx: ReturnType<typeof startRun>) {
  return {
    schemaVersion: 1 as const,
    tenantId: IDS.tenant,
    checkpointId: IDS.checkpoint,
    runId: IDS.run,
    requestSha256: ctx.request.manifestSha256,
    replayIdentitySha256: ctx.request.replayIdentitySha256,
    scenarioDefinitionSha256: ctx.definition.manifestSha256,
    baselineIdentitySha256: ctx.baseline.manifestSha256,
    createdAt: "2026-01-03T01:30:00Z",
    completedMembers: 2,
    nextMemberIndex: 2,
    workerStateSha256: sha("8"),
  };
}

function failedRun(request: ReturnType<typeof context>["request"]): ScenarioRun {
  let run = createScenarioRun(request);
  run = transitionScenarioRun(
    run,
    {
      tenantId: request.tenantId,
      eventId: IDS.start,
      actorId: IDS.worker,
      actorRole: "worker",
      occurredAt: "2026-01-03T01:00:00Z",
      expectedStateVersion: 1,
      toStatus: "running",
      reason: "Worker started the original run.",
      checkpoint: null,
      outputArtifactSha256: null,
    },
    request,
  );
  return transitionScenarioRun(
    run,
    {
      tenantId: request.tenantId,
      eventId: "00000000-0000-4000-8000-000000000061",
      actorId: IDS.worker,
      actorRole: "worker",
      occurredAt: "2026-01-03T02:00:00Z",
      expectedStateVersion: 2,
      toStatus: "failed",
      reason: "Infrastructure failure before result publication.",
      checkpoint: null,
      outputArtifactSha256: null,
    },
    request,
  );
}

describe("idempotent scenario run requests and retries", () => {
  it("creates a stable bounded replay identity", () => {
    const ctx = context();
    expect(ctx.request.outputMetricKeys).toEqual(["output_index"]);
    expect(ctx.request.replayIdentitySha256).toHaveLength(64);
    expect(Object.isFrozen(ctx.request.resourceBudget)).toBe(true);
    expect(() =>
      assertScenarioRunRequestIntegrity(ctx.request, ctx.definition, ctx.baseline, ctx.ledger),
    ).not.toThrow();
  });

  it("returns the original request for the same idempotency replay", () => {
    const ctx = context();
    const { manifestSha256: _manifest, replayIdentitySha256: _replay, ...body } = ctx.request;
    const returned = registerIdempotentRunRequest(
      ctx.request,
      {
        ...body,
        requestId: "00000000-0000-4000-8000-000000000041",
        runId: "00000000-0000-4000-8000-000000000042",
        requestedAt: "2026-01-03T00:30:00Z",
      },
      ctx.definition,
      ctx.baseline,
      ctx.ledger,
    );
    expect(returned).toBe(ctx.request);
  });

  it("rejects idempotency key reuse with changed computation", () => {
    const ctx = context();
    expect(() =>
      registerIdempotentRunRequest(
        ctx.request,
        {
          schemaVersion: 1,
          tenantId: IDS.tenant,
          requestId: "00000000-0000-4000-8000-000000000041",
          runId: "00000000-0000-4000-8000-000000000042",
          idempotencyKey: ctx.request.idempotencyKey,
          attempt: 1,
          retryOfRunId: null,
          retryReason: null,
          requestedBy: IDS.author,
          requestedAt: "2026-01-03T00:30:00Z",
          scenarioId: ctx.definition.scenarioId,
          scenarioDefinitionSha256: ctx.definition.manifestSha256,
          baselineIdentitySha256: ctx.baseline.manifestSha256,
          seed: "42",
          steps: 13,
          ensembleSize: 4,
          outputMetricKeys: ["output_index"],
          resourceBudget: { maxOutputCells: 100, maxArtifactBytes: 100_000 },
        },
        ctx.definition,
        ctx.baseline,
        ctx.ledger,
      ),
    ).toThrow(/different replay identity/);
  });

  it("creates exact-computation retries and detects retry mismatch", () => {
    const ctx = context();
    const originalRun = failedRun(ctx.request);
    const retry = createRetryRunRequest(
      ctx.request,
      originalRun,
      {
        requestId: IDS.retryRequest,
        runId: IDS.retryRun,
        idempotencyKey: "scenario-run-retry-0002",
        requestedBy: IDS.operator,
        requestedAt: "2026-01-04T00:00:00Z",
        reason: "Retry a failed infrastructure attempt.",
      },
      ctx.definition,
      ctx.baseline,
      ctx.ledger,
    );
    expect(retry.replayIdentitySha256).toBe(ctx.request.replayIdentitySha256);
    expect(retry.retryOfRunId).toBe(ctx.request.runId);
    expect(retry.retryReason).toBe("Retry a failed infrastructure attempt.");
    expect(() => assertRetryMatchesOriginal(ctx.request, retry)).not.toThrow();

    const mismatched = createScenarioRunRequest(
      {
        schemaVersion: 1,
        tenantId: IDS.tenant,
        requestId: IDS.retryRequest,
        runId: IDS.retryRun,
        idempotencyKey: "scenario-run-retry-0003",
        attempt: 2,
        retryOfRunId: IDS.run,
        retryReason: "Retry the failed infrastructure attempt.",
        requestedBy: IDS.operator,
        requestedAt: "2026-01-04T00:00:00Z",
        scenarioId: ctx.definition.scenarioId,
        scenarioDefinitionSha256: ctx.definition.manifestSha256,
        baselineIdentitySha256: ctx.baseline.manifestSha256,
        seed: "42",
        steps: 99,
        ensembleSize: 4,
        outputMetricKeys: ["output_index"],
        resourceBudget: { maxOutputCells: 100, maxArtifactBytes: 100_000 },
      },
      ctx.definition,
      ctx.baseline,
      ctx.ledger,
    );
    expect(() => assertRetryMatchesOriginal(ctx.request, mismatched)).toThrow(/replay identity/);

    expect(() =>
      createRetryRunRequest(
        ctx.request,
        createScenarioRun(ctx.request),
        {
          requestId: "00000000-0000-4000-8000-000000000062",
          runId: "00000000-0000-4000-8000-000000000063",
          idempotencyKey: "scenario-run-retry-0004",
          requestedBy: IDS.operator,
          requestedAt: "2026-01-04T00:00:00Z",
          reason: "Invalid retry while queued.",
        },
        ctx.definition,
        ctx.baseline,
        ctx.ledger,
      ),
    ).toThrow(/failed or cancelled/);
  });

  it.each([
    ["ensemble", { ensembleSize: 513 }],
    ["steps", { steps: 10_001 }],
    ["cells", { resourceBudget: { maxOutputCells: 3, maxArtifactBytes: 100_000 } }],
    ["seed", { seed: "18446744073709551616" }],
    ["retry marker", { attempt: 2, retryOfRunId: null }],
    ["short idempotency key", { idempotencyKey: "short" }],
    ["request predates scenario", { requestedAt: "2026-01-01T13:00:00Z" }],
    ["empty output metrics", { outputMetricKeys: [] }],
    [
      "self retry",
      {
        attempt: 2,
        retryOfRunId: IDS.run,
        retryReason: "Invalid self retry.",
      },
    ],
  ])("rejects request bound violation: %s", (_label, override) => {
    const ctx = context();
    expect(() => makeRequest(ctx.definition, ctx.baseline, ctx.ledger, override)).toThrow();
  });
});

describe("durable scenario run state machine", () => {
  it("checkpoints, resumes, and succeeds with a verified event chain", () => {
    const ctx = startRun();
    const checkpoint = createScenarioCheckpoint(checkpointInput(ctx), ctx.request);
    const checkpointed = transitionScenarioRun(
      ctx.running,
      {
        tenantId: IDS.tenant,
        eventId: "00000000-0000-4000-8000-000000000043",
        actorId: IDS.worker,
        actorRole: "worker",
        occurredAt: "2026-01-03T02:00:00Z",
        expectedStateVersion: 2,
        toStatus: "checkpointed",
        reason: "Persist a bounded checkpoint.",
        checkpoint,
        outputArtifactSha256: null,
      },
      ctx.request,
    );
    const resumed = resumeScenarioRun(
      checkpointed,
      {
        tenantId: IDS.tenant,
        eventId: IDS.resumed,
        actorId: IDS.worker,
        occurredAt: "2026-01-03T03:00:00Z",
        expectedStateVersion: 3,
        checkpoint,
      },
      ctx.request,
    );
    const succeeded = transitionScenarioRun(
      resumed,
      {
        tenantId: IDS.tenant,
        eventId: IDS.success,
        actorId: IDS.worker,
        actorRole: "worker",
        occurredAt: "2026-01-03T04:00:00Z",
        expectedStateVersion: 4,
        toStatus: "succeeded",
        reason: "Completed all members after resume.",
        checkpoint: null,
        outputArtifactSha256: sha("9"),
      },
      ctx.request,
    );

    expect(checkpoint.resumeTokenSha256).toHaveLength(64);
    expect(succeeded.status).toBe("succeeded");
    expect(succeeded.stateVersion).toBe(5);
    expect(succeeded.latestCheckpoint?.manifestSha256).toBe(checkpoint.manifestSha256);
    expect(serializedRunSize(succeeded)).toBeGreaterThan(1_000);
    expect(() => assertScenarioRunIntegrity(succeeded, ctx.request)).not.toThrow();
  });

  it("supports explicit cancellation while queued, running, or checkpointed", () => {
    const ctx = startRun();
    const queuedCancelled = transitionScenarioRun(
      ctx.queued,
      {
        tenantId: IDS.tenant,
        eventId: "00000000-0000-4000-8000-000000000044",
        actorId: IDS.author,
        actorRole: "requester",
        occurredAt: "2026-01-03T00:30:00Z",
        expectedStateVersion: 1,
        toStatus: "cancelled",
        reason: "Requester cancelled before execution.",
        checkpoint: null,
        outputArtifactSha256: null,
      },
      ctx.request,
    );
    expect(queuedCancelled.status).toBe("cancelled");
    const runningCancelled = transitionScenarioRun(
      ctx.running,
      {
        tenantId: IDS.tenant,
        eventId: "00000000-0000-4000-8000-000000000045",
        actorId: IDS.operator,
        actorRole: "operator",
        occurredAt: "2026-01-03T02:00:00Z",
        expectedStateVersion: 2,
        toStatus: "cancelled",
        reason: "Operator cancelled execution.",
        checkpoint: null,
        outputArtifactSha256: null,
      },
      ctx.request,
    );
    expect(runningCancelled.status).toBe("cancelled");
  });

  it("supports explicit failure and bars all terminal transitions", () => {
    const ctx = startRun();
    const failed = transitionScenarioRun(
      ctx.running,
      {
        tenantId: IDS.tenant,
        eventId: "00000000-0000-4000-8000-000000000046",
        actorId: IDS.worker,
        actorRole: "worker",
        occurredAt: "2026-01-03T02:00:00Z",
        expectedStateVersion: 2,
        toStatus: "failed",
        reason: "Worker encountered a bounded execution error.",
        checkpoint: null,
        outputArtifactSha256: null,
      },
      ctx.request,
    );
    expect(() =>
      transitionScenarioRun(
        failed,
        {
          tenantId: IDS.tenant,
          eventId: "00000000-0000-4000-8000-000000000047",
          actorId: IDS.worker,
          actorRole: "worker",
          occurredAt: "2026-01-03T03:00:00Z",
          expectedStateVersion: 3,
          toStatus: "running",
          reason: "Illegal resurrection.",
          checkpoint: null,
          outputArtifactSha256: null,
        },
        ctx.request,
      ),
    ).toThrow(/illegal/);
  });

  it.each([
    [
      "illegal transition",
      { toStatus: "succeeded", actorRole: "worker", outputArtifactSha256: sha("9") },
    ],
    ["stale state", { toStatus: "running", expectedStateVersion: 0, actorRole: "worker" }],
    ["wrong role", { toStatus: "running", actorRole: "requester" }],
    ["unknown role", { toStatus: "running", actorRole: "unknown" }],
    ["cross tenant", { toStatus: "running", tenantId: IDS.tenantTwo, actorRole: "worker" }],
    [
      "backward time",
      { toStatus: "running", occurredAt: "2026-01-01T00:00:00Z", actorRole: "worker" },
    ],
  ])("rejects transition violation: %s", (_label, override) => {
    const ctx = context();
    const queued = createScenarioRun(ctx.request);
    const transition = Object.assign(
      {
        tenantId: IDS.tenant,
        eventId: IDS.start,
        actorId: IDS.worker,
        actorRole: "worker",
        occurredAt: "2026-01-03T01:00:00Z",
        expectedStateVersion: 1,
        toStatus: "running",
        reason: "Transition attempt.",
        checkpoint: null,
        outputArtifactSha256: null,
      },
      override,
    );
    expect(() => transitionScenarioRun(queued, transition as never, ctx.request)).toThrow();
  });

  it("rejects checkpoint bounds, mismatches, tampering, and wrong resume tokens", () => {
    const ctx = startRun();
    expect(() =>
      createScenarioCheckpoint(
        { ...checkpointInput(ctx), completedMembers: 4, nextMemberIndex: 4 },
        ctx.request,
      ),
    ).toThrow(/integer/);
    expect(() =>
      createScenarioCheckpoint({ ...checkpointInput(ctx), nextMemberIndex: 3 }, ctx.request),
    ).toThrow(/contiguous/);
    expect(() =>
      createScenarioCheckpoint(
        { ...checkpointInput(ctx), replayIdentitySha256: sha("7") },
        ctx.request,
      ),
    ).toThrow(/exact run/);
    expect(() =>
      createScenarioCheckpoint(
        { ...checkpointInput(ctx), createdAt: "2026-01-02T23:59:59Z" },
        ctx.request,
      ),
    ).toThrow(/predate/);
    const checkpoint = createScenarioCheckpoint(checkpointInput(ctx), ctx.request);
    const tampered = structuredClone(checkpoint) as ScenarioCheckpoint & {
      workerStateSha256: string;
    };
    tampered.workerStateSha256 = sha("0");
    expect(() => assertScenarioCheckpointIntegrity(tampered, ctx.request)).toThrow(/digest/);
    expect(() =>
      resumeScenarioRun(
        ctx.running,
        {
          tenantId: IDS.tenant,
          eventId: IDS.resumed,
          actorId: IDS.worker,
          occurredAt: "2026-01-03T03:00:00Z",
          expectedStateVersion: 2,
          checkpoint,
        },
        ctx.request,
      ),
    ).toThrow(/latest checkpoint/);
  });

  it("detects run tampering", () => {
    const ctx = startRun();
    const tampered = structuredClone(ctx.running) as ScenarioRun & { status: "failed" };
    tampered.status = "failed";
    expect(() => assertScenarioRunIntegrity(tampered, ctx.request)).toThrow(/digest/);

    const { manifestSha256: _manifest, ...runBody } = structuredClone(ctx.running);
    const forgedEvent = { ...runBody.events[1], actorRole: "requester" as const };
    const { eventSha256: _eventSha, ...eventBody } = forgedEvent;
    const readdressedEvent = { ...eventBody, eventSha256: digestJson(eventBody) };
    const readdressed = immutableWithDigest({
      ...runBody,
      events: [runBody.events[0], readdressedEvent],
    });
    expect(() => assertScenarioRunIntegrity(readdressed as ScenarioRun, ctx.request)).toThrow(
      /worker or operator/,
    );
  });
});
