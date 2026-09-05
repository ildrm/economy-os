-- Research execution records are scenarios, never admitted observational evidence.
-- Caller-provided citations/knowledge cutoffs are not independently verified here.

CREATE FUNCTION app.behavioral_allocation_valid_document(document jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  frontier jsonb[] := ARRAY[document];
  next_frontier jsonb[];
  item jsonb;
  child jsonb;
  depth integer := 0;
  nodes integer := 0;
BEGIN
  IF document IS NULL OR jsonb_typeof(document) <> 'object'
    OR octet_length(document::text) > 262144
  THEN RETURN false; END IF;
  WHILE cardinality(frontier) > 0 LOOP
    IF depth > 32 THEN RETURN false; END IF;
    next_frontier := ARRAY[]::jsonb[];
    FOREACH item IN ARRAY frontier LOOP
      nodes := nodes + 1;
      IF nodes > 20000 THEN RETURN false; END IF;
      IF jsonb_typeof(item) = 'object' THEN
        FOR child IN SELECT value FROM jsonb_each(item) LOOP
          next_frontier := array_append(next_frontier, child);
        END LOOP;
      ELSIF jsonb_typeof(item) = 'array' THEN
        FOR child IN SELECT value FROM jsonb_array_elements(item) LOOP
          next_frontier := array_append(next_frontier, child);
        END LOOP;
      END IF;
    END LOOP;
    frontier := next_frontier;
    depth := depth + 1;
  END LOOP;
  RETURN true;
END
$$;

CREATE TABLE app.behavioral_allocation_research (
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES app.subjects(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN (
    'behavioral_choice', 'intervention_detection', 'allocation_simulation', 'material_balance'
  )),
  input jsonb NOT NULL CHECK (app.behavioral_allocation_valid_document(input)),
  result jsonb NOT NULL CHECK (app.behavioral_allocation_valid_document(result)),
  data_class text NOT NULL DEFAULT 'scenario' CHECK (data_class = 'scenario'),
  evidence_status text NOT NULL DEFAULT 'caller_supplied_unverified'
    CHECK (evidence_status = 'caller_supplied_unverified'),
  known_at timestamptz NOT NULL CHECK (isfinite(known_at)),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(recorded_at)),
  manifest jsonb NOT NULL,
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (organization_id, workspace_id, id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES app.workspaces(organization_id, id) ON DELETE RESTRICT,
  CHECK (known_at <= recorded_at)
);

CREATE FUNCTION app.behavioral_allocation_seal_record()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, evidence
AS $$
BEGIN
  NEW.recorded_at := clock_timestamp();
  NEW.manifest := jsonb_build_object(
    'id', NEW.id, 'organizationId', NEW.organization_id,
    'workspaceId', NEW.workspace_id, 'actorId', NEW.actor_id,
    'kind', NEW.kind, 'input', NEW.input, 'result', NEW.result,
    'dataClass', NEW.data_class, 'evidenceStatus', NEW.evidence_status,
    'knownAt', to_char(NEW.known_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'recordedAt', to_char(NEW.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );
  NEW.manifest_sha256 := encode(public.digest(
    convert_to(evidence.canonical_json(NEW.manifest), 'UTF8'), 'sha256'
  ), 'hex');
  RETURN NEW;
END
$$;

CREATE TRIGGER behavioral_allocation_research_seal
BEFORE INSERT ON app.behavioral_allocation_research
FOR EACH ROW EXECUTE FUNCTION app.behavioral_allocation_seal_record();
CREATE TRIGGER behavioral_allocation_research_immutable
BEFORE UPDATE OR DELETE ON app.behavioral_allocation_research
FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();

ALTER TABLE app.behavioral_allocation_research ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.behavioral_allocation_research FORCE ROW LEVEL SECURITY;
CREATE POLICY behavioral_allocation_research_workspace ON app.behavioral_allocation_research
USING (evidence.economic_state_workspace_visible(organization_id, workspace_id))
WITH CHECK (evidence.economic_state_workspace_visible(organization_id, workspace_id));
REVOKE ALL ON app.behavioral_allocation_research FROM PUBLIC, economyos_app, economyos_ingest;

CREATE FUNCTION app.append_behavioral_allocation_research(
  requested_workspace_id uuid,
  requested_id uuid,
  requested_kind text,
  requested_known_at timestamptz,
  requested_input jsonb,
  requested_result jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
DECLARE
  organization uuid := app.current_organization_id();
  actor uuid := app.current_subject_id();
  item app.behavioral_allocation_research%ROWTYPE;
BEGIN
  IF requested_workspace_id IS NULL OR requested_id IS NULL OR requested_kind IS NULL
    OR requested_kind NOT IN (
      'behavioral_choice', 'intervention_detection', 'allocation_simulation', 'material_balance'
    )
    OR requested_known_at IS NULL OR NOT isfinite(requested_known_at)
    OR requested_known_at > clock_timestamp()
    OR NOT app.behavioral_allocation_valid_document(requested_input)
    OR NOT app.behavioral_allocation_valid_document(requested_result)
  THEN RAISE EXCEPTION 'invalid research execution record' USING ERRCODE = '22023'; END IF;
  IF evidence.economic_state_workspace_visible(organization, requested_workspace_id)
      IS DISTINCT FROM true
    OR NOT EXISTS (
      SELECT 1 FROM app.workspace_memberships membership
      WHERE membership.organization_id = organization
        AND membership.workspace_id = requested_workspace_id
        AND membership.subject_id = actor
        AND membership.role IN ('analyst', 'steward', 'validator', 'admin')
    )
  THEN RAISE EXCEPTION 'research workspace unavailable' USING ERRCODE = '42501'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    organization::text || ':' || requested_workspace_id::text || ':' || requested_id::text, 39001
  ));
  SELECT * INTO item FROM app.behavioral_allocation_research record
  WHERE record.organization_id = organization
    AND record.workspace_id = requested_workspace_id AND record.id = requested_id;
  IF item.id IS NOT NULL THEN
    IF item.actor_id IS DISTINCT FROM actor OR item.kind IS DISTINCT FROM requested_kind
      OR item.known_at IS DISTINCT FROM requested_known_at
      OR item.input IS DISTINCT FROM requested_input OR item.result IS DISTINCT FROM requested_result
    THEN RAISE EXCEPTION 'research execution replay changed immutable content'
      USING ERRCODE = '23514'; END IF;
  ELSE
    INSERT INTO app.behavioral_allocation_research (
      organization_id, workspace_id, id, actor_id, kind, known_at, input, result
    ) VALUES (
      organization, requested_workspace_id, requested_id, actor, requested_kind,
      requested_known_at, requested_input, requested_result
    ) RETURNING * INTO item;
  END IF;
  RETURN item.manifest || jsonb_build_object('manifestSha256', item.manifest_sha256);
END
$$;

CREATE FUNCTION app.get_behavioral_allocation_research(
  requested_workspace_id uuid,
  requested_id uuid,
  requested_known_at timestamptz,
  requested_system_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, evidence
AS $$
DECLARE
  output jsonb;
BEGIN
  IF requested_workspace_id IS NULL OR requested_id IS NULL
    OR requested_known_at IS NULL OR requested_system_at IS NULL
    OR NOT isfinite(requested_known_at) OR NOT isfinite(requested_system_at)
  THEN RAISE EXCEPTION 'invalid research read cutoff' USING ERRCODE = '22023'; END IF;
  SELECT record.manifest || jsonb_build_object('manifestSha256', record.manifest_sha256)
  INTO output
  FROM app.behavioral_allocation_research record
  WHERE record.organization_id = app.current_organization_id()
    AND record.workspace_id = requested_workspace_id AND record.id = requested_id
    AND evidence.economic_state_workspace_visible(record.organization_id, record.workspace_id)
    AND record.known_at <= requested_known_at AND record.recorded_at <= requested_system_at;
  RETURN output;
END
$$;

REVOKE ALL ON FUNCTION app.behavioral_allocation_valid_document(jsonb)
  FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION app.behavioral_allocation_seal_record()
  FROM PUBLIC, economyos_app, economyos_ingest;
REVOKE ALL ON FUNCTION app.append_behavioral_allocation_research(uuid,uuid,text,timestamptz,jsonb,jsonb)
  FROM PUBLIC, economyos_ingest;
REVOKE ALL ON FUNCTION app.get_behavioral_allocation_research(uuid,uuid,timestamptz,timestamptz)
  FROM PUBLIC, economyos_ingest;
GRANT EXECUTE ON FUNCTION app.append_behavioral_allocation_research(uuid,uuid,text,timestamptz,jsonb,jsonb)
  TO economyos_app;
GRANT EXECUTE ON FUNCTION app.get_behavioral_allocation_research(uuid,uuid,timestamptz,timestamptz)
  TO economyos_app;

CREATE INDEX behavioral_allocation_research_pit_idx ON app.behavioral_allocation_research (
  organization_id, workspace_id, known_at DESC, recorded_at DESC, id
);
COMMENT ON TABLE app.behavioral_allocation_research IS
  'Immutable research scenarios with unverified caller inputs; no observation admission or causal validation. Application also enforces model grants and entitlements.';
