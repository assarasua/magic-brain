import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { createMagicBrainMcpServer } from "../src/server.js";

it("keeps every public guide input schema aligned with actual MCP discovery", async () => {
  const documented = JSON.parse(await readFile(new URL(
    "../../../src/components/integration-guides/tool-schemas.json", import.meta.url,
  ), "utf8"));
  const server = createMagicBrainMcpServer(loadConfig({
    MAGIC_BRAIN_API_BASE_URL: "https://example.test/api/v1/",
  }));
  const client = new Client({ name: "documentation-contract-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    expect(Object.keys(documented).sort()).toEqual(tools.map(tool => tool.name).sort());
    for (const tool of tools) {
      expect(documented[tool.name], tool.name).toEqual(tool.inputSchema);
    }
  } finally {
    await client.close();
    await server.close();
  }
});
