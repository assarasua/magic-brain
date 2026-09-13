alter table app_users
  add column if not exists preferences_onboarding_completed boolean not null default false;

comment on column app_users.preferences_onboarding_completed is
  'True only after the user has successfully saved a complete, valid investment preference profile.';
