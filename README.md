# Magic Brain

An open-source, investor-focused dashboard for Magic: The Gathering cards,
backed by PostgreSQL.

The software is licensed under [AGPL-3.0-only](LICENSE). Card records, prices,
artwork, names, symbols, and provider data are third-party material and are not
licensed by this repository; read [NOTICE](NOTICE.md) before importing or
redistributing data.

## Product areas

- `/` — portfolio overview and live market signals
- `/inventory` — complete paginated catalogue with advanced filters
- `/market` — gainers and losers over 1, 7, or 30 days
- `/reserved` — dedicated Reserved List market
- `/portfolio` — persistent holdings, cost basis, P&L, allocation, and history
- `/watchlist` — persistent tracking and target prices
- `/brain` — preference-driven portfolio generation using historical prices
- `/predict` — set-level scenario analysis against inflation, S&P 500, and
  extreme risk/reward targets
- `/donate` — optional PayPal.Me P2P contributions

English and Spanish are available from the header language control.

## Magic Brain MCP connector

Connect Claude, Cursor, VS Code with GitHub Copilot, ChatGPT, or the OpenAI
Responses API to the live read-only Magic Brain MCP endpoint. No Magic Brain
user API key is currently required.

Follow the [MCP installation guide](docs/mcp-installation.md) for current
product requirements, exact configuration, and troubleshooting. Local
self-hosting is documented separately in the
[MCP package guide](integrations/magic-brain-mcp/PACKAGE.md#run-locally).
The canonical [MCP tool reference](docs/mcp-tools.md) documents exact inputs,
outputs, limits, examples, evidence handling, and errors for all 11 tools.
The connector can also retrieve source-cited, epistemically labelled product
and business diligence evidence. Its canonical public source is the
[product strategy and FAQ](docs/product-strategy-faq.md).

## Run locally

```bash
npm ci
cp .env.example .env.local
psql postgresql://postgres:postgres@localhost:5432/magic_brain \
  -f db/000_base_data_schema.sql
npm run db:migrate
npm run db:sync-reserved
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Google login

Create a Google OAuth web application and configure:

```env
AUTH_GOOGLE_ID=your_google_client_id
AUTH_GOOGLE_SECRET=your_google_client_secret
AUTH_SECRET=a_random_32_byte_secret
```

Use this authorized redirect URI locally:

```text
http://localhost:3000/api/auth/callback/google
```

For production on `magicbrain.es`, add these exact values to the same Google
OAuth web client:

```text
Authorized JavaScript origin:
https://magicbrain.es

Authorized redirect URI:
https://magicbrain.es/api/auth/callback/google
```

Set `AUTH_URL=https://magicbrain.es` and
`NEXT_PUBLIC_APP_URL=https://magicbrain.es` in the production environment.
Use `.env.production.example` as the deployment checklist and never commit real
OAuth secrets.

Google login links the anonymous account instead of replacing it, preserving
portfolio holdings, watchlist items, and Brain portfolios.

## Optional contributions

Magic Brain's Brain Pro tools are free for now. The support page offers an
optional one-time contribution through
[paypal.me/assarasua](https://paypal.me/assarasua); it does not require payment
credentials, create a subscription, or record the payment in Magic Brain.
Contributors must confirm the recipient and amount in PayPal before sending.

## Production data connection

The base migration creates the `cards` and `prices` tables used by the app.
Product migrations add `app_users`, `app_portfolio_items`,
`app_watchlist_items`, `app_brain_portfolios`,
`app_brain_portfolio_items`, and `app_reserved_cards`.

Anonymous accounts use random 256-bit session tokens stored as HttpOnly cookies;
only token hashes are persisted. A production identity provider can later link
these records to verified user accounts.

Never commit `.env.local` or put service credentials in browser code.

## Contributor data setup

Use Node.js 22 or newer, npm 10, and PostgreSQL 15 or newer. The migrations
create empty base `cards` and `prices` tables plus product-owned tables. They do
not download or grant rights to any third-party dataset. After setting
`DATABASE_URL`, apply `db/000_base_data_schema.sql`, run `npm run db:migrate`,
then follow the
[data import guide](docs/data-import.md).

`AUTH_SECRET` is mandatory in production and should also be set locally for
stable sessions. Generate it with `openssl rand -base64 32`. Google OAuth is
optional for local development.

## Cloudflare deployment

The checked-in `wrangler.jsonc` preserves the project's `magicbrain.es` route
and Hyperdrive ID. These are public deployment coordinates, not credentials.
Forks must replace `name`, `routes`, and `hyperdrive[].id` with their own
Cloudflare resources. Keep database, Auth.js, and OAuth secrets in the
deployment provider's secret manager. Use `.env.production.example` only as a
variable checklist.

`npm run preview` provides a local Cloudflare-compatible preview.
`npm run deploy` changes external infrastructure and is intended only for
authorized maintainers.

## Contributing and policies

Before contributing, read [CONTRIBUTING.md](CONTRIBUTING.md), the
[Code of Conduct](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md). Run:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Privacy and service templates are in [PRIVACY.md](PRIVACY.md) and
[TERMS.md](TERMS.md). Each deployment operator must customize them for its
identity, jurisdiction, subprocessors, retention, and actual data practices.

## Creator

Magic Brain was created by
[Asier Sarasua at BizkardoLab](https://bizkardolab.com).
