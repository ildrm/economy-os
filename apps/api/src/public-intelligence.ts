import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  consecutiveAnnualChange,
  RISK_DIMENSIONS,
  runDecisionScenario,
  type ScenarioAudience,
  type ScenarioFamily,
  type Severity,
} from "@economyos/behavioral-economics/decision-support";
import {
  type AnalyticalResult,
  type AnnualReferenceDefinition,
  type AnnualReferenceSource,
  annualReferenceObservation,
  assertAnalyticalResult,
  assertObservationRecord,
  assertSourceUse,
  type ObservationRecord,
  type SourceProfile,
} from "@economyos/contracts";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

type Point = readonly [number, string | null];
interface Metric extends AnnualReferenceDefinition {
  readonly id: string;
  readonly en: string;
  readonly fa: string;
  readonly descriptionEn: string;
  readonly descriptionFa: string;
  readonly boundaryEn: string;
  readonly boundaryFa: string;
  readonly countryComparable: boolean;
  readonly sourceEstimate: boolean;
}
interface Country {
  readonly code: string;
  readonly name: string;
  readonly iso3: string;
  readonly region: string;
  readonly income: string;
}
interface FileIdentity {
  readonly sha256: string;
  readonly bytes: number;
}
interface AnnualManifest {
  readonly schemaVersion: 1;
  readonly retrievedAt: string;
  readonly observations: number;
  readonly startYear: number;
  readonly endYear: number;
  readonly countries: readonly Country[];
  readonly countryNames: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly files: Readonly<Record<string, FileIdentity>>;
  readonly indicators: Readonly<
    Record<string, AnnualReferenceSource & { readonly sha256: string }>
  >;
}
interface CountryData {
  readonly schemaVersion: 1;
  readonly countryCode: string;
  readonly retrievedAt: string;
  readonly series: Readonly<Record<string, readonly Point[]>>;
}
interface SurveyManifest {
  readonly publicationStatus: string;
  readonly source: SourceProfile;
  readonly population: string;
  readonly conditions: readonly string[];
  readonly metrics: readonly {
    readonly id: string;
    readonly horizonMonths: number | null;
    readonly unit: string;
  }[];
  readonly countries: Readonly<
    Record<
      string,
      FileIdentity & {
        readonly observations: number;
        readonly start: string;
        readonly end: string;
        readonly retrievedAt: string;
        readonly raw: { readonly sha256: string };
      }
    >
  >;
}

const PRIORITY_COUNTRIES = [
  "AM",
  "AZ",
  "BE",
  "BR",
  "CA",
  "CN",
  "FI",
  "FR",
  "DE",
  "IR",
  "IT",
  "JP",
  "NL",
  "ES",
  "SE",
  "TR",
  "GB",
  "US",
];
export const PUBLIC_QUESTIONS = {
  "household-conditions": [
    "inflation",
    "consumption-growth",
    "unemployment",
    "vulnerable-employment",
  ],
  "business-conditions": ["growth", "lending-rate", "private-credit", "fuel-imports"],
  "external-financing": [
    "current-account",
    "reserves",
    "short-debt-reserves",
    "external-debt-income",
  ],
  "public-finances": ["government-debt", "fiscal-balance", "interest-revenue", "tax-revenue"],
} as const;

function invalid(): never {
  throw new BadRequestException({ code: "INVALID_PUBLIC_QUERY" });
}
function unavailable(): never {
  throw new ServiceUnavailableException({ code: "PUBLIC_SNAPSHOT_UNAVAILABLE" });
}
function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Only release-distributed public projections are read here. This service has no database dependency. */
@Injectable()
export class PublicIntelligenceService {
  // Fixed path, independent of request input; tests may point to a disposable fixture tree.
  private root = new URL("../../../", import.meta.url);
  private now = () => new Date();

  static forTesting(root: URL, clock = () => new Date()): PublicIntelligenceService {
    const service = new PublicIntelligenceService();
    service.root = root;
    service.now = clock;
    return service;
  }

  private async json<T>(path: string, identity?: FileIdentity): Promise<T> {
    try {
      const bytes = await readFile(new URL(path, this.root));
      if (
        bytes.length > 4_000_000 ||
        (identity && (bytes.length !== identity.bytes || hash(bytes) !== identity.sha256))
      )
        unavailable();
      return JSON.parse(bytes.toString("utf8")) as T;
    } catch {
      return unavailable();
    }
  }

  private async annual() {
    const [manifest, metrics] = await Promise.all([
      this.json<AnnualManifest>("apps/web/public/economy/manifest.json"),
      this.json<readonly Metric[]>("data/public-economy/indicators.json"),
    ]);
    if (
      manifest.schemaVersion !== 1 ||
      metrics.length < 80 ||
      metrics.length > 500 ||
      new Set(metrics.map((metric) => metric.id)).size !== metrics.length ||
      !manifest.countries.length
    )
      unavailable();
    return { manifest, metrics };
  }

  private countryCode(raw: unknown, manifest: AnnualManifest): Country {
    if (typeof raw !== "string" || !/^(?:[A-Z]{2}|WLD)$/.test(raw)) invalid();
    const country = manifest.countries.find((entry) => entry.code === raw);
    if (raw === "WLD")
      return { code: raw, name: "World", iso3: "WLD", region: "World", income: "All" };
    if (!country) throw new NotFoundException({ code: "COUNTRY_NOT_SUPPORTED" });
    return country;
  }

  private async countryData(
    country: Country,
    manifest: AnnualManifest,
    metrics: readonly Metric[],
  ) {
    const identity = manifest.files[country.code];
    if (!identity) unavailable();
    const data = await this.json<CountryData>(
      `apps/web/public/economy/${country.code}.json`,
      identity,
    );
    if (
      data.schemaVersion !== 1 ||
      data.countryCode !== country.code ||
      data.retrievedAt !== manifest.retrievedAt
    )
      unavailable();
    for (const metric of metrics) {
      const points = data.series?.[metric.id];
      if (!Array.isArray(points) || points.length > manifest.endYear - manifest.startYear + 1)
        unavailable();
      let previous = manifest.startYear - 1;
      for (const point of points) {
        if (
          !Array.isArray(point) ||
          point.length !== 2 ||
          !Number.isInteger(point[0]) ||
          point[0] <= previous ||
          point[0] > manifest.endYear ||
          (point[1] !== null &&
            (typeof point[1] !== "string" ||
              !point[1].trim() ||
              !Number.isFinite(Number(point[1]))))
        )
          unavailable();
        previous = point[0];
      }
    }
    return data;
  }

  private measurement(
    country: Country,
    metric: Metric,
    data: CountryData,
    manifest: AnnualManifest,
    period?: number,
    reason?: "incompatible_measurements",
  ) {
    const points = data.series[metric.id] ?? [];
    const selected = reason
      ? null
      : [...points]
          .reverse()
          .find(([year, value]) => value !== null && (period === undefined || year === period));
    const source = manifest.indicators[metric.id];
    if (!source) unavailable();
    const observation = selected
      ? annualReferenceObservation(metric, source, country, selected)
      : null;
    const year = selected?.[0];
    const result: AnalyticalResult = {
      schemaVersion: 1,
      id: `${country.code}:${metric.id}:${year ?? "unavailable"}`,
      evidenceType: metric.sourceEstimate ? "model_estimate" : "observation",
      entity: country.code,
      period: year === undefined ? null : { start: String(year), end: String(year) },
      horizonMonths: null,
      method: { id: "published-annual-measurement", version: "1.0.0" },
      evidence: observation
        ? [
            {
              datasetId: "world-bank-wdi",
              snapshotSha256: manifest.files[country.code]?.sha256 ?? "",
              sourceUrl: observation.source_url,
              observationIds: [`${country.code}:${metric.id}:${year}`],
            },
          ]
        : [],
      explanationKey: "published_annual_measurement",
      limitationKeys: [
        "latest_revised_history",
        "national_definitions_may_differ",
        ...(metric.sourceEstimate ? ["source_model_estimate"] : []),
      ],
      freshness: { retrievedAt: source.retrievedAt, expectedNextRelease: null, state: "unknown" },
      coverage: {
        observations: selected ? 1 : 0,
        requiredObservations: 1,
        includedEntities: selected ? [country.code] : [],
        excludedEntities: selected ? [] : [country.code],
        scope: selected ? "complete" : "subset",
      },
      ...(selected && selected[1] !== null
        ? {
            availability: "available" as const,
            value: Number(selected[1]),
            unit: metric.unit,
            uncertainty: null,
          }
        : {
            availability: "unavailable" as const,
            value: null,
            unit: metric.unit,
            uncertainty: null,
            reason: reason ?? "no_observations",
          }),
    };
    assertAnalyticalResult(result);
    return { metric, result, observation };
  }

  async catalog() {
    const { manifest, metrics } = await this.annual();
    const survey = await this.json<SurveyManifest>("apps/web/public/behavioral/manifest.json");
    let surveyAccess = survey.publicationStatus === "published";
    try {
      assertSourceUse(survey.source, this.now().toISOString(), "redistribution");
    } catch {
      surveyAccess = false;
    }
    return {
      schemaVersion: 1,
      projection: "approved_public_snapshots",
      generatedAt: manifest.retrievedAt,
      priorityCountries: PRIORITY_COUNTRIES,
      countries: manifest.countries.map((country) => ({
        ...country,
        names: manifest.countryNames[country.code],
        annualData: Boolean(manifest.files[country.code]),
        surveyData: surveyAccess && Object.hasOwn(survey.countries, country.code),
      })),
      metrics,
      questions: Object.keys(PUBLIC_QUESTIONS),
      sources: [
        {
          id: "world-bank-wdi",
          stage: "published",
          observations: manifest.observations,
          directNationalCoverage: false,
        },
        {
          id: "ecb-ces",
          stage: surveyAccess ? "published" : "publication_suspended",
          observations: surveyAccess
            ? Object.values(survey.countries).reduce((sum, entry) => sum + entry.observations, 0)
            : 0,
          conditions: survey.conditions,
        },
      ],
      marketPrices: { availability: "unavailable", reason: "no_approved_publication" },
      calibratedForecasts: { availability: "unavailable", reason: "model_not_approved" },
    };
  }

  async country(rawCode: unknown) {
    const { manifest, metrics } = await this.annual();
    const country = this.countryCode(rawCode, manifest);
    const data = await this.countryData(country, manifest, metrics);
    return {
      schemaVersion: 1,
      country,
      snapshotSha256: manifest.files[country.code]?.sha256,
      measurements: metrics.map((metric) => ({
        ...this.measurement(country, metric, data, manifest),
        history: data.series[metric.id],
      })),
    };
  }

  async compare(rawCountries: unknown, rawMetrics: unknown) {
    if (typeof rawCountries !== "string" || typeof rawMetrics !== "string") invalid();
    const codes = rawCountries.split(",");
    const ids = rawMetrics.split(",");
    if (
      codes.length < 2 ||
      codes.length > 4 ||
      new Set(codes).size !== codes.length ||
      ids.length < 1 ||
      ids.length > 8 ||
      new Set(ids).size !== ids.length
    )
      invalid();
    const { manifest, metrics } = await this.annual();
    const selected = ids.map((id) => metrics.find((metric) => metric.id === id) ?? invalid());
    const countries = codes.map((code) => this.countryCode(code, manifest));
    const datasets = await Promise.all(
      countries.map((country) => this.countryData(country, manifest, metrics)),
    );
    return {
      schemaVersion: 1,
      countries,
      policy: "latest_common_annual_period_per_metric",
      rows: selected.map((metric) => {
        const common = [...(datasets[0]?.series[metric.id] ?? [])]
          .reverse()
          .find(
            ([year, value]) =>
              value !== null &&
              datasets.every((data) =>
                data.series[metric.id]?.some(
                  ([other, number]) => other === year && number !== null,
                ),
              ),
          );
        const compatible = metric.countryComparable && common !== undefined;
        return {
          metric,
          period: compatible ? common[0] : null,
          comparability: compatible ? "compatible_annual_reference" : "incomparable",
          reason: !metric.countryComparable
            ? "different_units_or_definitions"
            : common
              ? null
              : "no_common_period",
          measurements: countries.map((country, index) =>
            this.measurement(
              country,
              metric,
              datasets[index] as CountryData,
              manifest,
              common?.[0],
              compatible ? undefined : "incompatible_measurements",
            ),
          ),
        };
      }),
    };
  }

  async behavioral(rawCountry: unknown, rawMeasure: unknown) {
    const { manifest: annual } = await this.annual();
    const country = this.countryCode(rawCountry, annual);
    const manifest = await this.json<SurveyManifest>("apps/web/public/behavioral/manifest.json");
    const metric = manifest.metrics.find((entry) => entry.id === rawMeasure);
    if (!metric) invalid();
    const metadata = manifest.countries[country.code];
    const base = {
      schemaVersion: 1,
      country,
      metric,
      evidenceType: "descriptive_statistic",
      population: manifest.population,
      conditions: manifest.conditions,
    };
    if (!metadata)
      return { ...base, availability: "unavailable", reason: "no_observations", records: [] };
    try {
      assertSourceUse(manifest.source, this.now().toISOString(), "redistribution");
    } catch {
      return { ...base, availability: "unavailable", reason: "permission_required", records: [] };
    }
    if (manifest.publicationStatus !== "published")
      return { ...base, availability: "unavailable", reason: "permission_required", records: [] };
    const data = await this.json<{
      country: string;
      schemaVersion: number;
      records: ObservationRecord[];
    }>(`apps/web/public/behavioral/${country.code}.json`, metadata);
    if (data.country !== country.code || data.schemaVersion !== 2 || !Array.isArray(data.records))
      unavailable();
    const records = data.records.filter(
      (record) => record.observation.instrument_or_item === metric.id,
    );
    try {
      for (const record of records) {
        assertObservationRecord(record);
        if (
          record.observation.country_code !== country.code ||
          record.datasetId !== "ecb-ces" ||
          record.raw.sha256 !== metadata.raw.sha256
        )
          unavailable();
      }
    } catch {
      unavailable();
    }
    const latest = [...records]
      .sort((a, b) => b.observation.observation_date.localeCompare(a.observation.observation_date))
      .find((record) => record.observation.value !== null);
    const result = assertAnalyticalResult({
      schemaVersion: 1,
      id: `${country.code}:${metric.id}:${latest?.observation.observation_date ?? "unavailable"}`,
      evidenceType: "descriptive_statistic",
      entity: country.code,
      period: latest
        ? { start: latest.observation.observation_date, end: latest.observation.observation_date }
        : null,
      horizonMonths: metric.horizonMonths,
      method: { id: "ecb-published-weighted-aggregate", version: "1.0.0" },
      evidence: latest
        ? [
            {
              datasetId: "ecb-ces",
              snapshotSha256: metadata.sha256,
              sourceUrl: latest.observation.source_url,
              observationIds: [latest.id],
            },
          ]
        : [],
      explanationKey: "published_survey_statistic",
      limitationKeys: [
        "weighted_source_aggregates",
        "not_causal_evidence",
        "latest_revised_history",
        "individual_uncertainty_is_not_estimator_confidence",
      ],
      freshness: { retrievedAt: metadata.retrievedAt, expectedNextRelease: null, state: "unknown" },
      coverage: {
        observations: latest ? 1 : 0,
        requiredObservations: 1,
        includedEntities: latest ? [country.code] : [],
        excludedEntities: latest ? [] : [country.code],
        scope: latest ? "complete" : "subset",
      },
      ...(latest
        ? {
            availability: "available" as const,
            value: Number(latest.observation.value),
            unit: metric.unit,
            uncertainty: null,
          }
        : {
            availability: "unavailable" as const,
            value: null,
            unit: metric.unit,
            uncertainty: null,
            reason: "no_observations" as const,
          }),
    });
    return {
      ...base,
      availability: result.availability,
      result,
      snapshotSha256: metadata.sha256,
      retrievedAt: metadata.retrievedAt,
      records,
      limitations: result.limitationKeys,
    };
  }

  async question(rawQuestion: unknown, rawCountry: unknown) {
    if (typeof rawQuestion !== "string" || !Object.hasOwn(PUBLIC_QUESTIONS, rawQuestion)) {
      return {
        schemaVersion: 1,
        availability: "unavailable",
        reason: "unsupported_question",
        supportedQuestions: Object.keys(PUBLIC_QUESTIONS),
      };
    }
    const response = await this.country(rawCountry);
    const ids = PUBLIC_QUESTIONS[rawQuestion as keyof typeof PUBLIC_QUESTIONS] as readonly string[];
    const measurements = response.measurements.filter((entry) => ids.includes(entry.metric.id));
    return {
      ...response,
      question: rawQuestion,
      measurements,
      availability: measurements.some((entry) => entry.result.availability === "available")
        ? "available"
        : "unavailable",
      interpretation: {
        evidenceType: "observation",
        explanationKey: "inspect_dated_evidence_together",
        limitationKeys: [
          "periods_may_differ",
          "no_causal_or_investment_recommendation",
          "annual_data_not_current_market_conditions",
        ],
      },
    };
  }

  async risk(rawCountry: unknown) {
    const country = await this.country(rawCountry);
    return {
      schemaVersion: 2,
      country: country.country,
      snapshotSha256: country.snapshotSha256,
      completion: "indicators_published_forecasts_unavailable",
      aggregateProbability: null,
      dimensions: Object.entries(RISK_DIMENSIONS).map(([dimension, ids]) => ({
        dimension,
        measurements: country.measurements
          .filter((entry) => (ids as readonly string[]).includes(entry.metric.id))
          .map((entry) => ({
            ...entry,
            change: consecutiveAnnualChange(entry.history ?? []),
          })),
        forecasts: [30, 90, 180, 365].map((horizonDays) => ({
          horizonDays,
          availability: "unavailable",
          reason: "model_not_approved",
          probability: null,
          uncertainty: null,
        })),
      })),
      limitationKeys: [
        "indicators_are_not_crisis_probabilities",
        "changes_are_descriptive_not_causal",
        "periods_may_differ",
        "annual_data_not_current_market_conditions",
        "no_aggregate_risk_score",
      ],
    };
  }

  scenario(body: unknown) {
    if (!body || typeof body !== "object" || Array.isArray(body)) invalid();
    const args = body as Record<string, unknown>;
    if (Object.keys(args).sort().join(",") !== "audience,family,severity") invalid();
    try {
      return runDecisionScenario(
        args.family as ScenarioFamily,
        args.audience as ScenarioAudience,
        args.severity as Severity,
      );
    } catch {
      return invalid();
    }
  }
}
