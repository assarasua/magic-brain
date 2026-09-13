# Comprehensive Rules knowledge module

This isolated module builds a local BM25-style index from the official
[Magic Comprehensive Rules PDF][pdf]. The PDF, extracted pages, and generated
index are deliberately ignored by Git. Only parser/indexer code and tiny test
fixtures belong in the repository.

Pinned source:

- Version/effective date: `2026-08-07` / August 7, 2026
- PDF pages: `312`
- Bytes: `2,524,708`
- SHA-256: `9e2268a0ed58f229c5b974a3ae7986c5f91a5a052c4af1a9e672906a427c044c`
- Canonical discovery page: [Magic rules][rules-page]

## Build or update the local index

Run from `integrations/magic-brain-mcp`:

```sh
python3 -m venv .rules-venv
.rules-venv/bin/python -m pip install --require-hashes \
  -r scripts/rules/requirements.txt
node scripts/rules/fetch.mjs
.rules-venv/bin/python scripts/rules/extract.py
npx tsx scripts/rules/build-index.ts
```

The fetcher has a 30-second timeout, a 5 MiB limit, HTTPS/host/content-type/PDF
signature checks, and exact byte/checksum validation. Extraction has a
90-second timeout and validates checksum, page count, title, effective date,
and glossary presence. The generated `rules-data/rules-index.json` retains
download time, ETag/Last-Modified when supplied, source URL, effective date,
extractor version, and checksum.

To update after Wizards publishes new rules:

1. Follow the PDF link from the canonical rules page; do not guess a URL.
2. Review the new document and Wizards policies.
3. Update the pinned URL, date, byte length, page count, and SHA-256 together in
   `src/rules/source.ts`, `scripts/rules/fetch.mjs`, and
   `scripts/rules/extract.py`.
4. Update parser tests if the official layout changed.
5. Re-run the complete workflow and tests. Never commit `rules-data` contents.

## Module and tool contracts

- `RulesKnowledgeBase.search`: deterministic local lexical search with
  optional glossary filtering, 1–10 results, and 80–600 character excerpts.
- `RulesKnowledgeBase.ask`: retrieval for a question. `officialRules` contains
  quoted source excerpts; `explanatorySynthesis.authority` is always
  `non-authoritative`.
- `registerRulesTools`: registers `search_rules` and `ask_rules`, each with a
  title and read-only, non-destructive, idempotent, closed-world annotations.
- Every hit cites rule number or glossary term, section, PDF page, and official
  source URL. Results also include checksum, version, fetch time, freshness
  notice, and attribution.

The module performs no network calls at query time and loads only a configured,
size-bounded local JSON file. Inputs, result counts, and excerpts are bounded.
It retries loading after a failure and reports missing/corrupt index errors.

## Server and deployment wiring

The shared server registers `ask_rules` and `search_rules`. Node deployments
load `MAGIC_BRAIN_RULES_INDEX_PATH` or the default ignored local index. The
Cloudflare Worker deployment embeds the generated index at build time without
committing the copyrighted corpus.

Use `npm run rules:build` to reproduce the pinned index, `npm run
build:deployment` for a Node deployment artifact, or `npm run deploy` for the
standalone Cloudflare Worker. The deploy script regenerates and verifies the
index before bundling it.

## Rights, attribution, and directory safety

Magic: The Gathering Comprehensive Rules are © Wizards of the Coast. Magic:
The Gathering and Wizards of the Coast are trademarks of Wizards. This
unofficial module is not endorsed by Wizards.

Wizards’ [Fan Content Policy][fan-policy] says fan content must be free and
unofficial and excludes verbatim copying/reposting of Wizards IP. Its
[Terms][terms] reserve Wizards’ content rights and generally limit use to
personal, non-commercial use unless separately permitted. For that reason this
workflow does not redistribute the PDF or corpus and exposes only bounded,
cited excerpts. Public or commercial deployment needs an independent rights
review and, where required, permission from Wizards. This is not legal advice.

Current [Claude connector submission guidance][claude-submission] requires
accurate documentation, security maintenance, tool titles and applicable
safety annotations; authenticated remote services must use OAuth. Local
connectors also require a README Privacy Policy section and HTTPS privacy-policy
URLs in an MCPB manifest. These rules tools need no credentials and are marked
read-only/non-destructive. The integration metadata now links the public
endpoint, support tracker, and privacy notice.

The official [MCP Registry][mcp-registry] is currently a preview metadata
registry for publicly accessible or publicly installable servers. It verifies
publisher namespaces but delegates code scanning. Registry publication still
requires authenticating the GitHub publisher namespace described by the
[registry quickstart][mcp-quickstart]. It is separate from deployment and must
not weaken local rules-index protections.

[pdf]: https://media.wizards.com/2026/downloads/MagicCompRules%2020260807.pdf
[rules-page]: https://magic.wizards.com/en/rules
[fan-policy]: https://company.wizards.com/en/legal/fancontentpolicy
[terms]: https://company.wizards.com/en/legal/terms
[claude-submission]: https://claude.com/docs/connectors/building/submission
[mcp-registry]: https://modelcontextprotocol.io/registry/about
[mcp-quickstart]: https://modelcontextprotocol.io/registry/quickstart
