import assert from "node:assert/strict";
import test from "node:test";
import {
  isIdempotencyKey,
  parsePortfolioBatch,
} from "./portfolio-batch-model.ts";

const validItem = {
  clientId: "00000000-0000-4000-8000-000000000010",
  cardId: "00000000-0000-4000-8000-000000000011",
  quantity: 2,
  purchasePrice: 3.5,
  condition: "near_mint",
  language: "en",
  acquiredAt: "2026-09-14",
  listId: "00000000-0000-4000-8000-000000000012",
};

test("batch parser accepts bounded resolved items", () => {
  assert.deepEqual(parsePortfolioBatch({ items: [validItem] }), [validItem]);
  assert.equal(isIdempotencyKey(validItem.clientId), true);
});

test("batch parser rejects unresolved, duplicate, and oversized submissions", () => {
  assert.equal(parsePortfolioBatch({ items: [{ ...validItem, cardId: null }] }), null);
  assert.equal(parsePortfolioBatch({ items: [validItem, validItem] }), null);
  assert.equal(
    parsePortfolioBatch({
      items: Array.from({ length: 25 }, (_, index) => ({
        ...validItem,
        clientId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      })),
    }),
    null,
  );
  assert.equal(isIdempotencyKey("retry-me"), false);
});
