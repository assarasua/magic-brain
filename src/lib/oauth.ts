import { createHash, createHmac, randomBytes } from "node:crypto";
import { db, query } from "@/lib/db";
import {
  finalizeOAuthConsent,
  OAuthConsentLifecycleError,
  type OAuthConsentGrant,
} from "@/lib/oauth-consent-lifecycle";
import { ApiError } from "@/lib/public-api/core";
import {
  ACCESS_TOKEN_SECONDS,
  AUTHORIZATION_CODE_SECONDS,
  CONSENT_REQUEST_SECONDS,
  OAUTH_SCOPES,
  REFRESH_TOKEN_SECONDS,
  parseScopes as parseScopesValue,
  pkceChallenge as calculatePkceChallenge,
  validateRedirectUri as validateRedirectUriValue,
  type OAuthScope,
} from "@/lib/oauth-model";
export {
  ACCESS_TOKEN_SECONDS,
  AUTHORIZATION_CODE_SECONDS,
  CONSENT_REQUEST_SECONDS,
  OAUTH_SCOPES,
  REFRESH_TOKEN_SECONDS,
  type OAuthScope,
};
type OAuthClientRow = {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
};

export function oauthConfiguration() {
  const issuer = new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://magicbrain.es",
  );
  const resource = new URL(
    process.env.MAGIC_BRAIN_MCP_RESOURCE_URL ??
      "https://magic-brain-mcp.assarasua.workers.dev/mcp",
  );
  const apiResource = new URL(
    process.env.MAGIC_BRAIN_API_RESOURCE_URL ??
      `${issuer.origin}/api/v1`,
  );
  return {
    issuer: issuer.origin,
    mcpResource: resource.toString().replace(/\/$/, ""),
    apiResource: apiResource.toString().replace(/\/$/, ""),
  };
}

export function authorizationServerMetadata(requestOrigin?: string) {
  const issuer = requestOrigin
    ? new URL(requestOrigin).origin
    : oauthConfiguration().issuer;
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: OAUTH_SCOPES,
  };
}

export function protectedResourceMetadata() {
  const { issuer, mcpResource } = oauthConfiguration();
  return {
    resource: mcpResource,
    authorization_servers: [issuer],
    scopes_supported: OAUTH_SCOPES,
    bearer_methods_supported: ["header"],
    resource_documentation: `${issuer}/developers`,
  };
}

export function validateRedirectUri(value: string) {
  try {
    return validateRedirectUriValue(value);
  } catch {
    throw new ApiError(400, "invalid_redirect_uri", "redirect_uri is invalid");
  }
}

export function parseScopes(value: string | null | undefined): OAuthScope[] {
  try {
    return parseScopesValue(value);
  } catch {
    throw new ApiError(400, "invalid_scope", "One or more scopes are unsupported");
  }
}

export function pkceChallenge(verifier: string) {
  try {
    return calculatePkceChallenge(verifier);
  } catch {
    throw new ApiError(400, "invalid_grant", "code_verifier is invalid");
  }
}

export async function registerOAuthClient(input: {
  clientName: string;
  redirectUris: string[];
}) {
  if (
    input.clientName.length < 1 ||
    input.clientName.length > 100 ||
    input.redirectUris.length < 1 ||
    input.redirectUris.length > 5
  ) {
    throw new ApiError(400, "invalid_client_metadata", "Invalid client metadata");
  }
  const redirectUris = [...new Set(input.redirectUris.map(validateRedirectUri))];
  const clientId = `mbc_${randomBytes(24).toString("base64url")}`;
  await query(
    `insert into app_oauth_clients
      (client_id, client_name, redirect_uris, expires_at)
     values ($1, $2, $3::text[], null)`,
    [clientId, input.clientName, redirectUris],
  );
  await recordOAuthAudit("client_registered", null, clientId, [], null);
  return {
    client_id: clientId,
    client_name: input.clientName,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0,
  };
}

export async function validateAuthorizationRequest(params: URLSearchParams) {
  const responseType = params.get("response_type");
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const state = params.get("state") ?? "";
  const challenge = params.get("code_challenge") ?? "";
  const method = params.get("code_challenge_method");
  const resource = params.get("resource") ?? "";
  if (
    responseType !== "code" ||
    !clientId ||
    !redirectUri ||
    !state ||
    state.length > 512 ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(challenge) ||
    method !== "S256"
  ) {
    throw new ApiError(
      400,
      "invalid_request",
      "Authorization requires code, state, and S256 PKCE",
    );
  }
  const configured = oauthConfiguration();
  if (![configured.mcpResource, configured.apiResource].includes(resource)) {
    throw new ApiError(400, "invalid_target", "resource is not a supported Magic Brain resource");
  }
  const client = await getClient(clientId);
  const exactRedirect = validateRedirectUri(redirectUri);
  if (!client.redirect_uris.includes(exactRedirect)) {
    throw new ApiError(400, "invalid_redirect_uri", "redirect_uri is not registered");
  }
  return {
    responseType,
    client,
    redirectUri: exactRedirect,
    state,
    challenge,
    resource,
    scopes: parseScopes(params.get("scope")),
  };
}

export async function requireOAuthTokenClient(clientId: string) {
  return getClient(clientId, 401);
}

export async function hasDurableOAuthConsent(
  ownerId: string,
  authorization: Awaited<ReturnType<typeof validateAuthorizationRequest>>,
) {
  const result = await query(
    `select 1
     from app_oauth_consents
     where owner_id = $1
       and client_id = $2
       and resource = $3
       and revoked_at is null
       and $4::text[] <@ scopes`,
    [
      ownerId,
      authorization.client.client_id,
      authorization.resource,
      authorization.scopes,
    ],
  );
  return result.rowCount === 1;
}

export async function createAutoApprovedAuthorizationCode(
  ownerId: string,
  authorization: Awaited<ReturnType<typeof validateAuthorizationRequest>>,
  requestId: string | null,
) {
  const code = deterministicAuthorizationCode(
    `authorize:${ownerId}:${authorization.client.client_id}:${authorization.redirectUri}:${authorization.resource}:${authorization.state}:${authorization.challenge}:${authorization.scopes.join(" ")}`,
  );
  const inserted = await query(
    `insert into app_oauth_authorization_codes
      (code_hash, client_id, owner_id, redirect_uri, resource, scopes,
       code_challenge, expires_at)
     values ($1, $2, $3, $4, $5, $6::text[], $7,
       now() + ($8::text || ' seconds')::interval)
     on conflict (code_hash) do nothing
     returning code_hash`,
    [
      hash(code),
      authorization.client.client_id,
      ownerId,
      authorization.redirectUri,
      authorization.resource,
      authorization.scopes,
      authorization.challenge,
      AUTHORIZATION_CODE_SECONDS,
    ],
  );
  if (inserted.rowCount === 0) {
    const pending = await query(
      `select 1 from app_oauth_authorization_codes
       where code_hash = $1 and client_id = $2 and owner_id = $3
         and consumed_at is null and expires_at > now()`,
      [hash(code), authorization.client.client_id, ownerId],
    );
    if (pending.rowCount !== 1) {
      throw new ApiError(
        400,
        "invalid_request",
        "Authorization request was already completed",
      );
    }
  } else {
    await recordOAuthAudit(
      "authorization_auto_approved",
      ownerId,
      authorization.client.client_id,
      authorization.scopes,
      requestId,
    );
  }
  return code;
}

export async function createOAuthConsentRequest(
  ownerId: string,
  authorization: Awaited<ReturnType<typeof validateAuthorizationRequest>>,
) {
  const requestToken = `mbcr_${randomBytes(32).toString("base64url")}`;
  await query(
    `delete from app_oauth_consent_requests
     where owner_id = $1 and expires_at <= now()`,
    [ownerId],
  );
  await query(
    `insert into app_oauth_consent_requests
      (request_hash, owner_id, client_id, redirect_uri, resource, state,
       scopes, code_challenge, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7::text[], $8,
       now() + ($9::text || ' seconds')::interval)`,
    [
      hash(requestToken),
      ownerId,
      authorization.client.client_id,
      authorization.redirectUri,
      authorization.resource,
      authorization.state,
      authorization.scopes,
      authorization.challenge,
      CONSENT_REQUEST_SECONDS,
    ],
  );
  return requestToken;
}

export async function completeOAuthConsentRequest(input: {
  ownerId: string;
  requestToken: string;
  decision: "allow" | "deny";
  requestId: string | null;
}) {
  const { requestToken } = input;
  if (!/^mbcr_[A-Za-z0-9_-]{43}$/.test(requestToken)) {
    throw new ApiError(400, "invalid_request", "Consent request expired or already used");
  }
  const authorizationCode = deterministicAuthorizationCode(
    `consent:${requestToken}`,
  );
  const authorizationCodeHash = hash(authorizationCode);
  const client = await db.connect();
  try {
    return await finalizeOAuthConsent(
      {
        async transaction(operation) {
          await client.query("begin");
          try {
            const value = await operation({
              async consume(ownerId, token, decision, codeHash) {
                const result = await client.query<{
                  client_id: string;
                  redirect_uri: string;
                  resource: string;
                  state: string;
                  scopes: OAuthScope[];
                  code_challenge: string;
                }>(
                  `update app_oauth_consent_requests consent
                   set consumed_at = now(), decision = $3,
                     authorization_code_hash =
                       case when $3 = 'allow' then $4 else null end
                   from app_oauth_clients client
                   where consent.request_hash = $1
                     and consent.owner_id = $2
                     and consent.consumed_at is null
                     and consent.expires_at > now()
                     and client.client_id = consent.client_id
                     and client.revoked_at is null
                     and (client.expires_at is null or client.expires_at > now())
                   returning consent.client_id, consent.redirect_uri,
                     consent.resource, consent.state, consent.scopes,
                     consent.code_challenge`,
                  [hash(token), ownerId, decision, codeHash],
                );
                const consent = result.rows[0];
                return consent
                  ? {
                      clientId: consent.client_id,
                      redirectUri: consent.redirect_uri,
                      resource: consent.resource,
                      state: consent.state,
                      scopes: consent.scopes,
                      challenge: consent.code_challenge,
                    }
                  : null;
              },
              async recover(ownerId, token, decision, codeHash) {
                const result = await client.query<{
                  client_id: string;
                  redirect_uri: string;
                  resource: string;
                  state: string;
                  scopes: OAuthScope[];
                  code_challenge: string;
                }>(
                  `select consent.client_id, consent.redirect_uri,
                     consent.resource, consent.state, consent.scopes,
                     consent.code_challenge
                   from app_oauth_consent_requests consent
                   join app_oauth_clients oauth_client
                     on oauth_client.client_id = consent.client_id
                   where consent.request_hash = $1
                     and consent.owner_id = $2
                     and consent.consumed_at is not null
                     and consent.decision = $3
                     and consent.expires_at > now()
                     and oauth_client.revoked_at is null
                     and (oauth_client.expires_at is null or oauth_client.expires_at > now())
                     and (
                       ($3 = 'deny' and consent.authorization_code_hash is null)
                       or ($3 = 'allow'
                         and consent.authorization_code_hash = $4
                         and exists (
                           select 1 from app_oauth_authorization_codes code
                           where code.code_hash = $4
                             and code.client_id = consent.client_id
                             and code.owner_id = consent.owner_id
                             and code.consumed_at is null
                             and code.expires_at > now()
                         ))
                     )`,
                  [hash(token), ownerId, decision, codeHash],
                );
                const consent = result.rows[0];
                return consent
                  ? {
                      clientId: consent.client_id,
                      redirectUri: consent.redirect_uri,
                      resource: consent.resource,
                      state: consent.state,
                      scopes: consent.scopes,
                      challenge: consent.code_challenge,
                    }
                  : null;
              },
              async issueAuthorizationCode(ownerId, consent, code, requestId) {
                await client.query(
                  `insert into app_oauth_authorization_codes
                    (code_hash, client_id, owner_id, redirect_uri, resource,
                     scopes, code_challenge, expires_at)
                   values ($1, $2, $3, $4, $5, $6::text[], $7,
                     now() + ($8::text || ' seconds')::interval)`,
                  [
                    hash(code),
                    consent.clientId,
                    ownerId,
                    consent.redirectUri,
                    consent.resource,
                    consent.scopes,
                    consent.challenge,
                    AUTHORIZATION_CODE_SECONDS,
                  ],
                );
                await insertOAuthAudit(
                  client,
                  "authorization_granted",
                  ownerId,
                  consent,
                  requestId,
                );
                await client.query(
                  `insert into app_oauth_consents
                    (owner_id, client_id, resource, scopes)
                   values ($1, $2, $3, $4::text[])
                   on conflict (owner_id, client_id, resource) do update
                   set scopes = (
                         select array_agg(distinct scope order by scope)
                         from unnest(app_oauth_consents.scopes || excluded.scopes) scope
                       ),
                       updated_at = now(),
                       revoked_at = null`,
                  [ownerId, consent.clientId, consent.resource, consent.scopes],
                );
              },
              async recordDenial(ownerId, consent, requestId) {
                await insertOAuthAudit(
                  client,
                  "authorization_denied",
                  ownerId,
                  consent,
                  requestId,
                );
              },
            });
            await client.query("commit");
            return value;
          } catch (error) {
            await client.query("rollback");
            throw error;
          }
        },
      },
      { ...input, authorizationCode, authorizationCodeHash },
    );
  } catch (error) {
    if (error instanceof OAuthConsentLifecycleError) {
      throw new ApiError(
        400,
        "invalid_request",
        "Consent request expired or already used",
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

async function insertOAuthAudit(
  client: Awaited<ReturnType<typeof db.connect>>,
  eventType: "authorization_granted" | "authorization_denied",
  ownerId: string,
  consent: OAuthConsentGrant,
  requestId: string | null,
) {
  await client.query(
    `insert into app_oauth_audit_events
      (owner_id, client_id, event_type, scopes, request_id)
     values ($1, $2, $3, $4::text[], $5)`,
    [ownerId, consent.clientId, eventType, consent.scopes, requestId],
  );
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  codeVerifier: string;
}) {
  const challenge = pkceChallenge(input.codeVerifier);
  const accessToken = `mba_${randomBytes(32).toString("base64url")}`;
  const refreshToken = `mbr_${randomBytes(32).toString("base64url")}`;
  const client = await db.connect();
  try {
    await client.query("begin");
    const result = await client.query<{
      owner_id: string;
      scopes: string[];
    }>(
      `update app_oauth_authorization_codes
       set consumed_at = now()
       where code_hash = $1
         and client_id = $2
         and redirect_uri = $3
         and resource = $4
         and code_challenge = $5
         and consumed_at is null
         and expires_at > now()
         and exists (
           select 1 from app_oauth_clients oauth_client
           where oauth_client.client_id = app_oauth_authorization_codes.client_id
             and oauth_client.revoked_at is null
             and (oauth_client.expires_at is null or oauth_client.expires_at > now())
         )
       returning owner_id::text, scopes`,
      [
        hash(input.code),
        input.clientId,
        validateRedirectUri(input.redirectUri),
        input.resource,
        challenge,
      ],
    );
    const grant = result.rows[0];
    if (!grant) {
      throw new ApiError(
        400,
        "invalid_grant",
        "Authorization code is invalid or expired",
      );
    }
    await client.query(
      `insert into app_oauth_grants (
         client_id, owner_id, resource, scopes, access_token_hash,
         access_expires_at, refresh_token_hash, refresh_expires_at, family_id
       ) values (
         $1, $2, $3, $4::text[], $5,
         now() + ($6::text || ' seconds')::interval,
         $7, now() + ($8::text || ' seconds')::interval, gen_random_uuid()
       )`,
      [
        input.clientId,
        grant.owner_id,
        input.resource,
        grant.scopes,
        hash(accessToken),
        ACCESS_TOKEN_SECONDS,
        hash(refreshToken),
        REFRESH_TOKEN_SECONDS,
      ],
    );
    await client.query(
      `insert into app_oauth_audit_events
        (owner_id, client_id, event_type, scopes)
       values ($1, $2, 'code_exchanged', $3::text[])`,
      [grant.owner_id, input.clientId, grant.scopes],
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

export async function rotateRefreshToken(input: {
  refreshToken: string;
  clientId: string;
  resource: string;
  requestedScopes?: OAuthScope[];
}) {
  const accessToken = `mba_${randomBytes(32).toString("base64url")}`;
  const refreshToken = `mbr_${randomBytes(32).toString("base64url")}`;
  const result = await query<{ owner_id: string; scopes: string[] }>(
    `with previous as (
       update app_oauth_grants
       set revoked_at = now(), rotated_at = now()
       where refresh_token_hash = $1
         and client_id = $2
         and resource = $3
         and revoked_at is null
         and refresh_expires_at > now()
         and ($4::text[] is null or $4::text[] <@ scopes)
         and exists (
           select 1 from app_oauth_clients client
           where client.client_id = app_oauth_grants.client_id
             and client.revoked_at is null
             and (client.expires_at is null or client.expires_at > now())
         )
       returning owner_id, scopes, family_id
     ), inserted as (
       insert into app_oauth_grants (
         client_id, owner_id, resource, scopes, access_token_hash,
         access_expires_at, refresh_token_hash, refresh_expires_at, family_id
       )
       select $2, owner_id, $3,
         case when $4::text[] is null then scopes else $4::text[] end,
         $5, now() + ($6::text || ' seconds')::interval,
         $7, now() + ($8::text || ' seconds')::interval, family_id
       from previous
       returning owner_id::text, scopes
     )
     select * from inserted`,
    [
      hash(input.refreshToken),
      input.clientId,
      input.resource,
      input.requestedScopes ?? null,
      hash(accessToken),
      ACCESS_TOKEN_SECONDS,
      hash(refreshToken),
      REFRESH_TOKEN_SECONDS,
    ],
  );
  const row = result.rows[0];
  if (!row) {
    const reused = await query<{
      owner_id: string;
      scopes: string[];
    }>(
      `update app_oauth_grants
       set revoked_at = coalesce(revoked_at, now())
       where family_id = (
         select family_id from app_oauth_grants
         where refresh_token_hash = $1
           and client_id = $2
           and resource = $3
           and rotated_at is not null
         limit 1
       )
         and revoked_at is null
       returning owner_id::text, scopes`,
      [hash(input.refreshToken), input.clientId, input.resource],
    );
    if (reused.rows[0]) {
      await recordOAuthAudit(
        "refresh_reuse_detected",
        reused.rows[0].owner_id,
        input.clientId,
        reused.rows[0].scopes as OAuthScope[],
        null,
      );
    }
    throw new ApiError(400, "invalid_grant", "Refresh token is invalid or expired");
  }
  await recordOAuthAudit(
    "token_refreshed",
    row.owner_id,
    input.clientId,
    row.scopes as OAuthScope[],
    null,
  );
  return tokenResponse(accessToken, refreshToken, row.scopes);
}

export async function verifyOAuthAccessToken(token: string) {
  const result = await query<{
    owner_id: string;
    client_id: string;
    resource: string;
    scopes: string[];
    expires_at: number;
  }>(
    `select owner_id::text, client_id, resource, scopes,
       extract(epoch from access_expires_at)::bigint as expires_at
     from app_oauth_grants
     where access_token_hash = $1
       and revoked_at is null
       and access_expires_at > now()
     limit 1`,
    [hash(token)],
  );
  return result.rows[0] ?? null;
}

export async function revokeOAuthToken(token: string, clientId?: string) {
  const result = await query<{ owner_id: string; client_id: string; scopes: string[] }>(
    `update app_oauth_grants
     set revoked_at = now()
     where (access_token_hash = $1 or refresh_token_hash = $1)
       and revoked_at is null
       and ($2::text is null or client_id = $2)
     returning owner_id::text, client_id, scopes`,
    [hash(token), clientId ?? null],
  );
  const row = result.rows[0];
  if (row) {
    await query(
      `update app_oauth_consents
       set revoked_at = now(), updated_at = now()
       where owner_id = $1 and client_id = $2 and revoked_at is null`,
      [row.owner_id, row.client_id],
    );
    await recordOAuthAudit(
      "token_revoked",
      row.owner_id,
      row.client_id,
      row.scopes as OAuthScope[],
      null,
    );
    await recordOAuthAudit(
      "consent_revoked",
      row.owner_id,
      row.client_id,
      row.scopes as OAuthScope[],
      null,
    );
  }
}

export async function consumeOAuthRateLimit(
  request: Request,
  category: string,
  maximum: number,
) {
  const address =
    request.headers.get("cf-connecting-ip") ??
    (process.env.NODE_ENV !== "production"
      ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      : null) ??
    "unknown";
  const key = hash(`${category}:${address}`);
  const result = await query<{ request_count: number }>(
    `insert into app_oauth_rate_limits (key_hash, bucket, request_count)
     values ($1, date_trunc('minute', now()), 1)
     on conflict (key_hash, bucket) do update
       set request_count = app_oauth_rate_limits.request_count + 1
     returning request_count`,
    [key],
  );
  if ((result.rows[0]?.request_count ?? maximum + 1) > maximum) {
    throw new ApiError(429, "rate_limit_exceeded", "Too many OAuth requests");
  }
}

function tokenResponse(
  accessToken: string,
  refreshToken: string,
  scopes: string[],
) {
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_SECONDS,
    refresh_token: refreshToken,
    scope: scopes.join(" "),
  };
}

async function getClient(clientId: string, invalidStatus = 400) {
  const result = await query<OAuthClientRow>(
    `select client_id, client_name, redirect_uris
     from app_oauth_clients
     where client_id = $1 and revoked_at is null
       and (expires_at is null or expires_at > now())`,
    [clientId],
  );
  if (!result.rows[0]) {
    throw new ApiError(invalidStatus, "invalid_client", "Unknown OAuth client");
  }
  return result.rows[0];
}

export async function recordOAuthAudit(
  eventType: string,
  ownerId: string | null,
  clientId: string | null,
  scopes: readonly string[],
  requestId: string | null,
) {
  await query(
    `insert into app_oauth_audit_events
      (owner_id, client_id, event_type, scopes, request_id)
     values ($1, $2, $3, $4::text[], $5)`,
    [ownerId, clientId, eventType, scopes, requestId],
  ).catch(() => undefined);
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function deterministicAuthorizationCode(context: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for OAuth codes");
  return `mbc_${createHmac("sha256", secret).update(context).digest("base64url")}`;
}
