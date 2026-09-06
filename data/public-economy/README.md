# Public economic data and scientific evidence

The public website ships a versioned World Development Indicators (WDI) snapshot, separate from the authenticated, governed ingestion/reporting pipeline. It requires no user credentials, API keys, manual identifier entry or database seed. It is not a live feed.

## Included coverage

- 217 provider-listed economies plus the World aggregate; aggregates other than World are excluded.
- 40 annual indicators spanning 2000–2025, with 180,656 non-missing observations at the 6 September 2026 retrieval.
- Prices and money; output and investment; work and livelihoods; trade and external finances; living standards; public services and energy.
- A country need not report every indicator or every year. Null is retained; no interpolation or zero filling is performed.
- 20 theory families from the existing behavioral package, 12 original study summaries and Crossref publication identities. Seven interactive model explorations call the existing kernels; five additional learning scenarios are available in the lab.

## Provenance and interpretation

[World Bank WDI](https://datacatalog.worldbank.org/search/dataset/0037712/world-development-indicators) distributes data from national and international providers. The original provider and definition are attached to each indicator. Labor series explicitly identify ILO modeled estimates. Other source definitions may also involve estimates, national-accounting adjustments or revisions; “published” does not imply directly measured without estimation.

`indicators.json` contains original English/Persian explanations, units and comparability limits. `raw/` retains lossless compressed API responses and a manifest with request URLs, retrieval times, original byte counts and SHA-256 digests. `apps/web/public/economy/` contains 218 per-economy files and a manifest. Decimal strings are preserved by the same lossless decoder used by the governed World Bank connector. The browser checks file digests, revision identity and series structure before use. Git attributes keep browser JSON and the hashed parser source at LF line endings on Windows as well as Unix; automatic CRLF conversion must not change their validated bytes.

Comparisons default to the most recent **common year for each measure**; rows may have different years. A selected explicit year never falls back silently. “Latest reported” deliberately permits different years and displays them. Source-specific price indexes, national poverty lines and local exchange-rate levels are marked as unsuitable for direct country ranking. Country rankings use the same reference year for all economies with data. Charts do not connect missing annual observations.

Historical association uses Pearson correlation over at least eight shared, non-missing annual observations. It is descriptive: trends, serial dependence, structural breaks and common causes can affect it. It is not causal identification. CPI-based purchasing power compares the same country's index across years; it is not a household-specific cost-of-living estimate.

The snapshot contains the provider's **latest revised history**, not publication vintages. Retrieval time and provider dataset update time are distinct from the economic observation year. Do not use it as historical-as-known evidence or turn its descriptive indicators into crisis probabilities.

## Observation metadata and source policy

The [source-selection policy](../../docs/data-source-policy.md) applies to public data and future price adapters. Country tuples, indicator definitions and manifest `observationMetadata` form normalized records; `annualReferenceObservation` expands them into the complete provenance contract and comparison CSV. Raw source values, original units, value types, currency, observation-year precision, retrieval time and unknown revision flags survive that expansion. A source's empty raw unit stays empty; the documented display unit remains separate. Indices never acquire a monetary currency. The offline verifier checks these metadata fields against the raw response before a refreshed snapshot can pass CI.

The 87-row supplied source catalog is recorded separately as pending review. Direct national consumer prices, Eurostat HICP, commodity, vehicle/property, equity and crypto collections are not connected by that catalog. They must not be represented as coverage already available in this WDI snapshot.

## Refresh and verify

From the repository root with the pinned toolchain installed:

```sh
corepack pnpm data:refresh
corepack pnpm research:refresh
corepack pnpm data:verify
corepack pnpm build
```

Data refresh uses the public World Bank API, bounded responses, timeout/retry limits, pagination and identity checks. It fetches all requested sources before replacing files; the manifest is written last. Run the refresh in a development checkout, verify it, then build and deploy that revision together. A running installation should not serve files while a refresh replaces them. CI validates committed data offline; it does not depend on upstream availability or mutate snapshots.

The verifier checks every transformed series against its original response, every browser file hash, counts, identities, highlights, source definitions, and curated citation consistency. Run it before committing refreshed data. The dataset size will change on future refreshes; update the dated coverage statement in documentation after verification.

`research:refresh` retrieves **publication metadata for the curated DOI list**, not arbitrary full texts. `studies.json` contains original bilingual summaries of study design, findings and limitations. Editors must read the original source before adding or changing those summaries. A successful DOI lookup verifies publication identity, not empirical quality. Automatic summaries are not published as reviewed findings. Working-paper links and final publication DOI metadata may refer to different versions; check the cited version before reusing numerical findings.

## Reuse

WDI data is generally offered under [CC BY 4.0 and World Bank data terms](https://data.worldbank.org/summary-terms-of-use), subject to dataset-specific and third-party restrictions. Attribute the World Bank and originating provider; retain indicator notes and check reuse conditions. Repository MIT licensing does not override third-party data terms. Linked scientific articles remain subject to publisher access and reuse terms; no full text or publisher abstract is copied here. [Crossref](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) supplies publication metadata. Original explanatory text and code follow the repository license.
