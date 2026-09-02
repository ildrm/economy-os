import {
  assertCapitalAllocationManifestIntegrity,
  assertCountryComparisonIntegrity,
  type CapitalAllocationManifest,
  type CountryComparison,
} from "@economyos/capital-allocation";
import { assertIsoInstant, type Principal } from "@economyos/contracts";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PostgresRuntime, type TenantTransaction } from "./database.js";
import { GovernedAuthorizationService } from "./governed-authorization.js";
import { WorkspaceAccessService } from "./workspaces.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const QUERY_FIELDS = new Set(["workspaceId"]);

export interface CapitalResearchQuery {
  readonly workspaceId: string;
}

export interface CapitalResearchAssessment {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly assessmentId: string;
  readonly countryId: string;
  readonly countryCode: string;
  readonly strategyKey: string;
  readonly asOf: string;
  readonly modelArtifactId: string;
  readonly modelArtifactSha256: string;
  readonly completionId: string;
  readonly manifestSha256: string;
  readonly manifest: CapitalAllocationManifest;
}

export interface CapitalCountryComparison {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly comparisonId: string;
  readonly referenceCountryId: string;
  readonly assetClass: string;
  readonly strategyKey: string;
  readonly createdAt: string;
  readonly manifestSha256: string;
  readonly comparison: CountryComparison;
}

interface AssessmentRow extends Record<string, unknown> {
  readonly assessment_id: unknown;
  readonly country_id: unknown;
  readonly country_code: unknown;
  readonly strategy_key: unknown;
  readonly as_of: unknown;
  readonly model_artifact_id: unknown;
  readonly model_artifact_sha256: unknown;
  readonly completion_id: unknown;
  readonly assessment_manifest: unknown;
  readonly manifest_sha256: unknown;
}

interface ComparisonRow extends Record<string, unknown> {
  readonly comparison_id: unknown;
  readonly reference_country_id: unknown;
  readonly asset_class: unknown;
  readonly strategy_key: unknown;
  readonly created_at: unknown;
  readonly comparison_manifest: unknown;
  readonly manifest_sha256: unknown;
}

export function parseCapitalResearchQuery(
  raw: Readonly<Record<string, unknown>>,
): CapitalResearchQuery {
  for (const key of Object.keys(raw)) {
    if (!QUERY_FIELDS.has(key)) throw invalidRequest(key);
  }
  return Object.freeze({ workspaceId: requestUuid(raw.workspaceId, "workspaceId") });
}

@Injectable()
export class CapitalResearchService {
  constructor(
    @Inject(PostgresRuntime) private readonly database: PostgresRuntime,
    @Inject(WorkspaceAccessService) private readonly workspaceAccess: WorkspaceAccessService,
    @Inject(GovernedAuthorizationService)
    private readonly authorization: GovernedAuthorizationService,
  ) {}

  async getAssessment(
    principal: Principal,
    requestedAssessmentId: string,
    query: CapitalResearchQuery,
  ): Promise<CapitalResearchAssessment> {
    const assessmentId = requestUuid(requestedAssessmentId, "assessmentId");
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.assertAccess(principal, query.workspaceId, transaction);
      const result = await transaction.query<AssessmentRow>(GET_ASSESSMENT_SQL, [
        query.workspaceId,
        assessmentId,
      ]);
      if (result.rows.length > 1) {
        throw new Error("Capital assessment resolver returned multiple rows");
      }
      const row = result.rows[0];
      if (!row) throw assessmentNotFound();
      return mapAssessment(query.workspaceId, row);
    });
  }

  async getComparison(
    principal: Principal,
    requestedComparisonId: string,
    query: CapitalResearchQuery,
  ): Promise<CapitalCountryComparison> {
    const comparisonId = requestUuid(requestedComparisonId, "comparisonId");
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.assertAccess(principal, query.workspaceId, transaction);
      const result = await transaction.query<ComparisonRow>(GET_COMPARISON_SQL, [
        query.workspaceId,
        comparisonId,
      ]);
      if (result.rows.length > 1) {
        throw new Error("Capital comparison resolver returned multiple rows");
      }
      const row = result.rows[0];
      if (!row) throw comparisonNotFound();
      return mapComparison(query.workspaceId, row);
    });
  }

  private async assertAccess(
    principal: Principal,
    workspaceId: string,
    transaction: TenantTransaction,
  ): Promise<void> {
    await this.workspaceAccess.assertMembership(principal, workspaceId, transaction);
    await this.authorization.assertEconomicStateAccess(principal, workspaceId, transaction);
  }
}

const GET_ASSESSMENT_SQL = `
  SELECT
    assessment_id::text,
    country_id::text,
    country_code,
    strategy_key,
    to_char(as_of AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS as_of,
    model_artifact_id::text,
    model_artifact_sha256,
    completion_id::text,
    assessment_manifest,
    manifest_sha256
  FROM app.get_capital_research_assessment($1::uuid, $2::uuid)
`;

const GET_COMPARISON_SQL = `
  SELECT
    comparison_id::text,
    reference_country_id::text,
    asset_class,
    strategy_key,
    to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
    comparison_manifest,
    manifest_sha256
  FROM app.get_capital_country_comparison($1::uuid, $2::uuid)
`;

function mapAssessment(workspaceId: string, row: AssessmentRow): CapitalResearchAssessment {
  const assessmentId = databaseUuid(row.assessment_id, "assessment_id");
  const countryId = databaseUuid(row.country_id, "country_id");
  const countryCode = databaseString(row.country_code, "country_code", 2, 3);
  const strategyKey = databaseString(row.strategy_key, "strategy_key", 3, 128);
  const rowAsOf = databaseInstant(row.as_of, "as_of");
  const modelArtifactId = databaseUuid(row.model_artifact_id, "model_artifact_id");
  const modelArtifactSha256 = databaseSha256(row.model_artifact_sha256, "model_artifact_sha256");
  const completionId = databaseUuid(row.completion_id, "completion_id");
  const manifestSha256 = databaseSha256(row.manifest_sha256, "manifest_sha256");
  const manifest = capitalManifest(row.assessment_manifest, "assessment_manifest");
  if (
    manifest.manifestId !== assessmentId ||
    manifest.manifestSha256 !== manifestSha256 ||
    manifest.country.countryId !== countryId ||
    manifest.country.countryCode !== countryCode ||
    manifest.strategyKey !== strategyKey ||
    manifest.model.modelId !== modelArtifactId ||
    manifest.model.artifactSha256 !== modelArtifactSha256 ||
    !sameUtcInstant(manifest.pointInTime.asOf, rowAsOf)
  ) {
    throw invalidDatabaseValue("assessment_manifest.metadata");
  }
  return deepFreeze({
    schemaVersion: 1,
    workspaceId,
    assessmentId,
    countryId,
    countryCode,
    strategyKey,
    asOf: manifest.pointInTime.asOf,
    modelArtifactId,
    modelArtifactSha256,
    completionId,
    manifestSha256,
    manifest,
  });
}

function mapComparison(workspaceId: string, row: ComparisonRow): CapitalCountryComparison {
  const comparisonId = databaseUuid(row.comparison_id, "comparison_id");
  const referenceCountryId = databaseUuid(row.reference_country_id, "reference_country_id");
  const assetClass = databaseString(row.asset_class, "asset_class", 3, 64);
  const strategyKey = databaseString(row.strategy_key, "strategy_key", 3, 128);
  const createdAt = databaseInstant(row.created_at, "created_at");
  const manifestSha256 = databaseSha256(row.manifest_sha256, "manifest_sha256");
  const comparison = countryComparison(row.comparison_manifest, "comparison_manifest");
  if (
    comparison.comparisonId !== comparisonId ||
    comparison.manifestSha256 !== manifestSha256 ||
    comparison.referenceCountryId !== referenceCountryId ||
    comparison.assetClass !== assetClass ||
    comparison.strategyKey !== strategyKey
  ) {
    throw invalidDatabaseValue("comparison_manifest.metadata");
  }
  return deepFreeze({
    schemaVersion: 1,
    workspaceId,
    comparisonId,
    referenceCountryId,
    assetClass,
    strategyKey,
    createdAt,
    manifestSha256,
    comparison,
  });
}

function capitalManifest(value: unknown, field: string): CapitalAllocationManifest {
  if (!isPlainRecord(value)) throw invalidDatabaseValue(field);
  try {
    assertCapitalAllocationManifestIntegrity(value as unknown as CapitalAllocationManifest);
  } catch (error) {
    throw invalidDatabaseValue(field, error);
  }
  return value as unknown as CapitalAllocationManifest;
}

function countryComparison(value: unknown, field: string): CountryComparison {
  if (!isPlainRecord(value)) throw invalidDatabaseValue(field);
  try {
    assertCountryComparisonIntegrity(value as unknown as CountryComparison);
  } catch (error) {
    throw invalidDatabaseValue(field, error);
  }
  return value as unknown as CountryComparison;
}

function requestUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw invalidRequest(field);
  return value.toLowerCase();
}

function databaseUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw invalidDatabaseValue(field);
  return value.toLowerCase();
}

function databaseSha256(value: unknown, field: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) throw invalidDatabaseValue(field);
  return value;
}

function databaseString(
  value: unknown,
  field: string,
  minimumLength: number,
  maximumLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.length < minimumLength ||
    value.length > maximumLength ||
    value.trim() !== value
  ) {
    throw invalidDatabaseValue(field);
  }
  return value;
}

function databaseInstant(value: unknown, field: string): string {
  if (typeof value !== "string") throw invalidDatabaseValue(field);
  try {
    return assertIsoInstant(value, field);
  } catch (error) {
    throw invalidDatabaseValue(field, error);
  }
}

function sameUtcInstant(left: string, right: string): boolean {
  try {
    assertIsoInstant(left, "left instant");
    assertIsoInstant(right, "right instant");
  } catch {
    return false;
  }
  return instantKey(left) === instantKey(right);
}

function instantKey(value: string): string {
  const match = /^(?<whole>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(?<fraction>\d{1,9}))?Z$/.exec(
    value,
  );
  if (!match?.groups) return "";
  return `${match.groups.whole}.${(match.groups.fraction ?? "").padEnd(9, "0")}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function invalidRequest(field: string): never {
  throw new BadRequestException({
    type: "https://economyos.invalid/problems/invalid-capital-research-request",
    title: "Invalid capital research request",
    status: 400,
    code: "INVALID_CAPITAL_RESEARCH_REQUEST",
    field,
  });
}

function invalidDatabaseValue(field: string, cause?: unknown): Error {
  return new Error(`Capital research database contract violation: ${field}`, { cause });
}

function assessmentNotFound(): NotFoundException {
  return new NotFoundException({
    type: "https://economyos.invalid/problems/capital-assessment-not-found",
    title: "Capital research assessment not found",
    status: 404,
    code: "CAPITAL_ASSESSMENT_NOT_FOUND",
  });
}

function comparisonNotFound(): NotFoundException {
  return new NotFoundException({
    type: "https://economyos.invalid/problems/capital-comparison-not-found",
    title: "Capital research comparison not found",
    status: 404,
    code: "CAPITAL_COMPARISON_NOT_FOUND",
  });
}
