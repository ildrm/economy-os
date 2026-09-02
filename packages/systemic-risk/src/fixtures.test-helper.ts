import type {
  ExposureNetworkSnapshotInput,
  StressPropagationInput,
  TransmissionRule,
} from "./index.js";

export const id = (suffix: number): string =>
  `00000000-0000-8000-8000-${suffix.toString().padStart(12, "0")}`;
export const A = "a".repeat(64);
export const B = "b".repeat(64);

export function snapshotInput(): ExposureNetworkSnapshotInput {
  return {
    schemaVersion: 1,
    snapshotId: id(1),
    tenantId: id(2),
    modelVersion: "systemic-risk-0.1.0",
    asOf: "2025-01-31T00:00:00Z",
    createdAt: "2025-02-01T00:00:00Z",
    sources: [
      {
        sourceId: id(3),
        datasetSnapshotId: id(4),
        datasetSnapshotSha256: A,
        availableAt: "2025-01-30T00:00:00Z",
        licenseKey: "licensed-research",
        citation: "Frozen exposure release, table 1.",
      },
      {
        sourceId: id(5),
        datasetSnapshotId: id(6),
        datasetSnapshotSha256: B,
        availableAt: "2025-01-29T00:00:00Z",
        licenseKey: "public-domain",
        citation: "Frozen trade release, table 2.",
      },
    ],
    nodes: [
      {
        nodeId: id(10),
        entityKey: "country.alpha",
        kind: "country",
        label: "Alpha",
        jurisdictionKey: "alpha",
        sectorKey: null,
      },
      {
        nodeId: id(11),
        entityKey: "country.beta",
        kind: "country",
        label: "Beta",
        jurisdictionKey: "beta",
        sectorKey: null,
      },
      {
        nodeId: id(12),
        entityKey: "sector.gamma-energy",
        kind: "sector",
        label: "Gamma energy",
        jurisdictionKey: "gamma",
        sectorKey: "energy",
      },
    ],
    edges: [
      {
        edgeId: id(20),
        sourceNodeId: id(10),
        targetNodeId: id(11),
        kind: "bank_claim",
        measurementClass: "observed",
        grossAmount: "100",
        currencyKey: "usd",
        normalizedExposure: "0.4",
        confidence: "0.9",
        sourceId: id(3),
        observedAt: "2025-01-28T00:00:00Z",
        availableAt: "2025-01-30T00:00:00Z",
        caveat: null,
      },
      {
        edgeId: id(21),
        sourceNodeId: id(11),
        targetNodeId: id(12),
        kind: "trade",
        measurementClass: "reported_estimate",
        grossAmount: "60",
        currencyKey: "usd",
        normalizedExposure: "0.3",
        confidence: "0.7",
        sourceId: id(5),
        observedAt: "2025-01-25T00:00:00Z",
        availableAt: "2025-01-29T00:00:00Z",
        caveat: "Mirror statistics fill one reporting gap.",
      },
      {
        edgeId: id(22),
        sourceNodeId: id(10),
        targetNodeId: id(12),
        kind: "trade",
        measurementClass: "observed",
        grossAmount: "40",
        currencyKey: "usd",
        normalizedExposure: "0.2",
        confidence: "0.8",
        sourceId: id(5),
        observedAt: "2025-01-25T00:00:00Z",
        availableAt: "2025-01-29T00:00:00Z",
        caveat: null,
      },
    ],
    coverage: [
      {
        coverageId: id(30),
        exposureKind: "bank_claim",
        jurisdictionKey: null,
        status: "complete",
        amountCoverageRatio: "1",
        observedCounterparties: 2,
        expectedCounterparties: 2,
        disclosureLagDays: 2,
        missingExposureTreatment: "none",
        caveat: "Complete only for the declared regulated-bank universe.",
      },
      {
        coverageId: id(31),
        exposureKind: "trade",
        jurisdictionKey: null,
        status: "partial",
        amountCoverageRatio: "0.8",
        observedCounterparties: 2,
        expectedCounterparties: 3,
        disclosureLagDays: 6,
        missingExposureTreatment: "bounded_sensitivity",
        caveat: "One expected reporting counterparty is missing.",
      },
    ],
    assumptions: ["Directed exposure transmits stress from source to target."],
    prohibitedClaims: ["Do not describe network stress indices as event probabilities."],
  };
}

export function rules(coefficientScale = 1): readonly TransmissionRule[] {
  const scaled = (value: number): string => String(Number((value * coefficientScale).toFixed(12)));
  return [
    {
      exposureKind: "bank_claim",
      coefficient: scaled(0.5),
      rationale: "Scenario loss transmission coefficient.",
    },
    {
      exposureKind: "trade",
      coefficient: scaled(0.4),
      rationale: "Scenario trade disruption coefficient.",
    },
  ];
}

export function stressInput(runSuffix = 40, coefficientScale = 1): StressPropagationInput {
  return {
    schemaVersion: 1,
    runId: id(runSuffix),
    snapshotId: id(1),
    snapshotSha256: "snapshot-digest-replaced-by-test",
    issuedAt: "2025-02-01T01:00:00Z",
    outputSemantics: "scenario_stress_index",
    shocks: [
      {
        shockId: id(41),
        nodeId: id(10),
        channel: "solvency",
        severity: "0.5",
        rationale: "Explicit hypothetical shock for sensitivity analysis.",
      },
    ],
    transmissionRules: rules(coefficientScale),
    missingExposureMultiplier: "1",
    maximumRounds: 10,
    convergenceTolerance: "0.000001",
    assumptions: ["This is a scenario calculation, not a forecast."],
  };
}

export type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[K] extends object
      ? Mutable<T[K]>
      : T[K];
};

export function mutable<T>(value: T): Mutable<T> {
  return structuredClone(value) as Mutable<T>;
}

export function mustAt<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new TypeError(`fixture index ${index} is unavailable`);
  return value;
}
