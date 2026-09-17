alter table app_users
  add column if not exists referral_code text;

update app_users
set referral_code = lower(substr(replace(id::text, '-', ''), 1, 12))
where referral_code is null;

alter table app_users
  alter column referral_code set not null,
  alter column referral_code set default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

create unique index if not exists idx_app_users_referral_code
  on app_users(referral_code);

create table if not exists app_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references app_users(id) on delete cascade,
  referred_user_id uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (referred_user_id),
  check (referrer_user_id <> referred_user_id)
);

create index if not exists idx_app_referrals_leaderboard
  on app_referrals(referrer_user_id, created_at desc);
