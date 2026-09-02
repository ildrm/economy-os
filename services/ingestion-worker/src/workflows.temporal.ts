import { fileURLToPath } from "node:url";

import {
  createIngestionWorkflowInput,
  deterministicUuid,
  digestJson,
  type IngestionActivities,
  type LandingResult,
  transformationConfiguration,
  WORLD_BANK_WDI_PARSER_IDENTITY,
} from "@economyos/data-admission";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { DefaultLogger, Runtime, Worker } from "@temporalio/worker";
import { describe, expect, it, vi } from "vitest";

import { ingestDataset } from "./workflows.js";

const TASK_QUEUE = "economyos-ingestion-temporal-verification";
const NAMESPACE = "economyos-ingestion-verification";
const AUTHORIZATION_KEY = new TextEncoder().encode(
  "economyos-temporal-test-authorization-key-only",
);

describe("ingestion workflow against a real Temporal dev server", () => {
  it("executes the promoted happy path through a worker and mocked activities", async () => {
    Runtime.install({ logger: new DefaultLogger("ERROR", () => undefined) });
    const environment = await TestWorkflowEnvironment.createLocal({
      server: {
        executable: { type: "cached-download", version: "v1.8.1" },
        log: { format: "pretty", level: "error" },
        namespace: NAMESPACE,
        ui: false,
      },
    });

    try {
      const workflow = createIngestionWorkflowInput(
        {
          organizationId: null,
          datasetId: "038f47ac-19fc-7c92-ae91-0242ac120003",
          seriesId: "038f47ac-19fc-7c92-ae91-0242ac120007",
          idempotencyToken: "temporal-dev-server-happy-path",
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
          keyId: "temporal-test-v1",
          key: AUTHORIZATION_KEY,
          issuedAt: "2026-08-31T09:59:00.000Z",
          expiresAt: "2026-08-31T10:09:00.000Z",
          nonce: "dGVtcG9yYWwtdGVzdC1ub25jZS0wMDAwMQ",
        },
      );
      const fetchedAt = "2026-08-31T10:00:01.000Z";
      const candidates = [
        {
          countryCode: "USA",
          indicatorCode: "NY.GDP.MKTP.CD",
          periodStart: "2020-01-01T00:00:00.000Z",
          periodEnd: "2021-01-01T00:00:00.000Z",
          value: "123.4500",
          missingReason: null,
          releaseTime: null,
          availabilityTime: null,
          retrievedAt: fetchedAt,
          pitQuality: "latest_revised_only" as const,
        },
      ];
      const candidateSha256 = digestJson(candidates);
      const transformationConfigurationSha256 = digestJson(transformationConfiguration(workflow));
      const transformationRunId = deterministicUuid("temporal-test", "transformation");
      const releaseId = deterministicUuid("temporal-test", "release");
      const observationId = deterministicUuid("temporal-test", "observation");
      const observationSetSha256 = digestJson([observationId]);
      const landing: LandingResult = {
        payloads: [
          {
            payloadId: deterministicUuid("temporal-test", "payload"),
            requestUri:
              "https://api.worldbank.org/v2/country/USA/indicator/NY.GDP.MKTP.CD?date=2020%3A2020&format=json&page=1&per_page=1000&source=2",
            objectUri: "s3://economyos-test/raw/payload.json",
            objectKey: "raw/payload.json",
            mediaType: "application/json",
            checksumSha256: "a".repeat(64),
            byteLength: 128,
            fetchedAt,
            providerRequestId: null,
          },
        ],
        candidates,
        candidateSha256,
      };
      const qualityResult = {
        checkCode: "admission",
        status: "pass" as const,
        weight: 0,
        details: { candidateSha256 },
      };
      const recordStage = vi.fn<IngestionActivities["recordStage"]>(async () => undefined);
      const failRun = vi.fn<IngestionActivities["failRun"]>(async () => undefined);
      const activities: IngestionActivities = {
        beginRun: vi.fn(async () => ({
          disposition: "execute" as const,
          status: "pending" as const,
          existingOutput: null,
        })),
        recordStage,
        fetchAndPersistRaw: vi.fn(async () => landing),
        parseAndEvaluate: vi.fn(async () => ({
          disposition: "promote" as const,
          transformationRunId,
          transformationConfigurationSha256,
          releaseId,
          score: 1,
          results: [qualityResult],
          reasons: [],
          candidateSha256,
        })),
        quarantine: vi.fn(async () => undefined),
        promote: vi.fn(async () => ({
          transformationRunId,
          releaseId,
          observationIds: [observationId],
          observationSetSha256,
        })),
        writeLineage: vi.fn(async () => undefined),
        reconcileAndCheckpoint: vi.fn(async () => ({
          expectedRows: 1,
          persistedRows: 1,
          missingPeriods: [],
          unexpectedPeriods: [],
          mismatchedPeriods: [],
          checkpointSha256: digestJson({ observationId }),
        })),
        failRun,
      };
      const worker = await Worker.create({
        activities,
        connection: environment.nativeConnection,
        namespace: NAMESPACE,
        taskQueue: TASK_QUEUE,
        workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
      });

      const output = await worker.runUntil(() =>
        environment.client.workflow.execute(ingestDataset, {
          args: [workflow],
          taskQueue: TASK_QUEUE,
          workflowId: workflow.workflowId,
        }),
      );

      expect(output).toMatchObject({
        schemaVersion: 1,
        runId: workflow.runId,
        status: "succeeded",
        inputSha256: workflow.inputSha256,
        candidateSha256,
        transformationRunId,
        releaseId,
        observationIds: [observationId],
        observationSetSha256,
        qualityScore: 1,
      });
      expect(recordStage.mock.calls.map(([event]) => [event.stage, event.nextStatus])).toEqual([
        ["start", "running"],
        ["persist_raw", "running"],
        ["parse", "running"],
        ["quality", "running"],
        ["complete", "succeeded"],
      ]);
      expect(activities.fetchAndPersistRaw).toHaveBeenCalledOnce();
      expect(activities.promote).toHaveBeenCalledOnce();
      expect(activities.writeLineage).toHaveBeenCalledOnce();
      expect(activities.reconcileAndCheckpoint).toHaveBeenCalledOnce();
      expect(activities.quarantine).not.toHaveBeenCalled();
      expect(failRun).not.toHaveBeenCalled();
    } finally {
      await environment.teardown();
    }
  });
});
