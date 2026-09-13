import { createServer } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { loadDevConfig } from "./config.js";
import { createDevMcpServer } from "./server.js";

const config = loadDevConfig();
const handler = createMcpHandler(() => createDevMcpServer(config), {
  legacy: "stateless",
  responseMode: "auto",
  onerror: (error) => {
    console.error(`[magic-brain-dev-mcp] ${error.message}`);
  },
});
const nodeHandler = toNodeHandler(handler);
const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/healthz") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        status: "ok",
        server: "magic-brain-development",
        transport: "streamable-http",
        upstream: config.apiBaseUrl.toString(),
        remoteReadOnly: !["localhost", "127.0.0.1", "::1"].includes(
          config.apiBaseUrl.hostname,
        ),
      }),
    );
    return;
  }
  if (url.pathname !== "/mcp") {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
    return;
  }
  if (!request.method || !request.url) {
    response.writeHead(400);
    response.end();
    return;
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += value.length;
    if (total > 1_048_576) {
      response.writeHead(413);
      response.end();
      return;
    }
    chunks.push(value);
  }
  let body: unknown;
  if (chunks.length) {
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }
  }
  await nodeHandler(
    request as Parameters<typeof nodeHandler>[0],
    response,
    body,
  );
});

server.requestTimeout = 35_000;
server.listen(config.port, "127.0.0.1", () => {
  console.error(
    `[magic-brain-dev-mcp] listening on http://127.0.0.1:${config.port}/mcp`,
  );
});

const shutdown = async () => {
  server.close();
  await handler.close();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
