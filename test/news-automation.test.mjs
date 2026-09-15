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
  assert.match(workflow, /cron: "15 7 \* \* \*"/);
  assert.match(workflow, /secrets\.NEWS_CRON_SECRET/);
  assert.match(workflow, /https:\/\/magicbrain\.es\/api\/jobs\/news/);
});
