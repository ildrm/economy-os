import {
  assertIsoInstant,
  assertSha256,
  assertUuid,
  deterministicUuid,
  digestJson,
  transformationConfiguration,
} from "./identity.js";
import type {
  AdmissionDecision,
  CandidateObservation,
  IngestionWorkflowInput,
  LandingResult,
  QualityResult,
} from "./workflow-contracts.js";

const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const CHECKSUM_WEIGHT = 0.15;
const ROW_COUNT_WEIGHT = 0.1;
const IDENTITY_WEIGHT = 0.15;
const UNIQUE_PERIOD_WEIGHT = 0.15;
const VALUE_WEIGHT = 0.1;
const COMPLETENESS_WEIGHT = 0.2;
const PIT_WEIGHT = 0.15;

function result(
  checkCode: string,
  status: "pass" | "warn" | "fail",
  weight: number,
  details: Readonly<Record<string, unknown>>,
): QualityResult {
  return Object.freeze({ checkCode, status, weight, details: Object.freeze({ ...details }) });
}

function isPeriodValid(row: CandidateObservation): boolean {
  try {
    assertIsoInstant(row.periodStart, "periodStart");
    assertIsoInstant(row.periodEnd, "periodEnd");
    assertIsoInstant(row.retrievedAt, "retrievedAt");
    if (row.releaseTime !== null) assertIsoInstant(row.releaseTime, "releaseTime");
    if (row.availabilityTime !== null) {
      assertIsoInstant(row.availabilityTime, "availabilityTime");
    }
    return Date.parse(row.periodEnd) > Date.parse(row.periodStart);
  } catch {
    return false;
  }
}

function integrityCheck(landing: LandingResult): QualityResult {
  let valid = landing.payloads.length === 1;
  const identities = new Set<string>();
  for (const payload of landing.payloads) {
    try {
      assertUuid(payload.payloadId, "payloadId");
      assertSha256(payload.checksumSha256, "checksumSha256");
      assertIsoInstant(payload.fetchedAt, "fetchedAt");
      new URL(payload.requestUri);
      valid &&= payload.byteLength >= 0 && Number.isSafeInteger(payload.byteLength);
      valid &&= payload.objectUri.length > 0 && payload.objectKey.length > 0;
      valid &&= !identities.has(payload.payloadId);
      identities.add(payload.payloadId);
    } catch {
      valid = false;
    }
  }
  return result("payload_integrity", valid ? "pass" : "fail", CHECKSUM_WEIGHT, {
    payloadCount: landing.payloads.length,
    expectedPayloadCount: 1,
  });
}

function rowCountCheck(
  workflow: IngestionWorkflowInput,
  rows: readonly CandidateObservation[],
): QualityResult {
  const withinMaximum = rows.length <= workflow.qualityPolicy.maximumRows;
  const nonEmpty = workflow.qualityPolicy.allowEmptyPayload || rows.length > 0;
  return result("row_count", withinMaximum && nonEmpty ? "pass" : "fail", ROW_COUNT_WEIGHT, {
    actual: rows.length,
    maximum: workflow.qualityPolicy.maximumRows,
    allowEmptyPayload: workflow.qualityPolicy.allowEmptyPayload,
  });
}

function identityCheck(
  workflow: IngestionWorkflowInput,
  rows: readonly CandidateObservation[],
): QualityResult {
  const mismatches = rows.filter(
    (row) =>
      row.countryCode !== workflow.connector.countryCode ||
      row.indicatorCode !== workflow.connector.indicatorCode,
  ).length;
  return result("identity", mismatches === 0 ? "pass" : "fail", IDENTITY_WEIGHT, {
    mismatches,
    countryCode: workflow.connector.countryCode,
    indicatorCode: workflow.connector.indicatorCode,
  });
}

function periodKey(row: CandidateObservation): string {
  const normalize = (value: string): string => {
    const match = /^(?<base>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(?<fraction>\d{1,6}))?Z$/.exec(
      value,
    );
    if (!match?.groups) return value;
    const fraction = (match.groups.fraction ?? "").replace(/0+$/, "");
    return `${match.groups.base}${fraction ? `.${fraction}` : ""}Z`;
  };
  return `${normalize(row.periodStart)}/${normalize(row.periodEnd)}`;
}

function periodsCheck(rows: readonly CandidateObservation[]): QualityResult {
  const periods = new Set<string>();
  let duplicates = 0;
  let invalid = 0;
  for (const row of rows) {
    const key = periodKey(row);
    if (periods.has(key)) duplicates += 1;
    periods.add(key);
    if (!isPeriodValid(row)) invalid += 1;
  }
  return result(
    "period_uniqueness",
    duplicates === 0 && invalid === 0 ? "pass" : "fail",
    UNIQUE_PERIOD_WEIGHT,
    { duplicates, invalid },
  );
}

function requestedCoverageCheck(
  workflow: IngestionWorkflowInput,
  rows: readonly CandidateObservation[],
): QualityResult {
  const expected = new Set<string>();
  for (let year = workflow.connector.startYear; year <= workflow.connector.endYear; year += 1) {
    expected.add(
      `${year.toString().padStart(4, "0")}-01-01T00:00:00Z/${(year + 1)
        .toString()
        .padStart(4, "0")}-01-01T00:00:00Z`,
    );
  }
  const actual = new Set(rows.map((row) => periodKey(row)));
  const missing = [...expected].filter((period) => !actual.has(period));
  const unexpected = [...actual].filter((period) => !expected.has(period));
  const emptyAllowed = rows.length === 0 && workflow.qualityPolicy.allowEmptyPayload;
  return result(
    "requested_coverage",
    emptyAllowed || (missing.length === 0 && unexpected.length === 0) ? "pass" : "fail",
    0,
    {
      expected: expected.size,
      actual: actual.size,
      missing,
      unexpected,
      emptyAllowed,
    },
  );
}

function temporalCausalityCheck(rows: readonly CandidateObservation[]): QualityResult {
  let lookahead = 0;
  for (const row of rows) {
    const retrievedAt = Date.parse(row.retrievedAt);
    const releaseTime = row.releaseTime === null ? null : Date.parse(row.releaseTime);
    const availabilityTime =
      row.availabilityTime === null ? null : Date.parse(row.availabilityTime);
    if (
      !Number.isFinite(retrievedAt) ||
      (releaseTime !== null && (!Number.isFinite(releaseTime) || releaseTime > retrievedAt)) ||
      (availabilityTime !== null &&
        (!Number.isFinite(availabilityTime) || availabilityTime > retrievedAt))
    ) {
      lookahead += 1;
    }
  }
  return result("temporal_causality", lookahead === 0 ? "pass" : "fail", 0, {
    lookahead,
  });
}

function valuesCheck(rows: readonly CandidateObservation[]): QualityResult {
  let invalid = 0;
  for (const row of rows) {
    const missing = row.value === null;
    if (
      (missing && row.missingReason !== "source_missing") ||
      (!missing && (row.missingReason !== null || !DECIMAL.test(row.value ?? "")))
    ) {
      invalid += 1;
    }
  }
  return result("value_conformance", invalid === 0 ? "pass" : "fail", VALUE_WEIGHT, {
    invalid,
  });
}

function completenessCheck(
  workflow: IngestionWorkflowInput,
  rows: readonly CandidateObservation[],
): QualityResult {
  const present = rows.filter((row) => row.value !== null).length;
  const completeness = rows.length === 0 ? 0 : present / rows.length;
  const reportedCompleteness = Math.round(completeness * 1_000_000) / 1_000_000;
  return result(
    "completeness",
    completeness >= workflow.qualityPolicy.minimumCompleteness ? "pass" : "fail",
    COMPLETENESS_WEIGHT,
    {
      present,
      total: rows.length,
      completeness: reportedCompleteness,
      minimum: workflow.qualityPolicy.minimumCompleteness,
    },
  );
}

function pitCheck(
  workflow: IngestionWorkflowInput,
  rows: readonly CandidateObservation[],
): QualityResult {
  const first = rows[0];
  const mismatches = rows.filter((row) => {
    const requiresKnownRelease =
      workflow.qualityPolicy.requiredPitQuality === "true_vintage" ||
      workflow.qualityPolicy.requiredPitQuality === "reconstructed_only";
    return (
      row.pitQuality !== workflow.qualityPolicy.requiredPitQuality ||
      (requiresKnownRelease && (row.releaseTime === null || row.availabilityTime === null)) ||
      (row.releaseTime !== null &&
        row.availabilityTime !== null &&
        Date.parse(row.availabilityTime) < Date.parse(row.releaseTime)) ||
      row.releaseTime !== (first?.releaseTime ?? null) ||
      row.availabilityTime !== (first?.availabilityTime ?? null)
    );
  }).length;
  return result("pit_fidelity", mismatches === 0 ? "pass" : "fail", PIT_WEIGHT, {
    mismatches,
    required: workflow.qualityPolicy.requiredPitQuality,
  });
}

export function evaluateAdmission(
  workflow: IngestionWorkflowInput,
  landing: LandingResult,
): AdmissionDecision {
  const calculatedCandidateDigest = digestJson(landing.candidates);
  const digestMatches = calculatedCandidateDigest === landing.candidateSha256;
  const retrievedAtMatches = landing.candidates.every((row) =>
    landing.payloads.some((payload) => payload.fetchedAt === row.retrievedAt),
  );
  const componentResults = [
    integrityCheck(landing),
    result("candidate_digest", digestMatches ? "pass" : "fail", 0, {
      expected: landing.candidateSha256,
      actual: calculatedCandidateDigest,
    }),
    result("retrieval_alignment", retrievedAtMatches ? "pass" : "fail", 0, {
      mismatches: landing.candidates.filter(
        (row) => !landing.payloads.some((payload) => payload.fetchedAt === row.retrievedAt),
      ).length,
    }),
    rowCountCheck(workflow, landing.candidates),
    identityCheck(workflow, landing.candidates),
    periodsCheck(landing.candidates),
    requestedCoverageCheck(workflow, landing.candidates),
    valuesCheck(landing.candidates),
    completenessCheck(workflow, landing.candidates),
    pitCheck(workflow, landing.candidates),
    temporalCausalityCheck(landing.candidates),
  ] as const;
  const score = componentResults.reduce((total, check) => {
    if (check.status === "pass") return total + check.weight;
    if (check.status === "warn") return total + check.weight / 2;
    return total;
  }, 0);
  const roundedScore = Math.round(score * 1_000_000) / 1_000_000;
  const failed = componentResults.filter((check) => check.status === "fail");
  const disposition = failed.length === 0 ? "promote" : "quarantine";
  const admission = result("admission", disposition === "promote" ? "pass" : "fail", 0, {
    score: roundedScore,
    failedChecks: failed.map((check) => check.checkCode),
    candidateSha256: calculatedCandidateDigest,
  });
  const payloadIdentity = landing.payloads
    .map((payload) => payload.payloadId)
    .sort()
    .join(":");
  const transformationConfigurationSha256 = digestJson(transformationConfiguration(workflow));
  const transformationRunId = deterministicUuid(
    "economyos:transformation-run:v1",
    workflow.organizationId ?? "global",
    workflow.datasetId,
    payloadIdentity,
    workflow.parser.name,
    workflow.parser.version,
    workflow.parser.codeSha256,
    transformationConfigurationSha256,
    calculatedCandidateDigest,
  );
  const releaseId = deterministicUuid(
    "economyos:release:v1",
    workflow.organizationId ?? "global",
    workflow.datasetId,
    payloadIdentity,
    calculatedCandidateDigest,
  );
  return Object.freeze({
    disposition,
    transformationRunId,
    transformationConfigurationSha256,
    releaseId,
    score: roundedScore,
    results: Object.freeze([...componentResults, admission]),
    reasons: Object.freeze(failed.map((check) => check.checkCode)),
    candidateSha256: calculatedCandidateDigest,
  });
}
