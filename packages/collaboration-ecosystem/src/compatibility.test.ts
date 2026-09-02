import { describe, expect, it } from "vitest";
import {
  assertCompatibilityDecisionIntegrity,
  assertCompatible,
  type ClientCompatibilityContractInput,
  createClientCompatibilityContract,
  evaluateClientCompatibility,
} from "./compatibility.js";
import { IDS, TIMES } from "./fixtures.test-helper.js";

function contract(changes: Partial<ClientCompatibilityContractInput> = {}) {
  return createClientCompatibilityContract({
    contractId: IDS.contract,
    contractVersion: "1.0.0",
    transportApiVersion: "1.4.0",
    sdk: { minimumInclusive: "2.0.0", maximumExclusive: "3.0.0" },
    cli: { minimumInclusive: "1.5.0", maximumExclusive: "2.0.0" },
    extensionApi: { minimumInclusive: "1.0.0", maximumExclusive: "2.0.0" },
    capabilities: ["connector.read", "model.predict"],
    prereleaseAllowed: false,
    issuedAt: TIMES.issue,
    ...changes,
  });
}

describe("SDK, CLI, and extension compatibility", () => {
  it("creates a deterministic contract and accepts an in-range SDK", () => {
    const configured = contract({ capabilities: ["model.predict", "connector.read"] });
    expect(configured.capabilities).toEqual(["connector.read", "model.predict"]);
    const decision = evaluateClientCompatibility(configured, {
      clientKind: "sdk",
      clientVersion: "2.4.1",
      transportApiVersion: "1.9.0",
      requiredCapabilities: ["connector.read"],
    });
    expect(decision).toMatchObject({ compatible: true, reason: "compatible" });
    expect(() => assertCompatible(decision)).not.toThrow();
  });

  it.each([
    ["major_mismatch", "sdk", "2.4.0", "2.0.0", ["connector.read"]],
    ["prerelease_denied", "sdk", "2.4.0-beta.1", "1.4.0", ["connector.read"]],
    ["version_too_old", "sdk", "1.9.9", "1.4.0", ["connector.read"]],
    ["version_too_new", "cli", "2.0.0", "1.4.0", ["connector.read"]],
    ["capability_unsupported", "extension", "1.2.0", "1.4.0", ["unknown.use"]],
  ] as const)(
    "returns %s for incompatible clients",
    (reason, clientKind, clientVersion, api, caps) => {
      const decision = evaluateClientCompatibility(contract(), {
        clientKind,
        clientVersion,
        transportApiVersion: api,
        requiredCapabilities: caps,
      });
      expect(decision.reason).toBe(reason);
      expect(decision.compatible).toBe(false);
      expect(() => assertCompatible(decision)).toThrow(reason);
    },
  );

  it("supports explicitly allowed prereleases and rejects malformed contracts", () => {
    const decision = evaluateClientCompatibility(contract({ prereleaseAllowed: true }), {
      clientKind: "sdk",
      clientVersion: "2.1.0-beta.1",
      transportApiVersion: "1.4.0",
      requiredCapabilities: [],
    });
    expect(decision.compatible).toBe(true);
    expect(() => assertCompatibilityDecisionIntegrity(decision)).not.toThrow();
    expect(() =>
      contract({ sdk: { minimumInclusive: "3.0.0", maximumExclusive: "2.0.0" } }),
    ).toThrow(/non-empty/);
    expect(() => contract({ prereleaseAllowed: "yes" as never })).toThrow(/boolean/);
    expect(() => contract({ issuedAt: "0000-01-01T00:00:00Z" })).toThrow(/RFC 3339/);
    expect(() =>
      evaluateClientCompatibility(contract(), {
        clientKind: "browser" as never,
        clientVersion: "2.0.0",
        transportApiVersion: "1.4.0",
        requiredCapabilities: [],
      }),
    ).toThrow(/clientKind/);
    expect(() => contract({ contractVersion: "1.0.0-01" })).toThrow(/leading zero/);
    expect(() => contract({ contractVersion: "1.0.0-alpha..1" })).toThrow(/semantic version/);
  });

  it("implements SemVer precedence including numeric prerelease identifiers and build metadata", () => {
    const configured = contract({
      prereleaseAllowed: true,
      sdk: { minimumInclusive: "2.0.0-beta.1", maximumExclusive: "3.0.0" },
    });
    const beta2 = evaluateClientCompatibility(configured, {
      clientKind: "sdk",
      clientVersion: "2.0.0-beta.2+build.7",
      transportApiVersion: "1.4.0+server.1",
      requiredCapabilities: [],
    });
    const beta10 = evaluateClientCompatibility(configured, {
      clientKind: "sdk",
      clientVersion: "2.0.0-beta.10",
      transportApiVersion: "1.4.0",
      requiredCapabilities: [],
    });
    expect(beta2.reason).toBe("compatible");
    expect(beta10.reason).toBe("compatible");
  });

  it("compares bounded large core versions without numeric overflow and matches SQL limits", () => {
    const minimumMajor = "9".repeat(100);
    const maximumMajor = `1${"0".repeat(100)}`;
    const configured = contract({
      sdk: {
        minimumInclusive: `${minimumMajor}.0.0`,
        maximumExclusive: `${maximumMajor}.0.0`,
      },
    });

    expect(
      evaluateClientCompatibility(configured, {
        clientKind: "sdk",
        clientVersion: `${minimumMajor}.0.0`,
        transportApiVersion: "1.4.0",
        requiredCapabilities: [],
      }).reason,
    ).toBe("compatible");
    expect(() => contract({ contractVersion: `${"1".repeat(125)}.0.0` })).toThrow(/128/);
  });
});
