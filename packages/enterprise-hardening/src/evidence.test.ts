import { describe, expect, it } from "vitest";
import {
  ARTIFACT,
  type Mutable,
  OTHER_TENANT,
  readyFixture,
  replaceEvidence,
} from "./fixtures.test-helper.js";
import {
  admitEnterpriseEvidence,
  assertEnterpriseEvidence,
  type EnterpriseEvidenceInput,
  EVIDENCE_KINDS,
  type EvidenceKind,
  observedCapacityHeadroomBps,
  observedRecovery,
  observedSloErrorBudgets,
  REQUIRED_AUDIT_EVENT_CLASSES,
  REQUIRED_LOCALES,
} from "./index.js";

const set = (target: object, property: string, value: unknown): void => {
  Object.assign(target, { [property]: value });
};

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("required fixture item is missing");
  return value;
}

function inputFor(kind: EvidenceKind): Mutable<EnterpriseEvidenceInput> {
  const evidence = readyFixture().evidence.find((item) => item.payload.kind === kind);
  if (!evidence) throw new Error(`missing fixture for ${kind}`);
  return structuredClone({
    envelope: evidence.envelope,
    payload: evidence.payload,
  }) as Mutable<EnterpriseEvidenceInput>;
}

function reject(kind: EvidenceKind, mutate: (input: Mutable<EnterpriseEvidenceInput>) => void) {
  const input = inputFor(kind);
  mutate(input);
  expect(() => admitEnterpriseEvidence(input as EnterpriseEvidenceInput)).toThrow();
}

describe("executed enterprise evidence", () => {
  it("admits one immutable, integrity-protected external execution for every gate", () => {
    const fixture = readyFixture();
    expect(fixture.evidence).toHaveLength(EVIDENCE_KINDS.length);
    expect(new Set(fixture.evidence.map((item) => item.payload.kind)).size).toBe(
      EVIDENCE_KINDS.length,
    );
    for (const evidence of fixture.evidence) {
      expect(() => assertEnterpriseEvidence(evidence)).not.toThrow();
      expect(Object.isFrozen(evidence)).toBe(true);
      expect(Object.isFrozen(evidence.payload)).toBe(true);
      expect(evidence.envelope.evidenceSource).toBe("externally_attested_execution");
      expect(evidence.envelope.verification.detachedSignatureVerified).toBe(true);
    }
  });

  it("computes exact recovery, SLO budget, and capacity observations", () => {
    const fixture = readyFixture();
    const byKind = (kind: EvidenceKind) => {
      const evidence = fixture.evidence.find((item) => item.payload.kind === kind);
      if (!evidence) throw new Error(`missing ${kind}`);
      return evidence;
    };
    expect(observedRecovery(byKind("recovery_exercise"))).toEqual({
      rpoSeconds: 60,
      rtoSeconds: 1_800,
    });
    expect(observedCapacityHeadroomBps(byKind("load_capacity"))).toBe(2_500);
    expect(observedSloErrorBudgets(byKind("slo_window"))).toEqual([
      {
        service: "evidence-api",
        allowedBadEvents: 100,
        consumedBadEvents: 50,
        remainingBadEvents: 50,
        achievedBps: 9_995,
      },
      {
        service: "alert-triage",
        allowedBadEvents: 100,
        consumedBadEvents: 50,
        remainingBadEvents: 50,
        achievedBps: 9_995,
      },
    ]);
  });

  it("uses integer arithmetic for SLO event counts near the safe-integer boundary", () => {
    const fixture = replaceEvidence(readyFixture(), "slo_window", (input) => {
      if (input.payload.kind !== "slo_window") return;
      const metric = required(input.payload.metrics[0]);
      metric.totalEvents = 999_999_999_999;
      metric.goodEvents = 999_000_000_000;
    });
    const evidence = fixture.evidence.find((item) => item.payload.kind === "slo_window");
    if (!evidence) throw new Error("missing SLO evidence");
    expect(observedSloErrorBudgets(evidence)[0]).toEqual({
      service: "evidence-api",
      allowedBadEvents: 999_999_999,
      consumedBadEvents: 999_999_999,
      remainingBadEvents: 0,
      achievedBps: 9_990,
    });
  });

  it("rejects helper calls with the wrong evidence kind", () => {
    const evidence = required(readyFixture().evidence[0]);
    expect(() => observedRecovery(evidence)).toThrow(/recovery/);
    expect(() => observedSloErrorBudgets(evidence)).toThrow(/SLO/);
    expect(() => observedCapacityHeadroomBps(evidence)).toThrow(/load/);
  });

  it("detects evidence content tampering", () => {
    const evidence = required(readyFixture().evidence[0]);
    const tampered = structuredClone(evidence) as Mutable<typeof evidence>;
    tampered.envelope.releaseArtifactSha256 = "b".repeat(64);
    expect(() => assertEnterpriseEvidence(tampered)).toThrow(/digest/);
  });

  it.each([
    [
      "unknown envelope field",
      (value: Mutable<EnterpriseEvidenceInput>) => set(value.envelope, "plan", true),
    ],
    [
      "planned evidence class",
      (value: Mutable<EnterpriseEvidenceInput>) => set(value.envelope, "evidenceSource", "plan"),
    ],
    [
      "same producer and reviewer",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        value.envelope.reviewer = structuredClone(value.envelope.producer);
      },
    ],
    [
      "reviewer from another tenant",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        value.envelope.reviewer.tenantId = OTHER_TENANT;
      },
    ],
    [
      "completion before start",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        value.envelope.completedAt = "2026-05-31T19:59:59Z";
        value.envelope.verification.verifiedAt = "2026-05-31T20:30:00Z";
      },
    ],
    [
      "expiry at completion",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        value.envelope.expiresAt = value.envelope.completedAt;
      },
    ],
    [
      "partial revocation",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        value.envelope.revokedAt = "2026-06-01T00:00:00Z";
      },
    ],
    [
      "revocation before completion",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        value.envelope.revokedAt = "2026-05-31T21:00:00Z";
        value.envelope.revocationReason = "invalidated result";
      },
    ],
    [
      "verification before completion",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        value.envelope.verification.verifiedAt = "2026-05-31T21:59:59Z";
      },
    ],
    [
      "failed signature verification",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        set(value.envelope.verification, "detachedSignatureVerified", false);
      },
    ],
    [
      "invalid evidence URI",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        value.envelope.artifactUri = "urn:evidence:bad value";
      },
    ],
    [
      "kind mismatch",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        set(value.envelope, "kind", "scim_lifecycle");
      },
    ],
  ])("rejects invalid evidence envelope: %s", (_name, mutate) => {
    reject("identity_access", mutate);
  });

  it.each([
    [
      "identity attempt count",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind === "identity_access") value.payload.saml.attempts = 0;
      },
    ],
    [
      "identity duplicate step-up",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind === "identity_access")
          value.payload.mfa.testedStepUpActions.push("model.deploy");
      },
    ],
    [
      "SCIM impossible failures",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind === "scim_lifecycle") value.payload.failures = 31;
      },
    ],
    [
      "residency duplicate class",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind === "residency_deployment")
          required(value.payload.observedRoutes[1]).dataClass = "public";
      },
    ],
    [
      "residency empty route",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind === "residency_deployment")
          required(value.payload.observedRoutes[0]).storageRegions = [];
      },
    ],
    [
      "recovery chronology",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind === "recovery_exercise")
          value.payload.criticalServicesRestoredAt = "2026-05-31T20:59:59Z";
      },
    ],
    [
      "recovery beyond durable write",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind === "recovery_exercise")
          value.payload.recoveredThroughAt = "2026-05-31T21:59:01Z";
      },
    ],
    [
      "backup future point",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind === "backup_restore")
          value.payload.requestedPointInTime = "2026-06-02T00:00:00Z";
      },
    ],
    [
      "SLO duplicate service",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind === "slo_window")
          required(value.payload.metrics[1]).service = required(value.payload.metrics[0]).service;
      },
    ],
    [
      "SLO event count",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind === "slo_window")
          required(value.payload.metrics[0]).goodEvents = 100_001;
      },
    ],
    [
      "load percentile order",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind === "load_capacity")
          value.payload.observedResults.p99Milliseconds = 1;
      },
    ],
    [
      "penetration duplicate finding",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind === "penetration_test")
          value.payload.findings.push(structuredClone(required(value.payload.findings[0])));
      },
    ],
    [
      "penetration incomplete remediation",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind === "penetration_test")
          required(value.payload.findings[0]).remediationEvidenceSha256 = null;
      },
    ],
    [
      "privacy duplicate store",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind === "privacy_controls")
          value.payload.storesInventoried.push("postgresql");
      },
    ],
    [
      "security empty frameworks",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind === "security_compliance") value.payload.mappedFrameworks = [];
      },
    ],
    [
      "locale duplicate locale",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind === "locale_release")
          required(value.payload.locales[1]).locale = "en";
      },
    ],
    [
      "locale missing RTL result",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind !== "locale_release") return;
        const persian = value.payload.locales.find((locale) => locale.locale === "fa");
        if (persian) persian.rtlPassed = null;
      },
    ],
    [
      "commercial negative count",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind === "commercial_operations") value.payload.incorrectCharges = -1;
      },
    ],
    [
      "operations duplicate service",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind === "operational_readiness")
          required(value.payload.services[1]).service = required(value.payload.services[0]).service;
      },
    ],
    [
      "operations unsafe runbook",
      (value: Mutable<EnterpriseEvidenceInput>) => {
        if (value.payload.kind === "operational_readiness")
          required(value.payload.services[0]).runbookUri = "http://runbooks.example.test/no";
      },
    ],
  ])("rejects invalid executed payload: %s", (name, mutate) => {
    const kindByName: Record<string, EvidenceKind> = {
      "identity attempt count": "identity_access",
      "identity duplicate step-up": "identity_access",
      "SCIM impossible failures": "scim_lifecycle",
      "residency duplicate class": "residency_deployment",
      "residency empty route": "residency_deployment",
      "recovery chronology": "recovery_exercise",
      "recovery beyond durable write": "recovery_exercise",
      "backup future point": "backup_restore",
      "SLO duplicate service": "slo_window",
      "SLO event count": "slo_window",
      "load percentile order": "load_capacity",
      "penetration duplicate finding": "penetration_test",
      "penetration incomplete remediation": "penetration_test",
      "privacy duplicate store": "privacy_controls",
      "security empty frameworks": "security_compliance",
      "locale duplicate locale": "locale_release",
      "locale missing RTL result": "locale_release",
      "commercial negative count": "commercial_operations",
      "operations duplicate service": "operational_readiness",
      "operations unsafe runbook": "operational_readiness",
    };
    reject(required(kindByName[name]), mutate);
  });

  it("keeps required audit and locale sets explicit and bounded", () => {
    expect(REQUIRED_AUDIT_EVENT_CLASSES).toHaveLength(12);
    expect(REQUIRED_LOCALES).toEqual([
      "en",
      "fa",
      "de",
      "fr",
      "zh-Hans",
      "ru",
      "es",
      "pt",
      "hi",
      "ar",
      "hy",
      "tr",
    ]);
    expect(ARTIFACT).toMatch(/^[a-f0-9]{64}$/);
  });
});
