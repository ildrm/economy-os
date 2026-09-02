-- Phase 3 durable release notifications. Subscriptions are event-sourced;
-- workflow summaries are transition-constrained; candidates and delivery
-- evidence are immutable. Runtime roles receive only narrow functions.

CREATE TABLE app.release_subscriptions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  series_id uuid NOT NULL,
  subject_id uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel = 'in_app'),
  created_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(created_at)),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, subject_id, series_id, channel),
  UNIQUE (organization_id, workspace_id, id),
  UNIQUE (organization_id, workspace_id, id, subject_id)
);

CREATE TABLE app.release_subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  prior_event_id uuid,
  active boolean NOT NULL,
  reason text NOT NULL CHECK (
    length(btrim(reason)) BETWEEN 3 AND 1000 AND reason = btrim(reason)
  ),
  actor_subject_id uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL CHECK (isfinite(occurred_at)),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(recorded_at)),
  event_manifest jsonb NOT NULL CHECK (jsonb_typeof(event_manifest) = 'object'),
  event_sha256 text NOT NULL CHECK (event_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id, subscription_id, subject_id)
    REFERENCES app.release_subscriptions(organization_id, workspace_id, id, subject_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, prior_event_id)
    REFERENCES app.release_subscription_events(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, subscription_id, occurred_at),
  UNIQUE (organization_id, workspace_id, id),
  CHECK ((prior_event_id IS NULL AND active) OR prior_event_id IS NOT NULL)
);

CREATE TABLE evidence.release_notification_runs (
  workflow_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  series_id uuid NOT NULL,
  release_id uuid NOT NULL,
  monitoring_time timestamptz NOT NULL CHECK (isfinite(monitoring_time)),
  monitoring_time_text text NOT NULL CHECK (
    monitoring_time_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?Z$'
  ),
  release_manifest_sha256 text NOT NULL CHECK (
    release_manifest_sha256 ~ '^[0-9a-f]{64}$'
  ),
  input_manifest jsonb NOT NULL CHECK (jsonb_typeof(input_manifest) = 'object'),
  input_sha256 text NOT NULL CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at timestamptz NOT NULL CHECK (isfinite(started_at)),
  completed_at timestamptz CHECK (completed_at IS NULL OR isfinite(completed_at)),
  completed_at_text text CHECK (
    completed_at_text IS NULL OR completed_at_text ~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?Z$'
  ),
  output_manifest jsonb CHECK (
    output_manifest IS NULL OR jsonb_typeof(output_manifest) = 'object'
  ),
  output_manifest_sha256 text CHECK (
    output_manifest_sha256 IS NULL OR output_manifest_sha256 ~ '^[0-9a-f]{64}$'
  ),
  error_code text CHECK (
    error_code IS NULL OR error_code ~ '^[A-Z][A-Z0-9_]{1,127}$'
  ),
  error_message text CHECK (
    error_message IS NULL OR (
      length(error_message) BETWEEN 1 AND 1000 AND error_message = btrim(error_message)
    )
  ),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(created_at)),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, series_id, release_id),
  UNIQUE (organization_id, workspace_id, workflow_id),
  CHECK (monitoring_time_text::timestamptz = monitoring_time),
  CHECK (completed_at_text IS NULL OR completed_at_text::timestamptz = completed_at),
  CHECK (completed_at IS NULL OR completed_at >= started_at),
  CHECK (
    (status = 'running' AND completed_at IS NULL AND completed_at_text IS NULL
      AND output_manifest IS NULL AND output_manifest_sha256 IS NULL
      AND error_code IS NULL AND error_message IS NULL)
    OR
    (status = 'succeeded' AND completed_at IS NOT NULL AND completed_at_text IS NOT NULL
      AND output_manifest IS NOT NULL AND output_manifest_sha256 IS NOT NULL
      AND error_code IS NULL AND error_message IS NULL)
    OR
    (status = 'failed' AND completed_at IS NOT NULL AND completed_at_text IS NOT NULL
      AND output_manifest IS NULL AND output_manifest_sha256 IS NULL
      AND error_code IS NOT NULL AND error_message IS NOT NULL)
  )
);

CREATE TABLE evidence.release_notification_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  event_sequence integer NOT NULL CHECK (event_sequence BETWEEN 1 AND 3),
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  details jsonb NOT NULL CHECK (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz NOT NULL CHECK (isfinite(occurred_at)),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(recorded_at)),
  event_manifest jsonb NOT NULL CHECK (jsonb_typeof(event_manifest) = 'object'),
  event_sha256 text NOT NULL CHECK (event_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id, workflow_id)
    REFERENCES evidence.release_notification_runs(
      organization_id, workspace_id, workflow_id
    ) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, workflow_id, event_sequence),
  UNIQUE (organization_id, workspace_id, workflow_id, status),
  UNIQUE (organization_id, workspace_id, id)
);

CREATE TABLE evidence.release_notification_candidates (
  delivery_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel = 'in_app'),
  resolved_subscription_event_id uuid NOT NULL,
  resolved_at timestamptz NOT NULL CHECK (isfinite(resolved_at)),
  FOREIGN KEY (organization_id, workspace_id, workflow_id)
    REFERENCES evidence.release_notification_runs(
      organization_id, workspace_id, workflow_id
    ) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, subscription_id, subject_id)
    REFERENCES app.release_subscriptions(organization_id, workspace_id, id, subject_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, workspace_id, resolved_subscription_event_id)
    REFERENCES app.release_subscription_events(organization_id, workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, workflow_id, subscription_id),
  UNIQUE (organization_id, workspace_id, workflow_id, delivery_id),
  UNIQUE (organization_id, workspace_id, delivery_id)
);

CREATE TABLE evidence.release_notification_deliveries (
  delivery_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel = 'in_app'),
  status text NOT NULL CHECK (status IN ('delivered', 'suppressed')),
  reason text NOT NULL CHECK (
    reason IN ('delivered', 'subscription_inactive', 'release_not_servable')
  ),
  occurred_at timestamptz NOT NULL CHECK (isfinite(occurred_at)),
  occurred_at_text text NOT NULL CHECK (
    occurred_at_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?Z$'
  ),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(recorded_at)),
  delivery_manifest jsonb NOT NULL CHECK (jsonb_typeof(delivery_manifest) = 'object'),
  delivery_sha256 text NOT NULL CHECK (delivery_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY (organization_id, workspace_id, workflow_id, delivery_id)
    REFERENCES evidence.release_notification_candidates(
      organization_id, workspace_id, workflow_id, delivery_id
    ) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, workflow_id, subscription_id),
  UNIQUE (organization_id, workspace_id, workflow_id, delivery_id),
  CHECK (occurred_at_text::timestamptz = occurred_at),
  CHECK (
    (status = 'delivered' AND reason = 'delivered')
    OR (status = 'suppressed' AND reason IN (
      'subscription_inactive', 'release_not_servable'
    ))
  )
);

CREATE OR REPLACE FUNCTION evidence.deterministic_uuid_v8(VARIADIC parts text[])
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
DECLARE
  part text;
  payload bytea := ''::bytea;
  bytes bytea;
  hex text;
BEGIN
  IF cardinality(parts) = 0 OR EXISTS (
    SELECT 1 FROM unnest(parts) candidate WHERE candidate = ''
  ) THEN
    RAISE EXCEPTION 'deterministic UUID parts must be non-empty'
      USING ERRCODE = '22023';
  END IF;
  FOREACH part IN ARRAY parts LOOP
    payload := payload || int4send(octet_length(convert_to(part, 'UTF8')))
      || convert_to(part, 'UTF8');
  END LOOP;
  bytes := substring(digest(payload, 'sha256') FROM 1 FOR 16);
  bytes := set_byte(bytes, 6, (get_byte(bytes, 6) & 15) | 128);
  bytes := set_byte(bytes, 8, (get_byte(bytes, 8) & 63) | 128);
  hex := encode(bytes, 'hex');
  RETURN (
    substring(hex, 1, 8) || '-' || substring(hex, 9, 4) || '-'
    || substring(hex, 13, 4) || '-' || substring(hex, 17, 4) || '-'
    || substring(hex, 21, 12)
  )::uuid;
END
$$;

CREATE OR REPLACE FUNCTION app.release_subscription_event_manifest(
  requested_event_id uuid,
  requested_subscription_id uuid,
  requested_subject_id uuid,
  requested_prior_event_id uuid,
  requested_active boolean,
  requested_reason text,
  requested_actor_subject_id uuid,
  requested_occurred_at_text text,
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
    'subscriptionId', requested_subscription_id::text,
    'subjectId', requested_subject_id::text,
    'priorEventId', CASE WHEN requested_prior_event_id IS NULL
      THEN 'null'::jsonb ELSE to_jsonb(requested_prior_event_id::text) END,
    'active', requested_active,
    'reason', requested_reason,
    'actorSubjectId', requested_actor_subject_id::text,
    'occurredAt', requested_occurred_at_text,
    'recordedAt', to_char(
      requested_recorded_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  )
$$;

CREATE OR REPLACE FUNCTION app.verify_release_subscription_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
DECLARE
  subscription app.release_subscriptions%ROWTYPE;
  prior_event app.release_subscription_events%ROWTYPE;
  latest_event app.release_subscription_events%ROWTYPE;
  occurred_text text;
  expected_manifest jsonb;
  expected_sha text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.subscription_id::text, 31001));
  SELECT * INTO subscription
  FROM app.release_subscriptions candidate
  WHERE candidate.id = NEW.subscription_id
    AND candidate.organization_id = NEW.organization_id
    AND candidate.workspace_id = NEW.workspace_id
    AND candidate.subject_id = NEW.subject_id;
  IF subscription.id IS NULL THEN
    RAISE EXCEPTION 'release subscription event is outside its exact identity'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO latest_event
  FROM app.release_subscription_events candidate
  WHERE candidate.organization_id = NEW.organization_id
    AND candidate.workspace_id = NEW.workspace_id
    AND candidate.subscription_id = NEW.subscription_id
  ORDER BY candidate.occurred_at DESC, candidate.recorded_at DESC, candidate.id DESC
  LIMIT 1;
  IF latest_event.id IS NULL THEN
    IF NEW.prior_event_id IS NOT NULL OR NOT NEW.active
      OR NEW.occurred_at < subscription.created_at
    THEN
      RAISE EXCEPTION 'initial release subscription event must activate its identity'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT * INTO prior_event
    FROM app.release_subscription_events candidate
    WHERE candidate.id = NEW.prior_event_id
      AND candidate.organization_id = NEW.organization_id
      AND candidate.workspace_id = NEW.workspace_id
      AND candidate.subscription_id = NEW.subscription_id;
    IF prior_event.id IS NULL OR prior_event.id <> latest_event.id
      OR prior_event.active = NEW.active
      OR NEW.occurred_at <= prior_event.occurred_at
    THEN
      RAISE EXCEPTION 'release subscription events must extend the latest state chain'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  occurred_text := to_char(
    NEW.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  );
  expected_manifest := app.release_subscription_event_manifest(
    NEW.id, NEW.subscription_id, NEW.subject_id, NEW.prior_event_id,
    NEW.active, NEW.reason, NEW.actor_subject_id, occurred_text, NEW.recorded_at
  );
  expected_sha := encode(digest(
    convert_to(evidence.canonical_json(expected_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  IF NEW.event_manifest IS DISTINCT FROM expected_manifest
    OR NEW.event_sha256 IS DISTINCT FROM expected_sha
  THEN
    RAISE EXCEPTION 'release subscription event manifest or digest is invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER release_subscriptions_reject_update_delete
BEFORE UPDATE OR DELETE ON app.release_subscriptions
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER release_subscription_events_verify
BEFORE INSERT ON app.release_subscription_events
FOR EACH ROW EXECUTE FUNCTION app.verify_release_subscription_event();
CREATE TRIGGER release_subscription_events_reject_update_delete
BEFORE UPDATE OR DELETE ON app.release_subscription_events
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE OR REPLACE FUNCTION app.create_release_subscription(
  requested_subscription_id uuid,
  requested_workspace_id uuid,
  requested_series_id uuid,
  requested_reason text,
  requested_occurred_at timestamptz DEFAULT statement_timestamp()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
DECLARE
  current_organization_id uuid := app.current_organization_id();
  current_subject_id uuid := app.current_subject_id();
  existing_id uuid;
  event_id uuid := gen_random_uuid();
  record_time timestamptz := clock_timestamp();
  occurred_text text;
  manifest jsonb;
BEGIN
  IF requested_subscription_id IS NULL OR requested_workspace_id IS NULL
    OR requested_series_id IS NULL OR requested_reason IS NULL
    OR length(btrim(requested_reason)) NOT BETWEEN 3 AND 1000
    OR requested_reason <> btrim(requested_reason)
    OR requested_occurred_at IS NULL OR NOT isfinite(requested_occurred_at)
    OR requested_occurred_at > statement_timestamp() + interval '1 minute'
  THEN
    RAISE EXCEPTION 'invalid release subscription input' USING ERRCODE = '22023';
  END IF;
  IF current_organization_id IS NULL OR current_subject_id IS NULL
    OR NOT evidence.economic_state_workspace_visible(
      current_organization_id, requested_workspace_id
    )
  THEN
    RAISE EXCEPTION 'active tenant workspace membership is required'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM evidence.series series
    WHERE series.id = requested_series_id
      AND (
        series.organization_id IS NULL
        OR series.organization_id = current_organization_id
      )
      AND series.status = 'active'
      AND series.data_class NOT IN ('synthetic_demo', 'synthetic_research')
  ) THEN
    RAISE EXCEPTION 'series is not eligible for release subscriptions'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    current_organization_id::text || ':' || requested_workspace_id::text || ':'
      || current_subject_id::text || ':' || requested_series_id::text,
    31002
  ));
  SELECT subscription.id INTO existing_id
  FROM app.release_subscriptions subscription
  WHERE subscription.organization_id = current_organization_id
    AND subscription.workspace_id = requested_workspace_id
    AND subscription.subject_id = current_subject_id
    AND subscription.series_id = requested_series_id
    AND subscription.channel = 'in_app';
  IF existing_id IS NOT NULL THEN
    IF existing_id <> requested_subscription_id THEN
      RAISE EXCEPTION 'release subscription identity conflicts with existing scope'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing_id;
  END IF;

  INSERT INTO app.release_subscriptions (
    id, organization_id, workspace_id, series_id, subject_id, channel,
    created_by, created_at
  ) VALUES (
    requested_subscription_id, current_organization_id, requested_workspace_id,
    requested_series_id, current_subject_id, 'in_app', current_subject_id,
    requested_occurred_at
  );
  occurred_text := to_char(
    requested_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  );
  manifest := app.release_subscription_event_manifest(
    event_id, requested_subscription_id, current_subject_id, NULL, true,
    requested_reason, current_subject_id, occurred_text, record_time
  );
  INSERT INTO app.release_subscription_events (
    id, organization_id, workspace_id, subscription_id, subject_id,
    prior_event_id, active, reason, actor_subject_id, occurred_at, recorded_at,
    event_manifest, event_sha256
  ) VALUES (
    event_id, current_organization_id, requested_workspace_id,
    requested_subscription_id, current_subject_id, NULL, true,
    requested_reason, current_subject_id,
    requested_occurred_at, record_time, manifest,
    encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex')
  );
  RETURN requested_subscription_id;
END
$$;

CREATE OR REPLACE FUNCTION app.set_release_subscription_active(
  requested_subscription_id uuid,
  requested_active boolean,
  requested_reason text,
  requested_occurred_at timestamptz DEFAULT statement_timestamp()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
DECLARE
  subscription app.release_subscriptions%ROWTYPE;
  prior_event app.release_subscription_events%ROWTYPE;
  actor_role text;
  event_id uuid := gen_random_uuid();
  record_time timestamptz := clock_timestamp();
  occurred_text text;
  manifest jsonb;
BEGIN
  IF requested_subscription_id IS NULL OR requested_active IS NULL
    OR requested_reason IS NULL
    OR length(btrim(requested_reason)) NOT BETWEEN 3 AND 1000
    OR requested_reason <> btrim(requested_reason)
    OR requested_occurred_at IS NULL OR NOT isfinite(requested_occurred_at)
    OR requested_occurred_at > statement_timestamp() + interval '1 minute'
  THEN
    RAISE EXCEPTION 'invalid release subscription state input'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO subscription
  FROM app.release_subscriptions candidate
  WHERE candidate.id = requested_subscription_id
    AND candidate.organization_id = app.current_organization_id()
    AND evidence.economic_state_workspace_visible(
      candidate.organization_id, candidate.workspace_id
    );
  IF subscription.id IS NULL OR app.current_subject_id() IS NULL THEN
    RAISE EXCEPTION 'release subscription is not visible in the current workspace'
      USING ERRCODE = '42501';
  END IF;
  SELECT membership.role INTO actor_role
  FROM app.workspace_memberships membership
  WHERE membership.organization_id = subscription.organization_id
    AND membership.workspace_id = subscription.workspace_id
    AND membership.subject_id = app.current_subject_id()
    AND membership.valid_from <= statement_timestamp()
    AND (membership.valid_until IS NULL OR membership.valid_until > statement_timestamp());
  IF subscription.subject_id <> app.current_subject_id() AND actor_role <> 'admin' THEN
    RAISE EXCEPTION 'only the subscriber or workspace admin may change a subscription'
      USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(subscription.id::text, 31001));
  SELECT * INTO STRICT prior_event
  FROM app.release_subscription_events candidate
  WHERE candidate.organization_id = subscription.organization_id
    AND candidate.workspace_id = subscription.workspace_id
    AND candidate.subscription_id = subscription.id
  ORDER BY candidate.occurred_at DESC, candidate.recorded_at DESC, candidate.id DESC
  LIMIT 1;
  IF prior_event.active = requested_active THEN
    RETURN prior_event.id;
  END IF;
  IF requested_occurred_at <= prior_event.occurred_at THEN
    RAISE EXCEPTION 'subscription state time must extend its event history'
      USING ERRCODE = '22023';
  END IF;
  occurred_text := to_char(
    requested_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  );
  manifest := app.release_subscription_event_manifest(
    event_id, subscription.id, subscription.subject_id, prior_event.id,
    requested_active, requested_reason, app.current_subject_id(), occurred_text, record_time
  );
  INSERT INTO app.release_subscription_events (
    id, organization_id, workspace_id, subscription_id, subject_id,
    prior_event_id, active, reason, actor_subject_id, occurred_at, recorded_at,
    event_manifest, event_sha256
  ) VALUES (
    event_id, subscription.organization_id, subscription.workspace_id,
    subscription.id, subscription.subject_id, prior_event.id, requested_active,
    requested_reason, app.current_subject_id(), requested_occurred_at, record_time,
    manifest,
    encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex')
  );
  RETURN event_id;
END
$$;

CREATE OR REPLACE FUNCTION app.release_subscription_is_active_internal(
  requested_organization_id uuid,
  requested_workspace_id uuid,
  requested_subscription_id uuid,
  requested_subject_id uuid,
  requested_effective_at timestamptz,
  requested_system_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT coalesce((
    SELECT latest.active
      AND organization.status = 'active'
      AND workspace.status = 'active'
      AND subject.status = 'active'
      AND organization_membership.valid_from <= requested_effective_at
      AND (
        organization_membership.valid_until IS NULL
        OR organization_membership.valid_until > requested_effective_at
      )
      AND workspace_membership.valid_from <= requested_effective_at
      AND (
        workspace_membership.valid_until IS NULL
        OR workspace_membership.valid_until > requested_effective_at
      )
    FROM app.release_subscriptions subscription
    JOIN app.organizations organization ON organization.id = subscription.organization_id
    JOIN app.workspaces workspace
      ON workspace.organization_id = subscription.organization_id
      AND workspace.id = subscription.workspace_id
    JOIN app.subjects subject ON subject.id = subscription.subject_id
    JOIN app.organization_memberships organization_membership
      ON organization_membership.organization_id = subscription.organization_id
      AND organization_membership.subject_id = subscription.subject_id
    JOIN app.workspace_memberships workspace_membership
      ON workspace_membership.organization_id = subscription.organization_id
      AND workspace_membership.workspace_id = subscription.workspace_id
      AND workspace_membership.subject_id = subscription.subject_id
    JOIN LATERAL (
      SELECT event.active
      FROM app.release_subscription_events event
      WHERE event.organization_id = subscription.organization_id
        AND event.workspace_id = subscription.workspace_id
        AND event.subscription_id = subscription.id
        AND event.occurred_at <= requested_effective_at
        AND event.recorded_at <= requested_system_at
      ORDER BY event.occurred_at DESC, event.recorded_at DESC, event.id DESC
      LIMIT 1
    ) latest ON true
    WHERE subscription.organization_id = requested_organization_id
      AND subscription.workspace_id = requested_workspace_id
      AND subscription.id = requested_subscription_id
      AND subscription.subject_id = requested_subject_id
      AND subscription.created_at <= requested_effective_at
  ), false)
$$;

CREATE OR REPLACE FUNCTION evidence.release_notification_input_manifest(
  requested_organization_id uuid,
  requested_workspace_id uuid,
  requested_series_id uuid,
  requested_release_id uuid,
  requested_monitoring_time_text text,
  requested_release_manifest_sha256 text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'organizationId', requested_organization_id::text,
    'workspaceId', requested_workspace_id::text,
    'seriesId', requested_series_id::text,
    'releaseId', requested_release_id::text,
    'monitoringTime', requested_monitoring_time_text,
    'releaseManifestSha256', requested_release_manifest_sha256
  )
$$;

CREATE OR REPLACE FUNCTION evidence.release_notification_release_is_servable_internal(
  requested_organization_id uuid,
  requested_workspace_id uuid,
  requested_series_id uuid,
  requested_release_id uuid,
  requested_monitoring_time timestamptz,
  requested_release_manifest_sha256 text,
  require_current_admission boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
  SELECT
    app.current_organization_id() = requested_organization_id
    AND coalesce((
      SELECT true
      FROM app.organizations organization
      JOIN app.workspaces workspace
        ON workspace.organization_id = organization.id
        AND workspace.id = requested_workspace_id
      JOIN evidence.series series ON series.id = requested_series_id
      JOIN evidence.source_datasets dataset
        ON dataset.id = series.dataset_id
        AND dataset.tenant_scope = series.tenant_scope
      JOIN evidence.sources source
        ON source.id = dataset.source_id
        AND source.tenant_scope = dataset.tenant_scope
      JOIN evidence.releases release
        ON release.id = requested_release_id
        AND release.dataset_id = dataset.id
        AND release.tenant_scope = dataset.tenant_scope
      JOIN evidence.raw_payloads payload
        ON payload.id = release.raw_payload_id
        AND payload.tenant_scope = release.tenant_scope
      JOIN evidence.observations observation
        ON observation.series_id = series.id
        AND observation.release_id = release.id
        AND observation.tenant_scope = release.tenant_scope
      JOIN evidence.transformation_runs transformation
        ON transformation.id = observation.transformation_run_id
        AND transformation.tenant_scope = observation.tenant_scope
      JOIN evidence.canonical_admissions admission
        ON admission.observation_id = observation.id
        AND admission.transformation_run_id = transformation.id
        AND admission.release_id = release.id
        AND admission.tenant_scope = observation.tenant_scope
      JOIN evidence.canonical_admission_evidence_sets admission_evidence
        ON admission_evidence.admission_id = admission.id
        AND admission_evidence.observation_id = observation.id
        AND admission_evidence.transformation_run_id = transformation.id
        AND admission_evidence.series_id = series.id
        AND admission_evidence.source_id = source.id
        AND admission_evidence.source_dataset_id = dataset.id
        AND admission_evidence.tenant_scope = admission.tenant_scope
      WHERE organization.id = requested_organization_id
        AND organization.status = 'active'
        AND workspace.status = 'active'
        AND (
          series.organization_id IS NULL
          OR series.organization_id = requested_organization_id
        )
        AND (
          dataset.organization_id IS NULL
          OR dataset.organization_id = requested_organization_id
        )
        AND (
          source.organization_id IS NULL
          OR source.organization_id = requested_organization_id
        )
        AND (
          release.organization_id IS NULL
          OR release.organization_id = requested_organization_id
        )
        AND admission.admission_sha256 = requested_release_manifest_sha256
        AND admission_evidence.admission_created_at = admission.created_at
        AND admission_evidence.series_status = 'active'
        AND admission_evidence.series_data_class NOT IN (
          'synthetic_demo', 'synthetic_research'
        )
        AND transformation.status = 'succeeded'
        AND coalesce(
          release.source_publication_time,
          release.release_time,
          release.availability_time,
          payload.fetched_at,
          release.recorded_at
        ) = requested_monitoring_time
        AND (
          NOT require_current_admission
          OR (
            series.status = 'active'
            AND series.data_class = admission_evidence.series_data_class
            AND series.data_class NOT IN ('synthetic_demo', 'synthetic_research')
            AND evidence.source_action_is_currently_admitted(
              source.id, dataset.id, source.license_review_id, 'api'
            )
          )
        )
      LIMIT 1
    ), false)
$$;

CREATE OR REPLACE FUNCTION evidence.release_notification_run_event_manifest(
  requested_event_id uuid,
  requested_workflow_id uuid,
  requested_sequence integer,
  requested_status text,
  requested_details jsonb,
  requested_occurred_at_text text,
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
    'workflowId', requested_workflow_id::text,
    'sequence', requested_sequence,
    'status', requested_status,
    'details', requested_details,
    'occurredAt', requested_occurred_at_text,
    'recordedAt', to_char(
      requested_recorded_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  )
$$;

CREATE OR REPLACE FUNCTION evidence.verify_release_notification_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  expected_input_sha text;
  expected_output_sha text;
BEGIN
  expected_input_sha := encode(digest(
    convert_to(evidence.canonical_json(NEW.input_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  IF NEW.input_sha256 <> expected_input_sha THEN
    RAISE EXCEPTION 'release notification input digest is invalid'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF ROW(
      NEW.workflow_id, NEW.organization_id, NEW.workspace_id, NEW.series_id,
      NEW.release_id, NEW.monitoring_time, NEW.monitoring_time_text,
      NEW.release_manifest_sha256, NEW.input_manifest, NEW.input_sha256,
      NEW.started_at, NEW.created_at
    ) IS DISTINCT FROM ROW(
      OLD.workflow_id, OLD.organization_id, OLD.workspace_id, OLD.series_id,
      OLD.release_id, OLD.monitoring_time, OLD.monitoring_time_text,
      OLD.release_manifest_sha256, OLD.input_manifest, OLD.input_sha256,
      OLD.started_at, OLD.created_at
    ) OR OLD.status <> 'running' OR NEW.status NOT IN ('succeeded', 'failed')
    THEN
      RAISE EXCEPTION 'invalid release notification run transition'
        USING ERRCODE = '55000';
    END IF;
  END IF;
  IF NEW.output_manifest IS NOT NULL THEN
    expected_output_sha := encode(digest(convert_to(
      evidence.canonical_json(NEW.output_manifest - 'manifestSha256'), 'UTF8'
    ), 'sha256'), 'hex');
    IF NEW.output_manifest_sha256 <> expected_output_sha
      OR NEW.output_manifest->>'manifestSha256' <> expected_output_sha
    THEN
      RAISE EXCEPTION 'release notification output manifest digest is invalid'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION evidence.verify_release_notification_run_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  expected_manifest jsonb;
  expected_sha text;
  occurred_text text;
BEGIN
  occurred_text := to_char(
    NEW.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  );
  expected_manifest := evidence.release_notification_run_event_manifest(
    NEW.id, NEW.workflow_id, NEW.event_sequence, NEW.status, NEW.details,
    occurred_text, NEW.recorded_at
  );
  expected_sha := encode(digest(
    convert_to(evidence.canonical_json(expected_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  IF NEW.event_manifest IS DISTINCT FROM expected_manifest
    OR NEW.event_sha256 IS DISTINCT FROM expected_sha
  THEN
    RAISE EXCEPTION 'release notification run event manifest or digest is invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION evidence.record_release_notification_started()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  event_id uuid := gen_random_uuid();
  record_time timestamptz := clock_timestamp();
  occurred_text text;
  details jsonb;
  manifest jsonb;
BEGIN
  occurred_text := to_char(
    NEW.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  );
  details := jsonb_build_object('inputSha256', NEW.input_sha256);
  manifest := evidence.release_notification_run_event_manifest(
    event_id, NEW.workflow_id, 1, 'running', details, occurred_text, record_time
  );
  INSERT INTO evidence.release_notification_run_events (
    id, organization_id, workspace_id, workflow_id, event_sequence, status,
    details, occurred_at, recorded_at, event_manifest, event_sha256
  ) VALUES (
    event_id, NEW.organization_id, NEW.workspace_id, NEW.workflow_id, 1, 'running',
    details, NEW.started_at, record_time, manifest,
    encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex')
  );
  RETURN NEW;
END
$$;

CREATE TRIGGER release_notification_runs_verify
BEFORE INSERT OR UPDATE ON evidence.release_notification_runs
FOR EACH ROW EXECUTE FUNCTION evidence.verify_release_notification_run();
CREATE TRIGGER release_notification_runs_record_started
AFTER INSERT ON evidence.release_notification_runs
FOR EACH ROW EXECUTE FUNCTION evidence.record_release_notification_started();
CREATE TRIGGER release_notification_runs_reject_delete
BEFORE DELETE ON evidence.release_notification_runs
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER release_notification_run_events_verify
BEFORE INSERT ON evidence.release_notification_run_events
FOR EACH ROW EXECUTE FUNCTION evidence.verify_release_notification_run_event();
CREATE TRIGGER release_notification_run_events_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.release_notification_run_events
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE OR REPLACE FUNCTION evidence.verify_release_notification_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  latest_event app.release_subscription_events%ROWTYPE;
BEGIN
  IF NEW.delivery_id <> evidence.deterministic_uuid_v8(
    'economyos:release-notification-delivery:v1',
    NEW.workflow_id::text, NEW.subscription_id::text
  ) THEN
    RAISE EXCEPTION 'release notification delivery identity is invalid'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO latest_event
  FROM app.release_subscription_events event
  WHERE event.organization_id = NEW.organization_id
    AND event.workspace_id = NEW.workspace_id
    AND event.subscription_id = NEW.subscription_id
    AND event.subject_id = NEW.subject_id
    AND event.occurred_at <= NEW.resolved_at
    AND event.recorded_at <= NEW.resolved_at
  ORDER BY event.occurred_at DESC, event.recorded_at DESC, event.id DESC
  LIMIT 1;
  IF latest_event.id IS NULL OR latest_event.id <> NEW.resolved_subscription_event_id
    OR NOT latest_event.active
  THEN
    RAISE EXCEPTION 'release notification candidate lacks active subscription evidence'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER release_notification_candidates_verify
BEFORE INSERT ON evidence.release_notification_candidates
FOR EACH ROW EXECUTE FUNCTION evidence.verify_release_notification_candidate();
CREATE TRIGGER release_notification_candidates_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.release_notification_candidates
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE OR REPLACE FUNCTION evidence.release_notification_delivery_manifest(
  requested_workflow_id uuid,
  requested_input_sha256 text,
  requested_release_id uuid,
  requested_release_manifest_sha256 text,
  requested_delivery_id uuid,
  requested_subscription_id uuid,
  requested_subject_id uuid,
  requested_status text,
  requested_reason text,
  requested_occurred_at_text text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'workflowId', requested_workflow_id::text,
    'inputSha256', requested_input_sha256,
    'releaseId', requested_release_id::text,
    'releaseManifestSha256', requested_release_manifest_sha256,
    'deliveryId', requested_delivery_id::text,
    'subscriptionId', requested_subscription_id::text,
    'subjectId', requested_subject_id::text,
    'channel', 'in_app',
    'status', requested_status,
    'reason', requested_reason,
    'occurredAt', requested_occurred_at_text
  )
$$;

CREATE OR REPLACE FUNCTION evidence.verify_release_notification_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  run evidence.release_notification_runs%ROWTYPE;
  expected_manifest jsonb;
  expected_sha text;
BEGIN
  SELECT * INTO run
  FROM evidence.release_notification_runs candidate
  WHERE candidate.workflow_id = NEW.workflow_id
    AND candidate.organization_id = NEW.organization_id
    AND candidate.workspace_id = NEW.workspace_id;
  IF run.workflow_id IS NULL THEN
    RAISE EXCEPTION 'release notification delivery lacks its exact workflow'
      USING ERRCODE = '23514';
  END IF;
  expected_manifest := evidence.release_notification_delivery_manifest(
    NEW.workflow_id, run.input_sha256, run.release_id,
    run.release_manifest_sha256, NEW.delivery_id, NEW.subscription_id,
    NEW.subject_id, NEW.status, NEW.reason, NEW.occurred_at_text
  );
  expected_sha := encode(digest(
    convert_to(evidence.canonical_json(expected_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  IF NEW.delivery_manifest IS DISTINCT FROM expected_manifest
    OR NEW.delivery_sha256 IS DISTINCT FROM expected_sha
  THEN
    RAISE EXCEPTION 'release notification delivery manifest or digest is invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER release_notification_deliveries_verify
BEFORE INSERT ON evidence.release_notification_deliveries
FOR EACH ROW EXECUTE FUNCTION evidence.verify_release_notification_delivery();
CREATE TRIGGER release_notification_deliveries_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.release_notification_deliveries
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE OR REPLACE FUNCTION evidence.prepare_release_notifications(
  requested_workflow_id uuid,
  requested_organization_id uuid,
  requested_workspace_id uuid,
  requested_series_id uuid,
  requested_release_id uuid,
  requested_monitoring_time_text text,
  requested_release_manifest_sha256 text,
  requested_input_sha256 text
)
RETURNS TABLE (
  disposition text,
  candidates jsonb,
  existing_output jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  run evidence.release_notification_runs%ROWTYPE;
  input_manifest jsonb;
  calculated_input_sha text;
  expected_workflow_id uuid;
  monitoring_time timestamptz;
  resolution_time timestamptz := clock_timestamp();
  candidate_count integer;
  candidate_manifest jsonb;
BEGIN
  IF requested_workflow_id IS NULL OR requested_organization_id IS NULL
    OR requested_workspace_id IS NULL OR requested_series_id IS NULL
    OR requested_release_id IS NULL
    OR requested_monitoring_time_text IS NULL
    OR requested_monitoring_time_text !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?Z$'
    OR requested_release_manifest_sha256 !~ '^[0-9a-f]{64}$'
    OR requested_input_sha256 !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'invalid release notification workflow input'
      USING ERRCODE = '22023';
  END IF;
  monitoring_time := requested_monitoring_time_text::timestamptz;
  IF NOT isfinite(monitoring_time) OR monitoring_time > statement_timestamp() THEN
    RAISE EXCEPTION 'release notification monitoring time must be finite and observed'
      USING ERRCODE = '22023';
  END IF;
  IF app.current_organization_id() IS DISTINCT FROM requested_organization_id THEN
    RAISE EXCEPTION 'release notification tenant context is invalid'
      USING ERRCODE = '42501';
  END IF;

  input_manifest := evidence.release_notification_input_manifest(
    requested_organization_id, requested_workspace_id, requested_series_id,
    requested_release_id, requested_monitoring_time_text,
    requested_release_manifest_sha256
  );
  calculated_input_sha := encode(digest(
    convert_to(evidence.canonical_json(input_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  expected_workflow_id := evidence.deterministic_uuid_v8(
    'economyos:release-notification-workflow:v1',
    requested_organization_id::text, requested_workspace_id::text,
    requested_series_id::text, requested_release_id::text
  );
  IF requested_input_sha256 <> calculated_input_sha
    OR requested_workflow_id <> expected_workflow_id
  THEN
    RAISE EXCEPTION 'release notification workflow identity or digest is invalid'
      USING ERRCODE = '23514';
  END IF;
  IF NOT evidence.release_notification_release_is_servable_internal(
    requested_organization_id, requested_workspace_id, requested_series_id,
    requested_release_id, monitoring_time, requested_release_manifest_sha256,
    false
  ) THEN
    RAISE EXCEPTION 'release notification input is not bound to immutable release evidence'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(requested_workflow_id::text, 31003));
  SELECT * INTO run
  FROM evidence.release_notification_runs candidate
  WHERE candidate.workflow_id = requested_workflow_id
  FOR UPDATE;
  IF run.workflow_id IS NOT NULL THEN
    IF ROW(
      run.organization_id, run.workspace_id, run.series_id, run.release_id,
      run.monitoring_time, run.monitoring_time_text, run.release_manifest_sha256,
      run.input_manifest, run.input_sha256
    ) IS DISTINCT FROM ROW(
      requested_organization_id, requested_workspace_id, requested_series_id,
      requested_release_id, monitoring_time, requested_monitoring_time_text,
      requested_release_manifest_sha256, input_manifest, requested_input_sha256
    ) THEN
      RAISE EXCEPTION 'release notification workflow replay differs from committed input'
        USING ERRCODE = '23514';
    END IF;
    IF run.status = 'failed' THEN
      RAISE EXCEPTION 'failed release notification workflow is terminal'
        USING ERRCODE = '23514';
    END IF;
    IF run.status = 'succeeded' THEN
      RETURN QUERY SELECT 'return_existing'::text, '[]'::jsonb, run.output_manifest;
      RETURN;
    END IF;
  ELSE
    INSERT INTO evidence.release_notification_runs (
      workflow_id, organization_id, workspace_id, series_id, release_id,
      monitoring_time, monitoring_time_text, release_manifest_sha256,
      input_manifest, input_sha256, status, started_at
    ) VALUES (
      requested_workflow_id, requested_organization_id, requested_workspace_id,
      requested_series_id, requested_release_id, monitoring_time,
      requested_monitoring_time_text, requested_release_manifest_sha256,
      input_manifest, requested_input_sha256, 'running', resolution_time
    ) RETURNING * INTO run;

    SELECT count(*) INTO candidate_count
    FROM app.release_subscriptions subscription
    WHERE subscription.organization_id = requested_organization_id
      AND subscription.workspace_id = requested_workspace_id
      AND subscription.series_id = requested_series_id
      AND subscription.channel = 'in_app'
      AND app.release_subscription_is_active_internal(
        subscription.organization_id, subscription.workspace_id,
        subscription.id, subscription.subject_id,
        monitoring_time, monitoring_time
      )
      AND app.release_subscription_is_active_internal(
        subscription.organization_id, subscription.workspace_id,
        subscription.id, subscription.subject_id,
        resolution_time, resolution_time
      );
    IF candidate_count > 1000 THEN
      RAISE EXCEPTION 'release notification candidate limit exceeded'
        USING ERRCODE = '54000';
    END IF;

    INSERT INTO evidence.release_notification_candidates (
      delivery_id, organization_id, workspace_id, workflow_id,
      subscription_id, subject_id, channel,
      resolved_subscription_event_id, resolved_at
    )
    SELECT
      evidence.deterministic_uuid_v8(
        'economyos:release-notification-delivery:v1',
        requested_workflow_id::text, subscription.id::text
      ),
      subscription.organization_id, subscription.workspace_id,
      requested_workflow_id, subscription.id, subscription.subject_id,
      subscription.channel, latest_event.id, resolution_time
    FROM app.release_subscriptions subscription
    JOIN LATERAL (
      SELECT event.id
      FROM app.release_subscription_events event
      WHERE event.organization_id = subscription.organization_id
        AND event.workspace_id = subscription.workspace_id
        AND event.subscription_id = subscription.id
        AND event.occurred_at <= resolution_time
        AND event.recorded_at <= resolution_time
      ORDER BY event.occurred_at DESC, event.recorded_at DESC, event.id DESC
      LIMIT 1
    ) latest_event ON true
    WHERE subscription.organization_id = requested_organization_id
      AND subscription.workspace_id = requested_workspace_id
      AND subscription.series_id = requested_series_id
      AND subscription.channel = 'in_app'
      AND app.release_subscription_is_active_internal(
        subscription.organization_id, subscription.workspace_id,
        subscription.id, subscription.subject_id,
        monitoring_time, monitoring_time
      )
      AND app.release_subscription_is_active_internal(
        subscription.organization_id, subscription.workspace_id,
        subscription.id, subscription.subject_id,
        resolution_time, resolution_time
      );
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'deliveryId', candidate.delivery_id::text,
    'subscriptionId', candidate.subscription_id::text,
    'subjectId', candidate.subject_id::text,
    'channel', candidate.channel
  ) ORDER BY candidate.delivery_id), '[]'::jsonb)
  INTO candidate_manifest
  FROM evidence.release_notification_candidates candidate
  WHERE candidate.organization_id = requested_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.workflow_id = requested_workflow_id;
  RETURN QUERY SELECT 'execute'::text, candidate_manifest, NULL::jsonb;
EXCEPTION
  WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'release notification monitoring time is invalid'
      USING ERRCODE = '22023';
END
$$;

CREATE OR REPLACE FUNCTION evidence.deliver_release_notification(
  requested_workflow_id uuid,
  requested_input_sha256 text,
  requested_delivery_id uuid,
  requested_subscription_id uuid,
  requested_subject_id uuid,
  requested_occurred_at_text text
)
RETURNS TABLE (
  delivery_id uuid,
  subscription_id uuid,
  subject_id uuid,
  channel text,
  status text,
  reason text,
  occurred_at_text text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  run evidence.release_notification_runs%ROWTYPE;
  candidate evidence.release_notification_candidates%ROWTYPE;
  prior_delivery evidence.release_notification_deliveries%ROWTYPE;
  occurred_at timestamptz;
  outcome_status text;
  outcome_reason text;
  manifest jsonb;
  manifest_sha text;
BEGIN
  IF requested_workflow_id IS NULL OR requested_delivery_id IS NULL
    OR requested_subscription_id IS NULL OR requested_subject_id IS NULL
    OR requested_input_sha256 !~ '^[0-9a-f]{64}$'
    OR requested_occurred_at_text IS NULL
    OR requested_occurred_at_text !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?Z$'
  THEN
    RAISE EXCEPTION 'invalid release notification delivery input'
      USING ERRCODE = '22023';
  END IF;
  occurred_at := requested_occurred_at_text::timestamptz;
  IF occurred_at > statement_timestamp() + interval '1 minute' THEN
    RAISE EXCEPTION 'release notification delivery cannot be future-dated'
      USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(requested_workflow_id::text, 31003));
  SELECT * INTO run
  FROM evidence.release_notification_runs stored
  WHERE stored.workflow_id = requested_workflow_id
    AND stored.organization_id = app.current_organization_id()
  FOR UPDATE;
  IF run.workflow_id IS NULL OR run.input_sha256 <> requested_input_sha256 THEN
    RAISE EXCEPTION 'release notification workflow is outside the current tenant or input'
      USING ERRCODE = '42501';
  END IF;
  IF occurred_at < run.started_at THEN
    RAISE EXCEPTION 'release notification delivery precedes workflow start'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO candidate
  FROM evidence.release_notification_candidates stored
  WHERE stored.organization_id = run.organization_id
    AND stored.workspace_id = run.workspace_id
    AND stored.workflow_id = run.workflow_id
    AND stored.delivery_id = requested_delivery_id
    AND stored.subscription_id = requested_subscription_id
    AND stored.subject_id = requested_subject_id
    AND stored.channel = 'in_app';
  IF candidate.delivery_id IS NULL THEN
    RAISE EXCEPTION 'release notification candidate identity is invalid'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO prior_delivery
  FROM evidence.release_notification_deliveries stored
  WHERE stored.delivery_id = candidate.delivery_id;
  IF prior_delivery.delivery_id IS NOT NULL THEN
    IF prior_delivery.occurred_at_text <> requested_occurred_at_text THEN
      RAISE EXCEPTION 'release notification delivery replay changed its time'
        USING ERRCODE = '23514';
    END IF;
    RETURN QUERY SELECT
      prior_delivery.delivery_id, prior_delivery.subscription_id,
      prior_delivery.subject_id, prior_delivery.channel,
      prior_delivery.status, prior_delivery.reason,
      prior_delivery.occurred_at_text;
    RETURN;
  END IF;
  IF run.status <> 'running' THEN
    RAISE EXCEPTION 'release notification workflow is terminal without this delivery'
      USING ERRCODE = '23514';
  END IF;

  IF NOT app.release_subscription_is_active_internal(
    run.organization_id, run.workspace_id, candidate.subscription_id,
    candidate.subject_id, statement_timestamp(), statement_timestamp()
  ) THEN
    outcome_status := 'suppressed';
    outcome_reason := 'subscription_inactive';
  ELSIF NOT evidence.release_notification_release_is_servable_internal(
    run.organization_id, run.workspace_id, run.series_id, run.release_id,
    run.monitoring_time, run.release_manifest_sha256, true
  ) THEN
    outcome_status := 'suppressed';
    outcome_reason := 'release_not_servable';
  ELSE
    outcome_status := 'delivered';
    outcome_reason := 'delivered';
  END IF;
  manifest := evidence.release_notification_delivery_manifest(
    run.workflow_id, run.input_sha256, run.release_id,
    run.release_manifest_sha256, candidate.delivery_id,
    candidate.subscription_id, candidate.subject_id,
    outcome_status, outcome_reason, requested_occurred_at_text
  );
  manifest_sha := encode(digest(
    convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'
  ), 'hex');
  INSERT INTO evidence.release_notification_deliveries (
    delivery_id, organization_id, workspace_id, workflow_id,
    subscription_id, subject_id, channel, status, reason,
    occurred_at, occurred_at_text, delivery_manifest, delivery_sha256
  ) VALUES (
    candidate.delivery_id, run.organization_id, run.workspace_id, run.workflow_id,
    candidate.subscription_id, candidate.subject_id, candidate.channel,
    outcome_status, outcome_reason, occurred_at, requested_occurred_at_text,
    manifest, manifest_sha
  ) RETURNING
    evidence.release_notification_deliveries.delivery_id,
    evidence.release_notification_deliveries.subscription_id,
    evidence.release_notification_deliveries.subject_id,
    evidence.release_notification_deliveries.channel,
    evidence.release_notification_deliveries.status,
    evidence.release_notification_deliveries.reason,
    evidence.release_notification_deliveries.occurred_at_text
  INTO delivery_id, subscription_id, subject_id, channel, status, reason, occurred_at_text;
  RETURN NEXT;
EXCEPTION
  WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'release notification delivery time is invalid'
      USING ERRCODE = '22023';
END
$$;

CREATE OR REPLACE FUNCTION evidence.complete_release_notifications(
  requested_workflow_id uuid,
  requested_input_sha256 text,
  requested_output_manifest jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  run evidence.release_notification_runs%ROWTYPE;
  candidate_count integer;
  delivery_count integer;
  delivered_count integer;
  delivery_manifest jsonb;
  completion_time_text text;
  completion_time timestamptz;
  body jsonb;
  manifest_sha text;
  expected_manifest jsonb;
  event_id uuid := gen_random_uuid();
  record_time timestamptz := clock_timestamp();
  event_details jsonb;
  event_manifest jsonb;
BEGIN
  IF requested_workflow_id IS NULL
    OR requested_input_sha256 !~ '^[0-9a-f]{64}$'
    OR requested_output_manifest IS NULL
    OR jsonb_typeof(requested_output_manifest) <> 'object'
  THEN
    RAISE EXCEPTION 'invalid release notification completion input'
      USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(requested_workflow_id::text, 31003));
  SELECT * INTO run
  FROM evidence.release_notification_runs stored
  WHERE stored.workflow_id = requested_workflow_id
    AND stored.organization_id = app.current_organization_id()
  FOR UPDATE;
  IF run.workflow_id IS NULL OR run.input_sha256 <> requested_input_sha256 THEN
    RAISE EXCEPTION 'release notification workflow is outside the current tenant or input'
      USING ERRCODE = '42501';
  END IF;
  IF run.status = 'succeeded' THEN
    IF run.output_manifest IS DISTINCT FROM requested_output_manifest THEN
      RAISE EXCEPTION 'release notification completion replay changed its manifest'
        USING ERRCODE = '23514';
    END IF;
    RETURN run.output_manifest;
  ELSIF run.status <> 'running' THEN
    RAISE EXCEPTION 'failed release notification workflow cannot complete'
      USING ERRCODE = '23514';
  END IF;

  completion_time_text := requested_output_manifest->>'completedAt';
  IF completion_time_text IS NULL OR completion_time_text !~
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?Z$'
  THEN
    RAISE EXCEPTION 'release notification completion time is invalid'
      USING ERRCODE = '22023';
  END IF;
  completion_time := completion_time_text::timestamptz;
  IF completion_time < run.started_at
    OR completion_time > statement_timestamp() + interval '1 minute'
  THEN
    RAISE EXCEPTION 'release notification completion time is outside workflow bounds'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO candidate_count
  FROM evidence.release_notification_candidates candidate
  WHERE candidate.organization_id = run.organization_id
    AND candidate.workspace_id = run.workspace_id
    AND candidate.workflow_id = run.workflow_id;
  SELECT
    count(*),
    count(*) FILTER (WHERE delivery.status = 'delivered'),
    coalesce(jsonb_agg(jsonb_build_object(
      'deliveryId', delivery.delivery_id::text,
      'subscriptionId', delivery.subscription_id::text,
      'subjectId', delivery.subject_id::text,
      'channel', delivery.channel,
      'status', delivery.status,
      'reason', delivery.reason,
      'occurredAt', delivery.occurred_at_text
    ) ORDER BY delivery.delivery_id), '[]'::jsonb)
  INTO delivery_count, delivered_count, delivery_manifest
  FROM evidence.release_notification_deliveries delivery
  WHERE delivery.organization_id = run.organization_id
    AND delivery.workspace_id = run.workspace_id
    AND delivery.workflow_id = run.workflow_id;
  IF delivery_count <> candidate_count OR EXISTS (
    SELECT 1 FROM evidence.release_notification_deliveries delivery
    WHERE delivery.organization_id = run.organization_id
      AND delivery.workspace_id = run.workspace_id
      AND delivery.workflow_id = run.workflow_id
      AND delivery.occurred_at > completion_time
  ) THEN
    RAISE EXCEPTION 'release notification completion requires every frozen delivery'
      USING ERRCODE = '23514';
  END IF;

  body := jsonb_build_object(
    'schemaVersion', 1,
    'workflowId', run.workflow_id::text,
    'inputSha256', run.input_sha256,
    'releaseId', run.release_id::text,
    'status', 'succeeded',
    'candidateCount', candidate_count,
    'deliveredCount', delivered_count,
    'suppressedCount', candidate_count - delivered_count,
    'deliveries', delivery_manifest,
    'completedAt', completion_time_text
  );
  manifest_sha := encode(digest(
    convert_to(evidence.canonical_json(body), 'UTF8'), 'sha256'
  ), 'hex');
  expected_manifest := body || jsonb_build_object('manifestSha256', manifest_sha);
  IF requested_output_manifest IS DISTINCT FROM expected_manifest THEN
    RAISE EXCEPTION 'release notification output differs from immutable deliveries'
      USING ERRCODE = '23514';
  END IF;

  UPDATE evidence.release_notification_runs
  SET status = 'succeeded', completed_at = completion_time,
      completed_at_text = completion_time_text,
      output_manifest = expected_manifest,
      output_manifest_sha256 = manifest_sha
  WHERE workflow_id = run.workflow_id;
  event_details := jsonb_build_object('manifestSha256', manifest_sha);
  event_manifest := evidence.release_notification_run_event_manifest(
    event_id, run.workflow_id, 2, 'succeeded', event_details,
    completion_time_text, record_time
  );
  INSERT INTO evidence.release_notification_run_events (
    id, organization_id, workspace_id, workflow_id, event_sequence,
    status, details, occurred_at, recorded_at, event_manifest, event_sha256
  ) VALUES (
    event_id, run.organization_id, run.workspace_id, run.workflow_id, 2,
    'succeeded', event_details, completion_time, record_time, event_manifest,
    encode(digest(convert_to(evidence.canonical_json(event_manifest), 'UTF8'), 'sha256'), 'hex')
  );
  RETURN expected_manifest;
EXCEPTION
  WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'release notification completion time is invalid'
      USING ERRCODE = '22023';
END
$$;

CREATE OR REPLACE FUNCTION evidence.fail_release_notifications(
  requested_workflow_id uuid,
  requested_input_sha256 text,
  requested_error_code text,
  requested_message text,
  requested_occurred_at_text text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, app
AS $$
DECLARE
  run evidence.release_notification_runs%ROWTYPE;
  occurred_at timestamptz;
  completed_deliveries integer;
  event_id uuid := gen_random_uuid();
  record_time timestamptz := clock_timestamp();
  event_details jsonb;
  event_manifest jsonb;
BEGIN
  IF requested_workflow_id IS NULL
    OR requested_input_sha256 !~ '^[0-9a-f]{64}$'
    OR requested_error_code !~ '^[A-Z][A-Z0-9_]{1,127}$'
    OR requested_message IS NULL OR length(requested_message) NOT BETWEEN 1 AND 1000
    OR requested_message <> btrim(requested_message)
    OR requested_occurred_at_text IS NULL
    OR requested_occurred_at_text !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?Z$'
  THEN
    RAISE EXCEPTION 'invalid release notification failure input'
      USING ERRCODE = '22023';
  END IF;
  occurred_at := requested_occurred_at_text::timestamptz;
  PERFORM pg_advisory_xact_lock(hashtextextended(requested_workflow_id::text, 31003));
  SELECT * INTO run
  FROM evidence.release_notification_runs stored
  WHERE stored.workflow_id = requested_workflow_id
    AND stored.organization_id = app.current_organization_id()
  FOR UPDATE;
  IF run.workflow_id IS NULL OR run.input_sha256 <> requested_input_sha256 THEN
    RAISE EXCEPTION 'release notification workflow is outside the current tenant or input'
      USING ERRCODE = '42501';
  END IF;
  IF occurred_at < run.started_at
    OR occurred_at > statement_timestamp() + interval '1 minute'
  THEN
    RAISE EXCEPTION 'release notification failure time is outside workflow bounds'
      USING ERRCODE = '22023';
  END IF;
  IF run.status = 'failed' THEN
    IF run.error_code <> requested_error_code
      OR run.error_message <> requested_message
      OR run.completed_at_text <> requested_occurred_at_text
    THEN
      RAISE EXCEPTION 'release notification failure replay changed its evidence'
        USING ERRCODE = '23514';
    END IF;
    RETURN;
  ELSIF run.status <> 'running' THEN
    RAISE EXCEPTION 'successful release notification workflow cannot fail'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO completed_deliveries
  FROM evidence.release_notification_deliveries delivery
  WHERE delivery.organization_id = run.organization_id
    AND delivery.workspace_id = run.workspace_id
    AND delivery.workflow_id = run.workflow_id;
  UPDATE evidence.release_notification_runs
  SET status = 'failed', completed_at = occurred_at,
      completed_at_text = requested_occurred_at_text,
      error_code = requested_error_code, error_message = requested_message
  WHERE workflow_id = run.workflow_id;
  event_details := jsonb_build_object(
    'errorCode', requested_error_code,
    'message', requested_message,
    'completedDeliveryCount', completed_deliveries
  );
  event_manifest := evidence.release_notification_run_event_manifest(
    event_id, run.workflow_id, 2, 'failed', event_details,
    requested_occurred_at_text, record_time
  );
  INSERT INTO evidence.release_notification_run_events (
    id, organization_id, workspace_id, workflow_id, event_sequence,
    status, details, occurred_at, recorded_at, event_manifest, event_sha256
  ) VALUES (
    event_id, run.organization_id, run.workspace_id, run.workflow_id, 2,
    'failed', event_details, occurred_at, record_time, event_manifest,
    encode(digest(convert_to(evidence.canonical_json(event_manifest), 'UTF8'), 'sha256'), 'hex')
  );
EXCEPTION
  WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'release notification failure time is invalid'
      USING ERRCODE = '22023';
END
$$;

CREATE OR REPLACE FUNCTION app.get_current_release_subscription(
  requested_workspace_id uuid,
  requested_series_id uuid
)
RETURNS TABLE (
  subscription_id uuid,
  workspace_id uuid,
  series_id uuid,
  channel text,
  active boolean,
  resolved_event_id uuid,
  effective_at timestamptz,
  recorded_at timestamptz,
  event_sha256 text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  resolution_time timestamptz := statement_timestamp();
BEGIN
  IF requested_workspace_id IS NULL OR requested_series_id IS NULL THEN
    RAISE EXCEPTION 'workspace and series are required for subscription lookup'
      USING ERRCODE = '22023';
  END IF;
  IF caller_organization_id IS NULL OR caller_subject_id IS NULL
    OR NOT evidence.economic_state_workspace_visible(
      caller_organization_id, requested_workspace_id
    )
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    subscription.id,
    subscription.workspace_id,
    subscription.series_id,
    subscription.channel,
    latest_event.active,
    latest_event.id,
    latest_event.occurred_at,
    latest_event.recorded_at,
    latest_event.event_sha256
  FROM app.release_subscriptions subscription
  JOIN LATERAL (
    SELECT event.id, event.active, event.occurred_at,
      event.recorded_at, event.event_sha256
    FROM app.release_subscription_events event
    WHERE event.organization_id = subscription.organization_id
      AND event.workspace_id = subscription.workspace_id
      AND event.subscription_id = subscription.id
      AND event.subject_id = subscription.subject_id
      AND event.occurred_at <= resolution_time
      AND event.recorded_at <= resolution_time
    ORDER BY event.occurred_at DESC, event.recorded_at DESC, event.id DESC
    LIMIT 1
  ) latest_event ON true
  WHERE subscription.organization_id = caller_organization_id
    AND subscription.workspace_id = requested_workspace_id
    AND subscription.series_id = requested_series_id
    AND subscription.subject_id = caller_subject_id
    AND subscription.channel = 'in_app'
    AND subscription.created_at <= resolution_time;
END
$$;

CREATE OR REPLACE FUNCTION app.list_delivered_release_notifications(
  requested_workspace_id uuid,
  requested_limit integer DEFAULT 50,
  requested_before_occurred_at timestamptz DEFAULT NULL,
  requested_before_delivery_id uuid DEFAULT NULL
)
RETURNS TABLE (
  delivery_id uuid,
  workflow_id uuid,
  subscription_id uuid,
  series_id uuid,
  release_id uuid,
  occurred_at timestamptz,
  delivery_sha256 text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
BEGIN
  IF requested_workspace_id IS NULL
    OR requested_limit IS NULL OR requested_limit NOT BETWEEN 1 AND 100
    OR (requested_before_occurred_at IS NULL)
      <> (requested_before_delivery_id IS NULL)
    OR (
      requested_before_occurred_at IS NOT NULL
      AND NOT isfinite(requested_before_occurred_at)
    )
  THEN
    RAISE EXCEPTION 'invalid release notification page request'
      USING ERRCODE = '22023';
  END IF;
  IF caller_organization_id IS NULL OR caller_subject_id IS NULL
    OR NOT evidence.economic_state_workspace_visible(
      caller_organization_id, requested_workspace_id
    )
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    delivery.delivery_id,
    delivery.workflow_id,
    delivery.subscription_id,
    run.series_id,
    run.release_id,
    delivery.occurred_at,
    delivery.delivery_sha256
  FROM evidence.release_notification_deliveries delivery
  JOIN evidence.release_notification_runs run
    ON run.organization_id = delivery.organization_id
    AND run.workspace_id = delivery.workspace_id
    AND run.workflow_id = delivery.workflow_id
  JOIN app.release_subscriptions subscription
    ON subscription.organization_id = delivery.organization_id
    AND subscription.workspace_id = delivery.workspace_id
    AND subscription.id = delivery.subscription_id
    AND subscription.subject_id = delivery.subject_id
    AND subscription.series_id = run.series_id
    AND subscription.channel = delivery.channel
  WHERE delivery.organization_id = caller_organization_id
    AND delivery.workspace_id = requested_workspace_id
    AND delivery.subject_id = caller_subject_id
    AND delivery.channel = 'in_app'
    AND delivery.status = 'delivered'
    AND (
      requested_before_occurred_at IS NULL
      OR (delivery.occurred_at, delivery.delivery_id) <
        (requested_before_occurred_at, requested_before_delivery_id)
    )
  ORDER BY delivery.occurred_at DESC, delivery.delivery_id DESC
  LIMIT requested_limit;
END
$$;

ALTER TABLE app.release_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.release_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE app.release_subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.release_subscription_events FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.release_notification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.release_notification_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.release_notification_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.release_notification_run_events FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.release_notification_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.release_notification_candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.release_notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.release_notification_deliveries FORCE ROW LEVEL SECURITY;

CREATE POLICY release_subscriptions_subject_workspace ON app.release_subscriptions
  USING (
    subject_id = app.current_subject_id()
    AND evidence.economic_state_workspace_visible(organization_id, workspace_id)
  )
  WITH CHECK (
    subject_id = app.current_subject_id()
    AND evidence.economic_state_workspace_visible(organization_id, workspace_id)
  );
CREATE POLICY release_subscription_events_subject_workspace
  ON app.release_subscription_events
  USING (
    subject_id = app.current_subject_id()
    AND evidence.economic_state_workspace_visible(organization_id, workspace_id)
  )
  WITH CHECK (
    subject_id = app.current_subject_id()
    AND evidence.economic_state_workspace_visible(organization_id, workspace_id)
  );
CREATE POLICY release_notification_runs_tenant ON evidence.release_notification_runs
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
CREATE POLICY release_notification_run_events_tenant
  ON evidence.release_notification_run_events
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
CREATE POLICY release_notification_candidates_tenant
  ON evidence.release_notification_candidates
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
CREATE POLICY release_notification_deliveries_tenant
  ON evidence.release_notification_deliveries
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());

CREATE INDEX release_subscription_events_current_idx
  ON app.release_subscription_events (
    organization_id, workspace_id, subscription_id,
    occurred_at DESC, recorded_at DESC, id DESC
  );
CREATE INDEX release_subscriptions_series_active_idx
  ON app.release_subscriptions (
    organization_id, workspace_id, series_id, subject_id, id
  );
CREATE INDEX release_notification_candidates_workflow_idx
  ON evidence.release_notification_candidates (
    organization_id, workspace_id, workflow_id, delivery_id
  );
CREATE INDEX release_notification_deliveries_workflow_idx
  ON evidence.release_notification_deliveries (
    organization_id, workspace_id, workflow_id, delivery_id
  );
CREATE INDEX release_notification_deliveries_subject_page_idx
  ON evidence.release_notification_deliveries (
    organization_id, workspace_id, subject_id,
    occurred_at DESC, delivery_id DESC
  )
  WHERE channel = 'in_app' AND status = 'delivered';

REVOKE ALL ON TABLE
  app.release_subscriptions,
  app.release_subscription_events,
  evidence.release_notification_runs,
  evidence.release_notification_run_events,
  evidence.release_notification_candidates,
  evidence.release_notification_deliveries
FROM PUBLIC, economyos_app, economyos_ingest;

REVOKE ALL ON FUNCTION evidence.deterministic_uuid_v8(VARIADIC text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.release_subscription_event_manifest(
  uuid, uuid, uuid, uuid, boolean, text, uuid, text, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.verify_release_subscription_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.release_subscription_is_active_internal(
  uuid, uuid, uuid, uuid, timestamptz, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.release_notification_input_manifest(
  uuid, uuid, uuid, uuid, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.release_notification_release_is_servable_internal(
  uuid, uuid, uuid, uuid, timestamptz, text, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.release_notification_run_event_manifest(
  uuid, uuid, integer, text, jsonb, text, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.verify_release_notification_run() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.verify_release_notification_run_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.record_release_notification_started() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.verify_release_notification_candidate() FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.release_notification_delivery_manifest(
  uuid, text, uuid, text, uuid, uuid, uuid, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.verify_release_notification_delivery() FROM PUBLIC;

REVOKE ALL ON FUNCTION app.create_release_subscription(
  uuid, uuid, uuid, text, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.set_release_subscription_active(
  uuid, boolean, text, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_current_release_subscription(uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION app.list_delivered_release_notifications(
  uuid, integer, timestamptz, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.prepare_release_notifications(
  uuid, uuid, uuid, uuid, uuid, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.deliver_release_notification(
  uuid, text, uuid, uuid, uuid, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.complete_release_notifications(
  uuid, text, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION evidence.fail_release_notifications(
  uuid, text, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.create_release_subscription(
  uuid, uuid, uuid, text, timestamptz
) TO economyos_app;
GRANT EXECUTE ON FUNCTION app.set_release_subscription_active(
  uuid, boolean, text, timestamptz
) TO economyos_app;
GRANT EXECUTE ON FUNCTION app.get_current_release_subscription(uuid, uuid)
  TO economyos_app;
GRANT EXECUTE ON FUNCTION app.list_delivered_release_notifications(
  uuid, integer, timestamptz, uuid
) TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.prepare_release_notifications(
  uuid, uuid, uuid, uuid, uuid, text, text, text
) TO economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.deliver_release_notification(
  uuid, text, uuid, uuid, uuid, text
) TO economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.complete_release_notifications(
  uuid, text, jsonb
) TO economyos_ingest;
GRANT EXECUTE ON FUNCTION evidence.fail_release_notifications(
  uuid, text, text, text, text
) TO economyos_ingest;

COMMENT ON TABLE app.release_subscriptions IS
  'Immutable in-app series subscription identities with effective state held in append-only events.';
COMMENT ON TABLE evidence.release_notification_candidates IS
  'Frozen, bounded active-subscription set resolved once when a release workflow begins.';
COMMENT ON TABLE evidence.release_notification_deliveries IS
  'Append-only delivered or fail-closed suppressed evidence, one idempotent record per frozen candidate.';
COMMENT ON FUNCTION app.get_current_release_subscription(uuid, uuid) IS
  'Returns at most the current subject own exact workspace-series in-app subscription, resolved across effective and system time.';
COMMENT ON FUNCTION app.list_delivered_release_notifications(
  uuid, integer, timestamptz, uuid
) IS 'Returns a bounded descending keyset page of immutable delivered in-app notification pointers for the current subject and workspace.';
COMMENT ON FUNCTION evidence.prepare_release_notifications(
  uuid, uuid, uuid, uuid, uuid, text, text, text
) IS 'Begins or replays one exact release workflow and returns its frozen active in-app candidates or prior terminal output.';
COMMENT ON FUNCTION evidence.deliver_release_notification(
  uuid, text, uuid, uuid, uuid, text
) IS 'Idempotently records one delivery after rechecking current subscription membership and release legal servability.';
COMMENT ON FUNCTION evidence.complete_release_notifications(uuid, text, jsonb) IS
  'Commits only the canonical replay-safe output manifest exactly reproduced from all immutable delivery evidence.';
