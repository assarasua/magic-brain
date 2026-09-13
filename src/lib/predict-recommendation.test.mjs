import assert from "node:assert/strict";
import test from "node:test";
import {
  derivePredictRecommendation,
  isPredictRecommendationApplied,
} from "./predict-recommendation.ts";

const profile = (overrides = {}) => ({
  defaultBudget: 1000,
  maxCardPrice: 250,
  positions: 10,
  risk: "balanced",
  horizon: "medium",
  strategy: "diversified",
  marketTrend: "any",
  releaseEra: "any",
  colors: [],
  rarities: ["rare", "mythic"],
  cardTypes: [],
  setCodes: [],
  reservedOnly: false,
  ...overrides,
});

test("maps every risk profile to conservative bounded scenario inputs", () => {
  const expected = {
    preservation: ["inflation", 2, 4, 5],
    conservative: ["inflation", 3, 4, 4],
    balanced: ["sp500", 3, 3, 3],
    growth: ["sp500", 4, 3, 3],
    aggressive: ["extreme", 5, 2, 2],
  };

  for (const [risk, values] of Object.entries(expected)) {
    const recommendation = derivePredictRecommendation(profile({ risk }));
    assert.deepEqual(
      [
        recommendation.target,
        recommendation.demand,
        recommendation.scarcity,
        recommendation.reprints,
      ],
      values,
    );
  }
});

test("maps every stored horizon to the supported Predict horizon", () => {
  assert.equal(
    derivePredictRecommendation(profile({ horizon: "short" })).horizon,
    12,
  );
  assert.equal(
    derivePredictRecommendation(profile({ horizon: "medium" })).horizon,
    24,
  );
  assert.equal(
    derivePredictRecommendation(profile({ horizon: "long" })).horizon,
    36,
  );
});

test("strategy, trend, era, and fixed-supply constraints change assumptions", () => {
  const baseline = derivePredictRecommendation(profile());
  const constrained = derivePredictRecommendation(
    profile({
      strategy: "collectible",
      marketTrend: "stable",
      releaseEra: "classic",
      reservedOnly: true,
    }),
  );
  const momentum = derivePredictRecommendation(
    profile({
      strategy: "momentum",
      marketTrend: "rising",
      releaseEra: "recent",
    }),
  );

  assert.deepEqual(
    [baseline.demand, baseline.scarcity, baseline.reprints],
    [3, 3, 3],
  );
  assert.deepEqual(
    [constrained.demand, constrained.scarcity, constrained.reprints],
    [2, 5, 5],
  );
  assert.deepEqual(
    [momentum.demand, momentum.scarcity, momentum.reprints],
    [5, 1, 1],
  );
});

test("bounds budget, maximum card price, and positions defensively", () => {
  const minimum = derivePredictRecommendation(
    profile({ defaultBudget: 0, maxCardPrice: 0, positions: 1 }),
  );
  assert.deepEqual(
    [minimum.budget, minimum.maxCardPrice, minimum.positions],
    [25, 2, 3],
  );

  const maximum = derivePredictRecommendation(
    profile({
      defaultBudget: 2_000_000,
      maxCardPrice: 1_500_000,
      positions: 99,
    }),
  );
  assert.deepEqual(
    [maximum.budget, maximum.maxCardPrice, maximum.positions],
    [1_000_000, 1_000_000, 20],
  );

  const cardCap = derivePredictRecommendation(
    profile({ defaultBudget: 100, maxCardPrice: 500 }),
  );
  assert.equal(cardCap.maxCardPrice, 100);
});

test("detects edits and restoration against the complete visible configuration", () => {
  const recommendation = derivePredictRecommendation(profile());
  const current = {
    target: recommendation.target,
    horizon: recommendation.horizon,
    demand: recommendation.demand,
    scarcity: recommendation.scarcity,
    reprints: recommendation.reprints,
    budget: recommendation.budget,
    risk: recommendation.risk,
  };

  assert.equal(isPredictRecommendationApplied(recommendation, current), true);
  assert.equal(
    isPredictRecommendationApplied(recommendation, {
      ...current,
      scarcity: current.scarcity + 1,
    }),
    false,
  );
  assert.equal(
    isPredictRecommendationApplied(recommendation, {
      ...current,
      budget: current.budget + 25,
    }),
    false,
  );
});
