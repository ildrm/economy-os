# Internationalization Architecture

## Supported locales

The product target is `en`, `fa`, `de`, `fr`, `zh-Hans`, `ru`, `es`, `pt`, `hi`, `ar`, `hy`, and `tr`. English is the source locale. Persian and Arabic are RTL. Locale support is a release property: a locale cannot be marked supported until the completeness, layout, accessibility, and formatter gates pass.

Phase 1 establishes the architecture and validated English/Persian paths. The remaining catalogs advance through the published roadmap before general availability; untranslated locales are not advertised as complete.

## Locale resolution

Resolution order is explicit URL segment, authenticated user preference, workspace default, accepted browser language, then English. Public canonical URLs include locale. APIs do not translate stable codes; they accept `Accept-Language` for localized labels and return locale-neutral identifiers.

Language, writing direction, number system, time zone, currency, measurement conventions, and calendar are independent preferences. Persian language does not automatically select a non-Gregorian calendar or Persian digits.

## Message model

- ICU MessageFormat handles plural, select, and grammatical variants.
- Keys are semantic (`alert.acknowledge.action`), not copied English.
- Sentences are translated whole; no string concatenation.
- Rich messages allow only registered safe components.
- Backend error codes are stable; clients localize approved user messages.
- Source names, official indicator titles, citations, formulas, and user content preserve origin with optional translations clearly identified.

Catalogs contain description, screenshot/context, variable types, owner, and review status. CI rejects missing variables, invalid ICU, unused keys beyond a grace period, and unsafe markup.

## Formatting

All display formatting uses standards-based locale APIs with an explicit locale and time zone. Storage and APIs use ISO timestamps, ISO currency/country codes, and decimal strings where precision matters. Compact notation is opt-in and the exact number is accessible.

- Dates distinguish event, release, valid, and system time.
- Relative time is secondary to an absolute accessible value.
- Units use the canonical unit registry and locale-specific display names.
- Currency conversion never follows display locale implicitly.
- User input accepts localized decimal/group separators but normalizes and confirms ambiguous values.

## Bidirectionality

The document direction is set from locale metadata. Components use CSS logical properties. Isolated identifiers, tickers, URLs, formulas, signed numbers, and Latin source names use Unicode bidi isolation (`bdi` or equivalent). Tables may keep numeric columns LTR while labels follow the document. Directional icons have semantic mirror metadata; play, download, and external-link icons do not mirror.

Charts place chronological time consistently according to the visualization contract while their surrounding layout mirrors. Axis labels and tooltips isolate mixed-direction content.

## Translation workflow

1. Extract typed source messages in CI.
2. Supply context, variable definitions, and screenshots.
3. Machine assistance may draft; a qualified human reviews economic, legal, security, and billing language.
4. Linguistic QA runs in product with real layouts and synthetic fixtures.
5. Release only catalogs at 100% critical-flow coverage and the configured general-UI threshold.
6. Translation memory and terminology changes are versioned and audited.

Protected glossary concepts include point-in-time, vintage, release, revision, hazard, scenario, intervention, uncertainty, confidence, and evidence. Translators must not collapse distinct terms.

## Search and data

Country, organization, indicator, and concept search uses localized aliases plus stable codes. Locale-aware collation affects display ordering only, not cursors or canonical ordering. Exports carry locale and formatting metadata; machine exports remain locale neutral.

## Testing

- Pseudo-locales: 40% expansion, accented Latin, forced RTL, missing-message marker.
- Unit tests for resolution, formatters, plural categories, and bidi isolation.
- Screenshot tests for every critical flow in EN/FA plus representative scripts.
- Keyboard and screen-reader testing in RTL.
- Property tests ensure formatted values round-trip where editing is supported.

## Acceptance criteria

- A locale switch preserves the resource, filters, PIT cutoffs, and unsaved safe form state.
- No API/client logic branches on translated text.
- Mixed-script economic values render without reordered signs, units, or identifiers.
- Unsupported/missing translation status is honest; English fallback is observable in telemetry.

