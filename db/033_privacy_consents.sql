create table if not exists app_privacy_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  email_hash text,
  consent_type text not null check (consent_type in ('newsletter')),
  policy_version text not null,
  source text not null,
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  check (user_id is not null or email_hash is not null)
);

create index if not exists idx_app_privacy_consents_user
  on app_privacy_consents(user_id, consent_type, granted_at desc);

create index if not exists idx_app_privacy_consents_email
  on app_privacy_consents(email_hash, consent_type, granted_at desc);
