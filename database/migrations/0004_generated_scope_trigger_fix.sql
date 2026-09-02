CREATE OR REPLACE FUNCTION evidence.validate_release_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payload_dataset_id uuid;
BEGIN
  SELECT dataset_id INTO payload_dataset_id
  FROM evidence.raw_payloads
  WHERE id = NEW.raw_payload_id
    AND organization_id IS NOT DISTINCT FROM NEW.organization_id;
  IF payload_dataset_id IS NULL OR payload_dataset_id <> NEW.dataset_id THEN
    RAISE EXCEPTION 'release payload must belong to the same dataset and tenant scope'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION evidence.validate_observation_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  series_dataset_id uuid;
  release_dataset_id uuid;
  prior_series_id uuid;
  prior_period_start timestamptz;
  prior_period_end timestamptz;
  prior_recorded_at timestamptz;
BEGIN
  SELECT dataset_id INTO series_dataset_id
  FROM evidence.series
  WHERE id = NEW.series_id
    AND organization_id IS NOT DISTINCT FROM NEW.organization_id;
  SELECT dataset_id INTO release_dataset_id
  FROM evidence.releases
  WHERE id = NEW.release_id
    AND organization_id IS NOT DISTINCT FROM NEW.organization_id;
  IF series_dataset_id IS NULL OR release_dataset_id IS NULL OR series_dataset_id <> release_dataset_id THEN
    RAISE EXCEPTION 'observation series and release must belong to the same dataset and tenant scope'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.supersedes_observation_id IS NOT NULL THEN
    SELECT series_id, period_start, period_end, recorded_at
      INTO prior_series_id, prior_period_start, prior_period_end, prior_recorded_at
    FROM evidence.observations
    WHERE id = NEW.supersedes_observation_id
      AND organization_id IS NOT DISTINCT FROM NEW.organization_id;
    IF prior_series_id IS NULL
      OR prior_series_id <> NEW.series_id
      OR prior_period_start <> NEW.period_start
      OR prior_period_end <> NEW.period_end
      OR prior_recorded_at >= NEW.recorded_at
    THEN
      RAISE EXCEPTION 'superseded observation must be an older version of the same series period and tenant scope'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION evidence.validate_quality_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payload_dataset_id uuid;
BEGIN
  SELECT dataset_id INTO payload_dataset_id
  FROM evidence.raw_payloads
  WHERE id = NEW.raw_payload_id
    AND organization_id IS NOT DISTINCT FROM NEW.organization_id;
  IF payload_dataset_id IS NULL OR payload_dataset_id <> NEW.dataset_id THEN
    RAISE EXCEPTION 'quality result payload must belong to the same dataset and tenant scope'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION evidence.validate_release_links IS
  'Uses source organization rather than a generated column unavailable during BEFORE INSERT.';
