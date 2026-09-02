import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  type AnalystReviewDecision,
  appendAnalystReviewDecision,
  assertAnalystReviewDecisionIntegrity,
  assertContradictionGroupIntegrity,
  assertContradictionReviewLedgerIntegrity,
  assertExtractedClaimIntegrity,
  assertNarrativeDatasetIntegrity,
  assertSourceDocumentIntegrity,
  assertSourceSnapshotIntegrity,
  assertSourceSpanIntegrity,
  assertTranslationArtifactIntegrity,
  type ContradictionGroup,
  compareNarrativeClaims,
  createAnalystReviewDecision,
  createContradictionGroup,
  createContradictionReviewLedger,
  createEmptyNarrativeDataset,
  createExtractedClaim,
  createExtractedEvent,
  createInstitutionalMeasure,
  createNarrativeDataset,
  createSourceDocument,
  createSourceSnapshot,
  createSourceSpan,
  createTranslationArtifact,
  detectContradictionCandidates,
  type EvidenceContext,
  type ExtractedClaim,
  type ExtractedClaimInput,
  type ExtractedEvent,
  exportNarrativeArtifact,
  type InstitutionalMeasure,
  type NarrativeDataset,
  type NarrativeDatasetInput,
  queryNarrativeArtifacts,
  type SourceDocument,
  type SourceDocumentInput,
  type SourceSnapshot,
  type SourceSnapshotInput,
  type SourceSpan,
  type SourceSpanInput,
} from "./index.js";
import {
  assertExactDecimal,
  assertExactKeys,
  assertIsoDate,
  assertIsoInstant,
  assertKey,
  assertLanguage,
  assertLocale,
  assertNonBlank,
  assertProbability,
  assertRecord,
  assertSameTenant,
  assertSemver,
  assertSha256,
  assertUuid,
  boundedInteger,
  canonicalJson,
  cloneCanonical,
  deepFreeze,
  enumValue,
  expectArray,
  expectBoolean,
  expectInteger,
  expectNullableString,
  expectString,
  literalOne,
  parseTenant,
  seal,
  uniqueSortedStrings,
  verifyManifest,
} from "./internals.js";

const uuid = (suffix: number): string =>
  `11111111-1111-8111-8111-${suffix.toString().padStart(12, "0")}`;
const ORG = uuid(1);
const WORKSPACE = uuid(2);
const OTHER_WORKSPACE = uuid(3);
const DOCUMENT_ID = uuid(10);
const SNAPSHOT_ID = uuid(11);
const SPAN_ID = uuid(12);
const TRANSLATION_ID = uuid(13);
const EXTRACTOR = uuid(20);
const REVIEWER = uuid(21);
const REVIEWER_TWO = uuid(22);
const ENTITY = uuid(23);
const INSTITUTION = uuid(24);
const CLAIM_ONE = uuid(30);
const CLAIM_TWO = uuid(31);
const CLAIM_THREE = uuid(32);
const EVENT_ID = uuid(40);
const MEASURE_ID = uuid(41);
const GROUP_ID = uuid(50);
const DECISION_ONE = uuid(60);
const DECISION_TWO = uuid(61);
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const SOURCE_TEXT =
  "On 2024-01-15, the Central Bank reported inflation at 10.5 percent. " +
  "Another bulletin reported inflation at 11.0 percent on 2024-01-15. " +
  "The policy rate becomes 12.0 percent on 2024-02-01.";
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

function documentInput(overrides: Partial<SourceDocumentInput> = {}): SourceDocumentInput {
  return {
    schemaVersion: 1,
    organizationId: ORG,
    workspaceId: WORKSPACE,
    documentId: DOCUMENT_ID,
    sourceKey: "central-bank.release-2024-01",
    sourceType: "official_release",
    canonicalUri: "https://example.invalid/release/2024-01",
    title: "Central Bank fixture release",
    publisher: "Fixture Central Bank",
    language: "en",
    locale: "en-US",
    publishedAt: "2024-01-15T00:00:00Z",
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
    attribution: "Fixture Central Bank, January 2024 release.",
    ...overrides,
  };
}

function snapshotInput(
  document: Readonly<SourceDocument>,
  overrides: Partial<SourceSnapshotInput> = {},
): SourceSnapshotInput {
  return {
    schemaVersion: 1,
    organizationId: ORG,
    workspaceId: WORKSPACE,
    snapshotId: SNAPSHOT_ID,
    documentId: document.documentId,
    documentManifestSha256: document.manifestSha256,
    versionLabel: "retrieved-2024-01-16",
    mediaType: "text/plain; charset=utf-8",
    language: "en",
    locale: "en-US",
    offsetEncoding: "utf16_code_unit",
    contentLength: SOURCE_TEXT.length,
    contentSha256: hash(SOURCE_TEXT),
    retrievedAt: "2024-01-16T00:00:00Z",
    availableAt: "2024-01-15T12:00:00Z",
    recordedAt: "2024-01-17T00:00:00Z",
    ...overrides,
  };
}

function spanInput(
  snapshot: Readonly<SourceSnapshot>,
  overrides: Partial<SourceSpanInput> = {},
): SourceSpanInput {
  return {
    schemaVersion: 1,
    organizationId: ORG,
    workspaceId: WORKSPACE,
    spanId: SPAN_ID,
    documentId: DOCUMENT_ID,
    snapshotId: snapshot.snapshotId,
    snapshotManifestSha256: snapshot.manifestSha256,
    language: "en",
    locale: "en-US",
    locator: { kind: "section", value: "fixture-section-1" },
    startOffset: 0,
    endOffset: SOURCE_TEXT.length,
    textSha256: hash(SOURCE_TEXT),
    citationSnippet: SOURCE_TEXT,
    snippetStartOffset: 0,
    snippetEndOffset: SOURCE_TEXT.length,
    ...overrides,
  };
}

interface SourcesFixture {
  readonly document: Readonly<SourceDocument>;
  readonly snapshot: Readonly<SourceSnapshot>;
  readonly span: Readonly<SourceSpan>;
  readonly context: EvidenceContext;
}

function sourcesFixture(documentOverrides: Partial<SourceDocumentInput> = {}): SourcesFixture {
  const document = createSourceDocument(documentInput(documentOverrides));
  const snapshot = createSourceSnapshot(snapshotInput(document), document, SOURCE_TEXT);
  const span = createSourceSpan(spanInput(snapshot), document, snapshot, SOURCE_TEXT);
  return {
    document,
    snapshot,
    span,
    context: {
      documents: [document],
      snapshots: [snapshot],
      spans: [span],
      sourceTextBySnapshotId: { [snapshot.snapshotId]: SOURCE_TEXT },
    },
  };
}

function governance() {
  return {
    extraction: {
      method: "machine" as const,
      extractorPrincipalId: EXTRACTOR,
      modelProvider: "fixture-provider",
      modelName: "fixture-extractor",
      modelVersion: "2024-01",
      codeVersion: "1.0.0",
      codeSha256: SHA_A,
      configSha256: SHA_B,
      promptSha256: SHA_C,
    },
    cutoffs: {
      publicationCutoff: "2024-01-15T00:00:00Z",
      retrievalCutoff: "2024-01-16T00:00:00Z",
      availableCutoff: "2024-01-16T00:00:00Z",
      systemCutoff: "2024-01-17T00:00:00Z",
    },
    extractedAt: "2024-01-18T00:00:00Z",
    confidence: "0.8",
    uncertainty: [
      {
        kind: "extraction" as const,
        description: "Fixture extraction has not been empirically evaluated.",
      },
    ],
    entityResolution: { state: "resolved" as const, canonicalEntityIds: [ENTITY] },
    limitations: ["Synthetic fixture only."],
    invalidationConditions: ["Invalidate if the source snapshot is withdrawn."],
  };
}

function claimInput(
  claimId = CLAIM_ONE,
  value = "10.5",
  overrides: Partial<ExtractedClaimInput> = {},
): ExtractedClaimInput {
  const canonicalValue = value.replace(/\.0+$/, "");
  return {
    schemaVersion: 1,
    organizationId: ORG,
    workspaceId: WORKSPACE,
    claimId,
    language: "en",
    locale: "en-US",
    claimType: "factual",
    statement: `Inflation was ${value} percent on 2024-01-15.`,
    structuredFact: {
      subjectKey: "economy.fixture",
      predicateKey: "inflation.rate",
      objectKind: "number",
      canonicalValue,
      unit: "percent",
      surfaceText: value,
      supportingSpanIds: [SPAN_ID],
      normalizationRationale: "The source expresses the value directly as a percent.",
      polarity: "affirm",
    },
    evidenceSpanIds: [SPAN_ID],
    validFrom: "2024-01-15T00:00:00Z",
    validUntil: null,
    epistemicScope: "descriptive_non_causal",
    supersedesClaimId: null,
    ...governance(),
    ...overrides,
  };
}

function createClaims(
  context: EvidenceContext,
): readonly [Readonly<ExtractedClaim>, Readonly<ExtractedClaim>] {
  return [
    createExtractedClaim(claimInput(CLAIM_ONE, "10.5"), context),
    createExtractedClaim(claimInput(CLAIM_TWO, "11.0"), context),
  ];
}

function eventFixture(context: EvidenceContext): Readonly<ExtractedEvent> {
  return createExtractedEvent(
    {
      schemaVersion: 1,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      eventId: EVENT_ID,
      language: "en",
      locale: "en-US",
      basis: "reported_fact",
      eventType: "statistical_release",
      title: "Central Bank inflation report on 2024-01-15",
      occurredAt: "2024-01-15T00:00:00Z",
      evidenceSpanIds: [SPAN_ID],
      epistemicScope: "descriptive_non_causal",
      supersedesEventId: null,
      ...governance(),
    },
    context,
  );
}

function measureFixture(context: EvidenceContext): Readonly<InstitutionalMeasure> {
  return createInstitutionalMeasure(
    {
      schemaVersion: 1,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      measureId: MEASURE_ID,
      institutionEntityId: INSTITUTION,
      language: "en",
      locale: "en-US",
      basis: "reported_fact",
      measureType: "policy_rate_change",
      description: "Policy rate set to 12.0 percent on 2024-02-01.",
      announcedAt: "2024-01-15T00:00:00Z",
      effectiveAt: "2024-02-01T00:00:00Z",
      structuredFact: {
        subjectKey: "central-bank.fixture",
        predicateKey: "policy-rate.target",
        objectKind: "number",
        canonicalValue: "12",
        unit: "percent",
        surfaceText: "12.0",
        supportingSpanIds: [SPAN_ID],
        normalizationRationale: "The stated percentage is preserved exactly.",
        polarity: "affirm",
      },
      evidenceSpanIds: [SPAN_ID],
      epistemicScope: "descriptive_non_causal",
      supersedesMeasureId: null,
      ...governance(),
    },
    context,
  );
}

function groupFixture(
  claims: readonly Readonly<ExtractedClaim>[],
  overrides: Record<string, unknown> = {},
): Readonly<ContradictionGroup> {
  return createContradictionGroup(
    {
      schemaVersion: 1,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      contradictionGroupId: GROUP_ID,
      claimIds: [CLAIM_TWO, CLAIM_ONE],
      subjectKey: "economy.fixture",
      predicateKey: "inflation.rate",
      detectedAt: "2024-01-20T00:00:00Z",
      knownAt: "2024-01-19T00:00:00Z",
      detectionCodeSha256: SHA_A,
      detectionConfigSha256: SHA_B,
      workflowStatus: "hypothesis",
      adjudication: "unadjudicated",
      limitations: ["Candidate grouping is not truth adjudication."],
      invalidationConditions: ["Invalidate if claim normalization changes."],
      ...overrides,
    },
    claims,
  );
}

function reviewDecision(
  group: Readonly<ContradictionGroup>,
  overrides: Partial<Omit<AnalystReviewDecision, "manifestSha256">> = {},
): Readonly<AnalystReviewDecision> {
  return createAnalystReviewDecision({
    schemaVersion: 1,
    organizationId: ORG,
    workspaceId: WORKSPACE,
    decisionId: DECISION_ONE,
    contradictionGroupId: group.contradictionGroupId,
    contradictionGroupManifestSha256: group.manifestSha256,
    sequence: 1,
    decisionKind: "request_evidence",
    reviewerPrincipalId: REVIEWER,
    decidedAt: "2024-01-21T00:00:00Z",
    rationale: "Independent analyst requests another licensed source.",
    evidenceClaimIds: [CLAIM_ONE, CLAIM_TWO],
    supersedesDecisionId: null,
    independenceAttestationSha256: SHA_C,
    previousDecisionSha256: null,
    ...overrides,
  });
}

function datasetFixture(
  sources: SourcesFixture,
  claims = createClaims(sources.context),
): Readonly<NarrativeDataset> {
  const group = groupFixture(claims);
  const ledger = createContradictionReviewLedger(group, claims);
  return createNarrativeDataset(
    {
      schemaVersion: 1,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      documents: [sources.document],
      snapshots: [sources.snapshot],
      spans: [sources.span],
      translations: [],
      claims,
      events: [eventFixture(sources.context)],
      measures: [measureFixture(sources.context)],
      contradictionGroups: [group],
      reviewLedgers: [ledger],
    },
    sources.context.sourceTextBySnapshotId,
  );
}

function unsignedDataset(dataset: Readonly<NarrativeDataset>): NarrativeDatasetInput {
  const { manifestSha256, ...input } = dataset;
  expect(manifestSha256).toMatch(/^[a-f0-9]{64}$/);
  return input;
}

describe("licensed immutable source contracts", () => {
  it("seals documents and rejects extra fields, invalid policy combinations, and tampering", () => {
    const document = createSourceDocument(documentInput());
    expect(document.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(document)).toBe(true);
    assertSourceDocumentIntegrity(document);
    expect(createSourceDocument(documentInput()).manifestSha256).toBe(document.manifestSha256);
    expect(() => createSourceDocument({ ...documentInput(), extra: true })).toThrow("extra: extra");
    expect(() =>
      createSourceDocument(
        documentInput({
          exportPolicy: "derived_only",
          license: { ...documentInput().license, allowsDerivedExport: false },
        }),
      ),
    ).toThrow("requires a license allowing derived export");
    expect(() =>
      createSourceDocument(
        documentInput({
          license: {
            ...documentInput().license,
            allowsCitationSnippets: false,
            maxCitationCharacters: 2,
          },
        }),
      ),
    ).toThrow("must set maxCitationCharacters to 0");
    expect(() => assertSourceDocumentIntegrity({ ...document, title: "Forged" })).toThrow(
      "digest does not match",
    );
  });

  it("requires immutable snapshot content proof and chronological availability", () => {
    const document = createSourceDocument(documentInput());
    const snapshot = createSourceSnapshot(snapshotInput(document), document, SOURCE_TEXT);
    assertSourceSnapshotIntegrity(snapshot);
    expect(() =>
      createSourceSnapshot(snapshotInput(document), document, `${SOURCE_TEXT}!`),
    ).toThrow("content proof");
    expect(() =>
      createSourceSnapshot(
        snapshotInput(document, { availableAt: "2024-01-17T00:00:00Z" }),
        document,
        SOURCE_TEXT,
      ),
    ).toThrow("availableAt <= retrievedAt <= recordedAt");
    expect(() => assertSourceSnapshotIntegrity({ ...snapshot, contentSha256: SHA_A })).toThrow(
      "digest does not match",
    );
  });

  it("binds exact source spans to offsets, digests, language, and licensed snippets", () => {
    const { document, snapshot, span } = sourcesFixture();
    assertSourceSpanIntegrity(span);
    expect(() =>
      createSourceSpan(
        spanInput(snapshot, { endOffset: SOURCE_TEXT.length + 1 }),
        document,
        snapshot,
        SOURCE_TEXT,
      ),
    ).toThrow("exceeds snapshot content length");
    expect(() =>
      createSourceSpan(spanInput(snapshot, { textSha256: SHA_A }), document, snapshot, SOURCE_TEXT),
    ).toThrow("exact source offsets");
    expect(() =>
      createSourceSpan(
        spanInput(snapshot, { citationSnippet: "invented" }),
        document,
        snapshot,
        SOURCE_TEXT,
      ),
    ).toThrow("not verbatim");
    expect(() =>
      createSourceSpan(spanInput(snapshot), document, snapshot, `${SOURCE_TEXT}!`),
    ).toThrow("immutable snapshot digest");
  });

  it("preserves translations as separately sealed derivatives linked to original evidence", () => {
    const { span } = sourcesFixture();
    const translatedText = "تورم ۱۰.۵ درصد گزارش شد.";
    const translation = createTranslationArtifact(
      {
        schemaVersion: 1,
        organizationId: ORG,
        workspaceId: WORKSPACE,
        translationId: TRANSLATION_ID,
        originalSpanId: span.spanId,
        originalSpanManifestSha256: span.manifestSha256,
        sourceLanguage: "en",
        targetLanguage: "fa",
        targetLocale: "fa-IR",
        translatedTextSha256: hash(translatedText),
        method: "machine",
        translatorPrincipalId: null,
        modelIdentity: {
          provider: "fixture-provider",
          model: "fixture-translator",
          version: "1.0.0",
          configSha256: SHA_A,
        },
        createdAt: "2024-01-18T00:00:00Z",
        limitations: ["Translation is not original evidence."],
      },
      span,
      translatedText,
    );
    assertTranslationArtifactIntegrity(translation);
    expect(translation.originalSpanId).toBe(span.spanId);
    expect(translation).not.toHaveProperty("translatedText");
    expect(() =>
      createTranslationArtifact(
        { ...translation, manifestSha256: undefined },
        span,
        translatedText,
      ),
    ).toThrow();
    expect(() =>
      assertTranslationArtifactIntegrity({ ...translation, sourceLanguage: "fr" }),
    ).toThrow("digest does not match");
  });
});

describe("evidence-grounded narrative artifacts", () => {
  it("creates exact factual claims without causal promotion and detects tampering", () => {
    const sources = sourcesFixture();
    const claim = createExtractedClaim(claimInput(), sources.context);
    expect(claim.epistemicScope).toBe("descriptive_non_causal");
    expect(claim.structuredFact.supportingSpanIds).toEqual([SPAN_ID]);
    expect(Object.isFrozen(claim.structuredFact)).toBe(true);
    assertExtractedClaimIntegrity(claim);
    expect(() => assertExtractedClaimIntegrity({ ...claim, statement: "Forged" })).toThrow(
      "digest does not match",
    );
    expect(() =>
      createExtractedClaim({ ...claimInput(), surprise: "extra" }, sources.context),
    ).toThrow("extra: surprise");
    expect(() =>
      createExtractedClaim(
        claimInput(CLAIM_ONE, "10.5", { epistemicScope: "causal" as never }),
        sources.context,
      ),
    ).toThrow("descriptive_non_causal");
  });

  it("rejects orphan evidence, changed source digests, and cross-tenant mixing", () => {
    const sources = sourcesFixture();
    expect(() => createExtractedClaim(claimInput(), { ...sources.context, spans: [] })).toThrow(
      "orphan evidence span",
    );
    expect(() =>
      createExtractedClaim(claimInput(), {
        ...sources.context,
        sourceTextBySnapshotId: { [SNAPSHOT_ID]: `${SOURCE_TEXT}!` },
      }),
    ).toThrow("valid immutable source text proof");
    expect(() =>
      createExtractedClaim(
        claimInput(CLAIM_ONE, "10.5", { workspaceId: OTHER_WORKSPACE }),
        sources.context,
      ),
    ).toThrow("crosses organization or workspace");
    expect(() =>
      createExtractedClaim(
        claimInput(CLAIM_ONE, "10.5", { language: "fa", locale: "fa-IR" }),
        sources.context,
      ),
    ).toThrow("original-language spans, not translations");
  });

  it("rejects invented numbers, dates, and structured values absent from exact spans", () => {
    const sources = sourcesFixture();
    expect(() => createExtractedClaim(claimInput(CLAIM_ONE, "99.9"), sources.context)).toThrow(
      "surface text is not present",
    );
    expect(() =>
      createExtractedClaim(
        claimInput(CLAIM_ONE, "10.5", { statement: "Inflation was 10.5 percent in 2099." }),
        sources.context,
      ),
    ).toThrow("unsupported numeric or date token: 2099");
    expect(() =>
      createExtractedClaim(
        claimInput(CLAIM_ONE, "10.5", {
          structuredFact: {
            ...claimInput().structuredFact,
            supportingSpanIds: [uuid(999)],
          },
        }),
        sources.context,
      ),
    ).toThrow("must be included in artifact evidence spans");
  });

  it("rejects evidence later than declared publication/retrieval/availability/system cutoffs", () => {
    const sources = sourcesFixture();
    expect(() =>
      createExtractedClaim(
        claimInput(CLAIM_ONE, "10.5", {
          cutoffs: {
            publicationCutoff: "2024-01-14T00:00:00Z",
            retrievalCutoff: "2024-01-16T00:00:00Z",
            availableCutoff: "2024-01-16T00:00:00Z",
            systemCutoff: "2024-01-17T00:00:00Z",
          },
        }),
        sources.context,
      ),
    ).toThrow("later than its declared information cutoffs");
    expect(() =>
      createExtractedClaim(
        claimInput(CLAIM_ONE, "10.5", {
          extractedAt: "2024-01-16T00:00:00Z",
        }),
        sources.context,
      ),
    ).toThrow("before its system cutoff");
  });

  it("distinguishes factual evidence from analyst interpretation and validates resolution states", () => {
    const sources = sourcesFixture();
    const interpretation = createExtractedClaim(
      claimInput(CLAIM_ONE, "10.5", {
        claimType: "interpretation",
        entityResolution: { state: "unresolved", canonicalEntityIds: [] },
      }),
      sources.context,
    );
    expect(interpretation.claimType).toBe("interpretation");
    expect(() =>
      createExtractedClaim(
        claimInput(CLAIM_ONE, "10.5", {
          entityResolution: { state: "resolved", canonicalEntityIds: [] },
        }),
        sources.context,
      ),
    ).toThrow("exactly one canonical ID");
    expect(() =>
      createExtractedClaim(
        claimInput(CLAIM_ONE, "10.5", {
          extraction: { ...governance().extraction, method: "human" },
        }),
        sources.context,
      ),
    ).toThrow("human extraction must not claim a model identity");
  });

  it("creates evidence-bound events and institutional measures with explicit dates", () => {
    const sources = sourcesFixture();
    const event = eventFixture(sources.context);
    const measure = measureFixture(sources.context);
    expect(event.basis).toBe("reported_fact");
    expect(measure.structuredFact?.canonicalValue).toBe("12");
    const { manifestSha256: eventManifest, ...rawEvent } = event;
    const { manifestSha256: measureManifest, ...rawMeasure } = measure;
    expect(eventManifest).toMatch(/^[a-f0-9]{64}$/);
    expect(measureManifest).toMatch(/^[a-f0-9]{64}$/);
    expect(() =>
      createExtractedEvent(
        { ...rawEvent, eventId: uuid(401), occurredAt: "2099-01-01T00:00:00Z" },
        sources.context,
      ),
    ).toThrow("occurrence date must be explicit");
    expect(() =>
      createInstitutionalMeasure(
        { ...rawMeasure, measureId: uuid(402), effectiveAt: "2099-02-01T00:00:00Z" },
        sources.context,
      ),
    ).toThrow("effective date must be explicit");
  });
});

describe("contradiction hypotheses and independent append-only review", () => {
  it("detects deterministic disagreement candidates without adjudicating truth", () => {
    const sources = sourcesFixture();
    const claims = createClaims(sources.context);
    const request = {
      schemaVersion: 1,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      knownAt: "2024-01-19T00:00:00Z",
      maxClaims: 10,
      maxGroups: 10,
    };
    const forward = detectContradictionCandidates(claims, request);
    const reverse = detectContradictionCandidates([...claims].reverse(), request);
    expect(forward).toEqual(reverse);
    expect(forward).toHaveLength(1);
    expect(forward[0]).toMatchObject({
      reason: "reported_value_disagreement",
      adjudication: "unadjudicated",
    });
    expect(forward[0]?.candidateSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps compatible or incomparable claims out of contradiction candidates", () => {
    const sources = sourcesFixture();
    const left = createExtractedClaim(claimInput(CLAIM_ONE, "10.5"), sources.context);
    const same = createExtractedClaim(claimInput(CLAIM_TWO, "10.5"), sources.context);
    const unrelated = createExtractedClaim(
      claimInput(CLAIM_THREE, "11.0", {
        structuredFact: {
          ...claimInput(CLAIM_THREE, "11.0").structuredFact,
          predicateKey: "wage.rate",
        },
      }),
      sources.context,
    );
    const request = {
      schemaVersion: 1,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      knownAt: "2024-01-19T00:00:00Z",
      maxClaims: 10,
      maxGroups: 10,
    };
    expect(detectContradictionCandidates([left, same, unrelated], request)).toEqual([]);
    const nonOverlapping = createExtractedClaim(
      claimInput(uuid(334), "11.0", {
        validFrom: "2025-01-01T00:00:00Z",
        validUntil: null,
      }),
      sources.context,
    );
    const historical = createExtractedClaim(
      claimInput(uuid(335), "10.5", {
        validUntil: "2025-01-01T00:00:00Z",
      }),
      sources.context,
    );
    expect(
      detectContradictionCandidates([historical, nonOverlapping], {
        ...request,
        knownAt: "2026-01-01T00:00:00Z",
      }),
    ).toEqual([]);
  });

  it("creates a sealed contradiction hypothesis and rejects non-contradictions or future claims", () => {
    const sources = sourcesFixture();
    const claims = createClaims(sources.context);
    const group = groupFixture(claims);
    assertContradictionGroupIntegrity(group);
    expect(group.workflowStatus).toBe("hypothesis");
    expect(group.adjudication).toBe("unadjudicated");
    expect(group.claimIds).toEqual([CLAIM_ONE, CLAIM_TWO]);
    expect(() => assertContradictionGroupIntegrity({ ...group, subjectKey: "forged" })).toThrow(
      "digest does not match",
    );
    const same = createExtractedClaim(claimInput(CLAIM_TWO, "10.5"), sources.context);
    expect(() => groupFixture([claims[0], same])).toThrow("no contradictory claim pair");
    const later = createExtractedClaim(
      claimInput(CLAIM_TWO, "11.0", { extractedAt: "2024-01-25T00:00:00Z" }),
      sources.context,
    );
    expect(() => groupFixture([claims[0], later])).toThrow("later than knownAt");
  });

  it("enforces independent analysts, contiguous hash chains, and explicit supersession", () => {
    const sources = sourcesFixture();
    const claims = createClaims(sources.context);
    const group = groupFixture(claims);
    const empty = createContradictionReviewLedger(group, claims);
    const first = reviewDecision(group);
    const ledger = appendAnalystReviewDecision(empty, first);
    assertAnalystReviewDecisionIntegrity(first);
    assertContradictionReviewLedgerIntegrity(ledger);
    expect(ledger.decisions).toHaveLength(1);

    const superseding = reviewDecision(group, {
      decisionId: DECISION_TWO,
      sequence: 2,
      decisionKind: "supersede",
      reviewerPrincipalId: REVIEWER_TWO,
      decidedAt: "2024-01-22T00:00:00Z",
      supersedesDecisionId: first.decisionId,
      previousDecisionSha256: first.manifestSha256,
    });
    const superseded = appendAnalystReviewDecision(ledger, superseding);
    expect(superseded.decisions.map((decision) => decision.decisionKind)).toEqual([
      "request_evidence",
      "supersede",
    ]);
    expect(() =>
      appendAnalystReviewDecision(empty, reviewDecision(group, { reviewerPrincipalId: EXTRACTOR })),
    ).toThrow("not independent");
    expect(() =>
      appendAnalystReviewDecision(
        ledger,
        reviewDecision(group, {
          decisionId: DECISION_TWO,
          sequence: 2,
          previousDecisionSha256: SHA_A,
        }),
      ),
    ).toThrow("previous digest chain is invalid");
    expect(() =>
      appendAnalystReviewDecision(
        ledger,
        reviewDecision(group, {
          decisionId: DECISION_TWO,
          sequence: 2,
          decisionKind: "supersede",
          supersedesDecisionId: DECISION_TWO,
          previousDecisionSha256: first.manifestSha256,
          decidedAt: "2024-01-22T00:00:00Z",
        }),
      ),
    ).toThrow("supersession target is missing or already superseded");
    expect(() =>
      appendAnalystReviewDecision(
        empty,
        reviewDecision(group, { decidedAt: "2024-01-19T00:00:00Z" }),
      ),
    ).toThrow("cannot predate contradiction detection");
    expect(() =>
      assertContradictionReviewLedgerIntegrity({ ...ledger, manifestSha256: SHA_A }),
    ).toThrow("digest does not match");
  });
});

describe("bounded tenant-safe datasets, PIT queries, comparisons, and exports", () => {
  it("seals a complete batch, validates semantic source proof, and creates an empty dataset", () => {
    const sources = sourcesFixture();
    const dataset = datasetFixture(sources);
    assertNarrativeDatasetIntegrity(dataset);
    expect(dataset.claims).toHaveLength(2);
    expect(dataset.events).toHaveLength(1);
    expect(dataset.measures).toHaveLength(1);
    expect(Object.isFrozen(dataset)).toBe(true);
    expect(createEmptyNarrativeDataset(ORG, WORKSPACE).claims).toEqual([]);
    expect(() =>
      createNarrativeDataset(unsignedDataset(dataset), { [SNAPSHOT_ID]: `${SOURCE_TEXT}!` }),
    ).toThrow("valid immutable source text proof");
    expect(() => assertNarrativeDatasetIntegrity({ ...dataset, manifestSha256: SHA_A })).toThrow(
      "digest does not match",
    );
  });

  it("rejects duplicate IDs, cross-tenant artifacts, orphan links, and supersession cycles", () => {
    const sources = sourcesFixture();
    const dataset = datasetFixture(sources);
    expect(() =>
      createNarrativeDataset(
        {
          ...unsignedDataset(dataset),
          documents: [sources.document, sources.document],
        },
        sources.context.sourceTextBySnapshotId,
      ),
    ).toThrow("duplicate ID");

    const otherDocument = createSourceDocument(
      documentInput({ workspaceId: OTHER_WORKSPACE, documentId: uuid(310) }),
    );
    const otherSnapshot = createSourceSnapshot(
      snapshotInput(otherDocument, { workspaceId: OTHER_WORKSPACE, snapshotId: uuid(311) }),
      otherDocument,
      SOURCE_TEXT,
    );
    const otherSpan = createSourceSpan(
      spanInput(otherSnapshot, {
        workspaceId: OTHER_WORKSPACE,
        spanId: uuid(312),
        documentId: otherDocument.documentId,
      }),
      otherDocument,
      otherSnapshot,
      SOURCE_TEXT,
    );
    const otherClaim = createExtractedClaim(
      claimInput(uuid(301), "10.5", {
        workspaceId: OTHER_WORKSPACE,
        evidenceSpanIds: [otherSpan.spanId],
        structuredFact: {
          ...claimInput().structuredFact,
          supportingSpanIds: [otherSpan.spanId],
        },
      }),
      {
        documents: [otherDocument],
        snapshots: [otherSnapshot],
        spans: [otherSpan],
        sourceTextBySnapshotId: { [otherSnapshot.snapshotId]: SOURCE_TEXT },
      },
    );
    expect(otherClaim.workspaceId).toBe(OTHER_WORKSPACE);
    expect(() =>
      createNarrativeDataset(
        { ...unsignedDataset(dataset), claims: [...dataset.claims, otherClaim] },
        sources.context.sourceTextBySnapshotId,
      ),
    ).toThrow("crosses organization or workspace");

    expect(() =>
      createNarrativeDataset(
        { ...unsignedDataset(dataset), spans: [] },
        sources.context.sourceTextBySnapshotId,
      ),
    ).toThrow("orphan or stale source span");

    const cyclicalA = createExtractedClaim(
      claimInput(CLAIM_ONE, "10.5", { supersedesClaimId: CLAIM_TWO }),
      sources.context,
    );
    const cyclicalB = createExtractedClaim(
      claimInput(CLAIM_TWO, "11.0", { supersedesClaimId: CLAIM_ONE }),
      sources.context,
    );
    expect(() =>
      createNarrativeDataset(
        {
          ...unsignedDataset(dataset),
          claims: [cyclicalA, cyclicalB],
          contradictionGroups: [],
          reviewLedgers: [],
        },
        sources.context.sourceTextBySnapshotId,
      ),
    ).toThrow("supersession history contains a cycle");
  });

  it("queries in deterministic order with strict PIT visibility, cursoring, and limits", () => {
    const sources = sourcesFixture();
    const dataset = datasetFixture(sources);
    const baseRequest = {
      schemaVersion: 1,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      effectiveAt: "2024-02-02T00:00:00Z",
      knownAt: "2024-02-02T00:00:00Z",
      artifactKinds: ["measure", "claim", "event"],
      languages: ["en"],
      after: null,
      maxItems: 2,
    } as const;
    const first = queryNarrativeArtifacts(dataset, baseRequest);
    expect(first.items.map((item) => `${item.kind}:${item.id}`)).toEqual([
      `claim:${CLAIM_ONE}`,
      `claim:${CLAIM_TWO}`,
    ]);
    expect(first.truncated).toBe(true);
    const second = queryNarrativeArtifacts(dataset, { ...baseRequest, after: first.nextCursor });
    expect(second.items.map((item) => item.kind)).toEqual(["event", "measure"]);
    expect(second.truncated).toBe(false);
    expect(
      queryNarrativeArtifacts(dataset, { ...baseRequest, knownAt: "2024-01-16T00:00:00Z" }).items,
    ).toEqual([]);
    expect(
      queryNarrativeArtifacts(dataset, {
        ...baseRequest,
        effectiveAt: "2024-01-20T00:00:00Z",
        maxItems: 10,
      }).items.map((item) => item.kind),
    ).toEqual(["claim", "claim", "event"]);
    expect(() => queryNarrativeArtifacts(dataset, { ...baseRequest, maxItems: 201 })).toThrow(
      "must be <= 200",
    );
    expect(() =>
      queryNarrativeArtifacts(dataset, { ...baseRequest, workspaceId: OTHER_WORKSPACE }),
    ).toThrow("crosses organization or workspace");
  });

  it("compares claims without causal or truth promotion and enforces pair bounds", () => {
    const sources = sourcesFixture();
    const baseClaims = createClaims(sources.context);
    const compatible = createExtractedClaim(claimInput(CLAIM_THREE, "10.5"), sources.context);
    const group = groupFixture(baseClaims);
    const dataset = createNarrativeDataset(
      {
        schemaVersion: 1,
        organizationId: ORG,
        workspaceId: WORKSPACE,
        documents: [sources.document],
        snapshots: [sources.snapshot],
        spans: [sources.span],
        translations: [],
        claims: [...baseClaims, compatible],
        events: [],
        measures: [],
        contradictionGroups: [group],
        reviewLedgers: [createContradictionReviewLedger(group, baseClaims)],
      },
      sources.context.sourceTextBySnapshotId,
    );
    const request = {
      schemaVersion: 1,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      claimIds: [CLAIM_THREE, CLAIM_TWO, CLAIM_ONE],
      effectiveAt: "2024-01-19T00:00:00Z",
      knownAt: "2024-01-19T00:00:00Z",
      maxPairs: 3,
    } as const;
    const comparisons = compareNarrativeClaims(dataset, request);
    expect(comparisons).toHaveLength(3);
    expect(comparisons.map((item) => item.relationship)).toEqual([
      "contradiction_hypothesis",
      "compatible",
      "contradiction_hypothesis",
    ]);
    expect(comparisons.every((item) => item.truthAdjudication === "none")).toBe(true);
    expect(() => compareNarrativeClaims(dataset, { ...request, maxPairs: 2 })).toThrow(
      "exceeds maxPairs",
    );
    expect(() =>
      compareNarrativeClaims(dataset, { ...request, knownAt: "2024-01-17T00:00:00Z" }),
    ).toThrow("would leak unavailable claim");
  });

  it("exports only citation-safe locators/snippets for citation-licensed sources", () => {
    const sources = sourcesFixture();
    const dataset = datasetFixture(sources);
    const result = exportNarrativeArtifact(dataset, {
      schemaVersion: 1,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      artifactKind: "claim",
      artifactId: CLAIM_ONE,
      mode: "citation",
      requestedBy: REVIEWER,
      purpose: "Fixture citation export test.",
      requestedAt: "2024-02-02T00:00:00Z",
      authorizationSha256: SHA_A,
      maxCitations: 5,
    });
    expect(result.fullTextIncluded).toBe(false);
    expect(result.derivedArtifact).toBeNull();
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({
      spanId: SPAN_ID,
      snippet: SOURCE_TEXT,
      locator: { kind: "section", value: "fixture-section-1" },
    });
    expect(result).not.toHaveProperty("sourceText");
  });

  it("fails closed for denied modes, restricted derived export, missing snippets, and bounds", () => {
    const sources = sourcesFixture();
    const dataset = datasetFixture(sources);
    const request = {
      schemaVersion: 1,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      artifactKind: "claim",
      artifactId: CLAIM_ONE,
      mode: "derived",
      requestedBy: REVIEWER,
      purpose: "Fixture denial test.",
      requestedAt: "2024-02-02T00:00:00Z",
      authorizationSha256: SHA_A,
      maxCitations: 5,
    } as const;
    expect(() => exportNarrativeArtifact(dataset, request)).toThrow(
      "does not allow derived artifact export",
    );
    expect(() => exportNarrativeArtifact(dataset, { ...request, maxCitations: 0 })).toThrow(
      "safe integer >= 1",
    );

    const restrictedSources = sourcesFixture({ classification: "restricted" });
    const restrictedDataset = datasetFixture(restrictedSources);
    expect(() => exportNarrativeArtifact(restrictedDataset, request)).toThrow(
      "does not allow derived artifact export",
    );
    expect(
      exportNarrativeArtifact(restrictedDataset, { ...request, mode: "citation" }).citations[0]
        ?.snippet,
    ).toBe(SOURCE_TEXT);
  });

  it("allows derived-only export for non-restricted licensed sources without source full text", () => {
    const sources = sourcesFixture({
      exportPolicy: "derived_only",
      license: {
        ...documentInput().license,
        allowsDerivedExport: true,
      },
    });
    const dataset = datasetFixture(sources);
    const result = exportNarrativeArtifact(dataset, {
      schemaVersion: 1,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      artifactKind: "claim",
      artifactId: CLAIM_ONE,
      mode: "derived",
      requestedBy: REVIEWER,
      purpose: "Fixture derived export test.",
      requestedAt: "2024-02-02T00:00:00Z",
      authorizationSha256: SHA_A,
      maxCitations: 5,
    });
    expect(result.derivedArtifact).toMatchObject({ claimId: CLAIM_ONE });
    expect(result.fullTextIncluded).toBe(false);
    expect(() =>
      exportNarrativeArtifact(dataset, {
        schemaVersion: 1,
        organizationId: ORG,
        workspaceId: WORKSPACE,
        artifactKind: "claim",
        artifactId: CLAIM_ONE,
        mode: "citation",
        requestedBy: REVIEWER,
        purpose: "Wrong mode.",
        requestedAt: "2024-02-02T00:00:00Z",
        authorizationSha256: SHA_A,
        maxCitations: 5,
      }),
    ).toThrow("does not allow citation export");
  });
});

describe("strict canonical runtime primitives", () => {
  it("rejects non-canonical JSON and normalizes safe deterministic values", () => {
    expect(canonicalJson({ z: -0, a: [true, null, "x"] })).toBe('{"a":[true,null,"x"],"z":0}');
    expect(cloneCanonical({ b: 1, a: 2 })).toEqual({ a: 2, b: 1 });
    expect(() => canonicalJson(Number.NaN)).toThrow("non-safe integer");
    expect(() => canonicalJson(1.5)).toThrow("non-safe integer");
    expect(() => canonicalJson(undefined)).toThrow("not canonical JSON");
    expect(() => canonicalJson(new Date())).toThrow("plain JSON objects");
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow("contains a cycle");
    const frozen = deepFreeze({ nested: { value: 1 } });
    expect(Object.isFrozen(frozen.nested)).toBe(true);
    expect(deepFreeze(frozen)).toBe(frozen);
  });

  it("strictly validates primitive shape, keys, and bounded collections", () => {
    expect(() => assertRecord(null, "value")).toThrow("plain object");
    expect(() => assertRecord([], "value")).toThrow("plain object");
    expect(() => assertExactKeys({ a: 1 }, ["a", "b"], "value")).toThrow("missing: b");
    expect(expectString("x", "value")).toBe("x");
    expect(expectNullableString(null, "value")).toBeNull();
    expect(expectBoolean(true, "value")).toBe(true);
    expect(expectInteger(2, "value", 1)).toBe(2);
    expect(expectArray([], "value")).toEqual([]);
    expect(enumValue("a", ["a", "b"] as const, "value")).toBe("a");
    expect(literalOne(1, "value")).toBe(1);
    expect(() => expectString(1, "value")).toThrow("must be a string");
    expect(() => expectBoolean("true", "value")).toThrow("must be a boolean");
    expect(() => expectInteger(-1, "value")).toThrow("safe integer");
    expect(() => expectArray({}, "value")).toThrow("must be an array");
    expect(() => enumValue("c", ["a", "b"] as const, "value")).toThrow("one of");
    expect(() => literalOne(2, "value")).toThrow("must be 1");
    expect(boundedInteger(2, "value", 1, 3)).toBe(2);
    expect(() => boundedInteger(4, "value", 1, 3)).toThrow("must be <= 3");
    expect(() => uniqueSortedStrings([], "value", assertUuid, false)).toThrow("must not be empty");
    expect(() => uniqueSortedStrings([ORG, ORG], "value", assertUuid)).toThrow(
      "must not contain duplicates",
    );
  });

  it("strictly validates identifiers, instants, exact values, and tenant manifests", () => {
    expect(() => assertUuid("bad", "id")).toThrow("lowercase UUID");
    expect(() => assertSha256("bad", "digest")).toThrow("lowercase SHA-256");
    expect(() => assertKey("Bad Key", "key")).toThrow("stable lowercase key");
    expect(() => assertSemver("v1", "version")).toThrow("semantic version");
    expect(() => assertLanguage("?", "language")).toThrow("BCP 47");
    expect(() => assertLocale("EN_us", "locale")).toThrow("normalized locale");
    expect(() => assertNonBlank(" x ", "text")).toThrow("non-blank trimmed string");
    expect(() => assertIsoInstant("2024-02-30T00:00:00Z", "instant")).toThrow("valid RFC 3339");
    expect(() => assertIsoDate("2024-02-30", "date")).toThrow("valid ISO date");
    expect(() => assertProbability("1.1", "probability")).toThrow("between 0 and 1");
    expect(() => assertExactDecimal("1.0", "decimal")).toThrow("canonical exact decimal");
    expect(() =>
      assertSameTenant(
        { organizationId: ORG, workspaceId: WORKSPACE },
        { organizationId: ORG, workspaceId: OTHER_WORKSPACE },
        "tenant",
      ),
    ).toThrow("crosses organization or workspace");
    expect(parseTenant({ organizationId: ORG, workspaceId: WORKSPACE }, "tenant")).toEqual({
      organizationId: ORG,
      workspaceId: WORKSPACE,
    });
    const sealed = seal({ schemaVersion: 1, value: "fixture" });
    verifyManifest(sealed, sealed.manifestSha256, "sealed");
    expect(() => verifyManifest(sealed, SHA_A, "sealed")).toThrow("digest does not match");
  });
});

describe("adversarial validation branches", () => {
  it("fails closed across source licensing, identity, chronology, and locator boundaries", () => {
    const document = createSourceDocument(documentInput());
    expect(() =>
      createSourceDocument({
        ...documentInput(),
        license: { ...documentInput().license, maxCitationCharacters: 1_001 },
      }),
    ).toThrow("must be <= 1000");
    expect(() =>
      createSourceDocument({
        ...documentInput(),
        license: {
          ...documentInput().license,
          allowsCitationSnippets: false,
          maxCitationCharacters: 0,
        },
      }),
    ).toThrow("citation_only export requires");
    expect(() =>
      createSourceSnapshot(
        snapshotInput(document, { documentId: uuid(998) }),
        document,
        SOURCE_TEXT,
      ),
    ).toThrow("not bound");
    expect(() =>
      createSourceSnapshot(
        snapshotInput(document, { language: "fr", locale: "fr-FR" }),
        document,
        SOURCE_TEXT,
      ),
    ).toThrow("preserve document identity");
    expect(() =>
      createSourceSnapshot(
        snapshotInput(document, {
          retrievedAt: "2024-01-14T00:00:00Z",
          availableAt: "2024-01-13T00:00:00Z",
        }),
        document,
        SOURCE_TEXT,
      ),
    ).toThrow("before publication");

    const deniedDocument = createSourceDocument(
      documentInput({
        exportPolicy: "deny",
        license: {
          ...documentInput().license,
          allowsCitationSnippets: false,
          maxCitationCharacters: 0,
        },
      }),
    );
    const deniedSnapshot = createSourceSnapshot(
      snapshotInput(deniedDocument),
      deniedDocument,
      SOURCE_TEXT,
    );
    const locatorOnly = createSourceSpan(
      spanInput(deniedSnapshot, {
        citationSnippet: null,
        snippetStartOffset: null,
        snippetEndOffset: null,
      }),
      deniedDocument,
      deniedSnapshot,
      SOURCE_TEXT,
    );
    expect(locatorOnly.citationSnippet).toBeNull();
    expect(() =>
      createSourceSpan(
        spanInput(deniedSnapshot, { snippetEndOffset: null }),
        deniedDocument,
        deniedSnapshot,
        SOURCE_TEXT,
      ),
    ).toThrow("must be present together");
    const deniedCitationDocument = createSourceDocument(documentInput({ exportPolicy: "deny" }));
    const deniedCitationSnapshot = createSourceSnapshot(
      snapshotInput(deniedCitationDocument),
      deniedCitationDocument,
      SOURCE_TEXT,
    );
    expect(() =>
      createSourceSpan(
        spanInput(deniedCitationSnapshot),
        deniedCitationDocument,
        deniedCitationSnapshot,
        SOURCE_TEXT,
      ),
    ).toThrow("denies citation snippets");
    expect(() =>
      createSourceSpan(
        spanInput(deniedCitationSnapshot, { startOffset: 1 }),
        deniedCitationDocument,
        deniedCitationSnapshot,
        SOURCE_TEXT,
      ),
    ).toThrow();
  });

  it("validates complete extraction identity, cutoff order, entity state, and fact kinds", () => {
    const sources = sourcesFixture();
    expect(() =>
      createExtractedClaim(
        claimInput(CLAIM_ONE, "10.5", {
          extraction: { ...governance().extraction, modelName: null },
        }),
        sources.context,
      ),
    ).toThrow("requires complete model identity");
    expect(() =>
      createExtractedClaim(
        claimInput(CLAIM_ONE, "10.5", {
          cutoffs: {
            ...governance().cutoffs,
            publicationCutoff: "2024-01-17T00:00:00Z",
          },
        }),
        sources.context,
      ),
    ).toThrow("cutoffs must be monotonic");
    expect(() =>
      createExtractedClaim(
        claimInput(CLAIM_ONE, "10.5", {
          entityResolution: { state: "unresolved", canonicalEntityIds: [ENTITY] },
        }),
        sources.context,
      ),
    ).toThrow("unresolved entities cannot");
    expect(() =>
      createExtractedClaim(
        claimInput(CLAIM_ONE, "10.5", {
          entityResolution: { state: "ambiguous", canonicalEntityIds: [ENTITY] },
        }),
        sources.context,
      ),
    ).toThrow("at least two candidate IDs");

    const dateClaim = createExtractedClaim(
      claimInput(CLAIM_THREE, "10.5", {
        statement: "The reported date was 2024-01-15.",
        structuredFact: {
          ...claimInput().structuredFact,
          objectKind: "date",
          canonicalValue: "2024-01-15",
          unit: null,
          surfaceText: "2024-01-15",
        },
      }),
      sources.context,
    );
    expect(dateClaim.structuredFact.objectKind).toBe("date");
    const booleanClaim = createExtractedClaim(
      claimInput(uuid(333), "10.5", {
        statement: "Inflation was reported.",
        structuredFact: {
          ...claimInput().structuredFact,
          objectKind: "boolean",
          canonicalValue: "true",
          unit: null,
          surfaceText: "reported",
        },
      }),
      sources.context,
    );
    expect(booleanClaim.structuredFact.canonicalValue).toBe("true");
    expect(() =>
      createExtractedClaim(
        claimInput(CLAIM_ONE, "10.5", {
          structuredFact: {
            ...claimInput().structuredFact,
            objectKind: "boolean",
            canonicalValue: "maybe",
            unit: null,
          },
        }),
        sources.context,
      ),
    ).toThrow("canonicalValue true or false");
    expect(() =>
      createExtractedClaim(
        claimInput(CLAIM_ONE, "10.5", {
          structuredFact: {
            ...claimInput().structuredFact,
            objectKind: "text",
            canonicalValue: "reported",
          },
        }),
        sources.context,
      ),
    ).toThrow("only numeric structured facts");
    expect(() =>
      createExtractedClaim(
        claimInput(CLAIM_ONE, "10.5", {
          validUntil: "2024-01-14T00:00:00Z",
        }),
        sources.context,
      ),
    ).toThrow("half-open and non-empty");
  });

  it("covers opposing claims, detector bounds, decision shape, and comparison incomparability", () => {
    const sources = sourcesFixture();
    const positive = createExtractedClaim(claimInput(CLAIM_ONE, "10.5"), sources.context);
    const negative = createExtractedClaim(
      claimInput(CLAIM_TWO, "10.5", {
        structuredFact: { ...claimInput().structuredFact, polarity: "deny" },
      }),
      sources.context,
    );
    const detectorRequest = {
      schemaVersion: 1,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      knownAt: "2024-01-19T00:00:00Z",
      maxClaims: 2,
      maxGroups: 1,
    } as const;
    expect(detectContradictionCandidates([positive, negative], detectorRequest)[0]?.reason).toBe(
      "opposing_polarity",
    );
    expect(() =>
      detectContradictionCandidates([positive, negative, positive], detectorRequest),
    ).toThrow("exceeds maxClaims");
    expect(() => detectContradictionCandidates([positive, positive], detectorRequest)).toThrow(
      "duplicate claim IDs",
    );

    const group = createContradictionGroup(
      {
        schemaVersion: 1,
        organizationId: ORG,
        workspaceId: WORKSPACE,
        contradictionGroupId: GROUP_ID,
        claimIds: [CLAIM_ONE, CLAIM_TWO],
        subjectKey: "economy.fixture",
        predicateKey: "inflation.rate",
        detectedAt: "2024-01-20T00:00:00Z",
        knownAt: "2024-01-19T00:00:00Z",
        detectionCodeSha256: SHA_A,
        detectionConfigSha256: SHA_B,
        workflowStatus: "hypothesis",
        adjudication: "unadjudicated",
        limitations: ["Hypothesis only."],
        invalidationConditions: ["Invalidate after normalization changes."],
      },
      [positive, negative],
    );
    expect(() =>
      createAnalystReviewDecision({
        ...reviewDecision(group),
        manifestSha256: undefined,
        decisionKind: "supersede",
        supersedesDecisionId: null,
      }),
    ).toThrow();
    const ledger = createContradictionReviewLedger(group, [positive, negative]);
    const dataset = createNarrativeDataset(
      {
        schemaVersion: 1,
        organizationId: ORG,
        workspaceId: WORKSPACE,
        documents: [sources.document],
        snapshots: [sources.snapshot],
        spans: [sources.span],
        translations: [],
        claims: [positive, negative],
        events: [],
        measures: [],
        contradictionGroups: [group],
        reviewLedgers: [ledger],
      },
      sources.context.sourceTextBySnapshotId,
    );
    const comparisons = compareNarrativeClaims(dataset, {
      schemaVersion: 1,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      claimIds: [CLAIM_ONE, CLAIM_TWO],
      effectiveAt: "2024-01-19T00:00:00Z",
      knownAt: "2024-01-19T00:00:00Z",
      maxPairs: 1,
    });
    expect(comparisons[0]?.relationship).toBe("contradiction_hypothesis");
  });
});
