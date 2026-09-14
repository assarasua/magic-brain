import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  completeOAuthConsentRequest,
  consumeOAuthRateLimit,
  createAutoApprovedAuthorizationCode,
  createOAuthConsentRequest,
  hasDurableOAuthConsent,
  validateAuthorizationRequest,
} from "@/lib/oauth";
import { ApiError } from "@/lib/public-api/core";
import {
  consentContentSecurityPolicy,
  renderOAuthConsentErrorPage,
  renderOAuthConsentPage,
} from "@/lib/oauth-consent-page";

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
    if (await hasDurableOAuthConsent(session.user.id, authorization)) {
      const code = await createAutoApprovedAuthorizationCode(
        session.user.id,
        authorization,
        request.headers.get("x-request-id"),
      );
      const redirect = new URL(authorization.redirectUri);
      redirect.searchParams.set("state", authorization.state);
      redirect.searchParams.set("code", code);
      return NextResponse.redirect(redirect, 303);
    }
    const consentRequest = await createOAuthConsentRequest(
      session.user.id,
      authorization,
    );
    const nonce = randomBytes(18).toString("base64url");
    return new NextResponse(
      renderOAuthConsentPage({
        clientName: authorization.client.client_name,
        scopes: authorization.scopes,
        requestToken: consentRequest,
        nonce,
      }),
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy": consentContentSecurityPolicy(
            nonce,
            undefined,
            authorization.redirectUri,
          ),
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    return oauthError(error, request);
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
    const decision = form.get("decision") || form.get("decision_button");
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
    return oauthError(error, request, true);
  }
}

function oauthError(error: unknown, request: NextRequest, consentPost = false) {
  const value =
    error instanceof ApiError
      ? error
      : new ApiError(500, "server_error", "Authorization failed");
  if (
    consentPost &&
    request.headers.get("accept")?.includes("text/html") &&
    (value.code === "invalid_request" || value.code === "login_required")
  ) {
    return new NextResponse(renderOAuthConsentErrorPage(value.message), {
      status: value.status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": consentContentSecurityPolicy(),
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return NextResponse.json(
    { error: value.code, error_description: value.message },
    { status: value.status, headers: { "Cache-Control": "no-store" } },
  );
}
