import assert from "node:assert/strict";
import test from "node:test";
import { scoreLatestSetPick } from "./latest-set-watch-score.ts";

const complete = {
  momentum7d: 8,
  momentum30d: 18,
  stabilityPercent: 6,
  drawdownPercent: -4,
  historyDays: 30,
  observationCount: 28,
  rarity: "rare",
};

test("rewards sustained momentum and stable history", () => {
  const strong = scoreLatestSetPick(complete);
  const weak = scoreLatestSetPick({
    ...complete,
    momentum7d: -8,
    momentum30d: -12,
    stabilityPercent: 24,
    drawdownPercent: -30,
  });

  assert.ok(strong.total > weak.total);
  assert.equal(strong.risk, "low");
  assert.ok(strong.total <= 100);
});

test("labels sparse observations as low confidence", () => {
  const result = scoreLatestSetPick({
    ...complete,
    historyDays: 8,
    observationCount: 5,
  });

  assert.equal(result.confidence, "low");
  assert.equal(result.risk, "high");
});

test("uses rarity as a small component rather than overriding signals", () => {
  const mythic = scoreLatestSetPick({ ...complete, rarity: "mythic" });
  const common = scoreLatestSetPick({ ...complete, rarity: "common" });

  assert.equal(mythic.total - common.total, 4);
});
