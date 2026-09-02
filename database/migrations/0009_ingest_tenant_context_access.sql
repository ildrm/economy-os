-- RLS policies for the ingestion role call the tenant-context helpers. Schema
-- USAGE is required even for global rows because PostgreSQL may inline the SQL
-- policy function before evaluating its short-circuit expression.

GRANT USAGE ON SCHEMA app TO economyos_ingest;
GRANT EXECUTE ON FUNCTION app.current_organization_id(), app.current_subject_id()
  TO economyos_ingest;

COMMENT ON ROLE economyos_ingest IS
  'Non-login ingestion capability role; login identities receive it by membership and cannot bypass RLS.';
