-- Privacy-safe serving telemetry for operator evaluation. This records only
-- assignment and score provenance; it intentionally excludes request payloads,
-- identity attributes, IP addresses, and user-agent strings.

create table if not exists app_ml_serving_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  user_id uuid not null references app_users(id) on delete cascade,
  surface text not null check (surface in ('brain_signals')),
  cohort text not null check (cohort in ('off', 'control', 'ml')),
  source text not null check (source in ('deterministic', 'ml_batch')),
  fallback_reason text check (fallback_reason in (
    'experiment_off',
    'outside_cohort',
    'scores_missing_or_stale'
  )),
  model_version text check (
    model_version is null
    or model_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
  ),
  score_date date,
  score_generated_at timestamptz,
  served_at timestamptz not null default now(),
  constraint app_ml_serving_event_identity unique (user_id, request_id),
  constraint app_ml_serving_event_consistency check (
    (
      source = 'ml_batch'
      and cohort = 'ml'
      and fallback_reason is null
      and model_version is not null
      and score_date is not null
      and score_generated_at is not null
    )
    or (
      source = 'deterministic'
      and fallback_reason is not null
      and model_version is null
      and score_date is null
      and score_generated_at is null
    )
  )
);

comment on table app_ml_serving_events is
  'Bounded allowlisted ML serving decisions for fallback, freshness, and cohort monitoring. No request payload or network identifiers.';

create index if not exists idx_app_ml_serving_events_time_cohort
  on app_ml_serving_events(served_at desc, cohort, source);

create index if not exists idx_app_ml_serving_events_model_time
  on app_ml_serving_events(model_version, served_at desc)
  where model_version is not null;

create index if not exists idx_app_ml_feedback_model_time
  on app_ml_feedback_events(model_version, occurred_at desc, event_type);

create index if not exists idx_app_ml_scores_model_generated
  on app_ml_card_user_scores(model_version, generated_at desc);
