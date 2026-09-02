-- Historical serving must use database-recorded evidence, never caller-authored
-- event times or mutable current-state shortcuts. Existing quality rows receive
-- an honest migration-time recording timestamp; they are deliberately not
-- backdated from checked_at.

ALTER TABLE evidence.quality_results ADD COLUMN recorded_at timestamptz;
UPDATE evidence.quality_results SET recorded_at = clock_timestamp();
ALTER TABLE evidence.quality_results
  ALTER COLUMN recorded_at SET DEFAULT clock_timestamp(),
  ALTER COLUMN recorded_at SET NOT NULL,
  ADD CONSTRAINT quality_results_recorded_at_finite CHECK (isfinite(recorded_at));

CREATE INDEX quality_results_run_recorded_idx
  ON evidence.quality_results (
    tenant_scope, transformation_run_id, recorded_at, check_code, status
  );

-- Runtime ingestion may author the scientific/check time, but not the database
-- system time at which that assertion entered the governed evidence store.
REVOKE INSERT ON evidence.quality_results FROM economyos_ingest;
GRANT INSERT (
  id, organization_id, dataset_id, raw_payload_id, transformation_run_id,
  check_code, status, details, checked_at
) ON evidence.quality_results TO economyos_ingest;

-- No runtime role currently inserts legal-admission events. Keep that boundary
-- explicit so recorded_at cannot become caller-controlled through a later grant.
REVOKE INSERT ON evidence.source_admission_events
  FROM PUBLIC, economyos_app, economyos_ingest;

COMMENT ON COLUMN evidence.quality_results.recorded_at IS
  'Database-authored system recording time. Rows predating migration 0022 use honest migration time, never caller-authored checked_at.';

CREATE OR REPLACE FUNCTION evidence.validate_source_admission_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  source evidence.sources%ROWTYPE;
  dataset evidence.source_datasets%ROWTYPE;
  review evidence.license_reviews%ROWTYPE;
BEGIN
  SELECT * INTO source
  FROM evidence.sources candidate
  WHERE candidate.id = NEW.source_id
    AND candidate.organization_id IS NOT DISTINCT FROM NEW.organization_id;
  SELECT * INTO review
  FROM evidence.license_reviews candidate
  WHERE candidate.id = NEW.license_review_id;
  IF NEW.dataset_id IS NOT NULL THEN
    SELECT * INTO dataset
    FROM evidence.source_datasets candidate
    WHERE candidate.id = NEW.dataset_id
      AND candidate.source_id = NEW.source_id
      AND candidate.organization_id IS NOT DISTINCT FROM NEW.organization_id;
  END IF;

  IF source.id IS NULL OR review.id IS NULL
    OR source.license_review_id IS DISTINCT FROM review.id
    OR review.source_slug IS DISTINCT FROM source.slug
    OR NOT (NEW.permitted_actions <@ source.permitted_actions)
    OR NOT (NEW.permitted_actions <@ review.intended_uses)
    OR (NEW.decision = 'approved' AND cardinality(NEW.permitted_actions) = 0)
    OR (
      NEW.decision IN ('rejected', 'suspended', 'expired')
      AND cardinality(NEW.permitted_actions) <> 0
    )
    OR review.reviewed_at > NEW.decided_at
    OR (review.expires_at IS NOT NULL AND review.expires_at <= NEW.decided_at)
    OR NOT isfinite(NEW.decided_at) OR NOT isfinite(NEW.recorded_at)
    OR (
      NEW.dataset_id IS NULL
      AND review.dataset_external_key IS NOT NULL
    )
    OR (
      NEW.dataset_id IS NOT NULL
      AND (
        dataset.id IS NULL
        OR (
          review.dataset_external_key IS NOT NULL
          AND review.dataset_external_key IS DISTINCT FROM dataset.external_key
        )
      )
    )
  THEN
    RAISE EXCEPTION 'source admission event scope, review, or evidence time is invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

-- New canonical admissions atomically freeze both the admission-time series
-- assertion and the exact quality set. Pre-0022 admissions are intentionally
-- not backfilled and therefore cannot support reconstructed or explicit-system
-- historical claims.
CREATE TABLE evidence.canonical_admission_evidence_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES app.organizations(id) ON DELETE RESTRICT,
  tenant_scope uuid GENERATED ALWAYS AS (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  admission_id uuid NOT NULL,
  observation_id uuid NOT NULL,
  transformation_run_id uuid NOT NULL,
  series_id uuid NOT NULL,
  source_id uuid NOT NULL,
  source_dataset_id uuid NOT NULL,
  license_review_id uuid NOT NULL REFERENCES evidence.license_reviews(id) ON DELETE RESTRICT,
  source_admission_event_id uuid NOT NULL
    REFERENCES evidence.source_admission_events(id) ON DELETE RESTRICT,
  series_status text NOT NULL CHECK (series_status = 'active'),
  series_data_class text NOT NULL CHECK (
    series_data_class IN ('observed', 'estimated', 'forecast', 'scenario', 'unknown')
  ),
  admission_created_at timestamptz NOT NULL CHECK (isfinite(admission_created_at)),
  quality_result_count integer NOT NULL CHECK (quality_result_count BETWEEN 1 AND 10000),
  evidence_manifest jsonb NOT NULL CHECK (jsonb_typeof(evidence_manifest) = 'object'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(recorded_at)),
  FOREIGN KEY (tenant_scope, admission_id)
    REFERENCES evidence.canonical_admissions(tenant_scope, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_scope, observation_id)
    REFERENCES evidence.observations(tenant_scope, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_scope, transformation_run_id)
    REFERENCES evidence.transformation_runs(tenant_scope, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_scope, series_id)
    REFERENCES evidence.series(tenant_scope, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_scope, source_id)
    REFERENCES evidence.sources(tenant_scope, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_scope, source_dataset_id)
    REFERENCES evidence.source_datasets(tenant_scope, id) ON DELETE RESTRICT,
  UNIQUE (tenant_scope, admission_id),
  UNIQUE (tenant_scope, observation_id),
  UNIQUE (tenant_scope, id)
);

CREATE INDEX canonical_admission_evidence_transformation_idx
  ON evidence.canonical_admission_evidence_sets (
    tenant_scope, transformation_run_id, admission_created_at, observation_id
  );

CREATE OR REPLACE FUNCTION evidence.validate_canonical_admission_series_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  bound_context record;
  effective_scope uuid;
BEGIN
  effective_scope := coalesce(
    NEW.organization_id, '00000000-0000-0000-0000-000000000000'::uuid
  );
  SELECT
    series.id AS series_id,
    series.status AS series_status,
    series.data_class AS series_data_class,
    dataset.id AS dataset_id,
    dataset.admission_status AS dataset_admission_status,
    dataset.admitted_at AS dataset_admitted_at,
    source.id AS source_id,
    source.license_status AS source_license_status,
    source.license_review_expires_at,
    review.id AS review_id,
    review.reviewed_at,
    review.created_at AS review_created_at,
    review.expires_at AS review_expires_at,
    decision.id AS decision_id,
    decision.decision,
    decision.permitted_actions
  INTO bound_context
  FROM evidence.observations observation
  JOIN evidence.releases release
    ON release.id = observation.release_id
    AND release.tenant_scope = observation.tenant_scope
  JOIN evidence.series series
    ON series.id = observation.series_id
    AND series.tenant_scope = observation.tenant_scope
  JOIN evidence.source_datasets dataset
    ON dataset.id = series.dataset_id
    AND dataset.tenant_scope = series.tenant_scope
  JOIN evidence.sources source
    ON source.id = dataset.source_id
    AND source.tenant_scope = dataset.tenant_scope
  JOIN evidence.license_reviews review
    ON review.id = source.license_review_id
    AND review.source_slug = source.slug
    AND (
      review.dataset_external_key IS NULL
      OR review.dataset_external_key = dataset.external_key
    )
  JOIN LATERAL (
    SELECT candidate.*
    FROM evidence.source_admission_events candidate
    WHERE candidate.source_id = source.id
      AND candidate.organization_id IS NOT DISTINCT FROM source.organization_id
      AND (candidate.dataset_id IS NULL OR candidate.dataset_id = dataset.id)
      AND candidate.license_review_id = review.id
      AND candidate.decided_at <= NEW.created_at
      AND candidate.recorded_at <= NEW.created_at
    ORDER BY
      candidate.decided_at DESC,
      (candidate.dataset_id IS NOT NULL) DESC,
      candidate.recorded_at DESC,
      candidate.id DESC
    LIMIT 1
  ) decision ON true
  WHERE observation.id = NEW.observation_id
    AND observation.tenant_scope = effective_scope
    AND observation.transformation_run_id = NEW.transformation_run_id
    AND release.id = NEW.release_id
    AND release.dataset_id = series.dataset_id
    AND series.tenant_scope = effective_scope
    AND dataset.organization_id IS NOT DISTINCT FROM NEW.organization_id
    AND source.organization_id IS NOT DISTINCT FROM NEW.organization_id
  FOR SHARE OF series, dataset, source, review;

  IF bound_context.series_id IS NULL
    OR bound_context.series_status <> 'active'
    OR bound_context.series_data_class IN ('synthetic_demo', 'synthetic_research')
    OR bound_context.dataset_admission_status <> 'approved'
    OR bound_context.source_license_status <> 'approved'
    OR bound_context.review_id IS NULL
    OR bound_context.decision_id IS NULL
    OR bound_context.decision <> 'approved'
    OR NOT (
      SELECT bool_or(action = ANY(bound_context.permitted_actions))
      FROM unnest(ARRAY['view', 'api', 'export', 'derive', 'train']) action
    )
    OR bound_context.dataset_admitted_at IS NULL
    OR bound_context.dataset_admitted_at > NEW.created_at
    OR bound_context.reviewed_at > NEW.created_at
    OR bound_context.review_created_at > NEW.created_at
    OR (
      bound_context.review_expires_at IS NOT NULL
      AND bound_context.review_expires_at <= NEW.created_at
    )
    OR (
      bound_context.license_review_expires_at IS NOT NULL
      AND bound_context.license_review_expires_at <= NEW.created_at
    )
  THEN
    RAISE EXCEPTION
      'canonical admission requires locked active series and approved exact legal evidence'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

-- The existing canonical_admissions_verify trigger sorts first; this second
-- BEFORE trigger adds the series/context invariant without bypassing identity,
-- terminal-workflow, or manifest verification.
CREATE TRIGGER canonical_admissions_verify_series_context
BEFORE INSERT ON evidence.canonical_admissions
FOR EACH ROW EXECUTE FUNCTION evidence.validate_canonical_admission_series_context();

CREATE OR REPLACE FUNCTION evidence.snapshot_canonical_admission_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  bound_context record;
  quality_count integer;
  admission_pass_count integer;
  failure_count integer;
  future_record_count integer;
  quality_manifest jsonb;
  evidence_manifest jsonb;
  evidence_sha256 text;
BEGIN
  SELECT
    series.id AS series_id,
    series.dataset_id,
    series.concept_id,
    series.geography_id,
    series.external_series_key,
    series.unit_code,
    series.frequency,
    series.seasonal_adjustment,
    series.data_class,
    series.status,
    dataset.source_id,
    source.license_review_id,
    decision.id AS source_admission_event_id,
    decision.permitted_actions
  INTO STRICT bound_context
  FROM evidence.observations observation
  JOIN evidence.releases release
    ON release.id = observation.release_id
    AND release.tenant_scope = observation.tenant_scope
  JOIN evidence.series series
    ON series.id = observation.series_id
    AND series.tenant_scope = observation.tenant_scope
  JOIN evidence.source_datasets dataset
    ON dataset.id = series.dataset_id
    AND dataset.tenant_scope = series.tenant_scope
  JOIN evidence.sources source
    ON source.id = dataset.source_id
    AND source.tenant_scope = dataset.tenant_scope
  JOIN evidence.license_reviews review
    ON review.id = source.license_review_id
    AND review.source_slug = source.slug
    AND (
      review.dataset_external_key IS NULL
      OR review.dataset_external_key = dataset.external_key
    )
  JOIN LATERAL (
    SELECT candidate.*
    FROM evidence.source_admission_events candidate
    WHERE candidate.source_id = source.id
      AND candidate.organization_id IS NOT DISTINCT FROM source.organization_id
      AND (candidate.dataset_id IS NULL OR candidate.dataset_id = dataset.id)
      AND candidate.license_review_id = review.id
      AND candidate.decided_at <= NEW.created_at
      AND candidate.recorded_at <= NEW.created_at
    ORDER BY
      candidate.decided_at DESC,
      (candidate.dataset_id IS NOT NULL) DESC,
      candidate.recorded_at DESC,
      candidate.id DESC
    LIMIT 1
  ) decision ON true
  WHERE observation.id = NEW.observation_id
    AND observation.tenant_scope = NEW.tenant_scope
    AND observation.transformation_run_id = NEW.transformation_run_id
    AND release.id = NEW.release_id
    AND release.dataset_id = series.dataset_id;

  SELECT
    count(*),
    count(*) FILTER (
      WHERE quality.check_code = 'admission' AND quality.status = 'pass'
    ),
    count(*) FILTER (WHERE quality.status = 'fail'),
    count(*) FILTER (WHERE quality.recorded_at > NEW.created_at),
    coalesce(jsonb_agg(jsonb_build_object(
      'id', quality.id::text,
      'organizationId', quality.organization_id::text,
      'datasetId', quality.dataset_id::text,
      'rawPayloadId', quality.raw_payload_id::text,
      'transformationRunId', quality.transformation_run_id::text,
      'checkCode', quality.check_code,
      'status', quality.status,
      'details', quality.details,
      'checkedAt', to_char(
        quality.checked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
      'recordedAt', to_char(
        quality.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    ) ORDER BY quality.check_code COLLATE "C", quality.id), '[]'::jsonb)
  INTO
    quality_count, admission_pass_count, failure_count, future_record_count,
    quality_manifest
  FROM evidence.quality_results quality
  WHERE quality.tenant_scope = NEW.tenant_scope
    AND quality.transformation_run_id = NEW.transformation_run_id;

  IF quality_count < 1 OR admission_pass_count <> 1 OR failure_count <> 0
    OR future_record_count <> 0
  THEN
    RAISE EXCEPTION
      'canonical admission requires one recorded admission pass, no failure, and no future-recorded quality evidence'
      USING ERRCODE = '23514';
  END IF;

  evidence_manifest := jsonb_build_object(
    'schemaVersion', 1,
    'admissionId', NEW.id::text,
    'observationId', NEW.observation_id::text,
    'transformationRunId', NEW.transformation_run_id::text,
    'admissionCreatedAt', to_char(
      NEW.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'series', jsonb_build_object(
      'id', bound_context.series_id::text,
      'datasetId', bound_context.dataset_id::text,
      'conceptId', bound_context.concept_id::text,
      'geographyId', bound_context.geography_id::text,
      'externalSeriesKey', bound_context.external_series_key,
      'unitCode', bound_context.unit_code,
      'frequency', bound_context.frequency,
      'seasonalAdjustment', bound_context.seasonal_adjustment,
      'dataClass', bound_context.data_class,
      'status', bound_context.status
    ),
    'legalAdmission', jsonb_build_object(
      'sourceId', bound_context.source_id::text,
      'sourceDatasetId', bound_context.dataset_id::text,
      'licenseReviewId', bound_context.license_review_id::text,
      'sourceAdmissionEventId', bound_context.source_admission_event_id::text,
      'permittedActions', (
        SELECT coalesce(
          jsonb_agg(action ORDER BY action COLLATE "C"), '[]'::jsonb
        )
        FROM unnest(bound_context.permitted_actions) action
      )
    ),
    'qualityResults', quality_manifest
  );
  evidence_sha256 := encode(digest(
    convert_to(evidence.canonical_json(evidence_manifest), 'UTF8'), 'sha256'
  ), 'hex');

  INSERT INTO evidence.canonical_admission_evidence_sets (
    organization_id, admission_id, observation_id, transformation_run_id,
    series_id, source_id, source_dataset_id, license_review_id,
    source_admission_event_id, series_status, series_data_class, admission_created_at,
    quality_result_count, evidence_manifest, evidence_sha256
  ) VALUES (
    NEW.organization_id, NEW.id, NEW.observation_id, NEW.transformation_run_id,
    bound_context.series_id, bound_context.source_id, bound_context.dataset_id,
    bound_context.license_review_id, bound_context.source_admission_event_id,
    bound_context.status, bound_context.data_class, NEW.created_at,
    quality_count, evidence_manifest, evidence_sha256
  );
  RETURN NULL;
END
$$;

CREATE TRIGGER canonical_admissions_snapshot_evidence
AFTER INSERT ON evidence.canonical_admissions
FOR EACH ROW EXECUTE FUNCTION evidence.snapshot_canonical_admission_evidence();

CREATE TRIGGER canonical_admission_evidence_sets_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.canonical_admission_evidence_sets
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

ALTER TABLE evidence.canonical_admission_evidence_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.canonical_admission_evidence_sets FORCE ROW LEVEL SECURITY;
CREATE POLICY canonical_admission_evidence_sets_tenant
  ON evidence.canonical_admission_evidence_sets
  USING (evidence.tenant_visible(organization_id))
  WITH CHECK (evidence.tenant_visible(organization_id));

REVOKE ALL ON TABLE evidence.canonical_admission_evidence_sets FROM PUBLIC;
GRANT SELECT ON evidence.canonical_admission_evidence_sets
  TO economyos_app, economyos_ingest;
REVOKE INSERT, UPDATE, DELETE ON evidence.canonical_admission_evidence_sets
  FROM economyos_app, economyos_ingest;

-- A series may be operationally suspended or reactivated, but once it has
-- evidence its scientific identity cannot be rewritten underneath historical
-- observations or admission fingerprints.
CREATE OR REPLACE FUNCTION evidence.reject_bound_series_semantic_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
BEGIN
  IF (
    NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.dataset_id IS DISTINCT FROM OLD.dataset_id
    OR NEW.concept_id IS DISTINCT FROM OLD.concept_id
    OR NEW.geography_id IS DISTINCT FROM OLD.geography_id
    OR NEW.external_series_key IS DISTINCT FROM OLD.external_series_key
    OR NEW.unit_code IS DISTINCT FROM OLD.unit_code
    OR NEW.frequency IS DISTINCT FROM OLD.frequency
    OR NEW.seasonal_adjustment IS DISTINCT FROM OLD.seasonal_adjustment
    OR NEW.data_class IS DISTINCT FROM OLD.data_class
  ) AND (
    EXISTS (
      SELECT 1 FROM evidence.observations observation
      WHERE observation.series_id = OLD.id
    )
    OR EXISTS (
      SELECT 1 FROM evidence.canonical_admission_evidence_sets admission_evidence
      WHERE admission_evidence.series_id = OLD.id
    )
  ) THEN
    RAISE EXCEPTION 'bound series scientific identity is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER series_reject_bound_semantic_update
BEFORE UPDATE ON evidence.series
FOR EACH ROW EXECUTE FUNCTION evidence.reject_bound_series_semantic_update();

-- Select the effective immutable legal decision first, then test whether that
-- decision authorizes the action. Filtering approved rows before ordering
-- would incorrectly bypass a later suspension or rejection.
CREATE OR REPLACE FUNCTION evidence.source_action_is_admitted_as_known(
  requested_source_id uuid,
  requested_dataset_id uuid,
  requested_action text,
  evidence_cutoff timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
  SELECT coalesce((
    SELECT
      effective.decision = 'approved'
      AND requested_action = ANY(effective.permitted_actions)
      AND requested_action = ANY(effective.intended_uses)
    FROM (
      SELECT
        decision.decision,
        decision.permitted_actions,
        review.intended_uses
      FROM evidence.sources source
      JOIN evidence.source_datasets dataset
        ON dataset.id = requested_dataset_id
        AND dataset.source_id = source.id
        AND dataset.tenant_scope = source.tenant_scope
      JOIN evidence.source_admission_events decision
        ON decision.source_id = source.id
        AND decision.organization_id IS NOT DISTINCT FROM source.organization_id
        AND (decision.dataset_id IS NULL OR decision.dataset_id = dataset.id)
      JOIN evidence.license_reviews review
        ON review.id = decision.license_review_id
        AND review.source_slug = source.slug
        AND (
          review.dataset_external_key IS NULL
          OR review.dataset_external_key = dataset.external_key
        )
      WHERE source.id = requested_source_id
        AND decision.decided_at <= evidence_cutoff
        AND decision.recorded_at <= evidence_cutoff
        AND review.reviewed_at <= evidence_cutoff
        AND review.created_at <= evidence_cutoff
        AND (review.expires_at IS NULL OR review.expires_at > evidence_cutoff)
      ORDER BY
        decision.decided_at DESC,
        (decision.dataset_id IS NOT NULL) DESC,
        decision.recorded_at DESC,
        decision.id DESC
      LIMIT 1
    ) effective
  ), false)
$$;

-- Current serving is intentionally bound to the source's current review. The
-- historical helper above may resolve an older review at an older cutoff, but
-- this live gate makes a review rotation or event-only suspension effective
-- immediately without rewriting immutable historical evidence.
CREATE OR REPLACE FUNCTION evidence.source_action_is_currently_admitted(
  requested_source_id uuid,
  requested_dataset_id uuid,
  requested_license_review_id uuid,
  requested_action text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
  SELECT coalesce((
    SELECT
      source.license_status = 'approved'
      AND dataset.admission_status = 'approved'
      AND dataset.admitted_at IS NOT NULL
      AND dataset.admitted_at <= statement_timestamp()
      AND source.license_review_id = review.id
      AND (
        source.license_review_expires_at IS NULL
        OR source.license_review_expires_at > statement_timestamp()
      )
      AND review.reviewed_at <= statement_timestamp()
      AND review.created_at <= statement_timestamp()
      AND (review.expires_at IS NULL OR review.expires_at > statement_timestamp())
      AND requested_action = ANY(source.permitted_actions)
      AND requested_action = ANY(review.intended_uses)
      AND (requested_action <> 'export' OR source.redistribution_allowed = true)
      AND effective.decision = 'approved'
      AND requested_action = ANY(effective.permitted_actions)
    FROM evidence.sources source
    JOIN evidence.source_datasets dataset
      ON dataset.id = requested_dataset_id
      AND dataset.source_id = source.id
      AND dataset.tenant_scope = source.tenant_scope
    JOIN evidence.license_reviews review
      ON review.id = requested_license_review_id
      AND review.source_slug = source.slug
      AND (
        review.dataset_external_key IS NULL
        OR review.dataset_external_key = dataset.external_key
      )
    JOIN LATERAL (
      SELECT decision.decision, decision.permitted_actions
      FROM evidence.source_admission_events decision
      WHERE decision.source_id = source.id
        AND decision.organization_id IS NOT DISTINCT FROM source.organization_id
        AND (decision.dataset_id IS NULL OR decision.dataset_id = dataset.id)
        AND decision.license_review_id = review.id
        AND decision.decided_at <= statement_timestamp()
        AND decision.recorded_at <= statement_timestamp()
      ORDER BY
        decision.decided_at DESC,
        (decision.dataset_id IS NOT NULL) DESC,
        decision.recorded_at DESC,
        decision.id DESC
      LIMIT 1
    ) effective ON true
    WHERE source.id = requested_source_id
      AND source.license_review_id = requested_license_review_id
      AND app.current_organization_id() IS NOT NULL
      AND (
        source.organization_id IS NULL
        OR source.organization_id = app.current_organization_id()
      )
      AND (
        dataset.organization_id IS NULL
        OR dataset.organization_id = app.current_organization_id()
      )
  ), false)
$$;

-- One internal candidate relation keeps list serving and exact economic-state
-- visibility on the same cutoff-aware admission, quality, and legal evidence.
CREATE OR REPLACE FUNCTION evidence.governed_observation_candidates_as_known(
  requested_series_id uuid,
  known_at timestamptz,
  visibility_policy text,
  system_at timestamptz DEFAULT NULL,
  requested_action text DEFAULT 'view'
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
  recorded_at timestamptz,
  revision_sequence integer,
  revision_time timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  evidence_cutoff timestamptz;
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
  IF visibility_policy = 'reconstructed' AND system_at IS NULL THEN
    RAISE EXCEPTION 'reconstructed policy requires system_at' USING ERRCODE = '22023';
  END IF;
  IF visibility_policy = 'latest_revised' AND system_at IS NOT NULL THEN
    RAISE EXCEPTION 'latest_revised cannot claim historical system time'
      USING ERRCODE = '22023';
  END IF;

  evidence_cutoff := CASE visibility_policy
    WHEN 'reconstructed' THEN system_at
    WHEN 'true_vintage' THEN coalesce(system_at, statement_timestamp())
    ELSE statement_timestamp()
  END;

  RETURN QUERY
  SELECT
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
    observation.recorded_at,
    release.revision_sequence,
    release.revision_time
  FROM evidence.observations observation
  JOIN evidence.releases release
    ON release.id = observation.release_id
    AND release.tenant_scope = observation.tenant_scope
  JOIN evidence.raw_payloads payload
    ON payload.id = release.raw_payload_id
    AND payload.tenant_scope = release.tenant_scope
  JOIN evidence.series series
    ON series.id = observation.series_id
    AND series.tenant_scope = observation.tenant_scope
  JOIN evidence.source_datasets dataset
    ON dataset.id = series.dataset_id
    AND dataset.tenant_scope = series.tenant_scope
  JOIN evidence.sources source
    ON source.id = dataset.source_id
    AND source.tenant_scope = dataset.tenant_scope
  JOIN evidence.transformation_runs transformation
    ON transformation.id = observation.transformation_run_id
    AND transformation.tenant_scope = observation.tenant_scope
  JOIN evidence.canonical_admissions admission
    ON admission.observation_id = observation.id
    AND admission.tenant_scope = observation.tenant_scope
  LEFT JOIN evidence.canonical_admission_evidence_sets admission_evidence
    ON admission_evidence.admission_id = admission.id
    AND admission_evidence.tenant_scope = admission.tenant_scope
  WHERE observation.series_id = requested_series_id
    AND (
      observation.organization_id IS NULL
      OR observation.organization_id = app.current_organization_id()
    )
    AND series.data_class NOT IN ('synthetic_demo', 'synthetic_research')
    AND series.status = 'active'
    AND dataset.admission_status = 'approved'
    AND dataset.admitted_at IS NOT NULL
    AND source.license_status = 'approved'
    AND source.license_review_id IS NOT NULL
    AND (
      source.license_review_expires_at IS NULL
      OR source.license_review_expires_at > statement_timestamp()
    )
    AND requested_action = ANY(source.permitted_actions)
    AND (requested_action <> 'export' OR source.redistribution_allowed = true)
    AND transformation.status = 'succeeded'
    AND observation.period_end <= known_at
    AND admission.created_at <= evidence_cutoff
    AND (
      visibility_policy = 'latest_revised'
      OR (visibility_policy = 'true_vintage' AND system_at IS NULL)
      OR (
        admission_evidence.id IS NOT NULL
        AND admission_evidence.observation_id = observation.id
        AND admission_evidence.transformation_run_id = transformation.id
        AND admission_evidence.series_id = series.id
        AND admission_evidence.admission_created_at = admission.created_at
      )
    )
    AND (
      admission_evidence.id IS NULL
      OR (
        admission_evidence.source_id = source.id
        AND admission_evidence.source_dataset_id = dataset.id
        AND admission_evidence.evidence_manifest->>'admissionId' = admission.id::text
        AND admission_evidence.evidence_manifest->>'observationId' = observation.id::text
        AND admission_evidence.evidence_manifest->>'transformationRunId'
          = transformation.id::text
        AND admission_evidence.evidence_manifest->'series' = jsonb_build_object(
          'id', series.id::text,
          'datasetId', series.dataset_id::text,
          'conceptId', series.concept_id::text,
          'geographyId', series.geography_id::text,
          'externalSeriesKey', series.external_series_key,
          'unitCode', series.unit_code,
          'frequency', series.frequency,
          'seasonalAdjustment', series.seasonal_adjustment,
          'dataClass', series.data_class,
          'status', admission_evidence.series_status
        )
        AND admission_evidence.evidence_manifest#>>'{legalAdmission,sourceId}'
          = source.id::text
        AND admission_evidence.evidence_manifest#>>'{legalAdmission,sourceDatasetId}'
          = dataset.id::text
        AND admission_evidence.evidence_sha256 = encode(digest(
          convert_to(
            evidence.canonical_json(admission_evidence.evidence_manifest), 'UTF8'
          ), 'sha256'
        ), 'hex')
      )
    )
    AND EXISTS (
      SELECT 1 FROM evidence.quality_results quality
      WHERE quality.transformation_run_id = observation.transformation_run_id
        AND quality.tenant_scope = observation.tenant_scope
        AND quality.check_code = 'admission'
        AND quality.status = 'pass'
        AND quality.recorded_at <= evidence_cutoff
    )
    AND NOT EXISTS (
      SELECT 1 FROM evidence.quality_results quality
      WHERE quality.transformation_run_id = observation.transformation_run_id
        AND quality.tenant_scope = observation.tenant_scope
        AND quality.status = 'fail'
        AND quality.recorded_at <= evidence_cutoff
    )
    AND evidence.source_action_is_admitted_as_known(
      source.id, dataset.id, requested_action, evidence_cutoff
    )
    AND evidence.source_action_is_currently_admitted(
      source.id, dataset.id, source.license_review_id, requested_action
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
    END;
END
$$;

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
  IF maximum_rows IS NULL OR maximum_rows NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'maximum_rows must be between 1 and 10000' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (candidate.period_start, candidate.period_end)
    candidate.observation_id,
    candidate.series_id,
    candidate.release_id,
    candidate.raw_payload_id,
    candidate.transformation_run_id,
    candidate.period_start,
    candidate.period_end,
    candidate.value_numeric,
    candidate.missing_reason,
    candidate.observation_status,
    candidate.parser_version,
    candidate.release_time,
    candidate.availability_time,
    candidate.retrieved_at,
    candidate.pit_quality,
    candidate.recorded_at
  FROM evidence.governed_observation_candidates_as_known(
    requested_series_id, known_at, visibility_policy, system_at, requested_action
  ) candidate
  ORDER BY
    candidate.period_start,
    candidate.period_end,
    candidate.revision_sequence DESC NULLS LAST,
    candidate.revision_time DESC NULLS LAST,
    candidate.release_time DESC NULLS LAST,
    candidate.recorded_at DESC,
    candidate.observation_id DESC
  LIMIT maximum_rows;
END
$$;

CREATE OR REPLACE FUNCTION evidence.governed_observation_is_visible_as_known(
  requested_observation_id uuid,
  known_at timestamptz,
  visibility_policy text,
  system_at timestamptz DEFAULT NULL,
  requested_action text DEFAULT 'derive'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  target record;
  selected_id uuid;
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
  IF visibility_policy = 'reconstructed' AND system_at IS NULL THEN
    RAISE EXCEPTION 'reconstructed policy requires system_at' USING ERRCODE = '22023';
  END IF;
  IF visibility_policy = 'latest_revised' AND system_at IS NOT NULL THEN
    RAISE EXCEPTION 'latest_revised cannot claim historical system time'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    observation.series_id,
    observation.period_start,
    observation.period_end
  INTO target
  FROM evidence.observations observation
  WHERE observation.id = requested_observation_id
    AND (
      observation.organization_id IS NULL
      OR observation.organization_id = app.current_organization_id()
    );
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT candidate.observation_id INTO selected_id
  FROM evidence.governed_observation_candidates_as_known(
    target.series_id, known_at, visibility_policy, system_at, requested_action
  ) candidate
  WHERE candidate.period_start = target.period_start
    AND candidate.period_end = target.period_end
  ORDER BY
    candidate.revision_sequence DESC NULLS LAST,
    candidate.revision_time DESC NULLS LAST,
    candidate.release_time DESC NULLS LAST,
    candidate.recorded_at DESC,
    candidate.observation_id DESC
  LIMIT 1;
  RETURN selected_id IS NOT DISTINCT FROM requested_observation_id;
END
$$;

-- Economic-state quality is derived only from the exact quality set frozen by
-- the canonical admission. Later checks remain current serving evidence but
-- cannot rewrite a historical component's score or evidence digest.
CREATE OR REPLACE FUNCTION evidence.economic_state_observation_quality(
  requested_observation_id uuid
)
RETURNS TABLE (
  quality_score text,
  quality_manifest jsonb,
  quality_sha256 text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  observation evidence.observations%ROWTYPE;
  transformation evidence.transformation_runs%ROWTYPE;
  admission evidence.canonical_admissions%ROWTYPE;
  admission_evidence evidence.canonical_admission_evidence_sets%ROWTYPE;
  admission_score numeric;
  calculated_score numeric;
  total_weight numeric;
  invalid_weight_count integer;
  check_count integer;
  checks jsonb;
  canonical_score text;
  frozen_quality_results jsonb;
  calculated_evidence_sha256 text;
BEGIN
  SELECT * INTO observation
  FROM evidence.observations candidate
  WHERE candidate.id = requested_observation_id;
  SELECT * INTO transformation
  FROM evidence.transformation_runs candidate
  WHERE candidate.id = observation.transformation_run_id
    AND candidate.tenant_scope = observation.tenant_scope;
  SELECT * INTO admission
  FROM evidence.canonical_admissions candidate
  WHERE candidate.observation_id = observation.id
    AND candidate.tenant_scope = observation.tenant_scope;
  SELECT * INTO admission_evidence
  FROM evidence.canonical_admission_evidence_sets candidate
  WHERE candidate.admission_id = admission.id
    AND candidate.tenant_scope = admission.tenant_scope;

  IF observation.id IS NULL OR transformation.id IS NULL
    OR transformation.status <> 'succeeded'
    OR admission.id IS NULL OR admission_evidence.id IS NULL
    OR admission_evidence.observation_id <> observation.id
    OR admission_evidence.transformation_run_id <> transformation.id
    OR admission_evidence.series_id <> observation.series_id
    OR admission_evidence.admission_created_at <> admission.created_at
    OR admission_evidence.evidence_manifest->>'admissionId' <> admission.id::text
    OR admission_evidence.evidence_manifest->>'observationId' <> observation.id::text
    OR admission_evidence.evidence_manifest->>'transformationRunId' <> transformation.id::text
    OR admission_evidence.evidence_manifest#>>'{series,id}' <> observation.series_id::text
    OR jsonb_typeof(admission_evidence.evidence_manifest->'qualityResults') <> 'array'
  THEN
    RETURN;
  END IF;

  calculated_evidence_sha256 := encode(digest(
    convert_to(
      evidence.canonical_json(admission_evidence.evidence_manifest), 'UTF8'
    ), 'sha256'
  ), 'hex');
  frozen_quality_results := admission_evidence.evidence_manifest->'qualityResults';
  IF admission_evidence.evidence_sha256 <> calculated_evidence_sha256
    OR admission_evidence.quality_result_count <> jsonb_array_length(frozen_quality_results)
  THEN
    RETURN;
  END IF;

  BEGIN
    SELECT (entry->'details'->>'score')::numeric INTO STRICT admission_score
    FROM jsonb_array_elements(frozen_quality_results) entry
    WHERE entry->>'checkCode' = 'admission'
      AND entry->>'status' = 'pass'
      AND jsonb_typeof(entry->'details'->'score') = 'number';
  EXCEPTION
    WHEN no_data_found OR too_many_rows OR invalid_text_representation THEN RETURN;
  END;

  WITH parsed_checks AS (
    SELECT
      entry->>'checkCode' AS check_code,
      entry->>'status' AS status,
      entry->'details' AS details,
      entry->>'checkedAt' AS checked_at,
      CASE
        WHEN jsonb_typeof(entry->'details'->'weight') = 'number'
          AND (entry->'details'->>'weight') ~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
        THEN (entry->'details'->>'weight')::numeric
        ELSE NULL
      END AS weight
    FROM jsonb_array_elements(frozen_quality_results) entry
    WHERE entry->>'checkCode' <> 'admission'
  )
  SELECT
    count(*),
    count(*) FILTER (WHERE weight IS NULL OR weight NOT BETWEEN 0 AND 1),
    coalesce(sum(weight), 0),
    coalesce(sum(CASE status
      WHEN 'pass' THEN weight
      WHEN 'warn' THEN weight / 2
      ELSE 0
    END), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'checkCode', check_code,
      'status', status,
      'details', details,
      'checkedAt', checked_at
    ) ORDER BY check_code COLLATE "C"), '[]'::jsonb)
  INTO check_count, invalid_weight_count, total_weight, calculated_score, checks
  FROM parsed_checks;

  IF check_count < 1 OR invalid_weight_count <> 0 OR total_weight <> 1
    OR admission_score NOT BETWEEN 0 AND 1
    OR round(calculated_score, 6) <> round(admission_score, 6)
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(frozen_quality_results) entry
      WHERE entry->>'status' = 'fail'
    )
  THEN
    RETURN;
  END IF;

  canonical_score := evidence.canonical_economic_state_decimal(admission_score);
  quality_manifest := jsonb_build_object(
    'schemaVersion', 1,
    'method', 'admission_weighted_v1',
    'observationId', observation.id::text,
    'transformationRunId', transformation.id::text,
    'parserCodeSha256', transformation.code_sha256,
    'configurationSha256', transformation.configuration_sha256,
    'score', canonical_score,
    'checks', checks
  );
  quality_score := canonical_score;
  quality_sha256 := encode(digest(
    convert_to(evidence.canonical_json(quality_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  RETURN NEXT;
END
$$;

CREATE OR REPLACE FUNCTION evidence.economic_state_run_is_temporally_admitted(
  requested_run_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  state_run evidence.economic_state_runs%ROWTYPE;
  component record;
  expected_observation_id uuid;
  frozen_quality_score text;
  frozen_quality_sha256 text;
  component_count integer := 0;
BEGIN
  SELECT * INTO state_run
  FROM evidence.economic_state_runs candidate
  WHERE candidate.id = requested_run_id
    AND evidence.economic_state_workspace_visible(
      candidate.organization_id, candidate.workspace_id
    );
  IF state_run.id IS NULL THEN RETURN false; END IF;

  FOR component IN
    SELECT
      definition.component_key,
      definition.series_id,
      result.component_key AS result_component_key,
      result.observation_id,
      result.raw_value,
      result.quality,
      result.quality_evidence_sha256
    FROM evidence.economic_state_model_components definition
    LEFT JOIN evidence.economic_state_component_results result
      ON result.organization_id = definition.organization_id
      AND result.workspace_id = definition.workspace_id
      AND result.model_id = definition.model_id
      AND result.component_key = definition.component_key
      AND result.run_id = state_run.id
    WHERE definition.organization_id = state_run.organization_id
      AND definition.workspace_id = state_run.workspace_id
      AND definition.model_id = state_run.model_id
    ORDER BY definition.component_key COLLATE "C"
  LOOP
    component_count := component_count + 1;
    IF component.result_component_key IS NULL OR component.series_id IS NULL THEN
      RETURN false;
    END IF;

    SELECT candidate.observation_id
    INTO expected_observation_id
    FROM evidence.governed_observation_candidates_as_known(
      component.series_id,
      state_run.known_at,
      state_run.policy,
      state_run.system_at,
      'derive'
    ) candidate
    WHERE candidate.value_numeric IS NOT NULL
    ORDER BY
      candidate.period_end DESC,
      candidate.period_start DESC,
      candidate.revision_sequence DESC NULLS LAST,
      candidate.revision_time DESC NULLS LAST,
      candidate.release_time DESC NULLS LAST,
      candidate.recorded_at DESC,
      candidate.observation_id DESC
    LIMIT 1;

    IF expected_observation_id IS NULL THEN
      IF component.observation_id IS NOT NULL OR component.raw_value IS NOT NULL THEN
        RETURN false;
      END IF;
      CONTINUE;
    END IF;

    IF component.observation_id IS DISTINCT FROM expected_observation_id
      OR component.raw_value IS NULL
    THEN
      RETURN false;
    END IF;

    frozen_quality_score := NULL;
    frozen_quality_sha256 := NULL;
    SELECT quality.quality_score, quality.quality_sha256
    INTO frozen_quality_score, frozen_quality_sha256
    FROM evidence.economic_state_observation_quality(
      component.observation_id
    ) quality;
    IF NOT FOUND
      OR component.quality IS DISTINCT FROM frozen_quality_score
      OR component.quality_evidence_sha256 IS DISTINCT FROM frozen_quality_sha256
    THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN component_count BETWEEN 1 AND 100;
END
$$;

CREATE OR REPLACE FUNCTION evidence.validate_economic_state_temporal_admission_deferred()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  requested_run_id uuid;
  requested_organization_id uuid;
  prior_organization_setting text;
BEGIN
  IF TG_RELID = 'evidence.economic_state_runs'::regclass THEN
    requested_run_id := NEW.id;
    requested_organization_id := NEW.organization_id;
  ELSIF TG_RELID = 'evidence.economic_state_component_results'::regclass THEN
    requested_run_id := NEW.run_id;
    requested_organization_id := NEW.organization_id;
  ELSE
    RAISE EXCEPTION 'unexpected economic-state temporal trigger relation: %',
      TG_RELID::regclass
      USING ERRCODE = '23514';
  END IF;

  prior_organization_setting := current_setting('app.organization_id', true);
  PERFORM set_config(
    'app.organization_id', requested_organization_id::text, true
  );
  IF NOT evidence.economic_state_run_is_temporally_admitted(requested_run_id) THEN
    RAISE EXCEPTION
      'economic-state run % omits, supersedes, or misbinds governed temporal evidence',
      requested_run_id
      USING ERRCODE = '23514';
  END IF;
  PERFORM set_config(
    'app.organization_id', coalesce(prior_organization_setting, ''), true
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.organization_id', coalesce(prior_organization_setting, ''), true
  );
  RAISE;
END
$$;

CREATE CONSTRAINT TRIGGER economic_state_runs_temporal_admission_deferred
AFTER INSERT ON evidence.economic_state_runs
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION evidence.validate_economic_state_temporal_admission_deferred();

CREATE CONSTRAINT TRIGGER economic_state_component_results_temporal_admission_deferred
AFTER INSERT ON evidence.economic_state_component_results
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION evidence.validate_economic_state_temporal_admission_deferred();

CREATE OR REPLACE FUNCTION evidence.validate_state_vector_slot_temporal_admission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  prior_organization_setting text;
BEGIN
  prior_organization_setting := current_setting('app.organization_id', true);
  PERFORM set_config('app.organization_id', NEW.organization_id::text, true);
  IF NEW.state_run_id IS NOT NULL
    AND NOT evidence.economic_state_run_is_temporally_admitted(NEW.state_run_id)
  THEN
    RAISE EXCEPTION
      'economic-state vector slot references a run that is not temporally admitted'
      USING ERRCODE = '23514';
  END IF;
  PERFORM set_config(
    'app.organization_id', coalesce(prior_organization_setting, ''), true
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.organization_id', coalesce(prior_organization_setting, ''), true
  );
  RAISE;
END
$$;

CREATE CONSTRAINT TRIGGER economic_state_vector_dimensions_temporal_admission_deferred
AFTER INSERT ON evidence.economic_state_vector_dimensions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION evidence.validate_state_vector_slot_temporal_admission();

-- Direct-ID provenance is deliberately current-only. It uses the same current
-- legal event/review gate as list serving so an event-only suspension cannot be
-- bypassed by asking for a known observation identifier.
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
    'dataset', jsonb_build_object(
      'id', dataset.id,
      'externalKey', dataset.external_key
    ),
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
    'canonicalAdmission', jsonb_build_object(
      'basis', admission.basis,
      'manifestSha256', admission.admission_sha256,
      'outputManifestSha256', admission.output_manifest_sha256,
      'admittedAt', admission.admitted_at,
      'createdAt', admission.created_at
    ),
    'quality', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'code', quality.check_code,
        'status', quality.status,
        'details', quality.details,
        'checkedAt', quality.checked_at,
        'recordedAt', quality.recorded_at
      ) ORDER BY quality.check_code COLLATE "C", quality.id)
      FROM evidence.quality_results quality
      WHERE quality.transformation_run_id = transformation.id
        AND quality.tenant_scope = transformation.tenant_scope
    ), '[]'::jsonb)
  ) INTO result
  FROM evidence.observations observation
  JOIN evidence.canonical_admissions admission
    ON admission.observation_id = observation.id
    AND admission.tenant_scope = observation.tenant_scope
  JOIN evidence.releases release
    ON release.id = observation.release_id
    AND release.tenant_scope = observation.tenant_scope
  JOIN evidence.raw_payloads payload
    ON payload.id = release.raw_payload_id
    AND payload.tenant_scope = release.tenant_scope
  JOIN evidence.series series
    ON series.id = observation.series_id
    AND series.tenant_scope = observation.tenant_scope
  JOIN evidence.source_datasets dataset
    ON dataset.id = series.dataset_id
    AND dataset.tenant_scope = series.tenant_scope
  JOIN evidence.sources source
    ON source.id = dataset.source_id
    AND source.tenant_scope = dataset.tenant_scope
  JOIN evidence.transformation_runs transformation
    ON transformation.id = observation.transformation_run_id
    AND transformation.tenant_scope = observation.tenant_scope
  WHERE observation.id = requested_observation_id
    AND (
      observation.organization_id IS NULL
      OR observation.organization_id = app.current_organization_id()
    )
    AND series.data_class NOT IN ('synthetic_demo', 'synthetic_research')
    AND series.status = 'active'
    AND transformation.status = 'succeeded'
    AND evidence.source_action_is_currently_admitted(
      source.id, dataset.id, source.license_review_id, requested_action
    )
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

REVOKE ALL ON FUNCTION evidence.validate_canonical_admission_series_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.snapshot_canonical_admission_evidence() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.reject_bound_series_semantic_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_source_admission_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.source_action_is_admitted_as_known(
  uuid, uuid, text, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.source_action_is_currently_admitted(
  uuid, uuid, uuid, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.governed_observation_candidates_as_known(
  uuid, timestamptz, text, timestamptz, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.governed_observations_as_known(
  uuid, timestamptz, text, timestamptz, text, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.governed_observation_is_visible_as_known(
  uuid, timestamptz, text, timestamptz, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.economic_state_observation_quality(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.economic_state_run_is_temporally_admitted(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_temporal_admission_deferred()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_state_vector_slot_temporal_admission()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.governed_observation_provenance(uuid, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.observations_as_known(
  uuid, timestamptz, text, timestamptz
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION evidence.source_action_is_currently_admitted(
  uuid, uuid, uuid, text
) TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.economic_state_run_is_temporally_admitted(uuid)
  TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.governed_observation_provenance(uuid, text)
  TO economyos_app;

COMMENT ON TABLE evidence.canonical_admission_evidence_sets IS
  'Immutable admission-time series assertion and exact DB-recorded quality set; absence rejects reconstructed and explicit-system historical claims.';
COMMENT ON FUNCTION evidence.source_action_is_admitted_as_known(
  uuid, uuid, text, timestamptz
) IS
  'Selects the effective exact-source/dataset decision across historically valid reviews at a system cutoff before testing action approval.';
COMMENT ON FUNCTION evidence.source_action_is_currently_admitted(
  uuid, uuid, uuid, text
) IS
  'Tenant-safe current action predicate bound to the source current review and latest effective immutable event.';
COMMENT ON FUNCTION evidence.economic_state_observation_quality(uuid) IS
  'Recomputes canonical quality only from the immutable quality set frozen at canonical admission.';
COMMENT ON FUNCTION evidence.economic_state_run_is_temporally_admitted(uuid) IS
  'Tenant/workspace-safe predicate independently selecting every model series under run PIT, rejecting snapshot omission/older evidence, and verifying frozen quality.';
COMMENT ON FUNCTION evidence.governed_observation_provenance(uuid, text) IS
  'Current-only provenance gated by live quality, mutable catalog state, and the current exact review/event action authorization.';
