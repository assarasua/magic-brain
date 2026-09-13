import { createHash } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { query } from "@/lib/db";
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
  prefix: string;
  scopes: string[];
  tier: string;
};

export type PublicApiAccess = {
  kind: "anonymous" | "key";
  tier: string;
  limit: number;
  remaining?: number;
  retryAfter?: number;
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
): Promise<PublicApiAccess> {
  const suppliedKey = apiKeyFrom(request);
  let keyRow: KeyRow | undefined;

  if (suppliedKey) {
    if (!/^mb_(?:live|test)_[A-Za-z0-9_-]{32,}$/.test(suppliedKey)) {
      throw new ApiError(401, "invalid_api_key", "The API key is invalid");
    }
    const hash = createHash("sha256").update(suppliedKey).digest("hex");
    const result = await query<KeyRow>(
      `
        select id::text, prefix, scopes, tier
        from app_api_keys
        where secret_hash = $1 and revoked_at is null
        limit 1
      `,
      [hash],
    );
    keyRow = result.rows[0];
    if (!keyRow || !keyRow.scopes.includes("data:read")) {
      throw new ApiError(401, "invalid_api_key", "The API key is invalid");
    }
  }

  const kind = keyRow ? "key" : "anonymous";
  const identifier = keyRow
    ? `api-key:${keyRow.id}`
    : `anonymous:${clientIp(request)}`;
  const rate = await consumeRateLimit(kind, identifier);
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
    tier: keyRow?.tier ?? "anonymous",
    limit: rate.limit,
    remaining: rate.remaining,
    retryAfter: rate.retryAfter,
  };
}
