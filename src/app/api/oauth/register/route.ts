import { registerOAuthClient, validRedirectUri } from "@/lib/oauth";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_client_metadata" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "invalid_client_metadata" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const name = typeof input.client_name === "string" ? input.client_name.trim() : "";
  const redirectUris = Array.isArray(input.redirect_uris)
    ? input.redirect_uris.filter((uri): uri is string => typeof uri === "string")
    : [];
  if (
    name.length < 1 || name.length > 120 || redirectUris.length < 1 ||
    redirectUris.length > 10 || redirectUris.some((uri) => !validRedirectUri(uri))
  ) {
    return Response.json({ error: "invalid_client_metadata" }, { status: 400 });
  }
  const clientId = await registerOAuthClient(name, [...new Set(redirectUris)]);
  return Response.json({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: name,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
