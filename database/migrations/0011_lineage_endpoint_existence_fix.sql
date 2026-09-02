-- The prior function used a local variable named `found`, shadowing PL/pgSQL's
-- FOUND status. A missing polymorphic endpoint therefore produced NULL and was
-- not rejected. Use the statement status directly after each lookup.

CREATE OR REPLACE FUNCTION evidence.lineage_endpoint_scope(endpoint_type text, endpoint_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  scope uuid;
BEGIN
  CASE endpoint_type
    WHEN 'payload' THEN
      SELECT organization_id INTO scope FROM evidence.raw_payloads WHERE id = endpoint_id;
    WHEN 'release' THEN
      SELECT organization_id INTO scope FROM evidence.releases WHERE id = endpoint_id;
    WHEN 'observation' THEN
      SELECT organization_id INTO scope FROM evidence.observations WHERE id = endpoint_id;
    WHEN 'dataset' THEN
      SELECT organization_id INTO scope FROM evidence.source_datasets WHERE id = endpoint_id;
    WHEN 'run' THEN
      SELECT organization_id INTO scope FROM evidence.transformation_runs WHERE id = endpoint_id;
    ELSE
      RAISE EXCEPTION 'lineage endpoint type % is not available in this phase', endpoint_type
        USING ERRCODE = '23514';
  END CASE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lineage endpoint does not exist' USING ERRCODE = '23503';
  END IF;
  RETURN scope;
END
$$;

REVOKE ALL ON FUNCTION evidence.lineage_endpoint_scope(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evidence.lineage_endpoint_scope(text, uuid) TO economyos_ingest;

COMMENT ON FUNCTION evidence.lineage_endpoint_scope(text, uuid) IS
  'Resolves the tenant of a real lineage endpoint and rejects missing or unsupported polymorphic identities.';
