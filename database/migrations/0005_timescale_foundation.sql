CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE SCHEMA IF NOT EXISTS telemetry;

CREATE TABLE telemetry.metric_points (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  metric_name text NOT NULL CHECK (metric_name ~ '^[a-z][a-z0-9_.-]{2,255}$'),
  metric_value double precision NOT NULL CHECK (
    metric_value NOT IN (
      'Infinity'::double precision,
      '-Infinity'::double precision,
      'NaN'::double precision
    )
  ),
  unit text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  trace_id text CHECK (trace_id IS NULL OR trace_id ~ '^[0-9a-f]{32}$'),
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (recorded_at, id),
  FOREIGN KEY (organization_id) REFERENCES app.organizations(id) ON DELETE CASCADE
);

SELECT create_hypertable(
  'telemetry.metric_points',
  by_range('recorded_at', INTERVAL '1 day'),
  if_not_exists => true
);

ALTER TABLE telemetry.metric_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry.metric_points FORCE ROW LEVEL SECURITY;
CREATE POLICY metric_points_tenant ON telemetry.metric_points
  USING (organization_id IS NULL OR organization_id = app.current_organization_id())
  WITH CHECK (organization_id IS NULL OR organization_id = app.current_organization_id());

REVOKE ALL ON SCHEMA telemetry FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA telemetry FROM PUBLIC;
GRANT USAGE ON SCHEMA telemetry TO economyos_app;
GRANT SELECT, INSERT ON telemetry.metric_points TO economyos_app;

COMMENT ON TABLE telemetry.metric_points IS
  'Timescale-backed application and data-pipeline metric points; not the billing ledger.';
