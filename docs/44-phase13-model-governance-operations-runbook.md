# Phase 13 Model Governance and Research Operations Runbook

Status: domain-core runbook; it does not authorize a production model.

## Govern a model version

1. Register the stable model identity, owner, intended use, prohibited uses, impact class, and ontology version.
2. Create an immutable version that binds the complete card, code/configuration, environment, package/SBOM, feature, data, label, training, calibration, and artifact manifests.
3. Record all experiments, including failed and negative results. Preserve exact inputs, commands, outputs, seeds, and numerical tolerances.
4. Attach research and notebook provenance. Obtain independent peer review; never use notebook execution alone as release evidence.
5. Submit the declared validation plan. Run only against point-in-time eligible data and retain baseline, holdout, calibration, subgroup, stability, security, license, and reproducibility results appropriate to the claimed output.
6. Record review and validation events from authorized actors who are independent of the producer where required.
7. Before production, attach accepted deployment, rollback, monitoring, owner/on-call, incident, security/license, and user-limitation evidence.
8. Verify the lifecycle hash chain and every pinned manifest before serving or deploying the version.

## Operate and retire

1. Append forecasts before their outcomes are available.
2. Record outcomes and scores separately when they become available; do not edit the forecast.
3. Admit monitoring observations only under the active monitoring contract and route threshold breaches to an incident or restriction decision.
4. Restrict or disable immediately when the policy requires it. Preserve the triggering evidence and actor.
5. Roll back only to an explicitly compatible, still-authorized artifact with retained deployment evidence.
6. Retire by appending a final lifecycle event and preserving all historical versions, experiments, outcomes, incidents, and decisions.

## Verification

```bash
corepack pnpm exec vitest run packages/model-governance/src
corepack pnpm exec vitest run packages/model-governance/src --coverage --coverage.include='packages/model-governance/src/**/*.ts'
corepack pnpm --filter @economyos/model-governance typecheck
corepack pnpm --filter @economyos/model-governance build
corepack pnpm exec biome check packages/model-governance
```

Stop the release on a digest/replay mismatch, future or late evidence, data/label leakage, missing negative result, unsupported probability or causal language, missing independent actor, absent rollback/monitoring evidence, expired approval, incompatible deployment, or failed lifecycle replay.

## Remaining production work

Add forced-RLS append-only persistence, signer and artifact verification, authenticated APIs, notebook isolation, durable monitoring and incident workflows, deployment integration, user interfaces, representative-scale recovery tests, and independent empirical/model-risk acceptance.
