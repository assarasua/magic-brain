alter table app_users
  add column if not exists plan_tier text
  generated always as (
    case
      when subscription_status in ('active', 'trialing') then 'pro'
      else 'basic'
    end
  ) stored;

create index if not exists idx_app_users_plan_tier
  on app_users(plan_tier);
