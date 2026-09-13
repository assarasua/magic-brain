import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { query } from "@/lib/db";
import {
  oauthConfiguration,
  recordOAuthAudit,
  verifyOAuthAccessToken,
} from "@/lib/oauth";
import { ApiError, LocalRateLimiter, PUBLIC_API_LIMITS } from "./core";

type RateLimitBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

type PublicApiEnv = {
  PUBLIC_API_ANONYMOUS_RATE_LIMITER?: RateLimitBinding;
  PUBLIC_API_KEY_RATE_LIMITER?: RateLimitBinding;
};

type KeyRow = {
  id: string;
  owner_id: string;
  prefix: string;
  scopes: string[];
  tier: string;
};

export type PublicApiAccess = {
  kind: "anonymous" | "key" | "oauth";
  keyId?: string;
  ownerId?: string;
  scopes: string[];
  tier: string;
  limit: number;
  remaining?: number;
  retryAfter?: number;
};

export type PublicApiAccessPolicy = {
  allowAnonymous?: boolean;
  requiredScopes?: readonly string[];
};

const anonymousFallback = new LocalRateLimiter(PUBLIC_API_LIMITS.anonymous);
const keyFallback = new LocalRateLimiter(PUBLIC_API_LIMITS.key);

function apiKeyFrom(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return request.headers.get("x-api-key")?.trim() || null;
}

function clientIp(request: Request) {
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;
  if (process.env.NODE_ENV !== "production") {
    return (
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
    );
  }
  return "unknown";
}

function getBinding(kind: "anonymous" | "key") {
  try {
    const env = getCloudflareContext().env as unknown as PublicApiEnv;
    return kind === "key"
      ? env.PUBLIC_API_KEY_RATE_LIMITER
      : env.PUBLIC_API_ANONYMOUS_RATE_LIMITER;
  } catch {
    return undefined;
  }
}

async function consumeRateLimit(
  kind: "anonymous" | "key",
  identifier: string,
): Promise<{
  success: boolean;
  limit: number;
  remaining?: number;
  retryAfter?: number;
}> {
  const limit = PUBLIC_API_LIMITS[kind];
  const binding = getBinding(kind);
  if (binding) {
    const result = await binding.limit({ key: identifier });
    return { success: result.success, limit };
  }

  if (process.env.NODE_ENV === "production") {
    throw new ApiError(
      503,
      "rate_limit_unavailable",
      "API rate limiting is temporarily unavailable",
    );
  }
  return (kind === "key" ? keyFallback : anonymousFallback).consume(identifier);
}

export async function authorizePublicRequest(
  request: Request,
  policy: PublicApiAccessPolicy = {},
): Promise<PublicApiAccess> {
  const suppliedKey = apiKeyFrom(request);
  let keyRow: KeyRow | undefined;
  let oauthAccess:
    | { ownerId: string; keyId: string; scopes: string[] }
    | undefined;

  if (suppliedKey) {
    if (/^mba_[A-Za-z0-9_-]{32,}$/.test(suppliedKey)) {
      const token = await verifyOAuthAccessToken(suppliedKey);
      if (!token || token.resource !== oauthConfiguration().apiResource) {
        throw new ApiError(401, "invalid_token", "The access token is invalid");
      }
      oauthAccess = {
        ownerId: token.owner_id,
        keyId: `oauth:${token.client_id}`,
        scopes: token.scopes,
      };
    } else if (!/^mb_(?:live|test)_[A-Za-z0-9_-]{32,}$/.test(suppliedKey)) {
      throw new ApiError(401, "invalid_api_key", "The API key is invalid");
    } else {
      const hash = createHash("sha256").update(suppliedKey).digest("hex");
      const result = await query<KeyRow>(
        `
          select keys.id::text, keys.owner_id::text, keys.prefix, keys.scopes, keys.tier
          from app_api_keys keys
          join app_users owner on owner.id = keys.owner_id
          where keys.secret_hash = $1 and keys.revoked_at is null
            and owner.authenticated_at is not null
          limit 1
        `,
        [hash],
      );
      keyRow = result.rows[0];
      if (!keyRow || !keyRow.scopes.includes("data:read")) {
        throw new ApiError(401, "invalid_api_key", "The API key is invalid");
      }
    }
  } else {
    oauthAccess = verifyDelegation(request);
  }

  if (!keyRow && !oauthAccess && policy.allowAnonymous === false) {
    throw new ApiError(
      401,
      "api_key_required",
      "A user-scoped API key is required",
    );
  }
  const missingScopes = (policy.requiredScopes ?? []).filter(
    (scope) => !(keyRow?.scopes ?? oauthAccess?.scopes ?? []).includes(scope),
  );
  if (missingScopes.length) {
    if (oauthAccess) {
      await recordOAuthAudit(
        "scope_denied",
        oauthAccess.ownerId,
        oauthAccess.keyId.replace(/^oauth:/, ""),
        missingScopes,
        request.headers.get("x-request-id"),
      );
    }
    throw new ApiError(
      403,
      "insufficient_scope",
      "The API key does not have the required scope",
      { requiredScopes: missingScopes },
    );
  }

  const kind = keyRow ? "key" : oauthAccess ? "oauth" : "anonymous";
  const identifier = keyRow || oauthAccess
    ? `api-key:${keyRow?.id ?? oauthAccess?.keyId}`
    : `anonymous:${clientIp(request)}`;
  const rate = await consumeRateLimit(
    kind === "anonymous" ? "anonymous" : "key",
    identifier,
  );
  if (!rate.success) {
    throw new ApiError(429, "rate_limit_exceeded", "Rate limit exceeded", {
      retryAfter: rate.retryAfter ?? 60,
    });
  }

  if (keyRow) {
    await query(
      `
        update app_api_keys
        set last_used_at = now()
        where id = $1
          and (last_used_at is null or last_used_at < now() - interval '5 minutes')
      `,
      [keyRow.id],
    );
  }

  return {
    kind,
    ...(keyRow || oauthAccess
      ? {
          keyId: keyRow?.id ?? oauthAccess?.keyId,
          ownerId: keyRow?.owner_id ?? oauthAccess?.ownerId,
        }
      : {}),
    scopes: keyRow?.scopes ?? oauthAccess?.scopes ?? [],
    tier: keyRow?.tier ?? (oauthAccess ? "oauth" : "anonymous"),
    limit: rate.limit,
    remaining: rate.remaining,
    retryAfter: rate.retryAfter,
  };
}

function verifyDelegation(request: Request) {
  const value = request.headers.get("x-magic-brain-delegation");
  const secret = process.env.MAGIC_BRAIN_MCP_DELEGATION_SECRET;
  if (!value || !secret) return undefined;
  const [encoded, suppliedSignature] = value.split(".");
  if (!encoded || !suppliedSignature) {
    throw new ApiError(401, "invalid_token", "Delegation token is invalid");
  }
  const expected = createHmac("sha256", secret).update(encoded).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(suppliedSignature, "base64url");
  } catch {
    throw new ApiError(401, "invalid_token", "Delegation token is invalid");
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new ApiError(401, "invalid_token", "Delegation token is invalid");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new ApiError(401, "invalid_token", "Delegation token is invalid");
  }
  const record = payload as Record<string, unknown>;
  if (
    record.aud !== "magic-brain-api" ||
    typeof record.sub !== "string" ||
    !Array.isArray(record.scopes) ||
    !record.scopes.every((scope) => typeof scope === "string") ||
    typeof record.exp !== "number" ||
    record.exp <= Math.floor(Date.now() / 1000) ||
    record.exp > Math.floor(Date.now() / 1000) + 120
  ) {
    throw new ApiError(401, "invalid_token", "Delegation token is invalid");
  }
  return {
    ownerId: record.sub,
    keyId: `delegation:${String(record.jti ?? "unknown")}`,
    scopes: record.scopes as string[],
  };
}
