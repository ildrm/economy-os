-- Phase 14 collaboration and integration persistence. Scientific values stay in
-- their governed source artifacts; collaboration rows retain only immutable
-- pointers, commentary, policy receipts, and tamper-evident manifests.

CREATE OR REPLACE FUNCTION app.collaboration_json_digest(requested_value jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, evidence
AS $$
  SELECT encode(digest(
    convert_to(evidence.canonical_json(requested_value), 'UTF8'), 'sha256'
  ), 'hex')
$$;

CREATE OR REPLACE FUNCTION app.collaboration_exact_keys(
  requested_value jsonb,
  requested_keys text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT jsonb_typeof(requested_value) = 'object'
    AND coalesce((
      SELECT array_agg(key ORDER BY key COLLATE "C")
      FROM jsonb_object_keys(requested_value) key
    ), ARRAY[]::text[]) = coalesce((
      SELECT array_agg(key ORDER BY key COLLATE "C")
      FROM unnest(requested_keys) key
    ), ARRAY[]::text[])
$$;

CREATE OR REPLACE FUNCTION app.collaboration_valid_iso_instant(requested_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  parsed timestamptz;
BEGIN
  IF requested_value IS NULL OR requested_value !~
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,3})?Z$'
  THEN RETURN false; END IF;
  parsed := requested_value::timestamptz;
  RETURN isfinite(parsed);
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
  RETURN false;
END
$$;

CREATE OR REPLACE FUNCTION app.collaboration_valid_key(requested_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT requested_value IS NOT NULL
    AND requested_value ~ '^[a-z][a-z0-9_.-]{0,126}[a-z0-9]$'
$$;

CREATE OR REPLACE FUNCTION app.collaboration_valid_semver(requested_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT requested_value IS NOT NULL
    AND length(requested_value) BETWEEN 5 AND 128
    AND requested_value ~
      '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
$$;

CREATE OR REPLACE FUNCTION app.collaboration_valid_public_dns_name(requested_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT requested_value IS NOT NULL
    AND length(requested_value) BETWEEN 4 AND 253
    AND requested_value = lower(requested_value)
    AND requested_value ~
      '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
    AND requested_value <> 'localhost'
    AND requested_value !~ '\.(local|internal)$'
$$;

CREATE OR REPLACE FUNCTION app.collaboration_valid_https_url(requested_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, app
AS $$
DECLARE
  authority text;
  hostname text;
  port_text text;
BEGIN
  IF requested_value IS NULL OR length(requested_value) NOT BETWEEN 9 AND 2000
    OR requested_value !~ '^https://[^/?#]+(/[^#]*)?$'
    OR requested_value ~ '[@#]'
  THEN RETURN false; END IF;
  authority := substring(requested_value FROM '^https://([^/?#]+)');
  hostname := split_part(authority, ':', 1);
  IF authority ~ ':' THEN
    port_text := split_part(authority, ':', 2);
    IF authority !~ '^[^:]+:[0-9]{1,5}$'
      OR port_text::integer NOT BETWEEN 1 AND 65535
    THEN RETURN false; END IF;
  END IF;
  RETURN app.collaboration_valid_public_dns_name(hostname);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN false;
END
$$;

CREATE OR REPLACE FUNCTION app.collaboration_valid_text(
  requested_value text,
  requested_maximum integer DEFAULT 2000
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT requested_value IS NOT NULL
    AND requested_maximum BETWEEN 1 AND 10000
    AND requested_value = btrim(requested_value)
    AND length(requested_value) BETWEEN 1 AND requested_maximum
$$;

CREATE OR REPLACE FUNCTION app.collaboration_valid_integer_json(
  requested_value jsonb,
  requested_minimum bigint,
  requested_maximum bigint
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  rendered text;
  parsed numeric;
BEGIN
  IF requested_value IS NULL OR jsonb_typeof(requested_value) <> 'number'
    OR requested_minimum > requested_maximum
  THEN RETURN false; END IF;
  rendered := requested_value#>>'{}';
  IF length(rendered) > 32 OR rendered !~ '^-?(0|[1-9][0-9]*)$'
  THEN RETURN false; END IF;
  parsed := rendered::numeric;
  RETURN parsed BETWEEN requested_minimum AND requested_maximum;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN false;
END
$$;

CREATE OR REPLACE FUNCTION app.collaboration_valid_commentary(requested_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, app
AS $$
  SELECT app.collaboration_valid_text(requested_value, 10000)
    AND requested_value !~* '(^|[[:space:]])(buy|sell|invest|allocate)([[:space:]]|$)'
    AND requested_value !~* '\mrecommend(s|ed|ing|ation)?\M'
    AND requested_value !~* '\myou[[:space:]]+(should|must|ought[[:space:]]+to)\M'
    AND requested_value !~* '\mguaranteed[[:space:]]+returns?\M'
    AND requested_value !~* '\m(target|recommended)[[:space:]]+(allocation|portfolio[[:space:]]+weight)\M'
$$;

CREATE OR REPLACE FUNCTION app.collaboration_valid_key_array(
  requested_value jsonb,
  requested_minimum integer DEFAULT 1,
  requested_maximum integer DEFAULT 100
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, app
AS $$
DECLARE
  element jsonb;
  item text;
  prior text;
  seen text[] := ARRAY[]::text[];
BEGIN
  IF requested_value IS NULL OR jsonb_typeof(requested_value) <> 'array'
    OR jsonb_array_length(requested_value) NOT BETWEEN requested_minimum AND requested_maximum
  THEN RETURN false; END IF;
  FOR element IN SELECT value FROM jsonb_array_elements(requested_value) LOOP
    IF jsonb_typeof(element) <> 'string' THEN RETURN false; END IF;
    item := element#>>'{}';
    IF NOT app.collaboration_valid_key(item) OR item = ANY(seen)
      OR (prior IS NOT NULL AND item COLLATE "C" <= prior COLLATE "C")
    THEN RETURN false; END IF;
    seen := array_append(seen, item);
    prior := item;
  END LOOP;
  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION app.collaboration_valid_digest_array(
  requested_value jsonb,
  requested_minimum integer DEFAULT 1,
  requested_maximum integer DEFAULT 100
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  element jsonb;
  item text;
  prior text;
BEGIN
  IF requested_value IS NULL OR jsonb_typeof(requested_value) <> 'array'
    OR jsonb_array_length(requested_value) NOT BETWEEN requested_minimum AND requested_maximum
  THEN RETURN false; END IF;
  FOR element IN SELECT value FROM jsonb_array_elements(requested_value) LOOP
    IF jsonb_typeof(element) <> 'string' THEN RETURN false; END IF;
    item := element#>>'{}';
    IF item !~ '^[0-9a-f]{64}$'
      OR (prior IS NOT NULL AND item COLLATE "C" <= prior COLLATE "C")
    THEN RETURN false; END IF;
    prior := item;
  END LOOP;
  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION app.collaboration_assert_manifest(
  requested_value jsonb,
  requested_digest_key text,
  requested_maximum_bytes integer
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF requested_value IS NULL OR jsonb_typeof(requested_value) <> 'object'
    OR octet_length(requested_value::text) > requested_maximum_bytes
    OR requested_value->'schemaVersion' <> '1'::jsonb
    OR requested_value->>requested_digest_key !~ '^[0-9a-f]{64}$'
    OR app.collaboration_json_digest(requested_value - requested_digest_key)
      IS DISTINCT FROM requested_value->>requested_digest_key
  THEN
    RAISE EXCEPTION 'collaboration manifest is oversized, unsupported, or has an invalid digest'
      USING ERRCODE = '23514';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION app.collaboration_workspace_role_internal(
  requested_organization_id uuid,
  requested_workspace_id uuid,
  requested_subject_id uuid,
  requested_at timestamptz DEFAULT statement_timestamp()
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT workspace_membership.role
  FROM app.workspace_memberships workspace_membership
  JOIN app.organization_memberships organization_membership
    ON organization_membership.organization_id = workspace_membership.organization_id
    AND organization_membership.subject_id = workspace_membership.subject_id
  JOIN app.organizations organization
    ON organization.id = workspace_membership.organization_id
  JOIN app.workspaces workspace
    ON workspace.organization_id = workspace_membership.organization_id
    AND workspace.id = workspace_membership.workspace_id
  JOIN app.subjects subject ON subject.id = workspace_membership.subject_id
  WHERE workspace_membership.organization_id = requested_organization_id
    AND workspace_membership.workspace_id = requested_workspace_id
    AND workspace_membership.subject_id = requested_subject_id
    AND workspace_membership.valid_from <= requested_at
    AND (workspace_membership.valid_until IS NULL OR workspace_membership.valid_until > requested_at)
    AND organization_membership.valid_from <= requested_at
    AND (organization_membership.valid_until IS NULL OR organization_membership.valid_until > requested_at)
    AND organization.status = 'active' AND workspace.status = 'active' AND subject.status = 'active'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.collaboration_require_roles(
  requested_workspace_id uuid,
  requested_roles text[],
  requested_at timestamptz DEFAULT statement_timestamp()
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  caller_role text;
BEGIN
  IF caller_organization_id IS NULL OR caller_subject_id IS NULL
    OR requested_roles IS NULL OR cardinality(requested_roles) = 0
  THEN RAISE EXCEPTION 'collaboration tenant context or role set is missing'
    USING ERRCODE = '42501'; END IF;
  caller_role := app.collaboration_workspace_role_internal(
    caller_organization_id, requested_workspace_id, caller_subject_id, requested_at
  );
  IF caller_role IS NULL OR NOT caller_role = ANY(requested_roles) THEN
    RAISE EXCEPTION 'collaboration operation is not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN caller_role;
END
$$;

CREATE TABLE app.collaboration_record_events (
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  sequence bigint NOT NULL CHECK (sequence BETWEEN 1 AND 1000000000),
  previous_event_sha256 text CHECK (
    previous_event_sha256 IS NULL OR previous_event_sha256 ~ '^[0-9a-f]{64}$'
  ),
  event_sha256 text NOT NULL CHECK (event_sha256 ~ '^[0-9a-f]{64}$'),
  record_id uuid NOT NULL,
  record_version integer NOT NULL CHECK (record_version BETWEEN 1 AND 1000000),
  kind text NOT NULL CHECK (kind IN ('annotation','comment')),
  action text NOT NULL CHECK (action IN ('created','revised','resolved')),
  actor_id uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL CHECK (isfinite(occurred_at)),
  artifact_id uuid NOT NULL,
  artifact_type text NOT NULL CHECK (app.collaboration_valid_key(artifact_type)),
  artifact_version_sha256 text NOT NULL CHECK (artifact_version_sha256 ~ '^[0-9a-f]{64}$'),
  artifact_as_of timestamptz NOT NULL CHECK (isfinite(artifact_as_of)),
  point_in_time_grade text NOT NULL CHECK (
    point_in_time_grade IN ('exact_vintage','release_aware','retrieval_only')
  ),
  body text,
  content_class text NOT NULL DEFAULT 'non_authoritative_commentary'
    CHECK (content_class = 'non_authoritative_commentary'),
  authorization_decision_sha256 text NOT NULL
    CHECK (authorization_decision_sha256 ~ '^[0-9a-f]{64}$'),
  previous_record_event_sha256 text CHECK (
    previous_record_event_sha256 IS NULL OR previous_record_event_sha256 ~ '^[0-9a-f]{64}$'
  ),
  event_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(event_manifest) = 'object' AND octet_length(event_manifest::text) <= 262144
  ),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, workspace_id, sequence),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, event_sha256),
  UNIQUE (organization_id, workspace_id, record_id, record_version),
  CHECK (artifact_as_of <= occurred_at),
  CHECK (
    (action IN ('created','revised') AND body IS NOT NULL AND app.collaboration_valid_commentary(body))
    OR (action = 'resolved' AND body IS NULL)
  )
);

CREATE TABLE app.collaboration_record_citations (
  organization_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  event_sequence bigint NOT NULL,
  citation_ordinal smallint NOT NULL CHECK (citation_ordinal BETWEEN 1 AND 20),
  evidence_id uuid NOT NULL,
  evidence_version_sha256 text NOT NULL CHECK (evidence_version_sha256 ~ '^[0-9a-f]{64}$'),
  locator text NOT NULL CHECK (app.collaboration_valid_text(locator, 500)),
  available_at timestamptz NOT NULL CHECK (isfinite(available_at)),
  temporal_relation text NOT NULL CHECK (
    temporal_relation IN ('available_by_artifact_cutoff','subsequent_evidence')
  ),
  citation_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(citation_manifest) = 'object' AND octet_length(citation_manifest::text) <= 4096
  ),
  PRIMARY KEY (organization_id, workspace_id, event_sequence, citation_ordinal),
  FOREIGN KEY (organization_id, workspace_id, event_sequence)
    REFERENCES app.collaboration_record_events(organization_id, workspace_id, sequence)
    ON DELETE RESTRICT,
  UNIQUE (
    organization_id, workspace_id, event_sequence, evidence_id,
    evidence_version_sha256, locator, available_at, temporal_relation
  )
);

CREATE TABLE app.integration_api_credentials (
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  credential_id uuid NOT NULL,
  principal_id uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  scopes text[] NOT NULL CHECK (cardinality(scopes) BETWEEN 1 AND 100),
  secret_sha256 text NOT NULL CHECK (secret_sha256 ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz NOT NULL CHECK (isfinite(issued_at)),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at) AND expires_at > issued_at),
  revoked_at timestamptz CHECK (revoked_at IS NULL OR (isfinite(revoked_at) AND revoked_at >= issued_at)),
  credential_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(credential_manifest) = 'object' AND octet_length(credential_manifest::text) <= 65536
  ),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, workspace_id, credential_id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, manifest_sha256)
);

CREATE TABLE app.integration_quota_policies (
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  quota_id uuid NOT NULL,
  capability text NOT NULL CHECK (app.collaboration_valid_key(capability)),
  mode text NOT NULL CHECK (mode IN ('hard','soft')),
  limit_units bigint NOT NULL CHECK (limit_units BETWEEN 1 AND 1000000000000),
  window_starts_at timestamptz NOT NULL CHECK (isfinite(window_starts_at)),
  window_ends_at timestamptz NOT NULL CHECK (isfinite(window_ends_at) AND window_ends_at > window_starts_at),
  policy_version text NOT NULL CHECK (app.collaboration_valid_key(policy_version)),
  policy_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(policy_manifest) = 'object' AND octet_length(policy_manifest::text) <= 65536
  ),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, workspace_id, quota_id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, capability, window_starts_at, window_ends_at)
);

CREATE TABLE app.integration_quota_events (
  organization_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  quota_id uuid NOT NULL,
  sequence bigint NOT NULL CHECK (sequence BETWEEN 1 AND 1000000000),
  previous_event_sha256 text CHECK (
    previous_event_sha256 IS NULL OR previous_event_sha256 ~ '^[0-9a-f]{64}$'
  ),
  event_sha256 text NOT NULL CHECK (event_sha256 ~ '^[0-9a-f]{64}$'),
  capability text NOT NULL CHECK (app.collaboration_valid_key(capability)),
  action text NOT NULL CHECK (action IN ('reserved','settled','expired','reconciled')),
  reservation_id uuid,
  principal_id uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  quantity_units bigint NOT NULL CHECK (quantity_units BETWEEN 0 AND 1000000000000),
  adjustment_units bigint NOT NULL CHECK (adjustment_units BETWEEN -1000000000000 AND 1000000000000),
  idempotency_key text CHECK (
    idempotency_key IS NULL OR app.collaboration_valid_text(idempotency_key, 200)
  ),
  request_sha256 text CHECK (request_sha256 IS NULL OR request_sha256 ~ '^[0-9a-f]{64}$'),
  usage_event_id uuid,
  reason text CHECK (reason IS NULL OR app.collaboration_valid_text(reason, 1000)),
  occurred_at timestamptz NOT NULL CHECK (isfinite(occurred_at)),
  reservation_expires_at timestamptz CHECK (
    reservation_expires_at IS NULL OR isfinite(reservation_expires_at)
  ),
  authorization_decision_sha256 text NOT NULL
    CHECK (authorization_decision_sha256 ~ '^[0-9a-f]{64}$'),
  total_consumed_units bigint NOT NULL CHECK (total_consumed_units BETWEEN 0 AND 1000000000000),
  total_outstanding_units bigint NOT NULL CHECK (total_outstanding_units BETWEEN 0 AND 1000000000000),
  event_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(event_manifest) = 'object' AND octet_length(event_manifest::text) <= 131072
  ),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, workspace_id, quota_id, sequence),
  FOREIGN KEY (organization_id, workspace_id, quota_id)
    REFERENCES app.integration_quota_policies(organization_id, workspace_id, quota_id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, quota_id, event_sha256),
  UNIQUE (organization_id, workspace_id, quota_id, reservation_id, action),
  UNIQUE (organization_id, workspace_id, quota_id, principal_id, idempotency_key),
  UNIQUE (organization_id, workspace_id, quota_id, usage_event_id)
);

CREATE TABLE app.integration_webhook_endpoints (
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  endpoint_id uuid NOT NULL,
  url text NOT NULL CHECK (length(url) BETWEEN 9 AND 2000),
  event_types text[] NOT NULL CHECK (cardinality(event_types) BETWEEN 1 AND 100),
  signing_key_id text NOT NULL CHECK (app.collaboration_valid_key(signing_key_id)),
  max_attempts smallint NOT NULL CHECK (max_attempts BETWEEN 1 AND 20),
  base_retry_seconds integer NOT NULL CHECK (base_retry_seconds BETWEEN 1 AND 86400),
  max_retry_seconds integer NOT NULL CHECK (
    max_retry_seconds BETWEEN base_retry_seconds AND 604800
  ),
  active boolean NOT NULL,
  endpoint_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(endpoint_manifest) = 'object' AND octet_length(endpoint_manifest::text) <= 131072
  ),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, workspace_id, endpoint_id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, manifest_sha256)
);

CREATE TABLE app.integration_webhook_delivery_events (
  organization_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  endpoint_id uuid NOT NULL,
  sequence bigint NOT NULL CHECK (sequence BETWEEN 1 AND 1000000000),
  previous_event_sha256 text CHECK (
    previous_event_sha256 IS NULL OR previous_event_sha256 ~ '^[0-9a-f]{64}$'
  ),
  event_sha256 text NOT NULL CHECK (event_sha256 ~ '^[0-9a-f]{64}$'),
  delivery_id uuid NOT NULL,
  envelope_sha256 text NOT NULL CHECK (envelope_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (
    status IN ('queued','delivering','retry_scheduled','delivered','dead_lettered')
  ),
  attempt smallint NOT NULL CHECK (attempt BETWEEN 0 AND 20),
  occurred_at timestamptz NOT NULL CHECK (isfinite(occurred_at)),
  retry_at timestamptz CHECK (retry_at IS NULL OR isfinite(retry_at)),
  outcome_code text CHECK (outcome_code IS NULL OR app.collaboration_valid_key(outcome_code)),
  event_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(event_manifest) = 'object' AND octet_length(event_manifest::text) <= 131072
  ),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, workspace_id, endpoint_id, sequence),
  FOREIGN KEY (organization_id, workspace_id, endpoint_id)
    REFERENCES app.integration_webhook_endpoints(organization_id, workspace_id, endpoint_id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, endpoint_id, event_sha256),
  UNIQUE (organization_id, workspace_id, endpoint_id, delivery_id, status, attempt)
);

CREATE TABLE app.integration_extension_manifests (
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  extension_id uuid NOT NULL,
  extension_version text NOT NULL CHECK (app.collaboration_valid_semver(extension_version)),
  publisher_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('connector','model')),
  extension_api_version text NOT NULL CHECK (app.collaboration_valid_semver(extension_api_version)),
  artifact_sha256 text NOT NULL CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  runtime text NOT NULL CHECK (runtime IN ('wasm','oci_sandbox')),
  created_at timestamptz NOT NULL CHECK (isfinite(created_at)),
  extension_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(extension_manifest) = 'object' AND octet_length(extension_manifest::text) <= 262144
  ),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, workspace_id, extension_id, extension_version),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, manifest_sha256)
);

CREATE TABLE app.integration_extension_certifications (
  organization_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  certification_id uuid NOT NULL,
  extension_id uuid NOT NULL,
  extension_version text NOT NULL,
  extension_manifest_sha256 text NOT NULL CHECK (extension_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  certified_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  issued_at timestamptz NOT NULL CHECK (isfinite(issued_at)),
  valid_until timestamptz NOT NULL CHECK (isfinite(valid_until) AND valid_until > issued_at),
  compatibility_contract_sha256 text NOT NULL CHECK (compatibility_contract_sha256 ~ '^[0-9a-f]{64}$'),
  compatibility_decision_sha256 text NOT NULL CHECK (compatibility_decision_sha256 ~ '^[0-9a-f]{64}$'),
  isolation_profile_sha256 text NOT NULL CHECK (isolation_profile_sha256 ~ '^[0-9a-f]{64}$'),
  certification_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(certification_manifest) = 'object'
    AND octet_length(certification_manifest::text) <= 262144
  ),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, workspace_id, certification_id),
  FOREIGN KEY (organization_id, workspace_id, extension_id, extension_version)
    REFERENCES app.integration_extension_manifests(
      organization_id, workspace_id, extension_id, extension_version
    ) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, manifest_sha256)
);

CREATE TABLE app.integration_extension_revocations (
  organization_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  revocation_id uuid NOT NULL,
  extension_id uuid NOT NULL,
  extension_version text NOT NULL,
  revoked_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  revoked_at timestamptz NOT NULL CHECK (isfinite(revoked_at)),
  reason text NOT NULL CHECK (app.collaboration_valid_text(reason, 1000)),
  revocation_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(revocation_manifest) = 'object' AND octet_length(revocation_manifest::text) <= 131072
  ),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, workspace_id, revocation_id),
  FOREIGN KEY (organization_id, workspace_id, extension_id, extension_version)
    REFERENCES app.integration_extension_manifests(
      organization_id, workspace_id, extension_id, extension_version
    ) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, extension_id, extension_version),
  UNIQUE (organization_id, workspace_id, manifest_sha256)
);

CREATE TABLE app.developer_portal_entries (
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  integration_id uuid NOT NULL,
  owner_principal_id uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  asset_kind text NOT NULL CHECK (asset_kind IN ('sdk','cli','webhook','connector','model_extension')),
  slug text NOT NULL CHECK (app.collaboration_valid_key(slug)),
  display_name text NOT NULL CHECK (app.collaboration_valid_text(display_name, 160)),
  documentation_path text NOT NULL CHECK (length(documentation_path) BETWEEN 25 AND 512),
  artifact_sha256 text NOT NULL CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  compatibility_contract_sha256 text NOT NULL CHECK (compatibility_contract_sha256 ~ '^[0-9a-f]{64}$'),
  extension_certification_sha256 text CHECK (
    extension_certification_sha256 IS NULL OR extension_certification_sha256 ~ '^[0-9a-f]{64}$'
  ),
  status text NOT NULL CHECK (status IN ('draft','published','suspended','retired')),
  issued_at timestamptz NOT NULL CHECK (isfinite(issued_at)),
  entry_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(entry_manifest) = 'object' AND octet_length(entry_manifest::text) <= 262144
  ),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, workspace_id, entry_id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, integration_id, slug, status),
  UNIQUE (organization_id, workspace_id, manifest_sha256),
  CHECK (documentation_path = '/developers/integrations/' || slug),
  CHECK (
    (asset_kind IN ('connector','model_extension') AND status = 'published'
      AND extension_certification_sha256 IS NOT NULL)
    OR (asset_kind IN ('connector','model_extension') AND status <> 'published')
    OR (asset_kind IN ('sdk','cli','webhook') AND extension_certification_sha256 IS NULL)
  )
);

CREATE TABLE audit.integration_events (
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  sequence bigint NOT NULL CHECK (sequence BETWEEN 1 AND 1000000000),
  previous_event_sha256 text CHECK (
    previous_event_sha256 IS NULL OR previous_event_sha256 ~ '^[0-9a-f]{64}$'
  ),
  event_sha256 text NOT NULL CHECK (event_sha256 ~ '^[0-9a-f]{64}$'),
  audit_event_id uuid NOT NULL,
  principal_id uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  integration_id uuid NOT NULL,
  action text NOT NULL CHECK (app.collaboration_valid_key(action)),
  resource_type text NOT NULL CHECK (app.collaboration_valid_key(resource_type)),
  resource_id uuid NOT NULL,
  resource_version_sha256 text NOT NULL CHECK (resource_version_sha256 ~ '^[0-9a-f]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('allowed','denied','succeeded','failed')),
  reason_code text NOT NULL CHECK (app.collaboration_valid_key(reason_code)),
  policy_version text NOT NULL CHECK (app.collaboration_valid_key(policy_version)),
  trace_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL CHECK (isfinite(occurred_at)),
  classification text NOT NULL CHECK (
    classification IN ('public','internal','confidential','restricted')
  ),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  record_class text NOT NULL DEFAULT 'integration_audit_pointer_only'
    CHECK (record_class = 'integration_audit_pointer_only'),
  audit_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(audit_manifest) = 'object' AND octet_length(audit_manifest::text) <= 262144
  ),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, workspace_id, sequence),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, workspace_id, audit_event_id),
  UNIQUE (organization_id, workspace_id, event_sha256)
);

CREATE OR REPLACE FUNCTION app.append_collaboration_record_event(
  requested_workspace_id uuid,
  requested_manifest jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  requested_sequence bigint;
  requested_record_id uuid;
  requested_record_version integer;
  requested_kind text;
  requested_action text;
  requested_occurred_at timestamptz;
  requested_event_sha256 text;
  requested_previous_event_sha256 text;
  requested_previous_record_sha256 text;
  requested_body text;
  artifact jsonb;
  citation jsonb;
  citation_index bigint;
  artifact_as_of timestamptz;
  head app.collaboration_record_events%ROWTYPE;
  prior app.collaboration_record_events%ROWTYPE;
  existing app.collaboration_record_events%ROWTYPE;
BEGIN
  PERFORM app.collaboration_require_roles(
    requested_workspace_id, ARRAY['analyst','steward','validator','admin']
  );
  PERFORM app.collaboration_assert_manifest(requested_manifest, 'eventSha256', 262144);
  IF NOT app.collaboration_exact_keys(requested_manifest, ARRAY[
      'schemaVersion','sequence','previousEventSha256','recordId','recordVersion','kind','action',
      'organizationId','workspaceId','actorId','occurredAt','artifact','citations','body',
      'contentClass','authorizationDecisionSha256','previousRecordEventSha256','eventSha256'
    ])
    OR requested_manifest->>'organizationId' IS DISTINCT FROM caller_organization_id::text
    OR requested_manifest->>'workspaceId' IS DISTINCT FROM requested_workspace_id::text
    OR requested_manifest->>'actorId' IS DISTINCT FROM caller_subject_id::text
    OR requested_manifest->>'contentClass' <> 'non_authoritative_commentary'
    OR requested_manifest->>'authorizationDecisionSha256' !~ '^[0-9a-f]{64}$'
    OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'occurredAt')
    OR NOT app.collaboration_valid_integer_json(
      requested_manifest->'sequence', 1, 1000000000
    )
    OR NOT app.collaboration_valid_integer_json(
      requested_manifest->'recordVersion', 1, 1000000
    )
  THEN RAISE EXCEPTION 'collaboration event scope or shape is invalid'
    USING ERRCODE = '23514'; END IF;
  requested_sequence := (requested_manifest->>'sequence')::bigint;
  requested_record_id := (requested_manifest->>'recordId')::uuid;
  requested_record_version := (requested_manifest->>'recordVersion')::integer;
  requested_kind := requested_manifest->>'kind';
  requested_action := requested_manifest->>'action';
  requested_occurred_at := (requested_manifest->>'occurredAt')::timestamptz;
  requested_event_sha256 := requested_manifest->>'eventSha256';
  requested_previous_event_sha256 := requested_manifest->>'previousEventSha256';
  requested_previous_record_sha256 := requested_manifest->>'previousRecordEventSha256';
  requested_body := requested_manifest->>'body';
  artifact := requested_manifest->'artifact';
  IF requested_kind NOT IN ('annotation','comment')
    OR requested_action NOT IN ('created','revised','resolved')
    OR requested_sequence NOT BETWEEN 1 AND 1000000000
    OR requested_record_version NOT BETWEEN 1 AND 1000000
    OR NOT app.collaboration_exact_keys(artifact, ARRAY[
      'organizationId','workspaceId','artifactId','artifactType','artifactVersionSha256',
      'asOf','pointInTimeGrade'
    ])
    OR artifact->>'organizationId' IS DISTINCT FROM caller_organization_id::text
    OR artifact->>'workspaceId' IS DISTINCT FROM requested_workspace_id::text
    OR NOT app.collaboration_valid_key(artifact->>'artifactType')
    OR artifact->>'artifactVersionSha256' !~ '^[0-9a-f]{64}$'
    OR NOT app.collaboration_valid_iso_instant(artifact->>'asOf')
    OR artifact->>'pointInTimeGrade' NOT IN ('exact_vintage','release_aware','retrieval_only')
    OR jsonb_typeof(requested_manifest->'citations') <> 'array'
    OR jsonb_array_length(requested_manifest->'citations') NOT BETWEEN 1 AND 20
  THEN RAISE EXCEPTION 'collaboration artifact or citation collection is invalid'
    USING ERRCODE = '23514'; END IF;
  artifact_as_of := (artifact->>'asOf')::timestamptz;
  IF artifact_as_of > requested_occurred_at
    OR (requested_action = 'resolved' AND jsonb_typeof(requested_manifest->'body') <> 'null')
    OR (requested_action IN ('created','revised')
      AND (jsonb_typeof(requested_manifest->'body') <> 'string'
        OR NOT app.collaboration_valid_commentary(requested_body)))
  THEN RAISE EXCEPTION 'collaboration timing or commentary boundary is invalid'
    USING ERRCODE = '23514'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    caller_organization_id::text || ':' || requested_workspace_id::text, 35001
  ));
  SELECT * INTO existing FROM app.collaboration_record_events candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.record_id = requested_record_id
    AND candidate.record_version = requested_record_version;
  IF existing.record_id IS NOT NULL THEN
    IF existing.event_manifest IS DISTINCT FROM requested_manifest THEN
      RAISE EXCEPTION 'collaboration event replay changed record version identity'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.event_sha256;
  END IF;
  SELECT * INTO head FROM app.collaboration_record_events candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
  ORDER BY candidate.sequence DESC LIMIT 1;
  IF requested_sequence <> coalesce(head.sequence, 0) + 1
    OR requested_previous_event_sha256 IS DISTINCT FROM head.event_sha256
    OR (head.sequence IS NOT NULL AND requested_occurred_at < head.occurred_at)
  THEN RAISE EXCEPTION 'collaboration event breaks ledger sequence or chronology'
    USING ERRCODE = '23514'; END IF;
  SELECT * INTO prior FROM app.collaboration_record_events candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.record_id = requested_record_id
  ORDER BY candidate.record_version DESC LIMIT 1;
  IF prior.record_id IS NULL THEN
    IF requested_action <> 'created' OR requested_record_version <> 1
      OR requested_previous_record_sha256 IS NOT NULL
    THEN RAISE EXCEPTION 'collaboration record must begin with version one creation'
      USING ERRCODE = '23514'; END IF;
  ELSIF prior.action = 'resolved' OR requested_action = 'created'
    OR requested_record_version <> prior.record_version + 1
    OR requested_previous_record_sha256 IS DISTINCT FROM prior.event_sha256
    OR requested_kind IS DISTINCT FROM prior.kind
    OR artifact IS DISTINCT FROM prior.event_manifest->'artifact'
    OR requested_occurred_at <= prior.occurred_at
  THEN RAISE EXCEPTION 'collaboration record transition is invalid'
    USING ERRCODE = '23514'; END IF;

  INSERT INTO app.collaboration_record_events (
    organization_id, workspace_id, sequence, previous_event_sha256, event_sha256,
    record_id, record_version, kind, action, actor_id, occurred_at,
    artifact_id, artifact_type, artifact_version_sha256, artifact_as_of,
    point_in_time_grade, body, authorization_decision_sha256,
    previous_record_event_sha256, event_manifest
  ) VALUES (
    caller_organization_id, requested_workspace_id, requested_sequence,
    requested_previous_event_sha256, requested_event_sha256, requested_record_id,
    requested_record_version, requested_kind, requested_action, caller_subject_id,
    requested_occurred_at, (artifact->>'artifactId')::uuid, artifact->>'artifactType',
    artifact->>'artifactVersionSha256', artifact_as_of, artifact->>'pointInTimeGrade',
    requested_body, requested_manifest->>'authorizationDecisionSha256',
    requested_previous_record_sha256, requested_manifest
  );
  FOR citation, citation_index IN
    SELECT value, ordinal FROM jsonb_array_elements(requested_manifest->'citations')
      WITH ORDINALITY cited(value, ordinal)
  LOOP
    IF NOT app.collaboration_exact_keys(citation, ARRAY[
        'evidenceId','evidenceVersionSha256','locator','availableAt','temporalRelation'
      ])
      OR citation->>'evidenceVersionSha256' !~ '^[0-9a-f]{64}$'
      OR NOT app.collaboration_valid_text(citation->>'locator', 500)
      OR NOT app.collaboration_valid_iso_instant(citation->>'availableAt')
      OR citation->>'temporalRelation' IS DISTINCT FROM (
        CASE
          WHEN (citation->>'availableAt')::timestamptz <= artifact_as_of
            THEN 'available_by_artifact_cutoff'
          ELSE 'subsequent_evidence'
        END
      )
      OR (citation->>'availableAt')::timestamptz > requested_occurred_at
    THEN RAISE EXCEPTION 'collaboration citation is malformed or leaks temporal classification'
      USING ERRCODE = '23514'; END IF;
    INSERT INTO app.collaboration_record_citations (
      organization_id, workspace_id, event_sequence, citation_ordinal,
      evidence_id, evidence_version_sha256, locator, available_at,
      temporal_relation, citation_manifest
    ) VALUES (
      caller_organization_id, requested_workspace_id, requested_sequence, citation_index,
      (citation->>'evidenceId')::uuid, citation->>'evidenceVersionSha256',
      citation->>'locator', (citation->>'availableAt')::timestamptz,
      citation->>'temporalRelation', citation
    );
  END LOOP;
  RETURN requested_event_sha256;
END
$$;

CREATE OR REPLACE FUNCTION app.register_integration_api_credential(
  requested_workspace_id uuid,
  requested_manifest jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  requested_id uuid;
  existing app.integration_api_credentials%ROWTYPE;
BEGIN
  PERFORM app.collaboration_require_roles(requested_workspace_id, ARRAY['admin']);
  PERFORM app.collaboration_assert_manifest(requested_manifest, 'manifestSha256', 65536);
  IF NOT app.collaboration_exact_keys(requested_manifest, ARRAY[
      'schemaVersion','credentialId','principalId','organizationId','workspaceId','scopes',
      'secretSha256','issuedAt','expiresAt','revokedAt','manifestSha256'
    ])
    OR requested_manifest->>'organizationId' IS DISTINCT FROM caller_organization_id::text
    OR requested_manifest->>'workspaceId' IS DISTINCT FROM requested_workspace_id::text
    OR requested_manifest->>'principalId' IS DISTINCT FROM caller_subject_id::text
    OR NOT app.collaboration_valid_key_array(requested_manifest->'scopes', 1, 100)
    OR requested_manifest->>'secretSha256' !~ '^[0-9a-f]{64}$'
    OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'issuedAt')
    OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'expiresAt')
    OR (requested_manifest->'revokedAt' <> 'null'::jsonb
      AND NOT app.collaboration_valid_iso_instant(requested_manifest->>'revokedAt'))
  THEN RAISE EXCEPTION 'API credential metadata is invalid or contains an unsupported field'
    USING ERRCODE = '23514'; END IF;
  requested_id := (requested_manifest->>'credentialId')::uuid;
  IF (requested_manifest->>'expiresAt')::timestamptz <= (requested_manifest->>'issuedAt')::timestamptz
    OR (requested_manifest->>'revokedAt')::timestamptz < (requested_manifest->>'issuedAt')::timestamptz
  THEN RAISE EXCEPTION 'API credential lifecycle is invalid' USING ERRCODE = '23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    caller_organization_id::text || ':' || requested_workspace_id::text || ':' || requested_id::text,
    35002
  ));
  SELECT * INTO existing FROM app.integration_api_credentials candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.credential_id = requested_id;
  IF existing.credential_id IS NOT NULL THEN
    IF existing.credential_manifest IS DISTINCT FROM requested_manifest THEN
      RAISE EXCEPTION 'API credential replay changed immutable metadata' USING ERRCODE = '23514';
    END IF;
    RETURN existing.credential_id;
  END IF;
  INSERT INTO app.integration_api_credentials (
    credential_id, organization_id, workspace_id, principal_id, scopes, secret_sha256,
    issued_at, expires_at, revoked_at, credential_manifest, manifest_sha256
  ) VALUES (
    requested_id, caller_organization_id, requested_workspace_id, caller_subject_id,
    ARRAY(SELECT jsonb_array_elements_text(requested_manifest->'scopes')),
    requested_manifest->>'secretSha256', (requested_manifest->>'issuedAt')::timestamptz,
    (requested_manifest->>'expiresAt')::timestamptz,
    (requested_manifest->>'revokedAt')::timestamptz, requested_manifest,
    requested_manifest->>'manifestSha256'
  );
  RETURN requested_id;
END
$$;

CREATE OR REPLACE FUNCTION app.register_integration_quota_policy(
  requested_workspace_id uuid,
  requested_manifest jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  requested_id uuid;
  existing app.integration_quota_policies%ROWTYPE;
BEGIN
  PERFORM app.collaboration_require_roles(requested_workspace_id, ARRAY['admin']);
  PERFORM app.collaboration_assert_manifest(requested_manifest, 'manifestSha256', 65536);
  IF NOT app.collaboration_exact_keys(requested_manifest, ARRAY[
      'schemaVersion','quotaId','organizationId','capability','mode','limitUnits',
      'windowStartsAt','windowEndsAt','policyVersion','manifestSha256'
    ])
    OR requested_manifest->>'organizationId' IS DISTINCT FROM caller_organization_id::text
    OR NOT app.collaboration_valid_key(requested_manifest->>'capability')
    OR requested_manifest->>'mode' NOT IN ('hard','soft')
    OR NOT app.collaboration_valid_integer_json(
      requested_manifest->'limitUnits', 1, 1000000000000
    )
    OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'windowStartsAt')
    OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'windowEndsAt')
    OR NOT app.collaboration_valid_key(requested_manifest->>'policyVersion')
  THEN RAISE EXCEPTION 'quota policy manifest is invalid' USING ERRCODE = '23514'; END IF;
  requested_id := (requested_manifest->>'quotaId')::uuid;
  IF (requested_manifest->>'limitUnits')::bigint NOT BETWEEN 1 AND 1000000000000
    OR (requested_manifest->>'windowEndsAt')::timestamptz
      <= (requested_manifest->>'windowStartsAt')::timestamptz
  THEN RAISE EXCEPTION 'quota policy bounds are invalid' USING ERRCODE = '23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    caller_organization_id::text || ':' || requested_workspace_id::text || ':' || requested_id::text,
    35003
  ));
  SELECT * INTO existing FROM app.integration_quota_policies candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.quota_id = requested_id;
  IF existing.quota_id IS NOT NULL THEN
    IF existing.policy_manifest IS DISTINCT FROM requested_manifest THEN
      RAISE EXCEPTION 'quota policy replay changed immutable content' USING ERRCODE = '23514';
    END IF;
    RETURN existing.quota_id;
  END IF;
  INSERT INTO app.integration_quota_policies (
    quota_id, organization_id, workspace_id, capability, mode, limit_units,
    window_starts_at, window_ends_at, policy_version, policy_manifest, manifest_sha256
  ) VALUES (
    requested_id, caller_organization_id, requested_workspace_id,
    requested_manifest->>'capability', requested_manifest->>'mode',
    (requested_manifest->>'limitUnits')::bigint,
    (requested_manifest->>'windowStartsAt')::timestamptz,
    (requested_manifest->>'windowEndsAt')::timestamptz,
    requested_manifest->>'policyVersion', requested_manifest,
    requested_manifest->>'manifestSha256'
  );
  RETURN requested_id;
END
$$;

CREATE OR REPLACE FUNCTION app.append_integration_quota_event(
  requested_workspace_id uuid,
  requested_manifest jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  requested_quota_id uuid;
  requested_sequence bigint;
  requested_action text;
  requested_event_sha256 text;
  requested_occurred_at timestamptz;
  requested_reservation_id uuid;
  policy app.integration_quota_policies%ROWTYPE;
  head app.integration_quota_events%ROWTYPE;
  reservation app.integration_quota_events%ROWTYPE;
  terminal app.integration_quota_events%ROWTYPE;
  existing app.integration_quota_events%ROWTYPE;
  expected_consumed bigint;
  expected_outstanding bigint;
BEGIN
  PERFORM app.collaboration_require_roles(
    requested_workspace_id, ARRAY['analyst','steward','validator','admin']
  );
  PERFORM app.collaboration_assert_manifest(requested_manifest, 'eventSha256', 131072);
  IF NOT app.collaboration_exact_keys(requested_manifest, ARRAY[
      'schemaVersion','sequence','previousEventSha256','eventSha256','quotaId','organizationId',
      'capability','action','reservationId','principalId','quantityUnits','adjustmentUnits',
      'idempotencyKey','requestSha256','usageEventId','reason','occurredAt',
      'reservationExpiresAt','authorizationDecisionSha256','totalConsumedUnits',
      'totalOutstandingUnits'
    ])
    OR requested_manifest->>'organizationId' IS DISTINCT FROM caller_organization_id::text
    OR requested_manifest->>'principalId' IS DISTINCT FROM caller_subject_id::text
    OR requested_manifest->>'authorizationDecisionSha256' !~ '^[0-9a-f]{64}$'
    OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'occurredAt')
    OR NOT app.collaboration_valid_integer_json(
      requested_manifest->'sequence', 1, 1000000000
    )
    OR NOT app.collaboration_valid_integer_json(
      requested_manifest->'quantityUnits', 0, 1000000000000
    )
    OR NOT app.collaboration_valid_integer_json(
      requested_manifest->'adjustmentUnits', -1000000000000, 1000000000000
    )
    OR NOT app.collaboration_valid_integer_json(
      requested_manifest->'totalConsumedUnits', 0, 1000000000000
    )
    OR NOT app.collaboration_valid_integer_json(
      requested_manifest->'totalOutstandingUnits', 0, 1000000000000
    )
  THEN RAISE EXCEPTION 'quota event scope or shape is invalid' USING ERRCODE = '23514'; END IF;
  requested_quota_id := (requested_manifest->>'quotaId')::uuid;
  requested_sequence := (requested_manifest->>'sequence')::bigint;
  requested_action := requested_manifest->>'action';
  requested_event_sha256 := requested_manifest->>'eventSha256';
  requested_occurred_at := (requested_manifest->>'occurredAt')::timestamptz;
  requested_reservation_id := (requested_manifest->>'reservationId')::uuid;
  SELECT * INTO policy FROM app.integration_quota_policies candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.quota_id = requested_quota_id;
  IF policy.quota_id IS NULL OR requested_manifest->>'capability' IS DISTINCT FROM policy.capability
    OR requested_action NOT IN ('reserved','settled','expired','reconciled')
  THEN RAISE EXCEPTION 'quota event does not bind an exact tenant policy'
    USING ERRCODE = '23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    caller_organization_id::text || ':' || requested_workspace_id::text || ':' || requested_quota_id::text,
    35004
  ));
  SELECT * INTO existing FROM app.integration_quota_events candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.quota_id = requested_quota_id
    AND candidate.sequence = requested_sequence;
  IF existing.sequence IS NOT NULL THEN
    IF existing.event_manifest IS DISTINCT FROM requested_manifest THEN
      RAISE EXCEPTION 'quota event replay changed ledger sequence' USING ERRCODE = '23514';
    END IF;
    RETURN existing.event_sha256;
  END IF;
  SELECT * INTO head FROM app.integration_quota_events candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.quota_id = requested_quota_id
  ORDER BY candidate.sequence DESC LIMIT 1;
  expected_consumed := coalesce(head.total_consumed_units, 0);
  expected_outstanding := coalesce(head.total_outstanding_units, 0);
  IF requested_sequence <> coalesce(head.sequence, 0) + 1
    OR requested_manifest->>'previousEventSha256' IS DISTINCT FROM head.event_sha256
    OR (head.sequence IS NOT NULL AND requested_occurred_at < head.occurred_at)
  THEN RAISE EXCEPTION 'quota event breaks ledger sequence or chronology'
    USING ERRCODE = '23514'; END IF;
  IF requested_action = 'reserved' THEN
    IF requested_reservation_id IS NULL
      OR requested_manifest->'idempotencyKey' = 'null'::jsonb
      OR requested_manifest->>'requestSha256' !~ '^[0-9a-f]{64}$'
      OR NOT app.collaboration_valid_text(requested_manifest->>'idempotencyKey', 200)
      OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'reservationExpiresAt')
      OR (requested_manifest->>'quantityUnits')::bigint NOT BETWEEN 1 AND 1000000000000
      OR (requested_manifest->>'adjustmentUnits')::bigint <> 0
      OR requested_manifest->'usageEventId' <> 'null'::jsonb
      OR requested_manifest->'reason' <> 'null'::jsonb
      OR requested_occurred_at < policy.window_starts_at
      OR requested_occurred_at >= policy.window_ends_at
      OR (requested_manifest->>'reservationExpiresAt')::timestamptz <= requested_occurred_at
      OR (requested_manifest->>'reservationExpiresAt')::timestamptz > policy.window_ends_at
      OR EXISTS (
        SELECT 1 FROM app.integration_quota_events candidate
        WHERE candidate.organization_id = caller_organization_id
          AND candidate.workspace_id = requested_workspace_id
          AND candidate.quota_id = requested_quota_id
          AND (candidate.reservation_id = requested_reservation_id
            OR (candidate.principal_id = caller_subject_id
              AND candidate.idempotency_key = requested_manifest->>'idempotencyKey'))
      )
    THEN RAISE EXCEPTION 'quota reservation is invalid or reuses an identity'
      USING ERRCODE = '23514'; END IF;
    expected_outstanding := expected_outstanding + (requested_manifest->>'quantityUnits')::bigint;
  ELSIF requested_action IN ('settled','expired') THEN
    SELECT * INTO reservation FROM app.integration_quota_events candidate
    WHERE candidate.organization_id = caller_organization_id
      AND candidate.workspace_id = requested_workspace_id
      AND candidate.quota_id = requested_quota_id
      AND candidate.reservation_id = requested_reservation_id
      AND candidate.action = 'reserved';
    SELECT * INTO terminal FROM app.integration_quota_events candidate
    WHERE candidate.organization_id = caller_organization_id
      AND candidate.workspace_id = requested_workspace_id
      AND candidate.quota_id = requested_quota_id
      AND candidate.reservation_id = requested_reservation_id
      AND candidate.action IN ('settled','expired') LIMIT 1;
    IF reservation.sequence IS NULL OR terminal.sequence IS NOT NULL
      OR requested_manifest->>'principalId' IS DISTINCT FROM reservation.principal_id::text
      OR requested_manifest->>'authorizationDecisionSha256'
        IS DISTINCT FROM reservation.authorization_decision_sha256
      OR (requested_manifest->>'adjustmentUnits')::bigint <> 0
      OR requested_manifest->'idempotencyKey' <> 'null'::jsonb
      OR requested_manifest->'requestSha256' <> 'null'::jsonb
      OR requested_manifest->'reservationExpiresAt' <> 'null'::jsonb
    THEN RAISE EXCEPTION 'quota terminal event does not bind an active reservation'
      USING ERRCODE = '23514'; END IF;
    expected_outstanding := expected_outstanding - reservation.quantity_units;
    IF requested_action = 'settled' THEN
      IF requested_manifest->'usageEventId' = 'null'::jsonb
        OR requested_manifest->'reason' <> 'null'::jsonb
        OR (requested_manifest->>'quantityUnits')::bigint NOT BETWEEN 0 AND reservation.quantity_units
        OR requested_occurred_at < reservation.occurred_at
        OR requested_occurred_at >= reservation.reservation_expires_at
      THEN RAISE EXCEPTION 'quota settlement is invalid' USING ERRCODE = '23514'; END IF;
      expected_consumed := expected_consumed + (requested_manifest->>'quantityUnits')::bigint;
    ELSIF requested_manifest->'usageEventId' <> 'null'::jsonb
      OR requested_manifest->'reason' <> 'null'::jsonb
      OR (requested_manifest->>'quantityUnits')::bigint <> reservation.quantity_units
      OR requested_occurred_at < reservation.reservation_expires_at
    THEN RAISE EXCEPTION 'quota expiry is invalid' USING ERRCODE = '23514'; END IF;
  ELSE
    IF app.collaboration_require_roles(requested_workspace_id, ARRAY['admin']) IS NULL
      OR requested_reservation_id IS NOT NULL
      OR requested_manifest->'usageEventId' = 'null'::jsonb
      OR requested_manifest->'reason' = 'null'::jsonb
      OR NOT app.collaboration_valid_text(requested_manifest->>'reason', 1000)
      OR requested_manifest->'idempotencyKey' <> 'null'::jsonb
      OR requested_manifest->'requestSha256' <> 'null'::jsonb
      OR requested_manifest->'reservationExpiresAt' <> 'null'::jsonb
      OR requested_occurred_at < policy.window_starts_at
      OR requested_occurred_at >= policy.window_ends_at
      OR (requested_manifest->>'adjustmentUnits')::bigint
        <> (requested_manifest->>'quantityUnits')::bigint - expected_consumed
    THEN RAISE EXCEPTION 'quota reconciliation is invalid' USING ERRCODE = '23514'; END IF;
    expected_consumed := (requested_manifest->>'quantityUnits')::bigint;
  END IF;
  IF (requested_manifest->>'totalConsumedUnits')::bigint <> expected_consumed
    OR (requested_manifest->>'totalOutstandingUnits')::bigint <> expected_outstanding
    OR expected_outstanding < 0
    OR (policy.mode = 'hard' AND expected_consumed + expected_outstanding > policy.limit_units)
  THEN RAISE EXCEPTION 'quota event running totals violate the policy'
    USING ERRCODE = '23514'; END IF;
  INSERT INTO app.integration_quota_events (
    organization_id, workspace_id, quota_id, sequence, previous_event_sha256,
    event_sha256, capability, action, reservation_id, principal_id, quantity_units,
    adjustment_units, idempotency_key, request_sha256, usage_event_id, reason,
    occurred_at, reservation_expires_at, authorization_decision_sha256,
    total_consumed_units, total_outstanding_units, event_manifest
  ) VALUES (
    caller_organization_id, requested_workspace_id, requested_quota_id, requested_sequence,
    requested_manifest->>'previousEventSha256', requested_event_sha256, policy.capability,
    requested_action, requested_reservation_id, caller_subject_id,
    (requested_manifest->>'quantityUnits')::bigint,
    (requested_manifest->>'adjustmentUnits')::bigint,
    requested_manifest->>'idempotencyKey', requested_manifest->>'requestSha256',
    (requested_manifest->>'usageEventId')::uuid, requested_manifest->>'reason',
    requested_occurred_at, (requested_manifest->>'reservationExpiresAt')::timestamptz,
    requested_manifest->>'authorizationDecisionSha256', expected_consumed,
    expected_outstanding, requested_manifest
  );
  RETURN requested_event_sha256;
END
$$;

CREATE OR REPLACE FUNCTION app.register_integration_webhook_endpoint(
  requested_workspace_id uuid,
  requested_manifest jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  requested_id uuid;
  requested_url text;
  existing app.integration_webhook_endpoints%ROWTYPE;
BEGIN
  PERFORM app.collaboration_require_roles(requested_workspace_id, ARRAY['admin']);
  PERFORM app.collaboration_assert_manifest(requested_manifest, 'manifestSha256', 131072);
  IF NOT app.collaboration_exact_keys(requested_manifest, ARRAY[
      'schemaVersion','endpointId','organizationId','url','eventTypes','signingKeyId',
      'maxAttempts','baseRetrySeconds','maxRetrySeconds','active','manifestSha256'
    ])
    OR requested_manifest->>'organizationId' IS DISTINCT FROM caller_organization_id::text
    OR NOT app.collaboration_valid_key_array(requested_manifest->'eventTypes', 1, 100)
    OR NOT app.collaboration_valid_key(requested_manifest->>'signingKeyId')
    OR jsonb_typeof(requested_manifest->'active') <> 'boolean'
    OR NOT app.collaboration_valid_integer_json(requested_manifest->'maxAttempts', 1, 20)
    OR NOT app.collaboration_valid_integer_json(
      requested_manifest->'baseRetrySeconds', 1, 86400
    )
    OR NOT app.collaboration_valid_integer_json(
      requested_manifest->'maxRetrySeconds', 1, 604800
    )
  THEN RAISE EXCEPTION 'webhook endpoint manifest is invalid' USING ERRCODE = '23514'; END IF;
  requested_id := (requested_manifest->>'endpointId')::uuid;
  requested_url := requested_manifest->>'url';
  IF NOT app.collaboration_valid_https_url(requested_url)
    OR (requested_manifest->>'maxAttempts')::integer NOT BETWEEN 1 AND 20
    OR (requested_manifest->>'baseRetrySeconds')::integer NOT BETWEEN 1 AND 86400
    OR (requested_manifest->>'maxRetrySeconds')::integer
      NOT BETWEEN (requested_manifest->>'baseRetrySeconds')::integer AND 604800
  THEN RAISE EXCEPTION 'webhook endpoint transport policy is invalid'
    USING ERRCODE = '23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    caller_organization_id::text || ':' || requested_workspace_id::text || ':' || requested_id::text,
    35005
  ));
  SELECT * INTO existing FROM app.integration_webhook_endpoints candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.endpoint_id = requested_id;
  IF existing.endpoint_id IS NOT NULL THEN
    IF existing.endpoint_manifest IS DISTINCT FROM requested_manifest THEN
      RAISE EXCEPTION 'webhook endpoint replay changed immutable configuration'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.endpoint_id;
  END IF;
  INSERT INTO app.integration_webhook_endpoints (
    endpoint_id, organization_id, workspace_id, url, event_types, signing_key_id,
    max_attempts, base_retry_seconds, max_retry_seconds, active,
    endpoint_manifest, manifest_sha256
  ) VALUES (
    requested_id, caller_organization_id, requested_workspace_id, requested_url,
    ARRAY(SELECT jsonb_array_elements_text(requested_manifest->'eventTypes')),
    requested_manifest->>'signingKeyId', (requested_manifest->>'maxAttempts')::smallint,
    (requested_manifest->>'baseRetrySeconds')::integer,
    (requested_manifest->>'maxRetrySeconds')::integer,
    (requested_manifest->>'active')::boolean, requested_manifest,
    requested_manifest->>'manifestSha256'
  );
  RETURN requested_id;
END
$$;

CREATE OR REPLACE FUNCTION app.append_integration_webhook_delivery_event(
  requested_workspace_id uuid,
  requested_manifest jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  requested_endpoint_id uuid;
  requested_sequence bigint;
  requested_delivery_id uuid;
  requested_status text;
  requested_attempt integer;
  requested_occurred_at timestamptz;
  endpoint app.integration_webhook_endpoints%ROWTYPE;
  head app.integration_webhook_delivery_events%ROWTYPE;
  prior app.integration_webhook_delivery_events%ROWTYPE;
  existing app.integration_webhook_delivery_events%ROWTYPE;
  expected_retry_at timestamptz;
BEGIN
  PERFORM app.collaboration_require_roles(requested_workspace_id, ARRAY['admin']);
  PERFORM app.collaboration_assert_manifest(requested_manifest, 'eventSha256', 131072);
  IF NOT app.collaboration_exact_keys(requested_manifest, ARRAY[
      'schemaVersion','sequence','previousEventSha256','eventSha256','deliveryId','endpointId',
      'organizationId','envelopeSha256','status','attempt','occurredAt','retryAt','outcomeCode'
    ])
    OR requested_manifest->>'organizationId' IS DISTINCT FROM caller_organization_id::text
    OR requested_manifest->>'envelopeSha256' !~ '^[0-9a-f]{64}$'
    OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'occurredAt')
    OR NOT app.collaboration_valid_integer_json(
      requested_manifest->'sequence', 1, 1000000000
    )
    OR NOT app.collaboration_valid_integer_json(requested_manifest->'attempt', 0, 20)
  THEN RAISE EXCEPTION 'webhook delivery event scope or shape is invalid'
    USING ERRCODE = '23514'; END IF;
  requested_endpoint_id := (requested_manifest->>'endpointId')::uuid;
  requested_sequence := (requested_manifest->>'sequence')::bigint;
  requested_delivery_id := (requested_manifest->>'deliveryId')::uuid;
  requested_status := requested_manifest->>'status';
  requested_attempt := (requested_manifest->>'attempt')::integer;
  requested_occurred_at := (requested_manifest->>'occurredAt')::timestamptz;
  SELECT * INTO endpoint FROM app.integration_webhook_endpoints candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.endpoint_id = requested_endpoint_id;
  IF endpoint.endpoint_id IS NULL OR NOT endpoint.active THEN
    RAISE EXCEPTION 'webhook endpoint is foreign, missing, or inactive' USING ERRCODE = '23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    caller_organization_id::text || ':' || requested_workspace_id::text || ':' || requested_endpoint_id::text,
    35006
  ));
  SELECT * INTO existing FROM app.integration_webhook_delivery_events candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.endpoint_id = requested_endpoint_id
    AND candidate.sequence = requested_sequence;
  IF existing.sequence IS NOT NULL THEN
    IF existing.event_manifest IS DISTINCT FROM requested_manifest THEN
      RAISE EXCEPTION 'webhook delivery replay changed ledger sequence' USING ERRCODE = '23514';
    END IF;
    RETURN existing.event_sha256;
  END IF;
  SELECT * INTO head FROM app.integration_webhook_delivery_events candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.endpoint_id = requested_endpoint_id
  ORDER BY candidate.sequence DESC LIMIT 1;
  IF requested_sequence <> coalesce(head.sequence, 0) + 1
    OR requested_manifest->>'previousEventSha256' IS DISTINCT FROM head.event_sha256
    OR (head.sequence IS NOT NULL AND requested_occurred_at < head.occurred_at)
  THEN RAISE EXCEPTION 'webhook delivery breaks ledger sequence or chronology'
    USING ERRCODE = '23514'; END IF;
  SELECT * INTO prior FROM app.integration_webhook_delivery_events candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.endpoint_id = requested_endpoint_id
    AND candidate.delivery_id = requested_delivery_id
  ORDER BY candidate.sequence DESC LIMIT 1;
  IF prior.sequence IS NULL THEN
    IF requested_status <> 'queued' OR requested_attempt <> 0
      OR requested_manifest->'retryAt' <> 'null'::jsonb
      OR requested_manifest->'outcomeCode' <> 'null'::jsonb
    THEN RAISE EXCEPTION 'webhook delivery must begin queued' USING ERRCODE = '23514'; END IF;
  ELSIF requested_manifest->>'envelopeSha256' IS DISTINCT FROM prior.envelope_sha256
    OR requested_occurred_at < prior.occurred_at
  THEN RAISE EXCEPTION 'webhook delivery changes envelope or predates prior state'
    USING ERRCODE = '23514';
  ELSIF requested_status = 'delivering' THEN
    IF prior.status NOT IN ('queued','retry_scheduled') OR requested_attempt <> prior.attempt + 1
      OR requested_manifest->'retryAt' <> 'null'::jsonb
      OR requested_manifest->'outcomeCode' <> 'null'::jsonb
      OR (prior.retry_at IS NOT NULL AND requested_occurred_at < prior.retry_at)
    THEN RAISE EXCEPTION 'webhook attempt transition is invalid' USING ERRCODE = '23514'; END IF;
  ELSIF requested_status = 'retry_scheduled' THEN
    expected_retry_at := requested_occurred_at + make_interval(
      secs => least(
        endpoint.max_retry_seconds::bigint,
        endpoint.base_retry_seconds::bigint * (1::bigint << (requested_attempt - 1))
      )::double precision
    );
    IF prior.status <> 'delivering' OR requested_attempt <> prior.attempt
      OR requested_attempt >= endpoint.max_attempts
      OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'retryAt')
      OR NOT app.collaboration_valid_key(requested_manifest->>'outcomeCode')
      OR (requested_manifest->>'retryAt')::timestamptz IS DISTINCT FROM expected_retry_at
    THEN RAISE EXCEPTION 'webhook retry transition is invalid' USING ERRCODE = '23514'; END IF;
  ELSIF requested_status IN ('delivered','dead_lettered') THEN
    IF prior.status <> 'delivering' OR requested_attempt <> prior.attempt
      OR requested_manifest->'retryAt' <> 'null'::jsonb
      OR NOT app.collaboration_valid_key(requested_manifest->>'outcomeCode')
    THEN RAISE EXCEPTION 'webhook terminal transition is invalid' USING ERRCODE = '23514'; END IF;
  ELSE
    RAISE EXCEPTION 'webhook delivery repeats queued or uses an unknown status'
      USING ERRCODE = '23514';
  END IF;
  INSERT INTO app.integration_webhook_delivery_events (
    organization_id, workspace_id, endpoint_id, sequence, previous_event_sha256,
    event_sha256, delivery_id, envelope_sha256, status, attempt, occurred_at,
    retry_at, outcome_code, event_manifest
  ) VALUES (
    caller_organization_id, requested_workspace_id, requested_endpoint_id,
    requested_sequence, requested_manifest->>'previousEventSha256',
    requested_manifest->>'eventSha256', requested_delivery_id,
    requested_manifest->>'envelopeSha256', requested_status, requested_attempt,
    requested_occurred_at, (requested_manifest->>'retryAt')::timestamptz,
    requested_manifest->>'outcomeCode', requested_manifest
  );
  RETURN requested_manifest->>'eventSha256';
END
$$;

CREATE OR REPLACE FUNCTION app.register_integration_extension_manifest(
  requested_workspace_id uuid,
  requested_manifest jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  requested_extension_id uuid;
  requested_version text;
  egress jsonb;
  resources jsonb;
  host jsonb;
  host_text text;
  prior_host text;
  existing app.integration_extension_manifests%ROWTYPE;
BEGIN
  PERFORM app.collaboration_require_roles(requested_workspace_id, ARRAY['admin']);
  PERFORM app.collaboration_assert_manifest(requested_manifest, 'manifestSha256', 262144);
  IF NOT app.collaboration_exact_keys(requested_manifest, ARRAY[
      'schemaVersion','extensionId','publisherId','organizationId','kind','name','version',
      'extensionApiVersion','artifactSha256','runtime','capabilities','egress','resources',
      'inputClassifications','outputClassifications','createdAt','manifestSha256'
    ])
    OR requested_manifest->>'organizationId' IS DISTINCT FROM caller_organization_id::text
    OR requested_manifest->>'kind' NOT IN ('connector','model')
    OR requested_manifest->>'runtime' NOT IN ('wasm','oci_sandbox')
    OR NOT app.collaboration_valid_key(requested_manifest->>'name')
    OR NOT app.collaboration_valid_semver(requested_manifest->>'version')
    OR NOT app.collaboration_valid_semver(requested_manifest->>'extensionApiVersion')
    OR requested_manifest->>'artifactSha256' !~ '^[0-9a-f]{64}$'
    OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'createdAt')
    OR NOT app.collaboration_valid_key_array(requested_manifest->'capabilities', 1, 100)
    OR requested_manifest->'capabilities' ?| ARRAY[
      'workspace.manage','extension.certify','extension.admit',
      'quota.reconcile','audit.read'
    ]
  THEN RAISE EXCEPTION 'extension manifest identity or capabilities are invalid'
    USING ERRCODE = '23514'; END IF;
  egress := requested_manifest->'egress';
  resources := requested_manifest->'resources';
  IF NOT app.collaboration_exact_keys(egress, ARRAY['mode','hosts'])
    OR egress->>'mode' NOT IN ('denied','allowlist')
    OR jsonb_typeof(egress->'hosts') <> 'array'
    OR jsonb_array_length(egress->'hosts') > 100
    OR (egress->>'mode' = 'denied' AND jsonb_array_length(egress->'hosts') <> 0)
    OR (egress->>'mode' = 'allowlist' AND jsonb_array_length(egress->'hosts') = 0)
    OR NOT app.collaboration_exact_keys(resources, ARRAY[
      'memoryMiB','cpuMillis','wallClockMillis','outputBytes','concurrency'
    ])
    OR NOT app.collaboration_valid_integer_json(resources->'memoryMiB', 16, 262144)
    OR NOT app.collaboration_valid_integer_json(resources->'cpuMillis', 1, 86400000)
    OR NOT app.collaboration_valid_integer_json(
      resources->'wallClockMillis', 1, 86400000
    )
    OR NOT app.collaboration_valid_integer_json(
      resources->'outputBytes', 1, 10000000000
    )
    OR NOT app.collaboration_valid_integer_json(resources->'concurrency', 1, 10000)
  THEN RAISE EXCEPTION 'extension isolation declaration is invalid' USING ERRCODE = '23514'; END IF;
  FOR host IN SELECT value FROM jsonb_array_elements(egress->'hosts') LOOP
    host_text := host#>>'{}';
    IF jsonb_typeof(host) <> 'string'
      OR NOT app.collaboration_valid_public_dns_name(host_text)
      OR (prior_host IS NOT NULL AND host_text COLLATE "C" <= prior_host COLLATE "C")
    THEN RAISE EXCEPTION 'extension egress host is not public canonical DNS'
      USING ERRCODE = '23514'; END IF;
    prior_host := host_text;
  END LOOP;
  IF NOT app.collaboration_valid_key_array(
      requested_manifest->'inputClassifications', 1, 4
    )
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(
      requested_manifest->'inputClassifications'
    ) value WHERE value NOT IN ('public','internal','confidential','restricted'))
    OR NOT app.collaboration_valid_key_array(
      requested_manifest->'outputClassifications', 1, 4
    )
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(
      requested_manifest->'outputClassifications'
    ) value WHERE value NOT IN ('public','internal','confidential','restricted'))
  THEN RAISE EXCEPTION 'extension classification contract is invalid' USING ERRCODE = '23514'; END IF;
  requested_extension_id := (requested_manifest->>'extensionId')::uuid;
  requested_version := requested_manifest->>'version';
  PERFORM pg_advisory_xact_lock(hashtextextended(
    requested_extension_id::text || ':' || requested_version, 35007
  ));
  SELECT * INTO existing FROM app.integration_extension_manifests candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.extension_id = requested_extension_id
    AND candidate.extension_version = requested_version;
  IF existing.extension_id IS NOT NULL THEN
    IF existing.extension_manifest IS DISTINCT FROM requested_manifest THEN
      RAISE EXCEPTION 'extension version replay changed immutable content'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.manifest_sha256;
  END IF;
  INSERT INTO app.integration_extension_manifests (
    organization_id, workspace_id, extension_id, extension_version, publisher_id,
    kind, extension_api_version, artifact_sha256, runtime, created_at,
    extension_manifest, manifest_sha256
  ) VALUES (
    caller_organization_id, requested_workspace_id, requested_extension_id,
    requested_version, (requested_manifest->>'publisherId')::uuid,
    requested_manifest->>'kind', requested_manifest->>'extensionApiVersion',
    requested_manifest->>'artifactSha256', requested_manifest->>'runtime',
    (requested_manifest->>'createdAt')::timestamptz, requested_manifest,
    requested_manifest->>'manifestSha256'
  );
  RETURN requested_manifest->>'manifestSha256';
END
$$;

CREATE OR REPLACE FUNCTION app.register_integration_extension_certification(
  requested_workspace_id uuid,
  requested_manifest jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  requested_id uuid;
  extension app.integration_extension_manifests%ROWTYPE;
  existing app.integration_extension_certifications%ROWTYPE;
BEGIN
  PERFORM app.collaboration_require_roles(requested_workspace_id, ARRAY['steward','validator','admin']);
  PERFORM app.collaboration_assert_manifest(requested_manifest, 'manifestSha256', 262144);
  IF NOT app.collaboration_exact_keys(requested_manifest, ARRAY[
      'schemaVersion','certificationId','extensionId','extensionVersion',
      'extensionManifestSha256','organizationId','workspaceId','certifiedBy','issuedAt',
      'validUntil','compatibilityContractSha256','compatibilityDecisionSha256',
      'isolationProfileSha256','testEvidenceSha256','passedTests',
      'authorizationDecisionSha256','manifestSha256'
    ])
    OR requested_manifest->>'organizationId' IS DISTINCT FROM caller_organization_id::text
    OR requested_manifest->>'workspaceId' IS DISTINCT FROM requested_workspace_id::text
    OR requested_manifest->>'certifiedBy' IS DISTINCT FROM caller_subject_id::text
    OR requested_manifest->>'extensionManifestSha256' !~ '^[0-9a-f]{64}$'
    OR requested_manifest->>'compatibilityContractSha256' !~ '^[0-9a-f]{64}$'
    OR requested_manifest->>'compatibilityDecisionSha256' !~ '^[0-9a-f]{64}$'
    OR requested_manifest->>'isolationProfileSha256' !~ '^[0-9a-f]{64}$'
    OR requested_manifest->>'authorizationDecisionSha256' !~ '^[0-9a-f]{64}$'
    OR NOT app.collaboration_valid_digest_array(requested_manifest->'testEvidenceSha256', 1, 100)
    OR NOT app.collaboration_valid_key_array(requested_manifest->'passedTests', 1, 100)
    OR NOT requested_manifest->'passedTests' ?& ARRAY[
      'audit_receipt','deterministic_shutdown','filesystem_isolation',
      'network_egress','quota_enforcement','tenant_boundary'
    ]
    OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'issuedAt')
    OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'validUntil')
  THEN RAISE EXCEPTION 'extension certification evidence is incomplete or invalid'
    USING ERRCODE = '23514'; END IF;
  requested_id := (requested_manifest->>'certificationId')::uuid;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    caller_organization_id::text || ':' || requested_workspace_id::text || ':' || requested_id::text,
    35008
  ));
  SELECT * INTO existing FROM app.integration_extension_certifications candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.certification_id = requested_id;
  IF existing.certification_id IS NOT NULL THEN
    IF existing.certification_manifest IS DISTINCT FROM requested_manifest THEN
      RAISE EXCEPTION 'extension certification replay changed immutable evidence'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.manifest_sha256;
  END IF;
  SELECT * INTO extension FROM app.integration_extension_manifests candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.extension_id = (requested_manifest->>'extensionId')::uuid
    AND candidate.extension_version = requested_manifest->>'extensionVersion';
  IF extension.extension_id IS NULL
    OR extension.manifest_sha256 IS DISTINCT FROM requested_manifest->>'extensionManifestSha256'
    OR (requested_manifest->>'issuedAt')::timestamptz < extension.created_at
    OR (requested_manifest->>'validUntil')::timestamptz
      <= (requested_manifest->>'issuedAt')::timestamptz
    OR EXISTS (
      SELECT 1 FROM app.integration_extension_revocations revocation
      WHERE revocation.organization_id = caller_organization_id
        AND revocation.workspace_id = requested_workspace_id
        AND revocation.extension_id = extension.extension_id
        AND revocation.extension_version = extension.extension_version
    )
  THEN RAISE EXCEPTION 'extension certification does not bind a live exact manifest'
    USING ERRCODE = '23514'; END IF;
  INSERT INTO app.integration_extension_certifications (
    certification_id, organization_id, workspace_id, extension_id, extension_version,
    extension_manifest_sha256, certified_by, issued_at, valid_until,
    compatibility_contract_sha256, compatibility_decision_sha256,
    isolation_profile_sha256, certification_manifest, manifest_sha256
  ) VALUES (
    requested_id, caller_organization_id, requested_workspace_id, extension.extension_id,
    extension.extension_version, extension.manifest_sha256, caller_subject_id,
    (requested_manifest->>'issuedAt')::timestamptz,
    (requested_manifest->>'validUntil')::timestamptz,
    requested_manifest->>'compatibilityContractSha256',
    requested_manifest->>'compatibilityDecisionSha256',
    requested_manifest->>'isolationProfileSha256', requested_manifest,
    requested_manifest->>'manifestSha256'
  );
  RETURN requested_manifest->>'manifestSha256';
END
$$;

CREATE OR REPLACE FUNCTION app.register_integration_extension_revocation(
  requested_workspace_id uuid,
  requested_manifest jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  requested_id uuid;
  extension app.integration_extension_manifests%ROWTYPE;
  existing app.integration_extension_revocations%ROWTYPE;
BEGIN
  PERFORM app.collaboration_require_roles(requested_workspace_id, ARRAY['admin']);
  PERFORM app.collaboration_assert_manifest(requested_manifest, 'manifestSha256', 131072);
  IF NOT app.collaboration_exact_keys(requested_manifest, ARRAY[
      'schemaVersion','revocationId','extensionId','extensionVersion','organizationId',
      'workspaceId','revokedBy','revokedAt','reason','authorizationDecisionSha256','manifestSha256'
    ])
    OR requested_manifest->>'organizationId' IS DISTINCT FROM caller_organization_id::text
    OR requested_manifest->>'workspaceId' IS DISTINCT FROM requested_workspace_id::text
    OR requested_manifest->>'revokedBy' IS DISTINCT FROM caller_subject_id::text
    OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'revokedAt')
    OR NOT app.collaboration_valid_text(requested_manifest->>'reason', 1000)
    OR requested_manifest->>'authorizationDecisionSha256' !~ '^[0-9a-f]{64}$'
  THEN RAISE EXCEPTION 'extension revocation manifest is invalid' USING ERRCODE = '23514'; END IF;
  SELECT * INTO extension FROM app.integration_extension_manifests candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.extension_id = (requested_manifest->>'extensionId')::uuid
    AND candidate.extension_version = requested_manifest->>'extensionVersion';
  IF extension.extension_id IS NULL
    OR (requested_manifest->>'revokedAt')::timestamptz < extension.created_at
  THEN RAISE EXCEPTION 'extension revocation does not bind a known prior manifest'
    USING ERRCODE = '23514'; END IF;
  requested_id := (requested_manifest->>'revocationId')::uuid;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    caller_organization_id::text || ':' || requested_workspace_id::text || ':' || requested_id::text,
    35009
  ));
  SELECT * INTO existing FROM app.integration_extension_revocations candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.extension_id = extension.extension_id
    AND candidate.extension_version = extension.extension_version;
  IF existing.revocation_id IS NOT NULL THEN
    IF existing.revocation_manifest IS DISTINCT FROM requested_manifest THEN
      RAISE EXCEPTION 'extension revocation replay changed immutable evidence'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.manifest_sha256;
  END IF;
  INSERT INTO app.integration_extension_revocations (
    revocation_id, organization_id, workspace_id, extension_id, extension_version,
    revoked_by, revoked_at, reason, revocation_manifest, manifest_sha256
  ) VALUES (
    requested_id, caller_organization_id, requested_workspace_id, extension.extension_id,
    extension.extension_version, caller_subject_id,
    (requested_manifest->>'revokedAt')::timestamptz, requested_manifest->>'reason',
    requested_manifest, requested_manifest->>'manifestSha256'
  );
  RETURN requested_manifest->>'manifestSha256';
END
$$;

CREATE OR REPLACE FUNCTION app.register_developer_portal_entry(
  requested_workspace_id uuid,
  requested_manifest jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  requested_id uuid;
  existing app.developer_portal_entries%ROWTYPE;
BEGIN
  PERFORM app.collaboration_require_roles(requested_workspace_id, ARRAY['admin']);
  PERFORM app.collaboration_assert_manifest(requested_manifest, 'manifestSha256', 262144);
  IF NOT app.collaboration_exact_keys(requested_manifest, ARRAY[
      'schemaVersion','entryId','integrationId','organizationId','workspaceId',
      'ownerPrincipalId','assetKind','slug','displayName','summary','documentationPath',
      'artifactSha256','capabilities','compatibilityContractSha256',
      'extensionCertificationSha256','status','issuedAt','authorizationDecisionSha256',
      'manifestSha256'
    ])
    OR requested_manifest->>'organizationId' IS DISTINCT FROM caller_organization_id::text
    OR requested_manifest->>'workspaceId' IS DISTINCT FROM requested_workspace_id::text
    OR requested_manifest->>'assetKind' NOT IN ('sdk','cli','webhook','connector','model_extension')
    OR NOT app.collaboration_valid_key(requested_manifest->>'slug')
    OR NOT app.collaboration_valid_text(requested_manifest->>'displayName', 160)
    OR NOT app.collaboration_valid_text(requested_manifest->>'summary', 2000)
    OR requested_manifest->>'documentationPath' IS DISTINCT FROM (
      '/developers/integrations/' || (requested_manifest->>'slug')
    )
    OR requested_manifest->>'artifactSha256' !~ '^[0-9a-f]{64}$'
    OR requested_manifest->>'compatibilityContractSha256' !~ '^[0-9a-f]{64}$'
    OR NOT app.collaboration_valid_key_array(requested_manifest->'capabilities', 1, 100)
    OR requested_manifest->>'status' NOT IN ('draft','published','suspended','retired')
    OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'issuedAt')
    OR requested_manifest->>'authorizationDecisionSha256' !~ '^[0-9a-f]{64}$'
  THEN RAISE EXCEPTION 'developer portal entry manifest is invalid' USING ERRCODE = '23514'; END IF;
  IF requested_manifest->>'assetKind' IN ('connector','model_extension')
    AND requested_manifest->>'status' = 'published'
  THEN
    IF requested_manifest->>'extensionCertificationSha256' !~ '^[0-9a-f]{64}$'
      OR NOT EXISTS (
        SELECT 1 FROM app.integration_extension_certifications certification
        WHERE certification.organization_id = caller_organization_id
          AND certification.workspace_id = requested_workspace_id
          AND certification.manifest_sha256 = requested_manifest->>'extensionCertificationSha256'
          AND certification.issued_at <= (requested_manifest->>'issuedAt')::timestamptz
          AND certification.valid_until > (requested_manifest->>'issuedAt')::timestamptz
      )
    THEN RAISE EXCEPTION 'published extension listing lacks a current exact certification'
      USING ERRCODE = '23514'; END IF;
  ELSIF requested_manifest->'extensionCertificationSha256' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'non-extension listing cannot claim extension certification'
      USING ERRCODE = '23514';
  END IF;
  requested_id := (requested_manifest->>'entryId')::uuid;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    caller_organization_id::text || ':' || requested_workspace_id::text || ':' || requested_id::text,
    35010
  ));
  SELECT * INTO existing FROM app.developer_portal_entries candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.entry_id = requested_id;
  IF existing.entry_id IS NOT NULL THEN
    IF existing.entry_manifest IS DISTINCT FROM requested_manifest THEN
      RAISE EXCEPTION 'developer portal replay changed immutable entry content'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.entry_id;
  END IF;
  INSERT INTO app.developer_portal_entries (
    entry_id, integration_id, organization_id, workspace_id, owner_principal_id,
    asset_kind, slug, display_name, documentation_path, artifact_sha256,
    compatibility_contract_sha256, extension_certification_sha256, status,
    issued_at, entry_manifest, manifest_sha256
  ) VALUES (
    requested_id, (requested_manifest->>'integrationId')::uuid,
    caller_organization_id, requested_workspace_id,
    (requested_manifest->>'ownerPrincipalId')::uuid, requested_manifest->>'assetKind',
    requested_manifest->>'slug', requested_manifest->>'displayName',
    requested_manifest->>'documentationPath', requested_manifest->>'artifactSha256',
    requested_manifest->>'compatibilityContractSha256',
    requested_manifest->>'extensionCertificationSha256', requested_manifest->>'status',
    (requested_manifest->>'issuedAt')::timestamptz, requested_manifest,
    requested_manifest->>'manifestSha256'
  );
  RETURN requested_id;
END
$$;

CREATE OR REPLACE FUNCTION app.append_integration_audit_event(
  requested_workspace_id uuid,
  requested_manifest jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, audit
AS $$
DECLARE
  caller_organization_id uuid := app.current_organization_id();
  caller_subject_id uuid := app.current_subject_id();
  requested_sequence bigint;
  requested_occurred_at timestamptz;
  resource jsonb;
  head audit.integration_events%ROWTYPE;
  existing audit.integration_events%ROWTYPE;
BEGIN
  PERFORM app.collaboration_require_roles(
    requested_workspace_id, ARRAY['analyst','steward','validator','admin']
  );
  PERFORM app.collaboration_assert_manifest(requested_manifest, 'eventSha256', 262144);
  IF NOT app.collaboration_exact_keys(requested_manifest, ARRAY[
      'schemaVersion','sequence','previousEventSha256','eventSha256','recordClass',
      'auditEventId','organizationId','workspaceId','principalId','integrationId','action',
      'resource','outcome','reasonCode','policyVersion','traceId','occurredAt',
      'classification','requestSha256','relatedReceiptSha256'
    ])
    OR requested_manifest->>'recordClass' <> 'integration_audit_pointer_only'
    OR requested_manifest->>'organizationId' IS DISTINCT FROM caller_organization_id::text
    OR requested_manifest->>'workspaceId' IS DISTINCT FROM requested_workspace_id::text
    OR requested_manifest->>'principalId' IS DISTINCT FROM caller_subject_id::text
    OR NOT app.collaboration_valid_key(requested_manifest->>'action')
    OR requested_manifest->>'outcome' NOT IN ('allowed','denied','succeeded','failed')
    OR NOT app.collaboration_valid_key(requested_manifest->>'reasonCode')
    OR NOT app.collaboration_valid_key(requested_manifest->>'policyVersion')
    OR NOT app.collaboration_valid_iso_instant(requested_manifest->>'occurredAt')
    OR requested_manifest->>'classification' NOT IN ('public','internal','confidential','restricted')
    OR requested_manifest->>'requestSha256' !~ '^[0-9a-f]{64}$'
    OR NOT app.collaboration_valid_digest_array(requested_manifest->'relatedReceiptSha256', 0, 100)
    OR NOT app.collaboration_valid_integer_json(
      requested_manifest->'sequence', 1, 1000000000
    )
  THEN RAISE EXCEPTION 'integration audit pointer is invalid' USING ERRCODE = '23514'; END IF;
  resource := requested_manifest->'resource';
  IF NOT app.collaboration_exact_keys(resource, ARRAY[
      'resourceType','resourceId','resourceVersionSha256'
    ])
    OR NOT app.collaboration_valid_key(resource->>'resourceType')
    OR resource->>'resourceVersionSha256' !~ '^[0-9a-f]{64}$'
  THEN RAISE EXCEPTION 'integration audit resource pointer is invalid'
    USING ERRCODE = '23514'; END IF;
  requested_sequence := (requested_manifest->>'sequence')::bigint;
  requested_occurred_at := (requested_manifest->>'occurredAt')::timestamptz;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    caller_organization_id::text || ':' || requested_workspace_id::text, 35011
  ));
  SELECT * INTO existing FROM audit.integration_events candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
    AND candidate.audit_event_id = (requested_manifest->>'auditEventId')::uuid;
  IF existing.audit_event_id IS NOT NULL THEN
    IF existing.audit_manifest IS DISTINCT FROM requested_manifest THEN
      RAISE EXCEPTION 'integration audit replay changed immutable identity'
        USING ERRCODE = '23514';
    END IF;
    RETURN existing.event_sha256;
  END IF;
  SELECT * INTO head FROM audit.integration_events candidate
  WHERE candidate.organization_id = caller_organization_id
    AND candidate.workspace_id = requested_workspace_id
  ORDER BY candidate.sequence DESC LIMIT 1;
  IF requested_sequence <> coalesce(head.sequence, 0) + 1
    OR requested_manifest->>'previousEventSha256' IS DISTINCT FROM head.event_sha256
    OR (head.sequence IS NOT NULL AND requested_occurred_at < head.occurred_at)
  THEN RAISE EXCEPTION 'integration audit event breaks sequence or chronology'
    USING ERRCODE = '23514'; END IF;
  INSERT INTO audit.integration_events (
    organization_id, workspace_id, sequence, previous_event_sha256, event_sha256,
    audit_event_id, principal_id, integration_id, action, resource_type,
    resource_id, resource_version_sha256, outcome, reason_code, policy_version,
    trace_id, occurred_at, classification, request_sha256, audit_manifest
  ) VALUES (
    caller_organization_id, requested_workspace_id, requested_sequence,
    requested_manifest->>'previousEventSha256', requested_manifest->>'eventSha256',
    (requested_manifest->>'auditEventId')::uuid, caller_subject_id,
    (requested_manifest->>'integrationId')::uuid, requested_manifest->>'action',
    resource->>'resourceType', (resource->>'resourceId')::uuid,
    resource->>'resourceVersionSha256', requested_manifest->>'outcome',
    requested_manifest->>'reasonCode', requested_manifest->>'policyVersion',
    (requested_manifest->>'traceId')::uuid, requested_occurred_at,
    requested_manifest->>'classification', requested_manifest->>'requestSha256',
    requested_manifest
  );
  RETURN requested_manifest->>'eventSha256';
END
$$;

CREATE OR REPLACE FUNCTION app.get_collaboration_record(
  requested_workspace_id uuid,
  requested_record_id uuid
)
RETURNS TABLE (
  record_id uuid,
  record_version integer,
  event_manifest jsonb,
  event_sha256 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
  SELECT event.record_id, event.record_version, event.event_manifest, event.event_sha256
  FROM app.collaboration_record_events event
  WHERE event.organization_id = app.current_organization_id()
    AND event.workspace_id = requested_workspace_id
    AND event.record_id = requested_record_id
    AND evidence.economic_state_workspace_visible(event.organization_id, event.workspace_id)
  ORDER BY event.record_version DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.get_integration_api_credential_metadata(
  requested_workspace_id uuid,
  requested_credential_id uuid
)
RETURNS TABLE (
  credential_id uuid,
  principal_id uuid,
  scopes text[],
  issued_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  manifest_sha256 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
  SELECT credential.credential_id, credential.principal_id, credential.scopes,
    credential.issued_at, credential.expires_at, credential.revoked_at,
    credential.manifest_sha256
  FROM app.integration_api_credentials credential
  WHERE credential.organization_id = app.current_organization_id()
    AND credential.workspace_id = requested_workspace_id
    AND credential.credential_id = requested_credential_id
    AND evidence.economic_state_workspace_visible(
      credential.organization_id, credential.workspace_id
    )
$$;

CREATE OR REPLACE FUNCTION app.get_integration_quota_snapshot(
  requested_workspace_id uuid,
  requested_quota_id uuid
)
RETURNS TABLE (
  quota_id uuid,
  capability text,
  mode text,
  limit_units bigint,
  consumed_units bigint,
  outstanding_units bigint,
  head_event_sha256 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
  SELECT policy.quota_id, policy.capability, policy.mode, policy.limit_units,
    coalesce(head.total_consumed_units, 0), coalesce(head.total_outstanding_units, 0),
    head.event_sha256
  FROM app.integration_quota_policies policy
  LEFT JOIN LATERAL (
    SELECT event.total_consumed_units, event.total_outstanding_units, event.event_sha256
    FROM app.integration_quota_events event
    WHERE event.organization_id = policy.organization_id
      AND event.workspace_id = policy.workspace_id AND event.quota_id = policy.quota_id
    ORDER BY event.sequence DESC LIMIT 1
  ) head ON true
  WHERE policy.organization_id = app.current_organization_id()
    AND policy.workspace_id = requested_workspace_id
    AND policy.quota_id = requested_quota_id
    AND evidence.economic_state_workspace_visible(policy.organization_id, policy.workspace_id)
$$;

CREATE OR REPLACE FUNCTION app.get_integration_webhook_delivery(
  requested_workspace_id uuid,
  requested_endpoint_id uuid,
  requested_delivery_id uuid
)
RETURNS TABLE (
  delivery_id uuid,
  status text,
  attempt smallint,
  event_manifest jsonb,
  event_sha256 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
  SELECT event.delivery_id, event.status, event.attempt,
    event.event_manifest, event.event_sha256
  FROM app.integration_webhook_delivery_events event
  WHERE event.organization_id = app.current_organization_id()
    AND event.workspace_id = requested_workspace_id
    AND event.endpoint_id = requested_endpoint_id
    AND event.delivery_id = requested_delivery_id
    AND evidence.economic_state_workspace_visible(event.organization_id, event.workspace_id)
  ORDER BY event.sequence DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.get_integration_extension_manifest(
  requested_workspace_id uuid,
  requested_extension_id uuid,
  requested_extension_version text
)
RETURNS TABLE (
  extension_id uuid,
  extension_version text,
  extension_manifest jsonb,
  manifest_sha256 text,
  revoked_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
  SELECT extension.extension_id, extension.extension_version,
    extension.extension_manifest, extension.manifest_sha256, revocation.revoked_at
  FROM app.integration_extension_manifests extension
  LEFT JOIN app.integration_extension_revocations revocation
    ON revocation.organization_id = extension.organization_id
    AND revocation.workspace_id = extension.workspace_id
    AND revocation.extension_id = extension.extension_id
    AND revocation.extension_version = extension.extension_version
  WHERE extension.organization_id = app.current_organization_id()
    AND extension.workspace_id = requested_workspace_id
    AND extension.extension_id = requested_extension_id
    AND extension.extension_version = requested_extension_version
    AND evidence.economic_state_workspace_visible(extension.organization_id, extension.workspace_id)
$$;

CREATE OR REPLACE FUNCTION app.get_developer_portal_entry(
  requested_workspace_id uuid,
  requested_entry_id uuid
)
RETURNS TABLE (
  entry_id uuid,
  integration_id uuid,
  status text,
  entry_manifest jsonb,
  manifest_sha256 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
  SELECT entry.entry_id, entry.integration_id, entry.status,
    entry.entry_manifest, entry.manifest_sha256
  FROM app.developer_portal_entries entry
  WHERE entry.organization_id = app.current_organization_id()
    AND entry.workspace_id = requested_workspace_id
    AND entry.entry_id = requested_entry_id
    AND evidence.economic_state_workspace_visible(entry.organization_id, entry.workspace_id)
$$;

CREATE OR REPLACE FUNCTION app.reject_collaboration_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Phase 14 collaboration and integration records are append-only'
    USING ERRCODE = '55000';
END
$$;

DO $collaboration_triggers$
DECLARE
  relation_name text;
  schema_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'collaboration_record_events','collaboration_record_citations',
    'integration_api_credentials','integration_quota_policies','integration_quota_events',
    'integration_webhook_endpoints','integration_webhook_delivery_events',
    'integration_extension_manifests','integration_extension_certifications',
    'integration_extension_revocations','developer_portal_entries'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON app.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION app.reject_collaboration_mutation()',
      relation_name || '_reject_update_delete', relation_name
    );
  END LOOP;
  CREATE TRIGGER integration_events_reject_update_delete
  BEFORE UPDATE OR DELETE ON audit.integration_events
  FOR EACH ROW EXECUTE FUNCTION app.reject_collaboration_mutation();
END
$collaboration_triggers$;

DO $collaboration_rls$
DECLARE
  relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'collaboration_record_events','collaboration_record_citations',
    'integration_api_credentials','integration_quota_policies','integration_quota_events',
    'integration_webhook_endpoints','integration_webhook_delivery_events',
    'integration_extension_manifests','integration_extension_certifications',
    'integration_extension_revocations','developer_portal_entries'
  ] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format(
      'CREATE POLICY %I ON app.%I USING '
      || '(evidence.economic_state_workspace_visible(organization_id, workspace_id)) '
      || 'WITH CHECK '
      || '(evidence.economic_state_workspace_visible(organization_id, workspace_id))',
      relation_name || '_workspace', relation_name
    );
    EXECUTE format('REVOKE ALL ON TABLE app.%I FROM PUBLIC', relation_name);
    EXECUTE format(
      'REVOKE ALL ON TABLE app.%I FROM economyos_app, economyos_ingest', relation_name
    );
  END LOOP;
  ALTER TABLE audit.integration_events ENABLE ROW LEVEL SECURITY;
  ALTER TABLE audit.integration_events FORCE ROW LEVEL SECURITY;
  CREATE POLICY integration_events_workspace ON audit.integration_events
    USING (evidence.economic_state_workspace_visible(organization_id, workspace_id))
    WITH CHECK (evidence.economic_state_workspace_visible(organization_id, workspace_id));
  REVOKE ALL ON TABLE audit.integration_events FROM PUBLIC, economyos_app, economyos_ingest;
END
$collaboration_rls$;

CREATE INDEX collaboration_records_latest_idx
  ON app.collaboration_record_events(
    organization_id, workspace_id, record_id, record_version DESC
  );
CREATE INDEX collaboration_citations_evidence_idx
  ON app.collaboration_record_citations(
    organization_id, workspace_id, evidence_id, available_at DESC
  );
CREATE INDEX integration_credentials_principal_idx
  ON app.integration_api_credentials(
    organization_id, workspace_id, principal_id, expires_at DESC
  );
CREATE INDEX integration_quota_reservation_idx
  ON app.integration_quota_events(
    organization_id, workspace_id, quota_id, reservation_id, sequence DESC
  ) WHERE reservation_id IS NOT NULL;
CREATE INDEX integration_webhook_delivery_latest_idx
  ON app.integration_webhook_delivery_events(
    organization_id, workspace_id, endpoint_id, delivery_id, sequence DESC
  );
CREATE INDEX integration_extension_certification_current_idx
  ON app.integration_extension_certifications(
    organization_id, workspace_id, extension_id, extension_version,
    issued_at DESC, valid_until DESC
  );
CREATE INDEX developer_portal_status_idx
  ON app.developer_portal_entries(
    organization_id, workspace_id, status, asset_kind, slug
  );
CREATE INDEX integration_audit_time_idx
  ON audit.integration_events(organization_id, workspace_id, occurred_at DESC, sequence DESC);

DO $collaboration_revoke_functions$
DECLARE
  signature regprocedure;
BEGIN
  FOR signature IN
    SELECT procedure.oid::regprocedure
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname IN ('app','audit')
      AND procedure.proname LIKE '%collaboration%'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, economyos_app, economyos_ingest', signature
    );
  END LOOP;
END
$collaboration_revoke_functions$;

REVOKE ALL ON FUNCTION app.register_integration_api_credential(uuid,jsonb)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.register_integration_quota_policy(uuid,jsonb)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.append_integration_quota_event(uuid,jsonb)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.register_integration_webhook_endpoint(uuid,jsonb)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.append_integration_webhook_delivery_event(uuid,jsonb)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.register_integration_extension_manifest(uuid,jsonb)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.register_integration_extension_certification(uuid,jsonb)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.register_integration_extension_revocation(uuid,jsonb)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.register_developer_portal_entry(uuid,jsonb)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.append_integration_audit_event(uuid,jsonb)
  FROM PUBLIC, economyos_ingest;

GRANT EXECUTE ON FUNCTION app.append_collaboration_record_event(uuid,jsonb) TO economyos_app;
GRANT EXECUTE ON FUNCTION app.register_integration_api_credential(uuid,jsonb) TO economyos_app;
GRANT EXECUTE ON FUNCTION app.register_integration_quota_policy(uuid,jsonb) TO economyos_app;
GRANT EXECUTE ON FUNCTION app.append_integration_quota_event(uuid,jsonb) TO economyos_app;
GRANT EXECUTE ON FUNCTION app.register_integration_webhook_endpoint(uuid,jsonb) TO economyos_app;
GRANT EXECUTE ON FUNCTION app.append_integration_webhook_delivery_event(uuid,jsonb) TO economyos_app;
GRANT EXECUTE ON FUNCTION app.register_integration_extension_manifest(uuid,jsonb) TO economyos_app;
GRANT EXECUTE ON FUNCTION app.register_integration_extension_certification(uuid,jsonb) TO economyos_app;
GRANT EXECUTE ON FUNCTION app.register_integration_extension_revocation(uuid,jsonb) TO economyos_app;
GRANT EXECUTE ON FUNCTION app.register_developer_portal_entry(uuid,jsonb) TO economyos_app;
GRANT EXECUTE ON FUNCTION app.append_integration_audit_event(uuid,jsonb) TO economyos_app;

REVOKE ALL ON FUNCTION app.get_integration_api_credential_metadata(uuid,uuid)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.get_integration_quota_snapshot(uuid,uuid)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.get_integration_webhook_delivery(uuid,uuid,uuid)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.get_integration_extension_manifest(uuid,uuid,text)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.get_developer_portal_entry(uuid,uuid)
  FROM PUBLIC, economyos_ingest;

GRANT EXECUTE ON FUNCTION app.get_collaboration_record(uuid,uuid) TO economyos_app;
GRANT EXECUTE ON FUNCTION app.get_integration_api_credential_metadata(uuid,uuid) TO economyos_app;
GRANT EXECUTE ON FUNCTION app.get_integration_quota_snapshot(uuid,uuid) TO economyos_app;
GRANT EXECUTE ON FUNCTION app.get_integration_webhook_delivery(uuid,uuid,uuid) TO economyos_app;
GRANT EXECUTE ON FUNCTION app.get_integration_extension_manifest(uuid,uuid,text) TO economyos_app;
GRANT EXECUTE ON FUNCTION app.get_developer_portal_entry(uuid,uuid) TO economyos_app;

COMMENT ON TABLE app.collaboration_record_events IS
  'Append-only, cited, non-authoritative discussion over a pinned PIT artifact; no scientific value column.';
COMMENT ON TABLE app.integration_api_credentials IS
  'Immutable API credential metadata containing a secret digest only, never plaintext secret material.';
COMMENT ON TABLE app.integration_quota_events IS
  'Append-only atomic quota reservation, usage, expiry, and reconciliation ledger.';
COMMENT ON TABLE app.integration_webhook_delivery_events IS
  'Tamper-evident webhook delivery state transitions retaining envelope digests, not payloads.';
COMMENT ON TABLE app.integration_extension_manifests IS
  'Immutable connector/model declaration with explicit sandbox, resource, classification, capability, and egress bounds.';
COMMENT ON TABLE app.developer_portal_entries IS
  'Immutable developer catalog entry bound to compatibility and, for published extensions, certification evidence.';
COMMENT ON TABLE audit.integration_events IS
  'Tamper-evident pointer-only integration audit ledger; raw payloads and scientific values are prohibited.';
COMMENT ON FUNCTION app.get_collaboration_record(uuid,uuid) IS
  'Non-enumerating exact tenant/workspace read for the latest immutable collaboration record version.';
COMMENT ON FUNCTION app.get_developer_portal_entry(uuid,uuid) IS
  'Non-enumerating exact tenant/workspace read for one immutable developer portal entry.';
