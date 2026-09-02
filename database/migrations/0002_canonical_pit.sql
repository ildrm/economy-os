CREATE SCHEMA IF NOT EXISTS evidence;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'economyos_ingest') THEN
    CREATE ROLE economyos_ingest NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$roles$;

CREATE OR REPLACE FUNCTION evidence.tenant_visible(organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT organization_id IS NULL OR organization_id = app.current_organization_id()
$$;

CREATE TABLE evidence.sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE,
  tenant_scope uuid GENERATED ALWAYS AS (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,127}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 300),
  authority_class text NOT NULL CHECK (
    authority_class IN ('official', 'multilateral', 'licensed_private', 'academic', 'customer', 'community')
  ),
  jurisdiction text,
  homepage_uri text NOT NULL CHECK (homepage_uri ~ '^https://'),
  classification text NOT NULL DEFAULT 'public'
    CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
  license_status text NOT NULL CHECK (license_status IN ('pending', 'approved', 'restricted', 'rejected', 'expired')),
  license_expression text,
  redistribution_allowed boolean,
  retention_policy jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(retention_policy) = 'object'),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_scope, slug),
  UNIQUE (tenant_scope, id)
);

CREATE TABLE evidence.source_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE,
  tenant_scope uuid GENERATED ALWAYS AS (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  source_id uuid NOT NULL,
  external_key text NOT NULL CHECK (length(external_key) BETWEEN 1 AND 512),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 500),
  methodology_uri text CHECK (methodology_uri IS NULL OR methodology_uri ~ '^https://'),
  pit_quality text NOT NULL CHECK (pit_quality IN ('true_vintage', 'reconstructed_only', 'latest_revised_only')),
  expected_frequency text,
  release_schedule jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(release_schedule) = 'object'),
  admission_status text NOT NULL DEFAULT 'pending'
    CHECK (admission_status IN ('pending', 'approved', 'quarantined', 'suspended', 'rejected')),
  admitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_scope, source_id) REFERENCES evidence.sources(tenant_scope, id) ON DELETE RESTRICT,
  UNIQUE (tenant_scope, source_id, external_key),
  UNIQUE (tenant_scope, id)
);

CREATE TABLE evidence.raw_payloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE,
  tenant_scope uuid GENERATED ALWAYS AS (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  dataset_id uuid NOT NULL,
  request_uri text NOT NULL CHECK (request_uri ~ '^https://'),
  object_uri text NOT NULL CHECK (object_uri ~ '^(s3|gs|az|file)://'),
  media_type text NOT NULL,
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  byte_length bigint NOT NULL CHECK (byte_length >= 0),
  fetched_at timestamptz NOT NULL,
  provider_request_id text,
  parser_name text NOT NULL,
  parser_version text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_scope, dataset_id)
    REFERENCES evidence.source_datasets(tenant_scope, id) ON DELETE RESTRICT,
  UNIQUE (tenant_scope, dataset_id, checksum_sha256),
  UNIQUE (tenant_scope, id)
);

CREATE TABLE evidence.geographies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('world', 'region', 'country', 'economy', 'subnational')),
  code_scheme text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  valid_from date,
  valid_until date,
  UNIQUE (code_scheme, code, valid_from),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);

CREATE TABLE evidence.concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_key text NOT NULL UNIQUE CHECK (canonical_key ~ '^[a-z][a-z0-9_.-]{2,255}$'),
  name text NOT NULL,
  definition text NOT NULL,
  measurement_class text NOT NULL CHECK (
    measurement_class IN ('direct', 'derived', 'latent', 'normative', 'risk', 'structural')
  ),
  ontology_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE evidence.series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE,
  tenant_scope uuid GENERATED ALWAYS AS (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  dataset_id uuid NOT NULL,
  concept_id uuid NOT NULL REFERENCES evidence.concepts(id) ON DELETE RESTRICT,
  geography_id uuid NOT NULL REFERENCES evidence.geographies(id) ON DELETE RESTRICT,
  external_series_key text NOT NULL,
  unit_code text NOT NULL,
  frequency text NOT NULL CHECK (
    frequency IN ('event', 'daily', 'weekly', 'monthly', 'quarterly', 'annual', 'irregular')
  ),
  seasonal_adjustment text NOT NULL DEFAULT 'not_applicable'
    CHECK (seasonal_adjustment IN ('adjusted', 'unadjusted', 'not_applicable', 'unknown')),
  data_class text NOT NULL CHECK (
    data_class IN (
      'observed', 'estimated', 'forecast', 'scenario',
      'synthetic_demo', 'synthetic_research', 'unknown'
    )
  ),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_scope, dataset_id)
    REFERENCES evidence.source_datasets(tenant_scope, id) ON DELETE RESTRICT,
  UNIQUE (tenant_scope, dataset_id, external_series_key, geography_id),
  UNIQUE (tenant_scope, id)
);

CREATE TABLE evidence.releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE,
  tenant_scope uuid GENERATED ALWAYS AS (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  dataset_id uuid NOT NULL,
  raw_payload_id uuid NOT NULL,
  external_release_key text NOT NULL,
  release_time timestamptz,
  pit_quality text NOT NULL CHECK (pit_quality IN ('true_vintage', 'reconstructed_only', 'latest_revised_only')),
  revision_sequence integer CHECK (revision_sequence IS NULL OR revision_sequence >= 0),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_scope, dataset_id)
    REFERENCES evidence.source_datasets(tenant_scope, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_scope, raw_payload_id)
    REFERENCES evidence.raw_payloads(tenant_scope, id) ON DELETE RESTRICT,
  CHECK (pit_quality <> 'true_vintage' OR release_time IS NOT NULL),
  UNIQUE (tenant_scope, dataset_id, external_release_key),
  UNIQUE (tenant_scope, id)
);

CREATE TABLE evidence.observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE,
  tenant_scope uuid GENERATED ALWAYS AS (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  series_id uuid NOT NULL,
  release_id uuid NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  value_numeric numeric,
  missing_reason text,
  status text NOT NULL DEFAULT 'final' CHECK (status IN ('provisional', 'final', 'estimated', 'suppressed')),
  supersedes_observation_id uuid,
  parser_version text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_scope, series_id)
    REFERENCES evidence.series(tenant_scope, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_scope, release_id)
    REFERENCES evidence.releases(tenant_scope, id) ON DELETE RESTRICT,
  FOREIGN KEY (supersedes_observation_id) REFERENCES evidence.observations(id) ON DELETE RESTRICT,
  CHECK (period_end > period_start),
  CHECK ((value_numeric IS NULL) <> (missing_reason IS NULL)),
  CHECK (
    missing_reason IS NULL OR missing_reason IN (
      'source_missing', 'not_collected', 'not_applicable', 'suppressed',
      'delayed', 'parse_failure', 'license_withheld'
    )
  ),
  UNIQUE (tenant_scope, series_id, release_id, period_start, period_end),
  UNIQUE (tenant_scope, id)
);

CREATE TABLE evidence.quality_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE,
  tenant_scope uuid GENERATED ALWAYS AS (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  dataset_id uuid NOT NULL,
  raw_payload_id uuid NOT NULL,
  check_code text NOT NULL,
  status text NOT NULL CHECK (status IN ('pass', 'warn', 'fail')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  checked_at timestamptz NOT NULL,
  FOREIGN KEY (tenant_scope, dataset_id)
    REFERENCES evidence.source_datasets(tenant_scope, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_scope, raw_payload_id)
    REFERENCES evidence.raw_payloads(tenant_scope, id) ON DELETE RESTRICT,
  UNIQUE (tenant_scope, raw_payload_id, check_code)
);

CREATE TABLE evidence.dataset_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  workspace_id uuid,
  known_at timestamptz NOT NULL,
  system_at timestamptz,
  policy text NOT NULL CHECK (policy IN ('true_vintage', 'reconstructed', 'latest_revised')),
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  CHECK (policy <> 'reconstructed' OR system_at IS NOT NULL),
  CHECK (policy <> 'latest_revised' OR system_at IS NULL),
  UNIQUE (organization_id, manifest_sha256)
);

CREATE TABLE evidence.lineage_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE,
  from_type text NOT NULL CHECK (from_type IN ('payload', 'release', 'observation', 'dataset', 'feature', 'model', 'run', 'output')),
  from_id uuid NOT NULL,
  to_type text NOT NULL CHECK (to_type IN ('release', 'observation', 'dataset', 'feature', 'model', 'run', 'output')),
  to_id uuid NOT NULL,
  relation text NOT NULL CHECK (relation IN ('parsed_into', 'revises', 'derived_from', 'trained_on', 'executed_with', 'produced')),
  transformation_version text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (from_id <> to_id),
  UNIQUE (organization_id, from_type, from_id, to_type, to_id, relation)
);

CREATE INDEX raw_payloads_dataset_time_idx
  ON evidence.raw_payloads (tenant_scope, dataset_id, fetched_at DESC);
CREATE INDEX releases_dataset_time_idx
  ON evidence.releases (tenant_scope, dataset_id, release_time DESC NULLS LAST, recorded_at DESC);
CREATE INDEX observations_pit_idx
  ON evidence.observations (tenant_scope, series_id, period_start, period_end, recorded_at DESC);
CREATE INDEX lineage_edges_from_idx
  ON evidence.lineage_edges (organization_id, from_type, from_id);
CREATE INDEX lineage_edges_to_idx
  ON evidence.lineage_edges (organization_id, to_type, to_id);

CREATE OR REPLACE FUNCTION evidence.reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER raw_payloads_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.raw_payloads
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER releases_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.releases
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER observations_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.observations
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER dataset_snapshots_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.dataset_snapshots
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER lineage_edges_reject_update_delete
BEFORE UPDATE OR DELETE ON evidence.lineage_edges
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

CREATE OR REPLACE FUNCTION evidence.observations_as_known(
  requested_series_id uuid,
  known_at timestamptz,
  visibility_policy text,
  system_at timestamptz DEFAULT NULL
)
RETURNS SETOF evidence.observations
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, evidence, app
AS $$
BEGIN
  IF visibility_policy NOT IN ('true_vintage', 'reconstructed', 'latest_revised') THEN
    RAISE EXCEPTION 'invalid visibility policy' USING ERRCODE = '22023';
  END IF;
  IF visibility_policy = 'reconstructed' AND system_at IS NULL THEN
    RAISE EXCEPTION 'reconstructed policy requires system_at' USING ERRCODE = '22023';
  END IF;
  IF visibility_policy = 'latest_revised' AND system_at IS NOT NULL THEN
    RAISE EXCEPTION 'latest_revised cannot claim historical system time' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (observation.period_start, observation.period_end) observation.*
  FROM evidence.observations AS observation
  JOIN evidence.releases AS release ON release.id = observation.release_id
  WHERE observation.series_id = requested_series_id
    AND CASE visibility_policy
      WHEN 'true_vintage' THEN
        release.release_time IS NOT NULL
        AND release.release_time <= known_at
        AND observation.recorded_at <= least(known_at, coalesce(system_at, known_at))
      WHEN 'reconstructed' THEN
        coalesce(release.release_time, '-infinity'::timestamptz) <= known_at
        AND observation.recorded_at <= system_at
      WHEN 'latest_revised' THEN
        coalesce(release.release_time, observation.recorded_at) <= known_at
        AND observation.recorded_at <= known_at
      ELSE false
    END
  ORDER BY
    observation.period_start,
    observation.period_end,
    release.release_time DESC NULLS LAST,
    observation.recorded_at DESC,
    observation.id DESC;
END
$$;

ALTER TABLE evidence.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.sources FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.source_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.source_datasets FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.raw_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.raw_payloads FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.series ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.series FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.releases FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.observations FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.quality_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.quality_results FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.dataset_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.dataset_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence.lineage_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence.lineage_edges FORCE ROW LEVEL SECURITY;

CREATE POLICY sources_tenant ON evidence.sources
  USING (evidence.tenant_visible(organization_id))
  WITH CHECK (evidence.tenant_visible(organization_id));
CREATE POLICY source_datasets_tenant ON evidence.source_datasets
  USING (evidence.tenant_visible(organization_id))
  WITH CHECK (evidence.tenant_visible(organization_id));
CREATE POLICY raw_payloads_tenant ON evidence.raw_payloads
  USING (evidence.tenant_visible(organization_id))
  WITH CHECK (evidence.tenant_visible(organization_id));
CREATE POLICY series_tenant ON evidence.series
  USING (evidence.tenant_visible(organization_id))
  WITH CHECK (evidence.tenant_visible(organization_id));
CREATE POLICY releases_tenant ON evidence.releases
  USING (evidence.tenant_visible(organization_id))
  WITH CHECK (evidence.tenant_visible(organization_id));
CREATE POLICY observations_tenant ON evidence.observations
  USING (evidence.tenant_visible(organization_id))
  WITH CHECK (evidence.tenant_visible(organization_id));
CREATE POLICY quality_results_tenant ON evidence.quality_results
  USING (evidence.tenant_visible(organization_id))
  WITH CHECK (evidence.tenant_visible(organization_id));
CREATE POLICY dataset_snapshots_tenant ON evidence.dataset_snapshots
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
CREATE POLICY lineage_edges_tenant ON evidence.lineage_edges
  USING (evidence.tenant_visible(organization_id))
  WITH CHECK (evidence.tenant_visible(organization_id));

REVOKE ALL ON SCHEMA evidence FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA evidence FROM PUBLIC;
GRANT USAGE ON SCHEMA evidence TO economyos_app, economyos_ingest;
GRANT SELECT ON evidence.sources, evidence.source_datasets, evidence.geographies,
  evidence.concepts, evidence.series, evidence.releases, evidence.observations,
  evidence.quality_results, evidence.dataset_snapshots, evidence.lineage_edges
  TO economyos_app;
GRANT EXECUTE ON FUNCTION evidence.observations_as_known(uuid, timestamptz, text, timestamptz)
  TO economyos_app;
GRANT SELECT, INSERT ON evidence.raw_payloads, evidence.releases, evidence.observations,
  evidence.quality_results, evidence.dataset_snapshots, evidence.lineage_edges
  TO economyos_ingest;
GRANT SELECT ON evidence.sources, evidence.source_datasets, evidence.geographies,
  evidence.concepts, evidence.series TO economyos_ingest;

COMMENT ON FUNCTION evidence.observations_as_known IS
  'Selects one release per economic period under explicit true-vintage, reconstructed, or latest-revised semantics.';
COMMENT ON COLUMN evidence.releases.release_time IS
  'Publisher availability time; NULL is permitted only when the dataset cannot support true-vintage claims.';
