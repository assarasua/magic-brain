import pg from "pg";

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const response = await fetch("https://api.scryfall.com/sets", {
  headers: {
    Accept: "application/json",
    "User-Agent": "MagicBrain/1.0 set-catalogue-sync",
  },
});

if (!response.ok) {
  throw new Error(`Scryfall sets request failed (${response.status})`);
}

const payload = await response.json();
if (!Array.isArray(payload.data)) {
  throw new Error("Scryfall returned an invalid sets payload");
}

const sets = payload.data.map((set) => ({
  code: String(set.code).toLowerCase(),
  scryfallId: set.id ?? null,
  name: String(set.name),
  releasedAt: set.released_at ?? null,
  setType: String(set.set_type),
  digital: set.digital === true,
  tabletop: set.digital !== true,
  parentSetCode: set.parent_set_code
    ? String(set.parent_set_code).toLowerCase()
    : null,
  cardCount: Number(set.card_count) || 0,
  printedSize:
    set.printed_size === null || set.printed_size === undefined
      ? null
      : Number(set.printed_size),
  iconSvgUri: set.icon_svg_uri ?? null,
  scryfallUri: set.scryfall_uri ?? null,
  searchUri: set.search_uri ?? null,
}));

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query("begin");

  await client.query(
    `
      with incoming as (
        select *
        from jsonb_to_recordset($1::jsonb) as value(
          code text,
          "scryfallId" uuid,
          name text,
          "releasedAt" date,
          "setType" text,
          digital boolean,
          tabletop boolean,
          "parentSetCode" text,
          "cardCount" integer,
          "printedSize" integer,
          "iconSvgUri" text,
          "scryfallUri" text,
          "searchUri" text
        )
      )
        insert into app_sets (
          code, scryfall_id, name, released_at, set_type, digital, tabletop,
          parent_set_code, card_count, printed_size, icon_svg_uri,
          scryfall_uri, search_uri, synced_at
        )
        select
          code, "scryfallId", name, "releasedAt", "setType", digital, tabletop,
          "parentSetCode", "cardCount", "printedSize", "iconSvgUri",
          "scryfallUri", "searchUri", now()
        from incoming
        on conflict (code) do update set
          scryfall_id = excluded.scryfall_id,
          name = excluded.name,
          released_at = excluded.released_at,
          set_type = excluded.set_type,
          digital = excluded.digital,
          tabletop = excluded.tabletop,
          parent_set_code = excluded.parent_set_code,
          card_count = excluded.card_count,
          printed_size = excluded.printed_size,
          icon_svg_uri = excluded.icon_svg_uri,
          scryfall_uri = excluded.scryfall_uri,
          search_uri = excluded.search_uri,
          synced_at = now()
    `,
    [JSON.stringify(sets)],
  );

  await client.query("commit");
  console.log(`Synced ${sets.length} sets from Scryfall.`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
