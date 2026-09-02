BEGIN;

INSERT INTO evidence.license_reviews (
  id, source_slug, dataset_external_key, evidence_uri, license_expression,
  intended_uses, evidence, reviewed_by, reviewed_at
) VALUES (
  '028f47ac-19fc-7c92-ae91-0242ac120020',
  'official-fixture',
  'fixture.gdp',
  'https://example.invalid/official-fixture/license',
  'TEST-ONLY',
  ARRAY['view'],
  '{"fixture":true}'::jsonb,
  'database verification',
  '2025-01-01T00:00:00Z'
);
INSERT INTO evidence.sources (
  id, slug, name, authority_class, homepage_uri, license_status, license_expression,
  redistribution_allowed, reviewed_at, license_review_id, attribution_text, permitted_actions
) VALUES (
  '028f47ac-19fc-7c92-ae91-0242ac120001',
  'official-fixture',
  'Official fixture source',
  'official',
  'https://example.invalid/official-fixture',
  'approved',
  'TEST-ONLY',
  false,
  '2025-01-01T00:00:00Z',
  '028f47ac-19fc-7c92-ae91-0242ac120020',
  'Verification fixture; not production data.',
  ARRAY['view']
);
INSERT INTO evidence.source_datasets (
  id, source_id, external_key, title, pit_quality, admission_status, admitted_at
) VALUES (
  '028f47ac-19fc-7c92-ae91-0242ac120002',
  '028f47ac-19fc-7c92-ae91-0242ac120001',
  'fixture.gdp',
  'PIT verification fixture',
  'true_vintage',
  'approved',
  '2025-01-01T00:00:00Z'
);
INSERT INTO evidence.source_admission_events (
  id, source_id, dataset_id, decision, permitted_actions, license_review_id,
  reason, decided_by, decided_at, recorded_at
) VALUES
  (
    '028f47ac-19fc-7c92-ae91-0242ac120031',
    '028f47ac-19fc-7c92-ae91-0242ac120001',
    '028f47ac-19fc-7c92-ae91-0242ac120002',
    'suspended', '{}'::text[],
    '028f47ac-19fc-7c92-ae91-0242ac120020',
    'Verification suspension before legal approval.', 'database verification',
    '2025-06-01T09:04:30Z', '2025-06-01T09:04:30Z'
  ),
  (
    '028f47ac-19fc-7c92-ae91-0242ac120032',
    '028f47ac-19fc-7c92-ae91-0242ac120001',
    '028f47ac-19fc-7c92-ae91-0242ac120002',
    'approved', ARRAY['view'],
    '028f47ac-19fc-7c92-ae91-0242ac120020',
    'Verification approval after the earlier cutoff.', 'database verification',
    '2025-06-01T09:06:00Z', '2025-06-01T09:06:00Z'
  );
INSERT INTO evidence.raw_payloads (
  id, dataset_id, request_uri, object_uri, media_type, checksum_sha256,
  byte_length, fetched_at, parser_name, parser_version, recorded_at
) VALUES
  (
    '028f47ac-19fc-7c92-ae91-0242ac120003',
    '028f47ac-19fc-7c92-ae91-0242ac120002',
    'https://example.invalid/fixture/original',
    's3://verification-only/original.json',
    'application/json', repeat('a', 64), 10,
    '2025-03-01T09:04:00Z', 'verification', '1', '2025-03-01T09:05:00Z'
  ),
  (
    '028f47ac-19fc-7c92-ae91-0242ac120004',
    '028f47ac-19fc-7c92-ae91-0242ac120002',
    'https://example.invalid/fixture/revision',
    's3://verification-only/revision.json',
    'application/json', repeat('b', 64), 10,
    '2025-06-01T09:03:00Z', 'verification', '1', '2025-06-01T09:04:00Z'
  ),
  (
    '028f47ac-19fc-7c92-ae91-0242ac120005',
    '028f47ac-19fc-7c92-ae91-0242ac120002',
    'https://example.invalid/fixture/late',
    's3://verification-only/late.json',
    'application/json', repeat('c', 64), 10,
    '2025-08-01T08:59:00Z', 'verification', '1', '2025-08-01T09:00:00Z'
  ),
  (
    '028f47ac-19fc-7c92-ae91-0242ac120025',
    '028f47ac-19fc-7c92-ae91-0242ac120002',
    'https://example.invalid/fixture/latest-only',
    's3://verification-only/latest-only.json',
    'application/json', repeat('d', 64), 10,
    '2026-01-01T08:59:00Z', 'verification', '1', '2026-01-01T09:00:00Z'
  );
INSERT INTO evidence.geographies (id, kind, code_scheme, code, name, valid_from) VALUES (
  '028f47ac-19fc-7c92-ae91-0242ac120006', 'country', 'ISO-3166-1-alpha3', 'TST', 'Test economy', '2000-01-01'
);
INSERT INTO evidence.transformation_runs (
  id, dataset_id, raw_payload_id, parser_name, parser_version, code_sha256,
  configuration, configuration_sha256, status, started_at, completed_at, workflow_id
) VALUES
  (
    '028f47ac-19fc-7c92-ae91-0242ac120021',
    '028f47ac-19fc-7c92-ae91-0242ac120002',
    '028f47ac-19fc-7c92-ae91-0242ac120003',
    'verification', '1', repeat('1', 64), '{}'::jsonb, repeat('0', 64),
    'succeeded', '2025-03-01T09:04:00Z', '2025-03-01T09:05:00Z', 'verify-original'
  ),
  (
    '028f47ac-19fc-7c92-ae91-0242ac120022',
    '028f47ac-19fc-7c92-ae91-0242ac120002',
    '028f47ac-19fc-7c92-ae91-0242ac120004',
    'verification', '1', repeat('1', 64), '{}'::jsonb, repeat('0', 64),
    'succeeded', '2025-06-01T09:03:00Z', '2025-06-01T09:04:00Z', 'verify-revision'
  ),
  (
    '028f47ac-19fc-7c92-ae91-0242ac120023',
    '028f47ac-19fc-7c92-ae91-0242ac120002',
    '028f47ac-19fc-7c92-ae91-0242ac120005',
    'verification', '1', repeat('1', 64), '{}'::jsonb, repeat('0', 64),
    'succeeded', '2025-08-01T08:59:00Z', '2025-08-01T09:00:00Z', 'verify-late'
  ),
  (
    '028f47ac-19fc-7c92-ae91-0242ac120026',
    '028f47ac-19fc-7c92-ae91-0242ac120002',
    '028f47ac-19fc-7c92-ae91-0242ac120025',
    'verification', '1', repeat('1', 64), '{}'::jsonb, repeat('0', 64),
    'succeeded', '2026-01-01T08:59:00Z', '2026-01-01T09:00:00Z', 'verify-latest-only'
  ),
  (
    '028f47ac-19fc-7c92-ae91-0242ac120029',
    '028f47ac-19fc-7c92-ae91-0242ac120002',
    '028f47ac-19fc-7c92-ae91-0242ac120003',
    'verification', '2', repeat('2', 64), '{"correction":"decimal parser"}'::jsonb,
    repeat('2', 64), 'succeeded',
    '2025-03-02T00:00:00Z', '2025-03-02T00:01:00Z', 'verify-parser-v2'
  );
INSERT INTO evidence.quality_results (
  dataset_id, raw_payload_id, transformation_run_id,
  check_code, status, details, checked_at
) VALUES
  ('028f47ac-19fc-7c92-ae91-0242ac120002', '028f47ac-19fc-7c92-ae91-0242ac120003',
   '028f47ac-19fc-7c92-ae91-0242ac120021',
   'admission', 'pass', '{"fixture":true}', '2025-03-01T09:05:00Z'),
  ('028f47ac-19fc-7c92-ae91-0242ac120002', '028f47ac-19fc-7c92-ae91-0242ac120004',
   '028f47ac-19fc-7c92-ae91-0242ac120022',
   'admission', 'pass', '{"fixture":true}', '2025-06-01T09:04:00Z'),
  ('028f47ac-19fc-7c92-ae91-0242ac120002', '028f47ac-19fc-7c92-ae91-0242ac120005',
   '028f47ac-19fc-7c92-ae91-0242ac120023',
   'admission', 'pass', '{"fixture":true}', '2025-08-01T09:00:00Z'),
  ('028f47ac-19fc-7c92-ae91-0242ac120002', '028f47ac-19fc-7c92-ae91-0242ac120025',
   '028f47ac-19fc-7c92-ae91-0242ac120026',
   'admission', 'pass', '{"fixture":true}', '2026-01-01T09:00:00Z'),
  ('028f47ac-19fc-7c92-ae91-0242ac120002', '028f47ac-19fc-7c92-ae91-0242ac120003',
   '028f47ac-19fc-7c92-ae91-0242ac120029',
   'admission', 'pass', '{"correctedParser":true}', '2025-03-02T00:01:00Z'),
  ('028f47ac-19fc-7c92-ae91-0242ac120002', '028f47ac-19fc-7c92-ae91-0242ac120003',
   '028f47ac-19fc-7c92-ae91-0242ac120021',
   'decimal_bounds', 'fail', '{"parserVersion":"1"}', '2025-03-01T09:05:00Z');
INSERT INTO evidence.concepts (
  id, canonical_key, name, definition, measurement_class, ontology_version
) VALUES (
  '028f47ac-19fc-7c92-ae91-0242ac120007',
  'economy.output.test',
  'Test output',
  'Verification-only output concept.',
  'direct',
  'verification-1'
);
INSERT INTO evidence.series (
  id, dataset_id, concept_id, geography_id, external_series_key, unit_code,
  frequency, seasonal_adjustment, data_class
) VALUES (
  '028f47ac-19fc-7c92-ae91-0242ac120008',
  '028f47ac-19fc-7c92-ae91-0242ac120002',
  '028f47ac-19fc-7c92-ae91-0242ac120007',
  '028f47ac-19fc-7c92-ae91-0242ac120006',
  'fixture.gdp.TST', 'index_points', 'annual', 'unadjusted', 'observed'
);
INSERT INTO evidence.series (
  id, dataset_id, concept_id, geography_id, external_series_key, unit_code,
  frequency, seasonal_adjustment, data_class
) VALUES (
  '028f47ac-19fc-7c92-ae91-0242ac120015',
  '028f47ac-19fc-7c92-ae91-0242ac120002',
  '028f47ac-19fc-7c92-ae91-0242ac120007',
  '028f47ac-19fc-7c92-ae91-0242ac120006',
  'fixture.demo.TST', 'index_points', 'annual', 'unadjusted', 'synthetic_demo'
);
INSERT INTO evidence.releases (
  id, dataset_id, raw_payload_id, external_release_key,
  release_time, source_publication_time, original_release_time, availability_time,
  revision_time, pit_quality, revision_sequence, recorded_at
) VALUES
  (
    '028f47ac-19fc-7c92-ae91-0242ac120009',
    '028f47ac-19fc-7c92-ae91-0242ac120002',
    '028f47ac-19fc-7c92-ae91-0242ac120003',
    '2024-original', '2025-03-01T09:00:00Z', '2025-03-01T09:00:00Z',
    '2025-03-01T09:00:00Z', '2025-03-01T09:00:00Z', '2025-03-01T09:00:00Z',
    'true_vintage', 0, '2025-03-01T09:05:00Z'
  ),
  (
    '028f47ac-19fc-7c92-ae91-0242ac120010',
    '028f47ac-19fc-7c92-ae91-0242ac120002',
    '028f47ac-19fc-7c92-ae91-0242ac120004',
    '2024-revision', '2025-06-01T09:00:00Z', '2025-06-01T09:00:00Z',
    '2025-03-01T09:00:00Z', '2025-06-01T09:00:00Z', '2025-06-01T09:00:00Z',
    'true_vintage', 1, '2025-06-01T09:04:00Z'
  ),
  (
    '028f47ac-19fc-7c92-ae91-0242ac120011',
    '028f47ac-19fc-7c92-ae91-0242ac120002',
    '028f47ac-19fc-7c92-ae91-0242ac120005',
    '2023-late', '2025-02-01T09:00:00Z', '2025-02-01T09:00:00Z',
    '2025-02-01T09:00:00Z', '2025-02-01T09:00:00Z', '2025-02-01T09:00:00Z',
    'true_vintage', 0, '2025-08-01T09:00:00Z'
  ),
  (
    '028f47ac-19fc-7c92-ae91-0242ac120027',
    '028f47ac-19fc-7c92-ae91-0242ac120002',
    '028f47ac-19fc-7c92-ae91-0242ac120025',
    '2022-current-view', NULL, NULL, NULL, NULL, NULL,
    'latest_revised_only', NULL, '2026-01-01T09:00:00Z'
  );
INSERT INTO evidence.observations (
  id, series_id, release_id, period_start, period_end, value_numeric,
  status, supersedes_observation_id, parser_version, recorded_at, transformation_run_id
) VALUES
  (
    '028f47ac-19fc-7c92-ae91-0242ac120012',
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '028f47ac-19fc-7c92-ae91-0242ac120009',
    '2024-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 100.25,
    'final', NULL, '1', '2025-03-01T09:05:00Z', '028f47ac-19fc-7c92-ae91-0242ac120021'
  ),
  (
    '028f47ac-19fc-7c92-ae91-0242ac120013',
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '028f47ac-19fc-7c92-ae91-0242ac120010',
    '2024-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 101.75,
    'final', '028f47ac-19fc-7c92-ae91-0242ac120012', '1', '2025-06-01T09:04:00Z',
    '028f47ac-19fc-7c92-ae91-0242ac120022'
  ),
  (
    '028f47ac-19fc-7c92-ae91-0242ac120014',
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '028f47ac-19fc-7c92-ae91-0242ac120011',
    '2023-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 99.5,
    'final', NULL, '1', '2025-08-01T09:00:00Z', '028f47ac-19fc-7c92-ae91-0242ac120023'
  ),
  (
    '028f47ac-19fc-7c92-ae91-0242ac120016',
    '028f47ac-19fc-7c92-ae91-0242ac120015',
    '028f47ac-19fc-7c92-ae91-0242ac120009',
    '2024-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 999,
    'final', NULL, '1', '2025-03-01T09:05:00Z', '028f47ac-19fc-7c92-ae91-0242ac120021'
  ),
  (
    '028f47ac-19fc-7c92-ae91-0242ac120024',
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '028f47ac-19fc-7c92-ae91-0242ac120009',
    '2025-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 110,
    'final', NULL, '2', '2025-03-02T00:01:00Z', '028f47ac-19fc-7c92-ae91-0242ac120029'
  ),
  (
    '028f47ac-19fc-7c92-ae91-0242ac120028',
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '028f47ac-19fc-7c92-ae91-0242ac120027',
    '2022-01-01T00:00:00Z', '2023-01-01T00:00:00Z', 98,
    'final', NULL, '1', '2026-01-01T09:00:00Z', '028f47ac-19fc-7c92-ae91-0242ac120026'
  );

INSERT INTO evidence.observations (
  id, series_id, release_id, period_start, period_end, value_numeric,
  status, supersedes_observation_id, parser_version, recorded_at, transformation_run_id
) VALUES (
  '028f47ac-19fc-7c92-ae91-0242ac120030',
  '028f47ac-19fc-7c92-ae91-0242ac120008',
  '028f47ac-19fc-7c92-ae91-0242ac120009',
  '2024-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 100.5,
  'final', '028f47ac-19fc-7c92-ae91-0242ac120012', '2',
  '2025-03-02T00:01:00Z', '028f47ac-19fc-7c92-ae91-0242ac120029'
);

DO $verify_revision_link$
BEGIN
  BEGIN
    INSERT INTO evidence.observations (
      id, series_id, release_id, period_start, period_end, value_numeric,
      status, supersedes_observation_id, parser_version, recorded_at, transformation_run_id
    ) VALUES (
      '028f47ac-19fc-7c92-ae91-0242ac120017',
      '028f47ac-19fc-7c92-ae91-0242ac120015',
      '028f47ac-19fc-7c92-ae91-0242ac120010',
      '2024-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 1000,
      'final', '028f47ac-19fc-7c92-ae91-0242ac120012', '1', '2025-06-01T09:05:00Z',
      '028f47ac-19fc-7c92-ae91-0242ac120022'
    );
    RAISE EXCEPTION 'cross-series revision link unexpectedly succeeded';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END
$verify_revision_link$;

-- Legacy verification rows are admitted explicitly. Runtime roles have no
-- INSERT privilege on this table; durable production rows are admitted only
-- by the terminal ingestion transition.
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
  WHERE transformation.ingestion_run_id IS NULL
    AND transformation.status = 'succeeded'
    AND EXISTS (
      SELECT 1 FROM evidence.quality_results quality
      WHERE quality.tenant_scope = observation.tenant_scope
        AND quality.transformation_run_id = transformation.id
        AND quality.check_code = 'admission' AND quality.status = 'pass'
    )
    AND NOT EXISTS (
      SELECT 1 FROM evidence.quality_results quality
      WHERE quality.tenant_scope = observation.tenant_scope
        AND quality.transformation_run_id = transformation.id
        AND quality.status = 'fail'
    )
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

SET LOCAL app.organization_id = '018f47ac-19fc-7c92-ae91-0242ac120002';
SET LOCAL app.subject_id = '018f47ac-19fc-7c92-ae91-0242ac120006';

DO $verify_admission_serving_gates$
DECLARE
  visible_count integer;
BEGIN
  UPDATE evidence.source_datasets
  SET admission_status = 'quarantined', admitted_at = NULL
  WHERE id = '028f47ac-19fc-7c92-ae91-0242ac120002';
  SELECT count(*) INTO visible_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-04-01T00:00:00Z', 'true_vintage'
  );
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'quarantined dataset reached the governed serving path';
  END IF;
  UPDATE evidence.source_datasets
  SET admission_status = 'approved', admitted_at = '2025-01-01T00:00:00Z'
  WHERE id = '028f47ac-19fc-7c92-ae91-0242ac120002';

  UPDATE evidence.sources
  SET license_status = 'pending', permitted_actions = '{}'::text[]
  WHERE id = '028f47ac-19fc-7c92-ae91-0242ac120001';
  SELECT count(*) INTO visible_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-04-01T00:00:00Z', 'true_vintage'
  );
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'pending-license source reached the governed serving path';
  END IF;
  UPDATE evidence.sources
  SET license_status = 'approved', permitted_actions = ARRAY['view']::text[]
  WHERE id = '028f47ac-19fc-7c92-ae91-0242ac120001';
END
$verify_admission_serving_gates$;

SELECT set_config(
  'app.verify_historical_system_cutoff',
  (
    SELECT (max(admission.created_at) + interval '1 second')::text
    FROM evidence.canonical_admissions admission
    WHERE admission.organization_id IS NULL
  ),
  true
);

SET LOCAL ROLE economyos_app;
SET LOCAL app.organization_id = '018f47ac-19fc-7c92-ae91-0242ac120002';
SET LOCAL app.subject_id = '018f47ac-19fc-7c92-ae91-0242ac120006';

DO $verify_governed_observation_limit_fails_closed$
BEGIN
  BEGIN
    PERFORM *
    FROM evidence.governed_observations_as_known(
      '028f47ac-19fc-7c92-ae91-0242ac120008',
      '2025-04-01T00:00:00Z', 'true_vintage', NULL, 'view', NULL
    );
    RAISE EXCEPTION 'null maximum_rows unexpectedly removed the governed query bound';
  EXCEPTION
    WHEN invalid_parameter_value THEN NULL;
  END;
END
$verify_governed_observation_limit_fails_closed$;

DO $verify_pit$
DECLARE
  original_value numeric;
  revised_value numeric;
  strict_late_count integer;
  reconstructed_late_count integer;
  synthetic_count integer;
  future_true_count integer;
  future_reconstructed_count integer;
  future_latest_count integer;
  undocumented_reconstructed_count integer;
  undocumented_latest_count integer;
  corrected_provenance jsonb;
  failed_provenance jsonb;
  historical_system_cutoff timestamptz;
BEGIN
  historical_system_cutoff := current_setting(
    'app.verify_historical_system_cutoff'
  )::timestamptz;
  SELECT value_numeric INTO original_value
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-04-01T00:00:00Z', 'true_vintage'
  ) WHERE period_start = '2024-01-01T00:00:00Z';
  SELECT value_numeric INTO revised_value
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-07-01T00:00:00Z', 'true_vintage'
  ) WHERE period_start = '2024-01-01T00:00:00Z';
  SELECT count(*) INTO strict_late_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-04-01T00:00:00Z', 'true_vintage'
  ) WHERE period_start = '2023-01-01T00:00:00Z';
  SELECT count(*) INTO reconstructed_late_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-04-01T00:00:00Z', 'reconstructed', historical_system_cutoff
  ) WHERE period_start = '2023-01-01T00:00:00Z';
  SELECT count(*) INTO synthetic_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120015',
    '2025-04-01T00:00:00Z', 'true_vintage'
  );
  SELECT count(*) INTO future_true_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-07-01T00:00:00Z', 'true_vintage'
  ) WHERE period_start = '2025-01-01T00:00:00Z';
  SELECT count(*) INTO future_reconstructed_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-07-01T00:00:00Z', 'reconstructed', historical_system_cutoff
  ) WHERE period_start = '2025-01-01T00:00:00Z';
  SELECT count(*) INTO future_latest_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-07-01T00:00:00Z', 'latest_revised'
  ) WHERE period_start = '2025-01-01T00:00:00Z';
  SELECT count(*) INTO undocumented_reconstructed_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-04-01T00:00:00Z', 'reconstructed', historical_system_cutoff
  ) WHERE period_start = '2022-01-01T00:00:00Z';
  SELECT count(*) INTO undocumented_latest_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-04-01T00:00:00Z', 'latest_revised'
  ) WHERE period_start = '2022-01-01T00:00:00Z';
  SELECT evidence.governed_observation_provenance(
    '028f47ac-19fc-7c92-ae91-0242ac120030', 'view'
  ) INTO corrected_provenance;
  SELECT evidence.governed_observation_provenance(
    '028f47ac-19fc-7c92-ae91-0242ac120012', 'view'
  ) INTO failed_provenance;
  IF original_value <> 100.5 OR revised_value <> 101.75 THEN
    RAISE EXCEPTION 'release visibility failed: original=%, revised=%', original_value, revised_value;
  END IF;
  IF strict_late_count <> 0 OR reconstructed_late_count <> 1 THEN
    RAISE EXCEPTION 'late admission semantics failed: strict=%, reconstructed=%',
      strict_late_count, reconstructed_late_count;
  END IF;
  IF synthetic_count <> 0 THEN
    RAISE EXCEPTION 'synthetic observation reached the governed PIT query';
  END IF;
  IF future_true_count <> 0 OR future_reconstructed_count <> 0 OR future_latest_count <> 0 THEN
    RAISE EXCEPTION 'future economic period leaked: true=%, reconstructed=%, latest=%',
      future_true_count, future_reconstructed_count, future_latest_count;
  END IF;
  IF undocumented_reconstructed_count <> 0 OR undocumented_latest_count <> 1 THEN
    RAISE EXCEPTION 'undocumented release semantics failed: reconstructed=%, latest=%',
      undocumented_reconstructed_count, undocumented_latest_count;
  END IF;
  IF corrected_provenance #>> '{transformation,parserVersion}' <> '2'
    OR corrected_provenance #>> '{rawPayload,checksumSha256}' <> repeat('a', 64)
    OR failed_provenance IS NOT NULL
  THEN
    RAISE EXCEPTION 'parser-scoped quality or provenance selection failed';
  END IF;
END
$verify_pit$;

DO $verify_observation_append_only_permission$
BEGIN
  BEGIN
    UPDATE evidence.observations
      SET value_numeric = 999
      WHERE id = '028f47ac-19fc-7c92-ae91-0242ac120012';
    RAISE EXCEPTION 'observation mutation unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_observation_append_only_permission$;

RESET ROLE;

DO $verify_observation_append_only_trigger$
BEGIN
  BEGIN
    UPDATE evidence.observations
      SET value_numeric = 999
      WHERE id = '028f47ac-19fc-7c92-ae91-0242ac120012';
    RAISE EXCEPTION 'observation mutation unexpectedly bypassed the trigger';
  EXCEPTION
    WHEN SQLSTATE '55000' THEN NULL;
  END;
END
$verify_observation_append_only_trigger$;

DO $verify_system_time_and_function_privileges$
DECLARE
  public_execute_count integer;
BEGIN
  IF has_table_privilege(
      'economyos_ingest', 'evidence.quality_results', 'INSERT'
    )
    OR has_column_privilege(
      'economyos_ingest', 'evidence.quality_results', 'recorded_at', 'INSERT'
    )
    OR NOT has_column_privilege(
      'economyos_ingest', 'evidence.quality_results', 'details', 'INSERT'
    )
    OR has_table_privilege(
      'economyos_ingest', 'evidence.source_admission_events', 'INSERT'
    )
    OR has_function_privilege(
      'economyos_app',
      'evidence.source_action_is_currently_admitted(uuid,uuid,uuid,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_app',
      'evidence.source_action_is_admitted_as_known(uuid,uuid,text,timestamptz)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_app',
      'evidence.governed_observation_candidates_as_known(uuid,timestamptz,text,timestamptz,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_ingest',
      'evidence.governed_observation_candidates_as_known(uuid,timestamptz,text,timestamptz,text)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION '0022 runtime privilege boundary is incorrect';
  END IF;

  SELECT count(*) INTO public_execute_count
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  CROSS JOIN LATERAL aclexplode(
    coalesce(procedure.proacl, acldefault('f', procedure.proowner))
  ) privilege
  WHERE namespace.nspname = 'evidence'
    AND procedure.proname IN (
      'observations_as_known',
      'governed_observation_candidates_as_known',
      'source_action_is_currently_admitted',
      'economic_state_run_is_temporally_admitted',
      'validate_economic_state_temporal_admission_deferred'
    )
    AND privilege.grantee = 0
    AND privilege.privilege_type = 'EXECUTE';
  IF public_execute_count <> 0 THEN
    RAISE EXCEPTION 'sensitive 0022 function remains executable by PUBLIC';
  END IF;
END
$verify_system_time_and_function_privileges$;

-- Simulate a canonical admission written before the evidence-set trigger
-- existed. Historical policies that claim an explicit database cutoff must
-- fail closed, while current-system true vintage remains compatible.
INSERT INTO evidence.transformation_runs (
  id, dataset_id, raw_payload_id, parser_name, parser_version,
  code_sha256, configuration, configuration_sha256, status,
  started_at, completed_at, workflow_id
) VALUES (
  '028f47ac-19fc-7c92-ae91-0242ac120033',
  '028f47ac-19fc-7c92-ae91-0242ac120002',
  '028f47ac-19fc-7c92-ae91-0242ac120003',
  'verification', 'legacy', repeat('3', 64), '{}'::jsonb, repeat('0', 64),
  'succeeded', '2025-02-01T00:00:00Z', '2025-02-01T00:01:00Z',
  'verify-pre-0022'
);
INSERT INTO evidence.quality_results (
  id, dataset_id, raw_payload_id, transformation_run_id,
  check_code, status, details, checked_at
) VALUES (
  '028f47ac-19fc-7c92-ae91-0242ac120034',
  '028f47ac-19fc-7c92-ae91-0242ac120002',
  '028f47ac-19fc-7c92-ae91-0242ac120003',
  '028f47ac-19fc-7c92-ae91-0242ac120033',
  'admission', 'pass', '{"legacy":true}', '2025-02-01T00:01:00Z'
);
INSERT INTO evidence.releases (
  id, dataset_id, raw_payload_id, external_release_key,
  release_time, source_publication_time, original_release_time,
  availability_time, revision_time, pit_quality, revision_sequence, recorded_at
) VALUES (
  '028f47ac-19fc-7c92-ae91-0242ac120035',
  '028f47ac-19fc-7c92-ae91-0242ac120002',
  '028f47ac-19fc-7c92-ae91-0242ac120003', 'pre-0022-fixture',
  '2025-02-01T00:00:00Z', '2025-02-01T00:00:00Z',
  '2025-02-01T00:00:00Z', '2025-02-01T00:00:00Z',
  '2025-02-01T00:00:00Z', 'true_vintage', 0, '2025-02-01T00:01:00Z'
);
INSERT INTO evidence.observations (
  id, series_id, release_id, period_start, period_end,
  value_numeric, status, parser_version, recorded_at, transformation_run_id
) VALUES (
  '028f47ac-19fc-7c92-ae91-0242ac120036',
  '028f47ac-19fc-7c92-ae91-0242ac120008',
  '028f47ac-19fc-7c92-ae91-0242ac120035',
  '2019-01-01T00:00:00Z', '2020-01-01T00:00:00Z',
  88.25, 'final', 'legacy', '2025-02-01T00:01:00Z',
  '028f47ac-19fc-7c92-ae91-0242ac120033'
);

ALTER TABLE evidence.canonical_admissions
  DISABLE TRIGGER canonical_admissions_snapshot_evidence;
WITH candidate AS (
  SELECT
    observation.organization_id,
    observation.id AS observation_id,
    transformation.id AS transformation_run_id,
    observation.release_id,
    transformation.completed_at,
    jsonb_build_object(
      'schemaVersion', 1,
      'basis', 'legacy_verified_v1',
      'observationId', observation.id::text,
      'transformationRunId', transformation.id::text,
      'releaseId', observation.release_id::text,
      'ingestionRunId', NULL,
      'outputManifestSha256', NULL,
      'parserCodeSha256', transformation.code_sha256,
      'configurationSha256', transformation.configuration_sha256
    ) AS manifest
  FROM evidence.observations observation
  JOIN evidence.transformation_runs transformation
    ON transformation.id = observation.transformation_run_id
  WHERE observation.id = '028f47ac-19fc-7c92-ae91-0242ac120036'
)
INSERT INTO evidence.canonical_admissions (
  id, organization_id, observation_id, transformation_run_id, release_id,
  basis, admission_manifest, admission_sha256, admitted_at
)
SELECT
  '028f47ac-19fc-7c92-ae91-0242ac120037', organization_id, observation_id,
  transformation_run_id, release_id, 'legacy_verified_v1', manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  completed_at
FROM candidate;
ALTER TABLE evidence.canonical_admissions
  ENABLE TRIGGER canonical_admissions_snapshot_evidence;

SELECT set_config(
  'app.verify_pre_0022_admission_created_at',
  (
    SELECT created_at::text
    FROM evidence.canonical_admissions
    WHERE id = '028f47ac-19fc-7c92-ae91-0242ac120037'
  ),
  true
);

SET LOCAL ROLE economyos_app;
SET LOCAL app.organization_id = '018f47ac-19fc-7c92-ae91-0242ac120002';

DO $verify_pre_0022_historical_fail_closed$
DECLARE
  admission_created_at timestamptz;
  current_true_count integer;
  explicit_true_count integer;
  reconstructed_count integer;
  latest_count integer;
BEGIN
  admission_created_at := current_setting(
    'app.verify_pre_0022_admission_created_at'
  )::timestamptz;
  SELECT count(*) INTO current_true_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-04-01T00:00:00Z', 'true_vintage'
  ) WHERE observation_id = '028f47ac-19fc-7c92-ae91-0242ac120036';
  SELECT count(*) INTO explicit_true_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-04-01T00:00:00Z', 'true_vintage', admission_created_at
  ) WHERE observation_id = '028f47ac-19fc-7c92-ae91-0242ac120036';
  SELECT count(*) INTO reconstructed_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-04-01T00:00:00Z', 'reconstructed', admission_created_at
  ) WHERE observation_id = '028f47ac-19fc-7c92-ae91-0242ac120036';
  SELECT count(*) INTO latest_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-04-01T00:00:00Z', 'latest_revised'
  ) WHERE observation_id = '028f47ac-19fc-7c92-ae91-0242ac120036';
  IF current_true_count <> 1 OR explicit_true_count <> 0
    OR reconstructed_count <> 0 OR latest_count <> 1
  THEN
    RAISE EXCEPTION
      'pre-0022 fail-closed semantics failed: current=%, explicit=%, reconstructed=%, latest=%',
      current_true_count, explicit_true_count, reconstructed_count,
      latest_count;
  END IF;
END
$verify_pre_0022_historical_fail_closed$;

RESET ROLE;

DO $verify_admission_evidence_digest_and_immutability$
DECLARE
  violated_constraint text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint constraint_record
    JOIN pg_catalog.pg_class relation
      ON relation.oid = constraint_record.conrelid
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'evidence'
      AND relation.relname = 'canonical_admission_evidence_sets'
      AND constraint_record.conname =
        'canonical_admission_evidence_sets_digest_matches_manifest'
      AND constraint_record.convalidated
  ) THEN
    RAISE EXCEPTION 'admission evidence digest constraint is not validated';
  END IF;

  BEGIN
    INSERT INTO evidence.canonical_admission_evidence_sets (
      id, organization_id, admission_id, observation_id, transformation_run_id,
      series_id, source_id, source_dataset_id, license_review_id,
      source_admission_event_id, series_status, series_data_class,
      admission_created_at, quality_result_count, evidence_manifest,
      evidence_sha256, recorded_at
    )
    SELECT
      '028f47ac-19fc-7c92-ae91-0242ac120059',
      admission_evidence.organization_id,
      admission_evidence.admission_id,
      admission_evidence.observation_id,
      admission_evidence.transformation_run_id,
      admission_evidence.series_id,
      admission_evidence.source_id,
      admission_evidence.source_dataset_id,
      admission_evidence.license_review_id,
      admission_evidence.source_admission_event_id,
      admission_evidence.series_status,
      admission_evidence.series_data_class,
      admission_evidence.admission_created_at,
      admission_evidence.quality_result_count,
      admission_evidence.evidence_manifest,
      CASE left(admission_evidence.evidence_sha256, 1)
        WHEN '0' THEN '1' ELSE '0'
      END || substr(admission_evidence.evidence_sha256, 2),
      admission_evidence.recorded_at
    FROM evidence.canonical_admission_evidence_sets admission_evidence
    WHERE admission_evidence.observation_id =
      '028f47ac-19fc-7c92-ae91-0242ac120030';
    RAISE EXCEPTION 'forged admission evidence digest unexpectedly inserted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;
    IF violated_constraint <>
      'canonical_admission_evidence_sets_digest_matches_manifest'
    THEN
      RAISE;
    END IF;
  END;

  BEGIN
    UPDATE evidence.canonical_admission_evidence_sets
    SET evidence_sha256 = repeat('0', 64)
    WHERE observation_id = '028f47ac-19fc-7c92-ae91-0242ac120030';
    RAISE EXCEPTION 'admission evidence mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  BEGIN
    DELETE FROM evidence.canonical_admission_evidence_sets
    WHERE observation_id = '028f47ac-19fc-7c92-ae91-0242ac120030';
    RAISE EXCEPTION 'admission evidence deletion unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END
$verify_admission_evidence_digest_and_immutability$;

DO $verify_pre_0022_frozen_quality_absent$
DECLARE
  frozen_quality_count integer;
BEGIN
  SELECT count(*) INTO frozen_quality_count
  FROM evidence.economic_state_observation_quality(
    '028f47ac-19fc-7c92-ae91-0242ac120036'
  );
  IF frozen_quality_count <> 0 THEN
    RAISE EXCEPTION 'pre-0022 observation synthesized frozen state quality';
  END IF;
END
$verify_pre_0022_frozen_quality_absent$;

DO $verify_series_semantic_identity_is_frozen$
BEGIN
  BEGIN
    UPDATE evidence.series
    SET unit_code = 'forged_unit'
    WHERE id = '028f47ac-19fc-7c92-ae91-0242ac120008';
    RAISE EXCEPTION 'bound series semantic mutation unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$verify_series_semantic_identity_is_frozen$;

-- Operational status is deliberately mutable even after admission. Suspending
-- the current catalog row must hide the observation without rewriting its
-- immutable admission-time assertion; reactivation must reveal that same row.
DO $suspend_series_after_capturing_admission_evidence$
DECLARE
  frozen_admission_evidence jsonb;
BEGIN
  SELECT to_jsonb(admission_evidence)
  INTO STRICT frozen_admission_evidence
  FROM evidence.canonical_admission_evidence_sets admission_evidence
  WHERE admission_evidence.observation_id =
    '028f47ac-19fc-7c92-ae91-0242ac120030';

  IF frozen_admission_evidence->>'series_status' <> 'active'
    OR frozen_admission_evidence#>>'{evidence_manifest,series,status}' <> 'active'
  THEN
    RAISE EXCEPTION 'admission evidence did not freeze the active series state';
  END IF;

  PERFORM set_config(
    'app.verify_series_frozen_admission_evidence',
    frozen_admission_evidence::text,
    true
  );

  UPDATE evidence.series
  SET status = 'suspended'
  WHERE id = '028f47ac-19fc-7c92-ae91-0242ac120008';
END
$suspend_series_after_capturing_admission_evidence$;

SET LOCAL ROLE economyos_app;
SET LOCAL app.organization_id = '018f47ac-19fc-7c92-ae91-0242ac120002';
SET LOCAL app.subject_id = '018f47ac-19fc-7c92-ae91-0242ac120006';

DO $verify_current_series_suspension_hides_admitted_observation$
DECLARE
  visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-04-01T00:00:00Z', 'true_vintage', NULL, 'view', 100
  )
  WHERE observation_id = '028f47ac-19fc-7c92-ae91-0242ac120030';

  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'suspended current series exposed an admitted observation';
  END IF;
END
$verify_current_series_suspension_hides_admitted_observation$;

RESET ROLE;

DO $reactivate_series_without_rewriting_admission_evidence$
DECLARE
  frozen_admission_evidence jsonb;
BEGIN
  UPDATE evidence.series
  SET status = 'active'
  WHERE id = '028f47ac-19fc-7c92-ae91-0242ac120008';

  SELECT to_jsonb(admission_evidence)
  INTO STRICT frozen_admission_evidence
  FROM evidence.canonical_admission_evidence_sets admission_evidence
  WHERE admission_evidence.observation_id =
    '028f47ac-19fc-7c92-ae91-0242ac120030';

  IF frozen_admission_evidence IS DISTINCT FROM current_setting(
    'app.verify_series_frozen_admission_evidence'
  )::jsonb THEN
    RAISE EXCEPTION 'series status transition rewrote immutable admission evidence';
  END IF;
END
$reactivate_series_without_rewriting_admission_evidence$;

SET LOCAL ROLE economyos_app;
SET LOCAL app.organization_id = '018f47ac-19fc-7c92-ae91-0242ac120002';
SET LOCAL app.subject_id = '018f47ac-19fc-7c92-ae91-0242ac120006';

DO $verify_series_reactivation_restores_frozen_admission$
DECLARE
  visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-04-01T00:00:00Z', 'true_vintage', NULL, 'view', 100
  )
  WHERE observation_id = '028f47ac-19fc-7c92-ae91-0242ac120030';

  IF visible_count <> 1 THEN
    RAISE EXCEPTION
      'reactivated series did not restore its frozen admitted observation';
  END IF;
END
$verify_series_reactivation_restores_frozen_admission$;

RESET ROLE;

DO $verify_review_scope_and_action_forgery_rejected$
BEGIN
  BEGIN
    INSERT INTO evidence.source_admission_events (
      id, source_id, decision, permitted_actions, license_review_id,
      reason, decided_by, decided_at
    ) VALUES (
      '028f47ac-19fc-7c92-ae91-0242ac120038',
      '028f47ac-19fc-7c92-ae91-0242ac120001',
      'approved', ARRAY['view'],
      '028f47ac-19fc-7c92-ae91-0242ac120020',
      'Forged source-wide use of a dataset-scoped review.',
      'database verification', clock_timestamp()
    );
    RAISE EXCEPTION 'dataset-scoped review authorized a source-wide event';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO evidence.source_admission_events (
      id, source_id, dataset_id, decision, permitted_actions, license_review_id,
      reason, decided_by, decided_at
    ) VALUES (
      '028f47ac-19fc-7c92-ae91-0242ac120039',
      '028f47ac-19fc-7c92-ae91-0242ac120001',
      '028f47ac-19fc-7c92-ae91-0242ac120002',
      'approved', ARRAY['api'],
      '028f47ac-19fc-7c92-ae91-0242ac120020',
      'Forged API action outside the source and review contract.',
      'database verification', clock_timestamp()
    );
    RAISE EXCEPTION 'event forged an API action outside its review';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$verify_review_scope_and_action_forgery_rejected$;

INSERT INTO evidence.license_reviews (
  id, source_slug, dataset_external_key, evidence_uri, license_expression,
  intended_uses, evidence, reviewed_by, reviewed_at
) VALUES (
  '028f47ac-19fc-7c92-ae91-0242ac120040',
  'official-fixture', NULL,
  'https://example.invalid/official-fixture/rotated-license', 'TEST-ONLY',
  ARRAY['view'], '{"fixture":true,"rotation":2}',
  'database verification', clock_timestamp()
);
UPDATE evidence.sources
SET license_review_id = '028f47ac-19fc-7c92-ae91-0242ac120040',
  reviewed_at = clock_timestamp()
WHERE id = '028f47ac-19fc-7c92-ae91-0242ac120001';
INSERT INTO evidence.source_admission_events (
  id, source_id, dataset_id, decision, permitted_actions, license_review_id,
  reason, decided_by, decided_at
) VALUES (
  '028f47ac-19fc-7c92-ae91-0242ac120041',
  '028f47ac-19fc-7c92-ae91-0242ac120001',
  '028f47ac-19fc-7c92-ae91-0242ac120002',
  'approved', ARRAY['view'],
  '028f47ac-19fc-7c92-ae91-0242ac120040',
  'Approved rotated review.', 'database verification', clock_timestamp()
);

DO $verify_review_rotation_preserves_historical_decision$
DECLARE
  historical_cutoff timestamptz;
BEGIN
  SELECT admission.created_at INTO STRICT historical_cutoff
  FROM evidence.canonical_admissions admission
  WHERE admission.observation_id = '028f47ac-19fc-7c92-ae91-0242ac120013';
  IF NOT evidence.source_action_is_admitted_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120001',
    '028f47ac-19fc-7c92-ae91-0242ac120002', 'view', historical_cutoff
  ) THEN
    RAISE EXCEPTION 'review rotation invalidated the earlier R1 approval';
  END IF;
END
$verify_review_rotation_preserves_historical_decision$;

SET LOCAL ROLE economyos_app;
SET LOCAL app.organization_id = '018f47ac-19fc-7c92-ae91-0242ac120002';

DO $verify_rotated_current_review_is_live$
DECLARE
  provenance jsonb;
BEGIN
  SELECT evidence.governed_observation_provenance(
    '028f47ac-19fc-7c92-ae91-0242ac120013', 'view'
  ) INTO provenance;
  IF provenance IS NULL
    OR provenance #>> '{canonicalAdmission,createdAt}' IS NULL
    OR provenance #>> '{quality,0,recordedAt}' IS NULL
  THEN
    RAISE EXCEPTION 'current rotated review or DB system provenance is missing';
  END IF;
END
$verify_rotated_current_review_is_live$;

RESET ROLE;

INSERT INTO evidence.source_admission_events (
  id, source_id, dataset_id, decision, permitted_actions, license_review_id,
  reason, decided_by, decided_at
) VALUES (
  '028f47ac-19fc-7c92-ae91-0242ac120042',
  '028f47ac-19fc-7c92-ae91-0242ac120001',
  '028f47ac-19fc-7c92-ae91-0242ac120002',
  'suspended', '{}'::text[],
  '028f47ac-19fc-7c92-ae91-0242ac120040',
  'Current event-only suspension.', 'database verification', clock_timestamp()
);

SELECT set_config(
  'app.verify_event_suspension_cutoff',
  (
    SELECT admission.created_at::text
    FROM evidence.canonical_admissions admission
    WHERE admission.observation_id = '028f47ac-19fc-7c92-ae91-0242ac120013'
  ),
  true
);

SET LOCAL ROLE economyos_app;
SET LOCAL app.organization_id = '018f47ac-19fc-7c92-ae91-0242ac120002';

DO $verify_event_only_suspension_hides_all_current_paths$
DECLARE
  historical_cutoff timestamptz;
  governed_count integer;
  provenance jsonb;
BEGIN
  historical_cutoff := current_setting(
    'app.verify_event_suspension_cutoff'
  )::timestamptz;
  SELECT count(*) INTO governed_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-07-01T00:00:00Z', 'reconstructed', historical_cutoff, 'view', 100
  ) WHERE observation_id = '028f47ac-19fc-7c92-ae91-0242ac120013';
  SELECT evidence.governed_observation_provenance(
    '028f47ac-19fc-7c92-ae91-0242ac120013', 'view'
  ) INTO provenance;
  IF governed_count <> 0 OR provenance IS NOT NULL
  THEN
    RAISE EXCEPTION 'event-only suspension leaked list/exact provenance';
  END IF;
END
$verify_event_only_suspension_hides_all_current_paths$;

RESET ROLE;
INSERT INTO evidence.source_admission_events (
  id, source_id, dataset_id, decision, permitted_actions, license_review_id,
  reason, decided_by, decided_at
) VALUES (
  '028f47ac-19fc-7c92-ae91-0242ac120043',
  '028f47ac-19fc-7c92-ae91-0242ac120001',
  '028f47ac-19fc-7c92-ae91-0242ac120002',
  'approved', ARRAY['view'],
  '028f47ac-19fc-7c92-ae91-0242ac120040',
  'Reapproval after current suspension.', 'database verification', clock_timestamp()
);

DO $verify_legal_cutoff_before_and_after_approval$
DECLARE
  suspended_cutoff timestamptz;
  approved_cutoff timestamptz;
BEGIN
  SELECT recorded_at INTO STRICT suspended_cutoff
  FROM evidence.source_admission_events
  WHERE id = '028f47ac-19fc-7c92-ae91-0242ac120042';
  SELECT recorded_at INTO STRICT approved_cutoff
  FROM evidence.source_admission_events
  WHERE id = '028f47ac-19fc-7c92-ae91-0242ac120043';
  IF evidence.source_action_is_admitted_as_known(
      '028f47ac-19fc-7c92-ae91-0242ac120001',
      '028f47ac-19fc-7c92-ae91-0242ac120002', 'view', suspended_cutoff
    )
    OR NOT evidence.source_action_is_admitted_as_known(
      '028f47ac-19fc-7c92-ae91-0242ac120001',
      '028f47ac-19fc-7c92-ae91-0242ac120002', 'view', approved_cutoff
    )
  THEN
    RAISE EXCEPTION 'legal cutoff changed before/after terminal approval';
  END IF;
END
$verify_legal_cutoff_before_and_after_approval$;

SELECT set_config(
  'app.verify_preflight_suspended_cutoff',
  (
    SELECT recorded_at::text
    FROM evidence.source_admission_events
    WHERE id = '028f47ac-19fc-7c92-ae91-0242ac120042'
  ),
  true
);
SELECT set_config(
  'app.verify_preflight_approved_cutoff',
  (
    SELECT recorded_at::text
    FROM evidence.source_admission_events
    WHERE id = '028f47ac-19fc-7c92-ae91-0242ac120043'
  ),
  true
);

SET LOCAL ROLE economyos_app;
SET LOCAL app.organization_id = '018f47ac-19fc-7c92-ae91-0242ac120002';

DO $verify_governed_pit_preflight_historical_decisions$
DECLARE
  suspended_cutoff timestamptz;
  approved_cutoff timestamptz;
  suspended_count integer;
  approved_count integer;
BEGIN
  suspended_cutoff := current_setting(
    'app.verify_preflight_suspended_cutoff'
  )::timestamptz;
  approved_cutoff := current_setting(
    'app.verify_preflight_approved_cutoff'
  )::timestamptz;

  SELECT count(*) INTO suspended_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-07-01T00:00:00Z', 'reconstructed', suspended_cutoff, 'view', 100
  )
  WHERE observation_id = '028f47ac-19fc-7c92-ae91-0242ac120013';

  SELECT count(*) INTO approved_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-07-01T00:00:00Z', 'reconstructed', approved_cutoff, 'view', 100
  )
  WHERE observation_id = '028f47ac-19fc-7c92-ae91-0242ac120013';

  IF suspended_count <> 0 OR approved_count <> 1 THEN
    RAISE EXCEPTION
      'governed PIT legal preflight failed: suspended=%, approved=%',
      suspended_count, approved_count;
  END IF;
END
$verify_governed_pit_preflight_historical_decisions$;

RESET ROLE;

DO $insert_legal_ordering_sentinels$
DECLARE
  specificity_time timestamptz := clock_timestamp();
  late_record_time timestamptz := clock_timestamp() + interval '1 second';
  later_valid_time timestamptz := clock_timestamp() + interval '2 seconds';
BEGIN
  INSERT INTO evidence.source_admission_events (
    id, source_id, dataset_id, decision, permitted_actions, license_review_id,
    reason, decided_by, decided_at, recorded_at
  ) VALUES
    (
      '028f47ac-19fc-7c92-ae91-0242ac120044',
      '028f47ac-19fc-7c92-ae91-0242ac120001',
      '028f47ac-19fc-7c92-ae91-0242ac120002',
      'approved', ARRAY['view'], '028f47ac-19fc-7c92-ae91-0242ac120040',
      'Dataset-specific tie winner.', 'database verification',
      specificity_time, specificity_time
    ),
    (
      '028f47ac-19fc-7c92-ae91-0242ac120045',
      '028f47ac-19fc-7c92-ae91-0242ac120001', NULL,
      'suspended', '{}'::text[], '028f47ac-19fc-7c92-ae91-0242ac120040',
      'Later-recorded global tie loser.', 'database verification',
      specificity_time, specificity_time + interval '1 microsecond'
    ),
    (
      '028f47ac-19fc-7c92-ae91-0242ac120046',
      '028f47ac-19fc-7c92-ae91-0242ac120001',
      '028f47ac-19fc-7c92-ae91-0242ac120002',
      'suspended', '{}'::text[], '028f47ac-19fc-7c92-ae91-0242ac120040',
      'Same-valid-time earlier recording.', 'database verification',
      late_record_time, late_record_time
    ),
    (
      '028f47ac-19fc-7c92-ae91-0242ac120047',
      '028f47ac-19fc-7c92-ae91-0242ac120001',
      '028f47ac-19fc-7c92-ae91-0242ac120002',
      'approved', ARRAY['view'], '028f47ac-19fc-7c92-ae91-0242ac120040',
      'Same-valid-time later recording.', 'database verification',
      late_record_time, late_record_time + interval '1 microsecond'
    ),
    (
      '028f47ac-19fc-7c92-ae91-0242ac120048',
      '028f47ac-19fc-7c92-ae91-0242ac120001',
      '028f47ac-19fc-7c92-ae91-0242ac120002',
      'approved', ARRAY['view'], '028f47ac-19fc-7c92-ae91-0242ac120040',
      'Later valid-time approval.', 'database verification',
      later_valid_time, later_valid_time
    ),
    (
      '028f47ac-19fc-7c92-ae91-0242ac120049',
      '028f47ac-19fc-7c92-ae91-0242ac120001',
      '028f47ac-19fc-7c92-ae91-0242ac120002',
      'suspended', '{}'::text[], '028f47ac-19fc-7c92-ae91-0242ac120040',
      'Backdated correction must not outrank later valid time.',
      'database verification', later_valid_time - interval '1 second',
      later_valid_time + interval '1 microsecond'
    );
END
$insert_legal_ordering_sentinels$;

-- Wait-free cutoff: choose the greatest persisted recording time rather than
-- a wall-clock literal, then prove specificity, recording, and valid-time order.
DO $verify_legal_ordering_sentinels$
DECLARE
  specificity_cutoff timestamptz;
  recording_cutoff timestamptz;
  evidence_cutoff timestamptz;
BEGIN
  SELECT max(recorded_at) + interval '1 microsecond' INTO STRICT specificity_cutoff
  FROM evidence.source_admission_events
  WHERE id IN (
    '028f47ac-19fc-7c92-ae91-0242ac120044',
    '028f47ac-19fc-7c92-ae91-0242ac120045'
  );
  SELECT max(recorded_at) + interval '1 microsecond' INTO STRICT recording_cutoff
  FROM evidence.source_admission_events
  WHERE id IN (
    '028f47ac-19fc-7c92-ae91-0242ac120046',
    '028f47ac-19fc-7c92-ae91-0242ac120047'
  );
  SELECT max(recorded_at) + interval '1 microsecond' INTO STRICT evidence_cutoff
  FROM evidence.source_admission_events
  WHERE id IN (
    '028f47ac-19fc-7c92-ae91-0242ac120044',
    '028f47ac-19fc-7c92-ae91-0242ac120045',
    '028f47ac-19fc-7c92-ae91-0242ac120046',
    '028f47ac-19fc-7c92-ae91-0242ac120047',
    '028f47ac-19fc-7c92-ae91-0242ac120048',
    '028f47ac-19fc-7c92-ae91-0242ac120049'
  );
  IF NOT evidence.source_action_is_admitted_as_known(
      '028f47ac-19fc-7c92-ae91-0242ac120001',
      '028f47ac-19fc-7c92-ae91-0242ac120002', 'view', specificity_cutoff
    )
    OR NOT evidence.source_action_is_admitted_as_known(
      '028f47ac-19fc-7c92-ae91-0242ac120001',
      '028f47ac-19fc-7c92-ae91-0242ac120002', 'view', recording_cutoff
    )
    OR NOT evidence.source_action_is_admitted_as_known(
      '028f47ac-19fc-7c92-ae91-0242ac120001',
      '028f47ac-19fc-7c92-ae91-0242ac120002', 'view', evidence_cutoff
    )
  THEN
    RAISE EXCEPTION 'legal decision ordering did not preserve later valid approval';
  END IF;
END
$verify_legal_ordering_sentinels$;

-- A quality assertion recorded after admission is current evidence only. It
-- hides current serving but cannot rewrite an earlier reconstructed cutoff or
-- the immutable admission quality-set manifest.
DO $capture_quality_history_before_later_failure$
DECLARE
  admission_cutoff timestamptz;
  visible_count integer;
BEGIN
  SELECT admission.created_at INTO STRICT admission_cutoff
  FROM evidence.canonical_admissions admission
  WHERE admission.observation_id = '028f47ac-19fc-7c92-ae91-0242ac120030';
  SELECT count(*) INTO visible_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-04-01T00:00:00Z', 'reconstructed', admission_cutoff, 'view', 100
  ) WHERE observation_id = '028f47ac-19fc-7c92-ae91-0242ac120030';
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'post-admission reconstructed baseline is not visible';
  END IF;
END
$capture_quality_history_before_later_failure$;

INSERT INTO evidence.quality_results (
  id, dataset_id, raw_payload_id, transformation_run_id,
  check_code, status, details, checked_at
) VALUES (
  '028f47ac-19fc-7c92-ae91-0242ac120050',
  '028f47ac-19fc-7c92-ae91-0242ac120002',
  '028f47ac-19fc-7c92-ae91-0242ac120003',
  '028f47ac-19fc-7c92-ae91-0242ac120029',
  'post_admission_integrity', 'fail', '{"late":true}', clock_timestamp()
);

DO $verify_later_quality_failure_is_not_backdated$
DECLARE
  admission_cutoff timestamptz;
  historical_count integer;
  current_count integer;
  frozen_count integer;
BEGIN
  SELECT admission.created_at INTO STRICT admission_cutoff
  FROM evidence.canonical_admissions admission
  WHERE admission.observation_id = '028f47ac-19fc-7c92-ae91-0242ac120030';
  SELECT count(*) INTO historical_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-04-01T00:00:00Z', 'reconstructed', admission_cutoff, 'view', 100
  ) WHERE observation_id = '028f47ac-19fc-7c92-ae91-0242ac120030';
  SELECT count(*) INTO current_count
  FROM evidence.governed_observations_as_known(
    '028f47ac-19fc-7c92-ae91-0242ac120008',
    '2025-04-01T00:00:00Z', 'true_vintage', NULL, 'view', 100
  ) WHERE observation_id = '028f47ac-19fc-7c92-ae91-0242ac120030';
  SELECT jsonb_array_length(evidence_manifest->'qualityResults')
  INTO STRICT frozen_count
  FROM evidence.canonical_admission_evidence_sets admission_evidence
  WHERE admission_evidence.observation_id = '028f47ac-19fc-7c92-ae91-0242ac120030';
  IF historical_count <> 1 OR current_count <> 0 OR frozen_count <> 1 THEN
    RAISE EXCEPTION
      'later quality failure rewrote history: historical=%, current=%, frozen=%',
      historical_count, current_count, frozen_count;
  END IF;
END
$verify_later_quality_failure_is_not_backdated$;

ROLLBACK;
