-- Verify Phase 14 lifecycle persistence with two tenants and the restricted
-- application role. Every fixture and assertion is rolled back.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.p14_digest(
  body jsonb,
  digest_key text DEFAULT 'eventSha256'
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT body || jsonb_build_object(digest_key, app.collaboration_json_digest(body))
$$;

CREATE OR REPLACE FUNCTION pg_temp.p14_credential(
  organization_id uuid, workspace_id uuid, principal_id uuid, secret_digit text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_temp.p14_digest(jsonb_build_object(
    'schemaVersion', 1,
    'credentialId', '14700000-0000-4000-8000-000000000401',
    'principalId', principal_id,
    'organizationId', organization_id,
    'workspaceId', workspace_id,
    'scopes', jsonb_build_array('api_credential.use','data.read'),
    'secretSha256', repeat(secret_digit, 64),
    'issuedAt', '2026-08-01T00:00:00Z',
    'expiresAt', '2027-08-01T00:00:00Z',
    'revokedAt', NULL
  ), 'manifestSha256')
$$;

CREATE OR REPLACE FUNCTION pg_temp.p14_webhook(
  organization_id uuid, signing_key_id text, initially_active boolean, tenant_label text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_temp.p14_digest(jsonb_build_object(
    'schemaVersion', 1,
    'endpointId', '14700000-0000-4000-8000-000000000501',
    'organizationId', organization_id,
    'url', 'https://hooks-' || tenant_label || '.economyos.test/integration',
    'eventTypes', jsonb_build_array('forecast.published'),
    'signingKeyId', signing_key_id,
    'maxAttempts', 3,
    'baseRetrySeconds', 10,
    'maxRetrySeconds', 60,
    'active', initially_active
  ), 'manifestSha256')
$$;

CREATE OR REPLACE FUNCTION pg_temp.p14_portal(
  organization_id uuid, workspace_id uuid, owner_id uuid, integration_id uuid,
  artifact_digit text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_temp.p14_digest(jsonb_build_object(
    'schemaVersion', 1,
    'entryId', '14700000-0000-4000-8000-000000000601',
    'integrationId', integration_id,
    'organizationId', organization_id,
    'workspaceId', workspace_id,
    'ownerPrincipalId', owner_id,
    'assetKind', 'sdk',
    'slug', 'phase14-sdk',
    'displayName', 'Phase 14 SDK',
    'summary', 'Tenant-scoped SDK documentation.',
    'documentationPath', '/developers/integrations/phase14-sdk',
    'artifactSha256', repeat(artifact_digit, 64),
    'capabilities', jsonb_build_array('data.read'),
    'compatibilityContractSha256', repeat('d', 64),
    'extensionCertificationSha256', NULL,
    'status', 'published',
    'issuedAt', '2026-08-01T00:00:00Z',
    'authorizationDecisionSha256', repeat('e', 64)
  ), 'manifestSha256')
$$;

CREATE OR REPLACE FUNCTION pg_temp.p14_credential_event(
  organization_id uuid, workspace_id uuid, actor_id uuid, sequence_number bigint,
  previous_sha text, occurred_at text, reason text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_temp.p14_digest(jsonb_build_object(
    'schemaVersion', 1, 'sequence', sequence_number,
    'previousEventSha256', previous_sha,
    'credentialId', '14700000-0000-4000-8000-000000000401',
    'organizationId', organization_id, 'workspaceId', workspace_id,
    'action', 'revoked', 'actorId', actor_id, 'occurredAt', occurred_at,
    'reason', reason, 'authorizationDecisionSha256', repeat('3', 64)
  ))
$$;

CREATE OR REPLACE FUNCTION pg_temp.p14_webhook_event(
  organization_id uuid, workspace_id uuid, actor_id uuid, sequence_number bigint,
  previous_sha text, action text, signing_key_id text, occurred_at text, reason text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_temp.p14_digest(jsonb_build_object(
    'schemaVersion', 1, 'sequence', sequence_number,
    'previousEventSha256', previous_sha,
    'endpointId', '14700000-0000-4000-8000-000000000501',
    'organizationId', organization_id, 'workspaceId', workspace_id,
    'action', action, 'signingKeyId', signing_key_id, 'actorId', actor_id,
    'occurredAt', occurred_at, 'reason', reason,
    'authorizationDecisionSha256', repeat('4', 64)
  ))
$$;

CREATE OR REPLACE FUNCTION pg_temp.p14_portal_event(
  organization_id uuid, workspace_id uuid, actor_id uuid, sequence_number bigint,
  previous_sha text, action text, occurred_at text, reason text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_temp.p14_digest(jsonb_build_object(
    'schemaVersion', 1, 'sequence', sequence_number,
    'previousEventSha256', previous_sha,
    'entryId', '14700000-0000-4000-8000-000000000601',
    'organizationId', organization_id, 'workspaceId', workspace_id,
    'action', action, 'actorId', actor_id, 'occurredAt', occurred_at,
    'reason', reason, 'authorizationDecisionSha256', repeat('5', 64)
  ))
$$;

CREATE OR REPLACE FUNCTION pg_temp.p14_delivery(
  organization_id uuid, delivery_id uuid, occurred_at text, envelope_digit text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_temp.p14_digest(jsonb_build_object(
    'schemaVersion', 1, 'sequence', 1, 'previousEventSha256', NULL,
    'deliveryId', delivery_id,
    'endpointId', '14700000-0000-4000-8000-000000000501',
    'organizationId', organization_id, 'envelopeSha256', repeat(envelope_digit, 64),
    'status', 'queued', 'attempt', 0, 'occurredAt', occurred_at,
    'retryAt', NULL, 'outcomeCode', NULL
  ))
$$;

CREATE OR REPLACE FUNCTION pg_temp.p14_expect_failure(
  label text, statement text, expected_sqlstate text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE observed_sqlstate text;
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS observed_sqlstate = RETURNED_SQLSTATE;
    IF observed_sqlstate IS DISTINCT FROM expected_sqlstate THEN
      RAISE EXCEPTION '% failed with SQLSTATE %, expected %',
        label, observed_sqlstate, expected_sqlstate;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION '% unexpectedly succeeded', label;
END
$$;

DO $structure$
DECLARE relation_name text; signature text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'integration_api_credential_lifecycle_events',
    'integration_webhook_endpoint_lifecycle_events',
    'developer_portal_entry_lifecycle_events'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'app' AND relation.relname = relation_name
        AND relation.relrowsecurity AND relation.relforcerowsecurity
    ) OR has_table_privilege('economyos_app', 'app.' || relation_name, 'SELECT')
      OR has_table_privilege('economyos_app', 'app.' || relation_name, 'INSERT')
      OR has_table_privilege('economyos_app', 'app.' || relation_name, 'UPDATE')
      OR has_table_privilege('economyos_app', 'app.' || relation_name, 'DELETE')
      OR has_table_privilege('economyos_ingest', 'app.' || relation_name, 'SELECT')
    THEN RAISE EXCEPTION '% lacks forced RLS or least privilege', relation_name;
    END IF;
  END LOOP;
  FOREACH signature IN ARRAY ARRAY[
    'app.revoke_integration_api_credential(uuid,jsonb)',
    'app.append_integration_webhook_endpoint_lifecycle_event(uuid,jsonb)',
    'app.append_developer_portal_entry_lifecycle_event(uuid,jsonb)',
    'app.get_integration_api_credential_state(uuid,uuid)',
    'app.get_integration_webhook_endpoint_state(uuid,uuid)',
    'app.get_developer_portal_entry_state(uuid,uuid)'
  ] LOOP
    IF NOT has_function_privilege('economyos_app', signature, 'EXECUTE')
      OR has_function_privilege('economyos_ingest', signature, 'EXECUTE')
      OR NOT EXISTS (
        SELECT 1 FROM pg_proc procedure
        WHERE procedure.oid = signature::regprocedure AND procedure.prosecdef
          AND procedure.proconfig @> CASE
            WHEN signature LIKE 'app.get_%' THEN ARRAY['search_path=pg_catalog, app, evidence']
            ELSE ARRAY['search_path=pg_catalog, app']
          END
      )
    THEN RAISE EXCEPTION '% has unsafe execution metadata', signature;
    END IF;
  END LOOP;
  FOREACH signature IN ARRAY ARRAY[
    'app.phase14_webhook_endpoint_state_at_internal(uuid,uuid,uuid,timestamptz)',
    'app.phase14_portal_entry_status_at_internal(uuid,uuid,uuid,timestamptz)',
    'app.validate_phase14_lifecycle_actor()'
  ] LOOP
    IF has_function_privilege('economyos_app', signature, 'EXECUTE')
      OR has_function_privilege('economyos_ingest', signature, 'EXECUTE')
      OR NOT (SELECT procedure.prosecdef FROM pg_proc procedure
        WHERE procedure.oid = signature::regprocedure)
    THEN RAISE EXCEPTION '% internal function is exposed', signature;
    END IF;
  END LOOP;
END
$structure$;

INSERT INTO app.organizations (id, slug, name) VALUES
  ('14700000-0000-4000-8000-000000000001', 'p14-lifecycle-a', 'Lifecycle A'),
  ('14700000-0000-4000-8000-000000000002', 'p14-lifecycle-b', 'Lifecycle B');
INSERT INTO app.workspaces (id, organization_id, slug, name) VALUES
  ('14700000-0000-4000-8000-000000000101',
   '14700000-0000-4000-8000-000000000001', 'integrations', 'Integrations A'),
  ('14700000-0000-4000-8000-000000000102',
   '14700000-0000-4000-8000-000000000002', 'integrations', 'Integrations B');
INSERT INTO app.subjects (id, issuer, external_subject, kind) VALUES
  ('14700000-0000-4000-8000-000000000201', 'https://identity.economyos.test/', 'p14-admin-a', 'human'),
  ('14700000-0000-4000-8000-000000000202', 'https://identity.economyos.test/', 'p14-admin-b', 'human'),
  ('14700000-0000-4000-8000-000000000203', 'https://identity.economyos.test/', 'p14-analyst-a', 'human'),
  ('14700000-0000-4000-8000-000000000204', 'https://identity.economyos.test/', 'p14-late-admin-a', 'human');
INSERT INTO app.organization_memberships (organization_id, subject_id, role, valid_from) VALUES
  ('14700000-0000-4000-8000-000000000001', '14700000-0000-4000-8000-000000000201', 'admin', '2026-01-01Z'),
  ('14700000-0000-4000-8000-000000000002', '14700000-0000-4000-8000-000000000202', 'admin', '2026-01-01Z'),
  ('14700000-0000-4000-8000-000000000001', '14700000-0000-4000-8000-000000000203', 'analyst', '2026-01-01Z'),
  ('14700000-0000-4000-8000-000000000001', '14700000-0000-4000-8000-000000000204', 'admin', '2026-08-20Z');
INSERT INTO app.workspace_memberships (
  organization_id, workspace_id, subject_id, role, valid_from
) VALUES
  ('14700000-0000-4000-8000-000000000001', '14700000-0000-4000-8000-000000000101', '14700000-0000-4000-8000-000000000201', 'admin', '2026-01-01Z'),
  ('14700000-0000-4000-8000-000000000002', '14700000-0000-4000-8000-000000000102', '14700000-0000-4000-8000-000000000202', 'admin', '2026-01-01Z'),
  ('14700000-0000-4000-8000-000000000001', '14700000-0000-4000-8000-000000000101', '14700000-0000-4000-8000-000000000203', 'analyst', '2026-01-01Z'),
  ('14700000-0000-4000-8000-000000000001', '14700000-0000-4000-8000-000000000101', '14700000-0000-4000-8000-000000000204', 'admin', '2026-08-20Z');

CREATE TEMP TABLE p14_payloads (
  payload_key text PRIMARY KEY,
  payload jsonb NOT NULL
) ON COMMIT DROP;
GRANT SELECT ON p14_payloads TO economyos_app_local;

INSERT INTO p14_payloads VALUES
  ('credential.a', pg_temp.p14_credential(
    '14700000-0000-4000-8000-000000000001',
    '14700000-0000-4000-8000-000000000101',
    '14700000-0000-4000-8000-000000000201', 'a'
  )),
  ('credential.b', pg_temp.p14_credential(
    '14700000-0000-4000-8000-000000000002',
    '14700000-0000-4000-8000-000000000102',
    '14700000-0000-4000-8000-000000000202', 'b'
  )),
  ('webhook.a', pg_temp.p14_webhook(
    '14700000-0000-4000-8000-000000000001', 'webhook.key.a.v1', true, 'a'
  )),
  ('webhook.b', pg_temp.p14_webhook(
    '14700000-0000-4000-8000-000000000002', 'webhook.key.b.v1', false, 'b'
  )),
  ('portal.a', pg_temp.p14_portal(
    '14700000-0000-4000-8000-000000000001',
    '14700000-0000-4000-8000-000000000101',
    '14700000-0000-4000-8000-000000000201',
    '14700000-0000-4000-8000-000000000611', 'c'
  )),
  ('portal.b', pg_temp.p14_portal(
    '14700000-0000-4000-8000-000000000002',
    '14700000-0000-4000-8000-000000000102',
    '14700000-0000-4000-8000-000000000202',
    '14700000-0000-4000-8000-000000000612', 'f'
  ));

INSERT INTO p14_payloads VALUES
  ('credential.a.revoked', pg_temp.p14_credential_event(
    '14700000-0000-4000-8000-000000000001',
    '14700000-0000-4000-8000-000000000101',
    '14700000-0000-4000-8000-000000000201', 1, NULL,
    '2026-08-10T10:00:00Z', 'Operator-requested revocation.'
  )),
  ('credential.a.conflict', pg_temp.p14_credential_event(
    '14700000-0000-4000-8000-000000000001',
    '14700000-0000-4000-8000-000000000101',
    '14700000-0000-4000-8000-000000000201', 1, NULL,
    '2026-08-10T10:00:00Z', 'Conflicting revocation content.'
  )),
  ('credential.a.analyst', pg_temp.p14_credential_event(
    '14700000-0000-4000-8000-000000000001',
    '14700000-0000-4000-8000-000000000101',
    '14700000-0000-4000-8000-000000000203', 2, repeat('a', 64),
    '2026-08-10T11:00:00Z', 'Analyst must not revoke credentials.'
  )),
  ('credential.a.late-admin', pg_temp.p14_credential_event(
    '14700000-0000-4000-8000-000000000001',
    '14700000-0000-4000-8000-000000000101',
    '14700000-0000-4000-8000-000000000204', 2, repeat('a', 64),
    '2026-08-10T11:00:00Z', 'Actor was not an admin at event time.'
  )),
  ('credential.b.before-issued', pg_temp.p14_credential_event(
    '14700000-0000-4000-8000-000000000002',
    '14700000-0000-4000-8000-000000000102',
    '14700000-0000-4000-8000-000000000202', 1, NULL,
    '2026-07-31T23:59:59Z', 'Revocation predates credential issuance.'
  ));

INSERT INTO p14_payloads VALUES (
  'webhook.a.disabled', pg_temp.p14_webhook_event(
    '14700000-0000-4000-8000-000000000001',
    '14700000-0000-4000-8000-000000000101',
    '14700000-0000-4000-8000-000000000201', 1, NULL, 'disabled',
    'webhook.key.a.v1', '2026-08-10T10:00:00Z', 'Receiver maintenance.'
  )
);
INSERT INTO p14_payloads
SELECT 'webhook.a.enabled', pg_temp.p14_webhook_event(
  '14700000-0000-4000-8000-000000000001',
  '14700000-0000-4000-8000-000000000101',
  '14700000-0000-4000-8000-000000000201', 2,
  prior.payload->>'eventSha256', 'enabled', 'webhook.key.a.v1',
  '2026-08-10T11:00:00Z', 'Receiver maintenance completed.'
)
FROM p14_payloads prior WHERE prior.payload_key = 'webhook.a.disabled';
INSERT INTO p14_payloads
SELECT 'webhook.a.rotated', pg_temp.p14_webhook_event(
  '14700000-0000-4000-8000-000000000001',
  '14700000-0000-4000-8000-000000000101',
  '14700000-0000-4000-8000-000000000201', 3,
  prior.payload->>'eventSha256', 'signing_key_rotated', 'webhook.key.a.v2',
  '2026-08-10T12:00:00Z', 'Scheduled signing-key rotation.'
)
FROM p14_payloads prior WHERE prior.payload_key = 'webhook.a.enabled';
INSERT INTO p14_payloads VALUES
  ('webhook.b.enabled', pg_temp.p14_webhook_event(
    '14700000-0000-4000-8000-000000000002',
    '14700000-0000-4000-8000-000000000102',
    '14700000-0000-4000-8000-000000000202', 1, NULL, 'enabled',
    'webhook.key.b.v1', '2026-08-10T10:00:00Z', 'Initial activation.'
  ));
INSERT INTO p14_payloads
SELECT 'webhook.a.backward', pg_temp.p14_webhook_event(
  '14700000-0000-4000-8000-000000000001',
  '14700000-0000-4000-8000-000000000101',
  '14700000-0000-4000-8000-000000000201', 4,
  prior.payload->>'eventSha256', 'disabled', 'webhook.key.a.v2',
  '2026-08-10T11:45:00Z', 'Backdated transition.'
)
FROM p14_payloads prior WHERE prior.payload_key = 'webhook.a.rotated';
INSERT INTO p14_payloads
SELECT 'webhook.a.reused-key', pg_temp.p14_webhook_event(
  '14700000-0000-4000-8000-000000000001',
  '14700000-0000-4000-8000-000000000101',
  '14700000-0000-4000-8000-000000000201', 4,
  prior.payload->>'eventSha256', 'signing_key_rotated', 'webhook.key.a.v1',
  '2026-08-10T13:00:00Z', 'Signing-key reuse must fail.'
)
FROM p14_payloads prior WHERE prior.payload_key = 'webhook.a.rotated';
INSERT INTO p14_payloads
SELECT 'webhook.a.gap', pg_temp.p14_webhook_event(
  '14700000-0000-4000-8000-000000000001',
  '14700000-0000-4000-8000-000000000101',
  '14700000-0000-4000-8000-000000000201', 5,
  prior.payload->>'eventSha256', 'disabled', 'webhook.key.a.v2',
  '2026-08-10T13:00:00Z', 'Sequence gap must fail.'
)
FROM p14_payloads prior WHERE prior.payload_key = 'webhook.a.rotated';

INSERT INTO p14_payloads VALUES (
  'portal.a.suspended', pg_temp.p14_portal_event(
    '14700000-0000-4000-8000-000000000001',
    '14700000-0000-4000-8000-000000000101',
    '14700000-0000-4000-8000-000000000201', 1, NULL, 'suspended',
    '2026-08-10T10:00:00Z', 'Documentation is under review.'
  )
);
INSERT INTO p14_payloads
SELECT 'portal.a.retired', pg_temp.p14_portal_event(
  '14700000-0000-4000-8000-000000000001',
  '14700000-0000-4000-8000-000000000101',
  '14700000-0000-4000-8000-000000000201', 2,
  prior.payload->>'eventSha256', 'retired', '2026-08-10T11:00:00Z',
  'The SDK reached end of support.'
)
FROM p14_payloads prior WHERE prior.payload_key = 'portal.a.suspended';
INSERT INTO p14_payloads
SELECT 'portal.a.retired.same-time', pg_temp.p14_portal_event(
  '14700000-0000-4000-8000-000000000001',
  '14700000-0000-4000-8000-000000000101',
  '14700000-0000-4000-8000-000000000201', 2,
  prior.payload->>'eventSha256', 'retired', '2026-08-10T10:00:00Z',
  'Equal-time transition must fail.'
)
FROM p14_payloads prior WHERE prior.payload_key = 'portal.a.suspended';
INSERT INTO p14_payloads
SELECT 'portal.a.after-retired', pg_temp.p14_portal_event(
  '14700000-0000-4000-8000-000000000001',
  '14700000-0000-4000-8000-000000000101',
  '14700000-0000-4000-8000-000000000201', 3,
  prior.payload->>'eventSha256', 'suspended', '2026-08-10T12:00:00Z',
  'Retirement is terminal.'
)
FROM p14_payloads prior WHERE prior.payload_key = 'portal.a.retired';

INSERT INTO p14_payloads VALUES
  ('delivery.a.disabled', pg_temp.p14_delivery(
    '14700000-0000-4000-8000-000000000001',
    '14700000-0000-4000-8000-000000000701',
    '2026-08-10T10:30:00Z', 'a'
  )),
  ('delivery.a.enabled', pg_temp.p14_delivery(
    '14700000-0000-4000-8000-000000000001',
    '14700000-0000-4000-8000-000000000702',
    '2026-08-10T11:30:00Z', 'b'
  )),
  ('delivery.b.enabled', pg_temp.p14_delivery(
    '14700000-0000-4000-8000-000000000002',
    '14700000-0000-4000-8000-000000000703',
    '2026-08-10T10:30:00Z', 'c'
  ));

SET LOCAL app.organization_id = '14700000-0000-4000-8000-000000000001';
SET LOCAL app.subject_id = '14700000-0000-4000-8000-000000000201';
SET LOCAL ROLE economyos_app_local;
SELECT app.register_integration_api_credential('14700000-0000-4000-8000-000000000101', payload)
FROM p14_payloads WHERE payload_key = 'credential.a';
SELECT app.register_integration_webhook_endpoint('14700000-0000-4000-8000-000000000101', payload)
FROM p14_payloads WHERE payload_key = 'webhook.a';
SELECT app.register_developer_portal_entry('14700000-0000-4000-8000-000000000101', payload)
FROM p14_payloads WHERE payload_key = 'portal.a';

-- Role checks run against the event's historical time as well as caller scope.
SET LOCAL app.subject_id = '14700000-0000-4000-8000-000000000203';
SELECT pg_temp.p14_expect_failure('analyst cannot revoke',
  $test$SELECT app.revoke_integration_api_credential('14700000-0000-4000-8000-000000000101', payload)
  FROM p14_payloads WHERE payload_key = 'credential.a.analyst'$test$, '42501');
SET LOCAL app.subject_id = '14700000-0000-4000-8000-000000000204';
SELECT pg_temp.p14_expect_failure('late membership cannot authorize prior event',
  $test$SELECT app.revoke_integration_api_credential('14700000-0000-4000-8000-000000000101', payload)
  FROM p14_payloads WHERE payload_key = 'credential.a.late-admin'$test$, '42501');
SET LOCAL app.subject_id = '14700000-0000-4000-8000-000000000201';
SELECT app.revoke_integration_api_credential('14700000-0000-4000-8000-000000000101', payload)
FROM p14_payloads WHERE payload_key = 'credential.a.revoked';
SELECT app.revoke_integration_api_credential('14700000-0000-4000-8000-000000000101', payload)
FROM p14_payloads WHERE payload_key = 'credential.a.revoked';
SELECT pg_temp.p14_expect_failure('changed revocation replay',
  $test$SELECT app.revoke_integration_api_credential('14700000-0000-4000-8000-000000000101', payload)
  FROM p14_payloads WHERE payload_key = 'credential.a.conflict'$test$, '23514');

SELECT app.append_integration_webhook_endpoint_lifecycle_event('14700000-0000-4000-8000-000000000101', payload)
FROM p14_payloads WHERE payload_key = 'webhook.a.disabled';
SELECT pg_temp.p14_expect_failure('delivery while disabled at event time',
  $test$SELECT app.append_integration_webhook_delivery_event('14700000-0000-4000-8000-000000000101', payload)
  FROM p14_payloads WHERE payload_key = 'delivery.a.disabled'$test$, '23514');
SELECT app.append_integration_webhook_endpoint_lifecycle_event('14700000-0000-4000-8000-000000000101', payload)
FROM p14_payloads WHERE payload_key = 'webhook.a.enabled';
SELECT app.append_integration_webhook_delivery_event('14700000-0000-4000-8000-000000000101', payload)
FROM p14_payloads WHERE payload_key = 'delivery.a.enabled';
SELECT app.append_integration_webhook_endpoint_lifecycle_event('14700000-0000-4000-8000-000000000101', payload)
FROM p14_payloads WHERE payload_key = 'webhook.a.rotated';
SELECT app.append_integration_webhook_endpoint_lifecycle_event('14700000-0000-4000-8000-000000000101', payload)
FROM p14_payloads WHERE payload_key = 'webhook.a.rotated';
SELECT pg_temp.p14_expect_failure('webhook backward chronology',
  $test$SELECT app.append_integration_webhook_endpoint_lifecycle_event('14700000-0000-4000-8000-000000000101', payload)
  FROM p14_payloads WHERE payload_key = 'webhook.a.backward'$test$, '23514');
SELECT pg_temp.p14_expect_failure('webhook signing key reuse',
  $test$SELECT app.append_integration_webhook_endpoint_lifecycle_event('14700000-0000-4000-8000-000000000101', payload)
  FROM p14_payloads WHERE payload_key = 'webhook.a.reused-key'$test$, '23514');
SELECT pg_temp.p14_expect_failure('webhook sequence gap',
  $test$SELECT app.append_integration_webhook_endpoint_lifecycle_event('14700000-0000-4000-8000-000000000101', payload)
  FROM p14_payloads WHERE payload_key = 'webhook.a.gap'$test$, '23514');

SELECT app.append_developer_portal_entry_lifecycle_event('14700000-0000-4000-8000-000000000101', payload)
FROM p14_payloads WHERE payload_key = 'portal.a.suspended';
SELECT pg_temp.p14_expect_failure('equal-time portal transition',
  $test$SELECT app.append_developer_portal_entry_lifecycle_event('14700000-0000-4000-8000-000000000101', payload)
  FROM p14_payloads WHERE payload_key = 'portal.a.retired.same-time'$test$, '23514');
SELECT app.append_developer_portal_entry_lifecycle_event('14700000-0000-4000-8000-000000000101', payload)
FROM p14_payloads WHERE payload_key = 'portal.a.retired';
SELECT app.append_developer_portal_entry_lifecycle_event('14700000-0000-4000-8000-000000000101', payload)
FROM p14_payloads WHERE payload_key = 'portal.a.retired';
SELECT pg_temp.p14_expect_failure('retirement is terminal',
  $test$SELECT app.append_developer_portal_entry_lifecycle_event('14700000-0000-4000-8000-000000000101', payload)
  FROM p14_payloads WHERE payload_key = 'portal.a.after-retired'$test$, '23514');

DO $tenant_a_effective_state$
BEGIN
  IF (SELECT count(*) FROM app.get_integration_api_credential_state(
    '14700000-0000-4000-8000-000000000101','14700000-0000-4000-8000-000000000401')
    WHERE status = 'revoked' AND revoked_by = '14700000-0000-4000-8000-000000000201'
      AND revoked_at = '2026-08-10T10:00:00Z'::timestamptz) <> 1
  THEN RAISE EXCEPTION 'credential revocation state/provenance missing'; END IF;
  IF (SELECT count(*) FROM app.get_integration_webhook_endpoint_state(
    '14700000-0000-4000-8000-000000000101','14700000-0000-4000-8000-000000000501')
    WHERE active AND signing_key_id = 'webhook.key.a.v2' AND lifecycle_sequence = 3) <> 1
  THEN RAISE EXCEPTION 'webhook rotation state incorrect'; END IF;
  IF (SELECT count(*) FROM app.get_developer_portal_entry_state(
    '14700000-0000-4000-8000-000000000101','14700000-0000-4000-8000-000000000601')
    WHERE status = 'retired' AND lifecycle_sequence = 2) <> 1
  THEN RAISE EXCEPTION 'portal retirement state incorrect'; END IF;
  -- The exact getter intentionally retains nonpublished administrative history.
  -- It must expose the effective lifecycle status, not the manifest's original
  -- published status, so a consumer cannot mistake the entry for active content.
  IF (SELECT count(*) FROM app.get_developer_portal_entry(
    '14700000-0000-4000-8000-000000000101','14700000-0000-4000-8000-000000000601')
    WHERE status = 'retired') <> 1
  THEN RAISE EXCEPTION 'exact portal read failed to preserve retired effective status'; END IF;
END
$tenant_a_effective_state$;

RESET ROLE;
SET LOCAL app.organization_id = '14700000-0000-4000-8000-000000000002';
SET LOCAL app.subject_id = '14700000-0000-4000-8000-000000000202';
SET LOCAL ROLE economyos_app_local;
SELECT app.register_integration_api_credential('14700000-0000-4000-8000-000000000102', payload)
FROM p14_payloads WHERE payload_key = 'credential.b';
SELECT app.register_integration_webhook_endpoint('14700000-0000-4000-8000-000000000102', payload)
FROM p14_payloads WHERE payload_key = 'webhook.b';
SELECT app.register_developer_portal_entry('14700000-0000-4000-8000-000000000102', payload)
FROM p14_payloads WHERE payload_key = 'portal.b';
SELECT pg_temp.p14_expect_failure('revocation before credential issuance',
  $test$SELECT app.revoke_integration_api_credential('14700000-0000-4000-8000-000000000102', payload)
  FROM p14_payloads WHERE payload_key = 'credential.b.before-issued'$test$, '23514');
SELECT app.append_integration_webhook_endpoint_lifecycle_event('14700000-0000-4000-8000-000000000102', payload)
FROM p14_payloads WHERE payload_key = 'webhook.b.enabled';
SELECT app.append_integration_webhook_delivery_event('14700000-0000-4000-8000-000000000102', payload)
FROM p14_payloads WHERE payload_key = 'delivery.b.enabled';
SELECT pg_temp.p14_expect_failure('cross-tenant lifecycle mutation',
  $test$SELECT app.revoke_integration_api_credential(
    '14700000-0000-4000-8000-000000000101',
    pg_temp.p14_credential_event(
      '14700000-0000-4000-8000-000000000002',
      '14700000-0000-4000-8000-000000000101',
      '14700000-0000-4000-8000-000000000202', 1, NULL,
      '2026-08-10T10:00:00Z', 'Current actor attempts a foreign workspace.'
    )
  )$test$, '42501');
SELECT pg_temp.p14_expect_failure('direct lifecycle table read',
  $test$SELECT count(*) FROM app.integration_api_credential_lifecycle_events$test$, '42501');

DO $tenant_b_isolation$
BEGIN
  IF EXISTS (SELECT 1 FROM app.get_integration_api_credential_state(
    '14700000-0000-4000-8000-000000000101','14700000-0000-4000-8000-000000000401'))
    OR EXISTS (SELECT 1 FROM app.get_integration_webhook_endpoint_state(
    '14700000-0000-4000-8000-000000000101','14700000-0000-4000-8000-000000000501'))
    OR EXISTS (SELECT 1 FROM app.get_developer_portal_entry_state(
    '14700000-0000-4000-8000-000000000101','14700000-0000-4000-8000-000000000601'))
    OR EXISTS (SELECT 1 FROM app.get_integration_api_credential_state(
    '14700000-0000-4000-8000-000000000102','14700000-0000-4000-8000-000000000499'))
  THEN RAISE EXCEPTION 'lifecycle getter enumerates foreign or missing resources'; END IF;
  IF (SELECT count(*) FROM app.get_integration_api_credential_state(
    '14700000-0000-4000-8000-000000000102','14700000-0000-4000-8000-000000000401')
    WHERE status IN ('active','expired') AND revoked_at IS NULL) <> 1
  THEN RAISE EXCEPTION 'tenant A revocation contaminated tenant B credential'; END IF;
  IF (SELECT count(*) FROM app.get_integration_webhook_endpoint_state(
    '14700000-0000-4000-8000-000000000102','14700000-0000-4000-8000-000000000501')
    WHERE active AND signing_key_id = 'webhook.key.b.v1' AND lifecycle_sequence = 1) <> 1
  THEN RAISE EXCEPTION 'tenant B endpoint activation failed'; END IF;
END
$tenant_b_isolation$;

SET LOCAL app.subject_id = '';
SELECT pg_temp.p14_expect_failure('registrar defaults cannot supply missing identity',
  $test$SELECT app.register_integration_webhook_endpoint('14700000-0000-4000-8000-000000000102', payload)
  FROM p14_payloads WHERE payload_key = 'webhook.b'$test$, '42501');
RESET ROLE;

DO $immutable_lifecycle_counts$
BEGIN
  IF (SELECT count(*) FROM app.integration_api_credential_lifecycle_events
      WHERE organization_id IN ('14700000-0000-4000-8000-000000000001','14700000-0000-4000-8000-000000000002')) <> 1
    OR (SELECT count(*) FROM app.integration_webhook_endpoint_lifecycle_events
      WHERE organization_id IN ('14700000-0000-4000-8000-000000000001','14700000-0000-4000-8000-000000000002')) <> 4
    OR (SELECT count(*) FROM app.developer_portal_entry_lifecycle_events
      WHERE organization_id IN ('14700000-0000-4000-8000-000000000001','14700000-0000-4000-8000-000000000002')) <> 2
  THEN RAISE EXCEPTION 'failed writes or identical replays changed lifecycle history'; END IF;
END
$immutable_lifecycle_counts$;
SELECT pg_temp.p14_expect_failure('owner cannot rewrite lifecycle history',
  $test$UPDATE app.integration_webhook_endpoint_lifecycle_events SET reason = 'rewritten'
  WHERE organization_id = '14700000-0000-4000-8000-000000000001'$test$, '55000');
SELECT pg_temp.p14_expect_failure('owner cannot delete lifecycle history',
  $test$DELETE FROM app.integration_api_credential_lifecycle_events
  WHERE organization_id = '14700000-0000-4000-8000-000000000001'$test$, '55000');

ROLLBACK;
