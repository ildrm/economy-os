import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WorldBankConnector, WorldBankConnectorError } from "./world-bank.js";

const request = {
  countryCode: "DEU",
  indicatorCode: "NY.GDP.MKTP.CD",
  startYear: 2023,
  endYear: 2024,
} as const;

const fixture = JSON.stringify([
  { page: 1, pages: 1, per_page: 1000, total: 2, sourceid: "2" },
  [
    {
      indicator: { id: "NY.GDP.MKTP.CD", value: "GDP (current US$)" },
      countryiso3code: "DEU",
      date: "2024",
      value: 4_659_928_258_801.42,
    },
    {
      indicator: { id: "NY.GDP.MKTP.CD", value: "GDP (current US$)" },
      countryiso3code: "DEU",
      date: "2023",
      value: null,
    },
  ],
]);

function jsonResponse(
  body: BodyInit | null,
  status = 200,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function pageFixture(
  page: number,
  pages: number,
  total: number,
  year: number,
  perPage = 1,
): string {
  return JSON.stringify([
    { page, pages, per_page: perPage, total, sourceid: "2" },
    [
      {
        indicator: { id: request.indicatorCode },
        countryiso3code: request.countryCode,
        date: String(year),
        value: year,
      },
    ],
  ]);
}

describe("World Bank connector", () => {
  it("retains exact raw bytes and honestly marks WDI as latest-revised only", async () => {
    let requestedUrl: URL | undefined;
    const connector = new WorldBankConnector(
      async (input) => {
        requestedUrl = new URL(String(input));
        return jsonResponse(fixture);
      },
      () => new Date("2026-01-01T00:00:00Z"),
    );
    const result = await connector.fetch(request);
    const payload = result.payloads[0];
    expect(payload).toBeDefined();
    expect(new TextDecoder().decode(payload?.body)).toBe(fixture);
    expect(payload).toMatchObject({
      source: "world-bank-v2",
      dataset: "world-development-indicators",
      byteLength: new TextEncoder().encode(fixture).byteLength,
    });
    expect(payload?.checksumSha256).toBe(
      createHash("sha256").update(new TextEncoder().encode(fixture)).digest("hex"),
    );
    expect(result.rows[0]).toMatchObject({
      countryCode: "DEU",
      releaseTime: null,
      availabilityTime: null,
      retrievedAt: "2026-01-01T00:00:00.000Z",
      pitQuality: "latest_revised_only",
    });
    expect(result.rows[1]).toMatchObject({ value: null, missingReason: "source_missing" });
    expect(requestedUrl?.searchParams.get("source")).toBe("2");
  });

  it("hashes BOM and multibyte source bytes without normalizing them", async () => {
    const text = fixture.replace("GDP (current US$)", "تولید ناخالص داخلی");
    const encoded = new TextEncoder().encode(text);
    const bytes = new Uint8Array(encoded.byteLength + 3);
    bytes.set([0xef, 0xbb, 0xbf]);
    bytes.set(encoded, 3);
    const result = await new WorldBankConnector(async () => jsonResponse(bytes)).fetch(request);
    expect(result.payloads[0]?.body).toEqual(bytes);
    expect(result.payloads[0]?.checksumSha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
  });

  it("preserves arbitrary-precision JSON decimals without binary conversion", async () => {
    const precise = fixture.replace("4659928258801.42", "12345678901234567890.1234567890123456789");
    const result = await new WorldBankConnector(async () => jsonResponse(precise)).fetch(request);
    expect(result.rows[0]?.value).toBe("12345678901234567890.1234567890123456789");

    const exponent = precise.replace("12345678901234567890.1234567890123456789", "1.2345e-3");
    const exponentResult = await new WorldBankConnector(async () => jsonResponse(exponent)).fetch(
      request,
    );
    expect(exponentResult.rows[0]?.value).toBe("0.0012345");
  });

  it("rejects unbounded or malformed source requests", async () => {
    const connector = new WorldBankConnector(async () => jsonResponse(fixture));
    await expect(
      connector.fetch({
        countryCode: "de",
        indicatorCode: "x/../y",
        startYear: 1700,
        endYear: 2024,
      }),
    ).rejects.toThrow("countryCode");
  });

  it("rejects inconsistent response identities and years outside the requested range", async () => {
    const altered = fixture.replaceAll("DEU", "FRA");
    await expect(
      new WorldBankConnector(async () => jsonResponse(altered)).fetch(request),
    ).rejects.toThrow("identity");

    const outOfRange = fixture.replace('"2023"', '"2022"');
    await expect(
      new WorldBankConnector(async () => jsonResponse(outOfRange)).fetch(request),
    ).rejects.toThrow("row year");
  });

  it("rejects a response outside the specifically admitted WDI source", async () => {
    const wrongSource = fixture.replace('"sourceid":"2"', '"sourceid":"11"');
    await expect(
      new WorldBankConnector(async () => jsonResponse(wrongSource)).fetch(request),
    ).rejects.toThrow("admitted WDI source");
  });

  it("validates stable pagination and rejects duplicate rows", async () => {
    const connector = new WorldBankConnector(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("page"));
      return jsonResponse(pageFixture(page, 2, 2, page === 1 ? 2024 : 2023));
    });
    const result = await connector.fetch(request);
    expect(result.payloads).toHaveLength(2);
    expect(result.rows.map((row) => row.periodStart)).toEqual([
      "2024-01-01T00:00:00Z",
      "2023-01-01T00:00:00Z",
    ]);

    const duplicate = new WorldBankConnector(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("page"));
      return jsonResponse(pageFixture(page, 2, 2, 2024));
    });
    await expect(duplicate.fetch(request)).rejects.toThrow("duplicate");
  });

  it("rejects pagination drift, incomplete totals, and invalid page identity", async () => {
    const drift = new WorldBankConnector(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("page"));
      return jsonResponse(page === 1 ? pageFixture(1, 2, 2, 2024) : pageFixture(2, 1, 1, 2023));
    });
    await expect(drift.fetch(request)).rejects.toThrow("pagination");

    const incomplete = JSON.stringify([
      { page: 1, pages: 1, per_page: 1000, total: 2, sourceid: "2" },
      [
        {
          indicator: { id: request.indicatorCode },
          countryiso3code: request.countryCode,
          date: "2024",
          value: 1,
        },
      ],
    ]);
    await expect(
      new WorldBankConnector(async () => jsonResponse(incomplete)).fetch(request),
    ).rejects.toThrow("row count");

    const wrongPage = pageFixture(2, 1, 1, 2024, 1000);
    await expect(
      new WorldBankConnector(async () => jsonResponse(wrongPage)).fetch(request),
    ).rejects.toThrow("pagination");
  });

  it("retries classified transient failures with injected bounded backoff", async () => {
    const delays: number[] = [];
    let calls = 0;
    const connector = new WorldBankConnector(
      async () => {
        calls += 1;
        if (calls < 3) return jsonResponse("", 429, { "retry-after": "0" });
        return jsonResponse(fixture);
      },
      () => new Date("2026-01-01T00:00:00Z"),
      async (milliseconds) => {
        delays.push(milliseconds);
      },
    );
    await expect(connector.fetch(request)).resolves.toMatchObject({ rows: expect.any(Array) });
    expect(calls).toBe(3);
    expect(delays).toEqual([0, 0]);
  });

  it("classifies exhausted transport and HTTP failures", async () => {
    let transportCalls = 0;
    const transport = new WorldBankConnector(
      async () => {
        transportCalls += 1;
        throw new Error("network detail");
      },
      undefined,
      async () => undefined,
    );
    await expect(transport.fetch(request)).rejects.toMatchObject({
      code: "WORLD_BANK_TRANSPORT",
      retryable: true,
    });
    expect(transportCalls).toBe(3);

    const missing = new WorldBankConnector(async () => jsonResponse("", 404));
    await expect(missing.fetch(request)).rejects.toMatchObject({
      code: "WORLD_BANK_HTTP",
      retryable: false,
      status: 404,
    });
  });

  it("rejects corrupt shapes, values, media types, and declared oversized bodies", async () => {
    await expect(
      new WorldBankConnector(async () => jsonResponse("{")).fetch(request),
    ).rejects.toThrow("valid JSON");
    await expect(
      new WorldBankConnector(async () => jsonResponse("{}")).fetch(request),
    ).rejects.toThrow("shape");
    await expect(
      new WorldBankConnector(async () =>
        jsonResponse(JSON.stringify([{ page: 1, pages: 11, per_page: 1, total: 2 }, []])),
      ).fetch(request),
    ).rejects.toThrow("page count");

    const invalidValue = JSON.stringify([
      { page: 1, pages: 1, per_page: 1000, total: 1, sourceid: "2" },
      [
        {
          indicator: { id: request.indicatorCode },
          countryiso3code: request.countryCode,
          date: "2024",
          value: "not-a-number",
        },
      ],
    ]);
    await expect(
      new WorldBankConnector(async () => jsonResponse(invalidValue)).fetch(request),
    ).rejects.toThrow("value");
    await expect(
      new WorldBankConnector(
        async () => new Response(fixture, { headers: { "content-type": "text/html" } }),
      ).fetch(request),
    ).rejects.toThrow("media type");
    await expect(
      new WorldBankConnector(async () =>
        jsonResponse(fixture, 200, { "content-length": "20000001" }),
      ).fetch(request),
    ).rejects.toBeInstanceOf(WorldBankConnectorError);
  });
});
