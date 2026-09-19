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
