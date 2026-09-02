import {
  appendGovernanceEvent,
  createGovernanceLedger,
  type ScenarioGovernanceLedger,
} from "./collaboration.js";
import {
  type BaselineIdentity,
  type BaselineIdentityInput,
  createBaselineIdentity,
  createScenarioDefinition,
  type ScenarioDefinition,
  type ScenarioDefinitionInput,
} from "./definitions.js";
import {
  createScenarioReportExport,
  type ScenarioReportCitation,
  type ScenarioReportExport,
} from "./reports.js";
import {
  createScenarioResultArtifact,
  type ScenarioResultArtifact,
  type ScenarioResultArtifactInput,
} from "./results.js";
import {
  createScenarioRun,
  createScenarioRunRequest,
  type ScenarioRun,
  type ScenarioRunRequest,
  transitionScenarioRun,
} from "./runs.js";

export const IDS = Object.freeze({
  tenant: "00000000-0000-4000-8000-000000000001",
  tenantTwo: "00000000-0000-4000-8000-000000000002",
  baseline: "00000000-0000-4000-8000-000000000003",
  observed: "00000000-0000-4000-8000-000000000004",
  forecast: "00000000-0000-4000-8000-000000000005",
  model: "00000000-0000-4000-8000-000000000006",
  author: "00000000-0000-4000-8000-000000000007",
  contributor: "00000000-0000-4000-8000-000000000008",
  reviewer: "00000000-0000-4000-8000-000000000009",
  approver: "00000000-0000-4000-8000-00000000000a",
  worker: "00000000-0000-4000-8000-00000000000b",
  operator: "00000000-0000-4000-8000-00000000000c",
  scenario: "00000000-0000-4000-8000-000000000010",
  scenarioTwo: "00000000-0000-4000-8000-000000000011",
  request: "00000000-0000-4000-8000-000000000012",
  run: "00000000-0000-4000-8000-000000000013",
  proposal: "00000000-0000-4000-8000-000000000014",
  review: "00000000-0000-4000-8000-000000000015",
  approval: "00000000-0000-4000-8000-000000000016",
  start: "00000000-0000-4000-8000-000000000017",
  success: "00000000-0000-4000-8000-000000000018",
  result: "00000000-0000-4000-8000-000000000019",
  report: "00000000-0000-4000-8000-00000000001a",
  comparison: "00000000-0000-4000-8000-00000000001b",
  revision: "00000000-0000-4000-8000-00000000001c",
  checkpoint: "00000000-0000-4000-8000-00000000001d",
  resumed: "00000000-0000-4000-8000-00000000001e",
  retryRequest: "00000000-0000-4000-8000-00000000001f",
  retryRun: "00000000-0000-4000-8000-000000000020",
});

export function sha(character: string): string {
  return character.repeat(64);
}

export function required<T>(value: T | undefined, field = "test fixture"): T {
  if (value === undefined) throw new TypeError(`${field} unexpectedly disappeared`);
  return value;
}

export function baselineInput(
  overrides: Partial<BaselineIdentityInput> = {},
): BaselineIdentityInput {
  return {
    schemaVersion: 1,
    tenantId: IDS.tenant,
    baselineId: IDS.baseline,
    createdAt: "2026-01-01T12:00:00Z",
    pointInTimeCutoff: "2026-01-01T00:00:00Z",
    dataClass: "pinned_research_baseline",
    canonicalObservedDatasetEligible: false,
    observedSnapshot: {
      snapshotId: IDS.observed,
      snapshotSha256: sha("a"),
      observedThrough: "2025-12-30T00:00:00Z",
      availableAt: "2025-12-31T00:00:00Z",
    },
    forecastSnapshot: {
      snapshotId: IDS.forecast,
      snapshotSha256: sha("b"),
      generatedAt: "2025-12-31T12:00:00Z",
      informationCutoff: "2025-12-31T00:00:00Z",
      methodologyVersion: "1.2.0",
    },
    model: {
      modelId: IDS.model,
      modelVersion: "2.0.0",
      artifactSha256: sha("c"),
      trainingDataCutoff: "2025-12-29T00:00:00Z",
      codeSha256: sha("d"),
      configurationSha256: sha("e"),
    },
    baselineResultSha256: sha("f"),
    ...overrides,
  };
}

export function makeBaseline(overrides: Partial<BaselineIdentityInput> = {}): BaselineIdentity {
  return createBaselineIdentity(baselineInput(overrides));
}

export function definitionInput(
  baseline: BaselineIdentity,
  overrides: Partial<ScenarioDefinitionInput> = {},
): ScenarioDefinitionInput {
  return {
    schemaVersion: 1,
    tenantId: baseline.tenantId,
    scenarioId: IDS.scenario,
    definitionVersion: 1,
    previousDefinitionSha256: null,
    baselineId: baseline.baselineId,
    baselineIdentitySha256: baseline.manifestSha256,
    createdAt: "2026-01-02T00:00:00Z",
    authoredBy: IDS.author,
    contributorIds: [IDS.contributor],
    title: "Energy-cost stress exploration",
    researchQuestion: "How does the declared model behave under a temporary energy-cost shock?",
    dataClass: "scenario_counterfactual_only",
    canonicalObservedDatasetEligible: false,
    notObservedFact: true,
    assumptions: [
      {
        assumptionKey: "energy_pass_through",
        statement: "The declared pass-through coefficient remains fixed during the run.",
        rationale: "This isolates the selected structural response.",
        sensitivityRequired: true,
        citationIds: ["source.energy"],
      },
    ],
    limitations: ["Model responses are conditional on declared equations and inputs."],
    shocks: [
      {
        actionKey: "energy_shock",
        actionKind: "shock",
        shockType: "supply",
        target: {
          geographyKey: "gbr",
          sectorKey: "manufacturing",
          metricKey: "output_index",
          unit: "index_points",
        },
        startStep: 1,
        endStep: 3,
        operation: "additive",
        value: "-10",
        priority: 10,
        rationale: "Explore a temporary input-cost displacement.",
        citationIds: ["source.energy"],
      },
    ],
    policyInterventions: [
      {
        actionKey: "temporary_support",
        actionKind: "policy_intervention",
        instrumentKey: "temporary_credit_support",
        hypothetical: true,
        notPolicyRecommendation: true,
        target: {
          geographyKey: "gbr",
          sectorKey: "manufacturing",
          metricKey: "output_index",
          unit: "index_points",
        },
        startStep: 2,
        endStep: 2,
        operation: "multiply",
        value: "0.9",
        priority: 20,
        rationale: "Explore a declared hypothetical offset within the model.",
        citationIds: ["source.policy"],
      },
    ],
    conflictResolution: {
      mode: "priority_then_action_key",
      explanation: "Apply lower priority first, then action kind and canonical action key.",
    },
    usageBoundary: {
      researchOnly: true,
      scenarioNotForecast: true,
      notCausalEstimate: true,
      notPolicyAdvice: true,
      noPolicyOptimalityClaim: true,
    },
    ...overrides,
  };
}

export function makeDefinition(
  baseline: BaselineIdentity,
  overrides: Partial<ScenarioDefinitionInput> = {},
): ScenarioDefinition {
  return createScenarioDefinition(definitionInput(baseline, overrides), baseline);
}

export function makeApprovedLedger(
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
): ScenarioGovernanceLedger {
  let ledger = createGovernanceLedger(definition, baseline, {
    tenantId: definition.tenantId,
    eventId: IDS.proposal,
    eventType: "proposal",
    actorId: definition.authoredBy,
    actorRole: "author",
    occurredAt: "2026-01-02T01:00:00Z",
    scenarioDefinitionSha256: definition.manifestSha256,
    definitionVersion: 1,
    rationale: "Submit the declared scenario for independent review.",
  });
  ledger = appendGovernanceEvent(ledger, {
    tenantId: definition.tenantId,
    eventId: IDS.review,
    eventType: "review",
    actorId: IDS.reviewer,
    actorRole: "reviewer",
    occurredAt: "2026-01-02T02:00:00Z",
    scenarioDefinitionSha256: definition.manifestSha256,
    definitionVersion: definition.definitionVersion,
    decision: "accepted_for_approval",
    findings: [],
  });
  return appendGovernanceEvent(ledger, {
    tenantId: definition.tenantId,
    eventId: IDS.approval,
    eventType: "approval",
    actorId: IDS.approver,
    actorRole: "approver",
    occurredAt: "2026-01-02T03:00:00Z",
    scenarioDefinitionSha256: definition.manifestSha256,
    definitionVersion: definition.definitionVersion,
    decision: "approved",
    rationale: "The reviewed scenario is admitted for research execution.",
  });
}

export function makeRequest(
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
  ledger: ScenarioGovernanceLedger,
  overrides: Partial<Parameters<typeof createScenarioRunRequest>[0]> = {},
): ScenarioRunRequest {
  return createScenarioRunRequest(
    {
      schemaVersion: 1,
      tenantId: definition.tenantId,
      requestId: IDS.request,
      runId: IDS.run,
      idempotencyKey: "scenario-run-0001",
      attempt: 1,
      retryOfRunId: null,
      retryReason: null,
      requestedBy: IDS.author,
      requestedAt: "2026-01-03T00:00:00Z",
      scenarioId: definition.scenarioId,
      scenarioDefinitionSha256: definition.manifestSha256,
      baselineIdentitySha256: baseline.manifestSha256,
      seed: "42",
      steps: 12,
      ensembleSize: 4,
      outputMetricKeys: ["output_index"],
      resourceBudget: { maxOutputCells: 100, maxArtifactBytes: 100_000 },
      ...overrides,
    },
    definition,
    baseline,
    ledger,
  );
}

export function makeSucceededRun(request: ScenarioRunRequest): ScenarioRun {
  let run = createScenarioRun(request);
  run = transitionScenarioRun(
    run,
    {
      tenantId: request.tenantId,
      eventId: IDS.start,
      actorId: IDS.worker,
      actorRole: "worker",
      occurredAt: "2026-01-03T01:00:00Z",
      expectedStateVersion: 1,
      toStatus: "running",
      reason: "Worker acquired the bounded run.",
      checkpoint: null,
      outputArtifactSha256: null,
    },
    request,
  );
  return transitionScenarioRun(
    run,
    {
      tenantId: request.tenantId,
      eventId: IDS.success,
      actorId: IDS.worker,
      actorRole: "worker",
      occurredAt: "2026-01-03T02:00:00Z",
      expectedStateVersion: 2,
      toStatus: "succeeded",
      reason: "Worker completed every ensemble member.",
      checkpoint: null,
      outputArtifactSha256: sha("9"),
    },
    request,
  );
}

export function resultInput(
  run: ScenarioRun,
  request: ScenarioRunRequest,
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
  overrides: Partial<ScenarioResultArtifactInput> = {},
): ScenarioResultArtifactInput {
  return {
    schemaVersion: 1,
    tenantId: definition.tenantId,
    resultId: IDS.result,
    runId: run.runId,
    runRequestSha256: request.manifestSha256,
    replayIdentitySha256: request.replayIdentitySha256,
    scenarioId: definition.scenarioId,
    scenarioDefinitionSha256: definition.manifestSha256,
    baselineIdentitySha256: baseline.manifestSha256,
    workerOutputArtifactSha256: sha("9"),
    generatedAt: "2026-01-03T03:00:00Z",
    ensembleMembers: request.ensembleSize,
    dataClass: "scenario_result_only",
    canonicalObservedDatasetEligible: false,
    notObservedFact: true,
    metrics: [
      {
        metricKey: "output_index",
        geographyKey: "gbr",
        sectorKey: "manufacturing",
        unit: "index_points",
        baseline: {
          pointEstimate: "100",
          uncertainty: {
            kind: "baseline_interval",
            lower: "90",
            upper: "110",
            source: "pinned_baseline_artifact",
          },
        },
        scenario: {
          pointEstimate: "80",
          uncertainty: {
            kind: "scenario_ensemble_interval",
            lower: "70",
            p50: "80",
            upper: "90",
            ensembleSize: request.ensembleSize,
            notForecastProbability: true,
          },
        },
        deltaFromBaseline: "-20",
      },
    ],
    sensitivities: [
      {
        sensitivityKey: "energy_parameter_endpoints",
        parameterKey: "energy_pass_through",
        metricKey: "output_index",
        geographyKey: "gbr",
        sectorKey: "manufacturing",
        lowInput: "0.5",
        highInput: "1.5",
        lowOutcome: "75",
        highOutcome: "85",
        uncertainty: {
          kind: "endpoint_range_not_probability",
          interactionsUnquantified: true,
          modelUncertainty: "not_quantified",
        },
      },
    ],
    spillovers: [
      {
        spilloverKey: "usa_services_to_gbr_manufacturing",
        sourceGeographyKey: "usa",
        sourceSectorKey: "services",
        targetGeographyKey: "gbr",
        targetSectorKey: "manufacturing",
        metricKey: "output_index",
        unit: "index_points",
        direction: "negative",
        effectLower: "-4",
        effectUpper: "-1",
        uncertainty: {
          kind: "structural_spillover_range_not_probability",
          modelUncertainty: "not_quantified",
          notCausalEstimate: true,
        },
      },
    ],
    limitations: ["Finite ensemble summaries do not quantify model uncertainty."],
    usageBoundary: {
      researchOnly: true,
      scenarioNotForecast: true,
      notCausalEstimate: true,
      notPolicyAdvice: true,
      noPolicyOptimalityClaim: true,
    },
    ...overrides,
  };
}

export function makeResult(
  run: ScenarioRun,
  request: ScenarioRunRequest,
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
  overrides: Partial<ScenarioResultArtifactInput> = {},
): ScenarioResultArtifact {
  return createScenarioResultArtifact(
    resultInput(run, request, definition, baseline, overrides),
    run,
    request,
    definition,
    baseline,
  );
}

export function reportCitations(
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
  result: ScenarioResultArtifact,
): readonly ScenarioReportCitation[] {
  const common = {
    publisher: "EconomyOS research fixture",
    sourceVersion: "1",
    availableAt: "2026-01-03T03:00:00Z",
    retrievedAt: "2026-01-03T04:00:00Z",
  };
  return [
    {
      ...common,
      citationId: "pin.observed",
      artifactRole: "observed_baseline",
      title: "Pinned observed snapshot",
      sourceUri: "urn:economyos:observed-snapshot",
      snapshotSha256: baseline.observedSnapshot.snapshotSha256,
    },
    {
      ...common,
      citationId: "pin.forecast",
      artifactRole: "forecast_baseline",
      title: "Pinned forecast snapshot",
      sourceUri: "urn:economyos:forecast-snapshot",
      snapshotSha256: baseline.forecastSnapshot.snapshotSha256,
    },
    {
      ...common,
      citationId: "pin.model",
      artifactRole: "model",
      title: "Pinned model artifact",
      sourceUri: "https://example.test/models/2.0.0",
      snapshotSha256: baseline.model.artifactSha256,
    },
    {
      ...common,
      citationId: "pin.definition",
      artifactRole: "scenario_definition",
      title: "Approved scenario definition",
      sourceUri: "urn:economyos:scenario-definition",
      snapshotSha256: definition.manifestSha256,
    },
    {
      ...common,
      citationId: "pin.result",
      artifactRole: "scenario_result",
      title: "Scenario result artifact",
      sourceUri: "urn:economyos:scenario-result",
      snapshotSha256: result.manifestSha256,
    },
  ];
}

export function makeReport(
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
  result: ScenarioResultArtifact,
  ledger: ScenarioGovernanceLedger,
): ScenarioReportExport {
  return createScenarioReportExport(
    {
      schemaVersion: 1,
      tenantId: definition.tenantId,
      reportId: IDS.report,
      createdBy: IDS.author,
      createdAt: "2026-01-03T05:00:00Z",
      title: "Energy-cost research scenario",
      executiveSummary: "This summary describes conditional model behavior under declared inputs.",
      citations: reportCitations(definition, baseline, result),
      claims: [
        {
          claimId: "claim.output",
          claimKind: "scenario_output",
          text: "The scenario ensemble summary places the declared output index at 80.",
          citationIds: ["pin.observed", "pin.result"],
          metricKeys: ["output_index"],
        },
        {
          claimId: "claim.sensitivity",
          claimKind: "sensitivity",
          text: "Endpoint analysis spans the declared parameter settings.",
          citationIds: ["pin.model", "pin.definition"],
          metricKeys: ["output_index"],
        },
        {
          claimId: "claim.spillover",
          claimKind: "spillover",
          text: "The structural range records a cross-geography model linkage.",
          citationIds: ["pin.forecast"],
          metricKeys: ["output_index"],
        },
      ],
    },
    definition,
    baseline,
    result,
    ledger,
  );
}

export function makeCompleteContext(): {
  baseline: BaselineIdentity;
  definition: ScenarioDefinition;
  ledger: ScenarioGovernanceLedger;
  request: ScenarioRunRequest;
  run: ScenarioRun;
  result: ScenarioResultArtifact;
} {
  const baseline = makeBaseline();
  const definition = makeDefinition(baseline);
  const ledger = makeApprovedLedger(definition, baseline);
  const request = makeRequest(definition, baseline, ledger);
  const run = makeSucceededRun(request);
  const result = makeResult(run, request, definition, baseline);
  return { baseline, definition, ledger, request, run, result };
}
