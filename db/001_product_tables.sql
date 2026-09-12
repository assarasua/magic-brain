create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  session_token_hash text unique not null,
  locale text not null default 'en' check (locale in ('en', 'es')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text not null default 'free',
  subscription_current_period_end timestamptz,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_portfolio_items (
  id bigserial primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  scryfall_id uuid not null references cards(scryfall_id) on delete cascade,
  quantity integer not null check (quantity > 0),
  purchase_price_eur numeric(14, 2) not null check (purchase_price_eur >= 0),
  condition text not null default 'near_mint',
  language text not null default 'en',
  acquired_at date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_portfolio_user
  on app_portfolio_items(user_id);

create table if not exists app_watchlist_items (
  user_id uuid not null references app_users(id) on delete cascade,
  scryfall_id uuid not null references cards(scryfall_id) on delete cascade,
  target_price_eur numeric(14, 2),
  created_at timestamptz not null default now(),
  primary key (user_id, scryfall_id)
);

create table if not exists app_brain_portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  name text not null,
  budget_eur numeric(14, 2) not null check (budget_eur > 0),
  risk_level text not null check (risk_level in ('conservative', 'balanced', 'aggressive')),
  horizon text not null check (horizon in ('short', 'medium', 'long')),
  preferences jsonb not null default '{}'::jsonb,
  expected_value_eur numeric(14, 2),
  created_at timestamptz not null default now()
);

create index if not exists idx_app_brain_portfolios_user
  on app_brain_portfolios(user_id, created_at desc);

create table if not exists app_brain_portfolio_items (
  brain_portfolio_id uuid not null references app_brain_portfolios(id) on delete cascade,
  scryfall_id uuid not null references cards(scryfall_id) on delete cascade,
  quantity integer not null check (quantity > 0),
  allocation_eur numeric(14, 2) not null check (allocation_eur >= 0),
  score numeric(10, 4) not null,
  rationale text not null,
  primary key (brain_portfolio_id, scryfall_id)
);
