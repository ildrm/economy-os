import { describe, expect, it } from "vitest";
import { createGovernedFixture, principal, sha, uuid } from "./fixtures.test-helper.js";
import {
  assertClaimAuthorized,
  createApproval,
  createValidationEvidence,
  createValidationReport,
  evaluateApprovalReadiness,
  evaluateProductionReadiness,
  evaluateValidationReadiness,
} from "./governance.js";

describe("validation and approval gates", () => {
  it("enumerates exact missing evidence instead of granting readiness", () => {
    const { ledger, version } = createGovernedFixture("research");
    const result = evaluateValidationReadiness(ledger.readinessContext(version.modelVersionId));

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("validated_report_missing_or_mismatched");
    expect(result.blockers).toContain("passed_reproducibility_receipt_missing_or_mismatched");
    expect(result.blockers).toContain("independent_validation_approval_missing");
    expect(result.readinessSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(result.blockers)).toBe(true);
  });

  it("accepts exact validation, risk, business, security, and deployment evidence", () => {
    const { ledger, version } = createGovernedFixture("production");
    const context = ledger.readinessContext(version.modelVersionId);

    expect(evaluateValidationReadiness(context)).toMatchObject({ ready: true, blockers: [] });
    expect(evaluateApprovalReadiness(context)).toMatchObject({ ready: true, blockers: [] });
    expect(evaluateProductionReadiness(context)).toMatchObject({ ready: true, blockers: [] });
  });

  it("enforces high-impact validator and production-approver independence", () => {
    const { ledger, version } = createGovernedFixture("production");
    const context = ledger.readinessContext(version.modelVersionId);
    const validationApproval = context.approvals.find((item) => item.scope === "validation");
    const productionApproval = context.approvals.find(
      (item) => item.scope === "production_deployment",
    );
    if (!context.report || !validationApproval || !productionApproval) {
      throw new Error("governed fixture is incomplete");
    }
    const report = { ...context.report, validatorPrincipalId: principal.developer };

    const validationResult = evaluateValidationReadiness({
      ...context,
      report,
      approvals: [
        ...context.approvals.filter((item) => item.scope !== "validation"),
        { ...validationApproval, principalId: principal.developer },
      ],
    });
    expect(validationResult.blockers).toContain("high_impact_validator_must_be_independent");

    const productionResult = evaluateProductionReadiness({
      ...context,
      approvals: [
        ...context.approvals.filter((item) => item.scope !== "production_deployment"),
        { ...productionApproval, principalId: principal.validator },
      ],
    });
    expect(productionResult.blockers).toContain(
      "high_impact_production_approver_must_be_independent",
    );
  });

  it("binds approval scope to its responsible role", () => {
    const { version } = createGovernedFixture("proposed");
    expect(() =>
      createApproval({
        schemaVersion: 1,
        approvalId: uuid(400),
        modelVersionId: version.modelVersionId,
        subjectSha256: version.manifestSha256,
        role: "model_developer",
        scope: "validation",
        principalId: principal.developer,
        decision: "approved",
        conditions: [],
        decidedAt: "2024-12-20T00:00:00Z",
      }),
    ).toThrow(/independent_validator/);
  });

  it("never admits synthetic or demo evidence into a passing gate", () => {
    expect(() =>
      createValidationEvidence({
        schemaVersion: 1,
        evidenceId: uuid(401),
        modelVersionId: uuid(8),
        check: "calibration",
        origin: "demo",
        result: "passed",
        admittedForGate: true,
        artifactSha256: sha("a"),
        performedByPrincipalId: principal.validator,
        performedAt: "2024-12-20T00:00:00Z",
        description: "A demo-only fixture.",
      }),
    ).toThrow(/cannot be admitted/);
  });

  it("rejects internally contradictory validation reports", () => {
    const { version } = createGovernedFixture("proposed");
    expect(() =>
      createValidationReport({
        schemaVersion: 1,
        validationReportId: uuid(402),
        modelVersionId: version.modelVersionId,
        modelVersionSha256: version.manifestSha256,
        validatorPrincipalId: principal.validator,
        conditions: [
          {
            check: "leakage",
            status: "failed",
            evidenceIds: [uuid(403)],
            rationale: "The leakage sentinel found future information.",
          },
        ],
        reproducibilityReceiptId: uuid(404),
        conclusion: "validated",
        limitations: ["Leakage invalidates the result."],
        completedAt: "2024-12-20T00:00:00Z",
      }),
    ).toThrow(/cannot contain failed/);
    expect(() =>
      createValidationReport({
        schemaVersion: 1,
        validationReportId: uuid(405),
        modelVersionId: version.modelVersionId,
        modelVersionSha256: version.manifestSha256,
        validatorPrincipalId: principal.validator,
        conditions: [
          {
            check: "holdout",
            status: "not_applicable",
            evidenceIds: [uuid(406)],
            rationale: "Incorrectly cites evidence.",
          },
        ],
        reproducibilityReceiptId: uuid(407),
        conclusion: "rejected",
        limitations: ["No final holdout."],
        completedAt: "2024-12-20T00:00:00Z",
      }),
    ).toThrow(/not-applicable/);
  });
});

describe("claim authorization", () => {
  it("blocks governed claims from proposed, disabled, and retired states", () => {
    const { ledger, version } = createGovernedFixture("proposed");
    const context = ledger.readinessContext(version.modelVersionId);
    expect(() => assertClaimAuthorized(context, "proposed", "descriptive")).toThrow(/cannot issue/);
    expect(() => assertClaimAuthorized(context, "disabled", "risk_index")).toThrow(/cannot issue/);
    expect(() => assertClaimAuthorized(context, "retired", "causal_effect")).toThrow(
      /cannot issue/,
    );
  });

  it("allows probability and causal language only after their exact gates", () => {
    const proposed = createGovernedFixture("research");
    expect(() =>
      assertClaimAuthorized(
        proposed.ledger.readinessContext(proposed.version.modelVersionId),
        "research",
        "calibrated_probability",
      ),
    ).toThrow(/validation gate/);

    const governed = createGovernedFixture("production");
    const context = governed.ledger.readinessContext(governed.version.modelVersionId);
    expect(() =>
      assertClaimAuthorized(context, "production", "calibrated_probability"),
    ).not.toThrow();
    expect(() => assertClaimAuthorized(context, "production", "causal_effect")).not.toThrow();
    expect(() => assertClaimAuthorized(context, "production", "production_ready")).not.toThrow();
    expect(() => assertClaimAuthorized(context, "staged", "production_ready")).toThrow(
      /production-ready/,
    );
  });
});
