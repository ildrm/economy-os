# Design System

## Principles

The interface is sober, legible, evidence-dense, and calm under stress. Visual emphasis communicates semantics rather than decoration. Internationalization, bidirectionality, accessibility, print, and data visualization are part of the system—not page-level fixes.

## Token architecture

Tokens have three layers:

- Primitive: palettes, type scales, spaces, radii, shadows, durations.
- Semantic: surface, text, border, action, focus, success, caution, danger, uncertainty, observed, forecast, scenario.
- Component: local aliases referencing semantic tokens only.

Applications consume generated CSS variables and typed TypeScript tokens. Product code must not introduce raw hex colors or arbitrary spacing.

### Foundational palette

- Navy anchors navigation and primary actions; it does not encode positive performance.
- Neutral gray supports surfaces, borders, disabled states, and dense tables.
- Blue encodes observed series; violet forecast; amber scenario; teal comparison.
- Green, amber, and red encode status only when paired with icons and text.
- Unknown and missing use patterned neutral treatments, never zero-like gray bars.

Light, dark, high-contrast light, and high-contrast dark themes use identical semantic names. Printed exports use a separate ink-safe mapping.

## Typography

- UI and Latin/Cyrillic: a system-first sans stack with metrics-compatible fallback.
- Persian/Arabic: a highly legible Arabic-script UI stack with correct joining and tabular numerals.
- Simplified Chinese: system CJK sans stack.
- Devanagari and Armenian: native system stacks with tested line height.
- Numeric tables use tabular figures; code, identifiers, and formulas use monospace.

Typography tokens define display, title, heading, body, label, caption, numeric, and code roles. Language-specific font and line-height overrides are attached to `:lang()`.

## Layout and spacing

The base grid is 4 px. Standard content width is fluid with readable line-length limits; analytical canvases may use the viewport. Components use logical properties (`margin-inline`, `inset-inline-start`) so RTL mirrors without manual overrides.

Density modes:

- Comfortable for executive and narrative reading.
- Standard by default.
- Compact for professional tables and operations.

Density changes geometry, not information or permissions.

## Core components

- App shell, command palette, breadcrumbs, locale and tenant switchers.
- PIT time control, filter bar, query summary, saved-view menu.
- Metric tile with type, unit, cutoff, freshness, uncertainty, and drill-down.
- Data table with virtualization, pinned fields, column definitions, export, and accessible record mode.
- Evidence badge, source badge, quality flag, model-status badge, hazard badge.
- Release ladder, lineage inspector, contribution table, distribution plot, fan chart.
- Alert card and triage panel.
- Scenario assumption editor and run status timeline.
- Dialog, drawer, popover, tooltip, toast, banner, skeleton, empty/error states.
- Approval record, audit event, identity/role matrix, entitlement explanation.

Components expose deterministic states in Storybook-equivalent fixtures. Demo fixtures are labeled synthetic and excluded from production bundles.

## Data visualization

Charts are composed from scales and semantic tokens rather than a chart theme with hidden defaults.

- Axes display unit, transform, and date basis.
- Zero baselines appear when analytically relevant; truncated axes are disclosed.
- Series use labels and shapes as well as color.
- Uncertainty is an interval/band with legend, not a glow.
- Revisions can show vintage trajectories or release ladders.
- Forecast and scenario regions are visibly separated from history.
- Tooltips repeat knowledge cutoff and source status.
- Maps always have a sortable table alternative.

The system prohibits 3-D charts, dual axes without a documented rationale, rainbow palettes, and chart interpolation that implies unavailable observations.

## Interaction and motion

Motion explains continuity and state change. Standard durations are short and use reduced-motion fallbacks. Live data does not reorder while a user is reading unless explicitly enabled. Focus returns to the initiator after a dialog closes.

## Content conventions

Labels are sentence case and translate as whole messages. Dates and numbers use locale formatters. Units remain machine-defined. Acronyms have first-use expansions. Destructive buttons name the action. Error messages state what happened, what was preserved, and a next safe action.

## Governance

Each component has owner, accessibility tests, interaction tests, visual regression coverage, locale/RTL examples, API maturity, and change log. Breaking token/component changes require migration guidance. New one-off variants need design-system review.

## Acceptance criteria

- Four themes meet contrast requirements across interactive states.
- Every component renders in English, Persian RTL, German expansion, Chinese, Hindi, and pseudo-locales.
- No direction is inferred from language alone; locale metadata sets it.
- Semantic data types remain identifiable in monochrome and print.
- Visual-regression snapshots cover both directions and all density modes.

