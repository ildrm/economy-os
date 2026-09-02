import {
  assertExactKeys,
  assertIsoInstant,
  assertKey,
  assertLanguage,
  assertLocale,
  assertNonBlank,
  assertRecord,
  assertSameTenant,
  assertSemver,
  assertSha256,
  assertUuid,
  compareInstant,
  enumValue,
  expectArray,
  expectBoolean,
  expectInteger,
  expectNullableString,
  expectString,
  literalOne,
  parseTenant,
  seal,
  sha256Text,
  uniqueSortedStrings,
  verifyManifest,
} from "./internals.js";

export const SOURCE_TYPES = [
  "filing",
  "legislation",
  "news",
  "official_release",
  "other",
  "research",
  "transcript",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_CLASSIFICATIONS = ["confidential", "internal", "public", "restricted"] as const;
export type SourceClassification = (typeof SOURCE_CLASSIFICATIONS)[number];
export const EXPORT_POLICIES = ["citation_only", "deny", "derived_only"] as const;
export type ExportPolicy = (typeof EXPORT_POLICIES)[number];

export interface LicensePolicy {
  readonly licenseId: string;
  readonly termsUri: string;
  readonly allowsInternalFullText: boolean;
  readonly allowsCitationSnippets: boolean;
  readonly allowsDerivedExport: boolean;
  readonly maxCitationCharacters: number;
}

export interface SourceDocumentInput {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly documentId: string;
  readonly sourceKey: string;
  readonly sourceType: SourceType;
  readonly canonicalUri: string;
  readonly title: string;
  readonly publisher: string;
  readonly language: string;
  readonly locale: string;
  readonly publishedAt: string;
  readonly classification: SourceClassification;
  readonly exportPolicy: ExportPolicy;
  readonly license: LicensePolicy;
  readonly attribution: string;
}

export interface SourceDocument extends SourceDocumentInput {
  readonly manifestSha256: string;
}

export interface SourceSnapshotInput {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly snapshotId: string;
  readonly documentId: string;
  readonly documentManifestSha256: string;
  readonly versionLabel: string;
  readonly mediaType: string;
  readonly language: string;
  readonly locale: string;
  readonly offsetEncoding: "utf16_code_unit";
  readonly contentLength: number;
  readonly contentSha256: string;
  readonly retrievedAt: string;
  readonly availableAt: string;
  readonly recordedAt: string;
}

export interface SourceSnapshot extends SourceSnapshotInput {
  readonly manifestSha256: string;
}

export interface SourceLocator {
  readonly kind: "page" | "section";
  readonly value: string;
}

export interface SourceSpanInput {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly spanId: string;
  readonly documentId: string;
  readonly snapshotId: string;
  readonly snapshotManifestSha256: string;
  readonly language: string;
  readonly locale: string;
  readonly locator: SourceLocator;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly textSha256: string;
  readonly citationSnippet: string | null;
  readonly snippetStartOffset: number | null;
  readonly snippetEndOffset: number | null;
}

export interface SourceSpan extends SourceSpanInput {
  readonly manifestSha256: string;
}

export interface TranslationModelIdentity {
  readonly provider: string;
  readonly model: string;
  readonly version: string;
  readonly configSha256: string;
}

export interface TranslationArtifactInput {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly translationId: string;
  readonly originalSpanId: string;
  readonly originalSpanManifestSha256: string;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly targetLocale: string;
  readonly translatedTextSha256: string;
  readonly method: "human" | "hybrid" | "machine";
  readonly translatorPrincipalId: string | null;
  readonly modelIdentity: TranslationModelIdentity | null;
  readonly createdAt: string;
  readonly limitations: readonly string[];
}

export interface TranslationArtifact extends TranslationArtifactInput {
  readonly manifestSha256: string;
}

const DOCUMENT_KEYS = [
  "schemaVersion",
  "organizationId",
  "workspaceId",
  "documentId",
  "sourceKey",
  "sourceType",
  "canonicalUri",
  "title",
  "publisher",
  "language",
  "locale",
  "publishedAt",
  "classification",
  "exportPolicy",
  "license",
  "attribution",
] as const;
const SNAPSHOT_KEYS = [
  "schemaVersion",
  "organizationId",
  "workspaceId",
  "snapshotId",
  "documentId",
  "documentManifestSha256",
  "versionLabel",
  "mediaType",
  "language",
  "locale",
  "offsetEncoding",
  "contentLength",
  "contentSha256",
  "retrievedAt",
  "availableAt",
  "recordedAt",
] as const;
const SPAN_KEYS = [
  "schemaVersion",
  "organizationId",
  "workspaceId",
  "spanId",
  "documentId",
  "snapshotId",
  "snapshotManifestSha256",
  "language",
  "locale",
  "locator",
  "startOffset",
  "endOffset",
  "textSha256",
  "citationSnippet",
  "snippetStartOffset",
  "snippetEndOffset",
] as const;
const TRANSLATION_KEYS = [
  "schemaVersion",
  "organizationId",
  "workspaceId",
  "translationId",
  "originalSpanId",
  "originalSpanManifestSha256",
  "sourceLanguage",
  "targetLanguage",
  "targetLocale",
  "translatedTextSha256",
  "method",
  "translatorPrincipalId",
  "modelIdentity",
  "createdAt",
  "limitations",
] as const;

function parseLicense(value: unknown): LicensePolicy {
  assertRecord(value, "sourceDocument.license");
  assertExactKeys(
    value,
    [
      "licenseId",
      "termsUri",
      "allowsInternalFullText",
      "allowsCitationSnippets",
      "allowsDerivedExport",
      "maxCitationCharacters",
    ],
    "sourceDocument.license",
  );
  const licenseId = expectString(value.licenseId, "sourceDocument.license.licenseId");
  const termsUri = expectString(value.termsUri, "sourceDocument.license.termsUri");
  assertKey(licenseId, "sourceDocument.license.licenseId");
  assertNonBlank(termsUri, "sourceDocument.license.termsUri", 2_000);
  const allowsCitationSnippets = expectBoolean(
    value.allowsCitationSnippets,
    "sourceDocument.license.allowsCitationSnippets",
  );
  const maxCitationCharacters = expectInteger(
    value.maxCitationCharacters,
    "sourceDocument.license.maxCitationCharacters",
  );
  if (maxCitationCharacters > 1_000) {
    throw new TypeError("sourceDocument.license.maxCitationCharacters must be <= 1000");
  }
  if (!allowsCitationSnippets && maxCitationCharacters !== 0) {
    throw new TypeError("a license denying citation snippets must set maxCitationCharacters to 0");
  }
  return {
    licenseId,
    termsUri,
    allowsInternalFullText: expectBoolean(
      value.allowsInternalFullText,
      "sourceDocument.license.allowsInternalFullText",
    ),
    allowsCitationSnippets,
    allowsDerivedExport: expectBoolean(
      value.allowsDerivedExport,
      "sourceDocument.license.allowsDerivedExport",
    ),
    maxCitationCharacters,
  };
}

function parseDocumentInput(value: unknown): SourceDocumentInput {
  assertRecord(value, "sourceDocument");
  assertExactKeys(value, DOCUMENT_KEYS, "sourceDocument");
  const tenant = parseTenant(value, "sourceDocument");
  const documentId = expectString(value.documentId, "sourceDocument.documentId");
  const sourceKey = expectString(value.sourceKey, "sourceDocument.sourceKey");
  const canonicalUri = expectString(value.canonicalUri, "sourceDocument.canonicalUri");
  const title = expectString(value.title, "sourceDocument.title");
  const publisher = expectString(value.publisher, "sourceDocument.publisher");
  const language = expectString(value.language, "sourceDocument.language");
  const locale = expectString(value.locale, "sourceDocument.locale");
  const publishedAt = expectString(value.publishedAt, "sourceDocument.publishedAt");
  const attribution = expectString(value.attribution, "sourceDocument.attribution");
  assertUuid(documentId, "sourceDocument.documentId");
  assertKey(sourceKey, "sourceDocument.sourceKey");
  for (const [field, item, maximum] of [
    ["canonicalUri", canonicalUri, 2_000],
    ["title", title, 500],
    ["publisher", publisher, 300],
    ["attribution", attribution, 1_000],
  ] as const) {
    assertNonBlank(item, `sourceDocument.${field}`, maximum);
  }
  assertLanguage(language, "sourceDocument.language");
  assertLocale(locale, "sourceDocument.locale");
  assertIsoInstant(publishedAt, "sourceDocument.publishedAt");
  const license = parseLicense(value.license);
  const exportPolicy = enumValue(
    value.exportPolicy,
    EXPORT_POLICIES,
    "sourceDocument.exportPolicy",
  );
  if (exportPolicy === "citation_only" && !license.allowsCitationSnippets) {
    throw new TypeError("citation_only export requires a license allowing citation snippets");
  }
  if (exportPolicy === "derived_only" && !license.allowsDerivedExport) {
    throw new TypeError("derived_only export requires a license allowing derived export");
  }
  return {
    schemaVersion: literalOne(value.schemaVersion, "sourceDocument.schemaVersion"),
    ...tenant,
    documentId,
    sourceKey,
    sourceType: enumValue(value.sourceType, SOURCE_TYPES, "sourceDocument.sourceType"),
    canonicalUri,
    title,
    publisher,
    language,
    locale,
    publishedAt,
    classification: enumValue(
      value.classification,
      SOURCE_CLASSIFICATIONS,
      "sourceDocument.classification",
    ),
    exportPolicy,
    license,
    attribution,
  };
}

export function createSourceDocument(value: unknown): Readonly<SourceDocument> {
  return seal(parseDocumentInput(value));
}

export function assertSourceDocumentIntegrity(
  value: unknown,
): asserts value is Readonly<SourceDocument> {
  assertRecord(value, "sourceDocument");
  assertExactKeys(value, [...DOCUMENT_KEYS, "manifestSha256"], "sourceDocument");
  const manifest = expectString(value.manifestSha256, "sourceDocument.manifestSha256");
  parseDocumentInput(Object.fromEntries(DOCUMENT_KEYS.map((key) => [key, value[key]])));
  verifyManifest(value, manifest, "sourceDocument");
}

function parseSnapshotInput(value: unknown): SourceSnapshotInput {
  assertRecord(value, "sourceSnapshot");
  assertExactKeys(value, SNAPSHOT_KEYS, "sourceSnapshot");
  const tenant = parseTenant(value, "sourceSnapshot");
  const snapshotId = expectString(value.snapshotId, "sourceSnapshot.snapshotId");
  const documentId = expectString(value.documentId, "sourceSnapshot.documentId");
  const documentManifestSha256 = expectString(
    value.documentManifestSha256,
    "sourceSnapshot.documentManifestSha256",
  );
  const versionLabel = expectString(value.versionLabel, "sourceSnapshot.versionLabel");
  const mediaType = expectString(value.mediaType, "sourceSnapshot.mediaType");
  const language = expectString(value.language, "sourceSnapshot.language");
  const locale = expectString(value.locale, "sourceSnapshot.locale");
  const contentSha256 = expectString(value.contentSha256, "sourceSnapshot.contentSha256");
  const retrievedAt = expectString(value.retrievedAt, "sourceSnapshot.retrievedAt");
  const availableAt = expectString(value.availableAt, "sourceSnapshot.availableAt");
  const recordedAt = expectString(value.recordedAt, "sourceSnapshot.recordedAt");
  assertUuid(snapshotId, "sourceSnapshot.snapshotId");
  assertUuid(documentId, "sourceSnapshot.documentId");
  assertSha256(documentManifestSha256, "sourceSnapshot.documentManifestSha256");
  assertNonBlank(versionLabel, "sourceSnapshot.versionLabel", 300);
  assertNonBlank(mediaType, "sourceSnapshot.mediaType", 200);
  assertLanguage(language, "sourceSnapshot.language");
  assertLocale(locale, "sourceSnapshot.locale");
  assertSha256(contentSha256, "sourceSnapshot.contentSha256");
  for (const [field, instant] of [
    ["retrievedAt", retrievedAt],
    ["availableAt", availableAt],
    ["recordedAt", recordedAt],
  ] as const) {
    assertIsoInstant(instant, `sourceSnapshot.${field}`);
  }
  if (compareInstant(availableAt, retrievedAt) > 0 || compareInstant(retrievedAt, recordedAt) > 0) {
    throw new TypeError("source snapshot requires availableAt <= retrievedAt <= recordedAt");
  }
  return {
    schemaVersion: literalOne(value.schemaVersion, "sourceSnapshot.schemaVersion"),
    ...tenant,
    snapshotId,
    documentId,
    documentManifestSha256,
    versionLabel,
    mediaType,
    language,
    locale,
    offsetEncoding: enumValue(
      value.offsetEncoding,
      ["utf16_code_unit"] as const,
      "sourceSnapshot.offsetEncoding",
    ),
    contentLength: expectInteger(value.contentLength, "sourceSnapshot.contentLength", 1),
    contentSha256,
    retrievedAt,
    availableAt,
    recordedAt,
  };
}

export function createSourceSnapshot(
  value: unknown,
  document: Readonly<SourceDocument>,
  sourceText: string,
): Readonly<SourceSnapshot> {
  assertSourceDocumentIntegrity(document);
  const parsed = parseSnapshotInput(value);
  assertSameTenant(document, parsed, "sourceSnapshot.document");
  if (
    parsed.documentId !== document.documentId ||
    parsed.documentManifestSha256 !== document.manifestSha256
  ) {
    throw new TypeError("source snapshot is not bound to the supplied document manifest");
  }
  if (parsed.language !== document.language || parsed.locale !== document.locale) {
    throw new TypeError("source snapshot language and locale must preserve document identity");
  }
  if (compareInstant(document.publishedAt, parsed.retrievedAt) > 0) {
    throw new TypeError("source snapshot cannot be retrieved before publication");
  }
  if (
    sourceText.length !== parsed.contentLength ||
    sha256Text(sourceText) !== parsed.contentSha256
  ) {
    throw new TypeError("source snapshot content proof does not match length and digest");
  }
  return seal(parsed);
}

export function assertSourceSnapshotIntegrity(
  value: unknown,
): asserts value is Readonly<SourceSnapshot> {
  assertRecord(value, "sourceSnapshot");
  assertExactKeys(value, [...SNAPSHOT_KEYS, "manifestSha256"], "sourceSnapshot");
  const manifest = expectString(value.manifestSha256, "sourceSnapshot.manifestSha256");
  parseSnapshotInput(Object.fromEntries(SNAPSHOT_KEYS.map((key) => [key, value[key]])));
  verifyManifest(value, manifest, "sourceSnapshot");
}

function parseLocator(value: unknown): SourceLocator {
  assertRecord(value, "sourceSpan.locator");
  assertExactKeys(value, ["kind", "value"], "sourceSpan.locator");
  const locatorValue = expectString(value.value, "sourceSpan.locator.value");
  assertNonBlank(locatorValue, "sourceSpan.locator.value", 300);
  return {
    kind: enumValue(value.kind, ["page", "section"] as const, "sourceSpan.locator.kind"),
    value: locatorValue,
  };
}

function parseSpanInput(value: unknown): SourceSpanInput {
  assertRecord(value, "sourceSpan");
  assertExactKeys(value, SPAN_KEYS, "sourceSpan");
  const tenant = parseTenant(value, "sourceSpan");
  const spanId = expectString(value.spanId, "sourceSpan.spanId");
  const documentId = expectString(value.documentId, "sourceSpan.documentId");
  const snapshotId = expectString(value.snapshotId, "sourceSpan.snapshotId");
  const snapshotManifestSha256 = expectString(
    value.snapshotManifestSha256,
    "sourceSpan.snapshotManifestSha256",
  );
  const language = expectString(value.language, "sourceSpan.language");
  const locale = expectString(value.locale, "sourceSpan.locale");
  const textSha256 = expectString(value.textSha256, "sourceSpan.textSha256");
  const citationSnippet = expectNullableString(value.citationSnippet, "sourceSpan.citationSnippet");
  const snippetStartOffset =
    value.snippetStartOffset === null
      ? null
      : expectInteger(value.snippetStartOffset, "sourceSpan.snippetStartOffset");
  const snippetEndOffset =
    value.snippetEndOffset === null
      ? null
      : expectInteger(value.snippetEndOffset, "sourceSpan.snippetEndOffset");
  assertUuid(spanId, "sourceSpan.spanId");
  assertUuid(documentId, "sourceSpan.documentId");
  assertUuid(snapshotId, "sourceSpan.snapshotId");
  assertSha256(snapshotManifestSha256, "sourceSpan.snapshotManifestSha256");
  assertLanguage(language, "sourceSpan.language");
  assertLocale(locale, "sourceSpan.locale");
  assertSha256(textSha256, "sourceSpan.textSha256");
  if (citationSnippet !== null)
    assertNonBlank(citationSnippet, "sourceSpan.citationSnippet", 1_000);
  if (
    (citationSnippet === null && (snippetStartOffset !== null || snippetEndOffset !== null)) ||
    (citationSnippet !== null && (snippetStartOffset === null || snippetEndOffset === null))
  ) {
    throw new TypeError("source span snippet and both snippet offsets must be present together");
  }
  const startOffset = expectInteger(value.startOffset, "sourceSpan.startOffset");
  const endOffset = expectInteger(value.endOffset, "sourceSpan.endOffset", 1);
  if (startOffset >= endOffset) throw new TypeError("source span offsets must be non-empty");
  return {
    schemaVersion: literalOne(value.schemaVersion, "sourceSpan.schemaVersion"),
    ...tenant,
    spanId,
    documentId,
    snapshotId,
    snapshotManifestSha256,
    language,
    locale,
    locator: parseLocator(value.locator),
    startOffset,
    endOffset,
    textSha256,
    citationSnippet,
    snippetStartOffset,
    snippetEndOffset,
  };
}

export function createSourceSpan(
  value: unknown,
  document: Readonly<SourceDocument>,
  snapshot: Readonly<SourceSnapshot>,
  sourceText: string,
): Readonly<SourceSpan> {
  assertSourceDocumentIntegrity(document);
  assertSourceSnapshotIntegrity(snapshot);
  const parsed = parseSpanInput(value);
  assertSameTenant(document, parsed, "sourceSpan.document");
  assertSameTenant(snapshot, parsed, "sourceSpan.snapshot");
  if (parsed.documentId !== document.documentId || parsed.snapshotId !== snapshot.snapshotId) {
    throw new TypeError("source span is not bound to the supplied document and snapshot");
  }
  if (parsed.snapshotManifestSha256 !== snapshot.manifestSha256) {
    throw new TypeError("source span snapshot manifest binding is invalid");
  }
  if (
    snapshot.documentId !== document.documentId ||
    snapshot.documentManifestSha256 !== document.manifestSha256
  ) {
    throw new TypeError("source snapshot has a stale document manifest binding");
  }
  if (
    sourceText.length !== snapshot.contentLength ||
    sha256Text(sourceText) !== snapshot.contentSha256
  ) {
    throw new TypeError("source text does not match the immutable snapshot digest");
  }
  if (parsed.endOffset > sourceText.length) {
    throw new TypeError("source span endOffset exceeds snapshot content length");
  }
  if (parsed.language !== snapshot.language || parsed.locale !== snapshot.locale) {
    throw new TypeError("source span language and locale must preserve snapshot identity");
  }
  const exactText = sourceText.slice(parsed.startOffset, parsed.endOffset);
  if (sha256Text(exactText) !== parsed.textSha256) {
    throw new TypeError("source span digest does not match its exact source offsets");
  }
  if (parsed.citationSnippet === null) {
    if (document.license.allowsCitationSnippets) {
      throw new TypeError("citation-enabled sources require an explicit citation-safe snippet");
    }
  } else {
    if (!document.license.allowsCitationSnippets || document.exportPolicy === "deny") {
      throw new TypeError("source policy denies citation snippets");
    }
    const snippetStart = parsed.snippetStartOffset as number;
    const snippetEnd = parsed.snippetEndOffset as number;
    if (
      snippetStart < parsed.startOffset ||
      snippetEnd > parsed.endOffset ||
      snippetStart >= snippetEnd
    ) {
      throw new TypeError("citation snippet offsets must be a non-empty subset of the source span");
    }
    if (sourceText.slice(snippetStart, snippetEnd) !== parsed.citationSnippet) {
      throw new TypeError("citation snippet is not verbatim at its declared source offsets");
    }
    if (parsed.citationSnippet.length > document.license.maxCitationCharacters) {
      throw new TypeError("citation snippet exceeds the licensed character limit");
    }
  }
  return seal(parsed);
}

export function assertSourceSpanIntegrity(value: unknown): asserts value is Readonly<SourceSpan> {
  assertRecord(value, "sourceSpan");
  assertExactKeys(value, [...SPAN_KEYS, "manifestSha256"], "sourceSpan");
  const manifest = expectString(value.manifestSha256, "sourceSpan.manifestSha256");
  parseSpanInput(Object.fromEntries(SPAN_KEYS.map((key) => [key, value[key]])));
  verifyManifest(value, manifest, "sourceSpan");
}

function parseModelIdentity(value: unknown): TranslationModelIdentity {
  assertRecord(value, "translation.modelIdentity");
  assertExactKeys(
    value,
    ["provider", "model", "version", "configSha256"],
    "translation.modelIdentity",
  );
  const provider = expectString(value.provider, "translation.modelIdentity.provider");
  const model = expectString(value.model, "translation.modelIdentity.model");
  const version = expectString(value.version, "translation.modelIdentity.version");
  const configSha256 = expectString(value.configSha256, "translation.modelIdentity.configSha256");
  assertNonBlank(provider, "translation.modelIdentity.provider", 200);
  assertNonBlank(model, "translation.modelIdentity.model", 200);
  assertSemver(version, "translation.modelIdentity.version");
  assertSha256(configSha256, "translation.modelIdentity.configSha256");
  return { provider, model, version, configSha256 };
}

function parseTranslationInput(value: unknown): TranslationArtifactInput {
  assertRecord(value, "translation");
  assertExactKeys(value, TRANSLATION_KEYS, "translation");
  const tenant = parseTenant(value, "translation");
  const translationId = expectString(value.translationId, "translation.translationId");
  const originalSpanId = expectString(value.originalSpanId, "translation.originalSpanId");
  const originalSpanManifestSha256 = expectString(
    value.originalSpanManifestSha256,
    "translation.originalSpanManifestSha256",
  );
  const sourceLanguage = expectString(value.sourceLanguage, "translation.sourceLanguage");
  const targetLanguage = expectString(value.targetLanguage, "translation.targetLanguage");
  const targetLocale = expectString(value.targetLocale, "translation.targetLocale");
  const translatedTextSha256 = expectString(
    value.translatedTextSha256,
    "translation.translatedTextSha256",
  );
  const translatorPrincipalId = expectNullableString(
    value.translatorPrincipalId,
    "translation.translatorPrincipalId",
  );
  const createdAt = expectString(value.createdAt, "translation.createdAt");
  assertUuid(translationId, "translation.translationId");
  assertUuid(originalSpanId, "translation.originalSpanId");
  assertSha256(originalSpanManifestSha256, "translation.originalSpanManifestSha256");
  assertLanguage(sourceLanguage, "translation.sourceLanguage");
  assertLanguage(targetLanguage, "translation.targetLanguage");
  if (sourceLanguage === targetLanguage) {
    throw new TypeError("translation source and target languages must differ");
  }
  assertLocale(targetLocale, "translation.targetLocale");
  assertSha256(translatedTextSha256, "translation.translatedTextSha256");
  if (translatorPrincipalId !== null) {
    assertUuid(translatorPrincipalId, "translation.translatorPrincipalId");
  }
  assertIsoInstant(createdAt, "translation.createdAt");
  const method = enumValue(
    value.method,
    ["human", "hybrid", "machine"] as const,
    "translation.method",
  );
  const modelIdentity =
    value.modelIdentity === null ? null : parseModelIdentity(value.modelIdentity);
  if ((method === "human") !== (modelIdentity === null)) {
    throw new TypeError(
      "human translations must omit model identity; machine-assisted translations require it",
    );
  }
  if (method === "human" && translatorPrincipalId === null) {
    throw new TypeError("human translations require a translator principal");
  }
  return {
    schemaVersion: literalOne(value.schemaVersion, "translation.schemaVersion"),
    ...tenant,
    translationId,
    originalSpanId,
    originalSpanManifestSha256,
    sourceLanguage,
    targetLanguage,
    targetLocale,
    translatedTextSha256,
    method,
    translatorPrincipalId,
    modelIdentity,
    createdAt,
    limitations: uniqueSortedStrings(
      expectArray(value.limitations, "translation.limitations"),
      "translation.limitations",
      (item, field) => assertNonBlank(item, field, 1_000),
      false,
    ),
  };
}

export function createTranslationArtifact(
  value: unknown,
  originalSpan: Readonly<SourceSpan>,
  translatedText: string,
): Readonly<TranslationArtifact> {
  assertSourceSpanIntegrity(originalSpan);
  const parsed = parseTranslationInput(value);
  assertSameTenant(originalSpan, parsed, "translation.originalSpan");
  if (
    parsed.originalSpanId !== originalSpan.spanId ||
    parsed.originalSpanManifestSha256 !== originalSpan.manifestSha256
  ) {
    throw new TypeError("translation is not bound to the supplied original source span");
  }
  if (parsed.sourceLanguage !== originalSpan.language) {
    throw new TypeError("translation source language must equal the original evidence language");
  }
  if (sha256Text(translatedText) !== parsed.translatedTextSha256) {
    throw new TypeError("translated text proof does not match its digest");
  }
  return seal(parsed);
}

export function assertTranslationArtifactIntegrity(
  value: unknown,
): asserts value is Readonly<TranslationArtifact> {
  assertRecord(value, "translation");
  assertExactKeys(value, [...TRANSLATION_KEYS, "manifestSha256"], "translation");
  const manifest = expectString(value.manifestSha256, "translation.manifestSha256");
  parseTranslationInput(Object.fromEntries(TRANSLATION_KEYS.map((key) => [key, value[key]])));
  verifyManifest(value, manifest, "translation");
}
