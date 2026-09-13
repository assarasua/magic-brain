import assert from "node:assert/strict";
import test from "node:test";
import { buildPredictPortfolioScenario } from "./predict-portfolio-model.ts";

const pick = (id, price, total, risk, confidence, trend) => ({
  card: {
    id,
    name: `Card ${id}`,
    setCode: "tst",
    setName: "Test Set",
    collectorNumber: id,
    rarity: "rare",
    typeLine: "Artifact",
    imageUrl: null,
    cardmarketId: null,
    price,
    foilPrice: null,
    change7d: 4,
    priceDate: "2026-09-13",
  },
  score: {
    total,
    components: {},
    risk,
    confidence,
    trend,
  },
  momentum7d: 4,
  momentum30d: 8,
  drawdownPercent: -3,
  stabilityPercent: 5,
  entryRange: null,
  rationale: [`${risk} risk`],
});

test("builds a bounded portfolio without exceeding its budget", () => {
  const result = buildPredictPortfolioScenario(
    [
      pick("1", 40, 80, "low", "high", "rising"),
      pick("2", 25, 72, "medium", "high", "accelerating"),
      pick("3", 10, 65, "high", "medium", "rising"),
    ],
    { budget: 200, risk: "balanced", maxPositions: 2 },
  );

  assert.equal(result.positions.length, 2);
  assert.ok(result.invested <= 200);
  assert.ok(result.positions.every((position) => position.quantity >= 1));
  assert.equal(
    Math.round(
      result.positions.reduce(
        (total, position) => total + position.portfolioWeight,
        0,
      ),
    ),
    100,
  );
});

test("preservation excludes high-risk and low-confidence picks", () => {
  const result = buildPredictPortfolioScenario(
    [
      pick("1", 20, 80, "low", "high", "steady"),
      pick("2", 20, 95, "high", "high", "accelerating"),
      pick("3", 20, 90, "low", "low", "rising"),
    ],
    { budget: 100, risk: "preservation", maxPositions: 3 },
  );

  assert.deepEqual(
    result.positions.map((position) => position.card.id),
    ["1"],
  );
});
