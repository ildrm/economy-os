# Commercial and Entitlement Architecture

## Principles

Billing describes a commercial relationship; authorization decides access. Product code checks named capabilities through the policy service and never branches on plan display names, payment-provider product IDs, or UI visibility. Access changes are effective-dated, auditable, tenant-scoped, and safe during billing-provider outages.

## Layers

1. **Catalog**: product, edition, add-on, metric, limit, availability window, and jurisdiction.
2. **Contract**: tenant agreement, dates, seats, usage commitments, negotiated grants, trials, and grace terms.
3. **Entitlement**: normalized action/resource grant or quantitative limit.
4. **Usage**: immutable metering events and corrected aggregates.
5. **Policy**: final decision combining identity, RBAC/ABAC, tenant state, data/model classification, and entitlement.

A valid entitlement cannot override security or governance denial. An administrator role does not create a paid entitlement.

## Initial editions

| Edition | Intended scope | Illustrative capabilities |
|---|---|---|
| Community | public exploration | public catalog, limited countries/series, cited exports |
| Professional | individual research | saved work, comparisons, monitored alerts, standard scenarios |
| Institutional | teams and governed models | workspaces, service accounts, bulk API, validation and approvals |
| Enterprise | controlled deployment | SSO/SAML, SCIM, custom retention, private sources, advanced audit |
| Sovereign | jurisdictional and isolated operation | residency/isolation options, bespoke policy, offline/export controls |

These are packaging hypotheses, not hard-coded rights. The commercial catalog maps each offering to versioned capabilities.

## Capability model

Capabilities use `resource.action` names such as `observation.read`, `dataset.export`, `scenario.run`, `model.validate`, `alert.manage`, and `audit.read`. Limits may specify seats, requests, compute credits, scenario concurrency, storage, retention, countries, series families, export rows, or model classes.

Each policy evaluation returns allow/deny, stable reason code, policy/catalog version, evaluated subject and tenant, effective interval, and safe remediation. The UI can explain an upgrade, contact-admin, classification, or security denial without revealing hidden resources.

## Metering

Usage producers emit idempotent events with event ID, tenant, capability, quantity/unit, resource class, occurred-at, received-at, and correlation ID. Rating is replayable. Corrections append adjustment events. Operational telemetry is not the billing ledger.

Hard limits are reserved for cost/safety boundaries and are checked before scheduling. Soft limits notify and continue according to contract. Race-sensitive quotas use atomic reservations, settlement, expiry, and reconciliation.

## Lifecycle

Contract activation emits normalized grants. Upgrades may apply immediately; downgrades apply according to terms. Payment failure initiates an explicit grace policy, not instant data deletion. Suspension blocks governed actions while preserving retrieval obligations. Contract end triggers a documented export/retention/deletion workflow.

Billing webhooks are signature-verified, timestamp-bounded, idempotent, stored as evidence, and processed asynchronously. A billing outage cannot erase the last valid entitlement snapshot; stale-snapshot policy is explicit.

## Trials and support access

Trials have start/end, sponsor, eligible capabilities, resource ceilings, and conversion/expiration behavior. Support impersonation is prohibited. Time-bound, approved support access uses the support principal's identity, tenant-visible audit, stated reason, and optional customer approval.

## Acceptance criteria

- The same request can be independently denied by authorization, classification, governance, or commercial policy with distinct codes.
- Billing-provider identifiers do not appear in application policy checks.
- Entitlement history can reconstruct a decision at any prior system time.
- Usage replay does not double charge and adjustments never rewrite source events.
- Contract cancellation does not bypass retention, legal hold, export, or deletion controls.

