-- Security-definer ingestion transitions deliberately exclude the public
-- schema from search_path. Expose only the exact pgcrypto primitive they need
-- through the locked evidence schema so trigger execution cannot depend on the
-- caller's search path.

CREATE OR REPLACE FUNCTION evidence.digest(value bytea, algorithm text)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT public.digest(value, algorithm)
$$;

REVOKE ALL ON FUNCTION evidence.digest(bytea, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evidence.digest(bytea, text)
  TO economyos_app, economyos_ingest;

COMMENT ON FUNCTION evidence.digest(bytea, text) IS
  'Search-path-safe pgcrypto bridge for locked evidence functions; not an application hashing API.';
