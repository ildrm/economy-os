-- Verify the Phase 4 crisis-forecast authority: exact independent hazards,
-- point-in-time evidence, governed model/legal serving, chronological scoring,
-- reproducible alert hysteresis, append-only postmortems, and narrow reads.
BEGIN;

INSERT INTO app.organizations (id, slug, name) VALUES
  ('43af47ac-19fc-7c92-ae91-0242ac120001', 'crisis-a', 'Crisis Tenant A'),
  ('43af47ac-19fc-7c92-ae91-0242ac120002', 'crisis-b', 'Crisis Tenant B');
INSERT INTO app.workspaces (id, organization_id, slug, name) VALUES
  (
    '43af47ac-19fc-7c92-ae91-0242ac120003',
    '43af47ac-19fc-7c92-ae91-0242ac120001', 'research', 'Crisis Research A'
  ),
  (
    '43af47ac-19fc-7c92-ae91-0242ac120004',
    '43af47ac-19fc-7c92-ae91-0242ac120002', 'research', 'Crisis Research B'
  );
INSERT INTO app.subjects (id, issuer, external_subject, kind) VALUES
  (
    '43af47ac-19fc-7c92-ae91-0242ac120005',
    'https://identity.economyos.test/', 'crisis-admin-a', 'human'
  ),
  (
    '43af47ac-19fc-7c92-ae91-0242ac120006',
    'https://identity.economyos.test/', 'crisis-analyst-b', 'human'
  );
INSERT INTO app.organization_memberships (
  organization_id, subject_id, role, valid_from
) VALUES
  (
    '43af47ac-19fc-7c92-ae91-0242ac120001',
    '43af47ac-19fc-7c92-ae91-0242ac120005', 'admin', '2026-01-01T00:00:00Z'
  ),
  (
    '43af47ac-19fc-7c92-ae91-0242ac120002',
    '43af47ac-19fc-7c92-ae91-0242ac120006', 'admin', '2026-01-01T00:00:00Z'
  );
INSERT INTO app.workspace_memberships (
  organization_id, workspace_id, subject_id, role, valid_from
) VALUES
  (
    '43af47ac-19fc-7c92-ae91-0242ac120001',
    '43af47ac-19fc-7c92-ae91-0242ac120003',
    '43af47ac-19fc-7c92-ae91-0242ac120005', 'admin', '2026-01-01T00:00:00Z'
  ),
  (
    '43af47ac-19fc-7c92-ae91-0242ac120002',
    '43af47ac-19fc-7c92-ae91-0242ac120004',
    '43af47ac-19fc-7c92-ae91-0242ac120006', 'admin', '2026-01-01T00:00:00Z'
  );

INSERT INTO evidence.geographies (id, kind, code_scheme, code, name) VALUES
  (
    '43af47ac-19fc-7c92-ae91-0242ac120007',
    'economy', 'ECONOMYOS-TEST', 'CRA', 'Crisis economy A'
  ),
  (
    '43af47ac-19fc-7c92-ae91-0242ac120008',
    'economy', 'ECONOMYOS-TEST', 'CRB', 'Crisis economy B'
  );

-- One fully governed canonical observation is used to prove both historical
-- cutoff admission and live legal fail-closed serving.
INSERT INTO evidence.license_reviews (
  id, source_slug, dataset_external_key, evidence_uri, license_expression,
  intended_uses, evidence, reviewed_by, reviewed_at, created_at
) VALUES (
  '43af47ac-19fc-7c92-ae91-0242ac120010',
  'crisis-canonical-fixture', 'crisis.series',
  'https://example.invalid/crisis/license', 'TEST-CRISIS',
  ARRAY['view', 'api', 'derive'], '{"fixture":true}', 'database verification',
  '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
);
INSERT INTO evidence.sources (
  id, organization_id, slug, name, authority_class, homepage_uri,
  classification, license_status, license_expression, redistribution_allowed,
  reviewed_at, license_review_id, attribution_text, permitted_actions, created_at
) VALUES (
  '43af47ac-19fc-7c92-ae91-0242ac120011',
  '43af47ac-19fc-7c92-ae91-0242ac120001',
  'crisis-canonical-fixture', 'Crisis canonical source', 'customer',
  'https://example.invalid/crisis', 'confidential', 'approved', 'TEST-CRISIS',
  false, '2026-01-01T00:00:00Z',
  '43af47ac-19fc-7c92-ae91-0242ac120010',
  'Verification fixture; not production data.', ARRAY['view', 'api', 'derive'],
  '2026-01-01T00:00:00Z'
);
INSERT INTO evidence.source_datasets (
  id, organization_id, source_id, external_key, title, pit_quality,
  admission_status, admitted_at, created_at
) VALUES (
  '43af47ac-19fc-7c92-ae91-0242ac120012',
  '43af47ac-19fc-7c92-ae91-0242ac120001',
  '43af47ac-19fc-7c92-ae91-0242ac120011',
  'crisis.series', 'Crisis canonical dataset', 'true_vintage',
  'approved', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
);
INSERT INTO evidence.source_admission_events (
  id, organization_id, source_id, dataset_id, decision, permitted_actions,
  license_review_id, reason, decided_by, decided_at, recorded_at
) VALUES (
  '43af47ac-19fc-7c92-ae91-0242ac120013',
  '43af47ac-19fc-7c92-ae91-0242ac120001',
  '43af47ac-19fc-7c92-ae91-0242ac120011',
  '43af47ac-19fc-7c92-ae91-0242ac120012',
  'approved', ARRAY['view', 'api', 'derive'],
  '43af47ac-19fc-7c92-ae91-0242ac120010',
  'Verification crisis admission.', 'database verification',
  '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
);
INSERT INTO evidence.concepts (
  id, canonical_key, name, definition, measurement_class, ontology_version
) VALUES (
  '43af47ac-19fc-7c92-ae91-0242ac120014',
  'economy.crisis.fx.pressure', 'Crisis FX pressure',
  'Verification-only point-in-time crisis indicator.', 'risk', 'verification-1'
);
INSERT INTO evidence.series (
  id, organization_id, dataset_id, concept_id, geography_id,
  external_series_key, unit_code, frequency, seasonal_adjustment, data_class,
  created_at
) VALUES (
  '43af47ac-19fc-7c92-ae91-0242ac120015',
  '43af47ac-19fc-7c92-ae91-0242ac120001',
  '43af47ac-19fc-7c92-ae91-0242ac120012',
  '43af47ac-19fc-7c92-ae91-0242ac120014',
  '43af47ac-19fc-7c92-ae91-0242ac120007',
  'crisis.series.CRA', 'index_points', 'daily', 'unadjusted', 'observed',
  '2026-01-01T00:00:00Z'
);
INSERT INTO evidence.raw_payloads (
  id, organization_id, dataset_id, request_uri, object_uri, media_type,
  checksum_sha256, byte_length, fetched_at, parser_name, parser_version, recorded_at
) VALUES (
  '43af47ac-19fc-7c92-ae91-0242ac120016',
  '43af47ac-19fc-7c92-ae91-0242ac120001',
  '43af47ac-19fc-7c92-ae91-0242ac120012',
  'https://example.invalid/crisis/data',
  's3://verification-only/crisis.json', 'application/json', repeat('a', 64),
  42, '2026-05-01T00:00:00Z', 'crisis-verification', '1',
  '2026-05-01T00:00:01Z'
);
INSERT INTO evidence.transformation_runs (
  id, organization_id, dataset_id, raw_payload_id, parser_name, parser_version,
  code_sha256, configuration, configuration_sha256, status,
  started_at, completed_at, workflow_id
)
SELECT
  '43af47ac-19fc-7c92-ae91-0242ac120017',
  '43af47ac-19fc-7c92-ae91-0242ac120001',
  '43af47ac-19fc-7c92-ae91-0242ac120012',
  '43af47ac-19fc-7c92-ae91-0242ac120016',
  'crisis-verification', '1', repeat('b', 64), configuration,
  encode(digest(convert_to(evidence.canonical_json(configuration), 'UTF8'), 'sha256'), 'hex'),
  'succeeded', '2026-05-01T00:00:01Z', '2026-05-01T00:00:02Z',
  'verify-crisis-persistence'
FROM (VALUES ('{}'::jsonb)) input(configuration);
INSERT INTO evidence.quality_results (
  id, organization_id, dataset_id, raw_payload_id, transformation_run_id,
  check_code, status, details, checked_at, recorded_at
) VALUES (
  '43af47ac-19fc-7c92-ae91-0242ac120018',
  '43af47ac-19fc-7c92-ae91-0242ac120001',
  '43af47ac-19fc-7c92-ae91-0242ac120012',
  '43af47ac-19fc-7c92-ae91-0242ac120016',
  '43af47ac-19fc-7c92-ae91-0242ac120017',
  'admission', 'pass', '{"score":1}', '2026-05-01T00:00:02Z',
  '2026-05-01T00:00:02Z'
);
INSERT INTO evidence.releases (
  id, organization_id, dataset_id, raw_payload_id, external_release_key,
  release_time, source_publication_time, original_release_time, availability_time,
  revision_time, pit_quality, revision_sequence, recorded_at
) VALUES (
  '43af47ac-19fc-7c92-ae91-0242ac120019',
  '43af47ac-19fc-7c92-ae91-0242ac120001',
  '43af47ac-19fc-7c92-ae91-0242ac120012',
  '43af47ac-19fc-7c92-ae91-0242ac120016', 'crisis-2026-05-01',
  '2026-05-01T00:00:00Z', '2026-05-01T00:00:00Z',
  '2026-05-01T00:00:00Z', '2026-05-01T00:00:00Z',
  '2026-05-01T00:00:00Z', 'true_vintage', 0, '2026-05-01T00:00:02Z'
);
INSERT INTO evidence.observations (
  id, organization_id, series_id, release_id, period_start, period_end,
  value_numeric, status, parser_version, recorded_at, transformation_run_id
) VALUES (
  '43af47ac-19fc-7c92-ae91-0242ac120020',
  '43af47ac-19fc-7c92-ae91-0242ac120001',
  '43af47ac-19fc-7c92-ae91-0242ac120015',
  '43af47ac-19fc-7c92-ae91-0242ac120019',
  '2026-04-30T00:00:00Z', '2026-05-01T00:00:00Z',
  7.5, 'final', '1', '2026-05-01T00:00:02Z',
  '43af47ac-19fc-7c92-ae91-0242ac120017'
);
WITH admission AS (
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'basis', 'legacy_verified_v1',
    'observationId', '43af47ac-19fc-7c92-ae91-0242ac120020',
    'transformationRunId', '43af47ac-19fc-7c92-ae91-0242ac120017',
    'releaseId', '43af47ac-19fc-7c92-ae91-0242ac120019',
    'ingestionRunId', NULL,
    'outputManifestSha256', NULL,
    'parserCodeSha256', repeat('b', 64),
    'configurationSha256', encode(digest(convert_to(
      evidence.canonical_json('{}'::jsonb), 'UTF8'
    ), 'sha256'), 'hex')
  ) AS manifest
)
INSERT INTO evidence.canonical_admissions (
  id, organization_id, observation_id, transformation_run_id, release_id,
  basis, admission_manifest, admission_sha256, admitted_at, created_at
)
SELECT
  '43af47ac-19fc-7c92-ae91-0242ac120021',
  '43af47ac-19fc-7c92-ae91-0242ac120001',
  '43af47ac-19fc-7c92-ae91-0242ac120020',
  '43af47ac-19fc-7c92-ae91-0242ac120017',
  '43af47ac-19fc-7c92-ae91-0242ac120019',
  'legacy_verified_v1', manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  '2026-05-01T00:00:03Z', '2026-05-01T00:00:03Z'
FROM admission;

WITH snapshots(id, organization_id, workspace_id, known_at, created_by, manifest) AS (
  VALUES
  (
    '43af47ac-19fc-7c92-ae91-0242ac120030'::uuid,
    '43af47ac-19fc-7c92-ae91-0242ac120001'::uuid,
    '43af47ac-19fc-7c92-ae91-0242ac120003'::uuid,
    '2026-06-01T00:00:00Z'::timestamptz,
    '43af47ac-19fc-7c92-ae91-0242ac120005'::uuid,
    '{"knownAt":"2026-06-01T00:00:00Z","policy":"true_vintage","observationIds":["43af47ac-19fc-7c92-ae91-0242ac120020"]}'::jsonb
  ),
  (
    '43af47ac-19fc-7c92-ae91-0242ac120031'::uuid,
    '43af47ac-19fc-7c92-ae91-0242ac120002'::uuid,
    '43af47ac-19fc-7c92-ae91-0242ac120004'::uuid,
    '2026-06-01T00:00:00Z'::timestamptz,
    '43af47ac-19fc-7c92-ae91-0242ac120006'::uuid,
    '{"knownAt":"2026-06-01T00:00:00Z","policy":"true_vintage","observationIds":[]}'::jsonb
  )
)
INSERT INTO evidence.dataset_snapshots (
  id, organization_id, workspace_id, known_at, policy,
  manifest, manifest_sha256, created_by, created_at
)
SELECT id, organization_id, workspace_id, known_at, 'true_vintage', manifest,
  encode(digest(convert_to(manifest::text, 'UTF8'), 'sha256'), 'hex'),
  created_by, '2026-05-02T00:00:00Z'
FROM snapshots;

SET LOCAL app.organization_id = '43af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '43af47ac-19fc-7c92-ae91-0242ac120005';
WITH artifacts(
  id, organization_id, workspace_id, artifact_key, created_by
) AS (VALUES
  (
    '43af47ac-19fc-7c92-ae91-0242ac120040'::uuid,
    '43af47ac-19fc-7c92-ae91-0242ac120001'::uuid,
    '43af47ac-19fc-7c92-ae91-0242ac120003'::uuid,
    'crisis.fx.primary'::text,
    '43af47ac-19fc-7c92-ae91-0242ac120005'::uuid
  ),
  (
    '43af47ac-19fc-7c92-ae91-0242ac120041'::uuid,
    '43af47ac-19fc-7c92-ae91-0242ac120001'::uuid,
    '43af47ac-19fc-7c92-ae91-0242ac120003'::uuid,
    'crisis.alert.primary'::text,
    '43af47ac-19fc-7c92-ae91-0242ac120005'::uuid
  )
), manifested AS (
  SELECT artifacts.*, jsonb_build_object(
    'schemaVersion', 1,
    'id', id::text,
    'key', artifact_key,
    'version', '1.0.0',
    'lifecycleStatus', 'research',
    'algorithm', jsonb_build_object('key', 'crisis.hazard', 'version', '1.0.0'),
    'codeCommitSha256', repeat('1', 64),
    'packageLockSha256', repeat('2', 64),
    'sbomSha256', repeat('3', 64),
    'environmentSha256', repeat('4', 64),
    'configurationSha256', repeat('5', 64),
    'normalizationSha256', repeat('6', 64),
    'assumptionsSha256', repeat('7', 64),
    'approvalSha256', repeat('8', 64)
  ) AS manifest
  FROM artifacts
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
  'research', 'crisis.hazard', '1.0.0',
  repeat('1', 64), repeat('2', 64), repeat('3', 64),
  repeat('4', 64), repeat('5', 64), repeat('6', 64),
  repeat('7', 64), repeat('8', 64), manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  created_by, '2026-05-01T00:00:00Z'
FROM manifested;

SET LOCAL app.organization_id = '43af47ac-19fc-7c92-ae91-0242ac120002';
SET LOCAL app.subject_id = '43af47ac-19fc-7c92-ae91-0242ac120006';
WITH manifested AS (
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'id', '43af47ac-19fc-7c92-ae91-0242ac120042',
    'key', 'crisis.foreign.primary',
    'version', '1.0.0',
    'lifecycleStatus', 'research',
    'algorithm', jsonb_build_object('key', 'crisis.hazard', 'version', '1.0.0'),
    'codeCommitSha256', repeat('1', 64),
    'packageLockSha256', repeat('2', 64),
    'sbomSha256', repeat('3', 64),
    'environmentSha256', repeat('4', 64),
    'configurationSha256', repeat('5', 64),
    'normalizationSha256', repeat('6', 64),
    'assumptionsSha256', repeat('7', 64),
    'approvalSha256', repeat('8', 64)
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
  '43af47ac-19fc-7c92-ae91-0242ac120042',
  '43af47ac-19fc-7c92-ae91-0242ac120002',
  '43af47ac-19fc-7c92-ae91-0242ac120004',
  'crisis.foreign.primary', '1.0.0', 'research', 'crisis.hazard', '1.0.0',
  repeat('1', 64), repeat('2', 64), repeat('3', 64),
  repeat('4', 64), repeat('5', 64), repeat('6', 64),
  repeat('7', 64), repeat('8', 64), manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  '43af47ac-19fc-7c92-ae91-0242ac120006', '2026-05-01T00:00:00Z'
FROM manifested;

CREATE TEMP TABLE crisis_verification_slots (
  run_id uuid NOT NULL,
  hazard text NOT NULL,
  horizon_days integer NOT NULL,
  slot_id uuid NOT NULL,
  PRIMARY KEY (run_id, hazard, horizon_days)
) ON COMMIT DROP;
CREATE TEMP TABLE crisis_verification_clock (
  base_time timestamptz NOT NULL,
  late_relationship_evidence_id uuid,
  episode_cluster_id uuid
) ON COMMIT DROP;
INSERT INTO crisis_verification_clock (base_time)
VALUES (statement_timestamp());
GRANT SELECT, UPDATE ON crisis_verification_clock
  TO economyos_app_local, economyos_ingest_local;
GRANT SELECT ON crisis_verification_slots
  TO economyos_app_local, economyos_ingest_local;

CREATE OR REPLACE FUNCTION pg_temp.populate_crisis_slots(
  requested_run_id uuid,
  requested_model_artifact_id uuid,
  requested_target_raw numeric,
  requested_target_calibrated numeric,
  requested_target_calibration_status text,
  requested_target_ood boolean,
  requested_target_requires_evidence boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  slot_pointer record;
  raw_probability numeric;
  calibrated_probability numeric;
BEGIN
  FOR slot_pointer IN
    SELECT * FROM crisis_verification_slots
    WHERE run_id = requested_run_id
    ORDER BY array_position(
      ARRAY['FX','BANK','SOV','MON','POL','COUP','CIV','WAR'], hazard
    ), horizon_days
  LOOP
    raw_probability := CASE WHEN slot_pointer.hazard = 'FX'
      AND slot_pointer.horizon_days = 30
      THEN requested_target_raw ELSE 0.2 END;
    calibrated_probability := CASE WHEN slot_pointer.hazard = 'FX'
      AND slot_pointer.horizon_days = 30
      THEN requested_target_calibrated ELSE 0.2 END;
    PERFORM evidence.append_crisis_forecast_slot(
      slot_pointer.slot_id, requested_run_id,
      slot_pointer.hazard, slot_pointer.horizon_days,
      raw_probability, calibrated_probability,
      greatest(0, calibrated_probability - 0.1),
      least(1, calibrated_probability + 0.1), 0.95,
      'verification-bootstrap',
      CASE WHEN slot_pointer.hazard = 'FX' AND slot_pointer.horizon_days = 30
        THEN requested_target_calibration_status ELSE 'calibrated' END,
      CASE WHEN slot_pointer.hazard = 'FX' AND slot_pointer.horizon_days = 30
        THEN requested_target_ood ELSE false END,
      requested_model_artifact_id,
      '2026-04-01T00:00:00Z', '2026-05-01T00:00:00Z',
      repeat('5', 64), repeat('1', 64),
      jsonb_build_array('Verification-only model assumption.'),
      jsonb_build_array(jsonb_build_object(
        'criterionId', 'verification-invalidation',
        'description', 'Invalidate when the verification regime changes.',
        'indicatorKey', 'verification.regime',
        'operator', 'equals', 'threshold', 'changed', 'requiredObservations', 1
      )),
      CASE WHEN slot_pointer.hazard = 'FX' AND slot_pointer.horizon_days = 30
        AND requested_target_requires_evidence THEN NULL
        ELSE 'No admissible supporting item in this verification fixture.' END,
      'No admissible counter-evidence item in this verification fixture.'
    );
  END LOOP;
END
$$;
GRANT EXECUTE ON FUNCTION pg_temp.populate_crisis_slots(
  uuid, uuid, numeric, numeric, text, boolean, boolean
) TO economyos_ingest_local;

INSERT INTO crisis_verification_slots (run_id, hazard, horizon_days, slot_id)
SELECT run_id, hazard, horizon_days, evidence.deterministic_uuid_v8(
  'economyos:crisis-verification-slot:v1',
  run_id::text, hazard, horizon_days::text
)
FROM unnest(ARRAY[
  '43af47ac-19fc-7c92-ae91-0242ac120100'::uuid,
  '43af47ac-19fc-7c92-ae91-0242ac120102'::uuid,
  '43af47ac-19fc-7c92-ae91-0242ac120200'::uuid,
  '43af47ac-19fc-7c92-ae91-0242ac120301'::uuid,
  '43af47ac-19fc-7c92-ae91-0242ac120302'::uuid,
  '43af47ac-19fc-7c92-ae91-0242ac120303'::uuid,
  '43af47ac-19fc-7c92-ae91-0242ac120304'::uuid,
  '43af47ac-19fc-7c92-ae91-0242ac120305'::uuid,
  '43af47ac-19fc-7c92-ae91-0242ac120306'::uuid,
  '43af47ac-19fc-7c92-ae91-0242ac120500'::uuid
]) AS runs(run_id)
CROSS JOIN unnest(ARRAY['FX','BANK','SOV','MON','POL','COUP','CIV','WAR'])
  AS hazards(hazard)
CROSS JOIN unnest(ARRAY[30,90,180,365]) AS horizons(horizon_days);

DO $verify_crisis_acl$
BEGIN
  IF has_table_privilege(
      'economyos_app_local', 'evidence.crisis_forecast_slots', 'SELECT'
    )
    OR has_table_privilege(
      'economyos_ingest_local', 'evidence.crisis_forecast_runs', 'INSERT'
    )
    OR NOT has_function_privilege(
      'economyos_app_local', 'app.get_crisis_forecast_run(uuid,uuid)', 'EXECUTE'
    )
    OR NOT has_function_privilege(
      'economyos_app_local', 'app.get_crisis_forecast_slot(uuid,uuid)', 'EXECUTE'
    )
    OR NOT has_function_privilege(
      'economyos_app_local',
      'app.list_crisis_forecast_runs(uuid,uuid,integer,timestamptz,uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_ingest_local', 'app.get_crisis_forecast_slot(uuid,uuid)', 'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_app_local',
      'evidence.prepare_crisis_forecast_run(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,text)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'economyos_ingest_local',
      'evidence.prepare_crisis_forecast_run(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_app_local',
      'evidence.crisis_forecast_run_is_currently_servable_internal(uuid,uuid,uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_ingest_local',
      'evidence.crisis_record_manifest(text,jsonb,text,text)', 'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_ingest_local',
      'evidence.crisis_valid_assumptions(jsonb)', 'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_app_local',
      'evidence.crisis_valid_invalidation_criteria(jsonb)', 'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'crisis persistence least-privilege boundary is incorrect';
  END IF;
END
$verify_crisis_acl$;

SET LOCAL ROLE economyos_app_local;
SET LOCAL app.organization_id = '43af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '43af47ac-19fc-7c92-ae91-0242ac120005';

SELECT evidence.create_crisis_episode_definition(
  '43af47ac-19fc-7c92-ae91-0242ac120050',
  '43af47ac-19fc-7c92-ae91-0242ac120003',
  'crisis.fx.episode', 'FX'
);
SELECT evidence.create_crisis_episode_definition_version(
  '43af47ac-19fc-7c92-ae91-0242ac120051',
  '43af47ac-19fc-7c92-ae91-0242ac120050', '1.0.0',
  '{"onset":{"indicator":"verification.fx","operator":"gte","threshold":"1"}}',
  '["Verification-only episode definition assumption."]',
  repeat('9', 64), repeat('a', 64), '2026-01-01T00:00:00Z', NULL
);
SELECT evidence.create_relationship_evidence(
  '43af47ac-19fc-7c92-ae91-0242ac120060',
  '43af47ac-19fc-7c92-ae91-0242ac120003',
  'official_data', 'https://example.invalid/crisis/alert-evidence',
  repeat('c', 64), '{"series":"verification.alert"}',
  '2026-05-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL
);
UPDATE crisis_verification_clock
SET late_relationship_evidence_id = '43af47ac-19fc-7c92-ae91-0242ac120060';

SELECT evidence.create_crisis_alert_policy(
  '43af47ac-19fc-7c92-ae91-0242ac120700',
  '43af47ac-19fc-7c92-ae91-0242ac120003',
  'crisis.fx.alert', '1.0.0', 'FX', 30,
  0.7, 0.4, 0.8, 0.9, 2, 2, 1, 'warning'
);

DO $verify_episode_replay$
DECLARE
  replayed uuid;
BEGIN
  replayed := evidence.create_crisis_episode_definition(
    '43af47ac-19fc-7c92-ae91-0242ac120050',
    '43af47ac-19fc-7c92-ae91-0242ac120003',
    'crisis.fx.episode', 'FX'
  );
  IF replayed <> '43af47ac-19fc-7c92-ae91-0242ac120050' THEN
    RAISE EXCEPTION 'episode definition replay changed identity';
  END IF;
  BEGIN
    PERFORM evidence.create_crisis_episode_definition(
      '43af47ac-19fc-7c92-ae91-0242ac120050',
      '43af47ac-19fc-7c92-ae91-0242ac120003',
      'crisis.fx.changed', 'FX'
    );
    RAISE EXCEPTION 'changed episode definition replay unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END
$verify_episode_replay$;

RESET ROLE;
UPDATE crisis_verification_clock
SET episode_cluster_id = evidence.deterministic_uuid_v8(
  'economyos:crisis-event-cluster:v1',
  '43af47ac-19fc-7c92-ae91-0242ac120007', 'FX',
  '2026-06-15T00:00:00.000000Z', '1.0.0'
);

SET LOCAL ROLE economyos_ingest_local;
SET LOCAL app.organization_id = '43af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '43af47ac-19fc-7c92-ae91-0242ac120005';

SELECT evidence.declare_crisis_episode(
  '43af47ac-19fc-7c92-ae91-0242ac120052',
  '43af47ac-19fc-7c92-ae91-0242ac120051',
  '43af47ac-19fc-7c92-ae91-0242ac120007',
  (SELECT episode_cluster_id FROM crisis_verification_clock),
  '2026-06-15T00:00:00Z', '2026-06-20T00:00:00Z',
  '2026-06-21T00:00:00Z', repeat('d', 64),
  '["Verification-only declared episode assumption."]'
);

SELECT evidence.prepare_crisis_forecast_run(
  '43af47ac-19fc-7c92-ae91-0242ac120100',
  '43af47ac-19fc-7c92-ae91-0242ac120003',
  '43af47ac-19fc-7c92-ae91-0242ac120007',
  '43af47ac-19fc-7c92-ae91-0242ac120030',
  '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z',
  repeat('e', 64), repeat('f', 64)
);
SELECT pg_temp.populate_crisis_slots(
  '43af47ac-19fc-7c92-ae91-0242ac120100',
  '43af47ac-19fc-7c92-ae91-0242ac120040',
  0.812345678901234567, 0.712345678901234567,
  'calibrated', false, false
);

DO $verify_late_evidence_and_role$
DECLARE
  target_slot uuid;
BEGIN
  SELECT slot_id INTO target_slot FROM crisis_verification_slots
  WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120100'
    AND hazard = 'FX' AND horizon_days = 30;
  BEGIN
    PERFORM evidence.bind_crisis_forecast_evidence(
      '43af47ac-19fc-7c92-ae91-0242ac120101', target_slot,
      'supports', 'verification.late', 'increases_risk', 'late-value',
      'relationship_evidence',
      (SELECT late_relationship_evidence_id FROM crisis_verification_clock)
    );
    RAISE EXCEPTION 'later-recorded evidence crossed the historical cutoff';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END
$verify_late_evidence_and_role$;

SELECT * FROM evidence.complete_crisis_forecast_run(
  '43af47ac-19fc-7c92-ae91-0242ac120100',
  '43af47ac-19fc-7c92-ae91-0242ac120110'
);

DO $verify_run_and_completion_replay$
DECLARE
  replayed uuid;
  completion record;
BEGIN
  replayed := evidence.prepare_crisis_forecast_run(
    '43af47ac-19fc-7c92-ae91-0242ac120100',
    '43af47ac-19fc-7c92-ae91-0242ac120003',
    '43af47ac-19fc-7c92-ae91-0242ac120007',
    '43af47ac-19fc-7c92-ae91-0242ac120030',
    '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z',
    repeat('e', 64), repeat('f', 64)
  );
  IF replayed <> '43af47ac-19fc-7c92-ae91-0242ac120100' THEN
    RAISE EXCEPTION 'forecast run replay changed identity';
  END IF;
  SELECT * INTO completion FROM evidence.complete_crisis_forecast_run(
    '43af47ac-19fc-7c92-ae91-0242ac120100',
    '43af47ac-19fc-7c92-ae91-0242ac120110'
  );
  IF completion.completion_id <> '43af47ac-19fc-7c92-ae91-0242ac120110'
    OR completion.completion_sha256 !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'forecast completion replay changed output';
  END IF;
  BEGIN
    PERFORM * FROM evidence.complete_crisis_forecast_run(
      '43af47ac-19fc-7c92-ae91-0242ac120100',
      '43af47ac-19fc-7c92-ae91-0242ac120111'
    );
    RAISE EXCEPTION 'completion identity conflict unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END
$verify_run_and_completion_replay$;

-- This current-time run binds the canonical source. The separate historical
-- run above proves a newly recorded relationship item cannot be backdated.
SELECT evidence.prepare_crisis_forecast_run(
  '43af47ac-19fc-7c92-ae91-0242ac120102',
  '43af47ac-19fc-7c92-ae91-0242ac120003',
  '43af47ac-19fc-7c92-ae91-0242ac120007',
  '43af47ac-19fc-7c92-ae91-0242ac120030',
  (SELECT base_time + interval '5 seconds' FROM crisis_verification_clock),
  (SELECT base_time + interval '6 seconds' FROM crisis_verification_clock),
  repeat('e', 64), repeat('f', 64)
);
SELECT pg_temp.populate_crisis_slots(
  '43af47ac-19fc-7c92-ae91-0242ac120102',
  '43af47ac-19fc-7c92-ae91-0242ac120040',
  0.812345678901234567, 0.712345678901234567,
  'calibrated', false, true
);
DO $verify_evidence_role_constraint$
DECLARE
  target_slot uuid;
BEGIN
  SELECT slot_id INTO target_slot FROM crisis_verification_slots
  WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120102'
    AND hazard = 'FX' AND horizon_days = 30;
  BEGIN
    PERFORM evidence.bind_crisis_forecast_evidence(
      '43af47ac-19fc-7c92-ae91-0242ac120104', target_slot,
      'aggregate', 'verification.invalid-role', 'increases_risk', 'invalid-role',
      'canonical_admission', '43af47ac-19fc-7c92-ae91-0242ac120021'
    );
    RAISE EXCEPTION 'invalid evidence role unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$verify_evidence_role_constraint$;
SELECT evidence.bind_crisis_forecast_evidence(
  '43af47ac-19fc-7c92-ae91-0242ac120103',
  (SELECT slot_id FROM crisis_verification_slots
    WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120102'
      AND hazard = 'FX' AND horizon_days = 30),
  'supports', 'verification.fx.pressure', 'increases_risk', '7.5',
  'canonical_admission', '43af47ac-19fc-7c92-ae91-0242ac120021'
);

DO $verify_evidence_counter_role_separation$
DECLARE
  target_slot uuid;
BEGIN
  SELECT slot_id INTO target_slot FROM crisis_verification_slots
  WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120102'
    AND hazard = 'FX' AND horizon_days = 30;
  BEGIN
    PERFORM evidence.bind_crisis_forecast_evidence(
      '43af47ac-19fc-7c92-ae91-0242ac120105', target_slot,
      'contradicts', 'verification.fx.counter', 'decreases_risk', '7.5',
      'canonical_admission', '43af47ac-19fc-7c92-ae91-0242ac120021'
    );
    RAISE EXCEPTION 'one source was counted as both evidence and counter-evidence';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END
$verify_evidence_counter_role_separation$;

SELECT * FROM evidence.complete_crisis_forecast_run(
  '43af47ac-19fc-7c92-ae91-0242ac120102',
  '43af47ac-19fc-7c92-ae91-0242ac120112'
);

DO $verify_completed_child_replay$
DECLARE
  target_slot uuid;
  replayed uuid;
BEGIN
  SELECT slot_id INTO target_slot FROM crisis_verification_slots
  WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120102'
    AND hazard = 'FX' AND horizon_days = 30;

  replayed := evidence.append_crisis_forecast_slot(
    target_slot, '43af47ac-19fc-7c92-ae91-0242ac120102', 'FX', 30,
    0.812345678901234567, 0.712345678901234567,
    0.612345678901234567, 0.812345678901234567,
    0.95, 'verification-bootstrap', 'calibrated', false,
    '43af47ac-19fc-7c92-ae91-0242ac120040',
    '2026-04-01T00:00:00Z', '2026-05-01T00:00:00Z',
    repeat('5', 64), repeat('1', 64),
    '["Verification-only model assumption."]',
    '[{"criterionId":"verification-invalidation","description":"Invalidate when the verification regime changes.","indicatorKey":"verification.regime","operator":"equals","threshold":"changed","requiredObservations":1}]',
    NULL, 'No admissible counter-evidence item in this verification fixture.'
  );
  IF replayed <> target_slot THEN
    RAISE EXCEPTION 'completed slot replay changed identity';
  END IF;

  replayed := evidence.bind_crisis_forecast_evidence(
    '43af47ac-19fc-7c92-ae91-0242ac120103', target_slot,
    'supports', 'verification.fx.pressure', 'increases_risk', '7.5',
    'canonical_admission', '43af47ac-19fc-7c92-ae91-0242ac120021'
  );
  IF replayed <> '43af47ac-19fc-7c92-ae91-0242ac120103' THEN
    RAISE EXCEPTION 'completed evidence-binding replay changed identity';
  END IF;

  BEGIN
    PERFORM evidence.bind_crisis_forecast_evidence(
      '43af47ac-19fc-7c92-ae91-0242ac120103', target_slot,
      'supports', 'verification.fx.pressure', 'decreases_risk', '7.5',
      'canonical_admission', '43af47ac-19fc-7c92-ae91-0242ac120021'
    );
    RAISE EXCEPTION 'changed completed evidence replay unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END
$verify_completed_child_replay$;

-- Incomplete and duplicate-slot attempts are retained as private crash
-- evidence but never cross any app read boundary.
SELECT evidence.prepare_crisis_forecast_run(
  '43af47ac-19fc-7c92-ae91-0242ac120200',
  '43af47ac-19fc-7c92-ae91-0242ac120003',
  '43af47ac-19fc-7c92-ae91-0242ac120007',
  '43af47ac-19fc-7c92-ae91-0242ac120030',
  '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z',
  repeat('e', 64), repeat('f', 64)
);
SELECT evidence.append_crisis_forecast_slot(
  (SELECT slot_id FROM crisis_verification_slots
    WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120200'
      AND hazard = 'FX' AND horizon_days = 30),
  '43af47ac-19fc-7c92-ae91-0242ac120200', 'FX', 30,
  0.6, 0.5, 0.4, 0.6, 0.95, 'verification-bootstrap',
  'calibrated', false, '43af47ac-19fc-7c92-ae91-0242ac120040',
  '2026-04-01T00:00:00Z', '2026-05-01T00:00:00Z',
  repeat('5', 64), repeat('1', 64),
  '["Verification-only model assumption."]',
  '[{"criterionId":"verification-invalidation","description":"Invalidate on regime change.","indicatorKey":"verification.regime","operator":"equals","threshold":"changed","requiredObservations":1}]',
  'No admissible supporting item in this incomplete fixture.',
  'No admissible counter-evidence item in this incomplete fixture.'
);

DO $verify_incomplete_and_duplicate_slots$
BEGIN
  BEGIN
    PERFORM evidence.append_crisis_forecast_slot(
      '43af47ac-19fc-7c92-ae91-0242ac120201',
      '43af47ac-19fc-7c92-ae91-0242ac120200', 'FX', 30,
      0.7, 0.6, 0.5, 0.7, 0.95, 'verification-bootstrap',
      'calibrated', false, '43af47ac-19fc-7c92-ae91-0242ac120040',
      '2026-04-01T00:00:00Z', '2026-05-01T00:00:00Z',
      repeat('5', 64), repeat('1', 64),
      '["Verification-only model assumption."]',
      '[{"criterionId":"verification-invalidation","description":"Invalidate on regime change.","indicatorKey":"verification.regime","operator":"equals","threshold":"changed","requiredObservations":1}]',
      'No admissible supporting item in this incomplete fixture.',
      'No admissible counter-evidence item in this incomplete fixture.'
    );
    RAISE EXCEPTION 'duplicate hazard/horizon slot unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    PERFORM * FROM evidence.complete_crisis_forecast_run(
      '43af47ac-19fc-7c92-ae91-0242ac120200',
      '43af47ac-19fc-7c92-ae91-0242ac120210'
    );
    RAISE EXCEPTION 'incomplete 32-slot run unexpectedly completed';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END
$verify_incomplete_and_duplicate_slots$;

DO $verify_slot_replay_and_provenance_leakage$
DECLARE
  fx_slot uuid;
  bank_slot uuid;
BEGIN
  SELECT slot_id INTO fx_slot FROM crisis_verification_slots
  WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120200'
    AND hazard = 'FX' AND horizon_days = 30;
  SELECT slot_id INTO bank_slot FROM crisis_verification_slots
  WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120200'
    AND hazard = 'BANK' AND horizon_days = 30;
  BEGIN
    PERFORM evidence.append_crisis_forecast_slot(
      fx_slot, '43af47ac-19fc-7c92-ae91-0242ac120200', 'FX', 30,
      0.7, 0.5, 0.4, 0.6, 0.95, 'verification-bootstrap',
      'calibrated', false, '43af47ac-19fc-7c92-ae91-0242ac120040',
      '2026-04-01T00:00:00Z', '2026-05-01T00:00:00Z',
      repeat('5', 64), repeat('1', 64),
      '["Verification-only model assumption."]',
      '[{"criterionId":"verification-invalidation","description":"Invalidate on regime change.","indicatorKey":"verification.regime","operator":"equals","threshold":"changed","requiredObservations":1}]',
      'No admissible supporting item in this incomplete fixture.',
      'No admissible counter-evidence item in this incomplete fixture.'
    );
    RAISE EXCEPTION 'changed slot replay unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    PERFORM evidence.append_crisis_forecast_slot(
      bank_slot, '43af47ac-19fc-7c92-ae91-0242ac120200', 'BANK', 30,
      0.3, 0.2, 0.1, 0.3, 0.95, 'verification-bootstrap',
      'calibrated', false, '43af47ac-19fc-7c92-ae91-0242ac120040',
      '2026-04-01T00:00:00Z', '2026-08-03T00:00:00Z',
      repeat('5', 64), repeat('1', 64),
      '["Verification-only model assumption."]',
      '[{"criterionId":"verification-invalidation","description":"Invalidate on regime change.","indicatorKey":"verification.regime","operator":"equals","threshold":"changed","requiredObservations":1}]',
      'No admissible supporting item in this incomplete fixture.',
      'No admissible counter-evidence item in this incomplete fixture.'
    );
    RAISE EXCEPTION 'post-cutoff calibration provenance unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    PERFORM evidence.append_crisis_forecast_slot(
      bank_slot, '43af47ac-19fc-7c92-ae91-0242ac120200', 'BANK', 30,
      0.3, 0.2, 0.1, 0.3, 0.95, 'verification-bootstrap',
      'calibrated', false, '43af47ac-19fc-7c92-ae91-0242ac120040',
      '2026-04-01T00:00:00Z', '2026-05-01T00:00:00Z',
      repeat('5', 64), repeat('1', 64),
      '[" untrimmed assumption "]',
      '[{"criterionId":"verification-invalidation","description":"Invalidate on regime change.","indicatorKey":"verification.regime","operator":"equals","threshold":"changed","requiredObservations":1}]',
      'No admissible supporting item in this incomplete fixture.',
      'No admissible counter-evidence item in this incomplete fixture.'
    );
    RAISE EXCEPTION 'untrimmed forecast assumption unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    PERFORM evidence.append_crisis_forecast_slot(
      bank_slot, '43af47ac-19fc-7c92-ae91-0242ac120200', 'BANK', 30,
      0.3, 0.2, 0.1, 0.3, 0.95, 'verification-bootstrap',
      'calibrated', false, '43af47ac-19fc-7c92-ae91-0242ac120040',
      '2026-04-01T00:00:00Z', '2026-05-01T00:00:00Z',
      repeat('5', 64), repeat('1', 64),
      '["Verification-only model assumption."]',
      '[{"criterionId":"duplicate","description":"First criterion.","indicatorKey":"verification.one","operator":"equals","threshold":"one","requiredObservations":1},{"criterionId":"duplicate","description":"Second criterion.","indicatorKey":"verification.two","operator":"greater_than","threshold":"2","requiredObservations":2}]',
      'No admissible supporting item in this incomplete fixture.',
      'No admissible counter-evidence item in this incomplete fixture.'
    );
    RAISE EXCEPTION 'duplicate invalidation criterion IDs unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    PERFORM evidence.append_crisis_forecast_slot(
      bank_slot, '43af47ac-19fc-7c92-ae91-0242ac120200', 'BANK', 30,
      0.3, 0.2, 0.1, 0.3, 0.95, 'verification-bootstrap',
      'calibrated', false, '43af47ac-19fc-7c92-ae91-0242ac120040',
      '2026-04-01T00:00:00Z', '2026-05-01T00:00:00Z',
      repeat('5', 64), repeat('1', 64),
      '["Verification-only model assumption."]',
      '[{"criterionId":"invalid","description":"Invalid extra field criterion.","indicatorKey":"verification.invalid","operator":"gte","threshold":"2","requiredObservations":1,"extra":true}]',
      'No admissible supporting item in this incomplete fixture.',
      'No admissible counter-evidence item in this incomplete fixture.'
    );
    RAISE EXCEPTION 'malformed invalidation criterion unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END
$verify_slot_replay_and_provenance_leakage$;

DO $create_alert_forecast_runs$
DECLARE
  runs uuid[] := ARRAY[
    '43af47ac-19fc-7c92-ae91-0242ac120301'::uuid,
    '43af47ac-19fc-7c92-ae91-0242ac120302'::uuid,
    '43af47ac-19fc-7c92-ae91-0242ac120303'::uuid,
    '43af47ac-19fc-7c92-ae91-0242ac120304'::uuid,
    '43af47ac-19fc-7c92-ae91-0242ac120305'::uuid,
    '43af47ac-19fc-7c92-ae91-0242ac120306'::uuid
  ];
  completions uuid[] := ARRAY[
    '43af47ac-19fc-7c92-ae91-0242ac120401'::uuid,
    '43af47ac-19fc-7c92-ae91-0242ac120402'::uuid,
    '43af47ac-19fc-7c92-ae91-0242ac120403'::uuid,
    '43af47ac-19fc-7c92-ae91-0242ac120404'::uuid,
    '43af47ac-19fc-7c92-ae91-0242ac120405'::uuid,
    '43af47ac-19fc-7c92-ae91-0242ac120406'::uuid
  ];
  probabilities numeric[] := ARRAY[0.95, 0.95, 0.95, 0.95, 0.10, 0.10];
  base_time timestamptz;
  target_slot uuid;
  index integer;
BEGIN
  SELECT clock.base_time INTO base_time FROM crisis_verification_clock clock;
  FOR index IN 1..6 LOOP
    PERFORM evidence.prepare_crisis_forecast_run(
      runs[index], '43af47ac-19fc-7c92-ae91-0242ac120003',
      '43af47ac-19fc-7c92-ae91-0242ac120007',
      '43af47ac-19fc-7c92-ae91-0242ac120030',
      base_time + make_interval(secs => index * 6 - 1),
      base_time + make_interval(secs => index * 6),
      repeat('e', 64), repeat('f', 64)
    );
    PERFORM pg_temp.populate_crisis_slots(
      runs[index], '43af47ac-19fc-7c92-ae91-0242ac120041',
      probabilities[index], probabilities[index],
      CASE WHEN index IN (3, 4) THEN 'uncalibrated' ELSE 'calibrated' END,
      index = 1, index >= 3
    );
    IF index >= 3 THEN
      SELECT slot_id INTO target_slot FROM crisis_verification_slots
      WHERE run_id = runs[index] AND hazard = 'FX' AND horizon_days = 30;
      PERFORM evidence.bind_crisis_forecast_evidence(
        gen_random_uuid(), target_slot, 'supports',
        'verification.alert.signal', 'increases_risk', probabilities[index]::text,
        'relationship_evidence', '43af47ac-19fc-7c92-ae91-0242ac120060'
      );
    END IF;
    PERFORM * FROM evidence.complete_crisis_forecast_run(
      runs[index], completions[index]
    );
  END LOOP;
END
$create_alert_forecast_runs$;

RESET ROLE;
SET LOCAL ROLE economyos_ingest_local;
SET LOCAL app.organization_id = '43af47ac-19fc-7c92-ae91-0242ac120002';
SET LOCAL app.subject_id = '43af47ac-19fc-7c92-ae91-0242ac120006';

SELECT evidence.prepare_crisis_forecast_run(
  '43af47ac-19fc-7c92-ae91-0242ac120500',
  '43af47ac-19fc-7c92-ae91-0242ac120004',
  '43af47ac-19fc-7c92-ae91-0242ac120008',
  '43af47ac-19fc-7c92-ae91-0242ac120031',
  '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z',
  repeat('e', 64), repeat('f', 64)
);
SELECT pg_temp.populate_crisis_slots(
  '43af47ac-19fc-7c92-ae91-0242ac120500',
  '43af47ac-19fc-7c92-ae91-0242ac120042',
  0.4, 0.3, 'calibrated', false, false
);
SELECT * FROM evidence.complete_crisis_forecast_run(
  '43af47ac-19fc-7c92-ae91-0242ac120500',
  '43af47ac-19fc-7c92-ae91-0242ac120510'
);

RESET ROLE;
SET LOCAL ROLE economyos_app_local;
SET LOCAL app.organization_id = '43af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '43af47ac-19fc-7c92-ae91-0242ac120005';

DO $verify_pointer_and_exact_slot_reads$
DECLARE
  target_slot uuid;
  bank_slot uuid;
  run_record record;
  slot_record record;
  bank_record record;
  incomplete_count integer;
  foreign_count integer;
BEGIN
  SELECT slot_id INTO target_slot FROM crisis_verification_slots
  WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120102'
    AND hazard = 'FX' AND horizon_days = 30;
  SELECT slot_id INTO bank_slot FROM crisis_verification_slots
  WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120102'
    AND hazard = 'BANK' AND horizon_days = 30;
  SELECT * INTO run_record FROM app.get_crisis_forecast_run(
    '43af47ac-19fc-7c92-ae91-0242ac120003',
    '43af47ac-19fc-7c92-ae91-0242ac120102'
  );
  SELECT * INTO slot_record FROM app.get_crisis_forecast_slot(
    '43af47ac-19fc-7c92-ae91-0242ac120003', target_slot
  );
  SELECT * INTO bank_record FROM app.get_crisis_forecast_slot(
    '43af47ac-19fc-7c92-ae91-0242ac120003', bank_slot
  );
  SELECT count(*) INTO incomplete_count FROM app.get_crisis_forecast_slot(
    '43af47ac-19fc-7c92-ae91-0242ac120003',
    (SELECT slot_id FROM crisis_verification_slots
     WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120200'
       AND hazard = 'FX' AND horizon_days = 30)
  );
  SELECT count(*) INTO foreign_count FROM app.get_crisis_forecast_slot(
    '43af47ac-19fc-7c92-ae91-0242ac120004',
    (SELECT slot_id FROM crisis_verification_slots
     WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120500'
       AND hazard = 'FX' AND horizon_days = 30)
  );
  IF run_record.run_id IS NULL OR jsonb_array_length(run_record.slot_pointers) <> 32
    OR run_record.slot_pointers @> '[{"rawProbability":"0.1"}]'::jsonb
    OR slot_record.slot_id <> target_slot
    OR slot_record.raw_probability <> '0.812345678901234567'
    OR slot_record.calibrated_probability <> '0.712345678901234567'
    OR slot_record.uncertainty_lower <> '0.612345678901234567'
    OR slot_record.uncertainty_upper <> '0.812345678901234567'
    OR slot_record.uncertainty_confidence <> '0.950000000000000000'
    OR slot_record.model_artifact_id <> '43af47ac-19fc-7c92-ae91-0242ac120040'
    OR slot_record.model_version <> '1.0.0'
    OR slot_record.model_configuration_sha256 <> repeat('5', 64)
    OR slot_record.model_code_sha256 <> repeat('1', 64)
    OR jsonb_array_length(slot_record.evidence_pointers) <> 1
    OR slot_record.evidence_pointers#>>'{0,role}' <> 'supports'
    OR slot_record.evidence_pointers#>>'{0,sourceKind}' <> 'canonical_admission'
    OR slot_record.evidence_pointers#>>'{0,sourceId}'
      <> '43af47ac-19fc-7c92-ae91-0242ac120021'
    OR slot_record.counter_evidence_absence_reason IS NULL
    OR bank_record.calibrated_probability <> '0.200000000000000000'
    OR bank_record.hazard <> 'BANK'
    OR incomplete_count <> 0 OR foreign_count <> 0
  THEN
    RAISE EXCEPTION
      'governed run/slot read leaked content, lost exact provenance, or enumerated private state';
  END IF;
END
$verify_pointer_and_exact_slot_reads$;

DO $verify_bounded_keyset_page$
DECLARE
  first_count integer;
  second_count integer;
  overlap_count integer;
  cursor_generated timestamptz;
  cursor_run uuid;
BEGIN
  SELECT count(*) INTO first_count
  FROM app.list_crisis_forecast_runs(
    '43af47ac-19fc-7c92-ae91-0242ac120003',
    '43af47ac-19fc-7c92-ae91-0242ac120007', 2, NULL, NULL
  );
  SELECT generated_at, run_id INTO cursor_generated, cursor_run
  FROM app.list_crisis_forecast_runs(
    '43af47ac-19fc-7c92-ae91-0242ac120003',
    '43af47ac-19fc-7c92-ae91-0242ac120007', 2, NULL, NULL
  ) ORDER BY generated_at DESC, run_id DESC OFFSET 1 LIMIT 1;
  SELECT count(*) INTO second_count
  FROM app.list_crisis_forecast_runs(
    '43af47ac-19fc-7c92-ae91-0242ac120003',
    '43af47ac-19fc-7c92-ae91-0242ac120007', 2,
    cursor_generated, cursor_run
  );
  SELECT count(*) INTO overlap_count
  FROM app.list_crisis_forecast_runs(
    '43af47ac-19fc-7c92-ae91-0242ac120003',
    '43af47ac-19fc-7c92-ae91-0242ac120007', 2,
    cursor_generated, cursor_run
  ) page
  WHERE page.run_id IN (
    SELECT first_page.run_id FROM app.list_crisis_forecast_runs(
      '43af47ac-19fc-7c92-ae91-0242ac120003',
      '43af47ac-19fc-7c92-ae91-0242ac120007', 2, NULL, NULL
    ) first_page
  );
  IF first_count <> 2 OR second_count <> 2 OR overlap_count <> 0 THEN
    RAISE EXCEPTION 'crisis run keyset pagination is not stable or bounded';
  END IF;
  BEGIN
    PERFORM * FROM app.list_crisis_forecast_runs(
      '43af47ac-19fc-7c92-ae91-0242ac120003',
      '43af47ac-19fc-7c92-ae91-0242ac120007', 101, NULL, NULL
    );
    RAISE EXCEPTION 'oversized crisis run page unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM * FROM app.list_crisis_forecast_runs(
      '43af47ac-19fc-7c92-ae91-0242ac120003',
      '43af47ac-19fc-7c92-ae91-0242ac120007', 10,
      cursor_generated, NULL
    );
    RAISE EXCEPTION 'partial crisis run cursor unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END
$verify_bounded_keyset_page$;

SET LOCAL app.organization_id = '43af47ac-19fc-7c92-ae91-0242ac120002';
SET LOCAL app.subject_id = '43af47ac-19fc-7c92-ae91-0242ac120006';
DO $verify_second_tenant_reads_only_itself$
DECLARE
  own_count integer;
  foreign_count integer;
BEGIN
  SELECT count(*) INTO own_count FROM app.get_crisis_forecast_run(
    '43af47ac-19fc-7c92-ae91-0242ac120004',
    '43af47ac-19fc-7c92-ae91-0242ac120500'
  );
  SELECT count(*) INTO foreign_count FROM app.get_crisis_forecast_run(
    '43af47ac-19fc-7c92-ae91-0242ac120003',
    '43af47ac-19fc-7c92-ae91-0242ac120100'
  );
  IF own_count <> 1 OR foreign_count <> 0 THEN
    RAISE EXCEPTION 'crisis forecast two-tenant non-enumeration failed';
  END IF;
END
$verify_second_tenant_reads_only_itself$;

RESET ROLE;
SET LOCAL ROLE economyos_ingest_local;
SET LOCAL app.organization_id = '43af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '43af47ac-19fc-7c92-ae91-0242ac120005';

SELECT evidence.evaluate_crisis_alert(
  '43af47ac-19fc-7c92-ae91-0242ac120711',
  '43af47ac-19fc-7c92-ae91-0242ac120700',
  (SELECT slot_id FROM crisis_verification_slots
   WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120301'
     AND hazard = 'FX' AND horizon_days = 30)
);
SELECT evidence.evaluate_crisis_alert(
  '43af47ac-19fc-7c92-ae91-0242ac120712',
  '43af47ac-19fc-7c92-ae91-0242ac120700',
  (SELECT slot_id FROM crisis_verification_slots
   WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120302'
     AND hazard = 'FX' AND horizon_days = 30)
);
SELECT evidence.evaluate_crisis_alert(
  '43af47ac-19fc-7c92-ae91-0242ac120713',
  '43af47ac-19fc-7c92-ae91-0242ac120700',
  (SELECT slot_id FROM crisis_verification_slots
   WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120303'
     AND hazard = 'FX' AND horizon_days = 30)
);
SELECT evidence.evaluate_crisis_alert(
  '43af47ac-19fc-7c92-ae91-0242ac120714',
  '43af47ac-19fc-7c92-ae91-0242ac120700',
  (SELECT slot_id FROM crisis_verification_slots
   WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120304'
     AND hazard = 'FX' AND horizon_days = 30)
);
SELECT evidence.evaluate_crisis_alert(
  '43af47ac-19fc-7c92-ae91-0242ac120715',
  '43af47ac-19fc-7c92-ae91-0242ac120700',
  (SELECT slot_id FROM crisis_verification_slots
   WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120305'
     AND hazard = 'FX' AND horizon_days = 30)
);
SELECT evidence.evaluate_crisis_alert(
  '43af47ac-19fc-7c92-ae91-0242ac120716',
  '43af47ac-19fc-7c92-ae91-0242ac120700',
  (SELECT slot_id FROM crisis_verification_slots
   WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120306'
     AND hazard = 'FX' AND horizon_days = 30)
);

DO $verify_alert_replay$
DECLARE
  replayed uuid;
BEGIN
  replayed := evidence.evaluate_crisis_alert(
    '43af47ac-19fc-7c92-ae91-0242ac120714',
    '43af47ac-19fc-7c92-ae91-0242ac120700',
    (SELECT slot_id FROM crisis_verification_slots
     WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120304'
       AND hazard = 'FX' AND horizon_days = 30)
  );
  IF replayed <> '43af47ac-19fc-7c92-ae91-0242ac120714' THEN
    RAISE EXCEPTION 'alert replay changed identity';
  END IF;
  BEGIN
    PERFORM evidence.evaluate_crisis_alert(
      '43af47ac-19fc-7c92-ae91-0242ac120717',
      '43af47ac-19fc-7c92-ae91-0242ac120700',
      (SELECT slot_id FROM crisis_verification_slots
       WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120304'
         AND hazard = 'FX' AND horizon_days = 30)
    );
    RAISE EXCEPTION 'duplicate policy/slot alert unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END
$verify_alert_replay$;

SELECT evidence.create_crisis_backtest(
  '43af47ac-19fc-7c92-ae91-0242ac120600',
  '43af47ac-19fc-7c92-ae91-0242ac120003',
  'FX', 'expanding_window', '43af47ac-19fc-7c92-ae91-0242ac120040'
);
SELECT evidence.append_crisis_backtest_fold(
  '43af47ac-19fc-7c92-ae91-0242ac120601',
  '43af47ac-19fc-7c92-ae91-0242ac120600', 1, 'fold-1',
  '2025-01-01T00:00:00Z', '2025-12-31T00:00:00Z',
  '2026-01-01T00:00:00Z', '2026-04-30T00:00:00Z',
  '2026-05-01T00:00:00Z', '2026-08-01T00:00:00Z',
  '2025-12-31T00:00:00Z', '2025-12-31T00:00:00Z',
  '2026-04-30T00:00:00Z', '2025-12-31T00:00:00Z',
  '2026-04-30T00:00:00Z'
);

DO $verify_backtest_chronology$
BEGIN
  BEGIN
    PERFORM evidence.append_crisis_backtest_fold(
      '43af47ac-19fc-7c92-ae91-0242ac120602',
      '43af47ac-19fc-7c92-ae91-0242ac120600', 2, 'fold-overlap',
      '2025-01-01T00:00:00Z', '2026-01-31T00:00:00Z',
      '2026-02-01T00:00:00Z', '2026-05-31T00:00:00Z',
      '2026-07-01T00:00:00Z', '2026-09-01T00:00:00Z',
      '2026-01-31T00:00:00Z', '2026-01-31T00:00:00Z',
      '2026-05-31T00:00:00Z', '2026-01-31T00:00:00Z',
      '2026-05-31T00:00:00Z'
    );
    RAISE EXCEPTION 'overlapping chronological test fold unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END
$verify_backtest_chronology$;

SELECT evidence.record_crisis_forecast_outcome(
  '43af47ac-19fc-7c92-ae91-0242ac120603',
  '43af47ac-19fc-7c92-ae91-0242ac120051',
  '43af47ac-19fc-7c92-ae91-0242ac120052',
  '43af47ac-19fc-7c92-ae91-0242ac120007',
  '2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z', true,
  '2026-06-15T00:00:00Z', '2026-07-02T00:00:00Z', repeat('d', 64)
);

DO $verify_score_observability$
DECLARE
  target_slot uuid;
BEGIN
  SELECT slot_id INTO target_slot FROM crisis_verification_slots
  WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120100'
    AND hazard = 'FX' AND horizon_days = 30;
  BEGIN
    PERFORM evidence.score_crisis_forecast_outcome(
      '43af47ac-19fc-7c92-ae91-0242ac120604', target_slot,
      '43af47ac-19fc-7c92-ae91-0242ac120603',
      '43af47ac-19fc-7c92-ae91-0242ac120601',
      0.7, 0.000001, '2026-06-30T00:00:00Z'
    );
    RAISE EXCEPTION 'pre-horizon outcome score unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END
$verify_score_observability$;

SELECT evidence.score_crisis_forecast_outcome(
  '43af47ac-19fc-7c92-ae91-0242ac120605',
  (SELECT slot_id FROM crisis_verification_slots
   WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120100'
     AND hazard = 'FX' AND horizon_days = 30),
  '43af47ac-19fc-7c92-ae91-0242ac120603',
  '43af47ac-19fc-7c92-ae91-0242ac120601',
  0.7, 0.000001, '2026-07-02T00:00:00Z'
);

RESET ROLE;
DO $verify_alert_scores_and_independence$
DECLARE
  gate_ood record;
  gate_evidence record;
  entry_one record;
  entered record;
  exit_one record;
  exited record;
  score record;
  aggregate_column_count integer;
  target_slot uuid;
BEGIN
  SELECT * INTO gate_ood FROM evidence.crisis_alert_events
    WHERE id = '43af47ac-19fc-7c92-ae91-0242ac120711';
  SELECT * INTO gate_evidence FROM evidence.crisis_alert_events
    WHERE id = '43af47ac-19fc-7c92-ae91-0242ac120712';
  SELECT * INTO entry_one FROM evidence.crisis_alert_events
    WHERE id = '43af47ac-19fc-7c92-ae91-0242ac120713';
  SELECT * INTO entered FROM evidence.crisis_alert_events
    WHERE id = '43af47ac-19fc-7c92-ae91-0242ac120714';
  SELECT * INTO exit_one FROM evidence.crisis_alert_events
    WHERE id = '43af47ac-19fc-7c92-ae91-0242ac120715';
  SELECT * INTO exited FROM evidence.crisis_alert_events
    WHERE id = '43af47ac-19fc-7c92-ae91-0242ac120716';
  SELECT * INTO score FROM evidence.crisis_forecast_scores
    WHERE id = '43af47ac-19fc-7c92-ae91-0242ac120605';
  IF gate_ood.state <> 'suppressed' OR gate_ood.gate_reason <> 'out_of_domain'
    OR gate_evidence.state <> 'suppressed'
    OR gate_evidence.gate_reason <> 'insufficient_evidence'
    OR entry_one.state <> 'inactive' OR entry_one.entry_streak <> 1
    OR entered.state <> 'active' OR entered.transition <> 'entered'
    OR entered.severity <> 'warning'
    OR entered.gate_reason <> 'uncalibrated_severity_ceiling'
    OR exit_one.state <> 'active' OR exit_one.exit_streak <> 1
    OR exited.state <> 'inactive' OR exited.transition <> 'exited'
  THEN
    RAISE EXCEPTION 'alert calibration/OOD/evidence/hysteresis gates are not reproducible';
  END IF;
  IF score.probability_used <> 0.712345678901234567
    OR score.brier_score <> power(0.712345678901234567::numeric - 1, 2)
    OR NOT score.predicted_positive OR NOT score.direction_accurate
    OR score.false_positive OR score.false_negative
    OR score.lead_time_seconds <> 1123200
  THEN
    RAISE EXCEPTION 'chronological outcome score was not derived from exact calibrated probability';
  END IF;
  SELECT count(*) INTO aggregate_column_count
  FROM information_schema.columns
  WHERE table_schema = 'evidence'
    AND table_name LIKE 'crisis_%'
    AND column_name IN (
      'crisis_score', 'crisis_probability', 'aggregate_score',
      'aggregate_probability', 'overall_crisis_score', 'overall_crisis_probability'
    );
  IF aggregate_column_count <> 0 THEN
    RAISE EXCEPTION 'aggregate crisis probability/score exists in persistence schema';
  END IF;
  IF EXISTS (
    SELECT 1 FROM evidence.crisis_forecast_run_completions completion
    WHERE completion.slot_count <> 32
      OR jsonb_array_length(completion.slot_manifest_set) <> 32
  ) THEN
    RAISE EXCEPTION 'completed crisis run lacks the exact 32-slot commitment';
  END IF;
  SELECT slot_id INTO target_slot FROM crisis_verification_slots
  WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120100'
    AND hazard = 'FX' AND horizon_days = 30;
  IF NOT EXISTS (
    SELECT 1 FROM evidence.crisis_forecast_slots fx
    JOIN evidence.crisis_forecast_slots bank
      ON bank.organization_id = fx.organization_id
      AND bank.workspace_id = fx.workspace_id
      AND bank.run_id = fx.run_id
      AND bank.hazard = 'BANK' AND bank.horizon_days = fx.horizon_days
    WHERE fx.id = target_slot AND fx.hazard = 'FX'
      AND fx.calibrated_probability <> bank.calibrated_probability
  ) THEN
    RAISE EXCEPTION 'independent hazard probabilities were collapsed';
  END IF;
END
$verify_alert_scores_and_independence$;

DO $verify_digest_and_append_only_guards$
DECLARE
  target_slot uuid;
BEGIN
  SELECT slot_id INTO target_slot FROM crisis_verification_slots
  WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120100'
    AND hazard = 'FX' AND horizon_days = 30;
  BEGIN
    INSERT INTO evidence.crisis_forecast_slots
    SELECT
      '43af47ac-19fc-7c92-ae91-0242ac120190'::uuid,
      organization_id, workspace_id, run_id, hazard, horizon_days,
      raw_probability, calibrated_probability, uncertainty_lower,
      uncertainty_upper, uncertainty_confidence, uncertainty_method,
      calibration_status, out_of_domain, model_artifact_id,
      model_artifact_sha256, model_version, training_data_cutoff,
      calibrated_through, model_configuration_sha256, model_code_sha256,
      assumptions, invalidation_criteria, evidence_absence_reason,
      counter_evidence_absence_reason, created_at, slot_manifest, slot_sha256
    FROM evidence.crisis_forecast_slots WHERE id = target_slot;
    RAISE EXCEPTION 'slot manifest/digest tamper unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    UPDATE evidence.crisis_forecast_slots
    SET calibrated_probability = 0.1 WHERE id = target_slot;
    RAISE EXCEPTION 'append-only forecast slot update unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    DELETE FROM evidence.crisis_alert_events
    WHERE id = '43af47ac-19fc-7c92-ae91-0242ac120714';
    RAISE EXCEPTION 'append-only alert deletion unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END
$verify_digest_and_append_only_guards$;

SET LOCAL ROLE economyos_app_local;
SET LOCAL app.organization_id = '43af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '43af47ac-19fc-7c92-ae91-0242ac120005';

DO $verify_postmortem_linkage$
DECLARE
  target_slot uuid;
BEGIN
  SELECT slot_id INTO target_slot FROM crisis_verification_slots
  WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120100'
    AND hazard = 'FX' AND horizon_days = 30;
  BEGIN
    PERFORM evidence.record_crisis_postmortem(
      '43af47ac-19fc-7c92-ae91-0242ac120606', target_slot,
      '43af47ac-19fc-7c92-ae91-0242ac120603',
      '43af47ac-19fc-7c92-ae91-0242ac120714',
      '43af47ac-19fc-7c92-ae91-0242ac120052',
      '{"summary":"Wrong alert linkage verification."}',
      '["Verification lesson."]', '[]', '2026-07-03T00:00:00Z'
    );
    RAISE EXCEPTION 'postmortem accepted an alert from another forecast slot';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  PERFORM evidence.record_crisis_postmortem(
    '43af47ac-19fc-7c92-ae91-0242ac120607', target_slot,
    '43af47ac-19fc-7c92-ae91-0242ac120603', NULL,
    '43af47ac-19fc-7c92-ae91-0242ac120052',
    '{"summary":"Verification postmortem with exact forecast and outcome pointers."}',
    '["Retain strict point-in-time evidence gates."]',
    '[{"owner":"verification","action":"keep leakage sentinels"}]',
    '2026-07-03T00:00:00Z'
  );
END
$verify_postmortem_linkage$;

RESET ROLE;
DO $verify_postmortem_immutable$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM evidence.crisis_postmortems postmortem
    JOIN evidence.crisis_forecast_outcomes outcome
      ON outcome.organization_id = postmortem.organization_id
      AND outcome.workspace_id = postmortem.workspace_id
      AND outcome.id = postmortem.outcome_id
    WHERE postmortem.id = '43af47ac-19fc-7c92-ae91-0242ac120607'
      AND outcome.episode_declaration_id = postmortem.episode_declaration_id
  ) THEN
    RAISE EXCEPTION 'postmortem lost its exact outcome/episode linkage';
  END IF;
  BEGIN
    UPDATE evidence.crisis_postmortems SET analysis = '{"tampered":true}'
    WHERE id = '43af47ac-19fc-7c92-ae91-0242ac120607';
    RAISE EXCEPTION 'append-only postmortem update unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END
$verify_postmortem_immutable$;

SET LOCAL ROLE economyos_app_local;
SET LOCAL app.organization_id = '43af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '43af47ac-19fc-7c92-ae91-0242ac120005';

DO $verify_lifecycle_visible_before_restriction$
DECLARE
  alert_slot uuid;
  before_count integer;
BEGIN
  SELECT slot_id INTO alert_slot FROM crisis_verification_slots
  WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120304'
    AND hazard = 'FX' AND horizon_days = 30;
  SELECT count(*) INTO before_count FROM app.get_crisis_forecast_slot(
    '43af47ac-19fc-7c92-ae91-0242ac120003', alert_slot
  );
  IF before_count <> 1 THEN
    RAISE EXCEPTION 'servable alert slot was absent before lifecycle restriction';
  END IF;
END
$verify_lifecycle_visible_before_restriction$;

SELECT evidence.record_economic_state_model_lifecycle_event(
  '43af47ac-19fc-7c92-ae91-0242ac120041', 'restricted', true,
  'Emergency verification restriction for crisis serving.',
  repeat('e', 64), statement_timestamp()
);

DO $verify_lifecycle_hidden_after_restriction$
DECLARE
  alert_slot uuid;
  after_count integer;
BEGIN
  SELECT slot_id INTO alert_slot FROM crisis_verification_slots
  WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120304'
    AND hazard = 'FX' AND horizon_days = 30;
  SELECT count(*) INTO after_count FROM app.get_crisis_forecast_slot(
    '43af47ac-19fc-7c92-ae91-0242ac120003', alert_slot
  );
  IF after_count <> 0 THEN
    RAISE EXCEPTION 'current model lifecycle restriction did not fail closed';
  END IF;
END
$verify_lifecycle_hidden_after_restriction$;

RESET ROLE;
SET LOCAL ROLE economyos_ingest_local;
SET LOCAL app.organization_id = '43af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '43af47ac-19fc-7c92-ae91-0242ac120005';
DO $verify_alert_replay_survives_restriction$
DECLARE
  replayed uuid;
BEGIN
  replayed := evidence.evaluate_crisis_alert(
    '43af47ac-19fc-7c92-ae91-0242ac120714',
    '43af47ac-19fc-7c92-ae91-0242ac120700',
    (SELECT slot_id FROM crisis_verification_slots
     WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120304'
       AND hazard = 'FX' AND horizon_days = 30)
  );
  IF replayed <> '43af47ac-19fc-7c92-ae91-0242ac120714' THEN
    RAISE EXCEPTION 'durable alert replay changed after lifecycle restriction';
  END IF;
END
$verify_alert_replay_survives_restriction$;

RESET ROLE;
INSERT INTO evidence.source_admission_events (
  id, organization_id, source_id, dataset_id, decision, permitted_actions,
  license_review_id, reason, decided_by, decided_at, recorded_at
) VALUES (
  '43af47ac-19fc-7c92-ae91-0242ac120022',
  '43af47ac-19fc-7c92-ae91-0242ac120001',
  '43af47ac-19fc-7c92-ae91-0242ac120011',
  '43af47ac-19fc-7c92-ae91-0242ac120012',
  'suspended', ARRAY[]::text[],
  '43af47ac-19fc-7c92-ae91-0242ac120010',
  'Verification current legal suspension.', 'database verification',
  clock_timestamp(), clock_timestamp()
);

SET LOCAL ROLE economyos_app_local;
SET LOCAL app.organization_id = '43af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '43af47ac-19fc-7c92-ae91-0242ac120005';
DO $verify_current_legal_fail_closed$
DECLARE
  target_slot uuid;
  slot_count integer;
  run_count integer;
BEGIN
  SELECT slot_id INTO target_slot FROM crisis_verification_slots
  WHERE run_id = '43af47ac-19fc-7c92-ae91-0242ac120102'
    AND hazard = 'FX' AND horizon_days = 30;
  SELECT count(*) INTO slot_count FROM app.get_crisis_forecast_slot(
    '43af47ac-19fc-7c92-ae91-0242ac120003', target_slot
  );
  SELECT count(*) INTO run_count FROM app.get_crisis_forecast_run(
    '43af47ac-19fc-7c92-ae91-0242ac120003',
    '43af47ac-19fc-7c92-ae91-0242ac120102'
  );
  IF slot_count <> 0 OR run_count <> 0 THEN
    RAISE EXCEPTION 'current legal suspension did not hide derived crisis output';
  END IF;
END
$verify_current_legal_fail_closed$;

RESET ROLE;
ROLLBACK;
