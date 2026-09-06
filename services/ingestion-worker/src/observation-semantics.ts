import { parseWorldBankDocument } from "@economyos/canonical-data";
import {
  type AnnualReferenceDefinition,
  annualReferenceObservation,
  assertObservationRecord,
  type ObservationRecord,
  wdiObservationMetadata,
} from "@economyos/contracts";
import {
  type AdmissionDecision,
  deterministicUuid,
  digestJson,
  type IngestionWorkflowInput,
  type LandingResult,
  sha256Hex,
} from "@economyos/data-admission";

export interface PromotionSemantics {
  readonly version: string;
  readonly definition: Readonly<Record<string, unknown>>;
  readonly records: readonly ObservationRecord[];
}

/** A separate versioned interpretation of unchanged parser output and retained raw bytes.
 * It does not rewrite old parser identities, canonical observations or report manifests.
 */
export function materializeWdiSemantics(input: {
  workflow: IngestionWorkflowInput;
  landing: LandingResult;
  decision: AdmissionDecision;
  bytes: Uint8Array;
  definitions: readonly AnnualReferenceDefinition[];
}): PromotionSemantics {
  const payload = input.landing.payloads[0];
  if (!payload || sha256Hex(input.bytes) !== payload.checksumSha256)
    throw new TypeError("Semantics require verified retained raw bytes");
  const definition = input.definitions.find(
    (item) => item.code === input.workflow.connector.indicatorCode,
  );
  if (!definition) throw new TypeError("Register reviewed metric semantics before ingestion");
  const semanticDefinition = {
    source: "world-bank-wdi",
    adapter: "annual-reference/1.0.0",
    metric: { ...definition },
  };
  const version = `wdi-${digestJson(semanticDefinition)}`;
  const document = parseWorldBankDocument(input.bytes);
  if (!Array.isArray(document) || !Array.isArray(document[1]))
    throw new TypeError("Invalid raw WDI document");
  const records = input.landing.candidates.map((candidate) => {
    const year = Number(candidate.periodStart.slice(0, 4));
    const matches = document[1].filter(
      (row: Record<string, unknown>) =>
        row.countryiso3code === candidate.countryCode && row.date === String(year),
    );
    if (matches.length !== 1) throw new TypeError("Cannot identify original WDI row");
    const row = matches[0] as {
      value: string | null;
      unit: string;
      obs_status: string;
      country: { value: string };
      indicator: { id: string };
    };
    if (row.indicator.id !== definition.code || !row.country?.value)
      throw new TypeError("WDI source semantics do not match the admitted metric");
    const metadata = wdiObservationMetadata(row.unit, row.obs_status);
    const observation = annualReferenceObservation(
      definition,
      {
        code: definition.code,
        indicatorUrl: `https://data.worldbank.org/indicator/${definition.code}`,
        retrievedAt: payload.fetchedAt,
        observationMetadata: metadata,
      },
      { code: candidate.countryCode, name: row.country.value },
      [year, row.value],
    );
    const id = deterministicUuid(
      "economyos:observation:v1",
      input.workflow.organizationId ?? "global",
      input.workflow.seriesId,
      input.decision.releaseId,
      candidate.periodStart,
      candidate.periodEnd,
      input.decision.transformationRunId,
    );
    return assertObservationRecord({
      schemaVersion: 2,
      id,
      datasetId: input.workflow.datasetId,
      semanticsVersion: version,
      observation,
      raw: {
        sha256: payload.checksumSha256,
        locator: `${candidate.countryCode}:${definition.code}:${year}`,
        value: row.value,
        unit: row.unit,
        status: row.obs_status,
      },
      population: `World Bank indicator ${definition.code}, ${row.country.value}`,
      seasonalAdjustment: "not_applicable",
      methodologicalBreak: null,
      knownAt: null,
      vintage: "latest_revised_only",
    });
  });
  return { version, definition: semanticDefinition, records };
}
