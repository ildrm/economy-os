import { describe, expect, it } from "vitest";
import { calibrationInput, definitionInput, IDS, required } from "./fixtures.test-helper.js";
import {
  assertCalibrationIntegrity,
  assertSystemDefinitionIntegrity,
  createCalibrationManifest,
  createSystemDefinition,
  registeredKernelSource,
} from "./index.js";

describe("governed simulation definitions", () => {
  it("creates immutable, content-addressed, explicitly bounded system definitions", () => {
    const definition = createSystemDefinition(definitionInput());
    expect(definition.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.transitionEquations)).toBe(true);
    expect(definition.kernel.kernelId).toBe("bounded-linear-stock-flow.v1");
    assertSystemDefinitionIntegrity(definition);
  });

  it("binds calibration to PIT snapshots, code, model, config, evidence, and assumptions", () => {
    const definition = createSystemDefinition(definitionInput());
    const calibration = createCalibrationManifest(calibrationInput(definition), definition);
    expect(calibration).toMatchObject({
      systemDefinitionSha256: definition.manifestSha256,
      modelSha256: "a".repeat(64),
      structuralAssumptions: [{ sensitivityRequired: true }],
      parameterValues: [
        { basis: { kind: "observed_evidence" } },
        { basis: { kind: "structural_assumption" } },
      ],
    });
    assertCalibrationIntegrity(calibration, definition);
  });

  it("rejects unregistered kernels, incomplete states, unit mismatch, and unreviewed claim language", () => {
    expect(() =>
      createSystemDefinition({
        ...definitionInput(),
        kernel: { kernelId: "javascript.eval" as never, kernelVersion: "1.0.0" },
      }),
    ).toThrow("registered immutable implementation");
    expect(() =>
      createSystemDefinition({
        ...definitionInput(),
        populations: [
          { ...required(definitionInput().populations[0]), initialState: { wealth: "60" } },
        ],
      }),
    ).toThrow("every and only declared state variable");
    expect(() =>
      createSystemDefinition({
        ...definitionInput(),
        transitionEquations: [
          { ...required(definitionInput().transitionEquations[0]), outputUnit: "currency" },
          required(definitionInput().transitionEquations[1]),
        ],
      }),
    ).toThrow("outputUnit must match");
    expect(() =>
      createSystemDefinition({
        ...definitionInput(),
        claims: [
          {
            claimKey: "unsupported-causal-claim",
            kind: "causal",
            text: "An unsupported intervention claim.",
            reviewedEvidenceIds: [],
          },
        ],
      }),
    ).toThrow("claims require reviewed evidence");
    expect(() => registeredKernelSource("user-script.v1")).toThrow("user-supplied code");
  });

  it("rejects temporal leakage and mixing observed evidence with structural assumptions", () => {
    const definition = createSystemDefinition(definitionInput());
    const base = calibrationInput(definition);
    expect(() =>
      createCalibrationManifest(
        {
          ...base,
          observedEvidence: [
            { ...required(base.observedEvidence[0]), availableAt: "2026-01-01T00:00:01Z" },
          ],
        },
        definition,
      ),
    ).toThrow("future evidence");
    expect(() =>
      createCalibrationManifest(
        {
          ...base,
          parameterValues: [
            {
              ...required(base.parameterValues[0]),
              basis: { kind: "observed_evidence", evidenceIds: [IDS.author] },
            },
            required(base.parameterValues[1]),
          ],
        },
        definition,
      ),
    ).toThrow("unknown reviewed evidence");
    expect(() =>
      createCalibrationManifest(
        {
          ...base,
          structuralAssumptions: [
            {
              ...required(base.structuralAssumptions[0]),
              sensitivityRequired: false as true,
            },
          ],
        },
        definition,
      ),
    ).toThrow("require sensitivity");
  });

  it("detects content tampering and invalid exact decimals", () => {
    const definition = createSystemDefinition(definitionInput());
    expect(() =>
      assertSystemDefinitionIntegrity({
        ...definition,
        name: "Tampered definition",
      }),
    ).toThrow("digest does not match");
    expect(() =>
      createSystemDefinition({
        ...definitionInput(),
        stateVariables: [
          { ...required(definitionInput().stateVariables[0]), minimum: "0.0" },
          required(definitionInput().stateVariables[1]),
        ],
      }),
    ).toThrow("canonical exact decimal");
  });
});
