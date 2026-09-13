import { query } from "@/lib/db";
import { getLatestSetWatch, type LatestSetWatchPick } from "@/lib/latest-set-watch";
import {
  calculateSetPrediction,
  type GrowthTarget,
  type PredictionInputs,
  type PredictionResult,
} from "@/lib/predict-model";
import type { SetOption } from "@/lib/sets";

type PredictionRow = {
  code: string;
  name: string;
  released_at: string | null;
  set_type: string;
  digital: boolean;
  tabletop: boolean;
  parent_set_code: string | null;
  card_count: number;
  tracked_cards: string;
  coverage_percent: string | null;
  median_return_90d: string | null;
  breadth_90d: string | null;
  volatility_90d: string | null;
  latest_price_date: string | null;
};

export type SetPrediction = {
  set: SetOption & { cardCount: number };
  asOf: string | null;
  marketEvidence: {
    trackedCards: number;
    coveragePercent: number | null;
    medianReturn90d: number | null;
    breadth90d: number | null;
    volatility90d: number | null;
    isUpcoming: boolean;
  };
  inputs: PredictionInputs;
  prediction: PredictionResult;
  cardPredictions: LatestSetWatchPick[];
  methodology: {
    benchmarkNote: string;
    forecastNote: string;
  };
};

const numberOrNull = (value: string | null) =>
  value === null ? null : Number(value);

export async function getSetPrediction(
  requestedSetCode: string | null,
  inputs: PredictionInputs,
): Promise<SetPrediction | null> {
  const normalizedCode = requestedSetCode?.trim().toLowerCase() || null;
  const { rows } = await query<PredictionRow>(
    `
      with selected_set as (
        select *
        from app_sets
        where
          ($1::text is not null and code = $1)
          or (
            $1::text is null
            and tabletop = true
            and digital = false
            and set_type in ('expansion', 'core', 'masters', 'draft_innovation')
          )
        order by
          case when code = $1 then 0 else 1 end,
          case when released_at >= current_date then 0 else 1 end,
          case when released_at >= current_date then released_at end asc nulls last,
          released_at desc nulls last
        limit 1
      ),
      card_metrics as (
        select
          c.scryfall_id,
          latest.date as latest_date,
          case
            when previous.eur > 0
            then ((latest.eur - previous.eur) / previous.eur) * 100
            else null
          end as return_90d,
          case
            when history.average_price > 0
            then (history.price_deviation / history.average_price) * 100
            else null
          end as volatility_90d
        from cards c
        join selected_set s on lower(c.set_code) = s.code
        left join lateral (
          select date, eur
          from prices
          where scryfall_id = c.scryfall_id
            and source = 'mtgjson'
            and eur > 0
          order by date desc
          limit 1
        ) latest on true
        left join lateral (
          select eur
          from prices
          where scryfall_id = c.scryfall_id
            and source = 'mtgjson'
            and eur > 0
            and date <= latest.date - 90
          order by date desc
          limit 1
        ) previous on true
        left join lateral (
          select avg(eur) as average_price, stddev_pop(eur) as price_deviation
          from prices
          where scryfall_id = c.scryfall_id
            and source = 'mtgjson'
            and eur > 0
            and date between latest.date - 90 and latest.date
        ) history on true
      )
      select
        s.code,
        s.name,
        s.released_at::text,
        s.set_type,
        s.digital,
        s.tabletop,
        s.parent_set_code,
        s.card_count,
        count(m.scryfall_id) filter (where m.latest_date is not null)::text as tracked_cards,
        case
          when s.card_count > 0
          then least(100.0, round(
            100.0 * count(m.scryfall_id) filter (where m.latest_date is not null)
            / s.card_count,
            1
          ))::text
          else null
        end as coverage_percent,
        percentile_cont(0.5) within group (order by m.return_90d)
          filter (where m.return_90d is not null)::text as median_return_90d,
        case
          when count(m.return_90d) > 0
          then round(
            100.0 * count(*) filter (where m.return_90d > 0)
            / count(m.return_90d),
            1
          )::text
          else null
        end as breadth_90d,
        avg(m.volatility_90d)::text as volatility_90d,
        max(m.latest_date)::text as latest_price_date
      from selected_set s
      left join card_metrics m on true
      group by
        s.code, s.name, s.released_at, s.set_type, s.digital,
        s.tabletop, s.parent_set_code, s.card_count
    `,
    [normalizedCode],
  );
  const row = rows[0];
  if (!row) return null;

  const isUpcoming = Boolean(
    row.released_at &&
      new Date(`${row.released_at}T00:00:00Z`).getTime() > Date.now(),
  );
  const marketEvidence = {
    trackedCards: Number(row.tracked_cards),
    coveragePercent: numberOrNull(row.coverage_percent),
    medianReturn90d: numberOrNull(row.median_return_90d),
    breadth90d: numberOrNull(row.breadth_90d),
    volatility90d: numberOrNull(row.volatility_90d),
    isUpcoming,
  };
  const cardResult = await getLatestSetWatch(row.code);

  return {
    set: {
      code: row.code,
      name: row.name,
      releasedAt: row.released_at,
      setType: row.set_type,
      digital: row.digital,
      tabletop: row.tabletop,
      parentSetCode: row.parent_set_code,
      cardCount: row.card_count,
    },
    asOf: row.latest_price_date,
    marketEvidence,
    inputs,
    prediction: calculateSetPrediction(inputs, {
      ...marketEvidence,
      hasMarketData:
        marketEvidence.trackedCards > 0 &&
        marketEvidence.medianReturn90d !== null,
    }),
    cardPredictions: cardResult.picks.slice(0, 12),
    methodology: {
      benchmarkNote:
        "Illustrative annual benchmarks: inflation 3%, broad equity market 8%, extreme-growth target 20%. These are fixed comparison assumptions, not live index forecasts.",
      forecastNote:
        "The range is a transparent scenario estimate built from user assumptions and available 90-day set data. It is not a guaranteed return or financial advice.",
    },
  };
}

export const isGrowthTarget = (value: string | null): value is GrowthTarget =>
  value === "inflation" || value === "sp500" || value === "extreme";
