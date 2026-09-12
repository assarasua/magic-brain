create table if not exists app_reserved_cards (
  oracle_id uuid primary key,
  name text not null,
  source text not null default 'scryfall',
  synced_at timestamptz not null default now()
);

create index if not exists idx_app_reserved_name
  on app_reserved_cards(name);
