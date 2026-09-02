import type { ScenarioGovernanceLedger } from "./collaboration.js";
import {
  assertGovernanceLedgerIntegrity,
  assertLedgerApprovesDefinition,
} from "./collaboration.js";
import type { BaselineIdentity, ScenarioDefinition } from "./definitions.js";
import { assertBaselineIntegrity, assertScenarioDefinitionIntegrity } from "./definitions.js";
import {
  assertDigestIntegrity,
  assertExactKeys,
  assertHttpsOrUrn,
  assertIsoInstant,
  assertKey,
  assertNonBlank,
  assertPlainRecord,
  assertSha256,
  assertUuid,
  canonicalJson,
  compareInstants,
  immutableWithDigest,
  uniqueBy,
} from "./internals.js";
import type { ScenarioResultArtifact } from "./results.js";

export type CitationArtifactRole =
  | "observed_baseline"
  | "forecast_baseline"
  | "model"
  | "scenario_definition"
  | "scenario_result"
  | "supporting_source";

export interface ScenarioReportCitation {
  readonly citationId: string;
  readonly artifactRole: CitationArtifactRole;
  readonly title: string;
  readonly publisher: string;
  readonly sourceUri: string;
  readonly sourceVersion: string;
  readonly snapshotSha256: string;
  readonly availableAt: string;
  readonly retrievedAt: string;
}

export interface ScenarioReportClaim {
  readonly claimId: string;
  readonly claimKind:
    | "scenario_output"
    | "sensitivity"
    | "spillover"
    | "limitation"
    | "methodology";
  readonly text: string;
  readonly citationIds: readonly string[];
  readonly metricKeys: readonly string[];
}

export interface ScenarioReportExportInput {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly reportId: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly title: string;
  readonly executiveSummary: string;
  readonly citations: readonly ScenarioReportCitation[];
  readonly claims: readonly ScenarioReportClaim[];
}

export interface ScenarioReportExport extends ScenarioReportExportInput {
  readonly scenarioId: string;
  readonly scenarioDefinitionSha256: string;
  readonly scenarioGovernanceSha256: string;
  readonly resultSha256: string;
  readonly baselineIdentitySha256: string;
  readonly provenance: {
    readonly observedSnapshotSha256: string;
    readonly forecastSnapshotSha256: string;
    readonly modelArtifactSha256: string;
    readonly modelCodeSha256: string;
    readonly modelConfigurationSha256: string;
    readonly workerOutputArtifactSha256: string;
  };
  readonly dataClass: "scenario_report_only";
  readonly canonicalObservedDatasetEligible: false;
  readonly notObservedFact: true;
  readonly claimBoundary: {
    readonly researchOnly: true;
    readonly notForecastOrProbability: true;
    readonly notCausalEstimate: true;
    readonly notPolicyAdvice: true;
    readonly noPolicyOptimalityClaim: true;
  };
  readonly manifestSha256: string;
}

const FORBIDDEN_ASSERTION =
  /\b(?:will|likely|probability\s+of|causes?|caused|causal\s+(?:effect|impact)|optimal\s+policy|policy\s+optimum|should\s+(?:adopt|implement|enact)|recommend(?:s|ed|ation)?)\b/i;

function assertSafeNarrative(text: string, field: string, maxLength: number): void {
  assertNonBlank(text, field, maxLength);
  if (FORBIDDEN_ASSERTION.test(text)) {
    throw new TypeError(
      `${field} contains a forecast, causal, recommendation, or optimality assertion`,
    );
  }
}

function requiredRoleDigest(
  role: Exclude<CitationArtifactRole, "supporting_source">,
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
  result: ScenarioResultArtifact,
): string {
  if (role === "observed_baseline") return baseline.observedSnapshot.snapshotSha256;
  if (role === "forecast_baseline") return baseline.forecastSnapshot.snapshotSha256;
  if (role === "model") return baseline.model.artifactSha256;
  if (role === "scenario_definition") return definition.manifestSha256;
  return result.manifestSha256;
}

function validateCitations(
  citations: readonly ScenarioReportCitation[],
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
  result: ScenarioResultArtifact,
  createdAt: string,
): ReadonlyMap<string, ScenarioReportCitation> {
  if (!Array.isArray(citations) || citations.length < 5 || citations.length > 256) {
    throw new TypeError("report citations must contain 5..256 provenance records");
  }
  uniqueBy(citations, (citation) => citation.citationId, "report citations");
  const byId = new Map<string, ScenarioReportCitation>();
  const requiredRoles: readonly Exclude<CitationArtifactRole, "supporting_source">[] = [
    "observed_baseline",
    "forecast_baseline",
    "model",
    "scenario_definition",
    "scenario_result",
  ];
  for (const citation of citations) {
    assertPlainRecord(citation as unknown, "citation");
    assertExactKeys(
      citation,
      [
        "citationId",
        "artifactRole",
        "title",
        "publisher",
        "sourceUri",
        "sourceVersion",
        "snapshotSha256",
        "availableAt",
        "retrievedAt",
      ],
      "citation",
    );
    assertKey(citation.citationId, "citation.citationId");
    if (!([...requiredRoles, "supporting_source"] as const).includes(citation.artifactRole)) {
      throw new TypeError("citation artifactRole is not registered");
    }
    assertNonBlank(citation.title, "citation.title", 500);
    assertNonBlank(citation.publisher, "citation.publisher", 300);
    assertHttpsOrUrn(citation.sourceUri, "citation.sourceUri");
    assertNonBlank(citation.sourceVersion, "citation.sourceVersion", 200);
    assertSha256(citation.snapshotSha256, "citation.snapshotSha256");
    assertIsoInstant(citation.availableAt, "citation.availableAt");
    assertIsoInstant(citation.retrievedAt, "citation.retrievedAt");
    if (
      compareInstants(citation.availableAt, createdAt) > 0 ||
      compareInstants(citation.retrievedAt, createdAt) > 0
    ) {
      throw new TypeError("report citation cannot be available or retrieved in the future");
    }
    if (compareInstants(citation.retrievedAt, citation.availableAt) < 0) {
      throw new TypeError("report citation cannot be retrieved before it is available");
    }
    byId.set(citation.citationId, citation);
  }
  for (const role of requiredRoles) {
    const matches = citations.filter((citation) => citation.artifactRole === role);
    if (
      matches.length !== 1 ||
      matches[0]?.snapshotSha256 !== requiredRoleDigest(role, definition, baseline, result)
    ) {
      throw new TypeError(`report requires one exact ${role} provenance citation`);
    }
  }
  return byId;
}

function validateClaims(
  claims: readonly ScenarioReportClaim[],
  citations: ReadonlyMap<string, ScenarioReportCitation>,
  result: ScenarioResultArtifact,
): void {
  if (!Array.isArray(claims) || claims.length === 0 || claims.length > 512) {
    throw new TypeError("report claims must contain 1..512 records");
  }
  uniqueBy(claims, (claim) => claim.claimId, "report claims");
  const usedCitations = new Set<string>();
  const resultMetricKeys = new Set(result.metrics.map((metric) => metric.metricKey));
  const coveredMetrics = new Set<string>();
  let hasSensitivityClaim = false;
  let hasSpilloverClaim = false;
  for (const claim of claims) {
    assertPlainRecord(claim as unknown, "claim");
    assertExactKeys(claim, ["claimId", "claimKind", "text", "citationIds", "metricKeys"], "claim");
    assertKey(claim.claimId, "claim.claimId");
    if (
      !(
        ["scenario_output", "sensitivity", "spillover", "limitation", "methodology"] as const
      ).includes(claim.claimKind)
    ) {
      throw new TypeError("claim kind is not registered");
    }
    assertSafeNarrative(claim.text, "claim.text", 4_000);
    if (
      !Array.isArray(claim.citationIds) ||
      claim.citationIds.length === 0 ||
      claim.citationIds.length > 32
    ) {
      throw new TypeError("each report claim requires 1..32 citations");
    }
    const citationIds = claim.citationIds as readonly string[];
    uniqueBy(citationIds, (id) => id, "claim citationIds");
    for (const citationId of citationIds) {
      if (!citations.has(citationId)) throw new TypeError("claim refers to an absent citation");
      usedCitations.add(citationId);
    }
    if (!Array.isArray(claim.metricKeys) || claim.metricKeys.length > 64) {
      throw new TypeError("claim metricKeys must contain at most 64 items");
    }
    const metricKeys = claim.metricKeys as readonly string[];
    uniqueBy(metricKeys, (key) => key, "claim metricKeys");
    for (const metricKey of metricKeys) {
      assertKey(metricKey, "claim.metricKey");
      if (!resultMetricKeys.has(metricKey))
        throw new TypeError("claim refers to an absent result metric");
      if (claim.claimKind === "scenario_output") coveredMetrics.add(metricKey);
    }
    if (claim.claimKind === "scenario_output" && claim.metricKeys.length === 0) {
      throw new TypeError("scenario_output claim must name a result metric");
    }
    if (claim.claimKind === "sensitivity") hasSensitivityClaim = true;
    if (claim.claimKind === "spillover") hasSpilloverClaim = true;
  }
  for (const metricKey of resultMetricKeys) {
    if (!coveredMetrics.has(metricKey))
      throw new TypeError("every result metric needs a cited output claim");
  }
  if (result.sensitivities.length > 0 && !hasSensitivityClaim) {
    throw new TypeError("report omits a cited sensitivity claim");
  }
  if (result.spillovers.length > 0 && !hasSpilloverClaim) {
    throw new TypeError("report omits a cited spillover claim");
  }
  for (const citationId of citations.keys()) {
    if (!usedCitations.has(citationId)) throw new TypeError("report contains an unused citation");
  }
}

export function createScenarioReportExport(
  input: ScenarioReportExportInput,
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
  result: ScenarioResultArtifact,
  ledger: ScenarioGovernanceLedger,
): Readonly<ScenarioReportExport> {
  assertBaselineIntegrity(baseline);
  assertScenarioDefinitionIntegrity(definition, baseline);
  assertGovernanceLedgerIntegrity(ledger);
  assertLedgerApprovesDefinition(ledger, definition);
  assertDigestIntegrity(result, "scenarioResult");
  assertPlainRecord(input, "scenarioReport");
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "tenantId",
      "reportId",
      "createdBy",
      "createdAt",
      "title",
      "executiveSummary",
      "citations",
      "claims",
    ],
    "scenarioReport",
  );
  if (input.schemaVersion !== 1) throw new TypeError("report schemaVersion must be 1");
  assertUuid(input.tenantId, "report.tenantId");
  assertUuid(input.reportId, "report.reportId");
  assertUuid(input.createdBy, "report.createdBy");
  assertIsoInstant(input.createdAt, "report.createdAt");
  if (
    input.tenantId !== definition.tenantId ||
    input.tenantId !== baseline.tenantId ||
    input.tenantId !== result.tenantId ||
    input.tenantId !== ledger.tenantId ||
    result.scenarioDefinitionSha256 !== definition.manifestSha256 ||
    result.baselineIdentitySha256 !== baseline.manifestSha256
  ) {
    throw new TypeError("report export crosses tenant or pinned artifact boundaries");
  }
  if (compareInstants(input.createdAt, result.generatedAt) < 0) {
    throw new TypeError("report cannot predate its result");
  }
  assertSafeNarrative(input.title, "report.title", 300);
  assertSafeNarrative(input.executiveSummary, "report.executiveSummary", 4_000);
  const citations = validateCitations(
    input.citations,
    definition,
    baseline,
    result,
    input.createdAt,
  );
  validateClaims(input.claims, citations, result);
  return immutableWithDigest({
    ...input,
    scenarioId: definition.scenarioId,
    scenarioDefinitionSha256: definition.manifestSha256,
    scenarioGovernanceSha256: ledger.manifestSha256,
    resultSha256: result.manifestSha256,
    baselineIdentitySha256: baseline.manifestSha256,
    provenance: {
      observedSnapshotSha256: baseline.observedSnapshot.snapshotSha256,
      forecastSnapshotSha256: baseline.forecastSnapshot.snapshotSha256,
      modelArtifactSha256: baseline.model.artifactSha256,
      modelCodeSha256: baseline.model.codeSha256,
      modelConfigurationSha256: baseline.model.configurationSha256,
      workerOutputArtifactSha256: result.workerOutputArtifactSha256,
    },
    dataClass: "scenario_report_only" as const,
    canonicalObservedDatasetEligible: false as const,
    notObservedFact: true as const,
    claimBoundary: {
      researchOnly: true as const,
      notForecastOrProbability: true as const,
      notCausalEstimate: true as const,
      notPolicyAdvice: true as const,
      noPolicyOptimalityClaim: true as const,
    },
  });
}

export function assertScenarioReportIntegrity(
  report: ScenarioReportExport,
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
  result: ScenarioResultArtifact,
  ledger: ScenarioGovernanceLedger,
): void {
  assertDigestIntegrity(report, "scenarioReport");
  const {
    manifestSha256: _manifest,
    scenarioId: _scenarioId,
    scenarioDefinitionSha256: _definitionSha,
    scenarioGovernanceSha256: _governanceSha,
    resultSha256: _resultSha,
    baselineIdentitySha256: _baselineSha,
    provenance: _provenance,
    dataClass: _dataClass,
    canonicalObservedDatasetEligible: _eligible,
    notObservedFact: _notObserved,
    claimBoundary: _claimBoundary,
    ...input
  } = report;
  const rebuilt = createScenarioReportExport(input, definition, baseline, result, ledger);
  if (rebuilt.manifestSha256 !== report.manifestSha256) {
    throw new TypeError("scenario report derived provenance or boundary does not match inputs");
  }
}

export function exportScenarioReportJson(
  report: ScenarioReportExport,
  definition: ScenarioDefinition,
  baseline: BaselineIdentity,
  result: ScenarioResultArtifact,
  ledger: ScenarioGovernanceLedger,
): string {
  assertScenarioReportIntegrity(report, definition, baseline, result, ledger);
  return canonicalJson(report);
}

export function assertScenarioReportNotObserved(report: ScenarioReportExport): never {
  assertDigestIntegrity(report, "scenarioReport");
  if (
    report.dataClass !== "scenario_report_only" ||
    report.canonicalObservedDatasetEligible !== false ||
    report.notObservedFact !== true ||
    !Object.values(report.claimBoundary).every((value) => value === true)
  ) {
    throw new TypeError("scenario report boundary has been weakened");
  }
  throw new TypeError("scenario reports can never be admitted to observed canonical datasets");
}
