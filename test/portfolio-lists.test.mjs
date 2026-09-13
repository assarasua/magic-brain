import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MAX_BULK_HOLDINGS,
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
