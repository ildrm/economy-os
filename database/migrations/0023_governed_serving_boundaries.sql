-- Narrow serving-boundary resolvers for application-layer RBAC/ABAC decisions.
-- The application role intentionally has no SELECT privilege on canonical evidence tables.

CREATE OR REPLACE FUNCTION evidence.authorization_organization_context_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT
    app.current_organization_id() IS NOT NULL
    AND app.current_subject_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM app.organization_memberships membership
      JOIN app.organizations organization
        ON organization.id = membership.organization_id
      JOIN app.subjects subject
        ON subject.id = membership.subject_id
      WHERE membership.organization_id = app.current_organization_id()
        AND membership.subject_id = app.current_subject_id()
        AND organization.status = 'active'
        AND subject.status = 'active'
        AND membership.valid_from <= statement_timestamp()
        AND (
          membership.valid_until IS NULL
          OR membership.valid_until > statement_timestamp()
        )
    )
$$;

CREATE OR REPLACE FUNCTION evidence.authorization_series_classification(
  requested_series_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
  SELECT source.classification
  FROM evidence.series series
  JOIN evidence.source_datasets dataset
    ON dataset.id = series.dataset_id
    AND dataset.tenant_scope = series.tenant_scope
  JOIN evidence.sources source
    ON source.id = dataset.source_id
    AND source.tenant_scope = dataset.tenant_scope
  WHERE evidence.authorization_organization_context_is_active()
    AND series.id = requested_series_id
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
    )
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION evidence.authorization_observation_classification(
  requested_observation_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
  SELECT source.classification
  FROM evidence.observations observation
  JOIN evidence.series series
    ON series.id = observation.series_id
    AND series.tenant_scope = observation.tenant_scope
  JOIN evidence.source_datasets dataset
    ON dataset.id = series.dataset_id
    AND dataset.tenant_scope = series.tenant_scope
  JOIN evidence.sources source
    ON source.id = dataset.source_id
    AND source.tenant_scope = dataset.tenant_scope
  WHERE evidence.authorization_organization_context_is_active()
    AND observation.id = requested_observation_id
    AND (
      observation.organization_id IS NULL
      OR observation.organization_id = app.current_organization_id()
    )
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
    )
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION evidence.authorization_economic_state_classification(
  requested_workspace_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
  WITH authorized_workspace AS MATERIALIZED (
    SELECT workspace.organization_id, workspace.id, workspace.classification
    FROM app.workspaces workspace
    WHERE workspace.organization_id = app.current_organization_id()
      AND workspace.id = requested_workspace_id
      AND workspace.status = 'active'
      AND evidence.economic_state_workspace_visible(
        workspace.organization_id,
        workspace.id
      )
  ), classified AS (
    SELECT workspace.classification
    FROM authorized_workspace workspace
    UNION ALL
    SELECT source.classification
    FROM authorized_workspace workspace
    JOIN evidence.economic_state_model_components component
      ON component.organization_id = workspace.organization_id
      AND component.workspace_id = workspace.id
    JOIN evidence.series series ON series.id = component.series_id
    JOIN evidence.source_datasets dataset
      ON dataset.id = series.dataset_id
      AND dataset.tenant_scope = series.tenant_scope
    JOIN evidence.sources source
      ON source.id = dataset.source_id
      AND source.tenant_scope = dataset.tenant_scope
    WHERE (
      series.organization_id IS NULL
      OR series.organization_id = workspace.organization_id
    )
      AND (
        dataset.organization_id IS NULL
        OR dataset.organization_id = workspace.organization_id
      )
      AND (
        source.organization_id IS NULL
        OR source.organization_id = workspace.organization_id
      )
  )
  SELECT CASE max(
    CASE classification
      WHEN 'public' THEN 0
      WHEN 'internal' THEN 1
      WHEN 'confidential' THEN 2
      WHEN 'restricted' THEN 3
    END
  )
    WHEN 0 THEN 'public'
    WHEN 1 THEN 'internal'
    WHEN 2 THEN 'confidential'
    WHEN 3 THEN 'restricted'
  END
  FROM classified
  HAVING count(*) > 0
$$;

CREATE OR REPLACE FUNCTION evidence.economic_state_run_is_currently_servable(
  requested_run_id uuid,
  requested_action text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
  SELECT
    requested_action = 'api'
    AND coalesce((
      SELECT
        evidence.economic_state_run_is_temporally_admitted(state_run.id)
        AND NOT EXISTS (
          SELECT 1
          FROM evidence.economic_state_component_results observed
          WHERE observed.organization_id = state_run.organization_id
            AND observed.workspace_id = state_run.workspace_id
            AND observed.run_id = state_run.id
            AND observed.raw_value IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM evidence.source_datasets dataset
              JOIN evidence.sources source
                ON source.id = dataset.source_id
                AND source.tenant_scope = dataset.tenant_scope
              WHERE dataset.id = observed.source_dataset_id
                AND dataset.source_id = observed.source_id
                AND (
                  dataset.organization_id IS NULL
                  OR dataset.organization_id = state_run.organization_id
                )
                AND (
                  source.organization_id IS NULL
                  OR source.organization_id = state_run.organization_id
                )
                AND evidence.source_action_is_currently_admitted(
                  source.id,
                  dataset.id,
                  source.license_review_id,
                  requested_action
                )
            )
        )
      FROM evidence.economic_state_runs state_run
      WHERE state_run.id = requested_run_id
        AND state_run.organization_id = app.current_organization_id()
        AND evidence.economic_state_workspace_visible(
          state_run.organization_id,
          state_run.workspace_id
        )
    ), false)
$$;

REVOKE ALL ON FUNCTION evidence.authorization_organization_context_is_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.authorization_series_classification(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.authorization_observation_classification(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.authorization_economic_state_classification(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.economic_state_run_is_currently_servable(uuid, text)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION evidence.authorization_series_classification(uuid)
  TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.authorization_observation_classification(uuid)
  TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.authorization_economic_state_classification(uuid)
  TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.economic_state_run_is_currently_servable(uuid, text)
  TO economyos_app;

GRANT SELECT ON evidence.concepts, evidence.geographies TO economyos_app;

COMMENT ON FUNCTION evidence.authorization_organization_context_is_active() IS
  'Internal membership guard for narrow authorization resolvers; not executable by runtime roles.';
COMMENT ON FUNCTION evidence.authorization_series_classification(uuid) IS
  'Returns only the classification of a global or exact-tenant series to an active application principal.';
COMMENT ON FUNCTION evidence.authorization_observation_classification(uuid) IS
  'Returns only the classification of a global or exact-tenant observation to an active application principal.';
COMMENT ON FUNCTION evidence.authorization_economic_state_classification(uuid) IS
  'Returns the maximum workspace/model-source classification for an actively authorized state workspace.';
COMMENT ON FUNCTION evidence.economic_state_run_is_currently_servable(uuid, text) IS
  'Tenant/workspace-safe current API gate combining temporal admission with each observed source and dataset current legal decision.';

-- Release monitoring has a deliberately narrow serving boundary. The runtime
-- role cannot SELECT the underlying canonical tables, and this function emits
-- only releases backed by the post-0022 immutable admission evidence set.
CREATE OR REPLACE FUNCTION evidence.governed_series_releases(
  requested_series_id uuid,
  released_after timestamptz,
  released_before timestamptz,
  requested_action text DEFAULT 'api',
  maximum_rows integer DEFAULT 51
)
RETURNS TABLE (
  evaluated_at timestamptz,
  release_id uuid,
  series_id uuid,
  source_id uuid,
  dataset_id uuid,
  raw_payload_id uuid,
  external_release_key text,
  monitoring_time timestamptz,
  monitoring_time_basis text,
  release_time timestamptz,
  source_publication_time timestamptz,
  original_release_time timestamptz,
  availability_time timestamptz,
  revision_time timestamptz,
  revision_sequence integer,
  pit_quality text,
  payload_fetched_at timestamptz,
  recorded_at timestamptz,
  parser_name text,
  parser_version text,
  parser_code_sha256 text,
  parser_configuration_sha256 text,
  representative_observation_id uuid,
  transformation_run_id uuid,
  ingestion_run_id uuid,
  canonical_admission_id uuid,
  canonical_admission_evidence_id uuid,
  admission_license_review_id uuid,
  admission_source_decision_id uuid,
  current_license_review_id uuid,
  current_source_decision_id uuid,
  admission_basis text,
  admission_manifest_sha256 text,
  admission_evidence_sha256 text,
  output_manifest_sha256 text,
  quality_result_count integer,
  admitted_at timestamptz,
  admission_recorded_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  evaluation_time timestamptz := statement_timestamp();
BEGIN
  IF requested_series_id IS NULL THEN
    RAISE EXCEPTION 'requested_series_id is required' USING ERRCODE = '22023';
  END IF;
  IF released_after IS NULL OR released_before IS NULL
    OR NOT isfinite(released_after) OR NOT isfinite(released_before)
    OR released_after >= released_before
    OR released_before - released_after > interval '366 days'
  THEN
    RAISE EXCEPTION 'release window must be finite, ordered, and at most 366 days'
      USING ERRCODE = '22023';
  END IF;
  IF requested_action IS DISTINCT FROM 'api' THEN
    RAISE EXCEPTION 'release monitoring supports only the api action'
      USING ERRCODE = '22023';
  END IF;
  IF maximum_rows IS NULL OR maximum_rows NOT BETWEEN 1 AND 101 THEN
    RAISE EXCEPTION 'maximum_rows must be between 1 and 101'
      USING ERRCODE = '22023';
  END IF;
  IF NOT evidence.authorization_organization_context_is_active() THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH eligible AS (
  SELECT DISTINCT ON (release.id)
    evaluation_time AS evaluated_at,
    release.id AS release_id,
    series.id AS series_id,
    source.id AS source_id,
    dataset.id AS dataset_id,
    payload.id AS raw_payload_id,
    release.external_release_key,
    monitoring.monitoring_time,
    monitoring.monitoring_time_basis,
    release.release_time,
    release.source_publication_time,
    release.original_release_time,
    release.availability_time,
    release.revision_time,
    release.revision_sequence,
    release.pit_quality,
    payload.fetched_at AS payload_fetched_at,
    release.recorded_at AS recorded_at,
    transformation.parser_name,
    transformation.parser_version,
    transformation.code_sha256 AS parser_code_sha256,
    transformation.configuration_sha256 AS parser_configuration_sha256,
    observation.id AS representative_observation_id,
    transformation.id AS transformation_run_id,
    admission.ingestion_run_id,
    admission.id AS canonical_admission_id,
    admission_evidence.id AS canonical_admission_evidence_id,
    admission_evidence.license_review_id AS admission_license_review_id,
    admission_evidence.source_admission_event_id AS admission_source_decision_id,
    source.license_review_id AS current_license_review_id,
    current_decision.id AS current_source_decision_id,
    admission.basis AS admission_basis,
    admission.admission_sha256 AS admission_manifest_sha256,
    admission_evidence.evidence_sha256 AS admission_evidence_sha256,
    admission.output_manifest_sha256,
    admission_evidence.quality_result_count,
    admission.admitted_at,
    admission.created_at AS admission_recorded_at
  FROM evidence.series series
  JOIN evidence.source_datasets dataset
    ON dataset.id = series.dataset_id
    AND dataset.tenant_scope = series.tenant_scope
  JOIN evidence.sources source
    ON source.id = dataset.source_id
    AND source.tenant_scope = dataset.tenant_scope
  JOIN evidence.releases release
    ON release.dataset_id = dataset.id
    AND release.tenant_scope = dataset.tenant_scope
  JOIN evidence.raw_payloads payload
    ON payload.id = release.raw_payload_id
    AND payload.tenant_scope = release.tenant_scope
  JOIN evidence.observations observation
    ON observation.series_id = series.id
    AND observation.release_id = release.id
    AND observation.tenant_scope = release.tenant_scope
  JOIN evidence.transformation_runs transformation
    ON transformation.id = observation.transformation_run_id
    AND transformation.tenant_scope = observation.tenant_scope
  JOIN evidence.canonical_admissions admission
    ON admission.observation_id = observation.id
    AND admission.transformation_run_id = transformation.id
    AND admission.release_id = release.id
    AND admission.tenant_scope = observation.tenant_scope
  JOIN evidence.canonical_admission_evidence_sets admission_evidence
    ON admission_evidence.admission_id = admission.id
    AND admission_evidence.observation_id = observation.id
    AND admission_evidence.transformation_run_id = transformation.id
    AND admission_evidence.series_id = series.id
    AND admission_evidence.source_id = source.id
    AND admission_evidence.source_dataset_id = dataset.id
    AND admission_evidence.tenant_scope = admission.tenant_scope
  LEFT JOIN evidence.ingestion_runs ingestion
    ON ingestion.id = admission.ingestion_run_id
    AND ingestion.tenant_scope = admission.tenant_scope
  JOIN LATERAL (
    SELECT decision.id, decision.decision, decision.permitted_actions
    FROM evidence.source_admission_events decision
    WHERE decision.source_id = source.id
      AND decision.organization_id IS NOT DISTINCT FROM source.organization_id
      AND (decision.dataset_id IS NULL OR decision.dataset_id = dataset.id)
      AND decision.license_review_id = source.license_review_id
      AND decision.decided_at <= evaluation_time
      AND decision.recorded_at <= evaluation_time
    ORDER BY
      decision.decided_at DESC,
      (decision.dataset_id IS NOT NULL) DESC,
      decision.recorded_at DESC,
      decision.id DESC
    LIMIT 1
  ) current_decision ON true
  CROSS JOIN LATERAL (
    SELECT
      coalesce(
        release.source_publication_time,
        release.release_time,
        release.availability_time,
        payload.fetched_at,
        release.recorded_at
      ) AS monitoring_time,
      CASE
        WHEN release.source_publication_time IS NOT NULL THEN 'source_publication_time'
        WHEN release.release_time IS NOT NULL THEN 'release_time'
        WHEN release.availability_time IS NOT NULL THEN 'availability_time'
        WHEN payload.fetched_at IS NOT NULL THEN 'payload_fetched_at'
        ELSE 'canonical_recorded_at'
      END AS monitoring_time_basis
  ) monitoring
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
    )
    AND (
      release.organization_id IS NULL
      OR release.organization_id = app.current_organization_id()
    )
    AND (
      payload.organization_id IS NULL
      OR payload.organization_id = app.current_organization_id()
    )
    AND (
      observation.organization_id IS NULL
      OR observation.organization_id = app.current_organization_id()
    )
    AND (
      transformation.organization_id IS NULL
      OR transformation.organization_id = app.current_organization_id()
    )
    AND (
      admission.organization_id IS NULL
      OR admission.organization_id = app.current_organization_id()
    )
    AND (
      admission_evidence.organization_id IS NULL
      OR admission_evidence.organization_id = app.current_organization_id()
    )
    AND series.status = 'active'
    AND series.data_class NOT IN ('synthetic_demo', 'synthetic_research')
    AND transformation.status = 'succeeded'
    AND admission_evidence.series_status = 'active'
    AND admission_evidence.series_data_class = series.data_class
    AND admission_evidence.admission_created_at = admission.created_at
    AND current_decision.decision = 'approved'
    AND requested_action = ANY(current_decision.permitted_actions)
    AND evidence.source_action_is_currently_admitted(
      source.id, dataset.id, source.license_review_id, requested_action
    )
    AND admission.admission_manifest->>'observationId' = observation.id::text
    AND admission.admission_manifest->>'transformationRunId' = transformation.id::text
    AND admission.admission_manifest->>'releaseId' = release.id::text
    AND admission.admission_sha256 = encode(digest(
      convert_to(evidence.canonical_json(admission.admission_manifest), 'UTF8'), 'sha256'
    ), 'hex')
    AND admission_evidence.evidence_manifest->>'admissionId' = admission.id::text
    AND admission_evidence.evidence_manifest->>'observationId' = observation.id::text
    AND admission_evidence.evidence_manifest->>'transformationRunId' = transformation.id::text
    AND admission_evidence.evidence_manifest#>>'{series,id}' = series.id::text
    AND admission_evidence.evidence_manifest#>>'{legalAdmission,sourceId}' = source.id::text
    AND admission_evidence.evidence_manifest#>>'{legalAdmission,sourceDatasetId}' = dataset.id::text
    AND admission_evidence.evidence_manifest#>>'{legalAdmission,licenseReviewId}'
      = admission_evidence.license_review_id::text
    AND admission_evidence.evidence_manifest#>>'{legalAdmission,sourceAdmissionEventId}'
      = admission_evidence.source_admission_event_id::text
    AND admission_evidence.evidence_sha256 = encode(digest(
      convert_to(evidence.canonical_json(admission_evidence.evidence_manifest), 'UTF8'), 'sha256'
    ), 'hex')
    AND (
      (
        admission.basis = 'durable_ingestion_v1'
        AND ingestion.id = admission.ingestion_run_id
        AND ingestion.status = 'succeeded'
        AND ingestion.output_sha256 = admission.output_manifest_sha256
        AND ingestion.output_manifest->>'transformationRunId' = transformation.id::text
        AND ingestion.output_manifest->>'releaseId' = release.id::text
        AND (ingestion.output_manifest->'observationIds') ? observation.id::text
      )
      OR (
        admission.basis = 'legacy_verified_v1'
        AND admission.ingestion_run_id IS NULL
        AND transformation.ingestion_run_id IS NULL
      )
    )
    AND EXISTS (
      SELECT 1
      FROM evidence.quality_results quality
      WHERE quality.transformation_run_id = transformation.id
        AND quality.tenant_scope = transformation.tenant_scope
        AND quality.check_code = 'admission'
        AND quality.status = 'pass'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM evidence.quality_results quality
      WHERE quality.transformation_run_id = transformation.id
        AND quality.tenant_scope = transformation.tenant_scope
        AND quality.status = 'fail'
    )
    AND monitoring.monitoring_time > released_after
    AND monitoring.monitoring_time <= released_before
    AND monitoring.monitoring_time <= evaluation_time
  ORDER BY
    release.id,
    admission.created_at DESC,
    observation.id DESC
  )
  SELECT eligible.*
  FROM eligible
  ORDER BY eligible.monitoring_time DESC, eligible.release_id DESC
  LIMIT maximum_rows;
END
$$;

CREATE OR REPLACE FUNCTION evidence.governed_series_release_schedule(
  requested_series_id uuid,
  requested_action text DEFAULT 'api'
)
RETURNS TABLE (
  evaluated_at timestamptz,
  series_id uuid,
  source_id uuid,
  dataset_id uuid,
  expected_frequency text,
  release_schedule jsonb,
  release_schedule_within_bound boolean,
  declaration_sha256 text,
  current_license_review_id uuid,
  current_source_decision_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  evaluation_time timestamptz := statement_timestamp();
BEGIN
  IF requested_series_id IS NULL THEN
    RAISE EXCEPTION 'requested_series_id is required' USING ERRCODE = '22023';
  END IF;
  IF requested_action IS DISTINCT FROM 'api' THEN
    RAISE EXCEPTION 'release schedule serving supports only the api action'
      USING ERRCODE = '22023';
  END IF;
  IF NOT evidence.authorization_organization_context_is_active() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    evaluation_time,
    series.id,
    source.id,
    dataset.id,
    dataset.expected_frequency,
    CASE
      WHEN pg_column_size(dataset.release_schedule) <= 16384
      THEN dataset.release_schedule
      ELSE NULL
    END,
    pg_column_size(dataset.release_schedule) <= 16384,
    encode(digest(
      convert_to(evidence.canonical_json(dataset.release_schedule), 'UTF8'), 'sha256'
    ), 'hex'),
    source.license_review_id,
    current_decision.id
  FROM evidence.series series
  JOIN evidence.source_datasets dataset
    ON dataset.id = series.dataset_id
    AND dataset.tenant_scope = series.tenant_scope
  JOIN evidence.sources source
    ON source.id = dataset.source_id
    AND source.tenant_scope = dataset.tenant_scope
  JOIN LATERAL (
    SELECT decision.id, decision.decision, decision.permitted_actions
    FROM evidence.source_admission_events decision
    WHERE decision.source_id = source.id
      AND decision.organization_id IS NOT DISTINCT FROM source.organization_id
      AND (decision.dataset_id IS NULL OR decision.dataset_id = dataset.id)
      AND decision.license_review_id = source.license_review_id
      AND decision.decided_at <= evaluation_time
      AND decision.recorded_at <= evaluation_time
    ORDER BY
      decision.decided_at DESC,
      (decision.dataset_id IS NOT NULL) DESC,
      decision.recorded_at DESC,
      decision.id DESC
    LIMIT 1
  ) current_decision ON true
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
    )
    AND series.status = 'active'
    AND series.data_class NOT IN ('synthetic_demo', 'synthetic_research')
    AND current_decision.decision = 'approved'
    AND requested_action = ANY(current_decision.permitted_actions)
    AND evidence.source_action_is_currently_admitted(
      source.id, dataset.id, source.license_review_id, requested_action
    )
  LIMIT 1;
END
$$;

REVOKE ALL ON FUNCTION evidence.governed_series_releases(
  uuid, timestamptz, timestamptz, text, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.governed_series_release_schedule(uuid, text)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION evidence.governed_series_releases(
  uuid, timestamptz, timestamptz, text, integer
) TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.governed_series_release_schedule(uuid, text)
  TO economyos_app;

-- Runtime reads use the narrow definer functions above; frozen admission and
-- quality manifests are not general-purpose catalog rows for the shared role.
REVOKE SELECT ON evidence.canonical_admissions,
  evidence.canonical_admission_evidence_sets FROM economyos_app;

COMMENT ON FUNCTION evidence.governed_series_releases(
  uuid, timestamptz, timestamptz, text, integer
) IS
  'Bounded current-only release monitor for one authorized series; emits only immutable post-0022 canonical admissions passing current API, legal, tenant, terminal workflow, and quality gates.';
COMMENT ON FUNCTION evidence.governed_series_release_schedule(uuid, text) IS
  'Returns bounded persisted release-schedule metadata for one active authorized series; it never derives or forecasts a release time.';
