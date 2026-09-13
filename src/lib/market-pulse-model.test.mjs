import assert from "node:assert/strict";
import test from "node:test";
import {
  mapMarketPulseRow,
  sortMarketPulseSets,
} from "./market-pulse-model.ts";

const row = {
  code: "tst",
  name: "Test Set",
  released_at: "2026-01-01",
  card_count: "100",
  tracked_cards: "40",
  coverage_percent: "40",
  median_return: "3.25",
  advancers: "24",
  decliners: "12",
  breadth: "30",
  leading_card_id: "card-1",
  leading_card_name: "Useful Card",
  leading_return: "-18.5",
  latest_date: "2026-09-12",
  comparison_date: "2026-09-05",
};

test("maps numeric pulse metrics and the leading mover", () => {
  assert.deepEqual(mapMarketPulseRow(row), {
    code: "tst",
    name: "Test Set",
    releasedAt: "2026-01-01",
    cardCount: 100,
    trackedCards: 40,
    coveragePercent: 40,
    medianReturn: 3.25,
    advancers: 24,
    decliners: 12,
    breadth: 30,
    leadingMover: {
      cardId: "card-1",
      name: "Useful Card",
      returnPercent: -18.5,
    },
    available: true,
  });
});

test("keeps sets without comparisons as explicitly unavailable", () => {
  const result = mapMarketPulseRow({
    ...row,
    code: "empty",
    tracked_cards: "0",
    coverage_percent: "0",
    median_return: null,
    advancers: "0",
    decliners: "0",
    breadth: null,
    leading_card_id: null,
    leading_card_name: null,
    leading_return: null,
  });

  assert.equal(result.available, false);
  assert.equal(result.medianReturn, null);
  assert.equal(result.leadingMover, null);
});

test("sorts metrics in both directions and keeps unavailable values last", () => {
  const positive = mapMarketPulseRow(row);
  const negative = mapMarketPulseRow({
    ...row,
    code: "neg",
    name: "Negative Set",
    median_return: "-2",
  });
  const unavailable = mapMarketPulseRow({
    ...row,
    code: "none",
    name: "Unavailable Set",
    tracked_cards: "0",
    median_return: null,
  });

  assert.deepEqual(
    sortMarketPulseSets([unavailable, negative, positive], "median-desc").map(
      (set) => set.code,
    ),
    ["tst", "neg", "none"],
  );
  assert.deepEqual(
    sortMarketPulseSets([unavailable, positive, negative], "median-asc").map(
      (set) => set.code,
    ),
    ["neg", "tst", "none"],
  );
});

test("sorts names and releases explicitly in both directions", () => {
  const alpha = mapMarketPulseRow({
    ...row,
    code: "alp",
    name: "Alpha",
    released_at: "2020-01-01",
  });
  const beta = mapMarketPulseRow({
    ...row,
    code: "bet",
    name: "Beta",
    released_at: "2025-01-01",
  });
  const unknown = mapMarketPulseRow({
    ...row,
    code: "unk",
    name: "Unknown date",
    released_at: null,
  });

  assert.deepEqual(
    sortMarketPulseSets([beta, alpha], "name-asc").map((set) => set.code),
    ["alp", "bet"],
  );
  assert.deepEqual(
    sortMarketPulseSets([alpha, beta], "name-desc").map((set) => set.code),
    ["bet", "alp"],
  );
  assert.deepEqual(
    sortMarketPulseSets([unknown, alpha, beta], "release-desc").map((set) => set.code),
    ["bet", "alp", "unk"],
  );
  assert.deepEqual(
    sortMarketPulseSets([unknown, beta, alpha], "release-asc").map((set) => set.code),
    ["alp", "bet", "unk"],
  );
});

test("uses stable name and code tie-breakers for metric sorts", () => {
  const alphaZ = mapMarketPulseRow({ ...row, code: "zzz", name: "Alpha" });
  const alphaA = mapMarketPulseRow({ ...row, code: "aaa", name: "Alpha" });
  const beta = mapMarketPulseRow({ ...row, code: "bet", name: "Beta" });

  assert.deepEqual(
    sortMarketPulseSets([beta, alphaZ, alphaA], "coverage-desc").map(
      (set) => set.code,
    ),
    ["aaa", "zzz", "bet"],
  );
});
