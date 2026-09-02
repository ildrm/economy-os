-- Close two caller-controlled evidence gaps. Terminal success must commit the
-- exact public projection of the immutable raw payload, and new state evidence
-- must attribute its author/calculator to the authenticated subject context.

CREATE OR REPLACE FUNCTION evidence.validate_succeeded_ingestion_raw_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  manifest_payload jsonb;
  stored_payload evidence.raw_payloads%ROWTYPE;
  manifest_fetched_at timestamptz;
  effective_scope uuid := coalesce(
    NEW.organization_id, '00000000-0000-0000-0000-000000000000'::uuid
  );
BEGIN
  IF OLD.status = NEW.status OR NEW.status <> 'succeeded' THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.output_manifest->'rawPayloads') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'successful ingestion requires exactly one public raw payload object'
      USING ERRCODE = '23514';
  END IF;
  IF jsonb_array_length(NEW.output_manifest->'rawPayloads') <> 1 THEN
    RAISE EXCEPTION 'successful ingestion requires exactly one public raw payload object'
      USING ERRCODE = '23514';
  END IF;
  manifest_payload := NEW.output_manifest->'rawPayloads'->0;
  IF jsonb_typeof(manifest_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'successful ingestion requires exactly one public raw payload object'
      USING ERRCODE = '23514';
  END IF;

  IF NOT (manifest_payload ?& ARRAY[
      'payloadId', 'requestUri', 'objectUri', 'mediaType', 'checksumSha256',
      'byteLength', 'fetchedAt', 'providerRequestId'
    ])
    OR (SELECT count(*) FROM jsonb_object_keys(manifest_payload)) <> 8
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(manifest_payload) entry(key)
      WHERE entry.key <> ALL(ARRAY[
        'payloadId', 'requestUri', 'objectUri', 'mediaType', 'checksumSha256',
        'byteLength', 'fetchedAt', 'providerRequestId'
      ])
    )
  THEN
    RAISE EXCEPTION 'successful ingestion raw payload has missing or non-public fields'
      USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(manifest_payload->'payloadId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(manifest_payload->'requestUri') IS DISTINCT FROM 'string'
    OR jsonb_typeof(manifest_payload->'objectUri') IS DISTINCT FROM 'string'
    OR jsonb_typeof(manifest_payload->'mediaType') IS DISTINCT FROM 'string'
    OR jsonb_typeof(manifest_payload->'checksumSha256') IS DISTINCT FROM 'string'
    OR jsonb_typeof(manifest_payload->'byteLength') IS DISTINCT FROM 'number'
    OR jsonb_typeof(manifest_payload->'fetchedAt') IS DISTINCT FROM 'string'
    OR jsonb_typeof(manifest_payload->'providerRequestId') NOT IN ('string', 'null')
  THEN
    RAISE EXCEPTION 'successful ingestion raw payload field types are invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO stored_payload
  FROM evidence.raw_payloads payload
  WHERE payload.tenant_scope = effective_scope
    AND payload.dataset_id = NEW.dataset_id
    AND payload.id::text = manifest_payload->>'payloadId';
  IF stored_payload.id IS NULL THEN
    RAISE EXCEPTION 'successful ingestion raw payload identity is not immutable evidence'
      USING ERRCODE = '23514';
  END IF;

  IF (manifest_payload->>'fetchedAt') !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]+)?(Z|[+-]((0[0-9]|1[0-3]):[0-5][0-9]|14:00))$'
  THEN
    RAISE EXCEPTION 'successful ingestion raw payload fetchedAt is not an ISO instant'
      USING ERRCODE = '23514';
  END IF;
  BEGIN
    manifest_fetched_at := (manifest_payload->>'fetchedAt')::timestamptz;
    IF NOT isfinite(manifest_fetched_at) THEN
      RAISE EXCEPTION 'successful ingestion raw payload fetchedAt must be finite'
        USING ERRCODE = '23514';
    END IF;
  EXCEPTION
    WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'successful ingestion raw payload fetchedAt is invalid'
        USING ERRCODE = '23514';
  END;

  IF manifest_payload->>'requestUri' IS DISTINCT FROM stored_payload.request_uri
    OR manifest_payload->>'objectUri' IS DISTINCT FROM stored_payload.object_uri
    OR manifest_payload->>'mediaType' IS DISTINCT FROM stored_payload.media_type
    OR manifest_payload->>'checksumSha256' IS DISTINCT FROM stored_payload.checksum_sha256
    OR (manifest_payload->>'byteLength')::numeric
      IS DISTINCT FROM stored_payload.byte_length::numeric
    OR manifest_fetched_at IS DISTINCT FROM stored_payload.fetched_at
    OR (
      stored_payload.provider_request_id IS NULL
      AND manifest_payload->'providerRequestId' IS DISTINCT FROM 'null'::jsonb
    )
    OR (
      stored_payload.provider_request_id IS NOT NULL
      AND (
        jsonb_typeof(manifest_payload->'providerRequestId') IS DISTINCT FROM 'string'
        OR manifest_payload->>'providerRequestId'
          IS DISTINCT FROM stored_payload.provider_request_id
      )
    )
  THEN
    RAISE EXCEPTION 'successful ingestion raw payload differs from immutable metadata'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER ingestion_runs_validate_succeeded_raw_payload
BEFORE UPDATE ON evidence.ingestion_runs
FOR EACH ROW EXECUTE FUNCTION evidence.validate_succeeded_ingestion_raw_payload();

REVOKE ALL ON FUNCTION evidence.validate_succeeded_ingestion_raw_payload() FROM PUBLIC;

CREATE OR REPLACE FUNCTION evidence.require_current_economic_state_attribution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app, evidence
AS $$
DECLARE
  attribution_column text := TG_ARGV[0];
  declared_subject uuid;
BEGIN
  IF attribution_column NOT IN ('created_by', 'calculated_by') THEN
    RAISE EXCEPTION 'invalid economic-state attribution trigger configuration'
      USING ERRCODE = '55000';
  END IF;
  declared_subject := (to_jsonb(NEW)->>attribution_column)::uuid;
  IF app.current_subject_id() IS DISTINCT FROM declared_subject THEN
    RAISE EXCEPTION 'economic-state attribution requires the exact authenticated subject'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER economic_state_model_artifacts_attribution_guard
BEFORE INSERT ON evidence.economic_state_model_artifacts
FOR EACH ROW EXECUTE FUNCTION evidence.require_current_economic_state_attribution('created_by');
CREATE TRIGGER economic_state_models_attribution_guard
BEFORE INSERT ON evidence.economic_state_models
FOR EACH ROW EXECUTE FUNCTION evidence.require_current_economic_state_attribution('created_by');
CREATE TRIGGER economic_state_runs_attribution_guard
BEFORE INSERT ON evidence.economic_state_runs
FOR EACH ROW EXECUTE FUNCTION evidence.require_current_economic_state_attribution('calculated_by');

REVOKE ALL ON FUNCTION evidence.require_current_economic_state_attribution() FROM PUBLIC;

COMMENT ON FUNCTION evidence.validate_succeeded_ingestion_raw_payload() IS
  'Fails terminal success unless rawPayloads[0] is the exact public projection of its immutable raw_payload row.';
COMMENT ON FUNCTION evidence.require_current_economic_state_attribution() IS
  'Prevents callers from attributing model artifacts, model definitions, or calculations to another subject.';
