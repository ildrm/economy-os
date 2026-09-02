import { canonicalJson, digestJson } from "@economyos/data-admission";

import type {
  CompositeComponentParserIdentity,
  CompositeStateModel,
  CompositeStateModelArtifactIdentity,
  EconomicStateDimension,
  EconomicStateFrequency,
  EconomicStateSeasonalAdjustment,
} from "./index.js";

const DECIMAL = /^(?<sign>-?)(?<integer>0|[1-9]\d*)(?:\.(?<fraction>\d{1,18}))?$/;
const INDICATOR_CODE = /^[A-Z0-9]+(?:\.[A-Z0-9]+){2,7}$/;
const KEY = /^[a-z][a-z0-9_.-]{2,127}$/;

export interface ResearchBaselineIndicatorContract {
  readonly key: string;
  readonly conceptKey: string;
  readonly provider: "world_bank_wdi";
  readonly providerSourceId: 2;
  readonly indicatorCode: string;
  readonly label: string;
  readonly measurementClass: "observation" | "proxy" | "estimated";
  readonly unitCode: string;
  readonly frequency: EconomicStateFrequency;
  readonly seasonalAdjustment: EconomicStateSeasonalAdjustment;
  readonly transform: "identity_annual_value";
  readonly imputation: "none";
  readonly weight: string;
  readonly polarity: "positive" | "negative";
  readonly lowerBound: string;
  readonly upperBound: string;
  readonly limitations: readonly string[];
}

export interface ResearchBaselineDefinition {
  readonly schemaVersion: 1;
  readonly key: string;
  readonly version: "1.0.0";
  readonly dimension: EconomicStateDimension;
  readonly status: "accepted_for_research_baseline";
  readonly outputSemantics: "descriptive_composite_index_0_100";
  readonly minimumCoverage: "0.6";
  readonly missingnessPolicy: "explicit_abstain_no_imputation";
  readonly providerCatalog: Readonly<{
    name: "World Development Indicators";
    sourceId: 2;
    license: "CC-BY-4.0";
    catalogUri: "https://datacatalog.worldbank.org/search/dataset/0037712";
  }>;
  readonly components: readonly ResearchBaselineIndicatorContract[];
  readonly methodologyReview: Readonly<{
    scope: "semantic_and_formula_review";
    outcome: "accepted_for_transparent_research_use";
    independence: "repository_review_not_independent_validation";
    reviewedAt: "2026-09-01";
    requiredSensitivity: "leave_one_out_and_weight_perturbation";
    prohibitedUses: readonly string[];
    limitations: readonly string[];
  }>;
  readonly definitionSha256: string;
}

export interface ResearchBaselineSeriesBinding {
  readonly componentKey: string;
  readonly indicatorCode: string;
  readonly conceptId: string;
  readonly seriesId: string;
  readonly parser: Readonly<CompositeComponentParserIdentity>;
}

export interface ResearchBaselineModelBinding {
  readonly modelId: string;
  readonly artifact: Readonly<CompositeStateModelArtifactIdentity>;
  readonly series: readonly ResearchBaselineSeriesBinding[];
}

interface Fraction {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

function fraction(numerator: bigint, denominator = 1n): Fraction {
  if (denominator === 0n) throw new TypeError("Research baseline decimal division by zero");
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = gcd(numerator, denominator);
  return {
    numerator: (numerator / divisor) * sign,
    denominator: (denominator / divisor) * sign,
  };
}

function decimal(value: string, field: string): Fraction {
  const match = DECIMAL.exec(value);
  if (!match?.groups) throw new TypeError(`${field} must be a canonical decimal`);
  const digits = `${match.groups.integer}${match.groups.fraction ?? ""}`;
  return fraction(
    BigInt(digits) * (match.groups.sign === "-" ? -1n : 1n),
    10n ** BigInt(match.groups.fraction?.length ?? 0),
  );
}

function add(left: Fraction, right: Fraction): Fraction {
  return fraction(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function compare(left: Fraction, right: Fraction): number {
  const value = left.numerator * right.denominator - right.numerator * left.denominator;
  return value < 0n ? -1 : value > 0n ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

const COMMON_REVIEW = {
  scope: "semantic_and_formula_review",
  outcome: "accepted_for_transparent_research_use",
  independence: "repository_review_not_independent_validation",
  reviewedAt: "2026-09-01",
  requiredSensitivity: "leave_one_out_and_weight_perturbation",
  prohibitedUses: [
    "forecasting or probability claims",
    "investment, credit, eligibility, or policy decisions",
    "cross-country welfare or institutional ranking",
    "causal, resilience, prosperity, or safety claims",
  ],
  limitations: [
    "Annual WDI releases have heterogeneous lags and revision practices.",
    "Min-max bounds and monotonic polarities are transparent research assumptions, not natural laws.",
    "Source-count coverage does not establish statistical or institutional independence.",
    "A governed deployment must bind exact admitted series, releases, parser identity, and PIT snapshot.",
  ],
} as const;

const PROVIDER_CATALOG = {
  name: "World Development Indicators",
  sourceId: 2,
  license: "CC-BY-4.0",
  catalogUri: "https://datacatalog.worldbank.org/search/dataset/0037712",
} as const;

function indicator(
  value: Omit<
    ResearchBaselineIndicatorContract,
    | "provider"
    | "providerSourceId"
    | "frequency"
    | "seasonalAdjustment"
    | "transform"
    | "imputation"
  >,
): ResearchBaselineIndicatorContract {
  return {
    ...value,
    provider: "world_bank_wdi",
    providerSourceId: 2,
    frequency: "annual",
    seasonalAdjustment: "not_applicable",
    transform: "identity_annual_value",
    imputation: "none",
  };
}

function baseline(
  value: Pick<ResearchBaselineDefinition, "key" | "dimension" | "components">,
): ResearchBaselineDefinition {
  const body = {
    schemaVersion: 1 as const,
    key: value.key,
    version: "1.0.0" as const,
    dimension: value.dimension,
    status: "accepted_for_research_baseline" as const,
    outputSemantics: "descriptive_composite_index_0_100" as const,
    minimumCoverage: "0.6" as const,
    missingnessPolicy: "explicit_abstain_no_imputation" as const,
    providerCatalog: PROVIDER_CATALOG,
    components: value.components,
    methodologyReview: COMMON_REVIEW,
  };
  return deepFreeze(
    JSON.parse(
      canonicalJson({ ...body, definitionSha256: digestJson(body) }),
    ) as ResearchBaselineDefinition,
  );
}

/**
 * Provider-level Phase 3 definitions. Persisted models must additionally bind
 * every component to an admitted immutable series/parser contract. These
 * definitions never authorize a dataset or substitute for that binding.
 */
export const PHASE3_RESEARCH_BASELINES: readonly ResearchBaselineDefinition[] = Object.freeze([
  baseline({
    key: "phase3.macroeconomic-balance",
    dimension: "macroeconomic",
    components: [
      indicator({
        key: "gdp-growth",
        conceptKey: "macro.gdp.real_growth.annual",
        indicatorCode: "NY.GDP.MKTP.KD.ZG",
        label: "GDP growth (annual %)",
        measurementClass: "observation",
        unitCode: "percent_per_year",
        weight: "0.4",
        polarity: "positive",
        lowerBound: "-15",
        upperBound: "15",
        limitations: ["Higher growth is not a welfare measure and may be unsustainable."],
      }),
      indicator({
        key: "consumer-inflation",
        conceptKey: "macro.prices.consumer_inflation.annual",
        indicatorCode: "FP.CPI.TOTL.ZG",
        label: "Inflation, consumer prices (annual %)",
        measurementClass: "observation",
        unitCode: "percent_per_year",
        weight: "0.3",
        polarity: "negative",
        lowerBound: "-5",
        upperBound: "30",
        limitations: [
          "Monotonic polarity does not model deflation costs or target-specific inflation.",
        ],
      }),
      indicator({
        key: "unemployment",
        conceptKey: "labor.unemployment.total_share",
        indicatorCode: "SL.UEM.TOTL.ZS",
        label: "Unemployment, total (% of total labor force) (modeled ILO estimate)",
        measurementClass: "estimated",
        unitCode: "percent_of_labor_force",
        weight: "0.3",
        polarity: "negative",
        lowerBound: "0",
        upperBound: "30",
        limitations: [
          "This is a modeled ILO estimate; national labor definitions and informal-sector coverage differ.",
        ],
      }),
    ],
  }),
  baseline({
    key: "phase3.human-economic-pressure",
    dimension: "human_economic",
    components: [
      indicator({
        key: "gdp-per-capita-growth",
        conceptKey: "human.income.real_per_capita_growth",
        indicatorCode: "NY.GDP.PCAP.KD.ZG",
        label: "GDP per capita growth (annual %)",
        measurementClass: "proxy",
        unitCode: "percent_per_year",
        weight: "0.4",
        polarity: "positive",
        lowerBound: "-15",
        upperBound: "15",
        limitations: [
          "National mean output growth is only a proxy for household income experience.",
        ],
      }),
      indicator({
        key: "unemployment",
        conceptKey: "labor.unemployment.total_share",
        indicatorCode: "SL.UEM.TOTL.ZS",
        label: "Unemployment, total (% of total labor force) (modeled ILO estimate)",
        measurementClass: "estimated",
        unitCode: "percent_of_labor_force",
        weight: "0.3",
        polarity: "negative",
        lowerBound: "0",
        upperBound: "30",
        limitations: ["This modeled estimate omits underemployment, informality, and job quality."],
      }),
      indicator({
        key: "income-inequality",
        conceptKey: "distribution.income.gini",
        indicatorCode: "SI.POV.GINI",
        label: "Gini index",
        measurementClass: "observation",
        unitCode: "gini_index_points",
        weight: "0.3",
        polarity: "negative",
        lowerBound: "20",
        upperBound: "70",
        limitations: [
          "Survey years, concepts, and comparability differ and observations are sparse.",
        ],
      }),
    ],
  }),
  baseline({
    key: "phase3.financial-system-balance",
    dimension: "financial_system",
    components: [
      indicator({
        key: "bank-capital-ratio",
        conceptKey: "financial.banks.capital_to_assets",
        indicatorCode: "FB.BNK.CAPA.ZS",
        label: "Bank capital to assets ratio (%)",
        measurementClass: "observation",
        unitCode: "percent",
        weight: "0.35",
        polarity: "positive",
        lowerBound: "0",
        upperBound: "25",
        limitations: [
          "Accounting capital is not equivalent to loss-absorbing capacity under stress.",
        ],
      }),
      indicator({
        key: "nonperforming-loans",
        conceptKey: "financial.banks.nonperforming_loans_share",
        indicatorCode: "FB.AST.NPER.ZS",
        label: "Bank nonperforming loans to total gross loans (%)",
        measurementClass: "observation",
        unitCode: "percent",
        weight: "0.35",
        polarity: "negative",
        lowerBound: "0",
        upperBound: "30",
        limitations: ["Classification, provisioning, forbearance, and reporting practices differ."],
      }),
      indicator({
        key: "private-credit-depth",
        conceptKey: "financial.credit.private_sector_to_gdp",
        indicatorCode: "FS.AST.PRVT.GD.ZS",
        label: "Domestic credit to private sector (% of GDP)",
        measurementClass: "proxy",
        unitCode: "percent_of_gdp",
        weight: "0.3",
        polarity: "positive",
        lowerBound: "0",
        upperBound: "250",
        limitations: [
          "Credit depth can indicate access or leverage; monotonic benefit is not universal.",
        ],
      }),
    ],
  }),
  baseline({
    key: "phase3.market-depth-momentum",
    dimension: "market",
    components: [
      indicator({
        key: "market-capitalization",
        conceptKey: "market.equity.capitalization_to_gdp",
        indicatorCode: "CM.MKT.LCAP.GD.ZS",
        label: "Market capitalization of listed domestic companies (% of GDP)",
        measurementClass: "observation",
        unitCode: "percent_of_gdp",
        weight: "0.35",
        polarity: "positive",
        lowerBound: "0",
        upperBound: "300",
        limitations: ["Market size is not valuation, return, liquidity, or household prosperity."],
      }),
      indicator({
        key: "market-turnover",
        conceptKey: "market.equity.turnover_ratio",
        indicatorCode: "CM.MKT.TRNR",
        label: "Stocks traded, turnover ratio of domestic shares (%)",
        measurementClass: "observation",
        unitCode: "percent",
        weight: "0.35",
        polarity: "positive",
        lowerBound: "0",
        upperBound: "300",
        limitations: ["Turnover is an incomplete proxy for executable liquidity and access."],
      }),
      indicator({
        key: "equity-index-change",
        conceptKey: "market.equity.index_annual_change",
        indicatorCode: "CM.MKT.INDX.ZG",
        label: "S&P Global Equity Indices (annual % change)",
        measurementClass: "observation",
        unitCode: "percent_per_year",
        weight: "0.3",
        polarity: "positive",
        lowerBound: "-80",
        upperBound: "150",
        limitations: [
          "Annual local-market performance can be volatile and is not a forward return.",
        ],
      }),
    ],
  }),
  baseline({
    key: "phase3.regime-balance",
    dimension: "regime",
    components: [
      indicator({
        key: "growth",
        conceptKey: "regime.growth.annual",
        indicatorCode: "NY.GDP.MKTP.KD.ZG",
        label: "GDP growth (annual %)",
        measurementClass: "observation",
        unitCode: "percent_per_year",
        weight: "0.4",
        polarity: "positive",
        lowerBound: "-15",
        upperBound: "15",
        limitations: ["Annual growth cannot detect intra-year turning points."],
      }),
      indicator({
        key: "inflation",
        conceptKey: "regime.inflation.annual",
        indicatorCode: "FP.CPI.TOTL.ZG",
        label: "Inflation, consumer prices (annual %)",
        measurementClass: "observation",
        unitCode: "percent_per_year",
        weight: "0.3",
        polarity: "negative",
        lowerBound: "-5",
        upperBound: "30",
        limitations: ["This is a descriptive balance input, not a regime probability."],
      }),
      indicator({
        key: "current-account-balance",
        conceptKey: "regime.external.current_account_to_gdp",
        indicatorCode: "BN.CAB.XOKA.GD.ZS",
        label: "Current account balance (% of GDP)",
        measurementClass: "observation",
        unitCode: "percent_of_gdp",
        weight: "0.3",
        polarity: "positive",
        lowerBound: "-30",
        upperBound: "30",
        limitations: [
          "Surpluses and deficits have country-specific causes and welfare implications.",
        ],
      }),
    ],
  }),
]);

export function validateResearchBaselineRegistry(
  definitions: readonly ResearchBaselineDefinition[] = PHASE3_RESEARCH_BASELINES,
): string {
  const expectedDimensions: readonly EconomicStateDimension[] = [
    "macroeconomic",
    "human_economic",
    "financial_system",
    "market",
    "regime",
  ];
  if (!Array.isArray(definitions) || definitions.length !== expectedDimensions.length) {
    throw new TypeError("Research baseline registry requires exactly five dimensions");
  }
  const modelKeys = new Set<string>();
  for (const [index, definition] of definitions.entries()) {
    if (definition.dimension !== expectedDimensions[index]) {
      throw new TypeError("Research baseline registry dimensions must use canonical order");
    }
    if (!KEY.test(definition.key) || modelKeys.has(definition.key)) {
      throw new TypeError("Research baseline keys must be canonical and unique");
    }
    modelKeys.add(definition.key);
    if (
      definition.schemaVersion !== 1 ||
      definition.version !== "1.0.0" ||
      definition.status !== "accepted_for_research_baseline" ||
      definition.minimumCoverage !== "0.6" ||
      definition.missingnessPolicy !== "explicit_abstain_no_imputation" ||
      definition.providerCatalog.sourceId !== 2 ||
      definition.providerCatalog.license !== "CC-BY-4.0"
    ) {
      throw new TypeError(`Research baseline ${definition.key} has an invalid governance contract`);
    }
    if (definition.components.length < 2 || definition.components.length > 12) {
      throw new TypeError(`Research baseline ${definition.key} has an invalid component count`);
    }
    let totalWeight = fraction(0n);
    const componentKeys = new Set<string>();
    for (const component of definition.components) {
      if (!KEY.test(component.key) || componentKeys.has(component.key)) {
        throw new TypeError(`Research baseline ${definition.key} component keys are invalid`);
      }
      componentKeys.add(component.key);
      if (
        component.provider !== "world_bank_wdi" ||
        component.providerSourceId !== 2 ||
        !INDICATOR_CODE.test(component.indicatorCode) ||
        component.imputation !== "none" ||
        component.frequency !== "annual"
      ) {
        throw new TypeError(`Research baseline ${definition.key} has an invalid provider contract`);
      }
      const weight = decimal(component.weight, `${definition.key}.${component.key}.weight`);
      const lower = decimal(component.lowerBound, `${definition.key}.${component.key}.lowerBound`);
      const upper = decimal(component.upperBound, `${definition.key}.${component.key}.upperBound`);
      if (compare(weight, fraction(0n)) <= 0 || compare(lower, upper) >= 0) {
        throw new TypeError(`Research baseline ${definition.key} has invalid weights or bounds`);
      }
      totalWeight = add(totalWeight, weight);
    }
    if (compare(totalWeight, fraction(1n)) !== 0) {
      throw new TypeError(`Research baseline ${definition.key} weights must sum exactly to one`);
    }
    const { definitionSha256, ...body } = definition;
    if (digestJson(body) !== definitionSha256) {
      throw new TypeError(`Research baseline ${definition.key} digest does not match its content`);
    }
  }
  return digestJson(definitions);
}

export const PHASE3_RESEARCH_BASELINE_REGISTRY_SHA256 =
  validateResearchBaselineRegistry(PHASE3_RESEARCH_BASELINES);

export function bindResearchBaselineModel(
  definition: ResearchBaselineDefinition,
  binding: ResearchBaselineModelBinding,
): CompositeStateModel {
  validateResearchBaselineRegistry(
    PHASE3_RESEARCH_BASELINES.map((candidate) =>
      candidate.dimension === definition.dimension ? definition : candidate,
    ),
  );
  if (binding.artifact.configurationSha256 !== definition.definitionSha256) {
    throw new TypeError("Research baseline artifact must bind the exact definition digest");
  }
  if (
    binding.artifact.algorithmKey !== "economic-state.weighted-minmax" ||
    binding.artifact.algorithmVersion !== "1.0.0" ||
    binding.artifact.lifecycleStatus !== "research"
  ) {
    throw new TypeError("Research baseline artifact must use the reviewed research algorithm");
  }
  if (binding.series.length !== definition.components.length) {
    throw new TypeError("Research baseline requires one governed series binding per component");
  }
  const bindingByKey = new Map<string, ResearchBaselineSeriesBinding>();
  for (const series of binding.series) {
    if (bindingByKey.has(series.componentKey)) {
      throw new TypeError("Research baseline series bindings must be unique");
    }
    bindingByKey.set(series.componentKey, series);
  }
  const components = definition.components.map((component) => {
    const series = bindingByKey.get(component.key);
    if (!series || series.indicatorCode !== component.indicatorCode) {
      throw new TypeError(`Research baseline ${component.key} has no exact indicator binding`);
    }
    const featureContract = {
      schemaVersion: 1,
      seriesId: series.seriesId,
      conceptId: series.conceptId,
      unitCode: component.unitCode,
      frequency: component.frequency,
      seasonalAdjustment: component.seasonalAdjustment,
      parser: series.parser,
    } as const;
    return {
      key: component.key,
      conceptId: series.conceptId,
      seriesId: series.seriesId,
      unitCode: component.unitCode,
      frequency: component.frequency,
      seasonalAdjustment: component.seasonalAdjustment,
      parser: series.parser,
      featureContractSha256: digestJson(featureContract),
      weight: component.weight,
      polarity: component.polarity,
      lowerBound: component.lowerBound,
      upperBound: component.upperBound,
    };
  });
  return deepFreeze({
    schemaVersion: 2,
    id: binding.modelId,
    key: definition.key,
    version: definition.version,
    dimension: definition.dimension,
    minimumCoverage: definition.minimumCoverage,
    artifact: binding.artifact,
    components,
  });
}
