import { describe, expect, it } from "vitest";

import { IngestionClient } from "./client.js";

const base = {
  namespace: "default",
  taskQueue: "economyos-ingestion-v1",
} as const;

describe("ingestion Temporal client transport", () => {
  it("rejects production TLS without authenticated namespace identity", async () => {
    await expect(
      IngestionClient.connect({
        ...base,
        runtime: "production",
        address: "temporal.example:7233",
        tls: true,
      }),
    ).rejects.toThrow("API key or mTLS identity");
  });

  it("rejects plaintext remote transport and credentials over plaintext", async () => {
    await expect(
      IngestionClient.connect({
        ...base,
        runtime: "test",
        address: "temporal.example:7233",
        tls: false,
        allowInsecureLocal: true,
      }),
    ).rejects.toThrow("loopback opt-in");
    await expect(
      IngestionClient.connect({
        ...base,
        runtime: "test",
        address: "127.0.0.1:7233",
        tls: false,
        allowInsecureLocal: true,
        apiKey: "must-not-cross-plaintext",
      }),
    ).rejects.toThrow("credentials require TLS");
  });

  it("rejects incomplete mTLS client identity", async () => {
    await expect(
      IngestionClient.connect({
        ...base,
        runtime: "production",
        address: "temporal.example:7233",
        tls: true,
        clientCertificate: new TextEncoder().encode("certificate"),
      }),
    ).rejects.toThrow("both certificate and private key");
  });
});
