import { createHash } from "node:crypto";
import {
  assertObservationRecord,
  assertSourceUse,
  type ObservationRecord,
  type SourceProfile,
} from "@economyos/contracts";

export interface CesMetric {
  readonly id: string;
  readonly variable: string;
  readonly denominator: "WM" | "WA" | "WP25" | "WP75";
  readonly titlePrefix: string;
  readonly unit: "percent" | "percentage-points";
  readonly horizonMonths: number | null;
}

/** RFC 4180 fields, including embedded quotes/newlines. Decimal fields remain strings. */
export function parseCsv(text: string): Record<string, string>[] {
  if (text.length > 12_000_000) throw new TypeError("CSV exceeds the size limit");
  const records: string[][] = [];
  let record: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += character;
    } else if (character === '"' && field === "" && !closed) quoted = true;
    else if (character === ",") {
      record.push(field);
      field = "";
      closed = false;
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      closed = false;
    } else {
      if (closed || character === '"') throw new TypeError("Malformed CSV quoting");
      field += character;
    }
  }
  if (quoted) throw new TypeError("Unterminated CSV field");
  if (field !== "" || record.length || closed) {
    record.push(field);
    records.push(record);
  }
  const headers = records.shift();
  if (!headers?.length || headers.some((x) => !x) || new Set(headers).size !== headers.length)
    throw new TypeError("Invalid CSV headers");
  return records
    .filter((row) => row.some((value) => value !== ""))
    .map((row) => {
      if (row.length !== headers.length) throw new TypeError("Inconsistent CSV columns");
      return Object.fromEntries(headers.map((name, index) => [name, row[index] ?? ""]));
    });
}

export function parseEcbCes(input: {
  readonly bytes: Uint8Array;
  readonly source: SourceProfile;
  readonly country: string;
  readonly retrievedAt: string;
  readonly requestUrl: string;
  readonly metrics: readonly CesMetric[];
}): ObservationRecord[] {
  assertSourceUse(input.source, input.retrievedAt, "acquisition");
  assertSourceUse(input.source, input.retrievedAt, "redistribution");
  if (input.source.id !== "ecb-ces" || !input.source.country_codes.includes(input.country))
    throw new TypeError("CES source/country identity mismatch");
  const url = new URL(input.requestUrl);
  if (
    url.origin !== "https://data-api.ecb.europa.eu" ||
    url.username ||
    url.password ||
    !url.pathname.startsWith("/service/data/CES/")
  )
    throw new TypeError("Unapproved CES endpoint");
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const rows = parseCsv(new TextDecoder("utf-8", { fatal: true }).decode(input.bytes));
  const records: ObservationRecord[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const metric = input.metrics.find(
      (item) => item.variable === row.CES_VARIABLE && item.denominator === row.CES_DENOM,
    );
    if (!metric) continue;
    if (
      row.FREQ !== "M" ||
      row.REF_AREA !== input.country ||
      row.CES_BREAKDOWN !== "ALL" ||
      row.CES_CUSTOM !== "T" ||
      row.CES_ANSWER !== "NUM_VAR"
    )
      continue;
    const expectedKey = `CES.M.${input.country}.ALL.T.${metric.variable}.NUM_VAR.${metric.denominator}`;
    if (
      row.KEY !== expectedKey ||
      row.UNIT !== "PN" ||
      row.UNIT_MULT !== "0" ||
      row.CONF_STATUS !== "F" ||
      !row.TITLE?.startsWith(metric.titlePrefix) ||
      !/^\d{4}-\d{2}$/.test(row.TIME_PERIOD ?? "")
    )
      throw new TypeError("CES semantics changed; review before publication");
    const status = row.OBS_STATUS;
    if (!["A", "P", "E", "M"].includes(status ?? ""))
      throw new TypeError(`Unreviewed CES observation status: ${status}`);
    const value = row.OBS_VALUE === "" ? null : row.OBS_VALUE;
    if (value === undefined || (status === "M" && value !== null))
      throw new TypeError("Invalid CES missing value");
    const key = `${expectedKey}:${row.TIME_PERIOD}`;
    if (seen.has(key)) throw new TypeError("Duplicate CES observation");
    seen.add(key);
    const id = createHash("sha256").update(`${sha256}:${key}`).digest("hex");
    const record: ObservationRecord = {
      schemaVersion: 2,
      id,
      datasetId: "ecb-ces",
      semanticsVersion: "1.0.0",
      raw: { sha256, locator: key, value, unit: row.UNIT, status: status ?? null },
      population: `ECB CES consumers in ${input.country}; published weighted ${metric.denominator}; no demographic breakdown`,
      seasonalAdjustment: "unknown",
      methodologicalBreak: row.BREAKS || row.COMMENT_OBS || null,
      knownAt: null,
      vintage: "latest_revised_only",
      observation: {
        country_code: input.country,
        category: "consumer_expectations",
        source_name: input.source.name,
        source_grade: input.source.grade,
        source_type: input.source.type,
        instrument_or_item: metric.id,
        value,
        value_type: "rate",
        price_type: null,
        currency: null,
        unit: metric.unit,
        geography: input.country,
        observation_date: row.TIME_PERIOD ?? "",
        retrieval_timestamp: input.retrievedAt,
        frequency: "monthly",
        is_official: true,
        is_preliminary: status === "P" ? true : null,
        revision_status: status === "P" ? "preliminary" : "unknown",
        source_id: input.source.id,
        source_url: `https://data.ecb.europa.eu/data/datasets/CES/${expectedKey}`,
        original_value: value,
        original_unit: row.UNIT,
        original_currency: null,
        missing_reason: value === null ? "source_missing" : null,
        observation_time: null,
        retrieval_time: input.retrievedAt,
        delay_minutes: null,
        timeliness: "historical",
        exchange_name: null,
        index_base: null,
        aggregation: "aggregate",
      },
    };
    records.push(assertObservationRecord(record));
  }
  if (records.length === 0) throw new TypeError("CES response contains no admitted observations");
  for (const lower of records.filter(
    (record) => record.observation.instrument_or_item === "inflation-q25",
  )) {
    const upper = records.find(
      (record) =>
        record.observation.instrument_or_item === "inflation-q75" &&
        record.observation.observation_date === lower.observation.observation_date,
    );
    if (
      upper?.observation.value !== null &&
      upper?.observation.value !== undefined &&
      lower.observation.value !== null &&
      Number(upper.observation.value) < Number(lower.observation.value)
    )
      throw new TypeError("CES percentile order is invalid; quarantine before publication");
  }
  return records.sort((a, b) => a.raw.locator.localeCompare(b.raw.locator));
}
