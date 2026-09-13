do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = 'app_watchlist_items'
      and column_name = 'alert_below_enabled'
  ) then
    alter table app_watchlist_items
      add column alert_below_enabled boolean not null default false;

    update app_watchlist_items
    set alert_below_enabled = true
    where target_price_eur is not null;
  end if;
end
$$;

alter table app_watchlist_items
  add column if not exists alert_above_price_eur numeric(14, 2),
  add column if not exists alert_above_enabled boolean not null default false,
  add column if not exists below_triggered_at timestamptz,
  add column if not exists below_read_at timestamptz,
  add column if not exists above_triggered_at timestamptz,
  add column if not exists above_read_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table app_watchlist_items
  drop constraint if exists app_watchlist_below_target_nonnegative,
  add constraint app_watchlist_below_target_nonnegative
    check (target_price_eur is null or target_price_eur >= 0),
  drop constraint if exists app_watchlist_above_target_nonnegative,
  add constraint app_watchlist_above_target_nonnegative
    check (alert_above_price_eur is null or alert_above_price_eur >= 0);
