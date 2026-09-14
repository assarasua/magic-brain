import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import robots from "../src/app/robots.ts";

const root = new URL("../", import.meta.url);

test("robots permits only public content and framework assets", () => {
  const policy = robots();

  assert.deepEqual(policy, {
    rules: {
      userAgent: "*",
      allow: ["/developers", "/console", "/_next/static/", "/_next/image"],
      disallow: "/",
    },
    host: "https://magicbrain.es",
  });
  assert.equal("sitemap" in policy, false);
});

test("share-token pages retain layered noindex and private-cache controls", async () => {
  const [page, route, config] = await Promise.all([
    readFile(
      new URL("src/app/shared/portfolio/[token]/page.tsx", root),
      "utf8",
    ),
    readFile(
      new URL("src/app/api/shared/portfolio/[token]/route.ts", root),
      "utf8",
    ),
    readFile(new URL("next.config.ts", root), "utf8"),
  ]);

  assert.match(
    page,
    /robots:\s*\{\s*index:\s*false,\s*follow:\s*false,\s*noarchive:\s*true\s*\}/,
  );
  assert.match(route, /"Cache-Control": "private, no-store, max-age=0"/);
  assert.match(route, /"X-Robots-Tag": "noindex, nofollow, noarchive"/);
  assert.match(config, /source: "\/shared\/portfolio\/:path\*"/);
  assert.match(config, /source: "\/api\/shared\/portfolio\/:path\*"/);
});
