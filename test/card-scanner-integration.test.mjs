import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("scanner route is authenticated and accepts normalized text only", async () => {
  const route = await readFile(
    new URL("src/app/api/cards/identify/route.ts", root),
    "utf8",
  );
  const parser = await readFile(new URL("src/lib/card-scan-model.ts", root), "utf8");
  assert.match(route, /getOrCreateUser/);
  assert.match(route, /parseIdentifyRequest/);
  assert.match(parser, /MAX_OCR_TEXT_LENGTH/);
  assert.doesNotMatch(route, /formData|Blob|arrayBuffer|image|photo/i);
});

test("exact printing rank precedes fuzzy title rank", async () => {
  const catalog = await readFile(new URL("src/lib/catalog.ts", root), "utf8");
  const exactOrder = catalog.indexOf("(match_reason = 'exact_print') desc");
  const fuzzyOrder = catalog.indexOf("confidence desc", exactOrder);
  assert.ok(exactOrder > 0);
  assert.ok(fuzzyOrder > exactOrder);
  assert.match(catalog, /c\.lang = \$2/);
  assert.match(catalog, /collector_number/);
  assert.match(catalog, /word_similarity/);
});

test("scan migration is next, registered, and lookup-specific", async () => {
  const migration = await readFile(
    new URL("db/026_card_scan_lookup.sql", root),
    "utf8",
  );
  const runner = await readFile(new URL("scripts/migrate.mjs", root), "utf8");
  assert.match(migration, /lang/);
  assert.match(migration, /set_code/);
  assert.match(migration, /collector_number/);
  assert.ok(
    runner.indexOf('"026_card_scan_lookup.sql"') >
      runner.indexOf('"025_portfolio_sales.sql"'),
  );
});

test("confirmation posts a separate holding and offers scan-next", async () => {
  const scanner = await readFile(
    new URL("src/components/card-scanner-modal.tsx", root),
    "utf8",
  );
  assert.match(scanner, /fetch\("\/api\/portfolio"/);
  assert.match(scanner, /Confirm and add/);
  assert.match(scanner, /Scan next card/);
  assert.match(scanner, /setStage\("success"\)/);
  assert.doesNotMatch(scanner, /body:\s*(image|preview|file|blob)/i);
});
