import { performance } from "node:perf_hooks";
import { computeMaterialBalance } from "../packages/allocation-planning/dist/index.js";
import { cumulativeProspectValue } from "../packages/behavioral-economics/dist/index.js";

// Synthetic capacity fixtures only. These values are not empirical evidence or priors.
const material = {
  commodityKey: "synthetic.energy",
  unit: "synthetic_unit",
  production: "100.1",
  imports: "0.2",
  openingInventory: "10",
  intermediateDemand: "40",
  householdDemand: "30",
  governmentDemand: "10",
  investmentDemand: "10",
  exports: "5",
  closingInventory: "5",
};
const parameters = {
  referencePoint: "0",
  gainCurvature: "1",
  lossCurvature: "1",
  lossAversion: "1",
  gainWeighting: "1",
  lossWeighting: "1",
};
const outcomes = Array.from({ length: 100 }, (_, index) => ({
  value: String(index - 50),
  probability: "0.01",
}));
const workloads = [
  {
    name: "material_balance_1000_rows",
    iterations: 1000,
    run: () => computeMaterialBalance(material),
  },
  {
    name: "cumulative_prospect_100_choices_x_100_outcomes",
    iterations: 100,
    run: () => cumulativeProspectValue(outcomes, parameters),
  },
];
const results = [];
for (const workload of workloads) {
  const run = () => {
    for (let index = 0; index < workload.iterations; index++) workload.run();
  };
  for (let warmup = 0; warmup < 3; warmup++) run();
  const samples = [];
  for (let index = 0; index < 20; index++) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
  results.push({
    name: workload.name,
    samples: samples.length,
    p95Ms: p95,
    budgetMs: 1000,
    pass: p95 <= 1000,
  });
}
process.stdout.write(
  `${JSON.stringify({ dataClass: "synthetic_research", purpose: "local_capacity_only", results }, null, 2)}\n`,
);
if (results.some((result) => !result.pass)) process.exitCode = 1;
