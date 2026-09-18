import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("./web-mcp.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
const { getWebMcpDestination, webMcpDestinations } = await import(moduleUrl);

test("WebMCP destinations resolve only allowlisted route IDs", () => {
  assert.equal(getWebMcpDestination("market")?.path, "/market");
  assert.equal(getWebMcpDestination("https://example.com"), null);
  assert.equal(getWebMcpDestination("../settings"), null);
});

test("WebMCP destinations have unique IDs and internal paths", () => {
  assert.equal(new Set(webMcpDestinations.map(({ id }) => id)).size, webMcpDestinations.length);
  assert.ok(webMcpDestinations.every(({ path }) => path.startsWith("/") && !path.startsWith("//")));
});

test("WebMCP component exposes focused tools with structured output schemas", () => {
  const component = fs.readFileSync(
    new URL("../components/web-mcp-navigation.tsx", import.meta.url),
    "utf8",
  );
  const names = [
    "navigate_magic_brain",
    "search_magic_cards",
    "get_magic_market_movers",
    "list_magic_sets",
    "build_portfolio_scenario",
  ];

  for (const name of names) assert.match(component, new RegExp(`name: [\"']${name}[\"']`));
  assert.equal((component.match(/outputSchema:/g) ?? []).length, names.length + 1);
  assert.match(component, /structuredContent/);
});
