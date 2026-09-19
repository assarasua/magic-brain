-- Versioned Oracle card text and rulings, independent of collectible printings.
-- A complete import becomes visible only when its dataset is activated.
create table if not exists app_rules_datasets (
  id uuid primary key,
  imported_at timestamptz not null default now(),
  oracle_source jsonb not null,
  rulings_source jsonb not null,
  card_count integer not null check (card_count > 0),
  effect_count integer not null check (effect_count >= 0),
  ruling_count integer not null check (ruling_count >= 0),
  is_active boolean not null default false
);
create unique index if not exists idx_rules_dataset_active
  on app_rules_datasets (is_active) where is_active;

create table if not exists app_oracle_cards (
  dataset_id uuid not null references app_rules_datasets(id) on delete cascade,
  oracle_id uuid not null,
  scryfall_id uuid not null,
  name text not null,
  layout text not null,
  type_line text not null,
  oracle_text text,
  mana_cost text,
  keywords text[] not null default '{}',
  faces jsonb not null check (jsonb_typeof(faces) = 'array'),
  source_url text not null,
  search_text text not null,
  primary key (dataset_id, oracle_id)
);
create index if not exists idx_oracle_cards_name
  on app_oracle_cards (dataset_id, lower(name));
create index if not exists idx_oracle_cards_printing
  on app_oracle_cards (dataset_id, scryfall_id);
create index if not exists idx_oracle_cards_search
  on app_oracle_cards using gin (to_tsvector('english', search_text));

create table if not exists app_card_effects (
  dataset_id uuid not null,
  oracle_id uuid not null,
  face_index integer not null check (face_index >= 0),
  effect_index integer not null check (effect_index >= 0),
  text text not null,
  primary key (dataset_id, oracle_id, face_index, effect_index),
  foreign key (dataset_id, oracle_id)
    references app_oracle_cards(dataset_id, oracle_id) on delete cascade
);
comment on table app_card_effects is
  'Ordered verbatim Oracle paragraphs for retrieval. Not parsed or executable game effects.';
create index if not exists idx_card_effects_search
  on app_card_effects using gin (to_tsvector('english', text));

create table if not exists app_card_rulings (
  dataset_id uuid not null,
  oracle_id uuid not null,
  ruling_index integer not null check (ruling_index >= 0),
  source text not null check (source in ('wotc', 'scryfall')),
  published_at date not null,
  comment text not null,
  primary key (dataset_id, oracle_id, ruling_index),
  foreign key (dataset_id, oracle_id)
    references app_oracle_cards(dataset_id, oracle_id) on delete cascade
);
