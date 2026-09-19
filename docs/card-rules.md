# Card effects and in-game rules

Magic Brain combines three kinds of evidence for an MCP client's rules
answers: Oracle card text, dated card rulings, and numbered Comprehensive
Rules. The client assistant explains how that evidence applies to the game
situation supplied by the player.

## Data model

`db/035_card_rules.sql` adds four tables without changing the collectible
printing or price tables:

| Table | Contents |
| --- | --- |
| `app_rules_datasets` | Source URLs, provider dates, retrieval dates, checksums, counts, and active snapshot |
| `app_oracle_cards` | One record per Oracle identity, full text, keywords, costs, and individual card faces |
| `app_card_effects` | Ordered, verbatim Oracle text paragraphs linked to their card and face |
| `app_card_rulings` | Dated rulings, retaining `wotc` or `scryfall` authorship |

An effect record is a searchable text paragraph, not an executable effect.
One paragraph can contain several instructions; several paragraphs can define
one ability. The full card text and face boundaries remain available so the
assistant can interpret modal spells, Adventures, Sagas, replacement effects,
and double-faced cards in context. Empty mana costs are preserved separately
from `{0}` and unavailable data.

Oracle identity joins existing printings through `cards.oracle_id`. Exact
card or face names can be resolved without first looking up a printing.
Ambiguous names require the returned Oracle ID; the service never silently
chooses a similarly named card.

## Import and refresh

Use the project's Node.js version and configure `DATABASE_URL`. Apply the
project's migrations to the intended database, then run:

```sh
npm run db:sync-card-rules -- --dry-run
npm run db:sync-card-rules
```

The first command downloads and validates without writing to the database.
The second imports a complete snapshot and activates it after every card,
paragraph, and ruling has been written successfully. A failed transaction
leaves the previous snapshot active. Prior snapshots are retained so effect
search cursors remain stable through an update. They can be removed by an
operator once their cursors are no longer needed.

The importer discovers the current `oracle_cards` and `rulings` exports from
[Scryfall's bulk API](https://scryfall.com/docs/api/bulk-data). It supports the
current gzipped JSON Lines archives and records the checksum of the downloaded
bytes. Source metadata distinguishes provider publication from retrieval and
database import times. Bulk archives are bounded during download and
decompression. Generated data under `data/card-rules/` is ignored by Git.

Scryfall recommends refreshing gameplay data weekly or after set releases.
Run the import again when an update is needed; this feature does not install
a scheduled task. Comprehensive Rules updates use the separate
[pinned rules workflow](../integrations/magic-brain-mcp/docs/comprehensive-rules.md).
Review a new rules document's effective date before activating it.

## MCP workflow

- `search_card_effects` finds cards by ability text and returns their Oracle
  IDs, exact paragraphs, face positions, and source links.
- `get_card_rules` resolves an exact name or identifier and returns full
  card text, individual faces, ordered paragraphs, and up to 50 dated rulings.
  It explicitly reports when additional rulings were omitted.
- `explain_card_interaction` collects evidence for up to five named cards
  and retrieves relevant numbered rules for the question. It returns
  interpretation guidance and missing context for the client assistant.

For example, ask a connected assistant:

> How do Rest in Peace and a creature's “when this creature dies” ability
> interact? Rest in Peace is on the battlefield when the creature is destroyed.

The assistant should use exact card text, distinguish replacement effects from
triggered abilities, cite the relevant rules, and explain the result for the
stated game state. Other questions may require the active player, phase,
stack order, targets, chosen modes, controller, timestamps, or other effects
on the battlefield. Missing details must remain explicit assumptions or
follow-up questions.

The service retrieves evidence; it does not simulate a game or independently
issue a judge ruling. Lexical matches alone are not proof of an interaction's
outcome. Rules excerpts can be incomplete; clients can use `search_rules` and
`ask_rules` to retrieve additional authority. Dated card rulings may also
refer to an earlier rules version. Preserve source dates in the final answer.

## API and access

The same evidence is available through the existing public API controls:

```text
GET /api/v1/card-rules?card=Rest%20in%20Peace
GET /api/v1/card-effects?q=draw%20a%20card&limit=20
```

Both routes use the normal public rate limits. No paid tier is required.
Exact full card names take precedence over face names; face-name lookup is
used only when no full name matches. Duplicate full names require an Oracle ID.
Unknown cards return 404; ambiguous names return 409 with candidates; an
uninitialized dataset returns an actionable 503. Effect search uses bounded,
snapshot-aware pagination. The OpenAPI document and
[MCP tool reference](mcp-tools.md) contain the exact contracts.

The API application and MCP server must both be deployed for these tools to
be available through a hosted connector. A database import alone does not
publish either application.

## Sources and attribution

- [Scryfall card objects](https://scryfall.com/docs/api/cards) provide Oracle
  text and face metadata.
- [Scryfall rulings](https://scryfall.com/docs/api/rulings) distinguish Wizards
  rulings from Scryfall notes; they are not interchangeable authorities.
- [Wizards' rules page](https://magic.wizards.com/en/rules) supplies the
  Comprehensive Rules.

Magic Brain is unofficial. Magic text and intellectual property belong to
Wizards of the Coast and their respective owners. Follow Scryfall's
[data guidelines](https://scryfall.com/docs/api), including free access to
card data, attribution, and additional value beyond republishing a feed.
See [NOTICE](../NOTICE.md). Raw third-party datasets are not included in the
repository or relicensed under its software license.
