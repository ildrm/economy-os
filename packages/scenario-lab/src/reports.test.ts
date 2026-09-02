import { describe, expect, it } from "vitest";
import {
  IDS,
  makeCompleteContext,
  makeReport,
  reportCitations,
  required,
  sha,
} from "./fixtures.test-helper.js";
import {
  assertScenarioReportIntegrity,
  assertScenarioReportNotObserved,
  createScenarioReportExport,
  exportScenarioReportJson,
  type ScenarioReportExport,
  type ScenarioReportExportInput,
} from "./reports.js";

function reportInput(): {
  ctx: ReturnType<typeof makeCompleteContext>;
  input: ScenarioReportExportInput;
} {
  const ctx = makeCompleteContext();
  const report = makeReport(ctx.definition, ctx.baseline, ctx.result, ctx.ledger);
  return {
    ctx,
    input: {
      schemaVersion: report.schemaVersion,
      tenantId: report.tenantId,
      reportId: report.reportId,
      createdBy: report.createdBy,
      createdAt: report.createdAt,
      title: report.title,
      executiveSummary: report.executiveSummary,
      citations: report.citations,
      claims: report.claims,
    },
  };
}

function create(input: ScenarioReportExportInput, ctx: ReturnType<typeof makeCompleteContext>) {
  return createScenarioReportExport(input, ctx.definition, ctx.baseline, ctx.result, ctx.ledger);
}

describe("provenance-complete scenario report export", () => {
  it("exports stable canonical JSON with immutable claim boundaries", () => {
    const { ctx, input } = reportInput();
    const report = create(input, ctx);
    const again = create(input, ctx);
    const json = exportScenarioReportJson(
      report,
      ctx.definition,
      ctx.baseline,
      ctx.result,
      ctx.ledger,
    );

    expect(report.manifestSha256).toBe(again.manifestSha256);
    expect(JSON.parse(json).manifestSha256).toBe(report.manifestSha256);
    expect(report.claimBoundary).toEqual({
      researchOnly: true,
      notForecastOrProbability: true,
      notCausalEstimate: true,
      notPolicyAdvice: true,
      noPolicyOptimalityClaim: true,
    });
    expect(report.provenance.workerOutputArtifactSha256).toBe(
      ctx.result.workerOutputArtifactSha256,
    );
    expect(Object.isFrozen(report.claims)).toBe(true);
    expect(() =>
      assertScenarioReportIntegrity(report, ctx.definition, ctx.baseline, ctx.result, ctx.ledger),
    ).not.toThrow();
    expect(() => assertScenarioReportNotObserved(report)).toThrow(/never be admitted/);
  });

  it.each([
    ["forecast probability", "The probability of contraction is 80 percent."],
    ["causal effect", "The shock causes the output change."],
    ["policy recommendation", "Officials should implement this intervention."],
    ["policy optimum", "This is the optimal policy response."],
    ["future assertion", "Output will decline under the scenario."],
  ])("rejects forbidden report assertion: %s", (_label, text) => {
    const { ctx, input } = reportInput();
    expect(() =>
      create(
        {
          ...input,
          claims: [
            { ...required(input.claims[0], "first report claim"), text },
            ...input.claims.slice(1),
          ],
        },
        ctx,
      ),
    ).toThrow(/assertion/);
  });

  it("requires an exact citation for every provenance layer", () => {
    const { ctx, input } = reportInput();
    expect(() => create({ ...input, citations: input.citations.slice(1) }, ctx)).toThrow(
      /5..256|observed_baseline/,
    );
    const wrongModel = input.citations.map((citation) =>
      citation.artifactRole === "model" ? { ...citation, snapshotSha256: sha("1") } : citation,
    );
    expect(() => create({ ...input, citations: wrongModel }, ctx)).toThrow(/exact model/);
  });

  it("rejects absent, unused, and future citations", () => {
    const { ctx, input } = reportInput();
    const absentClaim = input.claims.map((claim, index) =>
      index === 0 ? { ...claim, citationIds: ["missing.source"] } : claim,
    );
    expect(() => create({ ...input, claims: absentClaim }, ctx)).toThrow(/absent citation/);

    const unused = [
      ...input.citations,
      {
        citationId: "source.unused",
        artifactRole: "supporting_source" as const,
        title: "Unused source",
        publisher: "Fixture publisher",
        sourceUri: "https://example.test/unused",
        sourceVersion: "1",
        snapshotSha256: sha("2"),
        availableAt: "2026-01-01T00:00:00Z",
        retrievedAt: "2026-01-03T00:00:00Z",
      },
    ];
    expect(() => create({ ...input, citations: unused }, ctx)).toThrow(/unused citation/);

    const future = input.citations.map((citation, index) =>
      index === 0 ? { ...citation, availableAt: "2026-01-04T00:00:00Z" } : citation,
    );
    expect(() => create({ ...input, citations: future }, ctx)).toThrow(/future/);

    const retrievedBeforeAvailable = input.citations.map((citation, index) =>
      index === 0
        ? {
            ...citation,
            availableAt: "2026-01-02T00:00:00Z",
            retrievedAt: "2026-01-01T00:00:00Z",
          }
        : citation,
    );
    expect(() => create({ ...input, citations: retrievedBeforeAvailable }, ctx)).toThrow(
      /retrieved before/,
    );
  });

  it("requires output, sensitivity, and spillover coverage", () => {
    const { ctx, input } = reportInput();
    const noOutputMetric = input.claims.map((claim) =>
      claim.claimKind === "scenario_output" ? { ...claim, metricKeys: [] } : claim,
    );
    expect(() => create({ ...input, claims: noOutputMetric }, ctx)).toThrow(/must name/);

    const noSensitivity = input.claims.filter((claim) => claim.claimKind !== "sensitivity");
    expect(() => create({ ...input, claims: noSensitivity }, ctx)).toThrow();
    const noSpillover = input.claims.filter((claim) => claim.claimKind !== "spillover");
    expect(() => create({ ...input, claims: noSpillover }, ctx)).toThrow();
  });

  it("rejects cross-tenant and pre-result reports", () => {
    const { ctx, input } = reportInput();
    expect(() => create({ ...input, tenantId: IDS.tenantTwo }, ctx)).toThrow(/tenant/);
    expect(() => create({ ...input, createdAt: "2026-01-03T02:30:00Z" }, ctx)).toThrow(/predate/);
  });

  it("detects report tampering and weakened contamination flags", () => {
    const ctx = makeCompleteContext();
    const report = makeReport(ctx.definition, ctx.baseline, ctx.result, ctx.ledger);
    const tampered = structuredClone(report) as ScenarioReportExport & { title: string };
    tampered.title = "Changed without a new digest";
    expect(() =>
      assertScenarioReportIntegrity(tampered, ctx.definition, ctx.baseline, ctx.result, ctx.ledger),
    ).toThrow(/digest/);

    const weak = structuredClone(report) as unknown as {
      canonicalObservedDatasetEligible: true;
    };
    weak.canonicalObservedDatasetEligible = true;
    expect(() =>
      assertScenarioReportIntegrity(
        weak as unknown as ScenarioReportExport,
        ctx.definition,
        ctx.baseline,
        ctx.result,
        ctx.ledger,
      ),
    ).toThrow(/digest|weakened/);
  });

  it("rejects malformed source locations and incomplete report dates", () => {
    const { ctx, input } = reportInput();
    const badUri = reportCitations(ctx.definition, ctx.baseline, ctx.result).map(
      (citation, index) =>
        index === 0 ? { ...citation, sourceUri: "http://insecure.test" } : citation,
    );
    expect(() => create({ ...input, citations: badUri }, ctx)).toThrow(/HTTPS URL or URN/);
    expect(() => create({ ...input, createdAt: "not-a-date" }, ctx)).toThrow(/UTC instant/);
  });
});
