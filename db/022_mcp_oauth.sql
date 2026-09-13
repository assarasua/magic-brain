create table if not exists app_oauth_clients (
  client_id text primary key,
  client_name text not null check (char_length(client_name) between 1 and 100),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 5),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table if not exists app_oauth_authorization_codes (
  code_hash text primary key,
  client_id text not null references app_oauth_clients(client_id) on delete cascade,
  owner_id uuid not null references app_users(id) on delete cascade,
  redirect_uri text not null,
  resource text not null,
  scopes text[] not null,
  code_challenge text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create table if not exists app_oauth_grants (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references app_oauth_clients(client_id) on delete cascade,
  owner_id uuid not null references app_users(id) on delete cascade,
  resource text not null,
  scopes text[] not null,
  access_token_hash text unique not null,
  access_expires_at timestamptz not null,
  refresh_token_hash text unique not null,
  refresh_expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

create index if not exists idx_app_oauth_codes_expiry
  on app_oauth_authorization_codes (expires_at);
create index if not exists idx_app_oauth_grants_owner
  on app_oauth_grants (owner_id, created_at desc);

create table if not exists app_oauth_audit_events (
  id bigserial primary key,
  owner_id uuid references app_users(id) on delete set null,
  client_id text,
  event_type text not null check (event_type in (
    'client_registered',
    'authorization_granted',
    'authorization_denied',
    'code_exchanged',
    'token_refreshed',
    'token_revoked',
    'scope_denied'
  )),
  scopes text[] not null default array[]::text[],
  request_id text,
  created_at timestamptz not null default now()
);

create table if not exists app_oauth_rate_limits (
  key_hash text not null,
  bucket timestamptz not null,
  request_count integer not null,
  primary key (key_hash, bucket)
);

create table if not exists app_public_api_idempotency (
  owner_id uuid not null references app_users(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  operation text not null,
  request_hash text not null,
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  primary key (owner_id, idempotency_key)
);

alter table app_portfolio_list_shares
  add column if not exists idempotency_key_hash bytea;

create unique index if not exists uq_app_portfolio_share_idempotency
  on app_portfolio_list_shares (user_id, idempotency_key_hash)
  where idempotency_key_hash is not null;
