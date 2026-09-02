CREATE OR REPLACE FUNCTION evidence.validate_release_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payload_dataset_id uuid;
BEGIN
  SELECT dataset_id INTO payload_dataset_id
  FROM evidence.raw_payloads
  WHERE id = NEW.raw_payload_id AND tenant_scope = NEW.tenant_scope;
  IF payload_dataset_id IS NULL OR payload_dataset_id <> NEW.dataset_id THEN
    RAISE EXCEPTION 'release payload must belong to the same dataset and tenant scope'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER releases_validate_links
BEFORE INSERT ON evidence.releases
FOR EACH ROW EXECUTE FUNCTION evidence.validate_release_links();

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
  WHERE id = NEW.series_id AND tenant_scope = NEW.tenant_scope;
  SELECT dataset_id INTO release_dataset_id
  FROM evidence.releases
  WHERE id = NEW.release_id AND tenant_scope = NEW.tenant_scope;
  IF series_dataset_id IS NULL OR release_dataset_id IS NULL OR series_dataset_id <> release_dataset_id THEN
    RAISE EXCEPTION 'observation series and release must belong to the same dataset and tenant scope'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.supersedes_observation_id IS NOT NULL THEN
    SELECT series_id, period_start, period_end, recorded_at
      INTO prior_series_id, prior_period_start, prior_period_end, prior_recorded_at
    FROM evidence.observations
    WHERE id = NEW.supersedes_observation_id AND tenant_scope = NEW.tenant_scope;
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

CREATE TRIGGER observations_validate_links
BEFORE INSERT ON evidence.observations
FOR EACH ROW EXECUTE FUNCTION evidence.validate_observation_links();

CREATE OR REPLACE FUNCTION evidence.validate_quality_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payload_dataset_id uuid;
BEGIN
  SELECT dataset_id INTO payload_dataset_id
  FROM evidence.raw_payloads
  WHERE id = NEW.raw_payload_id AND tenant_scope = NEW.tenant_scope;
  IF payload_dataset_id IS NULL OR payload_dataset_id <> NEW.dataset_id THEN
    RAISE EXCEPTION 'quality result payload must belong to the same dataset and tenant scope'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER quality_results_validate_links
BEFORE INSERT ON evidence.quality_results
FOR EACH ROW EXECUTE FUNCTION evidence.validate_quality_links();

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
  JOIN evidence.series AS series ON series.id = observation.series_id
  WHERE observation.series_id = requested_series_id
    AND series.data_class NOT IN ('synthetic_demo', 'synthetic_research')
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

COMMENT ON FUNCTION evidence.validate_observation_links IS
  'Prevents cross-dataset, cross-series-period, and non-monotonic revision links.';
