alter table app_mcp_calls
  add column if not exists request_summary text;

alter table app_mcp_calls
  drop constraint if exists app_mcp_calls_request_summary_check;

alter table app_mcp_calls
  add constraint app_mcp_calls_request_summary_check check (
    request_summary is null or char_length(request_summary) between 1 and 500
  );

create table if not exists app_oauth_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  created_at timestamptz not null default now()
);

create table if not exists app_oauth_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text unique not null,
  client_id uuid not null references app_oauth_clients(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  redirect_uri text not null,
  scopes text[] not null,
  code_challenge text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists app_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references app_oauth_clients(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  access_token_hash text unique not null,
  refresh_token_hash text unique not null,
  scopes text[] not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_oauth_codes_lookup
  on app_oauth_authorization_codes (code_hash, expires_at)
  where consumed_at is null;

create index if not exists idx_app_oauth_access_tokens
  on app_oauth_tokens (access_token_hash)
  where revoked_at is null;

create index if not exists idx_app_oauth_refresh_tokens
  on app_oauth_tokens (refresh_token_hash)
  where revoked_at is null;
