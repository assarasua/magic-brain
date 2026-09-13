import { createHmac, randomBytes } from "node:crypto";
import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import type { MagicBrainMcpConfig } from "./config.js";

type Introspection = {
  active?: boolean;
  client_id?: string;
  sub?: string;
  scope?: string;
  exp?: number;
  aud?: string;
};

export class MagicBrainTokenVerifier implements OAuthTokenVerifier {
  constructor(
    private readonly config: MagicBrainMcpConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    if (
      !this.config.oauthIntrospectionClientId ||
      !this.config.oauthIntrospectionSecret
    ) {
      throw new OAuthError(
        OAuthErrorCode.InvalidToken,
        "Interactive authentication is not configured",
      );
    }
    let response: Response;
    try {
      response = await this.fetchImpl(this.config.oauthIntrospectionUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${this.config.oauthIntrospectionClientId}:${this.config.oauthIntrospectionSecret}`,
          ).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ token }),
        signal: AbortSignal.timeout(this.config.apiTimeoutMs),
      });
    } catch {
      throw new OAuthError(
        OAuthErrorCode.ServerError,
        "Token verification is temporarily unavailable",
      );
    }
    const value = (await response.json().catch(() => null)) as Introspection | null;
    if (
      !response.ok ||
      !value?.active ||
      !value.client_id ||
      !value.sub ||
      typeof value.exp !== "number" ||
      value.aud !== this.config.oauthResourceUrl.toString()
    ) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, "Token is invalid or expired");
    }
    return {
      token,
      clientId: value.client_id,
      scopes: value.scope?.split(/\s+/).filter(Boolean) ?? [],
      expiresAt: value.exp,
      resource: this.config.oauthResourceUrl,
      extra: { subject: value.sub },
    };
  }
}

export function createDelegation(
  authInfo: AuthInfo,
  secret: string | undefined,
) {
  const subject = authInfo.extra?.subject;
  if (typeof subject !== "string" || !secret) {
    throw new Error("Authenticated account delegation is not configured");
  }
  const payload = Buffer.from(
    JSON.stringify({
      sub: subject,
      scopes: authInfo.scopes,
      aud: "magic-brain-api",
      exp: Math.floor(Date.now() / 1000) + 60,
      jti: randomBytes(12).toString("base64url"),
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}
