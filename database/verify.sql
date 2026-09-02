BEGIN;

INSERT INTO app.organizations (id, slug, name) VALUES
  ('018f47ac-19fc-7c92-ae91-0242ac120002', 'same-name-a', 'Same Name'),
  ('018f47ac-19fc-7c92-ae91-0242ac120003', 'same-name-b', 'Same Name');
INSERT INTO app.workspaces (id, organization_id, slug, name) VALUES
  ('018f47ac-19fc-7c92-ae91-0242ac120004', '018f47ac-19fc-7c92-ae91-0242ac120002', 'research', 'Research'),
  ('018f47ac-19fc-7c92-ae91-0242ac120005', '018f47ac-19fc-7c92-ae91-0242ac120003', 'research', 'Research');
INSERT INTO app.subjects (id, issuer, external_subject, kind) VALUES
  ('018f47ac-19fc-7c92-ae91-0242ac120006', 'https://identity.economyos.test/', 'subject-a', 'human'),
  ('018f47ac-19fc-7c92-ae91-0242ac120007', 'https://identity.economyos.test/', 'subject-b', 'human');
INSERT INTO app.organization_memberships (organization_id, subject_id, role, valid_from) VALUES
  ('018f47ac-19fc-7c92-ae91-0242ac120002', '018f47ac-19fc-7c92-ae91-0242ac120006', 'analyst', '2026-01-01T00:00:00Z'),
  ('018f47ac-19fc-7c92-ae91-0242ac120003', '018f47ac-19fc-7c92-ae91-0242ac120007', 'analyst', '2026-01-01T00:00:00Z');

SET LOCAL ROLE economyos_app;
SET LOCAL app.organization_id = '018f47ac-19fc-7c92-ae91-0242ac120002';
SET LOCAL app.subject_id = '018f47ac-19fc-7c92-ae91-0242ac120006';

DO $verify_rls$
DECLARE
  visible_organizations integer;
  visible_workspaces integer;
BEGIN
  SELECT count(*) INTO visible_organizations FROM app.organizations;
  SELECT count(*) INTO visible_workspaces FROM app.workspaces;
  IF visible_organizations <> 1 OR visible_workspaces <> 1 THEN
    RAISE EXCEPTION 'RLS isolation failed: organizations=%, workspaces=%',
      visible_organizations, visible_workspaces;
  END IF;
  IF EXISTS (
    SELECT 1 FROM app.workspaces WHERE id = '018f47ac-19fc-7c92-ae91-0242ac120005'
  ) THEN
    RAISE EXCEPTION 'foreign tenant workspace was visible';
  END IF;
END
$verify_rls$;

INSERT INTO audit.events (
  organization_id,
  workspace_id,
  actor_subject_id,
  action,
  resource_type,
  resource_id,
  decision,
  reason_code,
  trace_id,
  occurred_at
) VALUES (
  '018f47ac-19fc-7c92-ae91-0242ac120002',
  '018f47ac-19fc-7c92-ae91-0242ac120004',
  '018f47ac-19fc-7c92-ae91-0242ac120006',
  'workspace.read',
  'workspace',
  '018f47ac-19fc-7c92-ae91-0242ac120004',
  'allow',
  'ALLOW',
  '018f47ac19fc7c92ae910242ac120008',
  '2026-01-01T00:30:00Z'
);

DO $verify_denial$
BEGIN
  BEGIN
    INSERT INTO audit.events (
      organization_id, actor_subject_id, action, resource_type,
      decision, reason_code, trace_id, occurred_at
    ) VALUES (
      '018f47ac-19fc-7c92-ae91-0242ac120003',
      '018f47ac-19fc-7c92-ae91-0242ac120006',
      'workspace.read', 'workspace', 'allow', 'ALLOW',
      '018f47ac19fc7c92ae910242ac120009', '2026-01-01T00:30:00Z'
    );
    RAISE EXCEPTION 'foreign tenant audit insert unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_denial$;

DO $verify_append_only_permission$
BEGIN
  BEGIN
    UPDATE audit.events
      SET action = 'workspace.update'
      WHERE trace_id = '018f47ac19fc7c92ae910242ac120008';
    RAISE EXCEPTION 'audit mutation unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_append_only_permission$;

RESET ROLE;

DO $verify_append_only_trigger$
BEGIN
  BEGIN
    UPDATE audit.events
      SET action = 'workspace.update'
      WHERE trace_id = '018f47ac19fc7c92ae910242ac120008';
    RAISE EXCEPTION 'audit mutation unexpectedly bypassed the trigger';
  EXCEPTION
    WHEN SQLSTATE '55000' THEN NULL;
  END;
END
$verify_append_only_trigger$;

ROLLBACK;
