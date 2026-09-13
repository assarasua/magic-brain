# Contributing to Magic Brain

Thank you for helping improve Magic Brain. By participating, you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Choose how to contribute

- [Open a bug report](https://github.com/assarasua/magic-brain/issues/new?template=bug_report.yml)
  for a reproducible product or data defect.
- [Request a feature](https://github.com/assarasua/magic-brain/issues/new?template=feature_request.yml)
  when proposing new behavior.
- Look for [`good first issue`](https://github.com/assarasua/magic-brain/labels/good%20first%20issue)
  or [`help wanted`](https://github.com/assarasua/magic-brain/labels/help%20wanted)
  if you want a place to start.
- Use a
  [private security advisory](https://github.com/assarasua/magic-brain/security/advisories/new)
  for vulnerabilities. Never disclose them in a public issue.

## Before opening a change

- Search existing issues and open one for substantial features or schema work.
- Use a supported Node.js version (`>=22`) and install with `npm ci`.
- Copy `.env.example` to `.env.local`; use only disposable local/sandbox
  credentials and a non-production database.
- Run migrations against an empty database and import only data you have the
  right to use. See [docs/data-import.md](docs/data-import.md).
- Do not commit card datasets, price exports, user data, API keys, `.env`
  files, database dumps, or provider credentials.

## Development workflow

1. Fork `assarasua/magic-brain` on GitHub.
2. Clone your fork and create a focused branch:

   ```bash
   git clone https://github.com/YOUR_USERNAME/magic-brain.git
   cd magic-brain
   git checkout -b fix/short-description
   npm ci
   cp .env.example .env.local
   ```

3. Make the smallest complete change and add or update tests.
4. Run the checks below.
5. Push the branch to your fork:

   ```bash
   git push -u origin fix/short-description
   ```

6. Open a Pull Request against `assarasua/magic-brain:main`, complete the PR
   template, and link the related issue with `Closes #123` when applicable.
7. Address review and CI feedback with new commits. Do not force-push after
   review has started unless a maintainer asks.

## Pull requests

Keep changes focused and explain the user impact, tests, schema changes, and
data/licensing implications. Update documentation with behavior or
configuration changes. Before requesting review, run the checks relevant to
your change:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm ci --prefix integrations/magic-brain-mcp
npm run check --prefix integrations/magic-brain-mcp
npm test --prefix integrations/magic-brain-mcp
```

Use sandbox services for OAuth and payment work. Never run deployment commands
from a contribution branch. Security vulnerabilities must follow
[SECURITY.md](SECURITY.md), not a public issue.

Pull Requests require passing CI, one approving review, and all review
conversations resolved before merge. Maintainers may request changes or close
work that is out of scope, duplicates an existing proposal, or introduces
unsupported data/licensing obligations.

## Licensing

Contributions are accepted under the repository's AGPL-3.0-only license. You
represent that you have the right to submit your contribution and that it does
not include incompatible code, confidential material, or unlicensed data.
Retain applicable copyright and attribution notices.
