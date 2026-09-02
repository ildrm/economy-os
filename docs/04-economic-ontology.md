# EconomyOS Economic Ontology Specification

Status: version 0.1 conceptual vocabulary

## Purpose

The ontology supplies stable meanings and relationship constraints across data, models, graphs, search, APIs, and reports. It does not imply that every relationship is causal or that every concept is directly measurable.

## Upper-level classes

| Class | Description | Examples |
| --- | --- | --- |
| Place | Geographic or jurisdictional entity | country, region, city |
| Organization | Coordinated institution | government, central bank, bank, company |
| PopulationGroup | Human segment | income decile, renters, unemployed youth |
| EconomicObject | Unit of exchange/exposure | currency, commodity, asset, bond, equity index |
| Activity | Economic production/exchange | industry, trade flow, lending, employment |
| Indicator | Defined measurement | CPI, GDP growth, unemployment |
| PolicyInstrument | Deliberate intervention | policy rate, reserve requirement, tariff |
| LegalInstrument | Binding rule | law, sanction, regulation |
| Event | Time-bounded occurrence | release, election, default, conflict onset |
| Crisis | Hazard-specific adverse event | FX, banking, sovereign, monetary |
| Concept | Direct/derived/latent/normative construct | household pressure, financial fragility |
| Evidence | Source-backed claim support | observation, document passage, model result |
| Model | Versioned computational method | hazard model, state-space model, simulator |
| Scenario | Declared counterfactual world | oil shock, policy package |

## Canonical entity types

The initial registry supports:

- `country`, `region`, `city`, `jurisdiction`;
- `government`, `central_bank`, `international_institution`, `financial_institution`, `bank`, `company`;
- `industry`, `sector`, `household_group`, `population_segment`;
- `currency`, `commodity`, `asset_class`, `instrument`, `bond`, `equity_index`;
- `indicator`, `series`, `policy`, `law`, `tariff`, `sanction`;
- `event`, `conflict`, `trade_route`, `port`, `supply_chain`;
- `economic_concept`, `crisis`, `model`, `dataset`, `document`, `scenario`.

Each entity has stable ID, type, canonical English label, localized labels/aliases, source identifiers, validity interval, discovery time, jurisdiction, and resolution status.

## Relationship vocabulary

### Structural/exposure

`depends_on`, `exports_to`, `imports_from`, `finances`, `owns`, `owes`, `lends_to`, `borrows_from`, `regulates`, `controls`, `targets`, `exposed_to`, `substitutes_for`, `complements`, `competes_with`.

### Analytical

`associated_with`, `predicts`, `contributes_to`, `affects`, `transmits_to`, `causes`, `invalidates`, `supports`, `contradicts`, `derived_from`, `measured_by`, `modeled_by`.

### Provenance

`published_by`, `retrieved_from`, `contains`, `transformed_into`, `used_by`, `produced`, `supersedes`, `revises`, `scored_by`, `reported_in`.

Inverse relations are declared where meaningful (`imports_from`/`exports_to`, `lends_to`/`borrows_from`). Symmetry is explicit for `associated_with` and never inferred for directional relations.

## Relationship assertion fields

Every assertion carries:

- subject, predicate, object;
- `valid_from`, optional `valid_until`, `discovered_at`, `recorded_at`;
- evidence identifiers and evidence type;
- causal classification;
- direction and strength with unit/scale;
- lag distribution or interval;
- confidence and uncertainty with method;
- regime dependence and geographic scope;
- source/model/expert version;
- status: proposed, reviewed, disputed, accepted, deprecated;
- tenant/visibility and license/entitlement;
- replacement/supersession link.

## Causal classification rules

| Classification | Permitted language | Minimum evidence |
| --- | --- | --- |
| Observed association | is associated/co-moves with | dated comparable observations |
| Predictive relationship | improves prediction of | leakage-safe out-of-sample evaluation |
| Hypothesized causal pathway | may transmit through | theory/evidence citation, unverified label |
| Econometrically estimated causal effect | estimated effect under assumptions | explicit identification design and diagnostics |
| Structurally assumed relationship | model assumes | published equation/parameter/sensitivity |
| Expert-defined relationship | expert assessment | author, rationale, review, validity interval |
| Simulation assumption | scenario assumes | scenario version and uncertainty |

Only the econometrically estimated class may use causal-effect language, and its interface must show identifying assumptions and threats. Causal discovery outputs enter as hypotheses.

## Economic state dimensions

`MacroeconomicState`, `HumanEconomicState`, `FinancialSystemState`, `CrisisState`, `PoliticalInstitutionalState`, `AssetCapitalState`, `MarketState`, `TradeSupplyChainState`, `GlobalDependencyState`, and `ResilienceFragilityState` are compositions, not entity subclasses.

Each state component declares measurement class:

- `direct_observation`;
- `deterministic_derivation`;
- `latent_estimate`;
- `composite_score`;
- `normative_proxy`;
- `risk_estimate`;
- `calibrated_probability`;
- `structural_descriptor`.

## Crisis taxonomy

The initial hazard codes retain FX-CPM semantics:

- `FX`: currency/balance-of-payments crisis;
- `BANK`: systemic banking crisis;
- `SOV`: sovereign distress/default;
- `MON`: monetary/inflation crisis;
- `POL`: major political instability;
- `COUP`: coup/unconstitutional government change;
- `CIV`: internal armed-conflict onset/escalation;
- `WAR`: interstate armed-conflict involvement onset/escalation.

Definitions, onset/recovery, exclusions, severity, label source, vintage, and ambiguity are versioned separately. Overlapping events share a cluster but remain distinct hazards.

## Indicator semantics

An indicator definition includes concept, unit, price/volume basis, nominal/real status, seasonal adjustment, frequency, aggregation, currency, population basis, source methodology, and valid transformations. CPI, HICP, CPIF, PCE, national poverty, international poverty, and similarly named measures are never treated as interchangeable without an explicit mapping.

## Human-economic semantics

Direct observations, proxies, composites, latent estimates, and normative interpretations are always separated. Terms such as justice, exclusion, oppression, mobility, resilience, middle-class pressure, and survival capacity require definition, limitations, and prohibited claims. A proxy cannot infer intent or moral truth.

## Names, localization, and identifiers

English labels define canonical meaning. Localized labels do not create distinct concepts. Aliases carry locale, script, source, validity, and ambiguity. Machine identifiers use stable lowercase tokens and are never translated. Historical country/currency/state changes use validity intervals rather than renaming the same identity retroactively.

## Versioning

Ontology releases use semantic versions. Additive types/relations are minor changes. Meaning, constraints, or causal-language changes are major changes. Deprecated identifiers remain resolvable and link to replacements. Every model and report records the ontology version it used.

## Validation

Automated checks reject invalid subject/predicate/object combinations, overlapping exclusive validity intervals, missing evidence on accepted assertions, causal language without classification, probabilities without model/horizon, and localized aliases without a canonical identity.
