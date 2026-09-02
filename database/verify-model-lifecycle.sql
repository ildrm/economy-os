-- Verify effective model lifecycle history, independent approval, bitemporal
-- resolution, emergency restriction/retirement, RLS, and append-only evidence.
BEGIN;

INSERT INTO app.organizations (id, slug, name) VALUES
  ('30af47ac-19fc-7c92-ae91-0242ac120001', 'model-life-a', 'Model lifecycle A'),
  ('30af47ac-19fc-7c92-ae91-0242ac120002', 'model-life-b', 'Model lifecycle B');
INSERT INTO app.workspaces (id, organization_id, slug, name) VALUES
  (
    '30af47ac-19fc-7c92-ae91-0242ac120003',
    '30af47ac-19fc-7c92-ae91-0242ac120001', 'research', 'Research A'
  ),
  (
    '30af47ac-19fc-7c92-ae91-0242ac120004',
    '30af47ac-19fc-7c92-ae91-0242ac120002', 'research', 'Research B'
  );
INSERT INTO app.subjects (id, issuer, external_subject, kind) VALUES
  (
    '30af47ac-19fc-7c92-ae91-0242ac120005',
    'https://identity.economyos.test/', 'model-developer', 'human'
  ),
  (
    '30af47ac-19fc-7c92-ae91-0242ac120006',
    'https://identity.economyos.test/', 'independent-validator', 'human'
  ),
  (
    '30af47ac-19fc-7c92-ae91-0242ac120007',
    'https://identity.economyos.test/', 'emergency-steward', 'human'
  ),
  (
    '30af47ac-19fc-7c92-ae91-0242ac120011',
    'https://identity.economyos.test/', 'model-risk-approver', 'human'
  ),
  (
    '30af47ac-19fc-7c92-ae91-0242ac120012',
    'https://identity.economyos.test/', 'staging-approver', 'human'
  ),
  (
    '30af47ac-19fc-7c92-ae91-0242ac120013',
    'https://identity.economyos.test/', 'production-approver', 'human'
  ),
  (
    '30af47ac-19fc-7c92-ae91-0242ac120008',
    'https://identity.economyos.test/', 'foreign-validator', 'human'
  );
INSERT INTO app.organization_memberships (
  organization_id, subject_id, role, valid_from
) VALUES
  (
    '30af47ac-19fc-7c92-ae91-0242ac120001',
    '30af47ac-19fc-7c92-ae91-0242ac120005', 'validator', '2026-01-01T00:00:00Z'
  ),
  (
    '30af47ac-19fc-7c92-ae91-0242ac120001',
    '30af47ac-19fc-7c92-ae91-0242ac120006', 'validator', '2026-01-01T00:00:00Z'
  ),
  (
    '30af47ac-19fc-7c92-ae91-0242ac120001',
    '30af47ac-19fc-7c92-ae91-0242ac120007', 'steward', '2026-01-01T00:00:00Z'
  ),
  (
    '30af47ac-19fc-7c92-ae91-0242ac120001',
    '30af47ac-19fc-7c92-ae91-0242ac120011', 'validator', '2026-01-01T00:00:00Z'
  ),
  (
    '30af47ac-19fc-7c92-ae91-0242ac120001',
    '30af47ac-19fc-7c92-ae91-0242ac120012', 'validator', '2026-01-01T00:00:00Z'
  ),
  (
    '30af47ac-19fc-7c92-ae91-0242ac120001',
    '30af47ac-19fc-7c92-ae91-0242ac120013', 'validator', '2026-01-01T00:00:00Z'
  ),
  (
    '30af47ac-19fc-7c92-ae91-0242ac120002',
    '30af47ac-19fc-7c92-ae91-0242ac120008', 'validator', '2026-01-01T00:00:00Z'
  );
INSERT INTO app.workspace_memberships (
  organization_id, workspace_id, subject_id, role, valid_from
) VALUES
  (
    '30af47ac-19fc-7c92-ae91-0242ac120001',
    '30af47ac-19fc-7c92-ae91-0242ac120003',
    '30af47ac-19fc-7c92-ae91-0242ac120005', 'validator', '2026-01-01T00:00:00Z'
  ),
  (
    '30af47ac-19fc-7c92-ae91-0242ac120001',
    '30af47ac-19fc-7c92-ae91-0242ac120003',
    '30af47ac-19fc-7c92-ae91-0242ac120006', 'validator', '2026-01-01T00:00:00Z'
  ),
  (
    '30af47ac-19fc-7c92-ae91-0242ac120001',
    '30af47ac-19fc-7c92-ae91-0242ac120003',
    '30af47ac-19fc-7c92-ae91-0242ac120007', 'steward', '2026-01-01T00:00:00Z'
  ),
  (
    '30af47ac-19fc-7c92-ae91-0242ac120001',
    '30af47ac-19fc-7c92-ae91-0242ac120003',
    '30af47ac-19fc-7c92-ae91-0242ac120011', 'validator', '2026-01-01T00:00:00Z'
  ),
  (
    '30af47ac-19fc-7c92-ae91-0242ac120001',
    '30af47ac-19fc-7c92-ae91-0242ac120003',
    '30af47ac-19fc-7c92-ae91-0242ac120012', 'validator', '2026-01-01T00:00:00Z'
  ),
  (
    '30af47ac-19fc-7c92-ae91-0242ac120001',
    '30af47ac-19fc-7c92-ae91-0242ac120003',
    '30af47ac-19fc-7c92-ae91-0242ac120013', 'validator', '2026-01-01T00:00:00Z'
  ),
  (
    '30af47ac-19fc-7c92-ae91-0242ac120002',
    '30af47ac-19fc-7c92-ae91-0242ac120004',
    '30af47ac-19fc-7c92-ae91-0242ac120008', 'validator', '2026-01-01T00:00:00Z'
  );

SET LOCAL app.organization_id = '30af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '30af47ac-19fc-7c92-ae91-0242ac120005';

WITH artifact_input AS (
  SELECT * FROM (VALUES
    (
      '30af47ac-19fc-7c92-ae91-0242ac120009'::uuid,
      '30af47ac-19fc-7c92-ae91-0242ac120001'::uuid,
      '30af47ac-19fc-7c92-ae91-0242ac120003'::uuid,
      'phase3.lifecycle.a'::text,
      '30af47ac-19fc-7c92-ae91-0242ac120005'::uuid
    )
  ) value(id, organization_id, workspace_id, artifact_key, created_by)
), manifested AS (
  SELECT artifact_input.*, jsonb_build_object(
    'schemaVersion', 1,
    'id', id::text,
    'key', artifact_key,
    'version', '1.0.0',
    'lifecycleStatus', 'research',
    'algorithm', jsonb_build_object('key', 'phase3.lifecycle', 'version', '1.0.0'),
    'codeCommitSha256', repeat('a', 64),
    'packageLockSha256', repeat('b', 64),
    'sbomSha256', repeat('c', 64),
    'environmentSha256', repeat('d', 64),
    'configurationSha256', repeat('e', 64),
    'normalizationSha256', repeat('a', 64),
    'assumptionsSha256', repeat('b', 64),
    'approvalSha256', repeat('c', 64)
  ) AS manifest
  FROM artifact_input
)
INSERT INTO evidence.economic_state_model_artifacts (
  id, organization_id, workspace_id, artifact_key, artifact_version,
  lifecycle_status, algorithm_key, algorithm_version,
  code_commit_sha256, package_lock_sha256, sbom_sha256,
  environment_sha256, configuration_sha256, normalization_sha256,
  assumptions_sha256, approval_sha256, artifact_manifest, artifact_sha256,
  created_by, created_at
)
SELECT
  id, organization_id, workspace_id, artifact_key, '1.0.0',
  'research', 'phase3.lifecycle', '1.0.0',
  repeat('a', 64), repeat('b', 64), repeat('c', 64),
  repeat('d', 64), repeat('e', 64), repeat('a', 64),
  repeat('b', 64), repeat('c', 64), manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  created_by, '2026-08-01T00:00:00Z'
FROM manifested;

SET LOCAL app.organization_id = '30af47ac-19fc-7c92-ae91-0242ac120002';
SET LOCAL app.subject_id = '30af47ac-19fc-7c92-ae91-0242ac120008';
WITH manifested AS (
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'id', '30af47ac-19fc-7c92-ae91-0242ac120010',
    'key', 'phase3.lifecycle.b',
    'version', '1.0.0',
    'lifecycleStatus', 'research',
    'algorithm', jsonb_build_object('key', 'phase3.lifecycle', 'version', '1.0.0'),
    'codeCommitSha256', repeat('a', 64),
    'packageLockSha256', repeat('b', 64),
    'sbomSha256', repeat('c', 64),
    'environmentSha256', repeat('d', 64),
    'configurationSha256', repeat('e', 64),
    'normalizationSha256', repeat('a', 64),
    'assumptionsSha256', repeat('b', 64),
    'approvalSha256', repeat('c', 64)
  ) AS manifest
)
INSERT INTO evidence.economic_state_model_artifacts (
  id, organization_id, workspace_id, artifact_key, artifact_version,
  lifecycle_status, algorithm_key, algorithm_version,
  code_commit_sha256, package_lock_sha256, sbom_sha256,
  environment_sha256, configuration_sha256, normalization_sha256,
  assumptions_sha256, approval_sha256, artifact_manifest, artifact_sha256,
  created_by, created_at
)
SELECT
  '30af47ac-19fc-7c92-ae91-0242ac120010',
  '30af47ac-19fc-7c92-ae91-0242ac120002',
  '30af47ac-19fc-7c92-ae91-0242ac120004',
  'phase3.lifecycle.b', '1.0.0', 'research', 'phase3.lifecycle', '1.0.0',
  repeat('a', 64), repeat('b', 64), repeat('c', 64),
  repeat('d', 64), repeat('e', 64), repeat('a', 64),
  repeat('b', 64), repeat('c', 64), manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  '30af47ac-19fc-7c92-ae91-0242ac120008', '2026-08-01T00:00:00Z'
FROM manifested;

SET LOCAL app.organization_id = '30af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '30af47ac-19fc-7c92-ae91-0242ac120005';

DO $verify_initial_lifecycle$
DECLARE
  invalid_count integer;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM evidence.economic_state_model_lifecycle_events event
  WHERE event.model_artifact_id IN (
    '30af47ac-19fc-7c92-ae91-0242ac120009',
    '30af47ac-19fc-7c92-ae91-0242ac120010'
  ) AND (
    event.from_status IS NOT NULL OR event.to_status <> 'research'
    OR event.emergency OR event.decision_manifest->>'toStatus' <> 'research'
    OR event.decision_sha256 <> encode(digest(convert_to(
      evidence.canonical_json(event.decision_manifest), 'UTF8'
    ), 'sha256'), 'hex')
  );
  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'artifact creation did not produce valid initial lifecycle evidence';
  END IF;
END
$verify_initial_lifecycle$;

SET LOCAL ROLE economyos_app_local;
SET LOCAL app.organization_id = '30af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '30af47ac-19fc-7c92-ae91-0242ac120005';

DO $verify_developer_segregation$
BEGIN
  BEGIN
    PERFORM evidence.record_economic_state_model_lifecycle_event(
      '30af47ac-19fc-7c92-ae91-0242ac120009', 'validated', false,
      'Developer self-validation must be rejected.', repeat('d', 64),
      '2026-08-02T00:00:00Z'
    );
    RAISE EXCEPTION 'model developer unexpectedly self-validated';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_developer_segregation$;

SET LOCAL app.subject_id = '30af47ac-19fc-7c92-ae91-0242ac120006';
SELECT evidence.record_economic_state_model_lifecycle_event(
  '30af47ac-19fc-7c92-ae91-0242ac120009', 'validated', false,
  'Independent chronological validation completed.', repeat('d', 64),
  '2026-08-02T00:00:00Z'
);

DO $verify_validator_cannot_approve$
BEGIN
  BEGIN
    PERFORM evidence.record_economic_state_model_lifecycle_event(
      '30af47ac-19fc-7c92-ae91-0242ac120009', 'approved', false,
      'Validator self-approval must be rejected.', repeat('e', 64),
      '2026-08-03T00:00:00Z'
    );
    RAISE EXCEPTION 'validator unexpectedly approved their own validation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_validator_cannot_approve$;

SET LOCAL app.subject_id = '30af47ac-19fc-7c92-ae91-0242ac120011';
SELECT evidence.record_economic_state_model_lifecycle_event(
  '30af47ac-19fc-7c92-ae91-0242ac120009', 'approved', false,
  'Independent model-risk approval completed.', repeat('e', 64),
  '2026-08-03T00:00:00Z'
);

DO $verify_approver_cannot_stage$
BEGIN
  BEGIN
    PERFORM evidence.record_economic_state_model_lifecycle_event(
      '30af47ac-19fc-7c92-ae91-0242ac120009', 'staged', false,
      'Risk approver staging promotion must be rejected.', repeat('a', 64),
      '2026-08-04T00:00:00Z'
    );
    RAISE EXCEPTION 'risk approver unexpectedly approved staging';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_approver_cannot_stage$;

SET LOCAL app.subject_id = '30af47ac-19fc-7c92-ae91-0242ac120012';
SELECT evidence.record_economic_state_model_lifecycle_event(
  '30af47ac-19fc-7c92-ae91-0242ac120009', 'staged', false,
  'Independent staging deployment approval completed.', repeat('a', 64),
  '2026-08-04T00:00:00Z'
);

DO $verify_stager_cannot_produce$
BEGIN
  BEGIN
    PERFORM evidence.record_economic_state_model_lifecycle_event(
      '30af47ac-19fc-7c92-ae91-0242ac120009', 'production', false,
      'Staging approver production promotion must be rejected.', repeat('b', 64),
      '2026-08-05T00:00:00Z'
    );
    RAISE EXCEPTION 'staging approver unexpectedly approved production';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_stager_cannot_produce$;

SET LOCAL app.subject_id = '30af47ac-19fc-7c92-ae91-0242ac120013';
SELECT evidence.record_economic_state_model_lifecycle_event(
  '30af47ac-19fc-7c92-ae91-0242ac120009', 'production', false,
  'Independent production deployment approval completed.', repeat('b', 64),
  '2026-08-05T00:00:00Z'
);

DO $verify_bitemporal_resolution$
DECLARE
  resolved_status text;
  approved_event evidence.economic_state_model_lifecycle_events%ROWTYPE;
BEGIN
  SELECT status INTO resolved_status
  FROM evidence.economic_state_artifact_lifecycle_at(
    '30af47ac-19fc-7c92-ae91-0242ac120009',
    '2026-08-02T12:00:00Z', '2099-01-01T00:00:00Z'
  );
  IF resolved_status <> 'validated' THEN
    RAISE EXCEPTION 'valid-time lifecycle resolution failed: %', resolved_status;
  END IF;
  SELECT * INTO STRICT approved_event
  FROM evidence.economic_state_model_lifecycle_events event
  WHERE event.model_artifact_id = '30af47ac-19fc-7c92-ae91-0242ac120009'
    AND event.to_status = 'approved';
  SELECT status INTO resolved_status
  FROM evidence.economic_state_artifact_lifecycle_at(
    '30af47ac-19fc-7c92-ae91-0242ac120009',
    '2026-08-04T00:00:00Z',
    approved_event.recorded_at - interval '1 microsecond'
  );
  IF resolved_status <> 'validated' THEN
    RAISE EXCEPTION 'system-time lifecycle resolution failed: %', resolved_status;
  END IF;
END
$verify_bitemporal_resolution$;

SET LOCAL app.subject_id = '30af47ac-19fc-7c92-ae91-0242ac120007';
SELECT evidence.record_economic_state_model_lifecycle_event(
  '30af47ac-19fc-7c92-ae91-0242ac120009', 'restricted', true,
  'Emergency restriction after monitoring threshold breach.', repeat('a', 64),
  clock_timestamp()
);

DO $verify_steward_cannot_reenable$
BEGIN
  BEGIN
    PERFORM evidence.record_economic_state_model_lifecycle_event(
      '30af47ac-19fc-7c92-ae91-0242ac120009', 'approved', false,
      'Unauthorized steward re-enable must be rejected.', repeat('b', 64),
      clock_timestamp()
    );
    RAISE EXCEPTION 'steward unexpectedly re-enabled a restricted model';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_steward_cannot_reenable$;

SET LOCAL app.subject_id = '30af47ac-19fc-7c92-ae91-0242ac120013';
SELECT evidence.record_economic_state_model_lifecycle_event(
  '30af47ac-19fc-7c92-ae91-0242ac120009', 'production', false,
  'Documented independent remediation review completed.', repeat('b', 64),
  clock_timestamp()
);

SET LOCAL app.subject_id = '30af47ac-19fc-7c92-ae91-0242ac120007';
SELECT evidence.record_economic_state_model_lifecycle_event(
  '30af47ac-19fc-7c92-ae91-0242ac120009', 'retired', true,
  'Emergency retirement after non-remediable governance breach.', repeat('c', 64),
  clock_timestamp()
);

SET LOCAL app.subject_id = '30af47ac-19fc-7c92-ae91-0242ac120013';
DO $verify_terminal_and_tenant_isolation$
DECLARE
  visible_count integer;
  foreign_count integer;
  current_status text;
BEGIN
  SELECT count(*) INTO visible_count
  FROM evidence.economic_state_model_lifecycle_events;
  IF visible_count <> 8 THEN
    RAISE EXCEPTION 'expected eight visible tenant-A lifecycle events, got %', visible_count;
  END IF;
  SELECT count(*) INTO foreign_count
  FROM evidence.economic_state_artifact_lifecycle_at(
    '30af47ac-19fc-7c92-ae91-0242ac120010',
    statement_timestamp(), statement_timestamp()
  );
  IF foreign_count <> 0 THEN
    RAISE EXCEPTION 'foreign-tenant artifact lifecycle was resolved';
  END IF;
  SELECT status INTO current_status
  FROM evidence.economic_state_artifact_lifecycle_at(
    '30af47ac-19fc-7c92-ae91-0242ac120009',
    statement_timestamp(), statement_timestamp()
  );
  IF current_status <> 'retired' THEN
    RAISE EXCEPTION 'emergency retirement was not immediately effective: %', current_status;
  END IF;
  BEGIN
    PERFORM evidence.record_economic_state_model_lifecycle_event(
      '30af47ac-19fc-7c92-ae91-0242ac120009', 'research', false,
      'Retired lifecycle must remain terminal forever.', repeat('d', 64),
      clock_timestamp()
    );
    RAISE EXCEPTION 'retired model unexpectedly transitioned';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM evidence.record_economic_state_model_lifecycle_event(
      '30af47ac-19fc-7c92-ae91-0242ac120010', 'validated', false,
      'Foreign tenant transition must be rejected.', repeat('d', 64),
      clock_timestamp()
    );
    RAISE EXCEPTION 'foreign-tenant lifecycle transition unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_terminal_and_tenant_isolation$;

DO $verify_lifecycle_least_privilege$
BEGIN
  IF has_table_privilege(
      'economyos_app_local',
      'evidence.economic_state_model_lifecycle_events', 'INSERT'
    )
    OR has_table_privilege(
      'economyos_app_local',
      'evidence.economic_state_model_lifecycle_events', 'UPDATE'
    )
    OR has_table_privilege(
      'economyos_ingest_local',
      'evidence.economic_state_model_lifecycle_events', 'SELECT'
    )
    OR NOT has_function_privilege(
      'economyos_app_local',
      'evidence.record_economic_state_model_lifecycle_event(uuid,text,boolean,text,text,timestamptz)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_ingest_local',
      'evidence.record_economic_state_model_lifecycle_event(uuid,text,boolean,text,text,timestamptz)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'model lifecycle least-privilege boundary is incorrect';
  END IF;
END
$verify_lifecycle_least_privilege$;

RESET ROLE;
DO $verify_lifecycle_append_only$
BEGIN
  BEGIN
    UPDATE evidence.economic_state_model_lifecycle_events
    SET reason = 'Attempted mutation of lifecycle evidence.'
    WHERE model_artifact_id = '30af47ac-19fc-7c92-ae91-0242ac120009';
    RAISE EXCEPTION 'lifecycle evidence mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END
$verify_lifecycle_append_only$;

ROLLBACK;
