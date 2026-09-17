import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("overview requests a portfolio summary across every list", async () => {
  const overview = await readFile("src/app/page.tsx", "utf8");
  const route = await readFile("src/app/api/portfolio/route.ts", "utf8");
  const portfolio = await readFile("src/lib/portfolio.ts", "utf8");

  assert.match(overview, /\/api\/portfolio\?scope=all/);
  assert.match(route, /scope === "all"/);
  assert.match(portfolio, /\(\$2::uuid is null or i\.list_id = \$2\)/);
  assert.match(portfolio, /\(\$2::uuid is null or list_id = \$2\)/);
});
