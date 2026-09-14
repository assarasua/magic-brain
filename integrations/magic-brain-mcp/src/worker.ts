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
};

const allowedOrigins = new Set([
  "https://magicbrain.es",
  "https://claude.ai",
  "https://www.claude.ai",
  "https://claude.com",
]);

const worker = {
  async fetch(request: Request, env: WorkerEnv = {}): Promise<Response> {
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
