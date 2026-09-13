import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MAX_BULK_HOLDINGS,
  normalizeDatabaseHoldingId,
  parseHoldingIds,
  parseListName,
  parsePortfolioBulkRequest,
} from "../src/lib/portfolio-list-model.ts";

const root = new URL("../", import.meta.url);
const requestId = "00000000-0000-4000-8000-000000000001";
const sourceListId = "00000000-0000-4000-8000-000000000002";
const destinationListId = "00000000-0000-4000-8000-000000000003";

test("portfolio list migration safely backfills existing holdings", async () => {
  const migration = await readFile(
    new URL("db/019_portfolio_lists.sql", root),
    "utf8",
  );
  const runner = await readFile(new URL("scripts/migrate.mjs", root), "utf8");
  assert.match(migration, /insert into app_portfolio_lists/);
  assert.match(migration, /update app_portfolio_items item\s+set list_id/);
  assert.match(migration, /alter column list_id set not null/);
  assert.match(migration, /foreign key \(list_id, user_id\)/);
  assert.ok(
    runner.indexOf('"019_portfolio_lists.sql"') >
      runner.indexOf('"018_ml_point_in_time_producer.sql"'),
  );
});

test("serializes PostgreSQL bigint holding IDs as API-safe numbers", () => {
  assert.equal(normalizeDatabaseHoldingId("42"), 42);
  assert.equal(normalizeDatabaseHoldingId(42), 42);
  assert.throws(() => normalizeDatabaseHoldingId("not-a-number"));
  assert.throws(() =>
    normalizeDatabaseHoldingId(String(Number.MAX_SAFE_INTEGER + 1)),
  );
  assert.equal(
    parsePortfolioBulkRequest({
      action: "delete",
      holdingIds: ["42"],
      sourceListId,
      requestId,
    }),
    null,
    "the production payload failed because the unnormalized pg int8 reached this strict boundary",
  );
});

test("list names are trimmed and bounded", () => {
  assert.equal(parseListName("  Modern   staples "), "Modern staples");
  assert.equal(parseListName(" "), null);
  assert.equal(parseListName("x".repeat(81)), null);
});

test("bulk requests require strict UUIDs and bounded unique holding IDs", () => {
  assert.deepEqual(
    parsePortfolioBulkRequest({
      action: "move",
      holdingIds: [1, 2],
      sourceListId,
      destinationListId,
      requestId,
    }),
    {
      action: "move",
      holdingIds: [1, 2],
      sourceListId,
      destinationListId,
      requestId,
    },
  );
  assert.equal(parseHoldingIds([1, 1]), null);
  assert.equal(
    parseHoldingIds(Array.from({ length: MAX_BULK_HOLDINGS + 1 }, (_, i) => i + 1)),
    null,
  );
  assert.equal(
    parsePortfolioBulkRequest({
      action: "copy",
      holdingIds: [1],
      sourceListId: "invalid",
      destinationListId,
      requestId,
    }),
    null,
  );
});

test("delete requests reject destination ambiguity", () => {
  assert.equal(
    parsePortfolioBulkRequest({
      action: "delete",
      holdingIds: [1],
      sourceListId,
      destinationListId,
      requestId,
    }),
    null,
  );
});

test("bulk requests reject empty, duplicate, and same-list targets", () => {
  assert.equal(
    parsePortfolioBulkRequest({
      action: "delete",
      holdingIds: [],
      sourceListId,
      requestId,
    }),
    null,
  );
  assert.equal(
    parsePortfolioBulkRequest({
      action: "move",
      holdingIds: [1, 1],
      sourceListId,
      destinationListId,
      requestId,
    }),
    null,
  );
  assert.equal(
    parsePortfolioBulkRequest({
      action: "copy",
      holdingIds: [1],
      sourceListId,
      destinationListId: sourceListId,
      requestId,
    }),
    null,
  );
});

test("bulk SQL is atomic, set-based, ownership-scoped, and idempotent", async () => {
  const implementation = await readFile(
    new URL("src/lib/portfolio.ts", root),
    "utf8",
  );
  const bulk = implementation.slice(
    implementation.indexOf("export async function bulkManagePortfolio"),
  );
  assert.match(bulk, /await client\.query\("begin"\)/);
  assert.match(bulk, /await client\.query\("rollback"\)/);
  assert.match(bulk, /await client\.query\("commit"\)/);
  assert.match(bulk, /where user_id = \$1 and list_id = \$2/);
  assert.match(bulk, /id = any\(\$3::bigint\[\]\)/);
  assert.match(bulk, /app_portfolio_bulk_operations/);
  assert.doesNotMatch(bulk, /for \(const .*holdingIds/);
});

test("bulk API distinguishes stale targets and atomic selection conflicts", async () => {
  const route = await readFile(
    new URL("src/app/api/portfolio/bulk/route.ts", root),
    "utf8",
  );
  for (const code of [
    "source_list_missing",
    "destination_missing",
    "invalid_destination",
    "holdings_missing",
    "idempotency_conflict",
  ]) {
    assert.match(route, new RegExp(code));
  }
});
