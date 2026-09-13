create table if not exists app_portfolio_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  position integer not null default 0 check (position >= 0),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index if not exists idx_app_portfolio_lists_default
  on app_portfolio_lists(user_id)
  where is_default;

create unique index if not exists idx_app_portfolio_lists_name
  on app_portfolio_lists(user_id, lower(name));

create index if not exists idx_app_portfolio_lists_order
  on app_portfolio_lists(user_id, position, created_at, id);

insert into app_portfolio_lists (user_id, name, position, is_default)
select
  id,
  case when locale = 'es' then 'Mi colección' else 'My collection' end,
  0,
  true
from app_users
on conflict do nothing;

alter table app_portfolio_items
  add column if not exists list_id uuid;

update app_portfolio_items item
set list_id = list.id
from app_portfolio_lists list
where list.user_id = item.user_id
  and list.is_default
  and item.list_id is null;

alter table app_portfolio_items
  alter column list_id set not null;

alter table app_portfolio_items
  drop constraint if exists app_portfolio_items_list_owner_fkey;

alter table app_portfolio_items
  add constraint app_portfolio_items_list_owner_fkey
  foreign key (list_id, user_id)
  references app_portfolio_lists(id, user_id)
  on delete restrict;

create index if not exists idx_app_portfolio_items_user_list
  on app_portfolio_items(user_id, list_id, created_at desc);

create table if not exists app_portfolio_bulk_operations (
  user_id uuid not null references app_users(id) on delete cascade,
  request_id uuid not null,
  action text not null check (action in ('move', 'copy', 'delete')),
  request_hash bytea not null check (octet_length(request_hash) = 32),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

create index if not exists idx_app_portfolio_bulk_operations_created
  on app_portfolio_bulk_operations(created_at);

create table if not exists app_portfolio_import_operations (
  user_id uuid not null references app_users(id) on delete cascade,
  request_id uuid not null,
  request_hash bytea not null check (octet_length(request_hash) = 32),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);
