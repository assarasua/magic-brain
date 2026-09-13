-- Operational state for promoted ranking artifacts and resumable daily scoring.
-- A model cannot become ready based only on the synthetic evaluator fixture.

alter table app_ml_model_versions
  add column if not exists promotion_evidence jsonb not null default '{}'::jsonb,
  add column if not exists verified_at timestamptz;

alter table app_ml_model_versions
  drop constraint if exists app_ml_model_ready_evidence;

alter table app_ml_model_versions
  add constraint app_ml_model_ready_evidence check (
    status <> 'ready'
    or coalesce((
      model_kind = 'learning_to_rank'
      and artifact_uri is not null
      and artifact_sha256 is not null
      and training_cutoff_date is not null
      and verified_at is not null
      and promotion_evidence->>'dataset_kind' = 'real'
      and promotion_evidence->>'approved_by' <> ''
      and promotion_evidence->>'approved_at' is not null
      and promotion_evidence->>'evaluation_sha256' ~ '^[a-f0-9]{64}$'
      and promotion_evidence->'gates'->>'data_quality' = 'passed'
      and promotion_evidence->'gates'->>'offline_quality' = 'passed'
      and promotion_evidence->'gates'->>'safety' = 'passed'
    ), false)
  );

create table if not exists app_ml_batch_runs (
  id uuid primary key default gen_random_uuid(),
  score_date date not null,
  model_version text not null references app_ml_model_versions(version),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  checkpoint_user_id uuid references app_users(id) on delete set null,
  users_completed integer not null default 0 check (users_completed >= 0),
  scores_written integer not null default 0 check (scores_written >= 0),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  constraint app_ml_batch_run_identity unique (score_date, model_version),
  constraint app_ml_batch_run_completion check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

comment on table app_ml_batch_runs is
  'Idempotent daily scoring runs. checkpoint_user_id allows a failed job to resume after its last committed user.';

create index if not exists idx_app_ml_batch_runs_status
  on app_ml_batch_runs(status, score_date desc);

create index if not exists idx_app_ml_scores_expiry
  on app_ml_card_user_scores(user_id, expires_at, score_date desc);
