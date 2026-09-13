import {
  consumeOAuthRateLimit,
  registerOAuthClient,
} from "@/lib/oauth";
import { ApiError } from "@/lib/public-api/core";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await consumeOAuthRateLimit(request, "register", 10);
    const body = (await request.json()) as Record<string, unknown>;
    if (
      !body ||
      Array.isArray(body) ||
      typeof body.client_name !== "string" ||
      !Array.isArray(body.redirect_uris) ||
      !body.redirect_uris.every((value) => typeof value === "string") ||
      (body.token_endpoint_auth_method !== undefined &&
        body.token_endpoint_auth_method !== "none")
    ) {
      throw new ApiError(
        400,
        "invalid_client_metadata",
        "Public clients require client_name, redirect_uris, and token_endpoint_auth_method none",
      );
    }
    const client = await registerOAuthClient({
      clientName: body.client_name,
      redirectUris: body.redirect_uris,
    });
    return Response.json(client, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return oauthError(error);
  }
}

function oauthError(error: unknown) {
  const value =
    error instanceof ApiError
      ? error
      : new ApiError(500, "server_error", "Registration failed");
  return Response.json(
    { error: value.code, error_description: value.message },
    { status: value.status, headers: { "Cache-Control": "no-store" } },
  );
}
