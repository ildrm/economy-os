BEGIN;

SET LOCAL ROLE economyos_ingest;

INSERT INTO evidence.ingestion_runs (
  id, dataset_id, workflow_id, idempotency_key, input_manifest, input_sha256,
  requested_at
)
SELECT
  '048f47ac-19fc-7c92-ae91-0242ac120001',
  '038f47ac-19fc-7c92-ae91-0242ac120003',
  'verify-ingestion-workflow',
  repeat('1', 64),
  manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  '2026-08-31T01:00:00Z'
FROM (VALUES (
  '{"connector":"world-bank-v2","countryCode":"USA","endYear":2024,"startYear":2024}'::jsonb
)) input(manifest);

DO $verify_initial_event$
DECLARE
  event_count integer;
  initial_status text;
BEGIN
  SELECT count(*), min(status) INTO event_count, initial_status
  FROM evidence.ingestion_run_events
  WHERE ingestion_run_id = '048f47ac-19fc-7c92-ae91-0242ac120001';
  IF event_count <> 1 OR initial_status <> 'pending' THEN
    RAISE EXCEPTION 'ingestion request did not atomically create its initial event';
  END IF;
END
$verify_initial_event$;

SELECT evidence.transition_ingestion_run(
  '048f47ac-19fc-7c92-ae91-0242ac120001',
  'pending', 'running', 'workflow', 1,
  '{"worker":"verification"}', NULL, NULL, '2026-08-31T01:00:01Z'
);

-- At-least-once replay after a lost response must return the committed row,
-- even though the caller still presents its pre-commit expected status.
SELECT evidence.transition_ingestion_run(
  '048f47ac-19fc-7c92-ae91-0242ac120001',
  'pending', 'running', 'workflow', 1,
  '{"worker":"verification"}', NULL, NULL, '2026-08-31T01:00:01Z'
);

DO $verify_conflicting_replay$
BEGIN
  BEGIN
    PERFORM evidence.transition_ingestion_run(
      '048f47ac-19fc-7c92-ae91-0242ac120001',
      'pending', 'running', 'workflow', 1,
      '{"worker":"different"}', NULL, NULL, '2026-08-31T01:00:01Z'
    );
    RAISE EXCEPTION 'conflicting ingestion replay unexpectedly succeeded';
  EXCEPTION
    WHEN serialization_failure THEN NULL;
  END;
END
$verify_conflicting_replay$;

INSERT INTO evidence.ingestion_checkpoints (
  id, ingestion_run_id, stage, checkpoint_key, value, value_sha256,
  payload_checksum_sha256, committed_at
)
SELECT
  '048f47ac-19fc-7c92-ae91-0242ac120002',
  '048f47ac-19fc-7c92-ae91-0242ac120001',
  'persist',
  'raw-page-1',
  checkpoint,
  encode(digest(convert_to(evidence.canonical_json(checkpoint), 'UTF8'), 'sha256'), 'hex'),
  repeat('a', 64),
  '2026-08-31T01:00:02Z'
FROM (VALUES ('{"objectUri":"s3://verification/raw.bin","page":1}'::jsonb)) input(checkpoint);

DO $verify_checkpoint_guards$
BEGIN
  BEGIN
    UPDATE evidence.ingestion_checkpoints
    SET value = '{"objectUri":"s3://verification/changed.bin","page":1}'
    WHERE id = '048f47ac-19fc-7c92-ae91-0242ac120002';
    RAISE EXCEPTION 'checkpoint mutation unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO evidence.ingestion_checkpoints (
      id, ingestion_run_id, stage, checkpoint_key, value, value_sha256, committed_at
    ) VALUES (
      '048f47ac-19fc-7c92-ae91-0242ac120003',
      '048f47ac-19fc-7c92-ae91-0242ac120001',
      'persist', 'raw-page-1', '{"different":true}', repeat('0', 64),
      '2026-08-31T01:00:03Z'
    );
    RAISE EXCEPTION 'conflicting checkpoint unexpectedly succeeded';
  EXCEPTION
    WHEN check_violation OR unique_violation THEN NULL;
  END;
END
$verify_checkpoint_guards$;

SELECT evidence.transition_ingestion_run(
  '048f47ac-19fc-7c92-ae91-0242ac120001',
  'running', 'running', 'persist', 1,
  '{"checkpoint":"raw-page-1"}', NULL, NULL, '2026-08-31T01:00:02Z'
);

SELECT evidence.transition_ingestion_run(
  '048f47ac-19fc-7c92-ae91-0242ac120001',
  'running', 'quarantined', 'quality', 1,
  '{"failedChecks":["row_bounds"]}',
  '{"decision":"quarantined","failedChecks":["row_bounds"],"payloadChecksums":["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]}',
  'QUALITY_GATE_FAILED',
  '2026-08-31T01:00:03Z'
);

-- Terminal retries are idempotent too.
SELECT evidence.transition_ingestion_run(
  '048f47ac-19fc-7c92-ae91-0242ac120001',
  'running', 'quarantined', 'quality', 1,
  '{"failedChecks":["row_bounds"]}',
  '{"decision":"quarantined","failedChecks":["row_bounds"],"payloadChecksums":["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]}',
  'QUALITY_GATE_FAILED',
  '2026-08-31T01:00:03Z'
);

DO $verify_terminal_state$
DECLARE
  run_status text;
  event_count integer;
  output_digest text;
BEGIN
  SELECT status, output_sha256 INTO run_status, output_digest
  FROM evidence.ingestion_runs
  WHERE id = '048f47ac-19fc-7c92-ae91-0242ac120001';
  SELECT count(*) INTO event_count
  FROM evidence.ingestion_run_events
  WHERE ingestion_run_id = '048f47ac-19fc-7c92-ae91-0242ac120001';
  IF run_status <> 'quarantined' OR event_count <> 4
    OR output_digest !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'durable ingestion terminal evidence is inconsistent';
  END IF;
END
$verify_terminal_state$;

DO $verify_direct_update_denied$
BEGIN
  BEGIN
    UPDATE evidence.ingestion_runs SET status = 'failed'
    WHERE id = '048f47ac-19fc-7c92-ae91-0242ac120001';
    RAISE EXCEPTION 'direct ingestion run update unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_direct_update_denied$;

RESET ROLE;
ROLLBACK;
