# Contributing to Magic Brain

Thank you for helping improve Magic Brain. By participating, you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Before opening a change

- Search existing issues and open one for substantial features or schema work.
- Use a supported Node.js version (`>=22`) and install with `npm ci`.
- Copy `.env.example` to `.env.local`; use only disposable local/sandbox
  credentials and a non-production database.
- Run migrations against an empty database and import only data you have the
  right to use. See [docs/data-import.md](docs/data-import.md).
- Do not commit card datasets, price exports, user data, API keys, `.env`
  files, database dumps, or provider credentials.

## Pull requests

Keep changes focused and explain the user impact, tests, schema changes, and
data/licensing implications. Update documentation with behavior or
configuration changes. Before requesting review, run the checks relevant to
your change:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Use sandbox services for OAuth and payment work. Never run deployment commands
from a contribution branch. Security vulnerabilities must follow
[SECURITY.md](SECURITY.md), not a public issue.

## Licensing

Contributions are accepted under the repository's AGPL-3.0-only license. You
represent that you have the right to submit your contribution and that it does
not include incompatible code, confidential material, or unlicensed data.
Retain applicable copyright and attribution notices.
