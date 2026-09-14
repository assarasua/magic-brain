import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("bulk scanner stays client-side and uses a bounded background queue", async () => {
  const scanner = await readFile(
    new URL("src/components/bulk-card-scanner.tsx", root),
    "utf8",
  );
  assert.match(scanner, /requestVideoFrameCallback/);
  assert.match(scanner, /requestAnimationFrame/);
  assert.match(scanner, /ANALYSIS_WIDTH = 160/);
  assert.match(scanner, /BULK_SCAN_LIMIT/);
  assert.match(scanner, /createCardOcrSession/);
  assert.match(scanner, /capturePerspectiveCard/);
  assert.match(scanner, /fetch\("\/api\/cards\/identify"/);
  assert.match(scanner, /fetch\("\/api\/portfolio\/batch"/);
  assert.doesNotMatch(scanner, /FormData\(\).*image|body:\s*(blob|image)/is);
});

test("bulk additions are transactional and idempotent", async () => {
  const route = await readFile(
    new URL("src/app/api/portfolio/batch/route.ts", root),
    "utf8",
  );
  const portfolio = await readFile(new URL("src/lib/portfolio.ts", root), "utf8");
  const migration = await readFile(
    new URL("db/027_portfolio_batch_requests.sql", root),
    "utf8",
  );
  const runner = await readFile(new URL("scripts/migrate.mjs", root), "utf8");
  assert.match(route, /Idempotency-Key|idempotency-key/);
  assert.match(route, /getOrCreateUser/);
  assert.match(portfolio, /client\.query\("begin"\)/);
  assert.match(portfolio, /client\.query\("rollback"\)/);
  assert.match(portfolio, /on conflict \(user_id, idempotency_key\) do nothing/);
  assert.match(migration, /primary key \(user_id, idempotency_key\)/);
  assert.ok(
    runner.indexOf('"027_portfolio_batch_requests.sql"') >
      runner.indexOf('"026_card_scan_lookup.sql"'),
  );
});

test("OCR provenance and rebuild commands are documented", async () => {
  const docs = await readFile(new URL("docs/card-scanner-ocr.md", root), "utf8");
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.match(docs, /Tesseract\.js 6\.0\.1/);
  assert.match(docs, /Apache-2\.0/);
  assert.match(docs, /train-test leakage|never see held-out titles/i);
  assert.equal(packageJson.scripts["ocr:sync-models"], "node scripts/sync-ocr-models.mjs");
  assert.match(packageJson.scripts["ocr:train"], /train-card-title-corrector/);
});
