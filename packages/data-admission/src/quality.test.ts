import { describe, expect, it } from "vitest";
import {
  createIngestionWorkflowInput,
  digestJson,
  evaluateAdmission,
  WORLD_BANK_WDI_PARSER_IDENTITY,
} from "./index.js";
import type {
  CandidateObservation,
  IngestionWorkflowInput,
  LandingResult,
} from "./workflow-contracts.js";

function workflow(
  qualityOverrides: Partial<IngestionWorkflowInput["qualityPolicy"]> = {},
): IngestionWorkflowInput {
  return createIngestionWorkflowInput(
    {
      organizationId: null,
      datasetId: "038f47ac-19fc-7c92-ae91-0242ac120003",
      seriesId: "038f47ac-19fc-7c92-ae91-0242ac120007",
      idempotencyToken: "quality-test",
      requestedAt: "2026-08-31T10:00:00Z",
      connector: {
        type: "world-bank-wdi",
        countryCode: "USA",
        indicatorCode: "NY.GDP.MKTP.CD",
        startYear: 2020,
        endYear: 2021,
      },
      parser: WORLD_BANK_WDI_PARSER_IDENTITY,
      qualityPolicy: {
        minimumCompleteness: 0.5,
        maximumRows: 10,
        requiredPitQuality: "latest_revised_only",
        allowEmptyPayload: false,
        ...qualityOverrides,
      },
    },
    {
      keyId: "quality-test-v1",
      key: new TextEncoder().encode("economyos-quality-test-authorization-key-only"),
      issuedAt: "2026-08-31T09:59:00.000Z",
      expiresAt: "2026-08-31T10:09:00.000Z",
      nonce: "cXVhbGl0eS10ZXN0LW5vbmNlLTAwMDAwMQ",
    },
  );
}

function row(year: number, value: string | null = "100.25"): CandidateObservation {
  return {
    countryCode: "USA",
    indicatorCode: "NY.GDP.MKTP.CD",
    periodStart: `${year}-01-01T00:00:00Z`,
    periodEnd: `${year + 1}-01-01T00:00:00Z`,
    value,
    missingReason: value === null ? "source_missing" : null,
    releaseTime: null,
    availabilityTime: null,
    retrievedAt: "2026-08-31T10:00:01Z",
    pitQuality: "latest_revised_only",
  };
}

function landing(rows: readonly CandidateObservation[] = [row(2020), row(2021)]): LandingResult {
  return {
    payloads: [
      {
        payloadId: "42f762af-d09b-8e42-ae91-0242ac120003",
        requestUri: "https://api.worldbank.org/v2/country/USA/indicator/NY.GDP.MKTP.CD",
        objectUri:
          "s3://economyos/raw/global/038f47ac-19fc-7c92-ae91-0242ac120003/42f762af-d09b-8e42-ae91-0242ac120003.bin",
        objectKey:
          "raw/global/038f47ac-19fc-7c92-ae91-0242ac120003/42f762af-d09b-8e42-ae91-0242ac120003.bin",
        mediaType: "application/json",
        checksumSha256: "c".repeat(64),
        byteLength: 128,
        fetchedAt: "2026-08-31T10:00:01Z",
        providerRequestId: null,
      },
    ],
    candidates: rows,
    candidateSha256: digestJson(rows),
  };
}

describe("admission quality gates", () => {
  it("promotes a conforming immutable candidate batch with an admission pass", () => {
    const decision = evaluateAdmission(workflow(), landing());
    expect(decision.disposition).toBe("promote");
    expect(decision.score).toBe(1);
    expect(decision.results.at(-1)).toMatchObject({ checkCode: "admission", status: "pass" });
    expect(decision.transformationRunId).toMatch(/^[0-9a-f-]{36}$/);
    expect(decision.releaseId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("quarantines duplicate economic periods", () => {
    const duplicate = row(2020, "200");
    const decision = evaluateAdmission(workflow(), landing([row(2020), duplicate]));
    expect(decision.disposition).toBe("quarantine");
    expect(decision.reasons).toContain("period_uniqueness");
    expect(decision.results.find((result) => result.checkCode === "admission")?.status).toBe(
      "fail",
    );

    const alternateInstantSpelling = {
      ...row(2020),
      periodStart: "2020-01-01T00:00:00.000Z",
      periodEnd: "2021-01-01T00:00:00.000Z",
    };
    expect(
      evaluateAdmission(workflow(), landing([row(2020), alternateInstantSpelling])).reasons,
    ).toContain("period_uniqueness");
  });

  it("quarantines incomplete and non-conforming values without treating missing as zero", () => {
    const decision = evaluateAdmission(
      workflow({ minimumCompleteness: 0.75 }),
      landing([row(2020, null), row(2021, null)]),
    );
    expect(decision.reasons).toContain("completeness");
    expect(
      decision.results.find((result) => result.checkCode === "completeness")?.details,
    ).toMatchObject({ present: 0, total: 2, completeness: 0 });

    const malformed = { ...row(2020), value: "01.0" };
    expect(evaluateAdmission(workflow(), landing([malformed])).reasons).toContain(
      "value_conformance",
    );
  });

  it("quarantines candidate tampering and retrieval metadata misalignment", () => {
    const original = landing();
    const tampered = {
      ...original,
      candidates: [{ ...row(2020), retrievedAt: "2026-08-31T11:00:00Z" }],
    };
    const decision = evaluateAdmission(workflow(), tampered);
    expect(decision.reasons).toEqual(
      expect.arrayContaining(["candidate_digest", "retrieval_alignment"]),
    );
  });

  it("requires explicit release and availability axes for historical PIT claims", () => {
    const trueVintage = {
      ...row(2020),
      pitQuality: "true_vintage" as const,
    };
    const decision = evaluateAdmission(
      workflow({ requiredPitQuality: "true_vintage" }),
      landing([trueVintage]),
    );
    expect(decision.reasons).toContain("pit_fidelity");

    const completeVintage = {
      ...trueVintage,
      releaseTime: "2021-03-01T00:00:00Z",
      availabilityTime: "2021-03-02T00:00:00Z",
    };
    const completeVintage2021 = {
      ...row(2021),
      pitQuality: "true_vintage" as const,
      releaseTime: completeVintage.releaseTime,
      availabilityTime: completeVintage.availabilityTime,
    };
    expect(
      evaluateAdmission(
        workflow({ requiredPitQuality: "true_vintage" }),
        landing([completeVintage, completeVintage2021]),
      ).disposition,
    ).toBe("promote");
  });

  it("quarantines truncated requested ranges and look-ahead timestamps", () => {
    const truncated = evaluateAdmission(workflow(), landing([row(2020)]));
    expect(truncated.reasons).toContain("requested_coverage");

    const future = {
      ...row(2020),
      releaseTime: "2026-08-30T00:00:00Z",
      availabilityTime: "2026-09-01T00:00:00Z",
    };
    const future2021 = { ...future, ...row(2021) };
    const lookahead = evaluateAdmission(workflow(), landing([future, future2021]));
    expect(lookahead.reasons).toContain("temporal_causality");

    const subMillisecondBoundary = {
      ...row(2020),
      periodStart: "2020-01-01T00:00:00.000001Z",
    };
    expect(
      evaluateAdmission(workflow(), landing([subMillisecondBoundary, row(2021)])).reasons,
    ).toContain("requested_coverage");
  });

  it("versions transformation identity when the quality policy changes", () => {
    const permissive = evaluateAdmission(workflow({ minimumCompleteness: 0.5 }), landing());
    const strict = evaluateAdmission(workflow({ minimumCompleteness: 0.9 }), landing());
    expect(permissive.transformationRunId).not.toBe(strict.transformationRunId);
    expect(permissive.transformationConfigurationSha256).not.toBe(
      strict.transformationConfigurationSha256,
    );
  });
});
