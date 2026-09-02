import type { CrisisHazard } from "./forecast.js";
import { CRISIS_HAZARDS } from "./forecast.js";
import {
  assertIsoInstant,
  assertNonBlank,
  assertPositiveInteger,
  assertProbability,
  assertSemver,
  assertSha256,
  assertUuid,
  cloneCanonical,
  compareInstant,
  compareProbability,
  deepFreeze,
  deterministicUuid,
  digestJson,
} from "./internals.js";

export interface EventClusterIdentityInput {
  readonly geographyId: string;
  readonly hazard: CrisisHazard;
  readonly onsetAt: string;
  readonly episodeDefinitionVersion: string;
}

function assertHazard(value: string): asserts value is CrisisHazard {
  if (!(CRISIS_HAZARDS as readonly string[]).includes(value)) {
    throw new TypeError("hazard must be one of the eight independent hazards");
  }
}

export function createEventClusterId(input: EventClusterIdentityInput): string {
  assertUuid(input.geographyId, "eventCluster.geographyId");
  assertHazard(input.hazard);
  assertIsoInstant(input.onsetAt, "eventCluster.onsetAt");
  assertSemver(input.episodeDefinitionVersion, "eventCluster.episodeDefinitionVersion");
  return deterministicUuid(
    "economyos:crisis-event-cluster:v1",
    input.geographyId,
    input.hazard,
    input.onsetAt,
    input.episodeDefinitionVersion,
  );
}

export interface CrisisEpisodeDeclarationInput extends EventClusterIdentityInput {
  readonly schemaVersion: 1;
  readonly episodeId: string;
  readonly eventClusterId: string;
  readonly endedAt: string | null;
  readonly declaredAt: string;
  readonly evidenceSha256: string;
  readonly codeSha256: string;
  readonly configurationSha256: string;
  readonly assumptions: readonly string[];
}

export interface CrisisEpisodeDeclaration extends CrisisEpisodeDeclarationInput {
  readonly manifestSha256: string;
}

export function createCrisisEpisodeDeclaration(
  input: CrisisEpisodeDeclarationInput,
): Readonly<CrisisEpisodeDeclaration> {
  if (input.schemaVersion !== 1) throw new TypeError("episode.schemaVersion must be 1");
  assertUuid(input.episodeId, "episodeId");
  assertUuid(input.eventClusterId, "eventClusterId");
  const expectedClusterId = createEventClusterId(input);
  if (input.eventClusterId !== expectedClusterId) {
    throw new TypeError("eventClusterId does not bind the dated episode identity");
  }
  assertIsoInstant(input.declaredAt, "episode.declaredAt");
  if (input.endedAt !== null) {
    assertIsoInstant(input.endedAt, "episode.endedAt");
    if (compareInstant(input.endedAt, input.onsetAt) < 0) {
      throw new TypeError("episode.endedAt cannot precede onsetAt");
    }
  }
  if (compareInstant(input.declaredAt, input.onsetAt) < 0) {
    throw new TypeError("episode.declaredAt cannot precede onsetAt");
  }
  assertSha256(input.evidenceSha256, "episode.evidenceSha256");
  assertSha256(input.codeSha256, "episode.codeSha256");
  assertSha256(input.configurationSha256, "episode.configurationSha256");
  if (input.assumptions.length === 0) throw new TypeError("episode.assumptions must not be empty");
  for (const assumption of input.assumptions) assertNonBlank(assumption, "episode assumption");
  const body = cloneCanonical(input);
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export type AlertSeverity = "none" | "watch" | "warning" | "critical";
export type ActiveAlertSeverity = Exclude<AlertSeverity, "none">;

export interface HazardAlertPolicy {
  readonly schemaVersion: 1;
  readonly hazard: CrisisHazard;
  /** Baselines are never represented as production-approved artifacts. */
  readonly methodologyScope: "research_baseline";
  readonly entryProbability: string;
  readonly exitProbability: string;
  readonly warningProbability: string;
  readonly criticalProbability: string;
  readonly entryConsecutiveObservations: number;
  readonly exitConsecutiveObservations: number;
  readonly minimumEvidenceItems: number;
  readonly uncalibratedSeverityCeiling: "watch" | "warning";
}

export interface HazardAlertObservation {
  readonly observedAt: string;
  readonly probability: string;
  readonly calibrated: boolean;
  readonly evidenceItemCount: number;
  readonly outOfDomain: boolean;
}

export type AlertGateReason =
  | "out_of_domain"
  | "insufficient_evidence"
  | "uncalibrated_severity_ceiling";

export interface HazardAlertPoint extends HazardAlertObservation {
  readonly state: "inactive" | "active" | "suppressed";
  readonly severity: AlertSeverity;
  readonly gateReason: AlertGateReason | null;
  readonly transition: "none" | "entered" | "exited" | "suppressed";
  readonly entryStreak: number;
  readonly exitStreak: number;
}

export interface HazardAlertTimeline {
  readonly schemaVersion: 1;
  readonly hazard: CrisisHazard;
  readonly methodologyScope: "research_baseline";
  readonly policySha256: string;
  readonly points: readonly HazardAlertPoint[];
  readonly manifestSha256: string;
}

function validateAlertPolicy(policy: HazardAlertPolicy): void {
  if (policy.schemaVersion !== 1) throw new TypeError("alert policy schemaVersion must be 1");
  assertHazard(policy.hazard);
  if (policy.methodologyScope !== "research_baseline") {
    throw new TypeError("alert policy must identify itself as a research_baseline");
  }
  for (const [field, probability] of [
    ["entryProbability", policy.entryProbability],
    ["exitProbability", policy.exitProbability],
    ["warningProbability", policy.warningProbability],
    ["criticalProbability", policy.criticalProbability],
  ] as const) {
    assertProbability(probability, field);
  }
  if (compareProbability(policy.exitProbability, policy.entryProbability) >= 0) {
    throw new TypeError("exitProbability must be below entryProbability");
  }
  if (
    compareProbability(policy.entryProbability, policy.warningProbability) > 0 ||
    compareProbability(policy.warningProbability, policy.criticalProbability) > 0
  ) {
    throw new TypeError("entry, warning, and critical probabilities must be ordered");
  }
  assertPositiveInteger(policy.entryConsecutiveObservations, "entryConsecutiveObservations");
  assertPositiveInteger(policy.exitConsecutiveObservations, "exitConsecutiveObservations");
  assertPositiveInteger(policy.minimumEvidenceItems, "minimumEvidenceItems");
  if (
    policy.uncalibratedSeverityCeiling !== "watch" &&
    policy.uncalibratedSeverityCeiling !== "warning"
  ) {
    throw new TypeError("uncalibratedSeverityCeiling must be watch or warning");
  }
}

function severityFor(policy: HazardAlertPolicy, probability: string): ActiveAlertSeverity {
  if (compareProbability(probability, policy.criticalProbability) >= 0) return "critical";
  if (compareProbability(probability, policy.warningProbability) >= 0) return "warning";
  return "watch";
}

const SEVERITY_RANK: Readonly<Record<ActiveAlertSeverity, number>> = {
  watch: 1,
  warning: 2,
  critical: 3,
};

export function evaluateHazardAlerts(
  policy: HazardAlertPolicy,
  observations: readonly HazardAlertObservation[],
): Readonly<HazardAlertTimeline> {
  validateAlertPolicy(policy);
  let active = false;
  let entryStreak = 0;
  let exitStreak = 0;
  let previousAt: string | null = null;
  const points: HazardAlertPoint[] = [];
  for (const observation of observations) {
    assertIsoInstant(observation.observedAt, "alert observation observedAt");
    assertProbability(observation.probability, "alert observation probability");
    if (typeof observation.calibrated !== "boolean") {
      throw new TypeError("alert observation calibrated must be a boolean");
    }
    if (typeof observation.outOfDomain !== "boolean") {
      throw new TypeError("alert observation outOfDomain must be a boolean");
    }
    if (previousAt !== null && compareInstant(previousAt, observation.observedAt) >= 0) {
      throw new TypeError("alert observations must be strictly chronological");
    }
    previousAt = observation.observedAt;
    if (!Number.isSafeInteger(observation.evidenceItemCount) || observation.evidenceItemCount < 0) {
      throw new TypeError("evidenceItemCount must be a non-negative integer");
    }
    let gateReason: AlertGateReason | null = null;
    if (observation.outOfDomain || observation.evidenceItemCount < policy.minimumEvidenceItems) {
      gateReason = observation.outOfDomain ? "out_of_domain" : "insufficient_evidence";
      active = false;
      entryStreak = 0;
      exitStreak = 0;
      points.push({
        ...observation,
        state: "suppressed",
        severity: "none",
        gateReason,
        transition: "suppressed",
        entryStreak,
        exitStreak,
      });
      continue;
    }
    let transition: HazardAlertPoint["transition"] = "none";
    if (!active) {
      exitStreak = 0;
      entryStreak =
        compareProbability(observation.probability, policy.entryProbability) >= 0
          ? entryStreak + 1
          : 0;
      if (entryStreak >= policy.entryConsecutiveObservations) {
        active = true;
        transition = "entered";
        entryStreak = 0;
      }
    } else {
      entryStreak = 0;
      exitStreak =
        compareProbability(observation.probability, policy.exitProbability) < 0
          ? exitStreak + 1
          : 0;
      if (exitStreak >= policy.exitConsecutiveObservations) {
        active = false;
        transition = "exited";
        exitStreak = 0;
      }
    }
    let severity: AlertSeverity = active ? severityFor(policy, observation.probability) : "none";
    if (
      active &&
      !observation.calibrated &&
      SEVERITY_RANK[severity as ActiveAlertSeverity] >
        SEVERITY_RANK[policy.uncalibratedSeverityCeiling]
    ) {
      severity = policy.uncalibratedSeverityCeiling;
      gateReason = "uncalibrated_severity_ceiling";
    }
    points.push({
      ...observation,
      state: active ? "active" : "inactive",
      severity,
      gateReason,
      transition,
      entryStreak,
      exitStreak,
    });
  }
  const policySha256 = digestJson(policy);
  const body = cloneCanonical({
    schemaVersion: 1 as const,
    hazard: policy.hazard,
    methodologyScope: policy.methodologyScope,
    policySha256,
    points,
  });
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}
