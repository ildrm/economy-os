import { createHash } from "node:crypto";
import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUCKET = /^(?!\d+\.\d+\.\d+\.\d+$)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

export type StorageScope = "global" | string;

export interface ObjectStorageConfig {
  readonly region: string;
  readonly bucket: string;
  readonly endpoint?: string;
  readonly forcePathStyle?: boolean;
  readonly allowInsecureLocalEndpoint?: boolean;
  readonly maximumObjectBytes?: number;
  readonly requestTimeoutMs?: number;
  readonly serverSideEncryption?:
    | { readonly type: "AES256" }
    | { readonly type: "aws:kms"; readonly keyId: string };
}

export interface PutRawPayloadInput {
  readonly scope: StorageScope;
  readonly datasetId: string;
  readonly payloadId: string;
  readonly body: Uint8Array;
  readonly mediaType: string;
}

export interface StoredObject {
  readonly uri: string;
  readonly key: string;
  readonly checksumSha256: string;
  readonly byteLength: number;
}

interface S3Port {
  send(
    command: PutObjectCommand | GetObjectCommand | HeadBucketCommand,
    options?: { readonly abortSignal?: AbortSignal },
  ): Promise<{
    readonly Body?: AsyncIterable<Uint8Array> | { transformToByteArray(): Promise<Uint8Array> };
    readonly ContentLength?: number;
  }>;
}

const DEFAULT_MAXIMUM_OBJECT_BYTES = 50_000_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

function validateConfig(config: ObjectStorageConfig): void {
  if (!BUCKET.test(config.bucket)) throw new TypeError("S3 bucket name is invalid");
  if (!config.region.trim()) throw new TypeError("S3 region is required");
  const maximumBytes = config.maximumObjectBytes ?? DEFAULT_MAXIMUM_OBJECT_BYTES;
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new TypeError("S3 maximum object bytes must be a positive safe integer");
  }
  const timeout = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 300_000) {
    throw new TypeError("S3 request timeout must be between 100 and 300000 milliseconds");
  }
  if (config.endpoint) {
    const endpoint = new URL(config.endpoint);
    const local = endpoint.hostname === "127.0.0.1" || endpoint.hostname === "localhost";
    if (endpoint.protocol !== "https:" && !(local && config.allowInsecureLocalEndpoint)) {
      throw new TypeError(
        "S3 endpoint must use HTTPS outside explicitly allowed local development",
      );
    }
  }
  if (
    config.serverSideEncryption?.type === "aws:kms" &&
    !config.serverSideEncryption.keyId.trim()
  ) {
    throw new TypeError("S3 KMS key ID is required");
  }
}

function validateIdentity(value: string, name: string): string {
  if (!UUID.test(value)) throw new TypeError(`${name} must be a UUID`);
  return value.toLowerCase();
}

function keyFor(input: PutRawPayloadInput): string {
  const scope = input.scope === "global" ? "global" : validateIdentity(input.scope, "scope");
  return `raw/${scope}/${validateIdentity(input.datasetId, "datasetId")}/${validateIdentity(input.payloadId, "payloadId")}.bin`;
}

function isPreconditionFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return candidate.name === "PreconditionFailed" || candidate.$metadata?.httpStatusCode === 412;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array> {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === "function"
  );
}

async function readBounded(
  body: NonNullable<Awaited<ReturnType<S3Port["send"]>>["Body"]>,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (!isAsyncIterable(body)) {
    throw new Error("Stored object body is not a bounded stream");
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of body) {
    if (!(chunk instanceof Uint8Array)) throw new Error("Stored object stream chunk is invalid");
    length += chunk.byteLength;
    if (length > maximumBytes) throw new Error("Stored object exceeds the read limit");
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export class S3ObjectStorage {
  readonly #config: ObjectStorageConfig;
  readonly #client: S3Port;

  constructor(config: ObjectStorageConfig, client?: S3Port) {
    validateConfig(config);
    this.#config = Object.freeze({ ...config });
    if (client) {
      this.#client = client;
    } else {
      const nativeClient = new S3Client({
        region: config.region,
        ...(config.endpoint ? { endpoint: config.endpoint } : {}),
        forcePathStyle: config.forcePathStyle ?? false,
      });
      this.#client = {
        async send(command, options) {
          if (command instanceof PutObjectCommand) {
            await nativeClient.send(command, options);
            return {};
          }
          if (command instanceof HeadBucketCommand) {
            await nativeClient.send(command, options);
            return {};
          }
          const result = await nativeClient.send(command, options);
          return {
            ...(result.Body ? { Body: result.Body } : {}),
            ...(result.ContentLength !== undefined ? { ContentLength: result.ContentLength } : {}),
          };
        },
      };
    }
  }

  async putRawPayload(input: PutRawPayloadInput): Promise<StoredObject> {
    if (!input.mediaType.trim() || input.mediaType.length > 255) {
      throw new TypeError("Payload media type is invalid");
    }
    const key = keyFor(input);
    const maximumBytes = this.#config.maximumObjectBytes ?? DEFAULT_MAXIMUM_OBJECT_BYTES;
    if (input.body.byteLength > maximumBytes) {
      throw new Error("Payload exceeds the write limit");
    }
    const checksum = createHash("sha256").update(input.body).digest();
    const checksumHex = checksum.toString("hex");
    const encryption = this.#config.serverSideEncryption ?? { type: "AES256" as const };
    const stored = Object.freeze({
      uri: `s3://${this.#config.bucket}/${key}`,
      key,
      checksumSha256: checksumHex,
      byteLength: input.body.byteLength,
    });
    try {
      await this.#client.send(
        new PutObjectCommand({
          Bucket: this.#config.bucket,
          Key: key,
          Body: input.body,
          ContentLength: input.body.byteLength,
          ContentType: input.mediaType,
          ChecksumSHA256: checksum.toString("base64"),
          IfNoneMatch: "*",
          Metadata: {
            "checksum-sha256": checksumHex,
            "payload-id": input.payloadId.toLowerCase(),
          },
          ServerSideEncryption: encryption.type,
          ...(encryption.type === "aws:kms" ? { SSEKMSKeyId: encryption.keyId } : {}),
        }),
        {
          abortSignal: AbortSignal.timeout(
            this.#config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
          ),
        },
      );
    } catch (error) {
      if (!isPreconditionFailure(error)) throw error;
      await this.getVerified(stored, maximumBytes);
    }
    return stored;
  }

  async getVerified(
    stored: StoredObject,
    maximumBytes = this.#config.maximumObjectBytes ?? DEFAULT_MAXIMUM_OBJECT_BYTES,
  ): Promise<Uint8Array> {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
      throw new TypeError("Read limit must be a positive safe integer");
    }
    if (!Number.isSafeInteger(stored.byteLength) || stored.byteLength < 0) {
      throw new TypeError("Stored object byte length is invalid");
    }
    if (!/^[0-9a-f]{64}$/.test(stored.checksumSha256)) {
      throw new TypeError("Stored object checksum is invalid");
    }
    const keyParts = stored.key.split("/");
    const [prefix, scope, dataset, payloadFile] = keyParts;
    const payload = payloadFile?.endsWith(".bin") ? payloadFile.slice(0, -4) : "";
    if (
      keyParts.length !== 4 ||
      prefix !== "raw" ||
      (scope !== "global" && !UUID.test(scope ?? "")) ||
      !UUID.test(dataset ?? "") ||
      !UUID.test(payload)
    ) {
      throw new TypeError("Stored object key is invalid");
    }
    if (stored.uri !== `s3://${this.#config.bucket}/${stored.key}`) {
      throw new TypeError("Stored object URI does not match the configured bucket and key");
    }
    if (stored.byteLength > maximumBytes) throw new Error("Stored object exceeds the read limit");
    const result = await this.#client.send(
      new GetObjectCommand({ Bucket: this.#config.bucket, Key: stored.key }),
      {
        abortSignal: AbortSignal.timeout(
          this.#config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
        ),
      },
    );
    if (!result.Body) throw new Error("Stored object body is missing");
    if (
      result.ContentLength !== undefined &&
      (!Number.isSafeInteger(result.ContentLength) ||
        result.ContentLength < 0 ||
        result.ContentLength > maximumBytes)
    ) {
      throw new Error("Stored object content length is invalid or exceeds the read limit");
    }
    const bytes = await readBounded(result.Body, maximumBytes);
    if (bytes.byteLength !== stored.byteLength) throw new Error("Stored object length mismatch");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (checksum !== stored.checksumSha256) throw new Error("Stored object checksum mismatch");
    return bytes;
  }

  async checkReady(): Promise<void> {
    await this.#client.send(new HeadBucketCommand({ Bucket: this.#config.bucket }), {
      abortSignal: AbortSignal.timeout(this.#config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS),
    });
  }
}
