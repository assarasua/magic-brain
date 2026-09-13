import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const {
  buildOutcomeLabels,
  buildPointInTimeFeatureSnapshot,
} = await import("./ml-contracts.ts");

const fixture = JSON.parse(
  await readFile(
    new URL("../../test/fixtures/ml-point-in-time.json", import.meta.url),
    "utf8",
  ),
);

const buildSnapshot = (overrides = {}) =>
  buildPointInTimeFeatureSnapshot({ ...fixture, ...overrides });

test("point-in-time features ignore every future observation", () => {
  const withFuture = buildSnapshot();
  const withoutFuture = buildSnapshot({
    prices: fixture.prices.filter((price) => price.date <= fixture.asOfDate),
  });

  assert.deepEqual(withFuture, withoutFuture);
  assert.equal(withFuture.sourceMaxPriceDate, fixture.asOfDate);
  assert.equal(withFuture.momentum30d, 0.5);
  assert.equal(withFuture.priceStalenessDays, 0);
});

test("point-in-time features reject metadata unavailable at scoring time", () => {
  assert.throws(
    () =>
      buildSnapshot({
        card: { ...fixture.card, metadataAvailableAt: "2025-02-01" },
      }),
    /metadata was unavailable/,
  );
  assert.throws(
    () =>
      buildSnapshot({
        card: { ...fixture.card, releasedAt: "2025-02-01" },
      }),
    /unreleased/,
  );
});

test("labels use exact future horizons and cap their observation window", () => {
  const labels = buildOutcomeLabels({
    snapshot: buildSnapshot(),
    prices: fixture.prices,
  });

  assert.deepEqual(labels, {
    contractVersion: "v1",
    asOfDate: "2025-01-31",
    labelCutoffDate: "2025-05-01",
    sourceMinFutureDate: "2025-02-07",
    sourceMaxFutureDate: "2025-05-01",
    return7d: 0.2,
    return30d: -0.2,
    return90d: 0.4,
    downside90d: -0.2,
    realizedVolatility90d: labels.realizedVolatility90d,
    has7dPrice: true,
    has30dPrice: true,
    has90dPrice: true,
  });
  assert.equal(typeof labels.realizedVolatility90d, "number");
});

test("missing exact horizon prices become explicit availability labels", () => {
  const labels = buildOutcomeLabels({
    snapshot: buildSnapshot(),
    prices: fixture.prices.filter((price) => price.date !== "2025-03-02"),
  });

  assert.equal(labels.return30d, null);
  assert.equal(labels.has30dPrice, false);
});
