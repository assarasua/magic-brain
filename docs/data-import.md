# Card and price data import

Magic Brain does not bundle a card or price dataset. Explicit import commands
can download supported sources. Obtain data under terms that permit your intended use, and read
[../NOTICE.md](../NOTICE.md) before importing it.

For Oracle text, card effects, and card-specific rulings, use the
[card rules import](card-rules.md). It imports versioned gameplay evidence
separately from the printing and price tables described below.

## Base schema

`db/000_base_data_schema.sql` defines the minimum contract used by the current
application. Apply it once before the product migrations:

```bash
psql "$DATABASE_URL" -f db/000_base_data_schema.sql
npm run db:migrate
```

`cards.scryfall_id` is the printing identifier used by all product tables.
Populate stable metadata including `oracle_id`, set code/name, collector
number, language, rarity, release date, and color identity. Store either a
direct `image_url`, an `image_uris` object containing `normal`, or neither.

Each `prices` row is unique by printing, observation date, and source:

- `source`: a lowercase provenance key such as `mtgjson`;
- `date`: the provider's observation/snapshot date, not import time;
- `eur`: non-foil EUR price;
- `eur_foil`: foil EUR price.

The current queries select rows where `source = 'mtgjson'`. If you use another
authorized source, either normalize it into a lawful MTGJSON-derived feed and
retain the correct provenance, or update your fork's queries consistently. Do
not mislabel a source.

## Daily and monthly price history

The card chart supports **Daily · 30 days** and **Monthly**. Daily means the
current database calendar date and the preceding 29 dates, not the last 30
observations. Monthly includes the full available history, grouped by calendar
month, printing, source, currency, and finish. Missing prices are excluded;
zero is a recorded price. Each point includes its contributing observation
count, and incomplete months are labelled partial.

Migration `036_price_retention.sql` creates the monthly archive and current
derived price comparisons. It does not delete existing history. After deploying
the application and MCP changes, run compaction. Apply the additive migration
before deploying those changes:

```sh
npm run db:migrate
# Deploy the compatible application and MCP server before the next commands.
npm run db:compact-prices -- --dry-run
npm run db:compact-prices -- --apply
```

Run the apply command after each successful daily price import. The optional
GitHub Actions maintenance workflow requires a `DATABASE_URL` secret in the `production` environment
and `PRICE_RETENTION_ENABLED=true` repository variable; enable it only after the
compatible application is deployed. This maintenance archives prices already
present; it does not fetch missing provider data.

The apply command first verifies that the deployed public API advertises the
monthly history contract, and refuses to archive otherwise. It checks
`https://magicbrain.es` by default; self-hosted deployments must set
`PRICE_HISTORY_PUBLIC_URL` to their live app URL. At completion it verifies
that no daily rows remain before the retention cutoff.

Compaction atomically moves up to one old calendar month at a time into
`monthly_card_prices`, preserving sums and counts for all supported currencies
and finishes, then deletes the corresponding daily rows. It can be resumed
after interruption. Migration `037_price_retention_backfill.sql` groups daily
observations before expanding finishes, avoiding repeated monthly writes during
the initial backfill. Normal daily maintenance only processes newly expired dates.
`app_monthly_prices` combines the archive with retained
daily observations before dividing by the total count, so partial months do
not become averages of averages. The latest known quotation and current
derived 1/7/30-day changes are separate snapshots and survive retention.
Daily-only statistics cannot recover older intramonth movements from monthly
averages. Missing exact long-term comparisons remain unavailable.

Archived dates are sealed: replayed INSERTs older than the archive watermark
are skipped, and UPDATEs moving rows behind the watermark are rejected.
Correcting an archived month requires rebuilding that complete source/month
from authoritative observations; do not append corrections to the aggregate.
Never relabel a monthly average as a daily observation.

The internal card endpoint accepts `?interval=daily|monthly`. The public
`/api/v1/cards/{id}/prices` endpoint and MCP `get_price_history` tool accept the
same interval. Monthly API responses include `aggregation: monthly_average`,
`periodStart`, `periodEnd`, and `observations`. Their `observedAt` is the last
actual contributing date. Monthly requests cover whole calendar months touched
by the date range. The public API keeps its 366-date inclusive request limit;
request successive ranges to retrieve more history.

Database tests run against an isolated schema inside a rolled-back transaction:

```sh
PRICE_HISTORY_DATABASE_TEST=1 node --env-file=.env.local --test test/price-history.test.mjs
```

## Recommended import process

1. Pin and record the provider, dataset version, retrieval date, license/terms,
   and checksum outside the database.
2. Transform in a disposable staging database. Validate UUIDs, dates, ISO
   currency, finish, non-negative prices, and referential integrity.
3. Upsert cards first, then prices in bounded batches inside transactions.
4. Preserve missing values as `NULL`; do not infer zero prices.
5. Verify duplicate counts and rejected rows before promoting the import.
6. Run `ANALYZE cards; ANALYZE prices;` after a large load.

Example parameterized upsert shape:

```sql
insert into prices (scryfall_id, date, source, eur, eur_foil)
values ($1, $2, $3, $4, $5)
on conflict (scryfall_id, date, source) do update
set eur = excluded.eur, eur_foil = excluded.eur_foil;
```

Do not commit import payloads, exports, database dumps, or credentials. Before
serving price data, responses should state the source, observation date,
currency (`EUR` here), and finish (`nonfoil` for `eur`, `foil` for
`eur_foil`). Confirm the source permits your API and redistribution model.
