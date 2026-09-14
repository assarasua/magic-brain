create table if not exists app_portfolio_batch_requests (
  user_id uuid not null references app_users(id) on delete cascade,
  idempotency_key uuid not null,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);

create index if not exists idx_portfolio_batch_requests_created
  on app_portfolio_batch_requests (created_at);

comment on table app_portfolio_batch_requests is
  'Idempotency records for atomic collection bulk scanner additions.';
