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
  compareInstant,
  enumValue,
  expectArray,
  expectNullableString,
  expectString,
  literalOne,
  parseTenant,
  seal,
  sha256Text,
  uniqueSortedStrings,
  verifyManifest,
} from "./internals.js";
import {
  assertSourceDocumentIntegrity,
  assertSourceSnapshotIntegrity,
  assertSourceSpanIntegrity,
  type SourceDocument,
  type SourceSnapshot,
  type SourceSpan,
} from "./sources.js";

export interface ExtractionIdentity {
  readonly method: "human" | "hybrid" | "machine";
  readonly extractorPrincipalId: string;
  readonly modelProvider: string | null;
  readonly modelName: string | null;
  readonly modelVersion: string | null;
  readonly codeVersion: string;
  readonly codeSha256: string;
  readonly configSha256: string;
  readonly promptSha256: string;
}

export interface InformationCutoffs {
  readonly publicationCutoff: string;
  readonly retrievalCutoff: string;
  readonly availableCutoff: string;
  readonly systemCutoff: string;
}

export interface UncertaintyStatement {
  readonly kind: "ambiguity" | "entity_resolution" | "extraction" | "source_disagreement";
  readonly description: string;
}

export interface EntityResolution {
  readonly state: "ambiguous" | "resolved" | "unresolved";
  readonly canonicalEntityIds: readonly string[];
}

export interface StructuredFact {
  readonly subjectKey: string;
  readonly predicateKey: string;
  readonly objectKind: "boolean" | "date" | "number" | "text";
  readonly canonicalValue: string;
  readonly unit: string | null;
  readonly surfaceText: string;
  readonly supportingSpanIds: readonly string[];
  readonly normalizationRationale: string;
  readonly polarity: "affirm" | "deny";
}

interface ArtifactGovernance {
  readonly extraction: ExtractionIdentity;
  readonly cutoffs: InformationCutoffs;
  readonly extractedAt: string;
  readonly confidence: string;
  readonly uncertainty: readonly UncertaintyStatement[];
  readonly entityResolution: EntityResolution;
  readonly limitations: readonly string[];
  readonly invalidationConditions: readonly string[];
}

export interface ExtractedClaimInput extends ArtifactGovernance {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly claimId: string;
  readonly language: string;
  readonly locale: string;
  readonly claimType: "factual" | "interpretation";
  readonly statement: string;
  readonly structuredFact: StructuredFact;
  readonly evidenceSpanIds: readonly string[];
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly epistemicScope: "descriptive_non_causal";
  readonly supersedesClaimId: string | null;
}

export interface ExtractedClaim extends ExtractedClaimInput {
  readonly manifestSha256: string;
}

export interface ExtractedEventInput extends ArtifactGovernance {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly eventId: string;
  readonly language: string;
  readonly locale: string;
  readonly basis: "analyst_interpretation" | "reported_fact";
  readonly eventType: string;
  readonly title: string;
  readonly occurredAt: string;
  readonly evidenceSpanIds: readonly string[];
  readonly epistemicScope: "descriptive_non_causal";
  readonly supersedesEventId: string | null;
}

export interface ExtractedEvent extends ExtractedEventInput {
  readonly manifestSha256: string;
}

export interface InstitutionalMeasureInput extends ArtifactGovernance {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly measureId: string;
  readonly institutionEntityId: string;
  readonly language: string;
  readonly locale: string;
  readonly basis: "analyst_interpretation" | "reported_fact";
  readonly measureType: string;
  readonly description: string;
  readonly announcedAt: string;
  readonly effectiveAt: string | null;
  readonly structuredFact: StructuredFact | null;
  readonly evidenceSpanIds: readonly string[];
  readonly epistemicScope: "descriptive_non_causal";
  readonly supersedesMeasureId: string | null;
}

export interface InstitutionalMeasure extends InstitutionalMeasureInput {
  readonly manifestSha256: string;
}

export interface EvidenceContext {
  readonly documents: readonly Readonly<SourceDocument>[];
  readonly snapshots: readonly Readonly<SourceSnapshot>[];
  readonly spans: readonly Readonly<SourceSpan>[];
  readonly sourceTextBySnapshotId: Readonly<Record<string, string>>;
}

const EXTRACTION_KEYS = [
  "method",
  "extractorPrincipalId",
  "modelProvider",
  "modelName",
  "modelVersion",
  "codeVersion",
  "codeSha256",
  "configSha256",
  "promptSha256",
] as const;
const CUTOFF_KEYS = [
  "publicationCutoff",
  "retrievalCutoff",
  "availableCutoff",
  "systemCutoff",
] as const;
const GOVERNANCE_KEYS = [
  "extraction",
  "cutoffs",
  "extractedAt",
  "confidence",
  "uncertainty",
  "entityResolution",
  "limitations",
  "invalidationConditions",
] as const;
const CLAIM_KEYS = [
  "schemaVersion",
  "organizationId",
  "workspaceId",
  "claimId",
  "language",
  "locale",
  "claimType",
  "statement",
  "structuredFact",
  "evidenceSpanIds",
  "validFrom",
  "validUntil",
  "epistemicScope",
  "supersedesClaimId",
  ...GOVERNANCE_KEYS,
] as const;
const EVENT_KEYS = [
  "schemaVersion",
  "organizationId",
  "workspaceId",
  "eventId",
  "language",
  "locale",
  "basis",
  "eventType",
  "title",
  "occurredAt",
  "evidenceSpanIds",
  "epistemicScope",
  "supersedesEventId",
  ...GOVERNANCE_KEYS,
] as const;
const MEASURE_KEYS = [
  "schemaVersion",
  "organizationId",
  "workspaceId",
  "measureId",
  "institutionEntityId",
  "language",
  "locale",
  "basis",
  "measureType",
  "description",
  "announcedAt",
  "effectiveAt",
  "structuredFact",
  "evidenceSpanIds",
  "epistemicScope",
  "supersedesMeasureId",
  ...GOVERNANCE_KEYS,
] as const;

function parseExtraction(value: unknown): ExtractionIdentity {
  assertRecord(value, "artifact.extraction");
  assertExactKeys(value, EXTRACTION_KEYS, "artifact.extraction");
  const method = enumValue(
    value.method,
    ["human", "hybrid", "machine"] as const,
    "artifact.extraction.method",
  );
  const extractorPrincipalId = expectString(
    value.extractorPrincipalId,
    "artifact.extraction.extractorPrincipalId",
  );
  const modelProvider = expectNullableString(
    value.modelProvider,
    "artifact.extraction.modelProvider",
  );
  const modelName = expectNullableString(value.modelName, "artifact.extraction.modelName");
  const modelVersion = expectNullableString(value.modelVersion, "artifact.extraction.modelVersion");
  const codeVersion = expectString(value.codeVersion, "artifact.extraction.codeVersion");
  const codeSha256 = expectString(value.codeSha256, "artifact.extraction.codeSha256");
  const configSha256 = expectString(value.configSha256, "artifact.extraction.configSha256");
  const promptSha256 = expectString(value.promptSha256, "artifact.extraction.promptSha256");
  assertUuid(extractorPrincipalId, "artifact.extraction.extractorPrincipalId");
  assertSemver(codeVersion, "artifact.extraction.codeVersion");
  assertSha256(codeSha256, "artifact.extraction.codeSha256");
  assertSha256(configSha256, "artifact.extraction.configSha256");
  assertSha256(promptSha256, "artifact.extraction.promptSha256");
  const models = [modelProvider, modelName, modelVersion];
  if (method === "human" && models.some((item) => item !== null)) {
    throw new TypeError("human extraction must not claim a model identity");
  }
  if (method !== "human" && models.some((item) => item === null)) {
    throw new TypeError("machine-assisted extraction requires complete model identity");
  }
  for (const [index, model] of models.entries()) {
    if (model !== null) assertNonBlank(model, `artifact.extraction.model[${index}]`, 300);
  }
  return {
    method,
    extractorPrincipalId,
    modelProvider,
    modelName,
    modelVersion,
    codeVersion,
    codeSha256,
    configSha256,
    promptSha256,
  };
}

function parseCutoffs(value: unknown): InformationCutoffs {
  assertRecord(value, "artifact.cutoffs");
  assertExactKeys(value, CUTOFF_KEYS, "artifact.cutoffs");
  const publicationCutoff = expectString(
    value.publicationCutoff,
    "artifact.cutoffs.publicationCutoff",
  );
  const retrievalCutoff = expectString(value.retrievalCutoff, "artifact.cutoffs.retrievalCutoff");
  const availableCutoff = expectString(value.availableCutoff, "artifact.cutoffs.availableCutoff");
  const systemCutoff = expectString(value.systemCutoff, "artifact.cutoffs.systemCutoff");
  for (const [field, instant] of [
    ["publicationCutoff", publicationCutoff],
    ["retrievalCutoff", retrievalCutoff],
    ["availableCutoff", availableCutoff],
    ["systemCutoff", systemCutoff],
  ] as const) {
    assertIsoInstant(instant, `artifact.cutoffs.${field}`);
  }
  if (
    compareInstant(publicationCutoff, retrievalCutoff) > 0 ||
    compareInstant(retrievalCutoff, availableCutoff) > 0 ||
    compareInstant(availableCutoff, systemCutoff) > 0
  ) {
    throw new TypeError("artifact cutoffs must be monotonic from publication through system time");
  }
  return { publicationCutoff, retrievalCutoff, availableCutoff, systemCutoff };
}

function parseUncertainty(value: unknown, index: number): UncertaintyStatement {
  const field = `artifact.uncertainty[${index}]`;
  assertRecord(value, field);
  assertExactKeys(value, ["kind", "description"], field);
  const description = expectString(value.description, `${field}.description`);
  assertNonBlank(description, `${field}.description`, 1_000);
  return {
    kind: enumValue(
      value.kind,
      ["ambiguity", "entity_resolution", "extraction", "source_disagreement"] as const,
      `${field}.kind`,
    ),
    description,
  };
}

function parseEntityResolution(value: unknown): EntityResolution {
  assertRecord(value, "artifact.entityResolution");
  assertExactKeys(value, ["state", "canonicalEntityIds"], "artifact.entityResolution");
  const state = enumValue(
    value.state,
    ["ambiguous", "resolved", "unresolved"] as const,
    "artifact.entityResolution.state",
  );
  const canonicalEntityIds = uniqueSortedStrings(
    expectArray(value.canonicalEntityIds, "artifact.entityResolution.canonicalEntityIds"),
    "artifact.entityResolution.canonicalEntityIds",
    assertUuid,
  );
  if (state === "unresolved" && canonicalEntityIds.length !== 0) {
    throw new TypeError("unresolved entities cannot have canonical IDs");
  }
  if (state === "resolved" && canonicalEntityIds.length !== 1) {
    throw new TypeError("resolved entities require exactly one canonical ID");
  }
  if (state === "ambiguous" && canonicalEntityIds.length < 2) {
    throw new TypeError("ambiguous entities require at least two candidate IDs");
  }
  return { state, canonicalEntityIds };
}

function parseFact(value: unknown): StructuredFact {
  assertRecord(value, "artifact.structuredFact");
  assertExactKeys(
    value,
    [
      "subjectKey",
      "predicateKey",
      "objectKind",
      "canonicalValue",
      "unit",
      "surfaceText",
      "supportingSpanIds",
      "normalizationRationale",
      "polarity",
    ],
    "artifact.structuredFact",
  );
  const subjectKey = expectString(value.subjectKey, "artifact.structuredFact.subjectKey");
  const predicateKey = expectString(value.predicateKey, "artifact.structuredFact.predicateKey");
  const canonicalValue = expectString(
    value.canonicalValue,
    "artifact.structuredFact.canonicalValue",
  );
  const unit = expectNullableString(value.unit, "artifact.structuredFact.unit");
  const surfaceText = expectString(value.surfaceText, "artifact.structuredFact.surfaceText");
  const normalizationRationale = expectString(
    value.normalizationRationale,
    "artifact.structuredFact.normalizationRationale",
  );
  assertKey(subjectKey, "artifact.structuredFact.subjectKey");
  assertKey(predicateKey, "artifact.structuredFact.predicateKey");
  assertNonBlank(canonicalValue, "artifact.structuredFact.canonicalValue", 1_000);
  if (unit !== null) assertKey(unit, "artifact.structuredFact.unit");
  assertNonBlank(surfaceText, "artifact.structuredFact.surfaceText", 500);
  assertNonBlank(normalizationRationale, "artifact.structuredFact.normalizationRationale", 1_000);
  const objectKind = enumValue(
    value.objectKind,
    ["boolean", "date", "number", "text"] as const,
    "artifact.structuredFact.objectKind",
  );
  if (objectKind === "number")
    assertExactDecimal(canonicalValue, "artifact.structuredFact.canonicalValue");
  if (objectKind === "date")
    assertIsoDate(canonicalValue, "artifact.structuredFact.canonicalValue");
  if (objectKind === "boolean" && canonicalValue !== "true" && canonicalValue !== "false") {
    throw new TypeError("boolean structured facts require canonicalValue true or false");
  }
  if (objectKind !== "number" && unit !== null) {
    throw new TypeError("only numeric structured facts may declare a unit");
  }
  return {
    subjectKey,
    predicateKey,
    objectKind,
    canonicalValue,
    unit,
    surfaceText,
    supportingSpanIds: uniqueSortedStrings(
      expectArray(value.supportingSpanIds, "artifact.structuredFact.supportingSpanIds"),
      "artifact.structuredFact.supportingSpanIds",
      assertUuid,
      false,
    ),
    normalizationRationale,
    polarity: enumValue(
      value.polarity,
      ["affirm", "deny"] as const,
      "artifact.structuredFact.polarity",
    ),
  };
}

function parseGovernance(value: Record<string, unknown>): ArtifactGovernance {
  const extractedAt = expectString(value.extractedAt, "artifact.extractedAt");
  const confidence = expectString(value.confidence, "artifact.confidence");
  assertIsoInstant(extractedAt, "artifact.extractedAt");
  assertProbability(confidence, "artifact.confidence");
  const cutoffs = parseCutoffs(value.cutoffs);
  if (compareInstant(cutoffs.systemCutoff, extractedAt) > 0) {
    throw new TypeError("artifact cannot be extracted before its system cutoff");
  }
  return {
    extraction: parseExtraction(value.extraction),
    cutoffs,
    extractedAt,
    confidence,
    uncertainty: expectArray(value.uncertainty, "artifact.uncertainty").map(parseUncertainty),
    entityResolution: parseEntityResolution(value.entityResolution),
    limitations: uniqueSortedStrings(
      expectArray(value.limitations, "artifact.limitations"),
      "artifact.limitations",
      (item, field) => assertNonBlank(item, field, 1_000),
      false,
    ),
    invalidationConditions: uniqueSortedStrings(
      expectArray(value.invalidationConditions, "artifact.invalidationConditions"),
      "artifact.invalidationConditions",
      (item, field) => assertNonBlank(item, field, 1_000),
      false,
    ),
  };
}

function parseLanguageFields(
  value: Record<string, unknown>,
  field: string,
): {
  readonly language: string;
  readonly locale: string;
} {
  const language = expectString(value.language, `${field}.language`);
  const locale = expectString(value.locale, `${field}.locale`);
  assertLanguage(language, `${field}.language`);
  assertLocale(locale, `${field}.locale`);
  return { language, locale };
}

function parseNullableUuid(value: unknown, field: string): string | null {
  const parsed = expectNullableString(value, field);
  if (parsed !== null) assertUuid(parsed, field);
  return parsed;
}

function parseClaimInput(value: unknown): ExtractedClaimInput {
  assertRecord(value, "claim");
  assertExactKeys(value, CLAIM_KEYS, "claim");
  const tenant = parseTenant(value, "claim");
  const claimId = expectString(value.claimId, "claim.claimId");
  const statement = expectString(value.statement, "claim.statement");
  const validFrom = expectString(value.validFrom, "claim.validFrom");
  const validUntil = expectNullableString(value.validUntil, "claim.validUntil");
  assertUuid(claimId, "claim.claimId");
  assertNonBlank(statement, "claim.statement", 4_000);
  assertIsoInstant(validFrom, "claim.validFrom");
  if (validUntil !== null) {
    assertIsoInstant(validUntil, "claim.validUntil");
    if (compareInstant(validFrom, validUntil) >= 0) {
      throw new TypeError("claim validity window must be half-open and non-empty");
    }
  }
  return {
    schemaVersion: literalOne(value.schemaVersion, "claim.schemaVersion"),
    ...tenant,
    claimId,
    ...parseLanguageFields(value, "claim"),
    claimType: enumValue(
      value.claimType,
      ["factual", "interpretation"] as const,
      "claim.claimType",
    ),
    statement,
    structuredFact: parseFact(value.structuredFact),
    evidenceSpanIds: uniqueSortedStrings(
      expectArray(value.evidenceSpanIds, "claim.evidenceSpanIds"),
      "claim.evidenceSpanIds",
      assertUuid,
      false,
    ),
    validFrom,
    validUntil,
    epistemicScope: enumValue(
      value.epistemicScope,
      ["descriptive_non_causal"] as const,
      "claim.epistemicScope",
    ),
    supersedesClaimId: parseNullableUuid(value.supersedesClaimId, "claim.supersedesClaimId"),
    ...parseGovernance(value),
  };
}

function parseEventInput(value: unknown): ExtractedEventInput {
  assertRecord(value, "event");
  assertExactKeys(value, EVENT_KEYS, "event");
  const tenant = parseTenant(value, "event");
  const eventId = expectString(value.eventId, "event.eventId");
  const eventType = expectString(value.eventType, "event.eventType");
  const title = expectString(value.title, "event.title");
  const occurredAt = expectString(value.occurredAt, "event.occurredAt");
  assertUuid(eventId, "event.eventId");
  assertKey(eventType, "event.eventType");
  assertNonBlank(title, "event.title", 1_000);
  assertIsoInstant(occurredAt, "event.occurredAt");
  return {
    schemaVersion: literalOne(value.schemaVersion, "event.schemaVersion"),
    ...tenant,
    eventId,
    ...parseLanguageFields(value, "event"),
    basis: enumValue(
      value.basis,
      ["analyst_interpretation", "reported_fact"] as const,
      "event.basis",
    ),
    eventType,
    title,
    occurredAt,
    evidenceSpanIds: uniqueSortedStrings(
      expectArray(value.evidenceSpanIds, "event.evidenceSpanIds"),
      "event.evidenceSpanIds",
      assertUuid,
      false,
    ),
    epistemicScope: enumValue(
      value.epistemicScope,
      ["descriptive_non_causal"] as const,
      "event.epistemicScope",
    ),
    supersedesEventId: parseNullableUuid(value.supersedesEventId, "event.supersedesEventId"),
    ...parseGovernance(value),
  };
}

function parseMeasureInput(value: unknown): InstitutionalMeasureInput {
  assertRecord(value, "measure");
  assertExactKeys(value, MEASURE_KEYS, "measure");
  const tenant = parseTenant(value, "measure");
  const measureId = expectString(value.measureId, "measure.measureId");
  const institutionEntityId = expectString(
    value.institutionEntityId,
    "measure.institutionEntityId",
  );
  const measureType = expectString(value.measureType, "measure.measureType");
  const description = expectString(value.description, "measure.description");
  const announcedAt = expectString(value.announcedAt, "measure.announcedAt");
  const effectiveAt = expectNullableString(value.effectiveAt, "measure.effectiveAt");
  assertUuid(measureId, "measure.measureId");
  assertUuid(institutionEntityId, "measure.institutionEntityId");
  assertKey(measureType, "measure.measureType");
  assertNonBlank(description, "measure.description", 4_000);
  assertIsoInstant(announcedAt, "measure.announcedAt");
  if (effectiveAt !== null) assertIsoInstant(effectiveAt, "measure.effectiveAt");
  return {
    schemaVersion: literalOne(value.schemaVersion, "measure.schemaVersion"),
    ...tenant,
    measureId,
    institutionEntityId,
    ...parseLanguageFields(value, "measure"),
    basis: enumValue(
      value.basis,
      ["analyst_interpretation", "reported_fact"] as const,
      "measure.basis",
    ),
    measureType,
    description,
    announcedAt,
    effectiveAt,
    structuredFact: value.structuredFact === null ? null : parseFact(value.structuredFact),
    evidenceSpanIds: uniqueSortedStrings(
      expectArray(value.evidenceSpanIds, "measure.evidenceSpanIds"),
      "measure.evidenceSpanIds",
      assertUuid,
      false,
    ),
    epistemicScope: enumValue(
      value.epistemicScope,
      ["descriptive_non_causal"] as const,
      "measure.epistemicScope",
    ),
    supersedesMeasureId: parseNullableUuid(
      value.supersedesMeasureId,
      "measure.supersedesMeasureId",
    ),
    ...parseGovernance(value),
  };
}

function evidenceTexts(
  artifact: {
    readonly organizationId: string;
    readonly workspaceId: string;
    readonly language: string;
    readonly locale: string;
    readonly evidenceSpanIds: readonly string[];
    readonly cutoffs: InformationCutoffs;
  },
  context: EvidenceContext,
): ReadonlyMap<string, string> {
  assertRecord(context, "evidenceContext");
  assertExactKeys(
    context,
    ["documents", "snapshots", "spans", "sourceTextBySnapshotId"],
    "evidenceContext",
  );
  assertRecord(context.sourceTextBySnapshotId, "evidenceContext.sourceTextBySnapshotId");
  const documents = new Map<string, Readonly<SourceDocument>>();
  for (const document of context.documents) {
    assertSourceDocumentIntegrity(document);
    assertSameTenant(artifact, document, "artifact evidence document");
    if (documents.has(document.documentId))
      throw new TypeError("evidence context has duplicate document IDs");
    documents.set(document.documentId, document);
  }
  const snapshots = new Map<string, Readonly<SourceSnapshot>>();
  for (const snapshot of context.snapshots) {
    assertSourceSnapshotIntegrity(snapshot);
    assertSameTenant(artifact, snapshot, "artifact evidence snapshot");
    if (snapshots.has(snapshot.snapshotId))
      throw new TypeError("evidence context has duplicate snapshot IDs");
    snapshots.set(snapshot.snapshotId, snapshot);
  }
  const spans = new Map<string, Readonly<SourceSpan>>();
  for (const span of context.spans) {
    assertSourceSpanIntegrity(span);
    assertSameTenant(artifact, span, "artifact evidence span");
    if (spans.has(span.spanId)) throw new TypeError("evidence context has duplicate span IDs");
    spans.set(span.spanId, span);
  }
  const resolved = new Map<string, string>();
  for (const spanId of artifact.evidenceSpanIds) {
    const span = spans.get(spanId);
    if (span === undefined) throw new TypeError(`artifact has orphan evidence span ${spanId}`);
    const snapshot = snapshots.get(span.snapshotId);
    const document = documents.get(span.documentId);
    if (snapshot === undefined || document === undefined) {
      throw new TypeError("artifact evidence span has an orphan document or snapshot");
    }
    if (
      snapshot.documentId !== document.documentId ||
      snapshot.documentManifestSha256 !== document.manifestSha256 ||
      span.snapshotManifestSha256 !== snapshot.manifestSha256
    ) {
      throw new TypeError("artifact evidence contains a stale or forged manifest binding");
    }
    if (artifact.language !== span.language || artifact.locale !== span.locale) {
      throw new TypeError("artifact evidence must cite original-language spans, not translations");
    }
    if (
      compareInstant(document.publishedAt, artifact.cutoffs.publicationCutoff) > 0 ||
      compareInstant(snapshot.retrievedAt, artifact.cutoffs.retrievalCutoff) > 0 ||
      compareInstant(snapshot.availableAt, artifact.cutoffs.availableCutoff) > 0 ||
      compareInstant(snapshot.recordedAt, artifact.cutoffs.systemCutoff) > 0
    ) {
      throw new TypeError("artifact cites evidence later than its declared information cutoffs");
    }
    const sourceText = Object.hasOwn(context.sourceTextBySnapshotId, snapshot.snapshotId)
      ? context.sourceTextBySnapshotId[snapshot.snapshotId]
      : undefined;
    if (
      sourceText === undefined ||
      sourceText.length !== snapshot.contentLength ||
      sha256Text(sourceText) !== snapshot.contentSha256
    ) {
      throw new TypeError("artifact evidence lacks a valid immutable source text proof");
    }
    const exactText = sourceText.slice(span.startOffset, span.endOffset);
    if (sha256Text(exactText) !== span.textSha256) {
      throw new TypeError("artifact evidence span offsets do not match the snapshot text");
    }
    resolved.set(spanId, exactText);
  }
  return resolved;
}

function assertTextTokensSupported(
  text: string,
  spanTexts: ReadonlyMap<string, string>,
  field: string,
): void {
  const tokens = text.match(/\b\d[\d.,:/%-]*\b/g) ?? [];
  for (const token of new Set(tokens)) {
    if (![...spanTexts.values()].some((spanText) => spanText.includes(token))) {
      throw new TypeError(`${field} contains unsupported numeric or date token: ${token}`);
    }
  }
}

function assertFactSupported(
  fact: StructuredFact,
  evidenceSpanIds: readonly string[],
  spanTexts: ReadonlyMap<string, string>,
): void {
  for (const spanId of fact.supportingSpanIds) {
    if (!evidenceSpanIds.includes(spanId)) {
      throw new TypeError("structured fact support must be included in artifact evidence spans");
    }
  }
  if (
    !fact.supportingSpanIds.some(
      (spanId) => spanTexts.get(spanId)?.includes(fact.surfaceText) === true,
    )
  ) {
    throw new TypeError(
      "structured fact surface text is not present in its cited exact source spans",
    );
  }
}

export function createExtractedClaim(
  value: unknown,
  context: EvidenceContext,
): Readonly<ExtractedClaim> {
  const parsed = parseClaimInput(value);
  const texts = evidenceTexts(parsed, context);
  assertFactSupported(parsed.structuredFact, parsed.evidenceSpanIds, texts);
  assertTextTokensSupported(parsed.statement, texts, "claim.statement");
  return seal(parsed);
}

export function assertExtractedClaimIntegrity(
  value: unknown,
): asserts value is Readonly<ExtractedClaim> {
  assertRecord(value, "claim");
  assertExactKeys(value, [...CLAIM_KEYS, "manifestSha256"], "claim");
  const manifest = expectString(value.manifestSha256, "claim.manifestSha256");
  parseClaimInput(Object.fromEntries(CLAIM_KEYS.map((key) => [key, value[key]])));
  verifyManifest(value, manifest, "claim");
}

export function createExtractedEvent(
  value: unknown,
  context: EvidenceContext,
): Readonly<ExtractedEvent> {
  const parsed = parseEventInput(value);
  const texts = evidenceTexts(parsed, context);
  assertTextTokensSupported(parsed.title, texts, "event.title");
  const eventDate = parsed.occurredAt.slice(0, 10);
  if (![...texts.values()].some((text) => text.includes(eventDate))) {
    throw new TypeError("event occurrence date must be explicit in a cited source span");
  }
  return seal(parsed);
}

export function assertExtractedEventIntegrity(
  value: unknown,
): asserts value is Readonly<ExtractedEvent> {
  assertRecord(value, "event");
  assertExactKeys(value, [...EVENT_KEYS, "manifestSha256"], "event");
  const manifest = expectString(value.manifestSha256, "event.manifestSha256");
  parseEventInput(Object.fromEntries(EVENT_KEYS.map((key) => [key, value[key]])));
  verifyManifest(value, manifest, "event");
}

export function createInstitutionalMeasure(
  value: unknown,
  context: EvidenceContext,
): Readonly<InstitutionalMeasure> {
  const parsed = parseMeasureInput(value);
  const texts = evidenceTexts(parsed, context);
  if (parsed.structuredFact !== null) {
    assertFactSupported(parsed.structuredFact, parsed.evidenceSpanIds, texts);
  }
  assertTextTokensSupported(parsed.description, texts, "measure.description");
  const announcedDate = parsed.announcedAt.slice(0, 10);
  if (![...texts.values()].some((text) => text.includes(announcedDate))) {
    throw new TypeError("measure announcement date must be explicit in a cited source span");
  }
  if (
    parsed.effectiveAt !== null &&
    ![...texts.values()].some((text) => text.includes(parsed.effectiveAt?.slice(0, 10) ?? ""))
  ) {
    throw new TypeError("measure effective date must be explicit in a cited source span");
  }
  return seal(parsed);
}

export function assertInstitutionalMeasureIntegrity(
  value: unknown,
): asserts value is Readonly<InstitutionalMeasure> {
  assertRecord(value, "measure");
  assertExactKeys(value, [...MEASURE_KEYS, "manifestSha256"], "measure");
  const manifest = expectString(value.manifestSha256, "measure.manifestSha256");
  parseMeasureInput(Object.fromEntries(MEASURE_KEYS.map((key) => [key, value[key]])));
  verifyManifest(value, manifest, "measure");
}

export type NarrativeArtifact = ExtractedClaim | ExtractedEvent | InstitutionalMeasure;

export function assertNarrativeArtifactEvidenceIntegrity(
  artifact: Readonly<NarrativeArtifact>,
  context: EvidenceContext,
): void {
  if ("claimId" in artifact) {
    assertExtractedClaimIntegrity(artifact);
    const texts = evidenceTexts(artifact, context);
    assertFactSupported(artifact.structuredFact, artifact.evidenceSpanIds, texts);
    assertTextTokensSupported(artifact.statement, texts, "claim.statement");
    return;
  }
  if ("eventId" in artifact) {
    assertExtractedEventIntegrity(artifact);
    const texts = evidenceTexts(artifact, context);
    assertTextTokensSupported(artifact.title, texts, "event.title");
    if (![...texts.values()].some((text) => text.includes(artifact.occurredAt.slice(0, 10)))) {
      throw new TypeError("event occurrence date must be explicit in a cited source span");
    }
    return;
  }
  assertInstitutionalMeasureIntegrity(artifact);
  const texts = evidenceTexts(artifact, context);
  if (artifact.structuredFact !== null) {
    assertFactSupported(artifact.structuredFact, artifact.evidenceSpanIds, texts);
  }
  assertTextTokensSupported(artifact.description, texts, "measure.description");
  if (![...texts.values()].some((text) => text.includes(artifact.announcedAt.slice(0, 10)))) {
    throw new TypeError("measure announcement date must be explicit in a cited source span");
  }
  if (
    artifact.effectiveAt !== null &&
    ![...texts.values()].some((text) => text.includes(artifact.effectiveAt?.slice(0, 10) ?? ""))
  ) {
    throw new TypeError("measure effective date must be explicit in a cited source span");
  }
}
