import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildFeature,
  buildLabels,
  metadataRevision,
  parseArguments,
  scoringDates,
} from "../scripts/ml-point-in-time-core.mjs";

const card = { scryfallId: "11111111-1111-4111-8111-111111111111" };
const identity = metadataRevision(card, "2025-01-01", "price_identity");
const catalog = metadataRevision({
  ...card,
  releasedAt: "2024-01-01",
  rarity: "rare",
  cardType: "Creature",
  isReserved: false,
}, "2025-03-01", "catalog_observation");
const prices = [
  { date: "2025-01-01", source: "mtgjson", eur: 10 },
  { date: "2025-01-08", source: "mtgjson", eur: 11 },
  { date: "2025-01-31", source: "mtgjson", eur: 12 },
  { date: "2025-04-01", source: "mtgjson", eur: 9 },
  { date: "2025-04-08", source: "mtgjson", eur: 15 },
  { date: "2025-05-01", source: "mtgjson", eur: 18 },
  { date: "2025-06-30", source: "mtgjson", eur: 24 },
];

test("future prices cannot alter a historical feature snapshot", () => {
  const before = buildFeature({
    card,
    metadataRevisions: [identity, catalog],
    prices: prices.slice(0, 3),
    asOfDate: "2025-01-31",
    priceSource: "mtgjson",
  });
  const after = buildFeature({
    card,
    metadataRevisions: [identity, catalog],
    prices,
    asOfDate: "2025-01-31",
    priceSource: "mtgjson",
  });
  assert.deepEqual(after, before);
});

test("historical snapshots do not backdate current catalog metadata", () => {
  const feature = buildFeature({
    card,
    metadataRevisions: [identity, catalog],
    prices,
    asOfDate: "2025-01-31",
    priceSource: "mtgjson",
  });
  assert.equal(feature.metadataAvailableAt, "2025-01-01");
  assert.equal(feature.rarity, null);
  assert.equal(feature.cardType, null);
  assert.equal(feature.cardAgeDays, null);
});

test("metadata and release dates after scoring are rejected", () => {
  assert.throws(
    () => buildFeature({
      card,
      metadataRevisions: [metadataRevision({
        ...card,
        releasedAt: "2025-02-01",
        rarity: "rare",
      }, "2025-01-01", "catalog_observation")],
      prices,
      asOfDate: "2025-01-31",
      priceSource: "mtgjson",
    }),
    /No metadata revision|unreleased/,
  );
});

test("labels require maturity and exact target dates", () => {
  const feature = buildFeature({
    card,
    metadataRevisions: [identity],
    prices,
    asOfDate: "2025-01-01",
    priceSource: "mtgjson",
  });
  assert.throws(() => buildLabels(feature, prices, "2025-03-01"), /not matured/);
  const labels = buildLabels(feature, prices, "2025-04-01");
  assert.equal(labels.return7d, 0.1);
  assert.equal(labels.return30d, 0.2);
  assert.equal(labels.return90d, -0.1);
  assert.equal(labels.has7dPrice, true);
  assert.equal(labels.labelCutoffDate, "2025-04-01");
});

test("missing exact dates stay missing instead of using nearby future prices", () => {
  const feature = buildFeature({
    card,
    metadataRevisions: [identity],
    prices,
    asOfDate: "2025-04-01",
    priceSource: "mtgjson",
  });
  const labels = buildLabels(feature, prices, "2025-06-30");
  assert.equal(labels.return7d, 0.66666667);
  assert.equal(labels.return30d, 1);
  assert.equal(labels.return90d, 1.66666667);
  const withoutExact30 = buildLabels(
    feature,
    prices.filter((price) => price.date !== "2025-05-01"),
    "2025-06-30",
  );
  assert.equal(withoutExact30.return30d, null);
  assert.equal(withoutExact30.has30dPrice, false);
});

test("checksums and outputs are stable for retries", () => {
  const input = {
    card,
    metadataRevisions: [identity],
    prices,
    asOfDate: "2025-01-31",
    priceSource: "mtgjson",
  };
  assert.deepEqual(buildFeature(input), buildFeature(input));
  assert.equal(identity.checksum, metadataRevision(card, "2025-02-01", "price_identity").checksum);
});

test("date stepping is deterministic and bounded", () => {
  assert.deepEqual(
    scoringDates("2025-01-01", "2025-01-07", 3),
    ["2025-01-01", "2025-01-04", "2025-01-07"],
  );
});

test("CLI rejects malformed and unsafe bounds", () => {
  assert.throws(() => parseArguments(["backfill", "--from", "2025-02-01"]), /--to/);
  assert.throws(() => parseArguments(["backfill", "--from", "2025-02-30", "--to", "2025-03-01"]), /ISO/);
  assert.throws(() => parseArguments(["backfill", "--from", "2025-03-01", "--to", "2025-02-01"]), /must not/);
  assert.throws(() => parseArguments(["daily", "--batch-size", "0"]), /between/);
  assert.throws(() => parseArguments(["daily", "--wat", "1"]), /Unknown/);
  assert.throws(() => parseArguments(["daily", "--max-rows", "5000001"]), /between/);
  assert.throws(() => parseArguments(["daily", "--resume", "not-a-uuid"]), /UUID/);
});

test("CLI supports dry-run, resume, daily, and maturation controls", () => {
  const dry = parseArguments([
    "dry-run", "--from", "2025-01-01", "--to", "2025-01-31",
    "--date-step-days", "7", "--chunk-days", "2", "--max-rows", "1000",
  ]);
  assert.equal(dry.command, "dry-run");
  assert.equal(dry.dateStepDays, 7);
  const daily = parseArguments(["daily"], "2025-07-01");
  assert.equal(daily.from, "2025-07-01");
  const labels = parseArguments(["mature-labels", "--through", "2025-07-01"]);
  assert.equal(labels.through, "2025-07-01");
});

test("producer uses transactions, immutable upserts, checkpoints, and no mutation route", async () => {
  const producer = await readFile(
    new URL("../scripts/run-ml-point-in-time-producer.mjs", import.meta.url),
    "utf8",
  );
  const migration = await readFile(
    new URL("../db/018_ml_point_in_time_producer.sql", import.meta.url),
    "utf8",
  );
  const migrationRunner = await readFile(
    new URL("../scripts/migrate.mjs", import.meta.url),
    "utf8",
  );
  assert.match(producer, /pg_try_advisory_lock/);
  assert.match(producer, /on conflict[\s\S]+do nothing returning id/i);
  assert.match(producer, /update app_ml_producer_runs/);
  assert.match(producer, /p\.date > f\.as_of_date and p\.date <= f\.as_of_date \+ 90/);
  assert.match(producer, /existing\.feature_snapshot_id = f\.id/);
  assert.doesNotMatch(producer, /DATABASE_URL.*console|console.*DATABASE_URL/);
  assert.match(migration, /create table if not exists app_ml_producer_runs/);
  assert.match(migration, /metadata_checksum/);
  assert.match(migration, /producer_checksum/);
  assert.ok(
    migrationRunner.indexOf('"018_ml_point_in_time_producer.sql"') >
      migrationRunner.indexOf('"017_ml_evaluation_monitoring.sql"'),
  );
});
