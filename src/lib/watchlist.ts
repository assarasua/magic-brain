import { query } from "@/lib/db";

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
  alert_below_enabled: boolean;
  alert_above_price: string | null;
  alert_above_enabled: boolean;
  below_triggered_at: string | null;
  below_read_at: string | null;
  above_triggered_at: string | null;
  above_read_at: string | null;
};

export async function getWatchlist(userId: string, evaluateAlerts = true) {
  if (evaluateAlerts) await query(
    `
      with latest as (
        select distinct on (scryfall_id) scryfall_id, eur
        from prices
        where source = 'mtgjson'
        order by scryfall_id, date desc
      )
      update app_watchlist_items w
      set
        below_triggered_at = case
          when w.alert_below_enabled
            and w.target_price_eur is not null
            and latest.eur <= w.target_price_eur
            and w.below_triggered_at is null
          then now() else w.below_triggered_at end,
        above_triggered_at = case
          when w.alert_above_enabled
            and w.alert_above_price_eur is not null
            and latest.eur >= w.alert_above_price_eur
            and w.above_triggered_at is null
          then now() else w.above_triggered_at end
      from latest
      where w.user_id = $1 and latest.scryfall_id = w.scryfall_id
    `,
    [userId],
  );

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
        w.alert_below_enabled,
        w.alert_above_price_eur as alert_above_price,
        w.alert_above_enabled,
        w.below_triggered_at::text,
        w.below_read_at::text,
        w.above_triggered_at::text,
        w.above_read_at::text,
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
    alertBelowEnabled: row.alert_below_enabled,
    alertAbovePrice:
      row.alert_above_price === null ? null : Number(row.alert_above_price),
    alertAboveEnabled: row.alert_above_enabled,
    belowTriggeredAt: row.below_triggered_at,
    belowReadAt: row.below_read_at,
    aboveTriggeredAt: row.above_triggered_at,
    aboveReadAt: row.above_read_at,
  }));
}

export async function addWatchlistItem(
  userId: string,
  cardId: string,
  alerts?: {
    targetPrice?: number | null;
    alertBelowEnabled?: boolean;
    alertAbovePrice?: number | null;
    alertAboveEnabled?: boolean;
  },
) {
  await query(
    `
      insert into app_watchlist_items (
        user_id, scryfall_id, target_price_eur, alert_below_enabled,
        alert_above_price_eur, alert_above_enabled
      )
      values ($1, $2, $3, $4, $5, $6)
      on conflict (user_id, scryfall_id)
      do update set
        target_price_eur = case when $7 then excluded.target_price_eur else app_watchlist_items.target_price_eur end,
        alert_below_enabled = case when $8 then excluded.alert_below_enabled else app_watchlist_items.alert_below_enabled end,
        alert_above_price_eur = case when $9 then excluded.alert_above_price_eur else app_watchlist_items.alert_above_price_eur end,
        alert_above_enabled = case when $10 then excluded.alert_above_enabled else app_watchlist_items.alert_above_enabled end,
        below_triggered_at = case
          when $7 or $8 then null else app_watchlist_items.below_triggered_at end,
        below_read_at = case
          when $7 or $8 then null else app_watchlist_items.below_read_at end,
        above_triggered_at = case
          when $9 or $10 then null else app_watchlist_items.above_triggered_at end,
        above_read_at = case
          when $9 or $10 then null else app_watchlist_items.above_read_at end,
        updated_at = now()
    `,
    [
      userId,
      cardId,
      alerts?.targetPrice ?? null,
      alerts?.alertBelowEnabled ?? false,
      alerts?.alertAbovePrice ?? null,
      alerts?.alertAboveEnabled ?? false,
      alerts ? "targetPrice" in alerts : false,
      alerts ? "alertBelowEnabled" in alerts : false,
      alerts ? "alertAbovePrice" in alerts : false,
      alerts ? "alertAboveEnabled" in alerts : false,
    ],
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

export async function updateAlertState(
  userId: string,
  cardId: string,
  direction: "below" | "above",
  action: "dismiss" | "reset",
) {
  const triggeredColumn =
    direction === "below" ? "below_triggered_at" : "above_triggered_at";
  const readColumn = direction === "below" ? "below_read_at" : "above_read_at";
  await query(
    action === "dismiss"
      ? `update app_watchlist_items set ${readColumn} = now(), updated_at = now()
         where user_id = $1 and scryfall_id = $2 and ${triggeredColumn} is not null`
      : `update app_watchlist_items set ${triggeredColumn} = null, ${readColumn} = null, updated_at = now()
         where user_id = $1 and scryfall_id = $2`,
    [userId, cardId],
  );
}
