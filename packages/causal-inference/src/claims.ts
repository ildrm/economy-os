import {
  assertExactKeys,
  assertIsoInstant,
  assertRecord,
  assertSha256,
  assertUuid,
  cloneCanonical,
  compareInstant,
  deepFreeze,
  digestJson,
  expectBoolean,
  expectString,
} from "./internals.js";
import {
  assertCausalAnalysisResultIntegrity,
  type CausalAnalysisResult,
  resultPassesIdentificationEvidence,
} from "./results.js";
import { assertIndependentReviewLedgerIntegrity, type IndependentReviewLedger } from "./reviews.js";

export type RequestedClaimLanguage =
  | "association"
  | "causal_effect"
  | "hypothesis"
  | "predictive_association";

export type AuthorizedClaimLabel =
  | "causal_discovery_hypothesis"
  | "observed_association"
  | "predictive_association_hypothesis"
  | "research_hypothesis"
  | "reviewed_causal_effect";

export interface ClaimLanguageAuthorization {
  readonly schemaVersion: 1;
  readonly authorizationId: string;
  readonly resultId: string;
  readonly resultSha256: string;
  readonly reviewLedgerSha256: string;
  readonly requestedLanguage: RequestedClaimLanguage;
  readonly authorizedLabel: AuthorizedClaimLabel;
  readonly causalLanguageAllowed: boolean;
  readonly automaticGraphPromotion: "prohibited";
  readonly graphWorkflow: "human_governed_proposal_only";
  readonly authorizedBy: string;
  readonly authorizedAt: string;
  readonly authorizationSha256: string;
}

export interface AuthorizeClaimLanguageInput {
  readonly authorizationId: string;
  readonly result: CausalAnalysisResult;
  readonly reviewLedger: IndependentReviewLedger;
  readonly requestedLanguage: RequestedClaimLanguage;
  readonly authorizedBy: string;
  readonly authorizedAt: string;
}

const AUTHORIZATION_KEYS = [
  "schemaVersion",
  "authorizationId",
  "resultId",
  "resultSha256",
  "reviewLedgerSha256",
  "requestedLanguage",
  "authorizedLabel",
  "causalLanguageAllowed",
  "automaticGraphPromotion",
  "graphWorkflow",
  "authorizedBy",
  "authorizedAt",
] as const;

function authorizedLabelFor(
  result: CausalAnalysisResult,
  requestedLanguage: RequestedClaimLanguage,
): AuthorizedClaimLabel {
  switch (requestedLanguage) {
    case "causal_effect":
      if (result.resultKind !== "identified_effect_candidate") {
        throw new TypeError("only an identified-effect candidate may request causal language");
      }
      return "reviewed_causal_effect";
    case "association":
      if (result.resultKind !== "observed_association") {
        throw new TypeError("association language requires a separately typed association result");
      }
      return "observed_association";
    case "predictive_association":
      if (result.resultKind !== "predictive_association") {
        throw new TypeError("predictive language requires a separately typed predictive result");
      }
      return "predictive_association_hypothesis";
    case "hypothesis":
      if (result.resultKind === "discovered_association") {
        return "causal_discovery_hypothesis";
      }
      if (result.resultKind !== "hypothesis") {
        throw new TypeError("hypothesis language requires a separately typed hypothesis result");
      }
      return "research_hypothesis";
  }
}

export function authorizeClaimLanguage(
  input: AuthorizeClaimLanguageInput,
): Readonly<ClaimLanguageAuthorization> {
  assertCausalAnalysisResultIntegrity(input.result);
  assertIndependentReviewLedgerIntegrity(input.reviewLedger);
  assertUuid(input.authorizationId, "claimAuthorization.authorizationId");
  assertUuid(input.authorizedBy, "claimAuthorization.authorizedBy");
  assertIsoInstant(input.authorizedAt, "claimAuthorization.authorizedAt");
  if (
    input.reviewLedger.resultId !== input.result.resultId ||
    input.reviewLedger.resultSha256 !== input.result.resultSha256
  ) {
    throw new TypeError("claim authorization review ledger belongs to another result");
  }
  const latestReviewAt =
    input.reviewLedger.decisions.at(-1)?.decidedAt ?? input.reviewLedger.openedAt;
  if (compareInstant(input.authorizedAt, latestReviewAt) < 0) {
    throw new TypeError(
      "claim authorization cannot predate the latest independent review decision",
    );
  }
  const authorizedLabel = authorizedLabelFor(input.result, input.requestedLanguage);
  const causalLanguageAllowed = input.requestedLanguage === "causal_effect";
  if (causalLanguageAllowed) {
    if (input.reviewLedger.currentStatus !== "approved") {
      throw new TypeError(
        "causal language requires approved independent validation and model-risk review",
      );
    }
    if (!resultPassesIdentificationEvidence(input.result)) {
      throw new TypeError(
        "causal language requires passing identification and falsification evidence",
      );
    }
  }
  const body = {
    schemaVersion: 1 as const,
    authorizationId: input.authorizationId,
    resultId: input.result.resultId,
    resultSha256: input.result.resultSha256,
    reviewLedgerSha256: input.reviewLedger.ledgerSha256,
    requestedLanguage: input.requestedLanguage,
    authorizedLabel,
    causalLanguageAllowed,
    automaticGraphPromotion: "prohibited" as const,
    graphWorkflow: "human_governed_proposal_only" as const,
    authorizedBy: input.authorizedBy,
    authorizedAt: input.authorizedAt,
  };
  return deepFreeze({ ...cloneCanonical(body), authorizationSha256: digestJson(body) });
}

export function assertClaimLanguageAuthorizationIntegrity(
  value: unknown,
): asserts value is ClaimLanguageAuthorization {
  assertRecord(value, "claimAuthorization");
  assertExactKeys(value, [...AUTHORIZATION_KEYS, "authorizationSha256"], "claimAuthorization");
  if (value.schemaVersion !== 1) throw new TypeError("claim authorization schemaVersion must be 1");
  const authorizationId = expectString(value.authorizationId, "claimAuthorization.authorizationId");
  const resultId = expectString(value.resultId, "claimAuthorization.resultId");
  const resultSha256 = expectString(value.resultSha256, "claimAuthorization.resultSha256");
  const reviewLedgerSha256 = expectString(
    value.reviewLedgerSha256,
    "claimAuthorization.reviewLedgerSha256",
  );
  const requestedLanguage = expectString(
    value.requestedLanguage,
    "claimAuthorization.requestedLanguage",
  );
  const authorizedLabel = expectString(value.authorizedLabel, "claimAuthorization.authorizedLabel");
  const authorizedBy = expectString(value.authorizedBy, "claimAuthorization.authorizedBy");
  const authorizedAt = expectString(value.authorizedAt, "claimAuthorization.authorizedAt");
  for (const [field, id] of [
    ["authorizationId", authorizationId],
    ["resultId", resultId],
    ["authorizedBy", authorizedBy],
  ] as const) {
    assertUuid(id, `claimAuthorization.${field}`);
  }
  assertSha256(resultSha256, "claimAuthorization.resultSha256");
  assertSha256(reviewLedgerSha256, "claimAuthorization.reviewLedgerSha256");
  assertIsoInstant(authorizedAt, "claimAuthorization.authorizedAt");
  if (
    !["association", "causal_effect", "hypothesis", "predictive_association"].includes(
      requestedLanguage,
    )
  ) {
    throw new TypeError("claim authorization requested language is invalid");
  }
  if (
    ![
      "observed_association",
      "causal_discovery_hypothesis",
      "predictive_association_hypothesis",
      "research_hypothesis",
      "reviewed_causal_effect",
    ].includes(authorizedLabel)
  ) {
    throw new TypeError("claim authorization label is invalid");
  }
  const labelMatchesRequest =
    (requestedLanguage === "association" && authorizedLabel === "observed_association") ||
    (requestedLanguage === "causal_effect" && authorizedLabel === "reviewed_causal_effect") ||
    (requestedLanguage === "predictive_association" &&
      authorizedLabel === "predictive_association_hypothesis") ||
    (requestedLanguage === "hypothesis" &&
      (authorizedLabel === "research_hypothesis" ||
        authorizedLabel === "causal_discovery_hypothesis"));
  if (!labelMatchesRequest) {
    throw new TypeError("claim authorization label does not match the requested language");
  }
  const causalLanguageAllowed = expectBoolean(
    value.causalLanguageAllowed,
    "claimAuthorization.causalLanguageAllowed",
  );
  if (causalLanguageAllowed !== (requestedLanguage === "causal_effect")) {
    throw new TypeError("claim authorization causal-language flag is inconsistent");
  }
  if (
    value.automaticGraphPromotion !== "prohibited" ||
    value.graphWorkflow !== "human_governed_proposal_only"
  ) {
    throw new TypeError("automatic causal-graph promotion is prohibited");
  }
  const body = {
    schemaVersion: 1 as const,
    authorizationId,
    resultId,
    resultSha256,
    reviewLedgerSha256,
    requestedLanguage: requestedLanguage as RequestedClaimLanguage,
    authorizedLabel: authorizedLabel as AuthorizedClaimLabel,
    causalLanguageAllowed,
    automaticGraphPromotion: "prohibited" as const,
    graphWorkflow: "human_governed_proposal_only" as const,
    authorizedBy,
    authorizedAt,
  };
  const authorizationSha256 = expectString(
    value.authorizationSha256,
    "claimAuthorization.authorizationSha256",
  );
  assertSha256(authorizationSha256, "claimAuthorization.authorizationSha256");
  if (digestJson(body) !== authorizationSha256) {
    throw new TypeError("claim authorization digest does not match");
  }
}

export function assertAutomaticGraphPromotionProhibited(
  authorization: ClaimLanguageAuthorization,
): void {
  assertClaimLanguageAuthorizationIntegrity(authorization);
  if (
    authorization.automaticGraphPromotion !== "prohibited" ||
    authorization.graphWorkflow !== "human_governed_proposal_only"
  ) {
    throw new TypeError("automatic causal-graph promotion is prohibited");
  }
}
