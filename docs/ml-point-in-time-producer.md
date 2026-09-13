# ML point-in-time producer

This producer materializes contract-v1 feature snapshots and matured outcome
labels. It is the only supported writer for `app_ml_feature_snapshots` and
`app_ml_outcome_labels`.

## Temporal guarantees

- Features read positive prices only from the configured source and only on or
  before the scoring date.
- The latest observation on or before each lookback is used for momentum.
- A first price observation proves only card identity. The corresponding
  historical metadata revision intentionally has null catalogue fields.
- Catalogue rarity, type, release date, and Reserved List state are captured as
  an append-only revision with the actual observation date. They are never
  backdated.
- Labels are written only after `as_of_date + 90 days`. Returns require a
  positive observation on the exact 7-, 30-, or 90-day target. Missing targets
  remain null and reduce coverage.
- Contract versions are fixed at `v1`. SHA-256 checksums make retries
  idempotent and cause a hard failure if an existing v1 row has different
  content.

The producer uses a PostgreSQL advisory lock, per-batch transactions, immutable
upserts, and a persisted checkpoint. It logs only aggregate counts and run IDs;
it never logs the database connection string or card/user data.

## Commands

Apply migration 018 first:

```sh
npm run db:migrate
```

Estimate a bounded historical run without writing:

```sh
npm run ml:produce -- dry-run \
  --source mtgjson --from 2024-01-01 --to 2026-06-01 \
  --date-step-days 7 --max-rows 500000
```

Run the backfill. Daily dates are the default; an explicit weekly step is
appropriate for an initial walk-forward evaluation when the dry-run volume is
large:

```sh
npm run ml:produce -- backfill \
  --source mtgjson --from 2024-01-01 --to 2026-06-01 \
  --date-step-days 7 --batch-size 250 --chunk-days 4 --max-rows 500000
```

Every write run prints a `runId`. After a failure, use the same options and that
checkpoint:

```sh
npm run ml:produce -- backfill \
  --source mtgjson --from 2024-01-01 --to 2026-06-01 \
  --date-step-days 7 --batch-size 250 --chunk-days 4 --max-rows 500000 \
  --resume 00000000-0000-4000-8000-000000000000
```

Produce one daily snapshot and mature all eligible labels:

```sh
npm run ml:produce -- daily \
  --source mtgjson --batch-size 250 --max-rows 100000
npm run ml:produce -- mature-labels \
  --source mtgjson --batch-size 250 --max-rows 100000
```

`daily` accepts `--date YYYY-MM-DD`; label maturation accepts
`--through YYYY-MM-DD`. Bounds are validated before connecting.

## Schedule

`.github/workflows/ml-point-in-time-daily.yml` runs at 03:35 UTC with a
non-cancelling concurrency group. Configure `DATABASE_URL` as a secret in the
protected GitHub `production` environment and require environment reviewers if
desired. The workflow applies ordered migrations, produces snapshots, then
matures labels. It exposes no HTTP mutation endpoint.

Before enabling the schedule, confirm that the production source key is
`mtgjson`; pass a different lowercase source explicitly if production uses
another key.

## Aggregate verification

The following query reveals no card- or user-level data:

```sql
select 'features' as kind, count(*) as rows,
       min(as_of_date) as min_date, max(as_of_date) as max_date
  from app_ml_feature_snapshots
 where feature_contract_version = 'v1'
union all
select 'labels', count(*), min(as_of_date), max(as_of_date)
  from app_ml_outcome_labels
 where label_contract_version = 'v1';
```

Label coverage:

```sql
select count(*) as labels,
       avg(has_7d_price::int) as coverage_7d,
       avg(has_30d_price::int) as coverage_30d,
       avg(has_90d_price::int) as coverage_90d
  from app_ml_outcome_labels
 where label_contract_version = 'v1';
```
