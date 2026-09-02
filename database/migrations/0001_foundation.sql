CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id text PRIMARY KEY,
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'economyos_app') THEN
    CREATE ROLE economyos_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$roles$;

CREATE OR REPLACE FUNCTION app.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.organization_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_subject_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.subject_id', true), '')::uuid
$$;

CREATE TABLE app.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE app.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  classification text NOT NULL DEFAULT 'internal'
    CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (organization_id, slug),
  UNIQUE (organization_id, id)
);

CREATE TABLE app.subjects (
  id uuid PRIMARY KEY,
  issuer text NOT NULL CHECK (issuer ~ '^https://'),
  external_subject text NOT NULL CHECK (length(external_subject) BETWEEN 1 AND 512),
  kind text NOT NULL CHECK (kind IN ('human', 'service')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (issuer, external_subject)
);

CREATE TABLE app.organization_memberships (
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES app.subjects(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('viewer', 'analyst', 'steward', 'validator', 'admin')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, subject_id),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE TABLE app.workspace_memberships (
  organization_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  subject_id uuid NOT NULL REFERENCES app.subjects(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('viewer', 'analyst', 'steward', 'validator', 'admin')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, subject_id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE CASCADE,
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE TABLE app.role_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  workspace_id uuid,
  subject_id uuid NOT NULL REFERENCES app.subjects(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 128),
  resource_type text NOT NULL CHECK (length(resource_type) BETWEEN 1 AND 128),
  maximum_classification text CHECK (
    maximum_classification IS NULL OR
    maximum_classification IN ('public', 'internal', 'confidential', 'restricted')
  ),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE CASCADE,
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK (workspace_id IS NULL OR organization_id IS NOT NULL)
);

CREATE TABLE app.entitlement_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  contract_version text NOT NULL,
  capabilities jsonb NOT NULL CHECK (jsonb_typeof(capabilities) = 'object'),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  UNIQUE (organization_id, contract_version)
);

CREATE TABLE app.feature_flag_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE,
  flag_key text NOT NULL CHECK (flag_key ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  enabled boolean NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(conditions) = 'object'),
  actor_subject_id uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE audit.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid,
  actor_subject_id uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 128),
  resource_type text NOT NULL CHECK (length(resource_type) BETWEEN 1 AND 128),
  resource_id text,
  decision text NOT NULL CHECK (decision IN ('allow', 'deny', 'not_applicable')),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{1,127}$'),
  trace_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION audit.reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit events are append-only' USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER audit_events_reject_update_delete
BEFORE UPDATE OR DELETE ON audit.events
FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

CREATE INDEX organization_memberships_subject_idx
  ON app.organization_memberships (subject_id, organization_id);
CREATE INDEX workspace_memberships_subject_idx
  ON app.workspace_memberships (subject_id, organization_id, workspace_id);
CREATE INDEX role_grants_lookup_idx
  ON app.role_grants (organization_id, subject_id, workspace_id, action, resource_type);
CREATE INDEX audit_events_tenant_time_idx
  ON audit.events (organization_id, occurred_at DESC, id);

ALTER TABLE app.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE app.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE app.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.subjects FORCE ROW LEVEL SECURITY;
ALTER TABLE app.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.organization_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE app.workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workspace_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE app.role_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.role_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE app.entitlement_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.entitlement_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE app.feature_flag_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.feature_flag_events FORCE ROW LEVEL SECURITY;
ALTER TABLE audit.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.events FORCE ROW LEVEL SECURITY;

CREATE POLICY organizations_tenant ON app.organizations
  USING (id = app.current_organization_id())
  WITH CHECK (id = app.current_organization_id());
CREATE POLICY workspaces_tenant ON app.workspaces
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
CREATE POLICY subjects_self ON app.subjects
  USING (id = app.current_subject_id())
  WITH CHECK (id = app.current_subject_id());
CREATE POLICY organization_memberships_tenant ON app.organization_memberships
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
CREATE POLICY workspace_memberships_tenant ON app.workspace_memberships
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
CREATE POLICY role_grants_tenant ON app.role_grants
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
CREATE POLICY entitlement_snapshots_tenant ON app.entitlement_snapshots
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
CREATE POLICY feature_flag_events_tenant ON app.feature_flag_events
  USING (organization_id IS NULL OR organization_id = app.current_organization_id())
  WITH CHECK (organization_id IS NULL OR organization_id = app.current_organization_id());
CREATE POLICY audit_events_tenant ON audit.events
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());

REVOKE ALL ON SCHEMA app, audit FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA app, audit FROM PUBLIC;
GRANT USAGE ON SCHEMA app, audit TO economyos_app;
GRANT SELECT, INSERT, UPDATE ON app.organizations TO economyos_app;
GRANT SELECT, INSERT, UPDATE ON app.workspaces TO economyos_app;
GRANT SELECT ON app.subjects TO economyos_app;
GRANT SELECT ON app.organization_memberships, app.workspace_memberships, app.role_grants TO economyos_app;
GRANT SELECT ON app.entitlement_snapshots, app.feature_flag_events TO economyos_app;
GRANT SELECT, INSERT ON audit.events TO economyos_app;

COMMENT ON FUNCTION app.current_organization_id IS
  'Tenant ID set transaction-locally by the authenticated application boundary.';
COMMENT ON TABLE audit.events IS 'Append-only security and governance decision record.';
