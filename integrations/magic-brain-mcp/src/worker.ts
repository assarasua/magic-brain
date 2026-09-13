import { createMcpHandler } from "@modelcontextprotocol/server";
import rulesIndex from "../rules-data/rules-index.json" with { type: "json" };
import type { MagicBrainMcpConfig } from "./config.js";
import type { RulesIndex } from "./rules/types.js";
import { createMagicBrainMcpServer } from "./server.js";

const config: MagicBrainMcpConfig = {
  apiBaseUrl: new URL("https://magicbrain.es/api/v1/"),
  apiTimeoutMs: 8_000,
  maxResponseBytes: 524_288,
  maxToolChars: 90_000,
  port: 8788,
  bindHost: "127.0.0.1",
  allowedHosts: [],
  allowedOrigins: [],
};

const handler = createMcpHandler(
  () =>
    createMagicBrainMcpServer(config, fetch, {
      index: rulesIndex as RulesIndex,
    }),
  {
    legacy: "stateless",
    responseMode: "auto",
  },
);

const worker = {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/healthz") {
      return json({
        status: "ok",
        server: "magic-brain",
        version: "0.1.0",
        transport: "streamable-http",
        upstream: config.apiBaseUrl.toString(),
        rulesVersion: (rulesIndex as RulesIndex).source.version,
      });
    }
    if (url.pathname !== "/mcp") {
      return json({ error: "Not found" }, 404);
    }
    const origin = request.headers.get("origin");
    if (origin && !["https://magicbrain.es", "https://claude.ai"].includes(origin)) {
      return json({ error: "Origin is not allowed" }, 403);
    }
    const response = await handler.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

export default worker;

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
