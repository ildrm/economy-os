BEGIN;

INSERT INTO app.organizations (id, slug, name) VALUES
  ('068f47ac-19fc-7c92-ae91-0242ac120001', 'state-fixture-a', 'State fixture A'),
  ('068f47ac-19fc-7c92-ae91-0242ac120002', 'state-fixture-b', 'State fixture B');
INSERT INTO app.workspaces (id, organization_id, slug, name) VALUES
  (
    '068f47ac-19fc-7c92-ae91-0242ac120003',
    '068f47ac-19fc-7c92-ae91-0242ac120001', 'analysis', 'Analysis A'
  ),
  (
    '068f47ac-19fc-7c92-ae91-0242ac120004',
    '068f47ac-19fc-7c92-ae91-0242ac120002', 'analysis', 'Analysis B'
  ),
  (
    '068f47ac-19fc-7c92-ae91-0242ac120030',
    '068f47ac-19fc-7c92-ae91-0242ac120001', 'restricted', 'Restricted sibling'
  );
INSERT INTO app.subjects (id, issuer, external_subject, kind) VALUES
  (
    '068f47ac-19fc-7c92-ae91-0242ac120005',
    'https://identity.economyos.test/', 'economic-state-verifier', 'service'
  ),
  (
    '068f47ac-19fc-7c92-ae91-0242ac120046',
    'https://identity.economyos.test/', 'forged-state-attribution', 'service'
  );
INSERT INTO app.organization_memberships (organization_id, subject_id, role, valid_from) VALUES
  (
    '068f47ac-19fc-7c92-ae91-0242ac120001',
    '068f47ac-19fc-7c92-ae91-0242ac120005', 'analyst', '2026-01-01T00:00:00Z'
  ),
  (
    '068f47ac-19fc-7c92-ae91-0242ac120002',
    '068f47ac-19fc-7c92-ae91-0242ac120005', 'analyst', '2026-01-01T00:00:00Z'
  );
INSERT INTO app.workspace_memberships (
  organization_id, workspace_id, subject_id, role, valid_from
) VALUES
  (
    '068f47ac-19fc-7c92-ae91-0242ac120001',
    '068f47ac-19fc-7c92-ae91-0242ac120003',
    '068f47ac-19fc-7c92-ae91-0242ac120005', 'analyst', '2026-01-01T00:00:00Z'
  ),
  (
    '068f47ac-19fc-7c92-ae91-0242ac120002',
    '068f47ac-19fc-7c92-ae91-0242ac120004',
    '068f47ac-19fc-7c92-ae91-0242ac120005', 'analyst', '2026-01-01T00:00:00Z'
  );

SET LOCAL app.subject_id = '068f47ac-19fc-7c92-ae91-0242ac120005';

INSERT INTO evidence.concepts (
  id, canonical_key, name, definition, measurement_class, ontology_version
) VALUES (
  '068f47ac-19fc-7c92-ae91-0242ac120006',
  'economy.labor.unemployment.rate', 'Unemployment rate',
  'Share of the labor force without work and seeking employment.',
  'direct', 'economyos-1'
);
INSERT INTO evidence.series (
  id, dataset_id, concept_id, geography_id, external_series_key, unit_code,
  frequency, seasonal_adjustment, data_class
) VALUES (
  '068f47ac-19fc-7c92-ae91-0242ac120044',
  '038f47ac-19fc-7c92-ae91-0242ac120003',
  '068f47ac-19fc-7c92-ae91-0242ac120006',
  '038f47ac-19fc-7c92-ae91-0242ac120005',
  'SL.UEM.TOTL.ZS:USA:state-verification', 'percent', 'annual', 'unadjusted', 'observed'
);

INSERT INTO evidence.raw_payloads (
  id, dataset_id, request_uri, object_uri, media_type, checksum_sha256,
  byte_length, fetched_at, parser_name, parser_version, recorded_at
) VALUES (
  '068f47ac-19fc-7c92-ae91-0242ac120008',
  '038f47ac-19fc-7c92-ae91-0242ac120003',
  'https://api.worldbank.org/v2/economic-state-verification',
  's3://verification-only/economic-state.json', 'application/json', repeat('6', 64),
  2, '2026-02-01T00:00:00Z', 'economic-state-verifier', '1.0.0',
  '2026-02-01T00:00:01Z'
);
INSERT INTO evidence.transformation_runs (
  id, dataset_id, raw_payload_id, parser_name, parser_version,
  code_sha256, configuration, configuration_sha256, status,
  started_at, completed_at, workflow_id
) VALUES (
  '068f47ac-19fc-7c92-ae91-0242ac120009',
  '038f47ac-19fc-7c92-ae91-0242ac120003',
  '068f47ac-19fc-7c92-ae91-0242ac120008',
  'economic-state-verifier', '1.0.0', repeat('7', 64), '{}'::jsonb,
  encode(digest(convert_to(evidence.canonical_json('{}'::jsonb), 'UTF8'), 'sha256'), 'hex'),
  'succeeded', '2026-02-01T00:00:00Z', '2026-02-01T00:00:01Z',
  'verify-economic-state'
);
INSERT INTO evidence.quality_results (
  organization_id, dataset_id, raw_payload_id, transformation_run_id,
  check_code, status, details, checked_at
) VALUES
  (
    NULL, '038f47ac-19fc-7c92-ae91-0242ac120003',
    '068f47ac-19fc-7c92-ae91-0242ac120008',
    '068f47ac-19fc-7c92-ae91-0242ac120009',
    'fixture_weighted', 'pass', '{"fixture":true,"weight":1}', '2026-02-01T00:00:01Z'
  ),
  (
    NULL, '038f47ac-19fc-7c92-ae91-0242ac120003',
    '068f47ac-19fc-7c92-ae91-0242ac120008',
    '068f47ac-19fc-7c92-ae91-0242ac120009',
    'admission', 'pass', '{"score":1,"weight":0}', '2026-02-01T00:00:01Z'
  );
INSERT INTO evidence.releases (
  id, dataset_id, raw_payload_id, external_release_key, release_time,
  source_publication_time, original_release_time, availability_time, revision_time,
  pit_quality, revision_sequence, recorded_at
) VALUES (
  '068f47ac-19fc-7c92-ae91-0242ac120010',
  '038f47ac-19fc-7c92-ae91-0242ac120003',
  '068f47ac-19fc-7c92-ae91-0242ac120008',
  'economic-state-2025', '2026-02-01T00:00:00Z',
  '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z',
  '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z',
  'true_vintage', 0, '2026-02-01T00:00:01Z'
);
INSERT INTO evidence.observations (
  id, series_id, release_id, period_start, period_end, value_numeric,
  status, parser_version, recorded_at, transformation_run_id
) VALUES (
  '068f47ac-19fc-7c92-ae91-0242ac120011',
  '038f47ac-19fc-7c92-ae91-0242ac120007',
  '068f47ac-19fc-7c92-ae91-0242ac120010',
  '2025-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 75,
  'final', '1.0.0', '2026-02-01T00:00:01Z',
  '068f47ac-19fc-7c92-ae91-0242ac120009'
);

WITH candidate AS (
  SELECT
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
  WHERE observation.id = '068f47ac-19fc-7c92-ae91-0242ac120011'
)
INSERT INTO evidence.canonical_admissions (
  observation_id, transformation_run_id, release_id, basis,
  admission_manifest, admission_sha256, admitted_at
)
SELECT
  observation_id, transformation_run_id, release_id, 'legacy_verified_v1', manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  completed_at
FROM candidate;

WITH snapshots(id, organization_id, workspace_id, known_at, manifest) AS (VALUES
  (
    '068f47ac-19fc-7c92-ae91-0242ac120012'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120001'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120003'::uuid,
    '2026-03-01T00:00:00Z'::timestamptz,
    '{"knownAt":"2026-03-01T00:00:00Z","observationIds":["068f47ac-19fc-7c92-ae91-0242ac120011"],"policy":"true_vintage"}'::jsonb
  ),
  (
    '068f47ac-19fc-7c92-ae91-0242ac120013'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120002'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120004'::uuid,
    '2025-01-01T00:00:00Z'::timestamptz,
    '{"knownAt":"2025-01-01T00:00:00Z","observationIds":[],"policy":"true_vintage"}'::jsonb
  )
)
INSERT INTO evidence.dataset_snapshots (
  id, organization_id, workspace_id, known_at, policy,
  manifest, manifest_sha256, created_by
)
SELECT
  id, organization_id, workspace_id, known_at, 'true_vintage',
  manifest,
  encode(digest(convert_to(manifest::text, 'UTF8'), 'sha256'), 'hex'),
  '068f47ac-19fc-7c92-ae91-0242ac120005'
FROM snapshots;

WITH definitions(
  id, organization_id, workspace_id, artifact_key, code, lockfile, sbom,
  environment, configuration, normalization, assumptions, approval
) AS (VALUES
  (
    '068f47ac-19fc-7c92-ae91-0242ac120040'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120001'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120003'::uuid,
    'economic-state.baseline', repeat('1',64), repeat('2',64), repeat('3',64),
    repeat('4',64), repeat('5',64), repeat('6',64), repeat('7',64), repeat('8',64)
  ),
  (
    '068f47ac-19fc-7c92-ae91-0242ac120041'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120002'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120004'::uuid,
    'economic-state.baseline', repeat('1',64), repeat('2',64), repeat('3',64),
    repeat('4',64), repeat('5',64), repeat('6',64), repeat('7',64), repeat('8',64)
  ),
  (
    '068f47ac-19fc-7c92-ae91-0242ac120042'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120001'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120030'::uuid,
    'economic-state.baseline', repeat('1',64), repeat('2',64), repeat('3',64),
    repeat('4',64), repeat('5',64), repeat('6',64), repeat('7',64), repeat('8',64)
  )
), manifests AS (
  SELECT definitions.*, jsonb_build_object(
    'schemaVersion', 1,
    'id', id::text,
    'key', artifact_key,
    'version', '1.0.0',
    'lifecycleStatus', 'research',
    'algorithm', jsonb_build_object(
      'key', 'weighted_bounded_composite', 'version', '1.0.0'
    ),
    'codeCommitSha256', code,
    'packageLockSha256', lockfile,
    'sbomSha256', sbom,
    'environmentSha256', environment,
    'configurationSha256', configuration,
    'normalizationSha256', normalization,
    'assumptionsSha256', assumptions,
    'approvalSha256', approval
  ) AS manifest
  FROM definitions
)
INSERT INTO evidence.economic_state_model_artifacts (
  id, organization_id, workspace_id, artifact_key, artifact_version,
  lifecycle_status, algorithm_key, algorithm_version, code_commit_sha256,
  package_lock_sha256, sbom_sha256, environment_sha256, configuration_sha256,
  normalization_sha256, assumptions_sha256, approval_sha256,
  artifact_manifest, artifact_sha256, created_by
)
SELECT
  id, organization_id, workspace_id, artifact_key, '1.0.0', 'research',
  'weighted_bounded_composite', '1.0.0', code, lockfile, sbom, environment,
  configuration, normalization, assumptions, approval, manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  '068f47ac-19fc-7c92-ae91-0242ac120005'
FROM manifests;

WITH parameters AS (
  SELECT
    artifact.id AS artifact_id,
    artifact.artifact_sha256,
    encode(digest(convert_to(evidence.canonical_json('{}'::jsonb), 'UTF8'), 'sha256'), 'hex')
      AS parser_configuration_sha256,
    encode(digest(convert_to(evidence.canonical_json(
      evidence.economic_state_feature_contract(
        '038f47ac-19fc-7c92-ae91-0242ac120007',
        'economic-state-verifier', '1.0.0', repeat('7',64),
        encode(digest(convert_to(evidence.canonical_json('{}'::jsonb), 'UTF8'), 'sha256'), 'hex')
      )
    ), 'UTF8'), 'sha256'), 'hex') AS gdp_feature_sha256,
    encode(digest(convert_to(evidence.canonical_json(
      evidence.economic_state_feature_contract(
        '068f47ac-19fc-7c92-ae91-0242ac120044',
        'economic-state-verifier', '1.0.0', repeat('7',64),
        encode(digest(convert_to(evidence.canonical_json('{}'::jsonb), 'UTF8'), 'sha256'), 'hex')
      )
    ), 'UTF8'), 'sha256'), 'hex') AS unemployment_feature_sha256
  FROM evidence.economic_state_model_artifacts artifact
  WHERE artifact.id = '068f47ac-19fc-7c92-ae91-0242ac120040'
), definition AS (
  SELECT parameters.*, jsonb_build_object(
    'schemaVersion', 2,
    'id', '068f47ac-19fc-7c92-ae91-0242ac120014',
    'key', 'macroeconomic.output-labor',
    'version', '1.0.0',
    'dimension', 'macroeconomic',
    'minimumCoverage', '0.5',
    'artifact', jsonb_build_object(
      'id', artifact_id::text,
      'sha256', artifact_sha256,
      'algorithmKey', 'weighted_bounded_composite',
      'algorithmVersion', '1.0.0',
      'configurationSha256', repeat('5',64),
      'normalizationSha256', repeat('6',64),
      'assumptionsSha256', repeat('7',64),
      'approvalSha256', repeat('8',64),
      'lifecycleStatus', 'research'
    ),
    'components', jsonb_build_array(
      jsonb_build_object(
        'key', 'gdp',
        'conceptId', '038f47ac-19fc-7c92-ae91-0242ac120006',
        'seriesId', '038f47ac-19fc-7c92-ae91-0242ac120007',
        'unitCode', 'USD', 'frequency', 'annual', 'seasonalAdjustment', 'unadjusted',
        'parser', jsonb_build_object(
          'name', 'economic-state-verifier', 'version', '1.0.0',
          'codeSha256', repeat('7',64),
          'configurationSha256', parser_configuration_sha256
        ),
        'featureContractSha256', gdp_feature_sha256,
        'weight', '0.6', 'polarity', 'positive', 'lowerBound', '0', 'upperBound', '100'
      ),
      jsonb_build_object(
        'key', 'unemployment',
        'conceptId', '068f47ac-19fc-7c92-ae91-0242ac120006',
        'seriesId', '068f47ac-19fc-7c92-ae91-0242ac120044',
        'unitCode', 'percent', 'frequency', 'annual', 'seasonalAdjustment', 'unadjusted',
        'parser', jsonb_build_object(
          'name', 'economic-state-verifier', 'version', '1.0.0',
          'codeSha256', repeat('7',64),
          'configurationSha256', parser_configuration_sha256
        ),
        'featureContractSha256', unemployment_feature_sha256,
        'weight', '0.4', 'polarity', 'negative', 'lowerBound', '0', 'upperBound', '100'
      )
    )
  ) AS manifest
  FROM parameters
)
INSERT INTO evidence.economic_state_models (
  id, organization_id, workspace_id, model_key, model_version, dimension,
  minimum_coverage, definition_manifest, definition_sha256,
  model_artifact_id, model_artifact_sha256, created_by
)
SELECT
  '068f47ac-19fc-7c92-ae91-0242ac120014',
  '068f47ac-19fc-7c92-ae91-0242ac120001',
  '068f47ac-19fc-7c92-ae91-0242ac120003',
  'macroeconomic.output-labor', '1.0.0', 'macroeconomic', '0.5', manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  artifact_id, artifact_sha256, '068f47ac-19fc-7c92-ae91-0242ac120005'
FROM definition;

WITH configuration AS (
  SELECT encode(digest(
    convert_to(evidence.canonical_json('{}'::jsonb), 'UTF8'), 'sha256'
  ), 'hex') AS sha256
)
INSERT INTO evidence.economic_state_model_components (
  organization_id, workspace_id, model_id, component_key, concept_id,
  series_id, unit_code, frequency, seasonal_adjustment,
  parser_name, parser_version, parser_code_sha256, parser_configuration_sha256,
  feature_contract_sha256, weight, polarity, lower_bound, upper_bound
)
SELECT
  '068f47ac-19fc-7c92-ae91-0242ac120001',
  '068f47ac-19fc-7c92-ae91-0242ac120003',
  '068f47ac-19fc-7c92-ae91-0242ac120014', component_key, concept_id,
  series_id, unit_code, frequency, seasonal_adjustment,
  'economic-state-verifier', '1.0.0', repeat('7',64), configuration.sha256,
  encode(digest(convert_to(evidence.canonical_json(
    evidence.economic_state_feature_contract(
      series_id, 'economic-state-verifier', '1.0.0', repeat('7',64), configuration.sha256
    )
  ), 'UTF8'), 'sha256'), 'hex'),
  weight, polarity, '0', '100'
FROM configuration
CROSS JOIN (VALUES
  (
    'gdp', '038f47ac-19fc-7c92-ae91-0242ac120006'::uuid,
    '038f47ac-19fc-7c92-ae91-0242ac120007'::uuid,
    'USD', 'annual', 'unadjusted', '0.6', 'positive'
  ),
  (
    'unemployment', '068f47ac-19fc-7c92-ae91-0242ac120006'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120044'::uuid,
    'percent', 'annual', 'unadjusted', '0.4', 'negative'
  )
) component(component_key, concept_id, series_id, unit_code, frequency,
  seasonal_adjustment, weight, polarity);

-- Tenant B and an inaccessible sibling workspace get valid one-component
-- models so direct table RLS can be challenged independently of API filters.
WITH targets(organization_id, workspace_id, artifact_id, model_id, model_key) AS (VALUES
  (
    '068f47ac-19fc-7c92-ae91-0242ac120002'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120004'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120041'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120015'::uuid,
    'macroeconomic.output-only-b'
  ),
  (
    '068f47ac-19fc-7c92-ae91-0242ac120001'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120030'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120042'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120043'::uuid,
    'macroeconomic.restricted-sibling'
  )
), prepared AS (
  SELECT
    targets.*,
    artifact.artifact_sha256,
    encode(digest(convert_to(evidence.canonical_json('{}'::jsonb), 'UTF8'), 'sha256'), 'hex')
      AS parser_configuration_sha256
  FROM targets
  JOIN evidence.economic_state_model_artifacts artifact ON artifact.id = targets.artifact_id
), with_feature AS (
  SELECT prepared.*,
    encode(digest(convert_to(evidence.canonical_json(
      evidence.economic_state_feature_contract(
        '038f47ac-19fc-7c92-ae91-0242ac120007',
        'economic-state-verifier', '1.0.0', repeat('7',64), parser_configuration_sha256
      )
    ), 'UTF8'), 'sha256'), 'hex') AS feature_sha256
  FROM prepared
), definitions AS (
  SELECT with_feature.*, jsonb_build_object(
    'schemaVersion', 2, 'id', model_id::text, 'key', model_key, 'version', '1.0.0',
    'dimension', 'macroeconomic', 'minimumCoverage', '1',
    'artifact', jsonb_build_object(
      'id', artifact_id::text, 'sha256', artifact_sha256,
      'algorithmKey', 'weighted_bounded_composite', 'algorithmVersion', '1.0.0',
      'configurationSha256', repeat('5',64), 'normalizationSha256', repeat('6',64),
      'assumptionsSha256', repeat('7',64), 'approvalSha256', repeat('8',64),
      'lifecycleStatus', 'research'
    ),
    'components', jsonb_build_array(jsonb_build_object(
      'key', 'gdp', 'conceptId', '038f47ac-19fc-7c92-ae91-0242ac120006',
      'seriesId', '038f47ac-19fc-7c92-ae91-0242ac120007',
      'unitCode', 'USD', 'frequency', 'annual', 'seasonalAdjustment', 'unadjusted',
      'parser', jsonb_build_object(
        'name', 'economic-state-verifier', 'version', '1.0.0',
        'codeSha256', repeat('7',64),
        'configurationSha256', parser_configuration_sha256
      ),
      'featureContractSha256', feature_sha256,
      'weight', '1', 'polarity', 'positive', 'lowerBound', '0', 'upperBound', '100'
    ))
  ) AS manifest
  FROM with_feature
)
INSERT INTO evidence.economic_state_models (
  id, organization_id, workspace_id, model_key, model_version, dimension,
  minimum_coverage, definition_manifest, definition_sha256,
  model_artifact_id, model_artifact_sha256, created_by
)
SELECT
  model_id, organization_id, workspace_id, model_key, '1.0.0', 'macroeconomic', '1',
  manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  artifact_id, artifact_sha256, '068f47ac-19fc-7c92-ae91-0242ac120005'
FROM definitions;

WITH targets(organization_id, workspace_id, model_id) AS (VALUES
  (
    '068f47ac-19fc-7c92-ae91-0242ac120002'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120004'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120015'::uuid
  ),
  (
    '068f47ac-19fc-7c92-ae91-0242ac120001'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120030'::uuid,
    '068f47ac-19fc-7c92-ae91-0242ac120043'::uuid
  )
), configuration AS (
  SELECT encode(digest(
    convert_to(evidence.canonical_json('{}'::jsonb), 'UTF8'), 'sha256'
  ), 'hex') AS sha256
)
INSERT INTO evidence.economic_state_model_components (
  organization_id, workspace_id, model_id, component_key, concept_id,
  series_id, unit_code, frequency, seasonal_adjustment,
  parser_name, parser_version, parser_code_sha256, parser_configuration_sha256,
  feature_contract_sha256, weight, polarity, lower_bound, upper_bound
)
SELECT
  organization_id, workspace_id, model_id, 'gdp',
  '038f47ac-19fc-7c92-ae91-0242ac120006',
  '038f47ac-19fc-7c92-ae91-0242ac120007', 'USD', 'annual', 'unadjusted',
  'economic-state-verifier', '1.0.0', repeat('7',64), configuration.sha256,
  encode(digest(convert_to(evidence.canonical_json(
    evidence.economic_state_feature_contract(
      '038f47ac-19fc-7c92-ae91-0242ac120007',
      'economic-state-verifier', '1.0.0', repeat('7',64), configuration.sha256
    )
  ), 'UTF8'), 'sha256'), 'hex'),
  '1', 'positive', '0', '100'
FROM targets CROSS JOIN configuration;

SET LOCAL app.organization_id = '068f47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '068f47ac-19fc-7c92-ae91-0242ac120005';

WITH legal_manifest AS (
  SELECT evidence.economic_state_legal_evidence(
    '068f47ac-19fc-7c92-ae91-0242ac120001',
    '068f47ac-19fc-7c92-ae91-0242ac120011',
    '038f47ac-19fc-7c92-ae91-0242ac120002',
    '038f47ac-19fc-7c92-ae91-0242ac120003',
    '038f47ac-19fc-7c92-ae91-0242ac120001',
    '038f47ac-19fc-7c92-ae91-0242ac120004'
  ) AS manifest
), legal AS (
  SELECT manifest, encode(digest(
    convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'
  ), 'hex') AS sha256
  FROM legal_manifest
), quality AS (
  SELECT quality_score, quality_sha256
  FROM evidence.economic_state_observation_quality(
    '068f47ac-19fc-7c92-ae91-0242ac120011'
  )
), component_manifest AS (
  SELECT jsonb_build_array(
    jsonb_build_object(
      'componentKey', 'gdp',
      'observationId', '068f47ac-19fc-7c92-ae91-0242ac120011',
      'sourceId', '038f47ac-19fc-7c92-ae91-0242ac120002',
      'sourceDatasetId', '038f47ac-19fc-7c92-ae91-0242ac120003',
      'licenseReviewId', '038f47ac-19fc-7c92-ae91-0242ac120001',
      'sourceAdmissionDecisionId', '038f47ac-19fc-7c92-ae91-0242ac120004',
      'rawValue', '75', 'normalizedValue', '0.75', 'contribution', '0.45',
      'missingReason', NULL, 'quality', quality_score,
      'qualityEvidenceSha256', quality_sha256,
      'legalEvidenceSha256', legal.sha256
    ),
    jsonb_build_object(
      'componentKey', 'unemployment', 'observationId', NULL, 'sourceId', NULL,
      'sourceDatasetId', NULL, 'licenseReviewId', NULL,
      'sourceAdmissionDecisionId', NULL,
      'rawValue', NULL, 'normalizedValue', NULL, 'contribution', NULL,
      'missingReason', 'not_collected', 'quality', NULL,
      'qualityEvidenceSha256', NULL, 'legalEvidenceSha256', NULL
    )
  ) AS components
  FROM quality CROSS JOIN legal
), body AS (
  SELECT jsonb_build_object(
    'schemaVersion', 2,
    'modelId', model.id::text,
    'modelKey', model.model_key,
    'modelVersion', model.model_version,
    'modelArtifactId', model.model_artifact_id::text,
    'modelArtifactSha256', model.model_artifact_sha256,
    'dimension', model.dimension,
    'geographyId', '038f47ac-19fc-7c92-ae91-0242ac120005',
    'knownAt', '2026-03-01T00:00:00Z', 'policy', 'true_vintage',
    'snapshotSha256', snapshot.manifest_sha256,
    'status', 'partial', 'score', '75', 'missingReason', NULL,
    'completeness', '0.6', 'sourceCoverage', '0.5', 'confidence', '0.6',
    'distinctSourceCount', 1, 'renormalized', true,
    'components', component_manifest.components
  ) AS manifest, model.*, snapshot.id AS snapshot_id,
    snapshot.manifest_sha256 AS snapshot_sha256
  FROM component_manifest
  JOIN evidence.economic_state_models model
    ON model.id = '068f47ac-19fc-7c92-ae91-0242ac120014'
  JOIN evidence.dataset_snapshots snapshot
    ON snapshot.id = '068f47ac-19fc-7c92-ae91-0242ac120012'
)
INSERT INTO evidence.economic_state_runs (
  id, organization_id, workspace_id, snapshot_id, snapshot_manifest_sha256,
  model_id, model_version, model_definition_sha256,
  model_artifact_id, model_artifact_sha256, geography_id,
  known_at, policy, status, score, completeness, source_coverage, confidence,
  independent_source_count, renormalized, result_manifest,
  result_manifest_sha256, calculated_by
)
SELECT
  '068f47ac-19fc-7c92-ae91-0242ac120016',
  '068f47ac-19fc-7c92-ae91-0242ac120001',
  '068f47ac-19fc-7c92-ae91-0242ac120003', snapshot_id, snapshot_sha256,
  id, model_version, definition_sha256, model_artifact_id, model_artifact_sha256,
  '038f47ac-19fc-7c92-ae91-0242ac120005',
  '2026-03-01T00:00:00Z', 'true_vintage', 'partial', '75', '0.6', '0.5', '0.6',
  1, true, manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  '068f47ac-19fc-7c92-ae91-0242ac120005'
FROM body;

INSERT INTO evidence.economic_state_component_results (
  organization_id, workspace_id, run_id, model_id, component_key,
  observation_id, source_id, source_dataset_id, license_review_id,
  source_admission_event_id, raw_value, normalized_value, contribution,
  missing_reason, quality, quality_evidence_sha256,
  legal_evidence_manifest, legal_evidence_sha256
)
SELECT
  '068f47ac-19fc-7c92-ae91-0242ac120001'::uuid,
  '068f47ac-19fc-7c92-ae91-0242ac120003'::uuid,
  '068f47ac-19fc-7c92-ae91-0242ac120016'::uuid,
  '068f47ac-19fc-7c92-ae91-0242ac120014'::uuid, 'gdp',
  '068f47ac-19fc-7c92-ae91-0242ac120011'::uuid,
  '038f47ac-19fc-7c92-ae91-0242ac120002'::uuid,
  '038f47ac-19fc-7c92-ae91-0242ac120003'::uuid,
  '038f47ac-19fc-7c92-ae91-0242ac120001'::uuid,
  '038f47ac-19fc-7c92-ae91-0242ac120004'::uuid,
  '75', '0.75', '0.45', NULL, quality_score, quality_sha256,
  legal.manifest, encode(digest(
    convert_to(evidence.canonical_json(legal.manifest), 'UTF8'), 'sha256'
  ), 'hex')
FROM evidence.economic_state_observation_quality(
  '068f47ac-19fc-7c92-ae91-0242ac120011'
) quality
CROSS JOIN LATERAL (
  SELECT evidence.economic_state_legal_evidence(
    '068f47ac-19fc-7c92-ae91-0242ac120001',
    '068f47ac-19fc-7c92-ae91-0242ac120011',
    '038f47ac-19fc-7c92-ae91-0242ac120002',
    '038f47ac-19fc-7c92-ae91-0242ac120003',
    '038f47ac-19fc-7c92-ae91-0242ac120001',
    '038f47ac-19fc-7c92-ae91-0242ac120004'
  ) AS manifest
) legal;

INSERT INTO evidence.economic_state_component_results (
  organization_id, workspace_id, run_id, model_id, component_key,
  observation_id, source_id, raw_value, normalized_value, contribution,
  missing_reason, quality, quality_evidence_sha256
) VALUES (
  '068f47ac-19fc-7c92-ae91-0242ac120001',
  '068f47ac-19fc-7c92-ae91-0242ac120003',
  '068f47ac-19fc-7c92-ae91-0242ac120016',
  '068f47ac-19fc-7c92-ae91-0242ac120014', 'unemployment',
  NULL, NULL, NULL, NULL, NULL, 'not_collected', NULL, NULL
);

SET LOCAL app.organization_id = '068f47ac-19fc-7c92-ae91-0242ac120002';
WITH components AS (
  SELECT jsonb_build_array(jsonb_build_object(
    'componentKey', 'gdp', 'observationId', NULL, 'sourceId', NULL,
    'sourceDatasetId', NULL, 'licenseReviewId', NULL,
    'sourceAdmissionDecisionId', NULL,
    'rawValue', NULL, 'normalizedValue', NULL, 'contribution', NULL,
    'missingReason', 'source_missing', 'quality', NULL,
    'qualityEvidenceSha256', NULL, 'legalEvidenceSha256', NULL
  )) AS manifest
), body AS (
  SELECT jsonb_build_object(
    'schemaVersion', 2, 'modelId', model.id::text, 'modelKey', model.model_key,
    'modelVersion', model.model_version,
    'modelArtifactId', model.model_artifact_id::text,
    'modelArtifactSha256', model.model_artifact_sha256,
    'dimension', model.dimension,
    'geographyId', '038f47ac-19fc-7c92-ae91-0242ac120005',
    'knownAt', '2025-01-01T00:00:00Z', 'policy', 'true_vintage',
    'snapshotSha256', snapshot.manifest_sha256,
    'status', 'insufficient_data', 'score', NULL,
    'missingReason', 'insufficient_component_coverage',
    'completeness', '0', 'sourceCoverage', '0', 'confidence', '0',
    'distinctSourceCount', 0, 'renormalized', false,
    'components', components.manifest
  ) AS manifest, model.*, snapshot.id AS snapshot_id,
    snapshot.manifest_sha256 AS snapshot_sha256
  FROM components
  JOIN evidence.economic_state_models model
    ON model.id = '068f47ac-19fc-7c92-ae91-0242ac120015'
  JOIN evidence.dataset_snapshots snapshot
    ON snapshot.id = '068f47ac-19fc-7c92-ae91-0242ac120013'
)
INSERT INTO evidence.economic_state_runs (
  id, organization_id, workspace_id, snapshot_id, snapshot_manifest_sha256,
  model_id, model_version, model_definition_sha256,
  model_artifact_id, model_artifact_sha256, geography_id,
  known_at, policy, status, score, missing_reason, completeness,
  source_coverage, confidence, independent_source_count, renormalized,
  result_manifest, result_manifest_sha256, calculated_by
)
SELECT
  '068f47ac-19fc-7c92-ae91-0242ac120017',
  '068f47ac-19fc-7c92-ae91-0242ac120002',
  '068f47ac-19fc-7c92-ae91-0242ac120004', snapshot_id, snapshot_sha256,
  id, model_version, definition_sha256, model_artifact_id, model_artifact_sha256,
  '038f47ac-19fc-7c92-ae91-0242ac120005',
  '2025-01-01T00:00:00Z', 'true_vintage', 'insufficient_data', NULL,
  'insufficient_component_coverage', '0', '0', '0', 0, false,
  manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  '068f47ac-19fc-7c92-ae91-0242ac120005'
FROM body;
INSERT INTO evidence.economic_state_component_results (
  organization_id, workspace_id, run_id, model_id, component_key, missing_reason
) VALUES (
  '068f47ac-19fc-7c92-ae91-0242ac120002',
  '068f47ac-19fc-7c92-ae91-0242ac120004',
  '068f47ac-19fc-7c92-ae91-0242ac120017',
  '068f47ac-19fc-7c92-ae91-0242ac120015', 'gdp', 'source_missing'
);

SET LOCAL app.organization_id = '068f47ac-19fc-7c92-ae91-0242ac120001';

WITH context AS (
  SELECT
    run.*,
    jsonb_build_object(
      'geographyId', run.geography_id::text,
      'knownAt', run.result_manifest->>'knownAt',
      'policy', run.policy,
      'snapshotSha256', run.snapshot_manifest_sha256
    ) AS manifest
  FROM evidence.economic_state_runs run
  WHERE run.id = '068f47ac-19fc-7c92-ae91-0242ac120016'
), prepared AS (
  SELECT context.*,
    encode(digest(convert_to(
      evidence.canonical_json(context.manifest), 'UTF8'
    ), 'sha256'), 'hex') AS context_sha256,
    jsonb_build_array(
      jsonb_build_object(
        'dimension', 'macroeconomic',
        'model', model.definition_manifest,
        'result', context.result_manifest || jsonb_build_object(
          'manifestSha256', context.result_manifest_sha256
        ),
        'missingReason', NULL
      ),
      jsonb_build_object(
        'dimension', 'human_economic', 'model', NULL,
        'result', NULL, 'missingReason', 'not_modeled'
      ),
      jsonb_build_object(
        'dimension', 'financial_system', 'model', NULL,
        'result', NULL, 'missingReason', 'model_unavailable'
      ),
      jsonb_build_object(
        'dimension', 'market', 'model', NULL,
        'result', NULL, 'missingReason', 'source_missing'
      ),
      jsonb_build_object(
        'dimension', 'regime', 'model', NULL,
        'result', NULL, 'missingReason', 'pipeline_failure'
      )
    ) AS dimensions,
    jsonb_build_object(
      'dimensionCount', 5,
      'reportedDimensionCount', 1,
      'scoredDimensionCount', 1,
      'insufficientDimensionCount', 0,
      'missingDimensionCount', 4,
      'dimensionCoverage', '0.2',
      'scoredDimensionCoverage', '0.2',
      'evidenceCoverage', '0.12',
      'confidenceCoverage', '0.12',
      'evidenceQuality', '1',
      'reportedComponentCount', 2,
      'observedComponentCount', 1,
      'distinctSourceCount', 1,
      'distinctSourceCoverage', '0.5'
    ) AS diagnostics
  FROM context
  JOIN evidence.economic_state_models model ON model.id = context.model_id
), body AS (
  SELECT prepared.*, jsonb_build_object(
    'schemaVersion', 1,
    'context', prepared.manifest,
    'contextSha256', prepared.context_sha256,
    'dimensions', prepared.dimensions,
    'diagnostics', prepared.diagnostics
  ) AS state_body
  FROM prepared
), committed AS (
  SELECT body.*,
    encode(digest(convert_to(
      evidence.canonical_json(body.state_body), 'UTF8'
    ), 'sha256'), 'hex') AS state_sha256
  FROM body
)
INSERT INTO evidence.economic_state_vectors (
  id, organization_id, workspace_id, geography_id,
  snapshot_id, snapshot_manifest_sha256, known_at, policy, system_at,
  context_sha256, dimension_count, reported_dimension_count,
  scored_dimension_count, insufficient_dimension_count, missing_dimension_count,
  dimension_coverage, scored_dimension_coverage, evidence_coverage,
  confidence_coverage, evidence_quality, reported_component_count,
  observed_component_count, distinct_source_count, distinct_source_coverage,
  state_manifest, state_manifest_sha256, assembled_by
)
SELECT
  '068f47ac-19fc-7c92-ae91-0242ac120060',
  organization_id, workspace_id, geography_id,
  snapshot_id, snapshot_manifest_sha256, known_at, policy, system_at,
  context_sha256, 5, 1, 1, 0, 4,
  '0.2', '0.2', '0.12', '0.12', '1', 2, 1, 1, '0.5',
  state_body || jsonb_build_object('manifestSha256', state_sha256),
  state_sha256, '068f47ac-19fc-7c92-ae91-0242ac120005'
FROM committed;

INSERT INTO evidence.economic_state_vector_dimensions (
  organization_id, workspace_id, vector_id, ordinal, dimension,
  model_id, state_run_id, missing_reason
) VALUES
  (
    '068f47ac-19fc-7c92-ae91-0242ac120001',
    '068f47ac-19fc-7c92-ae91-0242ac120003',
    '068f47ac-19fc-7c92-ae91-0242ac120060', 1, 'macroeconomic',
    '068f47ac-19fc-7c92-ae91-0242ac120014',
    '068f47ac-19fc-7c92-ae91-0242ac120016', NULL
  ),
  (
    '068f47ac-19fc-7c92-ae91-0242ac120001',
    '068f47ac-19fc-7c92-ae91-0242ac120003',
    '068f47ac-19fc-7c92-ae91-0242ac120060', 2, 'human_economic',
    NULL, NULL, 'not_modeled'
  ),
  (
    '068f47ac-19fc-7c92-ae91-0242ac120001',
    '068f47ac-19fc-7c92-ae91-0242ac120003',
    '068f47ac-19fc-7c92-ae91-0242ac120060', 3, 'financial_system',
    NULL, NULL, 'model_unavailable'
  ),
  (
    '068f47ac-19fc-7c92-ae91-0242ac120001',
    '068f47ac-19fc-7c92-ae91-0242ac120003',
    '068f47ac-19fc-7c92-ae91-0242ac120060', 4, 'market',
    NULL, NULL, 'source_missing'
  ),
  (
    '068f47ac-19fc-7c92-ae91-0242ac120001',
    '068f47ac-19fc-7c92-ae91-0242ac120003',
    '068f47ac-19fc-7c92-ae91-0242ac120060', 5, 'regime',
    NULL, NULL, 'pipeline_failure'
  );

INSERT INTO evidence.dataset_snapshots (
  id, organization_id, workspace_id, known_at, policy,
  manifest, manifest_sha256, created_by
)
SELECT
  '068f47ac-19fc-7c92-ae91-0242ac120070',
  '068f47ac-19fc-7c92-ae91-0242ac120001',
  '068f47ac-19fc-7c92-ae91-0242ac120030',
  '2026-03-01T00:00:00Z', 'true_vintage', manifest,
  encode(digest(convert_to(manifest::text, 'UTF8'), 'sha256'), 'hex'),
  '068f47ac-19fc-7c92-ae91-0242ac120005'
FROM (VALUES (
  '{"knownAt":"2026-03-01T00:00:00Z","observationIds":[],"policy":"true_vintage"}'::jsonb
)) input(manifest);

WITH snapshot AS (
  SELECT *, jsonb_build_object(
    'geographyId', '038f47ac-19fc-7c92-ae91-0242ac120005',
    'knownAt', manifest->>'knownAt',
    'policy', policy,
    'snapshotSha256', manifest_sha256
  ) AS context_manifest
  FROM evidence.dataset_snapshots
  WHERE id = '068f47ac-19fc-7c92-ae91-0242ac120070'
), prepared AS (
  SELECT snapshot.*,
    encode(digest(convert_to(
      evidence.canonical_json(context_manifest), 'UTF8'
    ), 'sha256'), 'hex') AS context_sha256,
    jsonb_build_array(
      jsonb_build_object(
        'dimension', 'macroeconomic', 'model', NULL,
        'result', NULL, 'missingReason', 'not_modeled'
      ),
      jsonb_build_object(
        'dimension', 'human_economic', 'model', NULL,
        'result', NULL, 'missingReason', 'not_modeled'
      ),
      jsonb_build_object(
        'dimension', 'financial_system', 'model', NULL,
        'result', NULL, 'missingReason', 'not_modeled'
      ),
      jsonb_build_object(
        'dimension', 'market', 'model', NULL,
        'result', NULL, 'missingReason', 'not_modeled'
      ),
      jsonb_build_object(
        'dimension', 'regime', 'model', NULL,
        'result', NULL, 'missingReason', 'not_modeled'
      )
    ) AS dimensions,
    jsonb_build_object(
      'dimensionCount', 5,
      'reportedDimensionCount', 0,
      'scoredDimensionCount', 0,
      'insufficientDimensionCount', 0,
      'missingDimensionCount', 5,
      'dimensionCoverage', '0',
      'scoredDimensionCoverage', '0',
      'evidenceCoverage', '0',
      'confidenceCoverage', '0',
      'evidenceQuality', NULL,
      'reportedComponentCount', 0,
      'observedComponentCount', 0,
      'distinctSourceCount', 0,
      'distinctSourceCoverage', NULL
    ) AS diagnostics
  FROM snapshot
), body AS (
  SELECT prepared.*, jsonb_build_object(
    'schemaVersion', 1,
    'context', context_manifest,
    'contextSha256', context_sha256,
    'dimensions', dimensions,
    'diagnostics', diagnostics
  ) AS state_body
  FROM prepared
), committed AS (
  SELECT body.*, encode(digest(convert_to(
    evidence.canonical_json(state_body), 'UTF8'
  ), 'sha256'), 'hex') AS state_sha256
  FROM body
)
INSERT INTO evidence.economic_state_vectors (
  id, organization_id, workspace_id, geography_id,
  snapshot_id, snapshot_manifest_sha256, known_at, policy,
  context_sha256, dimension_count, reported_dimension_count,
  scored_dimension_count, insufficient_dimension_count, missing_dimension_count,
  dimension_coverage, scored_dimension_coverage, evidence_coverage,
  confidence_coverage, evidence_quality, reported_component_count,
  observed_component_count, distinct_source_count, distinct_source_coverage,
  state_manifest, state_manifest_sha256, assembled_by
)
SELECT
  '068f47ac-19fc-7c92-ae91-0242ac120071',
  organization_id, workspace_id,
  '038f47ac-19fc-7c92-ae91-0242ac120005', id, manifest_sha256,
  known_at, policy, context_sha256, 5, 0, 0, 0, 5,
  '0', '0', '0', '0', NULL, 0, 0, 0, NULL,
  state_body || jsonb_build_object('manifestSha256', state_sha256),
  state_sha256, '068f47ac-19fc-7c92-ae91-0242ac120005'
FROM committed;

INSERT INTO evidence.economic_state_vector_dimensions (
  organization_id, workspace_id, vector_id, ordinal, dimension, missing_reason
) VALUES
  (
    '068f47ac-19fc-7c92-ae91-0242ac120001',
    '068f47ac-19fc-7c92-ae91-0242ac120030',
    '068f47ac-19fc-7c92-ae91-0242ac120071', 1, 'macroeconomic', 'not_modeled'
  ),
  (
    '068f47ac-19fc-7c92-ae91-0242ac120001',
    '068f47ac-19fc-7c92-ae91-0242ac120030',
    '068f47ac-19fc-7c92-ae91-0242ac120071', 2, 'human_economic', 'not_modeled'
  ),
  (
    '068f47ac-19fc-7c92-ae91-0242ac120001',
    '068f47ac-19fc-7c92-ae91-0242ac120030',
    '068f47ac-19fc-7c92-ae91-0242ac120071', 3, 'financial_system', 'not_modeled'
  ),
  (
    '068f47ac-19fc-7c92-ae91-0242ac120001',
    '068f47ac-19fc-7c92-ae91-0242ac120030',
    '068f47ac-19fc-7c92-ae91-0242ac120071', 4, 'market', 'not_modeled'
  ),
  (
    '068f47ac-19fc-7c92-ae91-0242ac120001',
    '068f47ac-19fc-7c92-ae91-0242ac120030',
    '068f47ac-19fc-7c92-ae91-0242ac120071', 5, 'regime', 'not_modeled'
  );

SET CONSTRAINTS
  evidence.economic_state_models_validate_deferred,
  evidence.economic_state_model_components_validate_deferred,
  evidence.economic_state_runs_validate_deferred,
  evidence.economic_state_component_results_validate_deferred,
  evidence.economic_state_runs_temporal_admission_deferred,
  evidence.economic_state_component_results_temporal_admission_deferred,
  evidence.economic_state_vectors_validate_deferred,
  evidence.economic_state_vector_dimensions_validate_deferred,
  evidence.economic_state_vector_dimensions_temporal_admission_deferred
IMMEDIATE;
SET CONSTRAINTS
  evidence.economic_state_models_validate_deferred,
  evidence.economic_state_model_components_validate_deferred,
  evidence.economic_state_runs_validate_deferred,
  evidence.economic_state_component_results_validate_deferred,
  evidence.economic_state_runs_temporal_admission_deferred,
  evidence.economic_state_component_results_temporal_admission_deferred,
  evidence.economic_state_vectors_validate_deferred,
  evidence.economic_state_vector_dimensions_validate_deferred,
  evidence.economic_state_vector_dimensions_temporal_admission_deferred
DEFERRED;

DO $verify_state_vector_acceptance$
DECLARE
  lineage_count integer;
  attributed_subject uuid;
BEGIN
  PERFORM evidence.validate_economic_state_vector(
    '068f47ac-19fc-7c92-ae91-0242ac120060'
  );
  PERFORM evidence.validate_economic_state_vector(
    '068f47ac-19fc-7c92-ae91-0242ac120071'
  );
  SELECT assembled_by INTO STRICT attributed_subject
  FROM evidence.economic_state_vectors
  WHERE id = '068f47ac-19fc-7c92-ae91-0242ac120060';
  IF attributed_subject <> '068f47ac-19fc-7c92-ae91-0242ac120005' THEN
    RAISE EXCEPTION 'economic-state vector attribution was not persisted';
  END IF;
  SELECT count(*) INTO lineage_count
  FROM evidence.lineage_edges edge
  WHERE (
    edge.from_type = 'model'
    AND edge.from_id = '068f47ac-19fc-7c92-ae91-0242ac120014'
    AND edge.to_type = 'state_run'
    AND edge.to_id = '068f47ac-19fc-7c92-ae91-0242ac120016'
    AND edge.relation = 'executed_with'
  ) OR (
    edge.from_type = 'observation'
    AND edge.from_id = '068f47ac-19fc-7c92-ae91-0242ac120011'
    AND edge.to_type = 'state_run'
    AND edge.to_id = '068f47ac-19fc-7c92-ae91-0242ac120016'
    AND edge.relation = 'derived_from'
  ) OR (
    edge.from_type = 'state_run'
    AND edge.from_id = '068f47ac-19fc-7c92-ae91-0242ac120016'
    AND edge.to_type = 'state_vector'
    AND edge.to_id = '068f47ac-19fc-7c92-ae91-0242ac120060'
    AND edge.relation = 'produced'
  );
  IF lineage_count <> 3 THEN
    RAISE EXCEPTION 'automatic economic-state lineage is incomplete: %', lineage_count;
  END IF;
  IF evidence.lineage_endpoint_scope(
    'state_run', '068f47ac-19fc-7c92-ae91-0242ac120016'
  ) <> '068f47ac-19fc-7c92-ae91-0242ac120001'
    OR evidence.lineage_endpoint_scope(
      'state_vector', '068f47ac-19fc-7c92-ae91-0242ac120060'
    ) <> '068f47ac-19fc-7c92-ae91-0242ac120001'
  THEN
    RAISE EXCEPTION 'explicit economic-state lineage endpoint resolution failed';
  END IF;
END
$verify_state_vector_acceptance$;

DO $verify_state_vector_forgery_rejection$
DECLARE
  original evidence.economic_state_vectors%ROWTYPE;
BEGIN
  SELECT * INTO STRICT original
  FROM evidence.economic_state_vectors
  WHERE id = '068f47ac-19fc-7c92-ae91-0242ac120060';

  BEGIN
    INSERT INTO evidence.economic_state_vectors
    SELECT original.* FROM (SELECT 1) ignored;
    RAISE EXCEPTION 'duplicate vector identity unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO evidence.economic_state_vectors (
      id, organization_id, workspace_id, geography_id,
      snapshot_id, snapshot_manifest_sha256, known_at, policy, system_at,
      context_sha256, dimension_count, reported_dimension_count,
      scored_dimension_count, insufficient_dimension_count, missing_dimension_count,
      dimension_coverage, scored_dimension_coverage, evidence_coverage,
      confidence_coverage, evidence_quality, reported_component_count,
      observed_component_count, distinct_source_count, distinct_source_coverage,
      state_manifest, state_manifest_sha256, assembled_by, assembled_at
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120061',
      original.organization_id, original.workspace_id, original.geography_id,
      original.snapshot_id, original.snapshot_manifest_sha256,
      original.known_at, original.policy, original.system_at,
      original.context_sha256, original.dimension_count,
      original.reported_dimension_count, original.scored_dimension_count,
      original.insufficient_dimension_count, original.missing_dimension_count,
      original.dimension_coverage, original.scored_dimension_coverage,
      original.evidence_coverage, original.confidence_coverage,
      original.evidence_quality, original.reported_component_count,
      original.observed_component_count, original.distinct_source_count,
      original.distinct_source_coverage, original.state_manifest, repeat('0', 64),
      original.assembled_by, original.assembled_at
    );
    INSERT INTO evidence.economic_state_vector_dimensions
    SELECT
      organization_id, workspace_id,
      '068f47ac-19fc-7c92-ae91-0242ac120061', ordinal, dimension,
      model_id, state_run_id, missing_reason, created_at
    FROM evidence.economic_state_vector_dimensions
    WHERE vector_id = original.id;
    PERFORM evidence.validate_economic_state_vector(
      '068f47ac-19fc-7c92-ae91-0242ac120061'
    );
    RAISE EXCEPTION 'vector digest forgery unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO evidence.economic_state_vectors (
      id, organization_id, workspace_id, geography_id,
      snapshot_id, snapshot_manifest_sha256, known_at, policy, system_at,
      context_sha256, dimension_count, reported_dimension_count,
      scored_dimension_count, insufficient_dimension_count, missing_dimension_count,
      dimension_coverage, scored_dimension_coverage, evidence_coverage,
      confidence_coverage, evidence_quality, reported_component_count,
      observed_component_count, distinct_source_count, distinct_source_coverage,
      state_manifest, state_manifest_sha256, assembled_by, assembled_at
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120062',
      original.organization_id, original.workspace_id, original.geography_id,
      original.snapshot_id, original.snapshot_manifest_sha256,
      original.known_at, original.policy, original.system_at,
      original.context_sha256, original.dimension_count,
      original.reported_dimension_count, original.scored_dimension_count,
      original.insufficient_dimension_count, original.missing_dimension_count,
      original.dimension_coverage, original.scored_dimension_coverage, '0.13',
      original.confidence_coverage, original.evidence_quality,
      original.reported_component_count, original.observed_component_count,
      original.distinct_source_count, original.distinct_source_coverage,
      original.state_manifest, original.state_manifest_sha256,
      original.assembled_by, original.assembled_at
    );
    INSERT INTO evidence.economic_state_vector_dimensions
    SELECT
      organization_id, workspace_id,
      '068f47ac-19fc-7c92-ae91-0242ac120062', ordinal, dimension,
      model_id, state_run_id, missing_reason, created_at
    FROM evidence.economic_state_vector_dimensions
    WHERE vector_id = original.id;
    PERFORM evidence.validate_economic_state_vector(
      '068f47ac-19fc-7c92-ae91-0242ac120062'
    );
    RAISE EXCEPTION 'vector diagnostic forgery unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO evidence.economic_state_vectors (
      id, organization_id, workspace_id, geography_id,
      snapshot_id, snapshot_manifest_sha256, known_at, policy, system_at,
      context_sha256, dimension_count, reported_dimension_count,
      scored_dimension_count, insufficient_dimension_count, missing_dimension_count,
      dimension_coverage, scored_dimension_coverage, evidence_coverage,
      confidence_coverage, evidence_quality, reported_component_count,
      observed_component_count, distinct_source_count, distinct_source_coverage,
      state_manifest, state_manifest_sha256, assembled_by, assembled_at
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120063',
      original.organization_id, original.workspace_id, original.geography_id,
      original.snapshot_id, original.snapshot_manifest_sha256,
      original.known_at + interval '1 day', original.policy, original.system_at,
      original.context_sha256, original.dimension_count,
      original.reported_dimension_count, original.scored_dimension_count,
      original.insufficient_dimension_count, original.missing_dimension_count,
      original.dimension_coverage, original.scored_dimension_coverage,
      original.evidence_coverage, original.confidence_coverage,
      original.evidence_quality, original.reported_component_count,
      original.observed_component_count, original.distinct_source_count,
      original.distinct_source_coverage, original.state_manifest,
      original.state_manifest_sha256, original.assembled_by, original.assembled_at
    );
    INSERT INTO evidence.economic_state_vector_dimensions
    SELECT
      organization_id, workspace_id,
      '068f47ac-19fc-7c92-ae91-0242ac120063', ordinal, dimension,
      model_id, state_run_id, missing_reason, created_at
    FROM evidence.economic_state_vector_dimensions
    WHERE vector_id = original.id;
    PERFORM evidence.validate_economic_state_vector(
      '068f47ac-19fc-7c92-ae91-0242ac120063'
    );
    RAISE EXCEPTION 'vector context forgery unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO evidence.economic_state_vectors (
      id, organization_id, workspace_id, geography_id,
      snapshot_id, snapshot_manifest_sha256, known_at, policy, system_at,
      context_sha256, dimension_count, reported_dimension_count,
      scored_dimension_count, insufficient_dimension_count, missing_dimension_count,
      dimension_coverage, scored_dimension_coverage, evidence_coverage,
      confidence_coverage, evidence_quality, reported_component_count,
      observed_component_count, distinct_source_count, distinct_source_coverage,
      state_manifest, state_manifest_sha256, assembled_by, assembled_at
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120064',
      original.organization_id, original.workspace_id, original.geography_id,
      original.snapshot_id, original.snapshot_manifest_sha256,
      original.known_at, original.policy, original.system_at,
      original.context_sha256, original.dimension_count,
      original.reported_dimension_count, original.scored_dimension_count,
      original.insufficient_dimension_count, original.missing_dimension_count,
      original.dimension_coverage, original.scored_dimension_coverage,
      original.evidence_coverage, original.confidence_coverage,
      original.evidence_quality, original.reported_component_count,
      original.observed_component_count, original.distinct_source_count,
      original.distinct_source_coverage, original.state_manifest,
      original.state_manifest_sha256, original.assembled_by, original.assembled_at
    );
    INSERT INTO evidence.economic_state_vector_dimensions (
      organization_id, workspace_id, vector_id, ordinal, dimension,
      model_id, state_run_id, missing_reason, created_at
    ) VALUES
      (
        original.organization_id, original.workspace_id,
        '068f47ac-19fc-7c92-ae91-0242ac120064', 1, 'macroeconomic',
        NULL, NULL, 'not_modeled', original.assembled_at
      ),
      (
        original.organization_id, original.workspace_id,
        '068f47ac-19fc-7c92-ae91-0242ac120064', 2, 'human_economic',
        '068f47ac-19fc-7c92-ae91-0242ac120014',
        '068f47ac-19fc-7c92-ae91-0242ac120016', NULL, original.assembled_at
      ),
      (
        original.organization_id, original.workspace_id,
        '068f47ac-19fc-7c92-ae91-0242ac120064', 3, 'financial_system',
        NULL, NULL, 'model_unavailable', original.assembled_at
      ),
      (
        original.organization_id, original.workspace_id,
        '068f47ac-19fc-7c92-ae91-0242ac120064', 4, 'market',
        NULL, NULL, 'source_missing', original.assembled_at
      ),
      (
        original.organization_id, original.workspace_id,
        '068f47ac-19fc-7c92-ae91-0242ac120064', 5, 'regime',
        NULL, NULL, 'pipeline_failure', original.assembled_at
      );
    PERFORM evidence.validate_economic_state_vector(
      '068f47ac-19fc-7c92-ae91-0242ac120064'
    );
    RAISE EXCEPTION 'vector slot forgery unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO evidence.economic_state_vectors (
      id, organization_id, workspace_id, geography_id,
      snapshot_id, snapshot_manifest_sha256, known_at, policy, system_at,
      context_sha256, dimension_count, reported_dimension_count,
      scored_dimension_count, insufficient_dimension_count, missing_dimension_count,
      dimension_coverage, scored_dimension_coverage, evidence_coverage,
      confidence_coverage, evidence_quality, reported_component_count,
      observed_component_count, distinct_source_count, distinct_source_coverage,
      state_manifest, state_manifest_sha256, assembled_by, assembled_at
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120065',
      original.organization_id, original.workspace_id, original.geography_id,
      original.snapshot_id, original.snapshot_manifest_sha256,
      original.known_at, original.policy, original.system_at,
      original.context_sha256, original.dimension_count,
      original.reported_dimension_count, original.scored_dimension_count,
      original.insufficient_dimension_count, original.missing_dimension_count,
      original.dimension_coverage, original.scored_dimension_coverage,
      original.evidence_coverage, original.confidence_coverage,
      original.evidence_quality, original.reported_component_count,
      original.observed_component_count, original.distinct_source_count,
      original.distinct_source_coverage, original.state_manifest,
      original.state_manifest_sha256,
      '068f47ac-19fc-7c92-ae91-0242ac120046', original.assembled_at
    );
    RAISE EXCEPTION 'vector attribution forgery unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_state_vector_forgery_rejection$;

DO $verify_state_vector_lineage_rejection$
BEGIN
  BEGIN
    INSERT INTO evidence.lineage_edges (
      id, organization_id, from_type, from_id, to_type, to_id, relation
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120078',
      '068f47ac-19fc-7c92-ae91-0242ac120001',
      'state_run', '068f47ac-19fc-7c92-ae91-0242ac120016',
      'state_vector', '068f47ac-19fc-7c92-ae91-0242ac120071', 'produced'
    );
    RAISE EXCEPTION 'cross-workspace state lineage unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM evidence.lineage_endpoint_scope(
      'state_vector', '068f47ac-19fc-7c92-ae91-0242ac129999'
    );
    RAISE EXCEPTION 'missing state-vector lineage endpoint unexpectedly resolved';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END
$verify_state_vector_lineage_rejection$;

DO $verify_subject_attribution_rejection$
DECLARE
  artifact evidence.economic_state_model_artifacts%ROWTYPE;
  model evidence.economic_state_models%ROWTYPE;
  state_run evidence.economic_state_runs%ROWTYPE;
  forged_manifest jsonb;
  persisted_forgery_count integer;
BEGIN
  SELECT * INTO STRICT artifact
  FROM evidence.economic_state_model_artifacts
  WHERE id = '068f47ac-19fc-7c92-ae91-0242ac120040';
  forged_manifest := jsonb_set(
    jsonb_set(
      artifact.artifact_manifest,
      '{id}', to_jsonb('068f47ac-19fc-7c92-ae91-0242ac120047'::text)
    ),
    '{key}', to_jsonb('economic-state.forged-attribution'::text)
  );
  BEGIN
    INSERT INTO evidence.economic_state_model_artifacts (
      id, organization_id, workspace_id, artifact_key, artifact_version,
      lifecycle_status, algorithm_key, algorithm_version, code_commit_sha256,
      package_lock_sha256, sbom_sha256, environment_sha256, configuration_sha256,
      normalization_sha256, assumptions_sha256, approval_sha256,
      artifact_manifest, artifact_sha256, created_by
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120047',
      artifact.organization_id, artifact.workspace_id,
      'economic-state.forged-attribution', artifact.artifact_version,
      artifact.lifecycle_status, artifact.algorithm_key, artifact.algorithm_version,
      artifact.code_commit_sha256, artifact.package_lock_sha256, artifact.sbom_sha256,
      artifact.environment_sha256, artifact.configuration_sha256,
      artifact.normalization_sha256, artifact.assumptions_sha256,
      artifact.approval_sha256, forged_manifest,
      encode(digest(convert_to(
        evidence.canonical_json(forged_manifest), 'UTF8'
      ), 'sha256'), 'hex'),
      '068f47ac-19fc-7c92-ae91-0242ac120046'
    );
    RAISE EXCEPTION 'forged model-artifact attribution unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  SELECT * INTO STRICT model
  FROM evidence.economic_state_models
  WHERE id = '068f47ac-19fc-7c92-ae91-0242ac120014';
  forged_manifest := jsonb_set(
    jsonb_set(
      model.definition_manifest,
      '{id}', to_jsonb('068f47ac-19fc-7c92-ae91-0242ac120048'::text)
    ),
    '{key}', to_jsonb('macroeconomic.forged-attribution'::text)
  );
  BEGIN
    INSERT INTO evidence.economic_state_models (
      id, organization_id, workspace_id, model_key, model_version, dimension,
      minimum_coverage, definition_manifest, definition_sha256,
      governance_schema_version, model_artifact_id, model_artifact_sha256, created_by
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120048',
      model.organization_id, model.workspace_id,
      'macroeconomic.forged-attribution', model.model_version, model.dimension,
      model.minimum_coverage, forged_manifest,
      encode(digest(convert_to(
        evidence.canonical_json(forged_manifest), 'UTF8'
      ), 'sha256'), 'hex'),
      model.governance_schema_version, model.model_artifact_id,
      model.model_artifact_sha256,
      '068f47ac-19fc-7c92-ae91-0242ac120046'
    );
    RAISE EXCEPTION 'forged model attribution unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  SELECT * INTO STRICT state_run
  FROM evidence.economic_state_runs
  WHERE id = '068f47ac-19fc-7c92-ae91-0242ac120016';
  BEGIN
    INSERT INTO evidence.economic_state_runs (
      id, organization_id, workspace_id, snapshot_id, snapshot_manifest_sha256,
      model_id, model_version, model_definition_sha256,
      model_artifact_id, model_artifact_sha256, geography_id,
      known_at, policy, system_at, status, score, missing_reason,
      completeness, source_coverage, confidence, independent_source_count,
      renormalized, result_manifest, result_manifest_sha256, calculated_by
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120049',
      state_run.organization_id, state_run.workspace_id,
      state_run.snapshot_id, state_run.snapshot_manifest_sha256,
      state_run.model_id, state_run.model_version, state_run.model_definition_sha256,
      state_run.model_artifact_id, state_run.model_artifact_sha256,
      state_run.geography_id, state_run.known_at, state_run.policy,
      state_run.system_at, state_run.status, state_run.score, state_run.missing_reason,
      state_run.completeness, state_run.source_coverage, state_run.confidence,
      state_run.independent_source_count, state_run.renormalized,
      state_run.result_manifest, state_run.result_manifest_sha256,
      '068f47ac-19fc-7c92-ae91-0242ac120046'
    );
    RAISE EXCEPTION 'forged run attribution unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  SELECT
    (SELECT count(*) FROM evidence.economic_state_model_artifacts
      WHERE id = '068f47ac-19fc-7c92-ae91-0242ac120047')
    + (SELECT count(*) FROM evidence.economic_state_models
      WHERE id = '068f47ac-19fc-7c92-ae91-0242ac120048')
    + (SELECT count(*) FROM evidence.economic_state_runs
      WHERE id = '068f47ac-19fc-7c92-ae91-0242ac120049')
  INTO persisted_forgery_count;
  IF persisted_forgery_count <> 0 THEN
    RAISE EXCEPTION 'forged economic-state attribution left committed evidence';
  END IF;
END
$verify_subject_attribution_rejection$;

DO $verify_forgery_rejection$
DECLARE
  quality_sha text;
  legal_manifest jsonb;
  legal_sha text;
BEGIN
  SELECT quality_evidence_sha256, legal_evidence_manifest, legal_evidence_sha256
  INTO quality_sha, legal_manifest, legal_sha
  FROM evidence.economic_state_component_results
  WHERE run_id = '068f47ac-19fc-7c92-ae91-0242ac120016' AND component_key = 'gdp';
  BEGIN
    INSERT INTO evidence.economic_state_component_results (
      organization_id, workspace_id, run_id, model_id, component_key,
      observation_id, source_id, source_dataset_id, license_review_id,
      source_admission_event_id, raw_value, normalized_value, contribution,
      quality, quality_evidence_sha256, legal_evidence_manifest, legal_evidence_sha256
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120001',
      '068f47ac-19fc-7c92-ae91-0242ac120003',
      '068f47ac-19fc-7c92-ae91-0242ac120016',
      '068f47ac-19fc-7c92-ae91-0242ac120014', 'gdp',
      '068f47ac-19fc-7c92-ae91-0242ac120011',
      '038f47ac-19fc-7c92-ae91-0242ac120002',
      '038f47ac-19fc-7c92-ae91-0242ac120003',
      '038f47ac-19fc-7c92-ae91-0242ac120001',
      '038f47ac-19fc-7c92-ae91-0242ac120004',
      '74', '0.74', '0.444', '1', quality_sha, legal_manifest, legal_sha
    );
    RAISE EXCEPTION 'forged raw value unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO evidence.economic_state_component_results (
      organization_id, workspace_id, run_id, model_id, component_key,
      observation_id, source_id, source_dataset_id, license_review_id,
      source_admission_event_id, raw_value, normalized_value, contribution,
      quality, quality_evidence_sha256, legal_evidence_manifest, legal_evidence_sha256
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120001',
      '068f47ac-19fc-7c92-ae91-0242ac120003',
      '068f47ac-19fc-7c92-ae91-0242ac120016',
      '068f47ac-19fc-7c92-ae91-0242ac120014', 'gdp',
      '068f47ac-19fc-7c92-ae91-0242ac120011',
      '038f47ac-19fc-7c92-ae91-0242ac120002',
      '038f47ac-19fc-7c92-ae91-0242ac120003',
      '038f47ac-19fc-7c92-ae91-0242ac120001',
      '038f47ac-19fc-7c92-ae91-0242ac120004',
      '75', '0.75', '0.45', '0.5', quality_sha, legal_manifest, legal_sha
    );
    RAISE EXCEPTION 'forged quality unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO evidence.economic_state_component_results (
      organization_id, workspace_id, run_id, model_id, component_key, missing_reason
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120001',
      '068f47ac-19fc-7c92-ae91-0242ac120003',
      '068f47ac-19fc-7c92-ae91-0242ac120016',
      '068f47ac-19fc-7c92-ae91-0242ac120014', 'gdp', 'source_missing'
    );
    RAISE EXCEPTION 'forged missingness unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO evidence.economic_state_component_results (
      organization_id, workspace_id, run_id, model_id, component_key,
      observation_id, source_id, source_dataset_id, license_review_id,
      source_admission_event_id, raw_value, normalized_value, contribution,
      quality, quality_evidence_sha256, legal_evidence_manifest, legal_evidence_sha256
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120001',
      '068f47ac-19fc-7c92-ae91-0242ac120003',
      '068f47ac-19fc-7c92-ae91-0242ac120016',
      '068f47ac-19fc-7c92-ae91-0242ac120014', 'gdp',
      '068f47ac-19fc-7c92-ae91-0242ac120011',
      '038f47ac-19fc-7c92-ae91-0242ac120002',
      '038f47ac-19fc-7c92-ae91-0242ac120003',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      '038f47ac-19fc-7c92-ae91-0242ac120004',
      '75', '0.75', '0.45', '1', quality_sha, legal_manifest, legal_sha
    );
    RAISE EXCEPTION 'forged license review unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO evidence.economic_state_component_results (
      organization_id, workspace_id, run_id, model_id, component_key,
      observation_id, source_id, source_dataset_id, license_review_id,
      source_admission_event_id, raw_value, normalized_value, contribution,
      quality, quality_evidence_sha256, legal_evidence_manifest, legal_evidence_sha256
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120001',
      '068f47ac-19fc-7c92-ae91-0242ac120003',
      '068f47ac-19fc-7c92-ae91-0242ac120016',
      '068f47ac-19fc-7c92-ae91-0242ac120014', 'gdp',
      '068f47ac-19fc-7c92-ae91-0242ac120011',
      '038f47ac-19fc-7c92-ae91-0242ac120002',
      '038f47ac-19fc-7c92-ae91-0242ac120003',
      '038f47ac-19fc-7c92-ae91-0242ac120001',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      '75', '0.75', '0.45', '1', quality_sha, legal_manifest, legal_sha
    );
    RAISE EXCEPTION 'forged source admission decision unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO evidence.economic_state_component_results (
      organization_id, workspace_id, run_id, model_id, component_key,
      observation_id, source_id, source_dataset_id, license_review_id,
      source_admission_event_id, raw_value, normalized_value, contribution,
      quality, quality_evidence_sha256, legal_evidence_manifest, legal_evidence_sha256
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120001',
      '068f47ac-19fc-7c92-ae91-0242ac120003',
      '068f47ac-19fc-7c92-ae91-0242ac120016',
      '068f47ac-19fc-7c92-ae91-0242ac120014', 'gdp',
      '068f47ac-19fc-7c92-ae91-0242ac120011',
      '038f47ac-19fc-7c92-ae91-0242ac120002',
      '038f47ac-19fc-7c92-ae91-0242ac120003',
      '038f47ac-19fc-7c92-ae91-0242ac120001',
      '038f47ac-19fc-7c92-ae91-0242ac120004',
      '75', '0.75', '0.45', '1', quality_sha, legal_manifest, repeat('f', 64)
    );
    RAISE EXCEPTION 'forged legal evidence digest unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$verify_forgery_rejection$;

DO $verify_snapshot_omission_rejected$
DECLARE
  model evidence.economic_state_models%ROWTYPE;
  snapshot_manifest jsonb := jsonb_build_object(
    'knownAt', '2026-03-01T00:00:00Z',
    'observationIds', '[]'::jsonb,
    'policy', 'true_vintage',
    'fixtureCase', 'snapshot-omission'
  );
  snapshot_sha text;
  components jsonb;
  result_manifest jsonb;
  rejection_message text;
BEGIN
  SELECT * INTO STRICT model
  FROM evidence.economic_state_models
  WHERE id = '068f47ac-19fc-7c92-ae91-0242ac120014';
  snapshot_sha := encode(digest(
    convert_to(snapshot_manifest::text, 'UTF8'), 'sha256'
  ), 'hex');
  components := jsonb_build_array(
    jsonb_build_object(
      'componentKey', 'gdp', 'observationId', NULL, 'sourceId', NULL,
      'sourceDatasetId', NULL, 'licenseReviewId', NULL,
      'sourceAdmissionDecisionId', NULL,
      'rawValue', NULL, 'normalizedValue', NULL, 'contribution', NULL,
      'missingReason', 'source_missing', 'quality', NULL,
      'qualityEvidenceSha256', NULL, 'legalEvidenceSha256', NULL
    ),
    jsonb_build_object(
      'componentKey', 'unemployment', 'observationId', NULL, 'sourceId', NULL,
      'sourceDatasetId', NULL, 'licenseReviewId', NULL,
      'sourceAdmissionDecisionId', NULL,
      'rawValue', NULL, 'normalizedValue', NULL, 'contribution', NULL,
      'missingReason', 'not_collected', 'quality', NULL,
      'qualityEvidenceSha256', NULL, 'legalEvidenceSha256', NULL
    )
  );
  result_manifest := jsonb_build_object(
    'schemaVersion', 2,
    'modelId', model.id::text,
    'modelKey', model.model_key,
    'modelVersion', model.model_version,
    'modelArtifactId', model.model_artifact_id::text,
    'modelArtifactSha256', model.model_artifact_sha256,
    'dimension', model.dimension,
    'geographyId', '038f47ac-19fc-7c92-ae91-0242ac120005',
    'knownAt', '2026-03-01T00:00:00Z',
    'policy', 'true_vintage',
    'snapshotSha256', snapshot_sha,
    'status', 'insufficient_data',
    'score', NULL,
    'missingReason', 'insufficient_component_coverage',
    'completeness', '0',
    'sourceCoverage', '0',
    'confidence', '0',
    'distinctSourceCount', 0,
    'renormalized', false,
    'components', components
  );

  BEGIN
    INSERT INTO evidence.dataset_snapshots (
      id, organization_id, workspace_id, known_at, policy,
      manifest, manifest_sha256, created_by
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120080',
      '068f47ac-19fc-7c92-ae91-0242ac120001',
      '068f47ac-19fc-7c92-ae91-0242ac120003',
      '2026-03-01T00:00:00Z', 'true_vintage',
      snapshot_manifest, snapshot_sha,
      '068f47ac-19fc-7c92-ae91-0242ac120005'
    );
    INSERT INTO evidence.economic_state_runs (
      id, organization_id, workspace_id, snapshot_id, snapshot_manifest_sha256,
      model_id, model_version, model_definition_sha256,
      model_artifact_id, model_artifact_sha256, geography_id,
      known_at, policy, status, score, missing_reason, completeness,
      source_coverage, confidence, independent_source_count, renormalized,
      result_manifest, result_manifest_sha256, calculated_by
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120081',
      '068f47ac-19fc-7c92-ae91-0242ac120001',
      '068f47ac-19fc-7c92-ae91-0242ac120003',
      '068f47ac-19fc-7c92-ae91-0242ac120080', snapshot_sha,
      model.id, model.model_version, model.definition_sha256,
      model.model_artifact_id, model.model_artifact_sha256,
      '038f47ac-19fc-7c92-ae91-0242ac120005',
      '2026-03-01T00:00:00Z', 'true_vintage',
      'insufficient_data', NULL, 'insufficient_component_coverage',
      '0', '0', '0', 0, false, result_manifest,
      encode(digest(convert_to(
        evidence.canonical_json(result_manifest), 'UTF8'
      ), 'sha256'), 'hex'),
      '068f47ac-19fc-7c92-ae91-0242ac120005'
    );
    INSERT INTO evidence.economic_state_component_results (
      organization_id, workspace_id, run_id, model_id,
      component_key, missing_reason
    ) VALUES
      (
        '068f47ac-19fc-7c92-ae91-0242ac120001',
        '068f47ac-19fc-7c92-ae91-0242ac120003',
        '068f47ac-19fc-7c92-ae91-0242ac120081', model.id,
        'gdp', 'source_missing'
      ),
      (
        '068f47ac-19fc-7c92-ae91-0242ac120001',
        '068f47ac-19fc-7c92-ae91-0242ac120003',
        '068f47ac-19fc-7c92-ae91-0242ac120081', model.id,
        'unemployment', 'not_collected'
      );

    EXECUTE 'SET CONSTRAINTS '
      'evidence.economic_state_runs_temporal_admission_deferred, '
      'evidence.economic_state_component_results_temporal_admission_deferred '
      'IMMEDIATE';
    RAISE EXCEPTION 'snapshot omission unexpectedly passed temporal admission';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS rejection_message = MESSAGE_TEXT;
    IF rejection_message NOT LIKE 'economic-state run % omits, supersedes,%' THEN
      RAISE;
    END IF;
  END;
  EXECUTE 'SET CONSTRAINTS '
    'evidence.economic_state_runs_temporal_admission_deferred, '
    'evidence.economic_state_component_results_temporal_admission_deferred '
    'DEFERRED';
END
$verify_snapshot_omission_rejected$;

-- Add a later observation that is independently eligible under the original
-- run PIT. Snapshot-local validation alone would still accept the old row.
INSERT INTO evidence.observations (
  id, series_id, release_id, period_start, period_end, value_numeric,
  status, parser_version, recorded_at, transformation_run_id
) VALUES (
  '068f47ac-19fc-7c92-ae91-0242ac120082',
  '038f47ac-19fc-7c92-ae91-0242ac120007',
  '068f47ac-19fc-7c92-ae91-0242ac120010',
  '2025-06-01T00:00:00Z', '2026-02-01T00:00:00Z', 80,
  'final', '1.0.0', '2026-02-01T00:00:02Z',
  '068f47ac-19fc-7c92-ae91-0242ac120009'
);
WITH candidate AS (
  SELECT
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
  WHERE observation.id = '068f47ac-19fc-7c92-ae91-0242ac120082'
)
INSERT INTO evidence.canonical_admissions (
  id, observation_id, transformation_run_id, release_id, basis,
  admission_manifest, admission_sha256, admitted_at
)
SELECT
  '068f47ac-19fc-7c92-ae91-0242ac120083',
  observation_id, transformation_run_id, release_id,
  'legacy_verified_v1', manifest,
  encode(digest(convert_to(
    evidence.canonical_json(manifest), 'UTF8'
  ), 'sha256'), 'hex'),
  completed_at
FROM candidate;

DO $verify_older_global_selection_rejected$
DECLARE
  original evidence.economic_state_runs%ROWTYPE;
  snapshot_manifest jsonb := jsonb_build_object(
    'knownAt', '2026-03-01T00:00:00Z',
    'observationIds', jsonb_build_array(
      '068f47ac-19fc-7c92-ae91-0242ac120011'
    ),
    'policy', 'true_vintage',
    'fixtureCase', 'older-selection'
  );
  snapshot_sha text;
  result_manifest jsonb;
  rejection_message text;
BEGIN
  IF evidence.economic_state_run_is_temporally_admitted(
    '068f47ac-19fc-7c92-ae91-0242ac120016'
  ) THEN
    RAISE EXCEPTION 'pre-fix older state run remained API-visible';
  END IF;

  SELECT * INTO STRICT original
  FROM evidence.economic_state_runs
  WHERE id = '068f47ac-19fc-7c92-ae91-0242ac120016';
  snapshot_sha := encode(digest(
    convert_to(snapshot_manifest::text, 'UTF8'), 'sha256'
  ), 'hex');
  result_manifest := jsonb_set(
    original.result_manifest,
    '{snapshotSha256}',
    to_jsonb(snapshot_sha)
  );

  BEGIN
    INSERT INTO evidence.dataset_snapshots (
      id, organization_id, workspace_id, known_at, policy,
      manifest, manifest_sha256, created_by
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120084',
      original.organization_id, original.workspace_id,
      original.known_at, original.policy,
      snapshot_manifest, snapshot_sha, original.calculated_by
    );
    INSERT INTO evidence.economic_state_runs (
      id, organization_id, workspace_id, snapshot_id, snapshot_manifest_sha256,
      model_id, model_version, model_definition_sha256,
      model_artifact_id, model_artifact_sha256, geography_id,
      known_at, policy, system_at, status, score, missing_reason,
      completeness, source_coverage, confidence, independent_source_count,
      renormalized, result_manifest, result_manifest_sha256, calculated_by
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120085',
      original.organization_id, original.workspace_id,
      '068f47ac-19fc-7c92-ae91-0242ac120084', snapshot_sha,
      original.model_id, original.model_version, original.model_definition_sha256,
      original.model_artifact_id, original.model_artifact_sha256,
      original.geography_id, original.known_at, original.policy,
      original.system_at, original.status, original.score, original.missing_reason,
      original.completeness, original.source_coverage, original.confidence,
      original.independent_source_count, original.renormalized,
      result_manifest,
      encode(digest(convert_to(
        evidence.canonical_json(result_manifest), 'UTF8'
      ), 'sha256'), 'hex'),
      original.calculated_by
    );
    INSERT INTO evidence.economic_state_component_results (
      organization_id, workspace_id, run_id, model_id, component_key,
      observation_id, source_id, source_dataset_id, license_review_id,
      source_admission_event_id, raw_value, normalized_value, contribution,
      missing_reason, quality, quality_evidence_sha256,
      legal_evidence_manifest, legal_evidence_sha256
    )
    SELECT
      result.organization_id, result.workspace_id,
      '068f47ac-19fc-7c92-ae91-0242ac120085', result.model_id,
      result.component_key, result.observation_id, result.source_id,
      result.source_dataset_id, result.license_review_id,
      result.source_admission_event_id, result.raw_value,
      result.normalized_value, result.contribution, result.missing_reason,
      result.quality, result.quality_evidence_sha256,
      result.legal_evidence_manifest, result.legal_evidence_sha256
    FROM evidence.economic_state_component_results result
    WHERE result.run_id = original.id
    ORDER BY result.component_key COLLATE "C";

    EXECUTE 'SET CONSTRAINTS '
      'evidence.economic_state_runs_temporal_admission_deferred, '
      'evidence.economic_state_component_results_temporal_admission_deferred '
      'IMMEDIATE';
    RAISE EXCEPTION 'older globally superseded observation unexpectedly passed';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS rejection_message = MESSAGE_TEXT;
    IF rejection_message NOT LIKE 'economic-state run % omits, supersedes,%' THEN
      RAISE;
    END IF;
  END;
  EXECUTE 'SET CONSTRAINTS '
    'evidence.economic_state_runs_temporal_admission_deferred, '
    'evidence.economic_state_component_results_temporal_admission_deferred '
    'DEFERRED';
END
$verify_older_global_selection_rejected$;

DO $verify_globally_latest_selection_accepted$
DECLARE
  model evidence.economic_state_models%ROWTYPE;
  snapshot_manifest jsonb := jsonb_build_object(
    'knownAt', '2026-03-01T00:00:00Z',
    'observationIds', jsonb_build_array(
      '068f47ac-19fc-7c92-ae91-0242ac120082'
    ),
    'policy', 'true_vintage',
    'fixtureCase', 'latest-selection'
  );
  snapshot_sha text;
  quality_score text;
  quality_sha text;
  legal_manifest jsonb;
  legal_sha text;
  components jsonb;
  result_manifest jsonb;
  accepted boolean := false;
BEGIN
  SELECT * INTO STRICT model
  FROM evidence.economic_state_models
  WHERE id = '068f47ac-19fc-7c92-ae91-0242ac120014';
  SELECT quality.quality_score, quality.quality_sha256
  INTO STRICT quality_score, quality_sha
  FROM evidence.economic_state_observation_quality(
    '068f47ac-19fc-7c92-ae91-0242ac120082'
  ) quality;
  legal_manifest := evidence.economic_state_legal_evidence(
    '068f47ac-19fc-7c92-ae91-0242ac120001',
    '068f47ac-19fc-7c92-ae91-0242ac120082',
    '038f47ac-19fc-7c92-ae91-0242ac120002',
    '038f47ac-19fc-7c92-ae91-0242ac120003',
    '038f47ac-19fc-7c92-ae91-0242ac120001',
    '038f47ac-19fc-7c92-ae91-0242ac120004'
  );
  legal_sha := encode(digest(convert_to(
    evidence.canonical_json(legal_manifest), 'UTF8'
  ), 'sha256'), 'hex');
  snapshot_sha := encode(digest(
    convert_to(snapshot_manifest::text, 'UTF8'), 'sha256'
  ), 'hex');
  components := jsonb_build_array(
    jsonb_build_object(
      'componentKey', 'gdp',
      'observationId', '068f47ac-19fc-7c92-ae91-0242ac120082',
      'sourceId', '038f47ac-19fc-7c92-ae91-0242ac120002',
      'sourceDatasetId', '038f47ac-19fc-7c92-ae91-0242ac120003',
      'licenseReviewId', '038f47ac-19fc-7c92-ae91-0242ac120001',
      'sourceAdmissionDecisionId', '038f47ac-19fc-7c92-ae91-0242ac120004',
      'rawValue', '80', 'normalizedValue', '0.8', 'contribution', '0.48',
      'missingReason', NULL, 'quality', quality_score,
      'qualityEvidenceSha256', quality_sha,
      'legalEvidenceSha256', legal_sha
    ),
    jsonb_build_object(
      'componentKey', 'unemployment', 'observationId', NULL, 'sourceId', NULL,
      'sourceDatasetId', NULL, 'licenseReviewId', NULL,
      'sourceAdmissionDecisionId', NULL,
      'rawValue', NULL, 'normalizedValue', NULL, 'contribution', NULL,
      'missingReason', 'not_collected', 'quality', NULL,
      'qualityEvidenceSha256', NULL, 'legalEvidenceSha256', NULL
    )
  );
  result_manifest := jsonb_build_object(
    'schemaVersion', 2,
    'modelId', model.id::text,
    'modelKey', model.model_key,
    'modelVersion', model.model_version,
    'modelArtifactId', model.model_artifact_id::text,
    'modelArtifactSha256', model.model_artifact_sha256,
    'dimension', model.dimension,
    'geographyId', '038f47ac-19fc-7c92-ae91-0242ac120005',
    'knownAt', '2026-03-01T00:00:00Z',
    'policy', 'true_vintage',
    'snapshotSha256', snapshot_sha,
    'status', 'partial', 'score', '80', 'missingReason', NULL,
    'completeness', '0.6', 'sourceCoverage', '0.5', 'confidence', '0.6',
    'distinctSourceCount', 1, 'renormalized', true,
    'components', components
  );

  BEGIN
    INSERT INTO evidence.dataset_snapshots (
      id, organization_id, workspace_id, known_at, policy,
      manifest, manifest_sha256, created_by
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120086',
      '068f47ac-19fc-7c92-ae91-0242ac120001',
      '068f47ac-19fc-7c92-ae91-0242ac120003',
      '2026-03-01T00:00:00Z', 'true_vintage',
      snapshot_manifest, snapshot_sha,
      '068f47ac-19fc-7c92-ae91-0242ac120005'
    );
    INSERT INTO evidence.economic_state_runs (
      id, organization_id, workspace_id, snapshot_id, snapshot_manifest_sha256,
      model_id, model_version, model_definition_sha256,
      model_artifact_id, model_artifact_sha256, geography_id,
      known_at, policy, status, score, completeness, source_coverage, confidence,
      independent_source_count, renormalized, result_manifest,
      result_manifest_sha256, calculated_by
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120087',
      '068f47ac-19fc-7c92-ae91-0242ac120001',
      '068f47ac-19fc-7c92-ae91-0242ac120003',
      '068f47ac-19fc-7c92-ae91-0242ac120086', snapshot_sha,
      model.id, model.model_version, model.definition_sha256,
      model.model_artifact_id, model.model_artifact_sha256,
      '038f47ac-19fc-7c92-ae91-0242ac120005',
      '2026-03-01T00:00:00Z', 'true_vintage', 'partial', '80',
      '0.6', '0.5', '0.6', 1, true, result_manifest,
      encode(digest(convert_to(
        evidence.canonical_json(result_manifest), 'UTF8'
      ), 'sha256'), 'hex'),
      '068f47ac-19fc-7c92-ae91-0242ac120005'
    );
    INSERT INTO evidence.economic_state_component_results (
      organization_id, workspace_id, run_id, model_id, component_key,
      observation_id, source_id, source_dataset_id, license_review_id,
      source_admission_event_id, raw_value, normalized_value, contribution,
      quality, quality_evidence_sha256, legal_evidence_manifest,
      legal_evidence_sha256
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120001',
      '068f47ac-19fc-7c92-ae91-0242ac120003',
      '068f47ac-19fc-7c92-ae91-0242ac120087', model.id, 'gdp',
      '068f47ac-19fc-7c92-ae91-0242ac120082',
      '038f47ac-19fc-7c92-ae91-0242ac120002',
      '038f47ac-19fc-7c92-ae91-0242ac120003',
      '038f47ac-19fc-7c92-ae91-0242ac120001',
      '038f47ac-19fc-7c92-ae91-0242ac120004',
      '80', '0.8', '0.48', quality_score, quality_sha,
      legal_manifest, legal_sha
    );
    INSERT INTO evidence.economic_state_component_results (
      organization_id, workspace_id, run_id, model_id,
      component_key, missing_reason
    ) VALUES (
      '068f47ac-19fc-7c92-ae91-0242ac120001',
      '068f47ac-19fc-7c92-ae91-0242ac120003',
      '068f47ac-19fc-7c92-ae91-0242ac120087', model.id,
      'unemployment', 'not_collected'
    );

    EXECUTE 'SET CONSTRAINTS '
      'evidence.economic_state_runs_temporal_admission_deferred, '
      'evidence.economic_state_component_results_temporal_admission_deferred '
      'IMMEDIATE';
    PERFORM evidence.validate_economic_state_run(
      '068f47ac-19fc-7c92-ae91-0242ac120087'
    );
    IF NOT evidence.economic_state_run_is_temporally_admitted(
      '068f47ac-19fc-7c92-ae91-0242ac120087'
    ) THEN
      RAISE EXCEPTION 'globally latest state run failed temporal admission';
    END IF;
    RAISE EXCEPTION 'accepted latest fixture rollback' USING ERRCODE = 'P2087';
  EXCEPTION WHEN SQLSTATE 'P2087' THEN
    accepted := true;
  END;
  EXECUTE 'SET CONSTRAINTS '
    'evidence.economic_state_runs_temporal_admission_deferred, '
    'evidence.economic_state_component_results_temporal_admission_deferred '
    'DEFERRED';
  IF NOT accepted THEN
    RAISE EXCEPTION 'globally latest selection was not accepted';
  END IF;
END
$verify_globally_latest_selection_accepted$;

DO $verify_legal_evidence_reproducibility$
DECLARE
  stored_manifest jsonb;
  stored_sha text;
  recomputed_manifest jsonb;
  recomputed_sha text;
BEGIN
  SELECT legal_evidence_manifest, legal_evidence_sha256
  INTO STRICT stored_manifest, stored_sha
  FROM evidence.economic_state_component_results
  WHERE run_id = '068f47ac-19fc-7c92-ae91-0242ac120016'
    AND component_key = 'gdp';

  recomputed_manifest := evidence.economic_state_legal_evidence(
    '068f47ac-19fc-7c92-ae91-0242ac120001',
    '068f47ac-19fc-7c92-ae91-0242ac120011',
    '038f47ac-19fc-7c92-ae91-0242ac120002',
    '038f47ac-19fc-7c92-ae91-0242ac120003',
    '038f47ac-19fc-7c92-ae91-0242ac120001',
    '038f47ac-19fc-7c92-ae91-0242ac120004'
  );
  recomputed_sha := encode(digest(
    convert_to(evidence.canonical_json(recomputed_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  IF recomputed_manifest IS DISTINCT FROM stored_manifest
    OR recomputed_sha IS DISTINCT FROM stored_sha
  THEN
    RAISE EXCEPTION 'stored legal evidence was not initially reproducible';
  END IF;

  INSERT INTO evidence.source_admission_events (
    id, source_id, dataset_id, decision, permitted_actions, license_review_id,
    reason, decided_by, decided_at
  ) VALUES (
    '068f47ac-19fc-7c92-ae91-0242ac120045',
    '038f47ac-19fc-7c92-ae91-0242ac120002',
    '038f47ac-19fc-7c92-ae91-0242ac120003',
    'suspended', '{}'::text[],
    '038f47ac-19fc-7c92-ae91-0242ac120001',
    'Verification-only suspension after the state calculation.',
    'Economic-state legal evidence verifier', clock_timestamp()
  );
  UPDATE evidence.sources
  SET license_status = 'pending', permitted_actions = '{}'::text[]
  WHERE id = '038f47ac-19fc-7c92-ae91-0242ac120002';

  recomputed_manifest := evidence.economic_state_legal_evidence(
    '068f47ac-19fc-7c92-ae91-0242ac120001',
    '068f47ac-19fc-7c92-ae91-0242ac120011',
    '038f47ac-19fc-7c92-ae91-0242ac120002',
    '038f47ac-19fc-7c92-ae91-0242ac120003',
    '038f47ac-19fc-7c92-ae91-0242ac120001',
    '038f47ac-19fc-7c92-ae91-0242ac120004'
  );
  recomputed_sha := encode(digest(
    convert_to(evidence.canonical_json(recomputed_manifest), 'UTF8'), 'sha256'
  ), 'hex');
  IF recomputed_manifest IS DISTINCT FROM stored_manifest
    OR recomputed_sha IS DISTINCT FROM stored_sha
  THEN
    RAISE EXCEPTION 'live source/admission changes rewrote historical legal evidence';
  END IF;
  PERFORM evidence.validate_economic_state_run(
    '068f47ac-19fc-7c92-ae91-0242ac120016'
  );
END
$verify_legal_evidence_reproducibility$;

DO $verify_immutability$
BEGIN
  BEGIN
    UPDATE evidence.economic_state_model_artifacts SET lifecycle_status = 'approved'
    WHERE id = '068f47ac-19fc-7c92-ae91-0242ac120040';
    RAISE EXCEPTION 'artifact mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    UPDATE evidence.economic_state_runs SET score = '74'
    WHERE id = '068f47ac-19fc-7c92-ae91-0242ac120016';
    RAISE EXCEPTION 'run mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    UPDATE evidence.economic_state_vectors SET evidence_coverage = '0.13'
    WHERE id = '068f47ac-19fc-7c92-ae91-0242ac120060';
    RAISE EXCEPTION 'state-vector mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    DELETE FROM evidence.economic_state_vector_dimensions
    WHERE vector_id = '068f47ac-19fc-7c92-ae91-0242ac120060'
      AND dimension = 'regime';
    RAISE EXCEPTION 'state-vector slot deletion unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    UPDATE evidence.license_reviews SET reviewed_by = 'forged reviewer'
    WHERE id = '038f47ac-19fc-7c92-ae91-0242ac120001';
    RAISE EXCEPTION 'license review mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    UPDATE evidence.source_admission_events SET reason = 'forged decision evidence'
    WHERE id = '038f47ac-19fc-7c92-ae91-0242ac120004';
    RAISE EXCEPTION 'source admission decision mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END
$verify_immutability$;

SET LOCAL ROLE economyos_app;
SET LOCAL app.organization_id = '068f47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '068f47ac-19fc-7c92-ae91-0242ac120005';
DO $verify_workspace_rls$
DECLARE
  own_count integer;
  sibling_count integer;
  foreign_count integer;
  own_vector_count integer;
  sibling_vector_count integer;
  own_slot_count integer;
  sibling_slot_count integer;
BEGIN
  -- This governed wrapper must continue to reach the now-private temporal
  -- predicate as its SECURITY DEFINER owner. The result may be false after the
  -- later-observation fixture, but the call itself must remain authorized.
  PERFORM evidence.economic_state_run_is_currently_servable(
    '068f47ac-19fc-7c92-ae91-0242ac120016', 'api'
  );

  SELECT count(*) INTO own_count FROM evidence.economic_state_models
  WHERE workspace_id = '068f47ac-19fc-7c92-ae91-0242ac120003';
  SELECT count(*) INTO sibling_count FROM evidence.economic_state_models
  WHERE workspace_id = '068f47ac-19fc-7c92-ae91-0242ac120030';
  SELECT count(*) INTO foreign_count FROM evidence.economic_state_models
  WHERE workspace_id = '068f47ac-19fc-7c92-ae91-0242ac120004';
  IF own_count <> 1 OR sibling_count <> 0 OR foreign_count <> 0 THEN
    RAISE EXCEPTION 'workspace state RLS failed: own=%, sibling=%, foreign=%',
      own_count, sibling_count, foreign_count;
  END IF;
  SELECT count(*) INTO own_vector_count FROM evidence.economic_state_vectors
  WHERE workspace_id = '068f47ac-19fc-7c92-ae91-0242ac120003';
  SELECT count(*) INTO sibling_vector_count FROM evidence.economic_state_vectors
  WHERE workspace_id = '068f47ac-19fc-7c92-ae91-0242ac120030';
  SELECT count(*) INTO own_slot_count
  FROM evidence.economic_state_vector_dimensions
  WHERE workspace_id = '068f47ac-19fc-7c92-ae91-0242ac120003';
  SELECT count(*) INTO sibling_slot_count
  FROM evidence.economic_state_vector_dimensions
  WHERE workspace_id = '068f47ac-19fc-7c92-ae91-0242ac120030';
  IF own_vector_count <> 1 OR sibling_vector_count <> 0
    OR own_slot_count <> 5 OR sibling_slot_count <> 0
  THEN
    RAISE EXCEPTION
      'workspace vector RLS failed: own=%, sibling=%, own_slots=%, sibling_slots=%',
      own_vector_count, sibling_vector_count, own_slot_count, sibling_slot_count;
  END IF;
END
$verify_workspace_rls$;

RESET ROLE;
SET LOCAL ROLE economyos_ingest;
DO $verify_state_lineage_rls$
DECLARE
  state_lineage_count integer;
BEGIN
  SELECT count(*) INTO state_lineage_count
  FROM evidence.lineage_edges
  WHERE to_type IN ('state_run', 'state_vector');
  IF state_lineage_count <> 3 THEN
    RAISE EXCEPTION 'workspace state-lineage RLS failed: visible=%',
      state_lineage_count;
  END IF;
END
$verify_state_lineage_rls$;

RESET ROLE;
ROLLBACK;
