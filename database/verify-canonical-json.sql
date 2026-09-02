DO $verify_cross_runtime_canonical_json$
DECLARE
  fixture jsonb := '{
    "schemaVersion": 1,
    "nested": {"b": null, "a": -2},
    "enabled": true,
    "array": [3, 0.15, {"zeta": "ok", "alpha": 1}]
  }'::jsonb;
  expected_text text := '{"array":[3,0.15,{"alpha":1,"zeta":"ok"}],"enabled":true,"nested":{"a":-2,"b":null},"schemaVersion":1}';
  expected_sha256 text := '581405997830c84835db2a94289bfeba88259e32c90af5fb08efeb8cb44deaa8';
  actual_text text;
  actual_sha256 text;
BEGIN
  actual_text := evidence.canonical_json(fixture);
  actual_sha256 := encode(digest(convert_to(actual_text, 'UTF8'), 'sha256'), 'hex');
  IF actual_text <> expected_text OR actual_sha256 <> expected_sha256 THEN
    RAISE EXCEPTION 'SQL/TypeScript canonical JSON contract drift: text=%, digest=%',
      actual_text, actual_sha256;
  END IF;
END
$verify_cross_runtime_canonical_json$;
