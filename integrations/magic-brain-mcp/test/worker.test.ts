import { describe, expect, it, vi } from "vitest";
import worker from "../src/worker.js";

const endpoint = "https://magic-brain-mcp.assarasua.workers.dev/mcp";

describe("Cloudflare MCP transport compatibility", () => {
  it("publishes OAuth protected-resource discovery while keeping anonymous access", async () => {
    const metadata = await worker.fetch(
      new Request(
        "https://magic-brain-mcp.assarasua.workers.dev/.well-known/oauth-protected-resource/mcp",
      ),
    );
    expect(metadata.status).toBe(200);
    await expect(metadata.json()).resolves.toMatchObject({
      resource: endpoint,
      authorization_servers: ["https://magicbrain.es"],
    });
  });

  it("accepts initialize probes that omit the MCP Accept header", async () => {
    const response = await worker.fetch(
      new Request(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://claude.ai",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "claude-web", version: "1" },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://claude.ai",
    );
  });

  it("answers browser preflight requests for allowed connector origins", async () => {
    const response = await worker.fetch(
      new Request(endpoint, {
        method: "OPTIONS",
        headers: {
          Origin: "https://claude.ai",
          "Access-Control-Request-Method": "POST",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://claude.ai",
    );
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "POST",
    );
  });

  it("returns an MCP method response when GET has no stream session", async () => {
    const response = await worker.fetch(
      new Request(endpoint, {
        headers: {
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-06-18",
        },
      }),
    );
    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      error: { code: -32000 },
    });
  });

  it("challenges anonymous personal tool calls with RFC 9728 metadata", async () => {
    const response = await worker.fetch(
      new Request(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://claude.ai",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "get_portfolio_intelligence", arguments: {} },
        }),
      }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      "resource_metadata=",
    );
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://claude.ai",
    );
    expect(response.headers.get("access-control-expose-headers")).toContain(
      "www-authenticate",
    );
  });

  it("uses the web service binding for authenticated initialize", async () => {
    const publicFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("public egress unavailable"));
    const introspection = vi.fn(async () =>
      Response.json({
        active: true,
        client_id: "synthetic-client",
        sub: "synthetic-user",
        scope: "public:read profile:read",
        exp: Math.floor(Date.now() / 1000) + 600,
        aud: endpoint,
      }),
    );
    const env = {
      MAGIC_BRAIN_MCP_INTROSPECTION_CLIENT_ID: "mcp",
      MAGIC_BRAIN_MCP_INTROSPECTION_SECRET: "synthetic-secret",
      MAGIC_BRAIN_MCP_DELEGATION_SECRET: "d".repeat(32),
      MAGIC_BRAIN_WEB: { fetch: introspection },
    } as unknown as Parameters<typeof worker.fetch>[1];

    try {
      const response = await worker.fetch(
        new Request(endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json, text/event-stream",
            Authorization: "Bearer synthetic-access-token",
            "Content-Type": "application/json",
            "MCP-Protocol-Version": "2025-06-18",
            Origin: "https://claude.ai",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 3,
            method: "initialize",
            params: {
              protocolVersion: "2025-06-18",
              capabilities: {},
              clientInfo: { name: "claude-web", version: "1" },
            },
          }),
        }),
        env,
      );

      expect(response.status).toBe(200);
      expect(introspection).toHaveBeenCalledOnce();
    } finally {
      publicFetch.mockRestore();
    }
  });
});
