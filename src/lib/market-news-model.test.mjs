import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveMarketBrief,
  MARKET_BRIEF_SCHEMA_VERSION,
} from "./market-news-model.ts";

const card = (overrides) => ({
  cardId: "00000000-0000-4000-8000-000000000001",
  name: "Example Card",
  setCode: "TST",
  setName: "Test Set",
  currentPrice: 12,
  price7d: 10,
  price30d: 8,
  ...overrides,
});

const input = (cards) => ({
  marketDataDate: "2026-09-13",
  comparison7dDate: "2026-09-06",
  comparison30dDate: "2026-08-14",
  cards,
});

test("derives every required category from price history", () => {
  const result = deriveMarketBrief(input([
    card({ name: "Growth", currentPrice: 120, price7d: 100, price30d: 80 }),
    card({ name: "Recovery", currentPrice: 100, price7d: 90, price30d: 120 }),
    card({ name: "Lost", currentPrice: 100, price7d: 120, price30d: 80 }),
    card({ name: "Repriced", currentPrice: 70, price7d: 100, price30d: 100 }),
  ]));

  assert.equal(result.methodologyVersion, MARKET_BRIEF_SCHEMA_VERSION);
  assert.deepEqual(
    result.categories.strongGrowth.map(({ name }) => name),
    ["Growth"],
  );
  assert.deepEqual(
    result.categories.recoveryOpportunities.map(({ name }) => name),
    ["Recovery"],
  );
  assert.deepEqual(
    result.categories.lostMomentum.map(({ name }) => name),
    ["Lost"],
  );
  assert.deepEqual(
    result.categories.majorRepricing.map(({ name }) => name),
    ["Growth", "Repriced", "Lost"],
  );
});

test("calculates breadth only from cards with a 7D comparison", () => {
  const result = deriveMarketBrief(input([
    card({ name: "Up", currentPrice: 11, price7d: 10 }),
    card({ name: "Down", currentPrice: 9, price7d: 10 }),
    card({ name: "Flat", currentPrice: 10, price7d: 10 }),
    card({ name: "New", currentPrice: 10, price7d: null }),
  ]));

  assert.deepEqual(result.breadth, {
    advancers: 1,
    decliners: 1,
    unchanged: 1,
    advancePercent: 33.33,
    score: 0,
  });
  assert.equal(result.coverage.currentCards, 4);
  assert.equal(result.coverage.sevenDayComparableCards, 3);
});

test("is deterministic and uses stable tie-breakers", () => {
  const cards = [
    card({ cardId: "00000000-0000-4000-8000-000000000002", name: "Beta" }),
    card({ cardId: "00000000-0000-4000-8000-000000000001", name: "Alpha" }),
  ];

  const first = deriveMarketBrief(input(cards));
  const second = deriveMarketBrief(input([...cards]));

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.categories.strongGrowth.map(({ name }) => name),
    ["Alpha", "Beta"],
  );
  assert.equal(first.caveats.noExternalNews, true);
});
