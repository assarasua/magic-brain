import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { loadConfig, type MagicBrainMcpConfig } from "./config.js";
import { createMagicBrainMcpServer } from "./server.js";

const MAX_MCP_REQUEST_BYTES = 1_048_576;

export function createMagicBrainHttpServer(
  config: MagicBrainMcpConfig = loadConfig(),
) {
  const handler = createMcpHandler(
    () => createMagicBrainMcpServer(config),
    {
      legacy: "stateless",
      responseMode: "auto",
      onerror: (error) => {
        console.error(`[magic-brain-mcp] ${error.message}`);
      },
    },
  );
  const nodeHandler = toNodeHandler(handler, {
    onerror: (error) => {
      console.error(`[magic-brain-mcp] HTTP adapter error: ${error.message}`);
    },
  });

  const httpServer = createServer(async (request, response) => {
    setSecurityHeaders(response);
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && url.pathname === "/healthz") {
      sendJson(response, 200, {
        status: "ok",
        server: "magic-brain",
        version: "0.1.0",
        transport: "streamable-http",
        upstream: config.apiBaseUrl.toString(),
      });
      return;
    }

    if (url.pathname !== "/mcp") {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    if (!isAllowedHost(request, config.allowedHosts)) {
      sendJson(response, 403, { error: "Host is not allowed" });
      return;
    }
    if (!isAllowedOrigin(request, config.allowedOrigins)) {
      sendJson(response, 403, { error: "Origin is not allowed" });
      return;
    }

    try {
      if (!request.method || !request.url) {
        throw new Error("Request method and URL are required");
      }
      const parsedBody =
        request.method === "POST"
          ? await readJsonBody(request, MAX_MCP_REQUEST_BYTES)
          : undefined;
      await nodeHandler(
        request as Parameters<typeof nodeHandler>[0],
        response,
        parsedBody,
      );
    } catch (error) {
      if (!response.headersSent) {
        sendJson(response, 400, {
          jsonrpc: "2.0",
          error: {
            code: -32700,
            message:
              error instanceof Error ? error.message : "Invalid request body",
          },
          id: null,
        });
      } else {
        response.end();
      }
    }
  });

  httpServer.requestTimeout = 35_000;
  httpServer.headersTimeout = 10_000;
  httpServer.keepAliveTimeout = 5_000;
  httpServer.maxHeadersCount = 100;

  return { httpServer, closeMcpHandler: handler.close };
}

async function readJsonBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<unknown> {
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`Request body exceeds ${maxBytes} bytes`);
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      request.resume();
      throw new Error(`Request body exceeds ${maxBytes} bytes`);
    }
    chunks.push(buffer);
  }

  if (total === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("Request body must contain valid JSON");
  }
}

function isAllowedHost(
  request: IncomingMessage,
  allowedHosts: string[],
): boolean {
  const host = request.headers.host;
  if (!host || allowedHosts.length === 0) return false;
  try {
    return allowedHosts.includes(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

function isAllowedOrigin(
  request: IncomingMessage,
  allowedOrigins: string[],
): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return allowedOrigins.includes(new URL(origin).origin);
  } catch {
    return false;
  }
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cache-Control", "no-store");
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const { httpServer, closeMcpHandler } = createMagicBrainHttpServer(config);

  httpServer.listen(config.port, config.bindHost, () => {
    console.error(
      `[magic-brain-mcp] listening on http://${config.bindHost}:${config.port}/mcp`,
    );
  });

  const shutdown = async () => {
    httpServer.close();
    await closeMcpHandler();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
