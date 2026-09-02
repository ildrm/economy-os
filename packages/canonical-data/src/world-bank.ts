import { createHash } from "node:crypto";

const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const JSON_NUMBER_PREFIX = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;
const MAX_ATTEMPTS = 3;
const MAX_DECIMAL_CHARACTERS = 512;
const MAX_PAGE_BYTES = 20_000_000;
const MAX_PAGES = 10;
const MAX_TOTAL_BYTES = 25_000_000;
const WORLD_DEVELOPMENT_INDICATORS_SOURCE_ID = "2";

export interface WorldBankRequest {
  readonly countryCode: string;
  readonly indicatorCode: string;
  readonly startYear: number;
  readonly endYear: number;
}

export interface RawPayload {
  readonly source: "world-bank-v2";
  readonly dataset: "world-development-indicators";
  readonly requestUrl: string;
  readonly fetchedAt: string;
  readonly checksumSha256: string;
  readonly byteLength: number;
  readonly mediaType: "application/json";
  readonly body: Uint8Array;
}

export interface WorldBankRow {
  readonly countryCode: string;
  readonly indicatorCode: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly value: string | null;
  readonly missingReason: "source_missing" | null;
  readonly releaseTime: null;
  readonly availabilityTime: null;
  readonly retrievedAt: string;
  readonly pitQuality: "latest_revised_only";
}

export interface WorldBankFetchResult {
  readonly payloads: readonly RawPayload[];
  readonly rows: readonly WorldBankRow[];
}

export type WorldBankConnectorErrorCode =
  | "WORLD_BANK_HTTP"
  | "WORLD_BANK_PAGINATION"
  | "WORLD_BANK_RESPONSE_INVALID"
  | "WORLD_BANK_RESPONSE_TOO_LARGE"
  | "WORLD_BANK_TRANSPORT";

export class WorldBankConnectorError extends Error {
  readonly code: WorldBankConnectorErrorCode;
  readonly retryable: boolean;
  readonly status: number | undefined;

  constructor(
    message: string,
    options: {
      readonly code: WorldBankConnectorErrorCode;
      readonly retryable?: boolean;
      readonly status?: number;
      readonly cause?: unknown;
    },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "WorldBankConnectorError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Sleep = (milliseconds: number) => Promise<void>;

const defaultSleep: Sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function assertRequest(request: WorldBankRequest): void {
  if (!/^[A-Z]{3}$/.test(request.countryCode)) {
    throw new TypeError("countryCode must be ISO alpha-3");
  }
  if (!/^[A-Z0-9._]{2,64}$/.test(request.indicatorCode)) {
    throw new TypeError("indicatorCode is invalid");
  }
  if (
    !Number.isInteger(request.startYear) ||
    !Number.isInteger(request.endYear) ||
    request.startYear < 1800 ||
    request.endYear > 2200 ||
    request.endYear < request.startYear ||
    request.endYear - request.startYear > 200
  ) {
    throw new TypeError("year range is invalid");
  }
}

function invalidResponse(message: string, cause?: unknown): WorldBankConnectorError {
  return new WorldBankConnectorError(message, {
    ...(cause === undefined ? {} : { cause }),
    code: "WORLD_BANK_RESPONSE_INVALID",
  });
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidResponse(`World Bank ${name} is invalid`);
  }
  return value as Record<string, unknown>;
}

function integerField(value: unknown, name: string, minimum: number, maximum: number): number {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) {
    throw invalidResponse(`World Bank ${name} is invalid`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw invalidResponse(`World Bank ${name} is invalid`);
  }
  return parsed;
}

function quoteJsonNumbers(input: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index] ?? "";
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }
    if (character === "-" || /\d/.test(character)) {
      const token = input.slice(index).match(JSON_NUMBER_PREFIX)?.[0];
      if (token) {
        output += `"${token}"`;
        index += token.length - 1;
        continue;
      }
    }
    output += character;
  }
  return output;
}

function canonicalDecimal(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > MAX_DECIMAL_CHARACTERS ||
    !JSON_NUMBER.test(value)
  ) {
    throw invalidResponse("World Bank observation value is invalid");
  }
  const match =
    /^(?<sign>-?)(?<integer>0|[1-9]\d*)(?:\.(?<fraction>\d+))?(?:[eE](?<exponent>[+-]?\d+))?$/.exec(
      value,
    );
  if (!match?.groups) throw invalidResponse("World Bank observation value is invalid");

  const integer = match.groups.integer ?? "";
  const fraction = match.groups.fraction ?? "";
  const exponent = Number(match.groups.exponent ?? "0");
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > MAX_DECIMAL_CHARACTERS) {
    throw invalidResponse("World Bank observation value is invalid");
  }

  const digits = `${integer}${fraction}`;
  const decimalIndex = integer.length + exponent;
  let canonical: string;
  if (decimalIndex <= 0) canonical = `0.${"0".repeat(-decimalIndex)}${digits}`;
  else if (decimalIndex >= digits.length) {
    canonical = `${digits}${"0".repeat(decimalIndex - digits.length)}`;
  } else canonical = `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;

  canonical = canonical.replace(/^0+(?=\d)/, "");
  if (canonical.length > MAX_DECIMAL_CHARACTERS) {
    throw invalidResponse("World Bank observation value is invalid");
  }
  const sign = match.groups.sign === "-" && !/^0(?:\.0+)?$/.test(canonical) ? "-" : "";
  return `${sign}${canonical}`;
}

function parseDocument(bytes: Uint8Array): unknown {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw invalidResponse("World Bank response is not valid UTF-8", error);
  }
  try {
    return JSON.parse(quoteJsonNumbers(text));
  } catch (error) {
    throw invalidResponse("World Bank response is not valid JSON", error);
  }
}

async function readBoundedBody(response: Response, maximumBytes: number): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^(?:0|[1-9]\d*)$/.test(contentLength)) {
      throw invalidResponse("World Bank content length is invalid");
    }
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maximumBytes) {
      throw new WorldBankConnectorError("World Bank response exceeds the size limit", {
        code: "WORLD_BANK_RESPONSE_TOO_LARGE",
      });
    }
  }
  if (!response.body) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let byteLength = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      byteLength += result.value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel("response size limit exceeded");
        throw new WorldBankConnectorError("World Bank response exceeds the size limit", {
          code: "WORLD_BANK_RESPONSE_TOO_LARGE",
        });
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && /^(?:0|[1-9]\d*)$/.test(retryAfter)) {
    return Math.min(Number(retryAfter) * 1_000, 5_000);
  }
  return attempt === 1 ? 100 : 250;
}

export class WorldBankConnector {
  readonly #fetch: Fetch;
  readonly #clock: () => Date;
  readonly #sleep: Sleep;

  constructor(
    fetchImplementation: Fetch = fetch,
    clock: () => Date = () => new Date(),
    sleep: Sleep = defaultSleep,
  ) {
    this.#fetch = fetchImplementation;
    this.#clock = clock;
    this.#sleep = sleep;
  }

  async #request(url: URL): Promise<Response> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await this.#fetch(url, {
          headers: { accept: "application/json", "user-agent": "EconomyOS/0.1" },
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        if (attempt === MAX_ATTEMPTS) {
          throw new WorldBankConnectorError("World Bank request failed", {
            cause: error,
            code: "WORLD_BANK_TRANSPORT",
            retryable: true,
          });
        }
        await this.#sleep(attempt === 1 ? 100 : 250);
        continue;
      }
      if (response.ok) return response;

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < MAX_ATTEMPTS) {
        await response.body?.cancel().catch(() => undefined);
        await this.#sleep(retryDelay(response, attempt));
        continue;
      }
      throw new WorldBankConnectorError(`World Bank returned HTTP ${response.status}`, {
        code: "WORLD_BANK_HTTP",
        retryable,
        status: response.status,
      });
    }
    throw new WorldBankConnectorError("World Bank request failed", {
      code: "WORLD_BANK_TRANSPORT",
      retryable: true,
    });
  }

  async fetch(request: WorldBankRequest): Promise<WorldBankFetchResult> {
    assertRequest(request);
    const payloads: RawPayload[] = [];
    const rows: WorldBankRow[] = [];
    const seenYears = new Set<number>();
    const maximumRows = request.endYear - request.startYear + 1;
    let expectedPages = 1;
    let expectedTotal: number | undefined;
    let totalBytes = 0;

    for (let page = 1; page <= expectedPages; page += 1) {
      const url = new URL(
        `https://api.worldbank.org/v2/country/${request.countryCode}/indicator/${request.indicatorCode}`,
      );
      url.searchParams.set("date", `${request.startYear}:${request.endYear}`);
      url.searchParams.set("format", "json");
      url.searchParams.set("page", String(page));
      url.searchParams.set("per_page", "1000");
      url.searchParams.set("source", WORLD_DEVELOPMENT_INDICATORS_SOURCE_ID);

      const response = await this.#request(url);
      const contentType = response.headers.get("content-type");
      if (contentType && !/^application\/json(?:\s*;|$)/i.test(contentType)) {
        throw invalidResponse("World Bank response media type is invalid");
      }
      const remainingBytes = MAX_TOTAL_BYTES - totalBytes;
      const bytes = await readBoundedBody(response, Math.min(MAX_PAGE_BYTES, remainingBytes));
      totalBytes += bytes.byteLength;
      const fetchedAt = this.#clock().toISOString();
      payloads.push({
        source: "world-bank-v2",
        dataset: "world-development-indicators",
        requestUrl: url.href,
        fetchedAt,
        checksumSha256: createHash("sha256").update(bytes).digest("hex"),
        byteLength: bytes.byteLength,
        mediaType: "application/json",
        body: bytes,
      });

      const document = parseDocument(bytes);
      if (!Array.isArray(document) || document.length !== 2) {
        throw invalidResponse("World Bank response shape is invalid");
      }
      const metadata = object(document[0], "metadata");
      const responsePage = integerField(metadata.page, "page", 1, MAX_PAGES);
      const responsePages = integerField(metadata.pages, "page count", 1, MAX_PAGES);
      const perPage = integerField(metadata.per_page, "page size", 1, 1_000);
      const total = integerField(metadata.total, "row count", 0, maximumRows);
      if (metadata.sourceid !== WORLD_DEVELOPMENT_INDICATORS_SOURCE_ID) {
        throw invalidResponse("World Bank response is not from the admitted WDI source");
      }
      if (
        responsePage !== page ||
        responsePages !== Math.max(1, Math.ceil(total / perPage)) ||
        (expectedTotal !== undefined &&
          (responsePages !== expectedPages || total !== expectedTotal))
      ) {
        throw new WorldBankConnectorError("World Bank pagination metadata is inconsistent", {
          code: "WORLD_BANK_PAGINATION",
        });
      }
      if (expectedTotal === undefined) {
        expectedPages = responsePages;
        expectedTotal = total;
      }

      const candidates = document[1] === null ? [] : document[1];
      if (!Array.isArray(candidates) || candidates.length > perPage) {
        throw invalidResponse("World Bank response shape is invalid");
      }
      for (const candidate of candidates) {
        const row = object(candidate, "row");
        const country = typeof row.countryiso3code === "string" ? row.countryiso3code : "";
        const indicator = object(row.indicator, "indicator");
        const indicatorCode = typeof indicator.id === "string" ? indicator.id : "";
        const year = integerField(row.date, "row year", request.startYear, request.endYear);
        if (country !== request.countryCode || indicatorCode !== request.indicatorCode) {
          throw invalidResponse("World Bank row identity is inconsistent with the request");
        }
        if (seenYears.has(year)) {
          throw invalidResponse("World Bank response contains a duplicate row");
        }
        seenYears.add(year);
        const value = row.value === null ? null : canonicalDecimal(row.value);
        rows.push({
          countryCode: country,
          indicatorCode,
          periodStart: `${year}-01-01T00:00:00Z`,
          periodEnd: `${year + 1}-01-01T00:00:00Z`,
          value,
          missingReason: value === null ? "source_missing" : null,
          releaseTime: null,
          availabilityTime: null,
          retrievedAt: fetchedAt,
          pitQuality: "latest_revised_only",
        });
      }
    }

    if (expectedTotal === undefined || rows.length !== expectedTotal) {
      throw new WorldBankConnectorError("World Bank response row count is inconsistent", {
        code: "WORLD_BANK_PAGINATION",
      });
    }
    return { payloads: Object.freeze(payloads), rows: Object.freeze(rows) };
  }
}
