import {
  BEHAVIORAL_THEORIES,
  cumulativeProspectValue,
  dispositionEffect,
  expectedValue,
  inequalityAversionUtility,
  logitChoiceProbabilities,
  prospectValue,
  quasiHyperbolicUtility,
  selectSatisficingChoice,
  weightProbabilityPrelec,
} from "@economyos/behavioral-economics";

export function buildScienceModels() {
  const lottery = [
    { value: "100", probability: "0.5" },
    { value: "-100", probability: "0.5" },
  ];
  return {
    theories: BEHAVIORAL_THEORIES,
    losses: Array.from({ length: 31 }, (_, index) => {
      const parameters = {
        referencePoint: "0",
        gainCurvature: "1",
        lossCurvature: "1",
        lossAversion: (1 + index / 10).toFixed(1),
        gainWeighting: "1",
        lossWeighting: "1",
      };
      return {
        parameters,
        gain: prospectValue("100", parameters),
        loss: prospectValue("-100", parameters),
        lottery,
        prospectLottery: cumulativeProspectValue(lottery, parameters),
        expectedLottery: expectedValue(lottery),
      };
    }),
    time: ["1", "0.8", "0.5"].map((beta) => ({
      beta,
      delta: "0.95",
      nowFlows: ["80", "0"],
      laterFlows: ["0", "100"],
      now: quasiHyperbolicUtility(["80", "0"], beta, "0.95"),
      later: quasiHyperbolicUtility(["0", "100"], beta, "0.95"),
    })),
    fairness: [
      ["50", "50"],
      ["40", "60"],
      ["60", "40"],
    ].map((payoffs) => ({
      payoffs,
      personIndex: 0,
      alpha: "1",
      beta: "0.5",
      utility: inequalityAversionUtility(payoffs, 0, "1", "0.5"),
    })),
    search: ["50", "70", "95"].map((aspiration) => ({
      utilities: ["45", "60", "90"],
      aspiration,
      budget: 3,
      result: selectSatisficingChoice(["45", "60", "90"], aspiration, 3),
    })),
    probability: ["0.1", "0.5", "0.9"].map((probability) => ({
      probability,
      curvature: "0.65",
      weighted: weightProbabilityPrelec(probability, "0.65"),
    })),
    disposition: [
      { realizedGains: 50, paperGains: 50, realizedLosses: 50, paperLosses: 50 },
      { realizedGains: 60, paperGains: 40, realizedLosses: 20, paperLosses: 80 },
      { realizedGains: 0, paperGains: 0, realizedLosses: 0, paperLosses: 0 },
    ].map((input) => ({ input, result: dispositionEffect(input) })),
    choices: ["0", "1", "3"].map((precision) => ({
      utilities: ["1", "2", "3"],
      precision,
      probabilities: logitChoiceProbabilities(["1", "2", "3"], precision),
    })),
  };
}
export type ScienceModels = ReturnType<typeof buildScienceModels>;
