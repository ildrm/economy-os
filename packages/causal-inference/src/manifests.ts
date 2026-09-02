import {
  assertExactKeys,
  assertIsoInstant,
  assertKey,
  assertRecord,
  assertSemver,
  assertSha256,
  assertSorted,
  assertUuid,
  cloneCanonical,
  compareInstant,
  deepFreeze,
  digestJson,
  expectArray,
  expectInteger,
  expectString,
} from "./internals.js";

export interface ManifestReference {
  readonly id: string;
  readonly sha256: string;
}

export interface PointInTimeCutoffs {
  readonly knowledgeCutoff: string;
  readonly systemCutoff: string;
}

export interface FrozenCohortPointer {
  readonly snapshotId: string;
  readonly snapshotSha256: string;
  readonly selectedAsOf: string;
  readonly latestUnitAvailableAt: string;
  readonly latestUnitSystemRecordedAt: string;
  readonly populationCount: number;
}

export interface FrozenDatasetPointer {
  readonly datasetKey: string;
  readonly snapshotId: string;
  readonly snapshotSha256: string;
  readonly latestAvailableAt: string;
  readonly latestSystemRecordedAt: string;
}

export interface FrozenModelPointer {
  readonly artifactId: string;
  readonly version: string;
  readonly family: string;
  readonly artifactSha256: string;
  readonly trainingDataSha256: string;
  readonly fitThrough: string;
}

export interface FrozenCodePointer {
  readonly commitSha256: string;
  readonly packageLockSha256: string;
  readonly environmentSha256: string;
}

export interface FrozenConfigurationPointer {
  readonly configurationSha256: string;
  readonly randomSeeds: readonly number[];
}

export interface PointInTimeAnalysisManifestInput {
  readonly schemaVersion: 1;
  readonly manifestId: string;
  readonly analysisId: string;
  readonly estimand: ManifestReference;
  readonly identificationDesign: ManifestReference;
  readonly analysisPlan: ManifestReference;
  readonly cutoffs: PointInTimeCutoffs;
  readonly cohort: FrozenCohortPointer;
  readonly datasets: readonly FrozenDatasetPointer[];
  readonly model: FrozenModelPointer;
  readonly code: FrozenCodePointer;
  readonly configuration: FrozenConfigurationPointer;
  readonly frozenAt: string;
}

export interface PointInTimeAnalysisManifest extends PointInTimeAnalysisManifestInput {
  readonly manifestSha256: string;
}

const BODY_KEYS = [
  "schemaVersion",
  "manifestId",
  "analysisId",
  "estimand",
  "identificationDesign",
  "analysisPlan",
  "cutoffs",
  "cohort",
  "datasets",
  "model",
  "code",
  "configuration",
  "frozenAt",
] as const;

function parseReference(value: unknown, field: string): ManifestReference {
  assertRecord(value, field);
  assertExactKeys(value, ["id", "sha256"], field);
  const id = expectString(value.id, `${field}.id`);
  const sha256 = expectString(value.sha256, `${field}.sha256`);
  assertUuid(id, `${field}.id`);
  assertSha256(sha256, `${field}.sha256`);
  return { id, sha256 };
}

function parseCutoffs(value: unknown): PointInTimeCutoffs {
  assertRecord(value, "analysisManifest.cutoffs");
  assertExactKeys(value, ["knowledgeCutoff", "systemCutoff"], "analysisManifest.cutoffs");
  const knowledgeCutoff = expectString(
    value.knowledgeCutoff,
    "analysisManifest.cutoffs.knowledgeCutoff",
  );
  const systemCutoff = expectString(value.systemCutoff, "analysisManifest.cutoffs.systemCutoff");
  assertIsoInstant(knowledgeCutoff, "analysisManifest.cutoffs.knowledgeCutoff");
  assertIsoInstant(systemCutoff, "analysisManifest.cutoffs.systemCutoff");
  return { knowledgeCutoff, systemCutoff };
}

function parseCohort(value: unknown, cutoffs: PointInTimeCutoffs): FrozenCohortPointer {
  assertRecord(value, "analysisManifest.cohort");
  assertExactKeys(
    value,
    [
      "snapshotId",
      "snapshotSha256",
      "selectedAsOf",
      "latestUnitAvailableAt",
      "latestUnitSystemRecordedAt",
      "populationCount",
    ],
    "analysisManifest.cohort",
  );
  const snapshotId = expectString(value.snapshotId, "analysisManifest.cohort.snapshotId");
  const snapshotSha256 = expectString(
    value.snapshotSha256,
    "analysisManifest.cohort.snapshotSha256",
  );
  const selectedAsOf = expectString(value.selectedAsOf, "analysisManifest.cohort.selectedAsOf");
  const latestUnitAvailableAt = expectString(
    value.latestUnitAvailableAt,
    "analysisManifest.cohort.latestUnitAvailableAt",
  );
  const latestUnitSystemRecordedAt = expectString(
    value.latestUnitSystemRecordedAt,
    "analysisManifest.cohort.latestUnitSystemRecordedAt",
  );
  assertUuid(snapshotId, "analysisManifest.cohort.snapshotId");
  assertSha256(snapshotSha256, "analysisManifest.cohort.snapshotSha256");
  for (const [field, instant] of [
    ["selectedAsOf", selectedAsOf],
    ["latestUnitAvailableAt", latestUnitAvailableAt],
    ["latestUnitSystemRecordedAt", latestUnitSystemRecordedAt],
  ] as const) {
    assertIsoInstant(instant, `analysisManifest.cohort.${field}`);
  }
  if (compareInstant(selectedAsOf, cutoffs.knowledgeCutoff) > 0) {
    throw new TypeError("cohort selection is later than the knowledge cutoff");
  }
  if (compareInstant(latestUnitAvailableAt, cutoffs.knowledgeCutoff) > 0) {
    throw new TypeError("cohort contains units unavailable at the knowledge cutoff");
  }
  if (compareInstant(latestUnitSystemRecordedAt, cutoffs.systemCutoff) > 0) {
    throw new TypeError("cohort contains units recorded after the system cutoff");
  }
  return {
    snapshotId,
    snapshotSha256,
    selectedAsOf,
    latestUnitAvailableAt,
    latestUnitSystemRecordedAt,
    populationCount: expectInteger(
      value.populationCount,
      "analysisManifest.cohort.populationCount",
      1,
      1_000_000_000,
    ),
  };
}

function parseDatasets(value: unknown, cutoffs: PointInTimeCutoffs): FrozenDatasetPointer[] {
  const datasets = expectArray(value, "analysisManifest.datasets");
  if (datasets.length === 0) throw new TypeError("analysis manifest must pin at least one dataset");
  const parsed = datasets.map((item, index) => {
    const field = `analysisManifest.datasets[${index}]`;
    assertRecord(item, field);
    assertExactKeys(
      item,
      ["datasetKey", "snapshotId", "snapshotSha256", "latestAvailableAt", "latestSystemRecordedAt"],
      field,
    );
    const datasetKey = expectString(item.datasetKey, `${field}.datasetKey`);
    const snapshotId = expectString(item.snapshotId, `${field}.snapshotId`);
    const snapshotSha256 = expectString(item.snapshotSha256, `${field}.snapshotSha256`);
    const latestAvailableAt = expectString(item.latestAvailableAt, `${field}.latestAvailableAt`);
    const latestSystemRecordedAt = expectString(
      item.latestSystemRecordedAt,
      `${field}.latestSystemRecordedAt`,
    );
    assertKey(datasetKey, `${field}.datasetKey`);
    assertUuid(snapshotId, `${field}.snapshotId`);
    assertSha256(snapshotSha256, `${field}.snapshotSha256`);
    assertIsoInstant(latestAvailableAt, `${field}.latestAvailableAt`);
    assertIsoInstant(latestSystemRecordedAt, `${field}.latestSystemRecordedAt`);
    if (compareInstant(latestAvailableAt, cutoffs.knowledgeCutoff) > 0) {
      throw new TypeError(`${field} contains data unavailable at the knowledge cutoff`);
    }
    if (compareInstant(latestSystemRecordedAt, cutoffs.systemCutoff) > 0) {
      throw new TypeError(`${field} contains data recorded after the system cutoff`);
    }
    return {
      datasetKey,
      snapshotId,
      snapshotSha256,
      latestAvailableAt,
      latestSystemRecordedAt,
    };
  });
  const keys = parsed.map((item) => item.datasetKey);
  if (new Set(keys).size !== keys.length) throw new TypeError("dataset keys must be unique");
  return parsed.sort((left, right) => left.datasetKey.localeCompare(right.datasetKey));
}

function parseModel(value: unknown, cutoffs: PointInTimeCutoffs): FrozenModelPointer {
  assertRecord(value, "analysisManifest.model");
  assertExactKeys(
    value,
    ["artifactId", "version", "family", "artifactSha256", "trainingDataSha256", "fitThrough"],
    "analysisManifest.model",
  );
  const artifactId = expectString(value.artifactId, "analysisManifest.model.artifactId");
  const version = expectString(value.version, "analysisManifest.model.version");
  const family = expectString(value.family, "analysisManifest.model.family");
  const artifactSha256 = expectString(
    value.artifactSha256,
    "analysisManifest.model.artifactSha256",
  );
  const trainingDataSha256 = expectString(
    value.trainingDataSha256,
    "analysisManifest.model.trainingDataSha256",
  );
  const fitThrough = expectString(value.fitThrough, "analysisManifest.model.fitThrough");
  assertUuid(artifactId, "analysisManifest.model.artifactId");
  assertSemver(version, "analysisManifest.model.version");
  assertKey(family, "analysisManifest.model.family");
  assertSha256(artifactSha256, "analysisManifest.model.artifactSha256");
  assertSha256(trainingDataSha256, "analysisManifest.model.trainingDataSha256");
  assertIsoInstant(fitThrough, "analysisManifest.model.fitThrough");
  if (compareInstant(fitThrough, cutoffs.knowledgeCutoff) > 0) {
    throw new TypeError("model fit uses knowledge later than the analysis cutoff");
  }
  return { artifactId, version, family, artifactSha256, trainingDataSha256, fitThrough };
}

function parseCode(value: unknown): FrozenCodePointer {
  assertRecord(value, "analysisManifest.code");
  assertExactKeys(
    value,
    ["commitSha256", "packageLockSha256", "environmentSha256"],
    "analysisManifest.code",
  );
  const commitSha256 = expectString(value.commitSha256, "analysisManifest.code.commitSha256");
  const packageLockSha256 = expectString(
    value.packageLockSha256,
    "analysisManifest.code.packageLockSha256",
  );
  const environmentSha256 = expectString(
    value.environmentSha256,
    "analysisManifest.code.environmentSha256",
  );
  for (const [field, digest] of [
    ["commitSha256", commitSha256],
    ["packageLockSha256", packageLockSha256],
    ["environmentSha256", environmentSha256],
  ] as const) {
    assertSha256(digest, `analysisManifest.code.${field}`);
  }
  return { commitSha256, packageLockSha256, environmentSha256 };
}

function parseConfiguration(value: unknown): FrozenConfigurationPointer {
  assertRecord(value, "analysisManifest.configuration");
  assertExactKeys(value, ["configurationSha256", "randomSeeds"], "analysisManifest.configuration");
  const configurationSha256 = expectString(
    value.configurationSha256,
    "analysisManifest.configuration.configurationSha256",
  );
  assertSha256(configurationSha256, "analysisManifest.configuration.configurationSha256");
  const randomSeeds = expectArray(
    value.randomSeeds,
    "analysisManifest.configuration.randomSeeds",
  ).map((seed, index) =>
    expectInteger(seed, `analysisManifest.configuration.randomSeeds[${index}]`, 0, 2_147_483_647),
  );
  if (randomSeeds.length === 0) throw new TypeError("analysis manifest must pin random seeds");
  if (new Set(randomSeeds).size !== randomSeeds.length) {
    throw new TypeError("analysis manifest random seeds must be unique");
  }
  return { configurationSha256, randomSeeds: [...randomSeeds].sort((a, b) => a - b) };
}

function parseManifestBody(value: unknown): PointInTimeAnalysisManifestInput {
  assertRecord(value, "analysisManifest");
  assertExactKeys(value, BODY_KEYS, "analysisManifest");
  if (value.schemaVersion !== 1) throw new TypeError("analysisManifest.schemaVersion must be 1");
  const manifestId = expectString(value.manifestId, "analysisManifest.manifestId");
  const analysisId = expectString(value.analysisId, "analysisManifest.analysisId");
  const frozenAt = expectString(value.frozenAt, "analysisManifest.frozenAt");
  assertUuid(manifestId, "analysisManifest.manifestId");
  assertUuid(analysisId, "analysisManifest.analysisId");
  assertIsoInstant(frozenAt, "analysisManifest.frozenAt");
  const cutoffs = parseCutoffs(value.cutoffs);
  if (
    compareInstant(cutoffs.knowledgeCutoff, frozenAt) > 0 ||
    compareInstant(cutoffs.systemCutoff, frozenAt) > 0
  ) {
    throw new TypeError("analysis cutoffs cannot be later than manifest freeze time");
  }
  return {
    schemaVersion: 1,
    manifestId,
    analysisId,
    estimand: parseReference(value.estimand, "analysisManifest.estimand"),
    identificationDesign: parseReference(
      value.identificationDesign,
      "analysisManifest.identificationDesign",
    ),
    analysisPlan: parseReference(value.analysisPlan, "analysisManifest.analysisPlan"),
    cutoffs,
    cohort: parseCohort(value.cohort, cutoffs),
    datasets: parseDatasets(value.datasets, cutoffs),
    model: parseModel(value.model, cutoffs),
    code: parseCode(value.code),
    configuration: parseConfiguration(value.configuration),
    frozenAt,
  };
}

export function createPointInTimeAnalysisManifest(
  value: unknown,
): Readonly<PointInTimeAnalysisManifest> {
  const body = cloneCanonical(parseManifestBody(value));
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function assertPointInTimeAnalysisManifestIntegrity(
  value: unknown,
): asserts value is PointInTimeAnalysisManifest {
  assertRecord(value, "analysisManifest");
  assertExactKeys(value, [...BODY_KEYS, "manifestSha256"], "analysisManifest");
  const manifestSha256 = expectString(value.manifestSha256, "analysisManifest.manifestSha256");
  assertSha256(manifestSha256, "analysisManifest.manifestSha256");
  const body = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "manifestSha256"),
  );
  const parsed = parseManifestBody(body);
  assertSorted(
    parsed.datasets.map((dataset) => dataset.datasetKey),
    "analysisManifest.datasets",
  );
  for (let index = 1; index < parsed.configuration.randomSeeds.length; index += 1) {
    if (
      (parsed.configuration.randomSeeds[index - 1] ?? 0) >=
      (parsed.configuration.randomSeeds[index] ?? 0)
    ) {
      throw new TypeError("analysisManifest random seeds must be deterministically ordered");
    }
  }
  if (digestJson(parsed) !== manifestSha256) {
    throw new TypeError("analysis manifest digest does not match immutable content");
  }
}
