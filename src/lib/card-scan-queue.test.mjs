import assert from "node:assert/strict";
import test from "node:test";
import {
  BoundedSerialQueue,
  enqueueBounded,
  resolveQueueItem,
  resolvedItems,
} from "./card-scan-queue.ts";

function item(id) {
  return {
    id,
    previewUrl: `blob:${id}`,
    hash: id.padEnd(64, "0"),
    status: "queued",
    captureConfidence: 0.9,
    matchConfidence: null,
    candidates: [],
    selected: null,
    quantity: 1,
    purchasePrice: null,
    condition: "near_mint",
    language: "en",
    listId: "00000000-0000-4000-8000-000000000001",
    acquiredAt: "2026-09-14",
    duplicateWarning: false,
  };
}

const exactCard = {
  id: "00000000-0000-4000-8000-000000000123",
  name: "Synthetic Card",
  setCode: "tst",
  setName: "Synthetic Set",
  collectorNumber: "123",
  rarity: "rare",
  typeLine: "Creature",
  imageUrl: null,
  cardmarketId: null,
  price: 2.5,
  foilPrice: null,
  change7d: null,
  priceDate: null,
  confidence: 0.97,
  reason: "exact_print",
};

test("bounds the in-memory queue", () => {
  const full = Array.from({ length: 24 }, (_, index) => item(String(index)));
  assert.equal(enqueueBounded(full, item("overflow")).accepted, false);
});

test("high confidence preselects while ambiguity requires review", () => {
  const high = resolveQueueItem([item("high")], "high", [exactCard])[0];
  assert.equal(high.status, "identified");
  assert.equal(high.selected.id, exactCard.id);
  const lowCard = { ...exactCard, confidence: 0.72, reason: "name_match" };
  const low = resolveQueueItem([item("low")], "low", [lowCard])[0];
  assert.equal(low.status, "needs_review");
  assert.equal(low.selected, null);
  assert.equal(resolvedItems([high, low]).length, 1);
});

test("duplicate printings aggregate into an explicit quantity", () => {
  const first = resolveQueueItem([item("first")], "first", [exactCard]);
  const merged = resolveQueueItem([...first, item("second")], "second", [exactCard]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].quantity, 2);
  assert.equal(merged[0].duplicateWarning, true);
});

test("background queue preserves order and backpressure", async () => {
  const order = [];
  let releaseFirst;
  const gate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const queue = new BoundedSerialQueue(async (value) => {
    if (value === 1) await gate;
    order.push(value);
  }, 2);
  assert.equal(queue.push(1), true);
  assert.equal(queue.push(2), true);
  assert.equal(queue.push(3), false);
  releaseFirst();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(order, [1, 2]);
});
