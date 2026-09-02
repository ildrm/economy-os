import {
  assertGraphNodeIntegrity,
  assertRelationshipIntegrity,
  ECONOMIC_RELATIONSHIP_TYPES,
  type EconomicRelationshipType,
  type GraphNode,
  parseTemporalWindow,
  type RelationshipAssertion,
  type TemporalWindow,
} from "./contracts.js";
import {
  assertExactKeys,
  assertIsoInstant,
  assertNonBlank,
  assertRecord,
  assertSha256,
  assertUuid,
  cloneCanonical,
  compareInstant,
  deepFreeze,
  digestJson,
  expectArray,
  expectInteger,
  expectString,
  isInHalfOpenWindow,
  uniqueSortedStrings,
} from "./internals.js";
import {
  assertClaimDecisionLedgerIntegrity,
  type ClaimDecisionLedger,
  type ClaimStatus,
} from "./workflow.js";

export interface TemporalGraphDataset {
  readonly nodes: readonly GraphNode[];
  readonly relationships: readonly RelationshipAssertion[];
  readonly decisions: readonly ClaimDecisionLedger[];
}

export interface GraphExplorationRequest {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly startNodeIds: readonly string[];
  readonly effectiveAt: string;
  readonly knownAt: string;
  readonly direction: "both" | "incoming" | "outgoing";
  readonly predicates: readonly EconomicRelationshipType[];
  readonly statuses: readonly ClaimStatus[];
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxRelationships: number;
}

export interface ExploredRelationship {
  readonly relationship: RelationshipAssertion;
  readonly status: ClaimStatus;
}

export interface GraphExplorationResult {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly effectiveAt: string;
  readonly knownAt: string;
  readonly nodes: readonly GraphNode[];
  readonly relationships: readonly ExploredRelationship[];
  readonly reachedDepth: number;
  readonly truncated: boolean;
  readonly snapshotSha256: string;
}

function enumValue<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
  field: string,
): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new TypeError(`${field} must be one of: ${values.join(", ")}`);
  }
  return value as Values[number];
}

function parseExplorationRequest(value: unknown): GraphExplorationRequest {
  assertRecord(value, "exploration");
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "organizationId",
      "workspaceId",
      "startNodeIds",
      "effectiveAt",
      "knownAt",
      "direction",
      "predicates",
      "statuses",
      "maxDepth",
      "maxNodes",
      "maxRelationships",
    ],
    "exploration",
  );
  if (value.schemaVersion !== 1) throw new TypeError("exploration.schemaVersion must be 1");
  const organizationId = expectString(value.organizationId, "exploration.organizationId");
  const workspaceId = expectString(value.workspaceId, "exploration.workspaceId");
  assertUuid(organizationId, "exploration.organizationId");
  assertUuid(workspaceId, "exploration.workspaceId");
  const effectiveAt = expectString(value.effectiveAt, "exploration.effectiveAt");
  const knownAt = expectString(value.knownAt, "exploration.knownAt");
  assertIsoInstant(effectiveAt, "exploration.effectiveAt");
  assertIsoInstant(knownAt, "exploration.knownAt");
  const predicates = uniqueSortedStrings(
    expectArray(value.predicates, "exploration.predicates"),
    "exploration.predicates",
    (candidate, field) => {
      if (!(ECONOMIC_RELATIONSHIP_TYPES as readonly string[]).includes(candidate)) {
        throw new TypeError(`${field} is not an economic relationship predicate`);
      }
    },
  ) as readonly EconomicRelationshipType[];
  const statusValues = ["accepted", "deprecated", "disputed", "proposed", "reviewed"] as const;
  const statuses = uniqueSortedStrings(
    expectArray(value.statuses, "exploration.statuses"),
    "exploration.statuses",
    (candidate, field) => {
      if (!(statusValues as readonly string[]).includes(candidate)) {
        throw new TypeError(`${field} is not a claim status`);
      }
    },
    false,
  ) as readonly ClaimStatus[];
  return {
    schemaVersion: 1,
    organizationId,
    workspaceId,
    startNodeIds: uniqueSortedStrings(
      expectArray(value.startNodeIds, "exploration.startNodeIds"),
      "exploration.startNodeIds",
      assertUuid,
      false,
    ),
    effectiveAt,
    knownAt,
    direction: enumValue(
      value.direction,
      ["both", "incoming", "outgoing"] as const,
      "exploration.direction",
    ),
    predicates,
    statuses,
    maxDepth: boundedInteger(value.maxDepth, "exploration.maxDepth", 1, 8),
    maxNodes: boundedInteger(value.maxNodes, "exploration.maxNodes", 1, 500),
    maxRelationships: boundedInteger(
      value.maxRelationships,
      "exploration.maxRelationships",
      1,
      2_000,
    ),
  };
}

function boundedInteger(value: unknown, field: string, minimum: number, maximum: number): number {
  const parsed = expectInteger(value, field, minimum);
  if (parsed > maximum) throw new TypeError(`${field} must be <= ${maximum}`);
  return parsed;
}

function active(window: TemporalWindow, at: string): boolean {
  return isInHalfOpenWindow(at, window.from, window.until);
}

function claimStatusAt(ledger: ClaimDecisionLedger, knownAt: string): ClaimStatus {
  let status: ClaimStatus = "proposed";
  for (const decision of ledger.decisions) {
    if (compareInstant(decision.decidedAt, knownAt) > 0) break;
    status = decision.toStatus;
  }
  return status;
}

function assertNonOverlappingSystemVersions<T extends { readonly systemTime: TemporalWindow }>(
  versions: readonly T[],
  field: string,
): void {
  const sorted = [...versions].sort((left, right) =>
    left.systemTime.from.localeCompare(right.systemTime.from),
  );
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      (previous.systemTime.until === null ||
        compareInstant(previous.systemTime.until, current.systemTime.from) > 0)
    ) {
      throw new TypeError(`${field} contains overlapping system-time versions`);
    }
  }
}

function validateDataset(
  dataset: unknown,
  organizationId: string,
  workspaceId: string,
): asserts dataset is TemporalGraphDataset {
  assertRecord(dataset, "temporalGraphDataset");
  assertExactKeys(dataset, ["nodes", "relationships", "decisions"], "temporalGraphDataset");
  const nodes = expectArray(dataset.nodes, "temporalGraphDataset.nodes");
  const relationships = expectArray(dataset.relationships, "temporalGraphDataset.relationships");
  const decisions = expectArray(dataset.decisions, "temporalGraphDataset.decisions");
  const nodeVersions = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    assertGraphNodeIntegrity(node);
    if (node.organizationId !== organizationId || node.workspaceId !== workspaceId) {
      throw new TypeError("temporal graph dataset contains a cross-tenant node");
    }
    const versions = nodeVersions.get(node.nodeId) ?? [];
    versions.push(node);
    nodeVersions.set(node.nodeId, versions);
  }
  for (const [nodeId, versions] of nodeVersions) {
    assertNonOverlappingSystemVersions(versions, `node ${nodeId}`);
  }

  const relationshipVersions = new Map<string, RelationshipAssertion[]>();
  for (const relationship of relationships) {
    assertRelationshipIntegrity(relationship);
    if (
      relationship.organizationId !== organizationId ||
      relationship.workspaceId !== workspaceId
    ) {
      throw new TypeError("temporal graph dataset contains a cross-tenant relationship");
    }
    if (!nodeVersions.has(relationship.subjectId) || !nodeVersions.has(relationship.objectId)) {
      throw new TypeError("temporal graph relationship references an unknown endpoint");
    }
    const versions = relationshipVersions.get(relationship.assertionId) ?? [];
    versions.push(relationship);
    relationshipVersions.set(relationship.assertionId, versions);
  }
  for (const [assertionId, versions] of relationshipVersions) {
    assertNonOverlappingSystemVersions(versions, `relationship ${assertionId}`);
  }

  const ledgerKeys = new Set<string>();
  for (const ledger of decisions) {
    assertClaimDecisionLedgerIntegrity(ledger);
    if (ledger.organizationId !== organizationId || ledger.workspaceId !== workspaceId) {
      throw new TypeError("temporal graph dataset contains a cross-tenant decision ledger");
    }
    const key = `${ledger.assertionId}:${ledger.assertionSha256}`;
    if (ledgerKeys.has(key))
      throw new TypeError("temporal graph dataset has a duplicate decision ledger");
    ledgerKeys.add(key);
  }
  for (const relationship of relationships) {
    assertRelationshipIntegrity(relationship);
    if (!ledgerKeys.has(`${relationship.assertionId}:${relationship.manifestSha256}`)) {
      throw new TypeError("every relationship version requires its matching decision ledger");
    }
  }
}

export function exploreTemporalGraph(
  dataset: TemporalGraphDataset,
  rawRequest: unknown,
): Readonly<GraphExplorationResult> {
  const request = parseExplorationRequest(rawRequest);
  validateDataset(dataset, request.organizationId, request.workspaceId);
  const activeNodes = new Map<string, GraphNode>();
  for (const node of dataset.nodes) {
    if (
      active(node.validTime, request.effectiveAt) &&
      active(node.systemTime, request.knownAt) &&
      compareInstant(node.discoveredAt, request.knownAt) <= 0 &&
      node.resolutionStatus !== "deprecated"
    ) {
      if (activeNodes.has(node.nodeId))
        throw new TypeError("multiple node versions are active at PIT");
      activeNodes.set(node.nodeId, node);
    }
  }
  for (const startNodeId of request.startNodeIds) {
    if (!activeNodes.has(startNodeId)) {
      throw new TypeError(`start node ${startNodeId} is unavailable at the requested PIT context`);
    }
  }

  const ledgers = new Map(
    dataset.decisions.map((ledger) => [`${ledger.assertionId}:${ledger.assertionSha256}`, ledger]),
  );
  const relationships = dataset.relationships
    .filter((relationship) => {
      const ledger = ledgers.get(`${relationship.assertionId}:${relationship.manifestSha256}`);
      const status = ledger === undefined ? undefined : claimStatusAt(ledger, request.knownAt);
      return (
        status !== undefined &&
        request.statuses.includes(status) &&
        (request.predicates.length === 0 || request.predicates.includes(relationship.predicate)) &&
        active(relationship.validTime, request.effectiveAt) &&
        active(relationship.systemTime, request.knownAt) &&
        compareInstant(relationship.discoveredAt, request.knownAt) <= 0 &&
        activeNodes.has(relationship.subjectId) &&
        activeNodes.has(relationship.objectId)
      );
    })
    .sort((left, right) => left.assertionId.localeCompare(right.assertionId));

  const adjacent = new Map<string, RelationshipAssertion[]>();
  for (const relationship of relationships) {
    if (request.direction !== "incoming") {
      const outgoing = adjacent.get(relationship.subjectId) ?? [];
      outgoing.push(relationship);
      adjacent.set(relationship.subjectId, outgoing);
    }
    if (request.direction !== "outgoing") {
      const incoming = adjacent.get(relationship.objectId) ?? [];
      incoming.push(relationship);
      adjacent.set(relationship.objectId, incoming);
    }
  }

  const visited = new Set(request.startNodeIds);
  const selectedRelationships = new Map<string, RelationshipAssertion>();
  let frontier = [...request.startNodeIds];
  let reachedDepth = 0;
  let truncated = false;
  for (let depth = 1; depth <= request.maxDepth && frontier.length > 0; depth += 1) {
    const next = new Set<string>();
    for (const nodeId of frontier.sort()) {
      for (const relationship of adjacent.get(nodeId) ?? []) {
        if (selectedRelationships.has(relationship.assertionId)) continue;
        if (selectedRelationships.size >= request.maxRelationships) {
          truncated = true;
          break;
        }
        const otherId =
          relationship.subjectId === nodeId ? relationship.objectId : relationship.subjectId;
        if (!visited.has(otherId) && visited.size >= request.maxNodes) {
          truncated = true;
          continue;
        }
        selectedRelationships.set(relationship.assertionId, relationship);
        if (!visited.has(otherId)) {
          visited.add(otherId);
          next.add(otherId);
        }
      }
    }
    reachedDepth = depth;
    frontier = [...next];
  }
  if (frontier.length > 0) truncated = true;

  const nodes = [...visited]
    .map((nodeId) => activeNodes.get(nodeId))
    .filter((node): node is GraphNode => node !== undefined)
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  const exploredRelationships = [...selectedRelationships.values()]
    .sort((left, right) => left.assertionId.localeCompare(right.assertionId))
    .map((relationship) => ({
      relationship,
      status: claimStatusAt(
        ledgers.get(
          `${relationship.assertionId}:${relationship.manifestSha256}`,
        ) as ClaimDecisionLedger,
        request.knownAt,
      ),
    }));
  const body = cloneCanonical({
    schemaVersion: 1 as const,
    organizationId: request.organizationId,
    workspaceId: request.workspaceId,
    effectiveAt: request.effectiveAt,
    knownAt: request.knownAt,
    nodes,
    relationships: exploredRelationships,
    reachedDepth,
    truncated,
  });
  return deepFreeze({ ...body, snapshotSha256: digestJson(body) });
}

export const PROVENANCE_NODE_TYPES = [
  "dataset",
  "feature",
  "forecast",
  "model",
  "observation",
  "report",
  "scenario",
  "source",
  "transformation",
] as const;
export type ProvenanceNodeType = (typeof PROVENANCE_NODE_TYPES)[number];

export const PROVENANCE_RELATIONSHIP_TYPES = [
  "contains",
  "derived_from",
  "produced",
  "published_by",
  "reported_in",
  "retrieved_from",
  "revises",
  "scored_by",
  "supersedes",
  "transformed_into",
  "used_by",
] as const;
export type ProvenanceRelationshipType = (typeof PROVENANCE_RELATIONSHIP_TYPES)[number];

export interface ProvenanceNodeInput {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly lineageNodeId: string;
  readonly artifactType: ProvenanceNodeType;
  readonly artifactId: string;
  readonly artifactSha256: string;
  readonly label: string;
  readonly availableAt: string;
  readonly systemTime: TemporalWindow;
}

export interface ProvenanceNode extends ProvenanceNodeInput {
  readonly manifestSha256: string;
}

export interface LineageEdgeInput {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly lineageEdgeId: string;
  readonly fromLineageNodeId: string;
  readonly predicate: ProvenanceRelationshipType;
  readonly toLineageNodeId: string;
  readonly systemTime: TemporalWindow;
  readonly evidenceSha256: string;
}

export interface LineageEdge extends LineageEdgeInput {
  readonly manifestSha256: string;
}

const PROVENANCE_NODE_KEYS = [
  "schemaVersion",
  "organizationId",
  "workspaceId",
  "lineageNodeId",
  "artifactType",
  "artifactId",
  "artifactSha256",
  "label",
  "availableAt",
  "systemTime",
] as const;

function parseProvenanceNodeInput(value: unknown): ProvenanceNodeInput {
  assertRecord(value, "provenanceNode");
  assertExactKeys(value, PROVENANCE_NODE_KEYS, "provenanceNode");
  if (value.schemaVersion !== 1) throw new TypeError("provenanceNode.schemaVersion must be 1");
  const organizationId = expectString(value.organizationId, "provenanceNode.organizationId");
  const workspaceId = expectString(value.workspaceId, "provenanceNode.workspaceId");
  const lineageNodeId = expectString(value.lineageNodeId, "provenanceNode.lineageNodeId");
  const artifactId = expectString(value.artifactId, "provenanceNode.artifactId");
  const artifactSha256 = expectString(value.artifactSha256, "provenanceNode.artifactSha256");
  const label = expectString(value.label, "provenanceNode.label");
  const availableAt = expectString(value.availableAt, "provenanceNode.availableAt");
  for (const [field, id] of [
    ["organizationId", organizationId],
    ["workspaceId", workspaceId],
    ["lineageNodeId", lineageNodeId],
    ["artifactId", artifactId],
  ] as const) {
    assertUuid(id, `provenanceNode.${field}`);
  }
  assertSha256(artifactSha256, "provenanceNode.artifactSha256");
  assertNonBlank(label, "provenanceNode.label", 300);
  assertIsoInstant(availableAt, "provenanceNode.availableAt");
  const systemTime = parseTemporalWindow(value.systemTime, "provenanceNode.systemTime");
  if (compareInstant(availableAt, systemTime.from) > 0) {
    throw new TypeError("provenanceNode.availableAt cannot be after systemTime.from");
  }
  return {
    schemaVersion: 1,
    organizationId,
    workspaceId,
    lineageNodeId,
    artifactType: enumValue(
      value.artifactType,
      PROVENANCE_NODE_TYPES,
      "provenanceNode.artifactType",
    ),
    artifactId,
    artifactSha256,
    label,
    availableAt,
    systemTime,
  };
}

export function createProvenanceNode(value: unknown): Readonly<ProvenanceNode> {
  const body = cloneCanonical(parseProvenanceNodeInput(value));
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function assertProvenanceNodeIntegrity(value: unknown): asserts value is ProvenanceNode {
  assertRecord(value, "provenanceNode");
  assertExactKeys(value, [...PROVENANCE_NODE_KEYS, "manifestSha256"], "provenanceNode");
  const digest = expectString(value.manifestSha256, "provenanceNode.manifestSha256");
  assertSha256(digest, "provenanceNode.manifestSha256");
  const body = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "manifestSha256"),
  );
  const parsed = parseProvenanceNodeInput(body);
  if (digestJson(parsed) !== digest)
    throw new TypeError("provenance node manifest digest does not match");
}

const LINEAGE_EDGE_KEYS = [
  "schemaVersion",
  "organizationId",
  "workspaceId",
  "lineageEdgeId",
  "fromLineageNodeId",
  "predicate",
  "toLineageNodeId",
  "systemTime",
  "evidenceSha256",
] as const;

function parseLineageEdgeInput(value: unknown): LineageEdgeInput {
  assertRecord(value, "lineageEdge");
  assertExactKeys(value, LINEAGE_EDGE_KEYS, "lineageEdge");
  if (value.schemaVersion !== 1) throw new TypeError("lineageEdge.schemaVersion must be 1");
  const organizationId = expectString(value.organizationId, "lineageEdge.organizationId");
  const workspaceId = expectString(value.workspaceId, "lineageEdge.workspaceId");
  const lineageEdgeId = expectString(value.lineageEdgeId, "lineageEdge.lineageEdgeId");
  const fromLineageNodeId = expectString(value.fromLineageNodeId, "lineageEdge.fromLineageNodeId");
  const toLineageNodeId = expectString(value.toLineageNodeId, "lineageEdge.toLineageNodeId");
  for (const [field, id] of [
    ["organizationId", organizationId],
    ["workspaceId", workspaceId],
    ["lineageEdgeId", lineageEdgeId],
    ["fromLineageNodeId", fromLineageNodeId],
    ["toLineageNodeId", toLineageNodeId],
  ] as const) {
    assertUuid(id, `lineageEdge.${field}`);
  }
  if (fromLineageNodeId === toLineageNodeId)
    throw new TypeError("lineage edge cannot be a self-loop");
  const evidenceSha256 = expectString(value.evidenceSha256, "lineageEdge.evidenceSha256");
  assertSha256(evidenceSha256, "lineageEdge.evidenceSha256");
  return {
    schemaVersion: 1,
    organizationId,
    workspaceId,
    lineageEdgeId,
    fromLineageNodeId,
    predicate: enumValue(value.predicate, PROVENANCE_RELATIONSHIP_TYPES, "lineageEdge.predicate"),
    toLineageNodeId,
    systemTime: parseTemporalWindow(value.systemTime, "lineageEdge.systemTime"),
    evidenceSha256,
  };
}

export function createLineageEdge(value: unknown): Readonly<LineageEdge> {
  const body = cloneCanonical(parseLineageEdgeInput(value));
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function assertLineageEdgeIntegrity(value: unknown): asserts value is LineageEdge {
  assertRecord(value, "lineageEdge");
  assertExactKeys(value, [...LINEAGE_EDGE_KEYS, "manifestSha256"], "lineageEdge");
  const digest = expectString(value.manifestSha256, "lineageEdge.manifestSha256");
  assertSha256(digest, "lineageEdge.manifestSha256");
  const body = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "manifestSha256"),
  );
  const parsed = parseLineageEdgeInput(body);
  if (digestJson(parsed) !== digest)
    throw new TypeError("lineage edge manifest digest does not match");
}

export interface LineageValidationRequest {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly knownAt: string;
}

export interface LineageValidationResult {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly knownAt: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly topologicalOrder: readonly string[];
  readonly snapshotSha256: string;
}

export function validateAcyclicLineage(
  nodes: readonly ProvenanceNode[],
  edges: readonly LineageEdge[],
  rawRequest: unknown,
): Readonly<LineageValidationResult> {
  assertRecord(rawRequest, "lineageValidation");
  assertExactKeys(
    rawRequest,
    ["schemaVersion", "organizationId", "workspaceId", "knownAt"],
    "lineageValidation",
  );
  if (rawRequest.schemaVersion !== 1)
    throw new TypeError("lineageValidation.schemaVersion must be 1");
  const organizationId = expectString(
    rawRequest.organizationId,
    "lineageValidation.organizationId",
  );
  const workspaceId = expectString(rawRequest.workspaceId, "lineageValidation.workspaceId");
  const knownAt = expectString(rawRequest.knownAt, "lineageValidation.knownAt");
  assertUuid(organizationId, "lineageValidation.organizationId");
  assertUuid(workspaceId, "lineageValidation.workspaceId");
  assertIsoInstant(knownAt, "lineageValidation.knownAt");
  if (nodes.length > 10_000 || edges.length > 25_000) {
    throw new TypeError("lineage validation input exceeds its bounded contract");
  }
  const activeNodes = new Map<string, ProvenanceNode>();
  for (const node of nodes) {
    assertProvenanceNodeIntegrity(node);
    if (node.organizationId !== organizationId || node.workspaceId !== workspaceId) {
      throw new TypeError("lineage contains a cross-tenant node");
    }
    if (active(node.systemTime, knownAt) && compareInstant(node.availableAt, knownAt) <= 0) {
      if (activeNodes.has(node.lineageNodeId)) throw new TypeError("duplicate active lineage node");
      activeNodes.set(node.lineageNodeId, node);
    }
  }
  const activeEdges: LineageEdge[] = [];
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    assertLineageEdgeIntegrity(edge);
    if (edge.organizationId !== organizationId || edge.workspaceId !== workspaceId) {
      throw new TypeError("lineage contains a cross-tenant edge");
    }
    if (!active(edge.systemTime, knownAt)) continue;
    if (!activeNodes.has(edge.fromLineageNodeId) || !activeNodes.has(edge.toLineageNodeId)) {
      throw new TypeError("active lineage edge references an unavailable node");
    }
    if (edgeIds.has(edge.lineageEdgeId))
      throw new TypeError("lineage contains a duplicate edge ID");
    edgeIds.add(edge.lineageEdgeId);
    activeEdges.push(edge);
  }
  const indegree = new Map([...activeNodes.keys()].map((nodeId) => [nodeId, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of activeEdges) {
    indegree.set(edge.toLineageNodeId, (indegree.get(edge.toLineageNodeId) ?? 0) + 1);
    const targets = outgoing.get(edge.fromLineageNodeId) ?? [];
    targets.push(edge.toLineageNodeId);
    outgoing.set(edge.fromLineageNodeId, targets);
  }
  const ready = [...indegree]
    .filter(([, degree]) => degree === 0)
    .map(([nodeId]) => nodeId)
    .sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const nodeId = ready.shift();
    if (nodeId === undefined) break;
    order.push(nodeId);
    for (const target of (outgoing.get(nodeId) ?? []).sort()) {
      const nextDegree = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, nextDegree);
      if (nextDegree === 0) {
        ready.push(target);
        ready.sort();
      }
    }
  }
  if (order.length !== activeNodes.size) {
    throw new TypeError("provenance lineage must be acyclic");
  }
  const body = cloneCanonical({
    organizationId,
    workspaceId,
    knownAt,
    nodeCount: activeNodes.size,
    edgeCount: activeEdges.length,
    topologicalOrder: order,
  });
  return deepFreeze({ ...body, snapshotSha256: digestJson(body) });
}
