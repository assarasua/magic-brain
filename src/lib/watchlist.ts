import { query } from "@/lib/db";
import type { CatalogCard } from "@/lib/catalog";

type WatchlistRow = {
  id: string;
  name: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  type_line: string | null;
  image_url: string | null;
  cardmarket_id: number | null;
  price: string | null;
  foil_price: string | null;
  change_7d: string | null;
  price_date: string | null;
  target_price: string | null;
};

export async function getWatchlist(userId: string) {
  const { rows } = await query<WatchlistRow>(
    `
      with dates as (
        select max(date) as latest_date from prices where source = 'mtgjson'
      )
      select
        c.scryfall_id::text as id, c.name, c.set_code, c.set_name,
        c.collector_number, c.rarity, c.type_line,
        coalesce(c.image_url, c.image_uris->>'normal') as image_url,
        c.cardmarket_id, current_price.eur as price,
        current_price.eur_foil as foil_price,
        current_price.date::text as price_date,
        w.target_price_eur as target_price,
        case when previous_price.eur > 0
          then ((current_price.eur - previous_price.eur) / previous_price.eur) * 100
          else null
        end as change_7d
      from app_watchlist_items w
      join cards c on c.scryfall_id = w.scryfall_id
      cross join dates
      left join prices current_price
        on current_price.scryfall_id = c.scryfall_id
        and current_price.date = dates.latest_date
        and current_price.source = 'mtgjson'
      left join prices previous_price
        on previous_price.scryfall_id = c.scryfall_id
        and previous_price.date = dates.latest_date - interval '7 days'
        and previous_price.source = 'mtgjson'
      where w.user_id = $1
      order by w.created_at desc
    `,
    [userId],
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    setCode: row.set_code,
    setName: row.set_name,
    collectorNumber: row.collector_number,
    rarity: row.rarity,
    typeLine: row.type_line,
    imageUrl: row.image_url,
    cardmarketId: row.cardmarket_id,
    price: row.price === null ? null : Number(row.price),
    foilPrice: row.foil_price === null ? null : Number(row.foil_price),
    change7d: row.change_7d === null ? null : Number(row.change_7d),
    priceDate: row.price_date,
    targetPrice: row.target_price === null ? null : Number(row.target_price),
  } satisfies CatalogCard & { targetPrice: number | null }));
}

export async function addWatchlistItem(
  userId: string,
  cardId: string,
  targetPrice: number | null,
) {
  await query(
    `
      insert into app_watchlist_items (user_id, scryfall_id, target_price_eur)
      values ($1, $2, $3)
      on conflict (user_id, scryfall_id)
      do update set target_price_eur = excluded.target_price_eur
    `,
    [userId, cardId, targetPrice],
  );
}

export async function addWatchlistItemIfMissing(
  userId: string,
  cardId: string,
) {
  const result = await query(
    `
      insert into app_watchlist_items (user_id, scryfall_id, target_price_eur)
      values ($1, $2, null)
      on conflict (user_id, scryfall_id) do nothing
      returning scryfall_id
    `,
    [userId, cardId],
  );
  return result.rowCount === 1;
}

export async function deleteWatchlistItem(userId: string, cardId: string) {
  await query(
    `delete from app_watchlist_items where user_id = $1 and scryfall_id = $2`,
    [userId, cardId],
  );
}
