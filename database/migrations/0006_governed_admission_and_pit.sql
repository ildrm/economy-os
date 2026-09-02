-- Phase 2 hardening: auditable source admission, parser runs, governed serving,
-- W3C trace correlation, and point-in-time semantics that do not leak future data.

ALTER TABLE audit.events
  ALTER COLUMN trace_id TYPE text USING replace(trace_id::text, '-', '');
ALTER TABLE audit.events
  ADD CONSTRAINT audit_events_trace_id_w3c_check
  CHECK (trace_id ~ '^[0-9a-f]{32}$' AND trace_id <> repeat('0', 32));

CREATE TABLE evidence.license_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_slug text NOT NULL CHECK (source_slug ~ '^[a-z0-9][a-z0-9-]{1,127}$'),
  dataset_external_key text,
  evidence_uri text NOT NULL CHECK (evidence_uri ~ '^https://'),
  license_expression text NOT NULL CHECK (length(btrim(license_expression)) BETWEEN 1 AND 128),
  intended_uses text[] NOT NULL CHECK (
    intended_uses <@ ARRAY['view', 'api', 'export', 'derive', 'train']::text[]
    AND cardinality(intended_uses) > 0
  ),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  reviewed_by text NOT NULL CHECK (length(btrim(reviewed_by)) BETWEEN 1 AND 300),
  reviewed_at timestamptz NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (expires_at IS NULL OR expires_at > reviewed_at)
);

CREATE OR REPLACE FUNCTION evidence.set_license_review_digest()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.evidence_sha256 := encode(digest(convert_to(NEW.evidence::text, 'UTF8'), 'sha256'), 'hex');
  RETURN NEW;
END
$$;

CREATE TRIGGER license_reviews_set_digest
BEFORE INSERT ON evidence.license_reviews
FOR EACH ROW EXECUTE FUNCTION evidence.set_license_review_digest();

CREATE TRIGGER license_reviews_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.license_reviews
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

ALTER TABLE evidence.sources
  ADD COLUMN license_review_id uuid REFERENCES evidence.license_reviews(id) ON DELETE RESTRICT,
  ADD COLUMN attribution_text text,
  ADD COLUMN permitted_actions text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN license_review_expires_at timestamptz;

ALTER TABLE evidence.sources
  ADD CONSTRAINT sources_permitted_actions_check CHECK (
    permitted_actions <@ ARRAY['view', 'api', 'export', 'derive', 'train']::text[]
  ),
  ADD CONSTRAINT sources_review_expiry_check CHECK (
    license_review_expires_at IS NULL OR reviewed_at IS NULL OR license_review_expires_at > reviewed_at
  );

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
      OR (review.expires_at IS NOT NULL AND review.expires_at <= clock_timestamp())
    THEN
      RAISE EXCEPTION 'source license review does not authorize the declared source state'
        USING ERRCODE = '23514';
    END IF;
  ELSIF cardinality(NEW.permitted_actions) > 0 THEN
    RAISE EXCEPTION 'non-approved sources cannot expose data actions' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER sources_validate_admission
BEFORE INSERT OR UPDATE ON evidence.sources
FOR EACH ROW EXECUTE FUNCTION evidence.validate_source_admission();

CREATE TABLE evidence.source_admission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE,
  source_id uuid NOT NULL,
  dataset_id uuid,
  decision text NOT NULL CHECK (decision IN ('approved', 'restricted', 'rejected', 'suspended', 'expired')),
  permitted_actions text[] NOT NULL DEFAULT '{}'::text[] CHECK (
    permitted_actions <@ ARRAY['view', 'api', 'export', 'derive', 'train']::text[]
  ),
  license_review_id uuid NOT NULL REFERENCES evidence.license_reviews(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),
  decided_by text NOT NULL CHECK (length(btrim(decided_by)) BETWEEN 1 AND 300),
  decided_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (source_id) REFERENCES evidence.sources(id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION evidence.validate_source_admission_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM evidence.sources source
    WHERE source.id = NEW.source_id
      AND source.organization_id IS NOT DISTINCT FROM NEW.organization_id
      AND source.license_review_id = NEW.license_review_id
  ) THEN
    RAISE EXCEPTION 'source admission event scope or review is invalid' USING ERRCODE = '23514';
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

CREATE TRIGGER source_admission_events_validate
BEFORE INSERT ON evidence.source_admission_events
FOR EACH ROW EXECUTE FUNCTION evidence.validate_source_admission_event();
CREATE TRIGGER source_admission_events_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.source_admission_events
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE OR REPLACE FUNCTION evidence.validate_dataset_admission()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.admission_status = 'approved' THEN
    IF NEW.admitted_at IS NULL OR NOT EXISTS (
      SELECT 1 FROM evidence.sources source
      WHERE source.id = NEW.source_id
        AND source.organization_id IS NOT DISTINCT FROM NEW.organization_id
        AND source.license_status = 'approved'
        AND source.license_review_id IS NOT NULL
        AND (source.license_review_expires_at IS NULL OR source.license_review_expires_at > NEW.admitted_at)
    ) THEN
      RAISE EXCEPTION 'approved datasets require a currently approved source and admission time'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.admitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'non-approved datasets cannot have an admission time' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER source_datasets_validate_admission
BEFORE INSERT OR UPDATE ON evidence.source_datasets
FOR EACH ROW EXECUTE FUNCTION evidence.validate_dataset_admission();

CREATE TABLE evidence.fetch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE,
  tenant_scope uuid GENERATED ALWAYS AS (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  dataset_id uuid NOT NULL,
  raw_payload_id uuid NOT NULL,
  request_uri text NOT NULL CHECK (request_uri ~ '^https://'),
  fetched_at timestamptz NOT NULL,
  provider_request_id text,
  response_status integer CHECK (response_status BETWEEN 100 AND 599),
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt BETWEEN 1 AND 100),
  workflow_id text NOT NULL CHECK (length(workflow_id) BETWEEN 1 AND 512),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_scope, dataset_id)
    REFERENCES evidence.source_datasets(tenant_scope, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_scope, raw_payload_id)
    REFERENCES evidence.raw_payloads(tenant_scope, id) ON DELETE RESTRICT,
  UNIQUE (tenant_scope, workflow_id, request_uri, attempt),
  UNIQUE (tenant_scope, id)
);

CREATE TABLE evidence.transformation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE,
  tenant_scope uuid GENERATED ALWAYS AS (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  dataset_id uuid NOT NULL,
  raw_payload_id uuid NOT NULL,
  parser_name text NOT NULL CHECK (length(btrim(parser_name)) BETWEEN 1 AND 200),
  parser_version text NOT NULL CHECK (length(btrim(parser_version)) BETWEEN 1 AND 200),
  code_sha256 text NOT NULL CHECK (code_sha256 ~ '^[0-9a-f]{64}$'),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
  configuration_sha256 text NOT NULL CHECK (configuration_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'quarantined')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  error_code text,
  workflow_id text NOT NULL CHECK (length(workflow_id) BETWEEN 1 AND 512),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_scope, dataset_id)
    REFERENCES evidence.source_datasets(tenant_scope, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_scope, raw_payload_id)
    REFERENCES evidence.raw_payloads(tenant_scope, id) ON DELETE RESTRICT,
  CHECK ((status = 'running') = (completed_at IS NULL)),
  CHECK (completed_at IS NULL OR completed_at >= started_at),
  CHECK ((status IN ('failed', 'quarantined')) OR error_code IS NULL),
  UNIQUE (
    tenant_scope, raw_payload_id, parser_name, parser_version, code_sha256, configuration_sha256
  ),
  UNIQUE (tenant_scope, id)
);

CREATE TRIGGER fetch_events_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.fetch_events
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER transformation_runs_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.transformation_runs
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

INSERT INTO evidence.fetch_events (
  organization_id, dataset_id, raw_payload_id, request_uri, fetched_at,
  provider_request_id, response_status, workflow_id
)
SELECT
  organization_id, dataset_id, id, request_uri, fetched_at,
  provider_request_id, 200, 'legacy:' || id::text
FROM evidence.raw_payloads;

INSERT INTO evidence.transformation_runs (
  organization_id, dataset_id, raw_payload_id, parser_name, parser_version,
  code_sha256, configuration, configuration_sha256, status,
  started_at, completed_at, workflow_id
)
SELECT
  organization_id,
  dataset_id,
  id,
  parser_name,
  parser_version,
  encode(digest(convert_to('legacy:' || parser_name || ':' || parser_version, 'UTF8'), 'sha256'), 'hex'),
  '{}'::jsonb,
  encode(digest(convert_to('{}', 'UTF8'), 'sha256'), 'hex'),
  'succeeded',
  fetched_at,
  recorded_at,
  'legacy:' || id::text
FROM evidence.raw_payloads;

ALTER TABLE evidence.observations ADD COLUMN transformation_run_id uuid;
ALTER TABLE evidence.observations DISABLE TRIGGER observations_reject_update_delete;
UPDATE evidence.observations observation
SET transformation_run_id = transformation.id
FROM evidence.releases release
JOIN evidence.transformation_runs transformation
  ON transformation.raw_payload_id = release.raw_payload_id
  AND transformation.tenant_scope = release.tenant_scope
WHERE observation.release_id = release.id
  AND observation.tenant_scope = release.tenant_scope;
ALTER TABLE evidence.observations ENABLE TRIGGER observations_reject_update_delete;
ALTER TABLE evidence.observations ALTER COLUMN transformation_run_id SET NOT NULL;
ALTER TABLE evidence.observations
  ADD CONSTRAINT observations_tenant_scope_transformation_run_id_fkey
  FOREIGN KEY (tenant_scope, transformation_run_id)
  REFERENCES evidence.transformation_runs(tenant_scope, id) ON DELETE RESTRICT;
ALTER TABLE evidence.observations
  DROP CONSTRAINT observations_tenant_scope_series_id_release_id_period_start_key;
ALTER TABLE evidence.observations
  ADD CONSTRAINT observations_interpretation_unique UNIQUE (
    tenant_scope, series_id, release_id, period_start, period_end, transformation_run_id
  );

ALTER TABLE evidence.releases
  ADD COLUMN source_publication_time timestamptz,
  ADD COLUMN original_release_time timestamptz,
  ADD COLUMN availability_time timestamptz,
  ADD COLUMN revision_time timestamptz;
UPDATE evidence.releases
SET source_publication_time = release_time,
    original_release_time = release_time,
    availability_time = release_time,
    revision_time = release_time
WHERE release_time IS NOT NULL;
ALTER TABLE evidence.releases
  ADD CONSTRAINT releases_true_vintage_times_check CHECK (
    pit_quality <> 'true_vintage'
    OR (
      release_time IS NOT NULL
      AND source_publication_time IS NOT NULL
      AND original_release_time IS NOT NULL
      AND availability_time IS NOT NULL
    )
  ),
  ADD CONSTRAINT releases_availability_order_check CHECK (
    availability_time IS NULL OR source_publication_time IS NULL
    OR availability_time >= source_publication_time
  );

ALTER TABLE evidence.observations
  ADD CONSTRAINT observations_suppression_check CHECK (
    (status = 'suppressed') = (value_numeric IS NULL AND missing_reason = 'suppressed')
  ) NOT VALID;
ALTER TABLE evidence.observations VALIDATE CONSTRAINT observations_suppression_check;

CREATE OR REPLACE FUNCTION evidence.validate_observation_transformation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM evidence.transformation_runs transformation
    JOIN evidence.releases release
      ON release.raw_payload_id = transformation.raw_payload_id
      AND release.tenant_scope = transformation.tenant_scope
    JOIN evidence.series series
      ON series.dataset_id = transformation.dataset_id
      AND series.tenant_scope = transformation.tenant_scope
    WHERE transformation.id = NEW.transformation_run_id
      AND transformation.tenant_scope = NEW.tenant_scope
      AND transformation.status = 'succeeded'
      AND transformation.parser_version = NEW.parser_version
      AND release.id = NEW.release_id
      AND series.id = NEW.series_id
  ) THEN
    RAISE EXCEPTION 'observation transformation must be a successful run for its raw release and series dataset'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER observations_validate_transformation
BEFORE INSERT ON evidence.observations
FOR EACH ROW EXECUTE FUNCTION evidence.validate_observation_transformation();

CREATE TRIGGER quality_results_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.quality_results
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE OR REPLACE FUNCTION evidence.verify_snapshot_manifest()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  calculated text;
BEGIN
  calculated := encode(digest(convert_to(NEW.manifest::text, 'UTF8'), 'sha256'), 'hex');
  IF NEW.manifest_sha256 <> calculated THEN
    RAISE EXCEPTION 'dataset snapshot manifest digest is invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER dataset_snapshots_verify_manifest
BEFORE INSERT ON evidence.dataset_snapshots
FOR EACH ROW EXECUTE FUNCTION evidence.verify_snapshot_manifest();

CREATE OR REPLACE FUNCTION evidence.lineage_endpoint_scope(endpoint_type text, endpoint_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  scope uuid;
  found boolean := false;
BEGIN
  CASE endpoint_type
    WHEN 'payload' THEN
      SELECT organization_id, true INTO scope, found FROM evidence.raw_payloads WHERE id = endpoint_id;
    WHEN 'release' THEN
      SELECT organization_id, true INTO scope, found FROM evidence.releases WHERE id = endpoint_id;
    WHEN 'observation' THEN
      SELECT organization_id, true INTO scope, found FROM evidence.observations WHERE id = endpoint_id;
    WHEN 'dataset' THEN
      SELECT organization_id, true INTO scope, found FROM evidence.source_datasets WHERE id = endpoint_id;
    WHEN 'run' THEN
      SELECT organization_id, true INTO scope, found FROM evidence.transformation_runs WHERE id = endpoint_id;
    ELSE
      RAISE EXCEPTION 'lineage endpoint type % is not available in this phase', endpoint_type
        USING ERRCODE = '23514';
  END CASE;
  IF NOT found THEN
    RAISE EXCEPTION 'lineage endpoint does not exist' USING ERRCODE = '23503';
  END IF;
  RETURN scope;
END
$$;

CREATE OR REPLACE FUNCTION evidence.validate_lineage_edge()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  from_scope uuid;
  to_scope uuid;
BEGIN
  from_scope := evidence.lineage_endpoint_scope(NEW.from_type, NEW.from_id);
  to_scope := evidence.lineage_endpoint_scope(NEW.to_type, NEW.to_id);
  IF NEW.organization_id IS NULL THEN
    IF from_scope IS NOT NULL OR to_scope IS NOT NULL THEN
      RAISE EXCEPTION 'global lineage edges can reference only global endpoints' USING ERRCODE = '23514';
    END IF;
  ELSIF to_scope IS DISTINCT FROM NEW.organization_id
    OR (from_scope IS NOT NULL AND from_scope IS DISTINCT FROM NEW.organization_id)
  THEN
    RAISE EXCEPTION 'lineage edge crosses an organization boundary' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER lineage_edges_validate_scope
BEFORE INSERT ON evidence.lineage_edges
FOR EACH ROW EXECUTE FUNCTION evidence.validate_lineage_edge();
CREATE UNIQUE INDEX lineage_edges_scope_unique_idx ON evidence.lineage_edges (
  coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
  from_type, from_id, to_type, to_id, relation
);

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
    AND (source.license_review_expires_at IS NULL OR source.license_review_expires_at > clock_timestamp())
    AND requested_action = ANY(source.permitted_actions)
    AND (requested_action <> 'export' OR source.redistribution_allowed = true)
    AND transformation.status = 'succeeded'
    AND observation.period_end <= known_at
    AND EXISTS (
      SELECT 1 FROM evidence.quality_results quality
      WHERE quality.raw_payload_id = payload.id
        AND quality.tenant_scope = payload.tenant_scope
        AND quality.check_code = 'admission'
        AND quality.status = 'pass'
    )
    AND NOT EXISTS (
      SELECT 1 FROM evidence.quality_results quality
      WHERE quality.raw_payload_id = payload.id
        AND quality.tenant_scope = payload.tenant_scope
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
      'configurationSha256', transformation.configuration_sha256
    ),
    'quality', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'code', quality.check_code,
        'status', quality.status,
        'details', quality.details,
        'checkedAt', quality.checked_at
      ) ORDER BY quality.check_code)
      FROM evidence.quality_results quality
      WHERE quality.raw_payload_id = payload.id AND quality.tenant_scope = payload.tenant_scope
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
    AND dataset.admission_status = 'approved'
    AND source.license_status = 'approved'
    AND requested_action = ANY(source.permitted_actions)
    AND (requested_action <> 'export' OR source.redistribution_allowed = true)
    AND EXISTS (
      SELECT 1 FROM evidence.quality_results quality
      WHERE quality.raw_payload_id = payload.id
        AND quality.tenant_scope = payload.tenant_scope
        AND quality.check_code = 'admission'
        AND quality.status = 'pass'
    )
    AND NOT EXISTS (
      SELECT 1 FROM evidence.quality_results quality
      WHERE quality.raw_payload_id = payload.id
        AND quality.tenant_scope = payload.tenant_scope
        AND quality.status = 'fail'
    );
  RETURN result;
END
$$;

ALTER TABLE evidence.license_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.license_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.source_admission_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.source_admission_events FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.fetch_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.fetch_events FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.transformation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.transformation_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY license_reviews_governance_only ON evidence.license_reviews USING (false) WITH CHECK (false);
CREATE POLICY source_admission_events_tenant ON evidence.source_admission_events
  USING (organization_id IS NULL OR organization_id = app.current_organization_id())
  WITH CHECK (organization_id IS NULL OR organization_id = app.current_organization_id());
CREATE POLICY fetch_events_tenant ON evidence.fetch_events
  USING (evidence.tenant_visible(organization_id))
  WITH CHECK (evidence.tenant_visible(organization_id));
CREATE POLICY transformation_runs_tenant ON evidence.transformation_runs
  USING (evidence.tenant_visible(organization_id))
  WITH CHECK (evidence.tenant_visible(organization_id));

REVOKE SELECT ON evidence.sources, evidence.source_datasets, evidence.geographies,
  evidence.concepts, evidence.series, evidence.releases, evidence.observations,
  evidence.quality_results, evidence.dataset_snapshots, evidence.lineage_edges
  FROM economyos_app;
REVOKE EXECUTE ON FUNCTION evidence.observations_as_known(uuid, timestamptz, text, timestamptz)
  FROM economyos_app;
GRANT EXECUTE ON FUNCTION evidence.governed_observations_as_known(
  uuid, timestamptz, text, timestamptz, text, integer
) TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.governed_observation_provenance(uuid, text)
  TO economyos_app;

GRANT SELECT, INSERT ON evidence.fetch_events, evidence.transformation_runs
  TO economyos_ingest;
GRANT SELECT ON evidence.license_reviews, evidence.source_admission_events
  TO economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.lineage_endpoint_scope(text, uuid)
  TO economyos_ingest;

-- The WDI dataset is admitted specifically, not the entire World Bank API. The
-- evidence snapshot captures the official catalog metadata needed to re-review
-- this decision without treating a generic API hostname as a license grant.
WITH review AS (
  INSERT INTO evidence.license_reviews (
    id, source_slug, dataset_external_key, evidence_uri, license_expression,
    intended_uses, evidence, reviewed_by, reviewed_at
  ) VALUES (
    '038f47ac-19fc-7c92-ae91-0242ac120001',
    'world-bank',
    'WDI:source=2',
    'https://datacatalog.worldbank.org/search/dataset/0037712/world-development-indicators',
    'CC-BY-4.0',
    ARRAY['view', 'api', 'export', 'derive', 'train'],
    jsonb_build_object(
      'catalogId', '0037712',
      'dataset', 'World Development Indicators',
      'classification', 'Public',
      'license', 'Creative Commons Attribution 4.0',
      'metadataLastUpdated', '2026-07-20',
      'capturedAt', '2026-08-31T00:00:00Z',
      'obligations', jsonb_build_array('attribution', 'indicate modifications')
    ),
    'EconomyOS source-governance review',
    '2026-08-31T00:00:00Z'
  )
  RETURNING id
), source AS (
  INSERT INTO evidence.sources (
    id, slug, name, authority_class, jurisdiction, homepage_uri, classification,
    license_status, license_expression, redistribution_allowed, retention_policy,
    reviewed_at, license_review_id, attribution_text, permitted_actions
  ) SELECT
    '038f47ac-19fc-7c92-ae91-0242ac120002',
    'world-bank',
    'World Bank',
    'multilateral',
    'international',
    'https://data.worldbank.org/',
    'public',
    'approved',
    'CC-BY-4.0',
    true,
    jsonb_build_object('raw', 'indefinite', 'review', 'annual'),
    '2026-08-31T00:00:00Z',
    review.id,
    'World Bank, World Development Indicators (WDI). Changes and EconomyOS transformations are identified.',
    ARRAY['view', 'api', 'export', 'derive', 'train']
  FROM review
  RETURNING id, organization_id
), dataset AS (
  INSERT INTO evidence.source_datasets (
    id, source_id, external_key, title, methodology_uri, pit_quality,
    expected_frequency, release_schedule, admission_status, admitted_at
  ) SELECT
    '038f47ac-19fc-7c92-ae91-0242ac120003',
    source.id,
    'WDI:source=2',
    'World Development Indicators',
    'https://datacatalog.worldbank.org/search/dataset/0037712/world-development-indicators',
    'latest_revised_only',
    'annual',
    jsonb_build_object(
      'releaseTime', 'not supplied by Indicators API',
      'eligiblePolicy', 'latest_revised',
      'apiSourceId', 2
    ),
    'approved',
    '2026-08-31T00:00:00Z'
  FROM source
  RETURNING id
)
INSERT INTO evidence.source_admission_events (
  id, source_id, dataset_id, decision, permitted_actions, license_review_id,
  reason, decided_by, decided_at
)
SELECT
  '038f47ac-19fc-7c92-ae91-0242ac120004',
  '038f47ac-19fc-7c92-ae91-0242ac120002',
  dataset.id,
  'approved',
  ARRAY['view', 'api', 'export', 'derive', 'train'],
  '038f47ac-19fc-7c92-ae91-0242ac120001',
  'Official catalog record classifies WDI as public under CC BY 4.0; connector is pinned to API source=2 and must preserve attribution.',
  'EconomyOS source-governance review',
  '2026-08-31T00:00:00Z'
FROM dataset;

COMMENT ON FUNCTION evidence.governed_observations_as_known IS
  'Only supported serving path for Phase 2 observations; enforces tenant, license, admission, quality, action, period, release, availability, retrieval, and system-time rules.';
COMMENT ON TABLE evidence.transformation_runs IS
  'Immutable parser/code/config executions, allowing corrected interpretations of unchanged source bytes.';
