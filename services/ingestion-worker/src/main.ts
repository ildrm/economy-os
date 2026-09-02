import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import { WorldBankConnector } from "@economyos/canonical-data";
import { S3ObjectStorage } from "@economyos/object-storage";
import { NativeConnection, Worker } from "@temporalio/worker";
import pg from "pg";

import { createIngestionActivities } from "./activities.js";
import { IngestionAuthorizationGuard } from "./authorization.js";
import { loadWorkerConfig } from "./config.js";
import { createReleaseNotificationActivities } from "./release-notification-activities.js";
import { PgReleaseNotificationRepository } from "./release-notification-repository.js";
import { PgIngestionRepository } from "./repository.js";
import { temporalConnectionOptions } from "./temporal-connection.js";

try {
  loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const config = loadWorkerConfig(process.env);
const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
});
const authorization = new IngestionAuthorizationGuard({
  keys: new Map(
    Object.entries(config.authorization.keys).map(([keyId, encoded]) => [
      keyId,
      Buffer.from(encoded, "base64url"),
    ]),
  ),
  expectedNamespace: config.temporal.namespace,
  maximumTtlMs: config.authorization.maximumTtlMs,
  clockSkewMs: config.authorization.clockSkewMs,
  replayCapacity: config.authorization.replayCapacity,
});
const repository = new PgIngestionRepository(pool, authorization);
const releaseNotificationRepository = new PgReleaseNotificationRepository(pool);
const objectStorage = new S3ObjectStorage(config.objectStorage);
let connection: NativeConnection | undefined;

try {
  connection = await NativeConnection.connect(await temporalConnectionOptions(config.temporal));
  await Promise.all([
    repository.checkReady(),
    releaseNotificationRepository.checkReady(),
    objectStorage.checkReady(),
  ]);
  const worker = await Worker.create({
    connection,
    namespace: config.temporal.namespace,
    taskQueue: config.temporal.taskQueue,
    workflowsPath: fileURLToPath(new URL("./workflows.js", import.meta.url)),
    activities: {
      ...createIngestionActivities({
        connector: new WorldBankConnector(),
        objectStorage,
        repository,
        authorization,
      }),
      ...createReleaseNotificationActivities(releaseNotificationRepository),
    },
  });
  const shutdown = () => worker.shutdown();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await worker.run();
} finally {
  await Promise.allSettled([pool.end(), connection?.close()]);
}
