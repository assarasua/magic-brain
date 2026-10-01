export type PriceInterval = "daily" | "monthly";

export type PriceHistoryPoint = {
  date: string;
  eur: number | null;
  eurFoil: number | null;
  observations: number;
  foilObservations: number;
  expectedDays: number;
  firstObservedAt: string;
  lastObservedAt: string;
};

type HistoryRow = {
  date: string;
  eur: string | null;
  eur_foil: string | null;
  observations: number;
  foil_observations: number;
  expected_days: number;
  first_observed_at: string;
  last_observed_at: string;
};

type HistoryQuery = (
  sql: string,
  values: unknown[],
) => Promise<{ rows: HistoryRow[] }>;

export function createPriceHistoryReader(query: HistoryQuery) {
  return async (cardId: string, interval: PriceInterval = "daily") => {
    const { rows } = await query(
      interval === "monthly"
        ? `
          select month::text as date,
                 max(average_price) filter (where finish = 'nonfoil')::text as eur,
                 max(average_price) filter (where finish = 'foil')::text as eur_foil,
                 coalesce(max(observation_count) filter (where finish = 'nonfoil'), 0)::integer as observations,
                 coalesce(max(observation_count) filter (where finish = 'foil'), 0)::integer as foil_observations,
                 extract(day from month + interval '1 month - 1 day')::integer as expected_days,
                 min(first_observed_at)::text as first_observed_at,
                 max(last_observed_at)::text as last_observed_at
          from app_monthly_prices
          where scryfall_id = $1 and source = 'mtgjson'
            and currency = 'EUR' and finish in ('nonfoil', 'foil')
          group by month order by month
        `
        : `
          select date::text, eur::text, eur_foil::text,
                 case when eur is null then 0 else 1 end as observations,
                 case when eur_foil is null then 0 else 1 end as foil_observations,
                 1 as expected_days,
                 date::text as first_observed_at, date::text as last_observed_at
          from prices
          where scryfall_id = $1 and source = 'mtgjson'
            and date between current_date - 29 and current_date
          order by date
        `,
      [cardId],
    );

    return rows.map((row): PriceHistoryPoint => ({
      date: row.date,
      eur: row.eur === null ? null : Number(row.eur),
      eurFoil: row.eur_foil === null ? null : Number(row.eur_foil),
      observations: row.observations,
      foilObservations: row.foil_observations,
      expectedDays: row.expected_days,
      firstObservedAt: row.first_observed_at,
      lastObservedAt: row.last_observed_at,
    }));
  };
}
