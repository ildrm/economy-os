-- Corrections to the frozen 0012 economic-state schema:
-- 1. true-vintage calculations may optionally declare a system-time cutoff;
-- 2. zero available weight always fails closed, even for a zero-threshold model;
-- 3. an observed component must be derivable through the governed PIT serving path.

ALTER TABLE evidence.economic_state_runs
  DROP CONSTRAINT economic_state_runs_check;
ALTER TABLE evidence.economic_state_runs
  ADD CONSTRAINT economic_state_runs_pit_context_check CHECK (
    (policy = 'reconstructed' AND system_at IS NOT NULL)
    OR policy = 'true_vintage'
    OR (policy = 'latest_revised' AND system_at IS NULL)
  );

CREATE OR REPLACE FUNCTION evidence.validate_economic_state_run_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  snapshot evidence.dataset_snapshots%ROWTYPE;
  known_at_text text;
  system_at_text text;
BEGIN
  SELECT * INTO snapshot
  FROM evidence.dataset_snapshots
  WHERE id = NEW.snapshot_id
    AND organization_id = NEW.organization_id
    AND workspace_id = NEW.workspace_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'economic-state snapshot is outside the requested tenant workspace'
      USING ERRCODE = '23514';
  END IF;
  IF snapshot.manifest_sha256 <> NEW.snapshot_manifest_sha256
    OR snapshot.known_at IS DISTINCT FROM NEW.known_at
    OR snapshot.policy <> NEW.policy
    OR snapshot.system_at IS DISTINCT FROM NEW.system_at
  THEN
    RAISE EXCEPTION 'economic-state run does not bind the exact PIT snapshot context'
      USING ERRCODE = '23514';
  END IF;
  IF jsonb_typeof(snapshot.manifest->'observationIds') <> 'array' THEN
    RAISE EXCEPTION 'economic-state snapshots require an explicit observationIds array'
      USING ERRCODE = '23514';
  END IF;

  known_at_text := NEW.result_manifest->>'knownAt';
  IF known_at_text IS NULL
    OR known_at_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]+)?Z$'
    OR known_at_text::timestamptz IS DISTINCT FROM NEW.known_at
  THEN
    RAISE EXCEPTION 'economic-state result knownAt is not the bound canonical instant'
      USING ERRCODE = '23514';
  END IF;

  system_at_text := NEW.result_manifest->>'systemAt';
  IF NEW.policy = 'reconstructed' THEN
    IF NEW.system_at IS NULL
      OR system_at_text IS NULL
      OR system_at_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]+)?Z$'
      OR system_at_text::timestamptz IS DISTINCT FROM NEW.system_at
    THEN
      RAISE EXCEPTION 'reconstructed economic state requires its exact systemAt instant'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.policy = 'true_vintage' THEN
    IF NEW.system_at IS NULL THEN
      IF NEW.result_manifest ? 'systemAt' THEN
        RAISE EXCEPTION 'true-vintage result cannot claim an unbound systemAt'
          USING ERRCODE = '23514';
      END IF;
    ELSIF system_at_text IS NULL
      OR system_at_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]+)?Z$'
      OR system_at_text::timestamptz IS DISTINCT FROM NEW.system_at
    THEN
      RAISE EXCEPTION 'true-vintage result systemAt differs from its snapshot cutoff'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.system_at IS NOT NULL OR NEW.result_manifest ? 'systemAt' THEN
    RAISE EXCEPTION 'latest-revised economic state cannot claim systemAt'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'economic-state result contains an invalid PIT instant'
      USING ERRCODE = '23514';
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
  actual_series_id uuid;
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
    observation.series_id, series.concept_id, series.geography_id,
    dataset.source_id, observation.tenant_scope
  INTO
    actual_series_id, actual_concept_id, actual_geography_id,
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
  IF NOT EXISTS (
    SELECT 1
    FROM evidence.governed_observations_as_known(
      actual_series_id, run.known_at, run.policy, run.system_at, 'derive', 10000
    ) governed
    WHERE governed.observation_id = NEW.observation_id
  ) THEN
    RAISE EXCEPTION 'economic-state observation is not derivable under its exact governed PIT context'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION evidence.validate_economic_state_run(requested_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  run evidence.economic_state_runs%ROWTYPE;
  model evidence.economic_state_models%ROWTYPE;
  total_components integer;
  result_components integer;
  source_count integer;
  total_weight numeric;
  available_weight numeric;
  weighted_score numeric;
  weighted_confidence numeric;
  exact_completeness numeric;
  component_manifest jsonb;
  expected_manifest jsonb;
  expected_status text;
  expected_score numeric;
BEGIN
  SELECT * INTO STRICT run FROM evidence.economic_state_runs WHERE id = requested_run_id;
  SELECT * INTO STRICT model FROM evidence.economic_state_models WHERE id = run.model_id;

  SELECT
    count(definition.component_key),
    count(result.component_key),
    count(DISTINCT result.source_id),
    sum(definition.weight::numeric),
    coalesce(sum(definition.weight::numeric) FILTER (WHERE result.raw_value IS NOT NULL), 0),
    coalesce(sum(
      definition.weight::numeric * (
        CASE definition.polarity
          WHEN 'positive' THEN
            (result.raw_value::numeric - definition.lower_bound::numeric)
            / (definition.upper_bound::numeric - definition.lower_bound::numeric)
          ELSE 1 - (
            (result.raw_value::numeric - definition.lower_bound::numeric)
            / (definition.upper_bound::numeric - definition.lower_bound::numeric)
          )
        END
      )
    ) FILTER (WHERE result.raw_value IS NOT NULL), 0),
    coalesce(sum(
      definition.weight::numeric * result.quality::numeric
    ) FILTER (WHERE result.raw_value IS NOT NULL), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'componentKey', result.component_key,
      'observationId', result.observation_id::text,
      'sourceId', result.source_id::text,
      'rawValue', result.raw_value,
      'normalizedValue', result.normalized_value,
      'contribution', result.contribution,
      'missingReason', result.missing_reason,
      'quality', result.quality
    ) ORDER BY result.component_key) FILTER (WHERE result.component_key IS NOT NULL), '[]'::jsonb)
  INTO
    total_components, result_components, source_count, total_weight, available_weight,
    weighted_score, weighted_confidence, component_manifest
  FROM evidence.economic_state_model_components definition
  LEFT JOIN evidence.economic_state_component_results result
    ON result.organization_id = definition.organization_id
    AND result.workspace_id = definition.workspace_id
    AND result.model_id = definition.model_id
    AND result.component_key = definition.component_key
    AND result.run_id = run.id
  WHERE definition.organization_id = run.organization_id
    AND definition.workspace_id = run.workspace_id
    AND definition.model_id = run.model_id;

  IF total_components NOT BETWEEN 1 AND 100 OR result_components <> total_components THEN
    RAISE EXCEPTION 'every economic-state model component requires one explicit result'
      USING ERRCODE = '23514';
  END IF;
  exact_completeness := available_weight / total_weight;
  IF run.completeness::numeric <> round(exact_completeness, 6)
    OR run.source_coverage::numeric <> round(source_count::numeric / total_components, 6)
    OR run.confidence::numeric <> round(weighted_confidence / total_weight, 6)
    OR run.independent_source_count <> source_count
  THEN
    RAISE EXCEPTION 'economic-state coverage or confidence summary is not reproducible'
      USING ERRCODE = '23514';
  END IF;

  IF available_weight > 0 AND exact_completeness >= model.minimum_coverage::numeric THEN
    expected_status := CASE WHEN exact_completeness = 1 THEN 'complete' ELSE 'partial' END;
    expected_score := round(weighted_score / available_weight * 100, 6);
    IF run.status <> expected_status OR run.score::numeric <> expected_score
      OR run.missing_reason IS NOT NULL
      OR run.renormalized <> (exact_completeness < 1)
    THEN
      RAISE EXCEPTION 'economic-state score/status is not reproducible'
        USING ERRCODE = '23514';
    END IF;
  ELSIF run.status <> 'insufficient_data'
    OR run.score IS NOT NULL
    OR run.missing_reason <> 'insufficient_component_coverage'
    OR run.renormalized
  THEN
    RAISE EXCEPTION 'insufficient economic-state coverage must fail closed'
      USING ERRCODE = '23514';
  END IF;

  expected_manifest := jsonb_build_object(
    'schemaVersion', 1,
    'modelId', model.id::text,
    'modelKey', model.model_key,
    'modelVersion', model.model_version,
    'dimension', model.dimension,
    'geographyId', run.geography_id::text,
    'knownAt', run.result_manifest->>'knownAt',
    'policy', run.policy,
    'snapshotSha256', run.snapshot_manifest_sha256,
    'status', run.status,
    'score', run.score,
    'missingReason', run.missing_reason,
    'completeness', run.completeness,
    'sourceCoverage', run.source_coverage,
    'confidence', run.confidence,
    'independentSourceCount', run.independent_source_count,
    'renormalized', run.renormalized,
    'components', component_manifest
  );
  IF run.system_at IS NOT NULL THEN
    expected_manifest := expected_manifest || jsonb_build_object(
      'systemAt', run.result_manifest->>'systemAt'
    );
  END IF;
  IF run.result_manifest <> expected_manifest THEN
    RAISE EXCEPTION 'economic-state result manifest differs from normalized results'
      USING ERRCODE = '23514';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION evidence.validate_economic_state_run_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_component_result() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_run(uuid) FROM PUBLIC;

COMMENT ON CONSTRAINT economic_state_runs_pit_context_check
  ON evidence.economic_state_runs IS
  'Reconstructed requires system_at; true-vintage permits an optional system cutoff; latest-revised forbids one.';
COMMENT ON FUNCTION evidence.validate_economic_state_component_result() IS
  'Requires exact model/snapshot provenance and derive-authorized governed PIT visibility before persisting observed state evidence.';
