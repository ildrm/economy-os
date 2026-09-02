-- Direct-ID provenance requires the immutable admission evidence introduced in
-- 0022. Legacy canonical admissions were deliberately not backfilled, so they
-- must fail closed rather than inheriting current catalog identity by absence.
CREATE OR REPLACE FUNCTION evidence.canonical_admission_identity_is_current(
  requested_observation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM evidence.observations observation
    JOIN evidence.canonical_admissions admission
      ON admission.observation_id = observation.id
      AND admission.tenant_scope = observation.tenant_scope
      AND admission.transformation_run_id = observation.transformation_run_id
      AND admission.release_id = observation.release_id
    JOIN evidence.series series
      ON series.id = observation.series_id
      AND series.tenant_scope = observation.tenant_scope
    JOIN evidence.source_datasets dataset
      ON dataset.id = series.dataset_id
      AND dataset.tenant_scope = series.tenant_scope
    JOIN evidence.sources source
      ON source.id = dataset.source_id
      AND source.tenant_scope = dataset.tenant_scope
    JOIN evidence.canonical_admission_evidence_sets admission_evidence
      ON admission_evidence.tenant_scope = observation.tenant_scope
      AND admission_evidence.admission_id = admission.id
      AND admission_evidence.observation_id = observation.id
      AND admission_evidence.transformation_run_id = observation.transformation_run_id
      AND admission_evidence.series_id = series.id
      AND admission_evidence.source_dataset_id = dataset.id
      AND admission_evidence.source_id = source.id
    WHERE observation.id = requested_observation_id
      AND app.current_organization_id() IS NOT NULL
      AND (
        observation.organization_id IS NULL
        OR observation.organization_id = app.current_organization_id()
      )
  )
$$;

REVOKE ALL ON FUNCTION evidence.canonical_admission_identity_is_current(uuid)
  FROM PUBLIC, economyos_app, economyos_ingest;

COMMENT ON FUNCTION evidence.canonical_admission_identity_is_current(uuid) IS
  'Requires an exact immutable admission-evidence binding to the current observation, admission, transformation, series, dataset, and source; legacy admissions without frozen evidence fail closed.';

COMMENT ON FUNCTION evidence.governed_observation_provenance(uuid, text) IS
  'Current-only governed provenance requiring exact frozen admission identity; pre-0022 admissions without an immutable evidence set fail closed.';
