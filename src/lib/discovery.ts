import { query } from "@/lib/db";
import type { UserPreferences } from "@/lib/user-preferences";

type DiscoveryRow = {
  id: string;
  name: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  type_line: string;
  image_url: string;
  price: string;
  change_7d: string;
  change_30d: string;
  released_at: string;
  is_reserved: boolean;
};

export type DiscoveryCard = {
  id: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  typeLine: string;
  imageUrl: string;
  price: number;
  change7d: number;
  change30d: number;
  reserved: boolean;
  matchScore: number;
  rationale: string;
};

export async function getDiscoveryCards(
  userId: string,
  preferences: UserPreferences,
) {
  const values: unknown[] = [userId, preferences.maxCardPrice];
  const conditions = [
    "swipe.scryfall_id is null",
    "priced.price between 2 and $2",
    "priced.image_url is not null",
  ];

  if (preferences.colors.length) {
    values.push(preferences.colors);
    conditions.push(`priced.color_identity && $${values.length}::text[]`);
  }
  if (preferences.rarities.length) {
    values.push(preferences.rarities);
    conditions.push(`priced.rarity = any($${values.length}::text[])`);
  }
  if (preferences.cardTypes.length) {
    values.push(preferences.cardTypes.map((type) => `%${type}%`));
    conditions.push(`priced.type_line ilike any($${values.length}::text[])`);
  }
  if (preferences.reservedOnly) {
    conditions.push("priced.is_reserved");
  }
  if (preferences.marketTrend === "rising") {
    conditions.push("priced.change_7d > 0 and priced.change_30d > 0");
  } else if (preferences.marketTrend === "stable") {
    conditions.push("abs(priced.change_7d) <= 8 and abs(priced.change_30d) <= 20");
  } else if (preferences.marketTrend === "recovering") {
    conditions.push("priced.change_7d > 0 and priced.change_30d < 0");
  }
  if (preferences.releaseEra === "classic") {
    conditions.push("priced.released_at < date '2004-01-01'");
  } else if (preferences.releaseEra === "established") {
    conditions.push("priced.released_at between date '2004-01-01' and date '2018-12-31'");
  } else if (preferences.releaseEra === "recent") {
    conditions.push("priced.released_at >= date '2019-01-01'");
  }

  const { rows } = await query<DiscoveryRow>(
    `
      with dates as (
        select max(date) as latest_date from prices where source = 'mtgjson'
      ),
      priced as (
        select
          c.scryfall_id::text as id,
          c.scryfall_id,
          c.name,
          c.set_code,
          c.set_name,
          c.collector_number,
          c.rarity,
          c.type_line,
          c.color_identity,
          c.released_at,
          coalesce(c.image_url, c.image_uris->>'normal') as image_url,
          current_price.eur as price,
          ((current_price.eur - price_7d.eur) / price_7d.eur) * 100 as change_7d,
          ((current_price.eur - price_30d.eur) / price_30d.eur) * 100 as change_30d,
          exists (
            select 1 from app_reserved_cards reserved
            where reserved.oracle_id = c.oracle_id
          ) as is_reserved
        from cards c
        cross join dates
        join prices current_price
          on current_price.scryfall_id = c.scryfall_id
          and current_price.date = dates.latest_date
          and current_price.source = 'mtgjson'
        join prices price_7d
          on price_7d.scryfall_id = c.scryfall_id
          and price_7d.date = dates.latest_date - interval '7 days'
          and price_7d.source = 'mtgjson'
          and price_7d.eur > 0
        join prices price_30d
          on price_30d.scryfall_id = c.scryfall_id
          and price_30d.date = dates.latest_date - interval '30 days'
          and price_30d.source = 'mtgjson'
          and price_30d.eur > 0
      )
      select
        priced.id, priced.name, priced.set_code, priced.set_name,
        priced.collector_number, priced.rarity, priced.type_line,
        priced.image_url, priced.price, priced.change_7d, priced.change_30d,
        priced.released_at, priced.is_reserved
      from priced
      left join app_card_swipes swipe
        on swipe.user_id = $1 and swipe.scryfall_id = priced.scryfall_id
      where ${conditions.join(" and ")}
      order by abs(priced.change_30d) + abs(priced.change_7d) desc
      limit 400
    `,
    values,
  );

  const riskWeight = {
    preservation: { momentum: 0.2, stability: 1.25 },
    conservative: { momentum: 0.35, stability: 0.9 },
    balanced: { momentum: 0.65, stability: 0.45 },
    growth: { momentum: 0.9, stability: 0.18 },
    aggressive: { momentum: 1.2, stability: -0.05 },
  }[preferences.risk];

  return rows
    .map((row) => {
      const change7d = Number(row.change_7d);
      const change30d = Number(row.change_30d);
      const volatility = Math.abs(change7d - change30d / 4);
      const age = Math.max(
        0,
        (Date.now() - new Date(row.released_at).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000),
      );
      const strategyBoost = {
        diversified: 4,
        momentum: Math.max(0, change7d) * 0.8,
        stability: Math.max(0, 18 - volatility),
        collectible: (row.is_reserved ? 28 : 0) + Math.min(age, 30) * 0.55,
      }[preferences.strategy];
      const score =
        change30d * riskWeight.momentum +
        change7d * riskWeight.momentum * 0.8 -
        volatility * riskWeight.stability +
        strategyBoost;
      const rationale = row.is_reserved
        ? `Reserved List · ${change30d >= 0 ? "+" : ""}${change30d.toFixed(1)}% over 30 days`
        : `${preferences.strategy} match · ${change7d >= 0 ? "+" : ""}${change7d.toFixed(1)}% over 7 days`;

      return {
        id: row.id,
        name: row.name,
        setCode: row.set_code,
        setName: row.set_name,
        collectorNumber: row.collector_number,
        rarity: row.rarity,
        typeLine: row.type_line,
        imageUrl: row.image_url,
        price: Number(row.price),
        change7d,
        change30d,
        reserved: row.is_reserved,
        matchScore: Math.max(1, Math.min(99, Math.round(68 + score / 4))),
        rationale,
      } satisfies DiscoveryCard;
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 20);
}

export async function saveDiscoveryDecision(
  userId: string,
  cardId: string,
  decision: "liked" | "passed",
) {
  await query(
    `
      insert into app_card_swipes (user_id, scryfall_id, decision)
      values ($1, $2, $3)
      on conflict (user_id, scryfall_id)
      do update set decision = excluded.decision, updated_at = now()
    `,
    [userId, cardId, decision],
  );
}

export async function undoDiscoveryDecision(
  userId: string,
  cardId: string,
  removeFromWatchlist: boolean,
) {
  await query(
    `
      with removed as (
        delete from app_card_swipes
        where user_id = $1 and scryfall_id = $2
        returning decision
      )
      delete from app_watchlist_items
      where user_id = $1
        and scryfall_id = $2
        and $3::boolean
        and exists (select 1 from removed where decision = 'liked')
    `,
    [userId, cardId, removeFromWatchlist],
  );
}
