-- Verify event-sourced subscriptions and the narrow durable notification
-- workflow boundary with active/current rechecks, replay, RLS, and immutability.
BEGIN;

INSERT INTO app.organizations (id, slug, name) VALUES
  ('31af47ac-19fc-7c92-ae91-0242ac120001', 'notify-a', 'Notification A'),
  ('31af47ac-19fc-7c92-ae91-0242ac120002', 'notify-b', 'Notification B');
INSERT INTO app.workspaces (id, organization_id, slug, name) VALUES
  (
    '31af47ac-19fc-7c92-ae91-0242ac120003',
    '31af47ac-19fc-7c92-ae91-0242ac120001', 'research', 'Research A'
  ),
  (
    '31af47ac-19fc-7c92-ae91-0242ac120004',
    '31af47ac-19fc-7c92-ae91-0242ac120002', 'research', 'Research B'
  );
INSERT INTO app.subjects (id, issuer, external_subject, kind) VALUES
  (
    '31af47ac-19fc-7c92-ae91-0242ac120005',
    'https://identity.economyos.test/', 'notification-a-one', 'human'
  ),
  (
    '31af47ac-19fc-7c92-ae91-0242ac120006',
    'https://identity.economyos.test/', 'notification-a-two', 'human'
  ),
  (
    '31af47ac-19fc-7c92-ae91-0242ac120024',
    'https://identity.economyos.test/', 'notification-a-three', 'human'
  ),
  (
    '31af47ac-19fc-7c92-ae91-0242ac120026',
    'https://identity.economyos.test/', 'notification-a-late', 'human'
  ),
  (
    '31af47ac-19fc-7c92-ae91-0242ac120007',
    'https://identity.economyos.test/', 'notification-b', 'human'
  );
INSERT INTO app.organization_memberships (
  organization_id, subject_id, role, valid_from
) VALUES
  (
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120005', 'analyst', '2026-01-01T00:00:00Z'
  ),
  (
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120006', 'analyst', '2026-01-01T00:00:00Z'
  ),
  (
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120024', 'analyst', '2026-01-01T00:00:00Z'
  ),
  (
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120026', 'analyst', '2026-01-01T00:00:00Z'
  ),
  (
    '31af47ac-19fc-7c92-ae91-0242ac120002',
    '31af47ac-19fc-7c92-ae91-0242ac120007', 'analyst', '2026-01-01T00:00:00Z'
  );
INSERT INTO app.workspace_memberships (
  organization_id, workspace_id, subject_id, role, valid_from
) VALUES
  (
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120003',
    '31af47ac-19fc-7c92-ae91-0242ac120005', 'analyst', '2026-01-01T00:00:00Z'
  ),
  (
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120003',
    '31af47ac-19fc-7c92-ae91-0242ac120006', 'analyst', '2026-01-01T00:00:00Z'
  ),
  (
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120003',
    '31af47ac-19fc-7c92-ae91-0242ac120024', 'analyst', '2026-01-01T00:00:00Z'
  ),
  (
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120003',
    '31af47ac-19fc-7c92-ae91-0242ac120026', 'analyst', '2026-01-01T00:00:00Z'
  ),
  (
    '31af47ac-19fc-7c92-ae91-0242ac120002',
    '31af47ac-19fc-7c92-ae91-0242ac120004',
    '31af47ac-19fc-7c92-ae91-0242ac120007', 'analyst', '2026-01-01T00:00:00Z'
  );

INSERT INTO evidence.license_reviews (
  id, source_slug, dataset_external_key, evidence_uri, license_expression,
  intended_uses, evidence, reviewed_by, reviewed_at
) VALUES (
  '31af47ac-19fc-7c92-ae91-0242ac120008',
  'notification-fixture', 'notification.series',
  'https://example.invalid/notification/license', 'TEST-NOTIFICATION',
  ARRAY['view', 'api'], '{"fixture":true}', 'database verification',
  '2026-01-01T00:00:00Z'
);
INSERT INTO evidence.sources (
  id, organization_id, slug, name, authority_class, homepage_uri,
  classification, license_status, license_expression, redistribution_allowed,
  reviewed_at, license_review_id, attribution_text, permitted_actions
) VALUES (
  '31af47ac-19fc-7c92-ae91-0242ac120009',
  '31af47ac-19fc-7c92-ae91-0242ac120001',
  'notification-fixture', 'Notification verification source', 'customer',
  'https://example.invalid/notification', 'confidential', 'approved',
  'TEST-NOTIFICATION', false, '2026-01-01T00:00:00Z',
  '31af47ac-19fc-7c92-ae91-0242ac120008',
  'Notification verification fixture.', ARRAY['view', 'api']
);
INSERT INTO evidence.source_datasets (
  id, organization_id, source_id, external_key, title, pit_quality,
  expected_frequency, release_schedule, admission_status, admitted_at
) VALUES (
  '31af47ac-19fc-7c92-ae91-0242ac120010',
  '31af47ac-19fc-7c92-ae91-0242ac120001',
  '31af47ac-19fc-7c92-ae91-0242ac120009',
  'notification.series', 'Notification verification dataset', 'true_vintage',
  'monthly', '{}', 'approved', '2026-01-01T00:00:00Z'
);
INSERT INTO evidence.source_admission_events (
  id, organization_id, source_id, dataset_id, decision, permitted_actions,
  license_review_id, reason, decided_by, decided_at
) VALUES (
  '31af47ac-19fc-7c92-ae91-0242ac120011',
  '31af47ac-19fc-7c92-ae91-0242ac120001',
  '31af47ac-19fc-7c92-ae91-0242ac120009',
  '31af47ac-19fc-7c92-ae91-0242ac120010',
  'approved', ARRAY['view', 'api'],
  '31af47ac-19fc-7c92-ae91-0242ac120008',
  'Verification-only API admission.', 'database verification',
  '2026-01-01T00:00:00Z'
);
INSERT INTO evidence.geographies (id, kind, code_scheme, code, name) VALUES (
  '31af47ac-19fc-7c92-ae91-0242ac120012',
  'economy', 'ECONOMYOS-TEST', 'NTF', 'Notification economy'
);
INSERT INTO evidence.concepts (
  id, canonical_key, name, definition, measurement_class, ontology_version
) VALUES (
  '31af47ac-19fc-7c92-ae91-0242ac120013',
  'economy.notification.fixture', 'Notification fixture',
  'Verification-only notification observation.', 'direct', 'verification-1'
);
INSERT INTO evidence.series (
  id, organization_id, dataset_id, concept_id, geography_id,
  external_series_key, unit_code, frequency, data_class
) VALUES
  (
    '31af47ac-19fc-7c92-ae91-0242ac120014',
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120010',
    '31af47ac-19fc-7c92-ae91-0242ac120013',
    '31af47ac-19fc-7c92-ae91-0242ac120012',
    'notification.NTF', 'index_points', 'monthly', 'observed'
  ),
  (
    '31af47ac-19fc-7c92-ae91-0242ac120040',
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120010',
    '31af47ac-19fc-7c92-ae91-0242ac120013',
    '31af47ac-19fc-7c92-ae91-0242ac120012',
    'notification.NTF.secondary', 'index_points', 'monthly', 'observed'
  );
INSERT INTO evidence.raw_payloads (
  id, organization_id, dataset_id, request_uri, object_uri, media_type,
  checksum_sha256, byte_length, fetched_at, parser_name, parser_version, recorded_at
) VALUES (
  '31af47ac-19fc-7c92-ae91-0242ac120015',
  '31af47ac-19fc-7c92-ae91-0242ac120001',
  '31af47ac-19fc-7c92-ae91-0242ac120010',
  'https://example.invalid/notification/data',
  's3://verification-only/notification.json', 'application/json',
  repeat('a', 64), 42, '2026-02-01T00:00:01Z',
  'notification-verification', '1', '2026-02-01T00:00:02Z'
);
INSERT INTO evidence.transformation_runs (
  id, organization_id, dataset_id, raw_payload_id, parser_name, parser_version,
  code_sha256, configuration, configuration_sha256, status,
  started_at, completed_at, workflow_id
) VALUES (
  '31af47ac-19fc-7c92-ae91-0242ac120016',
  '31af47ac-19fc-7c92-ae91-0242ac120001',
  '31af47ac-19fc-7c92-ae91-0242ac120010',
  '31af47ac-19fc-7c92-ae91-0242ac120015',
  'notification-verification', '1', repeat('b', 64), '{}', repeat('c', 64),
  'succeeded', '2026-02-01T00:00:01Z', '2026-02-01T00:00:02Z',
  'verify-release-notification'
);
INSERT INTO evidence.quality_results (
  organization_id, dataset_id, raw_payload_id, transformation_run_id,
  check_code, status, details, checked_at
) VALUES (
  '31af47ac-19fc-7c92-ae91-0242ac120001',
  '31af47ac-19fc-7c92-ae91-0242ac120010',
  '31af47ac-19fc-7c92-ae91-0242ac120015',
  '31af47ac-19fc-7c92-ae91-0242ac120016',
  'admission', 'pass', '{"fixture":true}', '2026-02-01T00:00:02Z'
);
INSERT INTO evidence.releases (
  id, organization_id, dataset_id, raw_payload_id, external_release_key,
  release_time, source_publication_time, original_release_time, availability_time,
  revision_time, pit_quality, revision_sequence, recorded_at
) VALUES (
  '31af47ac-19fc-7c92-ae91-0242ac120017',
  '31af47ac-19fc-7c92-ae91-0242ac120001',
  '31af47ac-19fc-7c92-ae91-0242ac120010',
  '31af47ac-19fc-7c92-ae91-0242ac120015', 'notification-2026-02',
  '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z',
  '2026-02-01T00:00:00Z', '2026-02-01T00:00:01Z',
  '2026-02-01T00:00:00Z', 'true_vintage', 0, '2026-02-01T00:00:02Z'
);
INSERT INTO evidence.observations (
  id, organization_id, series_id, release_id, period_start, period_end,
  value_numeric, status, parser_version, recorded_at, transformation_run_id
) VALUES
  (
    '31af47ac-19fc-7c92-ae91-0242ac120018',
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120014',
    '31af47ac-19fc-7c92-ae91-0242ac120017',
    '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z',
    42, 'final', '1', '2026-02-01T00:00:02Z',
    '31af47ac-19fc-7c92-ae91-0242ac120016'
  ),
  (
    '31af47ac-19fc-7c92-ae91-0242ac120041',
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120040',
    '31af47ac-19fc-7c92-ae91-0242ac120017',
    '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z',
    84, 'final', '1', '2026-02-01T00:00:02Z',
    '31af47ac-19fc-7c92-ae91-0242ac120016'
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
  WHERE observation.id = '31af47ac-19fc-7c92-ae91-0242ac120018'
)
INSERT INTO evidence.canonical_admissions (
  id, organization_id, observation_id, transformation_run_id, release_id,
  basis, admission_manifest, admission_sha256, admitted_at
)
SELECT
  '31af47ac-19fc-7c92-ae91-0242ac120019',
  organization_id, observation_id, transformation_run_id, release_id,
  'legacy_verified_v1', manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  completed_at
FROM candidate;

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
  WHERE observation.id = '31af47ac-19fc-7c92-ae91-0242ac120041'
)
INSERT INTO evidence.canonical_admissions (
  id, organization_id, observation_id, transformation_run_id, release_id,
  basis, admission_manifest, admission_sha256, admitted_at
)
SELECT
  '31af47ac-19fc-7c92-ae91-0242ac120042',
  organization_id, observation_id, transformation_run_id, release_id,
  'legacy_verified_v1', manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  completed_at
FROM candidate;

-- These four subscriptions across two series genuinely existed in both valid
-- time and system time before the release. A fifth subscription below is backdated only in
-- valid time and must be excluded because it was recorded after the release.
INSERT INTO app.release_subscriptions (
  id, organization_id, workspace_id, series_id, subject_id,
  channel, created_by, created_at
) VALUES
  (
    '31af47ac-19fc-7c92-ae91-0242ac120020',
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120003',
    '31af47ac-19fc-7c92-ae91-0242ac120014',
    '31af47ac-19fc-7c92-ae91-0242ac120005', 'in_app',
    '31af47ac-19fc-7c92-ae91-0242ac120005', '2026-01-15T00:00:00Z'
  ),
  (
    '31af47ac-19fc-7c92-ae91-0242ac120021',
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120003',
    '31af47ac-19fc-7c92-ae91-0242ac120014',
    '31af47ac-19fc-7c92-ae91-0242ac120006', 'in_app',
    '31af47ac-19fc-7c92-ae91-0242ac120006', '2026-01-15T00:00:00Z'
  ),
  (
    '31af47ac-19fc-7c92-ae91-0242ac120022',
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120003',
    '31af47ac-19fc-7c92-ae91-0242ac120014',
    '31af47ac-19fc-7c92-ae91-0242ac120024', 'in_app',
    '31af47ac-19fc-7c92-ae91-0242ac120024', '2026-01-15T00:00:00Z'
  ),
  (
    '31af47ac-19fc-7c92-ae91-0242ac120043',
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120003',
    '31af47ac-19fc-7c92-ae91-0242ac120040',
    '31af47ac-19fc-7c92-ae91-0242ac120005', 'in_app',
    '31af47ac-19fc-7c92-ae91-0242ac120005', '2026-01-15T00:00:00Z'
  );

WITH event_input AS (
  SELECT * FROM (VALUES
    (
      '31af47ac-19fc-7c92-ae91-0242ac120030'::uuid,
      '31af47ac-19fc-7c92-ae91-0242ac120020'::uuid,
      '31af47ac-19fc-7c92-ae91-0242ac120005'::uuid
    ),
    (
      '31af47ac-19fc-7c92-ae91-0242ac120031'::uuid,
      '31af47ac-19fc-7c92-ae91-0242ac120021'::uuid,
      '31af47ac-19fc-7c92-ae91-0242ac120006'::uuid
    ),
    (
      '31af47ac-19fc-7c92-ae91-0242ac120032'::uuid,
      '31af47ac-19fc-7c92-ae91-0242ac120022'::uuid,
      '31af47ac-19fc-7c92-ae91-0242ac120024'::uuid
    ),
    (
      '31af47ac-19fc-7c92-ae91-0242ac120044'::uuid,
      '31af47ac-19fc-7c92-ae91-0242ac120043'::uuid,
      '31af47ac-19fc-7c92-ae91-0242ac120005'::uuid
    )
  ) value(event_id, subscription_id, subject_id)
), manifested AS (
  SELECT event_input.*, app.release_subscription_event_manifest(
    event_id, subscription_id, subject_id, NULL, true,
    'Subscribed before release publication.', subject_id,
    '2026-01-15T00:00:00.000000Z', '2026-01-15T00:00:00Z'
  ) AS manifest
  FROM event_input
)
INSERT INTO app.release_subscription_events (
  id, organization_id, workspace_id, subscription_id, subject_id,
  prior_event_id, active, reason, actor_subject_id, occurred_at, recorded_at,
  event_manifest, event_sha256
)
SELECT
  event_id, '31af47ac-19fc-7c92-ae91-0242ac120001',
  '31af47ac-19fc-7c92-ae91-0242ac120003', subscription_id, subject_id,
  NULL, true, 'Subscribed before release publication.', subject_id,
  '2026-01-15T00:00:00Z', '2026-01-15T00:00:00Z', manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex')
FROM manifested;

CREATE TEMP TABLE notification_verification_context (
  workflow_id uuid NOT NULL,
  release_sha256 text NOT NULL,
  input_sha256 text NOT NULL,
  candidates jsonb,
  delivery_one jsonb,
  delivery_two jsonb,
  delivery_three jsonb,
  output_manifest jsonb
) ON COMMIT DROP;
WITH bound AS (
  SELECT admission.admission_sha256 AS release_sha256
  FROM evidence.canonical_admissions admission
  WHERE admission.id = '31af47ac-19fc-7c92-ae91-0242ac120019'
), input AS (
  SELECT bound.release_sha256,
    evidence.release_notification_input_manifest(
      '31af47ac-19fc-7c92-ae91-0242ac120001',
      '31af47ac-19fc-7c92-ae91-0242ac120003',
      '31af47ac-19fc-7c92-ae91-0242ac120014',
      '31af47ac-19fc-7c92-ae91-0242ac120017',
      '2026-02-01T00:00:00Z', bound.release_sha256
    ) AS manifest
  FROM bound
)
INSERT INTO notification_verification_context (
  workflow_id, release_sha256, input_sha256
)
SELECT
  'eda58ce3-7ec8-88ea-8181-8fea769fc18b', release_sha256,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex')
FROM input;
GRANT SELECT, UPDATE ON notification_verification_context
  TO economyos_app_local, economyos_ingest_local;

CREATE TEMP TABLE notification_second_series_context (
  workflow_id uuid NOT NULL,
  release_sha256 text NOT NULL,
  input_sha256 text NOT NULL,
  delivery jsonb,
  output_manifest jsonb
) ON COMMIT DROP;
WITH bound AS (
  SELECT admission.admission_sha256 AS release_sha256
  FROM evidence.canonical_admissions admission
  WHERE admission.id = '31af47ac-19fc-7c92-ae91-0242ac120042'
), input AS (
  SELECT bound.release_sha256,
    evidence.release_notification_input_manifest(
      '31af47ac-19fc-7c92-ae91-0242ac120001',
      '31af47ac-19fc-7c92-ae91-0242ac120003',
      '31af47ac-19fc-7c92-ae91-0242ac120040',
      '31af47ac-19fc-7c92-ae91-0242ac120017',
      '2026-02-01T00:00:00Z', bound.release_sha256
    ) AS manifest
  FROM bound
)
INSERT INTO notification_second_series_context (
  workflow_id, release_sha256, input_sha256
)
SELECT
  evidence.deterministic_uuid_v8(
    'economyos:release-notification-workflow:v1',
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120003',
    '31af47ac-19fc-7c92-ae91-0242ac120040',
    '31af47ac-19fc-7c92-ae91-0242ac120017'
  ),
  release_sha256,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex')
FROM input;
GRANT SELECT, UPDATE ON notification_second_series_context
  TO economyos_ingest_local;

DO $verify_notification_privileges$
BEGIN
  IF has_table_privilege(
      'economyos_app_local', 'app.release_subscriptions', 'SELECT'
    )
    OR has_table_privilege(
      'economyos_ingest_local', 'evidence.release_notification_runs', 'SELECT'
    )
    OR has_table_privilege(
      'economyos_ingest_local', 'evidence.release_notification_deliveries', 'INSERT'
    )
    OR NOT has_function_privilege(
      'economyos_app_local',
      'app.create_release_subscription(uuid,uuid,uuid,text,timestamptz)', 'EXECUTE'
    )
    OR NOT has_function_privilege(
      'economyos_app_local',
      'app.get_current_release_subscription(uuid,uuid)', 'EXECUTE'
    )
    OR NOT has_function_privilege(
      'economyos_app_local',
      'app.list_delivered_release_notifications(uuid,integer,timestamptz,uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_ingest_local',
      'app.create_release_subscription(uuid,uuid,uuid,text,timestamptz)', 'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_ingest_local',
      'app.get_current_release_subscription(uuid,uuid)', 'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_ingest_local',
      'app.list_delivered_release_notifications(uuid,integer,timestamptz,uuid)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'economyos_ingest_local',
      'evidence.prepare_release_notifications(uuid,uuid,uuid,uuid,uuid,text,text,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_app_local',
      'evidence.prepare_release_notifications(uuid,uuid,uuid,uuid,uuid,text,text,text)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'release notification least-privilege boundary is incorrect';
  END IF;
END
$verify_notification_privileges$;

-- This subscription is valid-time backdated before publication but recorded
-- now, after publication. It exercises the system-time anti-backdating gate.
SET LOCAL ROLE economyos_app_local;
SET LOCAL app.organization_id = '31af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '31af47ac-19fc-7c92-ae91-0242ac120026';
SELECT app.create_release_subscription(
  '31af47ac-19fc-7c92-ae91-0242ac120025',
  '31af47ac-19fc-7c92-ae91-0242ac120003',
  '31af47ac-19fc-7c92-ae91-0242ac120014',
  'Late-recorded backdated verification subscription.',
  '2026-01-16T00:00:00Z'
);

SET LOCAL ROLE economyos_ingest_local;
SET LOCAL app.organization_id = '31af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '';
DO $verify_prepare_and_backdating$
DECLARE
  context notification_verification_context%ROWTYPE;
  prepared record;
BEGIN
  SELECT * INTO STRICT context FROM notification_verification_context;
  SELECT * INTO STRICT prepared
  FROM evidence.prepare_release_notifications(
    context.workflow_id,
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120003',
    '31af47ac-19fc-7c92-ae91-0242ac120014',
    '31af47ac-19fc-7c92-ae91-0242ac120017',
    '2026-02-01T00:00:00Z', context.release_sha256, context.input_sha256
  );
  IF prepared.disposition <> 'execute' OR prepared.existing_output IS NOT NULL
    OR jsonb_array_length(prepared.candidates) <> 3
    OR prepared.candidates @> jsonb_build_array(jsonb_build_object(
      'subscriptionId', '31af47ac-19fc-7c92-ae91-0242ac120025'
    ))
    OR NOT prepared.candidates @> jsonb_build_array(jsonb_build_object(
      'deliveryId', 'e92302c1-8824-8709-92da-b4b3a7dde92b',
      'subscriptionId', '31af47ac-19fc-7c92-ae91-0242ac120020'
    ))
    OR NOT prepared.candidates @> jsonb_build_array(jsonb_build_object(
      'deliveryId', '917d4742-8afa-8432-9504-cdccbb7506eb',
      'subscriptionId', '31af47ac-19fc-7c92-ae91-0242ac120021'
    ))
    OR NOT prepared.candidates @> jsonb_build_array(jsonb_build_object(
      'deliveryId', '88b78608-0bf5-80d3-9764-57a882d12554',
      'subscriptionId', '31af47ac-19fc-7c92-ae91-0242ac120022'
    ))
  THEN
    RAISE EXCEPTION 'frozen candidates or anti-backdating resolution is incorrect: %',
      prepared.candidates;
  END IF;
  UPDATE notification_verification_context SET candidates = prepared.candidates;
END
$verify_prepare_and_backdating$;

SAVEPOINT notification_failure_probe;
DO $verify_idempotent_failure$
DECLARE
  context notification_verification_context%ROWTYPE;
  failure_time text := to_char(
    clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  );
BEGIN
  SELECT * INTO STRICT context FROM notification_verification_context;
  PERFORM evidence.fail_release_notifications(
    context.workflow_id, context.input_sha256, 'DELIVERY_PROBE_FAILED',
    'Verification-only terminal failure probe.', failure_time
  );
  PERFORM evidence.fail_release_notifications(
    context.workflow_id, context.input_sha256, 'DELIVERY_PROBE_FAILED',
    'Verification-only terminal failure probe.', failure_time
  );
  BEGIN
    PERFORM * FROM evidence.deliver_release_notification(
      context.workflow_id, context.input_sha256,
      'e92302c1-8824-8709-92da-b4b3a7dde92b',
      '31af47ac-19fc-7c92-ae91-0242ac120020',
      '31af47ac-19fc-7c92-ae91-0242ac120005', failure_time
    );
    RAISE EXCEPTION 'terminal failed workflow unexpectedly accepted a delivery';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END
$verify_idempotent_failure$;
ROLLBACK TO SAVEPOINT notification_failure_probe;

DO $verify_first_delivery_and_replay$
DECLARE
  context notification_verification_context%ROWTYPE;
  delivery record;
  replayed record;
  delivery_time text := to_char(
    clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  );
BEGIN
  SELECT * INTO STRICT context FROM notification_verification_context;
  SELECT * INTO STRICT delivery
  FROM evidence.deliver_release_notification(
    context.workflow_id, context.input_sha256,
    'e92302c1-8824-8709-92da-b4b3a7dde92b',
    '31af47ac-19fc-7c92-ae91-0242ac120020',
    '31af47ac-19fc-7c92-ae91-0242ac120005', delivery_time
  );
  SELECT * INTO STRICT replayed
  FROM evidence.deliver_release_notification(
    context.workflow_id, context.input_sha256,
    'e92302c1-8824-8709-92da-b4b3a7dde92b',
    '31af47ac-19fc-7c92-ae91-0242ac120020',
    '31af47ac-19fc-7c92-ae91-0242ac120005', delivery_time
  );
  IF delivery.status <> 'delivered' OR delivery.reason <> 'delivered'
    OR replayed IS DISTINCT FROM delivery
  THEN
    RAISE EXCEPTION 'idempotent delivered evidence is incorrect';
  END IF;
  UPDATE notification_verification_context SET delivery_one = jsonb_build_object(
    'deliveryId', delivery.delivery_id::text,
    'subscriptionId', delivery.subscription_id::text,
    'subjectId', delivery.subject_id::text,
    'channel', delivery.channel,
    'status', delivery.status,
    'reason', delivery.reason,
    'occurredAt', delivery.occurred_at_text
  );
END
$verify_first_delivery_and_replay$;

SET LOCAL ROLE economyos_app_local;
SET LOCAL app.organization_id = '31af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '31af47ac-19fc-7c92-ae91-0242ac120006';
SELECT app.set_release_subscription_active(
  '31af47ac-19fc-7c92-ae91-0242ac120021', false,
  'Subscriber disabled notification delivery.', clock_timestamp()
);

SET LOCAL ROLE economyos_ingest_local;
SET LOCAL app.organization_id = '31af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '';
DO $verify_inactive_suppression$
DECLARE
  context notification_verification_context%ROWTYPE;
  delivery record;
  delivery_time text := to_char(
    clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  );
BEGIN
  SELECT * INTO STRICT context FROM notification_verification_context;
  SELECT * INTO STRICT delivery
  FROM evidence.deliver_release_notification(
    context.workflow_id, context.input_sha256,
    '917d4742-8afa-8432-9504-cdccbb7506eb',
    '31af47ac-19fc-7c92-ae91-0242ac120021',
    '31af47ac-19fc-7c92-ae91-0242ac120006', delivery_time
  );
  IF delivery.status <> 'suppressed' OR delivery.reason <> 'subscription_inactive' THEN
    RAISE EXCEPTION 'inactive subscription did not fail closed: %', delivery;
  END IF;
  UPDATE notification_verification_context SET delivery_two = jsonb_build_object(
    'deliveryId', delivery.delivery_id::text,
    'subscriptionId', delivery.subscription_id::text,
    'subjectId', delivery.subject_id::text,
    'channel', delivery.channel,
    'status', delivery.status,
    'reason', delivery.reason,
    'occurredAt', delivery.occurred_at_text
  );
END
$verify_inactive_suppression$;

RESET ROLE;
INSERT INTO evidence.source_admission_events (
  id, organization_id, source_id, dataset_id, decision, permitted_actions,
  license_review_id, reason, decided_by, decided_at
) VALUES (
  '31af47ac-19fc-7c92-ae91-0242ac120023',
  '31af47ac-19fc-7c92-ae91-0242ac120001',
  '31af47ac-19fc-7c92-ae91-0242ac120009',
  '31af47ac-19fc-7c92-ae91-0242ac120010',
  'suspended', ARRAY[]::text[],
  '31af47ac-19fc-7c92-ae91-0242ac120008',
  'Verification-only current legal suspension.', 'database verification',
  clock_timestamp()
);

SET LOCAL ROLE economyos_ingest_local;
SET LOCAL app.organization_id = '31af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '';
DO $verify_current_release_suppression$
DECLARE
  context notification_verification_context%ROWTYPE;
  delivery record;
  delivery_time text := to_char(
    clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  );
BEGIN
  SELECT * INTO STRICT context FROM notification_verification_context;
  SELECT * INTO STRICT delivery
  FROM evidence.deliver_release_notification(
    context.workflow_id, context.input_sha256,
    '88b78608-0bf5-80d3-9764-57a882d12554',
    '31af47ac-19fc-7c92-ae91-0242ac120022',
    '31af47ac-19fc-7c92-ae91-0242ac120024', delivery_time
  );
  IF delivery.status <> 'suppressed' OR delivery.reason <> 'release_not_servable' THEN
    RAISE EXCEPTION 'current legal suspension did not suppress delivery: %', delivery;
  END IF;
  UPDATE notification_verification_context SET delivery_three = jsonb_build_object(
    'deliveryId', delivery.delivery_id::text,
    'subscriptionId', delivery.subscription_id::text,
    'subjectId', delivery.subject_id::text,
    'channel', delivery.channel,
    'status', delivery.status,
    'reason', delivery.reason,
    'occurredAt', delivery.occurred_at_text
  );
END
$verify_current_release_suppression$;

RESET ROLE;
WITH prepared AS (
  SELECT context.*,
    to_char(clock_timestamp() AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS completed_at_text
  FROM notification_verification_context context
), bodied AS (
  SELECT prepared.*, jsonb_build_object(
    'schemaVersion', 1,
    'workflowId', workflow_id::text,
    'inputSha256', input_sha256,
    'releaseId', '31af47ac-19fc-7c92-ae91-0242ac120017',
    'status', 'succeeded',
    'candidateCount', 3,
    'deliveredCount', 1,
    'suppressedCount', 2,
    'deliveries', jsonb_build_array(delivery_three, delivery_two, delivery_one),
    'completedAt', completed_at_text
  ) AS body
  FROM prepared
), manifested AS (
  SELECT bodied.*, body || jsonb_build_object(
    'manifestSha256', encode(digest(
      convert_to(evidence.canonical_json(body), 'UTF8'), 'sha256'
    ), 'hex')
  ) AS manifest
  FROM bodied
)
UPDATE notification_verification_context context
SET output_manifest = manifested.manifest
FROM manifested
WHERE context.workflow_id = manifested.workflow_id;

SET LOCAL ROLE economyos_ingest_local;
SET LOCAL app.organization_id = '31af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '';
DO $verify_completion_and_terminal_replay$
DECLARE
  context notification_verification_context%ROWTYPE;
  stored jsonb;
  prepared record;
BEGIN
  SELECT * INTO STRICT context FROM notification_verification_context;
  BEGIN
    PERFORM evidence.complete_release_notifications(
      context.workflow_id, context.input_sha256,
      jsonb_set(context.output_manifest, '{deliveredCount}', '0'::jsonb)
    );
    RAISE EXCEPTION 'tampered output manifest unexpectedly completed';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  stored := evidence.complete_release_notifications(
    context.workflow_id, context.input_sha256, context.output_manifest
  );
  IF stored IS DISTINCT FROM context.output_manifest THEN
    RAISE EXCEPTION 'stored output differs from canonical workflow manifest';
  END IF;
  stored := evidence.complete_release_notifications(
    context.workflow_id, context.input_sha256, context.output_manifest
  );
  SELECT * INTO STRICT prepared
  FROM evidence.prepare_release_notifications(
    context.workflow_id,
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120003',
    '31af47ac-19fc-7c92-ae91-0242ac120014',
    '31af47ac-19fc-7c92-ae91-0242ac120017',
    '2026-02-01T00:00:00Z', context.release_sha256, context.input_sha256
  );
  IF prepared.disposition <> 'return_existing'
    OR prepared.candidates <> '[]'::jsonb
    OR prepared.existing_output IS DISTINCT FROM context.output_manifest
  THEN
    RAISE EXCEPTION 'terminal workflow replay did not return exact prior output';
  END IF;
END
$verify_completion_and_terminal_replay$;

DO $verify_same_release_second_series_execution$
DECLARE
  context notification_second_series_context%ROWTYPE;
  prepared record;
  delivered record;
  candidate jsonb;
  delivery_time text;
BEGIN
  SELECT * INTO STRICT context FROM notification_second_series_context;
  IF context.workflow_id = 'eda58ce3-7ec8-88ea-8181-8fea769fc18b'::uuid THEN
    RAISE EXCEPTION 'series-aware workflow identity collided across one release';
  END IF;
  SELECT * INTO STRICT prepared
  FROM evidence.prepare_release_notifications(
    context.workflow_id,
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120003',
    '31af47ac-19fc-7c92-ae91-0242ac120040',
    '31af47ac-19fc-7c92-ae91-0242ac120017',
    '2026-02-01T00:00:00Z', context.release_sha256, context.input_sha256
  );
  IF prepared.disposition <> 'execute'
    OR jsonb_array_length(prepared.candidates) <> 1
    OR NOT prepared.candidates @> jsonb_build_array(jsonb_build_object(
      'subscriptionId', '31af47ac-19fc-7c92-ae91-0242ac120043'
    ))
  THEN
    RAISE EXCEPTION 'second series did not receive an independent frozen workflow: %',
      prepared.candidates;
  END IF;
  candidate := prepared.candidates->0;
  delivery_time := to_char(
    clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  );
  SELECT * INTO STRICT delivered
  FROM evidence.deliver_release_notification(
    context.workflow_id, context.input_sha256,
    (candidate->>'deliveryId')::uuid,
    '31af47ac-19fc-7c92-ae91-0242ac120043',
    '31af47ac-19fc-7c92-ae91-0242ac120005', delivery_time
  );
  IF delivered.status <> 'suppressed'
    OR delivered.reason <> 'release_not_servable'
  THEN
    RAISE EXCEPTION 'second series did not retain independent fail-closed delivery';
  END IF;
  UPDATE notification_second_series_context SET delivery = jsonb_build_object(
    'deliveryId', delivered.delivery_id::text,
    'subscriptionId', delivered.subscription_id::text,
    'subjectId', delivered.subject_id::text,
    'channel', delivered.channel,
    'status', delivered.status,
    'reason', delivered.reason,
    'occurredAt', delivered.occurred_at_text
  );
END
$verify_same_release_second_series_execution$;

RESET ROLE;
WITH prepared AS (
  SELECT context.*,
    to_char(clock_timestamp() AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS completed_at_text
  FROM notification_second_series_context context
), bodied AS (
  SELECT prepared.*, jsonb_build_object(
    'schemaVersion', 1,
    'workflowId', workflow_id::text,
    'inputSha256', input_sha256,
    'releaseId', '31af47ac-19fc-7c92-ae91-0242ac120017',
    'status', 'succeeded',
    'candidateCount', 1,
    'deliveredCount', 0,
    'suppressedCount', 1,
    'deliveries', jsonb_build_array(delivery),
    'completedAt', completed_at_text
  ) AS body
  FROM prepared
), manifested AS (
  SELECT bodied.*, body || jsonb_build_object(
    'manifestSha256', encode(digest(convert_to(
      evidence.canonical_json(body), 'UTF8'
    ), 'sha256'), 'hex')
  ) AS manifest
  FROM bodied
)
UPDATE notification_second_series_context context
SET output_manifest = manifested.manifest
FROM manifested
WHERE context.workflow_id = manifested.workflow_id;

SET LOCAL ROLE economyos_ingest_local;
SET LOCAL app.organization_id = '31af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '';
DO $verify_same_release_independent_series_replay$
DECLARE
  context notification_second_series_context%ROWTYPE;
  prepared record;
  stored_manifest jsonb;
BEGIN
  SELECT * INTO STRICT context FROM notification_second_series_context;
  stored_manifest := evidence.complete_release_notifications(
    context.workflow_id, context.input_sha256, context.output_manifest
  );
  stored_manifest := evidence.complete_release_notifications(
    context.workflow_id, context.input_sha256, context.output_manifest
  );
  SELECT * INTO STRICT prepared
  FROM evidence.prepare_release_notifications(
    context.workflow_id,
    '31af47ac-19fc-7c92-ae91-0242ac120001',
    '31af47ac-19fc-7c92-ae91-0242ac120003',
    '31af47ac-19fc-7c92-ae91-0242ac120040',
    '31af47ac-19fc-7c92-ae91-0242ac120017',
    '2026-02-01T00:00:00Z', context.release_sha256, context.input_sha256
  );
  IF stored_manifest IS DISTINCT FROM context.output_manifest
    OR prepared.disposition <> 'return_existing'
    OR prepared.existing_output IS DISTINCT FROM context.output_manifest
  THEN
    RAISE EXCEPTION 'second series terminal replay is not independent';
  END IF;
END
$verify_same_release_independent_series_replay$;

RESET ROLE;
DO $verify_same_release_series_storage$
DECLARE
  successful_runs integer;
  successful_series integer;
BEGIN
  SELECT count(*), count(DISTINCT run.series_id)
  INTO successful_runs, successful_series
  FROM evidence.release_notification_runs run
  WHERE run.organization_id = '31af47ac-19fc-7c92-ae91-0242ac120001'
    AND run.workspace_id = '31af47ac-19fc-7c92-ae91-0242ac120003'
    AND run.release_id = '31af47ac-19fc-7c92-ae91-0242ac120017'
    AND run.status = 'succeeded';
  IF successful_runs <> 2 OR successful_series <> 2 THEN
    RAISE EXCEPTION 'same release did not retain two successful series workflows';
  END IF;
END
$verify_same_release_series_storage$;

SET LOCAL ROLE economyos_app_local;
SET LOCAL app.organization_id = '31af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '31af47ac-19fc-7c92-ae91-0242ac120005';
DO $verify_current_subscription_and_notification_page$
DECLARE
  subscription record;
  notification record;
  result_count integer;
BEGIN
  SELECT * INTO STRICT subscription
  FROM app.get_current_release_subscription(
    '31af47ac-19fc-7c92-ae91-0242ac120003',
    '31af47ac-19fc-7c92-ae91-0242ac120014'
  );
  IF subscription.subscription_id <>
      '31af47ac-19fc-7c92-ae91-0242ac120020'::uuid
    OR NOT subscription.active
    OR subscription.resolved_event_id <>
      '31af47ac-19fc-7c92-ae91-0242ac120030'::uuid
    OR subscription.event_sha256 !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'current subscription lookup did not resolve exact bitemporal state: %',
      subscription;
  END IF;
  SELECT count(*) INTO result_count
  FROM app.get_current_release_subscription(
    '31af47ac-19fc-7c92-ae91-0242ac120003',
    '31af47ac-19fc-7c92-ae91-0242ac129999'
  );
  IF result_count <> 0 THEN
    RAISE EXCEPTION 'exact subscription lookup enumerated a different series';
  END IF;

  SELECT * INTO STRICT notification
  FROM app.list_delivered_release_notifications(
    '31af47ac-19fc-7c92-ae91-0242ac120003', 1, NULL, NULL
  );
  IF notification.delivery_id <>
      'e92302c1-8824-8709-92da-b4b3a7dde92b'::uuid
    OR notification.workflow_id <>
      'eda58ce3-7ec8-88ea-8181-8fea769fc18b'::uuid
    OR notification.subscription_id <>
      '31af47ac-19fc-7c92-ae91-0242ac120020'::uuid
    OR notification.series_id <>
      '31af47ac-19fc-7c92-ae91-0242ac120014'::uuid
    OR notification.release_id <>
      '31af47ac-19fc-7c92-ae91-0242ac120017'::uuid
    OR notification.delivery_sha256 !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'delivered notification pointer page is incorrect: %', notification;
  END IF;
  SELECT count(*) INTO result_count
  FROM app.list_delivered_release_notifications(
    '31af47ac-19fc-7c92-ae91-0242ac120003', 1,
    notification.occurred_at, notification.delivery_id
  );
  IF result_count <> 0 THEN
    RAISE EXCEPTION 'strict notification keyset replayed its cursor row';
  END IF;
  BEGIN
    PERFORM * FROM app.list_delivered_release_notifications(
      '31af47ac-19fc-7c92-ae91-0242ac120003', 101, NULL, NULL
    );
    RAISE EXCEPTION 'notification page exceeded its bounded limit';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM * FROM app.list_delivered_release_notifications(
      '31af47ac-19fc-7c92-ae91-0242ac120003', 1,
      notification.occurred_at, NULL
    );
    RAISE EXCEPTION 'notification page accepted a partial keyset cursor';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END
$verify_current_subscription_and_notification_page$;

SET LOCAL app.subject_id = '31af47ac-19fc-7c92-ae91-0242ac120006';
DO $verify_foreign_subject_and_suppressed_filter$
DECLARE
  subscription record;
  result_count integer;
BEGIN
  SELECT * INTO STRICT subscription
  FROM app.get_current_release_subscription(
    '31af47ac-19fc-7c92-ae91-0242ac120003',
    '31af47ac-19fc-7c92-ae91-0242ac120014'
  );
  IF subscription.subscription_id <>
      '31af47ac-19fc-7c92-ae91-0242ac120021'::uuid
    OR subscription.active
    OR subscription.resolved_event_id =
      '31af47ac-19fc-7c92-ae91-0242ac120031'::uuid
  THEN
    RAISE EXCEPTION 'subject-scoped lookup leaked another subscription or stale state: %',
      subscription;
  END IF;
  SELECT count(*) INTO result_count
  FROM app.list_delivered_release_notifications(
    '31af47ac-19fc-7c92-ae91-0242ac120003', 100, NULL, NULL
  );
  IF result_count <> 0 THEN
    RAISE EXCEPTION 'suppressed notification or another subject delivery was returned';
  END IF;
END
$verify_foreign_subject_and_suppressed_filter$;

SET LOCAL app.subject_id = '31af47ac-19fc-7c92-ae91-0242ac120024';
DO $verify_legal_suppression_not_returned$
DECLARE
  result_count integer;
BEGIN
  SELECT count(*) INTO result_count
  FROM app.list_delivered_release_notifications(
    '31af47ac-19fc-7c92-ae91-0242ac120003', 100, NULL, NULL
  );
  IF result_count <> 0 THEN
    RAISE EXCEPTION 'legally suppressed notification was returned';
  END IF;
END
$verify_legal_suppression_not_returned$;

SET LOCAL app.organization_id = '31af47ac-19fc-7c92-ae91-0242ac120002';
SET LOCAL app.subject_id = '31af47ac-19fc-7c92-ae91-0242ac120007';
DO $verify_notification_center_tenant_non_enumeration$
DECLARE
  result_count integer;
BEGIN
  SELECT count(*) INTO result_count
  FROM app.get_current_release_subscription(
    '31af47ac-19fc-7c92-ae91-0242ac120003',
    '31af47ac-19fc-7c92-ae91-0242ac120014'
  );
  IF result_count <> 0 THEN
    RAISE EXCEPTION 'foreign tenant enumerated subscription state';
  END IF;
  SELECT count(*) INTO result_count
  FROM app.list_delivered_release_notifications(
    '31af47ac-19fc-7c92-ae91-0242ac120003', 100, NULL, NULL
  );
  IF result_count <> 0 THEN
    RAISE EXCEPTION 'foreign tenant enumerated delivered notifications';
  END IF;
END
$verify_notification_center_tenant_non_enumeration$;

SET LOCAL ROLE economyos_ingest_local;
SET LOCAL app.subject_id = '';
SET LOCAL app.organization_id = '31af47ac-19fc-7c92-ae91-0242ac120002';
DO $verify_notification_tenant_denial$
DECLARE
  context notification_verification_context%ROWTYPE;
BEGIN
  SELECT * INTO STRICT context FROM notification_verification_context;
  BEGIN
    PERFORM * FROM evidence.prepare_release_notifications(
      context.workflow_id,
      '31af47ac-19fc-7c92-ae91-0242ac120001',
      '31af47ac-19fc-7c92-ae91-0242ac120003',
      '31af47ac-19fc-7c92-ae91-0242ac120014',
      '31af47ac-19fc-7c92-ae91-0242ac120017',
      '2026-02-01T00:00:00Z', context.release_sha256, context.input_sha256
    );
    RAISE EXCEPTION 'foreign tenant unexpectedly replayed notification workflow';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_notification_tenant_denial$;

RESET ROLE;
DO $verify_notification_evidence$
DECLARE
  run_count integer;
  event_count integer;
  delivery_count integer;
BEGIN
  SELECT count(*) INTO run_count FROM evidence.release_notification_runs
  WHERE workflow_id = 'eda58ce3-7ec8-88ea-8181-8fea769fc18b'
    AND status = 'succeeded';
  SELECT count(*) INTO event_count FROM evidence.release_notification_run_events
  WHERE workflow_id = 'eda58ce3-7ec8-88ea-8181-8fea769fc18b';
  SELECT count(*) INTO delivery_count FROM evidence.release_notification_deliveries
  WHERE workflow_id = 'eda58ce3-7ec8-88ea-8181-8fea769fc18b'
    AND delivery_sha256 = encode(digest(convert_to(
      evidence.canonical_json(delivery_manifest), 'UTF8'
    ), 'sha256'), 'hex');
  IF run_count <> 1 OR event_count <> 2 OR delivery_count <> 3 THEN
    RAISE EXCEPTION 'durable notification evidence is incomplete: run %, events %, deliveries %',
      run_count, event_count, delivery_count;
  END IF;
  BEGIN
    UPDATE evidence.release_notification_deliveries
    SET reason = 'subscription_inactive'
    WHERE delivery_id = 'e92302c1-8824-8709-92da-b4b3a7dde92b';
    RAISE EXCEPTION 'delivery evidence mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    UPDATE app.release_subscriptions
    SET series_id = '31af47ac-19fc-7c92-ae91-0242ac120014'
    WHERE id = '31af47ac-19fc-7c92-ae91-0242ac120020';
    RAISE EXCEPTION 'subscription identity mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END
$verify_notification_evidence$;

ROLLBACK;
