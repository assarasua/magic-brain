create table if not exists app_sets (
  code text primary key,
  scryfall_id uuid unique,
  name text not null,
  released_at date,
  set_type text not null,
  digital boolean not null default false,
  tabletop boolean not null default true,
  parent_set_code text,
  card_count integer not null default 0 check (card_count >= 0),
  printed_size integer check (printed_size is null or printed_size >= 0),
  icon_svg_uri text,
  scryfall_uri text,
  search_uri text,
  synced_at timestamptz not null default now(),
  check (code = lower(code)),
  check (not (digital and tabletop))
);

create index if not exists idx_app_sets_release
  on app_sets (released_at desc nulls last, name);

create index if not exists idx_app_sets_parent
  on app_sets (parent_set_code)
  where parent_set_code is not null;

insert into app_sets (
  code, name, released_at, set_type, digital, tabletop, card_count
)
select
  lower(c.set_code),
  max(c.set_name),
  min(c.released_at),
  'unknown',
  false,
  true,
  count(*)::integer
from cards c
where nullif(trim(c.set_code), '') is not null
group by lower(c.set_code)
on conflict (code) do nothing;
