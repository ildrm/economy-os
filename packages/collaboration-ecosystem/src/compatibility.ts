import {
  assertDigestIntegrity,
  assertExactKeys,
  assertIsoInstant,
  assertKey,
  assertPlainRecord,
  assertUniqueKeys,
  assertUuid,
  compareSemver,
  immutableWithDigest,
  parseSemver,
} from "./internals.js";

export interface VersionRange {
  readonly minimumInclusive: string;
  readonly maximumExclusive: string;
}

export interface ClientCompatibilityContractInput {
  readonly contractId: string;
  readonly contractVersion: string;
  readonly transportApiVersion: string;
  readonly sdk: VersionRange;
  readonly cli: VersionRange;
  readonly extensionApi: VersionRange;
  readonly capabilities: readonly string[];
  readonly prereleaseAllowed: boolean;
  readonly issuedAt: string;
}

export type ClientCompatibilityContract = Readonly<
  ClientCompatibilityContractInput & {
    readonly schemaVersion: 1;
    readonly manifestSha256: string;
  }
>;

function validateRange(range: VersionRange, field: string): void {
  assertPlainRecord(range, field);
  assertExactKeys(range, ["minimumInclusive", "maximumExclusive"], field);
  parseSemver(range.minimumInclusive, `${field}.minimumInclusive`);
  parseSemver(range.maximumExclusive, `${field}.maximumExclusive`);
  if (compareSemver(range.minimumInclusive, range.maximumExclusive) >= 0) {
    throw new TypeError(`${field} must be a non-empty half-open range`);
  }
}

export function createClientCompatibilityContract(
  input: ClientCompatibilityContractInput,
): ClientCompatibilityContract {
  assertPlainRecord(input, "compatibility contract");
  assertExactKeys(
    input,
    [
      "contractId",
      "contractVersion",
      "transportApiVersion",
      "sdk",
      "cli",
      "extensionApi",
      "capabilities",
      "prereleaseAllowed",
      "issuedAt",
    ],
    "compatibility contract",
  );
  assertUuid(input.contractId, "compatibility contract.contractId");
  parseSemver(input.contractVersion, "compatibility contract.contractVersion");
  parseSemver(input.transportApiVersion, "compatibility contract.transportApiVersion");
  validateRange(input.sdk, "compatibility contract.sdk");
  validateRange(input.cli, "compatibility contract.cli");
  validateRange(input.extensionApi, "compatibility contract.extensionApi");
  assertUniqueKeys(input.capabilities, "compatibility contract.capabilities", 1, 200);
  if (typeof input.prereleaseAllowed !== "boolean") {
    throw new TypeError("compatibility contract.prereleaseAllowed must be boolean");
  }
  assertIsoInstant(input.issuedAt, "compatibility contract.issuedAt");
  return immutableWithDigest({
    schemaVersion: 1 as const,
    ...input,
    capabilities: [...input.capabilities].sort(),
  });
}

export type ClientKind = "sdk" | "cli" | "extension";

export type CompatibilityDecision = Readonly<{
  readonly schemaVersion: 1;
  readonly compatible: boolean;
  readonly reason:
    | "compatible"
    | "major_mismatch"
    | "version_too_old"
    | "version_too_new"
    | "prerelease_denied"
    | "capability_unsupported";
  readonly clientKind: ClientKind;
  readonly clientVersion: string;
  readonly transportApiVersion: string;
  readonly requiredCapabilities: readonly string[];
  readonly unsupportedCapabilities: readonly string[];
  readonly contractSha256: string;
  readonly manifestSha256: string;
}>;

export function assertClientCompatibilityContractIntegrity(
  contract: ClientCompatibilityContract,
): void {
  assertPlainRecord(contract, "compatibility contract");
  assertExactKeys(
    contract,
    [
      "schemaVersion",
      "contractId",
      "contractVersion",
      "transportApiVersion",
      "sdk",
      "cli",
      "extensionApi",
      "capabilities",
      "prereleaseAllowed",
      "issuedAt",
      "manifestSha256",
    ],
    "compatibility contract",
  );
  if (contract.schemaVersion !== 1) {
    throw new TypeError("compatibility contract schema is unsupported");
  }
  assertDigestIntegrity(contract, "compatibility contract");
  const { schemaVersion: _schemaVersion, manifestSha256: _manifestSha256, ...body } = contract;
  if (createClientCompatibilityContract(body).manifestSha256 !== contract.manifestSha256) {
    throw new TypeError("compatibility contract is not canonical");
  }
}

export function assertCompatibilityDecisionIntegrity(decision: CompatibilityDecision): void {
  assertPlainRecord(decision, "compatibility decision");
  assertExactKeys(
    decision,
    [
      "schemaVersion",
      "compatible",
      "reason",
      "clientKind",
      "clientVersion",
      "transportApiVersion",
      "requiredCapabilities",
      "unsupportedCapabilities",
      "contractSha256",
      "manifestSha256",
    ],
    "compatibility decision",
  );
  if (decision.schemaVersion !== 1) {
    throw new TypeError("compatibility decision schema is unsupported");
  }
  if (!("sdk cli extension" as const).split(" ").includes(decision.clientKind)) {
    throw new TypeError("compatibility decision.clientKind is invalid");
  }
  parseSemver(decision.clientVersion, "compatibility decision.clientVersion");
  parseSemver(decision.transportApiVersion, "compatibility decision.transportApiVersion");
  assertUniqueKeys(
    decision.requiredCapabilities,
    "compatibility decision.requiredCapabilities",
    0,
    200,
  );
  assertUniqueKeys(
    decision.unsupportedCapabilities,
    "compatibility decision.unsupportedCapabilities",
    0,
    200,
  );
  if (
    decision.unsupportedCapabilities.some(
      (capability) => !decision.requiredCapabilities.includes(capability),
    )
  ) {
    throw new TypeError(
      "compatibility decision has an unsupported capability that was not requested",
    );
  }
  const reasons: readonly CompatibilityDecision["reason"][] = [
    "compatible",
    "major_mismatch",
    "version_too_old",
    "version_too_new",
    "prerelease_denied",
    "capability_unsupported",
  ];
  if (
    typeof decision.compatible !== "boolean" ||
    !reasons.includes(decision.reason) ||
    decision.compatible !== (decision.reason === "compatible") ||
    (decision.reason === "capability_unsupported") !== decision.unsupportedCapabilities.length > 0
  ) {
    throw new TypeError("compatibility decision has inconsistent outcome fields");
  }
  assertDigestIntegrity(decision, "compatibility decision");
}

export function evaluateClientCompatibility(
  contract: ClientCompatibilityContract,
  input: {
    readonly clientKind: ClientKind;
    readonly clientVersion: string;
    readonly transportApiVersion: string;
    readonly requiredCapabilities: readonly string[];
  },
): CompatibilityDecision {
  assertClientCompatibilityContractIntegrity(contract);
  assertPlainRecord(input, "compatibility request");
  assertExactKeys(
    input,
    ["clientKind", "clientVersion", "transportApiVersion", "requiredCapabilities"],
    "compatibility request",
  );
  if (
    input.clientKind !== "sdk" &&
    input.clientKind !== "cli" &&
    input.clientKind !== "extension"
  ) {
    throw new TypeError("compatibility request.clientKind is invalid");
  }
  const client = parseSemver(input.clientVersion, "compatibility request.clientVersion");
  const transport = parseSemver(
    input.transportApiVersion,
    "compatibility request.transportApiVersion",
  );
  const expectedTransport = parseSemver(
    contract.transportApiVersion,
    "compatibility contract.transportApiVersion",
  );
  assertUniqueKeys(
    input.requiredCapabilities,
    "compatibility request.requiredCapabilities",
    0,
    200,
  );
  const range =
    input.clientKind === "sdk"
      ? contract.sdk
      : input.clientKind === "cli"
        ? contract.cli
        : contract.extensionApi;
  const unsupportedCapabilities = [...input.requiredCapabilities]
    .filter((capability) => !contract.capabilities.includes(capability))
    .sort();

  let reason: CompatibilityDecision["reason"];
  if (transport.major !== expectedTransport.major) reason = "major_mismatch";
  else if (!contract.prereleaseAllowed && client.prerelease !== null) reason = "prerelease_denied";
  else if (compareSemver(input.clientVersion, range.minimumInclusive) < 0)
    reason = "version_too_old";
  else if (compareSemver(input.clientVersion, range.maximumExclusive) >= 0)
    reason = "version_too_new";
  else if (unsupportedCapabilities.length > 0) reason = "capability_unsupported";
  else reason = "compatible";

  return immutableWithDigest({
    schemaVersion: 1 as const,
    compatible: reason === "compatible",
    reason,
    clientKind: input.clientKind,
    clientVersion: input.clientVersion,
    transportApiVersion: input.transportApiVersion,
    requiredCapabilities: [...input.requiredCapabilities].sort(),
    unsupportedCapabilities,
    contractSha256: contract.manifestSha256,
  });
}

export function assertCompatible(decision: CompatibilityDecision): void {
  assertCompatibilityDecisionIntegrity(decision);
  if (!decision.compatible || decision.reason !== "compatible") {
    throw new TypeError(`client contract is incompatible: ${decision.reason}`);
  }
  assertKey(decision.reason, "compatibility decision.reason");
}
