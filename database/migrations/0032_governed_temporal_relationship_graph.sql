-- Phase 5 PostgreSQL system of record for governed temporal relationship
-- claims. The graph projection is an immutable outbox; graph databases remain
-- derived read models and never become an approval or identity authority.

CREATE TABLE evidence.relationship_endpoints (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  endpoint_type text NOT NULL CHECK (endpoint_type IN (
    'country', 'region', 'city', 'government', 'central_bank',
    'financial_institution', 'bank', 'company', 'industry',
    'household_group', 'currency', 'commodity', 'asset', 'bond',
    'equity_index', 'economic_indicator', 'policy', 'law', 'tariff',
    'sanction', 'event', 'conflict', 'trade_route', 'port',
    'supply_chain', 'institution', 'economic_concept', 'crisis'
  )),
  canonical_key text NOT NULL CHECK (
    canonical_key ~ '^[a-z0-9][a-z0-9_.:-]{2,255}$'
  ),
  display_name text NOT NULL CHECK (
    length(btrim(display_name)) BETWEEN 1 AND 300
    AND display_name = btrim(display_name)
  ),
  reference_type text NOT NULL CHECK (
    reference_type IN ('workspace_native', 'geography', 'concept', 'series')
  ),
  reference_id uuid,
  created_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL CHECK (isfinite(created_at)),
  endpoint_manifest jsonb NOT NULL CHECK (jsonb_typeof(endpoint_manifest) = 'object'),
  endpoint_sha256 text NOT NULL CHECK (endpoint_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, canonical_key),
  UNIQUE (organization_id, workspace_id, id),
  CHECK (
    (reference_type = 'workspace_native' AND reference_id IS NULL)
    OR (reference_type <> 'workspace_native' AND reference_id IS NOT NULL)
  )
);

CREATE TABLE evidence.relationship_claims (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  root_claim_id uuid NOT NULL,
  supersedes_claim_id uuid,
  hypothesis_source_claim_id uuid,
  from_endpoint_id uuid NOT NULL,
  to_endpoint_id uuid NOT NULL,
  relationship_type text NOT NULL CHECK (relationship_type IN (
    'causes', 'contributes_to', 'affects', 'depends_on', 'exports_to',
    'imports_from', 'finances', 'owns', 'owes', 'lends_to',
    'borrows_from', 'regulates', 'controls', 'targets', 'transmits_to',
    'exposed_to', 'correlated_with', 'substitutes_for', 'complements',
    'competes_with'
  )),
  claim_kind text NOT NULL CHECK (
    claim_kind IN ('association', 'causal_hypothesis', 'causal')
  ),
  causal_classification text NOT NULL CHECK (causal_classification IN (
    'observed_association', 'predictive_relationship',
    'hypothesized_causal_pathway',
    'econometrically_estimated_causal_relationship',
    'structurally_assumed_relationship', 'expert_defined_relationship',
    'simulation_assumption'
  )),
  discovery_method text NOT NULL CHECK (discovery_method IN (
    'manual_review', 'descriptive_statistics', 'predictive_model',
    'causal_discovery', 'econometric_identification', 'structural_model',
    'expert_judgment', 'simulation'
  )),
  method_specification jsonb NOT NULL CHECK (
    jsonb_typeof(method_specification) = 'object'
  ),
  scope jsonb NOT NULL CHECK (jsonb_typeof(scope) = 'object'),
  assumptions jsonb NOT NULL CHECK (jsonb_typeof(assumptions) = 'array'),
  uncertainty jsonb NOT NULL CHECK (jsonb_typeof(uncertainty) = 'object'),
  confidence numeric NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  effect_direction text NOT NULL CHECK (
    effect_direction IN ('positive', 'negative', 'mixed', 'none', 'unknown')
  ),
  effect_strength numeric CHECK (effect_strength BETWEEN 0 AND 1),
  lag_min_seconds bigint,
  lag_max_seconds bigint,
  regime_scope jsonb NOT NULL CHECK (jsonb_typeof(regime_scope) = 'object'),
  geographic_scope jsonb NOT NULL CHECK (
    jsonb_typeof(geographic_scope) = 'object'
  ),
  valid_from timestamptz NOT NULL CHECK (isfinite(valid_from)),
  valid_until timestamptz CHECK (valid_until IS NULL OR isfinite(valid_until)),
  discovered_at timestamptz NOT NULL CHECK (isfinite(discovered_at)),
  owner_subject_id uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL CHECK (isfinite(recorded_at)),
  claim_manifest jsonb NOT NULL CHECK (jsonb_typeof(claim_manifest) = 'object'),
  claim_sha256 text NOT NULL CHECK (claim_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, from_endpoint_id)
    REFERENCES evidence.relationship_endpoints(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, to_endpoint_id)
    REFERENCES evidence.relationship_endpoints(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, root_claim_id)
    REFERENCES evidence.relationship_claims(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, supersedes_claim_id)
    REFERENCES evidence.relationship_claims(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, hypothesis_source_claim_id)
    REFERENCES evidence.relationship_claims(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, id),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK (
    (lag_min_seconds IS NULL AND lag_max_seconds IS NULL)
    OR (
      lag_min_seconds >= 0 AND lag_max_seconds >= lag_min_seconds
    )
  ),
  CHECK (supersedes_claim_id IS NULL OR supersedes_claim_id <> id),
  CHECK (hypothesis_source_claim_id IS NULL OR hypothesis_source_claim_id <> id),
  CHECK (
    (supersedes_claim_id IS NULL AND root_claim_id = id)
    OR supersedes_claim_id IS NOT NULL
  ),
  CHECK (
    (claim_kind = 'association' AND causal_classification IN (
      'observed_association', 'predictive_relationship'
    ))
    OR (
      claim_kind = 'causal_hypothesis'
      AND causal_classification = 'hypothesized_causal_pathway'
    )
    OR (claim_kind = 'causal' AND causal_classification IN (
      'econometrically_estimated_causal_relationship',
      'structurally_assumed_relationship', 'expert_defined_relationship',
      'simulation_assumption'
    ))
  )
);

CREATE UNIQUE INDEX relationship_claims_one_successor_idx
  ON evidence.relationship_claims (
    organization_id, workspace_id, supersedes_claim_id
  )
  WHERE supersedes_claim_id IS NOT NULL;

CREATE TABLE evidence.relationship_evidence (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  evidence_type text NOT NULL CHECK (evidence_type IN (
    'published_study', 'official_data', 'model_run', 'expert_review',
    'licensed_document', 'source_record', 'validation_report',
    'falsification_test', 'sensitivity_analysis'
  )),
  evidence_uri text NOT NULL CHECK (
    length(btrim(evidence_uri)) BETWEEN 8 AND 2048
    AND evidence_uri = btrim(evidence_uri)
  ),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  locator jsonb NOT NULL CHECK (jsonb_typeof(locator) = 'object'),
  observed_at timestamptz NOT NULL CHECK (isfinite(observed_at)),
  valid_from timestamptz NOT NULL CHECK (isfinite(valid_from)),
  valid_until timestamptz CHECK (valid_until IS NULL OR isfinite(valid_until)),
  created_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL CHECK (isfinite(recorded_at)),
  evidence_manifest jsonb NOT NULL CHECK (jsonb_typeof(evidence_manifest) = 'object'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, id),
  UNIQUE (organization_id, workspace_id, source_sha256, evidence_uri),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE TABLE evidence.relationship_evidence_links (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  claim_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  evidence_role text NOT NULL CHECK (
    evidence_role IN ('supports', 'contradicts', 'qualifies', 'identifies', 'validates')
  ),
  rationale text NOT NULL CHECK (
    length(btrim(rationale)) BETWEEN 10 AND 2000
    AND rationale = btrim(rationale)
  ),
  created_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  linked_at timestamptz NOT NULL CHECK (isfinite(linked_at)),
  recorded_at timestamptz NOT NULL CHECK (isfinite(recorded_at)),
  link_manifest jsonb NOT NULL CHECK (jsonb_typeof(link_manifest) = 'object'),
  link_sha256 text NOT NULL CHECK (link_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id, claim_id)
    REFERENCES evidence.relationship_claims(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, evidence_id)
    REFERENCES evidence.relationship_evidence(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, id),
  UNIQUE (organization_id, workspace_id, claim_id, evidence_id, evidence_role)
);

CREATE TABLE evidence.relationship_claim_decisions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  claim_id uuid NOT NULL,
  prior_decision_id uuid,
  from_status text,
  to_status text NOT NULL CHECK (
    to_status IN ('discovered', 'proposed', 'reviewed', 'approved', 'rejected', 'retired')
  ),
  reason text NOT NULL CHECK (
    length(btrim(reason)) BETWEEN 10 AND 2000 AND reason = btrim(reason)
  ),
  decided_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  effective_at timestamptz NOT NULL CHECK (isfinite(effective_at)),
  recorded_at timestamptz NOT NULL CHECK (isfinite(recorded_at)),
  decision_manifest jsonb NOT NULL CHECK (jsonb_typeof(decision_manifest) = 'object'),
  decision_sha256 text NOT NULL CHECK (decision_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id, claim_id)
    REFERENCES evidence.relationship_claims(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, prior_decision_id)
    REFERENCES evidence.relationship_claim_decisions(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, id),
  UNIQUE (organization_id, workspace_id, claim_id, effective_at),
  CHECK (
    (prior_decision_id IS NULL AND from_status IS NULL)
    OR (prior_decision_id IS NOT NULL AND from_status IS NOT NULL)
  ),
  CHECK (prior_decision_id IS NULL OR prior_decision_id <> id)
);

CREATE TABLE evidence.relationship_graph_projection_outbox (
  projection_event_id uuid PRIMARY KEY,
  event_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  claim_id uuid NOT NULL,
  decision_id uuid NOT NULL,
  projection_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(projection_manifest) = 'object'
  ),
  projection_sha256 text NOT NULL CHECK (projection_sha256 ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL CHECK (isfinite(occurred_at)),
  recorded_at timestamptz NOT NULL CHECK (isfinite(recorded_at)),
  FOREIGN KEY (organization_id, workspace_id, claim_id)
    REFERENCES evidence.relationship_claims(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, decision_id)
    REFERENCES evidence.relationship_claim_decisions(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, decision_id),
  UNIQUE (organization_id, workspace_id, projection_event_id)
);

CREATE TABLE evidence.relationship_graph_projection_receipts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  projection_event_id uuid NOT NULL,
  consumer text NOT NULL CHECK (
    consumer ~ '^[a-z][a-z0-9_.-]{2,127}$'
  ),
  attempt integer NOT NULL CHECK (attempt BETWEEN 1 AND 1000),
  status text NOT NULL CHECK (status IN ('succeeded', 'failed')),
  projected_sha256 text CHECK (
    projected_sha256 IS NULL OR projected_sha256 ~ '^[0-9a-f]{64}$'
  ),
  error_code text CHECK (
    error_code IS NULL OR error_code ~ '^[A-Z][A-Z0-9_]{1,127}$'
  ),
  error_message text CHECK (
    error_message IS NULL OR (
      length(btrim(error_message)) BETWEEN 1 AND 1000
      AND error_message = btrim(error_message)
    )
  ),
  occurred_at timestamptz NOT NULL CHECK (isfinite(occurred_at)),
  recorded_at timestamptz NOT NULL CHECK (isfinite(recorded_at)),
  receipt_manifest jsonb NOT NULL CHECK (jsonb_typeof(receipt_manifest) = 'object'),
  receipt_sha256 text NOT NULL CHECK (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id, projection_event_id)
    REFERENCES evidence.relationship_graph_projection_outbox(
      organization_id, workspace_id, projection_event_id
    ) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, projection_event_id, consumer, attempt),
  CHECK (
    (status = 'succeeded' AND projected_sha256 IS NOT NULL
      AND error_code IS NULL AND error_message IS NULL)
    OR (status = 'failed' AND projected_sha256 IS NULL
      AND error_code IS NOT NULL AND error_message IS NOT NULL)
  )
);

CREATE OR REPLACE FUNCTION evidence.relationship_graph_time_text(value timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT to_char(
    value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  )
$$;

CREATE OR REPLACE FUNCTION evidence.relationship_endpoint_manifest(
  requested_id uuid,
  requested_endpoint_type text,
  requested_canonical_key text,
  requested_display_name text,
  requested_reference_type text,
  requested_reference_id uuid,
  requested_created_by uuid,
  requested_created_at timestamptz
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, evidence
AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'endpointId', requested_id::text,
    'endpointType', requested_endpoint_type,
    'canonicalKey', requested_canonical_key,
    'displayName', requested_display_name,
    'referenceType', requested_reference_type,
    'referenceId', CASE WHEN requested_reference_id IS NULL
      THEN 'null'::jsonb ELSE to_jsonb(requested_reference_id::text) END,
    'createdBy', requested_created_by::text,
    'createdAt', evidence.relationship_graph_time_text(requested_created_at)
  )
$$;

CREATE OR REPLACE FUNCTION evidence.relationship_claim_manifest(
  claim evidence.relationship_claims
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, evidence
AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'claimId', claim.id::text,
    'rootClaimId', claim.root_claim_id::text,
    'supersedesClaimId', CASE WHEN claim.supersedes_claim_id IS NULL
      THEN 'null'::jsonb ELSE to_jsonb(claim.supersedes_claim_id::text) END,
    'hypothesisSourceClaimId', CASE WHEN claim.hypothesis_source_claim_id IS NULL
      THEN 'null'::jsonb ELSE to_jsonb(claim.hypothesis_source_claim_id::text) END,
    'fromEndpointId', claim.from_endpoint_id::text,
    'toEndpointId', claim.to_endpoint_id::text,
    'relationshipType', claim.relationship_type,
    'claimKind', claim.claim_kind,
    'causalClassification', claim.causal_classification,
    'discoveryMethod', claim.discovery_method,
    'method', claim.method_specification,
    'scope', claim.scope,
    'assumptions', claim.assumptions,
    'uncertainty', claim.uncertainty,
    'confidence', claim.confidence,
    'effectDirection', claim.effect_direction,
    'effectStrength', claim.effect_strength,
    'lagMinSeconds', claim.lag_min_seconds,
    'lagMaxSeconds', claim.lag_max_seconds,
    'regimeScope', claim.regime_scope,
    'geographicScope', claim.geographic_scope,
    'validFrom', evidence.relationship_graph_time_text(claim.valid_from),
    'validUntil', CASE WHEN claim.valid_until IS NULL THEN 'null'::jsonb
      ELSE to_jsonb(evidence.relationship_graph_time_text(claim.valid_until)) END,
    'discoveredAt', evidence.relationship_graph_time_text(claim.discovered_at),
    'ownerSubjectId', claim.owner_subject_id::text,
    'createdBy', claim.created_by::text,
    'recordedAt', evidence.relationship_graph_time_text(claim.recorded_at)
  )
$$;

CREATE OR REPLACE FUNCTION evidence.relationship_evidence_manifest(
  item evidence.relationship_evidence
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, evidence
AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'evidenceId', item.id::text,
    'evidenceType', item.evidence_type,
    'evidenceUri', item.evidence_uri,
    'sourceSha256', item.source_sha256,
    'locator', item.locator,
    'observedAt', evidence.relationship_graph_time_text(item.observed_at),
    'validFrom', evidence.relationship_graph_time_text(item.valid_from),
    'validUntil', CASE WHEN item.valid_until IS NULL THEN 'null'::jsonb
      ELSE to_jsonb(evidence.relationship_graph_time_text(item.valid_until)) END,
    'createdBy', item.created_by::text,
    'recordedAt', evidence.relationship_graph_time_text(item.recorded_at)
  )
$$;

CREATE OR REPLACE FUNCTION evidence.relationship_evidence_link_manifest(
  link evidence.relationship_evidence_links
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, evidence
AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'linkId', link.id::text,
    'claimId', link.claim_id::text,
    'evidenceId', link.evidence_id::text,
    'evidenceRole', link.evidence_role,
    'rationale', link.rationale,
    'createdBy', link.created_by::text,
    'linkedAt', evidence.relationship_graph_time_text(link.linked_at),
    'recordedAt', evidence.relationship_graph_time_text(link.recorded_at)
  )
$$;

CREATE OR REPLACE FUNCTION evidence.relationship_claim_decision_manifest(
  decision evidence.relationship_claim_decisions
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, evidence
AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'decisionId', decision.id::text,
    'claimId', decision.claim_id::text,
    'priorDecisionId', CASE WHEN decision.prior_decision_id IS NULL
      THEN 'null'::jsonb ELSE to_jsonb(decision.prior_decision_id::text) END,
    'fromStatus', CASE WHEN decision.from_status IS NULL
      THEN 'null'::jsonb ELSE to_jsonb(decision.from_status) END,
    'toStatus', decision.to_status,
    'reason', decision.reason,
    'decidedBy', decision.decided_by::text,
    'effectiveAt', evidence.relationship_graph_time_text(decision.effective_at),
    'recordedAt', evidence.relationship_graph_time_text(decision.recorded_at)
  )
$$;

CREATE OR REPLACE FUNCTION evidence.relationship_projection_manifest(
  requested_projection_event_id uuid,
  claim evidence.relationship_claims,
  decision evidence.relationship_claim_decisions,
  from_endpoint evidence.relationship_endpoints,
  to_endpoint evidence.relationship_endpoints
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'projectionEventId', requested_projection_event_id::text,
    'aggregateType', 'relationship_claim',
    'claimId', claim.id::text,
    'claimSha256', claim.claim_sha256,
    'decisionId', decision.id::text,
    'decisionSha256', decision.decision_sha256,
    'status', decision.to_status,
    'fromEndpoint', from_endpoint.endpoint_manifest,
    'fromEndpointSha256', from_endpoint.endpoint_sha256,
    'toEndpoint', to_endpoint.endpoint_manifest,
    'toEndpointSha256', to_endpoint.endpoint_sha256,
    'claim', claim.claim_manifest,
    'decision', decision.decision_manifest
  )
$$;

CREATE OR REPLACE FUNCTION evidence.relationship_projection_receipt_manifest(
  requested_receipt_id uuid,
  requested_projection_event_id uuid,
  requested_projection_sha256 text,
  requested_consumer text,
  requested_attempt integer,
  requested_status text,
  requested_projected_sha256 text,
  requested_error_code text,
  requested_error_message text,
  requested_occurred_at timestamptz,
  requested_recorded_at timestamptz
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, evidence
AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'receiptId', requested_receipt_id::text,
    'projectionEventId', requested_projection_event_id::text,
    'projectionSha256', requested_projection_sha256,
    'consumer', requested_consumer,
    'attempt', requested_attempt,
    'status', requested_status,
    'projectedSha256', CASE WHEN requested_projected_sha256 IS NULL
      THEN 'null'::jsonb ELSE to_jsonb(requested_projected_sha256) END,
    'errorCode', CASE WHEN requested_error_code IS NULL
      THEN 'null'::jsonb ELSE to_jsonb(requested_error_code) END,
    'errorMessage', CASE WHEN requested_error_message IS NULL
      THEN 'null'::jsonb ELSE to_jsonb(requested_error_message) END,
    'occurredAt', evidence.relationship_graph_time_text(requested_occurred_at),
    'recordedAt', evidence.relationship_graph_time_text(requested_recorded_at)
  )
$$;

CREATE OR REPLACE FUNCTION evidence.verify_relationship_endpoint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  expected_manifest jsonb;
  expected_sha text;
BEGIN
  IF NEW.created_at > clock_timestamp() + interval '1 minute' THEN
    RAISE EXCEPTION 'relationship endpoint cannot be future-recorded'
      USING ERRCODE = '23514';
  END IF;
  CASE NEW.reference_type
    WHEN 'workspace_native' THEN
      IF NEW.reference_id IS NOT NULL THEN
        RAISE EXCEPTION 'workspace-native endpoint cannot bind an external identity'
          USING ERRCODE = '23514';
      END IF;
    WHEN 'geography' THEN
      IF NEW.endpoint_type NOT IN ('country', 'region', 'city') OR NOT EXISTS (
        SELECT 1 FROM evidence.geographies geography
        WHERE geography.id = NEW.reference_id
      ) THEN
        RAISE EXCEPTION 'geographic relationship endpoint reference is invalid'
          USING ERRCODE = '23514';
      END IF;
    WHEN 'concept' THEN
      IF NEW.endpoint_type <> 'economic_concept' OR NOT EXISTS (
        SELECT 1 FROM evidence.concepts concept WHERE concept.id = NEW.reference_id
      ) THEN
        RAISE EXCEPTION 'concept relationship endpoint reference is invalid'
          USING ERRCODE = '23514';
      END IF;
    WHEN 'series' THEN
      IF NEW.endpoint_type <> 'economic_indicator' OR NOT EXISTS (
        SELECT 1 FROM evidence.series series
        WHERE series.id = NEW.reference_id
          AND (
            series.organization_id IS NULL
            OR series.organization_id = NEW.organization_id
          )
      ) THEN
        RAISE EXCEPTION 'series relationship endpoint reference is invalid'
          USING ERRCODE = '23514';
      END IF;
    ELSE
      RAISE EXCEPTION 'unsupported relationship endpoint reference type'
        USING ERRCODE = '23514';
  END CASE;
  expected_manifest := evidence.relationship_endpoint_manifest(
    NEW.id, NEW.endpoint_type, NEW.canonical_key, NEW.display_name,
    NEW.reference_type, NEW.reference_id, NEW.created_by, NEW.created_at
  );
  expected_sha := encode(digest(
    convert_to(evidence.canonical_json(expected_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  IF NEW.endpoint_manifest IS DISTINCT FROM expected_manifest
    OR NEW.endpoint_sha256 IS DISTINCT FROM expected_sha
  THEN
    RAISE EXCEPTION 'relationship endpoint manifest or digest is invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION evidence.verify_relationship_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  parent_claim evidence.relationship_claims%ROWTYPE;
  source_claim evidence.relationship_claims%ROWTYPE;
  expected_manifest jsonb;
  expected_sha text;
BEGIN
  IF NEW.recorded_at > clock_timestamp() + interval '1 minute'
    OR NEW.discovered_at > NEW.recorded_at + interval '1 minute'
    OR NEW.method_specification = '{}'::jsonb
    OR NEW.scope = '{}'::jsonb
    OR NEW.uncertainty = '{}'::jsonb
    OR jsonb_typeof(NEW.method_specification->'name') <> 'string'
    OR jsonb_typeof(NEW.uncertainty->'type') <> 'string'
  THEN
    RAISE EXCEPTION 'relationship claim method, scope, uncertainty, or time is incomplete'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.claim_kind = 'causal' AND (
    NEW.discovery_method = 'causal_discovery'
    OR jsonb_array_length(NEW.assumptions) = 0
    OR jsonb_typeof(NEW.method_specification->'identificationStrategy') <> 'string'
  ) THEN
    RAISE EXCEPTION 'causal claims require reviewed identification and explicit assumptions'
      USING ERRCODE = '23514';
  END IF;
  IF (
    NEW.causal_classification = 'predictive_relationship'
    AND NEW.discovery_method <> 'predictive_model'
  ) OR (
    NEW.causal_classification = 'econometrically_estimated_causal_relationship'
    AND NEW.discovery_method <> 'econometric_identification'
  ) OR (
    NEW.causal_classification = 'structurally_assumed_relationship'
    AND NEW.discovery_method <> 'structural_model'
  ) OR (
    NEW.causal_classification = 'expert_defined_relationship'
    AND NEW.discovery_method <> 'expert_judgment'
  ) OR (
    NEW.causal_classification = 'simulation_assumption'
    AND NEW.discovery_method <> 'simulation'
  ) THEN
    RAISE EXCEPTION 'relationship classification and method are inconsistent'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.supersedes_claim_id IS NULL THEN
    IF NEW.root_claim_id <> NEW.id THEN
      RAISE EXCEPTION 'initial relationship claim must be its own lineage root'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT * INTO parent_claim
    FROM evidence.relationship_claims candidate
    WHERE candidate.organization_id = NEW.organization_id
      AND candidate.workspace_id = NEW.workspace_id
      AND candidate.id = NEW.supersedes_claim_id;
    IF parent_claim.id IS NULL
      OR NEW.root_claim_id <> parent_claim.root_claim_id
      OR ROW(
        NEW.from_endpoint_id, NEW.to_endpoint_id, NEW.relationship_type,
        NEW.claim_kind, NEW.causal_classification,
        NEW.hypothesis_source_claim_id
      ) IS DISTINCT FROM ROW(
        parent_claim.from_endpoint_id, parent_claim.to_endpoint_id,
        parent_claim.relationship_type, parent_claim.claim_kind,
        parent_claim.causal_classification,
        parent_claim.hypothesis_source_claim_id
      )
      OR NEW.recorded_at <= parent_claim.recorded_at
    THEN
      RAISE EXCEPTION 'claim amendments must extend one immutable semantic lineage'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.hypothesis_source_claim_id IS NOT NULL THEN
    SELECT * INTO source_claim
    FROM evidence.relationship_claims candidate
    WHERE candidate.organization_id = NEW.organization_id
      AND candidate.workspace_id = NEW.workspace_id
      AND candidate.id = NEW.hypothesis_source_claim_id;
    IF source_claim.id IS NULL OR NEW.claim_kind = 'association'
      OR source_claim.claim_kind NOT IN ('association', 'causal_hypothesis')
    THEN
      RAISE EXCEPTION 'causal hypothesis provenance must reference a prior non-causal claim'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  expected_manifest := evidence.relationship_claim_manifest(NEW);
  expected_sha := encode(digest(
    convert_to(evidence.canonical_json(expected_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  IF NEW.claim_manifest IS DISTINCT FROM expected_manifest
    OR NEW.claim_sha256 IS DISTINCT FROM expected_sha
  THEN
    RAISE EXCEPTION 'relationship claim manifest or digest is invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION evidence.verify_relationship_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  expected_manifest jsonb;
  expected_sha text;
BEGIN
  IF NEW.recorded_at > clock_timestamp() + interval '1 minute'
    OR NEW.observed_at > NEW.recorded_at + interval '1 minute'
    OR NEW.locator = '{}'::jsonb
  THEN
    RAISE EXCEPTION 'relationship evidence time or locator is invalid'
      USING ERRCODE = '23514';
  END IF;
  expected_manifest := evidence.relationship_evidence_manifest(NEW);
  expected_sha := encode(digest(
    convert_to(evidence.canonical_json(expected_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  IF NEW.evidence_manifest IS DISTINCT FROM expected_manifest
    OR NEW.evidence_sha256 IS DISTINCT FROM expected_sha
  THEN
    RAISE EXCEPTION 'relationship evidence manifest or digest is invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION evidence.verify_relationship_evidence_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  claim_recorded_at timestamptz;
  evidence_recorded_at timestamptz;
  expected_manifest jsonb;
  expected_sha text;
BEGIN
  SELECT claim.recorded_at INTO claim_recorded_at
  FROM evidence.relationship_claims claim
  WHERE claim.organization_id = NEW.organization_id
    AND claim.workspace_id = NEW.workspace_id AND claim.id = NEW.claim_id;
  SELECT item.recorded_at INTO evidence_recorded_at
  FROM evidence.relationship_evidence item
  WHERE item.organization_id = NEW.organization_id
    AND item.workspace_id = NEW.workspace_id AND item.id = NEW.evidence_id;
  IF claim_recorded_at IS NULL OR evidence_recorded_at IS NULL
    OR NEW.recorded_at < greatest(claim_recorded_at, evidence_recorded_at)
    OR NEW.linked_at > NEW.recorded_at + interval '1 minute'
  THEN
    RAISE EXCEPTION 'relationship evidence link chronology or scope is invalid'
      USING ERRCODE = '23514';
  END IF;
  expected_manifest := evidence.relationship_evidence_link_manifest(NEW);
  expected_sha := encode(digest(
    convert_to(evidence.canonical_json(expected_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  IF NEW.link_manifest IS DISTINCT FROM expected_manifest
    OR NEW.link_sha256 IS DISTINCT FROM expected_sha
  THEN
    RAISE EXCEPTION 'relationship evidence link manifest or digest is invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION evidence.relationship_claim_transition_allowed(
  from_status text,
  to_status text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE from_status
    WHEN 'discovered' THEN to_status IN ('proposed', 'rejected')
    WHEN 'proposed' THEN to_status IN ('reviewed', 'rejected')
    WHEN 'reviewed' THEN to_status IN ('approved', 'rejected')
    WHEN 'approved' THEN to_status = 'retired'
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION evidence.verify_relationship_claim_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  claim evidence.relationship_claims%ROWTYPE;
  prior evidence.relationship_claim_decisions%ROWTYPE;
  expected_initial_status text;
  evidence_count integer;
  identification_count integer;
  expected_manifest jsonb;
  expected_sha text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.claim_id::text, 32033));
  SELECT * INTO claim
  FROM evidence.relationship_claims candidate
  WHERE candidate.organization_id = NEW.organization_id
    AND candidate.workspace_id = NEW.workspace_id
    AND candidate.id = NEW.claim_id;
  IF claim.id IS NULL OR NEW.recorded_at < claim.recorded_at
    OR NEW.recorded_at > clock_timestamp() + interval '1 minute'
    OR NEW.effective_at > clock_timestamp() + interval '1 minute'
  THEN
    RAISE EXCEPTION 'relationship decision claim or chronology is invalid'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO prior
  FROM evidence.relationship_claim_decisions candidate
  WHERE candidate.organization_id = NEW.organization_id
    AND candidate.workspace_id = NEW.workspace_id
    AND candidate.claim_id = NEW.claim_id
  ORDER BY candidate.effective_at DESC, candidate.recorded_at DESC, candidate.id DESC
  LIMIT 1;
  IF prior.id IS NULL THEN
    expected_initial_status := CASE
      WHEN claim.claim_kind = 'causal' THEN 'proposed'
      ELSE 'discovered'
    END;
    IF NEW.prior_decision_id IS NOT NULL OR NEW.from_status IS NOT NULL
      OR NEW.to_status <> expected_initial_status
      OR NEW.decided_by <> claim.created_by
      OR NEW.effective_at < claim.discovered_at
    THEN
      RAISE EXCEPTION 'relationship claim initial decision is invalid'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.prior_decision_id IS DISTINCT FROM prior.id
      OR NEW.from_status IS DISTINCT FROM prior.to_status
      OR NEW.effective_at <= prior.effective_at
      OR NOT evidence.relationship_claim_transition_allowed(
        prior.to_status, NEW.to_status
      )
    THEN
      RAISE EXCEPTION 'invalid relationship claim decision transition'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.to_status IN ('reviewed', 'approved') THEN
    SELECT
      count(*) FILTER (
        WHERE link.evidence_role IN ('supports', 'identifies', 'validates')
          AND link.linked_at <= NEW.effective_at
      ),
      count(*) FILTER (
        WHERE link.evidence_role IN ('identifies', 'validates')
          AND link.linked_at <= NEW.effective_at
          AND item.evidence_type IN (
            'published_study', 'validation_report', 'falsification_test',
            'sensitivity_analysis'
          )
      )
    INTO evidence_count, identification_count
    FROM evidence.relationship_evidence_links link
    JOIN evidence.relationship_evidence item
      ON item.organization_id = link.organization_id
      AND item.workspace_id = link.workspace_id
      AND item.id = link.evidence_id
    WHERE link.organization_id = claim.organization_id
      AND link.workspace_id = claim.workspace_id
      AND link.claim_id = claim.id
      AND link.recorded_at <= NEW.recorded_at;
    IF evidence_count = 0
      OR (claim.claim_kind = 'causal' AND identification_count = 0)
    THEN
      RAISE EXCEPTION 'relationship review lacks required immutable evidence'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.to_status = 'reviewed'
    AND NEW.decided_by IN (claim.owner_subject_id, claim.created_by)
  THEN
    RAISE EXCEPTION 'relationship review must be independent from claim ownership'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.to_status = 'approved' AND (
    NEW.decided_by IN (claim.owner_subject_id, claim.created_by)
    OR NEW.decided_by = prior.decided_by
  ) THEN
    RAISE EXCEPTION 'relationship approval requires an independent reviewer and approver'
      USING ERRCODE = '42501';
  END IF;

  expected_manifest := evidence.relationship_claim_decision_manifest(NEW);
  expected_sha := encode(digest(
    convert_to(evidence.canonical_json(expected_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  IF NEW.decision_manifest IS DISTINCT FROM expected_manifest
    OR NEW.decision_sha256 IS DISTINCT FROM expected_sha
  THEN
    RAISE EXCEPTION 'relationship decision manifest or digest is invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION evidence.verify_relationship_projection_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  claim evidence.relationship_claims%ROWTYPE;
  decision evidence.relationship_claim_decisions%ROWTYPE;
  source_endpoint evidence.relationship_endpoints%ROWTYPE;
  target_endpoint evidence.relationship_endpoints%ROWTYPE;
  expected_event_id uuid;
  expected_manifest jsonb;
  expected_sha text;
BEGIN
  SELECT * INTO claim FROM evidence.relationship_claims candidate
  WHERE candidate.organization_id = NEW.organization_id
    AND candidate.workspace_id = NEW.workspace_id AND candidate.id = NEW.claim_id;
  SELECT * INTO decision FROM evidence.relationship_claim_decisions candidate
  WHERE candidate.organization_id = NEW.organization_id
    AND candidate.workspace_id = NEW.workspace_id AND candidate.id = NEW.decision_id
    AND candidate.claim_id = NEW.claim_id;
  SELECT * INTO source_endpoint FROM evidence.relationship_endpoints candidate
  WHERE candidate.organization_id = NEW.organization_id
    AND candidate.workspace_id = NEW.workspace_id
    AND candidate.id = claim.from_endpoint_id;
  SELECT * INTO target_endpoint FROM evidence.relationship_endpoints candidate
  WHERE candidate.organization_id = NEW.organization_id
    AND candidate.workspace_id = NEW.workspace_id
    AND candidate.id = claim.to_endpoint_id;
  expected_event_id := evidence.deterministic_uuid_v8(
    'economyos:relationship-graph-projection:v1', NEW.decision_id::text
  );
  expected_manifest := evidence.relationship_projection_manifest(
    expected_event_id, claim, decision, source_endpoint, target_endpoint
  );
  expected_sha := encode(digest(
    convert_to(evidence.canonical_json(expected_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  IF claim.id IS NULL OR decision.id IS NULL OR source_endpoint.id IS NULL
    OR target_endpoint.id IS NULL
    OR NEW.projection_event_id <> expected_event_id
    OR NEW.occurred_at <> decision.effective_at
    OR NEW.recorded_at < decision.recorded_at
    OR NEW.projection_manifest IS DISTINCT FROM expected_manifest
    OR NEW.projection_sha256 IS DISTINCT FROM expected_sha
  THEN
    RAISE EXCEPTION 'relationship graph projection event is not canonical'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION evidence.record_relationship_projection_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  claim evidence.relationship_claims%ROWTYPE;
  source_endpoint evidence.relationship_endpoints%ROWTYPE;
  target_endpoint evidence.relationship_endpoints%ROWTYPE;
  projection_event_id uuid;
  record_time timestamptz := clock_timestamp();
  manifest jsonb;
BEGIN
  SELECT * INTO STRICT claim FROM evidence.relationship_claims WHERE id = NEW.claim_id;
  SELECT * INTO STRICT source_endpoint
  FROM evidence.relationship_endpoints WHERE id = claim.from_endpoint_id;
  SELECT * INTO STRICT target_endpoint
  FROM evidence.relationship_endpoints WHERE id = claim.to_endpoint_id;
  projection_event_id := evidence.deterministic_uuid_v8(
    'economyos:relationship-graph-projection:v1', NEW.id::text
  );
  manifest := evidence.relationship_projection_manifest(
    projection_event_id, claim, NEW, source_endpoint, target_endpoint
  );
  INSERT INTO evidence.relationship_graph_projection_outbox (
    projection_event_id, organization_id, workspace_id, claim_id, decision_id,
    projection_manifest, projection_sha256, occurred_at, recorded_at
  ) VALUES (
    projection_event_id, NEW.organization_id, NEW.workspace_id, NEW.claim_id,
    NEW.id, manifest,
    encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
    NEW.effective_at, record_time
  );
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION evidence.verify_relationship_projection_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  projection evidence.relationship_graph_projection_outbox%ROWTYPE;
  expected_id uuid;
  expected_manifest jsonb;
  expected_sha text;
BEGIN
  SELECT * INTO projection
  FROM evidence.relationship_graph_projection_outbox candidate
  WHERE candidate.organization_id = NEW.organization_id
    AND candidate.workspace_id = NEW.workspace_id
    AND candidate.projection_event_id = NEW.projection_event_id;
  expected_id := evidence.deterministic_uuid_v8(
    'economyos:relationship-graph-projection-receipt:v1',
    NEW.projection_event_id::text, NEW.consumer, NEW.attempt::text
  );
  expected_manifest := evidence.relationship_projection_receipt_manifest(
    expected_id, NEW.projection_event_id, projection.projection_sha256,
    NEW.consumer, NEW.attempt, NEW.status, NEW.projected_sha256,
    NEW.error_code, NEW.error_message, NEW.occurred_at, NEW.recorded_at
  );
  expected_sha := encode(digest(
    convert_to(evidence.canonical_json(expected_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  IF projection.projection_event_id IS NULL OR NEW.id <> expected_id
    OR NEW.occurred_at < projection.recorded_at
    OR NEW.recorded_at < NEW.occurred_at
    OR (NEW.status = 'succeeded'
      AND NEW.projected_sha256 <> projection.projection_sha256)
    OR NEW.receipt_manifest IS DISTINCT FROM expected_manifest
    OR NEW.receipt_sha256 IS DISTINCT FROM expected_sha
  THEN
    RAISE EXCEPTION 'relationship graph projection receipt is not canonical'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER relationship_endpoints_verify
BEFORE INSERT ON evidence.relationship_endpoints
FOR EACH ROW EXECUTE FUNCTION evidence.verify_relationship_endpoint();
CREATE TRIGGER relationship_endpoints_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.relationship_endpoints
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER relationship_claims_verify
BEFORE INSERT ON evidence.relationship_claims
FOR EACH ROW EXECUTE FUNCTION evidence.verify_relationship_claim();
CREATE TRIGGER relationship_claims_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.relationship_claims
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER relationship_evidence_verify
BEFORE INSERT ON evidence.relationship_evidence
FOR EACH ROW EXECUTE FUNCTION evidence.verify_relationship_evidence();
CREATE TRIGGER relationship_evidence_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.relationship_evidence
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER relationship_evidence_links_verify
BEFORE INSERT ON evidence.relationship_evidence_links
FOR EACH ROW EXECUTE FUNCTION evidence.verify_relationship_evidence_link();
CREATE TRIGGER relationship_evidence_links_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.relationship_evidence_links
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER relationship_claim_decisions_verify
BEFORE INSERT ON evidence.relationship_claim_decisions
FOR EACH ROW EXECUTE FUNCTION evidence.verify_relationship_claim_decision();
CREATE TRIGGER relationship_claim_decisions_project
AFTER INSERT ON evidence.relationship_claim_decisions
FOR EACH ROW EXECUTE FUNCTION evidence.record_relationship_projection_event();
CREATE TRIGGER relationship_claim_decisions_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.relationship_claim_decisions
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER relationship_projection_outbox_verify
BEFORE INSERT ON evidence.relationship_graph_projection_outbox
FOR EACH ROW EXECUTE FUNCTION evidence.verify_relationship_projection_event();
CREATE TRIGGER relationship_projection_outbox_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.relationship_graph_projection_outbox
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER relationship_projection_receipts_verify
BEFORE INSERT ON evidence.relationship_graph_projection_receipts
FOR EACH ROW EXECUTE FUNCTION evidence.verify_relationship_projection_receipt();
CREATE TRIGGER relationship_projection_receipts_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.relationship_graph_projection_receipts
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE OR REPLACE FUNCTION evidence.relationship_workspace_role_internal(
  requested_organization_id uuid,
  requested_workspace_id uuid,
  requested_subject_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT workspace_membership.role
  FROM app.workspace_memberships workspace_membership
  JOIN app.organization_memberships organization_membership
    ON organization_membership.organization_id = workspace_membership.organization_id
    AND organization_membership.subject_id = workspace_membership.subject_id
  JOIN app.subjects subject ON subject.id = workspace_membership.subject_id
  JOIN app.workspaces workspace
    ON workspace.organization_id = workspace_membership.organization_id
    AND workspace.id = workspace_membership.workspace_id
  JOIN app.organizations organization
    ON organization.id = workspace_membership.organization_id
  WHERE workspace_membership.organization_id = requested_organization_id
    AND workspace_membership.workspace_id = requested_workspace_id
    AND workspace_membership.subject_id = requested_subject_id
    AND workspace_membership.valid_from <= statement_timestamp()
    AND (
      workspace_membership.valid_until IS NULL
      OR workspace_membership.valid_until > statement_timestamp()
    )
    AND organization_membership.valid_from <= statement_timestamp()
    AND (
      organization_membership.valid_until IS NULL
      OR organization_membership.valid_until > statement_timestamp()
    )
    AND subject.status = 'active' AND workspace.status = 'active'
    AND organization.status = 'active'
$$;

CREATE OR REPLACE FUNCTION evidence.create_relationship_endpoint(
  requested_endpoint_id uuid,
  requested_workspace_id uuid,
  requested_endpoint_type text,
  requested_canonical_key text,
  requested_display_name text,
  requested_reference_type text,
  requested_reference_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  caller_role text;
  existing evidence.relationship_endpoints%ROWTYPE;
  record_time timestamptz := clock_timestamp();
  manifest jsonb;
BEGIN
  IF requested_endpoint_id IS NULL OR requested_workspace_id IS NULL
    OR requested_endpoint_type IS NULL OR requested_canonical_key IS NULL
    OR requested_display_name IS NULL OR requested_reference_type IS NULL
  THEN
    RAISE EXCEPTION 'invalid relationship endpoint input' USING ERRCODE = '22023';
  END IF;
  IF caller_organization_id IS NULL OR caller_subject_id IS NULL
    OR NOT evidence.economic_state_workspace_visible(
      caller_organization_id, requested_workspace_id
    )
  THEN
    RAISE EXCEPTION 'active tenant workspace membership is required'
      USING ERRCODE = '42501';
  END IF;
  caller_role := evidence.relationship_workspace_role_internal(
    caller_organization_id, requested_workspace_id, caller_subject_id
  );
  IF caller_role NOT IN ('analyst', 'steward', 'validator', 'admin') THEN
    RAISE EXCEPTION 'principal cannot create relationship endpoints'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO existing FROM evidence.relationship_endpoints candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.id = requested_endpoint_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(
      existing.endpoint_type, existing.canonical_key, existing.display_name,
      existing.reference_type, existing.reference_id, existing.created_by
    ) IS DISTINCT FROM ROW(
      requested_endpoint_type, requested_canonical_key, requested_display_name,
      requested_reference_type, requested_reference_id, caller_subject_id
    ) THEN
      RAISE EXCEPTION 'relationship endpoint replay changed its identity'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  manifest := evidence.relationship_endpoint_manifest(
    requested_endpoint_id, requested_endpoint_type, requested_canonical_key,
    requested_display_name, requested_reference_type, requested_reference_id,
    caller_subject_id, record_time
  );
  INSERT INTO evidence.relationship_endpoints (
    id, organization_id, workspace_id, endpoint_type, canonical_key,
    display_name, reference_type, reference_id, created_by, created_at,
    endpoint_manifest, endpoint_sha256
  ) VALUES (
    requested_endpoint_id, caller_organization_id, requested_workspace_id,
    requested_endpoint_type, requested_canonical_key, requested_display_name,
    requested_reference_type, requested_reference_id, caller_subject_id,
    record_time, manifest,
    encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex')
  );
  RETURN requested_endpoint_id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.create_relationship_claim(
  requested_claim_id uuid,
  requested_workspace_id uuid,
  requested_from_endpoint_id uuid,
  requested_to_endpoint_id uuid,
  requested_relationship_type text,
  requested_claim_kind text,
  requested_causal_classification text,
  requested_discovery_method text,
  requested_hypothesis_source_claim_id uuid,
  requested_supersedes_claim_id uuid,
  requested_method_specification jsonb,
  requested_scope jsonb,
  requested_assumptions jsonb,
  requested_uncertainty jsonb,
  requested_confidence numeric,
  requested_effect_direction text,
  requested_effect_strength numeric,
  requested_lag_min_seconds bigint,
  requested_lag_max_seconds bigint,
  requested_regime_scope jsonb,
  requested_geographic_scope jsonb,
  requested_valid_from timestamptz,
  requested_valid_until timestamptz,
  requested_discovered_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  caller_role text;
  existing evidence.relationship_claims%ROWTYPE;
  parent evidence.relationship_claims%ROWTYPE;
  claim evidence.relationship_claims%ROWTYPE;
  initial_decision evidence.relationship_claim_decisions%ROWTYPE;
  initial_status text;
  decision_id uuid;
  record_time timestamptz := clock_timestamp();
BEGIN
  IF requested_claim_id IS NULL OR requested_workspace_id IS NULL
    OR requested_from_endpoint_id IS NULL OR requested_to_endpoint_id IS NULL
    OR requested_relationship_type IS NULL OR requested_claim_kind IS NULL
    OR requested_causal_classification IS NULL OR requested_discovery_method IS NULL
    OR requested_method_specification IS NULL OR requested_scope IS NULL
    OR requested_assumptions IS NULL OR requested_uncertainty IS NULL
    OR requested_confidence IS NULL OR requested_effect_direction IS NULL
    OR requested_regime_scope IS NULL OR requested_geographic_scope IS NULL
    OR requested_valid_from IS NULL OR requested_discovered_at IS NULL
  THEN
    RAISE EXCEPTION 'invalid relationship claim input' USING ERRCODE = '22023';
  END IF;
  IF caller_organization_id IS NULL OR caller_subject_id IS NULL
    OR NOT evidence.economic_state_workspace_visible(
      caller_organization_id, requested_workspace_id
    )
  THEN
    RAISE EXCEPTION 'active tenant workspace membership is required'
      USING ERRCODE = '42501';
  END IF;
  caller_role := evidence.relationship_workspace_role_internal(
    caller_organization_id, requested_workspace_id, caller_subject_id
  );
  IF caller_role NOT IN ('analyst', 'steward', 'validator', 'admin') THEN
    RAISE EXCEPTION 'principal cannot create relationship claims'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO existing FROM evidence.relationship_claims candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.id = requested_claim_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(
      existing.from_endpoint_id, existing.to_endpoint_id,
      existing.relationship_type, existing.claim_kind,
      existing.causal_classification, existing.discovery_method,
      existing.hypothesis_source_claim_id, existing.supersedes_claim_id,
      existing.method_specification, existing.scope, existing.assumptions,
      existing.uncertainty, existing.confidence, existing.effect_direction,
      existing.effect_strength, existing.lag_min_seconds,
      existing.lag_max_seconds, existing.regime_scope,
      existing.geographic_scope, existing.valid_from, existing.valid_until,
      existing.discovered_at, existing.owner_subject_id, existing.created_by
    ) IS DISTINCT FROM ROW(
      requested_from_endpoint_id, requested_to_endpoint_id,
      requested_relationship_type, requested_claim_kind,
      requested_causal_classification, requested_discovery_method,
      requested_hypothesis_source_claim_id, requested_supersedes_claim_id,
      requested_method_specification, requested_scope, requested_assumptions,
      requested_uncertainty, requested_confidence, requested_effect_direction,
      requested_effect_strength, requested_lag_min_seconds,
      requested_lag_max_seconds, requested_regime_scope,
      requested_geographic_scope, requested_valid_from, requested_valid_until,
      requested_discovered_at, caller_subject_id, caller_subject_id
    ) THEN
      RAISE EXCEPTION 'relationship claim replay changed its identity'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  IF requested_supersedes_claim_id IS NOT NULL THEN
    SELECT * INTO parent FROM evidence.relationship_claims candidate
    WHERE candidate.organization_id = caller_organization_id
      AND candidate.workspace_id = requested_workspace_id
      AND candidate.id = requested_supersedes_claim_id;
    IF parent.id IS NULL THEN
      RAISE EXCEPTION 'relationship claim amendment parent is unavailable'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  claim.id := requested_claim_id;
  claim.organization_id := caller_organization_id;
  claim.workspace_id := requested_workspace_id;
  claim.root_claim_id := coalesce(parent.root_claim_id, requested_claim_id);
  claim.supersedes_claim_id := requested_supersedes_claim_id;
  claim.hypothesis_source_claim_id := requested_hypothesis_source_claim_id;
  claim.from_endpoint_id := requested_from_endpoint_id;
  claim.to_endpoint_id := requested_to_endpoint_id;
  claim.relationship_type := requested_relationship_type;
  claim.claim_kind := requested_claim_kind;
  claim.causal_classification := requested_causal_classification;
  claim.discovery_method := requested_discovery_method;
  claim.method_specification := requested_method_specification;
  claim.scope := requested_scope;
  claim.assumptions := requested_assumptions;
  claim.uncertainty := requested_uncertainty;
  claim.confidence := requested_confidence;
  claim.effect_direction := requested_effect_direction;
  claim.effect_strength := requested_effect_strength;
  claim.lag_min_seconds := requested_lag_min_seconds;
  claim.lag_max_seconds := requested_lag_max_seconds;
  claim.regime_scope := requested_regime_scope;
  claim.geographic_scope := requested_geographic_scope;
  claim.valid_from := requested_valid_from;
  claim.valid_until := requested_valid_until;
  claim.discovered_at := requested_discovered_at;
  claim.owner_subject_id := caller_subject_id;
  claim.created_by := caller_subject_id;
  claim.recorded_at := record_time;
  claim.claim_manifest := evidence.relationship_claim_manifest(claim);
  claim.claim_sha256 := encode(digest(convert_to(
    evidence.canonical_json(claim.claim_manifest), 'UTF8'
  ), 'sha256'), 'hex');
  INSERT INTO evidence.relationship_claims SELECT claim.*;

  initial_status := CASE WHEN claim.claim_kind = 'causal'
    THEN 'proposed' ELSE 'discovered' END;
  decision_id := evidence.deterministic_uuid_v8(
    'economyos:relationship-claim-initial-decision:v1', claim.id::text
  );
  initial_decision.id := decision_id;
  initial_decision.organization_id := claim.organization_id;
  initial_decision.workspace_id := claim.workspace_id;
  initial_decision.claim_id := claim.id;
  initial_decision.prior_decision_id := NULL;
  initial_decision.from_status := NULL;
  initial_decision.to_status := initial_status;
  initial_decision.reason := 'Initial governed relationship claim status.';
  initial_decision.decided_by := caller_subject_id;
  initial_decision.effective_at := requested_discovered_at;
  initial_decision.recorded_at := clock_timestamp();
  initial_decision.decision_manifest :=
    evidence.relationship_claim_decision_manifest(initial_decision);
  initial_decision.decision_sha256 := encode(digest(convert_to(
    evidence.canonical_json(initial_decision.decision_manifest), 'UTF8'
  ), 'sha256'), 'hex');
  INSERT INTO evidence.relationship_claim_decisions SELECT initial_decision.*;
  RETURN claim.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.create_relationship_evidence(
  requested_evidence_id uuid,
  requested_workspace_id uuid,
  requested_evidence_type text,
  requested_evidence_uri text,
  requested_source_sha256 text,
  requested_locator jsonb,
  requested_observed_at timestamptz,
  requested_valid_from timestamptz,
  requested_valid_until timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  caller_role text;
  existing evidence.relationship_evidence%ROWTYPE;
  item evidence.relationship_evidence%ROWTYPE;
BEGIN
  IF requested_evidence_id IS NULL OR requested_workspace_id IS NULL
    OR requested_evidence_type IS NULL OR requested_evidence_uri IS NULL
    OR requested_source_sha256 IS NULL OR requested_locator IS NULL
    OR requested_observed_at IS NULL OR requested_valid_from IS NULL
  THEN
    RAISE EXCEPTION 'invalid relationship evidence input' USING ERRCODE = '22023';
  END IF;
  IF caller_organization_id IS NULL OR caller_subject_id IS NULL
    OR NOT evidence.economic_state_workspace_visible(
      caller_organization_id, requested_workspace_id
    )
  THEN
    RAISE EXCEPTION 'active tenant workspace membership is required'
      USING ERRCODE = '42501';
  END IF;
  caller_role := evidence.relationship_workspace_role_internal(
    caller_organization_id, requested_workspace_id, caller_subject_id
  );
  IF caller_role NOT IN ('analyst', 'steward', 'validator', 'admin') THEN
    RAISE EXCEPTION 'principal cannot create relationship evidence'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO existing FROM evidence.relationship_evidence candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.id = requested_evidence_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(
      existing.evidence_type, existing.evidence_uri, existing.source_sha256,
      existing.locator, existing.observed_at, existing.valid_from,
      existing.valid_until, existing.created_by
    ) IS DISTINCT FROM ROW(
      requested_evidence_type, requested_evidence_uri, requested_source_sha256,
      requested_locator, requested_observed_at, requested_valid_from,
      requested_valid_until, caller_subject_id
    ) THEN
      RAISE EXCEPTION 'relationship evidence replay changed its identity'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  item.id := requested_evidence_id;
  item.organization_id := caller_organization_id;
  item.workspace_id := requested_workspace_id;
  item.evidence_type := requested_evidence_type;
  item.evidence_uri := requested_evidence_uri;
  item.source_sha256 := requested_source_sha256;
  item.locator := requested_locator;
  item.observed_at := requested_observed_at;
  item.valid_from := requested_valid_from;
  item.valid_until := requested_valid_until;
  item.created_by := caller_subject_id;
  item.recorded_at := clock_timestamp();
  item.evidence_manifest := evidence.relationship_evidence_manifest(item);
  item.evidence_sha256 := encode(digest(convert_to(
    evidence.canonical_json(item.evidence_manifest), 'UTF8'
  ), 'sha256'), 'hex');
  INSERT INTO evidence.relationship_evidence SELECT item.*;
  RETURN item.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.link_relationship_evidence(
  requested_link_id uuid,
  requested_claim_id uuid,
  requested_evidence_id uuid,
  requested_evidence_role text,
  requested_rationale text,
  requested_linked_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  caller_role text;
  claim evidence.relationship_claims%ROWTYPE;
  existing evidence.relationship_evidence_links%ROWTYPE;
  link evidence.relationship_evidence_links%ROWTYPE;
BEGIN
  IF requested_link_id IS NULL OR requested_claim_id IS NULL
    OR requested_evidence_id IS NULL OR requested_evidence_role IS NULL
    OR requested_rationale IS NULL OR requested_linked_at IS NULL
  THEN
    RAISE EXCEPTION 'invalid relationship evidence link input'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO claim FROM evidence.relationship_claims candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.id = requested_claim_id
    AND evidence.economic_state_workspace_visible(
      candidate.organization_id, candidate.workspace_id
    );
  IF claim.id IS NULL OR caller_subject_id IS NULL THEN
    RAISE EXCEPTION 'relationship claim is unavailable in the current workspace'
      USING ERRCODE = '42501';
  END IF;
  caller_role := evidence.relationship_workspace_role_internal(
    claim.organization_id, claim.workspace_id, caller_subject_id
  );
  IF caller_role NOT IN ('analyst', 'steward', 'validator', 'admin') THEN
    RAISE EXCEPTION 'principal cannot link relationship evidence'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO existing FROM evidence.relationship_evidence_links candidate
  WHERE candidate.organization_id = claim.organization_id
    AND candidate.workspace_id = claim.workspace_id
    AND candidate.id = requested_link_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(
      existing.claim_id, existing.evidence_id, existing.evidence_role,
      existing.rationale, existing.created_by, existing.linked_at
    ) IS DISTINCT FROM ROW(
      requested_claim_id, requested_evidence_id, requested_evidence_role,
      requested_rationale, caller_subject_id, requested_linked_at
    ) THEN
      RAISE EXCEPTION 'relationship evidence link replay changed its identity'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  link.id := requested_link_id;
  link.organization_id := claim.organization_id;
  link.workspace_id := claim.workspace_id;
  link.claim_id := claim.id;
  link.evidence_id := requested_evidence_id;
  link.evidence_role := requested_evidence_role;
  link.rationale := requested_rationale;
  link.created_by := caller_subject_id;
  link.linked_at := requested_linked_at;
  link.recorded_at := clock_timestamp();
  link.link_manifest := evidence.relationship_evidence_link_manifest(link);
  link.link_sha256 := encode(digest(convert_to(
    evidence.canonical_json(link.link_manifest), 'UTF8'
  ), 'sha256'), 'hex');
  INSERT INTO evidence.relationship_evidence_links SELECT link.*;
  RETURN link.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.record_relationship_claim_decision(
  requested_decision_id uuid,
  requested_claim_id uuid,
  requested_to_status text,
  requested_reason text,
  requested_effective_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  caller_role text;
  claim evidence.relationship_claims%ROWTYPE;
  prior evidence.relationship_claim_decisions%ROWTYPE;
  existing evidence.relationship_claim_decisions%ROWTYPE;
  decision evidence.relationship_claim_decisions%ROWTYPE;
BEGIN
  IF requested_decision_id IS NULL OR requested_claim_id IS NULL
    OR requested_to_status IS NULL OR requested_reason IS NULL
    OR requested_effective_at IS NULL OR NOT isfinite(requested_effective_at)
    OR requested_effective_at > statement_timestamp() + interval '1 minute'
  THEN
    RAISE EXCEPTION 'invalid relationship decision input' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO claim FROM evidence.relationship_claims candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.id = requested_claim_id
    AND evidence.economic_state_workspace_visible(
      candidate.organization_id, candidate.workspace_id
    );
  IF claim.id IS NULL OR caller_subject_id IS NULL THEN
    RAISE EXCEPTION 'relationship claim is unavailable in the current workspace'
      USING ERRCODE = '42501';
  END IF;
  caller_role := evidence.relationship_workspace_role_internal(
    claim.organization_id, claim.workspace_id, caller_subject_id
  );
  IF caller_role IS NULL
    OR (requested_to_status = 'proposed'
      AND caller_role NOT IN ('analyst', 'steward', 'validator', 'admin'))
    OR (requested_to_status = 'reviewed'
      AND caller_role NOT IN ('validator', 'admin'))
    OR (requested_to_status IN ('approved', 'retired')
      AND caller_role NOT IN ('steward', 'admin'))
    OR (requested_to_status = 'rejected'
      AND caller_role NOT IN ('steward', 'validator', 'admin'))
    OR requested_to_status NOT IN (
      'proposed', 'reviewed', 'approved', 'rejected', 'retired'
    )
  THEN
    RAISE EXCEPTION 'principal cannot record this relationship decision'
      USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(claim.id::text, 32033));
  SELECT * INTO existing FROM evidence.relationship_claim_decisions candidate
  WHERE candidate.organization_id = claim.organization_id
    AND candidate.workspace_id = claim.workspace_id
    AND candidate.id = requested_decision_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(
      existing.claim_id, existing.to_status, existing.reason,
      existing.decided_by, existing.effective_at
    ) IS DISTINCT FROM ROW(
      requested_claim_id, requested_to_status, requested_reason,
      caller_subject_id, requested_effective_at
    ) THEN
      RAISE EXCEPTION 'relationship decision replay changed its evidence'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  SELECT * INTO prior FROM evidence.relationship_claim_decisions candidate
  WHERE candidate.organization_id = claim.organization_id
    AND candidate.workspace_id = claim.workspace_id
    AND candidate.claim_id = claim.id
  ORDER BY candidate.effective_at DESC, candidate.recorded_at DESC, candidate.id DESC
  LIMIT 1;
  IF prior.id IS NULL THEN
    RAISE EXCEPTION 'relationship claim lacks its initial decision'
      USING ERRCODE = '23514';
  END IF;
  decision.id := requested_decision_id;
  decision.organization_id := claim.organization_id;
  decision.workspace_id := claim.workspace_id;
  decision.claim_id := claim.id;
  decision.prior_decision_id := prior.id;
  decision.from_status := prior.to_status;
  decision.to_status := requested_to_status;
  decision.reason := requested_reason;
  decision.decided_by := caller_subject_id;
  decision.effective_at := requested_effective_at;
  decision.recorded_at := clock_timestamp();
  decision.decision_manifest :=
    evidence.relationship_claim_decision_manifest(decision);
  decision.decision_sha256 := encode(digest(convert_to(
    evidence.canonical_json(decision.decision_manifest), 'UTF8'
  ), 'sha256'), 'hex');
  INSERT INTO evidence.relationship_claim_decisions SELECT decision.*;
  RETURN decision.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.relationship_claim_status_at(
  requested_claim_id uuid,
  requested_effective_at timestamptz DEFAULT statement_timestamp(),
  requested_system_at timestamptz DEFAULT statement_timestamp()
)
RETURNS TABLE (
  resolved_claim_id uuid,
  root_claim_id uuid,
  from_endpoint_id uuid,
  to_endpoint_id uuid,
  relationship_type text,
  claim_kind text,
  causal_classification text,
  status text,
  valid_from timestamptz,
  valid_until timestamptz,
  recorded_at timestamptz,
  claim_sha256 text,
  decision_id uuid,
  decision_sha256 text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  requested_root_id uuid;
  requested_organization_id uuid;
  requested_workspace_id uuid;
BEGIN
  IF requested_claim_id IS NULL
    OR requested_effective_at IS NULL OR NOT isfinite(requested_effective_at)
    OR requested_system_at IS NULL OR NOT isfinite(requested_system_at)
  THEN
    RAISE EXCEPTION 'finite relationship claim temporal cutoffs are required'
      USING ERRCODE = '22023';
  END IF;
  SELECT claim.root_claim_id, claim.organization_id, claim.workspace_id
  INTO requested_root_id, requested_organization_id, requested_workspace_id
  FROM evidence.relationship_claims claim
  WHERE claim.id = requested_claim_id
    AND claim.organization_id = app.current_organization_id()
    AND evidence.economic_state_workspace_visible(
      claim.organization_id, claim.workspace_id
    );
  IF requested_root_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT
    claim.id, claim.root_claim_id, claim.from_endpoint_id, claim.to_endpoint_id,
    claim.relationship_type, claim.claim_kind, claim.causal_classification,
    decision.to_status, claim.valid_from, claim.valid_until, claim.recorded_at,
    claim.claim_sha256, decision.id, decision.decision_sha256
  FROM evidence.relationship_claims claim
  JOIN LATERAL (
    SELECT event.id, event.to_status, event.decision_sha256
    FROM evidence.relationship_claim_decisions event
    WHERE event.organization_id = claim.organization_id
      AND event.workspace_id = claim.workspace_id
      AND event.claim_id = claim.id
      AND event.effective_at <= requested_effective_at
      AND event.recorded_at <= requested_system_at
    ORDER BY event.effective_at DESC, event.recorded_at DESC, event.id DESC
    LIMIT 1
  ) decision ON true
  WHERE claim.organization_id = requested_organization_id
    AND claim.workspace_id = requested_workspace_id
    AND claim.root_claim_id = requested_root_id
    AND claim.recorded_at <= requested_system_at
    AND claim.valid_from <= requested_effective_at
    AND (claim.valid_until IS NULL OR claim.valid_until > requested_effective_at)
  ORDER BY claim.recorded_at DESC, claim.id DESC
  LIMIT 1;
END
$$;

CREATE OR REPLACE FUNCTION evidence.list_relationship_graph_projection_events(
  requested_workspace_id uuid,
  requested_after_sequence bigint DEFAULT 0,
  requested_limit integer DEFAULT 100
)
RETURNS TABLE (
  event_sequence bigint,
  projection_event_id uuid,
  claim_id uuid,
  decision_id uuid,
  projection_manifest jsonb,
  projection_sha256 text,
  occurred_at timestamptz,
  recorded_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
BEGIN
  IF requested_workspace_id IS NULL OR requested_after_sequence IS NULL
    OR requested_after_sequence < 0 OR requested_limit IS NULL
    OR requested_limit NOT BETWEEN 1 AND 500
  THEN
    RAISE EXCEPTION 'invalid relationship projection page input'
      USING ERRCODE = '22023';
  END IF;
  IF caller_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM app.workspaces workspace
    JOIN app.organizations organization
      ON organization.id = workspace.organization_id
    WHERE workspace.organization_id = caller_organization_id
      AND workspace.id = requested_workspace_id
      AND workspace.status = 'active' AND organization.status = 'active'
  ) THEN
    RAISE EXCEPTION 'relationship projection workspace is unavailable'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    event.event_sequence, event.projection_event_id, event.claim_id,
    event.decision_id, event.projection_manifest, event.projection_sha256,
    event.occurred_at, event.recorded_at
  FROM evidence.relationship_graph_projection_outbox event
  WHERE event.organization_id = caller_organization_id
    AND event.workspace_id = requested_workspace_id
    AND event.event_sequence > requested_after_sequence
  ORDER BY event.event_sequence
  LIMIT requested_limit;
END
$$;

CREATE OR REPLACE FUNCTION evidence.record_relationship_graph_projection_receipt(
  requested_projection_event_id uuid,
  requested_consumer text,
  requested_attempt integer,
  requested_status text,
  requested_projected_sha256 text,
  requested_error_code text,
  requested_error_message text,
  requested_occurred_at timestamptz DEFAULT statement_timestamp()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  projection evidence.relationship_graph_projection_outbox%ROWTYPE;
  prior_receipt evidence.relationship_graph_projection_receipts%ROWTYPE;
  existing evidence.relationship_graph_projection_receipts%ROWTYPE;
  receipt evidence.relationship_graph_projection_receipts%ROWTYPE;
  receipt_id uuid;
BEGIN
  IF requested_projection_event_id IS NULL OR requested_consumer IS NULL
    OR requested_attempt IS NULL OR requested_attempt NOT BETWEEN 1 AND 1000
    OR requested_status NOT IN ('succeeded', 'failed')
    OR requested_occurred_at IS NULL OR NOT isfinite(requested_occurred_at)
    OR requested_occurred_at > statement_timestamp() + interval '1 minute'
    OR (requested_status = 'succeeded' AND (
      requested_projected_sha256 !~ '^[0-9a-f]{64}$'
      OR requested_error_code IS NOT NULL OR requested_error_message IS NOT NULL
    ))
    OR (requested_status = 'failed' AND (
      requested_projected_sha256 IS NOT NULL
      OR requested_error_code !~ '^[A-Z][A-Z0-9_]{1,127}$'
      OR requested_error_message IS NULL
      OR length(btrim(requested_error_message)) NOT BETWEEN 1 AND 1000
      OR requested_error_message <> btrim(requested_error_message)
    ))
  THEN
    RAISE EXCEPTION 'invalid relationship projection receipt input'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO projection
  FROM evidence.relationship_graph_projection_outbox candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.projection_event_id = requested_projection_event_id;
  IF projection.projection_event_id IS NULL
    OR requested_occurred_at < projection.recorded_at
  THEN
    RAISE EXCEPTION 'relationship projection event is outside the current tenant or time'
      USING ERRCODE = '42501';
  END IF;
  receipt_id := evidence.deterministic_uuid_v8(
    'economyos:relationship-graph-projection-receipt:v1',
    requested_projection_event_id::text, requested_consumer,
    requested_attempt::text
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(
    requested_projection_event_id::text || ':' || requested_consumer, 32034
  ));
  SELECT * INTO existing
  FROM evidence.relationship_graph_projection_receipts candidate
  WHERE candidate.id = receipt_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(
      existing.status, existing.projected_sha256, existing.error_code,
      existing.error_message, existing.occurred_at
    ) IS DISTINCT FROM ROW(
      requested_status, requested_projected_sha256, requested_error_code,
      requested_error_message, requested_occurred_at
    ) THEN
      RAISE EXCEPTION 'relationship projection receipt replay changed its evidence'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM evidence.relationship_graph_projection_receipts candidate
    WHERE candidate.organization_id = projection.organization_id
      AND candidate.workspace_id = projection.workspace_id
      AND candidate.projection_event_id = projection.projection_event_id
      AND candidate.consumer = requested_consumer
      AND candidate.status = 'succeeded'
  ) THEN
    RAISE EXCEPTION 'succeeded relationship projection is terminal for its consumer'
      USING ERRCODE = '23514';
  END IF;
  IF requested_attempt > 1 THEN
    SELECT * INTO prior_receipt
    FROM evidence.relationship_graph_projection_receipts candidate
    WHERE candidate.organization_id = projection.organization_id
      AND candidate.workspace_id = projection.workspace_id
      AND candidate.projection_event_id = projection.projection_event_id
      AND candidate.consumer = requested_consumer
      AND candidate.attempt = requested_attempt - 1;
    IF prior_receipt.id IS NULL OR prior_receipt.status <> 'failed' THEN
      RAISE EXCEPTION 'relationship projection retry must extend a failed attempt'
        USING ERRCODE = '23514';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM evidence.relationship_graph_projection_receipts candidate
    WHERE candidate.organization_id = projection.organization_id
      AND candidate.workspace_id = projection.workspace_id
      AND candidate.projection_event_id = projection.projection_event_id
      AND candidate.consumer = requested_consumer
  ) THEN
    RAISE EXCEPTION 'relationship projection first attempt already exists'
      USING ERRCODE = '23514';
  END IF;

  receipt.id := receipt_id;
  receipt.organization_id := projection.organization_id;
  receipt.workspace_id := projection.workspace_id;
  receipt.projection_event_id := projection.projection_event_id;
  receipt.consumer := requested_consumer;
  receipt.attempt := requested_attempt;
  receipt.status := requested_status;
  receipt.projected_sha256 := requested_projected_sha256;
  receipt.error_code := requested_error_code;
  receipt.error_message := requested_error_message;
  receipt.occurred_at := requested_occurred_at;
  receipt.recorded_at := clock_timestamp();
  receipt.receipt_manifest := evidence.relationship_projection_receipt_manifest(
    receipt.id, receipt.projection_event_id, projection.projection_sha256,
    receipt.consumer, receipt.attempt, receipt.status,
    receipt.projected_sha256, receipt.error_code, receipt.error_message,
    receipt.occurred_at, receipt.recorded_at
  );
  receipt.receipt_sha256 := encode(digest(convert_to(
    evidence.canonical_json(receipt.receipt_manifest), 'UTF8'
  ), 'sha256'), 'hex');
  INSERT INTO evidence.relationship_graph_projection_receipts SELECT receipt.*;
  RETURN receipt.id;
END
$$;

-- Provenance lineage is a DAG. Economic feedback cycles belong in governed
-- relationship claims above and are deliberately not subjected to this check.
CREATE OR REPLACE FUNCTION evidence.validate_lineage_edge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  from_scope uuid;
  to_scope uuid;
  forms_cycle boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(
    coalesce(NEW.organization_id::text, 'global'), 32032
  ));
  WITH RECURSIVE reachable(endpoint_type, endpoint_id) AS (
    SELECT NEW.to_type, NEW.to_id
    UNION
    SELECT edge.to_type, edge.to_id
    FROM reachable current_endpoint
    JOIN evidence.lineage_edges edge
      ON edge.organization_id IS NOT DISTINCT FROM NEW.organization_id
      AND edge.from_type = current_endpoint.endpoint_type
      AND edge.from_id = current_endpoint.endpoint_id
  )
  SELECT EXISTS (
    SELECT 1 FROM reachable
    WHERE endpoint_type = NEW.from_type AND endpoint_id = NEW.from_id
  ) INTO forms_cycle;
  IF forms_cycle THEN
    RAISE EXCEPTION 'lineage edge would create a provenance cycle'
      USING ERRCODE = '23514';
  END IF;

  from_scope := evidence.lineage_endpoint_scope(NEW.from_type, NEW.from_id);
  to_scope := evidence.lineage_endpoint_scope(NEW.to_type, NEW.to_id);
  IF NEW.organization_id IS NULL THEN
    IF from_scope IS NOT NULL OR to_scope IS NOT NULL THEN
      RAISE EXCEPTION 'global lineage edges can reference only global endpoints'
        USING ERRCODE = '23514';
    END IF;
  ELSIF to_scope IS DISTINCT FROM NEW.organization_id
    OR (from_scope IS NOT NULL AND from_scope IS DISTINCT FROM NEW.organization_id)
  THEN
    RAISE EXCEPTION 'lineage edge crosses an organization boundary'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.from_type = 'model' AND NEW.to_type = 'state_run'
    AND NEW.relation = 'executed_with'
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM evidence.economic_state_runs run
      JOIN evidence.economic_state_models model
        ON model.organization_id = run.organization_id
        AND model.workspace_id = run.workspace_id
        AND model.id = run.model_id
      WHERE model.id = NEW.from_id
        AND run.id = NEW.to_id
        AND run.organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'model-to-state-run lineage does not match immutable execution evidence'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.from_type = 'observation' AND NEW.to_type = 'state_run'
    AND NEW.relation = 'derived_from'
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM evidence.economic_state_component_results component
      WHERE component.observation_id = NEW.from_id
        AND component.run_id = NEW.to_id
        AND component.organization_id = NEW.organization_id
        AND component.raw_value IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'observation-to-state-run lineage lacks bound component evidence'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.from_type = 'state_run' AND NEW.to_type = 'state_vector'
    AND NEW.relation = 'produced'
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM evidence.economic_state_vector_dimensions slot
      WHERE slot.state_run_id = NEW.from_id
        AND slot.vector_id = NEW.to_id
        AND slot.organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'state-run-to-vector lineage lacks its exact dimension slot'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.from_type IN ('state_run', 'state_vector')
    OR NEW.to_type IN ('state_run', 'state_vector')
  THEN
    RAISE EXCEPTION 'unsupported economic-state lineage relation'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

ALTER TABLE evidence.relationship_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.relationship_endpoints FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.relationship_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.relationship_claims FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.relationship_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.relationship_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.relationship_evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.relationship_evidence_links FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.relationship_claim_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.relationship_claim_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.relationship_graph_projection_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.relationship_graph_projection_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.relationship_graph_projection_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.relationship_graph_projection_receipts FORCE ROW LEVEL SECURITY;

CREATE POLICY relationship_endpoints_workspace
  ON evidence.relationship_endpoints
  USING (evidence.economic_state_workspace_visible(organization_id, workspace_id))
  WITH CHECK (evidence.economic_state_workspace_visible(organization_id, workspace_id));
CREATE POLICY relationship_claims_workspace
  ON evidence.relationship_claims
  USING (evidence.economic_state_workspace_visible(organization_id, workspace_id))
  WITH CHECK (evidence.economic_state_workspace_visible(organization_id, workspace_id));
CREATE POLICY relationship_evidence_workspace
  ON evidence.relationship_evidence
  USING (evidence.economic_state_workspace_visible(organization_id, workspace_id))
  WITH CHECK (evidence.economic_state_workspace_visible(organization_id, workspace_id));
CREATE POLICY relationship_evidence_links_workspace
  ON evidence.relationship_evidence_links
  USING (evidence.economic_state_workspace_visible(organization_id, workspace_id))
  WITH CHECK (evidence.economic_state_workspace_visible(organization_id, workspace_id));
CREATE POLICY relationship_claim_decisions_workspace
  ON evidence.relationship_claim_decisions
  USING (evidence.economic_state_workspace_visible(organization_id, workspace_id))
  WITH CHECK (evidence.economic_state_workspace_visible(organization_id, workspace_id));
CREATE POLICY relationship_projection_outbox_workspace
  ON evidence.relationship_graph_projection_outbox
  USING (evidence.economic_state_workspace_visible(organization_id, workspace_id))
  WITH CHECK (evidence.economic_state_workspace_visible(organization_id, workspace_id));
CREATE POLICY relationship_projection_receipts_workspace
  ON evidence.relationship_graph_projection_receipts
  USING (evidence.economic_state_workspace_visible(organization_id, workspace_id))
  WITH CHECK (evidence.economic_state_workspace_visible(organization_id, workspace_id));

CREATE INDEX relationship_claims_temporal_idx
  ON evidence.relationship_claims (
    organization_id, workspace_id, root_claim_id,
    valid_from, valid_until, recorded_at DESC, id DESC
  );
CREATE INDEX relationship_claim_decisions_temporal_idx
  ON evidence.relationship_claim_decisions (
    organization_id, workspace_id, claim_id,
    effective_at DESC, recorded_at DESC, id DESC
  );
CREATE INDEX relationship_evidence_links_claim_idx
  ON evidence.relationship_evidence_links (
    organization_id, workspace_id, claim_id, evidence_role, recorded_at
  );
CREATE INDEX relationship_projection_outbox_page_idx
  ON evidence.relationship_graph_projection_outbox (
    organization_id, workspace_id, event_sequence
  );
CREATE INDEX relationship_projection_receipts_consumer_idx
  ON evidence.relationship_graph_projection_receipts (
    organization_id, workspace_id, consumer, projection_event_id, attempt DESC
  );

REVOKE ALL ON TABLE
  evidence.relationship_endpoints,
  evidence.relationship_claims,
  evidence.relationship_evidence,
  evidence.relationship_evidence_links,
  evidence.relationship_claim_decisions,
  evidence.relationship_graph_projection_outbox,
  evidence.relationship_graph_projection_receipts
FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON SEQUENCE
  evidence.relationship_graph_projection_outbox_event_sequence_seq
FROM PUBLIC, economyos_app, economyos_ingest;

REVOKE ALL ON FUNCTION evidence.relationship_graph_time_text(timestamptz)
  FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.relationship_endpoint_manifest(
  uuid, text, text, text, text, uuid, uuid, timestamptz
) FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.relationship_claim_manifest(
  evidence.relationship_claims
) FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.relationship_evidence_manifest(
  evidence.relationship_evidence
) FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.relationship_evidence_link_manifest(
  evidence.relationship_evidence_links
) FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.relationship_claim_decision_manifest(
  evidence.relationship_claim_decisions
) FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.relationship_projection_manifest(
  uuid, evidence.relationship_claims, evidence.relationship_claim_decisions,
  evidence.relationship_endpoints, evidence.relationship_endpoints
) FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.relationship_projection_receipt_manifest(
  uuid, uuid, text, text, integer, text, text, text, text,
  timestamptz, timestamptz
) FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.verify_relationship_endpoint()
  FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.verify_relationship_claim()
  FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.verify_relationship_evidence()
  FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.verify_relationship_evidence_link()
  FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.relationship_claim_transition_allowed(text, text)
  FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.verify_relationship_claim_decision()
  FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.verify_relationship_projection_event()
  FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.record_relationship_projection_event()
  FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.verify_relationship_projection_receipt()
  FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.relationship_workspace_role_internal(
  uuid, uuid, uuid
) FROM PUBLIC, economyos_app, economyos_ingest;

REVOKE ALL ON FUNCTION evidence.create_relationship_endpoint(
  uuid, uuid, text, text, text, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.create_relationship_claim(
  uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid,
  jsonb, jsonb, jsonb, jsonb, numeric, text, numeric, bigint, bigint,
  jsonb, jsonb, timestamptz, timestamptz, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.create_relationship_evidence(
  uuid, uuid, text, text, text, jsonb, timestamptz, timestamptz, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.link_relationship_evidence(
  uuid, uuid, uuid, text, text, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.record_relationship_claim_decision(
  uuid, uuid, text, text, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.relationship_claim_status_at(
  uuid, timestamptz, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.list_relationship_graph_projection_events(
  uuid, bigint, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.record_relationship_graph_projection_receipt(
  uuid, text, integer, text, text, text, text, timestamptz
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION evidence.create_relationship_endpoint(
  uuid, uuid, text, text, text, text, uuid
) TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.create_relationship_claim(
  uuid, uuid, uuid, uuid, text, text, text, text, uuid, uuid,
  jsonb, jsonb, jsonb, jsonb, numeric, text, numeric, bigint, bigint,
  jsonb, jsonb, timestamptz, timestamptz, timestamptz
) TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.create_relationship_evidence(
  uuid, uuid, text, text, text, jsonb, timestamptz, timestamptz, timestamptz
) TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.link_relationship_evidence(
  uuid, uuid, uuid, text, text, timestamptz
) TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.record_relationship_claim_decision(
  uuid, uuid, text, text, timestamptz
) TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.relationship_claim_status_at(
  uuid, timestamptz, timestamptz
) TO economyos_app;

GRANT EXECUTE ON FUNCTION evidence.list_relationship_graph_projection_events(
  uuid, bigint, integer
) TO economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.record_relationship_graph_projection_receipt(
  uuid, text, integer, text, text, text, text, timestamptz
) TO economyos_ingest;

COMMENT ON TABLE evidence.relationship_claims IS
  'Immutable bitemporal governed relationship claim versions; causal and association classifications cannot be silently converted.';
COMMENT ON TABLE evidence.relationship_claim_decisions IS
  'Append-only status decisions with evidence gates and independent review/approval.';
COMMENT ON TABLE evidence.relationship_graph_projection_outbox IS
  'Immutable canonical graph projection events; PostgreSQL remains the identity and approval source of truth.';
COMMENT ON FUNCTION evidence.relationship_claim_status_at(
  uuid, timestamptz, timestamptz
) IS 'Resolves one visible claim lineage and decision at explicit valid and system-time cutoffs.';
COMMENT ON FUNCTION evidence.list_relationship_graph_projection_events(
  uuid, bigint, integer
) IS 'Returns a bounded tenant-workspace projection outbox page to the ingestion capability only.';
COMMENT ON FUNCTION evidence.validate_lineage_edge() IS
  'Validates endpoints, tenant scope, supported scientific relations, and serialized acyclic provenance; economic feedback cycles use relationship claims.';
