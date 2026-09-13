import {
  consumeOAuthRateLimit,
  exchangeAuthorizationCode,
  oauthConfiguration,
  parseScopes,
  requireOAuthTokenClient,
  rotateRefreshToken,
} from "@/lib/oauth";
import { ApiError } from "@/lib/public-api/core";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await consumeOAuthRateLimit(request, "token", 30);
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/x-www-form-urlencoded")
    ) {
      throw new ApiError(
        400,
        "invalid_request",
        "Token requests must use application/x-www-form-urlencoded",
      );
    }
    const form = await request.formData();
    const grantType = value(form, "grant_type");
    const clientId = value(form, "client_id");
    const resource = value(form, "resource");
    const resources = oauthConfiguration();
    if (!clientId) {
      throw new ApiError(401, "invalid_client", "client_id is required");
    }
    await requireOAuthTokenClient(clientId);
    if (![resources.mcpResource, resources.apiResource].includes(resource)) {
      throw new ApiError(400, "invalid_target", "Invalid resource");
    }
    const tokens =
      grantType === "authorization_code"
        ? await exchangeAuthorizationCode({
            code: required(form, "code"),
            clientId,
            redirectUri: required(form, "redirect_uri"),
            resource,
            codeVerifier: required(form, "code_verifier"),
          })
        : grantType === "refresh_token"
          ? await rotateRefreshToken({
              refreshToken: required(form, "refresh_token"),
              clientId,
              resource,
              ...(value(form, "scope")
                ? { requestedScopes: parseScopes(value(form, "scope")) }
                : {}),
            })
          : (() => {
              throw new ApiError(
                400,
                "unsupported_grant_type",
                "Only authorization_code and refresh_token are supported",
              );
            })();
    return Response.json(tokens, {
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    });
  } catch (error) {
    const value =
      error instanceof ApiError
        ? error
        : new ApiError(500, "server_error", "Token request failed");
    return Response.json(
      { error: value.code, error_description: value.message },
      { status: value.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

function value(form: FormData, name: string) {
  const field = form.get(name);
  return typeof field === "string" ? field : "";
}

function required(form: FormData, name: string) {
  const field = value(form, name);
  if (!field) throw new ApiError(400, "invalid_request", `${name} is required`);
  return field;
}
