alter table app_oauth_clients
  alter column expires_at drop not null;

update app_oauth_clients
set expires_at = null
where revoked_at is null;

alter table app_oauth_consent_requests
  add column if not exists decision text
    check (decision is null or decision in ('allow', 'deny')),
  add column if not exists authorization_code_hash text;

create table if not exists app_oauth_consents (
  owner_id uuid not null references app_users(id) on delete cascade,
  client_id text not null references app_oauth_clients(client_id) on delete cascade,
  resource text not null,
  scopes text[] not null,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (owner_id, client_id, resource)
);

alter table app_oauth_grants
  add column if not exists family_id uuid;

update app_oauth_grants
set family_id = gen_random_uuid()
where family_id is null;

alter table app_oauth_grants
  alter column family_id set not null;

create index if not exists idx_app_oauth_grants_family
  on app_oauth_grants (family_id);

alter table app_oauth_audit_events
  drop constraint if exists app_oauth_audit_events_event_type_check;

alter table app_oauth_audit_events
  add constraint app_oauth_audit_events_event_type_check check (event_type in (
    'client_registered',
    'authorization_granted',
    'authorization_auto_approved',
    'authorization_denied',
    'code_exchanged',
    'token_refreshed',
    'refresh_reuse_detected',
    'token_revoked',
    'consent_revoked',
    'scope_denied'
  ));
