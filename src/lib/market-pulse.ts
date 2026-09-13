import { unstable_cache } from "next/cache";
import { query } from "@/lib/db";
import {
  mapMarketPulseRow,
  type MarketPulseRow,
  type MarketPulseSet,
} from "@/lib/market-pulse-model";

export type { MarketPulseSet } from "@/lib/market-pulse-model";

export const MARKET_PULSE_PERIODS = [1, 7, 30] as const;
export type MarketPulsePeriod = (typeof MARKET_PULSE_PERIODS)[number];

export type MarketPulseDataset = {
  days: MarketPulsePeriod;
  latestDate: string | null;
  comparisonDate: string | null;
  sets: MarketPulseSet[];
};

async function loadMarketPulse(
  days: MarketPulsePeriod,
): Promise<MarketPulseDataset> {
  const { rows } = await query<MarketPulseRow>(
    `
      with dates as (
        select
          max(date) as latest_date,
          (
            select max(historical.date)
            from prices historical
            where historical.source = 'mtgjson'
              and historical.date <= (
                select max(current.date)
                from prices current
                where current.source = 'mtgjson'
              ) - $1::integer
          ) as comparison_date
        from prices
        where source = 'mtgjson'
      ),
      card_inventory as (
        select lower(set_code) as set_code, count(*)::integer as card_count
        from cards
        group by lower(set_code)
      ),
      returns as (
        select
          lower(c.set_code) as set_code,
          c.scryfall_id::text as card_id,
          c.name as card_name,
          ((current_price.eur - historical_price.eur) / historical_price.eur) * 100
            as return_percent
        from dates
        join prices current_price
          on current_price.source = 'mtgjson'
          and current_price.date = dates.latest_date
        join prices historical_price
          on historical_price.scryfall_id = current_price.scryfall_id
          and historical_price.source = 'mtgjson'
          and historical_price.date = dates.comparison_date
        join cards c on c.scryfall_id = current_price.scryfall_id
        where current_price.eur between 2 and 5000
          and historical_price.eur >= 2
          and ((current_price.eur - historical_price.eur) / historical_price.eur) * 100
            between -80 and 200
      ),
      ranked_returns as (
        select
          returns.*,
          row_number() over (
            partition by set_code
            order by abs(return_percent) desc, card_name asc, card_id asc
          ) as mover_rank
        from returns
      ),
      metrics as (
        select
          set_code,
          count(*)::integer as tracked_cards,
          percentile_cont(0.5) within group (order by return_percent) as median_return,
          count(*) filter (where return_percent > 0)::integer as advancers,
          count(*) filter (where return_percent < 0)::integer as decliners,
          (
            (count(*) filter (where return_percent > 0) -
              count(*) filter (where return_percent < 0))::numeric
            / nullif(count(*), 0)
          ) * 100 as breadth
        from returns
        group by set_code
      ),
      leaders as (
        select set_code, card_id, card_name, return_percent
        from ranked_returns
        where mover_rank = 1
      )
      select
        s.code,
        s.name,
        s.released_at::text,
        coalesce(i.card_count, s.card_count, 0)::text as card_count,
        coalesce(m.tracked_cards, 0)::text as tracked_cards,
        case
          when coalesce(i.card_count, s.card_count, 0) > 0
          then (coalesce(m.tracked_cards, 0)::numeric /
            coalesce(i.card_count, s.card_count)::numeric) * 100
          else null
        end::text as coverage_percent,
        m.median_return::text,
        coalesce(m.advancers, 0)::text as advancers,
        coalesce(m.decliners, 0)::text as decliners,
        m.breadth::text,
        l.card_id as leading_card_id,
        l.card_name as leading_card_name,
        l.return_percent::text as leading_return,
        dates.latest_date::text,
        dates.comparison_date::text
      from app_sets s
      cross join dates
      left join card_inventory i on i.set_code = s.code
      left join metrics m on m.set_code = s.code
      left join leaders l on l.set_code = s.code
      order by s.released_at desc nulls last, s.name asc
    `,
    [days],
  );

  return {
    days,
    latestDate: rows[0]?.latest_date ?? null,
    comparisonDate: rows[0]?.comparison_date ?? null,
    sets: rows.map(mapMarketPulseRow),
  };
}

const cachedLoaders = Object.fromEntries(
  MARKET_PULSE_PERIODS.map((days) => [
    days,
    unstable_cache(
      () => loadMarketPulse(days),
      ["market-pulse", String(days)],
      { revalidate: 300, tags: ["market-pulse"] },
    ),
  ]),
) as Record<MarketPulsePeriod, () => Promise<MarketPulseDataset>>;

export function getMarketPulse(days: MarketPulsePeriod) {
  return cachedLoaders[days]();
}
