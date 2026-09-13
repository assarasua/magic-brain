import assert from "node:assert/strict";
import test from "node:test";

const {
  deterministicRanking,
  normalizeDrivers,
  rankByVerifiedScores,
} = await import("./ml-experience.ts");

test("experiment fallback keeps deterministic ordering unchanged", () => {
  const cards = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const ranked = rankByVerifiedScores(cards, {
    ranking: deterministicRanking("experiment_off"),
    scores: { c: { score: 1 } },
  });
  assert.deepEqual(ranked, cards);
  assert.equal(ranked, cards);
});

test("verified scores rank known cards while preserving fallback order", () => {
  const cards = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const ranked = rankByVerifiedScores(cards, {
    ranking: {
      source: "ml_batch",
      reason: null,
      modelVersion: "verified-v1",
      scoreDate: "2026-09-13",
    },
    scores: {
      b: { score: 0.7 },
      d: { score: 0.9 },
    },
  });
  assert.deepEqual(ranked.map((card) => card.id), ["d", "b", "a", "c"]);
});

test("driver normalization rejects malformed and limits disclosure", () => {
  assert.deepEqual(normalizeDrivers(null), []);
  assert.deepEqual(
    normalizeDrivers([
      { feature: "momentum30d", direction: "positive", contribution: 2 },
      { feature: "drawdown90d", direction: "negative" },
      { feature: "historyDays", direction: "positive" },
      { feature: "ignored", direction: "positive" },
      { feature: "unsafe", direction: "sideways" },
    ]),
    [
      { feature: "momentum30d", direction: "positive" },
      { feature: "drawdown90d", direction: "negative" },
      { feature: "historyDays", direction: "positive" },
    ],
  );
});
