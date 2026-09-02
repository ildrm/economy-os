import type {
  CalibrationManifest,
  CalibrationManifestInput,
  SimulationRunPlan,
  SimulationRunPlanInput,
  SimulationWorld,
  SystemDefinition,
  SystemDefinitionInput,
} from "./index.js";
import {
  createCalibrationManifest,
  createSimulationRunPlan,
  createSimulationWorld,
  createSystemDefinition,
} from "./index.js";

export const IDS = {
  system: "058f47ac-19fc-7c92-ae91-0242ac130001",
  calibration: "058f47ac-19fc-7c92-ae91-0242ac130002",
  evidence: "058f47ac-19fc-7c92-ae91-0242ac130003",
  dataset: "058f47ac-19fc-7c92-ae91-0242ac130004",
  reviewer: "058f47ac-19fc-7c92-ae91-0242ac130005",
  world: "058f47ac-19fc-7c92-ae91-0242ac130006",
  scenario: "058f47ac-19fc-7c92-ae91-0242ac130007",
  author: "058f47ac-19fc-7c92-ae91-0242ac130008",
  run: "058f47ac-19fc-7c92-ae91-0242ac130009",
  receipt: "058f47ac-19fc-7c92-ae91-0242ac130010",
} as const;

export function required<T>(value: T | undefined): T {
  if (value === undefined) throw new TypeError("test fixture item is missing");
  return value;
}

export function definitionInput(): SystemDefinitionInput {
  return {
    schemaVersion: 1,
    systemId: IDS.system,
    systemVersion: "1.0.0",
    name: "Two-stock bounded research system",
    description:
      "A transparent stock-transfer example used to test deterministic simulation mechanics.",
    timeStepUnit: "period",
    kernel: { kernelId: "bounded-linear-stock-flow.v1", kernelVersion: "1.0.0" },
    stateVariables: [
      {
        stateKey: "liquidity",
        label: "Liquidity",
        unit: "index-point",
        minimum: "0",
        maximum: "100",
      },
      { stateKey: "wealth", label: "Wealth", unit: "index-point", minimum: "0", maximum: "100" },
    ],
    agentTypes: [
      {
        agentTypeKey: "household",
        label: "Representative household",
        behaviorDescription:
          "Moves bounded balances according to the explicit registered equations.",
      },
    ],
    populations: [
      {
        populationKey: "households",
        agentTypeKey: "household",
        agentCount: 1_000,
        initialState: { liquidity: "40", wealth: "60" },
      },
    ],
    parameterContracts: [
      {
        parameterKey: "bias",
        label: "Observed transfer bias",
        unit: "index-point",
        minimum: "-1",
        maximum: "1",
      },
      {
        parameterKey: "friction",
        label: "Structural friction term",
        unit: "index-point",
        minimum: "-1",
        maximum: "1",
      },
    ],
    transitionEquations: [
      {
        targetStateKey: "liquidity",
        outputUnit: "index-point",
        intercept: "0",
        persistenceCoefficient: "0.9",
        influences: [
          {
            sourceStateKey: "wealth",
            coefficient: "0.1",
            coefficientUnit: "index-point/index-point",
          },
        ],
        parameterTerms: [
          { parameterKey: "bias", coefficient: "-1", coefficientUnit: "index-point/index-point" },
          {
            parameterKey: "friction",
            coefficient: "-1",
            coefficientUnit: "index-point/index-point",
          },
        ],
      },
      {
        targetStateKey: "wealth",
        outputUnit: "index-point",
        intercept: "0",
        persistenceCoefficient: "0.9",
        influences: [
          {
            sourceStateKey: "liquidity",
            coefficient: "0.1",
            coefficientUnit: "index-point/index-point",
          },
        ],
        parameterTerms: [
          { parameterKey: "bias", coefficient: "1", coefficientUnit: "index-point/index-point" },
          {
            parameterKey: "friction",
            coefficient: "1",
            coefficientUnit: "index-point/index-point",
          },
        ],
      },
    ],
    conservationInvariants: [
      {
        invariantKey: "total-balance",
        description: "The two modeled balances sum to one hundred in the baseline equations.",
        weightedStateKeys: [
          { stateKey: "liquidity", weight: "1" },
          { stateKey: "wealth", weight: "1" },
        ],
        expectedTotal: "100",
        tolerance: "0.000000001",
      },
    ],
    claims: [
      {
        claimKey: "equation-description",
        kind: "descriptive",
        text: "The registered equations transfer modeled balance between the two declared stocks.",
        reviewedEvidenceIds: [],
      },
    ],
    usageBoundary: {
      researchOnly: true,
      scenarioNotForecast: true,
      notPolicyAdvice: true,
      notCausalEstimate: true,
    },
    limitations: [
      "This small structural example omits heterogeneous behavior and empirical validation.",
    ],
  };
}

export function calibrationInput(definition: SystemDefinition): CalibrationManifestInput {
  return {
    schemaVersion: 1,
    calibrationId: IDS.calibration,
    systemId: definition.systemId,
    systemVersion: definition.systemVersion,
    systemDefinitionSha256: definition.manifestSha256,
    calibratedAsOf: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-02T00:00:00Z",
    trainingDataCutoff: "2025-12-01T00:00:00Z",
    modelSha256: "a".repeat(64),
    codeSha256: "b".repeat(64),
    configurationSha256: "c".repeat(64),
    observedEvidence: [
      {
        evidenceId: IDS.evidence,
        datasetSnapshotId: IDS.dataset,
        datasetSnapshotSha256: "d".repeat(64),
        observedAt: "2025-11-01T00:00:00Z",
        availableAt: "2025-12-15T00:00:00Z",
        sourceDescription:
          "Reviewed synthetic fixture for mechanical verification; not an empirical claim.",
        reviewStatus: "reviewed",
        reviewedBy: IDS.reviewer,
        reviewedAt: "2026-01-01T12:00:00Z",
      },
    ],
    structuralAssumptions: [
      {
        assumptionKey: "friction-form",
        statement: "The example represents friction as a constant additive term.",
        rationale: "A deliberately simple form makes the executable mechanics auditable.",
        sensitivityRequired: true,
      },
    ],
    parameterValues: [
      {
        parameterKey: "bias",
        value: "0",
        uncertainty: { kind: "uniform", lower: "-0.2", upper: "0.2" },
        basis: { kind: "observed_evidence", evidenceIds: [IDS.evidence] },
      },
      {
        parameterKey: "friction",
        value: "0",
        uncertainty: { kind: "fixed" },
        basis: { kind: "structural_assumption", assumptionKeys: ["friction-form"] },
      },
    ],
  };
}

export function baselineWorld(definition: SystemDefinition): SimulationWorld {
  return createSimulationWorld(
    {
      schemaVersion: 1,
      worldId: IDS.world,
      systemId: definition.systemId,
      systemVersion: definition.systemVersion,
      systemDefinitionSha256: definition.manifestSha256,
      asOf: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-02T00:00:00Z",
      label: "Point-in-time baseline",
      worldKind: "observed_baseline",
      canonicalDatasetEligible: true,
      inputDatasetSnapshotSha256: "d".repeat(64),
      interventions: [],
      shocks: [],
    },
    definition,
  );
}

export function scenarioWorld(definition: SystemDefinition): SimulationWorld {
  return createSimulationWorld(
    {
      schemaVersion: 1,
      worldId: IDS.scenario,
      systemId: definition.systemId,
      systemVersion: definition.systemVersion,
      systemDefinitionSha256: definition.manifestSha256,
      asOf: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-02T00:00:00Z",
      label: "Explicit non-observed stress scenario",
      worldKind: "scenario_counterfactual",
      canonicalDatasetEligible: false,
      inputDatasetSnapshotSha256: "d".repeat(64),
      baselineWorldId: IDS.world,
      scenarioAuthoredBy: IDS.author,
      notObservedFact: true,
      interventions: [
        {
          interventionKey: "liquidity-support",
          populationKey: "households",
          stateKey: "liquidity",
          startStep: 2,
          endStep: 3,
          mode: "additive_shift",
          value: "2",
          rationale: "Mechanically tests a bounded temporary scenario action.",
        },
      ],
      shocks: [
        {
          shockKey: "wealth-loss",
          populationKey: "households",
          stateKey: "wealth",
          atStep: 1,
          additiveDelta: "-3",
          rationale: "Mechanically tests an explicit one-time exogenous shock.",
        },
      ],
    },
    definition,
  );
}

export function planInput(
  definition: SystemDefinition,
  calibration: CalibrationManifest,
  world: SimulationWorld,
): SimulationRunPlanInput {
  return {
    schemaVersion: 1,
    runId: IDS.run,
    createdAt: "2026-01-03T00:00:00Z",
    systemDefinitionSha256: definition.manifestSha256,
    calibrationManifestSha256: calibration.manifestSha256,
    worldSha256: world.manifestSha256,
    seed: "123456789",
    steps: 20,
    ensembleSize: 16,
    checkpointEveryMembers: 4,
    outputStateKeys: ["wealth", "liquidity"],
    inputUncertainty: [],
    sensitivityParameterKeys: ["friction"],
    numericalTolerance: "0.000000001",
    convergence: { windowSteps: 3, tolerance: "1" },
    equilibriumTolerance: "1",
    resourceBudget: { maxStateUpdates: 1_000, maxOutputCells: 10 },
  };
}

export function completeFixture(): {
  definition: SystemDefinition;
  calibration: CalibrationManifest;
  world: SimulationWorld;
  plan: SimulationRunPlan;
} {
  const definition = createSystemDefinition(definitionInput());
  const calibration = createCalibrationManifest(calibrationInput(definition), definition);
  const world = baselineWorld(definition);
  const plan = createSimulationRunPlan(
    planInput(definition, calibration, world),
    definition,
    calibration,
    world,
  );
  return { definition, calibration, world, plan };
}
