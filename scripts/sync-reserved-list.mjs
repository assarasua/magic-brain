import pg from "pg";

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

let nextPage =
  "https://api.scryfall.com/cards/search?q=is%3Areserved&unique=cards&order=name";
const reservedCards = [];

while (nextPage) {
  const response = await fetch(nextPage, {
    headers: {
      Accept: "application/json",
      "User-Agent": "MagicBrain/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`Scryfall returned ${response.status}`);
  }
  const page = await response.json();
  reservedCards.push(
    ...page.data
      .filter((card) => card.oracle_id)
      .map((card) => ({ oracleId: card.oracle_id, name: card.name })),
  );
  nextPage = page.has_more ? page.next_page : null;
  if (nextPage) await new Promise((resolve) => setTimeout(resolve, 100));
}

await client.connect();
try {
  await client.query("begin");
  await client.query("delete from app_reserved_cards");
  for (let index = 0; index < reservedCards.length; index += 100) {
    const batch = reservedCards.slice(index, index + 100);
    const values = batch.flatMap((card) => [card.oracleId, card.name]);
    const placeholders = batch
      .map((_, position) => `($${position * 2 + 1}, $${position * 2 + 2})`)
      .join(",");
    await client.query(
      `insert into app_reserved_cards (oracle_id, name) values ${placeholders}
       on conflict (oracle_id) do update set name = excluded.name, synced_at = now()`,
      values,
    );
  }
  await client.query("commit");
  console.log(`Synced ${reservedCards.length} Reserved List cards.`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
