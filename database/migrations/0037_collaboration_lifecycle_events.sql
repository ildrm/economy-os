-- Add append-only lifecycle controls for Phase 14 integration resources.
-- Migrations 0035 and 0036 are frozen; all effective state is derived from
-- immutable registration rows plus the ledgers introduced here.

CREATE TABLE app.integration_api_credential_lifecycle_events (
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  credential_id uuid NOT NULL,
  sequence bigint NOT NULL CHECK (sequence BETWEEN 1 AND 1000000000),
  previous_event_sha256 text CHECK (
    previous_event_sha256 IS NULL OR previous_event_sha256 ~ '^[0-9a-f]{64}$'
  ),
  event_sha256 text NOT NULL CHECK (event_sha256 ~ '^[0-9a-f]{64}$'),
  action text NOT NULL CHECK (action = 'revoked'),
  actor_id uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL CHECK (isfinite(occurred_at)),
  reason text NOT NULL CHECK (app.collaboration_valid_text(reason, 1000)),
  authorization_decision_sha256 text NOT NULL
    CHECK (authorization_decision_sha256 ~ '^[0-9a-f]{64}$'),
  event_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(event_manifest) = 'object'
    AND octet_length(event_manifest::text) <= 65536
  ),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, workspace_id, credential_id, sequence),
  FOREIGN KEY (organization_id, workspace_id, credential_id)
    REFERENCES app.integration_api_credentials(
      organization_id, workspace_id, credential_id
    ) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, credential_id, event_sha256),
  UNIQUE (organization_id, workspace_id, credential_id, action)
);

CREATE TABLE app.integration_webhook_endpoint_lifecycle_events (
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  endpoint_id uuid NOT NULL,
  sequence bigint NOT NULL CHECK (sequence BETWEEN 1 AND 1000000000),
  previous_event_sha256 text CHECK (
    previous_event_sha256 IS NULL OR previous_event_sha256 ~ '^[0-9a-f]{64}$'
  ),
  event_sha256 text NOT NULL CHECK (event_sha256 ~ '^[0-9a-f]{64}$'),
  action text NOT NULL CHECK (
    action IN ('disabled','enabled','signing_key_rotated')
  ),
  signing_key_id text NOT NULL CHECK (app.collaboration_valid_key(signing_key_id)),
  actor_id uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL CHECK (isfinite(occurred_at)),
  reason text NOT NULL CHECK (app.collaboration_valid_text(reason, 1000)),
  authorization_decision_sha256 text NOT NULL
    CHECK (authorization_decision_sha256 ~ '^[0-9a-f]{64}$'),
  event_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(event_manifest) = 'object'
    AND octet_length(event_manifest::text) <= 65536
  ),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, workspace_id, endpoint_id, sequence),
  FOREIGN KEY (organization_id, workspace_id, endpoint_id)
    REFERENCES app.integration_webhook_endpoints(
      organization_id, workspace_id, endpoint_id
    ) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, endpoint_id, event_sha256)
);

CREATE TABLE app.developer_portal_entry_lifecycle_events (
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  sequence bigint NOT NULL CHECK (sequence BETWEEN 1 AND 1000000000),
  previous_event_sha256 text CHECK (
    previous_event_sha256 IS NULL OR previous_event_sha256 ~ '^[0-9a-f]{64}$'
  ),
  event_sha256 text NOT NULL CHECK (event_sha256 ~ '^[0-9a-f]{64}$'),
  action text NOT NULL CHECK (action IN ('suspended','retired')),
  actor_id uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL CHECK (isfinite(occurred_at)),
  reason text NOT NULL CHECK (app.collaboration_valid_text(reason, 1000)),
  authorization_decision_sha256 text NOT NULL
    CHECK (authorization_decision_sha256 ~ '^[0-9a-f]{64}$'),
  event_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(event_manifest) = 'object'
    AND octet_length(event_manifest::text) <= 65536
  ),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, workspace_id, entry_id, sequence),
  FOREIGN KEY (organization_id, workspace_id, entry_id)
    REFERENCES app.developer_portal_entries(
      organization_id, workspace_id, entry_id
    ) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, entry_id, event_sha256),
  UNIQUE (organization_id, workspace_id, entry_id, action)
);

CREATE INDEX integration_api_credential_lifecycle_latest_idx
  ON app.integration_api_credential_lifecycle_events(
    organization_id, workspace_id, credential_id, sequence DESC
  );
CREATE INDEX integration_webhook_endpoint_lifecycle_latest_idx
  ON app.integration_webhook_endpoint_lifecycle_events(
    organization_id, workspace_id, endpoint_id, sequence DESC
  );
CREATE INDEX developer_portal_entry_lifecycle_latest_idx
  ON app.developer_portal_entry_lifecycle_events(
    organization_id, workspace_id, entry_id, sequence DESC
  );

CREATE OR REPLACE FUNCTION app.phase14_webhook_endpoint_state_at_internal(
  requested_organization_id uuid,
  requested_workspace_id uuid,
  requested_endpoint_id uuid,
  requested_at timestamptz
)
RETURNS TABLE (
  active boolean,
  signing_key_id text,
  lifecycle_sequence bigint,
  lifecycle_action text,
  lifecycle_occurred_at timestamptz,
  lifecycle_event_sha256 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT
    CASE latest_activation.action
      WHEN 'disabled' THEN false
      WHEN 'enabled' THEN true
      ELSE endpoint.active
    END,
    coalesce(latest_rotation.signing_key_id, endpoint.signing_key_id),
    latest.sequence,
    latest.action,
    latest.occurred_at,
    latest.event_sha256
  FROM app.integration_webhook_endpoints endpoint
  LEFT JOIN LATERAL (
    SELECT event.sequence, event.action, event.signing_key_id,
      event.occurred_at, event.event_sha256
    FROM app.integration_webhook_endpoint_lifecycle_events event
    WHERE event.organization_id = endpoint.organization_id
      AND event.workspace_id = endpoint.workspace_id
      AND event.endpoint_id = endpoint.endpoint_id
      AND event.occurred_at <= requested_at
    ORDER BY event.sequence DESC
    LIMIT 1
  ) latest ON true
  LEFT JOIN LATERAL (
    SELECT event.action
    FROM app.integration_webhook_endpoint_lifecycle_events event
    WHERE event.organization_id = endpoint.organization_id
      AND event.workspace_id = endpoint.workspace_id
      AND event.endpoint_id = endpoint.endpoint_id
      AND event.occurred_at <= requested_at
      AND event.action IN ('disabled','enabled')
    ORDER BY event.sequence DESC
    LIMIT 1
  ) latest_activation ON true
  LEFT JOIN LATERAL (
    SELECT event.signing_key_id
    FROM app.integration_webhook_endpoint_lifecycle_events event
    WHERE event.organization_id = endpoint.organization_id
      AND event.workspace_id = endpoint.workspace_id
      AND event.endpoint_id = endpoint.endpoint_id
      AND event.occurred_at <= requested_at
      AND event.action = 'signing_key_rotated'
    ORDER BY event.sequence DESC
    LIMIT 1
  ) latest_rotation ON true
  WHERE endpoint.organization_id = requested_organization_id
    AND endpoint.workspace_id = requested_workspace_id
    AND endpoint.endpoint_id = requested_endpoint_id
$$;

CREATE OR REPLACE FUNCTION app.phase14_portal_entry_status_at_internal(
  requested_organization_id uuid,
  requested_workspace_id uuid,
  requested_entry_id uuid,
  requested_at timestamptz
)
RETURNS TABLE (
  status text,
  lifecycle_sequence bigint,
  lifecycle_action text,
  lifecycle_occurred_at timestamptz,
  lifecycle_event_sha256 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT coalesce(latest.action, entry.status), latest.sequence, latest.action,
    latest.occurred_at, latest.event_sha256
  FROM app.developer_portal_entries entry
  LEFT JOIN LATERAL (
    SELECT event.sequence, event.action, event.occurred_at, event.event_sha256
    FROM app.developer_portal_entry_lifecycle_events event
    WHERE event.organization_id = entry.organization_id
      AND event.workspace_id = entry.workspace_id
      AND event.entry_id = entry.entry_id
      AND event.occurred_at <= requested_at
    ORDER BY event.sequence DESC
    LIMIT 1
  ) latest ON true
  WHERE entry.organization_id = requested_organization_id
    AND entry.workspace_id = requested_workspace_id
    AND entry.entry_id = requested_entry_id
$$;

REVOKE ALL ON FUNCTION app.phase14_webhook_endpoint_state_at_internal(
  uuid, uuid, uuid, timestamptz
) FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION app.phase14_portal_entry_status_at_internal(
  uuid, uuid, uuid, timestamptz
) FROM PUBLIC, economyos_app, economyos_ingest;

CREATE OR REPLACE FUNCTION app.validate_phase14_lifecycle_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM app.current_organization_id()
    OR NEW.actor_id IS DISTINCT FROM app.current_subject_id()
    OR NOT app.phase14_role_allowed_at(
      NEW.organization_id, NEW.workspace_id, NEW.actor_id,
      NEW.occurred_at, ARRAY['admin']
    )
  THEN
    RAISE EXCEPTION 'Phase 14 lifecycle actor is not an event-time workspace admin'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION app.validate_phase14_lifecycle_actor()
  FROM PUBLIC, economyos_app, economyos_ingest;

CREATE TRIGGER phase14_lifecycle_actor_guard
BEFORE INSERT ON app.integration_api_credential_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION app.validate_phase14_lifecycle_actor();
CREATE TRIGGER phase14_lifecycle_actor_guard
BEFORE INSERT ON app.integration_webhook_endpoint_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION app.validate_phase14_lifecycle_actor();
CREATE TRIGGER phase14_lifecycle_actor_guard
BEFORE INSERT ON app.developer_portal_entry_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION app.validate_phase14_lifecycle_actor();

CREATE TRIGGER integration_api_credential_lifecycle_reject_update_delete
BEFORE UPDATE OR DELETE ON app.integration_api_credential_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION app.reject_collaboration_mutation();
CREATE TRIGGER integration_webhook_endpoint_lifecycle_reject_update_delete
BEFORE UPDATE OR DELETE ON app.integration_webhook_endpoint_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION app.reject_collaboration_mutation();
CREATE TRIGGER developer_portal_entry_lifecycle_reject_update_delete
BEFORE UPDATE OR DELETE ON app.developer_portal_entry_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION app.reject_collaboration_mutation();

DO $phase14_lifecycle_rls$
DECLARE
  relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'integration_api_credential_lifecycle_events',
    'integration_webhook_endpoint_lifecycle_events',
    'developer_portal_entry_lifecycle_events'
  ] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format(
      'CREATE POLICY %I ON app.%I USING '
      || '(evidence.economic_state_workspace_visible(organization_id, workspace_id)) '
      || 'WITH CHECK '
      || '(evidence.economic_state_workspace_visible(organization_id, workspace_id))',
      relation_name || '_workspace', relation_name
    );
    EXECUTE format('REVOKE ALL ON TABLE app.%I FROM PUBLIC', relation_name);
    EXECUTE format(
      'REVOKE ALL ON TABLE app.%I FROM economyos_app, economyos_ingest', relation_name
    );
  END LOOP;
END
$phase14_lifecycle_rls$;

CREATE OR REPLACE FUNCTION app.revoke_integration_api_credential(
  requested_workspace_id uuid,
  requested_manifest jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  requested_credential_id uuid;
  requested_sequence bigint;
  requested_occurred_at timestamptz;
  requested_event_sha256 text;
  credential app.integration_api_credentials%ROWTYPE;
  existing app.integration_api_credential_lifecycle_events%ROWTYPE;
  head app.integration_api_credential_lifecycle_events%ROWTYPE;
BEGIN
  PERFORM app.collaboration_assert_manifest(requested_manifest, 'eventSha256', 65536);
  IF NOT app.collaboration_exact_keys(requested_manifest, ARRAY[
      'schemaVersion','sequence','previousEventSha256','eventSha256','credentialId',
      'organizationId','workspaceId','action','actorId','occurredAt','reason',
      'authorizationDecisionSha256'
    ])
    OR requested_manifest->>'organizationId' IS DISTINCT FROM caller_organization_id::text
    OR requested_manifest->>'workspaceId' IS DISTINCT FROM requested_workspace_id::text
    OR requested_manifest->>'actorId' IS DISTINCT FROM caller_subject_id::text
    OR requested_manifest->>'action' IS DISTINCT FROM 'revoked'
    OR NOT app.collaboration_valid_integer_json(
      requested_manifest->'sequence', 1, 1000000000
    )
    OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'occurredAt')
    OR NOT app.collaboration_valid_text(requested_manifest->>'reason', 1000)
    OR requested_manifest->>'authorizationDecisionSha256' !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'API credential revocation manifest is invalid'
      USING ERRCODE = '23514';
  END IF;
  requested_credential_id := (requested_manifest->>'credentialId')::uuid;
  requested_sequence := (requested_manifest->>'sequence')::bigint;
  requested_occurred_at := (requested_manifest->>'occurredAt')::timestamptz;
  requested_event_sha256 := requested_manifest->>'eventSha256';
  PERFORM app.collaboration_require_roles(requested_workspace_id, ARRAY['admin']);
  PERFORM app.collaboration_require_roles(
    requested_workspace_id, ARRAY['admin'], requested_occurred_at
  );
  IF requested_occurred_at > statement_timestamp() THEN
    RAISE EXCEPTION 'API credential revocation cannot be future-dated'
      USING ERRCODE = '23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    caller_organization_id::text || ':' || requested_workspace_id::text || ':'
      || requested_credential_id::text,
    37001
  ));
  SELECT * INTO credential FROM app.integration_api_credentials candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.credential_id = requested_credential_id;
  IF credential.credential_id IS NULL
    OR credential.revoked_at IS NOT NULL
    OR requested_occurred_at < credential.issued_at
  THEN
    RAISE EXCEPTION 'API credential is missing, already revoked, or revocation predates issuance'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO existing
  FROM app.integration_api_credential_lifecycle_events candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.credential_id = requested_credential_id
    AND (candidate.sequence = requested_sequence
      OR candidate.event_sha256 = requested_event_sha256)
  ORDER BY (candidate.sequence = requested_sequence) DESC
  LIMIT 1;
  IF existing.sequence IS NOT NULL THEN
    IF existing.sequence IS DISTINCT FROM requested_sequence
      OR existing.event_manifest IS DISTINCT FROM requested_manifest
    THEN
      RAISE EXCEPTION 'API credential revocation replay conflicts with immutable history'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.event_sha256;
  END IF;
  SELECT * INTO head
  FROM app.integration_api_credential_lifecycle_events candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.credential_id = requested_credential_id
  ORDER BY candidate.sequence DESC LIMIT 1;
  IF head.sequence IS NOT NULL
    OR requested_sequence <> coalesce(head.sequence, 0) + 1
    OR requested_manifest->>'previousEventSha256' IS DISTINCT FROM head.event_sha256
    OR (head.sequence IS NOT NULL AND requested_occurred_at <= head.occurred_at)
  THEN
    RAISE EXCEPTION 'API credential revocation breaks sequence or chronology'
      USING ERRCODE = '23514';
  END IF;
  INSERT INTO app.integration_api_credential_lifecycle_events (
    organization_id, workspace_id, credential_id, sequence,
    previous_event_sha256, event_sha256, action, actor_id, occurred_at,
    reason, authorization_decision_sha256, event_manifest
  ) VALUES (
    caller_organization_id, requested_workspace_id, requested_credential_id,
    requested_sequence, requested_manifest->>'previousEventSha256',
    requested_event_sha256, 'revoked', caller_subject_id, requested_occurred_at,
    requested_manifest->>'reason',
    requested_manifest->>'authorizationDecisionSha256', requested_manifest
  );
  RETURN requested_event_sha256;
END
$$;

CREATE OR REPLACE FUNCTION app.append_integration_webhook_endpoint_lifecycle_event(
  requested_workspace_id uuid,
  requested_manifest jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  requested_endpoint_id uuid;
  requested_sequence bigint;
  requested_action text;
  requested_signing_key_id text;
  requested_occurred_at timestamptz;
  requested_event_sha256 text;
  endpoint app.integration_webhook_endpoints%ROWTYPE;
  existing app.integration_webhook_endpoint_lifecycle_events%ROWTYPE;
  head app.integration_webhook_endpoint_lifecycle_events%ROWTYPE;
  current_active boolean;
  current_signing_key_id text;
BEGIN
  PERFORM app.collaboration_assert_manifest(requested_manifest, 'eventSha256', 65536);
  IF NOT app.collaboration_exact_keys(requested_manifest, ARRAY[
      'schemaVersion','sequence','previousEventSha256','eventSha256','endpointId',
      'organizationId','workspaceId','action','signingKeyId','actorId','occurredAt',
      'reason','authorizationDecisionSha256'
    ])
    OR requested_manifest->>'organizationId' IS DISTINCT FROM caller_organization_id::text
    OR requested_manifest->>'workspaceId' IS DISTINCT FROM requested_workspace_id::text
    OR requested_manifest->>'actorId' IS DISTINCT FROM caller_subject_id::text
    OR requested_manifest->>'action' NOT IN ('disabled','enabled','signing_key_rotated')
    OR NOT app.collaboration_valid_key(requested_manifest->>'signingKeyId')
    OR NOT app.collaboration_valid_integer_json(
      requested_manifest->'sequence', 1, 1000000000
    )
    OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'occurredAt')
    OR NOT app.collaboration_valid_text(requested_manifest->>'reason', 1000)
    OR requested_manifest->>'authorizationDecisionSha256' !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'webhook endpoint lifecycle manifest is invalid'
      USING ERRCODE = '23514';
  END IF;
  requested_endpoint_id := (requested_manifest->>'endpointId')::uuid;
  requested_sequence := (requested_manifest->>'sequence')::bigint;
  requested_action := requested_manifest->>'action';
  requested_signing_key_id := requested_manifest->>'signingKeyId';
  requested_occurred_at := (requested_manifest->>'occurredAt')::timestamptz;
  requested_event_sha256 := requested_manifest->>'eventSha256';
  PERFORM app.collaboration_require_roles(requested_workspace_id, ARRAY['admin']);
  PERFORM app.collaboration_require_roles(
    requested_workspace_id, ARRAY['admin'], requested_occurred_at
  );
  IF requested_occurred_at > statement_timestamp() THEN
    RAISE EXCEPTION 'webhook endpoint lifecycle event cannot be future-dated'
      USING ERRCODE = '23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    caller_organization_id::text || ':' || requested_workspace_id::text || ':'
      || requested_endpoint_id::text,
    35006
  ));
  SELECT * INTO endpoint FROM app.integration_webhook_endpoints candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.endpoint_id = requested_endpoint_id;
  IF endpoint.endpoint_id IS NULL THEN
    RAISE EXCEPTION 'webhook endpoint is foreign or missing' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO existing
  FROM app.integration_webhook_endpoint_lifecycle_events candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.endpoint_id = requested_endpoint_id
    AND (candidate.sequence = requested_sequence
      OR candidate.event_sha256 = requested_event_sha256)
  ORDER BY (candidate.sequence = requested_sequence) DESC
  LIMIT 1;
  IF existing.sequence IS NOT NULL THEN
    IF existing.sequence IS DISTINCT FROM requested_sequence
      OR existing.event_manifest IS DISTINCT FROM requested_manifest
    THEN
      RAISE EXCEPTION 'webhook lifecycle replay conflicts with immutable history'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.event_sha256;
  END IF;
  SELECT * INTO head
  FROM app.integration_webhook_endpoint_lifecycle_events candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.endpoint_id = requested_endpoint_id
  ORDER BY candidate.sequence DESC LIMIT 1;
  IF requested_sequence <> coalesce(head.sequence, 0) + 1
    OR requested_manifest->>'previousEventSha256' IS DISTINCT FROM head.event_sha256
    OR (head.sequence IS NOT NULL AND requested_occurred_at <= head.occurred_at)
    OR EXISTS (
      SELECT 1 FROM app.integration_webhook_delivery_events delivery
      WHERE delivery.organization_id = caller_organization_id
        AND delivery.workspace_id = requested_workspace_id
        AND delivery.endpoint_id = requested_endpoint_id
        AND delivery.occurred_at >= requested_occurred_at
    )
  THEN
    RAISE EXCEPTION 'webhook lifecycle event breaks sequence or chronology'
      USING ERRCODE = '23514';
  END IF;
  SELECT state.active, state.signing_key_id
  INTO current_active, current_signing_key_id
  FROM app.phase14_webhook_endpoint_state_at_internal(
    caller_organization_id, requested_workspace_id, requested_endpoint_id,
    requested_occurred_at
  ) state;
  IF (requested_action = 'disabled'
      AND (NOT current_active OR requested_signing_key_id <> current_signing_key_id))
    OR (requested_action = 'enabled'
      AND (current_active OR requested_signing_key_id <> current_signing_key_id))
    OR (requested_action = 'signing_key_rotated'
      AND (
        requested_signing_key_id = current_signing_key_id
        OR requested_signing_key_id = endpoint.signing_key_id
        OR EXISTS (
          SELECT 1 FROM app.integration_webhook_endpoint_lifecycle_events prior
          WHERE prior.organization_id = caller_organization_id
            AND prior.workspace_id = requested_workspace_id
            AND prior.endpoint_id = requested_endpoint_id
            AND prior.action = 'signing_key_rotated'
            AND prior.signing_key_id = requested_signing_key_id
        )
      ))
  THEN
    RAISE EXCEPTION 'webhook lifecycle transition is invalid or reuses a signing key'
      USING ERRCODE = '23514';
  END IF;
  INSERT INTO app.integration_webhook_endpoint_lifecycle_events (
    organization_id, workspace_id, endpoint_id, sequence,
    previous_event_sha256, event_sha256, action, signing_key_id, actor_id,
    occurred_at, reason, authorization_decision_sha256, event_manifest
  ) VALUES (
    caller_organization_id, requested_workspace_id, requested_endpoint_id,
    requested_sequence, requested_manifest->>'previousEventSha256',
    requested_event_sha256, requested_action, requested_signing_key_id,
    caller_subject_id, requested_occurred_at, requested_manifest->>'reason',
    requested_manifest->>'authorizationDecisionSha256', requested_manifest
  );
  RETURN requested_event_sha256;
END
$$;

CREATE OR REPLACE FUNCTION app.append_developer_portal_entry_lifecycle_event(
  requested_workspace_id uuid,
  requested_manifest jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  requested_entry_id uuid;
  requested_sequence bigint;
  requested_action text;
  requested_occurred_at timestamptz;
  requested_event_sha256 text;
  entry app.developer_portal_entries%ROWTYPE;
  existing app.developer_portal_entry_lifecycle_events%ROWTYPE;
  head app.developer_portal_entry_lifecycle_events%ROWTYPE;
  current_status text;
BEGIN
  PERFORM app.collaboration_assert_manifest(requested_manifest, 'eventSha256', 65536);
  IF NOT app.collaboration_exact_keys(requested_manifest, ARRAY[
      'schemaVersion','sequence','previousEventSha256','eventSha256','entryId',
      'organizationId','workspaceId','action','actorId','occurredAt','reason',
      'authorizationDecisionSha256'
    ])
    OR requested_manifest->>'organizationId' IS DISTINCT FROM caller_organization_id::text
    OR requested_manifest->>'workspaceId' IS DISTINCT FROM requested_workspace_id::text
    OR requested_manifest->>'actorId' IS DISTINCT FROM caller_subject_id::text
    OR requested_manifest->>'action' NOT IN ('suspended','retired')
    OR NOT app.collaboration_valid_integer_json(
      requested_manifest->'sequence', 1, 1000000000
    )
    OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'occurredAt')
    OR NOT app.collaboration_valid_text(requested_manifest->>'reason', 1000)
    OR requested_manifest->>'authorizationDecisionSha256' !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'developer portal lifecycle manifest is invalid'
      USING ERRCODE = '23514';
  END IF;
  requested_entry_id := (requested_manifest->>'entryId')::uuid;
  requested_sequence := (requested_manifest->>'sequence')::bigint;
  requested_action := requested_manifest->>'action';
  requested_occurred_at := (requested_manifest->>'occurredAt')::timestamptz;
  requested_event_sha256 := requested_manifest->>'eventSha256';
  PERFORM app.collaboration_require_roles(requested_workspace_id, ARRAY['admin']);
  PERFORM app.collaboration_require_roles(
    requested_workspace_id, ARRAY['admin'], requested_occurred_at
  );
  IF requested_occurred_at > statement_timestamp() THEN
    RAISE EXCEPTION 'developer portal lifecycle event cannot be future-dated'
      USING ERRCODE = '23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    caller_organization_id::text || ':' || requested_workspace_id::text || ':'
      || requested_entry_id::text,
    37003
  ));
  SELECT * INTO entry FROM app.developer_portal_entries candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.entry_id = requested_entry_id;
  IF entry.entry_id IS NULL OR requested_occurred_at < entry.issued_at THEN
    RAISE EXCEPTION 'developer portal entry is missing or transition predates issuance'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO existing
  FROM app.developer_portal_entry_lifecycle_events candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.entry_id = requested_entry_id
    AND (candidate.sequence = requested_sequence
      OR candidate.event_sha256 = requested_event_sha256)
  ORDER BY (candidate.sequence = requested_sequence) DESC
  LIMIT 1;
  IF existing.sequence IS NOT NULL THEN
    IF existing.sequence IS DISTINCT FROM requested_sequence
      OR existing.event_manifest IS DISTINCT FROM requested_manifest
    THEN
      RAISE EXCEPTION 'developer portal lifecycle replay conflicts with immutable history'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.event_sha256;
  END IF;
  SELECT * INTO head
  FROM app.developer_portal_entry_lifecycle_events candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.entry_id = requested_entry_id
  ORDER BY candidate.sequence DESC LIMIT 1;
  IF requested_sequence <> coalesce(head.sequence, 0) + 1
    OR requested_manifest->>'previousEventSha256' IS DISTINCT FROM head.event_sha256
    OR (head.sequence IS NOT NULL AND requested_occurred_at <= head.occurred_at)
  THEN
    RAISE EXCEPTION 'developer portal lifecycle event breaks sequence or chronology'
      USING ERRCODE = '23514';
  END IF;
  SELECT state.status INTO current_status
  FROM app.phase14_portal_entry_status_at_internal(
    caller_organization_id, requested_workspace_id, requested_entry_id,
    requested_occurred_at
  ) state;
  IF (requested_action = 'suspended' AND current_status NOT IN ('draft','published'))
    OR (requested_action = 'retired'
      AND current_status NOT IN ('draft','published','suspended'))
  THEN
    RAISE EXCEPTION 'developer portal lifecycle transition is invalid'
      USING ERRCODE = '23514';
  END IF;
  INSERT INTO app.developer_portal_entry_lifecycle_events (
    organization_id, workspace_id, entry_id, sequence, previous_event_sha256,
    event_sha256, action, actor_id, occurred_at, reason,
    authorization_decision_sha256, event_manifest
  ) VALUES (
    caller_organization_id, requested_workspace_id, requested_entry_id,
    requested_sequence, requested_manifest->>'previousEventSha256',
    requested_event_sha256, requested_action, caller_subject_id,
    requested_occurred_at, requested_manifest->>'reason',
    requested_manifest->>'authorizationDecisionSha256', requested_manifest
  );
  RETURN requested_event_sha256;
END
$$;

CREATE OR REPLACE FUNCTION app.get_integration_api_credential_state(
  requested_workspace_id uuid,
  requested_credential_id uuid
)
RETURNS TABLE (
  credential_id uuid,
  principal_id uuid,
  scopes text[],
  issued_at timestamptz,
  expires_at timestamptz,
  status text,
  revoked_at timestamptz,
  revoked_by uuid,
  revocation_reason text,
  lifecycle_event_sha256 text,
  manifest_sha256 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
  SELECT credential.credential_id, credential.principal_id, credential.scopes,
    credential.issued_at, credential.expires_at,
    CASE
      WHEN coalesce(lifecycle.occurred_at, credential.revoked_at) IS NOT NULL
        AND coalesce(lifecycle.occurred_at, credential.revoked_at) <= statement_timestamp()
        THEN 'revoked'
      WHEN credential.expires_at <= statement_timestamp() THEN 'expired'
      ELSE 'active'
    END,
    coalesce(lifecycle.occurred_at, credential.revoked_at),
    lifecycle.actor_id, lifecycle.reason, lifecycle.event_sha256,
    credential.manifest_sha256
  FROM app.integration_api_credentials credential
  LEFT JOIN LATERAL (
    SELECT event.actor_id, event.occurred_at, event.reason, event.event_sha256
    FROM app.integration_api_credential_lifecycle_events event
    WHERE event.organization_id = credential.organization_id
      AND event.workspace_id = credential.workspace_id
      AND event.credential_id = credential.credential_id
      AND event.occurred_at <= statement_timestamp()
    ORDER BY event.sequence DESC LIMIT 1
  ) lifecycle ON true
  WHERE credential.organization_id = app.current_organization_id()
    AND credential.workspace_id = requested_workspace_id
    AND credential.credential_id = requested_credential_id
    AND evidence.economic_state_workspace_visible(
      credential.organization_id, credential.workspace_id
    )
$$;

CREATE OR REPLACE FUNCTION app.get_integration_webhook_endpoint_state(
  requested_workspace_id uuid,
  requested_endpoint_id uuid
)
RETURNS TABLE (
  endpoint_id uuid,
  active boolean,
  signing_key_id text,
  lifecycle_sequence bigint,
  lifecycle_action text,
  lifecycle_occurred_at timestamptz,
  lifecycle_event_sha256 text,
  manifest_sha256 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
  SELECT endpoint.endpoint_id, state.active, state.signing_key_id,
    state.lifecycle_sequence, state.lifecycle_action,
    state.lifecycle_occurred_at, state.lifecycle_event_sha256,
    endpoint.manifest_sha256
  FROM app.integration_webhook_endpoints endpoint
  JOIN LATERAL app.phase14_webhook_endpoint_state_at_internal(
    endpoint.organization_id, endpoint.workspace_id, endpoint.endpoint_id,
    statement_timestamp()
  ) state ON true
  WHERE endpoint.organization_id = app.current_organization_id()
    AND endpoint.workspace_id = requested_workspace_id
    AND endpoint.endpoint_id = requested_endpoint_id
    AND evidence.economic_state_workspace_visible(
      endpoint.organization_id, endpoint.workspace_id
    )
$$;

CREATE OR REPLACE FUNCTION app.get_developer_portal_entry_state(
  requested_workspace_id uuid,
  requested_entry_id uuid
)
RETURNS TABLE (
  entry_id uuid,
  integration_id uuid,
  status text,
  lifecycle_sequence bigint,
  lifecycle_action text,
  lifecycle_occurred_at timestamptz,
  lifecycle_event_sha256 text,
  manifest_sha256 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
  SELECT entry.entry_id, entry.integration_id, state.status,
    state.lifecycle_sequence, state.lifecycle_action,
    state.lifecycle_occurred_at, state.lifecycle_event_sha256,
    entry.manifest_sha256
  FROM app.developer_portal_entries entry
  JOIN LATERAL app.phase14_portal_entry_status_at_internal(
    entry.organization_id, entry.workspace_id, entry.entry_id,
    statement_timestamp()
  ) state ON true
  WHERE entry.organization_id = app.current_organization_id()
    AND entry.workspace_id = requested_workspace_id
    AND entry.entry_id = requested_entry_id
    AND evidence.economic_state_workspace_visible(
      entry.organization_id, entry.workspace_id
    )
$$;

-- Preserve the established metadata API while deriving revocation from the
-- append-only ledger instead of the immutable registration row alone.
CREATE OR REPLACE FUNCTION app.get_integration_api_credential_metadata(
  requested_workspace_id uuid,
  requested_credential_id uuid
)
RETURNS TABLE (
  credential_id uuid,
  principal_id uuid,
  scopes text[],
  issued_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  manifest_sha256 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
  SELECT credential.credential_id, credential.principal_id, credential.scopes,
    credential.issued_at, credential.expires_at,
    coalesce(lifecycle.occurred_at, credential.revoked_at),
    credential.manifest_sha256
  FROM app.integration_api_credentials credential
  LEFT JOIN LATERAL (
    SELECT event.occurred_at
    FROM app.integration_api_credential_lifecycle_events event
    WHERE event.organization_id = credential.organization_id
      AND event.workspace_id = credential.workspace_id
      AND event.credential_id = credential.credential_id
      AND event.occurred_at <= statement_timestamp()
    ORDER BY event.sequence DESC LIMIT 1
  ) lifecycle ON true
  WHERE credential.organization_id = app.current_organization_id()
    AND credential.workspace_id = requested_workspace_id
    AND credential.credential_id = requested_credential_id
    AND evidence.economic_state_workspace_visible(
      credential.organization_id, credential.workspace_id
    )
$$;

-- Preserve the existing exact-read boundary while returning effective status.
-- Suspended or retired extension entries remain inspectable audit evidence;
-- only an effectively published entry must still have live certification.
CREATE OR REPLACE FUNCTION app.get_developer_portal_entry(
  requested_workspace_id uuid,
  requested_entry_id uuid
)
RETURNS TABLE (
  entry_id uuid,
  integration_id uuid,
  status text,
  entry_manifest jsonb,
  manifest_sha256 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
  WITH candidate AS (
    SELECT entry.*,
      coalesce((
        SELECT event.action
        FROM app.developer_portal_entry_lifecycle_events event
        WHERE event.organization_id = entry.organization_id
          AND event.workspace_id = entry.workspace_id
          AND event.entry_id = entry.entry_id
          AND event.occurred_at <= statement_timestamp()
        ORDER BY event.sequence DESC LIMIT 1
      ), entry.status) AS effective_status
    FROM app.developer_portal_entries entry
    WHERE entry.organization_id = app.current_organization_id()
      AND entry.workspace_id = requested_workspace_id
      AND entry.entry_id = requested_entry_id
      AND evidence.economic_state_workspace_visible(
        entry.organization_id, entry.workspace_id
      )
  )
  SELECT entry.entry_id, entry.integration_id, entry.effective_status,
    entry.entry_manifest, entry.manifest_sha256
  FROM candidate entry
  WHERE entry.asset_kind NOT IN ('connector','model_extension')
    OR entry.effective_status <> 'published'
    OR EXISTS (
      SELECT 1
      FROM app.integration_extension_certifications certification
      JOIN app.integration_extension_manifests extension
        ON extension.organization_id = certification.organization_id
        AND extension.workspace_id = certification.workspace_id
        AND extension.extension_id = certification.extension_id
        AND extension.extension_version = certification.extension_version
      WHERE certification.organization_id = entry.organization_id
        AND certification.workspace_id = entry.workspace_id
        AND certification.manifest_sha256 = entry.extension_certification_sha256
        AND certification.extension_manifest_sha256 = extension.manifest_sha256
        AND certification.issued_at <= statement_timestamp()
        AND certification.valid_until > statement_timestamp()
        AND entry.integration_id = extension.extension_id
        AND entry.artifact_sha256 = extension.artifact_sha256
        AND entry.compatibility_contract_sha256
          = certification.compatibility_contract_sha256
        AND entry.entry_manifest->'capabilities'
          = extension.extension_manifest->'capabilities'
        AND entry.asset_kind = (CASE extension.kind
          WHEN 'connector' THEN 'connector' ELSE 'model_extension' END)
        AND NOT EXISTS (
          SELECT 1 FROM app.integration_extension_revocations revocation
          WHERE revocation.organization_id = extension.organization_id
            AND revocation.workspace_id = extension.workspace_id
            AND revocation.extension_id = extension.extension_id
            AND revocation.extension_version = extension.extension_version
            AND revocation.revoked_at <= statement_timestamp()
        )
    )
$$;

-- Route delivery admission through effective lifecycle state. This replaces
-- only the command body; its public signature and immutable delivery ledger
-- remain unchanged.
CREATE OR REPLACE FUNCTION app.append_integration_webhook_delivery_event(
  requested_workspace_id uuid,
  requested_manifest jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  requested_endpoint_id uuid;
  requested_sequence bigint;
  requested_delivery_id uuid;
  requested_status text;
  requested_attempt integer;
  requested_occurred_at timestamptz;
  endpoint app.integration_webhook_endpoints%ROWTYPE;
  endpoint_active boolean;
  head app.integration_webhook_delivery_events%ROWTYPE;
  prior app.integration_webhook_delivery_events%ROWTYPE;
  existing app.integration_webhook_delivery_events%ROWTYPE;
  expected_retry_at timestamptz;
BEGIN
  PERFORM app.collaboration_require_roles(requested_workspace_id, ARRAY['admin']);
  PERFORM app.collaboration_assert_manifest(requested_manifest, 'eventSha256', 131072);
  IF NOT app.collaboration_exact_keys(requested_manifest, ARRAY[
      'schemaVersion','sequence','previousEventSha256','eventSha256','deliveryId','endpointId',
      'organizationId','envelopeSha256','status','attempt','occurredAt','retryAt','outcomeCode'
    ])
    OR requested_manifest->>'organizationId' IS DISTINCT FROM caller_organization_id::text
    OR requested_manifest->>'envelopeSha256' !~ '^[0-9a-f]{64}$'
    OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'occurredAt')
    OR NOT app.collaboration_valid_integer_json(
      requested_manifest->'sequence', 1, 1000000000
    )
    OR NOT app.collaboration_valid_integer_json(requested_manifest->'attempt', 0, 20)
  THEN RAISE EXCEPTION 'webhook delivery event scope or shape is invalid'
    USING ERRCODE = '23514'; END IF;
  requested_endpoint_id := (requested_manifest->>'endpointId')::uuid;
  requested_sequence := (requested_manifest->>'sequence')::bigint;
  requested_delivery_id := (requested_manifest->>'deliveryId')::uuid;
  requested_status := requested_manifest->>'status';
  requested_attempt := (requested_manifest->>'attempt')::integer;
  requested_occurred_at := (requested_manifest->>'occurredAt')::timestamptz;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    caller_organization_id::text || ':' || requested_workspace_id::text || ':'
      || requested_endpoint_id::text,
    35006
  ));
  SELECT * INTO endpoint FROM app.integration_webhook_endpoints candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.endpoint_id = requested_endpoint_id;
  SELECT state.active INTO endpoint_active
  FROM app.phase14_webhook_endpoint_state_at_internal(
    caller_organization_id, requested_workspace_id, requested_endpoint_id,
    requested_occurred_at
  ) state;
  IF endpoint.endpoint_id IS NULL OR NOT coalesce(endpoint_active, false) THEN
    RAISE EXCEPTION 'webhook endpoint is foreign, missing, or inactive'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO existing FROM app.integration_webhook_delivery_events candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.endpoint_id = requested_endpoint_id
    AND candidate.sequence = requested_sequence;
  IF existing.sequence IS NOT NULL THEN
    IF existing.event_manifest IS DISTINCT FROM requested_manifest THEN
      RAISE EXCEPTION 'webhook delivery replay changed ledger sequence'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.event_sha256;
  END IF;
  SELECT * INTO head FROM app.integration_webhook_delivery_events candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.endpoint_id = requested_endpoint_id
  ORDER BY candidate.sequence DESC LIMIT 1;
  IF requested_sequence <> coalesce(head.sequence, 0) + 1
    OR requested_manifest->>'previousEventSha256' IS DISTINCT FROM head.event_sha256
    OR (head.sequence IS NOT NULL AND requested_occurred_at < head.occurred_at)
  THEN RAISE EXCEPTION 'webhook delivery breaks ledger sequence or chronology'
    USING ERRCODE = '23514'; END IF;
  SELECT * INTO prior FROM app.integration_webhook_delivery_events candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.endpoint_id = requested_endpoint_id
    AND candidate.delivery_id = requested_delivery_id
  ORDER BY candidate.sequence DESC LIMIT 1;
  IF prior.sequence IS NULL THEN
    IF requested_status <> 'queued' OR requested_attempt <> 0
      OR requested_manifest->'retryAt' <> 'null'::jsonb
      OR requested_manifest->'outcomeCode' <> 'null'::jsonb
    THEN RAISE EXCEPTION 'webhook delivery must begin queued'
      USING ERRCODE = '23514'; END IF;
  ELSIF requested_manifest->>'envelopeSha256' IS DISTINCT FROM prior.envelope_sha256
    OR requested_occurred_at < prior.occurred_at
  THEN RAISE EXCEPTION 'webhook delivery changes envelope or predates prior state'
    USING ERRCODE = '23514';
  ELSIF requested_status = 'delivering' THEN
    IF prior.status NOT IN ('queued','retry_scheduled')
      OR requested_attempt <> prior.attempt + 1
      OR requested_manifest->'retryAt' <> 'null'::jsonb
      OR requested_manifest->'outcomeCode' <> 'null'::jsonb
      OR (prior.retry_at IS NOT NULL AND requested_occurred_at < prior.retry_at)
    THEN RAISE EXCEPTION 'webhook attempt transition is invalid'
      USING ERRCODE = '23514'; END IF;
  ELSIF requested_status = 'retry_scheduled' THEN
    expected_retry_at := requested_occurred_at + make_interval(
      secs => least(
        endpoint.max_retry_seconds::bigint,
        endpoint.base_retry_seconds::bigint * (1::bigint << (requested_attempt - 1))
      )::double precision
    );
    IF prior.status <> 'delivering' OR requested_attempt <> prior.attempt
      OR requested_attempt >= endpoint.max_attempts
      OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'retryAt')
      OR NOT app.collaboration_valid_key(requested_manifest->>'outcomeCode')
      OR (requested_manifest->>'retryAt')::timestamptz IS DISTINCT FROM expected_retry_at
    THEN RAISE EXCEPTION 'webhook retry transition is invalid'
      USING ERRCODE = '23514'; END IF;
  ELSIF requested_status IN ('delivered','dead_lettered') THEN
    IF prior.status <> 'delivering' OR requested_attempt <> prior.attempt
      OR requested_manifest->'retryAt' <> 'null'::jsonb
      OR NOT app.collaboration_valid_key(requested_manifest->>'outcomeCode')
    THEN RAISE EXCEPTION 'webhook terminal transition is invalid'
      USING ERRCODE = '23514'; END IF;
  ELSE
    RAISE EXCEPTION 'webhook delivery repeats queued or uses an unknown status'
      USING ERRCODE = '23514';
  END IF;
  INSERT INTO app.integration_webhook_delivery_events (
    organization_id, workspace_id, endpoint_id, sequence, previous_event_sha256,
    event_sha256, delivery_id, envelope_sha256, status, attempt, occurred_at,
    retry_at, outcome_code, event_manifest
  ) VALUES (
    caller_organization_id, requested_workspace_id, requested_endpoint_id,
    requested_sequence, requested_manifest->>'previousEventSha256',
    requested_manifest->>'eventSha256', requested_delivery_id,
    requested_manifest->>'envelopeSha256', requested_status, requested_attempt,
    requested_occurred_at, (requested_manifest->>'retryAt')::timestamptz,
    requested_manifest->>'outcomeCode', requested_manifest
  );
  RETURN requested_manifest->>'eventSha256';
END
$$;

REVOKE ALL ON FUNCTION app.revoke_integration_api_credential(uuid,jsonb)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.append_integration_webhook_endpoint_lifecycle_event(uuid,jsonb)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.append_developer_portal_entry_lifecycle_event(uuid,jsonb)
  FROM PUBLIC, economyos_ingest;
GRANT EXECUTE ON FUNCTION app.revoke_integration_api_credential(uuid,jsonb)
  TO economyos_app;
GRANT EXECUTE ON FUNCTION app.append_integration_webhook_endpoint_lifecycle_event(uuid,jsonb)
  TO economyos_app;
GRANT EXECUTE ON FUNCTION app.append_developer_portal_entry_lifecycle_event(uuid,jsonb)
  TO economyos_app;

REVOKE ALL ON FUNCTION app.get_integration_api_credential_state(uuid,uuid)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.get_integration_webhook_endpoint_state(uuid,uuid)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.get_developer_portal_entry_state(uuid,uuid)
  FROM PUBLIC, economyos_ingest;
GRANT EXECUTE ON FUNCTION app.get_integration_api_credential_state(uuid,uuid)
  TO economyos_app;
GRANT EXECUTE ON FUNCTION app.get_integration_webhook_endpoint_state(uuid,uuid)
  TO economyos_app;
GRANT EXECUTE ON FUNCTION app.get_developer_portal_entry_state(uuid,uuid)
  TO economyos_app;

REVOKE ALL ON FUNCTION app.append_integration_webhook_delivery_event(uuid,jsonb)
  FROM PUBLIC, economyos_ingest;
GRANT EXECUTE ON FUNCTION app.append_integration_webhook_delivery_event(uuid,jsonb)
  TO economyos_app;
REVOKE ALL ON FUNCTION app.get_integration_api_credential_metadata(uuid,uuid)
  FROM PUBLIC, economyos_ingest;
GRANT EXECUTE ON FUNCTION app.get_integration_api_credential_metadata(uuid,uuid)
  TO economyos_app;
REVOKE ALL ON FUNCTION app.get_developer_portal_entry(uuid,uuid)
  FROM PUBLIC, economyos_ingest;
GRANT EXECUTE ON FUNCTION app.get_developer_portal_entry(uuid,uuid)
  TO economyos_app;

COMMENT ON TABLE app.integration_api_credential_lifecycle_events IS
  'Append-only tenant credential revocation ledger; registration rows remain immutable.';
COMMENT ON TABLE app.integration_webhook_endpoint_lifecycle_events IS
  'Append-only webhook enable, disable, and one-way signing-key rotation ledger.';
COMMENT ON TABLE app.developer_portal_entry_lifecycle_events IS
  'Append-only developer portal suspension and terminal retirement ledger.';
COMMENT ON FUNCTION app.get_integration_api_credential_state(uuid,uuid) IS
  'Non-enumerating exact read of effective credential status and revocation evidence.';
COMMENT ON FUNCTION app.get_integration_webhook_endpoint_state(uuid,uuid) IS
  'Non-enumerating exact read of effective webhook activity and signing-key identifier.';
COMMENT ON FUNCTION app.get_developer_portal_entry_state(uuid,uuid) IS
  'Non-enumerating exact read of effective developer portal lifecycle status.';
