import {
  assertExactKeys,
  assertIsoInstant,
  assertRecord,
  assertSha256,
  assertUuid,
  cloneCanonical,
  compareInstant,
  deepFreeze,
  digestJson,
  expectArray,
  expectInteger,
  expectString,
} from "./internals.js";
import { assertCausalAnalysisResultIntegrity, type CausalAnalysisResult } from "./results.js";

export interface ResultRegistryEntry {
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly resultId: string;
  readonly resultSha256: string;
  readonly recordedBy: string;
  readonly recordedAt: string;
  readonly previousEntrySha256: string | null;
  readonly entrySha256: string;
}

export interface CausalResultRegistry {
  readonly schemaVersion: 1;
  readonly registryId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly openedAt: string;
  readonly entries: readonly ResultRegistryEntry[];
  readonly registrySha256: string;
}

export interface ResultRegistryReplayReceipt {
  readonly schemaVersion: 1;
  readonly registryId: string;
  readonly registrySha256: string;
  readonly resultCount: number;
  readonly orderedResultSha256: readonly string[];
  readonly replaySha256: string;
}

const ENTRY_BODY_KEYS = [
  "schemaVersion",
  "sequence",
  "resultId",
  "resultSha256",
  "recordedBy",
  "recordedAt",
  "previousEntrySha256",
] as const;

function parseEntry(value: unknown): ResultRegistryEntry {
  assertRecord(value, "causalResultRegistry.entry");
  assertExactKeys(value, [...ENTRY_BODY_KEYS, "entrySha256"], "causalResultRegistry.entry");
  if (value.schemaVersion !== 1) throw new TypeError("registry entry schemaVersion must be 1");
  const resultId = expectString(value.resultId, "causalResultRegistry.entry.resultId");
  const resultSha256 = expectString(value.resultSha256, "causalResultRegistry.entry.resultSha256");
  const recordedBy = expectString(value.recordedBy, "causalResultRegistry.entry.recordedBy");
  const recordedAt = expectString(value.recordedAt, "causalResultRegistry.entry.recordedAt");
  const previousEntrySha256 =
    value.previousEntrySha256 === null
      ? null
      : expectString(value.previousEntrySha256, "causalResultRegistry.entry.previousEntrySha256");
  const entrySha256 = expectString(value.entrySha256, "causalResultRegistry.entry.entrySha256");
  assertUuid(resultId, "causalResultRegistry.entry.resultId");
  assertUuid(recordedBy, "causalResultRegistry.entry.recordedBy");
  assertSha256(resultSha256, "causalResultRegistry.entry.resultSha256");
  if (previousEntrySha256 !== null) {
    assertSha256(previousEntrySha256, "causalResultRegistry.entry.previousEntrySha256");
  }
  assertSha256(entrySha256, "causalResultRegistry.entry.entrySha256");
  assertIsoInstant(recordedAt, "causalResultRegistry.entry.recordedAt");
  const body = {
    schemaVersion: 1 as const,
    sequence: expectInteger(
      value.sequence,
      "causalResultRegistry.entry.sequence",
      1,
      1_000_000_000,
    ),
    resultId,
    resultSha256,
    recordedBy,
    recordedAt,
    previousEntrySha256,
  };
  if (digestJson(body) !== entrySha256) {
    throw new TypeError("causal result registry entry digest does not match");
  }
  return { ...body, entrySha256 };
}

export interface OpenResultRegistryInput {
  readonly registryId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly openedAt: string;
}

export function openCausalResultRegistry(
  input: OpenResultRegistryInput,
): Readonly<CausalResultRegistry> {
  assertUuid(input.registryId, "causalResultRegistry.registryId");
  assertUuid(input.organizationId, "causalResultRegistry.organizationId");
  assertUuid(input.workspaceId, "causalResultRegistry.workspaceId");
  assertIsoInstant(input.openedAt, "causalResultRegistry.openedAt");
  const body = {
    schemaVersion: 1 as const,
    registryId: input.registryId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    openedAt: input.openedAt,
    entries: [] as readonly ResultRegistryEntry[],
  };
  return deepFreeze({ ...body, registrySha256: digestJson(body) });
}

export function assertCausalResultRegistryIntegrity(
  value: unknown,
): asserts value is CausalResultRegistry {
  assertRecord(value, "causalResultRegistry");
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "registryId",
      "organizationId",
      "workspaceId",
      "openedAt",
      "entries",
      "registrySha256",
    ],
    "causalResultRegistry",
  );
  if (value.schemaVersion !== 1) throw new TypeError("result registry schemaVersion must be 1");
  const registryId = expectString(value.registryId, "causalResultRegistry.registryId");
  const organizationId = expectString(value.organizationId, "causalResultRegistry.organizationId");
  const workspaceId = expectString(value.workspaceId, "causalResultRegistry.workspaceId");
  const openedAt = expectString(value.openedAt, "causalResultRegistry.openedAt");
  for (const [field, id] of [
    ["registryId", registryId],
    ["organizationId", organizationId],
    ["workspaceId", workspaceId],
  ] as const) {
    assertUuid(id, `causalResultRegistry.${field}`);
  }
  assertIsoInstant(openedAt, "causalResultRegistry.openedAt");
  const entries = expectArray(value.entries, "causalResultRegistry.entries").map(parseEntry);
  let previous: string | null = null;
  let previousTime = openedAt;
  const resultIds = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    if (entry.sequence !== index + 1 || entry.previousEntrySha256 !== previous) {
      throw new TypeError("causal result registry chain is broken");
    }
    if (compareInstant(entry.recordedAt, previousTime) <= 0) {
      throw new TypeError("causal result registry time must advance strictly");
    }
    if (resultIds.has(entry.resultId))
      throw new TypeError("causal result registry result ID is duplicated");
    resultIds.add(entry.resultId);
    previous = entry.entrySha256;
    previousTime = entry.recordedAt;
  }
  const body = {
    schemaVersion: 1 as const,
    registryId,
    organizationId,
    workspaceId,
    openedAt,
    entries,
  };
  const registrySha256 = expectString(value.registrySha256, "causalResultRegistry.registrySha256");
  assertSha256(registrySha256, "causalResultRegistry.registrySha256");
  if (digestJson(body) !== registrySha256) {
    throw new TypeError("causal result registry digest does not match");
  }
}

export interface AppendResultRegistryInput {
  readonly result: CausalAnalysisResult;
  readonly recordedBy: string;
  readonly recordedAt: string;
}

export function appendCausalResult(
  registry: CausalResultRegistry,
  input: AppendResultRegistryInput,
): Readonly<CausalResultRegistry> {
  assertCausalResultRegistryIntegrity(registry);
  assertCausalAnalysisResultIntegrity(input.result);
  assertUuid(input.recordedBy, "causalResultRegistry.recordedBy");
  assertIsoInstant(input.recordedAt, "causalResultRegistry.recordedAt");
  const previous = registry.entries.at(-1);
  if (compareInstant(input.recordedAt, previous?.recordedAt ?? registry.openedAt) <= 0) {
    throw new TypeError("registry append time must advance strictly");
  }
  if (compareInstant(input.recordedAt, input.result.generatedAt) < 0) {
    throw new TypeError("result cannot be registered before it was generated");
  }
  if (registry.entries.some((entry) => entry.resultId === input.result.resultId)) {
    throw new TypeError("result ID is already registered");
  }
  const entryBody = {
    schemaVersion: 1 as const,
    sequence: registry.entries.length + 1,
    resultId: input.result.resultId,
    resultSha256: input.result.resultSha256,
    recordedBy: input.recordedBy,
    recordedAt: input.recordedAt,
    previousEntrySha256: previous?.entrySha256 ?? null,
  };
  const entry = deepFreeze({ ...entryBody, entrySha256: digestJson(entryBody) });
  const body = {
    schemaVersion: 1 as const,
    registryId: registry.registryId,
    organizationId: registry.organizationId,
    workspaceId: registry.workspaceId,
    openedAt: registry.openedAt,
    entries: [...registry.entries, entry],
  };
  return deepFreeze({ ...cloneCanonical(body), registrySha256: digestJson(body) });
}

export function replayCausalResultRegistry(
  registry: CausalResultRegistry,
  results: readonly CausalAnalysisResult[],
): Readonly<ResultRegistryReplayReceipt> {
  assertCausalResultRegistryIntegrity(registry);
  for (const result of results) assertCausalAnalysisResultIntegrity(result);
  if (results.length !== registry.entries.length) {
    throw new TypeError("registry replay must receive exactly the registered results");
  }
  const resultById = new Map(results.map((result) => [result.resultId, result]));
  if (resultById.size !== results.length)
    throw new TypeError("registry replay result IDs are duplicated");
  const orderedResultSha256 = registry.entries.map((entry) => {
    const result = resultById.get(entry.resultId);
    if (!result || result.resultSha256 !== entry.resultSha256) {
      throw new TypeError(`registry replay cannot reproduce result ${entry.resultId}`);
    }
    return result.resultSha256;
  });
  const body = {
    schemaVersion: 1 as const,
    registryId: registry.registryId,
    registrySha256: registry.registrySha256,
    resultCount: orderedResultSha256.length,
    orderedResultSha256,
  };
  return deepFreeze({ ...cloneCanonical(body), replaySha256: digestJson(body) });
}

export function assertResultRegistryReplayIntegrity(
  value: unknown,
): asserts value is ResultRegistryReplayReceipt {
  assertRecord(value, "resultRegistryReplay");
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "registryId",
      "registrySha256",
      "resultCount",
      "orderedResultSha256",
      "replaySha256",
    ],
    "resultRegistryReplay",
  );
  if (value.schemaVersion !== 1) throw new TypeError("registry replay schemaVersion must be 1");
  const registryId = expectString(value.registryId, "resultRegistryReplay.registryId");
  const registrySha256 = expectString(value.registrySha256, "resultRegistryReplay.registrySha256");
  assertUuid(registryId, "resultRegistryReplay.registryId");
  assertSha256(registrySha256, "resultRegistryReplay.registrySha256");
  const orderedResultSha256 = expectArray(
    value.orderedResultSha256,
    "resultRegistryReplay.orderedResultSha256",
  ).map((item, index) => {
    const digest = expectString(item, `resultRegistryReplay.orderedResultSha256[${index}]`);
    assertSha256(digest, `resultRegistryReplay.orderedResultSha256[${index}]`);
    return digest;
  });
  const resultCount = expectInteger(
    value.resultCount,
    "resultRegistryReplay.resultCount",
    0,
    1_000_000_000,
  );
  if (resultCount !== orderedResultSha256.length) {
    throw new TypeError("registry replay count does not match ordered results");
  }
  const body = {
    schemaVersion: 1 as const,
    registryId,
    registrySha256,
    resultCount,
    orderedResultSha256,
  };
  const replaySha256 = expectString(value.replaySha256, "resultRegistryReplay.replaySha256");
  assertSha256(replaySha256, "resultRegistryReplay.replaySha256");
  if (digestJson(body) !== replaySha256) {
    throw new TypeError("registry replay digest does not match");
  }
}
