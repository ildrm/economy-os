-- Exercise the release-monitoring serving boundary through the same restricted
-- login role used by the API. Base canonical tables remain unreadable.
BEGIN;

INSERT INTO app.organizations (id, slug, name) VALUES
  ('0a8f47ac-19fc-7c92-ae91-0242ac120001', 'release-monitor-a', 'Release monitor A'),
  ('0a8f47ac-19fc-7c92-ae91-0242ac120002', 'release-monitor-b', 'Release monitor B');
INSERT INTO app.subjects (id, issuer, external_subject, kind) VALUES
  (
    '0a8f47ac-19fc-7c92-ae91-0242ac120003',
    'https://identity.economyos.test/', 'release-monitor-a', 'human'
  ),
  (
    '0a8f47ac-19fc-7c92-ae91-0242ac120004',
    'https://identity.economyos.test/', 'release-monitor-b', 'human'
  );
INSERT INTO app.organization_memberships (
  organization_id, subject_id, role, valid_from
) VALUES
  (
    '0a8f47ac-19fc-7c92-ae91-0242ac120001',
    '0a8f47ac-19fc-7c92-ae91-0242ac120003',
    'analyst', '2026-01-01T00:00:00Z'
  ),
  (
    '0a8f47ac-19fc-7c92-ae91-0242ac120002',
    '0a8f47ac-19fc-7c92-ae91-0242ac120004',
    'analyst', '2026-01-01T00:00:00Z'
  );

INSERT INTO evidence.license_reviews (
  id, source_slug, dataset_external_key, evidence_uri, license_expression,
  intended_uses, evidence, reviewed_by, reviewed_at
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120005',
  'release-monitor-fixture', 'release.monitor.series',
  'https://example.invalid/release-monitor/license', 'TEST-RELEASE-MONITOR',
  ARRAY['view', 'api'], '{"fixture":true}', 'database verification',
  '2026-01-01T00:00:00Z'
);
INSERT INTO evidence.sources (
  id, organization_id, slug, name, authority_class, homepage_uri,
  classification, license_status, license_expression, redistribution_allowed,
  reviewed_at, license_review_id, attribution_text, permitted_actions
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120006',
  '0a8f47ac-19fc-7c92-ae91-0242ac120001',
  'release-monitor-fixture', 'Release-monitor verification source', 'customer',
  'https://example.invalid/release-monitor', 'confidential', 'approved',
  'TEST-RELEASE-MONITOR', false, '2026-01-01T00:00:00Z',
  '0a8f47ac-19fc-7c92-ae91-0242ac120005',
  'Release-monitor verification fixture.', ARRAY['view', 'api']
);
INSERT INTO evidence.source_datasets (
  id, organization_id, source_id, external_key, title, pit_quality,
  expected_frequency, release_schedule, admission_status, admitted_at
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120007',
  '0a8f47ac-19fc-7c92-ae91-0242ac120001',
  '0a8f47ac-19fc-7c92-ae91-0242ac120006',
  'release.monitor.series', 'Release-monitor verification dataset', 'true_vintage',
  'monthly',
  '{"schemaVersion":1,"releaseTimes":["2026-09-15T12:30:00.123456789Z","2026-10-15T12:30:00Z"]}',
  'approved', '2026-01-01T00:00:00Z'
);
INSERT INTO evidence.source_admission_events (
  id, organization_id, source_id, dataset_id, decision, permitted_actions,
  license_review_id, reason, decided_by, decided_at
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120008',
  '0a8f47ac-19fc-7c92-ae91-0242ac120001',
  '0a8f47ac-19fc-7c92-ae91-0242ac120006',
  '0a8f47ac-19fc-7c92-ae91-0242ac120007',
  'approved', ARRAY['view', 'api'],
  '0a8f47ac-19fc-7c92-ae91-0242ac120005',
  'Verification-only API admission.', 'database verification',
  '2026-01-01T00:00:00Z'
);
INSERT INTO evidence.geographies (id, kind, code_scheme, code, name) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120009',
  'economy', 'ECONOMYOS-TEST', 'RLM', 'Release monitor economy'
);
INSERT INTO evidence.concepts (
  id, canonical_key, name, definition, measurement_class, ontology_version
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120010',
  'economy.release.monitor', 'Release monitor',
  'Verification-only release-monitor observation.', 'direct', 'verification-1'
);
INSERT INTO evidence.series (
  id, organization_id, dataset_id, concept_id, geography_id,
  external_series_key, unit_code, frequency, data_class
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120011',
  '0a8f47ac-19fc-7c92-ae91-0242ac120001',
  '0a8f47ac-19fc-7c92-ae91-0242ac120007',
  '0a8f47ac-19fc-7c92-ae91-0242ac120010',
  '0a8f47ac-19fc-7c92-ae91-0242ac120009',
  'release.monitor.RLM', 'index_points', 'monthly', 'observed'
);
INSERT INTO evidence.raw_payloads (
  id, organization_id, dataset_id, request_uri, object_uri, media_type,
  checksum_sha256, byte_length, fetched_at, parser_name, parser_version, recorded_at
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120012',
  '0a8f47ac-19fc-7c92-ae91-0242ac120001',
  '0a8f47ac-19fc-7c92-ae91-0242ac120007',
  'https://example.invalid/release-monitor/data',
  's3://verification-only/release-monitor.json', 'application/json',
  repeat('a', 64), 42, '2026-02-01T00:00:01Z',
  'release-monitor-verification', '1', '2026-02-01T00:00:02Z'
);
INSERT INTO evidence.transformation_runs (
  id, organization_id, dataset_id, raw_payload_id, parser_name, parser_version,
  code_sha256, configuration, configuration_sha256, status,
  started_at, completed_at, workflow_id
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120013',
  '0a8f47ac-19fc-7c92-ae91-0242ac120001',
  '0a8f47ac-19fc-7c92-ae91-0242ac120007',
  '0a8f47ac-19fc-7c92-ae91-0242ac120012',
  'release-monitor-verification', '1', repeat('b', 64), '{}', repeat('c', 64),
  'succeeded', '2026-02-01T00:00:01Z', '2026-02-01T00:00:02Z',
  'verify-release-monitor'
);
INSERT INTO evidence.quality_results (
  organization_id, dataset_id, raw_payload_id, transformation_run_id,
  check_code, status, details, checked_at
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120001',
  '0a8f47ac-19fc-7c92-ae91-0242ac120007',
  '0a8f47ac-19fc-7c92-ae91-0242ac120012',
  '0a8f47ac-19fc-7c92-ae91-0242ac120013',
  'admission', 'pass', '{"fixture":true}', '2026-02-01T00:00:02Z'
);
INSERT INTO evidence.releases (
  id, organization_id, dataset_id, raw_payload_id, external_release_key,
  release_time, source_publication_time, original_release_time, availability_time,
  revision_time, pit_quality, revision_sequence, recorded_at
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120014',
  '0a8f47ac-19fc-7c92-ae91-0242ac120001',
  '0a8f47ac-19fc-7c92-ae91-0242ac120007',
  '0a8f47ac-19fc-7c92-ae91-0242ac120012', 'release-monitor-2026-02',
  '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z',
  '2026-02-01T00:00:00Z', '2026-02-01T00:00:01Z',
  '2026-02-01T00:00:00Z', 'true_vintage', 0, '2026-02-01T00:00:02Z'
);
INSERT INTO evidence.observations (
  id, organization_id, series_id, release_id, period_start, period_end,
  value_numeric, status, parser_version, recorded_at, transformation_run_id
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120015',
  '0a8f47ac-19fc-7c92-ae91-0242ac120001',
  '0a8f47ac-19fc-7c92-ae91-0242ac120011',
  '0a8f47ac-19fc-7c92-ae91-0242ac120014',
  '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z',
  42, 'final', '1', '2026-02-01T00:00:02Z',
  '0a8f47ac-19fc-7c92-ae91-0242ac120013'
);

WITH candidate AS (
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
  WHERE observation.id = '0a8f47ac-19fc-7c92-ae91-0242ac120015'
)
INSERT INTO evidence.canonical_admissions (
  id, organization_id, observation_id, transformation_run_id, release_id,
  basis, admission_manifest, admission_sha256, admitted_at
)
SELECT
  '0a8f47ac-19fc-7c92-ae91-0242ac120016',
  organization_id, observation_id, transformation_run_id, release_id,
  'legacy_verified_v1', manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  completed_at
FROM candidate;

DO $verify_release_monitor_privileges$
DECLARE
  public_execute_count integer;
BEGIN
  IF NOT has_function_privilege(
      'economyos_app_local',
      'evidence.governed_series_releases(uuid,timestamptz,timestamptz,text,integer)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'economyos_app_local',
      'evidence.governed_series_release_schedule(uuid,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_ingest',
      'evidence.governed_series_releases(uuid,timestamptz,timestamptz,text,integer)',
      'EXECUTE'
    )
    OR has_table_privilege(
      'economyos_app_local', 'evidence.canonical_admissions', 'SELECT'
    )
    OR has_table_privilege(
      'economyos_app_local',
      'evidence.canonical_admission_evidence_sets', 'SELECT'
    )
  THEN
    RAISE EXCEPTION 'release-monitor serving-function privileges are incorrect';
  END IF;

  SELECT count(*) INTO public_execute_count
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  CROSS JOIN LATERAL aclexplode(
    coalesce(procedure.proacl, acldefault('f', procedure.proowner))
  ) privilege
  WHERE namespace.nspname = 'evidence'
    AND procedure.proname IN (
      'governed_series_releases', 'governed_series_release_schedule'
    )
    AND privilege.grantee = 0
    AND privilege.privilege_type = 'EXECUTE';
  IF public_execute_count <> 0 THEN
    RAISE EXCEPTION 'release-monitor serving function remains executable by PUBLIC';
  END IF;
END
$verify_release_monitor_privileges$;

SET LOCAL ROLE economyos_app_local;
SET LOCAL app.organization_id = '0a8f47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '0a8f47ac-19fc-7c92-ae91-0242ac120003';

DO $verify_release_monitor_null_bounds$
BEGIN
  BEGIN
    PERFORM * FROM evidence.governed_series_releases(
      '0a8f47ac-19fc-7c92-ae91-0242ac120011',
      '2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z', 'api', NULL
    );
    RAISE EXCEPTION 'NULL release row bound unexpectedly bypassed validation';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM * FROM evidence.governed_series_release_schedule(
      '0a8f47ac-19fc-7c92-ae91-0242ac120011', NULL
    );
    RAISE EXCEPTION 'NULL release action unexpectedly bypassed validation';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END
$verify_release_monitor_null_bounds$;

DO $verify_restricted_release_monitor$
DECLARE
  release_count integer;
  monitored record;
  schedule record;
BEGIN
  SELECT count(*) INTO release_count
  FROM evidence.governed_series_releases(
    '0a8f47ac-19fc-7c92-ae91-0242ac120011',
    '2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z', 'api', 2
  );
  SELECT * INTO monitored
  FROM evidence.governed_series_releases(
    '0a8f47ac-19fc-7c92-ae91-0242ac120011',
    '2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z', 'api', 2
  );
  IF release_count <> 1
    OR monitored.release_id IS DISTINCT FROM
      '0a8f47ac-19fc-7c92-ae91-0242ac120014'::uuid
    OR monitored.series_id IS DISTINCT FROM
      '0a8f47ac-19fc-7c92-ae91-0242ac120011'::uuid
    OR monitored.raw_payload_id IS DISTINCT FROM
      '0a8f47ac-19fc-7c92-ae91-0242ac120012'::uuid
    OR monitored.representative_observation_id IS DISTINCT FROM
      '0a8f47ac-19fc-7c92-ae91-0242ac120015'::uuid
    OR monitored.canonical_admission_id IS DISTINCT FROM
      '0a8f47ac-19fc-7c92-ae91-0242ac120016'::uuid
    OR monitored.monitoring_time IS DISTINCT FROM '2026-02-01T00:00:00Z'::timestamptz
    OR monitored.monitoring_time_basis IS DISTINCT FROM 'source_publication_time'
    OR monitored.admission_basis IS DISTINCT FROM 'legacy_verified_v1'
    OR monitored.current_license_review_id IS DISTINCT FROM
      '0a8f47ac-19fc-7c92-ae91-0242ac120005'::uuid
    OR monitored.current_source_decision_id IS DISTINCT FROM
      '0a8f47ac-19fc-7c92-ae91-0242ac120008'::uuid
    OR monitored.admission_manifest_sha256 !~ '^[0-9a-f]{64}$'
    OR monitored.admission_evidence_sha256 !~ '^[0-9a-f]{64}$'
    OR monitored.quality_result_count <> 1
    OR monitored.evaluated_at > statement_timestamp()
  THEN
    RAISE EXCEPTION 'restricted release-monitor result was incomplete or incorrect';
  END IF;

  SELECT * INTO schedule
  FROM evidence.governed_series_release_schedule(
    '0a8f47ac-19fc-7c92-ae91-0242ac120011', 'api'
  );
  IF schedule.series_id IS DISTINCT FROM
      '0a8f47ac-19fc-7c92-ae91-0242ac120011'::uuid
    OR schedule.release_schedule_within_bound IS DISTINCT FROM true
    OR schedule.release_schedule->>'schemaVersion' <> '1'
    OR schedule.release_schedule#>>'{releaseTimes,0}'
      <> '2026-09-15T12:30:00.123456789Z'
    OR schedule.declaration_sha256 !~ '^[0-9a-f]{64}$'
    OR schedule.current_source_decision_id IS DISTINCT FROM
      '0a8f47ac-19fc-7c92-ae91-0242ac120008'::uuid
  THEN
    RAISE EXCEPTION 'restricted persisted release-schedule result was incorrect';
  END IF;

  BEGIN
    PERFORM 1 FROM evidence.releases LIMIT 1;
    RAISE EXCEPTION 'application login regained direct release-table access';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM evidence.governed_series_releases(
      '0a8f47ac-19fc-7c92-ae91-0242ac120011',
      '2026-12-31T00:00:00Z', '2026-01-01T00:00:00Z', 'api', 2
    );
    RAISE EXCEPTION 'unordered release window was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM * FROM evidence.governed_series_release_schedule(
      '0a8f47ac-19fc-7c92-ae91-0242ac120011', 'view'
    );
    RAISE EXCEPTION 'non-API schedule action was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END
$verify_restricted_release_monitor$;

SET LOCAL app.organization_id = '0a8f47ac-19fc-7c92-ae91-0242ac120002';
SET LOCAL app.subject_id = '0a8f47ac-19fc-7c92-ae91-0242ac120004';
DO $verify_cross_tenant_release_denial$
BEGIN
  IF EXISTS (
    SELECT 1 FROM evidence.governed_series_releases(
      '0a8f47ac-19fc-7c92-ae91-0242ac120011',
      '2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z', 'api', 2
    )
  ) OR EXISTS (
    SELECT 1 FROM evidence.governed_series_release_schedule(
      '0a8f47ac-19fc-7c92-ae91-0242ac120011', 'api'
    )
  ) THEN
    RAISE EXCEPTION 'foreign tenant resolved release-monitor data';
  END IF;
END
$verify_cross_tenant_release_denial$;

SET LOCAL app.organization_id = '0a8f47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '0a8f47ac-19fc-7c92-ae91-0242ac120004';
DO $verify_nonmember_release_denial$
BEGIN
  IF EXISTS (
    SELECT 1 FROM evidence.governed_series_release_schedule(
      '0a8f47ac-19fc-7c92-ae91-0242ac120011', 'api'
    )
  ) THEN
    RAISE EXCEPTION 'nonmember resolved release-monitor data';
  END IF;
END
$verify_nonmember_release_denial$;

RESET ROLE;
INSERT INTO evidence.source_admission_events (
  id, organization_id, source_id, dataset_id, decision, permitted_actions,
  license_review_id, reason, decided_by, decided_at
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120018',
  '0a8f47ac-19fc-7c92-ae91-0242ac120001',
  '0a8f47ac-19fc-7c92-ae91-0242ac120006',
  '0a8f47ac-19fc-7c92-ae91-0242ac120007',
  'suspended', ARRAY[]::text[],
  '0a8f47ac-19fc-7c92-ae91-0242ac120005',
  'Verification-only current suspension.', 'database verification',
  clock_timestamp()
);

SET LOCAL ROLE economyos_app_local;
SET LOCAL app.organization_id = '0a8f47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '0a8f47ac-19fc-7c92-ae91-0242ac120003';
DO $verify_current_legal_denial$
BEGIN
  IF EXISTS (
    SELECT 1 FROM evidence.governed_series_releases(
      '0a8f47ac-19fc-7c92-ae91-0242ac120011',
      '2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z', 'api', 2
    )
  ) OR EXISTS (
    SELECT 1 FROM evidence.governed_series_release_schedule(
      '0a8f47ac-19fc-7c92-ae91-0242ac120011', 'api'
    )
  ) THEN
    RAISE EXCEPTION 'current legal suspension did not close release monitoring';
  END IF;
END
$verify_current_legal_denial$;

RESET ROLE;
ROLLBACK;
