-- Phase 3 legal/source reproducibility. Every observed state component binds
-- the exact immutable license review and approved source-admission decision
-- that authorized `derive` when the component was calculated. The normalized
-- evidence remains reproducible after mutable source catalog state changes.

ALTER TABLE evidence.economic_state_component_results
  ADD COLUMN source_dataset_id uuid REFERENCES evidence.source_datasets(id) ON DELETE RESTRICT,
  ADD COLUMN license_review_id uuid REFERENCES evidence.license_reviews(id) ON DELETE RESTRICT,
  ADD COLUMN source_admission_event_id uuid
    REFERENCES evidence.source_admission_events(id) ON DELETE RESTRICT,
  ADD COLUMN legal_evidence_manifest jsonb CHECK (
    legal_evidence_manifest IS NULL OR jsonb_typeof(legal_evidence_manifest) = 'object'
  ),
  ADD COLUMN legal_evidence_sha256 text CHECK (
    legal_evidence_sha256 IS NULL OR legal_evidence_sha256 ~ '^[0-9a-f]{64}$'
  );

ALTER TABLE evidence.economic_state_component_results
  ADD CONSTRAINT economic_state_component_results_legal_evidence_check CHECK (
    (
      raw_value IS NULL
      AND source_dataset_id IS NULL
      AND license_review_id IS NULL
      AND source_admission_event_id IS NULL
      AND legal_evidence_manifest IS NULL
      AND legal_evidence_sha256 IS NULL
    )
    OR (
      raw_value IS NOT NULL
      AND source_dataset_id IS NOT NULL
      AND license_review_id IS NOT NULL
      AND source_admission_event_id IS NOT NULL
      AND legal_evidence_manifest IS NOT NULL
      AND legal_evidence_sha256 IS NOT NULL
    )
  );

CREATE INDEX economic_state_component_results_legal_evidence_idx
  ON evidence.economic_state_component_results(
    license_review_id, source_admission_event_id
  ) WHERE raw_value IS NOT NULL;

CREATE OR REPLACE FUNCTION evidence.economic_state_legal_evidence(
  requested_organization_id uuid,
  requested_observation_id uuid,
  requested_source_id uuid,
  requested_source_dataset_id uuid,
  requested_license_review_id uuid,
  requested_source_admission_event_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'action', 'derive',
    'organizationId', requested_organization_id::text,
    'observationId', requested_observation_id::text,
    'sourceId', requested_source_id::text,
    'sourceDatasetId', requested_source_dataset_id::text,
    'licenseReview', jsonb_build_object(
      'id', review.id::text,
      'sourceSlug', review.source_slug,
      'datasetExternalKey', review.dataset_external_key,
      'evidenceUri', review.evidence_uri,
      'licenseExpression', review.license_expression,
      'intendedUses', (
        SELECT coalesce(
          jsonb_agg(intended_use ORDER BY intended_use COLLATE "C"), '[]'::jsonb
        )
        FROM unnest(review.intended_uses) intended_use
      ),
      'evidence', review.evidence,
      'evidenceSha256', review.evidence_sha256,
      'reviewedBy', review.reviewed_by,
      'reviewedAt', to_char(
        review.reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
      'expiresAt', to_char(
        review.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
      'createdAt', to_char(
        review.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    ),
    'sourceAdmissionDecision', jsonb_build_object(
      'id', decision.id::text,
      'organizationId', decision.organization_id::text,
      'sourceId', decision.source_id::text,
      'sourceDatasetId', decision.dataset_id::text,
      'decision', decision.decision,
      'permittedActions', (
        SELECT coalesce(
          jsonb_agg(permitted_action ORDER BY permitted_action COLLATE "C"), '[]'::jsonb
        )
        FROM unnest(decision.permitted_actions) permitted_action
      ),
      'licenseReviewId', decision.license_review_id::text,
      'reason', decision.reason,
      'decidedBy', decision.decided_by,
      'decidedAt', to_char(
        decision.decided_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
      'recordedAt', to_char(
        decision.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    )
  )
  FROM evidence.license_reviews review
  JOIN evidence.source_admission_events decision
    ON decision.id = requested_source_admission_event_id
    AND decision.license_review_id = review.id
  WHERE review.id = requested_license_review_id
    AND requested_organization_id = app.current_organization_id()
    AND decision.source_id = requested_source_id
    AND (decision.dataset_id IS NULL OR decision.dataset_id = requested_source_dataset_id)
    AND (
      decision.organization_id IS NULL
      OR decision.organization_id = requested_organization_id
    )
    AND decision.decision = 'approved'
    AND 'derive' = ANY(decision.permitted_actions)
    AND 'derive' = ANY(review.intended_uses)
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
  review evidence.license_reviews%ROWTYPE;
  decision evidence.source_admission_events%ROWTYPE;
  snapshot_manifest jsonb;
  selected_observation_id uuid;
  actual_value numeric;
  actual_source_id uuid;
  actual_source_organization_id uuid;
  actual_source_dataset_id uuid;
  actual_dataset_external_key text;
  actual_license_review_id uuid;
  actual_scope uuid;
  quality_record record;
  expected_legal_manifest jsonb;
  expected_legal_sha256 text;
  normalized numeric;
BEGIN
  IF app.current_organization_id() IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'economic-state component writes require the exact tenant context'
      USING ERRCODE = '42501';
  END IF;
  -- Component calculation time is database-authored; callers cannot backdate
  -- a row to select a stale admission decision.
  NEW.created_at := clock_timestamp();
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
    IF NEW.quality_evidence_sha256 IS NOT NULL
      OR NEW.source_dataset_id IS NOT NULL
      OR NEW.license_review_id IS NOT NULL
      OR NEW.source_admission_event_id IS NOT NULL
      OR NEW.legal_evidence_manifest IS NOT NULL
      OR NEW.legal_evidence_sha256 IS NOT NULL
    THEN
      RAISE EXCEPTION 'missing economic-state component cannot claim evidence bindings'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.observation_id IS DISTINCT FROM selected_observation_id THEN
    RAISE EXCEPTION 'economic-state component must use the latest eligible snapshot observation'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.raw_value !~ '^-?(0|[1-9][0-9]*)(\.[0-9]{1,18})?$'
    OR NEW.normalized_value IS NULL
    OR NEW.normalized_value !~ '^(0|[1-9][0-9]*)(\.[0-9]{0,5}[1-9])?$'
    OR NEW.contribution IS NULL
    OR NEW.contribution !~ '^(0|[1-9][0-9]*)(\.[0-9]{0,5}[1-9])?$'
    OR NEW.quality_evidence_sha256 IS NULL
    OR NEW.source_dataset_id IS NULL
    OR NEW.license_review_id IS NULL
    OR NEW.source_admission_event_id IS NULL
    OR NEW.legal_evidence_manifest IS NULL
    OR NEW.legal_evidence_sha256 IS NULL
  THEN
    RAISE EXCEPTION 'observed economic-state component evidence is incomplete or invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    observation.value_numeric,
    dataset.source_id,
    source.organization_id,
    dataset.id,
    dataset.external_key,
    source.license_review_id,
    observation.tenant_scope
  INTO
    actual_value,
    actual_source_id,
    actual_source_organization_id,
    actual_source_dataset_id,
    actual_dataset_external_key,
    actual_license_review_id,
    actual_scope
  FROM evidence.observations observation
  JOIN evidence.series series
    ON series.id = observation.series_id AND series.tenant_scope = observation.tenant_scope
  JOIN evidence.source_datasets dataset
    ON dataset.id = series.dataset_id AND dataset.tenant_scope = series.tenant_scope
  JOIN evidence.sources source
    ON source.id = dataset.source_id AND source.tenant_scope = dataset.tenant_scope
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
    AND transformation.configuration_sha256 = component.parser_configuration_sha256
    AND source.license_status = 'approved'
    AND source.license_review_id IS NOT NULL
    AND 'derive' = ANY(source.permitted_actions)
    AND (
      source.license_review_expires_at IS NULL
      OR source.license_review_expires_at > NEW.created_at
    );
  IF NOT FOUND
    OR actual_scope NOT IN (
      '00000000-0000-0000-0000-000000000000'::uuid, NEW.organization_id
    )
    OR actual_source_id IS DISTINCT FROM NEW.source_id
    OR actual_source_dataset_id IS DISTINCT FROM NEW.source_dataset_id
    OR actual_license_review_id IS DISTINCT FROM NEW.license_review_id
    OR actual_value IS NULL
    OR actual_value <> NEW.raw_value::numeric
  THEN
    RAISE EXCEPTION 'economic-state value/provenance differs from its exact feature observation'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO review
  FROM evidence.license_reviews candidate
  WHERE candidate.id = NEW.license_review_id;
  IF review.id IS NULL
    OR review.source_slug IS DISTINCT FROM (
      SELECT source.slug FROM evidence.sources source WHERE source.id = actual_source_id
    )
    OR (
      review.dataset_external_key IS NOT NULL
      AND review.dataset_external_key IS DISTINCT FROM actual_dataset_external_key
    )
    OR NOT ('derive' = ANY(review.intended_uses))
    OR review.reviewed_at > NEW.created_at
    OR (review.expires_at IS NOT NULL AND review.expires_at <= NEW.created_at)
  THEN
    RAISE EXCEPTION 'economic-state license review did not authorize derive at calculation time'
      USING ERRCODE = '23514';
  END IF;

  SELECT candidate.* INTO decision
  FROM evidence.source_admission_events candidate
  WHERE candidate.source_id = actual_source_id
    AND candidate.organization_id IS NOT DISTINCT FROM actual_source_organization_id
    AND (candidate.dataset_id IS NULL OR candidate.dataset_id = actual_source_dataset_id)
    AND candidate.license_review_id = actual_license_review_id
    AND candidate.decided_at <= NEW.created_at
    AND candidate.recorded_at <= NEW.created_at
  ORDER BY
    candidate.decided_at DESC,
    candidate.recorded_at DESC,
    (candidate.dataset_id IS NOT NULL) DESC,
    candidate.id DESC
  LIMIT 1;
  IF decision.id IS NULL
    OR decision.id IS DISTINCT FROM NEW.source_admission_event_id
    OR decision.decision <> 'approved'
    OR NOT ('derive' = ANY(decision.permitted_actions))
  THEN
    RAISE EXCEPTION 'economic-state component is not bound to the effective derive admission decision'
      USING ERRCODE = '23514';
  END IF;

  expected_legal_manifest := evidence.economic_state_legal_evidence(
    NEW.organization_id,
    NEW.observation_id,
    NEW.source_id,
    NEW.source_dataset_id,
    NEW.license_review_id,
    NEW.source_admission_event_id
  );
  expected_legal_sha256 := encode(digest(
    convert_to(evidence.canonical_json(expected_legal_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  IF expected_legal_manifest IS NULL
    OR NEW.legal_evidence_manifest IS DISTINCT FROM expected_legal_manifest
    OR NEW.legal_evidence_sha256 IS DISTINCT FROM expected_legal_sha256
  THEN
    RAISE EXCEPTION 'economic-state legal evidence manifest or digest is forged'
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
      'sourceDatasetId', result.source_dataset_id::text,
      'licenseReviewId', result.license_review_id::text,
      'sourceAdmissionDecisionId', result.source_admission_event_id::text,
      'rawValue', result.raw_value,
      'normalizedValue', result.normalized_value,
      'contribution', result.contribution,
      'missingReason', result.missing_reason,
      'quality', result.quality,
      'qualityEvidenceSha256', result.quality_evidence_sha256,
      'legalEvidenceSha256', result.legal_evidence_sha256
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

REVOKE ALL ON FUNCTION evidence.economic_state_legal_evidence(
  uuid, uuid, uuid, uuid, uuid, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evidence.economic_state_legal_evidence(
  uuid, uuid, uuid, uuid, uuid, uuid
) TO economyos_ingest;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_component_result() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.validate_economic_state_run(uuid) FROM PUBLIC;

COMMENT ON FUNCTION evidence.economic_state_legal_evidence(
  uuid, uuid, uuid, uuid, uuid, uuid
) IS
  'Reconstructs canonical derive authorization solely from immutable license-review and source-admission records plus bound component identifiers.';
COMMENT ON COLUMN evidence.economic_state_component_results.source_dataset_id IS
  'Exact source dataset from which the observed component was derived.';
COMMENT ON COLUMN evidence.economic_state_component_results.license_review_id IS
  'Immutable license review authorizing derive when the component was calculated.';
COMMENT ON COLUMN evidence.economic_state_component_results.source_admission_event_id IS
  'Effective immutable approved source-admission decision authorizing derive at calculation time.';
COMMENT ON COLUMN evidence.economic_state_component_results.legal_evidence_manifest IS
  'Canonical schema-v1 legal/source evidence that remains reproducible after live source-state changes.';
COMMENT ON COLUMN evidence.economic_state_component_results.legal_evidence_sha256 IS
  'SHA-256 of canonical legal_evidence_manifest, recomputable from immutable governance records.';
