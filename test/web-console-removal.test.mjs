import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

const removedPaths = [
  "src/app/console/page.tsx",
  "src/app/console/console-client.tsx",
  "src/app/console/console.module.css",
  "src/app/api/console/events/route.ts",
  "src/app/api/console/status/route.ts",
  "src/lib/console-command.ts",
  "src/lib/console-command.test.mjs",
];

test("embedded web console routes and implementation stay removed", async () => {
  await Promise.all(
    removedPaths.map(async (path) => {
      await assert.rejects(access(new URL(path, root)), { code: "ENOENT" });
    }),
  );
});

test("product navigation and developer surfaces do not expose /console", async () => {
  const surfaces = await Promise.all(
    [
      "src/components/product-navigation.ts",
      "src/components/app-shell.tsx",
      "src/components/language-provider.tsx",
      "src/app/developers/developers-hub.tsx",
      "src/app/robots.ts",
    ].map((path) => readFile(new URL(path, root), "utf8")),
  );

  for (const source of surfaces) {
    assert.doesNotMatch(source, /["'`]\/console(?:["'`/?#]|$)/i);
    assert.doesNotMatch(source, /\bweb console\b|\bconsola web\b/i);
  }
});

test("standalone developer interfaces remain present", async () => {
  await Promise.all(
    [
      "tools/magic-brain-cli/src/index.ts",
      "src/app/api/v1/openapi.json/route.ts",
      "src/app/oauth/authorize/route.ts",
      "integrations/magic-brain-mcp/src/index.ts",
      "integrations/magic-brain-dev-mcp/src/index.ts",
    ].map((path) => access(new URL(path, root))),
  );
});
