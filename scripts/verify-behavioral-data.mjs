import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { parseEcbCes } from "../packages/canonical-data/dist/ecb-ces.js";
import { assertSourceUse } from "../packages/contracts/dist/index.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root));
const json = async (path) => JSON.parse(await read(path));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifest = await json("apps/web/public/behavioral/manifest.json");
const profile = await json("data/intelligence/ecb-ces-source.json");
assert.deepEqual(manifest.source, profile.source);
assert.deepEqual(manifest.metrics, profile.metrics);
assertSourceUse(profile.source, new Date().toISOString(), "redistribution");
assert.deepEqual(Object.keys(manifest.countries).sort(), [...profile.source.country_codes].sort());
let count = 0;
for (const [country, metadata] of Object.entries(manifest.countries)) {
  const bytes = await read(`apps/web/public/behavioral/${country}.json`);
  assert.equal(sha(bytes), metadata.sha256);
  assert.equal(bytes.length, metadata.bytes);
  const document = JSON.parse(bytes);
  const raw = gunzipSync(await read(metadata.raw.path));
  assert.equal(sha(raw), metadata.raw.sha256);
  assert.equal(raw.length, metadata.raw.bytes);
  const records = parseEcbCes({
    bytes: raw,
    source: profile.source,
    country,
    retrievedAt: metadata.retrievedAt,
    requestUrl: metadata.raw.url,
    metrics: profile.metrics,
  });
  assert.deepEqual(document.records, records);
  assert.equal(document.country, country);
  assert.equal(
    records.filter((record) => record.observation.value !== null).length,
    metadata.observations,
  );
  count += metadata.observations;
}
console.log(`Verified ${count} CES survey observations against immutable official CSV responses.`);
