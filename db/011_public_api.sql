create table if not exists latest_card_prices (
  scryfall_id uuid not null references cards(scryfall_id) on delete cascade,
  source text not null,
  price_date date not null,
  eur numeric(14, 4) check (eur is null or eur >= 0),
  eur_foil numeric(14, 4) check (eur_foil is null or eur_foil >= 0),
  updated_at timestamptz not null default now(),
  primary key (scryfall_id, source)
);

insert into latest_card_prices (
  scryfall_id, source, price_date, eur, eur_foil
)
select distinct on (scryfall_id, source)
  scryfall_id, source, date, eur, eur_foil
from prices
order by scryfall_id, source, date desc
on conflict (scryfall_id, source) do update
set price_date = excluded.price_date,
    eur = excluded.eur,
    eur_foil = excluded.eur_foil,
    updated_at = now()
where excluded.price_date >= latest_card_prices.price_date;

create or replace function refresh_latest_card_price(
  target_card uuid,
  target_source text
) returns void language plpgsql as $$
begin
  delete from latest_card_prices
  where scryfall_id = target_card and source = target_source;

  insert into latest_card_prices (
    scryfall_id, source, price_date, eur, eur_foil
  )
  select scryfall_id, source, date, eur, eur_foil
  from prices
  where scryfall_id = target_card and source = target_source
  order by date desc
  limit 1;
end;
$$;

create or replace function sync_latest_card_price()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1 from latest_card_prices
      where scryfall_id = old.scryfall_id
        and source = old.source
        and price_date = old.date
    ) then
      perform refresh_latest_card_price(old.scryfall_id, old.source);
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and (
    old.scryfall_id is distinct from new.scryfall_id
    or old.source is distinct from new.source
    or old.date is distinct from new.date
  ) then
    perform refresh_latest_card_price(old.scryfall_id, old.source);
  end if;

  insert into latest_card_prices (
    scryfall_id, source, price_date, eur, eur_foil
  ) values (
    new.scryfall_id, new.source, new.date, new.eur, new.eur_foil
  )
  on conflict (scryfall_id, source) do update
  set price_date = excluded.price_date,
      eur = excluded.eur,
      eur_foil = excluded.eur_foil,
      updated_at = now()
  where excluded.price_date >= latest_card_prices.price_date;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'prices_sync_latest'
      and tgrelid = 'prices'::regclass
      and not tgisinternal
  ) then
    create trigger prices_sync_latest
    after insert or update or delete on prices
    for each row execute function sync_latest_card_price();
  end if;
end;
$$;

create index if not exists idx_cards_public_cursor
  on cards (lower(name), scryfall_id);

create index if not exists idx_cards_public_set_cursor
  on cards (lower(set_code), lower(name), scryfall_id);

create index if not exists idx_app_sets_public_cursor
  on app_sets (coalesce(released_at, date '0001-01-01') desc, code);

create table if not exists app_api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app_users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  prefix text not null,
  secret_hash text unique not null,
  scopes text[] not null default array['data:read']::text[],
  tier text not null default 'registered' check (tier in ('registered')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  check (scopes <@ array['data:read']::text[])
);

create index if not exists idx_app_api_keys_owner
  on app_api_keys (owner_id, created_at desc);

create unique index if not exists idx_app_api_keys_owner_name_active
  on app_api_keys (owner_id, lower(name))
  where revoked_at is null;
