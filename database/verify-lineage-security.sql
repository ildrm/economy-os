BEGIN;

INSERT INTO app.organizations (id, slug, name) VALUES
  (
    '0b8f47ac-19fc-7c92-ae91-0242ac120001',
    'lineage-security-a', 'Lineage security A'
  ),
  (
    '0b8f47ac-19fc-7c92-ae91-0242ac120002',
    'lineage-security-b', 'Lineage security B'
  );
INSERT INTO app.workspaces (id, organization_id, slug, name) VALUES
  (
    '0b8f47ac-19fc-7c92-ae91-0242ac120003',
    '0b8f47ac-19fc-7c92-ae91-0242ac120001',
    'analysis', 'Lineage analysis A'
  ),
  (
    '0b8f47ac-19fc-7c92-ae91-0242ac120004',
    '0b8f47ac-19fc-7c92-ae91-0242ac120002',
    'analysis', 'Lineage analysis B'
  );
INSERT INTO app.subjects (id, issuer, external_subject, kind) VALUES (
  '0b8f47ac-19fc-7c92-ae91-0242ac120005',
  'https://identity.economyos.test/', 'lineage-security-verifier', 'service'
);
SET LOCAL app.subject_id = '0b8f47ac-19fc-7c92-ae91-0242ac120005';
INSERT INTO app.organization_memberships (
  organization_id, subject_id, role, valid_from
) VALUES
  (
    '0b8f47ac-19fc-7c92-ae91-0242ac120001',
    '0b8f47ac-19fc-7c92-ae91-0242ac120005',
    'analyst', '2026-01-01T00:00:00Z'
  ),
  (
    '0b8f47ac-19fc-7c92-ae91-0242ac120002',
    '0b8f47ac-19fc-7c92-ae91-0242ac120005',
    'analyst', '2026-01-01T00:00:00Z'
  );
INSERT INTO app.workspace_memberships (
  organization_id, workspace_id, subject_id, role, valid_from
) VALUES
  (
    '0b8f47ac-19fc-7c92-ae91-0242ac120001',
    '0b8f47ac-19fc-7c92-ae91-0242ac120003',
    '0b8f47ac-19fc-7c92-ae91-0242ac120005',
    'analyst', '2026-01-01T00:00:00Z'
  ),
  (
    '0b8f47ac-19fc-7c92-ae91-0242ac120002',
    '0b8f47ac-19fc-7c92-ae91-0242ac120004',
    '0b8f47ac-19fc-7c92-ae91-0242ac120005',
    'analyst', '2026-01-01T00:00:00Z'
  );

-- Valid one-component models give the visibility predicate one accessible and
-- one foreign state endpoint without relying on data from another verifier.
WITH targets(id, organization_id, workspace_id, artifact_key) AS (VALUES
  (
    '0b8f47ac-19fc-7c92-ae91-0242ac120006'::uuid,
    '0b8f47ac-19fc-7c92-ae91-0242ac120001'::uuid,
    '0b8f47ac-19fc-7c92-ae91-0242ac120003'::uuid,
    'lineage.boundary-a'
  ),
  (
    '0b8f47ac-19fc-7c92-ae91-0242ac120007'::uuid,
    '0b8f47ac-19fc-7c92-ae91-0242ac120002'::uuid,
    '0b8f47ac-19fc-7c92-ae91-0242ac120004'::uuid,
    'lineage.boundary-b'
  )
), definitions AS (
  SELECT
    targets.*,
    repeat('1', 64) AS code,
    repeat('2', 64) AS lockfile,
    repeat('3', 64) AS sbom,
    repeat('4', 64) AS environment,
    repeat('5', 64) AS configuration,
    repeat('6', 64) AS normalization,
    repeat('7', 64) AS assumptions,
    repeat('8', 64) AS approval
  FROM targets
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
  encode(digest(
    convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'
  ), 'hex'),
  '0b8f47ac-19fc-7c92-ae91-0242ac120005'
FROM manifests;

WITH targets(
  organization_id, workspace_id, artifact_id, model_id, model_key
) AS (VALUES
  (
    '0b8f47ac-19fc-7c92-ae91-0242ac120001'::uuid,
    '0b8f47ac-19fc-7c92-ae91-0242ac120003'::uuid,
    '0b8f47ac-19fc-7c92-ae91-0242ac120006'::uuid,
    '0b8f47ac-19fc-7c92-ae91-0242ac120008'::uuid,
    'lineage.boundary-a'
  ),
  (
    '0b8f47ac-19fc-7c92-ae91-0242ac120002'::uuid,
    '0b8f47ac-19fc-7c92-ae91-0242ac120004'::uuid,
    '0b8f47ac-19fc-7c92-ae91-0242ac120007'::uuid,
    '0b8f47ac-19fc-7c92-ae91-0242ac120009'::uuid,
    'lineage.boundary-b'
  )
), prepared AS (
  SELECT
    targets.*,
    artifact.artifact_sha256,
    encode(digest(
      convert_to(evidence.canonical_json('{}'::jsonb), 'UTF8'), 'sha256'
    ), 'hex') AS parser_configuration_sha256
  FROM targets
  JOIN evidence.economic_state_model_artifacts artifact
    ON artifact.id = targets.artifact_id
), with_feature AS (
  SELECT prepared.*,
    encode(digest(convert_to(evidence.canonical_json(
      evidence.economic_state_feature_contract(
        '038f47ac-19fc-7c92-ae91-0242ac120007',
        'lineage-security-verifier', '1.0.0', repeat('7', 64),
        parser_configuration_sha256
      )
    ), 'UTF8'), 'sha256'), 'hex') AS feature_sha256
  FROM prepared
), definitions AS (
  SELECT with_feature.*, jsonb_build_object(
    'schemaVersion', 2,
    'id', model_id::text,
    'key', model_key,
    'version', '1.0.0',
    'dimension', 'macroeconomic',
    'minimumCoverage', '1',
    'artifact', jsonb_build_object(
      'id', artifact_id::text,
      'sha256', artifact_sha256,
      'algorithmKey', 'weighted_bounded_composite',
      'algorithmVersion', '1.0.0',
      'configurationSha256', repeat('5', 64),
      'normalizationSha256', repeat('6', 64),
      'assumptionsSha256', repeat('7', 64),
      'approvalSha256', repeat('8', 64),
      'lifecycleStatus', 'research'
    ),
    'components', jsonb_build_array(jsonb_build_object(
      'key', 'gdp',
      'conceptId', '038f47ac-19fc-7c92-ae91-0242ac120006',
      'seriesId', '038f47ac-19fc-7c92-ae91-0242ac120007',
      'unitCode', 'USD',
      'frequency', 'annual',
      'seasonalAdjustment', 'unadjusted',
      'parser', jsonb_build_object(
        'name', 'lineage-security-verifier',
        'version', '1.0.0',
        'codeSha256', repeat('7', 64),
        'configurationSha256', parser_configuration_sha256
      ),
      'featureContractSha256', feature_sha256,
      'weight', '1',
      'polarity', 'positive',
      'lowerBound', '0',
      'upperBound', '100'
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
  model_id, organization_id, workspace_id, model_key, '1.0.0',
  'macroeconomic', '1', manifest,
  encode(digest(
    convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'
  ), 'hex'),
  artifact_id, artifact_sha256,
  '0b8f47ac-19fc-7c92-ae91-0242ac120005'
FROM definitions;

WITH targets(organization_id, workspace_id, model_id) AS (VALUES
  (
    '0b8f47ac-19fc-7c92-ae91-0242ac120001'::uuid,
    '0b8f47ac-19fc-7c92-ae91-0242ac120003'::uuid,
    '0b8f47ac-19fc-7c92-ae91-0242ac120008'::uuid
  ),
  (
    '0b8f47ac-19fc-7c92-ae91-0242ac120002'::uuid,
    '0b8f47ac-19fc-7c92-ae91-0242ac120004'::uuid,
    '0b8f47ac-19fc-7c92-ae91-0242ac120009'::uuid
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
  '038f47ac-19fc-7c92-ae91-0242ac120007',
  'USD', 'annual', 'unadjusted',
  'lineage-security-verifier', '1.0.0', repeat('7', 64), configuration.sha256,
  encode(digest(convert_to(evidence.canonical_json(
    evidence.economic_state_feature_contract(
      '038f47ac-19fc-7c92-ae91-0242ac120007',
      'lineage-security-verifier', '1.0.0', repeat('7', 64), configuration.sha256
    )
  ), 'UTF8'), 'sha256'), 'hex'),
  '1', 'positive', '0', '100'
FROM targets CROSS JOIN configuration;

SET CONSTRAINTS
  evidence.economic_state_models_validate_deferred,
  evidence.economic_state_model_components_validate_deferred
  IMMEDIATE;

-- A second global dataset supports a real ingest-role lineage insert without
-- adding unrelated ingestion workflow state.
INSERT INTO evidence.source_datasets (
  id, source_id, external_key, title, pit_quality, admission_status
) VALUES (
  '0b8f47ac-19fc-7c92-ae91-0242ac120010',
  '038f47ac-19fc-7c92-ae91-0242ac120002',
  'lineage-security-sentinel', 'Lineage security sentinel',
  'latest_revised_only', 'pending'
);

DO $verify_lineage_security_acl$
DECLARE
  unexpected_runtime_execute_count integer;
  unexpected_public_execute_count integer;
BEGIN
  WITH protected(function_oid) AS (VALUES
    ('evidence.lineage_endpoint_scope(text,uuid)'::regprocedure),
    ('evidence.lineage_endpoint_workspace(text,uuid)'::regprocedure),
    ('evidence.validate_lineage_edge()'::regprocedure),
    ('evidence.source_action_is_currently_admitted(uuid,uuid,uuid,text)'::regprocedure),
    ('evidence.economic_state_run_is_temporally_admitted(uuid)'::regprocedure)
  ), runtime_roles(role_name) AS (VALUES
    ('economyos_app'),
    ('economyos_ingest'),
    ('economyos_app_local'),
    ('economyos_ingest_local')
  )
  SELECT count(*) INTO unexpected_runtime_execute_count
  FROM protected
  CROSS JOIN runtime_roles
  WHERE has_function_privilege(
    runtime_roles.role_name, protected.function_oid, 'EXECUTE'
  );

  WITH protected(function_oid) AS (VALUES
    ('evidence.lineage_endpoint_scope(text,uuid)'::regprocedure),
    ('evidence.lineage_endpoint_workspace(text,uuid)'::regprocedure),
    ('evidence.validate_lineage_edge()'::regprocedure),
    ('evidence.source_action_is_currently_admitted(uuid,uuid,uuid,text)'::regprocedure),
    ('evidence.economic_state_run_is_temporally_admitted(uuid)'::regprocedure)
  )
  SELECT count(*) INTO unexpected_public_execute_count
  FROM pg_proc procedure
  JOIN protected ON protected.function_oid = procedure.oid
  CROSS JOIN LATERAL aclexplode(
    coalesce(procedure.proacl, acldefault('f', procedure.proowner))
  ) privilege
  WHERE privilege.grantee = 0
    AND privilege.privilege_type = 'EXECUTE';

  IF unexpected_runtime_execute_count <> 0
    OR unexpected_public_execute_count <> 0
    OR NOT has_function_privilege(
      'economyos_app_local',
      'evidence.lineage_edge_visible(uuid,text,uuid,text,uuid)', 'EXECUTE'
    )
    OR NOT has_function_privilege(
      'economyos_ingest_local',
      'evidence.lineage_edge_visible(uuid,text,uuid,text,uuid)', 'EXECUTE'
    )
  THEN
    RAISE EXCEPTION
      'lineage/internal-helper ACL boundary is incorrect: runtime=%, public=%',
      unexpected_runtime_execute_count, unexpected_public_execute_count;
  END IF;
END
$verify_lineage_security_acl$;

SET LOCAL ROLE economyos_app_local;
SET LOCAL app.organization_id = '0b8f47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '0b8f47ac-19fc-7c92-ae91-0242ac120005';

DO $verify_lineage_state_non_enumeration$
DECLARE
  own_visible boolean;
  foreign_visible boolean;
  missing_visible boolean;
BEGIN
  own_visible := evidence.lineage_edge_visible(
    '0b8f47ac-19fc-7c92-ae91-0242ac120001',
    'model', '0b8f47ac-19fc-7c92-ae91-0242ac120008',
    'dataset', '038f47ac-19fc-7c92-ae91-0242ac120003'
  );
  foreign_visible := evidence.lineage_edge_visible(
    '0b8f47ac-19fc-7c92-ae91-0242ac120001',
    'model', '0b8f47ac-19fc-7c92-ae91-0242ac120009',
    'dataset', '038f47ac-19fc-7c92-ae91-0242ac120003'
  );
  missing_visible := evidence.lineage_edge_visible(
    '0b8f47ac-19fc-7c92-ae91-0242ac120001',
    'model', '0b8f47ac-19fc-7c92-ae91-0242ac120099',
    'dataset', '038f47ac-19fc-7c92-ae91-0242ac120003'
  );

  IF NOT own_visible
    OR foreign_visible
    OR missing_visible
    OR foreign_visible IS DISTINCT FROM missing_visible
  THEN
    RAISE EXCEPTION
      'state lineage visibility leaked existence: own=%, foreign=%, missing=%',
      own_visible, foreign_visible, missing_visible;
  END IF;

  BEGIN
    PERFORM evidence.lineage_endpoint_workspace(
      'model', '0b8f47ac-19fc-7c92-ae91-0242ac120009'
    );
    RAISE EXCEPTION 'application role called the private workspace resolver';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- The governed release wrapper still reaches the now-private current legal
  -- predicate as its SECURITY DEFINER owner.
  IF NOT EXISTS (
    SELECT 1
    FROM evidence.governed_series_release_schedule(
      '038f47ac-19fc-7c92-ae91-0242ac120007', 'api'
    )
  ) THEN
    RAISE EXCEPTION 'governed serving wrapper lost its private legal helper';
  END IF;
END
$verify_lineage_state_non_enumeration$;

RESET ROLE;
SET LOCAL ROLE economyos_ingest_local;
SET LOCAL app.organization_id = '0b8f47ac-19fc-7c92-ae91-0242ac120001';

INSERT INTO evidence.lineage_edges (
  id, organization_id, from_type, from_id, to_type, to_id, relation
) VALUES (
  '0b8f47ac-19fc-7c92-ae91-0242ac120011', NULL,
  'dataset', '0b8f47ac-19fc-7c92-ae91-0242ac120010',
  'dataset', '038f47ac-19fc-7c92-ae91-0242ac120003',
  'derived_from'
);

DO $verify_lineage_trigger_owner_chain$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM evidence.lineage_edges
    WHERE id = '0b8f47ac-19fc-7c92-ae91-0242ac120011'
  ) THEN
    RAISE EXCEPTION 'lineage trigger or RLS owner chain rejected a valid edge';
  END IF;

  BEGIN
    PERFORM evidence.lineage_endpoint_scope(
      'dataset', '0b8f47ac-19fc-7c92-ae91-0242ac120010'
    );
    RAISE EXCEPTION 'ingest role called the private endpoint-scope resolver';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_lineage_trigger_owner_chain$;

RESET ROLE;
ROLLBACK;
