BEGIN;

INSERT INTO app.organizations (id, slug, name) VALUES
  ('398f47ac-19fc-7c92-ae91-0242ac120001', 'behavioral-test-a', 'Research A'),
  ('398f47ac-19fc-7c92-ae91-0242ac120002', 'behavioral-test-b', 'Research B');
INSERT INTO app.workspaces (id, organization_id, slug, name) VALUES
  ('398f47ac-19fc-7c92-ae91-0242ac120003', '398f47ac-19fc-7c92-ae91-0242ac120001', 'research', 'Research A'),
  ('398f47ac-19fc-7c92-ae91-0242ac120004', '398f47ac-19fc-7c92-ae91-0242ac120002', 'research', 'Research B'),
  ('398f47ac-19fc-7c92-ae91-0242ac120009', '398f47ac-19fc-7c92-ae91-0242ac120001', 'sibling', 'Sibling');
INSERT INTO app.subjects (id, issuer, external_subject, kind) VALUES
  ('398f47ac-19fc-7c92-ae91-0242ac120005', 'https://identity.economyos.test/', 'research-author', 'human'),
  ('398f47ac-19fc-7c92-ae91-0242ac120006', 'https://identity.economyos.test/', 'research-viewer', 'human');
INSERT INTO app.organization_memberships (organization_id, subject_id, role, valid_from) VALUES
  ('398f47ac-19fc-7c92-ae91-0242ac120001', '398f47ac-19fc-7c92-ae91-0242ac120005', 'analyst', '2000-01-01Z'),
  ('398f47ac-19fc-7c92-ae91-0242ac120001', '398f47ac-19fc-7c92-ae91-0242ac120006', 'viewer', '2000-01-01Z');
INSERT INTO app.workspace_memberships (organization_id, workspace_id, subject_id, role, valid_from) VALUES
  ('398f47ac-19fc-7c92-ae91-0242ac120001', '398f47ac-19fc-7c92-ae91-0242ac120003', '398f47ac-19fc-7c92-ae91-0242ac120005', 'analyst', '2000-01-01Z'),
  ('398f47ac-19fc-7c92-ae91-0242ac120001', '398f47ac-19fc-7c92-ae91-0242ac120003', '398f47ac-19fc-7c92-ae91-0242ac120006', 'viewer', '2000-01-01Z');

DO $privileges$
BEGIN
  IF has_table_privilege('economyos_app', 'app.behavioral_allocation_research', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_table_privilege('economyos_ingest', 'app.behavioral_allocation_research', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_function_privilege('economyos_ingest', 'app.append_behavioral_allocation_research(uuid,uuid,text,timestamptz,jsonb,jsonb)', 'EXECUTE')
    OR EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      WHERE n.nspname = 'app' AND p.proname LIKE '%behavioral_allocation%'
        AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
    )
  THEN RAISE EXCEPTION 'research ledger has excessive runtime privileges'; END IF;
END
$privileges$;

SET LOCAL ROLE economyos_app;
SET LOCAL app.organization_id = '398f47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '398f47ac-19fc-7c92-ae91-0242ac120005';

DO $research_records$
DECLARE
  workspace uuid := '398f47ac-19fc-7c92-ae91-0242ac120003';
  identity uuid := '398f47ac-19fc-7c92-ae91-0242ac120007';
  first_record jsonb;
  replay jsonb;
  loaded jsonb;
  known timestamptz := '2020-01-01T00:00:00Z';
BEGIN
  first_record := app.append_behavioral_allocation_research(
    workspace, identity, 'behavioral_choice', known, '{"choice":"test"}', '{"value":"1"}'
  );
  replay := app.append_behavioral_allocation_research(
    workspace, identity, 'behavioral_choice', known, '{"choice":"test"}', '{"value":"1"}'
  );
  IF replay IS DISTINCT FROM first_record
    OR first_record->>'dataClass' IS DISTINCT FROM 'scenario'
    OR first_record->>'evidenceStatus' IS DISTINCT FROM 'caller_supplied_unverified'
    OR first_record->>'actorId' IS DISTINCT FROM '398f47ac-19fc-7c92-ae91-0242ac120005'
  THEN RAISE EXCEPTION 'research identity/replay/classification is incorrect'; END IF;
  loaded := app.get_behavioral_allocation_research(
    workspace, identity, known, (first_record->>'recordedAt')::timestamptz
  );
  IF loaded IS DISTINCT FROM first_record THEN RAISE EXCEPTION 'inclusive PIT boundary failed'; END IF;
  IF app.get_behavioral_allocation_research(workspace, identity, known - interval '1 microsecond', clock_timestamp()) IS NOT NULL
    OR app.get_behavioral_allocation_research(workspace, identity, known, (first_record->>'recordedAt')::timestamptz - interval '1 microsecond') IS NOT NULL
  THEN RAISE EXCEPTION 'research PIT cutoffs leaked a future record'; END IF;
  BEGIN
    PERFORM app.append_behavioral_allocation_research(workspace, identity, 'behavioral_choice', known, '{"choice":"changed"}', '{"value":"1"}');
    RAISE EXCEPTION 'changed replay was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM app.append_behavioral_allocation_research(workspace, identity, 'observation', known, '{}', '{}');
    RAISE EXCEPTION 'observation was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM app.append_behavioral_allocation_research(workspace, identity, 'behavioral_choice', clock_timestamp() + interval '1 day', '{}', '{}');
    RAISE EXCEPTION 'future knowledge was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM app.append_behavioral_allocation_research(workspace, identity, 'behavioral_choice', known, '[]', '{}');
    RAISE EXCEPTION 'non-object input was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM app.append_behavioral_allocation_research(workspace, identity, 'behavioral_choice', known, jsonb_build_object('large', repeat('x', 262145)), '{}');
    RAISE EXCEPTION 'oversized input was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM app.append_behavioral_allocation_research('398f47ac-19fc-7c92-ae91-0242ac120004', identity, 'behavioral_choice', known, '{}', '{}');
    RAISE EXCEPTION 'foreign tenant workspace accepted a write';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM app.append_behavioral_allocation_research('398f47ac-19fc-7c92-ae91-0242ac120009', identity, 'behavioral_choice', known, '{}', '{}');
    RAISE EXCEPTION 'unassigned sibling workspace accepted a write';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM 1 FROM app.behavioral_allocation_research;
    RAISE EXCEPTION 'direct ledger read allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$research_records$;

SET LOCAL app.subject_id = '398f47ac-19fc-7c92-ae91-0242ac120006';
DO $viewer_denied$
BEGIN
  BEGIN
    PERFORM app.append_behavioral_allocation_research('398f47ac-19fc-7c92-ae91-0242ac120003', '398f47ac-19fc-7c92-ae91-0242ac120008', 'material_balance', '2020-01-01Z', '{}', '{}');
    RAISE EXCEPTION 'viewer created a research execution';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$viewer_denied$;

SET LOCAL app.organization_id = '398f47ac-19fc-7c92-ae91-0242ac120002';
DO $tenant_denied$
BEGIN
  IF app.get_behavioral_allocation_research('398f47ac-19fc-7c92-ae91-0242ac120003', '398f47ac-19fc-7c92-ae91-0242ac120007', clock_timestamp(), clock_timestamp()) IS NOT NULL
  THEN RAISE EXCEPTION 'research read crossed tenant boundary'; END IF;
END
$tenant_denied$;

RESET ROLE;
DO $seal_and_immutability$
DECLARE
  item app.behavioral_allocation_research%ROWTYPE;
BEGIN
  SELECT * INTO STRICT item FROM app.behavioral_allocation_research
  WHERE id = '398f47ac-19fc-7c92-ae91-0242ac120007';
  IF item.manifest_sha256 IS DISTINCT FROM encode(public.digest(convert_to(evidence.canonical_json(item.manifest), 'UTF8'), 'sha256'), 'hex')
  THEN RAISE EXCEPTION 'research canonical digest mismatch'; END IF;
  BEGIN
    UPDATE app.behavioral_allocation_research SET result = '{}' WHERE id = item.id;
    RAISE EXCEPTION 'research mutation allowed';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  BEGIN
    DELETE FROM app.behavioral_allocation_research WHERE id = item.id;
    RAISE EXCEPTION 'research deletion allowed';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END
$seal_and_immutability$;

ROLLBACK;
