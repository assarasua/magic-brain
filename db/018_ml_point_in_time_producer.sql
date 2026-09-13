-- Operational state and metadata provenance for the leakage-safe ML producer.

create table if not exists app_ml_card_metadata_revisions (
  scryfall_id uuid not null references cards(scryfall_id) on delete cascade,
  available_at date not null,
  metadata_checksum text not null check (metadata_checksum ~ '^[a-f0-9]{64}$'),
  provenance text not null check (provenance in ('price_identity', 'catalog_observation')),
  released_at date,
  rarity text,
  card_type text,
  is_reserved boolean,
  captured_at timestamptz not null default now(),
  primary key (scryfall_id, metadata_checksum)
);

comment on table app_ml_card_metadata_revisions is
  'Append-only first-observed metadata revisions. Historical producers must not backdate catalog observations.';

create index if not exists idx_app_ml_metadata_point_in_time
  on app_ml_card_metadata_revisions(scryfall_id, available_at desc, captured_at desc);

alter table app_ml_feature_snapshots
  add column if not exists producer_checksum text
    check (producer_checksum is null or producer_checksum ~ '^[a-f0-9]{64}$');

alter table app_ml_outcome_labels
  add column if not exists producer_checksum text
    check (producer_checksum is null or producer_checksum ~ '^[a-f0-9]{64}$');

create index if not exists idx_app_ml_features_label_maturation
  on app_ml_feature_snapshots(
    price_source, feature_contract_version, as_of_date, id
  );

create table if not exists app_ml_producer_runs (
  id uuid primary key default gen_random_uuid(),
  operation text not null check (operation in ('backfill', 'daily', 'mature-labels')),
  feature_contract_version text not null default 'v1',
  label_contract_version text not null default 'v1',
  price_source text not null,
  from_date date,
  to_date date,
  options_checksum text not null check (options_checksum ~ '^[a-f0-9]{64}$'),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  checkpoint jsonb not null default '{}'::jsonb
    check (jsonb_typeof(checkpoint) = 'object'),
  rows_examined bigint not null default 0 check (rows_examined >= 0),
  rows_written bigint not null default 0 check (rows_written >= 0),
  error_message text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_app_ml_producer_runs_status
  on app_ml_producer_runs(operation, status, updated_at desc);
