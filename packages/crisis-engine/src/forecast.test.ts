import { describe, expect, it } from "vitest";

import {
  CRISIS_HAZARDS,
  CRISIS_HORIZONS,
  type CrisisForecastInput,
  createCrisisForecast,
  createCrisisForecastRun,
} from "./index.js";

const IDS = {
  geography: "058f47ac-19fc-7c92-ae91-0242ac120001",
  model: "058f47ac-19fc-7c92-ae91-0242ac120002",
  vintage: "058f47ac-19fc-7c92-ae91-0242ac120003",
  evidence: "058f47ac-19fc-7c92-ae91-0242ac120004",
} as const;

function input(
  hazard: (typeof CRISIS_HAZARDS)[number] = "FX",
  horizon: (typeof CRISIS_HORIZONS)[number] = CRISIS_HORIZONS[0],
): CrisisForecastInput {
  const hazardSequence = CRISIS_HAZARDS.indexOf(hazard) + 1;
  return {
    schemaVersion: 1,
    forecastId: `058f47ac-19fc-7c92-ae91-${hazardSequence.toString().padStart(12, "0")}`,
    geographyId: IDS.geography,
    hazard,
    horizon,
    generatedAt: "2026-01-02T00:00:00Z",
    asOf: "2026-01-01T00:00:00Z",
    rawProbability: "0.31",
    calibratedProbability: "0.27",
    uncertainty: {
      lowerProbability: "0.19",
      upperProbability: "0.38",
      confidenceLevel: "0.9",
      method: "chronological-bootstrap",
    },
    evidence: {
      items: [
        {
          evidenceId: IDS.evidence,
          indicatorKey: "fx.reserve-adequacy",
          direction: "increases_risk",
          valueAsKnown: "2.4",
          observedAt: "2025-12-01T00:00:00Z",
          availableAt: "2025-12-20T00:00:00Z",
          dataVintageId: IDS.vintage,
          evidenceSha256: "a".repeat(64),
        },
      ],
      absenceReason: null,
    },
    counterEvidence: {
      items: [],
      absenceReason: "No qualifying counter-signal was available at the as-of time.",
    },
    leadingIndicators: ["fx.reserve-adequacy", "fx.real-effective-exchange-rate"],
    provenance: {
      modelId: IDS.model,
      modelVersion: "1.2.0",
      dataVintageId: IDS.vintage,
      dataVintageSha256: "b".repeat(64),
      dataVintageAvailableAt: "2025-12-20T00:00:00Z",
      configurationSha256: "c".repeat(64),
      codeSha256: "d".repeat(64),
      trainingDataCutoff: "2025-06-30T00:00:00Z",
      calibratedThrough: "2025-09-30T00:00:00Z",
    },
    assumptions: ["Published reserve data is comparable within the declared vintage."],
    invalidationCriteria: [
      {
        criterionId: "reserve-recovery",
        description: "Reserve adequacy remains above four months for two releases.",
        indicatorKey: "fx.reserve-adequacy",
        operator: "greater_than",
        threshold: "4",
        requiredObservations: 2,
      },
    ],
  };
}

describe("independent crisis forecasts", () => {
  it("publishes exactly eight hazard identities and explicit canonical horizons", () => {
    expect(CRISIS_HAZARDS).toEqual(["FX", "BANK", "SOV", "MON", "POL", "COUP", "CIV", "WAR"]);
    expect(CRISIS_HORIZONS).toEqual([
      { key: "30d", days: 30 },
      { key: "90d", days: 90 },
      { key: "180d", days: 180 },
      { key: "365d", days: 365 },
    ]);
  });

  it("preserves exact raw and calibrated probabilities with mandatory uncertainty and explanation", () => {
    const forecast = createCrisisForecast(input());
    expect(forecast).toMatchObject({
      hazard: "FX",
      rawProbability: "0.31",
      calibratedProbability: "0.27",
      uncertainty: { lowerProbability: "0.19", upperProbability: "0.38" },
      counterEvidence: {
        items: [],
        absenceReason: "No qualifying counter-signal was available at the as-of time.",
      },
    });
    expect(forecast.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(forecast)).toBe(true);
    expect(Object.isFrozen(forecast.evidence.items)).toBe(true);
  });

  it("accepts canonical UTC instants with RFC 3339 fractional seconds", () => {
    const forecast = createCrisisForecast({
      ...input(),
      asOf: "2026-01-01T00:00:00.1Z",
      generatedAt: "2026-01-01T00:00:00.12Z",
    });
    expect(forecast.asOf).toBe("2026-01-01T00:00:00.1Z");
    expect(forecast.generatedAt).toBe("2026-01-01T00:00:00.12Z");
  });

  it("rejects future evidence and model/data leakage at the as-of boundary", () => {
    const evidence = input().evidence.items.at(0);
    expect(evidence).toBeDefined();
    if (evidence === undefined) return;
    expect(() =>
      createCrisisForecast({
        ...input(),
        evidence: {
          items: [
            {
              ...evidence,
              availableAt: "2026-01-01T00:00:01Z",
            },
          ],
          absenceReason: null,
        },
      }),
    ).toThrow("available after forecast.asOf");
    expect(() =>
      createCrisisForecast({
        ...input(),
        provenance: { ...input().provenance, calibratedThrough: "2026-01-02T00:00:00Z" },
      }),
    ).toThrow("calibratedThrough cannot be after forecast.asOf");
  });

  it("rejects inexact probabilities, missing explanations, and disguised aggregate hazards", () => {
    expect(() => createCrisisForecast({ ...input(), rawProbability: "0.310" })).toThrow(
      "rawProbability must be a canonical probability",
    );
    expect(() =>
      createCrisisForecast({
        ...input(),
        counterEvidence: { items: [], absenceReason: null },
      }),
    ).toThrow("counterEvidence must contain items or an explicit absence reason");
    expect(() => createCrisisForecast({ ...input(), hazard: "aggregate" as "FX" })).toThrow(
      "hazard must be one of the eight independent hazards",
    );
  });

  it("rejects temporally inconsistent evidence and incomplete model governance", () => {
    const base = input();
    const evidence = base.evidence.items.at(0);
    expect(evidence).toBeDefined();
    if (evidence === undefined) return;
    expect(() => createCrisisForecast({ ...base, generatedAt: "2025-12-31T23:59:59Z" })).toThrow(
      "generatedAt cannot be before forecast.asOf",
    );
    expect(() =>
      createCrisisForecast({
        ...base,
        evidence: {
          items: [{ ...evidence, availableAt: "2025-11-30T00:00:00Z" }],
          absenceReason: null,
        },
      }),
    ).toThrow("cannot be available before it was observed");
    expect(() =>
      createCrisisForecast({
        ...base,
        evidence: { items: [evidence, evidence], absenceReason: null },
      }),
    ).toThrow("duplicate evidenceId");
    expect(() =>
      createCrisisForecast({
        ...base,
        evidence: { ...base.evidence, absenceReason: "Contradictory declaration." },
      }),
    ).toThrow("absenceReason must be null when items are present");
    expect(() =>
      createCrisisForecast({
        ...base,
        uncertainty: { ...base.uncertainty, lowerProbability: "0.28" },
      }),
    ).toThrow("inside its uncertainty interval");
    expect(() =>
      createCrisisForecast({
        ...base,
        leadingIndicators: ["fx.reserve-adequacy", "fx.reserve-adequacy"],
      }),
    ).toThrow("leadingIndicators must be unique");
    expect(() =>
      createCrisisForecast({
        ...base,
        provenance: { ...base.provenance, trainingDataCutoff: "2025-10-01T00:00:00Z" },
      }),
    ).toThrow("trainingDataCutoff cannot be after calibratedThrough");
    expect(() =>
      createCrisisForecast({
        ...base,
        provenance: {
          ...base.provenance,
          dataVintageAvailableAt: "2026-01-01T00:00:01Z",
        } as unknown as typeof base.provenance,
      }),
    ).toThrow("dataVintageAvailableAt cannot be after forecast.asOf");
    expect(() => createCrisisForecast({ ...base, assumptions: [] })).toThrow(
      "assumptions must not be empty",
    );
    expect(() => createCrisisForecast({ ...base, invalidationCriteria: [] })).toThrow(
      "invalidationCriteria must not be empty",
    );
    expect(() =>
      createCrisisForecast({
        ...base,
        horizon: { key: "7d", days: 7 } as unknown as typeof base.horizon,
      }),
    ).toThrow("explicit canonical horizons");
  });

  it("rejects contradictory evidence identity, foreign vintages, and invalid runtime enums", () => {
    const base = input();
    const evidence = base.evidence.items.at(0);
    const criterion = base.invalidationCriteria.at(0);
    expect(evidence).toBeDefined();
    expect(criterion).toBeDefined();
    if (evidence === undefined || criterion === undefined) return;
    expect(() =>
      createCrisisForecast({
        ...base,
        counterEvidence: {
          items: [{ ...evidence, direction: "decreases_risk" }],
          absenceReason: null,
        },
      }),
    ).toThrow("same evidenceId cannot appear in evidence and counterEvidence");
    expect(() =>
      createCrisisForecast({
        ...base,
        evidence: {
          items: [
            {
              ...evidence,
              dataVintageId: "058f47ac-19fc-7c92-ae91-0242ac120099",
            },
          ],
          absenceReason: null,
        },
      }),
    ).toThrow("must match provenance.dataVintageId");
    expect(() =>
      createCrisisForecast({
        ...base,
        evidence: {
          items: [
            {
              ...evidence,
              direction: "neutral" as typeof evidence.direction,
            },
          ],
          absenceReason: null,
        },
      }),
    ).toThrow("direction must increase or decrease risk");
    expect(() =>
      createCrisisForecast({
        ...base,
        invalidationCriteria: [
          {
            ...criterion,
            operator: "approximately" as "equals",
          },
        ],
      }),
    ).toThrow("invalidation operator is invalid");
  });

  it("requires every independent hazard at every horizon in a complete run", () => {
    let sequence = 0;
    const forecasts = CRISIS_HAZARDS.flatMap((hazard) =>
      CRISIS_HORIZONS.map((horizon) => {
        sequence += 1;
        return createCrisisForecast({
          ...input(hazard, horizon),
          forecastId: `058f47ac-19fc-7c92-ae91-${sequence.toString().padStart(12, "0")}`,
        });
      }),
    );
    const run = createCrisisForecastRun({
      schemaVersion: 1,
      runId: "058f47ac-19fc-7c92-ae91-0242ac120099",
      generatedAt: "2026-01-02T00:00:00Z",
      asOf: "2026-01-01T00:00:00Z",
      geographyId: IDS.geography,
      forecasts,
    });
    expect(run.forecasts).toHaveLength(32);
    expect(run.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(() => createCrisisForecastRun({ ...run, forecasts: forecasts.slice(1) })).toThrow(
      "exactly one forecast for each hazard and horizon",
    );
  });
});
