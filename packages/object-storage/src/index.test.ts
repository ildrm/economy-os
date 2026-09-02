import { type GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { S3ObjectStorage } from "./index.js";

const datasetId = "018f47ac-19fc-7c92-ae91-0242ac120002";
const payloadId = "018f47ac-19fc-7c92-ae91-0242ac120003";

async function* stream(...chunks: Uint8Array[]): AsyncGenerator<Uint8Array> {
  yield* chunks;
}

describe("S3 object storage", () => {
  it("writes checksum-addressed, create-only, encrypted raw evidence", async () => {
    let command: PutObjectCommand | undefined;
    const client = {
      async send(candidate: PutObjectCommand) {
        command = candidate;
        return {};
      },
    };
    const storage = new S3ObjectStorage({ bucket: "economyos-test", region: "us-east-1" }, client);
    const stored = await storage.putRawPayload({
      scope: "global",
      datasetId,
      payloadId,
      body: new TextEncoder().encode("source payload"),
      mediaType: "application/json",
    });
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command?.input).toMatchObject({
      Bucket: "economyos-test",
      IfNoneMatch: "*",
      ServerSideEncryption: "AES256",
      Key: `raw/global/${datasetId}/${payloadId}.bin`,
    });
    expect(stored.uri).toBe(`s3://economyos-test/raw/global/${datasetId}/${payloadId}.bin`);
    expect(stored.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies checksum on reads", async () => {
    const body = new TextEncoder().encode("source payload");
    const client = {
      async send(command: PutObjectCommand | GetObjectCommand) {
        if (command instanceof PutObjectCommand) return {};
        return { Body: stream(body), ContentLength: body.byteLength };
      },
    };
    const storage = new S3ObjectStorage({ bucket: "economyos-test", region: "us-east-1" }, client);
    const stored = await storage.putRawPayload({
      scope: "global",
      datasetId,
      payloadId,
      body,
      mediaType: "application/json",
    });
    await expect(storage.getVerified(stored)).resolves.toEqual(body);
    await expect(
      storage.getVerified({ ...stored, checksumSha256: "0".repeat(64) }),
    ).rejects.toThrow("checksum");
  });

  it("rejects unsafe endpoints, identities, media types, and oversized reads", async () => {
    expect(() => new S3ObjectStorage({ bucket: "Invalid_Bucket", region: "us-east-1" })).toThrow(
      "bucket",
    );
    expect(() => new S3ObjectStorage({ bucket: "economyos-test", region: "" })).toThrow("region");
    expect(
      () =>
        new S3ObjectStorage({
          bucket: "economyos-test",
          region: "us-east-1",
          endpoint: "http://storage.example.test",
        }),
    ).toThrow("HTTPS");
    expect(
      () =>
        new S3ObjectStorage({
          bucket: "economyos-test",
          region: "us-east-1",
          serverSideEncryption: { type: "aws:kms", keyId: "" },
        }),
    ).toThrow("KMS");
    const storage = new S3ObjectStorage(
      { bucket: "economyos-test", region: "us-east-1" },
      {
        async send() {
          return {};
        },
      },
    );
    await expect(
      storage.putRawPayload({
        scope: "global",
        datasetId: "not-a-uuid",
        payloadId,
        body: new Uint8Array(),
        mediaType: "application/json",
      }),
    ).rejects.toThrow("datasetId");
    await expect(
      storage.putRawPayload({
        scope: "global",
        datasetId,
        payloadId,
        body: new Uint8Array(),
        mediaType: "",
      }),
    ).rejects.toThrow("media type");
    await expect(
      storage.getVerified(
        {
          uri: `s3://economyos-test/raw/global/${datasetId}/${payloadId}.bin`,
          key: `raw/global/${datasetId}/${payloadId}.bin`,
          checksumSha256: "0".repeat(64),
          byteLength: 10,
        },
        5,
      ),
    ).rejects.toThrow("read limit");
  });

  it("supports tenant-scoped KMS keys and rejects missing read bodies", async () => {
    let command: PutObjectCommand | undefined;
    const client = {
      async send(candidate: PutObjectCommand | GetObjectCommand) {
        command = candidate instanceof PutObjectCommand ? candidate : command;
        return {};
      },
    };
    const storage = new S3ObjectStorage(
      {
        bucket: "economyos-test",
        region: "us-east-1",
        endpoint: "http://127.0.0.1:9000",
        allowInsecureLocalEndpoint: true,
        serverSideEncryption: { type: "aws:kms", keyId: "test-key" },
      },
      client,
    );
    const stored = await storage.putRawPayload({
      scope: "018f47ac-19fc-7c92-ae91-0242ac120004",
      datasetId,
      payloadId,
      body: new Uint8Array(),
      mediaType: "application/octet-stream",
    });
    expect(command?.input).toMatchObject({
      ServerSideEncryption: "aws:kms",
      SSEKMSKeyId: "test-key",
    });
    await expect(storage.getVerified(stored)).rejects.toThrow("body is missing");
  });

  it("bounds streamed reads and safely recovers an idempotent conditional replay", async () => {
    const body = new TextEncoder().encode("source payload");
    let puts = 0;
    const client = {
      async send(command: PutObjectCommand | GetObjectCommand) {
        if (command instanceof PutObjectCommand) {
          puts += 1;
          if (puts > 1) {
            throw Object.assign(new Error("already exists"), {
              name: "PreconditionFailed",
              $metadata: { httpStatusCode: 412 },
            });
          }
          return {};
        }
        return { Body: stream(body), ContentLength: body.byteLength };
      },
    };
    const storage = new S3ObjectStorage({ bucket: "economyos-test", region: "us-east-1" }, client);
    const input = {
      scope: "global" as const,
      datasetId,
      payloadId,
      body,
      mediaType: "application/json",
    };
    const first = await storage.putRawPayload(input);
    await expect(storage.putRawPayload(input)).resolves.toEqual(first);

    const oversized = stream(new Uint8Array(4), new Uint8Array(4));
    const bounded = new S3ObjectStorage(
      { bucket: "economyos-test", region: "us-east-1" },
      {
        async send() {
          return { Body: oversized };
        },
      },
    );
    await expect(bounded.getVerified({ ...first, byteLength: 5 }, 5)).rejects.toThrow("read limit");
    await expect(storage.getVerified(first, Number.NaN)).rejects.toThrow("positive safe integer");
    await expect(
      storage.getVerified({ ...first, key: "raw/global/../secret.bin" }),
    ).rejects.toThrow("key");
  });
});
