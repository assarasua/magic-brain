create table if not exists market_briefs (
  id uuid primary key default gen_random_uuid(),
  market_data_date date not null unique,
  schema_version integer not null check (schema_version > 0),
  source text not null,
  comparison_7d_date date,
  comparison_30d_date date,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  published_at timestamptz not null default now()
);

comment on table market_briefs is
  'Immutable, deterministic daily briefs derived only from stored market prices.';
comment on column market_briefs.schema_version is
  'Version of the deterministic market-brief derivation methodology.';

create index if not exists idx_market_briefs_date
  on market_briefs (market_data_date desc);

create or replace function prevent_market_brief_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'market briefs are immutable once published';
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'market_briefs_immutable'
      and tgrelid = 'market_briefs'::regclass
      and not tgisinternal
  ) then
    create trigger market_briefs_immutable
    before update or delete on market_briefs
    for each row execute function prevent_market_brief_mutation();
  end if;
end;
$$;
