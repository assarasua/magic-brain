import { createHash, randomBytes } from "node:crypto";
import { db, query } from "@/lib/db";

export const oauthScopes = [
  "portfolio:read",
  "portfolio:write",
  "watchlist:read",
  "watchlist:write",
] as const;

export type OAuthScope = (typeof oauthScopes)[number];
const scopeSet = new Set<string>(oauthScopes);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const secret = (prefix: string) => `${prefix}_${randomBytes(32).toString("base64url")}`;

export function parseScopes(value: string | null) {
  const scopes = [...new Set((value ?? "").split(/\s+/).filter(Boolean))];
  return scopes.length > 0 && scopes.every((scope) => scopeSet.has(scope))
    ? (scopes as OAuthScope[])
    : null;
}

export function validRedirectUri(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname));
  } catch {
    return false;
  }
}

export async function registerOAuthClient(name: string, redirectUris: string[]) {
  const result = await query<{ id: string }>(
    `insert into app_oauth_clients (name, redirect_uris)
     values ($1, $2) returning id::text`,
    [name, redirectUris],
  );
  return result.rows[0].id;
}

export async function getOAuthClient(clientId: string, redirectUri: string) {
  if (!uuidPattern.test(clientId)) return null;
  const result = await query<{ id: string; name: string }>(
    `select id::text, name from app_oauth_clients
     where id = $1 and $2 = any(redirect_uris)`,
    [clientId, redirectUri],
  );
  return result.rows[0] ?? null;
}

export async function issueAuthorizationCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  scopes: OAuthScope[];
  codeChallenge: string;
}) {
  const code = secret("mb_code");
  await query(
    `insert into app_oauth_authorization_codes
       (code_hash, client_id, user_id, redirect_uri, scopes, code_challenge, expires_at)
     values ($1, $2, $3, $4, $5, $6, now() + interval '10 minutes')`,
    [hash(code), input.clientId, input.userId, input.redirectUri, input.scopes, input.codeChallenge],
  );
  return code;
}

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function tokenResponse(accessToken: string, refreshToken: string, scopes: string[]) {
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refreshToken,
    scope: scopes.join(" "),
  };
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  if (!uuidPattern.test(input.clientId) || input.codeVerifier.length < 43 || input.codeVerifier.length > 128) return null;
  const client = await db.connect();
  try {
    await client.query("begin");
    const result = await client.query<{
      id: string; user_id: string; scopes: string[]; code_challenge: string;
    }>(
      `select id::text, user_id::text, scopes, code_challenge
       from app_oauth_authorization_codes
       where code_hash = $1 and client_id = $2 and redirect_uri = $3
         and consumed_at is null and expires_at > now()
       for update`,
      [hash(input.code), input.clientId, input.redirectUri],
    );
    const grant = result.rows[0];
    if (!grant || pkceChallenge(input.codeVerifier) !== grant.code_challenge) {
      await client.query("rollback");
      return null;
    }
    await client.query(
      `update app_oauth_authorization_codes set consumed_at = now() where id = $1`,
      [grant.id],
    );
    const accessToken = secret("mb_oauth");
    const refreshToken = secret("mb_refresh");
    await client.query(
      `insert into app_oauth_tokens
         (client_id, user_id, access_token_hash, refresh_token_hash, scopes,
          access_expires_at, refresh_expires_at)
       values ($1, $2, $3, $4, $5, now() + interval '1 hour', now() + interval '30 days')`,
      [input.clientId, grant.user_id, hash(accessToken), hash(refreshToken), grant.scopes],
    );
    await client.query("commit");
    return tokenResponse(accessToken, refreshToken, grant.scopes);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function refreshAccessToken(refreshToken: string, clientId: string) {
  if (!uuidPattern.test(clientId)) return null;
  const client = await db.connect();
  try {
    await client.query("begin");
    const result = await client.query<{ id: string; user_id: string; scopes: string[] }>(
      `select id::text, user_id::text, scopes from app_oauth_tokens
       where refresh_token_hash = $1 and client_id = $2 and revoked_at is null
         and refresh_expires_at > now() for update`,
      [hash(refreshToken), clientId],
    );
    const current = result.rows[0];
    if (!current) {
      await client.query("rollback");
      return null;
    }
    await client.query(`update app_oauth_tokens set revoked_at = now() where id = $1`, [current.id]);
    const nextAccess = secret("mb_oauth");
    const nextRefresh = secret("mb_refresh");
    await client.query(
      `insert into app_oauth_tokens
         (client_id, user_id, access_token_hash, refresh_token_hash, scopes,
          access_expires_at, refresh_expires_at)
       values ($1, $2, $3, $4, $5, now() + interval '1 hour', now() + interval '30 days')`,
      [clientId, current.user_id, hash(nextAccess), hash(nextRefresh), current.scopes],
    );
    await client.query("commit");
    return tokenResponse(nextAccess, nextRefresh, current.scopes);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function authorizeOAuthRequest(request: Request, requiredScopes: OAuthScope[]) {
  const value = request.headers.get("authorization");
  const token = value?.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
  if (!token) return null;
  const result = await query<{ user_id: string; client_id: string; scopes: string[]; expires_at: string }>(
    `select user_id::text, client_id::text, scopes, access_expires_at::text as expires_at
     from app_oauth_tokens where access_token_hash = $1 and revoked_at is null
       and access_expires_at > now()`,
    [hash(token)],
  );
  const grant = result.rows[0];
  if (!grant || requiredScopes.some((scope) => !grant.scopes.includes(scope))) return null;
  void query(`update app_oauth_tokens set last_used_at = now() where access_token_hash = $1`, [hash(token)]);
  return { userId: grant.user_id, clientId: grant.client_id, scopes: grant.scopes, expiresAt: grant.expires_at };
}
