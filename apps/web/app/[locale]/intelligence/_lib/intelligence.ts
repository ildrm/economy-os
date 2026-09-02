export const VECTOR_DIMENSIONS = [
  "macroeconomic",
  "human_economic",
  "financial_system",
  "market",
  "regime",
] as const;

export type VectorDimensionName = (typeof VECTOR_DIMENSIONS)[number];
export type VectorPolicy = "true_vintage" | "reconstructed" | "latest_revised";

export interface QueryContext {
  readonly workspaceId: string;
  readonly snapshotId: string;
  readonly knownAt: string;
  readonly policy: VectorPolicy;
  readonly systemAt: string | null;
}

export const CONTEXT_FIELD_NAMES = [
  "workspaceId",
  "snapshotId",
  "knownAt",
  "policy",
  "systemAt",
] as const;

export type ContextIssue = (typeof CONTEXT_FIELD_NAMES)[number];

export interface ContextValidation {
  readonly context: QueryContext | null;
  readonly issues: readonly ContextIssue[];
  readonly attempted: boolean;
}

export interface VectorDiagnostics {
  readonly dimensionCount: number;
  readonly reportedDimensionCount: number;
  readonly scoredDimensionCount: number;
  readonly insufficientDimensionCount: number;
  readonly missingDimensionCount: number;
  readonly dimensionCoverage: string;
  readonly scoredDimensionCoverage: string;
  readonly evidenceCoverage: string;
  readonly confidenceCoverage: string;
  readonly evidenceQuality: string | null;
  readonly reportedComponentCount: number;
  readonly observedComponentCount: number;
  readonly distinctSourceCount: number;
  readonly distinctSourceCoverage: string | null;
}

export interface VectorSummary {
  readonly id: string;
  readonly geography: {
    readonly id: string;
    readonly kind: string;
    readonly codeScheme: string;
    readonly code: string;
    readonly name: string;
  };
  readonly snapshot: { readonly id: string; readonly manifestSha256: string };
  readonly pointInTime: {
    readonly knownAt: string;
    readonly policy: string;
    readonly systemAt: string | null;
  };
  readonly diagnostics: VectorDiagnostics;
  readonly stateManifestSha256: string;
  readonly assembledAt: string;
  readonly links: { readonly self: string };
}

export interface VectorRun {
  readonly id: string;
  readonly status: "complete" | "partial" | "insufficient_data";
  readonly score: string | null;
  readonly missingReason: string | null;
  readonly completeness: string;
  readonly sourceCoverage: string;
  readonly confidence: string;
  readonly distinctSourceCount: number;
  readonly renormalized: boolean;
  readonly calculatedAt: string;
  readonly links: { readonly self: string; readonly components: string };
}

export interface VectorDimension {
  readonly ordinal: number;
  readonly dimension: VectorDimensionName;
  readonly model: null | {
    readonly id: string;
    readonly key: string;
    readonly version: string;
    readonly definitionSha256: string;
    readonly artifact: {
      readonly id: string;
      readonly sha256: string;
      readonly lifecycleStatus: string;
    };
  };
  readonly run: VectorRun | null;
  readonly missingReason: string | null;
}

export interface VectorDetail extends VectorSummary {
  readonly schemaVersion: 1;
  readonly methodologyScope: "research_baseline";
  readonly contextSha256: string;
  readonly dimensions: readonly VectorDimension[];
}

export interface VectorPage {
  readonly schemaVersion: 1;
  readonly methodologyScope: "research_baseline";
  readonly nextCursor: string | null;
  readonly vectors: readonly VectorSummary[];
}

export interface ComparisonVector {
  readonly id: string;
  readonly geography: VectorSummary["geography"];
  readonly diagnostics: VectorDiagnostics;
  readonly dimensions: readonly {
    readonly dimension: VectorDimensionName;
    readonly modelId: string | null;
    readonly modelDefinitionSha256: string | null;
    readonly modelArtifactId: string | null;
    readonly modelArtifactSha256: string | null;
    readonly score: string | null;
    readonly status: string | null;
    readonly missingReason: string | null;
    readonly completeness: string | null;
    readonly sourceCoverage: string | null;
    readonly confidence: string | null;
    readonly renormalized: boolean | null;
    readonly compatible: boolean;
  }[];
}

export interface ComparisonResult {
  readonly schemaVersion: 1;
  readonly methodologyScope: "research_baseline";
  readonly requestedVectorIds: readonly string[];
  readonly contextComparable: boolean;
  readonly contextDifferences: readonly string[];
  readonly dimensions: readonly {
    readonly dimension: VectorDimensionName;
    readonly compatible: boolean;
    readonly reason: string | null;
  }[];
  readonly vectors: readonly ComparisonVector[];
}

export type RequestFailureKind =
  | "permission_denied"
  | "policy_denied"
  | "offline"
  | "malformed"
  | "failed";

export type RequestResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly kind: RequestFailureKind; readonly traceId: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?Z$/;
const POLICIES = new Set<VectorPolicy>(["true_vintage", "reconstructed", "latest_revised"]);

export function validateContext(params: Pick<URLSearchParams, "get">): ContextValidation {
  const attempted = CONTEXT_FIELD_NAMES.some((field) => params.get(field) !== null);
  const workspaceId = params.get("workspaceId")?.trim() ?? "";
  const snapshotId = params.get("snapshotId")?.trim() ?? "";
  const knownAt = params.get("knownAt")?.trim() ?? "";
  const policy = params.get("policy")?.trim() ?? "";
  const rawSystemAt = params.get("systemAt")?.trim() ?? "";
  const systemCandidate = rawSystemAt === "null" ? "" : rawSystemAt;
  const issues: ContextIssue[] = [];
  const addIssue = (issue: ContextIssue) => {
    if (!issues.includes(issue)) issues.push(issue);
  };
  if (!UUID.test(workspaceId)) addIssue("workspaceId");
  if (!UUID.test(snapshotId)) addIssue("snapshotId");
  if (!isUtcInstant(knownAt)) addIssue("knownAt");
  if (!POLICIES.has(policy as VectorPolicy)) addIssue("policy");
  if (systemCandidate && !isUtcInstant(systemCandidate)) addIssue("systemAt");
  if (policy === "reconstructed" && !systemCandidate) addIssue("systemAt");
  if (policy === "latest_revised" && systemCandidate) addIssue("systemAt");
  if (issues.length > 0) {
    return Object.freeze({ context: null, issues: Object.freeze(issues), attempted });
  }
  return Object.freeze({
    context: Object.freeze({
      workspaceId,
      snapshotId,
      knownAt,
      policy: policy as VectorPolicy,
      systemAt: systemCandidate || null,
    }),
    issues: Object.freeze([]),
    attempted,
  });
}

export function contextParams(context: QueryContext): URLSearchParams {
  const params = new URLSearchParams({
    workspaceId: context.workspaceId,
    snapshotId: context.snapshotId,
    knownAt: context.knownAt,
    policy: context.policy,
    systemAt: context.systemAt ?? "null",
  });
  return params;
}

export function withContext(path: string, context: QueryContext): string {
  return `${path}?${contextParams(context).toString()}`;
}

export function listUrl(context: QueryContext, cursor?: string, limit = 25): string {
  const params = contextParams(context);
  params.set("limit", String(limit));
  if (cursor) params.set("cursor", cursor);
  return `/api/v1/economic-state/vectors?${params.toString()}`;
}

export function comparisonUrl(context: QueryContext, vectorIds: readonly string[]): string {
  const params = new URLSearchParams({
    workspaceId: context.workspaceId,
    vectorIds: vectorIds.join(","),
  });
  return `/api/v1/economic-state/comparisons?${params.toString()}`;
}

export function detailUrl(link: string, workspaceId: string): string | null {
  if (!link.startsWith("/api/v1/economic-state/vectors/")) return null;
  const url = new URL(link, "https://economyos.invalid");
  if (url.origin !== "https://economyos.invalid") return null;
  url.searchParams.set("workspaceId", workspaceId);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export async function requestJson<T>(
  url: string,
  parse: (value: unknown) => T | null,
  signal?: AbortSignal,
): Promise<RequestResult<T>> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "include",
      headers: { accept: "application/json" },
      ...(signal ? { signal } : {}),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const problem = record(body);
      const code = text(problem?.code)?.toUpperCase() ?? "";
      const traceId = text(problem?.traceId);
      if (response.status === 401 || response.status === 404) {
        return { ok: false, kind: "permission_denied", traceId };
      }
      if (response.status === 403) {
        return {
          ok: false,
          kind: /ENTITLEMENT|POLICY|LICENSE|CLASSIFICATION/.test(code)
            ? "policy_denied"
            : "permission_denied",
          traceId,
        };
      }
      return { ok: false, kind: "failed", traceId };
    }
    const data = parse(body);
    return data ? { ok: true, data } : { ok: false, kind: "malformed", traceId: null };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { ok: false, kind: "offline", traceId: null };
  }
}

export function parseVectorPage(value: unknown): VectorPage | null {
  const input = record(value);
  if (input?.schemaVersion !== 1 || input.methodologyScope !== "research_baseline") return null;
  const context = record(input.context);
  const contextSnapshot = record(context?.snapshot);
  const contextPit = record(context?.pointInTime);
  if (
    !uuid(context?.workspaceId) ||
    !uuid(contextSnapshot?.id) ||
    !isUtcInstant(text(contextPit?.knownAt) ?? "") ||
    !text(contextPit?.policy) ||
    nullableText(contextPit?.systemAt) === undefined
  )
    return null;
  const rawVectors = Array.isArray(input.vectors) ? input.vectors : null;
  if (!rawVectors) return null;
  const vectors = rawVectors.map(parseSummary);
  if (vectors.some((vector) => vector === null)) return null;
  const nextCursor = nullableText(input.nextCursor);
  if (nextCursor === undefined) return null;
  return {
    schemaVersion: 1,
    methodologyScope: "research_baseline",
    nextCursor,
    vectors: vectors as VectorSummary[],
  };
}

export function parseVectorDetail(value: unknown): VectorDetail | null {
  const input = record(value);
  if (input?.schemaVersion !== 1 || input.methodologyScope !== "research_baseline") return null;
  const summary = parseSummary(input);
  const contextSha256 = digest(input.contextSha256);
  const rawDimensions = Array.isArray(input.dimensions) ? input.dimensions : null;
  if (!summary || !contextSha256 || !rawDimensions || rawDimensions.length !== 5) return null;
  const dimensions = rawDimensions.map((entry, index) => parseDimension(entry, index));
  if (dimensions.some((dimension) => dimension === null)) return null;
  return {
    ...summary,
    schemaVersion: 1,
    methodologyScope: "research_baseline",
    contextSha256,
    dimensions: dimensions as VectorDimension[],
  };
}

export function parseComparison(value: unknown): ComparisonResult | null {
  const input = record(value);
  if (input?.schemaVersion !== 1 || input.methodologyScope !== "research_baseline") return null;
  const requestedVectorIds = stringArray(input.requestedVectorIds ?? input.vectorIds);
  const rawVectors = Array.isArray(input.vectors) ? input.vectors : null;
  if (!requestedVectorIds || requestedVectorIds.length < 2 || !rawVectors) return null;
  const compatibility = record(input.compatibility);
  const snapshotCompatibility = record(compatibility?.snapshot);
  const pointInTimeCompatibility = record(compatibility?.pointInTime);
  const rawCompatibility = Array.isArray(compatibility?.dimensions)
    ? compatibility.dimensions
    : null;
  if (
    typeof compatibility?.compatible !== "boolean" ||
    typeof snapshotCompatibility?.compatible !== "boolean" ||
    !text(snapshotCompatibility.reason) ||
    typeof pointInTimeCompatibility?.compatible !== "boolean" ||
    !text(pointInTimeCompatibility.reason)
  )
    return null;
  if (!rawCompatibility || rawCompatibility.length !== VECTOR_DIMENSIONS.length) return null;
  const dimensions = VECTOR_DIMENSIONS.map((dimension, index) => {
    const item = record(rawCompatibility[index]);
    if (!item || item.dimension !== dimension || typeof item.compatible !== "boolean") return null;
    const reason = text(item.reason);
    if (!reason) return null;
    return {
      dimension,
      compatible: item.compatible,
      reason,
    };
  });
  if (dimensions.some((dimension) => dimension === null)) return null;
  const validDimensions = dimensions as ComparisonResult["dimensions"];
  const vectors = rawVectors.map((entry) => parseComparisonVector(entry, validDimensions));
  if (vectors.some((vector) => vector === null)) return null;
  const differences = [
    ...(snapshotCompatibility.compatible === false
      ? [`Snapshot: ${snapshotCompatibility.reason as string}`]
      : []),
    ...(pointInTimeCompatibility.compatible === false
      ? [`Point-in-time: ${pointInTimeCompatibility.reason as string}`]
      : []),
    ...validDimensions
      .filter((dimension) => !dimension.compatible)
      .map(
        (dimension) =>
          `${dimension.dimension.replaceAll("_", " ")}: ${dimension.reason ?? "incompatible"}`,
      ),
  ];
  return {
    schemaVersion: 1,
    methodologyScope: "research_baseline",
    requestedVectorIds,
    contextComparable: compatibility.compatible,
    contextDifferences: differences,
    dimensions: validDimensions,
    vectors: vectors as ComparisonVector[],
  };
}

export function parseVectorIds(value: string | null): readonly string[] | null {
  if (!value) return null;
  const ids = value.split(",").map((id) => id.trim());
  if (ids.length < 2 || ids.length > 10 || ids.some((id) => !UUID.test(id))) return null;
  if (new Set(ids).size !== ids.length) return null;
  return Object.freeze(ids);
}

export function formatPercent(locale: string, exact: string | null): string {
  if (exact === null) return "unknown";
  const numeric = Number(exact);
  if (!Number.isFinite(numeric)) return "unknown";
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(numeric);
}

export function formatScore(locale: string, exact: string | null): string {
  if (exact === null) return "unknown";
  const numeric = Number(exact);
  if (!Number.isFinite(numeric)) return "unknown";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(numeric);
}

export function formatInstant(locale: string, instant: string): string {
  const date = new Date(instant);
  if (Number.isNaN(date.valueOf())) return instant;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function parseSummary(value: unknown): VectorSummary | null {
  const input = record(value);
  const geography = record(input?.geography);
  const snapshot = record(input?.snapshot);
  const pit = record(input?.pointInTime);
  const links = record(input?.links);
  const diagnostics = parseDiagnostics(input?.diagnostics);
  if (!input || !geography || !snapshot || !pit || !links || !diagnostics) return null;
  const id = uuid(input?.id);
  const geographyId = uuid(geography?.id);
  const snapshotId = uuid(snapshot?.id);
  const self = text(links?.self);
  if (
    !id ||
    !geographyId ||
    !snapshotId ||
    !self ||
    !text(geography?.kind) ||
    !text(geography?.codeScheme) ||
    !text(geography?.code) ||
    !text(geography?.name) ||
    !digest(snapshot?.manifestSha256) ||
    !isUtcInstant(text(pit?.knownAt) ?? "") ||
    !text(pit?.policy) ||
    nullableText(pit?.systemAt) === undefined ||
    !digest(input.stateManifestSha256) ||
    !isUtcInstant(text(input.assembledAt) ?? "")
  ) {
    return null;
  }
  return {
    id,
    geography: {
      id: geographyId,
      kind: text(geography.kind) as string,
      codeScheme: text(geography.codeScheme) as string,
      code: text(geography.code) as string,
      name: text(geography.name) as string,
    },
    snapshot: { id: snapshotId, manifestSha256: digest(snapshot.manifestSha256) as string },
    pointInTime: {
      knownAt: text(pit.knownAt) as string,
      policy: text(pit.policy) as string,
      systemAt: nullableText(pit.systemAt) as string | null,
    },
    diagnostics,
    stateManifestSha256: digest(input.stateManifestSha256) as string,
    assembledAt: text(input.assembledAt) as string,
    links: { self },
  };
}

function parseDiagnostics(value: unknown): VectorDiagnostics | null {
  const input = record(value);
  if (!input) return null;
  const integers = [
    "dimensionCount",
    "reportedDimensionCount",
    "scoredDimensionCount",
    "insufficientDimensionCount",
    "missingDimensionCount",
    "reportedComponentCount",
    "observedComponentCount",
    "distinctSourceCount",
  ] as const;
  if (integers.some((key) => !Number.isInteger(input[key]) || Number(input[key]) < 0)) return null;
  const decimals = [
    "dimensionCoverage",
    "scoredDimensionCoverage",
    "evidenceCoverage",
    "confidenceCoverage",
  ] as const;
  if (decimals.some((key) => !decimal(input[key]))) return null;
  if (nullableDecimal(input.evidenceQuality) === undefined) return null;
  if (nullableDecimal(input.distinctSourceCoverage) === undefined) return null;
  return {
    dimensionCount: input.dimensionCount as number,
    reportedDimensionCount: input.reportedDimensionCount as number,
    scoredDimensionCount: input.scoredDimensionCount as number,
    insufficientDimensionCount: input.insufficientDimensionCount as number,
    missingDimensionCount: input.missingDimensionCount as number,
    dimensionCoverage: input.dimensionCoverage as string,
    scoredDimensionCoverage: input.scoredDimensionCoverage as string,
    evidenceCoverage: input.evidenceCoverage as string,
    confidenceCoverage: input.confidenceCoverage as string,
    evidenceQuality: input.evidenceQuality as string | null,
    reportedComponentCount: input.reportedComponentCount as number,
    observedComponentCount: input.observedComponentCount as number,
    distinctSourceCount: input.distinctSourceCount as number,
    distinctSourceCoverage: input.distinctSourceCoverage as string | null,
  };
}

function parseDimension(value: unknown, index: number): VectorDimension | null {
  const input = record(value);
  const expected = VECTOR_DIMENSIONS[index];
  if (!input || !expected || input.ordinal !== index + 1 || input.dimension !== expected)
    return null;
  const missingReason = nullableText(input.missingReason);
  if (missingReason === undefined) return null;
  if (input.run === null && input.model === null) {
    return missingReason
      ? { ordinal: index + 1, dimension: expected, model: null, run: null, missingReason }
      : null;
  }
  const model = record(input.model);
  const artifact = record(model?.artifact);
  const run = record(input.run);
  const links = record(run?.links);
  const status = text(run?.status);
  if (
    !model ||
    !artifact ||
    !run ||
    !links ||
    missingReason !== null ||
    !uuid(model.id) ||
    !text(model.key) ||
    !text(model.version) ||
    !digest(model.definitionSha256) ||
    !uuid(artifact.id) ||
    !digest(artifact.sha256) ||
    !text(artifact.lifecycleStatus) ||
    !uuid(run.id) ||
    !["complete", "partial", "insufficient_data"].includes(status ?? "") ||
    nullableDecimal(run.score) === undefined ||
    nullableText(run.missingReason) === undefined ||
    !decimal(run.completeness) ||
    !decimal(run.sourceCoverage) ||
    !decimal(run.confidence) ||
    !Number.isInteger(run.distinctSourceCount) ||
    typeof run.renormalized !== "boolean" ||
    !isUtcInstant(text(run.calculatedAt) ?? "") ||
    !text(links?.self) ||
    !text(links?.components)
  ) {
    return null;
  }
  return {
    ordinal: index + 1,
    dimension: expected,
    model: {
      id: model.id as string,
      key: model.key as string,
      version: model.version as string,
      definitionSha256: model.definitionSha256 as string,
      artifact: {
        id: artifact.id as string,
        sha256: artifact.sha256 as string,
        lifecycleStatus: artifact.lifecycleStatus as string,
      },
    },
    run: {
      id: run.id as string,
      status: status as VectorRun["status"],
      score: run.score as string | null,
      missingReason: run.missingReason as string | null,
      completeness: run.completeness as string,
      sourceCoverage: run.sourceCoverage as string,
      confidence: run.confidence as string,
      distinctSourceCount: run.distinctSourceCount as number,
      renormalized: run.renormalized as boolean,
      calculatedAt: run.calculatedAt as string,
      links: { self: links.self as string, components: links.components as string },
    },
    missingReason: null,
  };
}

function parseComparisonVector(
  value: unknown,
  compatibility: readonly {
    readonly dimension: VectorDimensionName;
    readonly compatible: boolean;
  }[],
): ComparisonVector | null {
  const input = record(value);
  const geography = record(input?.geography);
  const diagnostics = parseDiagnostics(input?.diagnostics);
  const rawDimensions = Array.isArray(input?.dimensions) ? input.dimensions : null;
  const id = uuid(input?.id ?? input?.vectorId);
  if (
    !input ||
    !id ||
    !geography ||
    !uuid(geography.id) ||
    !text(geography.kind) ||
    !text(geography.codeScheme) ||
    !text(geography.code) ||
    !text(geography.name) ||
    !diagnostics ||
    !rawDimensions ||
    rawDimensions.length !== VECTOR_DIMENSIONS.length
  ) {
    return null;
  }
  const dimensions = VECTOR_DIMENSIONS.map((dimension, index) => {
    const item = record(rawDimensions[index]);
    if (!item || item.ordinal !== index + 1 || item.dimension !== dimension) return null;
    const modelId = nullableUuid(item.modelId);
    const modelDefinitionSha256 = nullableDigest(item.modelDefinitionSha256);
    const modelArtifactId = nullableUuid(item.modelArtifactId);
    const modelArtifactSha256 = nullableDigest(item.modelArtifactSha256);
    const status = nullableText(item.status);
    const score = nullableDecimal(item.score);
    const missingReason = nullableText(item.missingReason);
    const completeness = nullableDecimal(item.completeness);
    const sourceCoverage = nullableDecimal(item.sourceCoverage);
    const confidence = nullableDecimal(item.confidence);
    if (
      modelId === undefined ||
      modelDefinitionSha256 === undefined ||
      modelArtifactId === undefined ||
      modelArtifactSha256 === undefined ||
      status === undefined ||
      score === undefined ||
      missingReason === undefined ||
      completeness === undefined ||
      sourceCoverage === undefined ||
      confidence === undefined ||
      !(typeof item.renormalized === "boolean" || item.renormalized === null)
    )
      return null;
    const reported = modelId !== null;
    if (!reported) {
      if (
        modelDefinitionSha256 !== null ||
        modelArtifactId !== null ||
        modelArtifactSha256 !== null ||
        status !== null ||
        score !== null ||
        missingReason === null ||
        completeness !== null ||
        sourceCoverage !== null ||
        confidence !== null ||
        item.renormalized !== null
      )
        return null;
    } else {
      if (
        modelDefinitionSha256 === null ||
        modelArtifactId === null ||
        modelArtifactSha256 === null ||
        status === null ||
        !["complete", "partial", "insufficient_data"].includes(status) ||
        completeness === null ||
        sourceCoverage === null ||
        confidence === null ||
        typeof item.renormalized !== "boolean" ||
        (status === "insufficient_data"
          ? score !== null || missingReason === null
          : score === null || missingReason !== null)
      )
        return null;
    }
    return {
      dimension,
      modelId,
      modelDefinitionSha256,
      modelArtifactId,
      modelArtifactSha256,
      score,
      status,
      missingReason,
      completeness,
      sourceCoverage,
      confidence,
      renormalized: item.renormalized,
      compatible: compatibility.find((entry) => entry.dimension === dimension)?.compatible === true,
    };
  });
  if (dimensions.some((dimension) => dimension === null)) return null;
  return {
    id,
    geography: {
      id: geography.id as string,
      kind: geography.kind as string,
      codeScheme: geography.codeScheme as string,
      code: geography.code as string,
      name: geography.name as string,
    },
    diagnostics,
    dimensions: dimensions as ComparisonVector["dimensions"],
  };
}

function isUtcInstant(value: string): boolean {
  const match = UTC_INSTANT.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return false;
  }
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= (daysInMonth[month - 1] ?? 0);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nullableText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return text(value) ?? undefined;
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

function digest(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

function nullableUuid(value: unknown): string | null | undefined {
  if (value === null) return null;
  return uuid(value) ?? undefined;
}

function nullableDigest(value: unknown): string | null | undefined {
  if (value === null) return null;
  return digest(value) ?? undefined;
}

function decimal(value: unknown): value is string {
  return (
    typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value))
  );
}

function nullableDecimal(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return decimal(value) ? value : undefined;
}

function stringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}
