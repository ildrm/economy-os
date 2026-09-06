# Economic intelligence expansion delivery

This is the implementation ledger for the expansion accepted on 2026-09-06.
An entry is complete only when its data, application journey and acceptance
evidence exist. Registration, synthetic tests and research kernels are not
production coverage or empirical validation.

## Delivery order

| Milestone | Status | Required evidence |
| --- | --- | --- |
| 1. Governed data foundation | In progress | Versioned semantics, unknown revision status, immutable migration, instruments, operational source review and ingestion |
| 2. Rich country intelligence | In progress | Actual country histories, compatible comparisons and household/business explanations for 18 priority countries |
| 3. Behavioral observatory | In progress | Actual survey measurements, separate evidence types, methods and research review |
| 4. Markets and investment research | Pending | Approved price observations, asset-specific meanings, timing, valuation and saved interests |
| 5. Risk and private portfolios | In progress: public risk indicators | Authenticated tenant-private allocation, coverage gates, historical analysis and evaluated model publication |
| 6. Studies, scenarios and questions | In progress: scenarios and bounded questions | Consent and withdrawal, reproducible protocols, ten bounded scenarios and cited deterministic questions |
| 7. Multilingual production operation | In progress: build and locale shells | Twelve locales, full local services, hosted configuration, recovery, accessibility, release and SBOM checks |

## Invariants

- Keep all 217 country profiles and deepen AM, AZ, BE, BR, CA, CN, FI, FR, DE,
  IR, IT, JP, NL, ES, SE, TR, GB and US.
- Apply `docs/data-source-policy.md` at acquisition, storage, transformation,
  publication and export. Access grade is independent of usage permission.
- Public data is an approved projection. Portfolios and voluntary studies use
  separate tenant-private storage and authorization.
- An observation, statistic, association, experiment, model estimate and scenario
  are different evidence types. Availability and missingness are explicit.
- Preserve legacy immutable records and report identities. Do not backdate
  availability of revised data or relabel unverifiable records as validated.
- Keep the existing research-only investment contracts intact. Approved public
  decision support is a separate publication contract.
- No private trading histories, automated trading, compulsory studies or
  automatic investor suitability profiles.
- Core journeys use named selections and presets. English, Persian, German,
  French, Simplified Chinese, Russian, Spanish, Portuguese, Hindi, Arabic,
  Armenian and Turkish are release requirements.

## Acceptance record

Record exact checks and limitations here as implementation progresses. A source
that cannot currently be admitted stays a visible coverage gap; neither its
catalog entry nor a simulated result counts as delivery.

### Delivered application and data, 2026-09-06

- Retained all 217 economy profiles plus the World aggregate. The public annual
  catalog now has 80 defined metrics and 336,444 nonmissing source values from
  161 retained original World Bank responses. Raw lexical values and source
  retrieval dates survive cache recovery. New financing, debt, consumption,
  fiscal, production, trade and employment measurements appear in the existing
  country pages, comparison table and CSV exports.
- The eighteen priority countries have historical observations for 69–80 of
  these metrics. This is historical coverage, not a claim that the latest year
  is complete or that direct national sources are connected.
- `/[locale]/intelligence/decisions` provides household, business, investor and
  risk-indicator perspectives, dated values, histories, underlying evidence and
  ten bounded scenario families. Users select names, audiences and severity.
  Scenario exposures are illustrative assumptions independent of the selected
  country's actual basket. No scenario output is a calibrated crisis probability.
- The risk perspective separates external financing, banking, public finances
  and monetary conditions. Sixteen underlying indicators retain their dates;
  annual changes require consecutive years and preserve percentage-point units.
- Seven public Nest API routes expose catalog, country, comparison, survey,
  question, risk and scenario workflows from these verified snapshots. The
  service has no database dependency. The risk response can complete its
  indicator publication with unavailable forecast slots, without changing the
  existing research-only forecast contracts. Four deterministic questions return
  relevant cited measurements. See [API behavior](public-intelligence-api.md).
- `/[locale]/intelligence/behavioral` publishes 9,806 actual monthly weighted ECB
  CES aggregate measurements. Countries: BE, DE, ES, FI, FR, IT, NL, AT, GR, IE,
  PT. Fourteen source metrics support twelve selectable measures plus the
  derived difference between the 75th and 25th percentiles. Published individual
  uncertainty is kept separate from cross-respondent disagreement. Users can
  inspect monthly histories and export inputs, raw semantics and source links.
- The ECB source profile records scope, terms, review expiry, attribution and
  free-source notice. The CSV adapter rejects unknown statuses, confidential
  cells, changed units, incorrect keys and reversed percentiles. A normal `A`
  observation status does not mean final. No microdata was acquired.
- Migration 0041 adds append-only, tenant-scoped versioned observation metadata
  and dataset definitions. Existing rows and report identities are unchanged.
  New worker promotions default to unknown status and re-read verified raw WDI
  bytes to attach full semantics. Legacy final-status reconciliation is allowed
  only for generation 0; it does not certify those records as fully described.
- A shared analytical envelope separates availability, evidence type, uncertainty,
  coverage and method version. Instrument identity keeps crypto quote assets
  separate from fiat and rejects treating reference indices as investable assets.
- The Python worker implements descriptive/weighted summaries, interpretable
  regression, chronological baseline evaluation, event-study arithmetic,
  drawdown and coverage-gated historical loss calculations. Its deterministic
  archive and pinned Python 3.14.5 runtime are included in build/SBOM contracts.
- Eleven actual CES baseline evaluations retain their inputs, predictions,
  methods, scores and source hashes in `data/intelligence/evaluations/`. Their
  target is the next published expectation statistic, not realized inflation.
  They are retrospective studies of revised history and remain review-required.

### Validation recorded so far

- Offline source replay: 336,444 annual values and 9,806 monthly CES values.
- Unit/contract/HTTP suite: 1,266 tests in 100 files; package coverage 91.51% statements,
  84.67% branches, 97.66% functions and 93.28% lines.
- Python: 13 reference/edge-case tests; eleven retained empirical evaluations
  reproduced byte-for-byte.
- All 41 migrations and existing SQL verifiers passed in an owned disposable
  database. Added checks cover sidecar binding, unchanged original records,
  index-versus-money rejection, immutability and denied application table access.
- Workspace type checking and the complete production build passed. Eight new
  public HTTP tests cover real retained data, anonymous/protected boundaries,
  corrupt files, bounded input, unavailable results and current survey source
  withdrawal/expiry. These are public API tests, not private session acceptance.
- The existing public browser suite passed 48 cases. The final expansion suite
  passed all 56 locale, mobile/desktop, accessibility, scenario, survey-evidence
  and risk-navigation cases. Visual review covered the decision and behavioral
  dashboards; complete terminology translation remains a separate requirement.
- Lint, repository policy and release-automation checks passed. Local unsigned
  candidate SBOM/build-manifest generation and verification passed with 1,491
  build files and 428 production components, including CPython. This is evidence
  for an uncommitted local candidate, not a successful remote CI run or production
  release authorization. Signing and external deployment evidence remain open.
- The owned disposable verification database was removed and the PostgreSQL
  container stopped after the migration checks; its volume was preserved.

### Still required before accepting the full expansion

These are unfinished deliverables, not implied by the code or counts above:

1. Individually resolve/split/review all 87 supplied catalog entries, complete
   direct national CPI and distinct HICP feeds, and connect further macro,
   household, survey, commodities, property and asset datasets. NY Fed and the
   World Bank commodity workbook downloads timed out in this environment;
   neither is reported as ingested and no third-party substitute was used.
2. Generalize durable ingestion beyond WDI, attach CES to governed storage and
   Temporal publication, implement release-aware schedules, immutable publication
   cutovers, source monitoring and runtime licence-withdrawal enforcement.
3. Finish all twelve behavioral analytical families, survey design-aware
   inference, reviewed narrative extraction and the 60-study research library.
   The existing 12 cited studies are retained; they have not become 60 reviews.
4. Deliver approved market histories, asset valuation, corporate actions, private
   instrument selection/import, portfolio persistence and complete authenticated
   risk workflows. Concentration/risk kernels alone do not deliver portfolios.
5. Complete persistence of unavailable-aware crisis reports, calibrated/domain-approved model
   publication, private/public decision-support permissions and scenario
   transmission estimates where evidence supports them.
6. Implement consented/withdrawable studies, optional cited assistant, broader
   deterministic question journeys, watchlists, opt-in notifications and reports.
7. Complete every legacy metric definition/methodology/export in all twelve
   languages and obtain economic terminology review. New page controls and
   explanation framing are translated; English/Persian metric definitions still
   appear with their language declared on the decision page.
8. Complete hosted authentication/session routing, production services, full
   Windows/Linux worker startup, backups/restoration and authenticated
   browser-to-API-to-database acceptance. Existing launchers remain available;
   the batch worker is not yet a deployed Temporal scientific service.

Scientific approval and deployment approval remain separate. No milestone is
marked complete while its exit conditions above are open.
