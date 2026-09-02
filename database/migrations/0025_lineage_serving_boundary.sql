-- Runtime roles may evaluate the final lineage RLS predicate, but they must not
-- call the underlying cross-tenant endpoint resolvers directly. State endpoint
-- misses and inaccessible workspaces deliberately collapse to the same result.

CREATE OR REPLACE FUNCTION evidence.lineage_edge_visible(
  requested_organization_id uuid,
  requested_from_type text,
  requested_from_id uuid,
  requested_to_type text,
  requested_to_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
DECLARE
  from_workspace uuid;
  to_workspace uuid;
BEGIN
  IF NOT evidence.tenant_visible(requested_organization_id) THEN
    RETURN false;
  END IF;

  IF requested_from_type IN ('model', 'state_run', 'state_vector') THEN
    from_workspace := evidence.lineage_endpoint_workspace(
      requested_from_type, requested_from_id
    );
    IF from_workspace IS NULL OR NOT evidence.economic_state_workspace_visible(
      requested_organization_id, from_workspace
    ) THEN
      RETURN false;
    END IF;
  END IF;

  IF requested_to_type IN ('model', 'state_run', 'state_vector') THEN
    to_workspace := evidence.lineage_endpoint_workspace(
      requested_to_type, requested_to_id
    );
    IF to_workspace IS NULL OR NOT evidence.economic_state_workspace_visible(
      requested_organization_id, to_workspace
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END
$$;

-- These are implementation details of SECURITY DEFINER triggers and serving
-- functions. Their owners retain implicit execution privilege, so revoking the
-- shared runtime roles does not break trigger or wrapper call chains.
REVOKE ALL ON FUNCTION evidence.lineage_endpoint_scope(text, uuid)
  FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.lineage_endpoint_workspace(text, uuid)
  FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.validate_lineage_edge()
  FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.source_action_is_currently_admitted(
  uuid, uuid, uuid, text
) FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION evidence.economic_state_run_is_temporally_admitted(uuid)
  FROM PUBLIC, economyos_app, economyos_ingest;

-- The lineage policy itself is the narrow authorized boundary and therefore
-- remains callable by the roles that read or write lineage rows.
REVOKE ALL ON FUNCTION evidence.lineage_edge_visible(
  uuid, text, uuid, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evidence.lineage_edge_visible(
  uuid, text, uuid, text, uuid
) TO economyos_app, economyos_ingest;

COMMENT ON FUNCTION evidence.lineage_endpoint_scope(text, uuid) IS
  'Private trigger helper resolving an existing lineage endpoint organization; runtime roles cannot call it directly.';
COMMENT ON FUNCTION evidence.lineage_endpoint_workspace(text, uuid) IS
  'Private RLS helper resolving state endpoint workspaces; only the governed lineage predicate may expose its result.';
COMMENT ON FUNCTION evidence.lineage_edge_visible(uuid, text, uuid, text, uuid) IS
  'Tenant/workspace lineage RLS predicate; missing, foreign, and inaccessible state endpoints all fail closed.';
COMMENT ON FUNCTION evidence.validate_lineage_edge() IS
  'Private SECURITY DEFINER trigger enforcing endpoint existence, tenant scope, and supported state-lineage relations.';
COMMENT ON FUNCTION evidence.source_action_is_currently_admitted(
  uuid, uuid, uuid, text
) IS
  'Private current legal-action predicate used only through governed SECURITY DEFINER serving functions.';
COMMENT ON FUNCTION evidence.economic_state_run_is_temporally_admitted(uuid) IS
  'Private temporal-integrity predicate used only through governed serving and validation functions.';
