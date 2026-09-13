import type {
  ProductFact,
  ProductKnowledgeResult,
  ProductStatus,
  ProductTopic,
} from "./types.js";

const REPOSITORY = "https://github.com/assarasua/magic-brain/blob/main";

export const CANONICAL_PRODUCT_DOCUMENT =
  `${REPOSITORY}/docs/product-strategy-faq.md`;

export const PRODUCT_TAXONOMY: Record<ProductStatus, string> = {
  shipped_fact:
    "Directly evidenced by current repository code, product pages, API contracts, or policies.",
  operating_principle:
    "A rule for operating or communicating about the product; not an outcome, uptime, or legal guarantee.",
  hypothesis:
    "An unvalidated belief or experiment, not a demonstrated result.",
  roadmap_option:
    "A possible future direction, not a commitment.",
  unknown_not_measured:
    "No reliable public repository measurement exists; do not estimate or infer one.",
};

const cite = (path: string, label: string) => ({
  label,
  url: path.startsWith("https://") ? path : `${REPOSITORY}/${path}`,
});

export const PRODUCT_FACTS: ProductFact[] = [
  {
    id: "positioning-research-not-execution",
    topic: "positioning",
    status: "shipped_fact",
    statement:
      "Magic Brain is a Magic: The Gathering research and portfolio-intelligence workspace, not a marketplace, broker, exchange, custodian, order-routing service, or trading/execution venue.",
    keywords: ["positioning", "research", "trading", "execution", "broker", "marketplace", "portfolio"],
    citations: [
      cite("README.md#product-areas", "Product areas"),
      cite("TERMS.md#service", "Terms: service"),
    ],
  },
  {
    id: "value-integrated-workflow",
    topic: "positioning",
    status: "hypothesis",
    statement:
      "The proposed value is reducing the work from discovery through price-history research, watchlisting, portfolio tracking, and monitoring in one explainable workflow; no public time-saved or decision-quality study validates it.",
    keywords: ["value", "proposition", "workflow", "research", "portfolio", "decision", "time"],
    citations: [cite("docs/product-strategy-faq.md#positioning-value-proposition-and-target-users", "Canonical positioning")],
  },
  {
    id: "target-users-functional",
    topic: "users_and_alternatives",
    status: "shipped_fact",
    statement:
      "Current workflows serve Magic collectors, collection owners, market researchers, portfolio users, developers, and AI-tool users; this is a functional target description, not measured audience composition.",
    keywords: ["target", "users", "collectors", "investors", "developers", "audience", "persona"],
    citations: [
      cite("README.md#product-areas", "Product areas"),
      cite("src/app/developers/developers-hub.tsx", "Developer surface"),
    ],
  },
  {
    id: "alternatives-unknown",
    topic: "users_and_alternatives",
    status: "unknown_not_measured",
    statement:
      "No published repository research measures how users divide work among spreadsheets, marketplace watchlists, collection apps, price sites, communities, or manual browsing, or whether Magic Brain replaces them.",
    keywords: ["alternatives", "behavior", "spreadsheet", "competitors", "replacement", "current workflow"],
    citations: [cite("docs/product-strategy-faq.md#what-users-do-today-and-current-alternatives", "Alternatives and behavior")],
  },
  {
    id: "differentiation-shipped",
    topic: "differentiation_and_moat",
    status: "shipped_fact",
    statement:
      "The product integrates portfolio and cost-basis records, P&L, watchlists, price history, market screens, explainable signals, portfolio construction, Cardmarket links, and a provenance-aware public API.",
    keywords: ["differentiation", "integrated", "workflow", "portfolio", "signals", "api", "cardmarket"],
    citations: [
      cite("README.md#product-areas", "Product areas"),
      cite("src/lib/public-api/openapi.ts", "Public API contract"),
    ],
  },
  {
    id: "moat-emerging-not-established",
    topic: "differentiation_and_moat",
    status: "hypothesis",
    statement:
      "An integrated workflow, normalized historical data, and transparent analytics may become a defensible product advantage.",
    keywords: ["moat", "defensibility", "advantage", "proprietary", "network effects", "superiority", "differentiation"],
    citations: [cite("docs/product-strategy-faq.md#differentiation-and-moat", "Differentiation and moat")],
  },
  {
    id: "competitive-superiority-unknown",
    topic: "differentiation_and_moat",
    status: "unknown_not_measured",
    statement:
      "Magic Brain has not publicly demonstrated an established proprietary moat, network-effect moat, switching costs, durable competitive superiority, or superior forecast performance; do not claim otherwise.",
    keywords: ["moat", "competitive", "superiority", "network effects", "switching costs", "forecast"],
    citations: [cite("docs/product-strategy-faq.md#differentiation-and-moat", "Differentiation and moat")],
  },
  {
    id: "portfolio-position-limit",
    topic: "metrics_and_demand",
    status: "shipped_fact",
    statement:
      "Brain Pro portfolio generation is capped at 20 positions; this product limit is not assets under management, custody, transaction volume, or an AUM-equivalent metric.",
    keywords: ["portfolio", "size", "positions", "20", "aum", "assets", "managed"],
    citations: [
      cite("src/lib/brain.ts", "Portfolio generation implementation"),
      cite("https://magicbrain.es/pro", "Brain Pro pricing and features"),
    ],
  },
  {
    id: "business-metrics-unknown",
    topic: "metrics_and_demand",
    status: "unknown_not_measured",
    statement:
      "The repository publishes no reliable active-user, paying-user, conversion, retention, churn, ARPU, LTV, willingness-to-pay, market-size, GMV, transaction-volume, AUM-equivalent, or average-user-portfolio-size metrics. Do not fabricate values, ranges, or proxies.",
    keywords: ["aum", "conversion", "retention", "churn", "willingness", "pay", "market size", "users", "arpu", "ltv", "gmv", "portfolio size"],
    citations: [cite("docs/product-strategy-faq.md#metrics-portfolio-size-and-willingness-to-pay", "Metrics and demand")],
  },
  {
    id: "willingness-to-pay-hypothesis",
    topic: "metrics_and_demand",
    status: "hypothesis",
    statement:
      "A low-price subscription may appeal to users who value recurring research and portfolio intelligence, but willingness to pay has not been publicly measured or validated.",
    keywords: ["willingness", "pay", "pricing", "demand", "subscription", "validation"],
    citations: [cite("docs/product-strategy-faq.md#metrics-portfolio-size-and-willingness-to-pay", "Metrics and demand")],
  },
  {
    id: "monetization-pro",
    topic: "monetization",
    status: "shipped_fact",
    statement:
      "Brain Pro is presented at €5 per month with a 14-day trial and cancellation messaging on the current product page.",
    keywords: ["monetization", "brain pro", "price", "€5", "subscription", "trial"],
    citations: [cite("https://magicbrain.es/pro", "Brain Pro pricing")],
  },
  {
    id: "monetization-referral",
    topic: "monetization",
    status: "shipped_fact",
    statement:
      "Cardmarket outbound links can include a configured referral parameter and are marked sponsored; material referral revenue is not disclosed.",
    keywords: ["monetization", "cardmarket", "referral", "affiliate", "sponsored", "revenue"],
    citations: [cite("src/app/page.tsx", "Cardmarket link implementation")],
  },
  {
    id: "monetization-donations-api",
    topic: "monetization",
    status: "shipped_fact",
    statement:
      "Magic Brain accepts optional one-time, non-charitable contributions and exposes a read-only public data API; the repository documents no paid API plan.",
    keywords: ["donation", "contribution", "public api", "api pricing", "monetization"],
    citations: [
      cite("https://magicbrain.es/donate", "Support page"),
      cite("https://magicbrain.es/developers", "Developer page"),
    ],
  },
  {
    id: "provenance-sources",
    topic: "provenance_and_trust",
    status: "shipped_fact",
    statement:
      "Current product queries use price rows labelled MTGJSON; card records use Scryfall printing identifiers and may use Scryfall metadata/images. Provider labels are provenance, not a redistribution grant.",
    keywords: ["provenance", "mtgjson", "scryfall", "source", "data", "license"],
    citations: [
      cite("docs/data-import.md", "Data import guide"),
      cite("NOTICE.md#data-and-services", "Data notices"),
    ],
  },
  {
    id: "price-transparency",
    topic: "provenance_and_trust",
    status: "shipped_fact",
    statement:
      "Public price records preserve source, observation date, EUR currency, and finish (nonfoil or foil), and missing values must remain missing rather than becoming zero.",
    keywords: ["source", "date", "currency", "eur", "finish", "nonfoil", "foil", "missing", "transparent"],
    citations: [
      cite("src/lib/public-api/openapi.ts", "OpenAPI price schema"),
      cite("docs/data-import.md", "Data import guide"),
    ],
  },
  {
    id: "trust-posture",
    topic: "provenance_and_trust",
    status: "operating_principle",
    statement:
      "Trust should be earned through visible provenance, bounded claims, explainable methods, explicit uncertainty, reproducible corrections, and primary-source links—not a blanket accuracy or superiority claim.",
    keywords: ["trust", "accuracy", "transparency", "explainable", "corrections"],
    citations: [cite("docs/product-strategy-faq.md#data-provenance-transparency-and-trust", "Trust posture")],
  },
  {
    id: "regulatory-disclaimer",
    topic: "regulatory_and_risk",
    status: "shipped_fact",
    statement:
      "Magic Brain provides informational collection and market-research tools. Outputs may be delayed, incomplete, incorrect, or unavailable and are not financial, investment, tax, or legal advice; they do not guarantee value, liquidity, or future performance.",
    keywords: ["regulatory", "financial advice", "risk", "disclaimer", "guarantee", "legal", "investment"],
    citations: [cite("TERMS.md#service", "Terms: service")],
  },
  {
    id: "regulatory-no-universal-opinion",
    topic: "regulatory_and_risk",
    status: "unknown_not_measured",
    statement:
      "The repository contains no legal opinion establishing exemption from every financial, consumer, advertising, privacy, tax, or marketplace rule in every jurisdiction.",
    keywords: ["regulatory", "legal opinion", "jurisdiction", "compliance", "exempt"],
    citations: [cite("TERMS.md", "Terms template")],
  },
  {
    id: "liquidity-caveat",
    topic: "liquidity_and_signals",
    status: "operating_principle",
    statement:
      "Trading-card markets can be thin, fragmented, condition/language/finish-specific, and vulnerable to stale listings, isolated transactions, buyouts, outliers, reprints, grading, and data gaps; a displayed price or move is not proof of executable liquidity.",
    keywords: ["liquidity", "thin", "manipulation", "buyout", "stale", "outlier", "execution", "listing"],
    citations: [cite("docs/product-strategy-faq.md#liquidity-manipulation-and-confidence-scores", "Liquidity caveats")],
  },
  {
    id: "confidence-meaning",
    topic: "liquidity_and_signals",
    status: "shipped_fact",
    statement:
      "Latest Set Watch confidence is a data-confidence component based on available history and observations in a relative analytical score; it is not a calibrated probability of profit, forecast accuracy, liquidity, authenticity, or execution success.",
    keywords: ["confidence", "score", "signal", "probability", "profit", "history", "observations"],
    citations: [
      cite("src/lib/latest-set-watch-score.ts", "Score implementation"),
      cite("https://magicbrain.es/market/latest-set-watch", "Latest Set Watch methodology"),
    ],
  },
  {
    id: "failed-signals-unknown",
    topic: "liquidity_and_signals",
    status: "unknown_not_measured",
    statement:
      "No validated false-positive rate, hit rate, calibration curve, performance history, or canonical dataset of failed high-confidence signals is published. Do not invent examples, winners, losers, or backtests.",
    keywords: ["failed", "high confidence", "signals", "false positive", "hit rate", "backtest", "performance"],
    citations: [cite("docs/product-strategy-faq.md#liquidity-manipulation-and-confidence-scores", "Signal limitations")],
  },
  {
    id: "stale-missing-response",
    topic: "incidents_and_corrections",
    status: "operating_principle",
    statement:
      "If source, date, currency, or finish is absent, treat a price as unusable. For stale, missing, sparse, contradictory, or implausible data, disclose the limitation, avoid a directional conclusion, retry with bounded backoff where appropriate, and verify with the cited provider or marketplace.",
    keywords: ["stale", "missing", "incident", "data quality", "retry", "source", "verify"],
    citations: [cite("docs/product-strategy-faq.md#stale-or-missing-data-incidents-and-corrections", "Data incident guidance")],
  },
  {
    id: "incident-process",
    topic: "incidents_and_corrections",
    status: "operating_principle",
    statement:
      "For a suspected incident, preserve the request ID and affected card/source/date/finish, stop presenting affected output as current, report via the issue tracker (or private security channel for vulnerabilities), and communicate scope and uncertainty.",
    keywords: ["incident", "downtime", "request id", "support", "security", "response"],
    citations: [
      cite("https://github.com/assarasua/magic-brain/issues", "Support tracker"),
      cite("SECURITY.md", "Security reporting"),
    ],
  },
  {
    id: "postmortem-principle",
    topic: "incidents_and_corrections",
    status: "operating_principle",
    statement:
      "A correction or post-mortem should document impact, timeline, detection, known root cause, remediation, backfill/correction status, and prevention; preserve old/new values and provenance where lawful rather than silently rewriting a material claim.",
    keywords: ["postmortem", "post-mortem", "correction", "root cause", "incident", "backfill"],
    citations: [cite("docs/product-strategy-faq.md#stale-or-missing-data-incidents-and-corrections", "Correction principles")],
  },
  {
    id: "incident-metrics-unknown",
    topic: "incidents_and_corrections",
    status: "unknown_not_measured",
    statement:
      "No public incident history, downtime record, SLO, SLA, response-time guarantee, or mean-time-to-recovery metric is maintained in the repository; absence of a record is not evidence of no incidents.",
    keywords: ["incident", "downtime", "sla", "slo", "uptime", "mttr", "response time"],
    citations: [cite("docs/product-strategy-faq.md#stale-or-missing-data-incidents-and-corrections", "Incident unknowns")],
  },
  {
    id: "growth-surfaces",
    topic: "growth",
    status: "shipped_fact",
    statement:
      "Current discoverable surfaces include the public web app, open-source repository, public API, MCP connector, Cardmarket outbound links, and contribution pages; this does not establish channel performance.",
    keywords: ["growth", "channels", "distribution", "github", "api", "mcp", "cardmarket"],
    citations: [
      cite("README.md", "Repository README"),
      cite("https://magicbrain.es/developers", "Developer page"),
    ],
  },
  {
    id: "growth-hypotheses",
    topic: "growth",
    status: "hypothesis",
    statement:
      "Search-oriented market pages, explainable research, developer integrations, open-source participation, and educational content are possible acquisition experiments; no channel attribution, CAC, or content-to-signup conversion is published.",
    keywords: ["growth", "channels", "seo", "content", "acquisition", "cac", "conversion"],
    citations: [cite("docs/product-strategy-faq.md#growth-content-loops-and-viral-loops", "Growth hypotheses")],
  },
  {
    id: "viral-loop-hypothesis",
    topic: "growth",
    status: "hypothesis",
    statement:
      "Shareable watchlists, portfolio snapshots, signal explanations, or set reports could create content or referral loops, but these loops are not documented as shipped, instrumented, or validated.",
    keywords: ["viral", "loop", "sharing", "referral", "content loop", "watchlist", "snapshot"],
    citations: [cite("docs/product-strategy-faq.md#growth-content-loops-and-viral-loops", "Viral-loop hypotheses")],
  },
  {
    id: "growth-metrics-unknown",
    topic: "growth",
    status: "unknown_not_measured",
    statement:
      "No viral coefficient, referral conversion, organic growth rate, channel-level retention, or content-to-signup conversion is published.",
    keywords: ["viral coefficient", "referral conversion", "organic growth", "retention", "growth metrics"],
    citations: [cite("docs/product-strategy-faq.md#growth-content-loops-and-viral-loops", "Growth unknowns")],
  },
  {
    id: "scope-magic-only",
    topic: "adjacent_tcgs",
    status: "shipped_fact",
    statement:
      "The current application, data model, public API, and MCP product knowledge are scoped to Magic: The Gathering.",
    keywords: ["scope", "magic only", "mtg", "tcg", "pokemon", "yugioh", "lorcana"],
    citations: [
      cite("README.md", "Repository README"),
      cite("src/lib/public-api/openapi.ts", "Public API contract"),
    ],
  },
  {
    id: "adjacent-tcg-option",
    topic: "adjacent_tcgs",
    status: "roadmap_option",
    statement:
      "Pokémon, Yu-Gi-Oh!, Lorcana, One Piece, or other TCG support could be evaluated after validating provider rights, identifiers, condition/finish semantics, marketplace coverage, demand, and operating cost; no launch is committed.",
    keywords: ["adjacent", "tcg", "pokemon", "yugioh", "lorcana", "one piece", "expansion", "roadmap"],
    citations: [cite("docs/product-strategy-faq.md#adjacent-trading-card-games", "Adjacent TCGs")],
  },
  {
    id: "answer-discipline",
    topic: "provenance_and_trust",
    status: "operating_principle",
    statement:
      "Answers must preserve epistemic status, cite specific evidence, separate facts from hypotheses and options, and explicitly say unknown/not measured instead of fabricating unsupported business, behavior, incident, or superiority claims.",
    keywords: ["epistemic", "citation", "unknown", "fabricate", "answer", "evidence"],
    citations: [cite("docs/product-strategy-faq.md#required-answer-discipline", "Required answer discipline")],
  },
];

const ALIASES: Record<string, string[]> = {
  competitor: ["alternatives", "superiority", "moat"],
  competition: ["alternatives", "superiority", "moat"],
  outage: ["incident", "downtime", "sla"],
  availability: ["uptime", "sla", "downtime"],
  pricing: ["monetization", "subscription", "pay"],
  revenue: ["monetization", "referral", "subscription"],
  manipulation: ["buyout", "outlier", "thin", "liquidity"],
  reliability: ["trust", "incident", "accuracy"],
  pokemon: ["adjacent", "tcg"],
};

export function searchProductKnowledge(input: {
  query: string;
  topics?: ProductTopic[];
  statuses?: ProductStatus[];
  limit?: number;
}): ProductKnowledgeResult {
  const tokens = queryTokens(input.query);
  const topicSet = input.topics?.length ? new Set(input.topics) : undefined;
  const statusSet = input.statuses?.length ? new Set(input.statuses) : undefined;
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 12);

  const results = PRODUCT_FACTS
    .filter((fact) => !topicSet || topicSet.has(fact.topic))
    .filter((fact) => !statusSet || statusSet.has(fact.status))
    .map((fact) => ({ ...fact, score: scoreFact(fact, tokens) }))
    .filter(({ score }) => score > 0 || Boolean(topicSet) || Boolean(statusSet))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit);

  return {
    query: input.query,
    results,
    taxonomy: PRODUCT_TAXONOMY,
    canonicalDocument: CANONICAL_PRODUCT_DOCUMENT,
    retrievalNotice:
      "Deterministic retrieval only; no model was called. The host may synthesize from these statements but must preserve statuses, citations, unknowns, and caveats.",
  };
}

export function getProductContext(input: {
  topics: ProductTopic[];
  statuses?: ProductStatus[];
  limit?: number;
}): Omit<ProductKnowledgeResult, "query"> & { topics: ProductTopic[] } {
  const result = searchProductKnowledge({
    query: "",
    topics: input.topics,
    ...(input.statuses ? { statuses: input.statuses } : {}),
    limit: input.limit ?? 12,
  });
  return {
    topics: input.topics,
    results: result.results,
    taxonomy: result.taxonomy,
    canonicalDocument: result.canonicalDocument,
    retrievalNotice: result.retrievalNotice,
  };
}

function queryTokens(query: string): string[] {
  const base = normalize(query).split(" ").filter((token) => token.length > 1);
  return [...new Set(base.flatMap((token) => [token, ...(ALIASES[token] ?? [])]))];
}

function scoreFact(fact: ProductFact, tokens: string[]): number {
  if (tokens.length === 0) return 1;
  const id = normalize(fact.id);
  const topic = normalize(fact.topic);
  const keywords = fact.keywords.map(normalize);
  const statement = normalize(fact.statement);
  return tokens.reduce((score, token) => {
    if (id.includes(token)) score += 5;
    if (topic.includes(token)) score += 4;
    if (keywords.some((keyword) => keyword.includes(token) || token.includes(keyword))) {
      score += 3;
    }
    if (statement.includes(token)) score += 1;
    return score;
  }, 0);
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9€]+/g, " ")
    .trim();
}
