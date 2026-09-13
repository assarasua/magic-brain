import { consumeOAuthRateLimit, revokeOAuthToken } from "@/lib/oauth";
import { ApiError } from "@/lib/public-api/core";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await consumeOAuthRateLimit(request, "revoke", 30);
    const form = await request.formData();
    const token = form.get("token");
    const clientId = form.get("client_id");
    if (typeof token !== "string" || !token) {
      throw new ApiError(400, "invalid_request", "token is required");
    }
    await revokeOAuthToken(
      token,
      typeof clientId === "string" && clientId ? clientId : undefined,
    );
    return new Response(null, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const value =
      error instanceof ApiError
        ? error
        : new ApiError(500, "server_error", "Revocation failed");
    return Response.json(
      { error: value.code, error_description: value.message },
      { status: value.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
