BEGIN;

INSERT INTO app.organizations (id, slug, name) VALUES
  ('058f47ac-19fc-7c92-ae91-0242ac120001', 'private-fixture-a', 'Private fixture A'),
  ('058f47ac-19fc-7c92-ae91-0242ac120002', 'private-fixture-b', 'Private fixture B');
INSERT INTO app.workspaces (id, organization_id, slug, name) VALUES (
  '058f47ac-19fc-7c92-ae91-0242ac120003',
  '058f47ac-19fc-7c92-ae91-0242ac120001',
  'research', 'Research'
);
INSERT INTO app.subjects (id, issuer, external_subject, kind) VALUES (
  '058f47ac-19fc-7c92-ae91-0242ac120004',
  'https://identity.economyos.test/', 'governance-subject', 'human'
);
INSERT INTO app.organization_memberships (
  organization_id, subject_id, role, valid_from
) VALUES (
  '058f47ac-19fc-7c92-ae91-0242ac120001',
  '058f47ac-19fc-7c92-ae91-0242ac120004',
  'steward', '2026-01-01T00:00:00Z'
);
INSERT INTO app.workspace_memberships (
  organization_id, workspace_id, subject_id, role, valid_from
) VALUES (
  '058f47ac-19fc-7c92-ae91-0242ac120001',
  '058f47ac-19fc-7c92-ae91-0242ac120003',
  '058f47ac-19fc-7c92-ae91-0242ac120004',
  'steward', '2026-01-01T00:00:00Z'
);

INSERT INTO evidence.license_reviews (
  id, source_slug, dataset_external_key, evidence_uri, license_expression,
  intended_uses, evidence, reviewed_by, reviewed_at
) VALUES (
  '058f47ac-19fc-7c92-ae91-0242ac120005',
  'private-fixture', 'private.series',
  'https://example.invalid/private-fixture/license', 'TEST-PRIVATE',
  ARRAY['view', 'api'], '{"fixture":true}', 'database verification',
  '2026-01-01T00:00:00Z'
);
INSERT INTO evidence.sources (
  id, organization_id, slug, name, authority_class, homepage_uri,
  classification, license_status, license_expression, redistribution_allowed,
  reviewed_at, license_review_id, attribution_text, permitted_actions
) VALUES (
  '058f47ac-19fc-7c92-ae91-0242ac120006',
  '058f47ac-19fc-7c92-ae91-0242ac120001',
  'private-fixture', 'Private verification source', 'customer',
  'https://example.invalid/private-fixture', 'confidential', 'approved',
  'TEST-PRIVATE', false, '2026-01-01T00:00:00Z',
  '058f47ac-19fc-7c92-ae91-0242ac120005',
  'Private verification fixture.', ARRAY['view', 'api']
);
INSERT INTO evidence.source_datasets (
  id, organization_id, source_id, external_key, title, pit_quality,
  admission_status, admitted_at
) VALUES (
  '058f47ac-19fc-7c92-ae91-0242ac120007',
  '058f47ac-19fc-7c92-ae91-0242ac120001',
  '058f47ac-19fc-7c92-ae91-0242ac120006',
  'private.series', 'Private verification dataset', 'true_vintage',
  'approved', '2026-01-01T00:00:00Z'
);
INSERT INTO evidence.source_admission_events (
  id, organization_id, source_id, dataset_id, decision, permitted_actions,
  license_review_id, reason, decided_by, decided_at
) VALUES (
  '058f47ac-19fc-7c92-ae91-0242ac120008',
  '058f47ac-19fc-7c92-ae91-0242ac120001',
  '058f47ac-19fc-7c92-ae91-0242ac120006',
  '058f47ac-19fc-7c92-ae91-0242ac120007',
  'approved', ARRAY['view', 'api'],
  '058f47ac-19fc-7c92-ae91-0242ac120005',
  'Verification-only tenant admission.', 'database verification',
  '2026-01-01T00:00:00Z'
);
INSERT INTO evidence.geographies (id, kind, code_scheme, code, name) VALUES (
  '058f47ac-19fc-7c92-ae91-0242ac120009',
  'economy', 'ECONOMYOS-TEST', 'PVT', 'Private test economy'
);
INSERT INTO evidence.concepts (
  id, canonical_key, name, definition, measurement_class, ontology_version
) VALUES (
  '058f47ac-19fc-7c92-ae91-0242ac120010',
  'economy.private.fixture', 'Private fixture',
  'Verification-only private economic observation.', 'direct', 'verification-1'
);
INSERT INTO evidence.series (
  id, organization_id, dataset_id, concept_id, geography_id,
  external_series_key, unit_code, frequency, data_class
) VALUES (
  '058f47ac-19fc-7c92-ae91-0242ac120011',
  '058f47ac-19fc-7c92-ae91-0242ac120001',
  '058f47ac-19fc-7c92-ae91-0242ac120007',
  '058f47ac-19fc-7c92-ae91-0242ac120010',
  '058f47ac-19fc-7c92-ae91-0242ac120009',
  'private.series.PVT', 'index_points', 'annual', 'observed'
);
INSERT INTO evidence.raw_payloads (
  id, organization_id, dataset_id, request_uri, object_uri, media_type,
  checksum_sha256, byte_length, fetched_at, parser_name, parser_version, recorded_at
) VALUES (
  '058f47ac-19fc-7c92-ae91-0242ac120012',
  '058f47ac-19fc-7c92-ae91-0242ac120001',
  '058f47ac-19fc-7c92-ae91-0242ac120007',
  'https://example.invalid/private-fixture/data',
  's3://verification-only/private.json', 'application/json', repeat('e', 64), 10,
  '2026-02-01T00:00:01Z', 'verification', '1', '2026-02-01T00:00:02Z'
);
INSERT INTO evidence.transformation_runs (
  id, organization_id, dataset_id, raw_payload_id, parser_name, parser_version,
  code_sha256, configuration, configuration_sha256, status,
  started_at, completed_at, workflow_id
) VALUES (
  '058f47ac-19fc-7c92-ae91-0242ac120013',
  '058f47ac-19fc-7c92-ae91-0242ac120001',
  '058f47ac-19fc-7c92-ae91-0242ac120007',
  '058f47ac-19fc-7c92-ae91-0242ac120012',
  'verification', '1', repeat('3', 64), '{}', repeat('0', 64), 'succeeded',
  '2026-02-01T00:00:01Z', '2026-02-01T00:00:02Z', 'verify-private'
);
INSERT INTO evidence.quality_results (
  organization_id, dataset_id, raw_payload_id, transformation_run_id,
  check_code, status, details, checked_at
) VALUES (
  '058f47ac-19fc-7c92-ae91-0242ac120001',
  '058f47ac-19fc-7c92-ae91-0242ac120007',
  '058f47ac-19fc-7c92-ae91-0242ac120012',
  '058f47ac-19fc-7c92-ae91-0242ac120013',
  'admission', 'pass', '{"fixture":true}', '2026-02-01T00:00:02Z'
);
INSERT INTO evidence.releases (
  id, organization_id, dataset_id, raw_payload_id, external_release_key,
  release_time, source_publication_time, original_release_time, availability_time,
  revision_time, pit_quality, revision_sequence, recorded_at
) VALUES (
  '058f47ac-19fc-7c92-ae91-0242ac120014',
  '058f47ac-19fc-7c92-ae91-0242ac120001',
  '058f47ac-19fc-7c92-ae91-0242ac120007',
  '058f47ac-19fc-7c92-ae91-0242ac120012', 'private-2025',
  '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z',
  '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z',
  'true_vintage', 0, '2026-02-01T00:00:02Z'
);
INSERT INTO evidence.observations (
  id, organization_id, series_id, release_id, period_start, period_end,
  value_numeric, status, parser_version, recorded_at, transformation_run_id
) VALUES (
  '058f47ac-19fc-7c92-ae91-0242ac120015',
  '058f47ac-19fc-7c92-ae91-0242ac120001',
  '058f47ac-19fc-7c92-ae91-0242ac120011',
  '058f47ac-19fc-7c92-ae91-0242ac120014',
  '2025-01-01T00:00:00Z', '2026-01-01T00:00:00Z',
  42, 'final', '1', '2026-02-01T00:00:02Z',
  '058f47ac-19fc-7c92-ae91-0242ac120013'
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
  WHERE observation.id = '058f47ac-19fc-7c92-ae91-0242ac120015'
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
FROM candidate;

SET LOCAL ROLE economyos_app;
SET LOCAL app.organization_id = '058f47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '058f47ac-19fc-7c92-ae91-0242ac120004';

DO $verify_private_visibility$
DECLARE
  own_count integer;
  foreign_count integer;
BEGIN
  SELECT count(*) INTO own_count
  FROM evidence.governed_observations_as_known(
    '058f47ac-19fc-7c92-ae91-0242ac120011',
    '2026-03-01T00:00:00Z', 'true_vintage', NULL, 'view', 100
  );
  PERFORM set_config('app.organization_id', '058f47ac-19fc-7c92-ae91-0242ac120002', true);
  SELECT count(*) INTO foreign_count
  FROM evidence.governed_observations_as_known(
    '058f47ac-19fc-7c92-ae91-0242ac120011',
    '2026-03-01T00:00:00Z', 'true_vintage', NULL, 'view', 100
  );
  IF own_count <> 1 OR foreign_count <> 0 THEN
    RAISE EXCEPTION 'private evidence isolation failed: own=%, foreign=%', own_count, foreign_count;
  END IF;
END
$verify_private_visibility$;

RESET ROLE;
SET LOCAL app.organization_id = '058f47ac-19fc-7c92-ae91-0242ac120001';

INSERT INTO evidence.dataset_snapshots (
  id, organization_id, workspace_id, known_at, policy,
  manifest, manifest_sha256, created_by
)
SELECT
  '058f47ac-19fc-7c92-ae91-0242ac120016',
  '058f47ac-19fc-7c92-ae91-0242ac120001',
  '058f47ac-19fc-7c92-ae91-0242ac120003',
  '2026-03-01T00:00:00Z', 'true_vintage', manifest,
  encode(digest(convert_to(manifest::text, 'UTF8'), 'sha256'), 'hex'),
  '058f47ac-19fc-7c92-ae91-0242ac120004'
FROM (VALUES (
  '{"knownAt":"2026-03-01T00:00:00Z","observationIds":["058f47ac-19fc-7c92-ae91-0242ac120015"],"policy":"true_vintage"}'::jsonb
)) input(manifest);

DO $verify_snapshot_integrity$
BEGIN
  BEGIN
    INSERT INTO evidence.dataset_snapshots (
      id, organization_id, workspace_id, known_at, policy,
      manifest, manifest_sha256, created_by
    ) VALUES (
      '058f47ac-19fc-7c92-ae91-0242ac120017',
      '058f47ac-19fc-7c92-ae91-0242ac120001',
      '058f47ac-19fc-7c92-ae91-0242ac120003',
      '2026-03-01T00:00:00Z', 'true_vintage', '{"tampered":true}', repeat('0', 64),
      '058f47ac-19fc-7c92-ae91-0242ac120004'
    );
    RAISE EXCEPTION 'invalid snapshot digest unexpectedly succeeded';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE evidence.dataset_snapshots SET known_at = '2026-04-01T00:00:00Z'
    WHERE id = '058f47ac-19fc-7c92-ae91-0242ac120016';
    RAISE EXCEPTION 'snapshot mutation unexpectedly succeeded';
  EXCEPTION
    WHEN SQLSTATE '55000' THEN NULL;
  END;
END
$verify_snapshot_integrity$;

INSERT INTO evidence.raw_payloads (
  id, dataset_id, request_uri, object_uri, media_type, checksum_sha256,
  byte_length, fetched_at, parser_name, parser_version, recorded_at
) VALUES (
  '058f47ac-19fc-7c92-ae91-0242ac120018',
  '038f47ac-19fc-7c92-ae91-0242ac120003',
  'https://api.worldbank.org/v2/verification',
  's3://verification-only/global.json', 'application/json', repeat('f', 64), 10,
  '2026-02-01T00:00:00Z', 'verification', '1', '2026-02-01T00:00:01Z'
);
INSERT INTO evidence.lineage_edges (
  id, organization_id, from_type, from_id, to_type, to_id, relation
) VALUES (
  '058f47ac-19fc-7c92-ae91-0242ac120019',
  '058f47ac-19fc-7c92-ae91-0242ac120001',
  'payload', '058f47ac-19fc-7c92-ae91-0242ac120018',
  'run', '058f47ac-19fc-7c92-ae91-0242ac120013', 'executed_with'
);

DO $verify_lineage_scope$
BEGIN
  BEGIN
    INSERT INTO evidence.lineage_edges (
      id, organization_id, from_type, from_id, to_type, to_id, relation
    ) VALUES (
      '058f47ac-19fc-7c92-ae91-0242ac120020', NULL,
      'payload', '058f47ac-19fc-7c92-ae91-0242ac120018',
      'run', '058f47ac-19fc-7c92-ae91-0242ac120013', 'executed_with'
    );
    RAISE EXCEPTION 'global-to-private lineage unexpectedly succeeded';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO evidence.lineage_edges (
      id, organization_id, from_type, from_id, to_type, to_id, relation
    ) VALUES (
      '058f47ac-19fc-7c92-ae91-0242ac120021',
      '058f47ac-19fc-7c92-ae91-0242ac120002',
      'payload', '058f47ac-19fc-7c92-ae91-0242ac120018',
      'run', '058f47ac-19fc-7c92-ae91-0242ac120013', 'executed_with'
    );
    RAISE EXCEPTION 'cross-organization lineage unexpectedly succeeded';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO evidence.lineage_edges (
      id, organization_id, from_type, from_id, to_type, to_id, relation
    ) VALUES (
      '058f47ac-19fc-7c92-ae91-0242ac120022',
      '058f47ac-19fc-7c92-ae91-0242ac120001',
      'payload', '058f47ac-19fc-7c92-ae91-0242ac129999',
      'run', '058f47ac-19fc-7c92-ae91-0242ac120013', 'executed_with'
    );
    RAISE EXCEPTION 'lineage with nonexistent endpoint unexpectedly succeeded';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;
END
$verify_lineage_scope$;

ROLLBACK;
