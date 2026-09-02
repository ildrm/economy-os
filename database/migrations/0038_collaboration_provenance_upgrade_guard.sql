-- Fail closed when the Phase 14 binding hardening introduced by migration 0036
-- cannot be proven for legacy rows. Migrations 0035 through 0037 are immutable;
-- this forward-only correction also persists the caller behind every future
-- registration or webhook-delivery event that previously lacked attribution.

DO $phase14_canonical_upgrade_validation$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM app.integration_extension_manifests extension
    WHERE NOT app.collaboration_valid_semver(extension.extension_version)
      OR NOT app.collaboration_valid_semver(extension.extension_api_version)
      OR extension.extension_manifest->>'version'
        IS DISTINCT FROM extension.extension_version
      OR extension.extension_manifest->>'extensionApiVersion'
        IS DISTINCT FROM extension.extension_api_version
      OR NOT app.collaboration_valid_semver(extension.extension_manifest->>'version')
      OR NOT app.collaboration_valid_semver(
        extension.extension_manifest->>'extensionApiVersion'
      )
  ) THEN
    RAISE EXCEPTION 'Phase 14 upgrade rejected a noncanonical semantic version'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM app.collaboration_record_events event
    WHERE NOT app.collaboration_valid_iso_instant(event.event_manifest->>'occurredAt')
      OR NOT app.collaboration_valid_iso_instant(
        event.event_manifest#>>'{artifact,asOf}'
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(event.event_manifest->'citations') citation
        WHERE NOT app.collaboration_valid_iso_instant(citation->>'availableAt')
      )
    UNION ALL
    SELECT 1 FROM app.collaboration_record_citations citation
    WHERE NOT app.collaboration_valid_iso_instant(
      citation.citation_manifest->>'availableAt'
    )
    UNION ALL
    SELECT 1 FROM app.integration_api_credentials credential
    WHERE NOT app.collaboration_valid_iso_instant(
        credential.credential_manifest->>'issuedAt'
      )
      OR NOT app.collaboration_valid_iso_instant(
        credential.credential_manifest->>'expiresAt'
      )
      OR (
        credential.credential_manifest->'revokedAt' <> 'null'::jsonb
        AND NOT app.collaboration_valid_iso_instant(
          credential.credential_manifest->>'revokedAt'
        )
      )
    UNION ALL
    SELECT 1 FROM app.integration_quota_policies policy
    WHERE NOT app.collaboration_valid_iso_instant(
        policy.policy_manifest->>'windowStartsAt'
      )
      OR NOT app.collaboration_valid_iso_instant(
        policy.policy_manifest->>'windowEndsAt'
      )
    UNION ALL
    SELECT 1 FROM app.integration_quota_events event
    WHERE NOT app.collaboration_valid_iso_instant(event.event_manifest->>'occurredAt')
      OR (
        event.event_manifest->'reservationExpiresAt' <> 'null'::jsonb
        AND NOT app.collaboration_valid_iso_instant(
          event.event_manifest->>'reservationExpiresAt'
        )
      )
    UNION ALL
    SELECT 1 FROM app.integration_webhook_delivery_events event
    WHERE NOT app.collaboration_valid_iso_instant(event.event_manifest->>'occurredAt')
      OR (
        event.event_manifest->'retryAt' <> 'null'::jsonb
        AND NOT app.collaboration_valid_iso_instant(event.event_manifest->>'retryAt')
      )
    UNION ALL
    SELECT 1 FROM app.integration_extension_manifests extension
    WHERE NOT app.collaboration_valid_iso_instant(
      extension.extension_manifest->>'createdAt'
    )
    UNION ALL
    SELECT 1 FROM app.integration_extension_certifications certification
    WHERE NOT app.collaboration_valid_iso_instant(
        certification.certification_manifest->>'issuedAt'
      )
      OR NOT app.collaboration_valid_iso_instant(
        certification.certification_manifest->>'validUntil'
      )
    UNION ALL
    SELECT 1 FROM app.integration_extension_revocations revocation
    WHERE NOT app.collaboration_valid_iso_instant(
      revocation.revocation_manifest->>'revokedAt'
    )
    UNION ALL
    SELECT 1 FROM app.developer_portal_entries entry
    WHERE NOT app.collaboration_valid_iso_instant(entry.entry_manifest->>'issuedAt')
    UNION ALL
    SELECT 1 FROM audit.integration_events event
    WHERE NOT app.collaboration_valid_iso_instant(event.audit_manifest->>'occurredAt')
    UNION ALL
    SELECT 1 FROM app.integration_api_credential_lifecycle_events event
    WHERE NOT app.collaboration_valid_iso_instant(event.event_manifest->>'occurredAt')
    UNION ALL
    SELECT 1 FROM app.integration_webhook_endpoint_lifecycle_events event
    WHERE NOT app.collaboration_valid_iso_instant(event.event_manifest->>'occurredAt')
    UNION ALL
    SELECT 1 FROM app.developer_portal_entry_lifecycle_events event
    WHERE NOT app.collaboration_valid_iso_instant(event.event_manifest->>'occurredAt')
  ) THEN
    RAISE EXCEPTION 'Phase 14 upgrade rejected a noncanonical UTC instant'
      USING ERRCODE = '23514';
  END IF;
END
$phase14_canonical_upgrade_validation$;

DO $phase14_actor_upgrade_validation$
BEGIN
  IF EXISTS (
    SELECT 1 FROM app.collaboration_record_events event
    WHERE NOT app.phase14_role_allowed_at(
      event.organization_id, event.workspace_id, event.actor_id,
      event.occurred_at, ARRAY['analyst','steward','validator','admin']
    )
    UNION ALL
    SELECT 1 FROM app.integration_api_credentials credential
    WHERE NOT app.phase14_role_allowed_at(
      credential.organization_id, credential.workspace_id,
      credential.principal_id, credential.issued_at, ARRAY['admin']
    )
    UNION ALL
    SELECT 1 FROM app.integration_quota_events event
    WHERE NOT app.phase14_role_allowed_at(
      event.organization_id, event.workspace_id, event.principal_id,
      event.occurred_at,
      CASE WHEN event.action = 'reconciled'
        THEN ARRAY['admin']
        ELSE ARRAY['analyst','steward','validator','admin']
      END
    )
    UNION ALL
    SELECT 1 FROM app.integration_extension_manifests extension
    WHERE NOT app.phase14_role_allowed_at(
      extension.organization_id, extension.workspace_id, extension.publisher_id,
      extension.created_at, ARRAY['viewer','analyst','steward','validator','admin']
    )
    UNION ALL
    SELECT 1 FROM app.integration_extension_certifications certification
    WHERE NOT app.phase14_role_allowed_at(
      certification.organization_id, certification.workspace_id,
      certification.certified_by, certification.issued_at,
      ARRAY['steward','validator','admin']
    )
    UNION ALL
    SELECT 1 FROM app.integration_extension_revocations revocation
    WHERE NOT app.phase14_role_allowed_at(
      revocation.organization_id, revocation.workspace_id,
      revocation.revoked_by, revocation.revoked_at, ARRAY['admin']
    )
    UNION ALL
    SELECT 1 FROM app.developer_portal_entries entry
    WHERE NOT app.phase14_role_allowed_at(
      entry.organization_id, entry.workspace_id, entry.owner_principal_id,
      entry.issued_at, ARRAY['viewer','analyst','steward','validator','admin']
    )
    UNION ALL
    SELECT 1 FROM audit.integration_events event
    WHERE NOT app.phase14_role_allowed_at(
      event.organization_id, event.workspace_id, event.principal_id,
      event.occurred_at, ARRAY['analyst','steward','validator','admin']
    )
    UNION ALL
    SELECT 1 FROM app.integration_api_credential_lifecycle_events event
    WHERE NOT app.phase14_role_allowed_at(
      event.organization_id, event.workspace_id, event.actor_id,
      event.occurred_at, ARRAY['admin']
    )
    UNION ALL
    SELECT 1 FROM app.integration_webhook_endpoint_lifecycle_events event
    WHERE NOT app.phase14_role_allowed_at(
      event.organization_id, event.workspace_id, event.actor_id,
      event.occurred_at, ARRAY['admin']
    )
    UNION ALL
    SELECT 1 FROM app.developer_portal_entry_lifecycle_events event
    WHERE NOT app.phase14_role_allowed_at(
      event.organization_id, event.workspace_id, event.actor_id,
      event.occurred_at, ARRAY['admin']
    )
  ) THEN
    RAISE EXCEPTION 'Phase 14 upgrade rejected an unauthorized historical actor'
      USING ERRCODE = '23514';
  END IF;
END
$phase14_actor_upgrade_validation$;

DO $phase14_binding_upgrade_validation$
BEGIN
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
  ) THEN
    RAISE EXCEPTION 'Phase 14 upgrade rejected a self-issued or misbound certification'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT certification.issued_at,
        lag(certification.issued_at) OVER (
          PARTITION BY certification.organization_id, certification.workspace_id,
            certification.extension_id, certification.extension_version
          ORDER BY certification.recorded_at, certification.certification_id
        ) AS prior_issued_at,
        certification.recorded_at,
        lag(certification.recorded_at) OVER (
          PARTITION BY certification.organization_id, certification.workspace_id,
            certification.extension_id, certification.extension_version
          ORDER BY certification.recorded_at, certification.certification_id
        ) AS prior_recorded_at
      FROM app.integration_extension_certifications certification
    ) ordered
    WHERE ordered.prior_issued_at IS NOT NULL
      AND (
        ordered.issued_at <= ordered.prior_issued_at
        OR ordered.recorded_at <= ordered.prior_recorded_at
      )
  ) THEN
    RAISE EXCEPTION 'Phase 14 upgrade rejected a non-monotonic certification history'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM app.integration_extension_revocations revocation
    JOIN app.integration_extension_manifests extension
      ON extension.organization_id = revocation.organization_id
      AND extension.workspace_id = revocation.workspace_id
      AND extension.extension_id = revocation.extension_id
      AND extension.extension_version = revocation.extension_version
    LEFT JOIN LATERAL (
      SELECT max(certification.issued_at) AS issued_at
      FROM app.integration_extension_certifications certification
      WHERE certification.organization_id = revocation.organization_id
        AND certification.workspace_id = revocation.workspace_id
        AND certification.extension_id = revocation.extension_id
        AND certification.extension_version = revocation.extension_version
    ) latest ON true
    WHERE revocation.revoked_at < extension.created_at
      OR revocation.revoked_at < latest.issued_at
  ) THEN
    RAISE EXCEPTION 'Phase 14 upgrade rejected a non-monotonic extension revocation'
      USING ERRCODE = '23514';
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
    WHERE entry.asset_kind IN ('connector','model_extension')
      AND entry.status = 'published'
      AND (
        certification.certification_id IS NULL
        OR extension.extension_id IS NULL
        OR entry.integration_id <> extension.extension_id
        OR entry.artifact_sha256 <> extension.artifact_sha256
        OR entry.compatibility_contract_sha256
          <> certification.compatibility_contract_sha256
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
  ) THEN
    RAISE EXCEPTION 'Phase 14 upgrade rejected a stale or misbound portal entry'
      USING ERRCODE = '23514';
  END IF;
END
$phase14_binding_upgrade_validation$;

-- These five legacy relations did not retain the registering/delivering caller.
-- Inferring it from an owner or publisher would turn an authorization assertion
-- into a guess, so operators must remediate such rows before this upgrade.
DO $phase14_unprovable_actor_validation$
BEGIN
  IF EXISTS (SELECT 1 FROM app.integration_webhook_delivery_events) THEN
    RAISE EXCEPTION 'Phase 14 upgrade rejected webhook deliveries without durable actor provenance'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM app.integration_extension_manifests) THEN
    RAISE EXCEPTION 'Phase 14 upgrade rejected extension registrations without durable registrar provenance'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM app.developer_portal_entries) THEN
    RAISE EXCEPTION 'Phase 14 upgrade rejected portal registrations without durable registrar provenance'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM app.integration_quota_policies) THEN
    RAISE EXCEPTION 'Phase 14 upgrade rejected quota policies without durable registrar provenance'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM app.integration_webhook_endpoints) THEN
    RAISE EXCEPTION 'Phase 14 upgrade rejected webhook endpoints without durable registrar provenance'
      USING ERRCODE = '23514';
  END IF;
END
$phase14_unprovable_actor_validation$;

ALTER TABLE app.integration_webhook_delivery_events
  ADD COLUMN actor_id uuid NOT NULL
    REFERENCES app.subjects(id) ON DELETE RESTRICT;
ALTER TABLE app.integration_extension_manifests
  ADD COLUMN registered_by uuid NOT NULL
    REFERENCES app.subjects(id) ON DELETE RESTRICT;
ALTER TABLE app.developer_portal_entries
  ADD COLUMN registered_by uuid NOT NULL
    REFERENCES app.subjects(id) ON DELETE RESTRICT;
ALTER TABLE app.integration_quota_policies
  ADD COLUMN registered_by uuid NOT NULL
    REFERENCES app.subjects(id) ON DELETE RESTRICT,
  ADD COLUMN registered_at timestamptz NOT NULL CHECK (isfinite(registered_at));
ALTER TABLE app.integration_webhook_endpoints
  ADD COLUMN registered_by uuid NOT NULL
    REFERENCES app.subjects(id) ON DELETE RESTRICT,
  ADD COLUMN registered_at timestamptz NOT NULL CHECK (isfinite(registered_at));

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
  caller_id uuid := app.current_subject_id();
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
    WHEN 'integration_quota_policies' THEN
      actor_id := NEW.registered_by;
      action_at := NEW.registered_at;
      allowed_roles := ARRAY['admin'];
    WHEN 'integration_quota_events' THEN
      actor_id := NEW.principal_id;
      action_at := NEW.occurred_at;
      allowed_roles := CASE WHEN NEW.action = 'reconciled'
        THEN ARRAY['admin']
        ELSE ARRAY['analyst','steward','validator','admin']
      END;
    WHEN 'integration_webhook_endpoints' THEN
      actor_id := NEW.registered_by;
      action_at := NEW.registered_at;
      allowed_roles := ARRAY['admin'];
    WHEN 'integration_webhook_delivery_events' THEN
      actor_id := NEW.actor_id;
      action_at := NEW.occurred_at;
      allowed_roles := ARRAY['admin'];
    WHEN 'integration_extension_manifests' THEN
      actor_id := NEW.registered_by;
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
      actor_id := NEW.registered_by;
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

  IF caller_id IS NULL OR actor_id IS DISTINCT FROM caller_id
    OR action_at IS NULL OR NOT app.phase14_role_allowed_at(
      NEW.organization_id, NEW.workspace_id, actor_id, action_at, allowed_roles
    )
  THEN
    RAISE EXCEPTION 'Phase 14 actor does not match the authorized event-time caller'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION app.validate_phase14_actor_timeline()
  FROM PUBLIC, economyos_app, economyos_ingest;

CREATE TRIGGER phase14_actor_timeline_guard
BEFORE INSERT ON app.integration_quota_policies
FOR EACH ROW EXECUTE FUNCTION app.validate_phase14_actor_timeline();
CREATE TRIGGER phase14_actor_timeline_guard
BEFORE INSERT ON app.integration_webhook_endpoints
FOR EACH ROW EXECUTE FUNCTION app.validate_phase14_actor_timeline();
