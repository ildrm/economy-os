/**
 * Serializable contracts shared with the Temporal workflow sandbox.
 *
 * Keep this module free of Node.js imports and side effects: workflow code imports
 * these declarations and must remain deterministic and bundle-safe.
 */

export type IngestionRunStatus = "pending" | "running" | "succeeded" | "failed" | "quarantined";

export type IngestionStage =
  | "start"
  | "fetch"
  | "persist_raw"
  | "parse"
  | "quality"
  | "quarantine"
  | "promote"
  | "lineage"
  | "reconcile"
  | "complete";

export type PitQuality = "true_vintage" | "reconstructed_only" | "latest_revised_only";

export interface WorldBankWdiConnectorInput {
  readonly type: "world-bank-wdi";
  readonly countryCode: string;
  readonly indicatorCode: string;
  readonly startYear: number;
  readonly endYear: number;
}

export interface ParserIdentity {
  readonly name: string;
  readonly version: string;
  readonly codeSha256: string;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly configurationSha256: string;
}

export interface QualityPolicy {
  readonly minimumCompleteness: number;
  readonly maximumRows: number;
  readonly requiredPitQuality: PitQuality;
  readonly allowEmptyPayload: boolean;
}

export type IngestionOrganizationScope =
  | { readonly type: "global" }
  | { readonly type: "tenant"; readonly organizationId: string };

export interface IngestionAuthorizationClaims {
  readonly schemaVersion: 1;
  readonly organizationScope: IngestionOrganizationScope;
  readonly datasetId: string;
  readonly seriesId: string;
  readonly connectorSha256: string;
  readonly parserSha256: string;
  readonly configurationSha256: string;
  readonly inputSha256: string;
  readonly runId: string;
  readonly workflowId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly nonce: string;
}

export interface IngestionAuthorizationEnvelope {
  readonly schemaVersion: 1;
  readonly algorithm: "hmac-sha256";
  readonly keyId: string;
  readonly claims: IngestionAuthorizationClaims;
  readonly signatureSha256: string;
}

export interface IngestionWorkflowInput {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly workflowId: string;
  readonly organizationId: string | null;
  readonly datasetId: string;
  readonly seriesId: string;
  /** A SHA-256 digest of the caller's private idempotency token. */
  readonly idempotencyKey: string;
  readonly inputSha256: string;
  readonly requestedAt: string;
  readonly connector: WorldBankWdiConnectorInput;
  readonly parser: ParserIdentity;
  readonly qualityPolicy: QualityPolicy;
  readonly authorization: IngestionAuthorizationEnvelope;
}

export interface LandedRawPayload {
  readonly payloadId: string;
  readonly requestUri: string;
  readonly objectUri: string;
  readonly objectKey: string;
  readonly mediaType: string;
  readonly checksumSha256: string;
  readonly byteLength: number;
  readonly fetchedAt: string;
  readonly providerRequestId: string | null;
}

export interface CandidateObservation {
  readonly countryCode: string;
  readonly indicatorCode: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly value: string | null;
  readonly missingReason: "source_missing" | null;
  readonly releaseTime: string | null;
  readonly availabilityTime: string | null;
  readonly retrievedAt: string;
  readonly pitQuality: PitQuality;
}

export interface LandingResult {
  readonly payloads: readonly LandedRawPayload[];
  readonly candidates: readonly CandidateObservation[];
  readonly candidateSha256: string;
}

export type QualityStatus = "pass" | "warn" | "fail";

export interface QualityResult {
  readonly checkCode: string;
  readonly status: QualityStatus;
  readonly weight: number;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface AdmissionDecision {
  readonly disposition: "promote" | "quarantine";
  readonly transformationRunId: string;
  readonly transformationConfigurationSha256: string;
  readonly releaseId: string;
  readonly score: number;
  readonly results: readonly QualityResult[];
  readonly reasons: readonly string[];
  readonly candidateSha256: string;
}

export interface PromotionResult {
  readonly transformationRunId: string;
  readonly releaseId: string;
  readonly observationIds: readonly string[];
  readonly observationSetSha256: string;
}

export interface ReconciliationResult {
  readonly expectedRows: number;
  readonly persistedRows: number;
  readonly missingPeriods: readonly string[];
  readonly unexpectedPeriods: readonly string[];
  readonly mismatchedPeriods: readonly string[];
  readonly checkpointSha256: string;
}

export interface IngestionOutputManifest {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly status: "succeeded" | "quarantined";
  readonly inputSha256: string;
  readonly rawPayloads: readonly Omit<LandedRawPayload, "objectKey">[];
  readonly candidateSha256: string;
  readonly transformationRunId: string;
  readonly releaseId: string | null;
  readonly observationIds: readonly string[];
  readonly observationSetSha256: string | null;
  readonly qualityScore: number;
  readonly qualityResults: readonly QualityResult[];
  readonly reconciliation: ReconciliationResult | null;
  readonly completedAt: string;
}

export interface IngestionWorkflowState {
  readonly runId: string;
  readonly status: IngestionRunStatus;
  readonly stage: IngestionStage;
  readonly attempt: number;
  readonly message: string;
}

export interface BeginRunResult {
  readonly disposition: "execute" | "return_existing";
  readonly status: IngestionRunStatus;
  readonly existingOutput: IngestionOutputManifest | null;
}

export interface RecordStageInput {
  readonly workflow: IngestionWorkflowInput;
  readonly expectedStatus: IngestionRunStatus;
  readonly nextStatus: IngestionRunStatus;
  readonly stage: IngestionStage;
  readonly attempt: number;
  readonly occurredAt: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly outputManifest?: IngestionOutputManifest;
  readonly errorCode?: string;
}

export interface IngestionActivities {
  beginRun(input: IngestionWorkflowInput): Promise<BeginRunResult>;
  recordStage(input: RecordStageInput): Promise<void>;
  fetchAndPersistRaw(input: IngestionWorkflowInput): Promise<LandingResult>;
  parseAndEvaluate(input: {
    readonly workflow: IngestionWorkflowInput;
    readonly landing: LandingResult;
  }): Promise<AdmissionDecision>;
  quarantine(input: {
    readonly workflow: IngestionWorkflowInput;
    readonly landing: LandingResult;
    readonly decision: AdmissionDecision;
  }): Promise<void>;
  promote(input: {
    readonly workflow: IngestionWorkflowInput;
    readonly landing: LandingResult;
    readonly decision: AdmissionDecision;
  }): Promise<PromotionResult>;
  writeLineage(input: {
    readonly workflow: IngestionWorkflowInput;
    readonly landing: LandingResult;
    readonly promotion: PromotionResult;
  }): Promise<void>;
  reconcileAndCheckpoint(input: {
    readonly workflow: IngestionWorkflowInput;
    readonly landing: LandingResult;
    readonly promotion: PromotionResult;
  }): Promise<ReconciliationResult>;
  failRun(input: {
    readonly workflow: IngestionWorkflowInput;
    readonly stage: IngestionStage;
    readonly attempt: number;
    readonly errorCode: string;
    readonly message: string;
    readonly occurredAt: string;
  }): Promise<void>;
}
