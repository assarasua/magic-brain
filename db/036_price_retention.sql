-- Historical observations are compacted only by the explicit maintenance command.
-- Applying this migration does not remove any daily prices.
create table if not exists monthly_card_prices (
  scryfall_id uuid not null references cards(scryfall_id) on delete cascade,
  source text not null,
  month date not null check (extract(day from month) = 1),
  currency text not null,
  finish text not null,
  price_sum numeric not null check (price_sum >= 0),
  observation_count integer not null check (observation_count > 0),
  first_observed_at date not null,
  last_observed_at date not null,
  primary key (scryfall_id, source, month, currency, finish),
  check (first_observed_at <= last_observed_at)
);

create table if not exists app_price_retention_state (
  singleton boolean primary key default true check (singleton),
  archived_before date not null,
  updated_at timestamptz not null default now()
);
insert into app_price_retention_state (singleton, archived_before)
values (true, '-infinity') on conflict (singleton) do nothing;

-- Current derived comparisons, not another historical daily series. They keep
-- an existing 30-day signal usable after its baseline observation is compacted.
create table if not exists app_price_change_snapshots (
  scryfall_id uuid not null references cards(scryfall_id) on delete cascade,
  source text not null,
  days integer not null check (days in (1, 7, 30)),
  price_date date not null,
  quoted_price numeric,
  comparison_date date,
  return_percent numeric,
  comparison_above_floor boolean not null default false,
  computed_at timestamptz not null default now(),
  primary key (scryfall_id, source, days)
);

create or replace view app_current_price_changes as
select latest.scryfall_id, latest.source, period.days, latest.price_date,
  coalesce(previous.date, saved.comparison_date) as comparison_date,
  case when previous.eur > 0
    then (latest.eur - previous.eur) / previous.eur * 100
    else saved.return_percent end as return_percent,
  case when previous.eur > 0 then previous.eur >= 2
    else coalesce(saved.comparison_above_floor, false) end as comparison_above_floor
from latest_card_prices latest
cross join (values (1), (7), (30)) period(days)
left join lateral (
  select date, eur from prices
  where scryfall_id = latest.scryfall_id and source = latest.source
    and date <= latest.price_date - period.days and eur > 0
  order by date desc limit 1
) previous on true
left join app_price_change_snapshots saved
  on saved.scryfall_id = latest.scryfall_id and saved.source = latest.source
  and saved.days = period.days and saved.price_date = latest.price_date
  and saved.quoted_price is not distinct from latest.eur;

create or replace function refresh_price_change_snapshots()
returns void language sql as $$
  insert into app_price_change_snapshots (
    scryfall_id, source, days, price_date, quoted_price, comparison_date,
    return_percent, comparison_above_floor, computed_at
  )
  select changes.scryfall_id, changes.source, changes.days, changes.price_date,
    latest.eur, changes.comparison_date, changes.return_percent,
    changes.comparison_above_floor, clock_timestamp()
  from app_current_price_changes changes
  join latest_card_prices latest using (scryfall_id, source)
  left join app_price_change_snapshots saved using (scryfall_id, source, days)
  where saved.scryfall_id is null or saved.computed_at < latest.updated_at
    or changes.return_percent is distinct from saved.return_percent
    or changes.comparison_date is distinct from saved.comparison_date
  on conflict (scryfall_id, source, days) do update set
    price_date = excluded.price_date, comparison_date = excluded.comparison_date,
    quoted_price = excluded.quoted_price,
    return_percent = excluded.return_percent,
    comparison_above_floor = excluded.comparison_above_floor,
    computed_at = excluded.computed_at;
$$;

create or replace function guard_archived_price_dates()
returns trigger language plpgsql as $$
declare cutoff date;
begin
  select archived_before into cutoff from app_price_retention_state where singleton for share;
  if new.date < cutoff then
    -- Bulk imports commonly replay their full history. Sealed observations must
    -- not reappear and be counted a second time in a monthly average.
    if tg_op = 'INSERT' then return null; end if;
    raise exception 'This price date has been archived; rebuild the complete month to correct it';
  end if;
  return new;
end;
$$;

create trigger prices_guard_archived_dates before insert or update on prices
for each row execute function guard_archived_price_dates();

-- Retention removes historical storage, not the most recent known quotation.
create or replace function sync_latest_card_price()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('magic_brain.compacting_prices', true) = 'on' then return old; end if;
    if exists (select 1 from latest_card_prices where scryfall_id = old.scryfall_id
      and source = old.source and price_date = old.date) then
      perform refresh_latest_card_price(old.scryfall_id, old.source);
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and (old.scryfall_id is distinct from new.scryfall_id
    or old.source is distinct from new.source or old.date is distinct from new.date) then
    perform refresh_latest_card_price(old.scryfall_id, old.source);
  end if;
  insert into latest_card_prices (scryfall_id, source, price_date, eur, eur_foil)
  values (new.scryfall_id, new.source, new.date, new.eur, new.eur_foil)
  on conflict (scryfall_id, source) do update set price_date = excluded.price_date,
    eur = excluded.eur, eur_foil = excluded.eur_foil, updated_at = now()
  where excluded.price_date >= latest_card_prices.price_date;
  return new;
end;
$$;

-- One observation date per transaction bounds locks and permits safe restart.
create or replace function compact_price_history_batch(as_of date default current_date)
returns bigint language plpgsql as $$
declare
  cutoff date;
  batch_end date;
  removed bigint;
begin
  if as_of > current_date then raise exception 'Retention date cannot be in the future'; end if;
  cutoff := as_of - 29;
  perform pg_advisory_xact_lock(hashtext('magic-brain:price-retention'));
  lock table prices in share row exclusive mode;
  select least(min(date) + 1, cutoff) into batch_end from prices where date < cutoff;
  if batch_end is null then return 0; end if;
  perform refresh_price_change_snapshots();
  perform set_config('magic_brain.compacting_prices', 'on', true);

  with deleted as (
    delete from prices where date < batch_end returning *
  ), archived as (
    insert into monthly_card_prices (
      scryfall_id, source, month, currency, finish, price_sum,
      observation_count, first_observed_at, last_observed_at
    )
    select d.scryfall_id, d.source, date_trunc('month', d.date)::date,
      amounts.currency, amounts.finish, sum(amounts.amount), count(*)::integer,
      min(d.date), max(d.date)
    from deleted d
    cross join lateral (values
      ('EUR', 'nonfoil', d.eur), ('EUR', 'foil', d.eur_foil),
      ('EUR', 'etched', (to_jsonb(d)->>'eur_etched')::numeric),
      ('USD', 'nonfoil', (to_jsonb(d)->>'usd')::numeric),
      ('USD', 'foil', (to_jsonb(d)->>'usd_foil')::numeric),
      ('USD', 'etched', (to_jsonb(d)->>'usd_etched')::numeric),
      ('TIX', 'nonfoil', (to_jsonb(d)->>'tix')::numeric)
    ) amounts(currency, finish, amount)
    where amounts.amount is not null
    group by d.scryfall_id, d.source, date_trunc('month', d.date)::date,
      amounts.currency, amounts.finish
    on conflict (scryfall_id, source, month, currency, finish) do update set
      price_sum = monthly_card_prices.price_sum + excluded.price_sum,
      observation_count = monthly_card_prices.observation_count + excluded.observation_count,
      first_observed_at = least(monthly_card_prices.first_observed_at, excluded.first_observed_at),
      last_observed_at = greatest(monthly_card_prices.last_observed_at, excluded.last_observed_at)
    returning 1
  ) select count(*) into removed from deleted;

  insert into app_price_retention_state (singleton, archived_before)
  values (true, batch_end)
  on conflict (singleton) do update set
    archived_before = greatest(app_price_retention_state.archived_before, excluded.archived_before),
    updated_at = now();
  perform set_config('magic_brain.compacting_prices', 'off', true);
  return removed;
end;
$$;

-- Combine archived sums with retained observations before dividing. Averaging
-- averages would overweight a partially archived boundary month.
create or replace view app_monthly_prices as
with parts as (
  select scryfall_id, source, month, currency, finish, price_sum,
    observation_count, first_observed_at, last_observed_at
  from monthly_card_prices
  union all
  select p.scryfall_id, p.source, date_trunc('month', p.date)::date,
    amounts.currency, amounts.finish, sum(amounts.amount), count(*)::integer,
    min(p.date), max(p.date)
  from prices p
  cross join lateral (values
    ('EUR', 'nonfoil', p.eur), ('EUR', 'foil', p.eur_foil),
    ('EUR', 'etched', (to_jsonb(p)->>'eur_etched')::numeric),
    ('USD', 'nonfoil', (to_jsonb(p)->>'usd')::numeric),
    ('USD', 'foil', (to_jsonb(p)->>'usd_foil')::numeric),
    ('USD', 'etched', (to_jsonb(p)->>'usd_etched')::numeric),
    ('TIX', 'nonfoil', (to_jsonb(p)->>'tix')::numeric)
  ) amounts(currency, finish, amount)
  where amounts.amount is not null and p.date <= current_date
  group by p.scryfall_id, p.source, date_trunc('month', p.date)::date,
    amounts.currency, amounts.finish
)
select scryfall_id, source, month, currency, finish,
  sum(price_sum) / sum(observation_count) as average_price,
  sum(observation_count)::integer as observation_count,
  min(first_observed_at) as first_observed_at,
  max(last_observed_at) as last_observed_at
from parts group by scryfall_id, source, month, currency, finish;
