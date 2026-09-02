-- Canonical observations become serveable only after the durable workflow has
-- atomically committed terminal success. Earlier releases/observations remain
-- append-only crash evidence, but cannot cross the serving boundary.

CREATE TABLE evidence.canonical_admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE,
  tenant_scope uuid GENERATED ALWAYS AS (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  observation_id uuid NOT NULL,
  transformation_run_id uuid NOT NULL,
  release_id uuid NOT NULL,
  ingestion_run_id uuid,
  basis text NOT NULL CHECK (basis IN ('durable_ingestion_v1', 'legacy_verified_v1')),
  output_manifest_sha256 text
    CHECK (output_manifest_sha256 IS NULL OR output_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  admission_manifest jsonb NOT NULL CHECK (jsonb_typeof(admission_manifest) = 'object'),
  admission_sha256 text NOT NULL CHECK (admission_sha256 ~ '^[0-9a-f]{64}$'),
  admitted_at timestamptz NOT NULL CHECK (isfinite(admitted_at)),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(created_at)),
  FOREIGN KEY (tenant_scope, observation_id)
    REFERENCES evidence.observations(tenant_scope, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_scope, transformation_run_id)
    REFERENCES evidence.transformation_runs(tenant_scope, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_scope, release_id)
    REFERENCES evidence.releases(tenant_scope, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_scope, ingestion_run_id)
    REFERENCES evidence.ingestion_runs(tenant_scope, id) ON DELETE RESTRICT,
  CHECK (
    (basis = 'durable_ingestion_v1'
      AND ingestion_run_id IS NOT NULL AND output_manifest_sha256 IS NOT NULL)
    OR
    (basis = 'legacy_verified_v1'
      AND ingestion_run_id IS NULL AND output_manifest_sha256 IS NULL)
  ),
  UNIQUE (tenant_scope, observation_id),
  UNIQUE (tenant_scope, id)
);

CREATE OR REPLACE FUNCTION evidence.verify_canonical_admission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  observation evidence.observations%ROWTYPE;
  transformation evidence.transformation_runs%ROWTYPE;
  expected_manifest jsonb;
  calculated_sha256 text;
BEGIN
  SELECT * INTO observation
  FROM evidence.observations candidate
  WHERE candidate.id = NEW.observation_id
    AND candidate.tenant_scope = NEW.tenant_scope;
  SELECT * INTO transformation
  FROM evidence.transformation_runs candidate
  WHERE candidate.id = NEW.transformation_run_id
    AND candidate.tenant_scope = NEW.tenant_scope;

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
        AND run.tenant_scope = NEW.tenant_scope
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

CREATE TRIGGER canonical_admissions_verify
BEFORE INSERT ON evidence.canonical_admissions
FOR EACH ROW EXECUTE FUNCTION evidence.verify_canonical_admission();
CREATE TRIGGER canonical_admissions_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.canonical_admissions
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

ALTER TABLE evidence.canonical_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.canonical_admissions FORCE ROW LEVEL SECURITY;
CREATE POLICY canonical_admissions_tenant ON evidence.canonical_admissions
  USING (evidence.tenant_visible(organization_id))
  WITH CHECK (evidence.tenant_visible(organization_id));
CREATE INDEX canonical_admissions_transformation_idx
  ON evidence.canonical_admissions (tenant_scope, transformation_run_id, observation_id);

REVOKE ALL ON TABLE evidence.canonical_admissions FROM PUBLIC;
GRANT SELECT ON evidence.canonical_admissions TO economyos_app, economyos_ingest;
REVOKE INSERT, UPDATE, DELETE ON evidence.canonical_admissions
  FROM economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.verify_canonical_admission() FROM PUBLIC;

CREATE OR REPLACE FUNCTION evidence.register_completed_ingestion_admissions(
  requested_run_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  run evidence.ingestion_runs%ROWTYPE;
  transformation evidence.transformation_runs%ROWTYPE;
  release evidence.releases%ROWTYPE;
  output_observation_ids jsonb;
  sorted_observation_ids jsonb;
  output_transformation_id uuid;
  output_release_id uuid;
  output_payload_id uuid;
  observation_count integer;
  distinct_observation_count integer;
  expected_observation_sha256 text;
  expected_manifest jsonb;
  expected_manifest_sha256 text;
BEGIN
  SELECT * INTO run
  FROM evidence.ingestion_runs candidate
  WHERE candidate.id = requested_run_id
  FOR SHARE;
  IF run.id IS NULL OR run.status <> 'succeeded'
    OR run.output_manifest IS NULL OR run.output_sha256 IS NULL
  THEN
    RAISE EXCEPTION 'canonical registration requires a terminal successful ingestion run'
      USING ERRCODE = '23514';
  END IF;
  IF run.output_manifest->'schemaVersion' <> '1'::jsonb
    OR run.output_manifest->>'runId' <> run.id::text
    OR run.output_manifest->>'status' <> 'succeeded'
    OR run.output_manifest->>'inputSha256' <> run.input_sha256
    OR jsonb_typeof(run.output_manifest->'rawPayloads') <> 'array'
    OR jsonb_array_length(run.output_manifest->'rawPayloads') <> 1
    OR jsonb_typeof(run.output_manifest->'observationIds') <> 'array'
    OR jsonb_typeof(run.output_manifest->'qualityResults') <> 'array'
    OR jsonb_typeof(run.output_manifest->'reconciliation') <> 'object'
    OR run.output_manifest->>'completedAt' IS NULL
  THEN
    RAISE EXCEPTION 'successful ingestion output manifest shape is invalid'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(run.output_manifest->'observationIds') entry
    WHERE jsonb_typeof(entry) <> 'string'
  ) THEN
    RAISE EXCEPTION 'successful ingestion observation IDs must be strings'
      USING ERRCODE = '23514';
  END IF;

  BEGIN
    output_transformation_id := (run.output_manifest->>'transformationRunId')::uuid;
    output_release_id := (run.output_manifest->>'releaseId')::uuid;
    output_payload_id := (run.output_manifest->'rawPayloads'->0->>'payloadId')::uuid;
    IF (run.output_manifest->>'completedAt')::timestamptz <> run.completed_at THEN
      RAISE EXCEPTION 'successful ingestion completion time does not match terminal state'
        USING ERRCODE = '23514';
    END IF;
  EXCEPTION
    WHEN invalid_text_representation OR datetime_field_overflow THEN
      RAISE EXCEPTION 'successful ingestion output identity is malformed'
        USING ERRCODE = '23514';
  END;

  SELECT * INTO transformation
  FROM evidence.transformation_runs candidate
  WHERE candidate.id = output_transformation_id
    AND candidate.tenant_scope = run.tenant_scope;
  SELECT * INTO release
  FROM evidence.releases candidate
  WHERE candidate.id = output_release_id
    AND candidate.tenant_scope = run.tenant_scope;
  IF transformation.id IS NULL OR release.id IS NULL
    OR transformation.status <> 'succeeded'
    OR transformation.ingestion_run_id <> run.id
    OR transformation.dataset_id <> run.dataset_id
    OR transformation.raw_payload_id <> output_payload_id
    OR release.dataset_id <> run.dataset_id
    OR release.raw_payload_id <> output_payload_id
  THEN
    RAISE EXCEPTION 'successful ingestion output does not match transformation/release identity'
      USING ERRCODE = '23514';
  END IF;

  output_observation_ids := run.output_manifest->'observationIds';
  SELECT
    count(*), count(DISTINCT value),
    coalesce(jsonb_agg(value ORDER BY value COLLATE "C"), '[]'::jsonb)
  INTO observation_count, distinct_observation_count, sorted_observation_ids
  FROM jsonb_array_elements_text(output_observation_ids) item(value);
  IF observation_count <> distinct_observation_count
    OR output_observation_ids <> sorted_observation_ids
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(output_observation_ids) item(value)
      WHERE value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  THEN
    RAISE EXCEPTION 'successful ingestion observation IDs must be unique sorted UUIDs'
      USING ERRCODE = '23514';
  END IF;
  expected_observation_sha256 := encode(digest(
    convert_to(evidence.canonical_json(output_observation_ids), 'UTF8'), 'sha256'
  ), 'hex');
  IF run.output_manifest->>'observationSetSha256' <> expected_observation_sha256
    OR (SELECT count(*) FROM evidence.observations observation
        WHERE observation.tenant_scope = run.tenant_scope
          AND observation.transformation_run_id = transformation.id) <> observation_count
    OR EXISTS (
      SELECT 1
      FROM evidence.observations observation
      WHERE observation.tenant_scope = run.tenant_scope
        AND observation.transformation_run_id = transformation.id
        AND (
          observation.release_id <> release.id
          OR NOT (output_observation_ids ? observation.id::text)
        )
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(output_observation_ids) item(value)
      WHERE NOT EXISTS (
        SELECT 1 FROM evidence.observations observation
        WHERE observation.id = item.value::uuid
          AND observation.tenant_scope = run.tenant_scope
          AND observation.transformation_run_id = transformation.id
          AND observation.release_id = release.id
      )
    )
  THEN
    RAISE EXCEPTION 'successful ingestion observation set differs from canonical rows'
      USING ERRCODE = '23514';
  END IF;

  IF run.output_manifest->'reconciliation'->>'expectedRows' <> observation_count::text
    OR run.output_manifest->'reconciliation'->>'persistedRows' <> observation_count::text
    OR run.output_manifest->'reconciliation'->'missingPeriods' <> '[]'::jsonb
    OR run.output_manifest->'reconciliation'->'unexpectedPeriods' <> '[]'::jsonb
    OR run.output_manifest->'reconciliation'->'mismatchedPeriods' <> '[]'::jsonb
    OR run.output_manifest->'reconciliation'->>'checkpointSha256' !~ '^[0-9a-f]{64}$'
    OR NOT EXISTS (
      SELECT 1 FROM evidence.ingestion_checkpoints checkpoint
      WHERE checkpoint.tenant_scope = run.tenant_scope
        AND checkpoint.ingestion_run_id = run.id
        AND checkpoint.stage = 'quality'
        AND checkpoint.checkpoint_key = transformation.id::text
        AND checkpoint.value->>'transformationRunId' = transformation.id::text
        AND checkpoint.value->>'candidateSha256' = run.output_manifest->>'candidateSha256'
        AND checkpoint.value->'score' = run.output_manifest->'qualityScore'
    )
    OR NOT EXISTS (
      SELECT 1 FROM evidence.ingestion_checkpoints checkpoint
      WHERE checkpoint.tenant_scope = run.tenant_scope
        AND checkpoint.ingestion_run_id = run.id
        AND checkpoint.stage = 'promote'
        AND checkpoint.checkpoint_key = transformation.id::text
        AND checkpoint.value = jsonb_build_object(
          'releaseId', release.id::text,
          'observationIds', output_observation_ids,
          'observationSetSha256', expected_observation_sha256
        )
    )
    OR NOT EXISTS (
      SELECT 1 FROM evidence.ingestion_checkpoints checkpoint
      WHERE checkpoint.tenant_scope = run.tenant_scope
        AND checkpoint.ingestion_run_id = run.id
        AND checkpoint.stage = 'lineage'
        AND checkpoint.checkpoint_key = transformation.id::text
        AND checkpoint.value->>'transformationRunId' = transformation.id::text
        AND checkpoint.value->>'edgeCount' = (observation_count + 2)::text
    )
    OR NOT EXISTS (
      SELECT 1 FROM evidence.ingestion_checkpoints checkpoint
      WHERE checkpoint.tenant_scope = run.tenant_scope
        AND checkpoint.ingestion_run_id = run.id
        AND checkpoint.stage = 'reconcile'
        AND checkpoint.checkpoint_key = 'canonical-periods'
        AND checkpoint.value = run.output_manifest->'reconciliation'
    )
  THEN
    RAISE EXCEPTION 'successful ingestion lacks matching quality/promote/lineage/reconcile checkpoints'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
      SELECT 1 FROM evidence.lineage_edges edge
      WHERE edge.organization_id IS NOT DISTINCT FROM run.organization_id
        AND edge.from_type = 'payload' AND edge.from_id = output_payload_id
        AND edge.to_type = 'run' AND edge.to_id = transformation.id
        AND edge.relation = 'parsed_into'
    ) OR NOT EXISTS (
      SELECT 1 FROM evidence.lineage_edges edge
      WHERE edge.organization_id IS NOT DISTINCT FROM run.organization_id
        AND edge.from_type = 'run' AND edge.from_id = transformation.id
        AND edge.to_type = 'release' AND edge.to_id = release.id
        AND edge.relation = 'produced'
    ) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(output_observation_ids) item(value)
      WHERE NOT EXISTS (
        SELECT 1 FROM evidence.lineage_edges edge
        WHERE edge.organization_id IS NOT DISTINCT FROM run.organization_id
          AND edge.from_type = 'release' AND edge.from_id = release.id
          AND edge.to_type = 'observation' AND edge.to_id = item.value::uuid
          AND edge.relation = 'produced'
      )
    )
  THEN
    RAISE EXCEPTION 'successful ingestion lacks complete immutable lineage'
      USING ERRCODE = '23514';
  END IF;

  FOR expected_manifest IN
    SELECT jsonb_build_object(
      'schemaVersion', 1,
      'basis', 'durable_ingestion_v1',
      'observationId', observation.id::text,
      'transformationRunId', transformation.id::text,
      'releaseId', release.id::text,
      'ingestionRunId', run.id::text,
      'outputManifestSha256', run.output_sha256,
      'parserCodeSha256', transformation.code_sha256,
      'configurationSha256', transformation.configuration_sha256
    )
    FROM evidence.observations observation
    WHERE observation.tenant_scope = run.tenant_scope
      AND observation.transformation_run_id = transformation.id
    ORDER BY observation.id
  LOOP
    expected_manifest_sha256 := encode(digest(
      convert_to(evidence.canonical_json(expected_manifest), 'UTF8'), 'sha256'
    ), 'hex');
    INSERT INTO evidence.canonical_admissions (
      organization_id, observation_id, transformation_run_id, release_id,
      ingestion_run_id, basis, output_manifest_sha256, admission_manifest,
      admission_sha256, admitted_at
    ) VALUES (
      run.organization_id,
      (expected_manifest->>'observationId')::uuid,
      transformation.id,
      release.id,
      run.id,
      'durable_ingestion_v1',
      run.output_sha256,
      expected_manifest,
      expected_manifest_sha256,
      run.completed_at
    ) ON CONFLICT (tenant_scope, observation_id) DO NOTHING;

    IF NOT EXISTS (
      SELECT 1 FROM evidence.canonical_admissions admission
      WHERE admission.tenant_scope = run.tenant_scope
        AND admission.observation_id = (expected_manifest->>'observationId')::uuid
        AND admission.ingestion_run_id = run.id
        AND admission.admission_sha256 = expected_manifest_sha256
    ) THEN
      RAISE EXCEPTION 'canonical admission replay differs from committed evidence'
        USING ERRCODE = '40001';
    END IF;
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION evidence.register_completed_ingestion_admissions(uuid) FROM PUBLIC;

-- Replace the terminal transition so success and serving admission are one
-- database transaction. A registration failure rolls the run back to running.
CREATE OR REPLACE FUNCTION evidence.transition_ingestion_run(
  requested_run_id uuid,
  expected_status text,
  next_status text,
  requested_stage text,
  requested_attempt integer,
  requested_details jsonb,
  requested_output_manifest jsonb DEFAULT NULL,
  requested_error_code text DEFAULT NULL,
  requested_occurred_at timestamptz DEFAULT statement_timestamp()
)
RETURNS evidence.ingestion_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  run evidence.ingestion_runs%ROWTYPE;
  prior_event evidence.ingestion_run_events%ROWTYPE;
  next_sequence integer;
  output_digest text;
BEGIN
  IF expected_status NOT IN ('pending', 'running')
    OR next_status NOT IN ('running', 'succeeded', 'failed', 'quarantined')
    OR requested_stage NOT IN (
      'workflow', 'fetch', 'persist', 'parse', 'quality', 'promote', 'lineage', 'reconcile'
    )
    OR requested_attempt NOT BETWEEN 1 AND 100
    OR jsonb_typeof(requested_details) <> 'object'
    OR NOT isfinite(requested_occurred_at)
  THEN
    RAISE EXCEPTION 'invalid ingestion transition input' USING ERRCODE = '22023';
  END IF;

  IF next_status = 'succeeded' THEN
    IF requested_output_manifest IS NULL OR jsonb_typeof(requested_output_manifest) <> 'object'
      OR requested_error_code IS NOT NULL
    THEN
      RAISE EXCEPTION 'successful ingestion requires only an output manifest'
        USING ERRCODE = '22023';
    END IF;
    output_digest := encode(digest(
      convert_to(evidence.canonical_json(requested_output_manifest), 'UTF8'), 'sha256'
    ), 'hex');
  ELSIF next_status = 'quarantined' THEN
    IF requested_output_manifest IS NULL OR jsonb_typeof(requested_output_manifest) <> 'object'
      OR requested_error_code <> 'QUALITY_GATE_FAILED'
    THEN
      RAISE EXCEPTION 'quarantined ingestion requires its evidence manifest and quality error code'
        USING ERRCODE = '22023';
    END IF;
    output_digest := encode(digest(
      convert_to(evidence.canonical_json(requested_output_manifest), 'UTF8'), 'sha256'
    ), 'hex');
  ELSIF next_status = 'failed' THEN
    IF requested_output_manifest IS NOT NULL
      OR requested_error_code IS NULL
      OR requested_error_code !~ '^[A-Z][A-Z0-9_]{1,127}$'
    THEN
      RAISE EXCEPTION 'failed ingestion requires only a safe error code'
        USING ERRCODE = '22023';
    END IF;
  ELSIF requested_output_manifest IS NOT NULL OR requested_error_code IS NOT NULL THEN
    RAISE EXCEPTION 'running ingestion cannot have terminal output' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO run FROM evidence.ingestion_runs WHERE id = requested_run_id FOR UPDATE;
  IF NOT FOUND
    OR NOT (run.organization_id IS NULL OR run.organization_id = app.current_organization_id())
  THEN
    RAISE EXCEPTION 'ingestion run is not visible in the current tenant' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO prior_event
  FROM evidence.ingestion_run_events event
  WHERE event.tenant_scope = run.tenant_scope
    AND event.ingestion_run_id = run.id
    AND event.stage = requested_stage
    AND event.status = next_status
    AND event.attempt = requested_attempt;
  IF FOUND THEN
    IF prior_event.details IS DISTINCT FROM requested_details
      OR prior_event.occurred_at IS DISTINCT FROM requested_occurred_at
      OR (next_status IN ('succeeded', 'quarantined')
        AND (run.output_manifest IS DISTINCT FROM requested_output_manifest
          OR run.output_sha256 IS DISTINCT FROM output_digest))
      OR (next_status IN ('failed', 'quarantined')
        AND run.error_code IS DISTINCT FROM requested_error_code)
    THEN
      RAISE EXCEPTION 'ingestion transition replay differs from the committed event'
        USING ERRCODE = '40001';
    END IF;
    RETURN run;
  END IF;

  IF run.status <> expected_status THEN
    RAISE EXCEPTION 'ingestion run status conflict' USING ERRCODE = '40001';
  END IF;
  IF requested_occurred_at < run.requested_at OR EXISTS (
    SELECT 1 FROM evidence.ingestion_run_events event
    WHERE event.tenant_scope = run.tenant_scope
      AND event.ingestion_run_id = run.id
      AND event.occurred_at > requested_occurred_at
  ) THEN
    RAISE EXCEPTION 'ingestion event time cannot precede the run history'
      USING ERRCODE = '22023';
  END IF;

  UPDATE evidence.ingestion_runs
  SET status = next_status,
      started_at = coalesce(started_at, requested_occurred_at),
      completed_at = CASE WHEN next_status IN ('succeeded', 'failed', 'quarantined')
        THEN requested_occurred_at ELSE NULL END,
      output_manifest = requested_output_manifest,
      output_sha256 = output_digest,
      error_code = requested_error_code
  WHERE id = run.id
  RETURNING * INTO run;

  SELECT coalesce(max(event_sequence), 0) + 1 INTO next_sequence
  FROM evidence.ingestion_run_events
  WHERE tenant_scope = run.tenant_scope AND ingestion_run_id = run.id;
  INSERT INTO evidence.ingestion_run_events (
    organization_id, ingestion_run_id, event_sequence, stage, status, attempt, details, occurred_at
  ) VALUES (
    run.organization_id, run.id, next_sequence, requested_stage, next_status,
    requested_attempt, requested_details, requested_occurred_at
  );
  IF next_status = 'succeeded' THEN
    PERFORM evidence.register_completed_ingestion_admissions(run.id);
  END IF;
  RETURN run;
END
$$;

REVOKE ALL ON FUNCTION evidence.transition_ingestion_run(
  uuid, text, text, text, integer, jsonb, jsonb, text, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evidence.transition_ingestion_run(
  uuid, text, text, text, integer, jsonb, jsonb, text, timestamptz
) TO economyos_ingest;

-- Existing durable successes are admitted only if the new completion proof can
-- be reconstructed. Invalid/incomplete historical runs remain safely hidden.
DO $backfill_durable_admissions$
DECLARE
  candidate record;
BEGIN
  FOR candidate IN
    SELECT id FROM evidence.ingestion_runs WHERE status = 'succeeded' ORDER BY id
  LOOP
    BEGIN
      PERFORM evidence.register_completed_ingestion_admissions(candidate.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'leaving historical ingestion run % unadmitted: %', candidate.id, SQLERRM;
    END;
  END LOOP;
END
$backfill_durable_admissions$;

-- Freeze only genuinely pre-durable evidence (no linked ingestion run) as a
-- one-time legacy set. New null-linked transformations cannot gain admission.
WITH candidates AS (
  SELECT
    observation.organization_id,
    observation.id AS observation_id,
    observation.transformation_run_id,
    observation.release_id,
    transformation.completed_at,
    jsonb_build_object(
      'schemaVersion', 1,
      'basis', 'legacy_verified_v1',
      'observationId', observation.id::text,
      'transformationRunId', observation.transformation_run_id::text,
      'releaseId', observation.release_id::text,
      'ingestionRunId', NULL,
      'outputManifestSha256', NULL,
      'parserCodeSha256', transformation.code_sha256,
      'configurationSha256', transformation.configuration_sha256
    ) AS manifest
  FROM evidence.observations observation
  JOIN evidence.transformation_runs transformation
    ON transformation.id = observation.transformation_run_id
    AND transformation.tenant_scope = observation.tenant_scope
  WHERE transformation.ingestion_run_id IS NULL
    AND transformation.status = 'succeeded'
    AND EXISTS (
      SELECT 1 FROM evidence.quality_results quality
      WHERE quality.tenant_scope = observation.tenant_scope
        AND quality.transformation_run_id = transformation.id
        AND quality.check_code = 'admission' AND quality.status = 'pass'
    )
    AND NOT EXISTS (
      SELECT 1 FROM evidence.quality_results quality
      WHERE quality.tenant_scope = observation.tenant_scope
        AND quality.transformation_run_id = transformation.id
        AND quality.status = 'fail'
    )
)
INSERT INTO evidence.canonical_admissions (
  organization_id, observation_id, transformation_run_id, release_id,
  basis, admission_manifest, admission_sha256, admitted_at
)
SELECT
  organization_id, observation_id, transformation_run_id, release_id,
  'legacy_verified_v1', manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  completed_at
FROM candidates
ON CONFLICT (tenant_scope, observation_id) DO NOTHING;

COMMENT ON TABLE evidence.canonical_admissions IS
  'Immutable serving gate: durable rows are created atomically with terminal successful ingestion; legacy rows are a one-time migration set.';
COMMENT ON FUNCTION evidence.register_completed_ingestion_admissions(uuid) IS
  'Validates exact output, checkpoints, canonical rows, and lineage before atomically admitting observations for serving.';

CREATE OR REPLACE FUNCTION evidence.canonical_observation_is_admitted(
  requested_observation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM evidence.canonical_admissions admission
    WHERE admission.observation_id = requested_observation_id
      AND evidence.tenant_visible(admission.organization_id)
  )
$$;

REVOKE ALL ON FUNCTION evidence.canonical_observation_is_admitted(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION evidence.governed_observations_as_known(
  requested_series_id uuid,
  known_at timestamptz,
  visibility_policy text,
  system_at timestamptz DEFAULT NULL,
  requested_action text DEFAULT 'view',
  maximum_rows integer DEFAULT 1000
)
RETURNS TABLE (
  observation_id uuid,
  series_id uuid,
  release_id uuid,
  raw_payload_id uuid,
  transformation_run_id uuid,
  period_start timestamptz,
  period_end timestamptz,
  value_numeric numeric,
  missing_reason text,
  observation_status text,
  parser_version text,
  release_time timestamptz,
  availability_time timestamptz,
  retrieved_at timestamptz,
  pit_quality text,
  recorded_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
BEGIN
  IF app.current_organization_id() IS NULL THEN
    RAISE EXCEPTION 'tenant context is required' USING ERRCODE = '42501';
  END IF;
  IF NOT isfinite(known_at) OR (system_at IS NOT NULL AND NOT isfinite(system_at)) THEN
    RAISE EXCEPTION 'point-in-time cutoffs must be finite' USING ERRCODE = '22023';
  END IF;
  IF visibility_policy NOT IN ('true_vintage', 'reconstructed', 'latest_revised') THEN
    RAISE EXCEPTION 'invalid visibility policy' USING ERRCODE = '22023';
  END IF;
  IF requested_action NOT IN ('view', 'api', 'export', 'derive', 'train') THEN
    RAISE EXCEPTION 'invalid data action' USING ERRCODE = '22023';
  END IF;
  IF maximum_rows NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'maximum_rows must be between 1 and 10000' USING ERRCODE = '22023';
  END IF;
  IF visibility_policy = 'reconstructed' AND system_at IS NULL THEN
    RAISE EXCEPTION 'reconstructed policy requires system_at' USING ERRCODE = '22023';
  END IF;
  IF visibility_policy = 'latest_revised' AND system_at IS NOT NULL THEN
    RAISE EXCEPTION 'latest_revised cannot claim historical system time'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (observation.period_start, observation.period_end)
    observation.id,
    observation.series_id,
    observation.release_id,
    release.raw_payload_id,
    observation.transformation_run_id,
    observation.period_start,
    observation.period_end,
    observation.value_numeric,
    observation.missing_reason,
    observation.status,
    observation.parser_version,
    release.release_time,
    release.availability_time,
    payload.fetched_at,
    release.pit_quality,
    observation.recorded_at
  FROM evidence.observations observation
  JOIN evidence.releases release
    ON release.id = observation.release_id AND release.tenant_scope = observation.tenant_scope
  JOIN evidence.raw_payloads payload
    ON payload.id = release.raw_payload_id AND payload.tenant_scope = release.tenant_scope
  JOIN evidence.series series
    ON series.id = observation.series_id AND series.tenant_scope = observation.tenant_scope
  JOIN evidence.source_datasets dataset
    ON dataset.id = series.dataset_id AND dataset.tenant_scope = series.tenant_scope
  JOIN evidence.sources source
    ON source.id = dataset.source_id AND source.tenant_scope = dataset.tenant_scope
  JOIN evidence.transformation_runs transformation
    ON transformation.id = observation.transformation_run_id
      AND transformation.tenant_scope = observation.tenant_scope
  WHERE observation.series_id = requested_series_id
    AND (
      observation.organization_id IS NULL
      OR observation.organization_id = app.current_organization_id()
    )
    AND series.data_class NOT IN ('synthetic_demo', 'synthetic_research')
    AND series.status = 'active'
    AND dataset.admission_status = 'approved'
    AND dataset.admitted_at IS NOT NULL
    AND source.license_status = 'approved'
    AND source.license_review_id IS NOT NULL
    AND (
      source.license_review_expires_at IS NULL
      OR source.license_review_expires_at > statement_timestamp()
    )
    AND requested_action = ANY(source.permitted_actions)
    AND (requested_action <> 'export' OR source.redistribution_allowed = true)
    AND transformation.status = 'succeeded'
    AND evidence.canonical_observation_is_admitted(observation.id)
    AND observation.period_end <= known_at
    AND EXISTS (
      SELECT 1 FROM evidence.quality_results quality
      WHERE quality.transformation_run_id = observation.transformation_run_id
        AND quality.tenant_scope = observation.tenant_scope
        AND quality.check_code = 'admission'
        AND quality.status = 'pass'
    )
    AND NOT EXISTS (
      SELECT 1 FROM evidence.quality_results quality
      WHERE quality.transformation_run_id = observation.transformation_run_id
        AND quality.tenant_scope = observation.tenant_scope
        AND quality.status = 'fail'
    )
    AND CASE visibility_policy
      WHEN 'true_vintage' THEN
        release.pit_quality = 'true_vintage'
        AND release.release_time IS NOT NULL
        AND release.source_publication_time IS NOT NULL
        AND release.availability_time IS NOT NULL
        AND release.release_time <= known_at
        AND release.source_publication_time <= known_at
        AND release.availability_time <= known_at
        AND payload.fetched_at <= known_at
        AND (system_at IS NULL OR observation.recorded_at <= system_at)
      WHEN 'reconstructed' THEN
        release.pit_quality IN ('true_vintage', 'reconstructed_only')
        AND release.release_time IS NOT NULL
        AND release.availability_time IS NOT NULL
        AND release.release_time <= known_at
        AND release.availability_time <= known_at
        AND payload.fetched_at <= system_at
        AND transformation.completed_at <= system_at
        AND observation.recorded_at <= system_at
      WHEN 'latest_revised' THEN true
      ELSE false
    END
  ORDER BY
    observation.period_start,
    observation.period_end,
    release.revision_sequence DESC NULLS LAST,
    release.revision_time DESC NULLS LAST,
    release.release_time DESC NULLS LAST,
    observation.recorded_at DESC,
    observation.id DESC
  LIMIT maximum_rows;
END
$$;

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
  IF app.current_organization_id() IS NULL THEN
    RAISE EXCEPTION 'tenant context is required' USING ERRCODE = '42501';
  END IF;
  IF requested_action NOT IN ('view', 'api', 'export', 'derive', 'train') THEN
    RAISE EXCEPTION 'invalid data action' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_build_object(
    'observationId', observation.id,
    'seriesId', observation.series_id,
    'dataset', jsonb_build_object('id', dataset.id, 'externalKey', dataset.external_key),
    'source', jsonb_build_object(
      'id', source.id,
      'name', source.name,
      'homepageUri', source.homepage_uri,
      'license', source.license_expression,
      'attribution', source.attribution_text
    ),
    'rawPayload', jsonb_build_object(
      'id', payload.id,
      'objectUri', payload.object_uri,
      'checksumSha256', payload.checksum_sha256,
      'byteLength', payload.byte_length,
      'fetchedAt', payload.fetched_at
    ),
    'release', jsonb_build_object(
      'id', release.id,
      'releaseTime', release.release_time,
      'availabilityTime', release.availability_time,
      'pitQuality', release.pit_quality
    ),
    'transformation', jsonb_build_object(
      'id', transformation.id,
      'parser', transformation.parser_name,
      'parserVersion', transformation.parser_version,
      'codeSha256', transformation.code_sha256,
      'configurationSha256', transformation.configuration_sha256,
      'attempt', transformation.attempt
    ),
    'canonicalAdmission', jsonb_build_object(
      'basis', admission.basis,
      'manifestSha256', admission.admission_sha256,
      'outputManifestSha256', admission.output_manifest_sha256,
      'admittedAt', admission.admitted_at
    ),
    'quality', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'code', quality.check_code,
        'status', quality.status,
        'details', quality.details,
        'checkedAt', quality.checked_at
      ) ORDER BY quality.check_code)
      FROM evidence.quality_results quality
      WHERE quality.transformation_run_id = transformation.id
        AND quality.tenant_scope = transformation.tenant_scope
    ), '[]'::jsonb)
  ) INTO result
  FROM evidence.observations observation
  JOIN evidence.canonical_admissions admission
    ON admission.observation_id = observation.id
    AND admission.tenant_scope = observation.tenant_scope
  JOIN evidence.releases release
    ON release.id = observation.release_id AND release.tenant_scope = observation.tenant_scope
  JOIN evidence.raw_payloads payload
    ON payload.id = release.raw_payload_id AND payload.tenant_scope = release.tenant_scope
  JOIN evidence.series series
    ON series.id = observation.series_id AND series.tenant_scope = observation.tenant_scope
  JOIN evidence.source_datasets dataset
    ON dataset.id = series.dataset_id AND dataset.tenant_scope = series.tenant_scope
  JOIN evidence.sources source
    ON source.id = dataset.source_id AND source.tenant_scope = dataset.tenant_scope
  JOIN evidence.transformation_runs transformation
    ON transformation.id = observation.transformation_run_id
      AND transformation.tenant_scope = observation.tenant_scope
  WHERE observation.id = requested_observation_id
    AND (
      observation.organization_id IS NULL
      OR observation.organization_id = app.current_organization_id()
    )
    AND series.data_class NOT IN ('synthetic_demo', 'synthetic_research')
    AND series.status = 'active'
    AND dataset.admission_status = 'approved'
    AND dataset.admitted_at IS NOT NULL
    AND source.license_status = 'approved'
    AND source.license_review_id IS NOT NULL
    AND (
      source.license_review_expires_at IS NULL
      OR source.license_review_expires_at > statement_timestamp()
    )
    AND requested_action = ANY(source.permitted_actions)
    AND (requested_action <> 'export' OR source.redistribution_allowed = true)
    AND transformation.status = 'succeeded'
    AND EXISTS (
      SELECT 1 FROM evidence.quality_results quality
      WHERE quality.transformation_run_id = transformation.id
        AND quality.tenant_scope = transformation.tenant_scope
        AND quality.check_code = 'admission'
        AND quality.status = 'pass'
    )
    AND NOT EXISTS (
      SELECT 1 FROM evidence.quality_results quality
      WHERE quality.transformation_run_id = transformation.id
        AND quality.tenant_scope = transformation.tenant_scope
        AND quality.status = 'fail'
    );
  RETURN result;
END
$$;

CREATE OR REPLACE FUNCTION evidence.governed_observation_is_visible_as_known(
  requested_observation_id uuid,
  known_at timestamptz,
  visibility_policy text,
  system_at timestamptz DEFAULT NULL,
  requested_action text DEFAULT 'derive'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  visible boolean;
BEGIN
  IF app.current_organization_id() IS NULL THEN
    RAISE EXCEPTION 'tenant context is required' USING ERRCODE = '42501';
  END IF;
  IF NOT isfinite(known_at) OR (system_at IS NOT NULL AND NOT isfinite(system_at)) THEN
    RAISE EXCEPTION 'point-in-time cutoffs must be finite' USING ERRCODE = '22023';
  END IF;
  IF visibility_policy NOT IN ('true_vintage', 'reconstructed', 'latest_revised') THEN
    RAISE EXCEPTION 'invalid visibility policy' USING ERRCODE = '22023';
  END IF;
  IF requested_action NOT IN ('view', 'api', 'export', 'derive', 'train') THEN
    RAISE EXCEPTION 'invalid data action' USING ERRCODE = '22023';
  END IF;
  IF visibility_policy = 'reconstructed' AND system_at IS NULL THEN
    RAISE EXCEPTION 'reconstructed policy requires system_at' USING ERRCODE = '22023';
  END IF;
  IF visibility_policy = 'latest_revised' AND system_at IS NOT NULL THEN
    RAISE EXCEPTION 'latest_revised cannot claim historical system time'
      USING ERRCODE = '22023';
  END IF;

  WITH target AS (
    SELECT
      observation.series_id,
      observation.tenant_scope,
      observation.period_start,
      observation.period_end
    FROM evidence.observations observation
    WHERE observation.id = requested_observation_id
      AND (
        observation.organization_id IS NULL
        OR observation.organization_id = app.current_organization_id()
      )
  ), selected AS (
    SELECT observation.id
    FROM target
    JOIN evidence.observations observation
      ON observation.series_id = target.series_id
      AND observation.tenant_scope = target.tenant_scope
      AND observation.period_start = target.period_start
      AND observation.period_end = target.period_end
    JOIN evidence.releases release
      ON release.id = observation.release_id
      AND release.tenant_scope = observation.tenant_scope
    JOIN evidence.raw_payloads payload
      ON payload.id = release.raw_payload_id
      AND payload.tenant_scope = release.tenant_scope
    JOIN evidence.series series
      ON series.id = observation.series_id
      AND series.tenant_scope = observation.tenant_scope
    JOIN evidence.source_datasets dataset
      ON dataset.id = series.dataset_id
      AND dataset.tenant_scope = series.tenant_scope
    JOIN evidence.sources source
      ON source.id = dataset.source_id
      AND source.tenant_scope = dataset.tenant_scope
    JOIN evidence.transformation_runs transformation
      ON transformation.id = observation.transformation_run_id
      AND transformation.tenant_scope = observation.tenant_scope
    WHERE (
        observation.organization_id IS NULL
        OR observation.organization_id = app.current_organization_id()
      )
      AND series.data_class NOT IN ('synthetic_demo', 'synthetic_research')
      AND series.status = 'active'
      AND dataset.admission_status = 'approved'
      AND dataset.admitted_at IS NOT NULL
      AND source.license_status = 'approved'
      AND source.license_review_id IS NOT NULL
      AND (
        source.license_review_expires_at IS NULL
        OR source.license_review_expires_at > statement_timestamp()
      )
      AND requested_action = ANY(source.permitted_actions)
      AND (requested_action <> 'export' OR source.redistribution_allowed = true)
      AND transformation.status = 'succeeded'
      AND evidence.canonical_observation_is_admitted(observation.id)
      AND observation.period_end <= known_at
      AND EXISTS (
        SELECT 1 FROM evidence.quality_results quality
        WHERE quality.transformation_run_id = observation.transformation_run_id
          AND quality.tenant_scope = observation.tenant_scope
          AND quality.check_code = 'admission'
          AND quality.status = 'pass'
      )
      AND NOT EXISTS (
        SELECT 1 FROM evidence.quality_results quality
        WHERE quality.transformation_run_id = observation.transformation_run_id
          AND quality.tenant_scope = observation.tenant_scope
          AND quality.status = 'fail'
      )
      AND CASE visibility_policy
        WHEN 'true_vintage' THEN
          release.pit_quality = 'true_vintage'
          AND release.release_time IS NOT NULL
          AND release.source_publication_time IS NOT NULL
          AND release.availability_time IS NOT NULL
          AND release.release_time <= known_at
          AND release.source_publication_time <= known_at
          AND release.availability_time <= known_at
          AND payload.fetched_at <= known_at
          AND (system_at IS NULL OR observation.recorded_at <= system_at)
        WHEN 'reconstructed' THEN
          release.pit_quality IN ('true_vintage', 'reconstructed_only')
          AND release.release_time IS NOT NULL
          AND release.availability_time IS NOT NULL
          AND release.release_time <= known_at
          AND release.availability_time <= known_at
          AND payload.fetched_at <= system_at
          AND transformation.completed_at <= system_at
          AND observation.recorded_at <= system_at
        WHEN 'latest_revised' THEN true
        ELSE false
      END
    ORDER BY
      release.revision_sequence DESC NULLS LAST,
      release.revision_time DESC NULLS LAST,
      release.release_time DESC NULLS LAST,
      observation.recorded_at DESC,
      observation.id DESC
    LIMIT 1
  )
  SELECT EXISTS (
    SELECT 1 FROM selected WHERE id = requested_observation_id
  ) INTO visible;
  RETURN visible;
END
$$;

REVOKE ALL ON FUNCTION evidence.governed_observations_as_known(
  uuid, timestamptz, text, timestamptz, text, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.governed_observation_provenance(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.governed_observation_is_visible_as_known(
  uuid, timestamptz, text, timestamptz, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evidence.governed_observations_as_known(
  uuid, timestamptz, text, timestamptz, text, integer
) TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.governed_observation_provenance(uuid, text)
  TO economyos_app;

COMMENT ON FUNCTION evidence.canonical_observation_is_admitted(uuid) IS
  'Fail-closed serving predicate for terminal durable or frozen pre-durable canonical evidence.';
