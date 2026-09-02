import {
  createIngestionWorkflowInput,
  deterministicUuid,
  digestJson,
  transformationConfiguration,
  WORLD_BANK_WDI_PARSER_IDENTITY,
} from "@economyos/data-admission";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { IngestionAuthorizationGuard } from "./authorization.js";
import { IngestionConflictError, PgIngestionRepository } from "./repository.js";

const AUTHORIZATION_KEY = new TextEncoder().encode(
  "economyos-repository-test-authorization-key-only",
);

function workflow() {
  return createIngestionWorkflowInput(
    {
      organizationId: null,
      datasetId: "038f47ac-19fc-7c92-ae91-0242ac120003",
      seriesId: "038f47ac-19fc-7c92-ae91-0242ac120007",
      idempotencyToken: "repository-test",
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
      keyId: "repository-test-v1",
      key: AUTHORIZATION_KEY,
      issuedAt: "2026-08-31T09:59:00.000Z",
      expiresAt: "2026-08-31T10:09:00.000Z",
      nonce: "cmVwb3NpdG9yeS10ZXN0LW5vbmNlLTAwMQ",
    },
  );
}

function guardedRepository(pool: Pool) {
  const authorization = new IngestionAuthorizationGuard({
    keys: { "repository-test-v1": AUTHORIZATION_KEY },
    expectedNamespace: "repository-test",
    maximumTtlMs: 900_000,
    clockSkewMs: 0,
    replayCapacity: 10,
    clock: () => new Date("2026-08-31T10:00:00Z"),
  });
  const repository = new PgIngestionRepository(pool, authorization);
  return {
    repository,
    authorize<T>(input: ReturnType<typeof workflow>, operation: () => Promise<T>): Promise<T> {
      return authorization.runAuthorized(
        input,
        {
          namespace: "repository-test",
          workflowType: "ingestDataset",
          workflowId: input.workflowId,
          runId: "038f47ac-19fc-7c92-ae91-0242ac120099",
        },
        operation,
      );
    },
  };
}

const safeIdentity = {
  login_name: "economyos_ingest_local",
  effective_name: "economyos_ingest_local",
  login_superuser: false,
  effective_superuser: false,
  login_bypass_rls: false,
  effective_bypass_rls: false,
  login_create_role: false,
  effective_create_role: false,
  login_create_db: false,
  effective_create_db: false,
  login_replication: false,
  effective_replication: false,
  login_owns_database: false,
  effective_owns_database: false,
  login_can_assume_privileged_role: false,
  login_can_assume_database_owner: false,
  ingest_role_member: true,
};

function poolWith(
  operation: (text: string, values: readonly unknown[] | undefined) => Promise<readonly unknown[]>,
  identity = safeIdentity,
): Pool {
  const client = {
    query: vi.fn(async (text: string, values?: readonly unknown[]) => {
      if (
        text === "BEGIN" ||
        text === "COMMIT" ||
        text === "ROLLBACK" ||
        text.startsWith("SET LOCAL") ||
        text.startsWith("SELECT set_config")
      ) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: await operation(text, values), rowCount: 0 };
    }),
    release: vi.fn(),
  };
  return {
    query: vi.fn(async () => ({ rows: [identity], rowCount: 1 })),
    connect: vi.fn(async () => client),
  } as unknown as Pool;
}

describe("PostgreSQL ingestion repository guards", () => {
  it("accepts only an unprivileged economyos_ingest member", async () => {
    const safe = guardedRepository(
      poolWith(async (text) => (text.includes("connector_bindings") ? [{ available: true }] : [])),
    ).repository;
    await expect(safe.checkReady()).resolves.toBeUndefined();

    const privileged = guardedRepository(
      poolWith(async () => [], { ...safeIdentity, login_can_assume_database_owner: true }),
    ).repository;
    await expect(privileged.checkReady()).rejects.toThrow("privileged roles are forbidden");

    const wrongRole = guardedRepository(
      poolWith(async () => [], { ...safeIdentity, ingest_role_member: false }),
    ).repository;
    await expect(wrongRole.checkReady()).rejects.toThrow("member of economyos_ingest");
  });

  it("refuses tenant transactions outside a verified Temporal activity scope", async () => {
    const input = workflow();
    const pool = poolWith(async () => []);
    const repository = guardedRepository(pool).repository;
    await expect(repository.beginRun(input)).rejects.toThrow(
      "requires verified activity authorization",
    );
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("rejects a changed manifest behind an existing idempotency key", async () => {
    const input = workflow();
    const {
      inputSha256: _inputSha256,
      workflowId: _workflowId,
      authorization: _authorization,
      ...manifest
    } = input;
    const guarded = guardedRepository(
      poolWith(async (text) => {
        if (text.includes("FROM evidence.connector_bindings")) {
          const configuration = {
            countryCode: input.connector.countryCode,
            indicatorCode: input.connector.indicatorCode,
            sourceId: 2,
          };
          return [
            {
              dataset_id: input.datasetId,
              series_id: input.seriesId,
              connector_code: "world-bank-v2",
              configuration,
              configuration_sha256: digestJson(configuration),
              status: "active",
            },
          ];
        }
        if (text.includes("FROM evidence.ingestion_runs")) {
          return [
            {
              status: "pending",
              workflow_id: `${input.workflowId}-different-input`,
              dataset_id: input.datasetId,
              idempotency_key: input.idempotencyKey,
              input_manifest: manifest,
              output_manifest: null,
              error_code: null,
            },
          ];
        }
        return [];
      }),
    );
    await expect(
      guarded.authorize(input, () => guarded.repository.beginRun(input)),
    ).rejects.toBeInstanceOf(IngestionConflictError);
  });

  it("requires the workflow connector identity to match its active catalog binding", async () => {
    const input = workflow();
    const wrongConfiguration = {
      countryCode: input.connector.countryCode,
      indicatorCode: "SP.POP.TOTL",
      sourceId: 2,
    };
    const guarded = guardedRepository(
      poolWith(async (text) => {
        if (text.includes("FROM evidence.connector_bindings")) {
          return [
            {
              dataset_id: input.datasetId,
              series_id: input.seriesId,
              connector_code: "world-bank-v2",
              configuration: wrongConfiguration,
              configuration_sha256: digestJson(wrongConfiguration),
              status: "active",
            },
          ];
        }
        return [];
      }),
    );

    await expect(
      guarded.authorize(input, () => guarded.repository.beginRun(input)),
    ).rejects.toThrow("active connector binding");
  });

  it("rejects a terminal output whose status or input identity differs from its run", async () => {
    const input = workflow();
    const connectorConfiguration = {
      countryCode: input.connector.countryCode,
      indicatorCode: input.connector.indicatorCode,
      sourceId: 2,
    };
    const guarded = guardedRepository(
      poolWith(async (text) => {
        if (text.includes("FROM evidence.connector_bindings")) {
          return [
            {
              dataset_id: input.datasetId,
              series_id: input.seriesId,
              connector_code: "world-bank-v2",
              configuration: connectorConfiguration,
              configuration_sha256: digestJson(connectorConfiguration),
              status: "active",
            },
          ];
        }
        if (text.includes("FROM evidence.ingestion_runs")) {
          const {
            inputSha256: _inputSha256,
            workflowId: _workflowId,
            authorization: _authorization,
            ...manifest
          } = input;
          return [
            {
              status: "succeeded",
              workflow_id: input.workflowId,
              dataset_id: input.datasetId,
              idempotency_key: input.idempotencyKey,
              input_manifest: manifest,
              output_manifest: {
                schemaVersion: 1,
                runId: input.runId,
                status: "quarantined",
                inputSha256: "0".repeat(64),
              },
              error_code: null,
            },
          ];
        }
        return [];
      }),
    );

    await expect(
      guarded.authorize(input, () => guarded.repository.beginRun(input)),
    ).rejects.toThrow("Stored ingestion output manifest is invalid");
  });

  it("verifies a conflicting fetch event instead of accepting DO NOTHING", async () => {
    const input = workflow();
    const payload = {
      payloadId: "42f762af-d09b-8e42-ae91-0242ac120003",
      requestUri:
        "https://api.worldbank.org/v2/country/USA/indicator/NY.GDP.MKTP.CD?date=2020%3A2020&format=json&page=1&per_page=1000&source=2",
      objectUri:
        "s3://economyos/raw/global/038f47ac-19fc-7c92-ae91-0242ac120003/42f762af-d09b-8e42-ae91-0242ac120003.bin",
      objectKey:
        "raw/global/038f47ac-19fc-7c92-ae91-0242ac120003/42f762af-d09b-8e42-ae91-0242ac120003.bin",
      mediaType: "application/json",
      checksumSha256: "f".repeat(64),
      byteLength: 100,
      fetchedAt: "2026-08-31T10:00:01Z",
      providerRequestId: null,
    } as const;
    const guarded = guardedRepository(
      poolWith(async (text) => {
        if (text.includes("FROM evidence.raw_payloads")) {
          return [
            {
              id: payload.payloadId,
              dataset_id: input.datasetId,
              request_uri: payload.requestUri,
              object_uri: payload.objectUri,
              media_type: payload.mediaType,
              checksum_sha256: payload.checksumSha256,
              byte_length: String(payload.byteLength),
              fetched_at: new Date(payload.fetchedAt),
              provider_request_id: null,
            },
          ];
        }
        if (text.includes("FROM evidence.fetch_events")) {
          return [
            {
              id: "42f762af-d09b-8e42-ae91-0242ac129999",
              dataset_id: input.datasetId,
              raw_payload_id: payload.payloadId,
              request_uri: payload.requestUri,
              fetched_at: new Date(payload.fetchedAt),
              provider_request_id: null,
              response_status: 500,
              attempt: 1,
              workflow_id: input.workflowId,
              ingestion_run_id: input.runId,
            },
          ];
        }
        return [];
      }),
    );
    await expect(
      guarded.authorize(input, () =>
        guarded.repository.persistLanding({ workflow: input, payload, attempt: 1 }),
      ),
    ).rejects.toThrow("Fetch event replay changed immutable content");
  });

  it("retains raw first-seen metadata while returning the current retrieval event", async () => {
    const input = workflow();
    const firstSeenAt = "2026-08-30T09:00:00Z";
    const payload = {
      payloadId: "42f762af-d09b-8e42-ae91-0242ac120003",
      requestUri:
        "https://api.worldbank.org/v2/country/USA/indicator/NY.GDP.MKTP.CD?date=2020%3A2020&format=json&page=1&per_page=1000&source=2",
      objectUri:
        "s3://economyos/raw/global/038f47ac-19fc-7c92-ae91-0242ac120003/42f762af-d09b-8e42-ae91-0242ac120003.bin",
      objectKey:
        "raw/global/038f47ac-19fc-7c92-ae91-0242ac120003/42f762af-d09b-8e42-ae91-0242ac120003.bin",
      mediaType: "application/json",
      checksumSha256: "f".repeat(64),
      byteLength: 100,
      fetchedAt: "2026-08-31T10:00:01Z",
      providerRequestId: "provider-request-current",
    } as const;
    const eventId = deterministicUuid(
      "economyos:fetch-event:v1",
      input.runId,
      payload.requestUri,
      "1",
    );
    let fetchInsertValues: readonly unknown[] | undefined;
    const checkpoints: Array<{
      value: unknown;
      value_sha256: string;
      payload_checksum_sha256: string | null;
    }> = [];
    const guarded = guardedRepository(
      poolWith(async (text, values) => {
        if (text.includes("INSERT INTO evidence.ingestion_checkpoints")) {
          checkpoints.push({
            value: JSON.parse(String(values?.[5])),
            value_sha256: String(values?.[6]),
            payload_checksum_sha256: typeof values?.[7] === "string" ? values[7] : null,
          });
          return [];
        }
        if (text.includes("FROM evidence.ingestion_checkpoints")) {
          const checkpoint = checkpoints.shift();
          return checkpoint ? [checkpoint] : [];
        }
        if (text.includes("JOIN evidence.raw_payloads payload")) {
          expect(text).toContain("fetch.fetched_at, fetch.provider_request_id");
          return [
            {
              id: payload.payloadId,
              dataset_id: input.datasetId,
              request_uri: payload.requestUri,
              object_uri: payload.objectUri,
              media_type: payload.mediaType,
              checksum_sha256: payload.checksumSha256,
              byte_length: String(payload.byteLength),
              fetched_at: new Date(payload.fetchedAt),
              provider_request_id: payload.providerRequestId,
            },
          ];
        }
        if (text.includes("FROM evidence.raw_payloads")) {
          return [
            {
              id: payload.payloadId,
              dataset_id: input.datasetId,
              request_uri: payload.requestUri,
              object_uri: payload.objectUri,
              media_type: payload.mediaType,
              checksum_sha256: payload.checksumSha256,
              byte_length: String(payload.byteLength),
              fetched_at: new Date(firstSeenAt),
              provider_request_id: "provider-request-first-seen",
            },
          ];
        }
        if (text.includes("INSERT INTO evidence.fetch_events")) {
          fetchInsertValues = values;
          return [];
        }
        if (text.includes("FROM evidence.fetch_events")) {
          return [
            {
              id: eventId,
              dataset_id: input.datasetId,
              raw_payload_id: payload.payloadId,
              request_uri: payload.requestUri,
              fetched_at: new Date(payload.fetchedAt),
              provider_request_id: payload.providerRequestId,
              response_status: 200,
              attempt: 1,
              workflow_id: input.workflowId,
              ingestion_run_id: input.runId,
            },
          ];
        }
        return [];
      }),
    );

    const persisted = await guarded.authorize(input, () =>
      guarded.repository.persistLanding({ workflow: input, payload, attempt: 1 }),
    );
    expect(fetchInsertValues?.[5]).toBe(payload.fetchedAt);
    expect(fetchInsertValues?.[6]).toBe(payload.providerRequestId);
    expect(persisted.fetchedAt).toBe("2026-08-31T10:00:01.000Z");
    expect(persisted.providerRequestId).toBe(payload.providerRequestId);

    await expect(
      guarded.authorize(input, () => guarded.repository.findLanding(input)),
    ).resolves.toMatchObject({
      payloadId: payload.payloadId,
      fetchedAt: "2026-08-31T10:00:01.000Z",
      providerRequestId: payload.providerRequestId,
    });
  });

  it("reuses the committed transformation time when promotion resumes after a crash", async () => {
    const input = workflow();
    const transformationCompletedAt = "2026-08-31T10:00:05Z";
    const retryCompletedAt = "2026-08-31T10:05:00Z";
    const payload = {
      payloadId: deterministicUuid("repository-test", "payload"),
      requestUri:
        "https://api.worldbank.org/v2/country/USA/indicator/NY.GDP.MKTP.CD?date=2020%3A2020&format=json&page=1&per_page=1000&source=2",
      objectUri: "s3://economyos/raw/payload.bin",
      objectKey: "raw/payload.bin",
      mediaType: "application/json",
      checksumSha256: "f".repeat(64),
      byteLength: 100,
      fetchedAt: "2026-08-31T10:00:01Z",
      providerRequestId: null,
    } as const;
    const candidates = [
      {
        countryCode: "USA",
        indicatorCode: "NY.GDP.MKTP.CD",
        periodStart: "2020-01-01T00:00:00Z",
        periodEnd: "2021-01-01T00:00:00Z",
        value: "123.4500",
        missingReason: null,
        releaseTime: null,
        availabilityTime: null,
        retrievedAt: payload.fetchedAt,
        pitQuality: "latest_revised_only" as const,
      },
    ];
    const candidateSha256 = digestJson(candidates);
    const transformationRunId = deterministicUuid("repository-test", "transformation");
    const releaseId = deterministicUuid("repository-test", "release");
    const observationId = deterministicUuid(
      "economyos:observation:v1",
      "global",
      input.seriesId,
      releaseId,
      candidates[0]?.periodStart ?? "",
      candidates[0]?.periodEnd ?? "",
      transformationRunId,
    );
    const configuration = transformationConfiguration(input);
    const configurationSha256 = digestJson(configuration);
    const checkpoints: Array<{
      value: unknown;
      value_sha256: string;
      payload_checksum_sha256: string | null;
    }> = [];
    let observationRecordedAt: unknown;
    const guarded = guardedRepository(
      poolWith(async (text, values) => {
        if (text.includes("INSERT INTO evidence.ingestion_checkpoints")) {
          checkpoints.push({
            value: JSON.parse(String(values?.[5])),
            value_sha256: String(values?.[6]),
            payload_checksum_sha256: typeof values?.[7] === "string" ? values[7] : null,
          });
          return [];
        }
        if (text.includes("FROM evidence.ingestion_checkpoints")) {
          const checkpoint = checkpoints.shift();
          return checkpoint ? [checkpoint] : [];
        }
        if (text.includes("FROM evidence.transformation_runs")) {
          return [
            {
              id: transformationRunId,
              dataset_id: input.datasetId,
              raw_payload_id: payload.payloadId,
              parser_name: input.parser.name,
              parser_version: input.parser.version,
              code_sha256: input.parser.codeSha256,
              configuration,
              configuration_sha256: configurationSha256,
              status: "succeeded",
              completed_at: new Date(transformationCompletedAt),
              attempt: 1,
            },
          ];
        }
        if (text.includes("FROM evidence.releases")) {
          return [
            {
              id: releaseId,
              dataset_id: input.datasetId,
              raw_payload_id: payload.payloadId,
              release_time: null,
              pit_quality: "latest_revised_only",
              revision_sequence: 0,
              source_publication_time: null,
              original_release_time: null,
              availability_time: null,
              revision_time: null,
            },
          ];
        }
        if (text.includes("INSERT INTO evidence.observations")) {
          observationRecordedAt = values?.[9];
          return [];
        }
        if (text.includes("FROM evidence.observations")) {
          return [
            {
              id: observationId,
              series_id: input.seriesId,
              release_id: releaseId,
              period_start: new Date(candidates[0]?.periodStart ?? ""),
              period_end: new Date(candidates[0]?.periodEnd ?? ""),
              value_numeric: "123.45",
              missing_reason: null,
              status: "final",
              parser_version: input.parser.version,
              transformation_run_id: transformationRunId,
              recorded_at: new Date(transformationCompletedAt),
            },
          ];
        }
        return [];
      }),
    );

    await expect(
      guarded.authorize(input, () =>
        guarded.repository.promote({
          workflow: input,
          landing: { payloads: [payload], candidates, candidateSha256 },
          decision: {
            disposition: "promote",
            transformationRunId,
            transformationConfigurationSha256: configurationSha256,
            releaseId,
            score: 1,
            results: [],
            reasons: [],
            candidateSha256,
          },
          attempt: 2,
          completedAt: retryCompletedAt,
        }),
      ),
    ).resolves.toMatchObject({ transformationRunId, releaseId, observationIds: [observationId] });
    expect(observationRecordedAt).toBe(new Date(transformationCompletedAt).toISOString());
    expect(observationRecordedAt).not.toBe(new Date(retryCompletedAt).toISOString());
  });
});
