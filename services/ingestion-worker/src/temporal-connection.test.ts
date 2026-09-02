import { describe, expect, it } from "vitest";

import { temporalConnectionOptions } from "./temporal-connection.js";

describe("Temporal worker connection options", () => {
  it("forwards production TLS and API-key identity to the native SDK", async () => {
    await expect(
      temporalConnectionOptions({
        address: "namespace.account.tmprl.cloud:7233",
        namespace: "production",
        taskQueue: "economyos-ingestion-v1",
        tls: true,
        allowInsecureLocal: false,
        apiKey: "production-temporal-api-key",
      }),
    ).resolves.toEqual({
      address: "namespace.account.tmprl.cloud:7233",
      tls: {},
      apiKey: "production-temporal-api-key",
    });
  });

  it("does not attach credentials to an explicitly local plaintext connection", async () => {
    await expect(
      temporalConnectionOptions({
        address: "127.0.0.1:7233",
        namespace: "default",
        taskQueue: "economyos-ingestion-v1",
        tls: false,
        allowInsecureLocal: true,
      }),
    ).resolves.toEqual({ address: "127.0.0.1:7233", tls: false });
  });
});
