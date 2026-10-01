-- Consolidate at most one calendar month per transaction. Daily maintenance
-- still has only the newly expired date to process. Aggregate before expanding
-- currencies/finishes to avoid repeatedly rewriting every monthly total.
create or replace function compact_price_history_batch(as_of date default current_date)
returns bigint language plpgsql as $$
declare
  cutoff date;
  batch_end date;
  removed bigint;
begin
  if as_of > current_date then raise exception 'Retention date cannot be in the future'; end if;
  cutoff := as_of - 29;
  perform pg_advisory_xact_lock(hashtext('magic-brain:price-retention'), 'prices'::regclass::oid::integer);
  lock table prices in share row exclusive mode;
  select least((date_trunc('month', min(date)) + interval '1 month')::date, cutoff)
    into batch_end from prices where date < cutoff;
  if batch_end is null then return 0; end if;
  perform refresh_price_change_snapshots();
  perform set_config('magic_brain.compacting_prices', 'on', true);

  with deleted as (
    delete from prices where date < batch_end returning *
  ), totals as (
    select d.scryfall_id, d.source, date_trunc('month', d.date)::date as month,
      sum(amounts.eur) as eur_sum, count(amounts.eur)::integer as eur_count,
      min(d.date) filter (where amounts.eur is not null) as eur_first,
      max(d.date) filter (where amounts.eur is not null) as eur_last,
      sum(amounts.eur_foil) as eur_foil_sum, count(amounts.eur_foil)::integer as eur_foil_count,
      min(d.date) filter (where amounts.eur_foil is not null) as eur_foil_first,
      max(d.date) filter (where amounts.eur_foil is not null) as eur_foil_last,
      sum(amounts.eur_etched) as eur_etched_sum, count(amounts.eur_etched)::integer as eur_etched_count,
      min(d.date) filter (where amounts.eur_etched is not null) as eur_etched_first,
      max(d.date) filter (where amounts.eur_etched is not null) as eur_etched_last,
      sum(amounts.usd) as usd_sum, count(amounts.usd)::integer as usd_count,
      min(d.date) filter (where amounts.usd is not null) as usd_first,
      max(d.date) filter (where amounts.usd is not null) as usd_last,
      sum(amounts.usd_foil) as usd_foil_sum, count(amounts.usd_foil)::integer as usd_foil_count,
      min(d.date) filter (where amounts.usd_foil is not null) as usd_foil_first,
      max(d.date) filter (where amounts.usd_foil is not null) as usd_foil_last,
      sum(amounts.usd_etched) as usd_etched_sum, count(amounts.usd_etched)::integer as usd_etched_count,
      min(d.date) filter (where amounts.usd_etched is not null) as usd_etched_first,
      max(d.date) filter (where amounts.usd_etched is not null) as usd_etched_last,
      sum(amounts.tix) as tix_sum, count(amounts.tix)::integer as tix_count,
      min(d.date) filter (where amounts.tix is not null) as tix_first,
      max(d.date) filter (where amounts.tix is not null) as tix_last
    from deleted d
    cross join lateral jsonb_to_record(to_jsonb(d)) as amounts(
      eur numeric, eur_foil numeric, eur_etched numeric, usd numeric,
      usd_foil numeric, usd_etched numeric, tix numeric
    )
    group by d.scryfall_id, d.source, date_trunc('month', d.date)::date
  ), archived as (
    insert into monthly_card_prices (
      scryfall_id, source, month, currency, finish, price_sum,
      observation_count, first_observed_at, last_observed_at
    )
    select t.scryfall_id, t.source, t.month, amounts.currency, amounts.finish,
      amounts.price_sum, amounts.observation_count, amounts.first_observed_at, amounts.last_observed_at
    from totals t
    cross join lateral (values
      ('EUR', 'nonfoil', t.eur_sum, t.eur_count, t.eur_first, t.eur_last),
      ('EUR', 'foil', t.eur_foil_sum, t.eur_foil_count, t.eur_foil_first, t.eur_foil_last),
      ('EUR', 'etched', t.eur_etched_sum, t.eur_etched_count, t.eur_etched_first, t.eur_etched_last),
      ('USD', 'nonfoil', t.usd_sum, t.usd_count, t.usd_first, t.usd_last),
      ('USD', 'foil', t.usd_foil_sum, t.usd_foil_count, t.usd_foil_first, t.usd_foil_last),
      ('USD', 'etched', t.usd_etched_sum, t.usd_etched_count, t.usd_etched_first, t.usd_etched_last),
      ('TIX', 'nonfoil', t.tix_sum, t.tix_count, t.tix_first, t.tix_last)
    ) amounts(currency, finish, price_sum, observation_count, first_observed_at, last_observed_at)
    where amounts.observation_count > 0
    on conflict (scryfall_id, source, month, currency, finish) do update set
      price_sum = monthly_card_prices.price_sum + excluded.price_sum,
      observation_count = monthly_card_prices.observation_count + excluded.observation_count,
      first_observed_at = least(monthly_card_prices.first_observed_at, excluded.first_observed_at),
      last_observed_at = greatest(monthly_card_prices.last_observed_at, excluded.last_observed_at)
    returning 1
  ) select count(*) into removed from deleted;

  insert into app_price_retention_state (singleton, archived_before)
  values (true, batch_end)
  on conflict (singleton) do update set
    archived_before = greatest(app_price_retention_state.archived_before, excluded.archived_before),
    updated_at = now();
  perform set_config('magic_brain.compacting_prices', 'off', true);
  return removed;
end;
$$;
