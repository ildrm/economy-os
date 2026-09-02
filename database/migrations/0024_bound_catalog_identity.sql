-- Once evidence is bound, catalog identity cannot be retargeted underneath it.
-- Operational admission/license state remains mutable through its governed state machines.

CREATE OR REPLACE FUNCTION evidence.reject_bound_source_identity_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
BEGIN
  IF (
    NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.name IS DISTINCT FROM OLD.name
    OR NEW.authority_class IS DISTINCT FROM OLD.authority_class
    OR NEW.jurisdiction IS DISTINCT FROM OLD.jurisdiction
    OR NEW.homepage_uri IS DISTINCT FROM OLD.homepage_uri
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'source identity is immutable after insertion'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER sources_reject_bound_identity_update
BEFORE UPDATE ON evidence.sources
FOR EACH ROW EXECUTE FUNCTION evidence.reject_bound_source_identity_update();

CREATE OR REPLACE FUNCTION evidence.reject_bound_source_dataset_identity_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
BEGIN
  IF (
    NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.source_id IS DISTINCT FROM OLD.source_id
    OR NEW.external_key IS DISTINCT FROM OLD.external_key
    OR NEW.pit_quality IS DISTINCT FROM OLD.pit_quality
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'source-dataset identity is immutable after insertion'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER source_datasets_reject_bound_identity_update
BEFORE UPDATE ON evidence.source_datasets
FOR EACH ROW EXECUTE FUNCTION evidence.reject_bound_source_dataset_identity_update();

-- Concepts and geographies are versioned reference evidence, not mutable
-- labels. Every post-insert change (including deletion and future columns) is
-- rejected; a correction must be represented by a newly identified row.
CREATE OR REPLACE FUNCTION evidence.reject_reference_catalog_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
BEGIN
  RAISE EXCEPTION
    '% rows are immutable after insertion; create a corrected row with a new id',
    TG_TABLE_NAME
    USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER concepts_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.concepts
FOR EACH ROW EXECUTE FUNCTION evidence.reject_reference_catalog_mutation();

CREATE TRIGGER geographies_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.geographies
FOR EACH ROW EXECUTE FUNCTION evidence.reject_reference_catalog_mutation();

REVOKE INSERT, UPDATE, DELETE ON evidence.concepts, evidence.geographies
  FROM PUBLIC, economyos_app, economyos_ingest;

CREATE OR REPLACE FUNCTION evidence.canonical_admission_identity_is_current(
  requested_observation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
  SELECT coalesce((
    SELECT
      NOT EXISTS (
        SELECT 1
        FROM evidence.canonical_admission_evidence_sets admission_evidence
        WHERE admission_evidence.observation_id = observation.id
          AND admission_evidence.tenant_scope = observation.tenant_scope
      )
      OR EXISTS (
        SELECT 1
        FROM evidence.canonical_admission_evidence_sets admission_evidence
        JOIN evidence.series series
          ON series.id = observation.series_id
          AND series.tenant_scope = observation.tenant_scope
        JOIN evidence.source_datasets dataset
          ON dataset.id = series.dataset_id
          AND dataset.tenant_scope = series.tenant_scope
        JOIN evidence.sources source
          ON source.id = dataset.source_id
          AND source.tenant_scope = dataset.tenant_scope
        WHERE admission_evidence.observation_id = observation.id
          AND admission_evidence.tenant_scope = observation.tenant_scope
          AND admission_evidence.series_id = series.id
          AND admission_evidence.source_dataset_id = dataset.id
          AND admission_evidence.source_id = source.id
      )
    FROM evidence.observations observation
    JOIN evidence.canonical_admissions admission
      ON admission.observation_id = observation.id
      AND admission.tenant_scope = observation.tenant_scope
    WHERE observation.id = requested_observation_id
      AND app.current_organization_id() IS NOT NULL
      AND (
        observation.organization_id IS NULL
        OR observation.organization_id = app.current_organization_id()
      )
  ), false)
$$;

ALTER FUNCTION evidence.governed_observation_provenance(uuid, text)
  RENAME TO governed_observation_provenance_0022;
REVOKE ALL ON FUNCTION evidence.governed_observation_provenance_0022(uuid, text)
  FROM PUBLIC, economyos_app, economyos_ingest;

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
  result := evidence.governed_observation_provenance_0022(
    requested_observation_id,
    requested_action
  );
  IF result IS NULL OR NOT evidence.canonical_admission_identity_is_current(
    requested_observation_id
  ) THEN
    RETURN NULL;
  END IF;
  RETURN result;
END
$$;

REVOKE ALL ON FUNCTION evidence.reject_bound_source_dataset_identity_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.reject_bound_source_identity_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.reject_reference_catalog_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.canonical_admission_identity_is_current(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.governed_observation_provenance(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evidence.governed_observation_provenance(uuid, text)
  TO economyos_app;

COMMENT ON FUNCTION evidence.reject_bound_source_dataset_identity_update() IS
  'Rejects source, tenant, external-key, PIT-identity, and creation-time rewrites after dataset insertion.';
COMMENT ON FUNCTION evidence.reject_bound_source_identity_update() IS
  'Rejects tenant, provenance-label, authority, jurisdiction, URI, and creation-time rewrites after source insertion.';
COMMENT ON FUNCTION evidence.reject_reference_catalog_mutation() IS
  'Makes concepts and geographies append-only after insertion, including future columns; corrections require a newly identified row.';
COMMENT ON TABLE evidence.concepts IS
  'Append-only versioned concept catalog. Identity, labels, definitions, measurement class, ontology version, and creation time are immutable; corrections use a new id.';
COMMENT ON TABLE evidence.geographies IS
  'Append-only versioned geography catalog. Identity, kind, scheme, code, label, and validity interval are immutable; corrections use a new id.';
COMMENT ON FUNCTION evidence.canonical_admission_identity_is_current(uuid) IS
  'Fails closed when a post-0022 frozen admission no longer matches the current series/source/dataset identity chain.';
COMMENT ON FUNCTION evidence.governed_observation_provenance(uuid, text) IS
  'Current-only governed provenance additionally requiring frozen/current identity equality whenever admission evidence exists.';
