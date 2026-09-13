import assert from "node:assert/strict";
import test from "node:test";
import { calculateSetPrediction } from "./predict-model.ts";

const balancedInputs = {
  target: "sp500",
  horizonMonths: 24,
  demand: 3,
  scarcity: 3,
  reprintResilience: 3,
};

test("rewards stronger demand and supply assumptions", () => {
  const cautious = calculateSetPrediction(balancedInputs, {
    hasMarketData: true,
    isUpcoming: false,
    coveragePercent: 80,
    medianReturn90d: 4,
    breadth90d: 55,
    volatility90d: 10,
  });
  const strong = calculateSetPrediction(
    {
      ...balancedInputs,
      demand: 5,
      scarcity: 5,
      reprintResilience: 5,
    },
    {
      hasMarketData: true,
      isUpcoming: false,
      coveragePercent: 80,
      medianReturn90d: 4,
      breadth90d: 55,
      volatility90d: 10,
    },
  );

  assert.ok(strong.score > cautious.score);
  assert.ok(strong.probabilityOfTarget > cautious.probabilityOfTarget);
});

test("marks unreleased sets as low-confidence wide scenarios", () => {
  const result = calculateSetPrediction(balancedInputs, {
    hasMarketData: false,
    isUpcoming: true,
    coveragePercent: null,
    medianReturn90d: null,
    breadth90d: null,
    volatility90d: null,
  });

  assert.equal(result.confidence, 18);
  assert.ok(result.expectedAnnualRange.high - result.expectedAnnualRange.low > 35);
  assert.ok(result.risks.some((risk) => risk.includes("unreleased")));
});

test("uses progressively higher benchmark targets", () => {
  const evidence = {
    hasMarketData: true,
    isUpcoming: false,
    coveragePercent: 90,
    medianReturn90d: 8,
    breadth90d: 65,
    volatility90d: 8,
  };
  const inflation = calculateSetPrediction(
    { ...balancedInputs, target: "inflation" },
    evidence,
  );
  const extreme = calculateSetPrediction(
    { ...balancedInputs, target: "extreme" },
    evidence,
  );

  assert.equal(inflation.targetAnnualReturn, 3);
  assert.equal(extreme.targetAnnualReturn, 20);
  assert.ok(inflation.probabilityOfTarget > extreme.probabilityOfTarget);
});
