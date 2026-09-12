alter table app_users
  add column if not exists product_tour_completed boolean not null default false;
