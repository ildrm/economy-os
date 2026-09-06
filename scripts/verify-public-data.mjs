import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { parseWorldBankDocument } from "../packages/canonical-data/dist/world-bank.js";
import {
  annualReferenceObservation,
  wdiObservationMetadata,
} from "../packages/contracts/dist/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(`${root}${path}`);
const json = async (path) => JSON.parse(await read(path));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const catalog = await json("data/public-economy/indicators.json");
const manifest = await json("apps/web/public/economy/manifest.json");
const provenance = await json("data/public-economy/raw/manifest.json");
const studies = await json("data/public-economy/studies.json");
const bibliography = await json("data/public-economy/bibliography.json");
const sourceCatalog = await json("data/source-policy/catalog.json");
assert.equal(sourceCatalog.schema_version, 1);
assert.equal(
  new Set(sourceCatalog.entries.map((entry) => entry.id)).size,
  sourceCatalog.entries.length,
);
const suppliedRows = (await read("data/source-policy/supplied-catalog.txt"))
  .toString()
  .split("\n")
  .filter((line) => /^\|.*\|\s*`[a-z]+`\s*\|/.test(line));
assert.equal(sourceCatalog.entries.length, suppliedRows.length);
for (const entry of sourceCatalog.entries) {
  assert.equal(entry.connection_status, "not_connected");
  assert.equal(entry.grade_review_status, "pending");
  assert.equal(entry.access_review_status, "not_reviewed");
  assert.ok(entry.source_name && entry.declared_grade && entry.country_code);
}
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.retrievedAt, provenance.retrievedAt);
assert.ok(manifest.countries.length >= 190);
assert.ok(catalog.length >= 80, "The documented core must include at least 80 metrics");
assert.equal(new Set(catalog.map(({ id }) => id)).size, catalog.length);
assert.equal(new Set(catalog.map(({ code }) => code)).size, catalog.length);
assert.equal(manifest.countries.length + 1, Object.keys(manifest.files).length);
assert.deepEqual(Object.keys(manifest.indicators).sort(), catalog.map(({ id }) => id).sort());
const documents = new Map();
for (const payload of provenance.payloads) {
  assert.match(payload.path, /^data\/public-economy\/raw\/[a-z-]+\.json\.gz$/);
  assert.ok(payload.url.startsWith("https://api.worldbank.org/v2/"));
  const bytes = gunzipSync(await read(payload.path));
  assert.equal(bytes.length, payload.bytes);
  assert.equal(sha(bytes), payload.sha256, `Original source hash mismatch: ${payload.path}`);
  documents.set(payload.path.split("/").at(-1).replace(".json.gz", ""), {
    ...payload,
    value: parseWorldBankDocument(bytes),
  });
}
assert.equal(documents.size, catalog.length * 2 + 1);
const snapshots = new Map();
let observations = 0;
for (const [code, evidence] of Object.entries(manifest.files)) {
  assert.match(code, /^(?:[A-Z]{2}|WLD)$/);
  const bytes = await read(`apps/web/public/economy/${code}.json`);
  assert.equal(bytes.length, evidence.bytes);
  assert.equal(sha(bytes), evidence.sha256, `Browser file hash mismatch: ${code}`);
  const country = JSON.parse(bytes);
  assert.equal(country.countryCode, code);
  assert.equal(country.retrievedAt, manifest.retrievedAt);
  assert.deepEqual(Object.keys(country.series).sort(), catalog.map(({ id }) => id).sort());
  for (const points of Object.values(country.series)) {
    let previous = manifest.startYear - 1;
    for (const [year, value] of points) {
      assert.ok(Number.isInteger(year) && year > previous && year <= manifest.endYear);
      assert.ok(
        value === null ||
          (typeof value === "string" && value.trim() && Number.isFinite(Number(value))),
      );
      previous = year;
      if (value !== null) observations += 1;
    }
  }
  snapshots.set(code, country);
}
assert.equal(observations, manifest.observations);
const countries = documents.get("countries").value[1];
const countryMap = new Map(countries.map((country) => [country.id, country.iso2Code]));
countryMap.set("WLD", "WLD");
for (const order of Object.values(manifest.countryOrder)) {
  assert.deepEqual([...order].sort(), manifest.countries.map(({ code }) => code).sort());
}
for (const country of manifest.countries) {
  assert.equal(Object.keys(manifest.countryNames[country.code]).length, 12);
  assert.ok(
    Object.values(manifest.countryNames[country.code]).every(
      (name) => typeof name === "string" && name.length > 1,
    ),
  );
  assert.equal(snapshots.get(country.code).iso3, country.iso3);
  const original = countries.find((row) => row.id === country.iso3);
  assert.equal(original.iso2Code, country.code);
  assert.equal(original.name, country.name);
  assert.notEqual(original.region.id, "NA");
  for (const [id, point] of Object.entries(manifest.highlights[country.code])) {
    assert.deepEqual(
      point,
      snapshots
        .get(country.code)
        .series[id].filter(([, value]) => value !== null)
        .at(-1) ?? null,
    );
  }
  for (const [id, point] of Object.entries(manifest.referenceHighlights[country.code])) {
    assert.deepEqual(
      point,
      snapshots
        .get(country.code)
        .series[id].find(([year, value]) => year === manifest.referenceYear && value !== null) ??
        null,
    );
  }
}
for (const indicator of catalog) {
  const original = documents.get(indicator.id);
  const source = manifest.indicators[indicator.id];
  assert.equal(source.sha256, original.sha256);
  assert.equal(source.sourceUpdatedAt, original.value[0].lastupdated);
  assert.equal(source.url, original.url);
  const units = new Set(original.value[1].map((row) => row.unit));
  const statuses = new Set(original.value[1].map((row) => row.obs_status));
  assert.equal(units.size, 1);
  assert.equal(statuses.size, 1);
  assert.deepEqual(
    source.observationMetadata,
    wdiObservationMetadata([...units][0], [...statuses][0]),
  );
  const metadata = documents
    .get(`${indicator.id}-metadata`)
    .value[1].find((item) => item.id === indicator.code);
  assert.equal(source.definition, metadata.sourceNote);
  assert.equal(source.organization, metadata.sourceOrganization);
  const byCountry = new Map();
  for (const row of original.value[1]) {
    assert.equal(row.indicator.id, indicator.code);
    const code = countryMap.get(row.countryiso3code);
    if (!snapshots.has(code)) continue;
    const points = byCountry.get(code) ?? [];
    points.push([Number(row.date), row.value]);
    byCountry.set(code, points);
  }
  let count = 0;
  for (const [code, snapshot] of snapshots) {
    const points = (byCountry.get(code) ?? []).sort((a, b) => a[0] - b[0]);
    assert.deepEqual(
      snapshot.series[indicator.id],
      points,
      `Transformed series differs from original: ${code}/${indicator.id}`,
    );
    count += points.filter(([, value]) => value !== null).length;
    for (const point of points) {
      const observation = annualReferenceObservation(
        indicator,
        source,
        { code, name: manifest.countries.find((item) => item.code === code)?.name ?? "World" },
        point,
      );
      assert.equal(observation.original_value, point[1]);
      assert.equal(observation.original_unit, [...units][0]);
      assert.equal(observation.currency, indicator.currency);
    }
  }
  assert.equal(count, source.reported);
}
assert.equal(studies.length, bibliography.length);
assert.equal(new Set(studies.map(({ doi }) => doi)).size, studies.length);
for (const study of studies) {
  const citation = bibliography.find((item) => item.id === study.id);
  assert.equal(citation.doi.toLowerCase(), study.doi.toLowerCase());
  assert.ok(citation.title && citation.authors.length && Number.isInteger(citation.year));
  assert.equal(citation.url.toLowerCase(), `https://doi.org/${study.doi.toLowerCase()}`);
  for (const field of [
    "findingEn",
    "findingFa",
    "designEn",
    "designFa",
    "boundaryEn",
    "boundaryFa",
  ])
    assert.ok(study[field]);
}
console.log(
  `Public data verified offline: ${observations} exact source values, ${snapshots.size} files, ${documents.size} original responses, ${studies.length} cited studies. Missing observations remain missing.`,
);
