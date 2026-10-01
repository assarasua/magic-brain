import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createPriceHistoryReader } from "../src/lib/price-history-core.ts";

// Opt in explicitly. An isolated schema is created in a rolled-back transaction;
// no application table is changed, even when the connection targets production.
describe("price history database contract", {
  skip: process.env.PRICE_HISTORY_DATABASE_TEST !== "1",
}, () => {
  const cardId = "00000000-0000-4000-8000-000000000001";
  const otherId = "00000000-0000-4000-8000-000000000002";
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  });
  const readHistory = createPriceHistoryReader((sql, values) => client.query(sql, values));

  before(async () => {
    await client.connect();
    await client.query("begin");
    const schema = `price_history_test_${randomBytes(6).toString("hex")}`;
    await client.query(`create schema ${schema}`);
    await client.query(`set local search_path to ${schema}`);
    await client.query("create table cards(scryfall_id uuid primary key)");
    await client.query("insert into cards values ($1), ($2)", [cardId, otherId]);
    await client.query(`create table prices (
      scryfall_id uuid, date date, source text, eur numeric, eur_foil numeric, usd numeric,
      primary key(scryfall_id, date, source)
    )`);
    const latestMigration = await readFile(new URL("../db/011_public_api.sql", import.meta.url), "utf8");
    await client.query(latestMigration.split("create index if not exists idx_cards_public_cursor")[0]);
    await client.query(await readFile(new URL("../db/036_price_retention.sql", import.meta.url), "utf8"));
  });

  beforeEach(async () => {
    await client.query("truncate prices, monthly_card_prices, app_price_change_snapshots, app_price_retention_state, latest_card_prices");
    await client.query("insert into app_price_retention_state values (true, '-infinity', now())");
  });

  after(async () => {
    await client.query("rollback");
    await client.end();
  });

  it("includes exactly 30 calendar days, excludes future prices and other cards/sources", async () => {
    await client.query(`insert into prices (scryfall_id, date, source, eur, eur_foil)
      select $1, current_date - days, 'mtgjson', days, null
      from generate_series(0, 35) days`, [cardId]);
    await client.query(`insert into prices (scryfall_id, date, source, eur, eur_foil) values
      ($1, current_date + 1, 'mtgjson', 999, null),
      ($1, current_date, 'other', 999, null),
      ($2, current_date, 'mtgjson', 999, null)`, [cardId, otherId]);
    const history = await readHistory(cardId, "daily");
    assert.equal(history.length, 30);
    assert.equal(history[0].eur, 29);
    assert.equal(history.at(-1).eur, 0);
    assert.equal(history.at(-1).observations, 1);
    assert.equal(history.at(-1).eurFoil, null);
    assert.equal(history.at(-1).foilObservations, 0);
  });

  it("averages the whole calendar month independently for each finish, excluding nulls", async () => {
    await client.query(`insert into prices (scryfall_id, date, source, eur, eur_foil)
      select $1, (date_trunc('month', current_date) - interval '2 months')::date + day,
        'mtgjson', eur, foil
      from (values (0, 10, null), (1, null, 6), (2, 20, null)) p(day, eur, foil)`, [cardId]);
    const history = await readHistory(cardId, "monthly");
    assert.equal(history.length, 1);
    assert.ok(history[0].date.endsWith("-01"));
    assert.equal(history[0].eur, 15);
    assert.equal(history[0].eurFoil, 6);
    assert.equal(history[0].observations, 2);
    assert.equal(history[0].foilObservations, 1);
    assert.ok(history[0].expectedDays >= 28);
    assert.ok(history[0].lastObservedAt.endsWith("-03"));
  });

  it("preserves missing values and zero, and does not invent missing dates or months", async () => {
    await client.query(`insert into prices (scryfall_id, date, source, eur, eur_foil) values
      ($1, (date_trunc('month', current_date) - interval '2 months')::date, 'mtgjson', null, 0),
      ($1, current_date, 'mtgjson', 0, null)`, [cardId]);
    const monthly = await readHistory(cardId, "monthly");
    assert.equal(monthly.length, 2);
    assert.equal(monthly[0].eur, null);
    assert.equal(monthly[0].observations, 0);
    assert.equal(monthly[0].eurFoil, 0);
    assert.equal(monthly[0].foilObservations, 1);
    assert.equal(monthly[1].eur, 0);
    assert.equal(monthly[1].observations, 1);
    assert.ok(monthly[1].observations < monthly[1].expectedDays);
    const daily = await readHistory(cardId);
    assert.equal(daily.length, 1);
    assert.equal(daily[0].eur, 0);
  });

  it("keeps monthly history older than a year and groups years separately", async () => {
    await client.query(`insert into prices (scryfall_id, date, source, eur, eur_foil) values
      ($1, (date_trunc('month', current_date) - interval '13 months')::date, 'mtgjson', 5, null),
      ($1, (date_trunc('month', current_date) - interval '1 month')::date, 'mtgjson', 15, null)`, [cardId]);
    const monthly = await readHistory(cardId, "monthly");
    assert.equal(monthly.length, 2);
    assert.deepEqual(monthly.map((point) => point.eur), [5, 15]);
    assert.notEqual(monthly[0].date.slice(0, 4), monthly[1].date.slice(0, 4));
  });

  it("compacts incrementally without changing weighted monthly averages or counting replayed imports twice", async () => {
    await client.query(`insert into prices (scryfall_id, date, source, eur, eur_foil, usd)
      select $1, current_date - days, 'mtgjson', days + 1,
        case when days % 3 = 0 then days * 2 end, days + 5
      from generate_series(0, 45) days`, [cardId]);
    const before = await readHistory(cardId, "monthly");
    let archived = 0;
    for (;;) {
      const count = Number((await client.query("select compact_price_history_batch() as count")).rows[0].count);
      archived += count;
      if (!count) break;
    }
    assert.equal(archived, 16);
    assert.deepEqual(await readHistory(cardId, "monthly"), before);
    assert.equal((await readHistory(cardId, "daily")).length, 30);
    const extraCurrency = await client.query("select sum(observation_count)::integer as count from monthly_card_prices where currency='USD'");
    assert.equal(extraCurrency.rows[0].count, 16);
    const replay = await client.query(`insert into prices (scryfall_id, date, source, eur)
      values ($1, current_date - 40, 'mtgjson', 999)`, [cardId]);
    assert.equal(replay.rowCount, 0);
    assert.deepEqual(await readHistory(cardId, "monthly"), before);
    assert.equal(Number((await client.query("select compact_price_history_batch() as count")).rows[0].count), 0);
  });

  it("preserves latest quotations and derived comparisons after all daily rows age out", async () => {
    await client.query(`insert into prices (scryfall_id, date, source, eur) values
      ($1, current_date - 61, 'mtgjson', 10),
      ($1, current_date - 38, 'mtg_numjson', 999),
      ($1, current_date - 38, 'mtgjson', 15),
      ($1, current_date - 31, 'mtgjson', 20)`, [cardId]);
    while (Number((await client.query("select compact_price_history_batch() as count")).rows[0].count)) { /* drain */ }
    assert.equal((await readHistory(cardId, "daily")).length, 0);
    const latest = (await client.query("select eur, price_date::text from latest_card_prices where scryfall_id=$1 and source='mtgjson'", [cardId])).rows[0];
    assert.equal(Number(latest.eur), 20);
    const comparison = (await client.query("select return_percent from app_current_price_changes where scryfall_id=$1 and source='mtgjson' and days=30", [cardId])).rows[0];
    assert.equal(Number(comparison.return_percent), 100);
  });

  it("rolls back both archive and deletion when a batch cannot finish", async () => {
    await client.query(`insert into prices (scryfall_id, date, source, eur, usd) values ($1, current_date - 40, 'mtgjson', 1, -1)`, [cardId]);
    await client.query("savepoint failed_batch");
    await assert.rejects(client.query("select compact_price_history_batch()"), /check constraint/);
    await client.query("rollback to savepoint failed_batch");
    assert.equal((await client.query("select count(*)::integer as count from prices")).rows[0].count, 1);
    assert.equal((await client.query("select count(*)::integer as count from monthly_card_prices")).rows[0].count, 0);
    assert.equal((await client.query("select archived_before::text as cutoff from app_price_retention_state")).rows[0].cutoff, "-infinity");
  });
});
