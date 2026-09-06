import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { parseEcbCes } from "../packages/canonical-data/dist/ecb-ces.js";
import { assertSourceUse } from "../packages/contracts/dist/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const profile = JSON.parse(await readFile(`${root}data/intelligence/ecb-ces-source.json`, "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rawDirectory = `${root}data/intelligence/raw`;
const outputDirectory = `${root}apps/web/public/behavioral`;
const cacheDirectory = `${root}.cache/behavioral`;
await mkdir(rawDirectory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });
await mkdir(cacheDirectory, { recursive: true });
async function atomic(path, content) {
  await writeFile(`${path}.tmp`, content);
  await rename(`${path}.tmp`, path);
}
async function request(url) {
  assertSourceUse(profile.source, new Date().toISOString(), "acquisition");
  const cachePath = `${cacheDirectory}/${sha(url)}.json`;
  if (process.argv.includes("--reuse-cache")) {
    try {
      const item = JSON.parse(await readFile(cachePath, "utf8"));
      if (item.url !== url || !/^[a-f0-9]{64}$/.test(item.sha256))
        throw new Error("Invalid cached CES identity");
      const bytes = gunzipSync(await readFile(`${rawDirectory}/${item.sha256}.csv.gz`));
      if (sha(bytes) !== item.sha256) throw new Error("CES raw checksum mismatch");
      return { ...item, bytes };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  let failure;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { accept: "text/csv", "user-agent": "EconomyOS/0.1" },
        signal: AbortSignal.timeout(35_000),
      });
      if (!response.ok) throw new Error(`ECB returned ${response.status}`);
      const chunks = [];
      let length = 0;
      for await (const chunk of response.body) {
        length += chunk.byteLength;
        if (length > 12_000_000) throw new Error("CES response exceeds 12 MB");
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      const item = {
        url,
        sha256: sha(bytes),
        retrievedAt: new Date().toISOString(),
        size: bytes.length,
      };
      await atomic(`${rawDirectory}/${item.sha256}.csv.gz`, gzipSync(bytes));
      await atomic(cachePath, JSON.stringify(item));
      return { ...item, bytes };
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

const countries = {};
const pending = [];
const variables = [...new Set(profile.metrics.map((metric) => metric.variable))].join("+");
for (const country of profile.source.country_codes) {
  const url = `https://data-api.ecb.europa.eu/service/data/CES/M.${country}.ALL.T.${variables}.NUM_VAR.WM+WA+WP25+WP75?format=csvdata`;
  const payload = await request(url);
  const records = parseEcbCes({
    bytes: payload.bytes,
    source: profile.source,
    country,
    retrievedAt: payload.retrievedAt,
    requestUrl: url,
    metrics: profile.metrics,
  });
  const document = {
    schemaVersion: 2,
    country,
    datasetId: profile.source.id,
    retrievedAt: payload.retrievedAt,
    rawSha256: payload.sha256,
    records,
  };
  const bytes = `${JSON.stringify(document)}\n`;
  const dates = records.map((record) => record.observation.observation_date).sort();
  countries[country] = {
    sha256: sha(bytes),
    bytes: Buffer.byteLength(bytes),
    observations: records.filter((record) => record.observation.value !== null).length,
    start: dates[0],
    end: dates.at(-1),
    retrievedAt: payload.retrievedAt,
    raw: {
      path: `data/intelligence/raw/${payload.sha256}.csv.gz`,
      sha256: payload.sha256,
      url,
      bytes: payload.size,
    },
    metrics: Object.fromEntries(
      profile.metrics.map((metric) => [
        metric.id,
        records.filter(
          (record) =>
            record.observation.instrument_or_item === metric.id &&
            record.observation.value !== null,
        ).length,
      ]),
    ),
  };
  pending.push({ country, bytes });
  console.log(
    `${country}: ${countries[country].observations} actual published survey observations`,
  );
}
assertSourceUse(profile.source, new Date().toISOString(), "commercial_display");
assertSourceUse(profile.source, new Date().toISOString(), "redistribution");
for (const item of pending) await atomic(`${outputDirectory}/${item.country}.json`, item.bytes);
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: profile.source,
  conditions: profile.conditions,
  metrics: profile.metrics,
  countries,
  population: "ECB CES covered consumer populations; weighted source aggregates; not all countries",
  evidenceType: "descriptive_statistic",
  vintage: "latest_revised_only",
  publicationStatus: "published",
  modelPublication: "none",
};
await atomic(`${outputDirectory}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Published ${Object.values(countries).reduce((sum, country) => sum + country.observations, 0)} survey measurements. No microdata collected.`,
);
