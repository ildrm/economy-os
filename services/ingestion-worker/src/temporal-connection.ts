import { readFile } from "node:fs/promises";

import type { WorkerConfig } from "./config.js";

interface TemporalTlsOptions {
  readonly serverNameOverride?: string;
  readonly serverRootCACertificate?: Uint8Array;
  readonly clientCertPair?: {
    readonly crt: Uint8Array;
    readonly key: Uint8Array;
  };
}

export interface TemporalConnectionOptions {
  readonly address: string;
  readonly tls: false | TemporalTlsOptions;
  readonly apiKey?: string;
}

async function credentialFile(path: string, kind: "certificate" | "private key"): Promise<Buffer> {
  const bytes = await readFile(path);
  if (bytes.byteLength === 0 || bytes.byteLength > 1_000_000) {
    throw new Error(`Temporal ${kind} file must contain between 1 and 1000000 bytes`);
  }
  const text = bytes.toString("utf8", 0, Math.min(bytes.byteLength, 128));
  if (
    (kind === "certificate" && !text.includes("-----BEGIN CERTIFICATE-----")) ||
    (kind === "private key" && !/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(text))
  ) {
    throw new Error(`Temporal ${kind} file is not PEM encoded`);
  }
  return bytes;
}

export async function temporalConnectionOptions(
  config: WorkerConfig["temporal"],
): Promise<TemporalConnectionOptions> {
  if (!config.tls) return { address: config.address, tls: false };
  const [serverRootCACertificate, clientCertificate, clientPrivateKey] = await Promise.all([
    config.serverRootCaPath ? credentialFile(config.serverRootCaPath, "certificate") : undefined,
    config.clientCertificatePath
      ? credentialFile(config.clientCertificatePath, "certificate")
      : undefined,
    config.clientPrivateKeyPath
      ? credentialFile(config.clientPrivateKeyPath, "private key")
      : undefined,
  ]);
  return {
    address: config.address,
    tls: {
      ...(config.serverNameOverride ? { serverNameOverride: config.serverNameOverride } : {}),
      ...(serverRootCACertificate ? { serverRootCACertificate } : {}),
      ...(clientCertificate && clientPrivateKey
        ? { clientCertPair: { crt: clientCertificate, key: clientPrivateKey } }
        : {}),
    },
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
  };
}
