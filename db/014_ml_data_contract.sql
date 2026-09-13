-- Stable ML data contracts. Feature rows are point-in-time inputs; labels live
-- separately so future observations cannot be selected as model features.

create table if not exists app_ml_feature_snapshots (
  id uuid primary key default gen_random_uuid(),
  scryfall_id uuid not null references cards(scryfall_id) on delete cascade,
  as_of_date date not null,
  price_source text not null check (price_source ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  feature_contract_version text not null
    check (feature_contract_version ~ '^v[1-9][0-9]*$'),
  metadata_available_at date not null,
  source_max_price_date date not null,
  price_eur numeric(14, 4) not null check (price_eur > 0),
  momentum_7d numeric(14, 8),
  momentum_30d numeric(14, 8),
  momentum_90d numeric(14, 8),
  volatility_30d numeric(14, 8) check (volatility_30d is null or volatility_30d >= 0),
  drawdown_90d numeric(14, 8)
    check (drawdown_90d is null or drawdown_90d between -1 and 0),
  history_days integer not null check (history_days >= 0),
  observations_90d integer not null check (observations_90d between 1 and 91),
  price_staleness_days integer not null check (price_staleness_days >= 0),
  card_age_days integer check (card_age_days is null or card_age_days >= 0),
  rarity text,
  card_type text,
  is_reserved boolean,
  generated_at timestamptz not null default now(),
  constraint app_ml_features_point_in_time check (
    metadata_available_at <= as_of_date
    and source_max_price_date <= as_of_date
    and source_max_price_date = as_of_date - price_staleness_days
  ),
  constraint app_ml_features_identity unique (
    scryfall_id, as_of_date, price_source, feature_contract_version
  ),
  constraint app_ml_features_label_reference unique (id, as_of_date),
  constraint app_ml_features_score_reference unique (id, scryfall_id, as_of_date)
);

comment on table app_ml_feature_snapshots is
  'Immutable point-in-time card features. No observation later than as_of_date may influence a row.';
comment on column app_ml_feature_snapshots.metadata_available_at is
  'First date this exact metadata revision was available to the feature job, not merely the card release date.';
comment on column app_ml_feature_snapshots.source_max_price_date is
  'Latest raw price date read while producing this feature row; constrained to as_of_date or earlier.';

create index if not exists idx_app_ml_features_date_source
  on app_ml_feature_snapshots(as_of_date desc, price_source, feature_contract_version);
create index if not exists idx_app_ml_features_card_date
  on app_ml_feature_snapshots(scryfall_id, as_of_date desc);

create table if not exists app_ml_outcome_labels (
  feature_snapshot_id uuid primary key,
  label_contract_version text not null
    check (label_contract_version ~ '^v[1-9][0-9]*$'),
  as_of_date date not null,
  source_min_future_date date,
  source_max_future_date date,
  label_cutoff_date date not null,
  return_7d numeric(14, 8) check (return_7d is null or return_7d >= -1),
  return_30d numeric(14, 8) check (return_30d is null or return_30d >= -1),
  return_90d numeric(14, 8) check (return_90d is null or return_90d >= -1),
  downside_90d numeric(14, 8)
    check (downside_90d is null or downside_90d between -1 and 0),
  realized_volatility_90d numeric(14, 8)
    check (realized_volatility_90d is null or realized_volatility_90d >= 0),
  has_7d_price boolean not null,
  has_30d_price boolean not null,
  has_90d_price boolean not null,
  generated_at timestamptz not null default now(),
  constraint app_ml_label_feature_snapshot foreign key (
    feature_snapshot_id, as_of_date
  ) references app_ml_feature_snapshots(id, as_of_date) on delete cascade,
  constraint app_ml_labels_horizon check (
    label_cutoff_date = as_of_date + 90
    and (source_min_future_date is null) = (source_max_future_date is null)
    and (
      source_min_future_date is null
      or (
        source_min_future_date > as_of_date
        and source_max_future_date >= source_min_future_date
        and source_max_future_date <= label_cutoff_date
      )
    )
  ),
  constraint app_ml_labels_availability check (
    has_7d_price = (return_7d is not null)
    and has_30d_price = (return_30d is not null)
    and has_90d_price = (return_90d is not null)
  )
);

comment on table app_ml_outcome_labels is
  'Future outcomes kept physically separate from feature snapshots. Labels must never be joined into serving features.';

create index if not exists idx_app_ml_labels_cutoff
  on app_ml_outcome_labels(label_cutoff_date, label_contract_version);

create table if not exists app_ml_model_versions (
  version text primary key check (version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  model_kind text not null check (model_kind in ('deterministic', 'learning_to_rank')),
  status text not null default 'draft' check (status in ('draft', 'ready', 'retired')),
  feature_contract_version text not null
    check (feature_contract_version ~ '^v[1-9][0-9]*$'),
  label_contract_version text not null
    check (label_contract_version ~ '^v[1-9][0-9]*$'),
  training_cutoff_date date,
  artifact_uri text,
  artifact_sha256 text check (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  ranking_policy jsonb not null default '{}'::jsonb
    check (jsonb_typeof(ranking_policy) = 'object'),
  created_at timestamptz not null default now(),
  constraint app_ml_model_artifact_pair check (
    (artifact_uri is null) = (artifact_sha256 is null)
  )
);

create table if not exists app_ml_card_user_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  scryfall_id uuid not null references cards(scryfall_id) on delete cascade,
  score_date date not null,
  model_version text not null references app_ml_model_versions(version),
  feature_snapshot_id uuid not null,
  rank_score numeric(14, 8) not null,
  probability_positive_30d numeric(9, 8)
    check (probability_positive_30d is null or probability_positive_30d between 0 and 1),
  expected_downside_90d numeric(14, 8)
    check (expected_downside_90d is null or expected_downside_90d between -1 and 0),
  confidence numeric(9, 8) not null check (confidence between 0 and 1),
  relevance numeric(9, 8) not null check (relevance between 0 and 1),
  feature_contributions jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(feature_contributions) = 'array'
      and jsonb_array_length(feature_contributions) <= 10
    ),
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint app_ml_score_feature_snapshot foreign key (
    feature_snapshot_id, scryfall_id, score_date
  ) references app_ml_feature_snapshots(id, scryfall_id, as_of_date),
  constraint app_ml_score_expiry check (expires_at is null or expires_at > generated_at),
  constraint app_ml_score_identity unique (
    user_id, scryfall_id, score_date, model_version
  )
);

comment on table app_ml_card_user_scores is
  'Versioned, reproducible batch scores. Delete with the user and never use as raw training labels.';

create index if not exists idx_app_ml_scores_feed
  on app_ml_card_user_scores(user_id, score_date desc, rank_score desc);
create index if not exists idx_app_ml_scores_model_date
  on app_ml_card_user_scores(model_version, score_date desc);

create table if not exists app_ml_feedback_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  client_event_id uuid not null,
  event_type text not null check (event_type in (
    'impression',
    'open_details',
    'save_to_watchlist',
    'dismiss',
    'add_to_portfolio',
    'alert_action'
  )),
  surface text not null check (surface in (
    'brain_signals',
    'predict',
    'discover',
    'watchlist',
    'portfolio',
    'alert'
  )),
  scryfall_id uuid not null references cards(scryfall_id) on delete cascade,
  model_score_id uuid references app_ml_card_user_scores(id) on delete set null,
  model_version text check (
    model_version is null or model_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
  ),
  rank_position integer check (rank_position between 1 and 500),
  alert_action text check (alert_action in ('open', 'dismiss', 'save')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint app_ml_feedback_alert_action check (
    (event_type = 'alert_action' and alert_action is not null)
    or (event_type <> 'alert_action' and alert_action is null)
  ),
  constraint app_ml_feedback_idempotency unique (user_id, client_event_id)
);

comment on table app_ml_feedback_events is
  'Allowlisted product behavior only. Do not add free-form payloads, identity attributes, IP addresses, or user-agent strings.';

create index if not exists idx_app_ml_feedback_user_time
  on app_ml_feedback_events(user_id, occurred_at desc);
create index if not exists idx_app_ml_feedback_card_type_time
  on app_ml_feedback_events(scryfall_id, event_type, occurred_at desc);
create index if not exists idx_app_ml_feedback_training_time
  on app_ml_feedback_events(occurred_at, event_type);
