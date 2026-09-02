-- Phase 3 model-governance completion. Artifact manifests remain immutable
-- declarations of their creation-time lifecycle identity. Effective lifecycle
-- is an append-only, bitemporal decision history so emergency restrictions do
-- not rewrite scientific evidence or silently change historical interpretations.

CREATE TABLE evidence.economic_state_model_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  model_artifact_id uuid NOT NULL,
  model_artifact_sha256 text NOT NULL CHECK (
    model_artifact_sha256 ~ '^[0-9a-f]{64}$'
  ),
  from_status text CHECK (
    from_status IS NULL OR from_status IN (
      'proposed', 'research', 'validated', 'approved', 'staged', 'production',
      'restricted', 'disabled', 'retired'
    )
  ),
  to_status text NOT NULL CHECK (
    to_status IN (
      'proposed', 'research', 'validated', 'approved', 'staged', 'production',
      'restricted', 'disabled', 'retired'
    )
  ),
  emergency boolean NOT NULL DEFAULT false,
  reason text NOT NULL CHECK (
    length(btrim(reason)) BETWEEN 10 AND 2000 AND reason = btrim(reason)
  ),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  decided_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL CHECK (isfinite(occurred_at)),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(recorded_at)),
  decision_manifest jsonb NOT NULL CHECK (jsonb_typeof(decision_manifest) = 'object'),
  decision_sha256 text NOT NULL CHECK (decision_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (
    organization_id, workspace_id, model_artifact_id, model_artifact_sha256
  ) REFERENCES evidence.economic_state_model_artifacts(
    organization_id, workspace_id, id, artifact_sha256
  ) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, model_artifact_id, occurred_at),
  UNIQUE (organization_id, workspace_id, id),
  CHECK (from_status IS NULL OR from_status <> to_status),
  CHECK (NOT emergency OR to_status IN ('restricted', 'disabled', 'retired'))
);

CREATE OR REPLACE FUNCTION evidence.economic_state_lifecycle_manifest(
  requested_event_id uuid,
  requested_artifact_id uuid,
  requested_artifact_sha256 text,
  requested_from_status text,
  requested_to_status text,
  requested_emergency boolean,
  requested_reason text,
  requested_evidence_sha256 text,
  requested_decided_by uuid,
  requested_occurred_at timestamptz,
  requested_recorded_at timestamptz
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'eventId', requested_event_id::text,
    'artifactId', requested_artifact_id::text,
    'artifactSha256', requested_artifact_sha256,
    'fromStatus', to_jsonb(requested_from_status),
    'toStatus', requested_to_status,
    'emergency', requested_emergency,
    'reason', requested_reason,
    'evidenceSha256', requested_evidence_sha256,
    'decidedBy', requested_decided_by::text,
    'occurredAt', to_char(
      requested_occurred_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'recordedAt', to_char(
      requested_recorded_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  )
$$;

-- STRICT would turn the required NULL fromStatus of an initial event into a
-- NULL manifest, so keep a small non-strict overload for the normalized form.
CREATE OR REPLACE FUNCTION evidence.economic_state_lifecycle_manifest_nullable(
  requested_event_id uuid,
  requested_artifact_id uuid,
  requested_artifact_sha256 text,
  requested_from_status text,
  requested_to_status text,
  requested_emergency boolean,
  requested_reason text,
  requested_evidence_sha256 text,
  requested_decided_by uuid,
  requested_occurred_at timestamptz,
  requested_recorded_at timestamptz
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'eventId', requested_event_id::text,
    'artifactId', requested_artifact_id::text,
    'artifactSha256', requested_artifact_sha256,
    'fromStatus', CASE WHEN requested_from_status IS NULL
      THEN 'null'::jsonb ELSE to_jsonb(requested_from_status) END,
    'toStatus', requested_to_status,
    'emergency', requested_emergency,
    'reason', requested_reason,
    'evidenceSha256', requested_evidence_sha256,
    'decidedBy', requested_decided_by::text,
    'occurredAt', to_char(
      requested_occurred_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'recordedAt', to_char(
      requested_recorded_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  )
$$;

CREATE OR REPLACE FUNCTION evidence.economic_state_lifecycle_transition_allowed(
  requested_from_status text,
  requested_to_status text,
  requested_emergency boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN requested_from_status IS NULL THEN false
    WHEN requested_from_status = 'retired' THEN false
    WHEN requested_from_status = requested_to_status THEN false
    WHEN requested_emergency THEN requested_to_status IN ('restricted', 'disabled', 'retired')
    WHEN requested_from_status = 'proposed'
      THEN requested_to_status IN ('research', 'disabled', 'retired')
    WHEN requested_from_status = 'research'
      THEN requested_to_status IN ('validated', 'restricted', 'disabled', 'retired')
    WHEN requested_from_status = 'validated'
      THEN requested_to_status IN ('research', 'approved', 'restricted', 'disabled', 'retired')
    WHEN requested_from_status = 'approved'
      THEN requested_to_status IN ('validated', 'staged', 'restricted', 'disabled', 'retired')
    WHEN requested_from_status = 'staged'
      THEN requested_to_status IN ('approved', 'production', 'restricted', 'disabled', 'retired')
    WHEN requested_from_status = 'production'
      THEN requested_to_status IN ('staged', 'restricted', 'disabled', 'retired')
    WHEN requested_from_status = 'restricted'
      THEN requested_to_status IN (
        'research', 'validated', 'approved', 'staged', 'production', 'disabled', 'retired'
      )
    WHEN requested_from_status = 'disabled'
      THEN requested_to_status IN (
        'research', 'validated', 'approved', 'staged', 'restricted', 'retired'
      )
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION evidence.verify_economic_state_lifecycle_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  artifact evidence.economic_state_model_artifacts%ROWTYPE;
  prior_event evidence.economic_state_model_lifecycle_events%ROWTYPE;
  next_event evidence.economic_state_model_lifecycle_events%ROWTYPE;
  expected_manifest jsonb;
  expected_sha256 text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.model_artifact_id::text, 30030));

  SELECT * INTO artifact
  FROM evidence.economic_state_model_artifacts candidate
  WHERE candidate.id = NEW.model_artifact_id
    AND candidate.organization_id = NEW.organization_id
    AND candidate.workspace_id = NEW.workspace_id
    AND candidate.artifact_sha256 = NEW.model_artifact_sha256;
  IF artifact.id IS NULL THEN
    RAISE EXCEPTION 'model lifecycle event is outside its exact artifact scope'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO prior_event
  FROM evidence.economic_state_model_lifecycle_events candidate
  WHERE candidate.organization_id = NEW.organization_id
    AND candidate.workspace_id = NEW.workspace_id
    AND candidate.model_artifact_id = NEW.model_artifact_id
    AND candidate.occurred_at < NEW.occurred_at
  ORDER BY candidate.occurred_at DESC, candidate.recorded_at DESC, candidate.id DESC
  LIMIT 1;
  SELECT * INTO next_event
  FROM evidence.economic_state_model_lifecycle_events candidate
  WHERE candidate.organization_id = NEW.organization_id
    AND candidate.workspace_id = NEW.workspace_id
    AND candidate.model_artifact_id = NEW.model_artifact_id
    AND candidate.occurred_at > NEW.occurred_at
  ORDER BY candidate.occurred_at, candidate.recorded_at, candidate.id
  LIMIT 1;

  IF prior_event.id IS NULL THEN
    IF NEW.from_status IS NOT NULL
      OR NEW.to_status <> artifact.lifecycle_status
      OR NEW.occurred_at IS DISTINCT FROM artifact.created_at
      OR NEW.decided_by <> artifact.created_by
      OR NEW.emergency
    THEN
      RAISE EXCEPTION 'initial lifecycle event must bind the artifact creation status'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.from_status IS DISTINCT FROM prior_event.to_status
    OR NOT evidence.economic_state_lifecycle_transition_allowed(
      NEW.from_status, NEW.to_status, NEW.emergency
    )
  THEN
    RAISE EXCEPTION 'invalid model lifecycle transition from % to %',
      NEW.from_status, NEW.to_status USING ERRCODE = '23514';
  END IF;
  IF next_event.id IS NOT NULL AND next_event.from_status IS DISTINCT FROM NEW.to_status THEN
    RAISE EXCEPTION 'model lifecycle event would invalidate the following transition'
      USING ERRCODE = '23514';
  END IF;

  expected_manifest := evidence.economic_state_lifecycle_manifest_nullable(
    NEW.id, NEW.model_artifact_id, NEW.model_artifact_sha256,
    NEW.from_status, NEW.to_status, NEW.emergency, NEW.reason,
    NEW.evidence_sha256, NEW.decided_by, NEW.occurred_at, NEW.recorded_at
  );
  expected_sha256 := encode(digest(
    convert_to(evidence.canonical_json(expected_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  IF NEW.decision_manifest IS DISTINCT FROM expected_manifest
    OR NEW.decision_sha256 IS DISTINCT FROM expected_sha256
  THEN
    RAISE EXCEPTION 'model lifecycle decision manifest or digest is invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER economic_state_model_lifecycle_events_verify
BEFORE INSERT ON evidence.economic_state_model_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION evidence.verify_economic_state_lifecycle_event();
CREATE TRIGGER economic_state_model_lifecycle_events_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.economic_state_model_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE OR REPLACE FUNCTION evidence.record_initial_economic_state_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  event_id uuid := gen_random_uuid();
  record_time timestamptz := clock_timestamp();
  reason_text text := 'Artifact manifest initial lifecycle status.';
  manifest jsonb;
BEGIN
  manifest := evidence.economic_state_lifecycle_manifest_nullable(
    event_id, NEW.id, NEW.artifact_sha256, NULL, NEW.lifecycle_status, false,
    reason_text, NEW.approval_sha256, NEW.created_by, NEW.created_at, record_time
  );
  INSERT INTO evidence.economic_state_model_lifecycle_events (
    id, organization_id, workspace_id, model_artifact_id, model_artifact_sha256,
    from_status, to_status, emergency, reason, evidence_sha256, decided_by,
    occurred_at, recorded_at, decision_manifest, decision_sha256
  ) VALUES (
    event_id, NEW.organization_id, NEW.workspace_id, NEW.id, NEW.artifact_sha256,
    NULL, NEW.lifecycle_status, false, reason_text, NEW.approval_sha256, NEW.created_by,
    NEW.created_at, record_time, manifest,
    encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex')
  );
  RETURN NEW;
END
$$;

CREATE TRIGGER economic_state_model_artifacts_record_initial_lifecycle
AFTER INSERT ON evidence.economic_state_model_artifacts
FOR EACH ROW EXECUTE FUNCTION evidence.record_initial_economic_state_lifecycle();

-- Backfill the creation-time declaration of artifacts predating this ledger.
WITH prepared AS (
  SELECT
    gen_random_uuid() AS event_id,
    artifact.*,
    clock_timestamp() AS record_time,
    'Backfilled artifact manifest initial lifecycle status.'::text AS reason_text
  FROM evidence.economic_state_model_artifacts artifact
), manifested AS (
  SELECT prepared.*,
    evidence.economic_state_lifecycle_manifest_nullable(
      event_id, id, artifact_sha256, NULL, lifecycle_status, false,
      reason_text, approval_sha256, created_by, created_at, record_time
    ) AS manifest
  FROM prepared
)
INSERT INTO evidence.economic_state_model_lifecycle_events (
  id, organization_id, workspace_id, model_artifact_id, model_artifact_sha256,
  from_status, to_status, emergency, reason, evidence_sha256, decided_by,
  occurred_at, recorded_at, decision_manifest, decision_sha256
)
SELECT
  event_id, organization_id, workspace_id, id, artifact_sha256,
  NULL, lifecycle_status, false, reason_text, approval_sha256, created_by,
  created_at, record_time, manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex')
FROM manifested;

CREATE OR REPLACE FUNCTION evidence.record_economic_state_model_lifecycle_event(
  requested_artifact_id uuid,
  requested_to_status text,
  requested_emergency boolean,
  requested_reason text,
  requested_evidence_sha256 text,
  requested_occurred_at timestamptz DEFAULT statement_timestamp()
)
RETURNS evidence.economic_state_model_lifecycle_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  artifact evidence.economic_state_model_artifacts%ROWTYPE;
  prior_event evidence.economic_state_model_lifecycle_events%ROWTYPE;
  actor_role text;
  validation_actor uuid;
  approval_actor uuid;
  staging_actor uuid;
  event_id uuid := gen_random_uuid();
  record_time timestamptz := clock_timestamp();
  manifest jsonb;
  inserted_event evidence.economic_state_model_lifecycle_events%ROWTYPE;
BEGIN
  IF requested_artifact_id IS NULL
    OR requested_to_status NOT IN (
      'proposed', 'research', 'validated', 'approved', 'staged', 'production',
      'restricted', 'disabled', 'retired'
    )
    OR requested_emergency IS NULL
    OR requested_reason IS NULL
    OR length(btrim(requested_reason)) NOT BETWEEN 10 AND 2000
    OR requested_reason <> btrim(requested_reason)
    OR requested_evidence_sha256 !~ '^[0-9a-f]{64}$'
    OR requested_occurred_at IS NULL OR NOT isfinite(requested_occurred_at)
  THEN
    RAISE EXCEPTION 'invalid model lifecycle decision input' USING ERRCODE = '22023';
  END IF;
  IF requested_emergency AND (
    requested_to_status NOT IN ('restricted', 'disabled', 'retired')
    OR requested_occurred_at > statement_timestamp() + interval '1 minute'
    OR requested_occurred_at < statement_timestamp() - interval '5 minutes'
  ) THEN
    RAISE EXCEPTION 'emergency lifecycle decisions must be immediate restrictions'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO artifact
  FROM evidence.economic_state_model_artifacts candidate
  WHERE candidate.id = requested_artifact_id
    AND candidate.organization_id = app.current_organization_id()
    AND evidence.economic_state_workspace_visible(
      candidate.organization_id, candidate.workspace_id
    );
  IF artifact.id IS NULL OR app.current_subject_id() IS NULL THEN
    RAISE EXCEPTION 'model artifact is not visible in the current workspace'
      USING ERRCODE = '42501';
  END IF;

  SELECT membership.role INTO actor_role
  FROM app.workspace_memberships membership
  WHERE membership.organization_id = artifact.organization_id
    AND membership.workspace_id = artifact.workspace_id
    AND membership.subject_id = app.current_subject_id()
    AND membership.valid_from <= statement_timestamp()
    AND (membership.valid_until IS NULL OR membership.valid_until > statement_timestamp());
  IF actor_role IS NULL
    OR (requested_emergency AND actor_role NOT IN ('steward', 'validator', 'admin'))
    OR (NOT requested_emergency AND actor_role NOT IN ('validator', 'admin'))
  THEN
    RAISE EXCEPTION 'principal is not authorized for this lifecycle decision'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(artifact.id::text, 30030));
  SELECT * INTO prior_event
  FROM evidence.economic_state_model_lifecycle_events candidate
  WHERE candidate.organization_id = artifact.organization_id
    AND candidate.workspace_id = artifact.workspace_id
    AND candidate.model_artifact_id = artifact.id
    AND candidate.occurred_at < requested_occurred_at
  ORDER BY candidate.occurred_at DESC, candidate.recorded_at DESC, candidate.id DESC
  LIMIT 1;
  IF prior_event.id IS NULL
    OR NOT evidence.economic_state_lifecycle_transition_allowed(
      prior_event.to_status, requested_to_status, requested_emergency
    )
  THEN
    RAISE EXCEPTION 'invalid model lifecycle transition from % to %',
      prior_event.to_status, requested_to_status USING ERRCODE = '23514';
  END IF;
  IF requested_to_status IN ('validated', 'approved', 'staged', 'production')
    AND app.current_subject_id() = artifact.created_by
  THEN
    RAISE EXCEPTION 'model developer cannot independently validate or approve deployment'
      USING ERRCODE = '42501';
  END IF;
  SELECT event.decided_by INTO validation_actor
  FROM evidence.economic_state_model_lifecycle_events event
  WHERE event.organization_id = artifact.organization_id
    AND event.workspace_id = artifact.workspace_id
    AND event.model_artifact_id = artifact.id
    AND event.to_status = 'validated'
    AND event.occurred_at < requested_occurred_at
  ORDER BY event.occurred_at DESC, event.recorded_at DESC, event.id DESC
  LIMIT 1;
  SELECT event.decided_by INTO approval_actor
  FROM evidence.economic_state_model_lifecycle_events event
  WHERE event.organization_id = artifact.organization_id
    AND event.workspace_id = artifact.workspace_id
    AND event.model_artifact_id = artifact.id
    AND event.to_status = 'approved'
    AND event.occurred_at < requested_occurred_at
  ORDER BY event.occurred_at DESC, event.recorded_at DESC, event.id DESC
  LIMIT 1;
  SELECT event.decided_by INTO staging_actor
  FROM evidence.economic_state_model_lifecycle_events event
  WHERE event.organization_id = artifact.organization_id
    AND event.workspace_id = artifact.workspace_id
    AND event.model_artifact_id = artifact.id
    AND event.to_status = 'staged'
    AND event.occurred_at < requested_occurred_at
  ORDER BY event.occurred_at DESC, event.recorded_at DESC, event.id DESC
  LIMIT 1;
  IF (requested_to_status = 'approved'
      AND app.current_subject_id() IS NOT DISTINCT FROM validation_actor)
    OR (requested_to_status = 'staged'
      AND app.current_subject_id() IS NOT DISTINCT FROM approval_actor)
    OR (requested_to_status = 'production' AND (
      app.current_subject_id() IS NOT DISTINCT FROM validation_actor
      OR app.current_subject_id() IS NOT DISTINCT FROM approval_actor
      OR app.current_subject_id() IS NOT DISTINCT FROM staging_actor
    ))
  THEN
    RAISE EXCEPTION 'model promotion requires independent validation, risk approval, staging, and production principals'
      USING ERRCODE = '42501';
  END IF;

  manifest := evidence.economic_state_lifecycle_manifest_nullable(
    event_id, artifact.id, artifact.artifact_sha256, prior_event.to_status,
    requested_to_status, requested_emergency, requested_reason,
    requested_evidence_sha256, app.current_subject_id(), requested_occurred_at, record_time
  );
  INSERT INTO evidence.economic_state_model_lifecycle_events (
    id, organization_id, workspace_id, model_artifact_id, model_artifact_sha256,
    from_status, to_status, emergency, reason, evidence_sha256, decided_by,
    occurred_at, recorded_at, decision_manifest, decision_sha256
  ) VALUES (
    event_id, artifact.organization_id, artifact.workspace_id, artifact.id,
    artifact.artifact_sha256, prior_event.to_status, requested_to_status,
    requested_emergency, requested_reason, requested_evidence_sha256,
    app.current_subject_id(), requested_occurred_at, record_time, manifest,
    encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex')
  ) RETURNING * INTO inserted_event;
  RETURN inserted_event;
END
$$;

CREATE OR REPLACE FUNCTION evidence.economic_state_artifact_lifecycle_at(
  requested_artifact_id uuid,
  requested_effective_at timestamptz DEFAULT statement_timestamp(),
  requested_system_at timestamptz DEFAULT statement_timestamp()
)
RETURNS TABLE (
  event_id uuid,
  status text,
  emergency boolean,
  evidence_sha256 text,
  decided_by uuid,
  occurred_at timestamptz,
  recorded_at timestamptz,
  decision_sha256 text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
BEGIN
  IF requested_artifact_id IS NULL
    OR requested_effective_at IS NULL OR NOT isfinite(requested_effective_at)
    OR requested_system_at IS NULL OR NOT isfinite(requested_system_at)
  THEN
    RAISE EXCEPTION 'finite lifecycle temporal cutoffs are required'
      USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT
    event.id, event.to_status, event.emergency, event.evidence_sha256,
    event.decided_by, event.occurred_at, event.recorded_at, event.decision_sha256
  FROM evidence.economic_state_model_artifacts artifact
  JOIN evidence.economic_state_model_lifecycle_events event
    ON event.organization_id = artifact.organization_id
    AND event.workspace_id = artifact.workspace_id
    AND event.model_artifact_id = artifact.id
    AND event.model_artifact_sha256 = artifact.artifact_sha256
  WHERE artifact.id = requested_artifact_id
    AND artifact.organization_id = app.current_organization_id()
    AND evidence.economic_state_workspace_visible(
      artifact.organization_id, artifact.workspace_id
    )
    AND event.occurred_at <= requested_effective_at
    AND event.recorded_at <= requested_system_at
  ORDER BY event.occurred_at DESC, event.recorded_at DESC, event.id DESC
  LIMIT 1;
END
$$;

CREATE OR REPLACE FUNCTION evidence.economic_state_artifact_status_internal(
  requested_organization_id uuid,
  requested_workspace_id uuid,
  requested_artifact_id uuid,
  requested_effective_at timestamptz,
  requested_system_at timestamptz
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
  SELECT event.to_status
  FROM evidence.economic_state_model_lifecycle_events event
  WHERE event.organization_id = requested_organization_id
    AND event.workspace_id = requested_workspace_id
    AND event.model_artifact_id = requested_artifact_id
    AND event.occurred_at <= requested_effective_at
    AND event.recorded_at <= requested_system_at
  ORDER BY event.occurred_at DESC, event.recorded_at DESC, event.id DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION evidence.require_effective_economic_state_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  effective_status text;
BEGIN
  effective_status := evidence.economic_state_artifact_status_internal(
    NEW.organization_id, NEW.workspace_id, NEW.model_artifact_id,
    statement_timestamp(), statement_timestamp()
  );
  IF effective_status IS NULL
    OR effective_status NOT IN ('research', 'validated', 'approved', 'staged', 'production')
  THEN
    RAISE EXCEPTION 'economic-state artifact lifecycle does not permit calculation'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER economic_state_runs_require_effective_lifecycle
BEFORE INSERT ON evidence.economic_state_runs
FOR EACH ROW EXECUTE FUNCTION evidence.require_effective_economic_state_lifecycle();

CREATE OR REPLACE FUNCTION evidence.economic_state_run_is_currently_servable(
  requested_run_id uuid,
  requested_action text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
  SELECT
    requested_action = 'api'
    AND coalesce((
      SELECT
        evidence.economic_state_artifact_status_internal(
          state_run.organization_id, state_run.workspace_id, state_run.model_artifact_id,
          statement_timestamp(), statement_timestamp()
        ) IN ('research', 'validated', 'approved', 'staged', 'production')
        AND evidence.economic_state_run_is_temporally_admitted(state_run.id)
        AND NOT EXISTS (
          SELECT 1
          FROM evidence.economic_state_component_results observed
          WHERE observed.organization_id = state_run.organization_id
            AND observed.workspace_id = state_run.workspace_id
            AND observed.run_id = state_run.id
            AND observed.raw_value IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM evidence.source_datasets dataset
              JOIN evidence.sources source
                ON source.id = dataset.source_id
                AND source.tenant_scope = dataset.tenant_scope
              WHERE dataset.id = observed.source_dataset_id
                AND dataset.source_id = observed.source_id
                AND (
                  dataset.organization_id IS NULL
                  OR dataset.organization_id = state_run.organization_id
                )
                AND (
                  source.organization_id IS NULL
                  OR source.organization_id = state_run.organization_id
                )
                AND evidence.source_action_is_currently_admitted(
                  source.id, dataset.id, source.license_review_id, requested_action
                )
            )
        )
      FROM evidence.economic_state_runs state_run
      WHERE state_run.id = requested_run_id
        AND state_run.organization_id = app.current_organization_id()
        AND evidence.economic_state_workspace_visible(
          state_run.organization_id, state_run.workspace_id
        )
    ), false)
$$;

ALTER TABLE evidence.economic_state_model_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.economic_state_model_lifecycle_events FORCE ROW LEVEL SECURITY;
CREATE POLICY economic_state_model_lifecycle_events_workspace
  ON evidence.economic_state_model_lifecycle_events
  USING (evidence.economic_state_workspace_visible(organization_id, workspace_id))
  WITH CHECK (evidence.economic_state_workspace_visible(organization_id, workspace_id));

CREATE INDEX economic_state_model_lifecycle_current_idx
  ON evidence.economic_state_model_lifecycle_events (
    organization_id, workspace_id, model_artifact_id,
    occurred_at DESC, recorded_at DESC, id DESC
  );

REVOKE ALL ON TABLE evidence.economic_state_model_lifecycle_events FROM PUBLIC;
GRANT SELECT ON evidence.economic_state_model_lifecycle_events TO economyos_app;
REVOKE INSERT, UPDATE, DELETE ON evidence.economic_state_model_lifecycle_events
  FROM economyos_app, economyos_ingest;

REVOKE ALL ON FUNCTION evidence.economic_state_lifecycle_manifest(
  uuid, uuid, text, text, text, boolean, text, text, uuid, timestamptz, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.economic_state_lifecycle_manifest_nullable(
  uuid, uuid, text, text, text, boolean, text, text, uuid, timestamptz, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.economic_state_lifecycle_transition_allowed(
  text, text, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.verify_economic_state_lifecycle_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.record_initial_economic_state_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.economic_state_artifact_status_internal(
  uuid, uuid, uuid, timestamptz, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.require_effective_economic_state_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.record_economic_state_model_lifecycle_event(
  uuid, text, boolean, text, text, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.economic_state_artifact_lifecycle_at(
  uuid, timestamptz, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.economic_state_run_is_currently_servable(uuid, text)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION evidence.record_economic_state_model_lifecycle_event(
  uuid, text, boolean, text, text, timestamptz
) TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.economic_state_artifact_lifecycle_at(
  uuid, timestamptz, timestamptz
) TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.economic_state_run_is_currently_servable(uuid, text)
  TO economyos_app;

COMMENT ON TABLE evidence.economic_state_model_lifecycle_events IS
  'Append-only bitemporal effective lifecycle decisions; artifact manifests retain immutable creation-time lifecycle identity.';
COMMENT ON FUNCTION evidence.record_economic_state_model_lifecycle_event(
  uuid, text, boolean, text, text, timestamptz
) IS 'Records a role-separated model lifecycle transition; emergency restriction, disablement, and retirement are immediate.';
COMMENT ON FUNCTION evidence.economic_state_artifact_lifecycle_at(
  uuid, timestamptz, timestamptz
) IS 'Resolves one effective artifact lifecycle decision at explicit valid-time and system-time cutoffs within the active tenant workspace.';
