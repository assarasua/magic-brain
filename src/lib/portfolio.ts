import { query } from "@/lib/db";

export type PortfolioHolding = {
  id: number;
  cardId: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  imageUrl: string | null;
  quantity: number;
  purchasePrice: number;
  currentPrice: number | null;
  currentValue: number | null;
  costBasis: number;
  gain: number | null;
  gainPercent: number | null;
  condition: string;
  language: string;
  acquiredAt: string;
};

type HoldingRow = {
  id: number;
  card_id: string;
  name: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  image_url: string | null;
  quantity: number;
  purchase_price: string;
  current_price: string | null;
  current_value: string | null;
  cost_basis: string;
  gain: string | null;
  gain_percent: string | null;
  condition: string;
  language: string;
  acquired_at: string;
};

const mapHolding = (row: HoldingRow): PortfolioHolding => ({
  id: row.id,
  cardId: row.card_id,
  name: row.name,
  setCode: row.set_code,
  setName: row.set_name,
  collectorNumber: row.collector_number,
  imageUrl: row.image_url,
  quantity: row.quantity,
  purchasePrice: Number(row.purchase_price),
  currentPrice: row.current_price === null ? null : Number(row.current_price),
  currentValue: row.current_value === null ? null : Number(row.current_value),
  costBasis: Number(row.cost_basis),
  gain: row.gain === null ? null : Number(row.gain),
  gainPercent: row.gain_percent === null ? null : Number(row.gain_percent),
  condition: row.condition,
  language: row.language,
  acquiredAt: row.acquired_at,
});

export async function getPortfolio(userId: string) {
  const [{ rows }, historyResult] = await Promise.all([
    query<HoldingRow>(
    `
      select
        i.id,
        c.scryfall_id::text as card_id,
        c.name,
        c.set_code,
        c.set_name,
        c.collector_number,
        coalesce(c.image_url, c.image_uris->>'normal') as image_url,
        i.quantity,
        i.purchase_price_eur as purchase_price,
        latest.eur as current_price,
        latest.eur * i.quantity as current_value,
        i.purchase_price_eur * i.quantity as cost_basis,
        (latest.eur - i.purchase_price_eur) * i.quantity as gain,
        case when i.purchase_price_eur > 0
          then ((latest.eur - i.purchase_price_eur) / i.purchase_price_eur) * 100
          else null
        end as gain_percent,
        i.condition,
        i.language,
        i.acquired_at::text
      from app_portfolio_items i
      join cards c on c.scryfall_id = i.scryfall_id
      left join lateral (
        select eur
        from prices
        where scryfall_id = c.scryfall_id and source = 'mtgjson'
        order by date desc
        limit 1
      ) latest on true
      where i.user_id = $1
      order by current_value desc nulls last, i.created_at desc
    `,
    [userId],
    ),
    query<{ date: string; value: string; invested: string }>(
      `
        select
          p.date::text,
          sum(p.eur * i.quantity)::text as value,
          sum(i.purchase_price_eur * i.quantity)::text as invested
        from app_portfolio_items i
        join prices p
          on p.scryfall_id = i.scryfall_id
          and p.source = 'mtgjson'
          and p.date >= current_date - interval '365 days'
          and p.date >= i.acquired_at
        where i.user_id = $1 and p.eur is not null
        group by p.date
        order by p.date
      `,
      [userId],
    ),
  ]);

  const holdings = rows.map(mapHolding);
  const summary = holdings.reduce(
    (totals, holding) => ({
      invested: totals.invested + holding.costBasis,
      value: totals.value + (holding.currentValue ?? 0),
    }),
    { invested: 0, value: 0 },
  );

  return {
    holdings,
    summary: {
      ...summary,
      gain: summary.value - summary.invested,
      gainPercent:
        summary.invested > 0
          ? ((summary.value - summary.invested) / summary.invested) * 100
          : 0,
      cardCount: holdings.reduce((total, holding) => total + holding.quantity, 0),
    },
    history: historyResult.rows.map((point) => ({
      date: point.date,
      value: Number(point.value),
      invested: Number(point.invested),
    })),
  };
}

export async function addPortfolioItem(
  userId: string,
  input: {
    cardId: string;
    quantity: number;
    purchasePrice: number;
    condition: string;
    language: string;
    acquiredAt?: string;
  },
) {
  await query(
    `
      insert into app_portfolio_items (
        user_id, scryfall_id, quantity, purchase_price_eur,
        condition, language, acquired_at
      )
      values ($1, $2, $3, $4, $5, $6, coalesce($7::date, current_date))
    `,
    [
      userId,
      input.cardId,
      input.quantity,
      input.purchasePrice,
      input.condition,
      input.language,
      input.acquiredAt ?? null,
    ],
  );
}

export async function deletePortfolioItem(userId: string, itemId: number) {
  await query(
    `delete from app_portfolio_items where id = $1 and user_id = $2`,
    [itemId, userId],
  );
}

export async function updatePortfolioItemLanguage(
  userId: string,
  itemId: number,
  language: string,
) {
  await query(
    `
      update app_portfolio_items
      set language = $1, updated_at = now()
      where id = $2 and user_id = $3
    `,
    [language, itemId, userId],
  );
}
