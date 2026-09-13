# Magic Brain MCP tool reference

This is the canonical reference for the 11 read-only tools currently registered
by the Magic Brain MCP server. For installation and client configuration, see
the [MCP installation guide](mcp-installation.md). The live endpoint is:

```text
https://magic-brain-mcp.assarasua.workers.dev/mcp
```

The hosted connector requires no Magic Brain account, OAuth flow, or user API
key. It can retrieve public card, price, set, rules, and product evidence only.
It cannot access a user's account, portfolio, watchlist, collection,
authentication records, payment, or contribution
data, and it exposes no write or trading tools.

## How answers are composed

Magic Brain returns bounded evidence; the host model, such as Claude, chooses
tools and composes the final answer.

- Public-data tools return the public API response under `data`, plus
  `attribution.service`, `attribution.source_url`,
  `attribution.fetched_at`, `attribution.notice`, and, when supplied upstream,
  `request_id`. Cite or link `attribution.source_url`, and preserve each price's
  own `source`, `observedAt`, `currency`, and `finish`.
- Rules tools search a pinned local index of the official Magic: The Gathering
  Comprehensive Rules. Each excerpt has a rule number or glossary term,
  section, PDF page, and official source URL. The retrieved excerpts are the
  authority; `ask_rules.explanatorySynthesis` is explicitly
  `non-authoritative`, is not a judge ruling, and must not be presented as one.
- Product tools perform deterministic lexical retrieval and do not call
  another model. The host may synthesize only from returned statements, must
  cite their URLs, and must retain each statement's epistemic status:
  `shipped_fact`, `operating_principle`, `hypothesis`, `roadmap_option`, or
  `unknown_not_measured`. Unknowns must remain unknown rather than being
  estimated.
- Prices are EUR market observations from the source named on each record.
  `observedAt` is the observation date, and `finish` is `nonfoil` or `foil`.
  Missing price values stay missing; they are not zero. A displayed price,
  score, confidence label, or entry range is not proof of liquidity, a profit
  probability, a price target, or financial advice.

All tools are read-only, non-destructive, and idempotent. Public-data tools may
change as the public catalogue changes. Rules and product tools query pinned
local knowledge.

## Card & price data

### `search_cards`

**Purpose.** Find public card printings and their latest available prices before
using a card-specific tool.

**Use it when.** The user knows a card or set name but not the canonical card
printing ID, or wants a bounded filtered catalogue page.

**Inputs**

- `query` — required string, trimmed, 2–120 characters. The MCP description
  permits card name or text; the current public API handler searches card names
  and set names, not Oracle rules text.
- `set_code` — optional string, trimmed, lowercased, 2–8 ASCII lowercase
  letters or digits.
- `rarity` — optional enum: `common`, `uncommon`, `rare`, `mythic`, `special`,
  or `bonus`.
- `language` — optional string, trimmed, 2–10 characters.
- `cursor` — optional opaque string, at most 512 characters. Use only a cursor
  returned by the preceding page.
- `limit` — optional integer, 1–50; default `20`.

**Meaningful output.** `data.data` is the card array and
`data.meta.pagination.nextCursor` is the next-page cursor. Each card can include
`id`, `oracleId`, `name`, `set` (`code`, `name`), `collectorNumber`, `language`,
`rarity`, `typeLine`, `colorIdentity`, `releasedAt`, `imageUrl`,
`identifiers.cardmarketId`, and `latestPrices`. Each latest price includes
`amount`, `currency`, `finish`, `source`, and `observedAt`.

**Example user question.** “Find English printings of The One Ring from LTR and
show me their IDs.”

**Caveats and errors.** Results identify printings, not abstract Oracle cards.
The cursor is opaque and can be rejected if malformed or obsolete. Validation
rejects short queries, unsupported rarities, oversized values, and limits
outside the range. Upstream 4xx/5xx, timeout, rate-limit, invalid JSON, and
response-size failures are returned as tool errors.

### `get_card`

**Purpose.** Retrieve one public card printing and its latest available prices.

**Use it when.** A prior search returned the exact printing ID and the user
wants printing, set, identifier, image, and latest-price details.

**Inputs**

- `card_id` — required string, trimmed, 1–128 characters. The live public API
  additionally requires a canonical UUID, normally the returned Scryfall
  printing ID.

**Meaningful output.** `data.data` can include `id`, `oracleId`, `name`, `set`,
`collectorNumber`, `language`, `rarity`, `typeLine`, `colorIdentity`,
`releasedAt`, `imageUrl`, `identifiers.cardmarketId`, and `latestPrices`.
Attribution and an optional request ID accompany the API payload.

**Example user question.** “Give me the printing details and latest prices for
card ID `4c6a6a6d-...`.”

**Caveats and errors.** A non-UUID ID is rejected by the public API; an unknown
UUID returns not found. Nullable metadata and an empty `latestPrices` array mean
the catalogue or current price source has no value. This tool never returns
ownership or user data.

### `get_latest_prices`

**Purpose.** Retrieve latest available public prices for several exact card
printings in one request.

**Use it when.** The user already has card IDs and wants an efficient current
price comparison.

**Inputs**

- `card_ids` — required array of 1–100 unique strings. Each item is trimmed and
  1–128 characters; the live public API additionally requires every item to be
  a UUID. Duplicate IDs are rejected by the MCP schema.

**Meaningful output.** `data.data.prices` contains objects with `cardId` and a
`prices` array. Price records contain `amount`, EUR `currency`, `finish`
(`nonfoil` or `foil`), `source`, and `observedAt`.
`data.data.missingCardIds` identifies requested UUIDs for which no card row was
returned.

**Example user question.** “Compare the latest nonfoil and foil EUR prices for
these five printing IDs.”

**Caveats and errors.** “Latest” means the latest observation available from
the named source, not a live executable quote. A known card can have an empty
`prices` array; that differs from an ID in `missingCardIds`. Invalid UUIDs,
duplicates, empty arrays, and more than 100 IDs fail validation.

### `get_price_history`

**Purpose.** Retrieve bounded historical price observations for one printing.

**Use it when.** The user wants to examine movement, volatility, drawdown, or
foil versus nonfoil history over a defined period.

**Inputs**

- `card_id` — required string, trimmed, 1–128 characters; the live API requires
  a UUID.
- `start_date` — required real calendar date string in `YYYY-MM-DD` format.
- `end_date` — required real calendar date string in `YYYY-MM-DD` format and
  not before `start_date`.
- `finish` — optional enum `all`, `nonfoil`, or `foil`; default `all`.

The MCP validator permits no more than 366 days between the date endpoints. The
public API enforces a maximum inclusive window of 366 calendar dates (a
365-day difference), so use that stricter bound.

**Meaningful output.** `data.data` contains `cardId`, normalized `from` and `to`
dates, and `prices`. Each observation has `amount`, EUR `currency`, `finish`,
`source`, and `observedAt`.

**Example user question.** “Show the weekly trend you can infer from daily
nonfoil observations for this printing from 2026-01-01 through 2026-03-31.”

**Caveats and errors.** The tool returns stored daily observations; it does not
provide an interval input or guarantee one row per day. Missing dates remain
gaps. Invalid dates, reversed or oversized ranges, unsupported finishes,
non-UUID IDs, and unknown cards are errors. Any aggregation or weekly summary
is the host model's synthesis and should retain source and date caveats.

## Sets & opportunities

### `list_sets`

**Purpose.** List normalized public set metadata with optional search and
tabletop filtering.

**Use it when.** The user needs a set code, release metadata, or a bounded set
catalogue before searching cards or opportunities.

**Inputs**

- `query` — optional string, trimmed, 1–80 characters; matches set code or name.
- `tabletop_only` — optional boolean; default `true`.
- `cursor` — optional opaque string, at most 512 characters.
- `limit` — optional integer, 1–50; default `25`.

**Meaningful output.** `data.data` is an array of sets with `code`, `name`,
`releasedAt`, `setType`, `digital`, `tabletop`, `parentSetCode`, and
`cardCount`. `data.meta.pagination` contains `limit` and `nextCursor`.

**Example user question.** “List recent tabletop sets matching ‘Final Fantasy’
and give me the code I can use in card searches.”

**Caveats and errors.** Results are ordered by release date descending, with
set code as a tie-breaker. Release and parent-set fields can be null. Setting
`tabletop_only` to `false` requests non-tabletop sets; it does not mean “all
sets.” Omit the filter only at the API level—the MCP tool always sends its
boolean default. Invalid cursors and out-of-range limits fail.

### `get_latest_set_opportunities`

**Purpose.** Return a transparent bounded ranking of cards in the newest
released tabletop expansion, or in a requested set.

**Use it when.** The user wants research candidates with explainable momentum,
stability, drawdown, risk, trend, and data-confidence signals.

**Inputs**

- `set_code` — optional string, trimmed, lowercased, 2–8 ASCII lowercase
  letters or digits. When omitted, the newest released non-digital tabletop
  expansion is selected.
- `minimum_confidence` — optional number from 0 through 1; default `0`. Current
  label thresholds map `low` to `0.34`, `medium` to `0.67`, and `high` to `1`.
- `limit` — optional integer, 1–25; default `10`.

**Meaningful output.** `data.data` contains:

- `set` metadata and the price-data `asOf` date;
- `opportunities`, each with `card`, `score.total`, component scores,
  `score.confidence`, `score.risk`, `score.trend`, `momentum7d`,
  `momentum30d`, `drawdownPercent`, `stabilityPercent`, optional `entryRange`,
  rationale arrays/text, and `latestPrice`;
- `methodology.summary`, component `weights`, and the definition of
  `entryRange`.

`latestPrice` explicitly carries `amount`, `currency: "EUR"`,
`finish: "nonfoil"`, `source: "mtgjson"`, and `observedAt`.

**Example user question.** “In FIN, show up to five medium-or-higher-confidence
research opportunities and explain the risk behind each score.”

**Caveats and errors.** This is a relative analytical rank, not a recommendation
or forecast. Confidence measures data coverage, not probability of profit.
The entry range is descriptive, not a target. Thin markets, reprints,
condition, language, finish, stale observations, and unavailable liquidity can
make a signal non-executable. An invalid code or confidence fails validation;
an unknown or ineligible set returns not found.

## Comprehensive Rules

### `search_rules`

**Purpose.** Search a pinned local lexical index of the official Comprehensive
Rules and glossary.

**Use it when.** The user needs the relevant official text, knows a rule number,
or wants to inspect citations before interpreting an interaction.

**Inputs**

- `query` — required string, trimmed, 2–300 characters.
- `limit` — optional integer, 1–10; default `5`.
- `max_excerpt_chars` — optional integer, 80–600; default `360`.
- `include_glossary` — optional boolean; default `true`.

**Meaningful output.** `results` contains deterministic lexical hits with
`score`, bounded `excerpt`, and `citation`. A citation includes optional
`ruleNumber`, optional `glossaryTerm`, `section`, positive PDF `page`, and
official `sourceUrl`. `source` includes rules `version`, `effectiveDate`,
`fetchedAt`, `sourceUrl`, `rulesPageUrl`, `sha256`,
`matchesPinnedOfficialSource`, `freshnessNotice`, and `attribution`.

**Example user question.** “Find rule 613 and the glossary entries relevant to
continuous effects.”

**Caveats and errors.** Search is deterministic lexical retrieval, not semantic
reasoning and not a ruling. Exact rule references are generally the strongest
queries. Check `matchesPinnedOfficialSource` and `freshnessNotice`, especially
after a new Magic release. A missing, oversized, timed-out, malformed, or
unpinned local index returns `RULES_INDEX_UNAVAILABLE`.

### `ask_rules`

**Purpose.** Retrieve official rules evidence for a natural-language rules
question and separate it from brief retrieval guidance.

**Use it when.** The user asks how an interaction works and needs the host to
explain it from official excerpts.

**Inputs**

- `question` — required string, trimmed, 5–500 characters.
- `limit` — optional integer, 1–10; default `5`.
- `max_excerpt_chars` — optional integer, 80–600; default `360`.
- `include_glossary` — optional boolean; default `true`.

**Meaningful output.** `question` echoes the request. `officialRules` uses the
same hit and citation shape as `search_rules`.
`explanatorySynthesis.authority` is always `non-authoritative`; its `text`
points to the retrieved rule/glossary authorities or says no match was found.
`source` carries the pinned-source metadata and checksum.

**Example user question.** “If I copy a spell with X in its mana cost, what
value does X have on the copy?”

**Caveats and errors.** Claude or another host may explain the interaction, but
must distinguish its synthesis from quoted official text and cite the returned
rules/pages. If no official excerpt is found, do not infer an answer from the
retrieval guidance. Tournament-specific disputes still require a judge. Index
failures return `RULES_INDEX_UNAVAILABLE`.

## Product & strategy

Product tools support these topic enums:

- `positioning`
- `users_and_alternatives`
- `differentiation_and_moat`
- `metrics_and_demand`
- `monetization`
- `provenance_and_trust`
- `regulatory_and_risk`
- `liquidity_and_signals`
- `incidents_and_corrections`
- `growth`
- `adjacent_tcgs`

They support these status enums:

- `shipped_fact` — evidenced by current public code, pages, contracts, or
  policies.
- `operating_principle` — a rule for operation or communication, not a measured
  outcome or guarantee.
- `hypothesis` — an unvalidated belief or experiment.
- `roadmap_option` — a possible direction, not a commitment.
- `unknown_not_measured` — no reliable public measurement; do not infer one.

### `search_product_knowledge`

**Purpose.** Deterministically search canonical Magic Brain product and business
statements.

**Use it when.** The user has a focused diligence query about positioning,
users, moat, metrics, monetization, provenance, risk, liquidity, incidents,
growth, or adjacent TCGs.

**Inputs**

- `query` — required string, trimmed, 2–500 characters.
- `topics` — optional array of the topic enums above, at most 11 items.
- `statuses` — optional array of the status enums above, at most 5 items.
- `limit` — optional integer, 1–12; default `8`.

**Meaningful output.** `query` echoes the search. `results` contains up to 12
facts with `id`, `topic`, `status`, `statement`, `keywords`, one or more
`citations` (`label`, `url`), and lexical `score`. `taxonomy` defines every
status; `canonicalDocument` links the product strategy and FAQ; and
`retrievalNotice` describes the required synthesis discipline.

**Example user question.** “What evidence supports Magic Brain's moat, and what
is still only a hypothesis?”

**Caveats and errors.** The score is retrieval relevance, not evidence quality,
confidence, or business performance. Retrieval is lexical and may return no
results for unmatched wording. Filters do not relax the 12-result bound. Do
not erase statuses, omit citations, or turn hypotheses and unknowns into facts.

### `get_product_context`

**Purpose.** Retrieve a broad evidence bundle for selected diligence topics.

**Use it when.** The user requests a structured review spanning one or more
known product topics rather than a single keyword-focused answer.

**Inputs**

- `topics` — required array of 1–6 topic enums.
- `statuses` — optional array of status enums, at most 5 items.
- `limit` — optional integer, 1–12; default `12`.

**Meaningful output.** `topics` echoes the selected topics. `results`,
`taxonomy`, `canonicalDocument`, and `retrievalNotice` have the same meanings
as in `search_product_knowledge`.

**Example user question.** “Build a diligence brief covering monetization,
growth, and regulatory risk, separating shipped facts from unknowns.”

**Caveats and errors.** The result is bounded across all selected topics, so a
low limit may not represent each topic equally. It is an evidence bundle, not
a generated report. The host must preserve statuses and state unsupported
metrics as unknown.

### `ask_product_question`

**Purpose.** Retrieve evidence and explicit answer instructions for a
natural-language question about Magic Brain.

**Use it when.** The user wants a direct product or business answer and the host
should synthesize a cited response with strict epistemic discipline.

**Inputs**

- `question` — required string, trimmed, 5–800 characters.
- `limit` — optional integer, 1–12; default `10`.

**Meaningful output.** `question` echoes the request. `evidence` contains the
same fact fields as search results. `answerInstructions` tells the host to cite
sources, retain statuses, state unknowns, describe Magic Brain as research
rather than execution, and preserve liquidity/provenance/freshness caveats.
`taxonomy`, `canonicalDocument`, and `retrievalNotice` provide supporting
definitions.

**Example user question.** “How does Magic Brain make money, and what evidence
exists about willingness to pay?”

**Caveats and errors.** This tool does not call another LLM and does not itself
produce the final answer. It expressly forbids invented AUM-equivalent,
conversion, retention, willingness-to-pay, market-size, user-behaviour,
incident/SLA, or competitive-superiority claims. Product citations are public
repository or website URLs; they do not expose private operational data.

## Errors, limits, and freshness

MCP input-schema failures are returned before a handler runs. Public-data
handler failures use a structured error with:

- `code`: `UPSTREAM_ERROR`, `UPSTREAM_TIMEOUT`, `INVALID_RESPONSE`,
  `RESPONSE_TOO_LARGE`, or `INTERNAL_ERROR`;
- `message`: a bounded actionable description;
- optional upstream `status`, `request_id`, and `retry_after`.

The public API currently applies a 60-second window of 30 requests per minute
for anonymous callers and 300 per minute for a valid server-side API key. The
hosted MCP connector does not accept a user's API key; its effective upstream
tier is deployment-controlled and may be shared. On HTTP 429, use
`retry_after` when present and retry with bounded backoff. Do not evade quotas
by rotating identities or endpoints.

Latest card and opportunity API responses are cached for 5 minutes. Card
history and set metadata are cached for 1 hour, with stale-while-revalidate
windows. `attribution.fetched_at` records when the connector fetched a response;
it is not the market observation date. Use each price's `observedAt` and
`source` for that.

The connector also rejects upstream bodies over its configured byte limit and
serialized tool results over its configured character limit. Narrow `limit`,
the ID list, or the date range when a response is too large. Local rules-index
availability errors and MCP protocol/host/origin errors are separate from
public API errors.

## Workflow examples

### Card investing research

1. Call `search_cards` to resolve exact printing IDs.
2. Call `get_latest_prices` for a same-source snapshot across those IDs.
3. Call `get_price_history` for the short list, preserving finish, source, and
   observation dates.
4. Optionally call `get_latest_set_opportunities` for transparent comparative
   signals.
5. Synthesize the evidence with liquidity, staleness, reprint, condition,
   language, finish, and non-financial-advice caveats.

### Rules question

1. Call `ask_rules` with the complete interaction.
2. If a rule number or term needs more context, call `search_rules` for that
   exact reference with glossary results enabled.
3. Explain from `officialRules`, cite rule numbers and official source pages,
   and label the explanation non-authoritative.

### Product diligence

1. Call `ask_product_question` for the main question.
2. Call `get_product_context` for broad topics that are missing or
   underrepresented.
3. Optionally use `search_product_knowledge` with status filters to isolate
   unknowns, hypotheses, or shipped facts.
4. Compose a cited answer that keeps statuses separate and says
   “unknown/not measured” wherever the evidence does.
