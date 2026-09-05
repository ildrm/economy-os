import { createHash } from "node:crypto";
import {
  createSourceDocument,
  createSourceSnapshot,
  type SourceDocumentInput,
} from "@economyos/narrative-intelligence";
import type { BehavioralChoiceModelInput } from "./agents.js";
import type { BehavioralStudyInput } from "./evidence.js";
import { detectBehavioralInterventions } from "./interventions.js";
import type { ProspectParameters } from "./models.js";
export const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
export const tenant = { organizationId: id(1), workspaceId: id(2) };
export const date = "2024-03-01T00:00:00Z";
export const parameters: ProspectParameters = {
  referencePoint: "0",
  gainCurvature: "1",
  lossCurvature: "1",
  lossAversion: "1",
  gainWeighting: "1",
  lossWeighting: "1",
};
export function source(
  sourceText = "Employees are automatically enrolled and may opt out.",
  overrides: Partial<SourceDocumentInput> = {},
) {
  const document = createSourceDocument({
    schemaVersion: 1,
    ...tenant,
    documentId: id(3),
    sourceKey: "fixture.policy",
    sourceType: "official_release",
    canonicalUri: "https://example.invalid/fixture",
    title: "Synthetic test policy",
    publisher: "Fixture organization",
    language: "en",
    locale: "en-US",
    publishedAt: "2024-01-01T00:00:00Z",
    classification: "public",
    exportPolicy: "citation_only",
    license: {
      licenseId: "fixture-license",
      termsUri: "https://example.invalid/license",
      allowsInternalFullText: true,
      allowsCitationSnippets: true,
      allowsDerivedExport: false,
      maxCitationCharacters: 500,
    },
    attribution: "Synthetic test fixture, not production evidence.",
    ...overrides,
  });
  const snapshot = createSourceSnapshot(
    {
      schemaVersion: 1,
      ...tenant,
      snapshotId: id(4),
      documentId: document.documentId,
      documentManifestSha256: document.manifestSha256,
      versionLabel: "fixture-v1",
      mediaType: "text/plain",
      language: document.language,
      locale: document.locale,
      offsetEncoding: "utf16_code_unit",
      contentLength: sourceText.length,
      contentSha256: createHash("sha256").update(sourceText).digest("hex"),
      retrievedAt: "2024-01-02T00:00:00Z",
      availableAt: "2024-01-01T00:00:00Z",
      recordedAt: "2024-01-02T00:00:00Z",
    },
    document,
    sourceText,
  );
  return {
    document,
    snapshot,
    sourceText,
    scope: tenant,
    knownAt: date,
    systemAt: date,
    detectedAt: date,
    actor: {
      name: "Fixture employer",
      type: "employer" as const,
      jurisdiction: "fixture-jurisdiction",
      targetPopulation: "aggregate employees",
      decisionContext: "pension enrollment",
    },
  };
}
export function modelInput(): BehavioralChoiceModelInput {
  return {
    schemaVersion: 1,
    modelId: id(7),
    version: "1.0.0",
    scope: tenant,
    family: "cumulative_prospect",
    parameters,
    parameterBasis: {
      kind: "explicit_assumption",
      rationale: "Identity parameters for a rational benchmark test only.",
    },
    population: "aggregate employees",
    jurisdiction: "fixture-jurisdiction",
    ownerId: id(8),
    createdAt: date,
    availableAt: date,
    assumptions: ["Outcome probabilities are supplied scenario assumptions."],
    boundaryConditions: ["Known risk and explicit common units."],
    prohibitedUses: ["Individual profiling or policy recommendation."],
  };
}
export function studyInput(): BehavioralStudyInput {
  const input = source();
  const batch = detectBehavioralInterventions(input);
  const span = batch.candidates[0]?.sourceSpan;
  if (!span) throw new Error("Fixture candidate missing");
  return {
    schemaVersion: 1,
    studyId: id(10),
    scope: tenant,
    title: "Synthetic test study",
    authors: ["Fixture author"],
    publicationUri: "https://example.invalid/study",
    publishedAt: "2024-01-01T00:00:00Z",
    availableAt: "2024-01-01T00:00:00Z",
    recordedAt: "2024-01-02T00:00:00Z",
    effectiveFrom: "2023-01-01T00:00:00Z",
    effectiveTo: "2023-12-01T00:00:00Z",
    studyType: "field_experiment",
    mechanismIds: ["default"],
    population: "aggregate employees",
    jurisdiction: "fixture-jurisdiction",
    decisionContext: "enrollment",
    sampleSize: 100,
    sampleSizeMissingReason: null,
    preregistrationUri: null,
    intervention: "Automatic enrollment",
    comparator: "Opt in",
    outcome: "Enrollment fraction",
    estimand: "Fixture intention-to-treat enrollment difference",
    effect: {
      estimate: "0.1",
      unit: "fraction",
      interval: {
        lower: "-0.05",
        upper: "0.25",
        level: "0.95",
        method: "Fixture confidence interval",
      },
      uncertaintyMissingReason: null,
    },
    effectMissingReason: null,
    replication: { status: "not_assessed", relatedStudyIds: [], rationale: "Fixture only" },
    sourceSpans: [span],
    sourceDocuments: [input.document],
    sourceSnapshots: [input.snapshot],
    boundaryConditions: ["Synthetic unit-test fixture"],
    alternativeExplanations: ["No empirical inference"],
    limitations: ["Not production evidence"],
    attritionAssessment: "Not evaluated in fixture",
    multipleTestingAssessment: "Not evaluated in fixture",
    publicationBiasAssessment: "Not evaluated in fixture",
  };
}
