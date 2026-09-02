import {
  assertGraphNodeIntegrity,
  assertRelationshipIntegrity,
  type GraphNode,
  type RelationshipAssertion,
} from "./contracts.js";
import {
  assertLineageEdgeIntegrity,
  assertProvenanceNodeIntegrity,
  type LineageEdge,
  type ProvenanceNode,
  validateAcyclicLineage,
} from "./graph.js";
import {
  assertExactKeys,
  assertIsoInstant,
  assertRecord,
  assertSha256,
  assertUuid,
  type CanonicalJsonValue,
  cloneCanonical,
  deepFreeze,
  digestJson,
  expectArray,
  expectInteger,
  expectString,
} from "./internals.js";
import type { ClaimStatus } from "./workflow.js";

export interface ProjectionRelationship {
  readonly relationship: RelationshipAssertion;
  readonly status: ClaimStatus;
}

export interface PostgresGraphProjectionInput {
  readonly schemaVersion: 1;
  readonly sourceOfTruth: "postgresql";
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly effectiveAt: string;
  readonly knownAt: string;
  readonly sourceSnapshotSha256: string;
  readonly nodes: readonly GraphNode[];
  readonly relationships: readonly ProjectionRelationship[];
  readonly provenanceNodes: readonly ProvenanceNode[];
  readonly lineageEdges: readonly LineageEdge[];
}

export interface PostgresGraphProjection extends PostgresGraphProjectionInput {
  readonly manifestSha256: string;
}

export interface Neo4jProjectionCommand {
  readonly commandName:
    | "project_economic_nodes"
    | "project_economic_relationships"
    | "project_lineage_edges"
    | "project_provenance_nodes";
  readonly cypher: string;
  readonly parameters: Readonly<Record<string, CanonicalJsonValue>>;
}

export interface Neo4jProjectionReceipt {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectionSha256: string;
  readonly appliedCommandCount: number;
}

export interface Neo4jProjectionContext {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectionSha256: string;
}

export interface Neo4jProjectionPort {
  writeProjection(
    commands: readonly Neo4jProjectionCommand[],
    context: Neo4jProjectionContext,
  ): Promise<Neo4jProjectionReceipt>;
}

export interface Neo4jTransactionPort {
  run(cypher: string, parameters: Readonly<Record<string, CanonicalJsonValue>>): Promise<unknown>;
}

export interface Neo4jSessionPort {
  executeWrite<Result>(
    operation: (transaction: Neo4jTransactionPort) => Promise<Result>,
  ): Promise<Result>;
  close(): Promise<void>;
}

export interface Neo4jDriverPort {
  session(
    configuration: Readonly<{ database: string; defaultAccessMode: "WRITE" }>,
  ): Neo4jSessionPort;
}

export interface Neo4jProjectionAdapterConfiguration {
  readonly database: string;
}

const ECONOMIC_NODE_CYPHER = `
UNWIND $rows AS row
MERGE (node:EconomyGraphNode {
  organizationId: row.organizationId,
  workspaceId: row.workspaceId,
  projectionSha256: row.projectionSha256,
  nodeId: row.nodeId
})
SET node += row.properties
`.trim();

const ECONOMIC_RELATIONSHIP_CYPHER = `
UNWIND $rows AS row
MATCH (subject:EconomyGraphNode {
  organizationId: row.organizationId,
  workspaceId: row.workspaceId,
  projectionSha256: row.projectionSha256,
  nodeId: row.subjectId
})
MATCH (object:EconomyGraphNode {
  organizationId: row.organizationId,
  workspaceId: row.workspaceId,
  projectionSha256: row.projectionSha256,
  nodeId: row.objectId
})
MERGE (subject)-[edge:ECONOMIC_RELATIONSHIP {
  assertionId: row.assertionId,
  assertionSha256: row.assertionSha256,
  projectionSha256: row.projectionSha256
}]->(object)
SET edge += row.properties
`.trim();

const PROVENANCE_NODE_CYPHER = `
UNWIND $rows AS row
MERGE (node:ProvenanceNode {
  organizationId: row.organizationId,
  workspaceId: row.workspaceId,
  projectionSha256: row.projectionSha256,
  lineageNodeId: row.lineageNodeId
})
SET node += row.properties
`.trim();

const LINEAGE_EDGE_CYPHER = `
UNWIND $rows AS row
MATCH (source:ProvenanceNode {
  organizationId: row.organizationId,
  workspaceId: row.workspaceId,
  projectionSha256: row.projectionSha256,
  lineageNodeId: row.fromLineageNodeId
})
MATCH (target:ProvenanceNode {
  organizationId: row.organizationId,
  workspaceId: row.workspaceId,
  projectionSha256: row.projectionSha256,
  lineageNodeId: row.toLineageNodeId
})
MERGE (source)-[edge:LINEAGE {
  lineageEdgeId: row.lineageEdgeId,
  edgeSha256: row.edgeSha256,
  projectionSha256: row.projectionSha256
}]->(target)
SET edge += row.properties
`.trim();

const NEO4J_DATABASE = /^[a-z][a-z0-9_.-]{0,62}$/;
const COMMAND_ORDER = [
  "project_economic_nodes",
  "project_economic_relationships",
  "project_provenance_nodes",
  "project_lineage_edges",
] as const;
const COMMAND_CYPHER: Readonly<Record<Neo4jProjectionCommand["commandName"], string>> =
  Object.freeze({
    project_economic_nodes: ECONOMIC_NODE_CYPHER,
    project_economic_relationships: ECONOMIC_RELATIONSHIP_CYPHER,
    project_provenance_nodes: PROVENANCE_NODE_CYPHER,
    project_lineage_edges: LINEAGE_EDGE_CYPHER,
  });
const COMMAND_ROW_LIMIT: Readonly<Record<Neo4jProjectionCommand["commandName"], number>> =
  Object.freeze({
    project_economic_nodes: 5_000,
    project_economic_relationships: 10_000,
    project_provenance_nodes: 10_000,
    project_lineage_edges: 25_000,
  });
const COMMAND_ROW_KEYS: Readonly<Record<Neo4jProjectionCommand["commandName"], readonly string[]>> =
  Object.freeze({
    project_economic_nodes: [
      "organizationId",
      "workspaceId",
      "projectionSha256",
      "nodeId",
      "properties",
    ],
    project_economic_relationships: [
      "organizationId",
      "workspaceId",
      "projectionSha256",
      "assertionId",
      "assertionSha256",
      "subjectId",
      "objectId",
      "properties",
    ],
    project_provenance_nodes: [
      "organizationId",
      "workspaceId",
      "projectionSha256",
      "lineageNodeId",
      "properties",
    ],
    project_lineage_edges: [
      "organizationId",
      "workspaceId",
      "projectionSha256",
      "lineageEdgeId",
      "edgeSha256",
      "fromLineageNodeId",
      "toLineageNodeId",
      "properties",
    ],
  });
const COMMAND_PROPERTY_KEYS: Readonly<
  Record<Neo4jProjectionCommand["commandName"], readonly string[]>
> = Object.freeze({
  project_economic_nodes: [
    "nodeType",
    "canonicalLabel",
    "ontologyVersion",
    "nodeManifestSha256",
    "effectiveAt",
    "knownAt",
  ],
  project_economic_relationships: [
    "predicate",
    "claimKind",
    "causalClassification",
    "status",
    "ownerId",
  ],
  project_provenance_nodes: [
    "artifactType",
    "artifactId",
    "artifactSha256",
    "label",
    "nodeManifestSha256",
  ],
  project_lineage_edges: ["predicate", "evidenceSha256"],
});

/**
 * Atomic, retry-safe adapter for the official Neo4j driver's session/transaction shape.
 * PostgreSQL projection identities remain authoritative; this adapter never accepts dynamic Cypher.
 */
export class Neo4jDriverProjectionAdapter implements Neo4jProjectionPort {
  readonly #database: string;
  readonly #driver: Neo4jDriverPort;

  constructor(driver: Neo4jDriverPort, configuration: Neo4jProjectionAdapterConfiguration) {
    assertRecord(configuration, "neo4jProjectionAdapterConfiguration");
    assertExactKeys(configuration, ["database"], "neo4jProjectionAdapterConfiguration");
    if (typeof driver?.session !== "function") {
      throw new TypeError("Neo4j driver must expose a session factory");
    }
    const database = expectString(configuration.database, "neo4jProjectionAdapter.database");
    if (!NEO4J_DATABASE.test(database)) {
      throw new TypeError("Neo4j database must be a bounded stable lowercase key");
    }
    this.#driver = driver;
    this.#database = database;
  }

  async writeProjection(
    commands: readonly Neo4jProjectionCommand[],
    context: Neo4jProjectionContext,
  ): Promise<Readonly<Neo4jProjectionReceipt>> {
    assertProjectionContext(context);
    assertProjectionCommands(commands, context);
    if (commands.length === 0) return projectionReceipt(context, 0);

    const session = this.#driver.session({
      database: this.#database,
      defaultAccessMode: "WRITE",
    });
    try {
      const appliedCommandCount = await session.executeWrite(async (transaction) => {
        let applied = 0;
        for (const command of commands) {
          await transaction.run(command.cypher, command.parameters);
          applied += 1;
        }
        return applied;
      });
      if (appliedCommandCount !== commands.length) {
        throw new Error("Neo4j transaction completed an unexpected command count");
      }
      return projectionReceipt(context, appliedCommandCount);
    } finally {
      await session.close();
    }
  }
}

function assertProjectionContext(context: Neo4jProjectionContext): void {
  assertRecord(context, "projectionContext");
  assertExactKeys(
    context,
    ["organizationId", "workspaceId", "projectionSha256"],
    "projectionContext",
  );
  assertUuid(context.organizationId, "projectionContext.organizationId");
  assertUuid(context.workspaceId, "projectionContext.workspaceId");
  assertSha256(context.projectionSha256, "projectionContext.projectionSha256");
}

function assertProjectionCommands(
  commands: readonly Neo4jProjectionCommand[],
  context: Neo4jProjectionContext,
): void {
  if (!Array.isArray(commands) || commands.length > COMMAND_ORDER.length) {
    throw new TypeError("Neo4j projection command batch is invalid");
  }
  let priorOrder = -1;
  for (const [index, command] of commands.entries()) {
    assertRecord(command, `projectionCommands[${index}]`);
    assertExactKeys(
      command,
      ["commandName", "cypher", "parameters"],
      `projectionCommands[${index}]`,
    );
    const commandNameValue = expectString(
      command.commandName,
      `projectionCommands[${index}].commandName`,
    );
    if (!COMMAND_ORDER.includes(commandNameValue as Neo4jProjectionCommand["commandName"])) {
      throw new TypeError("Neo4j projection command name is invalid");
    }
    const commandName = commandNameValue as Neo4jProjectionCommand["commandName"];
    const cypher = expectString(command.cypher, `projectionCommands[${index}].cypher`);
    const order = COMMAND_ORDER.indexOf(commandName);
    if (order < 0 || order <= priorOrder || cypher !== COMMAND_CYPHER[commandName]) {
      throw new TypeError("Neo4j projection commands must use fixed templates in canonical order");
    }
    priorOrder = order;
    assertRecord(command.parameters, `projectionCommands[${index}].parameters`);
    assertExactKeys(command.parameters, ["rows"], `projectionCommands[${index}].parameters`);
    const rows = command.parameters.rows;
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > COMMAND_ROW_LIMIT[commandName]) {
      throw new TypeError("Neo4j projection command rows must be non-empty");
    }
    for (const [rowIndex, row] of rows.entries()) {
      const rowField = `projectionCommands[${index}].rows[${rowIndex}]`;
      assertRecord(row, rowField);
      assertExactKeys(row, COMMAND_ROW_KEYS[commandName], rowField);
      if (
        row.organizationId !== context.organizationId ||
        row.workspaceId !== context.workspaceId ||
        row.projectionSha256 !== context.projectionSha256
      ) {
        throw new TypeError("Neo4j projection command crosses its tenant or snapshot boundary");
      }
      assertRecord(row.properties, `${rowField}.properties`);
      assertExactKeys(row.properties, COMMAND_PROPERTY_KEYS[commandName], `${rowField}.properties`);
    }
  }
}

function projectionReceipt(
  context: Neo4jProjectionContext,
  appliedCommandCount: number,
): Readonly<Neo4jProjectionReceipt> {
  return deepFreeze(
    cloneCanonical({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      projectionSha256: context.projectionSha256,
      appliedCommandCount,
    }),
  );
}

function assertTenant(
  organizationId: string,
  workspaceId: string,
  candidate: { readonly organizationId: string; readonly workspaceId: string },
  field: string,
): void {
  if (candidate.organizationId !== organizationId || candidate.workspaceId !== workspaceId) {
    throw new TypeError(`${field} crosses the projection tenant boundary`);
  }
}

function parseProjectionInput(value: unknown): PostgresGraphProjectionInput {
  assertRecord(value, "projection");
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "sourceOfTruth",
      "organizationId",
      "workspaceId",
      "effectiveAt",
      "knownAt",
      "sourceSnapshotSha256",
      "nodes",
      "relationships",
      "provenanceNodes",
      "lineageEdges",
    ],
    "projection",
  );
  if (value.schemaVersion !== 1) throw new TypeError("projection.schemaVersion must be 1");
  if (value.sourceOfTruth !== "postgresql") {
    throw new TypeError("PostgreSQL must be declared as the projection source of truth");
  }
  const organizationId = expectString(value.organizationId, "projection.organizationId");
  const workspaceId = expectString(value.workspaceId, "projection.workspaceId");
  const effectiveAt = expectString(value.effectiveAt, "projection.effectiveAt");
  const knownAt = expectString(value.knownAt, "projection.knownAt");
  const sourceSnapshotSha256 = expectString(
    value.sourceSnapshotSha256,
    "projection.sourceSnapshotSha256",
  );
  assertUuid(organizationId, "projection.organizationId");
  assertUuid(workspaceId, "projection.workspaceId");
  assertIsoInstant(effectiveAt, "projection.effectiveAt");
  assertIsoInstant(knownAt, "projection.knownAt");
  assertSha256(sourceSnapshotSha256, "projection.sourceSnapshotSha256");

  const nodes = expectArray(value.nodes, "projection.nodes").map((node) => {
    assertGraphNodeIntegrity(node);
    assertTenant(organizationId, workspaceId, node, "projection node");
    return node;
  });
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.nodeId))
      throw new TypeError("projection contains a duplicate active node");
    nodeIds.add(node.nodeId);
  }
  const relationships = expectArray(value.relationships, "projection.relationships").map(
    (entry, index) => {
      assertRecord(entry, `projection.relationships[${index}]`);
      assertExactKeys(entry, ["relationship", "status"], `projection.relationships[${index}]`);
      assertRelationshipIntegrity(entry.relationship);
      assertTenant(organizationId, workspaceId, entry.relationship, "projection relationship");
      if (!nodeIds.has(entry.relationship.subjectId) || !nodeIds.has(entry.relationship.objectId)) {
        throw new TypeError(
          "projection relationship endpoints must be present in the same projection",
        );
      }
      const status = expectString(entry.status, `projection.relationships[${index}].status`);
      if (!["accepted", "deprecated", "disputed", "proposed", "reviewed"].includes(status)) {
        throw new TypeError(`projection.relationships[${index}].status is invalid`);
      }
      return { relationship: entry.relationship, status: status as ClaimStatus };
    },
  );
  const assertionIds = new Set<string>();
  for (const entry of relationships) {
    if (assertionIds.has(entry.relationship.assertionId)) {
      throw new TypeError("projection contains a duplicate active relationship");
    }
    assertionIds.add(entry.relationship.assertionId);
  }

  const provenanceNodes = expectArray(value.provenanceNodes, "projection.provenanceNodes").map(
    (node) => {
      assertProvenanceNodeIntegrity(node);
      assertTenant(organizationId, workspaceId, node, "projection provenance node");
      return node;
    },
  );
  const lineageEdges = expectArray(value.lineageEdges, "projection.lineageEdges").map((edge) => {
    assertLineageEdgeIntegrity(edge);
    assertTenant(organizationId, workspaceId, edge, "projection lineage edge");
    return edge;
  });
  if (
    nodes.length > 5_000 ||
    relationships.length > 10_000 ||
    provenanceNodes.length > 10_000 ||
    lineageEdges.length > 25_000
  ) {
    throw new TypeError("projection exceeds its bounded batch contract");
  }
  validateAcyclicLineage(provenanceNodes, lineageEdges, {
    schemaVersion: 1,
    organizationId,
    workspaceId,
    knownAt,
  });
  return {
    schemaVersion: 1,
    sourceOfTruth: "postgresql",
    organizationId,
    workspaceId,
    effectiveAt,
    knownAt,
    sourceSnapshotSha256,
    nodes: [...nodes].sort((left, right) => left.nodeId.localeCompare(right.nodeId)),
    relationships: [...relationships].sort((left, right) =>
      left.relationship.assertionId.localeCompare(right.relationship.assertionId),
    ),
    provenanceNodes: [...provenanceNodes].sort((left, right) =>
      left.lineageNodeId.localeCompare(right.lineageNodeId),
    ),
    lineageEdges: [...lineageEdges].sort((left, right) =>
      left.lineageEdgeId.localeCompare(right.lineageEdgeId),
    ),
  };
}

export function createPostgresGraphProjection(value: unknown): Readonly<PostgresGraphProjection> {
  const body = cloneCanonical(parseProjectionInput(value));
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function assertPostgresGraphProjectionIntegrity(
  value: unknown,
): asserts value is PostgresGraphProjection {
  assertRecord(value, "projection");
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "sourceOfTruth",
      "organizationId",
      "workspaceId",
      "effectiveAt",
      "knownAt",
      "sourceSnapshotSha256",
      "nodes",
      "relationships",
      "provenanceNodes",
      "lineageEdges",
      "manifestSha256",
    ],
    "projection",
  );
  const manifestSha256 = expectString(value.manifestSha256, "projection.manifestSha256");
  assertSha256(manifestSha256, "projection.manifestSha256");
  const body = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "manifestSha256"),
  );
  const parsed = parseProjectionInput(body);
  if (digestJson(parsed) !== manifestSha256) {
    throw new TypeError("projection manifest digest does not match");
  }
}

function asCanonicalRows(rows: readonly Record<string, unknown>[]): readonly CanonicalJsonValue[] {
  return cloneCanonical(rows) as readonly CanonicalJsonValue[];
}

export function buildNeo4jProjectionCommands(
  projection: PostgresGraphProjection,
): readonly Neo4jProjectionCommand[] {
  assertPostgresGraphProjectionIntegrity(projection);
  const commands: Neo4jProjectionCommand[] = [];
  if (projection.nodes.length > 0) {
    commands.push({
      commandName: "project_economic_nodes",
      cypher: ECONOMIC_NODE_CYPHER,
      parameters: {
        rows: asCanonicalRows(
          projection.nodes.map((node) => ({
            organizationId: projection.organizationId,
            workspaceId: projection.workspaceId,
            projectionSha256: projection.manifestSha256,
            nodeId: node.nodeId,
            properties: {
              nodeType: node.nodeType,
              canonicalLabel: node.canonicalLabel,
              ontologyVersion: node.ontologyVersion,
              nodeManifestSha256: node.manifestSha256,
              effectiveAt: projection.effectiveAt,
              knownAt: projection.knownAt,
            },
          })),
        ),
      },
    });
  }
  if (projection.relationships.length > 0) {
    commands.push({
      commandName: "project_economic_relationships",
      cypher: ECONOMIC_RELATIONSHIP_CYPHER,
      parameters: {
        rows: asCanonicalRows(
          projection.relationships.map(({ relationship, status }) => ({
            organizationId: projection.organizationId,
            workspaceId: projection.workspaceId,
            projectionSha256: projection.manifestSha256,
            assertionId: relationship.assertionId,
            assertionSha256: relationship.manifestSha256,
            subjectId: relationship.subjectId,
            objectId: relationship.objectId,
            properties: {
              predicate: relationship.predicate,
              claimKind: relationship.claimKind,
              causalClassification: relationship.causalClassification,
              status,
              ownerId: relationship.ownerId,
            },
          })),
        ),
      },
    });
  }
  if (projection.provenanceNodes.length > 0) {
    commands.push({
      commandName: "project_provenance_nodes",
      cypher: PROVENANCE_NODE_CYPHER,
      parameters: {
        rows: asCanonicalRows(
          projection.provenanceNodes.map((node) => ({
            organizationId: projection.organizationId,
            workspaceId: projection.workspaceId,
            projectionSha256: projection.manifestSha256,
            lineageNodeId: node.lineageNodeId,
            properties: {
              artifactType: node.artifactType,
              artifactId: node.artifactId,
              artifactSha256: node.artifactSha256,
              label: node.label,
              nodeManifestSha256: node.manifestSha256,
            },
          })),
        ),
      },
    });
  }
  if (projection.lineageEdges.length > 0) {
    commands.push({
      commandName: "project_lineage_edges",
      cypher: LINEAGE_EDGE_CYPHER,
      parameters: {
        rows: asCanonicalRows(
          projection.lineageEdges.map((edge) => ({
            organizationId: projection.organizationId,
            workspaceId: projection.workspaceId,
            projectionSha256: projection.manifestSha256,
            lineageEdgeId: edge.lineageEdgeId,
            edgeSha256: edge.manifestSha256,
            fromLineageNodeId: edge.fromLineageNodeId,
            toLineageNodeId: edge.toLineageNodeId,
            properties: {
              predicate: edge.predicate,
              evidenceSha256: edge.evidenceSha256,
            },
          })),
        ),
      },
    });
  }
  return deepFreeze(cloneCanonical(commands));
}

export async function projectPostgresSnapshotToNeo4j(
  projection: PostgresGraphProjection,
  port: Neo4jProjectionPort,
): Promise<Readonly<Neo4jProjectionReceipt>> {
  const commands = buildNeo4jProjectionCommands(projection);
  const receipt = await port.writeProjection(
    commands,
    deepFreeze({
      organizationId: projection.organizationId,
      workspaceId: projection.workspaceId,
      projectionSha256: projection.manifestSha256,
    }),
  );
  assertRecord(receipt, "projectionReceipt");
  assertExactKeys(
    receipt,
    ["organizationId", "workspaceId", "projectionSha256", "appliedCommandCount"],
    "projectionReceipt",
  );
  if (
    receipt.organizationId !== projection.organizationId ||
    receipt.workspaceId !== projection.workspaceId ||
    receipt.projectionSha256 !== projection.manifestSha256
  ) {
    throw new TypeError("Neo4j projection receipt does not match the PostgreSQL snapshot");
  }
  if (
    expectInteger(receipt.appliedCommandCount, "projectionReceipt.appliedCommandCount") !==
    commands.length
  ) {
    throw new TypeError("Neo4j projection receipt command count does not match");
  }
  return deepFreeze(cloneCanonical(receipt as unknown as Neo4jProjectionReceipt));
}
