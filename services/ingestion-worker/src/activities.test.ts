import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { WorldBankConnector } from "@economyos/canonical-data";
import {
  type AdmissionDecision,
  createIngestionWorkflowInput,
  type IngestionWorkflowInput,
  type LandingResult,
  sha256Hex,
  WORLD_BANK_WDI_PARSER_IDENTITY,
} from "@economyos/data-admission";
import { S3ObjectStorage } from "@economyos/object-storage";
import { MockActivityEnvironment } from "@temporalio/testing";
import { DefaultLogger } from "@temporalio/worker";
import { describe, expect, it, vi } from "vitest";

import { createIngestionActivities } from "./activities.js";
import { IngestionAuthorizationGuard } from "./authorization.js";
import type { IngestionRepository } from "./repository.js";

const AUTHORIZATION_KEY = new TextEncoder().encode(
  "economyos-activity-test-authorization-key-only",
);

function workflow(): IngestionWorkflowInput {
  return createIngestionWorkflowInput(
    {
      organizationId: null,
      datasetId: "038f47ac-19fc-7c92-ae91-0242ac120003",
      seriesId: "038f47ac-19fc-7c92-ae91-0242ac120007",
      idempotencyToken: "activity-fixture",
      requestedAt: "2026-08-31T10:00:00Z",
      connector: {
        type: "world-bank-wdi",
        countryCode: "USA",
        indicatorCode: "NY.GDP.MKTP.CD",
        startYear: 2020,
        endYear: 2020,
      },
      parser: WORLD_BANK_WDI_PARSER_IDENTITY,
      qualityPolicy: {
        minimumCompleteness: 1,
        maximumRows: 2,
        requiredPitQuality: "latest_revised_only",
        allowEmptyPayload: false,
      },
    },
    {
      keyId: "activity-test-v1",
      key: AUTHORIZATION_KEY,
      issuedAt: "2026-08-31T09:59:00.000Z",
      expiresAt: "2026-08-31T10:09:00.000Z",
      nonce: "YWN0aXZpdHktdGVzdC1ub25jZS0wMDAx",
    },
  );
}

function repository(): IngestionRepository {
  return {
    checkReady: vi.fn(async () => undefined),
    beginRun: vi.fn(async () => ({
      disposition: "execute" as const,
      status: "pending" as const,
      existingOutput: null,
    })),
    recordStage: vi.fn(async () => undefined),
    findLanding: vi.fn(async () => null),
    persistLanding: vi.fn(async ({ payload }) => payload),
    persistQuarantine: vi.fn(async () => undefined),
    promote: vi.fn(async () => {
      throw new Error("not used");
    }),
    writeLineage: vi.fn(async () => undefined),
    reconcileAndCheckpoint: vi.fn(async () => {
      throw new Error("not used");
    }),
    failRun: vi.fn(async () => undefined),
  };
}

describe("ingestion activities", () => {
  it("binds parser provenance to the installed canonical-data source", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../../../packages/canonical-data/src/world-bank.ts", import.meta.url)),
    );
    expect(sha256Hex(source)).toBe(WORLD_BANK_WDI_PARSER_IDENTITY.codeSha256);
  });

  it("lands exact provider bytes before admitting normalized candidates", async () => {
    const sourceBytes = new TextEncoder().encode(
      '[{"page":"1","pages":"1","per_page":"1000","total":"1","sourceid":"2"},' +
        '[{"countryiso3code":"USA","indicator":{"id":"NY.GDP.MKTP.CD"},' +
        '"date":"2020","value":123.4500}]]',
    );
    const providerFetch = vi.fn(
      async () =>
        new Response(Uint8Array.from(sourceBytes).buffer, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const connector = new WorldBankConnector(
      providerFetch,
      () => new Date("2026-08-31T10:00:01Z"),
      async () => undefined,
    );
    let stored = new Uint8Array();
    const objectStorage = new S3ObjectStorage(
      {
        region: "us-east-1",
        bucket: "economyos-test",
        endpoint: "http://127.0.0.1:59090",
        forcePathStyle: true,
        allowInsecureLocalEndpoint: true,
      },
      {
        async send(command) {
          const candidate = command as unknown as {
            constructor: { name: string };
            input: { Body?: Uint8Array };
          };
          if (candidate.constructor.name === "PutObjectCommand") {
            stored = Uint8Array.from(candidate.input.Body ?? new Uint8Array());
            return {};
          }
          return {
            ContentLength: stored.byteLength,
            Body: {
              async *[Symbol.asyncIterator]() {
                yield stored;
              },
            },
          };
        },
      },
    );
    const repo = repository();
    const authorization = new IngestionAuthorizationGuard({
      keys: { "activity-test-v1": AUTHORIZATION_KEY },
      expectedNamespace: "activity-test",
      maximumTtlMs: 900_000,
      clockSkewMs: 0,
      replayCapacity: 10,
      clock: () => new Date("2026-08-31T10:00:02Z"),
    });
    const activities = createIngestionActivities({
      connector,
      objectStorage,
      repository: repo,
      authorization,
      clock: () => new Date("2026-08-31T10:00:02Z"),
    });
    const input = workflow();
    const environment = new MockActivityEnvironment(
      {
        namespace: "activity-test",
        workflowType: "ingestDataset",
        workflowExecution: {
          workflowId: input.workflowId,
          runId: "038f47ac-19fc-7c92-ae91-0242ac120099",
        },
      },
      {
        logger: new DefaultLogger("ERROR", () => undefined),
      },
    );
    const landing = (await environment.run(activities.fetchAndPersistRaw, input)) as LandingResult;
    expect(stored).toEqual(sourceBytes);
    expect(landing.payloads).toHaveLength(1);
    expect(landing.candidates).toEqual([
      expect.objectContaining({ value: "123.4500", retrievedAt: "2026-08-31T10:00:01.000Z" }),
    ]);
    expect(repo.persistLanding).toHaveBeenCalledOnce();
    expect(repo.persistLanding).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ requestUri: expect.stringContaining("source=2") }),
      }),
    );

    vi.mocked(repo.findLanding).mockResolvedValueOnce(landing.payloads[0] ?? null);
    const replay = (await environment.run(activities.fetchAndPersistRaw, input)) as LandingResult;
    expect(replay).toEqual(landing);
    expect(providerFetch).toHaveBeenCalledOnce();

    vi.mocked(repo.findLanding).mockResolvedValueOnce({
      ...(landing.payloads[0] as NonNullable<(typeof landing.payloads)[0]>),
      requestUri: landing.payloads[0]?.requestUri.replace("source=2", "source=11") ?? "",
    });
    await expect(environment.run(activities.fetchAndPersistRaw, input)).rejects.toThrow(
      "outside the admitted World Bank origin",
    );

    const decision = (await environment.run(activities.parseAndEvaluate, {
      workflow: input,
      landing,
    })) as AdmissionDecision;
    expect(decision.disposition).toBe("promote");
    expect(decision.results.at(-1)).toMatchObject({ checkCode: "admission", status: "pass" });

    const replayedExecution = new MockActivityEnvironment(
      {
        namespace: "activity-test",
        workflowType: "ingestDataset",
        workflowExecution: {
          workflowId: input.workflowId,
          runId: "038f47ac-19fc-7c92-ae91-0242ac120098",
        },
      },
      { logger: new DefaultLogger("ERROR", () => undefined) },
    );
    await expect(replayedExecution.run(activities.beginRun, input)).rejects.toThrow(
      "nonce was replayed in another context",
    );

    const tampered = {
      ...input,
      authorization: { ...input.authorization, signatureSha256: "0".repeat(64) },
    };
    await expect(environment.run(activities.beginRun, tampered)).rejects.toThrow(
      "signature is invalid",
    );
    const expiredActivities = createIngestionActivities({
      connector,
      objectStorage,
      repository: repo,
      authorization: new IngestionAuthorizationGuard({
        keys: { "activity-test-v1": AUTHORIZATION_KEY },
        expectedNamespace: "activity-test",
        maximumTtlMs: 900_000,
        clockSkewMs: 0,
        replayCapacity: 10,
        clock: () => new Date("2026-08-31T10:09:00Z"),
      }),
    });
    await expect(environment.run(expiredActivities.beginRun, input)).rejects.toThrow(
      "authorization has expired",
    );
    expect(repo.beginRun).not.toHaveBeenCalled();
  });
});
