import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("daily news job is authenticated and invokes bounded backfill", async () => {
  const route = await readFile("src/app/api/jobs/news/route.ts", "utf8");
  assert.match(route, /NEWS_CRON_SECRET/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /materializeMissingMarketBriefs\(366\)/);
});

test("backfill starts after the last published brief instead of all history", async () => {
  const source = await readFile("src/lib/market-news.ts", "utf8");
  assert.match(source, /prices\.date > coalesce\(/);
  assert.match(source, /select max\(market_data_date\) from market_briefs/);
  assert.match(source, /order by market_data_date asc/);
  assert.match(source, /on conflict \(market_data_date\) do nothing/);
});

test("scheduled workflow publishes every day without a deployment", async () => {
  const workflow = await readFile(".github/workflows/daily-news.yml", "utf8");
  assert.match(workflow, /cron: "0 6,7 \* \* \*"/);
  assert.match(workflow, /TZ=Europe\/Madrid date \+%H/);
  assert.match(workflow, /delivery-time\.outputs\.send == 'true'/);
  assert.match(workflow, /secrets\.NEWS_CRON_SECRET/);
  assert.match(workflow, /https:\/\/magicbrain\.es\/api\/jobs\/news/);
});

test("Scryfall briefs fall back to the longer MTGJSON comparison history", async () => {
  const source = await readFile("src/lib/market-news.ts", "utf8");
  assert.match(source, /source in \('scryfall', 'mtgjson'\)/);
  assert.match(source, /left join lateral/);
  assert.match(source, /case historical\.source when 'scryfall' then 0 else 1 end/);
});

test("the affected empty Scryfall briefs are rebuilt once", async () => {
  const migration = await readFile("db/028_rebuild_scryfall_market_briefs.sql", "utf8");
  const registry = await readFile("scripts/migrate.mjs", "utf8");
  assert.match(migration, /delete from market_briefs\s+where source = 'scryfall'/);
  assert.match(migration, /create trigger market_briefs_immutable/);
  assert.match(registry, /028_rebuild_scryfall_market_briefs\.sql/);
});

test("daily ML snapshots and labels use the live Scryfall feed", async () => {
  const workflow = await readFile(".github/workflows/ml-point-in-time-daily.yml", "utf8");
  assert.match(workflow, /daily --source scryfall/);
  assert.match(workflow, /mature-labels --source scryfall/);
  assert.doesNotMatch(workflow, /--source mtgjson/);
});
