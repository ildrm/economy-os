import {
  assertDigestIntegrity,
  assertInteger,
  assertIsoInstant,
  assertKey,
  assertNonBlank,
  assertSha256,
  assertUuid,
  compareInstants,
  fixedDecimal,
  immutableWithDigest,
  parseDecimal,
  uniqueBy,
} from "./internals.js";

export const ENTITY_KINDS = [
  "country",
  "sector",
  "institution",
  "market",
  "critical_infrastructure",
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const EXPOSURE_KINDS = [
  "bank_claim",
  "sovereign_debt",
  "trade",
  "portfolio",
  "direct_investment",
  "funding",
  "payment",
  "supply_chain",
  "energy",
  "technology",
] as const;
export type ExposureKind = (typeof EXPOSURE_KINDS)[number];

export const MEASUREMENT_CLASSES = ["observed", "reported_estimate", "modeled_estimate"] as const;
export type MeasurementClass = (typeof MEASUREMENT_CLASSES)[number];

export const COVERAGE_STATUSES = ["complete", "partial", "unknown", "not_applicable"] as const;
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

export interface NetworkSource {
  readonly sourceId: string;
  readonly datasetSnapshotId: string;
  readonly datasetSnapshotSha256: string;
  readonly availableAt: string;
  readonly licenseKey: string;
  readonly citation: string;
}

export interface NetworkNode {
  readonly nodeId: string;
  readonly entityKey: string;
  readonly kind: EntityKind;
  readonly label: string;
  readonly jurisdictionKey: string | null;
  readonly sectorKey: string | null;
}

export interface ExposureEdge {
  readonly edgeId: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly kind: ExposureKind;
  readonly measurementClass: MeasurementClass;
  readonly grossAmount: string;
  readonly currencyKey: string;
  readonly normalizedExposure: string;
  readonly confidence: string;
  readonly sourceId: string;
  readonly observedAt: string;
  readonly availableAt: string;
  readonly caveat: string | null;
}

export interface ExposureCoverage {
  readonly coverageId: string;
  readonly exposureKind: ExposureKind;
  readonly jurisdictionKey: string | null;
  readonly status: CoverageStatus;
  readonly amountCoverageRatio: string | null;
  readonly observedCounterparties: number;
  readonly expectedCounterparties: number | null;
  readonly disclosureLagDays: number;
  readonly missingExposureTreatment: "none" | "zero_is_unknown" | "bounded_sensitivity";
  readonly caveat: string;
}

export interface ExposureNetworkSnapshotInput {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly tenantId: string;
  readonly modelVersion: string;
  readonly asOf: string;
  readonly createdAt: string;
  readonly sources: readonly NetworkSource[];
  readonly nodes: readonly NetworkNode[];
  readonly edges: readonly ExposureEdge[];
  readonly coverage: readonly ExposureCoverage[];
  readonly assumptions: readonly string[];
  readonly prohibitedClaims: readonly string[];
}

export type ExposureNetworkSnapshot = Readonly<
  ExposureNetworkSnapshotInput & { readonly manifestSha256: string }
>;

function inSet<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string,
): asserts value is T {
  if (!allowed.includes(value as T)) throw new TypeError(`${field} is unsupported`);
}

function validateSource(source: NetworkSource, index: number, asOf: string): void {
  const field = `sources[${index}]`;
  assertUuid(source.sourceId, `${field}.sourceId`);
  assertUuid(source.datasetSnapshotId, `${field}.datasetSnapshotId`);
  assertSha256(source.datasetSnapshotSha256, `${field}.datasetSnapshotSha256`);
  assertIsoInstant(source.availableAt, `${field}.availableAt`);
  if (compareInstants(source.availableAt, asOf) > 0) {
    throw new TypeError(`${field} was unavailable at the snapshot as-of`);
  }
  assertKey(source.licenseKey, `${field}.licenseKey`);
  assertNonBlank(source.citation, `${field}.citation`, 1_000);
}

function validateNode(node: NetworkNode, index: number): void {
  const field = `nodes[${index}]`;
  assertUuid(node.nodeId, `${field}.nodeId`);
  assertKey(node.entityKey, `${field}.entityKey`);
  inSet(node.kind, ENTITY_KINDS, `${field}.kind`);
  assertNonBlank(node.label, `${field}.label`, 256);
  if (node.jurisdictionKey !== null) assertKey(node.jurisdictionKey, `${field}.jurisdictionKey`);
  if (node.sectorKey !== null) assertKey(node.sectorKey, `${field}.sectorKey`);
}

function validateEdge(
  edge: ExposureEdge,
  index: number,
  nodeIds: ReadonlySet<string>,
  sourceAvailability: ReadonlyMap<string, string>,
  asOf: string,
): void {
  const field = `edges[${index}]`;
  assertUuid(edge.edgeId, `${field}.edgeId`);
  assertUuid(edge.sourceNodeId, `${field}.sourceNodeId`);
  assertUuid(edge.targetNodeId, `${field}.targetNodeId`);
  if (edge.sourceNodeId === edge.targetNodeId)
    throw new TypeError(`${field} cannot be a self-loop`);
  if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
    throw new TypeError(`${field} references an unknown node`);
  }
  inSet(edge.kind, EXPOSURE_KINDS, `${field}.kind`);
  inSet(edge.measurementClass, MEASUREMENT_CLASSES, `${field}.measurementClass`);
  parseDecimal(edge.grossAmount, `${field}.grossAmount`, 0, 1_000_000_000_000_000);
  assertKey(edge.currencyKey, `${field}.currencyKey`);
  parseDecimal(edge.normalizedExposure, `${field}.normalizedExposure`, 0, 1);
  parseDecimal(edge.confidence, `${field}.confidence`, 0, 1);
  assertUuid(edge.sourceId, `${field}.sourceId`);
  const sourceAvailableAt = sourceAvailability.get(edge.sourceId);
  if (sourceAvailableAt === undefined) throw new TypeError(`${field} references an unknown source`);
  assertIsoInstant(edge.observedAt, `${field}.observedAt`);
  assertIsoInstant(edge.availableAt, `${field}.availableAt`);
  if (compareInstants(edge.observedAt, edge.availableAt) > 0) {
    throw new TypeError(`${field} availability precedes observation`);
  }
  if (compareInstants(edge.availableAt, asOf) > 0) {
    throw new TypeError(`${field} was unavailable at the snapshot as-of`);
  }
  if (compareInstants(edge.availableAt, sourceAvailableAt) < 0) {
    throw new TypeError(`${field} cannot predate its source snapshot availability`);
  }
  if (edge.measurementClass !== "observed" && edge.caveat === null) {
    throw new TypeError(`${field} estimates require a caveat`);
  }
  if (edge.caveat !== null) assertNonBlank(edge.caveat, `${field}.caveat`, 1_000);
}

function validateCoverage(value: ExposureCoverage, index: number): void {
  const field = `coverage[${index}]`;
  assertUuid(value.coverageId, `${field}.coverageId`);
  inSet(value.exposureKind, EXPOSURE_KINDS, `${field}.exposureKind`);
  if (value.jurisdictionKey !== null) assertKey(value.jurisdictionKey, `${field}.jurisdictionKey`);
  inSet(value.status, COVERAGE_STATUSES, `${field}.status`);
  if (value.amountCoverageRatio !== null) {
    parseDecimal(value.amountCoverageRatio, `${field}.amountCoverageRatio`, 0, 1);
  }
  assertInteger(value.observedCounterparties, `${field}.observedCounterparties`, 0, 1_000_000);
  if (value.expectedCounterparties !== null) {
    assertInteger(value.expectedCounterparties, `${field}.expectedCounterparties`, 0, 1_000_000);
    if (value.observedCounterparties > value.expectedCounterparties) {
      throw new TypeError(`${field} observed counterparties exceed the expected denominator`);
    }
  }
  assertInteger(value.disclosureLagDays, `${field}.disclosureLagDays`, 0, 36_500);
  inSet(
    value.missingExposureTreatment,
    ["none", "zero_is_unknown", "bounded_sensitivity"] as const,
    `${field}.missingExposureTreatment`,
  );
  assertNonBlank(value.caveat, `${field}.caveat`, 1_000);
  if (value.status === "complete") {
    if (
      value.amountCoverageRatio !== "1" ||
      value.expectedCounterparties === null ||
      value.observedCounterparties !== value.expectedCounterparties ||
      value.missingExposureTreatment !== "none"
    ) {
      throw new TypeError(`${field} complete coverage requires explicit complete denominators`);
    }
  } else if (value.missingExposureTreatment === "none") {
    throw new TypeError(`${field} incomplete coverage cannot treat missing exposure as none`);
  }
  if (value.status === "unknown" && value.amountCoverageRatio !== null) {
    throw new TypeError(`${field} unknown coverage cannot claim an amount ratio`);
  }
}

export function createExposureNetworkSnapshot(
  input: ExposureNetworkSnapshotInput,
): ExposureNetworkSnapshot {
  if (input.schemaVersion !== 1) throw new TypeError("schemaVersion must equal 1");
  assertUuid(input.snapshotId, "snapshotId");
  assertUuid(input.tenantId, "tenantId");
  assertNonBlank(input.modelVersion, "modelVersion", 128);
  assertIsoInstant(input.asOf, "asOf");
  assertIsoInstant(input.createdAt, "createdAt");
  if (compareInstants(input.asOf, input.createdAt) > 0) {
    throw new TypeError("createdAt cannot precede asOf");
  }
  assertInteger(input.sources.length, "sources.length", 1, 100);
  assertInteger(input.nodes.length, "nodes.length", 2, 10_000);
  assertInteger(input.edges.length, "edges.length", 1, 100_000);
  assertInteger(input.coverage.length, "coverage.length", 1, 10_000);
  assertInteger(input.assumptions.length, "assumptions.length", 1, 100);
  assertInteger(input.prohibitedClaims.length, "prohibitedClaims.length", 1, 100);
  uniqueBy(input.sources, (value) => value.sourceId, "sources");
  uniqueBy(input.sources, (value) => value.datasetSnapshotId, "sources");
  input.sources.forEach((value, index) => {
    validateSource(value, index, input.asOf);
  });
  uniqueBy(input.nodes, (value) => value.nodeId, "nodes");
  uniqueBy(input.nodes, (value) => value.entityKey, "nodes");
  input.nodes.forEach(validateNode);
  const nodeIds = new Set(input.nodes.map((value) => value.nodeId));
  const sourceAvailability = new Map(
    input.sources.map((value) => [value.sourceId, value.availableAt] as const),
  );
  uniqueBy(input.edges, (value) => value.edgeId, "edges");
  uniqueBy(
    input.edges,
    (value) => `${value.sourceNodeId}:${value.targetNodeId}:${value.kind}:${value.sourceId}`,
    "edges",
  );
  input.edges.forEach((value, index) => {
    validateEdge(value, index, nodeIds, sourceAvailability, input.asOf);
  });
  uniqueBy(input.coverage, (value) => value.coverageId, "coverage");
  uniqueBy(
    input.coverage,
    (value) => `${value.exposureKind}:${value.jurisdictionKey ?? "global"}`,
    "coverage",
  );
  input.coverage.forEach(validateCoverage);
  const coveredKinds = new Set(input.coverage.map((value) => value.exposureKind));
  for (const kind of new Set(input.edges.map((value) => value.kind))) {
    if (!coveredKinds.has(kind)) {
      throw new TypeError(`coverage omits represented exposure kind ${kind}`);
    }
  }
  for (const [index, value] of input.assumptions.entries()) {
    assertNonBlank(value, `assumptions[${index}]`, 1_000);
  }
  uniqueBy(input.assumptions, (value) => value, "assumptions");
  for (const [index, value] of input.prohibitedClaims.entries()) {
    assertNonBlank(value, `prohibitedClaims[${index}]`, 1_000);
  }
  uniqueBy(input.prohibitedClaims, (value) => value, "prohibitedClaims");
  return immutableWithDigest({
    ...input,
    sources: [...input.sources].sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    nodes: [...input.nodes].sort((left, right) => left.nodeId.localeCompare(right.nodeId)),
    edges: [...input.edges].sort((left, right) => left.edgeId.localeCompare(right.edgeId)),
    coverage: [...input.coverage].sort((left, right) =>
      left.coverageId.localeCompare(right.coverageId),
    ),
    assumptions: [...input.assumptions].sort(),
    prohibitedClaims: [...input.prohibitedClaims].sort(),
  });
}

export function assertExposureNetworkSnapshotIntegrity(snapshot: ExposureNetworkSnapshot): void {
  assertDigestIntegrity(snapshot, "networkSnapshot");
  const { manifestSha256: _manifestSha256, ...body } = snapshot;
  const rebuilt = createExposureNetworkSnapshot(body);
  if (rebuilt.manifestSha256 !== snapshot.manifestSha256) {
    throw new TypeError("networkSnapshot content is invalid");
  }
}

export interface CoverageDisclosure {
  readonly status: "adequate" | "limited" | "unknown";
  readonly minimumAmountCoverageRatio: string | null;
  readonly incompleteExposureKinds: readonly ExposureKind[];
  readonly caveats: readonly string[];
}

export function summarizeCoverage(snapshot: ExposureNetworkSnapshot): CoverageDisclosure {
  assertExposureNetworkSnapshotIntegrity(snapshot);
  const knownRatios = snapshot.coverage
    .map((value) => value.amountCoverageRatio)
    .filter((value): value is string => value !== null);
  const minimumAmountCoverageRatio = knownRatios.reduce<string | null>(
    (minimum, value) =>
      minimum === null || fixedDecimal(value) < fixedDecimal(minimum) ? value : minimum,
    null,
  );
  const incomplete = [
    ...new Set(
      snapshot.coverage
        .filter((value) => value.status !== "complete")
        .map((value) => value.exposureKind),
    ),
  ].sort();
  const hasUnknown = snapshot.coverage.some((value) => value.status === "unknown");
  return {
    status: hasUnknown ? "unknown" : incomplete.length > 0 ? "limited" : "adequate",
    minimumAmountCoverageRatio,
    incompleteExposureKinds: incomplete,
    caveats: [...new Set(snapshot.coverage.map((value) => value.caveat))].sort(),
  };
}
