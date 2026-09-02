import {
  assertWorkflowInput,
  type CreateIngestionWorkflowInput,
  createIngestionWorkflowInput,
  type IngestionAuthorizationSigningOptions,
  type IngestionOutputManifest,
  type IngestionWorkflowInput,
} from "@economyos/data-admission";
import {
  Client,
  Connection,
  WorkflowExecutionAlreadyStartedError,
  type WorkflowHandle,
} from "@temporalio/client";
import type { deliverReleaseNotifications } from "./release-notification-workflow.js";
import {
  type CreateReleaseNotificationWorkflowInput,
  createReleaseNotificationWorkflowInput,
  type ReleaseNotificationOutputManifest,
} from "./release-notifications.js";
import type { ingestDataset } from "./workflows.js";

export interface IngestionClientConfig {
  readonly runtime: "development" | "test" | "production";
  readonly address: string;
  readonly namespace: string;
  readonly taskQueue: string;
  readonly tls: boolean;
  readonly allowInsecureLocal?: boolean;
  readonly apiKey?: string;
  readonly serverNameOverride?: string;
  readonly serverRootCACertificate?: Uint8Array;
  readonly clientCertificate?: Uint8Array;
  readonly clientPrivateKey?: Uint8Array;
}

function connectionOptions(
  config: IngestionClientConfig,
): Parameters<typeof Connection.connect>[0] {
  if (
    config.runtime !== "development" &&
    config.runtime !== "test" &&
    config.runtime !== "production"
  ) {
    throw new TypeError("Temporal client runtime is invalid");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(config.namespace)) {
    throw new TypeError("Temporal client namespace is invalid");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(config.taskQueue)) {
    throw new TypeError("Temporal client task queue is invalid");
  }
  const address = /^(?<host>[A-Za-z0-9.-]+):(?<port>\d{1,5})$/.exec(config.address);
  const port = Number(address?.groups?.port);
  if (!address || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError("Temporal client address must be a valid host and port");
  }
  const host = address.groups?.host?.toLowerCase();
  if (
    !config.tls &&
    (config.runtime === "production" ||
      config.allowInsecureLocal !== true ||
      (host !== "127.0.0.1" && host !== "localhost"))
  ) {
    throw new TypeError(
      "Insecure Temporal client transport requires an explicit development/test loopback opt-in",
    );
  }
  if ((config.clientCertificate === undefined) !== (config.clientPrivateKey === undefined)) {
    throw new TypeError("Temporal client mTLS requires both certificate and private key bytes");
  }
  if (
    config.apiKey &&
    (config.apiKey.length < 16 ||
      config.apiKey.length > 4_096 ||
      [...config.apiKey].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127;
      }))
  ) {
    throw new TypeError("Temporal client API key is invalid");
  }
  if (
    (config.clientCertificate && config.clientCertificate.byteLength === 0) ||
    (config.clientPrivateKey && config.clientPrivateKey.byteLength === 0) ||
    (config.serverRootCACertificate && config.serverRootCACertificate.byteLength === 0)
  ) {
    throw new TypeError("Temporal client TLS credential bytes cannot be empty");
  }
  if (
    config.runtime === "production" &&
    (!config.tls || (!config.apiKey && !config.clientCertificate))
  ) {
    throw new TypeError("Production Temporal clients require TLS plus an API key or mTLS identity");
  }
  if (
    !config.tls &&
    (config.apiKey ||
      config.serverNameOverride ||
      config.serverRootCACertificate ||
      config.clientCertificate)
  ) {
    throw new TypeError("Temporal client credentials require TLS");
  }
  const tls = config.tls
    ? {
        ...(config.serverNameOverride ? { serverNameOverride: config.serverNameOverride } : {}),
        ...(config.serverRootCACertificate
          ? { serverRootCACertificate: Uint8Array.from(config.serverRootCACertificate) }
          : {}),
        ...(config.clientCertificate && config.clientPrivateKey
          ? {
              clientCertPair: {
                crt: Uint8Array.from(config.clientCertificate),
                key: Uint8Array.from(config.clientPrivateKey),
              },
            }
          : {}),
      }
    : false;
  return {
    address: config.address,
    tls,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
  };
}

export class IngestionClient implements AsyncDisposable {
  readonly #connection: Connection;
  readonly #client: Client;
  readonly #taskQueue: string;

  private constructor(connection: Connection, client: Client, taskQueue: string) {
    this.#connection = connection;
    this.#client = client;
    this.#taskQueue = taskQueue;
  }

  static async connect(config: IngestionClientConfig): Promise<IngestionClient> {
    const connection = await Connection.connect(connectionOptions(config));
    return new IngestionClient(
      connection,
      new Client({ connection, namespace: config.namespace }),
      config.taskQueue,
    );
  }

  async startRequest(
    input: CreateIngestionWorkflowInput,
    authorization: IngestionAuthorizationSigningOptions,
  ): Promise<WorkflowHandle<typeof ingestDataset>> {
    return this.start(createIngestionWorkflowInput(input, authorization));
  }

  async start(input: IngestionWorkflowInput): Promise<WorkflowHandle<typeof ingestDataset>> {
    assertWorkflowInput(input);
    try {
      return await this.#client.workflow.start<typeof ingestDataset>("ingestDataset", {
        taskQueue: this.#taskQueue,
        workflowId: input.workflowId,
        args: [input],
      });
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      return this.#client.workflow.getHandle<typeof ingestDataset>(input.workflowId);
    }
  }

  async result(input: IngestionWorkflowInput): Promise<IngestionOutputManifest> {
    return (await this.start(input)).result();
  }

  async startReleaseNotifications(
    request: CreateReleaseNotificationWorkflowInput,
  ): Promise<WorkflowHandle<typeof deliverReleaseNotifications>> {
    const input = createReleaseNotificationWorkflowInput(request);
    try {
      return await this.#client.workflow.start<typeof deliverReleaseNotifications>(
        "deliverReleaseNotifications",
        {
          taskQueue: this.#taskQueue,
          workflowId: input.workflowId,
          args: [input],
        },
      );
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      return this.#client.workflow.getHandle<typeof deliverReleaseNotifications>(input.workflowId);
    }
  }

  async releaseNotificationResult(
    request: CreateReleaseNotificationWorkflowInput,
  ): Promise<ReleaseNotificationOutputManifest> {
    return (await this.startReleaseNotifications(request)).result();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.#connection.close();
  }
}
