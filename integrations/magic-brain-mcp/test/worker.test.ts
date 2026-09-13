import { describe, expect, it } from "vitest";
import worker from "../src/worker.js";

const endpoint = "https://magic-brain-mcp.assarasua.workers.dev/mcp";

describe("Cloudflare MCP transport compatibility", () => {
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
});
