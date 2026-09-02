BEGIN;

DO $verify_bound_catalog_identity$
DECLARE
  failure_message text;
BEGIN
  BEGIN
    UPDATE evidence.sources
    SET name = 'Retrospectively relabeled source'
    WHERE id = '038f47ac-19fc-7c92-ae91-0242ac120002';
    RAISE EXCEPTION 'bound source relabel unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS failure_message = MESSAGE_TEXT;
    IF failure_message <> 'source identity is immutable after insertion' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE evidence.source_datasets
    SET pit_quality = 'reconstructed_only'
    WHERE id = '038f47ac-19fc-7c92-ae91-0242ac120003';
    RAISE EXCEPTION 'bound dataset PIT rewrite unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS failure_message = MESSAGE_TEXT;
    IF failure_message <> 'source-dataset identity is immutable after insertion' THEN RAISE; END IF;
  END;

  UPDATE evidence.sources
  SET classification = 'internal'
  WHERE id = '038f47ac-19fc-7c92-ae91-0242ac120002';
  UPDATE evidence.source_datasets
  SET title = 'World Development Indicators (current catalog title)'
  WHERE id = '038f47ac-19fc-7c92-ae91-0242ac120003';
END
$verify_bound_catalog_identity$;

INSERT INTO evidence.sources (
  id, slug, name, authority_class, homepage_uri, classification,
  license_status, retention_policy
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120001',
  'unbound-source', 'Unbound source', 'community', 'https://example.test/unbound',
  'internal', 'pending', '{}'::jsonb
);
UPDATE evidence.sources
SET classification = 'public', retention_policy = '{"raw":"ephemeral"}'::jsonb
WHERE id = '0a8f47ac-19fc-7c92-ae91-0242ac120001';

INSERT INTO evidence.source_datasets (
  id, source_id, external_key, title, pit_quality, admission_status
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120002',
  '0a8f47ac-19fc-7c92-ae91-0242ac120001',
  'unbound-v1', 'Unbound dataset', 'latest_revised_only', 'pending'
);
UPDATE evidence.source_datasets
SET title = 'Unbound dataset corrected', expected_frequency = 'annual'
WHERE id = '0a8f47ac-19fc-7c92-ae91-0242ac120002';

DO $verify_unbound_identity_is_still_immutable$
DECLARE
  failure_message text;
BEGIN
  BEGIN
    UPDATE evidence.sources
    SET slug = 'unbound-source-corrected'
    WHERE id = '0a8f47ac-19fc-7c92-ae91-0242ac120001';
    RAISE EXCEPTION 'unbound source identity rewrite unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS failure_message = MESSAGE_TEXT;
    IF failure_message <> 'source identity is immutable after insertion' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE evidence.source_datasets
    SET external_key = 'unbound-v2'
    WHERE id = '0a8f47ac-19fc-7c92-ae91-0242ac120002';
    RAISE EXCEPTION 'unbound dataset identity rewrite unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS failure_message = MESSAGE_TEXT;
    IF failure_message <> 'source-dataset identity is immutable after insertion' THEN RAISE; END IF;
  END;
END
$verify_unbound_identity_is_still_immutable$;

-- Reference catalog corrections are append-only versions. Inserts with new
-- identifiers work; every field of the prior version, plus deletion, is frozen.
INSERT INTO evidence.concepts (
  id, canonical_key, name, definition, measurement_class,
  ontology_version, created_at
) VALUES
  (
    '0a8f47ac-19fc-7c92-ae91-0242ac120006',
    'verification.bound.concept.v1', 'Bound concept v1',
    'Original immutable verification definition.', 'direct',
    'verification-1', '2026-08-31T00:00:00Z'
  ),
  (
    '0a8f47ac-19fc-7c92-ae91-0242ac120007',
    'verification.bound.concept.v2', 'Bound concept v2',
    'Corrected definition represented by a new concept identity.', 'derived',
    'verification-2', '2026-08-31T00:00:01Z'
  );

INSERT INTO evidence.geographies (
  id, kind, code_scheme, code, name, valid_from, valid_until
) VALUES
  (
    '0a8f47ac-19fc-7c92-ae91-0242ac120008',
    'economy', 'ECONOMYOS-BOUND-VERIFY', 'BC1', 'Bound geography v1',
    '2025-01-01', '2026-01-01'
  ),
  (
    '0a8f47ac-19fc-7c92-ae91-0242ac120009',
    'economy', 'ECONOMYOS-BOUND-VERIFY', 'BC1', 'Bound geography v2',
    '2026-01-01', NULL
  );

DO $verify_reference_catalog_is_fully_immutable$
DECLARE
  mutation record;
  failure_message text;
  concept_count integer;
  geography_count integer;
BEGIN
  FOR mutation IN
    SELECT * FROM (VALUES
      (
        'concepts', 'id',
        'UPDATE evidence.concepts SET id = ''0a8f47ac-19fc-7c92-ae91-0242ac120010'' WHERE id = ''0a8f47ac-19fc-7c92-ae91-0242ac120006'''
      ),
      (
        'concepts', 'canonical_key',
        'UPDATE evidence.concepts SET canonical_key = ''verification.bound.concept.forged'' WHERE id = ''0a8f47ac-19fc-7c92-ae91-0242ac120006'''
      ),
      (
        'concepts', 'name',
        'UPDATE evidence.concepts SET name = ''Retrospective label'' WHERE id = ''0a8f47ac-19fc-7c92-ae91-0242ac120006'''
      ),
      (
        'concepts', 'definition',
        'UPDATE evidence.concepts SET definition = ''Retrospective definition'' WHERE id = ''0a8f47ac-19fc-7c92-ae91-0242ac120006'''
      ),
      (
        'concepts', 'measurement_class',
        'UPDATE evidence.concepts SET measurement_class = ''latent'' WHERE id = ''0a8f47ac-19fc-7c92-ae91-0242ac120006'''
      ),
      (
        'concepts', 'ontology_version',
        'UPDATE evidence.concepts SET ontology_version = ''forged-version'' WHERE id = ''0a8f47ac-19fc-7c92-ae91-0242ac120006'''
      ),
      (
        'concepts', 'created_at',
        'UPDATE evidence.concepts SET created_at = created_at + interval ''1 second'' WHERE id = ''0a8f47ac-19fc-7c92-ae91-0242ac120006'''
      ),
      (
        'geographies', 'id',
        'UPDATE evidence.geographies SET id = ''0a8f47ac-19fc-7c92-ae91-0242ac120011'' WHERE id = ''0a8f47ac-19fc-7c92-ae91-0242ac120008'''
      ),
      (
        'geographies', 'kind',
        'UPDATE evidence.geographies SET kind = ''region'' WHERE id = ''0a8f47ac-19fc-7c92-ae91-0242ac120008'''
      ),
      (
        'geographies', 'code_scheme',
        'UPDATE evidence.geographies SET code_scheme = ''FORGED-SCHEME'' WHERE id = ''0a8f47ac-19fc-7c92-ae91-0242ac120008'''
      ),
      (
        'geographies', 'code',
        'UPDATE evidence.geographies SET code = ''FORGED'' WHERE id = ''0a8f47ac-19fc-7c92-ae91-0242ac120008'''
      ),
      (
        'geographies', 'name',
        'UPDATE evidence.geographies SET name = ''Retrospective geography label'' WHERE id = ''0a8f47ac-19fc-7c92-ae91-0242ac120008'''
      ),
      (
        'geographies', 'valid_from',
        'UPDATE evidence.geographies SET valid_from = ''2024-01-01'' WHERE id = ''0a8f47ac-19fc-7c92-ae91-0242ac120008'''
      ),
      (
        'geographies', 'valid_until',
        'UPDATE evidence.geographies SET valid_until = ''2027-01-01'' WHERE id = ''0a8f47ac-19fc-7c92-ae91-0242ac120008'''
      ),
      (
        'concepts', 'delete',
        'DELETE FROM evidence.concepts WHERE id = ''0a8f47ac-19fc-7c92-ae91-0242ac120006'''
      ),
      (
        'geographies', 'delete',
        'DELETE FROM evidence.geographies WHERE id = ''0a8f47ac-19fc-7c92-ae91-0242ac120008'''
      )
    ) AS attempted(table_name, field_name, statement)
  LOOP
    BEGIN
      EXECUTE mutation.statement;
      RAISE EXCEPTION 'reference catalog mutation unexpectedly succeeded: %.%',
        mutation.table_name, mutation.field_name;
    EXCEPTION WHEN SQLSTATE '55000' THEN
      GET STACKED DIAGNOSTICS failure_message = MESSAGE_TEXT;
      IF failure_message <> format(
        '%s rows are immutable after insertion; create a corrected row with a new id',
        mutation.table_name
      ) THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  SELECT count(*) INTO concept_count
  FROM evidence.concepts
  WHERE id IN (
    '0a8f47ac-19fc-7c92-ae91-0242ac120006',
    '0a8f47ac-19fc-7c92-ae91-0242ac120007'
  );
  SELECT count(*) INTO geography_count
  FROM evidence.geographies
  WHERE id IN (
    '0a8f47ac-19fc-7c92-ae91-0242ac120008',
    '0a8f47ac-19fc-7c92-ae91-0242ac120009'
  );
  IF concept_count <> 2 OR geography_count <> 2 THEN
    RAISE EXCEPTION
      'new-id reference corrections were not preserved: concepts=%, geographies=%',
      concept_count, geography_count;
  END IF;
END
$verify_reference_catalog_is_fully_immutable$;

INSERT INTO app.organizations (id, slug, name) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120003',
  'bound-catalog-verifier', 'Bound catalog verifier'
);
INSERT INTO app.subjects (id, issuer, external_subject, kind) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120004',
  'https://identity.economyos.test/', 'bound-catalog-verifier', 'service'
);
INSERT INTO app.organization_memberships (
  organization_id, subject_id, role, valid_from
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120003',
  '0a8f47ac-19fc-7c92-ae91-0242ac120004',
  'validator', '2026-01-01T00:00:00Z'
);

-- Build two otherwise serveable admissions against one exact source chain.
-- The first follows the post-0022 path and receives an immutable evidence set.
-- The second simulates a pre-0022 admission by suppressing only the evidence
-- snapshot trigger during its insert; 0026 must hide that legacy provenance.
INSERT INTO evidence.license_reviews (
  id, source_slug, dataset_external_key, evidence_uri, license_expression,
  intended_uses, evidence, reviewed_by, reviewed_at
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120012',
  'unbound-source', 'unbound-v1',
  'https://example.test/unbound/license', 'TEST-ONLY', ARRAY['view'],
  '{"fixture":"legacy-provenance-fail-closed"}'::jsonb,
  'database verification', statement_timestamp()
);

UPDATE evidence.sources
SET license_status = 'approved',
    license_expression = 'TEST-ONLY',
    redistribution_allowed = false,
    reviewed_at = (
      SELECT reviewed_at FROM evidence.license_reviews
      WHERE id = '0a8f47ac-19fc-7c92-ae91-0242ac120012'
    ),
    license_review_id = '0a8f47ac-19fc-7c92-ae91-0242ac120012',
    attribution_text = 'Verification fixture; not production data.',
    permitted_actions = ARRAY['view']
WHERE id = '0a8f47ac-19fc-7c92-ae91-0242ac120001';

UPDATE evidence.source_datasets
SET admission_status = 'approved', admitted_at = statement_timestamp()
WHERE id = '0a8f47ac-19fc-7c92-ae91-0242ac120002';

INSERT INTO evidence.source_admission_events (
  id, source_id, dataset_id, decision, permitted_actions, license_review_id,
  reason, decided_by, decided_at
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120013',
  '0a8f47ac-19fc-7c92-ae91-0242ac120001',
  '0a8f47ac-19fc-7c92-ae91-0242ac120002',
  'approved', ARRAY['view'],
  '0a8f47ac-19fc-7c92-ae91-0242ac120012',
  'Verification-only current approval.', 'database verification',
  statement_timestamp()
);

INSERT INTO evidence.raw_payloads (
  id, dataset_id, request_uri, object_uri, media_type, checksum_sha256,
  byte_length, fetched_at, parser_name, parser_version
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120014',
  '0a8f47ac-19fc-7c92-ae91-0242ac120002',
  'https://example.test/unbound/provenance',
  's3://verification-only/unbound-provenance.json',
  'application/json', repeat('e', 64), 2, statement_timestamp(),
  'bound-catalog-verifier', '1'
);

INSERT INTO evidence.transformation_runs (
  id, dataset_id, raw_payload_id, parser_name, parser_version, code_sha256,
  configuration, configuration_sha256, status, started_at, completed_at,
  workflow_id
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120015',
  '0a8f47ac-19fc-7c92-ae91-0242ac120002',
  '0a8f47ac-19fc-7c92-ae91-0242ac120014',
  'bound-catalog-verifier', '1', repeat('1', 64), '{}'::jsonb,
  repeat('2', 64), 'succeeded', statement_timestamp(),
  statement_timestamp(), 'verify-legacy-provenance'
);

INSERT INTO evidence.quality_results (
  id, dataset_id, raw_payload_id, transformation_run_id, check_code, status,
  details, checked_at
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120016',
  '0a8f47ac-19fc-7c92-ae91-0242ac120002',
  '0a8f47ac-19fc-7c92-ae91-0242ac120014',
  '0a8f47ac-19fc-7c92-ae91-0242ac120015',
  'admission', 'pass', '{"fixture":true}'::jsonb, statement_timestamp()
);

INSERT INTO evidence.series (
  id, dataset_id, concept_id, geography_id, external_series_key, unit_code,
  frequency, seasonal_adjustment, data_class
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120017',
  '0a8f47ac-19fc-7c92-ae91-0242ac120002',
  '0a8f47ac-19fc-7c92-ae91-0242ac120006',
  '0a8f47ac-19fc-7c92-ae91-0242ac120008',
  'verification.unbound.provenance', 'index_points', 'annual',
  'unadjusted', 'observed'
);

INSERT INTO evidence.releases (
  id, dataset_id, raw_payload_id, external_release_key, pit_quality
) VALUES (
  '0a8f47ac-19fc-7c92-ae91-0242ac120018',
  '0a8f47ac-19fc-7c92-ae91-0242ac120002',
  '0a8f47ac-19fc-7c92-ae91-0242ac120014',
  'verification-unbound-provenance', 'latest_revised_only'
);

INSERT INTO evidence.observations (
  id, series_id, release_id, period_start, period_end, value_numeric,
  parser_version, transformation_run_id
) VALUES
  (
    '0a8f47ac-19fc-7c92-ae91-0242ac120019',
    '0a8f47ac-19fc-7c92-ae91-0242ac120017',
    '0a8f47ac-19fc-7c92-ae91-0242ac120018',
    '2024-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 1,
    '1', '0a8f47ac-19fc-7c92-ae91-0242ac120015'
  ),
  (
    '0a8f47ac-19fc-7c92-ae91-0242ac120020',
    '0a8f47ac-19fc-7c92-ae91-0242ac120017',
    '0a8f47ac-19fc-7c92-ae91-0242ac120018',
    '2025-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 2,
    '1', '0a8f47ac-19fc-7c92-ae91-0242ac120015'
  );

WITH admission AS (
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'basis', 'legacy_verified_v1',
    'observationId', '0a8f47ac-19fc-7c92-ae91-0242ac120019',
    'transformationRunId', transformation.id::text,
    'releaseId', '0a8f47ac-19fc-7c92-ae91-0242ac120018',
    'ingestionRunId', NULL,
    'outputManifestSha256', NULL,
    'parserCodeSha256', transformation.code_sha256,
    'configurationSha256', transformation.configuration_sha256
  ) AS manifest, transformation.completed_at
  FROM evidence.transformation_runs transformation
  WHERE transformation.id = '0a8f47ac-19fc-7c92-ae91-0242ac120015'
)
INSERT INTO evidence.canonical_admissions (
  id, observation_id, transformation_run_id, release_id, basis,
  admission_manifest, admission_sha256, admitted_at
)
SELECT
  '0a8f47ac-19fc-7c92-ae91-0242ac120021',
  '0a8f47ac-19fc-7c92-ae91-0242ac120019',
  '0a8f47ac-19fc-7c92-ae91-0242ac120015',
  '0a8f47ac-19fc-7c92-ae91-0242ac120018',
  'legacy_verified_v1', manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  completed_at
FROM admission;

ALTER TABLE evidence.canonical_admissions
  DISABLE TRIGGER canonical_admissions_snapshot_evidence;
WITH admission AS (
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'basis', 'legacy_verified_v1',
    'observationId', '0a8f47ac-19fc-7c92-ae91-0242ac120020',
    'transformationRunId', transformation.id::text,
    'releaseId', '0a8f47ac-19fc-7c92-ae91-0242ac120018',
    'ingestionRunId', NULL,
    'outputManifestSha256', NULL,
    'parserCodeSha256', transformation.code_sha256,
    'configurationSha256', transformation.configuration_sha256
  ) AS manifest, transformation.completed_at
  FROM evidence.transformation_runs transformation
  WHERE transformation.id = '0a8f47ac-19fc-7c92-ae91-0242ac120015'
)
INSERT INTO evidence.canonical_admissions (
  id, observation_id, transformation_run_id, release_id, basis,
  admission_manifest, admission_sha256, admitted_at
)
SELECT
  '0a8f47ac-19fc-7c92-ae91-0242ac120022',
  '0a8f47ac-19fc-7c92-ae91-0242ac120020',
  '0a8f47ac-19fc-7c92-ae91-0242ac120015',
  '0a8f47ac-19fc-7c92-ae91-0242ac120018',
  'legacy_verified_v1', manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  completed_at
FROM admission;
ALTER TABLE evidence.canonical_admissions
  ENABLE TRIGGER canonical_admissions_snapshot_evidence;

SET LOCAL app.organization_id = '0a8f47ac-19fc-7c92-ae91-0242ac120003';
SET LOCAL app.subject_id = '0a8f47ac-19fc-7c92-ae91-0242ac120004';

DO $verify_legacy_provenance_fails_closed$
BEGIN
  IF NOT EXISTS (
      SELECT 1
      FROM evidence.canonical_admission_evidence_sets admission_evidence
      WHERE admission_evidence.observation_id =
        '0a8f47ac-19fc-7c92-ae91-0242ac120019'
    )
    OR EXISTS (
      SELECT 1
      FROM evidence.canonical_admission_evidence_sets admission_evidence
      WHERE admission_evidence.observation_id =
        '0a8f47ac-19fc-7c92-ae91-0242ac120020'
    )
    OR NOT evidence.canonical_admission_identity_is_current(
      '0a8f47ac-19fc-7c92-ae91-0242ac120019'
    )
    OR evidence.canonical_admission_identity_is_current(
      '0a8f47ac-19fc-7c92-ae91-0242ac120020'
    )
    OR evidence.governed_observation_provenance_0022(
      '0a8f47ac-19fc-7c92-ae91-0242ac120020', 'view'
    ) IS NULL
    OR evidence.governed_observation_provenance(
      '0a8f47ac-19fc-7c92-ae91-0242ac120019', 'view'
    ) IS NULL
    OR evidence.governed_observation_provenance(
      '0a8f47ac-19fc-7c92-ae91-0242ac120020', 'view'
    ) IS NOT NULL
  THEN
    RAISE EXCEPTION
      'legacy admission provenance did not fail closed while post-0022 evidence served';
  END IF;
END
$verify_legacy_provenance_fails_closed$;

DO $verify_bound_catalog_function_privileges$
DECLARE
  public_execute_count integer;
BEGIN
  IF NOT has_function_privilege(
      'economyos_app',
      'evidence.governed_observation_provenance(uuid,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_app',
      'evidence.governed_observation_provenance_0022(uuid,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_app',
      'evidence.canonical_admission_identity_is_current(uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_ingest',
      'evidence.canonical_admission_identity_is_current(uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_app',
      'evidence.reject_reference_catalog_mutation()',
      'EXECUTE'
    )
    OR NOT has_table_privilege(
      'economyos_app', 'evidence.concepts', 'SELECT'
    )
    OR NOT has_table_privilege(
      'economyos_app', 'evidence.geographies', 'SELECT'
    )
    OR has_table_privilege(
      'economyos_app', 'evidence.concepts', 'INSERT'
    )
    OR has_table_privilege(
      'economyos_app', 'evidence.concepts', 'UPDATE'
    )
    OR has_table_privilege(
      'economyos_app', 'evidence.concepts', 'DELETE'
    )
    OR has_table_privilege(
      'economyos_app', 'evidence.geographies', 'INSERT'
    )
    OR has_table_privilege(
      'economyos_app', 'evidence.geographies', 'UPDATE'
    )
    OR has_table_privilege(
      'economyos_app', 'evidence.geographies', 'DELETE'
    )
  THEN
    RAISE EXCEPTION 'bound catalog function privileges are incorrect';
  END IF;

  SELECT count(*) INTO public_execute_count
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  CROSS JOIN LATERAL aclexplode(
    coalesce(procedure.proacl, acldefault('f', procedure.proowner))
  ) privilege
  WHERE namespace.nspname = 'evidence'
    AND procedure.proname IN (
      'reject_bound_source_identity_update',
      'reject_bound_source_dataset_identity_update',
      'reject_reference_catalog_mutation',
      'canonical_admission_identity_is_current',
      'governed_observation_provenance_0022',
      'governed_observation_provenance'
    )
    AND privilege.grantee = 0
    AND privilege.privilege_type = 'EXECUTE';
  IF public_execute_count <> 0 THEN
    RAISE EXCEPTION 'bound catalog function remains executable by PUBLIC';
  END IF;
END
$verify_bound_catalog_function_privileges$;

SET LOCAL ROLE economyos_app;
SET LOCAL app.organization_id = '0a8f47ac-19fc-7c92-ae91-0242ac120003';
SET LOCAL app.subject_id = '0a8f47ac-19fc-7c92-ae91-0242ac120004';

DO $verify_bound_catalog_runtime_boundary$
DECLARE
  post_0022_provenance jsonb;
  legacy_provenance jsonb;
BEGIN
  SELECT evidence.governed_observation_provenance(
    '0a8f47ac-19fc-7c92-ae91-0242ac120019', 'view'
  ) INTO post_0022_provenance;
  SELECT evidence.governed_observation_provenance(
    '0a8f47ac-19fc-7c92-ae91-0242ac120020', 'view'
  ) INTO legacy_provenance;
  IF post_0022_provenance IS NULL OR legacy_provenance IS NOT NULL THEN
    RAISE EXCEPTION
      'runtime provenance boundary did not distinguish post-0022 from legacy evidence';
  END IF;
  IF evidence.governed_observation_provenance(
      '0a8f47ac-19fc-7c92-ae91-0242ac120005', 'api'
    ) IS NOT NULL
  THEN
    RAISE EXCEPTION 'unknown observation returned provenance';
  END IF;
  BEGIN
    PERFORM evidence.canonical_admission_identity_is_current(
      '0a8f47ac-19fc-7c92-ae91-0242ac120005'
    );
    RAISE EXCEPTION 'application role executed private admission identity predicate';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM evidence.governed_observation_provenance_0022(
      '0a8f47ac-19fc-7c92-ae91-0242ac120005', 'api'
    );
    RAISE EXCEPTION 'application role executed superseded provenance implementation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_bound_catalog_runtime_boundary$;

RESET ROLE;
ROLLBACK;
