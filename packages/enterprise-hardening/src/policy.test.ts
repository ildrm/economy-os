import { describe, expect, it } from "vitest";
import { type Mutable, policyInput, topologyInput } from "./fixtures.test-helper.js";
import {
  assertEnterpriseTenantPolicy,
  assertProductionTopology,
  createEnterpriseTenantPolicy,
  createProductionTopology,
  type EnterpriseTenantPolicyInput,
  type ProductionTopologyInput,
  reviseEnterpriseTenantPolicy,
  topologyServiceNames,
} from "./index.js";
import { digest, freeze, httpsOrUrn, integer, key, record, text } from "./internals.js";

const mutablePolicy = (): Mutable<EnterpriseTenantPolicyInput> =>
  structuredClone(policyInput()) as Mutable<EnterpriseTenantPolicyInput>;
const set = (target: object, property: string, value: unknown): void => {
  Object.assign(target, { [property]: value });
};

describe("enterprise tenant policy", () => {
  it("creates deterministic deeply immutable policy and topology manifests", () => {
    const left = createEnterpriseTenantPolicy(policyInput());
    const right = createEnterpriseTenantPolicy(policyInput());
    expect(left.manifestSha256).toBe(right.manifestSha256);
    expect(Object.isFrozen(left)).toBe(true);
    expect(Object.isFrozen(left.residency.routes[0])).toBe(true);

    const topology = createProductionTopology(topologyInput(left.manifestSha256), left);
    expect(topologyServiceNames(topology)).toEqual(["alert-triage", "evidence-api"]);
    expect(Object.isFrozen(topology.criticalServices)).toBe(true);
    expect(() => assertProductionTopology(topology, left)).not.toThrow();
  });

  it("requires a contiguous immutable revision chain", () => {
    const first = createEnterpriseTenantPolicy(policyInput());
    const next = mutablePolicy();
    next.policyVersion = 2;
    next.previousManifestSha256 = first.manifestSha256;
    next.createdAt = "2026-01-02T00:00:00Z";
    const second = reviseEnterpriseTenantPolicy(first, next);
    expect(second.policyVersion).toBe(2);

    const broken = structuredClone(next);
    broken.policyVersion = 4;
    expect(() => reviseEnterpriseTenantPolicy(first, broken)).toThrow(/revision/);
    const orphan = mutablePolicy();
    orphan.policyVersion = 2;
    expect(() => createEnterpriseTenantPolicy(orphan)).toThrow(/predecessor/);
    const falseGenesis = mutablePolicy();
    falseGenesis.previousManifestSha256 = "a".repeat(64);
    expect(() => createEnterpriseTenantPolicy(falseGenesis)).toThrow(/initial policy/);
  });

  it("detects content tampering", () => {
    const policy = createEnterpriseTenantPolicy(policyInput());
    const tampered = structuredClone(policy) as Mutable<typeof policy>;
    tampered.reliability.criticalRpoTargetSeconds = 301;
    expect(() => assertEnterpriseTenantPolicy(tampered)).toThrow(/digest/);

    const topology = createProductionTopology(topologyInput(policy.manifestSha256), policy);
    const damaged = structuredClone(topology) as Mutable<typeof topology>;
    damaged.regions[0] = "us-east-1";
    expect(() => assertProductionTopology(damaged, policy)).toThrow(/digest/);
  });

  it.each([
    ["unknown field", (value: Mutable<EnterpriseTenantPolicyInput>) => set(value, "extra", true)],
    ["schema", (value: Mutable<EnterpriseTenantPolicyInput>) => set(value, "schemaVersion", 2)],
    ["tenant", (value: Mutable<EnterpriseTenantPolicyInput>) => set(value, "tenantId", "bad")],
    ["version", (value: Mutable<EnterpriseTenantPolicyInput>) => set(value, "policyVersion", 0)],
    [
      "predecessor",
      (value: Mutable<EnterpriseTenantPolicyInput>) => set(value, "previousManifestSha256", "bad"),
    ],
    [
      "creator tenant",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        set(value.createdBy, "tenantId", "99999999-9999-4999-8999-999999999999"),
    ],
    [
      "creator role",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        set(value.createdBy, "role", "release_assessor"),
    ],
    [
      "SAML",
      (value: Mutable<EnterpriseTenantPolicyInput>) => set(value.identity, "samlRequired", false),
    ],
    [
      "encrypted assertion type",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        set(value.identity, "encryptedAssertionsRequired", "yes"),
    ],
    [
      "IdP digest",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        set(value.identity, "idpConfigurationSha256", "bad"),
    ],
    [
      "clock skew",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        set(value.identity, "allowedClockSkewSeconds", 301),
    ],
    [
      "step up duplicate",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        value.identity.stepUpActions.push("model.deploy"),
    ],
    [
      "session maximum",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        set(value.identity.session, "maximumLifetimeSeconds", 10),
    ],
    [
      "session hardening",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        set(value.identity.session, "csrfProtectionRequired", false),
    ],
    [
      "SCIM required",
      (value: Mutable<EnterpriseTenantPolicyInput>) => set(value.scim, "required", false),
    ],
    [
      "SCIM digest",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        set(value.scim, "configurationSha256", "bad"),
    ],
    [
      "SCIM target",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        set(value.scim, "provisioningTargetSeconds", 0),
    ],
    [
      "deployment mode",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        set(value.residency, "deploymentMode", "unknown"),
    ],
    [
      "primary region",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        set(value.residency, "primaryRegion", "us-east-1"),
    ],
    [
      "duplicate class",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        set(value.residency.routes[1] ?? {}, "dataClass", "public"),
    ],
    [
      "disallowed route",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        value.residency.routes[0]?.storageRegions.push("us-east-1"),
    ],
    [
      "failure domains",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        set(value.reliability, "minimumFailureDomains", 2),
    ],
    [
      "SLO target",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        set(value.reliability, "minimumSloObjectiveBps", 8_999),
    ],
    [
      "privacy target",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        set(value.privacy, "deletionTargetSeconds", 0),
    ],
    [
      "legal hold",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        set(value.privacy, "legalHoldEnforcementRequired", false),
    ],
    [
      "locale coverage",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        set(value.localization, "generalCoverageThresholdBps", 8_999),
    ],
    [
      "human review",
      (value: Mutable<EnterpriseTenantPolicyInput>) =>
        set(value.localization, "humanReviewRequired", false),
    ],
  ])("rejects invalid policy: %s", (_name, mutate) => {
    const candidate = mutablePolicy();
    mutate(candidate);
    expect(() => createEnterpriseTenantPolicy(candidate as EnterpriseTenantPolicyInput)).toThrow();
  });

  it.each([
    ["unknown", (value: Mutable<ProductionTopologyInput>) => set(value, "extra", true)],
    ["schema", (value: Mutable<ProductionTopologyInput>) => set(value, "schemaVersion", 2)],
    [
      "declarer",
      (value: Mutable<ProductionTopologyInput>) =>
        set(value.declaredBy, "role", "release_assessor"),
    ],
    ["few domains", (value: Mutable<ProductionTopologyInput>) => value.failureDomains.pop()],
    [
      "duplicate service",
      (value: Mutable<ProductionTopologyInput>) =>
        set(value.criticalServices[1] ?? {}, "service", "evidence-api"),
    ],
    [
      "unknown service domain",
      (value: Mutable<ProductionTopologyInput>) =>
        value.criticalServices[0]?.activeFailureDomains.push("unknown-zone"),
    ],
    [
      "stateful type",
      (value: Mutable<ProductionTopologyInput>) =>
        set(value.criticalServices[0] ?? {}, "stateful", "yes"),
    ],
    ["control", (value: Mutable<ProductionTopologyInput>) => set(value, "tlsEverywhere", false)],
    [
      "policy pin",
      (value: Mutable<ProductionTopologyInput>) =>
        set(value, "policyManifestSha256", "f".repeat(64)),
    ],
    ["region", (value: Mutable<ProductionTopologyInput>) => value.regions.push("us-east-1")],
  ])("rejects invalid topology: %s", (_name, mutate) => {
    const policy = createEnterpriseTenantPolicy(policyInput());
    const candidate = structuredClone(
      topologyInput(policy.manifestSha256),
    ) as Mutable<ProductionTopologyInput>;
    mutate(candidate);
    expect(() => createProductionTopology(candidate as ProductionTopologyInput, policy)).toThrow();
  });
});

describe("bounded canonical primitives", () => {
  it("rejects non-records, exotic records, invalid keys, bounds, and unsafe URLs", () => {
    expect(() => record([], "value")).toThrow(/plain record/);
    expect(() => record(new Date(), "value")).toThrow(/plain record/);
    expect(() => key("UPPER", "key")).toThrow(/canonical/);
    expect(() => integer(Number.NaN, "count", 0, 2)).toThrow(/integer/);
    expect(() => text(" spaced ", "text")).toThrow(/nonblank/);
    expect(() => httpsOrUrn("http://example.test", "uri")).toThrow(/HTTPS/);
    expect(() => httpsOrUrn("https://user:pass@example.test", "uri")).toThrow(/HTTPS/);
    expect(() => httpsOrUrn("not a uri", "uri")).toThrow(/HTTPS/);
    expect(() => httpsOrUrn("urn:evidence:ok", "uri")).not.toThrow();
  });

  it("rejects noncanonical JSON and freezes recursively", () => {
    expect(() => digest({ amount: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
    expect(() => digest({ absent: undefined })).toThrow(/canonical JSON/);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => digest(cyclic)).toThrow(/cycle/);
    expect(digest({ value: -0 })).toBe(digest({ value: 0 }));
    const frozen = freeze({ nested: { ok: true } });
    expect(Object.isFrozen(frozen.nested)).toBe(true);
  });
});
