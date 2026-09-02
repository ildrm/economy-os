import {
  assertExtractedClaimIntegrity,
  assertExtractedEventIntegrity,
  assertInstitutionalMeasureIntegrity,
  assertNarrativeArtifactEvidenceIntegrity,
  type EvidenceContext,
  type ExtractedClaim,
  type ExtractedEvent,
  type InstitutionalMeasure,
} from "./artifacts.js";
import {
  assertExactKeys,
  assertRecord,
  assertSameTenant,
  assertUuid,
  expectArray,
  expectString,
  literalOne,
  parseTenant,
  seal,
  verifyManifest,
} from "./internals.js";
import {
  assertContradictionGroupIntegrity,
  assertContradictionReviewLedgerIntegrity,
  type ContradictionGroup,
  type ContradictionReviewLedger,
  createContradictionReviewLedger,
} from "./review.js";
import {
  assertSourceDocumentIntegrity,
  assertSourceSnapshotIntegrity,
  assertSourceSpanIntegrity,
  assertTranslationArtifactIntegrity,
  type SourceDocument,
  type SourceSnapshot,
  type SourceSpan,
  type TranslationArtifact,
} from "./sources.js";

export interface NarrativeDatasetInput {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly documents: readonly Readonly<SourceDocument>[];
  readonly snapshots: readonly Readonly<SourceSnapshot>[];
  readonly spans: readonly Readonly<SourceSpan>[];
  readonly translations: readonly Readonly<TranslationArtifact>[];
  readonly claims: readonly Readonly<ExtractedClaim>[];
  readonly events: readonly Readonly<ExtractedEvent>[];
  readonly measures: readonly Readonly<InstitutionalMeasure>[];
  readonly contradictionGroups: readonly Readonly<ContradictionGroup>[];
  readonly reviewLedgers: readonly Readonly<ContradictionReviewLedger>[];
}

export interface NarrativeDataset extends NarrativeDatasetInput {
  readonly manifestSha256: string;
}

const INPUT_KEYS = [
  "schemaVersion",
  "organizationId",
  "workspaceId",
  "documents",
  "snapshots",
  "spans",
  "translations",
  "claims",
  "events",
  "measures",
  "contradictionGroups",
  "reviewLedgers",
] as const;

const BATCH_LIMITS: Readonly<
  Record<
    keyof Omit<NarrativeDatasetInput, "schemaVersion" | "organizationId" | "workspaceId">,
    number
  >
> = {
  documents: 500,
  snapshots: 1_000,
  spans: 5_000,
  translations: 2_000,
  claims: 2_000,
  events: 2_000,
  measures: 2_000,
  contradictionGroups: 500,
  reviewLedgers: 500,
};

function typedArray<T>(
  value: unknown,
  field: string,
  limit: number,
  validate: (item: unknown) => asserts item is T,
): readonly T[] {
  const items = expectArray(value, field);
  if (items.length > limit)
    throw new TypeError(`${field} exceeds its bounded batch limit of ${limit}`);
  for (const item of items) validate(item);
  return items as readonly T[];
}

function parseDatasetInput(value: unknown): NarrativeDatasetInput {
  assertRecord(value, "narrativeDataset");
  assertExactKeys(value, INPUT_KEYS, "narrativeDataset");
  const tenant = parseTenant(value, "narrativeDataset");
  return {
    schemaVersion: literalOne(value.schemaVersion, "narrativeDataset.schemaVersion"),
    ...tenant,
    documents: typedArray(
      value.documents,
      "narrativeDataset.documents",
      BATCH_LIMITS.documents,
      assertSourceDocumentIntegrity,
    ),
    snapshots: typedArray(
      value.snapshots,
      "narrativeDataset.snapshots",
      BATCH_LIMITS.snapshots,
      assertSourceSnapshotIntegrity,
    ),
    spans: typedArray(
      value.spans,
      "narrativeDataset.spans",
      BATCH_LIMITS.spans,
      assertSourceSpanIntegrity,
    ),
    translations: typedArray(
      value.translations,
      "narrativeDataset.translations",
      BATCH_LIMITS.translations,
      assertTranslationArtifactIntegrity,
    ),
    claims: typedArray(
      value.claims,
      "narrativeDataset.claims",
      BATCH_LIMITS.claims,
      assertExtractedClaimIntegrity,
    ),
    events: typedArray(
      value.events,
      "narrativeDataset.events",
      BATCH_LIMITS.events,
      assertExtractedEventIntegrity,
    ),
    measures: typedArray(
      value.measures,
      "narrativeDataset.measures",
      BATCH_LIMITS.measures,
      assertInstitutionalMeasureIntegrity,
    ),
    contradictionGroups: typedArray(
      value.contradictionGroups,
      "narrativeDataset.contradictionGroups",
      BATCH_LIMITS.contradictionGroups,
      assertContradictionGroupIntegrity,
    ),
    reviewLedgers: typedArray(
      value.reviewLedgers,
      "narrativeDataset.reviewLedgers",
      BATCH_LIMITS.reviewLedgers,
      assertContradictionReviewLedgerIntegrity,
    ),
  };
}

function uniqueById<T>(
  items: readonly T[],
  id: (item: T) => string,
  field: string,
): ReadonlyMap<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    const itemId = id(item);
    if (result.has(itemId)) throw new TypeError(`${field} has duplicate ID ${itemId}`);
    result.set(itemId, item);
  }
  return result;
}

function assertSupersessionGraph(
  entries: readonly { readonly id: string; readonly supersedes: string | null }[],
  field: string,
): void {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  for (const entry of entries) {
    if (entry.supersedes !== null && !byId.has(entry.supersedes)) {
      throw new TypeError(`${field} ${entry.id} supersedes an unknown ID`);
    }
    const seen = new Set<string>();
    let cursor: typeof entry | undefined = entry;
    while (cursor?.supersedes !== null && cursor?.supersedes !== undefined) {
      if (seen.has(cursor.id))
        throw new TypeError(`${field} supersession history contains a cycle`);
      seen.add(cursor.id);
      cursor = byId.get(cursor.supersedes);
    }
  }
}

function validateRelationships(dataset: NarrativeDatasetInput): void {
  for (const collection of [
    dataset.documents,
    dataset.snapshots,
    dataset.spans,
    dataset.translations,
    dataset.claims,
    dataset.events,
    dataset.measures,
    dataset.contradictionGroups,
    dataset.reviewLedgers,
  ]) {
    for (const item of collection) assertSameTenant(dataset, item, "narrative dataset item");
  }
  const documents = uniqueById(dataset.documents, (item) => item.documentId, "documents");
  const snapshots = uniqueById(dataset.snapshots, (item) => item.snapshotId, "snapshots");
  const spans = uniqueById(dataset.spans, (item) => item.spanId, "spans");
  uniqueById(dataset.translations, (item) => item.translationId, "translations");
  const claims = uniqueById(dataset.claims, (item) => item.claimId, "claims");
  uniqueById(dataset.events, (item) => item.eventId, "events");
  uniqueById(dataset.measures, (item) => item.measureId, "measures");
  const groups = uniqueById(
    dataset.contradictionGroups,
    (item) => item.contradictionGroupId,
    "contradictionGroups",
  );
  const ledgers = uniqueById(
    dataset.reviewLedgers,
    (item) => item.contradictionGroupId,
    "reviewLedgers",
  );

  for (const snapshot of dataset.snapshots) {
    const document = documents.get(snapshot.documentId);
    if (document === undefined || document.manifestSha256 !== snapshot.documentManifestSha256) {
      throw new TypeError("snapshot has an orphan or stale document manifest");
    }
  }
  for (const span of dataset.spans) {
    const document = documents.get(span.documentId);
    const snapshot = snapshots.get(span.snapshotId);
    if (
      document === undefined ||
      snapshot === undefined ||
      snapshot.documentId !== document.documentId ||
      span.snapshotManifestSha256 !== snapshot.manifestSha256
    ) {
      throw new TypeError("source span has an orphan or stale source binding");
    }
    if (span.endOffset > snapshot.contentLength) {
      throw new TypeError("source span offsets exceed snapshot length");
    }
    if (span.citationSnippet !== null) {
      if (
        !document.license.allowsCitationSnippets ||
        document.exportPolicy === "deny" ||
        span.citationSnippet.length > document.license.maxCitationCharacters
      ) {
        throw new TypeError("source span citation violates document policy");
      }
    }
  }
  for (const translation of dataset.translations) {
    const span = spans.get(translation.originalSpanId);
    if (
      span === undefined ||
      span.manifestSha256 !== translation.originalSpanManifestSha256 ||
      span.language !== translation.sourceLanguage
    ) {
      throw new TypeError("translation has an orphan or stale original source span");
    }
  }
  for (const artifact of [...dataset.claims, ...dataset.events, ...dataset.measures]) {
    if (artifact.evidenceSpanIds.some((spanId) => !spans.has(spanId))) {
      throw new TypeError("narrative artifact has an orphan or stale source span");
    }
    if (
      "structuredFact" in artifact &&
      artifact.structuredFact !== null &&
      artifact.structuredFact.supportingSpanIds.some(
        (spanId) => !artifact.evidenceSpanIds.includes(spanId),
      )
    ) {
      throw new TypeError("structured fact support is outside artifact evidence spans");
    }
  }
  for (const group of dataset.contradictionGroups) {
    const selectedClaims = group.claimIds.map((claimId) => {
      const claim = claims.get(claimId);
      if (claim === undefined) throw new TypeError("contradiction group has an orphan claim");
      return claim;
    });
    const manifests = selectedClaims.map((claim) => claim.manifestSha256).sort();
    if (manifests.join(":") !== group.claimManifestSha256s.join(":")) {
      throw new TypeError("contradiction group claim manifests are stale");
    }
    const ledger = ledgers.get(group.contradictionGroupId);
    if (
      ledger === undefined ||
      ledger.contradictionGroupManifestSha256 !== group.manifestSha256 ||
      ledger.contradictionDetectedAt !== group.detectedAt
    ) {
      throw new TypeError("every contradiction group requires a matching review ledger");
    }
    const expectedLedger = createContradictionReviewLedger(group, selectedClaims);
    if (
      expectedLedger.excludedReviewerPrincipalIds.join(":") !==
      ledger.excludedReviewerPrincipalIds.join(":")
    ) {
      throw new TypeError("review ledger independent-review exclusions are stale");
    }
  }
  for (const ledger of dataset.reviewLedgers) {
    if (!groups.has(ledger.contradictionGroupId)) {
      throw new TypeError("review ledger has an orphan contradiction group");
    }
  }
  assertSupersessionGraph(
    dataset.claims.map((claim) => ({ id: claim.claimId, supersedes: claim.supersedesClaimId })),
    "claim",
  );
  assertSupersessionGraph(
    dataset.events.map((event) => ({ id: event.eventId, supersedes: event.supersedesEventId })),
    "event",
  );
  assertSupersessionGraph(
    dataset.measures.map((measure) => ({
      id: measure.measureId,
      supersedes: measure.supersedesMeasureId,
    })),
    "measure",
  );
}

export function createNarrativeDataset(
  value: unknown,
  sourceTextBySnapshotId: Readonly<Record<string, string>>,
): Readonly<NarrativeDataset> {
  const parsed = parseDatasetInput(value);
  validateRelationships(parsed);
  const context: EvidenceContext = {
    documents: parsed.documents,
    snapshots: parsed.snapshots,
    spans: parsed.spans,
    sourceTextBySnapshotId,
  };
  for (const artifact of [...parsed.claims, ...parsed.events, ...parsed.measures]) {
    assertNarrativeArtifactEvidenceIntegrity(artifact, context);
  }
  return seal(parsed);
}

export function assertNarrativeDatasetIntegrity(
  value: unknown,
): asserts value is Readonly<NarrativeDataset> {
  assertRecord(value, "narrativeDataset");
  assertExactKeys(value, [...INPUT_KEYS, "manifestSha256"], "narrativeDataset");
  const manifest = expectString(value.manifestSha256, "narrativeDataset.manifestSha256");
  const parsed = parseDatasetInput(Object.fromEntries(INPUT_KEYS.map((key) => [key, value[key]])));
  validateRelationships(parsed);
  verifyManifest(value, manifest, "narrativeDataset");
}

export function createEmptyNarrativeDataset(
  organizationId: string,
  workspaceId: string,
): Readonly<NarrativeDataset> {
  assertUuid(organizationId, "organizationId");
  assertUuid(workspaceId, "workspaceId");
  return createNarrativeDataset(
    {
      schemaVersion: 1,
      organizationId,
      workspaceId,
      documents: [],
      snapshots: [],
      spans: [],
      translations: [],
      claims: [],
      events: [],
      measures: [],
      contradictionGroups: [],
      reviewLedgers: [],
    },
    {},
  );
}
