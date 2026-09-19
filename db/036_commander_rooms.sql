-- Private invite-link Commander rooms. Hidden zones remain on the server.
create table if not exists app_play_rooms (
  id uuid primary key,
  host_user_id uuid not null references app_users(id) on delete cascade,
  revision integer not null default 0 check (revision >= 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);
create index if not exists app_play_rooms_host_idx on app_play_rooms(host_user_id, created_at desc);
create index if not exists app_play_rooms_expiry_idx on app_play_rooms(expires_at);
