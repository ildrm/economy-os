import { createHash } from "node:crypto";
import {
  assertIsoInstant,
  DATA_CLASSES,
  type DataClass,
  isProductionDataClass,
} from "@economyos/contracts";

const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export const POINT_IN_TIME_QUALITIES = [
  "true_vintage",
  "reconstructed_only",
  "latest_revised_only",
] as const;
export type PointInTimeQuality = (typeof POINT_IN_TIME_QUALITIES)[number];

export interface ObservationVersion {
  readonly id: string;
  readonly seriesId: string;
  readonly eventStart: string;
  readonly eventEnd: string;
  readonly releaseId: string;
  readonly releaseTime: string | null;
  readonly availabilityTime: string | null;
  readonly retrievedAt: string;
  readonly recordedAt: string;
  readonly pitQuality: PointInTimeQuality;
  readonly value: string | null;
  readonly missingReason: string | null;
  readonly dataClass: DataClass;
  readonly supersedesObservationId?: string;
}

export type PointInTimeQuery =
  | {
      readonly policy: "true_vintage";
      readonly knownAt: string;
      readonly systemAt?: string;
      readonly allowSynthetic?: boolean;
    }
  | {
      readonly policy: "reconstructed";
      readonly knownAt: string;
      readonly systemAt: string;
      readonly allowSynthetic?: boolean;
    }
  | {
      readonly policy: "latest_revised";
      readonly knownAt: string;
      readonly allowSynthetic?: boolean;
    };

function validateObservation(observation: ObservationVersion): void {
  if (!observation.id || !observation.seriesId || !observation.releaseId) {
    throw new TypeError("Observation identities are required");
  }
  assertIsoInstant(observation.eventStart, "eventStart");
  assertIsoInstant(observation.eventEnd, "eventEnd");
  if (observation.releaseTime !== null) assertIsoInstant(observation.releaseTime, "releaseTime");
  if (observation.availabilityTime !== null) {
    assertIsoInstant(observation.availabilityTime, "availabilityTime");
  }
  assertIsoInstant(observation.retrievedAt, "retrievedAt");
  assertIsoInstant(observation.recordedAt, "recordedAt");
  if (Date.parse(observation.eventEnd) <= Date.parse(observation.eventStart)) {
    throw new TypeError("eventEnd must be after eventStart");
  }
  if (Date.parse(observation.recordedAt) < Date.parse(observation.retrievedAt)) {
    throw new TypeError("recordedAt cannot precede retrievedAt");
  }
  if ((observation.value === null) === (observation.missingReason === null)) {
    throw new TypeError("Exactly one of value and missingReason must be present");
  }
  if (observation.value !== null && !DECIMAL.test(observation.value)) {
    throw new TypeError("Observation value must be a canonical decimal string");
  }
  if (!(DATA_CLASSES as readonly string[]).includes(observation.dataClass)) {
    throw new TypeError("Observation dataClass is invalid");
  }
  if (!(POINT_IN_TIME_QUALITIES as readonly string[]).includes(observation.pitQuality)) {
    throw new TypeError("Observation pitQuality is invalid");
  }
}

function visible(observation: ObservationVersion, query: PointInTimeQuery): boolean {
  const releaseTime = observation.releaseTime === null ? null : Date.parse(observation.releaseTime);
  const availabilityTime =
    observation.availabilityTime === null ? null : Date.parse(observation.availabilityTime);
  const retrievedAt = Date.parse(observation.retrievedAt);
  const recordedAt = Date.parse(observation.recordedAt);
  const knownAt = Date.parse(query.knownAt);
  if (!query.allowSynthetic && !isProductionDataClass(observation.dataClass)) return false;
  if (Date.parse(observation.eventEnd) > knownAt) return false;
  if (query.policy === "true_vintage") {
    return (
      observation.pitQuality === "true_vintage" &&
      releaseTime !== null &&
      availabilityTime !== null &&
      releaseTime <= knownAt &&
      availabilityTime <= knownAt &&
      retrievedAt <= knownAt &&
      (query.systemAt === undefined || recordedAt <= Date.parse(query.systemAt))
    );
  }
  if (query.policy === "reconstructed") {
    return (
      observation.pitQuality !== "latest_revised_only" &&
      releaseTime !== null &&
      availabilityTime !== null &&
      releaseTime <= knownAt &&
      availabilityTime <= knownAt &&
      recordedAt <= Date.parse(query.systemAt)
    );
  }
  return true;
}

function compareVersion(left: ObservationVersion, right: ObservationVersion): number {
  const leftReleaseOrder = Date.parse(left.releaseTime ?? left.availabilityTime ?? left.recordedAt);
  const rightReleaseOrder = Date.parse(
    right.releaseTime ?? right.availabilityTime ?? right.recordedAt,
  );
  return (
    leftReleaseOrder - rightReleaseOrder ||
    Date.parse(left.recordedAt) - Date.parse(right.recordedAt) ||
    left.id.localeCompare(right.id)
  );
}

export function selectPointInTime(
  observations: readonly ObservationVersion[],
  query: PointInTimeQuery,
): readonly ObservationVersion[] {
  assertIsoInstant(query.knownAt, "knownAt");
  if ("systemAt" in query && query.systemAt !== undefined) {
    assertIsoInstant(query.systemAt, "systemAt");
  }
  const selected = new Map<string, ObservationVersion>();
  for (const observation of observations) {
    validateObservation(observation);
    if (!visible(observation, query)) continue;
    const key = `${observation.seriesId}\u0000${observation.eventStart}\u0000${observation.eventEnd}`;
    const incumbent = selected.get(key);
    if (!incumbent || compareVersion(incumbent, observation) < 0) selected.set(key, observation);
  }
  return Object.freeze(
    [...selected.values()].sort(
      (left, right) =>
        left.seriesId.localeCompare(right.seriesId) ||
        Date.parse(left.eventStart) - Date.parse(right.eventStart) ||
        left.id.localeCompare(right.id),
    ),
  );
}

export function snapshotHash(observations: readonly ObservationVersion[]): string {
  for (const observation of observations) validateObservation(observation);
  const canonical = [...observations]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((observation) => ({
      dataClass: observation.dataClass,
      availabilityTime: observation.availabilityTime,
      eventEnd: observation.eventEnd,
      eventStart: observation.eventStart,
      id: observation.id,
      missingReason: observation.missingReason,
      pitQuality: observation.pitQuality,
      recordedAt: observation.recordedAt,
      releaseId: observation.releaseId,
      releaseTime: observation.releaseTime,
      retrievedAt: observation.retrievedAt,
      seriesId: observation.seriesId,
      supersedesObservationId: observation.supersedesObservationId ?? null,
      value: observation.value,
    }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
