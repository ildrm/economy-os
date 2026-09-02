import { describe, expect, it } from "vitest";

import {
  type ClientCompatibilityContract,
  type CompatibilityDecision,
  createClientCompatibilityContract,
  evaluateClientCompatibility,
} from "./compatibility.js";
import {
  admitExtension,
  cloneExtensionRegistrySnapshot,
  createExtensionManifest,
  type ExtensionAdmissionInput,
  type ExtensionManifest,
  type ExtensionManifestInput,
  ExtensionRegistry,
  type ExtensionResources,
  extensionAdmissionQuotaRequestSha256,
} from "./extensions.js";
import { authorization, IDS, SHA_A, SHA_B, SHA_C, SHA_D, TIMES } from "./fixtures.test-helper.js";
import { createQuotaPolicy, type QuotaEvent, QuotaLedger } from "./quotas.js";

const RESOURCES: ExtensionResources = {
  memoryMiB: 64,
  cpuMillis: 5_000,
  wallClockMillis: 10_000,
  outputBytes: 1_000_000,
  concurrency: 1,
};

const CEILING: ExtensionResources = {
  memoryMiB: 128,
  cpuMillis: 10_000,
  wallClockMillis: 20_000,
  outputBytes: 2_000_000,
  concurrency: 2,
};

const REQUIRED_TESTS = [
  "audit_receipt",
  "deterministic_shutdown",
  "filesystem_isolation",
  "network_egress",
  "quota_enforcement",
  "tenant_boundary",
];

function manifest(changes: Partial<ExtensionManifestInput> = {}): ExtensionManifest {
  return createExtensionManifest({
    extensionId: IDS.extension,
    publisherId: IDS.publisher,
    organizationId: IDS.organization,
    kind: "connector",
    name: "fred_connector",
    version: "1.0.0",
    extensionApiVersion: "1.2.0",
    artifactSha256: SHA_A,
    runtime: "wasm",
    capabilities: ["connector.read"],
    egress: { mode: "allowlist", hosts: ["api.example.com"] },
    resources: RESOURCES,
    inputClassifications: ["public"],
    outputClassifications: ["public"],
    createdAt: TIMES.issue,
    ...changes,
  });
}

function contract(
  changes: Partial<Parameters<typeof createClientCompatibilityContract>[0]> = {},
): ClientCompatibilityContract {
  return createClientCompatibilityContract({
    contractId: IDS.contract,
    contractVersion: "1.0.0",
    transportApiVersion: "1.4.0",
    sdk: { minimumInclusive: "2.0.0", maximumExclusive: "3.0.0" },
    cli: { minimumInclusive: "1.0.0", maximumExclusive: "2.0.0" },
    extensionApi: { minimumInclusive: "1.0.0", maximumExclusive: "2.0.0" },
    capabilities: ["connector.read", "model.predict"],
    prereleaseAllowed: false,
    issuedAt: TIMES.issue,
    ...changes,
  });
}

function compatibility(
  configured = contract(),
  requiredCapabilities: readonly string[] = ["connector.read"],
): CompatibilityDecision {
  return evaluateClientCompatibility(configured, {
    clientKind: "extension",
    clientVersion: "1.2.0",
    transportApiVersion: "1.4.0",
    requiredCapabilities,
  });
}

function reserveExtensionQuota(capability = "extension.execute"): QuotaEvent {
  const ledger = new QuotaLedger(
    createQuotaPolicy({
      quotaId: IDS.quota,
      organizationId: IDS.organization,
      capability,
      mode: "hard",
      limitUnits: 10,
      windowStartsAt: TIMES.issue,
      windowEndsAt: TIMES.end,
      policyVersion: "quota.v1",
    }),
  );
  return ledger.reserve({
    reservationId: IDS.reservation,
    idempotencyKey: "extension-admission",
    requestSha256: extensionAdmissionQuotaRequestSha256({
      extensionId: IDS.extension,
      extensionVersion: "1.0.0",
      organizationId: IDS.organization,
      workspaceId: IDS.workspace,
      principalId: IDS.owner,
      requestedAt: TIMES.next,
    }),
    principalId: IDS.owner,
    organizationId: IDS.organization,
    capability,
    requestedUnits: 1,
    reservedAt: TIMES.eval,
    expiresAt: TIMES.expiry,
    authorization: authorization(capability),
  });
}

function certify(
  registry: ExtensionRegistry,
  extension: ExtensionManifest,
  configured: ClientCompatibilityContract,
  changes: Record<string, unknown> = {},
) {
  return registry.certify({
    certificationId: IDS.certification,
    extensionId: extension.extensionId,
    extensionVersion: extension.version,
    extensionManifestSha256: extension.manifestSha256,
    organizationId: extension.organizationId,
    workspaceId: IDS.workspace,
    certifiedBy: IDS.owner,
    issuedAt: TIMES.eval,
    validUntil: TIMES.expiry,
    compatibilityContract: configured,
    isolationProfileSha256: SHA_B,
    testEvidenceSha256: [SHA_C],
    passedTests: REQUIRED_TESTS,
    authorization: authorization("extension.certify"),
    ...changes,
  } as never);
}

function admittedSetup(options: { certificationContract?: ClientCompatibilityContract } = {}) {
  const registry = new ExtensionRegistry();
  const extension = registry.register(manifest());
  const configured = contract();
  const compatible = compatibility(configured);
  certify(registry, extension, options.certificationContract ?? configured);
  const input: ExtensionAdmissionInput = {
    extensionId: extension.extensionId,
    extensionVersion: extension.version,
    organizationId: IDS.organization,
    workspaceId: IDS.workspace,
    principalId: IDS.owner,
    requestedAt: TIMES.next,
    authorization: authorization("extension.admit", { evaluatedAt: TIMES.next }),
    compatibility: compatible,
    quotaReservation: reserveExtensionQuota(),
    authorizedCapabilities: ["connector.read"],
    allowedEgressHosts: ["api.example.com"],
    resourceCeiling: CEILING,
  };
  return { registry, extension, compatible, input };
}

describe("extension manifests", () => {
  it("normalizes declarations and never infers capabilities or egress", () => {
    const extension = manifest({
      capabilities: ["model.predict", "connector.read"],
      egress: { mode: "allowlist", hosts: ["z.example.com", "api.example.com"] },
      inputClassifications: ["restricted", "public"],
    });
    expect(extension.capabilities).toEqual(["connector.read", "model.predict"]);
    expect(extension.egress.hosts).toEqual(["api.example.com", "z.example.com"]);
    expect(Object.isFrozen(extension.resources)).toBe(true);
  });

  it.each([
    [{ kind: "script" }, /kind/],
    [{ runtime: "host" }, /runtime/],
    [{ capabilities: ["extension.certify"] }, /administrative/],
    [{ egress: { mode: "denied", hosts: ["api.example.com"] } }, /empty/],
    [{ egress: { mode: "allowlist", hosts: [] } }, /required/],
    [{ egress: { mode: "allowlist", hosts: ["localhost"] } }, /public DNS/],
    [{ resources: { ...RESOURCES, memoryMiB: 1 } }, /integer/],
    [{ inputClassifications: ["secret"] }, /classification/],
  ] as const)("rejects unsafe manifest %j", (changes, error) => {
    expect(() => manifest(changes as never)).toThrow(error);
  });
});

describe("extension certification and revocation", () => {
  it("registers immutably, certifies complete isolation evidence, and snapshots", () => {
    const registry = new ExtensionRegistry();
    const extension = manifest();
    expect(registry.register(extension)).toBe(extension);
    expect(registry.register(extension)).toBe(extension);
    const configured = contract();
    const certification = certify(registry, extension, configured);
    expect(certification.passedTests).toEqual([...REQUIRED_TESTS].sort());
    expect(
      registry.certificationAt(extension.extensionId, extension.version, IDS.workspace, TIMES.next),
    ).toBe(certification);
    expect(
      registry.certificationAt(
        extension.extensionId,
        extension.version,
        IDS.otherWorkspace,
        TIMES.next,
      ),
    ).toBeNull();
    expect(
      cloneExtensionRegistrySnapshot(registry, [{ extensionId: IDS.extension, version: "1.0.0" }]),
    ).toEqual([extension]);
    expect(() => registry.register(manifest({ artifactSha256: SHA_D }))).toThrow(/immutable/);
    expect(() =>
      cloneExtensionRegistrySnapshot(registry, [{ extensionId: IDS.extension2, version: "1.0.0" }]),
    ).toThrow(/unknown/);
  });

  it("rejects incomplete, duplicate, unknown, and cross-tenant certification", () => {
    const registry = new ExtensionRegistry();
    const extension = registry.register(manifest());
    const configured = contract();
    expect(() =>
      certify(registry, extension, configured, { passedTests: ["tenant_boundary"] }),
    ).toThrow(/mandatory/);
    expect(() =>
      certify(registry, extension, configured, { extensionManifestSha256: SHA_D }),
    ).toThrow(/bind/);
    certify(registry, extension, configured);
    expect(() => certify(registry, extension, configured)).toThrow(/ID already/);

    const selfCertificationRegistry = new ExtensionRegistry();
    const selfPublished = selfCertificationRegistry.register(manifest({ publisherId: IDS.owner }));
    expect(() => certify(selfCertificationRegistry, selfPublished, configured)).toThrow(
      /publisher cannot certify/,
    );
  });

  it("revokes append-only and blocks recertification", () => {
    const registry = new ExtensionRegistry();
    const extension = registry.register(manifest());
    const configured = contract();
    certify(registry, extension, configured);
    const revokedAt = TIMES.next;
    const revocation = registry.revoke({
      revocationId: IDS.revocation,
      extensionId: extension.extensionId,
      extensionVersion: extension.version,
      organizationId: IDS.organization,
      workspaceId: IDS.workspace,
      revokedBy: IDS.owner,
      revokedAt,
      reason: "Provider security incident.",
      authorization: authorization("extension.revoke", { evaluatedAt: revokedAt }),
    });
    expect(registry.revocationAt(extension.extensionId, extension.version, TIMES.later)).toBe(
      revocation,
    );
    expect(registry.revocationAt(extension.extensionId, extension.version, TIMES.eval)).toBeNull();
    expect(() =>
      registry.revoke({
        revocationId: IDS.revocation,
        extensionId: extension.extensionId,
        extensionVersion: extension.version,
        organizationId: IDS.organization,
        workspaceId: IDS.workspace,
        revokedBy: IDS.owner,
        revokedAt: TIMES.later,
        reason: "Duplicate.",
        authorization: authorization("extension.revoke", { evaluatedAt: TIMES.later }),
      }),
    ).toThrow(/ID already/);
    expect(() =>
      certify(registry, extension, configured, {
        certificationId: "e0000000-0000-4000-8000-000000000009",
        issuedAt: TIMES.later,
        authorization: authorization("extension.certify", { evaluatedAt: TIMES.later }),
      }),
    ).toThrow(/revoked/);
  });
});

describe("extension admission", () => {
  it("admits only when certification, compatibility, policy, quota, and isolation agree", () => {
    const { registry, input } = admittedSetup();
    const receipt = admitExtension(registry, input);
    expect(receipt).toMatchObject({ admitted: true, reason: "admitted", isolationRuntime: "wasm" });
    expect(receipt.certificationSha256).toHaveLength(64);
  });

  it("denies unregistered, uncertified, revoked, and contract-mismatched versions", () => {
    const { registry, input } = admittedSetup();
    expect(
      admitExtension(new ExtensionRegistry(), { ...input, extensionId: IDS.extension2 }).reason,
    ).toBe("extension_not_registered");

    const uncertified = new ExtensionRegistry();
    uncertified.register(manifest());
    expect(admitExtension(uncertified, input).reason).toBe("extension_uncertified");

    const mismatch = admittedSetup({
      certificationContract: contract({ contractVersion: "1.0.1" }),
    });
    expect(admitExtension(mismatch.registry, mismatch.input).reason).toBe(
      "certification_contract_mismatch",
    );

    registry.revoke({
      revocationId: IDS.revocation,
      extensionId: IDS.extension,
      extensionVersion: "1.0.0",
      organizationId: IDS.organization,
      workspaceId: IDS.workspace,
      revokedBy: IDS.owner,
      revokedAt: TIMES.next,
      reason: "Emergency revocation.",
      authorization: authorization("extension.revoke", { evaluatedAt: TIMES.next }),
    });
    expect(admitExtension(registry, input).reason).toBe("extension_revoked");
  });

  it.each([
    [
      "authorization_denied",
      {
        authorization: authorization("extension.admit", {
          principalId: IDS.viewer,
          evaluatedAt: TIMES.next,
        }),
        principalId: IDS.viewer,
      },
    ],
    ["capability_denied", { authorizedCapabilities: [] }],
    ["egress_denied", { allowedEgressHosts: [] }],
    ["resources_denied", { resourceCeiling: { ...CEILING, memoryMiB: 32 } }],
    [
      "extension_uncertified",
      {
        workspaceId: IDS.otherWorkspace,
      },
    ],
  ] as const)("returns %s for a failed admission gate", (reason, changes) => {
    const { registry, input } = admittedSetup();
    expect(
      admitExtension(registry, { ...input, ...changes } as ExtensionAdmissionInput).reason,
    ).toBe(reason);
  });

  it("denies incompatible clients and invalid quota reservations", () => {
    const configured = contract();
    const incompatible = compatibility(configured, ["unknown.use"]);
    const registry = new ExtensionRegistry();
    const extension = registry.register(manifest());
    expect(() =>
      certify(registry, extension, contract({ capabilities: ["model.predict"] })),
    ).toThrow(/incompatible/);
    const certified = admittedSetup();
    expect(
      admitExtension(certified.registry, {
        ...certified.input,
        compatibility: incompatible,
      }).reason,
    ).toBe("certification_contract_mismatch");

    const good = admittedSetup();
    expect(
      admitExtension(good.registry, {
        ...good.input,
        quotaReservation: reserveExtensionQuota("webhook.manage"),
      }).reason,
    ).toBe("quota_denied");
  });

  it("rejects undeclared host syntax and tampered quota evidence", () => {
    const { registry, input } = admittedSetup();
    expect(() => admitExtension(registry, { ...input, allowedEgressHosts: ["127.0.0.1"] })).toThrow(
      /public DNS/,
    );
    const tampered = JSON.parse(JSON.stringify(input.quotaReservation)) as QuotaEvent;
    Object.assign(tampered, { quantityUnits: 99 });
    expect(() => admitExtension(registry, { ...input, quotaReservation: tampered })).toThrow(
      /digest/,
    );
  });

  it("binds quota evidence to the exact principal, workspace, extension, and admission time", () => {
    const { registry, input } = admittedSetup();
    const otherRequestLedger = new QuotaLedger(
      createQuotaPolicy({
        quotaId: IDS.quota,
        organizationId: IDS.organization,
        capability: "extension.execute",
        mode: "hard",
        limitUnits: 10,
        windowStartsAt: TIMES.issue,
        windowEndsAt: TIMES.end,
        policyVersion: "quota.v1",
      }),
    );
    const otherRequest = otherRequestLedger.reserve({
      reservationId: IDS.reservation2,
      idempotencyKey: "another-workspace",
      requestSha256: extensionAdmissionQuotaRequestSha256({
        extensionId: IDS.extension,
        extensionVersion: "1.0.0",
        organizationId: IDS.organization,
        workspaceId: IDS.otherWorkspace,
        principalId: IDS.owner,
        requestedAt: TIMES.next,
      }),
      principalId: IDS.owner,
      organizationId: IDS.organization,
      capability: "extension.execute",
      requestedUnits: 1,
      reservedAt: TIMES.eval,
      expiresAt: TIMES.expiry,
      authorization: authorization("extension.execute"),
    });
    expect(admitExtension(registry, { ...input, quotaReservation: otherRequest }).reason).toBe(
      "quota_denied",
    );
  });
});
