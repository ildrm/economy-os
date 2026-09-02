import {
  assertEnum,
  assertExactKeys,
  assertInteger,
  assertIsoInstant,
  assertKey,
  assertSemver,
  assertSha256,
  assertText,
  assertUniqueKeys,
  assertUuid,
  cloneCanonical,
  deepFreeze,
  digestJson,
} from "./internals.js";

export const TARGET_TASKS = ["binary_event_probability", "continuous_nowcast"] as const;
export type TargetTask = (typeof TARGET_TASKS)[number];

export interface ForecastTargetDefinitionInput {
  readonly schemaVersion: 1;
  readonly targetDefinitionId: string;
  readonly targetKey: string;
  readonly version: string;
  readonly task: TargetTask;
  readonly horizon: Readonly<{ key: string; days: number }>;
  readonly labelSemantics: string;
  readonly populationSemantics: string;
  readonly outcomeWindow: Readonly<{ startOffsetDays: number; endOffsetDays: number }>;
  readonly sourceSeriesKeys: readonly string[];
  readonly labelAvailabilityLagDays: number;
  readonly revisionPolicy: "first_release" | "fixed_vintage" | "latest_at_evaluation_cutoff";
  readonly minimumCalibrationEvents: number;
  readonly createdAt: string;
  readonly ownerId: string;
  readonly limitations: readonly string[];
}

export interface ForecastTargetDefinition extends ForecastTargetDefinitionInput {
  readonly manifestSha256: string;
}

function validateTargetBody(input: ForecastTargetDefinitionInput): void {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "targetDefinitionId",
      "targetKey",
      "version",
      "task",
      "horizon",
      "labelSemantics",
      "populationSemantics",
      "outcomeWindow",
      "sourceSeriesKeys",
      "labelAvailabilityLagDays",
      "revisionPolicy",
      "minimumCalibrationEvents",
      "createdAt",
      "ownerId",
      "limitations",
    ],
    "targetDefinition",
  );
  if (input.schemaVersion !== 1) throw new TypeError("targetDefinition.schemaVersion must be 1");
  assertUuid(input.targetDefinitionId, "targetDefinition.targetDefinitionId");
  assertKey(input.targetKey, "targetDefinition.targetKey");
  assertSemver(input.version, "targetDefinition.version");
  assertEnum(input.task, TARGET_TASKS, "targetDefinition.task");
  assertExactKeys(input.horizon, ["key", "days"], "targetDefinition.horizon");
  assertInteger(input.horizon.days, "targetDefinition.horizon.days", 0, 3_650);
  if (input.horizon.key !== (input.horizon.days === 0 ? "now" : `${input.horizon.days}d`)) {
    throw new TypeError(
      "targetDefinition.horizon key and day count must identify the same horizon",
    );
  }
  if (input.task === "binary_event_probability" && input.horizon.days === 0) {
    throw new TypeError("event-probability targets require a future horizon");
  }
  assertText(input.labelSemantics, "targetDefinition.labelSemantics", 2_000);
  assertText(input.populationSemantics, "targetDefinition.populationSemantics", 2_000);
  assertExactKeys(
    input.outcomeWindow,
    ["startOffsetDays", "endOffsetDays"],
    "targetDefinition.outcomeWindow",
  );
  assertInteger(
    input.outcomeWindow.startOffsetDays,
    "targetDefinition.outcomeWindow.startOffsetDays",
    0,
    input.horizon.days,
  );
  assertInteger(
    input.outcomeWindow.endOffsetDays,
    "targetDefinition.outcomeWindow.endOffsetDays",
    0,
    input.horizon.days,
  );
  if (input.task === "continuous_nowcast" && input.horizon.days === 0) {
    if (input.outcomeWindow.startOffsetDays !== 0 || input.outcomeWindow.endOffsetDays !== 0) {
      throw new TypeError("zero-horizon nowcast target must use a point outcome window");
    }
  } else if (input.outcomeWindow.endOffsetDays <= input.outcomeWindow.startOffsetDays) {
    throw new TypeError("target outcome window must have positive duration");
  }
  assertUniqueKeys(input.sourceSeriesKeys, "targetDefinition.sourceSeriesKeys");
  assertInteger(
    input.labelAvailabilityLagDays,
    "targetDefinition.labelAvailabilityLagDays",
    0,
    3_650,
  );
  assertEnum(
    input.revisionPolicy,
    ["first_release", "fixed_vintage", "latest_at_evaluation_cutoff"],
    "targetDefinition.revisionPolicy",
  );
  assertInteger(
    input.minimumCalibrationEvents,
    "targetDefinition.minimumCalibrationEvents",
    input.task === "binary_event_probability" ? 1 : 0,
    1_000_000,
  );
  assertIsoInstant(input.createdAt, "targetDefinition.createdAt");
  assertUuid(input.ownerId, "targetDefinition.ownerId");
  if (input.limitations.length === 0) throw new TypeError("target limitations must not be empty");
  for (const limitation of input.limitations) {
    assertText(limitation, "targetDefinition limitation", 1_000);
  }
}

export function createForecastTargetDefinition(
  input: ForecastTargetDefinitionInput,
): Readonly<ForecastTargetDefinition> {
  validateTargetBody(input);
  const body = cloneCanonical({
    ...input,
    sourceSeriesKeys: [...input.sourceSeriesKeys].sort(),
    limitations: [...input.limitations],
  });
  return deepFreeze({ ...body, manifestSha256: digestJson(body) });
}

export function assertForecastTargetDefinitionIntegrity(target: ForecastTargetDefinition): void {
  assertSha256(target.manifestSha256, "targetDefinition.manifestSha256");
  const { manifestSha256, ...body } = target;
  validateTargetBody(body);
  if (
    [...target.sourceSeriesKeys]
      .sort()
      .some((value, index) => target.sourceSeriesKeys[index] !== value)
  ) {
    throw new TypeError("target source series must use deterministic order");
  }
  if (digestJson(body) !== manifestSha256) {
    throw new TypeError("target-definition digest does not match immutable content");
  }
}
