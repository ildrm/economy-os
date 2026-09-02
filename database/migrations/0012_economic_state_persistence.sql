-- Phase 3 economic-state persistence. Model definitions and calculated state
-- outputs are immutable, tenant-scoped scientific records. Their JSON
-- manifests are commitments to the normalized rows, not alternate mutable
-- representations.

CREATE TABLE evidence.economic_state_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  model_key text NOT NULL CHECK (model_key ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  model_version text NOT NULL CHECK (
    model_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
  ),
  dimension text NOT NULL CHECK (
    dimension IN ('macroeconomic', 'human_economic', 'financial_system', 'market', 'regime')
  ),
  minimum_coverage text NOT NULL CHECK (
    minimum_coverage ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$'
    AND minimum_coverage::numeric BETWEEN 0 AND 1
  ),
  definition_manifest jsonb NOT NULL CHECK (jsonb_typeof(definition_manifest) = 'object'),
  definition_sha256 text NOT NULL CHECK (definition_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(created_at)),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, model_key, model_version),
  UNIQUE (organization_id, workspace_id, id),
  UNIQUE (organization_id, workspace_id, id, model_version, definition_sha256)
);

CREATE TABLE evidence.economic_state_model_components (
  organization_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  model_id uuid NOT NULL,
  component_key text NOT NULL CHECK (component_key ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  concept_id uuid NOT NULL REFERENCES evidence.concepts(id) ON DELETE RESTRICT,
  weight text NOT NULL CHECK (
    weight ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$' AND weight::numeric > 0
  ),
  polarity text NOT NULL CHECK (polarity IN ('positive', 'negative')),
  lower_bound text NOT NULL CHECK (
    lower_bound ~ '^-?(0|[1-9][0-9]*)(\.[0-9]{1,18})?$'
  ),
  upper_bound text NOT NULL CHECK (
    upper_bound ~ '^-?(0|[1-9][0-9]*)(\.[0-9]{1,18})?$'
  ),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(created_at)),
  PRIMARY KEY (organization_id, workspace_id, model_id, component_key),
  FOREIGN KEY (organization_id, workspace_id, model_id)
    REFERENCES evidence.economic_state_models(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, model_id, concept_id),
  CHECK (upper_bound::numeric > lower_bound::numeric)
);

CREATE TABLE evidence.economic_state_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  snapshot_id uuid NOT NULL REFERENCES evidence.dataset_snapshots(id) ON DELETE RESTRICT,
  snapshot_manifest_sha256 text NOT NULL CHECK (snapshot_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  model_id uuid NOT NULL,
  model_version text NOT NULL CHECK (
    model_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
  ),
  model_definition_sha256 text NOT NULL CHECK (model_definition_sha256 ~ '^[0-9a-f]{64}$'),
  geography_id uuid NOT NULL REFERENCES evidence.geographies(id) ON DELETE RESTRICT,
  known_at timestamptz NOT NULL CHECK (isfinite(known_at)),
  policy text NOT NULL CHECK (policy IN ('true_vintage', 'reconstructed', 'latest_revised')),
  system_at timestamptz CHECK (system_at IS NULL OR isfinite(system_at)),
  status text NOT NULL CHECK (status IN ('complete', 'partial', 'insufficient_data')),
  score text CHECK (
    score IS NULL OR (
      score ~ '^(0|[1-9][0-9]*)(\.[0-9]{0,5}[1-9])?$'
      AND score::numeric BETWEEN 0 AND 100
    )
  ),
  missing_reason text CHECK (
    missing_reason IS NULL OR missing_reason = 'insufficient_component_coverage'
  ),
  completeness text NOT NULL CHECK (
    completeness ~ '^(0|[1-9][0-9]*)(\.[0-9]{0,5}[1-9])?$'
    AND completeness::numeric BETWEEN 0 AND 1
  ),
  source_coverage text NOT NULL CHECK (
    source_coverage ~ '^(0|[1-9][0-9]*)(\.[0-9]{0,5}[1-9])?$'
    AND source_coverage::numeric BETWEEN 0 AND 1
  ),
  confidence text NOT NULL CHECK (
    confidence ~ '^(0|[1-9][0-9]*)(\.[0-9]{0,5}[1-9])?$'
    AND confidence::numeric BETWEEN 0 AND 1
  ),
  independent_source_count integer NOT NULL CHECK (independent_source_count BETWEEN 0 AND 100),
  renormalized boolean NOT NULL,
  result_manifest jsonb NOT NULL CHECK (jsonb_typeof(result_manifest) = 'object'),
  result_manifest_sha256 text NOT NULL CHECK (result_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  calculated_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  calculated_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(calculated_at)),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (
    organization_id, workspace_id, model_id, model_version, model_definition_sha256
  ) REFERENCES evidence.economic_state_models(
    organization_id, workspace_id, id, model_version, definition_sha256
  ) ON DELETE RESTRICT,
  CHECK (
    (policy = 'reconstructed' AND system_at IS NOT NULL)
    OR (policy IN ('true_vintage', 'latest_revised') AND system_at IS NULL)
  ),
  CHECK (
    (status IN ('complete', 'partial') AND score IS NOT NULL AND missing_reason IS NULL)
    OR (
      status = 'insufficient_data' AND score IS NULL
      AND missing_reason = 'insufficient_component_coverage'
    )
  ),
  CHECK (
    (status = 'complete' AND completeness::numeric = 1 AND NOT renormalized)
    OR (status = 'partial' AND completeness::numeric < 1 AND renormalized)
    OR (status = 'insufficient_data' AND NOT renormalized)
  ),
  UNIQUE (organization_id, workspace_id, id),
  UNIQUE (organization_id, workspace_id, id, model_id),
  UNIQUE (organization_id, workspace_id, snapshot_id, model_id, geography_id)
);

CREATE TABLE evidence.economic_state_component_results (
  organization_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  model_id uuid NOT NULL,
  component_key text NOT NULL,
  observation_id uuid REFERENCES evidence.observations(id) ON DELETE RESTRICT,
  source_id uuid REFERENCES evidence.sources(id) ON DELETE RESTRICT,
  raw_value text CHECK (
    raw_value IS NULL OR raw_value ~ '^-?(0|[1-9][0-9]*)(\.[0-9]{1,18})?$'
  ),
  normalized_value text CHECK (
    normalized_value IS NULL OR normalized_value ~ '^(0|[1-9][0-9]*)(\.[0-9]{0,5}[1-9])?$'
  ),
  contribution text CHECK (
    contribution IS NULL OR contribution ~ '^(0|[1-9][0-9]*)(\.[0-9]{0,5}[1-9])?$'
  ),
  missing_reason text CHECK (
    missing_reason IS NULL OR missing_reason IN (
      'source_missing', 'not_collected', 'not_applicable', 'suppressed',
      'delayed', 'parse_failure', 'license_withheld'
    )
  ),
  quality text CHECK (
    quality IS NULL OR (
      quality ~ '^(0|[1-9][0-9]*)(\.[0-9]{0,5}[1-9])?$'
      AND quality::numeric BETWEEN 0 AND 1
    )
  ),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(created_at)),
  PRIMARY KEY (organization_id, workspace_id, run_id, component_key),
  FOREIGN KEY (organization_id, workspace_id, run_id, model_id)
    REFERENCES evidence.economic_state_runs(organization_id, workspace_id, id, model_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, model_id, component_key)
    REFERENCES evidence.economic_state_model_components(
      organization_id, workspace_id, model_id, component_key
    ) ON DELETE RESTRICT,
  CHECK (
    (
      raw_value IS NOT NULL AND missing_reason IS NULL
      AND observation_id IS NOT NULL AND source_id IS NOT NULL AND quality IS NOT NULL
      AND normalized_value IS NOT NULL AND contribution IS NOT NULL
    )
    OR (
      raw_value IS NULL AND missing_reason IS NOT NULL
      AND observation_id IS NULL AND source_id IS NULL AND quality IS NULL
      AND normalized_value IS NULL AND contribution IS NULL
    )
  ),
  CHECK (normalized_value IS NULL OR normalized_value::numeric BETWEEN 0 AND 1)
);

CREATE OR REPLACE FUNCTION evidence.verify_economic_state_manifest_digest()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  manifest jsonb;
  supplied text;
  calculated text;
BEGIN
  IF TG_TABLE_NAME = 'economic_state_models' THEN
    manifest := NEW.definition_manifest;
    supplied := NEW.definition_sha256;
  ELSE
    manifest := NEW.result_manifest;
    supplied := NEW.result_manifest_sha256;
  END IF;
  calculated := encode(evidence.digest(
    convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'
  ), 'hex');
  IF supplied <> calculated THEN
    RAISE EXCEPTION '% manifest digest is invalid', TG_TABLE_NAME USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER economic_state_models_verify_digest
BEFORE INSERT ON evidence.economic_state_models
FOR EACH ROW EXECUTE FUNCTION evidence.verify_economic_state_manifest_digest();
CREATE TRIGGER economic_state_runs_verify_digest
BEFORE INSERT ON evidence.economic_state_runs
FOR EACH ROW EXECUTE FUNCTION evidence.verify_economic_state_manifest_digest();

CREATE OR REPLACE FUNCTION evidence.validate_economic_state_model(requested_model_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  model evidence.economic_state_models%ROWTYPE;
  component_count integer;
  component_manifest jsonb;
  expected_manifest jsonb;
BEGIN
  SELECT * INTO STRICT model
  FROM evidence.economic_state_models
  WHERE id = requested_model_id;

  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
    'key', component.component_key,
    'conceptId', component.concept_id::text,
    'weight', component.weight,
    'polarity', component.polarity,
    'lowerBound', component.lower_bound,
    'upperBound', component.upper_bound
  ) ORDER BY component.component_key), '[]'::jsonb)
  INTO component_count, component_manifest
  FROM evidence.economic_state_model_components component
  WHERE component.organization_id = model.organization_id
    AND component.workspace_id = model.workspace_id
    AND component.model_id = model.id;

  IF component_count NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'economic-state models require between 1 and 100 components'
      USING ERRCODE = '23514';
  END IF;

  expected_manifest := jsonb_build_object(
    'schemaVersion', 1,
    'id', model.id::text,
    'key', model.model_key,
    'version', model.model_version,
    'dimension', model.dimension,
    'minimumCoverage', model.minimum_coverage,
    'components', component_manifest
  );
  IF model.definition_manifest <> expected_manifest THEN
    RAISE EXCEPTION 'economic-state definition manifest differs from normalized components'
      USING ERRCODE = '23514';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION evidence.validate_economic_state_model_deferred()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, evidence
AS $$
BEGIN
  PERFORM evidence.validate_economic_state_model(
    CASE WHEN TG_TABLE_NAME = 'economic_state_models' THEN NEW.id ELSE NEW.model_id END
  );
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER economic_state_models_validate_deferred
AFTER INSERT ON evidence.economic_state_models
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION evidence.validate_economic_state_model_deferred();
CREATE CONSTRAINT TRIGGER economic_state_model_components_validate_deferred
AFTER INSERT ON evidence.economic_state_model_components
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION evidence.validate_economic_state_model_deferred();

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
    IF system_at_text IS NULL
      OR system_at_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]+)?Z$'
      OR system_at_text::timestamptz IS DISTINCT FROM NEW.system_at
    THEN
      RAISE EXCEPTION 'reconstructed economic state requires its exact systemAt instant'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.result_manifest ? 'systemAt' THEN
    RAISE EXCEPTION 'non-reconstructed economic state cannot claim systemAt'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'economic-state result contains an invalid PIT instant'
      USING ERRCODE = '23514';
END
$$;

CREATE TRIGGER economic_state_runs_validate_insert
BEFORE INSERT ON evidence.economic_state_runs
FOR EACH ROW EXECUTE FUNCTION evidence.validate_economic_state_run_insert();

CREATE OR REPLACE FUNCTION evidence.validate_economic_state_component_result()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, evidence
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

  SELECT series.concept_id, series.geography_id, dataset.source_id, observation.tenant_scope
  INTO actual_concept_id, actual_geography_id, actual_source_id, actual_scope
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
  RETURN NEW;
END
$$;

CREATE TRIGGER economic_state_component_results_validate
BEFORE INSERT ON evidence.economic_state_component_results
FOR EACH ROW EXECUTE FUNCTION evidence.validate_economic_state_component_result();

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

  IF exact_completeness >= model.minimum_coverage::numeric THEN
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
  IF run.policy = 'reconstructed' THEN
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

CREATE OR REPLACE FUNCTION evidence.validate_economic_state_run_deferred()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, evidence
AS $$
BEGIN
  PERFORM evidence.validate_economic_state_run(
    CASE WHEN TG_TABLE_NAME = 'economic_state_runs' THEN NEW.id ELSE NEW.run_id END
  );
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER economic_state_runs_validate_deferred
AFTER INSERT ON evidence.economic_state_runs
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION evidence.validate_economic_state_run_deferred();
CREATE CONSTRAINT TRIGGER economic_state_component_results_validate_deferred
AFTER INSERT ON evidence.economic_state_component_results
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION evidence.validate_economic_state_run_deferred();

CREATE TRIGGER economic_state_models_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.economic_state_models
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER economic_state_model_components_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.economic_state_model_components
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER economic_state_runs_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.economic_state_runs
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER economic_state_component_results_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.economic_state_component_results
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

ALTER TABLE evidence.economic_state_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.economic_state_models FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.economic_state_model_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.economic_state_model_components FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.economic_state_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.economic_state_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.economic_state_component_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.economic_state_component_results FORCE ROW LEVEL SECURITY;

CREATE POLICY economic_state_models_tenant ON evidence.economic_state_models
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
CREATE POLICY economic_state_model_components_tenant ON evidence.economic_state_model_components
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
CREATE POLICY economic_state_runs_tenant ON evidence.economic_state_runs
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
CREATE POLICY economic_state_component_results_tenant
  ON evidence.economic_state_component_results
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());

CREATE INDEX economic_state_models_workspace_idx
  ON evidence.economic_state_models (organization_id, workspace_id, model_key, model_version);
CREATE INDEX economic_state_runs_lookup_idx
  ON evidence.economic_state_runs (
    organization_id, workspace_id, geography_id, known_at DESC, model_id
  );
CREATE INDEX economic_state_component_results_observation_idx
  ON evidence.economic_state_component_results (observation_id)
  WHERE observation_id IS NOT NULL;

REVOKE ALL ON TABLE evidence.economic_state_models,
  evidence.economic_state_model_components,
  evidence.economic_state_runs,
  evidence.economic_state_component_results FROM PUBLIC;
GRANT SELECT ON evidence.economic_state_models,
  evidence.economic_state_model_components,
  evidence.economic_state_runs,
  evidence.economic_state_component_results TO economyos_app;
GRANT SELECT, INSERT ON evidence.economic_state_models,
  evidence.economic_state_model_components,
  evidence.economic_state_runs,
  evidence.economic_state_component_results TO economyos_ingest;
REVOKE UPDATE, DELETE ON evidence.economic_state_models,
  evidence.economic_state_model_components,
  evidence.economic_state_runs,
  evidence.economic_state_component_results FROM economyos_app, economyos_ingest;

REVOKE ALL ON FUNCTION evidence.verify_economic_state_manifest_digest() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_model(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_model_deferred() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_run_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_component_result() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_run(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_run_deferred() FROM PUBLIC;

COMMENT ON TABLE evidence.economic_state_models IS
  'Immutable tenant-workspace composite model definitions committed by canonical manifest digest.';
COMMENT ON TABLE evidence.economic_state_runs IS
  'Immutable reproducible state outputs bound to an exact model, PIT snapshot, geography, and workspace.';
COMMENT ON TABLE evidence.economic_state_component_results IS
  'One explicit observed value or missingness record for every component of an economic-state run.';
