<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Repository guide

## Architecture

- `src/app/`, `src/components/`, and `src/lib/`: Next.js 16 App Router product,
  route handlers, shared UI, and domain logic. Tests live in `test/` and beside
  selected library modules.
- `db/` and `scripts/migrate.mjs`: ordered PostgreSQL schema migrations and the
  checksum-enforcing migration runner.
- `src/app/api/v1/` and `src/lib/public-api/`: versioned public HTTP API and
  OpenAPI contract.
- `integrations/magic-brain-mcp/`: public, read-only MCP server.
- `integrations/magic-brain-dev-mcp/`: contributor-only development MCP.
- `tools/magic-brain-cli/`: CLI client for public and owner-scoped API flows.
- `scripts/*ml*.mjs`, `src/lib/ml-*`, `db/014_*` through `db/018_*`, and
  `docs/ml-*.md`: point-in-time ML data, evaluation, batch serving, and product
  feedback pipeline.

## Setup and authoritative commands

- Use Node.js 22+, npm 10, and `npm ci`. Install package dependencies with
  `npm ci --prefix <package>` for each changed package.
- Run the app with `npm run dev`; use `.env.example` as a local checklist.
- Root checks: `npm run lint`, `npm run typecheck`, `npm test`, and
  `npm run build`.
- Package checks: `npm run check:packages`, `npm run test:packages`, and
  `npm run build:packages`. For public MCP metadata changes, also run
  `npm run rules:build --prefix integrations/magic-brain-mcp` and
  `npm run metadata:validate --prefix integrations/magic-brain-mcp`.
- Database and ML commands can connect to external systems. Do not run
  `db:migrate`, `db:sync-*`, `ml:export-real`, `ml:register`, `ml:score-daily`,
  or `ml:produce` without an explicitly approved non-production target.

## Change workflow

- Start each task in its own worktree and branch from the latest `origin/main`.
  Keep one focused concern per branch and do not edit another worktree.
- Inspect existing changes before editing. Preserve user work. Never use
  destructive Git commands (`reset --hard`, forced checkout/clean, or force
  push) without explicit approval.
- Stage named files only (`git add path/to/file`), never broad staging such as
  `git add .`; review the staged diff before committing.
- Keep PRs focused. Do not deploy, publish packages, rotate credentials, or
  mutate external infrastructure as part of a PR.

## Implementation rules

- Before changing Next.js code, read the relevant installed guide under
  `node_modules/next/dist/docs/`; do not rely on remembered framework behavior.
- Keep migrations append-only and numerically ordered in both `db/` and
  `scripts/migrate.mjs`. Never rewrite an applied migration: checksums are a
  safety boundary. Make SQL transactional and rerunnable where practical, and
  test order, ownership, constraints, and idempotency.
- Authentication identity must come from trusted server session/OAuth/API-key
  context, never request-supplied owner IDs. Keep browser session auth, OAuth
  scopes, and public API keys as separate boundaries; default to least
  privilege and preserve expiry, rotation, revocation, and rate limits.
- Keep secrets in local/provider secret stores. Commit only example names and
  placeholders. Never send secrets to client bundles, responses, URLs,
  telemetry, fixtures, or logs; do not log tokens, cookies, authorization
  codes, API keys, connection strings, or personal data.
- ML output is decision support, not guaranteed performance. Preserve
  point-in-time joins, walk-forward evaluation, source/provenance labels,
  reproducible artifact versions, uncertainty language, and documented
  deterministic fallbacks. Never train or evaluate on future information.
- User-facing work must preserve English and Spanish behavior, semantic HTML,
  keyboard and screen-reader access, visible focus, reduced-motion support,
  and usable narrow/mobile layouts.
- Keep public API, MCP, CLI, payment, identity, card-data, and deployment
  integrations backward compatible unless the change is explicitly versioned.
  Respect provider licenses and rate limits; use mocks/fixtures in tests and
  avoid live external calls.

## Required validation

- Always run root lint, typecheck, tests, and production build.
- App/UI/routes: add focused route or behavior tests; verify localization,
  accessibility, mobile layout, metadata, caching, and authorization as
  applicable.
- Database: test migration order/checksums and SQL invariants against a
  disposable database when behavior cannot be proven statically.
- Public API/auth: test OpenAPI parity, status/error shapes, scopes, ownership,
  rate limits, and secret-safe caching/logging.
- Public MCP, dev MCP, or CLI: run that package's check, tests, and build in
  addition to root checks.
- ML: run the affected contract/evaluation/serving tests and check leakage,
  temporal cutoffs, fallback behavior, and provenance.
- Merge only after review and all required CI checks, including secret
  scanning/gitleaks, pass. Never bypass branch protection or merge a red PR.
