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
  oauthIssuerUrl: new URL("https://magicbrain.es"),
  oauthResourceUrl: new URL("https://mcp.example.test/mcp"),
  oauthIntrospectionUrl: new URL("https://magicbrain.es/oauth/introspect"),
  allowPersonalApiKey: false,
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
          new Response(
            JSON.stringify({
              error: { code: "rate_limited", message: "Quota exceeded" },
            }),
            {
            status: 429,
            headers: { "retry-after": "60", "x-request-id": "req-rate" },
            },
          ),
      ),
    );

    await expect(client.request("sets")).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      message: "Magic Brain API returned 429: Quota exceeded",
      status: 429,
      retryAfter: "60",
      requestId: "req-rate",
    } satisfies Partial<MagicBrainApiError>);
  });
});

describe("MCP contract", () => {
  it("publishes public research and OAuth account tools", async () => {
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
        "build_portfolio_scenario",
        "create_portfolio_list",
        "get_card",
        "get_latest_market_brief",
        "get_card_rules",
        "explain_card_interaction",
        "get_latest_prices",
        "get_latest_set_opportunities",
        "get_market_brief_by_date",
        "get_market_movers",
        "get_personalized_opportunities",
        "get_portfolio_intelligence",
        "get_portfolio_list",
        "get_predict_recommendation",
        "get_price_history",
        "get_product_context",
        "list_market_briefs",
        "list_portfolio_lists",
        "list_sets",
        "predict_set_growth",
        "remove_from_watchlist",
        "remove_portfolio_holdings",
        "rename_portfolio_list",
        "search_cards",
        "search_opportunity_graph",
        "search_card_effects",
        "search_product_knowledge",
        "search_rules",
      ].sort(),
    );
    for (const tool of tools) {
      expect(tool.title).toBeTruthy();
      expect(tool.description?.length).toBeGreaterThan(40);
      expect(tool.annotations).toBeTruthy();
      expect(tool.inputSchema.properties).toHaveProperty("request_summary");
      expect(tool.annotations?.openWorldHint).toBe(
        [
          "ask_product_question",
          "ask_rules",
          "get_product_context",
          "search_product_knowledge",
          "search_rules",
        ].includes(tool.name)
          ? false
          : true,
      );
      expect(tool.outputSchema).toBeTruthy();
      if (
        [
          "build_portfolio_scenario",
          "get_latest_market_brief",
          "get_market_brief_by_date",
          "get_personalized_opportunities",
          "get_portfolio_intelligence",
          "get_portfolio_list",
          "get_predict_recommendation",
          "list_market_briefs",
          "list_portfolio_lists",
          "predict_set_growth",
          "search_opportunity_graph",
        ].includes(tool.name)
      ) {
        expect(tool.inputSchema.additionalProperties).toBe(false);
      }
    }

    expect(tools.find(({ name }) => name === "add_to_portfolio")?.annotations)
      .toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(tools.find(({ name }) => name === "remove_from_watchlist")?.annotations)
      .toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(tools.find(({ name }) => name === "remove_portfolio_holdings")?.annotations)
      .toMatchObject({ readOnlyHint: false, destructiveHint: true });

    await client.close();
    await server.close();
  });

  it("returns an explicit auth error for anonymous personal tools", async () => {
    const server = createMagicBrainMcpServer(
      config,
      vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: [] }))),
    );
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const response = await client.callTool({
      name: "get_portfolio_intelligence",
      arguments: {},
    });
    expect(response.isError).toBe(true);
    expect(JSON.stringify(response)).toContain("AUTHENTICATION_REQUIRED");
    await client.close();
    await server.close();
  });

  it("does not execute account writes without authentication", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const server = createMagicBrainMcpServer(config, fetchMock);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const response = await client.callTool({
      name: "add_to_watchlist",
      arguments: {
        card_id: "00000000-0000-4000-8000-000000000001",
        confirm: true,
      },
    });
    expect(response.isError).toBe(true);
    expect(JSON.stringify(response)).toContain("AUTHENTICATION_REQUIRED");
    expect(fetchMock).not.toHaveBeenCalled();
    await client.close();
    await server.close();
  });

  it("delegates authenticated personal reads without forwarding OAuth tokens", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBeNull();
      expect(headers.get("x-magic-brain-delegation")).toMatch(/^[^.]+\.[^.]+$/);
      expect(JSON.stringify(init)).not.toContain("oauth-secret-token");
      return new Response(JSON.stringify({ data: { summary: {} } }));
    });
    const server = createMagicBrainMcpServer(
      { ...config, delegationSecret: "x".repeat(32) },
      fetchMock,
      undefined,
      {
        token: "oauth-secret-token",
        clientId: "client-1",
        scopes: ["portfolio:read", "profile:read"],
        expiresAt: Math.floor(Date.now() / 1000) + 600,
        resource: config.oauthResourceUrl,
        extra: { subject: "00000000-0000-4000-8000-000000000001" },
      },
    );
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const response = await client.callTool({
      name: "get_portfolio_intelligence",
      arguments: {},
    });
    expect(response.isError).not.toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    await client.close();
    await server.close();
  });

  it("routes prediction and news tools only to public v1 contracts", async () => {
    const requests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      requests.push({ url: new URL(String(input)), init });
      return new Response(JSON.stringify({ data: { ok: true } }));
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
    await client.callTool({
      name: "predict_set_growth",
      arguments: {
        set_code: "fin",
        target: "sp500",
        horizon_months: 24,
        demand: 4,
        scarcity: 3,
        reprint_resilience: 2,
      },
    });
    await client.callTool({
      name: "build_portfolio_scenario",
      arguments: {
        set_code: "fin",
        budget_eur: 500,
        risk: "balanced",
        max_positions: 6,
      },
    });
    await client.callTool({
      name: "get_latest_market_brief",
      arguments: {},
    });
    await client.callTool({
      name: "list_market_briefs",
      arguments: { limit: 5 },
    });
    await client.callTool({
      name: "get_market_brief_by_date",
      arguments: { date: "2026-09-13" },
    });
    await client.callTool({
      name: "search_opportunity_graph",
      arguments: { query: "lotus", limit: 12 },
    });

    expect(requests.map(({ url }) => url.pathname)).toEqual([
      "/api/v1/predict/set",
      "/api/v1/predict/portfolio",
      "/api/v1/news/latest",
      "/api/v1/news",
      "/api/v1/news/2026-09-13",
      "/api/v1/opportunity-graph",
    ]);
    expect(requests[0]?.url.searchParams.get("reprints")).toBe("2");
    expect(requests[1]?.init?.method).toBe("POST");
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      setCode: "fin",
      budget: 500,
      risk: "balanced",
      maxPositions: 6,
    });
    expect(requests[3]?.url.searchParams.get("limit")).toBe("5");
    expect(requests[5]?.url.searchParams.get("q")).toBe("lotus");

    await client.close();
    await server.close();
  });

  it("rejects unknown scenario fields before calling the API", async () => {
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
      name: "build_portfolio_scenario",
      arguments: {
        set_code: "fin",
        budget_eur: 500,
        risk: "balanced",
        save: true,
      },
    });

    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

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

  it("routes market movers with bounded ranking inputs", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/api/v1/market/movers");
      expect(url.searchParams.get("direction")).toBe("losers");
      expect(url.searchParams.get("days")).toBe("7");
      expect(url.searchParams.get("limit")).toBe("50");
      return new Response(JSON.stringify({ data: { cards: [] } }));
    });
    const server = createMagicBrainMcpServer(config, fetchMock);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const result = await client.callTool({ name: "get_market_movers", arguments: { direction: "losers", days: 7, limit: 50 } });
    expect(result.isError).not.toBe(true);
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

    const invalidCalendarDate = await client.callTool({
      name: "get_price_history",
      arguments: {
        card_id: "card-1",
        start_date: "2026-02-30",
        end_date: "2026-03-01",
      },
    });

    expect(invalidCalendarDate.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    await client.close();
    await server.close();
  });
});
