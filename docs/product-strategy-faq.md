# Magic Brain public product strategy and FAQ

Last reviewed: 13 September 2026

This is the canonical public source for product and business diligence answers
returned by the Magic Brain MCP connector. It separates what exists today from
principles, hypotheses, options, and unknowns. Product marketing is not evidence
of adoption, outcomes, or competitive superiority.

## Epistemic taxonomy

- **Shipped fact** — directly evidenced by current repository code, product
  pages, public API contracts, or policy documents.
- **Operating principle** — a rule Magic Brain intends to follow when operating
  or communicating about the shipped product; it is not an uptime or outcome
  guarantee.
- **Hypothesis** — a belief or experiment that has not been validated by
  published product data.
- **Roadmap option** — a possible future direction, not a commitment.
- **Unknown / not measured** — the repository contains no reliable public
  measurement. The MCP must say so rather than estimate or infer a number.

## Positioning, value proposition, and target users

- **Status: shipped fact.** Magic Brain is a research and portfolio-intelligence
  workspace for Magic: The Gathering cards. It combines catalogue exploration,
  EUR price history, market signals, portfolio and cost-basis tracking,
  watchlists, explainable portfolio construction, and a public data API.
  Sources: [README product areas](../README.md#product-areas),
  [Brain Pro tools hub](https://magicbrain.es/brain-pro), and
  [developer page](https://magicbrain.es/developers).
- **Status: shipped fact.** Magic Brain is not a marketplace, broker, exchange,
  custodian, order-routing service, or trading/execution venue. Users leave the
  product to view listings on Cardmarket; Magic Brain does not execute trades.
  Sources: [Cardmarket link implementation](../src/app/page.tsx) and
  [Terms — Service](../TERMS.md#service).
- **Status: shipped fact.** Current workflows are aimed at Magic collectors,
  collection owners, market researchers, and users who want portfolio context
  before making their own purchase or sale decisions. The public API and MCP
  also serve developers and AI-tool users. This describes product functionality,
  not measured audience composition. Sources: [README](../README.md),
  [Brain Pro](https://magicbrain.es/brain-pro), and
  [developer page](https://magicbrain.es/developers).
- **Status: hypothesis.** The central value proposition is that a single,
  explainable workflow can reduce the effort of moving from card discovery to
  historical research, watchlisting, portfolio tracking, and monitoring.
  No public time-saved or decision-quality study validates this hypothesis.

## Differentiation and moat

- **Status: shipped fact.** The current product integrates portfolio records,
  cost basis, P&L, watchlists, price history, market screens, explainable signals,
  portfolio construction, Cardmarket outbound links, and a provenance-aware
  public API in one codebase. Sources: [README product areas](../README.md#product-areas)
  and [public OpenAPI definition](../src/lib/public-api/openapi.ts).
- **Status: operating principle.** The intended differentiation is transparent,
  inspectable analytics: expose the source, observation date, currency, finish,
  score components, and rationale rather than presenting an unexplained trade
  instruction. Sources: [Latest Set Watch](https://magicbrain.es/market/latest-set-watch),
  [OpenAPI price schema](../src/lib/public-api/openapi.ts), and
  [data import guidance](data-import.md).
- **Status: hypothesis.** An emerging integrated workflow, normalized historical
  data, and transparent analytics may become a defensible product advantage.
- **Status: unknown / not measured.** Magic Brain has not established or
  publicly demonstrated a proprietary data moat, network-effect moat, switching
  costs, durable competitive superiority, or superior forecast performance.
  Do not describe the moat as established.

## What users do today and current alternatives

- **Status: shipped fact.** The product supports catalogue search, market
  gainers/losers, Reserved List research, portfolios, watchlists, Brain
  portfolio generation, signals, historical-price questions, discovery,
  Cardmarket links, and developer access. Source: [README](../README.md).
- **Status: unknown / not measured.** The repository does not publish research
  showing how users currently split work among spreadsheets, marketplace
  watchlists, collection apps, price sites, Discord/social communities, or
  manual browsing.
- **Status: unknown / not measured.** No public repository data establishes
  acquisition funnels, feature usage, cohort behavior, conversion, retention,
  churn, engagement, or replacement of competing tools.
- **Status: operating principle.** When discussing alternatives, compare
  observable workflows and disclosed features. Do not claim Magic Brain is
  better, more accurate, safer, or cheaper overall without comparative evidence.

## Metrics, portfolio size, and willingness to pay

- **Status: shipped fact.** A Brain Pro strategy can contain up to 20 positions.
  This is a product limit, not customer assets under management. Sources:
  [Brain Pro](https://magicbrain.es/brain-pro)
  and [portfolio-generation implementation](../src/lib/brain.ts).
- **Status: unknown / not measured.** Magic Brain does not publish
  assets-under-management or AUM-equivalent metrics. User-entered portfolio value
  must never be represented as assets managed, advised on, custodied, or traded
  by Magic Brain.
- **Status: unknown / not measured.** The repository provides no reliable public
  figures for active users, paying users, conversion, retention, churn, ARPU,
  LTV, willingness to pay, market size, GMV, transaction volume, or average
  user portfolio size. Do not fabricate ranges or proxy estimates.
- **Status: operating principle.** Brain Pro product intelligence features are
  currently available without a paid subscription. The project accepts
  optional, one-time contributions.

## Monetization

- **Status: shipped fact.** Magic Brain does not currently sell a premium
  subscription; Brain Pro tools are available to authenticated users without a
  paid plan. Source: [Brain Pro](https://magicbrain.es/brain-pro).
- **Status: shipped fact.** Cardmarket outbound links can include a configured
  referral parameter and are marked as sponsored links. Whether any given
  deployment currently earns material referral revenue is not disclosed.
  Source: [Cardmarket link implementation](../src/app/page.tsx).
- **Status: shipped fact.** Magic Brain accepts optional one-time P2P
  contributions through [PayPal.Me](https://paypal.me/assarasua); the page
  states these are not charitable or tax-deductible donations.
  Source: [support page](https://magicbrain.es/donate).
- **Status: shipped fact.** A read-only public card/set/price API is available.
  The repository does not document a paid API plan. Source:
  [developer page](https://magicbrain.es/developers).
- **Status: unknown / not measured.** Revenue mix, subscription conversion,
  referral revenue, donation volume, API monetization, and willingness to pay
  are not publicly measured in this repository.

## Data provenance, transparency, and trust

- **Status: shipped fact.** Product database queries currently select price
  observations labelled `mtgjson`; card records use Scryfall printing IDs and
  may use Scryfall metadata/images. Sources: [data import guide](data-import.md)
  and [notices](../NOTICE.md#data-and-services).
- **Status: shipped fact.** Public price records preserve source, observation
  date, EUR currency, and finish (`nonfoil` or `foil`). Missing values remain
  missing rather than being converted to zero. Sources:
  [OpenAPI price schema](../src/lib/public-api/openapi.ts) and
  [data import guide](data-import.md).
- **Status: shipped fact.** Product card actions link to Cardmarket searches;
  Magic Brain does not claim those links are executable quotes or guaranteed
  available inventory. Source: [Cardmarket link implementation](../src/app/page.tsx).
- **Status: operating principle.** Trust should come from visible provenance,
  bounded claims, explainable methods, explicit uncertainty, reproducible
  corrections, and links to primary evidence—not from a blanket accuracy claim.
- **Status: unknown / not measured.** No audited accuracy rate, data-completeness
  SLA, uptime SLA, formal incident SLA, or externally certified control
  framework is published in the repository.

## Regulatory and risk posture

- **Status: shipped fact.** Magic Brain provides informational collection and
  market-research tools. Prices, history, scores, and trends may be delayed,
  incomplete, incorrect, or unavailable and are not financial, investment, tax,
  or legal advice. Source: [Terms — Service](../TERMS.md#service).
- **Status: shipped fact.** Magic Brain does not custody cards or money, execute
  orders, promise returns, or guarantee liquidity or future performance.
  Sources: [Terms](../TERMS.md) and [product disclaimer](https://magicbrain.es/market/latest-set-watch).
- **Status: operating principle.** Users should independently verify listings,
  condition, language, fees, taxes, shipping, legal obligations, and market
  depth before acting. Signals are research inputs, not personalized suitability
  determinations or instructions to buy or sell.
- **Status: unknown / not measured.** The repository contains no legal opinion
  that the service is exempt from every financial, consumer, advertising,
  privacy, tax, or marketplace rule in every jurisdiction. Deployment operators
  must obtain jurisdiction-specific advice.

## Liquidity, manipulation, and confidence scores

- **Status: operating principle.** Trading-card markets can be thin,
  condition-specific, language-specific, fragmented, and vulnerable to stale
  listings or isolated transactions. A displayed price or short-term percentage
  move is not proof that a position can be entered or exited at that price.
- **Status: operating principle.** Low-depth observations and sharp moves may be
  influenced by listing changes, buyouts, outliers, data gaps, reprints, grading,
  condition, language, finish, or marketplace effects. Confirm multiple current
  listings and total transaction costs before relying on a signal.
- **Status: shipped fact.** Latest Set Watch confidence is a **data-confidence
  component** based on available history/observations within a relative
  analytical score. It is not a calibrated probability of profit, forecast
  accuracy, liquidity, authenticity, or execution success. Source:
  [Latest Set Watch methodology](https://magicbrain.es/market/latest-set-watch).
- **Status: operating principle.** “High confidence” means the scoring inputs
  are comparatively better supported under the current methodology; it must
  never be translated into “high chance of return.”
- **Status: unknown / not measured.** Magic Brain does not publish a validated
  false-positive rate, hit rate, calibration curve, or performance history for
  high-confidence signals.
- **Status: unknown / not measured.** The repository has no canonical dataset of
  failed high-confidence signals. If asked for examples or a failure rate, say
  they are not recorded publicly; do not invent winners, losers, or backtests.

## Stale or missing data, incidents, and corrections

- **Status: shipped fact.** Public API responses identify observation dates;
  latest-price responses may be cached for five minutes and metadata/history for
  one hour, with stale-while-revalidate windows. Source:
  [developer freshness policy](https://magicbrain.es/developers#policies).
- **Status: operating principle.** If source, date, currency, or finish is absent,
  treat the price as unusable for diligence. If data is stale, missing, sparse,
  contradictory, or implausible, say so, avoid a directional conclusion, retry
  with bounded backoff when appropriate, and verify against the cited provider
  or marketplace.
- **Status: operating principle.** For suspected incidents, preserve the request
  ID and affected card/source/date/finish, stop presenting the affected output
  as current, report through the public issue tracker (or privately through the
  security channel for vulnerabilities), and communicate scope and uncertainty.
  Sources: [support tracker](https://github.com/assarasua/magic-brain/issues)
  and [security policy](../SECURITY.md).
- **Status: operating principle.** A correction or post-mortem should identify
  impact, timeline, detection, root cause when known, remediation, data
  backfill/correction status, and prevention steps. Preserve the old/new values
  and provenance where lawful, and do not silently rewrite a material claim.
- **Status: unknown / not measured.** No public incident history, downtime
  record, SLO, SLA, mean-time-to-recovery metric, or guaranteed response time is
  maintained in this repository. Do not claim “no incidents” from absence of a
  record.

## Growth, content loops, and viral loops

- **Status: shipped fact.** Current discoverable surfaces include the public web
  app, open-source GitHub repository, developer API, MCP connector, Cardmarket
  outbound links, and contribution/support pages. This is a list of surfaces,
  not evidence of channel performance.
- **Status: hypothesis.** Search-oriented market pages, explainable card/set
  research, developer integrations, open-source participation, and educational
  content could become acquisition channels. No channel attribution or CAC data
  is published.
- **Status: hypothesis.** Shareable watchlists, portfolio snapshots, signal
  explanations, or set reports could create content or referral loops. These
  loops are not documented as shipped, instrumented, or validated.
- **Status: unknown / not measured.** There is no published viral coefficient,
  referral conversion, content-to-signup conversion, organic growth rate, or
  channel-level retention.

## Adjacent trading-card games

- **Status: shipped fact.** The current application, data model, public API, and
  MCP product knowledge are scoped to Magic: The Gathering.
- **Status: roadmap option.** Support for Pokémon, Yu-Gi-Oh!, Lorcana, One Piece,
  or other trading-card games could be evaluated only after validating provider
  rights, identifiers, finishes/conditions, marketplace coverage, demand, and
  operational cost. No adjacent-TCG launch is committed.
- **Status: hypothesis.** The workflow may generalize to other collectible-card
  markets, but shared UX does not imply shared data quality, liquidity, legal
  rights, or customer demand.

## Required answer discipline

- **Status: operating principle.** Cite the specific evidence entries used and
  preserve their epistemic status in every answer.
- **Status: operating principle.** Separate current facts from hypotheses and
  roadmap options. Do not convert a roadmap option into a promise.
- **Status: operating principle.** Explicitly answer “unknown / not measured”
  when asked for AUM-equivalent, conversion, retention, willingness to pay,
  market size, user behavior, incident/SLA, or competitive-superiority metrics
  not present above.
- **Status: operating principle.** The MCP server performs deterministic
  retrieval only. The host model may synthesize an answer from returned
  evidence, but must not imply that retrieval created new facts.
