import type {
  ExtractedClaim,
  ExtractedEvent,
  InstitutionalMeasure,
  NarrativeArtifact,
} from "./artifacts.js";
import { assertNarrativeDatasetIntegrity, type NarrativeDataset } from "./dataset.js";
import {
  assertExactKeys,
  assertIsoInstant,
  assertLanguage,
  assertNonBlank,
  assertRecord,
  assertSha256,
  assertUuid,
  boundedInteger,
  cloneCanonical,
  compareInstant,
  deepFreeze,
  enumValue,
  expectArray,
  expectNullableString,
  expectString,
  literalOne,
  parseTenant,
  uniqueSortedStrings,
} from "./internals.js";

export type NarrativeArtifactKind = "claim" | "event" | "measure";

export interface NarrativeQueryRequest {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly effectiveAt: string;
  readonly knownAt: string;
  readonly artifactKinds: readonly NarrativeArtifactKind[];
  readonly languages: readonly string[];
  readonly after: string | null;
  readonly maxItems: number;
}

export interface NarrativeQueryItem {
  readonly kind: NarrativeArtifactKind;
  readonly id: string;
  readonly artifact: Readonly<NarrativeArtifact>;
}

export interface NarrativeQueryResult {
  readonly items: readonly Readonly<NarrativeQueryItem>[];
  readonly nextCursor: string | null;
  readonly truncated: boolean;
}

export interface ClaimComparisonRequest {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly claimIds: readonly string[];
  readonly effectiveAt: string;
  readonly knownAt: string;
  readonly maxPairs: number;
}

export interface ClaimComparison {
  readonly leftClaimId: string;
  readonly rightClaimId: string;
  readonly relationship: "compatible" | "contradiction_hypothesis" | "incomparable";
  readonly reason: string;
  readonly truthAdjudication: "none";
}

export interface NarrativeExportRequest {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly artifactKind: NarrativeArtifactKind;
  readonly artifactId: string;
  readonly mode: "citation" | "derived";
  readonly requestedBy: string;
  readonly purpose: string;
  readonly requestedAt: string;
  readonly authorizationSha256: string;
  readonly maxCitations: number;
}

export interface CitationSafeExport {
  readonly documentId: string;
  readonly snapshotId: string;
  readonly spanId: string;
  readonly sourceKey: string;
  readonly publisher: string;
  readonly attribution: string;
  readonly language: string;
  readonly locator: { readonly kind: "page" | "section"; readonly value: string };
  readonly snippet: string;
  readonly snapshotManifestSha256: string;
  readonly spanManifestSha256: string;
}

export interface NarrativeExportResult {
  readonly artifactKind: NarrativeArtifactKind;
  readonly artifactId: string;
  readonly artifactManifestSha256: string;
  readonly mode: "citation" | "derived";
  readonly derivedArtifact: Readonly<NarrativeArtifact> | null;
  readonly citations: readonly Readonly<CitationSafeExport>[];
  readonly fullTextIncluded: false;
}

function datasetTenant(
  dataset: Readonly<NarrativeDataset>,
  organizationId: string,
  workspaceId: string,
): void {
  if (dataset.organizationId !== organizationId || dataset.workspaceId !== workspaceId) {
    throw new TypeError("request crosses organization or workspace boundaries");
  }
}

function parseQueryRequest(value: unknown): NarrativeQueryRequest {
  assertRecord(value, "narrativeQuery");
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "organizationId",
      "workspaceId",
      "effectiveAt",
      "knownAt",
      "artifactKinds",
      "languages",
      "after",
      "maxItems",
    ],
    "narrativeQuery",
  );
  const tenant = parseTenant(value, "narrativeQuery");
  const effectiveAt = expectString(value.effectiveAt, "narrativeQuery.effectiveAt");
  const knownAt = expectString(value.knownAt, "narrativeQuery.knownAt");
  const after = expectNullableString(value.after, "narrativeQuery.after");
  assertIsoInstant(effectiveAt, "narrativeQuery.effectiveAt");
  assertIsoInstant(knownAt, "narrativeQuery.knownAt");
  if (after !== null) {
    const match = /^(claim|event|measure):(.+)$/.exec(after);
    if (match === null || match[2] === undefined) {
      throw new TypeError("narrativeQuery.after must be a canonical kind:UUID cursor");
    }
    assertUuid(match[2], "narrativeQuery.after ID");
  }
  return {
    schemaVersion: literalOne(value.schemaVersion, "narrativeQuery.schemaVersion"),
    ...tenant,
    effectiveAt,
    knownAt,
    artifactKinds: uniqueSortedStrings(
      expectArray(value.artifactKinds, "narrativeQuery.artifactKinds"),
      "narrativeQuery.artifactKinds",
      (item, field) => {
        if (!["claim", "event", "measure"].includes(item)) {
          throw new TypeError(`${field} must be a narrative artifact kind`);
        }
      },
      false,
    ) as readonly NarrativeArtifactKind[],
    languages: uniqueSortedStrings(
      expectArray(value.languages, "narrativeQuery.languages"),
      "narrativeQuery.languages",
      assertLanguage,
    ),
    after,
    maxItems: boundedInteger(value.maxItems, "narrativeQuery.maxItems", 1, 200),
  };
}

function knownAt(artifact: Readonly<NarrativeArtifact>, at: string): boolean {
  return (
    compareInstant(artifact.extractedAt, at) <= 0 &&
    compareInstant(artifact.cutoffs.systemCutoff, at) <= 0 &&
    compareInstant(artifact.cutoffs.availableCutoff, at) <= 0
  );
}

function claimEffectiveAt(claim: Readonly<ExtractedClaim>, at: string): boolean {
  return (
    compareInstant(claim.validFrom, at) <= 0 &&
    (claim.validUntil === null || compareInstant(at, claim.validUntil) < 0)
  );
}

function artifactRows(dataset: Readonly<NarrativeDataset>): readonly NarrativeQueryItem[] {
  return [
    ...dataset.claims.map((artifact) => ({
      kind: "claim" as const,
      id: artifact.claimId,
      artifact,
    })),
    ...dataset.events.map((artifact) => ({
      kind: "event" as const,
      id: artifact.eventId,
      artifact,
    })),
    ...dataset.measures.map((artifact) => ({
      kind: "measure" as const,
      id: artifact.measureId,
      artifact,
    })),
  ];
}

function visibleAt(row: NarrativeQueryItem, request: NarrativeQueryRequest): boolean {
  if (!knownAt(row.artifact, request.knownAt)) return false;
  if (request.languages.length > 0 && !request.languages.includes(row.artifact.language))
    return false;
  if (row.kind === "claim")
    return claimEffectiveAt(row.artifact as ExtractedClaim, request.effectiveAt);
  if (row.kind === "event") {
    return compareInstant((row.artifact as ExtractedEvent).occurredAt, request.effectiveAt) <= 0;
  }
  const measure = row.artifact as InstitutionalMeasure;
  return compareInstant(measure.effectiveAt ?? measure.announcedAt, request.effectiveAt) <= 0;
}

export function queryNarrativeArtifacts(
  dataset: Readonly<NarrativeDataset>,
  value: unknown,
): Readonly<NarrativeQueryResult> {
  assertNarrativeDatasetIntegrity(dataset);
  const request = parseQueryRequest(value);
  datasetTenant(dataset, request.organizationId, request.workspaceId);
  const rows = artifactRows(dataset)
    .filter((row) => request.artifactKinds.includes(row.kind) && visibleAt(row, request))
    .sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
  const afterRows =
    request.after === null
      ? rows
      : rows.filter((row) => `${row.kind}:${row.id}`.localeCompare(request.after as string) > 0);
  const truncated = afterRows.length > request.maxItems;
  const items = afterRows.slice(0, request.maxItems);
  const nextCursor = truncated
    ? `${items[items.length - 1]?.kind}:${items[items.length - 1]?.id}`
    : null;
  return deepFreeze(cloneCanonical({ items, nextCursor, truncated }));
}

function parseComparisonRequest(value: unknown): ClaimComparisonRequest {
  assertRecord(value, "claimComparison");
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "organizationId",
      "workspaceId",
      "claimIds",
      "effectiveAt",
      "knownAt",
      "maxPairs",
    ],
    "claimComparison",
  );
  const tenant = parseTenant(value, "claimComparison");
  const effectiveAt = expectString(value.effectiveAt, "claimComparison.effectiveAt");
  const knownAtValue = expectString(value.knownAt, "claimComparison.knownAt");
  assertIsoInstant(effectiveAt, "claimComparison.effectiveAt");
  assertIsoInstant(knownAtValue, "claimComparison.knownAt");
  const claimIds = uniqueSortedStrings(
    expectArray(value.claimIds, "claimComparison.claimIds"),
    "claimComparison.claimIds",
    assertUuid,
    false,
  );
  if (claimIds.length < 2 || claimIds.length > 50) {
    throw new TypeError("claimComparison.claimIds must contain 2..50 IDs");
  }
  return {
    schemaVersion: literalOne(value.schemaVersion, "claimComparison.schemaVersion"),
    ...tenant,
    claimIds,
    effectiveAt,
    knownAt: knownAtValue,
    maxPairs: boundedInteger(value.maxPairs, "claimComparison.maxPairs", 1, 1_000),
  };
}

function comparePair(
  left: Readonly<ExtractedClaim>,
  right: Readonly<ExtractedClaim>,
): ClaimComparison {
  const leftFact = left.structuredFact;
  const rightFact = right.structuredFact;
  let relationship: ClaimComparison["relationship"] = "incomparable";
  let reason =
    "Claims do not share a directly comparable structured subject, predicate, kind, and unit.";
  const comparable =
    leftFact.subjectKey === rightFact.subjectKey &&
    leftFact.predicateKey === rightFact.predicateKey &&
    leftFact.objectKind === rightFact.objectKind &&
    leftFact.unit === rightFact.unit;
  if (comparable) {
    if (
      leftFact.canonicalValue === rightFact.canonicalValue &&
      leftFact.polarity === rightFact.polarity
    ) {
      relationship = "compatible";
      reason = "Structured values and polarity agree; this does not establish truth.";
    } else if (
      (leftFact.canonicalValue === rightFact.canonicalValue &&
        leftFact.polarity !== rightFact.polarity) ||
      (leftFact.polarity === "affirm" &&
        rightFact.polarity === "affirm" &&
        leftFact.canonicalValue !== rightFact.canonicalValue)
    ) {
      relationship = "contradiction_hypothesis";
      reason = "Structured values or polarity conflict; analyst review is required.";
    }
  }
  return {
    leftClaimId: left.claimId,
    rightClaimId: right.claimId,
    relationship,
    reason,
    truthAdjudication: "none",
  };
}

export function compareNarrativeClaims(
  dataset: Readonly<NarrativeDataset>,
  value: unknown,
): readonly Readonly<ClaimComparison>[] {
  assertNarrativeDatasetIntegrity(dataset);
  const request = parseComparisonRequest(value);
  datasetTenant(dataset, request.organizationId, request.workspaceId);
  const byId = new Map(dataset.claims.map((claim) => [claim.claimId, claim]));
  const selected = request.claimIds.map((claimId) => {
    const claim = byId.get(claimId);
    if (claim === undefined) throw new TypeError(`claim comparison has unknown claim ${claimId}`);
    if (!knownAt(claim, request.knownAt) || !claimEffectiveAt(claim, request.effectiveAt)) {
      throw new TypeError(`claim comparison would leak unavailable claim ${claimId}`);
    }
    return claim;
  });
  const pairCount = (selected.length * (selected.length - 1)) / 2;
  if (pairCount > request.maxPairs) throw new TypeError("claim comparison exceeds maxPairs");
  const comparisons: ClaimComparison[] = [];
  for (let leftIndex = 0; leftIndex < selected.length; leftIndex += 1) {
    const left = selected[leftIndex];
    if (left === undefined) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < selected.length; rightIndex += 1) {
      const right = selected[rightIndex];
      if (right !== undefined) comparisons.push(comparePair(left, right));
    }
  }
  return deepFreeze(cloneCanonical(comparisons));
}

function parseExportRequest(value: unknown): NarrativeExportRequest {
  assertRecord(value, "narrativeExport");
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "organizationId",
      "workspaceId",
      "artifactKind",
      "artifactId",
      "mode",
      "requestedBy",
      "purpose",
      "requestedAt",
      "authorizationSha256",
      "maxCitations",
    ],
    "narrativeExport",
  );
  const tenant = parseTenant(value, "narrativeExport");
  const artifactId = expectString(value.artifactId, "narrativeExport.artifactId");
  const requestedBy = expectString(value.requestedBy, "narrativeExport.requestedBy");
  const purpose = expectString(value.purpose, "narrativeExport.purpose");
  const requestedAt = expectString(value.requestedAt, "narrativeExport.requestedAt");
  const authorizationSha256 = expectString(
    value.authorizationSha256,
    "narrativeExport.authorizationSha256",
  );
  assertUuid(artifactId, "narrativeExport.artifactId");
  assertUuid(requestedBy, "narrativeExport.requestedBy");
  assertNonBlank(purpose, "narrativeExport.purpose", 1_000);
  assertIsoInstant(requestedAt, "narrativeExport.requestedAt");
  assertSha256(authorizationSha256, "narrativeExport.authorizationSha256");
  return {
    schemaVersion: literalOne(value.schemaVersion, "narrativeExport.schemaVersion"),
    ...tenant,
    artifactKind: enumValue(
      value.artifactKind,
      ["claim", "event", "measure"] as const,
      "narrativeExport.artifactKind",
    ),
    artifactId,
    mode: enumValue(value.mode, ["citation", "derived"] as const, "narrativeExport.mode"),
    requestedBy,
    purpose,
    requestedAt,
    authorizationSha256,
    maxCitations: boundedInteger(value.maxCitations, "narrativeExport.maxCitations", 1, 50),
  };
}

function selectArtifact(
  dataset: Readonly<NarrativeDataset>,
  kind: NarrativeArtifactKind,
  artifactId: string,
): Readonly<NarrativeArtifact> {
  const artifact =
    kind === "claim"
      ? dataset.claims.find((item) => item.claimId === artifactId)
      : kind === "event"
        ? dataset.events.find((item) => item.eventId === artifactId)
        : dataset.measures.find((item) => item.measureId === artifactId);
  if (artifact === undefined) throw new TypeError("narrative export artifact does not exist");
  return artifact;
}

export function exportNarrativeArtifact(
  dataset: Readonly<NarrativeDataset>,
  value: unknown,
): Readonly<NarrativeExportResult> {
  assertNarrativeDatasetIntegrity(dataset);
  const request = parseExportRequest(value);
  datasetTenant(dataset, request.organizationId, request.workspaceId);
  const artifact = selectArtifact(dataset, request.artifactKind, request.artifactId);
  if (!knownAt(artifact, request.requestedAt)) {
    throw new TypeError("narrative export cannot include an artifact unavailable at request time");
  }
  const spans = new Map(dataset.spans.map((span) => [span.spanId, span]));
  const snapshots = new Map(dataset.snapshots.map((snapshot) => [snapshot.snapshotId, snapshot]));
  const documents = new Map(dataset.documents.map((document) => [document.documentId, document]));
  const citations = artifact.evidenceSpanIds
    .map((spanId): CitationSafeExport => {
      const span = spans.get(spanId);
      const snapshot = span === undefined ? undefined : snapshots.get(span.snapshotId);
      const document = span === undefined ? undefined : documents.get(span.documentId);
      if (span === undefined || snapshot === undefined || document === undefined) {
        throw new TypeError("narrative export has orphan source evidence");
      }
      if (document.exportPolicy === "deny") throw new TypeError("source policy denies export");
      if (request.mode === "citation") {
        if (
          document.exportPolicy !== "citation_only" ||
          !document.license.allowsCitationSnippets ||
          span.citationSnippet === null
        ) {
          throw new TypeError("source policy does not allow citation export");
        }
      } else {
        if (
          document.exportPolicy !== "derived_only" ||
          !document.license.allowsDerivedExport ||
          document.classification === "confidential" ||
          document.classification === "restricted"
        ) {
          throw new TypeError("source policy does not allow derived artifact export");
        }
      }
      if (span.citationSnippet === null) {
        throw new TypeError("export fails closed without a citation-safe snippet");
      }
      return {
        documentId: document.documentId,
        snapshotId: snapshot.snapshotId,
        spanId: span.spanId,
        sourceKey: document.sourceKey,
        publisher: document.publisher,
        attribution: document.attribution,
        language: span.language,
        locator: span.locator,
        snippet: span.citationSnippet,
        snapshotManifestSha256: snapshot.manifestSha256,
        spanManifestSha256: span.manifestSha256,
      };
    })
    .sort((left, right) => left.spanId.localeCompare(right.spanId));
  if (citations.length > request.maxCitations) {
    throw new TypeError("narrative export exceeds maxCitations and fails closed");
  }
  return deepFreeze(
    cloneCanonical({
      artifactKind: request.artifactKind,
      artifactId: request.artifactId,
      artifactManifestSha256: artifact.manifestSha256,
      mode: request.mode,
      derivedArtifact: request.mode === "derived" ? artifact : null,
      citations,
      fullTextIncluded: false as const,
    }),
  );
}
