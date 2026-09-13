import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ML disclosure is keyboard accessible and names fallback method", async () => {
  const source = await readFile(
    new URL("src/components/ml-insight.tsx", root),
    "utf8",
  );
  assert.match(source, /<button[\s\S]*aria-expanded=/);
  assert.match(source, /aria-controls=/);
  assert.match(source, /Method: transparent rules/);
  assert.match(source, /No recent, safe learned score/);
  assert.match(source, /Why this card/);
});

test("all customer ML surfaces use one disclosure component", async () => {
  const paths = [
    "src/app/signals/page.tsx",
    "src/app/predict/page.tsx",
    "src/app/discover/page.tsx",
    "src/app/portfolio/page.tsx",
    "src/app/news/news-view.tsx",
    "src/app/graph/page.tsx",
  ];
  const sources = await Promise.all(
    paths.map((path) => readFile(new URL(path, root), "utf8")),
  );
  sources.forEach((source, index) => {
    assert.match(source, /<MlInsight/, `${paths[index]} must disclose its method`);
  });
});

test("serving reads only promoted real-data models", async () => {
  const source = await readFile(new URL("src/lib/ml-serving.ts", root), "utf8");
  assert.match(source, /model\.status = 'ready'/);
  assert.match(source, /model\.verified_at is not null/);
  assert.match(source, /promotion_evidence->>'dataset_kind' = 'real'/);
  assert.doesNotMatch(source, /synthetic.*status = 'ready'/i);
});

test("smart alerts require user confirmation before mutation", async () => {
  const sources = await Promise.all([
    readFile(new URL("src/app/signals/page.tsx", root), "utf8"),
    readFile(new URL("src/app/graph/page.tsx", root), "utf8"),
  ]);
  sources.forEach((source) => {
    assert.match(source, /window\.confirm/);
    assert.match(source, /\/api\/ml\/alerts/);
  });
});

test("ML experience migration is registered after serving", async () => {
  const runner = await readFile(new URL("scripts/migrate.mjs", root), "utf8");
  assert.ok(
    runner.indexOf('"016_ml_product_experience.sql"') >
      runner.indexOf('"015_ml_batch_serving.sql"'),
  );
});
