# Phase 14 Collaboration and API Ecosystem Runbook

Status: domain-and-persistence runbook; no external integration or production certification is implied.

## Collaborate on evidence

1. Resolve the authenticated organization, workspace, membership, role, and policy decision.
2. Pin the referenced artifact version and its analytical cutoff.
3. Add bounded citation pointers with source availability and classification. Label evidence learned after the cutoff as subsequent evidence.
4. Append annotation, dispute, review, resolution, or revision events; never rewrite an earlier record.
5. Verify organization/workspace scope, actor authorization, chronology, identity, content digest, and the complete replay chain before serving the record.

## Operate a developer integration

1. Issue a credential identifier and retain only a strong digest in the platform record. Keep the presented secret in the approved secret channel.
2. Bind each authorization decision to the exact principal, action, scope, policy, and evaluation time.
3. Evaluate the client SDK/CLI contract under strict semantic-version and capability rules.
4. Reserve quota atomically for the exact request digest and expiry. Consume, release, or reconcile through append-only events.
5. Configure a public HTTPS webhook endpoint, event allowlist, signing-key identifier, retry policy, and bounded replay window.
6. Deliver a content-addressed envelope. Record attempts and terminal outcome; reject stale timestamps, nonce reuse, changed payloads, and illegal retry transitions.

## Certify and admit an extension

1. Register an immutable connector or model-extension manifest with explicit capabilities, egress, data classes, resource limits, isolation mode, provenance, and limitations.
2. Evaluate the actual requested compatibility contract; do not substitute a broader or different contract during certification.
3. Obtain workspace-scoped independent certification backed by the declared evidence.
4. Reserve quota and authorize `extension.execute` for the exact principal, version, workspace, request digest, and time.
5. Admit only while certification, compatibility, authorization, and reservation are active. Execute the extension only in a separately enforced sandbox.
6. Revoke through the separate `extension.revoke` action and stop new execution before any future recertification.

## Verification

```bash
corepack pnpm exec vitest run packages/collaboration-ecosystem/src
corepack pnpm exec vitest run packages/collaboration-ecosystem/src --coverage --coverage.include='packages/collaboration-ecosystem/src/**/*.ts'
corepack pnpm --filter @economyos/collaboration-ecosystem typecheck
corepack pnpm --filter @economyos/collaboration-ecosystem build
corepack pnpm exec biome check packages/collaboration-ecosystem
ECONOMYOS_VERIFY_DATABASE=<disposable_database> corepack pnpm db:verify
```

The database command must run against a uniquely named disposable database, never the default `economyos` database. It applies all migrations from a clean schema and executes the dedicated Phase 14 two-tenant verifier. Migration `0035` and its verifier are checksum-frozen at the values recorded in the methodology document.

Stop on cross-tenant scope, policy not yet active, cutoff leakage, digest mismatch, secret mismatch, incompatible client/extension, quota conflict, stale/replayed webhook, private/reserved webhook target, illegal event transition, missing independent certification, or revoked extension.

## Remaining production work

Integrate the persistence boundary through protected HTTP APIs; add a rendered developer portal, published SDK/CLI artifacts, deployed shared quota/rate-limit enforcement, secret rotation, webhook transport with runtime DNS/IP egress protection, isolated extension execution, billing reconciliation, monitoring, production database qualification, and independent integration/security certification.
