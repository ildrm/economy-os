import type { ScenarioGovernanceLedger } from "./collaboration.js";
import { assertLedgerApprovesDefinition } from "./collaboration.js";
import type { BaselineIdentity, ScenarioDefinition } from "./definitions.js";
import { assertBaselineIntegrity, assertScenarioDefinitionIntegrity } from "./definitions.js";
import {
  assertDigestIntegrity,
  assertExactKeys,
  assertInteger,
  assertIsoInstant,
  assertKey,
  assertNonBlank,
  assertPlainRecord,
  assertSha256,
  assertUint64,
  assertUuid,
  canonicalJson,
  compareInstants,
  deepFreeze,
  digestJson,
  immutableWithDigest,
  uniqueBy,
} from "./internals.js";

export interface ScenarioRunRequestInput {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly requestId: string;
  readonly runId: string;
  readonly idempotencyKey: string;
  readonly attempt: number;
  readonly retryOfRunId: string | null;
  readonly retryReason: string | null;
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly scenarioId: string;
  readonly scenarioDefinitionSha256: string;
  readonly baselineIdentitySha256: string;
  readonly seed: string;
  readonly steps: number;
  readonly ensembleSize: number;
  readonly outputMetricKeys: readonly string[];
  readonly resourceBudget: {
    readonly maxOutputCells: number;
    readonly maxArtifactBytes: number;
  };
}

export interface ScenarioRunRequest extends ScenarioRunRequestInput {
  readonly replayIdentitySha256: string;
  readonly manifestSha256: string;
}

const RUN_REQUEST_KEYS = [
  "schemaVersion",
  "tenantId",
  "requestId",
  "runId",
  "idempotencyKey",
  "attempt",
  "retryOfRunId",
  "retryReason",
  "requestedBy",
  "requestedAt",
  "scenarioId",
  "scenarioDefinitionSha256",
  "baselineIdentitySha256",
  "seed",
  "steps",
  "ensembleSize",
  "outputMetricKeys",
  "resourceBudget",
] as const;

function computationalIdentity(input: ScenarioRunRequestInput): string {
  return digestJson({
    schemaVersion: input.schemaVersion,
    tenantId: input.tenantId,
    scenarioId: input.scenarioId,
    scenarioDefinitionSha256: input.scenarioDefinitionSha256,
    baselineIdentitySha256: input.baselineIdentitySha256,
    seed: input.seed,
    steps: input.steps,
    ensembleSize: input.ensembleSize,
    outputMetricKeys: [...input.outputMetricKeys].sort(),
    resourceBudget: input.resourceBudget,
  });
}

function buildRunRequest(
  input: ScenarioRunRequestInput,
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
  ledger: ScenarioGovernanceLedger,
): Readonly<ScenarioRunRequest> {
  assertBaselineIntegrity(baseline);
  assertScenarioDefinitionIntegrity(definition, baseline);
  assertLedgerApprovesDefinition(ledger, definition);
  assertPlainRecord(input, "runRequest");
  assertExactKeys(input, RUN_REQUEST_KEYS, "runRequest");
  if (input.schemaVersion !== 1) throw new TypeError("run request schemaVersion must be 1");
  assertUuid(input.tenantId, "runRequest.tenantId");
  assertUuid(input.requestId, "runRequest.requestId");
  assertUuid(input.runId, "runRequest.runId");
  assertNonBlank(input.idempotencyKey, "runRequest.idempotencyKey", 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/.test(input.idempotencyKey)) {
    throw new TypeError("idempotencyKey must be 8..128 portable characters");
  }
  assertInteger(input.attempt, "runRequest.attempt", 1, 100);
  if ((input.attempt === 1) !== (input.retryOfRunId === null && input.retryReason === null)) {
    throw new TypeError("only first attempts may omit retry identity and reason");
  }
  if (input.retryOfRunId !== null) {
    assertUuid(input.retryOfRunId, "runRequest.retryOfRunId");
    if (input.retryOfRunId === input.runId) throw new TypeError("retry cannot reference itself");
    if (input.retryReason === null) throw new TypeError("retry requires a durable reason");
    assertNonBlank(input.retryReason, "runRequest.retryReason", 1_000);
  }
  assertUuid(input.requestedBy, "runRequest.requestedBy");
  assertIsoInstant(input.requestedAt, "runRequest.requestedAt");
  if (compareInstants(input.requestedAt, definition.createdAt) < 0) {
    throw new TypeError("run request cannot predate the scenario definition");
  }
  if (
    input.tenantId !== definition.tenantId ||
    input.tenantId !== baseline.tenantId ||
    input.tenantId !== ledger.tenantId ||
    input.scenarioId !== definition.scenarioId ||
    input.scenarioDefinitionSha256 !== definition.manifestSha256 ||
    input.baselineIdentitySha256 !== baseline.manifestSha256
  ) {
    throw new TypeError("run request must bind approved same-tenant scenario and baseline digests");
  }
  assertUint64(input.seed, "runRequest.seed");
  assertInteger(input.steps, "runRequest.steps", 1, 10_000);
  assertInteger(input.ensembleSize, "runRequest.ensembleSize", 1, 512);
  if (
    !Array.isArray(input.outputMetricKeys) ||
    input.outputMetricKeys.length === 0 ||
    input.outputMetricKeys.length > 64
  ) {
    throw new TypeError("outputMetricKeys must contain 1..64 items");
  }
  uniqueBy(input.outputMetricKeys, (key) => key, "outputMetricKeys");
  for (const key of input.outputMetricKeys) assertKey(key, "runRequest.outputMetricKey");
  assertPlainRecord(input.resourceBudget, "runRequest.resourceBudget");
  assertExactKeys(
    input.resourceBudget,
    ["maxOutputCells", "maxArtifactBytes"],
    "runRequest.resourceBudget",
  );
  assertInteger(input.resourceBudget.maxOutputCells, "maxOutputCells", 1, 100_000);
  assertInteger(input.resourceBudget.maxArtifactBytes, "maxArtifactBytes", 1_024, 50_000_000);
  const requiredCells = input.ensembleSize * input.outputMetricKeys.length;
  if (requiredCells > input.resourceBudget.maxOutputCells) {
    throw new TypeError("run request exceeds maxOutputCells resource budget");
  }
  const normalized: ScenarioRunRequestInput = {
    ...input,
    outputMetricKeys: [...input.outputMetricKeys].sort(),
  };
  return immutableWithDigest({
    ...normalized,
    replayIdentitySha256: computationalIdentity(normalized),
  });
}

export function createScenarioRunRequest(
  input: ScenarioRunRequestInput,
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
  ledger: ScenarioGovernanceLedger,
): Readonly<ScenarioRunRequest> {
  return buildRunRequest(input, definition, baseline, ledger);
}

export function assertScenarioRunRequestIntegrity(
  request: ScenarioRunRequest,
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
  ledger: ScenarioGovernanceLedger,
): void {
  assertDigestIntegrity(request, "runRequest");
  const { manifestSha256: _manifest, replayIdentitySha256, ...body } = request;
  if (computationalIdentity(body) !== replayIdentitySha256) {
    throw new TypeError("run request replay identity does not match computation");
  }
  buildRunRequest(body, definition, baseline, ledger);
}

export function registerIdempotentRunRequest(
  existing: ScenarioRunRequest | null,
  input: ScenarioRunRequestInput,
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
  ledger: ScenarioGovernanceLedger,
): Readonly<ScenarioRunRequest> {
  const candidate = buildRunRequest(input, definition, baseline, ledger);
  if (!existing) return candidate;
  assertScenarioRunRequestIntegrity(existing, definition, baseline, ledger);
  if (existing.tenantId !== candidate.tenantId) {
    throw new TypeError("idempotency lookup crossed tenant boundary");
  }
  if (existing.idempotencyKey !== candidate.idempotencyKey) {
    throw new TypeError("existing request does not belong to this idempotency key");
  }
  if (existing.replayIdentitySha256 !== candidate.replayIdentitySha256) {
    throw new TypeError("idempotency key was reused with a different replay identity");
  }
  return existing;
}

export interface RetryRunInput {
  readonly requestId: string;
  readonly runId: string;
  readonly idempotencyKey: string;
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly reason: string;
}

export function assertRetryMatchesOriginal(
  original: ScenarioRunRequest,
  retry: ScenarioRunRequest,
): void {
  assertDigestIntegrity(original, "originalRunRequest");
  assertDigestIntegrity(retry, "retryRunRequest");
  if (
    retry.tenantId !== original.tenantId ||
    retry.retryOfRunId !== original.runId ||
    retry.attempt !== original.attempt + 1 ||
    retry.replayIdentitySha256 !== original.replayIdentitySha256
  ) {
    throw new TypeError("retry must advance one attempt and preserve the exact replay identity");
  }
}

export function createRetryRunRequest(
  original: ScenarioRunRequest,
  originalRun: ScenarioRun,
  retry: RetryRunInput,
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
  ledger: ScenarioGovernanceLedger,
): Readonly<ScenarioRunRequest> {
  assertScenarioRunRequestIntegrity(original, definition, baseline, ledger);
  assertScenarioRunIntegrity(originalRun, original);
  if (originalRun.status !== "failed" && originalRun.status !== "cancelled") {
    throw new TypeError("retry requires a failed or cancelled original run");
  }
  assertNonBlank(retry.reason, "retry.reason", 1_000);
  if (retry.runId === original.runId || retry.requestId === original.requestId) {
    throw new TypeError("retry requires new request and run identifiers");
  }
  const candidate = buildRunRequest(
    {
      schemaVersion: 1,
      tenantId: original.tenantId,
      requestId: retry.requestId,
      runId: retry.runId,
      idempotencyKey: retry.idempotencyKey,
      attempt: original.attempt + 1,
      retryOfRunId: original.runId,
      retryReason: retry.reason,
      requestedBy: retry.requestedBy,
      requestedAt: retry.requestedAt,
      scenarioId: original.scenarioId,
      scenarioDefinitionSha256: original.scenarioDefinitionSha256,
      baselineIdentitySha256: original.baselineIdentitySha256,
      seed: original.seed,
      steps: original.steps,
      ensembleSize: original.ensembleSize,
      outputMetricKeys: original.outputMetricKeys,
      resourceBudget: original.resourceBudget,
    },
    definition,
    baseline,
    ledger,
  );
  assertRetryMatchesOriginal(original, candidate);
  return candidate;
}

export interface ScenarioCheckpointInput {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly checkpointId: string;
  readonly runId: string;
  readonly requestSha256: string;
  readonly replayIdentitySha256: string;
  readonly scenarioDefinitionSha256: string;
  readonly baselineIdentitySha256: string;
  readonly createdAt: string;
  readonly completedMembers: number;
  readonly nextMemberIndex: number;
  readonly workerStateSha256: string;
}

export interface ScenarioCheckpoint extends ScenarioCheckpointInput {
  readonly resumeTokenSha256: string;
  readonly manifestSha256: string;
}

function resumeToken(input: ScenarioCheckpointInput): string {
  return digestJson({
    tenantId: input.tenantId,
    runId: input.runId,
    requestSha256: input.requestSha256,
    replayIdentitySha256: input.replayIdentitySha256,
    scenarioDefinitionSha256: input.scenarioDefinitionSha256,
    baselineIdentitySha256: input.baselineIdentitySha256,
    completedMembers: input.completedMembers,
    nextMemberIndex: input.nextMemberIndex,
    workerStateSha256: input.workerStateSha256,
  });
}

export function createScenarioCheckpoint(
  input: ScenarioCheckpointInput,
  request: ScenarioRunRequest,
): Readonly<ScenarioCheckpoint> {
  assertDigestIntegrity(request, "runRequest");
  assertPlainRecord(input, "checkpoint");
  assertExactKeys(
    input as unknown as Record<string, unknown>,
    [
      "schemaVersion",
      "tenantId",
      "checkpointId",
      "runId",
      "requestSha256",
      "replayIdentitySha256",
      "scenarioDefinitionSha256",
      "baselineIdentitySha256",
      "createdAt",
      "completedMembers",
      "nextMemberIndex",
      "workerStateSha256",
    ],
    "checkpoint",
  );
  if (input.schemaVersion !== 1) throw new TypeError("checkpoint schemaVersion must be 1");
  assertUuid(input.tenantId, "checkpoint.tenantId");
  assertUuid(input.checkpointId, "checkpoint.checkpointId");
  assertUuid(input.runId, "checkpoint.runId");
  assertIsoInstant(input.createdAt, "checkpoint.createdAt");
  if (compareInstants(input.createdAt, request.requestedAt) < 0) {
    throw new TypeError("checkpoint cannot predate its run request");
  }
  assertSha256(input.requestSha256, "checkpoint.requestSha256");
  assertSha256(input.replayIdentitySha256, "checkpoint.replayIdentitySha256");
  assertSha256(input.scenarioDefinitionSha256, "checkpoint.scenarioDefinitionSha256");
  assertSha256(input.baselineIdentitySha256, "checkpoint.baselineIdentitySha256");
  assertSha256(input.workerStateSha256, "checkpoint.workerStateSha256");
  if (
    input.tenantId !== request.tenantId ||
    input.runId !== request.runId ||
    input.requestSha256 !== request.manifestSha256 ||
    input.replayIdentitySha256 !== request.replayIdentitySha256 ||
    input.scenarioDefinitionSha256 !== request.scenarioDefinitionSha256 ||
    input.baselineIdentitySha256 !== request.baselineIdentitySha256
  ) {
    throw new TypeError("checkpoint does not belong to the exact run replay identity");
  }
  assertInteger(input.completedMembers, "checkpoint.completedMembers", 1, request.ensembleSize - 1);
  if (input.nextMemberIndex !== input.completedMembers) {
    throw new TypeError("checkpoint may retain only a contiguous set of completed members");
  }
  return immutableWithDigest({ ...input, resumeTokenSha256: resumeToken(input) });
}

export function assertScenarioCheckpointIntegrity(
  checkpoint: ScenarioCheckpoint,
  request: ScenarioRunRequest,
): void {
  assertDigestIntegrity(checkpoint, "checkpoint");
  const { manifestSha256: _manifest, resumeTokenSha256, ...body } = checkpoint;
  if (resumeToken(body) !== resumeTokenSha256) {
    throw new TypeError("checkpoint resume token does not match content");
  }
  createScenarioCheckpoint(body, request);
}

export type ScenarioRunStatus =
  | "queued"
  | "running"
  | "checkpointed"
  | "succeeded"
  | "failed"
  | "cancelled";

export type RunActorRole = "requester" | "worker" | "operator";

const RUN_STATUSES: readonly ScenarioRunStatus[] = [
  "queued",
  "running",
  "checkpointed",
  "succeeded",
  "failed",
  "cancelled",
];

export interface RunTransitionInput {
  readonly tenantId: string;
  readonly eventId: string;
  readonly actorId: string;
  readonly actorRole: RunActorRole;
  readonly occurredAt: string;
  readonly expectedStateVersion: number;
  readonly toStatus: Exclude<ScenarioRunStatus, "queued">;
  readonly reason: string;
  readonly checkpoint: ScenarioCheckpoint | null;
  readonly outputArtifactSha256: string | null;
}

export interface RunStateEvent {
  readonly eventId: string;
  readonly actorId: string;
  readonly actorRole: RunActorRole;
  readonly occurredAt: string;
  readonly fromStatus: ScenarioRunStatus | null;
  readonly toStatus: ScenarioRunStatus;
  readonly reason: string;
  readonly checkpointSha256: string | null;
  readonly outputArtifactSha256: string | null;
  readonly previousEventSha256: string | null;
  readonly eventSha256: string;
}

export interface ScenarioRun {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly runId: string;
  readonly requestSha256: string;
  readonly replayIdentitySha256: string;
  readonly scenarioDefinitionSha256: string;
  readonly baselineIdentitySha256: string;
  readonly status: ScenarioRunStatus;
  readonly stateVersion: number;
  readonly latestCheckpoint: ScenarioCheckpoint | null;
  readonly outputArtifactSha256: string | null;
  readonly events: readonly RunStateEvent[];
  readonly manifestSha256: string;
}

function makeStateEvent(
  input: Omit<RunStateEvent, "previousEventSha256" | "eventSha256">,
  previousEventSha256: string | null,
): RunStateEvent {
  const eventSha256 = digestJson({ ...input, previousEventSha256 });
  return deepFreeze({ ...input, previousEventSha256, eventSha256 });
}

export function createScenarioRun(request: ScenarioRunRequest): Readonly<ScenarioRun> {
  assertDigestIntegrity(request, "runRequest");
  const event = makeStateEvent(
    {
      eventId: request.requestId,
      actorId: request.requestedBy,
      actorRole: "requester",
      occurredAt: request.requestedAt,
      fromStatus: null,
      toStatus: "queued",
      reason: "Approved scenario run request accepted.",
      checkpointSha256: null,
      outputArtifactSha256: null,
    },
    null,
  );
  return immutableWithDigest({
    schemaVersion: 1 as const,
    tenantId: request.tenantId,
    runId: request.runId,
    requestSha256: request.manifestSha256,
    replayIdentitySha256: request.replayIdentitySha256,
    scenarioDefinitionSha256: request.scenarioDefinitionSha256,
    baselineIdentitySha256: request.baselineIdentitySha256,
    status: "queued" as const,
    stateVersion: 1,
    latestCheckpoint: null,
    outputArtifactSha256: null,
    events: [event],
  });
}

function transitionAllowed(from: ScenarioRunStatus, to: ScenarioRunStatus): boolean {
  if (from === "queued") return to === "running" || to === "cancelled";
  if (from === "running") {
    return to === "checkpointed" || to === "succeeded" || to === "failed" || to === "cancelled";
  }
  if (from === "checkpointed") return to === "running" || to === "failed" || to === "cancelled";
  return false;
}

function validateTransition(
  run: ScenarioRun,
  input: RunTransitionInput,
  request: ScenarioRunRequest,
): void {
  assertPlainRecord(input as unknown, "runTransition");
  assertExactKeys(
    input as unknown as Record<string, unknown>,
    [
      "tenantId",
      "eventId",
      "actorId",
      "actorRole",
      "occurredAt",
      "expectedStateVersion",
      "toStatus",
      "reason",
      "checkpoint",
      "outputArtifactSha256",
    ],
    "runTransition",
  );
  if (input.tenantId !== run.tenantId || input.tenantId !== request.tenantId) {
    throw new TypeError("run transition crosses tenant boundary");
  }
  if (input.expectedStateVersion !== run.stateVersion) {
    throw new TypeError("run transition expectedStateVersion is stale");
  }
  if (!transitionAllowed(run.status, input.toStatus)) {
    throw new TypeError(`illegal run transition ${run.status} -> ${input.toStatus}`);
  }
  assertUuid(input.eventId, "runTransition.eventId");
  assertUuid(input.actorId, "runTransition.actorId");
  if (!(["requester", "worker", "operator"] as const).includes(input.actorRole)) {
    throw new TypeError("run transition actorRole is not registered");
  }
  assertIsoInstant(input.occurredAt, "runTransition.occurredAt");
  const lastEvent = run.events.at(-1);
  if (!lastEvent || compareInstants(input.occurredAt, lastEvent.occurredAt) < 0) {
    throw new TypeError("run transition chronology cannot move backward");
  }
  assertNonBlank(input.reason, "runTransition.reason", 2_000);
  if (
    input.toStatus === "running" ||
    input.toStatus === "checkpointed" ||
    input.toStatus === "succeeded" ||
    input.toStatus === "failed"
  ) {
    if (input.actorRole !== "worker" && input.actorRole !== "operator") {
      throw new TypeError("execution state transitions require a worker or operator");
    }
  }
  if (input.toStatus === "checkpointed") {
    if (!input.checkpoint) throw new TypeError("checkpointed transition requires checkpoint");
    assertScenarioCheckpointIntegrity(input.checkpoint, request);
    if (compareInstants(input.occurredAt, input.checkpoint.createdAt) < 0) {
      throw new TypeError("checkpoint transition cannot predate its checkpoint artifact");
    }
  } else if (input.checkpoint !== null) {
    throw new TypeError("only checkpointed transitions may attach a new checkpoint");
  }
  if (input.toStatus === "succeeded") {
    if (input.outputArtifactSha256 === null) {
      throw new TypeError("succeeded transition requires worker output artifact digest");
    }
    assertSha256(input.outputArtifactSha256, "runTransition.outputArtifactSha256");
  } else if (input.outputArtifactSha256 !== null) {
    throw new TypeError("only succeeded transitions may attach worker output");
  }
}

export function assertScenarioRunIntegrity(run: ScenarioRun, request: ScenarioRunRequest): void {
  assertDigestIntegrity(request, "runRequest");
  assertDigestIntegrity(run, "scenarioRun");
  assertPlainRecord(run as unknown, "scenarioRun");
  assertExactKeys(
    run as unknown as Record<string, unknown>,
    [
      "schemaVersion",
      "tenantId",
      "runId",
      "requestSha256",
      "replayIdentitySha256",
      "scenarioDefinitionSha256",
      "baselineIdentitySha256",
      "status",
      "stateVersion",
      "latestCheckpoint",
      "outputArtifactSha256",
      "events",
      "manifestSha256",
    ],
    "scenarioRun",
  );
  if (
    run.schemaVersion !== 1 ||
    run.tenantId !== request.tenantId ||
    run.runId !== request.runId ||
    run.requestSha256 !== request.manifestSha256 ||
    run.replayIdentitySha256 !== request.replayIdentitySha256 ||
    run.scenarioDefinitionSha256 !== request.scenarioDefinitionSha256 ||
    run.baselineIdentitySha256 !== request.baselineIdentitySha256
  ) {
    throw new TypeError("scenario run does not bind its exact request identity");
  }
  if (!RUN_STATUSES.includes(run.status)) throw new TypeError("scenario run status is invalid");
  assertInteger(run.stateVersion, "scenarioRun.stateVersion", 1, 10_000);
  if (!Array.isArray(run.events) || run.events.length > 10_000) {
    throw new TypeError("scenario run events exceed the resource bound");
  }
  if (run.events.length !== run.stateVersion || run.events.length === 0) {
    throw new TypeError("run stateVersion must equal its complete event count");
  }
  let status: ScenarioRunStatus | null = null;
  let previousSha: string | null = null;
  let latestCheckpoint: string | null = null;
  let outputArtifactSha256: string | null = null;
  let previousAt = request.requestedAt;
  const ids = new Set<string>();
  for (const [index, event] of run.events.entries()) {
    assertPlainRecord(event as unknown, `scenarioRun.events[${index}]`);
    assertExactKeys(
      event as unknown as Record<string, unknown>,
      [
        "eventId",
        "actorId",
        "actorRole",
        "occurredAt",
        "fromStatus",
        "toStatus",
        "reason",
        "checkpointSha256",
        "outputArtifactSha256",
        "previousEventSha256",
        "eventSha256",
      ],
      `scenarioRun.events[${index}]`,
    );
    assertUuid(event.eventId, `scenarioRun.events[${index}].eventId`);
    assertUuid(event.actorId, `scenarioRun.events[${index}].actorId`);
    if (!(["requester", "worker", "operator"] as const).includes(event.actorRole)) {
      throw new TypeError("scenario run event actorRole is invalid");
    }
    assertIsoInstant(event.occurredAt, `scenarioRun.events[${index}].occurredAt`);
    if (compareInstants(event.occurredAt, previousAt) < 0) {
      throw new TypeError("scenario run event chronology cannot move backward");
    }
    assertNonBlank(event.reason, `scenarioRun.events[${index}].reason`, 2_000);
    if (!RUN_STATUSES.includes(event.toStatus)) {
      throw new TypeError("scenario run event target status is invalid");
    }
    if (event.checkpointSha256 !== null) {
      assertSha256(event.checkpointSha256, `scenarioRun.events[${index}].checkpointSha256`);
    }
    if (event.outputArtifactSha256 !== null) {
      assertSha256(event.outputArtifactSha256, `scenarioRun.events[${index}].outputArtifactSha256`);
    }
    if ((event.toStatus === "checkpointed") !== (event.checkpointSha256 !== null)) {
      throw new TypeError("scenario run checkpoint event semantics are inconsistent");
    }
    if ((event.toStatus === "succeeded") !== (event.outputArtifactSha256 !== null)) {
      throw new TypeError("scenario run output event semantics are inconsistent");
    }
    if (
      ["running", "checkpointed", "succeeded", "failed"].includes(event.toStatus) &&
      event.actorRole !== "worker" &&
      event.actorRole !== "operator"
    ) {
      throw new TypeError("scenario execution events require a worker or operator");
    }
    if (ids.has(event.eventId)) throw new TypeError("run eventId is duplicated");
    ids.add(event.eventId);
    if (event.previousEventSha256 !== previousSha || event.fromStatus !== status) {
      throw new TypeError("run event chain is discontinuous");
    }
    const { previousEventSha256: _previous, eventSha256, ...body } = event;
    if (digestJson({ ...body, previousEventSha256: previousSha }) !== eventSha256) {
      throw new TypeError("run event digest does not match content");
    }
    if (index === 0) {
      if (
        event.toStatus !== "queued" ||
        event.eventId !== request.requestId ||
        event.actorId !== request.requestedBy ||
        event.actorRole !== "requester" ||
        event.occurredAt !== request.requestedAt ||
        event.checkpointSha256 !== null ||
        event.outputArtifactSha256 !== null
      ) {
        throw new TypeError("run must start with its request queue event");
      }
    } else if (!status || !transitionAllowed(status, event.toStatus)) {
      throw new TypeError("run event contains an illegal state transition");
    }
    status = event.toStatus;
    previousSha = event.eventSha256;
    previousAt = event.occurredAt;
    if (event.checkpointSha256) latestCheckpoint = event.checkpointSha256;
    if (event.outputArtifactSha256) outputArtifactSha256 = event.outputArtifactSha256;
  }
  if (status !== run.status || outputArtifactSha256 !== run.outputArtifactSha256) {
    throw new TypeError("run materialized status does not match event replay");
  }
  if ((run.latestCheckpoint?.manifestSha256 ?? null) !== latestCheckpoint) {
    throw new TypeError("run latest checkpoint does not match event replay");
  }
  if (run.latestCheckpoint) {
    assertScenarioCheckpointIntegrity(run.latestCheckpoint, request);
    const checkpointEvent = run.events.find(
      (event) => event.checkpointSha256 === run.latestCheckpoint?.manifestSha256,
    );
    if (
      !checkpointEvent ||
      compareInstants(checkpointEvent.occurredAt, run.latestCheckpoint.createdAt) < 0
    ) {
      throw new TypeError("run latest checkpoint chronology does not match its event");
    }
  }
}

export function transitionScenarioRun(
  run: ScenarioRun,
  input: RunTransitionInput,
  request: ScenarioRunRequest,
): Readonly<ScenarioRun> {
  assertScenarioRunIntegrity(run, request);
  validateTransition(run, input, request);
  if (run.events.some((event) => event.eventId === input.eventId)) {
    throw new TypeError("run transition eventId is duplicated");
  }
  const previous = run.events.at(-1);
  if (!previous) throw new TypeError("validated run lost its event");
  const event = makeStateEvent(
    {
      eventId: input.eventId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      occurredAt: input.occurredAt,
      fromStatus: run.status,
      toStatus: input.toStatus,
      reason: input.reason,
      checkpointSha256: input.checkpoint?.manifestSha256 ?? null,
      outputArtifactSha256: input.outputArtifactSha256,
    },
    previous.eventSha256,
  );
  return immutableWithDigest({
    schemaVersion: 1 as const,
    tenantId: run.tenantId,
    runId: run.runId,
    requestSha256: run.requestSha256,
    replayIdentitySha256: run.replayIdentitySha256,
    scenarioDefinitionSha256: run.scenarioDefinitionSha256,
    baselineIdentitySha256: run.baselineIdentitySha256,
    status: input.toStatus,
    stateVersion: run.stateVersion + 1,
    latestCheckpoint: input.checkpoint ?? run.latestCheckpoint,
    outputArtifactSha256: input.outputArtifactSha256 ?? run.outputArtifactSha256,
    events: [...run.events, event],
  });
}

export interface ResumeRunInput {
  readonly tenantId: string;
  readonly eventId: string;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly expectedStateVersion: number;
  readonly checkpoint: ScenarioCheckpoint;
}

export function resumeScenarioRun(
  run: ScenarioRun,
  input: ResumeRunInput,
  request: ScenarioRunRequest,
): Readonly<ScenarioRun> {
  if (
    run.status !== "checkpointed" ||
    run.latestCheckpoint?.manifestSha256 !== input.checkpoint.manifestSha256
  ) {
    throw new TypeError("resume requires the run's exact latest checkpoint");
  }
  assertScenarioCheckpointIntegrity(input.checkpoint, request);
  return transitionScenarioRun(
    run,
    {
      tenantId: input.tenantId,
      eventId: input.eventId,
      actorId: input.actorId,
      actorRole: "worker",
      occurredAt: input.occurredAt,
      expectedStateVersion: input.expectedStateVersion,
      toStatus: "running",
      reason: `Resume from checkpoint ${input.checkpoint.checkpointId}.`,
      checkpoint: null,
      outputArtifactSha256: null,
    },
    request,
  );
}

export function serializedRunSize(run: ScenarioRun): number {
  return Buffer.byteLength(canonicalJson(run), "utf8");
}
