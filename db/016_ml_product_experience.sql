-- Extend the privacy-safe feedback allowlist to customer-facing ML surfaces.
alter table app_ml_feedback_events
  drop constraint if exists app_ml_feedback_events_surface_check;

alter table app_ml_feedback_events
  add constraint app_ml_feedback_events_surface_check check (surface in (
    'brain_signals',
    'predict',
    'discover',
    'watchlist',
    'portfolio',
    'daily_news',
    'opportunity_graph',
    'alert'
  ));

create table if not exists app_ml_smart_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  scryfall_id uuid not null references cards(scryfall_id) on delete cascade,
  model_score_id uuid not null references app_ml_card_user_scores(id) on delete cascade,
  minimum_score_delta numeric(9, 8) not null default 0.15
    check (minimum_score_delta between 0.05 and 1),
  notify_on_regime_change boolean not null default true,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, scryfall_id)
);

comment on table app_ml_smart_alerts is
  'User-confirmed alerts for material verified-score or regime changes. No trading action is permitted.';
