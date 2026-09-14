import { createHash, timingSafeEqual } from "node:crypto";
import { db, query } from "@/lib/db";
import {
  MAX_PORTFOLIO_LISTS,
  normalizeDatabaseHoldingId,
  type PortfolioBulkRequest,
} from "@/lib/portfolio-list-model";
import {
  calculatePortfolioSaleAmounts,
  calculateOpportunityAnalytics,
  calculatePortfolioSummary,
  classifyPortfolioOpportunity,
  type PortfolioSaleInput,
  type PortfolioOpportunityClassification,
  type PortfolioUpdate,
} from "@/lib/portfolio-model";
import type { PortfolioBatchItem } from "@/lib/portfolio-batch-model";

export type PortfolioHolding = {
  id: number;
  listId: string;
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

export type PortfolioSale = {
  id: number;
  sourceHoldingId: number;
  cardId: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  imageUrl: string | null;
  condition: string;
  language: string;
  purchaseUnitPrice: number;
  quantity: number;
  saleUnitPrice: number;
  acquiredAt: string;
  soldAt: string;
  proceeds: number;
  costBasis: number;
  realizedPnl: number;
  createdAt: string;
};

type HoldingRow = {
  id: string;
  list_id: string;
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

type SaleRow = {
  id: string;
  source_holding_id: string;
  scryfall_id: string;
  card_name: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  image_url: string | null;
  condition: string;
  language: string;
  purchase_unit_price_eur: string;
  quantity: number;
  sale_unit_price_eur: string;
  acquired_at: string;
  sold_at: string;
  proceeds_eur: string;
  cost_basis_eur: string;
  realized_pnl_eur: string;
  created_at: string;
};

const mapSale = (row: SaleRow): PortfolioSale => ({
  id: normalizeDatabaseHoldingId(row.id),
  sourceHoldingId: normalizeDatabaseHoldingId(row.source_holding_id),
  cardId: row.scryfall_id,
  name: row.card_name,
  setCode: row.set_code,
  setName: row.set_name,
  collectorNumber: row.collector_number,
  imageUrl: row.image_url,
  condition: row.condition,
  language: row.language,
  purchaseUnitPrice: Number(row.purchase_unit_price_eur),
  quantity: row.quantity,
  saleUnitPrice: Number(row.sale_unit_price_eur),
  acquiredAt: row.acquired_at,
  soldAt: row.sold_at,
  proceeds: Number(row.proceeds_eur),
  costBasis: Number(row.cost_basis_eur),
  realizedPnl: Number(row.realized_pnl_eur),
  createdAt: row.created_at,
});

const mapHolding = (row: HoldingRow): PortfolioHolding => {
  const change7d = row.change_7d === null ? null : Number(row.change_7d);
  const change30d = row.change_30d === null ? null : Number(row.change_30d);
  const gainPercent =
    row.gain_percent === null ? null : Number(row.gain_percent);

  return {
    id: normalizeDatabaseHoldingId(row.id),
    listId: row.list_id,
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

export type PortfolioList = {
  id: string;
  name: string;
  position: number;
  isDefault: boolean;
  holdingCount: number;
  saleCount: number;
};

type PortfolioListRow = {
  id: string;
  name: string;
  position: number;
  is_default: boolean;
  holding_count: number;
  sale_count: number;
};

const mapList = (row: PortfolioListRow): PortfolioList => ({
  id: row.id,
  name: row.name,
  position: row.position,
  isDefault: row.is_default,
  holdingCount: row.holding_count,
  saleCount: row.sale_count,
});

export async function ensurePortfolioLists(userId: string) {
  await query(
    `
      insert into app_portfolio_lists (user_id, name, position, is_default)
      select id,
        case when locale = 'es' then 'Mi colección' else 'My collection' end,
        0,
        true
      from app_users
      where id = $1
        and not exists (
          select 1 from app_portfolio_lists where user_id = $1
        )
      on conflict do nothing
    `,
    [userId],
  );
}

export async function getPortfolioLists(userId: string) {
  await ensurePortfolioLists(userId);
  const result = await query<PortfolioListRow>(
    `
      select
        list.id::text,
        list.name,
        list.position,
        list.is_default,
        count(item.id)::integer as holding_count,
        (
          select count(*)::integer
          from app_portfolio_sales sale
          where sale.user_id = list.user_id and sale.list_id = list.id
        ) as sale_count
      from app_portfolio_lists list
      left join app_portfolio_items item
        on item.list_id = list.id and item.user_id = list.user_id
      where list.user_id = $1
      group by list.id
      order by list.position, list.created_at, list.id
    `,
    [userId],
  );
  return result.rows.map(mapList);
}

export async function getPortfolio(userId: string, requestedListId?: string) {
  const lists = await getPortfolioLists(userId);
  const selectedList = requestedListId
    ? lists.find((list) => list.id === requestedListId)
    : lists.find((list) => list.isDefault) ?? lists[0];
  if (!selectedList) return null;
  const [{ rows }, historyResult, salesResult, realizedResult] = await Promise.all([
    query<HoldingRow>(
    `
      select
        i.id,
        i.list_id::text,
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
      where i.user_id = $1 and i.list_id = $2
      order by current_value desc nulls last, i.created_at desc
    `,
    [userId, selectedList.id],
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
        where i.user_id = $1 and i.list_id = $2 and p.eur is not null
        group by p.date
        order by p.date
      `,
      [userId, selectedList.id],
    ),
    query<SaleRow>(
      `
        select id::text, source_holding_id::text, scryfall_id::text, card_name,
          set_code, set_name, collector_number, image_url, condition, language,
          purchase_unit_price_eur::text, quantity, sale_unit_price_eur::text,
          acquired_at::text, sold_at::text, proceeds_eur::text,
          cost_basis_eur::text, realized_pnl_eur::text, created_at::text
        from app_portfolio_sales
        where user_id = $1 and list_id = $2
        order by sold_at desc, id desc
        limit 50
      `,
      [userId, selectedList.id],
    ),
    query<{ proceeds: string; cost_basis: string; realized_pnl: string; sale_count: number }>(
      `
        select coalesce(sum(proceeds_eur), 0)::text as proceeds,
          coalesce(sum(cost_basis_eur), 0)::text as cost_basis,
          coalesce(sum(realized_pnl_eur), 0)::text as realized_pnl,
          count(*)::integer as sale_count
        from app_portfolio_sales
        where user_id = $1 and list_id = $2
      `,
      [userId, selectedList.id],
    ),
  ]);

  const holdings = rows.map(mapHolding);
  const activeSummary = calculatePortfolioSummary(holdings);
  const realized = realizedResult.rows[0];
  const summary = {
    ...activeSummary,
    realizedProceeds: Number(realized.proceeds),
    realizedCostBasis: Number(realized.cost_basis),
    realizedPnl: Number(realized.realized_pnl),
    saleCount: realized.sale_count,
  };

  return {
    lists,
    selectedListId: selectedList.id,
    holdings,
    recentSales: salesResult.rows.map(mapSale),
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
    listId?: string;
  },
) {
  await ensurePortfolioLists(userId);
  const result = await query(
    `
      insert into app_portfolio_items (
        user_id, list_id, scryfall_id, quantity, purchase_price_eur,
        condition, language, acquired_at
      )
      select $1, list.id, $3, $4, $5, $6, $7, coalesce($8::date, current_date)
      from app_portfolio_lists list
      where list.user_id = $1
        and (
          ($2::uuid is not null and list.id = $2)
          or ($2::uuid is null and list.is_default)
        )
      returning id
    `,
    [
      userId,
      input.listId ?? null,
      input.cardId,
      input.quantity,
      input.purchasePrice,
      input.condition,
      input.language,
      input.acquiredAt ?? null,
    ],
  );
  return result.rowCount === 1;
}

export async function addPortfolioItemsBatch(
  userId: string,
  items: PortfolioBatchItem[],
  idempotencyKey: string,
) {
  await ensurePortfolioLists(userId);
  const client = await db.connect();
  try {
    await client.query("begin");
    const reservation = await client.query(
      `insert into app_portfolio_batch_requests (user_id, idempotency_key)
       values ($1, $2)
       on conflict (user_id, idempotency_key) do nothing
       returning idempotency_key`,
      [userId, idempotencyKey],
    );
    if (reservation.rowCount === 0) {
      const previous = await client.query<{ response: { count: number; clientIds: string[] } }>(
        `select response
         from app_portfolio_batch_requests
         where user_id = $1 and idempotency_key = $2`,
        [userId, idempotencyKey],
      );
      await client.query("commit");
      const response = previous.rows[0]?.response;
      if (!response) throw new Error("batch_request_incomplete");
      return { ...response, replayed: true };
    }

    for (const item of items) {
      const inserted = await client.query(
        `
          insert into app_portfolio_items (
            user_id, list_id, scryfall_id, quantity, purchase_price_eur,
            condition, language, acquired_at
          )
          select $1, list.id, $3, $4, $5, $6, $7, $8::date
          from app_portfolio_lists list
          where list.user_id = $1 and list.id = $2
          returning id
        `,
        [
          userId,
          item.listId,
          item.cardId,
          item.quantity,
          item.purchasePrice,
          item.condition,
          item.language,
          item.acquiredAt,
        ],
      );
      if (inserted.rowCount !== 1) {
        throw new Error(`invalid_list:${item.clientId}`);
      }
    }

    const response = {
      count: items.reduce((sum, item) => sum + item.quantity, 0),
      clientIds: items.map((item) => item.clientId),
    };
    await client.query(
      `update app_portfolio_batch_requests
       set response = $3::jsonb
       where user_id = $1 and idempotency_key = $2`,
      [userId, idempotencyKey, JSON.stringify(response)],
    );
    await client.query("commit");
    return { ...response, replayed: false };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
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

export async function recordPortfolioSale(
  userId: string,
  itemId: number,
  input: PortfolioSaleInput,
) {
  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query(`select id from app_users where id = $1 for update`, [
      userId,
    ]);
    const replay = await client.query<SaleRow & { request_id: string; list_id: string }>(
      `
        select id::text, request_id::text, list_id::text,
          source_holding_id::text, scryfall_id::text, card_name, set_code,
          set_name, collector_number, image_url, condition, language,
          purchase_unit_price_eur::text, quantity, sale_unit_price_eur::text,
          acquired_at::text, sold_at::text, proceeds_eur::text,
          cost_basis_eur::text, realized_pnl_eur::text, created_at::text
        from app_portfolio_sales
        where user_id = $1 and request_id = $2
      `,
      [userId, input.requestId],
    );
    if (replay.rows[0]) {
      const previous = replay.rows[0];
      const matches =
        previous.list_id === input.listId &&
        normalizeDatabaseHoldingId(previous.source_holding_id) === itemId &&
        previous.quantity === input.quantity &&
        Number(previous.sale_unit_price_eur) === input.saleUnitPrice &&
        previous.sold_at === input.soldAt;
      await client.query(matches ? "commit" : "rollback");
      return matches
        ? { status: "recorded" as const, sale: mapSale(previous), replayed: true }
        : { status: "conflict" as const };
    }

    const holding = await client.query<{
      id: string;
      scryfall_id: string;
      quantity: number;
      purchase_price_eur: string;
      condition: string;
      language: string;
      acquired_at: string;
      name: string;
      set_code: string;
      set_name: string;
      collector_number: string;
      image_url: string | null;
    }>(
      `
        select i.id::text, i.scryfall_id::text, i.quantity,
          i.purchase_price_eur::text, i.condition, i.language,
          i.acquired_at::text, c.name, c.set_code, c.set_name,
          c.collector_number,
          coalesce(c.image_url, c.image_uris->>'normal') as image_url
        from app_portfolio_items i
        join cards c on c.scryfall_id = i.scryfall_id
        where i.id = $1 and i.user_id = $2 and i.list_id = $3
        for update of i
      `,
      [itemId, userId, input.listId],
    );
    const source = holding.rows[0];
    if (!source) {
      await client.query("rollback");
      return { status: "missing" as const };
    }
    if (input.soldAt < source.acquired_at) {
      await client.query("rollback");
      return { status: "invalid_date" as const };
    }
    if (input.quantity > source.quantity) {
      await client.query("rollback");
      return {
        status: "insufficient_quantity" as const,
        availableQuantity: source.quantity,
      };
    }

    const amounts = calculatePortfolioSaleAmounts(
      input.quantity,
      Number(source.purchase_price_eur),
      input.saleUnitPrice,
    );
    const inserted = await client.query<SaleRow>(
      `
        insert into app_portfolio_sales (
          user_id, list_id, request_id, source_holding_id, scryfall_id,
          card_name, set_code, set_name, collector_number, image_url,
          condition, language, purchase_unit_price_eur, quantity,
          sale_unit_price_eur, acquired_at, sold_at, proceeds_eur,
          cost_basis_eur, realized_pnl_eur
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        )
        returning id::text, source_holding_id::text, scryfall_id::text,
          card_name, set_code, set_name, collector_number, image_url,
          condition, language, purchase_unit_price_eur::text, quantity,
          sale_unit_price_eur::text, acquired_at::text, sold_at::text,
          proceeds_eur::text, cost_basis_eur::text, realized_pnl_eur::text,
          created_at::text
      `,
      [
        userId,
        input.listId,
        input.requestId,
        itemId,
        source.scryfall_id,
        source.name,
        source.set_code,
        source.set_name,
        source.collector_number,
        source.image_url,
        source.condition,
        source.language,
        source.purchase_price_eur,
        input.quantity,
        input.saleUnitPrice,
        source.acquired_at,
        input.soldAt,
        amounts.proceeds,
        amounts.costBasis,
        amounts.realizedPnl,
      ],
    );
    if (input.quantity === source.quantity) {
      await client.query(
        `delete from app_portfolio_items
         where id = $1 and user_id = $2 and list_id = $3`,
        [itemId, userId, input.listId],
      );
    } else {
      await client.query(
        `update app_portfolio_items
         set quantity = quantity - $1, updated_at = now()
         where id = $2 and user_id = $3 and list_id = $4`,
        [input.quantity, itemId, userId, input.listId],
      );
    }
    await client.query("commit");
    return {
      status: "recorded" as const,
      sale: mapSale(inserted.rows[0]),
      replayed: false,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function createPortfolioList(userId: string, name: string) {
  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query(`select id from app_users where id = $1 for update`, [
      userId,
    ]);
    const count = await client.query<{ count: number }>(
      `select count(*)::integer as count from app_portfolio_lists where user_id = $1`,
      [userId],
    );
    if (count.rows[0].count >= MAX_PORTFOLIO_LISTS) {
      await client.query("rollback");
      return { status: "limit" as const };
    }
    const inserted = await client.query<PortfolioListRow>(
      `
        insert into app_portfolio_lists (user_id, name, position, is_default)
        select $1, $2, coalesce(max(position) + 1, 0), count(*) = 0
        from app_portfolio_lists where user_id = $1
        returning id::text, name, position, is_default,
          0::integer as holding_count, 0::integer as sale_count
      `,
      [userId, name],
    );
    await client.query("commit");
    return { status: "created" as const, list: mapList(inserted.rows[0]) };
  } catch (error) {
    await client.query("rollback");
    if ((error as { code?: string }).code === "23505") {
      return { status: "duplicate" as const };
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function renamePortfolioList(
  userId: string,
  listId: string,
  name: string,
) {
  try {
    const result = await query(
      `
        update app_portfolio_lists
        set name = $3, updated_at = now()
        where id = $1 and user_id = $2
        returning id
      `,
      [listId, userId, name],
    );
    return result.rowCount === 1 ? "updated" : "missing";
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return "duplicate";
    throw error;
  }
}

export async function reorderPortfolioLists(
  userId: string,
  orderedIds: string[],
) {
  const result = await query(
    `
      with owned as (
        select array_agg(id order by id) as ids
        from app_portfolio_lists where user_id = $1
      ),
      supplied as (
        select array_agg(id order by id) as ids
        from unnest($2::uuid[]) id
      ),
      valid as (
        select 1 from owned, supplied where owned.ids = supplied.ids
      ),
      positions as (
        select id, ordinality - 1 as position
        from unnest($2::uuid[]) with ordinality as value(id, ordinality)
      )
      update app_portfolio_lists list
      set position = positions.position, updated_at = now()
      from positions, valid
      where list.id = positions.id and list.user_id = $1
      returning list.id
    `,
    [userId, orderedIds],
  );
  return result.rowCount === orderedIds.length;
}

export async function deletePortfolioList(
  userId: string,
  listId: string,
  destinationListId?: string,
) {
  const client = await db.connect();
  try {
    await client.query("begin");
    const lists = await client.query<{
      id: string;
      is_default: boolean;
      holding_count: number;
      sale_count: number;
    }>(
      `
        select list.id::text, list.is_default,
          (
            select count(*)::integer
            from app_portfolio_items item
            where item.list_id = list.id and item.user_id = list.user_id
          ) as holding_count,
          (
            select count(*)::integer
            from app_portfolio_sales sale
            where sale.list_id = list.id and sale.user_id = list.user_id
          ) as sale_count
        from app_portfolio_lists list
        where list.user_id = $1
        order by list.position
        for update
      `,
      [userId],
    );
    const source = lists.rows.find((list) => list.id === listId);
    if (!source) {
      await client.query("rollback");
      return "missing" as const;
    }
    if (source.is_default || lists.rows.length === 1) {
      await client.query("rollback");
      return "protected" as const;
    }
    if (source.holding_count > 0 || source.sale_count > 0) {
      const destination = lists.rows.find(
        (list) => list.id === destinationListId && list.id !== listId,
      );
      if (!destination) {
        await client.query("rollback");
        return "destination_required" as const;
      }
      await client.query(
        `update app_portfolio_items set list_id = $1, updated_at = now()
         where user_id = $2 and list_id = $3`,
        [destination.id, userId, listId],
      );
      await client.query(
        `update app_portfolio_sales set list_id = $1
         where user_id = $2 and list_id = $3`,
        [destination.id, userId, listId],
      );
    }
    await client.query(
      `delete from app_portfolio_lists where id = $1 and user_id = $2`,
      [listId, userId],
    );
    await client.query(
      `
        with ordered as (
          select id, row_number() over (order by position, created_at, id) - 1 as position
          from app_portfolio_lists where user_id = $1
        )
        update app_portfolio_lists list set position = ordered.position
        from ordered where list.id = ordered.id
      `,
      [userId],
    );
    await client.query("commit");
    return "deleted" as const;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function bulkManagePortfolio(
  userId: string,
  request: PortfolioBulkRequest,
) {
  const client = await db.connect();
  const requestHash = createHash("sha256")
    .update(JSON.stringify({
      action: request.action,
      holdingIds: [...request.holdingIds].sort((a, b) => a - b),
      sourceListId: request.sourceListId,
      destinationListId: request.destinationListId ?? null,
    }))
    .digest();
  try {
    await client.query("begin");
    await client.query(`select id from app_users where id = $1 for update`, [
      userId,
    ]);
    const previous = await client.query<{
      action: string;
      request_hash: Buffer;
      response: unknown;
    }>(
      `
        select action, request_hash, response from app_portfolio_bulk_operations
        where user_id = $1 and request_id = $2
      `,
      [userId, request.requestId],
    );
    if (previous.rows[0]) {
      if (
        previous.rows[0].action !== request.action ||
        previous.rows[0].request_hash.length !== requestHash.length ||
        !timingSafeEqual(previous.rows[0].request_hash, requestHash)
      ) {
        await client.query("rollback");
        return { status: "conflict" as const };
      }
      await client.query("commit");
      return { status: "ok" as const, result: previous.rows[0].response };
    }
    const sourceList = await client.query(
      `select id from app_portfolio_lists where id = $1 and user_id = $2`,
      [request.sourceListId, userId],
    );
    if (sourceList.rowCount !== 1) {
      await client.query("rollback");
      return { status: "source_list_missing" as const };
    }
    if (
      request.destinationListId &&
      request.destinationListId === request.sourceListId
    ) {
      await client.query("rollback");
      return { status: "invalid_destination" as const };
    }
    if (request.destinationListId) {
      const destination = await client.query(
        `select id from app_portfolio_lists where id = $1 and user_id = $2`,
        [request.destinationListId, userId],
      );
      if (destination.rowCount !== 1) {
        await client.query("rollback");
        return { status: "destination_missing" as const };
      }
    }
    const source = await client.query<{ id: number }>(
      `
        select id from app_portfolio_items
        where user_id = $1 and list_id = $2 and id = any($3::bigint[])
        for update
      `,
      [userId, request.sourceListId, request.holdingIds],
    );
    if (source.rowCount !== request.holdingIds.length) {
      await client.query("rollback");
      return {
        status: "holdings_missing" as const,
        requested: request.holdingIds.length,
        found: source.rowCount ?? 0,
      };
    }
    let affected = 0;
    if (request.action === "move") {
      const result = await client.query(
        `
          update app_portfolio_items set list_id = $1, updated_at = now()
          where user_id = $2 and list_id = $3 and id = any($4::bigint[])
        `,
        [
          request.destinationListId,
          userId,
          request.sourceListId,
          request.holdingIds,
        ],
      );
      affected = result.rowCount ?? 0;
    } else if (request.action === "copy") {
      const result = await client.query(
        `
          insert into app_portfolio_items (
            user_id, list_id, scryfall_id, quantity, purchase_price_eur,
            condition, language, acquired_at, notes
          )
          select user_id, $1, scryfall_id, quantity, purchase_price_eur,
            condition, language, acquired_at, notes
          from app_portfolio_items
          where user_id = $2 and list_id = $3 and id = any($4::bigint[])
        `,
        [
          request.destinationListId,
          userId,
          request.sourceListId,
          request.holdingIds,
        ],
      );
      affected = result.rowCount ?? 0;
    } else {
      const result = await client.query(
        `
          delete from app_portfolio_items
          where user_id = $1 and list_id = $2 and id = any($3::bigint[])
        `,
        [userId, request.sourceListId, request.holdingIds],
      );
      affected = result.rowCount ?? 0;
    }
    const response = {
      action: request.action,
      requested: request.holdingIds.length,
      affected,
      skipped: request.holdingIds.length - affected,
    };
    await client.query(
      `
        insert into app_portfolio_bulk_operations
          (user_id, request_id, action, request_hash, response)
        values ($1, $2, $3, $4, $5::jsonb)
      `,
      [
        userId,
        request.requestId,
        request.action,
        requestHash,
        JSON.stringify(response),
      ],
    );
    await client.query("commit");
    return { status: "ok" as const, result: response };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
