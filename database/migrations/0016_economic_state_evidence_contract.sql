-- Phase 3 evidence-contract hardening. New state models are executable
-- scientific products: exact feature series, parser/config identity, artifact
-- identity, and immutable quality evidence are all part of their manifests.

CREATE TABLE evidence.economic_state_model_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  artifact_key text NOT NULL CHECK (artifact_key ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  artifact_version text NOT NULL CHECK (
    artifact_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
  ),
  lifecycle_status text NOT NULL CHECK (
    lifecycle_status IN ('research', 'validated', 'approved', 'restricted', 'retired')
  ),
  algorithm_key text NOT NULL CHECK (algorithm_key ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  algorithm_version text NOT NULL CHECK (
    algorithm_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
  ),
  code_commit_sha256 text NOT NULL CHECK (code_commit_sha256 ~ '^[0-9a-f]{64}$'),
  package_lock_sha256 text NOT NULL CHECK (package_lock_sha256 ~ '^[0-9a-f]{64}$'),
  sbom_sha256 text NOT NULL CHECK (sbom_sha256 ~ '^[0-9a-f]{64}$'),
  environment_sha256 text NOT NULL CHECK (environment_sha256 ~ '^[0-9a-f]{64}$'),
  configuration_sha256 text NOT NULL CHECK (configuration_sha256 ~ '^[0-9a-f]{64}$'),
  normalization_sha256 text NOT NULL CHECK (normalization_sha256 ~ '^[0-9a-f]{64}$'),
  assumptions_sha256 text NOT NULL CHECK (assumptions_sha256 ~ '^[0-9a-f]{64}$'),
  approval_sha256 text NOT NULL CHECK (approval_sha256 ~ '^[0-9a-f]{64}$'),
  artifact_manifest jsonb NOT NULL CHECK (jsonb_typeof(artifact_manifest) = 'object'),
  artifact_sha256 text NOT NULL CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(created_at)),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, artifact_key, artifact_version),
  UNIQUE (organization_id, workspace_id, id),
  UNIQUE (organization_id, workspace_id, id, artifact_sha256)
);

ALTER TABLE evidence.economic_state_models
  ADD COLUMN governance_schema_version smallint NOT NULL DEFAULT 1
    CHECK (governance_schema_version IN (1, 2)),
  ADD COLUMN model_artifact_id uuid,
  ADD COLUMN model_artifact_sha256 text
    CHECK (model_artifact_sha256 IS NULL OR model_artifact_sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE evidence.economic_state_models
  ALTER COLUMN governance_schema_version SET DEFAULT 2;
ALTER TABLE evidence.economic_state_models
  ADD CONSTRAINT economic_state_models_artifact_fkey FOREIGN KEY (
    organization_id, workspace_id, model_artifact_id, model_artifact_sha256
  ) REFERENCES evidence.economic_state_model_artifacts(
    organization_id, workspace_id, id, artifact_sha256
  ) ON DELETE RESTRICT;

ALTER TABLE evidence.economic_state_model_components
  ADD COLUMN series_id uuid REFERENCES evidence.series(id) ON DELETE RESTRICT,
  ADD COLUMN unit_code text,
  ADD COLUMN frequency text CHECK (
    frequency IS NULL OR frequency IN (
      'event', 'daily', 'weekly', 'monthly', 'quarterly', 'annual', 'irregular'
    )
  ),
  ADD COLUMN seasonal_adjustment text CHECK (
    seasonal_adjustment IS NULL OR seasonal_adjustment IN (
      'adjusted', 'unadjusted', 'not_applicable', 'unknown'
    )
  ),
  ADD COLUMN parser_name text,
  ADD COLUMN parser_version text,
  ADD COLUMN parser_code_sha256 text
    CHECK (parser_code_sha256 IS NULL OR parser_code_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN parser_configuration_sha256 text
    CHECK (parser_configuration_sha256 IS NULL OR parser_configuration_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN feature_contract_sha256 text
    CHECK (feature_contract_sha256 IS NULL OR feature_contract_sha256 ~ '^[0-9a-f]{64}$');
CREATE UNIQUE INDEX economic_state_model_components_series_unique
  ON evidence.economic_state_model_components(
    organization_id, workspace_id, model_id, series_id
  ) WHERE series_id IS NOT NULL;

ALTER TABLE evidence.economic_state_runs
  ADD COLUMN model_artifact_id uuid,
  ADD COLUMN model_artifact_sha256 text
    CHECK (model_artifact_sha256 IS NULL OR model_artifact_sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE evidence.economic_state_runs
  ADD CONSTRAINT economic_state_runs_artifact_fkey FOREIGN KEY (
    organization_id, workspace_id, model_artifact_id, model_artifact_sha256
  ) REFERENCES evidence.economic_state_model_artifacts(
    organization_id, workspace_id, id, artifact_sha256
  ) ON DELETE RESTRICT;

ALTER TABLE evidence.economic_state_component_results
  ADD COLUMN quality_evidence_sha256 text CHECK (
    quality_evidence_sha256 IS NULL OR quality_evidence_sha256 ~ '^[0-9a-f]{64}$'
  );

CREATE OR REPLACE FUNCTION evidence.verify_economic_state_artifact()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  expected_manifest jsonb;
  calculated_sha256 text;
BEGIN
  expected_manifest := jsonb_build_object(
    'schemaVersion', 1,
    'id', NEW.id::text,
    'key', NEW.artifact_key,
    'version', NEW.artifact_version,
    'lifecycleStatus', NEW.lifecycle_status,
    'algorithm', jsonb_build_object(
      'key', NEW.algorithm_key,
      'version', NEW.algorithm_version
    ),
    'codeCommitSha256', NEW.code_commit_sha256,
    'packageLockSha256', NEW.package_lock_sha256,
    'sbomSha256', NEW.sbom_sha256,
    'environmentSha256', NEW.environment_sha256,
    'configurationSha256', NEW.configuration_sha256,
    'normalizationSha256', NEW.normalization_sha256,
    'assumptionsSha256', NEW.assumptions_sha256,
    'approvalSha256', NEW.approval_sha256
  );
  IF NEW.artifact_manifest <> expected_manifest THEN
    RAISE EXCEPTION 'economic-state artifact manifest differs from normalized identity'
      USING ERRCODE = '23514';
  END IF;
  calculated_sha256 := encode(digest(
    convert_to(evidence.canonical_json(NEW.artifact_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  IF NEW.artifact_sha256 <> calculated_sha256 THEN
    RAISE EXCEPTION 'economic-state artifact digest is invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER economic_state_model_artifacts_verify
BEFORE INSERT ON evidence.economic_state_model_artifacts
FOR EACH ROW EXECUTE FUNCTION evidence.verify_economic_state_artifact();
CREATE TRIGGER economic_state_model_artifacts_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.economic_state_model_artifacts
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE OR REPLACE FUNCTION evidence.require_current_economic_state_model()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, evidence
AS $$
BEGIN
  IF NEW.governance_schema_version <> 2
    OR NEW.model_artifact_id IS NULL OR NEW.model_artifact_sha256 IS NULL
  THEN
    RAISE EXCEPTION 'new economic-state models require governance schema 2 and an artifact'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER economic_state_models_require_current_contract
BEFORE INSERT ON evidence.economic_state_models
FOR EACH ROW EXECUTE FUNCTION evidence.require_current_economic_state_model();

CREATE OR REPLACE FUNCTION evidence.economic_state_feature_contract(
  requested_series_id uuid,
  requested_parser_name text,
  requested_parser_version text,
  requested_parser_code_sha256 text,
  requested_parser_configuration_sha256 text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'seriesId', series.id::text,
    'conceptId', series.concept_id::text,
    'unitCode', series.unit_code,
    'frequency', series.frequency,
    'seasonalAdjustment', series.seasonal_adjustment,
    'parser', jsonb_build_object(
      'name', requested_parser_name,
      'version', requested_parser_version,
      'codeSha256', requested_parser_code_sha256,
      'configurationSha256', requested_parser_configuration_sha256
    )
  )
  FROM evidence.series series
  WHERE series.id = requested_series_id
$$;

CREATE OR REPLACE FUNCTION evidence.validate_economic_state_model(requested_model_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  model evidence.economic_state_models%ROWTYPE;
  artifact evidence.economic_state_model_artifacts%ROWTYPE;
  component_count integer;
  invalid_component_count integer;
  component_manifest jsonb;
  expected_manifest jsonb;
BEGIN
  SELECT * INTO STRICT model
  FROM evidence.economic_state_models
  WHERE id = requested_model_id;

  IF model.governance_schema_version = 1 THEN
    SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
      'key', component.component_key,
      'conceptId', component.concept_id::text,
      'weight', component.weight,
      'polarity', component.polarity,
      'lowerBound', component.lower_bound,
      'upperBound', component.upper_bound
    ) ORDER BY component.component_key COLLATE "C"), '[]'::jsonb)
    INTO component_count, component_manifest
    FROM evidence.economic_state_model_components component
    WHERE component.organization_id = model.organization_id
      AND component.workspace_id = model.workspace_id
      AND component.model_id = model.id;
    expected_manifest := jsonb_build_object(
      'schemaVersion', 1,
      'id', model.id::text,
      'key', model.model_key,
      'version', model.model_version,
      'dimension', model.dimension,
      'minimumCoverage', model.minimum_coverage,
      'components', component_manifest
    );
  ELSE
    SELECT * INTO artifact
    FROM evidence.economic_state_model_artifacts candidate
    WHERE candidate.organization_id = model.organization_id
      AND candidate.workspace_id = model.workspace_id
      AND candidate.id = model.model_artifact_id
      AND candidate.artifact_sha256 = model.model_artifact_sha256;
    IF artifact.id IS NULL THEN
      RAISE EXCEPTION 'economic-state model artifact identity is invalid'
        USING ERRCODE = '23514';
    END IF;

    SELECT
      count(*),
      count(*) FILTER (WHERE
        component.series_id IS NULL
        OR component.unit_code IS NULL
        OR component.frequency IS NULL
        OR component.seasonal_adjustment IS NULL
        OR component.parser_name IS NULL
        OR component.parser_version IS NULL
        OR component.parser_code_sha256 IS NULL
        OR component.parser_configuration_sha256 IS NULL
        OR component.feature_contract_sha256 IS NULL
        OR component.feature_contract_sha256 <> encode(digest(convert_to(
          evidence.canonical_json(evidence.economic_state_feature_contract(
            component.series_id, component.parser_name, component.parser_version,
            component.parser_code_sha256, component.parser_configuration_sha256
          )), 'UTF8'
        ), 'sha256'), 'hex')
        OR NOT EXISTS (
          SELECT 1 FROM evidence.series series
          WHERE series.id = component.series_id
            AND series.concept_id = component.concept_id
            AND series.unit_code = component.unit_code
            AND series.frequency = component.frequency
            AND series.seasonal_adjustment = component.seasonal_adjustment
            AND series.status = 'active'
        )
      ),
      coalesce(jsonb_agg(jsonb_build_object(
        'key', component.component_key,
        'conceptId', component.concept_id::text,
        'seriesId', component.series_id::text,
        'unitCode', component.unit_code,
        'frequency', component.frequency,
        'seasonalAdjustment', component.seasonal_adjustment,
        'parser', jsonb_build_object(
          'name', component.parser_name,
          'version', component.parser_version,
          'codeSha256', component.parser_code_sha256,
          'configurationSha256', component.parser_configuration_sha256
        ),
        'featureContractSha256', component.feature_contract_sha256,
        'weight', component.weight,
        'polarity', component.polarity,
        'lowerBound', component.lower_bound,
        'upperBound', component.upper_bound
      ) ORDER BY component.component_key COLLATE "C"), '[]'::jsonb)
    INTO component_count, invalid_component_count, component_manifest
    FROM evidence.economic_state_model_components component
    WHERE component.organization_id = model.organization_id
      AND component.workspace_id = model.workspace_id
      AND component.model_id = model.id;
    IF invalid_component_count <> 0 THEN
      RAISE EXCEPTION 'economic-state model feature contract is incomplete or inconsistent'
        USING ERRCODE = '23514';
    END IF;
    expected_manifest := jsonb_build_object(
      'schemaVersion', 2,
      'id', model.id::text,
      'key', model.model_key,
      'version', model.model_version,
      'dimension', model.dimension,
      'minimumCoverage', model.minimum_coverage,
      'artifact', jsonb_build_object(
        'id', artifact.id::text,
        'sha256', artifact.artifact_sha256,
        'algorithmKey', artifact.algorithm_key,
        'algorithmVersion', artifact.algorithm_version,
        'configurationSha256', artifact.configuration_sha256,
        'normalizationSha256', artifact.normalization_sha256,
        'assumptionsSha256', artifact.assumptions_sha256,
        'approvalSha256', artifact.approval_sha256,
        'lifecycleStatus', artifact.lifecycle_status
      ),
      'components', component_manifest
    );
  END IF;

  IF component_count NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'economic-state models require between 1 and 100 components'
      USING ERRCODE = '23514';
  END IF;
  IF model.definition_manifest <> expected_manifest THEN
    RAISE EXCEPTION 'economic-state definition manifest differs from normalized components'
      USING ERRCODE = '23514';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION evidence.verify_economic_state_artifact() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.require_current_economic_state_model() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.economic_state_feature_contract(uuid, text, text, text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evidence.economic_state_feature_contract(uuid, text, text, text, text)
  TO economyos_ingest;

COMMENT ON TABLE evidence.economic_state_model_artifacts IS
  'Immutable code/lock/SBOM/environment/configuration/normalization/assumption/approval identity for reproducible state models.';

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
  admission_score numeric;
  calculated_score numeric;
  total_weight numeric;
  invalid_weight_count integer;
  check_count integer;
  checks jsonb;
  canonical_score text;
BEGIN
  SELECT * INTO observation
  FROM evidence.observations candidate
  WHERE candidate.id = requested_observation_id;
  SELECT * INTO transformation
  FROM evidence.transformation_runs candidate
  WHERE candidate.id = observation.transformation_run_id
    AND candidate.tenant_scope = observation.tenant_scope;
  IF observation.id IS NULL OR transformation.id IS NULL OR transformation.status <> 'succeeded' THEN
    RETURN;
  END IF;

  BEGIN
    SELECT (quality.details->>'score')::numeric INTO STRICT admission_score
    FROM evidence.quality_results quality
    WHERE quality.tenant_scope = observation.tenant_scope
      AND quality.transformation_run_id = transformation.id
      AND quality.check_code = 'admission'
      AND quality.status = 'pass'
      AND jsonb_typeof(quality.details->'score') = 'number';
  EXCEPTION
    WHEN no_data_found OR too_many_rows OR invalid_text_representation THEN RETURN;
  END;

  SELECT
    count(*),
    count(*) FILTER (WHERE
      jsonb_typeof(quality.details->'weight') <> 'number'
      OR (quality.details->>'weight') !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
      OR (quality.details->>'weight')::numeric NOT BETWEEN 0 AND 1
    ),
    coalesce(sum((quality.details->>'weight')::numeric) FILTER (WHERE
      jsonb_typeof(quality.details->'weight') = 'number'
      AND (quality.details->>'weight') ~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
    ), 0),
    coalesce(sum(CASE quality.status
      WHEN 'pass' THEN (quality.details->>'weight')::numeric
      WHEN 'warn' THEN (quality.details->>'weight')::numeric / 2
      ELSE 0
    END) FILTER (WHERE
      jsonb_typeof(quality.details->'weight') = 'number'
      AND (quality.details->>'weight') ~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
    ), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'checkCode', quality.check_code,
      'status', quality.status,
      'details', quality.details,
      'checkedAt', to_char(
        quality.checked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    ) ORDER BY quality.check_code COLLATE "C"), '[]'::jsonb)
  INTO check_count, invalid_weight_count, total_weight, calculated_score, checks
  FROM evidence.quality_results quality
  WHERE quality.tenant_scope = observation.tenant_scope
    AND quality.transformation_run_id = transformation.id
    AND quality.check_code <> 'admission';

  IF check_count < 1 OR invalid_weight_count <> 0 OR total_weight <> 1
    OR admission_score NOT BETWEEN 0 AND 1
    OR round(calculated_score, 6) <> round(admission_score, 6)
    OR EXISTS (
      SELECT 1 FROM evidence.quality_results quality
      WHERE quality.tenant_scope = observation.tenant_scope
        AND quality.transformation_run_id = transformation.id
        AND quality.status = 'fail'
    )
  THEN
    RETURN;
  END IF;

  canonical_score := regexp_replace(
    regexp_replace(round(admission_score, 6)::text, '0+$', ''), '\.$', ''
  );
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

CREATE OR REPLACE FUNCTION evidence.validate_economic_state_run_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  snapshot evidence.dataset_snapshots%ROWTYPE;
  model evidence.economic_state_models%ROWTYPE;
  known_at_text text;
  system_at_text text;
BEGIN
  SELECT * INTO snapshot
  FROM evidence.dataset_snapshots
  WHERE id = NEW.snapshot_id
    AND organization_id = NEW.organization_id
    AND workspace_id = NEW.workspace_id;
  SELECT * INTO model
  FROM evidence.economic_state_models
  WHERE id = NEW.model_id
    AND organization_id = NEW.organization_id
    AND workspace_id = NEW.workspace_id;
  IF snapshot.id IS NULL THEN
    RAISE EXCEPTION 'economic-state snapshot is outside the requested tenant workspace'
      USING ERRCODE = '23514';
  END IF;
  IF model.id IS NULL OR model.governance_schema_version <> 2
    OR NEW.model_artifact_id <> model.model_artifact_id
    OR NEW.model_artifact_sha256 <> model.model_artifact_sha256
  THEN
    RAISE EXCEPTION 'new economic-state runs require the exact current model artifact'
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
    IF NEW.system_at IS NULL OR system_at_text IS NULL
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
  selected_observation_id uuid;
  actual_value numeric;
  actual_source_id uuid;
  actual_scope uuid;
  actual_transformation_id uuid;
  quality_record record;
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
  IF run.id IS NULL OR component.model_id IS NULL OR component.series_id IS NULL THEN
    RAISE EXCEPTION 'economic-state component identity is invalid' USING ERRCODE = '23503';
  END IF;

  SELECT manifest INTO snapshot_manifest
  FROM evidence.dataset_snapshots
  WHERE id = run.snapshot_id
    AND organization_id = run.organization_id
    AND workspace_id = run.workspace_id;
  SELECT observation.id
  INTO selected_observation_id
  FROM evidence.observations observation
  WHERE observation.series_id = component.series_id
    AND (snapshot_manifest->'observationIds') ? observation.id::text
    AND observation.value_numeric IS NOT NULL
    AND evidence.governed_observation_is_visible_as_known(
      observation.id, run.known_at, run.policy, run.system_at, 'derive'
    )
  ORDER BY
    observation.period_end DESC,
    observation.period_start DESC,
    observation.recorded_at DESC,
    observation.id DESC
  LIMIT 1;

  IF NEW.raw_value IS NULL THEN
    IF selected_observation_id IS NOT NULL THEN
      RAISE EXCEPTION 'economic-state missingness cannot hide eligible governed evidence'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.quality_evidence_sha256 IS NOT NULL THEN
      RAISE EXCEPTION 'missing economic-state component cannot claim quality evidence'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.observation_id <> selected_observation_id THEN
    RAISE EXCEPTION 'economic-state component must use the latest eligible snapshot observation'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.raw_value !~ '^-?(0|[1-9][0-9]*)(\.[0-9]{1,18})?$'
    OR NEW.normalized_value IS NULL
    OR NEW.normalized_value !~ '^(0|[1-9][0-9]*)(\.[0-9]{0,5}[1-9])?$'
    OR NEW.contribution IS NULL
    OR NEW.contribution !~ '^(0|[1-9][0-9]*)(\.[0-9]{0,5}[1-9])?$'
    OR NEW.quality_evidence_sha256 IS NULL
  THEN
    RAISE EXCEPTION 'observed economic-state component evidence is incomplete or invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    observation.value_numeric,
    dataset.source_id,
    observation.tenant_scope,
    observation.transformation_run_id
  INTO actual_value, actual_source_id, actual_scope, actual_transformation_id
  FROM evidence.observations observation
  JOIN evidence.series series
    ON series.id = observation.series_id AND series.tenant_scope = observation.tenant_scope
  JOIN evidence.source_datasets dataset
    ON dataset.id = series.dataset_id AND dataset.tenant_scope = series.tenant_scope
  JOIN evidence.transformation_runs transformation
    ON transformation.id = observation.transformation_run_id
      AND transformation.tenant_scope = observation.tenant_scope
  WHERE observation.id = NEW.observation_id
    AND observation.series_id = component.series_id
    AND series.concept_id = component.concept_id
    AND series.geography_id = run.geography_id
    AND series.unit_code = component.unit_code
    AND series.frequency = component.frequency
    AND series.seasonal_adjustment = component.seasonal_adjustment
    AND transformation.parser_name = component.parser_name
    AND transformation.parser_version = component.parser_version
    AND transformation.code_sha256 = component.parser_code_sha256
    AND transformation.configuration_sha256 = component.parser_configuration_sha256;
  IF NOT FOUND
    OR actual_scope NOT IN (
      '00000000-0000-0000-0000-000000000000'::uuid, NEW.organization_id
    )
    OR actual_source_id <> NEW.source_id
    OR actual_value IS NULL
    OR actual_value <> NEW.raw_value::numeric
  THEN
    RAISE EXCEPTION 'economic-state value/provenance differs from its exact feature observation'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO quality_record
  FROM evidence.economic_state_observation_quality(NEW.observation_id);
  IF quality_record.quality_score IS NULL
    OR NEW.quality::numeric <> quality_record.quality_score::numeric
    OR NEW.quality_evidence_sha256 <> quality_record.quality_sha256
  THEN
    RAISE EXCEPTION 'economic-state quality is not bound to immutable admission evidence'
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
  IF component.polarity = 'negative' THEN normalized := 1 - normalized; END IF;
  IF NEW.normalized_value::numeric <> round(normalized, 6)
    OR NEW.contribution::numeric <> round(component.weight::numeric * normalized, 6)
  THEN
    RAISE EXCEPTION 'economic-state normalized value or contribution is not reproducible'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION evidence.economic_state_observation_quality(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_run_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_component_result() FROM PUBLIC;

COMMENT ON FUNCTION evidence.economic_state_observation_quality(uuid) IS
  'Recomputes admission_weighted_v1 from immutable parser-scoped quality rows and returns its canonical evidence digest.';

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
  IF model.governance_schema_version <> 2
    OR run.model_artifact_id <> model.model_artifact_id
    OR run.model_artifact_sha256 <> model.model_artifact_sha256
  THEN
    RAISE EXCEPTION 'economic-state run is not bound to the current governed model artifact'
      USING ERRCODE = '23514';
  END IF;

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
      'quality', result.quality,
      'qualityEvidenceSha256', result.quality_evidence_sha256
    ) ORDER BY result.component_key COLLATE "C")
      FILTER (WHERE result.component_key IS NOT NULL), '[]'::jsonb)
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
    'schemaVersion', 2,
    'modelId', model.id::text,
    'modelKey', model.model_key,
    'modelVersion', model.model_version,
    'modelArtifactId', model.model_artifact_id::text,
    'modelArtifactSha256', model.model_artifact_sha256,
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
    'distinctSourceCount', run.independent_source_count,
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

CREATE OR REPLACE FUNCTION evidence.economic_state_workspace_visible(
  requested_organization_id uuid,
  requested_workspace_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT
    requested_organization_id = app.current_organization_id()
    AND app.current_subject_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM app.workspace_memberships membership
      JOIN app.workspaces workspace
        ON workspace.organization_id = membership.organization_id
        AND workspace.id = membership.workspace_id
      JOIN app.organizations organization
        ON organization.id = membership.organization_id
      JOIN app.subjects subject
        ON subject.id = membership.subject_id
      JOIN app.organization_memberships organization_membership
        ON organization_membership.organization_id = membership.organization_id
        AND organization_membership.subject_id = membership.subject_id
      WHERE membership.organization_id = requested_organization_id
        AND membership.workspace_id = requested_workspace_id
        AND membership.subject_id = app.current_subject_id()
        AND workspace.status = 'active'
        AND organization.status = 'active'
        AND subject.status = 'active'
        AND membership.valid_from <= statement_timestamp()
        AND (membership.valid_until IS NULL OR membership.valid_until > statement_timestamp())
        AND organization_membership.valid_from <= statement_timestamp()
        AND (
          organization_membership.valid_until IS NULL
          OR organization_membership.valid_until > statement_timestamp()
        )
    )
$$;

DROP POLICY economic_state_models_tenant ON evidence.economic_state_models;
DROP POLICY economic_state_model_components_tenant
  ON evidence.economic_state_model_components;
DROP POLICY economic_state_runs_tenant ON evidence.economic_state_runs;
DROP POLICY economic_state_component_results_tenant
  ON evidence.economic_state_component_results;

CREATE POLICY economic_state_models_workspace ON evidence.economic_state_models
  USING (evidence.economic_state_workspace_visible(organization_id, workspace_id))
  WITH CHECK (evidence.economic_state_workspace_visible(organization_id, workspace_id));
CREATE POLICY economic_state_model_components_workspace
  ON evidence.economic_state_model_components
  USING (evidence.economic_state_workspace_visible(organization_id, workspace_id))
  WITH CHECK (evidence.economic_state_workspace_visible(organization_id, workspace_id));
CREATE POLICY economic_state_runs_workspace ON evidence.economic_state_runs
  USING (evidence.economic_state_workspace_visible(organization_id, workspace_id))
  WITH CHECK (evidence.economic_state_workspace_visible(organization_id, workspace_id));
CREATE POLICY economic_state_component_results_workspace
  ON evidence.economic_state_component_results
  USING (evidence.economic_state_workspace_visible(organization_id, workspace_id))
  WITH CHECK (evidence.economic_state_workspace_visible(organization_id, workspace_id));

ALTER TABLE evidence.economic_state_model_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.economic_state_model_artifacts FORCE ROW LEVEL SECURITY;
CREATE POLICY economic_state_model_artifacts_workspace
  ON evidence.economic_state_model_artifacts
  USING (evidence.economic_state_workspace_visible(organization_id, workspace_id))
  WITH CHECK (evidence.economic_state_workspace_visible(organization_id, workspace_id));

CREATE INDEX economic_state_model_artifacts_workspace_idx
  ON evidence.economic_state_model_artifacts(
    organization_id, workspace_id, artifact_key, artifact_version
  );

REVOKE ALL ON TABLE evidence.economic_state_model_artifacts FROM PUBLIC;
GRANT SELECT ON evidence.economic_state_model_artifacts TO economyos_app;
GRANT SELECT, INSERT ON evidence.economic_state_model_artifacts TO economyos_ingest;
REVOKE UPDATE, DELETE ON evidence.economic_state_model_artifacts
  FROM economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_run(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.economic_state_workspace_visible(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evidence.economic_state_workspace_visible(uuid, uuid)
  TO economyos_app, economyos_ingest;

COMMENT ON FUNCTION evidence.economic_state_workspace_visible(uuid, uuid) IS
  'Requires exact active organization, subject, organization membership, and workspace membership for state-table RLS.';
COMMENT ON COLUMN evidence.economic_state_component_results.quality_evidence_sha256 IS
  'Digest of admission_weighted_v1 quality evidence recomputed from immutable quality results.';
