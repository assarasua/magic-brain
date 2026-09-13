import { createHash } from "node:crypto";

export const OAUTH_SCOPES = [
  "public:read",
  "portfolio:read",
  "portfolio:write",
  "lists:read",
  "lists:write",
  "alerts:manage",
  "shares:manage",
  "profile:read",
] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export const ACCESS_TOKEN_SECONDS = 15 * 60;
export const REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;
export const AUTHORIZATION_CODE_SECONDS = 5 * 60;

export class OAuthInputError extends Error {}

export function validateRedirectUri(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OAuthInputError("redirect_uri is invalid");
  }
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (
    url.hash ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" && !(local && url.protocol === "http:"))
  ) {
    throw new OAuthInputError(
      "redirect_uri must use HTTPS or HTTP loopback and cannot contain credentials or a fragment",
    );
  }
  return url.toString();
}

export function parseScopes(value: string | null | undefined): OAuthScope[] {
  const requested = (value?.trim() || "public:read")
    .split(/\s+/)
    .filter(Boolean);
  if (
    requested.some(
      (scope) => !OAUTH_SCOPES.includes(scope as OAuthScope),
    )
  ) {
    throw new OAuthInputError("One or more scopes are unsupported");
  }
  return [...new Set(requested)] as OAuthScope[];
}

export function pkceChallenge(verifier: string) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
    throw new OAuthInputError("code_verifier is invalid");
  }
  return createHash("sha256").update(verifier).digest("base64url");
}
