alter table app_users
  add column if not exists google_sub text,
  add column if not exists email text,
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists authenticated_at timestamptz;

create unique index if not exists idx_app_users_google_sub
  on app_users(google_sub)
  where google_sub is not null;

create unique index if not exists idx_app_users_email_lower
  on app_users(lower(email))
  where email is not null;
