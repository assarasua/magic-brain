# Magic Brain MCP server

An OAuth-protected remote MCP server for Magic Brain's public data, pinned
Comprehensive Rules, canonical product knowledge, and account-scoped portfolio
and watchlist workflows. It exposes no payment or trading tools.

## Install the live connector

Use the hosted Streamable HTTP endpoint:

```text
https://magic-brain-mcp.assarasua.workers.dev/mcp
```

Connect with an existing Magic Brain Google account through the automatic OAuth
flow. Never paste a Magic Brain API key into an MCP client.
See the canonical [MCP installation guide](../../docs/mcp-installation.md) for
current Claude, Cursor, VS Code/GitHub Copilot, ChatGPT, and OpenAI Responses
API instructions, requirements, and troubleshooting.

For exact inputs, outputs, limits, examples, evidence rules, and failure modes
for every registered tool, use the canonical
[MCP tool reference](../../docs/mcp-tools.md).

The hosted URL is separate from local development and self-hosting. The steps
below run your own server and do not install the live connector.

## Tools

The list below is a summary. The
[canonical MCP tool reference](../../docs/mcp-tools.md) documents all 17 tools
without duplicating their schemas here.

- `search_cards` — bounded catalogue search with set/card filters
- `get_card` — one public card record
- `get_latest_prices` — latest public prices for at most 100 card IDs
- `get_price_history` — at most 366 days for one card
- `list_sets` — bounded, cursor-paginated set metadata
- `get_latest_set_opportunities` — at most 25 latest-set research signals
- `search_rules` — bounded local search of the pinned Comprehensive Rules index
- `ask_rules` — cited rules retrieval with non-authoritative synthesis separated
- `search_product_knowledge` — deterministic lexical search over canonical,
  status-labelled product and business facts
- `get_product_context` — bounded evidence bundle for selected diligence topics
- `ask_product_question` — cited evidence and answer constraints for host-model
  synthesis; it does not call another LLM
- `get_portfolio` / `get_watchlist` — view data owned by the connected account
- `add_to_portfolio` / `add_to_watchlist` — add a confirmed card or holding
- `remove_from_portfolio` / `remove_from_watchlist` — remove an owned item after
  explicit user confirmation

Every tool has a title and strict input and output schemas. Research tools are
read-only; account tools declare write and destructive behavior accurately.
Public API tools use
`openWorldHint: true`; local rules and product-knowledge tools use
`openWorldHint: false`.
Results include Magic Brain attribution, the queried public URL, fetch time,
and any upstream request ID. Price output retains the source, as-of time,
currency, and finish fields returned by the public API.

Product tools return at most 12 canonical statements. Every statement is tagged
as `shipped_fact`, `operating_principle`, `hypothesis`, `roadmap_option`, or
`unknown_not_measured` and includes direct citations. The knowledge base
explicitly forbids invented AUM-equivalent, conversion, retention,
willingness-to-pay, market-size, user-behavior, incident/SLA, and competitive
superiority claims. See the canonical
[product strategy and FAQ](../../docs/product-strategy-faq.md).

## Expected public API contract

`MAGIC_BRAIN_API_BASE_URL` includes the version prefix, normally
`https://magicbrain.es/api/v1/`. Relative calls are:

| Tool | HTTP request |
| --- | --- |
| `search_cards` | `GET cards` |
| `get_card` | `GET cards/{card_id}` |
| `get_latest_prices` | `POST prices/latest` (read-only bulk query) |
| `get_price_history` | `GET cards/{card_id}/prices` |
| `list_sets` | `GET sets` |
| `get_latest_set_opportunities` | `GET latest-set/opportunities` |
| `get_portfolio` | `GET portfolio` with OAuth |
| `add_to_portfolio` | `POST portfolio` with `portfolio:write` |
| `remove_from_portfolio` | `DELETE portfolio/{holding_id}` with `portfolio:write` |
| `get_watchlist` | `GET watchlist` with OAuth |
| `add_to_watchlist` | `POST watchlist` with `watchlist:write` |
| `remove_from_watchlist` | `DELETE watchlist?cardId=...` with `watchlist:write` |

These paths are contract-tested against the versioned public surface. The
connector never falls back to private application routes.

The rules tools make no query-time network calls. Build their ignored local
index reproducibly with `npm run rules:build`; deployment builds should use
`npm run build:deployment`. See `docs/comprehensive-rules.md` for source
pinning, rights, validation, and update procedures.

## Run locally

Requires Node.js 22 or newer.

```bash
cp .env.example .env
npm install
npm run build
node --env-file=.env dist/index.js
```

Endpoints:

- `POST http://127.0.0.1:8788/mcp` — stateless Streamable HTTP, with
  compatibility for 2025-era Streamable HTTP clients
- `GET http://127.0.0.1:8788/healthz` — process/configuration health only; it
  does not call the upstream API or reveal credentials

Set `MCP_ALLOWED_HOSTS` to the externally visible hostname before remote use.
Requests with an `Origin` header are denied unless the full origin is present
in `MCP_ALLOWED_ORIGINS`. Put TLS and production rate limiting at the reverse
proxy or platform edge.

## Configuration and safety

See `.env.example`. `MAGIC_BRAIN_API_KEY` is optional and is used only as a
server-to-server bearer token for the public API. It is never accepted from MCP
tool input, included in source URLs, logged, or returned.

Safeguards include:

- HTTPS-only upstreams outside localhost
- 0.5–30 second configurable upstream timeout
- bounded upstream response bytes and MCP result characters
- bounded lists, date ranges, cursors, strings, and enum values
- actionable sanitized errors with request ID and retry guidance
- one fresh MCP server per request for stateless horizontal scaling
- 1 MiB MCP request-body cap and conservative HTTP timeouts
- Host and Origin allowlists

This server provides market observations and research indicators, not
financial advice.

## Test

```bash
npm run check
npm test
npm run build
npm run metadata:validate
npm audit
```

Tests use mocked public API responses and an in-memory MCP client/server pair;
they do not require database, account, payment, or network access.

## Privacy and support

The connector accepts bounded public-data and rules questions. It does not
request or expose account, portfolio, watchlist, authentication, payment, or
Google data. A deployment may process IP addresses and request metadata for
security, abuse prevention, and operational logs. See the public
[privacy notice](https://github.com/assarasua/magic-brain/blob/main/PRIVACY.md),
[support tracker](https://github.com/assarasua/magic-brain/issues), and
[security reporting instructions](https://github.com/assarasua/magic-brain/security/advisories/new).

## Directory artifacts

- `server.json` follows the official MCP Registry 2025-12-11 schema and uses
  the recommended `streamable-http` remote type.
- `directory/icon.svg` is the square connector icon source.
- `SUBMISSION_CHECKLIST.md` records deployment, validation, Claude testing,
  and the manual Anthropic submission step.

`server.json` must always identify the verified production HTTPS endpoint.

## Official references

- [Anthropic: Build custom connectors](https://claude.com/docs/connectors/building)
- [Anthropic: Submit to the Connectors Directory](https://claude.com/docs/connectors/building/submission)
- [Anthropic: Pre-submission checklist](https://claude.com/docs/connectors/building/review-criteria)
- [Anthropic: Test a connector](https://claude.com/docs/connectors/building/testing)
- [Anthropic API: MCP connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
- [MCP: Publish remote servers](https://modelcontextprotocol.io/registry/remote-servers)
- [MCP: Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [MCP: Tools and structured output](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [MCP TypeScript SDK: Serve over HTTP](https://ts.sdk.modelcontextprotocol.io/v2/serving/http)
