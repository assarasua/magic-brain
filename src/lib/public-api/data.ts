import { query } from "@/lib/db";
import { decodeCursor, encodeCursor } from "./core";

type CardCursor = { name: string; id: string };
type SetCursor = { releasedAt: string; code: string };

type PublicCardRow = {
  id: string;
  oracle_id: string | null;
  name: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  language: string;
  rarity: string;
  type_line: string | null;
  color_identity: string[];
  released_at: string | null;
  image_url: string | null;
  cardmarket_id: number | null;
  price_date: string | null;
  eur: string | null;
  eur_foil: string | null;
  source: string | null;
};

function pricesFrom(row: PublicCardRow) {
  if (!row.source || !row.price_date) return [];
  return [
    ...(row.eur === null
      ? []
      : [
          {
            amount: Number(row.eur),
            currency: "EUR",
            finish: "nonfoil",
            source: row.source,
            observedAt: row.price_date,
          },
        ]),
    ...(row.eur_foil === null
      ? []
      : [
          {
            amount: Number(row.eur_foil),
            currency: "EUR",
            finish: "foil",
            source: row.source,
            observedAt: row.price_date,
          },
        ]),
  ];
}

function mapCard(row: PublicCardRow) {
  return {
    id: row.id,
    oracleId: row.oracle_id,
    name: row.name,
    set: { code: row.set_code, name: row.set_name },
    collectorNumber: row.collector_number,
    language: row.language,
    rarity: row.rarity,
    typeLine: row.type_line,
    colorIdentity: row.color_identity,
    releasedAt: row.released_at,
    imageUrl: row.image_url,
    identifiers: { cardmarketId: row.cardmarket_id },
    latestPrices: pricesFrom(row),
  };
}

const cardSelect = `
  c.scryfall_id::text as id,
  c.oracle_id::text as oracle_id,
  c.name,
  c.set_code,
  c.set_name,
  c.collector_number,
  c.lang as language,
  c.rarity,
  c.type_line,
  c.color_identity,
  c.released_at::text,
  coalesce(c.image_url, c.image_uris->>'normal') as image_url,
  c.cardmarket_id,
  latest.price_date::text,
  latest.eur,
  latest.eur_foil,
  latest.source
`;

export async function listPublicCards(options: {
  limit: number;
  cursor: string | null;
  search: string | null;
  setCode: string | null;
  rarity: string | null;
  language: string | null;
}) {
  const cursor = decodeCursor<CardCursor>(options.cursor, ["name", "id"]);
  const values: unknown[] = [];
  const conditions: string[] = [];
  const add = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (options.search) {
    const escaped = options.search.replace(/[\\%_]/g, "\\$&");
    const parameter = add(`%${escaped}%`);
    conditions.push(
      `(c.name ilike ${parameter} escape '\\' or c.set_name ilike ${parameter} escape '\\')`,
    );
  }
  if (options.setCode) {
    conditions.push(`lower(c.set_code) = ${add(options.setCode.toLowerCase())}`);
  }
  if (options.rarity) {
    conditions.push(`lower(c.rarity) = ${add(options.rarity.toLowerCase())}`);
  }
  if (options.language) {
    conditions.push(`lower(c.lang) = ${add(options.language.toLowerCase())}`);
  }
  if (cursor) {
    const nameParameter = add(cursor.name);
    const idParameter = add(cursor.id);
    conditions.push(
      `(lower(c.name) > ${nameParameter} or (lower(c.name) = ${nameParameter} and c.scryfall_id > ${idParameter}::uuid))`,
    );
  }

  values.push(options.limit + 1);
  const result = await query<PublicCardRow>(
    `
      select ${cardSelect}
      from cards c
      left join latest_card_prices latest
        on latest.scryfall_id = c.scryfall_id
        and latest.source = 'mtgjson'
      ${conditions.length ? `where ${conditions.join(" and ")}` : ""}
      order by lower(c.name), c.scryfall_id
      limit $${values.length}
    `,
    values,
  );
  const hasMore = result.rows.length > options.limit;
  const rows = result.rows.slice(0, options.limit);
  const last = rows.at(-1);
  return {
    cards: rows.map(mapCard),
    nextCursor:
      hasMore && last
        ? encodeCursor({ name: last.name.toLowerCase(), id: last.id })
        : null,
  };
}

export async function getPublicCard(id: string) {
  const result = await query<PublicCardRow>(
    `
      select ${cardSelect}
      from cards c
      left join latest_card_prices latest
        on latest.scryfall_id = c.scryfall_id
        and latest.source = 'mtgjson'
      where c.scryfall_id = $1
    `,
    [id],
  );
  return result.rows[0] ? mapCard(result.rows[0]) : null;
}

export async function getPublicPriceHistory(options: {
  cardId: string;
  from: string;
  to: string;
  finish: "all" | "nonfoil" | "foil";
}) {
  const result = await query<{
    date: string;
    source: string;
    eur: string | null;
    eur_foil: string | null;
  }>(
    `
      select date::text, source, eur, eur_foil
      from prices
      where scryfall_id = $1
        and source = 'mtgjson'
        and date between $2::date and $3::date
      order by date, source
    `,
    [options.cardId, options.from, options.to],
  );
  return result.rows.flatMap((row) => [
    ...(options.finish !== "foil" && row.eur !== null
      ? [{
          amount: Number(row.eur),
          currency: "EUR",
          finish: "nonfoil" as const,
          source: row.source,
          observedAt: row.date,
        }]
      : []),
    ...(options.finish !== "nonfoil" && row.eur_foil !== null
      ? [{
          amount: Number(row.eur_foil),
          currency: "EUR",
          finish: "foil" as const,
          source: row.source,
          observedAt: row.date,
        }]
      : []),
  ]);
}

export async function getLatestPublicPrices(ids: string[]) {
  const result = await query<PublicCardRow>(
    `
      select ${cardSelect}
      from cards c
      left join latest_card_prices latest
        on latest.scryfall_id = c.scryfall_id
        and latest.source = 'mtgjson'
      where c.scryfall_id = any($1::uuid[])
      order by array_position($1::uuid[], c.scryfall_id)
    `,
    [ids],
  );
  return result.rows.map((row) => ({
    cardId: row.id,
    prices: pricesFrom(row),
  }));
}

export async function listPublicSets(options: {
  limit: number;
  cursor: string | null;
  tabletop: boolean | null;
  search: string | null;
}) {
  const cursor = decodeCursor<SetCursor>(options.cursor, ["releasedAt", "code"]);
  const values: unknown[] = [];
  const conditions: string[] = [];
  if (options.search) {
    const escaped = options.search.replace(/[\\%_]/g, "\\$&");
    values.push(`%${escaped}%`);
    conditions.push(
      `(code ilike $${values.length} escape '\\' or name ilike $${values.length} escape '\\')`,
    );
  }
  if (options.tabletop !== null) {
    values.push(options.tabletop);
    conditions.push(`tabletop = $${values.length}`);
  }
  if (cursor) {
    values.push(cursor.releasedAt, cursor.code);
    conditions.push(
      `(coalesce(released_at, date '0001-01-01') < $${values.length - 1}::date or (coalesce(released_at, date '0001-01-01') = $${values.length - 1}::date and code > $${values.length}))`,
    );
  }
  values.push(options.limit + 1);
  const result = await query<{
    code: string;
    name: string;
    released_at: string | null;
    set_type: string;
    digital: boolean;
    tabletop: boolean;
    parent_set_code: string | null;
    card_count: number;
  }>(
    `
      select code, name, released_at::text, set_type, digital, tabletop,
             parent_set_code, card_count
      from app_sets
      ${conditions.length ? `where ${conditions.join(" and ")}` : ""}
      order by coalesce(released_at, date '0001-01-01') desc, code
      limit $${values.length}
    `,
    values,
  );
  const hasMore = result.rows.length > options.limit;
  const rows = result.rows.slice(0, options.limit);
  const last = rows.at(-1);
  return {
    sets: rows.map((row) => ({
      code: row.code,
      name: row.name,
      releasedAt: row.released_at,
      setType: row.set_type,
      digital: row.digital,
      tabletop: row.tabletop,
      parentSetCode: row.parent_set_code,
      cardCount: row.card_count,
    })),
    nextCursor:
      hasMore && last
        ? encodeCursor({
            releasedAt: last.released_at ?? "0001-01-01",
            code: last.code,
          })
        : null,
  };
}
