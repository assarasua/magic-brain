import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  completeOAuthConsentRequest,
  consumeOAuthRateLimit,
  createOAuthConsentRequest,
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
    const consentRequest = await createOAuthConsentRequest(
      session.user.id,
      authorization,
    );
    return new NextResponse(consentHtml(authorization, consentRequest), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
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
    const requestToken = form.get("consent_request");
    if (typeof requestToken !== "string") {
      throw new ApiError(400, "invalid_request", "Consent request is required");
    }
    const decision = form.get("decision");
    if (decision !== "allow" && decision !== "deny") {
      throw new ApiError(400, "invalid_request", "Consent decision is required");
    }
    const completion = await completeOAuthConsentRequest({
      ownerId: session.user.id,
      requestToken,
      decision,
      requestId: request.headers.get("x-request-id"),
    });
    const consent = completion.consent;
    const redirect = new URL(consent.redirectUri);
    redirect.searchParams.set("state", consent.state);
    if (completion.decision === "deny") {
      redirect.searchParams.set("error", "access_denied");
      return NextResponse.redirect(redirect, 303);
    }
    redirect.searchParams.set("code", completion.code);
    return NextResponse.redirect(redirect, 303);
  } catch (error) {
    return oauthError(error);
  }
}

function consentHtml(
  authorization: Awaited<ReturnType<typeof validateAuthorizationRequest>>,
  consentRequest: string,
) {
  const scopes = authorization.scopes
    .map((scope) => `<li><code>${escapeHtml(scope)}</code></li>`)
    .join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Authorize Magic Brain</title><style>body{font:16px system-ui;max-width:42rem;margin:4rem auto;padding:1rem;color:#171717}main{border:1px solid #ddd;border-radius:16px;padding:2rem}button{padding:.7rem 1rem;margin-right:.5rem}code{font-size:.9em}</style><main><h1>Authorize ${escapeHtml(authorization.client.client_name)}</h1><p>This client requests the following Magic Brain permissions:</p><ul>${scopes}</ul><p>You can revoke access later. Magic Brain never sends your Google credentials to the client.</p><form method="post"><input type="hidden" name="consent_request" value="${escapeHtml(consentRequest)}"><button name="decision" value="allow" type="submit">Allow</button><button name="decision" value="deny" type="submit">Deny</button></form></main></html>`;
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
