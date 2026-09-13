# API, CLI, and MCP platform

The canonical machine contract is `GET /api/v1/openapi.json`.

## New v1 capabilities

- `GET /ml/opportunities` — `profile:read`; verified promoted-batch ranking or
  an explicitly labelled deterministic fallback.
- `GET /portfolio` — `portfolio:read profile:read`; owned holdings, unrealized
  P&L, contributors, concentration, history, intelligence, and 1Y/3Y/5Y
  forecast points.
- `GET /predict/recommendation` — `profile:read`; preference-derived Predict
  defaults.
- `GET /opportunity-graph` — anonymous; bounded search/focus graph with
  neighbours, similarity reasons, methodology, and data date.
- `GET /portfolio/lists` and `GET /portfolio/lists/{id}` — owner-scoped list
  metadata and per-list intelligence.
- Scoped list create/rename/reorder/delete, bulk move/copy/delete, and share
  create/revoke APIs require an `Idempotency-Key` header and `confirm: true`.
- `GET|POST|PATCH|DELETE /alerts` — owned watchlist/alert reads and explicitly
  confirmed idempotent alert management under `alerts:manage`.
- `GET /shared/portfolio/{token}` — anonymous, rate-limited 24-hour share data
  with current public values only.
- Existing `/predict/set`, `/predict/portfolio`, `/news`, `/news/latest`, and
  `/news/{date}` remain backward compatible.

Public share responses never contain owner identity, email, purchase price, or
cost basis.

## Authorization

Public reads remain anonymous. API keys always have `data:read`; personal
scopes are explicit. Interactive clients use OAuth authorization code with S256
PKCE, exact registered redirects, RFC 8707 resource indicators, 5-minute
single-use codes, 15-minute one-time consent requests, 15-minute access tokens,
and rotating 30-day refresh tokens. Tokens, codes, and consent request handles
are stored only as SHA-256 hashes. Revocation is immediate.

OAuth scopes are `public:read`, `portfolio:read`, `portfolio:write`,
`lists:read`, `lists:write`, `alerts:manage`, `shares:manage`, and
`profile:read`. Write scopes do not by themselves authorize an MCP mutation:
future mutating tools must additionally require `confirm: true` and an
idempotency key.

The remote public MCP is a resource server. It introspects audience-bound
tokens and sends the API a separate signed delegation lasting at most 60
seconds; it never forwards the inbound OAuth token. Deployment must configure
matching introspection and delegation secrets on the web application and MCP
worker. No production secrets are checked in.

Remaining deployment configuration (not performed by this change):

1. Set `MAGIC_BRAIN_MCP_RESOURCE_URL`, `MAGIC_BRAIN_API_RESOURCE_URL`,
   `MAGIC_BRAIN_MCP_INTROSPECTION_CLIENT_ID`,
   `MAGIC_BRAIN_MCP_INTROSPECTION_SECRET`, and
   `MAGIC_BRAIN_MCP_DELEGATION_SECRET` on the web deployment.
2. Add the same introspection client ID/secret and delegation secret as
   encrypted bindings on the `magic-brain-mcp` Worker.
3. Apply migrations `021`, `022`, and `023` through the existing migration runner
   before deploying either component.
4. Verify both well-known metadata URLs, anonymous tool calls, and one
   consented personal read. No external Google OAuth client registration is
   needed beyond the existing Magic Brain web client.

## Developer tooling

See [`tools/magic-brain-cli/README.md`](../tools/magic-brain-cli/README.md) for
CLI installation, OAuth login, commands, output modes, and exit codes.

See
[`integrations/magic-brain-dev-mcp/README.md`](../integrations/magic-brain-dev-mcp/README.md)
for the separate localhost-first development MCP. It exposes only allowlisted
read calls and bounded diagnostics; it has no arbitrary shell, filesystem,
database, environment, URL, or production mutation capability.
