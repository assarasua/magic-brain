import { query } from "@/lib/db";
import {
  calculateOpportunityAnalytics,
  calculatePortfolioSummary,
  classifyPortfolioOpportunity,
  type PortfolioOpportunityClassification,
  type PortfolioUpdate,
} from "@/lib/portfolio-model";

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
  currentPriceDate: string | null;
  currentValue: number | null;
  costBasis: number;
  gain: number | null;
  gainPercent: number | null;
  returnSincePurchasePercent: number | null;
  change7d: number | null;
  change30d: number | null;
  comparison7dDate: string | null;
  comparison30dDate: string | null;
  opportunityClassification: PortfolioOpportunityClassification | null;
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
  current_price_date: string | null;
  current_value: string | null;
  cost_basis: string;
  gain: string | null;
  gain_percent: string | null;
  change_7d: string | null;
  change_30d: string | null;
  comparison_7d_date: string | null;
  comparison_30d_date: string | null;
  condition: string;
  language: string;
  acquired_at: string;
};

const mapHolding = (row: HoldingRow): PortfolioHolding => {
  const change7d = row.change_7d === null ? null : Number(row.change_7d);
  const change30d = row.change_30d === null ? null : Number(row.change_30d);
  const gainPercent =
    row.gain_percent === null ? null : Number(row.gain_percent);

  return {
    id: row.id,
    cardId: row.card_id,
    name: row.name,
    setCode: row.set_code,
    setName: row.set_name,
    collectorNumber: row.collector_number,
    imageUrl: row.image_url,
    quantity: row.quantity,
    purchasePrice: Number(row.purchase_price),
    currentPrice:
      row.current_price === null ? null : Number(row.current_price),
    currentPriceDate: row.current_price_date,
    currentValue:
      row.current_value === null ? null : Number(row.current_value),
    costBasis: Number(row.cost_basis),
    gain: row.gain === null ? null : Number(row.gain),
    gainPercent,
    returnSincePurchasePercent: gainPercent,
    change7d,
    change30d,
    comparison7dDate: row.comparison_7d_date,
    comparison30dDate: row.comparison_30d_date,
    opportunityClassification:
      change7d === null || change30d === null
        ? null
        : classifyPortfolioOpportunity(change7d, change30d),
    condition: row.condition,
    language: row.language,
    acquiredAt: row.acquired_at,
  };
};

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
        latest.date::text as current_price_date,
        latest.eur * i.quantity as current_value,
        i.purchase_price_eur * i.quantity as cost_basis,
        (latest.eur - i.purchase_price_eur) * i.quantity as gain,
        case when i.purchase_price_eur > 0
          then ((latest.eur - i.purchase_price_eur) / i.purchase_price_eur) * 100
          else null
        end as gain_percent,
        case when week_price.eur > 0 and latest.eur is not null
          then ((latest.eur - week_price.eur) / week_price.eur) * 100
          else null
        end as change_7d,
        case when month_price.eur > 0 and latest.eur is not null
          then ((latest.eur - month_price.eur) / month_price.eur) * 100
          else null
        end as change_30d,
        week_price.date::text as comparison_7d_date,
        month_price.date::text as comparison_30d_date,
        i.condition,
        i.language,
        i.acquired_at::text
      from app_portfolio_items i
      join cards c on c.scryfall_id = i.scryfall_id
      left join lateral (
        select eur, date
        from prices
        where scryfall_id = c.scryfall_id and source = 'mtgjson'
        order by date desc
        limit 1
      ) latest on true
      left join lateral (
        select eur, date
        from prices
        where scryfall_id = c.scryfall_id
          and source = 'mtgjson'
          and date <= latest.date - interval '7 days'
        order by date desc
        limit 1
      ) week_price on true
      left join lateral (
        select eur, date
        from prices
        where scryfall_id = c.scryfall_id
          and source = 'mtgjson'
          and date <= latest.date - interval '30 days'
        order by date desc
        limit 1
      ) month_price on true
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
  const summary = calculatePortfolioSummary(holdings);

  return {
    holdings,
    summary,
    opportunities: calculateOpportunityAnalytics(holdings, summary.value),
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
  const result = await query(
    `delete from app_portfolio_items
     where id = $1 and user_id = $2
     returning id`,
    [itemId, userId],
  );
  return result.rowCount === 1;
}

export async function updatePortfolioItem(
  userId: string,
  itemId: number,
  input: PortfolioUpdate,
) {
  const result = await query(
    `
      update app_portfolio_items
      set
        quantity = coalesce($1, quantity),
        purchase_price_eur = coalesce($2, purchase_price_eur),
        language = coalesce($3, language),
        updated_at = now()
      where id = $4 and user_id = $5
      returning id
    `,
    [
      input.quantity ?? null,
      input.purchasePrice ?? null,
      input.language ?? null,
      itemId,
      userId,
    ],
  );
  return result.rowCount === 1;
}
