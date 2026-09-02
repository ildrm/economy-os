# UX Specification

## Purpose

EconomyOS is an evidence-first analytical workbench, not a KPI dashboard. Every conclusion must let a user move from summary to method, input release, transformation, uncertainty, and source. Scenario output must stay visibly distinct from observed history and forecasts.

## Primary users

| User | Core job | Default density |
|---|---|---|
| Policy analyst | explain changes, compare economies, test interventions | dense |
| Sovereign-risk analyst | monitor hazards, investigate alerts, brief a committee | dense |
| Investment researcher | compare macro suitability and valuation context | standard |
| Data steward | admit sources, resolve quality incidents, inspect lineage | dense |
| Model validator | reproduce runs, compare versions, approve or reject | dense |
| Executive reader | understand state, drivers, uncertainty, and caveats | concise |

## Information architecture

- Global: comparable indicators, maps, regimes, spillovers, and saved views.
- Countries: economy profile, releases, drivers, risks, policies, and history.
- Crisis Monitor: hazard-specific panels, alerts, episodes, calibration, and postmortems.
- Evidence: observations, releases, vintages, transformations, lineage, and source catalog.
- Models: registry, cards, validation, comparison, runs, drift, and approvals.
- Scenarios: assumptions, interventions, ensembles, outcomes, comparisons, and exports.
- Research: notebooks, reports, citations, and shared workspaces.
- Operations: ingestion health, quality incidents, jobs, and provider status.
- Administration: organizations, workspaces, identities, roles, policies, entitlements, and audit.

Navigation is role-sensitive but never changes the meaning or stable URL of a resource.

## Shared analytical grammar

Every analytical page uses the same layers:

1. **State**: what is known at the chosen effective and knowledge times.
2. **Change**: what changed, compared with which explicit baseline.
3. **Drivers**: ranked contributions with method and uncertainty.
4. **Evidence**: input series, releases, freshness, quality, and provenance.
5. **Interpretation**: model outputs and limitations.
6. **Action**: save, compare, annotate, export, or construct a scenario.

An `As known at` control is persistent. Changing it reruns the complete query; it must never alter only the chart label.

## Core flows

### Investigate a country

1. Select country, effective interval, and knowledge-time cutoff.
2. See a short state summary with freshness and uncertainty.
3. Expand a driver to reveal contributions and supporting evidence.
4. Open an observation to inspect release history, transformations, and source.
5. Compare another country or prior PIT snapshot.
6. Save the view or start a scenario with the displayed state pinned.

### Triage a crisis alert

1. Open the alert with hazard, severity, policy, and generated-at time.
2. Confirm the evaluation used only then-visible inputs.
3. Inspect trigger contributions, missingness, model version, and calibration status.
4. Acknowledge, annotate, assign, suppress by policy, or escalate.
5. Post-event resolution records outcome and feedback without rewriting history.

### Build and compare a scenario

1. Pin a baseline dataset snapshot and model set.
2. Add structured interventions and exogenous assumptions with units and intervals.
3. Resolve invalid combinations before execution.
4. Run asynchronously and observe durable workflow progress.
5. Compare ensemble distributions, sensitivities, spillovers, and baseline deltas.
6. Export a manifest-backed report. Outputs carry `scenario`, never `observed`.

### Validate a model

1. Open candidate card and immutable artifact.
2. Review target definition, temporal split, leakage checks, metrics, and subgroup results.
3. Reproduce the validation run from its manifest.
4. Approve, reject, request change, or promote according to segregation of duties.

## Page requirements

### Global view

- Choropleth and ranked table must be equivalent, keyboard accessible, and share filters.
- Map colors require numeric legend, text labels, and non-color signals.
- Comparisons expose definition and coverage differences; incomparable values are not silently normalized.

### Country view

- Header: identity, observation cutoff, knowledge cutoff, regime, freshness, and data confidence.
- Sections: summary, economy, households, public sector, external, financial, institutions, hazards, evidence.
- Empty concepts remain `unknown`; the page never substitutes a neutral score.

### Evidence explorer

- Side-by-side event time, release time, valid time, and system time.
- Release ladder showing revisions without presenting the latest value as historically available.
- Lineage graph distinguishes source, transformation, dataset, feature, model, run, and output nodes.

### Model and scenario results

- Headline includes output type, unit, horizon, model/version, data snapshot, run time, and uncertainty.
- Distributions take precedence over decorative point estimates.
- Causal claims require identification status and assumptions; otherwise language is associative or predictive.

## States and feedback

All data surfaces implement loading, empty, partial, stale, permission-denied, policy-denied, provider-degraded, computation-failed, and offline states. Partial results identify missing components. A retry never implies that a non-idempotent job will duplicate.

Destructive operations show resource identity and consequence. Long jobs are resumable and expose queued/running/waiting/canceling/canceled/failed/succeeded states.

## Accessibility

- WCAG 2.2 AA is the release floor.
- Complete keyboard navigation, visible focus, semantic landmarks, skip links, accessible names, and polite live regions.
- Charts have summaries, tabular alternatives, keyboard tooltips, and patterns/shapes in addition to color.
- Text supports 200% zoom and reflow at 320 CSS pixels without loss of operation.
- Motion respects `prefers-reduced-motion`; no required task depends on animation.
- Target sizes, error association, contrast, and authentication flows meet AA requirements.

## Responsive behavior

Desktop provides multi-pane comparison. Tablet collapses secondary evidence into drawers. Mobile preserves search, critical state, time controls, alert triage, and approvals; dense modeling and lineage editing may use a guided single-column flow. Horizontal tables become labeled record lists rather than clipped canvases.

## Trust language

Use `observed`, `estimated`, `forecast`, `scenario`, `synthetic demo`, and `unknown` exactly. Avoid `AI says`, `guaranteed`, `safe`, or `will happen`. Recommendations require an explicitly governed decision product; macro suitability scores are not investment advice.

## UX acceptance criteria

- A user can trace any displayed metric to a release and source within three interactions.
- A saved view restores locale, tenant/workspace, filters, effective time, and knowledge time.
- Observed, revised, forecast, and scenario values cannot be confused in screenshots or exports.
- Every graphical conclusion has a non-graphical equivalent.
- Permission and entitlement failures are distinguishable without leaking resource existence.

