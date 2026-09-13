# Magic Brain MCP server

An isolated, read-only remote MCP server for Magic Brain's versioned public
Cards/Prices/Sets API. It exposes no resources, prompts, write tools, user
accounts, portfolios, watchlists, authentication records, or Stripe data.

## Install the live connector

Use the hosted Streamable HTTP endpoint:

```text
https://magic-brain-mcp.assarasua.workers.dev/mcp
```

No Magic Brain account, OAuth sign-in, or user API key is currently required.
See the canonical [MCP installation guide](../../docs/mcp-installation.md) for
current Claude, Cursor, VS Code/GitHub Copilot, ChatGPT, and OpenAI Responses
API instructions, requirements, and troubleshooting.

The hosted URL is separate from local development and self-hosting. The steps
below run your own server and do not install the live connector.

## Tools

- `search_cards` — bounded catalogue search with set/card filters
- `get_card` — one public card record
- `get_latest_prices` — latest public prices for at most 100 card IDs
- `get_price_history` — at most 366 days for one card
- `list_sets` — bounded, cursor-paginated set metadata
- `get_latest_set_opportunities` — at most 25 latest-set research signals
- `search_rules` — bounded local search of the pinned Comprehensive Rules index
- `ask_rules` — cited rules retrieval with non-authoritative synthesis separated

Every tool has a title, strict input and output schemas, `readOnlyHint: true`,
`destructiveHint: false`, and `idempotentHint: true`. Public API tools use
`openWorldHint: true`; local rules-index tools use `openWorldHint: false`.
Results include Magic Brain attribution, the queried public URL, fetch time,
and any upstream request ID. Price output retains the source, as-of time,
currency, and finish fields returned by the public API.

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
they do not require database, account, Stripe, or network access.

## Privacy and support

The connector accepts bounded public-data and rules questions. It does not
request or expose account, portfolio, watchlist, authentication, Stripe, or
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
