import { assertIsoInstant, type Principal } from "@economyos/contracts";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PostgresRuntime, type QueryResult, type TenantTransaction } from "./database.js";
import { GovernedAuthorizationService } from "./governed-authorization.js";
import { WorkspaceAccessService } from "./workspaces.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const CANONICAL_KEY = /^[a-z0-9][a-z0-9_.:-]{2,255}$/;
const URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const PROBABILITY = /^(?:0(?:\.\d{1,18})?|1(?:\.0{1,18})?)$/;
const MAX_JSON_DEPTH = 6;
const MAX_JSON_NODES = 512;
const MAX_JSON_BYTES = 32_768;
const MAX_JSON_STRING = 4_000;
const MAX_LAG_SECONDS = 31_557_600_000;

export const RELATIONSHIP_ENDPOINT_TYPES = [
  "country",
  "region",
  "city",
  "government",
  "central_bank",
  "financial_institution",
  "bank",
  "company",
  "industry",
  "household_group",
  "currency",
  "commodity",
  "asset",
  "bond",
  "equity_index",
  "economic_indicator",
  "policy",
  "law",
  "tariff",
  "sanction",
  "event",
  "conflict",
  "trade_route",
  "port",
  "supply_chain",
  "institution",
  "economic_concept",
  "crisis",
] as const;

export const RELATIONSHIP_REFERENCE_TYPES = [
  "workspace_native",
  "geography",
  "concept",
  "series",
] as const;
export const GOVERNED_RELATIONSHIP_TYPES = [
  "causes",
  "contributes_to",
  "affects",
  "depends_on",
  "exports_to",
  "imports_from",
  "finances",
  "owns",
  "owes",
  "lends_to",
  "borrows_from",
  "regulates",
  "controls",
  "targets",
  "transmits_to",
  "exposed_to",
  "correlated_with",
  "substitutes_for",
  "complements",
  "competes_with",
] as const;
export const RELATIONSHIP_CLAIM_KINDS = ["association", "causal_hypothesis", "causal"] as const;
export const RELATIONSHIP_CAUSAL_CLASSIFICATIONS = [
  "observed_association",
  "predictive_relationship",
  "hypothesized_causal_pathway",
  "econometrically_estimated_causal_relationship",
  "structurally_assumed_relationship",
  "expert_defined_relationship",
  "simulation_assumption",
] as const;
export const RELATIONSHIP_DISCOVERY_METHODS = [
  "manual_review",
  "descriptive_statistics",
  "predictive_model",
  "causal_discovery",
  "econometric_identification",
  "structural_model",
  "expert_judgment",
  "simulation",
] as const;
export const RELATIONSHIP_EFFECT_DIRECTIONS = [
  "positive",
  "negative",
  "mixed",
  "none",
  "unknown",
] as const;
export const RELATIONSHIP_EVIDENCE_TYPES = [
  "published_study",
  "official_data",
  "model_run",
  "expert_review",
  "licensed_document",
  "source_record",
  "validation_report",
  "falsification_test",
  "sensitivity_analysis",
] as const;
export const RELATIONSHIP_EVIDENCE_ROLES = [
  "supports",
  "contradicts",
  "qualifies",
  "identifies",
  "validates",
] as const;
export const RELATIONSHIP_DECISION_STATUSES = [
  "proposed",
  "reviewed",
  "approved",
  "rejected",
  "retired",
] as const;
export const RELATIONSHIP_RESOLVED_STATUSES = [
  "discovered",
  "proposed",
  "reviewed",
  "approved",
  "rejected",
  "retired",
] as const;

const ENDPOINT_FIELDS = new Set([
  "workspaceId",
  "endpointType",
  "canonicalKey",
  "displayName",
  "referenceType",
  "referenceId",
]);
const CLAIM_FIELDS = new Set([
  "workspaceId",
  "fromEndpointId",
  "toEndpointId",
  "relationshipType",
  "claimKind",
  "causalClassification",
  "discoveryMethod",
  "hypothesisSourceClaimId",
  "supersedesClaimId",
  "methodSpecification",
  "scope",
  "assumptions",
  "uncertainty",
  "confidence",
  "effectDirection",
  "effectStrength",
  "lagMinSeconds",
  "lagMaxSeconds",
  "regimeScope",
  "geographicScope",
  "validFrom",
  "validUntil",
  "discoveredAt",
]);
const EVIDENCE_FIELDS = new Set([
  "workspaceId",
  "evidenceType",
  "evidenceUri",
  "sourceSha256",
  "locator",
  "observedAt",
  "validFrom",
  "validUntil",
]);
const LINK_FIELDS = new Set(["workspaceId", "evidenceId", "evidenceRole", "rationale", "linkedAt"]);
const DECISION_FIELDS = new Set(["workspaceId", "toStatus", "reason", "effectiveAt"]);
const STATUS_QUERY_FIELDS = new Set(["workspaceId", "effectiveAt", "systemAt"]);

type EndpointType = (typeof RELATIONSHIP_ENDPOINT_TYPES)[number];
type ReferenceType = (typeof RELATIONSHIP_REFERENCE_TYPES)[number];
type RelationshipType = (typeof GOVERNED_RELATIONSHIP_TYPES)[number];
type ClaimKind = (typeof RELATIONSHIP_CLAIM_KINDS)[number];
type CausalClassification = (typeof RELATIONSHIP_CAUSAL_CLASSIFICATIONS)[number];
type DiscoveryMethod = (typeof RELATIONSHIP_DISCOVERY_METHODS)[number];
type EffectDirection = (typeof RELATIONSHIP_EFFECT_DIRECTIONS)[number];
type EvidenceType = (typeof RELATIONSHIP_EVIDENCE_TYPES)[number];
type EvidenceRole = (typeof RELATIONSHIP_EVIDENCE_ROLES)[number];
type DecisionStatus = (typeof RELATIONSHIP_DECISION_STATUSES)[number];
type ResolvedStatus = (typeof RELATIONSHIP_RESOLVED_STATUSES)[number];
type JsonScalar = string | number | boolean | null;
type JsonValue = JsonScalar | readonly JsonValue[] | { readonly [key: string]: JsonValue };
type JsonObject = { readonly [key: string]: JsonValue };

export interface RelationshipEndpointCommand {
  readonly workspaceId: string;
  readonly endpointType: EndpointType;
  readonly canonicalKey: string;
  readonly displayName: string;
  readonly referenceType: ReferenceType;
  readonly referenceId: string | null;
}

export interface RelationshipClaimCommand {
  readonly workspaceId: string;
  readonly fromEndpointId: string;
  readonly toEndpointId: string;
  readonly relationshipType: RelationshipType;
  readonly claimKind: ClaimKind;
  readonly causalClassification: CausalClassification;
  readonly discoveryMethod: DiscoveryMethod;
  readonly hypothesisSourceClaimId: string | null;
  readonly supersedesClaimId: string | null;
  readonly methodSpecification: JsonObject;
  readonly scope: JsonObject;
  readonly assumptions: readonly JsonValue[];
  readonly uncertainty: JsonObject;
  readonly confidence: string;
  readonly effectDirection: EffectDirection;
  readonly effectStrength: string | null;
  readonly lagMinSeconds: number | null;
  readonly lagMaxSeconds: number | null;
  readonly regimeScope: JsonObject;
  readonly geographicScope: JsonObject;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly discoveredAt: string;
}

export interface RelationshipEvidenceCommand {
  readonly workspaceId: string;
  readonly evidenceType: EvidenceType;
  readonly evidenceUri: string;
  readonly sourceSha256: string;
  readonly locator: JsonObject;
  readonly observedAt: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
}

export interface RelationshipEvidenceLinkCommand {
  readonly workspaceId: string;
  readonly evidenceId: string;
  readonly evidenceRole: EvidenceRole;
  readonly rationale: string;
  readonly linkedAt: string;
}

export interface RelationshipDecisionCommand {
  readonly workspaceId: string;
  readonly toStatus: DecisionStatus;
  readonly reason: string;
  readonly effectiveAt: string;
}

export interface RelationshipStatusQuery {
  readonly workspaceId: string;
  readonly effectiveAt: string;
  readonly systemAt: string;
}

export type RelationshipResource =
  | "relationship_endpoint"
  | "relationship_claim"
  | "relationship_evidence"
  | "relationship_evidence_link"
  | "relationship_decision";

export interface RelationshipWriteReceipt {
  readonly resource: RelationshipResource;
  readonly id: string;
}

export interface RelationshipClaimStatus {
  readonly resolvedClaimId: string;
  readonly rootClaimId: string;
  readonly fromEndpointId: string;
  readonly toEndpointId: string;
  readonly relationshipType: RelationshipType;
  readonly claimKind: ClaimKind;
  readonly causalClassification: CausalClassification;
  readonly status: ResolvedStatus;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly recordedAt: string;
  readonly claimSha256: string;
  readonly decisionId: string;
  readonly decisionSha256: string;
  readonly effectiveAt: string;
  readonly systemAt: string;
}

interface IdentifierRow extends Record<string, unknown> {
  readonly result_id: unknown;
}

interface StatusRow extends Record<string, unknown> {
  readonly resolved_claim_id: unknown;
  readonly root_claim_id: unknown;
  readonly from_endpoint_id: unknown;
  readonly to_endpoint_id: unknown;
  readonly relationship_type: unknown;
  readonly claim_kind: unknown;
  readonly causal_classification: unknown;
  readonly status: unknown;
  readonly valid_from: unknown;
  readonly valid_until: unknown;
  readonly recorded_at: unknown;
  readonly claim_sha256: unknown;
  readonly decision_id: unknown;
  readonly decision_sha256: unknown;
}

export function parseRelationshipEndpointCommand(raw: unknown): RelationshipEndpointCommand {
  const body = requestObject(raw);
  assertOnlyFields(body, ENDPOINT_FIELDS);
  const endpointType = enumField(body.endpointType, "endpointType", RELATIONSHIP_ENDPOINT_TYPES);
  const referenceType = enumField(
    body.referenceType,
    "referenceType",
    RELATIONSHIP_REFERENCE_TYPES,
  );
  const referenceId = nullableUuidField(body.referenceId, "referenceId");
  if (!validReferenceBinding(endpointType, referenceType, referenceId)) {
    invalidRequest("referenceId");
  }
  return Object.freeze({
    workspaceId: uuidField(body.workspaceId, "workspaceId"),
    endpointType,
    canonicalKey: patternField(body.canonicalKey, "canonicalKey", CANONICAL_KEY),
    displayName: boundedTextField(body.displayName, "displayName", 1, 300),
    referenceType,
    referenceId,
  });
}

export function parseRelationshipClaimCommand(raw: unknown): RelationshipClaimCommand {
  const body = requestObject(raw);
  assertOnlyFields(body, CLAIM_FIELDS);
  const claimKind = enumField(body.claimKind, "claimKind", RELATIONSHIP_CLAIM_KINDS);
  const causalClassification = enumField(
    body.causalClassification,
    "causalClassification",
    RELATIONSHIP_CAUSAL_CLASSIFICATIONS,
  );
  const discoveryMethod = enumField(
    body.discoveryMethod,
    "discoveryMethod",
    RELATIONSHIP_DISCOVERY_METHODS,
  );
  const methodSpecification = jsonObjectField(
    body.methodSpecification,
    "methodSpecification",
    true,
  );
  const scope = jsonObjectField(body.scope, "scope", true);
  const assumptions = jsonArrayField(body.assumptions, "assumptions", 64);
  const uncertainty = jsonObjectField(body.uncertainty, "uncertainty", true);
  const regimeScope = jsonObjectField(body.regimeScope, "regimeScope", false);
  const geographicScope = jsonObjectField(body.geographicScope, "geographicScope", false);
  validateClaimSemantics(
    claimKind,
    causalClassification,
    discoveryMethod,
    methodSpecification,
    assumptions,
  );
  const validFrom = instantField(body.validFrom, "validFrom");
  const validUntil = nullableInstantField(body.validUntil, "validUntil");
  if (validUntil !== null && compareInstants(validFrom, validUntil) >= 0) {
    invalidRequest("validUntil");
  }
  const lagMinSeconds = nullableIntegerField(
    body.lagMinSeconds,
    "lagMinSeconds",
    0,
    MAX_LAG_SECONDS,
  );
  const lagMaxSeconds = nullableIntegerField(
    body.lagMaxSeconds,
    "lagMaxSeconds",
    0,
    MAX_LAG_SECONDS,
  );
  if (
    (lagMinSeconds === null) !== (lagMaxSeconds === null) ||
    (lagMinSeconds !== null && lagMaxSeconds !== null && lagMaxSeconds < lagMinSeconds)
  ) {
    invalidRequest("lagMaxSeconds");
  }
  return Object.freeze({
    workspaceId: uuidField(body.workspaceId, "workspaceId"),
    fromEndpointId: uuidField(body.fromEndpointId, "fromEndpointId"),
    toEndpointId: uuidField(body.toEndpointId, "toEndpointId"),
    relationshipType: enumField(
      body.relationshipType,
      "relationshipType",
      GOVERNED_RELATIONSHIP_TYPES,
    ),
    claimKind,
    causalClassification,
    discoveryMethod,
    hypothesisSourceClaimId: nullableUuidField(
      body.hypothesisSourceClaimId,
      "hypothesisSourceClaimId",
    ),
    supersedesClaimId: nullableUuidField(body.supersedesClaimId, "supersedesClaimId"),
    methodSpecification,
    scope,
    assumptions,
    uncertainty,
    confidence: probabilityField(body.confidence, "confidence"),
    effectDirection: enumField(
      body.effectDirection,
      "effectDirection",
      RELATIONSHIP_EFFECT_DIRECTIONS,
    ),
    effectStrength: nullableProbabilityField(body.effectStrength, "effectStrength"),
    lagMinSeconds,
    lagMaxSeconds,
    regimeScope,
    geographicScope,
    validFrom,
    validUntil,
    discoveredAt: instantField(body.discoveredAt, "discoveredAt"),
  });
}

export function parseRelationshipEvidenceCommand(raw: unknown): RelationshipEvidenceCommand {
  const body = requestObject(raw);
  assertOnlyFields(body, EVIDENCE_FIELDS);
  const validFrom = instantField(body.validFrom, "validFrom");
  const validUntil = nullableInstantField(body.validUntil, "validUntil");
  if (validUntil !== null && compareInstants(validFrom, validUntil) >= 0) {
    invalidRequest("validUntil");
  }
  const evidenceUri = boundedTextField(body.evidenceUri, "evidenceUri", 8, 2_048);
  if (!URI_SCHEME.test(evidenceUri) || hasControlCharacter(evidenceUri)) {
    invalidRequest("evidenceUri");
  }
  return Object.freeze({
    workspaceId: uuidField(body.workspaceId, "workspaceId"),
    evidenceType: enumField(body.evidenceType, "evidenceType", RELATIONSHIP_EVIDENCE_TYPES),
    evidenceUri,
    sourceSha256: patternField(body.sourceSha256, "sourceSha256", SHA256),
    locator: jsonObjectField(body.locator, "locator", true),
    observedAt: instantField(body.observedAt, "observedAt"),
    validFrom,
    validUntil,
  });
}

export function parseRelationshipEvidenceLinkCommand(
  raw: unknown,
): RelationshipEvidenceLinkCommand {
  const body = requestObject(raw);
  assertOnlyFields(body, LINK_FIELDS);
  return Object.freeze({
    workspaceId: uuidField(body.workspaceId, "workspaceId"),
    evidenceId: uuidField(body.evidenceId, "evidenceId"),
    evidenceRole: enumField(body.evidenceRole, "evidenceRole", RELATIONSHIP_EVIDENCE_ROLES),
    rationale: boundedTextField(body.rationale, "rationale", 10, 2_000),
    linkedAt: instantField(body.linkedAt, "linkedAt"),
  });
}

export function parseRelationshipDecisionCommand(raw: unknown): RelationshipDecisionCommand {
  const body = requestObject(raw);
  assertOnlyFields(body, DECISION_FIELDS);
  return Object.freeze({
    workspaceId: uuidField(body.workspaceId, "workspaceId"),
    toStatus: enumField(body.toStatus, "toStatus", RELATIONSHIP_DECISION_STATUSES),
    reason: boundedTextField(body.reason, "reason", 10, 2_000),
    effectiveAt: instantField(body.effectiveAt, "effectiveAt"),
  });
}

export function parseRelationshipStatusQuery(
  raw: Readonly<Record<string, unknown>>,
): RelationshipStatusQuery {
  assertOnlyFields(raw, STATUS_QUERY_FIELDS);
  return Object.freeze({
    workspaceId: uuidField(raw.workspaceId, "workspaceId"),
    effectiveAt: instantField(raw.effectiveAt, "effectiveAt"),
    systemAt: instantField(raw.systemAt, "systemAt"),
  });
}

export function parseRelationshipResourceId(value: unknown, field: string): string {
  return uuidField(value, field);
}

@Injectable()
export class RelationshipGraphService {
  constructor(
    @Inject(PostgresRuntime) private readonly database: PostgresRuntime,
    @Inject(WorkspaceAccessService) private readonly workspaceAccess: WorkspaceAccessService,
    @Inject(GovernedAuthorizationService)
    private readonly authorization: GovernedAuthorizationService,
  ) {}

  async authorEndpoint(
    principal: Principal,
    endpointIdValue: string,
    command: RelationshipEndpointCommand,
  ): Promise<RelationshipWriteReceipt> {
    const endpointId = uuidField(endpointIdValue, "endpointId");
    return this.mutate(principal, command.workspaceId, false, async (transaction) => {
      const result = await transaction.query<IdentifierRow>(CREATE_ENDPOINT_SQL, [
        endpointId,
        command.workspaceId,
        command.endpointType,
        command.canonicalKey,
        command.displayName,
        command.referenceType,
        command.referenceId,
      ]);
      return writeReceipt("relationship_endpoint", endpointId, result);
    });
  }

  async authorClaim(
    principal: Principal,
    claimIdValue: string,
    command: RelationshipClaimCommand,
  ): Promise<RelationshipWriteReceipt> {
    const claimId = uuidField(claimIdValue, "claimId");
    return this.mutate(principal, command.workspaceId, false, async (transaction) => {
      const result = await transaction.query<IdentifierRow>(CREATE_CLAIM_SQL, [
        claimId,
        command.workspaceId,
        command.fromEndpointId,
        command.toEndpointId,
        command.relationshipType,
        command.claimKind,
        command.causalClassification,
        command.discoveryMethod,
        command.hypothesisSourceClaimId,
        command.supersedesClaimId,
        command.methodSpecification,
        command.scope,
        command.assumptions,
        command.uncertainty,
        command.confidence,
        command.effectDirection,
        command.effectStrength,
        command.lagMinSeconds,
        command.lagMaxSeconds,
        command.regimeScope,
        command.geographicScope,
        command.validFrom,
        command.validUntil,
        command.discoveredAt,
      ]);
      return writeReceipt("relationship_claim", claimId, result);
    });
  }

  async addEvidence(
    principal: Principal,
    evidenceIdValue: string,
    command: RelationshipEvidenceCommand,
  ): Promise<RelationshipWriteReceipt> {
    const evidenceId = uuidField(evidenceIdValue, "evidenceId");
    return this.mutate(principal, command.workspaceId, false, async (transaction) => {
      const result = await transaction.query<IdentifierRow>(CREATE_EVIDENCE_SQL, [
        evidenceId,
        command.workspaceId,
        command.evidenceType,
        command.evidenceUri,
        command.sourceSha256,
        command.locator,
        command.observedAt,
        command.validFrom,
        command.validUntil,
      ]);
      return writeReceipt("relationship_evidence", evidenceId, result);
    });
  }

  async linkEvidence(
    principal: Principal,
    claimIdValue: string,
    linkIdValue: string,
    command: RelationshipEvidenceLinkCommand,
  ): Promise<RelationshipWriteReceipt> {
    const claimId = uuidField(claimIdValue, "claimId");
    const linkId = uuidField(linkIdValue, "linkId");
    return this.mutate(principal, command.workspaceId, true, async (transaction) => {
      const result = await transaction.query<IdentifierRow>(LINK_EVIDENCE_SQL, [
        linkId,
        claimId,
        command.evidenceId,
        command.evidenceRole,
        command.rationale,
        command.linkedAt,
      ]);
      return writeReceipt("relationship_evidence_link", linkId, result);
    });
  }

  async decide(
    principal: Principal,
    claimIdValue: string,
    decisionIdValue: string,
    command: RelationshipDecisionCommand,
  ): Promise<RelationshipWriteReceipt> {
    const claimId = uuidField(claimIdValue, "claimId");
    const decisionId = uuidField(decisionIdValue, "decisionId");
    return this.mutate(principal, command.workspaceId, true, async (transaction) => {
      const result = await transaction.query<IdentifierRow>(RECORD_DECISION_SQL, [
        decisionId,
        claimId,
        command.toStatus,
        command.reason,
        command.effectiveAt,
      ]);
      return writeReceipt("relationship_decision", decisionId, result);
    });
  }

  async status(
    principal: Principal,
    claimIdValue: string,
    query: RelationshipStatusQuery,
  ): Promise<RelationshipClaimStatus> {
    const claimId = uuidField(claimIdValue, "claimId");
    try {
      return await this.database.withPrincipal(principal, async (transaction) => {
        await this.authorize(principal, query.workspaceId, "read", transaction);
        const result = await transaction.query<StatusRow>(RESOLVE_STATUS_SQL, [
          claimId,
          query.effectiveAt,
          query.systemAt,
        ]);
        if (result.rows.length === 0) throw resourceNotFound();
        if (result.rows.length !== 1) throw invalidDatabaseContract("status row count");
        const row = result.rows[0];
        if (!row) throw invalidDatabaseContract("status row");
        return mapStatus(row, query);
      });
    } catch (error) {
      throw publicGraphError(error, true);
    }
  }

  private async mutate(
    principal: Principal,
    workspaceId: string,
    targetScoped: boolean,
    operation: (transaction: TenantTransaction) => Promise<RelationshipWriteReceipt>,
  ): Promise<RelationshipWriteReceipt> {
    try {
      return await this.database.withPrincipalMutation(principal, async (transaction) => {
        await this.authorize(principal, workspaceId, "write", transaction);
        return operation(transaction);
      });
    } catch (error) {
      throw publicGraphError(error, targetScoped);
    }
  }

  private async authorize(
    principal: Principal,
    workspaceId: string,
    access: "read" | "write",
    transaction: TenantTransaction,
  ): Promise<void> {
    await this.workspaceAccess.assertMembership(principal, workspaceId, transaction);
    await this.authorization.assertRelationshipWorkspaceAccess(
      principal,
      workspaceId,
      access,
      transaction,
    );
  }
}

const CREATE_ENDPOINT_SQL = `
  SELECT evidence.create_relationship_endpoint(
    $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::text, $7::uuid
  )::text AS result_id
`;

const CREATE_CLAIM_SQL = `
  SELECT evidence.create_relationship_claim(
    $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::text,
    $7::text, $8::text, $9::uuid, $10::uuid, $11::jsonb, $12::jsonb,
    $13::jsonb, $14::jsonb, $15::numeric, $16::text, $17::numeric,
    $18::bigint, $19::bigint, $20::jsonb, $21::jsonb, $22::timestamptz,
    $23::timestamptz, $24::timestamptz
  )::text AS result_id
`;

const CREATE_EVIDENCE_SQL = `
  SELECT evidence.create_relationship_evidence(
    $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::jsonb,
    $7::timestamptz, $8::timestamptz, $9::timestamptz
  )::text AS result_id
`;

const LINK_EVIDENCE_SQL = `
  SELECT evidence.link_relationship_evidence(
    $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::timestamptz
  )::text AS result_id
`;

const RECORD_DECISION_SQL = `
  SELECT evidence.record_relationship_claim_decision(
    $1::uuid, $2::uuid, $3::text, $4::text, $5::timestamptz
  )::text AS result_id
`;

const RESOLVE_STATUS_SQL = `
  SELECT
    resolved_claim_id::text,
    root_claim_id::text,
    from_endpoint_id::text,
    to_endpoint_id::text,
    relationship_type,
    claim_kind,
    causal_classification,
    status,
    to_char(valid_from AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS valid_from,
    CASE WHEN valid_until IS NULL THEN NULL ELSE
      to_char(valid_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    END AS valid_until,
    to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS recorded_at,
    claim_sha256,
    decision_id::text,
    decision_sha256
  FROM evidence.relationship_claim_status_at($1::uuid, $2::timestamptz, $3::timestamptz)
`;

function writeReceipt(
  resource: RelationshipResource,
  expectedId: string,
  result: QueryResult<IdentifierRow>,
): RelationshipWriteReceipt {
  if (result.rows.length !== 1) throw invalidDatabaseContract(`${resource} row count`);
  const actualId = databaseUuid(result.rows[0]?.result_id, "result_id");
  if (actualId !== expectedId) throw invalidDatabaseContract(`${resource} identity`);
  return Object.freeze({ resource, id: actualId });
}

function mapStatus(row: StatusRow, query: RelationshipStatusQuery): RelationshipClaimStatus {
  const claimKind = databaseEnum(row.claim_kind, "claim_kind", RELATIONSHIP_CLAIM_KINDS);
  const causalClassification = databaseEnum(
    row.causal_classification,
    "causal_classification",
    RELATIONSHIP_CAUSAL_CLASSIFICATIONS,
  );
  validateClaimClassification(claimKind, causalClassification);
  const validFrom = databaseInstant(row.valid_from, "valid_from");
  const validUntil = databaseNullableInstant(row.valid_until, "valid_until");
  if (validUntil !== null && compareInstants(validFrom, validUntil) >= 0) {
    throw invalidDatabaseContract("valid_until");
  }
  return Object.freeze({
    resolvedClaimId: databaseUuid(row.resolved_claim_id, "resolved_claim_id"),
    rootClaimId: databaseUuid(row.root_claim_id, "root_claim_id"),
    fromEndpointId: databaseUuid(row.from_endpoint_id, "from_endpoint_id"),
    toEndpointId: databaseUuid(row.to_endpoint_id, "to_endpoint_id"),
    relationshipType: databaseEnum(
      row.relationship_type,
      "relationship_type",
      GOVERNED_RELATIONSHIP_TYPES,
    ),
    claimKind,
    causalClassification,
    status: databaseEnum(row.status, "status", RELATIONSHIP_RESOLVED_STATUSES),
    validFrom,
    validUntil,
    recordedAt: databaseInstant(row.recorded_at, "recorded_at"),
    claimSha256: databasePattern(row.claim_sha256, "claim_sha256", SHA256),
    decisionId: databaseUuid(row.decision_id, "decision_id"),
    decisionSha256: databasePattern(row.decision_sha256, "decision_sha256", SHA256),
    effectiveAt: query.effectiveAt,
    systemAt: query.systemAt,
  });
}

function validReferenceBinding(
  endpointType: EndpointType,
  referenceType: ReferenceType,
  referenceId: string | null,
): boolean {
  if (referenceType === "workspace_native") return referenceId === null;
  if (referenceId === null) return false;
  if (referenceType === "geography") {
    return endpointType === "country" || endpointType === "region" || endpointType === "city";
  }
  if (referenceType === "concept") return endpointType === "economic_concept";
  return endpointType === "economic_indicator";
}

function validateClaimSemantics(
  claimKind: ClaimKind,
  classification: CausalClassification,
  discoveryMethod: DiscoveryMethod,
  method: JsonObject,
  assumptions: readonly JsonValue[],
): void {
  validateClaimClassification(claimKind, classification, true);
  const expectedMethod: Partial<Record<CausalClassification, DiscoveryMethod>> = {
    predictive_relationship: "predictive_model",
    econometrically_estimated_causal_relationship: "econometric_identification",
    structurally_assumed_relationship: "structural_model",
    expert_defined_relationship: "expert_judgment",
    simulation_assumption: "simulation",
  };
  const requiredMethod = expectedMethod[classification];
  if (requiredMethod !== undefined && requiredMethod !== discoveryMethod) {
    invalidRequest("discoveryMethod");
  }
  const name = method.name;
  if (typeof name !== "string" || name.length === 0 || name.length > 300 || name.trim() !== name) {
    invalidRequest("methodSpecification.name");
  }
  if (claimKind === "causal") {
    const identificationStrategy = method.identificationStrategy;
    if (
      discoveryMethod === "causal_discovery" ||
      assumptions.length === 0 ||
      typeof identificationStrategy !== "string" ||
      identificationStrategy.length === 0 ||
      identificationStrategy.length > 300 ||
      identificationStrategy.trim() !== identificationStrategy
    ) {
      invalidRequest("methodSpecification.identificationStrategy");
    }
  }
}

function validateClaimClassification(
  claimKind: ClaimKind,
  classification: CausalClassification,
  request = false,
): void {
  const valid =
    (claimKind === "association" &&
      (classification === "observed_association" ||
        classification === "predictive_relationship")) ||
    (claimKind === "causal_hypothesis" && classification === "hypothesized_causal_pathway") ||
    (claimKind === "causal" &&
      (classification === "econometrically_estimated_causal_relationship" ||
        classification === "structurally_assumed_relationship" ||
        classification === "expert_defined_relationship" ||
        classification === "simulation_assumption"));
  if (!valid) {
    if (request) invalidRequest("causalClassification");
    throw invalidDatabaseContract("causal_classification");
  }
}

function requestObject(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) return invalidRequest("body");
  return value;
}

function assertOnlyFields(
  raw: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
): void {
  const unexpected = Object.keys(raw).find((key) => !allowed.has(key));
  if (unexpected !== undefined) invalidRequest(unexpected);
}

function uuidField(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value)) return invalidRequest(field);
  return value.toLowerCase();
}

function nullableUuidField(value: unknown, field: string): string | null {
  if (value === null) return null;
  return uuidField(value, field);
}

function boundedTextField(value: unknown, field: string, minimum: number, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    value.trim() !== value
  ) {
    return invalidRequest(field);
  }
  return value;
}

function patternField(value: unknown, field: string, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) return invalidRequest(field);
  return value;
}

function enumField<const Values extends readonly string[]>(
  value: unknown,
  field: string,
  values: Values,
): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) return invalidRequest(field);
  return value as Values[number];
}

function probabilityField(value: unknown, field: string): string {
  return patternField(value, field, PROBABILITY);
}

function nullableProbabilityField(value: unknown, field: string): string | null {
  return value === null ? null : probabilityField(value, field);
}

function nullableIntegerField(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    return invalidRequest(field);
  }
  return value as number;
}

function instantField(value: unknown, field: string): string {
  if (typeof value !== "string") return invalidRequest(field);
  try {
    return assertIsoInstant(value, field);
  } catch {
    return invalidRequest(field);
  }
}

function nullableInstantField(value: unknown, field: string): string | null {
  return value === null ? null : instantField(value, field);
}

function compareInstants(left: string, right: string): number {
  const leftKey = instantKey(left);
  const rightKey = instantKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function instantKey(value: string): bigint {
  const [seconds = "", fraction = ""] = value.slice(0, -1).split(".");
  const milliseconds = Date.parse(`${seconds}Z`);
  if (!Number.isFinite(milliseconds)) return invalidRequest("instant");
  return BigInt(milliseconds) * 1_000_000n + BigInt(fraction.padEnd(9, "0"));
}

function jsonObjectField(value: unknown, field: string, nonEmpty: boolean): JsonObject {
  if (!isRecord(value) || (nonEmpty && Object.keys(value).length === 0)) {
    return invalidRequest(field);
  }
  const budget = { nodes: 0 };
  const normalized = normalizeJson(value, field, 0, budget);
  if (!isRecord(normalized)) return invalidRequest(field);
  assertJsonBytes(normalized, field);
  return normalized as JsonObject;
}

function jsonArrayField(value: unknown, field: string, maximum: number): readonly JsonValue[] {
  if (!Array.isArray(value) || value.length > maximum) return invalidRequest(field);
  const budget = { nodes: 0 };
  const normalized = normalizeJson(value, field, 0, budget);
  if (!Array.isArray(normalized)) return invalidRequest(field);
  assertJsonBytes(normalized, field);
  return normalized;
}

function normalizeJson(
  value: unknown,
  field: string,
  depth: number,
  budget: { nodes: number },
): JsonValue {
  budget.nodes += 1;
  if (depth > MAX_JSON_DEPTH || budget.nodes > MAX_JSON_NODES) return invalidRequest(field);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > MAX_JSON_STRING) return invalidRequest(field);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
      return invalidRequest(field);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 128) return invalidRequest(field);
    return Object.freeze(
      value.map((item, index) => normalizeJson(item, `${field}[${index}]`, depth + 1, budget)),
    );
  }
  if (!isRecord(value)) return invalidRequest(field);
  const entries = Object.entries(value);
  if (entries.length > 128) return invalidRequest(field);
  const normalized: Record<string, JsonValue> = {};
  for (const [key, item] of entries) {
    if (
      key.length === 0 ||
      key.length > 128 ||
      key === "__proto__" ||
      key === "constructor" ||
      key === "prototype"
    ) {
      invalidRequest(field);
    }
    normalized[key] = normalizeJson(item, `${field}.${key}`, depth + 1, budget);
  }
  return Object.freeze(normalized);
}

function assertJsonBytes(value: JsonValue, field: string): void {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_JSON_BYTES) invalidRequest(field);
}

function databaseUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw invalidDatabaseContract(field);
  return value.toLowerCase();
}

function databasePattern(value: unknown, field: string, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) throw invalidDatabaseContract(field);
  return value;
}

function databaseEnum<const Values extends readonly string[]>(
  value: unknown,
  field: string,
  values: Values,
): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw invalidDatabaseContract(field);
  }
  return value as Values[number];
}

function databaseInstant(value: unknown, field: string): string {
  if (typeof value !== "string") throw invalidDatabaseContract(field);
  try {
    return assertIsoInstant(value, field);
  } catch {
    throw invalidDatabaseContract(field);
  }
}

function databaseNullableInstant(value: unknown, field: string): string | null {
  return value === null ? null : databaseInstant(value, field);
}

function invalidDatabaseContract(field: string): Error {
  return new Error(`Relationship graph database contract is invalid at ${field}`);
}

function publicGraphError(error: unknown, targetScoped: boolean): unknown {
  if (error instanceof HttpException) return error;
  const code = databaseErrorCode(error);
  if (code === "42501") {
    return targetScoped
      ? resourceNotFound()
      : new ForbiddenException({ code: "RELATIONSHIP_ACCESS_DENIED" });
  }
  if (code === "23503") return resourceNotFound();
  if (code === "22023" || code === "22P02" || code === "22003") {
    return new BadRequestException({ code: "RELATIONSHIP_COMMAND_INVALID" });
  }
  if (code === "23505" || code === "23514" || code === "40001" || code === "40P01") {
    return new ConflictException({ code: "RELATIONSHIP_STATE_CONFLICT" });
  }
  return error;
}

function databaseErrorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

function resourceNotFound(): NotFoundException {
  return new NotFoundException({ code: "RELATIONSHIP_RESOURCE_NOT_FOUND" });
}

function invalidRequest(field: string): never {
  throw new BadRequestException({
    code: "INVALID_RELATIONSHIP_GRAPH_REQUEST",
    errors: [{ path: field, code: "INVALID" }],
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}
