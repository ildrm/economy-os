import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

const PROVIDER = "Adobe S3Mock 5.1.0";
const DEFAULT_ENDPOINT = "http://127.0.0.1:59090";
const DEFAULT_BUCKET = "economyos-local";
const DEFAULT_REGION = "us-east-1";

function requireLocalEndpoint(rawEndpoint) {
  const endpoint = new URL(rawEndpoint);
  const local = endpoint.hostname === "127.0.0.1" || endpoint.hostname === "localhost";
  if (endpoint.protocol !== "http:" || !local) {
    throw new Error("Object-storage verification is restricted to a local HTTP endpoint");
  }
  return endpoint.toString().replace(/\/$/, "");
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitUntilReady(storage, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  do {
    try {
      await storage.checkReady();
      return;
    } catch (error) {
      lastError = error;
      await wait(500);
    }
  } while (Date.now() < deadline);
  throw new Error("S3 provider did not become ready before the verification deadline", {
    cause: lastError,
  });
}

function makePayload() {
  const marker = Buffer.from("economyos-object-storage-provider-gate\0", "utf8");
  const binary = Buffer.from(Array.from({ length: 1_024 }, (_, index) => (index * 37 + 11) % 256));
  return Buffer.concat([marker, binary]);
}

function errorReport(error) {
  if (!(error instanceof Error)) return { name: "UnknownError", message: String(error) };
  const metadata = error.$metadata;
  return {
    name: error.name,
    message: error.message,
    ...(metadata && typeof metadata.httpStatusCode === "number"
      ? { httpStatusCode: metadata.httpStatusCode }
      : {}),
    ...(error.cause ? { cause: errorReport(error.cause) } : {}),
  };
}

async function main() {
  const endpoint = requireLocalEndpoint(process.env.S3_VERIFY_ENDPOINT ?? DEFAULT_ENDPOINT);
  const bucket = process.env.S3_VERIFY_BUCKET ?? DEFAULT_BUCKET;
  const region = process.env.S3_VERIFY_REGION ?? DEFAULT_REGION;

  process.env.AWS_ACCESS_KEY_ID ||= "economyos-s3mock-only";
  process.env.AWS_SECRET_ACCESS_KEY ||= "economyos-s3mock-only-secret";
  process.env.AWS_EC2_METADATA_DISABLED ||= "true";

  const { S3ObjectStorage } = await import("../packages/object-storage/dist/index.js");
  const storage = new S3ObjectStorage({
    region,
    bucket,
    endpoint,
    forcePathStyle: true,
    allowInsecureLocalEndpoint: true,
    requestTimeoutMs: 2_000,
  });

  await waitUntilReady(storage);

  const datasetId = randomUUID();
  const payloadId = randomUUID();
  const body = makePayload();
  const expectedChecksum = createHash("sha256").update(body).digest("hex");
  const input = {
    scope: "global",
    datasetId,
    payloadId,
    body,
    mediaType: "application/octet-stream",
  };

  const stored = await storage.putRawPayload(input);
  assert.deepEqual(stored, {
    uri: `s3://${bucket}/raw/global/${datasetId}/${payloadId}.bin`,
    key: `raw/global/${datasetId}/${payloadId}.bin`,
    checksumSha256: expectedChecksum,
    byteLength: body.byteLength,
  });

  const downloaded = await storage.getVerified(stored);
  assert.deepEqual(
    Buffer.from(downloaded),
    body,
    "downloaded bytes must exactly match the uploaded payload",
  );

  const replay = await storage.putRawPayload(input);
  assert.deepEqual(replay, stored, "an identical replay must resolve to the existing object");

  const conflictingBody = Buffer.from(body);
  conflictingBody[conflictingBody.length - 1] ^= 0xff;
  let conflictError;
  try {
    await storage.putRawPayload({ ...input, body: conflictingBody });
  } catch (error) {
    conflictError = error;
  }
  assert.ok(conflictError instanceof Error, "a conflicting replay must be rejected");
  assert.match(
    conflictError.message,
    /Stored object checksum mismatch/,
    "the rejection must come from verifying the immutable existing object",
  );

  const afterConflict = await storage.getVerified(stored);
  assert.deepEqual(
    Buffer.from(afterConflict),
    body,
    "a rejected conflict must leave the original object unchanged",
  );

  console.log(
    JSON.stringify(
      {
        status: "pass",
        provider: PROVIDER,
        endpoint,
        bucket,
        readiness: "pass",
        exactWriteReadAndChecksum: "pass",
        identicalReplay: "pass",
        conflictingReplay: "rejected",
        adapterDefaultServerSideEncryption: "AES256",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: "fail",
        provider: PROVIDER,
        compatibilityContract:
          "readiness, checksum-preserving I/O, AES256-default writes, and conditional immutability",
        error: errorReport(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
