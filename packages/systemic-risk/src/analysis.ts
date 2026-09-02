import type {
  ExposureEdge,
  ExposureKind,
  ExposureNetworkSnapshot,
  NetworkNode,
} from "./exposures.js";
import {
  assertExposureNetworkSnapshotIntegrity,
  EXPOSURE_KINDS,
  summarizeCoverage,
} from "./exposures.js";
import {
  assertDigestIntegrity,
  assertInteger,
  assertIsoInstant,
  assertKey,
  assertNonBlank,
  assertSha256,
  assertUuid,
  compareInstants,
  decimal,
  digestJson,
  fixedDecimal,
  formatFixedDecimal,
  formatRatio,
  immutableWithDigest,
  parseDecimal,
  uniqueBy,
} from "./internals.js";

export const SHOCK_CHANNELS = [
  "solvency",
  "liquidity",
  "trade_disruption",
  "supply_disruption",
  "market_repricing",
  "operational_outage",
] as const;
export type ShockChannel = (typeof SHOCK_CHANNELS)[number];

export interface ScenarioShock {
  readonly shockId: string;
  readonly nodeId: string;
  readonly channel: ShockChannel;
  readonly severity: string;
  readonly rationale: string;
}

export interface TransmissionRule {
  readonly exposureKind: ExposureKind;
  readonly coefficient: string;
  readonly rationale: string;
}

export interface StressPropagationInput {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly snapshotId: string;
  readonly snapshotSha256: string;
  readonly issuedAt: string;
  readonly outputSemantics: "scenario_stress_index";
  readonly shocks: readonly ScenarioShock[];
  readonly transmissionRules: readonly TransmissionRule[];
  readonly missingExposureMultiplier: string;
  readonly maximumRounds: number;
  readonly convergenceTolerance: string;
  readonly assumptions: readonly string[];
}

export interface NodeStressResult {
  readonly nodeId: string;
  readonly entityKey: string;
  readonly exogenousStress: string;
  readonly propagatedStress: string;
  readonly totalStress: string;
}

export interface EdgeTransmissionResult {
  readonly edgeId: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly exposureKind: ExposureKind;
  readonly transmittedStress: string;
}

export interface StressPropagationResultBody {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly snapshotId: string;
  readonly snapshotSha256: string;
  readonly issuedAt: string;
  readonly completedAt: string;
  readonly outputSemantics: "scenario_stress_index";
  readonly combinedProbability: null;
  readonly scenarioInputSha256: string;
  readonly shocks: readonly ScenarioShock[];
  readonly transmissionRules: readonly TransmissionRule[];
  readonly missingExposureMultiplier: string;
  readonly maximumRounds: number;
  readonly convergenceTolerance: string;
  readonly roundsExecuted: number;
  readonly converged: boolean;
  readonly nodeResults: readonly NodeStressResult[];
  readonly edgeTransmissions: readonly EdgeTransmissionResult[];
  readonly coverageStatus: "adequate" | "limited" | "unknown";
  readonly coverageCaveats: readonly string[];
  readonly assumptions: readonly string[];
}

export type StressPropagationResult = Readonly<
  StressPropagationResultBody & { readonly manifestSha256: string }
>;

function inSet<T extends string>(
  value: string,
  values: readonly T[],
  field: string,
): asserts value is T {
  if (!values.includes(value as T)) throw new TypeError(`${field} is unsupported`);
}

function combineIndependentChannels(current: number, contribution: number): number {
  return 1 - (1 - current) * (1 - contribution);
}

function normalizePropagationInput(input: StressPropagationInput): StressPropagationInput {
  return {
    ...input,
    shocks: [...input.shocks].sort((left, right) => left.shockId.localeCompare(right.shockId)),
    transmissionRules: [...input.transmissionRules].sort((left, right) =>
      left.exposureKind.localeCompare(right.exposureKind),
    ),
    assumptions: [...input.assumptions].sort(),
  };
}

function validatePropagationInput(
  snapshot: ExposureNetworkSnapshot,
  input: StressPropagationInput,
): ReadonlyMap<ExposureKind, number> {
  if (input.schemaVersion !== 1) throw new TypeError("schemaVersion must equal 1");
  assertUuid(input.runId, "runId");
  assertUuid(input.snapshotId, "snapshotId");
  assertSha256(input.snapshotSha256, "snapshotSha256");
  if (
    input.snapshotId !== snapshot.snapshotId ||
    input.snapshotSha256 !== snapshot.manifestSha256
  ) {
    throw new TypeError("stress run must pin the supplied snapshot ID and digest");
  }
  assertIsoInstant(input.issuedAt, "issuedAt");
  if (compareInstants(input.issuedAt, snapshot.asOf) < 0) {
    throw new TypeError("issuedAt cannot precede the network as-of");
  }
  if (input.outputSemantics !== "scenario_stress_index") {
    throw new TypeError("outputSemantics must remain scenario_stress_index");
  }
  assertInteger(input.shocks.length, "shocks.length", 1, 100);
  assertInteger(input.transmissionRules.length, "transmissionRules.length", 1, 100);
  assertInteger(input.assumptions.length, "assumptions.length", 1, 100);
  assertInteger(input.maximumRounds, "maximumRounds", 1, 100);
  parseDecimal(input.convergenceTolerance, "convergenceTolerance", 0, 0.1);
  parseDecimal(input.missingExposureMultiplier, "missingExposureMultiplier", 0, 3);
  const nodeIds = new Set(snapshot.nodes.map((node) => node.nodeId));
  uniqueBy(input.shocks, (shock) => shock.shockId, "shocks");
  for (const [index, shock] of input.shocks.entries()) {
    const field = `shocks[${index}]`;
    assertUuid(shock.shockId, `${field}.shockId`);
    assertUuid(shock.nodeId, `${field}.nodeId`);
    if (!nodeIds.has(shock.nodeId)) throw new TypeError(`${field} references an unknown node`);
    inSet(shock.channel, SHOCK_CHANNELS, `${field}.channel`);
    parseDecimal(shock.severity, `${field}.severity`, 0, 1);
    assertNonBlank(shock.rationale, `${field}.rationale`, 1_000);
  }
  uniqueBy(input.transmissionRules, (rule) => rule.exposureKind, "transmissionRules");
  const ruleMap = new Map<ExposureKind, number>();
  for (const [index, rule] of input.transmissionRules.entries()) {
    const field = `transmissionRules[${index}]`;
    assertKey(rule.exposureKind, `${field}.exposureKind`);
    inSet(rule.exposureKind, EXPOSURE_KINDS, `${field}.exposureKind`);
    const coefficient = parseDecimal(rule.coefficient, `${field}.coefficient`, 0, 1);
    assertNonBlank(rule.rationale, `${field}.rationale`, 1_000);
    ruleMap.set(rule.exposureKind, coefficient);
  }
  for (const edge of snapshot.edges) {
    if (!ruleMap.has(edge.kind)) {
      throw new TypeError(`transmissionRules omit exposure kind ${edge.kind}`);
    }
  }
  for (const [index, assumption] of input.assumptions.entries()) {
    assertNonBlank(assumption, `assumptions[${index}]`, 1_000);
  }
  uniqueBy(input.assumptions, (value) => value, "assumptions");
  return ruleMap;
}

function edgeWeight(
  edge: ExposureEdge,
  coefficient: number,
  missingExposureMultiplier: number,
  incompleteCoverage: boolean,
): number {
  const multiplier = incompleteCoverage ? missingExposureMultiplier : 1;
  return Math.min(1, Number(edge.normalizedExposure) * coefficient * multiplier);
}

export function propagateScenarioStress(
  snapshot: ExposureNetworkSnapshot,
  input: StressPropagationInput,
  completedAt: string,
): StressPropagationResult {
  assertExposureNetworkSnapshotIntegrity(snapshot);
  const rules = validatePropagationInput(snapshot, input);
  const normalizedInput = normalizePropagationInput(input);
  assertIsoInstant(completedAt, "completedAt");
  if (compareInstants(completedAt, input.issuedAt) < 0) {
    throw new TypeError("completedAt cannot precede issuedAt");
  }
  const exogenous = new Map<string, number>(snapshot.nodes.map((node) => [node.nodeId, 0]));
  for (const shock of normalizedInput.shocks) {
    const existing = exogenous.get(shock.nodeId) ?? 0;
    exogenous.set(shock.nodeId, combineIndependentChannels(existing, Number(shock.severity)));
  }
  let current = new Map(exogenous);
  let converged = false;
  let roundsExecuted = 0;
  const missingMultiplier = Number(normalizedInput.missingExposureMultiplier);
  const tolerance = Number(normalizedInput.convergenceTolerance);
  const finalEdgeContributions = new Map<string, number>();
  const incompleteKinds = new Set(
    snapshot.coverage
      .filter((coverage) => coverage.status !== "complete")
      .map((coverage) => coverage.exposureKind),
  );
  for (let round = 1; round <= normalizedInput.maximumRounds; round += 1) {
    const next = new Map(exogenous);
    const contributions = new Map<string, number>();
    for (const edge of snapshot.edges) {
      const contribution =
        (current.get(edge.sourceNodeId) ?? 0) *
        edgeWeight(
          edge,
          rules.get(edge.kind) ?? 0,
          missingMultiplier,
          incompleteKinds.has(edge.kind),
        );
      contributions.set(edge.edgeId, contribution);
      next.set(
        edge.targetNodeId,
        combineIndependentChannels(next.get(edge.targetNodeId) ?? 0, contribution),
      );
    }
    let maximumDelta = 0;
    for (const node of snapshot.nodes) {
      maximumDelta = Math.max(
        maximumDelta,
        Math.abs((next.get(node.nodeId) ?? 0) - (current.get(node.nodeId) ?? 0)),
      );
    }
    current = next;
    roundsExecuted = round;
    finalEdgeContributions.clear();
    for (const [edgeId, contribution] of contributions) {
      finalEdgeContributions.set(edgeId, contribution);
    }
    if (maximumDelta <= tolerance) {
      converged = true;
      break;
    }
  }
  const nodesById = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));
  const nodeResults = [...current.entries()]
    .map(([nodeId, totalStress]) => {
      const initial = exogenous.get(nodeId) ?? 0;
      return {
        nodeId,
        entityKey: nodesById.get(nodeId)?.entityKey ?? "unknown",
        exogenousStress: decimal(initial),
        propagatedStress: decimal(Math.max(0, totalStress - initial)),
        totalStress: decimal(totalStress),
      };
    })
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  const edgesById = new Map(snapshot.edges.map((edge) => [edge.edgeId, edge]));
  const edgeTransmissions = [...finalEdgeContributions.entries()]
    .map(([edgeId, contribution]) => {
      const edge = edgesById.get(edgeId);
      if (!edge) throw new TypeError("internal edge transmission lost its source edge");
      return {
        edgeId,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        exposureKind: edge.kind,
        transmittedStress: decimal(contribution),
      };
    })
    .sort((left, right) => left.edgeId.localeCompare(right.edgeId));
  const coverage = summarizeCoverage(snapshot);
  const body: StressPropagationResultBody = {
    schemaVersion: 1,
    runId: input.runId,
    snapshotId: snapshot.snapshotId,
    snapshotSha256: snapshot.manifestSha256,
    issuedAt: input.issuedAt,
    completedAt,
    outputSemantics: "scenario_stress_index",
    combinedProbability: null,
    scenarioInputSha256: digestJson(normalizedInput),
    shocks: normalizedInput.shocks,
    transmissionRules: normalizedInput.transmissionRules,
    missingExposureMultiplier: normalizedInput.missingExposureMultiplier,
    maximumRounds: normalizedInput.maximumRounds,
    convergenceTolerance: normalizedInput.convergenceTolerance,
    roundsExecuted,
    converged,
    nodeResults,
    edgeTransmissions,
    coverageStatus: coverage.status,
    coverageCaveats: coverage.caveats,
    assumptions: normalizedInput.assumptions,
  };
  return immutableWithDigest(body);
}

export function assertStressPropagationResultIntegrity(result: StressPropagationResult): void {
  assertDigestIntegrity(result, "stressPropagationResult");
  if (result.outputSemantics !== "scenario_stress_index" || result.combinedProbability !== null) {
    throw new TypeError("stress propagation output cannot claim a combined probability");
  }
  assertUuid(result.runId, "stressPropagationResult.runId");
  assertUuid(result.snapshotId, "stressPropagationResult.snapshotId");
  assertSha256(result.snapshotSha256, "stressPropagationResult.snapshotSha256");
  assertIsoInstant(result.issuedAt, "stressPropagationResult.issuedAt");
  assertIsoInstant(result.completedAt, "stressPropagationResult.completedAt");
  if (compareInstants(result.completedAt, result.issuedAt) < 0) {
    throw new TypeError("stress propagation completion chronology is invalid");
  }
  assertInteger(result.maximumRounds, "maximumRounds", 1, 100);
  assertInteger(result.roundsExecuted, "roundsExecuted", 1, result.maximumRounds);
  if (typeof result.converged !== "boolean") throw new TypeError("converged must be boolean");
  assertInteger(result.shocks.length, "shocks.length", 1, 100);
  assertInteger(result.transmissionRules.length, "transmissionRules.length", 1, 100);
  assertInteger(result.assumptions.length, "assumptions.length", 1, 100);
  parseDecimal(result.convergenceTolerance, "convergenceTolerance", 0, 0.1);
  parseDecimal(result.missingExposureMultiplier, "missingExposureMultiplier", 0, 3);
  uniqueBy(result.shocks, (shock) => shock.shockId, "shocks");
  for (const [index, shock] of result.shocks.entries()) {
    assertUuid(shock.shockId, `shocks[${index}].shockId`);
    assertUuid(shock.nodeId, `shocks[${index}].nodeId`);
    inSet(shock.channel, SHOCK_CHANNELS, `shocks[${index}].channel`);
    parseDecimal(shock.severity, `shocks[${index}].severity`, 0, 1);
    assertNonBlank(shock.rationale, `shocks[${index}].rationale`, 1_000);
  }
  uniqueBy(result.transmissionRules, (rule) => rule.exposureKind, "transmissionRules");
  for (const [index, rule] of result.transmissionRules.entries()) {
    inSet(rule.exposureKind, EXPOSURE_KINDS, `transmissionRules[${index}].exposureKind`);
    parseDecimal(rule.coefficient, `transmissionRules[${index}].coefficient`, 0, 1);
    assertNonBlank(rule.rationale, `transmissionRules[${index}].rationale`, 1_000);
  }
  uniqueBy(result.assumptions, (assumption) => assumption, "assumptions");
  for (const [index, assumption] of result.assumptions.entries()) {
    assertNonBlank(assumption, `assumptions[${index}]`, 1_000);
  }
  assertSha256(result.scenarioInputSha256, "scenarioInputSha256");
  const scenarioInput = normalizePropagationInput({
    schemaVersion: 1,
    runId: result.runId,
    snapshotId: result.snapshotId,
    snapshotSha256: result.snapshotSha256,
    issuedAt: result.issuedAt,
    outputSemantics: result.outputSemantics,
    shocks: result.shocks,
    transmissionRules: result.transmissionRules,
    missingExposureMultiplier: result.missingExposureMultiplier,
    maximumRounds: result.maximumRounds,
    convergenceTolerance: result.convergenceTolerance,
    assumptions: result.assumptions,
  });
  if (digestJson(scenarioInput) !== result.scenarioInputSha256) {
    throw new TypeError("stress propagation scenario input digest is invalid");
  }
  uniqueBy(result.nodeResults, (node) => node.nodeId, "nodeResults");
  assertInteger(result.nodeResults.length, "nodeResults.length", 1, 10_000);
  const nodeIds = new Set(result.nodeResults.map((node) => node.nodeId));
  for (const shock of result.shocks) {
    if (!nodeIds.has(shock.nodeId)) throw new TypeError("shock node is absent from node results");
  }
  for (const node of result.nodeResults) {
    assertUuid(node.nodeId, "node.nodeId");
    assertKey(node.entityKey, "node.entityKey");
    const exogenous = parseDecimal(node.exogenousStress, "node.exogenousStress", 0, 1);
    const propagated = parseDecimal(node.propagatedStress, "node.propagatedStress", 0, 1);
    const total = parseDecimal(node.totalStress, "node.totalStress", 0, 1);
    if (Math.abs(exogenous + propagated - total) > 2e-12) {
      throw new TypeError("node stress components are inconsistent");
    }
  }
  uniqueBy(result.edgeTransmissions, (edge) => edge.edgeId, "edgeTransmissions");
  assertInteger(result.edgeTransmissions.length, "edgeTransmissions.length", 1, 100_000);
  for (const edge of result.edgeTransmissions) {
    assertUuid(edge.edgeId, "edgeTransmission.edgeId");
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      throw new TypeError("edge transmission references an unknown result node");
    }
    inSet(edge.exposureKind, EXPOSURE_KINDS, "edgeTransmission.exposureKind");
    parseDecimal(edge.transmittedStress, "edgeTransmission.transmittedStress", 0, 1);
  }
  inSet(result.coverageStatus, ["adequate", "limited", "unknown"] as const, "coverageStatus");
  assertInteger(result.coverageCaveats.length, "coverageCaveats.length", 0, 10_000);
  for (const [index, caveat] of result.coverageCaveats.entries()) {
    assertNonBlank(caveat, `coverageCaveats[${index}]`, 1_000);
  }
}

export function assertStressPropagationReproducibility(
  snapshot: ExposureNetworkSnapshot,
  result: StressPropagationResult,
): void {
  assertStressPropagationResultIntegrity(result);
  const replay = propagateScenarioStress(
    snapshot,
    {
      schemaVersion: 1,
      runId: result.runId,
      snapshotId: result.snapshotId,
      snapshotSha256: result.snapshotSha256,
      issuedAt: result.issuedAt,
      outputSemantics: result.outputSemantics,
      shocks: result.shocks,
      transmissionRules: result.transmissionRules,
      missingExposureMultiplier: result.missingExposureMultiplier,
      maximumRounds: result.maximumRounds,
      convergenceTolerance: result.convergenceTolerance,
      assumptions: result.assumptions,
    },
    result.completedAt,
  );
  if (replay.manifestSha256 !== result.manifestSha256) {
    throw new TypeError("stress propagation result is not reproducible from its pinned input");
  }
}

export interface ConcentrationResultBody {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly snapshotSha256: string;
  readonly nodeId: string;
  readonly direction: "incoming" | "outgoing";
  readonly currencyKey: string;
  readonly grossAmount: string;
  readonly counterpartyCount: number;
  readonly hhi: string | null;
  readonly largestCounterpartyShare: string | null;
  readonly outputSemantics: "exposure_concentration_index";
  readonly coverageStatus: "adequate" | "limited" | "unknown";
  readonly caveats: readonly string[];
}

export type ConcentrationResult = Readonly<
  ConcentrationResultBody & { readonly manifestSha256: string }
>;

export function calculateExposureConcentration(
  snapshot: ExposureNetworkSnapshot,
  nodeId: string,
  direction: "incoming" | "outgoing",
  currencyKey: string,
): ConcentrationResult {
  assertExposureNetworkSnapshotIntegrity(snapshot);
  assertUuid(nodeId, "nodeId");
  if (!snapshot.nodes.some((node) => node.nodeId === nodeId))
    throw new TypeError("nodeId is unknown");
  if (direction !== "incoming" && direction !== "outgoing") {
    throw new TypeError("direction must be incoming or outgoing");
  }
  assertKey(currencyKey, "currencyKey");
  const relevant = snapshot.edges.filter(
    (edge) =>
      edge.currencyKey === currencyKey &&
      (direction === "incoming" ? edge.targetNodeId === nodeId : edge.sourceNodeId === nodeId),
  );
  const amountsByCounterparty = new Map<string, bigint>();
  for (const edge of relevant) {
    const counterparty = direction === "incoming" ? edge.sourceNodeId : edge.targetNodeId;
    amountsByCounterparty.set(
      counterparty,
      (amountsByCounterparty.get(counterparty) ?? 0n) + fixedDecimal(edge.grossAmount),
    );
  }
  const amounts = [...amountsByCounterparty.values()];
  const total = amounts.reduce((sum, value) => sum + value, 0n);
  const squaredTotal = total * total;
  const sumOfSquares = amounts.reduce((sum, value) => sum + value * value, 0n);
  const maximum = amounts.reduce((largest, value) => (value > largest ? value : largest), 0n);
  const coverage = summarizeCoverage(snapshot);
  return immutableWithDigest<ConcentrationResultBody>({
    schemaVersion: 1,
    snapshotId: snapshot.snapshotId,
    snapshotSha256: snapshot.manifestSha256,
    nodeId,
    direction,
    currencyKey,
    grossAmount: formatFixedDecimal(total),
    counterpartyCount: amountsByCounterparty.size,
    hhi: total === 0n ? null : formatRatio(sumOfSquares, squaredTotal),
    largestCounterpartyShare: total === 0n ? null : formatRatio(maximum, total),
    outputSemantics: "exposure_concentration_index",
    coverageStatus: coverage.status,
    caveats: coverage.caveats,
  });
}

export function assertConcentrationResultIntegrity(result: ConcentrationResult): void {
  assertDigestIntegrity(result, "concentrationResult");
  assertUuid(result.snapshotId, "concentrationResult.snapshotId");
  assertSha256(result.snapshotSha256, "concentrationResult.snapshotSha256");
  assertUuid(result.nodeId, "concentrationResult.nodeId");
  if (result.direction !== "incoming" && result.direction !== "outgoing") {
    throw new TypeError("concentrationResult direction is invalid");
  }
  if (result.outputSemantics !== "exposure_concentration_index") {
    throw new TypeError("concentrationResult output semantics are invalid");
  }
  assertKey(result.currencyKey, "concentrationResult.currencyKey");
  const grossAmount = result.grossAmount;
  parseDecimal(grossAmount, "concentrationResult.grossAmount", 0, 1e30);
  assertInteger(result.counterpartyCount, "concentrationResult.counterpartyCount", 0, 10_000);
  if (result.hhi !== null) parseDecimal(result.hhi, "concentrationResult.hhi", 0, 1);
  if (result.largestCounterpartyShare !== null) {
    parseDecimal(
      result.largestCounterpartyShare,
      "concentrationResult.largestCounterpartyShare",
      0,
      1,
    );
  }
  if (
    (result.hhi === null) !== (fixedDecimal(grossAmount) === 0n) ||
    (result.largestCounterpartyShare === null) !== (fixedDecimal(grossAmount) === 0n)
  ) {
    throw new TypeError("concentrationResult absence semantics are inconsistent");
  }
  inSet(
    result.coverageStatus,
    ["adequate", "limited", "unknown"] as const,
    "concentrationResult.coverageStatus",
  );
  assertInteger(result.caveats.length, "concentrationResult.caveats.length", 0, 10_000);
  for (const [index, caveat] of result.caveats.entries()) {
    assertNonBlank(caveat, `concentrationResult.caveats[${index}]`, 1_000);
  }
}

export function assertConcentrationReproducibility(
  snapshot: ExposureNetworkSnapshot,
  result: ConcentrationResult,
): void {
  assertConcentrationResultIntegrity(result);
  const replay = calculateExposureConcentration(
    snapshot,
    result.nodeId,
    result.direction,
    result.currencyKey,
  );
  if (replay.manifestSha256 !== result.manifestSha256) {
    throw new TypeError("concentrationResult is not reproducible from its pinned snapshot");
  }
}

export interface ContagionPath {
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly pathStrength: string;
}

export interface ContagionPathReportBody {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly snapshotSha256: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly maximumHops: number;
  readonly maximumPaths: number;
  readonly maximumStates: number;
  readonly pathInputSha256: string;
  readonly transmissionRules: readonly TransmissionRule[];
  readonly outputSemantics: "scenario_transmission_path_strength";
  readonly paths: readonly ContagionPath[];
  readonly coverageStatus: "adequate" | "limited" | "unknown";
  readonly caveats: readonly string[];
}

export type ContagionPathReport = Readonly<
  ContagionPathReportBody & { readonly manifestSha256: string }
>;

interface PathState {
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly strength: number;
}

export function traceContagionPaths(
  snapshot: ExposureNetworkSnapshot,
  sourceNodeId: string,
  targetNodeId: string,
  rules: readonly TransmissionRule[],
  maximumHops = 4,
  maximumPaths = 25,
  maximumStates = 10_000,
): ContagionPathReport {
  assertExposureNetworkSnapshotIntegrity(snapshot);
  assertUuid(sourceNodeId, "sourceNodeId");
  assertUuid(targetNodeId, "targetNodeId");
  if (sourceNodeId === targetNodeId) throw new TypeError("path endpoints must differ");
  const nodeIds = new Set(snapshot.nodes.map((node) => node.nodeId));
  if (!nodeIds.has(sourceNodeId) || !nodeIds.has(targetNodeId)) {
    throw new TypeError("path endpoint is unknown");
  }
  assertInteger(maximumHops, "maximumHops", 1, 8);
  assertInteger(maximumPaths, "maximumPaths", 1, 100);
  assertInteger(maximumStates, "maximumStates", 1, 100_000);
  uniqueBy(rules, (rule) => rule.exposureKind, "rules");
  const coefficients = new Map<ExposureKind, number>();
  for (const [index, rule] of rules.entries()) {
    inSet(rule.exposureKind, EXPOSURE_KINDS, `rules[${index}].exposureKind`);
    const coefficient = parseDecimal(rule.coefficient, `rules[${index}].coefficient`, 0, 1);
    assertNonBlank(rule.rationale, `rules[${index}].rationale`, 1_000);
    coefficients.set(rule.exposureKind, coefficient);
  }
  for (const edge of snapshot.edges) {
    if (!coefficients.has(edge.kind)) throw new TypeError(`rules omit exposure kind ${edge.kind}`);
  }
  const outgoing = new Map<string, ExposureEdge[]>();
  for (const edge of snapshot.edges) {
    const current = outgoing.get(edge.sourceNodeId) ?? [];
    current.push(edge);
    outgoing.set(edge.sourceNodeId, current);
  }
  const queue: PathState[] = [{ nodeIds: [sourceNodeId], edgeIds: [], strength: 1 }];
  const matches: PathState[] = [];
  let generatedStates = 1;
  let queueHead = 0;
  while (queueHead < queue.length) {
    const state = queue[queueHead];
    queueHead += 1;
    if (!state) break;
    const last = state.nodeIds.at(-1);
    if (!last || state.edgeIds.length >= maximumHops) continue;
    for (const edge of outgoing.get(last) ?? []) {
      if (state.nodeIds.includes(edge.targetNodeId)) continue;
      const strength =
        state.strength * Number(edge.normalizedExposure) * (coefficients.get(edge.kind) ?? 0);
      if (strength === 0) continue;
      const next: PathState = {
        nodeIds: [...state.nodeIds, edge.targetNodeId],
        edgeIds: [...state.edgeIds, edge.edgeId],
        strength,
      };
      generatedStates += 1;
      if (generatedStates > maximumStates) {
        throw new TypeError("path traversal exceeded its maximum state budget");
      }
      if (edge.targetNodeId === targetNodeId) matches.push(next);
      else queue.push(next);
    }
  }
  const coverage = summarizeCoverage(snapshot);
  const normalizedRules = [...rules].sort((left, right) =>
    left.exposureKind.localeCompare(right.exposureKind),
  );
  const pathInputSha256 = digestJson({
    snapshotId: snapshot.snapshotId,
    snapshotSha256: snapshot.manifestSha256,
    sourceNodeId,
    targetNodeId,
    transmissionRules: normalizedRules,
    maximumHops,
    maximumPaths,
    maximumStates,
  });
  return immutableWithDigest<ContagionPathReportBody>({
    schemaVersion: 1,
    snapshotId: snapshot.snapshotId,
    snapshotSha256: snapshot.manifestSha256,
    sourceNodeId,
    targetNodeId,
    maximumHops,
    maximumPaths,
    maximumStates,
    pathInputSha256,
    transmissionRules: normalizedRules,
    outputSemantics: "scenario_transmission_path_strength",
    paths: matches
      .sort(
        (left, right) =>
          right.strength - left.strength || left.edgeIds.join().localeCompare(right.edgeIds.join()),
      )
      .slice(0, maximumPaths)
      .map((path) => ({
        nodeIds: path.nodeIds,
        edgeIds: path.edgeIds,
        pathStrength: decimal(path.strength),
      })),
    coverageStatus: coverage.status,
    caveats: coverage.caveats,
  });
}

export function assertContagionPathReportIntegrity(result: ContagionPathReport): void {
  assertDigestIntegrity(result, "contagionPathReport");
  if (result.outputSemantics !== "scenario_transmission_path_strength") {
    throw new TypeError("contagion path output semantics are invalid");
  }
  assertInteger(result.maximumHops, "contagionPathReport.maximumHops", 1, 8);
  assertInteger(result.maximumPaths, "contagionPathReport.maximumPaths", 1, 100);
  assertInteger(result.maximumStates, "contagionPathReport.maximumStates", 1, 100_000);
  assertUuid(result.snapshotId, "contagionPathReport.snapshotId");
  assertSha256(result.snapshotSha256, "contagionPathReport.snapshotSha256");
  assertUuid(result.sourceNodeId, "contagionPathReport.sourceNodeId");
  assertUuid(result.targetNodeId, "contagionPathReport.targetNodeId");
  if (result.sourceNodeId === result.targetNodeId) {
    throw new TypeError("contagion path endpoints must differ");
  }
  assertSha256(result.pathInputSha256, "contagionPathReport.pathInputSha256");
  assertInteger(result.transmissionRules.length, "transmissionRules.length", 1, 100);
  uniqueBy(result.transmissionRules, (rule) => rule.exposureKind, "transmissionRules");
  for (const [index, rule] of result.transmissionRules.entries()) {
    inSet(rule.exposureKind, EXPOSURE_KINDS, `transmissionRules[${index}].exposureKind`);
    parseDecimal(rule.coefficient, `transmissionRules[${index}].coefficient`, 0, 1);
    assertNonBlank(rule.rationale, `transmissionRules[${index}].rationale`, 1_000);
  }
  const normalizedRules = [...result.transmissionRules].sort((left, right) =>
    left.exposureKind.localeCompare(right.exposureKind),
  );
  const expectedInputSha256 = digestJson({
    snapshotId: result.snapshotId,
    snapshotSha256: result.snapshotSha256,
    sourceNodeId: result.sourceNodeId,
    targetNodeId: result.targetNodeId,
    transmissionRules: normalizedRules,
    maximumHops: result.maximumHops,
    maximumPaths: result.maximumPaths,
    maximumStates: result.maximumStates,
  });
  if (expectedInputSha256 !== result.pathInputSha256) {
    throw new TypeError("contagion path input digest is invalid");
  }
  assertInteger(result.paths.length, "contagionPathReport.paths.length", 0, result.maximumPaths);
  uniqueBy(result.paths, (path) => path.edgeIds.join(":"), "contagionPathReport.paths");
  for (const [index, path] of result.paths.entries()) {
    if (
      path.nodeIds.length !== path.edgeIds.length + 1 ||
      path.edgeIds.length > result.maximumHops
    ) {
      throw new TypeError(`contagionPathReport.paths[${index}] has invalid topology`);
    }
    for (const nodeId of path.nodeIds) {
      assertUuid(nodeId, `contagionPathReport.paths[${index}].nodeId`);
    }
    for (const edgeId of path.edgeIds) {
      assertUuid(edgeId, `contagionPathReport.paths[${index}].edgeId`);
    }
    if (path.nodeIds[0] !== result.sourceNodeId || path.nodeIds.at(-1) !== result.targetNodeId) {
      throw new TypeError(`contagionPathReport.paths[${index}] has invalid endpoints`);
    }
    uniqueBy(path.nodeIds, (value) => value, `contagionPathReport.paths[${index}].nodeIds`);
    parseDecimal(path.pathStrength, `contagionPathReport.paths[${index}].pathStrength`, 0, 1);
  }
  inSet(result.coverageStatus, ["adequate", "limited", "unknown"] as const, "coverageStatus");
  assertInteger(result.caveats.length, "contagionPathReport.caveats.length", 0, 10_000);
  for (const [index, caveat] of result.caveats.entries()) {
    assertNonBlank(caveat, `contagionPathReport.caveats[${index}]`, 1_000);
  }
}

export function assertContagionPathReproducibility(
  snapshot: ExposureNetworkSnapshot,
  result: ContagionPathReport,
): void {
  assertContagionPathReportIntegrity(result);
  const replay = traceContagionPaths(
    snapshot,
    result.sourceNodeId,
    result.targetNodeId,
    result.transmissionRules,
    result.maximumHops,
    result.maximumPaths,
    result.maximumStates,
  );
  if (replay.manifestSha256 !== result.manifestSha256) {
    throw new TypeError("contagion path report is not reproducible from its pinned input");
  }
}

export interface StressSensitivityInput {
  readonly low: StressPropagationInput;
  readonly base: StressPropagationInput;
  readonly high: StressPropagationInput;
}

export interface NodeSensitivityRange {
  readonly nodeId: string;
  readonly lowStress: string;
  readonly baseStress: string;
  readonly highStress: string;
}

export interface StressSensitivityResultBody {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly snapshotSha256: string;
  readonly outputSemantics: "scenario_sensitivity_range";
  readonly combinedProbability: null;
  readonly lowRunSha256: string;
  readonly baseRunSha256: string;
  readonly highRunSha256: string;
  readonly lowRun: StressPropagationResult;
  readonly baseRun: StressPropagationResult;
  readonly highRun: StressPropagationResult;
  readonly nodeRanges: readonly NodeSensitivityRange[];
  readonly caveats: readonly string[];
}

export type StressSensitivityResult = Readonly<
  StressSensitivityResultBody & { readonly manifestSha256: string }
>;

function rulesByKind(input: StressPropagationInput): Map<ExposureKind, bigint> {
  return new Map(
    input.transmissionRules.map((rule) => [rule.exposureKind, fixedDecimal(rule.coefficient)]),
  );
}

function sensitivityInvariantDigest(input: StressPropagationInput): string {
  const normalized = normalizePropagationInput(input);
  return digestJson({
    schemaVersion: normalized.schemaVersion,
    snapshotId: normalized.snapshotId,
    snapshotSha256: normalized.snapshotSha256,
    issuedAt: normalized.issuedAt,
    outputSemantics: normalized.outputSemantics,
    shocks: normalized.shocks,
    maximumRounds: normalized.maximumRounds,
    convergenceTolerance: normalized.convergenceTolerance,
    assumptions: normalized.assumptions,
  });
}

function propagationInputFromResult(result: StressPropagationResult): StressPropagationInput {
  return {
    schemaVersion: 1,
    runId: result.runId,
    snapshotId: result.snapshotId,
    snapshotSha256: result.snapshotSha256,
    issuedAt: result.issuedAt,
    outputSemantics: result.outputSemantics,
    shocks: result.shocks,
    transmissionRules: result.transmissionRules,
    missingExposureMultiplier: result.missingExposureMultiplier,
    maximumRounds: result.maximumRounds,
    convergenceTolerance: result.convergenceTolerance,
    assumptions: result.assumptions,
  };
}

export function runStressSensitivity(
  snapshot: ExposureNetworkSnapshot,
  input: StressSensitivityInput,
  completedAt: string,
): StressSensitivityResult {
  assertExposureNetworkSnapshotIntegrity(snapshot);
  validatePropagationInput(snapshot, input.low);
  validatePropagationInput(snapshot, input.base);
  validatePropagationInput(snapshot, input.high);
  if (new Set([input.low.runId, input.base.runId, input.high.runId]).size !== 3) {
    throw new TypeError("sensitivity variants require distinct run identifiers");
  }
  const invariantDigests = [
    sensitivityInvariantDigest(input.low),
    sensitivityInvariantDigest(input.base),
    sensitivityInvariantDigest(input.high),
  ];
  if (new Set(invariantDigests).size !== 1) {
    throw new TypeError(
      "sensitivity variants may change only transmission and missing-exposure assumptions",
    );
  }
  const lowRules = rulesByKind(input.low);
  const baseRules = rulesByKind(input.base);
  const highRules = rulesByKind(input.high);
  const kinds = new Set([...lowRules.keys(), ...baseRules.keys(), ...highRules.keys()]);
  for (const kind of kinds) {
    const low = lowRules.get(kind);
    const base = baseRules.get(kind);
    const high = highRules.get(kind);
    if (
      low === undefined ||
      base === undefined ||
      high === undefined ||
      low > base ||
      base > high
    ) {
      throw new TypeError(`sensitivity coefficients for ${kind} must be complete and ordered`);
    }
  }
  if (
    fixedDecimal(input.low.missingExposureMultiplier) >
      fixedDecimal(input.base.missingExposureMultiplier) ||
    fixedDecimal(input.base.missingExposureMultiplier) >
      fixedDecimal(input.high.missingExposureMultiplier)
  ) {
    throw new TypeError("missing-exposure sensitivity multipliers must be ordered");
  }
  const low = propagateScenarioStress(snapshot, input.low, completedAt);
  const base = propagateScenarioStress(snapshot, input.base, completedAt);
  const high = propagateScenarioStress(snapshot, input.high, completedAt);
  const byRun = [low, base, high].map(
    (run) => new Map(run.nodeResults.map((node) => [node.nodeId, node.totalStress])),
  );
  const nodeRanges = snapshot.nodes
    .map((node) => {
      const lowValue = byRun[0]?.get(node.nodeId) ?? "0";
      const baseValue = byRun[1]?.get(node.nodeId) ?? "0";
      const highValue = byRun[2]?.get(node.nodeId) ?? "0";
      if (
        fixedDecimal(lowValue) > fixedDecimal(baseValue) ||
        fixedDecimal(baseValue) > fixedDecimal(highValue)
      ) {
        throw new TypeError("sensitivity outputs are not monotonic under the supplied variants");
      }
      return {
        nodeId: node.nodeId,
        lowStress: lowValue,
        baseStress: baseValue,
        highStress: highValue,
      };
    })
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  return immutableWithDigest<StressSensitivityResultBody>({
    schemaVersion: 1,
    snapshotId: snapshot.snapshotId,
    snapshotSha256: snapshot.manifestSha256,
    outputSemantics: "scenario_sensitivity_range",
    combinedProbability: null,
    lowRunSha256: low.manifestSha256,
    baseRunSha256: base.manifestSha256,
    highRunSha256: high.manifestSha256,
    lowRun: low,
    baseRun: base,
    highRun: high,
    nodeRanges,
    caveats: summarizeCoverage(snapshot).caveats,
  });
}

export function assertStressSensitivityResultIntegrity(result: StressSensitivityResult): void {
  assertDigestIntegrity(result, "stressSensitivityResult");
  if (
    result.outputSemantics !== "scenario_sensitivity_range" ||
    result.combinedProbability !== null
  ) {
    throw new TypeError("sensitivity output cannot claim a combined probability");
  }
  assertStressPropagationResultIntegrity(result.lowRun);
  assertStressPropagationResultIntegrity(result.baseRun);
  assertStressPropagationResultIntegrity(result.highRun);
  if (
    result.lowRun.manifestSha256 !== result.lowRunSha256 ||
    result.baseRun.manifestSha256 !== result.baseRunSha256 ||
    result.highRun.manifestSha256 !== result.highRunSha256
  ) {
    throw new TypeError("sensitivity run digest pointer is invalid");
  }
  if (
    result.lowRun.snapshotId !== result.snapshotId ||
    result.baseRun.snapshotId !== result.snapshotId ||
    result.highRun.snapshotId !== result.snapshotId ||
    result.lowRun.snapshotSha256 !== result.snapshotSha256 ||
    result.baseRun.snapshotSha256 !== result.snapshotSha256 ||
    result.highRun.snapshotSha256 !== result.snapshotSha256
  ) {
    throw new TypeError("sensitivity runs do not share the declared snapshot");
  }
  if (new Set([result.lowRun.runId, result.baseRun.runId, result.highRun.runId]).size !== 3) {
    throw new TypeError("sensitivity variants require distinct run identifiers");
  }
  const [lowInput, baseInput, highInput] = [
    propagationInputFromResult(result.lowRun),
    propagationInputFromResult(result.baseRun),
    propagationInputFromResult(result.highRun),
  ];
  if (
    new Set([
      sensitivityInvariantDigest(lowInput),
      sensitivityInvariantDigest(baseInput),
      sensitivityInvariantDigest(highInput),
    ]).size !== 1
  ) {
    throw new TypeError(
      "sensitivity variants may change only transmission and missing-exposure assumptions",
    );
  }
  const [lowRules, baseRules, highRules] = [
    rulesByKind(lowInput),
    rulesByKind(baseInput),
    rulesByKind(highInput),
  ];
  const kinds = new Set([...lowRules.keys(), ...baseRules.keys(), ...highRules.keys()]);
  for (const kind of kinds) {
    const low = lowRules.get(kind);
    const base = baseRules.get(kind);
    const high = highRules.get(kind);
    if (
      low === undefined ||
      base === undefined ||
      high === undefined ||
      low > base ||
      base > high
    ) {
      throw new TypeError(`sensitivity coefficients for ${kind} must be complete and ordered`);
    }
  }
  if (
    fixedDecimal(lowInput.missingExposureMultiplier) >
      fixedDecimal(baseInput.missingExposureMultiplier) ||
    fixedDecimal(baseInput.missingExposureMultiplier) >
      fixedDecimal(highInput.missingExposureMultiplier)
  ) {
    throw new TypeError("missing-exposure sensitivity multipliers must be ordered");
  }
  uniqueBy(result.nodeRanges, (range) => range.nodeId, "nodeRanges");
  const lowByNode = new Map(
    result.lowRun.nodeResults.map((node) => [node.nodeId, node.totalStress]),
  );
  const baseByNode = new Map(
    result.baseRun.nodeResults.map((node) => [node.nodeId, node.totalStress]),
  );
  const highByNode = new Map(
    result.highRun.nodeResults.map((node) => [node.nodeId, node.totalStress]),
  );
  if (
    result.nodeRanges.length !== lowByNode.size ||
    result.nodeRanges.length !== baseByNode.size ||
    result.nodeRanges.length !== highByNode.size
  ) {
    throw new TypeError("sensitivity node ranges do not cover every run output");
  }
  for (const range of result.nodeRanges) {
    const low = parseDecimal(range.lowStress, "nodeRange.lowStress", 0, 1);
    const base = parseDecimal(range.baseStress, "nodeRange.baseStress", 0, 1);
    const high = parseDecimal(range.highStress, "nodeRange.highStress", 0, 1);
    if (low > base || base > high) throw new TypeError("sensitivity node range is not ordered");
    if (
      lowByNode.get(range.nodeId) !== range.lowStress ||
      baseByNode.get(range.nodeId) !== range.baseStress ||
      highByNode.get(range.nodeId) !== range.highStress
    ) {
      throw new TypeError("sensitivity node range does not match its run outputs");
    }
  }
}

export function nodeLabel(snapshot: ExposureNetworkSnapshot, nodeId: string): NetworkNode {
  assertExposureNetworkSnapshotIntegrity(snapshot);
  assertUuid(nodeId, "nodeId");
  const node = snapshot.nodes.find((candidate) => candidate.nodeId === nodeId);
  if (!node) throw new TypeError("nodeId is unknown");
  return node;
}
