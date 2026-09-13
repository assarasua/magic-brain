create table if not exists app_oauth_consent_requests (
  request_hash text primary key,
  owner_id uuid not null references app_users(id) on delete cascade,
  client_id text not null references app_oauth_clients(client_id) on delete cascade,
  redirect_uri text not null,
  resource text not null,
  state text not null,
  scopes text[] not null,
  code_challenge text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists idx_app_oauth_consent_expiry
  on app_oauth_consent_requests (expires_at);
