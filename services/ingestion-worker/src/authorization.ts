import { AsyncLocalStorage } from "node:async_hooks";

import {
  digestJson,
  type IngestionAuthorizationVerificationOptions,
  type IngestionWorkflowInput,
  MAX_INGESTION_AUTHORIZATION_TTL_MS,
  verifyIngestionWorkflowAuthorization,
} from "@economyos/data-admission";

export interface TemporalWorkflowExecutionIdentity {
  readonly namespace: string;
  readonly workflowType: string;
  readonly workflowId: string;
  readonly runId: string;
}

export interface IngestionAuthorizationGuardConfig {
  readonly keys: IngestionAuthorizationVerificationOptions["keys"];
  readonly expectedNamespace: string;
  readonly maximumTtlMs: number;
  readonly clockSkewMs: number;
  readonly replayCapacity: number;
  readonly clock?: () => Date;
}

interface AuthorizationScope {
  readonly bindingSha256: string;
  readonly workflowSha256: string;
  readonly organizationId: string | null;
  readonly runId: string;
  readonly expiresAtMs: number;
}

interface ReplayBinding {
  readonly bindingSha256: string;
  readonly expiresAtMs: number;
}

function copyVerificationKeys(
  keys: IngestionAuthorizationVerificationOptions["keys"],
): ReadonlyMap<string, Uint8Array> {
  const entries =
    "entries" in keys && typeof keys.entries === "function"
      ? [...keys.entries()]
      : Object.entries(keys as Readonly<Record<string, Uint8Array | undefined>>).filter(
          (entry): entry is [string, Uint8Array] => entry[1] !== undefined,
        );
  if (entries.length < 1 || entries.length > 16) {
    throw new TypeError("authorization verification requires between 1 and 16 rotation keys");
  }
  const copied = new Map<string, Uint8Array>();
  for (const [keyId, key] of entries) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(keyId)) {
      throw new TypeError("authorization verification key ID is invalid");
    }
    if (copied.has(keyId) || key.byteLength < 32 || key.byteLength > 64) {
      throw new TypeError("authorization verification rotation key set is invalid");
    }
    copied.set(keyId, Uint8Array.from(key));
  }
  return copied;
}

function assertExecutionIdentity(
  execution: TemporalWorkflowExecutionIdentity,
  expectedNamespace: string,
  input: IngestionWorkflowInput,
): void {
  if (execution.namespace !== expectedNamespace) {
    throw new TypeError("ingestion activity namespace is not authorized");
  }
  if (execution.workflowType !== "ingestDataset") {
    throw new TypeError("ingestion activity workflow type is not authorized");
  }
  if (execution.workflowId !== input.workflowId) {
    throw new TypeError("ingestion activity workflow identity does not match its authorization");
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      execution.runId,
    )
  ) {
    throw new TypeError("ingestion activity execution run identity is invalid");
  }
}

function workflowSha256(input: IngestionWorkflowInput): string {
  return digestJson({
    organizationId: input.organizationId,
    datasetId: input.datasetId,
    seriesId: input.seriesId,
    inputSha256: input.inputSha256,
    runId: input.runId,
    workflowId: input.workflowId,
    authorization: input.authorization,
  });
}

export class IngestionAuthorizationGuard {
  readonly #config: IngestionAuthorizationGuardConfig;
  readonly #scope = new AsyncLocalStorage<AuthorizationScope>();
  readonly #replays = new Map<string, ReplayBinding>();

  constructor(config: IngestionAuthorizationGuardConfig) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(config.expectedNamespace)) {
      throw new TypeError("authorization expected Temporal namespace is invalid");
    }
    if (
      !Number.isSafeInteger(config.replayCapacity) ||
      config.replayCapacity < 1 ||
      config.replayCapacity > 100_000
    ) {
      throw new TypeError("authorization replay capacity must be between 1 and 100000");
    }
    if (
      !Number.isSafeInteger(config.maximumTtlMs) ||
      config.maximumTtlMs < 1_000 ||
      config.maximumTtlMs > MAX_INGESTION_AUTHORIZATION_TTL_MS ||
      !Number.isSafeInteger(config.clockSkewMs) ||
      config.clockSkewMs < 0 ||
      config.clockSkewMs > 60_000
    ) {
      throw new TypeError("authorization lifetime bounds are invalid");
    }
    this.#config = Object.freeze({ ...config, keys: copyVerificationKeys(config.keys) });
  }

  async runAuthorized<T>(
    input: IngestionWorkflowInput,
    execution: TemporalWorkflowExecutionIdentity,
    operation: () => Promise<T>,
  ): Promise<T> {
    const now = this.#config.clock?.() ?? new Date();
    const claims = verifyIngestionWorkflowAuthorization(input, {
      keys: this.#config.keys,
      now,
      maximumTtlMs: this.#config.maximumTtlMs,
      clockSkewMs: this.#config.clockSkewMs,
    });
    assertExecutionIdentity(execution, this.#config.expectedNamespace, input);
    const workflowDigest = workflowSha256(input);
    const bindingSha256 = digestJson({
      namespace: execution.namespace,
      workflowType: execution.workflowType,
      workflowId: execution.workflowId,
      temporalRunId: execution.runId,
      workflowSha256: workflowDigest,
    });
    const expiresAtMs = Date.parse(claims.expiresAt);
    this.#prune(now.getTime());
    const prior = this.#replays.get(claims.nonce);
    if (prior && prior.bindingSha256 !== bindingSha256) {
      throw new TypeError("ingestion authorization nonce was replayed in another context");
    }
    if (!prior) {
      if (this.#replays.size >= this.#config.replayCapacity) {
        throw new TypeError("ingestion authorization replay registry is at capacity");
      }
      this.#replays.set(claims.nonce, { bindingSha256, expiresAtMs });
    }
    return this.#scope.run(
      {
        bindingSha256,
        workflowSha256: workflowDigest,
        organizationId: input.organizationId,
        runId: input.runId,
        expiresAtMs,
      },
      operation,
    );
  }

  assertCurrent(input: IngestionWorkflowInput): void {
    const active = this.#scope.getStore();
    if (!active) {
      throw new TypeError("ingestion repository access requires verified activity authorization");
    }
    const now = this.#config.clock?.() ?? new Date();
    verifyIngestionWorkflowAuthorization(input, {
      keys: this.#config.keys,
      now,
      maximumTtlMs: this.#config.maximumTtlMs,
      clockSkewMs: this.#config.clockSkewMs,
    });
    if (
      active.workflowSha256 !== workflowSha256(input) ||
      active.organizationId !== input.organizationId ||
      active.runId !== input.runId ||
      now.getTime() - this.#config.clockSkewMs >= active.expiresAtMs
    ) {
      throw new TypeError("ingestion repository context does not match activity authorization");
    }
  }

  #prune(nowMs: number): void {
    for (const [nonce, binding] of this.#replays) {
      if (binding.expiresAtMs + this.#config.clockSkewMs <= nowMs) this.#replays.delete(nonce);
    }
  }
}
