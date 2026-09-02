import { describe, expect, it } from "vitest";

import { createClientCompatibilityContract } from "./compatibility.js";
import {
  assertDeveloperPortalEntryIntegrity,
  createDeveloperPortalEntry,
  type DeveloperPortalEntryInput,
} from "./developer.js";
import { authorization, IDS, SHA_A, SHA_B, TIMES } from "./fixtures.test-helper.js";

function contract() {
  return createClientCompatibilityContract({
    contractId: IDS.contract,
    contractVersion: "1.0.0",
    transportApiVersion: "1.4.0",
    sdk: { minimumInclusive: "2.0.0", maximumExclusive: "3.0.0" },
    cli: { minimumInclusive: "1.0.0", maximumExclusive: "2.0.0" },
    extensionApi: { minimumInclusive: "1.0.0", maximumExclusive: "2.0.0" },
    capabilities: ["evidence.read", "scenario.run"],
    prereleaseAllowed: false,
    issuedAt: TIMES.issue,
  });
}

function entry(changes: Partial<DeveloperPortalEntryInput> = {}) {
  return createDeveloperPortalEntry({
    entryId: IDS.record,
    integrationId: IDS.integration,
    organizationId: IDS.organization,
    workspaceId: IDS.workspace,
    ownerPrincipalId: IDS.owner,
    actorId: IDS.owner,
    assetKind: "sdk",
    slug: "typescript-sdk",
    displayName: "EconomyOS TypeScript SDK",
    summary: "Typed access to versioned evidence resources.",
    documentationPath: "/developers/integrations/typescript-sdk",
    artifactSha256: SHA_A,
    capabilities: ["evidence.read"],
    compatibilityContract: contract(),
    extensionCertificationSha256: null,
    status: "published",
    issuedAt: TIMES.eval,
    authorization: authorization("developer.integration.manage"),
    ...changes,
  });
}

describe("developer portal contracts", () => {
  it("publishes an immutable SDK/CLI contract without credential material", () => {
    const published = entry();
    expect(published.compatibilityContractSha256).toHaveLength(64);
    expect(JSON.stringify(published)).not.toContain("secret");
    expect(Object.isFrozen(published)).toBe(true);
    expect(() => assertDeveloperPortalEntryIntegrity(published)).not.toThrow();
  });

  it("requires certified connector/model listings before publication", () => {
    expect(() => entry({ assetKind: "connector" })).toThrow(/certification/);
    expect(
      entry({
        assetKind: "connector",
        extensionCertificationSha256: SHA_B,
      }).extensionCertificationSha256,
    ).toBe(SHA_B);
    expect(() => entry({ extensionCertificationSha256: SHA_B })).toThrow(/certification/);
  });

  it("rejects capability escalation, noncanonical documentation, and cross-scope authority", () => {
    expect(() => entry({ capabilities: ["audit.read"] })).toThrow(/outside/);
    expect(() => entry({ documentationPath: "https://evil.example/docs" })).toThrow(/canonical/);
    expect(() =>
      entry({
        workspaceId: IDS.otherWorkspace,
      }),
    ).toThrow(/authorization/);
    expect(() => entry({ surprise: true } as never)).toThrow(/exactly/);
  });

  it("detects post-publication tampering", () => {
    const published = entry();
    const tampered = { ...published, status: "retired" as const };
    expect(() => assertDeveloperPortalEntryIntegrity(tampered)).toThrow(/match|digest/);
  });
});
