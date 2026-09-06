# Public economic intelligence API

The Nest API exposes an explicitly public projection at `/api/v1/public`.
It reads the release-distributed country and survey snapshots, checks their
SHA-256 identities and returns source semantics. It has no database dependency
and cannot query governed research tables, private portfolios or study responses.
Existing authenticated controllers retain their access-token guard.

## Endpoints

| Method and path | Input | Output |
| --- | --- | --- |
| `GET /catalog` | None | 217 country names, priority countries, metric definitions, question names, actual source coverage and unavailable market/forecast capabilities |
| `GET /countries/DE` | Country selected from catalog; `WLD` also supported | Eighty dated measurements, raw source semantics, histories, method, evidence hash and missingness |
| `GET /compare?countries=DE,FR&metrics=inflation,growth` | Two to four distinct countries; one to eight distinct metric names | Latest common annual period per metric; explicit incompatibility when definitions or periods cannot be compared |
| `GET /behavioral/DE?measure=expected-inflation-1y` | Covered country and survey metric from the source catalog | Published monthly weighted statistics, observation records, horizon, population and source conditions |
| `GET /questions/household-conditions?country=DE` | Supported question and country | Four relevant evidence-backed measurements; no generated causal claim or investment instruction |
| `GET /risk/DE` | Country | Four separate dimensions with sixteen indicators, consecutive-year differences and unavailable forecast slots |
| `POST /scenarios` | Exactly `family`, `audience`, `severity` | Ten supported scenario families, assumed exposures, arithmetic results and methodological limits |

Supported questions are `household-conditions`, `business-conditions`,
`external-financing` and `public-finances`. An unsupported question returns
`availability: "unavailable"` and `reason: "unsupported_question"`, with the
supported choices. There is no free-form query execution or external LLM call.

Example scenario request:

```json
{"family":"inflation","audience":"household","severity":"moderate"}
```

The result uses a baseline index of 100 and explicitly assumed exposure.
Country observations do not calibrate these scenario assumptions.

## Interpretation and availability

Annual observations and latest monthly survey statistics use the shared
analytical envelope. Raw lexical values remain available next to the numerical
representation. Missing observations do not become zero. A source model estimate
is identified separately from an observation. Freshness remains `unknown` when
an expected publication date has not been established; retrieval today does not
make an older measurement current.

Comparisons align periods separately for each metric. They do not splice sources
or compare local-currency exchange-rate levels, differently based indices, or
other metrics marked non-comparable. Within-country annual differences require
consecutive years; a multi-year gap cannot become a one-year change. Rate
differences are percentage points, not proportional percentage changes.

The version 2 public risk response publishes an indicator report even when all
forecast slots are unavailable. It prioritizes external, banking, sovereign and
monetary conditions at 30/90/180/365-day horizons. It neither changes the existing
version 1 research forecast contract nor claims to complete its persistence
migration. No crisis probability, aggregate score or validated forecast is
manufactured from the presence of indicators.

## Publication and failure behavior

The survey endpoint rechecks the published manifest, expiry and redistribution
permission on every request. Withdrawal or expiry returns no observations and a
`permission_required` reason. Responses use `Cache-Control: no-store`. These
checks apply to this API; removing a previously distributed offline copy or
purging hosted static/CDN snapshots requires the wider publication workflow.

Malformed selections return HTTP 400; unknown country names return 404;
missing/corrupted snapshot files return 503 without filesystem paths or values.
Published country codes are resolved before any country file is read. No request
can supply a URL, filesystem path, SQL query or private evidence identifier.

For deployment, distribute `apps/web/public/economy`,
`apps/web/public/behavioral` and `data/public-economy/indicators.json` in their
repository-relative locations alongside the API. Each server therefore sees the
same approved data revision as the web release. The data refresh workflows still
need a fully atomic publication cutover and scheduled operational monitoring.

Country names support all twelve locales. Metric definitions currently include
English and Persian; clients must declare their language until the complete
terminology translation milestone is finished.

The HTTP tests exercise actual retained WDI/CES data, unavailable coverage,
source withdrawal/expiry, corrupted files, bounded computations and the
anonymous/public versus protected-route boundary. They do not substitute for
the pending authenticated private browser-to-database acceptance tests.
