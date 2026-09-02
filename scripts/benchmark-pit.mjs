import { performance } from "node:perf_hooks";
import { selectPointInTime } from "../packages/canonical-data/dist/index.js";

const observations = [];
const releaseBase = Date.parse("2025-01-01T00:00:00Z");
for (let series = 0; series < 100; series += 1) {
  for (let period = 0; period < 100; period += 1) {
    for (let revision = 0; revision < 5; revision += 1) {
      const eventStart = new Date(Date.UTC(1900 + period, 0, 1));
      const eventEnd = new Date(Date.UTC(1901 + period, 0, 1));
      const releaseTime = new Date(releaseBase + (period * 5 + revision) * 86_400_000);
      observations.push({
        id: `observation-${series}-${period}-${revision}`,
        seriesId: `series-${series}`,
        eventStart: eventStart.toISOString().replace(".000Z", "Z"),
        eventEnd: eventEnd.toISOString().replace(".000Z", "Z"),
        releaseId: `release-${series}-${period}-${revision}`,
        releaseTime: releaseTime.toISOString().replace(".000Z", "Z"),
        availabilityTime: releaseTime.toISOString().replace(".000Z", "Z"),
        retrievedAt: new Date(releaseTime.getTime() + 30_000).toISOString().replace(".000Z", "Z"),
        recordedAt: new Date(releaseTime.getTime() + 60_000).toISOString().replace(".000Z", "Z"),
        pitQuality: "true_vintage",
        value: String(period * 10 + revision),
        missingReason: null,
        dataClass: "synthetic_research",
      });
    }
  }
}

const query = {
  policy: "true_vintage",
  knownAt: "2027-01-01T00:00:00Z",
  allowSynthetic: true,
};
for (let warmup = 0; warmup < 3; warmup += 1) selectPointInTime(observations, query);
const samples = [];
let selected = 0;
for (let iteration = 0; iteration < 20; iteration += 1) {
  const start = performance.now();
  selected = selectPointInTime(observations, query).length;
  samples.push(performance.now() - start);
}
samples.sort((left, right) => left - right);
const median = samples[Math.floor(samples.length / 2)];
const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
const result = {
  fixtureClass: "synthetic_research",
  inputVersions: observations.length,
  selectedPeriods: selected,
  medianMilliseconds: Number(median.toFixed(2)),
  p95Milliseconds: Number(p95.toFixed(2)),
  rssMegabytes: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
  acceptance: { p95MillisecondsMaximum: 500, passed: p95 <= 500 },
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.acceptance.passed) process.exitCode = 1;
