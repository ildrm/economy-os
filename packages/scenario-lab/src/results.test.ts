import { describe, expect, it } from "vitest";
import {
  IDS,
  makeApprovedLedger,
  makeBaseline,
  makeCompleteContext,
  makeDefinition,
  makeRequest,
  makeResult,
  makeSucceededRun,
  required,
  resultInput,
  sha,
} from "./fixtures.test-helper.js";
import {
  assertScenarioComparisonIntegrity,
  assertScenarioDerivedArtifactNotObserved,
  assertScenarioResultIntegrity,
  createScenarioComparison,
  createScenarioResultArtifact,
  type ScenarioResultArtifact,
  type ScenarioResultArtifactInput,
} from "./results.js";

function secondResult(baseline = makeBaseline(), baselinePoint = "100"): ScenarioResultArtifact {
  const definition = makeDefinition(baseline, {
    scenarioId: IDS.scenarioTwo,
    title: "Alternative energy-cost stress exploration",
  });
  const ledger = makeApprovedLedger(definition, baseline);
  const request = makeRequest(definition, baseline, ledger, {
    requestId: "00000000-0000-4000-8000-000000000051",
    runId: "00000000-0000-4000-8000-000000000052",
    idempotencyKey: "scenario-run-0002",
  });
  const run = makeSucceededRun(request);
  const base = resultInput(run, request, definition, baseline);
  const metric = required(base.metrics[0], "first result metric");
  return makeResult(run, request, definition, baseline, {
    resultId: "00000000-0000-4000-8000-000000000053",
    metrics: [
      {
        ...metric,
        baseline: { ...metric.baseline, pointEstimate: baselinePoint },
        scenario: { ...metric.scenario, pointEstimate: "70" },
        deltaFromBaseline: String(70 - Number(baselinePoint)),
      },
    ],
  });
}

describe("bounded scenario result artifacts", () => {
  it("creates immutable results with distinct uncertainty contracts", () => {
    const ctx = makeCompleteContext();
    expect(ctx.result.metrics[0]?.baseline.uncertainty.kind).toBe("baseline_interval");
    expect(ctx.result.metrics[0]?.scenario.uncertainty.kind).toBe("scenario_ensemble_interval");
    expect(ctx.result.sensitivities[0]?.uncertainty.kind).toBe("endpoint_range_not_probability");
    expect(ctx.result.spillovers[0]?.uncertainty.notCausalEstimate).toBe(true);
    expect(Object.isFrozen(ctx.result.metrics)).toBe(true);
    expect(() =>
      assertScenarioResultIntegrity(ctx.result, ctx.run, ctx.request, ctx.definition, ctx.baseline),
    ).not.toThrow();
  });

  it.each([
    [
      "delta",
      (input: ScenarioResultArtifactInput) => {
        const metric = required(input.metrics[0], "first result metric");
        return { ...input, metrics: [{ ...metric, deltaFromBaseline: "-19" }] };
      },
    ],
    [
      "ensemble",
      (input: ScenarioResultArtifactInput) => {
        const metric = required(input.metrics[0], "first result metric");
        return {
          ...input,
          metrics: [
            {
              ...metric,
              scenario: {
                ...metric.scenario,
                uncertainty: { ...metric.scenario.uncertainty, ensembleSize: 3 },
              },
            },
          ],
        };
      },
    ],
    [
      "scenario interval",
      (input: ScenarioResultArtifactInput) => {
        const metric = required(input.metrics[0], "first result metric");
        return {
          ...input,
          metrics: [
            {
              ...metric,
              scenario: {
                ...metric.scenario,
                uncertainty: { ...metric.scenario.uncertainty, lower: "90", upper: "70" },
              },
            },
          ],
        };
      },
    ],
    [
      "baseline provenance",
      (input: ScenarioResultArtifactInput) => {
        const metric = required(input.metrics[0], "first result metric");
        return {
          ...input,
          metrics: [
            {
              ...metric,
              baseline: {
                ...metric.baseline,
                uncertainty: {
                  ...metric.baseline.uncertainty,
                  source: "other" as "pinned_baseline_artifact",
                },
              },
            },
          ],
        };
      },
    ],
    [
      "sensitivity target",
      (input: ScenarioResultArtifactInput) => ({
        ...input,
        sensitivities: [
          { ...required(input.sensitivities[0], "first sensitivity"), geographyKey: "usa" },
        ],
      }),
    ],
    [
      "spillover target",
      (input: ScenarioResultArtifactInput) => ({
        ...input,
        spillovers: [
          { ...required(input.spillovers[0], "first spillover"), targetSectorKey: "services" },
        ],
      }),
    ],
    [
      "weak data class",
      (input: ScenarioResultArtifactInput) => ({
        ...input,
        canonicalObservedDatasetEligible: true as false,
      }),
    ],
  ])("rejects invalid result semantics: %s", (_label, mutate) => {
    const ctx = makeCompleteContext();
    const input = mutate(resultInput(ctx.run, ctx.request, ctx.definition, ctx.baseline));
    expect(() =>
      createScenarioResultArtifact(input, ctx.run, ctx.request, ctx.definition, ctx.baseline),
    ).toThrow();
  });

  it("enforces the artifact byte budget", () => {
    const baseline = makeBaseline();
    const definition = makeDefinition(baseline);
    const ledger = makeApprovedLedger(definition, baseline);
    const request = makeRequest(definition, baseline, ledger, {
      resourceBudget: { maxOutputCells: 100, maxArtifactBytes: 1_024 },
    });
    const run = makeSucceededRun(request);
    expect(() => makeResult(run, request, definition, baseline)).toThrow(/maxArtifactBytes/);
  });

  it("requires a succeeded same-tenant exact run and detects tampering", () => {
    const ctx = makeCompleteContext();
    expect(() =>
      createScenarioResultArtifact(
        {
          ...resultInput(ctx.run, ctx.request, ctx.definition, ctx.baseline),
          tenantId: IDS.tenantTwo,
        },
        ctx.run,
        ctx.request,
        ctx.definition,
        ctx.baseline,
      ),
    ).toThrow(/exact succeeded/);
    const tampered = structuredClone(ctx.result) as ScenarioResultArtifact & {
      workerOutputArtifactSha256: string;
    };
    tampered.workerOutputArtifactSha256 = sha("1");
    expect(() =>
      assertScenarioResultIntegrity(tampered, ctx.run, ctx.request, ctx.definition, ctx.baseline),
    ).toThrow(/digest/);
    expect(() => assertScenarioDerivedArtifactNotObserved(ctx.result)).toThrow(
      /cannot be admitted/,
    );
  });
});

describe("compatible exact-baseline scenario comparison", () => {
  it("compares aligned scenarios without rankings", () => {
    const ctx = makeCompleteContext();
    const alternative = secondResult(ctx.baseline);
    const comparison = createScenarioComparison(
      {
        schemaVersion: 1,
        tenantId: IDS.tenant,
        comparisonId: IDS.comparison,
        createdBy: IDS.author,
        createdAt: "2026-01-04T00:00:00Z",
      },
      [alternative, ctx.result],
    );

    expect(comparison.noRankingOrRecommendation).toBe(true);
    expect(comparison.metrics[0]?.pairwiseDifferences[0]?.leftMinusRight).toBe("10");
    expect(comparison.metrics[0]?.scenarios.map((scenario) => scenario.scenarioId)).toEqual([
      IDS.scenario,
      IDS.scenarioTwo,
    ]);
    expect(() =>
      assertScenarioComparisonIntegrity(comparison, [alternative, ctx.result]),
    ).not.toThrow();
  });

  it("rejects baseline identity drift", () => {
    const ctx = makeCompleteContext();
    const otherBaseline = makeBaseline({
      baselineId: "00000000-0000-4000-8000-000000000054",
      baselineResultSha256: sha("1"),
    });
    const alternative = secondResult(otherBaseline);
    expect(() =>
      createScenarioComparison(
        {
          schemaVersion: 1,
          tenantId: IDS.tenant,
          comparisonId: IDS.comparison,
          createdBy: IDS.author,
          createdAt: "2026-01-04T00:00:00Z",
        },
        [ctx.result, alternative],
      ),
    ).toThrow(/exact same pinned baseline/);
  });

  it("rejects inconsistent values even under the same baseline digest", () => {
    const ctx = makeCompleteContext();
    const alternative = secondResult(ctx.baseline, "101");
    expect(() =>
      createScenarioComparison(
        {
          schemaVersion: 1,
          tenantId: IDS.tenant,
          comparisonId: IDS.comparison,
          createdBy: IDS.author,
          createdAt: "2026-01-04T00:00:00Z",
        },
        [ctx.result, alternative],
      ),
    ).toThrow(/disagree/);
  });

  it("rejects duplicate scenarios, too few results, and cross-tenant input", () => {
    const ctx = makeCompleteContext();
    const input = {
      schemaVersion: 1 as const,
      tenantId: IDS.tenant,
      comparisonId: IDS.comparison,
      createdBy: IDS.author,
      createdAt: "2026-01-04T00:00:00Z",
    };
    expect(() => createScenarioComparison(input, [ctx.result])).toThrow(/2..8/);
    expect(() => createScenarioComparison(input, [ctx.result, ctx.result])).toThrow(/duplicate/);
    expect(() =>
      createScenarioComparison({ ...input, tenantId: IDS.tenantTwo }, [ctx.result, ctx.result]),
    ).toThrow(/tenant/);
  });
});
