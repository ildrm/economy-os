-- Phase 6 durable investment-research persistence. These records are candidate
-- research evidence only: they cannot express advice, an allocation, or a rank.

CREATE OR REPLACE FUNCTION evidence.capital_json_digest(requested_value jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, evidence
AS $$
  SELECT encode(digest(
    convert_to(evidence.canonical_json(requested_value), 'UTF8'), 'sha256'
  ), 'hex')
$$;

CREATE OR REPLACE FUNCTION evidence.capital_exact_keys(
  requested_value jsonb,
  requested_keys text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT jsonb_typeof(requested_value) = 'object'
    AND coalesce((
      SELECT array_agg(key ORDER BY key COLLATE "C")
      FROM jsonb_object_keys(requested_value) key
    ), ARRAY[]::text[]) = coalesce((
      SELECT array_agg(key ORDER BY key COLLATE "C")
      FROM unnest(requested_keys) key
    ), ARRAY[]::text[])
$$;

CREATE OR REPLACE FUNCTION evidence.capital_valid_research_text(
  requested_value text,
  requested_maximum integer DEFAULT 2000
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT requested_value IS NOT NULL
    AND requested_maximum BETWEEN 1 AND 10000
    AND requested_value = btrim(requested_value)
    AND length(requested_value) BETWEEN 1 AND requested_maximum
    AND requested_value !~* '(^|[[:space:]])(buy|sell|hold|invest|allocate)([[:space:]]|$)'
    AND requested_value !~* '\mrecommend(s|ed|ing|ation)?\M'
    AND requested_value !~* '\myou[[:space:]]+(should|must|ought[[:space:]]+to)\M'
    AND requested_value !~* '\m(should|must)[[:space:]]+(buy|sell|invest|allocate)\M'
    AND requested_value !~* '\m(target|recommended)[[:space:]]+(allocation|portfolio[[:space:]]+weight)\M'
    AND requested_value !~* '\mguaranteed[[:space:]]+returns?\M'
$$;

CREATE OR REPLACE FUNCTION evidence.capital_valid_decimal(
  requested_value text,
  requested_minimum numeric,
  requested_maximum numeric
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  parsed numeric;
  fraction text;
BEGIN
  IF requested_value IS NULL OR length(requested_value) > 32
    OR requested_value = '-0'
    OR requested_value !~ '^-?(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$'
  THEN
    RETURN false;
  END IF;
  fraction := split_part(requested_value, '.', 2);
  IF length(fraction) > 12 THEN RETURN false; END IF;
  parsed := requested_value::numeric;
  RETURN parsed BETWEEN requested_minimum AND requested_maximum;
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
  RETURN false;
END
$$;

CREATE OR REPLACE FUNCTION evidence.capital_valid_decimal_json(
  requested_value jsonb,
  requested_minimum numeric,
  requested_maximum numeric
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, evidence
AS $$
  SELECT requested_value IS NOT NULL
    AND jsonb_typeof(requested_value) = 'string'
    AND evidence.capital_valid_decimal(
      requested_value #>> '{}', requested_minimum, requested_maximum
    )
$$;

CREATE OR REPLACE FUNCTION evidence.capital_decimal_text(requested_value numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
  rendered text := requested_value::text;
BEGIN
  IF requested_value = 0 THEN RETURN '0'; END IF;
  IF strpos(rendered, '.') > 0 THEN
    rendered := rtrim(rtrim(rendered, '0'), '.');
  END IF;
  RETURN rendered;
END
$$;

CREATE OR REPLACE FUNCTION evidence.capital_multiply_decimal(
  requested_left text,
  requested_right text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, evidence
AS $$
  SELECT evidence.capital_decimal_text(round(
    requested_left::numeric * requested_right::numeric, 12
  ))
$$;

CREATE OR REPLACE FUNCTION evidence.capital_weighted_decimal(
  requested_left text,
  requested_left_weight text,
  requested_right text,
  requested_right_weight text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, evidence
AS $$
  SELECT evidence.capital_decimal_text(round(
    requested_left::numeric * requested_left_weight::numeric
      + requested_right::numeric * requested_right_weight::numeric,
    12
  ))
$$;

CREATE OR REPLACE FUNCTION evidence.capital_valid_iso_instant(requested_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  parsed timestamptz;
BEGIN
  IF requested_value IS NULL OR requested_value !~
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,3})?Z$'
  THEN
    RETURN false;
  END IF;
  parsed := requested_value::timestamptz;
  RETURN isfinite(parsed);
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
  RETURN false;
END
$$;

CREATE OR REPLACE FUNCTION evidence.capital_iso_instant(requested_value timestamptz)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
  base text;
  millis text;
  rendered text;
BEGIN
  IF date_trunc('milliseconds', requested_value) IS DISTINCT FROM requested_value THEN
    RAISE EXCEPTION 'capital-allocation instants require millisecond precision'
      USING ERRCODE = '23514';
  END IF;
  base := to_char(requested_value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS');
  millis := to_char(requested_value AT TIME ZONE 'UTC', 'MS');
  millis := rtrim(millis, '0');
  rendered := base || CASE WHEN millis = '' THEN '' ELSE '.' || millis END || 'Z';
  IF NOT evidence.capital_valid_iso_instant(rendered) THEN
    RAISE EXCEPTION 'capital-allocation instant is outside RFC 3339 package range'
      USING ERRCODE = '22008';
  END IF;
  RETURN rendered;
END
$$;

CREATE OR REPLACE FUNCTION evidence.capital_floor_millisecond(
  requested_value timestamptz
)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT date_trunc('milliseconds', requested_value)
$$;

CREATE OR REPLACE FUNCTION evidence.capital_ceiling_millisecond(
  requested_value timestamptz
)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN requested_value = date_trunc('milliseconds', requested_value)
      THEN requested_value
    ELSE date_trunc('milliseconds', requested_value) + interval '1 millisecond'
  END
$$;

CREATE OR REPLACE FUNCTION evidence.capital_valid_narratives(requested_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  element jsonb;
  item text;
  prior text;
  seen text[] := ARRAY[]::text[];
BEGIN
  IF requested_value IS NULL OR jsonb_typeof(requested_value) <> 'array'
    OR jsonb_array_length(requested_value) NOT BETWEEN 1 AND 100
    OR octet_length(requested_value::text) > 262144
  THEN
    RETURN false;
  END IF;
  FOR element IN SELECT value FROM jsonb_array_elements(requested_value) LOOP
    IF jsonb_typeof(element) <> 'string' THEN RETURN false; END IF;
    item := element#>>'{}';
    IF NOT evidence.capital_valid_research_text(item, 2000)
      OR item = ANY(seen)
      OR (prior IS NOT NULL AND item COLLATE "C" < prior COLLATE "C")
    THEN
      RETURN false;
    END IF;
    seen := array_append(seen, item);
    prior := item;
  END LOOP;
  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION evidence.capital_sort_narratives(requested_value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(value) ORDER BY value COLLATE "C"), '[]'::jsonb)
  FROM jsonb_array_elements_text(requested_value) value
$$;

CREATE OR REPLACE FUNCTION evidence.capital_valid_invalidation(requested_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  element jsonb;
  item_id text;
  prior text;
  seen text[] := ARRAY[]::text[];
BEGIN
  IF requested_value IS NULL OR jsonb_typeof(requested_value) <> 'array'
    OR jsonb_array_length(requested_value) NOT BETWEEN 1 AND 100
    OR octet_length(requested_value::text) > 262144
  THEN RETURN false; END IF;
  FOR element IN SELECT value FROM jsonb_array_elements(requested_value) LOOP
    IF NOT evidence.capital_exact_keys(element, ARRAY[
        'criterionId','description','indicatorKey','operator','threshold'
      ])
      OR jsonb_typeof(element->'criterionId') <> 'string'
      OR jsonb_typeof(element->'description') <> 'string'
      OR jsonb_typeof(element->'indicatorKey') <> 'string'
      OR jsonb_typeof(element->'operator') <> 'string'
      OR jsonb_typeof(element->'threshold') <> 'string'
      OR (element->>'criterionId') !~ '^[a-z][a-z0-9_.-]{0,127}$'
      OR (element->>'indicatorKey') !~ '^[a-z][a-z0-9_.-]{0,127}$'
      OR NOT evidence.capital_valid_research_text(element->>'description', 2000)
      OR (element->>'operator') NOT IN (
        'less_than','less_than_or_equal','greater_than',
        'greater_than_or_equal','equals','becomes_unavailable'
      )
      OR (element->>'threshold') <> btrim(element->>'threshold')
      OR length(element->>'threshold') NOT BETWEEN 1 AND 200
    THEN RETURN false; END IF;
    item_id := element->>'criterionId';
    IF item_id = ANY(seen)
      OR (prior IS NOT NULL AND item_id COLLATE "C" < prior COLLATE "C")
    THEN RETURN false; END IF;
    seen := array_append(seen, item_id);
    prior := item_id;
  END LOOP;
  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION evidence.capital_sort_invalidation(requested_value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT coalesce(jsonb_agg(value ORDER BY value->>'criterionId' COLLATE "C"), '[]'::jsonb)
  FROM jsonb_array_elements(requested_value) value
$$;

CREATE OR REPLACE FUNCTION evidence.capital_valid_scope(
  requested_value text[],
  requested_pattern text,
  requested_maximum integer
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  item text;
  prior text;
  seen text[] := ARRAY[]::text[];
BEGIN
  IF requested_value IS NULL OR cardinality(requested_value) NOT BETWEEN 1 AND requested_maximum
    OR array_ndims(requested_value) <> 1
  THEN RETURN false; END IF;
  FOREACH item IN ARRAY requested_value LOOP
    IF item IS NULL OR item !~ requested_pattern OR item = ANY(seen)
      OR (prior IS NOT NULL AND item COLLATE "C" < prior COLLATE "C")
    THEN RETURN false; END IF;
    seen := array_append(seen, item);
    prior := item;
  END LOOP;
  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION evidence.capital_candidate_status(requested_lifecycle text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN requested_lifecycle = 'research' THEN 'candidate'
    WHEN requested_lifecycle IN ('validated','approved','staged','production')
      THEN 'under_review'
    WHEN requested_lifecycle = 'retired' THEN 'retired'
    ELSE NULL
  END
$$;

CREATE TABLE evidence.capital_research_assessments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  country_id uuid NOT NULL REFERENCES evidence.geographies(id) ON DELETE RESTRICT,
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  strategy_key text NOT NULL CHECK (strategy_key ~ '^[a-z][a-z0-9_.-]{0,127}$'),
  point_in_time_policy text NOT NULL DEFAULT 'strict_system_and_knowledge_cutoff'
    CHECK (point_in_time_policy = 'strict_system_and_knowledge_cutoff'),
  as_of timestamptz NOT NULL CHECK (isfinite(as_of)),
  knowledge_cutoff timestamptz NOT NULL CHECK (isfinite(knowledge_cutoff)),
  system_cutoff timestamptz NOT NULL CHECK (isfinite(system_cutoff)),
  snapshot_id uuid NOT NULL REFERENCES evidence.dataset_snapshots(id) ON DELETE RESTRICT,
  snapshot_sha256 text NOT NULL CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  snapshot_recorded_at timestamptz NOT NULL CHECK (isfinite(snapshot_recorded_at)),
  data_vintage_id uuid NOT NULL REFERENCES evidence.dataset_snapshots(id) ON DELETE RESTRICT,
  data_vintage_sha256 text NOT NULL CHECK (data_vintage_sha256 ~ '^[0-9a-f]{64}$'),
  data_vintage_available_at timestamptz NOT NULL CHECK (isfinite(data_vintage_available_at)),
  model_artifact_id uuid NOT NULL,
  model_artifact_sha256 text NOT NULL CHECK (model_artifact_sha256 ~ '^[0-9a-f]{64}$'),
  model_version text NOT NULL CHECK (
    length(model_version) <= 128
    AND model_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
  ),
  candidate_model_status text NOT NULL CHECK (
    candidate_model_status IN ('candidate','under_review','retired')
  ),
  status_effective_at timestamptz NOT NULL CHECK (isfinite(status_effective_at)),
  lifecycle_event_id uuid NOT NULL,
  lifecycle_decision_sha256 text NOT NULL CHECK (lifecycle_decision_sha256 ~ '^[0-9a-f]{64}$'),
  country_scope text[] NOT NULL CHECK (
    evidence.capital_valid_scope(country_scope, '^[A-Z]{2}$', 250)
  ),
  strategy_scope text[] NOT NULL CHECK (
    evidence.capital_valid_scope(strategy_scope, '^[a-z][a-z0-9_.-]{0,127}$', 100)
  ),
  purpose text NOT NULL DEFAULT 'research_only' CHECK (purpose = 'research_only'),
  decision_use text NOT NULL DEFAULT 'prohibited' CHECK (decision_use = 'prohibited'),
  advice_status text NOT NULL DEFAULT 'not_investment_advice'
    CHECK (advice_status = 'not_investment_advice'),
  disclaimer text NOT NULL DEFAULT 'Research only; not investment advice.'
    CHECK (disclaimer = 'Research only; not investment advice.'),
  assumptions jsonb NOT NULL CHECK (evidence.capital_valid_narratives(assumptions)),
  limitations jsonb NOT NULL CHECK (evidence.capital_valid_narratives(limitations)),
  created_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL CHECK (isfinite(recorded_at)),
  header_manifest jsonb NOT NULL CHECK (jsonb_typeof(header_manifest) = 'object'),
  header_sha256 text NOT NULL CHECK (header_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, model_artifact_id, model_artifact_sha256)
    REFERENCES evidence.economic_state_model_artifacts(
      organization_id, workspace_id, id, artifact_sha256
    ) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, lifecycle_event_id)
    REFERENCES evidence.economic_state_model_lifecycle_events(
      organization_id, workspace_id, id
    ) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, id),
  UNIQUE (organization_id, workspace_id, id, model_artifact_id),
  CHECK (knowledge_cutoff <= as_of AND system_cutoff <= as_of),
  CHECK (snapshot_recorded_at <= system_cutoff),
  CHECK (data_vintage_available_at <= knowledge_cutoff),
  CHECK (status_effective_at <= as_of),
  CHECK (country_code = ANY(country_scope)),
  CHECK (strategy_key = ANY(strategy_scope))
);

CREATE TABLE evidence.capital_assessment_evidence_bindings (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  asset_class text NOT NULL,
  evidence_role text NOT NULL CHECK (evidence_role IN ('evidence','counter_evidence')),
  evidence_id uuid NOT NULL,
  evidence_kind text NOT NULL CHECK (
    evidence_kind IN ('observation','research','model_output','expert_judgment')
  ),
  source_key text NOT NULL CHECK (source_key ~ '^[a-z][a-z0-9_.-]{0,127}$'),
  summary text NOT NULL CHECK (evidence.capital_valid_research_text(summary, 2000)),
  maximum_age_days integer NOT NULL CHECK (maximum_age_days BETWEEN 1 AND 36500),
  source_kind text NOT NULL CHECK (source_kind IN (
    'canonical_admission','relationship_evidence','economic_state_run','crisis_forecast_slot'
  )),
  canonical_admission_id uuid REFERENCES evidence.canonical_admissions(id) ON DELETE RESTRICT,
  relationship_evidence_id uuid,
  economic_state_run_id uuid,
  crisis_forecast_slot_id uuid,
  observed_at timestamptz NOT NULL CHECK (isfinite(observed_at)),
  available_at timestamptz NOT NULL CHECK (isfinite(available_at)),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  freshness_age_seconds bigint NOT NULL CHECK (freshness_age_seconds >= 0),
  freshness_maximum_age_seconds bigint NOT NULL CHECK (freshness_maximum_age_seconds > 0),
  freshness_status text NOT NULL CHECK (freshness_status IN ('fresh','stale')),
  item_manifest jsonb NOT NULL CHECK (jsonb_typeof(item_manifest) = 'object'),
  binding_manifest jsonb NOT NULL CHECK (jsonb_typeof(binding_manifest) = 'object'),
  binding_sha256 text NOT NULL CHECK (binding_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL CHECK (isfinite(created_at)),
  FOREIGN KEY (organization_id, workspace_id, assessment_id)
    REFERENCES evidence.capital_research_assessments(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, relationship_evidence_id)
    REFERENCES evidence.relationship_evidence(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, economic_state_run_id)
    REFERENCES evidence.economic_state_runs(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, crisis_forecast_slot_id)
    REFERENCES evidence.crisis_forecast_slots(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, assessment_id, asset_class, evidence_id),
  UNIQUE NULLS NOT DISTINCT (
    organization_id, workspace_id, assessment_id, asset_class,
    source_kind, canonical_admission_id, relationship_evidence_id,
    economic_state_run_id, crisis_forecast_slot_id
  ),
  UNIQUE (organization_id, workspace_id, id),
  CHECK (asset_class IN (
    'cash','money_market','government_bonds','inflation_linked_bonds',
    'investment_grade_corporate_credit','high_yield_credit','equities','real_estate',
    'infrastructure','gold','silver','industrial_metals','agriculture','energy',
    'foreign_exchange','bitcoin','ethereum','private_credit'
  )),
  CHECK (available_at >= observed_at),
  CHECK (freshness_maximum_age_seconds = maximum_age_days::bigint * 86400),
  CHECK (freshness_status = CASE
    WHEN freshness_age_seconds <= freshness_maximum_age_seconds THEN 'fresh' ELSE 'stale' END
  ),
  CHECK (
    (source_kind = 'canonical_admission' AND canonical_admission_id IS NOT NULL
      AND relationship_evidence_id IS NULL AND economic_state_run_id IS NULL
      AND crisis_forecast_slot_id IS NULL AND evidence_kind = 'observation')
    OR (source_kind = 'relationship_evidence' AND relationship_evidence_id IS NOT NULL
      AND canonical_admission_id IS NULL AND economic_state_run_id IS NULL
      AND crisis_forecast_slot_id IS NULL AND evidence_kind IN ('research','expert_judgment'))
    OR (source_kind = 'economic_state_run' AND economic_state_run_id IS NOT NULL
      AND canonical_admission_id IS NULL AND relationship_evidence_id IS NULL
      AND crisis_forecast_slot_id IS NULL AND evidence_kind = 'model_output')
    OR (source_kind = 'crisis_forecast_slot' AND crisis_forecast_slot_id IS NOT NULL
      AND canonical_admission_id IS NULL AND relationship_evidence_id IS NULL
      AND economic_state_run_id IS NULL AND evidence_kind = 'model_output')
  )
);

CREATE TABLE evidence.capital_assessment_assets (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  asset_class text NOT NULL,
  macro_score_text text NOT NULL,
  valuation_status text NOT NULL CHECK (valuation_status IN ('available','unavailable')),
  valuation_score_text text,
  combined_status text NOT NULL CHECK (combined_status IN ('available','unavailable')),
  combined_score_text text,
  asset_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(asset_manifest) = 'object' AND octet_length(asset_manifest::text) <= 1048576
  ),
  asset_sha256 text NOT NULL CHECK (asset_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL CHECK (isfinite(created_at)),
  FOREIGN KEY (organization_id, workspace_id, assessment_id)
    REFERENCES evidence.capital_research_assessments(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, assessment_id, asset_class),
  UNIQUE (organization_id, workspace_id, id),
  CHECK (asset_class IN (
    'cash','money_market','government_bonds','inflation_linked_bonds',
    'investment_grade_corporate_credit','high_yield_credit','equities','real_estate',
    'infrastructure','gold','silver','industrial_metals','agriculture','energy',
    'foreign_exchange','bitcoin','ethereum','private_credit'
  )),
  CHECK (evidence.capital_valid_decimal(macro_score_text, -1, 1)),
  CHECK ((valuation_status = 'available') = (valuation_score_text IS NOT NULL)),
  CHECK ((combined_status = 'available') = (combined_score_text IS NOT NULL)),
  CHECK (valuation_score_text IS NULL OR evidence.capital_valid_decimal(valuation_score_text, -1, 1)),
  CHECK (combined_score_text IS NULL OR evidence.capital_valid_decimal(combined_score_text, -1, 1))
);

CREATE TABLE evidence.capital_assessment_completions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  asset_count integer NOT NULL CHECK (asset_count BETWEEN 1 AND 18),
  assessment_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(assessment_manifest) = 'object'
    AND octet_length(assessment_manifest::text) <= 4194304
  ),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  completed_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  completed_at timestamptz NOT NULL CHECK (isfinite(completed_at)),
  FOREIGN KEY (organization_id, workspace_id, assessment_id)
    REFERENCES evidence.capital_research_assessments(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, assessment_id),
  UNIQUE (organization_id, workspace_id, manifest_sha256),
  UNIQUE (organization_id, workspace_id, assessment_id, manifest_sha256),
  UNIQUE (organization_id, workspace_id, id)
);

CREATE TABLE evidence.capital_outcome_definitions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  version text NOT NULL CHECK (
    length(version) <= 128
    AND version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
  ),
  asset_class text NOT NULL,
  metric_key text NOT NULL CHECK (metric_key ~ '^[a-z][a-z0-9_.-]{0,127}$'),
  outcome_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(outcome_manifest) = 'object'
    AND octet_length(outcome_manifest::text) <= 1048576
  ),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  approved_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL CHECK (isfinite(approved_at)),
  recorded_at timestamptz NOT NULL CHECK (isfinite(recorded_at)),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, asset_class, metric_key, version),
  UNIQUE (organization_id, workspace_id, manifest_sha256),
  UNIQUE (organization_id, workspace_id, id, manifest_sha256),
  UNIQUE (organization_id, workspace_id, id),
  CHECK (asset_class IN (
    'cash','money_market','government_bonds','inflation_linked_bonds',
    'investment_grade_corporate_credit','high_yield_credit','equities','real_estate',
    'infrastructure','gold','silver','industrial_metals','agriculture','energy',
    'foreign_exchange','bitcoin','ethereum','private_credit'
  ))
);

CREATE TABLE evidence.capital_validation_plans (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('expanding_window','rolling_window')),
  model_artifact_id uuid NOT NULL,
  model_artifact_sha256 text NOT NULL CHECK (model_artifact_sha256 ~ '^[0-9a-f]{64}$'),
  model_version text NOT NULL CHECK (length(model_version) <= 128),
  candidate_model_status text NOT NULL CHECK (
    candidate_model_status IN ('candidate','under_review','retired')
  ),
  outcome_definition_id uuid NOT NULL,
  outcome_definition_sha256 text NOT NULL CHECK (outcome_definition_sha256 ~ '^[0-9a-f]{64}$'),
  plan_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(plan_manifest) = 'object' AND octet_length(plan_manifest::text) <= 2097152
  ),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL CHECK (isfinite(created_at)),
  FOREIGN KEY (organization_id, workspace_id, model_artifact_id, model_artifact_sha256)
    REFERENCES evidence.economic_state_model_artifacts(
      organization_id, workspace_id, id, artifact_sha256
    ) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, outcome_definition_id, outcome_definition_sha256)
    REFERENCES evidence.capital_outcome_definitions(
      organization_id, workspace_id, id, manifest_sha256
    ) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, manifest_sha256),
  UNIQUE (organization_id, workspace_id, id)
);

CREATE TABLE evidence.capital_validation_folds (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  validation_plan_id uuid NOT NULL,
  fold_ordinal integer NOT NULL CHECK (fold_ordinal BETWEEN 1 AND 100),
  fold_key text NOT NULL CHECK (fold_key ~ '^[a-z][a-z0-9_.-]{0,127}$'),
  training_start timestamptz NOT NULL CHECK (isfinite(training_start)),
  training_end timestamptz NOT NULL CHECK (isfinite(training_end)),
  calibration_start timestamptz NOT NULL CHECK (isfinite(calibration_start)),
  calibration_end timestamptz NOT NULL CHECK (isfinite(calibration_end)),
  test_start timestamptz NOT NULL CHECK (isfinite(test_start)),
  test_end timestamptz NOT NULL CHECK (isfinite(test_end)),
  embargo_days integer NOT NULL CHECK (embargo_days BETWEEN 0 AND 365),
  outcome_definition_locked_at timestamptz NOT NULL,
  feature_engineering_fit_through timestamptz NOT NULL,
  normalization_fit_through timestamptz NOT NULL,
  hyperparameter_selection_fit_through timestamptz NOT NULL,
  valuation_model_fit_through timestamptz NOT NULL,
  latest_training_label_available_at timestamptz NOT NULL,
  calibration_fit_through timestamptz NOT NULL,
  threshold_selection_fit_through timestamptz NOT NULL,
  fold_manifest jsonb NOT NULL CHECK (jsonb_typeof(fold_manifest) = 'object'),
  fold_sha256 text NOT NULL CHECK (fold_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id, validation_plan_id)
    REFERENCES evidence.capital_validation_plans(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, validation_plan_id, fold_ordinal),
  UNIQUE (organization_id, workspace_id, validation_plan_id, fold_key),
  UNIQUE (organization_id, workspace_id, id),
  CHECK (training_start < training_end AND training_end < calibration_start),
  CHECK (calibration_start < calibration_end AND calibration_end < test_start),
  CHECK (test_start < test_end)
);

CREATE TABLE evidence.capital_country_comparisons (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  asset_class text NOT NULL,
  strategy_key text NOT NULL CHECK (strategy_key ~ '^[a-z][a-z0-9_.-]{0,127}$'),
  reference_country_id uuid NOT NULL REFERENCES evidence.geographies(id) ON DELETE RESTRICT,
  country_count integer NOT NULL CHECK (country_count BETWEEN 2 AND 12),
  comparison_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(comparison_manifest) = 'object'
    AND octet_length(comparison_manifest::text) <= 2097152
  ),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL CHECK (isfinite(created_at)),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, manifest_sha256),
  UNIQUE (organization_id, workspace_id, id),
  CHECK (asset_class IN (
    'cash','money_market','government_bonds','inflation_linked_bonds',
    'investment_grade_corporate_credit','high_yield_credit','equities','real_estate',
    'infrastructure','gold','silver','industrial_metals','agriculture','energy',
    'foreign_exchange','bitcoin','ethereum','private_credit'
  ))
);

CREATE TABLE evidence.capital_country_comparison_items (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  comparison_id uuid NOT NULL,
  request_ordinal integer NOT NULL CHECK (request_ordinal BETWEEN 1 AND 12),
  country_id uuid NOT NULL REFERENCES evidence.geographies(id) ON DELETE RESTRICT,
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  assessment_id uuid,
  assessment_manifest_sha256 text CHECK (
    assessment_manifest_sha256 IS NULL OR assessment_manifest_sha256 ~ '^[0-9a-f]{64}$'
  ),
  comparison_status text NOT NULL CHECK (comparison_status IN ('comparable','incomparable')),
  reasons jsonb NOT NULL CHECK (
    jsonb_typeof(reasons) = 'array' AND jsonb_array_length(reasons) <= 8
  ),
  macro_suitability_text text,
  valuation_suitability_text text,
  combined_suitability_text text,
  item_manifest jsonb NOT NULL CHECK (jsonb_typeof(item_manifest) = 'object'),
  item_sha256 text NOT NULL CHECK (item_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id, comparison_id)
    REFERENCES evidence.capital_country_comparisons(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, assessment_id, assessment_manifest_sha256)
    REFERENCES evidence.capital_assessment_completions(
      organization_id, workspace_id, assessment_id, manifest_sha256
    ) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, comparison_id, request_ordinal),
  UNIQUE (organization_id, workspace_id, comparison_id, country_id),
  UNIQUE (organization_id, workspace_id, id),
  CHECK ((assessment_id IS NULL) = (assessment_manifest_sha256 IS NULL)),
  CHECK (
    (comparison_status = 'comparable'
      AND assessment_id IS NOT NULL AND jsonb_array_length(reasons) = 0
      AND macro_suitability_text IS NOT NULL
      AND valuation_suitability_text IS NOT NULL
      AND combined_suitability_text IS NOT NULL)
    OR (comparison_status = 'incomparable' AND jsonb_array_length(reasons) > 0
      AND macro_suitability_text IS NULL
      AND valuation_suitability_text IS NULL
      AND combined_suitability_text IS NULL)
  )
);

CREATE OR REPLACE FUNCTION evidence.capital_record_manifest(
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

CREATE OR REPLACE FUNCTION evidence.capital_set_manifest(
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
  WITH value AS (
    SELECT evidence.capital_record_manifest(
      requested_entity, requested_record, requested_manifest_field, requested_digest_field
    ) AS manifest
  )
  SELECT manifest, evidence.capital_json_digest(manifest) FROM value
$$;

CREATE OR REPLACE FUNCTION evidence.verify_capital_canonical_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  incoming jsonb := to_jsonb(NEW);
  expected_manifest jsonb;
  expected_sha text;
BEGIN
  expected_manifest := evidence.capital_record_manifest(
    TG_ARGV[0], incoming, TG_ARGV[1], TG_ARGV[2]
  );
  expected_sha := evidence.capital_json_digest(expected_manifest);
  IF incoming->TG_ARGV[1] IS DISTINCT FROM expected_manifest
    OR incoming->>TG_ARGV[2] IS DISTINCT FROM expected_sha
  THEN
    RAISE EXCEPTION '% is not a canonical capital-allocation record', TG_ARGV[0]
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION evidence.verify_capital_full_manifest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  incoming jsonb := to_jsonb(NEW);
  full_manifest jsonb := incoming->TG_ARGV[0];
  expected_sha text;
BEGIN
  expected_sha := evidence.capital_json_digest(full_manifest - 'manifestSha256');
  IF full_manifest->>'manifestSha256' IS DISTINCT FROM incoming->>TG_ARGV[1]
    OR incoming->>TG_ARGV[1] IS DISTINCT FROM expected_sha
    OR full_manifest->>TG_ARGV[2] IS DISTINCT FROM NEW.id::text
  THEN
    RAISE EXCEPTION '% manifest identity or digest is invalid', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION evidence.capital_workspace_role_internal(
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
  WHERE workspace_membership.organization_id = requested_organization_id
    AND workspace_membership.workspace_id = requested_workspace_id
    AND workspace_membership.subject_id = requested_subject_id
    AND workspace_membership.valid_from <= statement_timestamp()
    AND (workspace_membership.valid_until IS NULL
      OR workspace_membership.valid_until > statement_timestamp())
    AND organization_membership.valid_from <= statement_timestamp()
    AND (organization_membership.valid_until IS NULL
      OR organization_membership.valid_until > statement_timestamp())
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION evidence.capital_valid_uuid_array(requested_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  element jsonb;
  item text;
  seen text[] := ARRAY[]::text[];
BEGIN
  IF requested_value IS NULL OR jsonb_typeof(requested_value) <> 'array'
    OR jsonb_array_length(requested_value) NOT BETWEEN 1 AND 100
  THEN RETURN false; END IF;
  FOR element IN SELECT value FROM jsonb_array_elements(requested_value) LOOP
    IF jsonb_typeof(element) <> 'string' THEN RETURN false; END IF;
    item := element#>>'{}';
    IF item !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR item = ANY(seen)
    THEN RETURN false; END IF;
    seen := array_append(seen, item);
  END LOOP;
  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION evidence.capital_valid_uncertainty(
  requested_value jsonb,
  requested_score text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, evidence
AS $$
  SELECT evidence.capital_exact_keys(
      requested_value, ARRAY['lower','upper','confidenceLevel','method']
    )
    AND evidence.capital_valid_decimal_json(requested_value->'lower', -1, 1)
    AND evidence.capital_valid_decimal_json(requested_value->'upper', -1, 1)
    AND evidence.capital_valid_decimal_json(requested_value->'confidenceLevel', 0, 1)
    AND jsonb_typeof(requested_value->'method') = 'string'
    AND requested_value->>'method' = btrim(requested_value->>'method')
    AND length(requested_value->>'method') BETWEEN 1 AND 200
    AND (requested_value->>'lower')::numeric <= requested_score::numeric
    AND requested_score::numeric <= (requested_value->>'upper')::numeric
$$;

CREATE OR REPLACE FUNCTION evidence.capital_asset_evidence_group_valid(
  requested_organization_id uuid,
  requested_workspace_id uuid,
  requested_assessment_id uuid,
  requested_asset_class text,
  requested_role text,
  requested_group jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  expected_items jsonb;
  requested_items jsonb;
  absence jsonb;
BEGIN
  IF NOT evidence.capital_exact_keys(requested_group, ARRAY['items','absenceReason'])
    OR jsonb_typeof(requested_group->'items') <> 'array'
    OR jsonb_array_length(requested_group->'items') > 100
  THEN RETURN false; END IF;
  requested_items := requested_group->'items';
  SELECT coalesce(jsonb_agg(binding.item_manifest ORDER BY binding.evidence_id::text), '[]'::jsonb)
    INTO expected_items
  FROM evidence.capital_assessment_evidence_bindings binding
  WHERE binding.organization_id = requested_organization_id
    AND binding.workspace_id = requested_workspace_id
    AND binding.assessment_id = requested_assessment_id
    AND binding.asset_class = requested_asset_class
    AND binding.evidence_role = requested_role;
  IF requested_items IS DISTINCT FROM expected_items THEN RETURN false; END IF;
  absence := requested_group->'absenceReason';
  IF jsonb_array_length(requested_items) = 0 THEN
    RETURN jsonb_typeof(absence) = 'string'
      AND evidence.capital_valid_research_text(absence#>>'{}', 2000);
  END IF;
  RETURN jsonb_typeof(absence) = 'null';
END
$$;

CREATE OR REPLACE FUNCTION evidence.capital_asset_ordinal(requested_asset_class text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT array_position(ARRAY[
    'cash','money_market','government_bonds','inflation_linked_bonds',
    'investment_grade_corporate_credit','high_yield_credit','equities','real_estate',
    'infrastructure','gold','silver','industrial_metals','agriculture','energy',
    'foreign_exchange','bitcoin','ethereum','private_credit'
  ], requested_asset_class)
$$;

CREATE OR REPLACE FUNCTION evidence.verify_capital_assessment_asset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  value jsonb := NEW.asset_manifest;
  decision jsonb;
  contribution jsonb;
  valuation jsonb;
  combined jsonb;
  policy jsonb;
  presentation jsonb;
  item jsonb;
  ordinal bigint;
  evidence_id_text text;
  dimensions text[] := ARRAY[
    'access','liquidity','currency','crisis','contagion',
    'human_sustainability','tail_risk','drawdown','historical_analog'
  ];
  prior_key text;
  weight_sum numeric;
  contribution_sum numeric;
  expected_text text;
  valuation_score text;
  macro_score text;
BEGIN
  IF octet_length(value::text) > 1048576
    OR NOT evidence.capital_exact_keys(value, ARRAY[
      'assetClass','decisionInputs','macroSuitability','valuationSuitability',
      'combinedSuitability','combinationPolicy','evidence','counterEvidence',
      'assumptions','limitations','invalidationCriteria','presentationStatistic'
    ])
    OR value->>'assetClass' IS DISTINCT FROM NEW.asset_class
    OR evidence.capital_json_digest(value) IS DISTINCT FROM NEW.asset_sha256
    OR jsonb_typeof(value->'decisionInputs') <> 'array'
    OR jsonb_array_length(value->'decisionInputs') <> 9
  THEN
    RAISE EXCEPTION 'capital assessment asset shape or digest is invalid'
      USING ERRCODE = '23514';
  END IF;

  FOR decision, ordinal IN
    SELECT element, position
    FROM jsonb_array_elements(value->'decisionInputs') WITH ORDINALITY input(element, position)
  LOOP
    IF NOT evidence.capital_exact_keys(
        decision, ARRAY['dimension','value','uncertainty','evidenceIds','rationale']
      )
      OR decision->>'dimension' IS DISTINCT FROM dimensions[ordinal]
      OR NOT evidence.capital_valid_decimal_json(decision->'value', -1, 1)
      OR NOT evidence.capital_valid_decimal_json(decision->'uncertainty', 0, 1)
      OR NOT evidence.capital_valid_uuid_array(decision->'evidenceIds')
      OR jsonb_typeof(decision->'rationale') <> 'string'
      OR NOT evidence.capital_valid_research_text(decision->>'rationale', 2000)
    THEN
      RAISE EXCEPTION 'capital macro decision input is malformed or incomplete'
        USING ERRCODE = '23514';
    END IF;
    FOR evidence_id_text IN SELECT jsonb_array_elements_text(decision->'evidenceIds') LOOP
      IF NOT EXISTS (
        SELECT 1 FROM evidence.capital_assessment_evidence_bindings binding
        WHERE binding.organization_id = NEW.organization_id
          AND binding.workspace_id = NEW.workspace_id
          AND binding.assessment_id = NEW.assessment_id
          AND binding.asset_class = NEW.asset_class
          AND binding.evidence_id = evidence_id_text::uuid
      ) THEN
        RAISE EXCEPTION 'capital decision input references unknown evidence'
          USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END LOOP;

  macro_score := value#>>'{macroSuitability,score}';
  IF NOT evidence.capital_exact_keys(
      value->'macroSuitability',
      ARRAY['status','score','uncertainty','componentContributions']
    )
    OR value#>>'{macroSuitability,status}' <> 'available'
    OR NOT evidence.capital_valid_decimal_json(value#>'{macroSuitability,score}', -1, 1)
    OR NOT evidence.capital_valid_uncertainty(
      value#>'{macroSuitability,uncertainty}', macro_score
    )
    OR jsonb_typeof(value#>'{macroSuitability,componentContributions}') <> 'array'
    OR jsonb_array_length(value#>'{macroSuitability,componentContributions}') <> 9
  THEN
    RAISE EXCEPTION 'capital macro suitability is malformed' USING ERRCODE = '23514';
  END IF;
  weight_sum := 0;
  contribution_sum := 0;
  FOR contribution, ordinal IN
    SELECT element, position FROM jsonb_array_elements(
      value#>'{macroSuitability,componentContributions}'
    ) WITH ORDINALITY component(element, position)
  LOOP
    decision := (value->'decisionInputs')->((ordinal - 1)::integer);
    IF NOT evidence.capital_exact_keys(
        contribution, ARRAY['componentKey','inputValue','weight','contribution']
      )
      OR contribution->>'componentKey' IS DISTINCT FROM dimensions[ordinal]
      OR contribution->>'inputValue' IS DISTINCT FROM decision->>'value'
      OR NOT evidence.capital_valid_decimal_json(contribution->'inputValue', -1, 1)
      OR NOT evidence.capital_valid_decimal_json(contribution->'weight', 0, 1)
      OR NOT evidence.capital_valid_decimal_json(contribution->'contribution', -1, 1)
      OR contribution->>'contribution' IS DISTINCT FROM evidence.capital_multiply_decimal(
        contribution->>'inputValue', contribution->>'weight'
      )
    THEN
      RAISE EXCEPTION 'capital macro contribution is not reproducible'
        USING ERRCODE = '23514';
    END IF;
    weight_sum := weight_sum + (contribution->>'weight')::numeric;
    contribution_sum := contribution_sum + (contribution->>'contribution')::numeric;
  END LOOP;
  IF weight_sum <> 1
    OR evidence.capital_decimal_text(contribution_sum) IS DISTINCT FROM macro_score
    OR NEW.macro_score_text IS DISTINCT FROM macro_score
  THEN
    RAISE EXCEPTION 'capital macro weights or score do not equal contributions'
      USING ERRCODE = '23514';
  END IF;

  valuation := value->'valuationSuitability';
  IF valuation->>'status' = 'available' THEN
    valuation_score := valuation->>'score';
    IF NOT evidence.capital_exact_keys(
        valuation, ARRAY['status','score','uncertainty','componentContributions']
      )
      OR NOT evidence.capital_valid_decimal_json(valuation->'score', -1, 1)
      OR NOT evidence.capital_valid_uncertainty(valuation->'uncertainty', valuation_score)
      OR jsonb_typeof(valuation->'componentContributions') <> 'array'
      OR jsonb_array_length(valuation->'componentContributions') NOT BETWEEN 1 AND 100
    THEN
      RAISE EXCEPTION 'available valuation suitability is malformed'
        USING ERRCODE = '23514';
    END IF;
    weight_sum := 0;
    contribution_sum := 0;
    prior_key := NULL;
    FOR contribution IN SELECT element FROM jsonb_array_elements(
      valuation->'componentContributions'
    ) component(element) LOOP
      IF NOT evidence.capital_exact_keys(
          contribution, ARRAY['componentKey','inputValue','weight','contribution']
        )
        OR (contribution->>'componentKey') !~ '^[a-z][a-z0-9_.-]{0,127}$'
        OR (prior_key IS NOT NULL
          AND contribution->>'componentKey' COLLATE "C" <= prior_key COLLATE "C")
        OR NOT evidence.capital_valid_decimal_json(contribution->'inputValue', -1, 1)
        OR NOT evidence.capital_valid_decimal_json(contribution->'weight', 0, 1)
        OR NOT evidence.capital_valid_decimal_json(contribution->'contribution', -1, 1)
        OR contribution->>'contribution' IS DISTINCT FROM evidence.capital_multiply_decimal(
          contribution->>'inputValue', contribution->>'weight'
        )
      THEN
        RAISE EXCEPTION 'valuation contribution is not canonical or reproducible'
          USING ERRCODE = '23514';
      END IF;
      prior_key := contribution->>'componentKey';
      weight_sum := weight_sum + (contribution->>'weight')::numeric;
      contribution_sum := contribution_sum + (contribution->>'contribution')::numeric;
    END LOOP;
    IF weight_sum <> 1
      OR evidence.capital_decimal_text(contribution_sum) IS DISTINCT FROM valuation_score
    THEN
      RAISE EXCEPTION 'valuation weights or score do not equal contributions'
        USING ERRCODE = '23514';
    END IF;
  ELSIF valuation->>'status' = 'unavailable' THEN
    IF NOT evidence.capital_exact_keys(
        valuation,
        ARRAY['status','score','uncertainty','componentContributions','reasonCode','explanation']
      )
      OR jsonb_typeof(valuation->'score') <> 'null'
      OR jsonb_typeof(valuation->'uncertainty') <> 'null'
      OR valuation->'componentContributions' <> '[]'::jsonb
      OR valuation->>'reasonCode' NOT IN (
        'missing_data','stale_data','unsupported_asset','market_dislocation',
        'method_not_applicable'
      )
      OR jsonb_typeof(valuation->'explanation') <> 'string'
      OR NOT evidence.capital_valid_research_text(valuation->>'explanation', 2000)
    THEN
      RAISE EXCEPTION 'unavailable valuation must remain explicit and scoreless'
        USING ERRCODE = '23514';
    END IF;
    valuation_score := NULL;
  ELSE
    RAISE EXCEPTION 'valuation status is invalid' USING ERRCODE = '23514';
  END IF;
  IF NEW.valuation_status IS DISTINCT FROM valuation->>'status'
    OR NEW.valuation_score_text IS DISTINCT FROM valuation_score
  THEN
    RAISE EXCEPTION 'valuation index columns differ from the canonical asset'
      USING ERRCODE = '23514';
  END IF;

  policy := value->'combinationPolicy';
  IF NOT evidence.capital_exact_keys(policy, ARRAY['method','macroWeight','valuationWeight'])
    OR policy->>'method' <> 'weighted_linear'
    OR NOT evidence.capital_valid_decimal_json(policy->'macroWeight', 0, 1)
    OR NOT evidence.capital_valid_decimal_json(policy->'valuationWeight', 0, 1)
    OR (policy->>'macroWeight')::numeric + (policy->>'valuationWeight')::numeric <> 1
  THEN
    RAISE EXCEPTION 'capital combination policy is invalid' USING ERRCODE = '23514';
  END IF;

  combined := value->'combinedSuitability';
  IF valuation->>'status' = 'available' THEN
    IF NOT evidence.capital_exact_keys(
        combined, ARRAY[
          'status','score','uncertainty','componentContributions',
          'method','macroWeight','valuationWeight'
        ]
      )
      OR combined->>'status' <> 'available'
      OR combined->>'method' <> 'weighted_linear'
      OR NOT evidence.capital_valid_decimal_json(combined->'score', -1, 1)
      OR NOT evidence.capital_valid_decimal_json(combined->'macroWeight', 0, 1)
      OR NOT evidence.capital_valid_decimal_json(combined->'valuationWeight', 0, 1)
      OR combined->>'macroWeight' IS DISTINCT FROM policy->>'macroWeight'
      OR combined->>'valuationWeight' IS DISTINCT FROM policy->>'valuationWeight'
      OR combined->>'score' IS DISTINCT FROM evidence.capital_weighted_decimal(
        macro_score, policy->>'macroWeight', valuation_score, policy->>'valuationWeight'
      )
      OR NOT evidence.capital_valid_uncertainty(
        combined->'uncertainty', combined->>'score'
      )
      OR combined#>>'{uncertainty,lower}' IS DISTINCT FROM evidence.capital_weighted_decimal(
        value#>>'{macroSuitability,uncertainty,lower}', policy->>'macroWeight',
        valuation#>>'{uncertainty,lower}', policy->>'valuationWeight'
      )
      OR combined#>>'{uncertainty,upper}' IS DISTINCT FROM evidence.capital_weighted_decimal(
        value#>>'{macroSuitability,uncertainty,upper}', policy->>'macroWeight',
        valuation#>>'{uncertainty,upper}', policy->>'valuationWeight'
      )
      OR combined#>>'{uncertainty,confidenceLevel}' IS DISTINCT FROM (CASE
        WHEN (value#>>'{macroSuitability,uncertainty,confidenceLevel}')::numeric
          <= (valuation#>>'{uncertainty,confidenceLevel}')::numeric
        THEN value#>>'{macroSuitability,uncertainty,confidenceLevel}'
        ELSE valuation#>>'{uncertainty,confidenceLevel}' END)
      OR combined#>>'{uncertainty,method}' <> 'weighted_component_intervals'
      OR jsonb_typeof(combined->'componentContributions') <> 'array'
      OR jsonb_array_length(combined->'componentContributions') <> 2
    THEN
      RAISE EXCEPTION 'combined suitability is not reproducible'
        USING ERRCODE = '23514';
    END IF;
    contribution := (combined->'componentContributions')->0;
    IF NOT evidence.capital_exact_keys(
        contribution, ARRAY['componentKey','inputValue','weight','contribution']
      )
      OR contribution->>'componentKey' <> 'macro_suitability'
      OR NOT evidence.capital_valid_decimal_json(contribution->'inputValue', -1, 1)
      OR NOT evidence.capital_valid_decimal_json(contribution->'weight', 0, 1)
      OR NOT evidence.capital_valid_decimal_json(contribution->'contribution', -1, 1)
      OR contribution->>'inputValue' IS DISTINCT FROM macro_score
      OR contribution->>'weight' IS DISTINCT FROM policy->>'macroWeight'
      OR contribution->>'contribution' IS DISTINCT FROM evidence.capital_multiply_decimal(
        macro_score, policy->>'macroWeight'
      )
    THEN RAISE EXCEPTION 'combined macro contribution is invalid' USING ERRCODE = '23514';
    END IF;
    contribution := (combined->'componentContributions')->1;
    IF NOT evidence.capital_exact_keys(
        contribution, ARRAY['componentKey','inputValue','weight','contribution']
      )
      OR contribution->>'componentKey' <> 'valuation_suitability'
      OR NOT evidence.capital_valid_decimal_json(contribution->'inputValue', -1, 1)
      OR NOT evidence.capital_valid_decimal_json(contribution->'weight', 0, 1)
      OR NOT evidence.capital_valid_decimal_json(contribution->'contribution', -1, 1)
      OR contribution->>'inputValue' IS DISTINCT FROM valuation_score
      OR contribution->>'weight' IS DISTINCT FROM policy->>'valuationWeight'
      OR contribution->>'contribution' IS DISTINCT FROM evidence.capital_multiply_decimal(
        valuation_score, policy->>'valuationWeight'
      )
    THEN RAISE EXCEPTION 'combined valuation contribution is invalid' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NOT evidence.capital_exact_keys(
        combined, ARRAY[
          'status','score','uncertainty','componentContributions','reasonCode',
          'explanation','method','macroWeight','valuationWeight'
        ]
      )
      OR combined->>'status' <> 'unavailable'
      OR jsonb_typeof(combined->'score') <> 'null'
      OR jsonb_typeof(combined->'uncertainty') <> 'null'
      OR combined->'componentContributions' <> '[]'::jsonb
      OR combined->>'reasonCode' <> 'valuation_unavailable'
      OR combined->>'explanation'
        <> 'Combined suitability is unavailable because valuation suitability is unavailable.'
      OR combined->>'method' <> 'weighted_linear'
      OR combined->>'macroWeight' IS DISTINCT FROM policy->>'macroWeight'
      OR combined->>'valuationWeight' IS DISTINCT FROM policy->>'valuationWeight'
    THEN
      RAISE EXCEPTION 'unavailable combined suitability cannot synthesize a score'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.combined_status IS DISTINCT FROM combined->>'status'
    OR NEW.combined_score_text IS DISTINCT FROM (CASE
      WHEN combined->>'status' = 'available' THEN combined->>'score' ELSE NULL END)
  THEN
    RAISE EXCEPTION 'combined index columns differ from the canonical asset'
      USING ERRCODE = '23514';
  END IF;

  IF NOT evidence.capital_asset_evidence_group_valid(
      NEW.organization_id, NEW.workspace_id, NEW.assessment_id,
      NEW.asset_class, 'evidence', value->'evidence'
    )
    OR NOT evidence.capital_asset_evidence_group_valid(
      NEW.organization_id, NEW.workspace_id, NEW.assessment_id,
      NEW.asset_class, 'counter_evidence', value->'counterEvidence'
    )
    OR NOT evidence.capital_valid_narratives(value->'assumptions')
    OR NOT evidence.capital_valid_narratives(value->'limitations')
    OR NOT evidence.capital_valid_invalidation(value->'invalidationCriteria')
  THEN
    RAISE EXCEPTION 'capital evidence, assumptions, limitations, or invalidation is invalid'
      USING ERRCODE = '23514';
  END IF;

  presentation := value->'presentationStatistic';
  IF jsonb_typeof(presentation) <> 'null' THEN
    IF combined->>'status' <> 'available'
      OR NOT evidence.capital_exact_keys(presentation, ARRAY[
        'label','method','basedOnCombinedSuitability','target','confidenceWeight','value'
      ])
      OR presentation->>'label' <> 'display_only_not_a_validated_score'
      OR presentation->>'method' <> 'linear_confidence_shrinkage'
      OR presentation->>'basedOnCombinedSuitability' IS DISTINCT FROM combined->>'score'
      OR NOT evidence.capital_valid_decimal_json(presentation->'basedOnCombinedSuitability', -1, 1)
      OR NOT evidence.capital_valid_decimal_json(presentation->'target', -1, 1)
      OR NOT evidence.capital_valid_decimal_json(presentation->'confidenceWeight', 0, 1)
      OR NOT evidence.capital_valid_decimal_json(presentation->'value', -1, 1)
      OR presentation->>'value' IS DISTINCT FROM evidence.capital_weighted_decimal(
        combined->>'score', presentation->>'confidenceWeight',
        presentation->>'target', evidence.capital_decimal_text(
          1 - (presentation->>'confidenceWeight')::numeric
        )
      )
    THEN
      RAISE EXCEPTION 'display-only presentation statistic is invalid'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION evidence.capital_assessment_body(requested_assessment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  assessment evidence.capital_research_assessments%ROWTYPE;
  assets jsonb;
BEGIN
  SELECT * INTO STRICT assessment
  FROM evidence.capital_research_assessments candidate
  WHERE candidate.id = requested_assessment_id;
  SELECT coalesce(jsonb_agg(asset.asset_manifest ORDER BY
      evidence.capital_asset_ordinal(asset.asset_class)), '[]'::jsonb)
    INTO assets
  FROM evidence.capital_assessment_assets asset
  WHERE asset.organization_id = assessment.organization_id
    AND asset.workspace_id = assessment.workspace_id
    AND asset.assessment_id = assessment.id;
  RETURN jsonb_build_object(
    'schemaVersion', 1,
    'manifestId', assessment.id::text,
    'semantics', jsonb_build_object(
      'purpose', assessment.purpose,
      'decisionUse', assessment.decision_use,
      'adviceStatus', assessment.advice_status,
      'disclaimer', assessment.disclaimer
    ),
    'pointInTime', jsonb_build_object(
      'policy', assessment.point_in_time_policy,
      'asOf', evidence.capital_iso_instant(assessment.as_of),
      'knowledgeCutoff', evidence.capital_iso_instant(assessment.knowledge_cutoff),
      'systemCutoff', evidence.capital_iso_instant(assessment.system_cutoff),
      'snapshotId', assessment.snapshot_id::text,
      'snapshotSha256', assessment.snapshot_sha256,
      'snapshotRecordedAt', evidence.capital_iso_instant(assessment.snapshot_recorded_at),
      'dataVintageId', assessment.data_vintage_id::text,
      'dataVintageSha256', assessment.data_vintage_sha256,
      'dataVintageAvailableAt',
        evidence.capital_iso_instant(assessment.data_vintage_available_at)
    ),
    'model', jsonb_build_object(
      'kind', 'candidate_model',
      'modelId', assessment.model_artifact_id::text,
      'version', assessment.model_version,
      'artifactSha256', assessment.model_artifact_sha256,
      'status', assessment.candidate_model_status,
      'statusEffectiveAt', evidence.capital_iso_instant(assessment.status_effective_at),
      'countryScope', to_jsonb(assessment.country_scope),
      'strategyScope', to_jsonb(assessment.strategy_scope)
    ),
    'country', jsonb_build_object(
      'countryId', assessment.country_id::text,
      'countryCode', assessment.country_code
    ),
    'strategyKey', assessment.strategy_key,
    'assets', assets,
    'assumptions', assessment.assumptions,
    'limitations', assessment.limitations
  );
END
$$;

CREATE OR REPLACE FUNCTION evidence.verify_capital_assessment_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  expected_body jsonb;
  expected_sha text;
  expected_full jsonb;
  actual_count integer;
BEGIN
  expected_body := evidence.capital_assessment_body(NEW.assessment_id);
  expected_sha := evidence.capital_json_digest(expected_body);
  expected_full := expected_body || jsonb_build_object('manifestSha256', expected_sha);
  SELECT count(*) INTO actual_count
  FROM evidence.capital_assessment_assets asset
  WHERE asset.organization_id = NEW.organization_id
    AND asset.workspace_id = NEW.workspace_id
    AND asset.assessment_id = NEW.assessment_id;
  IF NEW.asset_count <> actual_count
    OR NEW.assessment_manifest IS DISTINCT FROM expected_full
    OR NEW.manifest_sha256 IS DISTINCT FROM expected_sha
  THEN
    RAISE EXCEPTION 'capital assessment completion is not canonical'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION evidence.capital_assessment_currently_servable_internal(
  requested_organization_id uuid,
  requested_workspace_id uuid,
  requested_assessment_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
  SELECT coalesce((
    SELECT
      completion.id IS NOT NULL
      AND coalesce(evidence.economic_state_artifact_status_internal(
        assessment.organization_id, assessment.workspace_id,
        assessment.model_artifact_id, statement_timestamp(), statement_timestamp()
      ) IN ('research','validated','approved','staged','production'), false)
      AND NOT EXISTS (
        SELECT 1
        FROM evidence.capital_assessment_evidence_bindings binding
        LEFT JOIN evidence.canonical_admission_evidence_sets admission_evidence
          ON admission_evidence.admission_id = binding.canonical_admission_id
        WHERE binding.organization_id = assessment.organization_id
          AND binding.workspace_id = assessment.workspace_id
          AND binding.assessment_id = assessment.id
          AND binding.source_kind = 'canonical_admission'
          AND NOT coalesce(evidence.source_action_is_currently_admitted(
            admission_evidence.source_id, admission_evidence.source_dataset_id,
            admission_evidence.license_review_id, 'api'
          ), false)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM evidence.capital_assessment_evidence_bindings binding
        JOIN evidence.relationship_evidence item
          ON item.organization_id = binding.organization_id
          AND item.workspace_id = binding.workspace_id
          AND item.id = binding.relationship_evidence_id
        WHERE binding.organization_id = assessment.organization_id
          AND binding.workspace_id = assessment.workspace_id
          AND binding.assessment_id = assessment.id
          AND binding.source_kind = 'relationship_evidence'
          AND (
            item.valid_from > statement_timestamp()
            OR (item.valid_until IS NOT NULL AND item.valid_until <= statement_timestamp())
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM evidence.capital_assessment_evidence_bindings binding
        WHERE binding.organization_id = assessment.organization_id
          AND binding.workspace_id = assessment.workspace_id
          AND binding.assessment_id = assessment.id
          AND binding.source_kind = 'economic_state_run'
          AND NOT coalesce(evidence.economic_state_run_is_currently_servable(
            binding.economic_state_run_id, 'api'
          ), false)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM evidence.capital_assessment_evidence_bindings binding
        JOIN evidence.crisis_forecast_slots slot
          ON slot.organization_id = binding.organization_id
          AND slot.workspace_id = binding.workspace_id
          AND slot.id = binding.crisis_forecast_slot_id
        WHERE binding.organization_id = assessment.organization_id
          AND binding.workspace_id = assessment.workspace_id
          AND binding.assessment_id = assessment.id
          AND binding.source_kind = 'crisis_forecast_slot'
          AND NOT coalesce(
            evidence.crisis_forecast_run_is_currently_servable_internal(
              slot.organization_id, slot.workspace_id, slot.run_id
            ), false
          )
      )
    FROM evidence.capital_research_assessments assessment
    LEFT JOIN evidence.capital_assessment_completions completion
      ON completion.organization_id = assessment.organization_id
      AND completion.workspace_id = assessment.workspace_id
      AND completion.assessment_id = assessment.id
    WHERE assessment.organization_id = requested_organization_id
      AND assessment.workspace_id = requested_workspace_id
      AND assessment.id = requested_assessment_id
  ), false)
$$;

CREATE OR REPLACE FUNCTION evidence.prepare_capital_research_assessment(
  requested_assessment_id uuid,
  requested_workspace_id uuid,
  requested_country_id uuid,
  requested_country_code text,
  requested_strategy_key text,
  requested_as_of timestamptz,
  requested_knowledge_cutoff timestamptz,
  requested_system_cutoff timestamptz,
  requested_snapshot_id uuid,
  requested_data_vintage_id uuid,
  requested_model_artifact_id uuid,
  requested_candidate_status text,
  requested_country_scope text[],
  requested_strategy_scope text[],
  requested_assumptions jsonb,
  requested_limitations jsonb
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
  country evidence.geographies%ROWTYPE;
  snapshot evidence.dataset_snapshots%ROWTYPE;
  vintage evidence.dataset_snapshots%ROWTYPE;
  artifact evidence.economic_state_model_artifacts%ROWTYPE;
  lifecycle evidence.economic_state_model_lifecycle_events%ROWTYPE;
  current_status text;
  normalized_country_scope text[];
  normalized_strategy_scope text[];
  normalized_assumptions jsonb;
  normalized_limitations jsonb;
  existing evidence.capital_research_assessments%ROWTYPE;
  item evidence.capital_research_assessments%ROWTYPE;
BEGIN
  IF requested_assessment_id IS NULL OR requested_workspace_id IS NULL
    OR requested_country_id IS NULL OR requested_country_code IS NULL
    OR requested_strategy_key IS NULL OR requested_as_of IS NULL
    OR requested_knowledge_cutoff IS NULL OR requested_system_cutoff IS NULL
    OR requested_snapshot_id IS NULL OR requested_data_vintage_id IS NULL
    OR requested_model_artifact_id IS NULL OR requested_candidate_status IS NULL
    OR requested_country_scope IS NULL OR requested_strategy_scope IS NULL
    OR requested_assumptions IS NULL OR requested_limitations IS NULL
    OR NOT isfinite(requested_as_of) OR NOT isfinite(requested_knowledge_cutoff)
    OR NOT isfinite(requested_system_cutoff)
  THEN RAISE EXCEPTION 'invalid capital assessment identity' USING ERRCODE = '22023';
  END IF;
  caller_role := evidence.capital_workspace_role_internal(
    caller_organization_id, requested_workspace_id, caller_subject_id
  );
  IF caller_role NOT IN ('analyst','steward','validator','admin')
    OR NOT evidence.economic_state_workspace_visible(
      caller_organization_id, requested_workspace_id
    )
  THEN
    RAISE EXCEPTION 'active analyst workspace membership is required'
      USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(value ORDER BY value COLLATE "C") INTO normalized_country_scope
  FROM unnest(requested_country_scope) value;
  SELECT array_agg(value ORDER BY value COLLATE "C") INTO normalized_strategy_scope
  FROM unnest(requested_strategy_scope) value;
  normalized_assumptions := evidence.capital_sort_narratives(requested_assumptions);
  normalized_limitations := evidence.capital_sort_narratives(requested_limitations);
  IF NOT evidence.capital_valid_scope(normalized_country_scope, '^[A-Z]{2}$', 250)
    OR NOT evidence.capital_valid_scope(
      normalized_strategy_scope, '^[a-z][a-z0-9_.-]{0,127}$', 100
    )
    OR NOT evidence.capital_valid_narratives(normalized_assumptions)
    OR NOT evidence.capital_valid_narratives(normalized_limitations)
  THEN RAISE EXCEPTION 'capital scopes or narratives are invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO country FROM evidence.geographies candidate
  WHERE candidate.id = requested_country_id;
  SELECT * INTO snapshot FROM evidence.dataset_snapshots candidate
  WHERE candidate.id = requested_snapshot_id
    AND candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id;
  SELECT * INTO vintage FROM evidence.dataset_snapshots candidate
  WHERE candidate.id = requested_data_vintage_id
    AND candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id;
  SELECT * INTO artifact FROM evidence.economic_state_model_artifacts candidate
  WHERE candidate.id = requested_model_artifact_id
    AND candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id;
  SELECT * INTO lifecycle
  FROM evidence.economic_state_model_lifecycle_events event
  WHERE event.organization_id = caller_organization_id
    AND event.workspace_id = requested_workspace_id
    AND event.model_artifact_id = requested_model_artifact_id
    AND event.occurred_at <= requested_as_of
    AND event.recorded_at <= requested_system_cutoff
  ORDER BY event.occurred_at DESC, event.recorded_at DESC, event.id DESC
  LIMIT 1;
  current_status := evidence.economic_state_artifact_status_internal(
    caller_organization_id, requested_workspace_id, requested_model_artifact_id,
    statement_timestamp(), statement_timestamp()
  );
  IF country.id IS NULL OR country.code <> requested_country_code
    OR requested_country_code !~ '^[A-Z]{2}$'
    OR snapshot.id IS NULL OR snapshot.manifest_sha256 IS NULL
    OR evidence.capital_ceiling_millisecond(snapshot.created_at) > requested_system_cutoff
    OR evidence.capital_ceiling_millisecond(snapshot.known_at) > requested_knowledge_cutoff
    OR vintage.id IS NULL OR vintage.manifest_sha256 IS NULL
    OR evidence.capital_ceiling_millisecond(vintage.known_at) > requested_knowledge_cutoff
    OR evidence.capital_ceiling_millisecond(vintage.created_at) > requested_system_cutoff
    OR artifact.id IS NULL OR lifecycle.id IS NULL
    OR evidence.capital_candidate_status(lifecycle.to_status) IS DISTINCT FROM requested_candidate_status
    OR evidence.capital_ceiling_millisecond(lifecycle.occurred_at) > requested_as_of
    OR requested_candidate_status NOT IN ('candidate','under_review')
    OR NOT coalesce(
      current_status IN ('research','validated','approved','staged','production'), false
    )
    OR requested_knowledge_cutoff > requested_as_of
    OR requested_system_cutoff > requested_as_of
    OR NOT requested_country_code = ANY(normalized_country_scope)
    OR NOT requested_strategy_key = ANY(normalized_strategy_scope)
  THEN
    RAISE EXCEPTION 'capital PIT, model, country, or scope provenance is invalid'
      USING ERRCODE = '23514';
  END IF;
  PERFORM evidence.capital_iso_instant(requested_as_of);
  PERFORM evidence.capital_iso_instant(requested_knowledge_cutoff);
  PERFORM evidence.capital_iso_instant(requested_system_cutoff);
  PERFORM evidence.capital_iso_instant(
    evidence.capital_ceiling_millisecond(snapshot.created_at)
  );
  PERFORM evidence.capital_iso_instant(
    evidence.capital_ceiling_millisecond(vintage.known_at)
  );
  PERFORM evidence.capital_iso_instant(
    evidence.capital_ceiling_millisecond(lifecycle.occurred_at)
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(requested_assessment_id::text, 34001));
  SELECT * INTO existing FROM evidence.capital_research_assessments candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.id = requested_assessment_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(
      existing.country_id, existing.country_code, existing.strategy_key,
      existing.as_of, existing.knowledge_cutoff, existing.system_cutoff,
      existing.snapshot_id, existing.data_vintage_id, existing.model_artifact_id,
      existing.candidate_model_status, existing.country_scope, existing.strategy_scope,
      existing.assumptions, existing.limitations
    ) IS DISTINCT FROM ROW(
      requested_country_id, requested_country_code, requested_strategy_key,
      requested_as_of, requested_knowledge_cutoff, requested_system_cutoff,
      requested_snapshot_id, requested_data_vintage_id, requested_model_artifact_id,
      requested_candidate_status, normalized_country_scope, normalized_strategy_scope,
      normalized_assumptions, normalized_limitations
    ) THEN
      RAISE EXCEPTION 'capital assessment replay changed identity'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  item.id := requested_assessment_id;
  item.organization_id := caller_organization_id;
  item.workspace_id := requested_workspace_id;
  item.country_id := country.id;
  item.country_code := requested_country_code;
  item.strategy_key := requested_strategy_key;
  item.point_in_time_policy := 'strict_system_and_knowledge_cutoff';
  item.as_of := requested_as_of;
  item.knowledge_cutoff := requested_knowledge_cutoff;
  item.system_cutoff := requested_system_cutoff;
  item.snapshot_id := snapshot.id;
  item.snapshot_sha256 := snapshot.manifest_sha256;
  item.snapshot_recorded_at := evidence.capital_ceiling_millisecond(snapshot.created_at);
  item.data_vintage_id := vintage.id;
  item.data_vintage_sha256 := vintage.manifest_sha256;
  item.data_vintage_available_at := evidence.capital_ceiling_millisecond(vintage.known_at);
  item.model_artifact_id := artifact.id;
  item.model_artifact_sha256 := artifact.artifact_sha256;
  item.model_version := artifact.artifact_version;
  item.candidate_model_status := requested_candidate_status;
  item.status_effective_at := evidence.capital_ceiling_millisecond(lifecycle.occurred_at);
  item.lifecycle_event_id := lifecycle.id;
  item.lifecycle_decision_sha256 := lifecycle.decision_sha256;
  item.country_scope := normalized_country_scope;
  item.strategy_scope := normalized_strategy_scope;
  item.purpose := 'research_only';
  item.decision_use := 'prohibited';
  item.advice_status := 'not_investment_advice';
  item.disclaimer := 'Research only; not investment advice.';
  item.assumptions := normalized_assumptions;
  item.limitations := normalized_limitations;
  item.created_by := caller_subject_id;
  item.recorded_at := clock_timestamp();
  SELECT manifest, sha256 INTO item.header_manifest, item.header_sha256
  FROM evidence.capital_set_manifest(
    'capital_research_assessment', to_jsonb(item), 'header_manifest', 'header_sha256'
  );
  INSERT INTO evidence.capital_research_assessments SELECT item.*;
  RETURN item.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.bind_capital_assessment_evidence(
  requested_binding_id uuid,
  requested_assessment_id uuid,
  requested_asset_class text,
  requested_evidence_role text,
  requested_evidence_id uuid,
  requested_evidence_kind text,
  requested_source_key text,
  requested_summary text,
  requested_maximum_age_days integer,
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
  assessment evidence.capital_research_assessments%ROWTYPE;
  existing evidence.capital_assessment_evidence_bindings%ROWTYPE;
  item evidence.capital_assessment_evidence_bindings%ROWTYPE;
  canonical_source record;
  relationship_source evidence.relationship_evidence%ROWTYPE;
  state_source evidence.economic_state_runs%ROWTYPE;
  crisis_source record;
BEGIN
  IF requested_binding_id IS NULL OR requested_assessment_id IS NULL
    OR requested_asset_class IS NULL OR requested_evidence_role IS NULL
    OR requested_evidence_id IS NULL OR requested_evidence_kind IS NULL
    OR requested_source_key IS NULL OR requested_summary IS NULL
    OR requested_maximum_age_days IS NULL OR requested_source_kind IS NULL
    OR requested_source_id IS NULL
  THEN RAISE EXCEPTION 'invalid capital evidence binding input' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO assessment FROM evidence.capital_research_assessments candidate
  WHERE candidate.id = requested_assessment_id
    AND candidate.organization_id = caller_organization_id
    AND evidence.economic_state_workspace_visible(
      candidate.organization_id, candidate.workspace_id
    );
  IF assessment.id IS NULL OR evidence.capital_workspace_role_internal(
      assessment.organization_id, assessment.workspace_id, caller_subject_id
    ) NOT IN ('analyst','steward','validator','admin')
  THEN RAISE EXCEPTION 'capital assessment is unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(assessment.id::text, 34001));
  SELECT * INTO existing FROM evidence.capital_assessment_evidence_bindings candidate
  WHERE candidate.organization_id = assessment.organization_id
    AND candidate.workspace_id = assessment.workspace_id
    AND candidate.id = requested_binding_id;
  IF existing.id IS NOT NULL THEN
    IF ROW(
      existing.assessment_id, existing.asset_class, existing.evidence_role,
      existing.evidence_id, existing.evidence_kind, existing.source_key,
      existing.summary, existing.maximum_age_days, existing.source_kind,
      coalesce(existing.canonical_admission_id, existing.relationship_evidence_id,
        existing.economic_state_run_id, existing.crisis_forecast_slot_id)
    ) IS DISTINCT FROM ROW(
      requested_assessment_id, requested_asset_class, requested_evidence_role,
      requested_evidence_id, requested_evidence_kind, requested_source_key,
      requested_summary, requested_maximum_age_days, requested_source_kind,
      requested_source_id
    ) THEN RAISE EXCEPTION 'capital evidence replay changed identity'
      USING ERRCODE = '23514'; END IF;
    RETURN existing.id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM evidence.capital_assessment_completions completion
    WHERE completion.organization_id = assessment.organization_id
      AND completion.workspace_id = assessment.workspace_id
      AND completion.assessment_id = assessment.id
  ) THEN RAISE EXCEPTION 'completed capital assessment is immutable'
    USING ERRCODE = '55000'; END IF;
  IF (
    SELECT count(*) FROM evidence.capital_assessment_evidence_bindings binding
    WHERE binding.organization_id = assessment.organization_id
      AND binding.workspace_id = assessment.workspace_id
      AND binding.assessment_id = assessment.id
      AND binding.asset_class = requested_asset_class
      AND binding.evidence_role = requested_evidence_role
  ) >= 100 THEN RAISE EXCEPTION 'capital evidence role accepts at most 100 items'
    USING ERRCODE = '23514'; END IF;

  item.id := requested_binding_id;
  item.organization_id := assessment.organization_id;
  item.workspace_id := assessment.workspace_id;
  item.assessment_id := assessment.id;
  item.asset_class := requested_asset_class;
  item.evidence_role := requested_evidence_role;
  item.evidence_id := requested_evidence_id;
  item.evidence_kind := requested_evidence_kind;
  item.source_key := requested_source_key;
  item.summary := requested_summary;
  item.maximum_age_days := requested_maximum_age_days;
  item.source_kind := requested_source_kind;

  IF requested_source_kind = 'canonical_admission' THEN
    SELECT admission.id, observation.period_end AS observed_at,
      greatest(
        admission.admitted_at, admission.created_at,
        admission_evidence.admission_created_at, admission_evidence.recorded_at,
        observation.recorded_at, release.recorded_at,
        coalesce(release.release_time, release.recorded_at),
        payload.fetched_at, payload.recorded_at
      ) AS available_at,
      admission_evidence.evidence_sha256,
      admission_evidence.source_id, admission_evidence.source_dataset_id,
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
      ON release.tenant_scope = admission.tenant_scope AND release.id = admission.release_id
    JOIN evidence.raw_payloads payload
      ON payload.tenant_scope = release.tenant_scope AND payload.id = release.raw_payload_id
    WHERE admission.id = requested_source_id
      AND admission.organization_id = assessment.organization_id;
    IF canonical_source.id IS NULL
      OR NOT coalesce(evidence.source_action_is_admitted_as_known(
        canonical_source.source_id, canonical_source.source_dataset_id, 'derive',
        least(assessment.knowledge_cutoff, assessment.system_cutoff)
      ), false)
      OR NOT coalesce(evidence.source_action_is_currently_admitted(
        canonical_source.source_id, canonical_source.source_dataset_id,
        canonical_source.license_review_id, 'api'
      ), false)
    THEN RAISE EXCEPTION 'canonical capital evidence is illegal or unavailable'
      USING ERRCODE = '23514'; END IF;
    item.canonical_admission_id := requested_source_id;
    item.observed_at := canonical_source.observed_at;
    item.available_at := canonical_source.available_at;
    item.source_sha256 := canonical_source.evidence_sha256;
  ELSIF requested_source_kind = 'relationship_evidence' THEN
    SELECT * INTO relationship_source FROM evidence.relationship_evidence candidate
    WHERE candidate.organization_id = assessment.organization_id
      AND candidate.workspace_id = assessment.workspace_id
      AND candidate.id = requested_source_id;
    IF relationship_source.id IS NULL
      OR relationship_source.evidence_type NOT IN (
        'model_run','expert_review','validation_report','falsification_test','sensitivity_analysis'
      )
      OR relationship_source.valid_from > assessment.as_of
      OR (relationship_source.valid_until IS NOT NULL
        AND relationship_source.valid_until <= assessment.as_of)
      OR relationship_source.recorded_at > assessment.system_cutoff
    THEN RAISE EXCEPTION 'research evidence is invalid or lacks internal governance'
      USING ERRCODE = '23514'; END IF;
    item.relationship_evidence_id := requested_source_id;
    item.observed_at := relationship_source.observed_at;
    item.available_at := relationship_source.recorded_at;
    item.source_sha256 := relationship_source.evidence_sha256;
  ELSIF requested_source_kind = 'economic_state_run' THEN
    SELECT * INTO state_source FROM evidence.economic_state_runs candidate
    WHERE candidate.organization_id = assessment.organization_id
      AND candidate.workspace_id = assessment.workspace_id
      AND candidate.id = requested_source_id;
    IF state_source.id IS NULL OR state_source.known_at > assessment.knowledge_cutoff
      OR state_source.calculated_at > assessment.system_cutoff
      OR NOT coalesce(
        evidence.economic_state_run_is_currently_servable(state_source.id, 'api'), false
      )
    THEN RAISE EXCEPTION 'economic-state evidence is late or unservable'
      USING ERRCODE = '23514'; END IF;
    item.economic_state_run_id := requested_source_id;
    item.observed_at := state_source.known_at;
    item.available_at := state_source.calculated_at;
    item.source_sha256 := state_source.result_manifest_sha256;
  ELSIF requested_source_kind = 'crisis_forecast_slot' THEN
    SELECT slot.id, forecast_run.as_of AS observed_at,
      completion.completed_at AS available_at, slot.slot_sha256,
      forecast_run.id AS run_id
    INTO crisis_source
    FROM evidence.crisis_forecast_slots slot
    JOIN evidence.crisis_forecast_runs forecast_run
      ON forecast_run.organization_id = slot.organization_id
      AND forecast_run.workspace_id = slot.workspace_id
      AND forecast_run.id = slot.run_id
    JOIN evidence.crisis_forecast_run_completions completion
      ON completion.organization_id = slot.organization_id
      AND completion.workspace_id = slot.workspace_id
      AND completion.run_id = slot.run_id
    WHERE slot.organization_id = assessment.organization_id
      AND slot.workspace_id = assessment.workspace_id
      AND slot.id = requested_source_id;
    IF crisis_source.id IS NULL
      OR crisis_source.observed_at > assessment.as_of
      OR crisis_source.available_at > assessment.knowledge_cutoff
      OR crisis_source.available_at > assessment.system_cutoff
      OR NOT coalesce(
        evidence.crisis_forecast_run_is_currently_servable_internal(
          assessment.organization_id, assessment.workspace_id, crisis_source.run_id
        ), false
      )
    THEN RAISE EXCEPTION 'crisis evidence is late or unservable'
      USING ERRCODE = '23514'; END IF;
    item.crisis_forecast_slot_id := requested_source_id;
    item.observed_at := crisis_source.observed_at;
    item.available_at := crisis_source.available_at;
    item.source_sha256 := crisis_source.slot_sha256;
  ELSE
    RAISE EXCEPTION 'unsupported capital evidence source' USING ERRCODE = '22023';
  END IF;

  IF item.observed_at > item.available_at OR item.observed_at > assessment.as_of
    OR item.available_at > assessment.knowledge_cutoff
    OR item.available_at > assessment.system_cutoff
  THEN RAISE EXCEPTION 'capital evidence crosses a point-in-time cutoff'
    USING ERRCODE = '23514'; END IF;
  item.observed_at := evidence.capital_floor_millisecond(item.observed_at);
  item.available_at := evidence.capital_ceiling_millisecond(item.available_at);
  IF item.observed_at > item.available_at OR item.observed_at > assessment.as_of
    OR item.available_at > assessment.knowledge_cutoff
    OR item.available_at > assessment.system_cutoff
    OR extract(epoch FROM assessment.as_of - item.observed_at)
      <> trunc(extract(epoch FROM assessment.as_of - item.observed_at))
  THEN RAISE EXCEPTION 'capital evidence cannot be represented at canonical PIT precision'
    USING ERRCODE = '23514'; END IF;
  PERFORM evidence.capital_iso_instant(item.observed_at);
  PERFORM evidence.capital_iso_instant(item.available_at);
  item.freshness_age_seconds := extract(epoch FROM assessment.as_of - item.observed_at)::bigint;
  item.freshness_maximum_age_seconds := requested_maximum_age_days::bigint * 86400;
  item.freshness_status := CASE
    WHEN item.freshness_age_seconds <= item.freshness_maximum_age_seconds
      THEN 'fresh' ELSE 'stale' END;
  item.item_manifest := jsonb_build_object(
    'evidenceId', item.evidence_id::text,
    'kind', item.evidence_kind,
    'sourceKey', item.source_key,
    'summary', item.summary,
    'observedAt', evidence.capital_iso_instant(item.observed_at),
    'availableAt', evidence.capital_iso_instant(item.available_at),
    'maximumAgeDays', item.maximum_age_days,
    'snapshotId', assessment.snapshot_id::text,
    'snapshotSha256', assessment.snapshot_sha256,
    'dataVintageId', assessment.data_vintage_id::text,
    'dataVintageSha256', assessment.data_vintage_sha256,
    'freshnessAsOf', jsonb_build_object(
      'asOf', evidence.capital_iso_instant(assessment.as_of),
      'ageSeconds', item.freshness_age_seconds,
      'maximumAgeSeconds', item.freshness_maximum_age_seconds,
      'status', item.freshness_status
    )
  );
  item.created_at := clock_timestamp();
  SELECT manifest, sha256 INTO item.binding_manifest, item.binding_sha256
  FROM evidence.capital_set_manifest(
    'capital_assessment_evidence_binding', to_jsonb(item),
    'binding_manifest', 'binding_sha256'
  );
  INSERT INTO evidence.capital_assessment_evidence_bindings SELECT item.*;
  RETURN item.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.append_capital_assessment_asset(
  requested_asset_id uuid,
  requested_assessment_id uuid,
  requested_asset_manifest jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  assessment evidence.capital_research_assessments%ROWTYPE;
  existing evidence.capital_assessment_assets%ROWTYPE;
  item evidence.capital_assessment_assets%ROWTYPE;
BEGIN
  IF requested_asset_id IS NULL OR requested_assessment_id IS NULL
    OR requested_asset_manifest IS NULL
  THEN RAISE EXCEPTION 'invalid capital asset input' USING ERRCODE = '22023'; END IF;
  SELECT * INTO assessment FROM evidence.capital_research_assessments candidate
  WHERE candidate.id = requested_assessment_id
    AND candidate.organization_id = caller_organization_id
    AND evidence.economic_state_workspace_visible(
      candidate.organization_id, candidate.workspace_id
    );
  IF assessment.id IS NULL OR evidence.capital_workspace_role_internal(
      assessment.organization_id, assessment.workspace_id, caller_subject_id
    ) NOT IN ('analyst','steward','validator','admin')
  THEN RAISE EXCEPTION 'capital assessment is unavailable' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(assessment.id::text, 34001));
  SELECT * INTO existing FROM evidence.capital_assessment_assets candidate
  WHERE candidate.organization_id = assessment.organization_id
    AND candidate.workspace_id = assessment.workspace_id
    AND candidate.id = requested_asset_id;
  IF existing.id IS NOT NULL THEN
    IF existing.assessment_id IS DISTINCT FROM requested_assessment_id
      OR existing.asset_manifest IS DISTINCT FROM requested_asset_manifest
    THEN RAISE EXCEPTION 'capital asset replay changed evidence'
      USING ERRCODE = '23514'; END IF;
    RETURN existing.id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM evidence.capital_assessment_completions completion
    WHERE completion.organization_id = assessment.organization_id
      AND completion.workspace_id = assessment.workspace_id
      AND completion.assessment_id = assessment.id
  ) THEN RAISE EXCEPTION 'completed capital assessment is immutable'
    USING ERRCODE = '55000'; END IF;
  item.id := requested_asset_id;
  item.organization_id := assessment.organization_id;
  item.workspace_id := assessment.workspace_id;
  item.assessment_id := assessment.id;
  item.asset_class := requested_asset_manifest->>'assetClass';
  item.macro_score_text := requested_asset_manifest#>>'{macroSuitability,score}';
  item.valuation_status := requested_asset_manifest#>>'{valuationSuitability,status}';
  item.valuation_score_text := CASE WHEN item.valuation_status = 'available'
    THEN requested_asset_manifest#>>'{valuationSuitability,score}' ELSE NULL END;
  item.combined_status := requested_asset_manifest#>>'{combinedSuitability,status}';
  item.combined_score_text := CASE WHEN item.combined_status = 'available'
    THEN requested_asset_manifest#>>'{combinedSuitability,score}' ELSE NULL END;
  item.asset_manifest := requested_asset_manifest;
  item.asset_sha256 := evidence.capital_json_digest(requested_asset_manifest);
  item.created_at := clock_timestamp();
  INSERT INTO evidence.capital_assessment_assets SELECT item.*;
  RETURN item.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.complete_capital_research_assessment(
  requested_assessment_id uuid,
  requested_completion_id uuid
)
RETURNS TABLE (completion_id uuid, manifest_sha256 text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  assessment evidence.capital_research_assessments%ROWTYPE;
  existing evidence.capital_assessment_completions%ROWTYPE;
  item evidence.capital_assessment_completions%ROWTYPE;
  body jsonb;
BEGIN
  IF requested_assessment_id IS NULL OR requested_completion_id IS NULL THEN
    RAISE EXCEPTION 'invalid capital assessment completion input' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO assessment FROM evidence.capital_research_assessments candidate
  WHERE candidate.id = requested_assessment_id
    AND candidate.organization_id = caller_organization_id
    AND evidence.economic_state_workspace_visible(
      candidate.organization_id, candidate.workspace_id
    );
  IF assessment.id IS NULL OR evidence.capital_workspace_role_internal(
      assessment.organization_id, assessment.workspace_id, caller_subject_id
    ) NOT IN ('analyst','steward','validator','admin')
  THEN RAISE EXCEPTION 'capital assessment is unavailable' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(assessment.id::text, 34001));
  SELECT * INTO existing FROM evidence.capital_assessment_completions candidate
  WHERE candidate.organization_id = assessment.organization_id
    AND candidate.workspace_id = assessment.workspace_id
    AND candidate.assessment_id = assessment.id;
  IF existing.id IS NOT NULL THEN
    IF existing.id <> requested_completion_id THEN
      RAISE EXCEPTION 'capital completion replay changed identity'
        USING ERRCODE = '23514';
    END IF;
    RETURN QUERY SELECT existing.id, existing.manifest_sha256;
    RETURN;
  END IF;
  IF NOT coalesce(evidence.economic_state_artifact_status_internal(
      assessment.organization_id, assessment.workspace_id,
      assessment.model_artifact_id, statement_timestamp(), statement_timestamp()
    ) IN ('research','validated','approved','staged','production'), false)
  THEN RAISE EXCEPTION 'capital model is no longer eligible'
    USING ERRCODE = '23514'; END IF;
  SELECT count(*) INTO item.asset_count
  FROM evidence.capital_assessment_assets asset
  WHERE asset.organization_id = assessment.organization_id
    AND asset.workspace_id = assessment.workspace_id
    AND asset.assessment_id = assessment.id;
  IF item.asset_count NOT BETWEEN 1 AND 18 THEN
    RAISE EXCEPTION 'capital assessment requires one to eighteen unique assets'
      USING ERRCODE = '23514';
  END IF;
  body := evidence.capital_assessment_body(assessment.id);
  item.id := requested_completion_id;
  item.organization_id := assessment.organization_id;
  item.workspace_id := assessment.workspace_id;
  item.assessment_id := assessment.id;
  item.manifest_sha256 := evidence.capital_json_digest(body);
  item.assessment_manifest := body || jsonb_build_object(
    'manifestSha256', item.manifest_sha256
  );
  item.completed_by := caller_subject_id;
  item.completed_at := clock_timestamp();
  INSERT INTO evidence.capital_assessment_completions SELECT item.*;
  RETURN QUERY SELECT item.id, item.manifest_sha256;
END
$$;

CREATE OR REPLACE FUNCTION evidence.capital_json_string_array(
  requested_value jsonb
)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT coalesce(array_agg(value ORDER BY ordinal), ARRAY[]::text[])
  FROM jsonb_array_elements_text(requested_value) WITH ORDINALITY item(value, ordinal)
$$;

CREATE OR REPLACE FUNCTION evidence.capital_outcome_manifest_valid(requested_manifest jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  body jsonb;
  country_scope text[];
  strategy_scope text[];
  series_keys text[];
  outcome_window jsonb;
  horizon integer;
  start_offset integer;
  end_offset integer;
  lag integer;
BEGIN
  IF requested_manifest IS NULL OR NOT evidence.capital_exact_keys(
      requested_manifest, ARRAY[
        'schemaVersion','outcomeDefinitionId','version','purpose','assetClass',
        'metricKey','description','countryScope','strategyScope','horizonDays',
        'observationWindow','direction','calculationMethod','sourceSeriesKeys',
        'availabilityLagDays','revisionPolicy','missingDataPolicy','manifestSha256'
      ]
    )
    OR jsonb_typeof(requested_manifest->'schemaVersion') <> 'number'
    OR requested_manifest->>'schemaVersion' <> '1'
    OR (requested_manifest->>'outcomeDefinitionId') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR length(requested_manifest->>'version') > 128
    OR (requested_manifest->>'version') !~
      '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
    OR requested_manifest->>'purpose' <> 'research_validation_only'
    OR requested_manifest->>'assetClass' NOT IN (
      'cash','money_market','government_bonds','inflation_linked_bonds',
      'investment_grade_corporate_credit','high_yield_credit','equities','real_estate',
      'infrastructure','gold','silver','industrial_metals','agriculture','energy',
      'foreign_exchange','bitcoin','ethereum','private_credit'
    )
    OR (requested_manifest->>'metricKey') !~ '^[a-z][a-z0-9_.-]{0,127}$'
    OR jsonb_typeof(requested_manifest->'description') <> 'string'
    OR NOT evidence.capital_valid_research_text(requested_manifest->>'description', 2000)
    OR jsonb_typeof(requested_manifest->'calculationMethod') <> 'string'
    OR NOT evidence.capital_valid_research_text(
      requested_manifest->>'calculationMethod', 2000
    )
    OR requested_manifest->>'direction' NOT IN (
      'higher_is_better','lower_is_better','two_sided'
    )
    OR requested_manifest->>'revisionPolicy' NOT IN (
      'first_release','fixed_vintage','latest_at_evaluation_cutoff'
    )
    OR requested_manifest->>'missingDataPolicy' NOT IN (
      'exclude_with_reason','score_as_unresolved'
    )
    OR (requested_manifest->>'manifestSha256') !~ '^[0-9a-f]{64}$'
  THEN RETURN false; END IF;
  body := requested_manifest - 'manifestSha256';
  IF evidence.capital_json_digest(body) <> requested_manifest->>'manifestSha256'
    OR jsonb_typeof(requested_manifest->'countryScope') <> 'array'
    OR jsonb_typeof(requested_manifest->'strategyScope') <> 'array'
    OR jsonb_typeof(requested_manifest->'sourceSeriesKeys') <> 'array'
  THEN RETURN false; END IF;
  country_scope := evidence.capital_json_string_array(requested_manifest->'countryScope');
  strategy_scope := evidence.capital_json_string_array(requested_manifest->'strategyScope');
  series_keys := evidence.capital_json_string_array(requested_manifest->'sourceSeriesKeys');
  IF NOT evidence.capital_valid_scope(country_scope, '^[A-Z]{2}$', 250)
    OR NOT evidence.capital_valid_scope(
      strategy_scope, '^[a-z][a-z0-9_.-]{0,127}$', 100
    )
    OR NOT evidence.capital_valid_scope(
      series_keys, '^[a-z][a-z0-9_.-]{0,127}$', 100
    )
  THEN RETURN false; END IF;
  IF jsonb_typeof(requested_manifest->'horizonDays') <> 'number'
    OR (requested_manifest->>'horizonDays') !~ '^[1-9][0-9]{0,3}$'
    OR jsonb_typeof(requested_manifest->'availabilityLagDays') <> 'number'
    OR (requested_manifest->>'availabilityLagDays') !~ '^(0|[1-9][0-9]{0,3})$'
  THEN RETURN false; END IF;
  horizon := (requested_manifest->>'horizonDays')::integer;
  lag := (requested_manifest->>'availabilityLagDays')::integer;
  IF horizon NOT BETWEEN 1 AND 3650 OR lag NOT BETWEEN 0 AND 3650 THEN RETURN false; END IF;
  outcome_window := requested_manifest->'observationWindow';
  IF NOT evidence.capital_exact_keys(
      outcome_window, ARRAY['startOffsetDays','endOffsetDays']
    )
    OR jsonb_typeof(outcome_window->'startOffsetDays') <> 'number'
    OR jsonb_typeof(outcome_window->'endOffsetDays') <> 'number'
    OR (outcome_window->>'startOffsetDays') !~ '^(0|[1-9][0-9]{0,3})$'
    OR (outcome_window->>'endOffsetDays') !~ '^[1-9][0-9]{0,3}$'
  THEN RETURN false; END IF;
  start_offset := (outcome_window->>'startOffsetDays')::integer;
  end_offset := (outcome_window->>'endOffsetDays')::integer;
  RETURN start_offset BETWEEN 0 AND horizon
    AND end_offset BETWEEN 1 AND horizon
    AND start_offset < end_offset;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END
$$;

CREATE OR REPLACE FUNCTION evidence.verify_capital_outcome_definition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
BEGIN
  IF NOT evidence.capital_outcome_manifest_valid(NEW.outcome_manifest)
    OR NEW.outcome_manifest->>'outcomeDefinitionId' IS DISTINCT FROM NEW.id::text
    OR NEW.outcome_manifest->>'version' IS DISTINCT FROM NEW.version
    OR NEW.outcome_manifest->>'assetClass' IS DISTINCT FROM NEW.asset_class
    OR NEW.outcome_manifest->>'metricKey' IS DISTINCT FROM NEW.metric_key
    OR NEW.outcome_manifest->>'manifestSha256' IS DISTINCT FROM NEW.manifest_sha256
  THEN RAISE EXCEPTION 'capital outcome definition is not canonical'
    USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION evidence.create_capital_outcome_definition(
  requested_workspace_id uuid,
  requested_manifest jsonb
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
  requested_id uuid;
  existing evidence.capital_outcome_definitions%ROWTYPE;
  item evidence.capital_outcome_definitions%ROWTYPE;
BEGIN
  IF requested_workspace_id IS NULL OR requested_manifest IS NULL
    OR NOT evidence.capital_outcome_manifest_valid(requested_manifest)
  THEN RAISE EXCEPTION 'invalid capital outcome manifest' USING ERRCODE = '22023'; END IF;
  caller_role := evidence.capital_workspace_role_internal(
    caller_organization_id, requested_workspace_id, caller_subject_id
  );
  IF caller_role NOT IN ('validator','admin') OR NOT evidence.economic_state_workspace_visible(
      caller_organization_id, requested_workspace_id
    )
  THEN RAISE EXCEPTION 'outcome approval requires validator workspace membership'
    USING ERRCODE = '42501'; END IF;
  requested_id := (requested_manifest->>'outcomeDefinitionId')::uuid;
  PERFORM pg_advisory_xact_lock(hashtextextended(requested_id::text, 34002));
  SELECT * INTO existing FROM evidence.capital_outcome_definitions candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.id = requested_id;
  IF existing.id IS NOT NULL THEN
    IF existing.outcome_manifest IS DISTINCT FROM requested_manifest THEN
      RAISE EXCEPTION 'capital outcome replay changed identity' USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  item.id := requested_id;
  item.organization_id := caller_organization_id;
  item.workspace_id := requested_workspace_id;
  item.version := requested_manifest->>'version';
  item.asset_class := requested_manifest->>'assetClass';
  item.metric_key := requested_manifest->>'metricKey';
  item.outcome_manifest := requested_manifest;
  item.manifest_sha256 := requested_manifest->>'manifestSha256';
  item.approved_by := caller_subject_id;
  item.approved_at := clock_timestamp();
  item.recorded_at := item.approved_at;
  INSERT INTO evidence.capital_outcome_definitions SELECT item.*;
  RETURN item.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.capital_validation_plan_structurally_valid(
  requested_manifest jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  body jsonb;
  model jsonb;
  fold jsonb;
  interval_value jsonb;
  sentinels jsonb;
  ordinal bigint;
  fold_ids text[] := ARRAY[]::text[];
  fold_id text;
  training_start timestamptz;
  training_end timestamptz;
  calibration_start timestamptz;
  calibration_end timestamptz;
  test_start timestamptz;
  test_end timestamptz;
  embargo integer;
  previous_training_start timestamptz;
  previous_training_end timestamptz;
  previous_test_end timestamptz;
  instant_name text;
  instant_value timestamptz;
BEGIN
  IF requested_manifest IS NULL OR NOT evidence.capital_exact_keys(
      requested_manifest, ARRAY[
        'schemaVersion','validationPlanId','purpose','mode','model',
        'outcomeDefinitionId','outcomeDefinitionSha256','folds','manifestSha256'
      ]
    )
    OR jsonb_typeof(requested_manifest->'schemaVersion') <> 'number'
    OR requested_manifest->>'schemaVersion' <> '1'
    OR (requested_manifest->>'validationPlanId') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR requested_manifest->>'purpose' <> 'chronological_research_validation'
    OR requested_manifest->>'mode' NOT IN ('expanding_window','rolling_window')
    OR (requested_manifest->>'outcomeDefinitionId') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR (requested_manifest->>'outcomeDefinitionSha256') !~ '^[0-9a-f]{64}$'
    OR (requested_manifest->>'manifestSha256') !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(requested_manifest->'folds') <> 'array'
    OR jsonb_array_length(requested_manifest->'folds') NOT BETWEEN 1 AND 100
  THEN RETURN false; END IF;
  body := requested_manifest - 'manifestSha256';
  IF evidence.capital_json_digest(body) <> requested_manifest->>'manifestSha256'
  THEN RETURN false; END IF;
  model := requested_manifest->'model';
  IF NOT evidence.capital_exact_keys(
      model, ARRAY['modelId','version','artifactSha256','status']
    )
    OR (model->>'modelId') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR length(model->>'version') > 128
    OR (model->>'version') !~ '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
    OR (model->>'artifactSha256') !~ '^[0-9a-f]{64}$'
    OR model->>'status' NOT IN ('candidate','under_review','retired')
  THEN RETURN false; END IF;
  FOR fold, ordinal IN
    SELECT element, position FROM jsonb_array_elements(requested_manifest->'folds')
      WITH ORDINALITY source(element, position)
  LOOP
    IF NOT evidence.capital_exact_keys(
        fold, ARRAY['foldId','training','calibration','test','embargoDays','sentinels']
      )
      OR (fold->>'foldId') !~ '^[a-z][a-z0-9_.-]{0,127}$'
      OR fold->>'foldId' = ANY(fold_ids)
      OR jsonb_typeof(fold->'embargoDays') <> 'number'
      OR (fold->>'embargoDays') !~ '^(0|[1-9][0-9]{0,2})$'
    THEN RETURN false; END IF;
    fold_id := fold->>'foldId';
    fold_ids := array_append(fold_ids, fold_id);
    embargo := (fold->>'embargoDays')::integer;
    IF embargo NOT BETWEEN 0 AND 365 THEN RETURN false; END IF;
    FOREACH instant_name IN ARRAY ARRAY['training','calibration','test'] LOOP
      interval_value := fold->instant_name;
      IF NOT evidence.capital_exact_keys(interval_value, ARRAY['start','end'])
        OR NOT evidence.capital_valid_iso_instant(interval_value->>'start')
        OR NOT evidence.capital_valid_iso_instant(interval_value->>'end')
        OR (interval_value->>'start')::timestamptz >= (interval_value->>'end')::timestamptz
      THEN RETURN false; END IF;
    END LOOP;
    training_start := (fold#>>'{training,start}')::timestamptz;
    training_end := (fold#>>'{training,end}')::timestamptz;
    calibration_start := (fold#>>'{calibration,start}')::timestamptz;
    calibration_end := (fold#>>'{calibration,end}')::timestamptz;
    test_start := (fold#>>'{test,start}')::timestamptz;
    test_end := (fold#>>'{test,end}')::timestamptz;
    IF training_end >= calibration_start OR calibration_end >= test_start
      OR extract(epoch FROM calibration_start - training_end) < embargo::bigint * 86400
      OR extract(epoch FROM test_start - calibration_end) < embargo::bigint * 86400
    THEN RETURN false; END IF;
    sentinels := fold->'sentinels';
    IF NOT evidence.capital_exact_keys(sentinels, ARRAY[
        'outcomeDefinitionLockedAt','featureEngineeringFitThrough',
        'normalizationFitThrough','hyperparameterSelectionFitThrough',
        'valuationModelFitThrough','latestTrainingLabelAvailableAt',
        'calibrationFitThrough','thresholdSelectionFitThrough'
      ])
    THEN RETURN false; END IF;
    FOR instant_name IN SELECT jsonb_object_keys(sentinels) LOOP
      IF NOT evidence.capital_valid_iso_instant(sentinels->>instant_name) THEN RETURN false; END IF;
      instant_value := (sentinels->>instant_name)::timestamptz;
      IF instant_value >= test_start THEN RETURN false; END IF;
    END LOOP;
    IF (sentinels->>'outcomeDefinitionLockedAt')::timestamptz > training_start
      OR (sentinels->>'featureEngineeringFitThrough')::timestamptz > training_end
      OR (sentinels->>'normalizationFitThrough')::timestamptz > training_end
      OR (sentinels->>'hyperparameterSelectionFitThrough')::timestamptz > training_end
      OR (sentinels->>'valuationModelFitThrough')::timestamptz > training_end
      OR (sentinels->>'latestTrainingLabelAvailableAt')::timestamptz > training_end
      OR (sentinels->>'calibrationFitThrough')::timestamptz > calibration_end
      OR (sentinels->>'thresholdSelectionFitThrough')::timestamptz > calibration_end
    THEN RETURN false; END IF;
    IF ordinal > 1 AND (
      previous_test_end >= test_start OR previous_training_end >= training_end
      OR (requested_manifest->>'mode' = 'expanding_window'
        AND previous_training_start IS DISTINCT FROM training_start)
      OR (requested_manifest->>'mode' = 'rolling_window'
        AND previous_training_start > training_start)
    ) THEN RETURN false; END IF;
    previous_training_start := training_start;
    previous_training_end := training_end;
    previous_test_end := test_end;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END
$$;

CREATE OR REPLACE FUNCTION evidence.verify_capital_validation_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
BEGIN
  IF NOT evidence.capital_validation_plan_structurally_valid(NEW.plan_manifest)
    OR NEW.plan_manifest->>'validationPlanId' IS DISTINCT FROM NEW.id::text
    OR NEW.plan_manifest->>'mode' IS DISTINCT FROM NEW.mode
    OR NEW.plan_manifest#>>'{model,modelId}' IS DISTINCT FROM NEW.model_artifact_id::text
    OR NEW.plan_manifest#>>'{model,artifactSha256}' IS DISTINCT FROM NEW.model_artifact_sha256
    OR NEW.plan_manifest#>>'{model,version}' IS DISTINCT FROM NEW.model_version
    OR NEW.plan_manifest#>>'{model,status}' IS DISTINCT FROM NEW.candidate_model_status
    OR NEW.plan_manifest->>'outcomeDefinitionId' IS DISTINCT FROM NEW.outcome_definition_id::text
    OR NEW.plan_manifest->>'outcomeDefinitionSha256' IS DISTINCT FROM NEW.outcome_definition_sha256
    OR NEW.plan_manifest->>'manifestSha256' IS DISTINCT FROM NEW.manifest_sha256
  THEN RAISE EXCEPTION 'capital validation plan is not canonical'
    USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION evidence.create_capital_validation_plan(
  requested_workspace_id uuid,
  requested_manifest jsonb
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
  requested_id uuid;
  artifact evidence.economic_state_model_artifacts%ROWTYPE;
  outcome evidence.capital_outcome_definitions%ROWTYPE;
  lifecycle_status text;
  existing evidence.capital_validation_plans%ROWTYPE;
  plan evidence.capital_validation_plans%ROWTYPE;
  fold evidence.capital_validation_folds%ROWTYPE;
  fold_json jsonb;
  ordinal bigint;
BEGIN
  IF requested_workspace_id IS NULL OR requested_manifest IS NULL
    OR NOT evidence.capital_validation_plan_structurally_valid(requested_manifest)
  THEN RAISE EXCEPTION 'invalid capital validation plan' USING ERRCODE = '22023'; END IF;
  caller_role := evidence.capital_workspace_role_internal(
    caller_organization_id, requested_workspace_id, caller_subject_id
  );
  IF caller_role NOT IN ('validator','admin') OR NOT evidence.economic_state_workspace_visible(
      caller_organization_id, requested_workspace_id
    )
  THEN RAISE EXCEPTION 'validation plan requires validator workspace membership'
    USING ERRCODE = '42501'; END IF;
  requested_id := (requested_manifest->>'validationPlanId')::uuid;
  PERFORM pg_advisory_xact_lock(hashtextextended(requested_id::text, 34003));
  SELECT * INTO existing FROM evidence.capital_validation_plans candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.id = requested_id;
  IF existing.id IS NOT NULL THEN
    IF existing.plan_manifest IS DISTINCT FROM requested_manifest THEN
      RAISE EXCEPTION 'capital validation replay changed identity' USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  SELECT * INTO artifact FROM evidence.economic_state_model_artifacts candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.id = (requested_manifest#>>'{model,modelId}')::uuid;
  SELECT * INTO outcome FROM evidence.capital_outcome_definitions candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.id = (requested_manifest->>'outcomeDefinitionId')::uuid
    AND candidate.manifest_sha256 = requested_manifest->>'outcomeDefinitionSha256';
  lifecycle_status := evidence.economic_state_artifact_status_internal(
    caller_organization_id, requested_workspace_id, artifact.id,
    statement_timestamp(), statement_timestamp()
  );
  IF artifact.id IS NULL OR outcome.id IS NULL
    OR artifact.artifact_version IS DISTINCT FROM requested_manifest#>>'{model,version}'
    OR artifact.artifact_sha256 IS DISTINCT FROM requested_manifest#>>'{model,artifactSha256}'
    OR evidence.capital_candidate_status(lifecycle_status)
      IS DISTINCT FROM requested_manifest#>>'{model,status}'
    OR NOT coalesce(
      lifecycle_status IN ('research','validated','approved','staged','production'), false
    )
  THEN RAISE EXCEPTION 'validation model or outcome authority is invalid'
    USING ERRCODE = '23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(requested_manifest->'folds') fold_source(value)
    WHERE outcome.recorded_at > (fold_source.value#>>'{sentinels,outcomeDefinitionLockedAt}')::timestamptz
  ) THEN RAISE EXCEPTION 'outcome definition was not locked before validation'
    USING ERRCODE = '23514'; END IF;
  plan.id := requested_id;
  plan.organization_id := caller_organization_id;
  plan.workspace_id := requested_workspace_id;
  plan.mode := requested_manifest->>'mode';
  plan.model_artifact_id := artifact.id;
  plan.model_artifact_sha256 := artifact.artifact_sha256;
  plan.model_version := artifact.artifact_version;
  plan.candidate_model_status := requested_manifest#>>'{model,status}';
  plan.outcome_definition_id := outcome.id;
  plan.outcome_definition_sha256 := outcome.manifest_sha256;
  plan.plan_manifest := requested_manifest;
  plan.manifest_sha256 := requested_manifest->>'manifestSha256';
  plan.created_by := caller_subject_id;
  plan.created_at := clock_timestamp();
  INSERT INTO evidence.capital_validation_plans SELECT plan.*;
  FOR fold_json, ordinal IN
    SELECT value, position FROM jsonb_array_elements(requested_manifest->'folds')
      WITH ORDINALITY source(value, position)
  LOOP
    fold.id := evidence.deterministic_uuid_v8(
      'economyos:capital-validation-fold:v1', plan.id::text, ordinal::text
    );
    fold.organization_id := plan.organization_id;
    fold.workspace_id := plan.workspace_id;
    fold.validation_plan_id := plan.id;
    fold.fold_ordinal := ordinal;
    fold.fold_key := fold_json->>'foldId';
    fold.training_start := (fold_json#>>'{training,start}')::timestamptz;
    fold.training_end := (fold_json#>>'{training,end}')::timestamptz;
    fold.calibration_start := (fold_json#>>'{calibration,start}')::timestamptz;
    fold.calibration_end := (fold_json#>>'{calibration,end}')::timestamptz;
    fold.test_start := (fold_json#>>'{test,start}')::timestamptz;
    fold.test_end := (fold_json#>>'{test,end}')::timestamptz;
    fold.embargo_days := (fold_json->>'embargoDays')::integer;
    fold.outcome_definition_locked_at :=
      (fold_json#>>'{sentinels,outcomeDefinitionLockedAt}')::timestamptz;
    fold.feature_engineering_fit_through :=
      (fold_json#>>'{sentinels,featureEngineeringFitThrough}')::timestamptz;
    fold.normalization_fit_through :=
      (fold_json#>>'{sentinels,normalizationFitThrough}')::timestamptz;
    fold.hyperparameter_selection_fit_through :=
      (fold_json#>>'{sentinels,hyperparameterSelectionFitThrough}')::timestamptz;
    fold.valuation_model_fit_through :=
      (fold_json#>>'{sentinels,valuationModelFitThrough}')::timestamptz;
    fold.latest_training_label_available_at :=
      (fold_json#>>'{sentinels,latestTrainingLabelAvailableAt}')::timestamptz;
    fold.calibration_fit_through :=
      (fold_json#>>'{sentinels,calibrationFitThrough}')::timestamptz;
    fold.threshold_selection_fit_through :=
      (fold_json#>>'{sentinels,thresholdSelectionFitThrough}')::timestamptz;
    fold.fold_manifest := fold_json;
    fold.fold_sha256 := evidence.capital_json_digest(fold_json);
    INSERT INTO evidence.capital_validation_folds SELECT fold.*;
  END LOOP;
  RETURN plan.id;
END
$$;

CREATE OR REPLACE FUNCTION evidence.capital_comparison_currently_servable_internal(
  requested_organization_id uuid,
  requested_workspace_id uuid,
  requested_comparison_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
  SELECT coalesce((
    SELECT NOT EXISTS (
      SELECT 1
      FROM evidence.capital_country_comparison_items item
      WHERE item.organization_id = comparison.organization_id
        AND item.workspace_id = comparison.workspace_id
        AND item.comparison_id = comparison.id
        AND item.assessment_id IS NOT NULL
        AND NOT evidence.capital_assessment_currently_servable_internal(
          item.organization_id, item.workspace_id, item.assessment_id
        )
    )
    FROM evidence.capital_country_comparisons comparison
    WHERE comparison.organization_id = requested_organization_id
      AND comparison.workspace_id = requested_workspace_id
      AND comparison.id = requested_comparison_id
  ), false)
$$;

CREATE OR REPLACE FUNCTION evidence.verify_capital_country_comparison()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
BEGIN
  IF NOT evidence.capital_exact_keys(NEW.comparison_manifest, ARRAY[
      'schemaVersion','comparisonId','semantics','assetClass','strategyKey',
      'referenceCountryId','requestedCountries','compatibilityPolicy',
      'sourceManifestDigests','results','manifestSha256'
    ])
    OR NEW.comparison_manifest->>'schemaVersion' <> '1'
    OR NEW.comparison_manifest->>'comparisonId' IS DISTINCT FROM NEW.id::text
    OR NEW.comparison_manifest->>'assetClass' IS DISTINCT FROM NEW.asset_class
    OR NEW.comparison_manifest->>'strategyKey' IS DISTINCT FROM NEW.strategy_key
    OR NEW.comparison_manifest->>'referenceCountryId'
      IS DISTINCT FROM NEW.reference_country_id::text
    OR jsonb_array_length(NEW.comparison_manifest->'requestedCountries') <> NEW.country_count
    OR NEW.comparison_manifest->>'manifestSha256' IS DISTINCT FROM NEW.manifest_sha256
    OR evidence.capital_json_digest(NEW.comparison_manifest - 'manifestSha256')
      IS DISTINCT FROM NEW.manifest_sha256
  THEN RAISE EXCEPTION 'capital country comparison is not canonical'
    USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION evidence.create_capital_country_comparison(
  requested_workspace_id uuid,
  requested_manifest jsonb
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
  requested_id uuid;
  requested_countries jsonb;
  source_digests jsonb;
  results jsonb;
  country_json jsonb;
  source_json jsonb;
  result_json jsonb;
  expected_result jsonb;
  expected_sources jsonb := '[]'::jsonb;
  reasons jsonb;
  ordinal bigint;
  country_id uuid;
  country_code text;
  assessment evidence.capital_research_assessments%ROWTYPE;
  reference evidence.capital_research_assessments%ROWTYPE;
  asset evidence.capital_assessment_assets%ROWTYPE;
  existing evidence.capital_country_comparisons%ROWTYPE;
  comparison evidence.capital_country_comparisons%ROWTYPE;
  comparison_item evidence.capital_country_comparison_items%ROWTYPE;
  seen_country_ids uuid[] := ARRAY[]::uuid[];
  seen_source_country_ids uuid[] := ARRAY[]::uuid[];
  source_country_id uuid;
  source_count integer;
BEGIN
  IF requested_workspace_id IS NULL OR requested_manifest IS NULL
    OR NOT evidence.capital_exact_keys(requested_manifest, ARRAY[
      'schemaVersion','comparisonId','semantics','assetClass','strategyKey',
      'referenceCountryId','requestedCountries','compatibilityPolicy',
      'sourceManifestDigests','results','manifestSha256'
    ])
    OR jsonb_typeof(requested_manifest->'schemaVersion') <> 'number'
    OR requested_manifest->>'schemaVersion' <> '1'
    OR (requested_manifest->>'comparisonId') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR (requested_manifest->>'referenceCountryId') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR requested_manifest->>'assetClass' NOT IN (
      'cash','money_market','government_bonds','inflation_linked_bonds',
      'investment_grade_corporate_credit','high_yield_credit','equities','real_estate',
      'infrastructure','gold','silver','industrial_metals','agriculture','energy',
      'foreign_exchange','bitcoin','ethereum','private_credit'
    )
    OR (requested_manifest->>'strategyKey') !~ '^[a-z][a-z0-9_.-]{0,127}$'
    OR requested_manifest->'semantics' <> jsonb_build_object(
      'purpose','research_only','decisionUse','prohibited',
      'adviceStatus','not_investment_advice',
      'disclaimer','Research only; not investment advice.'
    )
    OR requested_manifest->'compatibilityPolicy' <> jsonb_build_object(
      'modelIdentity','exact_model_version_and_artifact',
      'pointInTime','same_as_of_and_policy',
      'valuation','required_for_combined_comparison'
    )
    OR (requested_manifest->>'manifestSha256') !~ '^[0-9a-f]{64}$'
    OR evidence.capital_json_digest(requested_manifest - 'manifestSha256')
      <> requested_manifest->>'manifestSha256'
  THEN RAISE EXCEPTION 'invalid capital comparison manifest' USING ERRCODE = '22023';
  END IF;
  caller_role := evidence.capital_workspace_role_internal(
    caller_organization_id, requested_workspace_id, caller_subject_id
  );
  IF caller_role NOT IN ('analyst','steward','validator','admin')
    OR NOT evidence.economic_state_workspace_visible(
      caller_organization_id, requested_workspace_id
    )
  THEN RAISE EXCEPTION 'capital comparison requires active workspace membership'
    USING ERRCODE = '42501'; END IF;
  requested_countries := requested_manifest->'requestedCountries';
  source_digests := requested_manifest->'sourceManifestDigests';
  results := requested_manifest->'results';
  IF jsonb_typeof(requested_countries) <> 'array'
    OR jsonb_array_length(requested_countries) NOT BETWEEN 2 AND 12
    OR jsonb_typeof(source_digests) <> 'array'
    OR jsonb_array_length(source_digests) > jsonb_array_length(requested_countries)
    OR jsonb_typeof(results) <> 'array'
    OR jsonb_array_length(results) <> jsonb_array_length(requested_countries)
  THEN RAISE EXCEPTION 'capital comparison country sets are invalid'
    USING ERRCODE = '22023'; END IF;
  FOR source_json IN SELECT value FROM jsonb_array_elements(source_digests) LOOP
    IF NOT evidence.capital_exact_keys(source_json, ARRAY['countryId','manifestSha256'])
      OR (source_json->>'countryId') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR (source_json->>'manifestSha256') !~ '^[0-9a-f]{64}$'
    THEN RAISE EXCEPTION 'capital comparison source pointer is invalid'
      USING ERRCODE = '22023'; END IF;
    source_country_id := (source_json->>'countryId')::uuid;
    IF source_country_id = ANY(seen_source_country_ids) THEN
      RAISE EXCEPTION 'capital comparison source countries must be unique'
        USING ERRCODE = '23514';
    END IF;
    seen_source_country_ids := array_append(seen_source_country_ids, source_country_id);
  END LOOP;
  requested_id := (requested_manifest->>'comparisonId')::uuid;
  PERFORM pg_advisory_xact_lock(hashtextextended(requested_id::text, 34004));
  SELECT * INTO existing FROM evidence.capital_country_comparisons candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.id = requested_id;
  IF existing.id IS NOT NULL THEN
    IF existing.comparison_manifest IS DISTINCT FROM requested_manifest THEN
      RAISE EXCEPTION 'capital comparison replay changed identity' USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;

  source_json := NULL;
  SELECT value INTO source_json FROM jsonb_array_elements(source_digests) source(value)
  WHERE source.value->>'countryId' = requested_manifest->>'referenceCountryId';
  IF source_json IS NOT NULL THEN
    SELECT assessment_header.*
    INTO reference
    FROM evidence.capital_research_assessments assessment_header
    JOIN evidence.capital_assessment_completions completion
      ON completion.organization_id = assessment_header.organization_id
      AND completion.workspace_id = assessment_header.workspace_id
      AND completion.assessment_id = assessment_header.id
    WHERE assessment_header.organization_id = caller_organization_id
      AND assessment_header.workspace_id = requested_workspace_id
      AND completion.manifest_sha256 = source_json->>'manifestSha256';
    IF reference.id IS NULL OR NOT evidence.capital_assessment_currently_servable_internal(
        caller_organization_id, requested_workspace_id, reference.id
      )
    THEN RAISE EXCEPTION 'reference assessment is foreign or unservable'
      USING ERRCODE = '23514'; END IF;
  END IF;

  comparison.id := requested_id;
  comparison.organization_id := caller_organization_id;
  comparison.workspace_id := requested_workspace_id;
  comparison.asset_class := requested_manifest->>'assetClass';
  comparison.strategy_key := requested_manifest->>'strategyKey';
  comparison.reference_country_id := (requested_manifest->>'referenceCountryId')::uuid;
  comparison.country_count := jsonb_array_length(requested_countries);
  comparison.comparison_manifest := requested_manifest;
  comparison.manifest_sha256 := requested_manifest->>'manifestSha256';
  comparison.created_by := caller_subject_id;
  comparison.created_at := clock_timestamp();
  INSERT INTO evidence.capital_country_comparisons SELECT comparison.*;

  FOR country_json, ordinal IN
    SELECT value, position FROM jsonb_array_elements(requested_countries)
      WITH ORDINALITY requested(value, position)
  LOOP
    IF NOT evidence.capital_exact_keys(country_json, ARRAY['countryId','countryCode'])
      OR (country_json->>'countryId') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR (country_json->>'countryCode') !~ '^[A-Z]{2}$'
    THEN RAISE EXCEPTION 'requested comparison country is invalid'
      USING ERRCODE = '22023'; END IF;
    country_id := (country_json->>'countryId')::uuid;
    country_code := country_json->>'countryCode';
    IF country_id = ANY(seen_country_ids) THEN
      RAISE EXCEPTION 'requested comparison countries must be unique'
        USING ERRCODE = '23514';
    END IF;
    seen_country_ids := array_append(seen_country_ids, country_id);
    IF NOT EXISTS (
      SELECT 1 FROM evidence.geographies geography
      WHERE geography.id = country_id AND geography.code = country_code
    ) THEN RAISE EXCEPTION 'requested country identity is not authoritative'
      USING ERRCODE = '23514'; END IF;

    source_json := NULL;
    SELECT value INTO source_json FROM jsonb_array_elements(source_digests) source(value)
    WHERE source.value->>'countryId' = country_id::text;
    assessment := NULL;
    IF source_json IS NOT NULL THEN
      expected_sources := expected_sources || jsonb_build_array(source_json);
      SELECT assessment_header.*
      INTO assessment
      FROM evidence.capital_research_assessments assessment_header
      JOIN evidence.capital_assessment_completions completion
        ON completion.organization_id = assessment_header.organization_id
        AND completion.workspace_id = assessment_header.workspace_id
        AND completion.assessment_id = assessment_header.id
      WHERE assessment_header.organization_id = caller_organization_id
        AND assessment_header.workspace_id = requested_workspace_id
        AND completion.manifest_sha256 = source_json->>'manifestSha256';
      IF assessment.id IS NULL OR assessment.country_id <> country_id
        OR NOT evidence.capital_assessment_currently_servable_internal(
          caller_organization_id, requested_workspace_id, assessment.id
        )
      THEN RAISE EXCEPTION 'comparison source assessment is foreign, mismatched, or unservable'
        USING ERRCODE = '23514'; END IF;
    END IF;
    reasons := '[]'::jsonb;
    asset := NULL;
    IF assessment.id IS NULL THEN
      reasons := reasons || jsonb_build_array(jsonb_build_object(
        'code','missing_assessment',
        'detail','No governed assessment manifest was supplied.'
      ));
    ELSE
      IF assessment.country_code <> country_code THEN
        reasons := reasons || jsonb_build_array(jsonb_build_object(
          'code','country_identity_mismatch',
          'detail','Country code does not match the requested identity.'
        ));
      END IF;
      IF assessment.strategy_key <> comparison.strategy_key THEN
        reasons := reasons || jsonb_build_array(jsonb_build_object(
          'code','strategy_scope_mismatch',
          'detail','Assessment strategy does not match the comparison strategy.'
        ));
      END IF;
      SELECT * INTO asset FROM evidence.capital_assessment_assets candidate
      WHERE candidate.organization_id = assessment.organization_id
        AND candidate.workspace_id = assessment.workspace_id
        AND candidate.assessment_id = assessment.id
        AND candidate.asset_class = comparison.asset_class;
      IF asset.id IS NULL THEN
        reasons := reasons || jsonb_build_array(jsonb_build_object(
          'code','asset_not_assessed',
          'detail','Requested asset is absent from this assessment.'
        ));
      END IF;
      IF reference.id IS NULL THEN
        reasons := reasons || jsonb_build_array(jsonb_build_object(
          'code','reference_assessment_missing',
          'detail','The explicit reference-country assessment is absent.'
        ));
      ELSE
        IF ROW(
          assessment.model_artifact_id, assessment.model_version,
          assessment.model_artifact_sha256
        ) IS DISTINCT FROM ROW(
          reference.model_artifact_id, reference.model_version,
          reference.model_artifact_sha256
        ) THEN
          reasons := reasons || jsonb_build_array(jsonb_build_object(
            'code','model_identity_mismatch',
            'detail','Candidate model identity, version, or artifact differs.'
          ));
        END IF;
        IF assessment.as_of IS DISTINCT FROM reference.as_of
          OR assessment.point_in_time_policy IS DISTINCT FROM reference.point_in_time_policy
        THEN
          reasons := reasons || jsonb_build_array(jsonb_build_object(
            'code','point_in_time_mismatch',
            'detail','Point-in-time asOf or policy differs from the reference.'
          ));
        END IF;
      END IF;
      IF asset.id IS NOT NULL AND asset.valuation_status = 'unavailable' THEN
        reasons := reasons || jsonb_build_array(jsonb_build_object(
          'code','valuation_unavailable',
          'detail','Valuation is unavailable; no combined comparison is permitted.'
        ));
      END IF;
    END IF;
    IF jsonb_array_length(reasons) = 0
      AND asset.valuation_status = 'available' AND asset.combined_status = 'available'
    THEN
      expected_result := jsonb_build_object(
        'country', country_json,
        'status','comparable',
        'sourceManifestSha256', source_json->>'manifestSha256',
        'macroSuitability', asset.macro_score_text,
        'valuationSuitability', asset.valuation_score_text,
        'combinedSuitability', asset.combined_score_text
      );
    ELSE
      expected_result := jsonb_build_object(
        'country', country_json,
        'status','incomparable',
        'sourceManifestSha256', CASE WHEN source_json IS NULL
          THEN 'null'::jsonb ELSE to_jsonb(source_json->>'manifestSha256') END,
        'reasons', reasons
      );
    END IF;
    result_json := results->((ordinal - 1)::integer);
    IF result_json IS DISTINCT FROM expected_result THEN
      RAISE EXCEPTION 'comparison result does not match governed source assessments'
        USING ERRCODE = '23514';
    END IF;
    comparison_item.id := evidence.deterministic_uuid_v8(
      'economyos:capital-comparison-item:v1', comparison.id::text, ordinal::text
    );
    comparison_item.organization_id := comparison.organization_id;
    comparison_item.workspace_id := comparison.workspace_id;
    comparison_item.comparison_id := comparison.id;
    comparison_item.request_ordinal := ordinal;
    comparison_item.country_id := country_id;
    comparison_item.country_code := country_code;
    comparison_item.assessment_id := assessment.id;
    comparison_item.assessment_manifest_sha256 := CASE WHEN assessment.id IS NULL
      THEN NULL ELSE source_json->>'manifestSha256' END;
    comparison_item.comparison_status := expected_result->>'status';
    comparison_item.reasons := reasons;
    comparison_item.macro_suitability_text := CASE
      WHEN comparison_item.comparison_status = 'comparable' THEN asset.macro_score_text END;
    comparison_item.valuation_suitability_text := CASE
      WHEN comparison_item.comparison_status = 'comparable' THEN asset.valuation_score_text END;
    comparison_item.combined_suitability_text := CASE
      WHEN comparison_item.comparison_status = 'comparable' THEN asset.combined_score_text END;
    comparison_item.item_manifest := expected_result;
    comparison_item.item_sha256 := evidence.capital_json_digest(expected_result);
    INSERT INTO evidence.capital_country_comparison_items SELECT comparison_item.*;
  END LOOP;
  IF NOT comparison.reference_country_id = ANY(seen_country_ids)
    OR expected_sources IS DISTINCT FROM source_digests
  THEN RAISE EXCEPTION 'comparison reference or source order is invalid'
    USING ERRCODE = '23514'; END IF;
  RETURN comparison.id;
END
$$;

CREATE OR REPLACE FUNCTION app.get_capital_research_assessment(
  requested_workspace_id uuid,
  requested_assessment_id uuid
)
RETURNS TABLE (
  assessment_id uuid,
  country_id uuid,
  country_code text,
  strategy_key text,
  as_of timestamptz,
  model_artifact_id uuid,
  model_artifact_sha256 text,
  completion_id uuid,
  assessment_manifest jsonb,
  manifest_sha256 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
  SELECT assessment.id, assessment.country_id, assessment.country_code,
    assessment.strategy_key, assessment.as_of, assessment.model_artifact_id,
    assessment.model_artifact_sha256, completion.id,
    completion.assessment_manifest, completion.manifest_sha256
  FROM evidence.capital_research_assessments assessment
  JOIN evidence.capital_assessment_completions completion
    ON completion.organization_id = assessment.organization_id
    AND completion.workspace_id = assessment.workspace_id
    AND completion.assessment_id = assessment.id
  WHERE assessment.organization_id = app.current_organization_id()
    AND assessment.workspace_id = requested_workspace_id
    AND assessment.id = requested_assessment_id
    AND evidence.economic_state_workspace_visible(
      assessment.organization_id, assessment.workspace_id
    )
    AND evidence.capital_assessment_currently_servable_internal(
      assessment.organization_id, assessment.workspace_id, assessment.id
    )
$$;

CREATE OR REPLACE FUNCTION app.get_capital_country_comparison(
  requested_workspace_id uuid,
  requested_comparison_id uuid
)
RETURNS TABLE (
  comparison_id uuid,
  reference_country_id uuid,
  asset_class text,
  strategy_key text,
  created_at timestamptz,
  comparison_manifest jsonb,
  manifest_sha256 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
  SELECT comparison.id, comparison.reference_country_id,
    comparison.asset_class, comparison.strategy_key, comparison.created_at,
    comparison.comparison_manifest, comparison.manifest_sha256
  FROM evidence.capital_country_comparisons comparison
  WHERE comparison.organization_id = app.current_organization_id()
    AND comparison.workspace_id = requested_workspace_id
    AND comparison.id = requested_comparison_id
    AND evidence.economic_state_workspace_visible(
      comparison.organization_id, comparison.workspace_id
    )
    AND evidence.capital_comparison_currently_servable_internal(
      comparison.organization_id, comparison.workspace_id, comparison.id
    )
$$;

CREATE OR REPLACE FUNCTION evidence.verify_capital_embedded_manifest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  incoming jsonb := to_jsonb(NEW);
BEGIN
  IF evidence.capital_json_digest(incoming->TG_ARGV[0])
    IS DISTINCT FROM incoming->>TG_ARGV[1]
  THEN RAISE EXCEPTION '% embedded manifest digest is invalid', TG_TABLE_NAME
    USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER capital_research_assessments_verify
BEFORE INSERT ON evidence.capital_research_assessments
FOR EACH ROW EXECUTE FUNCTION evidence.verify_capital_canonical_record(
  'capital_research_assessment','header_manifest','header_sha256'
);
CREATE TRIGGER capital_assessment_evidence_bindings_verify
BEFORE INSERT ON evidence.capital_assessment_evidence_bindings
FOR EACH ROW EXECUTE FUNCTION evidence.verify_capital_canonical_record(
  'capital_assessment_evidence_binding','binding_manifest','binding_sha256'
);
CREATE TRIGGER capital_assessment_assets_verify
BEFORE INSERT ON evidence.capital_assessment_assets
FOR EACH ROW EXECUTE FUNCTION evidence.verify_capital_assessment_asset();
CREATE TRIGGER capital_assessment_completions_verify
BEFORE INSERT ON evidence.capital_assessment_completions
FOR EACH ROW EXECUTE FUNCTION evidence.verify_capital_assessment_completion();
CREATE TRIGGER capital_outcome_definitions_verify
BEFORE INSERT ON evidence.capital_outcome_definitions
FOR EACH ROW EXECUTE FUNCTION evidence.verify_capital_outcome_definition();
CREATE TRIGGER capital_validation_plans_verify
BEFORE INSERT ON evidence.capital_validation_plans
FOR EACH ROW EXECUTE FUNCTION evidence.verify_capital_validation_plan();
CREATE TRIGGER capital_validation_folds_verify
BEFORE INSERT ON evidence.capital_validation_folds
FOR EACH ROW EXECUTE FUNCTION evidence.verify_capital_embedded_manifest(
  'fold_manifest','fold_sha256'
);
CREATE TRIGGER capital_country_comparisons_verify
BEFORE INSERT ON evidence.capital_country_comparisons
FOR EACH ROW EXECUTE FUNCTION evidence.verify_capital_country_comparison();
CREATE TRIGGER capital_country_comparison_items_verify
BEFORE INSERT ON evidence.capital_country_comparison_items
FOR EACH ROW EXECUTE FUNCTION evidence.verify_capital_embedded_manifest(
  'item_manifest','item_sha256'
);

CREATE TRIGGER capital_research_assessments_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.capital_research_assessments
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER capital_assessment_evidence_bindings_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.capital_assessment_evidence_bindings
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER capital_assessment_assets_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.capital_assessment_assets
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER capital_assessment_completions_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.capital_assessment_completions
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER capital_outcome_definitions_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.capital_outcome_definitions
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER capital_validation_plans_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.capital_validation_plans
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER capital_validation_folds_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.capital_validation_folds
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER capital_country_comparisons_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.capital_country_comparisons
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER capital_country_comparison_items_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.capital_country_comparison_items
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

DO $capital_rls$
DECLARE
  relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'capital_research_assessments','capital_assessment_evidence_bindings',
    'capital_assessment_assets','capital_assessment_completions',
    'capital_outcome_definitions','capital_validation_plans','capital_validation_folds',
    'capital_country_comparisons','capital_country_comparison_items'
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
      'REVOKE ALL ON TABLE evidence.%I FROM economyos_app, economyos_ingest', relation_name
    );
  END LOOP;
END
$capital_rls$;

CREATE INDEX capital_assessments_lookup_idx
  ON evidence.capital_research_assessments(
    organization_id, workspace_id, country_id, as_of DESC, id DESC
  );
CREATE INDEX capital_evidence_assessment_idx
  ON evidence.capital_assessment_evidence_bindings(
    organization_id, workspace_id, assessment_id, asset_class, evidence_role, evidence_id
  );
CREATE INDEX capital_assets_assessment_idx
  ON evidence.capital_assessment_assets(
    organization_id, workspace_id, assessment_id,
    evidence.capital_asset_ordinal(asset_class)
  );
CREATE INDEX capital_validation_outcome_idx
  ON evidence.capital_validation_plans(
    organization_id, workspace_id, outcome_definition_id, created_at DESC
  );
CREATE INDEX capital_comparison_items_source_idx
  ON evidence.capital_country_comparison_items(
    organization_id, workspace_id, assessment_id, comparison_id
  ) WHERE assessment_id IS NOT NULL;

DO $capital_revoke_functions$
DECLARE
  signature regprocedure;
BEGIN
  FOR signature IN
    SELECT procedure.oid::regprocedure
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'evidence'
      AND procedure.proname LIKE '%capital%'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, economyos_app, economyos_ingest', signature
    );
  END LOOP;
END
$capital_revoke_functions$;

REVOKE ALL ON FUNCTION app.get_capital_research_assessment(uuid,uuid)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.get_capital_country_comparison(uuid,uuid)
  FROM PUBLIC, economyos_ingest;

GRANT EXECUTE ON FUNCTION evidence.prepare_capital_research_assessment(
  uuid,uuid,uuid,text,text,timestamptz,timestamptz,timestamptz,
  uuid,uuid,uuid,text,text[],text[],jsonb,jsonb
) TO economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.bind_capital_assessment_evidence(
  uuid,uuid,text,text,uuid,text,text,text,integer,text,uuid
) TO economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.append_capital_assessment_asset(uuid,uuid,jsonb)
  TO economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.complete_capital_research_assessment(uuid,uuid)
  TO economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.create_capital_validation_plan(uuid,jsonb)
  TO economyos_ingest;

GRANT EXECUTE ON FUNCTION evidence.create_capital_outcome_definition(uuid,jsonb)
  TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.create_capital_country_comparison(uuid,jsonb)
  TO economyos_app;
GRANT EXECUTE ON FUNCTION app.get_capital_research_assessment(uuid,uuid)
  TO economyos_app;
GRANT EXECUTE ON FUNCTION app.get_capital_country_comparison(uuid,uuid)
  TO economyos_app;

COMMENT ON TABLE evidence.capital_research_assessments IS
  'Immutable candidate research identity with strict system/knowledge cutoffs; never advice.';
COMMENT ON TABLE evidence.capital_assessment_assets IS
  'Canonical Phase 6 asset result retaining separate macro, valuation, and combined states and contributions.';
COMMENT ON TABLE evidence.capital_country_comparisons IS
  'Request-ordered country comparison evidence with no rank, winner, allocation, or recommendation.';
COMMENT ON FUNCTION app.get_capital_research_assessment(uuid,uuid) IS
  'Non-enumerating bounded full manifest for one completed and currently servable research assessment.';
COMMENT ON FUNCTION app.get_capital_country_comparison(uuid,uuid) IS
  'Non-enumerating bounded request-ordered comparison manifest with structured incomparability reasons and no ranks.';
