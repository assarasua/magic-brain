import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  consumeOAuthRateLimit,
  createAuthorizationCode,
  recordOAuthAudit,
  validateAuthorizationRequest,
} from "@/lib/oauth";
import { ApiError } from "@/lib/public-api/core";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await consumeOAuthRateLimit(request, "authorize", 30);
    const authorization = await validateAuthorizationRequest(
      request.nextUrl.searchParams,
    );
    const session = await auth();
    if (!session?.user?.id) {
      const callback = `${request.nextUrl.pathname}${request.nextUrl.search}`;
      return NextResponse.redirect(
        new URL(`/login?callbackUrl=${encodeURIComponent(callback)}`, request.url),
      );
    }
    const csrf = randomBytes(24).toString("base64url");
    const response = new NextResponse(consentHtml(authorization, csrf), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
    response.cookies.set("mb_oauth_consent", csrf, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/oauth/authorize",
      maxAge: 300,
    });
    return response;
  } catch (error) {
    return oauthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await consumeOAuthRateLimit(request, "authorize", 30);
    const session = await auth();
    if (!session?.user?.id) {
      throw new ApiError(401, "login_required", "Sign in is required");
    }
    const form = await request.formData();
    const params = new URLSearchParams();
    for (const key of [
      "response_type",
      "client_id",
      "redirect_uri",
      "state",
      "scope",
      "code_challenge",
      "code_challenge_method",
      "resource",
    ]) {
      const value = form.get(key);
      if (typeof value === "string") params.set(key, value);
    }
    const authorization = await validateAuthorizationRequest(params);
    const cookieCsrf = request.cookies.get("mb_oauth_consent")?.value ?? "";
    const formCsrf = typeof form.get("csrf") === "string" ? String(form.get("csrf")) : "";
    if (!safeEqual(cookieCsrf, formCsrf)) {
      throw new ApiError(400, "invalid_request", "Consent request expired");
    }
    const redirect = new URL(authorization.redirectUri);
    redirect.searchParams.set("state", authorization.state);
    if (form.get("decision") !== "allow") {
      await recordOAuthAudit(
        "authorization_denied",
        session.user.id,
        authorization.client.client_id,
        authorization.scopes,
        request.headers.get("x-request-id"),
      );
      redirect.searchParams.set("error", "access_denied");
      return clearConsentCookie(NextResponse.redirect(redirect, 303));
    }
    const code = await createAuthorizationCode({
      ownerId: session.user.id,
      clientId: authorization.client.client_id,
      redirectUri: authorization.redirectUri,
      resource: authorization.resource,
      scopes: authorization.scopes,
      codeChallenge: authorization.challenge,
      requestId: request.headers.get("x-request-id"),
    });
    redirect.searchParams.set("code", code);
    return clearConsentCookie(NextResponse.redirect(redirect, 303));
  } catch (error) {
    return oauthError(error);
  }
}

function consentHtml(
  authorization: Awaited<ReturnType<typeof validateAuthorizationRequest>>,
  csrf: string,
) {
  const hidden = {
    response_type: authorization.responseType,
    client_id: authorization.client.client_id,
    redirect_uri: authorization.redirectUri,
    state: authorization.state,
    scope: authorization.scopes.join(" "),
    code_challenge: authorization.challenge,
    code_challenge_method: "S256",
    resource: authorization.resource,
    csrf,
  };
  const fields = Object.entries(hidden)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
    )
    .join("");
  const scopes = authorization.scopes
    .map((scope) => `<li><code>${escapeHtml(scope)}</code></li>`)
    .join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Authorize Magic Brain</title><style>body{font:16px system-ui;max-width:42rem;margin:4rem auto;padding:1rem;color:#171717}main{border:1px solid #ddd;border-radius:16px;padding:2rem}button{padding:.7rem 1rem;margin-right:.5rem}code{font-size:.9em}</style><main><h1>Authorize ${escapeHtml(authorization.client.client_name)}</h1><p>This client requests the following Magic Brain permissions:</p><ul>${scopes}</ul><p>You can revoke access later. Magic Brain never sends your Google credentials to the client.</p><form method="post">${fields}<button name="decision" value="allow" type="submit">Allow</button><button name="decision" value="deny" type="submit">Deny</button></form></main></html>`;
}

function clearConsentCookie(response: NextResponse) {
  response.cookies.set("mb_oauth_consent", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/oauth/authorize",
    maxAge: 0,
  });
  return response;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length > 0 &&
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

function oauthError(error: unknown) {
  const value =
    error instanceof ApiError
      ? error
      : new ApiError(500, "server_error", "Authorization failed");
  return NextResponse.json(
    { error: value.code, error_description: value.message },
    { status: value.status, headers: { "Cache-Control": "no-store" } },
  );
}
