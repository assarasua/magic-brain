create table if not exists app_portfolio_list_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  list_id uuid not null,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  revoked_at timestamptz,
  foreign key (list_id, user_id)
    references app_portfolio_lists(id, user_id)
    on delete cascade,
  check (expires_at = created_at + interval '24 hours')
);

create index if not exists idx_app_portfolio_list_shares_owner
  on app_portfolio_list_shares(user_id, list_id, created_at desc);

create index if not exists idx_app_portfolio_list_shares_expiry
  on app_portfolio_list_shares(expires_at)
  where revoked_at is null;

create table if not exists app_portfolio_share_rate_limits (
  identifier_hash bytea not null check (octet_length(identifier_hash) = 32),
  window_start timestamptz not null,
  request_count integer not null check (request_count between 1 and 60),
  primary key (identifier_hash, window_start)
);
