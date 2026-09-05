-- Migration 0038 introduced mandatory caller provenance but the existing narrow
-- insertion functions deliberately keep registrar identity out of client JSON.
-- Populate omitted columns from the authenticated transaction context, not from
-- an owner/publisher or a client-supplied actor. Existing BEFORE INSERT actor and
-- event-time membership guards still reject NULL, mismatched, or unauthorized
-- subjects. No legacy row is backfilled and no security check is relaxed.
ALTER TABLE app.integration_quota_policies
  ALTER COLUMN registered_by SET DEFAULT app.current_subject_id(),
  ALTER COLUMN registered_at SET DEFAULT clock_timestamp();

ALTER TABLE app.integration_webhook_endpoints
  ALTER COLUMN registered_by SET DEFAULT app.current_subject_id(),
  ALTER COLUMN registered_at SET DEFAULT clock_timestamp();

ALTER TABLE app.integration_webhook_delivery_events
  ALTER COLUMN actor_id SET DEFAULT app.current_subject_id();

ALTER TABLE app.integration_extension_manifests
  ALTER COLUMN registered_by SET DEFAULT app.current_subject_id();

ALTER TABLE app.developer_portal_entries
  ALTER COLUMN registered_by SET DEFAULT app.current_subject_id();

COMMENT ON COLUMN app.integration_quota_policies.registered_at IS
  'Database-observed registration time; never inferred from the policy window.';
COMMENT ON COLUMN app.integration_webhook_endpoints.registered_at IS
  'Database-observed registration time; the endpoint manifest contains no historical registration assertion.';
