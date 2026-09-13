import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

test("root typechecking excludes standalone package trees", async () => {
  const config = await readJson("../tsconfig.json");

  assert.ok(config.exclude.includes("integrations"));
  assert.ok(config.exclude.includes("tools"));
});

test("standalone package checks still include their tests", async () => {
  for (const path of [
    "../integrations/magic-brain-mcp/tsconfig.json",
    "../integrations/magic-brain-dev-mcp/tsconfig.json",
    "../tools/magic-brain-cli/tsconfig.json",
  ]) {
    const config = await readJson(path);
    assert.ok(config.include.includes("test/**/*.ts"), path);
  }
});

test("standalone package builds compile source without tests", async () => {
  for (const path of [
    "../integrations/magic-brain-mcp/tsconfig.build.json",
    "../integrations/magic-brain-dev-mcp/tsconfig.build.json",
    "../tools/magic-brain-cli/tsconfig.build.json",
  ]) {
    const config = await readJson(path);
    assert.deepEqual(config.include, ["src/**/*.ts"], path);
    assert.ok(config.exclude.includes("test"), path);
  }
});
