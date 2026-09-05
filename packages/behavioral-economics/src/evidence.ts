import {
  assertSourceDocumentIntegrity,
  assertSourceSnapshotIntegrity,
  assertSourceSpanIntegrity,
  type SourceDocument,
  type SourceSnapshot,
  type SourceSpan,
} from "@economyos/narrative-intelligence";
import {
  type BehavioralScope,
  decimal,
  decimalUnits,
  enumeration,
  instant,
  integer,
  integrity,
  keys,
  sameScope,
  scope,
  seal,
  text,
  texts,
  uuid,
} from "./internals.js";

export const BEHAVIORAL_EVIDENCE_GRADES = [
  "well_supported",
  "supported_with_heterogeneity",
  "mixed",
  "limited_evidence",
  "failed_replication",
  "contested",
  "unknown",
] as const;
export interface BehavioralStudyInput {
  readonly schemaVersion: 1;
  readonly studyId: string;
  readonly scope: BehavioralScope;
  readonly title: string;
  readonly authors: readonly string[];
  readonly publicationUri: string;
  readonly publishedAt: string;
  readonly availableAt: string;
  readonly recordedAt: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string;
  readonly studyType:
    | "laboratory_experiment"
    | "field_experiment"
    | "observational"
    | "quasi_experimental"
    | "meta_analysis"
    | "replication"
    | "theoretical";
  readonly mechanismIds: readonly string[];
  readonly population: string;
  readonly jurisdiction: string;
  readonly decisionContext: string;
  readonly sampleSize: number | null;
  readonly sampleSizeMissingReason: string | null;
  readonly preregistrationUri: string | null;
  readonly intervention: string;
  readonly comparator: string;
  readonly outcome: string;
  readonly estimand: string;
  readonly effect: {
    readonly estimate: string;
    readonly unit: string;
    readonly interval: {
      readonly lower: string;
      readonly upper: string;
      readonly level: string;
      readonly method: string;
    } | null;
    readonly uncertaintyMissingReason: string | null;
  } | null;
  readonly effectMissingReason: string | null;
  readonly replication: {
    readonly status: "original" | "replicated" | "mixed" | "failed" | "not_assessed";
    readonly relatedStudyIds: readonly string[];
    readonly rationale: string;
  };
  readonly sourceSpans: readonly SourceSpan[];
  readonly sourceDocuments: readonly SourceDocument[];
  readonly sourceSnapshots: readonly SourceSnapshot[];
  readonly boundaryConditions: readonly string[];
  readonly alternativeExplanations: readonly string[];
  readonly limitations: readonly string[];
  readonly attritionAssessment: string;
  readonly multipleTestingAssessment: string;
  readonly publicationBiasAssessment: string;
}
export type BehavioralStudy = BehavioralStudyInput & { readonly manifestSha256: string };
function uri(value: string): void {
  text(value, "publication URI");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password)
    throw new TypeError("Publication URI must be public HTTPS without credentials");
}
export function createBehavioralStudy(input: BehavioralStudyInput): BehavioralStudy {
  keys(input, [
    "schemaVersion",
    "studyId",
    "scope",
    "title",
    "authors",
    "publicationUri",
    "publishedAt",
    "availableAt",
    "recordedAt",
    "effectiveFrom",
    "effectiveTo",
    "studyType",
    "mechanismIds",
    "population",
    "jurisdiction",
    "decisionContext",
    "sampleSize",
    "sampleSizeMissingReason",
    "preregistrationUri",
    "intervention",
    "comparator",
    "outcome",
    "estimand",
    "effect",
    "effectMissingReason",
    "replication",
    "sourceSpans",
    "sourceDocuments",
    "sourceSnapshots",
    "boundaryConditions",
    "alternativeExplanations",
    "limitations",
    "attritionAssessment",
    "multipleTestingAssessment",
    "publicationBiasAssessment",
  ]);
  if (input.schemaVersion !== 1) throw new TypeError("Study schemaVersion must be 1");
  uuid(input.studyId);
  scope(input.scope);
  for (const value of [
    input.title,
    input.population,
    input.jurisdiction,
    input.decisionContext,
    input.intervention,
    input.comparator,
    input.outcome,
    input.estimand,
    input.attritionAssessment,
    input.multipleTestingAssessment,
    input.publicationBiasAssessment,
  ])
    text(value, "study context");
  texts(input.authors, "authors");
  texts(input.mechanismIds, "mechanisms");
  texts(input.boundaryConditions, "boundary conditions");
  texts(input.alternativeExplanations, "alternative explanations");
  texts(input.limitations, "limitations");
  uri(input.publicationUri);
  if (input.preregistrationUri !== null) uri(input.preregistrationUri);
  if (
    instant(input.publishedAt) > instant(input.availableAt) ||
    instant(input.availableAt) > instant(input.recordedAt) ||
    instant(input.effectiveFrom) > instant(input.effectiveTo) ||
    instant(input.effectiveTo) > instant(input.publishedAt)
  )
    throw new TypeError("Study chronology invalid");
  enumeration(
    input.studyType,
    [
      "laboratory_experiment",
      "field_experiment",
      "observational",
      "quasi_experimental",
      "meta_analysis",
      "replication",
      "theoretical",
    ],
    "study type",
  );
  if (input.sampleSize === null) {
    if (input.sampleSizeMissingReason === null)
      throw new TypeError("Missing sample size requires a reason");
    text(input.sampleSizeMissingReason, "sample size missing reason");
  } else {
    integer(input.sampleSize, 1, 1e9);
    if (input.sampleSizeMissingReason !== null)
      throw new TypeError("Sample size and missing reason conflict");
  }
  if (input.effect === null) {
    if (input.effectMissingReason === null) throw new TypeError("Missing effect requires a reason");
    text(input.effectMissingReason, "effect missing reason");
  } else {
    if (input.effectMissingReason !== null)
      throw new TypeError("Effect and missing reason conflict");
    keys(input.effect, ["estimate", "unit", "interval", "uncertaintyMissingReason"]);
    decimal(input.effect.estimate);
    const estimate = decimalUnits(input.effect.estimate);
    text(input.effect.unit, "effect unit");
    if (input.effect.interval === null) {
      if (input.effect.uncertaintyMissingReason === null)
        throw new TypeError("Missing uncertainty requires reason");
      text(input.effect.uncertaintyMissingReason, "uncertainty reason");
    } else {
      const interval = input.effect.interval;
      keys(interval, ["lower", "upper", "level", "method"]);
      text(interval.method, "interval method");
      if (
        input.effect.uncertaintyMissingReason !== null ||
        decimalUnits(interval.lower) > estimate ||
        decimalUnits(interval.upper) < estimate ||
        decimal(interval.level, 0, 1) <= 0 ||
        decimal(interval.level) >= 1
      )
        throw new TypeError("Effect interval invalid");
    }
  }
  keys(input.replication, ["status", "relatedStudyIds", "rationale"]);
  enumeration(
    input.replication.status,
    ["original", "replicated", "mixed", "failed", "not_assessed"],
    "replication status",
  );
  text(input.replication.rationale, "replication rationale");
  texts(input.replication.relatedStudyIds, "related studies", 0);
  for (const id of input.replication.relatedStudyIds) {
    uuid(id);
    if (id === input.studyId) throw new TypeError("Study cannot replicate itself");
  }
  if (
    ["replicated", "mixed", "failed"].includes(input.replication.status) &&
    !input.replication.relatedStudyIds.length
  )
    throw new TypeError("Replication conclusion requires related study IDs");
  if (input.sourceSpans.length < 1 || input.sourceSpans.length > 100)
    throw new TypeError("Study requires bounded evidence spans");
  if (
    input.sourceDocuments.length < 1 ||
    input.sourceDocuments.length > 100 ||
    input.sourceSnapshots.length < 1 ||
    input.sourceSnapshots.length > 100
  )
    throw new TypeError("Study requires bounded source chronology proofs");
  const documents = new Map<string, SourceDocument>();
  const snapshots = new Map<string, SourceSnapshot>();
  for (const document of input.sourceDocuments) {
    assertSourceDocumentIntegrity(document);
    sameScope(input.scope, document);
    if (
      documents.has(document.documentId) ||
      instant(document.publishedAt) > instant(input.availableAt)
    )
      throw new TypeError("Duplicate or future source document");
    documents.set(document.documentId, document);
  }
  for (const snapshot of input.sourceSnapshots) {
    assertSourceSnapshotIntegrity(snapshot);
    sameScope(input.scope, snapshot);
    const document = documents.get(snapshot.documentId);
    if (
      !document ||
      snapshot.documentManifestSha256 !== document.manifestSha256 ||
      snapshots.has(snapshot.snapshotId) ||
      instant(snapshot.availableAt) > instant(input.availableAt) ||
      instant(snapshot.recordedAt) > instant(input.recordedAt)
    )
      throw new TypeError("Source snapshot binding or chronology invalid");
    snapshots.set(snapshot.snapshotId, snapshot);
  }
  const spanIds = new Set<string>();
  for (const span of input.sourceSpans) {
    assertSourceSpanIntegrity(span);
    sameScope(input.scope, span);
    const snapshot = snapshots.get(span.snapshotId);
    if (
      !snapshot ||
      span.snapshotManifestSha256 !== snapshot.manifestSha256 ||
      span.documentId !== snapshot.documentId ||
      span.endOffset > snapshot.contentLength ||
      spanIds.has(span.spanId)
    )
      throw new TypeError("Duplicate study span or missing source proof");
    spanIds.add(span.spanId);
  }
  return seal(input);
}
/** Select evidence as known; preserve disagreements and missing estimates without pooling incompatible studies. */
export function assessBehavioralEvidenceAsOf(input: {
  readonly scope: BehavioralScope;
  readonly knownAt: string;
  readonly systemAt: string;
  readonly mechanismId: string;
  readonly population: string;
  readonly jurisdiction: string;
  readonly studies: readonly BehavioralStudy[];
}) {
  keys(input, [
    "scope",
    "knownAt",
    "systemAt",
    "mechanismId",
    "population",
    "jurisdiction",
    "studies",
  ]);
  scope(input.scope);
  for (const value of [input.mechanismId, input.population, input.jurisdiction])
    text(value, "evidence query");
  const knownAt = instant(input.knownAt);
  const systemAt = instant(input.systemAt);
  if (input.studies.length > 10000) throw new TypeError("Evidence query exceeds budget");
  const ids = new Set<string>();
  for (const study of input.studies) {
    createBehavioralStudy(integrity(study));
    sameScope(input.scope, study.scope);
    if (ids.has(study.studyId)) throw new TypeError("Duplicate study ID");
    ids.add(study.studyId);
  }
  const visible = input.studies.filter(
    (study) =>
      instant(study.availableAt) <= knownAt &&
      instant(study.recordedAt) <= systemAt &&
      study.mechanismIds.includes(input.mechanismId),
  );
  const direct = visible
    .filter(
      (study) => study.population === input.population && study.jurisdiction === input.jurisdiction,
    )
    .sort((a, b) => (a.studyId < b.studyId ? -1 : 1));
  return seal({
    scope: input.scope,
    knownAt: input.knownAt,
    systemAt: input.systemAt,
    mechanismId: input.mechanismId,
    population: input.population,
    jurisdiction: input.jurisdiction,
    evidenceStatus: direct.length
      ? ("requires_contextual_human_assessment" as const)
      : ("no_matching_evidence" as const),
    grade: "unknown" as const,
    studies: direct,
    otherContextStudyIds: visible
      .filter((study) => !direct.includes(study))
      .map((study) => study.studyId)
      .sort(),
    missingIsNeutral: false as const,
    interpretation:
      "No automatic causal conclusion, replication grade, or pooled effect from study counts.",
  });
}
