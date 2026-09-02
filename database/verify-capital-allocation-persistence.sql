-- Verify the Phase 6 capital-allocation research authority: immutable exact
-- package manifests, strict PIT evidence, explicit valuation unavailability,
-- chronological validation, request-order comparisons, RLS, and narrow reads.
BEGIN;

INSERT INTO app.organizations (id, slug, name) VALUES
  ('64af47ac-19fc-7c92-ae91-0242ac120001', 'capital-a', 'Capital Tenant A'),
  ('64af47ac-19fc-7c92-ae91-0242ac120002', 'capital-b', 'Capital Tenant B');
INSERT INTO app.workspaces (id, organization_id, slug, name) VALUES
  (
    '64af47ac-19fc-7c92-ae91-0242ac120003',
    '64af47ac-19fc-7c92-ae91-0242ac120001', 'research', 'Capital Research A'
  ),
  (
    '64af47ac-19fc-7c92-ae91-0242ac120004',
    '64af47ac-19fc-7c92-ae91-0242ac120002', 'research', 'Capital Research B'
  );
INSERT INTO app.subjects (id, issuer, external_subject, kind) VALUES
  (
    '64af47ac-19fc-7c92-ae91-0242ac120005',
    'https://identity.economyos.test/', 'capital-admin-a', 'human'
  ),
  (
    '64af47ac-19fc-7c92-ae91-0242ac120006',
    'https://identity.economyos.test/', 'capital-admin-b', 'human'
  );
INSERT INTO app.organization_memberships (
  organization_id, subject_id, role, valid_from
) VALUES
  (
    '64af47ac-19fc-7c92-ae91-0242ac120001',
    '64af47ac-19fc-7c92-ae91-0242ac120005', 'admin', '2026-01-01T00:00:00Z'
  ),
  (
    '64af47ac-19fc-7c92-ae91-0242ac120002',
    '64af47ac-19fc-7c92-ae91-0242ac120006', 'admin', '2026-01-01T00:00:00Z'
  );
INSERT INTO app.workspace_memberships (
  organization_id, workspace_id, subject_id, role, valid_from
) VALUES
  (
    '64af47ac-19fc-7c92-ae91-0242ac120001',
    '64af47ac-19fc-7c92-ae91-0242ac120003',
    '64af47ac-19fc-7c92-ae91-0242ac120005', 'admin', '2026-01-01T00:00:00Z'
  ),
  (
    '64af47ac-19fc-7c92-ae91-0242ac120002',
    '64af47ac-19fc-7c92-ae91-0242ac120004',
    '64af47ac-19fc-7c92-ae91-0242ac120006', 'admin', '2026-01-01T00:00:00Z'
  );

INSERT INTO evidence.geographies (id, kind, code_scheme, code, name) VALUES
  (
    '64af47ac-19fc-7c92-ae91-0242ac120007',
    'economy', 'ISO-3166-1-alpha-2', 'CA', 'Capital economy A'
  ),
  (
    '64af47ac-19fc-7c92-ae91-0242ac120008',
    'economy', 'ISO-3166-1-alpha-2', 'CB', 'Capital economy B'
  );

WITH snapshots(id, organization_id, workspace_id, known_at, created_by, manifest) AS (
  VALUES
  (
    '64af47ac-19fc-7c92-ae91-0242ac120010'::uuid,
    '64af47ac-19fc-7c92-ae91-0242ac120001'::uuid,
    '64af47ac-19fc-7c92-ae91-0242ac120003'::uuid,
    '2026-06-01T00:00:00Z'::timestamptz,
    '64af47ac-19fc-7c92-ae91-0242ac120005'::uuid,
    '{"knownAt":"2026-06-01T00:00:00Z","policy":"true_vintage","observationIds":[]}'::jsonb
  ),
  (
    '64af47ac-19fc-7c92-ae91-0242ac120011'::uuid,
    '64af47ac-19fc-7c92-ae91-0242ac120002'::uuid,
    '64af47ac-19fc-7c92-ae91-0242ac120004'::uuid,
    '2026-06-01T00:00:00Z'::timestamptz,
    '64af47ac-19fc-7c92-ae91-0242ac120006'::uuid,
    '{"knownAt":"2026-06-01T00:00:00Z","policy":"true_vintage","observationIds":[]}'::jsonb
  )
)
INSERT INTO evidence.dataset_snapshots (
  id, organization_id, workspace_id, known_at, policy,
  manifest, manifest_sha256, created_by, created_at
)
SELECT id, organization_id, workspace_id, known_at, 'true_vintage', manifest,
  encode(digest(convert_to(manifest::text, 'UTF8'), 'sha256'), 'hex'),
  created_by, '2026-06-01T00:00:00Z'
FROM snapshots;

SET LOCAL app.organization_id = '64af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '64af47ac-19fc-7c92-ae91-0242ac120005';
WITH manifested AS (
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'id', '64af47ac-19fc-7c92-ae91-0242ac120020',
    'key', 'capital.research.primary',
    'version', '1.0.0',
    'lifecycleStatus', 'research',
    'algorithm', jsonb_build_object('key', 'capital.assessment', 'version', '1.0.0'),
    'codeCommitSha256', repeat('1', 64),
    'packageLockSha256', repeat('2', 64),
    'sbomSha256', repeat('3', 64),
    'environmentSha256', repeat('4', 64),
    'configurationSha256', repeat('5', 64),
    'normalizationSha256', repeat('6', 64),
    'assumptionsSha256', repeat('7', 64),
    'approvalSha256', repeat('8', 64)
  ) AS manifest
)
INSERT INTO evidence.economic_state_model_artifacts (
  id, organization_id, workspace_id, artifact_key, artifact_version,
  lifecycle_status, algorithm_key, algorithm_version,
  code_commit_sha256, package_lock_sha256, sbom_sha256,
  environment_sha256, configuration_sha256, normalization_sha256,
  assumptions_sha256, approval_sha256, artifact_manifest, artifact_sha256,
  created_by, created_at
)
SELECT
  '64af47ac-19fc-7c92-ae91-0242ac120020',
  '64af47ac-19fc-7c92-ae91-0242ac120001',
  '64af47ac-19fc-7c92-ae91-0242ac120003',
  'capital.research.primary', '1.0.0', 'research',
  'capital.assessment', '1.0.0', repeat('1', 64), repeat('2', 64),
  repeat('3', 64), repeat('4', 64), repeat('5', 64), repeat('6', 64),
  repeat('7', 64), repeat('8', 64), manifest,
  encode(digest(convert_to(evidence.canonical_json(manifest), 'UTF8'), 'sha256'), 'hex'),
  '64af47ac-19fc-7c92-ae91-0242ac120005', '2026-01-01T00:00:00Z'
FROM manifested;

SET LOCAL ROLE economyos_app_local;
SELECT evidence.create_relationship_evidence(
  '64af47ac-19fc-7c92-ae91-0242ac120030',
  '64af47ac-19fc-7c92-ae91-0242ac120003',
  'expert_review', 'https://example.invalid/capital/evidence', repeat('a', 64),
  '{"section":"macro-support"}'::jsonb,
  '2026-06-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL
);
SELECT evidence.create_relationship_evidence(
  '64af47ac-19fc-7c92-ae91-0242ac120031',
  '64af47ac-19fc-7c92-ae91-0242ac120003',
  'falsification_test', 'https://example.invalid/capital/counter', repeat('b', 64),
  '{"section":"macro-counter"}'::jsonb,
  '2026-06-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL
);
RESET ROLE;

SELECT pg_sleep(0.01);
CREATE TEMP TABLE capital_verification_clock (
  system_cutoff timestamptz NOT NULL,
  outcome_sha256 text,
  assessment_a_sha256 text,
  assessment_b_sha256 text
) ON COMMIT DROP;
INSERT INTO capital_verification_clock(system_cutoff)
VALUES (date_trunc('milliseconds', clock_timestamp()));
GRANT SELECT, UPDATE ON capital_verification_clock
  TO economyos_app_local, economyos_ingest_local;

-- These adversarial snapshots separate knowledge time from system time: one
-- knows data after the cutoff, the other is backfilled after the cutoff.
WITH snapshots(id, known_at, created_at, manifest) AS (
  VALUES
  (
    '64af47ac-19fc-7c92-ae91-0242ac120012'::uuid,
    '2031-01-01T00:00:00Z'::timestamptz,
    '2026-06-01T00:00:00Z'::timestamptz,
    '{"knownAt":"2031-01-01T00:00:00Z","policy":"true_vintage","observationIds":[]}'::jsonb
  ),
  (
    '64af47ac-19fc-7c92-ae91-0242ac120013'::uuid,
    '2026-06-01T00:00:00Z'::timestamptz,
    (SELECT system_cutoff + interval '1 day' FROM capital_verification_clock),
    '{"knownAt":"2026-06-01T00:00:00Z","policy":"true_vintage","observationIds":["64af47ac-19fc-7c92-ae91-0242ac120013"]}'::jsonb
  )
)
INSERT INTO evidence.dataset_snapshots (
  id, organization_id, workspace_id, known_at, policy,
  manifest, manifest_sha256, created_by, created_at
)
SELECT id, '64af47ac-19fc-7c92-ae91-0242ac120001',
  '64af47ac-19fc-7c92-ae91-0242ac120003', known_at, 'true_vintage', manifest,
  encode(digest(convert_to(manifest::text, 'UTF8'), 'sha256'), 'hex'),
  '64af47ac-19fc-7c92-ae91-0242ac120005', created_at
FROM snapshots;

CREATE TEMP TABLE capital_verification_payloads (
  payload_key text PRIMARY KEY,
  payload jsonb NOT NULL
) ON COMMIT DROP;
GRANT SELECT ON capital_verification_payloads
  TO economyos_app_local, economyos_ingest_local;

CREATE OR REPLACE FUNCTION pg_temp.capital_asset_manifest(
  requested_assessment_id uuid,
  requested_asset_class text,
  requested_valuation_available boolean,
  requested_numeric_macro boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
DECLARE
  evidence_items jsonb;
  counter_items jsonb;
  evidence_id text;
  decision_inputs jsonb;
  macro_contributions jsonb;
  valuation jsonb;
  combined jsonb;
  presentation jsonb;
  value_json jsonb := CASE WHEN requested_numeric_macro THEN '0.4'::jsonb
    ELSE to_jsonb('0.4'::text) END;
  dimensions text[] := ARRAY[
    'access','liquidity','currency','crisis','contagion',
    'human_sustainability','tail_risk','drawdown','historical_analog'
  ];
BEGIN
  SELECT jsonb_agg(binding.item_manifest ORDER BY binding.evidence_id::text),
    min(binding.evidence_id::text)
  INTO evidence_items, evidence_id
  FROM evidence.capital_assessment_evidence_bindings binding
  WHERE binding.assessment_id = requested_assessment_id
    AND binding.asset_class = requested_asset_class
    AND binding.evidence_role = 'evidence';
  SELECT jsonb_agg(binding.item_manifest ORDER BY binding.evidence_id::text)
  INTO counter_items
  FROM evidence.capital_assessment_evidence_bindings binding
  WHERE binding.assessment_id = requested_assessment_id
    AND binding.asset_class = requested_asset_class
    AND binding.evidence_role = 'counter_evidence';
  IF evidence_items IS NULL OR counter_items IS NULL THEN
    RAISE EXCEPTION 'verification assessment requires both evidence roles';
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'dimension', dimension,
    'value', value_json,
    'uncertainty', '0.2',
    'evidenceIds', jsonb_build_array(evidence_id),
    'rationale', 'Verification research rationale for ' || dimension || '.'
  ) ORDER BY ordinal)
  INTO decision_inputs
  FROM unnest(dimensions) WITH ORDINALITY source(dimension, ordinal);
  SELECT jsonb_agg(jsonb_build_object(
    'componentKey', dimension,
    'inputValue', '0.4',
    'weight', CASE WHEN ordinal = 9 THEN '0.2' ELSE '0.1' END,
    'contribution', CASE WHEN ordinal = 9 THEN '0.08' ELSE '0.04' END
  ) ORDER BY ordinal)
  INTO macro_contributions
  FROM unnest(dimensions) WITH ORDINALITY source(dimension, ordinal);
  IF requested_valuation_available THEN
    valuation := jsonb_build_object(
      'status','available','score','0.2',
      'uncertainty',jsonb_build_object(
        'lower','-0.2','upper','0.6','confidenceLevel','0.7','method','bootstrap_interval'
      ),
      'componentContributions',jsonb_build_array(jsonb_build_object(
        'componentKey','valuation_gap','inputValue','0.2','weight','1','contribution','0.2'
      ))
    );
    combined := jsonb_build_object(
      'status','available','score','0.32',
      'uncertainty',jsonb_build_object(
        'lower','-0.02','upper','0.66','confidenceLevel','0.7',
        'method','weighted_component_intervals'
      ),
      'componentContributions',jsonb_build_array(
        jsonb_build_object(
          'componentKey','macro_suitability','inputValue','0.4',
          'weight','0.6','contribution','0.24'
        ),
        jsonb_build_object(
          'componentKey','valuation_suitability','inputValue','0.2',
          'weight','0.4','contribution','0.08'
        )
      ),
      'method','weighted_linear','macroWeight','0.6','valuationWeight','0.4'
    );
    presentation := jsonb_build_object(
      'label','display_only_not_a_validated_score',
      'method','linear_confidence_shrinkage',
      'basedOnCombinedSuitability','0.32','target','0',
      'confidenceWeight','0.5','value','0.16'
    );
  ELSE
    valuation := jsonb_build_object(
      'status','unavailable','score',NULL,'uncertainty',NULL,
      'componentContributions','[]'::jsonb,'reasonCode','missing_data',
      'explanation','Required valuation evidence is unavailable at the cutoff.'
    );
    combined := jsonb_build_object(
      'status','unavailable','score',NULL,'uncertainty',NULL,
      'componentContributions','[]'::jsonb,'reasonCode','valuation_unavailable',
      'explanation',
        'Combined suitability is unavailable because valuation suitability is unavailable.',
      'method','weighted_linear','macroWeight','0.6','valuationWeight','0.4'
    );
    presentation := 'null'::jsonb;
  END IF;
  RETURN jsonb_build_object(
    'assetClass',requested_asset_class,
    'decisionInputs',decision_inputs,
    'macroSuitability',jsonb_build_object(
      'status','available','score','0.4',
      'uncertainty',jsonb_build_object(
        'lower','0.1','upper','0.7','confidenceLevel','0.8','method','bootstrap_interval'
      ),
      'componentContributions',macro_contributions
    ),
    'valuationSuitability',valuation,
    'combinedSuitability',combined,
    'combinationPolicy',jsonb_build_object(
      'method','weighted_linear','macroWeight','0.6','valuationWeight','0.4'
    ),
    'evidence',jsonb_build_object('items',evidence_items,'absenceReason',NULL),
    'counterEvidence',jsonb_build_object('items',counter_items,'absenceReason',NULL),
    'assumptions',jsonb_build_array('Verification-only stable-policy assumption.'),
    'limitations',jsonb_build_array('Verification fixture has intentionally limited scope.'),
    'invalidationCriteria',jsonb_build_array(jsonb_build_object(
      'criterionId','policy-break','description','Invalidate after a policy regime break.',
      'indicatorKey','policy.regime','operator','equals','threshold','changed'
    )),
    'presentationStatistic',presentation
  );
END
$$;
GRANT EXECUTE ON FUNCTION pg_temp.capital_asset_manifest(uuid,text,boolean,boolean)
  TO economyos_ingest_local;

CREATE OR REPLACE FUNCTION pg_temp.with_manifest_digest(requested_body jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, evidence
AS $$
  SELECT requested_body || jsonb_build_object(
    'manifestSha256', evidence.capital_json_digest(requested_body)
  )
$$;
GRANT EXECUTE ON FUNCTION pg_temp.with_manifest_digest(jsonb)
  TO economyos_app_local, economyos_ingest_local;

SET LOCAL ROLE economyos_ingest_local;
SELECT evidence.prepare_capital_research_assessment(
  '64af47ac-19fc-7c92-ae91-0242ac120040',
  '64af47ac-19fc-7c92-ae91-0242ac120003',
  '64af47ac-19fc-7c92-ae91-0242ac120007', 'CA', 'balanced_research',
  '2030-01-01T00:00:00Z', '2029-12-31T00:00:00Z',
  (SELECT system_cutoff FROM capital_verification_clock),
  '64af47ac-19fc-7c92-ae91-0242ac120010',
  '64af47ac-19fc-7c92-ae91-0242ac120010',
  '64af47ac-19fc-7c92-ae91-0242ac120020', 'candidate',
  ARRAY['CA','CB'], ARRAY['balanced_research'],
  '["Model relationships remain stable through the research horizon."]'::jsonb,
  '["Candidate research has not been validated for decision use."]'::jsonb
);
SELECT evidence.prepare_capital_research_assessment(
  '64af47ac-19fc-7c92-ae91-0242ac120041',
  '64af47ac-19fc-7c92-ae91-0242ac120003',
  '64af47ac-19fc-7c92-ae91-0242ac120008', 'CB', 'balanced_research',
  '2030-01-01T00:00:00Z', '2029-12-31T00:00:00Z',
  (SELECT system_cutoff FROM capital_verification_clock),
  '64af47ac-19fc-7c92-ae91-0242ac120010',
  '64af47ac-19fc-7c92-ae91-0242ac120010',
  '64af47ac-19fc-7c92-ae91-0242ac120020', 'candidate',
  ARRAY['CA','CB'], ARRAY['balanced_research'],
  '["Model relationships remain stable through the research horizon."]'::jsonb,
  '["Candidate research has not been validated for decision use."]'::jsonb
);
-- An intentionally incomplete identity must never become app-visible.
SELECT evidence.prepare_capital_research_assessment(
  '64af47ac-19fc-7c92-ae91-0242ac120042',
  '64af47ac-19fc-7c92-ae91-0242ac120003',
  '64af47ac-19fc-7c92-ae91-0242ac120007', 'CA', 'balanced_research',
  '2030-01-01T00:00:00Z', '2029-12-31T00:00:00Z',
  (SELECT system_cutoff FROM capital_verification_clock),
  '64af47ac-19fc-7c92-ae91-0242ac120010',
  '64af47ac-19fc-7c92-ae91-0242ac120010',
  '64af47ac-19fc-7c92-ae91-0242ac120020', 'candidate',
  ARRAY['CA','CB'], ARRAY['balanced_research'],
  '["Model relationships remain stable through the research horizon."]'::jsonb,
  '["Candidate research has not been validated for decision use."]'::jsonb
);

-- Exact prepare replay is safe; identity drift and advice language are permanent failures.
SELECT evidence.prepare_capital_research_assessment(
  '64af47ac-19fc-7c92-ae91-0242ac120040',
  '64af47ac-19fc-7c92-ae91-0242ac120003',
  '64af47ac-19fc-7c92-ae91-0242ac120007', 'CA', 'balanced_research',
  '2030-01-01T00:00:00Z', '2029-12-31T00:00:00Z',
  (SELECT system_cutoff FROM capital_verification_clock),
  '64af47ac-19fc-7c92-ae91-0242ac120010',
  '64af47ac-19fc-7c92-ae91-0242ac120010',
  '64af47ac-19fc-7c92-ae91-0242ac120020', 'candidate',
  ARRAY['CA','CB'], ARRAY['balanced_research'],
  '["Model relationships remain stable through the research horizon."]'::jsonb,
  '["Candidate research has not been validated for decision use."]'::jsonb
);
DO $prepare_failures$
BEGIN
  BEGIN
    PERFORM evidence.prepare_capital_research_assessment(
      '64af47ac-19fc-7c92-ae91-0242ac120040',
      '64af47ac-19fc-7c92-ae91-0242ac120003',
      '64af47ac-19fc-7c92-ae91-0242ac120007', 'CA', 'changed_strategy',
      '2030-01-01T00:00:00Z', '2029-12-31T00:00:00Z',
      (SELECT system_cutoff FROM capital_verification_clock),
      '64af47ac-19fc-7c92-ae91-0242ac120010',
      '64af47ac-19fc-7c92-ae91-0242ac120010',
      '64af47ac-19fc-7c92-ae91-0242ac120020', 'candidate',
      ARRAY['CA','CB'], ARRAY['changed_strategy'],
      '["Model relationships remain stable through the research horizon."]'::jsonb,
      '["Candidate research has not been validated for decision use."]'::jsonb
    );
    RAISE EXCEPTION 'changed assessment replay was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
  BEGIN
    PERFORM evidence.prepare_capital_research_assessment(
      '64af47ac-19fc-7c92-ae91-0242ac120043',
      '64af47ac-19fc-7c92-ae91-0242ac120003',
      '64af47ac-19fc-7c92-ae91-0242ac120007', 'CA', 'balanced_research',
      '2030-01-01T00:00:00Z', '2029-12-31T00:00:00Z',
      (SELECT system_cutoff FROM capital_verification_clock),
      '64af47ac-19fc-7c92-ae91-0242ac120010',
      '64af47ac-19fc-7c92-ae91-0242ac120010',
      '64af47ac-19fc-7c92-ae91-0242ac120020', 'candidate',
      ARRAY['CA','CB'], ARRAY['balanced_research'],
      '["You should buy equities."]'::jsonb,
      '["Candidate research has not been validated for decision use."]'::jsonb
    );
    RAISE EXCEPTION 'advice language was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    PERFORM evidence.prepare_capital_research_assessment(
      '64af47ac-19fc-7c92-ae91-0242ac120045',
      '64af47ac-19fc-7c92-ae91-0242ac120003',
      '64af47ac-19fc-7c92-ae91-0242ac120007', 'CA', 'balanced_research',
      '2030-01-01T00:00:00Z', '2029-12-31T00:00:00Z',
      (SELECT system_cutoff FROM capital_verification_clock),
      '64af47ac-19fc-7c92-ae91-0242ac120012',
      '64af47ac-19fc-7c92-ae91-0242ac120010',
      '64af47ac-19fc-7c92-ae91-0242ac120020', 'candidate',
      ARRAY['CA','CB'], ARRAY['balanced_research'],
      '["Future-knowledge snapshot assumption."]'::jsonb,
      '["Future-knowledge snapshot limitation."]'::jsonb
    );
    RAISE EXCEPTION 'snapshot knowledge after knowledge cutoff was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
  BEGIN
    PERFORM evidence.prepare_capital_research_assessment(
      '64af47ac-19fc-7c92-ae91-0242ac120046',
      '64af47ac-19fc-7c92-ae91-0242ac120003',
      '64af47ac-19fc-7c92-ae91-0242ac120007', 'CA', 'balanced_research',
      '2030-01-01T00:00:00Z', '2029-12-31T00:00:00Z',
      (SELECT system_cutoff FROM capital_verification_clock),
      '64af47ac-19fc-7c92-ae91-0242ac120010',
      '64af47ac-19fc-7c92-ae91-0242ac120013',
      '64af47ac-19fc-7c92-ae91-0242ac120020', 'candidate',
      ARRAY['CA','CB'], ARRAY['balanced_research'],
      '["Backfilled-vintage assumption."]'::jsonb,
      '["Backfilled-vintage limitation."]'::jsonb
    );
    RAISE EXCEPTION 'vintage recorded after system cutoff was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
END
$prepare_failures$;

SELECT evidence.bind_capital_assessment_evidence(
  '64af47ac-19fc-7c92-ae91-0242ac120050',
  '64af47ac-19fc-7c92-ae91-0242ac120040', 'equities', 'evidence',
  '64af47ac-19fc-7c92-ae91-0242ac120060', 'expert_judgment',
  'macro.support', 'Independent macro support recorded before cutoff.', 2000,
  'relationship_evidence', '64af47ac-19fc-7c92-ae91-0242ac120030'
);
SELECT evidence.bind_capital_assessment_evidence(
  '64af47ac-19fc-7c92-ae91-0242ac120051',
  '64af47ac-19fc-7c92-ae91-0242ac120040', 'equities', 'counter_evidence',
  '64af47ac-19fc-7c92-ae91-0242ac120061', 'research',
  'macro.counter', 'Independent falsification evidence recorded before cutoff.', 2000,
  'relationship_evidence', '64af47ac-19fc-7c92-ae91-0242ac120031'
);
SELECT evidence.bind_capital_assessment_evidence(
  '64af47ac-19fc-7c92-ae91-0242ac120052',
  '64af47ac-19fc-7c92-ae91-0242ac120041', 'equities', 'evidence',
  '64af47ac-19fc-7c92-ae91-0242ac120062', 'expert_judgment',
  'macro.support', 'Independent macro support recorded before cutoff.', 2000,
  'relationship_evidence', '64af47ac-19fc-7c92-ae91-0242ac120030'
);
SELECT evidence.bind_capital_assessment_evidence(
  '64af47ac-19fc-7c92-ae91-0242ac120053',
  '64af47ac-19fc-7c92-ae91-0242ac120041', 'equities', 'counter_evidence',
  '64af47ac-19fc-7c92-ae91-0242ac120063', 'research',
  'macro.counter', 'Independent falsification evidence recorded before cutoff.', 2000,
  'relationship_evidence', '64af47ac-19fc-7c92-ae91-0242ac120031'
);
RESET ROLE;

-- A source recorded after the assessment system cutoff is excluded even when
-- its valid time is backdated.
SELECT pg_sleep(0.01);
SET LOCAL ROLE economyos_app_local;
SELECT evidence.create_relationship_evidence(
  '64af47ac-19fc-7c92-ae91-0242ac120032',
  '64af47ac-19fc-7c92-ae91-0242ac120003',
  'expert_review', 'https://example.invalid/capital/late', repeat('c', 64),
  '{"section":"backdated-after-cutoff"}'::jsonb,
  '2026-06-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL
);
RESET ROLE;
SET LOCAL ROLE economyos_ingest_local;
DO $late_and_duplicate_evidence$
BEGIN
  BEGIN
    PERFORM evidence.bind_capital_assessment_evidence(
      '64af47ac-19fc-7c92-ae91-0242ac120054',
      '64af47ac-19fc-7c92-ae91-0242ac120040', 'equities', 'evidence',
      '64af47ac-19fc-7c92-ae91-0242ac120064', 'expert_judgment',
      'macro.late', 'Backdated research recorded after system cutoff.', 2000,
      'relationship_evidence', '64af47ac-19fc-7c92-ae91-0242ac120032'
    );
    RAISE EXCEPTION 'later-recorded evidence was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
  BEGIN
    PERFORM evidence.bind_capital_assessment_evidence(
      '64af47ac-19fc-7c92-ae91-0242ac120055',
      '64af47ac-19fc-7c92-ae91-0242ac120040', 'equities', 'counter_evidence',
      '64af47ac-19fc-7c92-ae91-0242ac120065', 'expert_judgment',
      'macro.duplicate', 'Duplicate physical source across evidence roles.', 2000,
      'relationship_evidence', '64af47ac-19fc-7c92-ae91-0242ac120030'
    );
    RAISE EXCEPTION 'one physical source was duplicated across evidence roles';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END
$late_and_duplicate_evidence$;
RESET ROLE;

INSERT INTO capital_verification_payloads(payload_key, payload) VALUES
  (
    'asset_available',
    pg_temp.capital_asset_manifest(
      '64af47ac-19fc-7c92-ae91-0242ac120040', 'equities', true, false
    )
  ),
  (
    'asset_unavailable',
    pg_temp.capital_asset_manifest(
      '64af47ac-19fc-7c92-ae91-0242ac120041', 'equities', false, false
    )
  );

SET LOCAL ROLE economyos_ingest_local;
DO $asset_shape_failures$
DECLARE
  malformed jsonb;
BEGIN
  malformed := pg_temp.capital_asset_manifest(
    '64af47ac-19fc-7c92-ae91-0242ac120040', 'equities', true, true
  );
  BEGIN
    PERFORM evidence.append_capital_assessment_asset(
      '64af47ac-19fc-7c92-ae91-0242ac120070',
      '64af47ac-19fc-7c92-ae91-0242ac120040', malformed
    );
    RAISE EXCEPTION 'JSON-number decimal was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
  malformed := jsonb_set(
    (SELECT payload FROM capital_verification_payloads
      WHERE payload_key = 'asset_available'),
    '{macroSuitability,componentContributions,0,contribution}', '"0.05"'::jsonb
  );
  BEGIN
    PERFORM evidence.append_capital_assessment_asset(
      '64af47ac-19fc-7c92-ae91-0242ac120071',
      '64af47ac-19fc-7c92-ae91-0242ac120040', malformed
    );
    RAISE EXCEPTION 'forged exact-decimal contribution was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
  malformed := jsonb_set(
    (SELECT payload FROM capital_verification_payloads
      WHERE payload_key = 'asset_unavailable'),
    '{valuationSuitability,score}', '"0"'::jsonb
  );
  BEGIN
    PERFORM evidence.append_capital_assessment_asset(
      '64af47ac-19fc-7c92-ae91-0242ac120072',
      '64af47ac-19fc-7c92-ae91-0242ac120041', malformed
    );
    RAISE EXCEPTION 'unavailable valuation was neutralized to zero';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
  malformed := jsonb_set(
    (SELECT payload FROM capital_verification_payloads
      WHERE payload_key = 'asset_available'),
    '{invalidationCriteria}', '[]'::jsonb
  );
  BEGIN
    PERFORM evidence.append_capital_assessment_asset(
      '64af47ac-19fc-7c92-ae91-0242ac120073',
      '64af47ac-19fc-7c92-ae91-0242ac120040', malformed
    );
    RAISE EXCEPTION 'empty invalidation criteria were accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
  malformed := jsonb_set(
    (SELECT payload FROM capital_verification_payloads
      WHERE payload_key = 'asset_available'),
    '{decisionInputs,0,rationale}', '42'::jsonb
  );
  BEGIN
    PERFORM evidence.append_capital_assessment_asset(
      '64af47ac-19fc-7c92-ae91-0242ac120076',
      '64af47ac-19fc-7c92-ae91-0242ac120040', malformed
    );
    RAISE EXCEPTION 'non-string research rationale was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
END
$asset_shape_failures$;

SELECT evidence.append_capital_assessment_asset(
  '64af47ac-19fc-7c92-ae91-0242ac120074',
  '64af47ac-19fc-7c92-ae91-0242ac120040',
  (SELECT payload FROM capital_verification_payloads WHERE payload_key = 'asset_available')
);
SELECT evidence.append_capital_assessment_asset(
  '64af47ac-19fc-7c92-ae91-0242ac120075',
  '64af47ac-19fc-7c92-ae91-0242ac120041',
  (SELECT payload FROM capital_verification_payloads WHERE payload_key = 'asset_unavailable')
);
-- Exact asset replay is a no-op.
SELECT evidence.append_capital_assessment_asset(
  '64af47ac-19fc-7c92-ae91-0242ac120074',
  '64af47ac-19fc-7c92-ae91-0242ac120040',
  (SELECT payload FROM capital_verification_payloads WHERE payload_key = 'asset_available')
);
DO $asset_replay_conflict$
BEGIN
  BEGIN
    PERFORM evidence.append_capital_assessment_asset(
      '64af47ac-19fc-7c92-ae91-0242ac120074',
      '64af47ac-19fc-7c92-ae91-0242ac120040',
      jsonb_set(
        (SELECT payload FROM capital_verification_payloads
          WHERE payload_key = 'asset_available'),
        '{decisionInputs,0,rationale}', '"Changed replay rationale."'::jsonb
      )
    );
    RAISE EXCEPTION 'changed asset replay was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
END
$asset_replay_conflict$;

SELECT * FROM evidence.complete_capital_research_assessment(
  '64af47ac-19fc-7c92-ae91-0242ac120040',
  '64af47ac-19fc-7c92-ae91-0242ac120080'
);
SELECT * FROM evidence.complete_capital_research_assessment(
  '64af47ac-19fc-7c92-ae91-0242ac120041',
  '64af47ac-19fc-7c92-ae91-0242ac120081'
);
-- Exact completion replay is safe; a new identity is not.
SELECT * FROM evidence.complete_capital_research_assessment(
  '64af47ac-19fc-7c92-ae91-0242ac120040',
  '64af47ac-19fc-7c92-ae91-0242ac120080'
);
DO $completed_is_sealed$
BEGIN
  BEGIN
    PERFORM evidence.bind_capital_assessment_evidence(
      '64af47ac-19fc-7c92-ae91-0242ac120056',
      '64af47ac-19fc-7c92-ae91-0242ac120040', 'equities', 'evidence',
      '64af47ac-19fc-7c92-ae91-0242ac120066', 'expert_judgment',
      'macro.after_completion', 'Evidence after immutable completion.', 2000,
      'relationship_evidence', '64af47ac-19fc-7c92-ae91-0242ac120031'
    );
    RAISE EXCEPTION 'completed assessment accepted new evidence';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  BEGIN
    PERFORM evidence.complete_capital_research_assessment(
      '64af47ac-19fc-7c92-ae91-0242ac120040',
      '64af47ac-19fc-7c92-ae91-0242ac120082'
    );
    RAISE EXCEPTION 'completion replay changed identity';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
END
$completed_is_sealed$;
RESET ROLE;

UPDATE capital_verification_clock clock
SET assessment_a_sha256 = completion.manifest_sha256
FROM evidence.capital_assessment_completions completion
WHERE completion.assessment_id = '64af47ac-19fc-7c92-ae91-0242ac120040';
UPDATE capital_verification_clock clock
SET assessment_b_sha256 = completion.manifest_sha256
FROM evidence.capital_assessment_completions completion
WHERE completion.assessment_id = '64af47ac-19fc-7c92-ae91-0242ac120041';

-- The app boundary returns only completed, currently servable immutable manifests.
SET LOCAL ROLE economyos_app_local;
DO $assessment_reads$
DECLARE
  available_record record;
  unavailable_record record;
BEGIN
  SELECT * INTO available_record FROM app.get_capital_research_assessment(
    '64af47ac-19fc-7c92-ae91-0242ac120003',
    '64af47ac-19fc-7c92-ae91-0242ac120040'
  );
  SELECT * INTO unavailable_record FROM app.get_capital_research_assessment(
    '64af47ac-19fc-7c92-ae91-0242ac120003',
    '64af47ac-19fc-7c92-ae91-0242ac120041'
  );
  IF available_record.assessment_id IS NULL
    OR available_record.assessment_manifest#>>'{semantics,purpose}' <> 'research_only'
    OR available_record.assessment_manifest#>>'{semantics,decisionUse}' <> 'prohibited'
    OR available_record.assessment_manifest#>>'{assets,0,macroSuitability,score}' <> '0.4'
    OR available_record.assessment_manifest#>>'{assets,0,valuationSuitability,score}' <> '0.2'
    OR available_record.assessment_manifest#>>'{assets,0,combinedSuitability,score}' <> '0.32'
    OR jsonb_typeof(available_record.assessment_manifest#>'{assets,0,combinedSuitability,score}')
      <> 'string'
    OR jsonb_array_length(
      available_record.assessment_manifest#>'{assets,0,evidence,items}'
    ) <> 1
    OR jsonb_array_length(
      available_record.assessment_manifest#>'{assets,0,counterEvidence,items}'
    ) <> 1
  THEN RAISE EXCEPTION 'available assessment read lost exact governed content'; END IF;
  IF unavailable_record.assessment_id IS NULL
    OR unavailable_record.assessment_manifest#>>'{assets,0,valuationSuitability,status}'
      <> 'unavailable'
    OR jsonb_typeof(
      unavailable_record.assessment_manifest#>'{assets,0,valuationSuitability,score}'
    ) <> 'null'
    OR unavailable_record.assessment_manifest#>>'{assets,0,combinedSuitability,status}'
      <> 'unavailable'
    OR jsonb_typeof(
      unavailable_record.assessment_manifest#>'{assets,0,combinedSuitability,score}'
    ) <> 'null'
  THEN RAISE EXCEPTION 'unavailable valuation was not explicit and scoreless'; END IF;
  IF EXISTS (
    SELECT 1 FROM app.get_capital_research_assessment(
      '64af47ac-19fc-7c92-ae91-0242ac120003',
      '64af47ac-19fc-7c92-ae91-0242ac120042'
    )
  ) THEN RAISE EXCEPTION 'incomplete assessment became visible'; END IF;
END
$assessment_reads$;
RESET ROLE;
DO $assessment_digest$
BEGIN
  IF EXISTS (
    SELECT 1 FROM evidence.capital_assessment_completions completion
    WHERE completion.manifest_sha256 <> evidence.capital_json_digest(
      completion.assessment_manifest - 'manifestSha256'
    )
  ) THEN RAISE EXCEPTION 'completed assessment digest is not reproducible'; END IF;
END
$assessment_digest$;

-- Versioned, digest-bound outcome definition mirrors the package manifest.
INSERT INTO capital_verification_payloads(payload_key, payload)
SELECT 'outcome', pg_temp.with_manifest_digest(jsonb_build_object(
  'schemaVersion',1,
  'outcomeDefinitionId','64af47ac-19fc-7c92-ae91-0242ac120090',
  'version','1.0.0','purpose','research_validation_only',
  'assetClass','equities','metricKey','real_total_return',
  'description','Verification real total return outcome for research validation.',
  'countryScope',jsonb_build_array('CA','CB'),
  'strategyScope',jsonb_build_array('balanced_research'),
  'horizonDays',365,
  'observationWindow',jsonb_build_object('startOffsetDays',1,'endOffsetDays',365),
  'direction','higher_is_better',
  'calculationMethod','Compute the first-release real total return over the fixed horizon.',
  'sourceSeriesKeys',jsonb_build_array('equity.price_index','price.consumer_index'),
  'availabilityLagDays',30,'revisionPolicy','first_release',
  'missingDataPolicy','exclude_with_reason'
));

SET LOCAL ROLE economyos_app_local;
SELECT evidence.create_capital_outcome_definition(
  '64af47ac-19fc-7c92-ae91-0242ac120003',
  (SELECT payload FROM capital_verification_payloads WHERE payload_key = 'outcome')
);
SELECT evidence.create_capital_outcome_definition(
  '64af47ac-19fc-7c92-ae91-0242ac120003',
  (SELECT payload FROM capital_verification_payloads WHERE payload_key = 'outcome')
);
DO $outcome_tamper$
BEGIN
  BEGIN
    PERFORM evidence.create_capital_outcome_definition(
      '64af47ac-19fc-7c92-ae91-0242ac120003',
      jsonb_set(
        (SELECT payload FROM capital_verification_payloads WHERE payload_key = 'outcome'),
        '{manifestSha256}', to_jsonb(repeat('f',64))
      )
    );
    RAISE EXCEPTION 'tampered outcome digest was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
END
$outcome_tamper$;
RESET ROLE;
UPDATE capital_verification_clock clock
SET outcome_sha256 = outcome.manifest_sha256
FROM evidence.capital_outcome_definitions outcome
WHERE outcome.id = '64af47ac-19fc-7c92-ae91-0242ac120090';

-- Two strictly chronological expanding-window folds persist package leakage sentinels.
INSERT INTO capital_verification_payloads(payload_key, payload)
SELECT 'validation', pg_temp.with_manifest_digest(jsonb_build_object(
  'schemaVersion',1,
  'validationPlanId','64af47ac-19fc-7c92-ae91-0242ac120091',
  'purpose','chronological_research_validation','mode','expanding_window',
  'model',jsonb_build_object(
    'modelId','64af47ac-19fc-7c92-ae91-0242ac120020',
    'version','1.0.0',
    'artifactSha256',(SELECT artifact_sha256
      FROM evidence.economic_state_model_artifacts
      WHERE id = '64af47ac-19fc-7c92-ae91-0242ac120020'),
    'status','candidate'
  ),
  'outcomeDefinitionId','64af47ac-19fc-7c92-ae91-0242ac120090',
  'outcomeDefinitionSha256',(SELECT outcome_sha256 FROM capital_verification_clock),
  'folds',jsonb_build_array(
    jsonb_build_object(
      'foldId','fold-1',
      'training',jsonb_build_object(
        'start','2026-10-02T00:00:00Z','end','2026-11-01T00:00:00Z'
      ),
      'calibration',jsonb_build_object(
        'start','2026-11-03T00:00:00Z','end','2026-12-01T00:00:00Z'
      ),
      'test',jsonb_build_object(
        'start','2026-12-03T00:00:00Z','end','2027-01-01T00:00:00Z'
      ),
      'embargoDays',1,
      'sentinels',jsonb_build_object(
        'outcomeDefinitionLockedAt','2026-10-01T00:00:00Z',
        'featureEngineeringFitThrough','2026-11-01T00:00:00Z',
        'normalizationFitThrough','2026-11-01T00:00:00Z',
        'hyperparameterSelectionFitThrough','2026-11-01T00:00:00Z',
        'valuationModelFitThrough','2026-11-01T00:00:00Z',
        'latestTrainingLabelAvailableAt','2026-11-01T00:00:00Z',
        'calibrationFitThrough','2026-12-01T00:00:00Z',
        'thresholdSelectionFitThrough','2026-12-01T00:00:00Z'
      )
    ),
    jsonb_build_object(
      'foldId','fold-2',
      'training',jsonb_build_object(
        'start','2026-10-02T00:00:00Z','end','2027-02-01T00:00:00Z'
      ),
      'calibration',jsonb_build_object(
        'start','2027-02-03T00:00:00Z','end','2027-03-01T00:00:00Z'
      ),
      'test',jsonb_build_object(
        'start','2027-03-03T00:00:00Z','end','2027-04-01T00:00:00Z'
      ),
      'embargoDays',1,
      'sentinels',jsonb_build_object(
        'outcomeDefinitionLockedAt','2026-10-01T00:00:00Z',
        'featureEngineeringFitThrough','2027-02-01T00:00:00Z',
        'normalizationFitThrough','2027-02-01T00:00:00Z',
        'hyperparameterSelectionFitThrough','2027-02-01T00:00:00Z',
        'valuationModelFitThrough','2027-02-01T00:00:00Z',
        'latestTrainingLabelAvailableAt','2027-02-01T00:00:00Z',
        'calibrationFitThrough','2027-03-01T00:00:00Z',
        'thresholdSelectionFitThrough','2027-03-01T00:00:00Z'
      )
    )
  )
));

SET LOCAL ROLE economyos_ingest_local;
SELECT evidence.create_capital_validation_plan(
  '64af47ac-19fc-7c92-ae91-0242ac120003',
  (SELECT payload FROM capital_verification_payloads WHERE payload_key = 'validation')
);
SELECT evidence.create_capital_validation_plan(
  '64af47ac-19fc-7c92-ae91-0242ac120003',
  (SELECT payload FROM capital_verification_payloads WHERE payload_key = 'validation')
);
DO $validation_leakage$
DECLARE
  malformed_body jsonb;
BEGIN
  malformed_body := jsonb_set(
    (SELECT payload - 'manifestSha256' FROM capital_verification_payloads
      WHERE payload_key = 'validation'),
    '{folds,0,sentinels,featureEngineeringFitThrough}',
    '"2026-12-04T00:00:00Z"'::jsonb
  );
  BEGIN
    PERFORM evidence.create_capital_validation_plan(
      '64af47ac-19fc-7c92-ae91-0242ac120003',
      pg_temp.with_manifest_digest(malformed_body)
    );
    RAISE EXCEPTION 'post-test feature fitting leakage was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
END
$validation_leakage$;
RESET ROLE;

DO $fold_assertions$
BEGIN
  IF (SELECT count(*) FROM evidence.capital_validation_folds
      WHERE validation_plan_id = '64af47ac-19fc-7c92-ae91-0242ac120091') <> 2
    OR EXISTS (
      SELECT 1
      FROM evidence.capital_validation_folds earlier
      JOIN evidence.capital_validation_folds later
        ON later.validation_plan_id = earlier.validation_plan_id
        AND later.fold_ordinal = earlier.fold_ordinal + 1
      WHERE earlier.validation_plan_id = '64af47ac-19fc-7c92-ae91-0242ac120091'
        AND (earlier.test_end >= later.test_start
          OR earlier.training_end >= later.training_end)
    )
  THEN RAISE EXCEPTION 'chronological folds were not normalized correctly'; END IF;
END
$fold_assertions$;

-- Country comparison order is the caller's order; results are reconstructed
-- from governed assessment pointers and never carry rank or winner fields.
INSERT INTO capital_verification_payloads(payload_key, payload)
SELECT 'comparison', pg_temp.with_manifest_digest(jsonb_build_object(
  'schemaVersion',1,
  'comparisonId','64af47ac-19fc-7c92-ae91-0242ac120092',
  'semantics',jsonb_build_object(
    'purpose','research_only','decisionUse','prohibited',
    'adviceStatus','not_investment_advice',
    'disclaimer','Research only; not investment advice.'
  ),
  'assetClass','equities','strategyKey','balanced_research',
  'referenceCountryId','64af47ac-19fc-7c92-ae91-0242ac120007',
  'requestedCountries',jsonb_build_array(
    jsonb_build_object(
      'countryId','64af47ac-19fc-7c92-ae91-0242ac120007','countryCode','CA'
    ),
    jsonb_build_object(
      'countryId','64af47ac-19fc-7c92-ae91-0242ac120008','countryCode','CB'
    )
  ),
  'compatibilityPolicy',jsonb_build_object(
    'modelIdentity','exact_model_version_and_artifact',
    'pointInTime','same_as_of_and_policy',
    'valuation','required_for_combined_comparison'
  ),
  'sourceManifestDigests',jsonb_build_array(
    jsonb_build_object(
      'countryId','64af47ac-19fc-7c92-ae91-0242ac120007',
      'manifestSha256',(SELECT assessment_a_sha256 FROM capital_verification_clock)
    ),
    jsonb_build_object(
      'countryId','64af47ac-19fc-7c92-ae91-0242ac120008',
      'manifestSha256',(SELECT assessment_b_sha256 FROM capital_verification_clock)
    )
  ),
  'results',jsonb_build_array(
    jsonb_build_object(
      'country',jsonb_build_object(
        'countryId','64af47ac-19fc-7c92-ae91-0242ac120007','countryCode','CA'
      ),
      'status','comparable',
      'sourceManifestSha256',(SELECT assessment_a_sha256 FROM capital_verification_clock),
      'macroSuitability','0.4','valuationSuitability','0.2',
      'combinedSuitability','0.32'
    ),
    jsonb_build_object(
      'country',jsonb_build_object(
        'countryId','64af47ac-19fc-7c92-ae91-0242ac120008','countryCode','CB'
      ),
      'status','incomparable',
      'sourceManifestSha256',(SELECT assessment_b_sha256 FROM capital_verification_clock),
      'reasons',jsonb_build_array(jsonb_build_object(
        'code','valuation_unavailable',
        'detail','Valuation is unavailable; no combined comparison is permitted.'
      ))
    )
  )
));

SET LOCAL ROLE economyos_app_local;
SELECT evidence.create_capital_country_comparison(
  '64af47ac-19fc-7c92-ae91-0242ac120003',
  (SELECT payload FROM capital_verification_payloads WHERE payload_key = 'comparison')
);
SELECT evidence.create_capital_country_comparison(
  '64af47ac-19fc-7c92-ae91-0242ac120003',
  (SELECT payload FROM capital_verification_payloads WHERE payload_key = 'comparison')
);
DO $comparison_read_and_tamper$
DECLARE
  comparison_record record;
  malformed_body jsonb;
BEGIN
  SELECT * INTO comparison_record FROM app.get_capital_country_comparison(
    '64af47ac-19fc-7c92-ae91-0242ac120003',
    '64af47ac-19fc-7c92-ae91-0242ac120092'
  );
  IF comparison_record.comparison_id IS NULL
    OR comparison_record.comparison_manifest#>>'{requestedCountries,0,countryCode}' <> 'CA'
    OR comparison_record.comparison_manifest#>>'{requestedCountries,1,countryCode}' <> 'CB'
    OR comparison_record.comparison_manifest#>>'{results,0,status}' <> 'comparable'
    OR comparison_record.comparison_manifest#>>'{results,1,status}' <> 'incomparable'
    OR comparison_record.comparison_manifest::text ~* '"(rank|winner|allocation)"'
  THEN RAISE EXCEPTION 'comparison read lost order, incomparability, or no-rank semantics'; END IF;
  malformed_body := jsonb_set(
    (SELECT payload - 'manifestSha256' FROM capital_verification_payloads
      WHERE payload_key = 'comparison'),
    '{results,0,combinedSuitability}', '"0.99"'::jsonb
  );
  BEGIN
    PERFORM evidence.create_capital_country_comparison(
      '64af47ac-19fc-7c92-ae91-0242ac120003',
      pg_temp.with_manifest_digest(malformed_body)
    );
    RAISE EXCEPTION 'comparison accepted a forged governed score';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
END
$comparison_read_and_tamper$;
RESET ROLE;

DO $normalized_comparison$
BEGIN
  IF (SELECT array_agg(country_code ORDER BY request_ordinal)
      FROM evidence.capital_country_comparison_items
      WHERE comparison_id = '64af47ac-19fc-7c92-ae91-0242ac120092')
      IS DISTINCT FROM ARRAY['CA','CB']::text[]
    OR EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'evidence'
        AND table_name IN ('capital_country_comparisons','capital_country_comparison_items')
        AND column_name IN ('rank','winner','allocation','recommended_weight')
    )
  THEN RAISE EXCEPTION 'normalized comparison introduced ordering or ranking drift'; END IF;
END
$normalized_comparison$;

-- Foreign tenants and workspaces are non-enumerating at every app read boundary.
SET LOCAL app.organization_id = '64af47ac-19fc-7c92-ae91-0242ac120002';
SET LOCAL app.subject_id = '64af47ac-19fc-7c92-ae91-0242ac120006';
SET LOCAL ROLE economyos_app_local;
DO $foreign_reads$
BEGIN
  IF EXISTS (
    SELECT 1 FROM app.get_capital_research_assessment(
      '64af47ac-19fc-7c92-ae91-0242ac120003',
      '64af47ac-19fc-7c92-ae91-0242ac120040'
    )
  ) OR EXISTS (
    SELECT 1 FROM app.get_capital_country_comparison(
      '64af47ac-19fc-7c92-ae91-0242ac120003',
      '64af47ac-19fc-7c92-ae91-0242ac120092'
    )
  ) THEN RAISE EXCEPTION 'foreign tenant enumerated capital research'; END IF;
END
$foreign_reads$;
RESET ROLE;
SET LOCAL ROLE economyos_ingest_local;
DO $foreign_mutation$
BEGIN
  BEGIN
    PERFORM evidence.prepare_capital_research_assessment(
      '64af47ac-19fc-7c92-ae91-0242ac120044',
      '64af47ac-19fc-7c92-ae91-0242ac120003',
      '64af47ac-19fc-7c92-ae91-0242ac120007', 'CA', 'balanced_research',
      '2030-01-01T00:00:00Z', '2029-12-31T00:00:00Z',
      (SELECT system_cutoff FROM capital_verification_clock),
      '64af47ac-19fc-7c92-ae91-0242ac120010',
      '64af47ac-19fc-7c92-ae91-0242ac120010',
      '64af47ac-19fc-7c92-ae91-0242ac120020', 'candidate',
      ARRAY['CA','CB'], ARRAY['balanced_research'],
      '["Foreign tenant assumption."]'::jsonb,
      '["Foreign tenant limitation."]'::jsonb
    );
    RAISE EXCEPTION 'foreign tenant mutated capital research';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END
$foreign_mutation$;
RESET ROLE;

-- Every durable Phase 6 table is forced-RLS and append-only at runtime.
SET LOCAL app.organization_id = '64af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '64af47ac-19fc-7c92-ae91-0242ac120005';
DO $rls_acl_and_immutability$
DECLARE
  relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'capital_research_assessments','capital_assessment_evidence_bindings',
    'capital_assessment_assets','capital_assessment_completions',
    'capital_outcome_definitions','capital_validation_plans','capital_validation_folds',
    'capital_country_comparisons','capital_country_comparison_items'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'evidence' AND relation.relname = relation_name
        AND relation.relrowsecurity AND relation.relforcerowsecurity
    ) THEN RAISE EXCEPTION '% is not forced-RLS', relation_name; END IF;
    IF has_table_privilege('economyos_app', 'evidence.' || relation_name,
        'SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege('economyos_ingest', 'evidence.' || relation_name,
        'SELECT,INSERT,UPDATE,DELETE')
    THEN RAISE EXCEPTION '% has a direct runtime table grant', relation_name; END IF;
    BEGIN
      EXECUTE format(
        'UPDATE evidence.%I SET organization_id = organization_id WHERE true', relation_name
      );
      RAISE EXCEPTION '% allowed update', relation_name;
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
    BEGIN
      EXECUTE format('DELETE FROM evidence.%I WHERE true', relation_name);
      RAISE EXCEPTION '% allowed delete', relation_name;
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  END LOOP;
  IF has_function_privilege(
      'economyos_app',
      'evidence.prepare_capital_research_assessment(uuid,uuid,uuid,text,text,timestamptz,timestamptz,timestamptz,uuid,uuid,uuid,text,text[],text[],jsonb,jsonb)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_ingest','app.get_capital_research_assessment(uuid,uuid)','EXECUTE'
    )
    OR has_function_privilege(
      'economyos_app','evidence.capital_json_digest(jsonb)','EXECUTE'
    )
    OR NOT has_function_privilege(
      'economyos_app','app.get_capital_research_assessment(uuid,uuid)','EXECUTE'
    )
    OR NOT has_function_privilege(
      'economyos_app','app.get_capital_country_comparison(uuid,uuid)','EXECUTE'
    )
    OR NOT has_function_privilege(
      'economyos_ingest',
      'evidence.prepare_capital_research_assessment(uuid,uuid,uuid,text,text,timestamptz,timestamptz,timestamptz,uuid,uuid,uuid,text,text[],text[],jsonb,jsonb)',
      'EXECUTE'
    )
  THEN RAISE EXCEPTION 'capital runtime ACL boundary is incorrect'; END IF;
END
$rls_acl_and_immutability$;

-- A current emergency restriction immediately closes both serving boundaries
-- without rewriting any historical assessment or comparison evidence.
SET LOCAL ROLE economyos_app_local;
SELECT (evidence.record_economic_state_model_lifecycle_event(
  '64af47ac-19fc-7c92-ae91-0242ac120020', 'restricted', true,
  'Emergency verification restriction closes capital research serving.',
  repeat('d',64), statement_timestamp()
)).id;
DO $restricted_reads$
BEGIN
  IF EXISTS (
    SELECT 1 FROM app.get_capital_research_assessment(
      '64af47ac-19fc-7c92-ae91-0242ac120003',
      '64af47ac-19fc-7c92-ae91-0242ac120040'
    )
  ) OR EXISTS (
    SELECT 1 FROM app.get_capital_country_comparison(
      '64af47ac-19fc-7c92-ae91-0242ac120003',
      '64af47ac-19fc-7c92-ae91-0242ac120092'
    )
  ) THEN RAISE EXCEPTION 'restricted model remained capital-servable'; END IF;
END
$restricted_reads$;
RESET ROLE;

ROLLBACK;
