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

test("WebMCP registers the remote MCP catalogue through document.modelContext", () => {
  const component = fs.readFileSync(
    new URL("../components/web-mcp-navigation.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /document as Document & \{ modelContext\?: ModelContext \}/);
  assert.match(component, /method: "tools\/list" \| "tools\/call"/);
  assert.match(component, /listPublicRemoteTools/);
  assert.match(component, /callRemoteTool\(tool\.name, input\)/);
  assert.match(component, /name: "navigate_magic_brain"/);
  assert.match(component, /authenticatedToolNames/);
});
