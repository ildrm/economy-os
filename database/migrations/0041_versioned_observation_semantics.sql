-- Additive migration: never rewrite historical observations or their manifests.
ALTER TABLE evidence.observations
  ADD COLUMN semantics_generation integer NOT NULL DEFAULT 0 CHECK (semantics_generation IN (0, 1));
ALTER TABLE evidence.observations ALTER COLUMN semantics_generation SET DEFAULT 1;
ALTER TABLE evidence.observations DROP CONSTRAINT observations_status_check;
ALTER TABLE evidence.observations ADD CONSTRAINT observations_status_check
  CHECK (status IN ('unknown', 'provisional', 'final', 'estimated', 'suppressed'));
ALTER TABLE evidence.observations ALTER COLUMN status SET DEFAULT 'unknown';

COMMENT ON COLUMN evidence.observations.semantics_generation IS
  '0 preserves legacy status assertions; 1 does not assume finality. Neither generation alone certifies complete semantics.';

CREATE TABLE evidence.dataset_semantics_versions (
  organization_id uuid REFERENCES app.organizations(id) ON DELETE RESTRICT,
  tenant_scope uuid GENERATED ALWAYS AS (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  dataset_id uuid NOT NULL,
  version text NOT NULL CHECK (length(version) BETWEEN 1 AND 100),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_scope, dataset_id, version),
  FOREIGN KEY (tenant_scope, dataset_id) REFERENCES evidence.source_datasets(tenant_scope, id)
);

CREATE TABLE evidence.observation_semantics (
  organization_id uuid REFERENCES app.organizations(id) ON DELETE RESTRICT,
  tenant_scope uuid GENERATED ALWAYS AS (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  observation_id uuid NOT NULL,
  dataset_id uuid NOT NULL,
  semantics_version text NOT NULL,
  contract_version integer NOT NULL CHECK (contract_version = 2),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  CHECK (document ?& ARRAY['schemaVersion','id','datasetId','semanticsVersion','raw','observation','population','vintage','knownAt']),
  CHECK (coalesce(jsonb_typeof(document -> 'observation') = 'object', false)),
  CHECK (coalesce(jsonb_typeof(document -> 'raw') = 'object', false)),
  raw_payload_sha256 text NOT NULL CHECK (raw_payload_sha256 ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_scope, observation_id, semantics_version),
  FOREIGN KEY (tenant_scope, observation_id) REFERENCES evidence.observations(tenant_scope, id),
  FOREIGN KEY (tenant_scope, dataset_id, semantics_version)
    REFERENCES evidence.dataset_semantics_versions(tenant_scope, dataset_id, version),
  CHECK (document ->> 'schemaVersion' = '2'),
  CHECK (document ->> 'id' = observation_id::text),
  CHECK (document ->> 'datasetId' = dataset_id::text),
  CHECK (document ->> 'semanticsVersion' = semantics_version),
  CHECK (document #>> '{raw,sha256}' = raw_payload_sha256),
  CHECK ((document -> 'observation') ?& ARRAY[
    'country_code','category','source_name','source_grade','source_type','instrument_or_item',
    'value','value_type','currency','unit','geography','observation_date','retrieval_timestamp',
    'frequency','is_official','is_preliminary','revision_status','original_value','original_unit',
    'original_currency','source_id','source_url','price_type','observation_time','retrieval_time',
    'delay_minutes','index_base','aggregation','timeliness','missing_reason'
  ]),
  CHECK (document #>> '{observation,revision_status}' IN ('unknown','preliminary','original','revised','final')),
  CHECK (document #> '{observation,is_preliminary}' IN ('true'::jsonb,'false'::jsonb,'null'::jsonb)),
  CHECK (document #> '{observation,value}' = document #> '{observation,original_value}'),
  CHECK (document #> '{raw,value}' = document #> '{observation,original_value}'),
  CHECK (document #> '{raw,unit}' = document #> '{observation,original_unit}'),
  CHECK (document #> '{observation,currency}' = document #> '{observation,original_currency}'),
  CHECK (document #>> '{observation,value_type}' NOT IN ('price_index','index') OR (
    document #> '{observation,currency}' = 'null'::jsonb
    AND nullif(document #>> '{observation,index_base}', '') IS NOT NULL
  ))
);

CREATE FUNCTION evidence.validate_observation_semantics_binding()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, evidence AS $$
DECLARE item record;
BEGIN
  SELECT observation.value_numeric, observation.missing_reason, series.dataset_id,
    payload.checksum_sha256 INTO item
  FROM evidence.observations observation
  JOIN evidence.series series ON series.id = observation.series_id
    AND series.tenant_scope = observation.tenant_scope
  JOIN evidence.releases release ON release.id = observation.release_id
    AND release.tenant_scope = observation.tenant_scope
  JOIN evidence.raw_payloads payload ON payload.id = release.raw_payload_id
    AND payload.tenant_scope = release.tenant_scope
  WHERE observation.id = NEW.observation_id
    AND observation.organization_id IS NOT DISTINCT FROM NEW.organization_id;
  IF NOT FOUND OR item.dataset_id IS DISTINCT FROM NEW.dataset_id
    OR item.checksum_sha256 IS DISTINCT FROM NEW.raw_payload_sha256
    OR item.value_numeric IS DISTINCT FROM (NEW.document #>> '{observation,value}')::numeric
    OR item.missing_reason IS DISTINCT FROM (NEW.document #>> '{observation,missing_reason}')
  THEN RAISE EXCEPTION 'observation semantics do not match immutable evidence' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER observation_semantics_binding BEFORE INSERT ON evidence.observation_semantics
  FOR EACH ROW EXECUTE FUNCTION evidence.validate_observation_semantics_binding();

DO $security$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['dataset_semantics_versions','observation_semantics'] LOOP
    EXECUTE format('ALTER TABLE evidence.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE evidence.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY semantics_scope ON evidence.%I USING (evidence.tenant_visible(organization_id)) WITH CHECK (organization_id IS NOT DISTINCT FROM app.current_organization_id())', table_name);
    EXECUTE format('CREATE TRIGGER semantics_immutable BEFORE UPDATE OR DELETE ON evidence.%I FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation()', table_name);
    EXECUTE format('REVOKE ALL ON evidence.%I FROM PUBLIC, economyos_app, economyos_ingest', table_name);
    EXECUTE format('GRANT SELECT, INSERT ON evidence.%I TO economyos_ingest', table_name);
  END LOOP;
END $security$;

COMMENT ON TABLE evidence.observation_semantics IS
  'Append-only versioned metadata bound to the original observation and raw bytes. Absence means unverified legacy semantics; never inferred from a legacy final status. No public table access.';
