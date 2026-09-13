import { query } from "@/lib/db";

export type CatalogCard = {
  id: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  typeLine: string | null;
  imageUrl: string | null;
  cardmarketId: number | null;
  price: number | null;
  foilPrice: number | null;
  change7d: number | null;
  change30d?: number | null;
  priceDate: string | null;
};

type CatalogRow = {
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
  change_30d?: string | null;
  price_date: string | null;
};

export type CatalogFilters = {
  page: number;
  limit: number;
  search?: string;
  rarity?: string;
  setCode?: string;
  color?: string;
  language?: string;
  type?: string;
  minPrice?: number;
  maxPrice?: number;
  foilOnly?: boolean;
  reservedOnly?: boolean;
  sort?: "price_desc" | "price_asc" | "name_asc" | "release_desc" | "change_desc";
};

const mapCard = (row: CatalogRow): CatalogCard => ({
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
  change30d: row.change_30d == null ? null : Number(row.change_30d),
  priceDate: row.price_date,
});

export async function getCatalogCard(cardId: string) {
  const { rows } = await query<CatalogRow>(
    `
      with dates as (
        select max(date) as latest_date from prices where source = 'mtgjson'
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
        current_price.eur as price,
        current_price.eur_foil as foil_price,
        current_price.date::text as price_date,
        case
          when previous_price.eur > 0 and current_price.eur is not null
          then ((current_price.eur - previous_price.eur) / previous_price.eur) * 100
          else null
        end as change_7d
      from cards c
      cross join dates
      left join prices current_price
        on current_price.scryfall_id = c.scryfall_id
        and current_price.date = dates.latest_date
        and current_price.source = 'mtgjson'
      left join prices previous_price
        on previous_price.scryfall_id = c.scryfall_id
        and previous_price.date = dates.latest_date - interval '7 days'
        and previous_price.source = 'mtgjson'
      where c.scryfall_id = $1
      limit 1
    `,
    [cardId],
  );
  return rows[0] ? mapCard(rows[0]) : null;
}

export async function getCatalog(filters: CatalogFilters) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let searchOrder = "";

  if (filters.search) {
    const normalized = filters.search.trim().toLowerCase();
    values.push(normalized, `%${normalized}%`);
    const exactPosition = values.length - 1;
    const containsPosition = values.length;
    conditions.push(
      `(
        lower(c.name) like $${containsPosition}
        or lower(c.set_name) like $${containsPosition}
        or lower(c.set_code) = $${exactPosition}
        ${normalized.length >= 3
          ? `or lower(c.name) % $${exactPosition} or lower(c.set_name) % $${exactPosition}`
          : ""}
      )`,
    );
    searchOrder = `
      case
        when lower(c.name) = $${exactPosition} then 0
        when lower(c.set_code) = $${exactPosition} then 1
        when lower(c.name) like $${exactPosition} || '%' then 2
        when lower(c.name) like $${containsPosition} then 3
        when lower(c.set_name) like $${containsPosition} then 4
        else 5
      end,
      similarity(lower(c.name), $${exactPosition}) desc,
    `;
  }

  if (filters.rarity) {
    values.push(filters.rarity.toLowerCase());
    conditions.push(`c.rarity = $${values.length}`);
  }

  if (filters.setCode) {
    values.push(filters.setCode.toLowerCase());
    conditions.push(`c.set_code = $${values.length}`);
  }

  if (filters.color) {
    values.push(filters.color.toUpperCase());
    conditions.push(`$${values.length} = any(c.color_identity)`);
  }

  if (filters.language) {
    values.push(filters.language.toLowerCase());
    conditions.push(`c.lang = $${values.length}`);
  }

  if (filters.type) {
    values.push(`%${filters.type.trim()}%`);
    conditions.push(`c.type_line ilike $${values.length}`);
  }

  if (filters.minPrice !== undefined) {
    values.push(filters.minPrice);
    conditions.push(`current_price.eur >= $${values.length}`);
  }

  if (filters.maxPrice !== undefined) {
    values.push(filters.maxPrice);
    conditions.push(`current_price.eur <= $${values.length}`);
  }

  if (filters.foilOnly) {
    conditions.push(`current_price.eur_foil is not null`);
  }

  if (filters.reservedOnly) {
    conditions.push(
      `exists (select 1 from app_reserved_cards reserved where reserved.oracle_id = c.oracle_id)`,
    );
  }

  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  const orderBy = {
    price_desc: "price desc nulls last, c.name asc",
    price_asc: "price asc nulls last, c.name asc",
    name_asc: "c.name asc, c.released_at desc",
    release_desc: "c.released_at desc nulls last, c.name asc",
    change_desc: "change_7d desc nulls last, c.name asc",
  }[filters.sort ?? "price_desc"];

  const offset = (filters.page - 1) * filters.limit;
  const dataValues = [...values, filters.limit, offset];
  const limitPosition = dataValues.length - 1;
  const offsetPosition = dataValues.length;

  const dataSql = `
    with dates as (
      select max(date) as latest_date from prices where source = 'mtgjson'
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
      current_price.eur as price,
      current_price.eur_foil as foil_price,
      current_price.date::text as price_date,
      case
        when previous_price.eur > 0 and current_price.eur is not null
        then ((current_price.eur - previous_price.eur) / previous_price.eur) * 100
        else null
      end as change_7d
    from cards c
    cross join dates
    left join prices current_price
      on current_price.scryfall_id = c.scryfall_id
      and current_price.date = dates.latest_date
      and current_price.source = 'mtgjson'
    left join prices previous_price
      on previous_price.scryfall_id = c.scryfall_id
      and previous_price.date = dates.latest_date - interval '7 days'
      and previous_price.source = 'mtgjson'
    ${where}
    order by ${searchOrder} ${orderBy}
    limit $${limitPosition} offset $${offsetPosition}
  `;

  const needsPriceJoin =
    filters.minPrice !== undefined ||
    filters.maxPrice !== undefined ||
    filters.foilOnly;
  const countSql = needsPriceJoin
    ? `
      with dates as (
        select max(date) as latest_date from prices where source = 'mtgjson'
      )
      select count(*)::int as count
      from cards c
      cross join dates
      left join prices current_price
        on current_price.scryfall_id = c.scryfall_id
        and current_price.date = dates.latest_date
        and current_price.source = 'mtgjson'
      ${where}
    `
    : `select count(*)::int as count from cards c ${where}`;

  const [cardsResult, countResult] = await Promise.all([
    query<CatalogRow>(dataSql, dataValues),
    query<{ count: number }>(countSql, values),
  ]);

  return {
    cards: cardsResult.rows.map(mapCard),
    total: countResult.rows[0]?.count ?? 0,
    page: filters.page,
    pageSize: filters.limit,
    totalPages: Math.ceil((countResult.rows[0]?.count ?? 0) / filters.limit),
  };
}

export async function searchCatalog(
  search: string,
  limit = 8,
  setCode?: string,
) {
  const normalized = search.trim().toLowerCase();
  if (normalized.length < 2) return [];
  const fuzzyClause = normalized.length >= 3
    ? "or lower(c.name) % $1 or lower(c.set_name) % $1"
    : "";
  const setClause = setCode ? "and lower(c.set_code) = $4" : "";

  const { rows } = await query<CatalogRow>(
    `
      with dates as (
        select max(date) as latest_date from prices where source = 'mtgjson'
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
        latest.eur as price,
        latest.eur_foil as foil_price,
        latest.date::text as price_date,
        null::numeric as change_7d
      from cards c
      cross join dates
      left join prices latest
        on latest.scryfall_id = c.scryfall_id
        and latest.source = 'mtgjson'
        and latest.date = dates.latest_date
      where
        (
          lower(c.name) like $2
          or lower(c.set_name) like $2
          or lower(c.set_code) = $1
          ${fuzzyClause}
        )
        ${setClause}
      order by
        case
          when lower(c.name) = $1 then 0
          when lower(c.set_code) = $1 then 1
          when lower(c.name) like $1 || '%' then 2
          when lower(c.name) like $2 then 3
          when lower(c.set_name) like $2 then 4
          else 5
        end,
        similarity(lower(c.name), $1) desc,
        latest.eur desc nulls last,
        c.released_at desc nulls last
      limit $3
    `,
    setCode
      ? [normalized, `%${normalized}%`, limit, setCode.toLowerCase()]
      : [normalized, `%${normalized}%`, limit],
  );

  return rows.map(mapCard);
}

export async function getMarketMovers(
  limit = 8,
  direction: "gainers" | "losers" = "gainers",
  days = 7,
  setCode?: string,
) {
  const directionFilter = direction === "losers" ? "< 0" : "> 0";
  const order = direction === "losers" ? "asc" : "desc";
  const { rows } = await query<CatalogRow>(
    `
      with dates as (
        select
          max(date) as latest_date,
          (
            select max(previous.date)
            from prices previous
            where previous.source = 'mtgjson'
              and previous.date <= (
                select max(current.date) from prices current where current.source = 'mtgjson'
              ) - $2::integer
          ) as previous_date,
          (
            select max(previous.date)
            from prices previous
            where previous.source = 'mtgjson'
              and previous.date <= (
                select max(current.date) from prices current where current.source = 'mtgjson'
              ) - 30
          ) as month_date
        from prices
        where source = 'mtgjson'
      ),
      movers as (
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
          current_price.eur as price,
          current_price.eur_foil as foil_price,
          current_price.date::text as price_date,
          ((current_price.eur - previous_price.eur) / previous_price.eur) * 100 as change_7d,
          case when month_price.eur > 0
            then ((current_price.eur - month_price.eur) / month_price.eur) * 100
            else null end as change_30d
        from dates
        join prices current_price
          on current_price.date = dates.latest_date
          and current_price.source = 'mtgjson'
        join prices previous_price
          on previous_price.scryfall_id = current_price.scryfall_id
          and previous_price.date = dates.previous_date
          and previous_price.source = 'mtgjson'
        left join prices month_price
          on month_price.scryfall_id = current_price.scryfall_id
          and month_price.date = dates.month_date
          and month_price.source = 'mtgjson'
        join cards c on c.scryfall_id = current_price.scryfall_id
        where current_price.eur between 2 and 5000
          and previous_price.eur >= 2
          and ($3::text is null or lower(c.set_code) = $3)
      )
      select
        *
      from movers
      where change_7d between -80 and 200
        and change_7d ${directionFilter}
      order by change_7d ${order}
      limit $1
    `,
    [limit, days, setCode?.toLowerCase() ?? null],
  );

  return rows.map(mapCard);
}

export async function getMarketAnalytics(days = 7) {
  const [breadthResult, historyResult] = await Promise.all([
    query<{
      tracked_cards: string;
      advancers: string;
      decliners: string;
      unchanged: string;
      average_return: string | null;
      median_return: string | null;
      dispersion: string | null;
      strong_gainers: string;
      strong_losers: string;
    }>(
      `
        with dates as (
          select
            max(date) as latest_date,
            (
              select max(previous.date)
              from prices previous
              where previous.source = 'mtgjson'
                and previous.date <= (
                  select max(current.date)
                  from prices current
                  where current.source = 'mtgjson'
                ) - $1::integer
            ) as previous_date
          from prices
          where source = 'mtgjson'
        ),
        returns as (
          select
            ((current_price.eur - previous_price.eur) / previous_price.eur) * 100 as return_percent
          from dates
          join prices current_price
            on current_price.date = dates.latest_date
            and current_price.source = 'mtgjson'
          join prices previous_price
            on previous_price.scryfall_id = current_price.scryfall_id
            and previous_price.date = dates.previous_date
            and previous_price.source = 'mtgjson'
          where current_price.eur between 2 and 5000
            and previous_price.eur >= 2
        )
        select
          count(*)::text as tracked_cards,
          count(*) filter (where return_percent > 0.25)::text as advancers,
          count(*) filter (where return_percent < -0.25)::text as decliners,
          count(*) filter (where return_percent between -0.25 and 0.25)::text as unchanged,
          avg(return_percent)::text as average_return,
          percentile_cont(0.5) within group (order by return_percent)::text as median_return,
          stddev_pop(return_percent)::text as dispersion,
          count(*) filter (where return_percent >= 10)::text as strong_gainers,
          count(*) filter (where return_percent <= -10)::text as strong_losers
        from returns
        where return_percent between -80 and 200
      `,
      [days],
    ),
    query<{ date: string; median_price: string }>(
      `
        select
          date::text,
          percentile_cont(0.5) within group (order by eur)::text as median_price
        from prices
        where source = 'mtgjson'
          and date >= current_date - $1::integer
          and eur between 2 and 5000
        group by date
        order by date
      `,
      [Math.min(days, 90)],
    ),
  ]);

  const breadth = breadthResult.rows[0];
  const history = historyResult.rows.map((point) => ({
    date: point.date,
    value: Number(point.median_price),
  }));
  const baseline = history[0]?.value ?? 1;

  return {
    summary: {
      trackedCards: Number(breadth?.tracked_cards ?? 0),
      advancers: Number(breadth?.advancers ?? 0),
      decliners: Number(breadth?.decliners ?? 0),
      unchanged: Number(breadth?.unchanged ?? 0),
      averageReturn: Number(breadth?.average_return ?? 0),
      medianReturn: Number(breadth?.median_return ?? 0),
      dispersion: Number(breadth?.dispersion ?? 0),
      strongGainers: Number(breadth?.strong_gainers ?? 0),
      strongLosers: Number(breadth?.strong_losers ?? 0),
    },
    index: history.map((point) => ({
      date: point.date,
      value: baseline > 0 ? (point.value / baseline) * 100 : 100,
    })),
  };
}

export async function getPriceHistory(cardId: string, days: number) {
  const { rows } = await query<{
    date: string;
    eur: string | null;
    eur_foil: string | null;
  }>(
    `
      select date::text, eur, eur_foil
      from prices
      where scryfall_id = $1
        and source = 'mtgjson'
        and date >= current_date - $2::integer
      order by date asc
    `,
    [cardId, days],
  );

  return rows.map((row) => ({
    date: row.date,
    eur: row.eur === null ? null : Number(row.eur),
    eurFoil: row.eur_foil === null ? null : Number(row.eur_foil),
  }));
}
