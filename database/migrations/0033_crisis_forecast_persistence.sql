-- Phase 4 PostgreSQL system of record for hazard-specific crisis forecasts.
-- Every scientific record is append-only. A run becomes visible only through
-- an immutable completion record that commits to the exact 8 x 4 hazard/
-- horizon cross-product. PostgreSQL remains the identity and evidence authority.

CREATE OR REPLACE FUNCTION evidence.crisis_valid_assumptions(requested_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
  element jsonb;
  assumption text;
BEGIN
  IF jsonb_typeof(requested_value) <> 'array'
    OR jsonb_array_length(requested_value) NOT BETWEEN 1 AND 100
    OR octet_length(requested_value::text) > 131072
  THEN
    RETURN false;
  END IF;
  FOR element IN SELECT value FROM jsonb_array_elements(requested_value) LOOP
    IF jsonb_typeof(element) <> 'string' THEN RETURN false; END IF;
    assumption := element#>>'{}';
    IF assumption <> btrim(assumption)
      OR length(assumption) NOT BETWEEN 1 AND 2000
    THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION evidence.crisis_valid_invalidation_criteria(
  requested_value jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
  element jsonb;
  criterion_id text;
  description text;
  indicator_key text;
  operator_name text;
  threshold_value text;
BEGIN
  IF jsonb_typeof(requested_value) <> 'array'
    OR jsonb_array_length(requested_value) NOT BETWEEN 1 AND 100
    OR octet_length(requested_value::text) > 262144
  THEN
    RETURN false;
  END IF;
  FOR element IN SELECT value FROM jsonb_array_elements(requested_value) LOOP
    IF jsonb_typeof(element) <> 'object'
      OR NOT element ?& ARRAY[
        'criterionId', 'description', 'indicatorKey', 'operator',
        'threshold', 'requiredObservations'
      ]
      OR (SELECT count(*) FROM jsonb_object_keys(element)) <> 6
      OR jsonb_typeof(element->'criterionId') <> 'string'
      OR jsonb_typeof(element->'description') <> 'string'
      OR jsonb_typeof(element->'indicatorKey') <> 'string'
      OR jsonb_typeof(element->'operator') <> 'string'
      OR jsonb_typeof(element->'threshold') <> 'string'
      OR jsonb_typeof(element->'requiredObservations') <> 'number'
    THEN
      RETURN false;
    END IF;
    criterion_id := element->>'criterionId';
    description := element->>'description';
    indicator_key := element->>'indicatorKey';
    operator_name := element->>'operator';
    threshold_value := element->>'threshold';
    IF criterion_id !~ '^[a-z][a-z0-9_.-]{0,127}$'
      OR indicator_key !~ '^[a-z][a-z0-9_.-]{0,127}$'
      OR description <> btrim(description)
      OR length(description) NOT BETWEEN 1 AND 2000
      OR threshold_value <> btrim(threshold_value)
      OR length(threshold_value) NOT BETWEEN 1 AND 500
      OR operator_name NOT IN (
        'less_than', 'less_than_or_equal', 'greater_than',
        'greater_than_or_equal', 'equals'
      )
      OR (element->>'requiredObservations') !~ '^[1-9][0-9]{0,5}$'
    THEN
      RETURN false;
    END IF;
  END LOOP;
  IF (
    SELECT count(DISTINCT value->>'criterionId')
    FROM jsonb_array_elements(requested_value)
  ) <> jsonb_array_length(requested_value) THEN
    RETURN false;
  END IF;
  RETURN true;
END
$$;

CREATE TABLE evidence.crisis_episode_definitions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  definition_key text NOT NULL CHECK (
    definition_key ~ '^[a-z][a-z0-9_.-]{2,127}$'
  ),
  hazard text NOT NULL CHECK (
    hazard IN ('FX', 'BANK', 'SOV', 'MON', 'POL', 'COUP', 'CIV', 'WAR')
  ),
  created_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL CHECK (isfinite(created_at)),
  definition_manifest jsonb NOT NULL CHECK (jsonb_typeof(definition_manifest) = 'object'),
  definition_sha256 text NOT NULL CHECK (definition_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, definition_key),
  UNIQUE (organization_id, workspace_id, id)
);

CREATE TABLE evidence.crisis_episode_definition_versions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  definition_id uuid NOT NULL,
  version text NOT NULL CHECK (
    version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
  ),
  criteria jsonb NOT NULL CHECK (jsonb_typeof(criteria) = 'object'),
  assumptions jsonb NOT NULL CHECK (
    jsonb_typeof(assumptions) = 'array' AND jsonb_array_length(assumptions) > 0
  ),
  code_sha256 text NOT NULL CHECK (code_sha256 ~ '^[0-9a-f]{64}$'),
  configuration_sha256 text NOT NULL CHECK (configuration_sha256 ~ '^[0-9a-f]{64}$'),
  valid_from timestamptz NOT NULL CHECK (isfinite(valid_from)),
  valid_until timestamptz CHECK (valid_until IS NULL OR isfinite(valid_until)),
  created_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL CHECK (isfinite(created_at)),
  version_manifest jsonb NOT NULL CHECK (jsonb_typeof(version_manifest) = 'object'),
  version_sha256 text NOT NULL CHECK (version_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id, definition_id)
    REFERENCES evidence.crisis_episode_definitions(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, definition_id, version),
  UNIQUE (organization_id, workspace_id, id),
  UNIQUE (organization_id, workspace_id, id, version_sha256),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE TABLE evidence.crisis_episode_declarations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  episode_definition_version_id uuid NOT NULL,
  episode_definition_version_sha256 text NOT NULL CHECK (
    episode_definition_version_sha256 ~ '^[0-9a-f]{64}$'
  ),
  geography_id uuid NOT NULL REFERENCES evidence.geographies(id) ON DELETE RESTRICT,
  hazard text NOT NULL CHECK (
    hazard IN ('FX', 'BANK', 'SOV', 'MON', 'POL', 'COUP', 'CIV', 'WAR')
  ),
  event_cluster_id uuid NOT NULL,
  onset_at timestamptz NOT NULL CHECK (isfinite(onset_at)),
  ended_at timestamptz CHECK (ended_at IS NULL OR isfinite(ended_at)),
  declared_at timestamptz NOT NULL CHECK (isfinite(declared_at)),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  assumptions jsonb NOT NULL CHECK (
    jsonb_typeof(assumptions) = 'array' AND jsonb_array_length(assumptions) > 0
  ),
  declared_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL CHECK (isfinite(recorded_at)),
  declaration_manifest jsonb NOT NULL CHECK (jsonb_typeof(declaration_manifest) = 'object'),
  declaration_sha256 text NOT NULL CHECK (declaration_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (
    organization_id, workspace_id, episode_definition_version_id,
    episode_definition_version_sha256
  ) REFERENCES evidence.crisis_episode_definition_versions(
    organization_id, workspace_id, id, version_sha256
  ) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, event_cluster_id),
  UNIQUE (organization_id, workspace_id, id),
  CHECK (declared_at >= onset_at),
  CHECK (ended_at IS NULL OR ended_at >= onset_at)
);

CREATE TABLE evidence.crisis_forecast_runs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  geography_id uuid NOT NULL REFERENCES evidence.geographies(id) ON DELETE RESTRICT,
  dataset_snapshot_id uuid NOT NULL REFERENCES evidence.dataset_snapshots(id) ON DELETE RESTRICT,
  dataset_snapshot_sha256 text NOT NULL CHECK (
    dataset_snapshot_sha256 ~ '^[0-9a-f]{64}$'
  ),
  as_of timestamptz NOT NULL CHECK (isfinite(as_of)),
  generated_at timestamptz NOT NULL CHECK (isfinite(generated_at)),
  run_configuration_sha256 text NOT NULL CHECK (
    run_configuration_sha256 ~ '^[0-9a-f]{64}$'
  ),
  run_code_sha256 text NOT NULL CHECK (run_code_sha256 ~ '^[0-9a-f]{64}$'),
  requested_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL CHECK (isfinite(recorded_at)),
  run_manifest jsonb NOT NULL CHECK (jsonb_typeof(run_manifest) = 'object'),
  run_sha256 text NOT NULL CHECK (run_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, id),
  UNIQUE (organization_id, workspace_id, geography_id, generated_at, id),
  CHECK (generated_at >= as_of)
);

CREATE TABLE evidence.crisis_forecast_slots (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  hazard text NOT NULL CHECK (
    hazard IN ('FX', 'BANK', 'SOV', 'MON', 'POL', 'COUP', 'CIV', 'WAR')
  ),
  horizon_days integer NOT NULL CHECK (horizon_days IN (30, 90, 180, 365)),
  raw_probability numeric(20,18) NOT NULL CHECK (raw_probability BETWEEN 0 AND 1),
  calibrated_probability numeric(20,18) NOT NULL CHECK (
    calibrated_probability BETWEEN 0 AND 1
  ),
  uncertainty_lower numeric(20,18) NOT NULL CHECK (uncertainty_lower BETWEEN 0 AND 1),
  uncertainty_upper numeric(20,18) NOT NULL CHECK (uncertainty_upper BETWEEN 0 AND 1),
  uncertainty_confidence numeric(20,18) NOT NULL CHECK (
    uncertainty_confidence > 0 AND uncertainty_confidence <= 1
  ),
  uncertainty_method text NOT NULL CHECK (
    length(btrim(uncertainty_method)) BETWEEN 3 AND 128
    AND uncertainty_method = btrim(uncertainty_method)
  ),
  calibration_status text NOT NULL CHECK (
    calibration_status IN ('calibrated', 'uncalibrated')
  ),
  out_of_domain boolean NOT NULL,
  model_artifact_id uuid NOT NULL,
  model_artifact_sha256 text NOT NULL CHECK (
    model_artifact_sha256 ~ '^[0-9a-f]{64}$'
  ),
  model_version text NOT NULL CHECK (
    length(model_version) <= 128
    AND model_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
  ),
  training_data_cutoff timestamptz NOT NULL CHECK (isfinite(training_data_cutoff)),
  calibrated_through timestamptz NOT NULL CHECK (isfinite(calibrated_through)),
  model_configuration_sha256 text NOT NULL CHECK (
    model_configuration_sha256 ~ '^[0-9a-f]{64}$'
  ),
  model_code_sha256 text NOT NULL CHECK (model_code_sha256 ~ '^[0-9a-f]{64}$'),
  assumptions jsonb NOT NULL CHECK (evidence.crisis_valid_assumptions(assumptions)),
  invalidation_criteria jsonb NOT NULL CHECK (
    evidence.crisis_valid_invalidation_criteria(invalidation_criteria)
  ),
  evidence_absence_reason text CHECK (
    evidence_absence_reason IS NULL
    OR length(btrim(evidence_absence_reason)) BETWEEN 10 AND 500
  ),
  counter_evidence_absence_reason text CHECK (
    counter_evidence_absence_reason IS NULL
    OR length(btrim(counter_evidence_absence_reason)) BETWEEN 10 AND 500
  ),
  created_at timestamptz NOT NULL CHECK (isfinite(created_at)),
  slot_manifest jsonb NOT NULL CHECK (jsonb_typeof(slot_manifest) = 'object'),
  slot_sha256 text NOT NULL CHECK (slot_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id, run_id)
    REFERENCES evidence.crisis_forecast_runs(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (
    organization_id, workspace_id, model_artifact_id, model_artifact_sha256
  ) REFERENCES evidence.economic_state_model_artifacts(
    organization_id, workspace_id, id, artifact_sha256
  ) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, run_id, hazard, horizon_days),
  UNIQUE (organization_id, workspace_id, id),
  UNIQUE (organization_id, workspace_id, id, slot_sha256),
  CHECK (uncertainty_lower <= calibrated_probability),
  CHECK (calibrated_probability <= uncertainty_upper),
  CHECK (training_data_cutoff <= calibrated_through)
);

CREATE TABLE evidence.crisis_forecast_evidence_bindings (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  forecast_slot_id uuid NOT NULL,
  evidence_role text NOT NULL CHECK (evidence_role IN ('supports', 'contradicts')),
  indicator_key text NOT NULL CHECK (
    indicator_key ~ '^[a-z][a-z0-9_.-]{2,127}$'
  ),
  direction text NOT NULL CHECK (
    direction IN ('increases_risk', 'decreases_risk')
  ),
  value_as_known text NOT NULL CHECK (
    length(btrim(value_as_known)) BETWEEN 1 AND 500
    AND value_as_known = btrim(value_as_known)
  ),
  source_kind text NOT NULL CHECK (
    source_kind IN ('canonical_admission', 'relationship_evidence', 'economic_state_run')
  ),
  canonical_admission_id uuid REFERENCES evidence.canonical_admissions(id) ON DELETE RESTRICT,
  relationship_evidence_id uuid REFERENCES evidence.relationship_evidence(id) ON DELETE RESTRICT,
  economic_state_run_id uuid REFERENCES evidence.economic_state_runs(id) ON DELETE RESTRICT,
  observed_at timestamptz NOT NULL CHECK (isfinite(observed_at)),
  available_at timestamptz NOT NULL CHECK (isfinite(available_at)),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  data_vintage_id uuid NOT NULL REFERENCES evidence.dataset_snapshots(id) ON DELETE RESTRICT,
  data_vintage_sha256 text NOT NULL CHECK (data_vintage_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL CHECK (isfinite(created_at)),
  binding_manifest jsonb NOT NULL CHECK (jsonb_typeof(binding_manifest) = 'object'),
  binding_sha256 text NOT NULL CHECK (binding_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id, run_id)
    REFERENCES evidence.crisis_forecast_runs(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, forecast_slot_id)
    REFERENCES evidence.crisis_forecast_slots(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, id),
  UNIQUE NULLS NOT DISTINCT (
    organization_id, workspace_id, forecast_slot_id,
    source_kind, canonical_admission_id, relationship_evidence_id,
    economic_state_run_id
  ),
  CHECK (available_at >= observed_at),
  CHECK (
    (source_kind = 'canonical_admission' AND canonical_admission_id IS NOT NULL
      AND relationship_evidence_id IS NULL AND economic_state_run_id IS NULL)
    OR (source_kind = 'relationship_evidence' AND relationship_evidence_id IS NOT NULL
      AND canonical_admission_id IS NULL AND economic_state_run_id IS NULL)
    OR (source_kind = 'economic_state_run' AND economic_state_run_id IS NOT NULL
      AND canonical_admission_id IS NULL AND relationship_evidence_id IS NULL)
  )
);

CREATE TABLE evidence.crisis_forecast_run_completions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  slot_count integer NOT NULL CHECK (slot_count = 32),
  slot_manifest_set jsonb NOT NULL CHECK (
    jsonb_typeof(slot_manifest_set) = 'array'
    AND jsonb_array_length(slot_manifest_set) = 32
  ),
  evidence_manifest_set jsonb NOT NULL CHECK (
    jsonb_typeof(evidence_manifest_set) = 'array'
  ),
  completed_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  completed_at timestamptz NOT NULL CHECK (isfinite(completed_at)),
  completion_manifest jsonb NOT NULL CHECK (jsonb_typeof(completion_manifest) = 'object'),
  completion_sha256 text NOT NULL CHECK (completion_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id, run_id)
    REFERENCES evidence.crisis_forecast_runs(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, run_id),
  UNIQUE (organization_id, workspace_id, id)
);

CREATE TABLE evidence.crisis_backtests (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  hazard text NOT NULL CHECK (
    hazard IN ('FX', 'BANK', 'SOV', 'MON', 'POL', 'COUP', 'CIV', 'WAR')
  ),
  mode text NOT NULL CHECK (mode IN ('expanding_window', 'rolling_window')),
  model_artifact_id uuid NOT NULL,
  model_artifact_sha256 text NOT NULL CHECK (model_artifact_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL CHECK (isfinite(created_at)),
  backtest_manifest jsonb NOT NULL CHECK (jsonb_typeof(backtest_manifest) = 'object'),
  backtest_sha256 text NOT NULL CHECK (backtest_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (
    organization_id, workspace_id, model_artifact_id, model_artifact_sha256
  ) REFERENCES evidence.economic_state_model_artifacts(
    organization_id, workspace_id, id, artifact_sha256
  ) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, id)
);

CREATE TABLE evidence.crisis_backtest_folds (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  backtest_id uuid NOT NULL,
  fold_ordinal integer NOT NULL CHECK (fold_ordinal BETWEEN 1 AND 10000),
  fold_key text NOT NULL CHECK (length(btrim(fold_key)) BETWEEN 1 AND 128),
  training_start timestamptz NOT NULL CHECK (isfinite(training_start)),
  training_end timestamptz NOT NULL CHECK (isfinite(training_end)),
  calibration_start timestamptz NOT NULL CHECK (isfinite(calibration_start)),
  calibration_end timestamptz NOT NULL CHECK (isfinite(calibration_end)),
  test_start timestamptz NOT NULL CHECK (isfinite(test_start)),
  test_end timestamptz NOT NULL CHECK (isfinite(test_end)),
  feature_engineering_fit_through timestamptz NOT NULL CHECK (isfinite(feature_engineering_fit_through)),
  normalization_fit_through timestamptz NOT NULL CHECK (isfinite(normalization_fit_through)),
  threshold_selection_fit_through timestamptz NOT NULL CHECK (isfinite(threshold_selection_fit_through)),
  hyperparameter_selection_fit_through timestamptz NOT NULL CHECK (isfinite(hyperparameter_selection_fit_through)),
  calibration_fit_through timestamptz NOT NULL CHECK (isfinite(calibration_fit_through)),
  created_at timestamptz NOT NULL CHECK (isfinite(created_at)),
  fold_manifest jsonb NOT NULL CHECK (jsonb_typeof(fold_manifest) = 'object'),
  fold_sha256 text NOT NULL CHECK (fold_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id, backtest_id)
    REFERENCES evidence.crisis_backtests(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, backtest_id, fold_ordinal),
  UNIQUE (organization_id, workspace_id, backtest_id, fold_key),
  UNIQUE (organization_id, workspace_id, id),
  CHECK (training_start < training_end),
  CHECK (training_end < calibration_start),
  CHECK (calibration_start < calibration_end),
  CHECK (calibration_end < test_start),
  CHECK (test_start < test_end),
  CHECK (feature_engineering_fit_through <= training_end),
  CHECK (normalization_fit_through <= training_end),
  CHECK (hyperparameter_selection_fit_through <= training_end),
  CHECK (threshold_selection_fit_through <= calibration_end),
  CHECK (calibration_fit_through <= calibration_end),
  CHECK (feature_engineering_fit_through < test_start),
  CHECK (normalization_fit_through < test_start),
  CHECK (threshold_selection_fit_through < test_start),
  CHECK (hyperparameter_selection_fit_through < test_start),
  CHECK (calibration_fit_through < test_start)
);

CREATE TABLE evidence.crisis_forecast_outcomes (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  episode_definition_version_id uuid NOT NULL,
  episode_definition_version_sha256 text NOT NULL CHECK (
    episode_definition_version_sha256 ~ '^[0-9a-f]{64}$'
  ),
  episode_declaration_id uuid,
  geography_id uuid NOT NULL REFERENCES evidence.geographies(id) ON DELETE RESTRICT,
  hazard text NOT NULL CHECK (
    hazard IN ('FX', 'BANK', 'SOV', 'MON', 'POL', 'COUP', 'CIV', 'WAR')
  ),
  window_start timestamptz NOT NULL CHECK (isfinite(window_start)),
  window_end timestamptz NOT NULL CHECK (isfinite(window_end)),
  realized_outcome boolean NOT NULL,
  event_occurred_at timestamptz CHECK (
    event_occurred_at IS NULL OR isfinite(event_occurred_at)
  ),
  observed_at timestamptz NOT NULL CHECK (isfinite(observed_at)),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL CHECK (isfinite(recorded_at)),
  outcome_manifest jsonb NOT NULL CHECK (jsonb_typeof(outcome_manifest) = 'object'),
  outcome_sha256 text NOT NULL CHECK (outcome_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (
    organization_id, workspace_id, episode_definition_version_id,
    episode_definition_version_sha256
  ) REFERENCES evidence.crisis_episode_definition_versions(
    organization_id, workspace_id, id, version_sha256
  ) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, episode_declaration_id)
    REFERENCES evidence.crisis_episode_declarations(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, id),
  UNIQUE (
    organization_id, workspace_id, episode_definition_version_id,
    geography_id, hazard, window_start, window_end
  ),
  CHECK (window_end > window_start),
  CHECK (observed_at >= window_end),
  CHECK (realized_outcome = (event_occurred_at IS NOT NULL)),
  CHECK (
    event_occurred_at IS NULL
    OR (event_occurred_at > window_start AND event_occurred_at <= window_end)
  )
);

CREATE TABLE evidence.crisis_forecast_scores (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  forecast_slot_id uuid NOT NULL,
  outcome_id uuid NOT NULL,
  backtest_fold_id uuid NOT NULL,
  classification_threshold numeric(20,18) NOT NULL CHECK (
    classification_threshold BETWEEN 0 AND 1
  ),
  log_loss_epsilon numeric(20,18) NOT NULL CHECK (
    log_loss_epsilon > 0 AND log_loss_epsilon < 0.5
  ),
  probability_used numeric(20,18) NOT NULL CHECK (probability_used BETWEEN 0 AND 1),
  brier_score numeric(38,36) NOT NULL CHECK (brier_score BETWEEN 0 AND 1),
  log_loss numeric NOT NULL CHECK (log_loss >= 0),
  calibration_residual numeric(20,18) NOT NULL CHECK (
    calibration_residual BETWEEN -1 AND 1
  ),
  lead_time_seconds bigint,
  predicted_positive boolean NOT NULL,
  direction_accurate boolean NOT NULL,
  false_positive boolean NOT NULL,
  false_negative boolean NOT NULL,
  scored_at timestamptz NOT NULL CHECK (isfinite(scored_at)),
  score_manifest jsonb NOT NULL CHECK (jsonb_typeof(score_manifest) = 'object'),
  score_sha256 text NOT NULL CHECK (score_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id, forecast_slot_id)
    REFERENCES evidence.crisis_forecast_slots(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, outcome_id)
    REFERENCES evidence.crisis_forecast_outcomes(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, backtest_fold_id)
    REFERENCES evidence.crisis_backtest_folds(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, forecast_slot_id),
  UNIQUE (organization_id, workspace_id, id),
  CHECK (lead_time_seconds IS NULL OR lead_time_seconds >= 0),
  CHECK (NOT (false_positive AND false_negative))
);

CREATE TABLE evidence.crisis_alert_policies (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  policy_key text NOT NULL CHECK (policy_key ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  policy_version text NOT NULL CHECK (
    policy_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
  ),
  hazard text NOT NULL CHECK (
    hazard IN ('FX', 'BANK', 'SOV', 'MON', 'POL', 'COUP', 'CIV', 'WAR')
  ),
  horizon_days integer NOT NULL CHECK (horizon_days IN (30, 90, 180, 365)),
  methodology_scope text NOT NULL CHECK (methodology_scope = 'research_baseline'),
  entry_probability numeric(20,18) NOT NULL CHECK (entry_probability BETWEEN 0 AND 1),
  exit_probability numeric(20,18) NOT NULL CHECK (exit_probability BETWEEN 0 AND 1),
  warning_probability numeric(20,18) NOT NULL CHECK (warning_probability BETWEEN 0 AND 1),
  critical_probability numeric(20,18) NOT NULL CHECK (critical_probability BETWEEN 0 AND 1),
  entry_consecutive_observations integer NOT NULL CHECK (
    entry_consecutive_observations BETWEEN 1 AND 1000
  ),
  exit_consecutive_observations integer NOT NULL CHECK (
    exit_consecutive_observations BETWEEN 1 AND 1000
  ),
  minimum_evidence_items integer NOT NULL CHECK (
    minimum_evidence_items BETWEEN 1 AND 10000
  ),
  uncalibrated_severity_ceiling text NOT NULL CHECK (
    uncalibrated_severity_ceiling IN ('watch', 'warning')
  ),
  created_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL CHECK (isfinite(created_at)),
  policy_manifest jsonb NOT NULL CHECK (jsonb_typeof(policy_manifest) = 'object'),
  policy_sha256 text NOT NULL CHECK (policy_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, policy_key, policy_version),
  UNIQUE (organization_id, workspace_id, id),
  CHECK (exit_probability < entry_probability),
  CHECK (entry_probability <= warning_probability),
  CHECK (warning_probability <= critical_probability)
);

CREATE TABLE evidence.crisis_alert_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  policy_id uuid NOT NULL,
  forecast_slot_id uuid NOT NULL,
  prior_event_id uuid,
  observed_at timestamptz NOT NULL CHECK (isfinite(observed_at)),
  probability numeric(20,18) NOT NULL CHECK (probability BETWEEN 0 AND 1),
  calibrated boolean NOT NULL,
  evidence_item_count integer NOT NULL CHECK (evidence_item_count >= 0),
  out_of_domain boolean NOT NULL,
  state text NOT NULL CHECK (state IN ('inactive', 'active', 'suppressed')),
  severity text NOT NULL CHECK (severity IN ('none', 'watch', 'warning', 'critical')),
  gate_reason text CHECK (
    gate_reason IS NULL OR gate_reason IN (
      'out_of_domain', 'insufficient_evidence', 'uncalibrated_severity_ceiling'
    )
  ),
  transition text NOT NULL CHECK (
    transition IN ('none', 'entered', 'exited', 'suppressed')
  ),
  entry_streak integer NOT NULL CHECK (entry_streak >= 0),
  exit_streak integer NOT NULL CHECK (exit_streak >= 0),
  evaluated_at timestamptz NOT NULL CHECK (isfinite(evaluated_at)),
  event_manifest jsonb NOT NULL CHECK (jsonb_typeof(event_manifest) = 'object'),
  event_sha256 text NOT NULL CHECK (event_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id, policy_id)
    REFERENCES evidence.crisis_alert_policies(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, forecast_slot_id)
    REFERENCES evidence.crisis_forecast_slots(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, prior_event_id)
    REFERENCES evidence.crisis_alert_events(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, policy_id, forecast_slot_id),
  UNIQUE (organization_id, workspace_id, id),
  CHECK ((state = 'active') = (severity <> 'none')),
  CHECK ((state = 'suppressed') = (transition = 'suppressed'))
);

CREATE TABLE evidence.crisis_postmortems (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  forecast_slot_id uuid NOT NULL,
  outcome_id uuid NOT NULL,
  alert_event_id uuid,
  episode_declaration_id uuid,
  analysis jsonb NOT NULL CHECK (jsonb_typeof(analysis) = 'object'),
  lessons jsonb NOT NULL CHECK (
    jsonb_typeof(lessons) = 'array' AND jsonb_array_length(lessons) > 0
  ),
  follow_up_actions jsonb NOT NULL CHECK (jsonb_typeof(follow_up_actions) = 'array'),
  authored_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  authored_at timestamptz NOT NULL CHECK (isfinite(authored_at)),
  postmortem_manifest jsonb NOT NULL CHECK (jsonb_typeof(postmortem_manifest) = 'object'),
  postmortem_sha256 text NOT NULL CHECK (postmortem_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id, forecast_slot_id)
    REFERENCES evidence.crisis_forecast_slots(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, outcome_id)
    REFERENCES evidence.crisis_forecast_outcomes(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, alert_event_id)
    REFERENCES evidence.crisis_alert_events(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, episode_declaration_id)
    REFERENCES evidence.crisis_episode_declarations(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, forecast_slot_id),
  UNIQUE (organization_id, workspace_id, id)
);

CREATE OR REPLACE FUNCTION evidence.crisis_record_manifest(
  requested_entity text,
  requested_record jsonb,
  requested_manifest_field text,
  requested_digest_field text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'entity', requested_entity,
    'record', requested_record - requested_manifest_field - requested_digest_field
  )
$$;

CREATE OR REPLACE FUNCTION evidence.crisis_manifest_sha256(requested_manifest jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, evidence
AS $$
  SELECT encode(digest(
    convert_to(evidence.canonical_json(requested_manifest), 'UTF8'), 'sha256'
  ), 'hex')
$$;

CREATE OR REPLACE FUNCTION evidence.verify_crisis_canonical_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  incoming jsonb := to_jsonb(NEW);
  expected_manifest jsonb;
  expected_sha256 text;
BEGIN
  expected_manifest := evidence.crisis_record_manifest(
    TG_ARGV[0], incoming, TG_ARGV[1], TG_ARGV[2]
  );
  expected_sha256 := evidence.crisis_manifest_sha256(expected_manifest);
  IF incoming->TG_ARGV[1] IS DISTINCT FROM expected_manifest
    OR incoming->>TG_ARGV[2] IS DISTINCT FROM expected_sha256
  THEN
    RAISE EXCEPTION '% record is not canonical', TG_ARGV[0]
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER crisis_episode_definitions_verify
BEFORE INSERT ON evidence.crisis_episode_definitions
FOR EACH ROW EXECUTE FUNCTION evidence.verify_crisis_canonical_record(
  'crisis_episode_definition', 'definition_manifest', 'definition_sha256'
);
CREATE TRIGGER crisis_episode_definition_versions_verify
BEFORE INSERT ON evidence.crisis_episode_definition_versions
FOR EACH ROW EXECUTE FUNCTION evidence.verify_crisis_canonical_record(
  'crisis_episode_definition_version', 'version_manifest', 'version_sha256'
);
CREATE TRIGGER crisis_episode_declarations_verify
BEFORE INSERT ON evidence.crisis_episode_declarations
FOR EACH ROW EXECUTE FUNCTION evidence.verify_crisis_canonical_record(
  'crisis_episode_declaration', 'declaration_manifest', 'declaration_sha256'
);
CREATE TRIGGER crisis_forecast_runs_verify
BEFORE INSERT ON evidence.crisis_forecast_runs
FOR EACH ROW EXECUTE FUNCTION evidence.verify_crisis_canonical_record(
  'crisis_forecast_run', 'run_manifest', 'run_sha256'
);
CREATE TRIGGER crisis_forecast_slots_verify
BEFORE INSERT ON evidence.crisis_forecast_slots
FOR EACH ROW EXECUTE FUNCTION evidence.verify_crisis_canonical_record(
  'crisis_forecast_slot', 'slot_manifest', 'slot_sha256'
);
CREATE TRIGGER crisis_forecast_evidence_bindings_verify
BEFORE INSERT ON evidence.crisis_forecast_evidence_bindings
FOR EACH ROW EXECUTE FUNCTION evidence.verify_crisis_canonical_record(
  'crisis_forecast_evidence_binding', 'binding_manifest', 'binding_sha256'
);
CREATE TRIGGER crisis_forecast_run_completions_verify
BEFORE INSERT ON evidence.crisis_forecast_run_completions
FOR EACH ROW EXECUTE FUNCTION evidence.verify_crisis_canonical_record(
  'crisis_forecast_run_completion', 'completion_manifest', 'completion_sha256'
);
CREATE TRIGGER crisis_backtests_verify
BEFORE INSERT ON evidence.crisis_backtests
FOR EACH ROW EXECUTE FUNCTION evidence.verify_crisis_canonical_record(
  'crisis_backtest', 'backtest_manifest', 'backtest_sha256'
);
CREATE TRIGGER crisis_backtest_folds_verify
BEFORE INSERT ON evidence.crisis_backtest_folds
FOR EACH ROW EXECUTE FUNCTION evidence.verify_crisis_canonical_record(
  'crisis_backtest_fold', 'fold_manifest', 'fold_sha256'
);
CREATE TRIGGER crisis_forecast_outcomes_verify
BEFORE INSERT ON evidence.crisis_forecast_outcomes
FOR EACH ROW EXECUTE FUNCTION evidence.verify_crisis_canonical_record(
  'crisis_forecast_outcome', 'outcome_manifest', 'outcome_sha256'
);
CREATE TRIGGER crisis_forecast_scores_verify
BEFORE INSERT ON evidence.crisis_forecast_scores
FOR EACH ROW EXECUTE FUNCTION evidence.verify_crisis_canonical_record(
  'crisis_forecast_score', 'score_manifest', 'score_sha256'
);
CREATE TRIGGER crisis_alert_policies_verify
BEFORE INSERT ON evidence.crisis_alert_policies
FOR EACH ROW EXECUTE FUNCTION evidence.verify_crisis_canonical_record(
  'crisis_alert_policy', 'policy_manifest', 'policy_sha256'
);
CREATE TRIGGER crisis_alert_events_verify
BEFORE INSERT ON evidence.crisis_alert_events
FOR EACH ROW EXECUTE FUNCTION evidence.verify_crisis_canonical_record(
  'crisis_alert_event', 'event_manifest', 'event_sha256'
);
CREATE TRIGGER crisis_postmortems_verify
BEFORE INSERT ON evidence.crisis_postmortems
FOR EACH ROW EXECUTE FUNCTION evidence.verify_crisis_canonical_record(
  'crisis_postmortem', 'postmortem_manifest', 'postmortem_sha256'
);

CREATE TRIGGER crisis_episode_definitions_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.crisis_episode_definitions
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER crisis_episode_definition_versions_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.crisis_episode_definition_versions
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER crisis_episode_declarations_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.crisis_episode_declarations
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER crisis_forecast_runs_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.crisis_forecast_runs
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER crisis_forecast_slots_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.crisis_forecast_slots
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER crisis_forecast_evidence_bindings_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.crisis_forecast_evidence_bindings
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER crisis_forecast_run_completions_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.crisis_forecast_run_completions
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER crisis_backtests_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.crisis_backtests
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER crisis_backtest_folds_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.crisis_backtest_folds
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER crisis_forecast_outcomes_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.crisis_forecast_outcomes
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER crisis_forecast_scores_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.crisis_forecast_scores
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER crisis_alert_policies_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.crisis_alert_policies
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER crisis_alert_events_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.crisis_alert_events
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER crisis_postmortems_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.crisis_postmortems
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

DO $crisis_rls$
DECLARE
  relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'crisis_episode_definitions', 'crisis_episode_definition_versions',
    'crisis_episode_declarations', 'crisis_forecast_runs',
    'crisis_forecast_slots', 'crisis_forecast_evidence_bindings',
    'crisis_forecast_run_completions', 'crisis_backtests',
    'crisis_backtest_folds', 'crisis_forecast_outcomes',
    'crisis_forecast_scores', 'crisis_alert_policies',
    'crisis_alert_events', 'crisis_postmortems'
  ] LOOP
    EXECUTE format('ALTER TABLE evidence.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE evidence.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format(
      'CREATE POLICY %I ON evidence.%I USING '
      || '(evidence.economic_state_workspace_visible(organization_id, workspace_id)) '
      || 'WITH CHECK '
      || '(evidence.economic_state_workspace_visible(organization_id, workspace_id))',
      relation_name || '_workspace', relation_name
    );
    EXECUTE format('REVOKE ALL ON TABLE evidence.%I FROM PUBLIC', relation_name);
    EXECUTE format(
      'REVOKE ALL ON TABLE evidence.%I FROM economyos_app, economyos_ingest',
      relation_name
    );
  END LOOP;
END
$crisis_rls$;

CREATE INDEX crisis_episode_versions_definition_idx
  ON evidence.crisis_episode_definition_versions(
    organization_id, workspace_id, definition_id, valid_from DESC, created_at DESC
  );
CREATE INDEX crisis_episode_declarations_lookup_idx
  ON evidence.crisis_episode_declarations(
    organization_id, workspace_id, geography_id, hazard, onset_at DESC, id DESC
  );
CREATE INDEX crisis_forecast_runs_keyset_idx
  ON evidence.crisis_forecast_runs(
    organization_id, workspace_id, geography_id, generated_at DESC, id DESC
  );
CREATE INDEX crisis_forecast_slots_run_idx
  ON evidence.crisis_forecast_slots(
    organization_id, workspace_id, run_id, hazard, horizon_days
  );
CREATE INDEX crisis_forecast_bindings_slot_idx
  ON evidence.crisis_forecast_evidence_bindings(
    organization_id, workspace_id, forecast_slot_id, evidence_role, id
  );
CREATE INDEX crisis_alert_events_timeline_idx
  ON evidence.crisis_alert_events(
    organization_id, workspace_id, policy_id, observed_at DESC, id DESC
  );

CREATE OR REPLACE FUNCTION evidence.crisis_workspace_role_internal(
  requested_organization_id uuid,
  requested_workspace_id uuid,
  requested_subject_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT workspace_membership.role
  FROM app.workspace_memberships workspace_membership
  JOIN app.organization_memberships organization_membership
    ON organization_membership.organization_id = workspace_membership.organization_id
    AND organization_membership.subject_id = workspace_membership.subject_id
  JOIN app.subjects subject ON subject.id = workspace_membership.subject_id
  JOIN app.workspaces workspace
    ON workspace.organization_id = workspace_membership.organization_id
    AND workspace.id = workspace_membership.workspace_id
  JOIN app.organizations organization
    ON organization.id = workspace_membership.organization_id
  WHERE workspace_membership.organization_id = requested_organization_id
    AND workspace_membership.workspace_id = requested_workspace_id
    AND workspace_membership.subject_id = requested_subject_id
    AND workspace_membership.valid_from <= statement_timestamp()
    AND (workspace_membership.valid_until IS NULL
      OR workspace_membership.valid_until > statement_timestamp())
    AND organization_membership.valid_from <= statement_timestamp()
    AND (organization_membership.valid_until IS NULL
      OR organization_membership.valid_until > statement_timestamp())
    AND subject.status = 'active'
    AND workspace.status = 'active'
    AND organization.status = 'active'
$$;

CREATE OR REPLACE FUNCTION evidence.crisis_set_manifest(
  requested_entity text,
  requested_record jsonb,
  requested_manifest_field text,
  requested_digest_field text
)
RETURNS TABLE (manifest jsonb, sha256 text)
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, evidence
AS $$
  SELECT normalized.manifest, evidence.crisis_manifest_sha256(normalized.manifest)
  FROM (
    SELECT evidence.crisis_record_manifest(
      requested_entity, requested_record, requested_manifest_field, requested_digest_field
    ) AS manifest
  ) normalized
$$;

CREATE OR REPLACE FUNCTION evidence.create_crisis_episode_definition(
  requested_definition_id uuid,
  requested_workspace_id uuid,
  requested_definition_key text,
  requested_hazard text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  caller_role text;
  existing evidence.crisis_episode_definitions%ROWTYPE;
  item evidence.crisis_episode_definitions%ROWTYPE;
BEGIN
  IF requested_definition_id IS NULL OR requested_workspace_id IS NULL
    OR requested_definition_key IS NULL OR requested_hazard IS NULL
  THEN
    RAISE EXCEPTION 'invalid crisis episode definition input' USING ERRCODE = '22023';
  END IF;
  caller_role := evidence.crisis_workspace_role_internal(
    caller_organization_id, requested_workspace_id, caller_subject_id
  );
  IF caller_role NOT IN ('analyst', 'steward', 'validator', 'admin') THEN
    RAISE EXCEPTION 'active analyst workspace membership is required'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO existing FROM evidence.crisis_episode_definitions candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.id = requested_definition_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(existing.definition_key, existing.hazard, existing.created_by)
      IS DISTINCT FROM ROW(requested_definition_key, requested_hazard, caller_subject_id)
    THEN
      RAISE EXCEPTION 'crisis episode definition replay changed identity'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  item.id := requested_definition_id;
  item.organization_id := caller_organization_id;
  item.workspace_id := requested_workspace_id;
  item.definition_key := requested_definition_key;
  item.hazard := requested_hazard;
  item.created_by := caller_subject_id;
  item.created_at := clock_timestamp();
  SELECT manifest, sha256 INTO item.definition_manifest, item.definition_sha256
  FROM evidence.crisis_set_manifest(
    'crisis_episode_definition', to_jsonb(item),
    'definition_manifest', 'definition_sha256'
  );
  INSERT INTO evidence.crisis_episode_definitions SELECT item.*;
  RETURN item.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.create_crisis_episode_definition_version(
  requested_version_id uuid,
  requested_definition_id uuid,
  requested_version text,
  requested_criteria jsonb,
  requested_assumptions jsonb,
  requested_code_sha256 text,
  requested_configuration_sha256 text,
  requested_valid_from timestamptz,
  requested_valid_until timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  definition evidence.crisis_episode_definitions%ROWTYPE;
  existing evidence.crisis_episode_definition_versions%ROWTYPE;
  item evidence.crisis_episode_definition_versions%ROWTYPE;
BEGIN
  IF requested_version_id IS NULL OR requested_definition_id IS NULL
    OR requested_version IS NULL OR requested_criteria IS NULL
    OR requested_assumptions IS NULL OR requested_code_sha256 IS NULL
    OR requested_configuration_sha256 IS NULL OR requested_valid_from IS NULL
    OR NOT isfinite(requested_valid_from)
    OR (requested_valid_until IS NOT NULL AND NOT isfinite(requested_valid_until))
  THEN
    RAISE EXCEPTION 'invalid crisis episode definition version input'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO definition FROM evidence.crisis_episode_definitions candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.id = requested_definition_id
    AND evidence.economic_state_workspace_visible(
      candidate.organization_id, candidate.workspace_id
    );
  IF definition.id IS NULL OR evidence.crisis_workspace_role_internal(
    definition.organization_id, definition.workspace_id, caller_subject_id
  ) NOT IN ('analyst', 'steward', 'validator', 'admin') THEN
    RAISE EXCEPTION 'crisis episode definition is unavailable'
      USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(definition.id::text, 33000));
  SELECT * INTO existing FROM evidence.crisis_episode_definition_versions candidate
  WHERE candidate.organization_id = definition.organization_id
    AND candidate.workspace_id = definition.workspace_id
    AND candidate.id = requested_version_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(
      existing.definition_id, existing.version, existing.criteria,
      existing.assumptions, existing.code_sha256,
      existing.configuration_sha256, existing.valid_from, existing.valid_until,
      existing.created_by
    ) IS DISTINCT FROM ROW(
      requested_definition_id, requested_version, requested_criteria,
      requested_assumptions, requested_code_sha256,
      requested_configuration_sha256, requested_valid_from,
      requested_valid_until, caller_subject_id
    ) THEN
      RAISE EXCEPTION 'crisis episode version replay changed evidence'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM evidence.crisis_episode_definition_versions candidate
    WHERE candidate.organization_id = definition.organization_id
      AND candidate.workspace_id = definition.workspace_id
      AND candidate.definition_id = definition.id
      AND tstzrange(candidate.valid_from, candidate.valid_until, '[)')
        && tstzrange(requested_valid_from, requested_valid_until, '[)')
  ) THEN
    RAISE EXCEPTION 'crisis episode definition versions cannot overlap in valid time'
      USING ERRCODE = '23514';
  END IF;
  item.id := requested_version_id;
  item.organization_id := definition.organization_id;
  item.workspace_id := definition.workspace_id;
  item.definition_id := definition.id;
  item.version := requested_version;
  item.criteria := requested_criteria;
  item.assumptions := requested_assumptions;
  item.code_sha256 := requested_code_sha256;
  item.configuration_sha256 := requested_configuration_sha256;
  item.valid_from := requested_valid_from;
  item.valid_until := requested_valid_until;
  item.created_by := caller_subject_id;
  item.created_at := clock_timestamp();
  SELECT manifest, sha256 INTO item.version_manifest, item.version_sha256
  FROM evidence.crisis_set_manifest(
    'crisis_episode_definition_version', to_jsonb(item),
    'version_manifest', 'version_sha256'
  );
  INSERT INTO evidence.crisis_episode_definition_versions SELECT item.*;
  RETURN item.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.declare_crisis_episode(
  requested_episode_id uuid,
  requested_definition_version_id uuid,
  requested_geography_id uuid,
  requested_event_cluster_id uuid,
  requested_onset_at timestamptz,
  requested_ended_at timestamptz,
  requested_declared_at timestamptz,
  requested_evidence_sha256 text,
  requested_assumptions jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  version_record record;
  expected_cluster_id uuid;
  existing evidence.crisis_episode_declarations%ROWTYPE;
  item evidence.crisis_episode_declarations%ROWTYPE;
BEGIN
  IF requested_episode_id IS NULL OR requested_definition_version_id IS NULL
    OR requested_geography_id IS NULL OR requested_event_cluster_id IS NULL
    OR requested_onset_at IS NULL OR requested_declared_at IS NULL
    OR requested_evidence_sha256 IS NULL OR requested_assumptions IS NULL
    OR NOT isfinite(requested_onset_at) OR NOT isfinite(requested_declared_at)
    OR (requested_ended_at IS NOT NULL AND NOT isfinite(requested_ended_at))
  THEN
    RAISE EXCEPTION 'invalid crisis episode declaration input'
      USING ERRCODE = '22023';
  END IF;
  SELECT version_item.*, definition.hazard
  INTO version_record
  FROM evidence.crisis_episode_definition_versions version_item
  JOIN evidence.crisis_episode_definitions definition
    ON definition.organization_id = version_item.organization_id
    AND definition.workspace_id = version_item.workspace_id
    AND definition.id = version_item.definition_id
  WHERE version_item.organization_id = caller_organization_id
    AND version_item.id = requested_definition_version_id
    AND evidence.economic_state_workspace_visible(
      version_item.organization_id, version_item.workspace_id
    );
  IF version_record.id IS NULL OR evidence.crisis_workspace_role_internal(
    version_record.organization_id, version_record.workspace_id, caller_subject_id
  ) NOT IN ('analyst', 'steward', 'validator', 'admin') THEN
    RAISE EXCEPTION 'crisis episode version is unavailable'
      USING ERRCODE = '42501';
  END IF;
  IF requested_onset_at < version_record.valid_from
    OR (version_record.valid_until IS NOT NULL
      AND requested_onset_at >= version_record.valid_until)
  THEN
    RAISE EXCEPTION 'episode onset is outside its definition version validity'
      USING ERRCODE = '23514';
  END IF;
  expected_cluster_id := evidence.deterministic_uuid_v8(
    'economyos:crisis-event-cluster:v1',
    requested_geography_id::text, version_record.hazard,
    to_char(requested_onset_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    version_record.version
  );
  IF expected_cluster_id <> requested_event_cluster_id THEN
    RAISE EXCEPTION 'event cluster does not bind geography, hazard, onset, and definition version'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO existing FROM evidence.crisis_episode_declarations candidate
  WHERE candidate.organization_id = version_record.organization_id
    AND candidate.workspace_id = version_record.workspace_id
    AND candidate.id = requested_episode_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(
      existing.episode_definition_version_id, existing.geography_id,
      existing.event_cluster_id, existing.onset_at, existing.ended_at,
      existing.declared_at, existing.evidence_sha256, existing.assumptions,
      existing.declared_by
    ) IS DISTINCT FROM ROW(
      requested_definition_version_id, requested_geography_id,
      requested_event_cluster_id, requested_onset_at, requested_ended_at,
      requested_declared_at, requested_evidence_sha256,
      requested_assumptions, caller_subject_id
    ) THEN
      RAISE EXCEPTION 'crisis episode declaration replay changed evidence'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  item.id := requested_episode_id;
  item.organization_id := version_record.organization_id;
  item.workspace_id := version_record.workspace_id;
  item.episode_definition_version_id := version_record.id;
  item.episode_definition_version_sha256 := version_record.version_sha256;
  item.geography_id := requested_geography_id;
  item.hazard := version_record.hazard;
  item.event_cluster_id := requested_event_cluster_id;
  item.onset_at := requested_onset_at;
  item.ended_at := requested_ended_at;
  item.declared_at := requested_declared_at;
  item.evidence_sha256 := requested_evidence_sha256;
  item.assumptions := requested_assumptions;
  item.declared_by := caller_subject_id;
  item.recorded_at := clock_timestamp();
  SELECT manifest, sha256 INTO item.declaration_manifest, item.declaration_sha256
  FROM evidence.crisis_set_manifest(
    'crisis_episode_declaration', to_jsonb(item),
    'declaration_manifest', 'declaration_sha256'
  );
  INSERT INTO evidence.crisis_episode_declarations SELECT item.*;
  RETURN item.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.crisis_forecast_inputs_currently_servable_internal(
  requested_organization_id uuid,
  requested_workspace_id uuid,
  requested_run_id uuid
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
        FROM evidence.crisis_forecast_slots slot
        WHERE slot.organization_id = forecast_run.organization_id
          AND slot.workspace_id = forecast_run.workspace_id
          AND slot.run_id = forecast_run.id
          AND NOT coalesce(
            evidence.economic_state_artifact_status_internal(
              slot.organization_id, slot.workspace_id, slot.model_artifact_id,
              statement_timestamp(), statement_timestamp()
            ) IN ('research', 'validated', 'approved', 'staged', 'production'),
            false
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM evidence.crisis_forecast_evidence_bindings binding
        JOIN evidence.canonical_admission_evidence_sets admission_evidence
          ON admission_evidence.admission_id = binding.canonical_admission_id
        WHERE binding.organization_id = forecast_run.organization_id
          AND binding.workspace_id = forecast_run.workspace_id
          AND binding.run_id = forecast_run.id
          AND binding.source_kind = 'canonical_admission'
          AND NOT evidence.source_action_is_currently_admitted(
            admission_evidence.source_id,
            admission_evidence.source_dataset_id,
            admission_evidence.license_review_id,
            'api'
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM evidence.crisis_forecast_evidence_bindings binding
        WHERE binding.organization_id = forecast_run.organization_id
          AND binding.workspace_id = forecast_run.workspace_id
          AND binding.run_id = forecast_run.id
          AND binding.source_kind = 'economic_state_run'
          AND NOT evidence.economic_state_run_is_currently_servable(
            binding.economic_state_run_id, 'api'
          )
      )
    FROM evidence.crisis_forecast_runs forecast_run
    WHERE forecast_run.organization_id = requested_organization_id
      AND forecast_run.workspace_id = requested_workspace_id
      AND forecast_run.id = requested_run_id
  ), false)
$$;

CREATE OR REPLACE FUNCTION evidence.crisis_forecast_run_is_currently_servable_internal(
  requested_organization_id uuid,
  requested_workspace_id uuid,
  requested_run_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
  SELECT
    evidence.crisis_forecast_inputs_currently_servable_internal(
      requested_organization_id, requested_workspace_id, requested_run_id
    )
    AND EXISTS (
      SELECT 1 FROM evidence.crisis_forecast_run_completions completion
      WHERE completion.organization_id = requested_organization_id
        AND completion.workspace_id = requested_workspace_id
        AND completion.run_id = requested_run_id
    )
$$;

CREATE OR REPLACE FUNCTION evidence.prepare_crisis_forecast_run(
  requested_run_id uuid,
  requested_workspace_id uuid,
  requested_geography_id uuid,
  requested_dataset_snapshot_id uuid,
  requested_as_of timestamptz,
  requested_generated_at timestamptz,
  requested_run_configuration_sha256 text,
  requested_run_code_sha256 text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  caller_role text;
  snapshot evidence.dataset_snapshots%ROWTYPE;
  existing evidence.crisis_forecast_runs%ROWTYPE;
  item evidence.crisis_forecast_runs%ROWTYPE;
BEGIN
  IF requested_run_id IS NULL OR requested_workspace_id IS NULL
    OR requested_geography_id IS NULL OR requested_dataset_snapshot_id IS NULL
    OR requested_as_of IS NULL OR requested_generated_at IS NULL
    OR requested_run_configuration_sha256 IS NULL
    OR requested_run_code_sha256 IS NULL
    OR NOT isfinite(requested_as_of) OR NOT isfinite(requested_generated_at)
    OR requested_generated_at > statement_timestamp() + interval '1 minute'
  THEN
    RAISE EXCEPTION 'invalid crisis forecast run input' USING ERRCODE = '22023';
  END IF;
  caller_role := evidence.crisis_workspace_role_internal(
    caller_organization_id, requested_workspace_id, caller_subject_id
  );
  IF caller_role NOT IN ('analyst', 'steward', 'validator', 'admin') THEN
    RAISE EXCEPTION 'active analyst workspace membership is required'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO snapshot FROM evidence.dataset_snapshots candidate
  WHERE candidate.id = requested_dataset_snapshot_id
    AND candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id;
  IF snapshot.id IS NULL OR snapshot.known_at > requested_as_of
    OR snapshot.created_at > requested_generated_at + interval '1 minute'
  THEN
    RAISE EXCEPTION 'dataset snapshot was not available for this forecast cutoff'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO existing FROM evidence.crisis_forecast_runs candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.id = requested_run_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(
      existing.geography_id, existing.dataset_snapshot_id, existing.as_of,
      existing.generated_at, existing.run_configuration_sha256,
      existing.run_code_sha256, existing.requested_by
    ) IS DISTINCT FROM ROW(
      requested_geography_id, requested_dataset_snapshot_id, requested_as_of,
      requested_generated_at, requested_run_configuration_sha256,
      requested_run_code_sha256, caller_subject_id
    ) THEN
      RAISE EXCEPTION 'crisis forecast run replay changed identity'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  item.id := requested_run_id;
  item.organization_id := caller_organization_id;
  item.workspace_id := requested_workspace_id;
  item.geography_id := requested_geography_id;
  item.dataset_snapshot_id := snapshot.id;
  item.dataset_snapshot_sha256 := snapshot.manifest_sha256;
  item.as_of := requested_as_of;
  item.generated_at := requested_generated_at;
  item.run_configuration_sha256 := requested_run_configuration_sha256;
  item.run_code_sha256 := requested_run_code_sha256;
  item.requested_by := caller_subject_id;
  item.recorded_at := clock_timestamp();
  SELECT manifest, sha256 INTO item.run_manifest, item.run_sha256
  FROM evidence.crisis_set_manifest(
    'crisis_forecast_run', to_jsonb(item), 'run_manifest', 'run_sha256'
  );
  INSERT INTO evidence.crisis_forecast_runs SELECT item.*;
  RETURN item.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.append_crisis_forecast_slot(
  requested_slot_id uuid,
  requested_run_id uuid,
  requested_hazard text,
  requested_horizon_days integer,
  requested_raw_probability numeric,
  requested_calibrated_probability numeric,
  requested_uncertainty_lower numeric,
  requested_uncertainty_upper numeric,
  requested_uncertainty_confidence numeric,
  requested_uncertainty_method text,
  requested_calibration_status text,
  requested_out_of_domain boolean,
  requested_model_artifact_id uuid,
  requested_training_data_cutoff timestamptz,
  requested_calibrated_through timestamptz,
  requested_model_configuration_sha256 text,
  requested_model_code_sha256 text,
  requested_assumptions jsonb,
  requested_invalidation_criteria jsonb,
  requested_evidence_absence_reason text DEFAULT NULL,
  requested_counter_evidence_absence_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  forecast_run evidence.crisis_forecast_runs%ROWTYPE;
  artifact evidence.economic_state_model_artifacts%ROWTYPE;
  existing evidence.crisis_forecast_slots%ROWTYPE;
  item evidence.crisis_forecast_slots%ROWTYPE;
  lifecycle_status text;
BEGIN
  IF requested_slot_id IS NULL OR requested_run_id IS NULL
    OR requested_hazard IS NULL OR requested_horizon_days IS NULL
    OR requested_raw_probability IS NULL
    OR requested_calibrated_probability IS NULL
    OR requested_uncertainty_lower IS NULL OR requested_uncertainty_upper IS NULL
    OR requested_uncertainty_confidence IS NULL
    OR requested_uncertainty_method IS NULL
    OR requested_calibration_status IS NULL OR requested_out_of_domain IS NULL
    OR requested_model_artifact_id IS NULL
    OR requested_training_data_cutoff IS NULL
    OR requested_calibrated_through IS NULL
    OR requested_model_configuration_sha256 IS NULL
    OR requested_model_code_sha256 IS NULL OR requested_assumptions IS NULL
    OR requested_invalidation_criteria IS NULL
  THEN
    RAISE EXCEPTION 'invalid crisis forecast slot input' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO forecast_run FROM evidence.crisis_forecast_runs candidate
  WHERE candidate.id = requested_run_id
    AND candidate.organization_id = caller_organization_id
    AND evidence.economic_state_workspace_visible(
      candidate.organization_id, candidate.workspace_id
    );
  IF forecast_run.id IS NULL OR evidence.crisis_workspace_role_internal(
    forecast_run.organization_id, forecast_run.workspace_id, caller_subject_id
  ) NOT IN ('analyst', 'steward', 'validator', 'admin') THEN
    RAISE EXCEPTION 'crisis forecast run is unavailable'
      USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(forecast_run.id::text, 33001));
  SELECT * INTO existing FROM evidence.crisis_forecast_slots candidate
  WHERE candidate.organization_id = forecast_run.organization_id
    AND candidate.workspace_id = forecast_run.workspace_id
    AND candidate.id = requested_slot_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(
      existing.run_id, existing.hazard, existing.horizon_days,
      existing.raw_probability, existing.calibrated_probability,
      existing.uncertainty_lower, existing.uncertainty_upper,
      existing.uncertainty_confidence, existing.uncertainty_method,
      existing.calibration_status, existing.out_of_domain,
      existing.model_artifact_id, existing.training_data_cutoff,
      existing.calibrated_through, existing.model_configuration_sha256,
      existing.model_code_sha256, existing.assumptions,
      existing.invalidation_criteria, existing.evidence_absence_reason,
      existing.counter_evidence_absence_reason
    ) IS DISTINCT FROM ROW(
      requested_run_id, requested_hazard, requested_horizon_days,
      requested_raw_probability, requested_calibrated_probability,
      requested_uncertainty_lower, requested_uncertainty_upper,
      requested_uncertainty_confidence, requested_uncertainty_method,
      requested_calibration_status, requested_out_of_domain,
      requested_model_artifact_id, requested_training_data_cutoff,
      requested_calibrated_through, requested_model_configuration_sha256,
      requested_model_code_sha256, requested_assumptions,
      requested_invalidation_criteria, requested_evidence_absence_reason,
      requested_counter_evidence_absence_reason
    ) THEN
      RAISE EXCEPTION 'crisis forecast slot replay changed evidence'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM evidence.crisis_forecast_run_completions completion
    WHERE completion.organization_id = forecast_run.organization_id
      AND completion.workspace_id = forecast_run.workspace_id
      AND completion.run_id = forecast_run.id
  ) THEN
    RAISE EXCEPTION 'completed crisis forecast run is immutable'
      USING ERRCODE = '55000';
  END IF;
  SELECT * INTO artifact FROM evidence.economic_state_model_artifacts candidate
  WHERE candidate.organization_id = forecast_run.organization_id
    AND candidate.workspace_id = forecast_run.workspace_id
    AND candidate.id = requested_model_artifact_id;
  lifecycle_status := evidence.economic_state_artifact_status_internal(
    forecast_run.organization_id, forecast_run.workspace_id,
    requested_model_artifact_id, forecast_run.generated_at,
    statement_timestamp()
  );
  IF artifact.id IS NULL
    OR artifact.configuration_sha256 <> requested_model_configuration_sha256
    OR artifact.code_commit_sha256 <> requested_model_code_sha256
    OR lifecycle_status NOT IN ('research', 'validated', 'approved', 'staged', 'production')
  THEN
    RAISE EXCEPTION 'forecast slot model artifact is ungoverned or unservable'
      USING ERRCODE = '23514';
  END IF;
  IF requested_training_data_cutoff > requested_calibrated_through
    OR requested_calibrated_through > forecast_run.as_of
  THEN
    RAISE EXCEPTION 'forecast slot provenance leaks beyond the run cutoff'
      USING ERRCODE = '23514';
  END IF;
  item.id := requested_slot_id;
  item.organization_id := forecast_run.organization_id;
  item.workspace_id := forecast_run.workspace_id;
  item.run_id := forecast_run.id;
  item.hazard := requested_hazard;
  item.horizon_days := requested_horizon_days;
  item.raw_probability := requested_raw_probability;
  item.calibrated_probability := requested_calibrated_probability;
  item.uncertainty_lower := requested_uncertainty_lower;
  item.uncertainty_upper := requested_uncertainty_upper;
  item.uncertainty_confidence := requested_uncertainty_confidence;
  item.uncertainty_method := requested_uncertainty_method;
  item.calibration_status := requested_calibration_status;
  item.out_of_domain := requested_out_of_domain;
  item.model_artifact_id := artifact.id;
  item.model_artifact_sha256 := artifact.artifact_sha256;
  item.model_version := artifact.artifact_version;
  item.training_data_cutoff := requested_training_data_cutoff;
  item.calibrated_through := requested_calibrated_through;
  item.model_configuration_sha256 := requested_model_configuration_sha256;
  item.model_code_sha256 := requested_model_code_sha256;
  item.assumptions := requested_assumptions;
  item.invalidation_criteria := requested_invalidation_criteria;
  item.evidence_absence_reason := requested_evidence_absence_reason;
  item.counter_evidence_absence_reason := requested_counter_evidence_absence_reason;
  item.created_at := clock_timestamp();
  SELECT manifest, sha256 INTO item.slot_manifest, item.slot_sha256
  FROM evidence.crisis_set_manifest(
    'crisis_forecast_slot', to_jsonb(item), 'slot_manifest', 'slot_sha256'
  );
  INSERT INTO evidence.crisis_forecast_slots SELECT item.*;
  RETURN item.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.bind_crisis_forecast_evidence(
  requested_binding_id uuid,
  requested_forecast_slot_id uuid,
  requested_evidence_role text,
  requested_indicator_key text,
  requested_direction text,
  requested_value_as_known text,
  requested_source_kind text,
  requested_source_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  forecast_slot evidence.crisis_forecast_slots%ROWTYPE;
  forecast_run evidence.crisis_forecast_runs%ROWTYPE;
  existing evidence.crisis_forecast_evidence_bindings%ROWTYPE;
  item evidence.crisis_forecast_evidence_bindings%ROWTYPE;
  canonical_source record;
  relationship_source evidence.relationship_evidence%ROWTYPE;
  state_source evidence.economic_state_runs%ROWTYPE;
BEGIN
  IF requested_binding_id IS NULL OR requested_forecast_slot_id IS NULL
    OR requested_evidence_role IS NULL OR requested_indicator_key IS NULL
    OR requested_direction IS NULL OR requested_value_as_known IS NULL
    OR requested_source_kind IS NULL OR requested_source_id IS NULL
  THEN
    RAISE EXCEPTION 'invalid crisis forecast evidence binding input'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO forecast_slot FROM evidence.crisis_forecast_slots candidate
  WHERE candidate.id = requested_forecast_slot_id
    AND candidate.organization_id = caller_organization_id
    AND evidence.economic_state_workspace_visible(
      candidate.organization_id, candidate.workspace_id
    );
  SELECT * INTO forecast_run FROM evidence.crisis_forecast_runs candidate
  WHERE candidate.organization_id = forecast_slot.organization_id
    AND candidate.workspace_id = forecast_slot.workspace_id
    AND candidate.id = forecast_slot.run_id;
  IF forecast_slot.id IS NULL OR evidence.crisis_workspace_role_internal(
    forecast_slot.organization_id, forecast_slot.workspace_id, caller_subject_id
  ) NOT IN ('analyst', 'steward', 'validator', 'admin') THEN
    RAISE EXCEPTION 'crisis forecast slot is unavailable'
      USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(forecast_run.id::text, 33001));
  SELECT * INTO existing FROM evidence.crisis_forecast_evidence_bindings candidate
  WHERE candidate.organization_id = forecast_run.organization_id
    AND candidate.workspace_id = forecast_run.workspace_id
    AND candidate.id = requested_binding_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(
      existing.forecast_slot_id, existing.evidence_role,
      existing.indicator_key, existing.direction, existing.value_as_known,
      existing.source_kind,
      coalesce(
        existing.canonical_admission_id,
        existing.relationship_evidence_id,
        existing.economic_state_run_id
      )
    ) IS DISTINCT FROM ROW(
      requested_forecast_slot_id, requested_evidence_role,
      requested_indicator_key, requested_direction, requested_value_as_known,
      requested_source_kind, requested_source_id
    ) THEN
      RAISE EXCEPTION 'crisis evidence binding replay changed evidence'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM evidence.crisis_forecast_run_completions completion
    WHERE completion.organization_id = forecast_run.organization_id
      AND completion.workspace_id = forecast_run.workspace_id
      AND completion.run_id = forecast_run.id
  ) THEN
    RAISE EXCEPTION 'completed crisis forecast run is immutable'
      USING ERRCODE = '55000';
  END IF;
  IF (
    SELECT count(*)
    FROM evidence.crisis_forecast_evidence_bindings candidate
    WHERE candidate.organization_id = forecast_run.organization_id
      AND candidate.workspace_id = forecast_run.workspace_id
      AND candidate.forecast_slot_id = forecast_slot.id
  ) >= 100 THEN
    RAISE EXCEPTION 'a crisis forecast slot accepts at most 100 evidence pointers'
      USING ERRCODE = '23514';
  END IF;

  item.id := requested_binding_id;
  item.organization_id := forecast_run.organization_id;
  item.workspace_id := forecast_run.workspace_id;
  item.run_id := forecast_run.id;
  item.forecast_slot_id := forecast_slot.id;
  item.evidence_role := requested_evidence_role;
  item.indicator_key := requested_indicator_key;
  item.direction := requested_direction;
  item.value_as_known := requested_value_as_known;
  item.source_kind := requested_source_kind;
  item.data_vintage_id := forecast_run.dataset_snapshot_id;
  item.data_vintage_sha256 := forecast_run.dataset_snapshot_sha256;

  IF requested_source_kind = 'canonical_admission' THEN
    SELECT
      admission.id,
      observation.period_end AS observed_at,
      greatest(
        admission.admitted_at, admission.created_at,
        admission_evidence.admission_created_at, admission_evidence.recorded_at,
        observation.recorded_at, release.recorded_at,
        coalesce(release.release_time, release.recorded_at),
        payload.fetched_at, payload.recorded_at
      ) AS available_at,
      admission_evidence.evidence_sha256,
      admission_evidence.source_id,
      admission_evidence.source_dataset_id,
      admission_evidence.license_review_id
    INTO canonical_source
    FROM evidence.canonical_admissions admission
    JOIN evidence.canonical_admission_evidence_sets admission_evidence
      ON admission_evidence.tenant_scope = admission.tenant_scope
      AND admission_evidence.admission_id = admission.id
    JOIN evidence.observations observation
      ON observation.tenant_scope = admission.tenant_scope
      AND observation.id = admission.observation_id
    JOIN evidence.releases release
      ON release.tenant_scope = admission.tenant_scope
      AND release.id = admission.release_id
    JOIN evidence.raw_payloads payload
      ON payload.tenant_scope = release.tenant_scope
      AND payload.id = release.raw_payload_id
    WHERE admission.id = requested_source_id
      AND admission.organization_id = forecast_run.organization_id;
    IF canonical_source.id IS NULL
      OR canonical_source.available_at > forecast_run.as_of
      OR NOT evidence.source_action_is_admitted_as_known(
        canonical_source.source_id, canonical_source.source_dataset_id,
        'derive', forecast_run.as_of
      )
      OR NOT evidence.source_action_is_currently_admitted(
        canonical_source.source_id, canonical_source.source_dataset_id,
        canonical_source.license_review_id, 'api'
      )
    THEN
      RAISE EXCEPTION 'canonical evidence is late, illegal, or unservable'
        USING ERRCODE = '23514';
    END IF;
    item.canonical_admission_id := requested_source_id;
    item.observed_at := canonical_source.observed_at;
    item.available_at := canonical_source.available_at;
    item.source_sha256 := canonical_source.evidence_sha256;
  ELSIF requested_source_kind = 'relationship_evidence' THEN
    SELECT * INTO relationship_source FROM evidence.relationship_evidence candidate
    WHERE candidate.id = requested_source_id
      AND candidate.organization_id = forecast_run.organization_id
      AND candidate.workspace_id = forecast_run.workspace_id;
    IF relationship_source.id IS NULL
      OR relationship_source.recorded_at > forecast_run.as_of
      OR relationship_source.observed_at > forecast_run.as_of
      OR relationship_source.valid_from > forecast_run.as_of
      OR (relationship_source.valid_until IS NOT NULL
        AND relationship_source.valid_until <= forecast_run.as_of)
    THEN
      RAISE EXCEPTION 'relationship evidence is outside the run cutoff or tenant'
        USING ERRCODE = '23514';
    END IF;
    item.relationship_evidence_id := requested_source_id;
    item.observed_at := relationship_source.observed_at;
    item.available_at := relationship_source.recorded_at;
    item.source_sha256 := relationship_source.evidence_sha256;
  ELSIF requested_source_kind = 'economic_state_run' THEN
    SELECT * INTO state_source FROM evidence.economic_state_runs candidate
    WHERE candidate.id = requested_source_id
      AND candidate.organization_id = forecast_run.organization_id
      AND candidate.workspace_id = forecast_run.workspace_id;
    IF state_source.id IS NULL OR state_source.known_at > forecast_run.as_of
      OR state_source.calculated_at > forecast_run.generated_at
      OR NOT evidence.economic_state_run_is_currently_servable(
        state_source.id, 'api'
      )
    THEN
      RAISE EXCEPTION 'economic-state evidence is late or unservable'
        USING ERRCODE = '23514';
    END IF;
    item.economic_state_run_id := requested_source_id;
    item.observed_at := state_source.known_at;
    item.available_at := state_source.calculated_at;
    item.source_sha256 := state_source.result_manifest_sha256;
  ELSE
    RAISE EXCEPTION 'invalid crisis evidence source kind' USING ERRCODE = '22023';
  END IF;

  IF item.available_at > forecast_run.as_of THEN
    RAISE EXCEPTION 'forecast evidence became available after the run cutoff'
      USING ERRCODE = '23514';
  END IF;
  item.created_at := clock_timestamp();
  SELECT manifest, sha256 INTO item.binding_manifest, item.binding_sha256
  FROM evidence.crisis_set_manifest(
    'crisis_forecast_evidence_binding', to_jsonb(item),
    'binding_manifest', 'binding_sha256'
  );
  INSERT INTO evidence.crisis_forecast_evidence_bindings SELECT item.*;
  RETURN item.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.complete_crisis_forecast_run(
  requested_run_id uuid,
  requested_completion_id uuid
)
RETURNS TABLE (completion_id uuid, completion_sha256 text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  forecast_run evidence.crisis_forecast_runs%ROWTYPE;
  existing evidence.crisis_forecast_run_completions%ROWTYPE;
  item evidence.crisis_forecast_run_completions%ROWTYPE;
  missing_count integer;
BEGIN
  IF requested_run_id IS NULL OR requested_completion_id IS NULL THEN
    RAISE EXCEPTION 'invalid crisis forecast completion input'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO forecast_run FROM evidence.crisis_forecast_runs candidate
  WHERE candidate.id = requested_run_id
    AND candidate.organization_id = caller_organization_id
    AND evidence.economic_state_workspace_visible(
      candidate.organization_id, candidate.workspace_id
    );
  IF forecast_run.id IS NULL OR evidence.crisis_workspace_role_internal(
    forecast_run.organization_id, forecast_run.workspace_id, caller_subject_id
  ) NOT IN ('analyst', 'steward', 'validator', 'admin') THEN
    RAISE EXCEPTION 'crisis forecast run is unavailable'
      USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(forecast_run.id::text, 33001));
  SELECT * INTO existing FROM evidence.crisis_forecast_run_completions candidate
  WHERE candidate.organization_id = forecast_run.organization_id
    AND candidate.workspace_id = forecast_run.workspace_id
    AND candidate.run_id = forecast_run.id;
  IF existing.id IS NOT NULL THEN
    IF existing.id <> requested_completion_id THEN
      RAISE EXCEPTION 'crisis forecast completion replay changed identity'
        USING ERRCODE = '23514';
    END IF;
    RETURN QUERY SELECT existing.id, existing.completion_sha256;
    RETURN;
  END IF;
  WITH expected(hazard, horizon_days) AS (
    SELECT hazard, horizon_days
    FROM unnest(ARRAY['FX','BANK','SOV','MON','POL','COUP','CIV','WAR']) hazard
    CROSS JOIN unnest(ARRAY[30,90,180,365]) horizon_days
  )
  SELECT count(*) INTO missing_count
  FROM (
    (SELECT * FROM expected
      EXCEPT
     SELECT slot.hazard, slot.horizon_days
     FROM evidence.crisis_forecast_slots slot
     WHERE slot.organization_id = forecast_run.organization_id
       AND slot.workspace_id = forecast_run.workspace_id
       AND slot.run_id = forecast_run.id)
    UNION ALL
    (SELECT slot.hazard, slot.horizon_days
     FROM evidence.crisis_forecast_slots slot
     WHERE slot.organization_id = forecast_run.organization_id
       AND slot.workspace_id = forecast_run.workspace_id
       AND slot.run_id = forecast_run.id
      EXCEPT
     SELECT * FROM expected)
  ) difference;
  IF missing_count <> 0 OR (
    SELECT count(*) FROM evidence.crisis_forecast_slots slot
    WHERE slot.organization_id = forecast_run.organization_id
      AND slot.workspace_id = forecast_run.workspace_id
      AND slot.run_id = forecast_run.id
  ) <> 32 THEN
    RAISE EXCEPTION 'crisis forecast run requires exactly the 32 independent hazard slots'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM evidence.crisis_forecast_slots slot
    WHERE slot.organization_id = forecast_run.organization_id
      AND slot.workspace_id = forecast_run.workspace_id
      AND slot.run_id = forecast_run.id
      AND (
        (slot.evidence_absence_reason IS NULL AND NOT EXISTS (
          SELECT 1 FROM evidence.crisis_forecast_evidence_bindings binding
          WHERE binding.organization_id = slot.organization_id
            AND binding.workspace_id = slot.workspace_id
            AND binding.forecast_slot_id = slot.id
            AND binding.evidence_role = 'supports'
        ))
        OR (slot.evidence_absence_reason IS NOT NULL AND EXISTS (
          SELECT 1 FROM evidence.crisis_forecast_evidence_bindings binding
          WHERE binding.organization_id = slot.organization_id
            AND binding.workspace_id = slot.workspace_id
            AND binding.forecast_slot_id = slot.id
            AND binding.evidence_role = 'supports'
        ))
        OR (slot.counter_evidence_absence_reason IS NULL AND NOT EXISTS (
          SELECT 1 FROM evidence.crisis_forecast_evidence_bindings binding
          WHERE binding.organization_id = slot.organization_id
            AND binding.workspace_id = slot.workspace_id
            AND binding.forecast_slot_id = slot.id
            AND binding.evidence_role = 'contradicts'
        ))
        OR (slot.counter_evidence_absence_reason IS NOT NULL AND EXISTS (
          SELECT 1 FROM evidence.crisis_forecast_evidence_bindings binding
          WHERE binding.organization_id = slot.organization_id
            AND binding.workspace_id = slot.workspace_id
            AND binding.forecast_slot_id = slot.id
            AND binding.evidence_role = 'contradicts'
        ))
      )
  ) THEN
    RAISE EXCEPTION 'each forecast slot needs bound or explicitly absent evidence and counter-evidence'
      USING ERRCODE = '23514';
  END IF;
  IF NOT evidence.crisis_forecast_inputs_currently_servable_internal(
    forecast_run.organization_id, forecast_run.workspace_id, forecast_run.id
  ) THEN
    RAISE EXCEPTION 'crisis forecast inputs are currently unservable'
      USING ERRCODE = '23514';
  END IF;
  item.id := requested_completion_id;
  item.organization_id := forecast_run.organization_id;
  item.workspace_id := forecast_run.workspace_id;
  item.run_id := forecast_run.id;
  item.slot_count := 32;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'slotId', slot.id::text,
    'hazard', slot.hazard,
    'horizonDays', slot.horizon_days,
    'slotSha256', slot.slot_sha256
  ) ORDER BY array_position(
    ARRAY['FX','BANK','SOV','MON','POL','COUP','CIV','WAR'], slot.hazard
  ), slot.horizon_days), '[]'::jsonb)
  INTO item.slot_manifest_set
  FROM evidence.crisis_forecast_slots slot
  WHERE slot.organization_id = forecast_run.organization_id
    AND slot.workspace_id = forecast_run.workspace_id
    AND slot.run_id = forecast_run.id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'bindingId', binding.id::text,
    'slotId', binding.forecast_slot_id::text,
    'role', binding.evidence_role,
    'bindingSha256', binding.binding_sha256
  ) ORDER BY binding.forecast_slot_id, binding.evidence_role, binding.id), '[]'::jsonb)
  INTO item.evidence_manifest_set
  FROM evidence.crisis_forecast_evidence_bindings binding
  WHERE binding.organization_id = forecast_run.organization_id
    AND binding.workspace_id = forecast_run.workspace_id
    AND binding.run_id = forecast_run.id;
  item.completed_by := caller_subject_id;
  item.completed_at := clock_timestamp();
  SELECT manifest, sha256 INTO item.completion_manifest, item.completion_sha256
  FROM evidence.crisis_set_manifest(
    'crisis_forecast_run_completion', to_jsonb(item),
    'completion_manifest', 'completion_sha256'
  );
  INSERT INTO evidence.crisis_forecast_run_completions SELECT item.*;
  RETURN QUERY SELECT item.id, item.completion_sha256;
END
$$;

CREATE OR REPLACE FUNCTION evidence.create_crisis_backtest(
  requested_backtest_id uuid,
  requested_workspace_id uuid,
  requested_hazard text,
  requested_mode text,
  requested_model_artifact_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  artifact evidence.economic_state_model_artifacts%ROWTYPE;
  existing evidence.crisis_backtests%ROWTYPE;
  item evidence.crisis_backtests%ROWTYPE;
BEGIN
  IF requested_backtest_id IS NULL OR requested_workspace_id IS NULL
    OR requested_hazard IS NULL OR requested_mode IS NULL
    OR requested_model_artifact_id IS NULL
  THEN
    RAISE EXCEPTION 'invalid crisis backtest input' USING ERRCODE = '22023';
  END IF;
  IF evidence.crisis_workspace_role_internal(
    caller_organization_id, requested_workspace_id, caller_subject_id
  ) NOT IN ('analyst', 'steward', 'validator', 'admin') THEN
    RAISE EXCEPTION 'active analyst workspace membership is required'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO artifact FROM evidence.economic_state_model_artifacts candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.id = requested_model_artifact_id;
  IF artifact.id IS NULL OR evidence.economic_state_artifact_status_internal(
    caller_organization_id, requested_workspace_id, artifact.id,
    statement_timestamp(), statement_timestamp()
  ) NOT IN ('research', 'validated', 'approved', 'staged', 'production') THEN
    RAISE EXCEPTION 'backtest model artifact is unavailable'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO existing FROM evidence.crisis_backtests candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.id = requested_backtest_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(
      existing.hazard, existing.mode, existing.model_artifact_id,
      existing.created_by
    ) IS DISTINCT FROM ROW(
      requested_hazard, requested_mode, requested_model_artifact_id,
      caller_subject_id
    ) THEN
      RAISE EXCEPTION 'crisis backtest replay changed identity'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  item.id := requested_backtest_id;
  item.organization_id := caller_organization_id;
  item.workspace_id := requested_workspace_id;
  item.hazard := requested_hazard;
  item.mode := requested_mode;
  item.model_artifact_id := artifact.id;
  item.model_artifact_sha256 := artifact.artifact_sha256;
  item.created_by := caller_subject_id;
  item.created_at := clock_timestamp();
  SELECT manifest, sha256 INTO item.backtest_manifest, item.backtest_sha256
  FROM evidence.crisis_set_manifest(
    'crisis_backtest', to_jsonb(item), 'backtest_manifest', 'backtest_sha256'
  );
  INSERT INTO evidence.crisis_backtests SELECT item.*;
  RETURN item.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.append_crisis_backtest_fold(
  requested_fold_id uuid,
  requested_backtest_id uuid,
  requested_fold_ordinal integer,
  requested_fold_key text,
  requested_training_start timestamptz,
  requested_training_end timestamptz,
  requested_calibration_start timestamptz,
  requested_calibration_end timestamptz,
  requested_test_start timestamptz,
  requested_test_end timestamptz,
  requested_feature_engineering_fit_through timestamptz,
  requested_normalization_fit_through timestamptz,
  requested_threshold_selection_fit_through timestamptz,
  requested_hyperparameter_selection_fit_through timestamptz,
  requested_calibration_fit_through timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  backtest evidence.crisis_backtests%ROWTYPE;
  previous evidence.crisis_backtest_folds%ROWTYPE;
  existing evidence.crisis_backtest_folds%ROWTYPE;
  item evidence.crisis_backtest_folds%ROWTYPE;
BEGIN
  IF requested_fold_id IS NULL OR requested_backtest_id IS NULL
    OR requested_fold_ordinal IS NULL OR requested_fold_key IS NULL
    OR requested_training_start IS NULL OR requested_training_end IS NULL
    OR requested_calibration_start IS NULL OR requested_calibration_end IS NULL
    OR requested_test_start IS NULL OR requested_test_end IS NULL
    OR requested_feature_engineering_fit_through IS NULL
    OR requested_normalization_fit_through IS NULL
    OR requested_threshold_selection_fit_through IS NULL
    OR requested_hyperparameter_selection_fit_through IS NULL
    OR requested_calibration_fit_through IS NULL
  THEN
    RAISE EXCEPTION 'invalid chronological backtest fold input'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO backtest FROM evidence.crisis_backtests candidate
  WHERE candidate.id = requested_backtest_id
    AND candidate.organization_id = caller_organization_id
    AND evidence.economic_state_workspace_visible(
      candidate.organization_id, candidate.workspace_id
    );
  IF backtest.id IS NULL OR evidence.crisis_workspace_role_internal(
    backtest.organization_id, backtest.workspace_id, caller_subject_id
  ) NOT IN ('analyst', 'steward', 'validator', 'admin') THEN
    RAISE EXCEPTION 'crisis backtest is unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(backtest.id::text, 33002));
  SELECT * INTO existing FROM evidence.crisis_backtest_folds candidate
  WHERE candidate.organization_id = backtest.organization_id
    AND candidate.workspace_id = backtest.workspace_id
    AND candidate.id = requested_fold_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(
      existing.backtest_id, existing.fold_ordinal, existing.fold_key,
      existing.training_start, existing.training_end,
      existing.calibration_start, existing.calibration_end,
      existing.test_start, existing.test_end,
      existing.feature_engineering_fit_through,
      existing.normalization_fit_through,
      existing.threshold_selection_fit_through,
      existing.hyperparameter_selection_fit_through,
      existing.calibration_fit_through
    ) IS DISTINCT FROM ROW(
      requested_backtest_id, requested_fold_ordinal, requested_fold_key,
      requested_training_start, requested_training_end,
      requested_calibration_start, requested_calibration_end,
      requested_test_start, requested_test_end,
      requested_feature_engineering_fit_through,
      requested_normalization_fit_through,
      requested_threshold_selection_fit_through,
      requested_hyperparameter_selection_fit_through,
      requested_calibration_fit_through
    ) THEN
      RAISE EXCEPTION 'backtest fold replay changed evidence'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  SELECT * INTO previous FROM evidence.crisis_backtest_folds candidate
  WHERE candidate.organization_id = backtest.organization_id
    AND candidate.workspace_id = backtest.workspace_id
    AND candidate.backtest_id = backtest.id
  ORDER BY candidate.fold_ordinal DESC
  LIMIT 1;
  IF (previous.id IS NULL AND requested_fold_ordinal <> 1)
    OR (previous.id IS NOT NULL AND requested_fold_ordinal <> previous.fold_ordinal + 1)
  THEN
    RAISE EXCEPTION 'backtest fold ordinals must be contiguous'
      USING ERRCODE = '23514';
  END IF;
  IF previous.id IS NOT NULL AND (
    previous.test_end >= requested_test_start
    OR previous.training_end >= requested_training_end
    OR (backtest.mode = 'expanding_window'
      AND previous.training_start <> requested_training_start)
    OR (backtest.mode = 'rolling_window'
      AND previous.training_start > requested_training_start)
  ) THEN
    RAISE EXCEPTION 'backtest folds are not strictly chronological'
      USING ERRCODE = '23514';
  END IF;
  item.id := requested_fold_id;
  item.organization_id := backtest.organization_id;
  item.workspace_id := backtest.workspace_id;
  item.backtest_id := backtest.id;
  item.fold_ordinal := requested_fold_ordinal;
  item.fold_key := requested_fold_key;
  item.training_start := requested_training_start;
  item.training_end := requested_training_end;
  item.calibration_start := requested_calibration_start;
  item.calibration_end := requested_calibration_end;
  item.test_start := requested_test_start;
  item.test_end := requested_test_end;
  item.feature_engineering_fit_through := requested_feature_engineering_fit_through;
  item.normalization_fit_through := requested_normalization_fit_through;
  item.threshold_selection_fit_through := requested_threshold_selection_fit_through;
  item.hyperparameter_selection_fit_through := requested_hyperparameter_selection_fit_through;
  item.calibration_fit_through := requested_calibration_fit_through;
  item.created_at := clock_timestamp();
  SELECT manifest, sha256 INTO item.fold_manifest, item.fold_sha256
  FROM evidence.crisis_set_manifest(
    'crisis_backtest_fold', to_jsonb(item), 'fold_manifest', 'fold_sha256'
  );
  INSERT INTO evidence.crisis_backtest_folds SELECT item.*;
  RETURN item.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.record_crisis_forecast_outcome(
  requested_outcome_id uuid,
  requested_definition_version_id uuid,
  requested_episode_declaration_id uuid,
  requested_geography_id uuid,
  requested_window_start timestamptz,
  requested_window_end timestamptz,
  requested_realized_outcome boolean,
  requested_event_occurred_at timestamptz,
  requested_observed_at timestamptz,
  requested_evidence_sha256 text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  version_record record;
  episode evidence.crisis_episode_declarations%ROWTYPE;
  existing evidence.crisis_forecast_outcomes%ROWTYPE;
  item evidence.crisis_forecast_outcomes%ROWTYPE;
BEGIN
  IF requested_outcome_id IS NULL OR requested_definition_version_id IS NULL
    OR requested_geography_id IS NULL OR requested_window_start IS NULL
    OR requested_window_end IS NULL OR requested_realized_outcome IS NULL
    OR requested_observed_at IS NULL OR requested_evidence_sha256 IS NULL
    OR requested_observed_at > statement_timestamp() + interval '1 minute'
  THEN
    RAISE EXCEPTION 'invalid crisis outcome input' USING ERRCODE = '22023';
  END IF;
  SELECT version_item.*, definition.hazard
  INTO version_record
  FROM evidence.crisis_episode_definition_versions version_item
  JOIN evidence.crisis_episode_definitions definition
    ON definition.organization_id = version_item.organization_id
    AND definition.workspace_id = version_item.workspace_id
    AND definition.id = version_item.definition_id
  WHERE version_item.organization_id = caller_organization_id
    AND version_item.id = requested_definition_version_id
    AND evidence.economic_state_workspace_visible(
      version_item.organization_id, version_item.workspace_id
    );
  IF version_record.id IS NULL OR evidence.crisis_workspace_role_internal(
    version_record.organization_id, version_record.workspace_id, caller_subject_id
  ) NOT IN ('analyst', 'steward', 'validator', 'admin') THEN
    RAISE EXCEPTION 'crisis outcome workspace is unavailable'
      USING ERRCODE = '42501';
  END IF;
  IF requested_realized_outcome THEN
    SELECT * INTO episode FROM evidence.crisis_episode_declarations candidate
    WHERE candidate.organization_id = version_record.organization_id
      AND candidate.workspace_id = version_record.workspace_id
      AND candidate.id = requested_episode_declaration_id;
    IF episode.id IS NULL OR episode.episode_definition_version_id <> version_record.id
      OR episode.geography_id <> requested_geography_id
      OR episode.hazard <> version_record.hazard
      OR episode.onset_at <> requested_event_occurred_at
    THEN
      RAISE EXCEPTION 'realized outcome lacks its exact episode declaration'
        USING ERRCODE = '23514';
    END IF;
  ELSIF requested_episode_declaration_id IS NOT NULL THEN
    RAISE EXCEPTION 'non-event outcome cannot bind an episode declaration'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO existing FROM evidence.crisis_forecast_outcomes candidate
  WHERE candidate.organization_id = version_record.organization_id
    AND candidate.workspace_id = version_record.workspace_id
    AND candidate.id = requested_outcome_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(
      existing.episode_definition_version_id, existing.episode_declaration_id,
      existing.geography_id, existing.window_start, existing.window_end,
      existing.realized_outcome, existing.event_occurred_at,
      existing.observed_at, existing.evidence_sha256, existing.recorded_by
    ) IS DISTINCT FROM ROW(
      requested_definition_version_id, requested_episode_declaration_id,
      requested_geography_id, requested_window_start, requested_window_end,
      requested_realized_outcome, requested_event_occurred_at,
      requested_observed_at, requested_evidence_sha256, caller_subject_id
    ) THEN
      RAISE EXCEPTION 'crisis outcome replay changed evidence'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  item.id := requested_outcome_id;
  item.organization_id := version_record.organization_id;
  item.workspace_id := version_record.workspace_id;
  item.episode_definition_version_id := version_record.id;
  item.episode_definition_version_sha256 := version_record.version_sha256;
  item.episode_declaration_id := requested_episode_declaration_id;
  item.geography_id := requested_geography_id;
  item.hazard := version_record.hazard;
  item.window_start := requested_window_start;
  item.window_end := requested_window_end;
  item.realized_outcome := requested_realized_outcome;
  item.event_occurred_at := requested_event_occurred_at;
  item.observed_at := requested_observed_at;
  item.evidence_sha256 := requested_evidence_sha256;
  item.recorded_by := caller_subject_id;
  item.recorded_at := clock_timestamp();
  SELECT manifest, sha256 INTO item.outcome_manifest, item.outcome_sha256
  FROM evidence.crisis_set_manifest(
    'crisis_forecast_outcome', to_jsonb(item), 'outcome_manifest', 'outcome_sha256'
  );
  INSERT INTO evidence.crisis_forecast_outcomes SELECT item.*;
  RETURN item.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.score_crisis_forecast_outcome(
  requested_score_id uuid,
  requested_forecast_slot_id uuid,
  requested_outcome_id uuid,
  requested_backtest_fold_id uuid,
  requested_classification_threshold numeric,
  requested_log_loss_epsilon numeric,
  requested_scored_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  slot_record record;
  outcome evidence.crisis_forecast_outcomes%ROWTYPE;
  fold_record record;
  existing evidence.crisis_forecast_scores%ROWTYPE;
  item evidence.crisis_forecast_scores%ROWTYPE;
  bounded_probability numeric;
BEGIN
  IF requested_score_id IS NULL OR requested_forecast_slot_id IS NULL
    OR requested_outcome_id IS NULL OR requested_backtest_fold_id IS NULL
    OR requested_classification_threshold IS NULL
    OR requested_log_loss_epsilon IS NULL OR requested_scored_at IS NULL
    OR requested_scored_at > statement_timestamp() + interval '1 minute'
  THEN
    RAISE EXCEPTION 'invalid crisis forecast score input' USING ERRCODE = '22023';
  END IF;
  SELECT slot.*, forecast_run.geography_id, forecast_run.as_of,
    forecast_run.generated_at
  INTO slot_record
  FROM evidence.crisis_forecast_slots slot
  JOIN evidence.crisis_forecast_runs forecast_run
    ON forecast_run.organization_id = slot.organization_id
    AND forecast_run.workspace_id = slot.workspace_id
    AND forecast_run.id = slot.run_id
  JOIN evidence.crisis_forecast_run_completions completion
    ON completion.organization_id = slot.organization_id
    AND completion.workspace_id = slot.workspace_id
    AND completion.run_id = slot.run_id
  WHERE slot.organization_id = caller_organization_id
    AND slot.id = requested_forecast_slot_id
    AND evidence.economic_state_workspace_visible(slot.organization_id, slot.workspace_id);
  SELECT * INTO outcome FROM evidence.crisis_forecast_outcomes candidate
  WHERE candidate.organization_id = slot_record.organization_id
    AND candidate.workspace_id = slot_record.workspace_id
    AND candidate.id = requested_outcome_id;
  SELECT fold.*, backtest.hazard AS backtest_hazard,
    backtest.model_artifact_id AS backtest_model_artifact_id
  INTO fold_record
  FROM evidence.crisis_backtest_folds fold
  JOIN evidence.crisis_backtests backtest
    ON backtest.organization_id = fold.organization_id
    AND backtest.workspace_id = fold.workspace_id
    AND backtest.id = fold.backtest_id
  WHERE fold.organization_id = slot_record.organization_id
    AND fold.workspace_id = slot_record.workspace_id
    AND fold.id = requested_backtest_fold_id;
  IF slot_record.id IS NULL OR outcome.id IS NULL OR fold_record.id IS NULL
    OR evidence.crisis_workspace_role_internal(
      slot_record.organization_id, slot_record.workspace_id, caller_subject_id
    ) NOT IN ('analyst', 'steward', 'validator', 'admin')
  THEN
    RAISE EXCEPTION 'forecast score inputs are unavailable' USING ERRCODE = '42501';
  END IF;
  IF outcome.geography_id <> slot_record.geography_id
    OR outcome.hazard <> slot_record.hazard
    OR outcome.window_start <> slot_record.as_of
    OR outcome.window_end <> slot_record.as_of
      + make_interval(days => slot_record.horizon_days)
    OR outcome.observed_at > requested_scored_at
    OR requested_scored_at < outcome.window_end
    OR slot_record.as_of < fold_record.test_start
    OR slot_record.as_of >= fold_record.test_end
    OR fold_record.backtest_hazard <> slot_record.hazard
    OR fold_record.backtest_model_artifact_id <> slot_record.model_artifact_id
    OR (outcome.event_occurred_at IS NOT NULL
      AND outcome.event_occurred_at < slot_record.generated_at)
  THEN
    RAISE EXCEPTION 'forecast outcome scoring violates hazard, horizon, or chronology'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO existing FROM evidence.crisis_forecast_scores candidate
  WHERE candidate.organization_id = slot_record.organization_id
    AND candidate.workspace_id = slot_record.workspace_id
    AND candidate.id = requested_score_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(
      existing.forecast_slot_id, existing.outcome_id,
      existing.backtest_fold_id, existing.classification_threshold,
      existing.log_loss_epsilon, existing.scored_at
    ) IS DISTINCT FROM ROW(
      requested_forecast_slot_id, requested_outcome_id,
      requested_backtest_fold_id, requested_classification_threshold,
      requested_log_loss_epsilon, requested_scored_at
    ) THEN
      RAISE EXCEPTION 'crisis forecast score replay changed evidence'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  item.id := requested_score_id;
  item.organization_id := slot_record.organization_id;
  item.workspace_id := slot_record.workspace_id;
  item.forecast_slot_id := slot_record.id;
  item.outcome_id := outcome.id;
  item.backtest_fold_id := fold_record.id;
  item.classification_threshold := requested_classification_threshold;
  item.log_loss_epsilon := requested_log_loss_epsilon;
  item.probability_used := slot_record.calibrated_probability;
  item.brier_score := power(
    slot_record.calibrated_probability - CASE WHEN outcome.realized_outcome THEN 1 ELSE 0 END,
    2
  );
  bounded_probability := greatest(
    requested_log_loss_epsilon,
    least(1 - requested_log_loss_epsilon, slot_record.calibrated_probability)
  );
  item.log_loss := -CASE WHEN outcome.realized_outcome
    THEN ln(bounded_probability) ELSE ln(1 - bounded_probability) END;
  item.calibration_residual := slot_record.calibrated_probability
    - CASE WHEN outcome.realized_outcome THEN 1 ELSE 0 END;
  item.lead_time_seconds := CASE WHEN outcome.event_occurred_at IS NULL THEN NULL
    ELSE floor(extract(epoch FROM (
      outcome.event_occurred_at - slot_record.generated_at
    )))::bigint END;
  item.predicted_positive := slot_record.calibrated_probability
    >= requested_classification_threshold;
  item.direction_accurate := item.predicted_positive = outcome.realized_outcome;
  item.false_positive := item.predicted_positive AND NOT outcome.realized_outcome;
  item.false_negative := NOT item.predicted_positive AND outcome.realized_outcome;
  item.scored_at := requested_scored_at;
  SELECT manifest, sha256 INTO item.score_manifest, item.score_sha256
  FROM evidence.crisis_set_manifest(
    'crisis_forecast_score', to_jsonb(item), 'score_manifest', 'score_sha256'
  );
  INSERT INTO evidence.crisis_forecast_scores SELECT item.*;
  RETURN item.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.create_crisis_alert_policy(
  requested_policy_id uuid,
  requested_workspace_id uuid,
  requested_policy_key text,
  requested_policy_version text,
  requested_hazard text,
  requested_horizon_days integer,
  requested_entry_probability numeric,
  requested_exit_probability numeric,
  requested_warning_probability numeric,
  requested_critical_probability numeric,
  requested_entry_consecutive_observations integer,
  requested_exit_consecutive_observations integer,
  requested_minimum_evidence_items integer,
  requested_uncalibrated_severity_ceiling text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  existing evidence.crisis_alert_policies%ROWTYPE;
  item evidence.crisis_alert_policies%ROWTYPE;
BEGIN
  IF requested_policy_id IS NULL OR requested_workspace_id IS NULL
    OR requested_policy_key IS NULL OR requested_policy_version IS NULL
    OR requested_hazard IS NULL OR requested_horizon_days IS NULL
    OR requested_entry_probability IS NULL OR requested_exit_probability IS NULL
    OR requested_warning_probability IS NULL OR requested_critical_probability IS NULL
    OR requested_entry_consecutive_observations IS NULL
    OR requested_exit_consecutive_observations IS NULL
    OR requested_minimum_evidence_items IS NULL
    OR requested_uncalibrated_severity_ceiling IS NULL
  THEN
    RAISE EXCEPTION 'invalid crisis alert policy input' USING ERRCODE = '22023';
  END IF;
  IF evidence.crisis_workspace_role_internal(
    caller_organization_id, requested_workspace_id, caller_subject_id
  ) NOT IN ('steward', 'validator', 'admin') THEN
    RAISE EXCEPTION 'validator workspace membership is required for alert policy'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO existing FROM evidence.crisis_alert_policies candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.id = requested_policy_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(
      existing.policy_key, existing.policy_version, existing.hazard,
      existing.horizon_days, existing.entry_probability,
      existing.exit_probability, existing.warning_probability,
      existing.critical_probability, existing.entry_consecutive_observations,
      existing.exit_consecutive_observations, existing.minimum_evidence_items,
      existing.uncalibrated_severity_ceiling, existing.created_by
    ) IS DISTINCT FROM ROW(
      requested_policy_key, requested_policy_version, requested_hazard,
      requested_horizon_days, requested_entry_probability,
      requested_exit_probability, requested_warning_probability,
      requested_critical_probability, requested_entry_consecutive_observations,
      requested_exit_consecutive_observations, requested_minimum_evidence_items,
      requested_uncalibrated_severity_ceiling, caller_subject_id
    ) THEN
      RAISE EXCEPTION 'crisis alert policy replay changed evidence'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  item.id := requested_policy_id;
  item.organization_id := caller_organization_id;
  item.workspace_id := requested_workspace_id;
  item.policy_key := requested_policy_key;
  item.policy_version := requested_policy_version;
  item.hazard := requested_hazard;
  item.horizon_days := requested_horizon_days;
  item.methodology_scope := 'research_baseline';
  item.entry_probability := requested_entry_probability;
  item.exit_probability := requested_exit_probability;
  item.warning_probability := requested_warning_probability;
  item.critical_probability := requested_critical_probability;
  item.entry_consecutive_observations := requested_entry_consecutive_observations;
  item.exit_consecutive_observations := requested_exit_consecutive_observations;
  item.minimum_evidence_items := requested_minimum_evidence_items;
  item.uncalibrated_severity_ceiling := requested_uncalibrated_severity_ceiling;
  item.created_by := caller_subject_id;
  item.created_at := clock_timestamp();
  SELECT manifest, sha256 INTO item.policy_manifest, item.policy_sha256
  FROM evidence.crisis_set_manifest(
    'crisis_alert_policy', to_jsonb(item), 'policy_manifest', 'policy_sha256'
  );
  INSERT INTO evidence.crisis_alert_policies SELECT item.*;
  RETURN item.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.evaluate_crisis_alert(
  requested_event_id uuid,
  requested_policy_id uuid,
  requested_forecast_slot_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  policy evidence.crisis_alert_policies%ROWTYPE;
  slot_record record;
  prior evidence.crisis_alert_events%ROWTYPE;
  existing evidence.crisis_alert_events%ROWTYPE;
  item evidence.crisis_alert_events%ROWTYPE;
  was_active boolean;
  severity_rank integer;
  ceiling_rank integer;
BEGIN
  IF requested_event_id IS NULL OR requested_policy_id IS NULL
    OR requested_forecast_slot_id IS NULL
  THEN
    RAISE EXCEPTION 'invalid crisis alert evaluation input'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO policy FROM evidence.crisis_alert_policies candidate
  WHERE candidate.id = requested_policy_id
    AND candidate.organization_id = caller_organization_id
    AND evidence.economic_state_workspace_visible(
      candidate.organization_id, candidate.workspace_id
    );
  SELECT slot.*, forecast_run.geography_id, forecast_run.generated_at,
    forecast_run.id AS forecast_run_id
  INTO slot_record
  FROM evidence.crisis_forecast_slots slot
  JOIN evidence.crisis_forecast_runs forecast_run
    ON forecast_run.organization_id = slot.organization_id
    AND forecast_run.workspace_id = slot.workspace_id
    AND forecast_run.id = slot.run_id
  JOIN evidence.crisis_forecast_run_completions completion
    ON completion.organization_id = slot.organization_id
    AND completion.workspace_id = slot.workspace_id
    AND completion.run_id = slot.run_id
  WHERE slot.organization_id = policy.organization_id
    AND slot.workspace_id = policy.workspace_id
    AND slot.id = requested_forecast_slot_id;
  IF policy.id IS NULL OR slot_record.id IS NULL
    OR evidence.crisis_workspace_role_internal(
      policy.organization_id, policy.workspace_id, caller_subject_id
    ) NOT IN ('analyst', 'steward', 'validator', 'admin')
  THEN
    RAISE EXCEPTION 'crisis alert inputs are unavailable' USING ERRCODE = '42501';
  END IF;
  IF policy.hazard <> slot_record.hazard
    OR policy.horizon_days <> slot_record.horizon_days
  THEN
    RAISE EXCEPTION 'crisis alert cannot mix hazards or horizons'
      USING ERRCODE = '23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    policy.id::text || ':' || slot_record.geography_id::text, 33003
  ));
  SELECT * INTO existing FROM evidence.crisis_alert_events candidate
  WHERE candidate.organization_id = policy.organization_id
    AND candidate.workspace_id = policy.workspace_id
    AND candidate.id = requested_event_id;
  IF existing.id IS NOT NULL THEN
    IF existing.policy_id <> requested_policy_id
      OR existing.forecast_slot_id <> requested_forecast_slot_id
    THEN
      RAISE EXCEPTION 'crisis alert replay changed identity'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  IF NOT evidence.crisis_forecast_run_is_currently_servable_internal(
    slot_record.organization_id, slot_record.workspace_id,
    slot_record.forecast_run_id
  ) THEN
    RAISE EXCEPTION 'crisis alert cannot use an unservable run'
      USING ERRCODE = '23514';
  END IF;
  SELECT event.* INTO prior
  FROM evidence.crisis_alert_events event
  JOIN evidence.crisis_forecast_slots prior_slot
    ON prior_slot.organization_id = event.organization_id
    AND prior_slot.workspace_id = event.workspace_id
    AND prior_slot.id = event.forecast_slot_id
  JOIN evidence.crisis_forecast_runs prior_run
    ON prior_run.organization_id = prior_slot.organization_id
    AND prior_run.workspace_id = prior_slot.workspace_id
    AND prior_run.id = prior_slot.run_id
  WHERE event.organization_id = policy.organization_id
    AND event.workspace_id = policy.workspace_id
    AND event.policy_id = policy.id
    AND prior_run.geography_id = slot_record.geography_id
  ORDER BY event.observed_at DESC, event.id DESC
  LIMIT 1;
  IF prior.id IS NOT NULL AND prior.observed_at >= slot_record.generated_at THEN
    RAISE EXCEPTION 'crisis alert observations must be strictly chronological'
      USING ERRCODE = '23514';
  END IF;
  item.id := requested_event_id;
  item.organization_id := policy.organization_id;
  item.workspace_id := policy.workspace_id;
  item.policy_id := policy.id;
  item.forecast_slot_id := slot_record.id;
  item.prior_event_id := prior.id;
  item.observed_at := slot_record.generated_at;
  item.probability := slot_record.calibrated_probability;
  item.calibrated := slot_record.calibration_status = 'calibrated';
  SELECT count(*) INTO item.evidence_item_count
  FROM evidence.crisis_forecast_evidence_bindings binding
  WHERE binding.organization_id = slot_record.organization_id
    AND binding.workspace_id = slot_record.workspace_id
    AND binding.forecast_slot_id = slot_record.id;
  item.out_of_domain := slot_record.out_of_domain;
  item.entry_streak := 0;
  item.exit_streak := 0;
  item.transition := 'none';
  item.gate_reason := NULL;
  IF item.out_of_domain OR item.evidence_item_count < policy.minimum_evidence_items THEN
    item.state := 'suppressed';
    item.severity := 'none';
    item.gate_reason := CASE WHEN item.out_of_domain
      THEN 'out_of_domain' ELSE 'insufficient_evidence' END;
    item.transition := 'suppressed';
  ELSE
    was_active := coalesce(prior.state = 'active', false);
    IF NOT was_active THEN
      item.entry_streak := CASE WHEN item.probability >= policy.entry_probability
        THEN CASE WHEN prior.state = 'inactive' THEN prior.entry_streak ELSE 0 END + 1
        ELSE 0 END;
      IF item.entry_streak >= policy.entry_consecutive_observations THEN
        item.state := 'active';
        item.transition := 'entered';
        item.entry_streak := 0;
      ELSE
        item.state := 'inactive';
      END IF;
    ELSE
      item.exit_streak := CASE WHEN item.probability < policy.exit_probability
        THEN prior.exit_streak + 1 ELSE 0 END;
      IF item.exit_streak >= policy.exit_consecutive_observations THEN
        item.state := 'inactive';
        item.transition := 'exited';
        item.exit_streak := 0;
      ELSE
        item.state := 'active';
      END IF;
    END IF;
    item.severity := CASE WHEN item.state <> 'active' THEN 'none'
      WHEN item.probability >= policy.critical_probability THEN 'critical'
      WHEN item.probability >= policy.warning_probability THEN 'warning'
      ELSE 'watch' END;
    severity_rank := CASE item.severity
      WHEN 'critical' THEN 3 WHEN 'warning' THEN 2 WHEN 'watch' THEN 1 ELSE 0 END;
    ceiling_rank := CASE policy.uncalibrated_severity_ceiling
      WHEN 'warning' THEN 2 ELSE 1 END;
    IF item.state = 'active' AND NOT item.calibrated
      AND severity_rank > ceiling_rank
    THEN
      item.severity := policy.uncalibrated_severity_ceiling;
      item.gate_reason := 'uncalibrated_severity_ceiling';
    END IF;
  END IF;
  item.evaluated_at := clock_timestamp();
  SELECT manifest, sha256 INTO item.event_manifest, item.event_sha256
  FROM evidence.crisis_set_manifest(
    'crisis_alert_event', to_jsonb(item), 'event_manifest', 'event_sha256'
  );
  INSERT INTO evidence.crisis_alert_events SELECT item.*;
  RETURN item.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.record_crisis_postmortem(
  requested_postmortem_id uuid,
  requested_forecast_slot_id uuid,
  requested_outcome_id uuid,
  requested_alert_event_id uuid,
  requested_episode_declaration_id uuid,
  requested_analysis jsonb,
  requested_lessons jsonb,
  requested_follow_up_actions jsonb,
  requested_authored_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  slot_record record;
  outcome evidence.crisis_forecast_outcomes%ROWTYPE;
  alert evidence.crisis_alert_events%ROWTYPE;
  episode evidence.crisis_episode_declarations%ROWTYPE;
  existing evidence.crisis_postmortems%ROWTYPE;
  item evidence.crisis_postmortems%ROWTYPE;
BEGIN
  IF requested_postmortem_id IS NULL OR requested_forecast_slot_id IS NULL
    OR requested_outcome_id IS NULL OR requested_analysis IS NULL
    OR requested_lessons IS NULL OR requested_follow_up_actions IS NULL
    OR requested_authored_at IS NULL
    OR requested_authored_at > statement_timestamp() + interval '1 minute'
  THEN
    RAISE EXCEPTION 'invalid crisis postmortem input' USING ERRCODE = '22023';
  END IF;
  SELECT slot.*, forecast_run.geography_id, forecast_run.as_of
  INTO slot_record
  FROM evidence.crisis_forecast_slots slot
  JOIN evidence.crisis_forecast_runs forecast_run
    ON forecast_run.organization_id = slot.organization_id
    AND forecast_run.workspace_id = slot.workspace_id
    AND forecast_run.id = slot.run_id
  JOIN evidence.crisis_forecast_run_completions completion
    ON completion.organization_id = slot.organization_id
    AND completion.workspace_id = slot.workspace_id
    AND completion.run_id = slot.run_id
  WHERE slot.organization_id = caller_organization_id
    AND slot.id = requested_forecast_slot_id
    AND evidence.economic_state_workspace_visible(slot.organization_id, slot.workspace_id);
  SELECT * INTO outcome FROM evidence.crisis_forecast_outcomes candidate
  WHERE candidate.organization_id = slot_record.organization_id
    AND candidate.workspace_id = slot_record.workspace_id
    AND candidate.id = requested_outcome_id;
  IF requested_alert_event_id IS NOT NULL THEN
    SELECT * INTO alert FROM evidence.crisis_alert_events candidate
    WHERE candidate.organization_id = slot_record.organization_id
      AND candidate.workspace_id = slot_record.workspace_id
      AND candidate.id = requested_alert_event_id;
  END IF;
  IF requested_episode_declaration_id IS NOT NULL THEN
    SELECT * INTO episode FROM evidence.crisis_episode_declarations candidate
    WHERE candidate.organization_id = slot_record.organization_id
      AND candidate.workspace_id = slot_record.workspace_id
      AND candidate.id = requested_episode_declaration_id;
  END IF;
  IF slot_record.id IS NULL OR outcome.id IS NULL
    OR evidence.crisis_workspace_role_internal(
      slot_record.organization_id, slot_record.workspace_id, caller_subject_id
    ) NOT IN ('steward', 'validator', 'admin')
  THEN
    RAISE EXCEPTION 'crisis postmortem inputs are unavailable'
      USING ERRCODE = '42501';
  END IF;
  IF outcome.geography_id <> slot_record.geography_id
    OR outcome.hazard <> slot_record.hazard
    OR outcome.window_start <> slot_record.as_of
    OR outcome.window_end <> slot_record.as_of
      + make_interval(days => slot_record.horizon_days)
    OR requested_authored_at < outcome.observed_at
    OR (requested_alert_event_id IS NOT NULL
      AND (alert.id IS NULL OR alert.forecast_slot_id <> slot_record.id))
    OR (requested_episode_declaration_id IS NOT NULL
      AND (episode.id IS NULL OR episode.id IS DISTINCT FROM outcome.episode_declaration_id))
  THEN
    RAISE EXCEPTION 'postmortem does not bind the exact forecast outcome timeline'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO existing FROM evidence.crisis_postmortems candidate
  WHERE candidate.organization_id = slot_record.organization_id
    AND candidate.workspace_id = slot_record.workspace_id
    AND candidate.id = requested_postmortem_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(
      existing.forecast_slot_id, existing.outcome_id, existing.alert_event_id,
      existing.episode_declaration_id, existing.analysis, existing.lessons,
      existing.follow_up_actions, existing.authored_by, existing.authored_at
    ) IS DISTINCT FROM ROW(
      requested_forecast_slot_id, requested_outcome_id,
      requested_alert_event_id, requested_episode_declaration_id,
      requested_analysis, requested_lessons, requested_follow_up_actions,
      caller_subject_id, requested_authored_at
    ) THEN
      RAISE EXCEPTION 'crisis postmortem replay changed evidence'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  item.id := requested_postmortem_id;
  item.organization_id := slot_record.organization_id;
  item.workspace_id := slot_record.workspace_id;
  item.forecast_slot_id := slot_record.id;
  item.outcome_id := outcome.id;
  item.alert_event_id := requested_alert_event_id;
  item.episode_declaration_id := requested_episode_declaration_id;
  item.analysis := requested_analysis;
  item.lessons := requested_lessons;
  item.follow_up_actions := requested_follow_up_actions;
  item.authored_by := caller_subject_id;
  item.authored_at := requested_authored_at;
  SELECT manifest, sha256 INTO item.postmortem_manifest, item.postmortem_sha256
  FROM evidence.crisis_set_manifest(
    'crisis_postmortem', to_jsonb(item), 'postmortem_manifest', 'postmortem_sha256'
  );
  INSERT INTO evidence.crisis_postmortems SELECT item.*;
  RETURN item.id;
END
$$;

CREATE OR REPLACE FUNCTION app.get_crisis_forecast_run(
  requested_workspace_id uuid,
  requested_run_id uuid
)
RETURNS TABLE (
  run_id uuid,
  geography_id uuid,
  as_of timestamptz,
  generated_at timestamptz,
  dataset_snapshot_id uuid,
  dataset_snapshot_sha256 text,
  run_sha256 text,
  completion_id uuid,
  completion_sha256 text,
  slot_pointers jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
BEGIN
  IF requested_workspace_id IS NULL OR requested_run_id IS NULL THEN
    RAISE EXCEPTION 'workspace and crisis forecast run are required'
      USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT
    forecast_run.id,
    forecast_run.geography_id,
    forecast_run.as_of,
    forecast_run.generated_at,
    forecast_run.dataset_snapshot_id,
    forecast_run.dataset_snapshot_sha256,
    forecast_run.run_sha256,
    completion.id,
    completion.completion_sha256,
    completion.slot_manifest_set
  FROM evidence.crisis_forecast_runs forecast_run
  JOIN evidence.crisis_forecast_run_completions completion
    ON completion.organization_id = forecast_run.organization_id
    AND completion.workspace_id = forecast_run.workspace_id
    AND completion.run_id = forecast_run.id
  WHERE forecast_run.organization_id = app.current_organization_id()
    AND forecast_run.workspace_id = requested_workspace_id
    AND forecast_run.id = requested_run_id
    AND evidence.economic_state_workspace_visible(
      forecast_run.organization_id, forecast_run.workspace_id
    )
    AND evidence.crisis_forecast_run_is_currently_servable_internal(
      forecast_run.organization_id, forecast_run.workspace_id, forecast_run.id
    );
END
$$;

CREATE OR REPLACE FUNCTION app.get_crisis_forecast_slot(
  requested_workspace_id uuid,
  requested_slot_id uuid
)
RETURNS TABLE (
  slot_id uuid,
  run_id uuid,
  geography_id uuid,
  hazard text,
  horizon_days integer,
  as_of timestamptz,
  generated_at timestamptz,
  run_sha256 text,
  slot_sha256 text,
  raw_probability text,
  calibrated_probability text,
  uncertainty_lower text,
  uncertainty_upper text,
  uncertainty_confidence text,
  uncertainty_method text,
  calibration_status text,
  out_of_domain boolean,
  model_artifact_id uuid,
  model_artifact_sha256 text,
  model_version text,
  training_data_cutoff timestamptz,
  calibrated_through timestamptz,
  model_configuration_sha256 text,
  model_code_sha256 text,
  assumptions jsonb,
  invalidation_criteria jsonb,
  evidence_absence_reason text,
  counter_evidence_absence_reason text,
  evidence_pointers jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
BEGIN
  IF requested_workspace_id IS NULL OR requested_slot_id IS NULL THEN
    RAISE EXCEPTION 'workspace and crisis forecast slot are required'
      USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT
    slot.id,
    slot.run_id,
    forecast_run.geography_id,
    slot.hazard,
    slot.horizon_days,
    forecast_run.as_of,
    forecast_run.generated_at,
    forecast_run.run_sha256,
    slot.slot_sha256,
    slot.raw_probability::text,
    slot.calibrated_probability::text,
    slot.uncertainty_lower::text,
    slot.uncertainty_upper::text,
    slot.uncertainty_confidence::text,
    slot.uncertainty_method,
    slot.calibration_status,
    slot.out_of_domain,
    slot.model_artifact_id,
    slot.model_artifact_sha256,
    slot.model_version,
    slot.training_data_cutoff,
    slot.calibrated_through,
    slot.model_configuration_sha256,
    slot.model_code_sha256,
    slot.assumptions,
    slot.invalidation_criteria,
    slot.evidence_absence_reason,
    slot.counter_evidence_absence_reason,
    coalesce((
      SELECT jsonb_agg(pointer.value ORDER BY pointer.role_order, pointer.binding_id)
      FROM (
        SELECT
          binding.id AS binding_id,
          CASE binding.evidence_role WHEN 'supports' THEN 1 ELSE 2 END AS role_order,
          jsonb_build_object(
            'bindingId', binding.id::text,
            'role', binding.evidence_role,
            'indicatorKey', binding.indicator_key,
            'direction', binding.direction,
            'observedAt', to_char(
              binding.observed_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ),
            'availableAt', to_char(
              binding.available_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ),
            'sourceKind', binding.source_kind,
            'sourceId', coalesce(
              binding.canonical_admission_id,
              binding.relationship_evidence_id,
              binding.economic_state_run_id
            )::text,
            'sourceSha256', binding.source_sha256,
            'dataVintageId', binding.data_vintage_id::text,
            'dataVintageSha256', binding.data_vintage_sha256,
            'bindingSha256', binding.binding_sha256
          ) AS value
        FROM evidence.crisis_forecast_evidence_bindings binding
        WHERE binding.organization_id = slot.organization_id
          AND binding.workspace_id = slot.workspace_id
          AND binding.forecast_slot_id = slot.id
        ORDER BY binding.evidence_role, binding.id
        LIMIT 100
      ) pointer
    ), '[]'::jsonb)
  FROM evidence.crisis_forecast_slots slot
  JOIN evidence.crisis_forecast_runs forecast_run
    ON forecast_run.organization_id = slot.organization_id
    AND forecast_run.workspace_id = slot.workspace_id
    AND forecast_run.id = slot.run_id
  JOIN evidence.crisis_forecast_run_completions completion
    ON completion.organization_id = slot.organization_id
    AND completion.workspace_id = slot.workspace_id
    AND completion.run_id = slot.run_id
  WHERE slot.organization_id = app.current_organization_id()
    AND slot.workspace_id = requested_workspace_id
    AND slot.id = requested_slot_id
    AND evidence.economic_state_workspace_visible(
      slot.organization_id, slot.workspace_id
    )
    AND evidence.crisis_forecast_run_is_currently_servable_internal(
      slot.organization_id, slot.workspace_id, slot.run_id
    );
END
$$;

CREATE OR REPLACE FUNCTION app.list_crisis_forecast_runs(
  requested_workspace_id uuid,
  requested_geography_id uuid,
  requested_limit integer DEFAULT 50,
  requested_before_generated_at timestamptz DEFAULT NULL,
  requested_before_run_id uuid DEFAULT NULL
)
RETURNS TABLE (
  run_id uuid,
  geography_id uuid,
  as_of timestamptz,
  generated_at timestamptz,
  dataset_snapshot_id uuid,
  run_sha256 text,
  completion_id uuid,
  completion_sha256 text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
BEGIN
  IF requested_workspace_id IS NULL OR requested_geography_id IS NULL
    OR requested_limit IS NULL OR requested_limit NOT BETWEEN 1 AND 100
    OR ((requested_before_generated_at IS NULL) <> (requested_before_run_id IS NULL))
    OR (requested_before_generated_at IS NOT NULL
      AND NOT isfinite(requested_before_generated_at))
  THEN
    RAISE EXCEPTION 'invalid crisis forecast run page input'
      USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT
    forecast_run.id,
    forecast_run.geography_id,
    forecast_run.as_of,
    forecast_run.generated_at,
    forecast_run.dataset_snapshot_id,
    forecast_run.run_sha256,
    completion.id,
    completion.completion_sha256
  FROM evidence.crisis_forecast_runs forecast_run
  JOIN evidence.crisis_forecast_run_completions completion
    ON completion.organization_id = forecast_run.organization_id
    AND completion.workspace_id = forecast_run.workspace_id
    AND completion.run_id = forecast_run.id
  WHERE forecast_run.organization_id = app.current_organization_id()
    AND forecast_run.workspace_id = requested_workspace_id
    AND forecast_run.geography_id = requested_geography_id
    AND evidence.economic_state_workspace_visible(
      forecast_run.organization_id, forecast_run.workspace_id
    )
    AND (
      requested_before_generated_at IS NULL
      OR (forecast_run.generated_at, forecast_run.id)
        < (requested_before_generated_at, requested_before_run_id)
    )
    AND evidence.crisis_forecast_run_is_currently_servable_internal(
      forecast_run.organization_id, forecast_run.workspace_id, forecast_run.id
    )
  ORDER BY forecast_run.generated_at DESC, forecast_run.id DESC
  LIMIT requested_limit;
END
$$;

DO $crisis_revoke_functions$
DECLARE
  function_signature regprocedure;
BEGIN
  FOR function_signature IN
    SELECT procedure.oid::regprocedure
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'evidence'
      AND (
        procedure.proname LIKE 'crisis\_%' ESCAPE '\'
        OR procedure.proname IN (
          'verify_crisis_canonical_record',
          'create_crisis_episode_definition',
          'create_crisis_episode_definition_version',
          'declare_crisis_episode',
          'prepare_crisis_forecast_run',
          'append_crisis_forecast_slot',
          'bind_crisis_forecast_evidence',
          'complete_crisis_forecast_run',
          'create_crisis_backtest',
          'append_crisis_backtest_fold',
          'record_crisis_forecast_outcome',
          'score_crisis_forecast_outcome',
          'create_crisis_alert_policy',
          'evaluate_crisis_alert',
          'record_crisis_postmortem'
        )
      )
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, economyos_app, economyos_ingest',
      function_signature
    );
  END LOOP;
END
$crisis_revoke_functions$;

REVOKE ALL ON FUNCTION app.get_crisis_forecast_run(uuid, uuid)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.get_crisis_forecast_slot(uuid, uuid)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.list_crisis_forecast_runs(
  uuid, uuid, integer, timestamptz, uuid
) FROM PUBLIC, economyos_ingest;

GRANT EXECUTE ON FUNCTION evidence.create_crisis_episode_definition(
  uuid, uuid, text, text
) TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.create_crisis_episode_definition_version(
  uuid, uuid, text, jsonb, jsonb, text, text, timestamptz, timestamptz
) TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.create_crisis_alert_policy(
  uuid, uuid, text, text, text, integer,
  numeric, numeric, numeric, numeric, integer, integer, integer, text
) TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.record_crisis_postmortem(
  uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb, timestamptz
) TO economyos_app;

GRANT EXECUTE ON FUNCTION evidence.declare_crisis_episode(
  uuid, uuid, uuid, uuid, timestamptz, timestamptz,
  timestamptz, text, jsonb
) TO economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.prepare_crisis_forecast_run(
  uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text
) TO economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.append_crisis_forecast_slot(
  uuid, uuid, text, integer, numeric, numeric, numeric, numeric, numeric,
  text, text, boolean, uuid, timestamptz, timestamptz, text, text,
  jsonb, jsonb, text, text
) TO economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.bind_crisis_forecast_evidence(
  uuid, uuid, text, text, text, text, text, uuid
) TO economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.complete_crisis_forecast_run(uuid, uuid)
  TO economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.create_crisis_backtest(
  uuid, uuid, text, text, uuid
) TO economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.append_crisis_backtest_fold(
  uuid, uuid, integer, text,
  timestamptz, timestamptz, timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz
) TO economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.record_crisis_forecast_outcome(
  uuid, uuid, uuid, uuid, timestamptz, timestamptz,
  boolean, timestamptz, timestamptz, text
) TO economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.score_crisis_forecast_outcome(
  uuid, uuid, uuid, uuid, numeric, numeric, timestamptz
) TO economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.evaluate_crisis_alert(uuid, uuid, uuid)
  TO economyos_ingest;

GRANT EXECUTE ON FUNCTION app.get_crisis_forecast_run(uuid, uuid)
  TO economyos_app;
GRANT EXECUTE ON FUNCTION app.get_crisis_forecast_slot(uuid, uuid)
  TO economyos_app;
GRANT EXECUTE ON FUNCTION app.list_crisis_forecast_runs(
  uuid, uuid, integer, timestamptz, uuid
) TO economyos_app;

COMMENT ON TABLE evidence.crisis_forecast_runs IS
  'Immutable crisis forecast run identity; no aggregate crisis score or probability is represented.';
COMMENT ON TABLE evidence.crisis_forecast_slots IS
  'Independent hazard/horizon forecast evidence. Terminal runs contain exactly eight hazards by four horizons.';
COMMENT ON TABLE evidence.crisis_forecast_run_completions IS
  'Append-only terminal commitment to all 32 slot digests and their cutoff-safe evidence bindings.';
COMMENT ON FUNCTION app.get_crisis_forecast_run(uuid, uuid) IS
  'Non-enumerating current-servable pointer view for one completed crisis forecast run; returns no forecast content.';
COMMENT ON FUNCTION app.get_crisis_forecast_slot(uuid, uuid) IS
  'Non-enumerating exact governed slot detail for a completed current-servable run, with at most 100 immutable evidence pointers.';
COMMENT ON FUNCTION app.list_crisis_forecast_runs(
  uuid, uuid, integer, timestamptz, uuid
) IS 'Bounded descending keyset page of current-servable crisis forecast run pointers for one geography.';
