BEGIN;

INSERT INTO app.organizations (id, slug, name) VALUES
  ('098f47ac-19fc-7c92-ae91-0242ac120001', 'authorization-a', 'Authorization A'),
  ('098f47ac-19fc-7c92-ae91-0242ac120002', 'authorization-b', 'Authorization B');
INSERT INTO app.workspaces (id, organization_id, slug, name, classification) VALUES
  (
    '098f47ac-19fc-7c92-ae91-0242ac120003',
    '098f47ac-19fc-7c92-ae91-0242ac120001',
    'confidential', 'Confidential workspace', 'confidential'
  ),
  (
    '098f47ac-19fc-7c92-ae91-0242ac120004',
    '098f47ac-19fc-7c92-ae91-0242ac120001',
    'sibling', 'Unassigned sibling', 'restricted'
  ),
  (
    '098f47ac-19fc-7c92-ae91-0242ac120005',
    '098f47ac-19fc-7c92-ae91-0242ac120002',
    'foreign', 'Foreign workspace', 'restricted'
  );
INSERT INTO app.subjects (id, issuer, external_subject, kind) VALUES
  (
    '098f47ac-19fc-7c92-ae91-0242ac120006',
    'https://identity.economyos.test/', 'authorization-active', 'human'
  ),
  (
    '098f47ac-19fc-7c92-ae91-0242ac120007',
    'https://identity.economyos.test/', 'authorization-expired', 'human'
  );
INSERT INTO app.organization_memberships (
  organization_id, subject_id, role, valid_from, valid_until
) VALUES
  (
    '098f47ac-19fc-7c92-ae91-0242ac120001',
    '098f47ac-19fc-7c92-ae91-0242ac120006',
    'analyst', '2026-01-01T00:00:00Z', NULL
  ),
  (
    '098f47ac-19fc-7c92-ae91-0242ac120001',
    '098f47ac-19fc-7c92-ae91-0242ac120007',
    'analyst', '2000-01-01T00:00:00Z', '2001-01-01T00:00:00Z'
  );
INSERT INTO app.workspace_memberships (
  organization_id, workspace_id, subject_id, role, valid_from
) VALUES (
  '098f47ac-19fc-7c92-ae91-0242ac120001',
  '098f47ac-19fc-7c92-ae91-0242ac120003',
  '098f47ac-19fc-7c92-ae91-0242ac120006',
  'analyst', '2026-01-01T00:00:00Z'
);

DO $verify_authorization_resolver_privileges$
DECLARE
  public_execute_count integer;
BEGIN
  IF NOT has_function_privilege(
      'economyos_app',
      'evidence.authorization_series_classification(uuid)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'economyos_app',
      'evidence.authorization_observation_classification(uuid)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'economyos_app',
      'evidence.authorization_economic_state_classification(uuid)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'economyos_app',
      'evidence.economic_state_run_is_currently_servable(uuid,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_app',
      'evidence.authorization_organization_context_is_active()',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_ingest',
      'evidence.authorization_series_classification(uuid)',
      'EXECUTE'
    )
    OR NOT has_table_privilege('economyos_app', 'evidence.concepts', 'SELECT')
    OR NOT has_table_privilege('economyos_app', 'evidence.geographies', 'SELECT')
    OR has_table_privilege('economyos_app', 'evidence.sources', 'SELECT')
    OR has_table_privilege('economyos_app', 'evidence.source_datasets', 'SELECT')
    OR has_table_privilege('economyos_app', 'evidence.canonical_admissions', 'SELECT')
    OR has_table_privilege(
      'economyos_app', 'evidence.canonical_admission_evidence_sets', 'SELECT'
    )
  THEN
    RAISE EXCEPTION 'authorization resolver runtime privileges are incorrect';
  END IF;

  SELECT count(*) INTO public_execute_count
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  CROSS JOIN LATERAL aclexplode(
    coalesce(procedure.proacl, acldefault('f', procedure.proowner))
  ) privilege
  WHERE namespace.nspname = 'evidence'
    AND procedure.proname IN (
      'authorization_organization_context_is_active',
      'authorization_series_classification',
      'authorization_observation_classification',
      'authorization_economic_state_classification',
      'economic_state_run_is_currently_servable'
    )
    AND privilege.grantee = 0
    AND privilege.privilege_type = 'EXECUTE';
  IF public_execute_count <> 0 THEN
    RAISE EXCEPTION 'authorization resolver remains executable by PUBLIC';
  END IF;
END
$verify_authorization_resolver_privileges$;

SET LOCAL ROLE economyos_app;
SET LOCAL app.organization_id = '098f47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '098f47ac-19fc-7c92-ae91-0242ac120006';

DO $verify_authorization_resolvers$
DECLARE
  series_classification text;
  observation_classification text;
  workspace_classification text;
  sibling_classification text;
  foreign_classification text;
BEGIN
  SELECT evidence.authorization_series_classification(
    '038f47ac-19fc-7c92-ae91-0242ac120007'
  ) INTO series_classification;
  SELECT evidence.authorization_observation_classification(
    '098f47ac-19fc-7c92-ae91-0242ac120008'
  ) INTO observation_classification;
  SELECT evidence.authorization_economic_state_classification(
    '098f47ac-19fc-7c92-ae91-0242ac120003'
  ) INTO workspace_classification;
  SELECT evidence.authorization_economic_state_classification(
    '098f47ac-19fc-7c92-ae91-0242ac120004'
  ) INTO sibling_classification;
  SELECT evidence.authorization_economic_state_classification(
    '098f47ac-19fc-7c92-ae91-0242ac120005'
  ) INTO foreign_classification;

  IF series_classification IS DISTINCT FROM 'public'
    OR observation_classification IS NOT NULL
    OR workspace_classification IS DISTINCT FROM 'confidential'
    OR sibling_classification IS NOT NULL
    OR foreign_classification IS NOT NULL
  THEN
    RAISE EXCEPTION
      'authorization resolver result mismatch: series=%, observation=%, workspace=%, sibling=%, foreign=%',
      series_classification, observation_classification, workspace_classification,
      sibling_classification, foreign_classification;
  END IF;

  BEGIN
    PERFORM evidence.authorization_organization_context_is_active();
    RAISE EXCEPTION 'application role executed the private organization guard';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM evidence.series LIMIT 1;
    RAISE EXCEPTION 'application role regained direct canonical table access';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_authorization_resolvers$;

SET LOCAL app.subject_id = '098f47ac-19fc-7c92-ae91-0242ac120007';
DO $verify_expired_membership_denial$
BEGIN
  IF evidence.authorization_series_classification(
      '038f47ac-19fc-7c92-ae91-0242ac120007'
    ) IS NOT NULL
  THEN
    RAISE EXCEPTION 'expired organization membership resolved a series classification';
  END IF;
END
$verify_expired_membership_denial$;

RESET ROLE;
ROLLBACK;
