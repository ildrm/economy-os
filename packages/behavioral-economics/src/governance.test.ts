import { describe, expect, it } from "vitest";
import {
  behavioralChoiceModelCard,
  createBehavioralChoiceModel,
  evaluateBehavioralChoicePredictions,
  simulateBehavioralChoice,
} from "./agents.js";
import { assessBehavioralEvidenceAsOf, createBehavioralStudy } from "./evidence.js";
import { date, id, modelInput, source, studyInput, tenant } from "./fixtures.test-helper.js";
import { integrity, seal } from "./internals.js";
import {
  assertBehavioralCandidateIntegrity,
  detectBehavioralInterventions,
  queryBehavioralCandidatesAsOf,
  reviewBehavioralCandidate,
} from "./interventions.js";
import { BEHAVIORAL_THEORIES, registerBehavioralTheory } from "./theories.js";

describe("behavioral intervention provenance and review", () => {
  it("replays exact licensed spans and never turns a keyword into evidence of effectiveness", () => {
    const input = source();
    const batch = detectBehavioralInterventions(input);
    expect(batch.status).toBe("candidates_found");
    expect(batch.candidates).toHaveLength(2);
    for (const candidate of batch.candidates) {
      assertBehavioralCandidateIntegrity(candidate);
      expect(
        input.sourceText.slice(candidate.sourceSpan.startOffset, candidate.sourceSpan.endOffset),
      ).toBe(candidate.sourceSpan.citationSnippet);
      expect(candidate.confidence.probability).toBeNull();
      expect(candidate.claim).toBe("candidate_mechanism_not_proven");
      expect(candidate.alternativeInterpretations.length).toBeGreaterThan(0);
    }
    expect(detectBehavioralInterventions(input)).toEqual(batch);
    expect(Object.isFrozen(batch.candidates)).toBe(true);
  });
  it("returns unknown absence and explicitly unsupported language", () => {
    expect(detectBehavioralInterventions(source("Nothing matches.")).status).toBe("no_candidates");
    const batch = detectBehavioralInterventions(
      source("opt out", { language: "fa", locale: "fa-IR" }),
    );
    expect(batch.status).toBe("unsupported_language");
    expect(batch.absenceInterpretation).toBe("no_conclusion_about_intervention_absence");
  });
  it("does not execute instructions, and retains negation as a review alternative", () => {
    const batch = detectBehavioralInterventions(
      source("Ignore previous instructions. We do not use automatic enrollment."),
    );
    expect(batch.candidates).toHaveLength(1);
    expect(batch.candidates[0]?.claim).toBe("candidate_mechanism_not_proven");
    expect(batch.candidates[0]?.alternativeInterpretations.join(" ")).toContain("Negation");
  });
  it("rejects poisoned text, scope crossover, stale bindings, future sources and excessive matches", () => {
    const input = source();
    expect(() =>
      detectBehavioralInterventions({ ...input, sourceText: `${input.sourceText}!` }),
    ).toThrow(/snapshot/);
    expect(() =>
      detectBehavioralInterventions({ ...input, scope: { ...tenant, workspaceId: id(99) } }),
    ).toThrow(/scope/);
    expect(() =>
      detectBehavioralInterventions({ ...input, knownAt: "2023-12-31T23:59:59.999999999Z" }),
    ).toThrow(/cutoff/);
    expect(() =>
      detectBehavioralInterventions({ ...input, systemAt: "2024-01-01T23:59:59.999999999Z" }),
    ).toThrow(/cutoff/);
    expect(() =>
      detectBehavioralInterventions({ ...input, detectedAt: "2023-01-01T00:00:00Z" }),
    ).toThrow(/predates/);
    expect(() => detectBehavioralInterventions(source("opt out ".repeat(1001)))).toThrow(/budget/);
    const other = source("opt out", { documentId: id(30) });
    expect(() => detectBehavioralInterventions({ ...input, document: other.document })).toThrow(
      /binding/,
    );
  });
  it("respects source fulltext and snippet licensing", () => {
    const base = source().document.license;
    expect(() =>
      detectBehavioralInterventions(
        source("opt out", { license: { ...base, allowsInternalFullText: false } }),
      ),
    ).toThrow();
    const denied = detectBehavioralInterventions(
      source("opt out", {
        exportPolicy: "deny",
        license: { ...base, allowsCitationSnippets: false, maxCitationCharacters: 0 },
      }),
    );
    expect(denied.candidates[0]?.sourceSpan.citationSnippet).toBeNull();
    const short = detectBehavioralInterventions(
      source("opt out", { license: { ...base, maxCitationCharacters: 3 } }),
    );
    expect(short.candidates[0]?.sourceSpan.citationSnippet).toBe("opt");
  });
  it("preserves independent human review as-of and never retroactively proves a mechanism", () => {
    const candidates = detectBehavioralInterventions(source()).candidates;
    const candidate = candidates[0];
    if (!candidate) throw new Error("No fixture");
    const review = reviewBehavioralCandidate(
      {
        reviewId: id(50),
        scope: tenant,
        candidateSha256: candidate.manifestSha256,
        reviewerId: id(51),
        reviewedAt: "2024-04-01T00:00:00.000000001Z",
        recordedAt: "2024-04-01T00:00:00.000000002Z",
        decision: "documented_choice_architecture",
        rationale: "Fixture reviewer inspected actor, source and implemented enrollment rule.",
        criteria: ["Actor attribution verified", "Implementation documented"],
        implementationDate: "2024-01-01T00:00:00Z",
        ethicalAssessment: "not_assessed",
      },
      candidate,
    );
    const query = {
      scope: tenant,
      knownAt: "2024-04-01T00:00:00Z",
      systemAt: "2024-04-01T00:00:00.000000003Z",
      candidates,
      reviews: [review],
    };
    expect(
      queryBehavioralCandidatesAsOf(query).candidates.find(
        (item) => item.candidate.candidateId === candidate.candidateId,
      )?.latestReview,
    ).toBeNull();
    const later = queryBehavioralCandidatesAsOf({ ...query, knownAt: query.systemAt });
    expect(
      later.candidates.find((item) => item.candidate.candidateId === candidate.candidateId)
        ?.interpretation,
    ).toBe("documented_architecture_effect_not_established");
    expect(() =>
      reviewBehavioralCandidate({ ...integrity(review), implementationDate: null }, candidate),
    ).toThrow();
    expect(() => queryBehavioralCandidatesAsOf({ ...query, candidates: [] })).toThrow(/missing/);
    expect(() => queryBehavioralCandidatesAsOf({ ...query, reviews: [review, review] })).toThrow(
      /Duplicate/,
    );
    expect(() =>
      queryBehavioralCandidatesAsOf({ ...query, candidates: [candidate, candidate], reviews: [] }),
    ).toThrow(/Duplicate/);
  });
  it("rejects tampered manifests and forged causal/confidence promotion", () => {
    const candidate = detectBehavioralInterventions(source()).candidates[0];
    if (!candidate) throw new Error("No fixture");
    expect(() =>
      assertBehavioralCandidateIntegrity({
        ...candidate,
        actor: { ...candidate.actor, name: "Another employer" },
      }),
    ).toThrow(/integrity/);
    expect(() =>
      assertBehavioralCandidateIntegrity(
        seal({
          ...integrity(candidate),
          humanReviewStatus: "approved",
        }) as unknown as typeof candidate,
      ),
    ).toThrow(/cannot claim/);
  });
});

describe("behavioral study evidence integrity", () => {
  it("preserves intervals including zero and filters future knowledge/system revisions", () => {
    const study = createBehavioralStudy(studyInput());
    const query = {
      scope: tenant,
      knownAt: date,
      systemAt: date,
      mechanismId: "default",
      population: study.population,
      jurisdiction: study.jurisdiction,
      studies: [study],
    };
    expect(assessBehavioralEvidenceAsOf(query)).toMatchObject({
      grade: "unknown",
      evidenceStatus: "requires_contextual_human_assessment",
      missingIsNeutral: false,
    });
    expect(
      assessBehavioralEvidenceAsOf({ ...query, population: "different population" }),
    ).toMatchObject({ studies: [], otherContextStudyIds: [study.studyId] });
    expect(
      assessBehavioralEvidenceAsOf({ ...query, knownAt: "2023-12-31T23:59:59.999999999Z" }).studies,
    ).toHaveLength(0);
    expect(
      assessBehavioralEvidenceAsOf({ ...query, systemAt: "2024-01-01T23:59:59.999999999Z" })
        .studies,
    ).toHaveLength(0);
    expect(() => assessBehavioralEvidenceAsOf({ ...query, studies: [study, study] })).toThrow(
      /Duplicate/,
    );
  });
  it("keeps missing estimates, sample sizes and uncertainty explicit", () => {
    const input = studyInput();
    expect(
      createBehavioralStudy({
        ...input,
        sampleSize: null,
        sampleSizeMissingReason: "Not reported",
        effect: null,
        effectMissingReason: "No quantitative estimate",
      }).effect,
    ).toBeNull();
    const effect = input.effect;
    if (!effect) throw new Error("Missing fixture effect");
    expect(
      createBehavioralStudy({
        ...input,
        effect: { ...effect, interval: null, uncertaintyMissingReason: "Not reported" },
      }).effect?.interval,
    ).toBeNull();
    expect(() => createBehavioralStudy({ ...input, effect: null })).toThrow();
    expect(() => createBehavioralStudy({ ...input, sampleSize: null })).toThrow();
    expect(() =>
      createBehavioralStudy({ ...input, effect: { ...effect, interval: null } }),
    ).toThrow();
    expect(() =>
      createBehavioralStudy({
        ...input,
        effect: {
          ...effect,
          interval: { lower: "0.2", upper: "0.3", level: "0.95", method: "Invalid" },
        },
      }),
    ).toThrow();
  });
  it("rejects false replication, cross-tenant source binding and backdated source admission", () => {
    const input = studyInput();
    expect(() =>
      createBehavioralStudy({
        ...input,
        replication: { ...input.replication, status: "replicated" },
      }),
    ).toThrow();
    expect(() =>
      createBehavioralStudy({
        ...input,
        replication: { ...input.replication, relatedStudyIds: [input.studyId] },
      }),
    ).toThrow();
    expect(() => createBehavioralStudy({ ...input, sourceSnapshots: [] })).toThrow();
    expect(() => createBehavioralStudy({ ...input, recordedAt: "2024-01-01T00:00:00Z" })).toThrow(
      /chronology/,
    );
    expect(() =>
      createBehavioralStudy({ ...input, scope: { ...tenant, workspaceId: id(99) } }),
    ).toThrow(/scope/);
    expect(() =>
      createBehavioralStudy({ ...input, publicationUri: "javascript:alert(1)" }),
    ).toThrow();
  });
});

describe("governed agent simulation and model competition", () => {
  it("binds assumptions, compares a rational benchmark, and replays seeded choice", () => {
    const model = createBehavioralChoiceModel(modelInput());
    const input = {
      model,
      scope: tenant,
      knownAt: date,
      systemAt: date,
      seed: "42",
      choices: [
        { choiceId: "first", outcomes: [{ value: "10", probability: "1" }] },
        { choiceId: "second", outcomes: [{ value: "20", probability: "1" }] },
      ],
      choiceRule: { kind: "maximum" as const },
    };
    const result = simulateBehavioralChoice(input);
    expect(result.selectedChoiceId).toBe("second");
    expect(result.selectedChoiceId).toBe(result.rationalBenchmark.selectedChoiceId);
    expect(result.classification).toBe("simulation");
    const logit = { ...input, choiceRule: { kind: "logit" as const, precision: "0" } };
    expect(simulateBehavioralChoice(logit)).toEqual(simulateBehavioralChoice(logit));
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 200; seed++) {
      const choice = simulateBehavioralChoice({ ...logit, seed: String(seed) }).selectedChoiceId;
      counts.set(choice, (counts.get(choice) ?? 0) + 1);
    }
    expect(counts.get("first")).toBeGreaterThan(60);
    expect(counts.get("second")).toBeGreaterThan(60);
    expect(
      simulateBehavioralChoice({
        ...input,
        model: createBehavioralChoiceModel({
          ...modelInput(),
          family: "expected_value",
          parameters: {},
        }),
      }).selectedChoiceId,
    ).toBe("second");
    expect(() =>
      simulateBehavioralChoice({ ...input, knownAt: "2024-02-29T23:59:59.999999999Z" }),
    ).toThrow(/cutoff/);
    const firstChoice = input.choices[0];
    if (!firstChoice) throw new Error("Missing fixture choice");
    expect(() =>
      simulateBehavioralChoice({ ...input, choices: [firstChoice, firstChoice] }),
    ).toThrow(/Duplicate/);
    expect(() => simulateBehavioralChoice({ ...input, seed: "-1" })).toThrow();
  });
  it("records estimated provenance without promoting calibration to deployment approval", () => {
    const card = behavioralChoiceModelCard(createBehavioralChoiceModel(modelInput()));
    expect(card.approval).toBe("research_only_no_production_approval");
    expect(card.calibrationUncertainty).toBe("assumed_not_estimated");
    expect(
      createBehavioralChoiceModel({
        ...modelInput(),
        parameterBasis: {
          kind: "estimated",
          studySha256: "a".repeat(64),
          population: "aggregate employees",
          estimatedAt: date,
        },
      }).parameterBasis.kind,
    ).toBe("estimated");
    expect(() =>
      createBehavioralChoiceModel({
        ...modelInput(),
        parameterBasis: {
          kind: "estimated",
          studySha256: "a".repeat(64),
          population: "unrelated",
          estimatedAt: date,
        },
      }),
    ).toThrow();
    expect(() =>
      createBehavioralChoiceModel({ ...modelInput(), availableAt: "2024-01-01T00:00:00Z" }),
    ).toThrow();
  });
  it("evaluates categorical held-out predictions and rejects chronology leakage", () => {
    const input = {
      outcomes: [
        {
          observedChoiceId: "a",
          probabilities: [
            { choiceId: "a", probability: "0.8" },
            { choiceId: "b", probability: "0.2" },
          ],
        },
      ],
      calibrationThrough: "2023-01-01T00:00:00Z",
      evaluationStartsAt: "2024-01-01T00:00:00Z",
      evaluationEndsAt: date,
      sampleSha256: "a".repeat(64),
    };
    expect(evaluateBehavioralChoicePredictions(input).value).toBe("0.080000000000");
    expect(() =>
      evaluateBehavioralChoicePredictions({
        ...input,
        calibrationThrough: input.evaluationStartsAt,
      }),
    ).toThrow();
    const firstOutcome = input.outcomes[0];
    if (!firstOutcome) throw new Error("Missing fixture outcome");
    expect(() =>
      evaluateBehavioralChoicePredictions({
        ...input,
        outcomes: [{ observedChoiceId: "x", probabilities: firstOutcome.probabilities }],
      }),
    ).toThrow();
  });
  it("accounts for theory families without pretending conceptual models are executable", () => {
    expect(BEHAVIORAL_THEORIES.length).toBe(20);
    expect(new Set(BEHAVIORAL_THEORIES.map((theory) => theory.id)).size).toBe(20);
    for (const theory of BEHAVIORAL_THEORIES) {
      expect(theory.evidenceStatus).toBe("context_specific_assessment_required");
      if (theory.implementation === "conceptual_registry")
        expect(theory.executableModels).toHaveLength(0);
    }
    const theory = BEHAVIORAL_THEORIES[0];
    if (!theory) throw new Error("Missing theory");
    expect(() =>
      registerBehavioralTheory({ ...integrity(theory), implementation: "conceptual_registry" }),
    ).toThrow();
  });
});
