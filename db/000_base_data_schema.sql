-- Contributor-safe base schema for independently sourced card and price data.
-- This migration creates empty tables only; it does not license or distribute
-- Scryfall, MTGJSON, Wizards, Cardmarket, or other third-party data.

create table if not exists cards (
  scryfall_id uuid primary key,
  oracle_id uuid,
  name text not null,
  set_code text not null,
  set_name text not null,
  collector_number text not null,
  lang text not null default 'en',
  rarity text not null,
  type_line text,
  color_identity text[] not null default '{}',
  released_at date,
  image_url text,
  image_uris jsonb,
  cardmarket_id integer
);

create index if not exists idx_cards_oracle_id on cards(oracle_id);
create index if not exists idx_cards_release on cards(released_at desc);

create table if not exists prices (
  scryfall_id uuid not null references cards(scryfall_id) on delete cascade,
  date date not null,
  source text not null,
  eur numeric(14, 4) check (eur is null or eur >= 0),
  eur_foil numeric(14, 4) check (eur_foil is null or eur_foil >= 0),
  primary key (scryfall_id, date, source)
);

comment on column prices.eur is
  'EUR price for a non-foil printing; provenance is identified by source/date.';
comment on column prices.eur_foil is
  'EUR price for a foil printing; provenance is identified by source/date.';

create index if not exists idx_prices_source_date
  on prices(source, date desc);
create index if not exists idx_prices_card_source_date
  on prices(scryfall_id, source, date desc);
