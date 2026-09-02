import { describe, expect, it } from "vitest";
import { type ObservationVersion, selectPointInTime, snapshotHash } from "./point-in-time.js";

const base: ObservationVersion = {
  id: "observation-original",
  seriesId: "series-gdp",
  eventStart: "2024-01-01T00:00:00Z",
  eventEnd: "2025-01-01T00:00:00Z",
  releaseId: "release-original",
  releaseTime: "2025-03-01T09:00:00Z",
  availabilityTime: "2025-03-01T09:00:00Z",
  retrievedAt: "2025-03-01T09:04:00Z",
  recordedAt: "2025-03-01T09:05:00Z",
  pitQuality: "true_vintage",
  value: "100.25",
  missingReason: null,
  dataClass: "observed",
};
const revision: ObservationVersion = {
  ...base,
  id: "observation-revision",
  releaseId: "release-revision",
  releaseTime: "2025-06-01T09:00:00Z",
  availabilityTime: "2025-06-01T09:00:00Z",
  retrievedAt: "2025-06-01T09:03:00Z",
  recordedAt: "2025-06-01T09:04:00Z",
  value: "101.75",
  supersedesObservationId: base.id,
};
const lateAdmission: ObservationVersion = {
  ...base,
  id: "observation-late",
  releaseId: "release-late",
  releaseTime: "2025-02-01T09:00:00Z",
  availabilityTime: "2025-02-01T09:00:00Z",
  retrievedAt: "2025-08-01T08:59:00Z",
  recordedAt: "2025-08-01T09:00:00Z",
  pitQuality: "reconstructed_only",
  value: "99.5",
};

describe("point-in-time selection", () => {
  it("keeps revisions invisible before their release", () => {
    const result = selectPointInTime([base, revision], {
      policy: "true_vintage",
      knownAt: "2025-04-01T00:00:00Z",
    });
    expect(result.map((value) => value.id)).toEqual([base.id]);
  });

  it("distinguishes strict vintage from reconstructed availability", () => {
    expect(
      selectPointInTime([lateAdmission], {
        policy: "true_vintage",
        knownAt: "2025-04-01T00:00:00Z",
      }),
    ).toEqual([]);
    expect(
      selectPointInTime([lateAdmission], {
        policy: "reconstructed",
        knownAt: "2025-04-01T00:00:00Z",
        systemAt: "2025-09-01T00:00:00Z",
      }).map((value) => value.id),
    ).toEqual([lateAdmission.id]);
  });

  it("rejects periods that had not ended by the knowledge cutoff under every policy", () => {
    const futurePeriod: ObservationVersion = {
      ...base,
      id: "future-period",
      eventStart: "2025-01-01T00:00:00Z",
      eventEnd: "2026-01-01T00:00:00Z",
    };
    expect(
      selectPointInTime([futurePeriod], {
        policy: "true_vintage",
        knownAt: "2025-07-01T00:00:00Z",
      }),
    ).toEqual([]);
    expect(
      selectPointInTime([futurePeriod], {
        policy: "reconstructed",
        knownAt: "2025-07-01T00:00:00Z",
        systemAt: "2026-07-01T00:00:00Z",
      }),
    ).toEqual([]);
    expect(
      selectPointInTime([futurePeriod], {
        policy: "latest_revised",
        knownAt: "2025-07-01T00:00:00Z",
      }),
    ).toEqual([]);
  });

  it("never treats an undocumented release as reconstructed history", () => {
    const revisedHistory: ObservationVersion = {
      ...base,
      id: "revised-history",
      releaseTime: null,
      availabilityTime: null,
      retrievedAt: "2026-01-01T00:00:00Z",
      recordedAt: "2026-01-01T00:01:00Z",
      pitQuality: "latest_revised_only",
    };
    expect(
      selectPointInTime([revisedHistory], {
        policy: "reconstructed",
        knownAt: "2025-04-01T00:00:00Z",
        systemAt: "2026-02-01T00:00:00Z",
      }),
    ).toEqual([]);
    expect(
      selectPointInTime([revisedHistory], {
        policy: "latest_revised",
        knownAt: "2025-04-01T00:00:00Z",
      }).map((value) => value.id),
    ).toEqual([revisedHistory.id]);
  });

  it("requires true grade, availability, and retrieval by the cutoff", () => {
    const wrongGrade: ObservationVersion = { ...base, pitQuality: "reconstructed_only" };
    const embargoed: ObservationVersion = {
      ...base,
      availabilityTime: "2025-05-01T00:00:00Z",
    };
    const retrievedLater: ObservationVersion = {
      ...base,
      retrievedAt: "2025-05-01T00:00:00Z",
      recordedAt: "2025-05-01T00:01:00Z",
    };
    const query = { policy: "true_vintage" as const, knownAt: "2025-04-01T00:00:00Z" };
    expect(selectPointInTime([wrongGrade], query)).toEqual([]);
    expect(selectPointInTime([embargoed], query)).toEqual([]);
    expect(selectPointInTime([retrievedLater], query)).toEqual([]);
  });

  it("uses recorded time only when an explicit system replay is requested", () => {
    const admittedLater: ObservationVersion = {
      ...base,
      recordedAt: "2025-06-01T00:00:00Z",
    };
    expect(
      selectPointInTime([admittedLater], {
        policy: "true_vintage",
        knownAt: "2025-04-01T00:00:00Z",
      }),
    ).toHaveLength(1);
    expect(
      selectPointInTime([admittedLater], {
        policy: "true_vintage",
        knownAt: "2025-04-01T00:00:00Z",
        systemAt: "2025-04-01T00:00:00Z",
      }),
    ).toEqual([]);
  });

  it("does not let future releases change a pinned snapshot", () => {
    const query = { policy: "true_vintage" as const, knownAt: "2025-04-01T00:00:00Z" };
    const before = selectPointInTime([base], query);
    const after = selectPointInTime([base, revision], query);
    expect(snapshotHash(after)).toBe(snapshotHash(before));
  });

  it("blocks synthetic data by default and includes it only by explicit policy", () => {
    const demo: ObservationVersion = { ...base, id: "demo", dataClass: "synthetic_demo" };
    const query = { policy: "true_vintage" as const, knownAt: "2025-04-01T00:00:00Z" };
    expect(selectPointInTime([demo], query)).toEqual([]);
    expect(selectPointInTime([demo], { ...query, allowSynthetic: true })).toHaveLength(1);
  });

  it("rejects missing-as-zero and non-canonical decimals", () => {
    expect(() =>
      selectPointInTime([{ ...base, value: "0", missingReason: "source_missing" }], {
        policy: "true_vintage",
        knownAt: "2025-04-01T00:00:00Z",
      }),
    ).toThrow("Exactly one");
    expect(() =>
      selectPointInTime([{ ...base, value: "01.0" }], {
        policy: "true_vintage",
        knownAt: "2025-04-01T00:00:00Z",
      }),
    ).toThrow("canonical decimal");
  });

  it("validates identity, interval, and data class invariants", () => {
    const query = { policy: "true_vintage" as const, knownAt: "2025-04-01T00:00:00Z" };
    expect(() => selectPointInTime([{ ...base, id: "" }], query)).toThrow("identities");
    expect(() => selectPointInTime([{ ...base, eventEnd: base.eventStart }], query)).toThrow(
      "eventEnd",
    );
    expect(() =>
      selectPointInTime([{ ...base, recordedAt: "2025-03-01T09:03:00Z" }], query),
    ).toThrow("retrievedAt");
    expect(() =>
      selectPointInTime(
        [{ ...base, dataClass: "fabricated" as ObservationVersion["dataClass"] }],
        query,
      ),
    ).toThrow("dataClass");
    expect(() =>
      selectPointInTime(
        [{ ...base, pitQuality: "fabricated" as ObservationVersion["pitQuality"] }],
        query,
      ),
    ).toThrow("pitQuality");
  });

  it("selects the latest admitted record deterministically", () => {
    const corrected = {
      ...base,
      id: "observation-corrected-admission",
      recordedAt: "2025-03-01T09:06:00Z",
      value: "100.5",
    };
    const result = selectPointInTime([corrected, base], {
      policy: "latest_revised",
      knownAt: "2025-04-01T00:00:00Z",
    });
    expect(result[0]?.id).toBe(corrected.id);
    expect(snapshotHash([base, corrected])).toBe(snapshotHash([corrected, base]));
  });

  it("uses the latest admitted revision even when it arrived after the historical cutoff", () => {
    const result = selectPointInTime([base, revision], {
      policy: "latest_revised",
      knownAt: "2025-04-01T00:00:00Z",
    });
    expect(result[0]?.id).toBe(revision.id);
  });
});
