-- Persist the complete five-dimensional EconomicState envelope. Vector rows
-- and their five canonical slots are immutable workspace evidence. Deferred
-- validation reconstructs the package manifest solely from normalized rows,
-- immutable model definitions, and validated state-run results.

CREATE TABLE evidence.economic_state_vectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  geography_id uuid NOT NULL REFERENCES evidence.geographies(id) ON DELETE RESTRICT,
  snapshot_id uuid NOT NULL REFERENCES evidence.dataset_snapshots(id) ON DELETE RESTRICT,
  snapshot_manifest_sha256 text NOT NULL CHECK (
    snapshot_manifest_sha256 ~ '^[0-9a-f]{64}$'
  ),
  known_at timestamptz NOT NULL CHECK (isfinite(known_at)),
  policy text NOT NULL CHECK (
    policy IN ('true_vintage', 'reconstructed', 'latest_revised')
  ),
  system_at timestamptz CHECK (system_at IS NULL OR isfinite(system_at)),
  context_sha256 text NOT NULL CHECK (context_sha256 ~ '^[0-9a-f]{64}$'),
  dimension_count smallint NOT NULL CHECK (dimension_count = 5),
  reported_dimension_count smallint NOT NULL CHECK (
    reported_dimension_count BETWEEN 0 AND 5
  ),
  scored_dimension_count smallint NOT NULL CHECK (
    scored_dimension_count BETWEEN 0 AND 5
  ),
  insufficient_dimension_count smallint NOT NULL CHECK (
    insufficient_dimension_count BETWEEN 0 AND 5
  ),
  missing_dimension_count smallint NOT NULL CHECK (
    missing_dimension_count BETWEEN 0 AND 5
  ),
  dimension_coverage text NOT NULL CHECK (
    dimension_coverage ~ '^(0|1|0\.[0-9]{0,5}[1-9])$'
    AND dimension_coverage::numeric BETWEEN 0 AND 1
  ),
  scored_dimension_coverage text NOT NULL CHECK (
    scored_dimension_coverage ~ '^(0|1|0\.[0-9]{0,5}[1-9])$'
    AND scored_dimension_coverage::numeric BETWEEN 0 AND 1
  ),
  evidence_coverage text NOT NULL CHECK (
    evidence_coverage ~ '^(0|1|0\.[0-9]{0,5}[1-9])$'
    AND evidence_coverage::numeric BETWEEN 0 AND 1
  ),
  confidence_coverage text NOT NULL CHECK (
    confidence_coverage ~ '^(0|1|0\.[0-9]{0,5}[1-9])$'
    AND confidence_coverage::numeric BETWEEN 0 AND 1
  ),
  evidence_quality text CHECK (
    evidence_quality IS NULL OR (
      evidence_quality ~ '^(0|1|0\.[0-9]{0,5}[1-9])$'
      AND evidence_quality::numeric BETWEEN 0 AND 1
    )
  ),
  reported_component_count integer NOT NULL CHECK (
    reported_component_count BETWEEN 0 AND 500
  ),
  observed_component_count integer NOT NULL CHECK (
    observed_component_count BETWEEN 0 AND reported_component_count
  ),
  distinct_source_count integer NOT NULL CHECK (
    distinct_source_count BETWEEN 0 AND observed_component_count
  ),
  distinct_source_coverage text CHECK (
    distinct_source_coverage IS NULL OR (
      distinct_source_coverage ~ '^(0|1|0\.[0-9]{0,5}[1-9])$'
      AND distinct_source_coverage::numeric BETWEEN 0 AND 1
    )
  ),
  state_manifest jsonb NOT NULL CHECK (jsonb_typeof(state_manifest) = 'object'),
  state_manifest_sha256 text NOT NULL CHECK (state_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  assembled_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  assembled_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(assembled_at)),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, id),
  CHECK (
    (policy = 'reconstructed' AND system_at IS NOT NULL)
    OR policy = 'true_vintage'
    OR (policy = 'latest_revised' AND system_at IS NULL)
  ),
  CHECK (reported_dimension_count + missing_dimension_count = 5),
  CHECK (scored_dimension_count + insufficient_dimension_count = reported_dimension_count),
  CHECK (
    (reported_component_count = 0 AND distinct_source_coverage IS NULL)
    OR (reported_component_count > 0 AND distinct_source_coverage IS NOT NULL)
  )
);

CREATE TABLE evidence.economic_state_vector_dimensions (
  organization_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  vector_id uuid NOT NULL,
  ordinal smallint NOT NULL CHECK (ordinal BETWEEN 1 AND 5),
  dimension text NOT NULL CHECK (
    dimension IN ('macroeconomic', 'human_economic', 'financial_system', 'market', 'regime')
  ),
  model_id uuid,
  state_run_id uuid,
  missing_reason text CHECK (
    missing_reason IS NULL OR missing_reason IN (
      'source_missing', 'not_collected', 'not_applicable', 'suppressed',
      'delayed', 'parse_failure', 'license_withheld', 'not_modeled',
      'model_unavailable', 'pipeline_failure'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(created_at)),
  PRIMARY KEY (organization_id, workspace_id, vector_id, dimension),
  UNIQUE (organization_id, workspace_id, vector_id, ordinal),
  FOREIGN KEY (organization_id, workspace_id, vector_id)
    REFERENCES evidence.economic_state_vectors(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, model_id)
    REFERENCES evidence.economic_state_models(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, state_run_id, model_id)
    REFERENCES evidence.economic_state_runs(organization_id, workspace_id, id, model_id)
    ON DELETE RESTRICT,
  CHECK (
    (model_id IS NOT NULL AND state_run_id IS NOT NULL AND missing_reason IS NULL)
    OR (model_id IS NULL AND state_run_id IS NULL AND missing_reason IS NOT NULL)
  ),
  CHECK (
    (ordinal = 1 AND dimension = 'macroeconomic')
    OR (ordinal = 2 AND dimension = 'human_economic')
    OR (ordinal = 3 AND dimension = 'financial_system')
    OR (ordinal = 4 AND dimension = 'market')
    OR (ordinal = 5 AND dimension = 'regime')
  )
);

CREATE UNIQUE INDEX economic_state_vector_dimensions_model_unique
  ON evidence.economic_state_vector_dimensions(
    organization_id, workspace_id, vector_id, model_id
  ) WHERE model_id IS NOT NULL;
CREATE INDEX economic_state_vectors_lookup_idx
  ON evidence.economic_state_vectors(
    organization_id, workspace_id, geography_id, known_at DESC, id
  );
CREATE INDEX economic_state_vectors_snapshot_idx
  ON evidence.economic_state_vectors(
    organization_id, workspace_id, snapshot_id, state_manifest_sha256
  );
CREATE INDEX economic_state_vector_dimensions_run_idx
  ON evidence.economic_state_vector_dimensions(
    organization_id, workspace_id, state_run_id, vector_id
  ) WHERE state_run_id IS NOT NULL;

CREATE OR REPLACE FUNCTION evidence.canonical_economic_state_decimal(value numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN round(value, 6) = 0 THEN '0'
    ELSE regexp_replace(
      regexp_replace(round(value, 6)::text, '0+$', ''), '\.$', ''
    )
  END
$$;

CREATE OR REPLACE FUNCTION evidence.validate_economic_state_vector_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app, evidence
AS $$
BEGIN
  IF app.current_organization_id() IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'economic-state vector writes require the exact tenant context'
      USING ERRCODE = '42501';
  END IF;
  IF app.current_subject_id() IS DISTINCT FROM NEW.assembled_by THEN
    RAISE EXCEPTION 'economic-state vector attribution requires the authenticated subject'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER economic_state_vectors_validate_insert
BEFORE INSERT ON evidence.economic_state_vectors
FOR EACH ROW EXECUTE FUNCTION evidence.validate_economic_state_vector_insert();

CREATE OR REPLACE FUNCTION evidence.validate_economic_state_vector(requested_vector_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  state_vector evidence.economic_state_vectors%ROWTYPE;
  snapshot evidence.dataset_snapshots%ROWTYPE;
  reported record;
  context_manifest jsonb;
  dimensions_manifest jsonb;
  diagnostics_manifest jsonb;
  expected_body jsonb;
  expected_manifest jsonb;
  calculated_context_sha256 text;
  calculated_manifest_sha256 text;
  known_at_text text;
  system_at_text text;
  slot_count integer;
  reported_count integer;
  scored_count integer;
  insufficient_count integer;
  missing_count integer;
  unique_model_count integer;
  reported_component_count integer;
  observed_component_count integer;
  source_count integer;
  completeness_sum numeric;
  confidence_sum numeric;
  expected_dimension_coverage text;
  expected_scored_dimension_coverage text;
  expected_evidence_coverage text;
  expected_confidence_coverage text;
  expected_evidence_quality text;
  expected_source_coverage text;
BEGIN
  SELECT * INTO STRICT state_vector
  FROM evidence.economic_state_vectors candidate
  WHERE candidate.id = requested_vector_id;

  IF jsonb_typeof(state_vector.state_manifest->'context') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'economic-state vector requires its canonical context object'
      USING ERRCODE = '23514';
  END IF;
  known_at_text := state_vector.state_manifest->'context'->>'knownAt';
  IF known_at_text IS NULL OR known_at_text !~
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?Z$'
  THEN
    RAISE EXCEPTION 'economic-state vector knownAt is not a canonical UTC instant'
      USING ERRCODE = '23514';
  END IF;
  BEGIN
    IF known_at_text::timestamptz IS DISTINCT FROM state_vector.known_at THEN
      RAISE EXCEPTION 'economic-state vector knownAt differs from its normalized context'
        USING ERRCODE = '23514';
    END IF;
  EXCEPTION
    WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'economic-state vector knownAt is invalid' USING ERRCODE = '23514';
  END;

  system_at_text := state_vector.state_manifest->'context'->>'systemAt';
  IF state_vector.system_at IS NULL THEN
    IF state_vector.state_manifest->'context' ? 'systemAt' THEN
      RAISE EXCEPTION 'economic-state vector claims an unbound systemAt'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF system_at_text IS NULL OR system_at_text !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?Z$'
    THEN
      RAISE EXCEPTION 'economic-state vector systemAt is not a canonical UTC instant'
        USING ERRCODE = '23514';
    END IF;
    BEGIN
      IF system_at_text::timestamptz IS DISTINCT FROM state_vector.system_at THEN
        RAISE EXCEPTION 'economic-state vector systemAt differs from its normalized context'
          USING ERRCODE = '23514';
      END IF;
    EXCEPTION
      WHEN invalid_datetime_format OR datetime_field_overflow THEN
        RAISE EXCEPTION 'economic-state vector systemAt is invalid' USING ERRCODE = '23514';
    END;
  END IF;

  SELECT * INTO snapshot
  FROM evidence.dataset_snapshots candidate
  WHERE candidate.id = state_vector.snapshot_id
    AND candidate.organization_id = state_vector.organization_id
    AND candidate.workspace_id = state_vector.workspace_id;
  IF snapshot.id IS NULL
    OR snapshot.manifest_sha256 IS DISTINCT FROM state_vector.snapshot_manifest_sha256
    OR snapshot.known_at IS DISTINCT FROM state_vector.known_at
    OR snapshot.policy IS DISTINCT FROM state_vector.policy
    OR snapshot.system_at IS DISTINCT FROM state_vector.system_at
    OR snapshot.manifest->>'knownAt' IS DISTINCT FROM known_at_text
    OR snapshot.manifest->>'policy' IS DISTINCT FROM state_vector.policy
    OR (
      state_vector.system_at IS NULL
      AND snapshot.manifest ? 'systemAt'
    )
    OR (
      state_vector.system_at IS NOT NULL
      AND snapshot.manifest->>'systemAt' IS DISTINCT FROM system_at_text
    )
  THEN
    RAISE EXCEPTION 'economic-state vector does not bind its exact workspace PIT snapshot'
      USING ERRCODE = '23514';
  END IF;

  context_manifest := jsonb_build_object(
    'geographyId', state_vector.geography_id::text,
    'knownAt', known_at_text,
    'policy', state_vector.policy,
    'snapshotSha256', state_vector.snapshot_manifest_sha256
  );
  IF state_vector.system_at IS NOT NULL THEN
    context_manifest := context_manifest || jsonb_build_object('systemAt', system_at_text);
  END IF;
  calculated_context_sha256 := encode(digest(
    convert_to(evidence.canonical_json(context_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  IF state_vector.context_sha256 IS DISTINCT FROM calculated_context_sha256 THEN
    RAISE EXCEPTION 'economic-state vector context digest is invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*),
    count(slot.state_run_id),
    count(slot.state_run_id) FILTER (WHERE run.score IS NOT NULL),
    count(slot.state_run_id) FILTER (WHERE run.status = 'insufficient_data'),
    count(*) FILTER (WHERE slot.state_run_id IS NULL),
    count(DISTINCT slot.model_id) FILTER (WHERE slot.model_id IS NOT NULL),
    coalesce(sum(run.completeness::numeric), 0),
    coalesce(sum(run.confidence::numeric), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'dimension', slot.dimension,
      'model', CASE WHEN run.id IS NULL THEN NULL ELSE model.definition_manifest END,
      'result', CASE WHEN run.id IS NULL THEN NULL ELSE
        run.result_manifest || jsonb_build_object(
          'manifestSha256', run.result_manifest_sha256
        )
      END,
      'missingReason', slot.missing_reason
    ) ORDER BY slot.ordinal), '[]'::jsonb)
  INTO
    slot_count, reported_count, scored_count, insufficient_count, missing_count,
    unique_model_count, completeness_sum, confidence_sum, dimensions_manifest
  FROM evidence.economic_state_vector_dimensions slot
  LEFT JOIN evidence.economic_state_runs run
    ON run.organization_id = slot.organization_id
    AND run.workspace_id = slot.workspace_id
    AND run.id = slot.state_run_id
    AND run.model_id = slot.model_id
  LEFT JOIN evidence.economic_state_models model
    ON model.organization_id = slot.organization_id
    AND model.workspace_id = slot.workspace_id
    AND model.id = slot.model_id
  WHERE slot.organization_id = state_vector.organization_id
    AND slot.workspace_id = state_vector.workspace_id
    AND slot.vector_id = state_vector.id;

  IF slot_count <> 5 OR reported_count + missing_count <> 5
    OR unique_model_count <> reported_count
  THEN
    RAISE EXCEPTION 'economic-state vector requires five canonical slots and unique models'
      USING ERRCODE = '23514';
  END IF;

  FOR reported IN
    SELECT
      slot.dimension,
      model.id AS model_id,
      model.dimension AS model_dimension,
      run.id AS run_id,
      run.geography_id,
      run.snapshot_id,
      run.snapshot_manifest_sha256,
      run.known_at,
      run.policy,
      run.system_at,
      run.model_definition_sha256,
      model.definition_sha256
    FROM evidence.economic_state_vector_dimensions slot
    JOIN evidence.economic_state_runs run
      ON run.organization_id = slot.organization_id
      AND run.workspace_id = slot.workspace_id
      AND run.id = slot.state_run_id
      AND run.model_id = slot.model_id
    JOIN evidence.economic_state_models model
      ON model.organization_id = slot.organization_id
      AND model.workspace_id = slot.workspace_id
      AND model.id = slot.model_id
    WHERE slot.organization_id = state_vector.organization_id
      AND slot.workspace_id = state_vector.workspace_id
      AND slot.vector_id = state_vector.id
  LOOP
    IF reported.model_dimension IS DISTINCT FROM reported.dimension
      OR reported.geography_id IS DISTINCT FROM state_vector.geography_id
      OR reported.snapshot_id IS DISTINCT FROM state_vector.snapshot_id
      OR reported.snapshot_manifest_sha256 IS DISTINCT FROM state_vector.snapshot_manifest_sha256
      OR reported.known_at IS DISTINCT FROM state_vector.known_at
      OR reported.policy IS DISTINCT FROM state_vector.policy
      OR reported.system_at IS DISTINCT FROM state_vector.system_at
      OR reported.model_definition_sha256 IS DISTINCT FROM reported.definition_sha256
    THEN
      RAISE EXCEPTION 'economic-state vector dimension does not share its exact model/context'
        USING ERRCODE = '23514';
    END IF;
    PERFORM evidence.validate_economic_state_model(reported.model_id);
    PERFORM evidence.validate_economic_state_run(reported.run_id);
  END LOOP;

  SELECT
    count(component.component_key),
    count(component.component_key) FILTER (WHERE component.raw_value IS NOT NULL),
    count(DISTINCT component.source_id)
  INTO reported_component_count, observed_component_count, source_count
  FROM evidence.economic_state_vector_dimensions slot
  JOIN evidence.economic_state_component_results component
    ON component.organization_id = slot.organization_id
    AND component.workspace_id = slot.workspace_id
    AND component.run_id = slot.state_run_id
    AND component.model_id = slot.model_id
  WHERE slot.organization_id = state_vector.organization_id
    AND slot.workspace_id = state_vector.workspace_id
    AND slot.vector_id = state_vector.id;

  expected_dimension_coverage := evidence.canonical_economic_state_decimal(
    reported_count::numeric / 5
  );
  expected_scored_dimension_coverage := evidence.canonical_economic_state_decimal(
    scored_count::numeric / 5
  );
  expected_evidence_coverage := evidence.canonical_economic_state_decimal(
    completeness_sum / 5
  );
  expected_confidence_coverage := evidence.canonical_economic_state_decimal(
    confidence_sum / 5
  );
  expected_evidence_quality := CASE WHEN completeness_sum = 0 THEN NULL ELSE
    evidence.canonical_economic_state_decimal(confidence_sum / completeness_sum)
  END;
  expected_source_coverage := CASE WHEN reported_component_count = 0 THEN NULL ELSE
    evidence.canonical_economic_state_decimal(
      source_count::numeric / reported_component_count
    )
  END;

  IF state_vector.dimension_count <> 5
    OR state_vector.reported_dimension_count <> reported_count
    OR state_vector.scored_dimension_count <> scored_count
    OR state_vector.insufficient_dimension_count <> insufficient_count
    OR state_vector.missing_dimension_count <> missing_count
    OR state_vector.dimension_coverage IS DISTINCT FROM expected_dimension_coverage
    OR state_vector.scored_dimension_coverage IS DISTINCT FROM expected_scored_dimension_coverage
    OR state_vector.evidence_coverage IS DISTINCT FROM expected_evidence_coverage
    OR state_vector.confidence_coverage IS DISTINCT FROM expected_confidence_coverage
    OR state_vector.evidence_quality IS DISTINCT FROM expected_evidence_quality
    OR state_vector.reported_component_count <> reported_component_count
    OR state_vector.observed_component_count <> observed_component_count
    OR state_vector.distinct_source_count <> source_count
    OR state_vector.distinct_source_coverage IS DISTINCT FROM expected_source_coverage
  THEN
    RAISE EXCEPTION 'economic-state vector diagnostics are not reproducible'
      USING ERRCODE = '23514';
  END IF;

  diagnostics_manifest := jsonb_build_object(
    'dimensionCount', 5,
    'reportedDimensionCount', reported_count,
    'scoredDimensionCount', scored_count,
    'insufficientDimensionCount', insufficient_count,
    'missingDimensionCount', missing_count,
    'dimensionCoverage', expected_dimension_coverage,
    'scoredDimensionCoverage', expected_scored_dimension_coverage,
    'evidenceCoverage', expected_evidence_coverage,
    'confidenceCoverage', expected_confidence_coverage,
    'evidenceQuality', expected_evidence_quality,
    'reportedComponentCount', reported_component_count,
    'observedComponentCount', observed_component_count,
    'distinctSourceCount', source_count,
    'distinctSourceCoverage', expected_source_coverage
  );
  expected_body := jsonb_build_object(
    'schemaVersion', 1,
    'context', context_manifest,
    'contextSha256', calculated_context_sha256,
    'dimensions', dimensions_manifest,
    'diagnostics', diagnostics_manifest
  );
  calculated_manifest_sha256 := encode(digest(
    convert_to(evidence.canonical_json(expected_body), 'UTF8'), 'sha256'
  ), 'hex');
  expected_manifest := expected_body || jsonb_build_object(
    'manifestSha256', calculated_manifest_sha256
  );
  IF state_vector.state_manifest_sha256 IS DISTINCT FROM calculated_manifest_sha256
    OR state_vector.state_manifest IS DISTINCT FROM expected_manifest
  THEN
    RAISE EXCEPTION 'economic-state vector manifest or digest is invalid'
      USING ERRCODE = '23514';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION evidence.validate_economic_state_vector_deferred()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
BEGIN
  PERFORM evidence.validate_economic_state_vector(
    CASE
      WHEN TG_TABLE_NAME = 'economic_state_vectors' THEN NEW.id
      ELSE NEW.vector_id
    END
  );
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER economic_state_vectors_validate_deferred
AFTER INSERT ON evidence.economic_state_vectors
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION evidence.validate_economic_state_vector_deferred();
CREATE CONSTRAINT TRIGGER economic_state_vector_dimensions_validate_deferred
AFTER INSERT ON evidence.economic_state_vector_dimensions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION evidence.validate_economic_state_vector_deferred();

CREATE TRIGGER economic_state_vectors_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.economic_state_vectors
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER economic_state_vector_dimensions_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.economic_state_vector_dimensions
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

-- The generic `run` endpoint remains the transformation-run vocabulary. State
-- calculations and assembled vectors receive explicit, non-ambiguous types.
ALTER TABLE evidence.lineage_edges
  DROP CONSTRAINT lineage_edges_from_type_check,
  DROP CONSTRAINT lineage_edges_to_type_check;
ALTER TABLE evidence.lineage_edges
  ADD CONSTRAINT lineage_edges_from_type_check CHECK (
    from_type IN (
      'payload', 'release', 'observation', 'dataset', 'feature', 'model',
      'run', 'output', 'state_run', 'state_vector'
    )
  ),
  ADD CONSTRAINT lineage_edges_to_type_check CHECK (
    to_type IN (
      'release', 'observation', 'dataset', 'feature', 'model', 'run',
      'output', 'state_run', 'state_vector'
    )
  );

CREATE OR REPLACE FUNCTION evidence.lineage_endpoint_scope(
  endpoint_type text,
  endpoint_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  scope uuid;
BEGIN
  CASE endpoint_type
    WHEN 'payload' THEN
      SELECT organization_id INTO scope FROM evidence.raw_payloads WHERE id = endpoint_id;
    WHEN 'release' THEN
      SELECT organization_id INTO scope FROM evidence.releases WHERE id = endpoint_id;
    WHEN 'observation' THEN
      SELECT organization_id INTO scope FROM evidence.observations WHERE id = endpoint_id;
    WHEN 'dataset' THEN
      SELECT organization_id INTO scope FROM evidence.source_datasets WHERE id = endpoint_id;
    WHEN 'model' THEN
      SELECT organization_id INTO scope
      FROM evidence.economic_state_models WHERE id = endpoint_id;
    WHEN 'run' THEN
      SELECT organization_id INTO scope
      FROM evidence.transformation_runs WHERE id = endpoint_id;
    WHEN 'state_run' THEN
      SELECT organization_id INTO scope
      FROM evidence.economic_state_runs WHERE id = endpoint_id;
    WHEN 'state_vector' THEN
      SELECT organization_id INTO scope
      FROM evidence.economic_state_vectors WHERE id = endpoint_id;
    ELSE
      RAISE EXCEPTION 'lineage endpoint type % is not available in this phase', endpoint_type
        USING ERRCODE = '23514';
  END CASE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lineage endpoint does not exist' USING ERRCODE = '23503';
  END IF;
  RETURN scope;
END
$$;

CREATE OR REPLACE FUNCTION evidence.validate_lineage_edge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  from_scope uuid;
  to_scope uuid;
BEGIN
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

CREATE OR REPLACE FUNCTION evidence.record_economic_state_run_lineage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
BEGIN
  INSERT INTO evidence.lineage_edges (
    organization_id, from_type, from_id, to_type, to_id,
    relation, transformation_version
  ) VALUES (
    NEW.organization_id, 'model', NEW.model_id, 'state_run', NEW.id,
    'executed_with', NEW.model_version
  ) ON CONFLICT DO NOTHING;
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION evidence.record_economic_state_component_lineage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  run_version text;
BEGIN
  IF NEW.observation_id IS NULL THEN RETURN NULL; END IF;
  SELECT model_version INTO STRICT run_version
  FROM evidence.economic_state_runs run
  WHERE run.id = NEW.run_id
    AND run.organization_id = NEW.organization_id
    AND run.workspace_id = NEW.workspace_id;
  INSERT INTO evidence.lineage_edges (
    organization_id, from_type, from_id, to_type, to_id,
    relation, transformation_version
  ) VALUES (
    NEW.organization_id, 'observation', NEW.observation_id,
    'state_run', NEW.run_id, 'derived_from', run_version
  ) ON CONFLICT DO NOTHING;
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION evidence.record_economic_state_vector_lineage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  run_version text;
BEGIN
  IF NEW.state_run_id IS NULL THEN RETURN NULL; END IF;
  SELECT model_version INTO STRICT run_version
  FROM evidence.economic_state_runs run
  WHERE run.id = NEW.state_run_id
    AND run.organization_id = NEW.organization_id
    AND run.workspace_id = NEW.workspace_id
    AND run.model_id = NEW.model_id;
  INSERT INTO evidence.lineage_edges (
    organization_id, from_type, from_id, to_type, to_id,
    relation, transformation_version
  ) VALUES (
    NEW.organization_id, 'state_run', NEW.state_run_id,
    'state_vector', NEW.vector_id, 'produced', run_version
  ) ON CONFLICT DO NOTHING;
  RETURN NULL;
END
$$;

CREATE TRIGGER economic_state_runs_record_lineage
AFTER INSERT ON evidence.economic_state_runs
FOR EACH ROW EXECUTE FUNCTION evidence.record_economic_state_run_lineage();
CREATE TRIGGER economic_state_component_results_record_lineage
AFTER INSERT ON evidence.economic_state_component_results
FOR EACH ROW EXECUTE FUNCTION evidence.record_economic_state_component_lineage();
CREATE TRIGGER economic_state_vector_dimensions_record_lineage
AFTER INSERT ON evidence.economic_state_vector_dimensions
FOR EACH ROW EXECUTE FUNCTION evidence.record_economic_state_vector_lineage();

INSERT INTO evidence.lineage_edges (
  organization_id, from_type, from_id, to_type, to_id,
  relation, transformation_version
)
SELECT
  run.organization_id, 'model', run.model_id, 'state_run', run.id,
  'executed_with', run.model_version
FROM evidence.economic_state_runs run
ON CONFLICT DO NOTHING;

INSERT INTO evidence.lineage_edges (
  organization_id, from_type, from_id, to_type, to_id,
  relation, transformation_version
)
SELECT DISTINCT
  component.organization_id, 'observation', component.observation_id,
  'state_run', component.run_id, 'derived_from', run.model_version
FROM evidence.economic_state_component_results component
JOIN evidence.economic_state_runs run
  ON run.organization_id = component.organization_id
  AND run.workspace_id = component.workspace_id
  AND run.id = component.run_id
WHERE component.observation_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION evidence.lineage_endpoint_workspace(
  endpoint_type text,
  endpoint_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  workspace uuid;
BEGIN
  CASE endpoint_type
    WHEN 'model' THEN
      SELECT workspace_id INTO workspace
      FROM evidence.economic_state_models WHERE id = endpoint_id;
    WHEN 'state_run' THEN
      SELECT workspace_id INTO workspace
      FROM evidence.economic_state_runs WHERE id = endpoint_id;
    WHEN 'state_vector' THEN
      SELECT workspace_id INTO workspace
      FROM evidence.economic_state_vectors WHERE id = endpoint_id;
    ELSE
      RETURN NULL;
  END CASE;
  RETURN workspace;
END
$$;

CREATE OR REPLACE FUNCTION evidence.lineage_edge_visible(
  requested_organization_id uuid,
  requested_from_type text,
  requested_from_id uuid,
  requested_to_type text,
  requested_to_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
DECLARE
  from_workspace uuid;
  to_workspace uuid;
BEGIN
  IF NOT evidence.tenant_visible(requested_organization_id) THEN RETURN false; END IF;
  from_workspace := evidence.lineage_endpoint_workspace(
    requested_from_type, requested_from_id
  );
  to_workspace := evidence.lineage_endpoint_workspace(
    requested_to_type, requested_to_id
  );
  RETURN
    (from_workspace IS NULL OR evidence.economic_state_workspace_visible(
      requested_organization_id, from_workspace
    ))
    AND (to_workspace IS NULL OR evidence.economic_state_workspace_visible(
      requested_organization_id, to_workspace
    ));
END
$$;

ALTER TABLE evidence.economic_state_vectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.economic_state_vectors FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.economic_state_vector_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.economic_state_vector_dimensions FORCE ROW LEVEL SECURITY;
CREATE POLICY economic_state_vectors_workspace ON evidence.economic_state_vectors
  USING (evidence.economic_state_workspace_visible(organization_id, workspace_id))
  WITH CHECK (evidence.economic_state_workspace_visible(organization_id, workspace_id));
CREATE POLICY economic_state_vector_dimensions_workspace
  ON evidence.economic_state_vector_dimensions
  USING (evidence.economic_state_workspace_visible(organization_id, workspace_id))
  WITH CHECK (evidence.economic_state_workspace_visible(organization_id, workspace_id));

DROP POLICY lineage_edges_tenant ON evidence.lineage_edges;
CREATE POLICY lineage_edges_scope ON evidence.lineage_edges
  USING (evidence.lineage_edge_visible(
    organization_id, from_type, from_id, to_type, to_id
  ))
  WITH CHECK (evidence.lineage_edge_visible(
    organization_id, from_type, from_id, to_type, to_id
  ));

REVOKE ALL ON TABLE evidence.economic_state_vectors,
  evidence.economic_state_vector_dimensions FROM PUBLIC;
GRANT SELECT ON evidence.economic_state_vectors,
  evidence.economic_state_vector_dimensions TO economyos_app;
GRANT SELECT, INSERT ON evidence.economic_state_vectors,
  evidence.economic_state_vector_dimensions TO economyos_ingest;
REVOKE UPDATE, DELETE ON evidence.economic_state_vectors,
  evidence.economic_state_vector_dimensions FROM economyos_app, economyos_ingest;

REVOKE ALL ON FUNCTION evidence.canonical_economic_state_decimal(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_vector_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_vector(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_vector_deferred() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.record_economic_state_run_lineage() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.record_economic_state_component_lineage() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.record_economic_state_vector_lineage() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.lineage_endpoint_workspace(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.lineage_edge_visible(uuid, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evidence.lineage_endpoint_workspace(text, uuid)
  TO economyos_app, economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.lineage_edge_visible(uuid, text, uuid, text, uuid)
  TO economyos_app, economyos_ingest;

COMMENT ON TABLE evidence.economic_state_vectors IS
  'Immutable five-dimensional EconomicState envelopes reconstructed from exact workspace model/run evidence.';
COMMENT ON TABLE evidence.economic_state_vector_dimensions IS
  'Exactly five ordered slots: one bound state run/model result or one explicit dimension missing reason.';
COMMENT ON COLUMN evidence.economic_state_vectors.state_manifest IS
  'Complete schema-v1 package envelope including its manifestSha256 field.';
COMMENT ON COLUMN evidence.economic_state_vectors.assembled_by IS
  'Authenticated subject that assembled and committed the immutable vector.';
COMMENT ON FUNCTION evidence.validate_economic_state_vector(uuid) IS
  'Rebuilds all five slots, nested manifests, diagnostics, context, and digests and fails closed on mismatch.';
COMMENT ON FUNCTION evidence.lineage_endpoint_scope(text, uuid) IS
  'Resolves real lineage endpoints; generic run means transformation run, while state_run and state_vector are explicit.';
