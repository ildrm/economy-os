-- Verify the Phase 5 PostgreSQL relationship-claim authority, including
-- causal humility, temporal resolution, feedback-vs-lineage cycles, durable
-- projection evidence, replay, immutability, and two-tenant least privilege.
BEGIN;

INSERT INTO app.organizations (id, slug, name) VALUES
  ('41af47ac-19fc-7c92-ae91-0242ac120001', 'graph-a', 'Graph Tenant A'),
  ('41af47ac-19fc-7c92-ae91-0242ac120002', 'graph-b', 'Graph Tenant B');
INSERT INTO app.workspaces (id, organization_id, slug, name) VALUES
  (
    '41af47ac-19fc-7c92-ae91-0242ac120003',
    '41af47ac-19fc-7c92-ae91-0242ac120001', 'research', 'Graph Research A'
  ),
  (
    '41af47ac-19fc-7c92-ae91-0242ac120004',
    '41af47ac-19fc-7c92-ae91-0242ac120002', 'research', 'Graph Research B'
  );
INSERT INTO app.subjects (id, issuer, external_subject, kind) VALUES
  (
    '41af47ac-19fc-7c92-ae91-0242ac120005',
    'https://identity.economyos.test/', 'graph-owner', 'human'
  ),
  (
    '41af47ac-19fc-7c92-ae91-0242ac120006',
    'https://identity.economyos.test/', 'graph-validator', 'human'
  ),
  (
    '41af47ac-19fc-7c92-ae91-0242ac120007',
    'https://identity.economyos.test/', 'graph-approver', 'human'
  ),
  (
    '41af47ac-19fc-7c92-ae91-0242ac120008',
    'https://identity.economyos.test/', 'graph-foreign', 'human'
  );
INSERT INTO app.organization_memberships (
  organization_id, subject_id, role, valid_from
) VALUES
  (
    '41af47ac-19fc-7c92-ae91-0242ac120001',
    '41af47ac-19fc-7c92-ae91-0242ac120005', 'admin', '2026-01-01T00:00:00Z'
  ),
  (
    '41af47ac-19fc-7c92-ae91-0242ac120001',
    '41af47ac-19fc-7c92-ae91-0242ac120006', 'validator', '2026-01-01T00:00:00Z'
  ),
  (
    '41af47ac-19fc-7c92-ae91-0242ac120001',
    '41af47ac-19fc-7c92-ae91-0242ac120007', 'steward', '2026-01-01T00:00:00Z'
  ),
  (
    '41af47ac-19fc-7c92-ae91-0242ac120002',
    '41af47ac-19fc-7c92-ae91-0242ac120008', 'analyst', '2026-01-01T00:00:00Z'
  );
INSERT INTO app.workspace_memberships (
  organization_id, workspace_id, subject_id, role, valid_from
) VALUES
  (
    '41af47ac-19fc-7c92-ae91-0242ac120001',
    '41af47ac-19fc-7c92-ae91-0242ac120003',
    '41af47ac-19fc-7c92-ae91-0242ac120005', 'admin', '2026-01-01T00:00:00Z'
  ),
  (
    '41af47ac-19fc-7c92-ae91-0242ac120001',
    '41af47ac-19fc-7c92-ae91-0242ac120003',
    '41af47ac-19fc-7c92-ae91-0242ac120006', 'validator', '2026-01-01T00:00:00Z'
  ),
  (
    '41af47ac-19fc-7c92-ae91-0242ac120001',
    '41af47ac-19fc-7c92-ae91-0242ac120003',
    '41af47ac-19fc-7c92-ae91-0242ac120007', 'steward', '2026-01-01T00:00:00Z'
  ),
  (
    '41af47ac-19fc-7c92-ae91-0242ac120002',
    '41af47ac-19fc-7c92-ae91-0242ac120004',
    '41af47ac-19fc-7c92-ae91-0242ac120008', 'analyst', '2026-01-01T00:00:00Z'
  );

INSERT INTO evidence.concepts (
  id, canonical_key, name, definition, measurement_class, ontology_version
) VALUES (
  '41af47ac-19fc-7c92-ae91-0242ac120009',
  'economy.graph.inflation', 'Graph inflation concept',
  'Verification-only inflation relationship endpoint.', 'direct', 'verification-1'
);

CREATE TEMP TABLE relationship_graph_verification_context (
  initial_system_at timestamptz,
  review_effective_at timestamptz,
  review_system_at timestamptz,
  approval_effective_at timestamptz,
  approval_system_at timestamptz,
  projection_event_id uuid
) ON COMMIT DROP;
INSERT INTO relationship_graph_verification_context DEFAULT VALUES;
GRANT SELECT, UPDATE ON relationship_graph_verification_context
  TO economyos_app_local, economyos_ingest_local;

DO $verify_relationship_graph_privileges$
BEGIN
  IF has_table_privilege(
      'economyos_app_local', 'evidence.relationship_claims', 'SELECT'
    )
    OR has_table_privilege(
      'economyos_ingest_local',
      'evidence.relationship_graph_projection_outbox', 'SELECT'
    )
    OR NOT has_function_privilege(
      'economyos_app_local',
      'evidence.create_relationship_endpoint(uuid,uuid,text,text,text,text,uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_ingest_local',
      'evidence.create_relationship_endpoint(uuid,uuid,text,text,text,text,uuid)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'economyos_ingest_local',
      'evidence.list_relationship_graph_projection_events(uuid,bigint,integer)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_app_local',
      'evidence.list_relationship_graph_projection_events(uuid,bigint,integer)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'economyos_app_local',
      'evidence.relationship_workspace_role_internal(uuid,uuid,uuid)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'relationship graph least-privilege boundary is incorrect';
  END IF;
END
$verify_relationship_graph_privileges$;

SET LOCAL ROLE economyos_app_local;
SET LOCAL app.organization_id = '41af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '41af47ac-19fc-7c92-ae91-0242ac120005';

SELECT evidence.create_relationship_endpoint(
  '41af47ac-19fc-7c92-ae91-0242ac120010',
  '41af47ac-19fc-7c92-ae91-0242ac120003',
  'central_bank', 'central_bank.verification', 'Verification Central Bank',
  'workspace_native', NULL
);
SELECT evidence.create_relationship_endpoint(
  '41af47ac-19fc-7c92-ae91-0242ac120011',
  '41af47ac-19fc-7c92-ae91-0242ac120003',
  'economic_concept', 'economic_concept.inflation', 'Verification Inflation',
  'concept', '41af47ac-19fc-7c92-ae91-0242ac120009'
);

DO $verify_endpoint_replay_and_typed_reference$
DECLARE
  first_id uuid;
  replayed_id uuid;
BEGIN
  first_id := evidence.create_relationship_endpoint(
    '41af47ac-19fc-7c92-ae91-0242ac120010',
    '41af47ac-19fc-7c92-ae91-0242ac120003',
    'central_bank', 'central_bank.verification', 'Verification Central Bank',
    'workspace_native', NULL
  );
  replayed_id := evidence.create_relationship_endpoint(
    '41af47ac-19fc-7c92-ae91-0242ac120010',
    '41af47ac-19fc-7c92-ae91-0242ac120003',
    'central_bank', 'central_bank.verification', 'Verification Central Bank',
    'workspace_native', NULL
  );
  IF first_id <> replayed_id THEN
    RAISE EXCEPTION 'relationship endpoint replay changed identity';
  END IF;
  BEGIN
    PERFORM evidence.create_relationship_endpoint(
      '41af47ac-19fc-7c92-ae91-0242ac120012',
      '41af47ac-19fc-7c92-ae91-0242ac120003',
      'central_bank', 'central_bank.invalid-reference', 'Invalid Reference',
      'concept', '41af47ac-19fc-7c92-ae91-0242ac120009'
    );
    RAISE EXCEPTION 'endpoint accepted a concept with the wrong endpoint type';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END
$verify_endpoint_replay_and_typed_reference$;

SELECT evidence.create_relationship_claim(
  '41af47ac-19fc-7c92-ae91-0242ac120020',
  '41af47ac-19fc-7c92-ae91-0242ac120003',
  '41af47ac-19fc-7c92-ae91-0242ac120010',
  '41af47ac-19fc-7c92-ae91-0242ac120011',
  'correlated_with', 'association', 'observed_association', 'causal_discovery',
  NULL, NULL,
  '{"name":"pc_algorithm","version":"verification-1"}',
  '{"population":"verification economies","horizon":"monthly"}',
  '[]',
  '{"type":"bootstrap","description":"Verification association uncertainty."}',
  0.60, 'positive', 0.40, 0, 2592000,
  '{"values":["all"]}',
  '{"scope":"verification-only"}',
  '2026-01-01T00:00:00Z', NULL, '2026-01-10T00:00:00Z'
);

DO $verify_association_replay_and_no_silent_conversion$
DECLARE
  replayed uuid;
BEGIN
  replayed := evidence.create_relationship_claim(
    '41af47ac-19fc-7c92-ae91-0242ac120020',
    '41af47ac-19fc-7c92-ae91-0242ac120003',
    '41af47ac-19fc-7c92-ae91-0242ac120010',
    '41af47ac-19fc-7c92-ae91-0242ac120011',
    'correlated_with', 'association', 'observed_association', 'causal_discovery',
    NULL, NULL,
    '{"name":"pc_algorithm","version":"verification-1"}',
    '{"population":"verification economies","horizon":"monthly"}',
    '[]',
    '{"type":"bootstrap","description":"Verification association uncertainty."}',
    0.60, 'positive', 0.40, 0, 2592000,
    '{"values":["all"]}', '{"scope":"verification-only"}',
    '2026-01-01T00:00:00Z', NULL, '2026-01-10T00:00:00Z'
  );
  IF replayed <> '41af47ac-19fc-7c92-ae91-0242ac120020'::uuid THEN
    RAISE EXCEPTION 'relationship claim replay changed identity';
  END IF;
  BEGIN
    PERFORM evidence.create_relationship_claim(
      '41af47ac-19fc-7c92-ae91-0242ac120021',
      '41af47ac-19fc-7c92-ae91-0242ac120003',
      '41af47ac-19fc-7c92-ae91-0242ac120010',
      '41af47ac-19fc-7c92-ae91-0242ac120011',
      'causes', 'causal', 'econometrically_estimated_causal_relationship',
      'causal_discovery', '41af47ac-19fc-7c92-ae91-0242ac120020', NULL,
      '{"name":"pc_algorithm","identificationStrategy":"causal_discovery"}',
      '{"population":"verification economies"}',
      '["No unmeasured confounding."]',
      '{"type":"bootstrap","description":"Invalid causal uncertainty."}',
      0.60, 'positive', 0.40, 0, 2592000,
      '{"values":["all"]}', '{"scope":"verification-only"}',
      '2026-01-01T00:00:00Z', NULL, '2026-01-10T00:00:00Z'
    );
    RAISE EXCEPTION 'causal discovery was promoted directly into a causal claim';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    PERFORM evidence.create_relationship_claim(
      '41af47ac-19fc-7c92-ae91-0242ac120022',
      '41af47ac-19fc-7c92-ae91-0242ac120003',
      '41af47ac-19fc-7c92-ae91-0242ac120010',
      '41af47ac-19fc-7c92-ae91-0242ac120011',
      'causes', 'causal', 'econometrically_estimated_causal_relationship',
      'econometric_identification', NULL,
      '41af47ac-19fc-7c92-ae91-0242ac120020',
      '{"name":"difference_in_differences","identificationStrategy":"difference_in_differences"}',
      '{"population":"verification economies"}',
      '["Parallel trends."]',
      '{"type":"robustness","description":"Invalid amendment uncertainty."}',
      0.70, 'positive', 0.50, 0, 2592000,
      '{"values":["all"]}', '{"scope":"verification-only"}',
      '2026-01-01T00:00:00Z', NULL, '2026-01-10T00:00:00Z'
    );
    RAISE EXCEPTION 'association lineage was silently amended into a causal claim';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    PERFORM evidence.create_relationship_claim(
      '41af47ac-19fc-7c92-ae91-0242ac120023',
      '41af47ac-19fc-7c92-ae91-0242ac120003',
      '41af47ac-19fc-7c92-ae91-0242ac120010',
      '41af47ac-19fc-7c92-ae91-0242ac120011',
      'correlated_with', 'association', 'observed_association', 'manual_review',
      NULL, '41af47ac-19fc-7c92-ae91-0242ac120023',
      '{"name":"manual_review"}', '{"population":"verification economies"}',
      '[]', '{"type":"qualitative","description":"Self-cycle probe."}',
      0.50, 'unknown', NULL, NULL, NULL, '{}', '{}',
      '2026-01-01T00:00:00Z', NULL, '2026-01-10T00:00:00Z'
    );
    RAISE EXCEPTION 'claim lineage accepted a self-cycle';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END
$verify_association_replay_and_no_silent_conversion$;

SET LOCAL app.subject_id = '41af47ac-19fc-7c92-ae91-0242ac120006';
DO $verify_no_direct_discovered_to_reviewed$
BEGIN
  BEGIN
    PERFORM evidence.record_relationship_claim_decision(
      '41af47ac-19fc-7c92-ae91-0242ac120025',
      '41af47ac-19fc-7c92-ae91-0242ac120020', 'reviewed',
      'Verification must reject direct association promotion.', clock_timestamp()
    );
    RAISE EXCEPTION 'discovered association moved directly to reviewed';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END
$verify_no_direct_discovered_to_reviewed$;

SET LOCAL app.subject_id = '41af47ac-19fc-7c92-ae91-0242ac120005';
DO $verify_association_proposal_replay$
DECLARE
  decision_time timestamptz := clock_timestamp();
  first_id uuid;
  replayed_id uuid;
BEGIN
  first_id := evidence.record_relationship_claim_decision(
    '41af47ac-19fc-7c92-ae91-0242ac120024',
    '41af47ac-19fc-7c92-ae91-0242ac120020', 'proposed',
    'Association remains explicitly typed while entering review.', decision_time
  );
  replayed_id := evidence.record_relationship_claim_decision(
    '41af47ac-19fc-7c92-ae91-0242ac120024',
    '41af47ac-19fc-7c92-ae91-0242ac120020', 'proposed',
    'Association remains explicitly typed while entering review.', decision_time
  );
  IF first_id <> replayed_id THEN
    RAISE EXCEPTION 'relationship decision replay changed identity';
  END IF;
  BEGIN
    PERFORM evidence.record_relationship_claim_decision(
      '41af47ac-19fc-7c92-ae91-0242ac120024',
      '41af47ac-19fc-7c92-ae91-0242ac120020', 'proposed',
      'A changed replay reason must remain a permanent conflict.', decision_time
    );
    RAISE EXCEPTION 'relationship decision replay accepted changed evidence';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END
$verify_association_proposal_replay$;

SELECT evidence.create_relationship_claim(
  '41af47ac-19fc-7c92-ae91-0242ac120030',
  '41af47ac-19fc-7c92-ae91-0242ac120003',
  '41af47ac-19fc-7c92-ae91-0242ac120010',
  '41af47ac-19fc-7c92-ae91-0242ac120011',
  'causes', 'causal', 'econometrically_estimated_causal_relationship',
  'econometric_identification',
  '41af47ac-19fc-7c92-ae91-0242ac120020', NULL,
  '{"name":"difference_in_differences","identificationStrategy":"difference_in_differences","estimand":"average_treatment_effect","version":"verification-1"}',
  '{"population":"verification economies","horizon":"monthly","treatment":"policy tightening"}',
  '["Parallel trends before treatment.","No material interference."]',
  '{"type":"sensitivity_analysis","description":"Placebo and pre-trend uncertainty retained separately."}',
  0.78, 'positive', 0.55, 86400, 2592000,
  '{"values":["normal","high_inflation"]}',
  '{"scope":"verification-only","geographies":["A"]}',
  '2026-01-01T00:00:00Z', NULL, '2026-01-10T00:00:00Z'
);

SET LOCAL app.subject_id = '41af47ac-19fc-7c92-ae91-0242ac120006';
DO $verify_causal_review_requires_evidence$
BEGIN
  BEGIN
    PERFORM evidence.record_relationship_claim_decision(
      '41af47ac-19fc-7c92-ae91-0242ac120035',
      '41af47ac-19fc-7c92-ae91-0242ac120030', 'reviewed',
      'Evidence-free causal review must fail closed.', clock_timestamp()
    );
    RAISE EXCEPTION 'causal claim reviewed without identification evidence';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END
$verify_causal_review_requires_evidence$;

SET LOCAL app.subject_id = '41af47ac-19fc-7c92-ae91-0242ac120005';
SELECT evidence.create_relationship_evidence(
  '41af47ac-19fc-7c92-ae91-0242ac120031',
  '41af47ac-19fc-7c92-ae91-0242ac120003',
  'validation_report', 'https://example.invalid/graph/validation-report',
  repeat('a', 64),
  '{"artifact":"verification-report","section":"identification-and-placebos"}',
  '2026-02-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL
);
SELECT evidence.link_relationship_evidence(
  '41af47ac-19fc-7c92-ae91-0242ac120032',
  '41af47ac-19fc-7c92-ae91-0242ac120030',
  '41af47ac-19fc-7c92-ae91-0242ac120031', 'validates',
  'Independent validation report binds identification and placebo evidence.',
  clock_timestamp()
);

DO $verify_owner_cannot_self_review$
BEGIN
  BEGIN
    PERFORM evidence.record_relationship_claim_decision(
      '41af47ac-19fc-7c92-ae91-0242ac120036',
      '41af47ac-19fc-7c92-ae91-0242ac120030', 'reviewed',
      'Claim owner must not self-review causal evidence.', clock_timestamp()
    );
    RAISE EXCEPTION 'causal claim owner self-reviewed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_owner_cannot_self_review$;

SET LOCAL app.subject_id = '41af47ac-19fc-7c92-ae91-0242ac120006';
DO $verify_independent_causal_review_replay$
DECLARE
  decision_time timestamptz := clock_timestamp();
  first_id uuid;
  replayed_id uuid;
BEGIN
  first_id := evidence.record_relationship_claim_decision(
    '41af47ac-19fc-7c92-ae91-0242ac120033',
    '41af47ac-19fc-7c92-ae91-0242ac120030', 'reviewed',
    'Validator reproduced identification checks and reviewed limitations.',
    decision_time
  );
  replayed_id := evidence.record_relationship_claim_decision(
    '41af47ac-19fc-7c92-ae91-0242ac120033',
    '41af47ac-19fc-7c92-ae91-0242ac120030', 'reviewed',
    'Validator reproduced identification checks and reviewed limitations.',
    decision_time
  );
  IF first_id <> replayed_id THEN
    RAISE EXCEPTION 'causal review replay changed identity';
  END IF;
END
$verify_independent_causal_review_replay$;

SET LOCAL app.subject_id = '41af47ac-19fc-7c92-ae91-0242ac120007';
DO $verify_independent_causal_approval_replay$
DECLARE
  decision_time timestamptz := clock_timestamp();
  first_id uuid;
  replayed_id uuid;
BEGIN
  first_id := evidence.record_relationship_claim_decision(
    '41af47ac-19fc-7c92-ae91-0242ac120034',
    '41af47ac-19fc-7c92-ae91-0242ac120030', 'approved',
    'Steward approved the reviewed causal scope and explicit limitations.',
    decision_time
  );
  replayed_id := evidence.record_relationship_claim_decision(
    '41af47ac-19fc-7c92-ae91-0242ac120034',
    '41af47ac-19fc-7c92-ae91-0242ac120030', 'approved',
    'Steward approved the reviewed causal scope and explicit limitations.',
    decision_time
  );
  IF first_id <> replayed_id THEN
    RAISE EXCEPTION 'causal approval replay changed identity';
  END IF;
END
$verify_independent_causal_approval_replay$;

SET LOCAL app.subject_id = '41af47ac-19fc-7c92-ae91-0242ac120005';
SELECT evidence.create_relationship_claim(
  '41af47ac-19fc-7c92-ae91-0242ac120040',
  '41af47ac-19fc-7c92-ae91-0242ac120003',
  '41af47ac-19fc-7c92-ae91-0242ac120011',
  '41af47ac-19fc-7c92-ae91-0242ac120010',
  'contributes_to', 'causal', 'structurally_assumed_relationship',
  'structural_model', '41af47ac-19fc-7c92-ae91-0242ac120020', NULL,
  '{"name":"policy_feedback_model","identificationStrategy":"structural_assumption","version":"verification-1"}',
  '{"population":"verification economies","horizon":"monthly","mechanism":"policy feedback"}',
  '["Policy reaction function is stable within the declared regime."]',
  '{"type":"structural_assumption","description":"Feedback strength is explicitly uncertain."}',
  0.65, 'positive', 0.45, 86400, 5184000,
  '{"values":["normal","high_inflation"]}',
  '{"scope":"verification-only","geographies":["A"]}',
  '2026-01-01T00:00:00Z', NULL, '2026-01-10T00:00:00Z'
);
SELECT evidence.link_relationship_evidence(
  '41af47ac-19fc-7c92-ae91-0242ac120042',
  '41af47ac-19fc-7c92-ae91-0242ac120040',
  '41af47ac-19fc-7c92-ae91-0242ac120031', 'validates',
  'The validation report also documents the reciprocal structural feedback assumption.',
  clock_timestamp()
);

SET LOCAL app.subject_id = '41af47ac-19fc-7c92-ae91-0242ac120006';
SELECT evidence.record_relationship_claim_decision(
  '41af47ac-19fc-7c92-ae91-0242ac120043',
  '41af47ac-19fc-7c92-ae91-0242ac120040', 'reviewed',
  'Validator reviewed the reciprocal structural feedback assumptions.',
  clock_timestamp()
);
SET LOCAL app.subject_id = '41af47ac-19fc-7c92-ae91-0242ac120007';
SELECT evidence.record_relationship_claim_decision(
  '41af47ac-19fc-7c92-ae91-0242ac120044',
  '41af47ac-19fc-7c92-ae91-0242ac120040', 'approved',
  'Steward approved the reciprocal edge as an explicit feedback assumption.',
  clock_timestamp()
);

RESET ROLE;
UPDATE relationship_graph_verification_context context
SET
  initial_system_at = initial.recorded_at,
  review_effective_at = review.effective_at,
  review_system_at = review.recorded_at,
  approval_effective_at = approval.effective_at,
  approval_system_at = approval.recorded_at
FROM evidence.relationship_claim_decisions initial,
  evidence.relationship_claim_decisions review,
  evidence.relationship_claim_decisions approval
WHERE initial.claim_id = '41af47ac-19fc-7c92-ae91-0242ac120030'
  AND initial.prior_decision_id IS NULL
  AND review.id = '41af47ac-19fc-7c92-ae91-0242ac120033'
  AND approval.id = '41af47ac-19fc-7c92-ae91-0242ac120034';

SET LOCAL ROLE economyos_app_local;
SET LOCAL app.organization_id = '41af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '41af47ac-19fc-7c92-ae91-0242ac120005';
DO $verify_bitemporal_claim_status$
DECLARE
  context relationship_graph_verification_context%ROWTYPE;
  resolved record;
BEGIN
  SELECT * INTO STRICT context FROM relationship_graph_verification_context;
  SELECT * INTO STRICT resolved
  FROM evidence.relationship_claim_status_at(
    '41af47ac-19fc-7c92-ae91-0242ac120030',
    '2026-01-10T00:00:00Z', context.initial_system_at
  );
  IF resolved.status <> 'proposed'
    OR resolved.claim_kind <> 'causal'
    OR resolved.causal_classification <>
      'econometrically_estimated_causal_relationship'
  THEN
    RAISE EXCEPTION 'initial bitemporal causal status is incorrect: %', resolved;
  END IF;
  SELECT * INTO STRICT resolved
  FROM evidence.relationship_claim_status_at(
    '41af47ac-19fc-7c92-ae91-0242ac120030',
    context.review_effective_at, context.approval_system_at
  );
  IF resolved.status <> 'reviewed' THEN
    RAISE EXCEPTION 'valid-time review resolution is incorrect: %', resolved;
  END IF;
  SELECT * INTO STRICT resolved
  FROM evidence.relationship_claim_status_at(
    '41af47ac-19fc-7c92-ae91-0242ac120030',
    context.approval_effective_at, context.approval_system_at
  );
  IF resolved.status <> 'approved' THEN
    RAISE EXCEPTION 'approved causal status is incorrect: %', resolved;
  END IF;
  SELECT * INTO STRICT resolved
  FROM evidence.relationship_claim_status_at(
    '41af47ac-19fc-7c92-ae91-0242ac120030',
    context.approval_effective_at, context.review_system_at
  );
  IF resolved.status <> 'reviewed' THEN
    RAISE EXCEPTION 'system-time cutoff leaked a later approval: %', resolved;
  END IF;
END
$verify_bitemporal_claim_status$;

SET LOCAL app.organization_id = '41af47ac-19fc-7c92-ae91-0242ac120002';
SET LOCAL app.subject_id = '41af47ac-19fc-7c92-ae91-0242ac120008';
SELECT evidence.create_relationship_endpoint(
  '41af47ac-19fc-7c92-ae91-0242ac120050',
  '41af47ac-19fc-7c92-ae91-0242ac120004',
  'country', 'country.foreign-a', 'Foreign Country A', 'workspace_native', NULL
);
SELECT evidence.create_relationship_endpoint(
  '41af47ac-19fc-7c92-ae91-0242ac120051',
  '41af47ac-19fc-7c92-ae91-0242ac120004',
  'commodity', 'commodity.foreign-b', 'Foreign Commodity B',
  'workspace_native', NULL
);
SELECT evidence.create_relationship_claim(
  '41af47ac-19fc-7c92-ae91-0242ac120052',
  '41af47ac-19fc-7c92-ae91-0242ac120004',
  '41af47ac-19fc-7c92-ae91-0242ac120050',
  '41af47ac-19fc-7c92-ae91-0242ac120051',
  'exports_to', 'association', 'observed_association', 'manual_review',
  NULL, NULL, '{"name":"manual_review","version":"verification-1"}',
  '{"population":"foreign verification scope"}', '[]',
  '{"type":"qualitative","description":"Foreign tenant uncertainty."}',
  0.50, 'unknown', NULL, NULL, NULL, '{}', '{"scope":"foreign"}',
  '2026-01-01T00:00:00Z', NULL, '2026-01-10T00:00:00Z'
);

DO $verify_relationship_tenant_non_enumeration$
DECLARE
  result_count integer;
BEGIN
  SELECT count(*) INTO result_count
  FROM evidence.relationship_claim_status_at(
    '41af47ac-19fc-7c92-ae91-0242ac120030',
    statement_timestamp(), statement_timestamp()
  );
  IF result_count <> 0 THEN
    RAISE EXCEPTION 'foreign tenant enumerated a causal claim';
  END IF;
  BEGIN
    PERFORM evidence.create_relationship_endpoint(
      '41af47ac-19fc-7c92-ae91-0242ac120053',
      '41af47ac-19fc-7c92-ae91-0242ac120003',
      'country', 'country.cross-tenant', 'Cross Tenant Probe',
      'workspace_native', NULL
    );
    RAISE EXCEPTION 'foreign tenant wrote a relationship endpoint';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM count(*) FROM evidence.relationship_claims;
    RAISE EXCEPTION 'app runtime received direct relationship table access';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_relationship_tenant_non_enumeration$;

RESET ROLE;
UPDATE relationship_graph_verification_context
SET projection_event_id = evidence.deterministic_uuid_v8(
  'economyos:relationship-graph-projection:v1',
  '41af47ac-19fc-7c92-ae91-0242ac120034'
);

SET LOCAL ROLE economyos_ingest_local;
SET LOCAL app.organization_id = '41af47ac-19fc-7c92-ae91-0242ac120001';
SET LOCAL app.subject_id = '';
DO $verify_projection_outbox_and_receipt_replay$
DECLARE
  event record;
  page_count integer;
  receipt_time timestamptz;
  failure_id uuid;
  failure_replay uuid;
  success_time timestamptz;
  success_id uuid;
  success_replay uuid;
BEGIN
  SELECT count(*) INTO page_count
  FROM evidence.list_relationship_graph_projection_events(
    '41af47ac-19fc-7c92-ae91-0242ac120003', 0, 500
  );
  IF page_count <> 8 THEN
    RAISE EXCEPTION 'tenant A projection outbox count is incorrect: %', page_count;
  END IF;
  SELECT * INTO STRICT event
  FROM evidence.list_relationship_graph_projection_events(
    '41af47ac-19fc-7c92-ae91-0242ac120003', 0, 500
  ) projected
  WHERE projected.decision_id = '41af47ac-19fc-7c92-ae91-0242ac120034';
  IF event.claim_id <> '41af47ac-19fc-7c92-ae91-0242ac120030'::uuid
    OR event.projection_sha256 !~ '^[0-9a-f]{64}$'
    OR event.projection_manifest->>'status' <> 'approved'
    OR event.projection_manifest->>'claimId' <>
      '41af47ac-19fc-7c92-ae91-0242ac120030'
  THEN
    RAISE EXCEPTION 'approved causal projection event is incorrect: %', event;
  END IF;
  SELECT count(*) INTO page_count
  FROM evidence.list_relationship_graph_projection_events(
    '41af47ac-19fc-7c92-ae91-0242ac120003', event.event_sequence, 500
  ) projected
  WHERE projected.event_sequence <= event.event_sequence;
  IF page_count <> 0 THEN
    RAISE EXCEPTION 'projection outbox keyset replayed its cursor';
  END IF;
  BEGIN
    PERFORM * FROM evidence.list_relationship_graph_projection_events(
      '41af47ac-19fc-7c92-ae91-0242ac120003', 0, 501
    );
    RAISE EXCEPTION 'projection outbox exceeded its bounded page size';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM evidence.record_relationship_graph_projection_receipt(
      event.projection_event_id, 'neo4j-primary', 1, 'succeeded',
      repeat('f', 64), NULL, NULL, clock_timestamp()
    );
    RAISE EXCEPTION 'projection receipt accepted a mismatched destination digest';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  receipt_time := clock_timestamp();
  failure_id := evidence.record_relationship_graph_projection_receipt(
    event.projection_event_id, 'neo4j-primary', 1, 'failed', NULL,
    'PROJECTION_TIMEOUT', 'Verification-only projection timeout.', receipt_time
  );
  failure_replay := evidence.record_relationship_graph_projection_receipt(
    event.projection_event_id, 'neo4j-primary', 1, 'failed', NULL,
    'PROJECTION_TIMEOUT', 'Verification-only projection timeout.', receipt_time
  );
  IF failure_id <> failure_replay THEN
    RAISE EXCEPTION 'failed projection receipt replay changed identity';
  END IF;
  success_time := clock_timestamp();
  success_id := evidence.record_relationship_graph_projection_receipt(
    event.projection_event_id, 'neo4j-primary', 2, 'succeeded',
    event.projection_sha256, NULL, NULL, success_time
  );
  success_replay := evidence.record_relationship_graph_projection_receipt(
    event.projection_event_id, 'neo4j-primary', 2, 'succeeded',
    event.projection_sha256, NULL, NULL, success_time
  );
  IF success_id <> success_replay THEN
    RAISE EXCEPTION 'successful projection receipt replay changed identity';
  END IF;
  BEGIN
    PERFORM evidence.record_relationship_graph_projection_receipt(
      event.projection_event_id, 'neo4j-primary', 3, 'failed', NULL,
      'LATE_FAILURE', 'Terminal succeeded projection cannot fail.', clock_timestamp()
    );
    RAISE EXCEPTION 'terminal succeeded projection accepted a later failure';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END
$verify_projection_outbox_and_receipt_replay$;

SET LOCAL app.organization_id = '41af47ac-19fc-7c92-ae91-0242ac120002';
DO $verify_projection_tenant_denial$
DECLARE
  context relationship_graph_verification_context%ROWTYPE;
BEGIN
  SELECT * INTO STRICT context FROM relationship_graph_verification_context;
  BEGIN
    PERFORM * FROM evidence.list_relationship_graph_projection_events(
      '41af47ac-19fc-7c92-ae91-0242ac120003', 0, 100
    );
    RAISE EXCEPTION 'foreign ingestion tenant enumerated projection events';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM evidence.record_relationship_graph_projection_receipt(
      context.projection_event_id,
      'neo4j-primary', 1, 'failed', NULL, 'FOREIGN_EVENT',
      'Foreign tenant receipt probe.', clock_timestamp()
    );
    RAISE EXCEPTION 'foreign ingestion tenant recorded a projection receipt';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_projection_tenant_denial$;

RESET ROLE;
DO $verify_feedback_graph_and_canonical_evidence$
DECLARE
  approved_feedback_edges integer;
  tenant_a_outbox integer;
  tenant_b_outbox integer;
  receipt_count integer;
  invalid_digest_count integer;
BEGIN
  SELECT count(*) INTO approved_feedback_edges
  FROM evidence.relationship_claims claim
  WHERE claim.id IN (
      '41af47ac-19fc-7c92-ae91-0242ac120030',
      '41af47ac-19fc-7c92-ae91-0242ac120040'
    )
    AND EXISTS (
      SELECT 1 FROM evidence.relationship_claim_decisions decision
      WHERE decision.claim_id = claim.id AND decision.to_status = 'approved'
    );
  IF approved_feedback_edges <> 2 OR NOT EXISTS (
    SELECT 1
    FROM evidence.relationship_claims forward_claim
    JOIN evidence.relationship_claims reverse_claim
      ON reverse_claim.from_endpoint_id = forward_claim.to_endpoint_id
      AND reverse_claim.to_endpoint_id = forward_claim.from_endpoint_id
    WHERE forward_claim.id = '41af47ac-19fc-7c92-ae91-0242ac120030'
      AND reverse_claim.id = '41af47ac-19fc-7c92-ae91-0242ac120040'
  ) THEN
    RAISE EXCEPTION 'legitimate governed economic feedback cycle was not retained';
  END IF;
  SELECT count(*) INTO tenant_a_outbox
  FROM evidence.relationship_graph_projection_outbox
  WHERE organization_id = '41af47ac-19fc-7c92-ae91-0242ac120001';
  SELECT count(*) INTO tenant_b_outbox
  FROM evidence.relationship_graph_projection_outbox
  WHERE organization_id = '41af47ac-19fc-7c92-ae91-0242ac120002';
  SELECT count(*) INTO receipt_count
  FROM evidence.relationship_graph_projection_receipts
  WHERE organization_id = '41af47ac-19fc-7c92-ae91-0242ac120001';
  IF tenant_a_outbox <> 8 OR tenant_b_outbox <> 1 OR receipt_count <> 2 THEN
    RAISE EXCEPTION 'projection durability counts are incorrect: A %, B %, receipts %',
      tenant_a_outbox, tenant_b_outbox, receipt_count;
  END IF;

  SELECT count(*) INTO invalid_digest_count FROM (
    SELECT endpoint_sha256 AS stored_sha, endpoint_manifest AS manifest
    FROM evidence.relationship_endpoints
    UNION ALL
    SELECT claim_sha256, claim_manifest FROM evidence.relationship_claims
    UNION ALL
    SELECT evidence_sha256, evidence_manifest FROM evidence.relationship_evidence
    UNION ALL
    SELECT link_sha256, link_manifest FROM evidence.relationship_evidence_links
    UNION ALL
    SELECT decision_sha256, decision_manifest
    FROM evidence.relationship_claim_decisions
    UNION ALL
    SELECT projection_sha256, projection_manifest
    FROM evidence.relationship_graph_projection_outbox
    UNION ALL
    SELECT receipt_sha256, receipt_manifest
    FROM evidence.relationship_graph_projection_receipts
  ) evidence_row
  WHERE evidence_row.stored_sha <> encode(digest(convert_to(
    evidence.canonical_json(evidence_row.manifest), 'UTF8'
  ), 'sha256'), 'hex');
  IF invalid_digest_count <> 0 THEN
    RAISE EXCEPTION 'relationship graph contains non-canonical evidence digests';
  END IF;
  IF EXISTS (
    SELECT 1 FROM evidence.relationship_graph_projection_outbox outbox
    JOIN evidence.relationship_claim_decisions decision
      ON decision.id = outbox.decision_id
    WHERE outbox.projection_manifest->>'decisionSha256' <> decision.decision_sha256
      OR outbox.projection_manifest->>'claimId' <> decision.claim_id::text
  ) THEN
    RAISE EXCEPTION 'graph projection diverged from PostgreSQL decision authority';
  END IF;
END
$verify_feedback_graph_and_canonical_evidence$;

DO $verify_relationship_graph_immutability_and_rls$
DECLARE
  hardened_tables integer;
BEGIN
  SELECT count(*) INTO hardened_tables
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'evidence'
    AND relation.relname IN (
      'relationship_endpoints', 'relationship_claims', 'relationship_evidence',
      'relationship_evidence_links', 'relationship_claim_decisions',
      'relationship_graph_projection_outbox',
      'relationship_graph_projection_receipts'
    )
    AND relation.relrowsecurity AND relation.relforcerowsecurity;
  IF hardened_tables <> 7 THEN
    RAISE EXCEPTION 'relationship graph tables are missing forced RLS: %', hardened_tables;
  END IF;
  BEGIN
    UPDATE evidence.relationship_claims SET confidence = 0.01
    WHERE id = '41af47ac-19fc-7c92-ae91-0242ac120030';
    RAISE EXCEPTION 'relationship claim mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    DELETE FROM evidence.relationship_evidence
    WHERE id = '41af47ac-19fc-7c92-ae91-0242ac120031';
    RAISE EXCEPTION 'relationship evidence deletion unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    UPDATE evidence.relationship_claim_decisions SET reason = 'Changed evidence.'
    WHERE id = '41af47ac-19fc-7c92-ae91-0242ac120034';
    RAISE EXCEPTION 'relationship decision mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    UPDATE evidence.relationship_graph_projection_outbox
    SET projection_sha256 = repeat('0', 64)
    WHERE decision_id = '41af47ac-19fc-7c92-ae91-0242ac120034';
    RAISE EXCEPTION 'projection outbox mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    DELETE FROM evidence.relationship_graph_projection_receipts;
    RAISE EXCEPTION 'projection receipt deletion unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END
$verify_relationship_graph_immutability_and_rls$;

INSERT INTO evidence.license_reviews (
  id, source_slug, evidence_uri, license_expression, intended_uses,
  evidence, reviewed_by, reviewed_at
) VALUES (
  '41af47ac-19fc-7c92-ae91-0242ac120060',
  'graph-lineage', 'https://example.invalid/graph/lineage-license',
  'TEST-GRAPH-LINEAGE', ARRAY['view', 'api'], '{"fixture":true}',
  'database verification', '2026-01-01T00:00:00Z'
);
INSERT INTO evidence.sources (
  id, organization_id, slug, name, authority_class, homepage_uri,
  classification, license_status, license_expression, redistribution_allowed,
  reviewed_at, license_review_id, attribution_text, permitted_actions
) VALUES (
  '41af47ac-19fc-7c92-ae91-0242ac120061',
  '41af47ac-19fc-7c92-ae91-0242ac120001',
  'graph-lineage', 'Graph lineage verification source', 'customer',
  'https://example.invalid/graph-lineage', 'confidential', 'approved',
  'TEST-GRAPH-LINEAGE', false, '2026-01-01T00:00:00Z',
  '41af47ac-19fc-7c92-ae91-0242ac120060',
  'Graph lineage verification fixture.', ARRAY['view', 'api']
);
INSERT INTO evidence.source_datasets (
  id, organization_id, source_id, external_key, title, pit_quality,
  expected_frequency, release_schedule, admission_status, admitted_at
) VALUES
  (
    '41af47ac-19fc-7c92-ae91-0242ac120062',
    '41af47ac-19fc-7c92-ae91-0242ac120001',
    '41af47ac-19fc-7c92-ae91-0242ac120061',
    'lineage.input', 'Lineage input dataset', 'true_vintage', 'monthly', '{}',
    'approved', '2026-01-01T00:00:00Z'
  ),
  (
    '41af47ac-19fc-7c92-ae91-0242ac120063',
    '41af47ac-19fc-7c92-ae91-0242ac120001',
    '41af47ac-19fc-7c92-ae91-0242ac120061',
    'lineage.output', 'Lineage output dataset', 'true_vintage', 'monthly', '{}',
    'approved', '2026-01-01T00:00:00Z'
  );
INSERT INTO evidence.lineage_edges (
  id, organization_id, from_type, from_id, to_type, to_id,
  relation, transformation_version
) VALUES (
  '41af47ac-19fc-7c92-ae91-0242ac120064',
  '41af47ac-19fc-7c92-ae91-0242ac120001',
  'dataset', '41af47ac-19fc-7c92-ae91-0242ac120062',
  'dataset', '41af47ac-19fc-7c92-ae91-0242ac120063',
  'derived_from', 'verification-1'
);

DO $verify_provenance_cycle_rejected$
BEGIN
  BEGIN
    INSERT INTO evidence.lineage_edges (
      id, organization_id, from_type, from_id, to_type, to_id,
      relation, transformation_version
    ) VALUES (
      '41af47ac-19fc-7c92-ae91-0242ac120065',
      '41af47ac-19fc-7c92-ae91-0242ac120001',
      'dataset', '41af47ac-19fc-7c92-ae91-0242ac120063',
      'dataset', '41af47ac-19fc-7c92-ae91-0242ac120062',
      'derived_from', 'verification-1'
    );
    RAISE EXCEPTION 'acyclic provenance accepted a reverse lineage cycle';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END
$verify_provenance_cycle_rejected$;

ROLLBACK;
