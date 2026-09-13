import type { CatalogCard } from "@/lib/catalog";
import { query } from "@/lib/db";
import {
  scoreLatestSetPick,
  type LatestSetWatchScore,
} from "@/lib/latest-set-watch-score";
import type { SetOption } from "@/lib/sets";

type WatchRow = {
  id: string;
  name: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  type_line: string | null;
  image_url: string | null;
  cardmarket_id: number | null;
  price: string;
  foil_price: string | null;
  price_date: string;
  price_7d: string | null;
  price_30d: string | null;
  average_30d: string | null;
  low_30d: string | null;
  high_30d: string | null;
  entry_low: string | null;
  entry_high: string | null;
  stability_percent: string | null;
  observation_count: number;
  history_days: number;
};

export type LatestSetWatchPick = {
  card: CatalogCard;
  score: LatestSetWatchScore;
  momentum7d: number | null;
  momentum30d: number | null;
  drawdownPercent: number | null;
  stabilityPercent: number | null;
  entryRange: { low: number; high: number } | null;
  rationale: string[];
  riskRationale: string;
  trendRationale: string;
  confidenceRationale: string;
};

export type LatestSetWatchResult = {
  set: SetOption | null;
  asOf: string | null;
  picks: LatestSetWatchPick[];
  methodology: {
    summary: string;
    weights: Record<keyof LatestSetWatchScore["components"], number>;
    entryRange: string;
  };
};

const percentChange = (current: number, previous: number | null) =>
  previous && previous > 0 ? ((current - previous) / previous) * 100 : null;

const round = (value: number | null, digits = 2) =>
  value === null ? null : Number(value.toFixed(digits));

function explainPick(
  score: LatestSetWatchScore,
  momentum7d: number | null,
  momentum30d: number | null,
  drawdownPercent: number | null,
  stabilityPercent: number | null,
) {
  const rationale: string[] = [];
  if ((momentum7d ?? 0) >= 5) {
    rationale.push(`7-day momentum is ${momentum7d!.toFixed(1)}%.`);
  } else if ((momentum30d ?? 0) >= 8) {
    rationale.push(`30-day momentum is ${momentum30d!.toFixed(1)}%.`);
  } else {
    rationale.push("Momentum is measured rather than strongly extended.");
  }
  if (stabilityPercent !== null && stabilityPercent <= 10) {
    rationale.push(`30-day price dispersion is relatively contained at ${stabilityPercent.toFixed(1)}%.`);
  } else if (drawdownPercent !== null && drawdownPercent <= -8) {
    rationale.push(`The current price is ${Math.abs(drawdownPercent).toFixed(1)}% below its 30-day high.`);
  } else {
    rationale.push("Rarity and available price history support the ranking.");
  }

  return {
    rationale,
    riskRationale:
      score.risk === "high"
        ? "Limited history, wider price dispersion, or a deeper drawdown increases uncertainty."
        : score.risk === "medium"
          ? "Some price variability or history limitations remain."
          : "Observed dispersion and drawdown are comparatively contained.",
    trendRationale:
      score.trend === "accelerating"
        ? "Recent momentum is outpacing the broader 30-day move."
        : score.trend === "rising"
          ? "Available short-term price observations are trending upward."
          : score.trend === "falling"
            ? "Recent observations are trending downward."
            : "Recent observations show no decisive directional move.",
    confidenceRationale:
      score.confidence === "high"
        ? "At least most of the 30-day window is represented by price observations."
        : score.confidence === "medium"
          ? "The ranking uses a partial but usable history window."
          : "Sparse history makes this ranking especially tentative.",
  };
}

export async function getLatestSetWatch(
  requestedSetCode?: string,
): Promise<LatestSetWatchResult> {
  const normalizedSetCode = requestedSetCode?.trim().toLowerCase() || null;
  const { rows: setRows } = await query<{
    code: string;
    name: string;
    released_at: string | null;
    set_type: string;
    digital: boolean;
    tabletop: boolean;
    parent_set_code: string | null;
  }>(
    `
      select code, name, released_at::text, set_type, digital, tabletop, parent_set_code
      from app_sets
      where
        ($1::text is not null and code = $1)
        or (
          $1::text is null
          and tabletop = true
          and digital = false
          and set_type = 'expansion'
          and released_at <= current_date
        )
      order by
        case when code = $1 then 0 else 1 end,
        released_at desc nulls last
      limit 1
    `,
    [normalizedSetCode],
  );
  const selected = setRows[0];
  if (!selected) {
    return {
      set: null,
      asOf: null,
      picks: [],
      methodology: {
        summary: "No eligible normalized set was found.",
        weights: {
          momentum7d: 18,
          momentum30d: 22,
          stability: 20,
          drawdown: 15,
          history: 10,
          rarity: 5,
          confidence: 10,
        },
        entryRange: "30-day 25th percentile to 30-day average.",
      },
    };
  }

  const { rows } = await query<WatchRow>(
    `
      with latest_date as (
        select max(date) as value
        from prices
        where source = 'mtgjson'
      ),
      set_cards as (
        select *
        from cards
        where lower(set_code) = $1
      )
      select
        c.scryfall_id::text as id,
        c.name,
        c.set_code,
        c.set_name,
        c.collector_number,
        c.rarity,
        c.type_line,
        coalesce(c.image_url, c.image_uris->>'normal') as image_url,
        c.cardmarket_id,
        current_price.eur::text as price,
        current_price.eur_foil::text as foil_price,
        current_price.date::text as price_date,
        previous_7d.eur::text as price_7d,
        previous_30d.eur::text as price_30d,
        stats.average_price::text as average_30d,
        stats.low_price::text as low_30d,
        stats.high_price::text as high_30d,
        stats.entry_low::text as entry_low,
        stats.entry_high::text as entry_high,
        case
          when stats.average_price > 0
          then (stats.price_deviation / stats.average_price * 100)::text
          else null
        end as stability_percent,
        stats.observation_count,
        stats.history_days
      from set_cards c
      cross join latest_date
      join prices current_price
        on current_price.scryfall_id = c.scryfall_id
        and current_price.source = 'mtgjson'
        and current_price.date = latest_date.value
        and current_price.eur between 2 and 5000
      left join lateral (
        select eur
        from prices
        where scryfall_id = c.scryfall_id
          and source = 'mtgjson'
          and date <= latest_date.value - 7
          and eur > 0
        order by date desc
        limit 1
      ) previous_7d on true
      left join lateral (
        select eur
        from prices
        where scryfall_id = c.scryfall_id
          and source = 'mtgjson'
          and date <= latest_date.value - 30
          and eur > 0
        order by date desc
        limit 1
      ) previous_30d on true
      join lateral (
        select
          avg(eur) as average_price,
          min(eur) as low_price,
          max(eur) as high_price,
          percentile_cont(0.25) within group (order by eur) as entry_low,
          avg(eur) as entry_high,
          stddev_pop(eur) as price_deviation,
          count(*)::integer as observation_count,
          greatest(1, (max(date) - min(date)) + 1)::integer as history_days
        from prices
        where scryfall_id = c.scryfall_id
          and source = 'mtgjson'
          and date between latest_date.value - 30 and latest_date.value
          and eur between 2 and 5000
      ) stats on stats.observation_count > 0
    `,
    [selected.code],
  );

  const picks = rows
    .map((row): LatestSetWatchPick => {
      const price = Number(row.price);
      const momentum7d = round(percentChange(price, row.price_7d === null ? null : Number(row.price_7d)));
      const momentum30d = round(percentChange(price, row.price_30d === null ? null : Number(row.price_30d)));
      const high30d = row.high_30d === null ? null : Number(row.high_30d);
      const drawdownPercent = round(
        high30d && high30d > 0 ? ((price - high30d) / high30d) * 100 : null,
      );
      const stabilityPercent = round(
        row.stability_percent === null ? null : Number(row.stability_percent),
      );
      const score = scoreLatestSetPick({
        momentum7d,
        momentum30d,
        stabilityPercent,
        drawdownPercent,
        historyDays: row.history_days,
        observationCount: row.observation_count,
        rarity: row.rarity,
      });

      return {
        card: {
          id: row.id,
          name: row.name,
          setCode: row.set_code,
          setName: row.set_name,
          collectorNumber: row.collector_number,
          rarity: row.rarity,
          typeLine: row.type_line,
          imageUrl: row.image_url,
          cardmarketId: row.cardmarket_id,
          price,
          foilPrice: row.foil_price === null ? null : Number(row.foil_price),
          change7d: momentum7d,
          priceDate: row.price_date,
        },
        score,
        momentum7d,
        momentum30d,
        drawdownPercent,
        stabilityPercent,
        entryRange:
          row.entry_low === null || row.entry_high === null
            ? null
            : {
                low: Number(row.entry_low),
                high: Number(row.entry_high),
              },
        ...explainPick(
          score,
          momentum7d,
          momentum30d,
          drawdownPercent,
          stabilityPercent,
        ),
      };
    })
    .sort((left, right) => right.score.total - left.score.total)
    .slice(0, 100);

  return {
    set: {
      code: selected.code,
      name: selected.name,
      releasedAt: selected.released_at,
      setType: selected.set_type,
      digital: selected.digital,
      tabletop: selected.tabletop,
      parentSetCode: selected.parent_set_code,
    },
    asOf: rows[0]?.price_date ?? null,
    picks,
    methodology: {
      summary:
        "A 0–100 analytical rank combining 7/30-day momentum, 30-day price stability, drawdown, available history, rarity, and data confidence.",
      weights: {
        momentum7d: 18,
        momentum30d: 22,
        stability: 20,
        drawdown: 15,
        history: 10,
        rarity: 5,
        confidence: 10,
      },
      entryRange:
        "A descriptive band from the observed 30-day 25th-percentile price to the 30-day average; it is not a price target.",
    },
  };
}
