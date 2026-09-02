-- Durable Phase 2 ingestion control-plane records and parser-scoped quality.
-- Scientific evidence remains append-only; the small mutable run summary can
-- only move through the audited transition function below.

CREATE OR REPLACE FUNCTION evidence.canonical_json(value jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, evidence
AS $$
  SELECT CASE jsonb_typeof(value)
    WHEN 'object' THEN coalesce((
      SELECT '{' || string_agg(
        to_jsonb(entry.key)::text || ':' || evidence.canonical_json(entry.value),
        ',' ORDER BY entry.key COLLATE "C"
      ) || '}'
      FROM jsonb_each(value) entry
    ), '{}')
    WHEN 'array' THEN coalesce((
      SELECT '[' || string_agg(
        evidence.canonical_json(entry.value), ',' ORDER BY entry.ordinality
      ) || ']'
      FROM jsonb_array_elements(value) WITH ORDINALITY entry(value, ordinality)
    ), '[]')
    ELSE value::text
  END
$$;

CREATE TABLE evidence.ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE,
  tenant_scope uuid GENERATED ALWAYS AS (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  dataset_id uuid NOT NULL,
  workflow_id text NOT NULL CHECK (length(btrim(workflow_id)) BETWEEN 1 AND 512),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
  input_manifest jsonb NOT NULL CHECK (jsonb_typeof(input_manifest) = 'object'),
  input_sha256 text NOT NULL CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'quarantined')),
  requested_at timestamptz NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  output_manifest jsonb CHECK (output_manifest IS NULL OR jsonb_typeof(output_manifest) = 'object'),
  output_sha256 text CHECK (output_sha256 IS NULL OR output_sha256 ~ '^[0-9a-f]{64}$'),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[A-Z][A-Z0-9_]{1,127}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_scope, dataset_id)
    REFERENCES evidence.source_datasets(tenant_scope, id) ON DELETE RESTRICT,
  CHECK (isfinite(requested_at)),
  CHECK (started_at IS NULL OR (isfinite(started_at) AND started_at >= requested_at)),
  CHECK (completed_at IS NULL OR (isfinite(completed_at) AND completed_at >= started_at)),
  CHECK (
    (status = 'pending' AND started_at IS NULL AND completed_at IS NULL
      AND output_manifest IS NULL AND output_sha256 IS NULL AND error_code IS NULL)
    OR
    (status = 'running' AND started_at IS NOT NULL AND completed_at IS NULL
      AND output_manifest IS NULL AND output_sha256 IS NULL AND error_code IS NULL)
    OR
    (status = 'succeeded' AND started_at IS NOT NULL AND completed_at IS NOT NULL
      AND output_manifest IS NOT NULL AND output_sha256 IS NOT NULL AND error_code IS NULL)
    OR
    (status = 'failed' AND started_at IS NOT NULL AND completed_at IS NOT NULL
      AND output_manifest IS NULL AND output_sha256 IS NULL AND error_code IS NOT NULL)
    OR
    (status = 'quarantined' AND started_at IS NOT NULL AND completed_at IS NOT NULL
      AND output_manifest IS NOT NULL AND output_sha256 IS NOT NULL AND error_code IS NOT NULL)
  ),
  UNIQUE (tenant_scope, workflow_id),
  UNIQUE (tenant_scope, dataset_id, idempotency_key),
  UNIQUE (tenant_scope, id)
);

CREATE TABLE evidence.ingestion_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE,
  tenant_scope uuid GENERATED ALWAYS AS (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  ingestion_run_id uuid NOT NULL,
  event_sequence integer NOT NULL CHECK (event_sequence BETWEEN 1 AND 1000000),
  stage text NOT NULL CHECK (
    stage IN ('workflow', 'fetch', 'persist', 'parse', 'quality', 'promote', 'lineage', 'reconcile')
  ),
  status text NOT NULL CHECK (
    status IN ('pending', 'running', 'succeeded', 'failed', 'quarantined')
  ),
  attempt integer NOT NULL CHECK (attempt BETWEEN 1 AND 100),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz NOT NULL CHECK (isfinite(occurred_at)),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_scope, ingestion_run_id)
    REFERENCES evidence.ingestion_runs(tenant_scope, id) ON DELETE RESTRICT,
  UNIQUE (tenant_scope, ingestion_run_id, event_sequence),
  UNIQUE (tenant_scope, ingestion_run_id, stage, status, attempt),
  UNIQUE (tenant_scope, id)
);

CREATE TABLE evidence.ingestion_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE,
  tenant_scope uuid GENERATED ALWAYS AS (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  ingestion_run_id uuid NOT NULL,
  stage text NOT NULL CHECK (
    stage IN ('fetch', 'persist', 'parse', 'quality', 'promote', 'lineage', 'reconcile')
  ),
  checkpoint_key text NOT NULL CHECK (length(btrim(checkpoint_key)) BETWEEN 1 AND 512),
  value jsonb NOT NULL CHECK (jsonb_typeof(value) = 'object'),
  value_sha256 text NOT NULL CHECK (value_sha256 ~ '^[0-9a-f]{64}$'),
  payload_checksum_sha256 text
    CHECK (payload_checksum_sha256 IS NULL OR payload_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  committed_at timestamptz NOT NULL CHECK (isfinite(committed_at)),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_scope, ingestion_run_id)
    REFERENCES evidence.ingestion_runs(tenant_scope, id) ON DELETE RESTRICT,
  UNIQUE (tenant_scope, ingestion_run_id, stage, checkpoint_key),
  UNIQUE (tenant_scope, id)
);

CREATE OR REPLACE FUNCTION evidence.verify_ingestion_digest()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  calculated text;
BEGIN
  IF TG_TABLE_NAME = 'ingestion_runs' THEN
    calculated := encode(
      digest(convert_to(evidence.canonical_json(NEW.input_manifest), 'UTF8'), 'sha256'), 'hex'
    );
    IF NEW.input_sha256 <> calculated THEN
      RAISE EXCEPTION 'ingestion input manifest digest is invalid' USING ERRCODE = '23514';
    END IF;
    IF NEW.output_manifest IS NOT NULL THEN
      calculated := encode(
        digest(convert_to(evidence.canonical_json(NEW.output_manifest), 'UTF8'), 'sha256'), 'hex'
      );
      IF NEW.output_sha256 <> calculated THEN
        RAISE EXCEPTION 'ingestion output manifest digest is invalid' USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSE
    calculated := encode(
      digest(convert_to(evidence.canonical_json(NEW.value), 'UTF8'), 'sha256'), 'hex'
    );
    IF NEW.value_sha256 <> calculated THEN
      RAISE EXCEPTION 'ingestion checkpoint digest is invalid' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER ingestion_runs_verify_digest
BEFORE INSERT OR UPDATE ON evidence.ingestion_runs
FOR EACH ROW EXECUTE FUNCTION evidence.verify_ingestion_digest();
CREATE TRIGGER ingestion_checkpoints_verify_digest
BEFORE INSERT ON evidence.ingestion_checkpoints
FOR EACH ROW EXECUTE FUNCTION evidence.verify_ingestion_digest();

CREATE OR REPLACE FUNCTION evidence.validate_ingestion_run_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW.organization_id, NEW.dataset_id, NEW.workflow_id, NEW.idempotency_key,
    NEW.input_manifest, NEW.input_sha256, NEW.requested_at, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.organization_id, OLD.dataset_id, OLD.workflow_id, OLD.idempotency_key,
    OLD.input_manifest, OLD.input_sha256, OLD.requested_at, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'ingestion run identity and input are immutable' USING ERRCODE = '55000';
  END IF;
  IF NOT (
    (OLD.status = 'pending' AND NEW.status = 'running')
    OR (OLD.status = 'running' AND NEW.status = 'running')
    OR (OLD.status = 'running' AND NEW.status IN ('succeeded', 'failed', 'quarantined'))
  ) THEN
    RAISE EXCEPTION 'invalid ingestion run transition from % to %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER ingestion_runs_validate_transition
BEFORE UPDATE ON evidence.ingestion_runs
FOR EACH ROW EXECUTE FUNCTION evidence.validate_ingestion_run_transition();
CREATE TRIGGER ingestion_runs_reject_delete
BEFORE DELETE ON evidence.ingestion_runs
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER ingestion_run_events_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.ingestion_run_events
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER ingestion_checkpoints_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.ingestion_checkpoints
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE OR REPLACE FUNCTION evidence.record_ingestion_requested()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
BEGIN
  INSERT INTO evidence.ingestion_run_events (
    organization_id, ingestion_run_id, event_sequence, stage, status, attempt, details, occurred_at
  ) VALUES (
    NEW.organization_id, NEW.id, 1, 'workflow', 'pending', 1,
    jsonb_build_object('workflowId', NEW.workflow_id, 'idempotencyKey', NEW.idempotency_key),
    NEW.requested_at
  );
  RETURN NEW;
END
$$;

CREATE TRIGGER ingestion_runs_record_requested
AFTER INSERT ON evidence.ingestion_runs
FOR EACH ROW EXECUTE FUNCTION evidence.record_ingestion_requested();

CREATE OR REPLACE FUNCTION evidence.transition_ingestion_run(
  requested_run_id uuid,
  expected_status text,
  next_status text,
  requested_stage text,
  requested_attempt integer,
  requested_details jsonb,
  requested_output_manifest jsonb DEFAULT NULL,
  requested_error_code text DEFAULT NULL,
  requested_occurred_at timestamptz DEFAULT statement_timestamp()
)
RETURNS evidence.ingestion_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  run evidence.ingestion_runs%ROWTYPE;
  prior_event evidence.ingestion_run_events%ROWTYPE;
  next_sequence integer;
  output_digest text;
BEGIN
  IF expected_status NOT IN ('pending', 'running')
    OR next_status NOT IN ('running', 'succeeded', 'failed', 'quarantined')
    OR requested_stage NOT IN (
      'workflow', 'fetch', 'persist', 'parse', 'quality', 'promote', 'lineage', 'reconcile'
    )
    OR requested_attempt NOT BETWEEN 1 AND 100
    OR jsonb_typeof(requested_details) <> 'object'
    OR NOT isfinite(requested_occurred_at)
  THEN
    RAISE EXCEPTION 'invalid ingestion transition input' USING ERRCODE = '22023';
  END IF;

  IF next_status = 'succeeded' THEN
    IF requested_output_manifest IS NULL OR jsonb_typeof(requested_output_manifest) <> 'object'
      OR requested_error_code IS NOT NULL
    THEN
      RAISE EXCEPTION 'successful ingestion requires only an output manifest' USING ERRCODE = '22023';
    END IF;
    output_digest := encode(digest(
      convert_to(evidence.canonical_json(requested_output_manifest), 'UTF8'), 'sha256'
    ), 'hex');
  ELSIF next_status = 'quarantined' THEN
    IF requested_output_manifest IS NULL OR jsonb_typeof(requested_output_manifest) <> 'object'
      OR requested_error_code <> 'QUALITY_GATE_FAILED'
    THEN
      RAISE EXCEPTION 'quarantined ingestion requires its evidence manifest and quality error code'
        USING ERRCODE = '22023';
    END IF;
    output_digest := encode(digest(
      convert_to(evidence.canonical_json(requested_output_manifest), 'UTF8'), 'sha256'
    ), 'hex');
  ELSIF next_status = 'failed' THEN
    IF requested_output_manifest IS NOT NULL
      OR requested_error_code IS NULL
      OR requested_error_code !~ '^[A-Z][A-Z0-9_]{1,127}$'
    THEN
      RAISE EXCEPTION 'failed ingestion requires only a safe error code' USING ERRCODE = '22023';
    END IF;
  ELSIF requested_output_manifest IS NOT NULL OR requested_error_code IS NOT NULL THEN
    RAISE EXCEPTION 'running ingestion cannot have terminal output' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO run FROM evidence.ingestion_runs WHERE id = requested_run_id FOR UPDATE;
  IF NOT FOUND
    OR NOT (run.organization_id IS NULL OR run.organization_id = app.current_organization_id())
  THEN
    RAISE EXCEPTION 'ingestion run is not visible in the current tenant' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO prior_event
  FROM evidence.ingestion_run_events event
  WHERE event.tenant_scope = run.tenant_scope
    AND event.ingestion_run_id = run.id
    AND event.stage = requested_stage
    AND event.status = next_status
    AND event.attempt = requested_attempt;
  IF FOUND THEN
    IF prior_event.details IS DISTINCT FROM requested_details
      OR prior_event.occurred_at IS DISTINCT FROM requested_occurred_at
      OR (next_status IN ('succeeded', 'quarantined')
        AND (run.output_manifest IS DISTINCT FROM requested_output_manifest
          OR run.output_sha256 IS DISTINCT FROM output_digest))
      OR (next_status IN ('failed', 'quarantined')
        AND run.error_code IS DISTINCT FROM requested_error_code)
    THEN
      RAISE EXCEPTION 'ingestion transition replay differs from the committed event'
        USING ERRCODE = '40001';
    END IF;
    RETURN run;
  END IF;

  IF run.status <> expected_status THEN
    RAISE EXCEPTION 'ingestion run status conflict' USING ERRCODE = '40001';
  END IF;
  IF requested_occurred_at < run.requested_at OR EXISTS (
    SELECT 1 FROM evidence.ingestion_run_events event
    WHERE event.tenant_scope = run.tenant_scope
      AND event.ingestion_run_id = run.id
      AND event.occurred_at > requested_occurred_at
  ) THEN
    RAISE EXCEPTION 'ingestion event time cannot precede the run history' USING ERRCODE = '22023';
  END IF;

  UPDATE evidence.ingestion_runs
  SET status = next_status,
      started_at = coalesce(started_at, requested_occurred_at),
      completed_at = CASE WHEN next_status IN ('succeeded', 'failed', 'quarantined')
        THEN requested_occurred_at ELSE NULL END,
      output_manifest = requested_output_manifest,
      output_sha256 = output_digest,
      error_code = requested_error_code
  WHERE id = run.id
  RETURNING * INTO run;

  SELECT coalesce(max(event_sequence), 0) + 1 INTO next_sequence
  FROM evidence.ingestion_run_events
  WHERE tenant_scope = run.tenant_scope AND ingestion_run_id = run.id;
  INSERT INTO evidence.ingestion_run_events (
    organization_id, ingestion_run_id, event_sequence, stage, status, attempt, details, occurred_at
  ) VALUES (
    run.organization_id, run.id, next_sequence, requested_stage, next_status,
    requested_attempt, requested_details, requested_occurred_at
  );
  RETURN run;
END
$$;

-- A parser result is final evidence. In-progress state belongs to the durable
-- workflow tables, so transformation rows cannot become permanently stranded.
ALTER TABLE evidence.transformation_runs
  ADD CONSTRAINT transformation_runs_terminal_status_check CHECK (status <> 'running') NOT VALID;
ALTER TABLE evidence.transformation_runs
  VALIDATE CONSTRAINT transformation_runs_terminal_status_check;
ALTER TABLE evidence.transformation_runs
  ADD COLUMN attempt integer NOT NULL DEFAULT 1 CHECK (attempt BETWEEN 1 AND 100),
  ADD COLUMN ingestion_run_id uuid;
ALTER TABLE evidence.transformation_runs
  DROP CONSTRAINT transformation_runs_tenant_scope_raw_payload_id_parser_name_key;
ALTER TABLE evidence.transformation_runs
  ADD CONSTRAINT transformation_runs_execution_unique UNIQUE (
    tenant_scope, raw_payload_id, parser_name, parser_version,
    code_sha256, configuration_sha256, attempt
  ),
  ADD CONSTRAINT transformation_runs_ingestion_run_fkey
    FOREIGN KEY (tenant_scope, ingestion_run_id)
    REFERENCES evidence.ingestion_runs(tenant_scope, id) ON DELETE RESTRICT;

ALTER TABLE evidence.fetch_events ADD COLUMN ingestion_run_id uuid;
ALTER TABLE evidence.fetch_events
  ADD CONSTRAINT fetch_events_ingestion_run_fkey
  FOREIGN KEY (tenant_scope, ingestion_run_id)
  REFERENCES evidence.ingestion_runs(tenant_scope, id) ON DELETE RESTRICT;

-- Quality belongs to a particular parser/code/config interpretation, not only
-- to raw bytes. This permits a corrected parser to supersede a quarantined run
-- without erasing the failed scientific record.
ALTER TABLE evidence.quality_results ADD COLUMN transformation_run_id uuid;
UPDATE evidence.quality_results quality
SET transformation_run_id = (
  SELECT candidate.id
  FROM evidence.transformation_runs candidate
  WHERE candidate.tenant_scope = quality.tenant_scope
    AND candidate.raw_payload_id = quality.raw_payload_id
    AND candidate.dataset_id = quality.dataset_id
  ORDER BY candidate.completed_at DESC NULLS LAST, candidate.id
  LIMIT 1
);
ALTER TABLE evidence.quality_results ALTER COLUMN transformation_run_id SET NOT NULL;
ALTER TABLE evidence.quality_results
  DROP CONSTRAINT quality_results_tenant_scope_raw_payload_id_check_code_key;
ALTER TABLE evidence.quality_results
  ADD CONSTRAINT quality_results_transformation_run_fkey
    FOREIGN KEY (tenant_scope, transformation_run_id)
    REFERENCES evidence.transformation_runs(tenant_scope, id) ON DELETE RESTRICT,
  ADD CONSTRAINT quality_results_run_check_unique
    UNIQUE (tenant_scope, transformation_run_id, check_code);

CREATE OR REPLACE FUNCTION evidence.validate_quality_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM evidence.transformation_runs transformation
    WHERE transformation.id = NEW.transformation_run_id
      AND transformation.organization_id IS NOT DISTINCT FROM NEW.organization_id
      AND transformation.dataset_id = NEW.dataset_id
      AND transformation.raw_payload_id = NEW.raw_payload_id
  ) THEN
    RAISE EXCEPTION 'quality result must match its transformation, payload, dataset, and tenant scope'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

-- Keep the denormalized serving fields exactly aligned with their immutable
-- legal review, including expiry. Dataset-scoped reviews cannot authorize a
-- different source dataset.
CREATE OR REPLACE FUNCTION evidence.validate_source_admission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  review evidence.license_reviews%ROWTYPE;
BEGIN
  IF NEW.license_status = 'approved' THEN
    IF NEW.license_review_id IS NULL
      OR NEW.license_expression IS NULL
      OR NEW.redistribution_allowed IS NULL
      OR NEW.reviewed_at IS NULL
      OR NEW.attribution_text IS NULL
      OR cardinality(NEW.permitted_actions) = 0
    THEN
      RAISE EXCEPTION 'approved sources require a complete license review, attribution, and actions'
        USING ERRCODE = '23514';
    END IF;
    SELECT * INTO review FROM evidence.license_reviews WHERE id = NEW.license_review_id;
    IF review.id IS NULL
      OR review.source_slug <> NEW.slug
      OR review.license_expression <> NEW.license_expression
      OR NOT (NEW.permitted_actions <@ review.intended_uses)
      OR NEW.reviewed_at < review.reviewed_at
      OR (review.expires_at IS NOT NULL AND review.expires_at <= statement_timestamp())
    THEN
      RAISE EXCEPTION 'source license review does not authorize the declared source state'
        USING ERRCODE = '23514';
    END IF;
    NEW.license_review_expires_at := review.expires_at;
  ELSIF cardinality(NEW.permitted_actions) > 0 THEN
    RAISE EXCEPTION 'non-approved sources cannot expose data actions' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

UPDATE evidence.sources source
SET license_review_expires_at = review.expires_at
FROM evidence.license_reviews review
WHERE review.id = source.license_review_id
  AND source.license_review_expires_at IS DISTINCT FROM review.expires_at;

CREATE OR REPLACE FUNCTION evidence.validate_dataset_admission()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.admission_status = 'approved' THEN
    IF NEW.admitted_at IS NULL OR NOT EXISTS (
      SELECT 1
      FROM evidence.sources source
      JOIN evidence.license_reviews review ON review.id = source.license_review_id
      WHERE source.id = NEW.source_id
        AND source.organization_id IS NOT DISTINCT FROM NEW.organization_id
        AND source.license_status = 'approved'
        AND (review.dataset_external_key IS NULL OR review.dataset_external_key = NEW.external_key)
        AND review.reviewed_at <= NEW.admitted_at
        AND (review.expires_at IS NULL OR review.expires_at > NEW.admitted_at)
    ) THEN
      RAISE EXCEPTION 'approved datasets require a matching approved source review and admission time'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.admitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'non-approved datasets cannot have an admission time' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION evidence.validate_source_admission_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_actions text[];
  review_started_at timestamptz;
  review_expires_at timestamptz;
BEGIN
  SELECT source.permitted_actions, review.reviewed_at, review.expires_at
    INTO source_actions, review_started_at, review_expires_at
  FROM evidence.sources source
  JOIN evidence.license_reviews review ON review.id = source.license_review_id
  WHERE source.id = NEW.source_id
    AND source.organization_id IS NOT DISTINCT FROM NEW.organization_id
    AND source.license_review_id = NEW.license_review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source admission event scope or review is invalid' USING ERRCODE = '23514';
  END IF;
  IF NEW.decided_at < review_started_at
    OR (review_expires_at IS NOT NULL AND NEW.decided_at >= review_expires_at)
    OR NOT (NEW.permitted_actions <@ source_actions)
    OR (NEW.decision = 'approved' AND cardinality(NEW.permitted_actions) = 0)
    OR (NEW.decision IN ('rejected', 'suspended', 'expired')
      AND cardinality(NEW.permitted_actions) <> 0)
  THEN
    RAISE EXCEPTION 'source admission decision is inconsistent with the legal review'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.dataset_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM evidence.source_datasets dataset
    WHERE dataset.id = NEW.dataset_id
      AND dataset.source_id = NEW.source_id
      AND dataset.organization_id IS NOT DISTINCT FROM NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'source admission event dataset is invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

-- Approved connector binding: this is catalog metadata and configuration, not
-- an economic observation. Values still enter only through admitted payloads.
CREATE TABLE evidence.connector_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE,
  tenant_scope uuid GENERATED ALWAYS AS (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  dataset_id uuid NOT NULL,
  series_id uuid NOT NULL,
  connector_code text NOT NULL CHECK (connector_code ~ '^[a-z][a-z0-9-]{2,127}$'),
  configuration jsonb NOT NULL CHECK (jsonb_typeof(configuration) = 'object'),
  configuration_sha256 text NOT NULL CHECK (configuration_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'retired')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_scope, dataset_id)
    REFERENCES evidence.source_datasets(tenant_scope, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_scope, series_id)
    REFERENCES evidence.series(tenant_scope, id) ON DELETE RESTRICT,
  UNIQUE (tenant_scope, connector_code, series_id),
  UNIQUE (tenant_scope, id)
);

CREATE OR REPLACE FUNCTION evidence.validate_connector_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  calculated text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM evidence.series series
    WHERE series.id = NEW.series_id
      AND series.organization_id IS NOT DISTINCT FROM NEW.organization_id
      AND series.dataset_id = NEW.dataset_id
  ) THEN
    RAISE EXCEPTION 'connector binding series must belong to its dataset and tenant scope'
      USING ERRCODE = '23514';
  END IF;
  calculated := encode(digest(
    convert_to(evidence.canonical_json(NEW.configuration), 'UTF8'), 'sha256'
  ), 'hex');
  IF NEW.configuration_sha256 <> calculated THEN
    RAISE EXCEPTION 'connector binding configuration digest is invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER connector_bindings_validate
BEFORE INSERT ON evidence.connector_bindings
FOR EACH ROW EXECUTE FUNCTION evidence.validate_connector_binding();
CREATE TRIGGER connector_bindings_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.connector_bindings
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

INSERT INTO evidence.geographies (id, kind, code_scheme, code, name, valid_from)
VALUES (
  '038f47ac-19fc-7c92-ae91-0242ac120005', 'country', 'ISO-3166-1-alpha3',
  'USA', 'United States', NULL
);
INSERT INTO evidence.concepts (
  id, canonical_key, name, definition, measurement_class, ontology_version
) VALUES (
  '038f47ac-19fc-7c92-ae91-0242ac120006',
  'economy.output.gdp.nominal.current-usd',
  'Gross domestic product, current US dollars',
  'The market value of resident production reported in current United States dollars.',
  'direct',
  'economyos-1'
);
INSERT INTO evidence.series (
  id, dataset_id, concept_id, geography_id, external_series_key, unit_code,
  frequency, seasonal_adjustment, data_class
) VALUES (
  '038f47ac-19fc-7c92-ae91-0242ac120007',
  '038f47ac-19fc-7c92-ae91-0242ac120003',
  '038f47ac-19fc-7c92-ae91-0242ac120006',
  '038f47ac-19fc-7c92-ae91-0242ac120005',
  'NY.GDP.MKTP.CD:USA',
  'USD',
  'annual',
  'unadjusted',
  'observed'
);
INSERT INTO evidence.connector_bindings (
  id, dataset_id, series_id, connector_code, configuration, configuration_sha256, status
) VALUES (
  '038f47ac-19fc-7c92-ae91-0242ac120008',
  '038f47ac-19fc-7c92-ae91-0242ac120003',
  '038f47ac-19fc-7c92-ae91-0242ac120007',
  'world-bank-v2',
  '{"countryCode":"USA","indicatorCode":"NY.GDP.MKTP.CD","sourceId":2}'::jsonb,
  encode(digest(convert_to(
    evidence.canonical_json(
      '{"countryCode": "USA", "sourceId": 2, "indicatorCode": "NY.GDP.MKTP.CD"}'::jsonb
    ),
    'UTF8'
  ), 'sha256'), 'hex'),
  'active'
);

ALTER TABLE evidence.ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.ingestion_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.ingestion_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.ingestion_run_events FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.ingestion_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.ingestion_checkpoints FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.connector_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.connector_bindings FORCE ROW LEVEL SECURITY;

CREATE POLICY ingestion_runs_tenant ON evidence.ingestion_runs
  USING (evidence.tenant_visible(organization_id))
  WITH CHECK (evidence.tenant_visible(organization_id));
CREATE POLICY ingestion_run_events_tenant ON evidence.ingestion_run_events
  USING (evidence.tenant_visible(organization_id))
  WITH CHECK (evidence.tenant_visible(organization_id));
CREATE POLICY ingestion_checkpoints_tenant ON evidence.ingestion_checkpoints
  USING (evidence.tenant_visible(organization_id))
  WITH CHECK (evidence.tenant_visible(organization_id));
CREATE POLICY connector_bindings_tenant ON evidence.connector_bindings
  USING (evidence.tenant_visible(organization_id))
  WITH CHECK (evidence.tenant_visible(organization_id));

CREATE INDEX ingestion_events_run_time_idx
  ON evidence.ingestion_run_events (tenant_scope, ingestion_run_id, event_sequence DESC);
CREATE INDEX ingestion_runs_dataset_time_idx
  ON evidence.ingestion_runs (tenant_scope, dataset_id, requested_at DESC);
CREATE INDEX observations_governed_lookup_idx
  ON evidence.observations (tenant_scope, series_id, period_start, period_end, recorded_at DESC)
  INCLUDE (release_id, transformation_run_id, value_numeric, missing_reason, status, parser_version);

REVOKE ALL ON TABLE evidence.ingestion_runs, evidence.ingestion_run_events,
  evidence.ingestion_checkpoints, evidence.connector_bindings FROM PUBLIC;
GRANT SELECT, INSERT ON evidence.ingestion_runs, evidence.ingestion_checkpoints TO economyos_ingest;
GRANT SELECT ON evidence.ingestion_run_events, evidence.connector_bindings TO economyos_ingest;
REVOKE UPDATE, DELETE ON evidence.ingestion_runs FROM economyos_ingest;
REVOKE ALL ON FUNCTION evidence.record_ingestion_requested() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.transition_ingestion_run(
  uuid, text, text, text, integer, jsonb, jsonb, text, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evidence.transition_ingestion_run(
  uuid, text, text, text, integer, jsonb, jsonb, text, timestamptz
) TO economyos_ingest;

CREATE OR REPLACE FUNCTION evidence.governed_observations_as_known(
  requested_series_id uuid,
  known_at timestamptz,
  visibility_policy text,
  system_at timestamptz DEFAULT NULL,
  requested_action text DEFAULT 'view',
  maximum_rows integer DEFAULT 1000
)
RETURNS TABLE (
  observation_id uuid,
  series_id uuid,
  release_id uuid,
  raw_payload_id uuid,
  transformation_run_id uuid,
  period_start timestamptz,
  period_end timestamptz,
  value_numeric numeric,
  missing_reason text,
  observation_status text,
  parser_version text,
  release_time timestamptz,
  availability_time timestamptz,
  retrieved_at timestamptz,
  pit_quality text,
  recorded_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
BEGIN
  IF app.current_organization_id() IS NULL THEN
    RAISE EXCEPTION 'tenant context is required' USING ERRCODE = '42501';
  END IF;
  IF NOT isfinite(known_at) OR (system_at IS NOT NULL AND NOT isfinite(system_at)) THEN
    RAISE EXCEPTION 'point-in-time cutoffs must be finite' USING ERRCODE = '22023';
  END IF;
  IF visibility_policy NOT IN ('true_vintage', 'reconstructed', 'latest_revised') THEN
    RAISE EXCEPTION 'invalid visibility policy' USING ERRCODE = '22023';
  END IF;
  IF requested_action NOT IN ('view', 'api', 'export', 'derive', 'train') THEN
    RAISE EXCEPTION 'invalid data action' USING ERRCODE = '22023';
  END IF;
  IF maximum_rows NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'maximum_rows must be between 1 and 10000' USING ERRCODE = '22023';
  END IF;
  IF visibility_policy = 'reconstructed' AND system_at IS NULL THEN
    RAISE EXCEPTION 'reconstructed policy requires system_at' USING ERRCODE = '22023';
  END IF;
  IF visibility_policy = 'latest_revised' AND system_at IS NOT NULL THEN
    RAISE EXCEPTION 'latest_revised cannot claim historical system time' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (observation.period_start, observation.period_end)
    observation.id,
    observation.series_id,
    observation.release_id,
    release.raw_payload_id,
    observation.transformation_run_id,
    observation.period_start,
    observation.period_end,
    observation.value_numeric,
    observation.missing_reason,
    observation.status,
    observation.parser_version,
    release.release_time,
    release.availability_time,
    payload.fetched_at,
    release.pit_quality,
    observation.recorded_at
  FROM evidence.observations observation
  JOIN evidence.releases release
    ON release.id = observation.release_id AND release.tenant_scope = observation.tenant_scope
  JOIN evidence.raw_payloads payload
    ON payload.id = release.raw_payload_id AND payload.tenant_scope = release.tenant_scope
  JOIN evidence.series series
    ON series.id = observation.series_id AND series.tenant_scope = observation.tenant_scope
  JOIN evidence.source_datasets dataset
    ON dataset.id = series.dataset_id AND dataset.tenant_scope = series.tenant_scope
  JOIN evidence.sources source
    ON source.id = dataset.source_id AND source.tenant_scope = dataset.tenant_scope
  JOIN evidence.transformation_runs transformation
    ON transformation.id = observation.transformation_run_id
      AND transformation.tenant_scope = observation.tenant_scope
  WHERE observation.series_id = requested_series_id
    AND (observation.organization_id IS NULL OR observation.organization_id = app.current_organization_id())
    AND series.data_class NOT IN ('synthetic_demo', 'synthetic_research')
    AND series.status = 'active'
    AND dataset.admission_status = 'approved'
    AND dataset.admitted_at IS NOT NULL
    AND source.license_status = 'approved'
    AND source.license_review_id IS NOT NULL
    AND (source.license_review_expires_at IS NULL
      OR source.license_review_expires_at > statement_timestamp())
    AND requested_action = ANY(source.permitted_actions)
    AND (requested_action <> 'export' OR source.redistribution_allowed = true)
    AND transformation.status = 'succeeded'
    AND observation.period_end <= known_at
    AND EXISTS (
      SELECT 1 FROM evidence.quality_results quality
      WHERE quality.transformation_run_id = observation.transformation_run_id
        AND quality.tenant_scope = observation.tenant_scope
        AND quality.check_code = 'admission'
        AND quality.status = 'pass'
    )
    AND NOT EXISTS (
      SELECT 1 FROM evidence.quality_results quality
      WHERE quality.transformation_run_id = observation.transformation_run_id
        AND quality.tenant_scope = observation.tenant_scope
        AND quality.status = 'fail'
    )
    AND CASE visibility_policy
      WHEN 'true_vintage' THEN
        release.pit_quality = 'true_vintage'
        AND release.release_time IS NOT NULL
        AND release.source_publication_time IS NOT NULL
        AND release.availability_time IS NOT NULL
        AND release.release_time <= known_at
        AND release.source_publication_time <= known_at
        AND release.availability_time <= known_at
        AND payload.fetched_at <= known_at
        AND (system_at IS NULL OR observation.recorded_at <= system_at)
      WHEN 'reconstructed' THEN
        release.pit_quality IN ('true_vintage', 'reconstructed_only')
        AND release.release_time IS NOT NULL
        AND release.availability_time IS NOT NULL
        AND release.release_time <= known_at
        AND release.availability_time <= known_at
        AND payload.fetched_at <= system_at
        AND transformation.completed_at <= system_at
        AND observation.recorded_at <= system_at
      WHEN 'latest_revised' THEN true
      ELSE false
    END
  ORDER BY
    observation.period_start,
    observation.period_end,
    release.revision_sequence DESC NULLS LAST,
    release.revision_time DESC NULLS LAST,
    release.release_time DESC NULLS LAST,
    observation.recorded_at DESC,
    observation.id DESC
  LIMIT maximum_rows;
END
$$;

CREATE OR REPLACE FUNCTION evidence.governed_observation_provenance(
  requested_observation_id uuid,
  requested_action text DEFAULT 'view'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  result jsonb;
BEGIN
  IF app.current_organization_id() IS NULL THEN
    RAISE EXCEPTION 'tenant context is required' USING ERRCODE = '42501';
  END IF;
  IF requested_action NOT IN ('view', 'api', 'export', 'derive', 'train') THEN
    RAISE EXCEPTION 'invalid data action' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_build_object(
    'observationId', observation.id,
    'seriesId', observation.series_id,
    'dataset', jsonb_build_object('id', dataset.id, 'externalKey', dataset.external_key),
    'source', jsonb_build_object(
      'id', source.id,
      'name', source.name,
      'homepageUri', source.homepage_uri,
      'license', source.license_expression,
      'attribution', source.attribution_text
    ),
    'rawPayload', jsonb_build_object(
      'id', payload.id,
      'objectUri', payload.object_uri,
      'checksumSha256', payload.checksum_sha256,
      'byteLength', payload.byte_length,
      'fetchedAt', payload.fetched_at
    ),
    'release', jsonb_build_object(
      'id', release.id,
      'releaseTime', release.release_time,
      'availabilityTime', release.availability_time,
      'pitQuality', release.pit_quality
    ),
    'transformation', jsonb_build_object(
      'id', transformation.id,
      'parser', transformation.parser_name,
      'parserVersion', transformation.parser_version,
      'codeSha256', transformation.code_sha256,
      'configurationSha256', transformation.configuration_sha256,
      'attempt', transformation.attempt
    ),
    'quality', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'code', quality.check_code,
        'status', quality.status,
        'details', quality.details,
        'checkedAt', quality.checked_at
      ) ORDER BY quality.check_code)
      FROM evidence.quality_results quality
      WHERE quality.transformation_run_id = transformation.id
        AND quality.tenant_scope = transformation.tenant_scope
    ), '[]'::jsonb)
  ) INTO result
  FROM evidence.observations observation
  JOIN evidence.releases release
    ON release.id = observation.release_id AND release.tenant_scope = observation.tenant_scope
  JOIN evidence.raw_payloads payload
    ON payload.id = release.raw_payload_id AND payload.tenant_scope = release.tenant_scope
  JOIN evidence.series series
    ON series.id = observation.series_id AND series.tenant_scope = observation.tenant_scope
  JOIN evidence.source_datasets dataset
    ON dataset.id = series.dataset_id AND dataset.tenant_scope = series.tenant_scope
  JOIN evidence.sources source
    ON source.id = dataset.source_id AND source.tenant_scope = dataset.tenant_scope
  JOIN evidence.transformation_runs transformation
    ON transformation.id = observation.transformation_run_id
      AND transformation.tenant_scope = observation.tenant_scope
  WHERE observation.id = requested_observation_id
    AND (observation.organization_id IS NULL OR observation.organization_id = app.current_organization_id())
    AND series.data_class NOT IN ('synthetic_demo', 'synthetic_research')
    AND series.status = 'active'
    AND dataset.admission_status = 'approved'
    AND dataset.admitted_at IS NOT NULL
    AND source.license_status = 'approved'
    AND source.license_review_id IS NOT NULL
    AND (source.license_review_expires_at IS NULL
      OR source.license_review_expires_at > statement_timestamp())
    AND requested_action = ANY(source.permitted_actions)
    AND (requested_action <> 'export' OR source.redistribution_allowed = true)
    AND transformation.status = 'succeeded'
    AND EXISTS (
      SELECT 1 FROM evidence.quality_results quality
      WHERE quality.transformation_run_id = transformation.id
        AND quality.tenant_scope = transformation.tenant_scope
        AND quality.check_code = 'admission'
        AND quality.status = 'pass'
    )
    AND NOT EXISTS (
      SELECT 1 FROM evidence.quality_results quality
      WHERE quality.transformation_run_id = transformation.id
        AND quality.tenant_scope = transformation.tenant_scope
        AND quality.status = 'fail'
    );
  RETURN result;
END
$$;

REVOKE ALL ON FUNCTION evidence.governed_observations_as_known(
  uuid, timestamptz, text, timestamptz, text, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.governed_observation_provenance(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evidence.governed_observations_as_known(
  uuid, timestamptz, text, timestamptz, text, integer
) TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.governed_observation_provenance(uuid, text)
  TO economyos_app;

COMMENT ON TABLE evidence.ingestion_run_events IS
  'Append-only durable stage history; the mutable run row is only a query summary.';
COMMENT ON TABLE evidence.ingestion_checkpoints IS
  'Content-addressed immutable workflow checkpoints; replay must match the stored digest.';
COMMENT ON COLUMN evidence.quality_results.transformation_run_id IS
  'Quality result applies to one exact parser/code/config interpretation of raw bytes.';
