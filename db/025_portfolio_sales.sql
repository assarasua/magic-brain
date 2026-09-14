create table if not exists app_portfolio_sales (
  id bigserial primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  list_id uuid not null,
  request_id uuid not null,
  source_holding_id bigint not null check (source_holding_id > 0),
  scryfall_id uuid not null,
  card_name text not null,
  set_code text not null,
  set_name text not null,
  collector_number text not null,
  image_url text,
  condition text not null,
  language text not null,
  purchase_unit_price_eur numeric(14, 2) not null
    check (purchase_unit_price_eur >= 0),
  quantity integer not null check (quantity > 0),
  sale_unit_price_eur numeric(14, 2) not null
    check (sale_unit_price_eur >= 0),
  acquired_at date not null,
  sold_at date not null check (sold_at >= acquired_at),
  proceeds_eur numeric(24, 2) not null check (proceeds_eur >= 0),
  cost_basis_eur numeric(24, 2) not null check (cost_basis_eur >= 0),
  realized_pnl_eur numeric(24, 2) not null,
  created_at timestamptz not null default now(),
  constraint app_portfolio_sales_list_owner_fkey
    foreign key (list_id, user_id)
    references app_portfolio_lists(id, user_id)
    on delete restrict,
  unique (user_id, request_id)
);

create index if not exists idx_app_portfolio_sales_user_list_sold
  on app_portfolio_sales(user_id, list_id, sold_at desc, id desc);

create index if not exists idx_app_portfolio_sales_source_holding
  on app_portfolio_sales(user_id, source_holding_id);
