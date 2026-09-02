-- Append-only corrections discovered by exercising migrations 0015-0016.
-- Generated columns are not populated in PostgreSQL BEFORE triggers, so the
-- canonical-admission validator must derive tenant scope from organization_id.

CREATE OR REPLACE FUNCTION evidence.verify_canonical_admission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  observation evidence.observations%ROWTYPE;
  transformation evidence.transformation_runs%ROWTYPE;
  effective_scope uuid := coalesce(
    NEW.organization_id, '00000000-0000-0000-0000-000000000000'::uuid
  );
  expected_manifest jsonb;
  calculated_sha256 text;
BEGIN
  SELECT * INTO observation
  FROM evidence.observations candidate
  WHERE candidate.id = NEW.observation_id
    AND candidate.tenant_scope = effective_scope;
  SELECT * INTO transformation
  FROM evidence.transformation_runs candidate
  WHERE candidate.id = NEW.transformation_run_id
    AND candidate.tenant_scope = effective_scope;

  IF observation.id IS NULL OR transformation.id IS NULL
    OR observation.transformation_run_id <> transformation.id
    OR observation.release_id <> NEW.release_id
    OR observation.organization_id IS DISTINCT FROM NEW.organization_id
    OR transformation.organization_id IS DISTINCT FROM NEW.organization_id
  THEN
    RAISE EXCEPTION 'canonical admission identity does not match its immutable observation'
      USING ERRCODE = '23514';
  END IF;
  IF transformation.status <> 'succeeded' THEN
    RAISE EXCEPTION 'canonical admission requires a successful transformation'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.basis = 'durable_ingestion_v1' THEN
    IF transformation.ingestion_run_id <> NEW.ingestion_run_id OR NOT EXISTS (
      SELECT 1
      FROM evidence.ingestion_runs run
      WHERE run.id = NEW.ingestion_run_id
        AND run.tenant_scope = effective_scope
        AND run.status = 'succeeded'
        AND run.output_sha256 = NEW.output_manifest_sha256
        AND run.output_manifest->>'transformationRunId' = NEW.transformation_run_id::text
        AND run.output_manifest->>'releaseId' = NEW.release_id::text
        AND (run.output_manifest->'observationIds') ? NEW.observation_id::text
    ) THEN
      RAISE EXCEPTION 'durable canonical admission is not backed by terminal workflow output'
        USING ERRCODE = '23514';
    END IF;
  ELSIF transformation.ingestion_run_id IS NOT NULL THEN
    RAISE EXCEPTION 'legacy admission cannot bypass a linked durable ingestion run'
      USING ERRCODE = '23514';
  END IF;

  expected_manifest := jsonb_build_object(
    'schemaVersion', 1,
    'basis', NEW.basis,
    'observationId', NEW.observation_id::text,
    'transformationRunId', NEW.transformation_run_id::text,
    'releaseId', NEW.release_id::text,
    'ingestionRunId', CASE WHEN NEW.ingestion_run_id IS NULL
      THEN NULL ELSE to_jsonb(NEW.ingestion_run_id::text) END,
    'outputManifestSha256', NEW.output_manifest_sha256,
    'parserCodeSha256', transformation.code_sha256,
    'configurationSha256', transformation.configuration_sha256
  );
  IF NEW.admission_manifest <> expected_manifest THEN
    RAISE EXCEPTION 'canonical admission manifest differs from immutable evidence'
      USING ERRCODE = '23514';
  END IF;
  calculated_sha256 := encode(digest(
    convert_to(evidence.canonical_json(NEW.admission_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  IF NEW.admission_sha256 <> calculated_sha256 THEN
    RAISE EXCEPTION 'canonical admission digest is invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
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
    OR NEW.model_artifact_id IS DISTINCT FROM model.model_artifact_id
    OR NEW.model_artifact_sha256 IS DISTINCT FROM model.model_artifact_sha256
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

  WITH parsed_checks AS (
    SELECT
      quality.check_code,
      quality.status,
      quality.details,
      quality.checked_at,
      CASE
        WHEN jsonb_typeof(quality.details->'weight') = 'number'
          AND (quality.details->>'weight') ~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
        THEN (quality.details->>'weight')::numeric
        ELSE NULL
      END AS weight
    FROM evidence.quality_results quality
    WHERE quality.tenant_scope = observation.tenant_scope
      AND quality.transformation_run_id = transformation.id
      AND quality.check_code <> 'admission'
  )
  SELECT
    count(*),
    count(*) FILTER (WHERE weight IS NULL OR weight NOT BETWEEN 0 AND 1),
    coalesce(sum(weight), 0),
    coalesce(sum(CASE status
      WHEN 'pass' THEN weight
      WHEN 'warn' THEN weight / 2
      ELSE 0
    END), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'checkCode', check_code,
      'status', status,
      'details', details,
      'checkedAt', to_char(
        checked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    ) ORDER BY check_code COLLATE "C"), '[]'::jsonb)
  INTO check_count, invalid_weight_count, total_weight, calculated_score, checks
  FROM parsed_checks;

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
    OR run.model_artifact_id IS DISTINCT FROM model.model_artifact_id
    OR run.model_artifact_sha256 IS DISTINCT FROM model.model_artifact_sha256
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

REVOKE ALL ON FUNCTION evidence.verify_canonical_admission() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.economic_state_observation_quality(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_run_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_run(uuid) FROM PUBLIC;
