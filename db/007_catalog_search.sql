create extension if not exists pg_trgm;

create index if not exists idx_cards_name_trgm
  on cards using gin (lower(name) gin_trgm_ops);

create index if not exists idx_cards_set_name_trgm
  on cards using gin (lower(set_name) gin_trgm_ops);

create index if not exists idx_cards_set_code_lower
  on cards (lower(set_code));
