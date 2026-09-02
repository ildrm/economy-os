-- Prove that durable workflow success is the only serving boundary. The
-- fixture deliberately leaves canonical-looking rows behind before terminal
-- success, as a worker crash would, then exercises failed and successful
-- terminal transitions through the runtime roles.
BEGIN;

INSERT INTO app.organizations (id, slug, name) VALUES
  ('078f47ac-19fc-7c92-ae91-0242ac120001', 'terminal-admission-a', 'Terminal admission A'),
  ('078f47ac-19fc-7c92-ae91-0242ac120002', 'terminal-admission-b', 'Terminal admission B');

INSERT INTO evidence.license_reviews (
  id, source_slug, dataset_external_key, evidence_uri, license_expression,
  intended_uses, evidence, reviewed_by, reviewed_at
) VALUES (
  '078f47ac-19fc-7c92-ae91-0242ac120003',
  'terminal-admission-fixture', 'terminal.series',
  'https://example.invalid/terminal-admission/license', 'TEST-TERMINAL',
  ARRAY['view', 'api'], '{"fixture":true}', 'database verification',
  '2026-01-01T00:00:00Z'
);

INSERT INTO evidence.sources (
  id, organization_id, slug, name, authority_class, homepage_uri,
  classification, license_status, license_expression, redistribution_allowed,
  reviewed_at, license_review_id, attribution_text, permitted_actions
) VALUES (
  '078f47ac-19fc-7c92-ae91-0242ac120004',
  '078f47ac-19fc-7c92-ae91-0242ac120001',
  'terminal-admission-fixture', 'Terminal admission verification source', 'customer',
  'https://example.invalid/terminal-admission', 'confidential', 'approved',
  'TEST-TERMINAL', false, '2026-01-01T00:00:00Z',
  '078f47ac-19fc-7c92-ae91-0242ac120003',
  'Verification fixture; not production data.', ARRAY['view', 'api']
);

INSERT INTO evidence.source_datasets (
  id, organization_id, source_id, external_key, title, pit_quality,
  admission_status, admitted_at
) VALUES (
  '078f47ac-19fc-7c92-ae91-0242ac120005',
  '078f47ac-19fc-7c92-ae91-0242ac120001',
  '078f47ac-19fc-7c92-ae91-0242ac120004',
  'terminal.series', 'Terminal admission verification dataset', 'true_vintage',
  'approved', '2026-01-01T00:00:00Z'
);

INSERT INTO evidence.source_admission_events (
  id, organization_id, source_id, dataset_id, decision, permitted_actions,
  license_review_id, reason, decided_by, decided_at
) VALUES (
  '078f47ac-19fc-7c92-ae91-0242ac120006',
  '078f47ac-19fc-7c92-ae91-0242ac120001',
  '078f47ac-19fc-7c92-ae91-0242ac120004',
  '078f47ac-19fc-7c92-ae91-0242ac120005',
  'approved', ARRAY['view', 'api'],
  '078f47ac-19fc-7c92-ae91-0242ac120003',
  'Verification-only durable admission.', 'database verification',
  '2026-01-01T00:00:00Z'
);

INSERT INTO evidence.geographies (id, kind, code_scheme, code, name) VALUES (
  '078f47ac-19fc-7c92-ae91-0242ac120007',
  'economy', 'ECONOMYOS-TEST', 'TAD', 'Terminal admission economy'
);

INSERT INTO evidence.concepts (
  id, canonical_key, name, definition, measurement_class, ontology_version
) VALUES (
  '078f47ac-19fc-7c92-ae91-0242ac120008',
  'economy.terminal.admission', 'Terminal admission',
  'Verification-only terminal admission observation.', 'direct', 'verification-1'
);

INSERT INTO evidence.series (
  id, organization_id, dataset_id, concept_id, geography_id,
  external_series_key, unit_code, frequency, seasonal_adjustment, data_class
) VALUES (
  '078f47ac-19fc-7c92-ae91-0242ac120009',
  '078f47ac-19fc-7c92-ae91-0242ac120001',
  '078f47ac-19fc-7c92-ae91-0242ac120005',
  '078f47ac-19fc-7c92-ae91-0242ac120008',
  '078f47ac-19fc-7c92-ae91-0242ac120007',
  'terminal.series.TAD', 'index_points', 'annual', 'unadjusted', 'observed'
);

INSERT INTO evidence.ingestion_runs (
  id, organization_id, dataset_id, workflow_id, idempotency_key,
  input_manifest, input_sha256, requested_at
)
SELECT
  '078f47ac-19fc-7c92-ae91-0242ac120010',
  '078f47ac-19fc-7c92-ae91-0242ac120001',
  '078f47ac-19fc-7c92-ae91-0242ac120005',
  'verify-terminal-admission', repeat('1', 64), manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  '2026-08-31T02:00:00Z'
FROM (VALUES (
  ('{"connector":"terminal-fixture","countryCode":"TAD","endYear":2025,"startYear":2025}'::jsonb)
)) input(manifest);

SET LOCAL ROLE economyos_ingest;
SET LOCAL app.organization_id = '078f47ac-19fc-7c92-ae91-0242ac120001';

SELECT evidence.transition_ingestion_run(
  '078f47ac-19fc-7c92-ae91-0242ac120010',
  'pending', 'running', 'workflow', 1,
  '{"worker":"terminal-admission-verification"}', NULL, NULL,
  '2026-08-31T02:00:01Z'
);

RESET ROLE;

-- These immutable rows model a crash after promotion but before the durable
-- workflow records terminal success.
INSERT INTO evidence.raw_payloads (
  id, organization_id, dataset_id, request_uri, object_uri, media_type,
  checksum_sha256, byte_length, fetched_at, parser_name, parser_version, recorded_at
) VALUES (
  '078f47ac-19fc-7c92-ae91-0242ac120011',
  '078f47ac-19fc-7c92-ae91-0242ac120001',
  '078f47ac-19fc-7c92-ae91-0242ac120005',
  'https://example.invalid/terminal-admission/data',
  's3://verification-only/terminal-admission.json', 'application/json',
  repeat('a', 64), 42, '2026-08-31T02:00:02Z',
  'terminal-verification', '1', '2026-08-31T02:00:03Z'
);

INSERT INTO evidence.transformation_runs (
  id, organization_id, dataset_id, raw_payload_id, parser_name, parser_version,
  code_sha256, configuration, configuration_sha256, status,
  started_at, completed_at, workflow_id, ingestion_run_id
)
SELECT
  '078f47ac-19fc-7c92-ae91-0242ac120012',
  '078f47ac-19fc-7c92-ae91-0242ac120001',
  '078f47ac-19fc-7c92-ae91-0242ac120005',
  '078f47ac-19fc-7c92-ae91-0242ac120011',
  'terminal-verification', '1', repeat('b', 64), configuration,
  encode(digest(convert_to(evidence.canonical_json(configuration), 'UTF8'), 'sha256'), 'hex'),
  'succeeded', '2026-08-31T02:00:03Z', '2026-08-31T02:00:04Z',
  'verify-terminal-admission', '078f47ac-19fc-7c92-ae91-0242ac120010'
FROM (VALUES ('{}'::jsonb)) input(configuration);

INSERT INTO evidence.quality_results (
  id, organization_id, dataset_id, raw_payload_id, transformation_run_id,
  check_code, status, details, checked_at
) VALUES
  (
    '078f47ac-19fc-7c92-ae91-0242ac120013',
    '078f47ac-19fc-7c92-ae91-0242ac120001',
    '078f47ac-19fc-7c92-ae91-0242ac120005',
    '078f47ac-19fc-7c92-ae91-0242ac120011',
    '078f47ac-19fc-7c92-ae91-0242ac120012',
    'row_bounds', 'pass', '{"weight":1}', '2026-08-31T02:00:04Z'
  ),
  (
    '078f47ac-19fc-7c92-ae91-0242ac120014',
    '078f47ac-19fc-7c92-ae91-0242ac120001',
    '078f47ac-19fc-7c92-ae91-0242ac120005',
    '078f47ac-19fc-7c92-ae91-0242ac120011',
    '078f47ac-19fc-7c92-ae91-0242ac120012',
    'admission', 'pass', '{"score":1}', '2026-08-31T02:00:04Z'
  );

INSERT INTO evidence.releases (
  id, organization_id, dataset_id, raw_payload_id, external_release_key,
  release_time, source_publication_time, original_release_time, availability_time,
  revision_time, pit_quality, revision_sequence, recorded_at
) VALUES (
  '078f47ac-19fc-7c92-ae91-0242ac120015',
  '078f47ac-19fc-7c92-ae91-0242ac120001',
  '078f47ac-19fc-7c92-ae91-0242ac120005',
  '078f47ac-19fc-7c92-ae91-0242ac120011', 'terminal-2025',
  '2026-08-31T02:00:02Z', '2026-08-31T02:00:02Z',
  '2026-08-31T02:00:02Z', '2026-08-31T02:00:02Z',
  '2026-08-31T02:00:02Z', 'true_vintage', 0, '2026-08-31T02:00:04Z'
);

INSERT INTO evidence.observations (
  id, organization_id, series_id, release_id, period_start, period_end,
  value_numeric, status, parser_version, recorded_at, transformation_run_id
) VALUES (
  '078f47ac-19fc-7c92-ae91-0242ac120016',
  '078f47ac-19fc-7c92-ae91-0242ac120001',
  '078f47ac-19fc-7c92-ae91-0242ac120009',
  '078f47ac-19fc-7c92-ae91-0242ac120015',
  '2025-01-01T00:00:00Z', '2026-01-01T00:00:00Z',
  7.5, 'final', '1', '2026-08-31T02:00:04Z',
  '078f47ac-19fc-7c92-ae91-0242ac120012'
);

INSERT INTO evidence.lineage_edges (
  id, organization_id, from_type, from_id, to_type, to_id, relation,
  transformation_version, created_at
) VALUES
  (
    '078f47ac-19fc-7c92-ae91-0242ac120017',
    '078f47ac-19fc-7c92-ae91-0242ac120001',
    'payload', '078f47ac-19fc-7c92-ae91-0242ac120011',
    'run', '078f47ac-19fc-7c92-ae91-0242ac120012', 'parsed_into', '1',
    '2026-08-31T02:00:04Z'
  ),
  (
    '078f47ac-19fc-7c92-ae91-0242ac120018',
    '078f47ac-19fc-7c92-ae91-0242ac120001',
    'run', '078f47ac-19fc-7c92-ae91-0242ac120012',
    'release', '078f47ac-19fc-7c92-ae91-0242ac120015', 'produced', '1',
    '2026-08-31T02:00:04Z'
  ),
  (
    '078f47ac-19fc-7c92-ae91-0242ac120019',
    '078f47ac-19fc-7c92-ae91-0242ac120001',
    'release', '078f47ac-19fc-7c92-ae91-0242ac120015',
    'observation', '078f47ac-19fc-7c92-ae91-0242ac120016', 'produced', '1',
    '2026-08-31T02:00:04Z'
  );

-- The quality, promote, and lineage checkpoints exist. Reconcile is withheld
-- until after the atomic-failure assertion below.
INSERT INTO evidence.ingestion_checkpoints (
  id, organization_id, ingestion_run_id, stage, checkpoint_key,
  value, value_sha256, committed_at
)
SELECT
  id, '078f47ac-19fc-7c92-ae91-0242ac120001',
  '078f47ac-19fc-7c92-ae91-0242ac120010', stage, checkpoint_key, value,
  encode(digest(convert_to(evidence.canonical_json(value), 'UTF8'), 'sha256'), 'hex'),
  '2026-08-31T02:00:05Z'
FROM (VALUES
  (
    '078f47ac-19fc-7c92-ae91-0242ac120020'::uuid, 'quality',
    '078f47ac-19fc-7c92-ae91-0242ac120012',
    jsonb_build_object(
      'transformationRunId', '078f47ac-19fc-7c92-ae91-0242ac120012',
      'candidateSha256', repeat('c', 64), 'score', 1
    )
  ),
  (
    '078f47ac-19fc-7c92-ae91-0242ac120021'::uuid, 'promote',
    '078f47ac-19fc-7c92-ae91-0242ac120012',
    jsonb_build_object(
      'releaseId', '078f47ac-19fc-7c92-ae91-0242ac120015',
      'observationIds', jsonb_build_array('078f47ac-19fc-7c92-ae91-0242ac120016'),
      'observationSetSha256', encode(digest(convert_to(evidence.canonical_json(
        jsonb_build_array('078f47ac-19fc-7c92-ae91-0242ac120016')
      ), 'UTF8'), 'sha256'), 'hex')
    )
  ),
  (
    '078f47ac-19fc-7c92-ae91-0242ac120022'::uuid, 'lineage',
    '078f47ac-19fc-7c92-ae91-0242ac120012',
    jsonb_build_object(
      'transformationRunId', '078f47ac-19fc-7c92-ae91-0242ac120012',
      'edgeCount', 3
    )
  )
) checkpoint(id, stage, checkpoint_key, value);

SET LOCAL ROLE economyos_app;
SET LOCAL app.organization_id = '078f47ac-19fc-7c92-ae91-0242ac120001';

DO $verify_crash_window_hidden$
DECLARE
  governed_count integer;
BEGIN
  SELECT count(*) INTO governed_count
  FROM evidence.governed_observations_as_known(
    '078f47ac-19fc-7c92-ae91-0242ac120009',
    '2026-09-01T00:00:00Z', 'true_vintage', NULL, 'view', 100
  );
  IF governed_count <> 0 THEN
    RAISE EXCEPTION
      'pre-terminal crash evidence crossed the serving boundary: governed=%',
      governed_count;
  END IF;
END
$verify_crash_window_hidden$;

RESET ROLE;
SET LOCAL ROLE economyos_ingest;
SET LOCAL app.organization_id = '078f47ac-19fc-7c92-ae91-0242ac120002';

DO $verify_cross_tenant_transition_denied$
BEGIN
  BEGIN
    PERFORM evidence.transition_ingestion_run(
      '078f47ac-19fc-7c92-ae91-0242ac120010',
      'running', 'running', 'fetch', 1,
      '{"worker":"foreign-tenant"}', NULL, NULL,
      '2026-08-31T02:00:05Z'
    );
    RAISE EXCEPTION 'cross-tenant ingestion transition unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_cross_tenant_transition_denied$;

SELECT set_config(
  'app.organization_id', '078f47ac-19fc-7c92-ae91-0242ac120001', true
);

DO $verify_incomplete_terminal_transition_is_atomic$
DECLARE
  run_status text;
  run_completed_at timestamptz;
  run_output jsonb;
  succeeded_event_count integer;
  admission_count integer;
  output_manifest jsonb;
  observation_set jsonb := jsonb_build_array(
    '078f47ac-19fc-7c92-ae91-0242ac120016'
  );
  reconciliation jsonb := jsonb_build_object(
    'expectedRows', 1,
    'persistedRows', 1,
    'missingPeriods', '[]'::jsonb,
    'unexpectedPeriods', '[]'::jsonb,
    'mismatchedPeriods', '[]'::jsonb,
    'checkpointSha256', repeat('d', 64)
  );
BEGIN
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'runId', run.id::text,
    'status', 'succeeded',
    'inputSha256', run.input_sha256,
    'rawPayloads', jsonb_build_array(jsonb_build_object(
      'payloadId', '078f47ac-19fc-7c92-ae91-0242ac120011',
      'requestUri', 'https://example.invalid/terminal-admission/data',
      'objectUri', 's3://verification-only/terminal-admission.json',
      'mediaType', 'application/json',
      'checksumSha256', repeat('a', 64),
      'byteLength', 42,
      'fetchedAt', '2026-08-31T02:00:02Z',
      'providerRequestId', NULL
    )),
    'transformationRunId', '078f47ac-19fc-7c92-ae91-0242ac120012',
    'releaseId', '078f47ac-19fc-7c92-ae91-0242ac120015',
    'observationIds', observation_set,
    'observationSetSha256', encode(digest(convert_to(
      evidence.canonical_json(observation_set), 'UTF8'
    ), 'sha256'), 'hex'),
    'candidateSha256', repeat('c', 64),
    'qualityScore', 1,
    'qualityResults', jsonb_build_array(
      jsonb_build_object('checkCode', 'admission', 'status', 'pass'),
      jsonb_build_object('checkCode', 'row_bounds', 'status', 'pass')
    ),
    'reconciliation', reconciliation,
    'completedAt', '2026-08-31T02:00:06Z'
  ) INTO output_manifest
  FROM evidence.ingestion_runs run
  WHERE run.id = '078f47ac-19fc-7c92-ae91-0242ac120010';

  BEGIN
    PERFORM evidence.transition_ingestion_run(
      '078f47ac-19fc-7c92-ae91-0242ac120010',
      'running', 'succeeded', 'reconcile', 1,
      '{"checkpoint":"canonical-periods"}', output_manifest, NULL,
      '2026-08-31T02:00:06Z'
    );
    RAISE EXCEPTION 'incomplete successful transition unexpectedly committed';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  SELECT run.status, run.completed_at, run.output_manifest
    INTO run_status, run_completed_at, run_output
  FROM evidence.ingestion_runs run
  WHERE run.id = '078f47ac-19fc-7c92-ae91-0242ac120010';
  SELECT count(*) INTO succeeded_event_count
  FROM evidence.ingestion_run_events
  WHERE ingestion_run_id = '078f47ac-19fc-7c92-ae91-0242ac120010'
    AND status = 'succeeded';
  SELECT count(*) INTO admission_count
  FROM evidence.canonical_admissions
  WHERE ingestion_run_id = '078f47ac-19fc-7c92-ae91-0242ac120010';

  IF run_status <> 'running' OR run_completed_at IS NOT NULL OR run_output IS NOT NULL
    OR succeeded_event_count <> 0 OR admission_count <> 0
  THEN
    RAISE EXCEPTION
      'failed terminal registration was not atomic: status=%, events=%, admissions=%',
      run_status, succeeded_event_count, admission_count;
  END IF;
END
$verify_incomplete_terminal_transition_is_atomic$;

-- Commit the one missing proof, then repeat the identical terminal transition.
INSERT INTO evidence.ingestion_checkpoints (
  id, organization_id, ingestion_run_id, stage, checkpoint_key,
  value, value_sha256, committed_at
)
SELECT
  '078f47ac-19fc-7c92-ae91-0242ac120023',
  '078f47ac-19fc-7c92-ae91-0242ac120001',
  '078f47ac-19fc-7c92-ae91-0242ac120010',
  'reconcile', 'canonical-periods', reconciliation,
  encode(digest(convert_to(evidence.canonical_json(reconciliation), 'UTF8'), 'sha256'), 'hex'),
  '2026-08-31T02:00:05Z'
FROM (VALUES (jsonb_build_object(
  'expectedRows', 1,
  'persistedRows', 1,
  'missingPeriods', '[]'::jsonb,
  'unexpectedPeriods', '[]'::jsonb,
  'mismatchedPeriods', '[]'::jsonb,
  'checkpointSha256', repeat('d', 64)
))) input(reconciliation);

DO $verify_tampered_raw_metadata_is_atomic$
DECLARE
  output_manifest jsonb;
  tampered_manifest jsonb;
  run_status text;
  run_completed_at timestamptz;
  run_output jsonb;
  succeeded_event_count integer;
  admission_count integer;
  observation_set jsonb := jsonb_build_array(
    '078f47ac-19fc-7c92-ae91-0242ac120016'
  );
  reconciliation jsonb := jsonb_build_object(
    'expectedRows', 1,
    'persistedRows', 1,
    'missingPeriods', '[]'::jsonb,
    'unexpectedPeriods', '[]'::jsonb,
    'mismatchedPeriods', '[]'::jsonb,
    'checkpointSha256', repeat('d', 64)
  );
BEGIN
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'runId', run.id::text,
    'status', 'succeeded',
    'inputSha256', run.input_sha256,
    'rawPayloads', jsonb_build_array(jsonb_build_object(
      'payloadId', '078f47ac-19fc-7c92-ae91-0242ac120011',
      'requestUri', 'https://example.invalid/terminal-admission/data',
      'objectUri', 's3://verification-only/terminal-admission.json',
      'mediaType', 'application/json',
      'checksumSha256', repeat('a', 64),
      'byteLength', 42,
      'fetchedAt', '2026-08-31T02:00:02Z',
      'providerRequestId', NULL
    )),
    'transformationRunId', '078f47ac-19fc-7c92-ae91-0242ac120012',
    'releaseId', '078f47ac-19fc-7c92-ae91-0242ac120015',
    'observationIds', observation_set,
    'observationSetSha256', encode(digest(convert_to(
      evidence.canonical_json(observation_set), 'UTF8'
    ), 'sha256'), 'hex'),
    'candidateSha256', repeat('c', 64),
    'qualityScore', 1,
    'qualityResults', jsonb_build_array(
      jsonb_build_object('checkCode', 'admission', 'status', 'pass'),
      jsonb_build_object('checkCode', 'row_bounds', 'status', 'pass')
    ),
    'reconciliation', reconciliation,
    'completedAt', '2026-08-31T02:00:06Z'
  ) INTO output_manifest
  FROM evidence.ingestion_runs run
  WHERE run.id = '078f47ac-19fc-7c92-ae91-0242ac120010';
  tampered_manifest := jsonb_set(
    output_manifest,
    '{rawPayloads,0,objectUri}',
    to_jsonb('s3://verification-only/tampered.json'::text)
  );

  BEGIN
    PERFORM evidence.transition_ingestion_run(
      '078f47ac-19fc-7c92-ae91-0242ac120010',
      'running', 'succeeded', 'reconcile', 1,
      '{"checkpoint":"canonical-periods"}', tampered_manifest, NULL,
      '2026-08-31T02:00:06Z'
    );
    RAISE EXCEPTION 'tampered raw-payload metadata unexpectedly committed';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  SELECT run.status, run.completed_at, run.output_manifest
    INTO run_status, run_completed_at, run_output
  FROM evidence.ingestion_runs run
  WHERE run.id = '078f47ac-19fc-7c92-ae91-0242ac120010';
  SELECT count(*) INTO succeeded_event_count
  FROM evidence.ingestion_run_events
  WHERE ingestion_run_id = '078f47ac-19fc-7c92-ae91-0242ac120010'
    AND status = 'succeeded';
  SELECT count(*) INTO admission_count
  FROM evidence.canonical_admissions
  WHERE ingestion_run_id = '078f47ac-19fc-7c92-ae91-0242ac120010';

  IF run_status <> 'running' OR run_completed_at IS NOT NULL OR run_output IS NOT NULL
    OR succeeded_event_count <> 0 OR admission_count <> 0
  THEN
    RAISE EXCEPTION
      'tampered raw metadata was not rejected atomically: status=%, events=%, admissions=%',
      run_status, succeeded_event_count, admission_count;
  END IF;
END
$verify_tampered_raw_metadata_is_atomic$;

RESET ROLE;
UPDATE evidence.series
SET status = 'suspended'
WHERE id = '078f47ac-19fc-7c92-ae91-0242ac120009';

SET LOCAL ROLE economyos_ingest;
SET LOCAL app.organization_id = '078f47ac-19fc-7c92-ae91-0242ac120001';

DO $verify_suspended_series_terminal_rollback$
DECLARE
  output_manifest jsonb;
  admission_count integer;
  run_status text;
  observation_set jsonb := jsonb_build_array(
    '078f47ac-19fc-7c92-ae91-0242ac120016'
  );
  reconciliation jsonb := jsonb_build_object(
    'expectedRows', 1,
    'persistedRows', 1,
    'missingPeriods', '[]'::jsonb,
    'unexpectedPeriods', '[]'::jsonb,
    'mismatchedPeriods', '[]'::jsonb,
    'checkpointSha256', repeat('d', 64)
  );
BEGIN
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'runId', run.id::text,
    'status', 'succeeded',
    'inputSha256', run.input_sha256,
    'rawPayloads', jsonb_build_array(jsonb_build_object(
      'payloadId', '078f47ac-19fc-7c92-ae91-0242ac120011',
      'requestUri', 'https://example.invalid/terminal-admission/data',
      'objectUri', 's3://verification-only/terminal-admission.json',
      'mediaType', 'application/json',
      'checksumSha256', repeat('a', 64),
      'byteLength', 42,
      'fetchedAt', '2026-08-31T02:00:02Z',
      'providerRequestId', NULL
    )),
    'transformationRunId', '078f47ac-19fc-7c92-ae91-0242ac120012',
    'releaseId', '078f47ac-19fc-7c92-ae91-0242ac120015',
    'observationIds', observation_set,
    'observationSetSha256', encode(digest(convert_to(
      evidence.canonical_json(observation_set), 'UTF8'
    ), 'sha256'), 'hex'),
    'candidateSha256', repeat('c', 64),
    'qualityScore', 1,
    'qualityResults', jsonb_build_array(
      jsonb_build_object('checkCode', 'admission', 'status', 'pass'),
      jsonb_build_object('checkCode', 'row_bounds', 'status', 'pass')
    ),
    'reconciliation', reconciliation,
    'completedAt', '2026-08-31T02:00:06Z'
  ) INTO output_manifest
  FROM evidence.ingestion_runs run
  WHERE run.id = '078f47ac-19fc-7c92-ae91-0242ac120010';

  BEGIN
    PERFORM evidence.transition_ingestion_run(
      '078f47ac-19fc-7c92-ae91-0242ac120010',
      'running', 'succeeded', 'reconcile', 1,
      '{"checkpoint":"canonical-periods"}', output_manifest, NULL,
      '2026-08-31T02:00:06Z'
    );
    RAISE EXCEPTION 'suspended-series terminal success unexpectedly committed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  SELECT status INTO STRICT run_status
  FROM evidence.ingestion_runs
  WHERE id = '078f47ac-19fc-7c92-ae91-0242ac120010';
  SELECT count(*) INTO admission_count
  FROM evidence.canonical_admissions
  WHERE ingestion_run_id = '078f47ac-19fc-7c92-ae91-0242ac120010';
  IF run_status <> 'running' OR admission_count <> 0 THEN
    RAISE EXCEPTION
      'suspended-series terminal rejection was not atomic: status=%, admissions=%',
      run_status, admission_count;
  END IF;
END
$verify_suspended_series_terminal_rollback$;

RESET ROLE;
UPDATE evidence.series
SET status = 'active'
WHERE id = '078f47ac-19fc-7c92-ae91-0242ac120009';

SET LOCAL ROLE economyos_ingest;
SET LOCAL app.organization_id = '078f47ac-19fc-7c92-ae91-0242ac120001';

DO $commit_complete_terminal_transition$
DECLARE
  output_manifest jsonb;
  observation_set jsonb := jsonb_build_array(
    '078f47ac-19fc-7c92-ae91-0242ac120016'
  );
  reconciliation jsonb := jsonb_build_object(
    'expectedRows', 1,
    'persistedRows', 1,
    'missingPeriods', '[]'::jsonb,
    'unexpectedPeriods', '[]'::jsonb,
    'mismatchedPeriods', '[]'::jsonb,
    'checkpointSha256', repeat('d', 64)
  );
BEGIN
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'runId', run.id::text,
    'status', 'succeeded',
    'inputSha256', run.input_sha256,
    'rawPayloads', jsonb_build_array(jsonb_build_object(
      'payloadId', '078f47ac-19fc-7c92-ae91-0242ac120011',
      'requestUri', 'https://example.invalid/terminal-admission/data',
      'objectUri', 's3://verification-only/terminal-admission.json',
      'mediaType', 'application/json',
      'checksumSha256', repeat('a', 64),
      'byteLength', 42,
      'fetchedAt', '2026-08-31T02:00:02Z',
      'providerRequestId', NULL
    )),
    'transformationRunId', '078f47ac-19fc-7c92-ae91-0242ac120012',
    'releaseId', '078f47ac-19fc-7c92-ae91-0242ac120015',
    'observationIds', observation_set,
    'observationSetSha256', encode(digest(convert_to(
      evidence.canonical_json(observation_set), 'UTF8'
    ), 'sha256'), 'hex'),
    'candidateSha256', repeat('c', 64),
    'qualityScore', 1,
    'qualityResults', jsonb_build_array(
      jsonb_build_object('checkCode', 'admission', 'status', 'pass'),
      jsonb_build_object('checkCode', 'row_bounds', 'status', 'pass')
    ),
    'reconciliation', reconciliation,
    'completedAt', '2026-08-31T02:00:06Z'
  ) INTO output_manifest
  FROM evidence.ingestion_runs run
  WHERE run.id = '078f47ac-19fc-7c92-ae91-0242ac120010';

  PERFORM evidence.transition_ingestion_run(
    '078f47ac-19fc-7c92-ae91-0242ac120010',
    'running', 'succeeded', 'reconcile', 1,
    '{"checkpoint":"canonical-periods"}', output_manifest, NULL,
    '2026-08-31T02:00:06Z'
  );
END
$commit_complete_terminal_transition$;

DO $verify_terminal_admission_committed_atomically$
DECLARE
  run_status text;
  run_completed_at timestamptz;
  output_digest text;
  succeeded_event_count integer;
  admission_count integer;
  admitted_at timestamptz;
  admission_basis text;
BEGIN
  SELECT status, completed_at, output_sha256
    INTO run_status, run_completed_at, output_digest
  FROM evidence.ingestion_runs
  WHERE id = '078f47ac-19fc-7c92-ae91-0242ac120010';
  SELECT count(*) INTO succeeded_event_count
  FROM evidence.ingestion_run_events
  WHERE ingestion_run_id = '078f47ac-19fc-7c92-ae91-0242ac120010'
    AND status = 'succeeded';
  SELECT count(*), min(admission.admitted_at), min(admission.basis)
    INTO admission_count, admitted_at, admission_basis
  FROM evidence.canonical_admissions admission
  WHERE admission.ingestion_run_id = '078f47ac-19fc-7c92-ae91-0242ac120010'
    AND admission.observation_id = '078f47ac-19fc-7c92-ae91-0242ac120016';

  IF run_status <> 'succeeded' OR run_completed_at <> '2026-08-31T02:00:06Z'
    OR output_digest !~ '^[0-9a-f]{64}$' OR succeeded_event_count <> 1
    OR admission_count <> 1 OR admitted_at <> run_completed_at
    OR admission_basis <> 'durable_ingestion_v1'
  THEN
    RAISE EXCEPTION
      'terminal success and canonical admission did not commit together: status=%, events=%, admissions=%',
      run_status, succeeded_event_count, admission_count;
  END IF;
END
$verify_terminal_admission_committed_atomically$;

RESET ROLE;
SELECT set_config(
  'app.verify_terminal_admission_created_at',
  (
    SELECT created_at::text
    FROM evidence.canonical_admissions
    WHERE observation_id = '078f47ac-19fc-7c92-ae91-0242ac120016'
  ),
  true
);
SET LOCAL ROLE economyos_app;
SET LOCAL app.organization_id = '078f47ac-19fc-7c92-ae91-0242ac120001';

DO $verify_post_admission_visibility_and_isolation$
DECLARE
  own_governed_count integer;
  foreign_governed_count integer;
  before_system_count integer;
  admitted_system_count integer;
  admission_created_at timestamptz;
BEGIN
  SELECT count(*) INTO own_governed_count
  FROM evidence.governed_observations_as_known(
    '078f47ac-19fc-7c92-ae91-0242ac120009',
    '2026-09-01T00:00:00Z', 'true_vintage', NULL, 'view', 100
  );
  admission_created_at := current_setting(
    'app.verify_terminal_admission_created_at'
  )::timestamptz;
  SELECT count(*) INTO before_system_count
  FROM evidence.governed_observations_as_known(
    '078f47ac-19fc-7c92-ae91-0242ac120009',
    '2026-09-01T00:00:00Z', 'reconstructed',
    admission_created_at - interval '1 microsecond', 'view', 100
  );
  SELECT count(*) INTO admitted_system_count
  FROM evidence.governed_observations_as_known(
    '078f47ac-19fc-7c92-ae91-0242ac120009',
    '2026-09-01T00:00:00Z', 'reconstructed',
    admission_created_at, 'view', 100
  );

  PERFORM set_config(
    'app.organization_id', '078f47ac-19fc-7c92-ae91-0242ac120002', true
  );
  SELECT count(*) INTO foreign_governed_count
  FROM evidence.governed_observations_as_known(
    '078f47ac-19fc-7c92-ae91-0242ac120009',
    '2026-09-01T00:00:00Z', 'true_vintage', NULL, 'view', 100
  );
  IF own_governed_count <> 1
    OR before_system_count <> 0 OR admitted_system_count <> 1
    OR foreign_governed_count <> 0
  THEN
    RAISE EXCEPTION
      'terminal serving time/isolation failed: own=%, system=(%, %), foreign=%',
      own_governed_count, before_system_count, admitted_system_count,
      foreign_governed_count;
  END IF;
END
$verify_post_admission_visibility_and_isolation$;

RESET ROLE;
ROLLBACK;
