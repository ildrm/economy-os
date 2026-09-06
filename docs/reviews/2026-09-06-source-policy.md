# Source-policy implementation review — 2026-09-06

This review applies the user's 20 source-selection rules. The implementation and collection boundaries are documented in [the policy](../data-source-policy.md).

| Review responsibility | Finding and resulting change |
| --- | --- |
| Data-source architect | Official authority and exact variable identity take priority; blocked official data does not trigger a third-party substitution. Grades with unresolved A/B labels remain pending. |
| Economic measurement reviewer | Ten distinct price types, non-price macro types, source index bases, aggregate versus individual sales, venue identity and separate FX transformations prevent incompatible measures from being conflated. |
| Data engineer | The public pipeline expands normalized metadata into complete observation records before publication, preserves raw values/units and checks them offline against original responses. Unmapped raw status/unit changes stop refresh. |
| Data-access reviewer | Time-bounded usage reviews distinguish commercial display, non-display and redistribution. Marketplace collection requires both terms and access-policy approval. No new provider licence is approved by catalog import. |
| Product and UX reviewer | English/Persian disclosures explain price meanings, unknown fields, timing and collection gaps. All 87 supplied rows are browsable by country without identifiers or text entry. |
| QA and release reviewer | Regression cases cover official-source priority, wrong variable/unit/type, index-versus-money, FIPE/RDW, marketplace offers, completed sales, delay labels, crypto venues and exact FX precision. Browser tests cover disclosure behavior, full CSV provenance, accessibility and overflow. |

Validation results:

- 1,238 unit tests passed across 96 files, including 52 source-policy cases.
- 48 public browser tests passed on desktop and mobile Chromium, including English and Persian accessibility checks.
- All workspace type checks and the web production build passed.
- Offline data verification passed for 180,656 exact published values, 218 country/world files and 81 original source responses; original unit/status metadata matched.
- Lint, repository-policy verification and `git diff --check` passed.
- Focused policy-module coverage: 89.41% statements, 88.17% branches, 96.15% functions, 90.11% lines.

The [English source panel](evidence/source-policy-en.png) and [Persian mobile panel](evidence/source-policy-fa-mobile.png) were rendered and visually inspected. The mobile page had no horizontal overflow. Price definitions remain collapsed by default; collection gaps are open and visible.

Scope is explicit: this change enforces the new observation metadata on the public WDI snapshot and supplies reusable policy contracts. The 87 catalog entries remain unconnected and unreviewed. Direct national/HICP and price-source adapters still require implementation and permission review; the existing governed database observation schema has not been migrated to this contract. No remote CI run or new release candidate is claimed for this revision.
