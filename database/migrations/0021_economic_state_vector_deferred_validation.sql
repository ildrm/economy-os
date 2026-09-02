-- Correct the deferred EconomicState trigger dispatchers without changing any
-- immutable evidence contract. Keeping each NEW-field access in a separate
-- PL/pgSQL branch prevents PostgreSQL from resolving a field that is absent
-- from the other trigger relation's record shape.

CREATE OR REPLACE FUNCTION evidence.validate_economic_state_model_deferred()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, evidence
AS $$
BEGIN
  IF TG_RELID = 'evidence.economic_state_models'::regclass THEN
    PERFORM evidence.validate_economic_state_model(NEW.id);
  ELSIF TG_RELID = 'evidence.economic_state_model_components'::regclass THEN
    PERFORM evidence.validate_economic_state_model(NEW.model_id);
  ELSE
    RAISE EXCEPTION 'unexpected EconomicState model validation relation: %',
      TG_RELID::regclass
      USING ERRCODE = '55000';
  END IF;
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION evidence.validate_economic_state_run_deferred()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, evidence
AS $$
BEGIN
  IF TG_RELID = 'evidence.economic_state_runs'::regclass THEN
    PERFORM evidence.validate_economic_state_run(NEW.id);
  ELSIF TG_RELID = 'evidence.economic_state_component_results'::regclass THEN
    PERFORM evidence.validate_economic_state_run(NEW.run_id);
  ELSE
    RAISE EXCEPTION 'unexpected EconomicState run validation relation: %',
      TG_RELID::regclass
      USING ERRCODE = '55000';
  END IF;
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION evidence.validate_economic_state_vector_deferred()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
BEGIN
  IF TG_RELID = 'evidence.economic_state_vectors'::regclass THEN
    PERFORM evidence.validate_economic_state_vector(NEW.id);
  ELSIF TG_RELID = 'evidence.economic_state_vector_dimensions'::regclass THEN
    PERFORM evidence.validate_economic_state_vector(NEW.vector_id);
  ELSE
    RAISE EXCEPTION 'unexpected EconomicState vector validation relation: %',
      TG_RELID::regclass
      USING ERRCODE = '55000';
  END IF;
  RETURN NULL;
END
$$;

COMMENT ON FUNCTION evidence.validate_economic_state_vector_deferred() IS
  'Dispatches deferred vector validation without resolving fields absent from either trigger row shape.';

COMMENT ON FUNCTION evidence.validate_economic_state_model_deferred() IS
  'Dispatches deferred model validation without resolving fields absent from either trigger row shape.';

COMMENT ON FUNCTION evidence.validate_economic_state_run_deferred() IS
  'Dispatches deferred run validation without resolving fields absent from either trigger row shape.';
