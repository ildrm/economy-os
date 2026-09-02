import { describe, expect, it } from "vitest";

import {
  createCrisisEpisodeDeclaration,
  createEventClusterId,
  evaluateHazardAlerts,
  type HazardAlertPolicy,
} from "./index.js";

const geographyId = "058f47ac-19fc-7c92-ae91-0242ac120001";

describe("reusable FX-CPM event and alert contracts", () => {
  it("creates deterministic dated event-cluster identity and immutable episode declarations", () => {
    const eventClusterId = createEventClusterId({
      geographyId,
      hazard: "FX",
      onsetAt: "2025-04-01T00:00:00Z",
      episodeDefinitionVersion: "1.0.0",
    });
    expect(eventClusterId).toBe(
      createEventClusterId({
        geographyId,
        hazard: "FX",
        onsetAt: "2025-04-01T00:00:00Z",
        episodeDefinitionVersion: "1.0.0",
      }),
    );
    const declaration = createCrisisEpisodeDeclaration({
      schemaVersion: 1,
      episodeId: "058f47ac-19fc-7c92-ae91-0242ac120010",
      eventClusterId,
      geographyId,
      hazard: "FX",
      onsetAt: "2025-04-01T00:00:00Z",
      endedAt: "2025-04-30T00:00:00Z",
      declaredAt: "2025-05-10T00:00:00Z",
      episodeDefinitionVersion: "1.0.0",
      evidenceSha256: "a".repeat(64),
      codeSha256: "b".repeat(64),
      configurationSha256: "c".repeat(64),
      assumptions: ["Episode timing uses the declared FX pressure rule."],
    });
    expect(declaration.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(declaration)).toBe(true);
  });

  it("rejects forged cluster identity and impossible episode dates", () => {
    const base = {
      schemaVersion: 1 as const,
      episodeId: "058f47ac-19fc-7c92-ae91-0242ac120010",
      eventClusterId: createEventClusterId({
        geographyId,
        hazard: "FX",
        onsetAt: "2025-04-01T00:00:00Z",
        episodeDefinitionVersion: "1.0.0",
      }),
      geographyId,
      hazard: "FX" as const,
      onsetAt: "2025-04-01T00:00:00Z",
      endedAt: "2025-04-30T00:00:00Z",
      declaredAt: "2025-05-10T00:00:00Z",
      episodeDefinitionVersion: "1.0.0",
      evidenceSha256: "a".repeat(64),
      codeSha256: "b".repeat(64),
      configurationSha256: "c".repeat(64),
      assumptions: ["Episode timing uses the declared FX pressure rule."],
    };
    expect(() =>
      createCrisisEpisodeDeclaration({ ...base, eventClusterId: base.episodeId }),
    ).toThrow("does not bind the dated episode identity");
    expect(() =>
      createCrisisEpisodeDeclaration({ ...base, endedAt: "2025-03-31T00:00:00Z" }),
    ).toThrow("endedAt cannot precede onsetAt");
    expect(() =>
      createCrisisEpisodeDeclaration({ ...base, declaredAt: "2025-03-31T00:00:00Z" }),
    ).toThrow("declaredAt cannot precede onsetAt");
    expect(() => createCrisisEpisodeDeclaration({ ...base, assumptions: [] })).toThrow(
      "assumptions must not be empty",
    );
  });

  it("uses consecutive entry and exit hysteresis with evidence gates", () => {
    const policy: HazardAlertPolicy = {
      schemaVersion: 1,
      hazard: "FX",
      methodologyScope: "research_baseline",
      entryProbability: "0.7",
      exitProbability: "0.5",
      warningProbability: "0.8",
      criticalProbability: "0.9",
      entryConsecutiveObservations: 2,
      exitConsecutiveObservations: 2,
      minimumEvidenceItems: 2,
      uncalibratedSeverityCeiling: "watch",
    };
    const timeline = evaluateHazardAlerts(policy, [
      {
        observedAt: "2026-01-01T00:00:00Z",
        probability: "0.75",
        calibrated: true,
        evidenceItemCount: 2,
        outOfDomain: false,
      },
      {
        observedAt: "2026-01-02T00:00:00Z",
        probability: "0.85",
        calibrated: true,
        evidenceItemCount: 2,
        outOfDomain: false,
      },
      {
        observedAt: "2026-01-03T00:00:00Z",
        probability: "0.45",
        calibrated: true,
        evidenceItemCount: 2,
        outOfDomain: false,
      },
      {
        observedAt: "2026-01-04T00:00:00Z",
        probability: "0.4",
        calibrated: true,
        evidenceItemCount: 2,
        outOfDomain: false,
      },
    ]);
    expect(timeline.points.map(({ state, severity }) => [state, severity])).toEqual([
      ["inactive", "none"],
      ["active", "warning"],
      ["active", "watch"],
      ["inactive", "none"],
    ]);
  });

  it("blocks out-of-domain or under-evidenced entry and caps uncalibrated severity", () => {
    const policy: HazardAlertPolicy = {
      schemaVersion: 1,
      hazard: "FX",
      methodologyScope: "research_baseline",
      entryProbability: "0.7",
      exitProbability: "0.5",
      warningProbability: "0.8",
      criticalProbability: "0.9",
      entryConsecutiveObservations: 1,
      exitConsecutiveObservations: 1,
      minimumEvidenceItems: 2,
      uncalibratedSeverityCeiling: "watch",
    };
    const timeline = evaluateHazardAlerts(policy, [
      {
        observedAt: "2026-01-01T00:00:00Z",
        probability: "0.99",
        calibrated: true,
        evidenceItemCount: 2,
        outOfDomain: true,
      },
      {
        observedAt: "2026-01-02T00:00:00Z",
        probability: "0.99",
        calibrated: true,
        evidenceItemCount: 1,
        outOfDomain: false,
      },
      {
        observedAt: "2026-01-03T00:00:00Z",
        probability: "0.99",
        calibrated: false,
        evidenceItemCount: 2,
        outOfDomain: false,
      },
    ]);
    expect(
      timeline.points.map(({ state, severity, gateReason }) => [state, severity, gateReason]),
    ).toEqual([
      ["suppressed", "none", "out_of_domain"],
      ["suppressed", "none", "insufficient_evidence"],
      ["active", "watch", "uncalibrated_severity_ceiling"],
    ]);
  });

  it("rejects unordered observations and invalid hysteresis thresholds", () => {
    const policy: HazardAlertPolicy = {
      schemaVersion: 1,
      hazard: "FX",
      methodologyScope: "research_baseline",
      entryProbability: "0.7",
      exitProbability: "0.5",
      warningProbability: "0.8",
      criticalProbability: "0.9",
      entryConsecutiveObservations: 1,
      exitConsecutiveObservations: 1,
      minimumEvidenceItems: 1,
      uncalibratedSeverityCeiling: "warning",
    };
    expect(() => evaluateHazardAlerts({ ...policy, exitProbability: "0.8" }, [])).toThrow(
      "exitProbability must be below entryProbability",
    );
    expect(() => evaluateHazardAlerts({ ...policy, warningProbability: "0.6" }, [])).toThrow(
      "must be ordered",
    );
    expect(() =>
      evaluateHazardAlerts(
        { ...policy, methodologyScope: "production" as "research_baseline" },
        [],
      ),
    ).toThrow("research_baseline");
    expect(() =>
      evaluateHazardAlerts(policy, [
        {
          observedAt: "2026-01-01T00:00:00Z",
          probability: "0.8",
          calibrated: true,
          evidenceItemCount: -1,
          outOfDomain: false,
        },
      ]),
    ).toThrow("non-negative integer");
    expect(() =>
      evaluateHazardAlerts(policy, [
        {
          observedAt: "2026-01-02T00:00:00Z",
          probability: "0.8",
          calibrated: true,
          evidenceItemCount: 2,
          outOfDomain: false,
        },
        {
          observedAt: "2026-01-01T00:00:00Z",
          probability: "0.8",
          calibrated: true,
          evidenceItemCount: 2,
          outOfDomain: false,
        },
      ]),
    ).toThrow("strictly chronological");
  });

  it("rejects non-boolean alert gate flags at runtime", () => {
    const policy: HazardAlertPolicy = {
      schemaVersion: 1,
      hazard: "FX",
      methodologyScope: "research_baseline",
      entryProbability: "0.7",
      exitProbability: "0.5",
      warningProbability: "0.8",
      criticalProbability: "0.9",
      entryConsecutiveObservations: 1,
      exitConsecutiveObservations: 1,
      minimumEvidenceItems: 1,
      uncalibratedSeverityCeiling: "warning",
    };
    const observation = {
      observedAt: "2026-01-01T00:00:00Z",
      probability: "0.8",
      calibrated: true,
      evidenceItemCount: 2,
      outOfDomain: false,
    };
    expect(() =>
      evaluateHazardAlerts(policy, [{ ...observation, calibrated: "false" as unknown as boolean }]),
    ).toThrow("calibrated must be a boolean");
    expect(() =>
      evaluateHazardAlerts(policy, [
        { ...observation, outOfDomain: "false" as unknown as boolean },
      ]),
    ).toThrow("outOfDomain must be a boolean");
  });
});
