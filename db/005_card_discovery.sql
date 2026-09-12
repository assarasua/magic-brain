create table if not exists app_card_swipes (
  user_id uuid not null references app_users(id) on delete cascade,
  scryfall_id uuid not null references cards(scryfall_id) on delete cascade,
  decision text not null check (decision in ('liked', 'passed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, scryfall_id)
);

create index if not exists idx_app_card_swipes_user_decision
  on app_card_swipes(user_id, decision, updated_at desc);
