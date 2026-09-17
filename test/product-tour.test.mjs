import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("product tour uses Driver.js and persists dismissal", async () => {
  const source = await readFile("src/components/product-tour.tsx", "utf8");
  assert.match(source, /from "driver\.js"/);
  assert.match(source, /showProgress: true/);
  assert.match(source, /onDestroyed:.*rememberCompletion/s);
  assert.match(source, /productTourCompleted: true/);
  assert.match(source, /magic-brain-product-tour-v3/);
  assert.doesNotMatch(source, /usePathname/);
});

test("Driver.js rollout and navigation targets are registered", async () => {
  const migration = await readFile("db/031_driver_product_tour.sql", "utf8");
  const registry = await readFile("scripts/migrate.mjs", "utf8");
  const shell = await readFile("src/components/app-shell.tsx", "utf8");
  const mobile = await readFile("src/components/mobile-tab-bar.tsx", "utf8");
  assert.match(migration, /product_tour_completed = false/);
  assert.match(registry, /031_driver_product_tour\.sql/);
  assert.match(registry, /032_expanded_product_tour\.sql/);
  assert.match(shell, /data-tour=/);
  assert.match(mobile, /data-tour="more"/);
});
