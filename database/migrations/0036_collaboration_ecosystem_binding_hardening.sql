-- Close cross-entity and historical-authorization gaps discovered by the
-- independent Phase 14 persistence review. Migration 0035 remains immutable;
-- this forward-only correction makes certification and publication evidence
-- structurally meaningful instead of accepting unrelated digests.

ALTER TABLE app.integration_extension_manifests
  ADD CONSTRAINT integration_extension_manifests_publisher_subject_fk
  FOREIGN KEY (publisher_id) REFERENCES app.subjects(id) ON DELETE RESTRICT;

ALTER TABLE app.developer_portal_entries
  ADD CONSTRAINT developer_portal_entries_certification_fk
  FOREIGN KEY (organization_id, workspace_id, extension_certification_sha256)
  REFERENCES app.integration_extension_certifications(
    organization_id, workspace_id, manifest_sha256
  ) ON DELETE RESTRICT;

-- Match the canonical validators used by the TypeScript domain. Fractional
-- instants are either omitted or exactly millisecond precision; numeric
-- prerelease identifiers may not contain leading zeroes.
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
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{3})?Z$'
  THEN RETURN false; END IF;
  parsed := requested_value::timestamptz;
  RETURN isfinite(parsed);
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
  RETURN false;
END
$$;

CREATE OR REPLACE FUNCTION app.collaboration_valid_semver(requested_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  prerelease text;
BEGIN
  IF requested_value IS NULL OR length(requested_value) NOT BETWEEN 5 AND 128
    OR requested_value !~
      '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
  THEN RETURN false; END IF;
  prerelease := substring(requested_value FROM '-([^+]+)');
  IF prerelease IS NOT NULL AND EXISTS (
    SELECT 1
    FROM unnest(string_to_array(prerelease, '.')) identifier
    WHERE identifier ~ '^[0-9]+$' AND identifier ~ '^0[0-9]+$'
  ) THEN RETURN false; END IF;
  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION app.phase14_role_allowed_at(
  requested_organization_id uuid,
  requested_workspace_id uuid,
  requested_subject_id uuid,
  requested_at timestamptz,
  requested_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT coalesce(
    app.collaboration_workspace_role_internal(
      requested_organization_id,
      requested_workspace_id,
      requested_subject_id,
      requested_at
    ) = ANY(requested_roles),
    false
  )
$$;

REVOKE ALL ON FUNCTION app.phase14_role_allowed_at(
  uuid, uuid, uuid, timestamptz, text[]
) FROM PUBLIC, economyos_app, economyos_ingest;

CREATE OR REPLACE FUNCTION app.validate_phase14_actor_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  actor_id uuid;
  action_at timestamptz;
  allowed_roles text[];
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'collaboration_record_events' THEN
      actor_id := NEW.actor_id;
      action_at := NEW.occurred_at;
      allowed_roles := ARRAY['analyst','steward','validator','admin'];
    WHEN 'integration_api_credentials' THEN
      actor_id := NEW.principal_id;
      action_at := NEW.issued_at;
      allowed_roles := ARRAY['admin'];
    WHEN 'integration_quota_events' THEN
      actor_id := NEW.principal_id;
      action_at := NEW.occurred_at;
      allowed_roles := CASE WHEN NEW.action = 'reconciled'
        THEN ARRAY['admin']
        ELSE ARRAY['analyst','steward','validator','admin']
      END;
    WHEN 'integration_webhook_delivery_events' THEN
      actor_id := app.current_subject_id();
      action_at := NEW.occurred_at;
      allowed_roles := ARRAY['admin'];
    WHEN 'integration_extension_manifests' THEN
      actor_id := app.current_subject_id();
      action_at := NEW.created_at;
      allowed_roles := ARRAY['admin'];
      IF NOT app.phase14_role_allowed_at(
        NEW.organization_id, NEW.workspace_id, NEW.publisher_id,
        NEW.created_at, ARRAY['viewer','analyst','steward','validator','admin']
      ) THEN
        RAISE EXCEPTION 'extension publisher is not a member of the tenant workspace at creation'
          USING ERRCODE = '23514';
      END IF;
    WHEN 'integration_extension_certifications' THEN
      actor_id := NEW.certified_by;
      action_at := NEW.issued_at;
      allowed_roles := ARRAY['steward','validator','admin'];
    WHEN 'integration_extension_revocations' THEN
      actor_id := NEW.revoked_by;
      action_at := NEW.revoked_at;
      allowed_roles := ARRAY['admin'];
    WHEN 'developer_portal_entries' THEN
      actor_id := app.current_subject_id();
      action_at := NEW.issued_at;
      allowed_roles := ARRAY['admin'];
      IF NOT app.phase14_role_allowed_at(
        NEW.organization_id, NEW.workspace_id, NEW.owner_principal_id,
        NEW.issued_at, ARRAY['viewer','analyst','steward','validator','admin']
      ) THEN
        RAISE EXCEPTION 'developer portal owner is not a member of the tenant workspace at issuance'
          USING ERRCODE = '23514';
      END IF;
    WHEN 'integration_events' THEN
      actor_id := NEW.principal_id;
      action_at := NEW.occurred_at;
      allowed_roles := ARRAY['analyst','steward','validator','admin'];
    ELSE
      RAISE EXCEPTION 'unsupported Phase 14 actor-timeline relation %', TG_TABLE_NAME
        USING ERRCODE = '23514';
  END CASE;

  IF actor_id IS NULL OR action_at IS NULL OR NOT app.phase14_role_allowed_at(
    NEW.organization_id, NEW.workspace_id, actor_id, action_at, allowed_roles
  ) THEN
    RAISE EXCEPTION 'Phase 14 actor was not authorized in the tenant workspace at event time'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION app.validate_phase14_actor_timeline()
  FROM PUBLIC, economyos_app, economyos_ingest;

CREATE TRIGGER phase14_actor_timeline_guard
BEFORE INSERT ON app.collaboration_record_events
FOR EACH ROW EXECUTE FUNCTION app.validate_phase14_actor_timeline();
CREATE TRIGGER phase14_actor_timeline_guard
BEFORE INSERT ON app.integration_api_credentials
FOR EACH ROW EXECUTE FUNCTION app.validate_phase14_actor_timeline();
CREATE TRIGGER phase14_actor_timeline_guard
BEFORE INSERT ON app.integration_quota_events
FOR EACH ROW EXECUTE FUNCTION app.validate_phase14_actor_timeline();
CREATE TRIGGER phase14_actor_timeline_guard
BEFORE INSERT ON app.integration_webhook_delivery_events
FOR EACH ROW EXECUTE FUNCTION app.validate_phase14_actor_timeline();
CREATE TRIGGER phase14_actor_timeline_guard
BEFORE INSERT ON app.integration_extension_manifests
FOR EACH ROW EXECUTE FUNCTION app.validate_phase14_actor_timeline();
CREATE TRIGGER phase14_actor_timeline_guard
BEFORE INSERT ON app.integration_extension_certifications
FOR EACH ROW EXECUTE FUNCTION app.validate_phase14_actor_timeline();
CREATE TRIGGER phase14_actor_timeline_guard
BEFORE INSERT ON app.integration_extension_revocations
FOR EACH ROW EXECUTE FUNCTION app.validate_phase14_actor_timeline();
CREATE TRIGGER phase14_actor_timeline_guard
BEFORE INSERT ON app.developer_portal_entries
FOR EACH ROW EXECUTE FUNCTION app.validate_phase14_actor_timeline();
CREATE TRIGGER phase14_actor_timeline_guard
BEFORE INSERT ON audit.integration_events
FOR EACH ROW EXECUTE FUNCTION app.validate_phase14_actor_timeline();

CREATE OR REPLACE FUNCTION app.validate_phase14_extension_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  extension app.integration_extension_manifests%ROWTYPE;
  certification app.integration_extension_certifications%ROWTYPE;
  prior_certification_issued_at timestamptz;
BEGIN
  IF TG_TABLE_NAME = 'integration_extension_certifications' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      NEW.organization_id::text || ':' || NEW.workspace_id::text || ':'
        || NEW.extension_id::text || ':' || NEW.extension_version,
      35012
    ));
    SELECT * INTO extension
    FROM app.integration_extension_manifests candidate
    WHERE candidate.organization_id = NEW.organization_id
      AND candidate.workspace_id = NEW.workspace_id
      AND candidate.extension_id = NEW.extension_id
      AND candidate.extension_version = NEW.extension_version;
    SELECT max(candidate.issued_at) INTO prior_certification_issued_at
    FROM app.integration_extension_certifications candidate
    WHERE candidate.organization_id = NEW.organization_id
      AND candidate.workspace_id = NEW.workspace_id
      AND candidate.extension_id = NEW.extension_id
      AND candidate.extension_version = NEW.extension_version;
    IF extension.extension_id IS NULL
      OR NEW.extension_manifest_sha256 IS DISTINCT FROM extension.manifest_sha256
      OR NEW.certified_by = extension.publisher_id
      OR NEW.issued_at < extension.created_at
      OR (prior_certification_issued_at IS NOT NULL
        AND NEW.issued_at <= prior_certification_issued_at)
      OR EXISTS (
        SELECT 1 FROM app.integration_extension_revocations revocation
        WHERE revocation.organization_id = NEW.organization_id
          AND revocation.workspace_id = NEW.workspace_id
          AND revocation.extension_id = NEW.extension_id
          AND revocation.extension_version = NEW.extension_version
      )
    THEN
      RAISE EXCEPTION 'extension certification is self-issued, stale, non-monotonic, or misbound'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'integration_extension_revocations' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      NEW.organization_id::text || ':' || NEW.workspace_id::text || ':'
        || NEW.extension_id::text || ':' || NEW.extension_version,
      35012
    ));
    SELECT * INTO extension
    FROM app.integration_extension_manifests candidate
    WHERE candidate.organization_id = NEW.organization_id
      AND candidate.workspace_id = NEW.workspace_id
      AND candidate.extension_id = NEW.extension_id
      AND candidate.extension_version = NEW.extension_version;
    SELECT max(candidate.issued_at) INTO prior_certification_issued_at
    FROM app.integration_extension_certifications candidate
    WHERE candidate.organization_id = NEW.organization_id
      AND candidate.workspace_id = NEW.workspace_id
      AND candidate.extension_id = NEW.extension_id
      AND candidate.extension_version = NEW.extension_version;
    IF extension.extension_id IS NULL
      OR NEW.revoked_at < extension.created_at
      OR (prior_certification_issued_at IS NOT NULL
        AND NEW.revoked_at < prior_certification_issued_at)
    THEN
      RAISE EXCEPTION 'extension revocation predates its manifest or latest certification'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'developer_portal_entries' THEN
    IF NEW.asset_kind IN ('connector','model_extension') AND NEW.status = 'published' THEN
      SELECT * INTO certification
      FROM app.integration_extension_certifications candidate
      WHERE candidate.organization_id = NEW.organization_id
        AND candidate.workspace_id = NEW.workspace_id
        AND candidate.manifest_sha256 = NEW.extension_certification_sha256;
      IF certification.certification_id IS NULL THEN
        RAISE EXCEPTION 'published extension listing lacks exact certification evidence'
          USING ERRCODE = '23514';
      END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended(
        NEW.organization_id::text || ':' || NEW.workspace_id::text || ':'
          || certification.extension_id::text || ':' || certification.extension_version,
        35012
      ));
      SELECT * INTO extension
      FROM app.integration_extension_manifests candidate
      WHERE candidate.organization_id = certification.organization_id
        AND candidate.workspace_id = certification.workspace_id
        AND candidate.extension_id = certification.extension_id
        AND candidate.extension_version = certification.extension_version;
      IF extension.extension_id IS NULL
        OR NEW.integration_id IS DISTINCT FROM extension.extension_id
        OR NEW.artifact_sha256 IS DISTINCT FROM extension.artifact_sha256
        OR NEW.compatibility_contract_sha256
          IS DISTINCT FROM certification.compatibility_contract_sha256
        OR certification.extension_manifest_sha256 IS DISTINCT FROM extension.manifest_sha256
        OR NEW.entry_manifest->'capabilities'
          IS DISTINCT FROM extension.extension_manifest->'capabilities'
        OR NEW.asset_kind IS DISTINCT FROM (CASE extension.kind
          WHEN 'connector' THEN 'connector' ELSE 'model_extension' END)
        OR certification.issued_at > NEW.issued_at
        OR certification.valid_until <= NEW.issued_at
        OR EXISTS (
          SELECT 1 FROM app.integration_extension_revocations revocation
          WHERE revocation.organization_id = certification.organization_id
            AND revocation.workspace_id = certification.workspace_id
            AND revocation.extension_id = certification.extension_id
            AND revocation.extension_version = certification.extension_version
        )
      THEN
        RAISE EXCEPTION 'published extension listing is revoked, stale, or not exactly certified'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported Phase 14 extension-binding relation %', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION app.validate_phase14_extension_binding()
  FROM PUBLIC, economyos_app, economyos_ingest;

CREATE TRIGGER phase14_extension_binding_guard
BEFORE INSERT ON app.integration_extension_certifications
FOR EACH ROW EXECUTE FUNCTION app.validate_phase14_extension_binding();
CREATE TRIGGER phase14_extension_binding_guard
BEFORE INSERT ON app.integration_extension_revocations
FOR EACH ROW EXECUTE FUNCTION app.validate_phase14_extension_binding();
CREATE TRIGGER phase14_extension_binding_guard
BEFORE INSERT ON app.developer_portal_entries
FOR EACH ROW EXECUTE FUNCTION app.validate_phase14_extension_binding();

-- A historically valid listing remains immutable audit evidence, but the
-- serving boundary must stop advertising it after expiry or revocation.
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
    AND (
      entry.asset_kind NOT IN ('connector','model_extension')
      OR entry.status <> 'published'
      OR EXISTS (
        SELECT 1
        FROM app.integration_extension_certifications certification
        JOIN app.integration_extension_manifests extension
          ON extension.organization_id = certification.organization_id
          AND extension.workspace_id = certification.workspace_id
          AND extension.extension_id = certification.extension_id
          AND extension.extension_version = certification.extension_version
        WHERE certification.organization_id = entry.organization_id
          AND certification.workspace_id = entry.workspace_id
          AND certification.manifest_sha256 = entry.extension_certification_sha256
          AND certification.extension_manifest_sha256 = extension.manifest_sha256
          AND certification.issued_at <= statement_timestamp()
          AND certification.valid_until > statement_timestamp()
          AND entry.integration_id = extension.extension_id
          AND entry.artifact_sha256 = extension.artifact_sha256
          AND entry.compatibility_contract_sha256
            = certification.compatibility_contract_sha256
          AND entry.entry_manifest->'capabilities'
            = extension.extension_manifest->'capabilities'
          AND entry.asset_kind = (CASE extension.kind
            WHEN 'connector' THEN 'connector' ELSE 'model_extension' END)
          AND NOT EXISTS (
            SELECT 1 FROM app.integration_extension_revocations revocation
            WHERE revocation.organization_id = extension.organization_id
              AND revocation.workspace_id = extension.workspace_id
              AND revocation.extension_id = extension.extension_id
              AND revocation.extension_version = extension.extension_version
              AND revocation.revoked_at <= statement_timestamp()
          )
      )
    )
$$;

REVOKE ALL ON FUNCTION app.get_developer_portal_entry(uuid,uuid)
  FROM PUBLIC, economyos_ingest;
GRANT EXECUTE ON FUNCTION app.get_developer_portal_entry(uuid,uuid) TO economyos_app;

DO $phase14_existing_binding_validation$
BEGIN
  IF EXISTS (
    SELECT 1 FROM app.integration_extension_manifests extension
    WHERE NOT app.phase14_role_allowed_at(
      extension.organization_id, extension.workspace_id, extension.publisher_id,
      extension.created_at, ARRAY['viewer','analyst','steward','validator','admin']
    )
  ) THEN
    RAISE EXCEPTION 'existing extension publisher lacks historical workspace membership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM app.integration_extension_certifications certification
    JOIN app.integration_extension_manifests extension
      ON extension.organization_id = certification.organization_id
      AND extension.workspace_id = certification.workspace_id
      AND extension.extension_id = certification.extension_id
      AND extension.extension_version = certification.extension_version
    WHERE certification.certified_by = extension.publisher_id
      OR certification.extension_manifest_sha256 <> extension.manifest_sha256
      OR certification.issued_at < extension.created_at
      OR NOT app.phase14_role_allowed_at(
        certification.organization_id, certification.workspace_id,
        certification.certified_by, certification.issued_at,
        ARRAY['steward','validator','admin']
      )
  ) THEN
    RAISE EXCEPTION 'existing extension certification is self-issued, misbound, or unauthorized';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM app.integration_extension_revocations revocation
    LEFT JOIN LATERAL (
      SELECT max(certification.issued_at) AS issued_at
      FROM app.integration_extension_certifications certification
      WHERE certification.organization_id = revocation.organization_id
        AND certification.workspace_id = revocation.workspace_id
        AND certification.extension_id = revocation.extension_id
        AND certification.extension_version = revocation.extension_version
    ) latest ON true
    WHERE revocation.revoked_at < latest.issued_at
      OR NOT app.phase14_role_allowed_at(
        revocation.organization_id, revocation.workspace_id,
        revocation.revoked_by, revocation.revoked_at, ARRAY['admin']
      )
  ) THEN
    RAISE EXCEPTION 'existing extension revocation predates certification or lacks authorization';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM app.developer_portal_entries entry
    LEFT JOIN app.integration_extension_certifications certification
      ON certification.organization_id = entry.organization_id
      AND certification.workspace_id = entry.workspace_id
      AND certification.manifest_sha256 = entry.extension_certification_sha256
    LEFT JOIN app.integration_extension_manifests extension
      ON extension.organization_id = certification.organization_id
      AND extension.workspace_id = certification.workspace_id
      AND extension.extension_id = certification.extension_id
      AND extension.extension_version = certification.extension_version
    WHERE NOT app.phase14_role_allowed_at(
        entry.organization_id, entry.workspace_id, entry.owner_principal_id,
        entry.issued_at, ARRAY['viewer','analyst','steward','validator','admin']
      )
      OR (
        entry.asset_kind IN ('connector','model_extension') AND entry.status = 'published'
        AND (
          certification.certification_id IS NULL
          OR extension.extension_id IS NULL
          OR entry.integration_id <> extension.extension_id
          OR entry.artifact_sha256 <> extension.artifact_sha256
          OR entry.compatibility_contract_sha256 <> certification.compatibility_contract_sha256
          OR certification.extension_manifest_sha256 <> extension.manifest_sha256
          OR entry.entry_manifest->'capabilities'
            <> extension.extension_manifest->'capabilities'
          OR entry.asset_kind <> (CASE extension.kind
            WHEN 'connector' THEN 'connector' ELSE 'model_extension' END)
          OR certification.issued_at > entry.issued_at
          OR certification.valid_until <= entry.issued_at
          OR EXISTS (
            SELECT 1 FROM app.integration_extension_revocations revocation
            WHERE revocation.organization_id = extension.organization_id
              AND revocation.workspace_id = extension.workspace_id
              AND revocation.extension_id = extension.extension_id
              AND revocation.extension_version = extension.extension_version
              AND revocation.revoked_at <= entry.issued_at
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'existing developer portal entry is cross-tenant, stale, or misbound';
  END IF;
END
$phase14_existing_binding_validation$;

COMMENT ON FUNCTION app.validate_phase14_extension_binding() IS
  'Serializes and validates publisher/certifier separation, monotonic revocation, and exact live portal certification binding.';
COMMENT ON FUNCTION app.get_developer_portal_entry(uuid,uuid) IS
  'Non-enumerating exact portal read that hides expired or revoked published extensions.';
