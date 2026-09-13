import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";
import { loadDevConfig, type DevMcpConfig } from "../src/config.js";
import { createDevMcpServer } from "../src/server.js";

const config: DevMcpConfig = {
  apiBaseUrl: new URL("http://127.0.0.1:3000/api/v1/"),
  apiKey: "mb_test_private",
  repoRoot: new URL("../../..", import.meta.url).pathname,
  timeoutMs: 1_000,
  maxOutputChars: 60_000,
  port: 8790,
};

describe("development MCP safety", () => {
  it("rejects remote targets unless explicitly read-only", () => {
    expect(() =>
      loadDevConfig({
        MAGIC_BRAIN_DEV_API_BASE_URL: "https://example.test/api/v1/",
      }),
    ).toThrow(/localhost by default/);
    expect(
      loadDevConfig({
        MAGIC_BRAIN_DEV_API_BASE_URL: "https://example.test/api/v1/",
        MAGIC_BRAIN_DEV_ALLOW_REMOTE_READONLY: "true",
      }).apiBaseUrl.hostname,
    ).toBe("example.test");
  });

  it("publishes only bounded development tools", async () => {
    const server = createDevMcpServer(
      config,
      vi.fn<typeof fetch>(
        async () => new Response(JSON.stringify({ openapi: "3.1.0", paths: {} })),
      ),
    );
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const { tools } = await client.listTools();
    expect(tools.map(({ name }) => name).sort()).toEqual(
      [
        "call_allowlisted_dev_api",
        "diagnose_dev_health",
        "generate_fixture_request",
        "inspect_model_artifact_status",
        "inspect_openapi_contract",
        "run_bounded_contract_suite",
        "validate_migrations",
      ].sort(),
    );
    expect(tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
    expect(tools.every((tool) => !tool.annotations?.destructiveHint)).toBe(true);

    const invalid = await client.callTool({
      name: "call_allowlisted_dev_api",
      arguments: { operation: "arbitrary_shell", query: {} },
    });
    expect(invalid.isError).toBe(true);
    await client.close();
    await server.close();
  });

  it("calls only the selected allowlisted path and hides credentials", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      expect(new URL(String(input)).pathname).toBe(
        "/api/v1/opportunity-graph",
      );
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer mb_test_private",
      );
      return new Response(JSON.stringify({ data: { nodes: [] } }));
    });
    const server = createDevMcpServer(config, fetchMock);
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const response = await client.callTool({
      name: "call_allowlisted_dev_api",
      arguments: {
        operation: "opportunity_graph",
        query: { q: "lotus", limit: 12 },
      },
    });
    expect(response.isError).not.toBe(true);
    expect(JSON.stringify(response)).not.toContain("mb_test_private");
    await client.close();
    await server.close();
  });

  it("summarizes a bounded large OpenAPI document", async () => {
    const document = {
      openapi: "3.1.0",
      info: {
        title: "Magic Brain Data API",
        version: "1.3.0",
        description: "x".repeat(70_000),
      },
      paths: {
        "/cards": { get: { operationId: "listCards" } },
        "/portfolio": { get: { operationId: "getPortfolio" } },
      },
      components: {
        securitySchemes: { ApiKey: {}, OAuth2: {} },
      },
    };
    const server = createDevMcpServer(
      config,
      vi.fn<typeof fetch>(
        async () => new Response(JSON.stringify(document)),
      ),
    );
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const response = await client.callTool({
      name: "inspect_openapi_contract",
      arguments: {},
    });
    expect(response.isError).not.toBe(true);
    expect(JSON.stringify(response)).toContain('"operationCount":2');
    expect(JSON.stringify(response)).not.toContain("x".repeat(1_000));
    await client.close();
    await server.close();
  });
});
