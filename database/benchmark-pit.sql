\set ON_ERROR_STOP on

BEGIN;

-- This transaction-only fixture exercises the governed SQL serving path with
-- 50,000 revisioned rows. It is rolled back and must never be treated as
-- economic evidence.
INSERT INTO app.organizations (id, slug, name)
VALUES ('048f47ac-19fc-7c92-ae91-0242ac120001', 'pit-benchmark', 'PIT benchmark fixture');
INSERT INTO app.subjects (id, issuer, external_subject, kind)
VALUES (
  '048f47ac-19fc-7c92-ae91-0242ac120002',
  'https://identity.economyos.test/',
  'pit-benchmark',
  'service'
);
INSERT INTO app.organization_memberships (
  organization_id, subject_id, role, valid_from
) VALUES (
  '048f47ac-19fc-7c92-ae91-0242ac120001',
  '048f47ac-19fc-7c92-ae91-0242ac120002',
  'admin',
  '2026-01-01T00:00:00Z'
);

CREATE TEMPORARY TABLE pit_benchmark_revisions (
  revision integer PRIMARY KEY,
  raw_payload_id uuid NOT NULL,
  release_id uuid NOT NULL,
  transformation_run_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO pit_benchmark_revisions
SELECT revision, gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
FROM generate_series(0, 4) AS revision;

INSERT INTO evidence.raw_payloads (
  id, dataset_id, request_uri, object_uri, media_type, checksum_sha256,
  byte_length, fetched_at, parser_name, parser_version, recorded_at
)
SELECT
  raw_payload_id,
  '038f47ac-19fc-7c92-ae91-0242ac120003',
  'https://example.invalid/pit-benchmark/' || revision,
  's3://verification-only/pit-benchmark-' || revision || '.json',
  'application/json',
  lpad(to_hex(revision + 1), 64, '0'),
  1024,
  '2026-01-01T00:00:00Z'::timestamptz + make_interval(days => revision),
  'pit-benchmark',
  '1',
  '2026-01-01T00:01:00Z'::timestamptz + make_interval(days => revision)
FROM pit_benchmark_revisions;

INSERT INTO evidence.transformation_runs (
  id, dataset_id, raw_payload_id, parser_name, parser_version, code_sha256,
  configuration, configuration_sha256, status, started_at, completed_at,
  workflow_id
)
SELECT
  transformation_run_id,
  '038f47ac-19fc-7c92-ae91-0242ac120003',
  raw_payload_id,
  'pit-benchmark',
  '1',
  repeat('1', 64),
  jsonb_build_object('benchmark', true, 'revision', revision),
  encode(digest(convert_to(evidence.canonical_json(
    jsonb_build_object('benchmark', true, 'revision', revision)
  ), 'UTF8'), 'sha256'), 'hex'),
  'succeeded',
  '2026-01-01T00:00:00Z'::timestamptz + make_interval(days => revision),
  '2026-01-01T00:01:00Z'::timestamptz + make_interval(days => revision),
  'pit-benchmark-' || revision
FROM pit_benchmark_revisions;

INSERT INTO evidence.quality_results (
  dataset_id, raw_payload_id, transformation_run_id,
  check_code, status, details, checked_at
)
SELECT
  '038f47ac-19fc-7c92-ae91-0242ac120003',
  raw_payload_id,
  transformation_run_id,
  'admission',
  'pass',
  jsonb_build_object('fixture', 'transaction-only-pit-benchmark'),
  '2026-01-01T00:01:00Z'::timestamptz + make_interval(days => revision)
FROM pit_benchmark_revisions;

INSERT INTO evidence.releases (
  id, dataset_id, raw_payload_id, external_release_key, pit_quality,
  revision_sequence, revision_time, recorded_at
)
SELECT
  release_id,
  '038f47ac-19fc-7c92-ae91-0242ac120003',
  raw_payload_id,
  'pit-benchmark-' || revision,
  'latest_revised_only',
  revision,
  '2026-01-01T00:01:00Z'::timestamptz + make_interval(days => revision),
  '2026-01-01T00:01:00Z'::timestamptz + make_interval(days => revision)
FROM pit_benchmark_revisions;

INSERT INTO evidence.observations (
  series_id, release_id, period_start, period_end, value_numeric, status,
  parser_version, recorded_at, transformation_run_id
)
SELECT
  '038f47ac-19fc-7c92-ae91-0242ac120007',
  revisions.release_id,
  '1900-01-01T00:00:00Z'::timestamptz + make_interval(days => period),
  '1900-01-02T00:00:00Z'::timestamptz + make_interval(days => period),
  (period * 10 + revisions.revision)::numeric / 10,
  'final',
  '1',
  '2026-01-01T00:01:00Z'::timestamptz + make_interval(days => revisions.revision),
  revisions.transformation_run_id
FROM generate_series(0, 9999) AS period
CROSS JOIN pit_benchmark_revisions AS revisions;

WITH candidates AS (
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
  WHERE transformation.workflow_id LIKE 'pit-benchmark-%'
)
INSERT INTO evidence.canonical_admissions (
  organization_id, observation_id, transformation_run_id, release_id,
  basis, admission_manifest, admission_sha256, admitted_at
)
SELECT
  organization_id, observation_id, transformation_run_id, release_id,
  'legacy_verified_v1', manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  completed_at
FROM candidates;

ANALYZE evidence.raw_payloads;
ANALYZE evidence.releases;
ANALYZE evidence.transformation_runs;
ANALYZE evidence.quality_results;
ANALYZE evidence.observations;
ANALYZE evidence.canonical_admissions;
ANALYZE evidence.canonical_admission_evidence_sets;

SET LOCAL app.organization_id = '048f47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '048f47ac-19fc-7c92-ae91-0242ac120002';

DO $benchmark$
DECLARE
  started_at timestamptz;
  warmup_samples double precision[] := '{}'::double precision[];
  elapsed_samples double precision[] := '{}'::double precision[];
  elapsed_ms double precision;
  result_count integer;
  sample integer;
  p50_ms double precision;
  p95_ms double precision;
  max_ms double precision;
  warmup_max_ms double precision;
BEGIN
  -- Separate plan/cache warm-up from the steady-state percentile. The first
  -- call is still bounded below so a pathological cold path cannot be hidden.
  FOR sample IN 1..3 LOOP
    started_at := clock_timestamp();
    SELECT count(*) INTO result_count
    FROM evidence.governed_observations_as_known(
      '038f47ac-19fc-7c92-ae91-0242ac120007',
      '2100-01-01T00:00:00Z',
      'latest_revised',
      NULL,
      'api',
      10000
    );
    elapsed_ms := extract(epoch FROM clock_timestamp() - started_at) * 1000;
    warmup_samples := array_append(warmup_samples, elapsed_ms);
    IF result_count <> 10000 THEN
      RAISE EXCEPTION 'PIT benchmark warm-up returned % rows instead of 10000', result_count;
    END IF;
  END LOOP;

  FOR sample IN 1..20 LOOP
    started_at := clock_timestamp();
    SELECT count(*) INTO result_count
    FROM evidence.governed_observations_as_known(
      '038f47ac-19fc-7c92-ae91-0242ac120007',
      '2100-01-01T00:00:00Z',
      'latest_revised',
      NULL,
      'api',
      10000
    );
    elapsed_ms := extract(epoch FROM clock_timestamp() - started_at) * 1000;
    elapsed_samples := array_append(elapsed_samples, elapsed_ms);
    IF result_count <> 10000 THEN
      RAISE EXCEPTION 'PIT benchmark returned % rows instead of 10000', result_count;
    END IF;
  END LOOP;

  SELECT
    percentile_cont(0.5) WITHIN GROUP (ORDER BY value),
    percentile_cont(0.95) WITHIN GROUP (ORDER BY value),
    max(value)
  INTO p50_ms, p95_ms, max_ms
  FROM unnest(elapsed_samples) AS value;
  SELECT max(value) INTO warmup_max_ms
  FROM unnest(warmup_samples) AS value;

  RAISE NOTICE 'PIT database benchmark: 50000 rows, 10000 selected, warm-up max=% ms, p50=% ms, p95=% ms, max=% ms',
    round(warmup_max_ms::numeric, 2), round(p50_ms::numeric, 2),
    round(p95_ms::numeric, 2), round(max_ms::numeric, 2);
  IF warmup_max_ms > 2000 THEN
    RAISE EXCEPTION 'PIT database benchmark warm-up max % ms exceeds 2000 ms cold-path gate',
      round(warmup_max_ms::numeric, 2);
  END IF;
  IF p95_ms > 1000 THEN
    RAISE EXCEPTION 'PIT database benchmark p95 % ms exceeds 1000 ms gate', round(p95_ms::numeric, 2);
  END IF;
END
$benchmark$;

ROLLBACK;
