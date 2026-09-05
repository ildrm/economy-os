import { createHash } from "node:crypto";
import {
  assertSourceDocumentIntegrity,
  assertSourceSnapshotIntegrity,
  assertSourceSpanIntegrity,
  createSourceSpan,
  type SourceDocument,
  type SourceSnapshot,
  type SourceSpan,
} from "@economyos/narrative-intelligence";
import {
  type BehavioralScope,
  digest,
  enumeration,
  hash,
  instant,
  integrity,
  keys,
  sameScope,
  scope,
  seal,
  text,
  texts,
  uuid,
} from "./internals.js";

export const BEHAVIORAL_ACTOR_TYPES = [
  "government",
  "central_bank",
  "regulator",
  "international_organization",
  "company",
  "bank",
  "employer",
  "platform",
  "nonprofit",
  "educational_institution",
] as const;
export interface BehavioralActor {
  readonly name: string;
  readonly type: (typeof BEHAVIORAL_ACTOR_TYPES)[number];
  readonly jurisdiction: string;
  readonly targetPopulation: string;
  readonly decisionContext: string;
}
export const INTERVENTION_RULES = [
  {
    mechanism: "default",
    expression:
      "\\b(?:automatically enroll(?:ed|ment)?|automatic enrollment|preselected|selected by default)\\b",
    alternative:
      "A technical default or quoted proposal may describe no implemented choice architecture.",
  },
  {
    mechanism: "opt_out",
    expression: "\\bopt[- ]out\\b",
    alternative: "An opt-out right may be described without evidence of exposure or uptake.",
  },
  {
    mechanism: "opt_in",
    expression: "\\bopt[- ]in\\b",
    alternative:
      "An opt-in requirement may reflect legal consent rather than a behavioral objective.",
  },
  {
    mechanism: "social_information",
    expression: "\\b(?:most popular|most people|your neighbou?rs|nine out of ten)\\b",
    alternative:
      "The phrase may be a descriptive statistic or quoted criticism; social influence is unmeasured.",
  },
  {
    mechanism: "scarcity_message",
    expression: "\\b(?:only [0-9]+ left|limited time|while supplies last|offer expires)\\b",
    alternative:
      "Scarcity may be factual; neither deceptive intent nor a scarcity effect is established.",
  },
  {
    mechanism: "reminder",
    expression: "\\b(?:payment reminder|reminder to|we remind you|text reminder)\\b",
    alternative: "An operational notice may communicate information without changing behavior.",
  },
  {
    mechanism: "commitment",
    expression:
      "\\b(?:commitment savings|withdrawal penalty|precommitment|automatic escalation)\\b",
    alternative: "A contractual restriction may have administrative or prudential purposes.",
  },
  {
    mechanism: "reference_price",
    expression: "\\b(?:original price|regular price|was [0-9]+|suggested retail price)\\b",
    alternative:
      "A comparison price can be factual; anchoring and price deception require additional evidence.",
  },
  {
    mechanism: "automatic_renewal",
    expression: "\\b(?:automatically renews?|auto[- ]renewal|trial converts)\\b",
    alternative:
      "Disclosed renewal can reduce transaction costs; exploitative design is not established.",
  },
  {
    mechanism: "goal_setting",
    expression: "\\b(?:set a goal|savings goal|contribution target)\\b",
    alternative: "An aspiration or reporting target need not function as an incentive.",
  },
  {
    mechanism: "simplification",
    expression: "\\b(?:simplified application|pre[- ]filled form|one[- ]click application)\\b",
    alternative: "A convenience feature does not establish improved uptake or welfare.",
  },
  {
    mechanism: "cancellation_friction",
    expression: "\\b(?:call to cancel|cancel by phone|cancellation fee)\\b",
    alternative:
      "Verification or service costs may explain the restriction; obstruction requires reviewed criteria.",
  },
] as const;
export type BehavioralInterventionMechanism = (typeof INTERVENTION_RULES)[number]["mechanism"];

export interface BehavioralInterventionCandidate {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly scope: BehavioralScope;
  readonly documentManifestSha256: string;
  readonly snapshotManifestSha256: string;
  readonly detectorVersion: "lexical_candidates_en_v1";
  readonly rulesSha256: string;
  readonly mechanism: BehavioralInterventionMechanism;
  readonly actor: BehavioralActor;
  readonly actorAttribution: "submitter_supplied_requires_review";
  readonly sourceSpan: SourceSpan;
  readonly publishedAt: string;
  readonly availableAt: string;
  readonly recordedAt: string;
  readonly detectedAt: string;
  readonly confidence: {
    readonly status: "uncalibrated";
    readonly probability: null;
    readonly basis: "lexical_match_only";
  };
  readonly alternativeInterpretations: readonly string[];
  readonly causalStatus: "not_evaluated";
  readonly humanReviewStatus: "pending";
  readonly claim: "candidate_mechanism_not_proven";
  readonly manifestSha256: string;
}
export interface BehavioralDetectionInput {
  readonly document: SourceDocument;
  readonly snapshot: SourceSnapshot;
  readonly sourceText: string;
  readonly scope: BehavioralScope;
  readonly knownAt: string;
  readonly systemAt: string;
  readonly detectedAt: string;
  readonly actor: BehavioralActor;
}
function shaText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function derivedUuid(value: string): string {
  const hex = digest(value);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function actor(value: BehavioralActor): void {
  keys(value, ["name", "type", "jurisdiction", "targetPopulation", "decisionContext"]);
  for (const field of [
    value.name,
    value.jurisdiction,
    value.targetPopulation,
    value.decisionContext,
  ])
    text(field, "actor context");
  enumeration(value.type, BEHAVIORAL_ACTOR_TYPES, "actor type");
}
/** Pure bounded English lexical candidate extraction; source text is data and never executed. */
export function detectBehavioralInterventions(input: BehavioralDetectionInput) {
  keys(input, [
    "document",
    "snapshot",
    "sourceText",
    "scope",
    "knownAt",
    "systemAt",
    "detectedAt",
    "actor",
  ]);
  assertSourceDocumentIntegrity(input.document);
  assertSourceSnapshotIntegrity(input.snapshot);
  sameScope(input.scope, input.document);
  sameScope(input.scope, input.snapshot);
  actor(input.actor);
  const { document, snapshot, sourceText } = input;
  if (!document.license.allowsInternalFullText)
    throw new TypeError("Source license does not permit full-text processing");
  if (
    typeof sourceText !== "string" ||
    sourceText.length > 200_000 ||
    sourceText.length !== snapshot.contentLength ||
    shaText(sourceText) !== snapshot.contentSha256
  )
    throw new TypeError("Source text does not match bounded snapshot");
  if (
    snapshot.documentId !== document.documentId ||
    snapshot.documentManifestSha256 !== document.manifestSha256
  )
    throw new TypeError("Document snapshot binding mismatch");
  if (
    instant(document.publishedAt) > instant(input.knownAt) ||
    instant(snapshot.availableAt) > instant(input.knownAt) ||
    instant(snapshot.recordedAt) > instant(input.systemAt)
  )
    throw new TypeError("Source unavailable at declared knowledge/system cutoff");
  if (
    instant(input.detectedAt) < instant(snapshot.recordedAt) ||
    instant(input.detectedAt) < instant(input.knownAt)
  )
    throw new TypeError("Detection predates its inputs or knowledge cutoff");
  const candidates: BehavioralInterventionCandidate[] = [];
  const supported = snapshot.language === "en";
  if (supported) {
    for (const rule of INTERVENTION_RULES) {
      const matches = sourceText.matchAll(new RegExp(rule.expression, "gi"));
      for (const match of matches) {
        if (candidates.length >= 1000)
          throw new TypeError("Candidate budget exceeded; split the source document");
        const start = match.index;
        const end = start + match[0].length;
        const candidateId = derivedUuid(
          `${snapshot.manifestSha256}:${rule.mechanism}:${start}:${end}`,
        );
        const citationAllowed =
          document.license.allowsCitationSnippets && document.exportPolicy !== "deny";
        // Respect each source's own citation budget. Full text stays outside the output.
        if (document.license.allowsCitationSnippets && document.exportPolicy === "deny")
          throw new TypeError("Contradictory source citation/export policy");
        const snippetEnd = Math.min(end, start + document.license.maxCitationCharacters);
        const sourceSpan = createSourceSpan(
          {
            schemaVersion: 1,
            organizationId: input.scope.organizationId,
            workspaceId: input.scope.workspaceId,
            spanId: candidateId,
            documentId: document.documentId,
            snapshotId: snapshot.snapshotId,
            snapshotManifestSha256: snapshot.manifestSha256,
            language: snapshot.language,
            locale: snapshot.locale,
            locator: {
              kind: "section",
              value: "lexical candidate; inspect original context before review",
            },
            startOffset: start,
            endOffset: end,
            textSha256: shaText(match[0]),
            citationSnippet: citationAllowed ? sourceText.slice(start, snippetEnd) : null,
            snippetStartOffset: citationAllowed ? start : null,
            snippetEndOffset: citationAllowed ? snippetEnd : null,
          },
          document,
          snapshot,
          sourceText,
        );
        candidates.push(
          seal({
            schemaVersion: 1 as const,
            candidateId,
            scope: input.scope,
            documentManifestSha256: document.manifestSha256,
            snapshotManifestSha256: snapshot.manifestSha256,
            detectorVersion: "lexical_candidates_en_v1" as const,
            rulesSha256: digest(INTERVENTION_RULES),
            mechanism: rule.mechanism,
            actor: input.actor,
            actorAttribution: "submitter_supplied_requires_review" as const,
            sourceSpan,
            publishedAt: document.publishedAt,
            availableAt: snapshot.availableAt,
            recordedAt: snapshot.recordedAt,
            detectedAt: input.detectedAt,
            confidence: {
              status: "uncalibrated" as const,
              probability: null,
              basis: "lexical_match_only" as const,
            },
            alternativeInterpretations: [
              rule.alternative,
              "Negation, a hypothetical example, a historical proposal, or a quotation may explain this match.",
            ],
            causalStatus: "not_evaluated" as const,
            humanReviewStatus: "pending" as const,
            claim: "candidate_mechanism_not_proven" as const,
          }),
        );
      }
    }
  }
  candidates.sort(
    (a, b) =>
      a.sourceSpan.startOffset - b.sourceSpan.startOffset || (a.mechanism < b.mechanism ? -1 : 1),
  );
  return seal({
    schemaVersion: 1 as const,
    scope: input.scope,
    knownAt: input.knownAt,
    systemAt: input.systemAt,
    detectedAt: input.detectedAt,
    snapshotManifestSha256: snapshot.manifestSha256,
    status: !supported
      ? ("unsupported_language" as const)
      : candidates.length
        ? ("candidates_found" as const)
        : ("no_candidates" as const),
    candidates,
    absenceInterpretation: "no_conclusion_about_intervention_absence" as const,
    limitations: [
      "English lexical coverage only; no recall or precision estimate is available.",
      "Candidates do not establish implementation, exposure, effectiveness, intent, manipulation, or causality.",
    ],
  });
}
export function assertBehavioralCandidateIntegrity(
  candidate: BehavioralInterventionCandidate,
): void {
  const body = integrity(candidate);
  keys(body, [
    "schemaVersion",
    "candidateId",
    "scope",
    "documentManifestSha256",
    "snapshotManifestSha256",
    "detectorVersion",
    "rulesSha256",
    "mechanism",
    "actor",
    "actorAttribution",
    "sourceSpan",
    "publishedAt",
    "availableAt",
    "recordedAt",
    "detectedAt",
    "confidence",
    "alternativeInterpretations",
    "causalStatus",
    "humanReviewStatus",
    "claim",
  ]);
  uuid(candidate.candidateId);
  scope(candidate.scope);
  actor(candidate.actor);
  assertSourceSpanIntegrity(candidate.sourceSpan);
  sameScope(candidate.scope, candidate.sourceSpan);
  hash(candidate.documentManifestSha256);
  hash(candidate.snapshotManifestSha256);
  if (
    candidate.sourceSpan.snapshotManifestSha256 !== candidate.snapshotManifestSha256 ||
    candidate.rulesSha256 !== digest(INTERVENTION_RULES) ||
    candidate.detectorVersion !== "lexical_candidates_en_v1" ||
    candidate.schemaVersion !== 1
  )
    throw new TypeError("Candidate source/rules binding invalid");
  enumeration(
    candidate.mechanism,
    INTERVENTION_RULES.map((rule) => rule.mechanism),
    "mechanism",
  );
  keys(candidate.confidence, ["basis", "probability", "status"]);
  if (
    candidate.actorAttribution !== "submitter_supplied_requires_review" ||
    candidate.causalStatus !== "not_evaluated" ||
    candidate.humanReviewStatus !== "pending" ||
    candidate.claim !== "candidate_mechanism_not_proven" ||
    candidate.confidence.basis !== "lexical_match_only" ||
    candidate.confidence.probability !== null ||
    candidate.confidence.status !== "uncalibrated"
  )
    throw new TypeError("Candidate cannot claim verified mechanism or calibrated confidence");
  texts(candidate.alternativeInterpretations, "alternatives");
  if (
    instant(candidate.publishedAt) > instant(candidate.availableAt) ||
    instant(candidate.availableAt) > instant(candidate.recordedAt) ||
    instant(candidate.recordedAt) > instant(candidate.detectedAt)
  )
    throw new TypeError("Candidate chronology invalid");
}
export interface BehavioralCandidateReviewInput {
  readonly reviewId: string;
  readonly scope: BehavioralScope;
  readonly candidateSha256: string;
  readonly reviewerId: string;
  readonly reviewedAt: string;
  readonly recordedAt: string;
  readonly decision: "documented_choice_architecture" | "rejected" | "insufficient_evidence";
  readonly rationale: string;
  readonly criteria: readonly string[];
  readonly implementationDate: string | null;
  readonly ethicalAssessment: "not_assessed" | "requires_specialist_review";
}
export type BehavioralCandidateReview = BehavioralCandidateReviewInput & {
  readonly manifestSha256: string;
};
export function reviewBehavioralCandidate(
  input: BehavioralCandidateReviewInput,
  candidate: BehavioralInterventionCandidate,
): BehavioralCandidateReview {
  keys(input, [
    "reviewId",
    "scope",
    "candidateSha256",
    "reviewerId",
    "reviewedAt",
    "recordedAt",
    "decision",
    "rationale",
    "criteria",
    "implementationDate",
    "ethicalAssessment",
  ]);
  assertBehavioralCandidateIntegrity(candidate);
  sameScope(input.scope, candidate.scope);
  uuid(input.reviewId);
  uuid(input.reviewerId);
  if (input.candidateSha256 !== candidate.manifestSha256)
    throw new TypeError("Review must bind the exact candidate");
  if (
    instant(input.reviewedAt) < instant(candidate.detectedAt) ||
    instant(input.recordedAt) < instant(input.reviewedAt)
  )
    throw new TypeError("Review chronology invalid");
  enumeration(
    input.decision,
    ["documented_choice_architecture", "rejected", "insufficient_evidence"],
    "review decision",
  );
  enumeration(
    input.ethicalAssessment,
    ["not_assessed", "requires_specialist_review"],
    "ethicalAssessment",
  );
  text(input.rationale, "rationale");
  texts(input.criteria, "review criteria");
  if (input.implementationDate !== null) instant(input.implementationDate);
  if (
    input.decision === "documented_choice_architecture" &&
    (input.implementationDate === null ||
      instant(input.implementationDate) > instant(input.reviewedAt))
  )
    throw new TypeError("Documented implementation requires a nonfuture date");
  return seal(input);
}
export function queryBehavioralCandidatesAsOf(input: {
  readonly scope: BehavioralScope;
  readonly knownAt: string;
  readonly systemAt: string;
  readonly candidates: readonly BehavioralInterventionCandidate[];
  readonly reviews: readonly BehavioralCandidateReview[];
}) {
  keys(input, ["scope", "knownAt", "systemAt", "candidates", "reviews"]);
  scope(input.scope);
  const knownAt = instant(input.knownAt);
  const systemAt = instant(input.systemAt);
  if (input.candidates.length > 10000 || input.reviews.length > 50000)
    throw new TypeError("Query exceeds resource bounds");
  const byDigest = new Map<string, BehavioralInterventionCandidate>();
  const ids = new Set<string>();
  for (const candidate of input.candidates) {
    assertBehavioralCandidateIntegrity(candidate);
    sameScope(input.scope, candidate.scope);
    if (ids.has(candidate.candidateId)) throw new TypeError("Duplicate candidate ID");
    ids.add(candidate.candidateId);
    byDigest.set(candidate.manifestSha256, candidate);
  }
  const reviewIds = new Set<string>();
  for (const review of input.reviews) {
    const body = integrity(review);
    const candidate = byDigest.get(review.candidateSha256);
    if (!candidate) throw new TypeError("Review candidate is missing");
    reviewBehavioralCandidate(body, candidate);
    if (reviewIds.has(review.reviewId)) throw new TypeError("Duplicate review ID");
    reviewIds.add(review.reviewId);
  }
  return seal({
    scope: input.scope,
    knownAt: input.knownAt,
    systemAt: input.systemAt,
    candidates: input.candidates
      .filter(
        (candidate) =>
          instant(candidate.availableAt) <= knownAt &&
          instant(candidate.recordedAt) <= systemAt &&
          instant(candidate.detectedAt) <= systemAt,
      )
      .map((candidate) => {
        const reviews = input.reviews
          .filter(
            (review) =>
              review.candidateSha256 === candidate.manifestSha256 &&
              instant(review.reviewedAt) <= knownAt &&
              instant(review.recordedAt) <= systemAt,
          )
          .sort((a, b) =>
            instant(a.reviewedAt) > instant(b.reviewedAt)
              ? -1
              : instant(a.reviewedAt) < instant(b.reviewedAt)
                ? 1
                : a.reviewId < b.reviewId
                  ? -1
                  : 1,
          );
        return {
          candidate,
          latestReview: reviews[0] ?? null,
          interpretation:
            reviews[0]?.decision === "documented_choice_architecture"
              ? ("documented_architecture_effect_not_established" as const)
              : ("candidate_mechanism_not_proven" as const),
        };
      })
      .sort((a, b) => (a.candidate.candidateId < b.candidate.candidateId ? -1 : 1)),
  });
}
