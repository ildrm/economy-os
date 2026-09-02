-- Verify Phase 14 collaboration and integration persistence against two tenants,
-- the restricted application role, immutable replay rules, and narrow reads.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.phase14_manifest(
  requested_body jsonb,
  requested_digest_key text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT requested_body || jsonb_build_object(
    requested_digest_key,
    app.collaboration_json_digest(requested_body)
  )
$$;

CREATE OR REPLACE FUNCTION pg_temp.phase14_expect_failure(
  requested_label text,
  requested_statement text,
  requested_sqlstate text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  observed_sqlstate text;
BEGIN
  BEGIN
    EXECUTE requested_statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS observed_sqlstate = RETURNED_SQLSTATE;
    IF observed_sqlstate IS DISTINCT FROM requested_sqlstate THEN
      RAISE EXCEPTION '% failed with SQLSTATE %, expected %',
        requested_label, observed_sqlstate, requested_sqlstate;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION '% unexpectedly succeeded', requested_label;
END
$$;

INSERT INTO app.organizations (id, slug, name) VALUES
  ('14000000-0000-4000-8000-000000000001', 'phase14-a', 'Phase 14 Tenant A'),
  ('14000000-0000-4000-8000-000000000002', 'phase14-b', 'Phase 14 Tenant B');
INSERT INTO app.workspaces (id, organization_id, slug, name) VALUES
  (
    '14000000-0000-4000-8000-000000000101',
    '14000000-0000-4000-8000-000000000001', 'ecosystem', 'Ecosystem A'
  ),
  (
    '14000000-0000-4000-8000-000000000102',
    '14000000-0000-4000-8000-000000000002', 'ecosystem', 'Ecosystem B'
  );
INSERT INTO app.subjects (id, issuer, external_subject, kind) VALUES
  (
    '14000000-0000-4000-8000-000000000201',
    'https://identity.economyos.test/', 'phase14-admin-a', 'human'
  ),
  (
    '14000000-0000-4000-8000-000000000202',
    'https://identity.economyos.test/', 'phase14-admin-b', 'human'
  ),
  (
    '14000000-0000-4000-8000-000000000203',
    'https://identity.economyos.test/', 'phase14-publisher-a', 'human'
  );
INSERT INTO app.organization_memberships (
  organization_id, subject_id, role, valid_from
) VALUES
  (
    '14000000-0000-4000-8000-000000000001',
    '14000000-0000-4000-8000-000000000201', 'admin', '2026-01-01T00:00:00Z'
  ),
  (
    '14000000-0000-4000-8000-000000000002',
    '14000000-0000-4000-8000-000000000202', 'admin', '2026-01-01T00:00:00Z'
  ),
  (
    '14000000-0000-4000-8000-000000000001',
    '14000000-0000-4000-8000-000000000203', 'analyst', '2026-01-01T00:00:00Z'
  );
INSERT INTO app.workspace_memberships (
  organization_id, workspace_id, subject_id, role, valid_from
) VALUES
  (
    '14000000-0000-4000-8000-000000000001',
    '14000000-0000-4000-8000-000000000101',
    '14000000-0000-4000-8000-000000000201', 'admin', '2026-01-01T00:00:00Z'
  ),
  (
    '14000000-0000-4000-8000-000000000002',
    '14000000-0000-4000-8000-000000000102',
    '14000000-0000-4000-8000-000000000202', 'admin', '2026-01-01T00:00:00Z'
  ),
  (
    '14000000-0000-4000-8000-000000000001',
    '14000000-0000-4000-8000-000000000101',
    '14000000-0000-4000-8000-000000000203', 'analyst', '2026-01-01T00:00:00Z'
  );

CREATE TEMP TABLE phase14_payloads (
  payload_key text PRIMARY KEY,
  payload jsonb NOT NULL
) ON COMMIT DROP;
GRANT SELECT ON phase14_payloads TO economyos_app_local;

INSERT INTO phase14_payloads VALUES (
  'collaboration.created',
  pg_temp.phase14_manifest(jsonb_build_object(
    'schemaVersion', 1,
    'sequence', 1,
    'previousEventSha256', NULL,
    'recordId', '14000000-0000-4000-8000-000000000301',
    'recordVersion', 1,
    'kind', 'annotation',
    'action', 'created',
    'organizationId', '14000000-0000-4000-8000-000000000001',
    'workspaceId', '14000000-0000-4000-8000-000000000101',
    'actorId', '14000000-0000-4000-8000-000000000201',
    'occurredAt', '2026-08-05T10:00:00Z',
    'artifact', jsonb_build_object(
      'organizationId', '14000000-0000-4000-8000-000000000001',
      'workspaceId', '14000000-0000-4000-8000-000000000101',
      'artifactId', '14000000-0000-4000-8000-000000000302',
      'artifactType', 'forecast.bundle',
      'artifactVersionSha256', repeat('a', 64),
      'asOf', '2026-08-01T00:00:00Z',
      'pointInTimeGrade', 'exact_vintage'
    ),
    'citations', jsonb_build_array(jsonb_build_object(
      'evidenceId', '14000000-0000-4000-8000-000000000303',
      'evidenceVersionSha256', repeat('b', 64),
      'locator', 'table 2, row 4',
      'availableAt', '2026-07-31T12:00:00Z',
      'temporalRelation', 'available_by_artifact_cutoff'
    )),
    'body', 'The cited release supports this bounded interpretation.',
    'contentClass', 'non_authoritative_commentary',
    'authorizationDecisionSha256', repeat('c', 64),
    'previousRecordEventSha256', NULL
  ), 'eventSha256')
);

INSERT INTO phase14_payloads VALUES (
  'credential.a',
  pg_temp.phase14_manifest(jsonb_build_object(
    'schemaVersion', 1,
    'credentialId', '14000000-0000-4000-8000-000000000401',
    'principalId', '14000000-0000-4000-8000-000000000201',
    'organizationId', '14000000-0000-4000-8000-000000000001',
    'workspaceId', '14000000-0000-4000-8000-000000000101',
    'scopes', jsonb_build_array('api_credential.use', 'data.read'),
    'secretSha256', repeat('d', 64),
    'issuedAt', '2026-08-01T00:00:00Z',
    'expiresAt', '2027-08-01T00:00:00Z',
    'revokedAt', NULL
  ), 'manifestSha256')
), (
  'credential.b',
  pg_temp.phase14_manifest(jsonb_build_object(
    'schemaVersion', 1,
    'credentialId', '14000000-0000-4000-8000-000000000401',
    'principalId', '14000000-0000-4000-8000-000000000202',
    'organizationId', '14000000-0000-4000-8000-000000000002',
    'workspaceId', '14000000-0000-4000-8000-000000000102',
    'scopes', jsonb_build_array('api_credential.use', 'data.read'),
    'secretSha256', repeat('e', 64),
    'issuedAt', '2026-08-01T00:00:00Z',
    'expiresAt', '2027-08-01T00:00:00Z',
    'revokedAt', NULL
  ), 'manifestSha256')
);

INSERT INTO phase14_payloads VALUES (
  'quota.policy',
  pg_temp.phase14_manifest(jsonb_build_object(
    'schemaVersion', 1,
    'quotaId', '14000000-0000-4000-8000-000000000501',
    'organizationId', '14000000-0000-4000-8000-000000000001',
    'capability', 'extension.execute',
    'mode', 'hard',
    'limitUnits', 10,
    'windowStartsAt', '2026-08-01T00:00:00Z',
    'windowEndsAt', '2026-10-01T00:00:00Z',
    'policyVersion', 'quota.v1'
  ), 'manifestSha256')
);
INSERT INTO phase14_payloads VALUES (
  'quota.reserved',
  pg_temp.phase14_manifest(jsonb_build_object(
    'schemaVersion', 1,
    'sequence', 1,
    'previousEventSha256', NULL,
    'quotaId', '14000000-0000-4000-8000-000000000501',
    'organizationId', '14000000-0000-4000-8000-000000000001',
    'capability', 'extension.execute',
    'action', 'reserved',
    'reservationId', '14000000-0000-4000-8000-000000000502',
    'principalId', '14000000-0000-4000-8000-000000000201',
    'quantityUnits', 3,
    'adjustmentUnits', 0,
    'idempotencyKey', 'phase14-request-1',
    'requestSha256', repeat('1', 64),
    'usageEventId', NULL,
    'reason', NULL,
    'occurredAt', '2026-08-05T11:00:00Z',
    'reservationExpiresAt', '2026-08-05T12:00:00Z',
    'authorizationDecisionSha256', repeat('2', 64),
    'totalConsumedUnits', 0,
    'totalOutstandingUnits', 3
  ), 'eventSha256')
);
INSERT INTO phase14_payloads
SELECT 'quota.settled', pg_temp.phase14_manifest(jsonb_build_object(
  'schemaVersion', 1,
  'sequence', 2,
  'previousEventSha256', reserved.payload->>'eventSha256',
  'quotaId', '14000000-0000-4000-8000-000000000501',
  'organizationId', '14000000-0000-4000-8000-000000000001',
  'capability', 'extension.execute',
  'action', 'settled',
  'reservationId', '14000000-0000-4000-8000-000000000502',
  'principalId', '14000000-0000-4000-8000-000000000201',
  'quantityUnits', 2,
  'adjustmentUnits', 0,
  'idempotencyKey', NULL,
  'requestSha256', NULL,
  'usageEventId', '14000000-0000-4000-8000-000000000503',
  'reason', NULL,
  'occurredAt', '2026-08-05T11:30:00Z',
  'reservationExpiresAt', NULL,
  'authorizationDecisionSha256', repeat('2', 64),
  'totalConsumedUnits', 2,
  'totalOutstandingUnits', 0
), 'eventSha256')
FROM phase14_payloads reserved WHERE reserved.payload_key = 'quota.reserved';

INSERT INTO phase14_payloads VALUES (
  'webhook.endpoint',
  pg_temp.phase14_manifest(jsonb_build_object(
    'schemaVersion', 1,
    'endpointId', '14000000-0000-4000-8000-000000000601',
    'organizationId', '14000000-0000-4000-8000-000000000001',
    'url', 'https://hooks.example.com/economyos',
    'eventTypes', jsonb_build_array('forecast.updated', 'scenario.completed'),
    'signingKeyId', 'webhook.key.v1',
    'maxAttempts', 3,
    'baseRetrySeconds', 60,
    'maxRetrySeconds', 300,
    'active', true
  ), 'manifestSha256')
);
INSERT INTO phase14_payloads VALUES (
  'webhook.queued',
  pg_temp.phase14_manifest(jsonb_build_object(
    'schemaVersion', 1, 'sequence', 1, 'previousEventSha256', NULL,
    'deliveryId', '14000000-0000-4000-8000-000000000602',
    'endpointId', '14000000-0000-4000-8000-000000000601',
    'organizationId', '14000000-0000-4000-8000-000000000001',
    'envelopeSha256', repeat('3', 64), 'status', 'queued', 'attempt', 0,
    'occurredAt', '2026-08-05T13:00:00Z', 'retryAt', NULL, 'outcomeCode', NULL
  ), 'eventSha256')
);
INSERT INTO phase14_payloads
SELECT 'webhook.delivering.1', pg_temp.phase14_manifest(jsonb_build_object(
  'schemaVersion', 1, 'sequence', 2,
  'previousEventSha256', prior.payload->>'eventSha256',
  'deliveryId', '14000000-0000-4000-8000-000000000602',
  'endpointId', '14000000-0000-4000-8000-000000000601',
  'organizationId', '14000000-0000-4000-8000-000000000001',
  'envelopeSha256', repeat('3', 64), 'status', 'delivering', 'attempt', 1,
  'occurredAt', '2026-08-05T13:01:00Z', 'retryAt', NULL, 'outcomeCode', NULL
), 'eventSha256') FROM phase14_payloads prior
WHERE prior.payload_key = 'webhook.queued';
INSERT INTO phase14_payloads
SELECT 'webhook.retry.1', pg_temp.phase14_manifest(jsonb_build_object(
  'schemaVersion', 1, 'sequence', 3,
  'previousEventSha256', prior.payload->>'eventSha256',
  'deliveryId', '14000000-0000-4000-8000-000000000602',
  'endpointId', '14000000-0000-4000-8000-000000000601',
  'organizationId', '14000000-0000-4000-8000-000000000001',
  'envelopeSha256', repeat('3', 64), 'status', 'retry_scheduled', 'attempt', 1,
  'occurredAt', '2026-08-05T13:02:00Z', 'retryAt', '2026-08-05T13:03:00Z',
  'outcomeCode', 'transport.timeout'
), 'eventSha256') FROM phase14_payloads prior
WHERE prior.payload_key = 'webhook.delivering.1';
INSERT INTO phase14_payloads
SELECT 'webhook.delivering.2', pg_temp.phase14_manifest(jsonb_build_object(
  'schemaVersion', 1, 'sequence', 4,
  'previousEventSha256', prior.payload->>'eventSha256',
  'deliveryId', '14000000-0000-4000-8000-000000000602',
  'endpointId', '14000000-0000-4000-8000-000000000601',
  'organizationId', '14000000-0000-4000-8000-000000000001',
  'envelopeSha256', repeat('3', 64), 'status', 'delivering', 'attempt', 2,
  'occurredAt', '2026-08-05T13:03:00Z', 'retryAt', NULL, 'outcomeCode', NULL
), 'eventSha256') FROM phase14_payloads prior
WHERE prior.payload_key = 'webhook.retry.1';
INSERT INTO phase14_payloads
SELECT 'webhook.delivered', pg_temp.phase14_manifest(jsonb_build_object(
  'schemaVersion', 1, 'sequence', 5,
  'previousEventSha256', prior.payload->>'eventSha256',
  'deliveryId', '14000000-0000-4000-8000-000000000602',
  'endpointId', '14000000-0000-4000-8000-000000000601',
  'organizationId', '14000000-0000-4000-8000-000000000001',
  'envelopeSha256', repeat('3', 64), 'status', 'delivered', 'attempt', 2,
  'occurredAt', '2026-08-05T13:04:00Z', 'retryAt', NULL, 'outcomeCode', 'http.204'
), 'eventSha256') FROM phase14_payloads prior
WHERE prior.payload_key = 'webhook.delivering.2';
INSERT INTO phase14_payloads
SELECT 'webhook.queued.badretry', pg_temp.phase14_manifest(jsonb_build_object(
  'schemaVersion', 1, 'sequence', 6,
  'previousEventSha256', prior.payload->>'eventSha256',
  'deliveryId', '14000000-0000-4000-8000-000000000603',
  'endpointId', '14000000-0000-4000-8000-000000000601',
  'organizationId', '14000000-0000-4000-8000-000000000001',
  'envelopeSha256', repeat('5', 64), 'status', 'queued', 'attempt', 0,
  'occurredAt', '2026-08-05T13:05:00Z', 'retryAt', NULL, 'outcomeCode', NULL
), 'eventSha256') FROM phase14_payloads prior
WHERE prior.payload_key = 'webhook.delivered';
INSERT INTO phase14_payloads
SELECT 'webhook.delivering.badretry', pg_temp.phase14_manifest(jsonb_build_object(
  'schemaVersion', 1, 'sequence', 7,
  'previousEventSha256', prior.payload->>'eventSha256',
  'deliveryId', '14000000-0000-4000-8000-000000000603',
  'endpointId', '14000000-0000-4000-8000-000000000601',
  'organizationId', '14000000-0000-4000-8000-000000000001',
  'envelopeSha256', repeat('5', 64), 'status', 'delivering', 'attempt', 1,
  'occurredAt', '2026-08-05T13:06:00Z', 'retryAt', NULL, 'outcomeCode', NULL
), 'eventSha256') FROM phase14_payloads prior
WHERE prior.payload_key = 'webhook.queued.badretry';

INSERT INTO phase14_payloads VALUES (
  'extension.manifest',
  pg_temp.phase14_manifest(jsonb_build_object(
    'schemaVersion', 1,
    'extensionId', '14000000-0000-4000-8000-000000000701',
    'publisherId', '14000000-0000-4000-8000-000000000203',
    'organizationId', '14000000-0000-4000-8000-000000000001',
    'kind', 'connector', 'name', 'verified.connector', 'version', '1.0.0',
    'extensionApiVersion', '1.0.0', 'artifactSha256', repeat('4', 64),
    'runtime', 'wasm',
    'capabilities', jsonb_build_array('data.read', 'extension.execute'),
    'egress', jsonb_build_object(
      'mode', 'allowlist', 'hosts', jsonb_build_array('api.example.com')
    ),
    'resources', jsonb_build_object(
      'memoryMiB', 128, 'cpuMillis', 1000, 'wallClockMillis', 5000,
      'outputBytes', 1048576, 'concurrency', 2
    ),
    'inputClassifications', jsonb_build_array('confidential', 'internal'),
    'outputClassifications', jsonb_build_array('internal'),
    'createdAt', '2026-08-01T00:00:00Z'
  ), 'manifestSha256')
);
INSERT INTO phase14_payloads
SELECT 'extension.certification', pg_temp.phase14_manifest(jsonb_build_object(
  'schemaVersion', 1,
  'certificationId', '14000000-0000-4000-8000-000000000702',
  'extensionId', '14000000-0000-4000-8000-000000000701',
  'extensionVersion', '1.0.0',
  'extensionManifestSha256', extension.payload->>'manifestSha256',
  'organizationId', '14000000-0000-4000-8000-000000000001',
  'workspaceId', '14000000-0000-4000-8000-000000000101',
  'certifiedBy', '14000000-0000-4000-8000-000000000201',
  'issuedAt', '2026-08-02T00:00:00Z', 'validUntil', '2027-08-02T00:00:00Z',
  'compatibilityContractSha256', repeat('5', 64),
  'compatibilityDecisionSha256', repeat('6', 64),
  'isolationProfileSha256', repeat('7', 64),
  'testEvidenceSha256', jsonb_build_array(repeat('8', 64), repeat('9', 64)),
  'passedTests', jsonb_build_array(
    'audit_receipt', 'deterministic_shutdown', 'filesystem_isolation',
    'network_egress', 'quota_enforcement', 'tenant_boundary'
  ),
  'authorizationDecisionSha256', repeat('a', 64)
), 'manifestSha256') FROM phase14_payloads extension
WHERE extension.payload_key = 'extension.manifest';
INSERT INTO phase14_payloads
SELECT 'portal.entry', pg_temp.phase14_manifest(jsonb_build_object(
  'schemaVersion', 1,
  'entryId', '14000000-0000-4000-8000-000000000801',
  'integrationId', '14000000-0000-4000-8000-000000000701',
  'organizationId', '14000000-0000-4000-8000-000000000001',
  'workspaceId', '14000000-0000-4000-8000-000000000101',
  'ownerPrincipalId', '14000000-0000-4000-8000-000000000201',
  'assetKind', 'connector', 'slug', 'verified.connector',
  'displayName', 'Verified Connector',
  'summary', 'A bounded certified connector for deterministic verification.',
  'documentationPath', '/developers/integrations/verified.connector',
  'artifactSha256', repeat('4', 64),
  'capabilities', jsonb_build_array('data.read', 'extension.execute'),
  'compatibilityContractSha256', repeat('5', 64),
  'extensionCertificationSha256', certification.payload->>'manifestSha256',
  'status', 'published', 'issuedAt', '2026-08-03T00:00:00Z',
  'authorizationDecisionSha256', repeat('b', 64)
), 'manifestSha256') FROM phase14_payloads certification
WHERE certification.payload_key = 'extension.certification';
INSERT INTO phase14_payloads VALUES (
  'audit.event',
  pg_temp.phase14_manifest(jsonb_build_object(
    'schemaVersion', 1, 'sequence', 1, 'previousEventSha256', NULL,
    'recordClass', 'integration_audit_pointer_only',
    'auditEventId', '14000000-0000-4000-8000-000000000901',
    'organizationId', '14000000-0000-4000-8000-000000000001',
    'workspaceId', '14000000-0000-4000-8000-000000000101',
    'principalId', '14000000-0000-4000-8000-000000000201',
    'integrationId', '14000000-0000-4000-8000-000000000701',
    'action', 'extension.admit',
    'resource', jsonb_build_object(
      'resourceType', 'extension.version',
      'resourceId', '14000000-0000-4000-8000-000000000701',
      'resourceVersionSha256', repeat('4', 64)
    ),
    'outcome', 'succeeded', 'reasonCode', 'extension.admitted',
    'policyVersion', 'integration.v1',
    'traceId', '14000000-0000-4000-8000-000000000902',
    'occurredAt', '2026-08-03T01:00:00Z', 'classification', 'internal',
    'requestSha256', repeat('c', 64),
    'relatedReceiptSha256', jsonb_build_array(repeat('d', 64), repeat('e', 64))
  ), 'eventSha256')
);
INSERT INTO phase14_payloads VALUES (
  'extension.revocation',
  pg_temp.phase14_manifest(jsonb_build_object(
    'schemaVersion', 1,
    'revocationId', '14000000-0000-4000-8000-000000000703',
    'extensionId', '14000000-0000-4000-8000-000000000701',
    'extensionVersion', '1.0.0',
    'organizationId', '14000000-0000-4000-8000-000000000001',
    'workspaceId', '14000000-0000-4000-8000-000000000101',
    'revokedBy', '14000000-0000-4000-8000-000000000201',
    'revokedAt', '2026-08-10T00:00:00Z',
    'reason', 'Certification was withdrawn after a bounded review.',
    'authorizationDecisionSha256', repeat('f', 64)
  ), 'manifestSha256')
);

INSERT INTO phase14_payloads
SELECT 'extension.self.manifest', pg_temp.phase14_manifest(
  (extension.payload - 'manifestSha256') || jsonb_build_object(
    'extensionId', '14000000-0000-4000-8000-000000000704',
    'publisherId', '14000000-0000-4000-8000-000000000201',
    'name', 'self.certified.connector',
    'artifactSha256', repeat('6', 64)
  ),
  'manifestSha256'
)
FROM phase14_payloads extension
WHERE extension.payload_key = 'extension.manifest';

INSERT INTO phase14_payloads
SELECT 'extension.self.certification', pg_temp.phase14_manifest(
  (certification.payload - 'manifestSha256') || jsonb_build_object(
    'certificationId', '14000000-0000-4000-8000-000000000705',
    'extensionId', '14000000-0000-4000-8000-000000000704',
    'extensionManifestSha256', extension.payload->>'manifestSha256'
  ),
  'manifestSha256'
)
FROM phase14_payloads certification
CROSS JOIN phase14_payloads extension
WHERE certification.payload_key = 'extension.certification'
  AND extension.payload_key = 'extension.self.manifest';

SET LOCAL app.organization_id = '14000000-0000-4000-8000-000000000001';
SET LOCAL app.subject_id = '14000000-0000-4000-8000-000000000201';
SET LOCAL ROLE economyos_app_local;

SELECT app.append_collaboration_record_event(
  '14000000-0000-4000-8000-000000000101', payload
) FROM phase14_payloads WHERE payload_key = 'collaboration.created';
SELECT app.register_integration_api_credential(
  '14000000-0000-4000-8000-000000000101', payload
) FROM phase14_payloads WHERE payload_key = 'credential.a';
SELECT app.register_integration_quota_policy(
  '14000000-0000-4000-8000-000000000101', payload
) FROM phase14_payloads WHERE payload_key = 'quota.policy';
SELECT app.append_integration_quota_event(
  '14000000-0000-4000-8000-000000000101', payload
) FROM phase14_payloads WHERE payload_key IN ('quota.reserved', 'quota.settled')
ORDER BY (payload->>'sequence')::integer;
SELECT app.register_integration_webhook_endpoint(
  '14000000-0000-4000-8000-000000000101', payload
) FROM phase14_payloads WHERE payload_key = 'webhook.endpoint';
SELECT app.append_integration_webhook_delivery_event(
  '14000000-0000-4000-8000-000000000101', payload
) FROM phase14_payloads
WHERE payload_key LIKE 'webhook.%'
  AND payload_key NOT IN (
    'webhook.endpoint', 'webhook.queued.badretry', 'webhook.delivering.badretry'
  )
ORDER BY (payload->>'sequence')::integer;
SELECT app.append_integration_webhook_delivery_event(
  '14000000-0000-4000-8000-000000000101', payload
) FROM phase14_payloads
WHERE payload_key IN ('webhook.queued.badretry', 'webhook.delivering.badretry')
ORDER BY (payload->>'sequence')::integer;
SELECT app.register_integration_extension_manifest(
  '14000000-0000-4000-8000-000000000101', payload
) FROM phase14_payloads WHERE payload_key = 'extension.manifest';
SELECT app.register_integration_extension_certification(
  '14000000-0000-4000-8000-000000000101', payload
) FROM phase14_payloads WHERE payload_key = 'extension.certification';
SELECT app.register_developer_portal_entry(
  '14000000-0000-4000-8000-000000000101', payload
) FROM phase14_payloads WHERE payload_key = 'portal.entry';

SELECT app.register_integration_extension_manifest(
  '14000000-0000-4000-8000-000000000101', payload
) FROM phase14_payloads WHERE payload_key = 'extension.self.manifest';
SELECT pg_temp.phase14_expect_failure(
  'publisher self-certification',
  $test$SELECT app.register_integration_extension_certification(
    '14000000-0000-4000-8000-000000000101', payload
  ) FROM phase14_payloads WHERE payload_key = 'extension.self.certification'$test$,
  '23514'
);

SELECT pg_temp.phase14_expect_failure(
  'revocation predating latest certification',
  $test$SELECT app.register_integration_extension_revocation(
    '14000000-0000-4000-8000-000000000101',
    pg_temp.phase14_manifest(
      ((SELECT payload FROM phase14_payloads WHERE payload_key = 'extension.revocation')
        - 'manifestSha256') || jsonb_build_object(
          'revocationId', '14000000-0000-4000-8000-000000000706',
          'revokedAt', '2026-08-01T12:00:00Z'
        ),
      'manifestSha256'
    )
  )$test$,
  '23514'
);

SELECT pg_temp.phase14_expect_failure(
  'non-monotonic extension certification',
  $test$SELECT app.register_integration_extension_certification(
    '14000000-0000-4000-8000-000000000101',
    pg_temp.phase14_manifest(
      ((SELECT payload FROM phase14_payloads WHERE payload_key = 'extension.certification')
        - 'manifestSha256') || jsonb_build_object(
          'certificationId', '14000000-0000-4000-8000-000000000707',
          'issuedAt', '2026-08-01T12:00:00Z'
        ),
      'manifestSha256'
    )
  )$test$,
  '23514'
);

SELECT pg_temp.phase14_expect_failure(
  'portal certification transferred to unrelated integration',
  $test$SELECT app.register_developer_portal_entry(
    '14000000-0000-4000-8000-000000000101',
    pg_temp.phase14_manifest(
      ((SELECT payload FROM phase14_payloads WHERE payload_key = 'portal.entry')
        - 'manifestSha256') || jsonb_build_object(
          'entryId', '14000000-0000-4000-8000-000000000802',
          'integrationId', '14000000-0000-4000-8000-000000000799',
          'slug', 'misbound.integration',
          'documentationPath', '/developers/integrations/misbound.integration'
        ),
      'manifestSha256'
    )
  )$test$,
  '23514'
);

SELECT pg_temp.phase14_expect_failure(
  'portal artifact differs from certified extension',
  $test$SELECT app.register_developer_portal_entry(
    '14000000-0000-4000-8000-000000000101',
    pg_temp.phase14_manifest(
      ((SELECT payload FROM phase14_payloads WHERE payload_key = 'portal.entry')
        - 'manifestSha256') || jsonb_build_object(
          'entryId', '14000000-0000-4000-8000-000000000803',
          'slug', 'misbound.artifact',
          'documentationPath', '/developers/integrations/misbound.artifact',
          'artifactSha256', repeat('7', 64)
        ),
      'manifestSha256'
    )
  )$test$,
  '23514'
);

SELECT pg_temp.phase14_expect_failure(
  'portal capabilities differ from certified extension',
  $test$SELECT app.register_developer_portal_entry(
    '14000000-0000-4000-8000-000000000101',
    pg_temp.phase14_manifest(
      ((SELECT payload FROM phase14_payloads WHERE payload_key = 'portal.entry')
        - 'manifestSha256') || jsonb_build_object(
          'entryId', '14000000-0000-4000-8000-000000000804',
          'slug', 'misbound.capabilities',
          'documentationPath', '/developers/integrations/misbound.capabilities',
          'capabilities', jsonb_build_array('data.read')
        ),
      'manifestSha256'
    )
  )$test$,
  '23514'
);

SELECT pg_temp.phase14_expect_failure(
  'portal compatibility differs from certification',
  $test$SELECT app.register_developer_portal_entry(
    '14000000-0000-4000-8000-000000000101',
    pg_temp.phase14_manifest(
      ((SELECT payload FROM phase14_payloads WHERE payload_key = 'portal.entry')
        - 'manifestSha256') || jsonb_build_object(
          'entryId', '14000000-0000-4000-8000-000000000805',
          'slug', 'misbound.compatibility',
          'documentationPath', '/developers/integrations/misbound.compatibility',
          'compatibilityContractSha256', repeat('7', 64)
        ),
      'manifestSha256'
    )
  )$test$,
  '23514'
);

SELECT pg_temp.phase14_expect_failure(
  'portal asset kind differs from extension kind',
  $test$SELECT app.register_developer_portal_entry(
    '14000000-0000-4000-8000-000000000101',
    pg_temp.phase14_manifest(
      ((SELECT payload FROM phase14_payloads WHERE payload_key = 'portal.entry')
        - 'manifestSha256') || jsonb_build_object(
          'entryId', '14000000-0000-4000-8000-000000000806',
          'slug', 'misbound.kind',
          'documentationPath', '/developers/integrations/misbound.kind',
          'assetKind', 'model_extension'
        ),
      'manifestSha256'
    )
  )$test$,
  '23514'
);

SELECT pg_temp.phase14_expect_failure(
  'cross-tenant extension publisher',
  $test$SELECT app.register_integration_extension_manifest(
    '14000000-0000-4000-8000-000000000101',
    pg_temp.phase14_manifest(
      ((SELECT payload FROM phase14_payloads WHERE payload_key = 'extension.manifest')
        - 'manifestSha256') || jsonb_build_object(
          'extensionId', '14000000-0000-4000-8000-000000000708',
          'publisherId', '14000000-0000-4000-8000-000000000202',
          'name', 'foreign.publisher',
          'artifactSha256', repeat('8', 64)
        ),
      'manifestSha256'
    )
  )$test$,
  '23514'
);

SELECT pg_temp.phase14_expect_failure(
  'cross-tenant developer portal owner',
  $test$SELECT app.register_developer_portal_entry(
    '14000000-0000-4000-8000-000000000101',
    pg_temp.phase14_manifest(
      ((SELECT payload FROM phase14_payloads WHERE payload_key = 'portal.entry')
        - 'manifestSha256') || jsonb_build_object(
          'entryId', '14000000-0000-4000-8000-000000000807',
          'integrationId', '14000000-0000-4000-8000-000000000717',
          'ownerPrincipalId', '14000000-0000-4000-8000-000000000202',
          'assetKind', 'sdk',
          'slug', 'foreign.owner.sdk',
          'documentationPath', '/developers/integrations/foreign.owner.sdk',
          'artifactSha256', repeat('9', 64),
          'capabilities', jsonb_build_array('data.read'),
          'extensionCertificationSha256', NULL,
          'status', 'draft'
        ),
      'manifestSha256'
    )
  )$test$,
  '23514'
);

SELECT pg_temp.phase14_expect_failure(
  'portal issuance before actor membership',
  $test$SELECT app.register_developer_portal_entry(
    '14000000-0000-4000-8000-000000000101',
    pg_temp.phase14_manifest(
      ((SELECT payload FROM phase14_payloads WHERE payload_key = 'portal.entry')
        - 'manifestSha256') || jsonb_build_object(
          'entryId', '14000000-0000-4000-8000-000000000808',
          'integrationId', '14000000-0000-4000-8000-000000000718',
          'assetKind', 'sdk',
          'slug', 'premembership.sdk',
          'documentationPath', '/developers/integrations/premembership.sdk',
          'artifactSha256', repeat('a', 64),
          'capabilities', jsonb_build_array('data.read'),
          'extensionCertificationSha256', NULL,
          'status', 'draft',
          'issuedAt', '2025-12-01T00:00:00Z'
        ),
      'manifestSha256'
    )
  )$test$,
  '23514'
);

SELECT pg_temp.phase14_expect_failure(
  'numeric prerelease with leading zero',
  $test$SELECT app.register_integration_extension_manifest(
    '14000000-0000-4000-8000-000000000101',
    pg_temp.phase14_manifest(
      ((SELECT payload FROM phase14_payloads WHERE payload_key = 'extension.manifest')
        - 'manifestSha256') || jsonb_build_object(
          'extensionId', '14000000-0000-4000-8000-000000000709',
          'name', 'invalid.semver',
          'version', '1.0.0-01',
          'artifactSha256', repeat('b', 64)
        ),
      'manifestSha256'
    )
  )$test$,
  '23514'
);

SELECT pg_temp.phase14_expect_failure(
  'non-canonical fractional UTC instant',
  $test$SELECT app.register_integration_api_credential(
    '14000000-0000-4000-8000-000000000101',
    pg_temp.phase14_manifest(
      ((SELECT payload FROM phase14_payloads WHERE payload_key = 'credential.a')
        - 'manifestSha256') || jsonb_build_object(
          'credentialId', '14000000-0000-4000-8000-000000000403',
          'issuedAt', '2026-08-01T00:00:00.0Z'
        ),
      'manifestSha256'
    )
  )$test$,
  '23514'
);

SELECT app.append_integration_audit_event(
  '14000000-0000-4000-8000-000000000101', payload
) FROM phase14_payloads WHERE payload_key = 'audit.event';
SELECT app.register_integration_extension_revocation(
  '14000000-0000-4000-8000-000000000101', payload
) FROM phase14_payloads WHERE payload_key = 'extension.revocation';

SELECT pg_temp.phase14_expect_failure(
  'published portal entry after extension revocation',
  $test$SELECT app.register_developer_portal_entry(
    '14000000-0000-4000-8000-000000000101',
    pg_temp.phase14_manifest(
      ((SELECT payload FROM phase14_payloads WHERE payload_key = 'portal.entry')
        - 'manifestSha256') || jsonb_build_object(
          'entryId', '14000000-0000-4000-8000-000000000809',
          'slug', 'revoked.connector',
          'documentationPath', '/developers/integrations/revoked.connector',
          'issuedAt', '2026-08-11T00:00:00Z'
        ),
      'manifestSha256'
    )
  )$test$,
  '23514'
);

-- Exact replays remain idempotent even after later ledger events or revocation.
SELECT app.append_collaboration_record_event(
  '14000000-0000-4000-8000-000000000101', payload
) FROM phase14_payloads WHERE payload_key = 'collaboration.created';
SELECT app.append_integration_quota_event(
  '14000000-0000-4000-8000-000000000101', payload
) FROM phase14_payloads WHERE payload_key = 'quota.reserved';
SELECT app.register_integration_extension_certification(
  '14000000-0000-4000-8000-000000000101', payload
) FROM phase14_payloads WHERE payload_key = 'extension.certification';

SELECT pg_temp.phase14_expect_failure(
  'changed quota replay',
  $test$SELECT app.append_integration_quota_event(
    '14000000-0000-4000-8000-000000000101',
    pg_temp.phase14_manifest(
      ((SELECT payload FROM phase14_payloads WHERE payload_key = 'quota.reserved')
        - 'eventSha256') || jsonb_build_object('quantityUnits', 4),
      'eventSha256'
    )
  )$test$,
  '23514'
);
SELECT pg_temp.phase14_expect_failure(
  'fractional quota units',
  $test$SELECT app.append_integration_quota_event(
    '14000000-0000-4000-8000-000000000101',
    pg_temp.phase14_manifest(
      ((SELECT payload FROM phase14_payloads WHERE payload_key = 'quota.reserved')
        - 'eventSha256') || jsonb_build_object('sequence', 3, 'quantityUnits', 1.5),
      'eventSha256'
    )
  )$test$,
  '23514'
);
SELECT pg_temp.phase14_expect_failure(
  'changed certification replay after revocation',
  $test$SELECT app.register_integration_extension_certification(
    '14000000-0000-4000-8000-000000000101',
    pg_temp.phase14_manifest(
      ((SELECT payload FROM phase14_payloads WHERE payload_key = 'extension.certification')
        - 'manifestSha256') || jsonb_build_object('validUntil', '2027-09-01T00:00:00Z'),
      'manifestSha256'
    )
  )$test$,
  '23514'
);
SELECT pg_temp.phase14_expect_failure(
  'misclassified subsequent citation',
  $test$SELECT app.append_collaboration_record_event(
    '14000000-0000-4000-8000-000000000101',
    pg_temp.phase14_manifest(
      ((SELECT payload FROM phase14_payloads WHERE payload_key = 'collaboration.created')
        - 'eventSha256') || jsonb_build_object(
          'recordId', '14000000-0000-4000-8000-000000000304',
          'sequence', 2,
          'previousEventSha256', (SELECT payload->>'eventSha256' FROM phase14_payloads
            WHERE payload_key = 'collaboration.created'),
          'citations', jsonb_build_array(jsonb_build_object(
            'evidenceId', '14000000-0000-4000-8000-000000000305',
            'evidenceVersionSha256', repeat('1', 64),
            'locator', 'table 3', 'availableAt', '2026-07-31T00:00:00Z',
            'temporalRelation', 'subsequent_evidence'
          ))
        ),
      'eventSha256'
    )
  )$test$,
  '23514'
);
SELECT pg_temp.phase14_expect_failure(
  'non-UTC credential timestamp',
  $test$SELECT app.register_integration_api_credential(
    '14000000-0000-4000-8000-000000000101',
    pg_temp.phase14_manifest(
      ((SELECT payload FROM phase14_payloads WHERE payload_key = 'credential.a')
        - 'manifestSha256') || jsonb_build_object(
          'credentialId', '14000000-0000-4000-8000-000000000402',
          'issuedAt', '2026-08-01T01:00:00+01:00'
        ),
      'manifestSha256'
    )
  )$test$,
  '23514'
);
SELECT pg_temp.phase14_expect_failure(
  'changed manifest without changed digest',
  $test$SELECT app.register_integration_api_credential(
    '14000000-0000-4000-8000-000000000101',
    (SELECT payload || jsonb_build_object('expiresAt', '2028-01-01T00:00:00Z')
      FROM phase14_payloads WHERE payload_key = 'credential.a')
  )$test$,
  '23514'
);
SELECT pg_temp.phase14_expect_failure(
  'non-canonical webhook retry schedule',
  $test$SELECT app.append_integration_webhook_delivery_event(
    '14000000-0000-4000-8000-000000000101',
    pg_temp.phase14_manifest(
      ((SELECT payload FROM phase14_payloads WHERE payload_key = 'webhook.retry.1')
        - 'eventSha256') || jsonb_build_object(
          'sequence', 8,
          'previousEventSha256', (SELECT payload->>'eventSha256' FROM phase14_payloads
            WHERE payload_key = 'webhook.delivering.badretry'),
          'deliveryId', '14000000-0000-4000-8000-000000000603',
          'envelopeSha256', repeat('5', 64),
          'occurredAt', '2026-08-05T13:07:00Z',
          'retryAt', '2026-08-05T13:08:01Z'
        ),
      'eventSha256'
    )
  )$test$,
  '23514'
);
SELECT pg_temp.phase14_expect_failure(
  'internal manifest validator is not public',
  $test$SELECT app.collaboration_assert_manifest(
    pg_temp.phase14_manifest(jsonb_build_object(
      'schemaVersion', 1, 'padding', repeat('x', 262145)
    ), 'manifestSha256'),
    'manifestSha256', 262144
  )$test$,
  '42501'
);
SELECT pg_temp.phase14_expect_failure(
  'direct table read by app role',
  $test$SELECT count(*) FROM app.integration_api_credentials$test$,
  '42501'
);

DO $phase14_app_reads$
DECLARE
  observed_count integer;
  observed_consumed bigint;
  observed_outstanding bigint;
  observed_revoked timestamptz;
BEGIN
  SELECT count(*) INTO observed_count FROM app.get_collaboration_record(
    '14000000-0000-4000-8000-000000000101',
    '14000000-0000-4000-8000-000000000301'
  );
  IF observed_count <> 1 THEN RAISE EXCEPTION 'exact collaboration read failed'; END IF;

  SELECT consumed_units, outstanding_units
    INTO observed_consumed, observed_outstanding
  FROM app.get_integration_quota_snapshot(
    '14000000-0000-4000-8000-000000000101',
    '14000000-0000-4000-8000-000000000501'
  );
  IF observed_consumed <> 2 OR observed_outstanding <> 0 THEN
    RAISE EXCEPTION 'quota snapshot does not reflect atomic settlement';
  END IF;

  SELECT revoked_at INTO observed_revoked
  FROM app.get_integration_extension_manifest(
    '14000000-0000-4000-8000-000000000101',
    '14000000-0000-4000-8000-000000000701', '1.0.0'
  );
  IF observed_revoked IS DISTINCT FROM '2026-08-10T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'extension exact read omitted revocation';
  END IF;

  SELECT count(*) INTO observed_count FROM app.get_integration_webhook_delivery(
    '14000000-0000-4000-8000-000000000101',
    '14000000-0000-4000-8000-000000000601',
    '14000000-0000-4000-8000-000000000602'
  ) delivery WHERE delivery.status = 'delivered' AND delivery.attempt = 2;
  IF observed_count <> 1 THEN RAISE EXCEPTION 'webhook terminal read failed'; END IF;

  SELECT count(*) INTO observed_count FROM app.get_developer_portal_entry(
    '14000000-0000-4000-8000-000000000101',
    '14000000-0000-4000-8000-000000000801'
  );
  IF observed_count <> 0 THEN
    RAISE EXCEPTION 'revoked extension remains advertised by the developer portal';
  END IF;
END
$phase14_app_reads$;

RESET ROLE;
SET LOCAL app.organization_id = '14000000-0000-4000-8000-000000000002';
SET LOCAL app.subject_id = '14000000-0000-4000-8000-000000000202';
SET LOCAL ROLE economyos_app_local;
SELECT app.register_integration_api_credential(
  '14000000-0000-4000-8000-000000000102', payload
) FROM phase14_payloads WHERE payload_key = 'credential.b';

DO $phase14_tenant_isolation$
DECLARE
  foreign_count integer;
  missing_count integer;
  local_count integer;
BEGIN
  SELECT count(*) INTO foreign_count
  FROM app.get_integration_api_credential_metadata(
    '14000000-0000-4000-8000-000000000101',
    '14000000-0000-4000-8000-000000000401'
  );
  SELECT count(*) INTO missing_count
  FROM app.get_integration_api_credential_metadata(
    '14000000-0000-4000-8000-000000000102',
    '14000000-0000-4000-8000-000000000499'
  );
  SELECT count(*) INTO local_count
  FROM app.get_integration_api_credential_metadata(
    '14000000-0000-4000-8000-000000000102',
    '14000000-0000-4000-8000-000000000401'
  );
  IF foreign_count <> 0 OR missing_count <> 0 OR local_count <> 1 THEN
    RAISE EXCEPTION 'credential exact reads enumerate or cross tenant scope';
  END IF;
END
$phase14_tenant_isolation$;
RESET ROLE;

SELECT pg_temp.phase14_expect_failure(
  'oversized manifest',
  $test$SELECT app.collaboration_assert_manifest(
    pg_temp.phase14_manifest(jsonb_build_object(
      'schemaVersion', 1, 'padding', repeat('x', 262145)
    ), 'manifestSha256'),
    'manifestSha256', 262144
  )$test$,
  '23514'
);

SELECT pg_temp.phase14_expect_failure(
  'owner update against append-only record',
  $test$UPDATE app.collaboration_record_events SET body = 'Changed'
    WHERE record_id = '14000000-0000-4000-8000-000000000301'$test$,
  '55000'
);
SELECT pg_temp.phase14_expect_failure(
  'owner delete against append-only credential',
  $test$DELETE FROM app.integration_api_credentials
    WHERE credential_id = '14000000-0000-4000-8000-000000000401'$test$,
  '55000'
);

DO $phase14_catalog_assertions$
DECLARE
  relation_name text;
  relation_oid regclass;
  getter_signature regprocedure;
  secret_column_count integer;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'app.collaboration_record_events', 'app.collaboration_record_citations',
    'app.integration_api_credentials', 'app.integration_quota_policies',
    'app.integration_quota_events', 'app.integration_webhook_endpoints',
    'app.integration_webhook_delivery_events', 'app.integration_extension_manifests',
    'app.integration_extension_certifications', 'app.integration_extension_revocations',
    'app.developer_portal_entries', 'audit.integration_events'
  ] LOOP
    relation_oid := relation_name::regclass;
    IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = relation_oid)
      OR NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = relation_oid AND NOT tgisinternal AND tgenabled = 'O'
      )
    THEN RAISE EXCEPTION '% lacks forced RLS or immutability trigger', relation_name; END IF;
    IF has_table_privilege('economyos_app', relation_oid, 'SELECT')
      OR has_table_privilege('economyos_app', relation_oid, 'INSERT')
      OR has_table_privilege('economyos_ingest', relation_oid, 'SELECT')
      OR has_table_privilege('economyos_ingest', relation_oid, 'INSERT')
    THEN RAISE EXCEPTION '% grants direct runtime table access', relation_name; END IF;
  END LOOP;

  SELECT count(*) INTO secret_column_count
  FROM information_schema.columns
  WHERE table_schema = 'app' AND table_name = 'integration_api_credentials'
    AND column_name ~ '(plaintext|password|token|secret)'
    AND column_name <> 'secret_sha256';
  IF secret_column_count <> 0 THEN
    RAISE EXCEPTION 'credential table contains plaintext-capable secret columns';
  END IF;

  FOREACH getter_signature IN ARRAY ARRAY[
    'app.get_collaboration_record(uuid,uuid)'::regprocedure,
    'app.get_integration_api_credential_metadata(uuid,uuid)'::regprocedure,
    'app.get_integration_quota_snapshot(uuid,uuid)'::regprocedure,
    'app.get_integration_webhook_delivery(uuid,uuid,uuid)'::regprocedure,
    'app.get_integration_extension_manifest(uuid,uuid,text)'::regprocedure,
    'app.get_developer_portal_entry(uuid,uuid)'::regprocedure
  ] LOOP
    IF EXISTS (
        SELECT 1
        FROM pg_proc procedure
        CROSS JOIN LATERAL aclexplode(
          coalesce(procedure.proacl, acldefault('f', procedure.proowner))
        ) privilege
        WHERE procedure.oid = getter_signature
          AND privilege.grantee = 0 AND privilege.privilege_type = 'EXECUTE'
      )
      OR has_function_privilege('economyos_ingest', getter_signature, 'EXECUTE')
      OR NOT has_function_privilege('economyos_app', getter_signature, 'EXECUTE')
    THEN RAISE EXCEPTION '% violates least privilege', getter_signature; END IF;
  END LOOP;
END
$phase14_catalog_assertions$;

ROLLBACK;
