import { enumeration, freeze, keys, seal, text, texts } from "./internals.js";

export interface BehavioralTheoryDefinition {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly authors: readonly string[];
  readonly mechanisms: readonly string[];
  readonly description: string;
  readonly implementation: "executable_research_kernel" | "conceptual_registry";
  readonly executableModels: readonly string[];
  readonly boundaryConditions: readonly string[];
  readonly alternativeExplanations: readonly string[];
  readonly evidenceStatus: "context_specific_assessment_required";
  readonly prohibitedClaims: readonly string[];
  readonly references: readonly { readonly title: string; readonly uri: string }[];
  readonly bibliographyStatus: "foundational_sources_verified" | "bibliography_not_verified";
  readonly owner: "economyos_research_maintainers";
  readonly validity: "versioned_concept_catalog_not_empirical_effect_validity";
}
export function registerBehavioralTheory(input: BehavioralTheoryDefinition) {
  keys(input, [
    "id",
    "name",
    "version",
    "authors",
    "mechanisms",
    "description",
    "implementation",
    "executableModels",
    "boundaryConditions",
    "alternativeExplanations",
    "evidenceStatus",
    "prohibitedClaims",
    "references",
    "bibliographyStatus",
    "owner",
    "validity",
  ]);
  if (!/^[a-z][a-z0-9_]{1,79}$/.test(input.id) || !/^\d+\.\d+\.\d+$/.test(input.version))
    throw new TypeError("Theory requires canonical identity/version");
  text(input.name, "theory name");
  text(input.description, "description");
  texts(input.authors, "authors");
  texts(input.mechanisms, "mechanisms");
  texts(input.boundaryConditions, "boundary conditions");
  texts(input.alternativeExplanations, "alternatives");
  texts(input.prohibitedClaims, "prohibited claims");
  texts(input.executableModels, "model bindings", 0);
  enumeration(
    input.implementation,
    ["executable_research_kernel", "conceptual_registry"],
    "implementation",
  );
  if (
    input.evidenceStatus !== "context_specific_assessment_required" ||
    (input.implementation === "conceptual_registry" && input.executableModels.length)
  )
    throw new TypeError("Theory catalog cannot imply validated or implemented effects");
  if (input.implementation === "executable_research_kernel" && !input.executableModels.length)
    throw new TypeError("Executable theory requires model bindings");
  if (
    input.owner !== "economyos_research_maintainers" ||
    input.validity !== "versioned_concept_catalog_not_empirical_effect_validity"
  )
    throw new TypeError("Theory owner and validity semantics required");
  enumeration(
    input.bibliographyStatus,
    ["foundational_sources_verified", "bibliography_not_verified"],
    "bibliographyStatus",
  );
  if (
    !Array.isArray(input.references) ||
    input.references.length > 20 ||
    (input.bibliographyStatus === "foundational_sources_verified" && !input.references.length)
  )
    throw new TypeError("Verified bibliography needs source references");
  for (const reference of input.references) {
    keys(reference, ["title", "uri"]);
    text(reference.title, "publication title");
    text(reference.uri, "publication URI");
    if (new URL(reference.uri).protocol !== "https:")
      throw new TypeError("Reference URI must use HTTPS");
  }
  return seal(input);
}
type CatalogRow = readonly [
  string,
  string,
  readonly string[],
  readonly string[],
  string,
  readonly string[],
  string,
];
const rows: readonly CatalogRow[] = [
  [
    "bounded_rationality",
    "Bounded rationality and satisficing",
    ["Herbert Simon"],
    ["search_cost", "limited_computation", "satisficing", "aspiration_level"],
    "Search can stop at the first acceptable alternative under explicit order and resource constraints.",
    ["selectSatisficingChoice"],
    "Search order and aspiration levels must be specified; observed stopping can also reflect rational search costs.",
  ],
  [
    "heuristics",
    "Judgment heuristics",
    ["Amos Tversky", "Daniel Kahneman", "Gerd Gigerenzer"],
    [
      "anchoring",
      "availability",
      "representativeness",
      "base_rate_neglect",
      "conjunction_error",
      "framing",
    ],
    "Context-dependent judgment mechanisms and ecological-rationality alternatives require competing explanations.",
    [],
    "Task wording, information representation, incentives, and expertise can alter the measured effect.",
  ],
  [
    "prospect_theory",
    "Cumulative prospect theory",
    ["Daniel Kahneman", "Amos Tversky", "Drazen Prelec"],
    ["reference_dependence", "loss_aversion", "probability_weighting", "diminishing_sensitivity"],
    "Reference-dependent values and separate cumulative gain/loss decision weights on known-risk prospects.",
    ["prospectValue", "weightProbabilityPrelec", "cumulativeProspectValue"],
    "The implemented variant uses one-parameter Prelec weighting and explicit reference points; it is not a universal calibration.",
  ],
  [
    "mental_accounting",
    "Mental accounting",
    ["Richard Thaler"],
    ["earmarking", "transaction_utility", "payment_coupling", "windfall_accounting"],
    "Budget categories and transaction framing can organize decisions across otherwise fungible resources.",
    [],
    "Liquidity constraints, taxes, transaction costs, and contracts can also explain separated budgets.",
  ],
  [
    "endowment_status_quo",
    "Endowment and status quo",
    [
      "Richard Thaler",
      "Daniel Kahneman",
      "Jack Knetsch",
      "William Samuelson",
      "Richard Zeckhauser",
    ],
    ["endowment_effect", "ownership", "status_quo", "switching_friction"],
    "Ownership and a prior choice may affect valuation or persistence, subject to design-specific identification.",
    [],
    "Separate reference dependence from transaction costs, attachment, elicitation artifacts, and strategic bargaining.",
  ],
  [
    "defaults",
    "Defaults and choice architecture",
    ["Richard Thaler", "Cass Sunstein", "Brigitte Madrian", "Dennis Shea", "Eric Johnson"],
    ["default", "opt_in", "opt_out", "perceived_endorsement", "simplification", "friction"],
    "Choice architecture can be documented independently of exposure, take-up, and welfare effects.",
    [],
    "Default uptake does not identify preference or improved welfare; effects require population-specific evaluation.",
  ],
  [
    "intertemporal_choice",
    "Present bias and commitment",
    [
      "David Laibson",
      "Ted O'Donoghue",
      "Matthew Rabin",
      "George Ainslie",
      "Shlomo Benartzi",
      "Richard Thaler",
      "Hersh Shefrin",
    ],
    ["present_bias", "commitment", "automatic_escalation", "self_control"],
    "Quasi-hyperbolic utility distinguishes present and future periods under explicit utility flows.",
    ["quasiHyperbolicUtility"],
    "The kernel values flows; it does not solve naive/sophisticated dynamic equilibria or infer commitment demand.",
  ],
  [
    "projection_visceral",
    "Projection bias and visceral factors",
    ["George Loewenstein", "Ted O'Donoghue", "Matthew Rabin"],
    ["projection_bias", "hot_cold_state", "temptation"],
    "Current states can affect forecasts of future preferences in context-dependent models.",
    [],
    "Aggregate research only; no inference of an individual's stress, hunger, pain, or psychological state.",
  ],
  [
    "social_preferences",
    "Fairness, reciprocity, and inequality aversion",
    ["Ernst Fehr", "Klaus Schmidt", "Matthew Rabin", "Gary Bolton", "Axel Ockenfels"],
    ["inequality_aversion", "reciprocity", "fairness", "erc"],
    "Distributional preferences compete with intention-dependent and relative-standing explanations.",
    ["inequalityAversionUtility"],
    "Only Fehr-Schmidt payoff utility is executable here; reciprocity and ERC require distinct models.",
  ],
  [
    "cooperation",
    "Cooperation, norms, and institutions",
    ["Ernst Fehr", "Simon Gächter", "Elinor Ostrom", "Thomas Schelling"],
    [
      "conditional_cooperation",
      "punishment",
      "free_riding",
      "reputation",
      "norm_enforcement",
      "coordination",
    ],
    "Institutional rules, repeated interaction, and expectations shape collective action.",
    [],
    "Separate institutional incentives, repeated-game equilibria, and preference mechanisms.",
  ],
  [
    "behavioral_games",
    "Behavioral game theory",
    ["Colin Camerer", "Teck-Hua Ho", "Juin-Kuan Chong"],
    [
      "level_k",
      "cognitive_hierarchy",
      "logit_response",
      "experience_weighted_attraction",
      "adaptive_learning",
    ],
    "Strategic response families differ in beliefs, learning, and bounded reasoning.",
    ["logitChoiceProbabilities"],
    "A logit response to supplied utilities is not a solved quantal-response equilibrium or cognitive-hierarchy implementation.",
  ],
  [
    "experimental_methods",
    "Experimental and field economics",
    ["Vernon Smith", "John List", "Uri Gneezy"],
    ["random_assignment", "incentive_compatibility", "field_validity", "replication"],
    "Design, incentives, attrition, multiple testing, and generalizability govern interpretation of behavioral evidence.",
    [],
    "A laboratory result or an experiment in one institution cannot establish a universal effect.",
  ],
  [
    "scarcity",
    "Scarcity and attention constraints",
    ["Sendhil Mullainathan", "Eldar Shafir"],
    ["tunneling", "bandwidth_constraint", "scarcity_attention"],
    "Resource constraints can change attention and tradeoffs, with material constraints retained explicitly.",
    [],
    "Poverty is not encoded as an individual cognitive defect; competing resource and institutional explanations remain visible.",
  ],
  [
    "identity",
    "Identity economics",
    ["George Akerlof", "Rachel Kranton"],
    ["identity_norm", "role_expectation", "norm_compliance"],
    "Norms associated with roles and social contexts can enter hypotheses about economic choices.",
    [],
    "Protected attributes and individual psychological profiling are outside this implementation.",
  ],
  [
    "narratives",
    "Narrative economics and animal spirits",
    ["Robert Shiller", "George Akerlof"],
    ["narrative_transmission", "confidence", "collective_expectations", "narrative_feedback"],
    "Narrative evidence can motivate hypothesized expectations and confidence pathways.",
    [],
    "Text co-occurrence, sentiment, and prevalence do not identify causal transmission or macroeconomic effects.",
  ],
  [
    "behavioral_finance",
    "Behavioral finance",
    [
      "Robert Shiller",
      "Richard Thaler",
      "Nicholas Barberis",
      "Andrei Shleifer",
      "Robert Vishny",
      "Hersh Shefrin",
      "Meir Statman",
      "Terrance Odean",
      "Brad Barber",
    ],
    [
      "disposition_effect",
      "overconfidence",
      "excessive_trading",
      "herding",
      "home_bias",
      "familiarity_bias",
      "extrapolation",
      "limits_to_arbitrage",
      "lottery_preference",
      "panic",
      "flight_to_safety",
    ],
    "Opportunity-adjusted realization rates and explicit investor choice models support competing descriptive explanations.",
    ["dispositionEffect", "simulateBehavioralChoice"],
    "No market movement is attributed to bias automatically; taxes, liquidity, rebalancing, constraints, and risk preferences can explain actions.",
  ],
  [
    "ambiguity",
    "Risk, ambiguity, and competing preferences",
    ["Daniel Ellsberg", "Maurice Allais", "Peter Wakker", "George Wu"],
    ["ambiguity_aversion", "unknown_probability", "model_uncertainty", "risk_preference"],
    "Known-risk choices are distinct from ambiguity and unknown distributions.",
    [],
    "The prospect kernel rejects unknown probability mass; it does not collapse ambiguity into variance.",
  ],
  [
    "attention",
    "Limited attention and rational inattention",
    ["Christopher Sims", "Xavier Gabaix"],
    [
      "limited_attention",
      "rational_inattention",
      "sparse_consideration",
      "information_cost",
      "salience",
    ],
    "Information processing and selective consideration can be modeled as costs or constraints.",
    [],
    "Rational inattention is analytically distinct from psychological bias; no solved information-allocation model is claimed.",
  ],
  [
    "public_organizational",
    "Behavioral public finance and organizations",
    ["Raj Chetty", "Stefano DellaVigna", "Uri Gneezy", "Ernst Fehr"],
    [
      "tax_salience",
      "benefit_take_up",
      "administrative_burden",
      "bonus_framing",
      "gift_exchange",
      "fairness_wages",
      "goal_setting",
      "organizational_escalation",
    ],
    "Policy and workplace mechanisms require explicit treatment, comparator, implementation, and outcome evidence.",
    [],
    "Intended nudges, observed uptake, causal effects, welfare, and ethical judgments remain separate.",
  ],
  [
    "context_choice",
    "Context-dependent choice and regret",
    ["Amos Tversky", "Daniel Kahneman", "George Loewenstein"],
    [
      "decoy",
      "compromise_effect",
      "choice_overload",
      "regret",
      "disappointment",
      "reference_price",
    ],
    "A choice set and presentation context must remain attached to a behavioral hypothesis.",
    [],
    "A choice under one menu does not identify context-independent preferences; regret/disappointment are catalog concepts here.",
  ],
];
const references: Readonly<
  Record<string, readonly { readonly title: string; readonly uri: string }[]>
> = {
  bounded_rationality: [
    {
      title: "Simon (1955), A Behavioral Model of Rational Choice",
      uri: "https://doi.org/10.2307/1884852",
    },
  ],
  prospect_theory: [
    {
      title:
        "Tversky and Kahneman (1992), Advances in Prospect Theory: Cumulative Representation of Uncertainty",
      uri: "https://doi.org/10.1007/BF00122574",
    },
    {
      title: "Prelec (1998), The Probability Weighting Function",
      uri: "https://nel.mit.edu/wp-content/uploads/2016/10/26probabilitycopy.pdf",
    },
  ],
  intertemporal_choice: [
    {
      title: "Laibson (1997), Golden Eggs and Hyperbolic Discounting",
      uri: "https://laibson.scholars.harvard.edu/publications/golden-eggs-and-hyperbolic-discounting",
    },
  ],
  social_preferences: [
    {
      title: "Fehr and Schmidt (1999), A Theory of Fairness, Competition, and Cooperation",
      uri: "https://web.stanford.edu/~niederle/Fehr.Schmidt.1999.QJE.pdf",
    },
  ],
  behavioral_finance: [
    {
      title: "Odean (1998), Are Investors Reluctant to Realize Their Losses?",
      uri: "https://onlinelibrary.wiley.com/doi/10.1111/0022-1082.00072",
    },
  ],
  defaults: [
    {
      title:
        "Madrian and Shea (2000 working paper), The Power of Suggestion: Inertia in 401(k) Participation and Savings Behavior",
      uri: "https://www.nber.org/papers/w7682",
    },
  ],
  narratives: [
    {
      title: "Shiller (2017), Narrative Economics",
      uri: "https://www.aeaweb.org/articles?id=10.1257/aer.107.4.967",
    },
  ],
  public_organizational: [
    {
      title: "Chetty (2015), Behavioral Economics and Public Policy: A Pragmatic Perspective",
      uri: "https://www.aeaweb.org/articles?id=10.1257/aer.p20151108",
    },
  ],
};
export const BEHAVIORAL_THEORIES = freeze(
  rows.map(([id, name, authors, mechanisms, description, executableModels, boundary]) =>
    registerBehavioralTheory({
      id,
      name,
      version: "1.0.0",
      authors,
      mechanisms,
      description,
      implementation: executableModels.length
        ? "executable_research_kernel"
        : "conceptual_registry",
      executableModels,
      boundaryConditions: [boundary],
      alternativeExplanations: [
        "Compare against rational benchmarks, institutional constraints, measurement design, and context-specific competing mechanisms.",
      ],
      evidenceStatus: "context_specific_assessment_required",
      prohibitedClaims: [
        "Universal population parameters or effects.",
        "Individual psychological diagnosis.",
        "Causal or welfare conclusions from descriptive evidence alone.",
      ],
      references: references[id] ?? [],
      bibliographyStatus: references[id]
        ? "foundational_sources_verified"
        : "bibliography_not_verified",
      owner: "economyos_research_maintainers",
      validity: "versioned_concept_catalog_not_empirical_effect_validity",
    }),
  ),
);
