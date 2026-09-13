import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateOpportunityAnalytics,
  calculatePortfolioSummary,
  classifyPortfolioOpportunity,
  isValidPortfolioQuantity,
  isValidPortfolioUnitPrice,
  parsePortfolioUpdate,
} from "./portfolio-model.ts";

const isLanguage = (value) => ["en", "es", "ja"].includes(value);

test("strictly validates editable portfolio numbers", () => {
  assert.equal(isValidPortfolioQuantity(1), true);
  assert.equal(isValidPortfolioQuantity(1_000_000), true);
  assert.equal(isValidPortfolioQuantity(1.5), false);
  assert.equal(isValidPortfolioQuantity("2"), false);
  assert.equal(isValidPortfolioQuantity(1_000_001), false);

  assert.equal(isValidPortfolioUnitPrice(0), true);
  assert.equal(isValidPortfolioUnitPrice(12.34), true);
  assert.equal(isValidPortfolioUnitPrice(12.345), false);
  assert.equal(isValidPortfolioUnitPrice(Number.POSITIVE_INFINITY), false);
  assert.equal(isValidPortfolioUnitPrice("12.34"), false);
});

test("accepts only known, non-empty patch properties", () => {
  assert.deepEqual(
    parsePortfolioUpdate(
      { quantity: 3, purchasePrice: 8.25, language: "ja" },
      isLanguage,
    ),
    { quantity: 3, purchasePrice: 8.25, language: "ja" },
  );
  assert.equal(parsePortfolioUpdate({}, isLanguage), null);
  assert.equal(parsePortfolioUpdate({ quantity: 2, id: 4 }, isLanguage), null);
  assert.equal(parsePortfolioUpdate({ quantity: "2" }, isLanguage), null);
  assert.equal(parsePortfolioUpdate({ language: "xx" }, isLanguage), null);
});

test("uses the established three-way momentum semantics", () => {
  assert.equal(classifyPortfolioOpportunity(4, 12), "strong_growth");
  assert.equal(
    classifyPortfolioOpportunity(3, -8),
    "recovery_opportunity",
  );
  assert.equal(classifyPortfolioOpportunity(-2, 14), "lost_momentum");
  assert.equal(classifyPortfolioOpportunity(0, 0), "lost_momentum");
});

test("recalculates cost basis, pnl, and opportunity exposure", () => {
  const holdings = [
    {
      quantity: 2,
      purchasePrice: 10,
      currentPrice: 15,
      currentValue: 30,
      change7d: 5,
      change30d: 8,
      opportunityClassification: "strong_growth",
    },
    {
      quantity: 3,
      purchasePrice: 20,
      currentPrice: 10,
      currentValue: 30,
      change7d: 2,
      change30d: -4,
      opportunityClassification: "recovery_opportunity",
    },
    {
      quantity: 1,
      purchasePrice: 4,
      currentPrice: null,
      currentValue: null,
      change7d: null,
      change30d: null,
      opportunityClassification: null,
    },
  ];

  const summary = calculatePortfolioSummary(holdings);
  assert.deepEqual(summary, {
    invested: 84,
    value: 60,
    gain: -24,
    gainPercent: (-24 / 84) * 100,
    cardCount: 6,
  });

  const analytics = calculateOpportunityAnalytics(holdings, summary.value);
  assert.equal(analytics.comparableHoldings, 2);
  assert.equal(analytics.coveragePercent, (2 / 3) * 100);
  assert.deepEqual(analytics.classifications.strong_growth, {
    count: 1,
    holdingsPercent: 50,
    marketValue: 30,
    exposurePercent: 50,
  });
  assert.equal(analytics.classifications.lost_momentum.count, 0);
});
