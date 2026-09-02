import {
  assertExactDecimal,
  assertExactKeys,
  assertIsoInstant,
  assertKey,
  assertNonBlank,
  assertProbability,
  assertRecord,
  assertSemver,
  assertSha256,
  assertUuid,
  cloneCanonical,
  compareInstant,
  deepFreeze,
  digestJson,
  expectArray,
  expectInteger,
  expectNullableString,
  expectString,
  uniqueSortedStrings,
} from "./internals.js";

export const GRAPH_NODE_TYPES = [
  "asset",
  "asset_class",
  "bank",
  "bond",
  "central_bank",
  "city",
  "commodity",
  "company",
  "conflict",
  "country",
  "crisis",
  "currency",
  "dataset",
  "document",
  "economic_concept",
  "economic_indicator",
  "equity_index",
  "event",
  "financial_institution",
  "government",
  "household_group",
  "industry",
  "indicator",
  "institution",
  "instrument",
  "international_institution",
  "jurisdiction",
  "law",
  "model",
  "policy",
  "population_segment",
  "port",
  "region",
  "sanction",
  "scenario",
  "sector",
  "series",
  "supply_chain",
  "tariff",
  "trade_route",
] as const;
export type GraphNodeType = (typeof GRAPH_NODE_TYPES)[number];

export const ECONOMIC_RELATIONSHIP_TYPES = [
  "affects",
  "associated_with",
  "borrows_from",
  "causes",
  "competes_with",
  "complements",
  "contributes_to",
  "controls",
  "contradicts",
  "correlated_with",
  "depends_on",
  "derived_from",
  "exposed_to",
  "exports_to",
  "finances",
  "imports_from",
  "invalidates",
  "lends_to",
  "measured_by",
  "modeled_by",
  "owes",
  "owns",
  "predicts",
  "regulates",
  "substitutes_for",
  "supports",
  "targets",
  "transmits_to",
] as const;
export type EconomicRelationshipType = (typeof ECONOMIC_RELATIONSHIP_TYPES)[number];

export const CAUSAL_CLASSIFICATIONS = [
  "econometrically_estimated_causal_effect",
  "expert_defined_relationship",
  "hypothesized_causal_pathway",
  "observed_association",
  "predictive_relationship",
  "simulation_assumption",
  "structurally_assumed_relationship",
] as const;
export type CausalClassification = (typeof CAUSAL_CLASSIFICATIONS)[number];
export type ClaimKind = "association" | "hypothesis" | "reviewed_causal";

export const IDENTIFICATION_STRATEGIES = [
  "bayesian_causal_model",
  "causal_forest",
  "difference_in_differences",
  "dynamic_bayesian_network",
  "event_study",
  "instrumental_variables",
  "intervention_analysis",
  "regression_discontinuity",
  "structural_equation_model",
  "structural_time_series",
  "synthetic_control",
] as const;
export type IdentificationStrategy = (typeof IDENTIFICATION_STRATEGIES)[number];

export interface TemporalWindow {
  readonly from: string;
  readonly until: string | null;
}

export interface GraphNodeInput {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly nodeId: string;
  readonly nodeType: GraphNodeType;
  readonly canonicalLabel: string;
  readonly ontologyVersion: string;
  readonly validTime: TemporalWindow;
  readonly systemTime: TemporalWindow;
  readonly discoveredAt: string;
  readonly resolutionStatus: "resolved" | "ambiguous" | "deprecated";
  readonly visibility: "workspace" | "organization" | "public";
}

export interface GraphNode extends GraphNodeInput {
  readonly manifestSha256: string;
}

export const EVIDENCE_TYPES = [
  "document_passage",
  "expert_rationale",
  "identification_diagnostics",
  "model_result",
  "observation",
  "scenario_version",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export interface ClaimEvidenceInput {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly evidenceId: string;
  readonly evidenceType: EvidenceType;
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly availableAt: string;
  readonly validTime: TemporalWindow;
  readonly systemTime: TemporalWindow;
  readonly contentSha256: string;
  readonly locator: string;
  readonly licenseEntitlementSha256: string;
}

export interface ClaimEvidence extends ClaimEvidenceInput {
  readonly manifestSha256: string;
}

export interface EvidenceLedger {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly items: readonly ClaimEvidence[];
  readonly ledgerSha256: string;
}

export interface RelationshipMethod {
  readonly name: string;
  readonly version: string;
  readonly identificationStrategy: IdentificationStrategy | null;
  readonly diagnosticEvidenceIds: readonly string[];
  readonly limitations: readonly string[];
}

export interface RelationshipScope {
  readonly description: string;
  readonly population: string;
  readonly temporalFrom: string;
  readonly temporalUntil: string | null;
  readonly horizonDays: number | null;
}

export type UncertaintyKind =
  | "data_measurement"
  | "identification"
  | "model_parameter"
  | "regime_scope"
  | "source_disagreement";

export interface RelationshipUncertainty {
  readonly kind: UncertaintyKind;
  readonly description: string;
}

export interface RelationshipEffect {
  readonly direction: "decrease" | "increase" | "mixed" | "non_directional" | "unknown";
  readonly strength: string | null;
  readonly strengthUnit: string | null;
  readonly strengthScale: string;
  readonly lagMinDays: number;
  readonly lagMaxDays: number;
  readonly lagDistribution: string;
  readonly confidence: string;
  readonly uncertaintyMethod: string;
  readonly uncertainty: readonly RelationshipUncertainty[];
}

export interface RelationshipSources {
  readonly modelVersionId: string | null;
  readonly expertPrincipalId: string | null;
  readonly sourceVersionId: string | null;
}

export interface RelationshipAssertionInput {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly assertionId: string;
  readonly subjectId: string;
  readonly predicate: EconomicRelationshipType;
  readonly objectId: string;
  readonly validTime: TemporalWindow;
  readonly systemTime: TemporalWindow;
  readonly discoveredAt: string;
  readonly discoveryMethod: "causal_discovery" | "manual" | "model_output" | "source_import";
  readonly claimKind: ClaimKind;
  readonly causalClassification: CausalClassification;
  readonly method: RelationshipMethod;
  readonly scope: RelationshipScope;
  readonly assumptions: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly ownerId: string;
  readonly status: "proposed";
  readonly effect: RelationshipEffect;
  readonly regimeDependence: readonly string[];
  readonly geographicScope: readonly string[];
  readonly sources: RelationshipSources;
  readonly supersedesAssertionId: string | null;
}

export interface RelationshipAssertion extends RelationshipAssertionInput {
  readonly manifestSha256: string;
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

function literalOne(value: unknown, field: string): 1 {
  if (value !== 1) throw new TypeError(`${field} must be 1`);
  return 1;
}

export function parseTemporalWindow(value: unknown, field: string): TemporalWindow {
  assertRecord(value, field);
  assertExactKeys(value, ["from", "until"], field);
  const from = expectString(value.from, `${field}.from`);
  const until = expectNullableString(value.until, `${field}.until`);
  assertIsoInstant(from, `${field}.from`);
  if (until !== null) {
    assertIsoInstant(until, `${field}.until`);
    if (compareInstant(from, until) >= 0)
      throw new TypeError(`${field} must be half-open and non-empty`);
  }
  return { from, until };
}

function parseTenantFields(
  value: Record<string, unknown>,
  field: string,
): {
  organizationId: string;
  workspaceId: string;
} {
  const organizationId = expectString(value.organizationId, `${field}.organizationId`);
  const workspaceId = expectString(value.workspaceId, `${field}.workspaceId`);
  assertUuid(organizationId, `${field}.organizationId`);
  assertUuid(workspaceId, `${field}.workspaceId`);
  return { organizationId, workspaceId };
}

function parseGraphNodeInput(value: unknown): GraphNodeInput {
  assertRecord(value, "node");
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "organizationId",
      "workspaceId",
      "nodeId",
      "nodeType",
      "canonicalLabel",
      "ontologyVersion",
      "validTime",
      "systemTime",
      "discoveredAt",
      "resolutionStatus",
      "visibility",
    ],
    "node",
  );
  const tenant = parseTenantFields(value, "node");
  const nodeId = expectString(value.nodeId, "node.nodeId");
  const canonicalLabel = expectString(value.canonicalLabel, "node.canonicalLabel");
  const ontologyVersion = expectString(value.ontologyVersion, "node.ontologyVersion");
  const discoveredAt = expectString(value.discoveredAt, "node.discoveredAt");
  const validTime = parseTemporalWindow(value.validTime, "node.validTime");
  const systemTime = parseTemporalWindow(value.systemTime, "node.systemTime");
  assertUuid(nodeId, "node.nodeId");
  assertNonBlank(canonicalLabel, "node.canonicalLabel", 300);
  assertSemver(ontologyVersion, "node.ontologyVersion");
  assertIsoInstant(discoveredAt, "node.discoveredAt");
  if (compareInstant(discoveredAt, systemTime.from) > 0) {
    throw new TypeError("node.discoveredAt cannot be after node.systemTime.from");
  }
  return {
    schemaVersion: literalOne(value.schemaVersion, "node.schemaVersion"),
    ...tenant,
    nodeId,
    nodeType: enumValue(value.nodeType, GRAPH_NODE_TYPES, "node.nodeType"),
    canonicalLabel,
    ontologyVersion,
    validTime,
    systemTime,
    discoveredAt,
    resolutionStatus: enumValue(
      value.resolutionStatus,
      ["resolved", "ambiguous", "deprecated"] as const,
      "node.resolutionStatus",
    ),
    visibility: enumValue(
      value.visibility,
      ["workspace", "organization", "public"] as const,
      "node.visibility",
    ),
  };
}

export function createGraphNode(value: unknown): Readonly<GraphNode> {
  const body = cloneCanonical(parseGraphNodeInput(value));
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function assertGraphNodeIntegrity(value: unknown): asserts value is GraphNode {
  assertRecord(value, "node");
  assertExactKeys(value, [...NODE_INPUT_KEYS, "manifestSha256"], "node");
  const manifestSha256 = expectString(value.manifestSha256, "node.manifestSha256");
  assertSha256(manifestSha256, "node.manifestSha256");
  const body = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "manifestSha256"),
  );
  const parsed = parseGraphNodeInput(body);
  if (digestJson(parsed) !== manifestSha256)
    throw new TypeError("node manifest digest does not match");
}

const NODE_INPUT_KEYS = [
  "schemaVersion",
  "organizationId",
  "workspaceId",
  "nodeId",
  "nodeType",
  "canonicalLabel",
  "ontologyVersion",
  "validTime",
  "systemTime",
  "discoveredAt",
  "resolutionStatus",
  "visibility",
] as const;

function parseClaimEvidenceInput(value: unknown): ClaimEvidenceInput {
  assertRecord(value, "evidence");
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "organizationId",
      "workspaceId",
      "evidenceId",
      "evidenceType",
      "sourceId",
      "sourceVersion",
      "availableAt",
      "validTime",
      "systemTime",
      "contentSha256",
      "locator",
      "licenseEntitlementSha256",
    ],
    "evidence",
  );
  const tenant = parseTenantFields(value, "evidence");
  const evidenceId = expectString(value.evidenceId, "evidence.evidenceId");
  const sourceId = expectString(value.sourceId, "evidence.sourceId");
  const sourceVersion = expectString(value.sourceVersion, "evidence.sourceVersion");
  const availableAt = expectString(value.availableAt, "evidence.availableAt");
  const contentSha256 = expectString(value.contentSha256, "evidence.contentSha256");
  const locator = expectString(value.locator, "evidence.locator");
  const licenseEntitlementSha256 = expectString(
    value.licenseEntitlementSha256,
    "evidence.licenseEntitlementSha256",
  );
  const validTime = parseTemporalWindow(value.validTime, "evidence.validTime");
  const systemTime = parseTemporalWindow(value.systemTime, "evidence.systemTime");
  assertUuid(evidenceId, "evidence.evidenceId");
  assertUuid(sourceId, "evidence.sourceId");
  assertNonBlank(sourceVersion, "evidence.sourceVersion", 200);
  assertIsoInstant(availableAt, "evidence.availableAt");
  if (compareInstant(availableAt, systemTime.from) > 0) {
    throw new TypeError("evidence.availableAt cannot be after evidence.systemTime.from");
  }
  assertSha256(contentSha256, "evidence.contentSha256");
  assertNonBlank(locator, "evidence.locator", 2_000);
  assertSha256(licenseEntitlementSha256, "evidence.licenseEntitlementSha256");
  return {
    schemaVersion: literalOne(value.schemaVersion, "evidence.schemaVersion"),
    ...tenant,
    evidenceId,
    evidenceType: enumValue(value.evidenceType, EVIDENCE_TYPES, "evidence.evidenceType"),
    sourceId,
    sourceVersion,
    availableAt,
    validTime,
    systemTime,
    contentSha256,
    locator,
    licenseEntitlementSha256,
  };
}

const EVIDENCE_INPUT_KEYS = [
  "schemaVersion",
  "organizationId",
  "workspaceId",
  "evidenceId",
  "evidenceType",
  "sourceId",
  "sourceVersion",
  "availableAt",
  "validTime",
  "systemTime",
  "contentSha256",
  "locator",
  "licenseEntitlementSha256",
] as const;

export function createClaimEvidence(value: unknown): Readonly<ClaimEvidence> {
  const body = cloneCanonical(parseClaimEvidenceInput(value));
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function assertClaimEvidenceIntegrity(value: unknown): asserts value is ClaimEvidence {
  assertRecord(value, "evidence");
  assertExactKeys(value, [...EVIDENCE_INPUT_KEYS, "manifestSha256"], "evidence");
  const manifestSha256 = expectString(value.manifestSha256, "evidence.manifestSha256");
  assertSha256(manifestSha256, "evidence.manifestSha256");
  const body = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "manifestSha256"),
  );
  const parsed = parseClaimEvidenceInput(body);
  if (digestJson(parsed) !== manifestSha256) {
    throw new TypeError("evidence manifest digest does not match");
  }
}

export function createEvidenceLedger(
  organizationId: string,
  workspaceId: string,
): Readonly<EvidenceLedger> {
  assertUuid(organizationId, "organizationId");
  assertUuid(workspaceId, "workspaceId");
  const body = { schemaVersion: 1 as const, organizationId, workspaceId, items: [] };
  return deepFreeze({ ...body, ledgerSha256: digestJson(body) });
}

export function assertEvidenceLedgerIntegrity(value: unknown): asserts value is EvidenceLedger {
  assertRecord(value, "evidenceLedger");
  assertExactKeys(
    value,
    ["schemaVersion", "organizationId", "workspaceId", "items", "ledgerSha256"],
    "evidenceLedger",
  );
  literalOne(value.schemaVersion, "evidenceLedger.schemaVersion");
  const tenant = parseTenantFields(value, "evidenceLedger");
  const items = expectArray(value.items, "evidenceLedger.items");
  const ledgerSha256 = expectString(value.ledgerSha256, "evidenceLedger.ledgerSha256");
  assertSha256(ledgerSha256, "evidenceLedger.ledgerSha256");
  const ids = new Set<string>();
  for (const item of items) {
    assertClaimEvidenceIntegrity(item);
    if (item.organizationId !== tenant.organizationId || item.workspaceId !== tenant.workspaceId) {
      throw new TypeError("evidence ledger cannot contain cross-tenant evidence");
    }
    if (ids.has(item.evidenceId)) throw new TypeError("evidence ledger contains a duplicate ID");
    ids.add(item.evidenceId);
  }
  const body = {
    schemaVersion: 1 as const,
    ...tenant,
    items,
  };
  if (digestJson(body) !== ledgerSha256)
    throw new TypeError("evidence ledger digest does not match");
}

export function appendEvidence(
  ledger: EvidenceLedger,
  evidence: ClaimEvidence,
): Readonly<EvidenceLedger> {
  assertEvidenceLedgerIntegrity(ledger);
  assertClaimEvidenceIntegrity(evidence);
  if (
    ledger.organizationId !== evidence.organizationId ||
    ledger.workspaceId !== evidence.workspaceId
  ) {
    throw new TypeError("cannot append cross-tenant evidence");
  }
  const existing = ledger.items.find((item) => item.evidenceId === evidence.evidenceId);
  if (existing !== undefined) {
    if (existing.manifestSha256 !== evidence.manifestSha256) {
      throw new TypeError("evidence ID replay has different content");
    }
    return ledger;
  }
  const items = [...ledger.items, evidence].sort((left, right) =>
    left.evidenceId.localeCompare(right.evidenceId),
  );
  const body = {
    schemaVersion: 1 as const,
    organizationId: ledger.organizationId,
    workspaceId: ledger.workspaceId,
    items,
  };
  return deepFreeze({ ...cloneCanonical(body), ledgerSha256: digestJson(body) });
}

function parseMethod(value: unknown, claimKind: ClaimKind): RelationshipMethod {
  assertRecord(value, "relationship.method");
  assertExactKeys(
    value,
    ["name", "version", "identificationStrategy", "diagnosticEvidenceIds", "limitations"],
    "relationship.method",
  );
  const name = expectString(value.name, "relationship.method.name");
  const version = expectString(value.version, "relationship.method.version");
  assertNonBlank(name, "relationship.method.name", 300);
  assertSemver(version, "relationship.method.version");
  const strategy =
    value.identificationStrategy === null
      ? null
      : enumValue(
          value.identificationStrategy,
          IDENTIFICATION_STRATEGIES,
          "relationship.method.identificationStrategy",
        );
  const diagnosticEvidenceIds = uniqueSortedStrings(
    expectArray(value.diagnosticEvidenceIds, "relationship.method.diagnosticEvidenceIds"),
    "relationship.method.diagnosticEvidenceIds",
    assertUuid,
  );
  const limitations = uniqueSortedStrings(
    expectArray(value.limitations, "relationship.method.limitations"),
    "relationship.method.limitations",
    (item, field) => assertNonBlank(item, field, 1_000),
    false,
  );
  if (claimKind === "reviewed_causal") {
    if (strategy === null || diagnosticEvidenceIds.length === 0) {
      throw new TypeError(
        "reviewed causal relationships require an identification strategy and diagnostic evidence",
      );
    }
  } else if (strategy !== null || diagnosticEvidenceIds.length !== 0) {
    throw new TypeError("association and hypothesis methods cannot claim reviewed identification");
  }
  return { name, version, identificationStrategy: strategy, diagnosticEvidenceIds, limitations };
}

function parseScope(value: unknown): RelationshipScope {
  assertRecord(value, "relationship.scope");
  assertExactKeys(
    value,
    ["description", "population", "temporalFrom", "temporalUntil", "horizonDays"],
    "relationship.scope",
  );
  const description = expectString(value.description, "relationship.scope.description");
  const population = expectString(value.population, "relationship.scope.population");
  const temporalFrom = expectString(value.temporalFrom, "relationship.scope.temporalFrom");
  const temporalUntil = expectNullableString(
    value.temporalUntil,
    "relationship.scope.temporalUntil",
  );
  assertNonBlank(description, "relationship.scope.description", 1_000);
  assertNonBlank(population, "relationship.scope.population", 500);
  assertIsoInstant(temporalFrom, "relationship.scope.temporalFrom");
  if (temporalUntil !== null) {
    assertIsoInstant(temporalUntil, "relationship.scope.temporalUntil");
    if (compareInstant(temporalFrom, temporalUntil) >= 0) {
      throw new TypeError("relationship.scope temporal interval must be non-empty");
    }
  }
  const horizonDays =
    value.horizonDays === null
      ? null
      : expectInteger(value.horizonDays, "relationship.scope.horizonDays", 1);
  return { description, population, temporalFrom, temporalUntil, horizonDays };
}

function parseEffect(value: unknown): RelationshipEffect {
  assertRecord(value, "relationship.effect");
  assertExactKeys(
    value,
    [
      "direction",
      "strength",
      "strengthUnit",
      "strengthScale",
      "lagMinDays",
      "lagMaxDays",
      "lagDistribution",
      "confidence",
      "uncertaintyMethod",
      "uncertainty",
    ],
    "relationship.effect",
  );
  const strength = expectNullableString(value.strength, "relationship.effect.strength");
  const strengthUnit = expectNullableString(value.strengthUnit, "relationship.effect.strengthUnit");
  if ((strength === null) !== (strengthUnit === null)) {
    throw new TypeError("relationship.effect strength and strengthUnit must both be set or null");
  }
  if (strength !== null) assertExactDecimal(strength, "relationship.effect.strength");
  if (strengthUnit !== null) assertNonBlank(strengthUnit, "relationship.effect.strengthUnit", 100);
  const strengthScale = expectString(value.strengthScale, "relationship.effect.strengthScale");
  const lagMinDays = expectInteger(value.lagMinDays, "relationship.effect.lagMinDays");
  const lagMaxDays = expectInteger(value.lagMaxDays, "relationship.effect.lagMaxDays");
  if (lagMinDays > lagMaxDays)
    throw new TypeError("relationship.effect lagMinDays exceeds lagMaxDays");
  const lagDistribution = expectString(
    value.lagDistribution,
    "relationship.effect.lagDistribution",
  );
  const confidence = expectString(value.confidence, "relationship.effect.confidence");
  const uncertaintyMethod = expectString(
    value.uncertaintyMethod,
    "relationship.effect.uncertaintyMethod",
  );
  assertNonBlank(strengthScale, "relationship.effect.strengthScale", 200);
  assertNonBlank(lagDistribution, "relationship.effect.lagDistribution", 300);
  assertProbability(confidence, "relationship.effect.confidence");
  assertNonBlank(uncertaintyMethod, "relationship.effect.uncertaintyMethod", 300);
  const uncertainty = expectArray(value.uncertainty, "relationship.effect.uncertainty").map(
    (item, index) => {
      assertRecord(item, `relationship.effect.uncertainty[${index}]`);
      assertExactKeys(item, ["kind", "description"], `relationship.effect.uncertainty[${index}]`);
      const description = expectString(
        item.description,
        `relationship.effect.uncertainty[${index}].description`,
      );
      assertNonBlank(description, `relationship.effect.uncertainty[${index}].description`, 1_000);
      return {
        kind: enumValue(
          item.kind,
          [
            "data_measurement",
            "identification",
            "model_parameter",
            "regime_scope",
            "source_disagreement",
          ] as const,
          `relationship.effect.uncertainty[${index}].kind`,
        ),
        description,
      };
    },
  );
  if (uncertainty.length === 0)
    throw new TypeError("relationship.effect.uncertainty must not be empty");
  const kinds = new Set(uncertainty.map((item) => item.kind));
  if (kinds.size !== uncertainty.length) {
    throw new TypeError("relationship.effect.uncertainty kinds must be unique");
  }
  uncertainty.sort((left, right) => left.kind.localeCompare(right.kind));
  return {
    direction: enumValue(
      value.direction,
      ["decrease", "increase", "mixed", "non_directional", "unknown"] as const,
      "relationship.effect.direction",
    ),
    strength,
    strengthUnit,
    strengthScale,
    lagMinDays,
    lagMaxDays,
    lagDistribution,
    confidence,
    uncertaintyMethod,
    uncertainty,
  };
}

function parseSources(value: unknown): RelationshipSources {
  assertRecord(value, "relationship.sources");
  assertExactKeys(
    value,
    ["modelVersionId", "expertPrincipalId", "sourceVersionId"],
    "relationship.sources",
  );
  const modelVersionId = expectNullableString(
    value.modelVersionId,
    "relationship.sources.modelVersionId",
  );
  const expertPrincipalId = expectNullableString(
    value.expertPrincipalId,
    "relationship.sources.expertPrincipalId",
  );
  const sourceVersionId = expectNullableString(
    value.sourceVersionId,
    "relationship.sources.sourceVersionId",
  );
  for (const [field, candidate] of [
    ["modelVersionId", modelVersionId],
    ["expertPrincipalId", expertPrincipalId],
    ["sourceVersionId", sourceVersionId],
  ] as const) {
    if (candidate !== null) assertUuid(candidate, `relationship.sources.${field}`);
  }
  if (modelVersionId === null && expertPrincipalId === null && sourceVersionId === null) {
    throw new TypeError("relationship.sources requires at least one attributable source");
  }
  return { modelVersionId, expertPrincipalId, sourceVersionId };
}

const RELATIONSHIP_INPUT_KEYS = [
  "schemaVersion",
  "organizationId",
  "workspaceId",
  "assertionId",
  "subjectId",
  "predicate",
  "objectId",
  "validTime",
  "systemTime",
  "discoveredAt",
  "discoveryMethod",
  "claimKind",
  "causalClassification",
  "method",
  "scope",
  "assumptions",
  "evidenceIds",
  "ownerId",
  "status",
  "effect",
  "regimeDependence",
  "geographicScope",
  "sources",
  "supersedesAssertionId",
] as const;

function validateClassification(
  claimKind: ClaimKind,
  classification: CausalClassification,
  predicate: EconomicRelationshipType,
  discoveryMethod: RelationshipAssertionInput["discoveryMethod"],
): void {
  const expectedKind: ClaimKind =
    classification === "observed_association" || classification === "predictive_relationship"
      ? "association"
      : classification === "econometrically_estimated_causal_effect"
        ? "reviewed_causal"
        : "hypothesis";
  if (claimKind !== expectedKind) {
    throw new TypeError(
      `causal classification ${classification} requires claimKind ${expectedKind}`,
    );
  }
  if (predicate === "causes" && claimKind !== "reviewed_causal") {
    throw new TypeError("causes is reserved for governed reviewed causal relationships");
  }
  if (
    (predicate === "associated_with" ||
      predicate === "correlated_with" ||
      predicate === "predicts") &&
    claimKind !== "association"
  ) {
    throw new TypeError(`${predicate} requires an association classification`);
  }
  if (
    claimKind === "reviewed_causal" &&
    predicate !== "causes" &&
    predicate !== "contributes_to" &&
    predicate !== "affects" &&
    predicate !== "transmits_to"
  ) {
    throw new TypeError("reviewed causal language is limited to causal analytical predicates");
  }
  if (discoveryMethod === "causal_discovery" && claimKind !== "hypothesis") {
    throw new TypeError("causal discovery outputs must remain hypotheses until governed review");
  }
}

function parseRelationshipAssertionInput(
  value: unknown,
  allowReviewedCausal: boolean,
): RelationshipAssertionInput {
  assertRecord(value, "relationship");
  assertExactKeys(value, RELATIONSHIP_INPUT_KEYS, "relationship");
  const tenant = parseTenantFields(value, "relationship");
  const assertionId = expectString(value.assertionId, "relationship.assertionId");
  const subjectId = expectString(value.subjectId, "relationship.subjectId");
  const objectId = expectString(value.objectId, "relationship.objectId");
  const ownerId = expectString(value.ownerId, "relationship.ownerId");
  for (const [field, id] of [
    ["assertionId", assertionId],
    ["subjectId", subjectId],
    ["objectId", objectId],
    ["ownerId", ownerId],
  ] as const) {
    assertUuid(id, `relationship.${field}`);
  }
  if (subjectId === objectId) throw new TypeError("relationship subject and object must differ");
  const supersedesAssertionId = expectNullableString(
    value.supersedesAssertionId,
    "relationship.supersedesAssertionId",
  );
  if (supersedesAssertionId !== null) {
    assertUuid(supersedesAssertionId, "relationship.supersedesAssertionId");
    if (supersedesAssertionId === assertionId) {
      throw new TypeError("relationship cannot supersede itself");
    }
  }
  const validTime = parseTemporalWindow(value.validTime, "relationship.validTime");
  const systemTime = parseTemporalWindow(value.systemTime, "relationship.systemTime");
  const discoveredAt = expectString(value.discoveredAt, "relationship.discoveredAt");
  assertIsoInstant(discoveredAt, "relationship.discoveredAt");
  if (compareInstant(discoveredAt, systemTime.from) > 0) {
    throw new TypeError("relationship.discoveredAt cannot be after relationship.systemTime.from");
  }
  const predicate = enumValue(
    value.predicate,
    ECONOMIC_RELATIONSHIP_TYPES,
    "relationship.predicate",
  );
  const claimKind = enumValue(
    value.claimKind,
    ["association", "hypothesis", "reviewed_causal"] as const,
    "relationship.claimKind",
  );
  const causalClassification = enumValue(
    value.causalClassification,
    CAUSAL_CLASSIFICATIONS,
    "relationship.causalClassification",
  );
  const discoveryMethod = enumValue(
    value.discoveryMethod,
    ["causal_discovery", "manual", "model_output", "source_import"] as const,
    "relationship.discoveryMethod",
  );
  validateClassification(claimKind, causalClassification, predicate, discoveryMethod);
  if (claimKind === "reviewed_causal" && !allowReviewedCausal) {
    throw new TypeError(
      "reviewed causal relationships can only be created by a governed causal review transition",
    );
  }
  const assumptions = uniqueSortedStrings(
    expectArray(value.assumptions, "relationship.assumptions"),
    "relationship.assumptions",
    (item, field) => assertNonBlank(item, field, 1_000),
    false,
  );
  const evidenceIds = uniqueSortedStrings(
    expectArray(value.evidenceIds, "relationship.evidenceIds"),
    "relationship.evidenceIds",
    assertUuid,
    false,
  );
  const regimeDependence = uniqueSortedStrings(
    expectArray(value.regimeDependence, "relationship.regimeDependence"),
    "relationship.regimeDependence",
    (item, field) => assertKey(item, field),
  );
  const geographicScope = uniqueSortedStrings(
    expectArray(value.geographicScope, "relationship.geographicScope"),
    "relationship.geographicScope",
    assertUuid,
    false,
  );
  const method = parseMethod(value.method, claimKind);
  for (const diagnosticId of method.diagnosticEvidenceIds) {
    if (!evidenceIds.includes(diagnosticId)) {
      throw new TypeError("diagnostic evidence must also appear in relationship.evidenceIds");
    }
  }
  const sources = parseSources(value.sources);
  if (
    causalClassification === "expert_defined_relationship" &&
    sources.expertPrincipalId === null
  ) {
    throw new TypeError("expert-defined relationships require an expertPrincipalId");
  }
  if (
    (causalClassification === "structurally_assumed_relationship" ||
      causalClassification === "simulation_assumption") &&
    sources.modelVersionId === null
  ) {
    throw new TypeError("model or simulation assumptions require a modelVersionId");
  }
  if (claimKind === "reviewed_causal" && sources.modelVersionId === null) {
    throw new TypeError("reviewed causal relationships require an attributable modelVersionId");
  }
  return {
    schemaVersion: literalOne(value.schemaVersion, "relationship.schemaVersion"),
    ...tenant,
    assertionId,
    subjectId,
    predicate,
    objectId,
    validTime,
    systemTime,
    discoveredAt,
    discoveryMethod,
    claimKind,
    causalClassification,
    method,
    scope: parseScope(value.scope),
    assumptions,
    evidenceIds,
    ownerId,
    status: enumValue(value.status, ["proposed"] as const, "relationship.status"),
    effect: parseEffect(value.effect),
    regimeDependence,
    geographicScope,
    sources,
    supersedesAssertionId,
  };
}

function sealRelationship(
  input: unknown,
  allowReviewedCausal: boolean,
): Readonly<RelationshipAssertion> {
  const body = cloneCanonical(parseRelationshipAssertionInput(input, allowReviewedCausal));
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function createRelationshipAssertion(value: unknown): Readonly<RelationshipAssertion> {
  return sealRelationship(value, false);
}

export function createReviewedRelationshipAfterGovernedReview(
  value: unknown,
): Readonly<RelationshipAssertion> {
  return sealRelationship(value, true);
}

export function assertRelationshipIntegrity(
  value: unknown,
): asserts value is RelationshipAssertion {
  assertRecord(value, "relationship");
  assertExactKeys(value, [...RELATIONSHIP_INPUT_KEYS, "manifestSha256"], "relationship");
  const manifestSha256 = expectString(value.manifestSha256, "relationship.manifestSha256");
  assertSha256(manifestSha256, "relationship.manifestSha256");
  const body = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "manifestSha256"),
  );
  const parsed = parseRelationshipAssertionInput(body, true);
  if (digestJson(parsed) !== manifestSha256) {
    throw new TypeError("relationship manifest digest does not match");
  }
}
