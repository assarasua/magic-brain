import assert from "node:assert/strict";
import test from "node:test";
import { buildPortfolioForecast } from "./portfolio-forecast-model.ts";

const deterministic = {
  source: "deterministic",
  reason: "scores_missing_or_stale",
  modelVersion: null,
  scoreDate: null,
};

const holding = (overrides = {}) => ({
  cardId: crypto.randomUUID(),
  quantity: 2,
  purchasePrice: 40,
  currentPrice: 50,
  currentValue: 100,
  currentPriceDate: "2026-09-10",
  acquiredAt: "2026-01-01",
  change30d: 4,
  ml: null,
  ...overrides,
});

const history = Array.from({ length: 45 }, (_, index) => ({
  date: new Date(Date.UTC(2026, 6, 28 + index)).toISOString().slice(0, 10),
  value: 90 + index * 0.25,
}));

test("returns no projected points for an empty portfolio", () => {
  const result = buildPortfolioForecast({
    holdings: [],
    history: [],
    ranking: deterministic,
    asOfDate: "2026-09-10",
  });
  assert.equal(result.source, "unavailable");
  assert.equal(result.coverage.totalHoldings, 0);
  assert.deepEqual(result.points, []);
});

test("aggregates quantities and returns bounded 1Y, 3Y, and 5Y points", () => {
  const result = buildPortfolioForecast({
    holdings: [
      holding(),
      holding({ quantity: 1, currentPrice: 80, currentValue: 80 }),
    ],
    history,
    ranking: deterministic,
    asOfDate: "2026-09-10",
  });
  assert.equal(result.points.length, 61);
  assert.deepEqual(
    [12, 36, 60].map((month) => result.points[month].date),
    ["2027-09-10", "2029-09-10", "2031-09-10"],
  );
  assert.equal(result.points[0].base, 180);
  for (const point of result.points) {
    assert.ok(point.conservative <= point.base);
    assert.ok(point.base <= point.optimistic);
    assert.ok(point.optimistic <= 540);
    assert.ok(point.conservative >= 36);
  }
  assert.ok(
    result.points[60].optimistic - result.points[60].conservative >
      result.points[12].optimistic - result.points[12].conservative,
  );
});

test("carries stale prices and excludes missing prices without invented value", () => {
  const result = buildPortfolioForecast({
    holdings: [
      holding({
        currentPriceDate: "2026-08-01",
        currentValue: 100,
      }),
      holding({
        currentPrice: null,
        currentValue: null,
        purchasePrice: 50,
      }),
      holding({ currentValue: 200, currentPrice: 100 }),
    ],
    history: [],
    ranking: deterministic,
    asOfDate: "2026-09-10",
  });
  assert.equal(result.coverage.staleCarriedHoldings, 1);
  assert.equal(result.coverage.excludedHoldings, 1);
  assert.equal(result.points[0].base, 300);
  assert.equal(result.points[60].base - result.points[0].base < 400, true);
});

test("uses verified matching ML context only and reports mixed coverage", () => {
  const ml = {
    scoreId: "score-1",
    modelVersion: "model-real-v2",
    score: 0.8,
    confidence: 0.9,
    probabilityPositive30d: 0.72,
    expectedDownside90d: -0.15,
    drivers: [{ feature: "momentum30d", direction: "positive" }],
    generatedAt: "2026-09-10T06:00:00Z",
    scoreDate: "2026-09-10",
  };
  const result = buildPortfolioForecast({
    holdings: [
      holding({ ml, currentValue: 75 }),
      holding({ currentValue: 25 }),
    ],
    history,
    ranking: {
      source: "ml_batch",
      reason: null,
      modelVersion: "model-real-v2",
      scoreDate: "2026-09-10",
    },
    asOfDate: "2026-09-10",
  });
  assert.equal(result.source, "ml_assisted");
  assert.equal(result.modelVersion, "model-real-v2");
  assert.equal(result.coverage.mlValuePercent, 75);
  assert.equal(result.dataDate, "2026-09-10");

  const mismatched = buildPortfolioForecast({
    holdings: [holding({ ml })],
    history,
    ranking: {
      source: "ml_batch",
      reason: null,
      modelVersion: "other-model",
      scoreDate: "2026-09-10",
    },
    asOfDate: "2026-09-10",
  });
  assert.equal(mismatched.source, "deterministic");
  assert.equal(mismatched.modelVersion, null);

  const stale = buildPortfolioForecast({
    holdings: [
      holding({
        ml: { ...ml, scoreDate: "2026-09-01" },
      }),
    ],
    history,
    ranking: {
      source: "ml_batch",
      reason: null,
      modelVersion: "model-real-v2",
      scoreDate: "2026-09-01",
    },
    asOfDate: "2026-09-10",
  });
  assert.equal(stale.source, "deterministic");
});

test("caps implausible positive and negative compounding", () => {
  const positive = buildPortfolioForecast({
    holdings: [holding({ change30d: 10_000 })],
    history: history.map((point, index) => ({
      ...point,
      value: 10 * 1.05 ** index,
    })),
    ranking: deterministic,
    asOfDate: "2026-09-10",
  });
  const negative = buildPortfolioForecast({
    holdings: [holding({ change30d: -10_000 })],
    history: history.map((point, index) => ({
      ...point,
      value: 1000 * 0.95 ** index,
    })),
    ranking: deterministic,
    asOfDate: "2026-09-10",
  });
  assert.ok(positive.assumptions.annualBaseRatePercent <= 12);
  assert.ok(negative.assumptions.annualBaseRatePercent >= -10);
  assert.ok(positive.points[60].optimistic <= 300);
  assert.ok(negative.points[60].conservative >= 20);
});
