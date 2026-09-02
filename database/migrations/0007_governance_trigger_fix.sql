-- Generated tenant_scope is not available to BEFORE INSERT triggers. Validate
-- observation transformations using the source organization columns instead.
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
      AND release.organization_id IS NOT DISTINCT FROM transformation.organization_id
    JOIN evidence.series series
      ON series.dataset_id = transformation.dataset_id
      AND series.organization_id IS NOT DISTINCT FROM transformation.organization_id
    WHERE transformation.id = NEW.transformation_run_id
      AND transformation.organization_id IS NOT DISTINCT FROM NEW.organization_id
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

REVOKE ALL ON FUNCTION evidence.lineage_endpoint_scope(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.governed_observations_as_known(
  uuid, timestamptz, text, timestamptz, text, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.governed_observation_provenance(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evidence.lineage_endpoint_scope(text, uuid) TO economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.governed_observations_as_known(
  uuid, timestamptz, text, timestamptz, text, integer
) TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.governed_observation_provenance(uuid, text) TO economyos_app;
