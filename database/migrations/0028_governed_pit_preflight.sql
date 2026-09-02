-- A requested series has one immutable dataset/source identity. Resolve that
-- tenant-visible catalog context under the statement snapshot and evaluate the
-- historical and live legal gates once before scanning observation revisions.
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
  resolved_source_id uuid;
  resolved_dataset_id uuid;
  resolved_license_review_id uuid;
  historical_action_admitted boolean;
  current_action_admitted boolean;
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

  SELECT
    source.id,
    dataset.id,
    source.license_review_id
  INTO
    resolved_source_id,
    resolved_dataset_id,
    resolved_license_review_id
  FROM evidence.series series
  JOIN evidence.source_datasets dataset
    ON dataset.id = series.dataset_id
    AND dataset.tenant_scope = series.tenant_scope
  JOIN evidence.sources source
    ON source.id = dataset.source_id
    AND source.tenant_scope = dataset.tenant_scope
  WHERE series.id = requested_series_id
    AND (
      series.organization_id IS NULL
      OR series.organization_id = app.current_organization_id()
    )
    AND (
      dataset.organization_id IS NULL
      OR dataset.organization_id = app.current_organization_id()
    )
    AND (
      source.organization_id IS NULL
      OR source.organization_id = app.current_organization_id()
    );

  IF NOT FOUND THEN
    RETURN;
  END IF;

  historical_action_admitted := evidence.source_action_is_admitted_as_known(
    resolved_source_id, resolved_dataset_id, requested_action, evidence_cutoff
  );
  current_action_admitted := evidence.source_action_is_currently_admitted(
    resolved_source_id, resolved_dataset_id, resolved_license_review_id,
    requested_action
  );

  IF historical_action_admitted IS NOT TRUE
    OR current_action_admitted IS NOT TRUE
  THEN
    RETURN;
  END IF;

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

REVOKE ALL ON FUNCTION evidence.governed_observation_candidates_as_known(
  uuid, timestamptz, text, timestamptz, text
) FROM PUBLIC, economyos_app, economyos_ingest;

COMMENT ON FUNCTION evidence.governed_observation_candidates_as_known(
  uuid, timestamptz, text, timestamptz, text
) IS
  'Internal cutoff-aware candidates with immutable admission evidence and one statement-snapshot legal preflight per requested series.';
