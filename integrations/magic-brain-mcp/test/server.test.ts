import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MagicBrainApiClient, MagicBrainApiError } from "../src/api-client.js";
import { loadConfig, type MagicBrainMcpConfig } from "../src/config.js";
import { createMagicBrainMcpServer } from "../src/server.js";

const config: MagicBrainMcpConfig = {
  apiBaseUrl: new URL("https://example.test/api/v1/"),
  apiKey: "secret-test-key",
  apiTimeoutMs: 1_000,
  maxResponseBytes: 4_096,
  maxToolChars: 8_192,
  port: 8788,
  bindHost: "127.0.0.1",
  allowedHosts: ["localhost"],
  allowedOrigins: [],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("configuration", () => {
  it("requires HTTPS for non-local API hosts", () => {
    expect(() =>
      loadConfig({ MAGIC_BRAIN_API_BASE_URL: "http://example.com/api/v1" }),
    ).toThrow(/must use HTTPS/);
  });

  it("normalizes the API base path", () => {
    const loaded = loadConfig({
      MAGIC_BRAIN_API_BASE_URL: "https://example.com/api/v1",
    });
    expect(loaded.apiBaseUrl.toString()).toBe("https://example.com/api/v1/");
  });
});

describe("MagicBrainApiClient", () => {
  it("sends optional API credentials without exposing them in results", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe("https://example.test/api/v1/cards?q=lotus");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer secret-test-key",
      );
      return new Response(JSON.stringify({ data: [{ id: "card-1" }] }), {
        headers: { "x-request-id": "req-123" },
      });
    });
    const client = new MagicBrainApiClient(config, fetchMock);

    const result = await client.request("cards", { query: { q: "lotus" } });

    expect(result.requestId).toBe("req-123");
    expect(JSON.stringify(result)).not.toContain("secret-test-key");
  });

  it("stops reading oversized chunked responses", async () => {
    const oversized = "x".repeat(config.maxResponseBytes + 1);
    const client = new MagicBrainApiClient(
      config,
      vi.fn<typeof fetch>(async () => new Response(oversized)),
    );

    await expect(client.request("cards")).rejects.toMatchObject({
      code: "RESPONSE_TOO_LARGE",
    } satisfies Partial<MagicBrainApiError>);
  });

  it("returns actionable upstream errors", async () => {
    const client = new MagicBrainApiClient(
      config,
      vi.fn<typeof fetch>(
        async () =>
          new Response(JSON.stringify({ message: "Quota exceeded" }), {
            status: 429,
            headers: { "retry-after": "60", "x-request-id": "req-rate" },
          }),
      ),
    );

    await expect(client.request("sets")).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      status: 429,
      retryAfter: "60",
      requestId: "req-rate",
    } satisfies Partial<MagicBrainApiError>);
  });
});

describe("MCP contract", () => {
  it("publishes public research plus OAuth-scoped account tools", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ data: [] })),
    );
    const server = createMagicBrainMcpServer(config, fetchMock);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const { tools } = await client.listTools();

    expect(tools.map(({ name }) => name).sort()).toEqual(
      [
        "ask_product_question",
        "ask_rules",
        "add_to_portfolio",
        "add_to_watchlist",
        "get_card",
        "get_latest_prices",
        "get_latest_set_opportunities",
        "get_price_history",
        "get_portfolio",
        "get_product_context",
        "get_watchlist",
        "list_sets",
        "remove_from_portfolio",
        "remove_from_watchlist",
        "search_cards",
        "search_product_knowledge",
        "search_rules",
      ].sort(),
    );
    for (const tool of tools) {
      expect(tool.title).toBeTruthy();
      expect(tool.description?.length).toBeGreaterThan(40);
      const writeTool = tool.name.startsWith("add_") || tool.name.startsWith("remove_");
      expect(tool.annotations?.readOnlyHint).toBe(!writeTool);
      expect(tool.annotations?.destructiveHint).toBe(tool.name.startsWith("remove_"));
      expect(tool.annotations?.openWorldHint).toBe(![
          "ask_product_question",
          "ask_rules",
          "add_to_portfolio",
          "add_to_watchlist",
          "get_product_context",
          "get_portfolio",
          "get_watchlist",
          "remove_from_portfolio",
          "remove_from_watchlist",
          "search_product_knowledge",
          "search_rules",
        ].includes(tool.name));
      expect(tool.outputSchema).toBeTruthy();
      expect(tool.inputSchema.properties).toHaveProperty("request_summary");
    }

    await client.close();
    await server.close();
  });

  it("routes latest-set opportunities to the versioned API", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/api/v1/latest-set/opportunities");
      expect(url.searchParams.get("set")).toBe("fin");
      expect(url.searchParams.get("limit")).toBe("5");
      return new Response(
        JSON.stringify({
          data: [{ card_id: "card-1", pick_score: 0.81 }],
          meta: { source: "Cardmarket", as_of: "2026-09-13" },
        }),
      );
    });
    const server = createMagicBrainMcpServer(config, fetchMock);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    await client.listTools();
    const result = await client.callTool({
      name: "get_latest_set_opportunities",
      arguments: { set_code: "fin", limit: 5 },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      attribution: { service: "Magic Brain Public API" },
    });

    await client.close();
    await server.close();
  });

  it("rejects invalid history ranges before calling the API", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const server = createMagicBrainMcpServer(config, fetchMock);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    await client.listTools();

    const result = await client.callTool({
      name: "get_price_history",
      arguments: {
        card_id: "card-1",
        start_date: "2026-09-13",
        end_date: "2025-09-13",
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining(
            "end_date must be on or after start_date",
          ),
        }),
      ]),
    );
    expect(fetchMock).not.toHaveBeenCalled();

    await client.close();
    await server.close();
  });
});
