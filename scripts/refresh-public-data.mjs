import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { parseWorldBankDocument } from "../packages/canonical-data/dist/world-bank.js";
import {
  annualReferenceObservation,
  wdiObservationMetadata,
} from "../packages/contracts/dist/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(`${root}data/public-economy/indicators.json`, "utf8"));
const startYear = 2000;
const endYear = new Date().getUTCFullYear() - 1;
const retrievedAt = new Date().toISOString();
const rawDirectory = `${root}data/public-economy/raw`;
const outputDirectory = `${root}apps/web/public/economy`;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const raw = [];
const cached = new Map();
const reuseCache = process.argv.includes("--reuse-cache");
const stagingDirectory = `${root}.cache/public-economy`;
await mkdir(stagingDirectory, { recursive: true });
if (reuseCache) {
  const previous = JSON.parse(await readFile(`${rawDirectory}/manifest.json`, "utf8"));
  for (const item of previous.payloads) {
    const bytes = gunzipSync(await readFile(`${root}${item.path}`));
    if (hash(bytes) !== item.sha256)
      throw new Error(`Corrupted retained raw payload: ${item.path}`);
    cached.set(item.url, { ...item, bytes, document: parseWorldBankDocument(bytes) });
  }
}

async function request(url) {
  // A retained payload keeps its original retrieval instant. Reuse is explicit,
  // and never represented as a new provider release or a historical vintage.
  if (cached.has(url)) return cached.get(url);
  const stagedPath = `${stagingDirectory}/${hash(url)}.json`;
  if (reuseCache) {
    try {
      const item = JSON.parse(await readFile(stagedPath, "utf8"));
      const bytes = Buffer.from(item.body, "base64");
      if (item.url !== url || hash(bytes) !== item.sha256)
        throw new Error("Staged raw response failed integrity validation");
      return { ...item, bytes, document: parseWorldBankDocument(bytes) };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "EconomyOS-public-reference/1.0" },
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`World Bank returned HTTP ${response.status}`);
      const parts = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > 12_000_000) throw new Error("World Bank response exceeded the 12 MB limit");
        parts.push(chunk);
      }
      const bytes = Buffer.concat(parts);
      const document = parseWorldBankDocument(bytes);
      if (!Array.isArray(document) || document.length !== 2 || !Array.isArray(document[1])) {
        throw new Error(`Invalid World Bank response for ${url}`);
      }
      if (Number(document[0].pages) !== 1 || Number(document[0].total) !== document[1].length) {
        throw new Error(`Incomplete World Bank pagination for ${url}`);
      }
      const result = {
        bytes,
        document,
        url,
        sha256: hash(bytes),
        retrievedAt: new Date().toISOString(),
      };
      if (reuseCache)
        await atomicFile(
          stagedPath,
          JSON.stringify({
            url,
            sha256: result.sha256,
            retrievedAt: result.retrievedAt,
            body: bytes.toString("base64"),
          }),
        );
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function atomicFile(path, bytes) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

const countryPayload = await request(
  "https://api.worldbank.org/v2/country?format=json&per_page=500",
);
raw.push({ id: "countries", payload: countryPayload });
const countries = countryPayload.document[1]
  .filter((country) => country.region?.id !== "NA" && /^[A-Z]{2}$/.test(country.iso2Code))
  .map((country) => ({
    code: country.iso2Code,
    iso3: country.id,
    name: country.name,
    region: country.region.value,
    income: country.incomeLevel.value,
    capital: country.capitalCity,
  }))
  .sort((left, right) => left.code.localeCompare(right.code));
if (
  countries.length < 190 ||
  new Set(countries.map((country) => country.code)).size !== countries.length
) {
  throw new Error("World Bank country directory is incomplete or contains duplicate identities");
}
const byIso3 = new Map(countries.map((country) => [country.iso3, country.code]));
byIso3.set("WLD", "WLD");
const snapshots = new Map(
  [...byIso3].map(([iso3, code]) => [
    code,
    {
      schemaVersion: 1,
      countryCode: code,
      iso3,
      retrievedAt,
      series: {},
    },
  ]),
);
const sources = {};
let completed = 0;
let cursor = 0;
async function worker() {
  while (cursor < catalog.length) {
    const indicator = catalog[cursor++];
    const url = `https://api.worldbank.org/v2/country/all/indicator/${indicator.code}?format=json&source=2&date=${startYear}:${endYear}&per_page=20000`;
    const [payload, metadata] = await Promise.all([
      request(url),
      request(
        `https://api.worldbank.org/v2/indicator/${indicator.code}?format=json&source=2&per_page=100`,
      ),
    ]);
    if (payload.document[0].sourceid !== "2") throw new Error("Unexpected World Bank dataset");
    const definition = metadata.document[1].find((row) => row.id === indicator.code);
    if (definition?.source?.id !== "2") throw new Error(`Missing metadata for ${indicator.code}`);
    const seen = new Set();
    const units = new Set(payload.document[1].map((row) => row.unit));
    const statuses = new Set(payload.document[1].map((row) => row.obs_status));
    if (units.size !== 1 || statuses.size !== 1)
      throw new Error(
        `Mixed source units/statuses require per-observation metadata: ${indicator.code}`,
      );
    const observationMetadata = wdiObservationMetadata([...units][0], [...statuses][0]);
    let reported = 0;
    for (const row of payload.document[1]) {
      const year = Number(row.date);
      if (
        row.indicator?.id !== indicator.code ||
        !Number.isInteger(year) ||
        year < startYear ||
        year > endYear
      ) {
        throw new Error(`Wrong observation identity for ${indicator.code}`);
      }
      if (
        row.value !== null &&
        (typeof row.value !== "string" || !Number.isFinite(Number(row.value)))
      ) {
        throw new Error(`Invalid observation value for ${indicator.code}`);
      }
      const code = byIso3.get(row.countryiso3code);
      if (!code) continue;
      const key = `${code}:${year}`;
      if (seen.has(key)) throw new Error(`Duplicate observation ${indicator.code}:${key}`);
      seen.add(key);
      const snapshot = snapshots.get(code);
      snapshot.series[indicator.id] ??= [];
      snapshot.series[indicator.id].push([year, row.value]);
      if (row.value !== null) reported += 1;
    }
    if (reported < 5)
      throw new Error(`Insufficient coverage for ${indicator.code}; refusing an empty replacement`);
    sources[indicator.id] = {
      code: indicator.code,
      name: definition.name,
      organization: definition.sourceOrganization,
      definition: definition.sourceNote,
      url,
      indicatorUrl: `https://data.worldbank.org/indicator/${indicator.code}`,
      retrievedAt: payload.retrievedAt,
      sourceUpdatedAt: payload.document[0].lastupdated,
      sha256: payload.sha256,
      reported,
      observationMetadata,
    };
    raw.push({ id: indicator.id, payload }, { id: `${indicator.id}-metadata`, payload: metadata });
    console.log(
      `${++completed}/${catalog.length}: ${indicator.en} — ${reported} non-missing annual values`,
    );
  }
}
await Promise.all(Array.from({ length: 3 }, worker));

// Validate full observations before publishing normalized tuples and shared metadata.
for (const [code, snapshot] of snapshots) {
  const country = { code, name: countries.find((item) => item.code === code)?.name ?? "World" };
  for (const indicator of catalog) {
    for (const point of snapshot.series[indicator.id] ?? [])
      annualReferenceObservation(indicator, sources[indicator.id], country, point);
  }
}

// No output is replaced until every requested series and metadata response has validated.
await mkdir(rawDirectory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });
const payloads = [];
for (const { id, payload } of raw.sort((left, right) => left.id.localeCompare(right.id))) {
  const path = `data/public-economy/raw/${id}.json.gz`;
  await atomicFile(`${root}${path}`, gzipSync(payload.bytes));
  payloads.push({
    path,
    url: payload.url,
    sha256: payload.sha256,
    retrievedAt: payload.retrievedAt,
    bytes: payload.bytes.length,
  });
}
const files = {};
let observations = 0;
for (const [code, snapshot] of snapshots) {
  for (const series of Object.values(snapshot.series)) {
    series.sort((left, right) => left[0] - right[0]);
    observations += series.filter((point) => point[1] !== null).length;
  }
  const content = `${JSON.stringify(snapshot)}\n`;
  files[code] = { sha256: hash(content), bytes: Buffer.byteLength(content) };
  await atomicFile(`${outputDirectory}/${code}.json`, content);
}
const manifest = {
  schemaVersion: 1,
  retrievedAt,
  startYear,
  endYear,
  dataset: "World Development Indicators",
  provider: "The World Bank and its data providers",
  license: "CC BY 4.0, subject to World Bank dataset terms and indicator metadata",
  licenseUrl: "https://data.worldbank.org/summary-terms-of-use",
  dataClass: "published_reference_series_including_source_estimates",
  vintage: "latest_revised_only",
  countries,
  countryNames: Object.fromEntries(
    countries.map((country) => [
      country.code,
      Object.fromEntries(
        ["en", "fa", "de", "fr", "zh-Hans", "ru", "es", "pt", "hi", "ar", "hy", "tr"].map(
          (locale) => [
            locale,
            new Intl.DisplayNames([locale], { type: "region", fallback: "none" }).of(
              country.code,
            ) ?? country.name,
          ],
        ),
      ),
    ]),
  ),
  countryOrder: Object.fromEntries(
    ["en", "fa", "de", "fr", "zh-Hans", "ru", "es", "pt", "hi", "ar", "hy", "tr"].map((locale) => {
      const display = new Intl.DisplayNames([locale], { type: "region", fallback: "none" });
      return [
        locale,
        [...countries]
          .sort((a, b) =>
            (display.of(a.code) ?? a.name).localeCompare(display.of(b.code) ?? b.name, locale),
          )
          .map(({ code }) => code),
      ];
    }),
  ),
  referenceYear: endYear - 1,
  referenceHighlights: Object.fromEntries(
    countries.map(({ code }) => [
      code,
      Object.fromEntries(
        ["gdp", "population"].map((id) => [
          id,
          snapshots
            .get(code)
            .series[id].find(([year, value]) => year === endYear - 1 && value !== null) ?? null,
        ]),
      ),
    ]),
  ),
  highlights: Object.fromEntries(
    countries.map(({ code }) => [
      code,
      Object.fromEntries(
        ["growth", "inflation", "gdp", "population"].map((id) => [
          id,
          snapshots
            .get(code)
            .series[id].filter((point) => point[1] !== null)
            .at(-1) ?? null,
        ]),
      ),
    ]),
  ),
  indicators: Object.fromEntries(catalog.map((indicator) => [indicator.id, sources[indicator.id]])),
  observations,
  files,
};
await atomicFile(
  `${rawDirectory}/manifest.json`,
  `${JSON.stringify({ retrievedAt, payloads }, null, 2)}\n`,
);
await atomicFile(`${outputDirectory}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Saved ${observations} published values for ${countries.length} economies plus the world aggregate. Retrieval: ${retrievedAt}.`,
);
