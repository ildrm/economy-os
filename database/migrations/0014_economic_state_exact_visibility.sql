-- An economic-state persistence invariant must not inherit the 10,000-row
-- response cap of the list-serving function. Validate the selected revision
-- for one exact observation period without an unrelated pagination boundary.

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
  visible boolean;
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

  WITH target AS (
    SELECT
      observation.series_id,
      observation.tenant_scope,
      observation.period_start,
      observation.period_end
    FROM evidence.observations observation
    WHERE observation.id = requested_observation_id
      AND (
        observation.organization_id IS NULL
        OR observation.organization_id = app.current_organization_id()
      )
  ), selected AS (
    SELECT observation.id
    FROM target
    JOIN evidence.observations observation
      ON observation.series_id = target.series_id
      AND observation.tenant_scope = target.tenant_scope
      AND observation.period_start = target.period_start
      AND observation.period_end = target.period_end
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
    WHERE (
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
      AND EXISTS (
        SELECT 1
        FROM evidence.quality_results quality
        WHERE quality.transformation_run_id = observation.transformation_run_id
          AND quality.tenant_scope = observation.tenant_scope
          AND quality.check_code = 'admission'
          AND quality.status = 'pass'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM evidence.quality_results quality
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
      release.revision_sequence DESC NULLS LAST,
      release.revision_time DESC NULLS LAST,
      release.release_time DESC NULLS LAST,
      observation.recorded_at DESC,
      observation.id DESC
    LIMIT 1
  )
  SELECT EXISTS (
    SELECT 1 FROM selected WHERE id = requested_observation_id
  ) INTO visible;
  RETURN visible;
END
$$;

CREATE OR REPLACE FUNCTION evidence.validate_economic_state_component_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  run evidence.economic_state_runs%ROWTYPE;
  component evidence.economic_state_model_components%ROWTYPE;
  snapshot_manifest jsonb;
  actual_concept_id uuid;
  actual_geography_id uuid;
  actual_source_id uuid;
  actual_scope uuid;
  normalized numeric;
BEGIN
  IF app.current_organization_id() IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'economic-state component writes require the exact tenant context'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO run
  FROM evidence.economic_state_runs
  WHERE id = NEW.run_id
    AND organization_id = NEW.organization_id
    AND workspace_id = NEW.workspace_id
    AND model_id = NEW.model_id;
  SELECT * INTO component
  FROM evidence.economic_state_model_components
  WHERE organization_id = NEW.organization_id
    AND workspace_id = NEW.workspace_id
    AND model_id = NEW.model_id
    AND component_key = NEW.component_key;
  IF run.id IS NULL OR component.model_id IS NULL THEN
    RAISE EXCEPTION 'economic-state component identity is invalid' USING ERRCODE = '23503';
  END IF;

  IF NEW.raw_value IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.raw_value !~ '^-?(0|[1-9][0-9]*)(\.[0-9]{1,18})?$'
    OR NEW.normalized_value IS NULL
    OR NEW.normalized_value !~ '^(0|[1-9][0-9]*)(\.[0-9]{0,5}[1-9])?$'
    OR NEW.contribution IS NULL
    OR NEW.contribution !~ '^(0|[1-9][0-9]*)(\.[0-9]{0,5}[1-9])?$'
  THEN
    RAISE EXCEPTION 'observed economic-state component decimals are invalid'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.raw_value::numeric < component.lower_bound::numeric
    OR NEW.raw_value::numeric > component.upper_bound::numeric
  THEN
    RAISE EXCEPTION 'economic-state component is outside governed normalization bounds'
      USING ERRCODE = '23514';
  END IF;
  normalized := (NEW.raw_value::numeric - component.lower_bound::numeric)
    / (component.upper_bound::numeric - component.lower_bound::numeric);
  IF component.polarity = 'negative' THEN
    normalized := 1 - normalized;
  END IF;
  IF NEW.normalized_value::numeric <> round(normalized, 6)
    OR NEW.contribution::numeric <> round(component.weight::numeric * normalized, 6)
  THEN
    RAISE EXCEPTION 'economic-state normalized value or contribution is not reproducible'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    series.concept_id, series.geography_id,
    dataset.source_id, observation.tenant_scope
  INTO
    actual_concept_id, actual_geography_id,
    actual_source_id, actual_scope
  FROM evidence.observations observation
  JOIN evidence.series series
    ON series.id = observation.series_id AND series.tenant_scope = observation.tenant_scope
  JOIN evidence.source_datasets dataset
    ON dataset.id = series.dataset_id AND dataset.tenant_scope = series.tenant_scope
  WHERE observation.id = NEW.observation_id;
  IF NOT FOUND
    OR actual_scope NOT IN (
      '00000000-0000-0000-0000-000000000000'::uuid, NEW.organization_id
    )
    OR actual_concept_id <> component.concept_id
    OR actual_geography_id <> run.geography_id
    OR actual_source_id <> NEW.source_id
  THEN
    RAISE EXCEPTION 'economic-state observation provenance does not match its model and geography'
      USING ERRCODE = '23514';
  END IF;

  SELECT manifest INTO snapshot_manifest
  FROM evidence.dataset_snapshots
  WHERE id = run.snapshot_id;
  IF NOT ((snapshot_manifest->'observationIds') ? NEW.observation_id::text) THEN
    RAISE EXCEPTION 'economic-state observation is absent from the bound PIT snapshot'
      USING ERRCODE = '23514';
  END IF;
  IF NOT evidence.governed_observation_is_visible_as_known(
    NEW.observation_id, run.known_at, run.policy, run.system_at, 'derive'
  ) THEN
    RAISE EXCEPTION 'economic-state observation is not derivable under its exact governed PIT context'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION evidence.governed_observation_is_visible_as_known(
  uuid, timestamptz, text, timestamptz, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_component_result() FROM PUBLIC;

COMMENT ON FUNCTION evidence.governed_observation_is_visible_as_known(
  uuid, timestamptz, text, timestamptz, text
) IS
  'Checks the selected governed revision for one exact observation period without a list-pagination cap.';
COMMENT ON FUNCTION evidence.validate_economic_state_component_result() IS
  'Requires exact model/snapshot provenance and uncapped derive-authorized PIT visibility before persisting observed state evidence.';
