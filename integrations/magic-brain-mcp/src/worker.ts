import { createMcpHandler } from "@modelcontextprotocol/server";
import { Client } from "pg";
import { createHash } from "node:crypto";
import type { AuthInfo } from "@modelcontextprotocol/server";
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

const allowedOrigins = new Set([
  "https://magicbrain.es",
  "https://claude.ai",
  "https://www.claude.ai",
  "https://claude.com",
  "https://chatgpt.com",
  "https://chat.openai.com",
]);
const mcpResource = "https://magic-brain-mcp.assarasua.workers.dev/mcp";
const resourceMetadataUrl = "https://magic-brain-mcp.assarasua.workers.dev/.well-known/oauth-protected-resource";

const handler = createMcpHandler(
  () =>
    createMagicBrainMcpServer(config, (input, init) => fetch(input, init), {
      index: rulesIndex as RulesIndex,
    }),
  {
    legacy: "stateless",
    responseMode: "auto",
  },
);

type WorkerEnv = {
  HYPERDRIVE?: { connectionString: string };
};

type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

const worker = {
  async fetch(request: Request, env?: WorkerEnv, context?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/.well-known/oauth-protected-resource") {
      return Response.json({
        resource: mcpResource,
        authorization_servers: ["https://magicbrain.es"],
        bearer_methods_supported: ["header"],
        scopes_supported: ["portfolio:read", "portfolio:write", "watchlist:read", "watchlist:write"],
      }, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } });
    }
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
    if (origin && !allowedOrigins.has(origin)) {
      return json({ error: "Origin is not allowed" }, 403);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    let authInfo: AuthInfo | undefined;
    if (env?.HYPERDRIVE?.connectionString) {
      authInfo = await verifyOAuthToken(request, env.HYPERDRIVE.connectionString);
      if (!authInfo) {
        return Response.json(
          { error: "invalid_token", error_description: "Connect a Magic Brain account to use this MCP server." },
          {
            status: 401,
            headers: {
              "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}", scope="portfolio:read portfolio:write watchlist:read watchlist:write"`,
              ...Object.fromEntries(corsHeaders(origin)),
            },
          },
        );
      }
    }

    // Some hosted connector probes omit one or both MCP response media types.
    // Normalize them here so a transport-negotiation 406 is not mistaken for
    // an OAuth challenge by the client.
    const startedAt = Date.now();
    const call = request.method === "POST" ? await readToolCall(request.clone()) : null;
    const mcpRequest = normalizeAcceptHeader(request);
    const response = await handler.fetch(mcpRequest, authInfo ? { authInfo } : undefined);
    if (call && env?.HYPERDRIVE?.connectionString) {
      const audit = recordRemoteMcpCall(env.HYPERDRIVE.connectionString, {
        toolName: call.toolName,
        success: response.ok,
        durationMs: Date.now() - startedAt,
        ...(call.requestId ? { requestId: call.requestId } : {}),
        ...(call.requestSummary ? { requestSummary: call.requestSummary } : {}),
      }).catch((error) => console.error("Unable to record MCP audit event", error));
      if (context) context.waitUntil(audit);
      else await audit;
    }
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
    for (const [name, value] of corsHeaders(origin)) {
      headers.set(name, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

export default worker;

async function verifyOAuthToken(request: Request, connectionString: string): Promise<AuthInfo | undefined> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!token) return undefined;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query<{
      client_id: string; scopes: string[]; expires_at: Date;
    }>(
      `select client_id::text, scopes, access_expires_at as expires_at
       from app_oauth_tokens where access_token_hash = $1 and revoked_at is null
         and access_expires_at > now()`,
      [tokenHash],
    );
    const grant = result.rows[0];
    if (!grant) return undefined;
    return {
      token,
      clientId: grant.client_id,
      scopes: grant.scopes,
      expiresAt: Math.floor(new Date(grant.expires_at).getTime() / 1000),
      resource: new URL(mcpResource),
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function readToolCall(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string | number;
      method?: string;
      params?: { name?: string; arguments?: { request_summary?: unknown } };
    };
    if (body.method !== "tools/call" || typeof body.params?.name !== "string") return null;
    return {
      toolName: body.params.name.slice(0, 100),
      requestId: body.id === undefined ? undefined : String(body.id).slice(0, 200),
      requestSummary:
        typeof body.params.arguments?.request_summary === "string"
          ? body.params.arguments.request_summary.trim().slice(0, 500) || undefined
          : undefined,
    };
  } catch {
    return null;
  }
}

async function recordRemoteMcpCall(
  connectionString: string,
  event: {
    toolName: string;
    success: boolean;
    durationMs: number;
    requestId?: string;
    requestSummary?: string;
  },
) {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query(
      `insert into app_mcp_calls
         (source, tool_name, success, duration_ms, request_id, request_summary)
       values ('remote_mcp', $1, $2, $3, $4, $5)`,
      [
        event.toolName,
        event.success,
        event.durationMs,
        event.requestId ?? null,
        event.requestSummary ?? null,
      ],
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

function normalizeAcceptHeader(request: Request): Request {
  if (request.method !== "POST") return request;
  const accept = request.headers.get("accept") ?? "";
  if (
    accept.includes("application/json") &&
    accept.includes("text/event-stream")
  ) {
    return request;
  }
  const headers = new Headers(request.headers);
  headers.set("Accept", "application/json, text/event-stream");
  return new Request(request, { headers });
}

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Headers":
      "content-type, authorization, mcp-protocol-version, mcp-session-id",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Expose-Headers": "mcp-session-id, www-authenticate",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

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
