BEGIN;

DO $verify_timescale$
DECLARE
  installed boolean;
  hypertable_count integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'
  ) INTO installed;
  SELECT count(*) INTO hypertable_count
  FROM timescaledb_information.hypertables
  WHERE hypertable_schema = 'telemetry' AND hypertable_name = 'metric_points';
  IF NOT installed OR hypertable_count <> 1 THEN
    RAISE EXCEPTION 'Timescale verification failed: installed=%, hypertable_count=%',
      installed, hypertable_count;
  END IF;
END
$verify_timescale$;

SET LOCAL ROLE economyos_app;
SET LOCAL app.organization_id = '018f47ac-19fc-7c92-ae91-0242ac120002';
INSERT INTO telemetry.metric_points (
  organization_id, metric_name, metric_value, unit, attributes, trace_id, recorded_at
) VALUES (
  NULL,
  'economyos.verification.latency',
  12.5,
  'milliseconds',
  '{"fixture": true}',
  '018f47ac19fc7c92ae910242ac120002',
  '2026-01-01T00:00:00Z'
);

DO $verify_metric_tenant$
BEGIN
  IF (SELECT count(*) FROM telemetry.metric_points) <> 1 THEN
    RAISE EXCEPTION 'tenant metric visibility failed';
  END IF;
END
$verify_metric_tenant$;

RESET ROLE;
ROLLBACK;
