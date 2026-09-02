# Phase 11 Scenario Laboratory Operations Runbook

Status: domain/runtime runbook; no production or empirical approval is implied.

## Governed workflow

1. Create a baseline identity binding exact observed/forecast/model/result artifacts and verify PIT availability.
2. Create a versioned scenario definition with cited assumptions, limitations, shocks, hypothetical interventions, and an explicit conflict policy.
3. Record proposal and any definition change in the hash-chained governance ledger. Obtain review and approval from distinct authorized actors.
4. Register a bounded run request idempotently. Persist the returned replay identity and each optimistic state transition atomically.
5. Cancel only through the state machine. Checkpoint only contiguous completed members; resume only with the exact checkpoint/request identity. Retry failed/cancelled work with a durable reason and unchanged computation identity.
6. Create the result only from a succeeded run. Preserve baseline and ensemble uncertainty separately.
7. Compare only results bound to the identical baseline digest and values; preserve requested order and do not rank.
8. Export only with complete provenance and citations. Keep every scenario/result/export outside observed-data admission.

## Verification

```bash
corepack pnpm exec vitest run packages/scenario-lab/src
corepack pnpm --filter @economyos/scenario-lab typecheck
corepack pnpm --filter @economyos/scenario-lab build
corepack pnpm exec biome check packages/scenario-lab
```

Stop or quarantine work on a late baseline input, digest mismatch, unhandled action conflict, actor-role overlap, unapproved definition, idempotency conflict, illegal state transition, stale optimistic version, checkpoint gap, replay mismatch, incompatible comparison baseline, missing citation, or observed-data admission attempt.

## Remaining production work

Add forced-RLS persistence, a durable workflow/queue worker, locking and lease recovery, API/UI collaboration, authorization, quotas, empirical scenario models/calibration, monitoring, recovery exercises, and independent model-risk approval.

