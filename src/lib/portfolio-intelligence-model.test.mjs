import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPortfolioIntelligence,
  DETERMINISTIC_COOLING_30D_PERCENT,
  DETERMINISTIC_COOLING_7D_PERCENT,
} from "./portfolio-intelligence-model.ts";

const fallbackRanking = {
  source: "deterministic",
  reason: "scores_missing_or_stale",
  modelVersion: null,
  scoreDate: null,
};

const holding = (overrides = {}) => ({
  id: 1,
  cardId: "held-card",
  name: "Held card",
  currentPrice: 20,
  currentValue: 40,
  change7d: 1,
  change30d: 3,
  ...overrides,
});

const candidate = (overrides = {}) => ({
  id: "candidate-card",
  name: "Candidate",
  setCode: "tst",
  imageUrl: null,
  price: 25,
  change7d: 4,
  ...overrides,
});

test("screenshot fallback state returns useful rules-based insights", () => {
  const result = buildPortfolioIntelligence({
    holdings: [holding()],
    candidates: [candidate()],
    ranking: fallbackRanking,
    maximumCandidatePrice: 100,
  });

  assert.equal(result.mode, "deterministic");
  assert.equal(result.state, "active");
  assert.equal(result.candidateState, "available");
  assert.deepEqual(result.candidateAdditions.map((item) => item.id), [
    "candidate-card",
  ]);
  assert.equal(result.holdingReviews.length, 1);
  assert.equal(result.holdingReviews[0].reviewSignal, "hold");
});

test("21 fully priced lots never collapse into the reported double-empty state", () => {
  const holdings = Array.from({ length: 21 }, (_, index) =>
    holding({
      id: index + 1,
      cardId: `held-card-${index + 1}`,
      name: `Held card ${index + 1}`,
      currentValue: 40 + index,
      change7d: 0.5,
      change30d: 1,
    }),
  );
  const result = buildPortfolioIntelligence({
    holdings,
    candidates: [
      candidate({ id: "held-card-1" }),
      candidate({ id: "too-expensive", price: 101 }),
      candidate({ id: "negative-momentum", change7d: -0.1 }),
    ],
    ranking: fallbackRanking,
    maximumCandidatePrice: 100,
  });

  assert.equal(result.mode, "deterministic");
  assert.equal(result.state, "active");
  assert.equal(result.candidateState, "no_candidates_after_constraints");
  assert.deepEqual(result.candidateAdditions, []);
  assert.equal(result.holdingReviews.length, 1);
  assert.equal(result.holdingReviews[0].name, "Held card 21");
  assert.equal(result.holdingReviews[0].reviewSignal, "hold");
});

test("fallback enforces identity, price, and positive momentum constraints", () => {
  const result = buildPortfolioIntelligence({
    holdings: [holding()],
    candidates: [
      candidate({ id: "held-card" }),
      candidate({ id: "too-expensive", price: 101 }),
      candidate({ id: "falling", change7d: -1 }),
      candidate({ id: "eligible" }),
    ],
    ranking: fallbackRanking,
    maximumCandidatePrice: 100,
  });

  assert.deepEqual(result.candidateAdditions.map((item) => item.id), [
    "eligible",
  ]);
});

test("cooling thresholds produce review insights without trade instructions", () => {
  const result = buildPortfolioIntelligence({
    holdings: [
      holding({
        id: 2,
        cardId: "seven-day",
        change7d: DETERMINISTIC_COOLING_7D_PERCENT,
      }),
      holding({
        id: 3,
        cardId: "thirty-day",
        change30d: DETERMINISTIC_COOLING_30D_PERCENT,
      }),
    ],
    candidates: [],
    ranking: fallbackRanking,
    maximumCandidatePrice: 100,
  });

  assert.equal(result.candidateState, "no_candidates_after_constraints");
  assert.deepEqual(
    result.holdingReviews.map((item) => item.reviewSignal),
    ["cooling", "cooling"],
  );
});

test("distinguishes no portfolio from holdings without current prices", () => {
  const empty = buildPortfolioIntelligence({
    holdings: [],
    candidates: [candidate()],
    ranking: fallbackRanking,
    maximumCandidatePrice: 100,
  });
  const unpriced = buildPortfolioIntelligence({
    holdings: [
      holding({ currentPrice: null, currentValue: null }),
    ],
    candidates: [candidate()],
    ranking: fallbackRanking,
    maximumCandidatePrice: 100,
  });

  assert.equal(empty.state, "no_portfolio");
  assert.equal(unpriced.state, "no_priced_holdings");
  assert.equal(unpriced.candidateState, "portfolio_unavailable");
  assert.deepEqual(unpriced.holdingReviews, []);
});

test("verified ML candidates are not relabeled as deterministic", () => {
  const result = buildPortfolioIntelligence({
    holdings: [holding()],
    candidates: [candidate({ change7d: -4, ml: { confidence: 0.9 } })],
    ranking: {
      source: "ml_batch",
      reason: null,
      modelVersion: "verified-v1",
      scoreDate: "2026-09-13",
    },
    maximumCandidatePrice: 100,
  });

  assert.equal(result.mode, "ml");
  assert.equal(result.candidateAdditions.length, 1);
});
