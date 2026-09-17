import {
  bearerAuthChallengeResponse,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  OAuthError,
  OAuthErrorCode,
  oauthMetadataResponse,
  verifyBearerToken,
  type AuthInfo,
} from "@modelcontextprotocol/server";
import { Client } from "pg";
import rulesIndex from "../rules-data/rules-index.json" with { type: "json" };
import type { MagicBrainMcpConfig } from "./config.js";
import type { RulesIndex } from "./rules/types.js";
import { createMagicBrainMcpServer } from "./server.js";
import { MagicBrainTokenVerifier } from "./oauth.js";

type WorkerEnv = {
  MAGIC_BRAIN_MCP_INTROSPECTION_CLIENT_ID?: string;
  MAGIC_BRAIN_MCP_INTROSPECTION_SECRET?: string;
  MAGIC_BRAIN_MCP_DELEGATION_SECRET?: string;
  MAGIC_BRAIN_WEB?: {
    fetch(request: Request): Promise<Response>;
  };
  HYPERDRIVE?: { connectionString: string };
};

type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

const allowedOrigins = new Set([
  "https://magicbrain.es",
  "https://claude.ai",
  "https://www.claude.ai",
  "https://claude.com",
]);

const worker = {
  async fetch(
    request: Request,
    env: WorkerEnv = {},
    context?: ExecutionContext,
  ): Promise<Response> {
    const config = workerConfig(env);
    const url = new URL(request.url);
    const oauthMetadata = {
      issuer: config.oauthIssuerUrl.toString().replace(/\/$/, ""),
      authorization_endpoint: new URL(
        "/oauth/authorize",
        config.oauthIssuerUrl,
      ).toString(),
      token_endpoint: new URL("/oauth/token", config.oauthIssuerUrl).toString(),
      registration_endpoint: new URL(
        "/oauth/register",
        config.oauthIssuerUrl,
      ).toString(),
      revocation_endpoint: new URL(
        "/oauth/revoke",
        config.oauthIssuerUrl,
      ).toString(),
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: [
        "public:read",
        "portfolio:read",
        "portfolio:write",
        "lists:read",
        "lists:write",
        "alerts:manage",
        "shares:manage",
        "profile:read",
      ],
    };
    const metadataResponse = oauthMetadataResponse(request, {
      oauthMetadata,
      resourceServerUrl: config.oauthResourceUrl,
      resourceName: "Magic Brain MCP",
      serviceDocumentationUrl: new URL(
        "/developers",
        config.oauthIssuerUrl,
      ),
      scopesSupported: oauthMetadata.scopes_supported,
    });
    if (metadataResponse) return metadataResponse;
    if (request.method === "GET" && url.pathname === "/healthz") {
      return json({
        status: "ok",
        server: "magic-brain",
        version: "0.1.0",
        transport: "streamable-http",
        upstream: config.apiBaseUrl.toString(),
        rulesVersion: (rulesIndex as RulesIndex).source.version,
        authentication: "optional-oauth-2.1-pkce",
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

    const startedAt = Date.now();
    const call = request.method === "POST"
      ? await readToolCall(request.clone())
      : null;
    // Normalize before inspection so the same request is passed to the SDK.
    const mcpRequest = normalizeAcceptHeader(request);
    const requiredScopes = await personalToolScopes(mcpRequest);
    const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(
      config.oauthResourceUrl,
    );
    let authInfo: AuthInfo | undefined;
    const authorization = request.headers.get("authorization");
    if (authorization) {
      try {
        authInfo = await verifyBearerToken(authorization, {
          verifier: new MagicBrainTokenVerifier(
            config,
            introspectionFetch(env.MAGIC_BRAIN_WEB),
          ),
          requiredScopes,
          resourceMetadataUrl,
        });
      } catch (error) {
        return withCors(
          bearerAuthChallengeResponse(error, { resourceMetadataUrl }),
          origin,
        );
      }
    } else if (requiredScopes.length) {
      return withCors(
        bearerAuthChallengeResponse(
          new OAuthError(
            OAuthErrorCode.InvalidToken,
            "Authentication is required for this personal tool",
          ),
          { requiredScopes, resourceMetadataUrl },
        ),
        origin,
      );
    }

    const handler = createMcpHandler(
      (context) =>
        createMagicBrainMcpServer(
          config,
          (input, init) => fetch(input, init),
          { index: rulesIndex as RulesIndex },
          context.authInfo,
        ),
      { legacy: "stateless", responseMode: "auto" },
    );
    const response = await handler.fetch(
      mcpRequest,
      authInfo ? { authInfo } : undefined,
    );
    if (call && env.HYPERDRIVE?.connectionString) {
      const audit = recordRemoteMcpCall(env.HYPERDRIVE.connectionString, {
        toolName: call.toolName,
        success: response.ok,
        durationMs: Date.now() - startedAt,
        ...(call.requestId ? { requestId: call.requestId } : {}),
        ...(call.requestSummary ? { requestSummary: call.requestSummary } : {}),
        metadata: {
          auth_mode: authInfo ? "oauth" : "anonymous",
          oauth_client_id: authInfo?.clientId?.slice(0, 200) ?? null,
          oauth_scopes: authInfo?.scopes.slice().sort().join(" ") || null,
          protocol_version: request.headers.get("mcp-protocol-version")?.slice(0, 40) ?? null,
          client_user_agent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
          origin: origin ? new URL(origin).origin.slice(0, 200) : null,
          argument_names: call.argumentNames.join(",").slice(0, 500) || null,
          prompt_intent: call.requestContext?.intent ?? null,
          prompt_language: call.requestContext?.language ?? null,
          requested_output_format: call.requestContext?.output_format ?? null,
          prompt_subject: call.requestContext?.subject ?? null,
          http_status: response.status,
        },
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

async function readToolCall(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string | number;
      method?: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
    };
    if (body.method !== "tools/call" || typeof body.params?.name !== "string") {
      return null;
    }
    return {
      toolName: body.params.name.slice(0, 100),
      requestId: body.id === undefined ? undefined : String(body.id).slice(0, 200),
      requestSummary:
        typeof body.params.arguments?.request_summary === "string"
          ? body.params.arguments.request_summary.trim().slice(0, 500) || undefined
          : undefined,
      requestContext: parseRequestContext(body.params.arguments?.request_context),
      argumentNames: Object.keys(body.params.arguments ?? {})
        .filter((name) => name !== "request_summary" && name !== "request_context")
        .sort()
        .slice(0, 50),
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
    metadata: Record<string, string | number | boolean | null>;
  },
) {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query(
      `insert into app_mcp_calls
         (source, tool_name, success, duration_ms, request_id, request_summary, metadata)
       values ('remote_mcp', $1, $2, $3, $4, $5, $6::jsonb)`,
      [
        event.toolName,
        event.success,
        event.durationMs,
        event.requestId ?? null,
        event.requestSummary ?? null,
        JSON.stringify(event.metadata),
      ],
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

function parseRequestContext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const intents = new Set(["research", "compare", "monitor", "manage_collection", "manage_watchlist", "developer", "rules", "other"]);
  const languages = new Set(["en", "es", "other"]);
  const formats = new Set(["answer", "list", "table", "analysis", "action"]);
  if (typeof input.intent !== "string" || !intents.has(input.intent)) return undefined;
  return {
    intent: input.intent,
    ...(typeof input.language === "string" && languages.has(input.language) ? { language: input.language } : {}),
    ...(typeof input.output_format === "string" && formats.has(input.output_format) ? { output_format: input.output_format } : {}),
    ...(typeof input.subject === "string" && input.subject.trim() ? { subject: input.subject.trim().slice(0, 120) } : {}),
  };
}

function workerConfig(env: WorkerEnv): MagicBrainMcpConfig {
  const oauthIssuerUrl = new URL("https://magicbrain.es");
  const oauthResourceUrl = new URL(
    "https://magic-brain-mcp.assarasua.workers.dev/mcp",
  );
  return {
    apiBaseUrl: new URL("https://magicbrain.es/api/v1/"),
    apiTimeoutMs: 8_000,
    maxResponseBytes: 524_288,
    maxToolChars: 90_000,
    port: 8788,
    bindHost: "127.0.0.1",
    allowedHosts: [],
    allowedOrigins: [],
    oauthIssuerUrl,
    oauthResourceUrl,
    oauthIntrospectionUrl: new URL("/oauth/introspect", oauthIssuerUrl),
    ...(env.MAGIC_BRAIN_MCP_INTROSPECTION_CLIENT_ID
      ? {
          oauthIntrospectionClientId:
            env.MAGIC_BRAIN_MCP_INTROSPECTION_CLIENT_ID,
        }
      : {}),
    ...(env.MAGIC_BRAIN_MCP_INTROSPECTION_SECRET
      ? { oauthIntrospectionSecret: env.MAGIC_BRAIN_MCP_INTROSPECTION_SECRET }
      : {}),
    ...(env.MAGIC_BRAIN_MCP_DELEGATION_SECRET
      ? { delegationSecret: env.MAGIC_BRAIN_MCP_DELEGATION_SECRET }
      : {}),
    allowPersonalApiKey: false,
  };
}

function withCors(response: Response, origin: string | null) {
  const headers = new Headers(response.headers);
  for (const [name, value] of corsHeaders(origin)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function personalToolScopes(request: Request): Promise<string[]> {
  if (request.method !== "POST") return [];
  try {
    const body = (await request.clone().json()) as {
      method?: string;
      params?: { name?: string };
    };
    if (body.method !== "tools/call") return [];
    const scopesByTool: Record<string, string[]> = {
      get_personalized_opportunities: ["profile:read"],
      get_predict_recommendation: ["profile:read"],
      get_portfolio_intelligence: ["portfolio:read", "profile:read"],
      list_portfolio_lists: ["lists:read"],
      get_portfolio_list: ["lists:read", "portfolio:read", "profile:read"],
      add_to_portfolio: ["portfolio:write"],
      add_to_watchlist: ["alerts:manage"],
      remove_from_watchlist: ["alerts:manage"],
      create_portfolio_list: ["lists:write"],
      rename_portfolio_list: ["lists:write"],
      remove_portfolio_holdings: ["portfolio:write", "lists:write"],
    };
    return scopesByTool[body.params?.name ?? ""] ?? [];
  } catch {
    return [];
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

function introspectionFetch(
  service: WorkerEnv["MAGIC_BRAIN_WEB"],
): typeof fetch {
  if (!service) return fetch;
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    service.fetch(new Request(input, init))) as typeof fetch;
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
