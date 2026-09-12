# Magic Brain

An investor-focused dashboard for Magic: The Gathering cards, backed by the
Railway PostgreSQL market dataset.

## Product areas

- `/` — portfolio overview and live market signals
- `/inventory` — complete paginated catalogue with advanced filters
- `/market` — gainers and losers over 1, 7, or 30 days
- `/reserved` — dedicated Reserved List market
- `/portfolio` — persistent holdings, cost basis, P&L, allocation, and history
- `/watchlist` — persistent tracking and target prices
- `/brain` — preference-driven portfolio generation using historical prices

English and Spanish are available from the header language control.

## Run locally

```bash
npm install
cp .env.example .env.local
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
OAuth or Stripe secrets.

Google login links the anonymous account instead of replacing it, preserving
portfolio holdings, watchlist items, Brain portfolios, and Stripe status.

## Stripe sandbox setup

1. Create a restricted sandbox key with the minimum Checkout, Customer, Price,
   and Subscription permissions.
2. Create a `Brain Pro` product with a recurring EUR 5/month Price.
3. Add the restricted key and Price ID to `.env.local`.
4. Forward sandbox events locally:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

5. Add the generated `whsec_...` value to `.env.local`.

The webhook verifies Stripe signatures and persists subscription state. Checkout
uses a Stripe-hosted subscription flow and the Customer Portal endpoint supports
self-service billing.

## Production data connection

The app expects `cards` and `prices` tables matching the connected Railway
database. Product migrations add `app_users`, `app_portfolio_items`,
`app_watchlist_items`, `app_brain_portfolios`,
`app_brain_portfolio_items`, and `app_reserved_cards`.

Anonymous accounts use random 256-bit session tokens stored as HttpOnly cookies;
only token hashes are persisted. A production identity provider can later link
these records to verified user accounts.

Never commit `.env.local` or put a Stripe secret/restricted key in browser code.
