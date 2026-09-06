# Public economic data, scientific evidence and CI review

This review supersedes the data-availability conclusions in the earlier public-experience review. The earlier pages explained concepts but did not deliver the populated economic-information product the user requested. The comparison table rendered unavailable placeholders because it had no public data source; changing its appearance could not solve that product defect.

## Roles applied to the review

| Review role | Question and resulting action |
| --- | --- |
| Product lead | Does an ordinary visitor immediately receive useful information? The overview, country directory, profiles and comparison now open with real published data. |
| Economist / economic statistician | Are units, years, aggregation and comparability correct? Added 40 defined measures across six domains, visible observation years, common-year comparison, and country-specific scale warnings. |
| Behavioral economics researcher | Are scientific claims actually connected to research and computations? Added 12 cited study summaries, 20 theory families and seven interactive explorations backed by existing kernels. |
| Quantitative / algorithm reviewer | Are differences, missingness and derived measures defensible? Tested percentage-point differences, shared-year joins, exact decimal exports, CPI purchasing-power ratios and descriptive annual association; no missing-to-zero substitution. |
| Data engineer / provenance reviewer | Can a displayed number be traced back to its source? Retained 81 original compressed API responses; verify all 180,656 values, 218 browser files and manifest checksums offline. |
| Research editor | Do findings have context? Separated study design, finding, limitation and bibliographic identity. DOI metadata checks publication identity; it does not validate a causal conclusion. |
| UX / information architect | Can people explore without internal IDs? Country names, region/income filters, topic/year selectors, comparison presets and sliders replace text/code entry in public journeys. |
| Visual / interaction designer | Is the information dense but readable? Coordinated comparison, country and science concepts; native data tables, historical charts, visible units and progressive source disclosures. |
| Accessibility / localization reviewer | Can users navigate with keyboard, assistive technology and RTL layouts? Named controls/landmarks, exact-data tables behind charts, explicit slider labels, shared country names and Persian content. |
| Reliability / security reviewer | Are unavailable sources and protected data handled correctly? File integrity checks, bounded fetches, retry controls and source/transport distinctions; the public snapshot does not bypass authenticated report admission. |
| Release / CI engineer | Can builds produce auditable release evidence? Removed generated Next types from tracking, generate types before typecheck, retained clean-tree enforcement and reproduced generation/verification in a clean temporary repository. |
| QA engineer | Do actual user journeys work? Added source-data regression checks and desktop/mobile browser coverage for populated comparisons, explicit missing years, downloads, retries, scientific models and accessible pages. |

## Findings and implementation

### P1: Public comparison had no data source

The previous public comparison was an educational shell and displayed placeholders even for commonly reported indicators. The platform now includes 217 provider-listed economies plus World, 40 annual series for 2000–2025 and 180,656 reported values retrieved on 6 September 2026. It works from the ordinary launchers without API keys, a database seed, authentication or UUID entry.

For example, the default Iran/Germany/United States inflation comparison uses the common observation year 2024 and shows **32.46%, 2.26%, 2.95%**. These correspond to exact source values `32.455871402917`, `2.2564981433876`, and `2.94952520485207`. Other rows use their own most recent common year. Selecting 2025 leaves US inflation explicitly unreported; it does not copy the 2024 value into 2025.

Country profiles expose growth, prices, jobs, investment, sector composition, external accounts, debt, demographics, inequality, poverty, services and energy. They include historical charts, same-country CPI purchasing power, descriptive indicator relationships and contextual explanations. The overview provides real World aggregate measures, audience-specific exploration paths, economic topic links and same-year GDP/population rankings.

### P1: Scientific concepts were not connected to public product flows

The existing behavioral package already contained a theory registry and executable models. The new science page brings these into public use. It provides original bilingual summaries of 12 identified studies, publication metadata fetched by DOI from Crossref, design/finding/limit distinctions, and links to original evidence. The 20 theory families retain their original authors, mechanisms, boundaries and executable/conceptual status.

Seven interactive explorations execute prospect valuation, present-biased utility, inequality aversion, satisficing, probability weighting, disposition rates and logit responses. Model input/output details are inspectable, and presets/sliders do not require typed parameters. Hypothetical parameter choices are never assigned to countries or individuals. This complements the five existing learning-lab scenarios; it does not present generic arithmetic as an empirical economic forecast.

The collection is curated, not a claim to have extracted all scientific literature. `research:refresh` refreshes the publication identities for reviewed entries. Adding scientific findings still requires editorial examination of source methods and limitations.

### P1: Generated Next.js types could dirty the source tree before SBOM generation

The failed remote run is [33971312162](https://github.com/ildrm/economy-os/actions/runs/33971312162), job `101320208657`, at “Generate unsigned candidate SBOM and build manifest”. Public GitHub metadata confirmed the failed step; full job logs required authentication and were unavailable in this session.

A reproducible defect was found: `apps/web/next-env.d.ts` was tracked with a development route-types path, while `next build` rewrites it to the production route-types path. `release-evidence.mjs` correctly refuses a dirty source tree. The generated file is now ignored and removed from the index, and web typecheck runs `next typegen` before TypeScript. The release contract check prevents reintroducing tracking. The error now identifies changed paths to make future diagnosis straightforward. The clean-source check was not bypassed or disabled. Git attributes also preserve LF bytes for the hash-checked browser JSON and parser source on Windows, preventing automatic CRLF conversion from invalidating their digests.

A separate temporary Git repository containing the changes installed pinned dependencies, completed the full production build and generated unsigned evidence with a clean tree: **872 build files and 426 production components**. These local checks validate the identified defect and fix; they do not claim that the remote GitHub run has been rerun or that inaccessible logs have been inspected.

### P2: Public/server country naming could disagree

Browser and server ICU versions produced different country names and sort orders, causing hydration recovery. Localized names and order are now generated once into the versioned manifest for all 12 navigation locales. Unknown provider codes fall back to the provider's human-readable name, such as Channel Islands. Neither screen readers nor ordinary visitors need to interpret provider codes.

### P2: Provenance identity must change when the parser artifact changes

Exposing the existing lossless World Bank decoder changed the source artifact. The parser identity was advanced to `1.0.1` with its exact new code checksum; the ingestion provenance regression test enforces that binding. Decoding behavior is unchanged. Existing historical evidence retains its recorded parser identity; newly authorized ingestion must use the current installed identity.

## Data and research boundaries

- This is a dated, latest-revised WDI snapshot, including source model estimates. It is not a live feed or a historical publication-vintage archive.
- Provider coverage is uneven. Counts do not promise every country/indicator/year exists. Fetch/integrity failure has a retry state distinct from missing economic evidence.
- Direct country ranking is unsuitable for national poverty lines, local currency exchange-rate levels and source-specific CPI bases; the interface identifies these limits.
- Correlation uses at least eight shared annual observations and is descriptive, without interpolation or causal claims. It is affected by trends, serial dependence, structural changes and omitted factors.
- The protected report store, calibrated crisis forecasts, causal identification and historical-as-known analysis still require admitted datasets and appropriate validated models. The public reference snapshot is not silently admitted into that store.
- [World Bank data terms](https://data.worldbank.org/summary-terms-of-use), originating-provider restrictions and publisher reuse conditions apply separately from the repository's MIT code license.

See the [data guide](../../data/public-economy/README.md) for refresh commands, provenance architecture and reuse conditions.

## Validation and visual evidence

- Full workspace production build and typecheck passed. The final web rebuild also passed.
- 1,186 unit tests in 95 files passed. Coverage gates passed: statements 91.58%, branches 84.51%, functions 97.79%, lines 93.36%.
- All 158 desktop/mobile browser tests passed, including existing protected-report workflows and 46 public-data/science tests. The final wording/localization changes passed a further targeted 46-test run. English/Persian public pages passed axe checks with no page overflow; the public tests also check browser runtime errors.
- Offline public-data provenance verification, repository policy checks, lint and release automation contracts passed.
- Clean temporary checkout: full production build, unsigned release evidence generation and verification passed without the dirty-tree override. Output: 872 build files, 426 production components; candidate digest `sha256:acf532436bb450ba65819acbc11260615f34eb57063ec6c406e9786359c2ce16`. It is local unsigned candidate evidence, not a published/signed release or a rerun of GitHub CI.
- The existing launchers remain available: `run.bat` and executable `run.sh`, both delegating to the shared pinned-toolchain startup script. A simulated Windows Git checkout with `core.autocrlf=true` preserved exact browser-data/parser bytes and launcher line endings. Native Windows process execution remains untested on this macOS host.

### Visual fidelity ledger

Image-generation concepts were used for the full comparison, country and scientific evidence surfaces. Browser/IAB and Chrome automation surfaces were unavailable in this session; local Playwright Chromium was used as the fallback. The concepts and the latest production renders were explicitly inspected with `view_image`.

| Surface | Concept | Latest production render | Viewport |
| --- | --- | --- | --- |
| Comparison | [Concept](evidence/data-comparison-concept.png) | [Viewport](evidence/data-comparison-viewport.png), [full page](evidence/data-comparison-desktop.png), [Persian mobile](evidence/data-comparison-mobile-fa.png) | Native 1373 × 1145; mobile 390 × 844 |
| Country | [Concept](evidence/data-country-concept.png) | [Viewport](evidence/data-country-viewport.png), [full page](evidence/data-country-desktop.png), [Persian mobile](evidence/data-country-mobile-fa.png) | Native 1402 × 1122; mobile 390 × 844 |
| Science | [Concept](evidence/data-science-concept.png) | [Viewport](evidence/data-science-viewport.png), [full page](evidence/data-science-desktop.png), [Persian mobile](evidence/data-science-mobile-fa.png) | Native 1402 × 1122; mobile 390 × 844 |
| Overview | Shared existing visual system | [Full page](evidence/data-overview-desktop.png) | 1536 × 1024 |

The implementation was verified against the concepts for the following concrete points:

1. **Information hierarchy and density:** country/year controls precede a populated comparison table; country facts precede trend/interpretation panels; scientific findings sit beside a working model. Table padding was tightened, year labels moved alongside numbers and theory cards changed to a native table to improve scanning.
2. **Typography:** readable labels, values, source text and headings retain the project’s existing typeface and hierarchy. Persian headings and RTL content are checked separately. Source disclosures remain readable without requiring technical input.
3. **Palette and containers:** white data surfaces, subtle gray borders, a light neutral workspace and navy emphasis follow the concepts. The science model uses the existing navy example panel. There are no decorative photos or generated-image UI layers.
4. **Real content and copy:** primary page titles/subtitles match the conceptual direction. Intentional additions are explicit year/source labels, named form controls, comparison presets, retry/export behavior, study design/limitations and model inputs. Counts and calculations use actual data and kernels.
5. **Charts and calculations:** real SVG series replace conceptual illustrative plots; gaps are not bridged. The final default comparison can show 2025 on measures with shared 2025 data, while inflation uses 2024. Conceptual numeric labels were not copied where they disagreed with verified data. The loss model shows raw kernel utility units +100/−160, not the mockup’s normalized +1/−1.6.
6. **Navigation and assets:** the existing text-first sidebar and EconomyOS mark are retained intentionally, rather than introducing concept-only flags and decorative navigation icons. Native select controls retain labels and keyboard interaction.
7. **Responsive behavior:** multi-column panels stack on narrow screens; wide data tables scroll within their own container. Latest production captures report zero runtime errors and no horizontal page overflow. Source text and scientific controls remain usable in Persian.

The visual system and primary interaction structure were faithfully verified against the concepts, with the documented data-accuracy, accessibility and added-functionality deviations. The pages are intentionally longer than the concept images because they expose full definitions, all 20 theory families and the added analytical controls. No known clipping, broken primary controls or page overflow remains.

[Machine-readable render checks](evidence/data-render-checks.json) record final capture dimensions and errors. Above-the-fold copy changes are the intentional functional/context additions described in points 4–6; no unsupported economic claims from image concepts were carried into the application.
