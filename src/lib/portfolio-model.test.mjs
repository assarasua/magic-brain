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
import { buildPortfolioForecast } from "./portfolio-forecast-model.ts";

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
  assert.equal(summary.invested, 84);
  assert.equal(summary.valuedInvested, 80);
  assert.equal(summary.unpricedInvested, 4);
  assert.equal(summary.value, 60);
  assert.equal(summary.unrealizedGain, -20);
  assert.equal(summary.unrealizedGainPercent, -25);
  assert.equal(summary.gain, -20);
  assert.equal(summary.cardCount, 6);

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

test("aggregates winners, losers, and absolute contributors deterministically", () => {
  const summary = calculatePortfolioSummary([
    {
      id: 1,
      name: "Winner",
      quantity: 2,
      purchasePrice: 10,
      currentPrice: 20,
      currentValue: 40,
      change7d: null,
      change30d: null,
      opportunityClassification: null,
    },
    {
      id: 2,
      name: "Loser",
      quantity: 1,
      purchasePrice: 50,
      currentPrice: 30,
      currentValue: 30,
      change7d: null,
      change30d: null,
      opportunityClassification: null,
    },
    {
      id: 3,
      name: "Flat",
      quantity: 1,
      purchasePrice: 5,
      currentPrice: 5,
      currentValue: 5,
      change7d: null,
      change30d: null,
      opportunityClassification: null,
    },
  ]);

  assert.equal(summary.invested, 75);
  assert.equal(summary.value, 75);
  assert.equal(summary.unrealizedGain, 0);
  assert.equal(summary.unrealizedGainPercent, 0);
  assert.deepEqual(
    [summary.winners, summary.losers, summary.flat],
    [1, 1, 1],
  );
  assert.deepEqual(summary.bestContributor, {
    id: 1,
    name: "Winner",
    gain: 20,
    gainPercent: 100,
    currentValue: 40,
  });
  assert.equal(summary.worstContributor.name, "Loser");
  assert.equal(summary.worstContributor.gain, -20);
});

test("excludes missing market prices from unrealized P&L", () => {
  const summary = calculatePortfolioSummary([
    {
      name: "Priced",
      quantity: 1,
      purchasePrice: 10,
      currentPrice: 15,
      currentValue: 15,
      change7d: null,
      change30d: null,
      opportunityClassification: null,
    },
    {
      name: "Unpriced",
      quantity: 3,
      purchasePrice: 20,
      currentPrice: null,
      currentValue: null,
      change7d: null,
      change30d: null,
      opportunityClassification: null,
    },
  ]);

  assert.equal(summary.invested, 70);
  assert.equal(summary.value, 15);
  assert.equal(summary.unrealizedGain, 5);
  assert.equal(summary.unpricedInvested, 60);
  assert.equal(summary.pricingCoveragePercent, 50);
  assert.equal(summary.unpricedHoldings, 1);
});

test("reports absolute P&L but no percentage for zero cost basis", () => {
  const summary = calculatePortfolioSummary([
    {
      name: "Gift",
      quantity: 1,
      purchasePrice: 0,
      currentPrice: 25,
      currentValue: 25,
      change7d: null,
      change30d: null,
      opportunityClassification: null,
    },
  ]);

  assert.equal(summary.unrealizedGain, 25);
  assert.equal(summary.unrealizedGainPercent, null);
  assert.equal(summary.zeroCostHoldings, 1);
  assert.equal(summary.bestContributor.gainPercent, null);
});

test("performance analytics coexist with the existing forecast model", () => {
  const holdings = [
    {
      id: 1,
      name: "Forecastable",
      cardId: "11111111-1111-4111-8111-111111111111",
      quantity: 2,
      purchasePrice: 40,
      currentPrice: 50,
      currentValue: 100,
      currentPriceDate: "2026-09-10",
      acquiredAt: "2026-01-01",
      change7d: null,
      change30d: 4,
      opportunityClassification: null,
    },
  ];
  const summary = calculatePortfolioSummary(holdings);
  const forecast = buildPortfolioForecast({
    holdings,
    history: [],
    ranking: {
      source: "deterministic",
      reason: "scores_missing_or_stale",
      modelVersion: null,
      scoreDate: null,
    },
    asOfDate: "2026-09-10",
  });

  assert.equal(summary.unrealizedGain, 20);
  assert.equal(forecast.points[0].base, summary.value);
  assert.equal(forecast.points.length, 61);
});
